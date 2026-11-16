// Documents › Copy text from picture: the pure helpers of assets/app44.js
const test = require('node:test'), assert = require('node:assert');
const O = require('../assets/app44.js');
test('tidy: trailing spaces, blank-line runs and blank ends go; the text stays', () => {
  assert.strictEqual(O.tidy('\n\n Name: Ravi  \r\n\n\n\nConsumer No 1157 \n\n'), ' Name: Ravi\n\nConsumer No 1157');
  assert.strictEqual(O.tidy(null), ''); assert.strictEqual(O.tidy('   \n \n'), '');
});
test('fit: large photos come down to the limit, small ones stay', () => {
  assert.deepStrictEqual(O.fit(4000, 3000, 2600), [2600, 1950]);
  assert.deepStrictEqual(O.fit(3000, 4000, 2600), [1950, 2600]);
  assert.deepStrictEqual(O.fit(800, 600, 2600), [800, 600]);
  assert.deepStrictEqual(O.fit(0, 0, 2600), [0, 0]);
});
test('langs: English unless English + Malayalam is chosen', () => {
  assert.deepStrictEqual(O.langs('eng'), ['eng']); assert.deepStrictEqual(O.langs('eng+mal'), ['eng', 'mal']); assert.deepStrictEqual(O.langs('x'), ['eng']);
});
