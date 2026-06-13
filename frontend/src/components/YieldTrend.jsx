// Olives-to-oil ratio per season as a line against the all-time average.
// Lower = better (fewer kg of olives needed per kg of oil).
export default function YieldTrend({ seasons }) {
  const pts = seasons.filter((s) => s.ratio != null);
  if (pts.length < 2) return null;

  const w = 330;
  const h = 104;
  const padX = 26;
  const padTop = 26;
  const padBottom = 24;

  const ys = pts.map((s) => s.ratio);
  const avg = ys.reduce((a, b) => a + b, 0) / ys.length;
  const lo = Math.min(...ys, avg);
  const hi = Math.max(...ys, avg);
  const span = hi - lo || 1;
  const best = Math.min(...ys);

  const x = (i) => padX + (i * (w - 2 * padX)) / (pts.length - 1);
  const y = (v) => padTop + (1 - (v - lo) / span) * (h - padTop - padBottom);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      role="img"
      aria-label="Kg of olives per kg of oil per season vs average, lower is better"
    >
      <line
        className="chart-avg"
        x1={padX - 12}
        y1={y(avg)}
        x2={w - padX + 12}
        y2={y(avg)}
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      <line className="chart-avg" x1={4} y1={8} x2={26} y2={8} strokeWidth="1.5" strokeDasharray="4 3" />
      <text className="chart-axis" x={31} y={11} fontSize="9">
        average {avg.toFixed(1)}:1 · lower is better
      </text>
      <polyline
        className="chart-line"
        points={pts.map((s, i) => `${x(i)},${y(s.ratio)}`).join(' ')}
        fill="none"
        strokeWidth="2"
      />
      {pts.map((s, i) => (
        <g key={s.year}>
          <circle
            className={`chart-dot ${s.ratio === best ? 'best' : ''}`}
            cx={x(i)}
            cy={y(s.ratio)}
            r="3.5"
          />
          <text
            className={s.ratio === best ? 'chart-label best' : 'chart-axis'}
            x={x(i)}
            y={y(s.ratio) - 7}
            textAnchor="middle"
            fontSize="9"
          >
            {s.ratio}:1
          </text>
          <text className="chart-axis" x={x(i)} y={h - 6} textAnchor="middle" fontSize="9">
            {s.year}
          </text>
        </g>
      ))}
    </svg>
  );
}
