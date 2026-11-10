const test = require('node:test');
const assert = require('node:assert/strict');
const KD = require('../assets/app24.js');

const RAJ = {
  customer: { name: 'RAJKUMAR M', phone: '9495833804', email: '', address: 'MIZPAH, PARANKIMAMVILA, KUZHICHANI, VATTAVILA P O', district: 'Thiruvananthapuram', pincode: '695541', consumer_no: '1145389020951', kseb_section: 'Udiyankulangara', sanctioned_load: 1.24, phase: 'Single phase', tariff: 'LT-1A Domestic' },
  plant: { capacity: '5', panel_make: 'Renew Photovoltaics Private Limited', panel_type: 'Bifacial Mono perc', panel_wattage: '550', inverter_make: 'Solar Edge', inverter_capacity: '5', inverter_count: '1', inverters: [{ serial: 'ST3923-075063C35-EC' }, { serial: '' }] },
  project: null,
  defaults: { vendor_name: 'M/S JASPER SOLAR SOLUTIONS', vendor_address: 'Jasper Building Anad Bank Junction Nedumangad Thiruvananthapuram', vendor_email: 'info@jasper.solar', vendor_phone: '0960 552 5552', sign_name: 'Er Akhil ST', sign_designation: 'PROPRIETOR', sign_phone: '0960 552 5552' },
  today: '2026-11-10',
};

test('wcr defaults from the profile', () => {
  const v = KD.defaults('wcr', RAJ);
  assert.equal(v.capacity, '5 KW');
  assert.equal(v.phase, 'Single');
  assert.equal(v.pv_watt, '550 Wp');
  assert.equal(v.inv_capacity, '5 KW');
  assert.equal(v.inv_serial, 'ST3923-075063C35-EC');
  assert.equal(v.cust_address, 'MIZPAH, PARANKIMAMVILA, KUZHICHANI, VATTAVILA P O, Thiruvananthapuram, 695541');
  assert.equal(v.consumer_no, '1145389020951');
  assert.equal(v.section, 'Udiyankulangara');
  assert.equal(v.sign_name, 'Er Akhil ST');
  assert.equal(v.date, '2026-11-10');
  assert.equal(v.ref, '');
});

test('an1 defaults', () => {
  const v = KD.defaults('an1', RAJ);
  assert.equal(v.load, '1.24 kW');
  assert.equal(v.capacity, '5 kWp');
  assert.equal(v.category, 'LT-1A Domestic');
  assert.equal(v.other, 'NO');
  assert.equal(v.mount, 'ROOF-TOP');
  assert.equal(v.days, '30 DAYS');
  assert.equal(v.place, 'Thiruvananthapuram');
});

test('every field has a default key and the shared keys are the seven', () => {
  for (const key of ['wcr', 'an1']) {
    const v = KD.defaults(key, RAJ);
    for (const g of KD.DOCS[key].groups) for (const f of g.fields) assert.ok(f.k in v, key + '.' + f.k);
  }
  const shared = KD.DOCS.wcr.groups.flatMap(g => g.fields).filter(f => f.share).map(f => f.k);
  assert.deepEqual(shared, ['vendor_name', 'vendor_address', 'vendor_email', 'vendor_phone', 'sign_name', 'sign_designation', 'sign_phone']);
});

test('invCapacity', () => {
  assert.equal(KD.invCapacity('5', '1'), '5 KW');
  assert.equal(KD.invCapacity('5', ''), '5 KW');
  assert.equal(KD.invCapacity('5', '2'), '2 × 5 KW (10 KW)');
  assert.equal(KD.invCapacity('0.6', '4'), '4 × 0.6 KW (2.4 KW)');
  assert.equal(KD.invCapacity('', '2'), '');
  assert.equal(KD.invCapacity('5 kW', '1'), '5 kW');
});

test('capacity falls back to the project', () => {
  const v = KD.defaults('wcr', { customer: {}, plant: {}, project: { kw: 3 }, defaults: {}, today: '' });
  assert.equal(v.capacity, '3 KW');
});

test('joinAddr skips repeated parts', () => {
  assert.equal(KD.joinAddr({ address: 'X House, Nedumangad, Thiruvananthapuram', district: 'Thiruvananthapuram', pincode: '' }), 'X House, Nedumangad, Thiruvananthapuram');
});

test('defaults for a bare customer', () => {
  for (const key of ['wcr', 'an1']) {
    const v = KD.defaults(key, { customer: { name: 'A' }, plant: null, project: null });
    for (const x of Object.values(v)) assert.ok(!String(x).includes('undefined'));
    assert.equal(v.capacity, '');
  }
  const v = KD.defaults('wcr', { customer: { name: 'A' }, plant: null, project: null });
  assert.equal(v.inv_capacity, '');
  assert.equal(v.pv_watt, '');
  const e = KD.empty('wcr', v);
  assert.ok(e.includes('EB consumer number'));
  assert.ok(!e.includes('Ref No.'));
});

