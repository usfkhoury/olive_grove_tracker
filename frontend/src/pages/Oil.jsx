import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import api, { fmtDate, today } from '../api.js';
import useCollection from '../useCollection.js';

const KIND_LABELS = {
  press: '🫒 Pressed',
  gift: '🎁 Gift',
  home: '🏠 Home use',
  sale: '💰 Sale',
  adjustment: '⚖️ Adjustment',
};

const EMPTY = () => ({ date: today(), kind: 'home', amount_kg: '', notes: '' });

export default function Oil() {
  const [summary, setSummary] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY());
  const { isOwner } = useAuth();

  const refreshSummary = () =>
    api.get('/oil/summary').then(setSummary).catch(() => {});
  const { items: movements, error, create, remove, saving, saved } =
    useCollection('/oil/movements', { onChange: refreshSummary });

  useEffect(() => { refreshSummary(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    const created = await create({ ...form, amount_kg: Number(form.amount_kg) });
    if (created) {
      setForm(EMPTY());
      setShowAdd(false);
    }
  };

  const onDelete = (id) => {
    if (confirm('Delete this movement?')) remove(id);
  };

  return (
    <>
      <h1>Oil Ledger</h1>
      {error && <p className="error">{error}</p>}
      {saved && <p className="saved">Saved ✓</p>}

      {summary && (
        <div className="stat-grid">
          <div className="stat">
            <div className="value">{summary.balance_kg} kg</div>
            <div className="label">in stock</div>
          </div>
          <div className="stat">
            <div className="value">{summary.balance_tanake}</div>
            <div className="label">tanake (16L)</div>
          </div>
          <div className="stat">
            <div className="value">{summary.balance_liters} L</div>
            <div className="label">liters</div>
          </div>
        </div>
      )}

      {isOwner && (
        <button className="add-toggle" onClick={() => setShowAdd(!showAdd)} style={{ marginTop: 12 }}>
          {showAdd ? 'Cancel' : '+ Record Movement'}
        </button>
      )}

      {isOwner && showAdd && (
        <form className="panel card" onSubmit={submit}>
          <div className="row2">
            <label className="field">
              Date
              <input type="date" required value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label className="field">
              Type
              <select value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="home">Home use</option>
                <option value="gift">Gift</option>
                <option value="sale">Sale</option>
                <option value="adjustment">Stock adjustment (+/-)</option>
              </select>
            </label>
          </div>
          <label className="field">
            Amount (kg) — 1 tanake ≈ 15kg
            <input type="number" step="0.1" required value={form.amount_kg}
              onChange={(e) => setForm({ ...form, amount_kg: e.target.value })} />
          </label>
          <label className="field">
            Notes
            <textarea value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. 1 tanake to Amto" />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}

      <h2>Movements</h2>
      <div className="card">
        {movements.map((m) => (
          <div className="item" key={m.id}>
            <div>
              <div className="title">{KIND_LABELS[m.kind] || m.kind}</div>
              <div className="sub">{fmtDate(m.date)}</div>
              {m.notes && (
                <div className="sub" style={{ whiteSpace: 'pre-line', marginTop: 4 }}>
                  {m.notes}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className={`amount ${m.amount_kg >= 0 ? 'in' : 'out'}`}>
                {m.amount_kg >= 0 ? '+' : ''}{m.amount_kg} kg
              </span>
              {isOwner && m.kind !== 'press' && (
                <div><button className="danger small" onClick={() => onDelete(m.id)}>✕</button></div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
