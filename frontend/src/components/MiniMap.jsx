import { Link } from 'react-router-dom';

// Fixed grove features (same as the main map). Row = terrace, col = position.
const STAIRS = [{ row: 2, col: 15 }, { row: 3, col: 19 }];

// Compact grove locator for the tree page: fixed-size round dots laid out like
// the real grove (terrace 1 on top), the current tree in gold, tap to jump.
export default function MiniMap({ trees, current, mapUrl }) {
  const active = trees.filter((t) => t.status === 'active' && t.row && t.col);
  if (!active.length || !current) return null;
  const cols = Math.max(...active.map((t) => t.col), ...STAIRS.map((s) => s.col));
  return (
    <div className="card mini-card">
      <div className="mini-head">
        <span>Terrace {current.row} · position {current.col}</span>
        <Link to={mapUrl}>Full map →</Link>
      </div>
      <div className="mini-map" style={{ gridTemplateColumns: `repeat(${cols}, var(--mini))` }}>
        {STAIRS.map((s) => (
          <span key={`s${s.row}-${s.col}`} className="mini-stairs" aria-hidden="true"
            style={{ gridRow: s.row, gridColumn: s.col }} />
        ))}
        {active.map((t) => (
          <Link key={t.id} to={`/trees/${t.id}`} title={t.label} aria-label={t.label}
            aria-current={t.id === current.id ? 'page' : undefined}
            className={t.id === current.id ? 'on' : ''} style={{ gridRow: t.row, gridColumn: t.col }} />
        ))}
      </div>
    </div>
  );
}
