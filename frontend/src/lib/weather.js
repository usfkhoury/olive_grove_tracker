// Spray-weather windows from the Open-Meteo hourly forecast (free, no key).
// Grove: Bireh, ~915 m.
export const FORECAST_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=33.7227&longitude=35.6396&elevation=915' +
  '&hourly=precipitation,wind_speed_10m,temperature_2m&forecast_days=4&timezone=Asia%2FBeirut';

export const isSprayTask = (task) => /spray/i.test(task.name || '');

// A sprayable hour: daylight 06–17, wind below maxWind km/h (drift), 5–30 °C,
// and no rain this hour or the next `dryAfter` hours (the spray must dry on).
// Returns runs of at least minHours on the same day as { start, end }
// (local ISO, end exclusive).
export function sprayWindows(h, { minHours = 2, maxWind = 15, dryAfter = 6 } = {}) {
  const ok = h.time.map((t, i) => {
    const hour = Number(t.slice(11, 13));
    if (hour < 6 || hour > 17) return false;
    if (h.wind_speed_10m[i] >= maxWind) return false;
    if (h.temperature_2m[i] < 5 || h.temperature_2m[i] > 30) return false;
    for (let j = i; j <= i + dryAfter && j < h.time.length; j++) if (h.precipitation[j] > 0) return false;
    return true;
  });
  const out = [];
  let s = -1;
  const close = (last) => {
    if (last - s + 1 >= minHours) {
      const end = String(Number(h.time[last].slice(11, 13)) + 1).padStart(2, '0');
      out.push({ start: h.time[s], end: `${h.time[s].slice(0, 11)}${end}:00` });
    }
  };
  for (let i = 0; i < ok.length; i++) {
    const sameDay = s >= 0 && h.time[i].slice(0, 10) === h.time[s].slice(0, 10);
    if (s >= 0 && (!ok[i] || !sameDay)) { close(i - 1); s = -1; }
    if (ok[i] && s < 0) s = i;
  }
  if (s >= 0) close(ok.length - 1);
  return out;
}
