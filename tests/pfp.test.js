const test = require('node:test');
const assert = require('node:assert');
const PFP = require('../assets/app28.js');

const PIPE = ['customer', 'feasibility', 'loan', 'feas_pay', 'pmsg', 'reg_pay', 'delivery', 'structure', 'electrical', 'kseb_docs', 'inspection', 'netmeter', 'subsidy', 'tax_bill', 'warranty', 'completed'];
const PHP = {
  kseb: ['name', 'consumer_no', 'kseb_section', 'kseb_subdivision', 'kseb_division', 'kseb_circle', 'tariff', 'phase', 'sanctioned_load', 'meter_no', 'transformer', 'pole_no', 'address', 'district', 'pincode', 'local_body', 'village_survey', 'premises'],
  contact: ['phone', 'alt_phone', 'email', 'aadhaar_no', 'pan_no', 'gst_no', 'lead_type', 'landmark', 'notes'],
  reg: ['application_no', 'application_date', 'applied_kw', 'etoken_id', 'approved_kw', 'approved_on', 'kseb_reg_no', 'spin', 'installed_on', 'inspected_on', 'netmeter_on', 'commissioned_on', 'subsidy_amount'],
  bank: ['bank_holder', 'bank_name', 'bank_branch', 'bank_account', 'bank_ifsc', 'jansamarth_id', 'loan_bank', 'loan_branch', 'loan_amount', 'loan_sanctioned_on', 'loan_bank_email', 'loan_mgr_name', 'loan_mgr_phone']
};
const PLANT = ['capacity', 'panel_make', 'panel_type', 'panel_wattage', 'panel_count', 'panel_model', 'panel_efficiency', 'inverter_make', 'inverter_capacity', 'inverter_dc_voltage', 'meter_make', 'meter_serial', 'meter_reading', 'cell_invoice_no'];

function ctx(o) {
  o = o || {};
  return { c: o.c || {}, p: o.p || {}, j: o.j || {}, prog: o.prog || null, pipe: PIPE, can: o.can || function () { return true; } };
}
function page(k) { return PFP.PAGES.filter(function (p) { return p.key === k; })[0]; }
function fields(k) { return page(k).sections.reduce(function (a, s) { return a.concat(s.fields); }, []); }
function keys(k) { return fields(k).map(function (f) { return f.k; }); }
function miss(pk, c) { return PFP.missing(pk, c).map(function (f) { return f.k; }); }

test('page order and papers', function () {
  assert.deepStrictEqual(PFP.PAGES.map(function (p) { return p.key; }), ['kseb', 'contact', 'reg', 'bank', 'plant']);
  assert.deepStrictEqual(page('reg').sections.map(function (s) { return s.paper; }), ['MNRE application acknowledgement & e-token', 'KSEB feasibility approval', 'KSEB registration & commissioning']);
  assert.deepStrictEqual(page('bank').sections.map(function (s) { return s.paper; }), ['Passbook (subsidy account)', 'Loan papers (Jan Samarth)']);
});

test('field keys match the server lists', function () {
  ['kseb', 'contact', 'reg', 'bank'].forEach(function (k) {
    var got = keys(k).filter(function (x) { return x !== 'gps'; }).sort();
    assert.deepStrictEqual(got, PHP[k].slice().sort(), k);
  });
  assert.deepStrictEqual(keys('plant').slice().sort(), PLANT.concat(['panel_serials', 'inverter_serials']).sort());
});

test('all eight loan keys carry perm loans and due loan', function () {
  ['jansamarth_id', 'loan_bank', 'loan_branch', 'loan_amount', 'loan_sanctioned_on', 'loan_bank_email', 'loan_mgr_name', 'loan_mgr_phone'].forEach(function (k) {
    var f = fields('bank').filter(function (x) { return x.k === k; })[0];
    assert.strictEqual(f.perm, 'loans', k);
    assert.strictEqual(f.due, 'loan', k);
  });
});

test('new customer: only page 1 needs something', function () {
  var n = PFP.counts(ctx({ c: { name: 'Test One', phone: '9000000000' } }));
  assert.ok(n.kseb >= 1);
  assert.strictEqual(n.reg, 0);
  assert.strictEqual(n.plant, 0);
  assert.strictEqual(n.bank, 0);
});

test('electrical vs kseb_docs for reg and plant', function () {
  var c = ctx({ prog: { key: 'electrical', loan: 'No' }, j: { loan: 'No' } });
  assert.ok(miss('reg', c).indexOf('application_no') >= 0);
  assert.ok(miss('plant', c).indexOf('capacity') < 0);
  c = ctx({ prog: { key: 'kseb_docs', loan: 'No' }, j: { loan: 'No' } });
  assert.ok(miss('plant', c).indexOf('capacity') >= 0);
});

test('loan keys', function () {
  var c = ctx({ prog: { key: 'kseb_docs' }, j: { loan: 'No' } });
  assert.ok(miss('bank', c).indexOf('jansamarth_id') < 0);
  c = ctx({ prog: { key: 'pmsg' }, j: { loan: 'Yes' } });
  assert.ok(miss('bank', c).indexOf('jansamarth_id') >= 0);
  c = ctx({ prog: { key: 'pmsg' }, j: { loan: 'Yes' }, can: function (p) { return p !== 'loans'; } });
  assert.ok(miss('bank', c).indexOf('jansamarth_id') < 0);
});

test('application_no from project counts', function () {
  var c = ctx({ prog: { key: 'electrical' }, j: { loan: 'No', application_no: 'A-1' } });
  assert.ok(miss('reg', c).indexOf('application_no') < 0);
});

