// Solarize CRM - quotations, subsidy/KSEB overview, WhatsApp, Meta Ads, settings, admin

// ---------- Quotations ----------
async function pgQuotes() {
  const [qs, cs, ls] = await Promise.all([list('quotes'), list('customers'), list('leads')]);
  const nm = q => (cs.find(c => c.id === q.customer_id) || ls.find(l => l.id === q.lead_id) || {}).name || '—', w = canW('quotes');
  $('#main').innerHTML = `<div class="bar"><span class="sp"></span>${canW('quotes') ? '<button class="btn" id="qn">+ New quotation</button>' : ''}</div>` +
    table([['No.', q => `<b>${esc(q.number)}</b>`], ['For', q => esc(nm(q))], ['Date', q => dmy(q.date) || esc(q.date)], ['Total (incl. GST)', q => inr(q.total), 'num'], ['Status', q => pill(q.status, stageCls(q.status === 'Accepted' ? 'Approved' : q.status === 'Rejected' ? 'Lost' : q.status === 'Sent' ? 'Submitted' : ''))],
      ['Actions', q => { const b = (a, ic, t, c = '') => `<button type="button" class="ib${c}" data-qa="${a}" data-id="${q.id}" title="${t}" aria-label="${t} ${esc(q.number)}"><i class="i i-${ic}"></i></button>`;
        return `<span class="qla">${b('wa', 'whatsapp', 'Share on WhatsApp')}${w ? b('edit', 'pencil', 'Edit') + b('st', 'tag', 'Change status') + b('del', 'trash', 'Delete', ' qla-del') : b('edit', 'eye', 'View')}</span>`; }, 'qla-c']], qs, id => location.hash = '#/quotes/' + id);
  if ($('#qn')) $('#qn').onclick = () => { sessionStorage.removeItem('lead2quote'); location.hash = '#/quotes/new'; };
  const nav = ROUTE_N, redraw = () => { if (nav === ROUTE_N && location.hash.replace(/\/$/, '') === '#/quotes') pgQuotes(); };
  $$('#main [data-qa]').forEach(b => b.onclick = async e => { e.stopPropagation(); const q = qs.find(x => x.id == b.dataset.id), a = b.dataset.qa; if (!q) return;
    if (a === 'edit') { location.hash = '#/quotes/' + q.id; return; }
    if (a === 'st') return popMenu(b, ['Draft', 'Sent', 'Accepted', 'Rejected'].map(s => [s, s === q.status ? 'check' : 'tag', s]), async s => {
      if (s === q.status) return; await api('qm', 'status', { id: q.id, status: s }); toast(`${q.number} · ${s}`); redraw(); });
    if (a === 'del') { if (!confirm(`Delete quotation ${q.number}?\n\nIt goes to the Recycle bin.`)) return;
      b.disabled = true; try { await api('quotes', 'delete', { id: q.id }); toast('Deleted · ' + q.number); redraw(); } finally { b.disabled = false; } return; }
    const who = cs.find(c => c.id === q.customer_id) || ls.find(l => l.id === q.lead_id) || {};
    b.disabled = true; try { await qmShareQuote(q.id, { name: who.name, phone: who.phone }); } catch (x) { } finally { b.disabled = false; } });
}
// New quotations and quotations made with the quotation maker open in the maker (app22.js); older ones keep this simple editor.
async function pgQuote(id) {
  if (id === 'new') return pgQuoteMaker(null);
  const nav = ROUTE_N; /* left this page while loading: do not paint over the new one */
  const q = await api('quotes', 'get', undefined, '&id=' + id);
  if (nav !== ROUTE_N) return;
  if (q.doc) return pgQuoteMaker(id, q);
  const [cs, ls] = await Promise.all([list('customers'), list('leads')]);
  if (nav !== ROUTE_N) return;
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
// box: where the table goes (the KSEB documentation page shows it in its Checklist tab)
async function pgOverview(kind, box = $('#main')) {
  const rows = await api('checklist', 'list', undefined, '&kind=' + kind);
  box.innerHTML = `<p class="mut">${kind === 'subsidy' ? 'PM Surya Ghar subsidy steps per project. Click a project to update steps.' : 'KSEB / Urjamithra document checklist per project. Click a project to upload and track documents.'}</p>` +
    table([['Customer', p => `<b>${esc(p.customer || '—')}</b><br><small class="mut">${esc(p.title)}</small>`], ['Stage', p => pill(p.stage, stageCls(p.stage))], kind === 'subsidy' ? ['Application / status', p => `${esc(p.application_no) || '—'}<br>${pill(p.subsidy_status || 'Not applied', stageCls(p.subsidy_status))} ${p.subsidy_amount ? inr(p.subsidy_amount) : ''}`] : ['kW', p => p.kw, 'num'],
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
   ${table([['Campaign', c => `<b>${esc(c.name)}</b><br><small class="mut">${esc(c.platform)} · ${esc(c.objective)}</small>`], ['Status', c => pill(c.status || 'Active', c.status === 'Paused' ? 'y' : 'g')], ['Spend', c => inr(c.spent), 'num'], ['Reach / clicks', c => `${c.impressions || 0} / ${c.clicks || 0}`], ['CRM leads', c => c.crm_leads, 'num'], ['CPL', c => c.crm_leads ? inr(c.spent / c.crm_leads) : '—', 'num'], ['Won', c => c.won, 'num'], ['Cost / sale', c => c.won ? inr(c.spent / c.won) : '—', 'num'], ['Revenue', c => inr(c.revenue), 'num']], rep, id => campModal(rep.find(c => c.id == id)))}
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
/* One section at a time: a list of sections on the left (a strip of tabs on phones) with a "Find a setting" box, and the chosen section on the right.
   Every pane is built once and only hidden, so typed values survive a switch; panes that need their own request load when first opened.
   #/settings/<section> opens a section directly. */
const STG_TABS = [ /* id, name, icon, group (a gap separates groups), what is inside, who: 'adm' = admin only, 'acc' = Accounts readers */
  ['company', 'Company', 'building', 0, 'The name, GSTIN and contacts printed on quotations and papers, and the picture on the sign-in screen.'],
  ['rates', 'Rates & targets', 'gauge', 0, 'Default GST, the lead and customer targets on the dashboard, and the PM Surya Ghar subsidy amounts.'],
  ['leads', 'Leads', 'target', 1, 'The choices offered for a lead’s source and status.'],
  ['quotes', 'Quotations', 'receipt', 1, 'Ready-made lines for the “From catalog” menu of a quotation, and the Quotation maker’s products, bank details and wording.'],
  ['whatsapp', 'WhatsApp', 'whatsapp', 1, 'Ready-made messages to pick from when sending a WhatsApp, and the business number.'],
  ['projects', 'Projects', 'project', 2, 'Pipeline stages, subsidy steps and the KSEB documents checklist, in the order they are worked through.'],
  ['docs', 'Documents', 'file', 2, 'The papers asked for on a customer’s Documents page, and the company details printed on KSEB papers.'],
  ['prices', 'Price list', 'tag', 3, 'Material and service costs: dealer price, profit % and the customer price. The same list as Accounts › Price list.', 'acc'],
  ['tpls', 'Material templates', 'clipboard', 3, 'Ready-made item lists with quantities for the Project cost sheet, for example 10 kW SolarEdge on a sheet roof.', 'acc'],
  ['accounts', 'Accounts', 'coin', 3, 'The messages sent with receipts and tax bills, expense categories and the incentive scheme.', 'adm'],
  ['users', 'Users', 'users', 4, 'Everyone who can sign in: their role, whether the login is on and what they hold. Add a person, reset a password, switch a login off or sign someone out.', 'adm'],
  ['access', 'User access', 'lock', 4, 'What each role can view and edit. Admin always has full access. Changes apply the next time the person loads a page.', 'adm'],
  ['hr', 'Attendance & leave', 'clock', 4, 'Office hours, weekly off, leave types and the holiday list.', 'adm'],
  ['rules', 'Rules', 'refresh', 5, 'The numbers the CRM works by: how long documents and deleted items are kept, and when it acts on its own.', 'adm'],
  ['connect', 'Connections', 'link', 5, 'Meta lead ads, the WhatsApp business number and email: whether each is connected, and where it is set up.', 'adm'],
  ['data', 'Data & backup', 'download', 5, 'What the CRM holds, database backups, the audit log and a total reset.', 'adm'],
];
const STG_LISTS = { /* settings key: title, hint, count words, section */
  lead_sources: ['Lead sources', 'One per line.', 'source|sources', 'leads'],
  lead_statuses: ['Lead statuses', 'One per line, in order. Keep “Won” and “Lost”.', 'status|statuses', 'leads'],
  project_stages: ['Project stages', 'One per line, in order. Keep “Project completed” as the last stage.', 'stage|stages', 'projects'],
  subsidy_steps: ['Subsidy steps', 'PM Surya Ghar steps, one per line, in order.', 'step|steps', 'projects'],
  kseb_items: ['KSEB documents checklist', 'One per line.', 'document|documents', 'projects'],
  doc_types: ['Document types', 'One per line. Each is a button on a customer’s Documents page, ticked once that paper is uploaded.', 'type|types', 'docs'],
};
/* what "Find a setting" looks through: section, card id, card title, the settings and current values inside */
function stgIndex() {
  const short = l => String(l).split(' — ')[0].split(' (')[0];
  return [
    ['company', 'cocard', 'Company details', ['Company name', 'GSTIN', 'Quote number prefix', 'Phone', 'Email', 'Address', 'Default quotation terms']],
    ['company', 'stg-login', 'Sign-in screen', ['Login page', 'Background image', 'Tagline under the logo', 'Image darkness']],
    ['rates', 'stg-rates', 'Rates & targets', ['Default GST %', 'Monthly lead target', 'Yearly customer target', 'Subsidy per kW', '3rd kW subsidy', 'Subsidy cap']],
    ...Object.keys(STG_LISTS).map(k => [STG_LISTS[k][3], 'stg-' + k, STG_LISTS[k][0], S[k] || []]),
    ['quotes', 'stg-catalog', 'Item catalog', ['Quotation item catalog', ...(S.catalog || []).map(c => String(c.desc || '').trim())]],
    ['whatsapp', 'stg-wa', 'Message templates', ['WhatsApp templates', 'Placeholders', ...(S.wa_templates || []).map(t => t.name)]],
    ['prices', 'acx_setpl', 'Price list', ['Dealer price', 'Profit %', 'Customer price', 'Materials and services']],
    ['tpls', 'acx_settp', 'Material templates', ['Item lists for the Project cost sheet']],
    ['access', 'uacc', 'User access', ['Role permissions', ...Object.values(S.role_names || {}), ...(S.modules || []).map(m => short(MOD_LABELS[m] || m))]],
    ['hr', 'hrset', 'Working hours & leave', ['Office start time', 'Office end time', 'Grace minutes', 'Half day', 'Full day hours', 'Salary day', 'Weekly off', 'Leave types']],
    ['hr', 'holset', 'Holidays', []],
    ['docs', 'stg-kdef', 'Company details on KSEB papers', ['Vendor name', 'Vendor address', 'Signed by', 'Signatory', 'Designation']],
    ['quotes', 'stg-qm', 'Quotation maker', ['Products and prices', 'Bank details', 'Quotation validity', 'Quotation number format', 'KSEB fees on quotations', 'Loan wording', 'Terms and conditions']],
    ['whatsapp', 'stg-wac', 'Business number', ['WhatsApp connection', 'Webhook', 'Access token']],
    ['accounts', 'stg-actpl', 'Messages for receipts and tax bills', ['Email to the bank', 'Tax bill email', 'Payment reminder']],
    ['accounts', 'stg-accat', 'Expense categories and profit', ['Default profit %']],
    ['accounts', 'stg-inc', 'Incentive scheme', ['Own lead rate', 'Company lead rates', 'Commission']],
    ['users', 'stgusers', 'Users', ['Add a user', 'New user', 'Reset a password', 'Disable a login', 'Sign out everywhere', 'Leads access', 'Profile photo', ...Object.values(S.role_names || {})]],
    ['rules', 'stg-rules', 'Rules', Object.values(S.rule_names || {}).concat(['Document expiry', 'Recycle bin time', 'Auto Lost', 'Lead reminder', 'Feasibility validity'])],
    ['connect', 'stgconn', 'Connections', ['Meta lead ads', 'Facebook page', 'WhatsApp Business', 'Email addresses', 'Mailboxes']],
    ['data', 'stgdata', 'Data & backup', ['Download database backup', 'Saved backups', 'Total reset', 'Audit log', 'Storage']],
  ];
}
/* matches for the typed text: sections first, then cards, then settings that start with it, then the rest (at most 8) */
function stgSearch(idx, text, nameOf) {
  const t = text.trim().toLowerCase(), out = [], seen = new Set(); if (!t) return out;
  const add = (tab, card, label, sub, rank) => { const k = tab + '|' + label.toLowerCase(); if (label && !seen.has(k)) { seen.add(k); out.push({ tab, card, label, sub, rank }); } };
  for (const [tab, name] of Object.entries(nameOf)) if (name.toLowerCase().includes(t)) add(tab, '', name, 'Section', 0);
  for (const [tab, card, title, words] of idx) {
    if (!nameOf[tab]) continue;
    if (title.toLowerCase().includes(t)) add(tab, card, title, nameOf[tab], 1);
    for (const w of words) { const p = String(w).toLowerCase().indexOf(t); if (p >= 0) add(tab, card, String(w), nameOf[tab] === title ? title : nameOf[tab] + ' › ' + title, p === 0 ? 2 : 3); }
  }
  return out.sort((a, b) => a.rank - b.rank).slice(0, 8);
}
function stgFlash(el) { /* show where the found setting lives */
  el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  el.classList.remove('stg-flash'); void el.offsetWidth; el.classList.add('stg-flash'); setTimeout(() => el.classList.remove('stg-flash'), 1900);
}
function stgPanes(adm) {
  const dis = adm ? '' : 'disabled', co = S.company, r = S.subsidy_rates || {}, lg = S.login || {};
  const num = (id, label, val, extra = '') => `<div><label for="${id}">${label}</label><input id="${id}" type="number" ${extra} value="${esc(val ?? '')}" ${dis}></div>`;
  const act = html => adm ? `<div class="stg-act">${html}</div>` : '';
  const link = (id, title, text, btn) => `<div class="card" id="${id}"><h3>${title}</h3><p class="stg-hint">${text}</p><div class="stg-act">${btn}</div></div>`;
  const rn = (k, label) => { const lim = (S.rule_limits || {})[k] || [0, 9999]; return `<div><label for="rl-${k}">${label}</label><input id="rl-${k}" data-rule="${k}" type="number" step="1" min="${lim[0]}" max="${lim[1]}" value="${RULE(k)}" ${dis}><small class="mut stg-lim">from ${lim[0]} to ${lim[1]}</small></div>`; };
  const area = (id, card, title, hint, words, val, btn) => `<div class="card" id="${card}"><div class="stg-ct"><h3>${title}</h3><span class="stg-n" data-cnt="${id}" data-w="${words}"></span></div><p class="stg-hint">${hint}</p>
     <textarea id="${id}" data-fit rows="6" spellcheck="false" ${dis}>${esc(val)}</textarea>${act(btn)}</div>`;
  const list = k => area('s-' + k, 'stg-' + k, STG_LISTS[k][0], STG_LISTS[k][1], STG_LISTS[k][2], (S[k] || []).join('\n'), `<button class="btn" data-sl="${k}">Save ${STG_LISTS[k][0].toLowerCase().replace('kseb', 'KSEB')}</button>`);
  return {
    company: () => `<div class="stg-cards stg-two">
      <div class="card" id="cocard"><h3>Company details</h3><p class="stg-hint">A field left empty takes the company details set in the Quotation maker.</p>
       <div class="two">${[{ k: 'name', l: 'Company name', full: 1 }, { k: 'gstin', l: 'GSTIN' }, { k: 'quote_prefix', l: 'Quote number prefix' }, { k: 'phone', l: 'Phone' }, { k: 'email', l: 'Email' }, { k: 'address', l: 'Address', full: 1 }, { k: 'terms', l: 'Default quotation terms', t: 'textarea', rows: 6, full: 1 }].map(f => fld(f, co)).join('')}</div>
       ${act('<button class="btn" id="s-co">Save company</button>')}</div>
      <div class="card" id="stg-login"><h3>Sign-in screen</h3><p class="stg-hint">Background image for the sign-in screen: JPG, PNG or WebP, up to 6 MB. A wide, landscape photo works best.</p>
       <div id="lgprev" class="stg-prev">Loading…</div>
       ${act('<button class="btn sec" id="lgup"><i class="i i-upload"></i> Upload image</button><button class="btn sec" id="lgrm">Remove image</button>')}
       <div class="two"><div><label for="lgtag">Tagline under the logo</label><input id="lgtag" value="${esc(lg.tagline || '')}" ${dis}></div><div><label for="lgdim">Image darkness (0–80%)</label><input id="lgdim" type="number" min="0" max="80" value="${lg.dim ?? 35}" ${dis}></div></div>
       ${act('<button class="btn" id="lgsv">Save sign-in text</button>')}</div></div>`,
    rates: () => `<div class="stg-cards stg-one"><div class="card" id="stg-rates"><div class="stg-grp">
       <div><h4>Tax</h4>${num('s-gst', 'Default GST %', S.gst_rate, 'step="any"')}</div>
       <div><h4>Dashboard targets</h4>${num('s-tgt', 'Monthly lead target', S.lead_target, 'min="1"')}${num('s-ctgt', 'Yearly customer target', S.customer_target, 'min="1"')}</div>
       <div><h4>PM Surya Ghar subsidy</h4>${num('s-r1', 'Subsidy per kW (first 2 kW) ₹', r.per_kw_first2)}${num('s-r2', '3rd kW subsidy ₹', r.third_kw)}${num('s-r3', 'Subsidy cap ₹', r.cap)}</div></div>
       ${act('<button class="btn" id="s-rates">Save rates and targets</button>')}</div></div>`,
    leads: () => `<div class="stg-cards">${list('lead_sources')}${list('lead_statuses')}</div>`,
    projects: () => `<div class="stg-cards">${list('project_stages')}${list('subsidy_steps')}${list('kseb_items')}</div>`,
    quotes: () => `<div class="stg-cards stg-one">${area('s-catalog', 'stg-catalog', 'Item catalog', 'One per line: description | rate', 'item|items', (S.catalog || []).map(c => String(c.desc || '').trim() + ' | ' + c.rate).join('\n'), '<button class="btn" id="s-cat">Save item catalog</button>')}${adm ? link('stg-qm', 'Quotation maker', 'Products and prices, brand pictures, the company and bank details, validity, numbering, KSEB fees, and the loan and terms wording printed on quotations.', '<button class="btn" id="stgqm" type="button"><i class="i i-gear"></i> Open Quotation maker settings</button>') : ''}</div>`,
    whatsapp: () => `<div class="stg-cards stg-one">${area('s-wa', 'stg-wa', 'Message templates', 'One per line: name :: message. These are filled in when the message is sent: <code>{name}</code> <code>{company}</code> <code>{amount}</code> <code>{quote_no}</code> <code>{date}</code>', 'template|templates', (S.wa_templates || []).map(t => t.name + ' :: ' + t.text).join('\n'), '<button class="btn" id="s-wab">Save message templates</button>')}${adm ? link('stg-wac', 'Business number', 'The WhatsApp Business number, its access token and the webhook are set up on the WhatsApp page.', '<a class="btn sec" href="#/whatsapp">Open WhatsApp setup</a>') : ''}</div>`,
    prices: () => `<section class="acx-setpl"><div id="acx_setpl"><p class="mut">Loading…</p></div></section>`,
    tpls: () => `<section class="acx-setpl"><div id="acx_settp"><p class="mut">Loading…</p></div></section>`,
    access: () => `<div class="card" id="uacc"><p class="mut">Loading…</p></div>`,
    hr: () => `<div class="stg-cards stg-stack"><div class="card" id="hrset"><p class="mut">Loading…</p></div><div class="card" id="holset"></div></div>`,
    docs: () => `<div class="stg-cards">${list('doc_types')}
      <div class="card" id="stg-kdef"><h3>Company details on KSEB papers</h3><p class="stg-hint">Printed on the work completion report and the other KSEB papers of every customer.</p>
       <div class="two">${[{ k: 'vendor_name', l: 'Company name', full: 1 }, { k: 'vendor_address', l: 'Address', full: 1 }, { k: 'vendor_email', l: 'Email' }, { k: 'vendor_phone', l: 'Phone' }, { k: 'sign_name', l: 'Signed by' }, { k: 'sign_designation', l: 'Designation' }, { k: 'sign_phone', l: 'Signatory’s phone' }].map(f => fld(f, S.kseb_defaults || {})).join('')}</div>
       ${act('<button class="btn" id="s-kdef">Save KSEB details</button>')}</div></div>`,
    accounts: () => `<div class="stg-cards">
      ${link('stg-actpl', 'Messages for receipts and tax bills', 'The email to the bank with a payment receipt, the email with the final tax bill, and the WhatsApp payment reminder.', '<button class="btn" id="stgtpl"><i class="i i-mail"></i> Edit the messages</button>')}
      ${link('stg-accat', 'Expense categories and profit', 'Expense categories are kept in Accounts › Expenses. The default profit % is at the top of the Price list.', '<a class="btn sec" href="#/accounts">Open Accounts</a><button class="btn sec" type="button" data-stgo="prices">Open Price list</button>')}
      <div class="card" id="stg-inc"><h3>Incentive scheme</h3><div id="stginc"><p class="mut" style="margin:0;font-size:13px">Loading…</p></div></div></div>`,
    users: () => `<div id="stgusers"><p class="mut">Loading…</p></div>`,
    rules: () => `<div class="stg-cards stg-one"><div class="card" id="stg-rules"><div class="stg-grp">
       <div><h4>Documents</h4>${rn('doc_days', 'Uploaded documents are kept (days)')}${rn('gen_days', 'Papers made in the CRM are kept (days)')}${rn('trash_hours', 'Deleted items stay in the Recycle bin (hours)')}</div>
       <div><h4>New leads</h4>${rn('lead_lost_hours', 'Marked Lost if nobody attends within (hours)')}${rn('lead_remind_min', 'Reminder while leads wait, every (minutes)')}</div>
       <div><h4>KSEB feasibility</h4>${rn('feas_valid_days', 'A feasibility payment is valid for (days)')}${rn('feas_alert_days', 'Warn this many days before it runs out')}</div></div>
       <p class="stg-hint" style="margin:14px 0 0">Tax bills, warranty cards and the approved quotation are always kept until someone deletes them. A new keeping time applies to documents already uploaded; a paper made in the CRM keeps the time it was saved with.</p>
       ${act('<button class="btn" id="s-rules">Save rules</button><button class="btn sec" id="s-rulesd" type="button">Fill in the usual values</button>')}</div></div>`,
    connect: () => `<div class="stg-cards" id="stgconn"><p class="mut">Loading…</p></div>`,
    data: () => `<div id="stgdata"><p class="mut">Loading…</p></div>`,
  };
}
async function pgSettings() {
  const adm = ME.role === 'admin';
  const tabs = STG_TABS.filter(t => t[5] === 'adm' ? adm : t[5] === 'acc' ? canR('accounts') : true), has = id => tabs.some(t => t[0] === id);
  const want = (location.hash.split('/')[2] || '').toLowerCase();
  let cur = has(want) ? want : has(TAB.stg) ? TAB.stg : tabs[0][0];
  const panes = stgPanes(adm), ro = t => t[5] === 'acc' ? !canW('accounts') : !adm, nameOf = Object.fromEntries(tabs.map(t => [t[0], t[1]]));
  $('#main').innerHTML = `<div class="stg">
    <nav class="stg-side" aria-label="Settings sections">
     <div class="stg-find"><i class="i i-search"></i><input id="stgq" type="search" placeholder="Find a setting" autocomplete="off" spellcheck="false" aria-label="Find a setting" aria-controls="stgres"></div>
     <div class="stg-res" id="stgres" role="listbox" aria-label="Matching settings" hidden></div>
     <div class="stg-list" id="stglist" role="tablist" aria-orientation="vertical">${tabs.map((t, i) => `${i && t[3] !== tabs[i - 1][3] ? '<span class="stg-gap" aria-hidden="true"></span>' : ''}<button type="button" class="stg-tab" role="tab" id="stgt-${t[0]}" data-stg="${t[0]}" aria-controls="stgp-${t[0]}"><i class="i i-${t[2]}"></i><span>${t[1]}</span></button>`).join('')}</div>
    </nav>
    <div class="stg-body">${tabs.map(t => `<div class="stg-pane" id="stgp-${t[0]}" role="tabpanel" aria-labelledby="stgt-${t[0]}" hidden>
      <div class="stg-head"><h2>${t[1]}${ro(t) ? '<span class="pill">View only</span>' : ''}</h2><p>${t[4]}${ro(t) && t[5] !== 'acc' ? ' Only an administrator can change these.' : ''}</p></div>${panes[t[0]]()}</div>`).join('')}</div></div>`;

  const q = $('#stgq'), res = $('#stgres'), list = $('#stglist'), loaded = new Set();
  const prev = b => { const p = $('#lgprev'); if (!p) return; if (b.bg) { p.style.backgroundImage = "url('" + b.bg + "')"; p.textContent = ''; } else { p.style.backgroundImage = ''; p.textContent = 'No image — default background'; } };
  const later = (id, fn, what) => { const b = $('#' + id); if (b && typeof fn === 'function') fn(b).catch(e => { if (b.isConnected) b.innerHTML = `<p class="mut">${esc((e && (e.error || e.message)) || what + ' could not be loaded.')}</p>`; }); };
  const LOAD = { /* first time a section is opened */
    company: () => fetch('api.php?m=auth&a=status').then(x => x.json()).then(j => prev(j.brand || {})).catch(() => prev({})),
    prices: () => later('acx_setpl', typeof acMaterials === 'function' && acMaterials, 'The price list'), /* its own permission (accounts), not the admin's */
    tpls: () => later('acx_settp', typeof acTemplates === 'function' && acTemplates, 'The templates'),
    access: () => drawAccess(), hr: () => drawHrSettings(),
    users: () => usersPanel($('#stgusers')), data: () => systemPanel($('#stgdata'), true), connect: () => stgConnect($('#stgconn')), accounts: () => stgIncentive($('#stginc')),
  };
  /* text boxes grow with their lines, so a whole list is in view; the count beside the title follows */
  const fit = ta => { const c = $(`[data-cnt="${ta.id}"]`);
    if (c) { const n = ta.value.split('\n').filter(l => l.trim()).length, w = c.dataset.w.split('|'); c.textContent = n + ' ' + w[n === 1 ? 0 : 1]; }
    if (!ta.offsetParent) return; ta.style.height = 'auto'; ta.style.height = Math.min(620, Math.max(132, ta.scrollHeight + 2)) + 'px'; };
  const show = id => {
    cur = id; TAB.stg = id;
    $$('.stg-tab', list).forEach(b => { const on = b.dataset.stg === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'center' }); });
    $$('.stg-pane').forEach(p => p.hidden = p.id !== 'stgp-' + id);
    const h = $('#title'); if (h) { let s = $('.ttls', h); if (!s) { s = document.createElement('span'); s.className = 'mut ttls'; h.appendChild(s); } s.textContent = '› ' + nameOf[id]; }
    if (location.hash !== '#/settings/' + id) history.replaceState(null, '', '#/settings/' + id);
    if (!loaded.has(id)) { loaded.add(id); if (LOAD[id]) LOAD[id](); }
    $$('#stgp-' + id + ' textarea[data-fit]').forEach(fit); autoFit();
  };
  list.onclick = e => { const b = e.target.closest('.stg-tab'); if (b) show(b.dataset.stg); };
  $('.stg-body').addEventListener('click', e => { const b = e.target.closest('[data-stgo]'); if (b && has(b.dataset.stgo)) { show(b.dataset.stgo); scrollTo({ top: 0 }); } });
  list.onkeydown = e => { const i = tabs.findIndex(t => t[0] === cur), k = e.key; let n;
    if (k === 'ArrowDown' || k === 'ArrowRight') n = (i + 1) % tabs.length; else if (k === 'ArrowUp' || k === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length; else if (k === 'Home') n = 0; else if (k === 'End') n = tabs.length - 1; else return;
    e.preventDefault(); show(tabs[n][0]); $('#stgt-' + tabs[n][0]).focus(); };
  $$('#cocard textarea').forEach(ta => ta.setAttribute('data-fit', '')); /* the quotation terms grow with their lines too */
  $$('textarea[data-fit]').forEach(ta => { fit(ta); ta.addEventListener('input', () => fit(ta)); });
  if (!adm) tabs.filter(t => t[5] !== 'acc').forEach(t => $$('#stgp-' + t[0] + ' :is(input,textarea,select)').forEach(e => e.disabled = true));

  /* Find a setting: the list of sections gives way to the matches; Enter opens the first, arrows move, Esc clears */
  const idx = stgIndex(); let hits = [], hi = 0;
  const drawRes = () => { const t = q.value.trim(); list.hidden = !!t; res.hidden = !t; hits = stgSearch(idx, t, nameOf); if (hi >= hits.length) hi = 0;
    res.innerHTML = !t ? '' : hits.length ? hits.map((h, i) => `<button type="button" class="stg-hit${i === hi ? ' kb' : ''}" role="option" aria-selected="${i === hi}" data-i="${i}"><b>${esc(h.label)}</b><small>${esc(h.sub)}</small></button>`).join('') : `<p class="stg-none">No setting matches “${esc(t)}”.</p>`; };
  const pick = h => { q.value = ''; hi = 0; drawRes(); show(h.tab); const el = h.card && document.getElementById(h.card); if (el) stgFlash(el); else $('#stgt-' + h.tab).focus(); };
  q.oninput = () => { hi = 0; drawRes(); };
  q.onkeydown = e => {
    if (e.key === 'Escape' && q.value) { e.preventDefault(); q.value = ''; drawRes(); return; }
    if (!hits.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); hi = (hi + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length; drawRes(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(hits[hi]); } };
  res.onclick = e => { const b = e.target.closest('.stg-hit'); if (b) pick(hits[+b.dataset.i]); };

  if (adm) {
    const put = (key, value) => api('settings', 'save', { key, value }), done = async msg => { S = await api('settings', 'get'); toast(msg); };
    const arr = k => $('#s-' + k).value.split('\n').map(s => s.trim()).filter(Boolean);
    $('#lgup').onclick = async () => { const f = await pickFile('image/jpeg,image/png,image/webp'); if (!f) return; const fd = new FormData(); fd.append('file', f); const r = await api('settings', 'upload_bg', fd); prev(r.brand); toast('Image uploaded'); };
    $('#lgrm').onclick = async () => { if (confirm('Remove the login background image?')) { const r = await api('settings', 'remove_bg', {}); prev(r.brand); toast('Image removed'); } };
    $('#lgsv').onclick = async () => { await put('login', { ...(S.login || {}), tagline: $('#lgtag').value, dim: Math.max(0, Math.min(80, +$('#lgdim').value || 0)) }); await done('Sign-in text saved'); };
    /* the Company card itself — $('.card') is the hidden bell panel and once saved an empty record */
    $('#s-co').onclick = async () => { await put('company', collect($('#cocard'))); await done('Company details saved'); $$('#cocard [data-k]').forEach(e => e.value = S.company[e.dataset.k] ?? ''); };
    $('#s-rates').onclick = async () => { await put('gst_rate', +$('#s-gst').value); await put('lead_target', +$('#s-tgt').value || 1000); await put('customer_target', +$('#s-ctgt').value || 2000);
      await put('subsidy_rates', { per_kw_first2: +$('#s-r1').value, third_kw: +$('#s-r2').value, cap: +$('#s-r3').value }); await done('Rates and targets saved'); };
    $$('[data-sl]').forEach(b => b.onclick = async () => { await put(b.dataset.sl, arr(b.dataset.sl)); await done(STG_LISTS[b.dataset.sl][0] + ' saved'); });
    $('#s-cat').onclick = async () => { await put('catalog', arr('catalog').map(l => { const [d, r] = l.split('|'); return { desc: d.trim(), rate: +(r || 0) }; })); await done('Item catalog saved'); };
    if ($('#stgqm')) $('#stgqm').onclick = () => qmOpenSettings();
    if ($('#stgtpl')) $('#stgtpl').onclick = () => acTplEditor();
    $('#s-kdef').onclick = async () => { const r = await api('kseb', 'defaults_save', { data: collect($('#stg-kdef')) }); S.kseb_defaults = r.defaults; toast('KSEB details saved'); };
    $('#s-rules').onclick = async () => { const v = {}; $$('[data-rule]').forEach(e => v[e.dataset.rule] = e.value.trim() === '' ? null : +e.value); await put('rules', v); await done('Rules saved'); $$('[data-rule]').forEach(e => e.value = RULE(e.dataset.rule)); };
    $('#s-rulesd').onclick = () => { $$('[data-rule]').forEach(e => e.value = RULE_DEF[e.dataset.rule]); toast('The usual values are filled in. Press Save rules to keep them.'); };
    $('#s-wab').onclick = async () => { await put('wa_templates', arr('wa').map(l => { const [n, ...t] = l.split('::'); return { name: n.trim(), text: t.join('::').trim() }; })); await done('Message templates saved'); };
  }
  show(cur);
}

/* ---------- Settings › Connections: what is linked to the outside, and where each is set up ---------- */
async function stgConnect(box) {
  if (!box) return;
  const get = (m, a) => api(m, a).catch(() => null), [meta, wa, mail] = await Promise.all([get('meta', 'config'), get('wa', 'config'), get('mail', 'config')]);
  if (!box.isConnected) return;
  const st = (ok, yes, no) => `<span class="pill ${ok ? 'g' : ''}">${ok ? yes : no}</span>`, ms = (meta && meta.state) || {}, boxes = (mail && (mail.accounts || mail.boxes || mail.list)) || [];
  const card = (id, title, pillHtml, lines, btn) => `<div class="card" id="${id}"><div class="stg-ct"><h3>${title}</h3><span class="stg-n">${pillHtml}</span></div><p class="stg-hint">${lines.filter(Boolean).join('<br>')}</p><div class="stg-act">${btn}</div></div>`;
  box.innerHTML = card('stg-cmeta', 'Meta lead ads', st(meta && meta.token_set && ms.connected, 'Connected', meta && meta.token_set ? 'Token saved' : 'Not connected'),
      ['New leads from Facebook and Instagram lead forms come into Leads on their own.', meta && meta.page_id ? 'Facebook Page ID ' + esc(meta.page_id) : '', ms.last_error ? `<span class="over">Last sync failed: ${esc(ms.last_error)}</span>` : ''], '<a class="btn sec" href="#/ads">Open Meta Ads setup</a>')
    + card('stg-cwa', 'WhatsApp business number', st(wa && wa.token_set, 'Connected', 'Not connected'),
      ['The shared WhatsApp inbox and message sending.', wa && wa.display ? 'Number ' + esc(wa.display) : '', wa && wa.phone_id ? 'Phone number ID ' + esc(wa.phone_id) : ''], '<a class="btn sec" href="#/whatsapp">Open WhatsApp setup</a>')
    + card('stg-cmail', 'Email', st(boxes.length > 0, boxes.length + (boxes.length === 1 ? ' address' : ' addresses'), 'None connected'),
      ['Each person connects their own email addresses; nobody else sees their mail. Yours are below.', boxes.map(x => esc(x.email || '')).filter(Boolean).join(', '), 'Other people’s addresses are listed in Users, in each person’s window.'], '<a class="btn sec" href="#/email">Open Email</a><button class="btn sec" type="button" data-stgo="users">Open Users</button>');
}
/* Settings › Accounts › Incentive scheme: the rates as the program has them (shown, not changed here) */
function stgIncentive(box) {
  if (!box) return; const m = S.incentive || null;
  const T = (m && m.tiers) || [], own = m && (m.own_rate || m.own_per_kw), rng = (i) => { const a = i ? T[i - 1][0] + 1 : 1, b = T[i][0]; return b == null ? `from project ${a} of the month` : a === b ? `project ${a} of the month` : `projects ${a}–${b} of the month`; };
  box.innerHTML = `<p class="stg-hint">Paid per kW once the admin approves the customer. Business Associates get a commission the admin types in.</p>
    <div class="pcz-rows">${own ? `<div><span>Own lead</span><b>${inr(own)} per kW</b></div>` : '<div><span>Own lead</span><b>A flat rate per kW</b></div>'}
     ${T.map((t, i) => `<div><span>Company lead, ${rng(i)}</span><b>${inr(t[1])} per kW</b></div>`).join('')}</div>
    <p class="stg-hint" style="margin:10px 0 0">These rates are part of the program. Tell me the new figures to change them. Approvals and payments are in <a href="#/comm/incentive">Finance › Incentive</a>.</p>`;
}

/* ---------- Users (Settings › Users and Admin › Users): everyone who can sign in ---------- */
let USF = { q: '', role: '', off: true };
const agoTxt = s => { s = +s || 0; if (!s) return 'Never'; const d = Math.floor(Date.now() / 1000) - s;
  return d < 150 ? 'Online now' : d < 3600 ? Math.round(d / 60) + ' min ago' : d < 86400 ? Math.round(d / 3600) + ' h ago' : d < 86400 * 30 ? Math.round(d / 86400) + ' d ago' : dmy(new Date(s * 1000).toISOString()); };
async function usersPanel(box) {
  if (!box) return;
  let us; try { us = await api('admin', 'users'); } catch (e) { box.innerHTML = '<p class="mut">The users could not be loaded.</p>'; return; }
  if (!box.isConnected) return;
  const rn = S.role_names || {}, on = us.filter(u => +u.active).length, reload = () => usersPanel(box);
  box.innerHTML = `<div class="bar usr-bar"><input id="usq" type="search" placeholder="Search name or username" value="${esc(USF.q)}" autocomplete="off" aria-label="Search users">
     <select id="usrole" aria-label="Role"><option value="">All roles</option>${Object.entries(rn).map(([k, v]) => `<option value="${k}" ${USF.role === k ? 'selected' : ''}>${esc(v)} (${us.filter(u => u.role === k).length})</option>`).join('')}</select>
     <label class="ck"><input type="checkbox" id="usoff" ${USF.off ? 'checked' : ''}> Show disabled logins</label>
     <span class="mut usr-n">${us.length} ${us.length === 1 ? 'person' : 'people'} · ${on} on${us.length - on ? ' · ' + (us.length - on) + ' disabled' : ''}</span><span class="sp"></span>
     <button class="btn" id="usnew"><i class="i i-userplus"></i> New user</button></div><div id="ustb"></div>`;
  const draw = () => {
    const t = USF.q.trim().toLowerCase(), L = us.filter(u => (!USF.role || u.role === USF.role) && (USF.off || +u.active) && (!t || (u.name + ' ' + u.username).toLowerCase().includes(t)));
    $('#ustb', box).innerHTML = table([
      ['Name', u => `<span class="usr-who"><span class="uav" data-pres="${u.id}">${avImg(u.id, u.avatar, u.name)}</span><span><b>${esc(u.name)}</b>${u.id == ME.id ? ' <span class="pill">You</span>' : ''}<small class="mut">${esc(u.username)}</small></span></span>`],
      ['Role', u => pill(rn[u.role] || u.role, u.role === 'admin' ? 'y' : u.role === 'assistant_manager' ? 'p' : 'b')],
      ['Login', u => +u.active ? pill('On', 'g') : pill('Disabled', 'r')],
      ['Leads access', u => u.role === 'admin' ? pill('All leads', 'b') : +u.can_claim ? pill('Can see & claim', 'g') : pill('Own leads only')],
      ['Holds', u => `<span class="usr-h">${+u.leads || 0} lead${+u.leads === 1 ? '' : 's'} · ${+u.customers || 0} customer${+u.customers === 1 ? '' : 's'}${+u.mails ? ` · ${u.mails} email` : ''}</span>`],
      ['Last seen', u => `<span class="usr-h">${esc(agoTxt(u.seen_at))}</span>`],
      ['', u => `<span class="usr-act"><button class="btn sec sm" type="button" data-ue="${u.id}">Edit</button>${u.id == ME.id ? '' : `<button class="btn sec sm" type="button" data-um="${u.id}" title="Sign out or switch the login off" aria-label="More for ${esc(u.name)}"><i class="i i-dots"></i></button>`}</span>`],
    ], L, id => userModal(us.find(u => u.id == id)));
    const by = id => us.find(u => u.id == id);
    $$('[data-ue]', box).forEach(b => b.onclick = () => userModal(by(b.dataset.ue)));
    $$('[data-um]', box).forEach(b => b.onclick = () => { const u = by(b.dataset.um), isOn = +u.active;
      popMenu(b, [isOn && ['out', 'lock', 'Sign out on every device'], ['act', isOn ? 'x' : 'check', isOn ? 'Switch the login off' : 'Switch the login on']], async a => {
        if (a === 'out') { if (!confirm(`Sign ${u.name} out on every device?\n\nThey can sign in again with their password.`)) return;
          try { await api('admin', 'user_signout', { id: u.id }); toast(u.name + ' is signed out everywhere'); } catch (e) { } }
        if (a === 'act') { if (!confirm(isOn ? `Switch off ${u.name}’s login?\n\nThey are signed out at once and cannot sign in until you switch it on again. Their leads and customers stay with them.` : `Switch ${u.name}’s login back on?`)) return;
          try { await api('admin', 'user_active', { id: u.id, active: isOn ? 0 : 1 }); toast(u.name + (isOn ? '’s login is switched off' : '’s login is on again')); reload(); } catch (e) { } }
      }); });
    if (typeof autoFit === 'function') autoFit();
  };
  $('#usq', box).oninput = e => { USF.q = e.target.value; draw(); };
  $('#usrole', box).onchange = e => { USF.role = e.target.value; draw(); };
  $('#usoff', box).onchange = e => { USF.off = e.target.checked; draw(); };
  $('#usnew', box).onclick = () => userModal({});
  draw();
}
/* ---------- System (Settings › Data & backup and Admin › System & backup) ---------- */
async function systemPanel(box, withAudit) {
  if (!box) return;
  let st, bk; try { [st, bk] = await Promise.all([api('admin', 'stats'), api('reset', 'backups')]); } catch (e) { box.innerHTML = '<p class="mut">The system details could not be loaded.</p>'; return; }
  if (!box.isConnected) return;
  box.innerHTML = `<div class="grid stats">${Object.entries(st).map(([k, v]) => `<div class="card stat"><b>${v}</b><span>${k.replace('_', ' ')}</span></div>`).join('')}</div>
     <div class="grid cols2" style="margin-top:12px">
      <div class="card" id="bkcard"><h3>Backup</h3><p class="mut">Download a copy and keep it somewhere safe. The database holds customers, projects, users and settings. With all files the backup also holds every document, Folder file and picture<span id="bkinf"></span>.</p>
       <div class="stg-act" style="margin-top:0"><a class="btn" href="api.php?m=reset&a=backup_zip&files=1"><i class="i i-download"></i> Download database and all files</a><a class="btn sec" href="api.php?m=admin&a=backup"><i class="i i-download"></i> Database only</a></div>
       <h3 style="margin-top:20px">Restore</h3><p class="mut">Bring back documents and Folder files deleted by mistake, or put everything back as it was when a backup was made.</p>
       <button class="btn sec" type="button" id="bkres"><i class="i i-upload"></i> Restore from a backup file…</button>
       <h3 style="margin-top:20px">Saved backups</h3>${bk.map(b => `<div class="act bkr-sv"><a href="api.php?m=reset&a=backup_get&name=${encodeURIComponent(b.name)}"><i class="i i-download"></i> ${esc(b.name)}</a> <small>${b.time} · ${b.size > 1048576 ? (b.size / 1048576).toFixed(1) + ' MB' : Math.round(b.size / 1024) + ' KB'}</small><button class="btn sec sm" type="button" data-bkr="${esc(b.name)}">Restore…</button></div>`).join('') || '<p class="mut" style="font-size:13px">None yet. A copy of the database is saved here before every reset and every full restore.</p>'}</div>
      <div class="card danger"><h3>Total reset</h3><p style="margin:0 0 8px">Start fresh: deletes all customers, projects, quotations, payments, receipts & files, KSEB/subsidy checklists, AMC & service records, calendar events, notes and WhatsApp history.</p>
       <p class="mut" style="font-size:13px;margin:0 0 12px"><b>Always kept:</b> all leads, Meta Ads connection & sync, campaigns & ad spend, and your admin login. A full backup is saved first.</p>
       <button class="btn bad" id="rst"><i class="i i-alert"></i> Total reset…</button></div>
      ${withAudit ? '<div class="card"><h3>Audit log</h3><p class="mut">Who did what in the last 72 hours. Older entries stay on the customer and lead timelines.</p><button class="btn sec" type="button" id="sysaud">Open the audit log</button></div>' : ''}</div>`;
  $('#rst', box).onclick = resetModal;
  $('#bkres', box).onclick = () => bkRestore('', () => systemPanel(box, withAudit));
  $$('[data-bkr]', box).forEach(b => b.onclick = () => bkRestore(b.dataset.bkr, () => systemPanel(box, withAudit)));
  api('reset', 'backup_info').then(i => { const el = $('#bkinf', box); if (el) el.textContent = ` — ${i.files.toLocaleString('en-IN')} file${i.files === 1 ? '' : 's'}, ${bkSize(i.bytes + i.db_bytes)} in all`; box._bkLimit = i.upload_limit; }).catch(() => { });
  if ($('#sysaud', box)) $('#sysaud', box).onclick = () => { TAB.adm = 'audit'; location.hash = '#/admin'; };
}

/* ---------- Restore from a backup (api/backup.php): look at the backup first, then bring back what is missing or put everything back ---------- */
const bkSize = n => n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : n >= 1048576 ? Math.round(n / 1048576) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const bkWhen = s => { const d = s ? new Date(s) : null; return d && !isNaN(d) ? d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'an unknown date'; };
function bkRestore(saved, done) {
  const m = modal('<div id="bkr"></div>', true), box = $('#bkr', m), close = () => m.remove();
  const pickStep = () => {
    box.innerHTML = `<h2 style="margin-top:0">Restore from a backup</h2><p class="mut" style="margin-top:-6px">Choose the backup file downloaded from this page: the <b>.zip</b> (database and files) or the <b>.sqlite</b> (database only). Nothing is changed until you have seen what is in it.</p>
      <div class="onb-file"><button type="button" class="btn" id="bkpick"><i class="i i-upload"></i> Choose the backup file</button><span class="mut" id="bkpn">.zip or .sqlite</span><input type="file" id="bkfile" accept=".zip,.sqlite" hidden></div>
      <p class="mut bkr-note" id="bklim"></p><div class="bar" style="margin-top:14px"><button class="btn sec" id="bkx">Cancel</button></div>`;
    $('#bkx', box).onclick = close; $('#bkpick', box).onclick = () => $('#bkfile', box).click();
    api('reset', 'backup_info').then(i => { const el = $('#bklim', box); if (el) el.textContent = `This server takes a file of up to ${bkSize(i.upload_limit)} in one upload. A larger backup: put it in the data/backups folder with the hosting File Manager, then press Restore beside it under Saved backups.`; }).catch(() => { });
    $('#bkfile', box).onchange = async e => { const f = e.target.files[0]; if (!f) return;
      box.innerHTML = `<h2 style="margin-top:0">Restore from a backup</h2><p class="mut">Reading ${esc(f.name)} (${bkSize(f.size)})…</p>`;
      const fd = new FormData(); fd.append('file', f);
      try { showStep(await api('reset', 'restore_check', fd)); } catch (x) { if (m.isConnected) pickStep(); } };
  };
  const showStep = c => {
    if (!m.isConnected) return;
    const sk = c.docs_skip || {}, nothing = !c.docs && !c.sheets && !c.lost, n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    const notes = [sk.owner ? `${n(sk.owner, 'document belongs', 'documents belong')} to a customer that is no longer in the CRM. Only putting everything back restores ${sk.owner === 1 ? 'it' : 'those'}.` : '',
      sk.replaced ? `${n(sk.replaced, 'paper was', 'papers were')} made again since the backup, so the newer copy is kept.` : '',
      (sk.nofile || (c.sheets_skip || {}).nofile) ? `${n((sk.nofile || 0) + ((c.sheets_skip || {}).nofile || 0), 'file is', 'files are')} listed in this backup but not inside it${c.with_files ? '' : ' (it is a database-only backup)'}.` : ''].filter(Boolean);
    const list = (L, total) => L.length ? `<ul class="bkr-l">${L.slice(0, 8).map(x => `<li><b>${esc(x.name)}</b>${x.owner ? ' · ' + esc(x.owner) : ''}${x.date ? ` <small class="mut">${esc(x.date)}</small>` : ''}</li>`).join('')}${total > 8 ? `<li class="mut">and ${total - 8} more</li>` : ''}</ul>` : '';
    box.innerHTML = `<h2 style="margin-top:0">Restore from a backup</h2>
      <p class="bkr-h"><b>${esc(c.label)}</b><span class="mut">made ${esc(bkWhen(c.made))} · ${c.with_files ? `database and ${c.files.toLocaleString('en-IN')} file${c.files === 1 ? '' : 's'}` : 'database only'}</span></p>
      <div class="bkr-g"><div><h4>What it holds</h4><table class="bkr-t"><thead><tr><th></th><th>In the backup</th><th>In the CRM now</th></tr></thead><tbody>${c.counts.map(([l, a, b]) => `<tr><td>${esc(l)}</td><td>${a}</td><td class="${a !== b ? 'bkr-d' : ''}">${b}</td></tr>`).join('')}</tbody></table></div>
       <div><h4>Missing from the CRM now</h4>${nothing ? '<p class="mut" style="margin:0">Nothing. Every document and Folder file of this backup is still in the CRM.</p>'
         : `<p style="margin:0 0 6px">${[c.docs ? n(c.docs, 'document', 'documents') : '', c.sheets ? n(c.sheets, 'Folder file', 'Folder files') : '', c.lost ? n(c.lost, 'file lost from the server', 'files lost from the server') : ''].filter(Boolean).join(' · ')}</p>${list(c.docs_list || [], c.docs)}${list(c.sheets_list || [], c.sheets)}`}
        ${notes.length ? `<p class="mut bkr-note">${notes.join(' ')}</p>` : ''}
        <div class="stg-act"><button class="btn" id="bkmiss" ${nothing ? 'disabled' : ''}>Bring back what is missing</button></div>
        <p class="mut bkr-note">Puts back only what is missing. Nothing that is in the CRM now is changed.</p></div></div>
      <div class="bkr-full"><h4>Put everything back as in this backup</h4>
       <p class="mut" style="margin:0 0 8px">The whole database goes back to how it was when this backup was made: everything added or changed since is lost, and people may have to sign in again. A copy of the database as it is now is saved first under Saved backups.</p>
       <div class="two"><div><label>Your admin password</label><input type="password" id="bkpw" autocomplete="current-password"></div><div><label>Type <b>RESTORE</b> to confirm</label><input id="bkcf" autocomplete="off" placeholder="RESTORE"></div></div>
       <div class="err" id="bker"></div><div class="stg-act"><button class="btn bad" id="bkfull" disabled>Put everything back</button></div></div>
      <div class="bar" style="margin-top:14px"><button class="btn sec" id="bkx">Close</button></div>`;
    $('#bkx', box).onclick = close;
    const run = async body => { const r = await fetch('api.php?m=reset&a=restore_run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: c.token, ...body }) }).then(x => x.json()).catch(() => ({ error: 'Network error' })); return r; };
    $('#bkmiss', box).onclick = async e => { const b = e.currentTarget; b.disabled = true; b.textContent = 'Bringing back…';
      const r = await run({ mode: 'missing' }); if (r.error) { b.disabled = false; b.textContent = 'Bring back what is missing'; return toast(r.error, true); }
      close(); toast(`Brought back: ${r.docs} document${r.docs === 1 ? '' : 's'}, ${r.sheets} Folder file${r.sheets === 1 ? '' : 's'}, ${r.lost} lost file${r.lost === 1 ? '' : 's'}${r.failed ? ` · ${r.failed} could not be restored` : ''}`); if (done) done(); };
    const ok = () => { $('#bkfull', box).disabled = !($('#bkcf', box).value === 'RESTORE' && $('#bkpw', box).value.length >= 1); };
    $('#bkcf', box).oninput = ok; $('#bkpw', box).oninput = ok;
    $('#bkfull', box).onclick = async e => { const b = e.currentTarget; b.disabled = true; b.textContent = 'Restoring…'; $('#bker', box).textContent = '';
      const r = await run({ mode: 'full', password: $('#bkpw', box).value, confirm: $('#bkcf', box).value });
      if (r.error) { $('#bker', box).textContent = r.error; b.textContent = 'Put everything back'; ok(); return; }
      box.innerHTML = `<h2 style="margin-top:0">Restore complete</h2><p>The CRM is back as it was when the backup was made${r.files ? `, and <b>${r.files}</b> file${r.files === 1 ? ' was' : 's were'} put back on the server` : ''}.</p>
        <p class="mut">The database from just before the restore is saved as <b>${esc(r.backup)}</b> under Saved backups.${r.failed ? ` ${r.failed} file${r.failed === 1 ? '' : 's'} in the backup could not be put back.` : ''}</p>
        <div class="bar"><button class="btn" id="bkgo">Reload the CRM</button></div>`;
      $('#bkgo', box).onclick = () => location.reload(); };
  };
  if (saved) { box.innerHTML = `<h2 style="margin-top:0">Restore from a backup</h2><p class="mut">Reading ${esc(saved)}…</p>`; api('reset', 'restore_check', { name: saved }).then(showStep).catch(close); }
  else pickStep();
}

// ---------- Admin ----------
async function pgAdmin() {
  const t = TAB.adm || 'users';
  $('#main').innerHTML = tabsBar('adm', [['users', 'Users & roles'], ['audit', 'Audit log'], ['system', 'System & backup']], 'users') + '<div id="ab"></div>';
  bindTabs('adm', pgAdmin);
  const ab = $('#ab');
  if (t === 'users') { /* the same panel as Settings › Users */
    ab.innerHTML = `<div id="adusers"><p class="mut">Loading…</p></div><div class="card" style="margin-top:12px"><h3>Role permissions</h3><p class="mut" style="margin:0">Choose what each role can view and edit in <a href="#/settings/access">Settings → User access</a>. Admin always has full access.</p></div>`;
    await usersPanel($('#adusers'));
  }
  if (t === 'audit') {
    const log = await api('admin', 'audit');
    ab.innerHTML = `<p class="mut" style="margin:0 0 10px">Last 72 hours · ${log.length} entr${log.length === 1 ? 'y' : 'ies'}. Older entries are kept for the customer and lead timelines.</p>` + table([['When', l => l.created], ['User', l => esc(l.user)], ['Action', l => esc(l.action)], ['Entity', l => esc(l.entity) + (l.entity_id ? ' #' + l.entity_id : '')], ['Detail', l => esc(l.detail)]], log, () => { });
  }
  if (t === 'system') await systemPanel(ab, false); /* the same panel as Settings › Data & backup */
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
const MOD_LABELS = { accounts: 'Accounts — payments, receipts, project cost & profit, expenses', incentive: 'Incentive — View = own incentive received · Edit = manage every staff member’s incentive', email: 'Email — each person’s own mailboxes (Edit = send, move, delete)', fees: 'Finance — feasibility, registration, stamp paper', recycle: 'Recycle bin (Edit = restore)', dashboard: 'Dashboard', calendar: 'Calendar', attendance: 'Attendance (Edit = manage team)', leaves: 'Leaves (Edit = approve team)', leads: 'Leads', customers: 'Customers', projects: 'Project pipeline', checklist: 'Subsidy & KSEB checklists', loans: 'Bank documentation (loan papers: feasibility report, agreement)', files: 'Files & documents', folder: 'Folder (datasheets)', whatsapp: 'WhatsApp', quotes: 'Quotations', payments: 'Payments', ads: 'Meta Ads & ad spend', finance: 'Finance figures (values, balances, costs)', settings: 'Settings (view)' };
const FIN_MODS = ['quotes', 'payments', 'loans', 'ads', 'finance', 'accounts'];
/* areas in the order people think of them; an area the list misses falls under "Other" */
const UAC_GROUPS = [['Everyday', ['dashboard', 'calendar', 'attendance', 'leaves']], ['Sales', ['leads', 'whatsapp', 'quotes', 'ads']], ['Customers and projects', ['customers', 'projects', 'checklist', 'loans', 'files', 'folder']],
  ['Money', ['payments', 'finance', 'fees', 'accounts', 'incentive']], ['System', ['email', 'recycle', 'settings']]];
let UAF = { q: '', user: '' };
async function drawAccess() {
  const box = $('#uacc'); if (!box) return;
  const roles = Object.keys(S.role_names).filter(r => r !== 'admin'), was = S.roles_now; let now = JSON.parse(JSON.stringify(was));
  let us = []; try { us = await api('admin', 'users'); } catch (e) { }
  if (!box.isConnected) return;
  const cnt = r => us.filter(u => u.role === r && +u.active).length, never = (r, m) => ((S.role_never && S.role_never[r]) || []).includes(m), noEdit = m => m === 'finance' || m === 'dashboard' || m === 'settings';
  const used = new Set(UAC_GROUPS.flatMap(g => g[1])), rest = S.modules.filter(m => !used.has(m));
  const groups = UAC_GROUPS.map(([t, ms]) => [t, ms.filter(m => S.modules.includes(m))]).concat(rest.length ? [['Other', rest]] : []).filter(g => g[1].length);
  const changed = () => roles.reduce((n, r) => n + ['read', 'write'].reduce((k, x) => k + S.modules.filter(m => now[r][x].includes(m) !== was[r][x].includes(m)).length, 0), 0);
  const label = m => String(MOD_LABELS[m] || m);
  const render = () => {
    const focusQ = document.activeElement && document.activeElement.id === 'uaq', t = UAF.q.trim().toLowerCase(), pu = us.find(u => u.id == UAF.user), hi = pu && pu.role !== 'admin' ? pu.role : '', n = changed();
    const who = !pu ? '' : pu.role === 'admin' ? `<b>${esc(pu.name)}</b> is an admin: full access to everything.`
      : `<b>${esc(pu.name)}</b> is ${esc(S.role_names[pu.role] || pu.role)}: can view ${now[pu.role].read.length} areas and edit ${now[pu.role].write.length} — the highlighted column. Leads: ${+pu.can_claim ? 'sees and can claim unclaimed leads' : 'only the leads assigned to them'}.${+pu.active ? '' : ' This login is switched off.'}`;
    const cell = (r, mod) => { if (never(r, mod)) return `<td class="${hi === r ? 'uac-hi' : ''}"><span class="mut" style="font-size:12px" title="${esc(S.role_names[r])} never has ${esc(label(mod).replace(/<[^>]*>/g, ''))}">Not for this role</span></td>`;
      const rd = now[r].read.includes(mod), wt = now[r].write.includes(mod), cr = rd !== was[r].read.includes(mod), cw = wt !== was[r].write.includes(mod);
      return `<td class="${hi === r ? 'uac-hi' : ''}"><label class="ck ${cr ? 'uac-chg' : ''}"><input type="checkbox" data-r="${r}" data-m="${mod}" data-k="read" ${rd ? 'checked' : ''}> View</label>${noEdit(mod) ? '' : `<label class="ck ${cw ? 'uac-chg' : ''}"><input type="checkbox" data-r="${r}" data-m="${mod}" data-k="write" ${wt ? 'checked' : ''}> Edit</label>`}</td>`; };
    const body = groups.map(([g, ms]) => { const L = ms.filter(m => !t || label(m).toLowerCase().includes(t) || g.toLowerCase().includes(t));
      return L.length ? `<tr class="uac-g"><td colspan="${roles.length + 1}">${g}</td></tr>` + L.map(mod => `<tr class="${FIN_MODS.includes(mod) ? 'finrow' : ''}"><td><b>${label(mod)}</b>${FIN_MODS.includes(mod) ? ' <span class="pill y">finance</span>' : ''}</td>${roles.map(r => cell(r, mod)).join('')}</tr>`).join('') : ''; }).join('');
    box.innerHTML = `<div class="bar uac-bar"><input id="uaq" type="search" placeholder="Find an area" value="${esc(UAF.q)}" autocomplete="off" aria-label="Find an area">
       <select id="uau" aria-label="Check a person"><option value="">Check a person…</option>${us.map(u => `<option value="${u.id}" ${UAF.user == u.id ? 'selected' : ''}>${esc(u.name)} · ${esc(S.role_names[u.role] || u.role)}</option>`).join('')}</select><span class="sp"></span>
       <span class="uac-n ${n ? 'on' : ''}">${n ? n + (n === 1 ? ' change' : ' changes') + ' not saved' : 'No changes'}</span><button class="btn" id="uasv" ${n ? '' : 'disabled'}>Save user access</button><button class="btn sec" id="uadc" ${n ? '' : 'disabled'}>Discard</button></div>
     ${who ? `<p class="uac-who">${who}</p>` : ''}
     <div class="tw"><table class="acc"><thead><tr><th>Area</th>${roles.map(r => `<th class="${hi === r ? 'uac-hi' : ''}">${esc(S.role_names[r])}<small class="mut">${cnt(r)} ${cnt(r) === 1 ? 'person' : 'people'}</small><small><a href="#" data-allr="${r}">all</a> · <a href="#" data-nofin="${r}">no finance</a> · <a href="#" data-def="${r}">default</a></small></th>`).join('')}</tr></thead><tbody>
     ${body || `<tr><td colspan="${roles.length + 1}" class="mut">No area matches “${esc(UAF.q)}”.</td></tr>`}</tbody></table></div>
     <div class="bar" style="margin-top:12px"><button class="btn sec" id="uars">Reset all to defaults</button><span class="mut" style="font-size:12.5px">Ticking Edit also ticks View. Changes apply the next time the person loads a page.</span></div>`;
    $$('input[data-r]', box).forEach(c => c.onchange = () => { const r = now[c.dataset.r], m = c.dataset.m, k = c.dataset.k, set = new Set(r[k]);
      c.checked ? set.add(m) : set.delete(m); r[k] = [...set];
      if (k === 'write' && c.checked && !r.read.includes(m)) r.read.push(m);          /* edit needs view */
      if (k === 'read' && !c.checked) r.write = r.write.filter(x => x !== m);           /* no view → no edit */
      render(); });
    $$('[data-allr]', box).forEach(x => x.onclick = e => { e.preventDefault(); const r = x.dataset.allr; now[r] = { read: S.modules.filter(m => !never(r, m)), write: S.modules.filter(m => !noEdit(m) && !never(r, m)) }; render(); });
    $$('[data-nofin]', box).forEach(x => x.onclick = e => { e.preventDefault(); const r = x.dataset.nofin; now[r].read = now[r].read.filter(m => !FIN_MODS.includes(m)); now[r].write = now[r].write.filter(m => !FIN_MODS.includes(m)); render(); });
    $$('[data-def]', box).forEach(x => x.onclick = e => { e.preventDefault(); const r = x.dataset.def; now[r] = JSON.parse(JSON.stringify(S.role_defaults[r])); render(); });
    const q = $('#uaq', box); q.oninput = () => { UAF.q = q.value; render(); }; if (focusQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    $('#uau', box).onchange = e => { UAF.user = e.target.value; render(); };
    $('#uasv', box).onclick = async () => { await api('settings', 'save', { key: 'role_perms', value: now }); S = await api('settings', 'get'); toast('User access saved'); drawAccess(); };
    $('#uadc', box).onclick = () => { now = JSON.parse(JSON.stringify(was)); render(); };
    $('#uars', box).onclick = async () => { if (!confirm('Reset every role to its default access?')) return; await api('settings', 'save', { key: 'role_perms', value: {} }); S = await api('settings', 'get'); toast('Defaults restored'); drawAccess(); };
    if (typeof autoFit === 'function') autoFit();
  };
  render();
}
