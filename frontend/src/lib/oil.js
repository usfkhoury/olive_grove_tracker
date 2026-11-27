import { KG_PER_L, TANAKE_KG, TANAKE_L } from '../constants.js';

const r2 = (n) => Math.round(n * 100) / 100;
export const BOTTLE_SIZES = [1, 2.75, 3]; // litres — the glass bottles oil is stored in

export const toTanake = (kg) => Math.round((kg / TANAKE_KG) * 10) / 10;
export const toLiters = (kg) => Math.round(kg / KG_PER_L);
export const litersToKg = (l) => r2(l * KG_PER_L);

// counts: { 1: n, 2.75: n, 3: n } (strings ok); tanake = full tins not yet bottled.
export function bottlesToLiters(counts, tanake = 0) {
  const bottled = BOTTLE_SIZES.reduce((a, size) => a + size * (Number(counts[size]) || 0), 0);
  return r2(bottled + (Number(tanake) || 0) * TANAKE_L);
}

// kg to record so the ledger matches a physical count (in litres).
export const reconcileAmount = (countLiters, balanceKg) => r2(countLiters * KG_PER_L - balanceKg);

// Oil left per harvest year, oldest used first. Presses and positive
// adjustments add to their date's year; anything negative drains the oldest year.
export function stockByVintage(movements) {
  const lots = [];
  for (const m of [...movements].sort((a, b) => a.date.localeCompare(b.date))) {
    if (m.amount_kg > 0) {
      const year = Number(m.date.slice(0, 4));
      const lot = lots.find((l) => l.year === year);
      if (lot) lot.kg += m.amount_kg;
      else { lots.push({ year, kg: m.amount_kg }); lots.sort((a, b) => a.year - b.year); }
    } else {
      let need = -m.amount_kg;
      for (const l of lots) {
        const take = Math.min(l.kg, need);
        l.kg -= take; need -= take;
        if (need <= 0) break;
      }
    }
  }
  return lots.filter((l) => l.kg > 0.05).map((l) => ({ year: l.year, kg: r2(l.kg) }));
}

// Per calendar year: kg pressed and kg per outflow kind (negative numbers).
export function flowBySeason(movements) {
  const by = new Map();
  for (const m of movements) {
    const year = Number(m.date.slice(0, 4));
    if (!by.has(year)) by.set(year, { year, pressed: 0, home: 0, gift: 0, sale: 0, adjustment: 0 });
    const row = by.get(year);
    const key = m.kind === 'press' ? 'pressed' : m.kind;
    if (key in row) row[key] = r2(row[key] + m.amount_kg);
  }
  return [...by.values()].sort((a, b) => b.year - a.year);
}

// Date of the most recent oil that left the stock (null if never logged).
export function lastOutflow(movements) {
  const out = movements.filter((m) => m.amount_kg < 0).map((m) => m.date).sort();
  return out.length ? out[out.length - 1] : null;
}
