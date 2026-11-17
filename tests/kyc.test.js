// Customer profile › KYC PDF: the pure layout of assets/app45.js (made-up details only)
const test = require('node:test'), assert = require('node:assert');
const K = require('../assets/app45.js');
const measure = (t, f, s) => String(t).length * s * (f === 'HB' ? 0.56 : 0.5);
const base = () => ({ company: { name: 'Jasper Solar Solutions', address: 'Nedumangad', phone: '9000000000', email: 'hello@example.in', gstin: '32ABCDE1234F1Z5' }, ref: 'KYC/7', date: '17 Nov 2026', by: 'Boss',
  customer: { name: 'Meera Varghese', facts: [['Phone', '9000000001'], ['Consumer no.', '1157000000001'], ['Customer since', '1 Nov 2026'], ['Handled by', '']] },
  sections: [{ title: 'KSEB connection', rows: [['Consumer no.', '1157000000001'], ['Tariff', 'LT-1A'], ['Phase', ''], ['Address', 'Rose Villa, Palm Lane, Kizhakkekara P O, Nedumangad, Thiruvananthapuram, Kerala and a long way further down the same lane past the temple and the school, near the old bridge, second house on the left after the shop']] },
    { title: 'Empty one', rows: [['A', ''], ['B', null]] }, { title: 'Personal & contact', rows: [['Aadhaar no.', '••••••••2109'], ['PAN no.', 'ABCPV1234K'], ['Email', 'meera@example.in']] }] });
const texts = (L, p) => L.ops.filter(o => o.t && (p == null || o.p === p)).map(o => o.t);
test('layout: the document name, the brand line and the customer on page 1; only filled details', () => {
  const L = K.layout(base(), measure), t = texts(L);
  assert.strictEqual(L.pages, 1); assert.strictEqual(K.TITLE, 'Jasper Solar KYC Doc');
  assert.ok(t.includes('Jasper Solar KYC Doc') && t.includes('JASPER SOLAR SOLUTIONS') && t.includes('Meera Varghese') && t.includes('KYC/7 · 17 Nov 2026'));
  assert.ok(L.ops.some(o => o.img === 'logo' && o.p === 0 && o.w === o.h));
  ['KSEB CONNECTION', 'PERSONAL & CONTACT', 'CONSUMER NO.', 'LT-1A', '••••••••2109', 'ABCPV1234K', 'Customer signature', 'For Jasper Solar Solutions', 'Page 1 of 1'].forEach(x => assert.ok(t.includes(x), x));
  ['EMPTY ONE', 'PHASE', 'HANDLED BY', 'A', 'B'].forEach(x => assert.ok(!t.includes(x), x));
  assert.ok(t.some(x => /^Confidential - customer KYC record\. Prepared on 17 Nov 2026 by Boss\.$/.test(x)));
});
test('layout: hairlines only, nothing filled, everything inside the page; a long value wraps over the whole width', () => {
  const L = K.layout(base(), measure), P = K.PAGE;
  assert.ok(L.ops.every(o => !o.rc)); assert.ok(L.ops.filter(o => o.ln).every(o => o.w <= 0.5));
  L.ops.filter(o => o.t).forEach(o => { assert.ok(o.x >= P.x0 - 0.01 && o.x + measure(o.t, o.f, o.s) <= P.x1 + 0.01, o.t); assert.ok(o.y > 30 && o.y < P.h - 14, o.t); });
  const addr = L.ops.filter(o => o.t && /Rose Villa|old bridge|the shop/.test(o.t)); assert.ok(addr.length >= 2 && addr.every(o => o.x === P.x0));
});
test('layout: many details run on to more pages, each with its running line and footer', () => {
  const d = base(); for (let s = 0; s < 6; s++) d.sections.push({ title: 'Section ' + s, rows: Array.from({ length: 24 }, (_, i) => ['Field ' + i, 'Value ' + s + '-' + i]) });
  const L = K.layout(d, measure); assert.ok(L.pages >= 3);
  for (let p = 0; p < L.pages; p++) { const t = texts(L, p); assert.ok(t.includes('Page ' + (p + 1) + ' of ' + L.pages)); if (p) assert.ok(t.includes('Jasper Solar KYC Doc') && t.includes('Meera Varghese')); }
  L.ops.filter(o => o.t && o.s === 9.5).forEach(o => assert.ok(o.y <= K.PAGE.bottom + 0.01, o.t));
  assert.strictEqual(texts(L).filter(x => /^Value 3-/.test(x)).length, 24);
  const h = L.ops.find(o => o.t === 'SECTION 4'), first = L.ops.find(o => o.t === 'Value 4-0'); assert.strictEqual(h.p, first.p); /* a heading is not left alone at the foot of a page */
});
test('fileName and an empty profile', () => {
  assert.strictEqual(K.fileName('VINOD KUMAR.J'), 'Jasper Solar KYC Doc - VINOD KUMAR.J.pdf'); assert.strictEqual(K.fileName('A/B: C?'), 'Jasper Solar KYC Doc - A B C.pdf'); assert.strictEqual(K.fileName(''), 'Jasper Solar KYC Doc.pdf');
  const L = K.layout({}, measure); assert.strictEqual(L.pages, 1); assert.ok(texts(L).includes('Customer'));
});
