export type Fulfillment = 'PICKUP' | 'DELIVERY';
export type Item = { productId: string; grams: number; expectedPricePerKgCents: number };
export type GuestOrder = { id: string; token: string; number?: number; profileAccess?: boolean };
export type OrderStatus = 'PENDING_PAYMENT' | 'RECEIVED' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED';
export type Order = {
  id: string;
  number: number;
  fulfillment: Fulfillment;
  status: OrderStatus;
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  pickupSnapshot: { address?: string; phone?: string; hours?: string; notes?: string } | null;
  deliveryHours: string | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  items: { name: string; grams: number; totalCents: number }[];
};
export type Quote = {
  lines: { productId: string; grams: number; name: string; pricePerKgCents: number; totalCents: number; priceChanged: boolean }[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  priceChanged: boolean;
};
export const statusLabels: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'In attesa del pagamento', RECEIVED: 'Ricevuto', PREPARING: 'In preparazione',
  READY: 'Pronto per il ritiro', OUT_FOR_DELIVERY: 'In consegna', DELIVERED: 'Consegnato',
  COMPLETED: 'Completato', CANCELLED: 'Annullato',
};
