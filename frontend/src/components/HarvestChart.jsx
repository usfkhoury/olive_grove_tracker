// One chart for every season: olives kg (pale bar), oil kg (dark bar inside),
// ratio x:1 (gold line, right axis). Tap a column to select its year.
// `seasons` comes from /api/harvests/seasons (oldest first).
const W = 300, H = 190, L = 32, R = 32, T = 14, B = 22;

export default function HarvestChart({ seasons, selected, onSelect }) {
  if (!seasons.length) return <p className="empty">No harvests yet.</p>;
  const maxKg = Math.ceil(Math.max(...seasons.map((s) => s.olives_kg)) / 100) * 100 || 100;
  const ratios = seasons.map((s) => s.ratio).filter((r) => r != null);
  const rLo = Math.floor(Math.min(...ratios) - 0.3);
  const rHi = Math.ceil(Math.max(...ratios) + 0.3);
  const cw = (W - L - R) / seasons.length;
  const yKg = (v) => T + (1 - v / maxKg) * (H - T - B);
  const yR = (v) => T + (1 - (v - rLo) / (rHi - rLo || 1)) * (H - T - B);
  const cx = (i) => L + i * cw + cw / 2;
  const kgTicks = [0, maxKg / 2, maxKg];
  const rTicks = [];
  for (let r = Math.ceil(rLo); r <= rHi; r += 1) rTicks.push(r);
  const pts = seasons.map((s, i) => (s.ratio == null ? null : `${cx(i)},${yR(s.ratio)}`)).filter(Boolean);

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Olives, oil and ratio per season">
        {kgTicks.map((v) => (
          <g key={`k${v}`}>
            <line x1={L} x2={W - R} y1={yKg(v)} y2={yKg(v)} stroke="var(--hairline)" />
            <text x={L - 4} y={yKg(v) + 3} fontSize="8.5" textAnchor="end" fill="var(--muted)">{v}</text>
          </g>
        ))}
        {rTicks.map((v) => (
          <text key={`r${v}`} x={W - R + 4} y={yR(v) + 3} fontSize="8.5" fill="var(--chip-gold-text)">{v}:1</text>
        ))}
        {seasons.map((s, i) => {
          const x0 = L + i * cw + cw * 0.15;
          const bw = cw * 0.7;
          const on = s.year === selected;
          return (
            <g key={s.year} onClick={() => onSelect(s.year)} style={{ cursor: 'pointer' }}>
              <rect x={L + i * cw} y={T} width={cw} height={H - T - B} fill={on ? 'var(--chip-gold-bg)' : 'transparent'} />
              <rect x={x0} y={yKg(s.olives_kg)} width={bw} height={yKg(0) - yKg(s.olives_kg)} rx="2" fill="var(--olive-pale)" stroke="var(--olive-light)" strokeWidth="0.5" />
              <rect x={x0 + bw * 0.2} y={yKg(s.oil_kg)} width={bw * 0.6} height={yKg(0) - yKg(s.oil_kg)} rx="2" fill="var(--olive-dark)" />
              <text x={cx(i)} y={H - 8} fontSize="9" textAnchor="middle" fill={on ? 'var(--text)' : 'var(--muted)'} fontWeight={on ? 700 : 400}>
                {String(s.year).slice(2)}'
              </text>
            </g>
          );
        })}
        <polyline fill="none" stroke="var(--gold)" strokeWidth="2" points={pts.join(' ')} />
        {seasons.map((s, i) => s.ratio != null && <circle key={`c${s.year}`} cx={cx(i)} cy={yR(s.ratio)} r="3" fill="var(--gold)" />)}
      </svg>
      <div className="chart-legend">
        <span><i style={{ background: 'var(--olive-pale)', border: '1px solid var(--olive-light)' }} />olives kg</span>
        <span><i style={{ background: 'var(--olive-dark)' }} />oil kg</span>
        <span><i style={{ background: 'var(--gold)' }} />ratio x:1 (right)</span>
      </div>
    </>
  );
}
