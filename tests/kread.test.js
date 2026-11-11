// Read & fill parsers (assets/app31.js) on made-up papers laid out like the real ones. Run: node --test tests/kread.test.js
const test = require('node:test');
const assert = require('node:assert');
const K = require('../assets/app31.js');

const BILL = `KERALA STATE ELECTRICITY BOARD LIMITED
DEMAND CUM DISCONNECTION NOTICE
(As per Regulation 122 & 123 of Kerala Electricity Supply Code 2014)
Section [4691]-Electrical Section Kachani Phone#
0471-0000000 Customer Care 1912
Consumer#
1146910000001
Reg. Mob# 900xxxx001
Regular CC Bill KSEBL GSTIN: 32AAECK2277NBZ1
Name & Mailing Address
ARUN T
TEST HOUSE, 1/23, TEST LANE,
TESTNAGAR
For redressing complaints/grievance approach the concerned CGRF
Bill# 4691260000001 Bill Area B01/4 DTR TEST NAGAR Billing Period 12/2025[Bi-Monthly] Tariff/Phase LT-1/Single Pole# KN-7/9
Bill Date 04-12-2025 Connected Load 4300 Watts Security Deposit Rs.2907.00 Meter# L&TM45090000000001 Meter Digits 5.1`;

const ACK = `Ministry of New and Renewable Energy Rooftop Solar Division Acknowledgement for Submission of Rooftop Solar Application Sh/Smt ARUN T Date: 03-02-2026
1. Your application ... Application Reference Number NP-KLSEB26-1000001 and Applied Capacity 3.000 kWp
Sl No Particulars Details 1 Application Reference Number/ Date NP-KLSEB26-1000001 / 03-02-2026 2 Name of Applicant ARUN T 3 Mobile No. 9000000001 4 Email ID arun@example.com
5 Consumer Account Number in Discom 1146910000001 6 Category of Consumer Residential 7 Contract Demand/Sanctioned Load in Discom 4.000 kW
8 Applied Roof Top Solar Capacity (in kWp) 3.000 9 Already Installed Roof Top Solar Capacity (if any) (in kWp) -
11 Address of Premises for Installation: TEST HOUSE, 1/23, TEST LANE, TESTNAGAR - 695001, District: Thiruvananthapuram, State: KERALA, PIN Code: 695001`;

const FEAS = `Kerala State Electricity Board Approval of feasibility Sh/Smt ARUN T Date: 07-03-2026
1 Application Reference Number/ Date NP-KLSEB26-1000001 / 03-02-2026 2 Name of Applicant ARUN T 3 Mobile No. 9000000001 4 Email ID -
5 Consumer Account Number in Discom 1146910000001 7 Contract Demand/Sanctioned Load in Discom 4.000 kW 8 Applied Roof Top Solar Capacity (in kWp) 3.000
11 Address of Premises for Installation: TEST HOUSE, District: Thiruvananthapuram, State: KERALA, PIN Code: 695001
Roof Top Solar Plant Capacity Approved by Discom: 3.000 kWp Total Roof Top Solar Plant Capacity including applied capacity: 3.000 kWp Approved on : 07-03-2026 Approved by : Auto Approved`;

const TOKEN = `Your application for installation of a 3.0 kW rooftop solar system has been successfully submitted under the PM-Surya Ghar: Muft Bijli Yojana.
You are eligible for Government of India subsidy of ₹ 78,000 Upon successfull completion ...
Beneficiary Details Name: ARUN T Application No: NP-KLSEB26-1000001 Date & time of Application: 2026-02-03 16:34 E token ID: 001000001`;

const BANKFEAS = `RTS Site Feasibility Report Format for Bank A. Applicant/ Consumer Brief Details i. Name : ARUN T ii. Mobile Number : 9000000001
iii. Address of RTS Installation : TEST HOUSE, TEST LANE iv. CA number : 1146910000001 v. Discom Name : Kerala State Electricity Board vi. Sanctioned Load : 4.00 kW`;

