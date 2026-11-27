// Seasonal-task status from its month window + the dates it was logged.
// Windows are whole months; start > end wraps over New Year (e.g. Dec–Feb).
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(y, m, 0).getDate(); // m is 1-based

export const inRange = (month, start, end) =>
  start <= end ? month >= start && month <= end : month >= start || month <= end;

// The window containing today, else the most recent one that ended.
export function latestWindow({ start_month: s, end_month: e }, todayIso) {
  const y = Number(todayIso.slice(0, 4));
  const m = Number(todayIso.slice(5, 7));
  const wraps = s > e;
  const current = inRange(m, s, e);
  let startYear;
  if (current) startYear = wraps && m <= e ? y - 1 : y;
  else if (!wraps) startYear = m > e ? y : y - 1;
  else startYear = y - 1;
  const endYear = wraps ? startYear + 1 : startYear;
  return { from: `${startYear}-${pad(s)}-01`, to: `${endYear}-${pad(e)}-${pad(lastDay(endYear, e))}`, current };
}

// status: 'now' (in window, not logged) | 'done' | 'soon' (starts in 1–2 months) | 'missed'
export function taskStatus(task, todayIso) {
  const w = latestWindow(task, todayIso);
  const lastDone = (task.done_dates || []).find((d) => d >= w.from && d <= w.to) || null;
  if (w.current) return { status: lastDone ? 'done' : 'now', lastDone };
  const monthsUntil = (task.start_month - Number(todayIso.slice(5, 7)) + 12) % 12;
  if (monthsUntil >= 1 && monthsUntil <= 2) return { status: 'soon', lastDone };
  return { status: lastDone ? 'done' : 'missed', lastDone };
}
