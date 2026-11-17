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
test('lines: unsure digit groups beside sure ones are kept, icon marks and stray quotes go, split pieces are joined', () => {
  const B = BL(
    L(W('8394', 41, 180, 250, 230, 272)),                                          // the bold first group, read as a piece of its own
    L(W('0776', 95, 240, 250, 290, 272), W('6245', 94, 296, 250, 350, 272)),
    L(W('DA', 55, 150, 290, 170, 305), W('help@example.in', 90, 176, 290, 320, 305)),   // an envelope icon read as letters
    L(W("'Unique", 88, 110, 40, 180, 58), W('Authority', 93, 186, 40, 270, 58)),
    L(W('TC', 70, 30, 160, 50, 176), W('12/345,', 92, 56, 160, 120, 176)),             // a real short word stays
    L(W('LJ', 80, 700, 100, 720, 115), W('J', 85, 730, 100, 740, 115)),                // loose letters off a QR code
    L(W('77', 35, 600, 250, 640, 272)));                                             // weak digits far from any number: a mark
  assert.deepStrictEqual(O.lines(B, 1000, 400, 60).map(l => l.text), ['Unique Authority', 'TC 12/345,', '8394 0776 6245', 'help@example.in']);
  const in1 = BL(L(W('4455', 35, 10, 10, 60, 30), W('1122', 96, 70, 10, 120, 30), W('zz', 35, 130, 10, 160, 30)));
  assert.deepStrictEqual(O.lines(in1, 1000, 400, 60).map(l => l.text), ['4455 1122']);
});
test('ID: Aadhaar number needs a right check digit; the VID is not it', () => {
  const I = O.ID, a = '21234567890' + I.checkDigit('21234567890'), g = I.group(a);
  assert.ok(I.verhoeff(a)); assert.ok(!I.verhoeff(a.slice(0, 11) + ((+a[11] + 1) % 10))); assert.ok(!I.verhoeff('12ab'));
  assert.strictEqual(I.aadhaar('VID : 9123 4567 8901 2345\n' + g + '\nhelp'), a);
  assert.strictEqual(I.aadhaar(a.slice(0, 4) + ' ' + a.slice(4, 8) + ' ' + ((+a[8] + 1) % 10) + a.slice(9)), '');       // one digit misread
  assert.strictEqual(I.aadhaar('1947  695561'), ''); assert.strictEqual(g.length, 14);
});
test('ID: PAN with mixed-up letters and digits put right by their place', () => {
  const I = O.ID;
  assert.strictEqual(I.pan('ABCPK1234F'), 'ABCPK1234F'); assert.strictEqual(I.pan('abcpk12e4f AB0PKI2S4F'), 'ABOPK1254F');
  assert.strictEqual(I.pan('GOVERNMENT DEPARTMENT 1234567890'), ''); assert.strictEqual(I.pan('ABCXK1234F'), '');
});
test('ID: parse reads an Aadhaar card (front and back) and a PAN card', () => {
  const I = O.ID, a = I.group('39876543210' + I.checkDigit('39876543210'));
  const front = I.parse('Government of India\nMeera Varghese    gl\nDOB: 04/09/1988\nFemale\n' + a);
  assert.deepStrictEqual([front.kind, front.aadhaar_no, front.name, front.dob, front.gender], ['aadhaar', a, 'Meera Varghese', '04/09/1988', 'Female']);
  const back = I.parse('Unique Identification Authority of India\nAddress: C/O: Thomas, Rose Villa,\nPalm Lane, Kizhakkekara P o,    xk\nNedumangad, Thiruvananthapuram,\nKerala, 695999\n' + a + '\n1947    help@uidai.gov.in');
  assert.strictEqual(back.address, 'C/O: Thomas, Rose Villa, Palm Lane, Kizhakkekara P o, Nedumangad, Thiruvananthapuram, Kerala'); assert.strictEqual(back.pincode, '695999'); assert.strictEqual(back.aadhaar_no, a);
  const pan = I.parse('INCOME TAX DEPARTMENT    GOVT. OF INDIA\nPermanent Account Number Card\nABCPV1234K\nName\nMEERA VARGHESE\nFather\'s Name\nTHOMAS VARGHESE\nDate of Birth\n04/09/1988');
  assert.deepStrictEqual([pan.kind, pan.pan_no, pan.name, pan.dob, pan.address], ['pan', 'ABCPV1234K', 'MEERA VARGHESE', '04/09/1988', '']);
  const old = I.parse('INCOME TAX DEPARTMENT\nMEERA VARGHESE\nTHOMAS VARGHESE\n04/09/1988\nPermanent Account Number\nABCPV1234K');
  assert.deepStrictEqual([old.name, old.dob], ['MEERA VARGHESE', '04/09/1988']);
  assert.strictEqual(I.parse('KSEB bill 1157 0000 1234').kind, '');
  assert.ok(I.sameName('Varghese Meera', 'MEERA VARGHESE')); assert.ok(!I.sameName('Meera V', 'Meera Varghese')); assert.ok(!I.sameName('', ''));
});
