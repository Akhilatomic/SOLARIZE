// Menu tabs: pages open in tabs like a web browser, so staff can work in several menus at once.
// A click in the side menu opens the page in the tab in front; right-click (or Ctrl+click / middle click) > "Open in new tab"
// opens another tab. Tabs stay open until they are closed by hand.
// Each tab is a page-frame holding its own copy of the CRM (index.html?tab=<id>#/<page>) with the side menu and top bar hidden,
// so a half-typed form, the filters and the scroll position of one tab stay untouched while another tab is used.
// The outer window keeps the side menu, the top bar and every alert (bell, new-lead pop-up, reminders, attendance).
// Design note: docs/superpowers/specs/2026-11-16-menu-tabs-design.md

/* ---- rules (pure; tests/tabs.test.js) ---- */
const TABR = {
  MAX: 8,                 /* each tab is a whole copy of the app: enough to work with, not enough to slow the computer down */
  KEY: 'mtabs',           /* sessionStorage: the open tabs come back after a reload */
  norm(h) { h = String(h || ''); return /^#\/[a-z][a-z0-9_]*(\/|$)/i.test(h) ? h.replace(/\/+$/, '') : '#/dashboard'; },
  mod(h) { return TABR.norm(h).split('/')[1]; },
  find(list, id) { return list.findIndex(t => t.id === id); },
  /* closing a tab: the tab that took its place comes to the front (else the one before it) */
  close(list, active, id) {
    const i = TABR.find(list, id); if (i < 0) return { list, active };
    const L = list.filter(t => t.id !== id);
    return { list: L, active: active !== id ? active : L.length ? L[Math.min(i, L.length - 1)].id : '' };
  },
  pack(list, active) { return JSON.stringify({ a: TABR.find(list, active), t: list.map(t => [t.hash, t.title || '']) }); },
  /* -> { list: [{hash, title}], active: index or -1 } */
  unpack(s) {
    const out = { list: [], active: -1 };
    try {
      const j = JSON.parse(s || 'null'); if (!j || !Array.isArray(j.t)) return out;
      j.t.forEach((x, i) => {
        if (!Array.isArray(x) || typeof x[0] !== 'string' || out.list.length >= TABR.MAX) return;
        if (i === j.a) out.active = out.list.length;
        out.list.push({ hash: TABR.norm(x[0]), title: typeof x[1] === 'string' ? x[1].slice(0, 80) : '' });
      });
    } catch (e) { }
    return out;
  },
};
if (typeof module !== 'undefined') module.exports = TABR;

/* the small right-click menu on a link to a CRM page (used by the side menu and inside the pages) */
function tabMenu(x, y, open) {
  const old = document.getElementById('mtcm'); if (old) old.remove();
  const m = document.createElement('div'); m.id = 'mtcm'; m.className = 'card menu mt-cm';
  m.innerHTML = '<button type="button"><i class="i i-plus"></i>Open in new tab</button>';
  document.body.appendChild(m);
  m.style.left = Math.max(4, Math.min(x, innerWidth - m.offsetWidth - 6)) + 'px'; m.style.top = Math.max(4, Math.min(y, innerHeight - m.offsetHeight - 6)) + 'px';
  const gone = e => { if (e && e.type === 'keydown' && e.key !== 'Escape') return; if (e && e.type !== 'keydown' && m.contains(e.target)) return;
    m.remove(); ['pointerdown', 'click', 'keydown', 'scroll', 'blur'].forEach(ev => removeEventListener(ev, gone, true)); };
  setTimeout(() => ['pointerdown', 'click', 'keydown', 'scroll', 'blur'].forEach(ev => addEventListener(ev, gone, true)), 0);
  m.firstChild.onclick = () => { gone(); open(); };
  m.firstChild.focus();
}
const tabLink = e => { const a = e.target.closest && e.target.closest('a[href^="#/"]'); return a ? a.getAttribute('href') : ''; };

/* ---- the outer window: tab bar + one page-frame per tab ---- */
const TABS = {
  live: false, list: [], active: '', seq: 0, el: null, stack: null,
  off() { try { return localStorage.mtabsOff === '1'; } catch (e) { return false; } },
  /* tabs need room: desktop and tablet widths only (decided once, when the app starts) */
  want() { return !FRAME && !TABS.off() && matchMedia('(min-width:821px)').matches; },
  get(id) { return TABS.list.find(t => t.id === id); },
  cur() { return TABS.get(TABS.active); },
  frame(id) { return TABS.stack ? [...TABS.stack.children].find(f => f.dataset.id === id) : null; },
  win(id) { const f = TABS.frame(id); try { return f && f.contentWindow && f.contentWindow.TABFRAME ? f.contentWindow : null; } catch (e) { return null; } },
  info(mod) { const m = MODS.find(x => x[0] === mod); return m ? { name: m[1], icon: m[2] } : { name: mod.charAt(0).toUpperCase() + mod.slice(1), icon: '<i class="i i-file"></i>' }; },
  label(t) { return t.title || TABS.info(TABR.mod(t.hash)).name; },
  src(t) { return 'index.html?tab=' + t.id + t.hash; },
  add(hash, title) { const t = { id: 't' + (++TABS.seq), hash: TABR.norm(hash), title: title || '' }; TABS.list.push(t); return t; },
  /* called from shell(): draws the bar and the frame stack; the first route() then opens the tabs */
  mount() {
    TABS.live = TABS.want(); TABS.list = []; TABS.active = ''; TABS.started = false;
    document.documentElement.classList.toggle('mt-on', TABS.live);
    if (!TABS.live) return;
    const bar = document.createElement('div'); bar.id = 'mtabs'; bar.className = 'mt-bar'; bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', 'Open tabs');
    $('#title').after(bar);
    const st = document.createElement('div'); st.id = 'mtstack'; st.className = 'mt-stack'; $('#main').before(st);
    TABS.el = bar; TABS.stack = st;
    let saved = ''; try { saved = sessionStorage.getItem(TABR.KEY); } catch (e) { }
    const sv = TABR.unpack(saved); sv.list.forEach(t => TABS.add(t.hash, t.title)); TABS.first = sv.active >= 0 ? TABS.list[sv.active].id : '';
    bar.onclick = e => {
      const x = e.target.closest('[data-mtx]'); if (x) return TABS.close(x.dataset.mtx);
      const b = e.target.closest('[data-mt]'); if (!b) return;
      if (b.dataset.mt === TABS.active) TABS.poke(); else TABS.show(b.dataset.mt); /* a click on the tab in front draws its page again */
    };
    bar.onauxclick = e => { const b = e.target.closest('[data-mt]'); if (b && e.button === 1) { e.preventDefault(); TABS.close(b.dataset.mt); } };
    bar.onmousedown = e => { if (e.button === 1) e.preventDefault(); }; /* no auto-scroll cursor on a middle click */
    bar.onkeydown = e => { const b = e.target.closest('[data-mt]'); if (!b || e.target.closest('[data-mtx]')) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); TABS.show(b.dataset.mt); } };
    const side = $('#side');
    side.addEventListener('click', e => {
      const h = tabLink(e); if (!h || e.button) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); return TABS.open(h); } /* as in a browser */
      if (e.target.closest('a').classList.contains('sgh') && /^(fees|comm)$/.test(TABS.mod())) return; /* the Finance heading only folds its list while a Finance page is in front */
      e.preventDefault(); TABS.go(h, true);
    });
    side.addEventListener('auxclick', e => { const h = tabLink(e); if (h && e.button === 1) { e.preventDefault(); TABS.open(h); } });
    side.addEventListener('mousedown', e => { if (e.button === 1 && tabLink(e)) e.preventDefault(); });
    side.addEventListener('contextmenu', e => { const h = tabLink(e); if (!h) return; e.preventDefault(); tabMenu(e.clientX, e.clientY, () => TABS.open(h)); });
  },
  mod() { const c = TABS.cur(); return c ? TABR.mod(c.hash) : ''; },
  /* route() of the outer window: the address bar changed (a notification, a typed address), or some code asked for a redraw */
  route() {
    const h = location.hash, ok = /^#\/[a-z]/i.test(h);
    if (!TABS.started) { TABS.started = true;
      const t = TABS.get(TABS.first) || TABS.list[0]; if (!t) return TABS.open(ok ? h : '#/dashboard');
      if (ok) t.hash = TABR.norm(h); /* the address the browser was opened on wins */
      return TABS.show(t.id); }
    const c = TABS.cur();
    if (c && (!ok || TABR.norm(h) === c.hash)) { TABS.mirror(); return TABS.poke(); }
    TABS.go(h);
  },
  /* show a page in the tab in front */
  go(hash, menu) {
    hash = TABR.norm(hash); const c = TABS.cur(); if (!c) return TABS.open(hash);
    if (c.hash === hash) { if (menu) TABS.poke(); return; }
    const w = TABS.win(c.id), f = TABS.frame(c.id);
    if (w) { let why = ''; try { why = w.TABFRAME.busy('nav'); } catch (e) { }
      if (why && !confirm(`Leave this page?\n\n${why}`)) return TABS.mirror();
      c.hash = hash; try { w.TABFRAME.leave(); } catch (e) { } w.location.hash = hash; }
    else { c.hash = hash; if (f) f.src = TABS.src(c); } /* a frame that is still starting is simply started on the new page */
    TABS.draw(); TABS.mirror(); TABS.save();
  },
  /* a new tab */
  open(hash) {
    if (TABS.list.length >= TABR.MAX) { if (typeof toast === 'function') toast(`${TABR.MAX} tabs are open. Close a tab first.`, true); return; }
    TABS.show(TABS.add(hash).id);
  },
  show(id) {
    const t = TABS.get(id); if (!t) return;
    TABS.active = id; let f = TABS.frame(id);
    if (!f) { f = document.createElement('iframe'); f.className = 'mt-f'; f.dataset.id = id; f.title = TABS.label(t); f.src = TABS.src(t); TABS.stack.appendChild(f); }
    for (const x of TABS.stack.children) {
      const on = x === f; if (x.classList.contains('on') === on) continue;
      x.classList.toggle('on', on); const w = TABS.win(x.dataset.id); if (w) w.TABFRAME.show(on);
    }
    TABS.draw(); TABS.mirror(); TABS.save();
    try { f.contentWindow.focus(); } catch (e) { }
  },
  close(id) {
    const t = TABS.get(id); if (!t) return;
    const w = TABS.win(id); let why = ''; try { why = w ? w.TABFRAME.busy() : ''; } catch (e) { }
    if (why && !confirm(`Close the ${TABS.label(t)} tab?\n\n${why}`)) return;
    TABS.drop(id);
  },
  drop(id) {
    const r = TABR.close(TABS.list, TABS.active, id), f = TABS.frame(id); TABS.list = r.list; if (f) f.remove();
    if (!r.list.length) { TABS.active = ''; return TABS.open('#/dashboard'); }
    if (r.active !== TABS.active) TABS.show(r.active); else { TABS.draw(); TABS.save(); }
  },
  /* the tab in front draws its page again - unless a window is open or something is being typed there */
  poke() { const w = TABS.win(TABS.active); try { if (w) w.TABFRAME.redraw(); } catch (e) { } },
  /* the address bar follows the tab in front (no history entry, no hashchange) */
  mirror() { const c = TABS.cur(); try { if (c && location.hash !== c.hash) history.replaceState(null, '', c.hash); } catch (e) { } },
  save() { try { sessionStorage.setItem(TABR.KEY, TABR.pack(TABS.list, TABS.active)); } catch (e) { } },
  draw() {
    const c = TABS.cur(), mod = TABS.mod();
    TABS.el.innerHTML = TABS.list.map(t => { const on = t.id === TABS.active, n = esc(TABS.label(t));
      return `<div class="mt-t${on ? ' on' : ''}" role="tab" tabindex="0" aria-selected="${on}" data-mt="${t.id}" title="${n}"><span class="mt-i">${TABS.info(TABR.mod(t.hash)).icon}</span><span class="mt-l">${n}</span><button type="button" class="mt-x" data-mtx="${t.id}" title="Close tab" aria-label="Close ${n}"><i class="i i-x"></i></button></div>`; }).join('');
    const a = TABS.el.querySelector('.mt-t.on'); if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    for (const f of TABS.stack.children) { const t = TABS.get(f.dataset.id); if (t) f.title = TABS.label(t); }
    /* side menu: the entry of the page in front is marked */
    $$('aside a[data-m]').forEach(x => x.classList.toggle('on', x.dataset.m === mod));
    $$('aside a[data-sub]').forEach(x => x.classList.toggle('on', !!c && x.getAttribute('href') === c.hash));
    const g = $('#feesg'); if (g && /^(fees|comm)$/.test(mod)) g.classList.add('open');
  },
  /* ---- called by the page-frames ---- */
  note(id, hash, title) {
    const t = TABS.get(id); if (!t) return; let ch = false;
    if (hash && t.hash !== TABR.norm(hash)) { t.hash = TABR.norm(hash); t.title = ''; ch = true; }
    if (typeof title === 'string' && title && title !== t.title) { t.title = title.slice(0, 80); ch = true; }
    if (!ch) return; TABS.draw(); if (id === TABS.active) TABS.mirror(); TABS.save();
  },
  /* a click inside a page: the outer window's open menus (account, bell, side menu) close as they do for a click beside them */
  tap() { for (const ev of [new MouseEvent('pointerdown', { bubbles: true }), new MouseEvent('click', { bubbles: true })]) document.body.dispatchEvent(ev); },
  signedOut() { location.reload(); },
  setOff(off) { try { localStorage.mtabsOff = off ? '1' : '0'; } catch (e) { } location.reload(); },
};
if (typeof window !== 'undefined') window.TABS = TABS; /* page-frames reach the outer window through this */

