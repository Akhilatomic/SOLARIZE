/* Sign-in screen (design: docs/design/login, "Measured Light" on frosted glass). loginView (app.js) hands over to lgView.
   Glass card over the sunrise (LG.sceneSvg, rays lit = the hour) or over the owner's login photo (brand.bg with its dim);
   greeting by the hour; the last person who signed in on this browser as a chip with "Not you?" (localStorage lgLast: username +
   name, this browser only); a Caps Lock note while typing the password; "Keep me signed in · 7 days" (the same lgRem setting).
   Sign-in: the button gathers into a dial whose 12 ticks sweep while the request runs; admitted = the dial turns red with a tick and
   the card lifts away, then the app rises in (body.lgx-arrive); refused = the dial fades, the button comes back, the password field
   turns red with the server's message. No motion when the computer asks for less. CSS: assets/login.css (.lgx). */
const LGX = { t: 0 };
const lgxLast = {
  get() { try { const j = JSON.parse(localStorage.getItem('lgLast') || 'null'); return j && j.u ? { u: String(j.u), n: String(j.n || j.u) } : null; } catch (e) { return null; } },
  set(u, n) { try { localStorage.setItem('lgLast', JSON.stringify({ u: String(u || ''), n: String(n || u || '') })); } catch (e) { } },
  clear() { try { localStorage.removeItem('lgLast'); } catch (e) { } }
};
const lgxCalm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const lgxWait = ms => new Promise(r => setTimeout(r, ms));
/* the dial inside the button: 12 ticks round a 52 px circle, and the tick mark shown when admitted */
const LGX_DIAL = (() => {
  let s = '<svg class="lgx-dial" viewBox="0 0 52 52" aria-hidden="true" focusable="false">';
  for (let i = 0; i < 12; i++) { const a = (-90 + i * 30) * Math.PI / 180, r0 = 13.5, r1 = 19.2, f = n => Math.round(n * 100) / 100;
    s += `<line x1="${f(26 + r0 * Math.cos(a))}" y1="${f(26 + r0 * Math.sin(a))}" x2="${f(26 + r1 * Math.cos(a))}" y2="${f(26 + r1 * Math.sin(a))}"/>`; }
  return s + '<path d="M19 26.5l5 5 10-11"/></svg>';
})();

