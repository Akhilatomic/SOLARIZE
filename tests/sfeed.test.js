const test = require('node:test'), assert = require('node:assert');
const SFEED = require('../assets/app40.js');

test('nothing waiting: one calm line', () => {
  assert.deepEqual(SFEED.items({}), [{ icon: 'check', text: 'All caught up', sub: 'Nothing is waiting for you', go: '', idle: true }]);
  assert.equal(SFEED.items({ notifs: [], leads: 0, leave: 0, online: 0 }).length, 1);
});
test('notifications first, then leads, leave requests and who is online', () => {
  const L = SFEED.items({ notifs: [{ kind: 'callback', text: 'Call back Test Person', created: '2026-11-14 10:00:00', lead_id: 7 }, { kind: 'feas', text: 'Feasibility expires in 2 days', created: '2026-11-14 09:00:00', customer_id: 3 }],
    leads: 2, leave: 1, online: 3, ago: c => 'at ' + c.slice(11, 16) });
  assert.deepEqual(L.map(x => x.icon), ['phone', 'clock', 'target', 'leave', 'users']);
  assert.deepEqual(L.map(x => x.go), ['#/leads', '#/customers/3', '#/leads', '#/leaves', '']);
  assert.equal(L[0].sub, 'at 10:00');
  assert.deepEqual(L.slice(2).map(x => x.text), ['2 new leads waiting', '1 leave request to review', '3 teammates online now']);
  assert.ok(L.every(x => !x.idle));
});
test('singular wording, unknown kinds, long text and at most eight notifications', () => {
  assert.equal(SFEED.items({ leads: 1 })[0].text, '1 new lead waiting');
  assert.equal(SFEED.items({ online: 1 })[0].text, '1 teammate online now');
  assert.equal(SFEED.items({ notifs: [{ kind: 'something', text: 'x' }] })[0].icon, 'bell');
  const long = SFEED.items({ notifs: [{ kind: 'assign', text: 'word '.repeat(60) }] })[0].text;
  assert.ok(long.length <= 96 && long.endsWith('…'));
  assert.equal(SFEED.items({ notifs: Array.from({ length: 20 }, (_, i) => ({ kind: 'assign', text: 'n' + i })) }).length, 8);
});
