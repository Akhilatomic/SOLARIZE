const test = require('node:test');
const assert = require('node:assert/strict');
const QSIGN = require('../assets/app51.js');

const ADMIN = { id: 1, role: 'admin' };
const STAFF = { id: 7, role: 'staff' };
const Q = { maker: 1 };

test('state labels', () => {
  assert.deepEqual(QSIGN.state({ state: 'signed', signed_at: '2026-11-26 09:15:00' }), { k: 'signed', label: 'Signed & sealed · 26 Nov', cls: 'g' });
  assert.equal(QSIGN.state({ state: 'signed', signed_at: '2026-03-05 23:59:59' }).label, 'Signed & sealed · 5 Mar');
  assert.deepEqual(QSIGN.state({ state: 'waiting' }), { k: 'waiting', label: 'Waiting for signature', cls: 'a' });
  assert.deepEqual(QSIGN.state({ state: '' }), { k: '', label: '', cls: '' });
  assert.deepEqual(QSIGN.state(null), { k: '', label: '', cls: '' });
  assert.deepEqual(QSIGN.state(undefined), { k: '', label: '', cls: '' });
});

test('can: staff ask / admin sign / requester cancel / make for sealed', () => {
  const none = { state: '' };
  assert.equal(QSIGN.can(none, STAFF, Q, true).ask, true);
  assert.equal(QSIGN.can(none, STAFF, Q, false).ask, false);
  assert.equal(QSIGN.can(none, STAFF, { maker: 0 }, true).ask, false);
  assert.equal(QSIGN.can(none, STAFF, { doc: '{"a":1}' }, true).ask, true);
  assert.equal(QSIGN.can(none, STAFF, { doc: '' }, true).ask, false);
  assert.equal(QSIGN.can(none, ADMIN, Q, true).ask, false);
  assert.equal(QSIGN.can({ state: 'waiting' }, STAFF, Q, true).ask, false);
  assert.equal(QSIGN.can({ state: 'signed' }, STAFF, Q, true).ask, false);

  const w = { state: 'waiting', req_by: 7 };
  assert.equal(QSIGN.can(w, STAFF, Q, true).cancel, true);
  assert.equal(QSIGN.can(w, { id: 8, role: 'staff' }, Q, true).cancel, false);
  assert.equal(QSIGN.can(w, ADMIN, Q, true).cancel, true);
  assert.equal(QSIGN.can(none, ADMIN, Q, true).cancel, false);

  assert.equal(QSIGN.can(none, ADMIN, Q, true).sign, true);
  assert.equal(QSIGN.can(w, ADMIN, Q, true).sign, true);
  assert.equal(QSIGN.can({ state: 'signed' }, ADMIN, Q, true).sign, false);
  assert.equal(QSIGN.can(none, STAFF, Q, true).sign, false);

  assert.equal(QSIGN.can({ state: '', sealed: true }, ADMIN, Q, true).make, true);
  assert.equal(QSIGN.can({ state: '', sealed: false }, ADMIN, Q, true).make, false);
  assert.equal(QSIGN.can({ state: 'signed', sealed: true }, ADMIN, Q, true).make, false);
  assert.equal(QSIGN.can({ state: '', sealed: true }, STAFF, Q, true).make, false);

  assert.equal(QSIGN.can({ state: 'signed' }, STAFF, Q, false).share, true);
  assert.equal(QSIGN.can({ state: 'waiting' }, ADMIN, Q, true).share, false);
  assert.deepEqual(Object.keys(QSIGN.can(null, STAFF, Q, true)).sort(), ['ask', 'cancel', 'make', 'share', 'sign']);
});

test('targets without phone, email or loans access', () => {
  const full = { phone: '9000000001', email: 'a@example.com', bank_phone: '9000000002', bank_email: 'b@example.com', is_customer: true, loans: true };
  const t = QSIGN.targets(full);
  assert.equal(t.length, 4);
  assert.deepEqual(t.map(x => [x.via, x.to_whom]), [['whatsapp', 'customer'], ['email', 'customer'], ['whatsapp', 'bank'], ['email', 'bank']]);
  assert.ok(t.every(x => x.ok && x.why === ''));
  assert.equal(t[0].addr, '9000000001');
  assert.equal(t[3].addr, 'b@example.com');

  const bare = QSIGN.targets({ phone: '', email: '', bank_phone: '', bank_email: '', is_customer: true, loans: true });
  assert.deepEqual(bare.map(x => x.why), ['No phone number', 'No email', 'Add it on the Bank & loan page', 'Add it on the Bank & loan page']);
  assert.ok(bare.every(x => !x.ok));

  const noLoans = QSIGN.targets({ ...full, loans: false });
  assert.equal(noLoans[0].ok, true);
  assert.equal(noLoans[2].ok, false);
  assert.equal(noLoans[2].why, 'Needs access to Loans');

  const lead = QSIGN.targets({ ...full, is_customer: false, loans: false });
  assert.equal(lead[3].why, 'Only for customers');
  assert.equal(lead[1].ok, true);
});

test('fill', () => {
  assert.equal(QSIGN.fill('Hi {name}, quote {no}', { name: 'Asha', no: 'Q-12' }), 'Hi Asha, quote Q-12');
  assert.equal(QSIGN.fill('Hi {name}{x}{y}', { name: 'Asha', y: null }), 'Hi Asha');
  assert.equal(QSIGN.fill('{a} and {a}', { a: 5 }), '5 and 5');
  assert.equal(QSIGN.fill('{constructor}{__proto__}', {}), '');
  assert.equal(QSIGN.fill(null, {}), '');
  assert.equal(QSIGN.fill('{a}', null), '');
});
