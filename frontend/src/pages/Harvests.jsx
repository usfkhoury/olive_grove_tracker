import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import api, { today } from '../api.js';
import HarvestChart from '../components/HarvestChart.jsx';
import HarvestForm from '../components/HarvestForm.jsx';
import useCollection from '../useCollection.js';

const EMPTY = () => ({ date: today(), olives_kg: '', oil_kg: '', tanake: '', notes: '' });

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const sessionRatio = (h) =>
  h.oil_kg ? Math.round((h.olives_kg / h.oil_kg) * 10) / 10 : null;

// Harvest form values are strings; the API row has numbers.
const toForm = (h) => ({
  date: h.date,
  olives_kg: String(h.olives_kg),
  oil_kg: String(h.oil_kg),
  tanake: h.tanake == null ? '' : String(h.tanake),
  notes: h.notes || '',
});

export default function Harvests() {
  const [seasons, setSeasons] = useState([]); // computed server-side, oldest first
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [openYears, setOpenYears] = useState(null); // null = newest season open
  const { isOwner } = useAuth();

  const refreshSeasons = () =>
    api.get('/harvests/seasons').then(setSeasons).catch(() => {});
  const { items: harvests, error, create, update, remove, saving, saved } =
    useCollection('/harvests', { onChange: refreshSeasons });

  useEffect(() => { refreshSeasons(); }, []);

  const add = async (body) => { if (await create(body)) setShowAdd(false); };
  const save = async (id, body) => { if (await update(id, body)) setEditingId(null); };
  const onDelete = async (id) => {
    if (confirm('Delete this pressing session? Its oil leaves the ledger and tree checks lose their press link.')
      && await remove(id)) setEditingId(null);
  };

  // Group by year, newest first.
  const byYear = harvests.reduce((acc, h) => {
    const y = h.date.slice(0, 4);
    (acc[y] = acc[y] || []).push(h);
    return acc;
  }, {});
  const years = Object.keys(byYear).sort((a, b) => b - a);
  const effectiveOpen = openYears ?? new Set(years.slice(0, 1));
  const toggle = (y) => {
    const next = new Set(effectiveOpen);
    if (next.has(y)) next.delete(y);
    else next.add(y);
    setOpenYears(next);
  };
  // Chart tap: open that year and bring its card into view.
  const jumpTo = (year) => {
    const y = String(year);
    setOpenYears(new Set([...effectiveOpen, y]));
    requestAnimationFrame(() =>
      document.getElementById(`season-${y}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const bestYieldYear = seasons.reduce(
    (a, b) => (a === null || b.yield_pct > a.yield_pct ? b : a), null)?.year;
  const biggestCropYear = seasons.reduce(
    (a, b) => (a === null || b.olives_kg > a.olives_kg ? b : a), null)?.year;

  return (
    <>
      <h1>Harvest & Pressing</h1>
      {error && <p className="error">{error}</p>}
      {saved && <p className="saved">Saved ✓</p>}

      {isOwner && (
        <button className="add-toggle" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Pressing Session'}
        </button>
      )}

      {isOwner && showAdd && (
        <HarvestForm initial={EMPTY()} saving={saving} submitLabel="Save session" onSave={add} />
      )}

      <div className="card">
        <HarvestChart seasons={seasons} selected={null} onSelect={jumpTo} />
      </div>

      <h2>Seasons</h2>
      {years.map((y) => {
        const s = seasons.find((x) => x.year === Number(y));
        if (!s) return null; // harvests and seasons load in separate requests
        const open = effectiveOpen.has(y);
        return (
          <div className="card season-card" key={y} id={`season-${y}`}>
            <button type="button" className="season-head" onClick={() => toggle(y)}>
              <span>
                {y}
                {s.year === bestYieldYear && <span className="chip gold">best ratio</span>}
                {s.year === biggestCropYear && <span className="chip">biggest crop</span>}
              </span>
              <span className="season-sub">
                {s.olives_kg} kg → {s.oil_kg} kg · {s.ratio}:1 {open ? '▴' : '▾'}
              </span>
            </button>

            {open && (
              <>
                <div className="tile-grid">
                  {[
                    ['olives', `${s.olives_kg} kg`],
                    ['oil', `${s.oil_kg} kg`],
                    ['tanake', s.tanake || '—'],
                    ['ratio', `${s.ratio} : 1`],
                    ['pressings', s.sessions],
                  ].map(([label, value]) => (
                    <div className="stat" key={label}>
                      <div className="value">{value}</div>
                      <div className="label">{label}</div>
                    </div>
                  ))}
                </div>

                {byYear[y].map((h) => (editingId === h.id ? (
                  <HarvestForm key={h.id} initial={toForm(h)} saving={saving} submitLabel="Save changes"
                    onSave={(b) => save(h.id, b)} onCancel={() => setEditingId(null)} onDelete={() => onDelete(h.id)} />
                ) : (
                  <div className="session" key={h.id}>
                    <span className="session-date">{shortDate(h.date)}</span>
                    <div className="share-track">
                      <div
                        className="share-fill"
                        style={{ width: `${(h.olives_kg / s.olives_kg) * 100}%` }}
                      />
                    </div>
                    <span className="session-nums">
                      {h.olives_kg} → {h.oil_kg} kg
                      {h.tanake ? ` · ${h.tanake}T` : ''}{' '}
                      <b className={sessionRatio(h) <= s.ratio ? 'yield-up' : 'yield-down'}>
                        {sessionRatio(h)}:1
                      </b>
                    </span>
                    {isOwner && <button className="secondary small" onClick={() => setEditingId(h.id)}>edit</button>}
                    {h.notes && <div className="session-note">{h.notes}</div>}
                  </div>
                )))}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
