// Solarize CRM - core, dashboard, leads, customers, projects
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + Math.round(+n || 0).toLocaleString('en-IN');
const today = () => new Date().toISOString().slice(0, 10);
const dt = s => (s || '').slice(0, 10);
const app = $('#app');
let ME = null, S = {}, CACHE = {}, TAB = {};
const SUB_STATUS = ['Not applied', 'Applied', 'Under review', 'Approved', 'Released'];
const MODS = [ // id, label, icon, perm
  ['dashboard', 'Dashboard', '<i class="i i-dashboard"></i>', 'dashboard'], ['leads', 'Leads', '<i class="i i-target"></i>', 'leads'], ['customers', 'Customers', '<i class="i i-users"></i>', 'customers'],
  ['projects', 'Project pipeline', '<i class="i i-project"></i>', 'projects'], ['quotes', 'Quotations', '<i class="i i-receipt"></i>', 'quotes'],
  ['subsidy', 'Subsidy (PM Surya Ghar)', '<i class="i i-coin"></i>', 'checklist'], ['kseb', 'KSEB documentation', '<i class="i i-folder"></i>', 'checklist'],
  ['whatsapp', 'WhatsApp', '<i class="i i-chat"></i>', 'whatsapp'], ['ads', 'Meta Ads', '<i class="i i-megaphone"></i>', 'ads'], ['settings', 'Settings', '<i class="i i-gear"></i>', 'settings'], ['admin', 'Admin panel', '<i class="i i-shield"></i>', 'admin']];
const canW = m => ME && (ME.write === '*' || ME.write.includes(m));
const canR = m => ME && (ME.read === '*' || ME.read.includes(m));

async function api(m, a, body, qs = '') {
  const opt = body instanceof FormData ? { method: 'POST', body } : body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
  const r = await fetch(`api.php?m=${m}&a=${a}${qs}`, opt);
  const j = await r.json().catch(() => ({ error: 'Bad server response' }));
  if (r.status === 401 && m !== 'auth') { boot(); throw j; }
  if (j.error && !(m === 'auth' && (a === 'login' || a === 'setup'))) { alert(j.error); throw j; }
  return j;
}
const list = (m, qs = '') => api(m, 'list', undefined, qs);
const waNum = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };
const pill = (t, c = '') => `<span class="pill ${c}">${esc(t)}</span>`;
const stageCls = s => ({ Won: 'g', Commissioned: 'g', Closed: 'g', Released: 'g', Approved: 'g', Lost: 'r', New: 'b', Survey: 'b', Submitted: 'y', Applied: 'y', 'Under review': 'y' }[s] || '');

async function boot() {
  const s = await api('auth', 'status');
  if (!s.auth) return loginView(s.setup, s.brand || {});
  ME = s.user; S = await api('settings', 'get');
  shell(); mountBell(); startMeta(); route();
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
  $('#lf').onsubmit = async e => { e.preventDefault(); const b = $('#go'); b.disabled = true; b.textContent = 'Please wait…'; try { await api('auth', setup ? 'setup' : 'login', { name: $('#nm')?.value, username: $('#un').value, password: $('#pw').value }); boot(); } catch (j) { $('#e').textContent = j.error || 'Failed'; b.disabled = false; b.textContent = setup ? 'Create admin account' : 'Sign in'; } };
}
function shell() {
  const items = MODS.filter(m => m[0] === 'admin' ? ME.role === 'admin' : canR(m[3]));
  app.innerHTML = `<div id="shell"><aside id="side"><h1 class="brand"><img src="assets/logo.png" alt="Jasper"><span class="bt">Solarize <span>CRM</span></span></h1>
   ${items.map(m => `${m[0] === 'subsidy' ? '<div class="sep">Compliance</div>' : m[0] === 'whatsapp' ? '<div class="sep">Marketing</div>' : m[0] === 'settings' ? '<div class="sep">System</div>' : ''}<a href="#/${m[0]}" data-m="${m[0]}">${m[2]} ${m[1]}</a>`).join('')}
   </aside><div class="content"><div class="top"><button class="btn sec burger" id="bg"><i class="i i-menu"></i></button><h2 id="title"></h2><span class="mut" style="font-size:13px">${esc(ME.name)} · ${ME.role}</span>
   <button class="btn sec sm" id="pwb">Password</button><button class="btn sec sm" id="lo">Sign out</button></div><main id="main"></main></div></div>`;
  $('#bg').onclick = () => $('#side').classList.toggle('open');
  $('#lo').onclick = async () => { await api('auth', 'logout', {}); location.hash = ''; location.reload(); };
  $('#pwb').onclick = async () => { const o = prompt('Current password'); if (!o) return; const n = prompt('New password (min 8 characters)'); if (!n) return; await api('auth', 'password', { old: o, new: n }); alert('Password changed'); };
}
window.onhashchange = () => ME && route();
async function route() {
  const [, mod = 'dashboard', id] = location.hash.split('/');
  $$('aside a').forEach(a => a.classList.toggle('on', a.dataset.m === mod));
  $('#side')?.classList.remove('open');
  const t = MODS.find(m => m[0] === mod);
  $('#title').textContent = t ? t[1] : '';
  const main = $('#main'); main.innerHTML = '<p class="mut">Loading…</p>';
  const pages = { dashboard: pgDashboard, leads: pgLeads, customers: id ? pgCustomer : pgCustomers, projects: id ? pgProject : pgProjects, quotes: id ? pgQuote : pgQuotes, subsidy: () => pgOverview('subsidy'), kseb: () => pgOverview('kseb'), whatsapp: pgWhatsapp, ads: pgAds, settings: pgSettings, admin: pgAdmin };
  const fn = pages[mod] || pgDashboard;
  if (t && t[0] !== 'admin' && !canR(t[3])) { main.innerHTML = '<p>Not allowed.</p>'; return; }
  try { await fn(id && id !== 'new' ? +id : id); } catch (e) { if (!e.error) { main.innerHTML = `<p class="over">Error: ${esc(e.message || e)}</p>`; console.error(e); } }
}

