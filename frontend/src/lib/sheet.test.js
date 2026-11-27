import test from 'node:test';
import assert from 'node:assert/strict';
import { pressSackStats, mapColor, mapLegend, pressPalette, PRESS_COLORS } from './sheet.js';

test('pressSackStats: kg olives per sack per press', () => {
  const checks = [{ press_id: 'p1', sacks: 4 }, { press_id: 'p1', sacks: 6 }, { press_id: 'p2', sacks: null }, { press_id: null, sacks: 3 }];
  const harvests = [{ id: 'p1', olives_kg: 250, oil_kg: 45 }, { id: 'p2', olives_kg: 100, oil_kg: 20 }];
  const s = pressSackStats(checks, harvests);
  assert.deepEqual(s.get('p1'), { sacks: 10, kgPerSack: 25, oilPerSack: 4.5 });
  assert.equal(s.has('p2'), false);
});

test('mapColor ripeness: buckets follow the fruit colour', () => {
  const name = (v) => mapColor('ripeness', v).name;
  assert.equal(name(0), 'green');
  assert.equal(name(1), 'green');
  assert.equal(name(1.5), 'yellow-green');
  assert.equal(name(2), 'yellow-green');
  assert.equal(name(2.5), 'red-purple');
  assert.equal(name(4), 'red-purple');
  assert.equal(name(4.5), 'dark purple');
  assert.equal(name(6), 'dark purple');
  assert.equal(name(7), 'black');
  assert.equal(mapColor('ripeness', 4.5).label, '4.5');
});

test('mapColor pruning: one colour per option', () => {
  assert.deepEqual(['Skip', 'Light', 'Medium', 'Heavy'].map((v) => mapColor('pruning_planned', v).name),
    ['grey', 'yellow', 'orange', 'red']);
  assert.equal(mapColor('pruning_planned', 'Heavy').label, 'H');
});

test('mapColor sacks: up to 4 distinct values → one colour each', () => {
  const r = { values: [1, 1, 3, 2] };
  assert.equal(mapColor('sacks', 1, r).step, 0);
  assert.equal(mapColor('sacks', 3, r).step, 3);
  assert.equal(mapColor('sacks', 1, { values: [1, 1, 1] }).step, 3); // single value → darkest
  assert.equal(mapColor('sacks', 2, r).label, '2');
});
test('mapColor sacks: more values → 4 whole-number ranges', () => {
  const r = { values: [1, 2, 3, 4, 5, 6, 7, 8] };
  assert.equal(mapColor('sacks', 1, r).step, 0);
  assert.equal(mapColor('sacks', 8, r).step, 3);
});

test('mapColor: no value → null', () => {
  assert.equal(mapColor('ripeness', null), null);
  assert.equal(mapColor('pruning_planned', ''), null);
  assert.equal(mapColor('sacks', undefined, { values: [1] }), null);
});

test('mapLegend lists one swatch per bucket', () => {
  assert.equal(mapLegend('ripeness').length, 5);
  assert.equal(mapLegend('pruning_planned')[3].text, 'Heavy');
  assert.deepEqual(mapLegend('sacks', { values: [1, 1, 1] }).map((l) => l.text), ['1']);
  assert.deepEqual(mapLegend('sacks', { values: [1, 3, 2] }).map((l) => l.text), ['1', '2', '3']);
  assert.deepEqual(mapLegend('sacks', { values: [1, 2, 3, 4, 5, 6, 7, 8] }).map((l) => l.text), ['1–2', '3–4', '5–6', '7–8']);
  assert.deepEqual(mapLegend('sacks', { values: [] }), []);
});

test('pressPalette: one colour per press date, in date order', () => {
  const p = pressPalette([{ id: 'b', date: '2026-11-15' }, { id: 'a', date: '2026-10-25' }]);
  assert.deepEqual(p, [{ id: 'a', date: '2026-10-25', color: PRESS_COLORS[0] }, { id: 'b', date: '2026-11-15', color: PRESS_COLORS[1] }]);
});

import { treeRanges } from './sheet.js';
test('treeRanges compresses consecutive tree labels', () => {
  assert.equal(treeRanges(['T3', 'T1', 'T2', 'T5', 'T20', 'T21', 'T22']), 'T1–T3, T5, T20–T22');
  assert.equal(treeRanges(['T7']), 'T7');
  assert.equal(treeRanges(['T1', 'T2']), 'T1, T2');
  assert.equal(treeRanges([]), '');
  assert.equal(treeRanges(['Fig', 'T1']), 'T1, Fig');
});
