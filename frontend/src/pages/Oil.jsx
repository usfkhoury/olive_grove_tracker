import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import api, { fmtDate, today } from '../api.js';
import useCollection from '../useCollection.js';
import Info from '../components/Info.jsx';
import SeasonFlow from '../components/SeasonFlow.jsx';
import StockPanel from '../components/StockPanel.jsx';
import { SOAP_BATCH_KG } from '../constants.js';
import { lastOutflow, toLiters, toTanake, unitText, vintageFlows } from '../lib/oil.js';

const KIND_LABELS = {
  press: '🫒 Pressed',
  gift: '🎁 Gift',
  home: '🏠 Home use',
  sale: '💰 Sale',
  soap: '🧼 Made soap',
  reserve: '🧼 To soap reserve',
  adjustment: '⚖️ Adjustment',
};
const UNITS = [['B', 'Bottles'], ['L', 'Litres'], ['T', 'Tanake']];
const r1 = (n) => Math.round(n * 10) / 10;

// Presses come in as kg (from Harvest). Everything else goes through one
// "Update stock" panel: oil out, soap made, or a count. Saved as kg.
export default function Oil() {
  const [unit, setUnit] = useState(() => localStorage.getItem('oilUnit') || 'B');
  const [panel, setPanel] = useState(null); // null | 'new' | movement being edited
  const [batches, setBatches] = useState([]);
  const { isOwner } = useAuth();
  const { items: movements, error, create, update, remove, saving, saved } = useCollection('/oil/movements');

  useEffect(() => { api.get('/soap/batches').then(setBatches).catch(() => {}); }, []);
  const pickUnit = (u) => { setUnit(u); try { localStorage.setItem('oilUnit', u); } catch { /* private mode */ } };

  const flows = vintageFlows(movements);
  const stock = flows.reduce((a, r) => a + r.stock, 0);
  const reserve = flows.reduce((a, r) => a + r.reserve, 0);
  const vintages = flows.filter((r) => r.stock > 0.05).sort((a, b) => a.year - b.year);
  const reserveBy = flows.filter((r) => r.reserve > 0.05).sort((a, b) => a.year - b.year);
  const soapTracked = reserve > 0.05 || movements.some((m) => m.kind === 'soap' || m.kind === 'reserve');
  const lastOut = lastOutflow(movements);
  const staleDays = lastOut ? Math.round((new Date(today()) - new Date(lastOut)) / 864e5) : null;

  // Several entries (a count) are saved one by one; stop at the first failure.
  const createAll = async (entries) => {
    for (const entry of entries) {
      if (!(await create(entry))) throw new Error('Saving failed. Check Movements below before retrying.');
    }
    setPanel(null);
  };
  const updateOne = async (body) => {
    if (!(await update(panel.id, body))) throw new Error('Saving failed.');
    setPanel(null);
  };
  const onDelete = async () => {
    if (confirm('Delete this movement?') && await remove(panel.id)) setPanel(null);
  };

  return (
    <>
      <div className="oil-head">
        <h1>Oil Ledger</h1>
        <span className="seg" role="group" aria-label="Unit">
          {UNITS.map(([u, label]) => (
            <button key={u} type="button" className={`chip ${unit === u ? 'on' : ''}`} onClick={() => pickUnit(u)}>{label}</button>
          ))}
        </span>
      </div>
      {error && <p className="error">{error}</p>}
      {saved && <p className="saved">Saved ✓</p>}

      <div className="card">
        <div className="stat-big">{unitText(stock, unit)}</div>
        <div className="sub">olive oil in stock · {r1(stock)} kg (by the ledger)</div>
        {vintages.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {vintages.map((v, i) => (
              <span className={`chip ${i === 0 && vintages.length > 1 ? 'gold' : ''}`} key={v.year}>
                {v.year}: {unitText(v.stock, unit).replace('≈ ', '')}{i === 0 && vintages.length > 1 ? ' · use first' : ''}
              </span>
            ))}
          </div>
        )}
        {soapTracked && (
          <div className="reserve-box">
            <div className="reserve-top">
              <span>🧼 Soap reserve <Info term="soapReserve" /></span>
              <b>{r1(reserve)} kg <span className="sub">of {SOAP_BATCH_KG} kg for a batch</span></b>
            </div>
            <div className="reserve-bar"><span style={{ width: `${Math.min(100, (reserve / SOAP_BATCH_KG) * 100)}%` }} /></div>
            {reserveBy.length > 0 && (
              <div className="sub">{reserveBy.map((r) => `from ${r.year}: ${r1(r.reserve)} kg`).join(' · ')}</div>
            )}
          </div>
        )}
        {(staleDays == null || staleDays > 90) && (
          <p className="sub" style={{ marginTop: 8 }}>
            ⚠ No oil used or given has been logged {lastOut ? `since ${fmtDate(lastOut)}` : 'yet'}, so this is probably too high.
            Tap <b>Update stock → Count</b>.
          </p>
        )}
        {isOwner && panel !== 'new' && (
          <button className="update-btn" onClick={() => setPanel('new')}>Update stock</button>
        )}
        {isOwner && panel === 'new' && (
          <StockPanel movements={movements} batches={batches} unit={unit} saving={saving}
            onCreate={createAll} onClose={() => setPanel(null)} />
        )}
      </div>

      <SeasonFlow movements={movements} unit={unit} />

      <h2>Movements</h2>
      <div className="card">
        {movements.map((m) => (panel && panel !== 'new' && panel.id === m.id ? (
          <StockPanel key={m.id} movements={movements} batches={batches} unit={unit} saving={saving} editing={m}
            onUpdate={updateOne} onDelete={onDelete} onClose={() => setPanel(null)} />
        ) : (
          <div className="item" key={m.id}>
            <div>
              <div className="title">{KIND_LABELS[m.kind] || m.kind}</div>
              <div className="sub">
                {fmtDate(m.date)}{m.kind === 'press' ? ' · from Harvest' : ''}{m.vintage ? ` · ${m.vintage} oil` : ''}
              </div>
              {m.notes && <div className="sub" style={{ whiteSpace: 'pre-line', marginTop: 4 }}>{m.notes}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className={`amount ${m.kind === 'reserve' ? 'move' : m.amount_kg >= 0 ? 'in' : 'out'}`}>
                {m.kind === 'reserve' ? `→ ${Math.abs(m.amount_kg)}` : `${m.amount_kg >= 0 ? '+' : ''}${m.amount_kg}`} kg
              </span>
              <div className="sub">{toLiters(Math.abs(m.amount_kg))} L · {toTanake(Math.abs(m.amount_kg))} T</div>
              {isOwner && m.kind !== 'press' && (
                <div><button className="secondary small" onClick={() => setPanel(m)}>edit</button></div>
              )}
            </div>
          </div>
        )))}
      </div>
    </>
  );
}
