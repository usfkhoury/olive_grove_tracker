import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { fmtDate } from '../api.js';
import Info from './Info.jsx';

// Per-season observations for one tree (Notion "Tree checks" DB), read-only:
// press, sacks, ripeness, pruning and fruit size are entered in Trees → Sheet.
// Only the season's notes are edited here (the Sheet has no notes column).
export default function SeasonChecks({ treeId, isOwner }) {
  const [checks, setChecks] = useState([]);
  const [editing, setEditing] = useState(null); // check id whose notes are open
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(
    () => api.get(`/checks?tree_id=${treeId}`).then(setChecks).catch((e) => setError(e.message)),
    [treeId],
  );
  useEffect(() => { reload(); }, [reload]);

  const saveNotes = async (c) => {
    setError('');
    setSaving(true);
    try {
      await api.put(`/checks/${c.id}`, {
        tree_id: c.tree_id, season: c.season, press_id: c.press_id, ripeness: c.ripeness,
        sacks: c.sacks, pruning_planned: c.pruning_planned, fruit_size: c.fruit_size, notes,
      });
      setEditing(null);
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h2>Season checks</h2>
      {error && <p className="error">{error}</p>}
      {checks.length === 0 && (
        <div className="card">
          <p className="empty">
            No season checks for this tree yet — fill them in <Link to="/trees?view=sheet">Trees → Sheet</Link>.
          </p>
        </div>
      )}
      {checks.map((c) => (
        <div className="card" key={c.id}>
          <div className="season-head" style={{ cursor: 'default' }}>
            <span>
              {c.season}
              {c.press_date && <span className="season-sub"> · press {fmtDate(c.press_date)}</span>}
            </span>
            <Link className="season-sub" to={`/trees?view=sheet&season=${c.season}`}>edit in Sheet →</Link>
          </div>
          <div className="tile-grid">
            <div className="stat">
              <div className="value">{c.ripeness ?? '—'}</div>
              <div className="label">Ripeness /7 <Info term="ripeness" /></div>
            </div>
            <div className="stat">
              <div className="value">{c.sacks ?? '—'}</div>
              <div className="label">Sacks <Info term="sacks" /></div>
            </div>
            <div className="stat">
              <div className="value">{c.pruning_planned || '—'}</div>
              <div className="label">Pruning</div>
            </div>
          </div>
          {c.fruit_size && <span className="chip">Fruit: {c.fruit_size}</span>}
          {editing === c.id ? (
            <div className="panel" style={{ marginTop: 8 }}>
              <label className="field">
                Notes for {c.season}
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <button disabled={saving} onClick={() => saveNotes(c)}>{saving ? 'Saving…' : 'Save notes'}</button>{' '}
              <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          ) : (
            <>
              {c.notes && (
                <div className="sub" style={{ whiteSpace: 'pre-line', marginTop: 8, fontSize: '0.85rem' }}>
                  {c.notes}
                </div>
              )}
              {isOwner && (
                <button className="secondary small" style={{ marginTop: 8 }}
                  onClick={() => { setNotes(c.notes || ''); setEditing(c.id); }}>
                  {c.notes ? 'Edit notes' : 'Add notes'}
                </button>
              )}
            </>
          )}
        </div>
      ))}
    </>
  );
}
