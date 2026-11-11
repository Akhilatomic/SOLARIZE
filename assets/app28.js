/* Profile pages: the page model (pure, no DOM, no network). Which details sit on which page, which papers use them, and which empty ones are due now. */
var PFP = (function () {
  var ALL = ['cov', 'req', 'wcr', 'an1', 'an2', 'an3', 'doi', 'agr', 'chk', 'bfr', 'bag'];
  var NOCHK = ALL.filter(function (d) { return d !== 'chk'; });
  var ANX = ['an1', 'an2', 'an3'];
  var BANK_ONLY = ['bfr', 'bag'];

  /* f(key, label, scope, docs, extra) */
  function f(k, l, s, docs, x) {
    var o = { k: k, l: l, s: s, docs: docs || [], due: '' };
    if (x) for (var i in x) o[i] = x[i];
    return o;
  }
  var OPT = { opt: true };
  var TARIFF = [['', ''], ['LT-1A Domestic', 'LT-1A Domestic'], ['LT-6 Non-domestic', 'LT-6 Non-domestic'], ['LT-7 Commercial', 'LT-7 Commercial'], ['LT-4 Industrial', 'LT-4 Industrial'], ['Other', 'Other']];
  var PHASE = [['', ''], ['Single phase', 'Single phase'], ['Three phase', 'Three phase']];
  var PREM = [['', ''], ['Owned', 'Owned'], ['Leased', 'Leased']];

  function ext() { var o = {}; for (var a = 0; a < arguments.length; a++) for (var i in arguments[a]) o[i] = arguments[a][i]; return o; }
  function due(d, x) { return ext({ due: d }, x); }

  var PAGES = [
    { key: 'kseb', tab: 'KSEB connection', icon: 'gauge', sections: [{ paper: 'KSEB bill', fields: [
      f('name', 'Consumer name (exactly as on the KSEB bill — printed on every document)', 'c', ALL, { hi: true }),
      f('consumer_no', 'Consumer no.', 'c', ALL),
      f('kseb_section', 'KSEB section', 'c', ['cov', 'req', 'wcr', 'doi', 'agr', 'chk']),
      f('kseb_subdivision', 'Sub division', 'c', ['cov', 'doi']),
      f('kseb_division', 'Division', 'c', ['cov', 'doi']),
      f('kseb_circle', 'Circle', 'c', []),
      f('tariff', 'Tariff', 'c', ['cov'].concat(ANX, ['doi', 'agr']), { t: 'opts', opts: TARIFF }),
      f('phase', 'Phase', 'c', ['wcr', 'cov', 'doi', 'agr'], { t: 'opts', opts: PHASE }),
      f('sanctioned_load', 'Connected load (kW)', 'c', ['cov', 'an1', 'an2', 'doi', 'agr'], { t: 'num' }),
      f('meter_no', 'KSEB meter no.', 'c', []),
      f('transformer', 'Transformer', 'c', ['agr']),
      f('pole_no', 'Pole no.', 'c', [], OPT),
      f('address', 'Address', 'c', NOCHK, { t: 'area' }),
      f('district', 'District', 'c', NOCHK),
      f('pincode', 'PIN code', 'c', NOCHK),
      f('local_body', 'Panchayath / municipality', 'c', ['agr']),
      f('village_survey', 'Village & survey no.', 'c', ['agr']),
      f('premises', 'Premises', 'c', ['agr'], { t: 'opts', opts: PREM, opt: true })
    ] }] },
    { key: 'contact', tab: 'Personal & contact', icon: 'user', sections: [{ paper: 'Aadhaar / PAN', fields: [
      f('phone', 'Phone', 'c', ['cov', 'req', 'wcr'].concat(ANX, ['doi'])),
      f('alt_phone', 'Alternate phone', 'c', ['cov', 'doi'], OPT),
      f('email', 'Email', 'c', ['cov'].concat(ANX, ['doi']), OPT),
      f('aadhaar_no', 'Aadhaar no.', 'c', [], OPT),
      f('pan_no', 'PAN no.', 'c', [], OPT),
      f('gst_no', 'GST no.', 'c', [], OPT),
      f('lead_type', 'Lead type', 'c', [], { t: 'opts' }),
      f('landmark', 'Landmark', 'c', [], OPT),
      f('notes', 'Notes', 'c', [], { t: 'area', opt: true }),
      f('gps', 'GPS location', 'c', ['agr'], { ro: true })
    ] }] },
    { key: 'reg', tab: 'Registration & feasibility', icon: 'clipboard', sections: [
      { paper: 'MNRE application acknowledgement & e-token', fields: [
        f('application_no', 'Application no.', 'p', ['cov', 'bfr'], due('pmsg')),
        f('application_date', 'Application date', 'p', ['cov'], due('pmsg', { t: 'date' })),
        f('applied_kw', 'Applied capacity (kW)', 'p', [], due('pmsg', { t: 'num', opt: true })),
        f('etoken_id', 'E-token ID', 'p', [], due('pmsg', OPT)),
        f('subsidy_amount', 'Eligible subsidy', 'j', [], due('pmsg', { t: 'num', perm: 'fin' }))
      ] },
      { paper: 'KSEB feasibility approval', fields: [
        f('approved_kw', 'Approved capacity (kW)', 'p', [], due('feasibility', { t: 'num', opt: true })),
        f('approved_on', 'Approved on', 'p', [], due('feasibility', { t: 'date', opt: true }))
      ] },
      { paper: 'KSEB registration & commissioning', fields: [
        f('kseb_reg_no', 'KSEB registration no.', 'p', ['cov', 'an3'], due('reg_pay')),
        f('spin', 'SPIN', 'p', ['agr'], due('electrical', OPT)),
        f('installed_on', 'Installed on', 'p', ['cov'], due('electrical', { t: 'date', opt: true })),
        f('inspected_on', 'Inspected on', 'p', [], due('inspection', { t: 'date', opt: true })),
        f('netmeter_on', 'Net meter on', 'p', [], due('netmeter', { t: 'date', opt: true })),
        f('commissioned_on', 'Commissioned on', 'p', [], due('netmeter', { t: 'date', opt: true }))
      ] }
    ] },
    { key: 'bank', tab: 'Bank & loan', icon: 'bank', sections: [
      { paper: 'Passbook (subsidy account)', fields: [
        f('bank_holder', 'Account holder', 'c', ['cov', 'doi'], due('kseb_docs')),
        f('bank_name', 'Bank', 'c', ['cov', 'doi'], due('kseb_docs')),
        f('bank_branch', 'Branch', 'c', ['cov', 'doi'], due('kseb_docs')),
        f('bank_account', 'Account no.', 'c', ['cov', 'doi'], due('kseb_docs')),
        f('bank_ifsc', 'IFSC', 'c', ['cov', 'doi'], due('kseb_docs'))
      ] },
      { paper: 'Loan papers (Jan Samarth)', fields: [
        f('jansamarth_id', 'Jan Samarth ID', 'c', ['bfr'], due('loan', { perm: 'loans' })),
        f('loan_bank', 'Loan bank', 'c', [], due('loan', { perm: 'loans' })),
        f('loan_branch', 'Loan branch', 'c', [], due('loan', { perm: 'loans', opt: true })),
        f('loan_amount', 'Loan amount', 'c', [], due('loan', { perm: 'loans', t: 'num' })),
        f('loan_sanctioned_on', 'Sanctioned on', 'c', [], due('loan', { perm: 'loans', t: 'date' }))
      ] }
    ] },
    { key: 'plant', tab: 'Plant details', icon: 'sun', sections: [{ paper: 'Plant details', fields: [
      f('capacity', 'Solar capacity (kWp)', 'p', ['cov', 'wcr', 'an1', 'an2', 'an3', 'doi', 'agr', 'bfr', 'bag'], due('electrical', { t: 'num' })),
      f('panel_make', 'Panel make', 'p', ['cov', 'wcr', 'bag'], due('electrical')),
      f('panel_type', 'Panel type', 'p', ['cov', 'wcr'], due('electrical')),
      f('panel_wattage', 'Panel wattage (W)', 'p', ['cov', 'wcr', 'doi', 'bag'], due('electrical', { t: 'num' })),
      f('panel_count', 'Number of panels', 'p', ['cov', 'doi'], due('electrical', { t: 'num' })),
      f('panel_model', 'Panel model no.', 'p', ['bag'], due('electrical')),
      f('panel_efficiency', 'Panel efficiency (%)', 'p', ['bag'], due('electrical', { t: 'num' })),
      f('inverter_make', 'Inverter make', 'p', ['cov', 'wcr', 'doi', 'bag'], due('electrical')),
      f('inverter_capacity', 'Inverter capacity (kW)', 'p', ['cov', 'wcr', 'doi'], due('electrical', { t: 'num' })),
      f('inverter_dc_voltage', 'Inverter DC voltage (V)', 'p', ['doi'], due('electrical', { t: 'num' })),
      f('meter_make', 'Meter make', 'p', ['agr'], due('inspection')),
      f('meter_serial', 'Meter serial no.', 'p', ['agr'], due('inspection')),
      f('meter_reading', 'Meter reading', 'p', ['agr'], due('inspection', { t: 'num' })),
      f('cell_invoice_no', 'Cell invoice no.', 'p', ['cov'], due('delivery')),
      f('panel_serials', 'Panel serial numbers', 'p', ['cov'], due('electrical', { ro: true })),
      f('inverter_serials', 'Inverter serial numbers', 'p', ['cov', 'wcr', 'doi'], due('electrical', { ro: true }))
    ] }] }
  ];

  function s(v) { return v == null ? '' : String(v).trim(); }

  function serialsOk(list, count) {
    var n = parseInt(count, 10) || 0;
    if (!list || !list.length || list.length < n) return '';
    for (var i = 0; i < list.length; i++) if (!s(list[i] && list[i].serial)) return '';
    return 'ok';
  }

  function docsFor(fl, ctx) {
    var loan = !!(ctx && ctx.j && ctx.j.loan === 'Yes');
    return fl.docs.filter(function (d) { return loan || BANK_ONLY.indexOf(d) < 0; });
  }

  function value(fl, ctx) {
    var c = ctx.c || {}, p = ctx.p || {}, j = ctx.j || {};
    if (fl.k === 'gps') {
      var la = s(c.lat), ln = s(c.lng);
      if (!la || !ln || (+la === 0 && +ln === 0)) return '';
      return la + ',' + ln;
    }
    if (fl.k === 'panel_serials') return serialsOk(p.panels, p.panel_count);
    if (fl.k === 'inverter_serials') return serialsOk(p.inverters, p.inverter_count);
    if (fl.k === 'application_no') return s(p.application_no) || s(j.application_no);
    var src = fl.s === 'c' ? c : fl.s === 'j' ? j : p;
    if (fl.k === 'sanctioned_load' && fl.s === 'c' && !(parseFloat(s(src[fl.k])) > 0)) return '';
    return s(src[fl.k]);
  }

  function isDue(fl, ctx) {
    if (fl.due === '') return true;
    var pipe = ctx.pipe || [], prog = ctx.prog;
    if (!prog || pipe.indexOf(prog.key) < 0) return false;
    if (fl.perm === 'loans' && (!ctx.j || ctx.j.loan !== 'Yes')) return false;
    return pipe.indexOf(prog.key) > pipe.indexOf(fl.due);
  }

  function allowed(fl, ctx) { return !fl.perm || (ctx.can ? !!ctx.can(fl.perm) : true); }

  function pageOf(key) { for (var i = 0; i < PAGES.length; i++) if (PAGES[i].key === key) return PAGES[i]; return null; }

  function missing(pageKey, ctx) {
    var pg = pageOf(pageKey), out = [];
    if (!pg) return out;
    pg.sections.forEach(function (sec) {
      sec.fields.forEach(function (fl) {
        var dd = docsFor(fl, ctx);
        if (dd.length && !fl.opt && !value(fl, ctx) && isDue(fl, ctx) && allowed(fl, ctx)) out.push({ k: fl.k, l: fl.l, docs: dd });
      });
    });
    return out;
  }

  function later(fl, ctx) {
    return docsFor(fl, ctx).length > 0 && !value(fl, ctx) && !isDue(fl, ctx);
  }

  function counts(ctx) {
    var o = {};
    PAGES.forEach(function (pg) { o[pg.key] = missing(pg.key, ctx).length; });
    return o;
  }

  function diff(pageKey, ctx, form) {
    var pg = pageOf(pageKey), out = {};
    if (!pg || !form) return out;
    pg.sections.forEach(function (sec) {
      sec.fields.forEach(function (fl) {
        if (fl.ro || !Object.prototype.hasOwnProperty.call(form, fl.k)) return;
        var v = s(form[fl.k]);
        if (v.indexOf('•') >= 0) return;
        if (v !== value(fl, ctx)) out[fl.k] = v;
      });
    });
    return out;
  }

  return { PAGES: PAGES, docsFor: docsFor, value: value, isDue: isDue, missing: missing, later: later, counts: counts, diff: diff };
})();
if (typeof module !== 'undefined') module.exports = PFP;
