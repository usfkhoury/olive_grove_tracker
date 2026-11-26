import { useState } from 'react';
import api from '../api.js';
import TreeChips from './TreeChips.jsx';

// Edit an existing log entry: date, notes, trees. The task link (or "Other")
// is kept as-is — the label always follows the linked task's name.
export default function EditActivityForm({ activity, trees, onDone, onCancel, onDelete }) {
  const [form, setForm] = useState({
    date: activity.date,
    notes: activity.notes || '',
    tree_ids: activity.trees.map((t) => t.id),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.put(`/activities/${activity.id}`, {
        ...form,
        task_id: activity.task_id || null,
        type: 'Other',
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit} style={{ width: '100%' }}>
      {error && <p className="error">{error}</p>}
      <div className="title">{activity.label}</div>
      <label className="field">
        Date
        <input type="date" required value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })} />
      </label>
      <label className="field">
        Notes
        <textarea rows={8} value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </label>
      <TreeChips trees={trees} selected={form.tree_ids}
        onChange={(ids) => setForm({ ...form, tree_ids: ids })} />
      <div>
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>{' '}
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="danger" onClick={onDelete}>Delete</button>
      </div>
    </form>
  );
}
