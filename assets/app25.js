// Two pages on this code ("books", KD_BOOKS): KSEB documentation (#/kseb, #/kseb/<customerId>; its Agreement tab is the KSEB
// net metering agreement, which can also fill empty profile fields) and Bank documentation
// (#/bank/<customerId>: the loan papers, feasibility report and vendor–customer agreement).
// A document tab: customer picker, the document's fields (KD.DOCS in app24.js) on the left, a live A4 preview on the right,
// Save and Download PDF. pdf-lib (loaded on first use) writes the text onto the template PDF in the browser.
// Saving rule: only the fields that differ from the profile are stored (KD.overrides), plus the date, so a corrected
// profile prints corrected. UI classes start with .kd (assets/kseb.css). Every value shown in HTML goes through esc().
const KDS = { book: 'kseb', tok: 0, nav: -1, id: null, g: null, err: '', cs: null, csP: null, mP: null, measure: null, vals: {}, defs: {}, base: {}, lay: {}, busy: false, pv: false, t: 0, ro: null, hash: '' };
const KD_TABS = [['cov', 'Cover page'], ['req', 'Request letter'], ['wcr', 'Work completion report'], ['an1', 'Annexure 1'], ['an2', 'Annexure 2'], ['an3', 'Annexure 3'], ['doi', 'Details of installation'], ['agr', 'Agreement'], ['chk', 'Checklist sheet'], ['mnre', 'MNRE warranty card']];
const BK_TABS = [['bfr', 'Feasibility report'], ['bag', 'Vendor–customer agreement']];
const KD_BOOKS = {
  kseb: { tabs: KD_TABS, def: 'wcr', api: 'kseb', perm: 'checklist', hash: '#/kseb/', what: 'profile and plant details' },
  bank: { tabs: BK_TABS, def: 'bfr', api: 'bank', perm: 'loans', hash: '#/bank/', what: 'profile, plant details and tax bill' }
};
const KB = () => KD_BOOKS[KDS.book] || KD_BOOKS.kseb;
const KD_FONT = { T: "'Times New Roman',Times,serif", TB: "'Times New Roman',Times,serif", H: 'Arial,Helvetica,sans-serif', HB: 'Arial,Helvetica,sans-serif' };
const kdT = v => String(v ?? '').trim();
const kdOn = () => !!$('#kd');
const kdTab = () => { const B = KB(); return B.tabs.some(t => t[0] === TAB[KDS.book]) ? TAB[KDS.book] : B.def; };
const kdDoc = () => { const t = kdTab(); return KD.DOCS[t] ? t : null; }; /* null on the MNRE warranty card tab */
const kdFields = doc => KD.DOCS[doc].groups.flatMap(gr => gr.fields.map(f => Object.assign({ g: gr.g }, f)));
const kdCtx = g => ({ customer: g.customer || {}, plant: g.plant || {}, project: g.project || null, defaults: g.defaults || {}, items: S.kseb_items || [], bill: g.bill || null, company: g.company || null, today: today() });
/* api() already showed its own errors; anything else becomes a red toast */
const kdErr = e => { if (!e || !e.error) { console.error(e); toast((e && e.message) || String(e), true); } };

/* ---- pdf-lib, font metrics and template PDFs: each loaded once ---- */
let KD_LIBS = null;
const kdLibs = () => KD_LIBS = KD_LIBS || (window.PDFLib ? Promise.resolve() : qpScript('assets/vendor/pdf-lib-1.17.1.min.js'))
  .then(() => { if (!window.PDFLib) throw new Error('Could not load the PDF library'); return window.PDFLib; })
  .catch(e => { KD_LIBS = null; throw e; });
const kdMeasure = () => KDS.mP = KDS.mP || kdLibs().then(L => KD.measurer(L)).then(m => (KDS.measure = m)).catch(e => { KDS.mP = null; throw e; });
const KD_TPL = {};
const kdTpl = page => KD_TPL[page] = KD_TPL[page] || fetch(KD.PAGES[page].pdf, { credentials: 'same-origin' })
  .then(r => { if (!r.ok) throw new Error('Could not load the document template'); return r.arrayBuffer(); })
  .catch(e => { delete KD_TPL[page]; throw e; });

