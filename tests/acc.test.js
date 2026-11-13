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
  assert.deepEqual(all.lines[0], { material_id: 1, grp: 'Inverter & optimizers', name: 'Test Inverter', qty: 1, unit: 'Nos', rate: 0, gst: 5, profit: null });
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
test('who paid: a Loan-mode payment defaults to the bank, any other mode keeps the choice', () => {
  assert.equal(ACC.payFrom('Loan', 'customer'), 'bank');
  assert.equal(ACC.payFrom('UPI', 'bank'), 'bank');
  assert.equal(ACC.payFrom('Bank transfer', 'customer'), 'customer');
  assert.equal(ACC.payFrom('UPI', undefined), 'customer');
});
test('reminder amount: the customer part on a loan project, else what is due', () => {
  assert.equal(ACC.remindDue({ due: 290000, cust_due: 20000 }), 20000);
  assert.equal(ACC.remindDue({ due: 120000.456 }), 120000.46);
  assert.equal(ACC.remindDue({ due: 300000, cust_due: null }), 300000);
  assert.equal(ACC.remindDue({ due: 270000, cust_due: 0 }), 0);
});
/* ---- Expense sheet and price list ---- */
test('customer price = dealer price + profit %, 2 decimals', () => {
  assert.equal(ACC.custPrice(14200, 15), 16330);
  assert.equal(ACC.custPrice(1000, 0), 1000);
  assert.equal(ACC.custPrice(0.33, 15), 0.38);
  assert.equal(ACC.custPrice('2,500', 10), 0, 'not a plain number -> 0');
  assert.equal(ACC.custPrice(999.99, 12.5), 1124.99);
  assert.equal(ACC.custPrice(100, null), 100, 'no % -> dealer price');
});
test('profit %: blank uses the default, a typed 0 stays 0', () => {
  assert.equal(ACC.PROFIT_DEF, 15);
  assert.equal(ACC.pctOf(null, 20), 20);
  assert.equal(ACC.pctOf('', 20), 20);
  assert.equal(ACC.pctOf(undefined, 20), 20);
  assert.equal(ACC.pctOf(0, 20), 0);
  assert.equal(ACC.pctOf('12.5', 20), 12.5);
  assert.equal(ACC.pctOf(null, null), 15, 'no default given -> 15');
  assert.equal(ACC.pctOf(null, 0), 0, 'a default of 0 is kept');
  assert.equal(ACC.pctOf('abc', 18), 18);
});
test('line expense and line customer price', () => {
  const l = { qty: 16, rate: 14200, profit: 10 };
  assert.equal(ACC.lineExpense(l), 227200);
  assert.equal(ACC.lineCust(l, 15), 249920);
  assert.equal(ACC.lineCust({ qty: 16, rate: 14200, profit: null }, 15), 261280, 'blank % -> the default');
  assert.equal(ACC.lineCust({ qty: 3, rate: 0.33, profit: 15 }, 15), 1.14);
  assert.equal(ACC.lineCust({ qty: 0, rate: 500, profit: 15 }, 15), 0);
});
test('sheet totals: purchases, services, commission, expense, customer total', () => {
  const lines = [
    { grp: 'Solar panels', qty: 16, rate: 14200, profit: 10 },
    { grp: 'Inverter & optimizers', qty: 1, rate: 27500, profit: null },
    { grp: 'Services and charges', qty: 1, rate: 8000, profit: 0 },
    { grp: 'Solar panels', qty: 2, rate: 0, profit: 15 },
  ];
  const t = ACC.sheetTotals(lines, 12000, 20);
  assert.deepEqual(t, { purchases: 254700, services: 8000, comm: 12000, expense: 274700, cust: 249920 + 33000 + 8000, n: 4, missing: 1, bought: 0, tobuy: 262700 });
  /* the Profit tile uses the same numbers as ACC.profit (Accounts › Profit) */
  const P = ACC.profit({ price: 0, taxable: 300000, lines, comm: 12000 });
  assert.equal(P.cost + P.comm, t.expense);
  assert.equal(P.profit, ACC.r2(300000 - t.expense));
  assert.deepEqual(ACC.sheetTotals(null, null, null), { purchases: 0, services: 0, comm: 0, expense: 0, cust: 0, n: 0, missing: 0, bought: 0, tobuy: 0 });
});
test('profit % a new line gets: the item\'s own, else 0 for a KSEB / stamp paper fee, else the default', () => {
  assert.equal(ACC.addPct({ name: 'Test Panel', profit: 12 }, 15), 12);
  assert.equal(ACC.addPct({ name: 'Test Panel', profit: null }, 15), 15);
  assert.equal(ACC.addPct({ name: 'KSEB feasibility', profit: null }, 15), 0);
  assert.equal(ACC.addPct({ name: 'kseb registration ', profit: '' }, 20), 0);
  assert.equal(ACC.addPct({ name: 'Stamp paper' }, 15), 0);
  assert.equal(ACC.addPct({ name: 'Typed fee', note: 'From Finance › Fees' }, 15), 0);
  assert.equal(ACC.addPct({ name: 'KSEB feasibility', profit: 5 }, 15), 5, 'a fee item\'s own % is kept');
  assert.equal(ACC.addPct({ name: 'KSEB liaisoning, documentation and subsidy process', profit: null }, 15), 15, 'a service that is not a fee takes the default');
  assert.equal(ACC.addPct(null, 18), 18);
});
test('commission / incentive line: label and status', () => {
  assert.equal(ACC.commLabel({ kind: 'commission', person: 'Test Ba' }), 'Commission — Test Ba');
  assert.equal(ACC.commLabel({ kind: 'incentive', person: 'Test Staff' }), 'Incentive — Test Staff');
  assert.equal(ACC.commLabel({ kind: '', person: '' }), 'Commission / incentive');
  assert.equal(ACC.commLabel(null), 'Commission / incentive');
  assert.equal(ACC.commStatus({ amount: 0, p1: 0, p2: 0 }), 'Not set');
  assert.equal(ACC.commStatus({ amount: 15000, p1: 0, p2: 0 }), 'Pending');
  assert.equal(ACC.commStatus({ amount: 15000, p1: 7500, p2: 0 }), 'Part 1 paid');
  assert.equal(ACC.commStatus({ amount: 15000, p1: 7500, p2: 7500 }), 'Paid');
  assert.equal(ACC.commStatus({ amount: 15000, p1: 15000, p2: 0 }), 'Paid');
  assert.equal(ACC.commStatus(null), 'Not set');
});
test('customer price from the list against the agreed price', () => {
  assert.deepEqual(ACC.listGap(300000, 290920), { diff: 9080, word: 'more' });
  assert.deepEqual(ACC.listGap(280000, 290920), { diff: -10920, word: 'less' });
  assert.deepEqual(ACC.listGap(290920.4, 290920), { diff: 0.4, word: 'matches' });
  assert.deepEqual(ACC.listGap(0, 0), { diff: 0, word: 'matches' });
});
test('copy from another project keeps each line\'s profit %', () => {
  const r = ACC.copyLines([{ material_id: 3, grp: 'Solar panels', name: 'Test Panel', qty: 16, unit: 'Nos', rate: 14200, gst: 5, profit: 12 }, { material_id: 4, grp: 'Solar panels', name: 'Old Line', qty: 1, unit: 'Nos', rate: 1, gst: 5 }], [], false);
  assert.equal(r.lines[0].profit, 12);
  assert.equal(r.lines[1].profit, null, 'a line with no % stays blank (the default)');
});
test('template from sheet lines: product + quantity only, no fees, no automatic line', () => {
  const lines = [
    { material_id: 1, grp: 'Inverter & optimizers', name: 'Test Inverter', qty: 1, unit: 'Nos', rate: 50000, gst: 5, profit: 20, supplier: 'X', bill_no: 'B1', bill_date: '2026-11-01', note: 'n' },
    { material_id: 0, grp: 'Solar panels', name: 'Typed Panel', qty: 16, unit: 'Nos', rate: 14200, gst: 5 },
    { material_id: 46, grp: 'Services and charges', name: 'KSEB feasibility', qty: 1, unit: 'Job', rate: 500, gst: 0 },
    { material_id: 0, grp: 'Services and charges', name: 'Typed fee', qty: 1, unit: 'Job', rate: 500, gst: 0, note: 'From Finance › Fees' },
    { material_id: 0, grp: 'Services and charges', name: 'Incentive — Asha', qty: 1, unit: 'Job', rate: 6000, gst: 0, auto: 'comm' },
  ];
  assert.deepEqual(ACC.tplFromLines(lines), [
    { material_id: 1, grp: 'Inverter & optimizers', name: 'Test Inverter', unit: 'Nos', qty: 1 },
    { material_id: 0, grp: 'Solar panels', name: 'Typed Panel', unit: 'Nos', qty: 16 }]);
  assert.deepEqual(ACC.tplFromLines(null), []);
});
test('template to sheet lines: today\'s prices, add / replace, duplicates, missing products', () => {
  const mats = [
    { id: 1, grp: 'Inverter & optimizers', name: 'Test Inverter', unit: 'Nos', gst: 5, rate: 52000, profit: null, hidden: 0 },
    { id: 2, grp: 'Solar panels', name: 'Test Panel', unit: 'Nos', gst: 5, rate: 14500, profit: 12, hidden: 0 },
    { id: 3, grp: 'Services and charges', name: 'Stamp paper', unit: 'Nos', gst: 0, rate: 100, profit: null, hidden: 0 },
    { id: 4, grp: 'Solar panels', name: 'Hidden Panel', unit: 'Nos', gst: 5, rate: 1, profit: null, hidden: 1 },
    { id: 5, grp: 'DC cables & connectors', name: 'Test Box', unit: 'Nos', gst: 18, rate: 700, profit: null, hidden: 0 }];
  const tpl = { name: 'T', items: [
    { material_id: 1, grp: 'Inverter & optimizers', name: 'Test Inverter', unit: 'Nos', qty: 1 },
    { material_id: 2, grp: 'Solar panels', name: 'Test Panel', unit: 'Nos', qty: 16 },
    { material_id: 3, grp: 'Services and charges', name: 'Stamp paper', unit: 'Nos', qty: 2 },
    { material_id: 99, grp: 'Structure & supports', name: 'Gone Rail', unit: 'm', qty: 30 },
    { material_id: 4, grp: 'Solar panels', name: 'Hidden Panel', unit: 'Nos', qty: 3 },
    { material_id: 0, grp: 'DC cables & connectors', name: 'test box', unit: 'Nos', qty: 4 }] };
  const r = ACC.tplToLines(tpl, mats, [], 'replace', 15);
  const row = n => { const l = r.lines.find(x => x.name === n); return [l.qty, l.rate, l.gst, l.profit, l.material_id]; };
  assert.deepEqual(row('Test Inverter'), [1, 52000, 5, 15, 1], 'item without its own % takes the default');
  assert.deepEqual(row('Test Panel'), [16, 14500, 5, 12, 2], 'the item\'s own %');
  assert.deepEqual(row('Stamp paper'), [2, 100, 0, 0, 3], 'a fee item with a blank % = 0');
  assert.deepEqual(row('Gone Rail'), [30, 0, 18, 15, 99], 'no longer on the list: saved name, dealer price 0, old id kept');
  assert.deepEqual(row('Hidden Panel'), [3, 0, 18, 15, 4], 'hidden = no longer on the list');
  assert.deepEqual(row('Test Box'), [4, 700, 18, 15, 5], 'matched by group + name: the price list name and price');
  assert.deepEqual(r.missing, ['Gone Rail', 'Hidden Panel']); assert.equal(r.skipped, 0);
  /* add: items already on the sheet are skipped (same material, or same group + name in any case) */
  const have = [{ material_id: 2, grp: 'Solar panels', name: 'Other', qty: 1 }, { material_id: 0, grp: 'dc cables & connectors', name: 'TEST BOX', qty: 1 }];
  const a = ACC.tplToLines(tpl, mats, have, 'add', 15);
  assert.deepEqual(a.lines.map(l => l.name), ['Test Inverter', 'Stamp paper', 'Gone Rail', 'Hidden Panel']); assert.equal(a.skipped, 2);
  /* replace keeps only the sheet's own fee lines: they are not loaded twice, other lines are dropped */
  const fee = { material_id: 3, grp: 'Services and charges', name: 'Stamp paper', qty: 1, note: 'From Finance › Fees' };
  const p = ACC.tplToLines(tpl, mats, [fee, have[0]], 'replace', 15);
  assert.deepEqual(p.lines.map(l => l.name), ['Test Inverter', 'Test Panel', 'Gone Rail', 'Hidden Panel', 'Test Box']); assert.equal(p.skipped, 1);
  assert.deepEqual(ACC.tplToLines(null, null, null, 'add'), { lines: [], skipped: 0, missing: [] });
});
test('Add item with several products: pickPlan needs every ticked product to have a quantity above 0', () => {
  const mats = [{ id: 1, name: 'Panel' }, { id: 2, name: 'Cable' }, { id: 3, name: 'Box' }];
  assert.deepEqual(ACC.pickPlan([], mats), { rows: [], ok: false, need: 0 });
  assert.deepEqual(ACC.pickPlan(null, null), { rows: [], ok: false, need: 0 });
  const a = ACC.pickPlan([{ id: 2, qty: '10' }, { id: 1, qty: '' }, { id: 3, qty: '0' }], mats);
  assert.deepEqual(a.rows.map(r => [r.item.name, r.qty]), [['Cable', 10], ['Panel', null], ['Box', null]]);
  assert.equal(a.ok, false); assert.equal(a.need, 2);
  const b = ACC.pickPlan([{ id: 2, qty: '1,250.5' }, { id: '1', qty: 3 }, { id: 99, qty: 5 }, { id: 3, qty: 'x' }], mats);
  assert.deepEqual(b.rows.map(r => [r.item.name, r.qty]), [['Cable', 1250.5], ['Panel', 3], ['Box', null]]); /* an item gone from the list drops out */
  assert.equal(b.ok, false);
  const c = ACC.pickPlan([{ id: 2, qty: '4' }, { id: 1, qty: 2 }, { id: 99, qty: '' }], mats);
  assert.equal(c.ok, true); assert.equal(c.need, 0); assert.deepEqual(c.rows.map(r => r.item.id), [2, 1]);
  assert.equal(ACC.pickPlan([{ id: 1, qty: -2 }], mats).ok, false);
});

