// Customer profile: 2 columns — left: progress + timeline (timestamps); right: organised details with click-to-copy and location sharing.
const TL_ICON = { lead: 'target', convert: 'userplus', customer: 'user', edit: 'pencil', project: 'project', stage: 'check', receipt: 'receipt', payment: 'coin', service: 'gear', quote: 'receipt', file: 'file', note: 'note', wa: 'whatsapp', disc: 'chat', event: 'calendar' };

function copyText(t, what) {
  const ok = () => toast(`Copied${what ? ' ' + what : ''}`);
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(ok, () => fallback());
  fallback();
  function fallback() { const a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); ok(); } catch (e) { } a.remove(); }
}
const tlTime = (ts, local) => { const d = local ? new Date(String(ts).replace(' ', 'T')) : new Date(String(ts).replace(' ', 'T') + (String(ts).length > 10 ? 'Z' : '')); return isNaN(d) ? { day: ts, time: '' } : { day: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }; };
const mapsLink = c => c.lat && c.lng ? `https://www.google.com/maps?q=${c.lat},${c.lng}` : (c.address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([c.address, c.district, c.pincode].filter(Boolean).join(', ')) : '');

/* a value on one line: line breaks (an address) become commas */
/* All details card: empty fields hidden (remembered in this browser) */
const pfaHide = () => { try { return localStorage.pfaHide === '1'; } catch (e) { return false; } };
const pfaLine = v => String(v).split(String.fromCharCode(10)).map(x => x.trim()).filter(Boolean).join(', ');
let PFT = 'overview', PFT_ID = 0;
/* set by the Customers list (Edit): { id, key, edit } - pgCustomer opens that page once, in edit mode, then clears it */
let PFT_OPEN = null;
async function pgCustomer(id) {
  if (PFT_ID !== id) { PFT = 'overview'; PFT_ID = id; }
  let openEdit = null;
  if (PFT_OPEN && PFT_OPEN.id === id) { PFT = PFT_OPEN.key; PFT_ID = id; openEdit = PFT_OPEN.edit ? PFT_OPEN.key : null; }
  PFT_OPEN = null;
  const [c, tl, pl] = await Promise.all([api('customers', 'get', undefined, '&id=' + id), api('profile', 'timeline', undefined, '&customer_id=' + id), api('plant', 'get', undefined, '&customer_id=' + id)]);
  const w = canW('customers'), p0 = tl.progress[tl.progress.length - 1];
  const val = (k, t) => { const v = c[k]; if (v === null || v === undefined || v === '') return ''; return t === 'date' ? new Date(String(v).replace(' ', 'T') + 'Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : String(v); };
  const row = (k, l, t) => { const v = val(k, t); return `<div class="pfr"><span>${l}</span>${v ? `<button class="pfv" data-cp="${esc(v)}" data-l="${esc(l)}" title="Click to copy">${esc(v)}<i class="i i-copy"></i></button>` : '<em class="mut">—</em>'}</div>`; };
  /* page state shared by the five profile pages (app28.js PFP, app29.js renderPfPage) */
  const st = { c, p: (pl && pl.data) || {}, j: (c.projects && c.projects[0]) || null, prog: p0 || null, pipe: tl.pipe, refs: tl.refs || [], id };
  const pgKeys = PFP.PAGES.map(x => x.key);
  const cnt0 = PFP.counts(pfCtx(st));
  const sumHtml = n => PFP.PAGES.map((pg, i) => `<button class="pp-sum" data-goto="${esc(pg.key)}"><i class="i i-${esc(pg.icon)}"></i><span>${i + 1} · ${esc(pg.tab)}</span>${n[pg.key] > 0 ? `<b class="pp-need">${n[pg.key]} missing</b>` : '<b class="pp-ok">Complete</b>'}</button>`).join('');
  /* Overview: every detail of the customer in one card (the five pages' fields, in page order), each value click to copy; a hidden
     value (masked account numbers) is shown as it is, without copy. "Copy all" = the filled ones as "Label: value" lines. */
  const allCtx = pfCtx(st), allTxt = [];
  const allSecs = PFP.PAGES.map((pg, i) => {
    const fs = [].concat(...pg.sections.map(sec => sec.fields)).filter(f => pfShown(f, st) && (!f.ro || f.k === 'gps'));
    let filled = 0;
    const cells = fs.map(f => {
      const l = f.l.split(' (')[0]; let v = PFP.value(f, allCtx);
      if (f.k === 'lead_type' && v) v = (LT_OPTS.find(o => o[0] === v) || [0, v])[1];
      if (v) { filled++; if (!pfMasked(v)) allTxt.push(l + ': ' + pfaLine(v)); }
      return `<div class="pfa-f${v ? '' : ' pfa-e'}"><span>${esc(l)}</span>${!v ? '<em class="mut">—</em>' : pfMasked(v) ? `<b>${esc(v)}</b>` : pfCopy(v, l)}</div>`;
    }).join('');
    return cells ? `<div class="pfa-s"><button class="pfa-h" data-goto="${esc(pg.key)}" title="Open this page"><i class="i i-${esc(pg.icon)}"></i>${i + 1} · ${esc(pg.tab)}<small>${filled} of ${fs.length} filled</small></button><div class="pfa-g">${cells}</div></div>` : '';
  }).join('');
  const allCard = `<div class="card pfc pfa${pfaHide() ? ' pfa-hide' : ''}"><div class="pfch"><i class="i i-user"></i><h3>All details</h3><span class="sp"></span><small class="mut">Click a value to copy it</small><button class="btn sec sm" id="pfaem">${pfaHide() ? 'Show empty' : 'Hide empty'}</button><button class="btn sec sm" id="pfacp"><i class="i i-copy"></i> Copy all</button></div>${allSecs}</div>`;
  const ml = mapsLink(c), hasPin = c.lat && c.lng;
  const locCard = `<div class="card pfc"><div class="pfch"><i class="i i-target"></i><h3>Location</h3><span class="sp"></span>${w ? '<button class="btn sec sm" id="pfloc"><i class="i i-pencil"></i> ' + (hasPin ? 'Change' : 'Set location') + '</button>' : ''}</div>
     ${hasPin ? `<iframe class="pfmap" loading="lazy" title="Map" referrerpolicy="strict-origin" src="https://www.openstreetmap.org/export/embed.html?bbox=${+c.lng - .004},${+c.lat - .0025},${+c.lng + .004},${+c.lat + .0025}&layer=mapnik&marker=${c.lat},${c.lng}"></iframe>` : `<p class="mut" style="font-size:13px;margin:4px 0 8px">No map pin yet.${w ? ' Use <b>Set location</b> at the site, or paste a Google Maps link.' : ''}</p>`}
     ${row('address', 'Address')}${row('landmark', 'Landmark')}${hasPin ? `<div class="pfr"><span>Coordinates</span><button class="pfv" data-cp="${c.lat},${c.lng}" data-l="coordinates">${c.lat}, ${c.lng}<i class="i i-copy"></i></button></div>` : ''}
     ${ml ? `<div class="pfshare"><a class="btn sm" href="${ml}" target="_blank"><i class="i i-target"></i> Open in Maps</a>${hasPin ? `<a class="btn sec sm" href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}" target="_blank">Directions</a>` : ''}
       <button class="btn sec sm" data-cp="${esc(ml)}" data-l="map link"><i class="i i-copy"></i> Copy link</button>${BA() ? '' : '<button class="btn sec sm" id="pfwa"><i class="i i-whatsapp"></i> WhatsApp</button>'}${navigator.share ? '<button class="btn sec sm" id="pfsh"><i class="i i-link"></i> Share</button>' : ''}</div>` : ''}</div>`;
  const prog = tl.progress.map(p => { const pct = p.idx < 0 ? 0 : Math.round((p.idx + 1) / p.total * 100);
    return `<div class="card pfprog"><div class="pfch"><i class="i i-project"></i><h3><a href="#/projects/${p.id}">${esc(p.title || 'Project')}</a>${p.kw ? ` <span class="mut" style="font-weight:400">· ${p.kw} kW</span>` : ''}</h3><span class="sp"></span>${pill(p.stage, typeof stepCls === 'function' ? stepCls(p.stage) : '')}</div>
      <div class="pfbar"><i style="width:${pct}%"></i></div><div class="mut" style="font-size:12px;margin:4px 0 10px">Step ${p.idx + 1} of ${p.total} · ${pct}% complete</div>
      <div class="pfsteps">${p.stages.map((s, i) => `<div class="pfs ${i < p.idx ? 'ok' : i === p.idx ? 'cur' : ''}" title="${esc(s.label)}${s.at ? ' · ' + tlTime(s.at).day + ' ' + tlTime(s.at).time : ''}"><span></span><b>${esc(s.label)}</b>${s.at ? `<small>${tlTime(s.at).day.replace(/^\w+, /, '')}</small>` : ''}</div>`).join('')}</div></div>`; }).join('');
  let lastDay = '';
  const tline = tl.events.map(e => { const t = tlTime(e.ts, e.local), head = t.day !== lastDay ? `<div class="tlday">${t.day}</div>` : ''; lastDay = t.day;
    return `${head}<div class="tle k-${e.kind}"><div class="tlt">${t.time}</div><div class="tld"><i class="i i-${TL_ICON[e.kind] || 'dots'}"></i></div><div class="tlb"><b>${e.link ? `<a href="${e.link}">${esc(e.title)}</a>` : e.file ? `<a href="api.php?m=files&a=get&id=${e.file}" target="_blank">${esc(e.title)}</a>` : esc(e.title)}</b>${e.detail ? `<div class="tlx">${esc(e.detail)}</div>` : ''}${e.user ? `<small class="mut">by ${esc(e.user)}</small>` : ''}</div></div>`; }).join('');
  const initials = (c.name || '?').split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
  const canOwn = w && OWN.canReassign(c.owner_id, ME); // owner chip; the owner, admin or assistant manager can reassign
  const ownHtml = ` · Owner <span class="own${+c.owner_id === +ME.id ? ' me' : ''}" title="Customer owner"><i class="i i-user"></i>${+c.owner_id ? esc(ownLabel(c.owner_id, c.owner_name)) : 'No owner'}</span>${canOwn ? ` <button class="owbtn" id="pfown">${+c.owner_id ? 'Reassign' : 'Set owner'}</button>` : ''}`;
  $('#main').innerHTML = `<p style="margin:0 0 8px"><a href="#/customers">← Customers</a></p>
   <div class="card pfhead"><div class="pfav">${esc(initials)}</div><div class="pfht"><h2>${esc(c.name)}</h2><div class="mut">${p0 ? pill(p0.stage, typeof stepCls === 'function' ? stepCls(p0.stage) : '') + ' ' : ''}${c.phone ? `<button class="pfv inl" data-cp="${esc(c.phone)}" data-l="phone">${esc(c.phone)}<i class="i i-copy"></i></button>` : ''}${c.consumer_no ? ` · Consumer no. <button class="pfv inl" data-cp="${esc(c.consumer_no)}" data-l="consumer no.">${esc(c.consumer_no)}<i class="i i-copy"></i></button>` : ''}${ownHtml}</div></div>
    <div class="pfact"><button class="btn sec" id="dsc">${discBtnLabel(id)}</button>${c.phone ? `<a class="btn sec" href="tel:${esc(c.phone)}"><i class="i i-phone"></i> Call</a>${BA() ? '' : `<button class="btn ok" id="wa"><i class="i i-whatsapp"></i> WhatsApp</button>`}` : ''}
     ${w ? '<button class="btn sec" id="ed"><i class="i i-pencil"></i> Edit</button>' : ''}${canR('accounts') ? '<button class="btn sec" id="pfexp" title="Expense sheet: purchases, services, commission / incentive and profit of the latest project"><i class="i i-coin"></i> Expense</button>' : ''}<button class="ib" id="pfmore" title="More actions"><i class="i i-dots"></i></button></div></div>
   <div class="tabs pftabs">${[['overview', 'Overview', 'user'], ...PFP.PAGES.map((pg, i) => [pg.key, `${i + 1} · ${pg.tab}`, pg.icon]), ...(canR('files') ? [['docs', `Documents${c.files.length ? ' (' + c.files.length + ')' : ''}`, 'file']] : []), ['warranty', 'Warranty card', 'shield'], ['mnre', 'MNRE warranty card', 'award'], ...(ME.role === 'admin' ? [['pay', 'Payments', 'card']] : []), ...(FIN() ? [['tax', 'Tax bill', 'receipt']] : []), ...(ME.role === 'admin' ? [['ps', 'Purchases and services', 'coin'], ['comm', 'Commission / Incentive', 'users']] : [])].map(([k, l, i]) => `<button data-pt="${k}" class="${PFT === k ? 'on' : ''}"><i class="i i-${i}"></i> ${esc(l)}${pgKeys.includes(k) ? ` <span class="ppn" data-ppn="${k}"${cnt0[k] > 0 ? '' : ' hidden'}>${cnt0[k] || 0}</span>` : ''}</button>`).join('')}</div>
   <div id="pfbody"></div>
   <div class="pfgrid" ${PFT === 'overview' ? '' : 'hidden'}>
    ${allCard}
    <div class="pfleft">${prog || `<div class="card pfprog"><div class="pfch"><i class="i i-project"></i><h3>Progress</h3><span class="sp"></span>${canW('projects') ? '<button class="btn sm" id="np">+ New project</button>' : ''}</div><p class="mut" style="margin:0">No project yet.</p></div>`}
     <div class="pfcols"><div class="card pfc"><div class="pfch"><i class="i i-clipboard"></i><h3>Details by page</h3></div><div id="ppsum">${sumHtml(cnt0)}</div></div>${locCard}
     <div class="card pfc"><div class="pfch"><i class="i i-receipt"></i><h3>Quotations</h3><span class="sp"></span>${canW('quotes') ? '<button class="btn sec sm" id="nq">+ New</button>' : ''}</div>${c.quotes.map(q => `<div class="pfdoc"><a href="#/quotes/${q.id}"><b>${esc(q.number)}</b></a> ${pill(q.status, stageCls(q.status))} ${q.total != null ? inr(q.total) : ''}<br><small class="mut">${q.date}</small></div>`).join('') || '<p class="mut" style="margin:0;font-size:13px">No quotations</p>'}</div>
     ${c.notes ? `<div class="card pfc"><div class="pfch"><i class="i i-note"></i><h3>Notes</h3></div><div style="font-size:14px;white-space:pre-wrap">${esc(c.notes)}</div></div>` : ''}</div></div>
    <div class="pfright"><div class="card pftl"><div class="pfch"><i class="i i-clock"></i><h3>Timeline</h3><span class="sp"></span><small class="mut">${tl.events.length} events</small></div>
      <div class="tladd"><input id="tln" placeholder="Add an update or note… (Enter to save)"><button class="btn sm" id="tlnb">Add</button></div>
      <div class="tl">${tline || '<p class="mut">Nothing yet.</p>'}</div></div></div>
    </div>`;
  // click to copy
  $$('[data-cp]').forEach(b => b.onclick = e => { e.preventDefault(); copyText(b.dataset.cp, b.dataset.l || ''); b.classList.add('ok'); setTimeout(() => b.classList.remove('ok'), 900); });
  if ($('#pfaem')) $('#pfaem').onclick = e => { const on = !pfaHide(); try { localStorage.pfaHide = on ? '1' : ''; } catch (er) { } $('.pfa').classList.toggle('pfa-hide', on); e.currentTarget.textContent = on ? 'Show empty' : 'Hide empty'; };
  if ($('#pfacp')) $('#pfacp').onclick = () => copyText(allTxt.join(String.fromCharCode(10)), 'all details');
  // location sharing
  const locText = () => `${c.name}${c.landmark ? ' — ' + c.landmark : ''}\n${[c.address, c.district].filter(Boolean).join(', ')}\n${ml}`;
  if ($('#pfwa')) $('#pfwa').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(locText()), '_blank');
  if ($('#pfsh')) $('#pfsh').onclick = () => navigator.share({ title: c.name + ' — location', text: locText(), url: ml }).catch(() => { });
  if ($('#pfloc')) $('#pfloc').onclick = () => locModal(c, id);
  // actions
  $('#dsc').onclick = () => discOpen(id);
  if ($('#wa')) $('#wa').onclick = () => waOpen({ name: c.name, phone: c.phone, customer_id: id });
  if ($('#ed')) $('#ed').onclick = () => showTab(pgKeys.includes(PFT) ? PFT : 'kseb', true);
  /* Expense: the latest project's Expense sheet (c.projects is newest first) */
  if ($('#pfexp')) $('#pfexp').onclick = () => { const j = (c.projects || [])[0]; if (j && +j.id) location.hash = '#/accounts/cost/' + +j.id; else toast('Start a project for this customer first', true); };
  if ($('#np')) $('#np').onclick = () => startModal({ customer_id: id });
  if ($('#nq')) $('#nq').onclick = () => { sessionStorage.lead2quote = JSON.stringify({ customer_id: id, name: c.name }); location.hash = '#/quotes/new'; };
  if ($('#up')) $('#up').onclick = () => docUploadModal(c, id);
  const addNote = async () => { const t = $('#tln').value.trim(); if (!t) return; await api('notes', 'add', { entity: 'customers', entity_id: id, text: t }); route(); };
  $('#tlnb').onclick = addNote; $('#tln').onkeydown = e => { if (e.key === 'Enter') addNote(); };
  // tabs
  /* a page save: refresh the red counts on the tabs and the Overview card, without reloading the profile */
  const bindGoto = () => $$('[data-goto]').forEach(b => b.onclick = () => { showTab(b.dataset.goto); scrollTo({ top: 0, behavior: 'smooth' }); });
  const refresh = () => route();
  /* Purchases and services (admin only): a read-only view of the project's purchases and services, no money (app34.js acProfileTab); editing is in Accounts › Expense */
  const showTab = (k, edit) => { if (k === 'ps' && PFT === 'ps' && $('#acx_psb')) return; if (!acLeaveOk()) return; acLeft(); if ((k === 'ps' || k === 'comm' || k === 'pay') && ME.role !== 'admin') k = 'overview'; PFT = k; $$('[data-pt]').forEach(b => b.classList.toggle('on', b.dataset.pt === k)); $('.pfgrid').hidden = k !== 'overview'; const box = $('#pfbody'); box.innerHTML = '';
    if (k === 'plant') renderPlant(box, st.c, id, !!edit, st, refresh);
    else if (pgKeys.includes(k)) renderPfPage(box, st, k, !!edit, refresh);
    if (k === 'docs') renderDocs(box, st.c, id); if (k === 'warranty') renderWarranty(box, st.c, id); if (k === 'mnre') renderMnre(box, st.c, id); if (k === 'tax') renderTax(box, st.c, id); if (k === 'pay') payTab(box, st.c, id); if (k === 'ps') acProfileTab(box, st.c, id); if (k === 'comm') commProfileTab(box, st.c, id); };
  $$('[data-pt]').forEach(b => b.onclick = () => showTab(b.dataset.pt));
  bindGoto();
  if (PFT !== 'overview') showTab(PFT, openEdit === PFT);
  feeMembers(id);
  if ($('#pfown')) $('#pfown').onclick = async () => { if (acLeaveOk() && await reassignBox('customers', c)) { acLeft(); route(); } };
  $('#pfmore').onclick = e => { e.stopPropagation(); const old = $('#lmenu'); if (old) { old.remove(); return; }
    const items = [canW('projects') && tl.progress.length ? ['np2', 'project', '+ New project'] : null, canOwn ? ['own', 'users', +c.owner_id ? 'Reassign owner' : 'Set owner'] : null, w && canW('leads') && !BA() ? ['rv', 'refresh', 'Revert to lead'] : null, ...feeMenuItems(id), w && !BA() ? ['dl', 'trash', 'Delete customer'] : null].filter(Boolean);
    const m = document.createElement('div'); m.id = 'lmenu'; m.className = 'card menu'; m.innerHTML = items.map(([a, i, t]) => `<button data-m="${a}"><i class="i i-${i}"></i>${t}</button>`).join('') || '<p class="mut" style="margin:6px">No actions</p>';
    document.body.appendChild(m); const r = e.currentTarget.getBoundingClientRect(); m.style.top = (r.bottom + 6 + scrollY) + 'px'; m.style.left = Math.max(8, r.right - m.offsetWidth) + 'px';
    $$('[data-m]', m).forEach(b => b.onclick = async () => { m.remove(); const a = b.dataset.m; if (await feeMenuRun(a, { id, name: c.name })) return;
      if (a === 'np2') startModal({ customer_id: id });
      if (a === 'own' && acLeaveOk() && await reassignBox('customers', c)) { acLeft(); route(); }
      if (a === 'rv') revertToLead(id, c.name);
      if (a === 'dl' && confirm('Delete this customer and all their projects, quotes and files?\n\nIt goes to the Recycle bin and can be restored for ' + RULE('trash_hours') + ' hours.')) { await api('customers', 'delete', { id }); toast('Moved to Recycle bin'); location.hash = '#/customers'; } });
    setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }));
  };
}
function discBtnLabel(id) { const s = (typeof DISC !== 'undefined' && DISC.sum) ? DISC.sum[id] : null; return `<i class="i i-chat"></i> Discussion${s ? ` <span class="pill ${+s.unread ? 'r' : 'b'}">${+s.unread ? s.unread + ' new' : 'live'}</span>` : ''}`; }

