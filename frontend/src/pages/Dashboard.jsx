import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import api, { fmtDate, today } from '../api.js';
import HomeStats from '../components/HomeStats.jsx';
import LogTaskForm from '../components/LogTaskForm.jsx';
import SeasonBars from '../components/SeasonBars.jsx';
import SprayWindow from '../components/SprayWindow.jsx';
import TaskNotes from '../components/TaskNotes.jsx';
import { latestWindow, taskStatus } from '../lib/season.js';
import { isSprayTask } from '../lib/weather.js';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [trees, setTrees] = useState([]);
  const [movements, setMovements] = useState([]);
  const [error, setError] = useState('');
  const [detailsFor, setDetailsFor] = useState(null);
  const { isOwner } = useAuth();

  const load = () => api.get('/dashboard').then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api.get('/trees').then(setTrees).catch(() => {});
    api.get('/oil/movements').then(setMovements).catch(() => {});
  }, []);

  if (error && !data) return <p className="error">{error}</p>;
  if (!data) return <p className="empty">Loading…</p>;

  const latest = data.seasons[data.seasons.length - 1];
  const now = today();
  const year = Number(now.slice(0, 4));
  const withStatus = data.tasks.map((t) => ({ ...t, ...taskStatus(t, now) }));
  const due = withStatus.filter((t) => t.status === 'now');
  const dueSprays = due.filter(isSprayTask);
  const doneNow = withStatus.filter((t) => t.status === 'done' && latestWindow(t, now).current);
  const soon = withStatus.filter((t) => t.status === 'soon');
  // Tasks whose window has started this calendar year, and how many were logged.
  const startedThisYear = data.tasks.filter((t) => {
    const w = latestWindow(t, now);
    return w.from.startsWith(String(year)) && w.from <= now;
  });
  const loggedThisYear = startedThisYear.filter(
    (t) => (t.done_dates || []).some((d) => d >= latestWindow(t, now).from));

  const markDone = async (t) => {
    if (!confirm(`Log "${t.name}" as done today (whole grove)?`)) return;
    setError('');
    try {
      await api.post('/activities', { date: now, task_id: t.id, notes: '', tree_ids: [] });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <h1>🫒 Olive Grove</h1>
      {error && <p className="error">{error}</p>}

      <HomeStats movements={movements} season={latest}
        tasks={{ year, logged: loggedThisYear.length, started: startedThisYear.length, due }} />

      <h2>Due now</h2>
      <div className="card">
        {due.length === 0 && <p className="empty">Nothing due — all current tasks are logged. 🌿</p>}
        {due.map((t) => (
          <div key={t.id}>
            <div className="item">
              <div>
                <div className="title">{t.name}</div>
                <TaskNotes notes={t.notes} />
              </div>
              {isOwner && (
                <div style={{ whiteSpace: 'nowrap' }}>
                  <button className="small" onClick={() => markDone(t)}>✓ Done</button>{' '}
                  <button className="secondary small" onClick={() => setDetailsFor(detailsFor === t.id ? null : t.id)}>details</button>
                </div>
              )}
            </div>
            {detailsFor === t.id && (
              <LogTaskForm task={t} trees={trees} onCancel={() => setDetailsFor(null)}
                onDone={() => { setDetailsFor(null); load(); }} />
            )}
          </div>
        ))}
        {doneNow.map((t) => (
          <div className="item" key={t.id}>
            <div className="title" style={{ opacity: 0.7 }}>{t.name}</div>
            <span className="chip">✓ {fmtDate(t.lastDone).slice(0, -5)}</span>
          </div>
        ))}
        {soon.length > 0 && <h3 style={{ marginTop: 12 }}>Coming up</h3>}
        {soon.map((t) => (
          <div className="item" key={t.id}>
            <div><div className="title">{t.name}</div><TaskNotes notes={t.notes} /></div>
            <span className="chip">soon</span>
          </div>
        ))}
        <div style={{ marginTop: 8 }}><Link to="/calendar">Full calendar →</Link></div>
      </div>
      {dueSprays.length > 0 && <SprayWindow tasks={dueSprays} />}

      <h2>Harvest History</h2>
      <div className="card">
        <SeasonBars seasons={data.seasons} />
      </div>

      <h2>Recent Activity</h2>
      <div className="card">
        {data.recent_activities.length === 0 && (
          <p className="empty">Nothing logged yet.</p>
        )}
        {data.recent_activities.map((a) => (
          <div className="item" key={a.id}>
            <div>
              <div className="title">{a.label}</div>
              <div className="sub">
                {fmtDate(a.date)}
                {a.trees.length > 0
                  ? ` — ${a.trees.map((t) => t.label).join(', ')}`
                  : ' — whole grove'}
              </div>
              {a.notes && (
                <div className="sub" style={{ whiteSpace: 'pre-line', marginTop: 4 }}>
                  {a.notes}
                </div>
              )}
            </div>
          </div>
        ))}
        <div style={{ marginTop: 8 }}>
          <Link to="/activities">All activity →</Link>
        </div>
      </div>

      <details className="card" style={{ marginTop: 16 }}>
        <summary>Export & backup</summary>
        <p className="sub" style={{ color: 'var(--muted)', margin: '10px 0' }}>
          Download your records as spreadsheets, or a full JSON backup.
        </p>
        <div className="export-links">
          {[
            ['trees', 'Trees'],
            ['activities', 'Activities'],
            ['harvests', 'Harvests'],
            ['oil', 'Oil ledger'],
            ['tasks', 'Calendar'],
            ['checks', 'Tree checks'],
          ].map(([entity, label]) => (
            <a key={entity} className="chip" href={`/api/export/${entity}.csv`} download>
              {label} CSV
            </a>
          ))}
          <a className="chip gold" href="/api/export/all.json" download>
            Full backup (JSON)
          </a>
        </div>
      </details>
    </>
  );
}
