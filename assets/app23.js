// Quotation maker: the gear (admin only). Products & rates, and Quotation settings, in one dialog.
// Needs: $, $$, esc, api, toast, modal (app.js), qmImgUrl (app21.js); QMK / qmRefresh (app22.js). CSS: .qm* in assets/quote.css.
// Every value inserted into HTML goes through esc(). Settings texts keep their **bold** marks exactly as typed.
const QMG = { b: null, m: null, tab: 'prod', cat: '', E: null, ST: null, next0: 0, nextN: 0, dirty: false };
const qmgI = n => `<i class="i i-${n}"></i>`;
const qmgStar = on => `<svg class="qmg-star${on ? ' on' : ''}" viewBox="0 0 24 24" width="17" height="17" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>`;
const qmgInr = n => '₹' + (typeof QM !== 'undefined' && QM.inr ? QM.inr(n) : String(n));
const qmgClone = o => JSON.parse(JSON.stringify(o));
const QMG_PH = '{rate} {margin_pct} {min_margin} {after} {loan} {subsidy} {max90} {margin90} {kwp} {units} {tariff} {phase} {days} {gross} {loan_pct}';

async function qmOpenSettings() {
  let b;
  try { b = await api('qm', 'boot'); } catch (e) { return; }
  QMG.b = b; QMG.tab = 'prod'; QMG.cat = (b.cats[0] || [''])[0]; QMG.E = null; QMG.dirty = false;
  QMG.ST = qmgClone(b.settings); QMG.nextN = QMG.next0 = +b.next_n || 144;
  const m = modal('<div id="qmg"></div>', true); m.classList.add('qmgmod'); QMG.m = m;
  const guard = e => { if (e.target === m && QMG.dirty && document.body.contains(m)) { if (!confirm('You have changes that are not saved. Close anyway?')) { e.stopPropagation(); e.preventDefault(); m._md = false; } } };
  document.addEventListener('mouseup', guard, true);
  const mo = new MutationObserver(() => { if (!document.body.contains(m)) { mo.disconnect(); document.removeEventListener('mouseup', guard, true); QMG.m = null; if (typeof qmRefresh === 'function') qmRefresh(); } });
  mo.observe(document.body, { childList: true });
  const root = $('#qmg', m);
  root.addEventListener('click', qmgClick); root.addEventListener('input', qmgInput); root.addEventListener('change', qmgChange);
  qmgShell();
}
function qmgClose() { if (QMG.m && (!QMG.dirty || confirm('You have changes that are not saved. Close anyway?'))) QMG.m.remove(); }

function qmgShell() {
  const root = $('#qmg', QMG.m);
  root.innerHTML = `<div class="qmg-top"><h3>Quotation maker setup</h3><button type="button" class="btn sec qm-ibtn" data-a="close" aria-label="Close" title="Close">${qmgI('x')}</button></div>
    <div class="tabs"><button type="button" data-a="tab" data-k="prod" class="${QMG.tab === 'prod' ? 'on' : ''}">Products &amp; rates</button><button type="button" data-a="tab" data-k="set" class="${QMG.tab === 'set' ? 'on' : ''}">Quotation settings</button></div>
    <div id="qmgbody"></div>`;
  qmgBody();
}
function qmgBody() { QMG.tab === 'prod' ? qmgProducts() : qmgSettings(); }

