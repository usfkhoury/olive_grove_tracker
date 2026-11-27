// All seasons at a glance, two panels sharing the year axis:
//   top    — olives kg (light bar) and oil kg (dark bar) side by side, labelled
//   bottom — ratio x:1 (kg olives per kg oil) with the all-years average
// Tapping a year calls onSelect(year). `seasons` is oldest first.
const W = 340;
const PAD_L = 8, PAD_R = 8;
const BAR_TOP = 18, BAR_H = 130;       // bar panel
const YEAR_Y = BAR_TOP + BAR_H + 15;   // year labels
const R_TOP = YEAR_Y + 28, R_H = 70;   // ratio panel
const H = R_TOP + R_H + 16;

export default function HarvestChart({ seasons, selected, onSelect }) {
  if (!seasons.length) return <p className="empty">No harvests yet.</p>;

  const cw = (W - PAD_L - PAD_R) / seasons.length;
  const cx = (i) => PAD_L + i * cw + cw / 2;
  const maxKg = Math.max(...seasons.map((s) => s.olives_kg)) || 1;
  const yKg = (v) => BAR_TOP + BAR_H - (v / maxKg) * BAR_H;
  const bw = Math.min(18, cw * 0.36);

  const ratios = seasons.map((s) => s.ratio).filter((r) => r != null);
  const avg = ratios.reduce((a, b) => a + b, 0) / (ratios.length || 1);
  const rLo = Math.min(...ratios, avg);
  const rHi = Math.max(...ratios, avg);
  const yR = (v) => R_TOP + 14 + (1 - (v - rLo) / (rHi - rLo || 1)) * (R_H - 30);
  const best = Math.min(...ratios);
  const pts = seasons.map((s, i) => (s.ratio == null ? null : `${cx(i)},${yR(s.ratio)}`)).filter(Boolean);

  return (
    <div className="harvest-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Olives, oil and ratio per season">
        <text x={PAD_L} y={10} className="hc-title">Olives &amp; oil (kg)</text>

        {seasons.map((s, i) => {
          const on = s.year === selected;
          const x = cx(i);
          return (
            <g key={s.year} className="hc-col" onClick={() => onSelect(s.year)}>
              <rect x={PAD_L + i * cw + 1} y={BAR_TOP - 4} width={cw - 2} height={R_TOP + R_H - BAR_TOP + 8}
                rx="8" className={on ? 'hc-sel' : 'hc-hit'} />
              <rect x={x - bw - 1} y={yKg(s.olives_kg)} width={bw} height={BAR_TOP + BAR_H - yKg(s.olives_kg)}
                rx="3" className="hc-olives" />
              <rect x={x + 1} y={yKg(s.oil_kg)} width={bw} height={BAR_TOP + BAR_H - yKg(s.oil_kg)}
                rx="3" className="hc-oil" />
              <text x={x - bw / 2 - 1} y={yKg(s.olives_kg) - 3} className="hc-val">{Math.round(s.olives_kg)}</text>
              <text x={x + bw / 2 + 1} y={yKg(s.oil_kg) - 3} className="hc-val hc-val-oil">{Math.round(s.oil_kg)}</text>
              <text x={x} y={YEAR_Y} className={`hc-year ${on ? 'on' : ''}`}>{s.year}</text>
            </g>
          );
        })}
        <line x1={PAD_L} x2={W - PAD_R} y1={BAR_TOP + BAR_H} y2={BAR_TOP + BAR_H} className="hc-axis" />

        <text x={PAD_L} y={R_TOP - 6} className="hc-title">
          Ratio — kg olives per 1 kg oil (lower = more oil) · <tspan className="hc-avg-label">- - avg {avg.toFixed(1)}</tspan>
        </text>
        <line x1={PAD_L} x2={W - PAD_R} y1={yR(avg)} y2={yR(avg)} className="hc-avg" />
        <polyline points={pts.join(' ')} className="hc-line" />
        {seasons.map((s, i) => s.ratio != null && (
          <g key={`r${s.year}`} style={{ pointerEvents: 'none' }}>
            <circle cx={cx(i)} cy={yR(s.ratio)} r={s.ratio === best ? 4.5 : 3.5}
              className={s.ratio === best ? 'hc-dot best' : 'hc-dot'} />
            <text x={cx(i)} y={yR(s.ratio) + (s.ratio === best ? 16 : -9)} className="hc-rval">
              {s.ratio}
            </text>
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        <span><i className="hc-olives-key" />olives</span>
        <span><i className="hc-oil-key" />oil</span>
        <span><i className="hc-best-key" />best ratio</span>
        <span style={{ marginLeft: 'auto' }}>tap a year to jump to it</span>
      </div>
    </div>
  );
}
