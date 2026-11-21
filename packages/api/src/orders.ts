import { createHash, timingSafeEqual } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type Stripe from 'stripe';
import { z } from 'zod';
import { InputError, orderSchema, quote, quoteSchema } from './storefront.js';
import { publicStatusText } from './order-status.js';

const uuid = z.string().uuid();
const guestSecret = z.string().regex(/^[a-f0-9]{64}$/);
const expoToken = z.string().regex(/^(ExpoPushToken|ExponentPushToken)\[[a-zA-Z0-9_-]+\]$/).max(180);
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const publicFields = {
  id: true, number: true, fulfillment: true, status: true, paymentStatus: true,
  subtotalCents: true, deliveryFeeCents: true, totalCents: true, pickupSnapshot: true, deliveryHours: true,
  createdAt: true, items: { select: { name: true, grams: true, pricePerKgCents: true, totalCents: true } },
} satisfies Prisma.OrderSelect;
const paymentLimitMs = 60 * 60 * 1000;

function bearer(request: FastifyRequest) {
  const value = guestSecret.safeParse(request.headers.authorization?.match(/^Bearer (.+)$/)?.[1]);
  if (!value.success) throw new InputError('Ordine non trovato.', 404);
  return digest(value.data);
}

function assertGuest(order: { guestTokenHash: string } | null, tokenHash: string): asserts order {
  if (!order || !timingSafeEqual(Buffer.from(order.guestTokenHash, 'hex'), Buffer.from(tokenHash, 'hex'))) {
    throw new InputError('Ordine non trovato.', 404);
  }
}

