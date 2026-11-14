const test = require('node:test'), assert = require('node:assert');
const FEASX = require('../assets/app39.js');

test('days left, with the colour getting warmer', () => {
  assert.deepEqual(FEASX.text(29, 3), { t: 'Feasibility · 29 days left', c: 'g' });
  assert.deepEqual(FEASX.text(10, 3), { t: 'Feasibility · 10 days left', c: 'y' });
  assert.deepEqual(FEASX.text(3, 3), { t: 'Feasibility · 3 days left', c: 'r' });
  assert.deepEqual(FEASX.text(1, 3), { t: 'Feasibility · 1 day left', c: 'r' });
});
test('the last day and after', () => {
  assert.deepEqual(FEASX.text(0, 3), { t: 'Feasibility expires today', c: 'r' });
  assert.deepEqual(FEASX.text(-1, 3), { t: 'Feasibility expired 1 day ago', c: 'r' });
  assert.deepEqual(FEASX.text(-12, 3), { t: 'Feasibility expired 12 days ago', c: 'r' });
});
test('list order: expired first, then the fewest days left, the rest after', () => {
  const map = { 1: { days_left: 25 }, 2: { days_left: -5 }, 3: { rf: 1 }, 4: { days_left: 2 } };
  const ids = [5, 1, 3, 2, 4].sort((a, b) => FEASX.order(map, a) - FEASX.order(map, b));
  assert.deepEqual(ids, [2, 4, 1, 5, 3]);
  assert.equal(FEASX.order(null, 1), 1e7);
});
test('the warning days follow the rule', () => {
  assert.equal(FEASX.text(5, 7).c, 'r');
  assert.equal(FEASX.text(5).c, 'y');
});
test('AF/RF: RF paid replaces the days left; the column uses the short wording', () => {
  assert.deepEqual(FEASX.label({ rf: 1, rf_on: '2026-11-14' }, 3, true), { t: 'RF', c: 'g', i: 'check' });
  assert.equal(FEASX.label({ rf: 1 }, 3, false).t, 'RF paid');
  assert.deepEqual(FEASX.label({ days_left: 12 }, 3, true), { t: '12', c: 'g', i: 'clock' });
  assert.deepEqual(FEASX.label({ days_left: -2 }, 3, true), { t: '\u22122', c: 'r', i: 'clock' });
  assert.equal(FEASX.label({ days_left: 0 }, 3, true).t, '0');
  assert.equal(FEASX.label({ days_left: 12 }, 3, false).t, 'Feasibility · 12 days left');
  assert.equal(FEASX.label(null, 3, true), null);
});
