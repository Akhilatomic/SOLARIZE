const test = require('node:test'), assert = require('node:assert');
const IDLE = require('../assets/app38.js');
const NOW = 1794600000000, MIN = 60000;

test('nothing happens while the CRM is in use', () => {
  assert.equal(IDLE.state(NOW, NOW, 30, 60).st, 'ok');
  assert.equal(IDLE.state(NOW, NOW - 28 * MIN, 30, 60).st, 'ok');
  assert.equal(IDLE.state(NOW, NOW - 29 * MIN + 1000, 30, 60).st, 'ok');
});
test('the countdown shows for the last minute', () => {
  const s = IDLE.state(NOW, NOW - 29 * MIN, 30, 60);
  assert.equal(s.st, 'warn'); assert.equal(s.left, 60);
  assert.deepEqual(IDLE.state(NOW, NOW - 30 * MIN + 1000, 30, 60), { left: 1, st: 'warn' });
});
test('signed out when the time is up, and long after', () => {
  assert.equal(IDLE.state(NOW, NOW - 30 * MIN, 30, 60).st, 'out');
  assert.equal(IDLE.state(NOW, NOW - 600 * MIN, 30, 60).st, 'out');
});
test('the limit follows the rule', () => {
  assert.equal(IDLE.state(NOW, NOW - 30 * MIN, 45, 60).st, 'ok');
  assert.equal(IDLE.state(NOW, NOW - 45 * MIN, 45, 60).st, 'out');
});
test('clock text', () => {
  assert.equal(IDLE.clock(60), '1:00'); assert.equal(IDLE.clock(9), '0:09'); assert.equal(IDLE.clock(-3), '0:00');
});
