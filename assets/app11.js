// Customer profile: 2 columns — left: progress + timeline (timestamps); right: organised details with click-to-copy and location sharing.
const PF_GROUPS = [
  ['basic', 'Basic details', 'user', [['name', 'Name'], ['phone', 'Phone', 'tel'], ['alt_phone', 'Alternate phone', 'tel'], ['email', 'Email', 'mail'], ['address', 'Address'], ['district', 'District'], ['pincode', 'PIN code'], ['roof_type', 'Roof type'], ['gst_no', 'GST no.'], ['owner_name', 'Owner'], ['added_by', 'Added by'], ['created', 'Customer since', 'date']]],
  ['kseb', 'KSEB details', 'sun', [['consumer_no', 'Consumer no.'], ['kseb_section', 'Section office'], ['sanctioned_load', 'Sanctioned load (kW)'], ['phase', 'Connection'], ['tariff', 'Tariff'], ['meter_no', 'Meter no.'],
    ['kseb_circle', 'Electrical circle'], ['kseb_division', 'Electrical division'], ['kseb_subdivision', 'Electrical sub division'], ['local_body', 'Panchayath / Municipality'], ['village_survey', 'Village & survey no.']]],
  ['bank', 'Bank details', 'card', [['bank_holder', 'Account holder'], ['bank_name', 'Bank'], ['bank_branch', 'Branch'], ['bank_account', 'Account no.'], ['bank_ifsc', 'IFSC']]],
];
const TL_ICON = { lead: 'target', convert: 'userplus', customer: 'user', edit: 'pencil', project: 'project', stage: 'check', receipt: 'receipt', payment: 'coin', service: 'gear', quote: 'receipt', file: 'file', note: 'note', wa: 'whatsapp', disc: 'chat', event: 'calendar' };

function copyText(t, what) {
  const ok = () => toast(`Copied${what ? ' ' + what : ''}`);
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(ok, () => fallback());
  fallback();
  function fallback() { const a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); ok(); } catch (e) { } a.remove(); }
}
const tlTime = (ts, local) => { const d = local ? new Date(String(ts).replace(' ', 'T')) : new Date(String(ts).replace(' ', 'T') + (String(ts).length > 10 ? 'Z' : '')); return isNaN(d) ? { day: ts, time: '' } : { day: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }; };
const mapsLink = c => c.lat && c.lng ? `https://www.google.com/maps?q=${c.lat},${c.lng}` : (c.address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([c.address, c.district, c.pincode].filter(Boolean).join(', ')) : '');

