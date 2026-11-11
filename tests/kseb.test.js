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


/* ---- Bank documentation: the official Vendor Feasibility Report and the vendor–customer agreement ---- */
const LOAN = {
  customer: { name: 'Sreelatha K', consumer_no: '1146530000001', address: 'Lakshmi Bhavan, TC 12/345, Panavoor PO', district: 'Thiruvananthapuram', pincode: '695568',
    jansamarth_id: 'ANS-SOLAR-10000001-0000001', bank_account: '••••5678' },
  plant: { capacity: '3', panel_make: 'ReNew', panel_model: 'RPS2MH72BD550', panel_wattage: '550', panel_efficiency: '21.29', inverter_make: 'Solar Edge',
    inverter_capacity: '3', inverter_count: '1', application_no: 'NP-KLSEB26-10000001' },
  project: { kw: 3, cost: 220000 }, bill: { grand: 222223 },
  company: { name: 'JASPER SOLAR SOLUTIONS', address: 'Jasper Building, Anad Bank Junction, Nedumangad 695541',
    bank: { bank: 'State Bank of India', name: 'JASPER SOLAR SOLUTIONS', account: '00000012345678', ifsc: 'SBIN0000001' } },
  defaults: {}, today: '2026-11-10',
};

test('feasibility report: defaults from the profile, plant, tax bill and company bank', () => {
  const v = KD.defaults('bfr', LOAN);
  assert.deepEqual([v.discom_id, v.portal_id, v.jansamarth_id, v.state, v.oem, v.channel, v.mnre, v.status],
    ['KSEBL', 'NP-KLSEB26-10000001', 'ANS-SOLAR-10000001-0000001', 'KERALA', 'NA', 'NA', 'Yes', 'Feasible']);
  assert.deepEqual([v.epc_bank, v.epc_acname, v.epc_acno, v.epc_ifsc], ['State Bank of India', 'JASPER SOLAR SOLUTIONS', '00000012345678', 'SBIN0000001']);
  assert.deepEqual([v.cap_applied, v.cap_actual, v.cost], ['3', '3', '2,22,223/-'], 'the tax bill total, in Indian digit groups');
  assert.equal(KD.defaults('bfr', Object.assign({}, LOAN, { bill: null })).cost, '2,20,000/-', 'no tax bill: the project cost');
  for (const g of KD.DOCS.bfr.groups) for (const f of g.fields) assert.ok(f.k in v, 'bfr.' + f.k);
  assert.ok(!KD.DOCS.bfr.groups.some(g => g.fields.some(f => f.k === 'photos')), 'no photo field');
});

test('feasibility report: the official form on one plain page', async () => {
  const measure = await KD.measurer(PDFLib);
  const v = KD.values('bfr', LOAN, {});
  const r = KD.layout('bfr', v, measure);
  assert.equal(r.overflow, false);
  assert.equal(KD.DOCS.bfr.page, 'blank', 'no branding: a plain page');
  const text = r.ops.filter(o => o.t), at = t => text.find(o => o.t === t);
  for (const o of r.ops) assert.ok(!o.p && !o.img, 'one page, no pictures');
  for (const o of text) assert.ok(o.x >= 72 && o.x + measure(o.t, o.f, o.s) <= 523.5 && o.y > 60 && o.y < 800, o.t);
  assert.ok(at('Residential Roof Top Solar Installation') && at('Vendor Feasibility Report Format'));
  for (const l of ['1. Name of the Consumer:', '13. EPC Contractor Bank Details:', '14.RTS Capacity in KW Applied:', '17. Feasibility Report Status:', '19. Site Layout - Images (2-4 images to be uploaded):'])
    assert.ok(text.some(o => o.t === l || o.t === l + ' '), l);
  /* the bank account as a neat block: four labels, one colon column, the details in bold */
  const colons = text.filter(o => o.t === ':');
  assert.equal(colons.length, 4); assert.ok(colons.every(o => o.x === colons[0].x), 'colons line up');
  for (const t of ['JASPER SOLAR SOLUTIONS', '00000012345678', 'SBIN0000001']) assert.equal(at(t).f, 'HB', t + ' bold');
  assert.equal(at('Feasible').f, 'H'); assert.equal(at('Not Feasible').f, 'H');
  const blank = KD.layout('bfr', Object.assign({}, v, { jansamarth_id: '' }), measure);
  assert.ok(blank.ops.some(o => o.t === '____________________'), 'an empty value leaves a line to write on');
  const out = await KD.buildPdf(PDFLib, fs.readFileSync(path.join(ROOT, 'assets/kseb/blank.pdf')), r.ops);
  assert.equal((await PDFLib.PDFDocument.load(out)).getPageCount(), 1);
});

