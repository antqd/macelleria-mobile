import { OrderStatus, Prisma, type PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import type Stripe from 'stripe';
import { z } from 'zod';
import { registerAuth } from './admin-auth.js';
import { nextStatuses } from './order-status.js';
import { finishRefund, queueStatus } from './orders.js';
import { activePromotion, InputError } from './storefront.js';

const idSchema = z.object({ id: z.string().min(1).max(64) });
const cents = z.number().int().min(0).max(10000000);
const label = z.string().trim().min(1).max(120);
const note = z.string().trim().max(1000);
const imageUrl = z.string().regex(/^\/images\/[a-z0-9]+$/).nullable();
const categorySchema = z.object({
  slug: z.string().max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: label, description: note, imageUrl, active: z.boolean(), sortOrder: z.number().int().min(0).max(10000),
});
const productSchema = z.object({
  categoryId: z.string().min(1).max(64), name: label, description: note, imageUrl,
  pricePerKgCents: cents.min(1), maxGrams: z.number().int().min(500).max(100000).multipleOf(500),
  available: z.boolean(), archived: z.boolean(), sortOrder: z.number().int().min(0).max(10000),
});
const promotionInput = z.object({
  productId: z.string().min(1).max(64), pricePerKgCents: cents.min(1), active: z.boolean(),
  startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }),
});
const zoneSchema = z.object({ postalCode: z.string().regex(/^\d{5}$/), city: label.max(100), feeCents: cents, minOrderCents: cents, active: z.boolean() });
const legalUrl = z.string().trim().url().max(500).refine(value => value.startsWith('https://')).nullable();
const settingsSchema = z.object({
  name: label, address: note.nullable(), phone: z.string().trim().max(25).nullable(), openingHours: note.nullable(),
  pickupNotes: note.nullable(), deliveryHours: note.nullable(), privacyPolicyUrl: legalUrl, termsUrl: legalUrl, deliveryEnabled: z.boolean(),
});
const romeDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
const publicOrderStatuses = Object.values(OrderStatus).filter(status => status !== 'PENDING_PAYMENT');
const dayMs = 24 * 60 * 60 * 1000;

