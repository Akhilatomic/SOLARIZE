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
    d.innerHTML = `<div class="idlw-c"><button type="button" class="mdx" id="idlwx" title="Close — stay signed in" aria-label="Close and stay signed in"><i class="i i-x"></i></button><div class="idlw-n" id="idlwn"></div><h3>Still there?</h3><p>No activity for ${idleMin()} minutes. You will be signed out when the time runs out.</p>
      <div class="idlw-b"><button class="btn" id="idlws" type="button">Stay signed in</button><button class="btn sec" id="idlwo" type="button">Sign out now</button></div></div>`;
    document.body.appendChild(d); IDLE.el = d;
    d.querySelector('#idlws').onclick = () => idleMark(true);
    d.querySelector('#idlwx').onclick = () => idleMark(true); /* closing the warning = you are here: stay signed in */
    d.querySelector('#idlwo').onclick = e => { e.stopPropagation(); idleOut(false, true); };
  }
  IDLE.el.querySelector('#idlwn').textContent = IDLE.clock(left);
}
/* Sign-out goodbye (owner, 2026-11-22: "introduce sign out animation"), played only when someone signs out by hand: the page behind
   softly blurs back, the user's picture appears with a ring that closes around it under "Hasta la vista, <first name>", "Signing
   out…" turns into "Signed out", then the sign-in page comes in with its own fade. About 0.9 s; the sign-out request is already on its way, so closing the window during it
   still signs out. window.SGO stops a 401 from a page poll (app.js api) or a tab frame (TABS.signedOut) from cutting it short.
   Skipped when the computer asks for less motion. */
function sgoShow() {
  return new Promise(done => {
    let calm = false; try { calm = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }
    if (calm || !document.body) return done();
    const me = typeof ME !== 'undefined' && ME ? ME : {}, first = String(me.name || '').trim().split(/\s+/)[0] || '';
    const pic = typeof avImg === 'function' ? avImg(me.id, me.avatar, me.name) : '';
    const d = document.createElement('div'); d.className = 'sgo'; d.setAttribute('role', 'status'); d.setAttribute('aria-live', 'polite');
    d.innerHTML = `<div class="sgo-c"><span class="sgo-av"><svg class="sgo-ring" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="33"/></svg><span class="sgo-pic">${pic}</span><span class="sgo-ok"><i class="i i-check"></i></span></span>`
      /* owner (2026-11-22): the goodbye says "Hasta la vista, <name>" — the first name, as the big line; the small line shows the progress */
      + `<b class="sgo-t">Hasta la vista${first ? ', ' + esc(first) : ''}</b><small class="sgo-s">Signing out…</small></div>`;
    document.body.appendChild(d); document.body.classList.add('sgo-on');
    setTimeout(() => { d.classList.add('sgo-end'); const s = d.querySelector('.sgo-s'); if (s) s.textContent = 'Signed out'; }, 560);
    setTimeout(done, 900);
  });
}
/* show = true: signed out by hand, play the goodbye first (sgoShow) */
async function idleOut(auto, show) {
  if (IDLE.busy) return; IDLE.busy = true; clearInterval(IDLE.t); idleHide();
  if (show) window.SGO = 1;
  try { if (auto) sessionStorage.setItem(IDLE.SAID, String(idleMin())); } catch (e) { }
  idleSet(IDLE.KEY, null); idleSet(IDLE.OUT, String(Date.now())); /* the other tabs go back to the sign-in page too */
  /* Speed: the sign-out request goes out (keepalive: it finishes even as the page reloads) and the page reloads at once instead of
     waiting for the answer first. The server handles one session's requests one after another, so the reloaded page's first
     question already sees the session ended; if it ever does not, boot() signs out once more (sessionStorage solOut). */
  try { sessionStorage.setItem('solOut', '1'); } catch (e) { }
  try { fetch('api.php?m=auth&a=logout', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'X-Solarize': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(typeof APPLITE !== 'undefined' && APPLITE ? { app_token: appCall('getToken') } : {}) }).catch(() => { }); } catch (e) { }
  if (typeof APPLITE !== 'undefined' && APPLITE) appCall('clear'); /* the Android app forgets its device token and stops checking for leads */
  if (show) await sgoShow();
  location.hash = ''; location.reload();
}
/* a phone signed in for the day (STAY, set in boot()): nothing is signed out for inactivity before office end time; at that time the day is over */
const idleStay = () => typeof STAY !== 'undefined' && STAY > 0;
function idleTick() {
  if (IDLE.busy) return;
  if (idleStay()) { if (Date.now() < STAY) { idleMark(); return; } STAY = 0; return idleOut(false); }
  if (typeof FMU !== 'undefined' && FMU.busy) idleMark(); /* a running upload counts as using the CRM */
  const last = Math.max(IDLE.last, +idleGet(IDLE.KEY) || 0), s = IDLE.state(Date.now(), last, idleMin(), IDLE.WARN);
  if (s.st === 'out') return idleOut(true);
  if (s.st === 'warn') idleShow(s.left); else idleHide();
}
/* called from boot() once signed in; true = the last use was too long ago (browser left open or closed), signing out now */
function startIdle() {
  const old = +idleGet(IDLE.KEY) || 0;
  if (old && !idleStay() && IDLE.state(Date.now(), old, idleMin(), IDLE.WARN).st === 'out') { idleOut(true); return true; }
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
