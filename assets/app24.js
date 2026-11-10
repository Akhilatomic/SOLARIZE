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
    } else if (docKey === 'an1') {
      v = {
        name: trim(c.name), consumer_no: trim(c.consumer_no), category: trim(c.tariff),
        phone: trim(c.phone), email: trim(c.email), address: K.joinAddr(c),
        load: bare(c.sanctioned_load, 'kW'), capacity: cap('kWp'),
        other: 'NO', mount: (p.rooftop_type === 'Ground' || p.structure_type === 'Ground mount') ? 'GROUND MOUNTED' : 'ROOF-TOP', days: '30 DAYS',
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

  /* ---- page layout and PDF writing. Positions in pt from the page's top-left; y is the baseline. ---- */
  /* the template files are cached for 30 days: a replaced template must get a new file name */
  K.PAGES = {
    letterhead: { pdf: 'assets/kseb/letterhead.pdf', png: 'assets/kseb/letterhead.png', w: 595.92, h: 841.92 },
    an1: { pdf: 'assets/kseb/annexure-1.pdf', png: 'assets/kseb/annexure-1.png', w: 595.32, h: 841.92 }
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
  var op = function (t, x, y, f, s) { return { t: t, x: r2(x), y: r2(y), f: f, s: s }; };

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

  /* Annexure 1 (KSEB form). Table rules measured on the form: value column x 369.5-553.8, row lines below.
     Place / Date labels (FML-TTIndulekha 14 pt, PyMuPDF rawdict on assets/kseb/annexure-1.pdf): the colon glyphs
     end at x 130.56 / 130.08, baselines 413.33 / 427.85; values start 6 pt after the colon. */
  var AN1 = {
    x0: 369.5, x1: 553.8, pad: 5, max: 10.5, min: 6,
    rows: [['r1', 155.7, 233.7], ['load', 233.7, 256.1], ['capacity', 256.1, 285.5], ['other', 285.5, 343.8], ['mount', 343.8, 380.3], ['days', 380.3, 402]],
    r1: ['name', 'consumer_no', 'category', 'phone', 'email', 'address'],
    labelX: 136.6, placeY: 413.33, dateY: 427.85, labelRight: 364.5
  };

  /* paragraphs in Helvetica, left-aligned, block centred vertically, largest size 10.5 -> 6 that fits the cell */
  var an1Cell = function (paras, top, bottom, measure, lh) {
    lh = lh || 1.2;
    var x = AN1.x0 + AN1.pad, w = AN1.x1 - AN1.x0 - 2 * AN1.pad, room = bottom - top - 2 * AN1.pad;
    var lines, s, bh, fit = false;
    for (s = AN1.max; s >= AN1.min; s -= 0.5) {
      lines = [];
      paras.forEach(function (p) { lines = lines.concat(K.wrap(p, w, 'H', s, measure)); });
      bh = (lines.length - 1) * lh * s + s;
      if (bh <= room) { fit = true; break; }
    }
    if (!fit) s = AN1.min;
    var y0 = top + (bottom - top - bh) / 2 + 0.8 * s, ops = [];
    lines.forEach(function (line, i) { if (line) ops.push(op(line, x, y0 + i * lh * s, 'H', s)); });
    return { ops: ops, s: s, fit: fit };
  };

  var layoutAn1 = function (v, measure) {
    var ops = [], ok = true, size = AN1.max;
    AN1.rows.forEach(function (row) {
      var paras = row[0] === 'r1'
        ? AN1.r1.map(function (k) { return (labelOf('an1', k) + ': ' + clean(v[k])).trim(); })
        : (clean(v[row[0]]) ? [clean(v[row[0]])] : []);
      if (!paras.length) return;
      var c = an1Cell(paras, row[1], row[2], measure, row[0] === 'r1' ? 1.1 : 1.2);
      ops = ops.concat(c.ops);
      ok = ok && c.fit;
      size = Math.min(size, c.s);
    });
    [[clean(v.place), AN1.placeY], [K.dmy(v.date) || clean(v.date), AN1.dateY]].forEach(function (p) {
      if (!p[0]) return;
      var r = fitOne(p[0], 'H', AN1.max, AN1.min, AN1.labelRight - AN1.labelX, measure);
      ok = ok && r.fit;
      ops.push(op(p[0], AN1.labelX, p[1], 'H', r.s));
    });
    return { ops: ops, size: size, overflow: !ok };
  };

  K.layout = function (docKey, values, measure) {
    values = values || {};
    if (docKey === 'wcr') return layoutWcr(values, measure);
    if (docKey === 'an1') return layoutAn1(values, measure);
    return { ops: [], size: 0, overflow: false };
  };

  /* template PDF + ops -> PDF bytes; every op drawn on page 0 in black.
     Saved with a classic xref table (no object streams): readable by older PDF software, and never smaller than the template. */
  K.buildPdf = function (PDFLib, templateBytes, ops) {
    ops = ops || [];
    return PDFLib.PDFDocument.load(templateBytes).then(function (doc) {
      var page = doc.getPage(0), box = page.getMediaBox(), black = PDFLib.rgb(0, 0, 0), keys = [];
      ops.forEach(function (o) { if (keys.indexOf(o.f) < 0) keys.push(o.f); });
      return Promise.all(keys.map(function (k) { return doc.embedFont(PDFLib.StandardFonts[K.FONTS[k]]); }))
        .then(function (list) {
          var fonts = {};
          keys.forEach(function (k, i) { fonts[k] = list[i]; });
          ops.forEach(function (o) {
            var t = K.ansi(o.t).replace(/\n/g, ' ');
            if (t) page.drawText(t, { x: box.x + o.x, y: box.y + box.height - o.y, size: o.s, font: fonts[o.f], color: black });
          });
          return doc.save({ useObjectStreams: false });
        });
    });
  };

  return K;
})();
if (typeof module !== 'undefined') module.exports = KD;
