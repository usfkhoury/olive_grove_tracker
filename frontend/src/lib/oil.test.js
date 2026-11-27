import test from 'node:test';
import assert from 'node:assert/strict';
import { toTanake, toLiters, bottlesToLiters, litersToKg, reconcileAmount, stockByVintage, lastOutflow } from './oil.js';

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
test('lastOutflow ignores presses and positive adjustments', () => {
  assert.equal(lastOutflow(mv), '2026-11-26');
  assert.equal(lastOutflow(mv.slice(0, 1)), null);
});

import { vintageFlows, inUnit } from './oil.js';
test('vintageFlows attributes outflows to the oldest oil, parts add up', () => {
  const mvs = [
    { date: '2024-10-19', kind: 'press', amount_kg: 40 },
    { date: '2024-12-31', kind: 'gift', amount_kg: -12 },
    { date: '2024-12-31', kind: 'home', amount_kg: -28 },
    { date: '2025-11-02', kind: 'press', amount_kg: 100 },
    { date: '2026-10-25', kind: 'press', amount_kg: 50 },
    { date: '2026-11-26', kind: 'gift', amount_kg: -10 },      // drains 2025 (oldest left)
    { date: '2026-12-01', kind: 'adjustment', amount_kg: -5 }, // lost: 2025
    { date: '2026-12-02', kind: 'adjustment', amount_kg: 3 },  // found: added to 2026
  ];
  const v = vintageFlows(mvs);
  assert.deepEqual(v.map((r) => r.year), [2026, 2025, 2024]);
  assert.deepEqual(v.find((r) => r.year === 2024), { year: 2024, pressed: 40, added: 0, home: 28, gift: 12, sale: 0, lost: 0, stock: 0 });
  assert.deepEqual(v.find((r) => r.year === 2025), { year: 2025, pressed: 100, added: 0, home: 0, gift: 10, sale: 0, lost: 5, stock: 85 });
  assert.deepEqual(v.find((r) => r.year === 2026), { year: 2026, pressed: 50, added: 3, home: 0, gift: 0, sale: 0, lost: 0, stock: 53 });
});
test('inUnit: litres, tanake, 2.75 L bottles', () => {
  assert.equal(inUnit(187, 'L'), 199);
  assert.equal(inUnit(187, 'T'), 12.5);
  assert.equal(inUnit(187, 'B'), 73);
  assert.equal(inUnit(2.58, 'B'), 1);
});

import { countPlan } from './oil.js';
test('vintageFlows: a movement with a vintage drains that year, not the oldest', () => {
  const mvs = [
    { date: '2025-11-02', kind: 'press', amount_kg: 100 },
    { date: '2026-10-25', kind: 'press', amount_kg: 50 },
    { date: '2026-11-28', kind: 'home', amount_kg: -10, vintage: 2026 },
    { date: '2026-11-28', kind: 'adjustment', amount_kg: 4, vintage: 2025 },
  ];
  const v = vintageFlows(mvs);
  assert.equal(v.find((r) => r.year === 2026).home, 10);
  assert.equal(v.find((r) => r.year === 2026).stock, 40);
  assert.equal(v.find((r) => r.year === 2025).added, 4);
  assert.equal(v.find((r) => r.year === 2025).stock, 104);
  assert.deepEqual(stockByVintage(mvs), [{ year: 2025, kg: 104 }, { year: 2026, kg: 40 }]);
});
test('countPlan: one entry per year that differs, tagged with its vintage', () => {
  const flows = [{ year: 2026, stock: 187 }, { year: 2025, stock: 121.5 }];
  // 2025: 30 × 2.75 L = 82.5 L = 77.34 kg → 44.16 kg used; 2026: 199.47 L ≈ ledger → nothing
  const plan = countPlan(flows, { 2025: 82.5, 2026: 199.47 }, 'home', '2026-11-28');
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0], { date: '2026-11-28', kind: 'home', amount_kg: -44.16, vintage: 2025 });
  const more = countPlan(flows, { 2026: 210 }, 'gift', '2026-11-28');
  assert.deepEqual(more[0], { date: '2026-11-28', kind: 'adjustment', amount_kg: 9.88, vintage: 2026 });
});