test('agreement: the MNRE wording filled in, below the stamp, signatures together', async () => {
  const measure = await KD.measurer(PDFLib);
  const v = KD.values('bag', LOAN, {});
  assert.deepEqual([v.capacity, v.module_make, v.module_model, v.module_wp, v.module_eff, v.inv_make, v.inv_kw, v.cost, v.pay1, v.pay2, v.pay3],
    ['3', 'ReNew', 'RPS2MH72BD550', '550', '21.29', 'Solar Edge', '3', 'Rs.2,22,223 + KSEB Charges.', '60', '30', '10']);
  const r = KD.layout('bag', v, measure), text = r.ops.filter(o => o.t);
  assert.equal(r.overflow, false);
  assert.ok(r.pages >= 5 && r.pages <= 7, r.pages + ' pages');
  /* page 1 is the Kerala e-Stamp paper: text only in its writing band, below the stamp block and above the QR footer */
  assert.ok(text.filter(o => !o.p).every(o => o.y >= 500 && o.y <= 706), 'page 1 inside the stamp paper band');
  assert.equal(text.find(o => o.t === 'Whereas').p, 1, 'Whereas starts page 2');
  const long = KD.layout('bag', Object.assign({}, v, { address: 'PICHIMANGALATHU VEEDU PICHIMANGALAM VENJARAMOODU PULLAMPARA THIRUVANANTHAPURAM KERALA 695607 NEAR THE OLD TEMPLE ROAD JUNCTION' }), measure);
  assert.equal(long.overflow, false);
  assert.ok(long.ops.filter(o => o.t && !o.p).every(o => o.y >= 500 && o.y <= 706), 'a long address still fits the band (smaller text)');
  for (const o of text) assert.ok(o.x >= 66 && o.x + measure(o.t, o.f, o.s) <= 529.5 && o.y <= 780, o.t);
  const all = text.map(o => o.t).join(' ');
  for (const t of ['executed on 10-11-2026', 'Sreelatha K having residential electricity connection with consumer number 1146530000001', 'minimum 3kWp', 'ReNew make, RPS2MH72BD550 model, 550Wp capacity each and 21.29% efficiency', 'Solar Edge make, 3 kW', 'Rs.2,22,223 + KSEB Charges.', '60% as an advance'])
    assert.ok(all.includes(t), t);
  const last = Math.max(...r.ops.map(o => o.p || 0));
  for (const t of ['(Applicant)', '(Vendor)', 'Witness', 'For JASPER SOLAR SOLUTIONS']) assert.equal((text.find(o => o.t === t) || {}).p || 0, last, t + ' on the last page');
  const empty = KD.layout('bag', Object.assign({}, v, { module_model: '' }), measure).ops.map(o => o.t || '').join(' ');
  assert.ok(empty.includes('make, __________ model'), 'an empty field prints a blank to fill by hand');
  const out = await KD.buildPdf(PDFLib, fs.readFileSync(path.join(ROOT, 'assets/kseb/blank.pdf')), r.ops);
  assert.equal((await PDFLib.PDFDocument.load(out)).getPageCount(), r.pages);
});

