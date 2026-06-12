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
        x1={padX - 12}
        y1={y(avg)}
        x2={w - padX + 12}
        y2={y(avg)}
        stroke="#b4b2a9"
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      <line x1={4} y1={8} x2={26} y2={8} stroke="#b4b2a9" strokeWidth="1.5" strokeDasharray="4 3" />
      <text x={31} y={11} fontSize="9" fill="#7a776b">
        average {avg.toFixed(1)}:1 · lower is better
      </text>
      <polyline
        points={pts.map((s, i) => `${x(i)},${y(s.ratio)}`).join(' ')}
        fill="none"
        stroke="#639922"
        strokeWidth="2"
      />
      {pts.map((s, i) => (
        <g key={s.year}>
          <circle
            cx={x(i)}
            cy={y(s.ratio)}
            r="3.5"
            fill={s.ratio === best ? '#c9a227' : '#639922'}
          />
          <text
            x={x(i)}
            y={y(s.ratio) - 7}
            textAnchor="middle"
            fontSize="9"
            fill={s.ratio === best ? '#854F0B' : '#7a776b'}
          >
            {s.ratio}:1
          </text>
          <text x={x(i)} y={h - 6} textAnchor="middle" fontSize="9" fill="#7a776b">
            {s.year}
          </text>
        </g>
      ))}
    </svg>
  );
}
