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
  P(12, 'structure', 'Mounting structure', { unit: 'set', details: 'Hot-dip galvanised (HDG) steel structure, for a concrete roof.', page: 'assets/quote/page-stormshield.jpg' }),
  P(13, 'install', 'Installation', { unit: 'plant' }),
  P(20, 'panels', 'Solar panels', { wp: 550, qty: 10, details: 'ReNew RPS2MH72BD DCR, 550 Wp', warranty: [w(12, 'Panels product'), w(30, 'Panels performance')] }),
  P(21, 'inverter', 'Micro inverters', { title: 'Deye Micro Inverter', kw: 5, kw_line: 1, qty: 3, qty_note: '5 kW · 3-phase', warranty: [w(10, 'Deye micro inverters')] }),
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
    'Worked out on the DC panel capacity (4 × 600 Wp = 2.4 kWp): ₹30,000 per kW for the first 2 kW, plus ₹18,000 per kW for the next 0.4 kW. Credited directly to the customer’s bank account within 30 working days after commissioning.');
});

test('printed rows: optimisers before the inverter, same categories as CATS less the customer scope', () => {
  assert.deepEqual(QM.ROWS.slice(0, 4), ['panels', 'optimiser', 'inverter', 'acdb']);
  assert.deepEqual(QM.ROWS.concat(QM.SCOPE).sort(), QM.CATS.slice().sort());
});

test('customer scope (Additional structure): own category after the mounting structure, kept out of the items rows and warranties', () => {
  assert.deepEqual(QM.SCOPE, ['addstr']);
  assert.equal(QM.CATS.indexOf('addstr'), QM.CATS.indexOf('structure') + 1);
  assert.equal(QM.ROWS.indexOf('addstr'), -1);
  const P = PRODUCTS.concat([{ id: 901, cat: 'addstr', name: 'Walkway', line: 'A safe path', details: 'GI walkway', unit: 'As required', qty: 0, warranty: [{ years: 5, label: 'Walkway' }], page: 'assets/quote/page-x.jpg' }]);
  const setup = Object.assign({}, SETUP2, { items: Object.assign({}, SETUP2.items, { addstr: [{ pid: 901 }] }) });
  const lines = QM.resolve(setup, P), c = QM.calc(setup, lines, SET, R), c0 = QM.calc(SETUP2, QM.resolve(SETUP2, PRODUCTS), SET, R);
  assert.equal(lines.addstr.length, 1); assert.equal(lines.addstr[0].qty, 0);
  assert.deepEqual(QM.qtyText(lines.addstr[0]), { main: 'As required', note: '' });
  assert.deepEqual(QM.qtyText(Object.assign({}, lines.addstr[0], { qty: 1 })), { main: 'As required', note: '' }, 'never "1 As required"');
  assert.deepEqual(c.warranties, c0.warranties, 'no warranty box for customer-scope items');
  assert.deepEqual(c0.pages.feature, ['assets/quote/page-stormshield.jpg'], 'a concrete-roof quotation keeps the StormShield page');
  assert.deepEqual(c.pages.feature, ['assets/quote/page-x.jpg'], 'a sheet-roof quotation (Additional structure line) drops the Mounting structure page and ends with its own');
  const P2 = P.concat([{ id: 902, cat: 'addstr', name: 'Ladder', line: '', unit: 'no', qty: 1, page: 'assets/quote/page-x.jpg' }, { id: 903, cat: 'structure', name: 'Frame', line: '', unit: 'set', qty: 1, page: 'assets/quote/page-x.jpg' }]);
  const s2 = Object.assign({}, setup, { items: Object.assign({}, setup.items, { addstr: [{ pid: 901 }, { pid: 902 }], structure: (setup.items.structure || []).concat([{ pid: 903 }]) }) });
  const f2 = QM.calc(s2, QM.resolve(s2, P2), SET, R).pages.feature;
  assert.equal(f2[f2.length - 1], 'assets/quote/page-x.jpg'); assert.equal(f2.filter(x => x === 'assets/quote/page-x.jpg').length, 1, 'once, and last, even when an item of our own supply carries the same page');
  assert.equal(f2.indexOf('assets/quote/page-stormshield.jpg'), -1);
  const P3 = P.concat([{ id: 904, cat: 'inverter', name: 'Extra', line: '', unit: 'no', qty: 1, kw: 0, page: 'assets/quote/page-inv.jpg' }]);
  const s3 = Object.assign({}, setup, { items: Object.assign({}, setup.items, { inverter: (setup.items.inverter || []).concat([{ pid: 904 }]) }) });
  assert.deepEqual(QM.calc(s3, QM.resolve(s3, P3), SET, R).pages.feature, ['assets/quote/page-inv.jpg', 'assets/quote/page-x.jpg'], 'pages of other items still print, before the sheet-roof page');
  const s4 = Object.assign({}, setup, { items: Object.assign({}, setup.items, { addstr: [{ pid: null, qty: 1, custom: { name: 'Railing', line: 'x', unit: 'no' } }] }) });
  assert.deepEqual(QM.calc(s4, QM.resolve(s4, P), SET, R).pages.feature, [], 'a typed own line under Additional structure also makes it a sheet-roof quotation');
  assert.deepEqual([c.net, c.subsidy, c.loan.loan, c.plantKw, c.dcKwp], [c0.net, c0.subsidy, c0.loan.loan, c0.plantKw, c0.dcKwp], 'price, subsidy and loan unchanged');
});

