<?php
// Quotation maker: categories, default settings and the starting catalogue / templates (wording copied from the example quotations).
// Loaded by api/lib.php (migrate) and api/quotemaker.php.

const QM_CATS = [
  ['panels', 'Solar panels'], ['inverter', 'Inverter'], ['optimiser', 'Optimisers'], ['acdb', 'ACDB box'], ['dcdb', 'DCDB box'],
  ['dccable', 'DC cables'], ['accable', 'AC cables'], ['isolator', 'Isolator switch'], ['meter', 'Energy meter'], ['parts', 'Other electrical parts'],
  ['earthing', 'Earthing'], ['la', 'Lightning arrester'], ['structure', 'Mounting structure'], ['addstr', 'Additional structure'], ['install', 'Installation'],
];
/* addstr = customer scope (QM.SCOPE in assets/app20.js): printed in its own "charged extra" box, never in the items table or the price */

/* Placeholders in {braces} (loan texts, terms) are filled in by the renderer; **two stars** around words print them bold (red in the loan title, amber in the helpline). */
const QM_DEFAULTS = [
  'company' => [
    'line1' => 'JASPER', 'line2' => 'SOLAR SOLUTIONS', 'gstin' => 'GSTIN/UIN: 32CZHPA7698N1ZR', 'name' => 'JASPER SOLAR SOLUTIONS',
    'phone' => '96055 25552', 'email' => 'info@jasper.solar',
    'lines' => [
      ['label' => 'Reg. office', 'text' => 'Jasper Building, Anad Bank Junction, Nedumangad, Thiruvananthapuram'],
      ['label' => 'Email', 'text' => 'info@jasper.solar'],
      ['label' => 'Mobile', 'text' => '96055 25552'],
      ['label' => 'Website', 'text' => 'www.jasper.solar'],
    ],
  ],
  'footer' => 'MNRE Empanelled · KSEB registered company · Class A Supervisor & Class B Contractor Works',
  'site' => 'www.jasper.solar',
  /* company signature and seal, uploaded by an admin in the quotation settings (qm-….png refs); printed only on quotations with "seal" ticked */
  'signoff' => ['sign' => '', 'seal' => ''],
  'bank' => ['bank' => 'State Bank of India', 'name' => 'JASPER SOLAR SOLUTIONS', 'account' => '44819757689', 'ifsc' => 'SBIN0064970'],
  'pill' => 'PM SURYA GHAR (PMSGY) · ON-GRID',
  'valid_days' => 5,
  'number_format' => 'JSS/PMSGY/{YYYY}/{NNNN}',
  'delivery' => [
    'Materials will be delivered within **15 to 30 days** from the date of work order.',
    'Installation will be completed within **10 to 15 days** from the date materials reach the site.',
    'Final commissioning after the necessary approvals from the Electrical Inspectorate and KSEB.',
  ],
  'pay' => [
    ['amt' => '₹1,180', 'text' => 'Feasibility payment'],
    ['amt' => '70%', 'text' => 'Before material readiness, for dispatch of major components (PV modules, inverter and mounting structure) to site'],
    ['amt' => '30%', 'text' => 'After installation'],
  ],
  'kseb' => ['feas' => 1000, 'reg_per_kw' => 1000, 'reg_gst' => 18, 'stamp' => 300, 'reg_label' => 'Registration fee (₹1,000 per kW + 18% GST, 80% refundable)', 'feas_label' => 'KSEB Ltd. feasibility charge', 'stamp_label' => 'Stamp paper'],
  'loan' => [
    'margin_pct' => 10, 'rate' => 6.0, 'months' => [60, 84, 120], 'units_per_kwp' => 1300, 'tariff' => 7, 'cap' => 200000,
    'texts' => [
      'title' => 'Easy **finance** with the SBI Surya Ghar loan',
      'sub' => 'Start with a margin payment. Let your solar savings help pay the rest.',
      'margin_label' => 'YOU PAY FIRST (MARGIN)',
      'margin_note' => 'Keeps the loan within ₹2 lakh for the {rate}% rate. The {margin_pct}% minimum is {min_margin} (see note below for the larger-loan option)',
      'loan_label' => 'SBI LOAN',
      'loan_note' => 'The highest loan for the {rate}% rate. Paid by the bank directly to Jasper Solar',
      'subsidy_label' => 'SUBSIDY INTO YOUR LOAN',
      'subsidy_note' => 'Credited to your loan account, so your loan balance falls to about {after}',
      'emi_title' => 'What your monthly EMI could look like',
      'col_period' => 'REPAYMENT PERIOD',
      'col_before' => 'EMI **BEFORE** SUBSIDY IS CREDITED',
      'col_before_sub' => 'on a loan of {loan}',
      'col_after' => 'EMI **AFTER** SUBSIDY IS CREDITED',
      'col_after_sub' => 'on about {after}',
      'col_saving' => 'YOUR MONTHLY SOLAR SAVING',
      'per_month' => 'a month',
      'saving_calc' => '{kwp} kWp × {units} units a year × ₹{tariff} per unit',
      'max_tag' => '(maximum)',
      'illustration' => 'Illustration at {rate}% a year (floating). “After” assumes the loan is re-worked on about {after} once the {subsidy} subsidy is credited (about 30 working days after commissioning); SBI confirms the exact figures. Savings are approximate. You can borrow up to 90% ({max90}) at 8.15% a year (floating) with a margin of only {margin90}, but SBI then needs a CIBIL score of 650+, PAN, income proof (₹3 lakh+ a year) and insurance of the plant.',
      'terms_title' => 'SBI loan terms',
      'terms' => [
        '**Interest:** {rate}% a year (floating) for loans up to ₹2 lakh, as shown by SBI on 15 Oct 2026',
        '**Repayment:** up to 10 years, including a 6-month moratorium',
        '**No processing fee** and **no penalty** for paying the loan early',
        '**Security:** the solar plant itself. Insurance of the plant may be asked for loans above ₹2 lakh',
        'No minimum income or CIBIL score for loans up to ₹2 lakh. A default or write-off in CIBIL is not accepted',
      ],
      'who_title' => 'Who can apply, and what to keep ready',
      'who' => [
        'Indian resident with rooftop rights, enough roof area and a valid {phase} electricity connection',
        'Age up to 65 (up to 75 with a co-borrower)',
        'An SBI savings account (you can open one)',
        'KYC documents and a copy of your electricity bill',
        'No earlier solar subsidy taken',
        'From Jasper: quotation or invoice, site feasibility report and agreement',
      ],
      'how_title' => 'How to apply',
      'steps' => [
        ['t' => 'Register', 'd' => 'On pmsuryaghar.gov.in. We help you.'],
        ['t' => 'Apply', 'd' => 'For the loan on jansamarth.in or SBI’s Surya Ghar loan page.'],
        ['t' => 'Bank pays us', 'd' => 'SBI pays Jasper directly (loan + your margin) after the site feasibility report.'],
        ['t' => 'Subsidy', 'd' => 'Comes into your loan account. Give your loan account number on the portal.'],
      ],
      'helpline' => 'SBI helpline: **1800 1234** · **1800 2100** · **1800 11 2211**',
      'footnote' => 'Loan terms are SBI’s and may change; approval is at SBI’s discretion. Source: sbi.bank.in, SBI Surya Ghar loan page (updated 19 Oct 2026).',
    ],
    /* used instead of the matching 'texts' when the loan stays under the cap (the full {loan_pct}% loan, e.g. 2 kW at ₹1,70,000) */
    'texts_small' => [
      'sub' => 'Start with a small margin. Let your solar savings help pay the rest.',
      'margin_label' => 'YOU PAY FIRST ({margin_pct}% MARGIN)',
      'margin_note' => '{margin_pct}% of the project cost of {gross}',
      'loan_label' => 'SBI LOAN ({loan_pct}%)',
      'loan_note' => 'Paid by the bank directly to Jasper Solar',
      'illustration' => 'Illustration at {rate}% a year (floating). “After” assumes the loan is re-worked on about {after} once the {subsidy} subsidy is credited (usually within about 30 working days after commissioning). SBI confirms whether the EMI or the repayment period is adjusted. Savings are approximate and depend on your site, shade, weather and KSEB tariff.',
      'terms' => [
        '**Interest:** {rate}% a year (floating) for loans up to ₹2 lakh, as shown by SBI on 15 Oct 2026',
        '**Repayment:** up to 10 years, including a 6-month moratorium',
        '**No processing fee** and **no penalty** for paying the loan early',
        '**Security:** the solar plant itself. Insurance is optional for 1 to 3 kW',
        'No minimum income or CIBIL score for loans up to ₹2 lakh. A default or write-off in CIBIL is not accepted',
      ],
      'who' => [
        'Indian resident with rooftop rights, enough roof area and a valid electricity connection',
        'Age up to 65 (up to 75 with a co-borrower)',
        'An SBI savings account (you can open one)',
        'KYC documents and a copy of your electricity bill',
        'No earlier solar subsidy taken',
        'From Jasper: quotation or invoice, site feasibility report and agreement',
      ],
    ],
  ],
  'terms' => [
    'Along with the manufacturer warranty, an Annual Maintenance Contract (AMC) is available: ₹1,000 per visit, or ₹3,600 for 1 year (4 visits).',
    'PV modules and inverters comply with IEC standards. All other accessories comply with IS standards.',
    'Capacity that can be installed is subject to the feasibility allocated by KSEBL.',
    'This offer is valid for {days} days from the date of the offer.',
    'If generator synchronisation is required, a reverse power relay must be installed; this is charged extra.',
    'AC cabling, system synchronisation and connected-load revision charges are not included and are charged extra.',
  ],
];

