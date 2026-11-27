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
const pfaHide = () => { try { return localStorage.pfaHide !== '0'; } catch (e) { return true; } }; /* empty fields hidden unless the person chose Show empty */
const pfaLine = v => String(v).split(String.fromCharCode(10)).map(x => x.trim()).filter(Boolean).join(', ');
/* Customer page tabs in four groups: Overview · Details (the five numbered pages) · Documents · Money. Each view keeps its own key
   (PFT, data-pt), so links that open a view by key still work; every sub-tab button stays in the page, only the other groups' rows are hidden.
   The Details tab shows the total of the red "missing" counts. A group remembers the last sub-tab opened (PFG_LAST, this browser tab only). */
const PFG = [['overview', 'Overview', 'user', ['overview']], ['details', 'Details', 'clipboard', null], ['docs_g', 'Documents', 'file', ['docs', 'ksebl', 'warranty', 'mnre']], ['money', 'Money', 'wallet', ['pay', 'tax', 'ps', 'comm']]];
const PFG_LAST = {};
const pfGroupOf = (k, pgKeys) => (PFG.find(g => (g[3] || pgKeys).includes(k)) || PFG[0])[0];
/* Header redesign (2026-11-24): the four group tabs sit at the foot of the header card (underline tabs, .cuh-tabs). A tab is
   [key, label, icon, step no., count]: the five numbered pages show their number in a small circle instead of an icon; a count
   (Documents) is a grey badge. Sub-menu drawer (owner, 2026-11-24: "when click main menu, open the submenu in the drop horizontal
   style, slide open the sub menus"): the chosen group's views (.cuh-sub) live in a drawer under the tabs inside the card (.cuh-drop);
   clicking a group drops the drawer down and its row slides open sideways from under that tab; Overview folds it away.
   Returns { tabs, subs } — subs = the drawer. */