/* ---- Purchased / To buy (Expense lines marked as bought) ---- */
test('status words: To buy / Purchased for materials, To pay / Paid for services', () => {
  assert.deepEqual([ACC.statusWord({ grp: 'Solar panels' }), ACC.statusWord({ grp: 'Solar panels', bought: 1 })], ['To buy', 'Purchased']);
  assert.deepEqual([ACC.statusWord({ grp: ACC.SVC }), ACC.statusWord({ grp: ACC.SVC, bought: 1 })], ['To pay', 'Paid']);
  assert.equal(ACC.statusWord(null), 'To buy');
  assert.ok(ACC.isBought({ bought: 1 }) && ACC.isBought({ bought: '1' }) && !ACC.isBought({ bought: 0 }) && !ACC.isBought({}) && !ACC.isBought(null));
});
test('sheetTotals: purchased and to-buy before GST, commission in neither, planned totals unchanged', () => {
  const lines = [
    { grp: 'Solar panels', qty: 2, rate: 1000, bought: 1 },
    { grp: 'Solar panels', qty: 1, rate: 500 },
    { grp: ACC.SVC, qty: 1, rate: 300, bought: 1 },
    { grp: ACC.SVC, qty: 1, rate: 200, bought: 0 }];
  const t = ACC.sheetTotals(lines, 700, 15);
  assert.equal(t.bought, 2300); assert.equal(t.tobuy, 700);
  assert.equal(t.expense, 3000 + 700); assert.equal(t.purchases, 2500); assert.equal(t.services, 500);
  assert.equal(ACC.r2(t.bought + t.tobuy), ACC.r2(t.purchases + t.services));
});
test('markBought: status, date, supplier, bill, bill date (default = purchase date), price paid; the input is not changed', () => {
  const lines = [
    { name: 'A', grp: 'Solar panels', qty: 2, rate: 100, supplier: 'Old', bill_no: 'X1', bill_date: '2026-01-01', profit: 10 },
    { name: 'B', grp: 'Solar panels', qty: 1, rate: 50 },
    { name: 'C', grp: 'Solar panels', qty: 1, rate: 70 }];
  const before = JSON.stringify(lines);
  const r = ACC.markBought(lines, [0, 2], { date: '2026-11-12', supplier: 'Test Supplier', bill_no: 'B-9', bill_date: '', rates: { 0: 120, 2: 70 } });
  assert.equal(JSON.stringify(lines), before);
  assert.deepEqual([r[0].bought, r[0].bought_on, r[0].supplier, r[0].bill_no, r[0].bill_date, r[0].rate], [1, '2026-11-12', 'Test Supplier', 'B-9', '2026-11-12', 120]);
  assert.equal(r[0].typed, true, 'a changed price counts as a typed dealer price');
  assert.ok(!r[2].typed, 'an unchanged price does not');
  assert.equal(r[2].rate, 70); assert.equal(r[0].profit, 10);
  assert.ok(!r[1].bought && r[1].supplier === undefined, 'a line not chosen is untouched');
  assert.equal(ACC.markBought(lines, [1], { date: '2026-11-12', supplier: 'S', bill_no: '', bill_date: '2026-11-10', rates: {} })[1].bill_date, '2026-11-10');
  assert.equal(ACC.markBought(lines, [1], { date: '2026-11-12', supplier: 'S', bill_no: '', bill_date: '', rates: {} })[1].rate, 50, 'no price given: the rate stays');
  assert.deepEqual(ACC.markBought(null, [0], {}), []);
});
test('markBought keeps typed on a line that was already typed, and ignores indexes outside the sheet', () => {
  const r = ACC.markBought([{ name: 'A', qty: 1, rate: 5, typed: true }], [0, 7], { date: '2026-11-12', rates: { 0: 5 } });
  assert.equal(r.length, 1); assert.equal(r[0].typed, true);
});
test('boughtCheck: date required, prices must be numbers >= 0, at least one line', () => {
  const ok = { date: '2026-11-12', rates: { 0: 10 } };
  assert.equal(ACC.boughtCheck([0], ok), '');
  assert.match(ACC.boughtCheck([], ok), /line/i);
  assert.match(ACC.boughtCheck([0], { date: '', rates: {} }), /purchase date/i);
  assert.match(ACC.boughtCheck([0], { date: '2026-02-31', rates: {} }), /purchase date/i);
  assert.match(ACC.boughtCheck([0], { date: '2026-11-12', rates: { 0: -1 } }), /price/i);
  assert.match(ACC.boughtCheck([0], { date: '2026-11-12', rates: { 0: null } }), /price/i);
  assert.match(ACC.boughtCheck([0], { date: '2026-11-12', bill_date: '12/11/2026', rates: {} }), /bill date/i);
});
test('undoBought clears status and date, keeps supplier and bill text', () => {
  const l = ACC.undoBought({ name: 'A', bought: 1, bought_on: '2026-11-12', supplier: 'S', bill_no: 'B', bill_date: '2026-11-12', rate: 9 });
  assert.deepEqual([l.bought, l.bought_on, l.supplier, l.bill_no, l.bill_date, l.rate], [0, '', 'S', 'B', '2026-11-12', 9]);
});
test('sharedValue: the common value of the chosen lines, else blank', () => {
  const lines = [{ supplier: 'S1' }, { supplier: 'S1' }, { supplier: 'S2' }, {}];
  assert.equal(ACC.sharedValue(lines, [0, 1], 'supplier'), 'S1');
  assert.equal(ACC.sharedValue(lines, [0, 2], 'supplier'), '');
  assert.equal(ACC.sharedValue(lines, [0, 3], 'supplier'), '');
  assert.equal(ACC.sharedValue(lines, [], 'supplier'), '');
});
test('material list filter: items still to buy, services out; ask only when a material is purchased', () => {
  const lines = [{ grp: 'Solar panels', name: 'A', bought: 1 }, { grp: 'Solar panels', name: 'B' }, { grp: ACC.SVC, name: 'S' }, { grp: 'Solar panels', name: ' ', bought: 0 }];
  assert.deepEqual(ACC.mlLines(lines, false).map(l => l.name), ['A', 'B']);
  assert.deepEqual(ACC.mlLines(lines, true).map(l => l.name), ['B']);
  assert.equal(ACC.hasBoughtMaterial(lines), true);
  assert.equal(ACC.hasBoughtMaterial([{ grp: ACC.SVC, bought: 1 }, { grp: 'Solar panels' }]), false, 'a paid service does not count');
  assert.equal(ACC.hasBoughtMaterial(null), false);
});
test('copy and template loads give To buy lines, nothing of the source status', () => {
  const src = [{ material_id: 1, grp: 'Solar panels', name: 'P', qty: 2, rate: 10, gst: 5, bought: 1, bought_on: '2026-11-12', supplier: 'S', bill_no: 'B', bill_date: '2026-11-12' }];
  const c = ACC.copyLines(src, [], true).lines[0];
  assert.ok(!c.bought && !c.bought_on && !c.supplier && !c.bill_no && !c.bill_date);
  const t = ACC.tplToLines({ items: [{ material_id: 1, grp: 'Solar panels', name: 'P', qty: 2, bought: 1 }] }, [{ id: 1, grp: 'Solar panels', name: 'P', rate: 10, gst: 5 }], [], 'add', 15).lines[0];
  assert.ok(!t.bought && !t.bought_on);
  assert.deepEqual(ACC.tplFromLines(src), [{ material_id: 1, grp: 'Solar panels', name: 'P', unit: '', qty: 2 }]);
});
test('material list title block says (items still to buy) only when filtered', () => {
  const mk = partial => ACC.mlLayout({ company: { name: 'Test Co' }, no: 'N', date: 'd', partial, lines: [{ grp: 'Solar panels', name: 'Item', qty: 1, unit: 'Nos' }] });
  const has = L => L.pages[0].ops.some(o => o.t === 'text' && /\(items still to buy\)/.test(o.txt));
  assert.equal(has(mk(true)), true); assert.equal(has(mk(false)), false); assert.equal(has(mk(undefined)), false);
});
test('markBought: a blank supplier / bill no. keeps each line\'s own; a typed one applies to all chosen', () => {
  const lines = [{ name: 'A', qty: 1, rate: 1, supplier: 'S1', bill_no: 'B1' }, { name: 'B', qty: 1, rate: 1, supplier: 'S2', bill_no: 'B2' }, { name: 'C', qty: 1, rate: 1 }];
  const keep = ACC.markBought(lines, [0, 1, 2], { date: '2026-11-12', supplier: '  ', bill_no: '', rates: {} });
  assert.deepEqual(keep.map(l => [l.supplier || '', l.bill_no || '']), [['S1', 'B1'], ['S2', 'B2'], ['', '']]);
  assert.ok(keep.every(l => l.bought === 1 && l.bill_date === '2026-11-12'));
  const over = ACC.markBought(lines, [0, 1], { date: '2026-11-12', supplier: 'New', bill_no: 'N-1', rates: {} });
  assert.deepEqual(over.map(l => [l.supplier || '', l.bill_no || '']), [['New', 'N-1'], ['New', 'N-1'], ['', '']]);
  const mix = ACC.markBought(lines, [0, 1], { date: '2026-11-12', supplier: 'New', bill_no: '', rates: {} });
  assert.deepEqual(mix.map(l => [l.supplier, l.bill_no]), [['New', 'B1'], ['New', 'B2'], [undefined, undefined]]);
});