/* ---- KSEB Net Metering Agreement (Agreement tab): ₹200 e-Stamp paper, strike-outs, Schedule, profile fill ---- */
const NET = {
  customer: { name: 'SUMA DEVI R', consumer_no: '1146530000002', address: 'Sreekovil, Pandarakonam, Anad P O', district: 'Thiruvananthapuram', pincode: '695541',
    kseb_section: 'Chullimanoor', sanctioned_load: 3, phase: 'Single phase', tariff: 'LT-1A Domestic', local_body: 'Anad Grama Panchayath', lat: '8.63975', lng: '77.003603' },
  plant: { capacity: '3', meter_make: 'VISIONTEK', meter_serial: '17180001', meter_reading: '0.2794' },
  project: null, defaults: {}, today: '2026-11-11',
};

test('agreement: defaults from the profile and plant', () => {
  const v = KD.defaults('agr', NET);
  assert.deepEqual([v.date, v.place, v.category, v.voltage, v.load, v.capacity, v.premises, v.meter_by, v.net_meter_by, v.party2],
    ['2026-11-11', 'Anad', 'LT-1A', '240V', '3 KW', '3 KW', 'Owned', 'Consumer', 'KSEB', 'KSEB Limited'], 'solar meter the consumer\'s, net meter from KSEB');
  assert.deepEqual([v.meter_no, v.meter_make, v.meter_reading, v.gps, v.section, v.local_body], ['17180001', 'VISIONTEK', '0.2794 kWh', '8.63975,77.003603', 'Chullimanoor', 'Anad Grama Panchayath']);
  assert.equal(v.site_address, v.address);
  for (const g of KD.DOCS.agr.groups) for (const f of g.fields) assert.ok(f.k in v, 'agr.' + f.k);
  const t = KD.defaults('agr', { customer: { phase: 'Three phase', premises: 'Leased', tariff: 'Other', lat: '0', lng: '0' }, plant: { meter_by: 'kseb' }, today: '2026-11-11' });
  assert.deepEqual([t.voltage, t.premises, t.meter_by, t.net_meter_by, t.category, t.gps], ['415V', 'Leased', 'KSEB', 'KSEB', '', '']);
  assert.equal(KD.defaults('agr', { customer: {}, plant: { net_meter_by: 'consumer' } }).net_meter_by, 'Consumer');
  assert.deepEqual(KD.empty('agr', v), ['Distribution transformer & HT feeder (HT prosumer)', 'Village & survey number'], 'SPIN and wheeling are optional');
  assert.equal(KD.placeName('Thiruvananthapuram Corporation'), 'Thiruvananthapuram');
  assert.equal(KD.placeName('Nedumangad Municipality'), 'Nedumangad');
});

test('agreement: typed values for empty profile fields go to the profile', () => {
  const ctx = { customer: Object.assign({}, NET.customer, { lat: '', lng: '', sanctioned_load: 0 }), plant: { meter_make: 'VISIONTEK' } };
  const fill = KD.fill('agr', { date: '2026-11-11', transformer: 'Anad Jn TF', load: '3kw', gps: '8.6, 77.0', meter_make: 'GENUS', meter_reading: '12.5 kWh', premises: 'Leased', place: 'Anad', meter_by: '' }, ctx);
  assert.deepEqual(fill.map(f => [f.k, f.t, f.col, f.v]), [
    ['premises', 'c', 'premises', 'Leased'], ['load', 'c', 'sanctioned_load', '3'], ['meter_reading', 'p', 'meter_reading', '12.5'],
    ['transformer', 'c', 'transformer', 'Anad Jn TF'], ['gps', 'c', 'gps', '8.6,77.0']]);
  assert.deepEqual(KD.fill('agr', { gps: 'near the temple', load: 'three' }, ctx), [], 'text that is not a number / position is not stored');
  assert.deepEqual(KD.fill('agr', { gps: '8.7,77.1' }, NET), [], 'a position already in the profile is kept');
});

