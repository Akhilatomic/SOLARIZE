// Subsidy tracker rules (assets/app47.js). Run: node --test tests/subsidy.test.js
const test = require('node:test'), assert = require('node:assert');
const { SUBSIDY } = require('../assets/app47.js');
const FLOW = ['Netmeter installed', 'KSEB doc uploaded', 'DISCOM inspection', 'Inspection completed', 'Subsidy redeem stage', 'Subsidy redeemed', 'Subsidy disbursed'];
const SIDE = ['Subsidy rejected', 'Reverify'], ALL = [...FLOW, ...SIDE];
const rows = [
  { name: 'Test One', phone: '9000000001', consumer_no: '1145678901234', application_no: 'NP-1', district: 'Kollam', status: 'Netmeter installed' },
  { name: 'Test Two', phone: '9000000002', consumer_no: '', application_no: '', district: 'Kochi', status: 'Subsidy disbursed' },
  { name: 'Sample Three', phone: '9000000003', consumer_no: '', application_no: 'NP-3', district: '', status: 'Reverify' }];

test('every status has a colour', () => { ALL.forEach(s => assert.ok(SUBSIDY.cls(s), s)); assert.equal(SUBSIDY.cls('Applied'), ''); });
test('counts per status', () => {
  const n = SUBSIDY.counts(rows, ALL);
  assert.equal(n['Netmeter installed'], 1); assert.equal(n['Subsidy disbursed'], 1); assert.equal(n.Reverify, 1); assert.equal(n['DISCOM inspection'], 0);
  assert.equal(Object.keys(n).length, 9);
});
test('filter by status tile and search', () => {
  assert.equal(SUBSIDY.filter(rows, '', '').length, 3);
  assert.deepEqual(SUBSIDY.filter(rows, 'Reverify', '').map(r => r.name), ['Sample Three']);
  assert.deepEqual(SUBSIDY.filter(rows, '', 'test').map(r => r.name), ['Test One', 'Test Two']);
  assert.deepEqual(SUBSIDY.filter(rows, '', '1145').map(r => r.name), ['Test One']);
  assert.deepEqual(SUBSIDY.filter(rows, '', ' np-3 ').map(r => r.name), ['Sample Three']);
  assert.equal(SUBSIDY.filter(rows, 'Subsidy disbursed', 'one').length, 0);
});
test('days at a status', () => {
  assert.equal(SUBSIDY.days('2026-11-20', '2026-11-20'), 0); assert.equal(SUBSIDY.days('2026-11-17', '2026-11-20'), 3);
  assert.equal(SUBSIDY.days('2026-10-31', '2026-11-01'), 1); assert.equal(SUBSIDY.days('2026-12-01', '2026-11-20'), 0); assert.equal(SUBSIDY.days('', '2026-11-20'), 0);
  assert.equal(SUBSIDY.daysTxt(0), 'today'); assert.equal(SUBSIDY.daysTxt(1), '1 day'); assert.equal(SUBSIDY.daysTxt(12), '12 days');
});
test('step strip on the usual path', () => {
  const s = SUBSIDY.steps(FLOW, 'DISCOM inspection', []);
  assert.deepEqual(s.map(x => x.st), ['done', 'done', 'now', 'todo', 'todo', 'todo', 'todo']);
  assert.deepEqual(SUBSIDY.steps(FLOW, 'Subsidy disbursed', []).map(x => x.st), ['done', 'done', 'done', 'done', 'done', 'done', 'now']);
});
test('step strip on a side status shows how far the customer had come', () => {
  const log = [{ status: 'Reverify' }, { status: 'Subsidy redeem stage' }, { status: 'Netmeter installed' }];
  assert.deepEqual(SUBSIDY.steps(FLOW, 'Reverify', log).map(x => x.st), ['done', 'done', 'done', 'done', 'done', 'todo', 'todo']);
  assert.deepEqual(SUBSIDY.steps(FLOW, 'Subsidy rejected', [{ status: 'Subsidy rejected' }]).map(x => x.st), Array(7).fill('todo'));
});
test('next status', () => {
  assert.equal(SUBSIDY.next(FLOW, 'Netmeter installed'), 'KSEB doc uploaded'); assert.equal(SUBSIDY.next(FLOW, 'Subsidy redeemed'), 'Subsidy disbursed');
  assert.equal(SUBSIDY.next(FLOW, 'Subsidy disbursed'), ''); assert.equal(SUBSIDY.next(FLOW, 'Reverify'), 'Subsidy redeem stage'); assert.equal(SUBSIDY.next(FLOW, 'Subsidy rejected'), '');
});