const pgKseb = id => kdOpen('kseb', id);
const pgBank = id => kdOpen('bank', id);
async function kdOpen(book, id) {
  /* each load gets a token: the answer for a customer you already switched away from (or a page you left) is dropped */
  const nav = ROUTE_N, tok = ++KDS.tok, within = KDS.nav === nav - 1 && KDS.book === book; /* within: the last navigation was this page too (a customer switch) */
  KDS.nav = nav; KDS.hash = location.hash; KDS.book = book;
  id = Number.isInteger(id) && id > 0 ? id : null;
  const cust = canR('customers');
  if (cust && (!within || !KDS.csP)) { KDS.cs = null; KDS.csP = list('customers').then(r => (KDS.cs = Array.isArray(r) ? r : []), () => (KDS.cs = [])); }
  if (cust) kdMeasure().then(() => { if (kdOn()) kdLayout(); }, e => { const p = $('#kdpage'); if (p) p.innerHTML = `<p class="kd-load">${esc(e.message || 'Could not load the PDF library')}. Check the connection and reload the page.</p>`; });
  let g = null, err = '';
  if (id && cust) {
    try { g = await api(KB().api, 'get', undefined, '&customer_id=' + id); }
    catch (e) { err = (e && (e.error || e.message)) || 'Could not load this customer'; if (!e || !e.error) console.error(e); }
    if (tok !== KDS.tok || nav !== ROUTE_N) return;
  }
  Object.assign(KDS, { id: g ? id : null, g, err, vals: {}, defs: {}, base: {}, lay: {}, busy: false });
  if (g) kdPrep();
  kdDraw();
}
/* per document: the profile defaults, the values the saved copy prints (base), and the values on screen (kept when present) */
function kdPrep() {
  const g = KDS.g, ctx = kdCtx(g);
  KB().tabs.map(t => t[0]).filter(d => KD.DOCS[d]).forEach(d => {
    const sv = (g.saved || {})[d];
    KDS.defs[d] = KD.defaults(d, ctx);
    KDS.base[d] = KD.values(d, ctx, sv && sv.data);
    if (!KDS.vals[d]) KDS.vals[d] = Object.assign({}, KDS.base[d]);
  });
}

function kdDraw() {
  if (KDS.ro) { KDS.ro.disconnect(); KDS.ro = null; }
  clearTimeout(KDS.t);
  const main = $('#main'), tab = kdTab();
  main.innerHTML = `<div class="kd${KDS.pv ? ' kd-onpv' : ''}" id="kd">${tabsBar(KDS.book, KB().tabs, KB().def)}<div id="kdbody"></div></div>`;
  bindTabs(KDS.book, kdDraw);
  const body = $('#kdbody');
  /* MNRE warranty card: the same certificate as the customer profile's tab (renderMnre, app18.js) for the customer picked here */
  body.innerHTML = tab === 'mnre' ? kdMnreHtml() : kdDocHtml(tab);
  const root = $('#kd'), find = $('#kdfind'), res = $('#kdres'), q = $('#kdq');
  root.addEventListener('input', kdOnInput); root.addEventListener('change', kdOnInput);
  root.addEventListener('click', kdOnClick); root.addEventListener('keydown', kdOnKey);
  if (find) {
    res.addEventListener('mousedown', e => e.preventDefault()); /* a click on a result keeps the focus in the search box */
    find.addEventListener('focusout', e => { if (!find.contains(e.relatedTarget)) kdFindClose(); });
    q.addEventListener('focus', kdFind);
    if (!KDS.g && matchMedia('(min-width:821px)').matches) q.focus();
  }
  if (!KDS.g) return;
  if (tab === 'mnre') { renderMnre($('#kdmnre'), Object.assign({}, KDS.g.customer || {}, { id: KDS.id }), KDS.id).catch(kdErr); return; }
  kdMarks(); kdLayout(); kdScale();
  const wr = $('#kdpvs');
  if ('ResizeObserver' in window) { KDS.ro = new ResizeObserver(kdScale); KDS.ro.observe(wr); }
}

