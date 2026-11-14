// Solarize CRM - core, dashboard, leads, customers, projects
// security: every state-changing call to the API carries the app header (blocks cross-site request forgery)
(() => { const f = window.fetch.bind(window); window.fetch = (u, o = {}) => { if (typeof u === 'string' && /^api\.php/.test(u) && o && String(o.method || 'GET').toUpperCase() === 'POST') { o = { ...o, headers: new Headers(o.headers || {}) }; o.headers.set('X-Solarize', '1'); } return f(u, o); }; })();
const canExport = () => ['admin', 'assistant_manager'].includes(ME && ME.role); // bulk exports: managers only
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + Math.round(+n || 0).toLocaleString('en-IN');
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const dt = s => (s || '').slice(0, 10);
const debounce = (fn, ms = 150) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }; // speed: redraw big tables once the user pauses typing
// speed: long tables put the first rows on screen at once and add the next batch when the last row scrolls into view,
// so a sort, filter or inline edit never lays out thousands of rows nobody is looking at. more(step) appends rows, returns true while rows remain.
const LAZY_FIRST = 200, LAZY_STEP = 300;
function lazyMore(tb, more, pending) {
  if (tb._lazyIO) tb._lazyIO.disconnect();
  if (!pending || !('IntersectionObserver' in window)) { while (pending && more(1e9)); return; } // very old browser: render everything
  const io = tb._lazyIO = new IntersectionObserver(es => { if (!es.some(e => e.isIntersecting)) return; io.disconnect(); if (more(LAZY_STEP)) watch(); });
  const watch = () => { const last = tb.tBodies[0] && tb.tBodies[0].lastElementChild; if (last) io.observe(last); };
  watch();
}
const app = $('#app');
let ME = null, S = {}, CACHE = {}, TAB = {};
const SUB_STATUS = ['Not applied', 'Applied', 'Under review', 'Approved', 'Released'];
const MODS = [ // id, label, icon, perm
  ['dashboard', 'Dashboard', '<i class="i i-dashboard"></i>', 'dashboard'], ['calendar', 'Calendar', '<i class="i i-calendar"></i>', 'calendar'], ['leads', 'Leads', '<i class="i i-target"></i>', 'leads'], ['customers', 'Customers', '<i class="i i-users"></i>', 'customers'],
  ['projects', 'Project pipeline', '<i class="i i-project"></i>', 'projects'], ['folder', 'Folder', '<i class="i i-file"></i>', 'folder'], ['quotes', 'Quotations', '<i class="i i-receipt"></i>', 'quotes'],
  ['subsidy', 'Subsidy (PM Surya Ghar)', '<i class="i i-coin"></i>', 'checklist'], ['kseb', 'KSEB documentation', '<i class="i i-folder"></i>', 'checklist'], ['bank', 'Bank documentation', '<i class="i i-bank"></i>', 'loans'],
  ['fees', 'Finance', '<i class="i i-coin"></i>', 'fees'], ['accounts', 'Accounts', '<i class="i i-coin"></i>', 'accounts'], ['whatsapp', 'WhatsApp', '<i class="i i-whatsapp"></i>', 'whatsapp'], ['email', 'Email', '<i class="i i-mail"></i>', 'email'], ['ads', 'Meta Ads', '<i class="i i-megaphone"></i>', 'ads'], ['attendance', 'Attendance', '<i class="i i-clock"></i>', 'attendance'], ['leaves', 'Leaves', '<i class="i i-leave"></i>', 'leaves'], ['settings', 'Settings', '<i class="i i-gear"></i>', 'settings'], ['recycle', 'Recycle bin', '<i class="i i-trash"></i>', 'recycle'], ['admin', 'Admin panel', '<i class="i i-shield"></i>', 'admin']];
const canW = m => ME && (ME.write === '*' || ME.write.includes(m));
const FIN = () => canR('finance');
const canR = m => ME && (ME.read === '*' || ME.read.includes(m));
/* Lead type (who brought the lead): Own = the staff member's own contact; Office and Meta = company leads. It decides the incentive (api/comm.php). */
const LT_NAMES = { own: 'Own lead', office: 'Office', meta: 'Meta' }, LT_OPTS = [['', 'Choose…'], ['own', 'Own lead'], ['office', 'Office'], ['meta', 'Meta']];
const ltBadge = t => LT_NAMES[t] ? `<span class="pill ltp lt-${t}" title="Lead type">${LT_NAMES[t]}</span>` : '';
const BA = () => !!ME && ME.role === 'ba'; // Business Associate: own leads & customers only, no money, no WhatsApp, cannot delete or revert customers

async function api(m, a, body, qs = '') {
  const opt = body instanceof FormData ? { method: 'POST', body } : body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
  const r = await fetch(`api.php?m=${m}&a=${a}${qs}`, opt);
  const j = await r.json().catch(() => ({ error: 'Bad server response' }));
  if (r.status === 401 && m !== 'auth') { boot(); throw j; }
  /* Every error is thrown. Sign-in errors get no pop-up: the sign-in form shows them under the button (they used to come back as a
     normal answer, so the form reloaded and "Wrong username or password" / "Too many wrong attempts" never appeared).
     quiet: the page shows its own prompt (e.g. email password changed). */
  if (j.error) { if (!j.quiet && !(m === 'auth' && (a === 'login' || a === 'setup'))) alert(j.error); throw j; }
  if (m === 'leads' && a === 'save' && typeof refreshFeed === 'function') setTimeout(refreshFeed, 0); // edited leads leave "New leads to contact"
  return j;
}
const list = (m, qs = '') => api(m, 'list', undefined, qs);
const waNum = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };
const pill = (t, c = '') => `<span class="pill ${c}">${esc(t)}</span>`;
const stageCls = s => ({ Won: 'g', Commissioned: 'g', Closed: 'g', Released: 'g', Approved: 'g', Lost: 'r', New: 'b', Survey: 'b', Submitted: 'y', Applied: 'y', 'Under review': 'y' }[s] || '');

async function boot() {
  const s = await api('auth', 'status', undefined, '&boot=1');
  if (!s.auth) { loginView(s.setup, s.brand || {}); if (typeof idleSignedOut === 'function') idleSignedOut(); return; }
  ME = s.user; S = s.settings || await api('settings', 'get');
  if (typeof startIdle === 'function' && startIdle()) return; /* not used for too long: signing out */
  shell(); mountBell(); if (typeof startPresence === 'function') startPresence(); if (typeof startFeas === 'function') startFeas(); startMeta(); startCal(); startWa(); startHr(); startDisc(); if (typeof startMail === 'function') startMail(); route();
}
function loginView(setup, brand) {
  const bg = brand.bg ? `url('${brand.bg}') center/cover no-repeat` : '';
  app.innerHTML = `<div class="lg" style="${bg ? 'background:' + bg : ''}"><div class="lg-dim" style="opacity:${bg ? (brand.dim ?? 35) / 100 : 0}"></div>
   <form class="lg-card" id="lf" autocomplete="on"><img src="assets/logo.png" alt="Jasper" class="lg-logo">
    <h2>${setup ? 'Welcome' : 'Welcome back'}</h2><p class="lg-sub">${esc(brand.tagline || 'Max speed CRM')}</p>
    ${setup ? '<p class="lg-note">First run: create the administrator account.</p><div class="lg-f"><i class="i i-user"></i><input id="nm" placeholder="Your name" autocomplete="name"></div>' : ''}
    <div class="lg-f"><i class="i i-user"></i><input id="un" placeholder="Username" autocomplete="username" autofocus></div>
    <div class="lg-f"><i class="i i-lock"></i><input id="pw" type="password" placeholder="Password${setup ? ' (min 8 characters)' : ''}" autocomplete="${setup ? 'new-password' : 'current-password'}"><button type="button" class="lg-eye" id="eye" title="Show password" tabindex="-1"><i class="i i-eye"></i></button></div>
    <div class="err" id="e"></div><button class="btn lg-go" id="go" type="submit">${setup ? 'Create admin account' : 'Sign in'}</button>
    <p class="lg-foot">Jasper Solar Solutions</p></form></div>`;
  $('#eye').onclick = () => { const p = $('#pw'); p.type = p.type === 'password' ? 'text' : 'password'; };
  $('#lf').onsubmit = async e => { e.preventDefault(); const b = $('#go'); b.disabled = true; b.textContent = 'Please wait…'; try { const r = await api('auth', setup ? 'setup' : 'login', { name: $('#nm')?.value, username: $('#un').value, password: $('#pw').value }); boot(); } catch (j) { $('#e').textContent = j.error || 'Failed'; b.disabled = false; b.textContent = setup ? 'Create admin account' : 'Sign in'; } };
}
function shell() {
  const items = MODS.filter(m => m[0] === 'admin' ? ME.role === 'admin' : m[0] === 'fees' ? feesNavItems().length > 0 : canR(m[3]));
  app.innerHTML = `<div id="shell"><aside id="side"><h1 class="brand"><img src="assets/logo.png" alt="Jasper"><span class="bt">Solarize <span>CRM</span></span><button type="button" class="sbpin" id="sbpin" aria-pressed="false"><i class="i i-pin"></i></button></h1>
   ${items.map(m => `${m[0] === 'subsidy' ? '<div class="sep">Compliance</div>' : m[0] === 'whatsapp' ? '<div class="sep">Marketing</div>' : m[0] === 'attendance' ? '<div class="sep">Team</div>' : m[0] === 'settings' ? '<div class="sep">System</div>' : ''}${m[0] === 'fees' ? feesNav() : `<a href="#/${m[0]}" data-m="${m[0]}" title="${m[1]}"><span class="ft t-${m[0]}">${m[2]}</span><span class="lbl">${m[1]}</span></a>`}`).join('')}
   </aside><div class="content"><div class="top"><button class="btn sec burger" id="bg"><i class="i i-menu"></i></button><h2 id="title"></h2>
   <div id="pwb" class="acctw"><button class="acct" id="acct" title="Account"><span class="acav" data-pres="${ME.id}">${avImg(ME.id, ME.avatar, ME.name)}</span><span class="acn">${esc(ME.name)}<small>${esc(ME.role_name || ME.role)}</small></span></button>
    <div class="card menu acm hide" id="acm"><div class="acmh"><span class="acav big">${avImg(ME.id, ME.avatar, ME.name)}</span><div><b>${esc(ME.name)}</b><small class="mut">${esc(ME.role_name || ME.role)} · @${esc(ME.username || '')}</small></div></div><button id="pdp"><i class="i i-user"></i>Change photo</button><button id="pdr" ${ME.avatar ? '' : 'hidden'}><i class="i i-x"></i>Remove photo</button><button id="pwc"><i class="i i-lock"></i>Change password</button><button id="lo"><i class="i i-x"></i>Sign out</button></div></div></div><main id="main"></main></div><div id="scrim"></div></div>`;
  $('#bg').onclick = () => { $('#side').classList.toggle('open'); document.body.classList.toggle('drawer', $('#side').classList.contains('open')); };
  $('#scrim').onclick = () => { $('#side').classList.remove('open'); document.body.classList.remove('drawer'); };
  $('#acct').onclick = e => { e.stopPropagation(); $('#acm').classList.toggle('hide'); };
  document.addEventListener('click', e => { const m = $('#acm'); if (m && !m.contains(e.target)) m.classList.add('hide'); });
  new MutationObserver(fitSoon).observe($('#main'), { childList: true, subtree: true });
  $('#lo').onclick = async () => { if (typeof idleOut === 'function') return idleOut(false); await api('auth', 'logout', {}); location.hash = ''; location.reload(); };
  $('#pdp').onclick = () => { $('#acm').classList.add('hide'); pickAvatar(0, ME.name, setMyAvatar); };
  $('#pdr').onclick = () => { $('#acm').classList.add('hide'); removeAvatar(0, setMyAvatar); };
  $('#pwc').onclick = async () => { $('#acm').classList.add('hide'); const o = prompt('Current password'); if (!o) return; const n = prompt('New password (at least 8 characters, letters and numbers). You will stay signed in here; other devices are signed out.'); if (!n) return; await api('auth', 'password', { old: o, new: n }); alert('Password changed'); };
  sideAuto();
}
/* Desktop sidebar: shrinks to an icon rail 2 seconds after it was last used and opens over the page
   when the mouse rests on it, so pages get the full width. The pin keeps it open (remembered per
   browser). Phones keep the slide-in drawer. */
