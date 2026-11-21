import type { Fulfillment, OrderStatus } from '@prisma/client';

export function nextStatuses(status: OrderStatus, fulfillment: Fulfillment): OrderStatus[] {
  switch (status) {
    case 'RECEIVED': return ['PREPARING'];
    case 'PREPARING': return [fulfillment === 'PICKUP' ? 'READY' : 'OUT_FOR_DELIVERY'];
    case 'OUT_FOR_DELIVERY': return fulfillment === 'DELIVERY' ? ['DELIVERED'] : [];
    case 'READY': return fulfillment === 'PICKUP' ? ['COMPLETED'] : [];
    case 'DELIVERED': return fulfillment === 'DELIVERY' ? ['COMPLETED'] : [];
    default: return [];
  }
}

export const publicStatusText: Partial<Record<OrderStatus, string>> = {
  RECEIVED: 'Il tuo ordine è stato ricevuto.',
  PREPARING: 'Il tuo ordine è in preparazione.',
  READY: 'Puoi ritirare il tuo ordine in macelleria.',
  OUT_FOR_DELIVERY: 'Il tuo ordine è in consegna.',
  DELIVERED: 'Il tuo ordine è stato consegnato.',
  CANCELLED: 'Il tuo ordine è stato annullato.',
};