/* ================= Products & rates ================= */
const qmgProds = c => QMG.b.products.filter(p => p.cat === c);
function qmgBrandsHtml(brands) {
  return (brands || []).map(br => `<span class="qmg-bl">${br.label ? `<small>${esc(br.label)}</small>` : ''}${(br.logos || []).map(l => String(l).startsWith('text:') ? `<b>${esc(String(l).slice(5))}</b>` : `<img src="${esc(qmImgUrl(l))}" alt="">`).join('')}</span>`).join('');
}
function qmgProducts() {
  const b = QMG.b, body = $('#qmgbody', QMG.m);
  if (QMG.E) return qmgForm(body);
  const cats = b.cats.map(([k, l]) => `<button type="button" data-a="cat" data-k="${esc(k)}" class="${QMG.cat === k ? 'on' : ''}"><span>${esc(l)}</span><small>${qmgProds(k).length}</small></button>`).join('')
    + `<button type="button" data-a="kseb"><span>KSEB charges</span>${qmgI('chev')}</button>`;
  const fin = !!b.finance, label = (b.cats.find(c => c[0] === QMG.cat) || [0, ''])[1];
  const cards = qmgProds(QMG.cat).map(p => `<div class="qmg-card${p.hidden ? ' qmg-off' : ''}">
      <div class="qmg-pic">${p.picture ? `<img src="${esc(qmImgUrl(p.picture))}" alt="">` : `<span>${qmgI('file')}</span>`}</div>
      <div class="qmg-info"><div class="qmg-nm"><b>${esc(p.name)}</b>${p.hidden ? ' <em>Hidden</em>' : ''}</div>
        <div class="qmg-sh">${esc(p.label)}${p.wp ? ` · ${esc(p.wp)} Wp` : ''}${p.kw ? ` · ${esc(p.kw)} kW` : ''}</div>
        ${p.line ? `<div class="qmg-ln">${esc(p.line)}</div>` : ''}${p.details ? `<div class="qmg-dt">${esc(p.details)}</div>` : ''}
        <div class="qmg-meta">${(p.warranty || []).map(w => `<span class="qmg-chip">${esc(w.years)}${w.years ? ' yr ' : ''}${esc(w.label)}</span>`).join('')}${qmgBrandsHtml(p.brands)}</div></div>
      <div class="qmg-side">${fin ? `<div class="qmg-rate">${+p.rate ? `${qmgInr(p.rate)}<small> per ${esc(p.unit === 'no' ? 'unit' : p.unit)}</small>` : '<small>No rate</small>'}</div>` : ''}
        <div class="qmg-act"><button type="button" class="qmg-starb${p.is_default ? ' on' : ''}" data-a="def" data-k="${p.id}" title="${p.is_default ? 'Default for new quotations (click to clear)' : 'Make the default for new quotations'}" aria-pressed="${p.is_default ? 'true' : 'false'}">${qmgStar(p.is_default)}</button>
          <button type="button" class="btn sec sm" data-a="edit" data-k="${p.id}">${qmgI('pencil')} Edit</button>
          <button type="button" class="btn sec sm" data-a="hide" data-k="${p.id}">${qmgI('eye')} ${p.hidden ? 'Show' : 'Hide'}</button></div></div></div>`).join('');
  body.innerHTML = `<div class="qmg-cols"><nav class="qmg-cats" aria-label="Categories">${cats}</nav>
    <div class="qmg-main"><div class="qmg-mh"><h4>${esc(label)}</h4><button type="button" class="btn sm" data-a="add">${qmgI('plus')} Add product</button></div>
    <p class="qm-hint">The star marks the product new quotations start with. Hidden products leave the maker's choices but still print on quotations and templates that use them.</p>
    ${cards || '<p class="qmg-empty">No products in this category yet.</p>'}</div></div>`;
}
const qmgBlank = cat => ({ id: 0, cat, label: '', name: '', line: '', details: '', title: '', unit: 'no', qty: 1, qty_note: '', wp: 0, kw: 0, kw_line: 0, needs_opt: 0, warranty: [], brands: [{ label: '', logos: [] }], picture: '', page: '', rate: 0, is_default: 0, hidden: 0 });
function qmgImgField(k, label, hint) {
  const v = QMG.E[k];
  return `<div class="qmg-up"><label>${label}</label><div class="qmg-upr">${v ? `<img src="${esc(qmImgUrl(v))}" alt="">` : '<span class="qmg-none">None</span>'}
    <div><button type="button" class="btn sec sm" data-a="up" data-k="${k}">${qmgI('upload')} ${v ? 'Replace' : 'Upload'}</button>${v ? ` <button type="button" class="btn sec sm" data-a="clr" data-k="${k}">${qmgI('x')} Remove</button>` : ''}</div></div>${hint ? `<small class="qm-hint">${hint}</small>` : ''}</div>`;
}
function qmgForm(body) {
  const E = QMG.E, b = QMG.b, fin = !!b.finance, t = (k, l, extra = '') => `<div><label>${l}</label><input data-e="${k}" value="${esc(E[k])}" ${extra}></div>`;
  const n = (k, l, extra = '') => `<div><label>${l}</label><input data-e="${k}" type="number" step="any" min="0" value="${esc(E[k])}" ${extra}></div>`;
  const known = []; b.products.forEach(p => (p.brands || []).forEach(br => (br.logos || []).forEach(l => { if (!String(l).startsWith('text:') && !known.includes(l)) known.push(l); })));
  const brands = E.brands.map((br, i) => `<div class="qmg-br"><div class="qmg-brh"><input data-e-br="${i}" data-f="label" placeholder="Label (BOX, MCB, SPD… or blank)" value="${esc(br.label)}" aria-label="Brand label"><button type="button" class="btn bad sm" data-a="brdel" data-k="${i}" aria-label="Remove this brand row">${qmgI('trash')}</button></div>
      <div class="qmg-logos">${br.logos.map((l, j) => `<span class="qmg-lg">${String(l).startsWith('text:') ? `<b>${esc(String(l).slice(5))}</b>` : `<img src="${esc(qmImgUrl(l))}" alt="">`}<button type="button" data-a="lgdel" data-k="${i}|${j}" aria-label="Remove logo">${qmgI('x')}</button></span>`).join('') || '<small class="qm-hint">No logos yet</small>'}</div>
      <div class="qmg-lgadd"><button type="button" class="btn sm" data-a="lgup" data-k="${i}">${qmgI('upload')} Upload logo</button>
        <input data-txt="${i}" placeholder="or a brand name as text" aria-label="Brand name as text"><button type="button" class="btn sec sm" data-a="lgtxt" data-k="${i}">Add name</button>
        ${known.length ? `<select data-pick="${i}" aria-label="Use a logo already in the catalogue"><option value="">Use an existing logo…</option>${known.map(l => `<option value="${esc(l)}">${esc(String(l).replace(/^assets\/quote\//, ''))}</option>`).join('')}</select>` : ''}</div></div>`).join('');
  const war = E.warranty.map((w, i) => `<div class="qmg-wr"><input data-e-w="${i}" data-f="years" placeholder="Years" value="${esc(w.years)}" aria-label="Warranty years"><input data-e-w="${i}" data-f="label" placeholder="Warranty box label (e.g. Panels product)" value="${esc(w.label)}" aria-label="Warranty label"><button type="button" class="btn bad sm" data-a="wdel" data-k="${i}" aria-label="Remove warranty">${qmgI('trash')}</button></div>`).join('');
  body.innerHTML = `<div class="qmg-form"><div class="qmg-mh"><h4>${E.id ? 'Edit product' : 'Add product'}</h4></div>
    <div class="qmg-g">
      <div><label>Category</label><select data-e="cat">${b.cats.map(([k, l]) => `<option value="${esc(k)}" ${E.cat === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      ${t('label', 'Short name shown in the maker *', 'maxlength="80" placeholder="e.g. Waaree 580 Wp"')}
      <div class="full"><label>Name as printed *</label><input data-e="name" maxlength="120" value="${esc(E.name)}" placeholder="e.g. Waaree 580 Wp TOPCon"></div>
      <div class="full"><label>Plain sentence</label><input data-e="line" maxlength="300" value="${esc(E.line)}" placeholder="Make electricity from sunlight."></div>
      <div class="full"><label>Details paragraph</label><textarea data-e="details" rows="3" maxlength="2000">${esc(E.details)}</textarea></div>
      ${qmgImgField('picture', 'Picture', 'Shown beside the item name on the quotation and on the maker card.')}
      ${qmgImgField('page', 'Attached full-page picture (optional)', 'Printed as its own page after the quotation, for example the StormShield page.')}
      ${t('unit', 'Unit', 'maxlength="30" placeholder="no, m, set…"')}${n('qty', 'Default quantity')}${t('qty_note', 'Quantity note', 'maxlength="80" placeholder="e.g. 2.4+ kWp"')}
      <div data-cats="panels">${n('wp', 'Panel Wp')}</div>
      <div data-cats="inverter">${n('kw', 'Inverter kW')}</div>
      <div data-cats="inverter" class="qmg-ck"><label><input type="checkbox" data-e="kw_line" ${E.kw_line ? 'checked' : ''}> kW is for the whole line (a matched set)</label></div>
      <div data-cats="inverter" class="qmg-ck"><label><input type="checkbox" data-e="needs_opt" ${E.needs_opt ? 'checked' : ''}> Needs optimisers</label></div>
      <div data-cats="inverter" class="full"><label>Words for the quote title</label><input data-e="title" maxlength="80" value="${esc(E.title)}" placeholder="e.g. TSUN Microinverter"></div>
      ${fin ? n('rate', 'Rate (₹ per unit)') : ''}
      <div class="qmg-ck"><label><input type="checkbox" data-e="is_default" ${E.is_default ? 'checked' : ''}> Default for new quotations</label></div>
      <div class="qmg-ck"><label><input type="checkbox" data-e="hidden" ${E.hidden ? 'checked' : ''}> Hidden from the maker</label></div>
    </div>
    <h5>Warranty</h5><div class="qmg-list">${war}</div><button type="button" class="btn sec sm" data-a="wadd">${qmgI('plus')} Add warranty</button>
    <h5>Brand logos</h5><small class="qm-hint">Printed in the BRAND column of the quotation. Upload the brand's logo (PNG, JPG or WebP, up to 5 MB), type the brand name if you have no logo, or reuse a logo already in the list. For boxes with several makes, add a row per part with a label such as BOX, MCB or SPD.</small>
    <div class="qmg-list">${brands}</div><button type="button" class="btn sec sm" data-a="bradd">${qmgI('plus')} Add another brand row (BOX / MCB / SPD…)</button>
    <div class="qmg-bar"><button type="button" class="btn" data-a="psave">${qmgI('check')} Save product</button><button type="button" class="btn sec" data-a="pcancel">Cancel</button></div></div>
    <input type="file" id="qmgfile" accept="image/png,image/jpeg,image/webp" hidden>`;
  qmgCatVis();
}
function qmgCatVis() { const c = QMG.E && QMG.E.cat; $$('#qmgbody [data-cats]', QMG.m).forEach(e => { e.hidden = e.dataset.cats !== c; }); }

/* choose a file and upload it; resolves to the new ref, or '' when cancelled */
function qmgPick() {
  return new Promise(res => {
    const f = $('#qmgfile', QMG.m); f.value = '';
    f.onchange = async () => {
      if (!f.files[0]) return res('');
      const fd = new FormData(); fd.append('file', f.files[0]);
      try { const r = await api('qm', 'upload', fd); res(r.ref || ''); } catch (e) { res(''); }
    };
    f.click();
  });
}
async function qmgReload() { const b = await api('qm', 'boot'); QMG.b = b; if (!QMG.dirty) { QMG.ST = qmgClone(b.settings); QMG.next0 = QMG.nextN = +b.next_n || 144; } }
async function qmgSaveProduct() {
  const E = QMG.E, b = QMG.b;
  if (!String(E.label).trim()) return toast('Enter the short name shown in the maker');
  if (!String(E.name).trim()) return toast('Enter the name as printed');
  const keep = ['id', 'cat', 'label', 'name', 'line', 'details', 'title', 'unit', 'qty', 'qty_note', 'wp', 'kw', 'kw_line', 'needs_opt', 'picture', 'page', 'is_default', 'hidden'];
  const p = {}; keep.forEach(k => { p[k] = E[k]; });
  if (!E.id) delete p.id;
  if (b.finance) p.rate = E.rate;
  p.warranty = E.warranty; p.brands = E.brands.filter(br => br.logos.length).map(br => ({ label: br.label, logos: br.logos })); /* empty rows are not saved */
  ['qty', 'wp', 'kw', 'rate'].forEach(k => { if (k in p) p[k] = +p[k] || 0; });
  try { await api('qm', 'product_save', p); } catch (e) { return; }
  QMG.cat = E.cat; QMG.E = null; QMG.dirty = false; await qmgReload(); toast('Product saved'); qmgBody();
}

/* ================= Quotation settings ================= */
const QMG_LBL = { line1: 'Name, first line', line2: 'Name, second line', gstin: 'GSTIN line', name: 'Company name', phone: 'Phone', email: 'Email', lines: 'Header lines', footer: 'Footer line', site: 'Website', bank: 'Bank', account: 'Account number', ifsc: 'IFSC', pill: 'Pill text', valid_days: 'Valid for (days)', number_format: 'Number format', feas: 'Feasibility charge (₹)', reg_per_kw: 'Registration (₹ per kW)', stamp: 'Stamp paper (₹)', feas_label: 'Feasibility label', reg_label: 'Registration label', stamp_label: 'Stamp paper label', margin_pct: 'Minimum margin (%)', rate: 'Interest rate (% a year)', months: 'Repayment periods (months)', units_per_kwp: 'Units per kWp a year', tariff: 'Tariff (₹ per unit)', cap: 'Loan cap for this rate (₹)', amt: 'Amount', text: 'Text', label: 'Label', t: 'Step', d: 'Detail' };
const QMG_LONG = new Set(['sub', 'margin_note', 'loan_note', 'subsidy_note', 'illustration', 'footnote', 'saving_calc', 'helpline', 'text', 'd']);
const qmgLbl = k => QMG_LBL[k] || String(k).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const qmgGet = path => path.split('.').reduce((o, k) => (o == null ? o : o[k]), QMG.ST);
function qmgSet(path, v) { const ks = path.split('.'), last = ks.pop(), o = ks.reduce((a, k) => a[k], QMG.ST); o[last] = v; QMG.dirty = true; }
const qmgField = (path, label, long) => { const v = qmgGet(path); return typeof v === 'number'
  ? `<div><label>${esc(label)}</label><input data-p="${esc(path)}" data-num="1" type="number" step="any" value="${esc(v)}"></div>`
  : `<div${long ? ' class="full"' : ''}><label>${esc(label)}</label>${long ? `<textarea data-p="${esc(path)}" rows="2">${esc(v)}</textarea>` : `<input data-p="${esc(path)}" value="${esc(v)}">`}</div>`; };
/* a list editor: strings, numbers or small objects */
function qmgList(path, label, keys) {
  const arr = qmgGet(path) || [];
  const rows = arr.map((it, i) => {
    let inner;
    if (keys) inner = keys.map(k => `<div class="${QMG_LONG.has(k) ? 'qmg-grow' : ''}"><label>${esc(qmgLbl(k))}</label>${QMG_LONG.has(k) ? `<textarea data-p="${esc(path)}.${i}.${k}" rows="2">${esc(it[k])}</textarea>` : `<input data-p="${esc(path)}.${i}.${k}" value="${esc(it[k])}">`}</div>`).join('');
    else if (typeof it === 'number') inner = `<div><input data-p="${esc(path)}.${i}" data-num="1" type="number" step="any" value="${esc(it)}" aria-label="${esc(label)}"></div>`;
    else inner = `<div class="qmg-grow"><textarea data-p="${esc(path)}.${i}" rows="2" aria-label="${esc(label)}">${esc(it)}</textarea></div>`;
    return `<div class="qmg-lr">${inner}<button type="button" class="btn bad sm" data-a="ldel" data-k="${esc(path)}|${i}" aria-label="Remove">${qmgI('trash')}</button></div>`;
  }).join('');
  return `<div class="full qmg-ls"><label>${esc(label)}</label>${rows}<button type="button" class="btn sec sm" data-a="ladd" data-k="${esc(path)}${keys ? '|' + keys.join(',') : ''}">${qmgI('plus')} Add</button></div>`;
}
const qmgSec = (id, title, body, bold) => `<details class="qmg-sec" id="qmgs-${id}" ${QMG.open === id || (QMG.open == null && id === 'num') ? 'open' : ''}><summary>${esc(title)}${bold ? '<span class="qmg-tag">**bold** works</span>' : ''}</summary><div class="qmg-g">${body}</div></details>`;
function qmgSettings() {
  const body = $('#qmgbody', QMG.m), S = QMG.ST, L = S.loan, T = L.texts;
  const textKeys = Object.keys(T).filter(k => typeof T[k] === 'string');
  const sections = [
    qmgSec('num', 'Numbering and validity', `<div><label>Quote number format</label><input data-p="number_format"  value="${esc(S.number_format)}"><small class="qm-hint">Use {YYYY} for the year and {NNNN} for the number.</small></div>
      <div><label>Next quotation number</label><input data-next type="number" min="1" step="1" value="${esc(QMG.nextN)}"><small class="qm-hint">Only change this to restart or skip numbers. It is used by the next saved quotation.</small></div>
      ${qmgField('valid_days', 'Valid for (days)')}${qmgField('pill', 'Pill text beside the title')}`),
    qmgSec('co', 'Company header', ['line1', 'line2', 'gstin', 'name', 'phone', 'email', 'site'].map(k => qmgField(k === 'site' ? 'site' : 'company.' + k, qmgLbl(k))).join('') + qmgList('company.lines', 'Header lines (label and text)', ['label', 'text'])),
    qmgSec('bank', 'Bank block', ['bank', 'name', 'account', 'ifsc'].map(k => qmgField('bank.' + k, k === 'bank' ? 'Bank' : k === 'name' ? 'Account name' : qmgLbl(k))).join('')),
    qmgSec('foot', 'Footer', qmgField('footer', 'Footer line', true)),
    qmgSec('del', 'Delivery and installation', qmgList('delivery', 'Delivery texts'), true),
    qmgSec('pay', 'Payment schedule', qmgList('pay', 'Payment steps (amount and text)', ['amt', 'text']), true),
    qmgSec('kseb', 'KSEB charges', ['feas', 'reg_per_kw', 'stamp', 'feas_label', 'reg_label', 'stamp_label'].map(k => qmgField('kseb.' + k, qmgLbl(k))).join('')),
    qmgSec('loan', 'Loan figures', ['margin_pct', 'rate', 'units_per_kwp', 'tariff', 'cap'].map(k => qmgField('loan.' + k, qmgLbl(k))).join('') + qmgList('loan.months', 'Repayment periods (months)') + '<p class="qm-hint full">Subsidy rates (₹ per kW and the cap) are set in Settings → Rates and are shared with the rest of the CRM.</p>'),
    qmgSec('lt', 'Loan texts', textKeys.map(k => qmgField('loan.texts.' + k, qmgLbl(k), QMG_LONG.has(k) || String(T[k]).length > 60)).join('')
      + qmgList('loan.texts.terms', 'SBI loan terms (list)') + qmgList('loan.texts.who', 'Who can apply (list)') + qmgList('loan.texts.steps', 'How to apply (steps)', ['t', 'd']), true),
    qmgSec('lts', 'Loan texts, small loans (2–3 kW)', '<p class="qm-hint full">Used instead of the matching loan texts above when the loan stays under the cap (usually 2 to 3 kW). Anything left out here falls back to the loan text above. Same placeholders and **bold** rules as the loan texts.</p>'
      + Object.keys(S.loan.texts_small || {}).filter(k => typeof S.loan.texts_small[k] === 'string').map(k => qmgField('loan.texts_small.' + k, qmgLbl(k), QMG_LONG.has(k) || String(S.loan.texts_small[k]).length > 60)).join('')
      + qmgList('loan.texts_small.terms', 'SBI loan terms (list)') + qmgList('loan.texts_small.who', 'Who can apply (list)'), true),
    qmgSec('terms', 'Terms and conditions', qmgList('terms', 'Terms'), true),
  ].join('');
  body.innerHTML = `<div class="qmg-hintbox"><b>Placeholders</b> that fill in automatically (loan texts, delivery, payment and terms): <code>${esc(QMG_PH)}</code><br>
    <b>**Bold**</b>: put two stars round words to print them bold. It works in the delivery texts, payment step texts, terms and the loan texts (title, labels, notes, helpline, steps, lists), but not in the loan sub-line or the four loan headings (EMI, terms, who can apply, how to apply), and not in the company, bank, footer, pill or KSEB label fields.</div>
    ${sections}<div class="qmg-bar"><button type="button" class="btn" data-a="ssave">${qmgI('check')} Save settings</button><button type="button" class="btn sec" data-a="sreset">Discard changes</button></div>`;
}
async function qmgSaveSettings() {
  const body = { settings: QMG.ST };
  const nn = Math.floor(+QMG.nextN);
  if (!(nn >= 1)) return toast('The next quotation number must be 1 or more');
  if (nn !== QMG.next0) body.next_number = nn;
  try { await api('qm', 'settings_save', body); } catch (e) { return; }
  QMG.dirty = false; await qmgReload(); QMG.dirty = false; toast('Settings saved'); qmgSettings();
}

/* ================= events ================= */
function qmgRead(t) {
  const E = QMG.E;
  if (t.dataset.e && E) { const k = t.dataset.e; E[k] = t.type === 'checkbox' ? (t.checked ? 1 : 0) : t.value; QMG.dirty = true; return k; }
  if (t.dataset.eBr !== undefined && E) { E.brands[+t.dataset.eBr][t.dataset.f] = t.value; QMG.dirty = true; }
  if (t.dataset.eW !== undefined && E) { E.warranty[+t.dataset.eW][t.dataset.f] = t.value; QMG.dirty = true; }
  if (t.dataset.p) { qmgSet(t.dataset.p, t.dataset.num ? (t.value === '' ? '' : +t.value) : t.value); }
  if (t.dataset.next !== undefined) { QMG.nextN = t.value; QMG.dirty = true; }
}
function qmgInput(e) { qmgRead(e.target); }
function qmgChange(e) {
  const t = e.target, k = qmgRead(t);
  if (k === 'cat') qmgCatVis();
  if (t.dataset.pick !== undefined && t.value && QMG.E) { QMG.E.brands[+t.dataset.pick].logos.push(t.value); QMG.dirty = true; qmgForm($('#qmgbody', QMG.m)); }
}
async function qmgClick(e) {
  const el = e.target.closest('[data-a]'); if (!el || !QMG.m) return;
  const a = el.dataset.a, k = el.dataset.k, E = QMG.E;
  if (a === 'close') return qmgClose();
  if (a === 'tab') { if (QMG.E && QMG.dirty && !confirm('Discard this unsaved product?')) return; QMG.E = null; QMG.tab = k; return qmgShell(); }
  if (a === 'cat') { QMG.cat = k; return qmgProducts(); }
  if (a === 'kseb') { QMG.tab = 'set'; QMG.open = 'kseb'; qmgShell(); const s = $('#qmgs-kseb', QMG.m); if (s) s.scrollIntoView({ block: 'nearest' }); return; }
  if (a === 'add') { QMG.E = qmgBlank(QMG.cat); QMG.dirty = false; return qmgProducts(); }
  if (a === 'edit') { const p = QMG.b.products.find(x => x.id == k); if (!p) return; QMG.E = Object.assign(qmgBlank(p.cat), qmgClone(p)); QMG.E.brands.forEach(br => { br.logos = br.logos || []; }); if (!QMG.E.brands.length) QMG.E.brands.push({ label: '', logos: [] }); QMG.dirty = false; return qmgProducts(); }
  if (a === 'def') { const p = QMG.b.products.find(x => x.id == k); if (!p) return; try { await api('qm', 'product_save', { id: p.id, is_default: p.is_default ? 0 : 1 }); } catch (x) { return; } await qmgReload(); return qmgProducts(); }
  if (a === 'hide') { const p = QMG.b.products.find(x => x.id == k); if (!p) return; try { await api('qm', 'product_save', { id: p.id, hidden: p.hidden ? 0 : 1 }); } catch (x) { return; } await qmgReload(); toast(p.hidden ? 'Shown in the maker' : 'Hidden from the maker'); return qmgProducts(); }
  if (a === 'pcancel') { if (QMG.dirty && !confirm('Discard your changes to this product?')) return; QMG.E = null; QMG.dirty = false; return qmgProducts(); }
  if (a === 'psave') return qmgSaveProduct();
  if (a === 'up') { const r = await qmgPick(); if (r) { E[k] = r; QMG.dirty = true; qmgForm($('#qmgbody', QMG.m)); } return; }
  if (a === 'clr') { E[k] = ''; QMG.dirty = true; return qmgForm($('#qmgbody', QMG.m)); }
  if (a === 'wadd') { E.warranty.push({ years: '', label: '' }); return qmgForm($('#qmgbody', QMG.m)); }
  if (a === 'wdel') { E.warranty.splice(+k, 1); QMG.dirty = true; return qmgForm($('#qmgbody', QMG.m)); }
  if (a === 'bradd') { E.brands.push({ label: '', logos: [] }); return qmgForm($('#qmgbody', QMG.m)); }
  if (a === 'brdel') { E.brands.splice(+k, 1); QMG.dirty = true; return qmgForm($('#qmgbody', QMG.m)); }
  if (a === 'lgup') { const r = await qmgPick(); if (r) { E.brands[+k].logos.push(r); QMG.dirty = true; qmgForm($('#qmgbody', QMG.m)); toast('Logo added — Save product to keep it'); } return; }
  if (a === 'lgtxt') { const inp = $(`[data-txt="${k}"]`, QMG.m), v = inp.value.trim().slice(0, 60); if (!v) return toast('Type the brand name first'); E.brands[+k].logos.push('text:' + v); QMG.dirty = true; return qmgForm($('#qmgbody', QMG.m)); }
  if (a === 'lgdel') { const [i, j] = k.split('|'); E.brands[+i].logos.splice(+j, 1); QMG.dirty = true; return qmgForm($('#qmgbody', QMG.m)); }
  if (a === 'ssave') return qmgSaveSettings();
  if (a === 'sreset') { if (QMG.dirty && !confirm('Discard all unsaved changes to the settings?')) return; QMG.ST = qmgClone(QMG.b.settings); QMG.nextN = QMG.next0; QMG.dirty = false; return qmgSettings(); }
  if (a === 'ladd') {
    const [path, keys] = k.split('|'), arr = qmgGet(path); if (!Array.isArray(arr)) return;
    arr.push(keys ? Object.fromEntries(keys.split(',').map(x => [x, ''])) : (path === 'loan.months' ? 60 : '')); QMG.dirty = true; QMG.open = (e.target.closest('details') || {}).id.replace('qmgs-', ''); return qmgSettings();
  }
  if (a === 'ldel') { const [path, i] = k.split('|'), arr = qmgGet(path); if (!Array.isArray(arr)) return; arr.splice(+i, 1); QMG.dirty = true; QMG.open = (e.target.closest('details') || {}).id.replace('qmgs-', ''); return qmgSettings(); }
}
