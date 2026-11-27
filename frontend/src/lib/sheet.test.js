import test from 'node:test';
import assert from 'node:assert/strict';
import { pressSackStats, heat } from './sheet.js';

test('pressSackStats: kg olives per sack per press', () => {
  const checks = [{ press_id: 'p1', sacks: 4 }, { press_id: 'p1', sacks: 6 }, { press_id: 'p2', sacks: null }, { press_id: null, sacks: 3 }];
  const harvests = [{ id: 'p1', olives_kg: 250, oil_kg: 45 }, { id: 'p2', olives_kg: 100, oil_kg: 20 }];
  const s = pressSackStats(checks, harvests);
  assert.deepEqual(s.get('p1'), { sacks: 10, kgPerSack: 25, oilPerSack: 4.5 });
  assert.equal(s.has('p2'), false);
});

test('heat maps values to 0..1; pruning by order', () => {
  assert.equal(heat('sacks', 5, { min: 0, max: 10 }), 0.5);
  assert.equal(heat('sacks', null, { min: 0, max: 10 }), null);
  assert.equal(heat('sacks', 3, { min: 3, max: 3 }), 1);
  assert.equal(heat('pruning_planned', 'Heavy'), 1);
  assert.equal(heat('pruning_planned', 'Skip'), 0);
});

import { pressPalette, missingFields, PRESS_COLORS } from './sheet.js';

test('pressPalette: one colour per press date, in date order', () => {
  const p = pressPalette([{ id: 'b', date: '2026-11-15' }, { id: 'a', date: '2026-10-25' }]);
  assert.deepEqual(p, [{ id: 'a', date: '2026-10-25', color: PRESS_COLORS[0] }, { id: 'b', date: '2026-11-15', color: PRESS_COLORS[1] }]);
});
test('missingFields lists unset sacks / ripeness / pruning', () => {
  assert.deepEqual(missingFields({ sacks: null, ripeness: 2, pruning_planned: '' }), ['sacks', 'pruning']);
  assert.deepEqual(missingFields(undefined), ['check']);
  assert.deepEqual(missingFields({ sacks: 3, ripeness: 0, pruning_planned: 'Skip' }), []);
});
test('heat: canopy density by option order', () => {
  assert.equal(heat('canopy_density', 'Low'), 0);
  assert.equal(heat('canopy_density', 'Very high'), 1);
});
