import { Link } from 'react-router-dom';
import { SOAP_BATCH_KG } from '../constants.js';
import { inUnit, vintageFlows } from '../lib/oil.js';

const r1 = (n) => Math.round(n * 10) / 10;
const bottles = (kg) => { const n = inUnit(kg, 'B'); return `${n} bottle${n === 1 ? '' : 's'}`; };

// Top of Home: oil at home (bottles first), this season's harvest, task progress.
// Each block opens its page. `movements` may still be loading ([]).
export default function HomeStats({ movements, season, tasks }) {
  const flows = vintageFlows(movements);
  const stock = flows.reduce((a, r) => a + r.stock, 0);
  const reserve = flows.reduce((a, r) => a + r.reserve, 0);
  const vintages = flows.filter((r) => r.stock > 0.05).sort((a, b) => a.year - b.year);
  const critical = tasks.due.some((t) => /critical/i.test(t.name));
  const pct = tasks.started ? Math.round((tasks.logged / tasks.started) * 100) : 0;

  return (
    <div className="home-stats">
      <Link to="/oil" className="home-card oil">
        <div className="home-head"><span>Oil at home</span><span aria-hidden="true">›</span></div>
        {movements.length === 0 ? <div className="home-big">…</div> : (
          <>
            <div className="home-big">≈ {bottles(stock)}</div>
            <div className="home-units">
              <span>{r1(stock)} kg</span><span>{inUnit(stock, 'L')} L</span><span>{inUnit(stock, 'T')} tanake</span>
            </div>
            {vintages.length > 0 && (
              <div className="home-chips">
                {vintages.map((v, i) => (
                  <span key={v.year} className={`chip ${i === 0 && vintages.length > 1 ? 'gold' : ''}`}>
                    {v.year}: {bottles(v.stock)}{i === 0 && vintages.length > 1 ? ' · use first' : ''}
                  </span>
                ))}
              </div>
            )}
            {reserve > 0.05 && (
              <div className="home-reserve">
                <span>🧼 Soap reserve</span>
                <span className="home-bar"><i style={{ width: `${Math.min(100, (reserve / SOAP_BATCH_KG) * 100)}%` }} /></span>
                <span>{r1(reserve)} / {SOAP_BATCH_KG} kg</span>
              </div>
            )}
          </>
        )}
      </Link>

      <div className="home-pair">
        {season && (
          <Link to="/harvests" className="home-card">
            <div className="home-head"><span>{season.year} harvest</span><span aria-hidden="true">›</span></div>
            <dl className="home-list">
              <dt>Olives</dt><dd>{Math.round(season.olives_kg)} kg</dd>
              <dt>Oil</dt><dd><b>{r1(season.oil_kg)} kg</b></dd>
              <dt>Ratio</dt><dd>{season.ratio}:1</dd>
              <dt>Tanake</dt><dd>{inUnit(season.oil_kg, 'T')}</dd>
            </dl>
          </Link>
        )}
        <Link to="/calendar" className="home-card">
          <div className="home-head"><span>{tasks.year} tasks</span><span aria-hidden="true">›</span></div>
          <div className="home-mid"><b>{tasks.logged}</b> / {tasks.started} logged</div>
          <span className="home-bar wide"><i style={{ width: `${pct}%` }} /></span>
          <div className={`home-due ${critical ? 'critical' : ''}`}>
            {tasks.due.length === 0 ? 'Nothing due now' : `${tasks.due.length} due now${critical ? ' · critical' : ''}`}
          </div>
        </Link>
      </div>
    </div>
  );
}
