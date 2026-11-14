// Solarize CRM - AF/RF: "feasibility (AF): N days left", then "RF paid" once the registration fee is paid — wherever a customer or project appears.
// A KSEB feasibility payment is valid for a set number of days (Settings › Rules); the registration fee has to be paid
// before it runs out. The server lists every customer whose feasibility clock is still running (fees/feas_left: paid,
// registration fee not paid yet, project not completed). Any element with data-feas="<customer id>" gets the pill;
// a MutationObserver fills pills drawn later, so a page only has to print the empty element.
const FEASX = { map: null, at: 0, busy: null, on: false,
  /* pure: wording and colour for `left` days (negative = expired); warn = days before expiry to turn red */
  text(left, warn) {
    left = Math.trunc(+left); const d = n => n + ' day' + (n === 1 ? '' : 's');
    if (left < 0) return { t: 'Feasibility expired ' + d(-left) + ' ago', c: 'r' };
    if (left === 0) return { t: 'Feasibility expires today', c: 'r' };
    return { t: 'Feasibility · ' + d(left) + ' left', c: left <= (warn == null ? 3 : warn) ? 'r' : left <= 10 ? 'y' : 'g' };
  },
  /* pure: the pill for one customer's entry f (from fees/feas_left); short = inside the AF/RF column */
  label(f, warn, short) {
    if (!f) return null;
    if (f.rf) return { t: short ? 'RF' : 'RF paid', c: 'g', i: 'check' };
    const x = FEASX.text(f.days_left, warn); x.i = 'clock';
    if (short) x.t = String(Math.trunc(+f.days_left)).replace('-', '\u2212'); /* the column: clock + days left (minus = days since it expired); the details are in the hover text */
    return x;
  } };
if (typeof module !== 'undefined') module.exports = FEASX;

const feasSpot = cid => +cid ? `<span class="fxl" data-feas="${+cid}"></span>` : ''; /* put this where the pill should appear */
const feasCol = cid => +cid ? `<span class="fxl fxc" data-feas="${+cid}" data-fxc="1"><span class="mut">—</span></span>` : '<span class="mut">—</span>'; /* the cell of an AF/RF column */
function feasPaint() {
  if (!FEASX.map) return;
  const fd = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  document.querySelectorAll('[data-feas]').forEach(el => {
    const f = FEASX.map[el.dataset.feas], col = !!el.dataset.fxc, key = f ? (f.rf ? 'rf|' + f.rf_on : f.days_left + '|' + f.expires) : '-';
    if (el.dataset.fx === key) return; el.dataset.fx = key;
    if (!f) { el.innerHTML = col ? '<span class="mut" title="Feasibility fee (AF) not paid yet">—</span>' : ''; return; }
    const x = FEASX.label(f, typeof RULE === 'function' ? RULE('feas_alert_days') : 3, col);
    const tip = f.rf ? 'Registration fee (RF) paid' + (f.rf_on ? ' on ' + fd(f.rf_on) : '')
      : `${FEASX.text(f.days_left).t}. Feasibility fee (AF) paid ${fd(f.paid_on)} · ${f.days_left < 0 ? 'expired' : 'expires'} ${fd(f.expires)}. ${f.days_left < 0 ? 'Renew the feasibility payment.' : 'Pay the KSEB registration fee (RF) before then.'}`;
    el.innerHTML = `<span class="pill ${x.c} fxp" title="${esc(tip)}"><i class="i i-${x.i}"></i>${esc(x.t)}</span>`;
  });
}
async function feasLoad(force) {
  if (!canR('customers') && !canR('projects')) return;
  if (!force && FEASX.map && Date.now() - FEASX.at < 300000) return feasPaint();
  if (!FEASX.busy) FEASX.busy = (async () => { try { FEASX.map = (await api('fees', 'feas_left')) || {}; FEASX.at = Date.now(); } catch (e) { } FEASX.busy = null; feasPaint(); })();
  return FEASX.busy;
}
/* called from boot(): load once, repaint when pages draw, refresh every 5 minutes and when the tab is looked at again */
function startFeas() {
  feasLoad(true);
  if (FEASX.on) return; FEASX.on = true;
  let t = 0; new MutationObserver(() => { clearTimeout(t); t = setTimeout(feasPaint, 80); }).observe(document.body, { childList: true, subtree: true });
  setInterval(() => { if (!document.hidden) feasLoad(); }, 300000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) feasLoad(); });
}
