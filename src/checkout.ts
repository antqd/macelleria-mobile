/** Contract for a future backend-backed checkout. No payment is created by the app yet. */
export type Fulfillment = 'pickup' | 'delivery';
export type CheckoutItem = { productId: string; grams: number };
export type CheckoutRequest = { items: CheckoutItem[]; fulfillment: Fulfillment };

// The server must look up current prices, validate quantities and delivery details,
// create the order and PaymentIntent, and confirm payment via a verified webhook.
// Never put a Stripe secret key or a trusted total in the mobile application.
