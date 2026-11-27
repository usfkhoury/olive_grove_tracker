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

// Oil left per pressing year, oldest first (see vintageFlows for the rules).
export function stockByVintage(movements) {
  return vintageFlows(movements).filter((r) => r.stock > 0.05)
    .map((r) => ({ year: r.year, kg: r.stock })).sort((a, b) => a.year - b.year);
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

// Per pressing year, where its oil went (kg). A movement tagged with a
// vintage (from a stock count) applies to that year's oil; untagged outflows
// drain the oldest oil first. For every year:
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
      const l = lot(m.kind !== 'press' && m.vintage ? m.vintage : year);
      if (m.kind === 'press') l.pressed += m.amount_kg; else l.added += m.amount_kg;
      l.stock += m.amount_kg;
      continue;
    }
    const key = m.kind === 'adjustment' ? 'lost' : m.kind;
    let need = -m.amount_kg;
    const order = [...lots.values()].sort((a, b) => a.year - b.year);
    if (m.vintage && lots.has(m.vintage)) order.unshift(lots.get(m.vintage)); // its own year first
    for (const l of order) {
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

// Stock count per vintage → ledger entries. `counted` = { year: litres };
// `reason` = what an unexplained shortfall was: 'home' | 'gift' | 'adjustment'
// (lost). A surplus is always a + adjustment. Years within 0.05 kg are skipped.
export function countPlan(flows, counted, reason, date) {
  const out = [];
  for (const [y, litres] of Object.entries(counted)) {
    const year = Number(y);
    const ledger = flows.find((r) => r.year === year)?.stock || 0;
    const diff = r2(Number(litres) * KG_PER_L - ledger);
    if (Math.abs(diff) < 0.05) continue;
    out.push({ date, kind: diff < 0 ? reason : 'adjustment', amount_kg: diff, vintage: year });
  }
  return out;
}
