import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { nextStatuses } from './order-status.js';

test('un ritiro può diventare pronto e poi completato', () => {
  assert.deepEqual(nextStatuses('RECEIVED', 'PICKUP'), ['PREPARING']);
  assert.deepEqual(nextStatuses('PREPARING', 'PICKUP'), ['READY']);
  assert.deepEqual(nextStatuses('READY', 'PICKUP'), ['COMPLETED']);
});

test('una consegna passa per spedizione e consegna', () => {
  assert.deepEqual(nextStatuses('PREPARING', 'DELIVERY'), ['OUT_FOR_DELIVERY']);
  assert.deepEqual(nextStatuses('OUT_FOR_DELIVERY', 'DELIVERY'), ['DELIVERED']);
  assert.deepEqual(nextStatuses('DELIVERED', 'DELIVERY'), ['COMPLETED']);
  assert.deepEqual(nextStatuses('READY', 'DELIVERY'), []);
});

test('un ordine non pagato o terminale non prosegue', () => {
  assert.deepEqual(nextStatuses('PENDING_PAYMENT', 'DELIVERY'), []);
  assert.deepEqual(nextStatuses('CANCELLED', 'PICKUP'), []);
  assert.deepEqual(nextStatuses('COMPLETED', 'PICKUP'), []);
});
