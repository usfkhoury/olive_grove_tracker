import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { fmtDate } from '../api.js';

export default function TreeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tree, setTree] = useState(null);
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get(`/trees/${id}`).then(setTree).catch((e) => setError(e.message));
    api.get(`/activities?tree_id=${id}`).then(setActivities).catch(() => {});
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!tree) return <p className="empty">Loading…</p>;

  const save = async (e) => {
    e.preventDefault();
    try {
      const updated = await api.put(`/trees/${id}`, {
        ...tree,
        row: Number(tree.row),
        col: Number(tree.col),
        planted_year: tree.planted_year ? Number(tree.planted_year) : null,
      });
      setTree(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete tree ${tree.label} and unlink its history?`)) return;
    await api.del(`/trees/${id}`);
    navigate('/trees');
  };

  return (
    <>
      <p><Link to="/trees">← All trees</Link></p>
      <h1>🌳 {tree.label}</h1>

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
            Row
            <input type="number" min="1" value={tree.row}
              onChange={(e) => setTree({ ...tree, row: e.target.value })} />
          </label>
          <label className="field">
            Column
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
        <button type="submit">{saved ? 'Saved ✓' : 'Save changes'}</button>
        <button type="button" className="danger" onClick={remove}>Delete tree</button>
      </form>

      <h2>History for this tree</h2>
      <div className="card">
        {activities.length === 0 && (
          <p className="empty">
            No activities tagged to this tree yet. Tag trees when logging from
            the <Link to="/activities">Log</Link> page.
          </p>
        )}
        {activities.map((a) => (
          <div className="item" key={a.id}>
            <div>
              <div className="title">{a.type}</div>
              <div className="sub">{fmtDate(a.date)}{a.notes ? ` — ${a.notes}` : ''}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
