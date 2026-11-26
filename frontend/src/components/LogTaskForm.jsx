import { useState } from 'react';
import api, { ACTIVITY_TYPES, today } from '../api.js';
import TreeChips from './TreeChips.jsx';

// Guess the activity type from a seasonal task's name. The owner can change
// it in the form; anything unmatched falls back to Other.
const TYPE_RULES = [
  [/spray/i, 'Spraying'], // before harvest: "Copper Spray — Post-Harvest"
  [/harvest|press/i, 'Harvesting'],
  [/fertiliz|3odwe|kimewe/i, 'Fertilizing'],
  [/tech7il|prun|taqlim/i, 'Pruning'],
  [/weed/i, 'Weeding'],
  [/water/i, 'Watering'],
  [/fla7a|plow/i, 'Plowing'],
];
export const typeForTask = (name) => (TYPE_RULES.find(([re]) => re.test(name)) || [null, 'Other'])[1];

// Inline "log this task" form: pre-filled from the seasonal task (type, task
// name + notes); the owner adjusts date / notes / trees and saves.
export default function LogTaskForm({ task, trees, onDone, onCancel }) {
  const [form, setForm] = useState({
    date: today(),
    type: typeForTask(task.name),
    notes: task.notes ? `${task.name}\n\n${task.notes}` : task.name,
    tree_ids: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/activities', form);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit} style={{ marginTop: 8 }}>
      {error && <p className="error">{error}</p>}
      <div className="row2">
        <label className="field">
          Date
          <input type="date" required value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
        <label className="field">
          Type
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {ACTIVITY_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        Notes — edit to match what was actually done
        <textarea rows={8} value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </label>
      <TreeChips trees={trees} selected={form.tree_ids}
        onChange={(ids) => setForm({ ...form, tree_ids: ids })} />
      <div>
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save to log'}</button>{' '}
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
