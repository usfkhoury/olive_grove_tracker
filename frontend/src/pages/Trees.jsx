import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import api, { fmtDate, today } from '../api.js';
import useCollection from '../useCollection.js';
import MapLogForm from '../components/MapLogForm.jsx';
import TreeSheet from '../components/TreeSheet.jsx';
import { heat, missingFields, pressPalette } from '../lib/sheet.js';
import { taskStatus } from '../lib/season.js';

const EMPTY = { label: '', row: 1, col: 1, variety: '', planted_year: '', notes: '' };

// Fixed grove features (not trees). Row = top→bottom, col = left→right.
const STAIRS = [
  { row: 2, col: 15, title: 'Stairs up to terrace 1' },
  { row: 3, col: 19, title: 'Stairs up to terrace 2' },
];

export default function Trees() {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const { items: trees, error, create, saving, saved } = useCollection('/trees');
  const { isOwner } = useAuth();
  const navigate = useNavigate();
  const focus = new URLSearchParams(useLocation().search).get('focus');
  const season = new Date().getFullYear();

  const [view, setView] = useState('map');           // 'map' | 'list'
  const [colorBy, setColorBy] = useState('');
  const [openId, setOpenId] = useState(null);        // tree whose quick card is open
  const [selecting, setSelecting] = useState(false); // select-to-log mode
  const [picked, setPicked] = useState([]);
  const [logFor, setLogFor] = useState(null);        // tree ids being logged
  const [checks, setChecks] = useState([]);
  const [presses, setPresses] = useState([]);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    api.get(`/checks?season=${season}`).then(setChecks).catch(() => {});
    api.get('/harvests').then((hs) => setPresses(hs.filter((h) => h.date.startsWith(String(season))))).catch(() => {});
    api.get('/tasks').then((ts) => {
      const now = today();
      const rank = (t) => (taskStatus(t, now).status === 'now' ? 0 : 1);
      setTasks([...ts].sort((a, b) => rank(a) - rank(b) || a.start_month - b.start_month));
    }).catch(() => {});
  }, [season]);

  const checkOf = useMemo(() => new Map(checks.map((c) => [c.tree_id, c])), [checks]);
  const palette = pressPalette(presses);
  const pressColor = new Map(palette.map((p) => [p.id, p.color]));
  const nums = checks.map((c) => c[colorBy]).filter((v) => typeof v === 'number');
  const range = { min: Math.min(...nums), max: Math.max(...nums) };
  const active = trees.filter((t) => t.status === 'active');
  const missingCount = (f) => active.filter((t) => missingFields(checkOf.get(t.id)).includes(f)).length;

  const dotLook = (t) => {
    const c = checkOf.get(t.id);
    if (colorBy === 'press') return c?.press_id ? { style: { background: pressColor.get(c.press_id) } } : { cls: 'nodata' };
    if (colorBy === 'missing') return { badge: missingFields(c).length > 0 };
    if (colorBy) {
      const h = heat(colorBy, c?.[colorBy], range);
      return h == null ? { cls: 'nodata' } : { cls: 'heat', style: { '--heat': h } };
    }
    return {};
  };
  const tapTree = (t) => {
    if (selecting) setPicked((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]));
    else setOpenId(openId === t.id ? null : t.id);
  };

  const submit = async (e) => {
    e.preventDefault();
    const created = await create({
      ...form,
      row: Number(form.row),
      col: Number(form.col),
      planted_year: form.planted_year ? Number(form.planted_year) : null,
    });
    if (created) {
      setForm(EMPTY);
      setShowAdd(false);
    }
  };

  const cells = [...trees, ...STAIRS];
  const maxCol = Math.max(4, ...cells.map((t) => t.col || 1));

  // Faint placeholders only for holes inside a row's planted span — terraces
  // have different lengths, so cells outside the span are not missing trees.
  const occupied = new Set(cells.map((t) => `${t.row}-${t.col}`));
  const span = {};
  cells.forEach((t) => {
    const s = span[t.row] || { min: t.col, max: t.col };
    span[t.row] = { min: Math.min(s.min, t.col), max: Math.max(s.max, t.col) };
  });
  const gaps = [];
  Object.entries(span).forEach(([r, { min, max }]) => {
    for (let c = min; c <= max; c += 1) {
      if (!occupied.has(`${r}-${c}`)) gaps.push(`${r}-${c}`);
    }
  });

  return (
    <>
      <h1>Trees ({active.length})</h1>
      {error && <p className="error">{error}</p>}
      {saved && <p className="saved">Saved ✓</p>}

      {isOwner && (
        <button className="add-toggle secondary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add tree'}
        </button>
      )}

      {isOwner && showAdd && (
        <form className="panel card" onSubmit={submit}>
          <label className="field">
            Label
            <input
              required
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="T33"
            />
          </label>
          <div className="row2">
            <label className="field">
              Row
              <input type="number" min="1" value={form.row}
                onChange={(e) => setForm({ ...form, row: e.target.value })} />
            </label>
            <label className="field">
              Column
              <input type="number" min="1" value={form.col}
                onChange={(e) => setForm({ ...form, col: e.target.value })} />
            </label>
          </div>
          <div className="row2">
            <label className="field">
              Variety
              <input value={form.variety}
                onChange={(e) => setForm({ ...form, variety: e.target.value })}
                placeholder="Baladi, Souri…" />
            </label>
            <label className="field">
              Planted year
              <input type="number" value={form.planted_year}
                onChange={(e) => setForm({ ...form, planted_year: e.target.value })} />
            </label>
          </div>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save tree'}
          </button>
        </form>
      )}

      <div className="map-controls">
        <span className="seg">
          <button className={`chip ${view === 'map' ? 'on' : ''}`} onClick={() => setView('map')}>Map</button>
          <button className={`chip ${view === 'list' ? 'on' : ''}`} onClick={() => setView('list')}>List</button>
        </span>
        {view === 'map' && (
          <select value={colorBy} onChange={(e) => setColorBy(e.target.value)}>
            <option value="">Colour: none</option>
            <option value="press">Which press {season}</option>
            <option value="ripeness">Ripeness {season}</option>
            <option value="sacks">Sacks {season}</option>
            <option value="pruning_planned">Pruning planned</option>
            <option value="canopy_density">Canopy density</option>
            <option value="missing">Missing {season} data</option>
          </select>
        )}
        {isOwner && view === 'map' && (
          <button className={`chip select-toggle ${selecting ? 'on' : ''}`}
            onClick={() => { setSelecting(!selecting); setPicked([]); setOpenId(null); }}>
            {selecting ? '☑ Selecting — tap trees' : '☐ Select to log'}
          </button>
        )}
        <Link to="/season">Season sheet →</Link>
      </div>

      {view === 'map' && (
        <>
          <div className="grove-map-scroll">
          <div
            className="grove-map"
            style={{ gridTemplateColumns: `repeat(${maxCol}, 44px)` }}
          >
            {STAIRS.map((s) => (
              <span
                key={`stairs-${s.row}-${s.col}`}
                className="tree-dot stairs"
                style={{ gridRow: s.row, gridColumn: s.col }}
                title={s.title}
              >
                ⇡
              </span>
            ))}
            {gaps.map((cell) => {
              const [r, c] = cell.split('-');
              return (
                <span
                  key={cell}
                  className="tree-dot empty"
                  style={{ gridRow: Number(r), gridColumn: Number(c) }}
                  aria-hidden="true"
                />
              );
            })}
            {trees.map((t) => {
              const look = dotLook(t);
              const cls = ['tree-dot', t.status !== 'active' ? 'removed' : '', look.cls || '',
                picked.includes(t.id) ? 'picked' : '', t.id === focus || t.id === openId ? 'cur' : ''].join(' ');
              return (
                <button key={t.id} type="button" className={cls}
                  ref={t.id === focus ? (el) => el && el.scrollIntoView({ inline: 'center', block: 'nearest' }) : undefined}
                  style={{ gridRow: t.row || 'auto', gridColumn: t.col || 'auto', ...(look.style || {}) }}
                  title={t.variety || t.label} onClick={() => tapTree(t)}>
                  {t.label}
                  {look.badge && <span className="badge" />}
                </button>
              );
            })}
          </div>
          </div>
          <div className="grove-legend">
            <span><i className="legend-dot" /> active</span>
            <span><i className="legend-dot stairs" /> stairs</span>
            <span><i className="legend-dot removed" /> removed</span>
            <span><i className="legend-dot empty" /> empty</span>
          </div>
          {colorBy === 'press' && (
            <div className="map-legend">
              {palette.map((p) => <span key={p.id}><i style={{ background: p.color }} />{fmtDate(p.date).slice(0, -5)}</span>)}
              <span style={{ opacity: 0.6 }}>faded = no press set</span>
            </div>
          )}
          {colorBy && colorBy !== 'press' && colorBy !== 'missing' && (
            <div className="map-legend"><span>pale = low · dark = high</span><span style={{ opacity: 0.6 }}>faded = not entered</span></div>
          )}
          {colorBy === 'missing' && (
            <div className="map-legend">
              <span><i style={{ background: 'var(--gold)' }} />something missing</span>
              <span>sacks: {missingCount('sacks')} · ripeness: {missingCount('ripeness')} · pruning: {missingCount('pruning')} · no check: {missingCount('check')}</span>
            </div>
          )}
          <p className="sub" style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
            Tap a tree for its {season} numbers. Use “Select to log” to log work on several trees.
          </p>
        </>
      )}

      {view === 'list' && [...new Set(active.map((t) => t.row))].sort((a, b) => a - b).map((row) => (
        <div className="card sheet-scroll" key={row}>
          <b>Terrace {row}</b>
          <table className="sheet">
            <thead><tr><th>Tree</th><th>Ripe</th><th>Sacks</th><th>Pruning</th><th>Press</th></tr></thead>
            <tbody>
              {active.filter((t) => t.row === row).map((t) => {
                const c = checkOf.get(t.id);
                return (
                  <tr key={t.id}>
                    <td><Link to={`/trees/${t.id}`}>{t.label}</Link></td>
                    <td>{c?.ripeness ?? '—'}</td>
                    <td>{c?.sacks ?? '—'}</td>
                    <td>{c?.pruning_planned || '—'}</td>
                    <td>{c?.press_date ? fmtDate(c.press_date).slice(0, -5) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {openId && !selecting && !logFor && (
        <TreeSheet tree={trees.find((t) => t.id === openId)} check={checkOf.get(openId)} isOwner={isOwner}
          onClose={() => setOpenId(null)} onLog={() => { setLogFor([openId]); setOpenId(null); }} />
      )}
      {selecting && picked.length > 0 && !logFor && (
        <div className="tree-sheet">
          <div className="title">{picked.map((id) => trees.find((t) => t.id === id)?.label).join(', ')}</div>
          <div style={{ marginTop: 8 }}>
            <button onClick={() => setLogFor(picked)}>Log activity for {picked.length} tree{picked.length > 1 ? 's' : ''}</button>{' '}
            <button className="secondary" onClick={() => setPicked([])}>Clear</button>
          </div>
        </div>
      )}
      {logFor && (
        <>
          <div className="sheet-backdrop" onClick={() => setLogFor(null)} />
          <div className="tree-sheet" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
            <MapLogForm trees={trees} tasks={tasks} treeIds={logFor}
              onCancel={() => setLogFor(null)}
              onDone={() => { setLogFor(null); setPicked([]); setSelecting(false); navigate('/activities'); }} />
          </div>
        </>
      )}
    </>
  );
}
