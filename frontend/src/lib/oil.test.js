import test from 'node:test';
import assert from 'node:assert/strict';
import { toTanake, toLiters, bottlesToLiters, litersToKg, reconcileAmount, stockByVintage, flowBySeason, lastOutflow } from './oil.js';

const mv = [
  { date: '2024-10-19', kind: 'press', amount_kg: 40 },
  { date: '2025-01-01', kind: 'adjustment', amount_kg: -40 },
  { date: '2025-11-02', kind: 'press', amount_kg: 121.5 },
  { date: '2026-10-25', kind: 'press', amount_kg: 187 },
  { date: '2026-11-26', kind: 'gift', amount_kg: -15 },
];

test('unit conversions', () => {
  assert.equal(toTanake(187), 12.5);
  assert.equal(toLiters(308.5), 329);
  assert.equal(toLiters(187), 199);
  assert.equal(litersToKg(6), 5.63);
});
test('bottlesToLiters: 1 / 2.75 / 3 L bottles + unbottled tanake', () => {
  assert.equal(bottlesToLiters({ 1: 6, 2.75: 20, 3: 40 }), 181);
  assert.equal(bottlesToLiters({ 3: 2 }, 0.5), 14);
  assert.equal(bottlesToLiters({ 1: '', 3: '1' }), 3);
  assert.equal(bottlesToLiters({}), 0);
});
test('reconcileAmount = counted kg − ledger kg', () => {
  assert.equal(reconcileAmount(181, 308.5), -138.81);
  assert.equal(reconcileAmount(329.1, 308.5), 0.03);
});
test('stockByVintage uses oldest oil first', () => {
  assert.deepEqual(stockByVintage(mv), [{ year: 2025, kg: 106.5 }, { year: 2026, kg: 187 }]);
});
test('flowBySeason totals per year', () => {
  assert.deepEqual(flowBySeason(mv).find((r) => r.year === 2026), { year: 2026, pressed: 187, home: 0, gift: -15, sale: 0, adjustment: 0 });
});
test('lastOutflow ignores presses and positive adjustments', () => {
  assert.equal(lastOutflow(mv), '2026-11-26');
  assert.equal(lastOutflow(mv.slice(0, 1)), null);
});
