import { getStoredToken, AUTH_INVALID_EVENT } from './AuthContext.jsx';

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getStoredToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    if ((res.status === 401 || res.status === 403) && method !== 'GET') {
      // Signal AuthContext to clear stored token and drop to read-only mode.
      window.dispatchEvent(new CustomEvent(AUTH_INVALID_EVENT));
    }
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || JSON.stringify(data);
    } catch { /* keep statusText */ }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

export default {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
};

export const ACTIVITY_TYPES = [
  'Fertilizing', 'Plowing', 'Weeding', 'Pruning',
  'Spraying', 'Watering', 'Harvesting', 'Other',
];

export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Local date, not UTC — toISOString() would yield yesterday between midnight
// and ~2-3am Lebanon time. en-CA formats as YYYY-MM-DD.
export const today = () => new Date().toLocaleDateString('en-CA');

export const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