test('saving rule', () => {
  const d = KD.defaults('wcr', RAJ);
  const v = Object.assign({}, d, { cust_phone: '9999999999' });
  assert.deepEqual(KD.overrides('wcr', v, d), { cust_phone: '9999999999', date: '2026-11-10' });
  const s = KD.values('wcr', RAJ, { cust_phone: 'x', bogus: 'y' });
  assert.equal(s.cust_phone, 'x');
  assert.ok(!('bogus' in s));
});

test('ansi', () => {
  assert.equal(KD.ansi('Rs ₹5'), 'Rs Rs.5');
  assert.equal(KD.ansi('a b c'), 'a b c');
  assert.equal(KD.ansi('“q” ‘s’ – —'), '"q" \'s\' - -');
  assert.equal(KD.ansi('2 × 5'), '2 × 5');
  assert.equal(KD.ansi('മലയാളം X'), '? X');
  assert.equal(KD.ansi('😀'), '?');
  assert.equal(KD.ansi('a\nb'), 'a\nb');
});

test('dmy', () => {
  assert.equal(KD.dmy('2026-11-06'), '06-11-2026');
  assert.equal(KD.dmy(''), '');
});

/* ---- Task 3: layout and PDF writing ---- */
const fs = require('node:fs');
const path = require('node:path');
const PDFLib = require('../assets/vendor/pdf-lib-1.17.1.min.js');
const ROOT = path.join(__dirname, '..');
const RAJ_ADDR = KD.defaults('wcr', RAJ).cust_address;
/* signature ops are Helvetica below the body start; Ref/Date are Helvetica at y 185 */
const sigOps = ops => ops.filter(o => o.f === 'H' && o.y > 200);
const bodyOps = ops => ops.filter(o => o.f !== 'H');

test('wrap', () => {
  const fake = (t, f, s) => t.length * s * 0.5;
  assert.deepEqual(KD.wrap('aaa bbb ccc', 40, 'T', 10, fake), ['aaa bbb', 'ccc']);
  assert.deepEqual(KD.wrap('x'.repeat(20), 40, 'T', 10, fake), ['xxxxxxxx', 'xxxxxxxx', 'xxxx']);
  assert.deepEqual(KD.wrap('a\nb', 40, 'T', 10, fake), ['a', 'b']);
});

test('wcr layout fits the RAJ sample', async () => {
  const measure = await KD.measurer(PDFLib);
  const r = KD.layout('wcr', KD.values('wcr', RAJ, {}), measure);
  assert.equal(r.overflow, false);
  assert.ok(r.size >= 11, 'size ' + r.size);
  for (const o of r.ops) {
    assert.ok(o.x >= 60, o.t + ' x ' + o.x);
    assert.ok(o.x + measure(o.t, o.f, o.s) <= 536.5, o.t + ' right ' + (o.x + measure(o.t, o.f, o.s)));
    assert.ok(o.y > 180 && o.y <= 740, o.t + ' y ' + o.y);
  }
  assert.ok(r.ops.some(o => o.t === 'WORK COMPLETION REPORT'));
  assert.ok(r.ops.some(o => o.t === 'Name: Er Akhil ST'));
  const d = r.ops.find(o => o.t === '10-11-2026');
  assert.ok(d, 'date op');
  assert.equal(d.x, 432);
});

test('wcr shrinks long text', async () => {
  const measure = await KD.measurer(PDFLib);
  const serials = Array.from({ length: 10 }, (_, i) => 'ST3923-075063C' + (30 + i) + '-EC').join(', ');
  assert.equal(serials.split(', ')[0].length, 19);
  const v = Object.assign(KD.values('wcr', RAJ, {}), { cust_address: Array(4).fill(RAJ_ADDR).join(', '), inv_serial: serials });
  const r = KD.layout('wcr', v, measure);
  assert.equal(r.overflow, false);
  assert.ok(r.size < 12, 'size ' + r.size);
  const lastBody = Math.max(...bodyOps(r.ops).map(o => o.y));
  const sigFirst = Math.min(...sigOps(r.ops).map(o => o.y));
  assert.ok(lastBody <= sigFirst - 60 - r.size, lastBody + ' vs ' + sigFirst);
});

test('wcr overflow', async () => {
  const measure = await KD.measurer(PDFLib);
  const v = Object.assign(KD.values('wcr', RAJ, {}), { cust_address: 'word '.repeat(600) });
  assert.equal(KD.layout('wcr', v, measure).overflow, true);
});