test('category tabs: short names for the quotation groups, the full name for any other group', () => {
  assert.equal(ACC.grpShort('Inverter & optimizers'), 'Inverter');
  assert.equal(ACC.grpShort('Solar panels'), 'Panels');
  assert.equal(ACC.grpShort('Services and charges'), 'Services');
  assert.equal(ACC.grpShort('Earthing & lightning protection'), 'Earthing');
  assert.equal(ACC.grpShort('My own group'), 'My own group');
  assert.equal(ACC.grpShort(''), 'Other');
  ACC.GROUPS.forEach(g => assert.ok(ACC.grpShort(g).length <= 12, g));
  assert.equal(new Set(ACC.GROUPS.map(ACC.grpShort)).size, ACC.GROUPS.length);
});

test('categories: where a group sorts, the full list, and checking a new name', () => {
  const svc = ACC.GROUPS.indexOf(ACC.SVC);
  assert.equal(svc, ACC.GROUPS.length - 1);
  assert.equal(ACC.grpIdx('Solar panels'), 1);
  assert.ok(ACC.grpIdx('Batteries') > ACC.grpIdx('Cable accessories & consumables') && ACC.grpIdx('Batteries') < svc, 'an added category sits before Services');
  assert.ok(ACC.grpIdx('') > svc && ACC.grpIdx(undefined) > svc, 'no group is last');
  assert.equal(['b', 'A', 'a', 'B'].sort(ACC.grpCmp).join(''), 'AaBb');
  assert.deepEqual(ACC.grpAll(null, null), ACC.GROUPS);
  assert.deepEqual(ACC.grpAll(['Batteries', 'accessories 2'], ['Solar panels', 'Zinc', 'Batteries', '', null]).slice(-4), ['accessories 2', 'Batteries', 'Zinc', ACC.SVC]);
  assert.equal(ACC.grpAll(['Solar panels', ACC.SVC], []).length, ACC.GROUPS.length, 'a built-in name is never listed twice');
  const all = ACC.grpAll(['Batteries'], []);
  assert.deepEqual(ACC.grpCheck('  Wind 	  turbines ', all), { name: 'Wind turbines', error: '', same: '' });
  assert.equal(ACC.grpCheck('', all).error, 'Type the category name');
  assert.equal(ACC.grpCheck('   ', all).error, 'Type the category name');
  assert.equal(ACC.grpCheck(null, all).error, 'Type the category name');
  assert.ok(ACC.grpCheck('x'.repeat(41), all).error.includes('too long'));
  assert.equal(ACC.grpCheck('x'.repeat(40), all).error, '');
  assert.ok(ACC.grpCheck('All', all).error && ACC.grpCheck('other', all).error);
  assert.equal(ACC.grpCheck('batteries', all).same, 'Batteries');
  assert.equal(ACC.grpCheck('solar PANELS', all).same, 'Solar panels');
  assert.equal(ACC.grpCheck('Inverter', all).same, 'Inverter & optimizers', 'a short tab name is that group');
  assert.equal(ACC.grpCheck('services', all).same, 'Services and charges');
  assert.equal(ACC.grpCheck('BATTERIES', all, 'Batteries').same, '', 'renaming: its own name in another case is free');
  assert.equal(ACC.grpCheck('Solar panels', all, 'Batteries').same, 'Solar panels');
});