let PFT = 'overview', PFT_ID = 0;
async function pgCustomer(id) {
  if (PFT_ID !== id) { PFT = 'overview'; PFT_ID = id; }
  const [c, tl] = await Promise.all([api('customers', 'get', undefined, '&id=' + id), api('profile', 'timeline', undefined, '&customer_id=' + id)]);
  const w = canW('customers'), p0 = tl.progress[tl.progress.length - 1];
  const val = (k, t) => { const v = c[k]; if (v === null || v === undefined || v === '') return ''; return t === 'date' ? new Date(String(v).replace(' ', 'T') + 'Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : String(v); };
  const row = (k, l, t) => { const v = val(k, t); return `<div class="pfr"><span>${l}</span>${v ? `<button class="pfv" data-cp="${esc(v)}" data-l="${esc(l)}" title="Click to copy">${esc(v)}<i class="i i-copy"></i></button>` : '<em class="mut">—</em>'}</div>`; };
  const group = ([key, title, icon, fields]) => { const filled = fields.filter(([k, , t]) => val(k, t));
    return `<div class="card pfc"><div class="pfch"><i class="i i-${icon}"></i><h3>${title}</h3><span class="sp"></span>${filled.length ? `<button class="btn sec sm" data-cpg="${key}" title="Copy all ${title.toLowerCase()}"><i class="i i-copy"></i> Copy all</button>` : ''}</div>
      ${fields.map(([k, l, t]) => row(k, l, t)).join('')}${key === 'kseb' && tl.refs.length ? `<div class="pfsub">Recorded in the pipeline</div>${tl.refs.map(r => `<div class="pfr"><span>${esc(r.stage)}</span><button class="pfv" data-cp="${esc([r.ref, r.date].filter(Boolean).join(' · ') || (r.amount != null ? String(r.amount) : ''))}" data-l="${esc(r.stage)}" title="Click to copy">${esc([r.ref ? 'Ref ' + r.ref : '', r.date, r.amount ? inr(r.amount) : ''].filter(Boolean).join(' · '))}<i class="i i-copy"></i></button></div>`).join('')}` : ''}</div>`; };
  const ml = mapsLink(c), hasPin = c.lat && c.lng;
  const locCard = `<div class="card pfc"><div class="pfch"><i class="i i-target"></i><h3>Location</h3><span class="sp"></span>${w ? '<button class="btn sec sm" id="pfloc"><i class="i i-pencil"></i> ' + (hasPin ? 'Change' : 'Set location') + '</button>' : ''}</div>
     ${hasPin ? `<iframe class="pfmap" loading="lazy" title="Map" referrerpolicy="strict-origin" src="https://www.openstreetmap.org/export/embed.html?bbox=${+c.lng - .004},${+c.lat - .0025},${+c.lng + .004},${+c.lat + .0025}&layer=mapnik&marker=${c.lat},${c.lng}"></iframe>` : `<p class="mut" style="font-size:13px;margin:4px 0 8px">No map pin yet.${w ? ' Use <b>Set location</b> at the site, or paste a Google Maps link.' : ''}</p>`}
     ${row('address', 'Address')}${row('landmark', 'Landmark')}${hasPin ? `<div class="pfr"><span>Coordinates</span><button class="pfv" data-cp="${c.lat},${c.lng}" data-l="coordinates">${c.lat}, ${c.lng}<i class="i i-copy"></i></button></div>` : ''}
     ${ml ? `<div class="pfshare"><a class="btn sm" href="${ml}" target="_blank"><i class="i i-target"></i> Open in Maps</a>${hasPin ? `<a class="btn sec sm" href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}" target="_blank">Directions</a>` : ''}
       <button class="btn sec sm" data-cp="${esc(ml)}" data-l="map link"><i class="i i-copy"></i> Copy link</button><button class="btn sec sm" id="pfwa"><i class="i i-whatsapp"></i> WhatsApp</button>${navigator.share ? '<button class="btn sec sm" id="pfsh"><i class="i i-link"></i> Share</button>' : ''}</div>` : ''}</div>`;
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
    <div class="pfact"><button class="btn sec" id="dsc">${discBtnLabel(id)}</button>${c.phone ? `<a class="btn sec" href="tel:${esc(c.phone)}"><i class="i i-phone"></i> Call</a><button class="btn ok" id="wa"><i class="i i-whatsapp"></i> WhatsApp</button>` : ''}
     ${w ? '<button class="btn sec" id="ed"><i class="i i-pencil"></i> Edit</button>' : ''}<button class="ib" id="pfmore" title="More actions"><i class="i i-dots"></i></button></div></div>
   <div class="tabs pftabs">${[['overview', 'Overview', 'user'], ['plant', 'Plant details', 'sun'], ...(canR('files') ? [['docs', `Documents${c.files.length ? ' (' + c.files.length + ')' : ''}`, 'file']] : []), ['warranty', 'Warranty card', 'shield'], ['mnre', 'MNRE warranty card', 'award'], ...(FIN() ? [['tax', 'Tax bill', 'receipt']] : [])].map(([k, l, i]) => `<button data-pt="${k}" class="${PFT === k ? 'on' : ''}"><i class="i i-${i}"></i> ${l}</button>`).join('')}</div>
   <div id="pfbody"></div>
   <div class="pfgrid" ${PFT === 'overview' ? '' : 'hidden'}>
    <div class="pfleft">${prog || `<div class="card pfprog"><div class="pfch"><i class="i i-project"></i><h3>Progress</h3><span class="sp"></span>${canW('projects') ? '<button class="btn sm" id="np">+ New project</button>' : ''}</div><p class="mut" style="margin:0">No project yet.</p></div>`}
     <div class="pfcols">${PF_GROUPS.map(group).join('')}${locCard}
     <div class="card pfc"><div class="pfch"><i class="i i-receipt"></i><h3>Quotations</h3><span class="sp"></span>${canW('quotes') ? '<button class="btn sec sm" id="nq">+ New</button>' : ''}</div>${c.quotes.map(q => `<div class="pfdoc"><a href="#/quotes/${q.id}"><b>${esc(q.number)}</b></a> ${pill(q.status, stageCls(q.status))} ${q.total != null ? inr(q.total) : ''}<br><small class="mut">${q.date}</small></div>`).join('') || '<p class="mut" style="margin:0;font-size:13px">No quotations</p>'}</div>
     ${c.notes ? `<div class="card pfc"><div class="pfch"><i class="i i-note"></i><h3>Notes</h3></div><div style="font-size:14px;white-space:pre-wrap">${esc(c.notes)}</div></div>` : ''}</div></div>
    <div class="pfright"><div class="card pftl"><div class="pfch"><i class="i i-clock"></i><h3>Timeline</h3><span class="sp"></span><small class="mut">${tl.events.length} events</small></div>
      <div class="tladd"><input id="tln" placeholder="Add an update or note… (Enter to save)"><button class="btn sm" id="tlnb">Add</button></div>
      <div class="tl">${tline || '<p class="mut">Nothing yet.</p>'}</div></div></div>
    </div>`;
  // click to copy
  $$('[data-cp]').forEach(b => b.onclick = e => { e.preventDefault(); copyText(b.dataset.cp, b.dataset.l || ''); b.classList.add('ok'); setTimeout(() => b.classList.remove('ok'), 900); });
  $$('[data-cpg]').forEach(b => b.onclick = () => { const g = PF_GROUPS.find(x => x[0] === b.dataset.cpg);
    copyText(`${c.name} — ${g[1]}\n` + g[3].filter(([k, , t]) => val(k, t)).map(([k, l, t]) => `${l}: ${val(k, t)}`).join('\n') + (g[0] === 'kseb' ? tl.refs.map(r => `\n${r.stage}: ${[r.ref, r.date].filter(Boolean).join(' · ')}`).join('') : ''), g[1].toLowerCase()); });
  // location sharing
  const locText = () => `${c.name}${c.landmark ? ' — ' + c.landmark : ''}\n${[c.address, c.district].filter(Boolean).join(', ')}\n${ml}`;
  if ($('#pfwa')) $('#pfwa').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(locText()), '_blank');
  if ($('#pfsh')) $('#pfsh').onclick = () => navigator.share({ title: c.name + ' — location', text: locText(), url: ml }).catch(() => { });
  if ($('#pfloc')) $('#pfloc').onclick = () => locModal(c, id);
  // actions
  $('#dsc').onclick = () => discOpen(id);
  if ($('#wa')) $('#wa').onclick = () => waOpen({ name: c.name, phone: c.phone, customer_id: id });
  if ($('#ed')) $('#ed').onclick = () => customerModal(id, c);
  if ($('#np')) $('#np').onclick = () => startModal({ customer_id: id });
  if ($('#nq')) $('#nq').onclick = () => { sessionStorage.lead2quote = JSON.stringify({ customer_id: id, name: c.name }); location.hash = '#/quotes/new'; };
  if ($('#up')) $('#up').onclick = () => docUploadModal(c, id);
  const addNote = async () => { const t = $('#tln').value.trim(); if (!t) return; await api('notes', 'add', { entity: 'customers', entity_id: id, text: t }); route(); };
  $('#tlnb').onclick = addNote; $('#tln').onkeydown = e => { if (e.key === 'Enter') addNote(); };
  // tabs
  const showTab = k => { PFT = k; $$('[data-pt]').forEach(b => b.classList.toggle('on', b.dataset.pt === k)); $('.pfgrid').hidden = k !== 'overview'; const box = $('#pfbody'); box.innerHTML = '';
    if (k === 'plant') renderPlant(box, c, id); if (k === 'docs') renderDocs(box, c, id); if (k === 'warranty') renderWarranty(box, c, id); if (k === 'mnre') renderMnre(box, c, id); if (k === 'tax') renderTax(box, c, id); };
  $$('[data-pt]').forEach(b => b.onclick = () => showTab(b.dataset.pt));
  $$('[data-goto]').forEach(b => b.onclick = () => { showTab(b.dataset.goto); scrollTo({ top: 0, behavior: 'smooth' }); });
  if (PFT !== 'overview') showTab(PFT);
  feeMembers(id);
  if ($('#pfown')) $('#pfown').onclick = async () => { if (await reassignBox('customers', c)) route(); };
  $('#pfmore').onclick = e => { e.stopPropagation(); const old = $('#lmenu'); if (old) { old.remove(); return; }
    const items = [canW('projects') && tl.progress.length ? ['np2', 'project', '+ New project'] : null, canOwn ? ['own', 'users', +c.owner_id ? 'Reassign owner' : 'Set owner'] : null, w && canW('leads') && !BA() ? ['rv', 'refresh', 'Revert to lead'] : null, ...feeMenuItems(id), w && !BA() ? ['dl', 'trash', 'Delete customer'] : null].filter(Boolean);
    const m = document.createElement('div'); m.id = 'lmenu'; m.className = 'card menu'; m.innerHTML = items.map(([a, i, t]) => `<button data-m="${a}"><i class="i i-${i}"></i>${t}</button>`).join('') || '<p class="mut" style="margin:6px">No actions</p>';
    document.body.appendChild(m); const r = e.currentTarget.getBoundingClientRect(); m.style.top = (r.bottom + 6 + scrollY) + 'px'; m.style.left = Math.max(8, r.right - m.offsetWidth) + 'px';
    $$('[data-m]', m).forEach(b => b.onclick = async () => { m.remove(); const a = b.dataset.m; if (await feeMenuRun(a, { id, name: c.name })) return;
      if (a === 'np2') startModal({ customer_id: id });
      if (a === 'own' && await reassignBox('customers', c)) route();
      if (a === 'rv') revertToLead(id, c.name);
      if (a === 'dl' && confirm('Delete this customer and all their projects, quotes and files?\n\nIt goes to the Recycle bin and can be restored for 72 hours.')) { await api('customers', 'delete', { id }); toast('Moved to Recycle bin'); location.hash = '#/customers'; } });
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
  const save = async (lat, lng) => { await api('customers', 'save', { ...c, id, lat, lng, landmark: $('#lcl', m).value.trim() }); m.remove(); toast('Location saved'); route(); };
  $('#lcsv', m).onclick = () => { const p = chk(); if ($('#lcp', m).value.trim() && !p) return; save(p ? p.lat : '', p ? p.lng : ''); };
  if ($('#lcclr', m)) $('#lcclr', m).onclick = () => save('', '');
}
