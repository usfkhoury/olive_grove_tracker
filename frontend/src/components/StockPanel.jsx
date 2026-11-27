import { useState } from 'react';
import { today } from '../api.js';
import { BOTTLE_L, KG_PER_L, SOAP_BATCH_KG, TANAKE_KG } from '../constants.js';
import { amountLitres, countPlan, unitText, vintageFlows } from '../lib/oil.js';
import AmountPicker from './AmountPicker.jsx';
import Info from './Info.jsx';

const r2 = (n) => Math.round(n * 100) / 100;
const r1 = (n) => Math.round(n * 10) / 10;
const kgOf = (litres) => r2(litres * KG_PER_L);
const OUT_FOR = [['home', '🏠 Home'], ['gift', '🎁 Gift'], ['sale', '💰 Sale'], ['reserve', '🧼 Soap reserve']];
const REASONS = [['home', 'Home use'], ['gift', 'Gifts'], ['adjustment', 'Lost / spilled']];
const NOTE_HINT = { home: 'Optional', gift: 'Who to, e.g. Amto', sale: 'Who / price', reserve: 'e.g. 2024 leftovers' };

// kg → picker value: whole 2.75 L bottles when it fits, else loose litres.
function pickerFromKg(kg) {
  const l = Math.abs(kg) / KG_PER_L;
  const b = Math.round(l / BOTTLE_L);
  return b > 0 && Math.abs(b * BOTTLE_L - l) < 0.05 ? { 2.75: String(b) } : { L: String(r2(l)) };
}
const Chips = ({ options, value, onChange }) => (
  <div className="chip-pick">
    {options.map(([k, label]) => (
      <button key={k} type="button" className={`chip ${String(value) === String(k) ? 'on' : ''}`}
        aria-pressed={String(value) === String(k)} onClick={() => onChange(k)}>{label}</button>
    ))}
  </div>
);