test('sheet roof: the structure is our supply (row, warranty, price); only walkway / ladder / door are customer scope; no StormShield', () => {
  const P6 = PRODUCTS.concat([{ id: 961, cat: 'addstr', name: 'Walkway', line: 'x', unit: 'set', qty: 1 }, { id: 962, code: 'str-hdg', cat: 'structure', name: 'Mounting structure', line: '', details: 'Hot-dip galvanised (HDG) steel structure.', unit: 'set', qty: 1, warranty: [{ years: 25, label: 'Structure design life' }], page: 'assets/quote/page-stormshield.jpg' }]);
  const concrete = Object.assign({}, SETUP2, { items: Object.assign({}, SETUP2.items, { structure: [{ pid: 962 }] }) });
  const sheet = Object.assign({}, concrete, { items: Object.assign({}, concrete.items, { addstr: [{ pid: 961 }] }) });
  const lc = QM.resolve(concrete, P6), ls = QM.resolve(sheet, P6), cc = QM.calc(concrete, lc, SET, R), cs = QM.calc(sheet, ls, SET, R);
  assert.equal(QM.isSheetRoof(lc), false); assert.equal(QM.isSheetRoof(ls), true); assert.equal(cs.sheetRoof, true);
  assert.equal(QM.printed, undefined, 'no category is hidden on a sheet roof any more');
  assert.ok(cc.warranties.some(w => w.label === 'Structure design life')); assert.ok(cs.warranties.some(w => w.label === 'Structure design life'), 'the structure keeps its warranty box on a sheet roof');
  assert.deepEqual(cc.pages.feature, ['assets/quote/page-stormshield.jpg']); assert.deepEqual(cs.pages.feature, [], 'no StormShield page on a sheet roof, even with a hot-dip structure');
  assert.equal(ls.structure.length, 1);
  const elev = { id: 963, code: 'as-elev-gi', cat: 'structure', name: 'Elevated GI structure', line: 'A GI frame about 1 m above the roof sheets.', details: 'GI frame (not hot-dip galvanised).', unit: 'set', qty: 1, page: QM.SHEET_PAGE };
  const ins = { id: 964, cat: 'install', name: 'Installation', line: '', unit: 'set', qty: 1, page: 'assets/quote/page-inst.jpg' };
  const P7 = P6.concat([elev, ins]);
  const only = Object.assign({}, SETUP2, { items: Object.assign({}, SETUP2.items, { structure: [{ pid: 963 }], install: [{ pid: 964 }] }) });
  const lo = QM.resolve(only, P7), co = QM.calc(only, lo, SET, R);
  assert.equal(QM.isSheetStr(lo.structure[0]), true); assert.equal(QM.isSheetStr(ls.structure[0]), false, 'the HDG concrete-roof structure is not a sheet-roof one');
  assert.equal(QM.isSheetRoof(lo), true, 'the elevated GI structure alone makes it a sheet-roof quotation'); assert.equal(co.sheetRoof, true);
  assert.deepEqual(co.pages.feature, ['assets/quote/page-inst.jpg', QM.SHEET_PAGE], 'the sheet-roof page prints last, after the other pages');
  const both = Object.assign({}, only, { items: Object.assign({}, only.items, { addstr: [{ pid: 961 }] }) });
  const fb = QM.calc(both, QM.resolve(both, P7), SET, R).pages.feature;
  assert.equal(fb.filter(p => p === QM.SHEET_PAGE).length, 1); assert.equal(fb[fb.length - 1], QM.SHEET_PAGE, 'with a walkway too: the sheet-roof page once, last');
});

