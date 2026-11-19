// Site survey › paper form: the pure part of assets/app46.js (what the form holds)
const test = require('node:test'), assert = require('node:assert');
const SVF = require('../assets/app46.js');
const CFG = { site: [['Survey', [['visit_date', 'Site visit date', 'date'], ['surveyed_by', 'Surveyed by']]], ['Roof', [['roof_type', 'Roof type'], ['roof_area', 'Total roof area (sq ft)', 'n']]],
  ['Electrical & access', [['monthly_bill', 'Average monthly bill (₹)', 'n'], ['cable_distance', 'Inverter → meter distance (m)', 'n']]]], opts: { roof_type: ['RCC flat', 'Tile'], system_type: ['On-grid', 'Hybrid'], orientation: ['South facing'] } };
const all = secs => secs.flatMap(s => s.fields || []);

test('clean: what the standard PDF fonts cannot print is written out or dropped', () => {
  assert.strictEqual(SVF.clean('Average monthly bill (₹)'), 'Average monthly bill (Rs.)');
  assert.strictEqual(SVF.clean('Inverter → meter – “x”… 2382 × 1138'), 'Inverter to meter - "x"... 2382 x 1138');
  assert.strictEqual(SVF.clean('വീട്  Roof\n top'), 'Roof top');
  assert.strictEqual(SVF.clean(null), ''); assert.strictEqual(SVF.clean(12), '12');
});
test('blank form: every section of the Site survey page, in its order, with nothing filled in', () => {
  const s = SVF.sections(null, CFG);
  assert.deepStrictEqual(s.map(x => x.title), ['', '1 - Site photos (tick when taken)', '2 - Products and structure', '3 - Site plan for panel arrangement', '4 - Site details: Roof', 'Electrical & access', '']);
  assert.ok(all(s).every(f => f.value === ''));
  assert.strictEqual(s[1].checks.length, 5);
  assert.deepStrictEqual(s[0].fields.map(f => f.k), ['name', 'phone', 'place', 'by', 'visit']);
});
test('the visit date and surveyor are asked once, at the top; the section title goes to the first group that has fields', () => {
  const s = SVF.sections(null, CFG), keys = all(s).map(f => f.k);
  assert.ok(!keys.includes('visit_date') && !keys.includes('surveyed_by'));
  assert.strictEqual(s.filter(x => x.title.startsWith('4 - ')).length, 1);
  assert.strictEqual(s.find(x => x.title === 'Electrical & access').sub, true);
});
test('fields with fixed choices carry them (printed as tick boxes); labels are printable', () => {
  const f = Object.fromEntries(all(SVF.sections(null, CFG)).map(x => [x.k, x]));
  assert.deepStrictEqual(f.roof_type.opts, ['RCC flat', 'Tile']); assert.deepStrictEqual(f.system_type.opts, ['On-grid', 'Hybrid']);
  assert.deepStrictEqual(f.plan_orient.opts, ['Portrait', 'Landscape', 'Mixed']); assert.deepStrictEqual(f.plan_facing.opts, ['South facing']);
  assert.strictEqual(f.monthly_bill.label, 'Average monthly bill (Rs.)'); assert.strictEqual(f.cable_distance.label, 'Inverter to meter distance (m)');
  assert.strictEqual(f.capacity.opts, undefined);
});
test('from one survey: name, place, surveyor, date and what is already entered are printed in', () => {
  const d = { target: { name: 'Demo Person', phone: '90000 00001', place: 'Demo Nagar' }, survey: { assigned_name: 'Demo Surveyor', visit_date: '2026-11-21', confirmed: 1 },
    plant: { capacity: '3', system_type: 'On-grid' }, plan: { plan_rows: '7 + 4' }, site: { roof_type: 'Tile', monthly_bill: '2400', site_remarks: 'Line one\nline two' } };
  const f = Object.fromEntries(all(SVF.sections(d, CFG)).map(x => [x.k, x.value]));
  assert.strictEqual(f.name, 'Demo Person'); assert.strictEqual(f.place, 'Demo Nagar'); assert.strictEqual(f.by, 'Demo Surveyor'); assert.strictEqual(f.visit, '21-11-2026');
  assert.strictEqual(f.capacity, '3'); assert.strictEqual(f.system_type, 'On-grid'); assert.strictEqual(f.plan_rows, '7 + 4'); assert.strictEqual(f.roof_type, 'Tile');
  assert.strictEqual(f.monthly_bill, '2400'); assert.strictEqual(f.site_remarks, 'Line one line two'); assert.strictEqual(f.confirmed, '1'); assert.strictEqual(f.panel_make, '');
});
test('file name: safe for Windows, "blank" without a survey', () => {
  assert.strictEqual(SVF.fileName(null), 'Site survey form - blank.pdf');
  assert.strictEqual(SVF.fileName({ target: { name: 'A/B: C?' } }), 'Site survey form - A-B- C-.pdf');
});
