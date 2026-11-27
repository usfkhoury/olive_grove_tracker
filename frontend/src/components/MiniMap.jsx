import { Link } from 'react-router-dom';

// Whole grove as tiny dots (terrace 1 on top); current tree highlighted; tap to jump.
export default function MiniMap({ trees, currentId }) {
  const active = trees.filter((t) => t.status === 'active' && t.row && t.col);
  if (!active.length) return null;
  const cols = Math.max(...active.map((t) => t.col));
  return (
    <div className="mini-map" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {active.map((t) => (
        <Link key={t.id} to={`/trees/${t.id}`} title={t.label} aria-label={t.label}
          className={t.id === currentId ? 'on' : ''} style={{ gridRow: t.row, gridColumn: t.col }} />
      ))}
    </div>
  );
}