test('a quotation saved with the elevated GI structure under Additional structure prints it under Mounting structure', () => {
  const elev = { pid: 7, code: 'as-elev-gi', cat: 'addstr', name: 'Elevated GI structure', line: 'A GI frame', details: '' };
  const walk = { pid: 8, code: 'as-walkway', cat: 'addstr', name: 'Walkway', line: 'A safe path on the sheet roof', details: '' };
  const conc = { pid: 3, code: 'str-gi', cat: 'structure', name: 'Mounting structure', line: 'GI structure for a concrete roof', details: '' };
  const own = { pid: null, code: '', cat: 'structure', name: 'Own frame', line: 'typed', details: '' };
  const old = { panels: [{ pid: 1, name: 'Solar panels' }], structure: [conc, own], addstr: [elev, walk], install: [{ pid: 9, name: 'Installation' }] };
  const f = QM.fixLines(old);
  assert.deepEqual(f.structure.map(l => [l.name, l.cat]), [['Own frame', 'structure'], ['Elevated GI structure', 'structure']], 'in place of the concrete-roof structure; a typed own line stays');
  assert.deepEqual(f.addstr.map(l => l.name), ['Walkway'], 'customer scope keeps only the walkway / ladder / door');
  assert.deepEqual(Object.keys(f), ['panels', 'structure', 'addstr', 'install'], 'categories keep their order');
  assert.equal(old.addstr.length, 2, 'the saved snapshot itself is not changed'); assert.equal(QM.fixLines(f), f, 'nothing left to move: same object');
  const onlyElev = QM.fixLines({ addstr: [elev] }); assert.deepEqual(Object.keys(onlyElev), ['structure'], 'no empty customer-scope box');
  const typed = { addstr: [{ pid: null, name: 'Elevated walkway', line: 'typed' }] }; assert.equal(QM.fixLines(typed), typed, 'a typed own line under Additional structure stays');
});

