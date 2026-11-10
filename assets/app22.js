// Quotation maker screen (#/quotes/new, and quotations saved with the maker): template bar, tabs (customer, one per item
// category, price & loan), live A4 preview, save and PDF. Needs QM (app20.js) and qmLines / qmPagesHtml / qmMount /
// qmDownloadPdf (app21.js). UI classes start with .qm (assets/quote.css). Every value shown in HTML goes through esc().
const QMK = { boot: null, doc: null, tab: 'customer', dirty: false, id: null, status: 'Draft', cust: {}, tpl: '', hash: '', cs: [], ls: [], over: [], stale: true, busy: false, pdf: false, touched: false, snapOld: false, picking: false, t: 0 };
const QMK_TPL = ['items', 'price', 'subsidy', 'loan', 'title', 'project', 'pill', 'kseb', 'pay', 'terms', 'delivery'];
const QMK_ST = ['Draft', 'Sent', 'Accepted', 'Rejected'];
const qmkCopy = o => o == null ? o : JSON.parse(JSON.stringify(o));
const qmkObj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const qmkProd = id => QMK.boot.products.find(p => p.id == id);
const qmkLabel = p => p ? p.label || p.name || '' : '';
const qmkCats = () => QMK.boot.cats;
const qmkIsCat = k => qmkCats().some(c => c[0] === k);
const qmkTplById = id => QMK.boot.templates.find(t => t.id == id);
const qmkNum = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0; };
const qmkOn = () => !!$('#qmk');
const qmkWide = () => matchMedia('(min-width:1100px)').matches;
const qmkBlank = () => ({ items: {}, price: 0, subsidy: null, loan: false, title: '', project: '', pill: '', kseb: null, pay: null, terms: null, delivery: null });
const qmkGet = (o, path) => path.split('.').reduce((v, k) => v == null ? '' : v[k], o);
const qmkSet = (o, path, v) => { const ks = path.split('.'), last = ks.pop(); ks.reduce((x, k) => (x[k] = qmkObj(x[k])), o)[last] = v; };
/* run an async handler; API errors were already shown by api(), anything else becomes a red toast */
const qmkTry = fn => async (...a) => { try { return await fn(...a); } catch (e) { if (!e || !e.error) { console.error(e); toast((e && e.message) || String(e), true); } } };

/* the doc's shape, whatever JSON round trips did to it (PHP turns {} into []) */
function qmkNorm(d) {
  d.items = qmkObj(d.items);
  Object.keys(d.items).forEach(c => {
    const ls = Array.isArray(d.items[c]) ? d.items[c].filter(x => x && typeof x === 'object') : [];
    ls.forEach(x => { x.over = qmkObj(x.over); if (x.custom) x.custom = Object.assign({ name: '', line: '', details: '', unit: 'no', picture: '', brands: [] }, qmkObj(x.custom)); });
    if (ls.length) d.items[c] = ls; else delete d.items[c];
  });
  d.customer = Object.assign({ name: '', address: '', consumer_no: '', email: '', mobile: '' }, qmkObj(d.customer));
  d.sales = Object.assign({ name: '', phone: '', email: '' }, qmkObj(d.sales));
  return d;
}
/* new quotation: the default product of each category (optimisers only when the default inverter needs them) */
function qmkDefaults() {
  const P = QMK.boot.products, def = c => P.find(p => p.cat === c && p.is_default && !p.hidden), inv = def('inverter'), items = {};
  qmkCats().forEach(([c]) => { const p = def(c); if (p && (c !== 'optimiser' || (inv && inv.needs_opt))) items[c] = [{ pid: p.id, qty: p.qty, qty_note: '', over: {} }]; });
  return items;
}
/* the settings this quotation prints with (subsidy rates inside): frozen with a saved quotation's snapshot, else the live ones */
const qmkSt = () => QM.effectiveSettings(QMK.doc, QMK.boot.settings, S.subsidy_rates);
const qmkSettings = () => { const st = qmkSt(); return QMK.doc.pill ? Object.assign({}, st, { pill: QMK.doc.pill }) : st; };
/* the printed lines (saved snapshot until items are edited) and the figures; the same lines go to QM.calc and qmPagesHtml */
function qmkCalc() { const lines = qmLines(QMK.doc, QMK.boot.products), st = qmkSt(); return { lines, calc: QM.calc(QMK.doc, lines, st, st.subsidy_rates) }; }
/* a saved snapshot whose products or settings differ from today's (the item tabs say so) */
function qmkSnapOld() {
  const d = QMK.doc, snap = d.snap, boot = QMK.boot;
  if (!(snap && typeof snap === 'object' && Object.keys(snap).length)) return false;
  if (JSON.stringify(snap) !== JSON.stringify(QM.resolve(d, boot.products))) return true;
  const ss = d.snap_settings;
  return QM.frozen(d) && JSON.stringify(QM.snapSettings(ss, ss.subsidy_rates)) !== JSON.stringify(QM.snapSettings(boot.settings, S.subsidy_rates));
}
const qmkPrintDoc = () => Object.assign({}, QMK.doc, { number: QMK.doc.number || QMK.boot.next_number });
const qmkMainProd = c => (QMK.doc.items[c] || []).map(x => !x.custom && qmkProd(x.pid)).find(Boolean);
const qmkPanels = () => (QMK.doc.items.panels || []).reduce((s, x) => s + (+(x.qty != null ? x.qty : (qmkProd(x.pid) || {}).qty) || 0), 0);

async function pgQuoteMaker(id, q) {
  const nav = ROUTE_N;
  const [boot, cs, ls, row] = await Promise.all([api('qm', 'boot'), canR('customers') ? list('customers') : [], canR('leads') ? list('leads') : [],
    id && !q ? api('quotes', 'get', undefined, '&id=' + id) : (q || null)]);
  if (nav !== ROUTE_N) return;
  Object.assign(QMK, { boot, cs, ls, id: id || null, dirty: false, touched: false, over: [], stale: true, busy: false, pdf: false, hash: location.hash, tab: 'customer', status: 'Draft', cust: {}, tpl: '', snapOld: false, picking: false });
  const st = boot.settings, co = st.company || {};
  if (row) {
    let d = {}; try { d = JSON.parse(row.doc || '{}') || {}; } catch (e) { }
    QMK.doc = qmkNorm(Object.assign(qmkBlank(), qmkObj(d), { number: row.number || d.number || '', date: d.date || row.date || today() }));
    QMK.status = row.status || 'Draft';
    QMK.cust = { customer_id: row.customer_id || null, lead_id: row.lead_id || null };
    QMK.tpl = qmkTplById(d.template_id) ? d.template_id : '';
    QMK.snapOld = qmkSnapOld();
  } else {
    QMK.doc = qmkNorm(Object.assign(qmkBlank(), { items: qmkDefaults(), template_id: null, number: '', date: today(), valid_days: st.valid_days,
      sales: { name: ME.name || '', phone: co.phone || '', email: co.email || '' } }));
    let pre = null; try { pre = JSON.parse(sessionStorage.lead2quote || 'null'); } catch (e) { } sessionStorage.removeItem('lead2quote');
    if (pre) {
      const c = pre.customer_id && cs.find(x => x.id == pre.customer_id), l = pre.lead_id && ls.find(x => x.id == pre.lead_id);
      if (c) qmkWhoFill(c, 'customer'); else if (l) qmkWhoFill(l, 'lead'); else QMK.doc.customer.name = pre.name || '';
      QMK.cust = { customer_id: +pre.customer_id || null, lead_id: +pre.lead_id || null };
    }
  }
  const main = $('#main'); main.classList.add('qm-wide');
  main.innerHTML = qmkShell();
  const root = $('#qmk');
  root.addEventListener('input', qmkOnInput); root.addEventListener('change', qmkOnChange); root.addEventListener('click', qmkOnClick);
  root.addEventListener('focusout', qmkOnBlur); root.addEventListener('keydown', qmkOnKey);
  root.addEventListener('focusin', e => { const s = e.target.closest('[data-pv]'); if (s && s !== QMK.pvSec) { QMK.pvSec = s; qmkPvShow($('#qmpages ' + s.dataset.pv)); } });
  $('#qmpvsc').addEventListener('scroll', qmkPno, { passive: true });
  qmkTplSel(); qmkHead(); qmkTab(QMK.tab); /* qmkTab draws the preview when it is on screen */
}

