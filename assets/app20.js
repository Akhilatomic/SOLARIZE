/* Quotation maker: pure calculations (no DOM, no network). Browser: global QM. Node: module.exports. */
var QM = (function () {
  var Q = {};
  Q.CATS = ['panels', 'inverter', 'optimiser', 'acdb', 'dcdb', 'dccable', 'accable', 'isolator', 'meter', 'parts', 'earthing', 'la', 'structure', 'install'];

  var num = function (v, d) { v = Number(v); return isFinite(v) ? v : (d || 0); };
  var r1 = function (x) { return Math.round(x * 10) / 10; };
  var str = function (v) { return v == null ? '' : String(v); };

  /* Indian digit grouping, no symbol */
  Q.inr = function (n) {
    n = Math.round(num(n));
    var neg = n < 0, s = String(Math.abs(n));
    if (s.length > 3) {
      var tail = s.slice(-3), head = s.slice(0, -3);
      s = head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + tail;
    }
    return (neg ? '-' : '') + s;
  };

  /* PMSGY subsidy on DC kWp: first 2 kW at per_kw_first2, the next 1 kW at third_kw, capped */
  Q.subsidy = function (kwp, rates) {
    kwp = num(kwp);
    var first = Math.min(kwp, 2) * num(rates.per_kw_first2);
    var third = Math.min(Math.max(kwp - 2, 0), 1) * num(rates.third_kw);
    return Math.min(Math.round(first + third), num(rates.cap));
  };

  Q.subsidyText = function (panelCount, panelWp, kwp, rates) {
    var t = 'Worked out on the DC panel capacity (' + panelCount + ' × ' + panelWp + ' Wp = ' + kwp + ' kWp): ₹' + Q.inr(rates.per_kw_first2) + ' per kW for the first 2 kW';
    if (kwp > 2) t += ', plus ₹' + Q.inr(rates.third_kw) + ' per kW for the next ' + r1(Math.min(kwp - 2, 1)) + ' kW';
    return t + '. Credited directly to the customer\'s bank account within 30 working days after commissioning.';
  };

  Q.emi = function (principal, annualRatePct, months) {
    principal = num(principal); months = num(months);
    var r = num(annualRatePct) / 1200;
    if (principal <= 0 || months <= 0) return 0;
    if (r === 0) return Math.round(principal / months);
    var f = Math.pow(1 + r, months);
    return Math.round(principal * r * f / (f - 1));
  };

  /* setup.items[cat] lines + catalogue -> printable lines per category */
  Q.resolve = function (setup, products) {
    var byId = {}, out = {};
    (products || []).forEach(function (p) { byId[p.id] = p; });
    var items = (setup && setup.items) || {};
    Q.CATS.concat(Object.keys(items).filter(function (k) { return Q.CATS.indexOf(k) < 0; })).forEach(function (cat) {
      var res = [];
      (items[cat] || []).forEach(function (it) {
        var base, o = it.over || {};
        if (it.custom) {
          var c = it.custom;
          base = { name: c.name, line: c.line, details: c.details, picture: c.picture || '', brands: c.brands || [], warranty: c.warranty || [], wp: c.wp || 0, kw: c.kw || 0, kw_line: c.kw_line ? 1 : 0, title: c.title || '', unit: c.unit || 'no', qty: 1, qty_note: '', page: c.page || '', needs_opt: 0, code: '' };
          o = {};
        } else {
          var p = byId[it.pid];
          if (!p) return;
          base = { name: p.name, line: p.line, details: p.details, picture: p.picture || '', brands: p.brands || [], warranty: p.warranty || [], wp: num(p.wp), kw: num(p.kw), kw_line: num(p.kw_line) ? 1 : 0, title: p.title || '', unit: p.unit || 'no', qty: p.qty == null ? 1 : num(p.qty), qty_note: p.qty_note || '', page: p.page || '', needs_opt: p.needs_opt || 0, code: p.code || '' };
        }
        var line = base;
        line.pid = it.pid == null ? null : it.pid;
        line.cat = cat;
        line.qty = it.qty == null ? base.qty : num(it.qty);
        if (it.qty_note != null && it.qty_note !== '') line.qty_note = it.qty_note;
        ['name', 'line', 'details'].forEach(function (k) { if (o[k] != null && o[k] !== '') line[k] = o[k]; });
        res.push(line);
      });
      if (res.length) out[cat] = res;
    });
    return out;
  };

  var firstOf = function (lines, cat) { return (lines[cat] || [])[0]; };
  var isThree = function (l) { return !!l && /three[- ]phase/i.test([l.name, l.line, l.details].join(' ')); };

  Q.calc = function (doc, lines, settings, rates) {
    doc = doc || {}; lines = lines || {}; settings = settings || {};
    var panels = lines.panels || [], inverters = lines.inverter || [];
    var panelCount = 0, wpTotal = 0;
    panels.forEach(function (l) { panelCount += num(l.qty); wpTotal += num(l.wp) * num(l.qty); });
    var panelWp = panelCount ? Math.round(wpTotal / panelCount) : 0;
    var dcKwp = r1(wpTotal / 1000);
    var plantKw = 0;
    /* product.kw is kW PER UNIT; kw_line = 1 means kw is the capacity of the whole line (a matched set, e.g. Deye 2+2+1 = 5 kW) */
    inverters.forEach(function (l) { plantKw += l.kw_line ? num(l.kw) : num(l.kw) * num(l.qty); });
    plantKw = r1(plantKw);

    var inv = inverters[0];
    var title = doc.title || (plantKw + ' kW ' + (inv && inv.title ? inv.title : 'Solar') + ' Quotation');
    var project = doc.project || (plantKw + ' kW On-grid PMSGY');

    var price = num(doc.price);
    var subsidyAuto = Q.subsidy(dcKwp, rates || {});
    var subsidy = doc.subsidy != null && doc.subsidy !== '' ? num(doc.subsidy) : subsidyAuto;
    var net = price - subsidy;

    var ks = settings.kseb || {}, kseb;
    if (doc.kseb && (Array.isArray(doc.kseb) || Array.isArray(doc.kseb.rows))) {
      var kr = (Array.isArray(doc.kseb) ? doc.kseb : doc.kseb.rows).map(function (r) { return { label: r.label, amount: num(r.amount) }; });
      kseb = { rows: kr, total: kr.reduce(function (s, r) { return s + r.amount; }, 0) };
    } else {
      var rows = [
        { label: ks.feas_label || 'KSEB Ltd. feasibility charge', amount: num(ks.feas) },
        { label: ks.reg_label || 'Registration fee', amount: Math.round(num(ks.reg_per_kw) * plantKw) },
        { label: ks.stamp_label || 'Stamp paper', amount: num(ks.stamp) },
      ];
      kseb = { rows: rows, total: rows.reduce(function (s, r) { return s + r.amount; }, 0) };
    }

    var ls = settings.loan || {}, loan = null;
    if (doc.loan) {
      var gross = price, mp = num(ls.margin_pct, 10), cap = ls.cap != null ? num(ls.cap) : 200000;
      var max90 = Math.round(gross * 0.9);
      var ln = Math.min(Math.round(gross * (100 - mp) / 100), cap);
      var after = Math.max(0, ln - subsidy);
      var rate = num(ls.rate, 6);
      loan = {
        capped: ln < max90, margin: gross - ln, loan: ln, after: after,
        min_margin: Math.round(gross * mp / 100), max90: max90, margin90: gross - max90,
        emis: (ls.months || [60, 84, 120]).map(function (m) { return { months: m, before: Q.emi(ln, rate, m), after: Q.emi(after, rate, m) }; }),
        saving: Math.floor(Math.round(dcKwp * 10) * num(ls.units_per_kwp, 1300) * Math.round(num(ls.tariff, 7) * 100) / 12000 / 10 + 1e-9) * 10,
      };
    }

    var warranties = [], feature = [];
    Q.CATS.forEach(function (cat) {
      (lines[cat] || []).forEach(function (l) {
        (l.warranty || []).forEach(function (w) { warranties.push({ years: str(w.years), label: w.label }); });
        if (l.page && feature.indexOf(l.page) < 0) feature.push(l.page);
      });
    });

    var phase = isThree(firstOf(lines, 'meter')) || (!firstOf(lines, 'meter') && isThree(inv)) ? 'three-phase' : 'single-phase';

    return {
      panelCount: panelCount, panelWp: panelWp, dcKwp: dcKwp, plantKw: plantKw, title: title, project: project,
      subsidy: subsidy, subsidyAuto: subsidyAuto, net: net, kseb: kseb,
      pay: doc.pay || settings.pay || [], loan: loan, warranties: warranties,
      pages: { loan: !!doc.loan, feature: feature }, phase: phase,
    };
  };

  /* display strings for placeholders in the loan texts and terms */
  Q.vars = function (calc, doc, settings) {
    doc = doc || {}; settings = settings || {};
    var ls = settings.loan || {}, l = calc.loan;
    var rs = function (n) { return '₹' + Q.inr(n); };
    var v = {
      rate: num(ls.rate, 6).toFixed(2), margin_pct: String(num(ls.margin_pct, 10)),
      subsidy: rs(calc.subsidy), gross: rs(doc.price),
      kwp: String(calc.dcKwp), units: Q.inr(ls.units_per_kwp == null ? 1300 : ls.units_per_kwp), tariff: String(num(ls.tariff, 7)),
      phase: calc.phase || 'single-phase',
      days: String(doc.valid_days != null && doc.valid_days !== '' ? doc.valid_days : (settings.valid_days == null ? '' : settings.valid_days)),
    };
    if (l) { v.min_margin = rs(l.min_margin); v.after = rs(l.after); v.loan = rs(l.loan); v.max90 = rs(l.max90); v.margin90 = rs(l.margin90); }
    return v;
  };

  Q.fill = function (text, vars) {
    return str(text).replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(vars || {}, k) ? vars[k] : m; });
  };

  Q.qtyText = function (line, opts) {
    var qty = num(line.qty), unit = str(line.unit) || 'no', main, note = str(line.qty_note);
    if (qty === 0) main = unit;
    else if (unit === 'no') main = qty + (qty > 1 ? ' nos' : ' no');
    else if (unit === 'm + m') main = qty + ' m + ' + qty + ' m';
    else main = qty + ' ' + unit;
    if (!note && opts && opts.dcKwp != null && num(line.wp) > 0) {
      note = opts.dcKwp + (/\+ Wp/.test(str(line.name) + ' ' + str(line.details)) ? '+ kWp' : ' kWp');
    }
    return { main: main, note: note };
  };

  return Q;
})();
if (typeof module !== 'undefined') module.exports = QM;
