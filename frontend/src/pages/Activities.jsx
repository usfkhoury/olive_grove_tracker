import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import api, { today } from '../api.js';
import useCollection from '../useCollection.js';
import TreeChips from '../components/TreeChips.jsx';
import EditActivityForm from '../components/EditActivityForm.jsx';

// Scheduled work is logged from Home, the Calendar or the grove map and is
// labelled with its task's name. Manual entries here are for unscheduled work:
// Other. Presses (from Harvest) show read-only under their linked task.
const EMPTY = () => ({ date: today(), type: 'Other', notes: '', tree_ids: [] });

const monthTitle = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const dayMonth = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function Activities() {
  const [params] = useSearchParams();
  const [trees, setTrees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY());
  const [filter, setFilter] = useState(() => ({
    year: params.has('year') ? params.get('year') : String(new Date().getFullYear()),
    task: params.get('task') || '',
    tree: params.get('tree') || '',
  }));
  const [editingId, setEditingId] = useState(null);
  const { isOwner } = useAuth();
  const { items: activities, error, create, remove, reload, saving, saved } = useCollection('/activities');

  useEffect(() => {
    api.get('/trees').then(setTrees).catch(() => {});
    api.get('/tasks').then(setTasks).catch(() => {});
    api.get('/harvests').then(setHarvests).catch(() => {});
  }, []);

  const taskName = new Map(tasks.map((t) => [t.id, t.name]));
  const presses = harvests.map((h) => ({
    id: h.id, date: h.date, label: taskName.get(h.task_id) || 'Harvest & Pressing', trees: [], press: h,
  }));
  const entries = [...activities, ...presses].sort((a, b) => b.date.localeCompare(a.date));

  const shown = entries.filter((a) => {
    if (filter.year && !a.date.startsWith(filter.year)) return false;
    if (filter.task && a.label !== filter.task) return false;
    // No trees tagged = whole grove, so it belongs to every tree.
    if (filter.tree && a.trees.length && !a.trees.some((t) => t.id === filter.tree)) return false;
    return true;
  });
  const years = [...new Set(entries.map((a) => a.date.slice(0, 4)))].sort().reverse();
  const labels = [...new Set(entries.map((a) => a.label))].sort();
  const treeLabel = trees.find((t) => t.id === filter.tree)?.label;

  // Month groups, newest first.
  const groups = [];
  shown.forEach((a) => {
    const key = a.date.slice(0, 7);
    if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, items: [] });
    groups[groups.length - 1].items.push(a);
  });

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
      <p><Link to="/calendar">← Calendar</Link></p>
      <h1>Activity log</h1>
      {error && <p className="error">{error}</p>}
      {saved && <p className="saved">Saved ✓</p>}

      <div className="log-filters">
        <select value={filter.year} onChange={(e) => setFilter({ ...filter, year: e.target.value })}>
          {!years.includes(filter.year) && filter.year && <option value={filter.year}>{filter.year}</option>}
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
          <option value="">All years</option>
        </select>
        <select value={filter.task} onChange={(e) => setFilter({ ...filter, task: e.target.value })}>
          <option value="">All tasks</option>
          {labels.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={filter.tree} onChange={(e) => setFilter({ ...filter, tree: e.target.value })}>
          <option value="">All trees</option>
          {trees.filter((t) => t.status === 'active').map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <p className="sub" style={{ color: 'var(--muted)' }}>
        {shown.length} entr{shown.length === 1 ? 'y' : 'ies'}
        {treeLabel ? ` touching ${treeLabel} (incl. whole-grove)` : ''}
      </p>

      {groups.length === 0 && <div className="card"><p className="empty">Nothing logged for these filters.</p></div>}
      {groups.map((g) => (
        <div key={g.key}>
          <div className="month-label">{monthTitle(`${g.key}-01`)}</div>
          <div className="card">
            {g.items.map((a) => {
              if (a.press) {
                return (
                  <div className="item" key={a.id}>
                    <div>
                      <div className="title">🫒 Pressed</div>
                      <div className="sub">{dayMonth(a.date)} · from Harvest</div>
                      <div className="sub" style={{ marginTop: 4 }}>
                        {a.press.olives_kg} kg olives → {a.press.oil_kg} kg oil{a.press.tanake ? ` (${a.press.tanake} T)` : ''}
                      </div>
                    </div>
                  </div>
                );
              }
              if (editingId === a.id) {
                return (
                  <div className="item" key={a.id}>
                    <EditActivityForm
                      activity={a}
                      trees={trees}
                      onCancel={() => setEditingId(null)}
                      onDone={async () => { setEditingId(null); await reload(); }}
                      onDelete={() => onDelete(a.id)}
                    />
                  </div>
                );
              }
              return (
                <div className="item" key={a.id}>
                  <div>
                    <div className="title">{a.label}</div>
                    <div className="sub">
                      {dayMonth(a.date)} ·{' '}
                      {a.trees.length > 0 ? a.trees.map((t) => t.label).join(', ') : 'whole grove'}
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
              );
            })}
          </div>
        </div>
      ))}

      {isOwner && (
        <button className="add-toggle" onClick={() => setShowAdd(!showAdd)} style={{ marginTop: 12 }}>
          {showAdd ? 'Cancel' : '+ Log Other Activity'}
        </button>
      )}
      {isOwner && !showAdd && (
        <p className="sub" style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: -4 }}>
          Scheduled work (sprays, fertilizing, pruning…) is logged from Home, the Calendar or the grove map.
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
    </>
  );
}
