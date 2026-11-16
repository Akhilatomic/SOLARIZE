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
const W = (t, c, x0, y0, x1, y1) => ({ text: t, confidence: c, bbox: { x0, y0, x1, y1 } });
const L = (...w) => ({ words: w }), BL = (...l) => [{ paragraphs: [{ lines: l }] }];
test('lines: sure words are kept with the box around them; unsure words and stray marks go', () => {
  const B = BL(
    L(W('=', 87, 10, 50, 30, 90), W('Akhil', 91, 100, 50, 200, 90), W('ST', 93, 220, 52, 300, 88), W('xq', 12, 320, 50, 400, 90), W('|', 80, 420, 50, 430, 90)),
    L(W('gl', 64, 0, 0, 10, 10)),                      // a lone mark off the photo
    L(W('INE', 62, 0, 0, 10, 10)),                     // nothing in the line is sure
    L(W('WER', 76, 0, 0, 10, 10)),                     // one short word, not sure enough
    L(W('MALE', 96, 0, 100, 100, 120)),
    L(W('S/O', 50, 0, 140, 50, 160), W('Sundaresan,', 93, 60, 140, 400, 160), W('zz', 49, 410, 140, 500, 160)));
  assert.deepStrictEqual(O.lines(B, 1000, 200, 60), [
    { text: 'Akhil ST', x: 0.1, y: 0.25, w: 0.2, h: 0.2 },
    { text: 'MALE', x: 0, y: 0.5, w: 0.1, h: 0.1 },
    { text: 'S/O Sundaresan,', x: 0, y: 0.7, w: 0.4, h: 0.1 }]);
  assert.deepStrictEqual(O.lines(null, 1000, 200, 60), []); assert.deepStrictEqual(O.lines(B, 0, 0, 60), []);
});
test('rows / text: top to bottom, side-by-side pieces on one text line; score counts letters and digits', () => {
  const B = BL(L(W('4203 8422', 96, 300, 300, 600, 340)), L(W('Kerala', 92, 500, 100, 700, 130)), L(W('Address:', 96, 10, 102, 200, 132)));
  const ls = O.lines(B, 1000, 400, 60);
  assert.deepStrictEqual(ls.map(l => l.text), ['Address:', 'Kerala', '4203 8422']);
  assert.strictEqual(O.text(ls), 'Address:    Kerala\n4203 8422'); assert.strictEqual(O.score(ls), 21); assert.strictEqual(O.text([]), '');
  assert.strictEqual(O.alnum('S/O: 12 -'), 4); assert.ok(O.alnum('അഖിൽ') >= 2); assert.strictEqual(O.alnum('|=~ @'), 0);
});