function pfTabsHtml(tabs, pgKeys, cnt) {
  const cur = pfGroupOf(PFT, pgKeys), miss = pgKeys.reduce((a, k) => a + (+cnt[k] || 0), 0);
  const btn = ([k, l, i, no, n], j = 0) => `<button data-pt="${k}" class="${PFT === k ? 'on' : ''}" style="--i:${j}">${no ? `<span class="cuh-no">${no}</span>` : `<i class="i i-${i}"></i>`}${esc(l)}${n ? `<span class="cuh-n">${n}</span>` : ''}${pgKeys.includes(k) ? `<span class="ppn" data-ppn="${k}"${cnt[k] > 0 ? '' : ' hidden'}>${cnt[k] || 0}</span>` : ''}</button>`;
  const groups = PFG.map(g => [g, tabs.filter(t => (g[3] || pgKeys).includes(t[0]))]).filter(([, ts]) => ts.length);
  return {
    tabs: `<div class="cuh-tabs" role="tablist" aria-label="Customer sections">${groups.map(([g]) => `<button data-pg="${g[0]}" class="${cur === g[0] ? 'on' : ''}" role="tab" aria-selected="${cur === g[0]}"${g[0] === 'overview' ? '' : ' aria-haspopup="true"'}><i class="i i-${g[2]}"></i>${g[1]}${g[0] === 'details' && miss ? `<span class="ppn" title="${miss} missing">${miss}</span>` : ''}${g[0] === 'overview' ? '' : '<i class="i i-chev cuh-cv"></i>'}</button>`).join('')}</div>`,
    subs: `<div class="cuh-drop${cur !== 'overview' ? ' open' : ''}" data-g="${cur}"><div class="cuh-drop-in"><div class="cuh-drop-pad">`
      + groups.filter(([g]) => g[0] !== 'overview').map(([g, ts]) => `<div class="cuh-sub" data-sub-of="${g[0]}"${cur === g[0] ? '' : ' hidden'}>${ts.map(btn).join('')}</div>`).join('')
      + tabs.filter(t => t[0] === 'overview').map(t => `<span hidden>${btn(t)}</span>`).join('') /* Overview's own key, for code that opens it by data-pt */
      + '</div></div></div>'
  };
}
/* desktop: start the drawer's row under the tab that opened it (pulled left when it would run past the card) */
function cuhAnchor(row, g) {
  row.style.marginLeft = '';
  const tab = $(`.cuh-tabs [data-pg="${g}"]`), pad = row.parentElement;
  if (!tab || innerWidth <= 820) return;
  const box = pad.getBoundingClientRect(), cs = getComputedStyle(pad), avail = box.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const x = tab.getBoundingClientRect().left - box.left - parseFloat(cs.paddingLeft);
  row.style.marginLeft = Math.max(0, Math.min(x, avail - row.scrollWidth)) + 'px';
}
let CUH_RS = 0;
function pfTabsShow(k) {
  const sub = $(`.cuh-sub [data-pt="${k}"]`), g = sub ? sub.closest('.cuh-sub').dataset.subOf : 'overview';
  if (g !== 'overview') PFG_LAST[g] = k;
  $$('[data-pg]').forEach(b => { const on = b.dataset.pg === g; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  const drop = $('.cuh-drop'); if (!drop) return;
  const prev = drop.dataset.g; drop.dataset.g = g;
  if (g === 'overview') { drop.classList.remove('open'); return; } /* the last row folds up with the drawer */
  $$('.cuh-sub', drop).forEach(r => r.hidden = r.dataset.subOf !== g);
  const row = $(`.cuh-sub[data-sub-of="${g}"]`, drop);
  cuhAnchor(row, g);
  drop.classList.add('open');
  if (prev !== g) { row.classList.remove('cuh-in'); void row.offsetWidth; row.classList.add('cuh-in'); } /* replay the slide when the group changes */
  if (!CUH_RS) { CUH_RS = 1; addEventListener('resize', () => { const d = $('.cuh-drop.open'), r = d && $('.cuh-sub:not([hidden])', d); if (r) cuhAnchor(r, d.dataset.g); }); }
  /* a narrow screen scrolls the views row sideways: bring the chosen one into sight */
  const b = $(`[data-pt="${k}"]`, row);
  if (b && row.scrollWidth > row.clientWidth && (b.offsetLeft < row.scrollLeft || b.offsetLeft + b.offsetWidth > row.scrollLeft + row.clientWidth)) row.scrollLeft = b.offsetLeft - 12;
}
let PFT = 'overview', PFT_ID = 0;
/* set by the Customers list (Edit): { id, key, edit } - pgCustomer opens that page once, in edit mode, then clears it */
let PFT_OPEN = null;
async function pgCustomer(id) {
  if (PFT_ID !== id) { PFT = 'overview'; PFT_ID = id; }
  let openEdit = null;
  if (PFT_OPEN && PFT_OPEN.id === id) { PFT = PFT_OPEN.key; PFT_ID = id; openEdit = PFT_OPEN.edit ? PFT_OPEN.key : null; }
  PFT_OPEN = null;
  const [c, tl, pl] = await Promise.all([api('customers', 'get', undefined, '&id=' + id), api('profile', 'timeline', undefined, '&customer_id=' + id), api('plant', 'get', undefined, '&customer_id=' + id),
    typeof PIPE !== 'undefined' && !PIPE && canR('projects') ? api('pipeline', 'board').then(b => { PIPE = b.stages; }).catch(() => { }) : null]); /* PIPE: which step group each stage is in (the progress strip) */
  const w = canW('customers'), p0 = tl.progress[tl.progress.length - 1];
  const val = (k, t) => { const v = c[k]; if (v === null || v === undefined || v === '') return ''; return t === 'date' ? new Date(String(v).replace(' ', 'T') + 'Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : String(v); };
  /* page state shared by the five profile pages (app28.js PFP, app29.js renderPfPage) */
  const st = { c, p: (pl && pl.data) || {}, j: (c.projects && c.projects[0]) || null, prog: p0 || null, pipe: tl.pipe, refs: tl.refs || [], id };
  const pgKeys = PFP.PAGES.map(x => x.key);
  const cnt0 = PFP.counts(pfCtx(st));
  const fillN = {}; /* per page [filled, total], from the All details card below */
  /* To complete: one row per page — number (a tick when every field is in), fill bar, what is due; click = open the page */
  const sumHtml = n => PFP.PAGES.map((pg, i) => { const f = fillN[pg.key] || [0, 0], pc = f[1] ? Math.round(f[0] / f[1] * 100) : 100, need = n[pg.key] > 0, ok = !need && f[0] >= f[1];
    return `<button class="ovw-tr${need ? ' need' : ok ? ' ok' : ''}" data-goto="${esc(pg.key)}" title="${f[0]} of ${f[1]} filled · open this page"><span class="ovw-no">${ok ? '<i class="i i-check"></i>' : i + 1}</span><span class="ovw-tn">${esc(pg.tab)}</span><span class="ovw-bar"><i style="width:${pc}%"></i></span><span class="ovw-ts">${need ? `${n[pg.key]} missing` : ok ? 'Complete' : `Nothing due yet · ${f[0]}/${f[1]}`}</span><i class="i i-chev ovw-go"></i></button>`; }).join('');
  const missAll = pgKeys.reduce((a, k) => a + (+cnt0[k] || 0), 0);
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
      return `<div class="pfa-f${v ? '' : ' pfa-e'}${v && String(v).length > 34 ? ' pfa-w' : ''}"><span>${esc(l)}</span>${!v ? '<em class="mut">—</em>' : pfMasked(v) ? `<b>${esc(v)}</b>` : pfCopy(v, l)}</div>`;
    }).join('');
    fillN[pg.key] = [filled, fs.length];
    return cells ? `<div class="pfa-s"><button class="pfa-h" data-goto="${esc(pg.key)}" title="Open this page"><span class="ovw-no">${i + 1}</span>${esc(pg.tab)}<small>${filled} of ${fs.length} filled</small><i class="i i-chev"></i></button><div class="pfa-g">${cells}</div></div>` : '';
  }).join('');
  const allCard = `<div class="card pfc pfa${pfaHide() ? ' pfa-hide' : ''}">${ovwHead('user', 'All details', `<small class="mut ovw-hint">Click a value to copy it</small><button class="btn sec sm" id="pfaem">${pfaHide() ? 'Show empty' : 'Hide empty'}</button><button class="btn sec sm" id="pfacp"><i class="i i-copy"></i> Copy all</button>`)}${allSecs}</div>`;
  /* Location (redesign 2026-11-24): map beside the address on a wide card (stacked when narrow), values label-over-value, click to copy */
  const ml = mapsLink(c), hasPin = c.lat && c.lng;
  const lf = (l, v, cp = v) => `<div class="ovw-f"><span>${l}</span>${v ? `<button class="pfv" data-cp="${esc(cp)}" data-l="${esc(l.toLowerCase())}" title="Click to copy">${esc(v)}<i class="i i-copy"></i></button>` : '<em class="mut">—</em>'}</div>`;
  const locCard = `<div class="card pfc">${ovwHead('target', 'Location', w ? '<button class="btn sec sm" id="pfloc"><i class="i i-pencil"></i> ' + (hasPin ? 'Change' : 'Set location') + '</button>' : '')}
     <div class="ovw-loc${hasPin ? ' map' : ''}">${hasPin ? `<iframe class="pfmap" loading="lazy" title="Map" referrerpolicy="strict-origin" src="https://www.openstreetmap.org/export/embed.html?bbox=${+c.lng - .004},${+c.lat - .0025},${+c.lng + .004},${+c.lat + .0025}&layer=mapnik&marker=${c.lat},${c.lng}"></iframe>` : `<p class="ovw-empty"><i class="i i-pin"></i><span>No map pin yet.${w ? ' Use <b>Set location</b> at the site, or paste a Google Maps link.' : ''}</span></p>`}
      <div class="ovw-ld">${lf('Address', c.address ? pfaLine(c.address) : '', c.address)}${lf('Landmark', c.landmark || '')}${hasPin ? lf('Coordinates', `${c.lat}, ${c.lng}`, `${c.lat},${c.lng}`) : ''}</div></div>
     ${ml ? `<div class="pfshare"><a class="btn sm" href="${ml}" target="_blank"><i class="i i-target"></i> Open in Maps</a>${hasPin ? `<a class="btn sec sm" href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}" target="_blank">Directions</a>` : ''}
       <button class="btn sec sm" data-cp="${esc(ml)}" data-l="map link"><i class="i i-copy"></i> Copy link</button>${BA() ? '' : '<button class="btn sec sm" id="pfwa"><i class="i i-whatsapp"></i> WhatsApp</button>'}${navigator.share ? '<button class="btn sec sm" id="pfsh"><i class="i i-link"></i> Share</button>' : ''}</div>` : ''}</div>`;
  /* Progress (redesign 2026-11-24): one bar split into Registration · Execution · Closure, each part as wide as its number of steps and
     filled up to the current step; under it Now (stage, days in it) and Next, and a button to the project. The full step list folds
     open (remembered per browser in localStorage pfAllSteps). No step groups known (no projects access) = one plain bar. */
  const stepsOpen = (() => { try { return localStorage.pfAllSteps === '1'; } catch (e) { return false; } })();
  const prog = tl.progress.map(p => { const pct = p.idx < 0 ? 0 : Math.round((p.idx + 1) / p.total * 100), grp = l => typeof stepOf === 'function' ? stepOf(l) : 0;
    const cur = p.stages[p.idx] || {}, nx = p.stages[p.idx + 1], g0 = grp(p.stage), fin = p.stage === 'Project completed', dIn = cur.at ? Math.max(0, Math.floor((Date.now() - Date.parse(String(cur.at).replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(cur.at) ? '' : 'Z'))) / 864e5)) : null;
    let segs = [[1, 'Registration'], [2, 'Execution'], [3, 'Closure']].map(([n, l]) => { const ix = p.stages.map((s, i) => grp(s.label) === n ? i : -1).filter(i => i >= 0);
      return { n, l, size: ix.length, k: fin ? ix.length : ix.filter(i => i <= p.idx).length }; }).filter(s => s.size);
    if (!segs.length) segs = [{ n: g0, l: 'Progress', size: p.total, k: fin ? p.total : p.idx + 1 }];
    const ttl = esc(p.title || 'Project') + (p.kw && !String(p.title || '').includes(p.kw + ' kW') ? ` <span class="mut u-fw400">· ${p.kw} kW</span>` : '');
    return `<div class="card pfprog">${ovwHead('project', `<a href="#/projects/${p.id}">${ttl}</a>`, `<span class="ovw-meta">Step ${p.idx + 1} of ${p.total} · ${pct}%</span>`)}
      <div class="ovw-seg">${segs.map(s => { const st = s.k >= s.size ? 'full' : s.n === g0 && !fin ? 'now' : ''; return `<div class="ovw-sg ${st}" style="flex:${s.size}"><div class="ovw-st"><i style="width:${Math.round(s.k / s.size * 100)}%"></i></div><div class="ovw-sl">${st === 'full' ? '<i class="i i-check"></i>' : ''}<b>${s.l}</b><small>${s.k}/${s.size}</small></div></div>`; }).join('')}</div>
      <div class="ovw-now">${fin ? `<div class="ovw-nc fin"><span>Status</span><b><i class="i i-check"></i> Project completed</b></div>` : `<div class="ovw-nc"><span>Now</span><b>${esc(p.stage || '—')}</b>${dIn !== null ? `<small>${dIn ? dIn + (dIn === 1 ? ' day' : ' days') + ' in this step' : 'Since today'}</small>` : ''}</div>${nx ? `<div class="ovw-nc"><span>Next</span><b>${esc(nx.label)}</b></div>` : ''}`}
        <a class="btn ${fin ? 'sec ' : ''}sm ovw-open" href="#/projects/${p.id}">Open project <i class="i i-chev"></i></a></div>
      <div class="ovw-pf"><button type="button" class="pfall" data-allsteps aria-expanded="${stepsOpen}">${stepsOpen ? 'Hide steps' : `All ${p.total} steps`}</button></div>
      <div class="pfsteps"${stepsOpen ? '' : ' hidden'}>${p.stages.map((s, i) => `<div class="pfs ${i < p.idx || (s.paid && i !== p.idx) ? 'ok' : i === p.idx ? 'cur' : ''}" title="${esc(s.label)}${s.paid ? ' · paid ' + fdate(s.paid) : s.at ? ' · ' + tlTime(s.at).day + ' ' + tlTime(s.at).time : ''}"><span></span><b>${esc(s.label)}</b>${s.paid ? `<small>Paid ${fdate(s.paid)}</small>` : s.at ? `<small>${tlTime(s.at).day.replace(/^\w+, /, '')}</small>` : ''}</div>`).join('')}</div></div>`; }).join('');
  /* Timeline: day headings say Today / Yesterday */
  const dLbl = d => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), dToday = dLbl(new Date()), dYday = dLbl(new Date(Date.now() - 864e5));
  let lastDay = '';
  const tline = tl.events.map(e => { const t = tlTime(e.ts, e.local), head = t.day !== lastDay ? `<div class="tlday">${t.day === dToday ? 'Today' : t.day === dYday ? 'Yesterday' : t.day}</div>` : ''; lastDay = t.day;
    return `${head}<div class="tle k-${e.kind}"><div class="tlt">${t.time}</div><div class="tld"><i class="i i-${TL_ICON[e.kind] || 'dots'}"></i></div><div class="tlb"><b>${e.link ? `<a href="${e.link}">${esc(e.title)}</a>` : e.file ? `<a href="api.php?m=files&a=get&id=${e.file}" target="_blank">${esc(e.title)}</a>` : esc(e.title)}</b>${e.detail ? `<div class="tlx">${esc(e.detail)}</div>` : ''}${e.user ? `<small class="mut">by ${esc(e.user)}</small>` : ''}</div></div>`; }).join('');
  const initials = (c.name || '?').split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
  const canOwn = w && OWN.canReassign(c.owner_id, ME); // owner chip; the owner, admin or assistant manager can reassign
  /* header (redesign 2026-11-24): identity + status line (stage, capacity, customer since) · actions · key facts as label-over-value
     columns (click a value to copy) · the four group tabs at the card's foot; the group's own views sit under the card */
  const own = `<span class="own${+c.owner_id === +ME.id ? ' me' : ''}" title="Customer owner"><i class="i i-user"></i>${+c.owner_id ? esc(ownLabel(c.owner_id, c.owner_name)) : 'No owner'}</span>${canOwn ? `<button class="owbtn" id="pfown">${+c.owner_id ? 'Reassign' : 'Set owner'}</button>` : ''}`;
  const fact = (lbl, inner) => `<div class="cuh-f"><span class="cuh-fl">${lbl}</span><div class="cuh-fv">${inner}</div></div>`;
  const cpv = (v, l) => `<button class="pfv inl" data-cp="${esc(v)}" data-l="${l}" title="Click to copy">${esc(v)}<i class="i i-copy"></i></button>`;
  const kw = p0 && +p0.kw ? +p0.kw : +((c.projects || []).find(j => +j.kw) || {}).kw || 0, since = val('created', 'date');
  const meta = [kw ? ['sun', `${kw} kW`] : 0, since ? ['calendar', `Customer since ${since}`] : 0].filter(Boolean).map(([ic, t]) => `<span class="cuh-m"><i class="i i-${ic}"></i>${esc(t)}</span>`).join('');
  const tabsH = pfTabsHtml([['overview', 'Overview', 'user'], ...PFP.PAGES.map((pg, i) => [pg.key, pg.tab, pg.icon, i + 1]), ...(canR('files') ? [['docs', 'Documents', 'file', 0, c.files.length]] : []), ['ksebl', 'KSEB login', 'lock'], ['warranty', 'Warranty card', 'shield'], ['mnre', 'MNRE warranty card', 'award'], ...(ME.role === 'admin' ? [['pay', 'Payments', 'card']] : []), ...(FIN() ? [['tax', 'Tax bill', 'receipt']] : []), ...(ME.role === 'admin' ? [['ps', 'Purchases and services', 'coin'], ['comm', 'Commission / Incentive', 'users']] : [])], pgKeys, cnt0);
  $('#main').innerHTML = `
   <div class="card cuh"><div class="cuh-top"><div class="cuh-av" aria-hidden="true">${esc(initials)}</div>
     <div class="cuh-id"><h2>${esc(c.name)}</h2><div class="cuh-meta">${p0 ? pill(p0.stage, typeof stepCls === 'function' ? stepCls(p0.stage) : '') : pill('No project yet')}${typeof feasSpot === 'function' ? feasSpot(c.id) : ''}${meta}</div></div>
     <div class="cuh-act">${c.phone ? `<a class="btn call" href="tel:${esc(c.phone)}"><i class="i i-phone"></i> Call</a>${BA() ? '' : `<button class="btn sec" id="wa"><i class="i i-whatsapp"></i> WhatsApp</button>`}` : ''}<button class="btn sec" id="dsc">${discBtnLabel(id)}</button><button class="btn sec cuh-more" id="pfmore" title="More: edit, project cost, KYC PDF…" aria-label="More actions"><i class="i i-dots"></i></button></div></div>
    <div class="cuh-facts">${c.phone ? fact('Phone', cpv(c.phone, 'phone')) : ''}${c.consumer_no ? fact('Consumer no.', cpv(c.consumer_no, 'consumer no.')) : ''}${c.kseb_section ? fact('KSEB section', esc(c.kseb_section)) : ''}${c.district ? fact('District', esc(c.district)) : ''}${fact('Owner', own)}</div>
    ${tabsH.tabs}${tabsH.subs}</div>
   <div id="pfbody"></div>
   <div class="pfgrid" ${PFT === 'overview' ? '' : 'hidden'}>
    <div class="pfleft">${prog || `<div class="card pfprog">${ovwHead('project', 'Progress', canW('projects') ? '<button class="btn sm" id="np">+ New project</button>' : '')}<p class="ovw-empty"><i class="i i-project"></i><span>No project yet.</span></p></div>`}
     <div class="card pfc pftodo">${ovwHead('clipboard', 'To complete', missAll ? `<span class="ovw-badge need">${missAll} missing</span>` : '<span class="ovw-badge ok"><i class="i i-check"></i> Nothing missing</span>')}<div id="ppsum" class="ovw-todo">${sumHtml(cnt0)}</div></div>
     ${pfQuoteCard(c).replace('class="card', 'class="card pfqc')}${locCard.replace('class="card pfc"', 'class="card pfc pfloc"')}
     ${c.notes ? `<div class="card pfc pfnotes">${ovwHead('note', 'Notes')}<div class="ovw-note">${esc(c.notes)}</div></div>` : ''}</div>
    <div class="pfright"><div class="card pftl">${ovwHead('clock', 'Timeline', `<span class="ovw-meta">${tl.events.length} ${tl.events.length === 1 ? 'event' : 'events'}</span>`)}
      <div class="tladd"><input id="tln" placeholder="Add an update or note… (Enter to save)" aria-label="Add an update or note"><button class="btn sm" id="tlnb">Add</button></div>
      <div class="tl">${tline || '<p class="mut">Nothing yet.</p>'}</div></div></div>
    ${allCard}
    </div>`;
  // click to copy
  $$('[data-cp]').forEach(b => b.onclick = e => { e.preventDefault(); copyText(b.dataset.cp, b.dataset.l || ''); b.classList.add('ok'); setTimeout(() => b.classList.remove('ok'), 900); });
  if ($('#pfaem')) $('#pfaem').onclick = e => { const on = !pfaHide(); try { localStorage.pfaHide = on ? '1' : '0'; } catch (er) { } $('.pfa').classList.toggle('pfa-hide', on); e.currentTarget.textContent = on ? 'Show empty' : 'Hide empty'; };
  if ($('#pfacp')) $('#pfacp').onclick = () => copyText(allTxt.join(String.fromCharCode(10)), 'all details');
  // location sharing
  const locText = () => `${c.name}${c.landmark ? ' — ' + c.landmark : ''}\n${[c.address, c.district].filter(Boolean).join(', ')}\n${ml}`;
  if ($('#pfwa')) $('#pfwa').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(locText()), '_blank');
  if ($('#pfsh')) $('#pfsh').onclick = () => navigator.share({ title: c.name + ' — location', text: locText(), url: ml }).catch(() => { });
  if ($('#pfloc')) $('#pfloc').onclick = () => locModal(c, id);
  // actions
  $('#dsc').onclick = () => discOpen(id);
  if ($('#wa')) $('#wa').onclick = () => waOpen({ name: c.name, phone: c.phone, customer_id: id });

  /* Expense: the latest project's Project cost sheet (c.projects is newest first) */

  if ($('#np')) $('#np').onclick = () => startModal({ customer_id: id });
  if ($('#nq')) $('#nq').onclick = () => { sessionStorage.lead2quote = JSON.stringify({ customer_id: id, name: c.name }); location.hash = '#/quotes/new'; };
  /* the approved quotation (the copy the customer agreed to): kept in Documents until an admin deletes it */
  if ($('#nqu')) $('#nqu').onclick = async () => { const f = await pickFile('application/pdf,image/jpeg,image/png,image/webp'); if (!f) return;
    const fd = new FormData(); fd.append('customer_id', id); fd.append('kind', 'approved'); fd.append('file', f);
    try { await api('files', 'upload', fd); toast('Approved quotation saved in Documents'); if (typeof DOC_STALE !== 'undefined') DOC_STALE.add(+id); route(); } catch (e) { } };
  /* the Quotations card's signature buttons (app52.js); a change redraws the profile */
  $$('.pfqc').forEach(card => qsBind(card, qid => { const q = c.quotes.find(x => +x.id === +qid); return q && Object.assign({ customer_id: id }, q); }, { name: c.name, phone: c.phone, email: c.email }, () => route()));
  if ($('#up')) $('#up').onclick = () => docUploadModal(c, id);
  const addNote = async () => { const t = $('#tln').value.trim(); if (!t) return; await api('notes', 'add', { entity: 'customers', entity_id: id, text: t }); route(); };
  $('#tlnb').onclick = addNote; $('#tln').onkeydown = e => { if (e.key === 'Enter') addNote(); };
  // tabs
  /* a page save: refresh the red counts on the tabs and the Overview card, without reloading the profile */
  const bindGoto = () => $$('[data-goto]').forEach(b => b.onclick = () => { showTab(b.dataset.goto); scrollTo({ top: 0, behavior: 'smooth' }); });
  const refresh = () => route();
  /* Purchases and services (admin only): a read-only view of the project's purchases and services, no money (app34.js acProfileTab); editing is in Accounts › Project cost */
  const showTab = (k, edit) => { if (k === 'ps' && PFT === 'ps' && $('#acx_psb')) return; if (!acLeaveOk()) return; acLeft(); if ((k === 'ps' || k === 'comm' || k === 'pay') && ME.role !== 'admin') k = 'overview'; PFT = k; $$('[data-pt]').forEach(b => b.classList.toggle('on', b.dataset.pt === k)); pfTabsShow(k); $('.pfgrid').hidden = k !== 'overview'; const box = $('#pfbody'); box.innerHTML = '';
    if (k === 'plant') renderPlant(box, st.c, id, !!edit, st, refresh);
    else if (pgKeys.includes(k)) renderPfPage(box, st, k, !!edit, refresh);
    if (k === 'ksebl' && typeof renderKsebLogin === 'function') renderKsebLogin(box, st.c, id);
    if (k === 'docs') renderDocs(box, st.c, id); if (k === 'warranty') renderWarranty(box, st.c, id); if (k === 'mnre') renderMnre(box, st.c, id); if (k === 'tax') renderTax(box, st.c, id); if (k === 'pay') payTab(box, st.c, id); if (k === 'ps') acProfileTab(box, st.c, id); if (k === 'comm') commProfileTab(box, st.c, id); };
  $$('[data-pt]').forEach(b => b.onclick = () => showTab(b.dataset.pt));
  $$('[data-pg]').forEach(b => b.onclick = () => { const g = PFG.find(x => x[0] === b.dataset.pg), keys = $$(`[data-sub-of="${g[0]}"] [data-pt]`).map(x => x.dataset.pt); showTab(g[0] === 'overview' ? 'overview' : (keys.includes(PFG_LAST[g[0]]) ? PFG_LAST[g[0]] : keys[0])); });
  bindGoto();
  $$('[data-allsteps]').forEach(b => b.onclick = () => { const box = b.closest('.pfprog').querySelector('.pfsteps'), on = box.hidden; box.hidden = !on; b.setAttribute('aria-expanded', on); b.textContent = on ? 'Hide steps' : `All ${box.children.length} steps`; try { localStorage.pfAllSteps = on ? '1' : '0'; } catch (e) { } });
  if (PFT !== 'overview') showTab(PFT, openEdit === PFT);
  feeMembers(id);
  if ($('#pfown')) $('#pfown').onclick = async () => { if (acLeaveOk() && await reassignBox('customers', c)) { acLeft(); route(); } };
  /* KYC PDF, Edit and Project cost are in the ⋯ menu (kycDownload in app45.js) */
  $('#pfmore').onclick = e => { e.stopPropagation(); const old = $('#lmenu'); if (old) { old.remove(); return; }
    const items = [w ? ['ed', 'pencil', 'Edit details'] : null, canR('accounts') ? ['exp', 'coin', 'Project cost'] : null, ['kyc', 'download', 'KYC PDF (every detail)'], canW('projects') && tl.progress.length ? ['np2', 'project', '+ New project'] : null, canOwn ? ['own', 'users', +c.owner_id ? 'Reassign owner' : 'Set owner'] : null, w && canW('leads') && !BA() ? ['rv', 'refresh', 'Revert to lead'] : null, ...feeMenuItems(id), w && !BA() ? ['dl', 'trash', 'Delete customer'] : null].filter(Boolean);
    const m = document.createElement('div'); m.id = 'lmenu'; m.className = 'card menu'; m.innerHTML = items.map(([a, i, t]) => `<button data-m="${a}"><i class="i i-${i}"></i>${t}</button>`).join('') || '<p class="mut" style="margin:6px">No actions</p>';
    document.body.appendChild(m); const r = e.currentTarget.getBoundingClientRect(); m.style.top = (r.bottom + 6 + scrollY) + 'px'; m.style.left = Math.max(8, r.right - m.offsetWidth) + 'px';
    $$('[data-m]', m).forEach(b => b.onclick = async () => { m.remove(); const a = b.dataset.m; if (await feeMenuRun(a, { id, name: c.name })) return;
      if (a === 'ed') return showTab(pgKeys.includes(PFT) ? PFT : 'kseb', true);
      if (a === 'exp') { const j = (c.projects || [])[0]; if (j && +j.id) location.hash = '#/accounts/cost/' + +j.id; else toast('Start a project for this customer first', true); return; }
      if (a === 'kyc') return kycDownload(st, tl, $('#pfmore'));
      if (a === 'np2') startModal({ customer_id: id });
      if (a === 'own' && acLeaveOk() && await reassignBox('customers', c)) { acLeft(); route(); }
      if (a === 'rv') revertToLead(id, c.name);
      if (a === 'dl' && await ask('Delete this customer and all their projects, quotes and files?\n\nIt goes to the Recycle bin and can be restored for ' + RULE('trash_hours') + ' hours.')) { await api('customers', 'delete', { id }); toast('Moved to Recycle bin'); location.hash = '#/customers'; } });
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
  const m = modal(`<h2 class="u-mt0">Customer location</h2>
    <button class="btn" id="lcgps" style="width:100%;justify-content:center"><i class="i i-target"></i> Use my current location (at the site)</button>
    <div class="mut" style="text-align:center;margin:10px 0;font-size:13px">— or —</div>
    <label>Paste a Google Maps link or coordinates</label><input id="lcp" placeholder="https://maps.google.com/… or 8.6037, 76.9977" value="${c.lat && c.lng ? c.lat + ', ' + c.lng : ''}">
    <div class="mut" id="lcok" style="font-size:12px;margin-top:4px"></div>
    <label class="u-mt10">Landmark</label><input id="lcl" placeholder="e.g. Near Govt. LP School, opposite temple" value="${esc(c.landmark || '')}" maxlength="120">
    <div class="bar u-mt14"><button class="btn" id="lcsv">Save location</button><button class="btn sec" id="lcx">Cancel</button>${c.lat ? '<span class="sp"></span><button class="btn sec" id="lcclr">Remove pin</button>' : ''}</div>`);
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
  $$('[data-pd]', box).forEach(b => b.onclick = async () => { const [, x] = payOf(b.dataset.pd); if (!x || !await ask(`Delete the payment of ${inr(x.amount)} on ${dmy(x.date)}?\n\nIt goes to the Recycle bin for ${RULE('trash_hours')} hours.`)) return;
    try { await api('payments', 'delete', { id: x.id }); toast('Payment moved to the Recycle bin'); redraw(); } catch (er) { } });
  /* Show in Accounts: on by default. Off takes the customer off the Accounts lists; nothing else changes. */
  $('#pczshow', box).onchange = async e => { const on = e.target.checked; e.target.disabled = true;
    try { await api('acc', 'track_show', { customer_id: id, show: on ? 1 : 0 }); toast(on ? `${c.name} shows in Accounts` : `${c.name} is taken off Accounts`); redraw(); } catch (er) { e.target.checked = !on; e.target.disabled = false; } };
  $$('[data-done]', box).forEach(b => b.onclick = async () => { const done = b.dataset.done === '1', body = { customer_id: id, done: done ? 1 : 0 };
    if (done && !full) { if (!await ask(has ? `${inr(s.balance)} is still pending for ${c.name}.\n\nMove to Completed anyway?` : `No plant cost is entered for ${c.name}.\n\nMove to Completed anyway?`)) return; body.force = 1; }
    b.disabled = true; try { await api('acc', 'track_set', body); toast(c.name + (done ? ' moved to Completed' : ' moved back to In progress')); redraw(); } catch (er) { b.disabled = false; } });
  $('#pczed', box).onclick = () => {
    const m = modal(`<h2 class="u-mt0">Plant cost</h2><div class="two"><div><label>Total plant cost (₹)</label><input id="pczc" inputmode="numeric" autocomplete="off" value="${s.agreed > 0 || has ? (multi ? s.agreed || '' : s.cost).toLocaleString('en-IN') : ''}"></div>
      <div><label>KSEB charges</label><select id="pczx"><option value="0">Included in the plant cost</option><option value="1" ${s.kseb_extra ? 'selected' : ''}>Additional (paid on top)</option></select></div>
      <div class="full" id="pczab" ${s.kseb_extra ? '' : 'hidden'}><label>KSEB charges amount (₹) — leave empty if it is not known yet</label><input id="pcza" inputmode="numeric" autocomplete="off" value="${s.kseb_extra_amt > 0 ? s.kseb_extra_amt.toLocaleString('en-IN') : ''}"></div></div>
      <p class="mut" style="font-size:12.5px;margin:10px 0 0">${multi ? `This customer has ${s.projects.length} projects. Each project keeps its own value (edit it on the project); the figure here is the cost agreed in the approved quotation.` : s.projects.length ? 'The project’s value follows this figure, so Accounts and the tax bill agree.' : 'A project started for this customer takes this figure as its value.'}</p>
      <div class="bar u-mt14"><button class="btn" id="pczsv">Save</button><button class="btn sec" id="pczcx">Cancel</button></div>`);
    $('#pczx', m).onchange = e => { $('#pczab', m).hidden = e.target.value !== '1'; };
    $('#pczcx', m).onclick = () => m.remove();
    $('#pczsv', m).onclick = async e => { const cost = onbNum($('#pczc', m).value); if (!(cost > 0)) return toast('Enter the total plant cost', true); const b = e.currentTarget; b.disabled = true;
      try { await api('profile', 'cost_save', { customer_id: id, plant_cost: cost, kseb_extra: $('#pczx', m).value === '1' ? 1 : 0, kseb_extra_amt: onbNum($('#pcza', m).value) }); m.remove(); toast('Plant cost saved'); redraw(); } catch (x) { b.disabled = false; } };
  };
  $('#pczup', box).onclick = async () => { const f = await pickFile('application/pdf,image/jpeg,image/png,image/webp'); if (!f) return;
    const fd = new FormData(); fd.append('customer_id', id); fd.append('kind', 'approved'); fd.append('file', f);
    try { await api('files', 'upload', fd); toast('Approved quotation saved in Documents'); if (typeof DOC_STALE !== 'undefined') DOC_STALE.add(+id); redraw(); } catch (e) { } };
}