test('an1 values stay inside their cells', async () => {
  const measure = await KD.measurer(PDFLib);
  const rows = [[155.7, 233.7], [233.7, 256.1], [256.1, 285.5], [285.5, 343.8], [343.8, 380.3], [380.3, 402]];
  const r = KD.layout('an1', KD.values('an1', RAJ, {}), measure);
  assert.equal(r.overflow, false);
  const cellOps = r.ops.filter(o => o.x > 300);
  assert.ok(cellOps.length >= 11);
  for (const o of cellOps) {
    assert.ok(o.x >= 374.5, o.t + ' x ' + o.x);
    assert.ok(o.x + measure(o.t, o.f, o.s) <= 548.8, o.t + ' right');
    assert.ok(rows.some(([a, b]) => o.y > a && o.y <= b), o.t + ' y ' + o.y);
  }
  const inRow = (o, i) => o.y > rows[i][0] && o.y <= rows[i][1];
  const roof = r.ops.find(o => o.t === 'ROOF-TOP');
  const days = r.ops.find(o => o.t === '30 DAYS');
  assert.ok(roof && roof.s === 10.5 && inRow(roof, 4), 'ROOF-TOP');
  assert.ok(days && days.s === 10.5 && inRow(days, 5), '30 DAYS');
  assert.ok(cellOps.filter(o => inRow(o, 0)).length >= 6);
  assert.ok(r.ops.some(o => o.t === 'Thiruvananthapuram' && o.x < 369.5), 'place');
  assert.ok(r.ops.some(o => o.t === '10-11-2026' && o.x < 369.5), 'date');
});

test('buildPdf writes on the template', async () => {
  const measure = await KD.measurer(PDFLib);
  const tpl = fs.readFileSync(path.join(ROOT, 'assets/kseb/annexure-1.pdf'));
  const { ops } = KD.layout('an1', KD.values('an1', RAJ, {}), measure);
  const out = await KD.buildPdf(PDFLib, tpl, ops);
  const doc = await PDFLib.PDFDocument.load(out);
  assert.equal(doc.getPageCount(), 1);
  assert.ok(Math.abs(doc.getPage(0).getWidth() - 595.32) < 0.01);
  assert.ok(out.length > tpl.length);
  const bare = await KD.buildPdf(PDFLib, tpl, []);
  assert.ok(out.length > bare.length, 'the ops add content');
});

test('buildPdf survives non-WinAnsi text', async () => {
  const measure = await KD.measurer(PDFLib);
  const tpl = fs.readFileSync(path.join(ROOT, 'assets/kseb/letterhead.pdf'));
  const v = Object.assign(KD.values('wcr', RAJ, {}), { cust_address: 'വീട് ₹ “x”   😀' });
  const { ops } = KD.layout('wcr', v, measure);
  const out = await KD.buildPdf(PDFLib, tpl, ops);
  assert.ok(out.length > tpl.length);
});

test('zero numbers count as empty', () => {
  const ctx = Object.assign({}, RAJ, { customer: Object.assign({}, RAJ.customer, { sanctioned_load: 0 }), plant: {}, project: { kw: 0 } });
  const an = KD.defaults('an1', ctx), w = KD.defaults('wcr', ctx);
  assert.equal(an.load, '');
  assert.equal(an.capacity, '');
  assert.equal(w.capacity, '');
  const miss = KD.empty('an1', an);
  assert.ok(miss.includes('Sanctioned load') || miss.some(l => /load/i.test(l)), miss.join('|'));
  assert.ok(miss.some(l => /capacity/i.test(l)), miss.join('|'));
  assert.equal(KD.invCapacity('0', '1'), '');
  assert.equal(KD.invCapacity('5', '0'), '5 KW');
  const kw = KD.defaults('an1', Object.assign({}, ctx, { project: { kw: 3 } }));
  assert.equal(kw.capacity, '3 kWp');
});

test('an1 mount follows the plant form', () => {
  const m = p => KD.defaults('an1', Object.assign({}, RAJ, { plant: Object.assign({}, RAJ.plant, p) })).mount;
  assert.equal(m({ rooftop_type: 'Ground' }), 'GROUND MOUNTED');
  assert.equal(m({ structure_type: 'Ground mount' }), 'GROUND MOUNTED');
  assert.equal(m({ rooftop_type: 'RCC' }), 'ROOF-TOP');
  assert.equal(m({}), 'ROOF-TOP');
});

const RAJ_REG = Object.assign({}, RAJ, { plant: Object.assign({}, RAJ.plant, { kseb_reg_no: 'KSEB/REG/2026/123', application_no: 'PMSG/APP/999' }) });

