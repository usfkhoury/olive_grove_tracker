import { useState } from 'react';
import { inUnit, vintageFlows } from '../lib/oil.js';

const UNITS = [['L', 'Litres'], ['T', 'Tanake'], ['B', 'Bottles']];
const PARTS = [ // order in the bar
  ['home', 'home'], ['gift', 'gifts'], ['sale', 'sold'], ['lost', 'lost'], ['stock', 'in stock'],
];
const fmt = (n, unit) => (unit === 'B' ? `≈ ${n}` : unit === 'T' ? `${n} T` : `${n} L`);
const word = (unit) => (unit === 'B' ? ' bottles' : '');

// Where each season's oil went: a bar per pressing year (home / gifts / sold /
// lost / still in stock), numbers in one unit chosen with the toggle.
export default function SeasonFlow({ movements }) {
  const [unit, setUnit] = useState(() => localStorage.getItem('oilUnit') || 'B');
  const pick = (u) => { setUnit(u); try { localStorage.setItem('oilUnit', u); } catch { /* private mode */ } };
  const rows = vintageFlows(movements);
  const max = Math.max(1, ...rows.map((r) => r.pressed + r.added));

  return (
    <>
      <div className="flow-head">
        <h2>By season</h2>
        <span className="seg" role="group" aria-label="Unit">
          {UNITS.map(([u, label]) => (
            <button key={u} type="button" className={`chip ${unit === u ? 'on' : ''}`} onClick={() => pick(u)}>{label}</button>
          ))}
        </span>
      </div>
      <div className="card">
        {rows.map((r) => {
          const total = r.pressed + r.added;
          const parts = PARTS.map(([k, label]) => ({ k, label, kg: r[k], n: inUnit(r[k], unit) }))
            .filter((p) => p.kg > 0.05);
          return (
            <div className="flow-row" key={r.year}>
              <div className="flow-top">
                <b>{r.year}</b>
                <span>{fmt(inUnit(r.pressed, unit), unit)}{word(unit)} pressed
                  {r.added > 0.05 && <span className="sub"> · +{fmt(inUnit(r.added, unit), unit)} counted</span>}
                </span>
              </div>
              <div className="flow-track" style={{ width: `${(total / max) * 100}%` }}>
                {parts.map((p) => (
                  <span key={p.k} className={`flow-seg ${p.k}`} style={{ flexGrow: p.kg }}
                    title={`${p.label}: ${fmt(p.n, unit)}${word(unit)}`} />
                ))}
              </div>
              <div className="flow-parts">
                {parts.map((p) => (
                  <span key={p.k}><i className={`flow-key ${p.k}`} />{p.label} {fmt(p.n, unit).replace('≈ ', '')}</span>
                ))}
              </div>
            </div>
          );
        })}
        <p className="sub flow-note">
          {unit === 'B' && 'Bottles = the standard 2.75 L bottle (rounded). 1 L and 3 L bottles are entered when you log or count them. '}
          Outflows use up the oldest oil first.
        </p>
      </div>
    </>
  );
}
