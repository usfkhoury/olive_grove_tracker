// Horizontal season bars: bar length = olives picked, the dark segment
// inside it = oil pressed out of them, so the fill ratio IS the yield.
export default function SeasonBars({ seasons }) {
  if (!seasons?.length) return null;

  const max = Math.max(...seasons.map((s) => s.olives_kg));
  const bestYield = Math.max(...seasons.map((s) => s.yield_pct ?? 0));
  const rows = [...seasons].sort((a, b) => b.year - a.year);

  return (
    <div>
      {rows.map((s) => (
        <div className="bar-row" key={s.year}>
          <span className="bar-year">{s.year}</span>
          <div className="bar-track">
            <div
              className="bar-olives"
              style={{ width: `${(s.olives_kg / max) * 100}%` }}
            />
            <div
              className="bar-oil"
              style={{ width: `${(s.oil_kg / max) * 100}%` }}
            />
          </div>
          <span className="bar-label">
            {s.ratio}:1{s.yield_pct === bestYield ? ' ★' : ''}
          </span>
        </div>
      ))}
      <div className="bar-legend">
        bar = olives picked · dark = oil pressed · x:1 = kg olives per kg oil · ★ best ratio
      </div>
    </div>
  );
}
