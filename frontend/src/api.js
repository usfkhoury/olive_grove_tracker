import { getStoredToken, AUTH_INVALID_EVENT } from './AuthContext.jsx';

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getStoredToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error(method === 'GET'
      ? 'No connection.'
      : 'No connection — not saved. Your entry is still in the form; try again when you have signal.');
    err.status = 0;
    throw err;
  }
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

export { CHECK_OPTIONS, MONTHS, today, fmtDate, TANAKE_KG, GLOSSARY } from './constants.js';
