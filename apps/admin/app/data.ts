export class PanelError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function panel<T>(path: string, method = 'GET', data?: unknown, signal?: AbortSignal): Promise<T> {
  const isFile = data instanceof File;
  let response;
  try {
    response = await fetch(`/gateway/admin${path}`, {
      method, signal, cache: 'no-store',
      ...(data !== undefined ? {
        headers: { 'Content-Type': isFile ? data.type : 'application/json' },
        body: isFile ? data : JSON.stringify(data),
      } : {}),
    });
  } catch {
    throw new PanelError('Connessione al servizio non disponibile.', 0);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new PanelError(result.error ?? 'Impossibile completare la richiesta.', response.status);
  return result as T;
}

export const euro = (cents: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
export const weight = (grams: number) => `${(grams / 1000).toLocaleString('it-IT')} kg`;
export const time = (date: string) => new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome' }).format(new Date(date));
export const message = (error: unknown) => error instanceof Error ? error.message : 'Si è verificato un errore.';
export const labels = {
  PENDING_PAYMENT: 'In attesa del pagamento', RECEIVED: 'Ricevuto', PREPARING: 'In preparazione',
  READY: 'Pronto per il ritiro', OUT_FOR_DELIVERY: 'In consegna', DELIVERED: 'Consegnato',
  COMPLETED: 'Completato', CANCELLED: 'Annullato',
};
export type Status = keyof typeof labels;
export type OrderSummary = { id: string; number: number; status: Status; fulfillment: 'PICKUP' | 'DELIVERY'; createdAt: string; totalCents: number };
export type OrderRow = OrderSummary & { customerName: string; phone: string; items: { name: string; grams: number }[] };
export type OrderDetail = OrderRow & {
  next: Status[]; paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'; cancellationRequested: boolean;
  subtotalCents: number; deliveryFeeCents: number;
  items: { name: string; grams: number; totalCents: number }[];
  deliveryAddress: { street: string; streetNumber: string; postalCode: string; city: string; notes: string } | null;
  pickupSnapshot: { address?: string; phone?: string; hours?: string; notes?: string } | null;
};
export type DashboardData = {
  todayOrders: number; preparing: number; revenueCents: number; activeProducts: number; offers: number; failedPayments: number;
  recent: OrderSummary[]; days: { date: string; count: number }[];
};
export type Category = { id: string; name: string; slug: string; description: string; imageUrl: string | null; sortOrder: number; active: boolean };
export type Product = { id: string; categoryId: string; name: string; description: string; imageUrl: string | null; pricePerKgCents: number; maxGrams: number; available: boolean; archived: boolean; sortOrder: number };
export type Promotion = { id: string; productId: string; pricePerKgCents: number; startsAt: string; endsAt: string; active: boolean };
export type CatalogData = { categories: Category[]; products: Product[]; promotions: Promotion[] };
export type Business = {
  name: string; address: string | null; phone: string | null; openingHours: string | null;
  pickupNotes: string | null; deliveryHours: string | null; privacyPolicyUrl: string | null; termsUrl: string | null; deliveryEnabled: boolean;
};
export type Zone = { postalCode: string; city: string; feeCents: number; minOrderCents: number; active: boolean };