function qmkShell() {
  const w = canW('quotes'), gear = QMK.boot.admin && typeof qmOpenSettings === 'function';
  return `<div id="qmk" class="qmk"><div class="qm-head"><a href="#/quotes" class="qm-back">← Quotations</a><h2 id="qmh"></h2><span id="qmstate" class="qm-state"></span></div>
   <div class="qm-bar card"><div class="qm-tplw"><i class="i i-file"></i><select id="qmtpl" aria-label="Template"></select></div>
    ${w ? `<button type="button" class="btn sec sm" id="qmtnew" title="Keep these components, price and texts as a template for later quotations"><i class="i i-plus"></i><span class="qm-wl">Save as new template</span><span class="qm-nl">New template</span></button>
    <button type="button" class="btn sec sm" id="qmtupd"><i class="i i-refresh"></i> Update template</button>
    <button type="button" class="btn sec sm qm-ibtn" id="qmtdel" aria-label="Delete template"><i class="i i-trash"></i></button>` : ''}
    <span class="sp"></span><select id="qmst" class="qm-st" aria-label="Status" ${w ? '' : 'disabled'}>${QMK_ST.map(s => `<option ${s === QMK.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
    ${w ? '<button type="button" class="btn" id="qmsave" title="Save (Ctrl+S)">Save</button>' : ''}<button type="button" class="btn sec" id="qmpdf"><i class="i i-download"></i><span class="qm-wl">Download </span>PDF</button>
    <button type="button" class="btn sec qm-ibtn" id="qmmore" aria-label="More" title="More" hidden><i class="i i-dots"></i></button>
    ${gear ? '<button type="button" class="btn sec qm-ibtn" id="qmgear" aria-label="Products and rates" title="Products & rates, quotation settings"><i class="i i-gear"></i></button>' : ''}</div>
   <div class="qm-split"><div class="qm-left"><div class="qm-tabs" id="qmtabs" role="tablist"></div><div class="qm-ed" id="qmed"></div></div>
    <div class="qm-pv" id="qmpv"><div class="qm-pvh"><b>Preview</b><span id="qmpno" class="mut"></span><span class="sp"></span>
     <button type="button" class="qm-ib" id="qmpp" aria-label="Previous page" title="Previous page"><i class="i i-chev qm-flip"></i></button><button type="button" class="qm-ib" id="qmpn" aria-label="Next page" title="Next page"><i class="i i-chev"></i></button></div>
     <div class="qm-warn" id="qmwarn" hidden></div><div class="qm-pvsc" id="qmpvsc"><div class="qm-pvs" id="qmpvs"><div class="qm-pages" id="qmpages"></div></div></div></div></div></div>`;
}

/* ---- header, template bar ---- */
function qmkHead() {
  const h = $('#qmh'), s = $('#qmstate'); if (!h) return;
  h.textContent = QMK.id ? 'Quotation ' + (QMK.doc.number || '') : 'New quotation';
  s.textContent = QMK.dirty ? 'Unsaved changes' : QMK.id ? 'Saved' : 'Not saved yet';
  s.classList.toggle('qm-dirty', QMK.dirty);
  $('#qmmore').hidden = !QMK.id;
}
function qmkTplSel() {
  const sel = $('#qmtpl'), groups = {};
  QMK.boot.templates.forEach(t => { const m = /^\s*(\d+(?:\.\d+)?)\s*kW\b/i.exec(t.name), g = m ? m[1] + ' kW' : 'Other'; (groups[g] = groups[g] || []).push(t); });
  const keys = Object.keys(groups).sort((a, b) => (parseFloat(a) || 1e9) - (parseFloat(b) || 1e9));
  sel.innerHTML = `<option value="">${QMK.boot.templates.length ? 'Choose a template…' : 'No templates yet'}</option>` + keys.map(k => `<optgroup label="${esc(k === 'Other' ? 'Other templates' : k + ' plants')}">`
    + groups[k].map(t => `<option value="${t.id}">${esc(t.name)}${t.created_name ? ' · ' + esc(t.created_name) : ''}</option>`).join('') + '</optgroup>').join('');
  sel.value = QMK.tpl ? String(QMK.tpl) : '';
  qmkTplBtns();
}
function qmkTplBtns() {
  const t = qmkTplById(QMK.tpl), own = !!t && (!!QMK.boot.admin || (t.created_by != null && t.created_by == ME.id));
  const tip = !t ? 'Choose a template first' : own ? '' : 'Only the person who made this template or an admin can change it';
  const u = $('#qmtupd'), d = $('#qmtdel');
  if (u) { u.disabled = !own; u.title = tip || `Save the current components, price and texts into “${t.name}”`; }
  if (d) { d.disabled = !own; d.title = tip || `Delete the template “${t.name}”`; }
}
const qmkTplData = () => { const d = QMK.doc, b = qmkBlank(), o = {}; QMK_TPL.forEach(k => { o[k] = qmkCopy(d[k] === undefined ? b[k] : d[k]); }); return o; };
function qmkUseTpl(id) {
  const t = qmkTplById(id), sel = $('#qmtpl');
  if (!t) { QMK.tpl = ''; qmkTplBtns(); return; }
  if ((QMK.touched || QMK.id) && !confirm(`Use the template “${t.name}”?\n\nIts components, price and texts replace the ones on this quotation. The customer and quote details stay.`)) { sel.value = QMK.tpl ? String(QMK.tpl) : ''; return; }
  const d = QMK.doc, data = qmkObj(qmkCopy(t.data)), next = qmkBlank();
  QMK_TPL.forEach(k => { if (data[k] !== undefined) next[k] = data[k]; });
  QMK.doc = qmkNorm(Object.assign(next, { template_id: t.id, customer: d.customer, number: d.number, date: d.date, valid_days: d.valid_days, sales: d.sales }));
  QMK.tpl = t.id; QMK.snapOld = false;
  qmkChanged(false, true); QMK.touched = false;
  qmkTplBtns(); qmkTab(QMK.tab);
}
const qmkTplNew = qmkTry(async () => {
  const t = qmkTplById(QMK.tpl), { calc } = qmkCalc();
  const name = (prompt('Name for the new template. Everyone who makes quotations will see it.', t ? t.name + ' (copy)' : calc.title.replace(/\s*Quotation$/, '')) || '').trim();
  if (!name) return;
  const data = qmkTplData(), r = await api('qm', 'tpl_save', { name, data });
  QMK.boot.templates.push({ id: r.id, name, data, created_by: ME.id, created_name: ME.name, updated: '' });
  QMK.tpl = r.id; QMK.doc.template_id = r.id; qmkTplSel(); toast(`Template “${name}” saved`);
});
const qmkTplUpd = qmkTry(async () => {
  const t = qmkTplById(QMK.tpl); if (!t) return;
  if (!confirm(`Update the template “${t.name}”?\n\nIt will hold this quotation's components, price and texts (not the customer).`)) return;
  const data = qmkTplData(); await api('qm', 'tpl_save', { id: t.id, name: t.name, data });
  t.data = data; toast(`Template “${t.name}” updated`);
});
const qmkTplDel = qmkTry(async () => {
  const t = qmkTplById(QMK.tpl); if (!t) return;
  if (!confirm(`Delete the template “${t.name}”?\n\nIt goes to the Recycle bin. Quotations already made from it do not change.`)) return;
  await api('qm', 'tpl_delete', { id: t.id });
  QMK.boot.templates = QMK.boot.templates.filter(x => x.id !== t.id); QMK.tpl = ''; QMK.doc.template_id = null; qmkTplSel(); toast(`Template “${t.name}” deleted`);
});