test('agreement: stamp paper page 1, strike-outs, Schedule table, signatures together', async () => {
  const measure = await KD.measurer(PDFLib);
  const v = KD.values('agr', NET, {});
  const r = KD.layout('agr', v, measure), text = r.ops.filter(o => o.t), all = text.map(o => o.t).join(' ');
  assert.equal(r.overflow, false);
  assert.ok(r.pages >= 4 && r.pages <= 6, r.pages + ' pages');
  assert.ok(text.filter(o => !o.p).every(o => o.y >= 500 && o.y <= 706), 'page 1 inside the e-Stamp writing band');
  assert.equal(text.find(o => /^Whereas, the consumer/.test(o.t)).p, 1, 'Whereas starts page 2');
  for (const t of ['made on this 11-11-2026 at Anad between SUMA DEVI R Consumer number 1146530000002', 'Electrical Section Chullimanoor hereinafter', 'having capacity 3 kW as per', '(SPIN) __________ as scheduled'])
    assert.ok(all.includes(t), t);
  /* the words under each strike line: the text op on that line, cut where the line starts and ends */
  const lineOf = (ops, x) => ops.find(t => t.t && (t.p || 0) === (x.p || 0) && Math.abs(x.ln[1] - (t.y - 0.27 * t.s)) < 0.02);
  const struck = ops => ops.filter(x => x.ln && x.ln[1] === x.ln[3] && x.w === 0.6 && lineOf(ops, x)).map(x => {
    const o = lineOf(ops, x);
    const at = px => { for (let i = 0; i <= o.t.length; i++) { const t = o.t.slice(0, i); if (Math.abs(o.x + measure(t, o.f, o.s) + (t.split(' ').length - 1) * (o.ws || 0) - px) < 0.02) return i; } return -1; };
    return o.t.slice(at(x.ln[0]), at(x.ln[2]));
  }).join(' | ');
  const lay = o => KD.layout('agr', Object.assign({}, v, o), measure).ops;
  /* default: owned, solar (energy) meter the consumer's, net meter from KSEB on rent */
  const dflt = struck(r.ops);
  assert.ok(/^or owned and possessed by consumer under a valid lease agreement( \| |$)/.test(dflt) || dflt.startsWith('or owned and possessed by consumer under') , dflt);
  assert.ok(dflt.includes('solar meter and') && dflt.includes('and the net meter'), 'rent "for net meter" only; consumer "provided the solar meter" only: ' + dflt);
  assert.ok(!dflt.includes('remit the rent') && !dflt.includes('And whereas the consumer has provided'), 'neither meter paragraph struck as a whole');
  assert.ok(all.includes('remit the rent for solar meter and net meter, as applicable'), 'the wording itself is unchanged');
  const leased = struck(lay({ premises: 'Leased' }));
  assert.ok(leased.replace(/ \| /g, ' ').startsWith('owned and possessed by him/her or'), leased);
  assert.ok(struck(lay({ meter_by: 'Consumer', net_meter_by: 'Consumer' })).includes('And whereas, the consumer shall remit the rent for'), 'both meters the consumer\'s: the rent paragraph');
  const both = struck(lay({ meter_by: 'KSEB', net_meter_by: 'KSEB' }));
  assert.ok(both.includes('And whereas the consumer has provided the solar meter') && !both.includes('remit'), 'both from KSEB: the consumer paragraph: ' + both);
  const rev = struck(lay({ meter_by: 'KSEB', net_meter_by: 'Consumer' }));
  assert.ok(rev.includes('and net meter') && rev.includes('the solar meter and'), rev);
  assert.equal(struck(lay({ premises: '', meter_by: '', net_meter_by: 'KSEB' })), '', 'not marked: nothing struck');
  /* the signatures: both parties and four witnesses on one page, after clause 16 */
  const last = text.find(o => o.t === '(2nd party)').p;
  for (const t of ['(1st party)', 'SUMA DEVI R', 'KSEB Limited']) assert.ok(text.some(o => o.t === t && o.p === last), t);
  assert.equal(text.filter(o => o.t === 'Witness 1' && o.p === last).length, 2);
  /* the Schedule: its own page, the table and values inside the frame */
  const sch = text.find(o => o.t === 'SCHEDULE to Solar Net Metering Agreement');
  assert.ok(sch.p > last && sch.u, 'Schedule after the signatures, underlined');
  const on = text.filter(o => o.p >= sch.p);
  for (const t of ['1146530000002/LT-1A', '240V', '17180001/VISIONTEK', '0.2794 kWh', '8.63975,77.003603', 'Anad Grama Panchayath', 'PREFERENCE 3', '1st Party', '2nd Party'])
    assert.ok(on.some(o => o.t === t), t);
  for (const o of on) assert.ok(o.x >= 56 && o.x + measure(o.t, o.f, o.s) <= 539.5 && o.y <= 780, o.t);
  for (const o of text) assert.ok(o.x >= 66 - 10 && o.x + measure(o.t, o.f, o.s) <= 539.5, o.t);
  const out = await KD.buildPdf(PDFLib, fs.readFileSync(path.join(ROOT, 'assets/kseb/blank.pdf')), r.ops);
  assert.equal((await PDFLib.PDFDocument.load(out)).getPageCount(), r.pages);
  /* a long address shrinks page 1 but stays in the band */
  const long = KD.layout('agr', Object.assign({}, v, { address: 'PICHIMANGALATHU VEEDU PICHIMANGALAM VENJARAMOODU PULLAMPARA THIRUVANANTHAPURAM KERALA 695607 NEAR THE OLD TEMPLE ROAD JUNCTION' }), measure);
  assert.equal(long.overflow, false);
  assert.ok(long.ops.filter(o => o.t && !o.p).every(o => o.y >= 500 && o.y <= 706));
});