test('unknown stage counts only pages 1 and 2', function () {
  var n = PFP.counts(ctx({ prog: { key: 'unknown' }, j: { loan: 'Yes' } }));
  assert.strictEqual(n.reg, 0);
  assert.strictEqual(n.bank, 0);
  assert.strictEqual(n.plant, 0);
  assert.ok(n.kseb >= 1);
});

test('diff skips masked and unchanged values', function () {
  var c = ctx({ c: { bank_account: '12345678' } });
  assert.deepStrictEqual(PFP.diff('bank', c, { bank_account: '••••5678', bank_ifsc: ' X ' }), { bank_ifsc: 'X' });
  c = ctx({ c: { bank_ifsc: 'X' } });
  assert.deepStrictEqual(PFP.diff('bank', c, { bank_ifsc: 'X' }), {});
});

test('gps and serials values', function () {
  assert.strictEqual(PFP.value({ k: 'gps', s: 'c' }, ctx({ c: { lat: '9.5', lng: '76.3' } })), '9.5,76.3');
  assert.strictEqual(PFP.value({ k: 'gps', s: 'c' }, ctx({ c: { lat: '0', lng: '0' } })), '');
  var f = { k: 'panel_serials', s: 'p' };
  assert.strictEqual(PFP.value(f, ctx({ p: { panel_count: '2', panels: [{ serial: 'a' }] } })), '');
  assert.strictEqual(PFP.value(f, ctx({ p: { panel_count: '2', panels: [{ serial: 'a' }, { serial: '' }] } })), '');
  assert.strictEqual(PFP.value(f, ctx({ p: { panel_count: '2', panels: [{ serial: 'a' }, { serial: 'b' }] } })), 'ok');
});

test('page icons are defined app icons', function () {
  var ICONS = 'alert award bank bell calendar card chat check chev clip clipboard clock coin copy dashboard dots download eye file folder gauge gear leave link lock mail megaphone menu note pencil phone pin plus project receipt refresh search shield sun target trash undo upload user userplus users whatsapp x'.split(' ');
  PFP.PAGES.forEach(function (p) { assert.ok(ICONS.indexOf(p.icon) >= 0, p.key + ' icon ' + p.icon); });
});

test('loan fields are customer columns', function () {
  var f = fields('bank').filter(function (x) { return x.k === 'jansamarth_id'; })[0];
  assert.strictEqual(f.s, 'c');
  var c = ctx({ c: { jansamarth_id: 'JS-1' }, p: { jansamarth_id: 'wrong' }, prog: { key: 'pmsg' }, j: { loan: 'Yes' } });
  assert.strictEqual(PFP.value(f, c), 'JS-1');
  assert.ok(miss('bank', c).indexOf('jansamarth_id') < 0);
  assert.ok(miss('bank', ctx({ prog: { key: 'pmsg' }, j: { loan: 'Yes' } })).indexOf('jansamarth_id') >= 0);
});

test('page 1 name label is the binding wording', function () {
  var f = fields('kseb').filter(function (x) { return x.k === 'name'; })[0];
  assert.strictEqual(f.l, 'Consumer name (exactly as on the KSEB bill — printed on every document)');
});

test('later flags needed-but-not-due empties', function () {
  var c = ctx({ prog: { key: 'pmsg' }, j: { loan: 'No' } });
  var f = fields('plant').filter(function (x) { return x.k === 'capacity'; })[0];
  assert.strictEqual(PFP.later(f, c), true);
  assert.strictEqual(PFP.isDue(f, c), false);
});

test('premises has a blank option and an unchanged blank premises is not in the diff', function () {
  var f = fields('kseb').filter(function (x) { return x.k === 'premises'; })[0];
  assert.deepStrictEqual(f.opts[0], ['', '']);
  var d = PFP.diff('kseb', ctx({ c: { premises: '', name: 'Test One' } }), { name: 'Test One', premises: '' });
  assert.ok(!('premises' in d));
});

test('connected load 0 counts as empty, 3 does not; a 0 meter reading is a value', function () {
  var pr = { prog: { key: 'netmeter' }, j: { loan: 'No' } };
  assert.ok(miss('kseb', ctx({ c: { sanctioned_load: 0 } })).indexOf('sanctioned_load') >= 0);
  assert.ok(miss('kseb', ctx({ c: { sanctioned_load: '0' } })).indexOf('sanctioned_load') >= 0);
  assert.ok(miss('kseb', ctx({ c: { sanctioned_load: 3 } })).indexOf('sanctioned_load') < 0);
  assert.ok(miss('plant', ctx({ prog: pr.prog, j: pr.j, p: { meter_reading: '0' } })).indexOf('meter_reading') < 0);
});

test('bank-only documents count only when the latest project has a loan', function () {
  var no = ctx({ prog: { key: 'netmeter' }, j: { loan: 'No' } }), yes = ctx({ prog: { key: 'netmeter' }, j: { loan: 'Yes' } });
  assert.ok(miss('plant', no).indexOf('panel_model') < 0);
  assert.ok(miss('plant', yes).indexOf('panel_model') >= 0);
  assert.ok(miss('plant', no).indexOf('capacity') >= 0);
  assert.ok(miss('plant', yes).indexOf('capacity') >= 0);
  var cap = fields('plant').filter(function (x) { return x.k === 'capacity'; })[0];
  assert.ok(PFP.docsFor(cap, no).indexOf('bag') < 0 && PFP.docsFor(cap, yes).indexOf('bag') >= 0);
  var early = ctx({ prog: { key: 'pmsg' }, j: { loan: 'No' } });
  var pm = fields('plant').filter(function (x) { return x.k === 'panel_model'; })[0];
  assert.strictEqual(PFP.later(pm, early), false);
});
