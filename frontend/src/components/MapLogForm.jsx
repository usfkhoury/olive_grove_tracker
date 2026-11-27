import { useState } from 'react';
import api, { today } from '../api.js';
import TreeChips from './TreeChips.jsx';

// Log an activity for trees picked on the map. Pick a seasonal task (linked by
// relation, so it ticks that task) or Other. Notes start as the task's notes.
export default function MapLogForm({ trees, tasks, treeIds, onDone, onCancel }) {
  const [form, setForm] = useState({ date: today(), task_id: '', notes: '', tree_ids: treeIds });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pickTask = (id) => {
    const t = tasks.find((x) => x.id === id);
    setForm({ ...form, task_id: id, notes: t ? t.notes || '' : '' });
  };
  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      const body = { date: form.date, notes: form.notes, tree_ids: form.tree_ids };
      if (form.task_id) body.task_id = form.task_id; else body.type = 'Other';
      await api.post('/activities', body);
      onDone();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return (
    <form className="panel" onSubmit={submit}>
      {error && <p className="error">{error}</p>}
      <div className="row2">
        <label className="field">
          What
          <select value={form.task_id} onChange={(e) => pickTask(e.target.value)}>
            <option value="">Other (describe in notes)</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="field">
          Date
          <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
      </div>
      <label className="field">
        Notes
        <textarea rows={4} required={!form.task_id} value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </label>
      <TreeChips trees={trees} selected={form.tree_ids} onChange={(ids) => setForm({ ...form, tree_ids: ids })} />
      <div>
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save to log'}</button>{' '}
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
