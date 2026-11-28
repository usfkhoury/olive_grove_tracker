// Offline fallbacks shared by sw.js (loaded with importScripts) and the tests.
// WARM = the full lists saved in the background whenever the app opens online.
// derive() answers a filtered API URL (one tree, one season…) from those lists
// when it was never opened online itself.
(function (root) {
  var WARM = [
    '/api/dashboard', '/api/trees', '/api/checks', '/api/harvests', '/api/harvests/seasons',
    '/api/tasks', '/api/activities?limit=1000', '/api/oil/movements', '/api/oil/summary', '/api/soap/batches',
  ];

  // path: '/api/…' without query; q: URLSearchParams; get(url) → Promise<json|null>.
  async function derive(path, q, get) {
    var m = path.match(/^\/api\/trees\/([0-9a-f-]+)$/i);
    if (m) {
      var trees = await get('/api/trees');
      var tree = trees && trees.find(function (t) { return t.id.replace(/-/g, '') === m[1].replace(/-/g, ''); });
      return tree || null;
    }
    if (path === '/api/checks') {
      var checks = await get('/api/checks');
      if (!checks) return null;
      return checks.filter(function (c) {
        return (!q.get('tree_id') || c.tree_id === q.get('tree_id'))
          && (!q.get('season') || String(c.season) === String(q.get('season')));
      });
    }
    if (path === '/api/activities') {
      var acts = await get('/api/activities?limit=1000');
      if (!acts) return null;
      var tid = q.get('tree_id');
      // Same rule as the API: no trees tagged = whole grove = every tree's history.
      if (tid) acts = acts.filter(function (a) { return a.trees.length === 0 || a.trees.some(function (t) { return t.id === tid; }); });
      return acts.slice(0, q.get('limit') ? parseInt(q.get('limit'), 10) : 200);
    }
    return null;
  }

  root.oliveOffline = { WARM: WARM, derive: derive };
})(typeof self !== 'undefined' ? self : globalThis);
