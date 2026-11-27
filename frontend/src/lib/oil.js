import { BOTTLE_L, KG_PER_L, TANAKE_KG, TANAKE_L } from '../constants.js';

const r2 = (n) => Math.round(n * 100) / 100;
export const BOTTLE_SIZES = [1, 2.75, 3]; // litres — the glass bottles oil is stored in (2.75 is standard)

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

// Date of the most recent oil that left the stock (null if never logged).
export function lastOutflow(movements) {
  const out = movements.filter((m) => m.amount_kg < 0).map((m) => m.date).sort();
  return out.length ? out[out.length - 1] : null;
}

// kg in the chosen display unit: 'L' litres (whole), 'T' tanake (0.1),
// 'B' standard 2.75 L bottles (whole).
export function inUnit(kg, unit) {
  const l = kg / KG_PER_L;
  if (unit === 'T') return Math.round((kg / TANAKE_KG) * 10) / 10;
  if (unit === 'B') return Math.round(l / BOTTLE_L);
  return Math.round(l);
}

// Per pressing year, where its oil went (kg). Outflows drain the oldest oil
// first (same rule as stockByVintage), so for every year:
//   pressed + added = home + gift + sale + lost + stock
// added/lost = positive/negative stock adjustments. Newest year first.
export function vintageFlows(movements) {
  const lots = new Map();
  const lot = (year) => {
    if (!lots.has(year)) lots.set(year, { year, pressed: 0, added: 0, home: 0, gift: 0, sale: 0, lost: 0, stock: 0 });
    return lots.get(year);
  };
  for (const m of [...movements].sort((a, b) => a.date.localeCompare(b.date))) {
    const year = Number(m.date.slice(0, 4));
    if (m.amount_kg > 0) {
      const l = lot(year);
      if (m.kind === 'press') l.pressed += m.amount_kg; else l.added += m.amount_kg;
      l.stock += m.amount_kg;
      continue;
    }
    const key = m.kind === 'adjustment' ? 'lost' : m.kind;
    let need = -m.amount_kg;
    for (const l of [...lots.values()].sort((a, b) => a.year - b.year)) {
      if (need <= 0) break;
      const take = Math.min(l.stock, need);
      if (take <= 0) continue;
      l.stock -= take; l[key] += take; need -= take;
    }
  }
  return [...lots.values()]
    .map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, k === 'year' ? v : r2(v)])))
    .sort((a, b) => b.year - a.year);
}
