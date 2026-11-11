/* KSEB documents: document definitions, profile defaults, saving rule, text clean-up (no DOM, no network). Browser: global KD. Node: module.exports. */
var KD = (function () {
  var K = {};
  var str = function (v) { return v == null ? '' : String(v); };
  var trim = function (v) { return str(v).trim(); };
  var isNum = function (v) { return /^\d+(\.\d+)?$/.test(trim(v)); };

  /* the KSEB annexures share row 1 (consumer details) and the Place / Date cell */
  var consumerGroup = function () {
    return { g: 'Consumer', fields: [
      { k: 'name', l: 'Name' },
      { k: 'consumer_no', l: 'Consumer No' },
      { k: 'category', l: 'Category' },
      { k: 'phone', l: 'Phone' },
      { k: 'email', l: 'Email' },
      { k: 'address', l: 'Address', t: 'area' }
    ] };
  };
  var placeGroup = function () {
    return { g: 'Place and date', fields: [
      { k: 'place', l: 'Place' },
      { k: 'date', l: 'Date', t: 'date' }
    ] };
  };

  K.DOCS = {
    /* Cover page for the KSEB file: every detail of the project on one page; letterhead footer, hairline header (layoutCov) */
    cov: {
      key: 'cov', tab: 'Cover page', file: 'Cover Page', page: 'cover',
      groups: [
        { g: 'Letterhead', fields: [
          { k: 'ref', l: 'Ref No.' },
          { k: 'date', l: 'Date', t: 'date' }
        ] },
        { g: 'Consumer', fields: [
          { k: 'state', l: 'Name of State' },
          { k: 'district', l: 'Name of District' },
          { k: 'discom', l: 'Name of DISCOM' },
          { k: 'division', l: 'Electrical Division & Sub Division' },
          { k: 'section', l: 'Electrical Section' },
          { k: 'consumer_no', l: 'Consumer No.' },
          { k: 'tariff', l: 'Tariff' },
          { k: 'load', l: 'Connected load (KW)' },
          { k: 'name', l: 'Name of solar plant owner' },
          { k: 'address', l: 'Address', t: 'area' },
          { k: 'email', l: 'Email ID' },
          { k: 'phone', l: 'Phone of consumer' },
          { k: 'alt_phone', l: 'Alternate contact no.' }
        ] },
        { g: 'Bank details', fields: [
          { k: 'bank_name', l: 'Bank name' },
          { k: 'bank_account', l: 'Account no. & name' },
          { k: 'bank_ifsc', l: 'IFSC code' }
        ] },
        { g: 'Plant details', fields: [
          { k: 'capacity', l: 'Total capacity of solar plant' },
          { k: 'panel_make', l: 'Make of panel' },
          { k: 'panel_type', l: 'Type' },
          { k: 'panel_watt', l: 'Each panel watt' },
          { k: 'panel_count', l: 'Number of panels' },
          { k: 'panel_total', l: 'Total panel capacity' },
          { k: 'panel_serials', l: 'Panel serial numbers (one per line)', t: 'area', rows: 6 }
        ] },
        { g: 'Inverter', fields: [
          { k: 'inv_make', l: 'Make of inverters' },
          { k: 'inv_serials', l: 'Serial number of inverters', t: 'area' },
          { k: 'inv_phase', l: 'Inverter type (single / three phase)' },
          { k: 'inv_capacity', l: 'Inverter capacity' }
        ] },
        { g: 'Application & documents', fields: [
          { k: 'cell_invoice', l: 'Cell GST invoice no.' },
          { k: 'app_no', l: 'Application number' },
          { k: 'app_date', l: 'Application date' },
          { k: 'kseb_reg', l: 'KSEB registration no. (printed when filled)', opt: true },
          { k: 'meter', l: 'Energy meter make & serial (printed when filled)', opt: true },
          { k: 'installed', l: 'Date of installation (printed when filled)', opt: true }
        ] }
      ]
    },
    wcr: {
      key: 'wcr', tab: 'Work completion report', file: 'Work Completion Report', page: 'letterhead',
      groups: [
        { g: 'Letterhead', fields: [
          { k: 'ref', l: 'Ref No.' },
          { k: 'date', l: 'Date', t: 'date' }
        ] },
        { g: 'Vendor data', fields: [
          { k: 'vendor_name', l: 'Name of the Vendor', share: true },
          { k: 'vendor_address', l: 'Address of the Vendor', t: 'area', share: true },
          { k: 'vendor_email', l: 'Mail ID of the Vendor', share: true },
          { k: 'vendor_phone', l: 'Contact No of the Vendor', share: true }
        ] },
        { g: 'Customer data', fields: [
          { k: 'cust_name', l: 'Name of the Customer' },
          { k: 'cust_address', l: 'Address of the Customer', t: 'area' },
          { k: 'cust_phone', l: 'Contact No of the Customer' },
          { k: 'consumer_no', l: 'EB consumer number' },
          { k: 'section', l: 'Electrical Section' },
          { k: 'capacity', l: 'Installed Plant Capacity' },
          { k: 'phase', l: 'Phase' }
        ] },
        { g: 'SPV module', fields: [
          { k: 'pv_make', l: 'Make' },
          { k: 'pv_type', l: 'Type' },
          { k: 'pv_watt', l: 'Each Module Watt' }
        ] },
        { g: 'Inverter', fields: [
          { k: 'inv_make', l: 'Make' },
          { k: 'inv_capacity', l: 'Capacity' },
          { k: 'inv_serial', l: 'Serial No', t: 'area' }
        ] },
        { g: 'Signatory', fields: [
          { k: 'sign_name', l: 'Name', share: true },
          { k: 'sign_designation', l: 'Designation', share: true },
          { k: 'sign_phone', l: 'Phone', share: true }
        ] }
      ]
    },
    an1: {
      key: 'an1', tab: 'Annexure 1', file: 'Annexure 1', page: 'an1',
      groups: [
        consumerGroup(),
        { g: 'Plant', fields: [
          { k: 'load', l: 'Connected load' },
          { k: 'capacity', l: 'Plant capacity' },
          { k: 'other', l: 'Use at other premises' },
          { k: 'mount', l: 'Rooftop or ground' },
          { k: 'days', l: 'Completion period' }
        ] },
        placeGroup()
      ]
    },
    /* Annexure 2: application to register the solar plant */
    an2: {
      key: 'an2', tab: 'Annexure 2', file: 'Annexure 2', page: 'an2',
      groups: [
        consumerGroup(),
        { g: 'Plant', fields: [
          { k: 'load', l: 'Connected load' },
          { k: 'capacity', l: 'Plant capacity' },
          { k: 'specs', l: 'Panel, inverter & interlock specs attached' },
          { k: 'meters', l: 'Solar & net meter bought by consumer, specs attached' },
          { k: 'drawings', l: 'Technical drawings attached' },
          { k: 'days', l: 'Completion period' }
        ] },
        placeGroup()
      ]
    },
    /* Annexure 3: application to test the plant after installation */
    an3: {
      key: 'an3', tab: 'Annexure 3', file: 'Annexure 3', page: 'an3',
      groups: [
        consumerGroup(),
        { g: 'Plant', fields: [
          { k: 'reg_no', l: 'Solar registration number' },
          { k: 'capacity', l: 'Installed capacity' },
          { k: 'type_test', l: 'Type test certificates provided' },
          { k: 'specs', l: 'Panel, inverter & interlock specs attached' },
          { k: 'inspector', l: 'Electrical Inspector approval attached' }
        ] },
        placeGroup()
      ]
    },
    /* cover sheet listing the papers handed in (the KSEB checklist from Settings) */
    chk: {
      key: 'chk', tab: 'Checklist sheet', file: 'Checklist', page: 'blank',
      groups: [
        { g: 'Consumer', fields: [
          { k: 'name', l: 'Consumer Name' },
          { k: 'consumer_no', l: 'Consumer Number' },
          { k: 'section', l: 'Electrical Section Office' }
        ] },
        { g: 'Documents', fields: [
          { k: 'items', l: 'Documents (one per line)', t: 'area', rows: 12 }
        ] }
      ]
    },
    /* Details of installation & checklist, handed in with the request for testing the solar inverter.
       Two A4 pages; the KSEB table is drawn here (layoutDoi), so long addresses and serial numbers simply make a row taller. */
    doi: {
      key: 'doi', tab: 'Details of installation', file: 'Details of Installation', page: 'blank', pages: 2,
      groups: [
        { g: 'Consumer', fields: [
          { k: 'division', l: 'Electrical Division & Sub Division' },
          { k: 'section', l: 'Electrical Section' },
          { k: 'consumer_no', l: 'Consumer No' },
          { k: 'tariff', l: 'Tariff' },
          { k: 'load', l: 'Connected load' },
          { k: 'name', l: 'Name of solar plant owner' },
          { k: 'address', l: 'Address', t: 'area' },
          { k: 'email', l: 'Email ID' },
          { k: 'phone', l: 'Phone of consumer' },
          { k: 'alt_phone', l: 'Alternate contact no.' }
        ] },
        { g: 'Bank details', fields: [
          { k: 'bank_name', l: 'Bank name' },
          { k: 'bank_account', l: 'Account no. & name' },
          { k: 'bank_ifsc', l: 'IFSC code' }
        ] },
        { g: 'Supplier / installer', fields: [
          { k: 'installer', l: 'Name & address of supplier / installer', t: 'area' },
          { k: 'inst_email', l: 'Email ID of installer' },
          { k: 'inst_phone', l: 'Phone of installer' }
        ] },
        { g: 'Plant details', fields: [
          { k: 'plant_type', l: 'Type of plant' },
          { k: 'capacity', l: 'Total capacity of solar plant' },
          { k: 'panel_count', l: 'Number of panels' },
          { k: 'panel_watt', l: 'Individual capacity' },
          { k: 'inv_serial', l: 'Make & serial no. of inverters', t: 'area' },
          { k: 'inv_phase', l: 'Inverter type (single / three phase)' },
          { k: 'inv_capacity', l: 'Inverter capacity' },
          { k: 'dc_voltage', l: 'DC input voltage' },
          { k: 'ac_voltage', l: 'Voltage and number of phase' }
        ] },
        { g: 'Checklist', fields: [
          { k: 'hybrid', l: '6. Hybrid inverter: scheme approved by CE (REES)' },
          { k: 'completion', l: '7. Completion certificate submitted in the section' },
          { k: 'energ', l: '8. Energization approval from the Electrical Inspectorate' },
          { k: 'energ_details', l: '9. Details of the energization approval' },
          { k: 'dc_isolator', l: '10. DC isolator on the inverter input' },
          { k: 'visual_isolator', l: '11. Visual isolator before the connectivity point' },
          { k: 'wiring', l: '12. Wiring as per the approved scheme' },
          { k: 'earthing', l: '13. Earthing as per standards' },
          { k: 'protection', l: '14. Inverter protection functions' }
        ] },
        { g: 'Inverter protection settings', fields: [
          { k: 'volt_trip', l: 'a. Over & under voltage trip' },
          { k: 'ov_set', l: 'Over voltage setting (V)' },
          { k: 'uv_set', l: 'Under voltage setting (V)' },
          { k: 'v_time', l: 'Voltage trip time' },
          { k: 'freq_trip', l: 'b. Over & under frequency trip' },
          { k: 'of_set', l: 'Over frequency setting (Hz)' },
          { k: 'uf_set', l: 'Under frequency setting (Hz)' },
          { k: 'f_time', l: 'Frequency trip time' },
          { k: 'islanding', l: 'c. Protection against islanding' },
          { k: 'grid_trip', l: 'd. Grid failure trip delay' },
          { k: 'reenergise', l: 'e. Time delay for re-energisation' },
          { k: 're_delay', l: 'Re-energisation delay setting' }
        ] },
        { g: 'Declaration', fields: [
          { k: 'date', l: 'Date', t: 'date' }
        ] }
      ]
    },
    /* Net Metering Agreement with KSEB Limited (KSERC RE & Net Metering Regulations 2020), printed on ₹200 Kerala e-Stamp paper:
       page 1 holds only the opening, below the stamp (FLOW, as the vendor–customer agreement); the wording is fixed (K.KAGR);
       the Schedule is a table on its own page. Fields with src are customer profile (c.) or plant (p.) fields: a value typed
       here for a field still empty in the profile is saved to the profile too (K.fill). */
    agr: {
      key: 'agr', tab: 'Agreement', file: 'Net Metering Agreement', page: 'blank', flow: true,
      groups: [
        { g: 'Agreement', fields: [
          { k: 'date', l: 'Made on', t: 'date' },
          { k: 'place', l: 'Made at (place)' }
        ] },
        { g: 'Consumer (1st party)', fields: [
          { k: 'name', l: 'Name of the consumer' },
          { k: 'consumer_no', l: 'Consumer number', src: 'c.consumer_no' },
          { k: 'category', l: 'Category (tariff)' },
          { k: 'premises', l: 'Premises', t: 'opts', opt: true, src: 'c.premises',
            opts: [['Owned', 'Owned by the consumer'], ['Leased', 'Under a valid lease agreement'], ['', 'Not marked (strike out by hand)']] },
          { k: 'address', l: 'Residing at (permanent address)', t: 'area' }
        ] },
        { g: 'KSEB Limited (2nd party)', fields: [
          { k: 'section', l: 'Electrical Section', src: 'c.kseb_section' },
          { k: 'party2', l: '2nd party, as named above the signatures' }
        ] },
        { g: 'Supply', fields: [
          { k: 'voltage', l: 'Voltage at which supply is availed' },
          { k: 'load', l: 'Connected load / contract demand', src: 'c.sanctioned_load' }
        ] },
        { g: 'Solar meter and net meter', fields: [
          { k: 'meter_by', l: 'Solar (energy) meter provided by', t: 'opts', opt: true, src: 'p.meter_by',
            opts: [['Consumer', 'The consumer, at own cost'], ['KSEB', 'KSEB Limited (consumer pays rent)'], ['', 'Not marked (strike out by hand)']] },
          { k: 'net_meter_by', l: 'Net meter provided by', t: 'opts', opt: true, src: 'p.net_meter_by',
            opts: [['KSEB', 'KSEB Limited (consumer pays rent)'], ['Consumer', 'The consumer, at own cost'], ['', 'Not marked (strike out by hand)']] },
          { k: 'meter_no', l: 'Solar meter no.', src: 'p.meter_serial' },
          { k: 'meter_make', l: 'Solar meter make', src: 'p.meter_make' },
          { k: 'meter_reading', l: 'Initial reading', src: 'p.meter_reading' }
        ] },
        { g: 'Solar plant and premises', fields: [
          { k: 'capacity', l: 'Capacity of the solar energy system' },
          { k: 'spin', l: 'SPIN (given by KSEB; blank to write by hand)', src: 'p.spin', opt: true },
          { k: 'transformer', l: 'Distribution transformer & HT feeder (HT prosumer)', src: 'c.transformer' },
          { k: 'local_body', l: 'Corporation / Municipality / Panchayath', src: 'c.local_body' },
          { k: 'village_survey', l: 'Village & survey number', src: 'c.village_survey' },
          { k: 'gps', l: 'GPS (latitude, longitude)', src: 'c.gps' },
          { k: 'site_address', l: 'Address of the premises where the plant is installed', t: 'area' }
        ] },
        { g: 'Wheeling of excess energy (optional)', fields: [1, 2, 3].reduce(function (a, n) {
          return a.concat([
            { k: 'w' + n + '_no', l: 'Preference ' + n + ': consumer no.', opt: true },
            { k: 'w' + n + '_tariff', l: 'Preference ' + n + ': tariff', opt: true },
            { k: 'w' + n + '_section', l: 'Preference ' + n + ': electrical section', opt: true }
          ]);
        }, []) }
      ]
    }
    ,
    /* ---- Bank documentation (assets/app25.js, #/bank): the papers for a customer's solar loan ---- */
    /* Vendor Feasibility Report for the bank / Jan Samarth: the official form as it is (plain page, no branding) */
    bfr: {
      key: 'bfr', tab: 'Feasibility report', file: 'Vendor Feasibility Report', page: 'blank',
      groups: [
        { g: 'Consumer', fields: [
          { k: 'name', l: 'Name of the consumer' },
          { k: 'consumer_no', l: 'Discom consumer ID' },
          { k: 'discom_id', l: 'Discom ID' },
          { k: 'portal_id', l: 'PM Surya Ghar portal ID (NP-KLSEB…)' },
          { k: 'jansamarth_id', l: 'Jan Samarth ID (ANS-SOLAR-…)' },
          { k: 'address', l: 'Address for installation', t: 'area' },
          { k: 'district', l: 'District' },
          { k: 'state', l: 'State' },
          { k: 'pincode', l: 'PIN code' }
        ] },
        { g: 'Vendor', fields: [
          { k: 'oem', l: 'OEM name' },
          { k: 'channel', l: 'Channel partner, if any' },
          { k: 'epc_address', l: 'EPC contractor address', t: 'area' },
          { k: 'epc_bank', l: 'Bank' },
          { k: 'epc_acname', l: 'Account name' },
          { k: 'epc_acno', l: 'Account no.' },
          { k: 'epc_ifsc', l: 'IFSC code' },
          { k: 'mnre', l: 'Registered in MNRE portal' }
        ] },
        { g: 'Plant', fields: [
          { k: 'cap_applied', l: 'RTS capacity applied (kW)' },
          { k: 'cap_actual', l: 'Actual RTS capacity to be installed (kW)' },
          { k: 'status', l: 'Feasibility report status', t: 'opts', opts: ['Feasible', 'Not Feasible'] },
          { k: 'cost', l: 'Project cost (all inclusive)' }
        ] }
      ]
    },
    /* Agreement between the applicant and the empanelled vendor (the MNRE model, PM Surya Ghar). Printed on ₹50 stamp paper:
       page 1 starts below the stamp, no letterhead. The wording is fixed (K.AGR); only these fields are filled in. */
    bag: {
      key: 'bag', tab: 'Vendor–customer agreement', file: 'Vendor Customer Agreement', page: 'blank', flow: true,
      groups: [
        { g: 'Agreement', fields: [
          { k: 'date', l: 'Executed on', t: 'date' }
        ] },
        { g: 'Applicant', fields: [
          { k: 'name', l: 'Name' },
          { k: 'consumer_no', l: 'Consumer number' },
          { k: 'address', l: 'Residing at', t: 'area' }
        ] },
        { g: 'Vendor', fields: [
          { k: 'vendor_name', l: 'Name' },
          { k: 'vendor_address', l: 'Registered / functional office', t: 'area' }
        ] },
        { g: 'RTS system', fields: [
          { k: 'capacity', l: 'Minimum capacity (kWp)' },
          { k: 'module_make', l: 'Module make' },
          { k: 'module_model', l: 'Module model' },
          { k: 'module_wp', l: 'Module capacity each (Wp)' },
          { k: 'module_eff', l: 'Module efficiency (%)' },
          { k: 'inv_make', l: 'Inverter make' },
          { k: 'inv_kw', l: 'Inverter combined output (kW)' }
        ] },
        { g: 'Price and payment', fields: [
          { k: 'cost', l: 'Cost of the RTS system' },
          { k: 'pay1', l: 'Advance on order (%)' },
          { k: 'pay2', l: 'Against proforma invoice (%)' },
          { k: 'pay3', l: 'After commissioning (%)' }
        ] }
      ]
    }
  };

  var fieldsOf = function (docKey) {
    var d = K.DOCS[docKey], out = [];
    if (!d) return out;
    d.groups.forEach(function (g) { g.fields.forEach(function (f) { out.push(f); }); });
    return out;
  };

  /* 'YYYY-MM-DD' -> 'DD-MM-YYYY'; anything else -> '' */
  K.dmy = function (s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(s));
    return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
  };

  /* address, district, pincode joined with ', ', skipping a part already inside the address */
  K.joinAddr = function (c) {
    c = c || {};
    var addr = trim(c.address), out = addr ? [addr] : [];
    [c.district, c.pincode].forEach(function (p) {
      p = trim(p);
      if (p && addr.toLowerCase().indexOf(p.toLowerCase()) < 0) out.push(p);
    });
    return out.join(', ');
  };

  /* inverter_capacity is per inverter in kW; several inverters print count x size and the total */
  K.invCapacity = function (cap, count) {
    cap = trim(cap);
    if (!cap || (isNum(cap) && +cap === 0)) return '';
    if (!isNum(cap)) return cap;
    var n = parseInt(trim(count), 10);
    if (!(n > 1)) return cap + ' KW';
    var total = Math.round(Number(cap) * n * 1000) / 1000;
    return n + ' × ' + cap + ' KW (' + total + ' KW)';
  };

  /* 'single' / 'three' / '' from text like "Single phase", "3 Ph", "415 V" */
  var phaseOf = function (s) {
    s = trim(s).toLowerCase();
    return /three|3\s*-?\s*ph|415/.test(s) ? 'three' : /single|1\s*-?\s*ph|230|240/.test(s) ? 'single' : '';
  };
  /* the inverter's phase: the plant's inverter type, else any inverter's own type, else the KSEB connection
     (a three-phase connection can have a single-phase inverter, so the connection is only the last resort) */
  K.invPhase = function (p, c) {
    p = p || {}; c = c || {};
    var srcs = [p.inverter_type].concat((Array.isArray(p.inverters) ? p.inverters : []).map(function (i) { return i && i.type; }));
    for (var i = 0; i < srcs.length; i++) { var ph = phaseOf(srcs[i]); if (ph) return ph; }
    return phaseOf(c.phase);
  };

  /* WinAnsi-safe text for the standard PDF fonts: unsupported runs become one '?' */
  var WIN_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  K.ansi = function (s) {
    s = str(s)
      .replace(/₹/g, 'Rs.')
      .replace(/[   \t]/g, ' ')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-');
    var out = '', bad = false;
    for (var ch of s) {
      var c = ch.codePointAt(0);
      var ok = ch === '\n' || (c >= 0x20 && c <= 0x7E) || (c >= 0xA0 && c <= 0xFF) || WIN_EXTRA.indexOf(ch) >= 0;
      if (ok) { out += ch; bad = false; }
      else if (!bad) { out += '?'; bad = true; }
    }
    return out;
  };

  K.defaults = function (docKey, ctx) {
    ctx = ctx || {};
    var c = ctx.customer || {}, p = ctx.plant || {}, pr = ctx.project || {}, sd = ctx.defaults || {};
    var today = str(ctx.today);
    var v = {};
    /* numeric columns store a blank field as 0, so a numeric zero counts as empty */
    var zero = function (src) { return isNum(src) && +trim(src) === 0; };
    var bare = function (src, unit) { src = trim(src); return zero(src) ? '' : isNum(src) ? src + ' ' + unit : src; };
    var cap = function (unit) { return bare(trim(p.capacity) && !zero(p.capacity) ? p.capacity : (+pr.kw > 0 ? pr.kw : ''), unit); };
    if (docKey === 'wcr') {
      var ph = trim(c.phase);
      var serials = (Array.isArray(p.inverters) ? p.inverters : [])
        .map(function (i) { return trim(i && i.serial); }).filter(Boolean).join(', ');
      v = {
        ref: '', date: today,
        vendor_name: str(sd.vendor_name), vendor_address: str(sd.vendor_address),
        vendor_email: str(sd.vendor_email), vendor_phone: str(sd.vendor_phone),
        cust_name: trim(c.name), cust_address: K.joinAddr(c), cust_phone: trim(c.phone),
        consumer_no: trim(c.consumer_no), section: trim(c.kseb_section),
        capacity: cap('KW'),
        phase: ph === 'Single phase' ? 'Single' : ph === 'Three phase' ? 'Three' : ph,
        pv_make: trim(p.panel_make), pv_type: trim(p.panel_type), pv_watt: bare(p.panel_wattage, 'Wp'),
        inv_make: trim(p.inverter_make), inv_capacity: K.invCapacity(p.inverter_capacity, p.inverter_count),
        inv_serial: serials,
        sign_name: str(sd.sign_name), sign_designation: str(sd.sign_designation), sign_phone: str(sd.sign_phone)
      };
    } else if (docKey === 'bfr' || docKey === 'bag') {
      /* bank papers: plant cost = the tax bill total, else the project cost; the company and its bank from the quotation maker */
      var co = ctx.company || {}, bk = co.bank || {}, bill = ctx.bill || {};
      var kwN = trim(p.capacity) && !zero(p.capacity) ? trim(p.capacity) : (+pr.kw > 0 ? String(pr.kw) : '');
      var amt = +bill.grand > 0 ? +bill.grand : (+pr.cost > 0 ? +pr.cost : 0);
      var inrS = function (n) { return Math.round(n).toLocaleString('en-IN'); };
      if (docKey === 'bfr') {
        v = {
          name: trim(c.name), consumer_no: trim(c.consumer_no), discom_id: 'KSEBL', portal_id: trim(p.application_no), jansamarth_id: trim(c.jansamarth_id),
          address: trim(c.address), district: trim(c.district), state: 'KERALA', pincode: trim(c.pincode),
          oem: 'NA', channel: 'NA', epc_address: trim(co.address) || trim(sd.vendor_address),
          epc_bank: trim(bk.bank), epc_acname: trim(bk.name) || trim(co.name), epc_acno: trim(bk.account), epc_ifsc: trim(bk.ifsc), mnre: 'Yes',
          cap_applied: kwN, cap_actual: kwN, status: 'Feasible', cost: amt ? inrS(amt) + '/-' : ''
        };
      } else {
        var binv = Array.isArray(p.inverters) ? p.inverters : [];
        var ikw = binv.reduce(function (t, i) { return t + (isNum(i && i.capacity) ? +i.capacity : 0); }, 0);
        if (!(ikw > 0) && isNum(p.inverter_capacity)) ikw = +p.inverter_capacity * Math.max(1, parseInt(trim(p.inverter_count), 10) || 1);
        v = {
          date: today, name: trim(c.name), consumer_no: trim(c.consumer_no), address: K.joinAddr(c),
          vendor_name: trim(co.name) || 'JASPER SOLAR SOLUTIONS', vendor_address: trim(co.address) || trim(sd.vendor_address),
          capacity: kwN, module_make: trim(p.panel_make), module_model: trim(p.panel_model),
          module_wp: zero(p.panel_wattage) ? '' : trim(p.panel_wattage), module_eff: zero(p.panel_efficiency) ? '' : trim(p.panel_efficiency).replace(/\s*%$/, ''),
          inv_make: trim(p.inverter_make), inv_kw: ikw > 0 ? String(Math.round(ikw * 1000) / 1000) : '',
          cost: amt ? 'Rs.' + inrS(amt) + ' + KSEB Charges.' : '', pay1: '60', pay2: '30', pay3: '10'
        };
      }
    } else if (docKey === 'cov') {
      var cph = trim(c.phase) || trim(p.inverter_type), csg = /single/i.test(cph), cth = /three/i.test(cph), cip = K.invPhase(p, c);
      var cinv = Array.isArray(p.inverters) ? p.inverters : [], cpan = Array.isArray(p.panels) ? p.panels : [];
      var uniq = function (a) { return a.map(trim).filter(function (x, i, l) { return x && l.indexOf(x) === i; }); };
      var dot = function (d) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trim(d)); return m ? m[3] + '.' + m[2] + '.' + m[1] : trim(d); };
      var pcnt = trim(p.panel_count) && !zero(p.panel_count) ? trim(p.panel_count) : String(cpan.filter(function (x) { return trim(x && x.serial); }).length || '');
      var pwat = trim(p.panel_wattage), caps = cinv.map(function (i) { return trim(i && i.capacity); }).filter(Boolean);
      var cacct = trim(c.bank_account);
      v = {
        ref: '', date: today,
        state: 'Kerala', district: trim(c.district), discom: 'Kerala State Electricity Board Ltd',
        division: [trim(c.kseb_division), trim(c.kseb_subdivision)].filter(Boolean).join(', '),
        section: trim(c.kseb_section), consumer_no: trim(c.consumer_no),
        tariff: [trim(c.tariff), csg ? 'Single' : cth ? 'Three' : ''].filter(Boolean).join('/'),
        load: bare(c.sanctioned_load, 'KW'),
        name: trim(c.name), address: K.joinAddr(c), email: trim(c.email), phone: trim(c.phone), alt_phone: trim(c.alt_phone),
        bank_name: trim(c.bank_name),
        bank_account: [cacct.indexOf('•') >= 0 ? '' : cacct, trim(c.bank_holder)].filter(Boolean).join(', '),
        bank_ifsc: trim(c.bank_ifsc),
        capacity: cap('KW'),
        panel_make: trim(p.panel_make) || uniq(cpan.map(function (x) { return x && x.make; })).join(', '),
        panel_type: trim(p.panel_type), panel_watt: bare(pwat, 'Wp'), panel_count: pcnt,
        panel_total: isNum(pcnt) && isNum(pwat) && +pwat > 0 ? Math.round(+pcnt * +pwat) / 1000 + ' KW' : '',
        panel_serials: cpan.map(function (x) { return trim(x && x.serial); }).filter(Boolean).join('\n'),
        inv_make: trim(p.inverter_make) || uniq(cinv.map(function (i) { return i && i.make; })).join(', '),
        inv_serials: cinv.map(function (i) { return trim(i && i.serial); }).filter(Boolean).join(', '),
        inv_phase: cip === 'single' ? 'Single' : cip === 'three' ? 'Three' : '',
        inv_capacity: caps.length > 1 ? caps.map(function (x) { return isNum(x) ? x + ' KW' : x; }).join(', ') : K.invCapacity(p.inverter_capacity, p.inverter_count),
        cell_invoice: trim(p.cell_invoice_no), app_no: trim(p.application_no), app_date: dot(p.application_date),
        kseb_reg: trim(p.kseb_reg_no),
        meter: [trim(p.meter_make), trim(p.meter_serial) ? 'S/N: ' + trim(p.meter_serial) : ''].filter(Boolean).join(' '),
        installed: dot(trim(p.installed_on) || trim(p.commissioned_on))
      };
    } else if (docKey === 'doi') {
      var phs = trim(c.phase) || trim(p.inverter_type), one = /single/i.test(phs), three = /three/i.test(phs), dip = K.invPhase(p, c);
      var invSerials = (Array.isArray(p.inverters) ? p.inverters : []).map(function (i) { return trim(i && i.serial); }).filter(Boolean);
      var nPanels = trim(p.panel_count) && !zero(p.panel_count) ? trim(p.panel_count)
        : String((Array.isArray(p.panels) ? p.panels : []).filter(function (x) { return trim(x && x.serial); }).length || '');
      var acct = trim(c.bank_account), sys = trim(p.system_type);
      v = {
        division: [trim(c.kseb_division), trim(c.kseb_subdivision)].filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(' / '),
        section: trim(c.kseb_section), consumer_no: trim(c.consumer_no),
        tariff: [trim(c.tariff), one ? 'Single' : three ? 'Three' : ''].filter(Boolean).join('/'),
        load: bare(c.sanctioned_load, 'kW'),
        name: trim(c.name), address: K.joinAddr(c), email: trim(c.email), phone: trim(c.phone), alt_phone: trim(c.alt_phone),
        bank_name: [trim(c.bank_name), trim(c.bank_branch)].filter(Boolean).join(', '),
        /* someone who may not see the full account number gets it masked (••••1234): that is no use on the form */
        bank_account: [acct.indexOf('•') >= 0 ? '' : acct, trim(c.bank_holder)].filter(Boolean).join(' - '),
        bank_ifsc: trim(c.bank_ifsc),
        installer: [trim(sd.vendor_name), trim(sd.vendor_address)].filter(Boolean).join(', '),
        inst_email: trim(sd.vendor_email), inst_phone: trim(sd.vendor_phone),
        plant_type: /hybrid/i.test(sys) ? 'Hybrid' : /off/i.test(sys) ? 'Off grid' : 'On grid',
        capacity: cap('KW'), panel_count: nPanels, panel_watt: bare(p.panel_wattage, 'Wp'),
        inv_serial: [trim(p.inverter_make), invSerials.length ? 'S/N: ' + invSerials.join(', ') : ''].filter(Boolean).join(' '),
        inv_phase: dip === 'single' ? 'Single Phase' : dip === 'three' ? 'Three Phase' : '',
        inv_capacity: K.invCapacity(p.inverter_capacity, p.inverter_count),
        dc_voltage: bare(p.inverter_dc_voltage, 'Vdc'),
        ac_voltage: dip === 'single' ? '230V, 1 Phase' : dip === 'three' ? '415V, 3 Phase' : '',
        /* the checklist answers and inverter settings the office normally gives (as on the KSEB sample) */
        hybrid: '', completion: '', energ: 'Not Applicable', energ_details: '',
        dc_isolator: 'Yes', visual_isolator: 'Yes', wiring: 'Yes', earthing: 'Yes', protection: 'Yes',
        volt_trip: 'Yes', ov_set: '264', uv_set: '192', v_time: '200ms',
        freq_trip: 'Yes', of_set: '50.5', uf_set: '47.5', f_time: '200ms',
        islanding: 'Yes', grid_trip: '2 seconds', reenergise: 'Yes', re_delay: '60 seconds',
        date: today
      };
    } else if (docKey === 'agr') {
      var tf = trim(c.tariff), tcode = /^((?:E?HT|LT)\s*-?\s*[0-9]+[A-Z]*)/i.exec(tf);
      var aph = phaseOf(c.phase) || K.invPhase(p, c), lat = trim(c.lat), lng = trim(c.lng);
      v = {
        date: today, place: K.placeName(c.local_body) || trim(c.kseb_section) || trim(c.district),
        name: trim(c.name), consumer_no: trim(c.consumer_no),
        category: tcode ? tcode[1].toUpperCase().replace(/\s+/g, '') : (/^other$/i.test(tf) ? '' : tf),
        premises: /^lease/i.test(trim(c.premises)) ? 'Leased' : 'Owned',
        address: K.joinAddr(c),
        section: trim(c.kseb_section), party2: 'KSEB Limited',
        voltage: aph === 'three' ? '415V' : aph === 'single' ? '240V' : '',
        load: bare(c.sanctioned_load, 'KW'),
        /* usual split: the solar (energy) meter is the consumer's scope, the net meter comes from KSEB on rent */
        meter_by: /^kseb/i.test(trim(p.meter_by)) ? 'KSEB' : 'Consumer',
        net_meter_by: /^consumer/i.test(trim(p.net_meter_by)) ? 'Consumer' : 'KSEB',
        meter_no: trim(p.meter_serial), meter_make: trim(p.meter_make),
        meter_reading: isNum(p.meter_reading) ? trim(p.meter_reading) + ' kWh' : trim(p.meter_reading),
        capacity: cap('KW'), spin: trim(p.spin),
        transformer: trim(c.transformer), local_body: trim(c.local_body), village_survey: trim(c.village_survey),
        gps: lat && lng && !(+lat === 0 && +lng === 0) ? lat + ',' + lng : '',
        site_address: K.joinAddr(c)
      };
      [1, 2, 3].forEach(function (n) { v['w' + n + '_no'] = ''; v['w' + n + '_tariff'] = ''; v['w' + n + '_section'] = ''; });
    } else if (docKey === 'chk') {
      v = {
        name: trim(c.name), consumer_no: trim(c.consumer_no), section: trim(c.kseb_section),
        items: (Array.isArray(ctx.items) ? ctx.items : []).map(trim).filter(Boolean).join('\n')
      };
    } else if (K.DOCS[docKey]) {
      v = {
        name: trim(c.name), consumer_no: trim(c.consumer_no), category: trim(c.tariff),
        phone: trim(c.phone), email: trim(c.email), address: K.joinAddr(c),
        place: trim(c.district), date: today
      };
      var more = docKey === 'an1' ? {
        load: bare(c.sanctioned_load, 'kW'), capacity: cap('kWp'),
        other: 'NO', mount: (p.rooftop_type === 'Ground' || p.structure_type === 'Ground mount') ? 'GROUND MOUNTED' : 'ROOF-TOP', days: '30 DAYS'
      } : docKey === 'an2' ? {
        load: bare(c.sanctioned_load, 'kW'), capacity: cap('kWp'),
        specs: 'YES', meters: 'YES', drawings: 'YES', days: '30 DAYS'
      } : docKey === 'an3' ? {
        reg_no: trim(p.kseb_reg_no), capacity: cap('kWp'),
        type_test: 'YES', specs: 'YES', inspector: 'NOT APPLICABLE'
      } : {};
      Object.keys(more).forEach(function (k) { v[k] = more[k]; });
    }
    return v;
  };

  /* defaults overlaid with saved values, known keys only */
  K.values = function (docKey, ctx, saved) {
    var v = K.defaults(docKey, ctx);
    saved = saved || {};
    fieldsOf(docKey).forEach(function (f) {
      if (Object.prototype.hasOwnProperty.call(saved, f.k) && saved[f.k] != null) v[f.k] = str(saved[f.k]);
    });
    return v;
  };

  /* keys whose trimmed value differs from the default, plus date always */
  K.overrides = function (docKey, values, defaults) {
    var o = {};
    values = values || {}; defaults = defaults || {};
    fieldsOf(docKey).forEach(function (f) {
      if (f.k === 'date' || trim(values[f.k]) !== trim(defaults[f.k])) o[f.k] = trim(values[f.k]);
    });
    return o;
  };

  /* labels of empty fields, excluding ref */
  K.empty = function (docKey, values) {
    values = values || {};
    return fieldsOf(docKey).filter(function (f) { return f.k !== 'ref' && !f.opt && !trim(values[f.k]); })
      .map(function (f) { return f.l; });
  };

  /* "Anad Grama Panchayath" -> "Anad": the place name of a local body, for "made … at <place>" */
  K.placeName = function (s) {
    return trim(s).replace(/\s+(grama\s+|gram\s+|block\s+)?(panchayath|panchayat|municipality|municipal\s+corporation|corporation)\.?$/i, '').trim();
  };

  /* fields that are also profile fields (src 'c.col' customer, 'p.col' plant): the overrides typed here for a profile
     field that is still empty, as [{k, t, col, v}] for the server, which fills only fields that are still empty.
     Numbers lose their unit ("3 KW" -> "3"); GPS "lat, lng" fills the customer's lat and lng. */
  K.fill = function (docKey, o, ctx) {
    var c = (ctx && ctx.customer) || {}, p = (ctx && ctx.plant) || {}, out = [];
    o = o || {};
    fieldsOf(docKey).forEach(function (f) {
      if (!f.src || !Object.prototype.hasOwnProperty.call(o, f.k)) return;
      var t = f.src.split('.')[0], col = f.src.split('.')[1], val = trim(o[f.k]).replace(/\s+/g, ' '), m;
      if (!val) return;
      if (col === 'gps') {
        m = /^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(val);
        var has = function (x) { return trim(x) !== '' && !(isNum(x) && +x === 0); };
        if (m && !has(c.lat) && !has(c.lng)) out.push({ k: f.k, t: 'c', col: 'gps', v: m[1] + ',' + m[2] });
        return;
      }
      var cur = trim((t === 'c' ? c : p)[col]);
      if (cur && !(col === 'sanctioned_load' && isNum(cur) && +cur === 0)) return;
      if (col === 'sanctioned_load' || col === 'meter_reading') {
        m = /^(\d+(?:\.\d+)?|\.\d+)\s*(kw|kwh|units?)?$/i.exec(val.replace(/,/g, ''));
        if (!m) return;
        val = m[1];
      }
      out.push({ k: f.k, t: t, col: col, v: val });
    });
    return out;
  };

  /* ---- page layout and PDF writing. Positions in pt from the page's top-left; y is the baseline. ---- */
  /* the template files are cached for 30 days: a replaced template must get a new file name */
  K.PAGES = {
    letterhead: { pdf: 'assets/kseb/letterhead.pdf', png: 'assets/kseb/letterhead.png', w: 595.92, h: 841.92 },
    cover: { pdf: 'assets/kseb/cover.pdf', png: 'assets/kseb/cover.png', w: 595.92, h: 841.92 }, /* letterhead footer, hairline header */
    an1: { pdf: 'assets/kseb/annexure-1.pdf', png: 'assets/kseb/annexure-1.png', w: 595.32, h: 841.92 },
    an2: { pdf: 'assets/kseb/annexure-2.pdf', png: 'assets/kseb/annexure-2.png', w: 595.32, h: 841.92 },
    an3: { pdf: 'assets/kseb/annexure-3.pdf', png: 'assets/kseb/annexure-3.png', w: 595.32, h: 841.92 },
    blank: { pdf: 'assets/kseb/blank.pdf', png: 'assets/kseb/blank.png', w: 595.28, h: 841.89 }
  };
  K.FONTS = { T: 'TimesRoman', TB: 'TimesRomanBold', H: 'Helvetica', HB: 'HelveticaBold' };

  /* measure(text, f, size) -> width in pt, from pdf-lib's standard font metrics (fonts embedded once) */
  var measLib = null, measP = null;
  K.measurer = function (PDFLib) {
    if (measP && measLib === PDFLib) return measP;
    measLib = PDFLib;
    var keys = Object.keys(K.FONTS);
    measP = PDFLib.PDFDocument.create().then(function (doc) {
      return Promise.all(keys.map(function (k) { return doc.embedFont(PDFLib.StandardFonts[K.FONTS[k]]); }));
    }).then(function (list) {
      var fonts = {};
      keys.forEach(function (k, i) { fonts[k] = list[i]; });
      return function (text, f, size) { return fonts[f].widthOfTextAtSize(str(text), size); };
    }).catch(function (e) { measP = null; throw e; });
    return measP;
  };

  /* lines of at most `width` pt: paragraphs on \n, then words; a word wider than a line is broken by characters */
  K.wrap = function (text, width, f, size, measure) {
    var out = [];
    var fits = function (s) { return measure(s, f, size) <= width; };
    str(text).split(/\r?\n/).forEach(function (para) {
      var line = '';
      para.split(/[ \t]+/).forEach(function (w) {
        if (!w) return;
        var both = line ? line + ' ' + w : w;
        if (fits(both)) { line = both; return; }
        if (line) out.push(line);
        line = '';
        if (fits(w)) { line = w; return; }
        for (var ch of w) {
          if (line && !fits(line + ch)) { out.push(line); line = ''; }
          line += ch;
        }
      });
      out.push(line);
    });
    return out;
  };

  var r2 = function (n) { return Math.round(n * 100) / 100; };
  /* field value ready for the standard fonts: trimmed, \r\n -> \n, WinAnsi-clean */
  var clean = function (v) { return K.ansi(trim(v).replace(/\r\n?/g, '\n')); };
  var labelOf = function (docKey, k) {
    var f = fieldsOf(docKey).filter(function (x) { return x.k === k; })[0];
    return f ? f.l : k;
  };
  /* one line at the largest size from max down to min (0.5 steps) that fits width */
  var fitOne = function (t, f, max, min, width, measure) {
    for (var s = max; s >= min; s -= 0.5) if (measure(t, f, s) <= width) return { s: s, fit: true };
    return { s: min, fit: false };
  };
  var op = function (t, x, y, f, s, u) { var o = { t: t, x: r2(x), y: r2(y), f: f, s: s }; if (u) o.u = 1; return o; };

  /* Work Completion Report on the letterhead. Ref No. / Date labels end at x 64.2 / 427.3, baseline 185.25;
     footer rule at y 750.8 (measured with PyMuPDF on assets/kseb/letterhead.pdf). */
  var WCR = { left: 60, right: 536, mid: 298, top: 200, specW: 360, refX: 70, refMax: 400, dateX: 432, headY: 185, headS: 9, sigLast: 740, sigGap: 60, sigMax: 11 };

  var wcrBlocks = function (v) {
    var L = function (k) { return { t: labelOf('wcr', k) + ': ' + clean(v[k]) }; };
    var C = function (label, k, gap) { return { t: label + clean(v[k]), al: 'c', w: WCR.specW, gap: gap }; };
    return [
      { t: 'WORK COMPLETION REPORT', f: 'HB', d: 2, al: 'c' },
      { t: 'VENDOR DATA', f: 'HB', al: 'c', gap: 0.6 },
      L('vendor_name'), L('vendor_address'), L('vendor_email'), L('vendor_phone'),
      { t: 'CUSTOMER DATA', f: 'HB', al: 'c', gap: 1 },
      L('cust_name'), L('cust_address'), L('cust_phone'), L('consumer_no'), L('section'), L('capacity'), L('phase'),
      { t: 'SPECIFICATION', f: 'TB', d: 1, al: 'c', gap: 1 },
      { t: 'SPV Module', f: 'TB' },
      C('Make : ', 'pv_make', 1), C('Type : ', 'pv_type'), C('Each Module Watt: ', 'pv_watt'),
      { t: 'Inverter', f: 'TB' },
      C('Make : ', 'inv_make', 1), C('Capacity : ', 'inv_capacity'), C('Serial No: ', 'inv_serial')
    ];
  };

  /* body and signature block at body size s; fit = the signature keeps sigGap pt of blank space above it */
  var wcrAt = function (v, s, measure) {
    var ops = [], y = null, lh = 1.3 * s, colW = WCR.right - WCR.left;
    wcrBlocks(v).forEach(function (b) {
      var f = b.f || 'T', sz = s + (b.d || 0);
      K.wrap(b.t.trim(), b.w || colW, f, sz, measure).forEach(function (line, i) {
        y = y === null ? WCR.top + sz : y + (i ? 0 : (b.gap || 0) * lh) + 1.3 * sz;
        var x = b.al === 'c' ? WCR.mid - measure(line, f, sz) / 2 : WCR.left;
        if (line) ops.push(op(line, x, y, f, sz));
      });
    });
    var ss = Math.min(s, WCR.sigMax), sig = [];
    var vendor = clean(v.vendor_name).replace(/^M\/S(\.|\s)+/i, '');
    ['For ' + vendor, 'Name: ' + clean(v.sign_name), 'Designation: ' + clean(v.sign_designation), 'Phone: ' + clean(v.sign_phone)]
      .forEach(function (t) { sig = sig.concat(K.wrap(t.trim(), colW, 'H', ss, measure)); });
    var sy = WCR.sigLast - (sig.length - 1) * 1.3 * ss;
    sig.forEach(function (line, i) {
      if (line) ops.push(op(line, WCR.right - measure(line, 'H', ss), sy + i * 1.3 * ss, 'H', ss));
    });
    return { ops: ops, size: s, fit: y <= sy - WCR.sigGap - s };
  };

  var layoutWcr = function (v, measure) {
    var ops = [], ok = true;
    var head = function (t, x, max) {
      if (!t) return;
      var r = fitOne(t, 'H', WCR.headS, 6, max - x, measure);
      ok = ok && r.fit;
      ops.push(op(t, x, WCR.headY, 'H', r.s));
    };
    head(clean(v.ref), WCR.refX, WCR.refMax);
    head(K.dmy(v.date) || clean(v.date), WCR.dateX, WCR.right);
    var r;
    for (var s = 12; s >= 9; s -= 0.5) { r = wcrAt(v, s, measure); if (r.fit) break; }
    return { ops: ops.concat(r.ops), size: r.size, overflow: !(ok && r.fit) };
  };

  /* KSEB annexures: the same table on every form — value column x 369.5-553.8, values in Helvetica.
     Place / Date labels (FML-TTIndulekha 14 pt): the colon glyphs end at x 130.56 / 130.08 on every form,
     so values start at x 136.6 (6 pt after the colon). Row lines and label baselines per form below,
     measured with PyMuPDF on assets/kseb/annexure-N.pdf (drawings and rawdict). */
  var FORM = { x0: 369.5, x1: 553.8, pad: 5, max: 10.5, min: 6, labelX: 136.6, labelRight: 364.5,
    r1: ['name', 'consumer_no', 'category', 'phone', 'email', 'address'] };
  var FORMS = {
    an1: { placeY: 413.33, dateY: 427.85, rows: [['r1', 155.7, 233.7], ['load', 233.7, 256.1], ['capacity', 256.1, 285.5],
      ['other', 285.5, 343.8], ['mount', 343.8, 380.3], ['days', 380.3, 402]] },
    an2: { placeY: 471.67, dateY: 486.19, rows: [['r1', 155.7, 233.7], ['load', 233.7, 256.1], ['capacity', 256.1, 285.5],
      ['specs', 285.5, 343.8], ['meters', 343.8, 402.2], ['drawings', 402.2, 438.6], ['days', 438.6, 460.1]] },
    an3: { placeY: 476.35, dateY: 490.75, rows: [['r1', 125.3, 203.3], ['reg_no', 203.3, 225.6], ['capacity', 225.6, 246.3],
      ['type_test', 246.3, 348.0], ['specs', 348.0, 406.4], ['inspector', 406.4, 464.8]] }
  };

  /* paragraphs in Helvetica, left-aligned, block centred vertically, largest size 10.5 -> 6 that fits the cell */
  var formCell = function (paras, top, bottom, measure, lh) {
    lh = lh || 1.2;
    var x = FORM.x0 + FORM.pad, w = FORM.x1 - FORM.x0 - 2 * FORM.pad, room = bottom - top - 2 * FORM.pad;
    var lines, s, bh, fit = false;
    for (s = FORM.max; s >= FORM.min; s -= 0.5) {
      lines = [];
      paras.forEach(function (p) { lines = lines.concat(K.wrap(p, w, 'H', s, measure)); });
      bh = (lines.length - 1) * lh * s + s;
      if (bh <= room) { fit = true; break; }
    }
    if (!fit) s = FORM.min;
    var y0 = top + (bottom - top - bh) / 2 + 0.8 * s, ops = [];
    lines.forEach(function (line, i) { if (line) ops.push(op(line, x, y0 + i * lh * s, 'H', s)); });
    return { ops: ops, s: s, fit: fit };
  };

  var layoutForm = function (docKey, v, measure) {
    var F = FORMS[docKey], ops = [], ok = true, size = FORM.max;
    F.rows.forEach(function (row) {
      var paras = row[0] === 'r1'
        ? FORM.r1.map(function (k) { return (labelOf(docKey, k) + ': ' + clean(v[k])).trim(); })
        : (clean(v[row[0]]) ? [clean(v[row[0]])] : []);
      if (!paras.length) return;
      var c = formCell(paras, row[1], row[2], measure, row[0] === 'r1' ? 1.1 : 1.2);
      ops = ops.concat(c.ops);
      ok = ok && c.fit;
      size = Math.min(size, c.s);
    });
    [[clean(v.place), F.placeY], [K.dmy(v.date) || clean(v.date), F.dateY]].forEach(function (p) {
      if (!p[0]) return;
      var r = fitOne(p[0], 'H', FORM.max, FORM.min, FORM.labelRight - FORM.labelX, measure);
      ok = ok && r.fit;
      ops.push(op(p[0], FORM.labelX, p[1], 'H', r.s));
    });
    return { ops: ops, size: size, overflow: !ok };
  };

  /* Checklist sheet on a plain A4 page, as the office types it: underlined title, three consumer lines,
     then the numbered documents in capitals (numbers right-aligned, wrapped lines keep the indent). */
  var CHK = { left: 50, right: 545, mid: 297.64, titleY: 72, titleS: 13, colon: 185, valX: 300, infoY: 104, infoLh: 22, infoS: 10.5,
    listY: 186, numR: 66, textX: 72, max: 12, min: 9, bottom: 790 };
  var layoutChk = function (v, measure) {
    var ops = [], title = 'CHECKLIST FOR SUBMITTING SOLAR APPLICATION';
    ops.push(op(title, CHK.mid - measure(title, 'TB', CHK.titleS) / 2, CHK.titleY, 'TB', CHK.titleS, true));
    ['name', 'consumer_no', 'section'].forEach(function (k, i) {
      var y = CHK.infoY + i * CHK.infoLh;
      ops.push(op(labelOf('chk', k), CHK.left, y, 'HB', CHK.infoS));
      ops.push(op(':', CHK.colon, y, 'HB', CHK.infoS));
      var val = clean(v[k]);
      if (val) ops.push(op(val, CHK.valX, y, 'T', CHK.infoS));
    });
    var items = clean(v.items).split('\n').map(trim).filter(Boolean).map(function (t) { return t.toUpperCase(); });
    var best = null;
    for (var s = CHK.max; s >= CHK.min; s -= 0.5) {
      var list = [], y = CHK.listY, lh = 1.45 * s;
      items.forEach(function (t, i) {
        var num = (i + 1) + '.';
        list.push(op(num, CHK.numR - measure(num, 'T', s), y, 'T', s));
        K.wrap(t, CHK.right - CHK.textX, 'T', s, measure).forEach(function (line, j) {
          if (j) y += lh;
          if (line) list.push(op(line, CHK.textX, y, 'T', s));
        });
        y += lh;
      });
      best = { ops: list, size: s, fit: y - lh <= CHK.bottom };
      if (best.fit) break;
    }
    return { ops: ops.concat(best.ops), size: best.size, overflow: !best.fit };
  };

  /* Details of installation: the KSEB table (S.No / item / details) over two A4 pages, as on the KSEB sample.
     Page 1: consumer, bank, installer and plant details, checklist up to 14 a. Page 2: the inverter settings, the note on
     proof of settings, the declaration and the signature spaces for the KSEB engineers. One text size for the whole
     document, the largest from 10 down to 7 pt at which both pages fit. Lines are ops with ln: [x1, y1, x2, y2]. */
  var DOI = { x0: 28, c1: 82, c2: 318, x1: 567, top: 48, bottom: 806, pad: 2.6, padX: 4, lw: 0.6, max: 10, min: 7 };
  var DOI_P1 = [
    { title: 'DETAILS OF INSTALLATION & CHECKLIST TO BE FURNISHED ALONG WITH THE REQUEST FOR TESTING SOLAR INVERTERS' },
    ['1', 'Name of Electrical Division & Sub Division', 'division'], ['2', 'Name of Electrical Section', 'section'],
    ['3', 'Consumer No:', 'consumer_no'], ['4', 'Tariff', 'tariff'], ['5', 'Connected load', 'load'],
    ['6', 'Name of Solar plant Owner', 'name'], ['7', 'Address', 'address'], ['8', 'Email I D', 'email'],
    ['9', 'Contact Phone no. of Consumer', 'phone'], ['10', 'Alternate Contact no.', 'alt_phone'], ['11', 'Bank Details', ''],
    ['a', 'Bank Name', 'bank_name'], ['b', 'Account No. & Name', 'bank_account'], ['c', 'IFSC Code', 'bank_ifsc'],
    ['12', 'Name & Address of Supplier /Installer', 'installer'], ['13', 'Email I D', 'inst_email'], ['14', 'Contact Phone no. of Installer', 'inst_phone'],
    { head: 'Plant details' },
    ['1', 'Type of plant', 'plant_type'], ['2', 'Total Capacity of solar plant', 'capacity'], ['', 'Number of panels', 'panel_count'],
    ['', 'Individual Capacity', 'panel_watt'], ['3', 'Make & Serial No. of Inverters', 'inv_serial'],
    ['', 'Inverter type single phase/Three phase', 'inv_phase'], ['', 'Inverter capacity', 'inv_capacity'],
    ['4', 'DC input Voltage', 'dc_voltage'], ['5', 'Voltage and Number of phase', 'ac_voltage'],
    ['6', 'If the inverter is of hybrid type, whether the scheme confirms to the scheme approved by CE(REES)', 'hybrid'],
    ['7', 'Whether Completion certificate submitted in Ele.Section', 'completion'],
    ['8', 'Whether Energization Approval obtained from Electrical Inspectorate', 'energ'],
    ['9', 'Details of Energization Approval by Electrical Inspectorate', 'energ_details'],
    ['10', 'Whether DC isolator provided on incoming side of Inverter', 'dc_isolator'],
    ['11', 'Whether Visual Isolator provided before Connectivity point', 'visual_isolator'],
    ['12', 'Whether all wiring connection as per the approved scheme are completed', 'wiring'],
    ['13', 'Whether Earthing provided for Installation as per Standards. (Separate Earthing for AC DB, DC DB, Structure & Panels, LA & body of Inverter, Isolator etc.)', 'earthing'],
    ['14', 'Whether the inverter is equipped with the following protection functions:', 'protection'],
    ['a', 'Whether Over & Under voltage Trip function provided?', 'volt_trip']
  ];
  var DOI_P2 = [
    ['', 'Details of Setting provided in the inverter:', { set: [['Over voltage setting : ', 'ov_set', ' V'], ['Under voltage setting : ', 'uv_set', ' V'], ['Trip time setting : ', 'v_time', '']] }],
    ['b', 'Whether Over & Under frequency Trip function provided?', 'freq_trip'],
    ['', 'Details of Setting provided in the inverter:', { set: [['Over frequency setting : ', 'of_set', ' Hz'], ['Under frequency setting : ', 'uf_set', ' Hz'], ['Trip time setting : ', 'f_time', '']] }],
    ['c', 'Whether protection against unintentional islanding provided?', 'islanding'],
    ['d', 'Grid Failure Trip delay', 'grid_trip'],
    ['e', 'Whether Time-delay function for re-energisation after resuming stable grid supply provided?', 'reenergise'],
    ['', 'Details of re-energisation time delay Setting', 're_delay'],
    { note: [['', 'The supplier /installer shall provide any of the following in proof of settings provided in the inverter for protection/function 14(a) & 14(b) listed above.'],
      ['(i)', 'Actual setting provided in the inverter, as displayed in the HMI of the inverter or download in to laptop PC/ Mobile Phone which is connected to the device'],
      ['(ii)', 'Factory Test certificate issued by the Original Equipment manufacturer or a NABL Accredited LAB showing the serial number of the Inverter & protection function setting provided'],
      ['(iii)', 'Report On site, Testing carried out at site by an authorised testing agency with a calibrated test kit; witnessed by KSEB']] }
  ];

  /* one page of the table at size s from y = DOI.top; returns its ops and where it ended */
  var doiTable = function (rows, v, s, page, measure) {
    var D = DOI, lh = 1.18 * s, ops = [], y = D.top, segs = [];
    var text = function (t, x, yy, f, u) { if (t) ops.push(Object.assign(op(t, x, yy, f || 'H', s, u), { p: page })); };
    var wrapIn = function (t, w, f) { return t ? K.wrap(t, w - 2 * D.padX, f || 'H', s, measure) : []; };
    var base = function (top, i) { return top + D.pad + 0.82 * s + i * lh; };
    rows.forEach(function (r) {
      var top = y, n, cols;
      if (r.title) {
        var ts = fitOne(r.title, 'HB', s, D.min - 1, D.x1 - D.x0 - 2 * D.padX, measure).s;
        n = 1;
        ops.push(Object.assign(op(r.title, (D.x0 + D.x1) / 2 - measure(r.title, 'HB', ts) / 2, top + D.pad + 1.5 + 0.82 * ts, 'HB', ts), { p: page }));
        y = top + 2 * D.pad + 3 + ts * 1.18; cols = [D.x0, D.x1];
      } else if (r.head) {
        text(r.head, D.x0 + D.padX, base(top, 0));
        y = top + 2 * D.pad + lh; cols = [D.x0, D.c2, D.x1];
      } else if (r.note) {
        var ny = 0, w = D.x1 - D.x0 - 2 * D.padX, ind = 30;
        r.note.forEach(function (it) {
          var lines = K.wrap(it[1], it[0] ? w - ind : w, 'H', s - 0.5, measure);
          if (it[0]) ops.push(Object.assign(op(it[0], D.x0 + D.padX, base(top, ny), 'H', s - 0.5), { p: page }));
          lines.forEach(function (ln, j) { if (ln) ops.push(Object.assign(op(ln, D.x0 + D.padX + (it[0] ? ind : 0), base(top, ny + j), 'H', s - 0.5), { p: page })); });
          ny += lines.length;
        });
        y = top + 2 * D.pad + ny * lh; cols = [D.x0, D.x1];
      } else {
        var lab = wrapIn(r[1], D.c2 - D.c1), val = [];
        if (r[2] && r[2].set) {
          r[2].set.forEach(function (st, i) {
            var x = D.c2 + D.padX, yy = base(top, i), got = clean(v[st[1]]);
            text(st[0], x, yy); x += measure(st[0], 'H', s) + 1.5;
            text(got || '________', x, yy, 'H', !!got); x += measure(got || '________', 'H', s);
            text(st[2], x, yy);
          });
          val = r[2].set;
        } else if (r[2]) {
          val = wrapIn(clean(v[r[2]]), D.x1 - D.c2);
          val.forEach(function (ln, i) { text(ln, D.c2 + D.padX, base(top, i)); });
        }
        text(r[0], D.x0 + D.padX, base(top, 0));
        lab.forEach(function (ln, i) { text(ln, D.c1 + D.padX, base(top, i)); });
        n = Math.max(1, lab.length, val.length);
        y = top + 2 * D.pad + n * lh; cols = [D.x0, D.c1, D.c2, D.x1];
      }
      segs.push([top, y, cols]);
    });
    var L = function (x1, y1, x2, y2) { ops.push({ ln: [r2(x1), r2(y1), r2(x2), r2(y2)], w: D.lw, p: page }); };
    segs.forEach(function (sg) { L(D.x0, sg[0], D.x1, sg[0]); sg[2].forEach(function (x) { L(x, sg[0], x, sg[1]); }); });
    L(D.x0, y, D.x1, y);
    return { ops: ops, end: y };
  };

  /* below the table on page 2: declaration, date and the signature spaces (KSEB engineers sign by hand) */
  var doiTail = function (v, s, y0, measure) {
    var D = DOI, ops = [], x = D.x0 + 12, xr = D.x1 - 12, ts = s + 0.5, y = y0;
    var T = function (t, yy) { ops.push(Object.assign(op(t, x, yy, 'H', ts), { p: 1 })); };
    var R = function (t, yy) { ops.push(Object.assign(op(t, xr - measure(t, 'H', ts), yy, 'H', ts), { p: 1 })); };
    var date = K.dmy(v.date) || clean(v.date);
    y += 3.2 * ts; T('All the statements furnished above are true and correct', y);
    y += 4.2 * ts; T('Date:   ' + date, y); R('Signature of Consumer/ installer', y);
    y += 4 * ts; T('Remarks of Assistant Engineer:', y);
    y += 2.6 * ts; T('Installation inspected and found to be in order. Recommended for pre-energisation testing.', y);
    y += 2.6 * ts; T('Date:', y);
    y += 2.6 * ts; R('Signature of Assistant Engineer', y);
    y += 4.4 * ts; T('Recommended for pre-energisation testing.', y);
    y += 1.6 * ts; R('Signature of Assistant Executive Engineer', y);
    y += 3.4 * ts; T('Date:', y);
    y += 2.6 * ts; T('Pre-energisation testing may be scheduled.', y);
    y += 1.6 * ts; R('Signature of Executive Engineer', y);
    return { ops: ops, end: y };
  };

  var layoutDoi = function (v, measure) {
    var best = null;
    for (var s = DOI.max; s >= DOI.min; s -= 0.5) {
      var p1 = doiTable(DOI_P1, v, s, 0, measure), p2 = doiTable(DOI_P2, v, s, 1, measure), tail = doiTail(v, s, p2.end, measure);
      best = { ops: p1.ops.concat(p2.ops, tail.ops), size: s, overflow: !(p1.end <= DOI.bottom && tail.end <= DOI.bottom) };
      if (!best.overflow) break;
    }
    return best;
  };

  /* Cover page on assets/kseb/cover.pdf: the letterhead's footer, with a hairline header (outline mark + name) instead of
     its solid red one (tools/kseb_cover_template.py). Drawn as a ledger to save ink: no filled bands, no frames.
     The template carries the title line (PROJECT DETAILS, REF NO. / DATE over fine lines); the app writes the Ref No. and
     the date on those lines, then the KSEB rows in order. Each section starts with a small red
     heading and a 0.5 pt red rule; rows are split by 0.3 pt grey hairlines; numbers in red, item names in small grey
     capitals, details in near-black. Panel serials sit in a numbered grid. One size from 10 down to 6.5 pt so it all
     fits between the title line (y 130) and the footer rule (y 750.8), with a clear gap above the footer. Ops may carry a colour c. */
  var BRAND = { red: [0.843, 0.231, 0.243], ink: [0.11, 0.11, 0.118], grey: [0.373, 0.376, 0.392], hair: [0.80, 0.80, 0.82] };
  var COV = { x0: 34, nr: 52, c1: 58, c2: 250, x1: 561.5, headY: 127, refX: 338, refW: 112, dateX: 496, dateW: 64, top: 142, bottom: 728, pad: 2.5, max: 10, min: 6.5 };
  var COV_ROWS = [
    { band: 'CONSUMER DETAILS' },
    ['1', 'NAME OF STATE', 'state'], ['2', 'NAME OF DISTRICT', 'district'], ['3', 'NAME OF DISCOM', 'discom'],
    ['4', 'NAME OF ELECTRICAL DIVISION & SUB DIVISION', 'division'], ['5', 'NAME OF ELECTRICAL SECTION', 'section'],
    ['6', 'CONSUMER NO.', 'consumer_no'], ['7', 'TARIFF', 'tariff'], ['8', 'CONNECTED LOAD (KW)', 'load'],
    ['9', 'NAME OF SOLAR PLANT OWNER', 'name'], ['10', 'ADDRESS', 'address'], ['11', 'EMAIL ID', 'email'],
    ['12', 'CONTACT PHONE NO. OF CONSUMER', 'phone'], ['13', 'ALTERNATE CONTACT NO.', 'alt_phone'],
    ['14', 'BANK DETAILS', ''], ['a', 'BANK NAME', 'bank_name'], ['b', 'ACCOUNT NO & NAME', 'bank_account'], ['c', 'IFSC CODE', 'bank_ifsc'],
    { band: 'PLANT DETAILS' },
    ['15', 'TOTAL CAPACITY OF SOLAR PLANT', 'capacity'], ['16', 'MAKE OF PANEL', 'panel_make'], ['17', 'TYPE', 'panel_type'],
    ['18', 'EACH PANEL WATT', 'panel_watt'], ['19', 'NUMBER OF PANELS', 'panel_count'], ['20', 'TOTAL PANEL CAPACITY', 'panel_total'],
    { serials: true },
    { band: 'INVERTER DETAILS' },
    ['21', 'MAKE OF INVERTERS', 'inv_make'], ['22', 'SERIAL NUMBER OF INVERTERS', 'inv_serials'],
    ['23', 'INVERTER TYPE SINGLE PHASE/THREE PHASE', 'inv_phase'], ['24', 'INVERTER CAPACITY', 'inv_capacity'],
    { band: 'APPLICATION & DOCUMENTS' },
    ['25', 'CELL GST INVOICE NO.', 'cell_invoice'], ['26', 'APPLICATION NUMBER', 'app_no'], ['27', 'APPLICATION DATE', 'app_date'],
    ['28', 'KSEB REGISTRATION NO.', 'kseb_reg', 1], ['29', 'ENERGY METER (MAKE & SERIAL NO.)', 'meter', 1], ['30', 'DATE OF INSTALLATION', 'installed', 1]
  ];
  /* the panel serials: one per line (commas also split); empty slots up to the number of panels are left to fill by hand */
  K.serials = function (v) {
    var list = clean(v.panel_serials).split(/[\n,]+/).map(trim).filter(Boolean), n = parseInt(trim(v.panel_count), 10);
    while (n > list.length && list.length < 60) list.push('');
    return list;
  };

  var covAt = function (v, s, measure) {
    var D = COV, lh = 1.16 * s, ls = s - 1.2, ops = [], y = D.top;
    var T = function (t, x, yy, f, c, sz) { if (t) ops.push(Object.assign(op(t, x, yy, f || 'H', sz || s), { c: c || BRAND.ink })); };
    var R = function (t, xr, yy, f, c, sz) { if (t) T(t, xr - measure(t, f || 'H', sz || s), yy, f, c, sz); };
    var L = function (x1, y1, x2, y2, c, w) { ops.push({ ln: [r2(x1), r2(y1), r2(x2), r2(y2)], w: w || 0.3, c: c || BRAND.hair }); };
    var base = function (top, i) { return top + D.pad + 0.78 * s + i * lh; };
    var extra = function (r) { return r[3] && !clean(v[r[2]]); }; /* rows added to the KSEB list print only when filled */
    var first = true;
    COV_ROWS.forEach(function (r) {
      if (r.band || r.serials) {
        var list = r.serials ? K.serials(v) : null, filled = list ? list.filter(Boolean).length : 0;
        var top = y + (first ? 0 : 0.9 * s);
        first = false;
        var hy = top + 0.95 * s;
        T(r.band || 'PANEL SERIAL NUMBERS', D.x0, hy, 'HB', BRAND.red, s - 1.5);
        if (r.serials && filled) R(filled + ' NOS', D.x1, hy, 'H', BRAND.grey, s - 1.5);
        y = hy + 0.45 * s;
        L(D.x0, y, D.x1, y, BRAND.red, 0.5);
        if (!r.serials) return;
        if (!list.length) list = ['', '', ''];
        var cols = list.length > 24 ? 4 : 3, cw = (D.x1 - D.x0) / cols, rows = Math.ceil(list.length / cols);
        for (var i = 0; i < rows; i++) {
          var rt = y;
          for (var j = 0; j < cols; j++) {
            var k = i * cols + j; if (k >= list.length) break;
            var cx = D.x0 + j * cw, yy = base(rt, 0);
            R((k + 1) + '', cx + 15, yy, 'H', BRAND.red, ls);
            var sr = list[k], fs = s;
            while (sr && fs > 5 && measure(sr, 'H', fs) > cw - 30) fs -= 0.5;
            T(sr, cx + 21, yy, 'H', BRAND.ink, fs);
            if (!sr) L(cx + 21, yy + 1.5, cx + cw - 12, yy + 1.5); /* a line to write the serial by hand */
          }
          y = rt + 2 * D.pad + lh;
          if (i < rows - 1) L(D.x0, y, D.x1, y);
        }
        return;
      }
      if (extra(r)) return;
      var top2 = y;
      var lab = K.wrap(r[1], D.c2 - D.c1 - 10, 'H', ls, measure);
      var val = r[2] ? K.wrap(clean(v[r[2]]), D.x1 - D.c2, 'H', s, measure) : [];
      var n = Math.max(1, lab.length, val.length);
      R(r[0], D.nr, base(top2, 0), 'H', BRAND.red, ls);
      lab.forEach(function (ln, i) { T(ln, D.c1, base(top2, i), 'H', BRAND.grey, ls); });
      var strong = r[2] === 'name' || r[2] === 'consumer_no';
      val.forEach(function (ln, i) { T(ln, D.c2, base(top2, i), strong ? 'HB' : 'H', BRAND.ink); });
      y = top2 + 2 * D.pad + n * lh;
      L(D.x0, y, D.x1, y);
    });
    return { ops: ops, end: y };
  };

  var layoutCov = function (v, measure) {
    var head = [], ok = true;
    /* Ref No. and date on the template's lines; a long Ref No. shrinks to fit (down to 6 pt) */
    [[clean(v.ref), COV.refX, COV.refW], [K.dmy(v.date) || clean(v.date), COV.dateX, COV.dateW]].forEach(function (f) {
      if (!f[0]) return;
      var r = fitOne(f[0], 'H', 9.5, 6, f[2], measure);
      ok = ok && r.fit;
      head.push(Object.assign(op(f[0], f[1], COV.headY, 'H', r.s), { c: BRAND.ink }));
    });
    var res;
    for (var s = COV.max; s >= COV.min; s -= 0.5) { res = covAt(v, s, measure); if (res.end <= COV.bottom) break; }
    return { ops: head.concat(res.ops), size: s < COV.min ? COV.min : s, overflow: !(ok && res.end <= COV.bottom) };
  };

  /* ---- Bank: Vendor Feasibility Report: the official form as it is (the bank's Word / PDF form), plain A4, no branding ----
     Page 1 copies the form line for line: 14 pt bold centred title, 12 pt lines 19.8 pt apart from a 1-inch margin
     (Helvetica for the form's Calibri), the label and its value on one line, an empty value as a line of underscores,
     item 13 as a neat block (Bank / Account name / Account No. / IFSC Code with their colons in one column), 17 with a box
     after each answer and a tick in the chosen one, item 19 as a line (the images go up to the portal), then the signature. */
  var BFR = { x0: 72, x1: 523.3, titleY: 84, top: 122, pitch: 19.8, s: 12, blank: '____________________' };
  var BFR_ROWS = [
    ['1. Name of the Consumer: ', 'name'], ['2. Discom Consumer ID: ', 'consumer_no'], ['3. Discom ID: ', 'discom_id'],
    ['4. PM Surya Shakti Portal ID: ', 'portal_id'], ['5. Jan Samarth ID: ', 'jansamarth_id'], ['6. Address for Installation: ', 'address', 11],
    ['7. District of Installation: ', 'district'], ['8. State of Installation: ', 'state'], ['9. Pin Code of Installation: ', 'pincode'],
    ['10. OEM Name: ', 'oem'], ['11. Channel Partner, if any: ', 'channel'], ['12. EPC Contractor Address: ', 'epc_address'],
    ['13. EPC Contractor Bank Details: ', '#bank'], ['14.RTS Capacity in KW Applied:', 'cap_applied'],
    ['15. Actual RTS Capacity to be installed:', 'cap_actual'], ['16. Is the vendor registered in MNRE Portal: ', 'mnre'],
    ['(Note: Only vendors registered in MNRE portal will be allowed)', '#note'],
    ['17. Feasibility Report Status:', '#status'], ['18. Project Cost (all inclusive):', 'cost'],
    ['19. Site Layout - Images (2-4 images to be uploaded):', '#photos']
  ];
  var layoutBfr = function (v, measure) {
    var D = BFR, s = D.s, ops = [], y = D.top, w = D.x1 - D.x0;
    var T = function (t, x, yy, f, sz, pg) { if (t) ops.push(Object.assign(op(t, x, yy, f || 'H', sz || s), pg ? { p: pg } : {})); };
    var L = function (x1, y1, x2, y2, wd) { ops.push({ ln: [r2(x1), r2(y1), r2(x2), r2(y2)], w: wd || 0.6 }); };
    var val = function (k) { return clean(v[k]).replace(/\n+/g, ', ') || D.blank; };
    /* a label and its value on one line; a long value carries on from the left margin, as Word wraps it */
    var line = function (label, value, vs, vf) {
      vs = vs || s;
      var x = D.x0 + measure(label, 'H', s) + (/ $/.test(label) ? 1.5 : 0.5);
      T(label, D.x0, y, 'H');
      var first = K.wrap(value, D.x1 - x, vf || 'H', vs, measure)[0] || '', rest = value.slice(first.length).trim();
      T(first, x, y, vf || 'H', vs);
      if (rest) K.wrap(rest, w, vf || 'H', vs, measure).forEach(function (ln) { y += 0.85 * D.pitch; T(ln, D.x0, y, vf || 'H', vs); });
      y += D.pitch;
    };
    var t1 = 'Residential Roof Top Solar Installation', t2 = 'Vendor Feasibility Report Format';
    T(t1, 297.64 - measure(t1, 'HB', 14) / 2, D.titleY, 'HB', 14);
    T(t2, 297.64 - measure(t2, 'HB', 14) / 2, D.titleY + 19.7, 'HB', 14);
    BFR_ROWS.forEach(function (r) {
      if (r[1] === '#note') { T(r[0], D.x0, y, 'H'); y += D.pitch; return; }
      if (r[1] === '#bank') {
        /* the company's account for the loan disbursement: one detail per line, the colons in one column */
        T(r[0].trim(), D.x0, y, 'H'); y += D.pitch;
        var bk = [['Bank', 'epc_bank', 'H'], ['Account name', 'epc_acname', 'HB'], ['Account No.', 'epc_acno', 'HB'], ['IFSC Code', 'epc_ifsc', 'HB']];
        var lx = D.x0 + 26, cx = lx + Math.max.apply(null, bk.map(function (b) { return measure(b[0], 'H', s); })) + 10;
        bk.forEach(function (b) { T(b[0], lx, y, 'H'); T(':', cx, y, 'H'); T(val(b[1]), cx + 10, y, b[2]); y += D.pitch; });
        return;
      }
      if (r[1] === '#status') {
        /* "Feasible [box]" and "Not Feasible [box]" as on the form; a tick in the chosen box */
        T(r[0], D.x0, y, 'H'); y += D.pitch;
        var no = /^not/i.test(clean(v.status)) ? 1 : 0, bw = 64, bh = 15;
        [['Feasible', D.x0 + 27], ['Not Feasible', D.x1 - bw - 8 - measure('Not Feasible', 'H', s)]].forEach(function (o, i) {
          T(o[0], o[1], y, 'H');
          var bx = o[1] + measure(o[0], 'H', s) + 8, by = y - 11.5;
          L(bx, by, bx + bw, by); L(bx + bw, by, bx + bw, by + bh); L(bx + bw, by + bh, bx, by + bh); L(bx, by + bh, bx, by);
          if (i === no) { L(bx + 18, by + 6, bx + 26, by + 12.5, 2.2); L(bx + 26, by + 12.5, bx + 42, by - 3, 2.2); }
        });
        y += 1.85 * D.pitch; return;
      }
      if (r[1] === '#photos') { T(r[0], D.x0, y, 'H'); y += 0.85 * D.pitch; return; }
      line(r[0], val(r[1]), r[2]);
    });
    T('Authorised Signatory of the vendor with Stamp', D.x1 - measure('Authorised Signatory of the vendor with Stamp', 'H', s), y + 67, 'H');
    return { ops: ops, size: s, overflow: y + 67 > 800 };
  };

  /* ---- Bank: Agreement between the applicant and the vendor (MNRE model for PM Surya Ghar) ----
     Text flows over as many pages as it needs in Times; page 1 is the ₹50 e-Stamp paper (see FLOW).
     A clause number hangs in the margin; a heading never ends a page; the signatures stay together on the last page.
     {field} in the wording is filled from the document's fields; an empty one prints a blank line to fill by hand. */
  K.AGR = [
    ['t', '', 'Agreement Between Applicant and the registered/empanelled Vendor for installation of rooftop solar system in residential house of the Applicant under simplified procedure of Rooftop Solar Programme PMSGMBY'],
    ['p', '', 'This agreement is executed on {date} for design, installation, commissioning and five years comprehensive maintenance of rooftop solar system to be installed under simplified procedure of Rooftop Solar Programme Ph-II.'],
    ['c', '', 'Between'],
    ['p', '', '{name} having residential electricity connection with consumer number {consumer_no} from DISCOM residing at {address} (hereinafter referred as Applicant).'],
    ['c', '', 'And'],
    ['p', '', '{vendor_name} is registered/ empanelled with The MNRE/KSEBL (hereinafter referred as DISCOM) and is having registered/functional office at {vendor_address} (hereinafter referred as Vendor). Both Applicant and the Vendor are jointly referred as Parties.'],
    ['h', '', 'Whereas'],
    ['n', '-', 'The Applicant intends to install rooftop solar system under simplified procedure of Rooftop Solar Programme Ph-II of the MNRE.'],
    ['n', '-', 'The Vendor is registered/empanelled vendor with DISCOM for installation of rooftop solar under MNRE Schemes. The Vendor satisfies all the existing regulation pertaining to electrical safety and license in the respective state and it is not debarred or blacklisted from undertaking any such installations by any state/central Government agency.'],
    ['n', '-', 'Both the parties are mutually agreed and understand their roles and responsibilities and have no liability to any other agency/firm/stakeholder especially to DISCOM and MNRE.'],
    ['h', '1.', 'GENERAL TERMS:'],
    ['n', '1.1.', 'The Applicant hereby represents and warrants that the Applicant has the sole legal capacity to enter into this Agreement and authorise the construction, installation and commissioning of the Rooftop Solar System (“RTS System”) which is inclusive of Balance of System (“BoS”) on the Applicant’s premises (“Applicant Site”). The Vendor reserves its right to verify ownership of the Applicant Site and Applicant covenants to co-operate and provide all information and documentation required by the Vendor for the same.'],
    ['n', '1.2.', 'Vendor may propose changes to the scope, nature and or schedule of the services being performed under this Agreement. All proposed changes must be mutually agreed between the Parties. If Parties fail to agree on the variation proposed, either Party may terminate this Agreement by serving notice as per Clause 13.'],
    ['n', '1.3.', 'The Applicant understands and agrees that future changes in load, electricity usage patterns and/or electricity tariffs may affect the economics of the RTS System and these factors have not been and cannot be considered in any analysis or quotation provided by Vendor or its Authorized Persons (defined below).'],
    ['h', '2.', 'RTS System'],
    ['n', '2.1.', 'Total capacity of RTS System will be minimum {capacity}kWp.'],
    ['n', '2.2.', 'The Solar modules, inverters and BoS will confirm to minimum specifications and DCR requirement of MNRE.'],
    ['n', '2.3.', 'Solar modules of {module_make} make, {module_model} model, {module_wp}Wp capacity each and {module_eff}% efficiency will be procured and installed by the Vendor'],
    ['n', '2.4.', 'Solar inverter of {inv_make} make, {inv_kw} kW Combined rated output capacity will be procured and installed by the Vendor'],
    ['n', '2.5.', 'Module mounting structure has to withstand minimum wind load pressure as specified by MNRE.'],
    ['n', '2.6.', 'Other BoS installations shall be as per best industry practice with all safety and protection gears installed by the vendor.'],
    ['h', '3.', 'PRICE AND PAYMENT TERMS'],
    ['n', '3.1.', 'The cost of RTS System will be {cost} The Applicant shall pay the total cost to the Vendor as under:'],
    ['s', '(i)', '{pay1}% as an advance on confirmation of the order;'],
    ['s', '(ii)', '{pay2}% against Proforma Invoice (PI) before dispatch of solar panels, inverters and other BoS items to be delivered;'],
    ['s', '(iii)', '{pay3}% after installation and commissioning of the RTS System.'],
    ['n', '3.2.', 'The order value and payment terms are fixed and will not be subject to any adjustment except as approved in writing by Vendor. The payment shall be made only through bankers’ cheque / NEFT / RTGS / online payment portal as intimated by Vendor. No cash payments shall be accepted by Vendor or its Authorised Person.'],
    ['h', '4.', 'REPRESENTATIONS MADE BY THE APPLICANT:'],
    ['p', '', 'The Applicant acknowledges and agrees that:'],
    ['n', '4.1.', 'any timeline or schedule shared by Vendor for the provision of services and delivery of the RTS System is only an estimate and Vendor will not be liable for any delay that is not attributable to Vendor;'],
    ['n', '4.2.', 'all information disclosed by the Applicant to Vendor in connection with the supply of the RTS System (or any part thereof), services and generation estimation (including, without limitation, the load profile and power bill) are true and accurate, and acknowledges that Vendor has relied on the information produced by the Applicant to customise the RTS System layout and BoS design for the purposes of this Agreement;'],
    ['n', '4.3.', 'all descriptive specifications, illustrations, drawings, data, dimensions, quotation, fact sheets, price lists and any advertising material circulated/published/provided by Vendor are approximate only;'],
    ['n', '4.4.', 'any drawings, pre-feasibility report, specifications and plans composed by Vendor shall require the Applicant’s approval within 5 (five) days of its receipt by electronic mail to Vendor and if the Applicant does not respond within this period, the drawings, specifications or plans shall be final and deemed to have been approved by the Applicant;'],
    ['n', '4.5.', 'the Applicant shall not use the RTS System or any part thereof, other than in accordance with the product manufacturer’s specifications, and covenants that any risk arising from misuse or/and misappropriate use shall be to the account of the Applicant alone.'],
    ['n', '4.6.', 'The Applicant acknowledges that shading from trees, buildings, or any other obstruction can significantly reduce the performance of the Rooftop Solar System (“RTS System”).'],
    ['n', '4.7.', 'The Applicant shall be solely responsible for ensuring that the Applicant Site remains shadow-free during the lifetime of the RTS System.'],
    ['n', '4.8.', 'The Applicant shall, at their own cost and effort, regularly monitor and remove any shading sources, including trimming of trees, removal of temporary structures, or other obstructions that may arise.'],
    ['n', '4.9.', 'The Vendor shall not be liable for any performance loss, warranty claims, or maintenance issues arising due to shading or failure of the Applicant to remove such obstructions.'],
    ['n', '4.10.', 'The Applicant represents, warrants and covenants that:'],
    ['s', '(i)', 'all electrical and plumbing infrastructure at the Applicant Site are in conformity with applicable laws;'],
    ['s', '(ii)', 'the Applicant has the legal capacity to permit unfettered access to Vendor and its Authorized Persons for the purposes of execution and performance of this Agreement;'],
    ['s', '(iii)', 'the Applicant has and will provide requisite power, water and other requisite resources and storage facilities for construction, installation, operation and maintenance of the RTS System;'],
    ['s', '(iv)', 'the Applicant will provide support for site fabrication of structure, assembly and fitting of module mounting structure at Applicant Site;'],
    ['s', '(v)', 'the Applicant will ensure that the Applicant Site is shadow free and free of all encumbrances during the lifetime of the RTS System;'],
    ['s', '(vi)', 'Applicant should ensure that the Applicant regularly cleans and ensures accessibility and safety to the RTS System, as required by Vendor and dusting frequency in the premises.'],
    ['s', '(vii)', 'Vendor is entitled to permit geo-tagging of the Applicant Site as a Vendor installation site;'],
    ['s', '(viii)', 'Unless otherwise intimated by the Applicant in writing, Vendor is entitled to take photographs, videos and testimonials of the Applicant and the Applicant Site, and to create content which will become the property of Vendor and the same can be freely used by Vendor as part of its promotional and marketing activities across all platforms as it deems fit;'],
    ['s', '(ix)', 'the Applicant validates the stability of the Applicant Site for the installation of the RTS System.'],
    ['h', '5.', 'MAINTENANCE:'],
    ['n', '5.1.', 'Vendor shall provide five-year free workmanship maintenance. Vendor shall visit the Applicant’s premises at least once every quarter after commissioning of the RTS System for maintenance purposes.'],
    ['n', '5.2.', 'During such maintenance visit, Vendor shall check all nuts and bolts, fuses, earth resistance and other consumables in respect of the RTS System to ensure that it is in good working condition.'],
    ['n', '5.3.', 'Cleaning requirement/expectation from the Applicant side – Applicant responsibility, minimum expectation from Applicant that it will be cleaned regularly as per the dusting frequency.'],
    ['h', '6.', 'ACCESS AND RIGHT OF ENTRY:'],
    ['n', '6.1.', 'The Applicant hereby grants permission to Vendor and its authorized personnel, representatives, associates, officers, employees, financing agents, subcontractors (“Authorized Persons”) to enter the Applicant Site for the purposes of:'],
    ['s', '(a)', 'conducting feasibility study;'],
    ['s', '(b)', 'storing the RTS System/any part thereof;'],
    ['s', '(c)', 'installing the RTS System;'],
    ['s', '(d)', 'inspecting the RTS System;'],
    ['s', '(e)', 'conducting repairs and maintenance to the RTS System;'],
    ['s', '(f)', 'removing the RTS System (or any part thereof), if necessary for any reason whatsoever;'],
    ['s', '(g)', 'Such other matters as necessary to execute and perform its rights and obligations under this Agreement.'],
    ['n', '6.2.', 'The Applicant shall ensure that third-party consents necessary for the Authorized Persons to access the Applicant Site are obtained prior to commencement of services under this Agreement.'],
    ['h', '7.', 'WARRANTIES:'],
    ['n', '7.1.', 'Product Warranty: The Applicant shall be entitled to manufacturers’ warranty. Any warranty in relation to RTS System supplied to the Applicant by Vendor under this Agreement is limited to the warranty given by the manufacturer of the RTS System (or any part thereof) to Vendor.'],
    ['n', '7.2.', 'Installation Warranty: Vendor warrants that all installations shall be free from workmanship defects or BOS defects for a period of five years from the date of installation of the RTS System. The warranty is limited to Vendor rectifying the workmanship or BOS defects at Vendor’s expense in respect of those defects reported by the Applicant, in writing. The Applicant is obliged and liable to report such defects within 15 (fifteen) days of occurrence of such defect.'],
    ['n', '7.3.', 'Subject to manufacturer warranty, Vendor warrants that the solar modules supplied herein shall have tolerance within a five percentage range (+/-5%). The peak-power point voltage and the peak-power point current of any supplied solar module and/or any module string (series connected modules) shall not vary by more than 5% (five percent) from the respective arithmetic means for all modules and/or for all module strings, as the case may be, provided the RTS System is properly maintained and the Applicant Site is free from shadow at the time of operation of the RTS System.'],
    ['n', '7.4.', 'Exceptions for warranty:'],
    ['s', '(a)', 'Any attempt by any person other than Vendor or its Authorised Persons to adjust, modify, repair or provide maintenance to the RTS System, shall disentitle the Applicant of the warranty provided by Vendor hereunder.'],
    ['s', '(b)', 'Vendor shall not be liable for any degeneration or damage to the RTS System due to any action or inaction on the part of the Applicant.'],
    ['s', '(c)', 'Vendor shall not be bound or liable to remedy any damage, fault, failure or malfunction of the RTS System owing to external causes, including but not limited to accidents, misuse, neglect, if usage and/or storage and/or installation are non-confirming to product instructions, modifications by the Applicant leading to shading or accessibility issues, failure to perform required maintenance, normal wear and tear, Force Majeure Event, or negligence or default attributable to the Applicant.'],
    ['s', '(d)', 'Vendor shall not be liable to repair or remedy any accessories or parts added to the RTS System that were not originally sourced by Vendor to the Applicant.'],
    ['h', '8.', 'PERFORMANCE GUARANTEE'],
    ['n', '8.1.', 'Vendor guarantees minimum system performance ratio of 75% as per performance ratio test carried out in adherence to IEC 61724 or equivalent BIS for a period of five years.'],
    ['h', '9.', 'INSURANCE:'],
    ['n', '9.1.', 'Vendor may, at its sole discretion, obtain insurance covering risks of loss/damage to the RTS System (any part thereof) during transit from Vendor’s warehouse until delivery to the Applicant Site and until installation and commissioning.'],
    ['n', '9.2.', 'Thereafter, all risk shall pass on to the Applicant and the Applicant may accordingly procure relevant insurances.'],
    ['h', '10.', 'CANCELLATION:'],
    ['n', '10.1.', 'The Applicant may cancel the order placed on Vendor within 7 (seven) days from the date of remittance of advance money or the date of order acceptance, whichever is earlier (“Order Confirmation”) by serving notice as per Clause 13.'],
    ['n', '10.2.', 'If the Applicant cancels the order after the expiry of 7 (seven) days from the date of Order Form, the Applicant shall be liable to pay Vendor, a cancellation fee of 20% of the total order value plus costs and expenses incurred by Vendor, including, costs for labour, design, return of products, administrative costs, subvention costs.'],
    ['n', '10.3.', 'Notwithstanding the aforesaid, the Applicant shall not be entitled to cancel the Order Form after Vendor has dispatched the RTS System (or any part thereof, including BOS) to the Applicant Site. If Applicant chooses to terminate the Order Form after dispatch, the entire amount paid by the Applicant till date, shall be forfeited by Vendor.'],
    ['h', '11.', 'LIMITATION OF LIABILITY AND INDEMNITY:'],
    ['n', '11.1.', 'To the extent that terms implied by law apply to the RTS System and the services rendered under this Agreement, Vendor’s liability for any breach of those terms is limited to:'],
    ['s', '(a)', 'repairing or replacing the RTS System/any part thereof, as applicable; or'],
    ['s', '(b)', 'Refund of the moneys paid by the Applicant to Vendor, if Vendor cannot fulfil the order.'],
    ['h', '12.', 'SUSPENSION AND TERMINATION:'],
    ['n', '12.1.', 'If the Applicant fails to pay any sum due under this Agreement on the due date, Vendor may, in addition to its other rights under this Agreement, suspend its obligations under this Agreement until all outstanding amounts (including interest due) are paid.'],
    ['h', '13.', 'NOTICES:'],
    ['p', '', 'Any notice or other communication under this Agreement to Vendor and or to the Applicant, shall be in writing, in English language and shall be delivered or sent: (a) by electronic mail and/or (b) by hand delivery or registered post/courier, at the registered address of Applicant/Vendor.'],
    ['h', '14.', 'FORCE MAJEURE EVENT:'],
    ['n', '14.1.', 'Neither Party shall be in default due to any delay or failure to perform its/his/her/their obligations under this Agreement which arises from or is a consequence of occurrence of an event which is beyond the reasonable control of such Party, and which makes performance of its/his/her/their obligations under this Agreement impossible or so impractical as reasonably to be considered impossible in the circumstances, and includes, but is not limited to, war, riot, civil disorder, earthquake, fire, explosion, storm, flood or other adverse weather conditions, pandemic, epidemic, embargo, strikes, lockouts, labour difficulties, other industrial action, acts of government, unavailability of equipment from vendor, changes requested by the Applicant (“Force Majeure Event”).'],
    ['h', '15.', 'GOVERNING LAW AND DISPUTE RESOLUTION:'],
    ['n', '15.1.', 'The interpretation and enforcement of this Agreement shall be governed by the laws of India'],
    ['n', '15.2.', 'In the event of any dispute, controversy or difference between the Parties arising out of, or relating to this Agreement (“Dispute”), both Parties shall make an effort to resolve the Dispute in good faith, failing which, any Party to the Dispute shall be entitled to refer the Dispute to arbitration to resolve the Dispute in the manner set out in this Clause. The rights and obligations of the Parties under this Agreement shall remain in full force and effect pending the award in such arbitration proceeding.'],
    ['n', '15.3.', 'The arbitration proceeding shall be governed by the provisions of the Arbitration and Conciliation Act, 1996 and shall be settled by a sole arbitrator mutually appointed by the Parties.'],
    ['sig', '', '']
  ];
  /* Page 1 is a Kerala e-Stamp paper: its stamp block fills the top down to "Please write or type below this line" (y ~495)
     and its verification footer (QR code, seal) the bottom from y ~712. So page 1 holds only the opening (title, date,
     the two parties) inside y 500-706, at the largest size from 10.5 down to 8 pt that fits; "Whereas" starts page 2,
     which is plain A4 like the rest. */
  var FLOW = { x0: 66, x1: 529, top: 64, bottom: 780, first: 500, firstBottom: 706, num: 30, sub: 26, maxPages: 10 };
  var layoutBag = function (v, measure) {
    var D = FLOW, w = D.x1 - D.x0, ops = [], p = 0, y = D.first, s = 10.5, lh = 1.3 * s, ok = true;
    var bottom = function () { return p === 0 ? D.firstBottom : D.bottom; };
    var fill = function (t) { return t.replace(/\{(\w+)\}/g, function (m, k) { return clean(v[k] === undefined ? '' : (k === 'date' ? (K.dmy(v.date) || v.date) : v[k])).replace(/\n+/g, ', ') || '__________'; }); };
    var room = function (h) { if (y + h > bottom()) { if (p === 0) ok = false; p++; y = D.top; } };
    var put = function (t, x, f) { if (t) ops.push(Object.assign(op(t, x, y, f || 'T', s), p ? { p: p } : {})); };
    var para = function (text, x, f, label, lx, center) {
      K.wrap(fill(text), D.x1 - x, f || 'T', s, measure).forEach(function (ln, i) {
        room(lh);
        y += lh;
        if (i === 0 && label) put(label, lx, 'T');
        put(ln, center ? (D.x0 + D.x1) / 2 - measure(ln, f || 'T', s) / 2 : x, f);
      });
    };
    var block = function (b) {
      var kind = b[0];
      if (kind === 't') { para(b[2], D.x0, 'TB'); y += 0.5 * lh; return; }
      if (kind === 'c') { y += 0.25 * lh; para(b[2], D.x0, 'TB', '', 0, true); y += 0.25 * lh; return; }
      if (kind === 'h') { y += 0.6 * lh; if (y + 3 * lh > bottom()) { p++; y = D.top; } para((b[1] ? b[1] + ' ' : '') + b[2], D.x0, 'TB'); y += 0.15 * lh; return; }
      if (kind === 'p') { para(b[2], D.x0); y += 0.3 * lh; return; }
      if (kind === 'n') { para(b[2], D.x0 + D.num, 'T', b[1], D.x0); y += 0.3 * lh; return; }
      if (kind === 's') { para(b[2], D.x0 + D.num + D.sub, 'T', b[1], D.x0 + D.num); y += 0.15 * lh; return; }
      if (kind === 'sig') {
        /* Applicant and Vendor side by side, then two witnesses: kept together on one page */
        if (y + 12 * lh > bottom()) { p++; y = D.top; }
        var col = D.x0 + w / 2 + 10, line = function (x, len) { ops.push(Object.assign({ ln: [r2(x), r2(y), r2(x + len), r2(y)], w: 0.4, c: [0.45, 0.45, 0.48] }, p ? { p: p } : {})); };
        y += 3.2 * lh; line(D.x0, 170); line(col, 170);
        y += lh; put('(Applicant)', D.x0, 'TB'); put('(Vendor)', col, 'TB');
        y += lh; put(fill('{name}'), D.x0); put(fill('For {vendor_name}'), col);
        y += 2 * lh; put('Witness', D.x0, 'TB');
        y += 2.6 * lh; line(D.x0 + 14, 156); line(col + 14, 156);
        y += 0.05 * lh; put('1.', D.x0); put('2.', col);
      }
    };
    var cut = K.AGR.findIndex(function (b) { return b[0] === 'h' && b[2] === 'Whereas'; });
    /* page 1: the opening at the largest size that stays inside the stamp paper's writing band */
    var s1;
    for (s1 = 10.5; s1 >= 8; s1 -= 0.5) {
      ops = []; p = 0; y = D.first; s = s1; lh = 1.3 * s; ok = true;
      K.AGR.slice(0, cut).forEach(block);
      if (ok && p === 0) break;
    }
    var fit1 = ok && p === 0;
    /* page 2 onwards: the rest at 10.5 pt */
    p = 1; y = D.top; s = 10.5; lh = 1.3 * s;
    K.AGR.slice(cut).forEach(function (b, i) { if (i === 0 && b[0] === 'h') { para(b[2], D.x0, 'TB'); y += 0.15 * lh; return; } block(b); });
    return { ops: ops, size: Math.max(s1, 8), overflow: !fit1 || p + 1 > D.maxPages, pages: p + 1 };
  };

  /* ---- KSEB: Net Metering Agreement (the official wording, 200RS AGREEMENT.docx) ----
     Blocks: t title, p paragraph, w paragraph with its first line indented, c centred, n numbered clause, sig the closing
     "In witness whereof" with the signatures (kept together), sched the Schedule. {field} is filled in (an empty one prints a
     blank line to fill by hand); {~tag …}…{~} is a "strike out whichever is not applicable" part, struck through when any of its
     tags is chosen (flat, not nested: each marker sets the tags of the text up to the next one). */
  K.KAGR = [
    ['t', 'Net Metering Agreement for connecting solar energy system to the distribution system of the licensee'],
    ['p', 'This memorandum of agreement is made on this {date} at {place} between {name} Consumer number {consumer_no} (hereinafter referred to as ‘consumer’) residing at {address}, as first party'],
    ['c', 'AND'],
    ['w', 'The Kerala State Electricity Board Limited, a company incorporated under the Indian companies act 1956 (Central Act 1 of 1956), having its registered office at Vydyuthi Bhavanam, Pattom, Thiruvananthapuram represented by Shri Assistant Engineer, Electrical Section {section} hereinafter referred to as ‘KSEB Limited’ (which expression shall unless excluded by or repugnant to the contest or meaning thereof be deemed to include its successors, representatives and assignees ) as second party of the agreement;'],
    ['w', 'Whereas, the consumer has installed a solar energy system at the premises {~own}owned and possessed by him/her{~} {~or}or{~} {~lease}owned and possessed by consumer under a valid lease agreement{~} (strike out whichever is not applicable) and has requested KSEB Limited to provide connectivity to the said plant;'],
    ['w', 'And whereas, KSEB Limited agrees to provide to the consumer, a solar plant identification number (SPIN) {spin} as scheduled in the agreement for the electricity generated from the above plant having capacity {capacity_kw} kW as per conditions of this agreement and Kerala State Electricity Regulatory Commission (Renewable Energy & Net Metering) Regulations, 2020 as amended from time to time;'],
    ['w', 'And whereas, the consumer has in addition to those automatic and inbuilt isolation devices within inverter and external manual relays, installed a manually operated isolating switch and associated equipment with sufficient safeguards between the solar energy system and the distribution system of KSEB Limited to prevent injection of electricity from his/her solar energy system to the distribution system of the licensee when the distribution system is de-energized;'],
    ['w', 'And whereas, the consumer has assured that in case of a power outage in the system of KSEB Limited, his/her plant will not inject power into the distribution system of the licensee and has produced separately the documents substantiating this assurance which form part of this agreement, as if incorporated herein;'],
    ['w', 'And whereas, the consumer has undertaken that all the equipment connected to the distribution system comply with relevant international (IEEE/IEC) or Indian standards (BIS) and that installations of electrical equipment comply with the relevant provisions of the Central Electricity Authority (Measures relating to Safety and Electric Supply) Regulations, 2010 as amended from time to time;'],
    ['w', 'And whereas, the consumer undertakes that he/she is in possession of all the necessary approvals and clearances, including sanction from the Electrical Inspector, as specified in relevant regulations for connecting the solar energy system to the distribution system for commissioning the solar energy system;'],
    ['w', '{~rent}And whereas, the consumer shall remit the rent for {~rent rs}solar meter{~rent rand} and{~rent rn} net meter{~rent}, as applicable, charged by KSEB Limited at the rates approved by the Kerala State Electricity Regulatory Commission from time to time for the satisfactory fulfillment of this agreement.{~} [strike out this portion if the meter is provided by the consumer at his/her cost];'],
    ['w', '{~cmeter}And whereas the consumer has provided {~cmeter cs}the solar meter{~cmeter cand} and{~cmeter cn} the net meter{~cmeter} at his/her cost, which has been tested, certified and installed by KSEB Limited.{~} [strike out this portion if the meter is provided by KSEB Ltd];'],
    ['p', 'Now, therefore, both the parties hereby agree as follows:-'],
    ['n', '1.', 'The net-metering connection shall be governed by the provisions contained in the Kerala State Electricity Regulatory Commission (Renewable Energy & Net Metering) Regulations, 2020 as amended from time to time and also subject to the condition that the solar energy system meets the requirements as per the provisions contained in Central Electricity Authority (Technical Standard for Connectivity of the Distributed Generation Resources) Regulations, 2013 as amended from time to time.'],
    ['n', '2.', 'KSEB Limited shall have the sole authority to decide based on the results of necessary studies, the interface/interconnection point to the solar energy system.'],
    ['n', '3.', 'The validity of the agreement will be 25 years from the date of this agreement.'],
    ['n', '4.', 'If the consumer’s solar energy system either causes damage to and/or produces adverse effects affecting other consumers or assets of KSEB Limited, the consumer will have to disconnect solar energy system immediately from the distribution system upon direction from the KSEB Limited and correct the defect at his own expense prior to reconnection.'],
    ['n', '5.', 'KSEB Limited shall have access to the metering equipment and disconnecting means for solar energy system in all required situations.'],
    ['n', '6.', 'KSEB Limited shall have the right to disconnect solar energy system from the distribution system of the licensee in emergency, if it is found at that point of time that providing service through the net metering system is not safe to the grid as a whole.'],
    ['n', '7.', 'The consumer indemnifies KSEB Limited for the damages or adverse effects, if any, from the negligence or intentional defective operation in the connection and operation of the solar energy system of the consumer;'],
    ['n', '8.', 'KSEB Limited shall not be liable for delivery to or realization by the consumer of any fiscal or other incentives provided by the Central/State Government or any other authority;'],
    ['n', '9.', 'All the commercial settlements under this agreement shall follow the provisions of the Kerala State Electricity Regulatory Commission (Renewable Energy & Net Metering) Regulations, 2020 as amended from time to time.'],
    ['n', '10.', 'The consumer/KSEBL may terminate this agreement after giving thirty days’ (30 days) clear notice in writing to the authorized authority of the Licensee/consumer.'],
    ['n', '11.', 'KSEB Limited has the right to terminate this agreement at any point of time after giving 30 days’ prior notice if consumer breaches any terms of this agreement and in cases where such breaches could be rectified and the same are not provided/informed within 30 days of written notice from KSEB Limited about the breach.'],
    ['n', '12.', 'The consumer agrees that upon the termination of this agreement, he must disconnect the solar energy system from the distribution system of KSEB Limited in a timely manner to the satisfaction of KSEB Limited.'],
    ['n', '13.', 'The consumer shall have the right to the bank and use the electricity generated and injected in excess over his/her full consumption into the distribution system of the licensee by the solar energy system subject to the conditions specified in the Kerala State Electricity Regulatory Commission (Renewable Energy & Net Metering) Regulations, 2020 as amended from time to time.'],
    ['n', '14.', 'The consumer shall have the right for wheeling the excess electricity generated, by the solar energy system installed in the premises of the consumer (detailed under item II of the attached schedule), in accordance with Regulation 17 of KSERC (Renewable Energy & Net Metering) Regulations, 2020 as amended from time to time and shall be used in the premises owned by the consumer and in the order of preference as detailed under item III of the attached schedule.'],
    ['n', '15.', 'The licensee shall within seven days from the date of execution of this agreement, connect the solar energy system.'],
    ['n', '16.', 'The licensee shall pay for the net energy banked by the consumer at the end of the settlement period at the average pooled purchase cost of KSEB Ltd as approved by the Commission from time to time, as stated in the Kerala State Electricity Regulatory Commission (Renewable Energy & Net Metering) Regulations, 2020 as amended from time to time.'],
    ['sig', 'In witness whereof the said {name} (1st party) and the said {party2} (2nd party) have hereunto signed at the day and year first above written.'],
    ['sched']
  ];
  /* the Schedule: label | value rows; h = a section heading row; a value list is joined with '/' (e.g. consumer no./category) */
  var SCH_ROWS = [
    { h: '(I)', t: 'Particulars regarding the consumer at whose premises the solar energy system is installed' },
    ['NAME OF THE CONSUMER', 'name'], ['PERMANENT ADDRESS OF THE CONSUMER', 'address'],
    ['CONSUMER NUMBER/CODE & CATEGORY', ['consumer_no', 'category']], ['THE VOLTAGE AT WHICH SUPPLY IS AVAILED', 'voltage'],
    ['CONNECTED LOAD/CONTRACT DEMAND', 'load'],
    { h: '(II)', t: 'Details of premises where the solar energy system is installed' },
    ['ADDRESS OF THE PREMISES WHERE THE SOLAR ENERGY SYSTEM IS INSTALLED', 'site_address'], ['SOLAR METER DETAILS', ''],
    ['METER NO & MAKE', ['meter_no', 'meter_make']], ['INITIAL READING', 'meter_reading'], ['PARTICULARS OF SOLAR ENERGY SYSTEM', ''],
    ['SOLAR PLANT IDENTIFICATION NUMBER (SPIN)', 'spin'], ['THE CAPACITY OF THE SOLAR ENERGY SYSTEM', 'capacity'],
    ['NAME OF ELECTRICAL SECTION', 'section'],
    ['DETAILS OF DISTRIBUTION TRANSFORMER AND HT FEEDER (FOR HT PROSUMER) TO WHICH THE PLANT IS CONNECTED', 'transformer'],
    ['NAME OF CORPORATION/MUNICIPALITY/PANCHAYATH', 'local_body'], ['VILLAGE & SURVEY NUMBER', 'village_survey'],
    ['GPS DETAILS OF THE LOCATION', 'gps'],
    { h: '(III)', t: 'Particulars of premises to which the excess energy generated from the solar energy system detailed in (II) above is to be wheeled in accordance with KSERC (RE & Net Metering) Regulations, 2020 as amended from time to time' },
    { wheel: ['ORDER OF PREFERRED PREMISES', 'CONSUMER NUMBER OF THE PREMISES', 'TARIFF', 'NAME OF ELECTRICAL SECTION'] }
  ];
  /* the docx table: x 55-537, label | value split at 305; the wheeling table's columns at 149 / 277 / 344 */
  var SCH = { x0: 56, c: 306, x1: 539, wc: [56, 150, 278, 345, 539], pad: 4, padX: 5, minH: 19, hInd: 26, max: 10, min: 8.5 };

  /* which {~tag} parts are struck through: the premises not applicable, and the meter wording that does not apply.
     Both meters the consumer's: no rent (whole rent paragraph); both KSEB's: nothing provided (whole consumer paragraph).
     Split (usual: solar meter the consumer's, net meter KSEB's): rent "for net meter" only, "provided the solar meter" only.
     Either meter not marked: the meter paragraphs are left to strike by hand. */
  var agrStrike = function (v) {
    var S = {}, pm = trim(v.premises), sm = trim(v.meter_by), nm = trim(v.net_meter_by);
    if (pm === 'Owned') { S.or = 1; S.lease = 1; } else if (pm === 'Leased') { S.own = 1; S.or = 1; }
    if (!sm || !nm) return S;
    if (sm === 'Consumer' && nm === 'Consumer') S.rent = 1;
    else if (sm === 'KSEB' && nm === 'KSEB') S.cmeter = 1;
    else if (sm === 'Consumer') { S.rs = S.rand = 1; S.cand = S.cn = 1; }
    else { S.rn = S.rand = 1; S.cs = S.cand = 1; }
    return S;
  };
  /* filled text without markers (spaces collapsed) and, per character, whether it is struck; a space between two struck
     parts is struck too, so "or owned … agreement" gets one unbroken line */
  var agrRich = function (text, v, S) {
    var val = function (k) {
      if (k === 'date') return K.dmy(v.date) || clean(v.date);
      if (k === 'capacity_kw') return clean(v.capacity).replace(/\s*kwp?\.?$/i, '');
      return clean(v[k]);
    };
    var filled = text.replace(/\{(\w+)\}/g, function (m, k) { return val(k).replace(/\n+/g, ', ').replace(/\{~/g, '{ ~') || '__________'; });
    var plain = '', st = [], on = false;
    filled.split(/(\{~[\w ]*\})/).forEach(function (part) {
      var mk = /^\{~([\w ]*)\}$/.exec(part);
      if (mk) { on = mk[1].split(' ').some(function (t) { return t && S[t]; }); return; }
      for (var ch of part) {
        if (/\s/.test(ch)) { if (!plain || plain[plain.length - 1] === ' ') continue; ch = ' '; }
        plain += ch; st.push(on);
      }
    });
    if (plain[plain.length - 1] === ' ') { plain = plain.slice(0, -1); st.pop(); }
    for (var i = 1; i < plain.length - 1; i++) if (plain[i] === ' ' && st[i - 1] && st[i + 1]) st[i] = true;
    return { plain: plain, st: st };
  };
  /* K.wrap with a narrower first line (ind pt) */
  var wrapFirst = function (t, w, ind, f, s, measure) {
    if (!ind) return K.wrap(t, w, f, s, measure);
    var one = K.wrap(t, w - ind, f, s, measure);
    if (one.length < 2) return one;
    return [one[0]].concat(K.wrap(t.slice(one[0].length).trim(), w, f, s, measure));
  };

  var layoutAgr = function (v, measure) {
    var D = FLOW, ops = [], p = 0, y = D.first, s = 10.5, lh = 1.3 * s, ok = true, S = agrStrike(v);
    var bottom = function () { return p === 0 ? D.firstBottom : D.bottom; };
    var pg = function (o) { if (p) o.p = p; return o; };
    var room = function (h) { if (y + h > bottom()) { if (p === 0) ok = false; p++; y = D.top; } };
    var put = function (t, x, f, sz, u) { if (t) ops.push(pg(op(t, x, y, f || 'T', sz || s, u))); };
    var hline = function (x1, x2, yy, w, c) { ops.push(pg({ ln: [r2(x1), r2(yy), r2(x2), r2(yy)], w: w || 0.4, c: c })); };
    var para = function (text, x, f, label, lx, center, ind) {
      f = f || 'T';
      var R = agrRich(text, v, S), pos = 0;
      wrapFirst(R.plain, D.x1 - x, ind || 0, f, s, measure).forEach(function (ln, i) {
        room(lh); y += lh;
        if (i === 0 && label) put(label, lx, 'T');
        var x0 = center ? (D.x0 + D.x1) / 2 - measure(ln, f, s) / 2 : x + (i === 0 ? ind || 0 : 0);
        put(ln, x0, f);
        /* the struck runs of this line, found by its place in the paragraph text */
        while (R.plain[pos] === ' ') pos++;
        if (R.plain.substr(pos, ln.length) !== ln) return;
        for (var a = 0; a < ln.length;) {
          if (!R.st[pos + a]) { a++; continue; }
          var b = a; while (b < ln.length && R.st[pos + b]) b++;
          var a2 = a, b2 = b; while (ln[a2] === ' ' && a2 < b2) a2++; while (ln[b2 - 1] === ' ' && b2 > a2) b2--;
          if (b2 > a2) hline(x0 + measure(ln.slice(0, a2), f, s), x0 + measure(ln.slice(0, b2), f, s), y - 0.27 * s, 0.6);
          a = b;
        }
        pos += ln.length;
      });
    };
    var sigBlock = function (b) {
      /* "In witness whereof", then each party signs at the right with two witnesses at the left: kept on one page */
      var lines = wrapFirst(agrRich(b[1], v, S).plain, D.x1 - D.x0, 0, 'T', s, measure).length;
      if (y + (lines + 20) * lh > bottom()) { p++; y = D.top; }
      y += 0.3 * lh; para(b[1], D.x0);
      var cx = D.x1 - 200, wx = D.x0 + 52;
      [['(1st party)', clean(v.name)], ['(2nd party)', clean(v.party2)]].forEach(function (pt) {
        y += 3 * lh; hline(cx, D.x1, y, 0.4, [0.45, 0.45, 0.48]);
        y += lh; put(pt[0], cx, 'TB');
        y += lh; put(pt[1], cx);
        ['Witness 1', 'Witness 2'].forEach(function (w, i) {
          y += (i ? 2.6 : 1.8) * lh; put(w, D.x0); hline(wx, wx + 190, y + 1, 0.4, [0.45, 0.45, 0.48]);
        });
      });
    };
    var block = function (b) {
      var kind = b[0];
      if (kind === 't') { para(b[1], D.x0, 'TB'); y += 0.5 * lh; return; }
      if (kind === 'p') { para(b[1], D.x0); y += 0.45 * lh; return; }
      if (kind === 'w') { para(b[1], D.x0, 'T', '', 0, false, 35); y += 0.45 * lh; return; }
      if (kind === 'c') { para(b[1], D.x0, 'T', '', 0, true); y += 0.45 * lh; return; }
      if (kind === 'n') { para(b[2], D.x0 + 36, 'T', b[1], D.x0 + 14); y += 0.3 * lh; return; }
      if (kind === 'sig') return sigBlock(b);
    };
    var cut = K.KAGR.findIndex(function (b) { return b[0] === 'w' && /^Whereas/.test(b[1]); });
    /* page 1: the opening at the largest size that stays inside the stamp paper's writing band */
    var s1;
    for (s1 = 10.5; s1 >= 8; s1 -= 0.5) {
      ops = []; p = 0; y = D.first; s = s1; lh = 1.3 * s; ok = true;
      K.KAGR.slice(0, cut).forEach(block);
      if (ok && p === 0) break;
    }
    var fit1 = ok && p === 0;
    /* page 2 onwards at 10.5 pt; the Schedule starts a new page */
    p = 1; y = D.top; s = 10.5; lh = 1.3 * s;
    K.KAGR.slice(cut).forEach(function (b) { if (b[0] !== 'sched') block(b); });
    var sc = agrSchedule(v, p + 1, measure);
    return { ops: ops.concat(sc.ops), size: Math.max(s1, 8), overflow: !fit1 || !sc.fit, pages: sc.last + 1 };
  };

  /* the Schedule from page `first`: the title, the table and the two parties' signatures, on one page at the largest size
     from 10 to 8.5 pt that fits; a schedule too long for that (long addresses) continues over the page at 10 pt */
  var agrSchedule = function (v, first, measure) {
    var at = function (s, paged) {
      var D = SCH, F = FLOW, ops = [], p = first, lh = 1.2 * s, y, fit = true;
      var pg = function (o) { o.p = p; return o; };
      var T = function (t, x, yy, f, sz, u) { if (t) ops.push(pg(op(t, x, yy, f || 'T', sz || s, u))); };
      var L = function (x1, y1, x2, y2, c, w) { ops.push(pg({ ln: [r2(x1), r2(y1), r2(x2), r2(y2)], w: w || 0.6, c: c })); };
      var title = 'SCHEDULE to Solar Net Metering Agreement', ts = s + 4;
      T(title, (D.x0 + D.x1) / 2 - measure(title, 'T', ts) / 2, F.top + ts, 'T', ts, true);
      y = F.top + ts + 0.9 * ts;
      var segs = [], top0 = y;
      var close = function () { /* the frame of the rows drawn on this page */
        segs.forEach(function (sg) { L(D.x0, sg[0], D.x1, sg[0]); sg[2].forEach(function (x) { L(x, sg[0], x, sg[1]); }); });
        if (segs.length) L(D.x0, segs[segs.length - 1][1], D.x1, segs[segs.length - 1][1]);
        segs = [];
      };
      /* one row: cells = [[x0, x1, lines, font, align, 't' = level with the row's first line]]; height from the tallest cell, text centred vertically */
      var row = function (cells, cols) {
        var n = Math.max.apply(null, cells.map(function (c) { return c[2].length; }).concat([1]));
        var h = Math.max(D.minH, n * lh + 2 * D.pad);
        if (y + h > F.bottom) {
          if (!paged) fit = false;
          close(); p++; y = F.top;
        }
        cells.forEach(function (c) {
          var y0 = (c[5] === 't' ? y + D.pad + (h - 2 * D.pad - n * lh) / 2 : y + (h - c[2].length * lh) / 2) + 0.78 * s;
          c[2].forEach(function (ln, i) {
            var x = c[4] === 'c' ? (c[0] + c[1]) / 2 - measure(ln, c[3], s) / 2 : c[0] + D.padX;
            T(ln, x, y0 + i * lh, c[3]);
          });
        });
        segs.push([y, y + h, cols]);
        y += h;
      };
      var wr = function (t, x0, x1, f) { return t ? K.wrap(t, x1 - x0 - 2 * D.padX, f || 'T', s, measure) : []; };
      var joined = function (k) { return Array.isArray(k) ? k.map(function (x) { return clean(v[x]); }).filter(Boolean).join('/') : clean(v[k]); };
      SCH_ROWS.forEach(function (r) {
        if (r.h) {
          row([[D.x0, D.x0 + D.hInd + D.padX, [r.h], 'TB', '', 't'], [D.x0 + D.hInd, D.x1, wr(r.t, D.x0 + D.hInd, D.x1), 'T']], [D.x0, D.x1]);
        } else if (r.wheel) {
          var W = D.wc;
          row(r.wheel.map(function (t, i) { return [W[i], W[i + 1], wr(t, W[i], W[i + 1]), 'T', 'c']; }), W);
          for (var n = 1; n <= 5; n++) {
            var vals = n <= 3 ? ['PREFERENCE ' + n, clean(v['w' + n + '_no']), clean(v['w' + n + '_tariff']), clean(v['w' + n + '_section'])] : ['', '', '', ''];
            row(vals.map(function (t, i) { return [W[i], W[i + 1], wr(t, W[i], W[i + 1]), 'T']; }), W);
          }
        } else {
          row([[D.x0, D.c, wr(r[0], D.x0, D.c), 'T'], [D.c, D.x1, wr(joined(r[1]), D.c, D.x1), 'T']], [D.x0, D.c, D.x1]);
        }
      });
      close();
      /* the two parties sign below the table, as on the form */
      var need = 2 * (3.6 * lh + lh) + 2 * lh;
      if (y + need > F.bottom) { if (!paged) fit = false; p++; y = F.top; }
      var mid = (D.x0 + D.x1) / 2;
      ['1st Party', '2nd Party'].forEach(function (t) {
        y += 3.6 * lh; L(mid - 85, y, mid + 85, y, [0.45, 0.45, 0.48], 0.4);
        y += lh; T(t, mid - measure(t, 'T', s) / 2, y);
      });
      return { ops: ops, fit: fit && y <= F.bottom, last: p, top: top0 };
    };
    for (var s = SCH.max; s >= SCH.min; s -= 0.5) { var r = at(s, false); if (r.fit) return r; }
    r = at(SCH.max, true);
    return { ops: r.ops, fit: r.last - first < 3, last: r.last };
  };

  K.layout = function (docKey, values, measure) {
    values = values || {};
    if (docKey === 'bfr') return layoutBfr(values, measure);
    if (docKey === 'bag') return layoutBag(values, measure);
    if (docKey === 'agr') return layoutAgr(values, measure);
    if (docKey === 'cov') return layoutCov(values, measure);
    if (docKey === 'doi') return layoutDoi(values, measure);
    if (docKey === 'wcr') return layoutWcr(values, measure);
    if (docKey === 'chk') return layoutChk(values, measure);
    if (FORMS[docKey]) return layoutForm(docKey, values, measure);
    return { ops: [], size: 0, overflow: false };
  };

  /* template PDF + ops -> PDF bytes; every op drawn on page 0 in black.
     Saved with a classic xref table (no object streams): readable by older PDF software, and never smaller than the template. */
  K.buildPdf = function (PDFLib, templateBytes, ops) {
    ops = ops || [];
    return PDFLib.PDFDocument.load(templateBytes).then(function (doc) {
      var first = doc.getPage(0).getMediaBox(), black = PDFLib.rgb(0, 0, 0), keys = [];
      var col = function (c) { return c ? PDFLib.rgb(c[0], c[1], c[2]) : black; };
      var pageOf = function (i) { while (doc.getPageCount() <= (i || 0)) doc.addPage([first.width, first.height]); return doc.getPage(i || 0); };
      ops.forEach(function (o) { if (o.f && keys.indexOf(o.f) < 0) keys.push(o.f); });
      return Promise.all(keys.map(function (k) { return doc.embedFont(PDFLib.StandardFonts[K.FONTS[k]]); }))
        .then(function (list) {
          var fonts = {};
          keys.forEach(function (k, i) { fonts[k] = list[i]; });
          ops.forEach(function (o) {
            var page = pageOf(o.p), box = page.getMediaBox();
            if (o.rc) {
              page.drawRectangle({ x: box.x + o.rc[0], y: box.y + box.height - o.rc[1] - o.rc[3], width: o.rc[2], height: o.rc[3], color: col(o.fill) });
              return;
            }
            if (o.ln) {
              page.drawLine({ start: { x: box.x + o.ln[0], y: box.y + box.height - o.ln[1] }, end: { x: box.x + o.ln[2], y: box.y + box.height - o.ln[3] }, thickness: o.w || 0.5, color: col(o.c) });
              return;
            }
            var t = K.ansi(o.t).replace(/\n/g, ' ');
            if (!t) return;
            page.drawText(t, { x: box.x + o.x, y: box.y + box.height - o.y, size: o.s, font: fonts[o.f], color: col(o.c) });
            if (o.u) {
              var uy = box.y + box.height - o.y - 0.12 * o.s;
              page.drawLine({ start: { x: box.x + o.x, y: uy }, end: { x: box.x + o.x + fonts[o.f].widthOfTextAtSize(t, o.s), y: uy }, thickness: 0.06 * o.s + 0.2, color: col(o.c) });
            }
          });
          return doc.save({ useObjectStreams: false });
        });
    });
  };

  return K;
})();
if (typeof module !== 'undefined') module.exports = KD;