test('StormShield page: only with a hot-dip (HDG) structure, never with a welded GI one', () => {
  const S = 'assets/quote/page-stormshield.jpg';
  const P5 = PRODUCTS.concat([
    { id: 951, code: 'str-gi', cat: 'structure', name: 'Mounting structure', line: '', details: 'GI (galvanised iron) structure, spot welded, for a concrete roof.', unit: 'set', qty: 1, page: S },
    { id: 952, code: 'str-hdg', cat: 'structure', name: 'Mounting structure', line: '', details: 'Steel structure.', unit: 'set', qty: 1, page: S },
  ]);
  const withStr = pid => Object.assign({}, SETUP2, { items: Object.assign({}, SETUP2.items, { structure: [{ pid }] }) });
  const pages = pid => QM.calc(withStr(pid), QM.resolve(withStr(pid), P5), SET, R).pages.feature;
  assert.deepEqual(pages(12), [S], 'HDG wording: StormShield prints');
  assert.deepEqual(pages(951), [], 'welded GI structure: no StormShield, even when the page is attached to it');
  assert.deepEqual(pages(952), [S], 'the HDG product (str-hdg) keeps it even when its words are changed');
  const over = Object.assign({}, SETUP2, { items: Object.assign({}, SETUP2.items, { structure: [{ pid: 12, over: { details: 'GI spot welded frame.' } }] }) });
  assert.deepEqual(QM.calc(over, QM.resolve(over, P5), SET, R).pages.feature, [], 'reworded to a welded structure for this quote: no StormShield');
});

