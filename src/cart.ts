import type { Product } from './catalog';
import type { Item } from './checkout';

export type Cart = Record<string, Item>;
export const cartStorageKey = 'chiappetta.cart.v2';

export function changeQuantity(cart: Cart, product: Product, grams: number): Cart {
  const next = { ...cart };
  if (grams === 0) {
    delete next[product.id];
    return next;
  }
  const existing = cart[product.id]?.grams ?? 0;
  const exceedsLimit = grams > product.maxGrams && grams >= existing;
  if (!product.available || grams < 500 || exceedsLimit || grams % 500 !== 0) return cart;
  next[product.id] = {
    productId: product.id,
    grams,
    expectedPricePerKgCents: cart[product.id]?.expectedPricePerKgCents ?? product.pricePerKgCents,
  };
  return next;
}

export function loadCart(raw: string | null): Cart {
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).filter(([id, line]) =>
    /^[a-zA-Z0-9_-]{1,64}$/.test(id) && line?.productId === id &&
    Number.isSafeInteger(line.grams) && line.grams >= 500 && line.grams <= 100000 && line.grams % 500 === 0 &&
    Number.isSafeInteger(line.expectedPricePerKgCents) && line.expectedPricePerKgCents >= 0));
}


export function loadCartState(raw: string | null): { cart: Cart; orderId?: string } {
  if (!raw) return { cart: {} };
  const data = JSON.parse(raw) as { version?: number; items?: unknown; orderId?: unknown } | null;
  if (data?.version !== 1) return { cart: loadCart(raw) };
  return {
    cart: loadCart(JSON.stringify(data.items ?? {})),
    orderId: typeof data.orderId === 'string' ? data.orderId : undefined,
  };
}
