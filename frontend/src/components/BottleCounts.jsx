import { useState } from 'react';

// Bottle counts; `value` = { 1: '2', 2.75: '', 3: '1' }. The standard 2.75 L
// bottle is the main box; 1 L and 3 L sit under "Other sizes" (open if used).
export default function BottleCounts({ value, onChange, withTanake, tanake, onTanake }) {
  const [others, setOthers] = useState(() => Boolean(Number(value[1]) || Number(value[3])));
  const box = (size, label, main) => (
    <div className={`item bottle-row ${main ? 'main' : ''}`} key={size}>
      <span>{label}</span>
      <input className="bottle-num" type="number" inputMode="numeric" min="0" step="1" value={value[size] ?? ''}
        onChange={(e) => onChange({ ...value, [size]: e.target.value })} />
    </div>
  );
  return (
    <div className="bottle-counts">
      {box(2.75, 'Bottles (2.75 L)', true)}
      {others ? (
        <>
          {box(1, '1 L bottles')}
          {box(3, '3 L bottles')}
        </>
      ) : (
        <button type="button" className="link-btn" onClick={() => setOthers(true)}>+ Other sizes (1 L, 3 L)</button>
      )}
      {withTanake && (
        <div className="item bottle-row">
          <span>Tanake not bottled yet</span>
          <input className="bottle-num" type="number" inputMode="decimal" min="0" step="0.5" value={tanake}
            onChange={(e) => onTanake(e.target.value)} />
        </div>
      )}
    </div>
  );
}