function kdMnreHtml() {
  if (!canR('customers')) return '<div class="card kd-hint"><i class="i i-lock"></i><div><b>No access to customers</b><p>The warranty card is filled from the customer profile. Ask an admin for access to Customers.</p></div></div>';
  const g = KDS.g, c = g ? g.customer || {} : null;
  const bar = `<div class="kd-bar card">
    <div class="kd-find" id="kdfind"><i class="i i-search"></i><input id="kdq" type="search" placeholder="Search customer: name, phone or consumer no." autocomplete="off" aria-label="Search customers"><div class="kd-res" id="kdres" hidden></div></div>
    ${g ? `<div class="kd-who"><b>${esc(c.name || 'Customer')}</b><small>${esc([c.phone, c.consumer_no && 'Consumer no. ' + c.consumer_no].filter(Boolean).join(' · '))}</small></div>
    <a class="kd-prof" href="#/customers/${KDS.id}"><i class="i i-user"></i>Open customer profile</a>` : ''}<span class="sp"></span></div>`;
  if (!g) return bar + `<div class="card kd-hint"><i class="i i-search"></i><div><b>Pick a customer</b><p>${KDS.err ? esc(KDS.err) + '. ' : ''}Search by name, phone or consumer number above. Their profile and plant details fill in the MNRE warranty card.</p></div></div>`;
  return bar + '<div id="kdmnre"><p class="mut">Loading…</p></div>';
}
function kdDocHtml(doc) {
  const D = KD.DOCS[doc], g = KDS.g, w = canW(KB().perm);
  if (!canR('customers')) return '<div class="card kd-hint"><i class="i i-lock"></i><div><b>No access to customers</b><p>These documents are filled from the customer profile. Ask an admin for access to Customers.</p></div></div>';
  const c = g ? g.customer || {} : null;
  const bar = `<div class="kd-bar card">
    <div class="kd-find" id="kdfind"><i class="i i-search"></i><input id="kdq" type="search" placeholder="Search customer: name, phone or consumer no." autocomplete="off" aria-label="Search customers"><div class="kd-res" id="kdres" hidden></div></div>
    ${g ? `<div class="kd-who"><b>${esc(c.name || 'Customer')}</b><small>${esc([c.phone, c.consumer_no && 'Consumer no. ' + c.consumer_no].filter(Boolean).join(' · '))}</small></div>
    <a class="kd-prof" href="#/customers/${KDS.id}"><i class="i i-user"></i>Open customer profile</a>` : ''}
    <span class="sp"></span>
    ${g ? `<span class="kd-state" id="kdstate"></span>
    <button type="button" class="btn sec kd-pvt" id="kdpvt"><i class="i i-eye"></i><span>${KDS.pv ? 'Hide' : 'Show'} preview</span></button>
    ${w ? '<button type="button" class="btn sec" id="kdsave">Save</button>' : ''}
    <button type="button" class="btn" id="kdpdf"><i class="i i-download"></i>Download PDF</button>` : ''}</div>`;
  if (!g) return bar + `<div class="card kd-hint"><i class="i i-search"></i><div><b>Pick a customer</b><p>${KDS.err ? esc(KDS.err) + '. ' : ''}Search by name, phone or consumer number above. Their ${KB().what} fill in the ${esc(D.tab.toLowerCase())}.</p></div></div>`;
  const np = kdPageCount(doc);
  return bar + `<div class="kd-split"><div class="kd-left"><p class="kd-empty" id="kdempty" hidden></p>${D.groups.map(gr => kdGroup(doc, gr, w)).join('')}</div>
    <div class="kd-pv" id="kdpv"><div class="kd-pvh"><b>Preview</b><span class="mut" id="kdpvn">${kdPvLabel(doc, np)}</span></div>
     <div class="kd-warn" id="kdwarn" hidden><i class="i i-alert"></i><span>Too much text to fit — shorten the longest field</span></div>
     <div class="kd-pvsc" id="kdpvsc">${kdPagesHtml(doc, np)}</div></div></div>`;
}
const kdPageCount = doc => (KDS.lay[doc] && KDS.lay[doc].pages) || KD.DOCS[doc].pages || 1;
const kdPvLabel = (doc, n) => `A4${n > 1 ? ' · ' + n + ' pages' : ''} · ${esc(KD.DOCS[doc].file)}`;
function kdPagesHtml(doc, n) {
  const P = KD.PAGES[KD.DOCS[doc].page];
  return Array.from({ length: n }, (_, i) => `<div class="kd-pvs"${i ? '' : ' id="kdpvs"'} style="aspect-ratio:${P.w}/${P.h}"><div class="kd-page"${i ? '' : ' id="kdpage"'} style="width:${P.w}px;height:${P.h}px;background-image:url('${P.png}')">${i ? '' : '<p class="kd-load">Loading preview…</p>'}</div></div>`).join('');
}
function kdGroup(doc, gr, w) {
  const share = gr.fields.some(f => f.share);
  return `<section class="kd-sec"><h3>${esc(gr.g)}</h3><div class="kd-grid">${gr.fields.map(f => kdField(doc, f)).join('')}</div>
    ${share ? `<div class="kd-gf"><small>Company details, the same for every customer.</small>${w ? '<button type="button" class="btn sec sm" data-a="def" title="Use the vendor and signatory details shown here for every customer">Save as default</button>' : ''}</div>` : ''}</section>`;
}
function kdField(doc, f) {
  const v = esc(KDS.vals[doc][f.k] ?? ''), id = 'kdf_' + f.k, a = `id="${id}" data-k="${f.k}"`;
  const inp = f.t === 'area' ? `<textarea ${a} rows="${f.rows || 2}">${v}</textarea>`
    : f.t === 'opts' ? `<select ${a}>${f.opts.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}"${ov === KDS.vals[doc][f.k] ? ' selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`
    : f.t === 'date' ? `<div class="kd-date"><input ${a} type="date" value="${v}"><button type="button" class="btn sec sm" data-a="today">Today</button></div><small class="kd-dh" id="kddh"></small>`
    : `<input ${a} value="${v}">`;
  const mark = f.t === 'date' ? '' : `<span class="kd-mark">edited</span><button type="button" class="kd-rs" data-a="reset" data-k="${f.k}" aria-label="Reset ${esc(f.l)}"><i class="i i-undo"></i></button>`;
  return `<div class="kd-f${f.t === 'area' ? ' kd-full' : ''}" data-f="${f.k}"><div class="kd-lh"><label for="${id}">${esc(f.l)}</label>${mark}</div>${inp}</div>`;
}

