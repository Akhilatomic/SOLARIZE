const test = require('node:test');
const assert = require('node:assert/strict');
const QM = require('../assets/app20.js');

const R = { per_kw_first2: 30000, third_kw: 18000, cap: 78000 };
const SET = {
  valid_days: 5,
  kseb: { feas: 1000, reg_per_kw: 1000, stamp: 300, reg_label: 'Registration fee (₹1,000 per kW, 80% refundable)' },
  loan: { margin_pct: 10, rate: 6.0, months: [60, 84, 120], units_per_kwp: 1300, tariff: 7, cap: 200000 },
  pay: [{ amt: '₹1,180', text: 'Feasibility payment' }],
};
const w = (years, label) => ({ years: String(years), label });
const base = { unit: 'no', qty: 1, qty_note: '', wp: 0, kw: 0, title: '', page: '', warranty: [], brands: [], picture: '', line: 'l', details: 'd', hidden: 0 };
const P = (id, cat, name, f) => Object.assign({}, base, { id, code: 'c' + id, cat, name }, f || {});
const PRODUCTS = [
  P(1, 'panels', 'Solar panels', { wp: 600, qty: 4, details: 'Premier NeoBlack DCR, 600+ Wp', warranty: [w(12, 'Panels product'), w(30, 'Panels performance')] }),
  P(2, 'inverter', 'Microinverter', { title: 'TSUN Microinverter', kw: 2, warranty: [w(12, 'TSUN microinverter')] }),
  P(3, 'acdb', 'ACDB box'), P(4, 'dcdb', 'DCDB box'),
  P(5, 'dccable', 'DC cables', { qty: 10, unit: 'm + m', qty_note: 'red + black' }),
  P(6, 'accable', 'AC cables', { qty: 0, unit: 'As required', qty_note: 'measured on site' }),
  P(7, 'isolator', 'Isolator switch'),
  P(8, 'meter', 'Energy meter', { details: 'single phase', warranty: [w(1, 'Energy meter replacement')] }),
  P(9, 'parts', 'Other electrical parts', { qty: 0, unit: 'As required', qty_note: 'measured on site' }),
  P(10, 'earthing', 'Earthing', { qty: 3, unit: 'earth pits' }),
  P(11, 'la', 'Lightning arrester'),
  P(12, 'structure', 'Mounting structure', { unit: 'set', page: 'assets/quote/page-stormshield.jpg' }),
  P(13, 'install', 'Installation', { unit: 'plant' }),
  P(20, 'panels', 'Solar panels', { wp: 550, qty: 10, details: 'ReNew RPS2MH72BD DCR, 550 Wp', warranty: [w(12, 'Panels product'), w(30, 'Panels performance')] }),
  P(21, 'inverter', 'Micro inverters', { title: 'Deye Micro Inverter', kw: 5, qty: 3, qty_note: '5 kW · 3-phase', warranty: [w(10, 'Deye micro inverters')] }),
  P(22, 'meter', 'Energy meter', { details: 'three-phase, with meter box', warranty: [w(1, 'Energy meter replacement')], hidden: 1 }),
  P(23, 'structure', 'Mounting structure', { unit: 'set' }),
];
const ln = (pid, qty, note, extra) => Object.assign({ pid, qty, qty_note: note || '', over: {} }, extra || {});
const SETUP2 = { items: {
  panels: [ln(1, 4, '2.4+ kWp')], inverter: [ln(2, 1, '2 kW')], acdb: [ln(3, 1)], dcdb: [ln(4, 1)],
  dccable: [ln(5, 10, 'red + black')], accable: [ln(6, 0, 'measured on site')], isolator: [ln(7, 1)], meter: [ln(8, 1)],
  parts: [ln(9, 0, 'measured on site')], earthing: [ln(10, 3)], la: [ln(11, 1)], structure: [ln(12, 1)], install: [ln(13, 1)],
}, price: 170000, subsidy: null, loan: true, title: '', project: '', kseb: null, pay: null };
const SETUP5 = { items: {
  panels: [ln(20, 10, '5.5 kWp')], inverter: [ln(21, 3, '5 kW · 3-phase')], meter: [ln(22, 1)], structure: [ln(23, 1, 'for 10 panels')],
}, price: 346300, subsidy: null, loan: true, title: '', project: '', kseb: null, pay: null };

test('subsidy', () => {
  assert.equal(QM.subsidy(2.4, R), 67200);
  assert.equal(QM.subsidy(2.2, R), 63600);
  assert.equal(QM.subsidy(3.3, R), 78000);
  assert.equal(QM.subsidy(5.5, R), 78000);
  assert.equal(QM.subsidy(1, R), 30000);
});

test('subsidyText', () => {
  assert.equal(QM.subsidyText(4, 600, 2.4, R),
    'Worked out on the DC panel capacity (4 × 600 Wp = 2.4 kWp): ₹30,000 per kW for the first 2 kW, plus ₹18,000 per kW for the next 0.4 kW. Credited directly to the customer\'s bank account within 30 working days after commissioning.');
});