test('an2 and an3 defaults', () => {
  const a2 = KD.defaults('an2', RAJ);
  assert.equal(a2.name, 'RAJKUMAR M');
  assert.equal(a2.category, 'LT-1A Domestic');
  assert.equal(a2.load, '1.24 kW');
  assert.equal(a2.capacity, '5 kWp');
  assert.equal(a2.specs, 'YES');
  assert.equal(a2.meters, 'YES');
  assert.equal(a2.drawings, 'YES');
  assert.equal(a2.days, '30 DAYS');
  assert.equal(a2.place, 'Thiruvananthapuram');
  assert.equal(a2.date, '2026-11-10');
  const a3 = KD.defaults('an3', RAJ_REG);
  assert.equal(a3.reg_no, 'KSEB/REG/2026/123');
  /* the KSEB registration no. has its own field; the application no. is a different number and never stands in for it */
  assert.equal(KD.defaults('an3', Object.assign({}, RAJ, { plant: Object.assign({}, RAJ.plant, { application_no: 'PMSG/APP/999' }) })).reg_no, '');
  assert.equal(a3.capacity, '5 kWp');
  assert.equal(a3.type_test, 'YES');
  assert.equal(a3.specs, 'YES');
  assert.equal(a3.inspector, 'NOT APPLICABLE');
  assert.ok(KD.empty('an3', KD.defaults('an3', RAJ)).includes('Solar registration number'));
  for (const d of ['an2', 'an3']) {
    const keys = KD.DOCS[d].groups.flatMap(g => g.fields.map(f => f.k));
    assert.deepEqual(Object.keys(KD.defaults(d, RAJ)).sort(), keys.slice().sort(), d + ' default keys');
  }
});

test('every document has a template on disk', () => {
  for (const d of Object.keys(KD.DOCS)) {
    const P = KD.PAGES[KD.DOCS[d].page];
    assert.ok(P, d + ' page');
    assert.ok(fs.existsSync(path.join(ROOT, P.pdf)) && fs.existsSync(path.join(ROOT, P.png)), d + ' files');
  }
});

for (const [doc, ctx, rows, placeY, expect] of [
  ['an2', RAJ, [[155.7, 233.7], [233.7, 256.1], [256.1, 285.5], [285.5, 343.8], [343.8, 402.2], [402.2, 438.6], [438.6, 460.1]], 471.67,
    [['1.24 kW', 1], ['5 kWp', 2], ['30 DAYS', 6]]],
  ['an3', RAJ_REG, [[125.3, 203.3], [203.3, 225.6], [225.6, 246.3], [246.3, 348.0], [348.0, 406.4], [406.4, 464.8]], 476.35,
    [['KSEB/REG/2026/123', 1], ['5 kWp', 2], ['NOT APPLICABLE', 5]]],
]) {
  test(doc + ' values stay inside their cells', async () => {
    const measure = await KD.measurer(PDFLib);
    const r = KD.layout(doc, KD.values(doc, ctx, {}), measure);
    assert.equal(r.overflow, false);
    const cellOps = r.ops.filter(o => o.x > 300);
    for (const o of cellOps) {
      assert.ok(o.x >= 374.5 && o.x + measure(o.t, o.f, o.s) <= 548.8, o.t + ' x');
      assert.ok(rows.some(([a, b]) => o.y > a && o.y <= b), o.t + ' y ' + o.y);
    }
    const inRow = (o, i) => o.y > rows[i][0] && o.y <= rows[i][1];
    assert.ok(cellOps.filter(o => inRow(o, 0)).length >= 6, 'row 1 consumer lines');
    for (const [t, i] of expect) assert.ok(r.ops.some(o => o.t === t && inRow(o, i)), t + ' in row ' + (i + 1));
    rows.forEach((row, i) => assert.ok(cellOps.some(o => inRow(o, i)), doc + ' row ' + (i + 1) + ' has a value'));
    assert.ok(r.ops.some(o => o.t === 'Thiruvananthapuram' && o.x < 369.5 && o.y === placeY), 'place');
    assert.ok(r.ops.some(o => o.t === '10-11-2026' && o.x < 369.5 && o.y > placeY), 'date');
  });
}

const ITEMS = ['Annexure II', 'Details of installation and checklist', 'Test cum completion certificate', 'Single line drawing',
  'Panel datasheet', 'Inverter datasheet', 'BIS certificate of panel', 'BIS certificate of inverter', 'Work completion report',
  'Panel serial number certificate', 'DCR certificate', 'Energy meter calibration report', 'Annexure III', 'Warranty certificate',
  'Vendor declaration associated with the implementation of ALMM order', 'Inspection report', 'Solar agreement'];
