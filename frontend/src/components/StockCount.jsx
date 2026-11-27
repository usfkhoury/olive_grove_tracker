import { useState } from 'react';
import { today } from '../api.js';
import { BOTTLE_L, KG_PER_L } from '../constants.js';
import { bottlesToLiters, countPlan, vintageFlows } from '../lib/oil.js';
import BottleCounts from './BottleCounts.jsx';
import Info from './Info.jsx';

const REASONS = [
  ['home', 'Home use'], ['gift', 'Gifts'], ['adjustment', 'Lost / spilled'],
];
const asBottles = (litres) => Math.round(litres / BOTTLE_L);
const litresOf = (kg) => Math.round((kg / KG_PER_L) * 10) / 10;

// Count the oil at home year by year. Each year's difference with the ledger
// becomes one entry tagged with that vintage: a shortfall is recorded as home
// use / gifts / lost (your choice), a surplus as a + adjustment.
export default function StockCount({ movements, onSave, onCancel, saving }) {
  const flows = vintageFlows(movements);
  const thisYear = new Date().getFullYear();
  const years = [...new Set([...flows.filter((r) => r.stock > 0.05).map((r) => r.year), thisYear])]
    .filter((y) => flows.some((r) => r.year === y)).sort((a, b) => a - b);
  const [counts, setCounts] = useState({}); // year → { bottles: {}, tanake: '' }
  const [reason, setReason] = useState('home');
  const [error, setError] = useState('');

  const get = (y) => counts[y] || { bottles: {}, tanake: '' };
  const set = (y, part) => setCounts((c) => ({ ...c, [y]: { ...get(y), ...part } }));
  const entered = years.filter((y) => {
    const c = get(y);
    return Object.values(c.bottles).some((v) => v !== '') || c.tanake !== '';
  });
  const counted = Object.fromEntries(entered.map((y) => [y, bottlesToLiters(get(y).bottles, get(y).tanake)]));
  const plan = countPlan(flows, counted, reason, today());

  const describe = (y) => {
    const c = get(y);
    const parts = Object.entries(c.bottles).filter(([, n]) => Number(n) > 0).map(([s, n]) => `${n} × ${s} L`);
    if (Number(c.tanake) > 0) parts.push(`${c.tanake} tanake unbottled`);
    return parts.join(', ') || 'nothing';
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    const label = REASONS.find(([k]) => k === reason)[1].toLowerCase();
    const body = plan.map((p) => {
      const ledgerL = litresOf(flows.find((r) => r.year === p.vintage)?.stock || 0);
      const what = p.amount_kg < 0 ? `${label}, not logged before` : 'more than the ledger';
      return { ...p, notes: `Stock count of ${p.vintage} oil: ${describe(p.vintage)} = ${counted[p.vintage]} L; ledger said ${ledgerL} L (${what})` };
    });
    try { await onSave(body); } catch (err) { setError(err.message); }
  };

  return (
    <form className="panel stock-count" onSubmit={save}>
      <div className="field">Count what's at home, per year <Info term="adjustment" /></div>
      {years.map((y) => {
        const ledger = flows.find((r) => r.year === y)?.stock || 0;
        const p = plan.find((x) => x.vintage === y);
        return (
          <fieldset className="count-year" key={y}>
            <legend>{y} oil <span className="sub">· ledger ≈ {asBottles(litresOf(ledger))} bottles ({litresOf(ledger)} L)</span></legend>
            <BottleCounts value={get(y).bottles} onChange={(b) => set(y, { bottles: b })}
              withTanake tanake={get(y).tanake} onTanake={(t) => set(y, { tanake: t })} />
            {y in counted && (
              <div className={`count-result ${p ? (p.amount_kg < 0 ? 'short' : 'over') : 'ok'}`}>
                Counted {counted[y]} L (≈ {asBottles(counted[y])} bottles) —{' '}
                {!p ? 'matches the ledger'
                  : p.amount_kg < 0 ? `${litresOf(-p.amount_kg)} L (≈ ${asBottles(litresOf(-p.amount_kg))} bottles) went out unlogged`
                    : `${litresOf(p.amount_kg)} L more than the ledger`}
              </div>
            )}
          </fieldset>
        );
      })}
      <p className="sub" style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
        Leave a year empty to skip it. Enter 0 if none of that year's oil is left.
      </p>
      {plan.some((p) => p.amount_kg < 0) && (
        <label className="field">
          Oil that went out unlogged was mostly
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving || plan.length === 0}>
        {plan.length ? `Save ${plan.length} correction${plan.length > 1 ? 's' : ''}` : 'Save count'}
      </button>{' '}
      <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
    </form>
  );
}
