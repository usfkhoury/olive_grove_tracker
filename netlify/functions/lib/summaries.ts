// Ports of backend/app/summaries.py.
export const TANAKE_KG = 15.0;
export const OIL_DENSITY = TANAKE_KG / 16.0;

export function oilBalance(movements: { amount_kg: number }[]) {
  const bal = movements.reduce((a, m) => a + (m.amount_kg || 0), 0);
  return {
    balance_kg: Math.round(bal * 100) / 100,
    balance_tanake: Math.round((bal / TANAKE_KG) * 100) / 100,
    balance_liters: Math.round((bal / OIL_DENSITY) * 10) / 10,
  };
}

export function seasonSummaries(harvests: { date: string; olives_kg: number; oil_kg: number; tanake: number | null }[]) {
  const bucket = new Map<number, { year: number; olives_kg: number; oil_kg: number; tanake: number; sessions: number }>();
  for (const h of harvests) {
    const yr = parseInt((h.date || "").slice(0, 4), 10);
    if (!yr) continue;
    let s = bucket.get(yr);
    if (!s) {
      s = { year: yr, olives_kg: 0, oil_kg: 0, tanake: 0, sessions: 0 };
      bucket.set(yr, s);
    }
    s.olives_kg += h.olives_kg || 0;
    s.oil_kg += h.oil_kg || 0;
    s.tanake += h.tanake ?? 0;
    s.sessions += 1;
  }
  const out = [...bucket.values()].sort((a, b) => a.year - b.year).map((s) => {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const oil = r2(s.oil_kg);
    const olives = r2(s.olives_kg);
    return {
      year: s.year,
      olives_kg: olives,
      oil_kg: oil,
      tanake: r2(s.tanake),
      sessions: s.sessions,
      yield_pct: olives > 0 ? Math.round((oil / olives) * 1000) / 10 : null,
      ratio: oil > 0 ? Math.round((olives / oil) * 10) / 10 : null,
    };
  });
  return out;
}

export function monthInRange(month: number, start: number, end: number): boolean {
  if (start <= end) return start <= month && month <= end;
  return month >= start || month <= end;
}
