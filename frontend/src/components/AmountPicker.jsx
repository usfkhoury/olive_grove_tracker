import { useState } from 'react';
import { amountLitres } from '../lib/oil.js';
import { KG_PER_L } from '../constants.js';

// − n + with a typeable number in the middle.
export function Stepper({ value, onChange, step = 1, label }) {
  const n = Number(value) || 0;
  const set = (v) => onChange(String(Math.max(0, Math.round(v * 100) / 100)));
  return (
    <div className="stepper">
      <button type="button" aria-label={`Less ${label}`} onClick={() => set(n - step)} disabled={n <= 0}>−</button>
      <input type="number" inputMode="decimal" min="0" step="any" value={value ?? ''} aria-label={label}
        onChange={(e) => onChange(e.target.value)} onFocus={(e) => e.target.select()} />
      <button type="button" aria-label={`More ${label}`} onClick={() => set(n + step)}>+</button>
    </div>
  );
}

const OTHER = [[1, '1 L bottles', 1], [3, '3 L bottles', 1], ['T', 'Tanake (16 kg tins)', 0.5]];

// How much oil: the main row (2.75 L bottles, or tins for the soap reserve),
// plus "Other sizes" for 1 L / 3 L bottles, tins and loose litres.
// value = { 2.75, 1, 3, T, L }; shows the total in L and kg underneath.
export default function AmountPicker({ value, onChange, main = 2.75, showTotal = true }) {
  const usesOther = Object.entries(value).some(([k, v]) => String(k) !== String(main) && Number(v) > 0);
  const [others, setOthers] = useState(usesOther);
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  const litres = amountLitres(value);
  const mainLabel = main === 'T' ? 'Tanake (16 kg tins)' : 'Bottles (2.75 L)';
  return (
    <div className="amount">
      <div className="amount-row main">
        <span>{mainLabel}</span>
        <Stepper value={value[main] ?? ''} onChange={set(main)} step={main === 'T' ? 0.5 : 1} label={mainLabel} />
      </div>
      {others ? (
        <>
          {OTHER.filter(([k]) => String(k) !== String(main)).map(([k, label, step]) => (
            <div className="amount-row" key={k}>
              <span>{label}</span>
              <Stepper value={value[k] ?? ''} onChange={set(k)} step={step} label={label} />
            </div>
          ))}
          {main !== 2.75 && (
            <div className="amount-row">
              <span>Bottles (2.75 L)</span>
              <Stepper value={value[2.75] ?? ''} onChange={set(2.75)} label="2.75 L bottles" />
            </div>
          )}
          <div className="amount-row">
            <span>Loose litres</span>
            <input className="bottle-num" type="number" inputMode="decimal" min="0" step="any" value={value.L ?? ''}
              onChange={(e) => set('L')(e.target.value)} aria-label="Loose litres" />
          </div>
        </>
      ) : (
        <button type="button" className="link-btn" onClick={() => setOthers(true)}>+ Other sizes (1 L, 3 L, tins, litres)</button>
      )}
      {showTotal && litres > 0 && (
        <div className="amount-total">= {litres} L · {Math.round(litres * KG_PER_L * 100) / 100} kg</div>
      )}
    </div>
  );
}