function qm_seed(PDO $db): void {
  if ((int)$db->query('SELECT COUNT(*) FROM qm_products')->fetchColumn() > 0) return;
  $L = fn($n) => "assets/quote/logo-$n.png";
  $pic = fn($n) => "assets/quote/pic-$n.png";
  $br = fn($label, ...$logos) => ['label' => $label, 'logos' => $logos];
  $w = fn($years, $label) => ['years' => (string)$years, 'label' => $label];

  $boxBr = $br('BOX', $L('havells'), $L('lt'), $L('vguard'));
  $spdBr = $br('SPD', $L('citel'));
  $acdbBrands = [$boxBr, $br('MCB', $L('abb')), $spdBr];
  $dcdbBrands = [$boxBr, $br('FUSE', 'text:Eaton'), $spdBr];
  $cableBrands = [$br('', $L('microtek'), $L('finolex'), $L('kei'))]; /* KEI added 2026-11-22 (older catalogues get it from qm_fix rev 1) */
  $panelW = [$w(12, 'Panels product'), $w(30, 'Panels performance')];
  $meterW = [$w(1, 'Energy meter replacement')];
  $anchor = $br('ANCHOR', $L('fischer'));
  $wifi = 'Changes the panels’ DC power into AC power for your home, and sends extra units to the grid.';
  $tsunLine = $wifi . ' Each panel is tracked on its own.';
  $tsunDet = fn($model, $kw, $inputs) => "TSUN GEN3 microinverter $model, $kw kW, $inputs inputs (one per panel), IP67, 97% peak efficiency. Max DC voltage only 60 V. Built-in Wi-Fi and Bluetooth app monitoring. 12-year warranty.";
  $deye2 = 'Deye SUN-M200G4, 2 kW, 4 MPP trackers (one per panel), IP67, 96.5% peak efficiency. Max DC voltage 60 V. Wi-Fi monitoring and rapid shutdown. 10-year warranty.';
  $strBase = 'Holds the panels firmly on your roof, tilted towards the sun.';

  /* code, cat, name, line, details, [fields] */
  $P = [
    ['pan-premier-600', 'panels', 'Solar panels', 'Make electricity from sunlight.', 'Premier NeoBlack DCR, 600+ Wp, bifacial dual-glass, TOPCon half-cut, full black, ALMM approved. Size 2382 × 1134 × 35 mm. 12-year product warranty and 30-year power guarantee.',
      ['wp' => 600, 'qty' => 4, 'is_default' => 1, 'picture' => $pic('panels'), 'warranty' => $panelW, 'brands' => [$br('', $L('premier'))]]],
    ['pan-premier-600-mnre', 'panels', 'Solar panels', 'Make electricity from sunlight.', 'Premier NeoBlack DCR, 600 Wp, bifacial dual-glass, TOPCon half-cut, full black, MNRE-certified. Size 2382 × 1134 × 35 mm. 12-year product warranty and 30-year power performance guarantee.',
      ['wp' => 600, 'qty' => 6, 'picture' => $pic('panels'), 'warranty' => $panelW, 'brands' => [$br('', $L('premier'))]]],
    ['pan-renew-550', 'panels', 'Solar panels', 'Make electricity from sunlight.', 'ReNew M10 bifacial mono PERC, 550+ Wp, 144 half-cut cells, DCR, ALMM approved. Size 2278 × 1134 × 30 mm. 12-year product warranty and 30-year power warranty.',
      ['wp' => 550, 'qty' => 4, 'picture' => $pic('panels'), 'warranty' => $panelW, 'brands' => [$br('', $L('renew'))]]],
    ['pan-renew-550-dg', 'panels', 'Solar panels', 'Make electricity from sunlight.', 'ReNew RPS2MH72BD DCR, 550 Wp, bifacial dual-glass, M10 mono PERC half-cut (144 cells), ALMM-approved. Size 2278 × 1134 × 30 mm. 12-year product warranty and 30-year power warranty.',
      ['wp' => 550, 'qty' => 10, 'picture' => $pic('panels'), 'warranty' => $panelW, 'brands' => [$br('', $L('renew'))]]],

    ['inv-tsun-2', 'inverter', 'Microinverter', $tsunLine, $tsunDet('TSOL-MS2000', 2, 4),
      ['title' => 'TSUN Microinverter', 'kw' => 2, 'qty_note' => '2 kW', 'is_default' => 1, 'picture' => $pic('inverter-micro'), 'warranty' => [$w(12, 'TSUN microinverter')], 'brands' => [$br('', $L('tsun'))]]],
    ['inv-tsun-3', 'inverter', 'Microinverter', $tsunLine, $tsunDet('TSOL-MS3000', 3, 6),
      ['title' => 'TSUN Microinverter', 'kw' => 3, 'qty_note' => '3 kW', 'picture' => $pic('inverter-micro'), 'warranty' => [$w(12, 'TSUN microinverter')], 'brands' => [$br('', $L('tsun'))]]],
    ['inv-tsun-deye-2', 'inverter', 'Microinverter', $tsunLine . ' Choose one option:', 'Option A · TSUN GEN3 TSOL-MS2000, 2 kW, 4 inputs (one per panel), IP67, 97% peak efficiency. Max DC voltage 60 V. Built-in Wi-Fi and Bluetooth app monitoring. 12-year warranty.' . "\n" . 'Option B · ' . $deye2,
      ['title' => 'Microinverter', 'kw' => 2, 'qty_note' => '2 kW, one option', 'picture' => $pic('inverter-micro'), 'warranty' => [$w('10–12', 'Microinverter TSUN 12, Deye 10')], 'brands' => [$br('', $L('tsun'), $L('deye'))]]],
    ['inv-deye-2', 'inverter', 'Microinverter', $tsunLine, $deye2,
      ['title' => 'Deye Microinverter', 'kw' => 2, 'qty_note' => '2 kW', 'picture' => $pic('inverter-micro'), 'warranty' => [$w(10, 'Deye microinverter')], 'brands' => [$br('', $L('deye'))]]],
    ['inv-deye-1', 'inverter', 'Micro inverters', 'Small inverters on the roof, one for every 2 to 4 panels. Each panel works on its own and is monitored separately, and there is no high-voltage DC in your house.',
      'Deye G4 micro inverters in a 2 kW + 2 kW + 1 kW split, one on each phase (R, Y, B): 2 × SUN-M200G4 (2 kW, 4 MPPT, 4 panels each) and 1 × SUN-M100G4 (1 kW, 2 MPPT, 2 panels). 96.5% peak efficiency, IP67 outdoor, rapid shutdown, Wi-Fi monitoring from your phone. 10-year warranty.',
      ['title' => 'Deye Micro Inverter', 'kw' => 5, 'kw_line' => 1, 'qty' => 3, 'qty_note' => '5 kW · 3-phase', 'picture' => $pic('inverter-micro'), 'warranty' => [$w(10, 'Deye micro inverters')], 'brands' => [$br('', $L('deye'))]]],
    ['inv-se-3', 'inverter', 'SolarEdge inverter', $wifi,
      'Home Wave SE3000H, 3 kW, single phase, HD-Wave, IP65 (outdoor). Arc-fault protection built in. Set up and monitored from your phone. 8-year warranty.',
      ['title' => 'SolarEdge Inverter', 'kw' => 3, 'qty_note' => '3 kW', 'needs_opt' => 1, 'picture' => $pic('inverter-solaredge'), 'warranty' => [$w(8, 'SolarEdge inverter')], 'brands' => [$br('', $L('solaredge'))]]],
    ['inv-se-5-3ph', 'inverter', 'SolarEdge inverter', 'Changes the panels’ DC power into three-phase AC power for your home, and sends extra units to the grid.',
      'SolarEdge SE5K three-phase (400 V, 3 / N / PE), 5 kW, HD-Wave technology, 98% peak efficiency, IP65 (outdoor). Fixed-voltage DC for long strings, built-in module-level monitoring, export limitation. Commissioned and monitored from your phone (SetApp). 8-year warranty.',
      ['title' => 'SolarEdge 3-Phase Inverter', 'kw' => 5, 'qty_note' => '5 kW · 3-phase', 'needs_opt' => 1, 'picture' => $pic('inverter-solaredge-3ph'), 'warranty' => [$w(8, 'SolarEdge inverter')], 'brands' => [$br('', $L('solaredge'))]]],
    ['inv-premier-3', 'inverter', 'On-grid inverter', $wifi,
      'Premier PEI 3kW, single phase, 1 MPPT, IP65 (outdoor), 96.44% efficient. Built-in zero export, anti-islanding and Type II surge protection (AC and DC). 7-year warranty (+3 years with app registration).',
      ['title' => 'String Inverter', 'kw' => 3, 'qty_note' => '3 kW', 'picture' => $pic('inverter-string'), 'warranty' => [$w(7, 'Inverter +3 yrs with app registration')], 'brands' => [$br('', $L('premier'))]]],

    ['opt-se-s', 'optimiser', 'Power optimizers', 'One on every panel, so each panel works on its own. Shade or dust on one panel does not pull down the others.',
      'SolarEdge S-Series, 99.5% efficient, waterproof (IP68), with SafeDC safety shutdown. 8-year warranty.',
      ['qty' => 6, 'is_default' => 1, 'picture' => $pic('optimiser'), 'warranty' => [$w(8, 'Power optimizers')], 'brands' => [$br('', $L('solaredge'))]]],

    ['acdb-1ph', 'acdb', 'ACDB box', 'Safety box on the AC side, between the inverter and your home.', 'ABS plastic enclosure, IP65, 1-in 1-out. Has an AC MCB and AC surge protection (SPD 40 kA).',
      ['is_default' => 1, 'picture' => $pic('acdb'), 'brands' => $acdbBrands]],
    ['acdb-3ph', 'acdb', 'ACDB box', 'Safety box on the AC side, between the inverter and your home.', 'ABS plastic enclosure, IP65, three-phase, 1-in 1-out. Has a 4-pole AC MCB and three-phase AC surge protection (SPD 40 kA).',
      ['picture' => $pic('acdb-3ph'), 'brands' => $acdbBrands]],
    ['dcdb', 'dcdb', 'DCDB box', 'Safety box on the DC side, between the panels and the inverter.', 'ABS plastic enclosure, IP65, 1-in 1-out. Has a DC fuse and DC surge protection (SPD 40 kA).',
      ['is_default' => 1, 'picture' => $pic('dcdb'), 'brands' => $dcdbBrands]],
    ['dcdb-3ph', 'dcdb', 'DCDB box', 'Safety box on the DC side, between the panels and the inverter.', 'ABS plastic enclosure, IP65, 1-in 1-out. Has a DC fuse and DC surge protection (SPD 40 kA).',
      ['picture' => $pic('dcdb-3ph'), 'brands' => $dcdbBrands]],
    ['dccable', 'dccable', 'DC cables', 'Carry power from the panels to the inverter.', 'Solar DC cable, tinned copper, 1 core × 4 sq mm. Red (+) and black (−).',
      ['qty' => 10, 'unit' => 'm + m', 'qty_note' => 'red + black', 'is_default' => 1, 'picture' => $pic('dccable'), 'brands' => $cableBrands]],
    ['accable', 'accable', 'AC cables', 'Carry power from the inverter to the meter and your home.', 'Copper AC wire, single core, 4 sq mm. Red, black and green.',
      ['qty' => 0, 'unit' => 'As required', 'qty_note' => 'measured on site', 'is_default' => 1, 'picture' => $pic('accable'), 'brands' => $cableBrands]],
    ['accable-3ph', 'accable', 'AC cables', 'Carry power from the inverter to the meter and your home.', 'Copper AC wire, single core, 4 sq mm, for three-phase supply. Red, yellow, blue (phases), black (neutral) and green (earth).',
      ['qty' => 0, 'unit' => 'As required', 'qty_note' => 'measured on site', 'picture' => $pic('accable-3ph'), 'brands' => $cableBrands]],
    ['iso-2p', 'isolator', 'Isolator switch', 'A main switch to turn the plant OFF by hand, for safety.', '32 A mechanical isolator.',
      ['is_default' => 1, 'picture' => $pic('isolator'), 'brands' => [$br('', $L('havells'), $L('vguard'))]]],
    ['iso-4p', 'isolator', 'Isolator switch', 'A main switch to turn the plant OFF by hand, for safety.', '32 A, 4-pole mechanical isolator (three-phase).',
      ['picture' => $pic('isolator'), 'brands' => [$br('', $L('havells'), $L('vguard'))]]],
    ['meter-1ph', 'meter', 'Energy meter', 'Counts the units your solar plant makes.', 'Tested solar energy meter, single phase, with meter box. 1-year replacement warranty.',
      ['is_default' => 1, 'picture' => $pic('meter'), 'warranty' => $meterW, 'brands' => [$br('', $L('visiontek'))]]],
    ['meter-3ph', 'meter', 'Energy meter', 'Counts the units your solar plant makes.', 'Tested solar energy meter, three-phase, with meter box. 1-year replacement warranty.',
      ['picture' => $pic('meter'), 'warranty' => $meterW, 'brands' => [$br('', $L('visiontek'))]]],
    ['parts', 'parts', 'Other electrical parts', 'Small parts that join, route and protect all the wiring.',
      'MC4 connectors (1000 V DC), PVC conduit pipes and fittings, saddle clamps, terminal strip, lugs, cable ties. SS304 stainless steel screws and washers that do not rust.',
      ['qty' => 0, 'unit' => 'As required', 'qty_note' => 'measured on site', 'is_default' => 1, 'picture' => $pic('parts'), 'brands' => [$br('MC4', $L('staubli'), $L('microtek'), 'text:Sibass'), $br('SCREWS', 'text:Corroshield')]]],
    ['earthing', 'earthing', 'Earthing', 'Sends electrical faults safely into the ground to protect people and equipment.',
      'Copper-bonded earth rods (14 × 1220 mm, 100 micron) in earth pits (plastic chamber 18 × 18 cm), with 5 kg earthing compound. DC and structure earthing with 16 sq mm aluminium down conductor.',
      ['qty' => 3, 'unit' => 'earth pits', 'is_default' => 1, 'picture' => $pic('earthing'), 'brands' => [$br('', $L('excelerthings'))]]],
    ['la', 'la', 'Lightning arrester', 'Protects your house and plant from lightning strikes.', 'Multi-spike lightning arrester (20 × 1000 mm) with insulated base and 50 sq mm aluminium down conductor.',
      ['is_default' => 1, 'picture' => $pic('la'), 'brands' => [$br('', $L('excelerthings'))]]],
    ['str-hdg', 'structure', 'Mounting structure', $strBase,
      'Hot-dip galvanised (HDG) steel structure, 4 to 5 ft height, for a concrete roof. Designed to IS 875 (Part 3) wind loads, with a 25-year design life. Fixed on concrete foundation blocks with Fischer chemical anchoring for a firm, leak-proof grip.',
      ['unit' => 'set', 'is_default' => 1, 'picture' => $pic('structure'), 'page' => 'assets/quote/page-stormshield.jpg', 'brands' => [$br('STEEL', $L('jsw')), $anchor]]],
    ['str-gi', 'structure', 'Mounting structure', $strBase,
      'GI (galvanised iron) structure, spot welded, for a concrete roof. Fixed on concrete foundation blocks with aluminium clamps and SS304 bolts. Chemical anchoring for a firm, leak-proof grip.',
      ['unit' => 'set', 'picture' => $pic('structure'), 'brands' => [$br('FRAME', $L('apollo')), $anchor]]],
    ['str-gi-weld', 'structure', 'Mounting structure', $strBase,
      'GI (galvanised iron) structure, spot welded, for a concrete roof. Fixed on 4 concrete blocks (30 × 30 × 30 cm) with aluminium clamps and SS304 bolts. Chemical anchoring for a firm, leak-proof grip.',
      ['unit' => 'set', 'picture' => $pic('structure'), 'brands' => [$br('FRAME', $L('apollo')), $anchor]]],
    ['str-apollo', 'structure', 'Mounting structure', $strBase,
      'Apollo GI (galvanised iron) steel structure, 330 GSM zinc coating, 4 to 5 ft height, for a concrete roof. Designed to IS 875 (Part 3) wind loads. Fixed on concrete foundation blocks with Fischer chemical anchoring for a firm, leak-proof grip.',
      ['unit' => 'set', 'picture' => $pic('structure'), 'brands' => [$br('STEEL', 'text:APL Apollo · GI 330 GSM'), $anchor]]],
    ['install', 'install', 'Installation', 'Our engineers install, test and switch on the whole plant.', 'Complete installation of the SPV power plant, with testing and commissioning.',
      ['unit' => 'plant', 'is_default' => 1, 'picture' => $pic('install'), 'brands' => [$br('', 'assets/quote/jasper-logo.png')]]],
  ];

  $labels = [
    'pan-premier-600' => 'Premier NeoBlack 600+ Wp TOPCon',
    'pan-premier-600-mnre' => 'Premier NeoBlack 600 Wp (MNRE wording)',
    'pan-renew-550' => 'ReNew 550+ Wp mono PERC',
    'pan-renew-550-dg' => 'ReNew RPS2MH72BD 550 Wp dual-glass',
    'inv-tsun-2' => 'TSUN TSOL-MS2000 2 kW',
    'inv-tsun-3' => 'TSUN TSOL-MS3000 3 kW',
    'inv-tsun-deye-2' => 'TSUN or Deye 2 kW (choice)',
    'inv-deye-2' => 'Deye SUN-M200G4 2 kW',
    'inv-deye-1' => 'Deye micro 2+2+1 kW three-phase',
    'inv-se-3' => 'SolarEdge SE3000H 3 kW',
    'inv-se-5-3ph' => 'SolarEdge SE5K 5 kW three-phase',
    'inv-premier-3' => 'Premier PEI 3 kW string',
    'opt-se-s' => 'SolarEdge S-Series optimizer',
    'acdb-1ph' => 'ACDB 1-phase',
    'acdb-3ph' => 'ACDB 3-phase',
    'dcdb' => 'DCDB 1-phase',
    'dcdb-3ph' => 'DCDB (3-phase plant)',
    'dccable' => 'DC cable 4 sq mm',
    'accable' => 'AC cable 1-phase',
    'accable-3ph' => 'AC cable 3-phase',
    'iso-2p' => 'Isolator 32 A 2-pole',
    'iso-4p' => 'Isolator 32 A 4-pole',
    'meter-1ph' => 'Energy meter 1-phase',
    'meter-3ph' => 'Energy meter 3-phase',
    'parts' => 'Other electrical parts',
    'earthing' => 'Earthing (3 pits)',
    'la' => 'Lightning arrester',
    'str-hdg' => 'HDG structure (StormShield)',
    'str-gi' => 'GI structure',
    'str-gi-weld' => 'GI spot-welded (4 blocks)',
    'str-apollo' => 'Apollo GI 330 GSM',
    'install' => 'Installation',
  ];
  $db->beginTransaction();
  $ins = $db->prepare('INSERT INTO qm_products(code,label,cat,name,line,details,title,unit,qty,qty_note,wp,kw,kw_line,needs_opt,warranty,brands,picture,page,rate,is_default,hidden,sort) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,0,?)');
  $byCode = [];
  foreach ($P as $i => [$code, $cat, $name, $line, $details, $f]) {
    $ins->execute([$code, $labels[$code], $cat, $name, $line, $details, $f['title'] ?? '', $f['unit'] ?? 'no', $f['qty'] ?? 1, $f['qty_note'] ?? '', $f['wp'] ?? 0, $f['kw'] ?? 0, $f['kw_line'] ?? 0, $f['needs_opt'] ?? 0,
      json_encode($f['warranty'] ?? [], JSON_UNESCAPED_UNICODE), json_encode($f['brands'] ?? [], JSON_UNESCAPED_UNICODE), $f['picture'] ?? '', $f['page'] ?? '', $f['is_default'] ?? 0, ($i + 1) * 10]);
    $byCode[$code] = ['id' => (int)$db->lastInsertId(), 'cat' => $cat];
  }

  /* templates: [code, qty, qty_note, over?] per line; categories come from the product */
  $item = function (array $line) use ($byCode) {
    [$code, $qty, $note] = $line; $over = $line[3] ?? [];
    return [$byCode[$code]['cat'], ['pid' => $byCode[$code]['id'], 'qty' => $qty, 'qty_note' => $note, 'over' => (object)$over]];
  };
  $tpl = function (string $name, int $price, array $lines, bool $loan = false, ?array $terms = null) use ($item) {
    $items = [];
    foreach ($lines as $ln) { [$cat, $it] = $item($ln); $items[$cat][] = $it; }
    return [$name, ['items' => $items, 'price' => $price, 'subsidy' => null, 'loan' => $loan, 'title' => '', 'project' => '', 'kseb' => null, 'pay' => null, 'terms' => $terms, 'delivery' => null]];
  };
  /* the common single-phase plant: panels + inverter (+ optimisers) + boxes, cables, meter, parts, earthing, arrester, structure, installation */
  $one = function (string $panel, int $pn, string $pnote, string $inv, string $invNote, string $str, ?int $opt = null) {
    $l = [[$panel, $pn, $pnote], [$inv, 1, $invNote]];
    if ($opt) $l[] = ['opt-se-s', $opt, ''];
    return array_merge($l, [['acdb-1ph', 1, ''], ['dcdb', 1, ''], ['dccable', 10, 'red + black'], ['accable', 0, 'measured on site'], ['iso-2p', 1, ''], ['meter-1ph', 1, ''],
      ['parts', 0, 'measured on site'], ['earthing', 3, ''], ['la', 1, ''], [$str, 1, ''], ['install', 1, '']]);
  };
  $terms5 = QM_DEFAULTS['terms'];
  $terms5[0] = 'Along with the manufacturer warranty, an Annual Maintenance Contract (AMC) is available: ₹1,500 per visit, or ₹5,500 for 1 year (4 visits).';

  $T = [
    $tpl('2 kW TSUN · Premier · HDG', 170000, $one('pan-premier-600', 4, '2.4+ kWp', 'inv-tsun-2', '2 kW', 'str-hdg')),
    $tpl('2 kW TSUN · ReNew · GI welded', 160000, $one('pan-renew-550', 4, '2.2+ kWp', 'inv-tsun-2', '2 kW', 'str-gi')),
    $tpl('2 kW TSUN · ReNew · HDG', 160000, $one('pan-renew-550', 4, '2.2+ kWp', 'inv-tsun-2', '2 kW', 'str-hdg')),
    $tpl('2 kW TSUN or Deye · ReNew · HDG', 160000, $one('pan-renew-550', 4, '2.2+ kWp', 'inv-tsun-deye-2', '2 kW, one option', 'str-hdg')),
    $tpl('2 kW TSUN or Deye · Premier · HDG', 170000, $one('pan-premier-600', 4, '2.4+ kWp', 'inv-tsun-deye-2', '2 kW, one option', 'str-hdg')),
    $tpl('2 kW TSUN or Deye · Premier · GI', 170000, $one('pan-premier-600', 4, '2.4+ kWp', 'inv-tsun-deye-2', '2 kW, one option', 'str-gi')),
    $tpl('3 kW SolarEdge · Premier · HDG', 230000, $one('pan-premier-600-mnre', 6, '3.6 kWp', 'inv-se-3', '3 kW', 'str-hdg', 6)),
    $tpl('3 kW SolarEdge · ReNew · HDG', 220000, $one('pan-renew-550', 6, '3.3+ kWp', 'inv-se-3', '3 kW', 'str-hdg', 6)),
    $tpl('3 kW String · Premier · GI', 205000, $one('pan-premier-600', 5, '3+ kWp', 'inv-premier-3', '3 kW', 'str-gi-weld')),
    $tpl('3 kW TSUN · Premier · GI welded', 225000, $one('pan-premier-600', 6, '3.6+ kWp', 'inv-tsun-3', '3 kW', 'str-gi')),
    $tpl('3 kW TSUN · Premier · HDG', 230000, $one('pan-premier-600', 6, '3.6+ kWp', 'inv-tsun-3', '3 kW', 'str-hdg')),
    $tpl('3 kW TSUN · ReNew · HDG', 220000, $one('pan-renew-550', 6, '3.3+ kWp', 'inv-tsun-3', '3 kW', 'str-hdg')),
    $tpl('5 kW Deye micro 2-2-1 · ReNew · Apollo GI', 346300, [
      ['pan-renew-550-dg', 10, '5.5 kWp'], ['inv-deye-1', 3, '5 kW · 3-phase'],
      ['acdb-3ph', 1, '', ['line' => 'Safety box on the AC side, between the micro inverters and your home.']],
      ['accable-3ph', 0, 'measured on site', ['line' => 'Carry power from the micro inverters to the meter and your home.', 'details' => 'Micro-inverter AC trunk cable on the roof, and copper AC wire, single core, 4 sq mm, for the three-phase supply. Red, yellow, blue (phases), black (neutral) and green (earth).']],
      ['iso-4p', 1, ''], ['meter-3ph', 1, ''],
      ['parts', 0, 'measured on site', ['details' => 'MC4 connectors and DC extension leads (1000 V DC), PVC conduit pipes and fittings, saddle clamps, terminal strip, lugs, cable ties. SS304 stainless steel screws and washers that do not rust.']],
      ['earthing', 3, ''], ['la', 1, ''], ['str-apollo', 1, 'for 10 panels'], ['install', 1, ''],
    ], true, $terms5),
    $tpl('5 kW SolarEdge 3-phase · ReNew · Apollo GI', 336300, [
      ['pan-renew-550-dg', 10, '5.5 kWp'], ['opt-se-s', 10, ''], ['inv-se-5-3ph', 1, '5 kW · 3-phase'], ['acdb-3ph', 1, ''], ['dcdb-3ph', 1, ''],
      ['dccable', 15, 'red + black'], ['accable-3ph', 0, 'measured on site'], ['iso-4p', 1, ''], ['meter-3ph', 1, ''], ['parts', 0, 'measured on site'],
      ['earthing', 3, ''], ['la', 1, ''], ['str-apollo', 1, 'for 10 panels'], ['install', 1, ''],
    ], true, $terms5),
  ];
  $ti = $db->prepare('INSERT INTO qm_templates(name,data,created_by) VALUES(?,?,NULL)');
  foreach ($T as [$name, $data]) $ti->execute([$name, json_encode($data, JSON_UNESCAPED_UNICODE)]);
  $db->commit();
}

