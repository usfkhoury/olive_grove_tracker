import test from 'node:test';
import assert from 'node:assert/strict';
import { latestWindow, taskStatus } from './season.js';

const apr = { start_month: 4, end_month: 4 };
const nov = { start_month: 11, end_month: 11 };
const wrap = { start_month: 12, end_month: 2 };

test('latestWindow: current, past, wrapping', () => {
  assert.deepEqual(latestWindow(apr, '2026-04-15'), { from: '2026-04-01', to: '2026-04-30', current: true });
  assert.deepEqual(latestWindow(apr, '2026-02-01'), { from: '2025-04-01', to: '2025-04-30', current: false });
  assert.deepEqual(latestWindow(wrap, '2027-01-10'), { from: '2026-12-01', to: '2027-02-28', current: true });
  assert.deepEqual(latestWindow(wrap, '2026-12-05'), { from: '2026-12-01', to: '2027-02-28', current: true });
  assert.deepEqual(latestWindow(wrap, '2026-06-01'), { from: '2025-12-01', to: '2026-02-28', current: false });
});

test('taskStatus', () => {
  assert.equal(taskStatus({ ...apr, done_dates: [] }, '2026-04-15').status, 'now');
  assert.deepEqual(taskStatus({ ...apr, done_dates: ['2026-04-10'] }, '2026-04-15'), { status: 'done', lastDone: '2026-04-10' });
  assert.equal(taskStatus({ ...apr, done_dates: ['2025-04-10'] }, '2026-04-15').status, 'now');
  assert.equal(taskStatus({ ...nov, done_dates: ['2026-11-20'] }, '2026-12-05').status, 'done');
  assert.equal(taskStatus({ ...nov, done_dates: [] }, '2026-12-05').status, 'missed');
  assert.equal(taskStatus({ ...apr, done_dates: [] }, '2026-02-20').status, 'soon');
  assert.equal(taskStatus({ start_month: 1, end_month: 3 }, '2026-11-27').status, 'soon');
  assert.equal(taskStatus({ ...apr }, '2026-08-01').status, 'missed');
});
