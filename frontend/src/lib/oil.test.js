import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toTanake, toLiters, bottlesToLiters, litersToKg, stockByVintage, lastOutflow,
  vintageFlows, inUnit, countPlan,
} from './oil.js';
import { TANAKE_KG, TANAKE_L, KG_PER_L } from '../constants.js';

const mv = [
  { date: '2024-10-19', kind: 'press', amount_kg: 40 },
  { date: '2025-01-01', kind: 'adjustment', amount_kg: -40 },
  { date: '2025-11-02', kind: 'press', amount_kg: 121.5 },
  { date: '2026-10-25', kind: 'press', amount_kg: 187 },
  { date: '2026-11-26', kind: 'gift', amount_kg: -15 },
];

test('a tanake is 16 kg ≈ 17.5 L (olive oil 0.915 kg/L)', () => {
  assert.equal(TANAKE_KG, 16);
  assert.equal(KG_PER_L, 0.915);
  assert.equal(Math.round(TANAKE_L * 10) / 10, 17.5);
});
test('unit conversions', () => {
  assert.equal(toTanake(187), 11.7);
  assert.equal(toTanake(16), 1);
  assert.equal(toLiters(308.5), 337);
  assert.equal(toLiters(187), 204);
  assert.equal(litersToKg(6), 5.49);
});
test('bottlesToLiters: 1 / 2.75 / 3 L bottles + full tanake', () => {
  assert.equal(bottlesToLiters({ 1: 6, 2.75: 20, 3: 40 }), 181);
  assert.equal(bottlesToLiters({ 3: 2 }, 0.5), 14.74);
  assert.equal(bottlesToLiters({ 1: '', 3: '1' }), 3);
  assert.equal(bottlesToLiters({}), 0);
});
test('stockByVintage uses oldest oil first', () => {
  assert.deepEqual(stockByVintage(mv), [{ year: 2025, kg: 106.5 }, { year: 2026, kg: 187 }]);
});
test('lastOutflow ignores presses, positive adjustments and soap-reserve moves', () => {
  assert.equal(lastOutflow(mv), '2026-11-26');
  assert.equal(lastOutflow(mv.slice(0, 1)), null);
  assert.equal(lastOutflow([...mv, { date: '2026-12-01', kind: 'reserve', amount_kg: -5 }]), '2026-11-26');
});

const zero = { added: 0, home: 0, gift: 0, sale: 0, lost: 0, soap: 0, reserve: 0 };
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
  assert.deepEqual(v.find((r) => r.year === 2024), { ...zero, year: 2024, pressed: 40, home: 28, gift: 12, stock: 0 });
  assert.deepEqual(v.find((r) => r.year === 2025), { ...zero, year: 2025, pressed: 100, gift: 10, lost: 5, stock: 85 });
  assert.deepEqual(v.find((r) => r.year === 2026), { ...zero, year: 2026, pressed: 50, added: 3, stock: 53 });
});
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
  assert.deepEqual(stockByVintage(mvs), [{ year: 2025, kg: 104 }, { year: 2026, kg: 40 }]);
});
test('vintageFlows: soap reserve keeps its vintage; soap uses the reserve, then cooking oil', () => {
  const mvs = [
    { date: '2024-10-19', kind: 'press', amount_kg: 40 },
    { date: '2025-11-02', kind: 'press', amount_kg: 100 },
    { date: '2025-11-03', kind: 'reserve', amount_kg: -10, vintage: 2024 }, // 2024 leftovers → reserve
    { date: '2026-06-20', kind: 'soap', amount_kg: -16 },                   // 10 reserve(2024) + 6 cooking(2024)
    { date: '2026-07-01', kind: 'soap', amount_kg: -5, vintage: 2025 },     // no 2025 reserve → 2025 cooking
  ];
  const v = vintageFlows(mvs);
  assert.deepEqual(v.find((r) => r.year === 2024), { ...zero, year: 2024, pressed: 40, soap: 16, stock: 24 });
  assert.deepEqual(v.find((r) => r.year === 2025), { ...zero, year: 2025, pressed: 100, soap: 5, stock: 95 });
  const w = vintageFlows(mvs.slice(0, 3));
  assert.equal(w.find((r) => r.year === 2024).reserve, 10);
  assert.equal(w.find((r) => r.year === 2024).stock, 30);
  assert.deepEqual(stockByVintage(mvs.slice(0, 3)), [{ year: 2024, kg: 30 }, { year: 2025, kg: 100 }]);
});
test('inUnit: litres, tanake, 2.75 L bottles', () => {
  assert.equal(inUnit(187, 'L'), 204.4);
  assert.equal(inUnit(37.04, 'L'), 40.5); // 2 bottles + 2 tanake
  assert.equal(inUnit(187, 'T'), 11.7);
  assert.equal(inUnit(187, 'B'), 74);
  assert.equal(inUnit(2.52, 'B'), 1);
});
test('countPlan: one entry per year that differs, tagged with its vintage', () => {
  const flows = [{ year: 2026, stock: 187, reserve: 0 }, { year: 2025, stock: 121.5, reserve: 0 }];
  // 2025: 30 × 2.75 L = 82.5 L = 75.49 kg → 46.01 kg used; 2026: 204.37 L ≈ ledger → nothing
  const plan = countPlan(flows, { 2025: 82.5, 2026: 204.37 }, {}, '2026-11-28');
  assert.deepEqual(plan, [{ date: '2026-11-28', kind: 'home', amount_kg: -46.01, vintage: 2025 }]);
  const more = countPlan(flows, { 2026: 210 }, {}, '2026-11-28');
  assert.deepEqual(more, [{ date: '2026-11-28', kind: 'adjustment', amount_kg: 5.15, vintage: 2026 }]);
});
test('countPlan: soap reserve count — less = soap made, more = moved from cooking oil', () => {
  const flows = [{ year: 2025, stock: 100, reserve: 12 }, { year: 2024, stock: 0, reserve: 4 }];
  assert.deepEqual(countPlan(flows, { reserve: 10 }, {}, '2026-11-28'),
    [{ date: '2026-11-28', kind: 'soap', amount_kg: -6.85 }]);   // 10 L = 9.15 kg vs 16 kg
  assert.deepEqual(countPlan(flows, { reserve: 20 }, {}, '2026-11-28'),
    [{ date: '2026-11-28', kind: 'reserve', amount_kg: -2.3 }]); // 20 L = 18.3 kg vs 16 kg
});