test('supplier prices side by side', () => {
  const sups = [{ id: 1, name: 'Alpha Traders', tag: '' }, { id: 2, name: 'Beta Electricals', tag: ' BE ' }];
  assert.equal(ACC.supTag(sups[0]), 'Alpha'); assert.equal(ACC.supTag(sups[1]), 'BE'); assert.equal(ACC.supTag(null), '');
  const mat = { rate: 1593, offer_id: 11, offers: [{ id: 11, supplier_id: 1, brand: '', rate: 1593 }, { id: 12, supplier_id: 2, brand: 'X', rate: 1530 }, { id: 13, supplier_id: 9, brand: '', rate: 1 }] };
  const v = ACC.offerView(mat, sups);
  assert.deepEqual(v.all.map(o => [o.id, o.tag, o.low, o.diff]), [[12, 'BE', true, -63], [11, 'Alpha', false, 0]]);
  assert.equal(v.used.id, 11); assert.deepEqual(v.others.map(o => o.id), [12]);
  assert.equal(v.lowest, 1530); assert.equal(v.save, 63); assert.equal(v.n, 2);
  const none = ACC.offerView({ rate: 50, offers: [] }, sups);
  assert.deepEqual([none.all, none.used, none.others, none.lowest, none.n, none.save], [[], null, [], 0, 0, 0]);
  const unpicked = ACC.offerView({ rate: 0, offer_id: null, offers: [{ id: 1, supplier_id: 2, rate: 10 }, { id: 2, supplier_id: 1, rate: 10 }] }, sups);
  assert.deepEqual(unpicked.all.map(o => [o.sup, o.low, o.diff]), [['Alpha Traders', true, null], ['Beta Electricals', true, null]]);
  assert.equal(unpicked.save, 0); assert.equal(unpicked.used, null);
  assert.equal(ACC.offerView({ rate: 10, offer_id: 5, offers: [{ id: 5, supplier_id: 1, rate: 10 }] }, sups).all[0].low, false);
  assert.ok(ACC.offerFilter(mat, '', sups) && ACC.offerFilter(mat, 'cheaper', sups) && ACC.offerFilter(mat, 2, sups) && ACC.offerFilter(mat, '1', sups));
  assert.ok(!ACC.offerFilter(mat, 9, sups) && !ACC.offerFilter(mat, 'none', sups) && !ACC.offerFilter(mat, 'pick', sups));
  assert.ok(ACC.offerFilter({ rate: 0, offers: [] }, 'none', sups) && ACC.offerFilter({ rate: 0, offers: [{ id: 1, supplier_id: 1, rate: 5 }] }, 'pick', sups));
});

