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
test('lines: each found line with its place on the picture; empty and unsure lines are left out', () => {
  const B = [{ paragraphs: [{ lines: [
    { text: 'Akhil  S T\n', confidence: 91, bbox: { x0: 100, y0: 50, x1: 300, y1: 90 } },
    { text: '  \n', confidence: 95, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } },
    { text: '|;~', confidence: 12, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } },
    { text: 'no box', confidence: 90 }] }] }, { paragraphs: [{ lines: [{ text: '4203 8422', confidence: 60, bbox: { x0: 0, y0: 100, x1: 500, y1: 200 } }] }] }];
  assert.deepStrictEqual(O.lines(B, 1000, 200, 30), [{ text: 'Akhil S T', x: 0.1, y: 0.25, w: 0.2, h: 0.2 }, { text: '4203 8422', x: 0, y: 0.5, w: 0.5, h: 0.5 }]);
  assert.deepStrictEqual(O.lines(null, 1000, 200, 30), []); assert.deepStrictEqual(O.lines(B, 0, 0, 30), []);
});