/* the agreements are justified: every line of a paragraph but its last ends exactly at the right margin (word spacing ws) */
test('agreements: justified text', async () => {
  const measure = await KD.measurer(PDFLib);
  const width = o => o.x + measure(o.t, o.f, o.s) + (o.t.split(' ').length - 1) * (o.ws || 0);
  for (const [doc, ctx] of [['agr', NET], ['bag', LOAN]]) {
    const r = KD.layout(doc, KD.values(doc, ctx, {}), measure), text = r.ops.filter(o => o.t);
    const just = text.filter(o => o.ws);
    assert.ok(just.length > 50, doc + ': ' + just.length + ' justified lines');
    for (const o of just) assert.ok(Math.abs(width(o) - 529) < 0.05 && o.ws > 0 && o.ws <= 0.6 * o.s, doc + ' ends at the margin: ' + o.t);
    for (const o of text) assert.ok(width(o) <= 529.05, doc + ' inside the margin: ' + o.t);
    /* a paragraph's last line and the centred lines stay as they are */
    for (const t of ['as first party', 'applicable) and has requested KSEB Limited to provide connectivity to the said plant;', 'AND', 'Between'])
      for (const o of text.filter(x => x.t.endsWith(t))) assert.ok(!o.ws, doc + ' not justified: ' + o.t);
  }
  /* the PDF draws them with Tw word spacing */
  const r = KD.layout('agr', KD.values('agr', NET, {}), measure);
  const out = await KD.buildPdf(PDFLib, fs.readFileSync(path.join(ROOT, 'assets/kseb/blank.pdf')), r.ops);
  const doc = await PDFLib.PDFDocument.load(out), page = doc.getPage(1);
  const streams = [].concat(page.node.Contents() instanceof PDFLib.PDFArray ? page.node.Contents().asArray().map(x => doc.context.lookup(x)) : [page.node.Contents()]);
  const raw = streams.map(st => Buffer.from(PDFLib.decodePDFRawStream(st).decode()).toString('latin1')).join('\n');
  assert.ok(/[\d.]+ Tw/.test(raw) && /\b0 Tw/.test(raw), 'Tw set and reset');
});

