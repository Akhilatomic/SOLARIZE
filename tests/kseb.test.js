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