// ---------- UI helpers ----------
function modal(html, wide) {
  const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div ${wide ? 'style="max-width:900px"' : ''}>${html}</div>`;
  m.addEventListener('mousedown', e => { if (e.target === m) m._md = true; }); m.addEventListener('mouseup', e => { if (e.target === m && m._md) m.remove(); m._md = false; });
  document.body.appendChild(m); return m;
}
function fld(f, v = {}) {
  const val = v[f.k] ?? f.d ?? '';
  const cls = f.full ? 'full' : '';
  let inp;
  if (f.opts) inp = `<select data-k="${f.k}">${f.opts.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(val) === String(ov) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;
  else if (f.t === 'textarea') inp = `<textarea data-k="${f.k}" rows="${f.rows || 3}">${esc(val)}</textarea>`;
  else inp = `<input data-k="${f.k}" type="${f.t || 'text'}" ${f.t === 'number' ? 'step="any"' : ''} value="${esc(val)}">`;
  return `<div class="${cls}"><label>${f.l}</label>${inp}</div>`;
}
const collect = r => { const o = {}; $$('[data-k]', r).forEach(e => o[e.dataset.k] = e.value); return o; };
const opt = (arr, blank) => (blank ? [['', blank]] : []).concat(arr);
function table(cols, rows, onRow) {
  const id = 't' + Math.random().toString(36).slice(2);
  setTimeout(() => $$(`#${id} tr.row`).forEach(r => r.onclick = e => { if (!e.target.closest('a,button,select,input')) onRow(r.dataset.id); }));
  return `<div class="card tw" id="${id}"><table><thead><tr>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr class="row" data-id="${r.id}">${cols.map(c => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="mut">Nothing here yet</td></tr>`}</tbody></table></div>`;
}
function tabsBar(key, names, def) {
  const cur = TAB[key] || def;
  return `<div class="tabs">${names.map(([k, l]) => `<button data-tab="${k}" class="${cur === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function bindTabs(key, redraw) { $$('[data-tab]').forEach(b => b.onclick = () => { TAB[key] = b.dataset.tab; redraw(); }); }
function csvParse(t) { const rows = []; let r = [], f = '', q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c == '"') { if (t[i + 1] == '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c == '"') q = true; else if (c == ',') r.push(f), f = ''; else if (c == '\n') { r.push(f.replace(/\r$/, '')); rows.push(r); r = []; f = ''; } else f += c; } if (f || r.length) { r.push(f); rows.push(r); } return rows; }
function csvObjs(t) { const rows = csvParse(t.replace(/^﻿/, '')); const h = rows.shift().map(x => x.trim().toLowerCase()); return rows.filter(r => r.some(x => x)).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); }
function csvDownload(name, cols, data) {
  const csv = [cols.join(',')].concat(data.map(c => cols.map(k => '"' + String(c[k] ?? '').replace(/"/g, '""') + '"').join(','))).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = name; a.click();
}
function pickFile(accept = '') { return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => res(i.files[0]); i.click(); }); }
async function upload(extra) { const f = await pickFile('.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt'); if (!f) return false; const fd = new FormData(); fd.append('file', f); Object.entries(extra).forEach(([k, v]) => fd.append(k, v ?? '')); await api('files', 'upload', fd); return true; }
const fileLink = f => `<a href="api.php?m=files&a=get&id=${f.id}" target="_blank">${esc(f.name)}</a> <small class="mut">${dt(f.created)} · ${Math.round(f.size / 1024)} KB</small>`;
function noteBox(entity, id, notes, redo) {
  return `<div class="card"><h3>Notes & activity</h3>${canW(entity) ? `<div class="bar"><input id="nt" placeholder="Add a note or call log…" style="max-width:none;flex:1"><button class="btn" id="an">Add</button></div>` : ''}
  ${(notes || []).map(n => `<div class="act">${esc(n.text)}<br><small>${esc(n.user)} · ${n.created}</small></div>`).join('') || '<p class="mut">No notes yet</p>'}</div>`;
}
function bindNote(entity, id, redo) { const b = $('#an'); if (b) b.onclick = async () => { const t = $('#nt').value; if (!t.trim()) return; await api('notes', 'add', { entity, entity_id: id, text: t }); redo(); }; }

// WhatsApp click-to-chat with template picker; logs the message.
function waOpen(ctx) {
  const T = S.wa_templates || [];
  const fill = (txt, c) => txt.replace(/\{name\}/g, c.name || '').replace(/\{company\}/g, S.company.name).replace(/\{amount\}/g, c.amount ?? '').replace(/\{quote_no\}/g, c.quote_no ?? '').replace(/\{date\}/g, c.date ?? '');
  const m = modal(`<h3 style="margin-top:0">WhatsApp → ${esc(ctx.name)} <span class="mut">(${esc(ctx.phone || 'no phone')})</span></h3>
   <label>Template</label><select id="wt">${T.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('')}</select>
   <label>Message (editable)</label><textarea id="wm" rows="6"></textarea>
   <div class="bar" style="margin-top:12px"><button class="btn ok" id="wgo">Open WhatsApp</button><button class="btn sec" id="wx">Close</button></div>`);
  const set = () => $('#wm', m).value = fill(T[$('#wt', m).value]?.text || '', ctx);
  $('#wt', m).onchange = set; set();
  $('#wx', m).onclick = () => m.remove();
  $('#wgo', m).onclick = async () => {
    if (!waNum(ctx.phone)) return alert('This contact has no phone number');
    const text = $('#wm', m).value;
    window.open(`https://wa.me/${waNum(ctx.phone)}?text=${encodeURIComponent(text)}`, '_blank');
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
  const card = (ic, label, val, tdy, v, col, go) => `<a class="card sc" href="${go}" style="--c:${col}"><div class="sch"><span class="ic">${ic}</span>${label}</div><b>${val}</b><small>${tdy} today</small><div class="line"></div><small class="mut">${v}</small></a>`;
  const QA = [['<i class="i i-plus"></i>', 'Add Lead', 'leads', 'new'], ['<i class="i i-target"></i>', 'View Leads', 'leads', '#/leads'], ['<i class="i i-users"></i>', 'Customers', 'customers', '#/customers'], ['<i class="i i-project"></i>', 'Projects', 'projects', '#/projects'], ['<i class="i i-receipt"></i>', 'Quotations', 'quotes', '#/quotes'], ['<i class="i i-note"></i>', 'New Quote', 'quotes', 'quote'],
    ['<i class="i i-coin"></i>', 'Subsidy', 'checklist', '#/subsidy'], ['<i class="i i-folder"></i>', 'KSEB Docs', 'checklist', '#/kseb'], ['<i class="i i-chat"></i>', 'WhatsApp', 'whatsapp', '#/whatsapp'], ['<i class="i i-megaphone"></i>', 'Meta Ads', 'ads', '#/ads'], ['<i class="i i-gear"></i>', 'Settings', 'settings', '#/settings'], ['<i class="i i-shield"></i>', 'Admin', 'admin', '#/admin']]
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
  // target gauge
  const f = Math.min(1, d.lead_year / (d.lead_target || 1000));
  const gauge = `<svg viewBox="0 0 220 130" style="width:260px;max-width:100%"><path d="M10 115 A100 100 0 0 1 210 115" pathLength="100" fill="none" stroke="#ececf0" stroke-width="26"/><path d="M10 115 A100 100 0 0 1 210 115" pathLength="100" fill="none" stroke="#0071e3" stroke-width="26" stroke-dasharray="${f * 100} 100" stroke-linecap="butt"/>
   <text x="110" y="100" text-anchor="middle" font-size="26" font-weight="700" fill="#1d1d1f">${d.lead_year}</text><text x="110" y="118" text-anchor="middle" font-size="11" fill="#6e6e73">leads this year</text></svg>`;
  $('#main').innerHTML = `<div style="margin-bottom:16px"><h2 style="margin:0;font-size:26px">Hello, ${esc(first)}!</h2><div class="mut">Here's how Jasper Solar is doing today.</div></div>
  <div class="dash"><div>
   <div id="newleads" style="margin-bottom:14px"></div>
   <div class="grid stats4">${card('<i class="i i-target"></i>', 'Leads', d.leads_total, d.leads_today, vs(d.leads_vs), '#30a14e', '#/leads')}${card('<i class="i i-users"></i>', 'Customers', d.cust_total, d.cust_today, vs(d.cust_vs), '#0071e3', '#/customers')}${card('<i class="i i-project"></i>', 'Active Projects', d.proj_active, d.proj_today, vs(d.proj_vs), '#af52de', '#/projects')}${card('<i class="i i-alert"></i>', 'Overdue Follow-ups', d.overdue, d.due_today, d.due_today + ' due today', '#ff375f', '#/leads')}</div>
   <div class="grid stats" style="margin-top:14px">${[['Pipeline value', inr(d.pipeline)], ['Billed', inr(d.billed)], ['Received', inr(d.paid)], ['Outstanding', inr(d.outstanding)], ['Ad spend (month)', inr(d.spend_month)], ['Cost per lead', inr(d.cpl)]].map(([l, v]) => `<div class="card stat" style="padding:12px 14px"><b style="font-size:19px">${v}</b><span>${l}</span></div>`).join('')}</div>
   <div class="card" style="margin-top:14px"><div class="bar" style="margin:0 0 8px"><h3 style="margin:0">Quick Actions</h3></div><div class="qa">${QA.map(q => `<button class="qb" data-qa="${q[3]}" data-go="${q[1]}"><span>${q[0]}</span>${q[1]}</button>`).join('')}</div></div>
   <div class="grid cols2" style="margin-top:14px"><div class="card"><div class="bar" style="margin:0"><h3 style="margin:0">Lead Trend · 30 days</h3><span class="sp"></span><small><span style="color:#0071e3">●</span> Leads &nbsp;<span style="color:#30a14e">●</span> Won</small></div>${trend}</div>
   <div class="card"><h3>Lead by Source</h3>${src}</div></div>
   <div class="grid cols2" style="margin-top:14px"><div class="card"><div class="bar" style="margin:0"><h3 style="margin:0">Lead → Customer Conversion</h3><span class="sp"></span><b style="font-size:26px;color:var(--ok)">${conv}%</b></div><div class="mut" style="font-size:12px;margin-bottom:10px">${d.converted} of ${d.leads_all} leads converted</div><div class="prog" style="height:10px"><i style="width:${Math.min(100, conv)}%"></i></div>
     <h3 style="margin-top:20px">Projects by stage</h3>${bars(d.stages.map(s => [s.stage, s.n]), S.project_stages)}</div>
   <div class="card" style="text-align:center"><h3 style="text-align:left">LEAD GENERATION TARGET — THIS YEAR</h3>${gauge}<div class="mut" style="font-size:13px">Remaining: <b style="color:var(--tx)">${Math.max(0, d.lead_target - d.lead_year)}</b> &nbsp;·&nbsp; Target: <b style="color:var(--tx)">${d.lead_target}</b></div></div></div>
   <div class="grid cols2" style="margin-top:14px"><div class="card"><h3>Payments pending (${d.dues.length})</h3>${d.dues.map(p => `<div class="act"><a href="#/projects/${p.id}"><b>${esc(p.customer || p.title)}</b></a> <b class="over">${inr(p.due)}</b><br><small>${esc(p.title)}</small></div>`).join('') || '<p class="mut">All clear</p>'}</div>
   <div class="card"><h3>KSEB documents pending (${d.kseb_pending.length})</h3>${d.kseb_pending.map(p => `<div class="act"><a href="#/projects/${p.id}"><b>${esc(p.title)}</b></a> ${p.done}/${p.total} done</div>`).join('') || '<p class="mut">All documents complete</p>'}</div>
   <div class="card"><h3>Subsidy in progress (${d.subsidy_open.length})</h3>${d.subsidy_open.map(p => `<div class="act"><a href="#/projects/${p.id}"><b>${esc(p.title)}</b></a> ${pill(p.subsidy_status || 'Not applied', stageCls(p.subsidy_status))} ${p.subsidy_amount ? inr(p.subsidy_amount) : ''}</div>`).join('') || '<p class="mut">None</p>'}</div></div>
  </div>
  <div>
   <div class="card"><div style="display:flex;gap:12px;align-items:center"><div class="avatar"><i class="i i-sun"></i></div><div><b style="font-size:16px">Solarize Assistant</b><div class="mut" style="font-size:12px">Your daily summary</div></div></div>
    <p style="margin:14px 0 2px"><b>Good ${gm}, ${esc(first)} </b></p><div class="mut" style="font-size:13px;margin-bottom:12px">Here's what's happening today.</div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px">${[['<i class="i i-calendar"></i>', d.due_today, 'Follow-ups today'], ['<i class="i i-alert"></i>', d.overdue, 'Overdue'], ['<i class="i i-card"></i>', d.dues.length, 'Payments due'], ['<i class="i i-folder"></i>', d.kseb_pending.length, 'Docs pending']].map(([i, n, l]) => `<div class="tile"><span>${i}</span><div><b>${n}</b><small>${l}</small></div></div>`).join('')}</div>
    <div class="warn"><span>${d.overdue ? '' + d.overdue + ' follow-up' + (d.overdue > 1 ? 's are' : ' is') + ' overdue' : '<i class="i i-check"></i> No overdue follow-ups'}</span>${d.overdue ? '<button class="btn sm" id="vod">View Overdue</button>' : ''}</div></div>
   <div class="card" style="margin-top:14px" id="cal"></div>
   <div class="card" style="margin-top:14px"><div class="bar" style="margin:0 0 6px"><h3 style="margin:0">Recent Activity</h3></div>${d.recent.map(r => `<div class="act"><b>${esc(r.user)}</b> ${esc(r.action)} ${esc(r.entity)} <span class="mut">${esc(r.detail || '')}</span><br><small>${r.created}</small></div>`).join('') || '<p class="mut" style="text-align:center;padding:14px 0">No recent activities</p>'}</div>
  </div></div>`;
  $$('[data-qa]').forEach(b => b.onclick = () => { const q = b.dataset.qa; if (q === 'new') leadModal(0); else if (q === 'quote') { sessionStorage.removeItem('lead2quote'); location.hash = '#/quotes/new'; } else location.hash = q; });
  if ($('#vod')) $('#vod').onclick = () => { LF.appt = 'overdue'; LF.active = 'active'; location.hash = '#/leads'; };
  // calendar with appointment dots
  let cm = new Date(); cm.setDate(1); let sel = today();
  const drawCal = () => {
    const y = cm.getFullYear(), mo = cm.getMonth(), start = (new Date(y, mo, 1).getDay() + 6) % 7, dim = new Date(y, mo + 1, 0).getDate(), by = {};
    d.appts.forEach(a => (by[a.d] = by[a.d] || []).push(a));
    const cells = []; for (let i = 0; i < start; i++) cells.push(''); for (let i = 1; i <= dim; i++) cells.push(`${y}-${String(mo + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`);
    const ev = by[sel] || [];
    $('#cal').innerHTML = `<div class="calw"><div><div class="bar" style="margin:0 0 6px"><h3 style="margin:0;margin-right:auto">Calendar</h3><button class="btn sec sm" id="cp">‹</button><b style="font-size:13px">${cm.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b><button class="btn sec sm" id="cn">›</button></div>
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
const LCOLS = [['date', 'Added date'], ['name', 'Name'], ['phone', 'Phone'], ['status', 'Status'], ['city', 'City'], ['location', 'Location'], ['added_by', 'Added by'], ['remark', 'Remark'], ['appt', 'Appt']];
let LF = { q: '', status: '', active: 'active', city: '', appt: '', sort: 'created', dir: -1, edit: false };
let LHIDE = []; try { LHIDE = JSON.parse(localStorage.lcols || '[]'); } catch (e) { }
const dmy = s => s ? new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const isActiveLead = l => !['Won', 'Lost'].includes(l.status);
function apptBadge(l) {
  if (!l.appt) return '<span class="pill" style="color:var(--mut)">● Not Scheduled</span>';
  const od = l.appt < today() && isActiveLead(l), days = Math.round((new Date(today()) - new Date(l.appt)) / 864e5);
  return `<span class="pill g">● ${dmy(l.appt)}</span>${od ? `<br><span class="pill r" style="margin-top:3px"><i class="i i-alert"></i> OVERDUE · ${days}d</span>` : ''}`;
}
async function pgLeads() {
  const [leads, camps] = await Promise.all([list('leads'), canR('ads') ? list('campaigns') : []]);
  CACHE.leads = leads; CACHE.camps = camps; const w = canW('leads');
  const cities = [...new Set(leads.map(l => l.city).filter(Boolean))].sort();
  $('#main').innerHTML = `<div class="bar" style="align-items:flex-start;margin-bottom:6px"><div><h2 style="margin:0;font-size:26px">Leads</h2><div class="mut" id="lcount"></div></div><span class="sp"></span>
   <button class="btn sec" id="lref"><i class="i i-refresh"></i> Refresh</button>${w ? `<button class="btn sec" id="ledit"><i class="i i-pencil"></i> Edit ${LF.edit ? 'ON' : 'OFF'}</button><button class="btn" id="lnew"><i class="i i-plus"></i> Add Lead</button>` : ''}</div>
   <div class="bar" style="margin-top:12px"><input id="lq" placeholder="Search by name, phone, city, location…" style="max-width:340px" value="${esc(LF.q)}">
   <select id="ls"><option value="">All Statuses</option>${S.lead_statuses.map(s => `<option ${LF.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
   <select id="la">${[['active', 'Active Leads'], ['all', 'All Leads'], ['won', 'Won'], ['lost', 'Lost']].map(([v, l]) => `<option value="${v}" ${LF.active === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
   <select id="lc"><option value="">All Cities</option>${cities.map(c => `<option ${LF.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
   <select id="lap">${[['', 'All Appointments'], ['overdue', 'Overdue'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['none', 'Not Scheduled']].map(([v, l]) => `<option value="${v}" ${LF.appt === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
   <div style="position:relative"><button class="btn sec" id="lcol"><i class="i i-menu"></i> Columns</button><div id="lcm" class="card hide" style="position:absolute;z-index:9;top:42px;left:0;width:190px;padding:10px">${LCOLS.map(([k, l]) => `<label style="margin:4px 0;display:flex;gap:8px;align-items:center;color:var(--tx);font-size:14px"><input type="checkbox" style="width:auto" data-col="${k}" ${LHIDE.includes(k) ? '' : 'checked'}>${l}</label>`).join('')}</div></div>
   <span class="sp"></span><button class="btn sec" id="lex">Export CSV</button>${w ? '<button class="btn sec" id="lim">Import CSV</button>' : ''}</div>
   ${w ? `<p class="mut" style="font-size:13px;margin:0 0 10px"><i class="i i-pencil"></i> ${LF.edit ? 'Click any cell to edit it inline.' : 'Turn Edit ON to edit cells inline.'} Click the column headers to sort.</p>` : ''}
   <div class="card tw" style="padding:0"><table id="ltb"></table></div>`;

  const filtered = () => {
    const t = LF.q.toLowerCase(), td = today();
    let r = leads.filter(l => (!LF.status || l.status === LF.status) && (LF.active === 'all' || (LF.active === 'active' ? isActiveLead(l) : l.status === (LF.active === 'won' ? 'Won' : 'Lost')))
      && (!LF.city || l.city === LF.city) && (!t || [l.name, l.phone, l.city, l.location, l.remark, l.address].join(' ').toLowerCase().includes(t))
      && (!LF.appt || (LF.appt === 'none' ? !l.appt : LF.appt === 'overdue' ? l.appt && l.appt < td && isActiveLead(l) : LF.appt === 'today' ? l.appt === td : l.appt > td)));
    const key = l => l[LF.sort] ?? '';
    return r.sort((a, b) => { const x = key(a), y = key(b); if (LF.sort === 'appt') { if (!x) return 1; if (!y) return -1; } return (x > y ? 1 : x < y ? -1 : 0) * LF.dir; });
  };
  const sk = k => k === 'date' ? 'created' : k;
  const draw = () => {
    const rows = filtered(), show = LCOLS.filter(c => !LHIDE.includes(c[0]));
    $('#lcount').textContent = rows.length + ' records';
    const ed = (l, f, html) => `<td data-f="${f}" ${LF.edit && w ? 'style="cursor:text" title="Click to edit"' : ''}>${html}</td>`;
    const cell = { date: l => `<td class="mut" style="white-space:nowrap">${dmy(l.created)}</td>`, name: l => ed(l, 'name', `${l.notify ? '<span class="ndot" title="New lead — not contacted yet"></span>' : ''}<b>${esc(l.name)}</b>${l.source === 'Meta Ads' ? ' <span class="pill" style="font-size:11px">Meta</span>' : ''}`), phone: l => ed(l, 'phone', esc(l.phone)), status: l => ed(l, 'status', pill(l.status, stageCls(l.status))), city: l => ed(l, 'city', esc(l.city)), location: l => ed(l, 'location', esc(l.location || l.address)),
      added_by: l => `<td>${esc(l.added_by)}</td>`, remark: l => ed(l, 'remark', l.remark ? esc(l.remark) : '<span class="mut"><i>Add remark</i></span>'), appt: l => ed(l, 'appt', apptBadge(l)) };
    $('#ltb').innerHTML = `<thead><tr>${show.map(([k, l]) => `<th data-sort="${sk(k)}" style="cursor:pointer;white-space:nowrap">${l}${LF.sort === sk(k) ? (LF.dir > 0 ? ' ↑' : ' ↓') : ' ⇅'}</th>`).join('')}<th class="right">Action</th></tr></thead><tbody>${rows.map(l => `<tr data-id="${l.id}">${show.map(([k]) => cell[k](l)).join('')}
      <td class="right" style="min-width:150px;max-width:190px">${l.phone ? `<button class="btn sm ok" title="WhatsApp" data-a="wa"><i class="i i-chat"></i></button> <a class="btn sm sec" title="Call" href="tel:${esc(l.phone)}"><i class="i i-phone"></i></a> ` : ''}${w ? '<button class="btn sm sec" title="Add remark" data-a="rm"><i class="i i-note"></i></button> ' : ''}<button class="btn sm sec" title="View" data-a="vw"><i class="i i-eye"></i></button>${w ? ' <button class="btn sm sec" title="Edit" data-a="ed"><i class="i i-pencil"></i></button>' : ''}
      ${l.customer_id ? ` <a class="btn sm sec" title="Open customer" href="#/customers/${l.customer_id}"><i class="i i-user"></i></a>` : w ? ' <button class="btn sm sec" title="Convert to customer" data-a="cv"><i class="i i-userplus"></i></button>' : ''}${canW('quotes') ? ' <button class="btn sm sec" title="Create quotation" data-a="qt"><i class="i i-receipt"></i></button>' : ''}</td></tr>`).join('') || `<tr><td colspan="${show.length + 1}" class="mut">No leads match</td></tr>`}</tbody>`;
    $$('#ltb th[data-sort]').forEach(h => h.onclick = () => { const k = h.dataset.sort; LF.dir = LF.sort === k ? -LF.dir : (k === 'created' ? -1 : 1); LF.sort = k; draw(); });
    $$('#ltb tbody tr[data-id]').forEach(tr => {
      const l = leads.find(x => x.id == tr.dataset.id);
      if (LF.edit && w) $$('td[data-f]', tr).forEach(td => td.onclick = () => startEdit(td, l));
      $$('[data-a]', tr).forEach(b => b.onclick = async () => {
        const a = b.dataset.a;
        if (a === 'wa') waOpen({ name: l.name, phone: l.phone, lead_id: l.id });
        if (a === 'vw' || a === 'ed') leadModal(l.id);
        if (a === 'rm') { const r = prompt('Remark for ' + l.name, l.remark || ''); if (r !== null) { l.remark = r; await api('leads', 'save', { ...l }); draw(); } }
        if (a === 'cv') { if (confirm('Convert ' + l.name + ' to a customer?')) { const r = await api('leads', 'convert', { id: l.id }); location.hash = '#/customers/' + r.customer_id; } }
        if (a === 'qt') { sessionStorage.lead2quote = JSON.stringify({ lead_id: l.id, customer_id: l.customer_id || '', name: l.name }); location.hash = '#/quotes/new'; }
      });
    });
  };
  const startEdit = (td, l) => {
    const f = td.dataset.f; if (td.querySelector('input,select')) return; let el;
    if (f === 'status') { el = document.createElement('select'); el.innerHTML = S.lead_statuses.map(s => `<option ${s === l.status ? 'selected' : ''}>${s}</option>`).join(''); }
    else { el = document.createElement('input'); el.type = f === 'appt' ? 'date' : f === 'phone' ? 'tel' : 'text'; el.value = (f === 'location' ? (l.location || l.address) : l[f]) || ''; }
    td.innerHTML = ''; td.appendChild(el); el.focus(); let fin = false;
    const done = async save => { if (fin) return; fin = true; if (save && el.value !== (l[f] || '')) { if (f === 'name' && !el.value.trim()) { draw(); return; } l[f] = el.value; await api('leads', 'save', { ...l }); } draw(); };
    el.onblur = () => done(true); el.onchange = () => done(true); el.onkeydown = e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
  };
  $('#lq').oninput = e => { LF.q = e.target.value; draw(); };
  [['ls', 'status'], ['la', 'active'], ['lc', 'city'], ['lap', 'appt']].forEach(([id, k]) => $('#' + id).onchange = e => { LF[k] = e.target.value; draw(); });
  $('#lref').onclick = () => route();
  if ($('#ledit')) $('#ledit').onclick = () => { LF.edit = !LF.edit; route(); };
  if ($('#lnew')) $('#lnew').onclick = () => leadModal(0);
  $('#lcol').onclick = () => $('#lcm').classList.toggle('hide');
  $$('[data-col]').forEach(c => c.onchange = () => { LHIDE = $$('[data-col]').filter(x => !x.checked).map(x => x.dataset.col); try { localStorage.lcols = JSON.stringify(LHIDE); } catch (e) { } draw(); });
  $('#lex').onclick = () => csvDownload('leads-' + today() + '.csv', ['name', 'phone', 'email', 'city', 'location', 'source', 'status', 'appt', 'remark', 'kw', 'budget', 'added_by', 'created', 'notes'], leads);
  if ($('#lim')) $('#lim').onclick = async () => { const f = await pickFile('.csv'); if (!f) return; const rows = csvObjs(await f.text()); let n = 0; for (const r of rows) { if (!r.name) continue; await api('leads', 'save', { ...r, status: r.status || 'New' }); n++; } alert('Imported ' + n + ' leads'); route(); };
  draw();
}
async function leadModal(id) {
  const l = id ? await api('leads', 'get', undefined, '&id=' + id) : { status: 'New', source: S.lead_sources[0] };
  if (id && !l.location) l.location = l.address;
  const F = [{ k: 'name', l: 'Name' }, { k: 'phone', l: 'Phone', t: 'tel' }, { k: 'email', l: 'Email' }, { k: 'source', l: 'Source', opts: S.lead_sources }, { k: 'city', l: 'City' }, { k: 'location', l: 'Location / address' },
    { k: 'status', l: 'Status', opts: S.lead_statuses }, { k: 'appt', l: 'Appointment date', t: 'date' }, { k: 'kw', l: 'Interested kW', t: 'number' }, { k: 'budget', l: 'Budget (₹)', t: 'number' }, { k: 'remark', l: 'Remark', full: 1 }];
  if ((CACHE.camps || []).length) F.splice(4, 0, { k: 'campaign_id', l: 'Meta campaign', opts: opt(CACHE.camps.map(c => [c.id, c.name]), '— none —') });
  const w = canW('leads');
  const m = modal(`<h2 style="margin-top:0">${id ? 'Lead' : 'New lead'}</h2><div class="two">${F.map(f => fld(f, l)).join('')}</div><label>Notes</label><textarea data-k="notes" rows="2">${esc(l.notes || '')}</textarea>
   <div class="bar" style="margin-top:14px">${w ? '<button class="btn" id="sv">Save</button>' : ''}<button class="btn sec" id="cx">Close</button>
   ${id && l.phone ? '<button class="btn ok" id="wa">WhatsApp</button><a class="btn sec" href="tel:' + esc(l.phone) + '">Call</a>' : ''}
   ${id && w && !l.customer_id ? '<button class="btn sec" id="cv">Convert to customer</button>' : ''}${l.customer_id ? `<a class="btn sec" href="#/customers/${l.customer_id}" id="oc">Open customer</a>` : ''}
   ${id && canW('quotes') ? '<button class="btn sec" id="qt">Create quotation</button>' : ''}<span class="sp"></span>${id && w ? '<button class="btn bad" id="dl">Delete</button>' : ''}</div>
   ${id ? `<p class="mut" style="font-size:12px">Added by ${esc(l.added_by || '—')} on ${dmy(l.created)}</p>` + noteBox('leads', id, l.notes_log) + `<div class="card" style="margin-top:10px"><h3>Messages sent</h3>${(l.messages || []).map(x => `<div class="act">${esc(x.text)}<br><small>${esc(x.user)} · ${x.created}</small></div>`).join('') || '<p class="mut">None</p>'}</div>` : ''}`);
  $('#cx', m).onclick = () => m.remove();
  if ($('#oc', m)) $('#oc', m).onclick = () => m.remove();
  if (w) $('#sv', m).onclick = async () => { const o = { ...l, id, ...collect(m) }; if (!o.name) return alert('Name required'); await api('leads', 'save', o); m.remove(); route(); };
  if ($('#wa', m)) $('#wa', m).onclick = () => waOpen({ name: l.name, phone: l.phone, lead_id: id });
  if ($('#cv', m)) $('#cv', m).onclick = async () => { const r = await api('leads', 'convert', { id }); m.remove(); location.hash = '#/customers/' + r.customer_id; };
  if ($('#qt', m)) $('#qt', m).onclick = () => { m.remove(); sessionStorage.lead2quote = JSON.stringify({ lead_id: id, customer_id: l.customer_id || '', name: l.name }); location.hash = '#/quotes/new'; };
  if ($('#dl', m)) $('#dl', m).onclick = async () => { if (confirm('Delete this lead?')) { await api('leads', 'delete', { id }); m.remove(); route(); } };
  bindNote('leads', id, () => { m.remove(); leadModal(id); });
}

// ---------- Customers ----------
async function pgCustomers() {
  const cs = await list('customers'); const projs = await list('projects'); const cnt = {}; projs.forEach(p => cnt[p.customer_id] = (cnt[p.customer_id] || 0) + 1);
  let q = '';
  const draw = () => { const t = q.toLowerCase(); $('#ct').innerHTML = table([['Name', c => `<b>${esc(c.name)}</b><br><small class="mut">${esc((c.address || '').slice(0, 45))}</small>`], ['Phone', c => esc(c.phone)], ['Consumer no.', c => esc(c.consumer_no)], ['Projects', c => cnt[c.id] || 0]],
    cs.filter(c => !t || [c.name, c.phone, c.address, c.consumer_no].join(' ').toLowerCase().includes(t)), id => location.hash = '#/customers/' + id); };
  $('#main').innerHTML = `<div class="bar"><input id="cq" placeholder="Search customers…"><span class="sp"></span><button class="btn sec" id="cex">Export CSV</button>${canW('customers') ? ' <button class="btn sec" id="cim">Import CSV</button> <button class="btn" id="cnew">+ New customer</button>' : ''}</div><div id="ct"></div>`;
  $('#cq').oninput = e => { q = e.target.value; draw(); }; draw();
  $('#cex').onclick = () => csvDownload('customers-' + today() + '.csv', ['name', 'phone', 'email', 'address', 'consumer_no', 'kseb_section', 'sanctioned_load', 'roof_type', 'gst_no', 'notes'], cs);
  if ($('#cnew')) $('#cnew').onclick = () => customerModal(0);
  if ($('#cim')) $('#cim').onclick = async () => { const f = await pickFile('.csv'); if (!f) return; let n = 0; for (const r of csvObjs(await f.text())) { if (!r.name) continue; await api('customers', 'save', r); n++; } alert('Imported ' + n); route(); };
}
const CF = [{ k: 'name', l: 'Name' }, { k: 'phone', l: 'Phone', t: 'tel' }, { k: 'email', l: 'Email' }, { k: 'consumer_no', l: 'KSEB consumer no.' }, { k: 'address', l: 'Address', full: 1 }, { k: 'kseb_section', l: 'KSEB section office' },
  { k: 'sanctioned_load', l: 'Sanctioned load (kW)', t: 'number' }, { k: 'roof_type', l: 'Roof type', opts: ['', 'RCC flat', 'Sheet / tin', 'Tile', 'Other'] }, { k: 'gst_no', l: 'GST no. (if business)' }];
function customerModal(id, c = {}) {
  const m = modal(`<h2 style="margin-top:0">${id ? 'Edit' : 'New'} customer</h2><div class="two">${CF.map(f => fld(f, c)).join('')}</div><label>Notes</label><textarea data-k="notes" rows="2">${esc(c.notes || '')}</textarea>
   <div class="bar" style="margin-top:14px"><button class="btn" id="sv">Save</button><button class="btn sec" id="cx">Close</button></div>`);
  $('#cx', m).onclick = () => m.remove();
  $('#sv', m).onclick = async () => { const o = { id, ...collect(m) }; if (!o.name) return alert('Name required'); const r = await api('customers', 'save', o); m.remove(); if (id) route(); else location.hash = '#/customers/' + r.id; };
}
async function pgCustomer(id) {
  const c = await api('customers', 'get', undefined, '&id=' + id);
  const w = canW('customers');
  $('#main').innerHTML = `<p><a href="#/customers">← Customers</a></p>
   <div class="card"><div class="bar" style="margin:0"><h2 style="margin:0;margin-right:auto">${esc(c.name)}</h2>${c.phone ? '<button class="btn ok" id="wa">WhatsApp</button><a class="btn sec" href="tel:' + esc(c.phone) + '">Call</a>' : ''}${w ? '<button class="btn sec" id="ed">Edit</button><button class="btn bad" id="dl">Delete</button>' : ''}</div>
   <p class="mut" style="margin:6px 0 0">${esc(c.phone)} ${c.email ? '· ' + esc(c.email) : ''}<br>${esc(c.address)}<br>${c.consumer_no ? 'Consumer no. <b>' + esc(c.consumer_no) + '</b>' : ''} ${c.kseb_section ? '· Section: ' + esc(c.kseb_section) : ''} ${c.sanctioned_load ? '· Load ' + c.sanctioned_load + ' kW' : ''} ${c.roof_type ? '· ' + esc(c.roof_type) + ' roof' : ''} ${c.gst_no ? '· GST ' + esc(c.gst_no) : ''}</p></div>
   <div class="grid cols2" style="margin-top:12px"><div class="card"><h3>Projects ${canW('projects') ? '<button class="btn sm" id="np" style="float:right">+ New project</button>' : ''}</h3>
    ${c.projects.map(p => `<div class="act"><a href="#/projects/${p.id}"><b>${esc(p.title)}</b></a> ${pill(p.stage, stageCls(p.stage))}<br><small>${p.kw} kW · ${inr(p.cost)} · paid ${inr(p.paid)}</small></div>`).join('') || '<p class="mut">No projects yet</p>'}</div>
   <div class="card"><h3>Quotations ${canW('quotes') ? '<button class="btn sm" id="nq" style="float:right">+ New quote</button>' : ''}</h3>${c.quotes.map(q => `<div class="act"><a href="#/quotes/${q.id}"><b>${esc(q.number)}</b></a> ${pill(q.status, stageCls(q.status))} ${inr(q.total)}<br><small>${q.date}</small></div>`).join('') || '<p class="mut">No quotations</p>'}</div>
   <div class="card"><h3>Documents ${canW('files') ? '<button class="btn sm" id="up" style="float:right">Upload</button>' : ''}</h3>${c.files.map(f => `<div class="act">${fileLink(f)}${f.item ? '<br><small>' + esc(f.item) + '</small>' : ''}</div>`).join('') || '<p class="mut">No documents</p>'}</div>
   <div class="card"><h3>WhatsApp messages</h3>${c.messages.map(x => `<div class="act">${esc(x.text)}<br><small>${esc(x.user)} · ${x.created}</small></div>`).join('') || '<p class="mut">None sent</p>'}</div></div>
   <div style="margin-top:12px">${noteBox('customers', id, c.notes_log)}</div>`;
  if ($('#wa')) $('#wa').onclick = () => waOpen({ name: c.name, phone: c.phone, customer_id: id });
  if ($('#ed')) $('#ed').onclick = () => customerModal(id, c);
  if ($('#dl')) $('#dl').onclick = async () => { if (confirm('Delete this customer and ALL their projects, quotes and files? This cannot be undone.')) { await api('customers', 'delete', { id }); location.hash = '#/customers'; } };
  if ($('#np')) $('#np').onclick = () => projectModal(0, { customer_id: id });
  if ($('#nq')) $('#nq').onclick = () => { sessionStorage.lead2quote = JSON.stringify({ customer_id: id, name: c.name }); location.hash = '#/quotes/new'; };
  if ($('#up')) $('#up').onclick = async () => { if (await upload({ customer_id: id })) route(); };
  bindNote('customers', id, route);
}

// ---------- Projects ----------
let PV = 'board';
async function pgProjects() {
  const ps = await list('projects'); CACHE.projects = ps;
  const draw = () => {
    if (PV === 'board') {
      $('#pv').innerHTML = `<div class="board">${S.project_stages.map(s => { const cs = ps.filter(p => p.stage === s); return `<div class="col" data-s="${esc(s)}"><h4><span>${esc(s)}</span><span>${cs.length} · ${inr(cs.reduce((a, p) => a + p.cost, 0))}</span></h4>${cs.map(p => `<div class="k" draggable="true" data-id="${p.id}"><b>${esc(p.customer || '—')}</b><small>${esc(p.title)}</small><small>${p.kw} kW · ${inr(p.cost)}</small></div>`).join('')}</div>`; }).join('')}</div>`;
      $$('.k').forEach(k => { k.ondragstart = e => e.dataTransfer.setData('id', k.dataset.id); k.onclick = () => location.hash = '#/projects/' + k.dataset.id; });
      if (canW('projects')) $$('.col').forEach(c => { c.ondragover = e => e.preventDefault(); c.ondrop = async e => { e.preventDefault(); const p = ps.find(x => x.id == e.dataTransfer.getData('id')); if (p && p.stage !== c.dataset.s) { await api('projects', 'save', { ...p, stage: c.dataset.s }); route(); } }; });
    } else $('#pv').innerHTML = table([['Customer', p => `<b>${esc(p.customer)}</b>`], ['Project', p => esc(p.title)], ['kW', p => p.kw], ['Stage', p => pill(p.stage, stageCls(p.stage))], ['Value', p => inr(p.cost)], ['Balance', p => inr(p.cost - p.paid)], ['Engineer', p => esc(p.engineer)]], ps, id => location.hash = '#/projects/' + id);
  };
  $('#main').innerHTML = `<div class="bar"><div class="tabs" style="margin:0"><button data-v="board" class="${PV === 'board' ? 'on' : ''}">Board</button><button data-v="list" class="${PV === 'list' ? 'on' : ''}">List</button></div><span class="sp"></span>${canW('projects') ? '<button class="btn" id="pn">+ New project</button>' : ''}</div><div id="pv"></div>`;
  $$('[data-v]').forEach(b => b.onclick = () => { PV = b.dataset.v; route(); });
  if ($('#pn')) $('#pn').onclick = () => projectModal(0, {}); draw();
}
async function projectModal(id, p = {}) {
  const cs = await list('customers');
  const F = [{ k: 'customer_id', l: 'Customer', opts: opt(cs.map(c => [c.id, c.name]), '— select —'), full: 1 }, { k: 'title', l: 'Project title', d: p.title || '3 kW rooftop solar', full: 1 }, { k: 'kw', l: 'System size (kW)', t: 'number' }, { k: 'stage', l: 'Stage', opts: S.project_stages },
    { k: 'panel', l: 'Panels', d: 'ReNew 550 Wp M10 Bifacial' }, { k: 'inverter', l: 'Inverter' }, { k: 'cost', l: 'Project value (₹)', t: 'number' }, { k: 'engineer', l: 'Site engineer' }, { k: 'start', l: 'Start date', t: 'date' }, { k: 'end', l: 'Completion date', t: 'date' }];
  const m = modal(`<h2 style="margin-top:0">${id ? 'Edit' : 'New'} project</h2><div class="two">${F.map(f => fld(f, p)).join('')}</div><label>Notes</label><textarea data-k="notes" rows="2">${esc(p.notes || '')}</textarea>
   <div class="bar" style="margin-top:14px"><button class="btn" id="sv">Save</button><button class="btn sec" id="cx">Close</button></div>`);
  $('#cx', m).onclick = () => m.remove();
  $('#sv', m).onclick = async () => { const o = { ...p, ...collect(m) }; if (id) o.id = id; if (!o.customer_id) return alert('Select a customer'); const r = await api('projects', 'save', o); m.remove(); location.hash = '#/projects/' + r.id; route(); };
}
function subsidyCalc(kw) { const r = S.subsidy_rates; kw = Math.max(0, +kw || 0); return Math.min(r.cap, Math.min(kw, 2) * r.per_kw_first2 + Math.max(0, Math.min(kw, 3) - 2) * r.third_kw); }
async function pgProject(id) {
  const p = await api('projects', 'get', undefined, '&id=' + id);
  const w = canW('projects'), wc = canW('checklist');
  const paid = p.payments.reduce((a, x) => a + x.amount, 0);
  const tabs = [['overview', 'Overview & payments'], ['subsidy', 'Subsidy'], ['kseb', 'KSEB documents'], ['files', 'Files']];
  const draw = () => {
    const t = TAB.proj || 'overview';
    let body = '';
    if (t === 'overview') body = `<div class="grid cols2"><div class="card"><h3>Details</h3><p class="mut" style="margin:0">Panels: ${esc(p.panel)}<br>Inverter: ${esc(p.inverter)}<br>Engineer: ${esc(p.engineer) || '—'}<br>Start: ${esc(p.start) || '—'} · Completion: ${esc(p.end) || '—'}<br>${esc(p.notes)}</p></div>
      <div class="card"><h3>Payments ${canW('payments') ? '<button class="btn sm" id="ap" style="float:right">+ Payment</button>' : ''}</h3><p>Value <b>${inr(p.cost)}</b> · Received <b>${inr(paid)}</b> · Balance <b class="${p.cost - paid > 0 ? 'over' : ''}">${inr(p.cost - paid)}</b></p>
      ${p.payments.map(x => `<div class="act">${inr(x.amount)} ${x.mode ? '· ' + esc(x.mode) : ''} <small>${x.date}${x.note ? ' · ' + esc(x.note) : ''}</small> ${canW('payments') ? `<a href="#" data-dp="${x.id}"><i class="i i-x"></i></a>` : ''}</div>`).join('') || '<p class="mut">No payments recorded</p>'}</div></div>
      <div style="margin-top:12px">${noteBox('projects', id, p.notes_log)}</div>`;
    if (t === 'subsidy') body = `<div class="card"><h3>PM Surya Ghar subsidy</h3><div class="two">
      <div><label>Application no.</label><input id="sa" value="${esc(p.application_no)}" ${w ? '' : 'disabled'}></div><div><label>Status</label><select id="ss" ${w ? '' : 'disabled'}>${SUB_STATUS.map(s => `<option ${p.subsidy_status === s || (!p.subsidy_status && s === 'Not applied') ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div><label>Subsidy amount (₹) — estimate for ${p.kw} kW: ${inr(subsidyCalc(p.kw))}</label><input id="sm" type="number" value="${p.subsidy_amount || ''}" ${w ? '' : 'disabled'}></div>${w ? '<div style="align-self:end"><button class="btn" id="ssv">Save subsidy details</button></div>' : ''}</div></div>
      <div class="card" style="margin-top:12px"><h3>Subsidy steps</h3>${checklistHtml('subsidy', p.checklist_subsidy, p.files, wc)}</div>`;
    if (t === 'kseb') body = `<div class="card"><h3>KSEB documentation</h3>${checklistHtml('kseb', p.checklist_kseb, p.files, wc)}</div>`;
    if (t === 'files') body = `<div class="card"><h3>All files ${canW('files') ? '<button class="btn sm" id="up" style="float:right">Upload</button>' : ''}</h3>${p.files.map(f => `<div class="act">${fileLink(f)}${f.item ? '<br><small>' + esc(f.kind) + ': ' + esc(f.item) + '</small>' : ''} ${canW('files') ? `<a href="#" data-df="${f.id}"><i class="i i-x"></i></a>` : ''}</div>`).join('') || '<p class="mut">No files</p>'}</div>`;
    $('#pb').innerHTML = tabsBar('proj', tabs, 'overview') + body; bindTabs('proj', draw); bindPB();
  };
  const bindPB = () => {
    if ($('#ap')) $('#ap').onclick = () => { const m = modal(`<h3 style="margin-top:0">Record payment</h3><div class="two">${[{ k: 'amount', l: 'Amount (₹)', t: 'number' }, { k: 'date', l: 'Date', t: 'date', d: today() }, { k: 'mode', l: 'Mode', opts: ['Bank transfer', 'UPI', 'Cash', 'Cheque'] }, { k: 'note', l: 'Note' }].map(f => fld(f)).join('')}</div><div class="bar" style="margin-top:12px"><button class="btn" id="sv">Save</button><button class="btn sec" id="cx">Cancel</button></div>`); $('#cx', m).onclick = () => m.remove(); $('#sv', m).onclick = async () => { const o = { project_id: id, ...collect(m) }; if (!(+o.amount > 0)) return alert('Enter an amount'); await api('payments', 'save', o); m.remove(); route(); }; };
    $$('[data-dp]').forEach(a => a.onclick = async e => { e.preventDefault(); if (confirm('Delete this payment?')) { await api('payments', 'delete', { id: +a.dataset.dp }); route(); } });
    $$('[data-df]').forEach(a => a.onclick = async e => { e.preventDefault(); if (confirm('Delete this file?')) { await api('files', 'delete', { id: +a.dataset.df }); route(); } });
    if ($('#up')) $('#up').onclick = async () => { if (await upload({ project_id: id, kind: 'general' })) route(); };
    if ($('#ssv')) $('#ssv').onclick = async () => { await api('projects', 'save', { ...p, application_no: $('#sa').value, subsidy_status: $('#ss').value, subsidy_amount: $('#sm').value }); route(); };
    bindChecklist(id, p); bindNote('projects', id, route);
  };
  $('#main').innerHTML = `<p><a href="#/projects">← Projects</a> · <a href="#/customers/${p.customer_id}">${esc(p.customer?.name || '')}</a></p>
   <div class="card"><div class="bar" style="margin:0"><h2 style="margin:0;margin-right:auto">${esc(p.title)} <span class="mut" style="font-size:14px">${p.kw} kW</span></h2>
   ${w ? `<select id="stg" style="max-width:170px">${S.project_stages.map(s => `<option ${p.stage === s ? 'selected' : ''}>${s}</option>`).join('')}</select><button class="btn sec" id="ed">Edit</button><button class="btn bad" id="dl">Delete</button>` : pill(p.stage)}</div></div><div id="pb" style="margin-top:12px"></div>`;
  if ($('#stg')) $('#stg').onchange = async e => { await api('projects', 'save', { ...p, stage: e.target.value }); route(); };
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
  }).join('');
}
function bindChecklist(pid, p) {
  $$('.chk').forEach(row => {
    const items = row.dataset.kind === 'kseb' ? p.checklist_kseb : p.checklist_subsidy, it = items[row.dataset.n];
    const save = async () => { const o = { project_id: pid, kind: row.dataset.kind, item: it.item }; $$('[data-f]', row).forEach(e => o[e.dataset.f] = e.value); if (o.status !== 'Pending' && !o.date) o.date = today(); await api('checklist', 'save', o); route(); };
    $$('select[data-f],input[type=date]', row).forEach(e => e.onchange = save); const nt = $('input[data-f=notes]', row); if (nt) nt.onchange = save;
    const up = $('[data-up]', row); if (up) up.onclick = async () => { if (await upload({ project_id: pid, kind: row.dataset.kind, item: it.item })) route(); };
  });
}
