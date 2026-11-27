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

// Grove-map colours: discrete, clearly different buckets (not one faded hue),
// each with a short label printed on the dot. null = no value entered.
// fg = text colour that stays readable on that background.
const RIPENESS = [ // Jaén scale, coloured like the fruit itself
  { max: 1.5, name: 'green', bg: '#4f7a28', fg: '#fff', text: '0–1 green' },
  { max: 2.5, name: 'yellow-green', bg: '#b9c23a', fg: '#2b2b23', text: '1.5–2 yellow-green' },
  { max: 4.5, name: 'red-purple', bg: '#b0365c', fg: '#fff', text: '2.5–4 red-purple' },
  { max: 6.5, name: 'dark purple', bg: '#5a2463', fg: '#fff', text: '4.5–6 dark purple' },
  { max: Infinity, name: 'black', bg: '#1c1a1d', fg: '#fff', text: '7 black' },
];
const PRUNING = {
  Skip: { name: 'grey', bg: '#a3a093', fg: '#fff', label: 'S' },
  Light: { name: 'yellow', bg: '#e6c447', fg: '#2b2b23', label: 'L' },
  Medium: { name: 'orange', bg: '#e0862a', fg: '#fff', label: 'M' },
  Heavy: { name: 'red', bg: '#c0392b', fg: '#fff', label: 'H' },
};
const SACKS = [
  { bg: '#dfe5c6', fg: '#2b2b23' }, { bg: '#a9ba72', fg: '#2b2b23' },
  { bg: '#6b8a33', fg: '#fff' }, { bg: '#33421a', fg: '#fff' },
];
const sackStep = (v, { min, max }) =>
  (max === min ? 3 : Math.min(3, Math.floor(((v - min) / (max - min)) * 4)));
const fmt = (v) => String(Math.round(v * 10) / 10);

export function mapColor(field, value, range) {
  if (value == null || value === '') return null;
  if (field === 'ripeness') {
    const b = RIPENESS.find((x) => value < x.max);
    return { name: b.name, bg: b.bg, fg: b.fg, label: fmt(value) };
  }
  if (field === 'pruning_planned') {
    const b = PRUNING[value];
    return b ? { ...b } : null;
  }
  if (field === 'sacks') {
    const step = sackStep(Number(value), range);
    return { step, ...SACKS[step], label: fmt(value) };
  }
  return null;
}

// Swatches for the map legend, in order.
export function mapLegend(field, range) {
  if (field === 'ripeness') return RIPENESS.map((b) => ({ bg: b.bg, text: b.text }));
  if (field === 'pruning_planned') return CHECK_OPTIONS.pruning_planned.map((o) => ({ bg: PRUNING[o].bg, text: o }));
  if (field === 'sacks') {
    const { min, max } = range;
    const w = (max - min) / 4;
    return SACKS.map((b, i) => ({
      bg: b.bg,
      text: max === min ? fmt(min) : `${fmt(min + i * w)}–${fmt(i === 3 ? max : min + (i + 1) * w)}`,
    }));
  }
  return [];
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

// "T1–T13, T20" from tree labels: runs of 3+ consecutive numbers collapse.
// Labels that aren't T<number> are listed after, as-is.
export function treeRanges(labels) {
  const nums = labels.map((l) => /^T(\d+)$/.exec(l)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);
  const other = labels.filter((l) => !/^T\d+$/.test(l));
  const parts = [];
  for (let i = 0; i < nums.length;) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j += 1;
    if (j - i >= 2) parts.push(`T${nums[i]}–T${nums[j]}`);
    else for (let k = i; k <= j; k += 1) parts.push(`T${nums[k]}`);
    i = j + 1;
  }
  return [...parts, ...other].join(', ');
}
