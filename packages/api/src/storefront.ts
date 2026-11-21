import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { quoteItems } from './pricing.js';

export class InputError extends Error {
  constructor(message: string, readonly status = 400, readonly details?: unknown) {
    super(message);
  }
}

export const activePromotion = (now: Date) => ({
  active: true,
  startsAt: { lte: now },
  endsAt: { gt: now },
});

export const activePrice = (product: { pricePerKgCents: number; promotions: { pricePerKgCents: number }[] }) =>
  Math.min(product.pricePerKgCents, product.promotions[0]?.pricePerKgCents ?? product.pricePerKgCents);

const shortText = z.string().trim().min(1).max(100);
const postalCode = z.string().trim().regex(/^\d{5}$/);
const quoteFields = {
  items: z.array(z.object({
    productId: z.string().min(1).max(64),
    grams: z.number().int().min(500).max(100000).multipleOf(500),
    expectedPricePerKgCents: z.number().int().nonnegative().max(10000000),
  })).min(1).max(50),
};
const pickup = z.object({ ...quoteFields, fulfillment: z.literal('PICKUP') });
const delivery = z.object({ ...quoteFields, fulfillment: z.literal('DELIVERY'), postalCode, city: shortText });
export const quoteSchema = z.discriminatedUnion('fulfillment', [pickup, delivery]);

const orderFields = {
  id: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  firstName: shortText,
  lastName: shortText,
  phone: z.string().trim().regex(/^\+?[\d ().-]{6,24}$/).refine(value => value.replace(/\D/g, '').length >= 6),
  expectedTotalCents: z.number().int().positive().max(99999999),
};
export const orderSchema = z.discriminatedUnion('fulfillment', [
  pickup.extend(orderFields),
  delivery.extend({ ...orderFields, street: shortText, streetNumber: z.string().trim().min(1).max(20), notes: z.string().trim().max(500).optional() }),
]);

export async function quote(db: Prisma.TransactionClient, request: z.infer<typeof quoteSchema>) {
  const [products, settings] = await Promise.all([
    db.product.findMany({
      where: { id: { in: request.items.map(item => item.productId) }, category: { active: true } },
      include: { promotions: { where: activePromotion(new Date()), orderBy: { pricePerKgCents: 'asc' }, take: 1 } },
    }),
    db.businessSettings.findUnique({ where: { id: 'business' } }),
  ]);
  let lines;
  try {
    lines = quoteItems(request.items, products.map(product => ({ ...product, pricePerKgCents: activePrice(product) })));
  } catch (error) {
    throw new InputError(error instanceof Error ? error.message : 'Carrello non valido.');
  }

  const subtotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
  let deliveryFeeCents = 0;
  if (request.fulfillment === 'DELIVERY') {
    const zone = await db.deliveryZone.findUnique({ where: { postalCode: request.postalCode } });
    if (!settings?.deliveryEnabled || !zone?.active || zone.city.toLocaleLowerCase('it') !== request.city.toLocaleLowerCase('it')) {
      throw new InputError('La consegna non è disponibile per questo indirizzo.');
    }
    if (subtotalCents < zone.minOrderCents) {
      const minimum = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(zone.minOrderCents / 100);
      throw new InputError(`Il minimo per la consegna è ${minimum}.`);
    }
    deliveryFeeCents = zone.feeCents;
  } else if (!settings?.address) {
    throw new InputError('Il ritiro non è al momento disponibile.');
  }

  return {
    lines, subtotalCents, deliveryFeeCents,
    totalCents: subtotalCents + deliveryFeeCents,
    priceChanged: lines.some(line => line.priceChanged),
  };
}