/* Products added after the first seed. qm_seed() only fills an empty catalogue, so these go into every database once
   (unique code, INSERT OR IGNORE), after the last product of their category; settings qm_added_rev remembers it,
   so an admin's later edits or Hide are kept. Add a product here = add a row and bump QM_ADDED_REV. */
const QM_ADDED_REV = 8;
function qm_added(): array {
  $w = fn($years, $label) => ['years' => (string)$years, 'label' => $label];
  $panelW = [$w(12, 'Panels product'), $w(30, 'Panels performance')];
  return [
    /* Emmvee Titanium Duo datasheet (Nov 2026): E610–E635HCBG132-T, 132 half-cut G12R N-type TOPCon cells, bifacial 80 ± 5%, up to 23.51%,
       2382 × 1134 × 35 mm, 34 kg, 12 / 30-year warranty, 1% first year then 0.4% a year, 87.4% after 30 years. DCR + ALMM: owner's word. */
    ['pan-emmvee-600', 'Emmvee Titanium Duo 600+ Wp TOPCon', 'panels', 'Solar panels', 'Make electricity from sunlight.',
      'Emmvee Titanium Duo G12R DCR, 600+ Wp, N-type TOPCon bifacial glass-to-glass, 132 half-cut cells, ALMM approved. Size 2382 × 1134 × 35 mm. 12-year product warranty and 30-year power warranty (87.4% power after 30 years).',
      ['wp' => 600, 'qty' => 4, 'picture' => 'assets/quote/pic-panels.png', 'warranty' => $panelW, 'brands' => [['label' => '', 'logos' => ['assets/quote/logo-emmvee.png']]]]],
    /* Waaree Elite R Series datasheet WEL/E&PD/600-635/132/BiN-21/HC/03 (16.10.2024): BiN-21-600 to 635, framed dual-glass bifacial, 132 half-cut
       G12R N-type TOPCon cells, 22.21–23.51%, bifacial 80 ± 10%, 2382 × 1134 × 35 mm, 33.8 kg, 12 / 30-year warranty, 87.4% after 30 years.
       Rev 2. DCR + ALMM and "600+" follow the owner's choice for the Emmvee panel ("also add this"). */
    ['pan-waaree-600', 'Waaree Elite R 600+ Wp TOPCon', 'panels', 'Solar panels', 'Make electricity from sunlight.',
      'Waaree Elite R Series BiN-21 DCR, 600+ Wp, N-type TOPCon bifacial dual-glass, 132 half-cut cells, ALMM approved. Size 2382 × 1134 × 35 mm. 12-year product warranty and 30-year power warranty (87.4% power after 30 years).',
      ['wp' => 600, 'qty' => 4, 'picture' => 'assets/quote/pic-panels.png', 'warranty' => $panelW, 'brands' => [['label' => '', 'logos' => ['assets/quote/logo-waaree.png']]]]],
    /* Rev 3: SolarEdge Home Wave three-phase for India, SE8K / SE10K datasheet DS-000184-IND (22 Jul 2025; the SE5K is already in the seed as
       inv-se-5-3ph): 400 / 230 V, 3 / N / PE, 98% max (97.6% EU) efficiency, max DC 12 / 15 kW, 900 V max, 750 V nominal, 13 / 16 A per phase,
       integrated arc-fault protection, IP65 outdoor and indoor, 540 × 315 × 191 mm, 16.4 kg, 8-year warranty. Worded like the SE5K item. */
    ...array_map(fn($k) => ["inv-se-$k-3ph", "SolarEdge SE{$k}K $k kW three-phase", 'inverter', 'SolarEdge inverter',
      'Changes the panels’ DC power into three-phase AC power for your home, and sends extra units to the grid.',
      "SolarEdge SE{$k}K three-phase (400 V, 3 / N / PE), $k kW, Home Wave, 98% peak efficiency, IP65 (outdoor and indoor). Fixed-voltage DC for long strings, built-in module-level monitoring, export limitation and arc-fault protection. Commissioned and monitored from your phone (SetApp). 8-year warranty.",
      ['title' => 'SolarEdge 3-Phase Inverter', 'kw' => $k, 'qty_note' => "$k kW · 3-phase", 'needs_opt' => 1, 'picture' => 'assets/quote/pic-inverter-solaredge-3ph.png',
        'warranty' => [$w(8, 'SolarEdge inverter')], 'brands' => [['label' => '', 'logos' => ['assets/quote/logo-solaredge.png']]]]], [8, 10]),
    /* Rev 4: Havells Enviro GTi single-phase string inverters, brochure "Solar GTi Inverter 1 kW-350 kW NG Series" ZHLLE00187 (2026), page 8:
       L/N/PE 230 V, 1 MPPT, 1 DC input, 550 V max DC, 50–550 V MPPT, 20 A, IP65, transformerless, 10-year warranty, BIS (IS 16169 / 16221 / 17980).
       3KTL-G4: 3000 W, 97.50% max (97.00% EU), DC switch optional, LED + app, built-in Wi-Fi. 5KTL-G3: 5000 W, at least 97.2% max (96.8% EU),
       DC switch built in, 1.5 times DC overloading (page 4), Bluetooth + app, RS485 / Wi-Fi. Page 4: zero export built in, BIS + BEE certified.
       The brochure has no 3 kW or 5 kW three-phase model, so the owner chose the smallest three-phase one, Enviro GTi 6000 TX-NG (page 10):
       6000 W / 6600 VA, 3 / N / PE 230 / 400 V, 2 MPPT (15 A / 15 A), 1100 V max DC, 140–1000 V MPPT, 9000 Wp recommended PV, 98.40% max
       (97.50% EU), DC switch, Type II SPD PV + AC, anti reverse power, string fault monitoring, RS485 / USB / Bluetooth (Wi-Fi / GPRS optional),
       IP65, LCD, 17 kg, 430 × 385 × 82 mm, 10-year warranty. Page 4: BIS, BEE and IEC certified, 1.5 times DC overloading per MPPT. */
    ['inv-havells-3', 'Havells Enviro GTi 3KTL-G4 3 kW', 'inverter', 'On-grid inverter',
      'Changes the panels’ DC power into AC power for your home, and sends extra units to the grid.',
      'Havells Enviro GTi 3KTL-G4, 3 kW, single phase, 1 MPPT, IP65 (outdoor), 97.5% peak efficiency. Built-in zero export, anti-islanding, leakage-current and ground-fault protection. Built-in Wi-Fi, monitored from your phone. BIS and BEE certified. 10-year warranty.',
      ['title' => 'Havells Inverter', 'kw' => 3, 'qty_note' => '3 kW', 'picture' => 'assets/quote/pic-inverter-string.png',
        'warranty' => [$w(10, 'Havells inverter')], 'brands' => [['label' => '', 'logos' => ['assets/quote/logo-havells.png']]]]],
    ['inv-havells-5', 'Havells Enviro GTi 5KTL-G3 5 kW', 'inverter', 'On-grid inverter',
      'Changes the panels’ DC power into AC power for your home, and sends extra units to the grid.',
      'Havells Enviro GTi 5KTL-G3, 5 kW, single phase, 1 MPPT, IP65 (outdoor), at least 97.2% peak efficiency. Built-in zero export and DC switch, anti-islanding, leakage-current and ground-fault protection. Takes up to 1.5 times DC overloading. Wi-Fi and Bluetooth, monitored from your phone. BIS and BEE certified. 10-year warranty.',
      ['title' => 'Havells Inverter', 'kw' => 5, 'qty_note' => '5 kW', 'picture' => 'assets/quote/pic-inverter-string.png',
        'warranty' => [$w(10, 'Havells inverter')], 'brands' => [['label' => '', 'logos' => ['assets/quote/logo-havells.png']]]]],
    ['inv-havells-6-3ph', 'Havells Enviro GTi 6000 TX-NG 6 kW three-phase', 'inverter', 'On-grid inverter',
      'Changes the panels’ DC power into three-phase AC power for your home, and sends extra units to the grid.',
      'Havells Enviro GTi 6000 TX-NG three-phase (400 V, 3 / N / PE), 6 kW, 2 MPPT, IP65 (outdoor), 98.4% peak efficiency. Built-in DC switch and Type II surge protection (DC and AC), anti-islanding, leakage-current and ground-fault protection, string monitoring and export control. Takes up to 1.5 times DC overloading. Bluetooth app; Wi-Fi logger optional. BIS and BEE certified. 10-year warranty.',
      ['title' => 'Havells 3-Phase Inverter', 'kw' => 6, 'qty_note' => '6 kW · 3-phase', 'picture' => 'assets/quote/pic-inverter-string.png',
        'warranty' => [$w(10, 'Havells inverter')], 'brands' => [['label' => '', 'logos' => ['assets/quote/logo-havells.png']]]]],
    /* Rev 5: Havells Solar PV Module GS12R-T132-GF (600–620 Wp) datasheet, made by Goldi Solar: bifacial N-type TOPCon double glass, 132 cells
       (210 × 182.2 mm), 22.21–22.95%, bifacial 80 ± 5%, 2382 × 1134 × 30 mm, ~33.7 kg, 1500 V, 12 / 30-year warranty, 1% first year then 0.4%
       a year, 87.4% after 30 years. "ALMM under the name of Goldi Solar"; DCR is not in the datasheet — "600+" and DCR + ALMM follow the owner's
       choice for the Emmvee / Waaree panels (asked "also add this panel … 600+wp"). */
    ['pan-havells-600', 'Havells GS12R-T132-GF 600+ Wp TOPCon', 'panels', 'Solar panels', 'Make electricity from sunlight.',
      'Havells GS12R-T132-GF DCR, 600+ Wp, N-type TOPCon bifacial dual-glass, 132 cells, up to 22.95% efficient, ALMM approved. Size 2382 × 1134 × 30 mm. 12-year product warranty and 30-year power warranty (87.4% power after 30 years).',
      ['wp' => 600, 'qty' => 4, 'picture' => 'assets/quote/pic-panels.png', 'warranty' => $panelW, 'brands' => [['label' => '', 'logos' => ['assets/quote/logo-havells.png']]]]],
    /* Rev 6 (owner: "add these products", folder TS, Nov 2026). Premier Energies datasheets:
       - "132 Half Cut TOPCon cell, bifacial dual glass G12R 600-630 W" (PE-132-xxx THGB-G12R, silver frame; the full-black NeoBlack DCR version
         of the same datasheet family is the seeded pan-premier-600): N-type TOPCon 16BB, 132 (66×2) cells 210 × 182.2 mm, 22.21–23.32%,
         2382 × 1134 × 35 mm, 33.5 kg, < 1.0% first year then < 0.40% a year (= 87.4% after 30 years), 12 / 30-year warranty.
       - "144 Half Cut TOPCon cell, bifacial dual glass 560-590 W" (PE TDG560–590, M10 182 mm): 21.66–22.83%, 2278 × 1134 × 35 mm, 34 kg,
         < 1.0% then < 0.40% a year, 12 / 30-year warranty.
       - "144 Half Cut Mono PERC, bifacial transparent backsheet 525-555 W, DCR / non-DCR" (PE 525HB–555HB, M10): 20.32–21.48%,
         2278 × 1134 × 35 mm, 34 kg, < 2.0% then < 0.45% a year, 12 / 30-year warranty.
       Wattage = the lowest of the range with "+", and DCR + ALMM, as chosen for the Emmvee / Waaree / Havells panels (the TOPCon
       datasheets do not say DCR or ALMM; the PERC one is sold as DCR and non-DCR). */
    ['pan-premier-132-600', 'Premier TOPCon 600+ Wp (132 half-cut)', 'panels', 'Solar panels', 'Make electricity from sunlight.',
      'Premier 132 half-cut TOPCon DCR, 600+ Wp, N-type bifacial dual-glass, G12R cells, up to 23.32% efficient, ALMM approved. Size 2382 × 1134 × 35 mm. 12-year product warranty and 30-year power warranty (87.4% power after 30 years).',
      ['wp' => 600, 'qty' => 4, 'picture' => 'assets/quote/pic-panels.png', 'warranty' => $panelW, 'brands' => [['label' => '', 'logos' => ['assets/quote/logo-premier.png']]]]],
    ['pan-premier-144-560', 'Premier TOPCon 560+ Wp (144 half-cut)', 'panels', 'Solar panels', 'Make electricity from sunlight.',
      'Premier 144 half-cut TOPCon DCR, 560+ Wp, bifacial dual-glass, M10 cells, up to 22.83% efficient, ALMM approved. Size 2278 × 1134 × 35 mm. 12-year product warranty and 30-year power warranty (87.4% power after 30 years).',
      ['wp' => 560, 'qty' => 4, 'picture' => 'assets/quote/pic-panels.png', 'warranty' => $panelW, 'brands' => [['label' => '', 'logos' => ['assets/quote/logo-premier.png']]]]],
    ['pan-premier-144-525', 'Premier Mono PERC 525+ Wp (144 half-cut)', 'panels', 'Solar panels', 'Make electricity from sunlight.',
      'Premier 144 half-cut mono PERC DCR, 525+ Wp, bifacial with a transparent backsheet, M10 cells, up to 21.48% efficient, ALMM approved. Size 2278 × 1134 × 35 mm. 12-year product warranty and 30-year power warranty.',
      ['wp' => 525, 'qty' => 4, 'picture' => 'assets/quote/pic-panels.png', 'warranty' => $panelW, 'brands' => [['label' => '', 'logos' => ['assets/quote/logo-premier.png']]]]],
    /* Sungrow single-phase string inverters for India: SG3.0RS-L datasheet V12 (2023-06-16) and SG4.0/5.0/6.0RS-L V13 (2023-06-17):
       L/N/PE 220/240 V, 600 V max DC, 40–560 V MPPT, 3.0 = 1 MPPT 97.8 % max, 4.0/5.0/6.0 = 2 MPPT 97.9 % max, built-in Type II DC + AC SPD,
       DC switch, leakage current protection, PID Zero, IP65 indoor/outdoor, WLAN + iSolarCloud, BIS (IS 16169 / 16221).
       The datasheets give no warranty period, so none is printed (the admin can add it in the product). Logo cut from the datasheet. */
    ...array_map(fn($k) => ["inv-sungrow-$k", "Sungrow SG$k.0RS-L $k kW", 'inverter', 'On-grid inverter',
      'Changes the panels’ DC power into AC power for your home, and sends extra units to the grid.',
      "Sungrow SG$k.0RS-L, $k kW, single phase, " . ($k === 3 ? '1 MPPT' : '2 MPPT') . ', IP65 (indoor and outdoor), ' . ($k === 3 ? '97.8' : '97.9') . '% peak efficiency. Built-in Type II surge protection (DC and AC), DC switch, leakage-current protection and PID Zero. Wi-Fi, monitored from your phone (iSolarCloud). BIS certified.',
      ['title' => 'Sungrow Inverter', 'kw' => $k, 'qty_note' => "$k kW", 'picture' => 'assets/quote/pic-inverter-string.png',
        'brands' => [['label' => '', 'logos' => ['assets/quote/logo-sungrow.png']]]]], [3, 4, 5, 6]),
    /* Rev 7 (owner, 2026-11-25): "Additional structure" for a sheet roof: walkway / ladder / sliding door, customer scope, charged extra.
       No rate, picture or warranty: the quotation lists them in the customer-scope box without an amount (owner chose "No amount"). */
    /* Rev 8 (owner, 2026-11-25: "yes, add it"): the elevated GI structure for a sheet roof. First a customer-scope line; then (owner, 2026-11-25:
       "structure is included - only additional works are customer scope - ladder / walkway / sliding door") our supply, under Mounting
       structure (qm_fix rev 5 moves it on older catalogues).
       GI that is not hot-dip galvanised is not among the MMS materials MNRE allows (OM No. 318/61/2025-GCRT-Part(2), 19.05.2026), as the sheet-roof page says. */
    ['as-elev-gi', 'Elevated GI structure (sheet roof)', 'structure', 'Elevated GI structure', 'A GI frame that holds the panels about 1 m above the roof sheets.',
      'GI (galvanised iron, not hot-dip galvanised) frame on legs fixed to the roof purlins, about 1 m above the sheets. Not among the module mounting structure materials recommended by MNRE. Size as per site.',
      ['unit' => 'set', 'qty' => 1, 'picture' => 'assets/quote/pic-elevated.png', 'page' => 'assets/quote/page-sheetroof.jpg']],
    ['as-walkway', 'Walkway (sheet roof)', 'addstr', 'Walkway', 'A safe path on the sheet roof, so the panels can be reached and cleaned without stepping on the sheets.',
      'GI walkway along the panel rows, fixed to the roof purlins. Length as per site.', ['unit' => 'As required', 'qty' => 0, 'picture' => 'assets/quote/pic-walkway.png', 'page' => 'assets/quote/page-sheetroof.jpg']],
    ['as-ladder', 'Ladder (sheet roof)', 'addstr', 'Ladder', 'A fixed ladder to climb safely onto the sheet roof for cleaning and service.',
      'GI fixed ladder up to the roof. Height as per site.', ['unit' => 'no', 'qty' => 1, 'picture' => 'assets/quote/pic-ladder.png', 'page' => 'assets/quote/page-sheetroof.jpg']],
    ['as-door', 'Sliding door (sheet roof)', 'addstr', 'Sliding door', 'A sliding opening in the roof sheets, to get onto the roof for cleaning and service.',
      'GI-framed sliding door in the roof sheets. Size as per site.', ['unit' => 'no', 'qty' => 1, 'picture' => 'assets/quote/pic-door.png', 'page' => 'assets/quote/page-sheetroof.jpg']],
  ];
}
function qm_add_new(PDO $db): void {
  $r = $db->query("SELECT v FROM settings WHERE k='qm_added_rev'")->fetchColumn();
  if ($r !== false && (int)json_decode((string)$r, true) >= QM_ADDED_REV) return;
  $db->beginTransaction();
  try {
    $ins = $db->prepare('INSERT OR IGNORE INTO qm_products(code,label,cat,name,line,details,title,unit,qty,qty_note,wp,kw,kw_line,needs_opt,warranty,brands,picture,page,rate,is_default,hidden,sort) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,0,?)');
    $last = $db->prepare('SELECT COALESCE(MAX(sort),0) FROM qm_products WHERE cat=?');
    foreach (qm_added() as [$code, $label, $cat, $name, $line, $details, $f]) {
      $last->execute([$cat]); $sort = (int)$last->fetchColumn() + 1;
      $ins->execute([$code, $label, $cat, $name, $line, $details, $f['title'] ?? '', $f['unit'] ?? 'no', $f['qty'] ?? 1, $f['qty_note'] ?? '', $f['wp'] ?? 0, $f['kw'] ?? 0, $f['kw_line'] ?? 0, $f['needs_opt'] ?? 0,
        json_encode($f['warranty'] ?? [], JSON_UNESCAPED_UNICODE), json_encode($f['brands'] ?? [], JSON_UNESCAPED_UNICODE), $f['picture'] ?? '', $f['page'] ?? '', $sort]);
    }
    $db->prepare('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v')->execute(['qm_added_rev', json_encode(QM_ADDED_REV)]);
    $db->commit();
  } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
}