const RAJ_CHK = Object.assign({}, RAJ, { items: ITEMS });

test('checklist sheet defaults', () => {
  const v = KD.defaults('chk', RAJ_CHK);
  assert.equal(v.name, 'RAJKUMAR M');
  assert.equal(v.consumer_no, '1145389020951');
  assert.equal(v.section, 'Udiyankulangara');
  assert.equal(v.items.split('\n').length, 17);
  assert.equal(KD.defaults('chk', RAJ).items, '');
  assert.ok(KD.empty('chk', KD.defaults('chk', RAJ)).includes('Documents (one per line)'));
});

test('checklist sheet layout', async () => {
  const measure = await KD.measurer(PDFLib);
  const r = KD.layout('chk', KD.values('chk', RAJ_CHK, {}), measure);
  assert.equal(r.overflow, false);
  assert.equal(r.size, 12);
  const title = r.ops.find(o => o.t === 'CHECKLIST FOR SUBMITTING SOLAR APPLICATION');
  assert.ok(title && title.u === 1 && title.f === 'TB', 'underlined bold title');
  assert.ok(r.ops.some(o => o.t === 'Consumer Name' && o.f === 'HB') && r.ops.some(o => o.t === 'Udiyankulangara'));
  assert.ok(r.ops.some(o => o.t === '17.') && r.ops.some(o => o.t === 'ANNEXURE II') && r.ops.some(o => o.t === 'SOLAR AGREEMENT'));
  for (const o of r.ops) {
    assert.ok(o.x >= 50 && o.x + measure(o.t, o.f, o.s) <= 545.5, o.t + ' x');
    assert.ok(o.y > 40 && o.y <= 790, o.t + ' y');
  }
  const n1 = r.ops.find(o => o.t === '1.'), n10 = r.ops.find(o => o.t === '10.');
  assert.ok(Math.abs(n1.x + measure('1.', 'T', 12) - (n10.x + measure('10.', 'T', 12))) < 0.02, 'numbers right-aligned');
  const lines = n => Array.from({ length: n }, (_, i) => 'Document ' + i).join('\n');
  const many = KD.layout('chk', { items: lines(45) }, measure);
  assert.equal(many.overflow, false);
  assert.ok(many.size < 12);
  const tooMany = KD.layout('chk', { items: lines(200) }, measure);
  assert.equal(tooMany.overflow, true);
});

test('buildPdf draws the underline', async () => {
  const measure = await KD.measurer(PDFLib);
  const tpl = fs.readFileSync(path.join(ROOT, KD.PAGES.blank.pdf));
  const r = KD.layout('chk', KD.values('chk', RAJ_CHK, {}), measure);
  const withU = await KD.buildPdf(PDFLib, tpl, r.ops);
  const noU = await KD.buildPdf(PDFLib, tpl, r.ops.map(o => Object.assign({}, o, { u: 0 })));
  assert.ok(withU.length > noU.length, 'the underline adds a line to the page');
  const doc = await PDFLib.PDFDocument.load(withU);
  assert.equal(doc.getPageCount(), 1);
});


/* ---- Details of installation & checklist (KSEB, with the request for testing the inverter): two pages ---- */
const ANIL = {
  customer: { name: 'ANIL KUMAR S', phone: '9800000002', email: '', address: 'ROSE VILLA, TEMPLE ROAD, NETTAYAM', district: 'Thiruvananthapuram', pincode: '695013',
    consumer_no: '1145000000002', kseb_section: 'Vattiyoorkavu', kseb_division: 'Thiruvananthapuram', kseb_subdivision: 'Vattiyoorkavu', tariff: 'LT-1A Domestic', phase: 'Single phase',
    sanctioned_load: 4.751, bank_name: 'SBI', bank_branch: 'Nettayam', bank_account: '••••4321', bank_holder: 'ANIL KUMAR S', bank_ifsc: 'SBIN0001234' },
  plant: { capacity: '3', panel_count: '6', panel_wattage: '550', inverter_make: 'SOLAR EDGE', inverter_capacity: '3', inverter_count: '1', system_type: 'On-grid', inverter_dc_voltage: '480',
    inverters: [{ serial: 'ST3623-00000AD00-1A' }] },
  project: null,
  defaults: RAJ.defaults,
  today: '2026-05-25',
};

