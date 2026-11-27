import { Link } from 'react-router-dom';
import { fmtDate } from '../api.js';

// Bottom sheet for a tapped tree: this season's numbers + Open / Log.
export default function TreeSheet({ tree, check, isOwner, onLog, onClose }) {
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="tree-sheet" role="dialog" aria-label={tree.label}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <b>🌳 {tree.label}</b>
          <span className="sub">terrace {tree.row} · pos {tree.col}</span>
        </div>
        <div className="tile-grid" style={{ margin: '8px 0' }}>
          {[['Ripeness', check?.ripeness], ['Sacks', check?.sacks], ['Pruning', check?.pruning_planned]].map(([l, v]) => (
            <div className="stat" key={l}><div className="value">{v ?? '—'}</div><div className="label">{l}</div></div>
          ))}
        </div>
        <div className="sub">
          {check?.press_date ? `Press ${fmtDate(check.press_date)}` : 'No press set'}
          {check?.canopy_density ? ` · density ${check.canopy_density}` : ''}
          {check?.fruit_size ? ` · fruit ${check.fruit_size}` : ''}
        </div>
        <div style={{ marginTop: 10 }}>
          <Link className="button-link" to={`/trees/${tree.id}`}>Open {tree.label} →</Link>{' '}
          {isOwner && <button className="secondary" onClick={onLog}>Log for this tree</button>}
        </div>
      </div>
    </>
  );
}