test('cover pages: the list, and the cover a quotation prints with', () => {
  assert.deepEqual(QM.COVERS.map(c => c.k), ['ongrid', 'hybrid', 'solaredge', 'solaredge3', 'premium', 'micro', 'microdeye']);
  assert.ok(QM.COVERS.every(c => /^assets\/quote\/page-front[\w-]*\.jpg$/.test(c.pic) && /^assets\/quote\/thumb-front[\w-]*\.jpg$/.test(c.thumb) && c.name && c.sub && c.kind));
  assert.ok(QM.COVERS.every(c => [c.pic, c.thumb].every(f => require('fs').existsSync(require('path').join(__dirname, '..', f)))), 'every cover picture and thumbnail is in the repo');
  assert.equal(QM.coverOf({ cover: true }).k, 'ongrid', 'saved with the first tick box: the on-grid cover');
  assert.equal(QM.coverOf({ cover: 'hybrid' }).kind, 'hybrid'); assert.equal(QM.coverOf({ cover: 'solaredge' }).kind, 'SolarEdge');
  for (const d of [{}, { cover: false }, { cover: '' }, { cover: 'nope' }, null]) assert.equal(QM.coverOf(d), null);
  const se = QM.coverOf({ cover: 'solaredge' }), tsun = { inverter: [{ name: 'Microinverter', title: 'TSUN Microinverter', details: 'TSUN TSOL-MS2000 2 kW', needs_opt: 0 }] };
  assert.equal(QM.coverOk(se, tsun), false, 'no SolarEdge cover on a TSUN quotation (SolarEdge starts at 3 kW)');
  const se1 = { inverter: [{ name: 'SolarEdge inverter', title: 'SolarEdge Inverter', details: 'SE3000H', needs_opt: 1 }] };
  const se3 = { inverter: [{ name: 'SolarEdge inverter', title: 'SolarEdge 3-Phase Inverter', details: 'SolarEdge SE8K three-phase (400 V, 3 / N / PE), 8 kW', needs_opt: 1 }] };
  const se3c = QM.coverOf({ cover: 'solaredge3' });
  assert.equal(QM.coverOk(se, se1), true); assert.equal(QM.coverOk(se, se3), false, 'the single-phase SolarEdge cover is not for a three-phase plant');
  assert.equal(QM.coverOk(se3c, se3), true); assert.equal(QM.coverOk(se3c, se1), false); assert.equal(QM.coverOk(se3c, tsun), false);
  assert.equal(QM.isSolarEdge3(se3), true); assert.equal(QM.isSolarEdge3({ inverter: [{ name: 'On-grid inverter', details: 'Havells three-phase 6 kW', needs_opt: 0 }] }), false);
  assert.ok(QM.COVERS.every(c => !c.need || QM.NEED[c.need]), 'every need has its rule and text');
  for (const f of require('fs').readdirSync(require('path').join(__dirname, '..', 'tools', 'qm_front')).filter(n => /^front[\w-]*\.html$/.test(n))) {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'tools', 'qm_front', f), 'utf8');
    assert.ok(/Poppins-SemiBold\.ttf/.test(src) && !/Instrument|italic/.test(src), f + ' is set in Poppins (owner: "i prefer poppins font")');
  }
  const pc = QM.coverOf({ cover: 'premium' }), neo = [{ name: 'Solar panels', title: 'Solar panels', details: 'Premier NeoBlack DCR, 600+ Wp, bifacial dual-glass, TOPCon half-cut, full black, ALMM approved.' }];
  const silver = [{ name: 'Solar panels', title: 'Solar panels', details: 'Premier 132 half-cut TOPCon, bifacial dual glass G12R, 600 Wp, DCR.' }];
  assert.equal(QM.coverOk(pc, { ...se3, panels: neo }), true, 'NeoBlack panels + three-phase SolarEdge: the super premium cover');
  assert.equal(QM.coverOk(pc, { ...se3, panels: silver }), false, 'not with silver-frame panels');
  assert.equal(QM.coverOk(pc, { ...se1, panels: neo }), false, 'not with a single-phase SolarEdge');
  assert.equal(QM.coverOk(pc, { ...tsun, panels: neo }), false); assert.equal(QM.coverOk(se3c, { ...se3, panels: neo }), true, 'the plain three-phase cover stays open');
  assert.equal(QM.coverOk(se, {}), false); assert.equal(QM.coverOk(QM.coverOf({ cover: 'ongrid' }), tsun), true); assert.equal(QM.coverOk(null, tsun), false);
  const mc = QM.coverOf({ cover: 'micro' }), choice = { inverter: [{ name: 'Microinverter', title: 'Microinverter', details: 'Option A · TSUN GEN3 TSOL-MS2000, 2 kW · Option B · Deye SUN-M200G4, 2 kW' }] };
  assert.equal(mc.kind, 'TSUN microinverter');
  assert.equal(QM.coverOk(mc, { ...tsun, panels: neo }), true, 'NeoBlack panels + TSUN microinverter: the all-black micro cover');
  assert.equal(QM.coverOk(mc, { ...tsun, panels: silver }), false, 'not with silver-frame panels');
  assert.equal(QM.coverOk(mc, { ...se3, panels: neo }), false, 'not with a SolarEdge inverter');
  assert.equal(QM.coverOk(mc, { ...choice, panels: neo }), false, 'not on a TSUN-or-Deye choice: the cover names TSUN only');
  assert.equal(QM.coverOk(pc, { ...tsun, panels: neo }), false, 'the super premium cover stays SolarEdge only');
  const dc = QM.coverOf({ cover: 'microdeye' });
  const deye2 = { inverter: [{ name: 'Microinverter', title: 'Deye Microinverter', details: 'Deye SUN-M200G4, 2 kW, 4 MPP trackers (one per panel), IP67.' }] };
  const deye5 = { inverter: [{ name: 'Micro inverters', title: 'Deye Micro Inverter', details: 'Deye G4 micro inverters in a 2 kW + 2 kW + 1 kW split' }] };
  const deyeStr = { inverter: [{ name: 'On-grid inverter', title: 'Deye Inverter', details: 'Deye SUN-5K-G05 three-phase string inverter' }] };
  assert.equal(dc.kind, 'Deye microinverter');
  assert.equal(QM.coverOk(dc, { ...deye2, panels: neo }), true, 'NeoBlack panels + Deye 2 kW micro: the Deye micro cover');
  assert.equal(QM.coverOk(dc, { ...deye5, panels: neo }), true, 'and with the Deye 2+2+1 three-phase micros');
  assert.equal(QM.coverOk(dc, { ...deye2, panels: silver }), false, 'not with silver-frame panels');
  assert.equal(QM.coverOk(dc, { ...deyeStr, panels: neo }), false, 'not with a Deye string inverter');
  assert.equal(QM.coverOk(dc, { ...choice, panels: neo }), false, 'not on a TSUN-or-Deye choice');
  assert.equal(QM.coverOk(dc, { ...tsun, panels: neo }), false); assert.equal(QM.coverOk(mc, { ...deye2, panels: neo }), false, 'the TSUN cover is not for Deye');
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
  assert.deepEqual(c.kseb.rows.map(r => r.label), ['KSEB Ltd. feasibility charge', 'Registration fee (₹1,000 per kW, 80% refundable)', 'Stamp paper']);
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