/* Customer profile > Overview > Quotations: the approved quotations that were uploaded and the quotations made in the CRM,
   each with who uploaded / made / changed it. Upload and Create need the Quotations edit right. */
/* Overview card heading (redesign 2026-11-24): a neutral icon tile, the title, then anything on the right (count, badge, buttons) */
const ovwHead = (icon, title, right = '') => `<div class="pfch ovw-h"><span class="ovw-ic"><i class="i i-${icon}"></i></span><h3>${title}</h3><span class="sp"></span>${right}</div>`;
function pfQuoteCard(c) {
  const w = canW('quotes'), ap = (c.files || []).filter(f => f.kind === 'approved');
  const who = (word, name, when) => word + (name ? ' by ' + esc(name) : '') + (when ? ' · ' + dmy(when) : '');
  /* one row each: file/quote tile · number + status · who and when · amount on the right · Modify */
  const A = ap.map(f => `<div class="pfq ovw-q"><span class="ovw-qi"><i class="i i-file"></i></span><div class="pfq-m"><div class="ovw-qt"><a href="api.php?m=files&a=get&id=${+f.id}&v=1" target="_blank" rel="noopener">${esc(f.name)}</a>${pill('Approved', 'g')}</div><small class="mut">${who('Uploaded', f.by_name, f.created)} · in Documents</small></div></div>`);
  const Q = c.quotes.map(q => { const ch = q.updated && q.created && q.updated.slice(0, 16) !== q.created.slice(0, 16);
    /* signed quotations (app52.js): the badge, then View / Download / Share the signed PDF, or Ask admin to sign / Review & sign */
    const sg = qsOf(q), acts = qsBtns(QSIGN.can(sg, ME, q, w), q, { dl: true });
    return `<div class="pfq ovw-q"><span class="ovw-qi"><i class="i i-receipt"></i></span><div class="pfq-m"><div class="ovw-qt"><a href="#/quotes/${q.id}">${esc(q.number)}</a>${pill(q.status, stageCls(q.status))}${qsBadge(sg)}</div><small class="mut">${who('Created', q.made_name, q.created || q.date)}${ch ? ' · ' + who('Modified', q.edit_name, q.updated) : ''}</small>${acts ? `<div class="qsg-acts">${acts}</div>` : ''}</div>${q.total != null ? `<b class="ovw-amt">${inr(q.total)}</b>` : ''}${w ? `<a class="btn sec sm" href="#/quotes/${q.id}" title="Open this quotation and change it. When it is saved, the new PDF replaces the copy in Documents."><i class="i i-pencil"></i> Modify</a>` : ''}</div>`; });
  return `<div class="card pfc">${ovwHead('receipt', 'Quotations', w ? '<span class="pfq-h ovw-qb"><button class="btn sec sm" id="nqu" title="Upload the quotation the customer approved (PDF or photo). It is kept in Documents."><i class="i i-upload"></i> Upload approved quotation</button><button class="btn sm" id="nq"><i class="i i-plus"></i> Create quotation</button></span>' : '')}${A.join('') + Q.join('') || '<p class="ovw-empty"><i class="i i-receipt"></i><span>No quotations yet.</span></p>'}</div>`;
}