test('emi', () => {
  assert.equal(QM.emi(153000, 6, 60), 2958); assert.equal(QM.emi(85800, 6, 60), 1659);
  assert.equal(QM.emi(153000, 6, 84), 2235); assert.equal(QM.emi(85800, 6, 84), 1253);
  assert.equal(QM.emi(153000, 6, 120), 1699); assert.equal(QM.emi(85800, 6, 120), 953);
  assert.equal(QM.emi(1200, 0, 12), 100);
});

test('inr', () => {
  assert.equal(QM.inr(170000), '1,70,000'); assert.equal(QM.inr(102800), '1,02,800');
  assert.equal(QM.inr(999), '999'); assert.equal(QM.inr(0), '0'); assert.equal(QM.inr(12345678), '1,23,45,678');
  assert.equal(QM.inr(-170000), '-1,70,000');
});

test('resolve: overrides, custom, hidden', () => {
  const r = QM.resolve({ items: { panels: [{ pid: 1, qty: 6, qty_note: '', over: { name: 'My panels', details: 'X' } }],
    meter: [ln(22, 1)], parts: [{ pid: null, qty: 2, qty_note: 'x', custom: { name: 'Custom', line: 'cl', details: 'cd', picture: 'p.png', brands: [] } }] } }, PRODUCTS);
  assert.equal(r.panels[0].name, 'My panels'); assert.equal(r.panels[0].details, 'X'); assert.equal(r.panels[0].line, 'l');
  assert.equal(r.panels[0].qty, 6); assert.equal(r.panels[0].wp, 600);
  assert.equal(r.meter[0].details, 'three-phase, with meter box');
  assert.equal(r.parts[0].name, 'Custom'); assert.equal(r.parts[0].qty, 2); assert.equal(r.parts[0].picture, 'p.png');
  assert.equal(r.panels[0].cat, 'panels');
});

test('calc: 2 kW TSUN Premier HDG', () => {
  const lines = QM.resolve(SETUP2, PRODUCTS);
  const c = QM.calc(SETUP2, lines, SET, R);
  assert.deepEqual([c.panelCount, c.panelWp, c.dcKwp, c.plantKw], [4, 600, 2.4, 2]);
  assert.equal(c.title, '2 kW TSUN Microinverter Quotation'); assert.equal(c.project, '2 kW On-grid PMSGY');
  assert.equal(c.subsidy, 67200); assert.equal(c.subsidyAuto, 67200); assert.equal(c.net, 102800);
  assert.deepEqual(c.kseb.rows.map(r => r.amount), [1000, 2000, 300]); assert.equal(c.kseb.total, 3300);
  assert.equal(c.kseb.rows[1].label, SET.kseb.reg_label);
  assert.deepEqual([c.loan.margin, c.loan.loan, c.loan.after, c.loan.saving], [17000, 153000, 85800, 1820]);
  assert.equal(c.loan.capped, false); assert.equal(c.loan.min_margin, 17000); assert.equal(c.loan.max90, 153000); assert.equal(c.loan.margin90, 17000);
  assert.deepEqual(c.loan.emis, [{ months: 60, before: 2958, after: 1659 }, { months: 84, before: 2235, after: 1253 }, { months: 120, before: 1699, after: 953 }]);
  assert.deepEqual(c.warranties.map(x => x.years), ['12', '30', '12', '1']);
  assert.deepEqual(c.pages.feature, ['assets/quote/page-stormshield.jpg']); assert.equal(c.pages.loan, true);
  assert.equal(c.pay, SET.pay);
  assert.equal(c.phase, 'single-phase');
});

test('calc: subsidy override and loan off', () => {
  const setup = Object.assign({}, SETUP2, { subsidy: 70000, loan: false });
  const c = QM.calc(setup, QM.resolve(setup, PRODUCTS), SET, R);
  assert.equal(c.subsidy, 70000); assert.equal(c.subsidyAuto, 67200); assert.equal(c.net, 100000);
  assert.equal(c.loan, null); assert.equal(c.pages.loan, false);
});

test('calc: 5 kW Deye 2-2-1 three-phase, capped loan', () => {
  const lines = QM.resolve(SETUP5, PRODUCTS);
  const c = QM.calc(SETUP5, lines, SET, R);
  assert.deepEqual([c.panelCount, c.panelWp, c.dcKwp, c.plantKw], [10, 550, 5.5, 5]);
  assert.equal(c.title, '5 kW Deye Micro Inverter Quotation');
  assert.equal(c.subsidy, 78000); assert.equal(c.net, 268300);
  assert.deepEqual(c.kseb.rows.map(r => r.amount), [1000, 5000, 300]); assert.equal(c.kseb.total, 6300);
  const l = c.loan;
  assert.equal(l.capped, true); assert.equal(l.margin, 146300); assert.equal(l.loan, 200000); assert.equal(l.after, 122000);
  assert.equal(l.min_margin, 34630); assert.equal(l.max90, 311670); assert.equal(l.margin90, 34630); assert.equal(l.saving, 4170);
  assert.deepEqual(l.emis, [{ months: 60, before: 3867, after: 2359 }, { months: 84, before: 2922, after: 1782 }, { months: 120, before: 2220, after: 1354 }]);
  assert.deepEqual(c.pages.feature, []);
  assert.equal(c.phase, 'three-phase');
});

