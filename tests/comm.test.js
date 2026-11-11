// Commission / incentive rules (assets/app27.js). Run: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const COMM = require('../assets/app27.js');

const row = o => ({ amount: 0, p1_amount: 0, p2_amount: 0, ...o });

test('status: not set, due, paid', () => {
  assert.equal(COMM.status(row({})), 'unset');
  assert.equal(COMM.status(row({ p1_amount: 500 })), 'unset'); // no amount typed yet
  assert.equal(COMM.status(row({ amount: 20000 })), 'due');
  assert.equal(COMM.status(row({ amount: 20000, p1_amount: 10000 })), 'due');
  assert.equal(COMM.status(row({ amount: 20000, p1_amount: 10000, p2_amount: 10000 })), 'paid');
  assert.equal(COMM.status(row({ amount: '1500.50', p1_amount: '1000', p2_amount: '500.50' })), 'paid'); // numbers arrive as strings too
});

test('balance never goes below zero; totals add up', () => {
  assert.equal(COMM.balance(row({ amount: 20000, p1_amount: 7500 })), 12500);
  assert.equal(COMM.balance(row({ amount: 100, p1_amount: 150 })), 0);
  const t = COMM.totals([row({ amount: 20000, p1_amount: 10000 }), row({ amount: 5000, p1_amount: 2000, p2_amount: 3000 }), row({})]);
  assert.deepEqual(t, { n: 3, amount: 25000, paid: 15000, balance: 10000 });
});

test('words: the admin pays, the person receives', () => {
  assert.equal(COMM.words('commission', true).title, 'Commission');
  assert.equal(COMM.words('commission', true).paid, 'Paid commission');
  assert.equal(COMM.words('commission', false).title, 'Commission received');
  assert.equal(COMM.words('incentive', false).paid, 'Incentive received');
  assert.equal(COMM.words('incentive', true).person, 'Staff member');
});

test('menu: admin both lists, BA commission, staff by Incentive access', () => {
  assert.deepEqual(COMM.nav({ role: 'admin', read: '*', write: '*' }).map(x => x[0]), ['commission', 'incentive']);
  assert.deepEqual(COMM.nav({ role: 'ba', read: ['leads'], write: [] }), [['commission', 'Commission received']]);
  assert.deepEqual(COMM.nav({ role: 'sales', read: ['leads'], write: [] }), []); // Incentive View taken away
  assert.deepEqual(COMM.nav({ role: 'engineer', read: ['incentive'], write: [] }), [['incentive', 'Incentive received']]);
  assert.deepEqual(COMM.nav({ role: 'accounts', read: ['incentive'], write: ['incentive'] }), [['incentive', 'Incentive'], ['mine', 'Incentive received']]);
  assert.deepEqual(COMM.nav(null), []);
});

test('check: the same rules as the server', () => {
  const ok = { amount: '20,000', p1_amount: '10000', p1_date: '2026-11-05', p1_ref: 'UTR1', p2_amount: '', p2_date: '', p2_ref: '' };
  assert.equal(COMM.check(ok), '');
  assert.match(COMM.check({ ...ok, p2_amount: '10001', p2_date: '2026-11-06' }), /more than the commission amount/);
  assert.match(COMM.check({ ...ok, p2_amount: '10001', p2_date: '2026-11-06' }, 'Incentive'), /incentive amount/);
  assert.match(COMM.check({ ...ok, p1_date: '' }), /Part 1: enter the date/);
  assert.match(COMM.check({ ...ok, p1_amount: '', p1_date: '', p1_ref: 'UTR1' }), /Part 1: enter the amount paid/);
  assert.match(COMM.check({ ...ok, p1_amount: '', p1_date: '', p1_ref: '', p2_amount: '500', p2_date: '2026-11-06' }), /part 1 before part 2/);
  assert.match(COMM.check({ ...ok, amount: 'abc' }), /enter an amount/);
  assert.match(COMM.check({ ...ok, amount: '-5' }), /enter an amount/);
  assert.equal(COMM.check({ amount: '', p1_amount: '', p1_date: '', p1_ref: ' ', p2_amount: '', p2_date: '', p2_ref: '' }), '');
});

test('filter: search, status tab, person', () => {
  const rows = [row({ customer_id: 1, name: 'Anil', user_id: 7, user_name: 'Bina', amount: 100, p1_amount: 100, p1_ref: 'UTR55' }),
    row({ customer_id: 2, name: 'Beena', user_id: 8, user_name: 'Sam', amount: 100 }), row({ customer_id: 3, name: 'Chacko', user_id: 7, user_name: 'Bina' })];
  assert.deepEqual(COMM.filter(rows, '', 'all', 0).map(r => r.customer_id), [1, 2, 3]);
  assert.deepEqual(COMM.filter(rows, '', 'paid', 0).map(r => r.customer_id), [1]);
  assert.deepEqual(COMM.filter(rows, '', 'due', 0).map(r => r.customer_id), [2]);
  assert.deepEqual(COMM.filter(rows, '', 'unset', 7).map(r => r.customer_id), [3]);
  assert.deepEqual(COMM.filter(rows, 'utr55', 'all', 0).map(r => r.customer_id), [1]);
  assert.deepEqual(COMM.filter(rows, 'sam', 'all', 0).map(r => r.customer_id), [2]);
});
