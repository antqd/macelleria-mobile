import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { quoteItems } from './pricing.js';
const product = { id: 'p', name: 'Esempio', pricePerKgCents: 1600, maxGrams: 2000, available: true, archived: false };
const item = (grams: number, expectedPricePerKgCents = 1600) => ({productId:'p', grams, expectedPricePerKgCents});
test('calcola prezzi in centesimi per ogni incremento', () => {
  assert.deepEqual([500, 1000, 1500, 2000].map(g => quoteItems([item(g)], [product])[0].totalCents), [800,1600,2400,3200]);
});
test('rifiuta pesi non validi, eccessivi e prodotti duplicati', () => {
  for (const g of [0, 501, 2500, -500, 1.5]) assert.throws(() => quoteItems([item(g)], [product]));
  assert.throws(() => quoteItems([item(500), item(500)], [product]));
});
test('ricalcola il prezzo e segnala le variazioni', () => {
  const line = quoteItems([item(500, 1200)], [product])[0];
  assert.equal(line.totalCents, 800);
  assert.equal(line.priceChanged, true);
});
test('rifiuta prodotti esauriti o archiviati', () => {
  assert.throws(() => quoteItems([item(500)], [{...product, available:false}]));
  assert.throws(() => quoteItems([item(500)], [{...product, archived:true}]));
});
