import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import api, { today } from '../api.js';
import SeasonBars from '../components/SeasonBars.jsx';
import YieldTrend from '../components/YieldTrend.jsx';
import useCollection from '../useCollection.js';

const EMPTY = () => ({ date: today(), olives_kg: '', oil_kg: '', tanake: '', notes: '' });

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const sessionRatio = (h) =>
  h.oil_kg ? Math.round((h.olives_kg / h.oil_kg) * 10) / 10 : null;

export default function Harvests() {
  const [seasons, setSeasons] = useState([]); // computed server-side, oldest first
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY());
  const [tanakeEdited, setTanakeEdited] = useState(false);
  const [openYears, setOpenYears] = useState(null); // null = newest season open
  const { isOwner } = useAuth();

  const refreshSeasons = () =>
    api.get('/harvests/seasons').then(setSeasons).catch(() => {});
  const { items: harvests, error, create, remove, saving, saved } =
    useCollection('/harvests', { onChange: refreshSeasons });

  useEffect(() => { refreshSeasons(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    const created = await create({
      date: form.date,
      olives_kg: Number(form.olives_kg),
      oil_kg: Number(form.oil_kg),
      tanake: form.tanake === '' ? null : Number(form.tanake),
      notes: form.notes,
    });
    if (created) {
      setForm(EMPTY());
      setTanakeEdited(false);
      setShowAdd(false);
    }
  };

  const onDelete = (id) => {
    if (confirm('Delete this pressing session? Its oil will leave the ledger too.')) {
      remove(id);
    }
  };

  // Group by year, newest first (the per-session list under each season card).
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
        <form className="panel card" onSubmit={submit}>
          <label className="field">
            Date
            <input type="date" required value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </label>
          <div className="row2">
            <label className="field">
              Olives (kg)
              <input type="number" step="0.1" min="0" required value={form.olives_kg}
                onChange={(e) => setForm({ ...form, olives_kg: e.target.value })} />
            </label>
            <label className="field">
              Oil (kg)
              <input type="number" step="0.1" min="0" required value={form.oil_kg}
                onChange={(e) => {
                  const oil = e.target.value;
                  setForm((f) => ({
                    ...f,
                    oil_kg: oil,
                    tanake: tanakeEdited
                      ? f.tanake
                      : oil ? String(Math.round((Number(oil) / 15) * 10) / 10) : '',
                  }));
                }} />
            </label>
          </div>
          <label className="field">
            Tanake — estimated from oil weight (16L ≈ 15kg), edit if different
            <input type="number" step="0.1" min="0" value={form.tanake}
              onChange={(e) => {
                setTanakeEdited(true);
                setForm({ ...form, tanake: e.target.value });
              }} />
          </label>
          <label className="field">
            Notes
            <textarea value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="which press, waiting time, fruit condition…" />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save session'}
          </button>
        </form>
      )}

      <h2>Seasons</h2>
      <div className="card">
        <SeasonBars seasons={seasons} />
      </div>

      <h2>Ratio Trend (kg olives per kg oil)</h2>
      <div className="card">
        <YieldTrend seasons={seasons} />
      </div>

      {years.map((y) => {
        const s = seasons.find((x) => x.year === Number(y));
        if (!s) return null; // harvests and seasons load in separate requests
        const open = effectiveOpen.has(y);
        return (
          <div className="card season-card" key={y}>
            <button type="button" className="season-head" onClick={() => toggle(y)}>
              <span>
                {y}
                {s.year === bestYieldYear && <span className="chip gold">best ratio</span>}
                {s.year === biggestCropYear && <span className="chip">biggest crop</span>}
              </span>
              <span className="season-sub">
                {s.olives_kg}kg → {s.oil_kg}kg · {s.ratio}:1 {open ? '▴' : '▾'}
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

                {byYear[y].map((h) => (
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
                    {isOwner && <button className="danger small" onClick={() => onDelete(h.id)}>✕</button>}
                    {h.notes && <div className="session-note">{h.notes}</div>}
                  </div>
                ))}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
