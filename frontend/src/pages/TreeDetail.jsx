import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import api, { fmtDate } from '../api.js';
import useSaveState from '../useSaveState.js';
import MiniMap from '../components/MiniMap.jsx';
import SeasonChecks from '../components/SeasonChecks.jsx';

export default function TreeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tree, setTree] = useState(null);
  const [all, setAll] = useState([]);
  const [editing, setEditing] = useState(false);
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState('');
  const { isOwner } = useAuth();
  const { saving, saved, run } = useSaveState();

  useEffect(() => {
    setEditing(false);
    api.get(`/trees/${id}`).then(setTree).catch((e) => setError(e.message));
    api.get(`/activities?tree_id=${id}`).then(setActivities).catch(() => {});
  }, [id]);
  useEffect(() => {
    api.get('/trees').then(setAll).catch(() => {});
  }, []);

  if (error && !tree) return <p className="error">{error}</p>;
  if (!tree) return <p className="empty">Loading…</p>;

  // Walk the grove in map order (terrace, then position).
  const walk = all.filter((t) => t.status === 'active');
  const idx = walk.findIndex((t) => t.id === id);
  const prev = idx > 0 ? walk[idx - 1] : null;
  const next = idx >= 0 && idx < walk.length - 1 ? walk[idx + 1] : null;
  const mapUrl = `/trees?focus=${id}`;

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await run(async () => {
        const updated = await api.put(`/trees/${id}`, {
          ...tree,
          row: Number(tree.row),
          col: Number(tree.col),
          planted_year: tree.planted_year ? Number(tree.planted_year) : null,
        });
        setTree(updated);
        setEditing(false);
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete tree ${tree.label} and unlink its history?`)) return;
    try {
      await api.del(`/trees/${id}`);
      navigate('/trees');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="tree-nav">
        {prev
          ? <Link className="tree-step" to={`/trees/${prev.id}`} aria-label={`Previous tree ${prev.label}`}>← {prev.label}</Link>
          : <span className="tree-step off" aria-hidden="true">←</span>}
        <h1>🌳 {tree.label}</h1>
        {next
          ? <Link className="tree-step" to={`/trees/${next.id}`} aria-label={`Next tree ${next.label}`}>{next.label} →</Link>
          : <span className="tree-step off" aria-hidden="true">→</span>}
      </div>
      <MiniMap trees={all} current={tree} mapUrl={mapUrl} />
      {error && <p className="error">{error}</p>}
      {saved && <p className="saved">Saved ✓</p>}

      <div className="card">
        <div className="sub">
          {[tree.variety || 'Variety not set',
            tree.planted_year && `planted ${tree.planted_year}`,
            tree.status !== 'active' && 'removed'].filter(Boolean).join(' · ')}
        </div>
        {tree.notes && <div style={{ whiteSpace: 'pre-line', marginTop: 6 }}>{tree.notes}</div>}
        {isOwner && !editing && (
          <button className="secondary small" style={{ marginTop: 8 }} onClick={() => setEditing(true)}>Edit tree</button>
        )}
      </div>

      {isOwner && editing && (
        <form className="panel card" onSubmit={save}>
          <div className="row2">
            <label className="field">
              Label
              <input value={tree.label}
                onChange={(e) => setTree({ ...tree, label: e.target.value })} />
            </label>
            <label className="field">
              Status
              <select value={tree.status}
                onChange={(e) => setTree({ ...tree, status: e.target.value })}>
                <option value="active">active</option>
                <option value="removed">removed</option>
              </select>
            </label>
          </div>
          <div className="row2">
            <label className="field">
              Row (terrace)
              <input type="number" min="1" value={tree.row}
                onChange={(e) => setTree({ ...tree, row: e.target.value })} />
            </label>
            <label className="field">
              Column (position)
              <input type="number" min="1" value={tree.col}
                onChange={(e) => setTree({ ...tree, col: e.target.value })} />
            </label>
          </div>
          <div className="row2">
            <label className="field">
              Variety
              <input value={tree.variety}
                onChange={(e) => setTree({ ...tree, variety: e.target.value })} />
            </label>
            <label className="field">
              Planted year
              <input type="number" value={tree.planted_year ?? ''}
                onChange={(e) => setTree({ ...tree, planted_year: e.target.value })} />
            </label>
          </div>
          <label className="field">
            Notes (health, grafts, anything)
            <textarea value={tree.notes}
              onChange={(e) => setTree({ ...tree, notes: e.target.value })} />
          </label>
          <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>{' '}
          <button type="button" className="secondary" onClick={() => setEditing(false)}>Cancel</button>{' '}
          <button type="button" className="danger" onClick={remove}>Delete tree</button>
        </form>
      )}

      <SeasonChecks treeId={id} isOwner={isOwner} />

      <h2>History for this tree</h2>
      <div className="card">
        {activities.length === 0 && (
          <p className="empty">
            Nothing logged for this tree yet. Log work from the{' '}
            <Link to="/calendar">Calendar</Link> or the grove map.
          </p>
        )}
        {activities.map((a) => (
          <div className="item" key={a.id}>
            <div>
              <div className="title">{a.label}</div>
              <div className="sub">
                {fmtDate(a.date)} — {a.trees.length === 0 ? 'whole grove' : a.trees.map((t) => t.label).join(', ')}
              </div>
              {a.notes && (
                <div className="sub" style={{ whiteSpace: 'pre-line', marginTop: 4 }}>
                  {a.notes}
                </div>
              )}
            </div>
          </div>
        ))}
        <div style={{ marginTop: 8 }}><Link to={`/activities?tree=${id}&year=`}>All of {tree.label} in the log →</Link></div>
      </div>
    </>
  );
}
