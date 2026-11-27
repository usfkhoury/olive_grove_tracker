import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import api, { fmtDate, today } from '../api.js';
import useCollection from '../useCollection.js';
import OilForm from '../components/OilForm.jsx';
import SeasonFlow from '../components/SeasonFlow.jsx';
import StockCount from '../components/StockCount.jsx';
import {
  lastOutflow, stockByVintage, toLiters, toTanake,
} from '../lib/oil.js';

const KIND_LABELS = {
  press: '🫒 Pressed',
  gift: '🎁 Gift',
  home: '🏠 Home use',
  sale: '💰 Sale',
  adjustment: '⚖️ Adjustment',
};

const EMPTY = () => ({ date: today(), kind: 'home', amount_kg: '', notes: '' });

// Presses come in as kg (from Harvest); stock and outflows are counted in the
// 1 / 2.75 / 3 L bottles the oil is stored in. Everything is saved as kg.
export default function Oil() {
  const [summary, setSummary] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [counting, setCounting] = useState(false);
  const { isOwner } = useAuth();

  const refreshSummary = () =>
    api.get('/oil/summary').then(setSummary).catch(() => {});
  const { items: movements, error, create, update, remove, saving, saved } =
    useCollection('/oil/movements', { onChange: refreshSummary });

  useEffect(() => { refreshSummary(); }, []);

  const onDelete = async (id) => {
    if (confirm('Delete this movement?') && await remove(id)) setEditingId(null);
  };

  const vintages = stockByVintage(movements);
  const lastOut = lastOutflow(movements);
  const staleDays = lastOut ? Math.round((new Date(today()) - new Date(lastOut)) / 864e5) : null;
  // One entry per counted year; stop at the first failure (shown by the form).
  const saveCount = async (entries) => {
    for (const entry of entries) {
      if (!(await create(entry))) throw new Error(`Saving the ${entry.vintage} correction failed — check Movements before retrying.`);
    }
    setCounting(false);
  };

  return (
    <>
      <h1>Oil Ledger</h1>
      {error && <p className="error">{error}</p>}
      {saved && <p className="saved">Saved ✓</p>}

      {summary && (
        <div className="card">
          <div className="stat-big">{summary.balance_liters} L</div>
          <div className="sub">in stock ≈ {summary.balance_kg} kg · {summary.balance_tanake} tanake (by the ledger)</div>
          {vintages.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {vintages.map((v, i) => (
                <span className={`chip ${i === 0 && vintages.length > 1 ? 'gold' : ''}`} key={v.year}>
                  {v.year}: {toLiters(v.kg)} L{i === 0 && vintages.length > 1 ? ' — use first' : ''}
                </span>
              ))}
            </div>
          )}
          {(staleDays == null || staleDays > 90) && (
            <p className="sub" style={{ marginTop: 8 }}>
              ⚠ No oil used or given has been logged {lastOut ? `since ${fmtDate(lastOut)}` : 'yet'}, so this number is probably too high.
              Count the bottles and tap <b>Count stock</b>.
            </p>
          )}
          {isOwner && !counting && (
            <button className="secondary small" style={{ marginTop: 8 }} onClick={() => setCounting(true)}>Count stock</button>
          )}
          {isOwner && counting && (
            <StockCount movements={movements} saving={saving} onSave={saveCount} onCancel={() => setCounting(false)} />
          )}
        </div>
      )}

      {isOwner && (
        <button className="add-toggle" onClick={() => setShowAdd(!showAdd)} style={{ marginTop: 12 }}>
          {showAdd ? 'Cancel' : '+ Record oil out'}
        </button>
      )}

      {isOwner && showAdd && (
        <OilForm initial={EMPTY()} saving={saving} submitLabel="Save"
          onSave={async (b) => { if (await create(b)) setShowAdd(false); }} />
      )}

      <SeasonFlow movements={movements} />

      <h2>Movements</h2>
      <div className="card">
        {movements.map((m) => (editingId === m.id ? (
          <OilForm key={m.id} saving={saving} submitLabel="Save changes"
            initial={{ date: m.date, kind: m.kind, amount_kg: String(m.kind === 'adjustment' ? m.amount_kg : Math.abs(m.amount_kg)), notes: m.notes || '' }}
            onSave={async (b) => { if (await update(m.id, b)) setEditingId(null); }}
            onCancel={() => setEditingId(null)} onDelete={() => onDelete(m.id)} />
        ) : (
          <div className="item" key={m.id}>
            <div>
              <div className="title">{KIND_LABELS[m.kind] || m.kind}</div>
              <div className="sub">{fmtDate(m.date)}{m.kind === 'press' ? ' · from Harvest' : ''}</div>
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
              <div className="sub">{toLiters(Math.abs(m.amount_kg))} L · {toTanake(Math.abs(m.amount_kg))} T</div>
              {m.vintage && <div className="sub">{m.vintage} oil</div>}
              {isOwner && m.kind !== 'press' && (
                <div><button className="secondary small" onClick={() => setEditingId(m.id)}>edit</button></div>
              )}
            </div>
          </div>
        )))}
      </div>
    </>
  );
}