test('calc: kw is per unit unless kw_line', () => {
  const prods = PRODUCTS.concat([P(32, 'inverter', 'Micro', { title: 'TSUN Microinverter', kw: 2 })]);
  const setup = Object.assign({}, SETUP2, { items: Object.assign({}, SETUP2.items, { inverter: [ln(32, 2)] }) });
  assert.equal(QM.calc(setup, QM.resolve(setup, prods), SET, R).plantKw, 4);
  const c5 = QM.calc(SETUP5, QM.resolve(SETUP5, PRODUCTS), SET, R);
  assert.equal(c5.plantKw, 5);
});

test('calc: monthly saving is exact (no float drift)', () => {
  const sv = (wp, qty, tariff) => {
    const prods = PRODUCTS.concat([P(40, 'panels', 'Solar panels', { wp: wp, qty: qty })]);
    const setup = Object.assign({}, SETUP2, { items: Object.assign({}, SETUP2.items, { panels: [ln(40, qty)] }) });
    const s = JSON.parse(JSON.stringify(SET)); s.loan.tariff = tariff;
    return QM.calc(setup, QM.resolve(setup, prods), s, R).loan.saving;
  };
  assert.equal(sv(560, 10, 7.5), 4550);
  assert.equal(sv(700, 4, 6), 1820);
  assert.equal(sv(600, 4, 7), 1820);
  assert.equal(sv(550, 10, 7), 4170);
  assert.equal(sv(510, 10, 8), 4420);
  assert.equal(sv(600, 34, 7), 15470);
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
  assert.equal(v.loan_pct, '90');
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

test('snapSettings: only what the quotation prints with, as a copy, with the subsidy rates', () => {
  const live = Object.assign({ number_format: 'JSS/{NNNN}', site: 'www.x', footer: 'F', pill: 'P', company: { name: 'C' }, bank: { bank: 'B' }, delivery: ['d'], terms: ['t'] }, JSON.parse(JSON.stringify(SET)));
  const s = QM.snapSettings(live, R);
  assert.deepEqual(Object.keys(s).sort(), QM.SNAP_KEYS.concat('subsidy_rates').sort());
  assert.equal(s.number_format, undefined); assert.deepEqual(s.subsidy_rates, R); assert.deepEqual(s.loan, live.loan);
  s.kseb.reg_per_kw = 5; s.subsidy_rates.cap = 1;
  assert.equal(live.kseb.reg_per_kw, 1000); assert.equal(R.cap, 78000);
});

test('calc: 18% GST on the registration fee; quotations frozen before it keep their amount', () => {
  const lines = QM.resolve(SETUP2, PRODUCTS);
  const gst = JSON.parse(JSON.stringify(SET)); gst.kseb.reg_gst = 18;
  const c = QM.calc(SETUP2, lines, gst, R);
  assert.deepEqual(c.kseb.rows.map(r => r.amount), [1000, 2360, 300]); assert.equal(c.kseb.total, 3660);
  const c5 = QM.calc(SETUP5, QM.resolve(SETUP5, PRODUCTS), gst, R);
  assert.equal(c5.kseb.rows[1].amount, 5900);
  /* saved before the GST setting existed: its frozen kseb has no reg_gst → no GST, even with today's 18% */
  const saved = JSON.parse(JSON.stringify(Object.assign({}, SETUP2, { snap: lines, snap_settings: QM.snapSettings(SET, R) })));
  const st = QM.effectiveSettings(saved, gst, R);
  assert.equal(QM.calc(saved, saved.snap, st, st.subsidy_rates).kseb.rows[1].amount, 2000);
});

test('effectiveSettings: a saved quotation keeps its frozen settings while its snapshot is in force', () => {
  const lines = QM.resolve(SETUP2, PRODUCTS);
  const live = JSON.parse(JSON.stringify(SET)); live.kseb.reg_per_kw = 1200; live.loan.rate = 7; live.pay = [{ amt: '50%', text: 'New' }];
  const liveR = { per_kw_first2: 25000, third_kw: 15000, cap: 70000 };
  /* saved: snapshot + settings frozen at save time, through a JSON round trip like the server's */
  const saved = JSON.parse(JSON.stringify(Object.assign({}, SETUP2, { snap: lines, snap_settings: QM.snapSettings(SET, R) })));
  assert.equal(QM.frozen(saved), true);
  const st = QM.effectiveSettings(saved, live, liveR), c = QM.calc(saved, saved.snap, st, st.subsidy_rates);
  assert.deepEqual(c.kseb.rows.map(r => r.amount), [1000, 2000, 300]); assert.equal(c.subsidy, 67200);
  assert.deepEqual(c.loan.emis[0], { months: 60, before: 2958, after: 1659 });
  assert.equal(QM.vars(c, saved, st).rate, '6.00'); assert.deepEqual(c.pay, SET.pay); assert.deepEqual(st.subsidy_rates, R);
  /* an item edit drops snap and snap_settings: today's settings */
  const edited = Object.assign({}, saved); delete edited.snap; delete edited.snap_settings;
  const st2 = QM.effectiveSettings(edited, live, liveR), c2 = QM.calc(edited, lines, st2, st2.subsidy_rates);
  assert.equal(QM.frozen(edited), false);
  assert.equal(c2.kseb.rows[1].amount, 2400); assert.equal(QM.vars(c2, edited, st2).rate, '7.00'); assert.equal(c2.subsidy, 56000);
  assert.equal(c2.loan.emis[0].before, QM.emi(153000, 7, 60)); assert.deepEqual(c2.pay, live.pay);
  /* saved before snap_settings existed: live settings */
  const old = Object.assign({}, SETUP2, { snap: lines });
  assert.equal(QM.frozen(old), false); assert.equal(QM.effectiveSettings(old, live, liveR).kseb.reg_per_kw, 1200);
  /* snap_settings without a snapshot in force (empty snap; PHP turns {} into []): live settings */
  assert.equal(QM.frozen(Object.assign({}, saved, { snap: [] })), false);
  assert.equal(QM.effectiveSettings(Object.assign({}, saved, { snap: {} }), live, liveR).loan.rate, 7);
  /* keys missing from an older snap_settings fall back to live; the live settings object is not changed */
  const partial = Object.assign({}, saved, { snap_settings: { kseb: SET.kseb } }), st3 = QM.effectiveSettings(partial, live, liveR);
  assert.equal(st3.kseb.reg_per_kw, 1000); assert.equal(st3.loan.rate, 7); assert.deepEqual(st3.subsidy_rates, liveR);
  assert.equal(live.kseb.reg_per_kw, 1200); assert.equal(live.subsidy_rates, undefined);
});

test('logoSize: panel and inverter logos share one look and grow; other logos grow a little and fit their column', () => {
  const area = s => s.w * s.h;
  const hav = QM.logoSize(461, 306, 'main1'), pre = QM.logoSize(562, 164, 'main1'), wa = QM.logoSize(998, 184, 'main1');
  assert.ok(Math.abs(area(hav) - area(pre)) / area(pre) < 0.05, 'tall Havells and long Premier get about the same area');
  assert.ok(hav.h <= 44 && pre.w <= 130 && wa.w <= 130, 'within the 130 × 44 box');
  assert.ok(hav.h > 2 * 20 && pre.w > 68.5 * 1.4, 'much larger than the old 20 px cap (Havells 30 × 20, Premier 68.5 × 20)');
  const tsun = QM.logoSize(449, 252, 'main2'), deye = QM.logoSize(880, 351, 'main2');
  assert.ok(tsun.w + deye.w + 7 <= 177, 'two inverter logos still sit side by side in the brand column');
  /* every bundled logo shape (w / h) gets at least the old size in its place: old = 20 px high, max width 75 (one) / 46 (two) / 58 (label) */
  const shapes = [2.62, 2.5, 1.96, 2.51, 1.57, 4.04, 2.63, 6.4, 1.52, 2.17, 4.85, 3.0, 3.49, 4.69, 4.95, 3.83, 1.79, 2.74, 8.49, 5.73];
  const old = (r, mw) => { let h = 20, w = h * r; if (w > mw) { w = mw; h = w / r; } return w * h; };
  for (const [place, mw] of [['one', 75], ['two', 46]]) {
    for (const r of shapes) {
      const s = QM.logoSize(r * 100, 100, place);
      assert.ok(area(s) >= old(r, mw) * 0.99, `${place} ${r}: not smaller than before (sizes are rounded to 0.1 px)`);
      assert.ok(s.h <= 24 && s.w <= QM.LOGO[place][1], `${place} ${r}: inside its box`);
    }
  }
  /* labelled rows (BOX / MCB / SPD …) stay inside one 22 px row so the rows line up; three logos fit beside a 42 px label (135 px) */
  for (const place of ['lab', 'lab2', 'labn']) {
    for (const r of shapes) { const s = QM.logoSize(r * 100, 100, place); assert.ok(s.h <= 22 && s.w <= QM.LOGO[place][1], `${place} ${r}: inside one row`); }
  }
  const box = [1.52, 4.85, 2.74].map(r => QM.logoSize(r * 100, 100, 'labn')); /* Havells, L&T, V-Guard on the BOX line */
  assert.ok(box.reduce((t, s) => t + s.w, 0) + 2 * 8 <= 135, 'the three BOX logos stay on one line');
  const cab = [[1043, 348], [548, 208], [674, 164]].map(([w, h]) => QM.logoSize(w, h, 'three')); /* Microtek, Finolex, KEI on the cable line */
  assert.ok(cab.reduce((t, s) => t + s.w, 0) + 2 * 8 <= 177 && cab.every(s => s.h <= 22 && s.h >= 10), 'the three cable logos stay on one line, readable');
  const abb = QM.logoSize(262, 100, 'lab'), citel = QM.logoSize(196, 100, 'lab');
  assert.ok(Math.abs(area(abb) - area(citel)) / area(abb) < 0.12, 'ABB and CITEL on their own rows look about the same size');
  assert.equal(QM.logoSize(0, 10, 'one'), null); assert.equal(QM.logoSize(10, 10, 'nowhere'), null);
  assert.equal(QM.logoPlace(true, false, 1, true), 'main1'); assert.equal(QM.logoPlace(true, false, 2, false), 'main2');
  assert.equal(QM.logoPlace(false, true, 1, false), 'lab'); assert.equal(QM.logoPlace(false, true, 2, false), 'lab2');
  assert.equal(QM.logoPlace(false, false, 2, false), 'two'); assert.equal(QM.logoPlace(false, false, 1, true), 'one');
  assert.equal(QM.logoPlace(false, true, 3, false), 'labn', 'three logos after a label');
  assert.equal(QM.logoPlace(false, false, 3, false), 'three', 'three unlabelled logos (cables)');
  assert.equal(QM.logoPlace(false, false, 4, false), '', 'four or more unlabelled logos on a line keep the CSS caps');
  assert.deepEqual(QM.MAIN, ['panels', 'optimiser', 'inverter'], 'optimiser rows get the same big logo as the inverter row (same SolarEdge logo size)');
});
