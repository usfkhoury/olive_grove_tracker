import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import api, { MONTHS } from '../api.js';
import useSaveState from '../useSaveState.js';
import LogTaskForm from '../components/LogTaskForm.jsx';

const EMPTY = { name: '', start_month: 1, end_month: 1, notes: '' };

const inRange = (month, start, end) =>
  start <= end ? month >= start && month <= end : month >= start || month <= end;

export default function CalendarPage() {
  const [tasks, setTasks] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [trees, setTrees] = useState([]);
  const [logKey, setLogKey] = useState(null); // `${month}-${taskId}` of the open log form
  const [logged, setLogged] = useState('');
  const { isOwner } = useAuth();
  const { saving, saved, run } = useSaveState();

  const load = () => api.get('/tasks').then(setTasks).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api.get('/trees').then(setTrees).catch(() => {});
  }, []);

  const currentMonth = new Date().getMonth() + 1;

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
    if (!confirm('Delete this seasonal task?')) return;
    try {
      await api.del(`/tasks/${id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const monthSelect = (value, onChange) => (
    <select value={value} onChange={onChange}>
      {MONTHS.map((m, i) => (
        <option key={m} value={i + 1}>{m}</option>
      ))}
    </select>
  );

  return (
    <>
      <h1>Seasonal Calendar</h1>
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
        </form>
      )}

      {MONTHS.map((name, i) => {
        const month = i + 1;
        const monthTasks = tasks.filter((t) => inRange(month, t.start_month, t.end_month));
        return (
          <div key={name} className={`card month-card ${month === currentMonth ? 'current' : ''}`}>
            <h3>
              {name}
              {month === currentMonth && <span className="chip gold" style={{ marginLeft: 8 }}>now</span>}
            </h3>
            {monthTasks.length === 0 && <div className="none">Rest month 🌿</div>}
            {monthTasks.map((t) => (
              <div key={t.id}>
              <div className="item">
                <div>
                  <div className="title">{t.name}</div>
                  <div className="sub">
                    {MONTHS[t.start_month - 1]}–{MONTHS[t.end_month - 1]}
                  </div>
                  {t.notes && (
                    <div className="sub" style={{ whiteSpace: 'pre-line', marginTop: 4 }}>
                      {t.notes}
                    </div>
                  )}
                </div>
                {isOwner && (
                  <div style={{ whiteSpace: 'nowrap' }}>
                    <button className="small" onClick={() => {
                      setLogged('');
                      setLogKey(logKey === `${month}-${t.id}` ? null : `${month}-${t.id}`);
                    }}>log</button>
                    {t.start_month === month && (
                      <>
                        {' '}<button className="secondary small" onClick={() => edit(t)}>edit</button>
                        {' '}<button className="danger small" onClick={() => remove(t.id)}>✕</button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {logKey === `${month}-${t.id}` && (
                <LogTaskForm
                  task={t}
                  trees={trees}
                  onCancel={() => setLogKey(null)}
                  onDone={() => { setLogKey(null); setLogged(t.name); }}
                />
              )}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