function lgView(setup, brand) {
  if (APPLITE) setTimeout(() => appCall('ready'), 0); /* Android app: the sign-in page is up, its opening screen may go */
  clearInterval(LGX.t);
  brand = brand || {};
  const now = new Date(), last = setup ? null : lgxLast.get(), photo = String(brand.bg || '');
  const dim = photo ? (brand.dim ?? 35) / 100 : 0, label = setup ? 'Create admin account' : 'Sign in';
  const field = (id, lbl, type, ac, extra = '') => `<div class="lgx-f"><label class="lgx-l" for="${id}">${lbl}</label><div class="lgx-in"><input id="${id}" type="${type}" autocomplete="${ac}"${extra}></div></div>`;
  app.innerHTML = `<div class="lgx">
   <div class="lgx-bg${photo ? ' photo' : ''}"${photo ? ` style="background-image:url('${esc(photo)}')"` : ''}>${photo ? `<div class="lgx-dim" style="opacity:${dim}"></div>` : LG.sceneSvg(LG.rays(now.getHours()))}</div>
   <div class="lgx-time lgx-glass" aria-hidden="true"><i></i><span id="lgxClock">${LG.pill(now)}</span></div>
   <form class="lgx-card lgx-glass" id="lf" autocomplete="on" novalidate>
    <div class="lgx-dimmable">
     <img src="assets/logo.png" alt="Jasper" class="lgx-logo">
     <h1 class="lgx-hi" id="lgxHi">${setup ? 'Welcome' : LG.greet(now.getHours())}</h1>
     <p class="lgx-sub">${esc(brand.tagline || 'Max speed CRM')}</p>
     ${setup ? '<p class="lgx-note">First run: create the administrator account.</p>' + field('nm', 'Your name', 'text', 'name') : ''}
     ${last ? `<div class="lgx-f" id="lgxMe"><span class="lgx-l">Signed in last on this device</span><div class="lgx-chip"><span class="lgx-av" aria-hidden="true">${esc(LG.initials(last.n))}</span><b title="${esc(last.u)}">${esc(last.n)}</b><button type="button" class="lgx-not" id="lgxNot">Not you?</button></div></div>` : ''}
     <div class="lgx-f" id="lgxU"${last ? ' hidden' : ''}><label class="lgx-l" for="un">Username</label><div class="lgx-in"><input id="un" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" value="${last ? esc(last.u) : ''}"></div></div>
     <div class="lgx-f"><label class="lgx-l" for="pw">Password${setup ? ' (min 8 characters)' : ''}</label><div class="lgx-in" id="lgxPw"><input id="pw" type="password" autocomplete="${setup ? 'new-password' : 'current-password'}"><button type="button" class="lgx-eye" id="eye" aria-label="Show password" title="Show password"><svg viewBox="0 0 20 14"><path d="M1 7C4.5 1 15.5 1 19 7C15.5 13 4.5 13 1 7Z"/><circle cx="10" cy="7" r="3"/></svg></button></div></div>
     <p class="lgx-caps" id="lgxCaps" hidden><svg viewBox="0 0 13 14" aria-hidden="true"><path d="M6.5.8L12 6.3H9V10H4V6.3H1Z"/><path d="M4 13H9"/></svg>Caps Lock is on</p>
     ${setup || APPLITE ? '' : `<label class="lgx-keep"><input type="checkbox" id="rem"${lgRem() ? ' checked' : ''}> Keep me signed in · 7 days</label>`}
    </div>
    <p class="lgx-err" id="e" role="alert" aria-live="assertive"></p>
    <button class="lgx-go" id="go" type="submit"><span class="lgx-gl">${label}<svg viewBox="0 0 16 12" aria-hidden="true"><path d="M1 6H15M10 1L15 6L10 11"/></svg></span>${LGX_DIAL}</button>
    <p class="lgx-help">${setup ? '' : 'Forgot your password? Your admin can reset it.'}</p>
   </form></div>`;
  const card = $('#lf'), un = $('#un'), pw = $('#pw'), caps = $('#lgxCaps');
  (last ? pw : setup ? $('#nm') : un).focus();
  /* the time pill and the greeting follow the clock while the page stays open */
  LGX.t = setInterval(() => { const c = $('#lgxClock'); if (!c) return clearInterval(LGX.t); const d = new Date(); c.textContent = LG.pill(d); const h = $('#lgxHi'); if (h && !setup) h.textContent = LG.greet(d.getHours()); }, 30000);
  $('#eye').addEventListener('click', () => { const show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; $('#eye').setAttribute('aria-label', show ? 'Hide password' : 'Show password'); $('#eye').title = show ? 'Hide password' : 'Show password'; });
  const capsCheck = e => { if (e.getModifierState) caps.hidden = !e.getModifierState('CapsLock'); };
  pw.addEventListener('keydown', capsCheck); pw.addEventListener('keyup', capsCheck);
  pw.addEventListener('blur', () => { caps.hidden = true; });
  pw.addEventListener('input', () => { $('#lgxPw').classList.remove('bad'); });
  if ($('#lgxNot')) $('#lgxNot').addEventListener('click', () => { lgxLast.clear(); $('#lgxMe').remove(); $('#lgxU').hidden = false; un.value = ''; pw.value = ''; un.focus(); });
  card.addEventListener('submit', async e => {
    e.preventDefault();
    if (card.classList.contains('busy')) return;
    if ($('#rem')) { try { localStorage.setItem('lgRem', $('#rem').checked ? '1' : '0'); } catch (x) { } }
    const b = $('#go'), err = $('#e'), calm = lgxCalm();
    err.textContent = ''; $('#lgxPw').classList.remove('bad');
    card.classList.remove('no'); card.classList.add('busy'); b.disabled = true; b.setAttribute('aria-label', setup ? 'Creating the account' : 'Signing in');
    const body = { name: $('#nm')?.value, username: un.value, password: pw.value, phone: isPhone() ? 1 : 0, remember: $('#rem') && $('#rem').checked ? 1 : 0, app: APPLITE ? 1 : 0, device: APPLITE ? appCall('device') : '' };
    try {
      const r = await api('auth', setup ? 'setup' : 'login', body);
      if (APPLITE && r.app_token) appCall('setToken', r.app_token);
      const me = (r.status && r.status.user) || {};
      lgxLast.set(me.username || body.username, me.name || body.username);
      /* owner's rule (2026-11-22): every sign-in starts on the Dashboard, not on the page or tabs open before (a reload while signed in still keeps them) */
      if (!APPLITE) { try { sessionStorage.removeItem(typeof TABR !== 'undefined' ? TABR.KEY : 'mtabs'); } catch (x) { } try { history.replaceState(null, '', '#/dashboard'); } catch (x) { } }
      if (!calm) { card.classList.add('ok'); await lgxWait(300); card.classList.add('out'); const t = $('.lgx-time'); if (t) t.classList.add('out'); await lgxWait(340); }
      clearInterval(LGX.t);
      document.body.classList.add('lgx-arrive'); setTimeout(() => document.body.classList.remove('lgx-arrive'), 700);
      boot(r.status);
    } catch (j) {
      if (!calm) { card.classList.add('no'); await lgxWait(260); }
      card.classList.remove('busy', 'no'); b.disabled = false; b.removeAttribute('aria-label');
      err.textContent = (j && j.error) || 'Could not sign in. Check the connection and try again.';
      $('#lgxPw').classList.add('bad'); pw.focus(); pw.select();
    }
  });
}
