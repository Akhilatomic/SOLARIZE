// Me / All filter and reassign rules (assets/app26.js). Run: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const OWN = require('../assets/app26.js');

const admin = { id: 1, name: 'Boss', role: 'admin' };
const am = { id: 2, name: 'Mira', role: 'assistant_manager' };
const asha = { id: 3, name: 'Asha', role: 'sales' };
const ravi = { id: 4, name: 'Ravi', role: 'sales' };
const eli = { id: 5, name: 'Eli Thomas', role: 'engineer' };

test('reassign: the owner, the admin and the assistant manager may; others may not', () => {
  assert.equal(OWN.canReassign(3, asha), true, 'owner');
  assert.equal(OWN.canReassign('3', asha), true, 'owner id as text (from the API)');
  assert.equal(OWN.canReassign(3, admin), true, 'admin');
  assert.equal(OWN.canReassign(3, am), true, 'assistant manager');
  assert.equal(OWN.canReassign(3, ravi), false, 'another sales user');
  assert.equal(OWN.canReassign(3, eli), false, 'an engineer who is not the owner');
});

test('reassign: a record without an owner only by the admin or the assistant manager', () => {
  for (const none of [null, undefined, 0, '', '0']) {
    assert.equal(OWN.canReassign(none, asha), false, `sales, owner ${JSON.stringify(none)}`);
    assert.equal(OWN.canReassign(none, admin), true, `admin, owner ${JSON.stringify(none)}`);
    assert.equal(OWN.canReassign(none, am), true, `assistant manager, owner ${JSON.stringify(none)}`);
  }
  assert.equal(OWN.canReassign(3, null), false, 'not signed in');
});

test('Me on leads: only leads I claimed', () => {
  assert.equal(OWN.mine.leads({ assigned_to: 3 }, asha), true);
  assert.equal(OWN.mine.leads({ assigned_to: '3' }, asha), true);
  assert.equal(OWN.mine.leads({ assigned_to: 4 }, asha), false);
  assert.equal(OWN.mine.leads({ assigned_to: null }, asha), false, 'unclaimed is not mine');
});

test('Me on customers: only customers I own', () => {
  assert.equal(OWN.mine.customers({ owner_id: 3 }, asha), true);
  assert.equal(OWN.mine.customers({ owner_id: 4 }, asha), false);
  assert.equal(OWN.mine.customers({ owner_id: null, added_by: 'Asha' }, asha), false, 'added by me but owned by nobody');
});

test('Me on projects: my customer, or I am the site engineer', () => {
  assert.equal(OWN.mine.projects({ owner_id: 3, engineer: '' }, asha), true, 'my customer');
  assert.equal(OWN.mine.projects({ owner_id: 4, engineer: 'Eli Thomas' }, eli), true, 'engineer');
  assert.equal(OWN.mine.projects({ owner_id: 4, engineer: '  eli thomas ' }, eli), true, 'case and spaces');
  assert.equal(OWN.mine.projects({ owner_id: 4, engineer: 'Ravi' }, eli), false);
  assert.equal(OWN.mine.projects({ owner_id: null, engineer: null }, eli), false);
});

test('site engineer names: several people in one field', () => {
  for (const e of ['Anu', 'Anu, Ravi', 'Ravi,Anu', 'Ravi & Anu', 'Anu and Ravi', 'Ravi / Anu', 'Ravi + Anu', 'ANU'])
    assert.equal(OWN.isEngineer(e, 'Anu'), true, e);
  for (const e of ['Anand', 'Anu Mathew', 'Sanu', '', null])
    assert.equal(OWN.isEngineer(e, 'Anu'), false, String(e));
  assert.equal(OWN.isEngineer('Anu', ''), false, 'no name never matches');
});

test('filter: All keeps every row, Me keeps mine', () => {
  const rows = [{ id: 1, owner_id: 3 }, { id: 2, owner_id: 4 }, { id: 3, owner_id: null }];
  assert.deepEqual(OWN.filter('customers', rows, 'all', asha).map(r => r.id), [1, 2, 3]);
  assert.deepEqual(OWN.filter('customers', rows, 'me', asha).map(r => r.id), [1]);
  assert.deepEqual(OWN.filter('customers', rows, 'me', ravi).map(r => r.id), [2]);
});