function sideAuto() {
  const s = $('#side'), b = document.body, mq = matchMedia('(min-width:821px)'), pin = $('#sbpin');
  let tOpen = 0, tHide = 0;
  const pinned = () => { try { return localStorage.sidePin === '1'; } catch (e) { return false; } };
  const on = () => b.classList.contains('sbah');
  const hide = () => { clearTimeout(tOpen); clearTimeout(tHide); if (on()) s.classList.add('mini'); };
  const show = () => { clearTimeout(tOpen); clearTimeout(tHide); s.classList.remove('mini'); };
  const later = () => { clearTimeout(tHide); tHide = setTimeout(hide, 2000); };
  const mode = () => {
    const p = pinned(), auto = mq.matches && !p;
    b.classList.toggle('sbah', auto); b.classList.toggle('sbpinned', p);
    pin.setAttribute('aria-pressed', p); pin.title = p ? 'Auto-hide the sidebar' : 'Keep the sidebar open';
    show(); if (auto && !s.matches(':hover')) later();
  };
  pin.onclick = () => { try { localStorage.sidePin = pinned() ? '0' : '1'; } catch (e) { } mode(); };
  const drawer = $('#bg').onclick; /* the menu button opens the rail too: the only way in on a touch screen */
  $('#bg').onclick = e => on() ? (s.classList.contains('mini') ? show() : hide()) : drawer(e);
  s.addEventListener('pointerenter', e => { if (e.pointerType !== 'mouse' || !on()) return; clearTimeout(tHide); if (s.classList.contains('mini')) tOpen = setTimeout(show, 120); });
  s.addEventListener('pointerleave', e => { if (e.pointerType !== 'mouse' || !on()) return; clearTimeout(tOpen); if (!s.classList.contains('mini')) later(); });
  s.addEventListener('click', e => { const a = e.target.closest('a'); if (!a || !on()) return; if (a.classList.contains('sgh') && /^#\/(fees|comm)(\/|$)/.test(location.hash)) return; hide(); });
  s.addEventListener('focusin', e => { if (on() && e.target.matches(':focus-visible')) show(); });
  s.addEventListener('focusout', e => { if (on() && !s.contains(e.relatedTarget) && !s.matches(':hover')) later(); });
  document.addEventListener('pointerdown', e => { if (on() && !s.contains(e.target) && !e.target.closest('#bg') && !s.classList.contains('mini')) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && on() && !s.classList.contains('mini')) hide(); });
  mq.addEventListener('change', mode);
  mode();
}
window.onhashchange = () => ME && route();
let ROUTE_N = 0; // each navigation gets a number, so a slow page you already left can't paint its error over the page you are on
async function route() {
  const nav = ++ROUTE_N;
  const [, mod = 'dashboard', id] = location.hash.split('/');
  $$('aside a').forEach(a => a.classList.toggle('on', a.dataset.m === mod));
  $('#side')?.classList.remove('open'); document.body.classList.remove('drawer');
  const t = MODS.find(m => m[0] === mod);
  $('#title').innerHTML = t ? `<span class="ft t-${t[0]}">${t[2]}</span><span class="ttl">${esc(t[1])}</span>` : '';
  const main = $('#main'); main.className = 'pg-' + mod; main.innerHTML = '<p class="mut">Loading…</p>';
  const pages = { dashboard: pgDashboard, leads: pgLeads, customers: id ? pgCustomer : pgCustomers, projects: id ? pgProject : pgPipeline, quotes: id ? pgQuote : pgQuotes, folder: pgFolder, recycle: pgRecycle, email: pgEmail, fees: pgFees, calendar: pgCalendar, attendance: pgAttendance, leaves: pgLeaves, subsidy: () => pgOverview('subsidy'), kseb: pgKseb, bank: pgBank, comm: pgComm, accounts: pgAccounts, whatsapp: pgWa, ads: pgAds, settings: pgSettings, admin: pgAdmin };
  const fn = pages[mod] || pgDashboard;
  if (t && t[0] !== 'admin' && !canR(t[3])) { main.innerHTML = '<p>Not allowed.</p>'; return; }
  try { await fn(id && id !== 'new' ? +id : id); } catch (e) { if (!e.error) { if (nav === ROUTE_N) main.innerHTML = `<p class="over">Error: ${esc(e.message || e)}</p>`; console.error(e); } }
}

// ---------- fit-to-window: no horizontal scrolling anywhere ----------
// Tables keep their columns while they fit; when a table can't fit (or its container is narrower than data-min),
// it switches to stacked rows (each row becomes a compact block of labelled fields). Scroll boxes (.fitbox) fill the window height.
function autoFit() {
  const main = $('#main'); if (!main) return;
  $$('table', main).forEach(t => {
    const box = t.parentElement; if (!box || !box.clientWidth || t.dataset.nofit) return;
    const hs = [...t.querySelectorAll(':scope > thead th')].map(th => th.textContent.replace(/[⇅↑↓]/g, '').trim());
    if (hs.length) t.querySelectorAll(':scope > tbody > tr').forEach(tr => [...tr.children].forEach((td, i) => { if (td.dataset.label === undefined && !td.hasAttribute('colspan')) td.dataset.label = hs[i] || ''; }));
    const min = +t.dataset.min || 0;
    t.classList.remove('stack');
    if ((min && box.clientWidth < min) || t.scrollWidth > box.clientWidth + 1 || (box.clientWidth < 600 && hs.length >= 4)) t.classList.add('stack'); // phones: 4+ columns read better as cards
  });
  $$('.fitbox', main).forEach(b => { const top = b.getBoundingClientRect().top; b.style.maxHeight = Math.max(280, innerHeight - top - 18) + 'px'; });
}
let _fitRaf = 0; const fitSoon = () => { cancelAnimationFrame(_fitRaf); _fitRaf = requestAnimationFrame(autoFit); };
addEventListener('resize', fitSoon);
function popMenu(btn, items, pick) {
  const old = $('#pmenu'); if (old) old.remove();
  const m = document.createElement('div'); m.id = 'pmenu'; m.className = 'card menu';
  m.innerHTML = items.filter(Boolean).map(([a, i, t]) => `<button data-m="${a}"><i class="i i-${i}"></i>${t}</button>`).join('');
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect(), mh = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px'; m.style.top = (r.bottom + mh + 8 > innerHeight ? Math.max(8, r.top - mh - 6) : r.bottom + 6) + 'px';
  $$('[data-m]', m).forEach(b => b.onclick = () => { m.remove(); pick(b.dataset.m); });
  setTimeout(() => document.addEventListener('click', function h(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', h); } }), 0);
}

// ---------- UI helpers ----------
function modal(html, wide) {
  const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div ${wide ? 'style="max-width:900px"' : ''}>${html}</div>`;
  m.addEventListener('mousedown', e => { if (e.target === m) m._md = true; }); m.addEventListener('mouseup', e => { if (e.target === m && m._md) m.remove(); m._md = false; });
  document.body.appendChild(m); return m;
}
/* Free-text fields (remarks, notes): browser spell check (red underline, right-click for corrections)
   plus the phone keyboard's word suggestions, autocorrect and a capital letter at the start. */
const SPELL = 'spellcheck="true" autocorrect="on" autocapitalize="sentences"';
const spellOn = el => { el.spellcheck = true; el.setAttribute('autocorrect', 'on'); el.setAttribute('autocapitalize', 'sentences'); return el; };
function fld(f, v = {}) {
  const val = v[f.k] ?? f.d ?? '';
  const cls = f.full ? 'full' : '', sp = f.spell ? ' ' + SPELL : '';
  let inp;
  if (f.opts) inp = `<select data-k="${f.k}">${f.opts.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(val) === String(ov) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;
  else if (f.t === 'textarea') inp = `<textarea data-k="${f.k}" rows="${f.rows || 3}"${sp}>${esc(val)}</textarea>`;
  else inp = `<input data-k="${f.k}" type="${f.t || 'text'}" ${f.t === 'number' ? 'step="any"' : ''}${sp}${f.ph ? ` placeholder="${esc(f.ph)}"` : ''} value="${esc(val)}">`;
  return `<div class="${cls}"><label>${f.l}</label>${inp}</div>`;
}
const collect = r => { const o = {}; $$('[data-k]', r).forEach(e => o[e.dataset.k] = e.value); return o; };
const opt = (arr, blank) => (blank ? [['', blank]] : []).concat(arr);
function table(cols, rows, onRow) {
  const id = 't' + Math.random().toString(36).slice(2);
  setTimeout(() => $$(`#${id} tr.row`).forEach(r => r.onclick = e => { if (!e.target.closest('a,button,select,input')) onRow(r.dataset.id); }));
  const cl = c => c[2] ? ` class="${c[2]}"` : ''; /* optional 3rd item: a cell class, e.g. 'num' for right-aligned numbers */
  return `<div class="card tw" id="${id}"><table><thead><tr>${cols.map(c => `<th${cl(c)}>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr class="row" data-id="${r.id}">${cols.map(c => `<td${cl(c)}>${c[1](r)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="mut">Nothing here yet</td></tr>`}</tbody></table></div>`;
}
function tabsBar(key, names, def) {
  const cur = TAB[key] || def;
  return `<div class="tabs">${names.map(([k, l]) => `<button data-tab="${k}" class="${cur === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function bindTabs(key, redraw) { $$('[data-tab]').forEach(b => b.onclick = () => { TAB[key] = b.dataset.tab; redraw(); }); }
function csvParse(t) { const rows = []; let r = [], f = '', q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c == '"') { if (t[i + 1] == '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c == '"') q = true; else if (c == ',') r.push(f), f = ''; else if (c == '\n') { r.push(f.replace(/\r$/, '')); rows.push(r); r = []; f = ''; } else f += c; } if (f || r.length) { r.push(f); rows.push(r); } return rows; }
function csvObjs(t) { const rows = csvParse(t.replace(/^﻿/, '')); const h = rows.shift().map(x => x.trim().toLowerCase()); return rows.filter(r => r.some(x => x)).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); }
function csvDownload(name, cols, data) {
  try { api('sec', 'log_export', { name, rows: (data || []).length }).catch(() => { }); } catch (e) { }
  const csv = [cols.join(',')].concat(data.map(c => cols.map(k => '"' + String(c[k] ?? '').replace(/"/g, '""') + '"').join(','))).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = name; a.click();
}
function pickFile(accept = '') { return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => res(i.files[0]); i.click(); }); }
async function upload(extra) { const f = await pickFile('.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt'); if (!f) return false; const fd = new FormData(); fd.append('file', f); Object.entries(extra).forEach(([k, v]) => fd.append(k, v ?? '')); await api('files', 'upload', fd); return true; }
/* The numbers the CRM works by. The owner changes them in Settings › Rules (S.rules; api/lib.php rule()); these are the usual values. */
const RULE_DEF = { doc_days: 365, gen_days: 120, trash_hours: 72, lead_lost_hours: 24, lead_remind_min: 15, feas_valid_days: 30, feas_alert_days: 3, claim_hours: 36, idle_min: 30 };
const RULE = k => { const v = ((S && S.rules) || {})[k]; return v == null || v === '' || isNaN(+v) ? RULE_DEF[k] : +v; };
/* DOC_DAYS = days an uploaded document is kept, GEN_DAYS = days a paper made in the CRM is kept: read from the rules each time they are used */
Object.defineProperty(window, 'DOC_DAYS', { get: () => RULE('doc_days') }); Object.defineProperty(window, 'GEN_DAYS', { get: () => RULE('gen_days') });
/* days a document is kept: its own files.life (0 = until someone deletes it: tax bills, warranty cards), else the usual DOC_DAYS */
const docDays = f => f.kind === 'warranty' ? 0 : f.life == null ? DOC_DAYS : +f.life;
const docLeft = f => { const k = docDays(f); return k ? Math.ceil((new Date(String(f.created).replace(' ', 'T') + 'Z').getTime() + k * 864e5 - Date.now()) / 864e5) : 1e9; }; /* 1e9 = kept until deleted */
const fileLink = f => { const d = docLeft(f); return `<a href="api.php?m=files&a=get&id=${f.id}&v=1" target="_blank" rel="noopener">${esc(f.name)}</a> <small class="mut">${dt(f.created)} · ${Math.round(f.size / 1024)} KB</small> <small class="${d <= 30 ? 'dexp' : 'mut'}" title="Kept for a set time, then moved to the Recycle bin; tax bills and warranty cards stay">· ${d === 1e9 ? 'kept forever' : d > 0 ? d + ' day' + (d === 1 ? '' : 's') + ' left' : 'expiring'}</small>`; };
function noteBox(entity, id, notes, redo) {
  return `<div class="card"><h3>Notes & activity</h3>${canW(entity) ? `<div class="bar"><input id="nt" placeholder="Add a note or call log…" style="max-width:none;flex:1"><button class="btn" id="an">Add</button></div>` : ''}
  ${(notes || []).map(n => `<div class="act">${esc(n.text)}<br><small>${esc(n.user)} · ${n.created}</small></div>`).join('') || '<p class="mut">No notes yet</p>'}</div>`;
}
function bindNote(entity, id, redo) { const b = $('#an'); if (b) b.onclick = async () => { const t = $('#nt').value; if (!t.trim()) return; await api('notes', 'add', { entity, entity_id: id, text: t }); redo(); }; }

// WhatsApp click-to-chat with template picker; logs the message.
function waOpen(ctx) {
  if (BA()) return toast('WhatsApp is not available for Business Associates', 1);
  const T = (ctx.text ? [{ name: ctx.textName || 'Quotation details', text: ctx.text }] : []).concat(S.wa_templates || []); /* ctx.text: a ready message (e.g. a quotation's details), offered first */
  const fill = (txt, c) => txt.replace(/\{name\}/g, c.name || '').replace(/\{company\}/g, S.company.name).replace(/\{amount\}/g, c.amount ?? '').replace(/\{quote_no\}/g, c.quote_no ?? '').replace(/\{date\}/g, c.date ?? '');
  const m = modal(`<h3 style="margin-top:0">WhatsApp → ${esc(ctx.name)} <span class="mut">(${esc(ctx.phone || 'no phone')})</span></h3>
   <label>Template</label><select id="wt">${T.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('')}</select>
   <label>Message (editable)</label><textarea id="wm" rows="6"></textarea>
   <div class="bar" style="margin-top:12px"><button class="btn ok" id="wgo">Open in WhatsApp Web</button>${WA.on && canW('whatsapp') ? '<button class="btn" id="winb"><i class="i i-chat"></i> Send in CRM inbox</button>' : ''}<button class="btn sec" id="wx">Close</button></div>`);
  const set = () => $('#wm', m).value = fill(T[$('#wt', m).value]?.text || '', ctx);
  $('#wt', m).onchange = set; set();
  $('#wx', m).onclick = () => m.remove();
  if ($('#winb', m)) $('#winb', m).onclick = async () => { if (!waNum(ctx.phone)) return alert('This contact has no phone number');
    const r = await api('wa', 'start', { phone: ctx.phone, name: ctx.name, lead_id: ctx.lead_id || 0, customer_id: ctx.customer_id || 0 });
    try { sessionStorage.waDraft = $('#wm', m).value; } catch (e) { } m.remove(); WA.tab = 'inbox'; WA.chat = r.id; location.hash = '#/whatsapp'; route(); };
  $('#wgo', m).onclick = async () => {
    if (!waNum(ctx.phone)) return alert('This contact has no phone number');
    const text = $('#wm', m).value;
    waLaunch(ctx.phone, text);
    if (canW('whatsapp')) await api('whatsapp', 'log', { customer_id: ctx.customer_id, lead_id: ctx.lead_id, phone: ctx.phone, text });
    m.remove(); route();
  };
}

// ---------- Dashboard ----------
async function pgDashboard() {
  const d = await api('dashboard', 'get');
  const first = (ME.name || '').split(' ')[0];
  const hr = new Date().getHours(), gm = hr < 12 ? 'Morning' : hr < 17 ? 'Afternoon' : 'Evening';
  const vs = n => `${n >= 0 ? '+' : '-'}${Math.abs(n)}% vs last month`;
  const card = (ic, label, val, tdy, v, col, go) => `<a class="s3 card sc" href="${go}"><div class="sch"><span class="ic ft t-${String(go).replace('#/', '').split('/')[0]}">${ic}</span>${label}</div><b>${val}</b><small>${tdy} today</small><div class="line"></div><small class="mut">${v}</small></a>`;
  const QA = [['<i class="i i-plus"></i>', 'Add Lead', 'leads', 'new'], ['<i class="i i-target"></i>', 'View Leads', 'leads', '#/leads'], ['<i class="i i-users"></i>', 'Customers', 'customers', '#/customers'], ['<i class="i i-project"></i>', 'Projects', 'projects', '#/projects'], ['<i class="i i-receipt"></i>', 'Quotations', 'quotes', '#/quotes'], ['<i class="i i-note"></i>', 'New Quote', 'quotes', 'quote'],
    ['<i class="i i-coin"></i>', 'Subsidy', 'checklist', '#/subsidy'], ['<i class="i i-folder"></i>', 'KSEB Docs', 'checklist', '#/kseb'], ['<i class="i i-whatsapp"></i>', 'WhatsApp', 'whatsapp', '#/whatsapp'], ['<i class="i i-mail"></i>', 'Email', 'email', '#/email'], ['<i class="i i-megaphone"></i>', 'Meta Ads', 'ads', '#/ads'], ['<i class="i i-gear"></i>', 'Settings', 'settings', '#/settings'], ['<i class="i i-shield"></i>', 'Admin', 'admin', '#/admin']]
    .filter(q => q[2] === 'admin' ? ME.role === 'admin' : canR(q[2]) && (q[3] !== 'new' || canW('leads')) && (q[3] !== 'quote' || canW('quotes')));
  // lead trend (30 days)
  const days = [...Array(30)].map((_, i) => { const x = new Date(); x.setDate(x.getDate() - 29 + i); return x.toISOString().slice(0, 10); });
  const tm = Object.fromEntries(d.trend.map(t => [t.d, t])), max = Math.max(3, ...days.map(k => tm[k]?.n || 0));
  const px = i => 20 + i * (560 / 29), py = v => 120 - v / max * 100;
  const line = f => days.map((k, i) => `${px(i).toFixed(1)},${py(tm[k]?.[f] || 0).toFixed(1)}`).join(' ');
  const trend = `<svg viewBox="0 0 600 150" style="width:100%;height:auto"><defs><linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0071e3" stop-opacity=".25"/><stop offset="1" stop-color="#0071e3" stop-opacity="0"/></linearGradient></defs>
   ${[0, 1, 2, 3].map(i => `<line x1="20" x2="580" y1="${20 + i * 33.3}" y2="${20 + i * 33.3}" stroke="#ececf0"/>`).join('')}
   <polygon points="${px(0)},120 ${line('n')} ${px(29)},120" fill="url(#gA)"/><polyline points="${line('n')}" fill="none" stroke="#0071e3" stroke-width="2.5" stroke-linejoin="round"/><polyline points="${line('won')}" fill="none" stroke="#30a14e" stroke-width="2" stroke-dasharray="4 3"/>
   ${[0, 7, 14, 21, 29].map(i => `<text x="${px(i)}" y="142" font-size="11" fill="#8e8e93" text-anchor="middle">${dmy(days[i]).slice(0, 6)}</text>`).join('')}</svg>`;
  // source bars
  const smax = Math.max(1, ...d.sources.map(s => s.n)), cols = ['#0071e3', '#30a14e', '#ff9f0a', '#af52de', '#ff375f', '#64d2ff', '#8e8e93'];
  const src = d.sources.length ? d.sources.map((s, i) => `<div style="display:flex;align-items:center;gap:10px;margin:9px 0"><span style="width:110px;font-size:13px">${esc(s.s)}</span><div class="prog" style="flex:1"><i style="width:${s.n / smax * 100}%;background:${cols[i % cols.length]}"></i></div><b>${s.n}</b></div>`).join('') : '<div style="text-align:center;padding:30px 0"><b style="font-size:30px">0</b><br><small class="mut">LEADS</small></div>';
  // conversion
  const conv = d.leads_all ? Math.round(d.converted / d.leads_all * 1000) / 10 : 0;
  // target gauges: leads this month (Settings → monthly lead target) and customers this year (yearly customer target); green once reached
  const gaugeOf = (n, target, what, color) => {
    const f = Math.min(1, n / (target || 1)), done = n >= target;
    return `<div class="tgg"><svg viewBox="0 0 220 130" style="width:210px;max-width:100%"><path d="M10 115 A100 100 0 0 1 210 115" pathLength="100" fill="none" stroke="#ececf0" stroke-width="24"/><path d="M10 115 A100 100 0 0 1 210 115" pathLength="100" fill="none" stroke="${done ? '#34c759' : color}" stroke-width="24" stroke-dasharray="${f * 100} 100" stroke-linecap="butt"/>
     <text x="110" y="98" text-anchor="middle" font-size="26" font-weight="700" fill="#1d1d1f">${n.toLocaleString('en-IN')}</text><text x="110" y="117" text-anchor="middle" font-size="11" fill="#6e6e73">${what}</text></svg>
     <div class="mut" style="font-size:12.5px">${done ? '<b style="color:var(--ok)">Target reached</b>' : `Remaining <b style="color:var(--tx)">${(target - n).toLocaleString('en-IN')}</b>`} · Target <b style="color:var(--tx)">${target.toLocaleString('en-IN')}</b> · ${Math.round(f * 100)}%</div></div>`;
  };
  const mName = new Date().toLocaleDateString('en-GB', { month: 'long' });
  const gauge = gaugeOf(+d.leads_month || 0, +d.lead_target || 1000, 'leads in ' + mName, '#0071e3') + gaugeOf(+d.cust_year || 0, +d.customer_target || 2000, 'customers in ' + new Date().getFullYear(), '#5e5ce6');
  const lst = (arr, fn, empty) => arr.length ? `<div class="scroll">${arr.map(fn).join('')}</div>` : `<p class="mut">${empty}</p>`;
  const head = (t, extra = '') => `<div class="ch"><h3>${t}</h3>${extra}</div>`;
  /* daily summary tiles: only the ones with something waiting (a tile with 0 is hidden; nothing at all → "all clear") */
  const feeDue = k => (d.fees_due || []).filter(f => f.kind === k);
  const sumTiles = [['<i class="i i-calendar"></i>', d.due_today, 'Follow-ups today', 'today'], ['<i class="i i-alert"></i>', d.overdue, 'Overdue', 'overdue'],
    BA() ? ['<i class="i i-project"></i>', d.proj_active, 'Active projects', 'projects'] : ['<i class="i i-card"></i>', d.dues.length, 'Payments due', 'dues'],
    ['<i class="i i-folder"></i>', d.kseb_pending.length, 'Docs pending', 'docs'],
    ['<i class="i i-clipboard"></i>', feeDue('feasibility').length, 'Feasibility fee pending', 'fee-feasibility'], ['<i class="i i-receipt"></i>', feeDue('registration').length, 'Registration fee pending', 'fee-registration']]
    .filter(t => +t[1] > 0);
  $('#main').innerHTML =`<div class="dhead"><div><h2>Hello, ${esc(first)}!</h2><div class="mut">${BA() ? 'Here’s how your leads and customers are doing today.' : 'Here’s how Jasper Solar is doing today.'}</div></div><div class="dhr"><div class="dteam" id="dteam" role="button" tabindex="0" title="Who is online"></div><div class="mut dtime">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></div></div>
  <div class="dg">
   <div class="s8" id="newleads"></div>
   <div class="s4 card"><div style="display:flex;gap:12px;align-items:center"><div class="avatar"><i class="i i-sun"></i></div><div><b style="font-size:16px">Good ${gm}, ${esc(first)}</b><div class="mut" style="font-size:12px">Your daily summary</div></div></div>
    ${sumTiles.length ? `<div class="grid" style="grid-template-columns:1fr 1fr;gap:8px;margin-top:14px">${sumTiles.map(([i, n, l, k], x) => `<div class="tile go" role="button" tabindex="0" data-dt="${k}" title="Open ${esc(l.toLowerCase())}"${x === sumTiles.length - 1 && x % 2 === 0 ? ' style="grid-column:1/-1"' : ''}><span>${i}</span><div><b>${n}</b><small>${l}</small></div><i class="i i-chev tgo"></i></div>`).join('')}</div>` : '<div class="mut" style="font-size:13px;margin-top:14px"><i class="i i-check"></i> Nothing pending — all clear</div>'}
    ${d.overdue ? `<div class="warn"><span>${d.overdue + ' follow-up' + (d.overdue > 1 ? 's are' : ' is') + ' overdue'}</span><button class="btn sm" id="vod">View Overdue</button></div>` : ''}</div>

   ${card('<i class="i i-target"></i>', 'Active Leads', d.leads_total, d.leads_today, vs(d.leads_vs), '', '#/leads')}${card('<i class="i i-users"></i>', 'Customers', d.cust_total, d.cust_today, vs(d.cust_vs), '', '#/customers')}${card('<i class="i i-project"></i>', 'Active Projects', d.proj_active, d.proj_today, vs(d.proj_vs), '', '#/projects')}${card('<i class="i i-alert"></i>', 'Overdue Follow-ups', d.overdue, d.due_today, d.due_today + ' due today', '', '#/leads')}

   <div class="s12 card">${head('Quick Actions')}<div class="qa">${QA.map(q => `<button class="qb" data-qa="${q[3]}" data-go="${q[1]}"><span class="ft t-${q[3].startsWith('#/') ? q[3].slice(2) : q[3] === 'quote' ? 'quotes' : q[2]}">${q[0]}</span>${q[1]}</button>`).join('')}</div></div>

   ${d.finance ? [['Pipeline value', inr(d.pipeline)], ['Billed', inr(d.billed)], ['Received', inr(d.paid)], ['Outstanding', inr(d.outstanding)], ['Ad spend (month)', inr(d.spend_month)], ['Cost per lead', inr(d.cpl)]].map(([l, v]) => `<div class="s2 card stat"><b>${v}</b><span>${l}</span></div>`).join('') : ''}

   <div class="${BA() ? 's8' : 's6'} card">${head('Lead Trend · 30 days', '<small class="mut"><span style="color:#0071e3">●</span> Leads &nbsp;<span style="color:#30a14e">●</span> Won</small>')}${trend}</div>
   <div class="${BA() ? 's4' : 's3'} card">${head('Lead by Source')}${src}</div>
   <div class="s3 card ${BA() ? 'hide' : ''}" style="text-align:center">${head('Targets')}${gauge}</div>

   <div class="s4 card">${head('Lead → Customer Conversion', `<b style="font-size:24px;color:var(--ok)">${conv}%</b>`)}<div class="mut" style="font-size:12px;margin-bottom:10px">${d.converted} of ${d.leads_all} leads converted</div><div class="prog" style="height:10px"><i style="width:${Math.min(100, conv)}%"></i></div>
     <h3 style="margin-top:20px">Projects by stage</h3>${bars(d.stages.map(s => [s.stage, s.n]), S.project_stages)}</div>
   <div class="s4 card" id="cal"></div>
   <div class="s4 card">${head(BA() ? 'Your Recent Activity' : 'Recent Activity')}${lst(d.recent, r => `<div class="act"><b>${esc(r.user)}</b> ${esc(r.action)} ${esc(r.entity)} <span class="mut">${esc(r.detail || '')}</span><br><small>${r.created}</small></div>`, 'No recent activity')}</div>

   <div class="s4 card ${d.finance ? '' : 'hide'}">${head('Payments pending', `<span class="pill ${d.dues.length ? 'r' : ''}">${d.dues.length}</span>`)}${lst(d.dues.slice(0, 10), p => `<div class="act"><a href="#/projects/${p.id}"><b>${esc(p.customer || p.title)}</b></a> <b class="over">${inr(p.due)}</b><br><small>${esc(p.title)}</small></div>`, 'All clear')}</div>
   <div class="s4 card">${head('KSEB documents pending', `<span class="pill">${d.kseb_pending.length}</span>`)}${lst(d.kseb_pending.slice(0, 10), p => `<div class="act"><a href="#/projects/${p.id}"><b>${esc(p.title)}</b></a> ${p.done}/${p.total} done</div>`, 'All documents complete')}</div>
   <div class="s4 card">${head('Subsidy in progress', `<span class="pill">${d.subsidy_open.length}</span>`)}${lst(d.subsidy_open, p => `<div class="act"><a href="#/projects/${p.id}"><b>${esc(p.title)}</b></a> ${pill(p.subsidy_status || 'Not applied', stageCls(p.subsidy_status))} ${p.subsidy_amount ? inr(p.subsidy_amount) : ''}</div>`, 'None')}</div>
  </div>`;
  $$('[data-qa]').forEach(b => b.onclick = () => { const q = b.dataset.qa; if (q === 'new') leadModal(0); else if (q === 'quote') { sessionStorage.removeItem('lead2quote'); location.hash = '#/quotes/new'; } else location.hash = q; });
  if ($('#vod')) $('#vod').onclick = () => { LF.appt = 'overdue'; LF.active = 'active'; location.hash = '#/leads'; };
  /* daily summary tiles: follow-ups open the leads filtered to them; payments due and docs pending open their list,
     where a project opens its Payments (overview) or KSEB documents tab */
  const dashList = (title, rows, row, empty) => {
    const m = modal(`<div class="dlh"><h2>${title}</h2><span class="pill">${rows.length}</span><span class="sp"></span><button class="lvx" id="dlx" aria-label="Close"><i class="i i-x"></i></button></div>
      ${rows.length ? `<div class="dll">${rows.map((p, i) => `<button class="dlr" data-i="${i}">${row(p)}<i class="i i-chev"></i></button>`).join('')}</div>` : `<p class="mut">${empty}</p>`}`);
    $('#dlx', m).onclick = () => m.remove();
    return m;
  };
  const tileGo = k => {
    if (k === 'today' || k === 'overdue') { LF.appt = k; LF.active = 'active'; location.hash = '#/leads'; return; }
    if (k === 'projects') { location.hash = '#/projects'; return; }
    if (k === 'dues') {
      const m = dashList('Payments due', d.dues, p => `<span><b>${esc(p.customer || p.title)}</b><small class="mut">${esc(p.title)}</small></span><b class="over">${inr(p.due)}</b>`, 'No payments due');
      $$('.dlr', m).forEach(b => b.onclick = () => { m.remove(); TAB.proj = 'overview'; location.hash = '#/projects/' + d.dues[+b.dataset.i].id; });
    }
    if (k === 'docs') {
      const m = dashList('KSEB documents pending', d.kseb_pending, p => `<span><b>${esc(p.customer || p.title)}</b><small class="mut">${esc(p.title)}</small></span><span class="pill">${p.done}/${p.total} done</span>`, 'All KSEB documents are complete');
      $$('.dlr', m).forEach(b => b.onclick = () => { m.remove(); TAB.proj = 'kseb'; location.hash = '#/projects/' + d.kseb_pending[+b.dataset.i].id; });
    }
    if (k.startsWith('fee-')) { /* unpaid KSEB fee → its Finance list, searched to that customer and showing every status */
      const kind = k.slice(4), rows = feeDue(kind), title = kind === 'feasibility' ? 'Feasibility fee pending' : 'Registration fee pending';
      const m = dashList(title, rows, f => `<span><b>${esc(f.customer)}</b><small class="mut">${esc(f.phone || '')}${+f.amount ? ' · ' + inr(f.amount) : ''}</small></span><span class="pill ${+f.demanded ? 'b' : ''}">${+f.demanded ? 'Demanded' : 'Not demanded'}</span>`, 'Nothing pending');
      $$('.dlr', m).forEach(b => b.onclick = () => { m.remove(); if (typeof FEEQ !== 'undefined') { FEEQ.q = rows[+b.dataset.i].customer || ''; FEEQ.f[kind] = 'all'; } location.hash = '#/fees/' + kind; });
    }
  };
  $$('[data-dt]').forEach(t => { t.onclick = () => tileGo(t.dataset.dt); t.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tileGo(t.dataset.dt); } }; });
  /* Who's online: names come with the next presence check (it asks for them while #dteam is on the page) */
  dashTeam(); if (typeof presBeat === 'function') presBeat();
  // calendar with appointment dots
  let cm = new Date(); cm.setDate(1); let sel = today();
  const drawCal = () => {
    const y = cm.getFullYear(), mo = cm.getMonth(), start = (new Date(y, mo, 1).getDay() + 6) % 7, dim = new Date(y, mo + 1, 0).getDate(), by = {};
    d.appts.forEach(a => (by[a.d] = by[a.d] || []).push(a));
    const cells = []; for (let i = 0; i < start; i++) cells.push(''); for (let i = 1; i <= dim; i++) cells.push(`${y}-${String(mo + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`);
    const ev = by[sel] || [];
    $('#cal').innerHTML = `<div class="calw"><div><div class="ch"><h3><a href="#/calendar" style="color:inherit">Calendar</a></h3><a class="btn sec sm" href="#/calendar">Open</a><span class="sp"></span><button class="btn sec sm" id="cp">‹</button><b style="font-size:13px">${cm.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b><button class="btn sec sm" id="cn">›</button></div>
     <div class="cg">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(x => `<i class="mut">${x}</i>`).join('')}${cells.map(c => c ? `<button class="cd ${c === today() ? 'tdy' : ''} ${c === sel ? 'sel' : ''}" data-d="${c}">${+c.slice(8)}${by[c] ? '<u></u>' : ''}</button>` : '<span></span>').join('')}</div></div>
     <div class="cev"><b>${new Date(sel + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</b> <small class="mut">${ev.length} appointment${ev.length === 1 ? '' : 's'}</small>
      ${ev.map(e => `<div class="act"><a href="#/leads">${esc(e.name)}</a><br><small>${esc(e.status)}</small></div>`).join('') || '<p class="mut" style="font-size:13px">No appointments scheduled.</p>'}</div></div>`;
    $('#cp').onclick = () => { cm.setMonth(cm.getMonth() - 1); drawCal(); }; $('#cn').onclick = () => { cm.setMonth(cm.getMonth() + 1); drawCal(); };
    $$('.cd').forEach(b => b.onclick = () => { sel = b.dataset.d; drawCal(); });
  };
  drawCal(); renderNewLeads();
}
function bars(data, order) {
  const m = Object.fromEntries(data), max = Math.max(1, ...data.map(d => d[1]));
  const keys = (order || []).filter(k => m[k] !== undefined).concat(data.map(d => d[0]).filter(k => !(order || []).includes(k)));
  return keys.map(k => `<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><span style="width:100px;font-size:13px">${esc(k)}</span><div class="prog" style="flex:1"><i style="width:${m[k] / max * 100}%;background:var(--pri)"></i></div><b>${m[k]}</b></div>`).join('') || '<p class="mut">No data</p>';
}

// ---------- Leads ----------
const LCOLS = [['date', 'Added'], ['name', 'Name'], ['phone', 'Phone'], ['status', 'Status'], ['city', 'Location'], ['owner', 'Claimed by'], ['remark', 'Remark'], ['appt', 'Appt'], ['cb', 'Call back']];
const LW = { date: 92, phone: 112, status: 96, owner: 158, appt: 128, cb: 136 }; // fixed px; name/location/remark share the rest
let LF = { q: '', status: '', active: 'active', city: '', appt: '', own: '', sort: 'created', dir: -1, edit: false };
let LHIDE = []; try { LHIDE = JSON.parse(localStorage.lcols || '[]'); } catch (e) { }
// speed: build each date formatter once (toLocaleDateString with options builds a new one on every call — seconds on a 4,000-row table)
const DF = { dmy: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), dm: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }), dmyy: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) };
const dfmt = (f, d) => isNaN(d) ? 'Invalid Date' : f.format(d); // same text as before for bad dates (format() would throw)
const dmy = s => s ? dfmt(DF.dmy, new Date(s.slice(0, 10) + 'T00:00:00')) : '';
const isActiveLead = l => !['Won', 'Lost'].includes(l.status);
const dshort = s => { if (!s) return ''; const d = new Date(s.slice(0, 10) + 'T00:00:00'); return dfmt(d.getFullYear() === new Date().getFullYear() ? DF.dm : DF.dmyy, d); };
function apptBadge(l) {
  if (!l.appt) return '<span class="pill" style="color:var(--mut)">Not scheduled</span>';
  const od = l.appt < today() && isActiveLead(l), days = Math.round((new Date(today()) - new Date(l.appt)) / 864e5);
  return `<span class="pill ${od ? 'r' : 'g'}" title="${dmy(l.appt)}${od ? ' — overdue by ' + days + ' day' + (days > 1 ? 's' : '') : ''}">${od ? '<i class="i i-alert"></i> ' : '● '}${dshort(l.appt)}${od ? ' · ' + days + 'd' : ''}</span>`;
}
function apptBadgeOld(l) {
  if (!l.appt) return '<span class="pill" style="color:var(--mut)">● Not Scheduled</span>';
  const od = l.appt < today() && isActiveLead(l), days = Math.round((new Date(today()) - new Date(l.appt)) / 864e5);
  return `<span class="pill g">● ${dmy(l.appt)}</span>${od ? `<br><span class="pill r" style="margin-top:3px"><i class="i i-alert"></i> OVERDUE · ${days}d</span>` : ''}`;
}
// ---- call-back reminders: "call me after a few days". Stored as local 'Y-m-d H:i'; the server sends a bell +
// desktop notification to whoever set it and the lead's owner when it comes due (see callback_alerts in claims.php).
const cbPad = n => String(n).padStart(2, '0');
const cbYmd = d => d.getFullYear() + '-' + cbPad(d.getMonth() + 1) + '-' + cbPad(d.getDate());
const cbNow = () => { const d = new Date(); return cbYmd(d) + ' ' + cbPad(d.getHours()) + ':' + cbPad(d.getMinutes()); };
const cbT12 = t => { const [h, m] = t.split(':').map(Number); return (h % 12 || 12) + (m ? ':' + cbPad(m) : '') + (h < 12 ? ' AM' : ' PM'); };
const cbDay = (d, wd) => d === today() ? 'Today' : d === cbYmd(new Date(Date.now() + 864e5)) ? 'Tomorrow' : (wd ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(d + 'T00:00:00').getDay()] + ' ' : '') + dshort(d);
const cbWhen = at => cbDay(at.slice(0, 10), 1) + ', ' + cbT12(at.slice(11, 16)); // "Tue 12 Nov, 10 AM"
function cbBadge(l) {
  if (!l.callback_at) return l.can_edit ? '<span class="mut cbadd"><i class="i i-phone"></i> Set</span>' : '<span class="mut">—</span>';
  const due = l.callback_at <= cbNow(), td = l.callback_at.slice(0, 10) === today();
  return `<span class="pill ${due ? 'r' : td ? 'y' : 'b'}" title="${esc('Call back ' + cbWhen(l.callback_at) + (l.callback_note ? ' — ' + l.callback_note : ''))}"><i class="i i-phone"></i> ${due ? 'Due · ' : ''}${esc(cbDay(l.callback_at.slice(0, 10)))}</span>`
    + `<small class="cbsub">${esc(cbT12(l.callback_at.slice(11, 16)) + (l.callback_note ? ' · ' + l.callback_note : ''))}</small>`;
}
const CB_QUICK = [['1h', 'In 1 hour'], ['1d', 'Tomorrow'], ['2d', '2 days'], ['3d', '3 days'], ['1w', '1 week'], ['2w', '2 weeks'], ['1m', '1 month'], ['3m', '3 months']];
const cbBtnTxt = l => '<i class="i i-phone"></i> ' + (l.callback_at ? 'Call back: ' + esc(cbWhen(l.callback_at)) : 'Call back reminder');
let LEADCB = null; // the Leads page redraws its row when a reminder changes elsewhere (lead form, bell)
function callbackBox(l, after) {
  const cur = l.callback_at || '', tmr = cbYmd(new Date(Date.now() + 864e5));
  const m = modal(`<h3 style="margin-top:0"><i class="i i-phone"></i> Call back — ${esc(l.name)}</h3>
   <p class="mut" style="margin:-4px 0 12px;font-size:13px">${cur ? `Reminder set for <b>${esc(cbWhen(cur))}</b>${cur <= cbNow() ? ' — <b style="color:#c4271f">due now</b>' : ''}.` : 'When should we call back? You' + (l.assigned_to && l.assigned_to != ME.id ? ' and the lead’s owner' : '') + ' get a notification at that time.'}</p>
   <div class="cbq">${CB_QUICK.map(([k, t]) => `<button type="button" class="btn sec sm" data-q="${k}">${t}</button>`).join('')}</div>
   <div class="cbin"><span>Or in</span><input id="cbn" type="number" min="1" max="365" value="4" inputmode="numeric" aria-label="How many"><select id="cbu" aria-label="Days, weeks or months"><option value="d">days</option><option value="w">weeks</option><option value="m">months</option></select></div>
   <div class="two"><div><label for="cbd">Date</label><input id="cbd" type="date" min="${today()}" value="${cur ? cur.slice(0, 10) : tmr}"></div><div><label for="cbt">Time</label><input id="cbt" type="time" value="${cur ? cur.slice(11, 16) : '10:00'}"></div></div>
   <label for="cbnote">Note (optional)</label><input id="cbnote" maxlength="300" ${SPELL} placeholder="e.g. Call after salary day, ask about the subsidy" value="${esc(l.callback_note || '')}">
   <div class="bar" style="margin-top:14px"><button class="btn" id="cbs"><i class="i i-bell"></i> ${cur ? 'Update reminder' : 'Set reminder'}</button><button class="btn sec" id="cbc">Cancel</button>${cur ? '<span class="sp"></span><button class="btn sec" id="cbdone"><i class="i i-check"></i> Called — done</button><button class="btn sec" id="cbx">Remove</button>' : ''}</div>`);
  const D = $('#cbd', m), T = $('#cbt', m), mark = k => $$('[data-q]', m).forEach(b => b.classList.toggle('on', b.dataset.q === k));
  const jump = (n, u) => { const d = new Date(); if (u === 'h') { d.setMinutes(d.getMinutes() + 60 * n + (5 - d.getMinutes() % 5) % 5); T.value = cbPad(d.getHours()) + ':' + cbPad(d.getMinutes()); }
    else if (u === 'm') { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); } else d.setDate(d.getDate() + n * (u === 'w' ? 7 : 1));
    D.value = cbYmd(d); };
  if (!cur) mark('1d');
  $$('[data-q]', m).forEach(b => b.onclick = () => { jump(+b.dataset.q.slice(0, -1), b.dataset.q.slice(-1)); mark(b.dataset.q); });
  const custom = () => { const n = Math.max(1, Math.min(365, +$('#cbn', m).value || 1)); jump(n, $('#cbu', m).value); mark(''); };
  $('#cbn', m).oninput = custom; $('#cbu', m).onchange = custom; D.onchange = T.onchange = () => mark('');
  const send = async (at, done) => {
    const note = at ? $('#cbnote', m).value.trim() : '';
    await api('leads', 'callback', { id: l.id, at, note, done: done ? 1 : 0 });
    l.callback_at = at; l.callback_note = note; m.remove();
    toast(at ? 'Call back reminder set — ' + cbWhen(at) : done ? 'Call back done' : 'Call back reminder removed');
    if (LEADCB) LEADCB(l.id, at, note); if (after) after();
  };
  $('#cbs', m).onclick = () => { if (!D.value || !T.value) return alert('Pick a date and a time'); const at = D.value + ' ' + T.value;
    if (at <= cbNow()) return alert('That time has already passed — pick a later time.'); send(at); };
  $('#cbc', m).onclick = () => m.remove();
  if (cur) { $('#cbdone', m).onclick = () => send('', true); $('#cbx', m).onclick = () => send(''); }
  m.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); m.remove(); } }); /* only this box, not the lead form under it */
  $('[data-q].on', m)?.focus();
}
// ---- claiming: a claimed lead is locked to its owner; owner/admin can unclaim, owner/admin/assistant manager can reassign ----
const isAdm = () => ME.role === 'admin';
/* Leads list: the owner's display picture (initials when there is none) with a lock badge; the name shows on hover */
/* Claim clock: a claimed lead unlocks for everyone when it is not a customer by l.unlock_at (unix seconds, from the server) */
const claimLeft = l => { const at = +l.unlock_at || 0; if (!at) return null; const m = Math.floor((at * 1000 - Date.now()) / 60000);
  return { m, soon: m < 360, text: m <= 0 ? 'Unlocking' : m < 60 ? m + 'm left' : m < 2880 ? Math.floor(m / 60) + 'h left' : Math.floor(m / 1440) + 'd left', when: dfmt(DF.dmy, new Date(at * 1000)) + ', ' + new Date(at * 1000).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) }; };
const claimChip = l => { const c = claimLeft(l); if (!c) return ''; const tip = esc(`Unlocks for everyone on ${c.when} unless the lead becomes a customer`);
  return `<span class="clmt${c.soon ? ' soon' : ''}" title="${tip}" aria-label="${tip}"><i class="i i-clock"></i>${c.text}</span>`; };
const claimRule = () => `You have ${RULE('claim_hours')} hours to convert a claimed lead to a customer. After that the claim unlocks and anyone can claim the lead.`;
const ownerDp = l => { const me = l.assigned_to == ME.id, who = me ? 'You' + (ME.name ? ' (' + ME.name + ')' : '') : (l.owner_name || 'another user'), tip = esc('Claimed by ' + who + (l.claimed_at ? ' · ' + agoStr(l.claimed_at) : ''));
  return `<span class="owndp${me ? ' me' : ''}" title="${tip}" data-tip="${tip}" aria-label="${tip}"><span class="dp" data-pres="${l.assigned_to}">${avImg(l.assigned_to, me ? ME.avatar || l.owner_av : l.owner_av, me ? ME.name : l.owner_name)}</span><span class="lk"><i class="i i-lock"></i></span></span>`; };
const ownerCellRow = l => (l.assigned_to ? ownerDp(l) : ownerCell(l)) + (l.assigned_to && (isAdm() || l.assigned_to == ME.id) ? ' <button class="ib unc" data-a="unlock" title="Unclaim — release this lead"><i class="i i-x"></i></button>' : '') + (l.assigned_to ? claimChip(l) : '');
const ownerCell = l => l.assigned_to ? `<span class="own${l.assigned_to == ME.id ? ' me' : ''}" title="Claimed${l.claimed_at ? ' ' + agoStr(l.claimed_at) : ''}"><i class="i i-lock"></i>${esc(l.assigned_to == ME.id ? 'You' : (l.owner_name || 'Claimed'))}</span>`
  : (ME.can_claim && canW('leads') ? '<button class="btn sm claim" data-a="claim"><i class="i i-userplus"></i> Claim</button>' : '<span class="mut">Unclaimed</span>');
async function claimLead(id, name) {
  if (!confirm(`Claim ${name || 'this lead'}?

${claimRule()}`)) return false;
  try { const r = await api('leads', 'claim', { id }); toast('Claimed' + (name ? ': ' + name : '') + (r && r.unlock_at ? ` — locked to you for ${r.hours} hours` : ' — locked to you')); return true; } catch (e) { return false; } }
async function unlockLead(id, mine) { if (!confirm(mine ? 'Unclaim this lead? It goes back to the unclaimed pool and anyone allowed can claim it.' : 'Unclaim (unlock) this lead? It goes back to the unclaimed pool.')) return false; await api('leads', 'unclaim', { id }); toast('Lead unclaimed — back in the pool'); return true; }
const canReassignLead = l => canW('leads') && OWN.canReassign(l.assigned_to, ME);
async function assignLead(l) { return !!(await reassignBox('leads', l)); } // picker in app26.js
async function pgLeads() {
  const [leads, camps] = await Promise.all([list('leads'), canR('ads') ? list('campaigns') : [], discSummary()]);
  CACHE.leads = leads; CACHE.camps = camps; const w = canW('leads');
  if (LF.ownFor !== ME.id) { LF.ownFor = ME.id; LF.own = ownView('leads') === 'me' ? 'me' : ''; } // Me / All remembered per person
  const cities = [...new Set(leads.map(l => l.city).filter(Boolean))].sort();
  $('#main').innerHTML = `<div class="bar" style="align-items:flex-start;margin-bottom:6px"><div><h2 style="margin:0;font-size:26px">Leads</h2><div class="mut" id="lcount"></div></div><span class="sp"></span>
   <button class="btn sec" id="lref"><i class="i i-refresh"></i> Refresh</button>${w ? `<button class="btn sec" id="ledit"><i class="i i-pencil"></i> Edit ${LF.edit ? 'ON' : 'OFF'}</button><button class="btn" id="lnew"><i class="i i-plus"></i> Add Lead</button>` : ''}</div>
   <div class="bar lbar" style="margin-top:12px">${ownSwitch('leads', LF.own === 'me' ? 'me' : 'all')}<input id="lq" placeholder="Search by name, phone, city, location…" style="max-width:340px" value="${esc(LF.q)}">
   <select id="ls" title="Status"><option value="">All status</option>${S.lead_statuses.map(s => `<option ${LF.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
   <select id="la">${[['active', 'Active'], ['all', 'All leads'], ['won', 'Won'], ['lost', 'Lost']].map(([v, l]) => `<option value="${v}" ${LF.active === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
   <select id="lc" title="City"><option value="">All cities</option>${cities.map(c => `<option ${LF.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
   <select id="lap" title="Appointments and call backs">${(o => `${o([['', 'All appts']])}<optgroup label="Appointment">${o([['overdue', 'Overdue'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['none', 'Not scheduled']])}</optgroup><optgroup label="Call back">${o([['cb_due', 'Call back due'], ['cb_today', 'Call back today'], ['cb_set', 'Call back set']])}</optgroup>`)(a => a.map(([v, l]) => `<option value="${v}" ${LF.appt === v ? 'selected' : ''}>${l}</option>`).join(''))}</select>
   <select id="lown" title="Claimed by"><option value="">All owners</option><option value="me" ${LF.own === 'me' ? 'selected' : ''}>My leads</option><option value="none" ${LF.own === 'none' ? 'selected' : ''}>Unclaimed</option>${isAdm() ? [...new Map(leads.filter(l => l.assigned_to).map(l => [l.assigned_to, l.owner_name])).entries()].map(([id, n]) => `<option value="${id}" ${LF.own == id ? 'selected' : ''}>Claimed by ${esc(n)}</option>`).join('') : ''}</select>
   <div style="position:relative"><button class="btn sec" id="lcol"><i class="i i-menu"></i> Columns</button><div id="lcm" class="card hide" style="position:absolute;z-index:9;top:42px;left:0;width:190px;padding:10px">${LCOLS.map(([k, l]) => `<label style="margin:4px 0;display:flex;gap:8px;align-items:center;color:var(--tx);font-size:14px"><input type="checkbox" style="width:auto" data-col="${k}" ${LHIDE.includes(k) ? '' : 'checked'}>${l}</label>`).join('')}</div></div>
   <span class="sp"></span>${canExport() ? '<button class="btn sec" id="lex" title="Export CSV"><i class="i i-download"></i> Export</button>' : ''}${w ? '<button class="btn sec" id="lim" title="Import CSV"><i class="i i-upload"></i> Import</button>' : ''}</div>
   ${w ? `<p class="mut" style="font-size:13px;margin:0 0 10px"><i class="i i-pencil"></i> ${LF.edit ? 'Click any cell to edit it inline.' : 'Click a Remark or Appt cell to edit it. Turn Edit ON to edit the other columns.'} Click the column headers to sort.</p>` : ''}
   <div class="card tw fitbox" style="padding:0"><table id="ltb" data-min="1000"></table></div>`;

  const filtered = () => {
    const t = LF.q.toLowerCase(), td = today(), now = cbNow();
    if (LF.appt.startsWith('cb_')) { const cb = LF.appt; LF.appt = ''; const r = filtered(); LF.appt = cb; // call-back filters: everything else as usual, then by reminder
      return r.filter(l => l.callback_at && (cb === 'cb_set' || (cb === 'cb_due' ? l.callback_at <= now : l.callback_at.slice(0, 10) === td))); }
    let r = leads.filter(l => (!LF.status || l.status === LF.status) && (LF.active === 'all' || (LF.active === 'active' ? isActiveLead(l) : l.status === (LF.active === 'won' ? 'Won' : 'Lost')))
      && (!LF.city || l.city === LF.city) && (!t || [l.name, l.phone, l.city, l.location, l.remark, l.address].join(' ').toLowerCase().includes(t))
      && (!LF.own || (LF.own === 'me' ? l.assigned_to == ME.id : LF.own === 'none' ? !l.assigned_to : l.assigned_to == LF.own))
      && (!LF.appt || (LF.appt === 'none' ? !l.appt : LF.appt === 'overdue' ? l.appt && l.appt < td && isActiveLead(l) : LF.appt === 'today' ? l.appt === td : l.appt > td)));
    const key = l => l[LF.sort] ?? '';
    return r.sort((a, b) => { const x = key(a), y = key(b); if (LF.sort === 'appt' || LF.sort === 'callback_at') { if (!x) return 1; if (!y) return -1; } return (x > y ? 1 : x < y ? -1 : 0) * LF.dir; });
  };
  const sk = k => k === 'date' ? 'created' : k === 'cb' ? 'callback_at' : k;
  let shown = 0; // rows on screen; a redraw after an edit keeps at least this many so the scroll position stays put
  const draw = reset => {
    const rows = filtered(), show = LCOLS.filter(c => !LHIDE.includes(c[0]));
    $('#lcount').textContent = rows.length + ' records';
    const QE = ['remark', 'appt']; // always editable inline
    const ed = (l, f, html, title) => `<td data-f="${f}" class="${w && l.can_edit && (LF.edit || QE.includes(f)) ? 'qe' : ''}" title="${esc(title || '')}">${html}</td>`;
    const loc = l => { const c = l.city || '', o = l.location || l.address || ''; return o && o.toLowerCase() !== c.toLowerCase() ? (c ? c + ' · ' + o : o) : c; };
    const cell = {
      date: l => `<td class="dt" title="${esc(dmy(l.created) + (l.added_by ? ' · added by ' + l.added_by : ''))}">${dshort(l.created)}<small>${esc(l.added_by || '')}</small></td>`,
      name: l => ed(l, 'name', `<div class="nm">${l.notify ? '<span class="ndot" title="New lead — not contacted yet"></span>' : ''}<b>${esc(l.name)}</b>${BA() ? '' : ltBadge(l.lead_type || (l.meta_id || l.source === 'Meta Ads' ? 'meta' : 'office'))}</div>`, l.name),
      phone: l => ed(l, 'phone', `<span class="ph">${esc(l.phone)}</span>`),
      status: l => ed(l, 'status', pill(l.status, stageCls(l.status))),
      city: l => ed(l, 'city', `<span class="clip">${esc(loc(l))}</span>`, loc(l)),
      owner: l => `<td class="ownc">${ownerCellRow(l)}</td>`,
      remark: l => ed(l, 'remark', l.remark ? `<span class="clamp">${esc(l.remark)}</span>` : (l.can_edit ? '<span class="mut"><i>Add remark</i></span>' : ''), l.remark),
      appt: l => ed(l, 'appt', apptBadge(l)),
      cb: l => `<td data-cb="1" class="cbc${w && l.can_edit ? ' qe' : ''}">${cbBadge(l)}</td>` };
    const acts = l => !l.can_edit ? `<button class="ib" title="View" data-a="vw"><i class="i i-eye"></i></button>`
      : `${discBtn(l.id, 1)}${l.phone ? '<a class="ib" title="Call" href="tel:' + esc(l.phone) + '"><i class="i i-phone"></i></a>' : ''}<button class="ib" title="View / edit" data-a="vw"><i class="i i-eye"></i></button><button class="ib" title="More actions" data-a="more"><i class="i i-dots"></i></button>`;
    const rowHtml = l => `<tr data-id="${l.id}">${show.map(([k]) => cell[k](l)).join('')}<td class="lact">${acts(l)}</td></tr>`;
    const tb = $('#ltb'); let n = Math.min(rows.length, Math.max(LAZY_FIRST, reset === true ? 0 : shown));
    tb.innerHTML = `<colgroup>${show.map(([k]) => `<col${LW[k] ? ` style="width:${LW[k]}px"` : ''}>`).join('')}<col style="width:${isAdm() ? 136 : 128}px"></colgroup>
      <thead><tr>${show.map(([k, t]) => `<th data-sort="${sk(k)}">${t}<span class="so">${LF.sort === sk(k) ? (LF.dir > 0 ? '↑' : '↓') : '⇅'}</span></th>`).join('')}<th class="right">Actions</th></tr></thead>
      <tbody>${rows.slice(0, n).map(rowHtml).join('') || `<tr><td colspan="${show.length + 1}" class="mut">No leads match</td></tr>`}</tbody>`;
    if (reset === true && tb.parentElement) tb.parentElement.scrollTop = 0; // new sort / filter / search starts at the top
    $$('#ltb th[data-sort]').forEach(h => h.onclick = () => { const k = h.dataset.sort; LF.dir = LF.sort === k ? -LF.dir : (k === 'created' ? -1 : 1); LF.sort = k; draw(true); });
    const byId = new Map(rows.map(l => [String(l.id), l])); // O(1) lookup per row (was a scan of every lead for every row)
    const bind = trs => trs.forEach(tr => {
      const l = byId.get(tr.dataset.id); if (!l) return;
      if (w && l.can_edit) $$('td[data-f]', tr).forEach(td => { if (LF.edit || QE.includes(td.dataset.f)) td.onclick = () => startEdit(td, l); });
      if (w && l.can_edit) $$('td[data-cb]', tr).forEach(td => td.onclick = () => callbackBox(l));
      $$('[data-a]', tr).forEach(b => b.onclick = e => { e.stopPropagation(); act(b.dataset.a, l, b); });
    });
    bind([...tb.tBodies[0].rows]); shown = n;
    lazyMore(tb, step => { const body = tb.tBodies[0], from = body.rows.length, next = rows.slice(n, n + step);
      body.insertAdjacentHTML('beforeend', next.map(rowHtml).join('')); bind([...body.rows].slice(from)); n += next.length; shown = n; return n < rows.length; }, n < rows.length);
    fitTable();
  };
  // one handler for row buttons and the "more" menu
  const act = async (a, l, btn) => {
    if (a === 'more') return moreMenu(l, btn);
    closeMenu();
    if (a === 'claim') { if (await claimLead(l.id, l.name)) route(); return; }
    if (a === 'unlock') { if (await unlockLead(l.id, l.assigned_to == ME.id)) route(); return; }
    if (a === 'assign') { if (await assignLead(l)) route(); return; }
    if (a === 'wa') waOpen({ name: l.name, phone: l.phone, lead_id: l.id });
    if (a === 'ds') discOpen({ lead_id: l.id });
    if (a === 'vw' || a === 'ed') leadModal(l.id);
    if (a === 'rm') return remarkBox(l);
    if (a === 'cb') return callbackBox(l);
    if (a === 'cv') return convertBox(l, r => { location.hash = '#/customers/' + r.customer_id; });
    if (a === 'oc') location.hash = '#/customers/' + l.customer_id;
    if (a === 'qt') { sessionStorage.lead2quote = JSON.stringify({ lead_id: l.id, customer_id: l.customer_id || '', name: l.name }); location.hash = '#/quotes/new'; }
  };
  /* "Add remark": a box with spell check (the browser's prompt() has none). Ctrl+Enter saves, Esc closes. */
  const remarkBox = l => {
    const m = modal(`<h3 style="margin-top:0">Remark — ${esc(l.name)}</h3><textarea id="rmt" rows="4" ${SPELL} placeholder="Type the remark…">${esc(l.remark || '')}</textarea>
     <div class="bar" style="margin-top:12px"><button class="btn" id="rms">Save</button><button class="btn sec" id="rmc">Cancel</button></div>`);
    const t = $('#rmt', m); t.focus(); t.setSelectionRange(t.value.length, t.value.length);
    $('#rmc', m).onclick = () => m.remove();
    $('#rms', m).onclick = async () => { if (t.value !== (l.remark || '')) { l.remark = t.value; await api('leads', 'save', { ...l }); } m.remove(); draw(); };
    t.onkeydown = e => { if (e.key === 'Escape') m.remove(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('#rms', m).click(); };
  };
  const closeMenu = () => { const m = $('#lmenu'); if (m) m.remove(); };
  const moreMenu = (l, btn) => {
    closeMenu();
    const items = [l.phone && !BA() ? ['wa', 'whatsapp', 'WhatsApp'] : null, ['rm', 'note', 'Add remark'], ['cb', 'phone', l.callback_at ? 'Call back: ' + cbWhen(l.callback_at) : 'Call back reminder'], ['ed', 'pencil', 'Edit lead'], l.customer_id ? ['oc', 'user', 'Open customer'] : ['cv', 'userplus', 'Convert to customer'], canW('quotes') ? ['qt', 'receipt', 'Create quotation'] : null,
      l.assigned_to && (isAdm() || l.assigned_to == ME.id) ? ['unlock', 'lock', l.assigned_to == ME.id ? 'Unclaim (release lead)' : 'Unclaim / unlock (admin)'] : null, canReassignLead(l) ? ['assign', 'users', l.assigned_to ? 'Reassign to…' : 'Assign to…'] : null].filter(Boolean);
    const m = document.createElement('div'); m.id = 'lmenu'; m.className = 'card menu';
    m.innerHTML = items.map(([a, i, t]) => `<button data-m="${a}"><i class="i i-${i}"></i>${t}</button>`).join('');
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect(), mh = m.offsetHeight;
    m.style.left = Math.max(8, r.right - m.offsetWidth) + 'px'; m.style.top = (r.bottom + mh + 8 > innerHeight ? r.top - mh - 6 : r.bottom + 6) + 'px';
    $$('[data-m]', m).forEach(b => b.onclick = () => act(b.dataset.m, l));
    setTimeout(() => document.addEventListener('click', function h(e) { if (!m.contains(e.target)) { closeMenu(); document.removeEventListener('click', h); } }), 0);
  };
  // table fills the rest of the window; header stays visible while rows scroll
  const fitTable = () => { const box = $('#ltb')?.parentElement; if (!box) return; const top = box.getBoundingClientRect().top; box.style.maxHeight = Math.max(260, innerHeight - top - 18) + 'px'; };
  if (!window._lfit) { window._lfit = true; addEventListener('resize', () => { if (location.hash.startsWith('#/leads')) { const b = $('#ltb')?.parentElement; if (b) { const t = b.getBoundingClientRect().top; b.style.maxHeight = Math.max(260, innerHeight - t - 18) + 'px'; } } }); }
  const startEdit = (td, l) => {
    const f = td.dataset.f; if (td.querySelector('input,select,textarea')) return; let el;
    if (f === 'status') { el = document.createElement('select'); el.innerHTML = S.lead_statuses.map(s => `<option ${s === l.status ? 'selected' : ''}>${s}</option>`).join(''); }
    else if (f === 'remark') { el = spellOn(document.createElement('textarea')); el.rows = 3; el.value = l.remark || ''; }
    else { el = document.createElement('input'); el.type = f === 'appt' ? 'date' : f === 'phone' ? 'tel' : 'text'; el.value = (f === 'location' ? (l.location || l.address) : l[f]) || ''; }
    td.innerHTML = ''; td.appendChild(el); el.focus(); if (f === 'remark') el.setSelectionRange(el.value.length, el.value.length); let fin = false;
    const done = async save => { if (fin) return; fin = true; if (save && el.value !== (l[f] || '')) { if (f === 'name' && !el.value.trim()) { draw(); return; } l[f] = el.value; await api('leads', 'save', { ...l }); } draw(); };
    /* Enter saves; in the remark box Shift+Enter starts a new line. Not while a phone keyboard is still composing a word. */
    el.onblur = () => done(true); el.onchange = () => done(true); el.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing && !(f === 'remark' && e.shiftKey)) { e.preventDefault(); done(true); } if (e.key === 'Escape') done(false); };
  };
  const drawSoon = debounce(() => draw(true), 120);
  LEADCB = (id, at, note) => { const x = leads.find(y => y.id == id); if (x) { x.callback_at = at; x.callback_note = note; } if ($('#ltb')) draw(); };
  $('#lq').oninput = e => { LF.q = e.target.value; drawSoon(); };
  [['ls', 'status'], ['la', 'active'], ['lc', 'city'], ['lap', 'appt'], ['lown', 'own']].forEach(([id, k]) => $('#' + id).onchange = e => { LF[k] = e.target.value; draw(true); });
  /* Me / All and the owner list stay in step: Me = "My leads"; any other owner choice is part of All */
  $('#lown').addEventListener('change', () => { const v = LF.own === 'me' ? 'me' : 'all'; ownSave('leads', v); ownMark($('.lbar'), v); });
  ownBind($('.lbar'), 'leads', v => { LF.own = v === 'me' ? 'me' : ''; $('#lown').value = LF.own; draw(true); });
  $('#lref').onclick = () => route();
  if ($('#ledit')) $('#ledit').onclick = () => { LF.edit = !LF.edit; route(); };
  if ($('#lnew')) $('#lnew').onclick = () => leadModal(0);
  $('#lcol').onclick = () => $('#lcm').classList.toggle('hide');
  $$('[data-col]').forEach(c => c.onchange = () => { LHIDE = $$('[data-col]').filter(x => !x.checked).map(x => x.dataset.col); try { localStorage.lcols = JSON.stringify(LHIDE); } catch (e) { } draw(); });
  if ($('#lex')) $('#lex').onclick = () => csvDownload('leads-' + today() + '.csv', ['name', 'phone', 'email', 'city', 'location', 'source', 'lead_type', 'status', 'appt', 'remark', 'kw', 'budget', 'added_by', 'created', 'notes'], leads);
  if ($('#lim')) $('#lim').onclick = async () => { const f = await pickFile('.csv'); if (!f) return; const rows = csvObjs(await f.text()); let n = 0; for (const r of rows) { if (!r.name) continue; await api('leads', 'save', { ...r, status: r.status || 'New' }); n++; } alert('Imported ' + n + ' leads'); route(); };
  draw(); DISC.lredraw = draw;
}
async function leadModal(id) {
  const l = id ? await api('leads', 'get', undefined, '&id=' + id) : { status: 'New', source: S.lead_sources[0] };
  if (id && typeof refreshFeed === 'function' && (FEED.leads || []).some(x => x.id == id)) refreshFeed(); // viewed → drops off the dashboard list
  if (id && !l.location) l.location = l.address;
  const F = [{ k: 'name', l: 'Name' }, { k: 'phone', l: 'Phone', t: 'tel' }, { k: 'email', l: 'Email' }, { k: 'source', l: 'Source', opts: S.lead_sources }, ...(BA() ? [] : [{ k: 'lead_type', l: 'Lead type', opts: l.meta_id ? [['meta', 'Meta (from the Meta form)']] : LT_OPTS }]), { k: 'city', l: 'City' }, { k: 'location', l: 'Location / address' },
    { k: 'status', l: 'Status', opts: S.lead_statuses }, { k: 'appt', l: 'Appointment date', t: 'date' }, { k: 'kw', l: 'Interested kW', t: 'number' }, ...(FIN() ? [{ k: 'budget', l: 'Budget (₹)', t: 'number' }] : []), { k: 'remark', l: 'Remark', full: 1, t: 'textarea', rows: 2, spell: 1 }];
  if ((CACHE.camps || []).length) F.splice(4, 0, { k: 'campaign_id', l: 'Meta campaign', opts: opt(CACHE.camps.map(c => [c.id, c.name]), '— none —') });
  const w = canW('leads') && (!id || !!l.can_edit);
  const lock = id ? `<div class="lockbar">${ownerCell(l)}${l.assigned_to ? `<span class="mut">${l.assigned_to == ME.id ? 'This lead is locked to you.' : 'Locked — only the owner can work on it.'}${l.claimed_at ? ' Claimed ' + agoStr(l.claimed_at) + '.' : ''}${claimLeft(l) ? ` Unlocks for everyone on ${claimLeft(l).when} unless it becomes a customer.` : ''}</span>${claimChip(l)}` : `<span class="mut">Not claimed yet. Claim it to see the full number and start working on it. ${ME.can_claim ? claimRule() : ''}</span>`}<span class="sp"></span>${l.assigned_to && (isAdm() || l.assigned_to == ME.id) ? '<button class="btn sm sec" id="mul"><i class="i i-lock"></i> Unclaim</button>' : ''}${canReassignLead(l) ? `<button class="btn sm sec" id="mas"><i class="i i-users"></i> ${l.assigned_to ? 'Reassign' : 'Assign'}</button>` : ''}</div>` : '';
  const m = modal(`<div class="lmh"><div class="lmt"><div><small class="mut">${id ? 'Lead' : 'New lead'}${id && l.source ? ' · ' + esc(l.source) : ''}</small><h2>${id ? esc(l.name || 'Lead') : 'Add a new lead'}</h2></div><button class="lvx" id="cx2" title="Close (Esc)"><i class="i i-x"></i></button></div>${lock}${leadTabs(l)}</div>
   <div class="lmb"><div class="ltp ltp-d"><div class="two">${F.map(f => fld(f, l)).join('')}</div><label>Notes</label><textarea data-k="notes" rows="2" ${SPELL}>${esc(l.notes || '')}</textarea></div>${leadSitePane(l)}${leadPlantPane(l)}
   ${id ? `<div class="ltp-d"><p class="mut" style="font-size:12px">Added by ${esc(l.added_by || '—')} on ${dmy(l.created)}</p>` + noteBox('leads', id, l.notes_log) + `<div class="card" style="margin-top:10px"><h3>Messages sent</h3>${(l.messages || []).map(x => `<div class="act">${esc(x.text)}<br><small>${esc(x.user)} · ${x.created}</small></div>`).join('') || '<p class="mut">None</p>'}</div></div>` : ''}</div>
   <div class="lmf">${w ? '<button class="btn" id="sv">Save</button>' : ''}<button class="btn sec" id="cx">Close</button>${id && w ? `<button class="btn sec${l.callback_at && l.callback_at <= cbNow() ? ' cbdue' : ''}" id="lcbk">${cbBtnTxt(l)}</button>` : ''}
   ${id && l.can_edit !== 0 ? '<button class="btn sec" id="lds"><i class="i i-chat"></i> Discussion</button>' : ''}${id && l.phone && w ? (BA() ? '' : '<button class="btn ok" id="wa">WhatsApp</button>') + '<a class="btn sec" href="tel:' + esc(l.phone) + '">Call</a>' : ''}
   ${id && w && !l.customer_id ? '<button class="btn sec" id="cv">Convert to customer</button>' : ''}${l.customer_id ? `<a class="btn sec" href="#/customers/${l.customer_id}" id="oc">Open customer</a>` : ''}
   ${id && canW('quotes') && w ? '<button class="btn sec" id="qt">Create quotation</button>' : ''}<span class="sp"></span>${id && w ? '<button class="btn bad" id="dl">Delete</button>' : ''}</div>`, 1);
  m.classList.add('lmod');
  $('#cx2', m).onclick = () => m.remove();
  const esc2 = e => { if (e.key === 'Escape' && document.body.contains(m) && !document.querySelector('.modal:not(.lmod)')) { m.remove(); document.removeEventListener('keydown', esc2); } }; document.addEventListener('keydown', esc2);
  $('#cx', m).onclick = () => m.remove();
  if (id && !w) $$('[data-k]', m).forEach(e => e.disabled = true);
  bindLeadTabs(m, l, w);
  const cl = $('.lockbar .claim', m); if (cl) cl.onclick = async () => { if (await claimLead(id, l.name)) { m.remove(); leadModal(id); if (location.hash.startsWith('#/leads')) route(); } };
  if ($('#mul', m)) $('#mul', m).onclick = async () => { if (await unlockLead(id, l.assigned_to == ME.id)) { m.remove(); route(); } };
  if ($('#mas', m)) $('#mas', m).onclick = async () => { if (await assignLead(l)) { m.remove(); route(); } };
  if ($('#oc', m)) $('#oc', m).onclick = () => m.remove();
  if (w) $('#sv', m).onclick = async () => { const o = { ...l, id, ...collect(m), ...leadExtra(m) }; if (!o.name) return alert('Name required'); if (BA()) o.lead_type = 'own';
    if (!o.lead_type) { const lt = $('[data-k="lead_type"]', m); if (lt) { lt.focus(); lt.classList.add('bad'); } return alert('Choose the lead type: Own lead, Office or Meta'); } await api('leads', 'save', o); m.remove(); route(); };
  if ($('#lcbk', m)) $('#lcbk', m).onclick = () => callbackBox(l, () => { const b = $('#lcbk', m); if (b) { b.innerHTML = cbBtnTxt(l); b.classList.toggle('cbdue', !!l.callback_at && l.callback_at <= cbNow()); } });
  if ($('#wa', m)) $('#wa', m).onclick = () => waOpen({ name: l.name, phone: l.phone, lead_id: id });
  if ($('#lds', m)) $('#lds', m).onclick = () => { m.remove(); discOpen({ lead_id: id }); };
  if ($('#cv', m)) $('#cv', m).onclick = () => convertBox({ id, name: l.name, phone: l.phone }, r => { m.remove(); location.hash = '#/customers/' + r.customer_id; });
  if ($('#qt', m)) $('#qt', m).onclick = () => { m.remove(); sessionStorage.lead2quote = JSON.stringify({ lead_id: id, customer_id: l.customer_id || '', name: l.name }); location.hash = '#/quotes/new'; };
  if ($('#dl', m)) $('#dl', m).onclick = async () => { if (confirm('Delete this lead?')) { await api('leads', 'delete', { id }); m.remove(); route(); } };
  if (w) bindNote('leads', id, () => { m.remove(); leadModal(id); }); else if ($('#an', m)) $('#an', m).closest('.bar').remove();
}

/* ---------- a new customer comes with the approved quotation and the total plant cost (api/onboard.php) ----------
   onbHtml() = the three questions for the Add customer and Convert windows; onbBind(m) wires them; onbForm(m, fields) gives the form to
   send (the other fields with the file, in one request, so a customer is never made without them) or null after saying what is missing. */
const ONB_HINT = 'PDF or photo, up to 10 MB';
const onbNum = v => +String(v == null ? '' : v).replace(/[,\s₹]/g, '') || 0;
const onbHtml = () => `<div class="onb"><h3>Approved quotation and plant cost</h3>
   <div class="onb-file"><button type="button" class="btn sec" data-onb="pick"><i class="i i-upload"></i> Upload approved quotation</button><span class="mut" data-onb="name">${ONB_HINT}</span><input type="file" data-onb="file" accept="application/pdf,image/jpeg,image/png,image/webp" hidden></div>
   <div class="two"><div><label>Total plant cost (₹)</label><input data-onb="cost" inputmode="numeric" autocomplete="off" placeholder="e.g. 2,50,000"></div>
    <div><label>KSEB charges</label><select data-onb="extra"><option value="0">Included in the plant cost</option><option value="1">Additional (paid on top)</option></select></div>
    <div class="full" data-onb="amtbox" hidden><label>KSEB charges amount (₹) — leave empty if it is not known yet</label><input data-onb="amt" inputmode="numeric" autocomplete="off"></div></div>
   <p class="mut onb-n">The quotation is kept in the customer’s Documents. The plant cost is shown to the admin only.</p></div>`;
function onbBind(m) {
  const f = $('[data-onb="file"]', m), nm = $('[data-onb="name"]', m), money = e => { const n = onbNum(e.target.value); if (n > 0) e.target.value = n.toLocaleString('en-IN'); };
  $('[data-onb="pick"]', m).onclick = () => f.click();
  f.onchange = () => { const x = f.files[0]; nm.textContent = x ? `${x.name} · ${x.size < 1048576 ? Math.max(1, Math.round(x.size / 1024)) + ' KB' : (x.size / 1048576).toFixed(1) + ' MB'}` : ONB_HINT; nm.classList.toggle('mut', !x); };
  $('[data-onb="extra"]', m).onchange = e => { $('[data-onb="amtbox"]', m).hidden = e.target.value !== '1'; };
  $('[data-onb="cost"]', m).onblur = money; $('[data-onb="amt"]', m).onblur = money;
}
function onbForm(m, fields) {
  const f = $('[data-onb="file"]', m).files[0], cost = onbNum($('[data-onb="cost"]', m).value), extra = $('[data-onb="extra"]', m).value === '1';
  if (!f) { toast('Upload the approved quotation', true); return null; }
  if (f.size > 10 * 1048576) { toast('The quotation file is larger than 10 MB', true); return null; }
  if (!(cost > 0)) { toast('Enter the total plant cost', true); $('[data-onb="cost"]', m).focus(); return null; }
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v != null && typeof v !== 'object') fd.append(k, v); });
  fd.append('plant_cost', cost); fd.append('kseb_extra', extra ? '1' : '0'); if (extra) fd.append('kseb_extra_amt', onbNum($('[data-onb="amt"]', m).value));
  fd.append('quote', f); return fd;
}
/* Convert a lead to a customer: asks for the approved quotation and the total plant cost, then done({customer_id}) */
function convertBox(l, done) {
  const m = modal(`<h2 style="margin-top:0">Convert to customer</h2><p class="mut" style="margin-top:-6px">${esc(l.name || 'This lead')}${l.phone ? ' · ' + esc(l.phone) : ''}</p>${onbHtml()}
   <div class="bar" style="margin-top:14px"><button class="btn" id="cvgo">Convert to customer</button><button class="btn sec" id="cvx">Cancel</button></div>`);
  onbBind(m); $('#cvx', m).onclick = () => m.remove();
  $('#cvgo', m).onclick = async e => { const fd = onbForm(m, { id: l.id }); if (!fd) return; const b = e.currentTarget; b.disabled = true;
    try { const r = await api('leads', 'convert', fd); m.remove(); toast('Converted to customer'); if (done) await done(r); } catch (x) { b.disabled = false; } };
}

// ---------- Customers ----------
let CUF = { q: '', st: '', sort: 'feas' }; /* the list opens with the feasibility that runs out first on top (the AF/RF column) */
const STC = { New: 'b', Survey: 'y', Design: 'y', Quotation: 'p', Approval: 'p', Material: 'y', Installation: 'c', 'Net-meter': 'c', Commissioned: 'g', Subsidy: 'g', Closed: 'g' };
async function convertLeadModal() {
  const ls = (await api('leads', 'list')).filter(l => l.can_edit && !l.customer_id && !['Won', 'Lost'].includes(l.status));
  const m = modal(`<h2 style="margin-top:0">Convert lead to customer</h2><p class="mut" style="margin-top:-6px">Only your claimed (or admin-visible) open leads are listed.</p>
   <label>Lead</label><input id="clq" placeholder="Search name, phone, city…" autocomplete="off"><select id="cls" size="8" style="margin-top:6px">${ls.map(l => `<option value="${l.id}">${esc(l.name)}${l.phone ? ' · ' + esc(l.phone) : ''}${l.city ? ' · ' + esc(l.city) : ''}</option>`).join('')}</select>
   ${ls.length ? '' : '<p class="mut">No open leads to convert. Claim a lead first on the Leads page.</p>'}
   ${onbHtml()}
   <label style="display:flex;gap:8px;align-items:center;color:var(--tx);font-size:14px;margin-top:10px"><input type="checkbox" id="clp" style="width:auto" ${canW('projects') ? 'checked' : 'disabled'}> Also start a project for this customer</label>
   <div class="bar" style="margin-top:14px"><button class="btn" id="clsv">Convert</button><button class="btn sec" id="clcx">Cancel</button></div>`);
  $('#clq', m).oninput = e => { const t = e.target.value.toLowerCase(); [...$('#cls', m).options].forEach(o => o.hidden = !o.text.toLowerCase().includes(t)); };
  $('#clcx', m).onclick = () => m.remove(); onbBind(m);
  $('#clsv', m).onclick = async e => { const id = +$('#cls', m).value; if (!id) return toast('Choose a lead', true);
    const fd = onbForm(m, { id }); if (!fd) return; const b = e.currentTarget; b.disabled = true;
    let r; try { r = await api('leads', 'convert', fd); } catch (x) { b.disabled = false; return; } m.remove(); toast('Converted to customer');
    if ($('#clp', m).checked) startModal({ customer_id: r.customer_id }); else location.hash = '#/customers/' + r.customer_id; };
}
async function pgCustomers() {
  if (!PIPE && canR('projects')) { try { PIPE = (await api('pipeline', 'board')).stages; } catch (e) { } }
  const [cs] = await Promise.all([list('customers'), discSummary(), feeMembers(), feasLoad()]); cs.forEach(c => c.status = c.stage || 'New');
  const w = canW('customers');
  if (CUF.ownFor !== ME.id) { CUF.ownFor = ME.id; CUF.own = ownView('customers'); } // Me / All remembered per person
  $('#main').innerHTML = `<div class="bar" style="align-items:flex-start;margin-bottom:6px"><div><h2 style="margin:0;font-size:26px">Customers</h2><div class="mut" id="ccount"></div></div><span class="sp"></span>
   <button class="btn sec" id="cref"><i class="i i-refresh"></i> Refresh</button>${ME.role === 'admin' ? '<button class="btn sec" id="cimp" title="Import customers from a prepared file"><i class="i i-upload"></i> Import</button>' : ''}${canW('leads') ? '<button class="btn sec" id="cconv"><i class="i i-userplus"></i> Convert lead</button>' : ''}${w ? '<button class="btn" id="cnew"><i class="i i-userplus"></i> Add Customer</button>' : ''}</div>
   <div class="bar cbar" style="margin-top:12px">${ownSwitch('customers', CUF.own)}<input id="cq" placeholder="Search by name, consumer no, phone, district…" value="${esc(CUF.q)}">
   <select id="cst"><option value="">All statuses</option>${['New', ...S.project_stages].map(x => `<option ${CUF.st === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
   <select id="csort">${[['feas', 'Feasibility expiry'], ['recent', 'Recent'], ['oldest', 'Oldest'], ['name', 'Name A–Z'], ['kw', 'Capacity']].map(([v, t]) => `<option value="${v}" ${CUF.sort === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
   <label class="hsw" title="Show status, next step and feasibility when you point at a customer"><input type="checkbox" id="chov" ${hoverOn() ? 'checked' : ''}><span class="hswt"></span>Hover info</label><span class="sp"></span>${canExport() ? '<button class="btn sec" id="cex">Export CSV</button>' : ''}${w && ME.role === 'admin' ? '<button class="btn sec" id="cim">Import CSV</button>' : ''}</div>
   <div class="card tw fitbox" style="padding:0"><table id="ctb" class="ctb2" data-min="680"></table></div>`;
  const ic = (a, i, t) => `<button class="ib" data-a="${a}" title="${t}" aria-label="${t}"><i class="i i-${i}"></i></button>`;
  let onScreen = 0; // rows on screen; a refresh (resize, discussion update) keeps at least this many
  const draw = reset => {
    const t = CUF.q.toLowerCase();
    const rows = cs.filter(c => (CUF.own !== 'me' || OWN.mine.customers(c, ME)) && (!CUF.st || c.status === CUF.st) && (!t || [c.name, c.phone, c.consumer_no, c.district, c.address, c.email].join(' ').toLowerCase().includes(t)))
      .sort((a, b) => CUF.sort === 'name' ? a.name.localeCompare(b.name) : CUF.sort === 'kw' ? (b.kw || 0) - (a.kw || 0) : CUF.sort === 'oldest' ? (a.created > b.created ? 1 : -1) : (a.created < b.created ? 1 : -1))
      .sort((a, b) => CUF.sort === 'feas' ? FEASX.order(FEASX.map, a.id) - FEASX.order(FEASX.map, b.id) : 0) /* stable: the rest stay newest first */
      .sort((a, b) => CUF.sort === 'feas' ? 0 : discRank(b.id) - discRank(a.id) || (DISC.sum[a.id] && DISC.sum[b.id] ? String(DISC.sum[b.id].last_at).localeCompare(String(DISC.sum[a.id].last_at)) : 0)); // live discussions first
    const nLive = rows.filter(c => DISC.sum[c.id]).length; $('#ccount').innerHTML = rows.length + ' records' + (nLive ? ` · <span class="xdlive"><span class="xddot"></span>${nLive} live discussion${nLive === 1 ? '' : 's'}</span>` : '');
    const W = ($('#ctb').parentElement || {}).clientWidth || 1200;
    // fit to the window: drop the least important columns first, then fold the action icons into ⋯, then consumer no. / phone
    let COLS = [['name', 'Name', 0], ['status', 'Status', 140], ['afrf', 'AF/RF', 78], ['cno', 'Consumer no.', 128], ['dist', 'District', 130], ['phone', 'Phone', 138], ['kw', 'Capacity', 78], ['by', 'Owner', 120], ['date', 'Date', 92]], full = true;
    const need = () => COLS.reduce((s, c) => s + c[2], 0) + (full ? 330 : 172) + 170;
    if (W < 680) { COLS = COLS.filter(c => c[0] !== 'date'); full = false; } // phones: card view has room for the key details (owner included)
    else for (const k of ['date', 'by', 'dist', 'kw', '#compact', 'cno', 'phone']) { /* Owner outlasts Date: Me / All needs it */ if (need() <= W) break; if (k === '#compact') full = false; else COLS = COLS.filter(c => c[0] !== k); }
    const fin = canR('fees');
    const ACTS = c => { const p = !!c.project_id, wl = w && canW('leads') && !BA();
      const list = [['ed', 'pencil', 'Edit customer', w], ['pj', 'project', p ? 'Open project' : 'Start a project', p || canW('projects')], ['docs', 'file', 'Documents', canR('files')], ['pay', 'card', 'Payments', canR('payments'), p], ['fees', 'coin', 'Finance — feasibility, registration, stamp paper', fin],
        ['kseb', 'folder', 'KSEB documents', 1, p], ['kdoc', 'clipboard', 'KSEB documentation — work completion report, annexures, MNRE warranty card', canR('checklist')], ['bdoc', 'bank', 'Bank documentation — feasibility report, vendor–customer agreement', canR('loans')], ['sub', 'sun', 'Subsidy (PM Surya Ghar)', 1, p], ['tl', 'clock', 'Timeline & profile', true], ['rv', 'undo', 'Revert to lead', wl]].filter(x => x[3]);
      return full ? list : list.filter(x => ['ed', 'pj', 'docs'].includes(x[0])); };
    const cell = (k, c) => ({ name: `<td class="cnm"><b class="clip">${esc(c.name)}</b>${feasChip(c.id)}${!COLS.some(x => x[0] === 'cno') && c.consumer_no ? `<small class="mono mut">${esc(c.consumer_no)}</small>` : ''}</td>`,
      status: `<td><span class="pill ${c.status === 'New' ? 'b' : (typeof stepCls === 'function' && PIPE ? stepCls(c.status) : STC[c.status]) || ''}">${esc(c.status)}</span></td>`,
      afrf: `<td class="fxtd">${typeof feasCol === 'function' ? feasCol(c.id) : ''}</td>`,
      cno: `<td class="mono">${esc(c.consumer_no) || '<span class="mut">—</span>'}</td>`, dist: `<td title="${esc(c.district)}"><span class="clip">${esc(c.district) || '<span class="mut">—</span>'}</span></td>`,
      phone: `<td>${c.phone ? `<a href="tel:${esc(c.phone)}" class="tel"><i class="i i-phone"></i> ${esc(c.phone)}</a>` : '<span class="mut">—</span>'}</td>`, kw: `<td>${c.kw ? c.kw + ' kWp' : '<span class="mut">—</span>'}</td>`,
      by: `<td title="${esc((c.owner_name ? 'Owner: ' + c.owner_name : 'No owner') + (c.added_by ? ' · added by ' + c.added_by : ''))}">${+c.owner_id ? `<span class="own${+c.owner_id === +ME.id ? ' me' : ''}"><i class="i i-user"></i><span class="clip">${esc(ownLabel(c.owner_id, c.owner_name))}</span></span>` : '<span class="mut">—</span>'}</td>`, date: `<td class="mut">${dt(c.created)}</td>` })[k];
    const nA = rows.length ? Math.max(...rows.slice(0, 50).map(c => ACTS(c).length)) + 2 : 4;
    const rowHtml = c => `<tr class="row ${DISC.sum[c.id] ? 'live' : ''}" data-id="${c.id}">${COLS.map(k => cell(k[0], c)).join('')}
        <td class="cact">${discBtn(c.id)}${ACTS(c).map(([k, i, t, , on]) => on === false ? `<button class="ib off" aria-disabled="true" title="${t} — start a project first"><i class="i i-${i}"></i></button>` : ic(k, i, t)).join('')}${ic('more', 'dots', 'More actions')}</td></tr>`;
    const tb = $('#ctb'); let n = Math.min(rows.length, Math.max(LAZY_FIRST, reset === true ? 0 : onScreen));
    tb.innerHTML = `<colgroup>${COLS.map(c => `<col${c[2] ? ` style="width:${c[2]}px"` : ''}>`).join('')}<col style="width:${nA * 28 + 14}px"></colgroup>
      <thead><tr>${COLS.map(c => `<th>${c[1]}</th>`).join('')}<th class="right">Actions</th></tr></thead><tbody>
      ${rows.slice(0, n).map(rowHtml).join('') || `<tr><td colspan="${COLS.length + 1}" class="mut">No customers match</td></tr>`}</tbody>`;
    if (reset === true && tb.parentElement) tb.parentElement.scrollTop = 0; // new sort / filter / search starts at the top
    const byId = new Map(rows.map(c => [String(c.id), c])); // O(1) lookup per row
    const bind = trs => trs.forEach(tr => {
      const c = byId.get(tr.dataset.id); if (!c) return;
      feasHover(tr, c);
      tr.onclick = e => { if (!e.target.closest('a,button')) location.hash = '#/customers/' + c.id; };
      const run = async a => {
        if (a.startsWith('fadd-') || a.startsWith('fopen-')) return feeMenuRun(a, c);
        const proj = tab => { if (!c.project_id) { toast('No project yet — create one first', true); return; } TAB.proj = tab; location.hash = '#/projects/' + c.project_id; };
        if (a === 'ed') { PFT_OPEN = { id: c.id, key: 'kseb', edit: true }; location.hash = '#/customers/' + c.id; }
        if (a === 'wa') waOpen({ name: c.name, phone: c.phone, customer_id: c.id });
        if (a === 'ds') discOpen(c.id);
        if (a === 'pj') { if (c.project_id) { TAB.proj = 'overview'; location.hash = '#/projects/' + c.project_id; } else if (canW('projects')) startModal({ customer_id: c.id }); else toast('No project yet', true); }
        if (a === 'qt') { sessionStorage.lead2quote = JSON.stringify({ customer_id: c.id, name: c.name }); location.hash = '#/quotes/new'; }
        if (a === 'pay') proj('overview'); if (a === 'kseb') proj('kseb'); if (a === 'sub') proj('subsidy');
        if (a === 'kdoc') location.hash = '#/kseb/' + c.id; /* KSEB documentation page, filled in for this customer */
        if (a === 'bdoc') location.hash = '#/bank/' + c.id; /* Bank documentation page (loan papers), filled in for this customer */
        if (a === 'op') location.hash = '#/customers/' + c.id;
        if (a === 'sp') startModal({ customer_id: c.id });
        if (a === 'docs') { PFT = 'docs'; PFT_ID = c.id; location.hash = '#/customers/' + c.id; }
        if (a === 'tl') { PFT = 'overview'; PFT_ID = c.id; location.hash = '#/customers/' + c.id; }
        if (a === 'rv') revertToLead(c.id, c.name);
        if (a === 'own') { const r = await reassignBox('customers', c); if (r) { c.owner_id = r.owner_id; c.owner_name = r.owner_name; draw(); } }
      };
      $$('[data-a]', tr).forEach(b => b.onclick = e => { e.stopPropagation(); const a = b.dataset.a;
        if (a === 'fees') return popMenu(b, feeMenuItems(c.id), run);
        if (a !== 'more') return run(a);
        const shown = new Set($$('[data-a]', tr).map(x => x.dataset.a));
        popMenu(b, [canW('quotes') ? ['qt', 'receipt', 'New quotation'] : null, ...[['ed', 'pencil', 'Edit customer', w], ['pay', 'card', 'Payments', !!c.project_id && canR('payments')], ['kseb', 'folder', 'KSEB documents', !!c.project_id], ['kdoc', 'clipboard', 'KSEB documentation', canR('checklist')], ['bdoc', 'bank', 'Bank documentation', canR('loans')], ['sub', 'sun', 'Subsidy', !!c.project_id], ['tl', 'clock', 'Timeline & profile', true], ['own', 'users', +c.owner_id ? 'Reassign owner' : 'Set owner', w && OWN.canReassign(c.owner_id, ME)], ['rv', 'undo', 'Revert to lead', w && canW('leads') && !BA()]].filter(x => x[3] && !shown.has(x[0])).map(x => x.slice(0, 3)), ...(shown.has('fees') ? [] : feeMenuItems(c.id))], run);
      });
    });
    bind([...tb.tBodies[0].rows]); onScreen = n;
    lazyMore(tb, step => { const body = tb.tBodies[0], from = body.rows.length, next = rows.slice(n, n + step);
      body.insertAdjacentHTML('beforeend', next.map(rowHtml).join('')); bind([...body.rows].slice(from)); n += next.length; onScreen = n; return n < rows.length; }, n < rows.length);
  };
  const drawSoon = debounce(() => draw(true), 120);
  $('#cq').oninput = e => { CUF.q = e.target.value; drawSoon(); };
  $('#cst').onchange = e => { CUF.st = e.target.value; draw(true); }; $('#csort').onchange = e => { CUF.sort = e.target.value; draw(true); };
  ownBind($('.cbar'), 'customers', v => { CUF.own = v; draw(true); });
  $('#cref').onclick = () => route();
  if ($('#cimp')) $('#cimp').onclick = () => custImport(() => route());
  $('#chov').onchange = e => { try { localStorage.custHover = e.target.checked ? '1' : '0'; } catch (x) { } if (FH) FH.classList.remove('on'); toast('Hover info ' + (e.target.checked ? 'on' : 'off')); };
  if ($('#cconv')) $('#cconv').onclick = convertLeadModal;
  if ($('#cex')) $('#cex').onclick = () => csvDownload('customers-' + today() + '.csv', ['name', 'phone', 'email', 'address', 'district', 'consumer_no', 'kseb_section', 'sanctioned_load', 'roof_type', 'gst_no', 'status', 'kw', 'owner_name', 'added_by', 'created', 'notes'], cs);
  if ($('#cnew')) $('#cnew').onclick = () => customerModal(0);
  if ($('#cim')) $('#cim').onclick = async () => { const f = await pickFile('.csv'); if (!f) return; let n = 0; for (const r of csvObjs(await f.text())) { if (!r.name) continue; await api('customers', 'save', r); n++; } toast('Imported ' + n + ' customers'); route(); };
  draw(); DISC.redraw = draw;
  if (!window._custRz) { window._custRz = 1; let tm; addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(() => { if (/^#\/customers\/?$/.test(location.hash) && DISC.redraw) DISC.redraw(); }, 150); }); }
}
/* New customer: only what is needed to start; the rest is filled on the profile pages (1 · KSEB connection ...) */
const CF = [{ k: 'name', l: 'Consumer name (as on the KSEB bill)' }, { k: 'phone', l: 'Phone', t: 'tel' }, { k: 'lead_type', l: 'Lead type', opts: LT_OPTS }, { k: 'consumer_no', l: 'KSEB consumer no.' }, { k: 'address', l: 'Address', full: 1 }, { k: 'district', l: 'District', d: 'Thiruvananthapuram' }];
function customerModal(id, c = {}) {
  /* Meta only comes from a lead: a customer added here is Own lead or Office */
  const cf = CF.filter(f => !(f.k === 'lead_type' && BA())).map(f => f.k === 'lead_type' ? { ...f, opts: LT_OPTS.filter(o => o[0] !== 'meta') } : f);
  const m = modal(`<h2 style="margin-top:0">New customer</h2><div class="two">${cf.map(f => fld(f, c)).join('')}</div><label>Notes</label><textarea data-k="notes" rows="2">${esc(c.notes || '')}</textarea>${id ? '' : onbHtml()}
   <div class="bar" style="margin-top:14px"><button class="btn" id="sv">Save</button><button class="btn sec" id="cx">Close</button></div>`);
  $('#cx', m).onclick = () => m.remove(); if (!id) onbBind(m);
  const lt = $('[data-k="lead_type"]', m);
  $('#sv', m).onclick = async () => { const o = { ...c, id, ...collect(m) }; if (!o.name) return alert('Name required'); if (BA()) o.lead_type = 'own';
    if (!o.lead_type) { if (lt) lt.focus(); return alert('Choose the lead type: Own lead or Office'); }
    /* a new customer goes with the approved quotation and the plant cost, in one request */
    let body = o; if (!id) { delete o.id; body = onbForm(m, o); if (!body) return; }
    const b = $('#sv', m); b.disabled = true;
    try { const r = await api('customers', 'save', body); m.remove(); location.hash = '#/customers/' + r.id; } catch (x) { b.disabled = false; } };
}
/* KSEB office: typing the consumer number (11 + section code + …) or picking the section office fills the electrical
   sub division, division and circle (and an empty section). A field the user typed stays; one we filled follows the office.
   The server applies the same rule on save (api/kseb_offices.php), so this is only the live preview of it. */
let KSEB_SECS = null;
function ksebOfficeFill(m) {
  const inp = k => $(`[data-k="${k}"]`, m), sec = inp('kseb_section'), cno = inp('consumer_no');
  if (!sec || !cno) return;
  if (!$('#ksebsecs')) { const dl = document.createElement('datalist'); dl.id = 'ksebsecs'; document.body.appendChild(dl); }
  sec.setAttribute('list', 'ksebsecs'); sec.setAttribute('autocomplete', 'off');
  (KSEB_SECS = KSEB_SECS || api('kseb', 'offices').catch(() => [])).then(list => { const dl = $('#ksebsecs'); if (dl && !dl.options.length) dl.innerHTML = list.map(s => `<option value="${esc(s)}">`).join(''); });
  const map = { kseb_subdivision: 'subdivision', kseb_division: 'division', kseb_circle: 'circle' };
  Object.keys(map).forEach(k => { const el = inp(k); if (el) el.addEventListener('input', () => { delete el.dataset.auto; }); });
  sec.addEventListener('input', () => { delete sec.dataset.auto; });
  let seq = 0;
  const office = async () => { try { return (await api('kseb', 'office', undefined, `&consumer_no=${encodeURIComponent(cno.value.trim())}&section=${encodeURIComponent(sec.value.trim())}`)).office; } catch (e) { return null; } };
  /* on opening: values that already match the office count as filled by us, so a new consumer number updates them */
  office().then(o => { if (o) Object.entries(Object.assign({ kseb_section: 'section' }, map)).forEach(([k, f]) => { const el = inp(k); if (el && el.value.trim() && el.value.trim() === o[f]) el.dataset.auto = '1'; }); });
  const look = debounce(async () => {
    const n = ++seq, o = await office();
    if (n !== seq || !o) return;
    const put = (el, v) => { if (el && v && (!el.value.trim() || el.dataset.auto) && el.value !== v) { el.value = v; el.dataset.auto = '1'; el.classList.add('kfill'); setTimeout(() => el.classList.remove('kfill'), 900); } };
    if (!sec.value.trim() || sec.dataset.auto) put(sec, o.section);
    Object.entries(map).forEach(([k, f]) => put(inp(k), o[f]));
  }, 350);
  [cno, sec].forEach(el => el.addEventListener('input', look));
  sec.addEventListener('change', look);
}
// Customer → back to Leads. If a project or documents exist, list what will be deleted and ask to type REVERT.
async function revertToLead(id, name, parent) {
  const why = prompt(`Revert "${name || 'this customer'}" back to Leads?\n\nThe lead is reopened (or created). Quotes, notes, WhatsApp log and team discussions move to the lead.\n\nReason (optional):`, '');
  if (why === null) return;
  const done = r => { if (parent) parent.remove(); toast(r.reopened ? 'Reverted — the original lead is reopened' : 'Reverted — a new lead was created'); location.hash = '#/leads'; };
  const r = await api('customers', 'revert', { id, reason: why });
  if (!r.confirm) return done(r);
  const list = [...r.projects.map(p => `<li><b>Project</b> ${esc(p.title || 'Solar project')}${p.kw ? ' · ' + p.kw + ' kW' : ''} — status <b>${esc(p.stage || '')}</b>, all steps, checklist and receipts</li>`),
    r.payments ? `<li><b>${r.payments} payment record${r.payments === 1 ? '' : 's'}</b>${r.paid != null ? ' (' + inr(r.paid) + ')' : ''}</li>` : '',
    r.docs ? `<li><b>${r.docs} uploaded document${r.docs === 1 ? '' : 's'}</b> (KSEB papers, receipts, photos…)</li>` : ''].join('');
  const m = modal(`<div class="rvw"><div class="rvh"><span class="rvi"><i class="i i-alert"></i></span><div><h2>Delete and revert to lead?</h2><small>${esc(r.name)}</small></div></div>
    <p>Reverting will <b>permanently delete</b>:</p><ul class="rvl">${list}</ul>
    <p class="mut" style="font-size:13px">This cannot be undone. Download anything you need first. Quotes, notes, WhatsApp log and discussions are kept on the lead.${r.payments && ME.role !== 'admin' ? '<br><b style="color:#c4271f">Only an admin can revert a customer with payments.</b>' : ''}</p>
    <label>Type <b>REVERT</b> to confirm</label><input id="rvc" autocomplete="off" placeholder="REVERT">
    <div class="bar" style="margin-top:14px"><button class="btn sec" id="rvx">Cancel</button><span class="sp"></span><button class="btn bad" id="rvgo" disabled>Delete & revert to lead</button></div></div>`);
  m.classList.add('rvmod');
  $('#rvx', m).onclick = () => m.remove();
  $('#rvc', m).oninput = e => $('#rvgo', m).disabled = e.target.value.trim().toUpperCase() !== 'REVERT';
  $('#rvc', m).focus();
  $('#rvgo', m).onclick = async () => { const b = $('#rvgo', m); b.disabled = true; b.textContent = 'Reverting…';
    try { const r2 = await api('customers', 'revert', { id, reason: why, confirm: 1 }); m.remove(); done(r2); } catch (e) { b.disabled = false; b.textContent = 'Delete & revert to lead'; } };
}
// pgCustomer (profile page) lives in app11.js

// ---------- Projects ----------
let PV = 'board';
async function pgProjects() {
  const ps = await list('projects'); CACHE.projects = ps;
  const draw = () => {
    if (PV === 'board') {
      $('#pv').innerHTML = `<div class="board">${S.project_stages.map(s => { const cs = ps.filter(p => p.stage === s); return `<div class="col" data-s="${esc(s)}"><h4><span>${esc(s)}</span><span>${cs.length} · ${inr(cs.reduce((a, p) => a + p.cost, 0))}</span></h4>${cs.map(p => `<div class="k" draggable="true" data-id="${p.id}"><b>${esc(p.customer || '—')}</b><small>${esc(p.title)}</small><small>${p.kw} kW · ${inr(p.cost)}</small></div>`).join('')}</div>`; }).join('')}</div>`;
      $$('.k').forEach(k => { k.ondragstart = e => e.dataTransfer.setData('id', k.dataset.id); k.onclick = () => location.hash = '#/projects/' + k.dataset.id; });
      if (canW('projects')) $$('.col').forEach(c => { c.ondragover = e => e.preventDefault(); c.ondrop = async e => { e.preventDefault(); const p = ps.find(x => x.id == e.dataTransfer.getData('id')); if (p && p.stage !== c.dataset.s) { await api('projects', 'save', { ...p, stage: c.dataset.s }); route(); } }; });
    } else $('#pv').innerHTML = table([['Customer', p => `<b>${esc(p.customer)}</b>`], ['Project', p => esc(p.title)], ['kW', p => p.kw, 'num'], ['Stage', p => pill(p.stage, stageCls(p.stage))], ['Value', p => inr(p.cost), 'num'], ['Balance', p => inr(p.cost - p.paid), 'num'], ['Engineer', p => esc(p.engineer)]], ps, id => location.hash = '#/projects/' + id);
  };
  $('#main').innerHTML = `<div class="bar"><div class="tabs" style="margin:0"><button data-v="board" class="${PV === 'board' ? 'on' : ''}">Board</button><button data-v="list" class="${PV === 'list' ? 'on' : ''}">List</button></div><span class="sp"></span>${canW('projects') ? '<button class="btn" id="pn">+ New project</button>' : ''}</div><div id="pv"></div>`;
  $$('[data-v]').forEach(b => b.onclick = () => { PV = b.dataset.v; route(); });
  if ($('#pn')) $('#pn').onclick = () => projectModal(0, {}); draw();
}
async function projectModal(id, p = {}) {
  const cs = await list('customers');
  const F = [{ k: 'customer_id', l: 'Customer', opts: opt(cs.map(c => [c.id, c.name]), '— select —'), full: 1 }, { k: 'title', l: 'Project title', d: p.title || '3 kW rooftop solar', full: 1 }, { k: 'kw', l: 'System size (kW)', t: 'number' }, { k: 'loan', l: 'Loan taken?', opts: [['', 'Not decided'], 'Yes', 'No'] },
    { k: 'panel', l: 'Panels', d: 'ReNew 550 Wp M10 Bifacial' }, { k: 'inverter', l: 'Inverter' }, ...(FIN() ? [{ k: 'cost', l: 'Project value (₹)', t: 'number' }] : []), { k: 'engineer', l: 'Site engineer' }, { k: 'start', l: 'Start date', t: 'date' }, { k: 'end', l: 'Completion date', t: 'date' }];
  const m = modal(`<h2 style="margin-top:0">${id ? 'Edit' : 'New'} project</h2><div class="two">${F.map(f => fld(f, p)).join('')}</div><label>Notes</label><textarea data-k="notes" rows="2">${esc(p.notes || '')}</textarea>
   <div class="bar" style="margin-top:14px"><button class="btn" id="sv">Save</button><button class="btn sec" id="cx">Close</button></div>`);
  $('#cx', m).onclick = () => m.remove();
  if (!id) { /* a new project: the capacity already held for the customer is filled in */ const cu = $('[data-k="customer_id"]', m), kw = $('[data-k="kw"]', m), fillKw = () => { const c = cs.find(x => x.id == cu.value); if (c && +c.kw > 0 && (!kw.value || kw.dataset.auto)) { kw.value = c.kw; kw.dataset.auto = '1'; } }; if (cu && kw) { cu.addEventListener('change', fillKw); kw.addEventListener('input', () => { delete kw.dataset.auto; }); fillKw(); } }
  $('#sv', m).onclick = async () => { const o = { ...p, ...collect(m) }; if (id) o.id = id; if (!o.customer_id) return alert('Select a customer'); const r = await api('projects', 'save', o); m.remove(); location.hash = '#/projects/' + r.id; route(); };
}
function subsidyCalc(kw) { const r = S.subsidy_rates; kw = Math.max(0, +kw || 0); return Math.min(r.cap, Math.min(kw, 2) * r.per_kw_first2 + Math.max(0, Math.min(kw, 3) - 2) * r.third_kw); }
async function pgProject(id) {
  const p = await api('projects', 'get', undefined, '&id=' + id);
  const w = canW('projects'), wc = canW('checklist');
  const paid = p.payments.reduce((a, x) => a + x.amount, 0);
  const tabs = [['overview', FIN() ? 'Overview & payments' : 'Overview'], ['subsidy', 'Subsidy'], ['kseb', 'KSEB documents'], ...(canR('files') ? [['files', 'Files']] : []), ['amc', 'AMC & service']];
  const draw = () => {
    const t = TAB.proj || 'overview';
    let body = '';
    if (t === 'overview') body = `<div class="grid cols2"><div class="card"><h3>Details</h3><p class="mut" style="margin:0">Panels: ${esc(p.panel)}<br>Inverter: ${esc(p.inverter)}<br>Engineer: ${esc(p.engineer) || '—'}<br>Start: ${esc(p.start) || '—'} · Completion: ${esc(p.end) || '—'}<br>${esc(p.notes)}</p></div>
      ${!FIN() ? '<div class="card"><h3>Payments</h3><p class="mut">Finance details are hidden for your role.</p></div>' : ''}<div class="card ${FIN() ? '' : 'hide'}"><h3>Payments ${canW('payments') ? '<button class="btn sm" id="ap" style="float:right">+ Payment</button>' : ''}</h3><p>Value <b>${inr(p.cost)}</b> · Received <b>${inr(paid)}</b> · Balance <b class="${p.cost - paid > 0 ? 'over' : ''}">${inr(p.cost - paid)}</b></p>
      ${p.payments.map(x => `<div class="act">${inr(x.amount)} ${x.mode ? '· ' + esc(x.mode) : ''} <small>${esc(x.date)}${x.ref_no ? ' · Ref ' + esc(x.ref_no) : ''}${x.note ? ' · ' + esc(x.note) : ''}${x.src === 'bank' ? ' · From the bank (loan)' : ''}</small> ${canW('payments') ? `<a href="#" data-dp="${x.id}"><i class="i i-x"></i></a>` : ''}</div>`).join('') || '<p class="mut">No payments recorded</p>'}</div></div>
      <div style="margin-top:12px">${noteBox('projects', id, p.notes_log)}</div>`;
    if (t === 'subsidy') body = `<div class="card"><h3>PM Surya Ghar subsidy</h3><div class="two">
      <div><label>Application no.</label><input id="sa" value="${esc(p.application_no)}" ${w ? '' : 'disabled'}></div><div><label>Status</label><select id="ss" ${w ? '' : 'disabled'}>${SUB_STATUS.map(s => `<option ${p.subsidy_status === s || (!p.subsidy_status && s === 'Not applied') ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div><label>Subsidy amount (₹) — estimate for ${p.kw} kW: ${inr(subsidyCalc(p.kw))}</label><input id="sm" type="number" value="${p.subsidy_amount || ''}" ${w ? '' : 'disabled'}></div>${w ? '<div style="align-self:end"><button class="btn" id="ssv">Save subsidy details</button></div>' : ''}</div></div>
      <div class="card" style="margin-top:12px"><h3>Subsidy steps</h3>${checklistHtml('subsidy', p.checklist_subsidy, p.files, wc)}</div>`;
    if (t === 'amc') body = '<div id="amcbox"></div>';
    if (t === 'kseb') body = `<div class="card"><h3>KSEB documentation</h3>${checklistHtml('kseb', p.checklist_kseb, p.files, wc)}</div>`;
    if (t === 'files') body = `<div class="card"><h3>All files ${canW('files') ? '<button class="btn sm" id="up" style="float:right">Upload</button>' : ''}</h3>${p.files.map(f => `<div class="act">${fileLink(f)}${f.item ? '<br><small>' + esc(f.kind) + ': ' + esc(f.item) + '</small>' : ''} ${canW('files') ? `<a href="#" data-df="${f.id}"><i class="i i-x"></i></a>` : ''}</div>`).join('') || '<p class="mut">No files</p>'}</div>`;
    $('#pb').innerHTML = tabsBar('proj', tabs, 'overview') + body; bindTabs('proj', draw); bindPB(); if ($('#amcbox')) amcTab(p, $('#amcbox'));
  };
  const bindPB = () => {
    /* loan projects: who paid (the customer or the loan bank; mode Loan = the bank), as on the Tax bill tab and in Accounts — the tax bill unlocks on the customer's own payments */
    if ($('#ap')) $('#ap').onclick = () => { const loan = p.loan === 'Yes'; const m = modal(`<h3 style="margin-top:0">Record payment</h3><div class="two">${[{ k: 'amount', l: 'Amount (₹)', t: 'number' }, { k: 'date', l: 'Date', t: 'date', d: today() }, { k: 'mode', l: 'Mode', opts: ['Bank transfer', 'UPI', 'Cash', 'Cheque'].concat(loan ? ['Loan'] : []) }, { k: 'ref_no', l: 'Reference no. (UTR / cheque) — not needed for cash' }, ...(loan ? [{ k: 'src', l: 'From', opts: [['customer', 'Customer'], ['bank', 'Bank (loan)']] }] : []), { k: 'note', l: 'Note' }].map(f => fld(f)).join('')}</div><div class="bar" style="margin-top:12px"><button class="btn" id="sv">Save</button><button class="btn sec" id="cx">Cancel</button></div>`); const md = $('[data-k="mode"]', m), fr = $('[data-k="src"]', m); if (fr) md.onchange = () => { fr.value = ACC.payFrom(md.value, fr.value); }; $('#cx', m).onclick = () => m.remove(); $('#sv', m).onclick = async () => { const o = { project_id: id, ...collect(m) }; if (!(+o.amount > 0)) return alert('Enter an amount'); await api('payments', 'save', o); m.remove(); route(); }; };
    $$('[data-dp]').forEach(a => a.onclick = async e => { e.preventDefault(); if (confirm('Delete this payment?')) { await api('payments', 'delete', { id: +a.dataset.dp }); route(); } });
    $$('[data-df]').forEach(a => a.onclick = async e => { e.preventDefault(); if (confirm('Delete this file?')) { await api('files', 'delete', { id: +a.dataset.df }); route(); } });
    if ($('#up')) $('#up').onclick = async () => { if (await upload({ project_id: id, kind: 'general' })) route(); };
    if ($('#ssv')) $('#ssv').onclick = async () => { await api('projects', 'save', { ...p, application_no: $('#sa').value, subsidy_status: $('#ss').value, subsidy_amount: $('#sm').value }); route(); };
    bindChecklist(id, p); bindNote('projects', id, route);
  };
  $('#main').innerHTML = `<p><a href="#/projects">← Pipeline</a> · <a href="#/customers/${p.customer_id}">${esc(p.customer?.name || '')}</a></p>
   <div class="card"><div class="bar" style="margin:0"><h2 style="margin:0;margin-right:auto">${esc(p.title)} <span class="mut" style="font-size:14px">${p.kw} kW</span></h2>
   ${canR('accounts') ? `<a class="btn sec" href="#/accounts/cost/${id}"><i class="i i-coin"></i> Project cost</a>` : ''}${w ? `<button class="btn sec" id="ed">Edit</button><button class="btn bad" id="dl">Delete</button>` : pill(p.stage)}</div></div><div id="pstp" style="margin-top:12px"></div><div id="pb" style="margin-top:12px"></div>`;
  renderStepper(p, $('#pstp'));
  if ($('#ed')) $('#ed').onclick = () => projectModal(id, p);
  if ($('#dl')) $('#dl').onclick = async () => { if (confirm('Delete this project with its payments, checklists and files?')) { await api('projects', 'delete', { id }); location.hash = '#/projects'; } };
  draw();
}
function checklistHtml(kind, items, files, wc) {
  const done = items.filter(i => i.status === 'Approved' || i.status === 'NA').length;
  return `<div class="bar"><div class="prog" style="flex:1"><i style="width:${items.length ? done / items.length * 100 : 0}%"></i></div><b>${done}/${items.length}</b></div>` + items.map((i, n) => {
    const fs = files.filter(f => f.kind === kind && f.item === i.item);
    return `<div class="chk" data-kind="${kind}" data-n="${n}"><div>${esc(i.item)}${fs.map(f => '<br>' + fileLink(f)).join('')}</div>
     <select data-f="status" ${wc ? '' : 'disabled'}>${['Pending', 'Submitted', 'Approved', 'NA'].map(s => `<option ${i.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
     <input type="date" data-f="date" value="${esc(i.date)}" ${wc ? '' : 'disabled'}><input data-f="notes" placeholder="Notes" value="${esc(i.notes)}" ${wc ? '' : 'disabled'}>
     ${canW('files') ? `<button class="btn sec sm" data-up="${kind}|${n}"><i class="i i-clip"></i> Upload</button>` : '<span></span>'}</div>`;
  }).join('') + otherChkFiles(kind, items, files);
}
/* files uploaded against a checklist item that is no longer on the list (the list was changed in Settings) */
function otherChkFiles(kind, items, files) {
  const fs = files.filter(f => f.kind === kind && !items.some(i => i.item === f.item));
  return fs.length ? `<div class="chk-other"><b>Other ${kind === 'kseb' ? 'KSEB' : 'subsidy'} files</b><small class="mut"> · uploaded for items no longer on the checklist</small>${fs.map(f => `<div>${esc(f.item || '—')}: ${fileLink(f)}</div>`).join('')}</div>` : '';
}
function bindChecklist(pid, p) {
  $$('.chk').forEach(row => {
    const items = row.dataset.kind === 'kseb' ? p.checklist_kseb : p.checklist_subsidy, it = items[row.dataset.n];
    const save = async () => { const o = { project_id: pid, kind: row.dataset.kind, item: it.item }; $$('[data-f]', row).forEach(e => o[e.dataset.f] = e.value); if (o.status !== 'Pending' && !o.date) o.date = today(); await api('checklist', 'save', o); route(); };
    $$('select[data-f],input[type=date]', row).forEach(e => e.onchange = save); const nt = $('input[data-f=notes]', row); if (nt) nt.onchange = save;
    const up = $('[data-up]', row); if (up) up.onclick = async () => { if (await upload({ project_id: pid, kind: row.dataset.kind, item: it.item })) route(); };
  });
}
