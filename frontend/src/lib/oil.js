import { BOTTLE_L, KG_PER_L, TANAKE_KG, TANAKE_L } from '../constants.js';

const r2 = (n) => Math.round(n * 100) / 100;
export const BOTTLE_SIZES = [1, 2.75, 3]; // litres — the glass bottles oil is stored in (2.75 is standard)

export const toTanake = (kg) => Math.round((kg / TANAKE_KG) * 10) / 10;
export const toLiters = (kg) => Math.round(kg / KG_PER_L);
export const litersToKg = (l) => r2(l * KG_PER_L);

// counts: { 1: n, 2.75: n, 3: n } (strings ok); tanake = full 16 kg tins.
export function bottlesToLiters(counts, tanake = 0) {
  const bottled = BOTTLE_SIZES.reduce((a, size) => a + size * (Number(counts[size]) || 0), 0);
  return r2(bottled + (Number(tanake) || 0) * TANAKE_L);
}

// Cooking oil left per pressing year, oldest first (see vintageFlows).
export function stockByVintage(movements) {
  return vintageFlows(movements).filter((r) => r.stock > 0.05)
    .map((r) => ({ year: r.year, kg: r.stock })).sort((a, b) => a.year - b.year);
}

// Date of the most recent oil that left the stock (null if never logged).
export function lastOutflow(movements) {
  const out = movements.filter((m) => m.amount_kg < 0 && m.kind !== 'reserve').map((m) => m.date).sort();
  return out.length ? out[out.length - 1] : null;
}

// kg in the chosen display unit: 'L' litres (0.1), 'T' tanake (0.1),
// 'B' standard 2.75 L bottles (whole).
export function inUnit(kg, unit) {
  const l = kg / KG_PER_L;
  if (unit === 'T') return Math.round((kg / TANAKE_KG) * 10) / 10;
  if (unit === 'B') return Math.round(l / BOTTLE_L);
  return Math.round(l * 10) / 10;
}

// Per pressing year, where its oil went (kg). For every year:
//   pressed + added = home + gift + sale + lost + soap + reserve + stock
// stock = cooking oil left, reserve = set aside for soap (both still at home).
// A movement tagged with a vintage applies to that year's oil first; the rest
// (and untagged movements) drain the oldest oil. `reserve` moves cooking oil
// into the soap reserve of the same year; `soap` uses the reserve, then
// cooking oil. Newest year first.
export function vintageFlows(movements) {
  const lots = new Map();
  const lot = (year) => {
    if (!lots.has(year)) {
      lots.set(year, { year, pressed: 0, added: 0, home: 0, gift: 0, sale: 0, lost: 0, soap: 0, reserve: 0, stock: 0 });
    }
    return lots.get(year);
  };
  // Move up to `need` kg from field `from` to field `into`, preferred year first.
  const drain = (from, into, need, vintage) => {
    const order = [...lots.values()].sort((a, b) => a.year - b.year);
    if (vintage && lots.has(vintage)) order.unshift(lots.get(vintage));
    for (const l of order) {
      if (need <= 1e-9) break;
      const take = Math.min(l[from], need);
      if (take <= 0) continue;
      l[from] -= take; l[into] += take; need -= take;
    }
    return need;
  };
  for (const m of [...movements].sort((a, b) => a.date.localeCompare(b.date))) {
    const year = Number(m.date.slice(0, 4));
    if (m.amount_kg > 0) {
      const l = lot(m.kind !== 'press' && m.vintage ? m.vintage : year);
      if (m.kind === 'press') l.pressed += m.amount_kg; else l.added += m.amount_kg;
      l.stock += m.amount_kg;
      continue;
    }
    const need = -m.amount_kg;
    if (m.kind === 'reserve') drain('stock', 'reserve', need, m.vintage);
    else if (m.kind === 'soap') drain('stock', 'soap', drain('reserve', 'soap', need, m.vintage), m.vintage);
    else drain('stock', ['home', 'gift', 'sale'].includes(m.kind) ? m.kind : 'lost', need, m.vintage);
  }
  return [...lots.values()]
    .map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, k === 'year' ? v : r2(v)])))
    .sort((a, b) => b.year - a.year);
}

// Stock count → ledger entries. `counted` = { [year]: litres, reserve?: litres }.
// A year's shortfall is split per `split[year]` = { gift, reserve (moved to the
// soap reserve), adjustment (lost) }, in 2.75 L bottles, capped at the
// shortfall; the rest is home use. A surplus is a + adjustment. All tagged with the vintage. The soap
// reserve: less than the ledger = soap made; more = cooking oil moved into it.
// Differences under 0.05 kg are skipped.
export function countPlan(flows, counted, split, date) {
  const out = [];
  for (const [key, litres] of Object.entries(counted)) {
    const isReserve = key === 'reserve';
    const ledger = isReserve
      ? flows.reduce((a, r) => a + (r.reserve || 0), 0)
      : flows.find((r) => r.year === Number(key))?.stock || 0;
    const diff = r2(Number(litres) * KG_PER_L - ledger);
    if (Math.abs(diff) < 0.05) continue;
    if (isReserve) { out.push({ date, kind: diff < 0 ? 'soap' : 'reserve', amount_kg: -Math.abs(diff) }); continue; }
    const vintage = Number(key);
    if (diff > 0) { out.push({ date, kind: 'adjustment', amount_kg: diff, vintage }); continue; }
    let left = -diff;
    const parts = ['gift', 'reserve', 'adjustment'].map((kind) => {
      const kg = Math.min(left, r2((Number(split[key]?.[kind]) || 0) * BOTTLE_L * KG_PER_L));
      left = r2(left - kg);
      return { kind, kg };
    });
    for (const { kind, kg } of [{ kind: 'home', kg: left }, ...parts]) {
      if (kg >= 0.05) out.push({ date, kind, amount_kg: -r2(kg), vintage });
    }
  }
  return out;
}

// Amount picker value { 2.75: n, 1: n, 3: n, T: tins, L: loose litres } → litres.
export function amountLitres(v) {
  return r2(bottlesToLiters(v, v.T) + (Number(v.L) || 0));
}

// kg as display text in the chosen unit ('B' bottles, 'L' litres, 'T' tanake).
export function unitText(kg, unit) {
  const n = inUnit(kg, unit);
  if (unit === 'B') return `≈ ${n} bottle${n === 1 ? '' : 's'}`;
  return unit === 'T' ? `${n} tanake` : `${n} L`;
}
