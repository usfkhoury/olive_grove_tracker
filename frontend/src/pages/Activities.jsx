import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import api, { ACTIVITY_TYPES, fmtDate, today } from '../api.js';
import useCollection from '../useCollection.js';
import TreeChips from '../components/TreeChips.jsx';

// Scheduled work is logged from the Calendar ("log" on a task). Manual entries
// here are only for unscheduled work, so they are always type Other.
const EMPTY = () => ({ date: today(), type: 'Other', notes: '', tree_ids: [] });

const EMPTY_FILTER = { q: '', from: '', to: '', type: '' };

export default function Activities() {
  const [trees, setTrees] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY());
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const { isOwner } = useAuth();
  const { items: activities, error, create, remove, saving, saved } = useCollection('/activities');

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

  useEffect(() => {
    api.get('/trees').then(setTrees).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const created = await create(form);
    if (created) {
      setForm(EMPTY());
      setShowAdd(false);
    }
  };

  const onDelete = (id) => {
    if (confirm('Delete this activity?')) remove(id);
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
      {saved && <p className="saved">Saved ✓</p>}

      {isOwner && (
        <button className="add-toggle" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Log Other Activity'}
        </button>
      )}
      {isOwner && !showAdd && (
        <p className="sub" style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: -4 }}>
          Scheduled work (sprays, fertilizing, pruning…) is logged from the Calendar.
        </p>
      )}

      {isOwner && showAdd && (
        <form className="panel card" onSubmit={submit}>
          <label className="field">
            Date
            <input type="date" required value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </label>
          <label className="field">
            Notes
            <textarea value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. Rebuilt collapsed jloul section under T22" required />
          </label>
          <TreeChips trees={trees} selected={form.tree_ids}
            onChange={(ids) => setForm({ ...form, tree_ids: ids })} />
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save activity'}
          </button>
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
              </div>
              {a.notes && (
                <div className="sub" style={{ whiteSpace: 'pre-line', marginTop: 4 }}>
                  {a.notes}
                </div>
              )}
            </div>
            {isOwner && <button className="danger small" onClick={() => onDelete(a.id)}>✕</button>}
          </div>
        ))}
      </div>
    </>
  );
}
