const test = require('node:test'), assert = require('node:assert'), crypto = require('node:crypto');
const QR = require('../assets/app38.js');
/* The codes themselves were checked once against an independent reader (jsQR) for every size 1-9;
   these tests pin the structure and one known result so a later change cannot silently break them. */
const hash = m => crypto.createHash('sha256').update(m.map(r => r.map(c => c ? 1 : 0).join('')).join('\n')).digest('hex').slice(0, 16);
const URI = 'otpauth://totp/Solarize%20CRM%3Aboss?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Solarize%20CRM&digits=6&period=30';

test('size grows with the text: 21 modules for a short text, larger for an authenticator link', () => {
  assert.equal(QR.matrix('HI').length, 21);
  const n = QR.matrix(URI).length; assert.equal((n - 17) % 4, 0); assert.ok(n >= 37 && n <= 53);
  assert.equal(QR.matrix('x'.repeat(180)).length, 53);
  assert.equal(QR.matrix('x'.repeat(181)), null);
});
test('the three corner squares and the timing lines are in place', () => {
  const m = QR.matrix(URI), n = m.length;
  for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let i = 0; i < 7; i++) { assert.ok(m[y][x + i] && m[y + 6][x + i] && m[y + i][x] && m[y + i][x + 6]); }
    assert.ok(m[y + 3][x + 3] && !m[y + 1][x + 1] && !m[y + 5][x + 5]);
  }
  for (let i = 8; i < n - 8; i++) { assert.equal(m[6][i], i % 2 === 0); assert.equal(m[i][6], i % 2 === 0); }
  assert.ok(m[n - 8][8]);
});
test('error-correction bytes: Reed-Solomon over GF(256) (known vector)', () => {
  /* "HELLO WORLD" 1-M data codewords from the QR standard's worked example */
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(QR.remainder(data, QR.divisor(10)), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});
test('same text, same code', () => {
  assert.equal(hash(QR.matrix(URI)), hash(QR.matrix(URI)));
  assert.notEqual(hash(QR.matrix(URI)), hash(QR.matrix(URI + '1')));
});