/* ---- edits: marks, "Still empty", saved state ---- */
function kdOnInput(e) {
  const el = e.target;
  if (el.id === 'kdq') { if (e.type === 'input') kdFind(); return; }
  const doc = kdDoc(), k = el.dataset.k;
  if (!doc || !k || !KDS.vals[doc] || KDS.vals[doc][k] === el.value) return;
  KDS.vals[doc][k] = el.value; kdMarks(); kdLayoutSoon();
}
function kdSet(doc, k, v) {
  KDS.vals[doc][k] = v;
  const el = $('#kdf_' + k); if (el) { el.value = v; el.focus(); }
  kdMarks(); kdLayout();
}
/* KD.empty's labels (field order) grouped as on the form, so "Make" says whose: "SPV module: Make, Type · Inverter: Serial No" */
function kdMissing(doc, v) {
  const miss = KD.empty(doc, v), out = []; let j = 0;
  kdFields(doc).forEach(f => {
    if (j >= miss.length || f.l !== miss[j] || kdT(v[f.k])) return;
    j++;
    const last = out[out.length - 1];
    if (last && last.g === f.g) last.ls.push(f.l); else out.push({ g: f.g, ls: [f.l] });
  });
  return out.map(x => x.g + ': ' + x.ls.join(', ')).concat(miss.slice(j));
}
function kdMarks() {
  const doc = kdDoc(), e = $('#kdempty'); if (!doc || !e || !KDS.vals[doc]) return;
  const v = KDS.vals[doc], d = KDS.defs[doc];
  $$('#kd [data-f]').forEach(el => {
    const k = el.dataset.f, ed = k !== 'date' && kdT(v[k]) !== kdT(d[k]), rs = $('.kd-rs', el);
    el.classList.toggle('kd-ed', ed); el.classList.toggle('kd-miss', k !== 'ref' && !kdT(v[k]));
    if (rs) rs.title = ed ? 'Reset to: ' + (kdT(d[k]) || '(empty)') : '';
  });
  const miss = kdMissing(doc, v);
  e.hidden = !miss.length;
  const toProfile = kdFields(doc).some(f => f.src) && canW('customers');
  e.innerHTML = miss.length ? `<i class="i i-alert"></i><span><b>Still empty:</b> ${esc(miss.join(' · '))}. ${toProfile ? 'Type them here (saving also fills them in the customer profile), fill them in the profile' : 'Fill them in the customer profile'}, or write them by hand on the printout.</span>` : '';
  const sv = (KDS.g.saved || {})[doc], dh = $('#kddh');
  if (dh) dh.textContent = sv && kdT(v.date) && v.date === (sv.data || {}).date && v.date !== today() ? 'The date of the saved copy: reprints keep it.' : '';
  kdState();
}
const kdWhen = sv => { const d = new Date(String(sv.updated || '').replace(' ', 'T') + 'Z');
  return (isNaN(d) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + (sv.updated_by ? ' by ' + sv.updated_by : ''); };
function kdState() {
  const s = $('#kdstate'), doc = kdDoc(); if (!s || !doc || !KDS.g) return;
  const w = canW(KB().perm), sv = (KDS.g.saved || {})[doc], v = KDS.vals[doc], base = KDS.base[doc];
  const dirty = w && kdFields(doc).some(f => kdT(v[f.k]) !== kdT(base[f.k]));
  s.textContent = dirty ? 'Unsaved changes' : sv ? 'Saved ' + kdWhen(sv) : w ? 'Not saved yet' : '';
  s.classList.toggle('kd-dirty', dirty);
}

/* ---- preview: the template picture with one span per text op, in PDF points, scaled to the box width ---- */
function kdLayout() {
  clearTimeout(KDS.t);
  const doc = kdDoc(), pg = $('#kdpage'); if (!doc || !pg || !KDS.g || !KDS.measure) return;
  const L = KDS.lay[doc] = KD.layout(doc, KDS.vals[doc], KDS.measure);
  const rgb = c => c ? `rgb(${c.map(x => Math.round(x * 255)).join(',')})` : '#000';
  const opHtml = o => o.rc ? `<i class="kd-ln" style="left:${o.rc[0]}px;top:${o.rc[1]}px;width:${o.rc[2]}px;height:${o.rc[3]}px;background:${rgb(o.fill)}"></i>`
    : o.ln && o.ln[0] !== o.ln[2] && o.ln[1] !== o.ln[3] /* a slanted line (the tick in a box): a thin bar turned to its angle */
      ? `<i class="kd-ln" style="left:${o.ln[0]}px;top:${o.ln[1] - (o.w || .5) / 2}px;width:${Math.hypot(o.ln[2] - o.ln[0], o.ln[3] - o.ln[1])}px;height:${o.w || .5}px;transform-origin:0 50%;transform:rotate(${Math.atan2(o.ln[3] - o.ln[1], o.ln[2] - o.ln[0])}rad);background:${rgb(o.c)}"></i>`
    : o.ln ? `<i class="kd-ln" style="left:${Math.min(o.ln[0], o.ln[2]) - (o.w || .5) / 2}px;top:${Math.min(o.ln[1], o.ln[3]) - (o.w || .5) / 2}px;width:${Math.abs(o.ln[2] - o.ln[0]) + (o.w || .5)}px;height:${Math.abs(o.ln[3] - o.ln[1]) + (o.w || .5)}px;background:${rgb(o.c)}"></i>`
    : `<span style="left:${o.x}px;top:${+(o.y - 0.8 * o.s).toFixed(2)}px;font:${/B$/.test(o.f) ? '700 ' : ''}${o.s}px ${KD_FONT[o.f]}${o.u ? ';text-decoration:underline' : ''}${o.ws ? kdJust(o) : ''}${o.c ? ';color:' + rgb(o.c) : ''}">${esc(o.t)}</span>`;
  const n = Math.max(1, ...L.ops.map(o => (o.p || 0) + 1));
  if ($$('#kdpv .kd-page').length !== n) { /* the agreement grew or shrank by a page */
    $('#kdpvsc').innerHTML = kdPagesHtml(doc, n); $('#kdpvn').innerHTML = kdPvLabel(doc, n); kdScale();
    if (KDS.ro) { KDS.ro.disconnect(); KDS.ro.observe($('#kdpvs')); }
  }
  $$('#kdpv .kd-page').forEach((el, i) => { el.innerHTML = L.ops.filter(o => (o.p || 0) === i).map(opHtml).join(''); });
  $('#kdwarn').hidden = !L.overflow;
  const b = $('#kdpdf'); if (b && !KDS.busy) { b.disabled = L.overflow; b.title = L.overflow ? 'Too much text to fit on the page: shorten the longest field first' : ''; }
}
/* a justified line (ws): stretched by the browser to the PDF's width, so it ends at the margin whatever the screen font's widths */
const kdJust = o => `;width:${(KDS.measure(o.t, o.f, o.s) + (o.t.split(' ').length - 1) * o.ws).toFixed(2)}px;white-space:nowrap;text-align:justify;text-align-last:justify`;
const kdLayoutSoon = () => { clearTimeout(KDS.t); KDS.t = setTimeout(kdLayout, 120); };
/* the box keeps the page's aspect ratio in CSS, so scaling never changes the layout (no resize loop) */
function kdScale() {
  const wr = $('#kdpvs'), pg = $('#kdpage'), doc = kdDoc(); if (!wr || !pg || !doc || !wr.clientWidth) return;
  const k = `scale(${wr.clientWidth / KD.PAGES[KD.DOCS[doc].page].w})`;
  $$('#kdpv .kd-page').forEach(el => { el.style.transform = k; });
}
function kdPvToggle() {
  KDS.pv = !KDS.pv;
  $('#kd').classList.toggle('kd-onpv', KDS.pv);
  $('#kdpvt span').textContent = (KDS.pv ? 'Hide' : 'Show') + ' preview';
  if (KDS.pv) { kdScale(); $('#kdpv').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

/* ---- customer picker ---- */
function kdFind() {
  const box = $('#kdres'), q = $('#kdq'); if (!box || !q) return;
  const t = q.value.trim().toLowerCase(), dg = t.replace(/\D/g, '');
  if (!t) { kdFindClose(); return; }
  box.hidden = false;
  if (!KDS.cs) { box.innerHTML = '<p class="kd-none">Loading customers…</p>'; if (KDS.csP) KDS.csP.then(() => { if ($('#kdq') === q && q.value.trim()) kdFind(); }); return; }
  const num = s => String(s || '').replace(/\D/g, '');
  const hit = KDS.cs.filter(c => (String(c.name || '') + ' ' + String(c.phone || '') + ' ' + String(c.consumer_no || '')).toLowerCase().includes(t)
    || (dg.length >= 3 && (num(c.phone).includes(dg) || num(c.consumer_no).includes(dg)))).slice(0, 20);
  box.innerHTML = hit.map(c => `<button type="button" data-a="pick" data-id="${+c.id}"><b>${esc(c.name)}</b><small>${esc([c.phone, c.consumer_no && 'Consumer no. ' + c.consumer_no, c.district].filter(Boolean).join(' · '))}</small></button>`).join('')
    || '<p class="kd-none">No customer matches.</p>';
}
function kdFindClose() { const r = $('#kdres'); if (r) { r.hidden = true; r.innerHTML = ''; } }
function kdPick(id) {
  const q = $('#kdq'); kdFindClose(); if (q) { q.value = ''; q.blur(); }
  if (id > 0 && id !== KDS.id) location.hash = KB().hash + id;
}
function kdOnKey(e) {
  const res = $('#kdres'), q = $('#kdq'); if (!res || !q) return;
  const items = $$('button', res), i = items.indexOf(document.activeElement);
  if (e.target === q) {
    if (e.key === 'Enter') { e.preventDefault(); if (items[0]) kdPick(+items[0].dataset.id); }
    else if (e.key === 'ArrowDown' && items[0]) { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'Escape') { q.value = ''; kdFindClose(); }
  } else if (i >= 0) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = i + (e.key === 'ArrowDown' ? 1 : -1); (n < 0 ? q : items[Math.min(n, items.length - 1)]).focus(); }
    else if (e.key === 'Escape') { q.focus(); kdFindClose(); }
  }
}

/* ---- buttons ---- */
function kdOnClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'kdpdf') return kdPdf();
  if (b.id === 'kdsave') return kdSave();
  if (b.id === 'kdpvt') return kdPvToggle();
  const a = b.dataset.a, doc = kdDoc();
  if (a === 'pick') return kdPick(+b.dataset.id);
  if (!doc || !KDS.vals[doc]) return;
  if (a === 'reset') return kdSet(doc, b.dataset.k, KDS.defs[doc][b.dataset.k] ?? '');
  if (a === 'today') return kdSet(doc, 'date', today());
  if (a === 'def') return kdDefaults();
}
/* what a save or a PDF uses, taken when the button is pressed: a customer switch meanwhile cannot mix two customers */
const kdSnap = doc => ({ doc, g: KDS.g, id: KDS.id, vals: Object.assign({}, KDS.vals[doc]), defs: KDS.defs[doc] });
async function kdSaveDoc(s) {
  /* fields that are also profile fields (src): what was typed for an empty profile field goes into the profile too */
  const data = KD.overrides(s.doc, s.vals, s.defs), fill = canW('customers') ? KD.fill(s.doc, data, kdCtx(s.g)) : [];
  const r = await api(KB().api, 'save', Object.assign({ customer_id: s.id, doc: s.doc, data }, fill.length ? { fill } : {}));
  (s.g.saved = s.g.saved || {})[s.doc] = r.saved;
  if (r.customer && r.plant) kdProfileFilled(s.g, r);
  if (KDS.g === s.g) {
    const base = KDS.base[s.doc] = KD.values(s.doc, kdCtx(s.g), r.saved && r.saved.data), cur = KDS.vals[s.doc];
    /* a value now kept in the profile shows as the profile writes it ("3kw" -> "3 KW"), unless it was typed over meanwhile */
    (r.filled || []).forEach(k => { if (cur && cur[k] === s.vals[k] && cur[k] !== base[k]) { cur[k] = base[k]; const el = $('#kdf_' + k); if (el && kdDoc() === s.doc) el.value = base[k]; } });
    kdMarks(); if (r.filled && r.filled.length && kdDoc() === s.doc) kdLayoutSoon();
  }
  return r;
}
/* the profile changed under the open customer: new defaults everywhere; a document without unsaved edits follows them */
function kdProfileFilled(g, r) {
  const docs = Object.keys(KDS.vals).filter(d => KD.DOCS[d]);
  const clean = KDS.g === g ? docs.filter(d => !kdFields(d).some(f => kdT(KDS.vals[d][f.k]) !== kdT((KDS.base[d] || {})[f.k]))) : [];
  g.customer = r.customer; g.plant = r.plant;
  if (KDS.g !== g) return;
  const ctx = kdCtx(g);
  docs.forEach(d => {
    KDS.defs[d] = KD.defaults(d, ctx); KDS.base[d] = KD.values(d, ctx, ((g.saved || {})[d] || {}).data);
    if (clean.includes(d)) KDS.vals[d] = Object.assign({}, KDS.base[d]);
  });
}
/* " · also saved in the customer profile: Transformer, GPS" for the toast */
const kdFilledNote = (doc, r) => r && r.filled && r.filled.length
  ? ' · also saved in the customer profile: ' + r.filled.map(k => (kdFields(doc).find(f => f.k === k) || { l: k }).l).join(', ') : '';