import { amountLitres, unitText } from './oil.js';
test('amountLitres: bottles + tins + loose litres', () => {
  assert.equal(amountLitres({ 2.75: 2 }), 5.5);
  assert.equal(amountLitres({ 2.75: '1', 1: 1, 3: 1, T: 1, L: '0.5' }), 24.74);
  assert.equal(amountLitres({}), 0);
});
test('unitText', () => {
  assert.equal(unitText(187, 'B'), '≈ 74 bottles');
  assert.equal(unitText(2.52, 'B'), '≈ 1 bottle');
  assert.equal(unitText(187, 'L'), '204.4 L');
  assert.equal(unitText(187, 'T'), '11.7 tanake');
});

test('countPlan: a shortfall split in bottles between gifts / lost, the rest home use', () => {
  const flows = [{ year: 2025, stock: 105.5, reserve: 0 }];
  // 5 bottles left = 13.75 L = 12.58 kg → 92.92 kg short; 10 bottles gifts = 25.16 kg, 1 lost = 2.52 kg
  const plan = countPlan(flows, { 2025: 13.75 }, { 2025: { gift: 10, adjustment: 1 } }, '2026-11-28');
  assert.deepEqual(plan, [
    { date: '2026-11-28', kind: 'home', amount_kg: -65.24, vintage: 2025 },
    { date: '2026-11-28', kind: 'gift', amount_kg: -25.16, vintage: 2025 },
    { date: '2026-11-28', kind: 'adjustment', amount_kg: -2.52, vintage: 2025 },
  ]);
  // more bottles split than are missing: capped, nothing left for home
  const all = countPlan(flows, { 2025: 13.75 }, { 2025: { gift: 50 } }, '2026-11-28');
  assert.deepEqual(all, [{ date: '2026-11-28', kind: 'gift', amount_kg: -92.92, vintage: 2025 }]);
});
test('countPlan: part of a shortfall can go to the soap reserve (moved, not used)', () => {
  const flows = [{ year: 2025, stock: 105.5, reserve: 0 }];
  // 92.92 kg short: 2 bottles to the soap reserve = 5.03 kg, 10 gifts = 25.16 kg, rest home
  const plan = countPlan(flows, { 2025: 13.75 }, { 2025: { gift: 10, reserve: 2 } }, '2026-11-28');
  assert.deepEqual(plan, [
    { date: '2026-11-28', kind: 'home', amount_kg: -62.73, vintage: 2025 },
    { date: '2026-11-28', kind: 'gift', amount_kg: -25.16, vintage: 2025 },
    { date: '2026-11-28', kind: 'reserve', amount_kg: -5.03, vintage: 2025 },
  ]);
  const v = vintageFlows([{ date: '2025-11-02', kind: 'press', amount_kg: 105.5 }, ...plan]);
  assert.equal(v[0].reserve, 5.03);
  assert.equal(v[0].stock, 12.58);
});
