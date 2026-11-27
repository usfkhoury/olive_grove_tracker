import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import api, { MONTHS, fmtDate, today } from '../api.js';
import useSaveState from '../useSaveState.js';
import LogTaskForm from '../components/LogTaskForm.jsx';
import TaskNotes from '../components/TaskNotes.jsx';
import { inRange, taskStatus } from '../lib/season.js';

const EMPTY = { name: '', start_month: 1, end_month: 1, notes: '' };

// Status chip for a task's latest window; the ✓ chip opens its history.
function StatusChip({ task, now, onHistory }) {
  const s = taskStatus(task, now);
  if (s.status === 'done') {
    return (
      <button type="button" className="chip done-chip" onClick={onHistory}>
        ✓ {fmtDate(s.lastDone).slice(0, -5)} ▾
      </button>
    );
  }
  if (s.status === 'now') return <span className="chip gold">due</span>;
  if (s.status === 'missed') return <span className="chip" style={{ opacity: 0.6 }}>not logged</span>;
  return null;
}

export default function CalendarPage() {
  const [tasks, setTasks] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [trees, setTrees] = useState([]);
  const [activities, setActivities] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [logKey, setLogKey] = useState(null); // `${month}-${taskId}` of the open log form
  const [historyKey, setHistoryKey] = useState(null); // `${month}-${taskId}` of the open history
  const [logged, setLogged] = useState('');
  const { isOwner } = useAuth();
  const { saving, saved, run } = useSaveState();

  const load = () => {
    api.get('/tasks').then(setTasks).catch((e) => setError(e.message));
    api.get('/activities?limit=1000').then(setActivities).catch(() => {});
  };
  useEffect(() => {
    load();
    api.get('/trees').then(setTrees).catch(() => {});
    api.get('/harvests').then(setHarvests).catch(() => {});
  }, []);

  const now = today();
  const currentMonth = Number(now.slice(5, 7));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const payload = {
      ...form,
      start_month: Number(form.start_month),
      end_month: Number(form.end_month),
    };
    try {
      await run(async () => {
        if (editingId) await api.put(`/tasks/${editingId}`, payload);
        else await api.post('/tasks', payload);
        setForm(EMPTY);
        setEditingId(null);
        setShowAdd(false);
        load();
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const edit = (t) => {
    setForm({ name: t.name, start_month: t.start_month, end_month: t.end_month, notes: t.notes });
    setEditingId(t.id);
    setShowAdd(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (id) => {
    if (!confirm('Delete this seasonal task? Activities logged against it will show as "Other".')) return;
    try {
      await api.del(`/tasks/${id}`);
      setShowAdd(false);
      setEditingId(null);
      setForm(EMPTY);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  // Every entry for a task, newest first: its logged activities + linked presses.
  const historyOf = (t) => [
    ...activities.filter((a) => a.task_id === t.id).map((a) => ({
      id: a.id, date: a.date,
      who: a.trees.length ? a.trees.map((x) => x.label).join(', ') : 'whole grove',
      notes: a.notes,
    })),
    ...harvests.filter((h) => h.task_id === t.id).map((h) => ({
      id: h.id, date: h.date, who: '🫒 pressed',
      notes: `${h.olives_kg} kg olives → ${h.oil_kg} kg oil${h.tanake ? ` (${h.tanake} T)` : ''}`,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const monthSelect = (value, onChange) => (
    <select value={value} onChange={onChange}>
      {MONTHS.map((m, i) => (
        <option key={m} value={i + 1}>{m}</option>
      ))}
    </select>
  );

  const logButton = (month, t, secondary) => (
    <button className={`small ${secondary ? 'secondary' : ''}`} onClick={() => {
      setLogged('');
      setLogKey(logKey === `${month}-${t.id}` ? null : `${month}-${t.id}`);
    }}>log</button>
  );

  // Current month first, then the rest of the year in order.
  const order = Array.from({ length: 12 }, (_, k) => ((currentMonth - 1 + k) % 12) + 1);

  return (
    <>
      <h1>Seasonal Calendar</h1>
      <p><Link to="/activities">Activity log →</Link></p>
      {error && <p className="error">{error}</p>}
      {saved && <p className="saved">Saved ✓</p>}
      {logged && <p className="saved">Logged “{logged}” ✓</p>}

      {isOwner && (
        <button className="add-toggle" onClick={() => { setShowAdd(!showAdd); setEditingId(null); setForm(EMPTY); }}>
          {showAdd ? 'Cancel' : '+ Add Seasonal Task'}
        </button>
      )}

      {isOwner && showAdd && (
        <form className="panel card" onSubmit={submit}>
          <label className="field">
            Task
            <input required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Copper spray" />
          </label>
          <div className="row2">
            <label className="field">
              From
              {monthSelect(form.start_month, (e) => setForm({ ...form, start_month: e.target.value }))}
            </label>
            <label className="field">
              To
              {monthSelect(form.end_month, (e) => setForm({ ...form, end_month: e.target.value }))}
            </label>
          </div>
          <label className="field">
            Notes
            <textarea value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Update task' : 'Save task'}
          </button>
          {editingId && <>{' '}<button type="button" className="danger" onClick={() => remove(editingId)}>Delete task</button></>}
        </form>
      )}

      {order.map((month, k) => {
        const name = MONTHS[month - 1];
        const monthTasks = tasks.filter((t) => inRange(month, t.start_month, t.end_month));
        return (
          <details key={name} className={`card month-card ${month === currentMonth ? 'current' : ''}`} open={k < 3}>
            <summary>
              <h3 style={{ display: 'inline' }}>
                {name}
                {month === currentMonth && <span className="chip gold" style={{ marginLeft: 8 }}>now</span>}
              </h3>
              <span className="sub" style={{ marginLeft: 8 }}>
                {monthTasks.length ? `${monthTasks.length} task${monthTasks.length === 1 ? '' : 's'}` : ''}
              </span>
            </summary>
            {monthTasks.length === 0 && <div className="none">Rest month 🌿</div>}
            {monthTasks.map((t) => {
              const key = `${month}-${t.id}`;
              // Full row in the task's first month and in the current month;
              // elsewhere a one-line "continues" row.
              const full = t.start_month === month || month === currentMonth;
              const history = historyKey === key ? historyOf(t) : null;
              return (
                <div key={t.id}>
                  {full ? (
                    <div className="item">
                      <div>
                        <div className="title">
                          {t.name}{' '}
                          <StatusChip task={t} now={now} onHistory={() => setHistoryKey(historyKey === key ? null : key)} />
                        </div>
                        <div className="sub">
                          {MONTHS[t.start_month - 1]}–{MONTHS[t.end_month - 1]}
                        </div>
                        <TaskNotes notes={t.notes} />
                      </div>
                      {isOwner && (
                        <div style={{ whiteSpace: 'nowrap' }}>
                          {logButton(month, t)}
                          {t.start_month === month && (
                            <>{' '}<button className="secondary small" onClick={() => edit(t)}>edit</button></>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="item">
                      <div className="sub">
                        ↳ {t.name} (continues, {MONTHS[t.start_month - 1]}–{MONTHS[t.end_month - 1]})
                      </div>
                      {isOwner && logButton(month, t, true)}
                    </div>
                  )}
                  {history && (
                    <div className="task-history">
                      {history.length === 0 && <div className="sub">Nothing logged yet.</div>}
                      {history.map((h) => (
                        <div className="item" key={h.id}>
                          <div>
                            <div className="title" style={{ fontSize: '0.85rem' }}>
                              {fmtDate(h.date)} <span className="sub">· {h.who}</span>
                            </div>
                            {h.notes && <div className="sub" style={{ whiteSpace: 'pre-line' }}>{h.notes}</div>}
                          </div>
                        </div>
                      ))}
                      <Link to={`/activities?task=${encodeURIComponent(t.name)}&year=`}>see all in log →</Link>
                    </div>
                  )}
                  {logKey === key && (
                    <LogTaskForm
                      task={t}
                      trees={trees}
                      onCancel={() => setLogKey(null)}
                      onDone={() => { setLogKey(null); setLogged(t.name); load(); }}
                    />
                  )}
                </div>
              );
            })}
          </details>
        );
      })}
    </>
  );
}