async function kdSave() {
  const doc = kdDoc(), b = $('#kdsave'); if (!doc || !KDS.g || !b || KDS.busy) return;
  KDS.busy = true; b.disabled = true; b.textContent = 'Saving…';
  try { const r = await kdSaveDoc(kdSnap(doc)); toast(KD.DOCS[doc].file + ' saved' + kdFilledNote(doc, r)); } catch (e) { kdErr(e); }
  finally { KDS.busy = false; b.disabled = false; b.textContent = 'Save'; }
}
/* PDF bytes for one document from the given values (no saving, no download) */
async function kdBuild(doc, vals = KDS.vals[doc]) {
  const m = await kdMeasure(), L = KD.layout(doc, vals, m);
  if (L.overflow) throw new Error('Too much text to fit — shorten the longest field');
  const [lib, tpl] = await Promise.all([kdLibs(), kdTpl(KD.DOCS[doc].page)]);
  return KD.buildPdf(lib, tpl.slice(0), L.ops);
}
const kdFileName = (doc, g) => (KD.DOCS[doc].file + ' - ' + (kdT(g.customer && g.customer.name) || 'Customer'))
  .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 180) + '.pdf';
function kdSaveFile(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
/* Download PDF: with edit rights the changed fields and the date are saved first, so a reprint matches this copy */
async function kdPdf() {
  const doc = kdDoc(), b = $('#kdpdf'); if (!doc || !KDS.g || !b || KDS.busy) return;
  const s = kdSnap(doc), name = kdFileName(doc, s.g), old = b.innerHTML;
  KDS.busy = true; b.disabled = true; b.innerHTML = '<i class="i i-download"></i>Making PDF…';
  try {
    const bytes = await kdBuild(doc, s.vals); /* build first (it refuses overflow): a failed template fetch or build stores nothing */
    const r = canW(KB().perm) ? await kdSaveDoc(s) : null;
    kdSaveFile(bytes, name);
    const kept = await docKeep(s.id, KDS.book + ':' + doc, (KDS.book === 'bank' ? 'Bank' : 'KSEB') + ' · ' + KD.DOCS[doc].file, name, bytes); /* a copy for the customer's Documents page */
    toast(name + ' downloaded' + (kept ? ' · copy kept in Documents' : '') + kdFilledNote(doc, r));
  } catch (e) { kdErr(e); }
  finally { KDS.busy = false; b.innerHTML = old; b.disabled = !!(KDS.lay[doc] || {}).overflow; }
}
/* Save as default: the vendor and signatory fields become the company defaults (settings kseb_defaults) */
async function kdDefaults() {
  const g = KDS.g, v = KDS.vals.wcr, d = KDS.defs.wcr; if (!g || !v || KDS.busy) return;
  const fs = kdFields('wcr').filter(f => f.share), ch = fs.filter(f => kdT(v[f.k]) !== kdT(d[f.k]));
  if (!ch.length) { toast('These are already the company defaults'); return; }
  if (!confirm('Use these details for every customer from now on?\n\n' + ch.map(f => f.g + ' · ' + f.l + ': ' + (kdT(v[f.k]) || '(empty)')).join('\n'))) return;
  const data = {}; fs.forEach(f => { data[f.k] = kdT(v[f.k]); });
  KDS.busy = true;
  try {
    const r = await api('kseb', 'defaults_save', { data });
    g.defaults = r.defaults;
    if (KDS.g === g) { kdPrep(); kdMarks(); }
    toast('Saved as the company default');
  } catch (e) { kdErr(e); } finally { KDS.busy = false; }
}

/* ---- leaving with unsaved edits (same pattern as the quotation maker in app22.js): switching customer, or leaving the page ---- */
const kdDirty = () => canW(KB().perm) && !!KDS.g && Object.keys(KDS.vals).some(d => KD.DOCS[d] && kdFields(d).some(f => kdT(KDS.vals[d][f.k]) !== kdT((KDS.base[d] || {})[f.k])));
(() => {
  const prev = window.onhashchange;
  window.onhashchange = e => {
    if (kdOn() && KDS.hash && location.hash !== KDS.hash && kdDirty()) {
      if (!confirm('This document has changes that are not saved.\n\nLeave without saving?')) { history.replaceState(null, '', KDS.hash); return; }
    }
    return prev ? prev.call(window, e) : undefined;
  };
  addEventListener('beforeunload', e => { if (kdOn() && kdDirty()) { e.preventDefault(); e.returnValue = ''; } });
})();