const LOAN = `Congratulations Arun T Digital Sanction for your application : ANS-SOLAR-10000001-1000001 Date : 18 June 2026 We are pleased to inform you that we are in-principally agreeable to your eligibility for the Solar Rooftop Financing for Rs. 2,00,000 -. This will be subject to satisfactory submission and verification of various documents and other details as may be required by Test Bank of India and upon successful clearance`;

const DCR = `DCR Certificate Number : 1111-2222-3333-4444 (B2C) Revision : 00 Date : 03-Sep-2026 DCR (Domestic Content Requirement) Certificate Subsidy Scheme : PM Surya Ghar: Muft Bijli Yojana
To whomsoever it may concern To Arun T, Test House, 1/23, Test Lane, Testnagar - 695001, District: Thiruvananthapuram, State: Kerala, Pin Code: 695001 State : Kerala Pin Code : 695001 PAN : , GST Number : Application Number # NP-KLSEB26-1000001
We, Jasper Solar Solutions, ... Pin Code: 695541 Solar Cell Manufactured By : Test Cells Private LimitedAddress : Plot 1 Solar Module Manufactured By : Test Modules Private LimitedAddress : Plot 2
Invoice / E-Way Ref Date KW (Kilowatt) Quantity 39 02-Sep-2026 3.30 6 Item Description Quantity KW 10711213450550 (Wp : 550, Efficiency : 21.29, Cell Technology : Mono Perc) TM10-550 6 3.30
Panel Sr Numbers 5000000001 (550 Wp) 5000000002 (550 Wp) 5000000003 (550 Wp) 5000000004 (550 Wp) 5000000005 (550 Wp) 5000000006 (550 Wp)`;

test('kinds are recognised', () => {
  assert.deepStrictEqual([BILL, ACK, FEAS, TOKEN, BANKFEAS, LOAN, DCR].map(K.kind), ['bill', 'ack', 'feas', 'token', 'feas_bank', 'loan', 'dcr']);
  assert.strictEqual(K.kind('Some other letter about a meeting'), '');
});

test('KSEB bill', () => {
  const r = K.parse(BILL);
  assert.strictEqual(r.title, 'KSEB bill');
  assert.deepStrictEqual(r.fields, { name: 'ARUN T', address: 'TEST HOUSE, 1/23, TEST LANE, TESTNAGAR', consumer_no: '1146910000001', kseb_section: 'Kachani', tariff: 'LT-1A Domestic',
    phase: 'Single phase', sanctioned_load: '4.3', meter_no: 'L&TM45090000000001', pole_no: 'KN-7/9', transformer: 'TEST NAGAR' });
  assert.deepStrictEqual(r.warn, []);
});

test('KSEB bill: three phase, and a bill whose name is not in the text', () => {
  const r = K.parse(BILL.replace('LT-1/Single', 'LT-1/Three').replace('ARUN T\nTEST HOUSE, 1/23, TEST LANE,\nTESTNAGAR\n', ''));
  assert.strictEqual(r.fields.phase, 'Three phase');
  assert.strictEqual(r.fields.name, undefined);
  assert.match(r.warn.join(' '), /name is not in this PDF/);
});

test('MNRE acknowledgement', () => {
  const r = K.parse(ACK);
  assert.deepStrictEqual(r.fields, { name: 'ARUN T', phone: '9000000001', email: 'arun@example.com', consumer_no: '1146910000001', sanctioned_load: '4', applied_kw: '3',
    application_no: 'NP-KLSEB26-1000001', application_date: '2026-02-03', address: 'TEST HOUSE, 1/23, TEST LANE, TESTNAGAR - 695001', district: 'Thiruvananthapuram', pincode: '695001' });
});

