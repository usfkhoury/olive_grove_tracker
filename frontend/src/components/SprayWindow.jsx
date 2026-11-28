import { useEffect, useState } from 'react';
import { FORECAST_URL, sprayWindows } from '../lib/weather.js';

const pad = (n) => String(n).padStart(2, '0');
const nowIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`; };
const dayName = (date, todayDate) => (date === todayDate ? 'Today'
  : new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }));

// Good hours to spray in the next 4 days (Open-Meteo forecast for the grove).
// Always shown on Home.
export default function SprayWindow() {
  const [wins, setWins] = useState(null);
  useEffect(() => {
    fetch(FORECAST_URL).then((r) => r.json())
      .then((d) => setWins(sprayWindows(d.hourly)))
      .catch(() => setWins(undefined)); // no signal / API down → hide the card
  }, []);
  if (wins === undefined) return null;
  const now = nowIso();
  const upcoming = (wins || []).filter((w) => w.end > now);
  const byDay = upcoming.reduce((m, w) => {
    const d = w.start.slice(0, 10);
    (m[d] = m[d] || []).push(`${w.start > now ? w.start.slice(11, 13) : now.slice(11, 13)}–${w.end.slice(11, 13)}`);
    return m;
  }, {});
  return (
    <div className="card spray-card">
      <div className="title">🌤 Spray weather · next 4 days</div>
      {wins === null ? <p className="sub">Loading forecast…</p>
        : upcoming.length === 0 ? <p className="sub">No good window: rain or wind forecast.</p>
          : (
            <div className="spray-days">
              {Object.entries(byDay).map(([d, ranges]) => (
                <div key={d} className="spray-day"><b>{dayName(d, now.slice(0, 10))}</b><span>{ranges.join(', ')}</span></div>
              ))}
            </div>
          )}
      <div className="spray-rule">Daylight, dry for 6 h after, wind under 15 km/h, 5–30 °C · Open-Meteo</div>
    </div>
  );
}
