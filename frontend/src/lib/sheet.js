import { CHECK_OPTIONS } from '../constants.js';

// Per press: total sacks recorded and kg olives / kg oil per sack. Only
// meaningful once every tree in that press has its sacks entered.
export function pressSackStats(checks, harvests) {
  const sacks = new Map();
  for (const c of checks) {
    if (c.press_id && c.sacks != null) sacks.set(c.press_id, (sacks.get(c.press_id) || 0) + c.sacks);
  }
  const out = new Map();
  for (const h of harvests) {
    const n = sacks.get(h.id);
    if (n) out.set(h.id, { sacks: n, kgPerSack: Math.round((h.olives_kg / n) * 10) / 10, oilPerSack: Math.round((h.oil_kg / n) * 100) / 100 });
  }
  return out;
}

// 0..1 intensity for colouring the grove map; null = no data.
export function heat(field, value, range) {
  if (value == null || value === '') return null;
  if (field === 'pruning_planned' || field === 'canopy_density') {
    const opts = CHECK_OPTIONS[field];
    return opts.indexOf(value) / (opts.length - 1);
  }
  const { min, max } = range;
  return max === min ? 1 : (Number(value) - min) / (max - min);
}

// Fixed, colour-blind-safe-ish palette for up to 6 presses in a season.
export const PRESS_COLORS = ['#7a8c3f', '#3d6b8a', '#a0522d', '#8a5fa0', '#c9a227', '#5a5a5a'];
export function pressPalette(presses) {
  return [...presses].sort((a, b) => a.date.localeCompare(b.date))
    .map((h, i) => ({ id: h.id, date: h.date, color: PRESS_COLORS[i % PRESS_COLORS.length] }));
}

// Which season-check fields are still empty for a tree ('check' = no check row at all).
export function missingFields(check) {
  if (!check) return ['check'];
  const out = [];
  if (check.sacks == null) out.push('sacks');
  if (check.ripeness == null) out.push('ripeness');
  if (!check.pruning_planned) out.push('pruning');
  return out;
}