test('material list: where to buy each line', () => {
  const sups = [{ id: 1, name: 'Alpha Traders' }, { id: 2, name: 'Beta Electricals' }];
  const mat = { rate: 100, offer_id: 7, offers: [{ id: 7, supplier_id: 2, brand: 'Bx', rate: 100 }, { id: 8, supplier_id: 1, brand: '', rate: 90 }] };
  assert.equal(ACC.buyFrom({ supplier: '' }, mat, sups), 'Beta Electricals (Bx)');
  assert.equal(ACC.buyFrom({ supplier: ' Gamma Stores ' }, mat, sups), 'Gamma Stores');
  assert.equal(ACC.buyFrom({ supplier: 'beta electricals' }, mat, sups), 'beta electricals (Bx)');
  assert.equal(ACC.buyFrom({}, Object.assign({}, mat, { offer_id: null }), sups), '');
  assert.equal(ACC.buyFrom({}, null, sups), '');
  const L = ACC.mlLayout({ company: { name: 'Test Co' }, no: 'N', date: 'd', lines: [{ grp: 'Solar panels', name: 'Item A', qty: 1, unit: 'Nos', sup: 'Beta Electricals (Bx)' }, { grp: 'Solar panels', name: 'Item B', qty: 1, unit: 'Nos' }] });
  const t = L.pages[0].ops.filter(o => o.t === 'text');
  const a = t.find(o => o.txt === 'Item A'), s = t.find(o => o.txt === 'Buy from: Beta Electricals (Bx)'), b = t.find(o => o.txt === 'Item B');
  assert.ok(s && s.y > a.y && b.y > s.y + 3, 'the supplier sits under its item, above the next');
  assert.equal(t.filter(o => /^Buy from/.test(o.txt)).length, 1);
});

