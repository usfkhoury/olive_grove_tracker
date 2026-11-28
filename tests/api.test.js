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

test('planPressSync: set / clear / create for one press', () => {
  const checks = [
    { id: 'c1', tree_id: 't1', season: 2026, press_id: null },  // ticked, no press → set
    { id: 'c2', tree_id: 't2', season: 2026, press_id: 'p0' },  // ticked, other press → set (moves)
    { id: 'c3', tree_id: 't3', season: 2026, press_id: 'p1' },  // ticked, already → nothing
    { id: 'c4', tree_id: 't4', season: 2026, press_id: 'p1' },  // unticked → clear
    { id: 'c5', tree_id: 't5', season: 2025, press_id: 'p1' },  // wrong season (date moved) → clear
    { id: 'c6', tree_id: 't6', season: 2026, press_id: 'p9' },  // unrelated → nothing
  ];
  const plan = I.planPressSync(checks, 'p1', 2026, ['t1', 't2', 't3', 't7']);
  assert.deepEqual(plan.set.sort(), ['c1', 'c2']);
  assert.deepEqual(plan.clear.sort(), ['c4', 'c5']);
  assert.deepEqual(plan.create, ['t7']);
});

test('planPressSync: dashed and plain page ids compare equal', () => {
  const checks = [{ id: 'c1', tree_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', season: 2026, press_id: 'P1' }];
  const plan = I.planPressSync(checks, 'p1', 2026, ['aaaaaaaabbbbccccddddeeeeeeeeeeee']);
  assert.deepEqual(plan, { set: [], clear: [], create: [] });
});

test('checkProps never writes Canopy density (old Notion values are left as-is)', () => {
  const props = I.checkProps({ tree_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', season: 2026, fruit_size: 'Big', canopy_density: 'High' }, 'T1');
  assert.equal('Canopy density' in props, false);
  assert.deepEqual(props['Fruit size'], { select: { name: 'Big' } });
});

test('oilProps writes Vintage only when given; oilOut reads it', () => {
  const base = { date: '2026-11-28', kind: 'home', amount_kg: -5, notes: '' };
  assert.equal('Vintage' in I.oilProps(base, null), false);
  assert.deepEqual(I.oilProps({ ...base, vintage: 2025 }, null).Vintage, { number: 2025 });
  const page = { id: 'x', properties: { Vintage: { number: 2025 }, Kind: { select: { name: 'home' } }, 'Amount kg': { number: -5 }, Date: { date: { start: '2026-11-28' } }, Notes: { rich_text: [] }, Harvest: { relation: [] } } };
  assert.equal(I.oilOut(page).vintage, 2025);
});
test('parseVintage: a year or null', () => {
  assert.equal(I.parseVintage(2025), 2025);
  assert.equal(I.parseVintage('2026'), 2026);
  assert.equal(I.parseVintage(null), null);
  assert.equal(I.parseVintage('abc'), null);
  assert.equal(I.parseVintage(1500), null);
});

test('oilBalance: 16 kg tanake at 0.915 kg/L; reserve moves are transfers; soap drains the reserve first', () => {
  const rows = [
    { date: '2025-11-02', kind: 'press', amount_kg: 100 },
    { date: '2026-01-10', kind: 'reserve', amount_kg: -20 },  // stock → soap reserve
    { date: '2026-06-20', kind: 'soap', amount_kg: -16 },     // from the reserve
    { date: '2026-07-01', kind: 'soap', amount_kg: -10 },     // 4 from reserve, 6 from stock
    { date: '2026-08-01', kind: 'home', amount_kg: -5 },
  ];
  assert.deepEqual(I.oilBalance(rows), {
    balance_kg: 69, stock_kg: 69, soap_reserve_kg: 0,
    stock_tanake: 4.31, stock_liters: 75.4,
  });
  assert.equal(I.oilBalance(rows.slice(0, 2)).soap_reserve_kg, 20);
  assert.equal(I.oilBalance(rows.slice(0, 2)).stock_kg, 80);
  assert.equal(I.oilBalance(rows.slice(0, 2)).stock_tanake, 5);   // tanake/litres describe the stock, not the reserve
  assert.equal(I.oilBalance(rows.slice(0, 2)).balance_kg, 100);
});
test('soap and reserve are out-kinds; oilProps links a soap batch', () => {
  assert.equal(I.signedAmount('soap', 16), -16);
  assert.equal(I.signedAmount('reserve', 5), -5);
  const p = I.oilProps({ date: '2026-06-20', kind: 'soap', amount_kg: -16, notes: '', soap_batch_id: 'abc' }, null);
  assert.deepEqual(p['Soap batch'], { relation: [{ id: 'abc' }] });
  assert.equal('Soap batch' in I.oilProps({ date: '2026-06-20', kind: 'home', amount_kg: -1, notes: '' }, null), false);
});
