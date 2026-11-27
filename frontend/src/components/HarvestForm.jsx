import { useState } from 'react';
import PressTreePicker from './PressTreePicker.jsx';

const tanakeFrom = (oil) => (oil ? String(Math.round((Number(oil) / 15) * 10) / 10) : '');

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Add or edit one pressing session. `initial` holds strings (form values) plus
// tree_ids. `checks` (all seasons) and `harvests` show which trees are already
// in another press of the same season; `harvestId` is null for a new press.
export default function HarvestForm({
  initial, saving, submitLabel, onSave, onCancel, onDelete,
  trees = [], checks = [], harvests = [], harvestId = null,
}) {
  const [form, setForm] = useState(initial);
  const year = Number(form.date.slice(0, 4));
  const pressDate = new Map(harvests.map((h) => [h.id, h.date]));
  const taken = new Map(checks
    .filter((c) => c.season === year && c.press_id && c.press_id !== harvestId && pressDate.has(c.press_id))
    .map((c) => [c.tree_id, shortDate(pressDate.get(c.press_id))]));
  const [tanakeEdited, setTanakeEdited] = useState(initial.tanake !== '');

  const submit = (e) => {
    e.preventDefault();
    onSave({
      date: form.date,
      olives_kg: Number(form.olives_kg),
      oil_kg: Number(form.oil_kg),
      tanake: form.tanake === '' ? null : Number(form.tanake),
      notes: form.notes,
      // Only when the picker was shown, so a slow load never clears a press's trees.
      ...(trees.length ? { tree_ids: form.tree_ids } : {}),
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
      {trees.length > 0 && (
        <PressTreePicker trees={trees} selected={form.tree_ids} taken={taken}
          onChange={(ids) => setForm({ ...form, tree_ids: ids })} />
      )}
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