test('cash and bank book: running balance, paid from', () => {
  const r = ACC.bookRun(1000, [{ dir: 'in', amount: 500.5 }, { dir: 'out', amount: 2000 }, { dir: 'in', amount: 0.1 }]);
  assert.deepEqual(r.map(e => e.bal), [1500.5, -499.5, -499.4]);
  assert.deepEqual(ACC.bookRun(0, []), []);
  const books = [{ id: 3, name: 'Test Bank' }];
  assert.equal(ACC.paidFrom({ bought: 1, pay_book: 3 }, books), 'Paid from Test Bank');
  assert.equal(ACC.paidFrom({ bought: 1, pay_book: 0 }, books), 'Not paid yet');
  assert.equal(ACC.paidFrom({ bought: 1, pay_book: null }, books), '');
  assert.equal(ACC.paidFrom({ bought: 0, pay_book: 3 }, books), '');
  const lines = [{ name: 'A', rate: 10, qty: 1 }, { name: 'B', rate: 5, qty: 1, pay_book: 3 }];
  const m = ACC.markBought(lines, [0, 1], { date: '2026-11-13', pay_book: 0 });
  assert.deepEqual(m.map(l => l.pay_book), [0, 0]);
  assert.deepEqual(ACC.markBought(lines, [0, 1], { date: '2026-11-13' }).map(l => l.pay_book), [null, 3]);
  assert.equal(ACC.undoBought(m[0]).pay_book, null);
});

