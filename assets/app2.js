// Solarize CRM - quotations, subsidy/KSEB overview, WhatsApp, Meta Ads, settings, admin

// ---------- Quotations ----------
async function pgQuotes() {
  const [qs, cs, ls] = await Promise.all([list('quotes'), list('customers'), list('leads')]);
  const nm = q => (cs.find(c => c.id === q.customer_id) || ls.find(l => l.id === q.lead_id) || {}).name || '—';
  $('#main').innerHTML = `<div class="bar"><span class="sp"></span>${canW('quotes') ? '<button class="btn" id="qn">+ New quotation</button>' : ''}</div>` +
    table([['No.', q => `<b>${esc(q.number)}</b>`], ['For', q => esc(nm(q))], ['Date', q => q.date], ['Total (incl. GST)', q => inr(q.total)], ['Status', q => pill(q.status, stageCls(q.status === 'Accepted' ? 'Approved' : q.status === 'Rejected' ? 'Lost' : q.status === 'Sent' ? 'Submitted' : ''))]], qs, id => location.hash = '#/quotes/' + id);
  if ($('#qn')) $('#qn').onclick = () => { sessionStorage.removeItem('lead2quote'); location.hash = '#/quotes/new'; };
}
async function pgQuote(id) {
  const [cs, ls] = await Promise.all([list('customers'), list('leads')]);
  let q = { items: [], gst_rate: S.gst_rate, subsidy: 0, terms: S.company.terms, status: 'Draft', date: today(), customer_id: '', lead_id: '', number: '' };
  if (id === 'new') {
    const pre = JSON.parse(sessionStorage.lead2quote || 'null'); sessionStorage.removeItem('lead2quote');
    if (pre) { q.customer_id = pre.customer_id || ''; q.lead_id = pre.lead_id || ''; }
    q.items = S.catalog.map(c => ({ desc: c.desc.trim(), qty: 1, rate: c.rate }));
  } else q = await api('quotes', 'get', undefined, '&id=' + id);
  const w = canW('quotes');
  $('#main').innerHTML = `<p><a href="#/quotes">← Quotations</a></p><div class="card">
   <h2 style="margin-top:0">${q.number ? 'Quotation ' + esc(q.number) : 'New quotation'}</h2>
   <div class="two"><div><label>Customer</label><select id="qc"><option value="">— none —</option>${cs.map(c => `<option value="${c.id}" ${q.customer_id == c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
   <div><label>…or Lead (if not yet a customer)</label><select id="ql"><option value="">— none —</option>${ls.filter(l => !l.customer_id || l.id == q.lead_id).map(l => `<option value="${l.id}" ${q.lead_id == l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
   <div><label>Date</label><input id="qd" type="date" value="${esc(q.date)}"></div><div><label>Status</label><select id="qst">${['Draft', 'Sent', 'Accepted', 'Rejected'].map(s => `<option ${q.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div>
   <h3 style="margin-top:16px">Items</h3><div class="tw"><table class="qtbl" data-nofit="1"><thead><tr><th>Description</th><th style="width:80px">Qty</th><th style="width:130px">Rate (₹)</th><th style="width:130px" class="right">Amount</th><th></th></tr></thead><tbody id="qi"></tbody></table></div>
   <div class="bar" style="margin-top:8px"><button class="btn sec sm" id="ai">+ Add line</button><select id="cat" style="max-width:260px"><option value="">+ From catalog…</option>${S.catalog.map((c, i) => `<option value="${i}">${esc(c.desc.trim())}</option>`).join('')}</select></div>
   <div class="two"><div><label>GST %</label><input id="qg" type="number" step="any" value="${q.gst_rate}"></div><div><label>PM Surya Ghar subsidy (₹) <a href="#" id="est">estimate</a></label><input id="qsub" type="number" value="${q.subsidy || 0}"></div></div>
   <div id="qt" style="text-align:right;margin:12px 0;line-height:1.8"></div>
   <label>Terms</label><textarea id="qterms" rows="6">${esc(q.terms)}</textarea>
   <div class="bar" style="margin-top:14px">${w ? '<button class="btn" id="sv">Save</button>' : ''}${q.id ? '<button class="btn sec" id="pr">Print / PDF</button><button class="btn ok" id="wa">WhatsApp</button>' : ''}${q.id && w && q.status === 'Accepted' && q.customer_id ? '<button class="btn sec" id="mp">Create project</button>' : ''}<span class="sp"></span>${q.id && w ? '<button class="btn bad" id="dl">Delete</button>' : ''}</div></div>`;
  let items = (q.items || []).map(i => ({ ...i }));
  const calc = () => { const sub = items.reduce((a, i) => a + (+i.qty || 0) * (+i.rate || 0), 0), g = sub * (+$('#qg').value || 0) / 100, tot = sub + g, s = +$('#qsub').value || 0; return { sub, g, tot, s, eff: tot - s }; };
  const drawTotals = () => { const c = calc(); $('#qt').innerHTML = `Subtotal ${inr(c.sub)}<br>GST ${inr(c.g)}<br><b style="font-size:18px">Total ${inr(c.tot)}</b><br><span class="mut">Less subsidy (credited to your bank by govt.) ${inr(c.s)}</span><br><b>Effective cost ${inr(c.eff)}</b>`; };
  const drawItems = () => {
    $('#qi').innerHTML = items.map((i, n) => `<tr><td><input data-n="${n}" data-f="desc" value="${esc(i.desc)}"></td><td><input data-n="${n}" data-f="qty" type="number" step="any" value="${i.qty}"></td><td><input data-n="${n}" data-f="rate" type="number" step="any" value="${i.rate}"></td><td class="right">${inr(i.qty * i.rate)}</td><td><a href="#" data-x="${n}"><i class="i i-x"></i></a></td></tr>`).join('');
    $$('#qi input').forEach(e => e.oninput = () => { items[e.dataset.n][e.dataset.f] = e.dataset.f === 'desc' ? e.value : +e.value; e.closest('tr').children[3].textContent = inr(items[e.dataset.n].qty * items[e.dataset.n].rate); drawTotals(); });
    $$('#qi [data-x]').forEach(a => a.onclick = e => { e.preventDefault(); items.splice(+a.dataset.x, 1); drawItems(); });
    drawTotals();
  };
  drawItems(); $('#qg').oninput = $('#qsub').oninput = drawTotals;
  $('#ai').onclick = () => { items.push({ desc: '', qty: 1, rate: 0 }); drawItems(); };
  $('#cat').onchange = e => { if (e.target.value !== '') { const c = S.catalog[e.target.value]; items.push({ desc: c.desc.trim(), qty: 1, rate: c.rate }); drawItems(); } };
  $('#est').onclick = e => { e.preventDefault(); const kw = prompt('System size in kW?'); if (kw) { $('#qsub').value = subsidyCalc(kw); drawTotals(); } };
  const payload = () => ({ id: q.id, customer_id: $('#qc').value, lead_id: $('#ql').value, date: $('#qd').value, status: $('#qst').value, gst_rate: $('#qg').value, subsidy: $('#qsub').value, terms: $('#qterms').value, items, number: q.number || '' });
  if ($('#sv')) $('#sv').onclick = async () => { const p = payload(); if (!p.customer_id && !p.lead_id) return alert('Select a customer or a lead'); const r = await api('quotes', 'save', p); if (q.id) route(); else location.hash = '#/quotes/' + r.id; };
  const who = () => cs.find(c => c.id == $('#qc').value) || ls.find(l => l.id == $('#ql').value) || {};
  if ($('#pr')) $('#pr').onclick = () => printQuote(q, payload(), who(), calc());
  if ($('#wa')) $('#wa').onclick = () => { const c = who(); waOpen({ name: c.name, phone: c.phone, customer_id: +$('#qc').value || null, lead_id: +$('#ql').value || null, amount: Math.round(calc().tot).toLocaleString('en-IN'), quote_no: q.number }); };
  if ($('#mp')) $('#mp').onclick = () => { projectModal(0, { customer_id: q.customer_id, title: '3 kW rooftop solar', cost: Math.round(calc().tot), stage: 'Approval' }); };
  if ($('#dl')) $('#dl').onclick = async () => { if (confirm('Delete this quotation?')) { await api('quotes', 'delete', { id: q.id }); location.hash = '#/quotes'; } };
}
function printQuote(q, p, who, c) {
  const co = S.company, win = window.open('', '_blank');
  win.document.write(`<!doctype html><title>${esc(q.number || 'Quotation')}</title><style>body{font:14px/1.5 Arial,sans-serif;max-width:800px;margin:20px auto;color:#111}h1{margin:0}table{width:100%;border-collapse:collapse;margin:14px 0}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#f3f3f3}.r{text-align:right}.t{width:280px;margin-left:auto}.t div{display:flex;justify-content:space-between;padding:3px 0}pre{white-space:pre-wrap;font:inherit}</style>
  <div style="display:flex;justify-content:space-between"><div><img src="${location.origin}${location.pathname.replace(/[^/]*$/,"")}assets/logo.png" style="width:80px;height:80px;object-fit:contain"><h1>${esc(co.name)}</h1>${esc(co.address)}<br>${co.gstin ? 'GSTIN: ' + esc(co.gstin) + '<br>' : ''}${esc(co.phone)} ${esc(co.email)}</div><div class="r"><h2 style="margin:0">QUOTATION</h2>No: <b>${esc(q.number || 'DRAFT')}</b><br>Date: ${esc(p.date)}</div></div><hr>
  <p><b>To:</b> ${esc(who.name || '')}<br>${esc(who.address || '')}<br>${esc(who.phone || '')}</p>
  <table><tr><th>#</th><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>${p.items.filter(i => i.desc).map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.desc)}</td><td class="r">${i.qty}</td><td class="r">${inr(i.rate)}</td><td class="r">${inr(i.qty * i.rate)}</td></tr>`).join('')}</table>
  <div class="t"><div><span>Subtotal</span><span>${inr(c.sub)}</span></div><div><span>GST @ ${p.gst_rate}%</span><span>${inr(c.g)}</span></div><div><b>Total</b><b>${inr(c.tot)}</b></div><div><span>Less: PM Surya Ghar subsidy*</span><span>${inr(c.s)}</span></div><div><b>Effective cost</b><b>${inr(c.eff)}</b></div></div>
  <p style="font-size:12px">*Subsidy is credited by the Government directly to the customer's bank account after commissioning.</p><h4>Terms &amp; conditions</h4><pre>${esc(p.terms)}</pre><script>setTimeout(()=>print(),300)<\/script>`);
  win.document.close();
}

// ---------- Subsidy / KSEB overview ----------
async function pgOverview(kind) {
  const rows = await api('checklist', 'list', undefined, '&kind=' + kind);
  $('#main').innerHTML = `<p class="mut">${kind === 'subsidy' ? 'PM Surya Ghar subsidy steps per project. Click a project to update steps.' : 'KSEB / Urjamithra document checklist per project. Click a project to upload and track documents.'}</p>` +
    table([['Customer', p => `<b>${esc(p.customer || '—')}</b><br><small class="mut">${esc(p.title)}</small>`], ['Stage', p => pill(p.stage, stageCls(p.stage))], kind === 'subsidy' ? ['Application / status', p => `${esc(p.application_no) || '—'}<br>${pill(p.subsidy_status || 'Not applied', stageCls(p.subsidy_status))} ${p.subsidy_amount ? inr(p.subsidy_amount) : ''}`] : ['kW', p => p.kw],
      ['Progress', p => `<div class="prog"><i style="width:${p.total ? p.approved / p.total * 100 : 0}%"></i></div><small>${p.approved}/${p.total} done${p.submitted ? ' · ' + p.submitted + ' submitted' : ''}</small>`]], rows, id => { TAB.proj = kind; location.hash = '#/projects/' + id; });
}

// ---------- WhatsApp ----------
async function pgWhatsapp() {
  const [cs, ls, rec] = await Promise.all([list('customers'), list('leads'), api('whatsapp', 'recent')]);
  const contacts = cs.map(c => ({ ...c, type: 'customer' })).concat(ls.filter(l => !l.customer_id && l.can_edit).map(l => ({ ...l, type: 'lead' })));
  let q = '';
  const draw = () => { const t = q.toLowerCase(); $('#wc').innerHTML = table([['Name', c => `<b>${esc(c.name)}</b>`], ['Type', c => pill(c.type, c.type === 'lead' ? 'b' : 'g')], ['Phone', c => esc(c.phone)], ['', c => c.phone ? `<button class="btn ok sm" data-w="${c.type}|${c.id}">Message</button>` : '']],
    contacts.filter(c => !t || (c.name + ' ' + c.phone).toLowerCase().includes(t)).slice(0, 80), () => { }); $$('[data-w]').forEach(b => b.onclick = () => { const [ty, id] = b.dataset.w.split('|'); const c = contacts.find(x => x.type === ty && x.id == id); waOpen({ name: c.name, phone: c.phone, [ty === 'lead' ? 'lead_id' : 'customer_id']: c.id }); }); };
  $('#main').innerHTML = `<div class="grid cols2"><div><div class="bar"><input id="wq" placeholder="Search contact…" style="max-width:none;flex:1"></div><div id="wc"></div></div>
   <div class="card"><h3>Recent messages</h3>${rec.map(m => `<div class="act">${esc(m.text)}<br><small>→ ${esc(m.cname || m.lname || m.phone)} · ${esc(m.user)} · ${m.created}</small></div>`).join('') || '<p class="mut">No messages sent yet. Messages open in WhatsApp (click-to-chat) and are logged here.</p>'}</div></div>`;
  $('#wq').oninput = e => { q = e.target.value; draw(); }; draw();
}

// ---------- Meta Ads ----------
async function pgAds() {
  const rep = await api('ads', 'report'); const w = canW('ads');
  const t = rep.reduce((a, c) => ({ spent: a.spent + c.spent, leads: a.leads + c.crm_leads, won: a.won + c.won, rev: a.rev + c.revenue }), { spent: 0, leads: 0, won: 0, rev: 0 });
  $('#main').innerHTML = `<div id="metasync" style="margin-bottom:14px"></div><div class="grid stats"><div class="card stat"><b>${inr(t.spent)}</b><span>Total ad spend</span></div><div class="card stat"><b>${t.leads}</b><span>Leads from ads (in CRM)</span></div><div class="card stat"><b>${t.leads ? inr(t.spent / t.leads) : '—'}</b><span>Cost per lead</span></div>
   <div class="card stat"><b>${t.won}</b><span>Customers won</span></div><div class="card stat"><b>${t.won ? inr(t.spent / t.won) : '—'}</b><span>Cost per sale</span></div><div class="card stat"><b>${t.spent ? (t.rev / t.spent).toFixed(1) + '×' : '—'}</b><span>Revenue / spend</span></div></div>
   <div class="bar" style="margin-top:14px"><span class="sp"></span>${w ? '<button class="btn sec" id="im">Import Meta CSV</button> <button class="btn" id="nc">+ Campaign</button>' : ''}</div>
   ${table([['Campaign', c => `<b>${esc(c.name)}</b><br><small class="mut">${esc(c.platform)} · ${esc(c.objective)}</small>`], ['Status', c => pill(c.status || 'Active', c.status === 'Paused' ? 'y' : 'g')], ['Spend', c => inr(c.spent)], ['Reach / clicks', c => `${c.impressions || 0} / ${c.clicks || 0}`], ['CRM leads', c => c.crm_leads], ['CPL', c => c.crm_leads ? inr(c.spent / c.crm_leads) : '—'], ['Won', c => c.won], ['Cost / sale', c => c.won ? inr(c.spent / c.won) : '—'], ['Revenue', c => inr(c.revenue)]], rep, id => campModal(rep.find(c => c.id == id)))}
   <p class="mut">Tag each lead with its campaign (Leads → edit → Meta campaign). To import: export a report from Meta Ads Manager as CSV with columns <code>campaign, date, spend, impressions, clicks</code>.</p>`;
  renderMetaCard();
  if ($('#nc')) $('#nc').onclick = () => campModal({});
  if ($('#im')) $('#im').onclick = async () => { const f = await pickFile('.csv'); if (!f) return; const rows = csvObjs(await f.text()).map(r => ({ campaign: r.campaign || r['campaign name'], date: r.date || r['day'] || r['reporting starts'], spend: (r.spend || r['amount spent (inr)'] || '0').replace(/[^\d.]/g, ''), impressions: (r.impressions || '0').replace(/[^\d.]/g, ''), clicks: (r.clicks || r['link clicks'] || '0').replace(/[^\d.]/g, '') })); const r = await api('ads', 'import', { rows }); alert(`Imported ${r.imported} rows (${r.campaigns_created} new campaigns)`); route(); };
}
function campModal(c) {
  const id = c.id, w = canW('ads');
  const F = [{ k: 'name', l: 'Campaign name', full: 1 }, { k: 'platform', l: 'Platform', opts: ['Meta', 'Instagram', 'Google', 'Other'] }, { k: 'status', l: 'Status', opts: ['Active', 'Paused', 'Ended'] }, { k: 'objective', l: 'Objective', d: 'Leads' }, { k: 'budget', l: 'Budget (₹)', t: 'number' }, { k: 'start', l: 'Start', t: 'date' }, { k: 'end', l: 'End', t: 'date' }];
  const m = modal(`<h2 style="margin-top:0">${id ? 'Campaign' : 'New campaign'}</h2><div class="two">${F.map(f => fld(f, c)).join('')}</div>
   <div class="bar" style="margin-top:14px">${w ? '<button class="btn" id="sv">Save</button>' : ''}${id && w ? '<button class="btn sec" id="sp">+ Spend entry</button>' : ''}<button class="btn sec" id="cx">Close</button><span class="sp"></span>${id && w ? '<button class="btn bad" id="dl">Delete</button>' : ''}</div>`);
  $('#cx', m).onclick = () => m.remove();
  if (w) $('#sv', m).onclick = async () => { const o = { id, ...collect(m) }; if (!o.name) return alert('Name required'); await api('campaigns', 'save', o); m.remove(); route(); };
  if ($('#sp', m)) $('#sp', m).onclick = () => { m.remove(); const s = modal(`<h3 style="margin-top:0">Spend entry — ${esc(c.name)}</h3><div class="two">${[{ k: 'date', l: 'Date', t: 'date', d: today() }, { k: 'spend', l: 'Spend (₹)', t: 'number' }, { k: 'impressions', l: 'Impressions', t: 'number' }, { k: 'clicks', l: 'Clicks', t: 'number' }].map(f => fld(f)).join('')}</div><div class="bar" style="margin-top:12px"><button class="btn" id="ok">Save</button><button class="btn sec" id="x">Cancel</button></div>`); $('#x', s).onclick = () => s.remove(); $('#ok', s).onclick = async () => { await api('ad_spend', 'save', { campaign_id: id, ...collect(s) }); s.remove(); route(); }; };
  if ($('#dl', m)) $('#dl', m).onclick = async () => { if (confirm('Delete campaign and its spend entries?')) { await api('campaigns', 'delete', { id }); m.remove(); route(); } };
}

// ---------- Settings ----------
async function pgSettings() {
  const adm = ME.role === 'admin';
  const lines = k => (S[k] || []).join('\n');
  const co = S.company, r = S.subsidy_rates;
  $('#main').innerHTML = `${adm ? '' : '<p class="mut">View only — only an administrator can change settings.</p>'}<div class="grid cols2">
   <div class="card"><h3>Company (used on quotations)</h3><div class="two">${[{ k: 'name', l: 'Company name', full: 1 }, { k: 'gstin', l: 'GSTIN' }, { k: 'quote_prefix', l: 'Quote number prefix' }, { k: 'phone', l: 'Phone' }, { k: 'email', l: 'Email' }, { k: 'address', l: 'Address', full: 1 }, { k: 'terms', l: 'Default quotation terms', t: 'textarea', rows: 6, full: 1 }].map(f => fld(f, co)).join('')}</div><div id="co"></div>${adm ? '<button class="btn" id="s-co" style="margin-top:10px">Save company</button>' : ''}</div>
   <div class="card"><h3>Login page</h3><p class="mut" style="margin:0 0 8px;font-size:12px">Background image for the sign-in screen (JPG, PNG or WebP, up to 6 MB). A wide, landscape photo works best.</p>
    <div id="lgprev" style="height:150px;border-radius:12px;border:1px solid var(--bd);background:var(--fill) center/cover no-repeat;display:grid;place-items:center;color:var(--mut);font-size:13px;overflow:hidden">Loading…</div>
    ${adm ? '<div class="bar" style="margin:10px 0 0"><button class="btn" id="lgup">Upload image</button><button class="btn sec" id="lgrm">Remove</button></div>' : ''}
    <div class="two"><div><label>Tagline under the logo</label><input id="lgtag" value="${esc((S.login || {}).tagline || '')}" ${adm ? '' : 'disabled'}></div><div><label>Image darkness (0–80%)</label><input id="lgdim" type="number" min="0" max="80" value="${(S.login || {}).dim ?? 35}" ${adm ? '' : 'disabled'}></div></div>
    ${adm ? '<button class="btn" id="lgsv" style="margin-top:10px">Save login text</button>' : ''}</div>
   ${adm ? '<div class="card full2" id="uacc"></div>' : ''}${adm ? '<div class="card" id="hrset"></div><div class="card full2" id="holset"></div>' : ''}
   <div class="card"><h3>Rates</h3><div class="two"><div><label>Default GST %</label><input id="s-gst" type="number" step="any" value="${S.gst_rate}"></div><div><label>Yearly lead target</label><input id="s-tgt" type="number" value="${S.lead_target}"></div><div><label>Subsidy per kW (first 2 kW) ₹</label><input id="s-r1" type="number" value="${r.per_kw_first2}"></div><div><label>3rd kW subsidy ₹</label><input id="s-r2" type="number" value="${r.third_kw}"></div><div><label>Subsidy cap ₹</label><input id="s-r3" type="number" value="${r.cap}"></div></div>${adm ? '<button class="btn" id="s-rates" style="margin-top:10px">Save rates</button>' : ''}</div>
   ${[['lead_sources', 'Lead sources', 'one per line'], ['ds_categories', 'Datasheet categories (Folder)', 'one per line. Existing files keep their old category name if you rename one'], ['lead_statuses', 'Lead statuses', 'one per line, in order. Keep "Won" and "Lost"'], ['project_stages', 'Project stages', 'one per line, in order. Keep "Closed"'], ['subsidy_steps', 'Subsidy steps (PM Surya Ghar)', 'one per line'], ['kseb_items', 'KSEB documentation checklist', 'one per line']].map(([k, l, h]) => `<div class="card"><h3>${l}</h3><p class="mut" style="margin:0 0 6px;font-size:12px">${h}</p><textarea id="s-${k}" rows="8" ${adm ? '' : 'disabled'}>${esc(lines(k))}</textarea>${adm ? `<button class="btn" data-sl="${k}" style="margin-top:8px">Save</button>` : ''}</div>`).join('')}
   <div class="card"><h3>Quotation item catalog</h3><p class="mut" style="margin:0 0 6px;font-size:12px">one per line: description | rate</p><textarea id="s-catalog" rows="8" ${adm ? '' : 'disabled'}>${esc(S.catalog.map(c => c.desc.trim() + ' | ' + c.rate).join('\n'))}</textarea>${adm ? '<button class="btn" id="s-cat" style="margin-top:8px">Save</button>' : ''}</div>
   <div class="card"><h3>WhatsApp templates</h3><p class="mut" style="margin:0 0 6px;font-size:12px">one per line: name :: message. Placeholders: {name} {company} {amount} {quote_no} {date}</p><textarea id="s-wa" rows="8" ${adm ? '' : 'disabled'}>${esc(S.wa_templates.map(t => t.name + ' :: ' + t.text).join('\n'))}</textarea>${adm ? '<button class="btn" id="s-wab" style="margin-top:8px">Save</button>' : ''}</div></div>`;
  const save = async (key, value) => { await api('settings', 'save', { key, value }); S = await api('settings', 'get'); alert('Saved'); };
  const arr = k => $('#s-' + k).value.split('\n').map(s => s.trim()).filter(Boolean);
  const brand = await (await fetch('api.php?m=auth&a=status')).json().then(j => j.brand || {});
  const prev = b => { const p = $('#lgprev'); if (b.bg) { p.style.backgroundImage = "url('" + b.bg + "')"; p.textContent = ''; } else { p.style.backgroundImage = ''; p.textContent = 'No image — default background'; } };
  prev(brand);
  if (adm) {
    $('#lgup').onclick = async () => { const f = await pickFile('image/jpeg,image/png,image/webp'); if (!f) return; const fd = new FormData(); fd.append('file', f); const r = await api('settings', 'upload_bg', fd); prev(r.brand); };
    $('#lgrm').onclick = async () => { if (confirm('Remove the login background image?')) { const r = await api('settings', 'remove_bg', {}); prev(r.brand); } };
    $('#lgsv').onclick = () => save('login', { ...(S.login || {}), tagline: $('#lgtag').value, dim: Math.max(0, Math.min(80, +$('#lgdim').value || 0)) });
  }
  if (adm) { drawAccess(); drawHrSettings(); }
  if (adm) {
    $('#s-co').onclick = () => save('company', collect($('.card'))); // first card
    $('#s-rates').onclick = async () => { await save('gst_rate', +$('#s-gst').value); await save('lead_target', +$('#s-tgt').value || 1000); await save('subsidy_rates', { per_kw_first2: +$('#s-r1').value, third_kw: +$('#s-r2').value, cap: +$('#s-r3').value }); };
    $$('[data-sl]').forEach(b => b.onclick = () => save(b.dataset.sl, arr(b.dataset.sl)));
    $('#s-cat').onclick = () => save('catalog', arr('catalog').map(l => { const [d, r] = l.split('|'); return { desc: d.trim(), rate: +(r || 0) }; }));
    $('#s-wab').onclick = () => save('wa_templates', arr('wa').map(l => { const [n, ...t] = l.split('::'); return { name: n.trim(), text: t.join('::').trim() }; }));
  }
}

// ---------- Admin ----------
async function pgAdmin() {
  const t = TAB.adm || 'users';
  $('#main').innerHTML = tabsBar('adm', [['users', 'Users & roles'], ['audit', 'Audit log'], ['system', 'System & backup']], 'users') + '<div id="ab"></div>';
  bindTabs('adm', pgAdmin);
  const ab = $('#ab');
  if (t === 'users') {
    const us = await api('admin', 'users');
    ab.innerHTML = `<div class="bar"><span class="sp"></span><button class="btn" id="nu">+ New user</button></div>` +
      table([['Name', u => `<span class="uav">${avImg(u.id, u.avatar, u.name)}</span><b>${esc(u.name)}</b>`], ['Username', u => esc(u.username)], ['Role', u => pill((S.role_names || {})[u.role] || u.role, u.role === 'admin' ? 'y' : u.role === 'assistant_manager' ? 'p' : 'b')], ['Active', u => u.active ? pill('Yes', 'g') : pill('Disabled', 'r')], ['Leads access', u => u.role === 'admin' ? pill('All leads', 'b') : u.can_claim ? pill('Can see & claim', 'g') : pill('Own leads only')], ['Claimed leads', u => u.leads || 0], ['Email', u => +u.mails ? `${u.mails} address${+u.mails === 1 ? '' : 'es'}` : '<span class="mut">—</span>'], ['Created', u => dt(u.created)]], us, id => userModal(us.find(u => u.id == id))) +
      `<div class="card" style="margin-top:12px"><h3>Role permissions</h3><p class="mut" style="margin:0">Choose what each role can view and edit in <a href="#/settings">Settings → User access</a>. Admin always has full access.</p></div>`;
    $('#nu').onclick = () => userModal({});
  }
  if (t === 'audit') {
    const log = await api('admin', 'audit');
    ab.innerHTML = table([['When', l => l.created], ['User', l => esc(l.user)], ['Action', l => esc(l.action)], ['Entity', l => esc(l.entity) + (l.entity_id ? ' #' + l.entity_id : '')], ['Detail', l => esc(l.detail)]], log, () => { });
  }
  if (t === 'system') {
    const [st, bk] = await Promise.all([api('admin', 'stats'), api('reset', 'backups')]);
    ab.innerHTML = `<div class="grid stats">${Object.entries(st).map(([k, v]) => `<div class="card stat"><b>${v}</b><span>${k.replace('_', ' ')}</span></div>`).join('')}</div>
     <div class="grid cols2" style="margin-top:12px">
      <div class="card"><h3>Backup</h3><p class="mut">Download a full copy of the database (customers, projects, users, settings). Uploaded files are stored separately in the server's data/uploads folder.</p><a class="btn" href="api.php?m=admin&a=backup"><i class="i i-download"></i> Download database backup</a>
       <h3 style="margin-top:18px">Saved backups</h3>${bk.map(b => `<div class="act"><a href="api.php?m=reset&a=backup_get&name=${encodeURIComponent(b.name)}"><i class="i i-download"></i> ${esc(b.name)}</a> <small>${b.time} · ${Math.round(b.size / 1024)} KB</small></div>`).join('') || '<p class="mut" style="font-size:13px">None yet. A backup is saved automatically before every reset.</p>'}</div>
      <div class="card danger"><h3>Total reset</h3><p style="margin:0 0 8px">Start fresh: deletes all customers, projects, quotations, payments, receipts & files, KSEB/subsidy checklists, AMC & service records, calendar events, notes and WhatsApp history.</p>
       <p class="mut" style="font-size:13px;margin:0 0 12px"><b>Always kept:</b> all leads, Meta Ads connection & sync, campaigns & ad spend, and your admin login. A full backup is saved first.</p>
       <button class="btn bad" id="rst"><i class="i i-alert"></i> Total reset…</button></div></div>`;
    $('#rst').onclick = resetModal;
  }
}
function resetModal() {
  const opt = (k, t, d, on) => `<label class="ropt"><input type="checkbox" data-o="${k}" ${on ? 'checked' : ''}><span><b>${t}</b><small>${d}</small></span></label>`;
  const m = modal(`<h2 style="margin-top:0;color:var(--bad)">Total reset</h2>
   <div class="rbox"><b>Will be deleted</b><span>Customers · Projects & pipeline history · Quotations · Payments · Receipts & uploaded files · KSEB & subsidy checklists · AMC & service records · Calendar events · Notes · WhatsApp message log</span></div>
   <div class="rbox keep"><b>Always kept</b><span>All leads (and their claims) · Meta Ads connection, sync & campaigns · Your admin login</span></div>
   <h3 style="margin:16px 0 6px">Also delete (optional)</h3>
   ${opt('audit', 'Audit log', 'Clear the history of who did what', true)}${opt('datasheets', 'Folder datasheets', 'Product datasheets and their share links', false)}${opt('settings', 'Settings', 'Company details, rates, catalogue, templates, login page — back to defaults', false)}${opt('users', 'Other user accounts', 'Remove every login except yours; their lead claims are released', false)}
   <div class="two" style="margin-top:12px"><div><label>Your admin password</label><input type="password" id="rpw" autocomplete="current-password"></div><div><label>Type <b>RESET</b> to confirm</label><input id="rcf" autocomplete="off" placeholder="RESET"></div></div>
   <div class="err" id="rer"></div>
   <div class="bar" style="margin-top:8px"><button class="btn bad" id="rgo" disabled>Delete everything listed</button><button class="btn sec" id="rcx">Cancel</button></div>`);
  const ok = () => $('#rgo', m).disabled = !($('#rcf', m).value === 'RESET' && $('#rpw', m).value.length >= 1);
  $('#rcf', m).oninput = ok; $('#rpw', m).oninput = ok;
  $('#rcx', m).onclick = () => m.remove();
  $('#rgo', m).onclick = async () => {
    const opts = Object.fromEntries($$('[data-o]', m).map(c => [c.dataset.o, c.checked ? 1 : 0]));
    $('#rgo', m).disabled = true; $('#rgo', m).textContent = 'Resetting…';
    const r = await fetch('api.php?m=reset&a=reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#rpw', m).value, confirm: $('#rcf', m).value, opts }) }).then(x => x.json()).catch(() => ({ error: 'Network error' }));
    if (r.error) { $('#rer', m).textContent = r.error; $('#rgo', m).textContent = 'Delete everything listed'; ok(); return; }
    m.remove(); S = await api('settings', 'get');
    modal(`<h2 style="margin-top:0">Reset complete</h2><p>The CRM has been reset. <b>${r.leads_kept}</b> leads were kept.</p><p class="mut">A full backup of everything before the reset was saved as <b>${esc(r.backup)}</b>.</p>
      <div class="bar"><a class="btn sec" href="api.php?m=reset&a=backup_get&name=${encodeURIComponent(r.backup)}"><i class="i i-download"></i> Download backup</a><button class="btn" onclick="this.closest('.modal').remove();location.hash='#/dashboard';route()">Done</button></div>`);
  };
}
function userModal(u) {
  const id = u.id;
  const m = modal(`<h3 style="margin-top:0">${id ? 'Edit' : 'New'} user</h3><div class="two">${[{ k: 'name', l: 'Full name' }, { k: 'username', l: 'Username' }, { k: 'role', l: 'Role', opts: Object.entries(S.role_names || {}).map(([k, v]) => [k, v]) }, { k: 'active', l: 'Active', opts: [['1', 'Yes'], ['0', 'Disabled']], d: '1' }, { k: 'can_claim', l: 'Leads access', opts: [['1', 'Can see & claim unclaimed leads'], ['0', 'Only leads assigned to them']] }, { k: 'password', l: id ? 'New password (leave blank to keep)' : 'Password (min 8)', t: 'password', full: 1 }].map(f => fld(f, { ...u, active: u.active === 0 ? '0' : '1', can_claim: u.can_claim === 0 ? '0' : (u.can_claim ? '1' : '0') })).join('')}</div>
   ${id ? `<div class="udp"><span class="uav big" id="udpi">${avImg(id, u.avatar, u.name)}</span><div><b>Profile photo</b><div class="bar" style="margin:6px 0 0"><button class="btn sec sm" id="udpu" type="button">Upload photo</button><button class="btn sec sm" id="udpr" type="button" ${u.avatar ? '' : 'hidden'}>Remove</button></div></div></div>
     <div class="mbxadm"><b>Email addresses</b><small class="mut">Addresses ${id == ME.id ? 'you' : 'this person'} connected in the CRM. You never see their mail here.</small><div id="umbx"><p class="mut" style="font-size:13px;margin:6px 0 0">Loading…</p></div></div>` : ''}
   <div class="bar" style="margin-top:12px"><button class="btn" id="sv">Save</button><button class="btn sec" id="cx">Cancel</button></div>`);
  $('#cx', m).onclick = () => m.remove();
  const dpDone = av => { u.avatar = av; $('#udpi', m).innerHTML = avImg(id, av, u.name); $('#udpr', m).hidden = !av; if (id == ME.id) setMyAvatar(av); };
  if ($('#udpu', m)) { $('#udpu', m).onclick = () => pickAvatar(id, u.name, dpDone); $('#udpr', m).onclick = () => removeAvatar(id, dpDone); }
  // their email addresses: take one over (e.g. they left — you have the password anyway) or disconnect it
  const mbx = async () => { const box = $('#umbx', m); if (!box) return; let L; try { L = await api('mail', 'admin_list', undefined, '&user_id=' + id); } catch (e) { box.innerHTML = ''; return; }
    box.innerHTML = L.map(x => `<div class="mbxrow"><i class="i i-${x.problem ? 'alert' : 'mail'}"></i><span class="mbxmi">${esc(x.email)}${x.problem ? ' <small class="mbxn bad">password needed</small>' : ''}</span>
      ${id != ME.id ? `<button class="btn sec sm" type="button" data-mv="${x.id}">Move to my email</button>` : ''}<button class="btn sec sm" type="button" data-rmx="${x.id}">Disconnect</button></div>`).join('') || '<p class="mut" style="font-size:13px;margin:6px 0 0">None connected.</p>';
    $$('[data-mv]', box).forEach(b => b.onclick = async () => { const x = L.find(y => y.id == b.dataset.mv); if (!confirm(`Move ${x.email} into your own Email list?\n\nYou can then read and answer its mail. ${u.name} no longer sees it in the CRM.`)) return; await api('mail', 'admin_move', { id: x.id }); toast(x.email + ' is now in your Email list'); EM.cfg = null; mbx(); });
    $$('[data-rmx]', box).forEach(b => b.onclick = async () => { const x = L.find(y => y.id == b.dataset.rmx); if (!confirm(`Disconnect ${x.email} from ${id == ME.id ? 'your' : u.name + '’s'} CRM login?\n\nThe CRM forgets its saved password. The mail stays with the email provider.`)) return; await api('mail', 'admin_remove', { id: x.id }); toast(x.email + ' disconnected'); if (id == ME.id) EM.cfg = null; mbx(); }); };
  if (id) mbx();
  $('#sv', m).onclick = async () => { const o = { id, ...collect(m) }; o.active = o.active === '1' ? 1 : 0; o.can_claim = o.can_claim === '1' ? 1 : 0; await api('admin', 'user_save', o); m.remove(); route(); };
}

// ---------- Settings → User access (role × module matrix) ----------
const MOD_LABELS = { email: 'Email — each person’s own mailboxes (Edit = send, move, delete)', fees: 'Finance — feasibility, registration, stamp paper', recycle: 'Recycle bin (Edit = restore)', dashboard: 'Dashboard', calendar: 'Calendar', attendance: 'Attendance (Edit = manage team)', leaves: 'Leaves (Edit = approve team)', leads: 'Leads', customers: 'Customers', projects: 'Project pipeline', checklist: 'Subsidy & KSEB checklists', files: 'Files & documents', folder: 'Folder (datasheets)', whatsapp: 'WhatsApp', quotes: 'Quotations', payments: 'Payments', ads: 'Meta Ads & ad spend', finance: 'Finance figures (values, balances, costs)', settings: 'Settings (view)' };
const FIN_MODS = ['quotes', 'payments', 'ads', 'finance'];
function drawAccess() {
  const box = $('#uacc'); if (!box) return;
  const roles = Object.keys(S.role_names).filter(r => r !== 'admin'), now = JSON.parse(JSON.stringify(S.roles_now));
  const render = () => {
    box.innerHTML = `<div class="ch"><h3>User access</h3><span class="mut" style="font-size:12px">Tick what each role can <b>view</b> and <b>edit</b>. Admin always has full access. Changes apply on the user's next page load.</span></div>
     <div class="tw"><table class="acc"><thead><tr><th>Area</th>${roles.map(r => `<th>${esc(S.role_names[r])}<small><a href="#" data-allr="${r}">all</a> · <a href="#" data-nofin="${r}">no finance</a> · <a href="#" data-def="${r}">default</a></small></th>`).join('')}</tr></thead><tbody>
     ${S.modules.map(mod => `<tr class="${FIN_MODS.includes(mod) ? 'finrow' : ''}"><td><b>${MOD_LABELS[mod] || mod}</b>${FIN_MODS.includes(mod) ? ' <span class="pill y">finance</span>' : ''}</td>${roles.map(r => { const rd = now[r].read.includes(mod), wt = now[r].write.includes(mod);
       return `<td><label class="ck"><input type="checkbox" data-r="${r}" data-m="${mod}" data-k="read" ${rd ? 'checked' : ''}> View</label>${mod === 'finance' || mod === 'dashboard' || mod === 'settings' ? '' : `<label class="ck"><input type="checkbox" data-r="${r}" data-m="${mod}" data-k="write" ${wt ? 'checked' : ''}> Edit</label>`}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
     <div class="bar" style="margin-top:12px"><button class="btn" id="uasv">Save user access</button><button class="btn sec" id="uars">Reset all to defaults</button></div>`;
    $$('input[data-r]', box).forEach(c => c.onchange = () => { const r = now[c.dataset.r], m = c.dataset.m, k = c.dataset.k, set = new Set(r[k]);
      c.checked ? set.add(m) : set.delete(m); r[k] = [...set];
      if (k === 'write' && c.checked && !r.read.includes(m)) r.read.push(m);          // edit needs view
      if (k === 'read' && !c.checked) r.write = r.write.filter(x => x !== m);           // no view → no edit
      render(); });
    $$('[data-allr]', box).forEach(x => x.onclick = e => { e.preventDefault(); const r = x.dataset.allr; now[r] = { read: [...S.modules], write: S.modules.filter(m => !['finance', 'dashboard', 'settings'].includes(m)) }; render(); });
    $$('[data-nofin]', box).forEach(x => x.onclick = e => { e.preventDefault(); const r = x.dataset.nofin; now[r].read = now[r].read.filter(m => !FIN_MODS.includes(m)); now[r].write = now[r].write.filter(m => !FIN_MODS.includes(m)); render(); });
    $$('[data-def]', box).forEach(x => x.onclick = e => { e.preventDefault(); const r = x.dataset.def; now[r] = JSON.parse(JSON.stringify(S.role_defaults[r])); render(); });
    $('#uasv', box).onclick = async () => { await api('settings', 'save', { key: 'role_perms', value: now }); S = await api('settings', 'get'); toast('User access saved'); drawAccess(); };
    $('#uars', box).onclick = async () => { if (!confirm('Reset every role to its default access?')) return; await api('settings', 'save', { key: 'role_perms', value: {} }); S = await api('settings', 'get'); toast('Defaults restored'); drawAccess(); };
  };
  render();
}