test('details of installation: defaults from the profile and plant', () => {
  const v = KD.defaults('doi', ANIL);
  assert.equal(v.division, 'Thiruvananthapuram / Vattiyoorkavu');
  assert.equal(v.tariff, 'LT-1A Domestic/Single');
  assert.equal(v.load, '4.751 kW');
  assert.equal(v.address, 'ROSE VILLA, TEMPLE ROAD, NETTAYAM, Thiruvananthapuram, 695013');
  assert.equal(v.bank_name, 'SBI, Nettayam');
  assert.equal(v.bank_account, 'ANIL KUMAR S', 'a masked account number is left out');
  assert.equal(KD.defaults('doi', Object.assign({}, ANIL, { customer: Object.assign({}, ANIL.customer, { bank_account: '30112233445' }) })).bank_account, '30112233445 - ANIL KUMAR S');
  assert.equal(v.installer, 'M/S JASPER SOLAR SOLUTIONS, Jasper Building Anad Bank Junction Nedumangad Thiruvananthapuram');
  assert.equal(v.inst_email, 'info@jasper.solar');
  assert.equal(v.plant_type, 'On grid');
  assert.equal(v.capacity, '3 KW');
  assert.equal(v.panel_count, '6');
  assert.equal(v.panel_watt, '550 Wp');
  assert.equal(v.inv_serial, 'SOLAR EDGE S/N: ST3623-00000AD00-1A');
  assert.equal(v.inv_phase, 'Single Phase');
  assert.equal(v.inv_capacity, '3 KW');
  assert.equal(v.dc_voltage, '480 Vdc');
  assert.equal(v.ac_voltage, '230V, 1 Phase');
  assert.equal(v.energ, 'Not Applicable');
  assert.deepEqual([v.ov_set, v.uv_set, v.v_time, v.of_set, v.uf_set, v.f_time, v.grid_trip, v.re_delay], ['264', '192', '200ms', '50.5', '47.5', '200ms', '2 seconds', '60 seconds']);
  assert.equal(v.date, '2026-05-25');
  for (const g of KD.DOCS.doi.groups) for (const f of g.fields) assert.ok(f.k in v, 'doi.' + f.k);
  const three = KD.defaults('doi', Object.assign({}, ANIL, { customer: Object.assign({}, ANIL.customer, { phase: 'Three phase' }), plant: Object.assign({}, ANIL.plant, { system_type: 'Hybrid' }) }));
  assert.equal(three.ac_voltage, '415V, 3 Phase');
  assert.equal(three.plant_type, 'Hybrid');
});

test('details of installation: two pages inside the margins', async () => {
  const measure = await KD.measurer(PDFLib);
  const r = KD.layout('doi', KD.values('doi', ANIL, {}), measure);
  assert.equal(r.overflow, false);
  assert.ok(r.size >= 8.5, 'readable size ' + r.size);
  const text = r.ops.filter(o => !o.ln), lines = r.ops.filter(o => o.ln);
  assert.deepEqual([...new Set(r.ops.map(o => o.p))].sort(), [0, 1]);
  for (const o of text) {
    assert.ok(o.x >= 28 && o.x + measure(o.t, o.f, o.s) <= 567, o.t + ' x');
    assert.ok(o.y > 40 && o.y <= 806, o.t + ' y');
  }
  for (const o of lines) for (const n of o.ln) assert.ok(n >= 28 && n <= 806, 'line inside the page');
  const at = t => text.find(o => o.t === t);
  assert.equal(at('DETAILS OF INSTALLATION & CHECKLIST TO BE FURNISHED ALONG WITH THE REQUEST FOR TESTING SOLAR INVERTERS').p, 0);
  assert.equal(at('1145000000002').p, 0);
  assert.ok(at('1145000000002').x > 318, 'value column');
  assert.equal(at('SOLAR EDGE S/N: ST3623-00000AD00-1A').p, 0);
  assert.equal(at('264').p, 1); assert.equal(at('264').u, 1, 'settings underlined');
  assert.equal(at('Date:   25-05-2026').p, 1);
  assert.ok(at('Signature of Executive Engineer') && at('Signature of Assistant Engineer'));
  assert.ok(lines.filter(o => o.p === 0).length > 100 && lines.filter(o => o.p === 1).length > 20, 'table lines on both pages');
  const v = Object.assign(KD.values('doi', ANIL, {}), { ov_set: '' });
  assert.ok(KD.layout('doi', v, measure).ops.some(o => o.t === '________' && o.p === 1), 'an empty setting leaves a blank to fill by hand');
  const huge = Object.assign(KD.values('doi', ANIL, {}), { address: 'x '.repeat(3000) });
  assert.equal(KD.layout('doi', huge, measure).overflow, true);
});