test('export for the accountant: the sheets of the workbook', () => {
  const d = { company: 'Test Co', label: 'Jun 2034', from: '2034-06-01', to: '2034-06-30', made: '2034-07-01',
    pl: { cols: [{ key: '2034-06', label: 'Jun 2034' }], lines: [{ key: 'h', label: 'Income', kind: 'head', vals: [], total: 0 }, { key: 'sales', label: 'Sales', kind: 'row', vals: [100000], total: 100000 }, { key: 'gross', label: 'Gross profit', kind: 'total', vals: [40000], total: 40000 }, { key: 'over', label: 'Total overheads', kind: 'total', vals: [26000], total: 26000 }, { key: 'net', label: 'Net profit', kind: 'net', vals: [14000], total: 14000 }] },
    books: [{ name: 'Test Bank', book: { from: '2034-06-01', to: '2034-06-30', open: 1000, in: 500, out: 200, close: 1300, rows: [{ date: '2034-06-02', title: 'Received from A', sub: 'UPI', ref: 'R1', dir: 'in', amount: 500 }, { date: '2034-06-03', title: 'Expense', dir: 'out', amount: 200 }] } }],
    gst: { out: { taxable: 100000, cgst: 4450, sgst: 4450, igst: 0, tax: 8900, by: [{ rate: 5, taxable: 70000, cgst: 1750, sgst: 1750, igst: 0, tax: 3500 }] }, itc: { yes: 3000, check: 180, no: 900, by: [{ rate: -1, taxable: 10000, tax: 1800 }] }, net: 5900, net_if_all: 5720,
      sales: [{ no: 'B-1', date: '2034-06-05', customer: 'A', gstin: '', inter: 0, taxable: 100000, tax: 8900, total: 108900 }], purchases: [{ date: '2034-06-07', supplier: 'S', gstin: '32X', bill_no: 'P-1', what: '2 items', src: 'sheet', taxable: 60000, tax: 3000, total: 63000, mark: 'yes', why: '' }] },
    received: [{ date: '2034-06-02', customer: 'A', amount: 500, mode: 'UPI', ref_no: 'R1', receipt_no: 'RC1', src: 'bank' }], expenses: [{ date: '2034-06-03', cat: 'Other', paid_to: 'Shop', mode: 'UPI', amount: 1180, gst: 18, note: '' }],
    salary: { rows: [{ date: '2034-06-07', name: 'P', kind: 'Salary', for_what: 'June', book_id: 2, ref: '', amount: 12000, note: '' }] }, dues: { due: { total: 4248 }, rows: [{ name: 'S', bills: 4248, bills_n: 3, paid: 0, balance: 4248, last_paid: '' }] }, sum: { books: [{ id: 2, name: 'Test Bank' }] } };
  const sh = ACC.exportSheets(d), by = {}; sh.forEach(s => { by[s.name] = s.rows; });
  assert.deepEqual(sh.map(s => s.name), ['Summary', 'Profit & loss', 'Cash & bank', 'Sales register', 'Purchase register', 'GST summary', 'Payments received', 'Expenses', 'Salaries', 'Supplier dues']);
  sh.forEach(s => assert.ok(s.name.length <= 31 && s.rows.length >= 1 && s.widths.length >= 1));
  const find = (rows, label) => rows.find(r => r[0] === label);
  assert.deepEqual(find(by.Summary, 'Net profit, before income tax'), ['Net profit, before income tax', 14000]);
  assert.deepEqual(find(by.Summary, 'Net GST payable'), ['Net GST payable', 5900]);
  assert.deepEqual(find(by.Summary, 'Test Bank'), ['Test Bank', 1000, 500, 200, 1300]);
  assert.deepEqual(find(by.Summary, 'Owed to suppliers (today)'), ['Owed to suppliers (today)', 4248]);
  assert.deepEqual(by['Profit & loss'][0], ['Profit & loss', 'Jun 2034']);
  assert.deepEqual(by['Profit & loss'][1], ['Income']);
  assert.deepEqual(by['Cash & bank'].map(r => r[7]), ['Balance', 1000, 1500, 1300, 1300]);
  assert.deepEqual(by['Cash & bank'][2], ['Test Bank', '2034-06-02', 'Received from A', 'UPI', 'R1', 500, '', 1500]);
  assert.deepEqual(by['Sales register'][1], ['B-1', '2034-06-05', 'A', '', '', 'Kerala', 100000, 8900, 4450, 4450, 0, 108900]);
  assert.deepEqual(by['Purchase register'][1].slice(5), ['Project cost sheet', 60000, 3000, 63000, 'Claim', '']);
  assert.ok(by['GST summary'].some(r => r[0] === 'As on the bill' && r[2] === 1800));
  assert.deepEqual(by['Payments received'][1], ['2034-06-02', 'A', 500, 'UPI', 'R1', 'RC1', 'Bank (loan)']);
  assert.deepEqual(by.Expenses[1], ['2034-06-03', 'Other', 'Shop', 'UPI', 1180, 18, 1000, 180, '']);
  assert.deepEqual(by.Salaries[1], ['2034-06-07', 'P', 'Salary', 'June', 'Test Bank', '', 12000, '']);
  assert.deepEqual(by['Supplier dues'][1], ['S', 4248, 3, 0, 4248, '']);
  sh.forEach(s => s.rows.slice(1).forEach(r => r.forEach(c => assert.ok(typeof c === 'string' || (typeof c === 'number' && isFinite(c))))));
  const fy = ACC.exportSheets(Object.assign({}, d, { pl: { cols: [{ label: 'Apr 34' }, { label: 'May 34' }], lines: [{ key: 'net', label: 'Net', kind: 'net', vals: [1, 2], total: 3 }] } }));
  assert.deepEqual(fy[1].rows, [['Profit & loss', 'Apr 34', 'May 34', 'Total'], ['Net', 1, 2, 3]]);
  assert.equal(ACC.exportSheets({}).length, 10);
  const caf = ACC.exportSheets(Object.assign({}, d, { hideProfit: true }));
  assert.deepEqual(caf.map(s => s.name), ['Summary', 'Cash & bank', 'Sales register', 'Purchase register', 'GST summary', 'Payments received', 'Expenses', 'Salaries', 'Supplier dues']);
  assert.ok(!caf[0].rows.some(r => /profit|Sales, before GST|Overheads/i.test(String(r[0] || ''))) && caf[0].rows.some(r => r[0] === 'Net GST payable') && caf[0].rows.some(r => r[0] === 'Test Bank'));
});
