/* KSEB documents: document definitions, profile defaults, saving rule, text clean-up (no DOM, no network). Browser: global KD. Node: module.exports. */
var KD = (function () {
  var K = {};
  var str = function (v) { return v == null ? '' : String(v); };
  var trim = function (v) { return str(v).trim(); };
  var isNum = function (v) { return /^\d+(\.\d+)?$/.test(trim(v)); };

  K.DOCS = {
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
        { g: 'Consumer', fields: [
          { k: 'name', l: 'Name' },
          { k: 'consumer_no', l: 'Consumer No' },
          { k: 'category', l: 'Category' },
          { k: 'phone', l: 'Phone' },
          { k: 'email', l: 'Email' },
          { k: 'address', l: 'Address', t: 'area' }
        ] },
        { g: 'Plant', fields: [
          { k: 'load', l: 'Connected load' },
          { k: 'capacity', l: 'Plant capacity' },
          { k: 'other', l: 'Use at other premises' },
          { k: 'mount', l: 'Rooftop or ground' },
          { k: 'days', l: 'Completion period' }
        ] },
        { g: 'Place and date', fields: [
          { k: 'place', l: 'Place' },
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
    if (!cap) return '';
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
    var bare = function (src, unit) { src = trim(src); return isNum(src) ? src + ' ' + unit : src; };
    var cap = function (unit) { return bare(trim(p.capacity) ? p.capacity : pr.kw, unit); };
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
    } else if (docKey === 'an1') {
      v = {
        name: trim(c.name), consumer_no: trim(c.consumer_no), category: trim(c.tariff),
        phone: trim(c.phone), email: trim(c.email), address: K.joinAddr(c),
        load: bare(c.sanctioned_load, 'kW'), capacity: cap('kWp'),
        other: 'NO', mount: 'ROOF-TOP', days: '30 DAYS',
        place: trim(c.district), date: today
      };
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
    return fieldsOf(docKey).filter(function (f) { return f.k !== 'ref' && !trim(values[f.k]); })
      .map(function (f) { return f.l; });
  };

  return K;
})();
if (typeof module !== 'undefined') module.exports = KD;
