// Solarize CRM - "feasibility: N days left" shown wherever a customer or project appears.
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
  } };
if (typeof module !== 'undefined') module.exports = FEASX;

const feasSpot = cid => +cid ? `<span class="fxl" data-feas="${+cid}"></span>` : ''; /* put this where the pill should appear */
function feasPaint() {
  if (!FEASX.map) return;
  const fd = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  document.querySelectorAll('[data-feas]').forEach(el => {
    const f = FEASX.map[el.dataset.feas], key = f ? f.days_left + '|' + f.expires : '';
    if (el.dataset.fx === key) return; el.dataset.fx = key;
    if (!f) { el.innerHTML = ''; return; }
    const x = FEASX.text(f.days_left, typeof RULE === 'function' ? RULE('feas_alert_days') : 3);
    const tip = `Feasibility paid ${fd(f.paid_on)} · ${f.days_left < 0 ? 'expired' : 'expires'} ${fd(f.expires)}. ${f.days_left < 0 ? 'Renew the feasibility payment.' : 'Pay the KSEB registration fee before then.'}`;
    el.innerHTML = `<span class="pill ${x.c} fxp" title="${esc(tip)}"><i class="i i-clock"></i>${esc(x.t)}</span>`;
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
