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
    } else if (docKey === 'cov') {
      var cph = trim(c.phase) || trim(p.inverter_type), csg = /single/i.test(cph), cth = /three/i.test(cph);
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
        inv_phase: csg ? 'Single' : cth ? 'Three' : '',
        inv_capacity: caps.length > 1 ? caps.map(function (x) { return isNum(x) ? x + ' KW' : x; }).join(', ') : K.invCapacity(p.inverter_capacity, p.inverter_count),
        cell_invoice: trim(p.cell_invoice_no), app_no: trim(p.application_no), app_date: dot(p.application_date),
        kseb_reg: trim(p.kseb_reg_no),
        meter: [trim(p.meter_make), trim(p.meter_serial) ? 'S/N: ' + trim(p.meter_serial) : ''].filter(Boolean).join(' '),
        installed: dot(trim(p.installed_on) || trim(p.commissioned_on))
      };
    } else if (docKey === 'doi') {
      var phs = trim(c.phase) || trim(p.inverter_type), one = /single/i.test(phs), three = /three/i.test(phs);
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
        inv_phase: one ? 'Single Phase' : three ? 'Three Phase' : '',
        inv_capacity: K.invCapacity(p.inverter_capacity, p.inverter_count),
        dc_voltage: bare(p.inverter_dc_voltage, 'Vdc'),
        ac_voltage: one ? '230V, 1 Phase' : three ? '415V, 3 Phase' : '',
        /* the checklist answers and inverter settings the office normally gives (as on the KSEB sample) */
        hybrid: '', completion: '', energ: 'Not Applicable', energ_details: '',
        dc_isolator: 'Yes', visual_isolator: 'Yes', wiring: 'Yes', earthing: 'Yes', protection: 'Yes',
        volt_trip: 'Yes', ov_set: '264', uv_set: '192', v_time: '200ms',
        freq_trip: 'Yes', of_set: '50.5', uf_set: '47.5', f_time: '200ms',
        islanding: 'Yes', grid_trip: '2 seconds', reenergise: 'Yes', re_delay: '60 seconds',
        date: today
      };
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

  K.layout = function (docKey, values, measure) {
    values = values || {};
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
