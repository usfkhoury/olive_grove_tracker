import { useState } from 'react';

const tanakeFrom = (oil) => (oil ? String(Math.round((Number(oil) / 15) * 10) / 10) : '');

// Add or edit one pressing session. `initial` holds strings (form values).
export default function HarvestForm({ initial, saving, submitLabel, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState(initial);
  const [tanakeEdited, setTanakeEdited] = useState(initial.tanake !== '');

  const submit = (e) => {
    e.preventDefault();
    onSave({
      date: form.date,
      olives_kg: Number(form.olives_kg),
      oil_kg: Number(form.oil_kg),
      tanake: form.tanake === '' ? null : Number(form.tanake),
      notes: form.notes,
    });
  };

  return (
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
              setForm((f) => ({ ...f, oil_kg: oil, tanake: tanakeEdited ? f.tanake : tanakeFrom(oil) }));
            }} />
        </label>
      </div>
      <label className="field">
        Tanake — estimated from oil weight (16L ≈ 15kg), edit if different
        <input type="number" step="0.1" min="0" value={form.tanake}
          onChange={(e) => { setTanakeEdited(true); setForm({ ...form, tanake: e.target.value }); }} />
      </label>
      <label className="field">
        Notes
        <textarea value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="which press, waiting time, fruit condition…" />
      </label>
      <div>
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : submitLabel}</button>{' '}
        {onCancel && <button type="button" className="secondary" onClick={onCancel}>Cancel</button>}
        {onDelete && <button type="button" className="danger" onClick={onDelete}>Delete</button>}
      </div>
    </form>
  );
}
