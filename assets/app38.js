// Solarize CRM - signs you out after a stretch with no activity (Settings › Rules: idle_min, 30 minutes), with a countdown first.
// "Activity" = mouse, keyboard, touch or scroll in ANY open CRM tab (the last-used time is shared through localStorage),
// so working in one tab keeps the others signed in, and signing out in one signs out all of them.
const IDLE = { KEY: 'idleLast', OUT: 'idleOut', SAID: 'idleSaid', WARN: 60, last: 0, wrote: 0, t: 0, el: null, on: false, busy: false,
  /* pure: seconds left and what to show at `now` (ms) when the CRM was last used at `last` (ms) */
  state(now, last, limMin, warnSec) { const left = Math.ceil((last + limMin * 60000 - now) / 1000); return { left, st: left <= 0 ? 'out' : left <= warnSec ? 'warn' : 'ok' }; },
  clock(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); } };
if (typeof module !== 'undefined') module.exports = IDLE;

const idleGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const idleSet = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { } };
const idleMin = () => (typeof RULE === 'function' ? RULE('idle_min') : 30) || 30;
function idleMark(force) {
  if (IDLE.busy) return;
  const now = Date.now(); IDLE.last = now;
  if (force || now - IDLE.wrote > 5000) { IDLE.wrote = now; idleSet(IDLE.KEY, String(now)); } /* at most one write every 5 s */
  if (IDLE.el) idleHide();
}
function idleHide() { if (IDLE.el) { IDLE.el.remove(); IDLE.el = null; } }
function idleShow(left) {
  if (!IDLE.el) {
    const d = document.createElement('div'); d.className = 'idlw'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-live', 'assertive');
    d.innerHTML = `<div class="idlw-c"><div class="idlw-n" id="idlwn"></div><h3>Still there?</h3><p>No activity for ${idleMin()} minutes. You will be signed out when the time runs out.</p>
      <div class="idlw-b"><button class="btn" id="idlws" type="button">Stay signed in</button><button class="btn sec" id="idlwo" type="button">Sign out now</button></div></div>`;
    document.body.appendChild(d); IDLE.el = d;
    d.querySelector('#idlws').onclick = () => idleMark(true);
    d.querySelector('#idlwo').onclick = e => { e.stopPropagation(); idleOut(false); };
  }
  IDLE.el.querySelector('#idlwn').textContent = IDLE.clock(left);
}
async function idleOut(auto) {
  if (IDLE.busy) return; IDLE.busy = true; clearInterval(IDLE.t);
  try { if (auto) sessionStorage.setItem(IDLE.SAID, String(idleMin())); } catch (e) { }
  idleSet(IDLE.KEY, null); idleSet(IDLE.OUT, String(Date.now())); /* the other tabs go back to the sign-in page too */
  try { await api('auth', 'logout', {}); } catch (e) { }
  location.hash = ''; location.reload();
}
function idleTick() {
  if (IDLE.busy) return;
  if (typeof FMU !== 'undefined' && FMU.busy) idleMark(); /* a running upload counts as using the CRM */
  const last = Math.max(IDLE.last, +idleGet(IDLE.KEY) || 0), s = IDLE.state(Date.now(), last, idleMin(), IDLE.WARN);
  if (s.st === 'out') return idleOut(true);
  if (s.st === 'warn') idleShow(s.left); else idleHide();
}
/* called from boot() once signed in; true = the last use was too long ago (browser left open or closed), signing out now */
function startIdle() {
  const old = +idleGet(IDLE.KEY) || 0;
  if (old && IDLE.state(Date.now(), old, idleMin(), IDLE.WARN).st === 'out') { idleOut(true); return true; }
  idleMark(true);
  if (!IDLE.on) { IDLE.on = true;
    ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(ev => addEventListener(ev, () => idleMark(), { passive: true, capture: true }));
    addEventListener('storage', e => { if (e.key === IDLE.OUT && e.newValue && !IDLE.busy) { IDLE.busy = true; location.hash = ''; location.reload(); } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) idleTick(); }); } /* timers slow down in a hidden tab: check the moment it is looked at again */
  clearInterval(IDLE.t); IDLE.t = setInterval(idleTick, 1000);
  return false;
}
/* called from boot() on the sign-in page: forget the last-used time (a new sign-in starts fresh) and say why the page is here */
function idleSignedOut() {
  idleSet(IDLE.KEY, null);
  let n = ''; try { n = sessionStorage.getItem(IDLE.SAID) || ''; sessionStorage.removeItem(IDLE.SAID); } catch (e) { }
  if (n && typeof toast === 'function') toast(`You were signed out after ${n} minutes without activity`);
}