/* ---- inside a page-frame ---- */
const TABF = { id: '', active: true };
function tabFrameInit() {
  const fe = window.frameElement; TABF.id = fe.dataset.id; TABF.active = fe.classList.contains('on');
  document.documentElement.classList.add('mt-frame');
  /* A tab that is not in front behaves like a background browser tab: every poll in the app already skips hidden documents
     and refreshes on visibilitychange, so the tabs nobody is looking at stay quiet. */
  const nat = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  try {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !TABF.active || !!(nat && nat.get && nat.get.call(document)) });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => document.hidden ? 'hidden' : 'visible' });
  } catch (e) { }
  window.TABFRAME = {
    show(on) { if (TABF.active === on) return; TABF.active = on; document.dispatchEvent(new Event('visibilitychange')); },
    /* a reason not to throw this tab's page away. how: '' = the tab is being closed, 'nav' = another page is opening in it */
    busy(how) {
      if (how !== 'nav' && typeof FMU !== 'undefined' && FMU.busy) return 'Files are still uploading in this tab.';
      if (document.querySelector('.modal')) return 'A window is open in this tab. Anything typed there and not saved will be lost.';
      return '';
    },
    leave() { document.querySelectorAll('.modal').forEach(m => m.remove()); },
    redraw() { const a = document.activeElement;
      if (document.querySelector('.modal') || (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable))) return;
      route(); },
  };
  addEventListener('pointerdown', () => { try { parent.TABS.tap(); } catch (e) { } }, true);
  addEventListener('contextmenu', e => { const h = tabLink(e); if (!h) return; e.preventDefault(); tabMenu(e.clientX, e.clientY, () => { try { parent.TABS.open(h); } catch (x) { } }); });
}
/* route() of a page-frame: the outer window is told which page this tab shows now */
function tabFrameRoute() { try { parent.TABS.note(TABF.id, location.hash || '#/dashboard'); } catch (e) { } }
/* boot() of a page-frame: the page and the feeds it reads. Alerts, reminders, badges and the attendance button belong to the outer window. */
function bootFrame() {
  shell();
  /* the tab is named after the page: "Finance › Registration fee" is shown as "Registration fee" */
  const tl = $('#title'), say = () => { const sub = tl.querySelector('.ttls'), name = (sub ? sub.textContent.replace(/^[\s›>]+/, '') : tl.textContent).replace(/\s+/g, ' ').trim();
    try { parent.TABS.note(TABF.id, '', name); } catch (e) { } };
  new MutationObserver(say).observe(tl, { childList: true, subtree: true, characterData: true });
  if (!TABF.on) { TABF.on = true; /* work in a tab counts as using the CRM (the last-used time is shared with the outer window) */
    if (typeof idleMark === 'function') ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(ev => addEventListener(ev, () => idleMark(), { passive: true, capture: true })); }
  if (typeof startPresence === 'function') startPresence(); if (typeof startFeas === 'function') startFeas();
  startMeta(); startHr(); startDisc(); route();
}
if (typeof window !== 'undefined' && typeof FRAME !== 'undefined' && FRAME) tabFrameInit();
