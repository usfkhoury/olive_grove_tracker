import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { fmtDate } from '../api.js';
import SeasonBars from '../components/SeasonBars.jsx';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="empty">Loading…</p>;

  const latest = data.seasons[data.seasons.length - 1];

  return (
    <>
      <h1>🫒 Olive Grove</h1>

      <div className="stat-grid">
        <div className="stat">
          <div className="value">{data.tree_count}</div>
          <div className="label">active trees</div>
        </div>
        <div className="stat">
          <div className="value">{data.oil.balance_kg} kg</div>
          <div className="label">
            oil in stock (~{data.oil.balance_tanake} tanake / {data.oil.balance_liters} L)
          </div>
        </div>
        {latest && (
          <div className="stat">
            <div className="value">{latest.oil_kg} kg oil</div>
            <div className="label">
              season {latest.year}: {latest.olives_kg} kg olives, {latest.ratio}:1 ratio
            </div>
          </div>
        )}
      </div>

      <h2>This time of year</h2>
      <div className="card">
        {data.active_tasks.length === 0 && data.upcoming_tasks.length === 0 && (
          <p className="empty">No seasonal tasks for now.</p>
        )}
        {data.active_tasks.map((t) => (
          <div className="item" key={t.id}>
            <div>
              <div className="title">{t.name}</div>
              {t.notes && <div className="sub">{t.notes}</div>}
            </div>
            <span className="chip gold">now</span>
          </div>
        ))}
        {data.upcoming_tasks.map((t) => (
          <div className="item" key={t.id}>
            <div>
              <div className="title">{t.name}</div>
              {t.notes && <div className="sub">{t.notes}</div>}
            </div>
            <span className="chip">soon</span>
          </div>
        ))}
        <div style={{ marginTop: 8 }}>
          <Link to="/calendar">Full calendar →</Link>
        </div>
      </div>

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
              <div className="title">{a.type}</div>
              <div className="sub">
                {fmtDate(a.date)}
                {a.trees.length > 0
                  ? ` — ${a.trees.map((t) => t.label).join(', ')}`
                  : ' — whole grove'}
                {a.notes ? ` — ${a.notes}` : ''}
              </div>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 8 }}>
          <Link to="/activities">All activity →</Link>
        </div>
      </div>

      <h2>Export & Backup</h2>
      <div className="card">
        <p className="sub" style={{ color: 'var(--muted)', marginBottom: 10 }}>
          Download your records as spreadsheets, or a full JSON backup.
        </p>
        <div className="export-links">
          {[
            ['trees', 'Trees'],
            ['activities', 'Activities'],
            ['harvests', 'Harvests'],
            ['oil', 'Oil ledger'],
            ['tasks', 'Calendar'],
          ].map(([entity, label]) => (
            <a key={entity} className="chip" href={`/api/export/${entity}.csv`} download>
              {label} CSV
            </a>
          ))}
          <a className="chip gold" href="/api/export/all.json" download>
            Full backup (JSON)
          </a>
        </div>
      </div>
    </>
  );
}
