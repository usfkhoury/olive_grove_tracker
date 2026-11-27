const test = require('node:test');
const assert = require('node:assert/strict');
const { _internals: I } = require('../netlify/functions/api.js');

const pg = (id, props) => ({ id, properties: props });
const title = (k, v) => ({ [k]: { title: [{ plain_text: v }] } });

test('buildActivities resolves tree + task names, newest first', () => {
  const trees = [pg('t1', title('Label', 'T1'))];
  const tasks = [pg('k1', title('Name', 'Copper Spray'))];
  const acts = [
    pg('a1', { Date: { date: { start: '2026-04-01' } }, Trees: { relation: [{ id: 't1' }] }, Task: { relation: [{ id: 'k1' }] }, Type: { select: null }, Notes: { rich_text: [] } }),
    pg('a2', { Date: { date: { start: '2026-05-01' } }, Trees: { relation: [] }, Task: { relation: [] }, Type: { select: { name: 'Other' } }, Notes: { rich_text: [] } }),
  ];
  const out = I.buildActivities(trees, acts, tasks);
  assert.deepEqual(out.map((a) => a.id), ['a2', 'a1']);
  assert.equal(out[1].label, 'Copper Spray');
  assert.deepEqual(out[1].trees, [{ id: 't1', label: 'T1' }]);
  assert.equal(out[0].label, 'Other');
});

test('attachDoneDates groups activity + press dates per task, newest first', () => {
  const tasks = [{ id: 'k1', name: 'A' }, { id: 'k2', name: 'Harvest' }];
  const acts = [
    pg('a1', { Task: { relation: [{ id: 'k1' }] }, Date: { date: { start: '2025-04-10' } } }),
    pg('a2', { Task: { relation: [{ id: 'k1' }] }, Date: { date: { start: '2026-04-12' } } }),
    pg('a3', { Task: { relation: [] }, Date: { date: { start: '2026-05-01' } } }),
  ];
  const harvests = [pg('h1', { Task: { relation: [{ id: 'k2' }] }, Date: { date: { start: '2026-11-21' } } })];
  const out = I.attachDoneDates(tasks, acts, harvests);
  assert.deepEqual(out[0].done_dates, ['2026-04-12', '2025-04-10']);
  assert.deepEqual(out[1].done_dates, ['2026-11-21']);
  assert.deepEqual(I.attachDoneDates(tasks, acts)[1].done_dates, []);
});

test('signedAmount: out kinds negative, adjustment keeps sign', () => {
  assert.equal(I.signedAmount('gift', 15), -15);
  assert.equal(I.signedAmount('sale', -15), -15);
  assert.equal(I.signedAmount('home', '7.5'), -7.5);
  assert.equal(I.signedAmount('adjustment', -3), -3);
  assert.equal(I.signedAmount('adjustment', 3), 3);
});

test('harvestProps writes Task only when task_id is a page id', () => {
  const base = { date: '2026-11-21', olives_kg: 1, oil_kg: 1, tanake: null, notes: '' };
  assert.equal(I.harvestProps(base).Task, undefined);
  const id = '404c46dc-1998-8135-9f68-d17a5ccc0ead';
  assert.deepEqual(I.harvestProps({ ...base, task_id: id }).Task, { relation: [{ id }] });
});