/* ---- KSEB: Request letter (covering letter for registration) with the consumer no. and both phone numbers ---- */
test('request letter: defaults, one page, consumer no. and both phones', async () => {
  const ctx = { customer: { name: 'SUMA DEVI R', phone: '9800000002', consumer_no: '1146530000002', address: 'Sreekovil, Pandarakonam, Anad P O', district: 'Thiruvananthapuram', pincode: '695541', kseb_section: 'Chullimanoor' },
    plant: {}, project: null, defaults: { vendor_name: 'M/S JASPER SOLAR SOLUTIONS', vendor_phone: '0960 552 5552' }, today: '2026-11-11' };
  const v = KD.values('req', ctx, {});
  assert.deepEqual([v.section, v.name, v.consumer_no, v.phone, v.pincode, v.address, v.vendor_name, v.vendor_phone],
    ['Chullimanoor', 'SUMA DEVI R', '1146530000002', '9800000002', '695541', 'Sreekovil, Pandarakonam, Anad P O, Thiruvananthapuram', 'M/S JASPER SOLAR SOLUTIONS', '0960 552 5552']);
  assert.ok(v.body.includes('Consumer No. 1146530000002') && v.body.endsWith('Thank you for your attention and support.'));
  for (const g of KD.DOCS.req.groups) for (const f of g.fields) assert.ok(f.k in v, 'req.' + f.k);
  assert.deepEqual(KD.empty('req', v), []);
  const measure = await KD.measurer(PDFLib);
  const r = KD.layout('req', v, measure), text = r.ops.filter(o => o.t), at = t => text.find(o => o.t === t);
  assert.equal(r.overflow, false); assert.equal(r.size, 12);
  for (const o of text) assert.ok(!o.p && o.x >= 72 && o.x + measure(o.t, o.f, o.s) + (o.t.split(' ').length - 1) * (o.ws || 0) <= 523.05 && o.y <= 770, o.t);
  assert.ok(Math.abs(at('Date: 11.11.2026').x + measure('Date: 11.11.2026', 'T', 12) - 523) < 0.01, 'date at the right margin');
  for (const t of ['Chullimanoor', 'Consumer No: 1146530000002', 'Pin Code: 695541', 'SUMA DEVI R, Phone: 9800000002', 'M/S JASPER SOLAR SOLUTIONS, Phone: 0960 552 5552'])
    assert.ok(at(t), t);
  for (const t of ['From', 'Subject: Request for Registration of Solar Power Plant', 'Respected Sir,', 'Contact details:', 'Sincerely,']) assert.equal(at(t).f, 'TB', t);
  assert.ok(text.some(o => o.ws), 'the letter text is justified');
  assert.equal(at('Thank you for your attention and support.').ws, undefined, 'a last line is not');
  /* the order: To, From, Subject, text, contacts, signature */
  const ys = ['To,', 'From', 'Subject: Request for Registration of Solar Power Plant', 'Respected Sir,', 'Contact details:', 'Sincerely,'].map(t => at(t).y);
  assert.deepEqual(ys, ys.slice().sort((a, b) => a - b));
  /* an empty consumer number or phone leaves a line to write on */
  const bare = KD.layout('req', Object.assign({}, v, { consumer_no: '', phone: '' }), measure).ops.map(o => o.t || '');
  assert.ok(bare.includes('Consumer No: __________') && bare.includes('SUMA DEVI R, Phone: __________'));
  const out = await KD.buildPdf(PDFLib, fs.readFileSync(path.join(ROOT, 'assets/kseb/blank.pdf')), r.ops);
  assert.equal((await PDFLib.PDFDocument.load(out)).getPageCount(), 1);
});