// One place to change the stock: oil taken out (home / gift / sale / into the
// soap reserve), soap made, or a count of what's left. `editing` = a movement
// to edit (opens the matching tab, prefilled).
export default function StockPanel({ movements, batches, unit, editing, saving, onCreate, onUpdate, onDelete, onClose }) {
  const base = movements.filter((m) => m.id !== editing?.id);
  const flows = vintageFlows(base);
  const withStock = flows.filter((r) => r.stock > 0.05).sort((a, b) => a.year - b.year);
  const reserveKg = r2(flows.reduce((a, r) => a + r.reserve, 0));
  const initialTab = editing ? (editing.kind === 'soap' ? 'soap' : editing.kind === 'adjustment' ? 'adj' : 'out') : 'out';
  const [tab, setTab] = useState(initialTab);
  const [error, setError] = useState('');

  const save = async (entries) => {
    setError('');
    try {
      if (editing) await onUpdate(entries[0]);
      else await onCreate(entries);
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="panel stock-panel">
      {!editing && (
        <div className="seg tabs" role="tablist">
          {[['out', 'Took oil out'], ['soap', 'Made soap'], ['count', 'Count']].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k}
              className={`chip ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      )}
      {tab === 'out' && <TakeOut {...{ flows, withStock, reserveKg, unit, editing, saving, save }} />}
      {tab === 'soap' && <MakeSoap {...{ flows, reserveKg, batches, movements: base, editing, saving, save }} />}
      {tab === 'count' && <Count {...{ flows, withStock, reserveKg, movements: base, saving, save }} />}
      {tab === 'adj' && (
        <p className="sub">Old stock adjustment ({editing.amount_kg} kg). New counts are entered per year in <b>Count</b>; this one can only be deleted.</p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="panel-foot">
        <button type="button" className="secondary" onClick={onClose}>Cancel</button>
        {editing && <button type="button" className="danger" onClick={onDelete}>Delete</button>}
      </div>
    </div>
  );
}

function TakeOut({ flows, withStock, reserveKg, unit, editing, saving, save }) {
  const [kind, setKind] = useState(editing?.kind || 'home');
  const [vintage, setVintage] = useState(editing ? editing.vintage : withStock[0]?.year ?? null);
  const [amount, setAmountRaw] = useState(editing ? pickerFromKg(editing.amount_kg) : { 2.75: '1' });
  const [amountChanged, setAmountChanged] = useState(false);
  const setAmount = (v) => { setAmountRaw(v); setAmountChanged(true); };
  const [notes, setNotes] = useState(editing?.notes || '');
  const [date, setDate] = useState(editing?.date || today());
  // An edit that doesn't touch the amount keeps the stored kg exactly.
  const kg = editing && !amountChanged ? Math.abs(editing.amount_kg) : kgOf(amountLitres(amount));
  const from = flows.find((r) => r.year === vintage);
  const left = from ? from.stock : 0;

  const submit = (e) => {
    e.preventDefault();
    save([{ date, kind, amount_kg: -kg, vintage, notes }]);
  };
  return (
    <form onSubmit={submit}>
      <div className="field">For</div>
      <Chips options={OUT_FOR} value={kind} onChange={setKind} />
      {(withStock.length > 0 || vintage) && (
        <>
          <div className="field">From</div>
          <Chips value={vintage}
            options={[...new Set([...withStock.map((r) => r.year), ...(vintage ? [vintage] : [])])].sort()
              .map((y, i) => [y, `${y} oil${i === 0 && withStock.length > 1 ? ' · use first' : ''}`])}
            onChange={setVintage} />
        </>
      )}
      <AmountPicker value={amount} onChange={setAmount} />
      <label className="field">
        {kind === 'gift' || kind === 'sale' ? 'To' : 'Note'}
        <textarea rows={notes.length > 40 ? 3 : 1} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={NOTE_HINT[kind]} />
      </label>
      <label className="field">
        Date
        <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {kg > 0 && from && (
        <p className="preview">
          {vintage} oil: {unitText(left, unit)} → {unitText(Math.max(0, left - kg), unit)}
          {kind === 'reserve' && <> · soap reserve {reserveKg} → {r2(reserveKg + Math.min(kg, left))} kg</>}
          {kg > left + 0.05 && <span className="warn"> · more than is left of {vintage}; the rest comes from the next year</span>}
        </p>
      )}
      <button type="submit" disabled={saving || kg <= 0}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save'}</button>
    </form>
  );
}

function MakeSoap({ flows, reserveKg, batches, movements, editing, saving, save }) {
  const logged = new Set(movements.filter((m) => m.soap_batch_id).map((m) => m.soap_batch_id));
  const [batchId, setBatchId] = useState(editing?.soap_batch_id || '');
  const [kg, setKg] = useState(editing ? String(Math.abs(editing.amount_kg)) : '');
  const [date, setDate] = useState(editing?.date || today());
  const [notes, setNotes] = useState(editing?.notes || '');
  const pickBatch = (id) => {
    setBatchId(id);
    const b = batches.find((x) => x.id === id);
    if (!b) return;
    if (b.oil_g) setKg(String(b.oil_g / 1000));
    if (b.date) setDate(b.date);
    setNotes(`Soap batch ${b.name}`);
  };
  const n = Number(kg) || 0;
  const fromReserve = Math.min(reserveKg, n);
  const oldest = flows.filter((r) => r.stock > 0.05).sort((a, b) => a.year - b.year)[0];

  const submit = (e) => {
    e.preventDefault();
    save([{ date, kind: 'soap', amount_kg: -n, notes, soap_batch_id: batchId || null, vintage: editing?.vintage ?? null }]);
  };
  return (
    <form onSubmit={submit}>
      {batches.length > 0 && (
        <label className="field">
          Soap batch (from the soap app)
          <select value={batchId} onChange={(e) => pickBatch(e.target.value)}>
            <option value="">Not in the soap app</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id} disabled={logged.has(b.id) && b.id !== editing?.soap_batch_id}>
                {b.name}{b.status ? ` · ${b.status}` : ''}{logged.has(b.id) && b.id !== editing?.soap_batch_id ? ' · logged ✓' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        Oil used (kg)
        <input type="number" inputMode="decimal" min="0" step="any" required value={kg} onChange={(e) => setKg(e.target.value)} />
      </label>
      <button type="button" className="chip" onClick={() => setKg(String(SOAP_BATCH_KG))}>1 tanake ({TANAKE_KG} kg)</button>
      <label className="field">
        Date
        <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        Note
        <textarea rows={notes.length > 40 ? 3 : 1} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </label>
      {n > 0 && (
        <p className="preview">
          {fromReserve > 0 ? `${r2(fromReserve)} kg from the soap reserve` : 'Soap reserve is empty'}
          {n - fromReserve > 0.05 && `${fromReserve > 0 ? ' + ' : ' — '}${r2(n - fromReserve)} kg from cooking oil${oldest ? ` (${oldest.year} first)` : ''}`}
        </p>
      )}
      <button type="submit" disabled={saving || n <= 0}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save'}</button>
    </form>
  );
}

function Count({ flows, withStock, reserveKg, movements, saving, save }) {
  const thisYear = Number(today().slice(0, 4));
  const years = [...new Set([...withStock.map((r) => r.year), ...flows.filter((r) => r.year === thisYear).map((r) => r.year)])].sort();
  const showReserve = reserveKg > 0.05 || movements.some((m) => m.kind === 'reserve' || m.kind === 'soap');
  const ledgerOf = (key) => (key === 'reserve' ? reserveKg : flows.find((r) => r.year === Number(key))?.stock || 0);
  // Rows start at the ledger's estimate; only rows you change are counted.
  const start = (key) => (key === 'reserve'
    ? { T: String(Math.round((reserveKg / TANAKE_KG) * 2) / 2) }
    : { 2.75: String(Math.round(ledgerOf(key) / KG_PER_L / BOTTLE_L)) });
  const [counts, setCounts] = useState({});
  const [reason, setReason] = useState('home');
  const get = (key) => counts[key] || start(key);
  const counted = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, amountLitres(v)]));
  const plan = countPlan(flows, counted, reason, today());

  const describe = (key) => {
    const v = counts[key];
    const parts = [[2.75, '× 2.75 L'], [1, '× 1 L'], [3, '× 3 L'], ['T', 'tanake']]
      .filter(([k]) => Number(v[k]) > 0).map(([k, s]) => `${v[k]} ${s}`);
    if (Number(v.L) > 0) parts.push(`${v.L} L loose`);
    return parts.join(', ') || 'nothing';
  };
  const submit = (e) => {
    e.preventDefault();
    const label = REASONS.find(([k]) => k === reason)[1].toLowerCase();
    save(plan.map((p) => {
      const key = p.vintage ?? 'reserve';
      const what = key === 'reserve'
        ? (p.kind === 'soap' ? 'used for soap, not logged before' : 'moved from cooking oil, not logged before')
        : (p.amount_kg < 0 ? `${label}, not logged before` : 'more than the ledger');
      const name = key === 'reserve' ? 'soap reserve' : `${key} oil`;
      return { ...p, notes: `Stock count of ${name}: ${describe(key)} = ${counted[key]} L; ledger said ${r2(ledgerOf(key) / KG_PER_L)} L (${what})` };
    }));
  };
  const row = (key, title) => {
    const p = plan.find((x) => String(x.vintage ?? 'reserve') === key);
    const touched = key in counts;
    const diffKg = p ? Math.abs(p.amount_kg) : 0;
    return (
      <fieldset className={`count-year ${touched ? '' : 'untouched'}`} key={key}>
        <legend>{title} <span className="sub">· ledger {key === 'reserve' ? `${r2(ledgerOf(key))} kg` : unitText(ledgerOf(key), 'B')}</span></legend>
        <AmountPicker value={get(key)} main={key === 'reserve' ? 'T' : 2.75} showTotal={false}
          onChange={(v) => setCounts((c) => ({ ...c, [key]: v }))} />
        <div className={`count-result ${!touched ? '' : !p ? 'ok' : 'short'}`}>
          {!touched ? 'Not counted yet. Use − / + to set what is really there.'
            : !p ? `Counted ${counted[key]} L · matches the ledger`
              : `Counted ${counted[key]} L · ${key === 'reserve'
                ? (p.kind === 'soap' ? `${r2(diffKg)} kg less: recorded as soap made` : `${r2(diffKg)} kg more: recorded as moved from cooking oil`)
                : p.amount_kg < 0 ? `${r1(diffKg / KG_PER_L)} L (${unitText(diffKg, 'B')}) went out unlogged`
                  : `${r1(diffKg / KG_PER_L)} L more than the ledger`}`}
        </div>
      </fieldset>
    );
  };
  return (
    <form onSubmit={submit}>
      <div className="field">Count what's at home <Info term="adjustment" /></div>
      {years.map((y) => row(String(y), `${y} oil`))}
      {showReserve && row('reserve', <>Soap reserve <Info term="soapReserve" /></>)}
      {plan.some((p) => p.vintage && p.amount_kg < 0) && (
        <>
          <div className="field">Oil that went out unlogged was mostly</div>
          <Chips options={REASONS} value={reason} onChange={setReason} />
        </>
      )}
      <button type="submit" disabled={saving || plan.length === 0}>
        {saving ? 'Saving…' : plan.length ? `Save ${plan.length} correction${plan.length > 1 ? 's' : ''}` : 'Nothing to save yet'}
      </button>
    </form>
  );
}
