import { useEffect, useState } from 'react';
import api, { ACTIVITY_TYPES, fmtDate, today } from '../api.js';

const EMPTY = () => ({ date: today(), type: 'Fertilizing', notes: '', tree_ids: [] });

const EMPTY_FILTER = { q: '', from: '', to: '', type: '' };

export default function Activities() {
  const [activities, setActivities] = useState([]);
  const [trees, setTrees] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY());
  const [error, setError] = useState('');
  const [filter, setFilter] = useState(EMPTY_FILTER);

  const filterActive =
    filter.q || filter.from || filter.to || filter.type;

  // Dates are ISO 'YYYY-MM-DD', so string comparison orders them correctly.
  const shown = activities.filter((a) => {
    if (filter.from && a.date < filter.from) return false;
    if (filter.to && a.date > filter.to) return false;
    if (filter.type && a.type !== filter.type) return false;
    if (filter.q) {
      const hay =
        `${a.type} ${a.notes} ${a.trees.map((t) => t.label).join(' ')}`.toLowerCase();
      if (!hay.includes(filter.q.toLowerCase())) return false;
    }
    return true;
  });

  const load = () =>
    api.get('/activities').then(setActivities).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    api.get('/trees').then(setTrees).catch(() => {});
  }, []);

  const toggleTree = (id) =>
    setForm((f) => ({
      ...f,
      tree_ids: f.tree_ids.includes(id)
        ? f.tree_ids.filter((t) => t !== id)
        : [...f.tree_ids, id],
    }));

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/activities', form);
      setForm(EMPTY());
      setShowAdd(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this activity?')) return;
    try {
      await api.del(`/activities/${id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <h1>
        Activity Log
        {filterActive && (
          <span style={{ fontWeight: 400, fontSize: '0.85rem', color: 'var(--muted)' }}>
            {' '}— {shown.length} of {activities.length}
          </span>
        )}
      </h1>
      {error && <p className="error">{error}</p>}

      <button className="add-toggle" onClick={() => setShowAdd(!showAdd)}>
        {showAdd ? 'Cancel' : '+ Log Activity'}
      </button>

      {showAdd && (
        <form className="panel card" onSubmit={submit}>
          <div className="row2">
            <label className="field">
              Date
              <input type="date" required value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label className="field">
              Type
              <select value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {ACTIVITY_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <label className="field">
            Notes
            <textarea value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. 2 sacks of manure per tree" />
          </label>
          <label className="field">
            Trees — leave empty for the whole grove
            <div>
              {trees.filter((t) => t.status === 'active').map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className="chip"
                  style={{
                    border: 0,
                    cursor: 'pointer',
                    background: form.tree_ids.includes(t.id) ? 'var(--olive)' : undefined,
                    color: form.tree_ids.includes(t.id) ? '#fff' : undefined,
                  }}
                  onClick={() => toggleTree(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </label>
          <button type="submit">Save activity</button>
        </form>
      )}

      {activities.length > 0 && (
        <div className="card panel">
          <label className="field">
            Search
            <input
              type="search"
              value={filter.q}
              onChange={(e) => setFilter({ ...filter, q: e.target.value })}
              placeholder="type, notes or tree label"
            />
          </label>
          <div className="row2">
            <label className="field">
              From
              <input type="date" value={filter.from}
                onChange={(e) => setFilter({ ...filter, from: e.target.value })} />
            </label>
            <label className="field">
              To
              <input type="date" value={filter.to}
                onChange={(e) => setFilter({ ...filter, to: e.target.value })} />
            </label>
          </div>
          <label className="field">
            Type
            <select value={filter.type}
              onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
              <option value="">All types</option>
              {ACTIVITY_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          {filterActive && (
            <button type="button" className="secondary small"
              onClick={() => setFilter(EMPTY_FILTER)}>
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="card">
        {activities.length === 0 && <p className="empty">Nothing logged yet.</p>}
        {activities.length > 0 && shown.length === 0 && (
          <p className="empty">No activities match these filters.</p>
        )}
        {shown.map((a) => (
          <div className="item" key={a.id}>
            <div>
              <div className="title">{a.type}</div>
              <div className="sub">
                {fmtDate(a.date)} —{' '}
                {a.trees.length > 0
                  ? a.trees.map((t) => t.label).join(', ')
                  : 'whole grove'}
                {a.notes ? ` — ${a.notes}` : ''}
              </div>
            </div>
            <button className="danger small" onClick={() => remove(a.id)}>✕</button>
          </div>
        ))}
      </div>
    </>
  );
}
