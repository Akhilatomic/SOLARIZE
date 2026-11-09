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
  ['dashboard', 'Dashboard', '📊', 'dashboard'], ['leads', 'Leads', '🎯', 'leads'], ['customers', 'Customers', '👥', 'customers'],
  ['projects', 'Project pipeline', '🏗️', 'projects'], ['quotes', 'Quotations', '🧾', 'quotes'],
  ['subsidy', 'Subsidy (PM Surya Ghar)', '💰', 'checklist'], ['kseb', 'KSEB documentation', '📁', 'checklist'],
  ['whatsapp', 'WhatsApp', '💬', 'whatsapp'], ['ads', 'Meta Ads', '📣', 'ads'], ['settings', 'Settings', '⚙️', 'settings'], ['admin', 'Admin panel', '🛡️', 'admin']];
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
  if (!s.auth) return loginView(s.setup);
  ME = s.user; S = await api('settings', 'get');
  shell(); route();
}
function loginView(setup) {
  app.innerHTML = `<div class="card login"><h2 style="margin-top:0">☀️ Solarize <span style="color:var(--pri)">CRM</span></h2>
  <p class="mut">${setup ? 'First run: create the administrator account.' : 'Sign in to continue.'}</p>
  ${setup ? '<label>Your name</label><input id="nm">' : ''}<label>Username</label><input id="un" autocomplete="username"><label>Password${setup ? ' (min 8)' : ''}</label><input id="pw" type="password" autocomplete="current-password">
  <div class="err" id="e"></div><button class="btn" style="width:100%" id="go">${setup ? 'Create admin' : 'Sign in'}</button></div>`;
  const go = async () => { try { await api('auth', setup ? 'setup' : 'login', { name: $('#nm')?.value, username: $('#un').value, password: $('#pw').value }); boot(); } catch (j) { $('#e').textContent = j.error || 'Failed'; } };
  $('#go').onclick = go; $('#pw').onkeydown = e => e.key === 'Enter' && go();
}
function shell() {
  const items = MODS.filter(m => m[0] === 'admin' ? ME.role === 'admin' : canR(m[3]));
  app.innerHTML = `<div id="shell"><aside id="side"><h1>☀️ Solarize <span>CRM</span></h1>
   ${items.map(m => `${m[0] === 'subsidy' ? '<div class="sep">Compliance</div>' : m[0] === 'whatsapp' ? '<div class="sep">Marketing</div>' : m[0] === 'settings' ? '<div class="sep">System</div>' : ''}<a href="#/${m[0]}" data-m="${m[0]}">${m[2]} ${m[1]}</a>`).join('')}
   </aside><div class="content"><div class="top"><button class="btn sec burger" id="bg">☰</button><h2 id="title"></h2><span class="mut" style="font-size:13px">${esc(ME.name)} · ${ME.role}</span>
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
  const d = await api('dashboard', 'get'); // any action: handled by module
  $('#main').innerHTML = `<div class="grid stats">
   ${[['Leads this month', d.leads_month], ['Won this month', d.won_month], ['Lead conversion', d.conversion + '%'], ['Active pipeline', inr(d.pipeline)], ['Billed', inr(d.billed)], ['Received', inr(d.paid)], ['Outstanding', inr(d.outstanding)], ['Ad spend (month)', inr(d.spend_month)], ['Cost per lead', inr(d.cpl)]].map(([l, v]) => `<div class="card stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
   <div class="grid cols2" style="margin-top:12px">
   <div class="card"><h3>Follow-ups due (${d.followups.length})</h3>${d.followups.map(f => `<div class="act"><a href="#/leads"><b>${esc(f.name)}</b></a> <span class="${f.followup < today() ? 'over' : ''}">${f.followup}</span><br><small>${esc(f.phone)} · ${f.status}</small></div>`).join('') || '<p class="mut">Nothing due 🎉</p>'}</div>
   <div class="card"><h3>Payments pending</h3>${d.dues.map(p => `<div class="act"><a href="#/projects/${p.id}"><b>${esc(p.customer || p.title)}</b></a> <b class="over">${inr(p.due)}</b><br><small>${esc(p.title)}</small></div>`).join('') || '<p class="mut">All clear</p>'}</div>
   <div class="card"><h3>Projects by stage</h3>${bars(d.stages.map(s => [s.stage, s.n]), S.project_stages)}</div>
   <div class="card"><h3>Leads by status</h3>${bars(d.lead_status.map(s => [s.status, s.n]), S.lead_statuses)}</div>
   <div class="card"><h3>KSEB documents pending (${d.kseb_pending.length})</h3>${d.kseb_pending.map(p => `<div class="act"><a href="#/projects/${p.id}"><b>${esc(p.title)}</b></a> ${p.done}/${p.total} done</div>`).join('') || '<p class="mut">All documents complete</p>'}</div>
   <div class="card"><h3>Subsidy in progress (${d.subsidy_open.length})</h3>${d.subsidy_open.map(p => `<div class="act"><a href="#/projects/${p.id}"><b>${esc(p.title)}</b></a> ${pill(p.subsidy_status || 'Not applied', stageCls(p.subsidy_status))} ${p.subsidy_amount ? inr(p.subsidy_amount) : ''}</div>`).join('') || '<p class="mut">None</p>'}</div>
   </div>`;
}
function bars(data, order) {
  const m = Object.fromEntries(data), max = Math.max(1, ...data.map(d => d[1]));
  const keys = (order || []).filter(k => m[k] !== undefined).concat(data.map(d => d[0]).filter(k => !(order || []).includes(k)));
  return keys.map(k => `<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><span style="width:100px;font-size:13px">${esc(k)}</span><div class="prog" style="flex:1"><i style="width:${m[k] / max * 100}%;background:var(--pri)"></i></div><b>${m[k]}</b></div>`).join('') || '<p class="mut">No data</p>';
}

// ---------- Leads ----------
let LF = { q: '', status: '', source: '' };
async function pgLeads() {
  const [leads, camps, users] = await Promise.all([list('leads'), canR('ads') ? list('campaigns') : [], []]);
  CACHE.leads = leads; CACHE.camps = camps;
  const draw = () => {
    const t = LF.q.toLowerCase(), rows = leads.filter(l => (!LF.status || l.status === LF.status) && (!LF.source || l.source === LF.source) && (!t || [l.name, l.phone, l.address].join(' ').toLowerCase().includes(t)));
    $('#lt').innerHTML = table([['Name', l => `<b>${esc(l.name)}</b><br><small class="mut">${esc((l.address || '').slice(0, 40))}</small>`], ['Phone', l => esc(l.phone)], ['Source', l => esc(l.source)], ['kW', l => l.kw || ''],
      ['Status', l => pill(l.status, stageCls(l.status))], ['Follow-up', l => `<span class="${l.followup && l.followup < today() && !['Won', 'Lost'].includes(l.status) ? 'over' : ''}">${esc(l.followup)}</span>`]], rows, id => leadModal(+id));
  };
  $('#main').innerHTML = `<div class="bar"><input id="lq" placeholder="Search leads…" value="${esc(LF.q)}"><select id="ls"><option value="">All statuses</option>${S.lead_statuses.map(s => `<option ${LF.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
   <select id="lsrc"><option value="">All sources</option>${S.lead_sources.map(s => `<option ${LF.source === s ? 'selected' : ''}>${s}</option>`).join('')}</select><span class="sp"></span>
   ${canW('leads') ? '<button class="btn sec" id="lim">Import CSV</button> ' : ''}<button class="btn sec" id="lex">Export CSV</button>${canW('leads') ? ' <button class="btn" id="lnew">+ New lead</button>' : ''}</div><div id="lt"></div>`;
  $('#lq').oninput = e => { LF.q = e.target.value; draw(); }; $('#ls').onchange = e => { LF.status = e.target.value; draw(); }; $('#lsrc').onchange = e => { LF.source = e.target.value; draw(); };
  $('#lex').onclick = () => csvDownload('leads-' + today() + '.csv', ['name', 'phone', 'email', 'address', 'source', 'status', 'kw', 'budget', 'followup', 'notes'], leads);
  if ($('#lnew')) $('#lnew').onclick = () => leadModal(0);
  if ($('#lim')) $('#lim').onclick = async () => { const f = await pickFile('.csv'); if (!f) return; const rows = csvObjs(await f.text()); let n = 0; for (const r of rows) { if (!r.name) continue; await api('leads', 'save', { ...r, status: r.status || 'New' }); n++; } alert('Imported ' + n + ' leads'); route(); };
  draw();
}
async function leadModal(id) {
  const l = id ? await api('leads', 'get', undefined, '&id=' + id) : { status: 'New', source: S.lead_sources[0], followup: '' };
  const F = [{ k: 'name', l: 'Name' }, { k: 'phone', l: 'Phone', t: 'tel' }, { k: 'email', l: 'Email' }, { k: 'source', l: 'Source', opts: S.lead_sources }, { k: 'address', l: 'Address / location', full: 1 },
    { k: 'status', l: 'Status', opts: S.lead_statuses }, { k: 'followup', l: 'Next follow-up', t: 'date' }, { k: 'kw', l: 'Interested kW', t: 'number' }, { k: 'budget', l: 'Budget (₹)', t: 'number' }];
  if ((CACHE.camps || []).length) F.splice(4, 0, { k: 'campaign_id', l: 'Meta campaign', opts: opt(CACHE.camps.map(c => [c.id, c.name]), '— none —') });
  const w = canW('leads');
  const m = modal(`<h2 style="margin-top:0">${id ? 'Lead' : 'New lead'}</h2><div class="two">${F.map(f => fld(f, l)).join('')}</div><label>Notes</label><textarea data-k="notes" rows="2">${esc(l.notes || '')}</textarea>
   <div class="bar" style="margin-top:14px">${w ? '<button class="btn" id="sv">Save</button>' : ''}<button class="btn sec" id="cx">Close</button>
   ${id && l.phone ? '<button class="btn ok" id="wa">WhatsApp</button><a class="btn sec" href="tel:' + esc(l.phone) + '">Call</a>' : ''}
   ${id && w && !l.customer_id ? '<button class="btn sec" id="cv">Convert to customer</button>' : ''}${l.customer_id ? `<a class="btn sec" href="#/customers/${l.customer_id}" onclick="">Open customer</a>` : ''}
   ${id && canW('quotes') ? '<button class="btn sec" id="qt">Create quotation</button>' : ''}<span class="sp"></span>${id && w ? '<button class="btn bad" id="dl">Delete</button>' : ''}</div>
   ${id ? noteBox('leads', id, l.notes_log) + `<div class="card" style="margin-top:10px"><h3>Messages sent</h3>${(l.messages || []).map(x => `<div class="act">${esc(x.text)}<br><small>${esc(x.user)} · ${x.created}</small></div>`).join('') || '<p class="mut">None</p>'}</div>` : ''}`);
  $('#cx', m).onclick = () => m.remove();
  if (w) $('#sv', m).onclick = async () => { const o = { id, ...collect(m) }; if (!o.name) return alert('Name required'); await api('leads', 'save', o); m.remove(); route(); };
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
      ${p.payments.map(x => `<div class="act">${inr(x.amount)} ${x.mode ? '· ' + esc(x.mode) : ''} <small>${x.date}${x.note ? ' · ' + esc(x.note) : ''}</small> ${canW('payments') ? `<a href="#" data-dp="${x.id}">✕</a>` : ''}</div>`).join('') || '<p class="mut">No payments recorded</p>'}</div></div>
      <div style="margin-top:12px">${noteBox('projects', id, p.notes_log)}</div>`;
    if (t === 'subsidy') body = `<div class="card"><h3>PM Surya Ghar subsidy</h3><div class="two">
      <div><label>Application no.</label><input id="sa" value="${esc(p.application_no)}" ${w ? '' : 'disabled'}></div><div><label>Status</label><select id="ss" ${w ? '' : 'disabled'}>${SUB_STATUS.map(s => `<option ${p.subsidy_status === s || (!p.subsidy_status && s === 'Not applied') ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div><label>Subsidy amount (₹) — estimate for ${p.kw} kW: ${inr(subsidyCalc(p.kw))}</label><input id="sm" type="number" value="${p.subsidy_amount || ''}" ${w ? '' : 'disabled'}></div>${w ? '<div style="align-self:end"><button class="btn" id="ssv">Save subsidy details</button></div>' : ''}</div></div>
      <div class="card" style="margin-top:12px"><h3>Subsidy steps</h3>${checklistHtml('subsidy', p.checklist_subsidy, p.files, wc)}</div>`;
    if (t === 'kseb') body = `<div class="card"><h3>KSEB documentation</h3>${checklistHtml('kseb', p.checklist_kseb, p.files, wc)}</div>`;
    if (t === 'files') body = `<div class="card"><h3>All files ${canW('files') ? '<button class="btn sm" id="up" style="float:right">Upload</button>' : ''}</h3>${p.files.map(f => `<div class="act">${fileLink(f)}${f.item ? '<br><small>' + esc(f.kind) + ': ' + esc(f.item) + '</small>' : ''} ${canW('files') ? `<a href="#" data-df="${f.id}">✕</a>` : ''}</div>`).join('') || '<p class="mut">No files</p>'}</div>`;
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
     ${canW('files') ? `<button class="btn sec sm" data-up="${kind}|${n}">📎 Upload</button>` : '<span></span>'}</div>`;
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
