import { inUnit, unitText, vintageFlows } from '../lib/oil.js';

const PARTS = [ // order in the bar
  ['home', 'home'], ['gift', 'gifts'], ['sale', 'sold'], ['soap', 'soap'], ['lost', 'lost'],
  ['reserve', 'soap reserve'], ['stock', 'in stock'],
];
const short = (kg, unit) => unitText(kg, unit).replace('≈ ', '').replace(/ bottles?$/, '');

// Where each season's oil went: a bar per pressing year (home / gifts / sold /
// soap / lost / soap reserve / still in stock), in the unit picked on the page.
export default function SeasonFlow({ movements, unit }) {
  const rows = vintageFlows(movements);
  const max = Math.max(1, ...rows.map((r) => r.pressed + r.added));
  return (
    <>
      <h2>By season</h2>
      <div className="card">
        {rows.map((r) => {
          const total = r.pressed + r.added;
          const parts = PARTS.map(([k, label]) => ({ k, label, kg: r[k] })).filter((p) => p.kg > 0.05);
          return (
            <div className="flow-row" key={r.year}>
              <div className="flow-top">
                <b>{r.year}</b>
                <span>{unitText(r.pressed, unit)} pressed
                  {r.added > 0.05 && <span className="sub"> · +{short(r.added, unit)} counted</span>}
                </span>
              </div>
              <div className="flow-track" style={{ width: `${(total / max) * 100}%` }}>
                {parts.map((p) => (
                  <span key={p.k} className={`flow-seg ${p.k}`} style={{ flexGrow: p.kg }}
                    title={`${p.label}: ${unitText(p.kg, unit)}`} />
                ))}
              </div>
              <div className="flow-parts">
                {parts.map((p) => (
                  <span key={p.k}><i className={`flow-key ${p.k}`} />{p.label} {short(p.kg, unit)}</span>
                ))}
              </div>
            </div>
          );
        })}
        <p className="sub flow-note">
          {unit === 'B' && 'Bottles = the standard 2.75 L bottle (rounded). '}
          A tanake is 16 kg ≈ 17.5 L. Oil going out uses the oldest year first unless a year was picked.
        </p>
      </div>
    </>
  );
}