/* Changes to products that are ALREADY in a catalogue (qm_added() only inserts new ones). Runs from qm boot; each rev runs once per
   database (settings qm_fix_rev) and only adds what is missing, so an admin's own edits stay. Add a fix = a new `if ($have < N)`
   block and bump QM_FIX_REV. Saved quotations keep printing what they were saved with (their snapshot). */
const QM_FIX_REV = 5;
function qm_fix(PDO $db): void {
  $r = $db->query("SELECT v FROM settings WHERE k='qm_fix_rev'")->fetchColumn();
  $have = $r === false ? 0 : (int)json_decode((string)$r, true);
  if ($have >= QM_FIX_REV) return;
  $db->beginTransaction();
  try {
    if ($have < 1) { /* rev 1 (owner, 2026-11-22: "add KEI to AC and DC cables brand"): the KEI logo after Microtek and Finolex */
      $kei = 'assets/quote/logo-kei.png';
      $get = $db->prepare('SELECT id, brands FROM qm_products WHERE code IN (?,?,?)'); $get->execute(['dccable', 'accable', 'accable-3ph']);
      $put = $db->prepare('UPDATE qm_products SET brands=? WHERE id=?');
      foreach ($get->fetchAll(PDO::FETCH_ASSOC) as $p) {
        $b = json_decode((string)$p['brands'], true); if (!is_array($b)) $b = [];
        $has = false; foreach ($b as $g) if (in_array($kei, (array)($g['logos'] ?? []), true)) $has = true;
        if ($has) continue;
        $gi = 0; foreach ($b as $i => $g) if ((string)($g['label'] ?? '') === '') { $gi = $i; break; } /* the unlabelled brand line, else the first */
        if (!$b) $b = [['label' => '', 'logos' => []]];
        $b[$gi]['logos'] = array_values(array_merge((array)($b[$gi]['logos'] ?? []), [$kei]));
        $put->execute([json_encode(array_values($b), JSON_UNESCAPED_UNICODE), $p['id']]);
      }
    }
    if ($have < 2) { /* rev 2 (owner, 2026-11-25: "add representing images like other items"): pictures for the Additional structure items, only where none is set */
      $put = $db->prepare("UPDATE qm_products SET picture=? WHERE code=? AND COALESCE(picture,'')=''");
      foreach (['as-walkway' => 'walkway', 'as-ladder' => 'ladder', 'as-door' => 'door'] as $code => $pic) $put->execute(["assets/quote/pic-$pic.png", $code]);
    }
    if ($have < 3) { /* rev 3 (owner, 2026-11-25): the sheet-roof page (tools/qm_sheetroof_page.js) prints last when an Additional structure item is in the quote; only where no page is set */
      $put = $db->prepare("UPDATE qm_products SET page='assets/quote/page-sheetroof.jpg' WHERE code IN ('as-walkway','as-ladder','as-door') AND COALESCE(page,'')=''");
      $put->execute();
    }
    if ($have < 4) { /* rev 4: the elevated GI structure (added by qm_added rev 8 at the end of the tab) moves to the front of Additional structure */
      $min = $db->query("SELECT MIN(sort) FROM qm_products WHERE cat='addstr' AND code<>'as-elev-gi'")->fetchColumn();
      if ($min !== false && $min !== null) $db->prepare("UPDATE qm_products SET sort=? WHERE code='as-elev-gi' AND cat='addstr' AND sort>?")->execute([(int)$min - 1, (int)$min - 1]);
    }
    if ($have < 5) { /* rev 5 (owner, 2026-11-25: "structure is included - only additional works are customer scope"): the elevated GI structure
      leaves Additional structure (customer scope) for Mounting structure (our supply), last in that tab */
      $max = (int)$db->query("SELECT COALESCE(MAX(sort),0) FROM qm_products WHERE cat='structure'")->fetchColumn();
      $db->prepare("UPDATE qm_products SET cat='structure', sort=? WHERE code='as-elev-gi' AND cat='addstr'")->execute([$max + 1]);
    }
    $db->prepare('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v')->execute(['qm_fix_rev', json_encode(QM_FIX_REV)]);
    $db->commit();
  } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
}
