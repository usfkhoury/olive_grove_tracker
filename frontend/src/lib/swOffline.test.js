// Tests public/sw-offline.js (a plain script the service worker loads).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { globalThis: {} };
vm.runInNewContext(readFileSync(new URL('../../public/sw-offline.js', import.meta.url), 'utf8'), ctx);
const { derive, WARM } = ctx.globalThis.oliveOffline;

const T1 = 'aaaaaaaa-1111-2222-3333-444444444444', T2 = 'bbbbbbbb-1111-2222-3333-444444444444';
const cache = {
  '/api/trees': [{ id: T1, label: 'T1' }, { id: T2, label: 'T2' }],
  '/api/checks': [
    { tree_id: T1, season: 2026 }, { tree_id: T1, season: 2025 }, { tree_id: T2, season: 2026 },
  ],
  '/api/activities?limit=1000': [
    { id: 'a1', trees: [] }, { id: 'a2', trees: [{ id: T2 }] }, { id: 'a3', trees: [{ id: T1 }] },
  ],
};
const get = async (u) => cache[u] ?? null;
const q = (s) => new URLSearchParams(s);

test('warm list covers every page', () => {
  assert.ok(WARM.includes('/api/dashboard') && WARM.includes('/api/activities?limit=1000') && WARM.length === 10);
});
test('one tree from the tree list (ids with or without dashes)', async () => {
  assert.equal((await derive(`/api/trees/${T2}`, q(''), get)).label, 'T2');
  assert.equal((await derive(`/api/trees/${T1.replace(/-/g, '')}`, q(''), get)).label, 'T1');
  assert.equal(await derive('/api/trees/cccccccc-1111-2222-3333-444444444444', q(''), get), null);
});
test('checks filtered by tree and/or season', async () => {
  assert.equal((await derive('/api/checks', q(`tree_id=${T1}`), get)).length, 2);
  assert.equal((await derive('/api/checks', q('season=2026'), get)).length, 2);
  assert.equal((await derive('/api/checks', q(`tree_id=${T1}&season=2025`), get)).length, 1);
});
test("a tree's activities include whole-grove ones; default limit 200", async () => {
  assert.deepEqual((await derive('/api/activities', q(`tree_id=${T1}`), get)).map((a) => a.id), ['a1', 'a3']);
  assert.equal((await derive('/api/activities', q(''), get)).length, 3);
});
test('anything else → null (no cached copy, no guess)', async () => {
  assert.equal(await derive('/api/harvests', q(''), get), null);
  assert.equal(await derive('/api/checks', q(''), async () => null), null);
});
