/* Signed quotations: client rules (badge state, who may do what, share targets, message templates). No DOM, no network. Browser: global QSIGN. Node: module.exports. */
var QSIGN = (function () {
  var Q = {};
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var str = function (v) { return v == null ? '' : String(v); };
  var has = function (v) { return str(v).trim() !== ''; };

  /* 'YYYY-MM-DD HH:MM:SS' -> '26 Nov' (date part as written, no timezone shift) */
  var dayMon = function (at) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(at));
    if (!m) return '';
    var mo = parseInt(m[2], 10);
    if (mo < 1 || mo > 12) return '';
    return parseInt(m[3], 10) + ' ' + MON[mo - 1];
  };

  /* sign: server sign object (or {state, signed_at} mapped from a list row) -> badge */
  Q.state = function (sign) {
    var s = sign || {};
    if (s.state === 'signed') {
      var d = dayMon(s.signed_at);
      return { k: 'signed', label: 'Signed & sealed' + (d ? ' · ' + d : ''), cls: 'g' };
    }
    if (s.state === 'waiting') return { k: 'waiting', label: 'Waiting for signature', cls: 'a' };
    return { k: '', label: '', cls: '' };
  };

  /* sign: sign object; me: {id, role}; q: quotation row (q.maker truthy or non-empty q.doc = has a maker doc);
     canW: boolean, the user has Quotations edit. Returns which buttons to show. */
  Q.can = function (sign, me, q, canW) {
    var s = sign || {}, u = me || {}, row = q || {};
    var k = Q.state(s).k;
    var admin = u.role === 'admin';
    var hasDoc = !!row.maker || has(row.doc);
    return {
      ask: !!canW && !admin && k === '' && hasDoc,
      cancel: k === 'waiting' && (admin || (u.id != null && str(u.id) === str(s.req_by))),
      sign: admin && k !== 'signed',
      make: admin && !!s.sealed && k !== 'signed',
      share: k === 'signed'
    };
  };

  /* ctx: {phone, email, bank_phone, bank_email, is_customer, loans} -> the four share buttons */
  Q.targets = function (ctx) {
    var c = ctx || {};
    var cust = function (via, addr, none) {
      var ok = has(addr);
      return { via: via, to_whom: 'customer', addr: str(addr).trim(), ok: ok, why: ok ? '' : none };
    };
    var bank = function (via, addr) {
      var why = '';
      if (!c.is_customer) why = 'Only for customers';
      else if (!c.loans) why = 'Needs access to Loans';
      else if (!has(addr)) why = 'Add it on the Bank & loan page';
      return { via: via, to_whom: 'bank', addr: str(addr).trim(), ok: why === '', why: why };
    };
    return [
      cust('whatsapp', c.phone, 'No phone number'),
      cust('email', c.email, 'No email'),
      bank('whatsapp', c.bank_phone),
      bank('email', c.bank_email)
    ];
  };

  /* replace {key} with vars[key]; missing or null becomes ''. Plain text substitution only. */
  Q.fill = function (tpl, vars) {
    var v = vars || {};
    return str(tpl).replace(/\{(\w+)\}/g, function (_, key) {
      return Object.prototype.hasOwnProperty.call(v, key) ? str(v[key]) : '';
    });
  };

  return Q;
})();
if (typeof module !== 'undefined') module.exports = QSIGN;
