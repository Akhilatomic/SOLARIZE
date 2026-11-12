// Accounts rules (assets/app32.js). Run: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const ACC = require('../assets/app32.js');

test('before GST: tax bill taxable wins, else ÷ 1.089', () => {
  assert.equal(ACC.beforeGst(592970, 541236.46), 541236.46);
  assert.equal(ACC.beforeGst(108900, 0), 100000);
  assert.equal(ACC.beforeGst('217800', null), 200000);
});
test('cost totals and profit', () => {
  const lines = [{ qty: 16, rate: 14200 }, { qty: 1, rate: 27500 }, { qty: 2, rate: 0 }, { qty: 0, rate: 0 }];
  assert.deepEqual(ACC.costTotals(lines), { total: 254700, n: 4, missing: 1 });
  assert.deepEqual(ACC.profit({ price: 0, taxable: 541236.46, lines, comm: 30000 }), { before: 541236.46, cost: 254700, comm: 30000, profit: 256536.46, margin: 47.4 });
  assert.deepEqual(ACC.profit({ price: 0, taxable: 0, lines: [], comm: 0 }), { before: 0, cost: 0, comm: 0, profit: 0, margin: 0 });
});
test('expense before GST', () => { assert.equal(ACC.exBefore({ amount: 1180, gst: 18 }), 1000); assert.equal(ACC.exBefore({ amount: 500, gst: 0 }), 500); });
test('fill templates', () => {
  assert.equal(ACC.fill('Dear {manager}, ₹{amount} on {date}{nope}.', { manager: 'Sir', amount: 140000, date: '12 Oct 2026' }), 'Dear Sir, ₹1,40,000 on 12 Oct 2026.');
  assert.equal(ACC.fill('₹{pending}', { pending: 1250.5 }), '₹1,250.50');
});
test('periods', () => {
  assert.deepEqual(ACC.period('2026-11'), { from: '2026-11-01', to: '2026-11-30', label: 'Nov 2026', kind: 'month' });
  assert.deepEqual(ACC.period('fy-26-27'), { from: '2026-04-01', to: '2027-03-31', label: 'FY 2026-27', kind: 'fy' });
  assert.equal(ACC.period('', '2027-02-14').from, '2027-02-01');
});
test('WhatsApp link', () => {
  assert.equal(ACC.waLink('090000 00011', 'Hi & bye'), 'https://wa.me/919000000011?text=Hi%20%26%20bye');
  assert.equal(ACC.waLink('', 'x'), 'https://wa.me/?text=x');
});
test('material list PDF layout: every line, pages, signature, no prices', () => {
  const lines = Array.from({ length: 120 }, (_, i) => ({ grp: ACC.GROUPS[i % 10], name: 'Item ' + (i + 1), qty: i + 1, unit: 'Nos' }));
  const L = ACC.mlLayout({ company: { name: 'Test Co' }, no: 'JS/ML/26-27/5', date: '12 Nov 2026', customer: { name: 'Test Person' }, project: { kw: '10' }, lines });
  const texts = L.pages.flatMap(p => p.ops.filter(o => o.t === 'text').map(o => o.txt));
  assert.ok(L.pages.length >= 3);
  for (let i = 1; i <= 120; i++) assert.ok(texts.includes('Item ' + i), 'line ' + i);
  L.pages.forEach((p, i) => assert.ok(p.ops.some(o => o.txt === `Page ${i + 1} / ${L.pages.length}`)));
  assert.ok(L.pages.at(-1).ops.some(o => o.txt === 'Received at site (engineer / customer) · signature'));
  assert.ok(!texts.some(t => /₹|rate|price/i.test(t)));
  L.pages.forEach(p => p.ops.forEach(o => { if (o.y !== undefined) assert.ok(o.y >= 0 && o.y <= 297); }));
});
test('material list: empty fields skipped, ticks present, long names wrap, signature always fits', () => {
  const L = ACC.mlLayout({ company: { name: 'Test Co' }, no: 'N1', date: 'd', customer: { name: 'Test Person', phone: '' }, project: {}, lines: [{ grp: 'Solar panels', name: 'x '.repeat(80), qty: 2, unit: 'Nos' }] });
  const t1 = L.pages[0].ops.filter(o => o.t === 'text').map(o => o.txt).join('|');
  assert.ok(t1.includes('Test Person') && !t1.includes('Phone'));
  assert.ok(L.pages[0].ops.filter(o => o.t === 'box').length >= 2);
  assert.ok(L.pages[0].ops.filter(o => o.t === 'text' && /^x( x)*$/.test(o.txt.trim())).length >= 2);
  for (let n = 1; n < 80; n++) {
    const M = ACC.mlLayout({ company: { name: 'C' }, no: 'N', date: 'd', lines: Array.from({ length: n }, (_, i) => ({ grp: 'Solar panels', name: 'Item ' + i, qty: 1, unit: 'Nos' })) });
    M.pages.forEach(p => p.ops.forEach(o => { if (o.y !== undefined) assert.ok(o.y <= 297, 'n=' + n); }));
    assert.ok(M.pages.at(-1).ops.some(o => o.txt && o.txt.startsWith('Purchased by')), 'n=' + n);
  }
});
