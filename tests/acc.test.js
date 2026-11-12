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
test('fee lines: by name (any case) or by the Finance note', () => {
  assert.ok(ACC.isFee({ name: 'KSEB feasibility' }) && ACC.isFee({ name: ' kseb REGISTRATION ' }) && ACC.isFee({ name: 'Stamp paper' }));
  assert.ok(ACC.isFee({ name: 'Renamed fee', note: 'From Finance › Fees' }));
  assert.ok(!ACC.isFee({ name: 'KSEB liaisoning, documentation and subsidy process' }) && !ACC.isFee({ name: 'Installation', note: 'paid cash' }) && !ACC.isFee(null));
});
test('copy from another project: no fee lines, nothing twice, rates only when asked', () => {
  const src = [
    { material_id: 1, grp: 'Inverter & optimizers', name: 'Test Inverter', qty: 1, unit: 'Nos', rate: 27500, gst: 5, supplier: 'Test Supplier', bill_no: 'B1', note: 'n' },
    { material_id: 2, grp: 'Solar panels', name: 'Test Panel', qty: 16, unit: 'Nos', rate: 14200, gst: 5 },
    { material_id: 0, grp: 'DC cables & connectors', name: 'Test Box', qty: 2, unit: 'Nos', rate: 1450, gst: 18 },
    { material_id: 46, grp: 'Services and charges', name: 'KSEB feasibility', qty: 1, unit: 'Job', rate: 1000, gst: 18, note: 'From Finance › Fees' },
    { material_id: 47, grp: 'Services and charges', name: 'KSEB registration', qty: 1, unit: 'Job', rate: 10000, gst: 18 },
    { material_id: 0, grp: 'Services and charges', name: 'Typed fee', qty: 1, unit: 'Job', rate: 500, gst: 0, note: 'From Finance › Fees' },
    { material_id: 9, grp: 'Services and charges', name: 'Installation', qty: 1, unit: 'Job', rate: 8000, gst: 18 },
  ];
  const all = ACC.copyLines(src, [], false);
  assert.deepEqual(all.lines.map(l => l.name), ['Test Inverter', 'Test Panel', 'Test Box', 'Installation']);
  assert.equal(all.fees, 3); assert.equal(all.dup, 0);
  assert.ok(all.lines.every(l => l.rate === 0 && l.supplier === undefined && l.note === undefined));
  assert.deepEqual(all.lines[0], { material_id: 1, grp: 'Inverter & optimizers', name: 'Test Inverter', qty: 1, unit: 'Nos', rate: 0, gst: 5 });
  assert.equal(ACC.copyLines(src, [], true).lines[1].rate, 14200);
  /* add below: same material id, or same group + name in any case, is already there */
  const have = [{ material_id: 2, grp: 'Solar panels', name: 'Other name', qty: 10 }, { material_id: 0, grp: 'dc cables & connectors', name: 'TEST BOX ', qty: 1 },
    { material_id: 46, grp: 'Services and charges', name: 'KSEB feasibility', note: 'From Finance › Fees' }];
  const add = ACC.copyLines(src, have, true);
  assert.deepEqual(add.lines.map(l => l.name), ['Test Inverter', 'Installation']);
  assert.equal(add.fees, 3); assert.equal(add.dup, 2);
  assert.deepEqual(ACC.copyLines(null, null, true), { lines: [], fees: 0, dup: 0 });
});
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
  assert.ok(L.pages.at(-1).ops.filter(o => o.t === 'text').map(o => o.txt).join(' ').includes('Received at site (engineer / customer) · signature'));
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
test('material list: spec §9 columns, header on every page, spacing, bounds', () => {
  const lines = Array.from({ length: 90 }, (_, i) => ({ grp: ACC.GROUPS[i % 10], name: 'Item ' + (i + 1), qty: 1000 + i, unit: 'Nos' }));
  const L = ACC.mlLayout({ company: { name: 'Test Co' }, no: 'N', date: 'd', customer: { name: 'Test Person' }, lines });
  const BOTTOM = 297 - 14 - 6;
  assert.ok(L.pages.length >= 2);
  L.pages.forEach(p => {
    const tx = p.ops.filter(o => o.t === 'text').map(o => o.txt);
    ['Test Co', 'Item', 'Ordered', 'Delivered qty', 'OK', 'Remarks'].forEach(h => assert.ok(tx.includes(h), h));
    p.ops.forEach(o => { if (o.t === 'text' && !/^Page /.test(o.txt)) assert.ok(o.y <= BOTTOM, o.txt + ' y=' + o.y); });
    p.ops.forEach(o => { for (const k of ['x', 'x1', 'x2']) if (o[k] !== undefined) assert.ok(o[k] >= 14 && o[k] <= 196, k + '=' + o[k]); });
    // qty right edge sits left of the unit text on every row
    new Set(p.ops.filter(o => o.t === 'text' && o.txt === 'Nos').map(o => o.y)).forEach(y => {
      const q = p.ops.find(o => o.t === 'text' && o.y === y && o.a === 'r'), u = p.ops.find(o => o.t === 'text' && o.y === y && o.txt === 'Nos');
      assert.ok(q.x < u.x, 'qty/unit overlap at y=' + y);
    });
  });
  assert.ok(L.pages[0].ops.some(o => o.txt === 'MATERIAL LIST') && L.pages[0].ops.some(o => o.txt === 'Purchase & site delivery check'));
  const last = L.pages.at(-1).ops, sig = last.find(o => o.t === 'text' && o.txt.startsWith('Purchased by'));
  const rowsBottom = Math.max(...last.filter(o => o.t === 'text' && /^Item \d/.test(o.txt)).map(o => o.y));
  assert.ok(sig.y - 4 > rowsBottom, 'signature below last row');
});
test('material list: signature labels wrap inside their columns with a real-width wrap', () => {
  /* a Helvetica-like measure: 0.56 em per character (wider than the default estimate) */
  const wd = (t, s) => String(t).length * 0.56 * s * 0.3528;
  const wrap = (t, w, s) => { const out = []; let cur = '';
    String(t || '').split(/\s+/).filter(Boolean).forEach(word => { const nx = cur ? cur + ' ' + word : word; if (cur && wd(nx, s) > w) { out.push(cur); cur = word; } else cur = nx; });
    if (cur) out.push(cur); return out.length ? out : ['']; };
  const L = ACC.mlLayout({ company: { name: 'Test Co' }, no: 'N', date: 'd', lines: [{ grp: 'Solar panels', name: 'Item 1', qty: 1, unit: 'Nos' }], wrap });
  const last = L.pages.at(-1).ops, cw = (196 - 14) / 3;
  const sig = last.filter(o => o.t === 'text' && o.s === 8 && o.y > last.find(x => x.txt === 'Item 1').y && !/^Page /.test(o.txt));
  assert.ok(sig.map(o => o.txt).join(' ').includes('Received at site (engineer / customer) · signature'));
  assert.ok(sig.length > 3, 'at least one label wrapped');
  sig.forEach(o => { const col = Math.floor((o.x - 14) / cw); assert.ok(o.x + wd(o.txt, 8) <= 14 + (col + 1) * cw - 1, o.txt + ' overflows its column'); assert.ok(o.x + wd(o.txt, 8) <= 196); });
});
test('material list: no double rule on continuation pages, no dangling | in the company line', () => {
  const lines = Array.from({ length: 90 }, (_, i) => ({ grp: ACC.GROUPS[i % 10], name: 'Item ' + (i + 1), qty: 1, unit: 'Nos' }));
  /* 72 characters: with this wrap (75 per line) the first line would end on the "|" */
  const co = { name: 'Test Co', address: 'Test Building, Sample Road Junction, Sample Town, Sample District 695000', phone: '90000 00000', gstin: '32TESTX0000X1ZX' };
  const wrap = (t, w, s) => { const per = Math.floor(w / (0.56 * s * 0.3528)), out = []; let cur = '';
    String(t).split(' ').forEach(x => { const nx = cur ? cur + ' ' + x : x; if (cur && nx.length > per) { out.push(cur); cur = x; } else cur = nx; }); if (cur) out.push(cur); return out; };
  const L = ACC.mlLayout({ company: co, no: 'N', date: 'd', lines, wrap });
  assert.ok(L.pages.length >= 2);
  L.pages.slice(1).forEach(p => {
    const hz = p.ops.filter(o => o.t === 'line' && o.y1 === o.y2 && o.x1 === 14 && o.x2 === 196).map(o => o.y1).sort((a, b) => a - b);
    for (let i = 1; i < hz.length; i++) assert.ok(hz[i] - hz[i - 1] > 2, 'rules ' + hz[i - 1] + ' and ' + hz[i] + ' too close');
  });
  const sub = L.pages[0].ops.filter(o => o.t === 'text' && o.s === 8 && o.c === '#555555' && o.y < 40).map(o => o.txt);
  assert.ok(sub.length >= 2 && sub.join(' ').includes('GSTIN: 32TESTX0000X1ZX'));
  sub.forEach(t => assert.ok(!/^\s*\||\|\s*$/.test(t), JSON.stringify(t)));
});
