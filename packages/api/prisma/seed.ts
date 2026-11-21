import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

const db = new PrismaClient();
try {
  const demo = process.env.SEED_DEMO === '1';
  if (demo && process.env.NODE_ENV === 'production') throw new Error('Il catalogo dimostrativo va usato solo in sviluppo.');
  const categories = new Map<string, string>();
  for (const category of [
    { slug: 'preparati', name: 'Preparati del giorno', description: 'Idee pronte da cucinare', sortOrder: 0 },
    { slug: 'tagli', name: 'Tagli tradizionali', description: 'I grandi classici della macelleria', sortOrder: 1 },
    { slug: 'offerte', name: 'Offerte del giorno', description: 'Le offerte attive oggi', sortOrder: 2 },
  ]) {
    const record = await db.category.upsert({ where: { slug: category.slug }, create: category, update: {} });
    categories.set(record.slug, record.id);
  }
  await db.businessSettings.upsert({ where: { id: 'business' }, create: { id: 'business' }, update: {} });

  if (demo) {
    const entries = [
      { id: 'demoinvoltini', image: 'involtini', category: 'preparati', name: 'Involtini di vitello', pricePerKgCents: 1800 },
      { id: 'demohamburger', image: 'hamburger', category: 'preparati', name: 'Hamburger di manzo', pricePerKgCents: 1600 },
      { id: 'demopolpette', image: 'polpette', category: 'preparati', name: 'Polpette della casa', pricePerKgCents: 1500 },
      { id: 'demospiedini', image: 'spiedini', category: 'preparati', name: 'Spiedini misti', pricePerKgCents: 1800 },
      { id: 'demobistecca', image: 'hero', category: 'tagli', name: 'Bistecca di manzo', pricePerKgCents: 2400 },
    ];
    for (const { id, image, category, name, pricePerKgCents } of entries) {
      const input = await readFile(new URL(`../../../assets/${image}.jpg`, import.meta.url));
      const bytes = await sharp(input).rotate().resize(1000, 1000, { fit: 'inside', withoutEnlargement: true }).webp().toBuffer();
      await db.catalogImage.upsert({ where: { id }, update: {}, create: { id, bytes: Uint8Array.from(bytes) } });
      await db.product.upsert({
        where: { id },
        create: {
          id, categoryId: categories.get(category)!, name: `[DEMO] ${name}`, pricePerKgCents,
          description: 'Prodotto dimostrativo per sviluppo e collaudo.', imageUrl: `/images/${id}`,
        },
        update: {},
      });
    }
    await db.promotion.upsert({
      where: { id: 'demoofferta' }, update: {},
      create: {
        id: 'demoofferta', productId: 'demohamburger', pricePerKgCents: 1400,
        startsAt: new Date(), endsAt: new Date(Date.now() + 7 * 86400000),
      },
    });
  }
  console.log(demo ? 'Struttura iniziale e catalogo DEMO inseriti.' : 'Categorie e impostazioni di base inserite.');
} finally {
  await db.$disconnect();
}
