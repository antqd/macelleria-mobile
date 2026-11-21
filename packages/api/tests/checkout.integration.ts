import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import Stripe from 'stripe';

const enabled = process.env.RUN_STRIPE_TESTS === '1';
const base = new URL(process.env.TEST_API_URL ?? 'http://127.0.0.1:3001');
const origin = process.env.ADMIN_ORIGIN ?? 'http://localhost:3000';
const secret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

test('flusso PostgreSQL e Stripe Test Mode', { skip: !enabled, timeout: 90_000 }, async () => {
  assert.ok(['127.0.0.1', 'localhost'].includes(base.hostname), 'Usa un’API di test locale');
  assert.equal(process.env.NODE_ENV, 'test', 'Esegui contro un database di test dedicato');
  assert.ok(secret?.startsWith('sk_test_') && webhookSecret?.startsWith('whsec_'), 'Servono chiave e firma Stripe Test');
  const stripe = new Stripe(secret!);
  let cookie = '';
  const token = randomBytes(32).toString('hex');
  const guest = `Bearer ${token}`;
  async function call(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    return fetch(new URL(path, base), {
      method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }
  const admin = () => ({ Cookie: cookie, Origin: origin });
  const guestHeaders = { Authorization: guest };
  const health = await (await call('/health')).json();
  assert.equal(health.integrationFixtures, true, 'Il server deve autorizzare le fixture su un database di test dedicato');
  assert.equal((await call('/admin/dashboard')).status, 401);
  const login = await call('/admin/session', 'POST', {
    email: process.env.ADMIN_BOOTSTRAP_EMAIL, password: process.env.ADMIN_BOOTSTRAP_PASSWORD,
  }, { Origin: origin });
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  assert.ok(cookie);

  const catalog = await (await call('/admin/catalog', 'GET', undefined, admin())).json();
  const category = catalog.categories.find((item: { slug: string }) => item.slug === 'preparati');
  assert.ok(category, 'Esegui il seed sul database di test');
  const name = `TEST ${randomUUID().slice(0, 8)}`;
  const product = { categoryId: category.id, name, description: 'Integrazione', pricePerKgCents: 1600,
    available: true, archived: false, maxGrams: 10000, sortOrder: 50, imageUrl: null };
  let response = await call('/admin/products', 'PUT', { data: product }, admin());
  assert.equal(response.status, 200);
  const { id: productId } = await response.json();

  const fixtureAddress = process.env.INTEGRATION_TEST_PICKUP_ADDRESS;
  assert.ok(fixtureAddress, 'Configura un indirizzo fixture del database dedicato');
  response = await call('/admin/settings', 'PUT', {
    name: 'Macelleria Test', address: fixtureAddress, phone: null, openingHours: null, pickupNotes: null, deliveryHours: null, privacyPolicyUrl: null, termsUrl: null, deliveryEnabled: true,
  }, admin());
  assert.equal(response.status, 200);
  response = await call('/admin/zones', 'PUT', { postalCode: '00000', city: 'Comune Fixture', feeCents: 300, minOrderCents: 500, active: true }, admin());
  assert.equal(response.status, 200);

  const item = { productId, grams: 500, expectedPricePerKgCents: 1600 };
  const pickup = { items: [item], fulfillment: 'PICKUP' };
  const deliver = { items: [item], fulfillment: 'DELIVERY', postalCode: '00000', city: 'Comune Fixture' };
  assert.equal((await call('/quote', 'POST', { ...deliver, city: 'Zona non servita' })).status, 400);
  assert.equal((await (await call('/quote', 'POST', deliver)).json()).totalCents, 1100);
  assert.equal((await (await call('/quote', 'POST', pickup)).json()).totalCents, 800);
  assert.equal((await call('/admin/products', 'PUT', { id: productId, data: { ...product, pricePerKgCents: 1800 } }, admin())).status, 200);
  assert.equal((await (await call('/quote', 'POST', pickup)).json()).priceChanged, true);

  const orderId = randomUUID();
  const input = { ...pickup, id: orderId, firstName: 'Ospite', lastName: 'Test', phone: '+39000000000', expectedTotalCents: 800 };
  assert.equal((await call('/orders', 'POST', input, guestHeaders)).status, 409);
  const corrected = { ...input, items: [{ ...item, expectedPricePerKgCents: 1800 }], expectedTotalCents: 900 };
  const first = await call('/orders', 'POST', corrected, guestHeaders);
  const retry = await call('/orders', 'POST', corrected, guestHeaders);
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.deepEqual(await first.json(), await retry.json());
  assert.equal((await call(`/orders/${orderId}`, 'GET', undefined, { Authorization: `Bearer ${randomBytes(32).toString('hex')}` })).status, 404);
  const profileId = randomUUID();
  const profileHeaders = { Authorization: `Bearer ${randomBytes(32).toString('hex')}` };
  assert.equal((await call('/customers', 'POST', { id: profileId }, profileHeaders)).status, 200);
  assert.equal((await call(`/orders/${orderId}`, 'GET', undefined, profileHeaders)).status, 404);
  assert.equal((await call(`/customers/${profileId}/orders/${orderId}`, 'PUT', { orderToken: token }, profileHeaders)).status, 200);
  const history = await (await call(`/customers/${profileId}/orders`, 'GET', undefined, profileHeaders)).json();
  assert.equal(history.orders[0].id, orderId);
  assert.equal((await call(`/orders/${orderId}`, 'GET', undefined, profileHeaders)).status, 200);
  assert.equal((await call(`/admin/orders/${orderId}`, 'PATCH', { status: 'PREPARING' }, admin())).status, 409);

  response = await call(`/orders/${orderId}/payment`, 'POST', undefined, guestHeaders);
  assert.equal(response.status, 200);
  const { clientSecret } = await response.json();
  const paymentId = String(clientSecret).split('_secret_')[0];
  const payment = await stripe.paymentIntents.confirm(paymentId, { payment_method: 'pm_card_visa' });
  assert.equal(payment.status, 'succeeded');
  const payload = JSON.stringify({
    id: `evt_local_replay_${orderId}`, object: 'event', livemode: false,
    type: 'payment_intent.succeeded', data: { object: payment },
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret! });
  const sendWebhook = (header: string) => fetch(new URL('/webhooks/stripe', base), {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': header }, body: payload,
  });
  assert.equal((await sendWebhook('invalid')).status, 400);
  assert.equal((await sendWebhook(signature)).status, 200);
  assert.equal((await sendWebhook(signature)).status, 200);

  const summary = await (await call(`/orders/${orderId}`, 'GET', undefined, guestHeaders)).json();
  assert.equal(summary.paymentStatus, 'PAID');
  assert.equal(summary.totalCents, 900);
  assert.equal((await call(`/admin/orders/${orderId}`, 'PATCH', { status: 'PREPARING' }, admin())).status, 200);
  assert.equal((await call(`/admin/orders/${orderId}`, 'PATCH', { status: 'OUT_FOR_DELIVERY' }, admin())).status, 409);
  assert.equal((await call(`/admin/orders/${orderId}`, 'PATCH', { status: 'READY' }, admin())).status, 200);

  assert.equal((await call('/admin/promotions', 'PUT', { data: {
    productId, pricePerKgCents: 1000, active: true,
    startsAt: new Date(Date.now() - 10000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(),
  } }, admin())).status, 200);
  const storefront = await (await call('/catalog')).json();
  assert.equal(storefront.products.find((row: { id: string }) => row.id === productId).pricePerKgCents, 1000);
  assert.equal((await (await call(`/orders/${orderId}`, 'GET', undefined, guestHeaders)).json()).totalCents, 900);
  assert.equal((await call('/admin/session', 'DELETE', undefined, admin())).status, 200);
  assert.equal((await call('/admin/catalog', 'GET', undefined, admin())).status, 401);
});
