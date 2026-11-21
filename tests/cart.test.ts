import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { changeQuantity, loadCart } from '../src/cart.ts';

const product = {
  id: 'p', categoryId: 'c', name: 'Prodotto dimostrativo', description: '', imageUrl: null,
  pricePerKgCents: 1600, regularPricePerKgCents: 1600, maxGrams: 2000, available: true,
};

test('aggiunge, aggiorna, ripristina e rimuove una voce del carrello', () => {
  let cart = changeQuantity({}, product, 500);
  assert.equal(cart.p.grams, 500);
  cart = changeQuantity(cart, { ...product, pricePerKgCents: 1800 }, 1500);
  assert.equal(cart.p.expectedPricePerKgCents, 1600);
  assert.deepEqual(loadCart(JSON.stringify(cart)), cart);
  assert.deepEqual(changeQuantity(cart, product, 0), {});
});

test('rifiuta il peso fuori misura e consente di ridurre un peso sopra il nuovo limite', () => {
  const cart = changeQuantity({}, product, 2000);
  assert.equal(changeQuantity(cart, product, 2500), cart);
  assert.equal(changeQuantity(cart, product, 550), cart);
  assert.equal(changeQuantity(cart, { ...product, maxGrams: 500 }, 1500).p.grams, 1500);
});

test('ignora righe salvate prive di identificativo o quantità validi', () => {
  assert.deepEqual(loadCart('{"p":{"productId":"p","grams":501,"expectedPricePerKgCents":1500}}'), {});
});