test('calc: plant kW sums inverter lines', () => {
  const prods = PRODUCTS.concat([P(30, 'inverter', 'Micro', { title: 'Deye Micro Inverter', kw: 2 }), P(31, 'inverter', 'Micro', { title: 'Deye Micro Inverter', kw: 1 })]);
  const setup = Object.assign({}, SETUP5, { items: Object.assign({}, SETUP5.items, { inverter: [ln(30, 1), ln(30, 1), ln(31, 1)] }) });
  const c = QM.calc(setup, QM.resolve(setup, prods), SET, R);
  assert.equal(c.plantKw, 5); assert.equal(c.kseb.rows[1].amount, 5000);
});

test('calc: settings cap default and margin', () => {
  const s2 = JSON.parse(JSON.stringify(SET)); delete s2.loan.cap;
  const c = QM.calc(SETUP5, QM.resolve(SETUP5, PRODUCTS), s2, R);
  assert.equal(c.loan.loan, 200000);
});

test('vars', () => {
  const c = QM.calc(SETUP5, QM.resolve(SETUP5, PRODUCTS), SET, R);
  const v = QM.vars(c, SETUP5, SET);
  assert.equal(v.rate, '6.00'); assert.equal(v.margin_pct, '10'); assert.equal(v.min_margin, '₹34,630'); assert.equal(v.after, '₹1,22,000');
  assert.equal(v.loan, '₹2,00,000'); assert.equal(v.subsidy, '₹78,000'); assert.equal(v.max90, '₹3,11,670'); assert.equal(v.margin90, '₹34,630');
  assert.equal(v.gross, '₹3,46,300'); assert.equal(v.kwp, '5.5'); assert.equal(v.units, '1,300'); assert.equal(v.tariff, '7');
  assert.equal(v.phase, 'three-phase'); assert.equal(v.days, '5');
  const s3 = JSON.parse(JSON.stringify(SET)); s3.loan.tariff = 7.5;
  assert.equal(QM.vars(c, Object.assign({}, SETUP5, { valid_days: 7 }), s3).tariff, '7.5');
  assert.equal(QM.vars(c, Object.assign({}, SETUP5, { valid_days: 7 }), s3).days, '7');
  const c2 = QM.calc(SETUP2, QM.resolve(SETUP2, PRODUCTS), SET, R);
  assert.equal(QM.vars(c2, SETUP2, SET).phase, 'single-phase');
});

test('fill', () => {
  assert.equal(QM.fill('{a} and {b} and {c} {a}', { a: 'X', b: '₹1' }), 'X and ₹1 and {c} X');
  assert.equal(QM.fill('plain', {}), 'plain');
});

test('qtyText', () => {
  assert.deepEqual(QM.qtyText({ unit: 'no', qty: 1, qty_note: '2 kW' }), { main: '1 no', note: '2 kW' });
  assert.deepEqual(QM.qtyText({ unit: 'no', qty: 4, qty_note: '' }), { main: '4 nos', note: '' });
  assert.deepEqual(QM.qtyText({ unit: 'As required', qty: 0, qty_note: 'measured on site' }), { main: 'As required', note: 'measured on site' });
  assert.deepEqual(QM.qtyText({ unit: 'm + m', qty: 10, qty_note: 'red + black' }), { main: '10 m + 10 m', note: 'red + black' });
  assert.equal(QM.qtyText({ unit: 'earth pits', qty: 3, qty_note: '' }).main, '3 earth pits');
  assert.equal(QM.qtyText({ unit: 'set', qty: 1, qty_note: '' }).main, '1 set');
  assert.equal(QM.qtyText({ unit: 'plant', qty: 1, qty_note: '' }).main, '1 plant');
  const plus = { unit: 'no', qty: 4, qty_note: '', wp: 600, name: 'Solar panels', details: 'Premier 600+ Wp' };
  const plain = { unit: 'no', qty: 4, qty_note: '', wp: 600, name: 'Solar panels', details: 'Premier 600 Wp' };
  assert.deepEqual(QM.qtyText(plus, { dcKwp: 2.4 }), { main: '4 nos', note: '2.4+ kWp' });
  assert.deepEqual(QM.qtyText(plain, { dcKwp: 2.4 }), { main: '4 nos', note: '2.4 kWp' });
  assert.equal(QM.qtyText(Object.assign({}, plus, { qty_note: '3 kWp' }), { dcKwp: 2.4 }).note, '3 kWp');
});