test('details of installation: a 2-page PDF with the table', async () => {
  const measure = await KD.measurer(PDFLib);
  const tpl = fs.readFileSync(path.join(ROOT, 'assets/kseb/blank.pdf'));
  const { ops } = KD.layout('doi', KD.values('doi', ANIL, {}), measure);
  const out = await KD.buildPdf(PDFLib, tpl, ops);
  const doc = await PDFLib.PDFDocument.load(out);
  assert.equal(doc.getPageCount(), 2);
  assert.ok(Math.abs(doc.getPage(1).getWidth() - doc.getPage(0).getWidth()) < 0.01 && Math.abs(doc.getPage(1).getHeight() - doc.getPage(0).getHeight()) < 0.01, 'page 2 is A4 like page 1');
  const noLines = await KD.buildPdf(PDFLib, tpl, ops.filter(o => !o.ln));
  assert.ok(out.length > noLines.length, 'the table lines are drawn');
});


/* ---- Cover page: every project detail on one page of the letterhead ---- */
const SREE = {
  customer: { name: 'Sreelatha K', phone: '9800000001', email: 'sreelatha@example.com', address: 'Lakshmi Bhavan, TC 12/345, Anad P.O', district: 'Thiruvananthapuram', pincode: '695541',
    consumer_no: '1146500000001', kseb_section: 'Chullimanoor', kseb_division: 'Nedumangad', kseb_subdivision: 'Nedumangad', tariff: 'LT-1', phase: 'Single phase', sanctioned_load: 0.18,
    bank_name: 'STATE BANK OF INDIA', bank_account: '00000012345678', bank_holder: 'SREELATHA K', bank_ifsc: 'SBIN0000001' },
  plant: { capacity: '3', panel_make: 'Saatvik Solar Industries Private Limited', panel_type: 'Bifacial Topcon', panel_wattage: '580', panel_count: '6', inverter_make: 'Feston',
    inverters: [{ capacity: '2', serial: '2503000001' }, { capacity: '1', serial: '2503000002' }],
    panels: ['SGE0325THC0000001', 'SGE0325THC0000002', 'SGE0325THC0000003', 'SGE0325THC0000004', 'SGE0325THC0000005', 'SGE0325THC0000006'].map(serial => ({ serial })),
    cell_invoice_no: 'INV-001/25-26 Dated 17.09.2025', application_no: 'NP-KLSEB25-0000001', application_date: '2025-06-06' },
  project: null, defaults: {}, today: '2025-09-18',
};

test('cover page: defaults match the KSEB project sheet', () => {
  const v = KD.defaults('cov', SREE);
  assert.deepEqual([v.state, v.district, v.discom, v.division, v.section], ['Kerala', 'Thiruvananthapuram', 'Kerala State Electricity Board Ltd', 'Nedumangad, Nedumangad', 'Chullimanoor']);
  assert.deepEqual([v.tariff, v.load, v.bank_account], ['LT-1/Single', '0.18 KW', '00000012345678, SREELATHA K']);
  assert.deepEqual([v.capacity, v.panel_watt, v.panel_count, v.panel_total], ['3 KW', '580 Wp', '6', '3.48 KW']);
  assert.equal(v.panel_serials.split('\n').length, 6);
  assert.deepEqual([v.inv_make, v.inv_serials, v.inv_phase, v.inv_capacity], ['Feston', '2503000001, 2503000002', 'Single', '2 KW, 1 KW']);
  assert.deepEqual([v.cell_invoice, v.app_no, v.app_date], ['INV-001/25-26 Dated 17.09.2025', 'NP-KLSEB25-0000001', '06.06.2025']);
  for (const g of KD.DOCS.cov.groups) for (const f of g.fields) assert.ok(f.k in v, 'cov.' + f.k);
  const masked = KD.defaults('cov', Object.assign({}, SREE, { customer: Object.assign({}, SREE.customer, { bank_account: '••••5328' }) }));
  assert.equal(masked.bank_account, 'SREELATHA K');
});

