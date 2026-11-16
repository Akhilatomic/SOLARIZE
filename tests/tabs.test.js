const test = require('node:test'), assert = require('node:assert');
const TABR = require('../assets/app43.js');
const L = () => [{ id: 't1', hash: '#/dashboard', seen: 1000 }, { id: 't2', hash: '#/customers/12', seen: 2000 }, { id: 't3', hash: '#/customers/40', seen: 3000 }];

test('addresses: menu id; anything odd is the dashboard', () => {
  assert.equal(TABR.mod('#/customers/12'), 'customers');
  assert.equal(TABR.norm('#/leads/'), '#/leads');
  for (const h of ['', '#', '#/', 'leads', null, undefined, '#/../x']) assert.equal(TABR.norm(h), '#/dashboard');
});
test('closing: the neighbour comes to the front; a background tab closes quietly', () => {
  assert.deepEqual(TABR.close(L(), 't2', 't2'), { list: [L()[0], L()[2]], active: 't3' });
  assert.equal(TABR.close(L(), 't3', 't3').active, 't2');
  assert.equal(TABR.close(L(), 't1', 't3').active, 't1');
  assert.deepEqual(TABR.close([L()[0]], 't1', 't1'), { list: [], active: '' });
  assert.equal(TABR.close(L(), 't1', 'nope').list.length, 3);
});
test('the open tabs survive a reload - the same menu may be open twice', () => {
  const list = L(); list[1].title = 'Anil';
  const back = TABR.unpack(TABR.pack(list, 't2'));
  assert.deepEqual(back, { list: [{ hash: '#/dashboard', title: '' }, { hash: '#/customers/12', title: 'Anil' }, { hash: '#/customers/40', title: '' }], active: 1 });
});
test('a damaged saved list is dropped or repaired', () => {
  assert.deepEqual(TABR.unpack('not json'), { list: [], active: -1 });
  assert.deepEqual(TABR.unpack(null), { list: [], active: -1 });
  assert.deepEqual(TABR.unpack(JSON.stringify({ a: 3, t: [7, ['x'], [5, 'a'], ['#/leads', 9]] })), { list: [{ hash: '#/dashboard', title: '' }, { hash: '#/leads', title: '' }], active: 1 });
  const many = JSON.stringify({ a: 0, t: Array.from({ length: 20 }, (_, i) => ['#/leads/' + i, '']) });
  assert.equal(TABR.unpack(many).list.length, TABR.MAX);
});
