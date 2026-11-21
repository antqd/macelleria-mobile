import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { Prisma, PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { z, ZodError } from 'zod';
import { activePrice, activePromotion, InputError, quote, quoteSchema } from './storefront.js';
import { applyStripeEvent, registerOrders } from './orders.js';
import { registerAdmin } from './admin.js';
import { startPushWorker } from './push.js';

const db = new PrismaClient();
const secret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (secret && (!/^(sk|rk)_test_/.test(secret) || !webhookSecret?.startsWith('whsec_'))) {
  throw new Error('Configura una chiave Stripe di test e il segreto webhook corrispondente.');
}
if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_ORIGIN?.startsWith('https://')) {
  throw new Error('ADMIN_ORIGIN deve usare HTTPS.');
}
const stripe = secret ? new Stripe(secret, { maxNetworkRetries: 2, timeout: 10000 }) : null;
const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  disableRequestLogging: true,
  bodyLimit: 65536,
});
await app.register(cors, { origin: process.env.CORS_ORIGIN?.split(',').map(origin => origin.trim()) ?? false });
await app.register(rateLimit, { max: 240, timeWindow: '1 minute' });

app.setErrorHandler((error, request, reply) => {
  if (error instanceof InputError) return reply.code(error.status).send({ error: error.message, details: error.details });
  if (error instanceof ZodError) return reply.code(400).send({ error: 'Controlla i dati inseriti.', fields: error.issues.map(issue => issue.path.join('.')) });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') return reply.code(404).send({ error: 'Elemento non trovato.' });
    if (error.code === 'P2002') return reply.code(409).send({ error: 'Esiste già un elemento con questi dati.' });
    if (error.code === 'P2003') return reply.code(400).send({ error: 'Verifica l’elemento associato.' });
  }
  const status = (error as { statusCode?: number }).statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return reply.code(status).send({ error: status === 429 ? 'Troppi tentativi. Riprova tra poco.' : 'Richiesta non valida.' });
  }
  request.log.error({ route: request.routeOptions.url, errorType: error instanceof Error ? error.name : 'Unknown', requestId: request.id }, 'Errore API');
  return reply.code(500).send({ error: 'Il servizio non è disponibile. Riprova tra poco.' });
});

app.get('/health', async () => {
  await db.$queryRaw`SELECT 1`;
  return { ok: true, ...(process.env.NODE_ENV === 'test' && process.env.ALLOW_INTEGRATION_FIXTURES === '1' ? { integrationFixtures: true } : {}) };
});
app.get('/catalog', async (_request, reply) => {
  const [categories, products, settings] = await Promise.all([
    db.category.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    db.product.findMany({
      where: { archived: false, category: { active: true } },
      include: { promotions: { where: activePromotion(new Date()), orderBy: { pricePerKgCents: 'asc' }, take: 1 } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    db.businessSettings.findUnique({ where: { id: 'business' } }),
  ]);
  reply.header('Cache-Control', 'no-store');
  return {
    categories,
    products: products.map(({ promotions, ...product }) => ({
      ...product, regularPricePerKgCents: product.pricePerKgCents, pricePerKgCents: activePrice({ ...product, promotions }),
    })),
    settings, paymentsEnabled: Boolean(stripe),
  };
});

app.get('/images/:id', async (request, reply) => {
  const { id } = z.object({ id: z.string().regex(/^[a-z0-9]{1,64}$/) }).parse(request.params);
  const image = await db.catalogImage.findUnique({ where: { id } });
  if (!image) throw new InputError('Immagine non trovata.', 404);
  return reply.type('image/webp').header('X-Content-Type-Options', 'nosniff')
    .header('Cache-Control', 'public, max-age=31536000, immutable').send(Buffer.from(image.bytes));
});

app.post('/quote', async request => quote(db, quoteSchema.parse(request.body)));
await app.register(async scope => registerOrders(scope, db, stripe));
await app.register(async scope => registerAdmin(scope, db, stripe));

await app.register(async scope => {
  scope.removeContentTypeParser('application/json');
  scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  scope.post('/webhooks/stripe', {
    bodyLimit: 256 * 1024,
    config: { rateLimit: false },
  }, async request => {
    if (!stripe || !webhookSecret) throw new InputError('Webhook non configurato.', 503);
    const signature = request.headers['stripe-signature'];
    if (typeof signature !== 'string' || !Buffer.isBuffer(request.body)) throw new InputError('Firma mancante.');
    let event;
    try {
      event = stripe.webhooks.constructEvent(request.body, signature, webhookSecret);
    } catch {
      throw new InputError('Firma webhook non valida.');
    }
    if (event.livemode) throw new InputError('Evento fuori dall’ambiente di test.');
    await applyStripeEvent(db, event);
    return { received: true };
  });
});

if (process.env.EXPO_ACCESS_TOKEN) {
  const stop = startPushWorker(db, app.log, process.env.EXPO_ACCESS_TOKEN);
  app.addHook('onClose', async () => stop());
}
app.addHook('onClose', async () => db.$disconnect());
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close().catch(() => { process.exitCode = 1; }); });
}
await app.listen({ port: Number(process.env.PORT ?? 3001), host: process.env.HOST ?? '127.0.0.1' });