test('KSEB feasibility: approval, no application date, "-" email skipped', () => {
  const r = K.parse(FEAS);
  assert.strictEqual(r.fields.approved_kw, '3'); assert.strictEqual(r.fields.approved_on, '2026-03-07');
  assert.strictEqual(r.fields.application_date, undefined); assert.strictEqual(r.fields.email, undefined);
  assert.strictEqual(r.fields.application_no, 'NP-KLSEB26-1000001');
});

test('e-token, bank feasibility, loan letter', () => {
  assert.deepStrictEqual(K.parse(TOKEN).fields, { etoken_id: '001000001', subsidy_amount: '78000', application_no: 'NP-KLSEB26-1000001', application_date: '2026-02-03', name: 'ARUN T' });
  assert.deepStrictEqual(K.parse(BANKFEAS).fields, { name: 'ARUN T', phone: '9000000001', consumer_no: '1146910000001', sanctioned_load: '4', address: 'TEST HOUSE, TEST LANE' });
  assert.deepStrictEqual(K.parse(LOAN).fields, { jansamarth_id: 'ANS-SOLAR-10000001-1000001', loan_amount: '200000', loan_bank: 'Test Bank of India', loan_sanctioned_on: '2026-06-18' });
  assert.strictEqual(K.parse(LOAN.replace('Digital Sanction', 'Digital approval')).fields.loan_sanctioned_on, undefined, 'an approval is not a sanction');
});

test('DCR certificate: customer, panels and serials; the vendor PIN is not taken', () => {
  const r = K.parse(DCR);
  assert.strictEqual(r.fields.name, 'Arun T'); assert.strictEqual(r.fields.pincode, '695001'); assert.strictEqual(r.fields.district, 'Thiruvananthapuram');
  assert.strictEqual(r.fields.address, 'Test House, 1/23, Test Lane, Testnagar - 695001');
  assert.deepStrictEqual([r.fields.panel_make, r.fields.cell_maker, r.fields.panel_model, r.fields.panel_wattage, r.fields.panel_efficiency, r.fields.panel_count, r.fields.capacity, r.fields.dcr_po_no, r.fields.dcr_po_date, r.fields.panel_type],
    ['Test Modules Private Limited', 'Test Cells Private Limited', 'TM10-550', '550', '21.29', '6', '3.3', '39', '2026-09-02', 'Mono Perc']);
  assert.strictEqual(r.serials.length, 6); assert.strictEqual(r.serials[5], '5000000006');
  const noPin = K.parse(DCR.replace('Pin Code: 695001 State : Kerala Pin Code : 695001', 'State : Kerala Pin Code :'));
  assert.notStrictEqual(noPin.fields.pincode, '695541', 'Jasper\'s own PIN is never the customer\'s');
});

test('older DCR layout (no comma, no cell technology) and a supplier DCR', () => {
  const old = K.parse(DCR.replace('(Wp : 550, Efficiency : 21.29, Cell Technology : Mono Perc) TM10-550', '(Wp : 550 Efficiency : 21.29) M10-PERC-BIFACIAL-550'));
  assert.strictEqual(old.fields.panel_model, 'M10-PERC-BIFACIAL-550'); assert.strictEqual(old.fields.panel_efficiency, '21.29');
  const split = K.parse(DCR.replace('TM10-550 6 3.30', 'M10 -PERC- BIFACIAL-550 6 3.30'));
  assert.strictEqual(split.fields.panel_model, 'M10-PERC-BIFACIAL-550', 'a model split into pieces by the PDF reader is joined again');
  assert.strictEqual(K.parse(DCR + ' Customer Mobile No : 9000000009').fields.phone, '9000000009');
  const sup = K.parse(DCR.replace('To Arun T, Test House', 'To Jasper Solar Solutions, Ap 6/371'));
  assert.strictEqual(sup.fields.name, undefined); assert.match(sup.warn.join(' '), /made out to Jasper Solar/);
});

