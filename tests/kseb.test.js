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
