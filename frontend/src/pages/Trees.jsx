import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api.js';

const EMPTY = { label: '', row: 1, col: 1, variety: '', planted_year: '', notes: '' };

export default function Trees() {
  const [trees, setTrees] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  const load = () => api.get('/trees').then(setTrees).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/trees', {
        ...form,
        row: Number(form.row),
        col: Number(form.col),
        planted_year: form.planted_year ? Number(form.planted_year) : null,
      });
      setForm(EMPTY);
      setShowAdd(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const maxCol = Math.max(4, ...trees.map((t) => t.col || 1));

  return (
    <>
      <h1>Trees ({trees.filter((t) => t.status === 'active').length})</h1>
      {error && <p className="error">{error}</p>}

      <button className="add-toggle secondary" onClick={() => setShowAdd(!showAdd)}>
        {showAdd ? 'Cancel' : '+ Add tree'}
      </button>

      {showAdd && (
        <form className="panel card" onSubmit={submit}>
          <label className="field">
            Label
            <input
              required
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="T33"
            />
          </label>
          <div className="row2">
            <label className="field">
              Row
              <input type="number" min="1" value={form.row}
                onChange={(e) => setForm({ ...form, row: e.target.value })} />
            </label>
            <label className="field">
              Column
              <input type="number" min="1" value={form.col}
                onChange={(e) => setForm({ ...form, col: e.target.value })} />
            </label>
          </div>
          <div className="row2">
            <label className="field">
              Variety
              <input value={form.variety}
                onChange={(e) => setForm({ ...form, variety: e.target.value })}
                placeholder="Baladi, Souri…" />
            </label>
            <label className="field">
              Planted year
              <input type="number" value={form.planted_year}
                onChange={(e) => setForm({ ...form, planted_year: e.target.value })} />
            </label>
          </div>
          <button type="submit">Save tree</button>
        </form>
      )}

      <h2>Grove map</h2>
      <div
        className="grove-map"
        style={{ gridTemplateColumns: `repeat(${maxCol}, 1fr)` }}
      >
        {trees.map((t) => (
          <Link
            key={t.id}
            to={`/trees/${t.id}`}
            className={`tree-dot ${t.status !== 'active' ? 'removed' : ''}`}
            style={{ gridRow: t.row || 'auto', gridColumn: t.col || 'auto' }}
            title={t.variety || t.label}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <p className="sub" style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
        Tap a tree to see its history, edit its variety or move it on the map.
      </p>
    </>
  );
}