test('dates and comparisons', () => {
  assert.strictEqual(K.iso('03-Sep-2026'), '2026-09-03'); assert.strictEqual(K.iso('18 June 2026'), '2026-06-18'); assert.strictEqual(K.iso('31-02-2026'), '');
  assert.ok(K.same('sanctioned_load', '4.0', '4')); assert.ok(K.same('name', 'Arun  T', 'ARUN T')); assert.ok(!K.same('consumer_no', '01146910000001', '1146910000001'));
  assert.ok(K.empty('0')); assert.ok(K.empty(' ')); assert.ok(!K.empty('4.3'));
});

test('newer KSEB bill layout (Customer Name … Tariff LT-1 Phase Single … DTR … Contract Demand)', () => {
  const NEW = `KERALA STATE ELECTRICITY BOARD LIMITED
DEMAND CUM DISCONNECTION NOTICE
(As per Regulation 122 & 123 of Kerala Electricity Supply Code 2014)   GSTIN:32AAECK2277NBZ1
Section   [4666]-Electrical Section Malayinkeezh   Phone#   0471-0000000   Customer Care   1912
Consumer#   1146660000002   Customer Name   BEENA R   Mob#   900xxxx002
Mailing Address
BEENA R
ROSE VILLA, TEST ROAD, TEST PO
Bill#   4666250000002   Bill Date   22-12-2025
Tariff   LT-1   Phase   Three
Bill Area   B04/21   Pole#   MAB-33   DTR   KUZHUMOM
Contract Demand   (Nil)   VA   Connected Load   3715 Watts   Security Deposit   Rs.2001.00
Meter#   LAN046660000000002`;
  const r = K.parse(NEW);
  assert.strictEqual(r.kind, 'bill');
  assert.deepStrictEqual(r.fields, { name: 'BEENA R', address: 'ROSE VILLA, TEST ROAD, TEST PO', consumer_no: '1146660000002', kseb_section: 'Malayinkeezh', tariff: 'LT-1A Domestic',
    phase: 'Three phase', sanctioned_load: '3.715', meter_no: 'LAN046660000000002', pole_no: 'MAB-33', transformer: 'KUZHUMOM' });
});

test('spaces the PDF reader puts round hyphens do not break numbers and models', () => {
  const sp = s => s.replace(/(\w)-(\w)/g, '$1 - $2');
  assert.strictEqual(K.parse(sp(ACK)).fields.application_no, 'NP-KLSEB26-1000001');
  assert.strictEqual(K.parse(sp(ACK)).fields.application_date, '2026-02-03');
  assert.strictEqual(K.parse(sp(LOAN)).fields.jansamarth_id, 'ANS-SOLAR-10000001-1000001');
  const d = K.parse(sp(DCR));
  assert.strictEqual(d.fields.application_no, 'NP-KLSEB26-1000001'); assert.strictEqual(d.fields.panel_model, 'TM10-550'); assert.strictEqual(d.fields.dcr_po_date, '2026-09-02');
  assert.strictEqual(K.parse(DCR.replace('TM10-550 6 3.30', 'DESERV 585WP EXT - GG (DCR) MONO BIS 1500V 6 3.30')).fields.panel_model, 'DESERV 585WP EXT-GG (DCR) MONO BIS 1500V', 'real spaces in a model name stay');
});

test('a bill address wrapped inside a word is joined again; a line ending with a comma is not', () => {
  const wrapped = BILL.replace('TEST HOUSE, 1/23, TEST LANE,\nTESTNAGAR', 'TC 74/368[1] PALLI STREET, THRIVENI JUN\nCTION, PARUTHIKUZHI');
  assert.strictEqual(K.parse(wrapped).fields.address, 'TC 74/368[1] PALLI STREET, THRIVENI JUNCTION, PARUTHIKUZHI');
  assert.strictEqual(K.parse(BILL).fields.address, 'TEST HOUSE, 1/23, TEST LANE, TESTNAGAR');
});