// set / change the map pin: current GPS position, or a pasted Google Maps link / "lat, lng"
function parseLatLng(s) {
  s = String(s || '');
  let m = s.match(/@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) || s.match(/[?&](?:q|query|ll|destination)=(-?\d{1,2}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i) || s.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/) || s.match(/^\s*(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)\s*$/);
  if (!m) return null; const lat = +m[1], lng = +m[2];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat: lat.toFixed(6), lng: lng.toFixed(6) } : null;
}
function locModal(c, id) {
  const m = modal(`<h2 style="margin-top:0">Customer location</h2>
    <button class="btn" id="lcgps" style="width:100%;justify-content:center"><i class="i i-target"></i> Use my current location (at the site)</button>
    <div class="mut" style="text-align:center;margin:10px 0;font-size:13px">— or —</div>
    <label>Paste a Google Maps link or coordinates</label><input id="lcp" placeholder="https://maps.google.com/… or 8.6037, 76.9977" value="${c.lat && c.lng ? c.lat + ', ' + c.lng : ''}">
    <div class="mut" id="lcok" style="font-size:12px;margin-top:4px"></div>
    <label style="margin-top:10px">Landmark</label><input id="lcl" placeholder="e.g. Near Govt. LP School, opposite temple" value="${esc(c.landmark || '')}" maxlength="120">
    <div class="bar" style="margin-top:14px"><button class="btn" id="lcsv">Save location</button><button class="btn sec" id="lcx">Cancel</button>${c.lat ? '<span class="sp"></span><button class="btn sec" id="lcclr">Remove pin</button>' : ''}</div>`);
  const chk = () => { const p = parseLatLng($('#lcp', m).value); $('#lcok', m).textContent = $('#lcp', m).value.trim() ? (p ? `✓ ${p.lat}, ${p.lng}` : 'Could not read coordinates — open the place in Google Maps and copy the link from the address bar, or paste "lat, lng". Short links (maps.app.goo.gl) don\'t contain coordinates.') : ''; return p; };
  $('#lcp', m).oninput = chk; chk();
  $('#lcx', m).onclick = () => m.remove();
  $('#lcgps', m).onclick = () => { const b = $('#lcgps', m); if (!navigator.geolocation) return toast('This browser cannot get your location', true); b.disabled = true; b.textContent = 'Getting location…';
    navigator.geolocation.getCurrentPosition(p => { $('#lcp', m).value = p.coords.latitude.toFixed(6) + ', ' + p.coords.longitude.toFixed(6); chk(); b.disabled = false; b.innerHTML = `<i class="i i-target"></i> Got it (±${Math.round(p.coords.accuracy)} m) — use again`; },
      () => { b.disabled = false; b.innerHTML = '<i class="i i-target"></i> Use my current location (at the site)'; toast('Location permission denied', true); }, { enableHighAccuracy: true, timeout: 10000 }); };
  const save = async (lat, lng) => { await api('profile', 'page_save', { customer_id: id, page: 'loc', data: { lat, lng, landmark: $('#lcl', m).value.trim() } }); m.remove(); toast('Location saved'); route(); };
  $('#lcsv', m).onclick = () => { const p = chk(); if ($('#lcp', m).value.trim() && !p) return; save(p ? p.lat : '', p ? p.lng : ''); };
  if ($('#lcclr', m)) $('#lcclr', m).onclick = () => save('', '');
}