test('cover page: one page, hairlines only (no fills, nothing thicker than 0.5 pt)', async () => {
  const measure = await KD.measurer(PDFLib);
  const v = KD.values('cov', SREE, {});
  const r = KD.layout('cov', v, measure);
  assert.equal(r.overflow, false);
  assert.ok(r.size >= 8, 'readable size ' + r.size);
  assert.equal(KD.DOCS.cov.page, 'cover');
  const text = r.ops.filter(o => o.t), lines = r.ops.filter(o => o.ln);
  for (const o of r.ops) assert.ok(!o.p, 'one page');
  assert.equal(r.ops.filter(o => o.rc).length, 0, 'no filled shapes');
  for (const o of lines) assert.ok(o.w <= 0.5, 'hairline ' + o.w);
  for (const o of text) {
    assert.ok(o.x >= 34 && o.x + measure(o.t, o.f, o.s) <= 561.6, o.t + ' x');
    assert.ok(o.y > 120 && o.y <= 728, o.t + ' y ' + o.y);
  }
  const red = o => o.c && o.c[0] > 0.8 && o.c[1] < 0.3;
  const heads = text.filter(o => o.f === 'HB' && red(o)).map(o => o.t);
  assert.deepEqual(heads, ['CONSUMER DETAILS', 'PLANT DETAILS', 'PANEL SERIAL NUMBERS', 'INVERTER DETAILS', 'APPLICATION & DOCUMENTS']);
  assert.equal(lines.filter(o => red(o) && o.w === 0.5).length, 5, 'a red hairline under each section heading');
  assert.ok(text.some(o => o.t === '6 NOS'));
  assert.ok(text.some(o => o.t === '18-09-2025' && o.x === 496 && o.y === 127), 'date on the template line');
  assert.ok(!text.some(o => o.t === 'PROJECT DETAILS'), 'the title is part of the template');
  assert.ok(text.some(o => o.t === 'SGE0325THC0000006') && text.some(o => o.t === '1146500000001' && o.f === 'HB'));
  assert.ok(!text.some(o => o.t === 'KSEB REGISTRATION NO.'), 'extra rows only when filled');
  const more = KD.layout('cov', Object.assign({}, v, { kseb_reg: 'KSEB/REG/1', ref: 'JSS/KSEB/2025/118' }), measure);
  assert.ok(more.ops.some(o => o.t === 'KSEB REGISTRATION NO.') && more.ops.some(o => o.t === '28'));
  assert.ok(more.ops.some(o => o.t === 'JSS/KSEB/2025/118' && o.x === 338 && o.y === 127), 'Ref No. on the template line');
  const many = Object.assign({}, v, { panel_count: '40', panel_serials: Array.from({ length: 40 }, (_, i) => 'SN' + (1000 + i)).join('\n') });
  const m = KD.layout('cov', many, measure);
  assert.equal(m.overflow, false, '40 panels still fit');
  assert.ok(m.ops.some(o => o.t === 'SN1039'));
  const blank = KD.layout('cov', Object.assign({}, v, { panel_serials: '' }), measure);
  assert.ok(blank.ops.some(o => o.t === '6') && !blank.ops.some(o => o.t === 'SGE0325THC0000001'), 'six numbered slots to fill by hand');
  assert.equal(blank.ops.filter(o => o.ln && o.ln[2] - o.ln[0] < 200).length, 6, 'a short write-on line in each empty slot');
});

test('cover page: PDF on the cover template (letterhead footer, hairline header)', async () => {
  const measure = await KD.measurer(PDFLib);
  const tpl = fs.readFileSync(path.join(ROOT, 'assets/kseb/cover.pdf'));
  const { ops } = KD.layout('cov', KD.values('cov', SREE, {}), measure);
  const out = await KD.buildPdf(PDFLib, tpl, ops);
  const doc = await PDFLib.PDFDocument.load(out);
  assert.equal(doc.getPageCount(), 1);
  assert.ok(Math.abs(doc.getPage(0).getWidth() - 595.92) < 0.01);
  const noLines = await KD.buildPdf(PDFLib, tpl, ops.filter(o => !o.ln));
  assert.ok(out.length > noLines.length, 'the hairlines are drawn');
});

test('inverter phase comes from the inverter, not the KSEB connection', () => {
  const ctx = (plant, phase) => Object.assign({}, SREE, { customer: Object.assign({}, SREE.customer, { phase }), plant: Object.assign({}, SREE.plant, plant) });
  /* three-phase connection, single-phase inverter */
  const mixed = ctx({ inverter_type: 'Single phase' }, 'Three phase');
  assert.equal(KD.defaults('cov', mixed).inv_phase, 'Single');
  assert.equal(KD.defaults('cov', mixed).tariff, 'LT-1/Three', 'the tariff keeps the connection');
  assert.equal(KD.defaults('doi', mixed).inv_phase, 'Single Phase');
  assert.equal(KD.defaults('doi', mixed).ac_voltage, '230V, 1 Phase');
  /* no plant-level type: an inverter's own type, then the connection */
  assert.equal(KD.defaults('cov', ctx({ inverter_type: '', inverters: [{ type: '1 Ph on-grid', serial: 'A1' }] }, 'Three phase')).inv_phase, 'Single');
  assert.equal(KD.defaults('cov', ctx({ inverter_type: 'Three phase' }, 'Single phase')).inv_phase, 'Three');
  assert.equal(KD.defaults('cov', ctx({ inverter_type: '', inverters: [] }, 'Three phase')).inv_phase, 'Three');
  assert.equal(KD.invPhase({ inverter_type: 'Hybrid' }, {}), '');
});
