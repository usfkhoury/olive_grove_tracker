import test from 'node:test';
import assert from 'node:assert/strict';
import { sprayWindows } from './weather.js';

// 48 hourly points (1–2 Apr 2026); precip/wind as functions of the hour index.
const hours = (precip, wind, temp = 20) => {
  const time = [], p = [], w = [], t = [];
  for (let h = 0; h < 48; h++) {
    time.push(`2026-04-0${1 + Math.floor(h / 24)}T${String(h % 24).padStart(2, '0')}:00`);
    p.push(precip(h)); w.push(wind(h)); t.push(typeof temp === 'function' ? temp(h) : temp);
  }
  return { time, precipitation: p, wind_speed_10m: w, temperature_2m: t };
};

test('dry calm days → one daylight window per day (06:00–18:00)', () => {
  const r = sprayWindows(hours(() => 0, () => 5));
  assert.deepEqual(r, [
    { start: '2026-04-01T06:00', end: '2026-04-01T18:00' },
    { start: '2026-04-02T06:00', end: '2026-04-02T18:00' },
  ]);
});
test('rain within 6 h after an hour rules that hour out', () => {
  const r = sprayWindows(hours((h) => (h === 14 ? 2 : 0), () => 5));
  assert.deepEqual(r.slice(0, 2), [
    { start: '2026-04-01T06:00', end: '2026-04-01T08:00' }, // 08–14 have rain within 6 h
    { start: '2026-04-01T15:00', end: '2026-04-01T18:00' },
  ]);
});
test('windy day 1 → only day 2', () => {
  const r = sprayWindows(hours(() => 0, (h) => (h < 24 ? 25 : 5)));
  assert.ok(r.length === 1 && r[0].start.startsWith('2026-04-02'));
});
test('too hot midday splits the window; 1-hour runs are dropped', () => {
  const r = sprayWindows(hours(() => 0, () => 5, (h) => (h % 24 >= 11 && h % 24 <= 15 ? 32 : 20)));
  assert.deepEqual(r.slice(0, 2), [
    { start: '2026-04-01T06:00', end: '2026-04-01T11:00' },
    { start: '2026-04-01T16:00', end: '2026-04-01T18:00' },
  ]);
  const short = sprayWindows(hours((h) => (h % 24 === 8 || h % 24 >= 10 ? 1 : 0), () => 5));
  assert.deepEqual(short, []); // never 2 dry-ahead daylight hours in a row
});