/* ---- tabs ---- */
function qmkTabList() {
  const inv = qmkMainProd('inverter'), opt = (inv && inv.needs_opt) || (QMK.doc.items.optimiser || []).length;
  return [['preview', 'Preview'], ['customer', 'Customer']].concat(qmkCats().filter(c => c[0] !== 'optimiser' || opt), [['price', 'Price & loan']]);
}
const qmkWarn = k => k === 'customer' ? !(QMK.cust.customer_id || QMK.cust.lead_id) : k === 'price' ? !(+QMK.doc.price > 0) : false;
function qmkTabs() {
  const box = $('#qmtabs'), x = box.scrollLeft;
  box.innerHTML = qmkTabList().map(([k, l]) => { const n = (QMK.doc.items[k] || []).length, cls = [k === QMK.tab && 'on', k === 'preview' && 'qm-tpv', qmkIsCat(k) && !n && 'qm-te', qmkWarn(k) && 'qm-tw'].filter(Boolean).join(' ');
    return `<button type="button" role="tab" data-qt="${k}" class="${cls}" aria-selected="${k === QMK.tab}">${k === 'preview' ? '<i class="i i-eye"></i>' : ''}${esc(l)}${n > 1 ? `<small>${n}</small>` : ''}</button>`; }).join('');
  box.scrollLeft = x;
}
function qmkTab(t) {
  const tl = qmkTabList();
  if (!tl.some(x => x[0] === t)) t = t === 'optimiser' ? 'inverter' : 'customer';
  if (t === 'preview' && qmkWide()) t = 'customer';
  if (t !== 'customer') QMK.picking = false;
  const moved = QMK.tab !== t;
  QMK.tab = t; qmkTabs();
  $('#qmk').classList.toggle('qm-onpv', t === 'preview');
  if (t !== 'preview') {
    $('#qmed').innerHTML = (t === 'customer' ? qmkEdCustomer() : t === 'price' ? qmkEdPrice() : qmkEdItems(t)) + qmkEdNav();
    if (qmkIsCat(t)) qmkLineInfo(t);
  }
  const strip = $('#qmtabs'), b = $(`#qmtabs [data-qt="${t}"]`), r = strip.getBoundingClientRect();
  if (b && t !== 'preview' && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = b.offsetLeft - strip.clientWidth / 2 + b.offsetWidth / 2;
  if (moved && r.top < 60) window.scrollTo({ top: scrollY + r.top - 72 }); /* only on a real tab change: a same-tab redraw keeps the scroll */
  if (QMK.stale && qmkPvVisible()) qmkRender(); else if (moved) qmkPvTo(t);
}
/* wide screens: the preview follows the tab (customer -> cover, price -> price box, an item tab -> its row) */
function qmkPvTo(t) {
  let el = null;
  if (qmkIsCat(t)) {
    const { lines } = qmkCalc(), rows = $$('#qmpages .qp-items tbody tr'); let n = 0;
    for (const c of qpCats(lines)) { if (c === t) break; n += (lines[c] || []).length; }
    el = (lines[t] || []).length ? rows[n] : $('#qmpages .qp-items');
  } else el = t === 'price' ? $('#qmpages .qp-price') : $('#qmpages .qp');
  qmkPvShow(el);
}
function qmkPvShow(el) {
  const sc = $('#qmpvsc'); if (!el || !sc || !qmkWide() || sc.scrollHeight <= sc.clientHeight + 2) return;
  const r = el.getBoundingClientRect(), sr = sc.getBoundingClientRect();
  sc.scrollTo({ top: Math.max(0, sc.scrollTop + r.top - sr.top - (el.classList.contains('qp') ? 12 : sr.height / 3)) });
}
function qmkEdNav() {
  const tl = qmkTabList().filter(x => x[0] !== 'preview'), i = tl.findIndex(x => x[0] === QMK.tab), p = tl[i - 1], n = tl[i + 1];
  return `<div class="qm-nav">${p ? `<button type="button" class="btn sec" data-a="go" data-k="${p[0]}">← ${esc(p[1])}</button>` : '<span></span>'}${n ? `<button type="button" class="btn sec" data-a="go" data-k="${n[0]}">${esc(n[1])} →</button>` : ''}</div>`;
}

/* ---- customer tab ---- */
function qmkWhoFill(r, type) {
  const c = QMK.doc.customer;
  Object.assign(c, { name: r.name || '', address: r.address || (type === 'customer' ? r.district : r.city) || '', consumer_no: type === 'customer' ? r.consumer_no || '' : '', email: r.email || '', mobile: r.phone || '' });
  QMK.cust = type === 'customer' ? { customer_id: r.id, lead_id: null } : { customer_id: r.customer_id || null, lead_id: r.id };
}
function qmkWhoHtml() {
  const c = QMK.cust, r = c.customer_id ? QMK.cs.find(x => x.id == c.customer_id) : c.lead_id ? QMK.ls.find(x => x.id == c.lead_id) : null;
  const name = (r && r.name) || QMK.doc.customer.name || 'Chosen contact';
  return `<div class="qm-who"><span class="qm-av">${esc(name.trim().charAt(0).toUpperCase() || '?')}</span><div><b>${esc(name)}</b><small>${c.customer_id ? 'Customer' : 'Lead'}${r && r.phone ? ' · ' + esc(r.phone) : ''}</small></div>
    ${QMK.picking ? '' : '<button type="button" class="btn sec sm" data-a="whoc">Change</button>'}</div>`;
}
function qmkEdCustomer() {
  const d = QMK.doc, co = qmkSt().company || {}, has = QMK.cust.customer_id || QMK.cust.lead_id, pick = !has || QMK.picking;
  const f = (k, l, o = {}) => `<div class="${o.full ? 'full' : ''}"><label>${esc(l)}</label>${o.ta ? `<textarea rows="2" data-f="${k}">${esc(qmkGet(d, k))}</textarea>`
    : `<input data-f="${k}" type="${o.t || 'text'}" value="${esc(qmkGet(d, k))}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${o.t === 'number' ? ' min="1" step="1"' : ''}>`}</div>`;
  return `<section class="qm-sec"><h3>Customer</h3>${has ? qmkWhoHtml() : ''}
    ${pick ? `<div class="qm-find"><i class="i i-search"></i><input id="qmcq" placeholder="Search customers and leads by name or phone" autocomplete="off" aria-label="Search customers and leads">${has ? '<button type="button" class="btn sec sm" data-a="whox">Cancel</button>' : ''}<div class="qm-res" id="qmres"></div></div>` : ''}
    <div class="two">${f('customer.name', 'Name')}${f('customer.mobile', 'Mobile')}${f('customer.email', 'Email')}${f('customer.consumer_no', 'Consumer number')}${f('customer.address', 'Address', { full: 1, ta: 1 })}</div>
    <p class="qm-hint">Changes here only change this quotation, not the customer record.</p></section>
   <section class="qm-sec"><h3>Quote details</h3><div class="two">
    <div><label>Quote number</label><input value="${esc(d.number || QMK.boot.next_number)}" readonly>${d.number ? '' : '<small class="qm-hint">The next free number, given when you save</small>'}</div>
    ${f('date', 'Date', { t: 'date' })}${f('valid_days', 'Valid for (days)', { t: 'number' })}${f('sales.name', 'Sales / engineer')}${f('sales.phone', 'Phone', { ph: co.phone })}${f('sales.email', 'Email', { ph: co.email })}</div></section>`;
}
function qmkFind(qs) {
  const box = $('#qmres'); if (!box) return;
  const t = qs.trim().toLowerCase(), dg = t.replace(/\D/g, '');
  if (!t) { box.innerHTML = ''; return; }
  const all = QMK.cs.map(c => ['customer', c]).concat(QMK.ls.filter(l => !l.customer_id).map(l => ['lead', l]));
  const hit = all.filter(([, r]) => String(r.name || '').toLowerCase().includes(t) || (dg.length >= 3 && String(r.phone || '').replace(/\D/g, '').includes(dg))).slice(0, 8);
  box.innerHTML = hit.map(([ty, r]) => `<button type="button" data-a="who" data-k="${ty}|${r.id}"><b>${esc(r.name)}</b>${pill(ty === 'lead' ? 'Lead' : 'Customer', ty === 'lead' ? 'b' : 'g')}<small>${esc([r.phone, r.district || r.city].filter(Boolean).join(' · '))}</small></button>`).join('')
    || '<p class="qm-none">No customer or lead matches. Add them under Customers or Leads first.</p>';
}

/* ---- item tabs ---- */
const qmkWar = p => (p.warranty || []).map(w => `${w.years} ${String(w.years) === '1' ? 'yr' : 'yrs'} ${w.label || ''}`.trim()).join(' · ');
function qmkEdItems(c) {
  const d = QMK.doc, its = d.items[c] || [], fin = !!QMK.boot.finance, main = its.find(x => !x.custom);
  const chosen = its.filter(x => !x.custom).map(x => +x.pid), name = (qmkCats().find(x => x[0] === c) || [c, c])[1];
  const prods = QMK.boot.products.filter(p => p.cat === c && (!p.hidden || chosen.includes(p.id)));
  const card = p => { const u = qmImgUrl(p.picture), w = qmkWar(p);
    return `<button type="button" class="qm-card${main && main.pid == p.id ? ' on' : chosen.includes(p.id) ? ' also' : ''}" data-a="pick" data-k="${c}|${p.id}" aria-pressed="${!!(main && main.pid == p.id)}">
      <span class="qm-cp">${u ? `<img src="${esc(u)}" alt="" loading="lazy">` : ''}</span><span class="qm-cb"><b>${esc(qmkLabel(p))}</b><span class="qm-cd">${esc(p.details || p.line || '')}</span>
      ${w ? `<span class="qm-cw"><i class="i i-shield"></i>${esc(w)}</span>` : ''}${fin ? (+p.rate ? `<span class="qm-cr">₹${QM.inr(p.rate)} per ${esc(p.unit === 'no' ? 'unit' : p.unit)}</span>` : '<span class="qm-cr qm-nr">No rate yet</span>') : ''}${p.hidden ? pill('Hidden', 'y') : ''}</span>
      <span class="qm-ck"><i class="i i-check"></i></span></button>`; };
  const snap = QMK.snapOld ? `<p class="qm-snap"><i class="i i-alert"></i><span>The preview shows this quotation exactly as it was saved. Products or quotation settings have changed since; changing any item switches the whole quotation to today’s products and settings.</span></p>` : '';
  const add = `<button type="button" class="btn sec sm qm-add" data-a="add" data-k="${c}"><i class="i i-plus"></i> Add another component</button>`;
  return `<section class="qm-sec">${snap}<div class="qm-sh"><h3>${esc(name)}</h3>${its.length ? '' : pill('Not in this quote')}</div>
     ${prods.length ? `<p class="qm-hint qm-top0">${its.length ? 'Tap a product to use it instead.' : 'Tap a product to add it to this quote.'}</p><div class="qm-cards">${prods.map(card).join('')}</div>` : '<p class="qm-hint qm-top0">There are no products in this category yet.</p>'}${its.length ? '' : add}</section>
   ${its.length ? `<section class="qm-sec"><h3>In this quote</h3>${its.map((it, i) => qmkLineHtml(c, it, i)).join('')}${add}</section>` : ''}`;
}
function qmkLineHtml(c, it, i) {
  const p = it.custom ? null : qmkProd(it.pid), k = `${c}|${i}`, o = it.over || {}, cu = it.custom, pic = qmImgUrl(cu ? cu.picture : p && p.picture);
  const unit = (cu ? cu.unit : p && p.unit) || 'no', qty = it.qty != null ? it.qty : p ? p.qty : 1;
  const inp = (f, l, ph, ta) => `<label>${esc(l)}</label>${ta ? `<textarea rows="3" data-l="${k}|${f}" placeholder="${esc(ph || '')}">${esc(qmkGet(it, f))}</textarea>` : `<input data-l="${k}|${f}" value="${esc(qmkGet(it, f))}" placeholder="${esc(ph || '')}">`}`;
  const words = cu ? `<div class="qm-wf">${inp('custom.name', 'Item name (printed)', 'e.g. Monitoring kit')}${inp('custom.line', 'Plain sentence', 'What it does, in one sentence')}${inp('custom.details', 'Details', 'Make, size, warranty…', 1)}${inp('custom.unit', 'Unit', 'no')}</div>`
    : p ? `<details class="qm-wd"${o.name || o.line || o.details ? ' open' : ''}><summary><i class="i i-pencil"></i>Change wording for this quote</summary><div class="qm-wf">${inp('over.name', 'Item name', p.name)}${inp('over.line', 'Plain sentence', p.line)}${inp('over.details', 'Details', p.details, 1)}<p class="qm-hint">An empty box prints the product’s own words (shown in grey).</p></div></details>` : '';
  return `<div class="qm-line"><div class="qm-lh"><span class="qm-th">${pic ? `<img src="${esc(pic)}" alt="">` : '<i class="i i-pencil"></i>'}</span>
     <div class="qm-lt"><b>${esc(cu ? cu.name || 'Your own line' : p ? qmkLabel(p) : 'Product no longer in the list')}</b><small>${cu ? 'Your own line' : p ? 'Prints as “' + esc(o.name || p.name) + '”' : ''}</small></div>
     <button type="button" class="qm-x" data-a="rm" data-k="${k}" title="Remove from this quote" aria-label="Remove from this quote"><i class="i i-trash"></i></button></div>
    <div class="qm-lq"><div class="qm-step"><button type="button" data-a="dq" data-k="${k}|-1" aria-label="Fewer">−</button><input type="number" min="0" step="any" inputmode="decimal" data-l="${k}|qty" value="${esc(qty)}" aria-label="Quantity"><button type="button" data-a="dq" data-k="${k}|1" aria-label="More">+</button></div>
     <span class="qm-unit">${esc(unit)}</span><input class="qm-note" data-l="${k}|qty_note" value="${esc(it.qty_note || '')}" aria-label="Note under the quantity"><span class="qm-prn" data-pr="${k}"></span></div>${words}</div>`;
}
/* "Prints 4 nos · 2.4+ kWp" under each line, and the automatic note as the note box's placeholder */
function qmkLineInfo(c) {
  const { calc } = qmkCalc();
  (QMK.doc.items[c] || []).forEach((it, i) => {
    const el = $(`[data-pr="${c}|${i}"]`); if (!el) return;
    const one = it2 => (QM.resolve({ items: { [c]: [it2] } }, QMK.boot.products)[c] || [])[0], ln = one(it), auto = one(Object.assign({}, it, { qty_note: '' }));
    if (!ln) { el.textContent = ''; return; }
    const q = QM.qtyText(ln, { dcKwp: calc.dcKwp }), n = $(`[data-l="${c}|${i}|qty_note"]`);
    el.innerHTML = `Prints <b>${esc(q.main)}</b>${q.note ? ' · ' + esc(q.note) : ''}`;
    if (n) { n.placeholder = QM.qtyText(auto, { dcKwp: calc.dcKwp }).note || 'Note under the quantity'; if (document.activeElement !== n) n.value = it.qty_note || ''; }
  });
}
/* choose a product: it replaces the first catalogue line of the category (or is added) */
function qmkPick(c, pid) {
  const d = QMK.doc, its = d.items[c] = d.items[c] || [], p = qmkProd(pid), i = its.findIndex(x => !x.custom);
  if (!p || its.some(x => !x.custom && x.pid == pid)) return;
  if (i < 0) its.unshift({ pid: p.id, qty: p.qty, qty_note: '', over: {} });
  else { const op = qmkProd(its[i].pid), keep = op && op.unit === p.unit && c !== 'inverter'; its[i] = { pid: p.id, qty: keep ? its[i].qty : p.qty, qty_note: '', over: {} }; }
  if (c === 'inverter') qmkOptSync(p);
  qmkChanged(true, true); qmkTab(c);
}
/* optimisers follow the inverter: added (one per panel) for an inverter that needs them, removed for one that does not */
function qmkOptSync(inv) {
  const d = QMK.doc, has = (d.items.optimiser || []).length, P = QMK.boot.products;
  if (inv.needs_opt && !has) {
    const o = P.find(p => p.cat === 'optimiser' && p.is_default && !p.hidden) || P.find(p => p.cat === 'optimiser' && !p.hidden);
    if (o) { d.items.optimiser = [{ pid: o.id, qty: qmkPanels() || o.qty, qty_note: '', over: {} }]; toast(`Optimisers added: one for each panel (${qmkPanels() || o.qty})`); }
  } else if (!inv.needs_opt && has) { delete d.items.optimiser; toast(`Optimisers removed: ${qmkLabel(inv)} does not use them`); }
}
function qmkQty(c, i, v, input) {
  const d = QMK.doc, it = d.items[c][i], before = qmkPanels();
  it.qty = Math.max(0, Math.round(qmkNum(v) * 100) / 100);
  if (c === 'panels') {
    if (/^\s*\d+(\.\d+)?\+?\s*kWp\s*$/i.test(it.qty_note || '')) it.qty_note = ''; /* a typed kWp note would now be wrong: let it work itself out */
    const o = (d.items.optimiser || []).filter(x => !x.custom);
    if (o.length === 1 && +o[0].qty === before) o[0].qty = qmkPanels();
  }
  if (input && document.activeElement !== input) input.value = it.qty;
  qmkChanged(true, true); qmkLineInfo(c);
}
function qmkAdd(c, btn) {
  const ps = QMK.boot.products.filter(p => p.cat === c && !p.hidden);
  popMenu(btn, ps.map(p => ['p' + p.id, 'plus', esc(qmkLabel(p))]).concat([['own', 'pencil', 'Your own line (type the words)']]), a => {
    const its = QMK.doc.items[c] = QMK.doc.items[c] || [], p = a !== 'own' && qmkProd(a.slice(1));
    its.push(p ? { pid: p.id, qty: p.qty, qty_note: '', over: {} } : { pid: null, qty: 1, qty_note: '', over: {}, custom: { name: '', line: '', details: '', unit: 'no', picture: '', brands: [] } });
    qmkChanged(true, true); qmkTab(c);
    const ls = $$('#qmed .qm-line'), last = ls[ls.length - 1]; if (last) { last.scrollIntoView({ block: 'nearest' }); if (!p) $('[data-l$="|custom.name"]', last).focus(); }
  });
}

/* ---- price & loan tab ---- */
const QMK_LISTS = { kseb: 'KSEB charges (included in the price)', pay: 'Payment schedule', delivery: 'Delivery & installation', terms: 'Terms and conditions' };
function qmkRowsOf(key, calc) {
  const d = QMK.doc, st = qmkSt();
  if (key === 'kseb') return (d.kseb ? (Array.isArray(d.kseb) ? d.kseb : d.kseb.rows || []) : calc.kseb.rows).map(r => ({ label: r.label || '', amount: r.amount }));
  return qmkCopy(d[key] || st[key] || []);
}
function qmkList(key, calc) {
  const own = QMK.doc[key] != null, rows = qmkRowsOf(key, calc), k = (i, f) => `data-r="${key}|${i}|${f}"`;
  const x = i => `<button type="button" class="qm-x" data-a="rrm" data-k="${key}|${i}" title="Remove this line" aria-label="Remove this line"><i class="i i-x"></i></button>`;
  const row = (r, i) => key === 'kseb' ? `<div class="qm-row"><input ${k(i, 'label')} value="${esc(r.label)}" placeholder="Particulars"><div class="qm-rs qm-amt"><span>₹</span><input ${k(i, 'amount')} inputmode="numeric" value="${esc(QM.inr(r.amount))}"></div>${x(i)}</div>`
    : key === 'pay' ? `<div class="qm-row"><input class="qm-pa" ${k(i, 'amt')} value="${esc(r.amt || '')}" placeholder="₹ or %"><textarea rows="2" ${k(i, 'text')} placeholder="When it is paid">${esc(r.text || '')}</textarea>${x(i)}</div>`
    : `<div class="qm-row"><textarea rows="2" ${k(i, '')}>${esc(r)}</textarea>${x(i)}</div>`;
  const std = key === 'kseb' ? 'Automatic from the plant size and Quotation settings' : 'The standard text from Quotation settings';
  return `<section class="qm-sec" data-list="${key}" data-pv="${{ kseb: '.qp-kc', pay: '.qp-pay', delivery: '.qp-del', terms: '.qp-tc' }[key]}"><div class="qm-sh"><h3>${esc(QMK_LISTS[key])}</h3>${own ? `<button type="button" class="btn sec sm" data-a="rstd" data-k="${key}"><i class="i i-undo"></i> Use the standard</button>` : ''}</div>
    <p class="qm-hint qm-top0">${own ? 'Changed for this quotation only.' : esc(std) + '. Editing a line changes it for this quotation only.'}</p>
    ${rows.map(row).join('')}${key === 'kseb' ? `<p class="qm-ktot">Total <b data-qml="kseb">₹${QM.inr(calc.kseb.total)}</b></p>` : ''}
    <button type="button" class="btn sec sm qm-add" data-a="radd" data-k="${key}"><i class="i i-plus"></i> Add a line</button>
    ${key === 'delivery' || key === 'terms' || key === 'pay' ? '<p class="qm-hint">Put **two stars** around words to print them in bold.' + (key === 'terms' ? ' {days} prints the valid-for days.' : '') + '</p>' : ''}</section>`;
}
function qmkSum(c) {
  const p = +QMK.doc.price > 0, auto = c.subsidy === c.subsidyAuto;
  return [[c.plantKw + ' kW', 'Plant size'], [c.dcKwp + ' kWp', `${c.panelCount} × ${c.panelWp} Wp panels`], ['₹' + QM.inr(c.subsidy), auto ? 'Subsidy (automatic)' : 'Subsidy (typed)'], [p ? '₹' + QM.inr(c.net) : '—', 'Cost after subsidy']]
    .map(([b, s]) => `<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');
}
function qmkGuide(lines) {
  let sum = 0, miss = 0;
  Object.keys(lines).forEach(c => (lines[c] || []).forEach(l => { const p = l.pid != null && qmkProd(l.pid), r = p ? +p.rate || 0 : 0; if (!r) miss++; else sum += r * (+l.qty > 0 ? +l.qty : 1); }));
  if (!sum) return `<i class="i i-coin"></i><span>No rates are filled in for these items yet (an admin adds them under Products &amp; rates). Rates are only a guide: the package price is what prints.</span>`;
  return `<i class="i i-coin"></i><span>Items add up to <b>₹${QM.inr(sum)}</b> at your rates${miss ? ` · ${miss} item${miss === 1 ? ' has' : 's have'} no rate yet` : ''}. Only a guide: the package price is what prints.</span>`;
}
function qmkEdPrice() {
  const d = QMK.doc, st = qmkSt(), { lines, calc } = qmkCalc(), auto = QM.calc(Object.assign({}, d, { title: '', project: '' }), lines, st, st.subsidy_rates);
  const has = v => v != null && v !== '';
  return `<section class="qm-sec" data-pv=".qp-price"><h3>Price</h3><div class="qm-sum" id="qmsum">${qmkSum(calc)}</div>
    <label for="qmprice">Package price, including KSEB charges</label><div class="qm-rs qm-big"><span>₹</span><input id="qmprice" inputmode="numeric" autocomplete="off" value="${+d.price > 0 ? esc(QM.inr(d.price)) : ''}" placeholder="Type the price, e.g. 1,70,000"></div>
    ${QMK.boot.finance ? `<p class="qm-guide" id="qmguide">${qmkGuide(lines)}</p>` : ''}
    <label for="qmsub">Subsidy</label><div class="qm-rs"><span>₹</span><input id="qmsub" inputmode="numeric" autocomplete="off" value="${has(d.subsidy) ? esc(QM.inr(d.subsidy)) : ''}" placeholder="Automatic: ${QM.inr(calc.subsidyAuto)}"></div>
    <p class="qm-hint" id="qmsubh">Leave it empty for the automatic PM Surya Ghar amount on ${esc(calc.dcKwp)} kWp.</p></section>
   <section class="qm-sec" data-pv=".qp-loan"><h3>Loan page</h3><label class="qm-sw"><input type="checkbox" id="qmloan" ${d.loan ? 'checked' : ''}><span>Add the SBI Surya Ghar loan page (margin, loan, EMI table)</span></label></section>
   ${['kseb', 'pay', 'delivery', 'terms'].map(k => qmkList(k, calc)).join('')}
   <section class="qm-sec" data-pv=".qp-title"><h3>Title and labels</h3><div class="two"><div class="full"><label>Title</label><input data-f="title" value="${esc(d.title || '')}" placeholder="${esc(auto.title)}"></div>
    <div><label>Project</label><input data-f="project" value="${esc(d.project || '')}" placeholder="${esc(auto.project)}"></div><div><label>Label on the title bar</label><input data-f="pill" value="${esc(d.pill || '')}" placeholder="${esc(st.pill || '')}"></div></div>
    <p class="qm-hint">Leave a box empty to print the automatic text shown in grey.</p></section>`;
}
function qmkRowsRead(key) {
  const box = $(`[data-list="${key}"]`); if (!box) return;
  const was = QMK.doc[key] != null, g = (r, f) => { const e = r.querySelector(`[data-r$="|${f}"]`); return e ? e.value : ''; };
  QMK.doc[key] = $$('.qm-row', box).map(r => key === 'kseb' ? { label: g(r, 'label'), amount: qmkNum(g(r, 'amount')) } : key === 'pay' ? { amt: g(r, 'amt'), text: g(r, 'text') } : g(r, ''));
  qmkChanged(true);
  if (!was) { const h = $('.qm-sh', box), p = $('.qm-hint', box); if (p) p.textContent = 'Changed for this quotation only.'; if (h && !$('[data-a="rstd"]', h)) h.insertAdjacentHTML('beforeend', `<button type="button" class="btn sec sm" data-a="rstd" data-k="${key}"><i class="i i-undo"></i> Use the standard</button>`); }
}

/* ---- changes, live figures, preview ---- */
function qmkChanged(touched, items) {
  if (canW('quotes')) QMK.dirty = true;
  QMK.rev = (QMK.rev || 0) + 1;
  if (touched) QMK.touched = true;
  if (items && (QMK.doc.snap || QMK.doc.snap_settings)) { delete QMK.doc.snap; delete QMK.doc.snap_settings; QMK.snapOld = false; $$('.qm-snap').forEach(e => e.remove()); } /* the frozen settings go with the snapshot */
  qmkHead(); clearTimeout(QMK.t); QMK.t = setTimeout(qmkRender, 150);
}
function qmkLive(lines, calc) {
  $$('#qmtabs [data-qt]').forEach(b => b.classList.toggle('qm-tw', qmkWarn(b.dataset.qt)));
  const s = $('#qmsum'); if (s) s.innerHTML = qmkSum(calc);
  const g = $('#qmguide'); if (g) g.innerHTML = qmkGuide(lines);
  const sb = $('#qmsub'); if (sb) sb.placeholder = 'Automatic: ' + QM.inr(calc.subsidyAuto);
  const k = $('[data-qml="kseb"]'); if (k) k.textContent = '₹' + QM.inr(calc.kseb.total);
}
const qmkPvVisible = () => { const e = $('#qmpv'); return !!(e && e.getClientRects().length); };
async function qmkRender() {
  clearTimeout(QMK.t);
  if (!qmkOn()) return;
  const { lines, calc } = qmkCalc();
  qmkLive(lines, calc);
  if (QMK.pdf || !qmkPvVisible()) { QMK.stale = true; return; } /* while the PDF is made its pages stay as they are; qmkPdf renders once afterwards */
  QMK.stale = false;
  const box = $('#qmpages'), sc = $('#qmpvsc'), top = sc.scrollTop;
  qmMount(box, qmPagesHtml(qmkPrintDoc(), lines, calc, qmkSettings()));
  const tok = box._qmTok;
  qmkScale(); sc.scrollTop = top; qmkPno();
  await box._qmReady;
  if (!qmkOn() || box._qmTok !== tok) return;
  qmkScale(); qmkPno(); qmkOver(box._qmOverflow || []);
}
function qmkScale() {
  const sc = $('#qmpvsc'), w = $('#qmpvs'), pg = $('#qmpages'); if (!sc || !pg || !sc.clientWidth) return;
  const s = Math.min(1, (sc.clientWidth - 24) / 794);
  pg.style.transform = `scale(${s})`; w.style.width = Math.floor(794 * s) + 'px'; w.style.height = Math.ceil(pg.offsetHeight * s) + 'px';
}
function qmkOver(over) {
  QMK.over = over;
  const w = $('#qmwarn'), b = $('#qmpdf');
  w.hidden = !over.length;
  w.innerHTML = over.length ? `<i class="i i-alert"></i><span><b>Too long for A4.</b> ${esc(over.join(' · '))}. Shorten the text on ${over.length === 1 ? 'that page' : 'those pages'}: the PDF cannot be made until everything fits.</span>` : '';
  if (b) { b.disabled = !!over.length; b.title = over.length ? 'Some pages are too long for A4 (see the preview)' : ''; }
}
function qmkCurPage() {
  const pg = $$('#qmpages > .qp'), sc = $('#qmpvsc'); if (!pg.length || !sc) return 0;
  const sr = sc.getBoundingClientRect(), top = Math.max(sr.top, 64), ref = top + Math.max(40, (Math.min(sr.bottom, innerHeight) - top) / 3); let n = 0;
  pg.forEach((p, i) => { if (p.getBoundingClientRect().top <= ref) n = i; }); /* the page in the upper third of the visible area */
  return n;
}
function qmkPno() { const e = $('#qmpno'), n = $$('#qmpages > .qp').length; if (e) e.textContent = n ? `Page ${qmkCurPage() + 1} of ${n}` : ''; }
function qmkPage(dir) {
  const pg = $$('#qmpages > .qp'), sc = $('#qmpvsc'); if (!pg.length) return;
  const p = pg[Math.max(0, Math.min(pg.length - 1, qmkCurPage() + dir))], r = p.getBoundingClientRect(), sr = sc.getBoundingClientRect();
  if (sc.scrollHeight > sc.clientHeight + 2) sc.scrollTo({ top: sc.scrollTop + r.top - sr.top - 12, behavior: 'smooth' });
  else window.scrollTo({ top: scrollY + r.top - 120, behavior: 'smooth' });
}

/* ---- save, PDF, more ---- */
async function qmkSave() {
  const d = QMK.doc;
  if (!(QMK.cust.customer_id || QMK.cust.lead_id)) { QMK.picking = false; qmkTab('customer'); toast('Choose a customer or lead first', true); const q = $('#qmcq'); if (q) q.focus(); return false; }
  if (!(+d.price > 0)) { qmkTab('price'); toast('Type the package price first', true); const p = $('#qmprice'); if (p) p.focus(); return false; }
  const { lines, calc } = qmkCalc(), st = qmkSt(), b = $('#qmsave');
  d.snap = qmkCopy(lines); /* the saved quotation keeps printing exactly these lines, even if products change later */
  d.snap_settings = QM.snapSettings(st, st.subsidy_rates); /* ...with these settings and subsidy rates (dropped with snap on an item edit) */
  QMK.busy = true; if (b) { b.disabled = true; b.textContent = 'Saving…'; }
  const rev = QMK.rev;
  try {
    const r = await api('qm', 'save', { id: QMK.id || undefined, customer_id: QMK.cust.customer_id || null, lead_id: QMK.cust.lead_id || null, status: QMK.status, subsidy: calc.subsidy, doc: d });
    d.number = r.number; QMK.id = r.id; QMK.dirty = QMK.rev !== rev; /* typed while saving: still unsaved */ QMK.snapOld = false;
    const h = '#/quotes/' + r.id; if (location.hash !== h) history.replaceState(null, '', h); QMK.hash = h;
    qmkHead(); if (QMK.tab === 'customer') qmkTab('customer');
    toast('Saved · ' + r.number); qmkRender();
    return true;
  } catch (e) { if (!e || !e.error) { console.error(e); toast((e && e.message) || String(e), true); } return false; }
  finally { QMK.busy = false; if (b) { b.disabled = false; b.textContent = 'Save'; } }
}
const qmkSaveBtn = () => { if (!QMK.busy) qmkSave(); };
const qmkFileName = () => { const { calc } = qmkCalc(), d = QMK.doc;
  return [calc.title, d.customer.name, String(d.number || '').replace(/\//g, '-')].map(s => String(s || '').trim()).filter(Boolean).join(' - ').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').slice(0, 180) + '.pdf'; };
async function qmkPdf() {
  if (QMK.busy) return;
  if (canW('quotes') && (QMK.dirty || !QMK.id)) { if (!await qmkSave()) return; }
  else if (!QMK.id) { toast('Save the quotation first', true); return; }
  if (!qmkPvVisible()) qmkTab('preview'); /* phones: the pages have to be on screen to be measured and drawn */
  const b = $('#qmpdf'), box = $('#qmpages'), old = b.innerHTML;
  QMK.busy = true; b.disabled = true; b.innerHTML = '<i class="i i-download"></i> Making PDF…';
  try {
    await qmkRender();
    QMK.pdf = true; /* edits made from here on wait (qmkRender would replace the pages being drawn) */
    if ((box._qmOverflow || []).length) throw new Error('Some pages are too long for A4: ' + box._qmOverflow.join('; ') + '. Shorten their text first.');
    await qmDownloadPdf(box, qmkFileName());
  } catch (e) { if (!e || !e.error) toast((e && e.message) || String(e), true); }
  finally { QMK.busy = false; QMK.pdf = false; b.innerHTML = old; b.disabled = !!QMK.over.length; if (QMK.stale) qmkRender(); }
}
function qmkMore(btn) {
  const w = canW('quotes'), c = QMK.cust;
  popMenu(btn, [['wa', 'whatsapp', 'Send on WhatsApp'], w && QMK.status === 'Accepted' && c.customer_id && ['proj', 'project', 'Create project'], w && ['del', 'trash', 'Delete quotation']], qmkTry(async a => {
    if (a !== 'del' && QMK.dirty && w && !(await qmkSave())) return;
    const d = QMK.doc, { calc } = qmkCalc();
    if (a === 'wa') waOpen({ name: d.customer.name, phone: d.customer.mobile, customer_id: c.customer_id || null, lead_id: c.lead_id || null, amount: QM.inr(d.price), quote_no: d.number });
    if (a === 'proj') projectModal(0, { customer_id: c.customer_id, title: calc.plantKw + ' kW rooftop solar', cost: Math.round(+d.price || 0), stage: 'Approval' });
    if (a === 'del' && confirm(`Delete quotation ${d.number}?\n\nIt goes to the Recycle bin.`)) { await api('quotes', 'delete', { id: QMK.id }); QMK.dirty = false; location.hash = '#/quotes'; }
  }));
}
/* Products & rates (Task 7) calls this after its dialog closes: fresh catalogue and settings, same quotation */
async function qmRefresh() {
  if (!qmkOn()) return;
  const b = await api('qm', 'boot'); if (!qmkOn()) return;
  QMK.boot = b; QMK.snapOld = qmkSnapOld(); if (QMK.tpl && !qmkTplById(QMK.tpl)) QMK.tpl = '';
  qmkTplSel(); qmkTab(QMK.tab); qmkRender();
}

/* ---- events (one set of listeners on #qmk; the editor is redrawn per tab) ---- */
function qmkOnInput(e) {
  const t = e.target, d = QMK.doc, f = t.dataset.f, l = t.dataset.l;
  if (f) { qmkSet(d, f, t.type === 'number' ? (t.value === '' ? '' : +t.value) : t.value); qmkChanged(!/^(customer|sales)\.|^(date|valid_days)$/.test(f)); return; }
  if (l) {
    const [c, i, k] = l.split('|'), it = (d.items[c] || [])[i]; if (!it) return;
    if (k === 'qty') return qmkQty(c, +i, t.value, t);
    qmkSet(it, k, t.value); qmkChanged(true, true); qmkLineInfo(c);
    const ln = t.closest('.qm-line');
    if (k === 'custom.name') $('.qm-lt b', ln).textContent = t.value || 'Your own line';
    if (k === 'over.name') $('.qm-lt small', ln).textContent = 'Prints as “' + (t.value || t.placeholder) + '”';
    if (k === 'custom.unit') $('.qm-unit', ln).textContent = t.value || 'no';
    return;
  }
  if (t.dataset.r) return qmkRowsRead(t.dataset.r.split('|')[0]);
  if (t.id === 'qmprice') { d.price = qmkNum(t.value); qmkChanged(true); }
  else if (t.id === 'qmsub') { d.subsidy = t.value.trim() === '' ? null : qmkNum(t.value); qmkChanged(true); }
  else if (t.id === 'qmcq') qmkFind(t.value);
}
function qmkOnChange(e) {
  const t = e.target;
  if (t.id === 'qmtpl') qmkUseTpl(t.value);
  else if (t.id === 'qmst') { QMK.status = t.value; qmkChanged(false); }
  else if (t.id === 'qmloan') { QMK.doc.loan = t.checked; qmkChanged(true); if (t.checked) setTimeout(() => qmkPvShow($('#qmpages .qp-loan')), 450); }
}
function qmkOnBlur(e) {
  const t = e.target;
  if ((t.id === 'qmprice' || t.id === 'qmsub' || /\|amount$/.test(t.dataset.r || '')) && t.value.trim() !== '') t.value = QM.inr(qmkNum(t.value));
}
function qmkOnKey(e) {
  if (e.target.id === 'qmcq' && e.key === 'Enter') { e.preventDefault(); const b = $('#qmres [data-a="who"]'); if (b) b.click(); }
}
function qmkOnClick(e) {
  const tb = e.target.closest('[data-qt]'); if (tb) return qmkTab(tb.dataset.qt);
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const id = b.id, a = b.dataset.a, k = b.dataset.k || '', d = QMK.doc;
  if (id === 'qmsave') return qmkSaveBtn();
  if (id === 'qmpdf') return qmkPdf();
  if (id === 'qmtnew') return qmkTplNew();
  if (id === 'qmtupd') return qmkTplUpd();
  if (id === 'qmtdel') return qmkTplDel();
  if (id === 'qmmore') return qmkMore(b);
  if (id === 'qmgear') return typeof qmOpenSettings === 'function' && qmOpenSettings();
  if (id === 'qmpp' || id === 'qmpn') return qmkPage(id === 'qmpp' ? -1 : 1);
  if (a === 'go') return qmkTab(k);
  if (a === 'pick') { const [c, p] = k.split('|'); return qmkPick(c, +p); }
  if (a === 'who') {
    const [ty, rid] = k.split('|'), r = (ty === 'lead' ? QMK.ls : QMK.cs).find(x => x.id == rid); if (!r) return;
    qmkWhoFill(r, ty); QMK.picking = false; qmkChanged(false); qmkTab('customer'); return;
  }
  if (a === 'whoc' || a === 'whox') { QMK.picking = a === 'whoc'; qmkTab('customer'); const q = $('#qmcq'); if (q) q.focus(); return; }
  if (a === 'rm') {
    const [c, i] = k.split('|'), its = d.items[c] || []; its.splice(+i, 1); if (!its.length) delete d.items[c];
    qmkChanged(true, true); return qmkTab(c);
  }
  if (a === 'dq') { const [c, i, s] = k.split('|'), it = (d.items[c] || [])[i]; if (!it) return; const inp = $(`[data-l="${c}|${i}|qty"]`); qmkQty(c, +i, Math.max(0, (inp ? qmkNum(inp.value) : +it.qty || 0) + +s), null); if (inp) inp.value = it.qty; return; }
  if (a === 'add') return qmkAdd(k, b);
  if (a === 'rstd') { d[k] = null; qmkChanged(true); return qmkTab('price'); }
  if (a === 'radd' || a === 'rrm') {
    const [key, i] = k.split('|'), rows = qmkRowsOf(key, qmkCalc().calc);
    if (a === 'radd') rows.push(key === 'kseb' ? { label: '', amount: 0 } : key === 'pay' ? { amt: '', text: '' } : ''); else rows.splice(+i, 1);
    d[key] = rows; qmkChanged(true); qmkTab('price');
    if (a === 'radd') { const rs = $$(`[data-list="${key}"] .qm-row`), last = rs[rs.length - 1]; if (last) $('input,textarea', last).focus(); }
  }
}

/* ---- leaving with unsaved changes, resizing, Ctrl+S ---- */
(() => {
  const prev = window.onhashchange;
  window.onhashchange = e => {
    if (QMK.dirty && qmkOn() && location.hash !== QMK.hash) {
      if (!confirm('This quotation has changes that are not saved.\n\nLeave without saving?')) { history.replaceState(null, '', QMK.hash); return; }
      QMK.dirty = false;
    }
    return prev ? prev.call(window, e) : undefined;
  };
  addEventListener('beforeunload', e => { if (QMK.dirty && qmkOn()) { e.preventDefault(); e.returnValue = ''; } });
  addEventListener('resize', debounce(() => {
    if (!qmkOn()) return;
    if (QMK.tab === 'preview' && qmkWide()) qmkTab('customer');
    qmkScale(); qmkPno(); if (QMK.stale && qmkPvVisible()) qmkRender();
  }, 120));
  addEventListener('scroll', () => { if (qmkOn() && !qmkWide()) qmkPno(); }, { passive: true });
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key || '').toLowerCase() === 's' && qmkOn() && canW('quotes')) { e.preventDefault(); qmkSaveBtn(); } });
})();