export async function registerAdmin(app: FastifyInstance, db: PrismaClient, stripe: Stripe | null) {
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  const requireAdmin = registerAuth(app, db);
  const audit = (tx: Prisma.TransactionClient, adminId: string, action: string, targetId: string) =>
    tx.auditLog.create({ data: { adminId, action, targetId } });
  const listingOrder = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

  app.get('/admin/dashboard', async request => {
    await requireAdmin(request);
    const now = new Date();
    const days = Array.from({ length: 7 }, (_, i) => romeDate.format(new Date(now.getTime() - (6 - i) * dayMs)));
    const [recent, activity, preparing, activeProducts, offers, failedPayments] = await Promise.all([
      db.order.findMany({ where: { status: { in: publicOrderStatuses } }, orderBy: { createdAt: 'desc' }, take: 8 }),
      db.order.findMany({
        where: { OR: [{ paidAt: { gte: new Date(now.getTime() - 8 * dayMs) } }, { refundedAt: { gte: new Date(now.getTime() - 8 * dayMs) } }] },
        select: { paidAt: true, refundedAt: true, totalCents: true },
      }),
      db.order.count({ where: { status: { in: ['RECEIVED', 'PREPARING'] }, cancellationRequested: false } }),
      db.product.count({ where: { archived: false, available: true, category: { active: true } } }),
      db.promotion.findMany({ where: { ...activePromotion(now), product: { archived: false, available: true, category: { active: true } } }, include: { product: { select: { pricePerKgCents: true } } } }),
      db.order.count({ where: { status: 'PENDING_PAYMENT', paymentStatus: 'FAILED', updatedAt: { gte: new Date(now.getTime() - dayMs) } } }),
    ]);
    const today = days[6];
    const paidToday = activity.filter(row => row.paidAt && romeDate.format(row.paidAt) === today);
    const refundedToday = activity.filter(row => row.refundedAt && romeDate.format(row.refundedAt) === today);
    return {
      todayOrders: paidToday.length, preparing, activeProducts, failedPayments,
      offers: offers.filter(offer => offer.pricePerKgCents < offer.product.pricePerKgCents).length,
      revenueCents: paidToday.reduce((sum, row) => sum + row.totalCents, 0) - refundedToday.reduce((sum, row) => sum + row.totalCents, 0),
      days: days.map(date => ({ date, count: activity.filter(row => row.paidAt && romeDate.format(row.paidAt) === date).length })),
      recent: recent.map(({ id, number, status, fulfillment, totalCents, createdAt }) => ({ id, number, status, fulfillment, totalCents, createdAt })),
    };
  });

  app.get('/admin/orders', async request => {
    await requireAdmin(request);
    const params = z.object({
      search: z.string().trim().max(100).optional(),
      status: z.nativeEnum(OrderStatus).optional(),
      payment: z.literal('FAILED').optional(),
      page: z.coerce.number().int().min(1).max(10000).default(1),
    }).parse(request.query);
    const number = Number(params.search);
    const where: Prisma.OrderWhereInput = {
      status: params.status ?? (params.payment ? 'PENDING_PAYMENT' : { in: publicOrderStatuses }),
      ...(params.payment ? { paymentStatus: params.payment } : {}),
      ...(params.search ? { OR: [
        ...(Number.isInteger(number) && number > 0 && number <= 2147483647 ? [{ number }] : []),
        { customerName: { contains: params.search, mode: 'insensitive' } }, { phone: { contains: params.search } },
      ] } : {}),
    };
    const [orders, count] = await Promise.all([
      db.order.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (params.page - 1) * 25, take: 25,
        select: { id: true, number: true, customerName: true, phone: true, fulfillment: true, status: true, totalCents: true, createdAt: true,
          items: { select: { name: true, grams: true } } } }),
      db.order.count({ where }),
    ]);
    return { orders, count };
  });

  app.get('/admin/orders/:id', async request => {
    await requireAdmin(request);
    const { id } = idSchema.parse(request.params);
    const row = await db.order.findUnique({ where: { id }, select: {
      id: true, number: true, status: true, paymentStatus: true, cancellationRequested: true, fulfillment: true, items: true,
      customerName: true, phone: true, createdAt: true, totalCents: true, subtotalCents: true, deliveryFeeCents: true,
      deliveryAddress: true, pickupSnapshot: true,
    } });
    if (!row) throw new InputError('Ordine non trovato.', 404);
    return { ...row, next: nextStatuses(row.status, row.fulfillment) };
  });

  app.patch('/admin/orders/:id', async request => {
    const admin = await requireAdmin(request);
    const { id } = idSchema.parse(request.params);
    const { status } = z.object({ status: z.nativeEnum(OrderStatus) }).parse(request.body);
    return db.$transaction(async tx => {
      const row = await tx.order.findUnique({ where: { id } });
      if (!row || !nextStatuses(row.status, row.fulfillment).includes(status)) throw new InputError('Cambio di stato non consentito.', 409);
      const changed = await tx.order.updateMany({ where: { id, status: row.status, paymentStatus: 'PAID', cancellationRequested: false }, data: { status } });
      if (!changed.count) throw new InputError('L’ordine è cambiato. Aggiorna la pagina.', 409);
      await audit(tx, admin, `order.${status}`, id);
      await queueStatus(tx, id, status);
      return { ok: true };
    });
  });

  app.post('/admin/orders/:id/cancel', async request => {
    const admin = await requireAdmin(request);
    const { id } = idSchema.parse(request.params);
    if (!stripe) throw new InputError('Stripe non configurato.', 503);
    const row = await db.$transaction(async tx => {
      const order = await tx.order.findUnique({ where: { id } });
      if (!order || !order.stripePaymentId || order.paymentStatus !== 'PAID' || ['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(order.status)) {
        throw new InputError('L’ordine non può essere annullato da questa schermata.', 409);
      }
      const changed = await tx.order.updateMany({ where: { id, status: order.status, paymentStatus: 'PAID', cancellationRequested: false }, data: { cancellationRequested: true } });
      if (changed.count) await audit(tx, admin, 'order.cancel_requested', id);
      else if (!order.cancellationRequested) throw new InputError('L’ordine è cambiato. Aggiorna la pagina.', 409);
      return order;
    });
    const refund = row.stripeRefundId
      ? await stripe.refunds.retrieve(row.stripeRefundId)
      : await stripe.refunds.create({
          payment_intent: row.stripePaymentId!, amount: row.totalCents, metadata: { orderId: id },
        }, { idempotencyKey: `refund:${id}` });
    await db.$transaction(async tx => {
      if (refund.status === 'succeeded') await finishRefund(tx, id, refund.id);
      else await tx.order.updateMany({ where: { id, cancellationRequested: true }, data: { stripeRefundId: refund.id } });
    });
    return { pending: refund.status !== 'succeeded', refundStatus: refund.status };
  });

  app.get('/admin/catalog', async request => {
    await requireAdmin(request);
    const [categories, products, promotions] = await Promise.all([
      db.category.findMany({ orderBy: listingOrder }),
      db.product.findMany({ orderBy: listingOrder }),
      db.promotion.findMany({ orderBy: { endsAt: 'desc' } }),
    ]);
    return { categories, products, promotions };
  });

  for (const entity of ['categories', 'products', 'promotions'] as const) {
    app.put(`/admin/${entity}`, async request => {
      const admin = await requireAdmin(request);
      const { id, data } = z.object({ id: z.string().max(64).optional(), data: z.unknown() }).parse(request.body);
      return db.$transaction(async tx => {
        let record;
        if (entity === 'categories') {
          const input = categorySchema.parse(data);
          record = id ? await tx.category.update({ where: { id }, data: input }) : await tx.category.create({ data: input });
        } else if (entity === 'products') {
          const input = productSchema.parse(data);
          record = id ? await tx.product.update({ where: { id }, data: input }) : await tx.product.create({ data: input });
        } else {
          const input = promotionInput.parse(data);
          const startsAt = new Date(input.startsAt);
          const endsAt = new Date(input.endsAt);
          const product = await tx.product.findUnique({ where: { id: input.productId } });
          if (startsAt >= endsAt || !product || input.pricePerKgCents >= product.pricePerKgCents) {
            throw new InputError('Verifica periodo e prezzo scontato. Il prezzo deve essere inferiore a quello al kg.');
          }
          const values = { ...input, startsAt, endsAt };
          record = id ? await tx.promotion.update({ where: { id }, data: values }) : await tx.promotion.create({ data: values });
        }
        await audit(tx, admin, `${entity}.save`, record.id);
        return record;
      });
    });
  }

  app.get('/admin/settings', async request => {
    await requireAdmin(request);
    const [settings, zones] = await Promise.all([
      db.businessSettings.findUnique({ where: { id: 'business' } }),
      db.deliveryZone.findMany({ orderBy: { postalCode: 'asc' } }),
    ]);
    return { settings, zones };
  });
  app.put('/admin/settings', async request => {
    const admin = await requireAdmin(request);
    const data = settingsSchema.parse(request.body);
    return db.$transaction(async tx => {
      const settings = await tx.businessSettings.upsert({ where: { id: 'business' }, update: data, create: data });
      await audit(tx, admin, 'settings.save', settings.id);
      return settings;
    });
  });
  app.put('/admin/zones', async request => {
    const admin = await requireAdmin(request);
    const data = zoneSchema.parse(request.body);
    return db.$transaction(async tx => {
      const zone = await tx.deliveryZone.upsert({ where: { postalCode: data.postalCode }, update: data, create: data });
      await audit(tx, admin, 'zone.save', zone.id);
      return zone;
    });
  });

  const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const maxBytes = 5 * 1024 * 1024;
  app.addContentTypeParser(imageTypes, { parseAs: 'buffer', bodyLimit: maxBytes }, (_request, body, done) => done(null, body));
  app.post('/admin/images', { bodyLimit: maxBytes, config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async request => {
    const admin = await requireAdmin(request);
    if (!Buffer.isBuffer(request.body)) throw new InputError('Seleziona una foto JPEG, PNG o WebP.');
    let bytes;
    try {
      const image = sharp(request.body, { limitInputPixels: 24000000 });
      const { format } = await image.metadata();
      if (!format || !['jpeg', 'png', 'webp'].includes(format)) throw new Error('Formato non valido');
      bytes = await image.rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    } catch {
      throw new InputError('Impossibile leggere la foto. Scegli un’immagine valida.');
    }
    const id = await db.$transaction(async tx => {
      const image = await tx.catalogImage.create({ data: { bytes: Uint8Array.from(bytes) }, select: { id: true } });
      await audit(tx, admin, 'image.upload', image.id);
      return image.id;
    });
    return { url: `/images/${id}` };
  });
}
