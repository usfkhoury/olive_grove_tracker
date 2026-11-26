import { useState } from 'react';
import api, { today } from '../api.js';
import TreeChips from './TreeChips.jsx';

// Inline "log this task" form. The activity is linked to the seasonal task, so
// the log shows the task's current name (renames propagate). Notes start as
// the task's notes; the owner edits them to match what was actually done.
export default function LogTaskForm({ task, trees, onDone, onCancel }) {
  const [form, setForm] = useState({
    date: today(),
    task_id: task.id,
    notes: task.notes || '',
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
      <label className="field">
        Date
        <input type="date" required value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })} />
      </label>
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
