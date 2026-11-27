import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { CHECK_OPTIONS, fmtDate } from '../api.js';
import Info from './Info.jsx';

// One row per active tree for one season: press, sacks, ripeness (latest
// weekly Jaén sample), pruning planned, fruit size. Saves create or update
// that tree's Tree check. Tapping the tree name opens a notes drawer under
// the row; a dot after the name means it has notes this season.
const toRow = (c) => ({
  press_id: c?.press_id || '', sacks: c?.sacks ?? '', ripeness: c?.ripeness ?? '', pruning_planned: c?.pruning_planned || '',
  fruit_size: c?.fruit_size || '', notes: c?.notes || '',
});

// `season` is chosen on the Trees page (shared with the Map).
export default function SeasonSheet({ trees, season, isOwner, onSaved }) {
  const [harvests, setHarvests] = useState([]);
  const [checks, setChecks] = useState([]);
  const [draft, setDraft] = useState({});
  const [status, setStatus] = useState({});
  const [notesOpen, setNotesOpen] = useState(null); // tree id whose notes drawer is open
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/harvests').then(setHarvests).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setDraft({}); setStatus({});
    api.get(`/checks?season=${season}`).then(setChecks).catch((e) => setError(e.message));
  }, [season]);

  const byTree = useMemo(() => new Map(checks.map((c) => [c.tree_id, c])), [checks]);
  const presses = harvests.filter((h) => h.date.startsWith(String(season)))
    .sort((a, b) => a.date.localeCompare(b.date));
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
      fruit_size: r.fruit_size || null,
      notes: r.notes,
    };
    setStatus((s) => ({ ...s, [t.id]: 'saving' }));
    try {
      const saved = c ? await api.put(`/checks/${c.id}`, body) : await api.post('/checks', body);
      setChecks((cs) => [...cs.filter((x) => x.tree_id !== t.id), saved]);
      setDraft((d) => { const n = { ...d }; delete n[t.id]; return n; });
      setStatus((s) => ({ ...s, [t.id]: 'saved' }));
      return true;
    } catch (e) {
      setStatus((s) => ({ ...s, [t.id]: e.message }));
      return false;
    }
  };
  const dirtyTrees = active.filter((t) => draft[t.id]);
  const saveAll = async () => {
    for (const t of dirtyTrees) await save(t, draft[t.id]);
    onSaved?.();
  };

  return (
    <>
      {error && <p className="error">{error}</p>}
      <div className="sheet-bar">
        {isOwner && (
          <button disabled={!dirtyTrees.length} onClick={saveAll}>
            Save {dirtyTrees.length || ''} change{dirtyTrees.length === 1 ? '' : 's'}
          </button>
        )}
      </div>

      <div className="card sheet-scroll">
        <table className="sheet">
          <thead>
            <tr>
              <th>Tree</th><th>Press</th><th>Sacks <Info term="sacks" /></th>
              <th>Ripe <Info term="ripeness" /></th><th>Pruning</th><th>Fruit</th><th />
            </tr>
          </thead>
          <tbody>
            {active.map((t) => {
              const r = rowOf(t);
              const st = status[t.id];
              const open = notesOpen === t.id;
              const hasNotes = Boolean(r.notes.trim());
              return (
                <Fragment key={t.id}>
                <tr className={`${draft[t.id] ? 'dirty' : ''} ${open ? 'notes-open' : ''}`}>
                  <td>
                    <button type="button" className={`tree-cell ${open ? 'on' : ''}`} aria-expanded={open}
                      aria-label={`${t.label}: ${hasNotes ? 'notes' : 'add notes'}`}
                      onClick={() => setNotesOpen(open ? null : t.id)}>
                      {t.label}{hasNotes && <i className="note-dot" />}
                    </button>
                  </td>
                  <td>
                    <select disabled={!isOwner} value={r.press_id} onChange={(e) => set(t, 'press_id', e.target.value)}>
                      <option value="">—</option>
                      {presses.map((h) => <option key={h.id} value={h.id}>{fmtDate(h.date).slice(0, -5)}</option>)}
                    </select>
                  </td>
                  <td><input disabled={!isOwner} type="number" inputMode="decimal" min="0" step="0.5" value={r.sacks} onChange={(e) => set(t, 'sacks', e.target.value)} /></td>
                  <td><input disabled={!isOwner} type="number" inputMode="decimal" min="0" max="7" step="0.5" value={r.ripeness} onChange={(e) => set(t, 'ripeness', e.target.value)} /></td>
                  <td>
                    <select disabled={!isOwner} value={r.pruning_planned} onChange={(e) => set(t, 'pruning_planned', e.target.value)}>
                      <option value="">—</option>
                      {CHECK_OPTIONS.pruning_planned.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td>
                    <select disabled={!isOwner} value={r.fruit_size} onChange={(e) => set(t, 'fruit_size', e.target.value)}>
                      <option value="">—</option>
                      {CHECK_OPTIONS.fruit_size.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="sheet-status" title={st && st !== 'saving' && st !== 'saved' ? st : ''}>
                    {st === 'saving' ? '…' : st === 'saved' ? '✓' : st ? '⚠' : ''}
                  </td>
                </tr>
                {open && (
                  <tr className="notes-row">
                    <td colSpan={7}>
                      {isOwner ? (
                        <textarea autoFocus rows={3} value={r.notes} placeholder={`Notes for ${t.label} — ${season}`}
                          onChange={(e) => set(t, 'notes', e.target.value)} />
                      ) : (
                        <div className="sub" style={{ whiteSpace: 'pre-line', padding: '6px 2px' }}>{r.notes || 'No notes.'}</div>
                      )}
                      <div className="notes-row-foot">
                        <Link to={`/trees/${t.id}`}>Open {t.label} →</Link>
                        {isOwner && <span className="sub">saved with “Save changes”</span>}
                        <button type="button" className="secondary small" onClick={() => setNotesOpen(null)}>Close</button>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="sub" style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
        Ripeness = latest weekly Jaén sample (overwrite each week). Kg per sack for each press is on the Harvest page.
      </p>
    </>
  );
}