export async function registerOrders(app: FastifyInstance, db: PrismaClient, stripe: Stripe | null) {
  const matchToken = (expected: string | undefined, actual: string) =>
    Boolean(expected && timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex')));

  const getCustomer = async (id: string, tokenHash: string) => {
    const customer = await db.customer.findUnique({ where: { id } });
    if (!customer || !matchToken(customer.tokenHash, tokenHash)) throw new InputError('Profilo non trovato.', 404);
    return customer;
  };

  app.post('/customers', { config: { rateLimit: { max: 6, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const tokenHash = bearer(request);
    const { id } = z.object({ id: uuid }).parse(request.body);
    await db.customer.createMany({ data: [{ id, tokenHash }], skipDuplicates: true });
    await getCustomer(id, tokenHash);
    reply.header('Cache-Control', 'no-store');
    return { id };
  });

  app.get('/customers/:id/orders', async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { page } = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) }).parse(request.query);
    await getCustomer(id, bearer(request));
    const rows = await db.order.findMany({
      where: { customerId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * 20, take: 21,
      select: { id: true, number: true, status: true },
    });
    reply.header('Cache-Control', 'no-store');
    return { orders: rows.slice(0, 20), hasMore: rows.length > 20 };
  });

  app.put('/customers/:id/orders/:orderId', async request => {
    const { id, orderId } = z.object({ id: uuid, orderId: uuid }).parse(request.params);
    await getCustomer(id, bearer(request));
    const { orderToken } = z.object({ orderToken: guestSecret }).parse(request.body);
    const order = await db.order.findUnique({ where: { id: orderId } });
    assertGuest(order, digest(orderToken));
    const linked = await db.order.updateMany({
      where: { id: orderId, OR: [{ customerId: null }, { customerId: id }] }, data: { customerId: id },
    });
    if (!linked.count) throw new InputError('L’ordine appartiene già a un profilo.', 409);
    return { ok: true };
  });

  app.post('/orders', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async request => {
    if (!stripe) throw new InputError('Il pagamento non è disponibile in questo momento.', 503);
    const guestTokenHash = bearer(request);
    const input = orderSchema.parse(request.body);
    if (input.customerId) {
      const profileToken = guestSecret.safeParse(request.headers['x-customer-token']);
      if (!profileToken.success) throw new InputError('Profilo non valido.', 401);
      await getCustomer(input.customerId, digest(profileToken.data));
    }
    const requestHash = digest(JSON.stringify(input));
    const recover = async () => {
      const order = await db.order.findUnique({ where: { id: input.id } });
      if (!order) return null;
      assertGuest(order, guestTokenHash);
      if (order.requestHash !== requestHash) throw new InputError('Il tentativo appartiene a un altro riepilogo.', 409);
      return { id: order.id, number: order.number };
    };

    const existing = await recover();
    if (existing) return existing;

    try {
      return await db.$transaction(async tx => {
        const current = await quote(tx, input);
        if (current.priceChanged || current.totalCents !== input.expectedTotalCents) {
          throw new InputError('Il riepilogo è cambiato. Controlla il nuovo importo prima di pagare.', 409, current);
        }
        if (current.totalCents < 50 || current.totalCents > 99999999) throw new InputError('Importo fuori dai limiti di pagamento.');
        const settings = await tx.businessSettings.findUnique({ where: { id: 'business' } });
        return tx.order.create({
          data: {
            id: input.id, idempotencyKey: input.id, requestHash, guestTokenHash, customerId: input.customerId,
            customerName: `${input.firstName} ${input.lastName}`, phone: input.phone,
            fulfillment: input.fulfillment,
            ...(input.fulfillment === 'DELIVERY' ? { deliveryAddress: {
              street: input.street, streetNumber: input.streetNumber, postalCode: input.postalCode, city: input.city, notes: input.notes ?? '',
            } } : {}),
            ...(settings && input.fulfillment === 'PICKUP' ? { pickupSnapshot: {
              address: settings.address, phone: settings.phone, hours: settings.openingHours, notes: settings.pickupNotes,
            } } : {}),
            deliveryHours: input.fulfillment === 'DELIVERY' ? settings?.deliveryHours : null,
            subtotalCents: current.subtotalCents, totalCents: current.totalCents, deliveryFeeCents: current.deliveryFeeCents,
            items: { create: current.lines.map(({ priceChanged: _changed, ...line }) => line) },
          },
          select: { id: true, number: true },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
        const recovered = await recover();
        if (recovered) return recovered;
        throw new InputError('Il catalogo è stato aggiornato. Riprova.', 409);
      }
      throw error;
    }
  });

  const getOrder = async (request: FastifyRequest) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const tokenHash = bearer(request);
    const order = await db.order.findUnique({ where: { id }, include: { customer: { select: { tokenHash: true } } } });
    if (!order || (!matchToken(order.guestTokenHash, tokenHash) && !matchToken(order.customer?.tokenHash, tokenHash))) {
      throw new InputError('Ordine non trovato.', 404);
    }
    return order;
  };

  app.get('/orders/:id', async (request, reply) => {
    const order = await getOrder(request);
    reply.header('Cache-Control', 'no-store');
    return db.order.findUniqueOrThrow({ where: { id: order.id }, select: publicFields });
  });

  app.put('/orders/:id/push', async request => {
    const order = await getOrder(request);
    const { token } = z.object({ token: expoToken.nullable() }).parse(request.body);
    await db.order.update({ where: { id: order.id }, data: { pushToken: token } });
    return { ok: true };
  });

  app.post('/orders/:id/payment', async (request, reply) => {
    if (!stripe) throw new InputError('Pagamento non disponibile.', 503);
    const order = await getOrder(request);
    if (order.status !== 'PENDING_PAYMENT') throw new InputError('Questo ordine non attende un pagamento.', 409);
    const existingIntent = order.stripePaymentId ? await stripe.paymentIntents.retrieve(order.stripePaymentId) : null;
    const retryableStates = ['requires_payment_method', 'requires_confirmation', 'requires_action'];
    if (existingIntent && !retryableStates.includes(existingIntent.status)) {
      throw new InputError('Il pagamento è in elaborazione o il tentativo è chiuso. Consulta lo stato dell’ordine.', 409);
    }
    const retireIntent = async () => {
      if (existingIntent) await stripe.paymentIntents.cancel(existingIntent.id, {}, { idempotencyKey: `expire:${order.id}` });
    };
    if (Date.now() - order.createdAt.getTime() > paymentLimitMs) {
      await retireIntent();
      throw new InputError('Il tentativo di pagamento è scaduto. Torna al carrello per ricominciare.', 410);
    }

    const items = await db.orderItem.findMany({ where: { orderId: order.id } });
    const address = order.deliveryAddress && typeof order.deliveryAddress === 'object' ? order.deliveryAddress : {};
    const requestQuote = quoteSchema.safeParse({
      ...address, fulfillment: order.fulfillment,
      items: items.map(item => ({ productId: item.productId, grams: item.grams, expectedPricePerKgCents: item.pricePerKgCents })),
    });
    try {
      if (!requestQuote.success) throw new InputError('Il riepilogo non è più valido.');
      const current = await quote(db, requestQuote.data);
      if (current.priceChanged || current.totalCents !== order.totalCents) throw new InputError('Il totale è cambiato.');
    } catch (error) {
      if (!(error instanceof InputError)) throw error;
      await retireIntent();
      throw new InputError('Prezzi o disponibilità sono cambiati. Torna al carrello per controllare il nuovo riepilogo.', 409);
    }

    const intent = existingIntent ?? await stripe.paymentIntents.create({
      amount: order.totalCents, currency: 'eur',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: { orderId: order.id },
    }, { idempotencyKey: `order:${order.id}` });
    await db.order.updateMany({
      where: { id: order.id, stripePaymentId: null },
      data: { stripePaymentId: intent.id },
    });
    if (!intent.client_secret || !retryableStates.includes(intent.status)) {
      throw new InputError('Il pagamento è in elaborazione o il tentativo è chiuso. Consulta lo stato dell’ordine.', 409);
    }
    reply.header('Cache-Control', 'no-store');
    return { clientSecret: intent.client_secret };
  });
}

export async function applyStripeEvent(db: PrismaClient, event: Stripe.Event) {
  await db.$transaction(async tx => {
    const recorded = await tx.stripeEvent.createMany({ data: [{ id: event.id }], skipDuplicates: true });
    if (!recorded.count) return;
    if (event.type === 'refund.updated' || event.type === 'refund.created') {
      const refund = event.data.object;
      if (refund.status !== 'succeeded' || typeof refund.payment_intent !== 'string') return;
      const order = await tx.order.findUnique({ where: { stripePaymentId: refund.payment_intent } });
      if (!order || !order.cancellationRequested || refund.amount !== order.totalCents || refund.currency !== 'eur') return;
      await finishRefund(tx, order.id, refund.id);
      return;
    }

    if (event.type !== 'payment_intent.succeeded' && event.type !== 'payment_intent.payment_failed' && event.type !== 'payment_intent.canceled') return;
    const intent = event.data.object;
    const orderId = uuid.safeParse(intent.metadata.orderId);
    if (!orderId.success || intent.currency !== 'eur') return;
    const order = await tx.order.findUnique({ where: { id: orderId.data } });
    if (!order || order.totalCents !== intent.amount || (order.stripePaymentId && order.stripePaymentId !== intent.id)) return;
    const where = { id: order.id, status: 'PENDING_PAYMENT' as const, OR: [{ stripePaymentId: null }, { stripePaymentId: intent.id }] };
    if (event.type === 'payment_intent.succeeded' && intent.amount_received === order.totalCents) {
      const updated = await tx.order.updateMany({ where, data: { status: 'RECEIVED', paymentStatus: 'PAID', stripePaymentId: intent.id, paidAt: new Date() } });
      if (updated.count) await queueStatus(tx, order.id, 'RECEIVED');
    } else if (event.type === 'payment_intent.canceled') {
      await tx.order.updateMany({ where, data: { status: 'CANCELLED', paymentStatus: 'FAILED', stripePaymentId: intent.id } });
    } else if (event.type === 'payment_intent.payment_failed') {
      await tx.order.updateMany({ where, data: { paymentStatus: 'FAILED', stripePaymentId: intent.id } });
    }
  });
}

export async function queueStatus(tx: Prisma.TransactionClient, orderId: string, status: keyof typeof publicStatusText) {
  const body = publicStatusText[status];
  if (body) await tx.pushMessage.create({ data: { orderId, body } });
}

export async function finishRefund(tx: Prisma.TransactionClient, id: string, refundId: string) {
  const updated = await tx.order.updateMany({
    where: { id, cancellationRequested: true, paymentStatus: 'PAID' },
    data: { status: 'CANCELLED', paymentStatus: 'REFUNDED', refundedAt: new Date(), stripeRefundId: refundId, cancellationRequested: false },
  });
  if (updated.count) await queueStatus(tx, id, 'CANCELLED');
}
