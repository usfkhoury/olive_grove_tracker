import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import api, { fmtDate, today } from '../api.js';
import useCollection from '../useCollection.js';
import TreeChips from '../components/TreeChips.jsx';
import EditActivityForm from '../components/EditActivityForm.jsx';

// Scheduled work is logged from the Calendar ("log" on a task) and is labelled
// with the task's name. Manual entries here are for unscheduled work: Other.
const EMPTY = () => ({ date: today(), type: 'Other', notes: '', tree_ids: [] });

const EMPTY_FILTER = { q: '', from: '', to: '', type: '' };

export default function Activities() {
  const [trees, setTrees] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY());
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [editingId, setEditingId] = useState(null);
  const { isOwner } = useAuth();
  const { items: activities, error, create, remove, reload, saving, saved } = useCollection('/activities');

  const filterActive =
    filter.q || filter.from || filter.to || filter.type;

  // Dates are ISO 'YYYY-MM-DD', so string comparison orders them correctly.
  const shown = activities.filter((a) => {
    if (filter.from && a.date < filter.from) return false;
    if (filter.to && a.date > filter.to) return false;
    if (filter.type && a.label !== filter.type) return false;
    if (filter.q) {
      const hay =
        `${a.label} ${a.notes} ${a.trees.map((t) => t.label).join(' ')}`.toLowerCase();
      if (!hay.includes(filter.q.toLowerCase())) return false;
    }
    return true;
  });

  const labels = [...new Set(activities.map((a) => a.label))].sort();

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

  const onDelete = async (id) => {
    if (confirm('Delete this activity?') && await remove(id)) setEditingId(null);
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
              placeholder="activity, notes or tree label"
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
            Activity
            <select value={filter.type}
              onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
              <option value="">All activities</option>
              {labels.map((t) => <option key={t}>{t}</option>)}
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
        {shown.map((a) => (editingId === a.id ? (
          <div className="item" key={a.id}>
            <EditActivityForm
              activity={a}
              trees={trees}
              onCancel={() => setEditingId(null)}
              onDone={async () => { setEditingId(null); await reload(); }}
              onDelete={() => onDelete(a.id)}
            />
          </div>
        ) : (
          <div className="item" key={a.id}>
            <div>
              <div className="title">{a.label}</div>
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
            {isOwner && (
              <button className="secondary small" onClick={() => setEditingId(a.id)}>edit</button>
            )}
          </div>
        )))}
      </div>
    </>
  );
}
