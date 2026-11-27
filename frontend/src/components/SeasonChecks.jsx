import { useCallback, useEffect, useState } from 'react';
import api, { CHECK_OPTIONS, fmtDate } from '../api.js';
import Info from './Info.jsx';

// Per-season observations for one tree (Notion "Tree checks" DB):
// fruit size, ripeness at harvest (0–7), sacks, pruning plan.
const blank = (treeId) => ({
  tree_id: treeId,
  season: new Date().getFullYear(),
  press_id: '',
  fruit_size: '',
  ripeness: '',
  sacks: '',
  pruning_planned: '',
  notes: '',
});

function CheckForm({ initial, harvests, onSave, onCancel, onDelete, saving }) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const presses = harvests.filter((h) => h.date.startsWith(String(f.season)));

  const submit = (e) => {
    e.preventDefault();
    onSave({
      ...f,
      season: Number(f.season),
      press_id: f.press_id || null,
      ripeness: f.ripeness === '' ? null : Number(f.ripeness),
      sacks: f.sacks === '' ? null : Number(f.sacks),
    });
  };

  const select = (k, label, opts) => (
    <label className="field">
      {label}
      <select value={f[k] || ''} onChange={set(k)}>
        <option value="">—</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );

  return (
    <form className="panel" onSubmit={submit}>
      <div className="row2">
        <label className="field">
          Season
          <input type="number" min="2000" max="2100" required value={f.season} onChange={set('season')} />
        </label>
        <label className="field">
          Press
          <select value={f.press_id || ''} onChange={set('press_id')}>
            <option value="">—</option>
            {presses.map((h) => <option key={h.id} value={h.id}>{fmtDate(h.date)}</option>)}
          </select>
        </label>
      </div>
      {select('fruit_size', 'Fruit size', CHECK_OPTIONS.fruit_size)}
      <div className="row2">
        <label className="field">
          <span>Ripeness at harvest (0–7) <Info term="ripeness" /></span>
          <input type="number" min="0" max="7" step="0.5" value={f.ripeness ?? ''} onChange={set('ripeness')} />
        </label>
        <label className="field">
          <span>Sacks <Info term="sacks" /></span>
          <input type="number" min="0" step="0.5" value={f.sacks ?? ''} onChange={set('sacks')} />
        </label>
      </div>
      {select('pruning_planned', 'Pruning planned', CHECK_OPTIONS.pruning_planned)}
      <label className="field">
        Notes
        <textarea value={f.notes || ''} onChange={set('notes')} />
      </label>
      <div>
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>{' '}
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        {onDelete && <button type="button" className="danger" onClick={onDelete}>Delete</button>}
      </div>
    </form>
  );
}

export default function SeasonChecks({ treeId, isOwner }) {
  const [checks, setChecks] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [editing, setEditing] = useState(null); // check id, 'new', or null
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(
    () => api.get(`/checks?tree_id=${treeId}`).then(setChecks).catch((e) => setError(e.message)),
    [treeId],
  );
  useEffect(() => {
    reload();
    api.get('/harvests').then(setHarvests).catch(() => {});
  }, [reload]);

  const save = async (body, id) => {
    setError('');
    setSaving(true);
    try {
      if (id) await api.put(`/checks/${id}`, body);
      else await api.post('/checks', body);
      setEditing(null);
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c) => {
    if (!confirm(`Delete the ${c.season} check?`)) return;
    try {
      await api.del(`/checks/${c.id}`);
      setEditing(null);
      await reload();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <h2>Season checks</h2>
      {error && <p className="error">{error}</p>}
      {isOwner && editing !== 'new' && (
        <button className="add-toggle secondary" onClick={() => setEditing('new')}>+ Add season</button>
      )}
      {editing === 'new' && (
        <div className="card">
          <CheckForm initial={blank(treeId)} harvests={harvests} saving={saving}
            onSave={(b) => save(b)} onCancel={() => setEditing(null)} />
        </div>
      )}
      {checks.length === 0 && editing !== 'new' && (
        <div className="card"><p className="empty">No season checks for this tree yet.</p></div>
      )}
      {checks.map((c) => (
        <div className="card" key={c.id}>
          {editing === c.id ? (
            <CheckForm
              initial={{ ...c, press_id: c.press_id || '' }}
              harvests={harvests}
              saving={saving}
              onSave={(b) => save(b, c.id)}
              onCancel={() => setEditing(null)}
              onDelete={() => remove(c)}
            />
          ) : (
            <>
              <div className="season-head" style={{ cursor: 'default' }}>
                <span>
                  {c.season}
                  {c.press_date && <span className="season-sub"> · press {fmtDate(c.press_date)}</span>}
                </span>
                {isOwner && (
                  <button className="small secondary" onClick={() => setEditing(c.id)}>Edit</button>
                )}
              </div>
              <div className="tile-grid">
                <div className="stat">
                  <div className="value">{c.ripeness ?? '—'}</div>
                  <div className="label">Ripeness /7 <Info term="ripeness" /></div>
                </div>
                <div className="stat">
                  <div className="value">{c.sacks ?? '—'}</div>
                  <div className="label">Sacks <Info term="sacks" /></div>
                </div>
                <div className="stat">
                  <div className="value">{c.pruning_planned || '—'}</div>
                  <div className="label">Pruning</div>
                </div>
              </div>
              <div>
                {c.fruit_size && <span className="chip">Fruit: {c.fruit_size}</span>}
              </div>
              {c.notes && (
                <div className="sub" style={{ whiteSpace: 'pre-line', marginTop: 8, fontSize: '0.85rem' }}>
                  {c.notes}
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </>
  );
}
