import { BOTTLE_SIZES } from '../lib/oil.js';

// One number input per bottle size. `value` = { 1: '2', 2.75: '', 3: '1' }.
export default function BottleCounts({ value, onChange, withTanake, tanake, onTanake }) {
  const row = (label, v, set, step = '1') => (
    <div className="item" key={label}>
      <span>{label}</span>
      <input className="bottle-num" type="number" inputMode="numeric" min="0" step={step} value={v}
        onChange={(e) => set(e.target.value)} />
    </div>
  );
  return (
    <div>
      {BOTTLE_SIZES.map((size) => row(`${size} L bottles`, value[size] ?? '', (v) => onChange({ ...value, [size]: v })))}
      {withTanake && row('Tanake not bottled yet', tanake, onTanake, '0.5')}
    </div>
  );
}
