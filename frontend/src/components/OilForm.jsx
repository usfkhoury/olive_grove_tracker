import { useState } from 'react';
import { KG_PER_L } from '../constants.js';
import { bottlesToLiters, litersToKg } from '../lib/oil.js';
import BottleCounts from './BottleCounts.jsx';

// Oil going out (or an adjustment), counted in bottles, or litres typed
// directly. Saved as kg. `initial.amount_kg` is a string of kg ('' when new).
export default function OilForm({ initial, saving, submitLabel, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState({ date: initial.date, kind: initial.kind, notes: initial.notes });
  const [bottles, setBottles] = useState({});
  const [liters, setLiters] = useState(
    initial.amount_kg === '' ? '' : String(Math.round((Number(initial.amount_kg) / KG_PER_L) * 100) / 100));
  const fromBottles = bottlesToLiters(bottles);
  const totalL = fromBottles > 0 ? fromBottles : Number(liters || 0);

  const submit = (e) => {
    e.preventDefault();
    if (!totalL) return;
    onSave({ ...form, amount_kg: litersToKg(totalL) });
  };

  return (
    <form className="panel card" onSubmit={submit}>
      <div className="row2">
        <label className="field">
          Date
          <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
        <label className="field">
          Type
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="home">Home use</option>
            <option value="gift">Gift</option>
            <option value="sale">Sale</option>
            <option value="adjustment">Stock adjustment (+/-)</option>
          </select>
        </label>
      </div>
      <BottleCounts value={bottles} onChange={setBottles} />
      <label className="field">
        …or litres
        <input type="number" inputMode="decimal" step="0.25" value={fromBottles > 0 ? fromBottles : liters}
          disabled={fromBottles > 0} onChange={(e) => setLiters(e.target.value)} />
      </label>
      {totalL !== 0 && <p className="sub">= {totalL} L ≈ {litersToKg(Math.abs(totalL))} kg</p>}
      <label className="field">
        Notes — who / what for
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="e.g. 2 bottles to Amto" />
      </label>
      <div>
        <button type="submit" disabled={saving || !totalL}>{saving ? 'Saving…' : submitLabel}</button>{' '}
        {onCancel && <button type="button" className="secondary" onClick={onCancel}>Cancel</button>}
        {onDelete && <button type="button" className="danger" onClick={onDelete}>Delete</button>}
      </div>
    </form>
  );
}
