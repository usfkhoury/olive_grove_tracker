import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import api, { CHECK_OPTIONS, fmtDate } from '../api.js';
import { pressSackStats } from '../lib/sheet.js';
import Info from '../components/Info.jsx';

// One row per active tree for one season: press, ripeness, sacks, pruning.
// Saves create or update that tree's Tree check; other check fields are kept.
const toRow = (c) => ({
  press_id: c?.press_id || '', ripeness: c?.ripeness ?? '', sacks: c?.sacks ?? '', pruning_planned: c?.pruning_planned || '',
});

export default function SeasonSheet() {
  const { isOwner } = useAuth();
  const [season, setSeason] = useState(new Date().getFullYear());
  const [trees, setTrees] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [checks, setChecks] = useState([]);
  const [draft, setDraft] = useState({});
  const [status, setStatus] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/trees').then(setTrees).catch((e) => setError(e.message));
    api.get('/harvests').then(setHarvests).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setDraft({}); setStatus({});
    api.get(`/checks?season=${season}`).then(setChecks).catch((e) => setError(e.message));
  }, [season]);

  const byTree = useMemo(() => new Map(checks.map((c) => [c.tree_id, c])), [checks]);
  const presses = harvests.filter((h) => h.date.startsWith(String(season)));
  const stats = pressSackStats(checks, presses);
  const active = trees.filter((t) => t.status === 'active');
  const rowOf = (t) => draft[t.id] || toRow(byTree.get(t.id));
  const set = (t, k, v) => setDraft((d) => ({ ...d, [t.id]: { ...(d[t.id] || toRow(byTree.get(t.id))), [k]: v } }));

  const save = async (t, r) => {
    const c = byTree.get(t.id);
    const body = {
      tree_id: t.id, season,
      press_id: r.press_id || null,
      ripeness: r.ripeness === '' ? null : Number(r.ripeness),
      sacks: r.sacks === '' ? null : Number(r.sacks),
      pruning_planned: r.pruning_planned || null,
      canopy_density: c?.canopy_density || null,
      fruit_size: c?.fruit_size || null,
      notes: c?.notes || '',
    };
    setStatus((s) => ({ ...s, [t.id]: 'saving' }));
    try {
      const saved = c ? await api.put(`/checks/${c.id}`, body) : await api.post('/checks', body);
      setChecks((cs) => [...cs.filter((x) => x.tree_id !== t.id), saved]);
      setDraft((d) => { const n = { ...d }; delete n[t.id]; return n; });
      setStatus((s) => ({ ...s, [t.id]: 'saved' }));
    } catch (e) {
      setStatus((s) => ({ ...s, [t.id]: e.message }));
    }
  };
  const dirtyTrees = active.filter((t) => draft[t.id]);
  const saveAll = async () => { for (const t of dirtyTrees) await save(t, draft[t.id]); };

  return (
    <>
      <p><Link to="/trees">← Trees</Link></p>
      <h1>Season sheet</h1>
      {error && <p className="error">{error}</p>}
      <label className="field" style={{ maxWidth: 140 }}>
        Season
        <input type="number" min="2000" max="2100" value={season} onChange={(e) => setSeason(Number(e.target.value))} />
      </label>

      <div className="card sheet-scroll">
        <table className="sheet">
          <thead><tr><th>Tree</th><th>Press</th><th>Ripe 0–7 <Info term="ripeness" /></th><th>Sacks <Info term="sacks" /></th><th>Pruning</th><th /></tr></thead>
          <tbody>
            {active.map((t) => {
              const r = rowOf(t);
              const st = status[t.id];
              return (
                <tr key={t.id} className={draft[t.id] ? 'dirty' : ''}>
                  <td><Link to={`/trees/${t.id}`}>{t.label}</Link></td>
                  <td>
                    <select disabled={!isOwner} value={r.press_id} onChange={(e) => set(t, 'press_id', e.target.value)}>
                      <option value="">—</option>
                      {presses.map((h) => <option key={h.id} value={h.id}>{fmtDate(h.date).slice(0, -5)}</option>)}
                    </select>
                  </td>
                  <td><input disabled={!isOwner} type="number" inputMode="decimal" min="0" max="7" step="0.5" value={r.ripeness} onChange={(e) => set(t, 'ripeness', e.target.value)} /></td>
                  <td><input disabled={!isOwner} type="number" inputMode="decimal" min="0" step="0.5" value={r.sacks} onChange={(e) => set(t, 'sacks', e.target.value)} /></td>
                  <td>
                    <select disabled={!isOwner} value={r.pruning_planned} onChange={(e) => set(t, 'pruning_planned', e.target.value)}>
                      <option value="">—</option>
                      {CHECK_OPTIONS.pruning_planned.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="sheet-status" title={st && st !== 'saving' && st !== 'saved' ? st : ''}>
                    {st === 'saving' ? '…' : st === 'saved' ? '✓' : st ? '⚠' : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isOwner && (
        <button disabled={!dirtyTrees.length} onClick={saveAll}>
          Save {dirtyTrees.length || ''} change{dirtyTrees.length === 1 ? '' : 's'}
        </button>
      )}

      <h2>Per press</h2>
      <div className="card">
        {presses.length === 0 && <p className="empty">No presses recorded for {season}.</p>}
        {presses.map((h) => {
          const s = stats.get(h.id);
          return (
            <div className="item" key={h.id}>
              <div>
                <div className="title">{fmtDate(h.date)} — {h.olives_kg} kg → {h.oil_kg} kg</div>
                <div className="sub">
                  {s ? `${s.sacks} sacks · ${s.kgPerSack} kg olives/sack · ${s.oilPerSack} kg oil/sack` : 'no sacks entered yet'}
                </div>
              </div>
            </div>
          );
        })}
        <p className="sub" style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
          Per-sack figures are only right once every tree in that press has its sacks entered.
        </p>
      </div>
    </>
  );
}