/* ---------- Customer profile › Payments (admin only; api/onboard.php, api/accounts.php) ----------
   The total plant cost, what has come in and what is left; every payment with its receipt; the approved quotation; and whether the
   customer shows in Accounts (on by default — no payment is needed for that). */
async function payTab(box, c, id) {
  let s; try { s = await api('profile', 'cost_get', undefined, '&customer_id=' + id); } catch (e) { box.innerHTML = '<p class="mut">The payments could not be loaded.</p>'; return; }
  if (!box.isConnected || PFT !== 'pay') return;
  const multi = s.projects.length > 1, has = s.cost > 0, tk = s.track || { state: 'open', show: 1 }, redraw = () => payTab(box, c, id);
  const pct = has ? Math.min(100, Math.round(s.paid / s.cost * 100)) : 0, full = has && s.balance <= 1, n = s.projects.reduce((k, p) => k + p.payments.length, 0);
  const kseb = s.kseb_extra ? `Additional — paid on top${s.kseb_extra_amt > 0 ? ' · ' + inr(s.kseb_extra_amt) : ' (amount not entered)'}` : has ? 'Included in the plant cost' : '—';
  const NEEDREF = 'A receipt needs the reference number (UTR / cheque / transaction no.) unless the payment was in cash.';
  const rcBtn = x => x.receipt_no ? `<button class="acx-link" type="button" data-pr="${+x.id}" title="Open the receipt">${esc(x.receipt_no)}</button>`
    : x.mode === 'Cash' || String(x.ref_no || '').trim() ? `<button class="btn sec sm" type="button" data-pr="${+x.id}" title="Give this payment a receipt number and open the receipt">Make receipt</button>`
      : `<button class="btn sec sm" type="button" data-pn="${+x.id}" title="${NEEDREF}">Add reference no.</button>`;
  /* each payment with what was still to come after it; "Paid by" only where the bank pays part (a loan project) */
  const pays = p => { if (!p.payments.length) return `<div class="pyt-none"><p class="mut">No payment recorded yet${multi ? ' for this project' : ''}.</p></div>`;
    let left = p.cost; const by = p.loan === 'Yes' || p.payments.some(x => x.src === 'bank');
    return `<div class="pcz-tw"><table class="pcz-t" data-nofit="1"><thead><tr><th>Date</th><th class="num">Amount</th>${by ? '<th>Paid by</th>' : ''}<th>Mode and reference</th><th>Receipt</th><th class="num">Balance after</th><th><span class="acx-sr">Actions</span></th></tr></thead><tbody>${p.payments.map(x => { left -= x.amount;
      return `<tr><td class="pyt-nw">${esc(dmy(x.date))}</td><td class="num pyt-nw"><b>${inr(x.amount)}</b></td>${by ? `<td class="pyt-nw">${x.src === 'bank' ? 'Bank (loan)' : 'Customer'}</td>` : ''}<td><b>${esc(x.mode || '—')}</b>${x.ref_no ? ' · ' + esc(x.ref_no) : ''}${x.note ? `<small class="mut pyt-nt">${esc(x.note)}</small>` : ''}</td><td>${rcBtn(x)}</td><td class="num pyt-nw ${p.cost > 0 && left > 1 ? '' : 'pcz-g'}">${p.cost > 0 ? inr(Math.max(0, left)) : '—'}</td>
        <td class="pcz-pa"><button class="ib" type="button" data-pe="${+x.id}" data-pp="${+p.id}" title="Edit this payment" aria-label="Edit this payment"><i class="i i-pencil"></i></button><button class="ib" type="button" data-pd="${+x.id}" title="Delete this payment" aria-label="Delete this payment"><i class="i i-trash"></i></button></td></tr>`; }).join('')}
      </tbody><tfoot><tr><td>Total</td><td class="num pyt-nw"><b>${inr(p.paid)}</b></td><td colspan="${by ? 5 : 4}" class="mut">${p.payments.length} payment${p.payments.length === 1 ? '' : 's'}</td></tr></tfoot></table></div>`; };
  const acct = tk.state === 'off' ? 'Not shown in Accounts. Payments can still be recorded here.'
    : tk.state === 'done' ? `Completed${tk.done_at ? ' on ' + esc(dmy(String(tk.done_at).slice(0, 10))) : ''}${tk.done_by ? ' · ' + esc(tk.done_by) : ''}.` : 'Listed under In progress.';
  box.innerHTML = `<div class="pyt"><div class="pyt-main">
     <div class="card pfc"><div class="pfch"><i class="i i-card"></i><h3>Payments</h3><span class="pill">Admin only</span><span class="sp"></span><button class="btn sm" id="pczpay" type="button"><i class="i i-plus"></i> Record payment</button></div>
      <div class="pcz-sum"><div><small>Total plant cost</small><b>${has ? inr(s.cost) : 'Not entered'}</b></div><div><small>Received</small><b class="pcz-g">${inr(s.paid)}</b></div><div><small>Balance</small><b class="${s.balance > 0 ? 'over' : ''}">${has ? inr(s.balance) : '—'}</b></div></div>
      ${has ? `<div class="pyt-bar" role="img" aria-label="${pct}% of the plant cost received"><i style="width:${pct}%"></i></div><p class="mut pyt-pc">${pct}% of the plant cost received${n ? ` in ${n} payment${n === 1 ? '' : 's'}` : ''}</p>` : '<p class="mut pyt-pc">Enter the total plant cost to see the balance.</p>'}
      ${full && s.paid > 0 && tk.state === 'open' ? '<div class="pyt-ok"><i class="i i-check"></i><span>The payment is complete.</span><button class="btn sm" type="button" data-done="1">Move to Completed</button></div>' : ''}
      ${s.projects.length ? s.projects.map(p => `<h4 class="pcz-h">${multi ? `<a href="#/projects/${+p.id}">${esc(p.title || 'Project')}</a><span>${inr(p.cost)} · received ${inr(p.paid)}</span>` : 'Payments received'}</h4>${pays(p)}`).join('')
        : '<h4 class="pcz-h">Payments received</h4><div class="pyt-none"><p class="mut">No payment recorded yet. The first payment also starts the customer’s project with the plant cost.</p></div>'}</div></div>
    <div class="pyt-side">
     <div class="card pfc"><div class="pfch"><i class="i i-coin"></i><h3>Plant cost</h3><span class="sp"></span><button class="btn sec sm" id="pczed" type="button"><i class="i i-pencil"></i> ${has ? 'Edit' : 'Enter the cost'}</button></div>
      <div class="pcz-rows pyt-rows"><div><span>Total plant cost</span><b>${has ? inr(s.cost) : 'Not entered'}</b></div><div><span>KSEB charges</span><b>${kseb}</b></div>
       ${s.from_project && s.agreed > 0 && Math.abs(s.agreed - s.cost) > 0.5 ? `<div><span>Agreed in the quotation</span><b>${inr(s.agreed)}</b></div>` : ''}
       <div><span>Approved quotation</span><span class="pcz-q">${s.quote ? `<a href="api.php?m=files&a=get&id=${+s.quote.id}&v=1" target="_blank" rel="noopener"><i class="i i-file"></i> ${esc(s.quote.name)}</a><small class="mut">${esc(dmy(String(s.quote.created).slice(0, 10)))}</small>` : '<b class="over">Not uploaded</b>'}</span></div></div>
      <div class="stg-act"><button class="btn sec sm" id="pczup" type="button"><i class="i i-upload"></i> ${s.quote ? 'Add a revised quotation' : 'Upload the approved quotation'}</button></div></div>
     <div class="card pfc"><div class="pfch"><i class="i i-receipt"></i><h3>Accounts</h3></div>
      <label class="hsw pyt-sw"><input type="checkbox" id="pczshow" ${tk.state === 'off' ? '' : 'checked'}><span class="hswt"></span>Show in Accounts</label>
      <p class="mut pyt-st">${acct}</p>
      ${tk.state === 'off' ? '' : `<div class="stg-act">${canR('accounts') ? `<a class="btn sec sm" href="#/accounts/${tk.state === 'done' ? 'done' : 'progress'}">Open in Accounts</a>` : ''}${tk.state === 'done' ? '<button class="btn sec sm" type="button" data-done="0">Move back to In progress</button>' : full && s.paid > 0 ? '' : '<button class="btn sec sm" type="button" data-done="1">Move to Completed</button>'}</div>`}</div></div></div>`;
  const projOf = b => s.projects.find(y => y.id == b.dataset.pp), payOf = pid => { for (const p of s.projects) { const x = p.payments.find(y => y.id == pid); if (x) return [p, x]; } return []; };
  const openRc = pid => acReceipt(pid, { onChange: redraw });
  /* Record payment: the same form as Accounts. A payment belongs to a project, so the first one starts the project with the plant cost. */
  $('#pczpay', box).onclick = async e => {
    const b = e.currentTarget; let pj = s.projects[s.projects.length - 1];
    if (!pj) { b.disabled = true; const pid = await acProjectFor(id, s.cost); b.disabled = false; if (!pid) return; pj = { id: pid, kw: '', loan: '' }; }
    acPayForm({ pid: pj.id, customer: c.name, kw: pj.kw, loan: pj.loan, due: s.balance }, null, { done: redraw, open: openRc });
  };
  $$('[data-pr]', box).forEach(b => b.onclick = () => openRc(+b.dataset.pr));
  $$('[data-pn]', box).forEach(b => b.onclick = () => { const [p, x] = payOf(b.dataset.pn); if (x) acPayForm({ pid: p.id, customer: c.name, kw: p.kw, loan: p.loan }, x, { why: NEEDREF, done: redraw, open: openRc }); });
  $$('[data-pe]', box).forEach(b => b.onclick = () => { const p = projOf(b), x = p && p.payments.find(y => y.id == b.dataset.pe); if (x) acPayForm({ pid: p.id, customer: c.name, kw: p.kw, loan: p.loan }, x, { done: redraw, open: openRc }); });
  $$('[data-pd]', box).forEach(b => b.onclick = async () => { const [, x] = payOf(b.dataset.pd); if (!x || !confirm(`Delete the payment of ${inr(x.amount)} on ${dmy(x.date)}?\n\nIt goes to the Recycle bin for ${RULE('trash_hours')} hours.`)) return;
    try { await api('payments', 'delete', { id: x.id }); toast('Payment moved to the Recycle bin'); redraw(); } catch (er) { } });
  /* Show in Accounts: on by default. Off takes the customer off the Accounts lists; nothing else changes. */
  $('#pczshow', box).onchange = async e => { const on = e.target.checked; e.target.disabled = true;
    try { await api('acc', 'track_show', { customer_id: id, show: on ? 1 : 0 }); toast(on ? `${c.name} shows in Accounts` : `${c.name} is taken off Accounts`); redraw(); } catch (er) { e.target.checked = !on; e.target.disabled = false; } };
  $$('[data-done]', box).forEach(b => b.onclick = async () => { const done = b.dataset.done === '1', body = { customer_id: id, done: done ? 1 : 0 };
    if (done && !full) { if (!confirm(has ? `${inr(s.balance)} is still pending for ${c.name}.\n\nMove to Completed anyway?` : `No plant cost is entered for ${c.name}.\n\nMove to Completed anyway?`)) return; body.force = 1; }
    b.disabled = true; try { await api('acc', 'track_set', body); toast(c.name + (done ? ' moved to Completed' : ' moved back to In progress')); redraw(); } catch (er) { b.disabled = false; } });
  $('#pczed', box).onclick = () => {
    const m = modal(`<h2 style="margin-top:0">Plant cost</h2><div class="two"><div><label>Total plant cost (₹)</label><input id="pczc" inputmode="numeric" autocomplete="off" value="${s.agreed > 0 || has ? (multi ? s.agreed || '' : s.cost).toLocaleString('en-IN') : ''}"></div>
      <div><label>KSEB charges</label><select id="pczx"><option value="0">Included in the plant cost</option><option value="1" ${s.kseb_extra ? 'selected' : ''}>Additional (paid on top)</option></select></div>
      <div class="full" id="pczab" ${s.kseb_extra ? '' : 'hidden'}><label>KSEB charges amount (₹) — leave empty if it is not known yet</label><input id="pcza" inputmode="numeric" autocomplete="off" value="${s.kseb_extra_amt > 0 ? s.kseb_extra_amt.toLocaleString('en-IN') : ''}"></div></div>
      <p class="mut" style="font-size:12.5px;margin:10px 0 0">${multi ? `This customer has ${s.projects.length} projects. Each project keeps its own value (edit it on the project); the figure here is the cost agreed in the approved quotation.` : s.projects.length ? 'The project’s value follows this figure, so Accounts and the tax bill agree.' : 'A project started for this customer takes this figure as its value.'}</p>
      <div class="bar" style="margin-top:14px"><button class="btn" id="pczsv">Save</button><button class="btn sec" id="pczcx">Cancel</button></div>`);
    $('#pczx', m).onchange = e => { $('#pczab', m).hidden = e.target.value !== '1'; };
    $('#pczcx', m).onclick = () => m.remove();
    $('#pczsv', m).onclick = async e => { const cost = onbNum($('#pczc', m).value); if (!(cost > 0)) return toast('Enter the total plant cost', true); const b = e.currentTarget; b.disabled = true;
      try { await api('profile', 'cost_save', { customer_id: id, plant_cost: cost, kseb_extra: $('#pczx', m).value === '1' ? 1 : 0, kseb_extra_amt: onbNum($('#pcza', m).value) }); m.remove(); toast('Plant cost saved'); redraw(); } catch (x) { b.disabled = false; } };
  };
  $('#pczup', box).onclick = async () => { const f = await pickFile('application/pdf,image/jpeg,image/png,image/webp'); if (!f) return;
    const fd = new FormData(); fd.append('customer_id', id); fd.append('kind', 'approved'); fd.append('file', f);
    try { await api('files', 'upload', fd); toast('Approved quotation saved in Documents'); if (typeof DOC_STALE !== 'undefined') DOC_STALE.add(+id); redraw(); } catch (e) { } };
}
