// Quotation maker: the printed quotation. A4 pages as HTML (live preview), pagination of the item rows, and the PDF download.
// Needs QM (app20.js) and esc() (app.js). Page classes start with .qp (assets/quote.css). Every text value goes through esc().
const QP_FONTS = ['400 12px Poppins', '500 12px Poppins', '600 12px Poppins', '700 12px Poppins'];
const QP_RATES = { per_kw_first2: 30000, third_kw: 18000, cap: 78000 };
const QP_MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
/* line icons for the delivery list (inline SVG with explicit colours, so html2canvas draws them too) */
const QP_ICONS = [
  '<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>',
];
const qpIcon = i => `<span class="qp-ico"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D8363D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${QP_ICONS[Math.min(i, QP_ICONS.length - 1)]}</svg></span>`;

/* image reference -> URL: built-in assets as they are, uploaded names through the API, anything else nothing */
function qmImgUrl(ref) {
  ref = String(ref == null ? '' : ref);
  if (/^assets\/[\w\/.-]+$/.test(ref) && ref.indexOf('..') < 0) return ref;
  if (/^qm-[0-9a-f]{24}\.(png|jpe?g|webp)$/.test(ref)) return 'api.php?m=qm&a=img&f=' + encodeURIComponent(ref);
  return '';
}
/* the lines that print: a saved quotation's snapshot, else the live catalogue */
function qmLines(doc, products) {
  const s = doc && doc.snap;
  return s && typeof s === 'object' && Object.keys(s).length ? s : QM.resolve(doc || {}, products || []);
}

const qpRs = n => '₹' + QM.inr(n);
const qpRich = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); /* **words** -> bold (after escaping) */
const qpDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${m[3]} ${QP_MON[+m[2] - 1] || ''} ${m[1]}` : String(d || ''); };
const qpVal = v => v == null || String(v).trim() === '' ? '—' : String(v);
const qpTitleCase = s => String(s || '').toLowerCase().replace(/(^|[\s-])(\S)/g, (m, a, b) => a + b.toUpperCase());
/* "Inverter" -> "inverter", "3-Phase" -> "3-phase"; brand words (TSUN, SolarEdge) stay */
const qpLc = w => w.split('-').every(p => /^(\d+|[A-Z][a-z]+)$/.test(p)) && /[a-z]/.test(w) ? w.toLowerCase() : w;
/* two-line labels: "Panels product" -> Panels / product, "Energy meter replacement" -> Energy meter / replacement */
const qpSplit = s => {
  const w = String(s || '').trim().split(/\s+/);
  if (w.length < 2) return [w.join(' '), ''];
  const k = w.length > 2 && w[0].length < 7 ? 2 : 1;
  return [w.slice(0, k).join(' '), w.slice(k).join(' ')];
};
const qpCats = lines => QM.ROWS.concat(Object.keys(lines || {}).filter(k => QM.ROWS.indexOf(k) < 0));
const qpKv = rows => '<table class="qp-kv" data-nofit="1">' + rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(qpVal(v))}</td></tr>`).join('') + '</table>';
const qpCard = (title, body, cls) => `<div class="qp-card${cls ? ' ' + cls : ''}"><div class="qp-ct"><span class="qp-tick"></span>${esc(title)}</div>${body}</div>`;
const qpSec = (title, cls) => `<div class="qp-sec${cls ? ' ' + cls : ''}"><span class="qp-dash"></span>${esc(title)}</div>`;
const qpCols = n => `style="grid-template-columns:repeat(${Math.max(1, Math.min(n, 6))},minmax(0,1fr))"`;

function qpPage(cls, ctx, inner) {
  return `<div class="qp ${cls}"><div class="qp-bar"></div><div class="qp-in">${inner}</div>`
    + `<div class="qp-foot"><span>${esc(ctx.site)}</span><span class="qp-fc">${esc(ctx.footer)}</span><span class="qp-pno"></span></div></div>`;
}
const qpHead = ctx => `<div class="qp-hd"><img src="assets/quote/jasper-logo.png" alt=""><span class="qp-hdt">${esc(ctx.title)} · PMSGY</span><b>${esc(ctx.co.name || '')}</b></div>`;
const qpH1 = (html, sub) => `<div class="qp-h1bar"></div><h1 class="qp-h1">${html}</h1>${sub ? `<p class="qp-sub">${esc(sub)}</p>` : ''}`;

/* HTML of every page in order: cover · items (one page; qmMount splits it) · loan · delivery, payment & terms · feature pages */
function qmPagesHtml(doc, lines, calc, settings) {
  doc = doc || {}; lines = lines || {}; settings = settings || {};
  const vars = QM.vars(calc, doc, settings), fill = t => QM.fill(t, vars);
  const ctx = { title: calc.title, site: settings.site || '', footer: settings.footer || '', co: settings.company || {} };
  const pages = [qpCover(doc, lines, calc, settings, ctx), qpItems(lines, calc, ctx)];
  if (calc.loan) pages.push(qpLoan(calc, settings, ctx, fill));
  pages.push(qpTerms(doc, calc, settings, ctx, fill));
  ((calc.pages && calc.pages.feature) || []).forEach(p => { const u = qmImgUrl(p); if (u) pages.push(`<div class="qp qp-feat" data-src="${esc(u)}"><img src="${esc(u)}" alt=""></div>`); });
  return pages.map((h, i) => h.replace('<span class="qp-pno"></span>', `<span class="qp-pno">Page ${i + 1} of ${pages.length}</span>`));
}

function qpCover(doc, lines, calc, st, ctx) {
  const co = ctx.co, cu = doc.customer || {}, sa = doc.sales || {}, bank = st.bank || {};
  const days = doc.valid_days != null && doc.valid_days !== '' ? doc.valid_days : st.valid_days;
  const project = calc.project + (!doc.project && calc.phase === 'three-phase' ? '\n(three-phase)' : '');
  const pl = (lines.panels || [])[0] || {}, plus = /\+ Wp/.test((pl.name || '') + ' ' + (pl.details || '')) ? '+' : '';
  const inv = (lines.inverter || [])[0], opt = (lines.optimiser || []).reduce((s, l) => s + (+l.qty || 0), 0);
  const iw = String((inv && (inv.title || inv.name)) || 'Inverter').trim().split(/\s+/);
  const inv2 = opt ? [[iw[0]].concat(iw.slice(1).map(qpLc)).join(' '), `with ${opt} optimizers`] : [iw[0], iw.slice(1).map(qpLc).join(' ')];
  const pw = [].concat(...(lines.panels || []).map(l => l.warranty || []));
  let war = pw.find(w => /perform/i.test(w.label || '')), warL = ['Panel performance', 'warranty'];
  if (!war) { war = calc.warranties.slice().sort((a, b) => (parseFloat(b.years) || 0) - (parseFloat(a.years) || 0))[0]; if (war) warL = [war.label || '', 'warranty']; }
  const yrs = y => y + (String(y) === '1' ? ' year' : ' years');
  const gl = [[calc.dcKwp + plus + ' kWp', 'Solar panels', `(${calc.panelCount} × ${calc.panelWp}${plus} Wp)`], [calc.plantKw + ' kW', inv2[0], inv2[1]]];
  if (war) gl.push([yrs(war.years), warL[0], warL[1]]);
  gl.push([qpRs(calc.subsidy), 'Government subsidy', '(PM Surya Ghar)']);
  const right = (co.lines || []).map(l => `<tr><th>${esc(l.label)}</th><td>${esc(l.text)}</td></tr>`).join('');
  return qpPage('qp-cover', ctx,
    `<div class="qp-top"><img class="qp-logo" src="assets/quote/jasper-logo.png" alt=""><div class="qp-brand"><div class="qp-b1">${esc(co.line1 || '')}</div><div class="qp-b2">${esc(co.line2 || '')}</div><div class="qp-b3">${esc(co.gstin || '')}</div></div><table class="qp-co" data-nofit="1">${right}</table></div>`
    + `<div class="qp-title"><h1>${esc(calc.title)}</h1><span class="qp-pill">${esc(st.pill || '')}</span></div>`
    + '<div class="qp-two">'
    + qpCard('Customer details', qpKv([['Name', cu.name], ['Address', cu.address], ['Consumer number', cu.consumer_no], ['Email', cu.email], ['Mobile', cu.mobile], ['Project', project]]))
    + qpCard('Quote details', qpKv([['Quote number', doc.number], ['Date', qpDate(doc.date)], ['Valid till', days ? `${days} days from the date of this offer` : ''], ['Sales / Engineer', sa.name], ['Phone', sa.phone || co.phone], ['Email', sa.email || co.email]]))
    + '</div>' + qpSec('Your solar plant at a glance')
    + `<div class="qp-gl" ${qpCols(gl.length)}>` + gl.map(g => `<div><b>${esc(g[0])}</b><span>${esc(g[1])}</span><span>${esc(g[2])}</span></div>`).join('') + '</div>'
    + '<p class="qp-intro">On the next pages, every item in your plant is shown with a picture, a simple explanation, the brand and the quantity.</p>'
    + qpSec('Price and payment details')
    + '<div class="qp-price">' + qpCard('Account details', qpKv([['Bank', bank.bank], ['Account name', bank.name], ['Account number', bank.account], ['IFSC code', bank.ifsc]]), 'qp-acct')
    + `<div class="qp-money"><div class="qp-gross"><span>Gross amount (including KSEB charges)</span><b>₹ ${QM.inr(doc.price)}</b></div>`
    + `<div class="qp-pr2"><div class="qp-sub2"><small>SUBSIDY</small><b>− ${qpRs(calc.subsidy)}</b><span>Credited to your bank account after commissioning</span></div>`
    + `<div class="qp-net"><small>COST AFTER SUBSIDY</small><b>${qpRs(calc.net)}</b><span>${qpRs(doc.price)} − ${qpRs(calc.subsidy)}</span></div></div>`
    + (calc.kseb.total > 0 && +doc.price > calc.kseb.total ? `<p class="qp-gnote">Gross amount = plant cost ${qpRs(doc.price - calc.kseb.total)} + KSEB charges ${qpRs(calc.kseb.total)}<span class="qp-kpg"></span>.</p>` : '') + '</div></div>'
    + `<div class="qp-sign"><div>For ${esc(qpTitleCase(co.name || ''))} (authorised signatory)</div><div>Customer acceptance (signature and date)</div></div>`);
}

const qpLogo = r => {
  r = String(r || '');
  if (r.slice(0, 5) === 'text:') return `<span class="qp-tx">${esc(r.slice(5))}</span>`;
  const u = qmImgUrl(r);
  return u ? `<img src="${esc(u)}" alt=""${/jasper-logo\.png$/.test(r) ? ' class="qp-sq"' : ''}>` : '';
};
function qpBrands(brands) {
  const br = (brands || []).filter(b => b && (b.logos || []).length);
  const lab = br.some(b => b.label), one = !lab && br.length === 1 && br[0].logos.length === 1;
  return `<div class="qp-brs${lab ? ' qp-lab' : ''}${one ? ' qp-one' : ''}">`
    + br.map(b => `<div class="qp-brl">${lab ? `<span class="qp-brk">${esc(b.label || '')}</span>` : ''}<span class="qp-lgs${b.logos.length > 2 ? ' qp-many' : ''}">${b.logos.map(qpLogo).join('')}</span></div>`).join('') + '</div>';
}
function qpRow(n, l, calc) {
  const q = QM.qtyText(l, { dcKwp: calc.dcKwp }), u = qmImgUrl(l.picture);
  const pic = u ? `<span class="qp-pic${/^assets\/quote\/pic-/.test(l.picture) ? '' : ' qp-pic-up'}"><img src="${esc(u)}" alt=""></span>` : '';
  return `<tr><td class="qp-no">${n}</td><td class="qp-it"><div class="qp-nm">${esc(l.name)}</div>${pic}</td>`
    + `<td><div class="qp-ln">${esc(l.line)}</div>${l.details ? `<div class="qp-dt">${esc(l.details)}</div>` : ''}</td>`
    + `<td>${qpBrands(l.brands)}</td><td class="qp-qt"><b>${esc(q.main)}</b>${q.note ? `<span>${esc(q.note)}</span>` : ''}</td></tr>`;
}
function qpItems(lines, calc, ctx) {
  let n = 0;
  const rows = qpCats(lines).map(cat => (lines[cat] || []).map(l => qpRow(++n, l, calc)).join('')).join('');
  return qpPage('qp-items', ctx, qpHead(ctx)
    + qpH1('What is included in your plant<span class="qp-contd">(continued)</span>', 'Every item has a picture, a simple explanation, the brand and the quantity.')
    + `<table class="qp-tb" data-nofit="1"><thead><tr><th>#</th><th>Item</th><th>What it is</th><th>Brand</th><th>Qty</th></tr></thead><tbody>${rows}</tbody></table>`
    + '<div class="qp-notes"><p class="qp-n1">Brands are chosen from the approved makes listed, based on availability at the time of installation.</p>'
    + '<p class="qp-n2">“As required” items are measured on site. PV modules and inverters comply with IEC standards; all other accessories comply with IS standards.</p></div>');
}

function qpLoan(calc, st, ctx, fill) {
  const L = calc.loan, ls = st.loan || {}, T = Object.assign({}, ls.texts || {}, L.capped ? {} : (ls.texts_small || {}));
  const f = k => qpRich(fill(T[k] || '')), list = k => (Array.isArray(T[k]) ? T[k] : []).map(t => `<li><i></i>${qpRich(fill(t))}</li>`).join('');
  const emis = L.emis || [], maxM = Math.max(...emis.map(e => +e.months || 0));
  const per = m => m % 12 ? `${m} months` : `${m / 12} year${m === 12 ? '' : 's'}`;
  const rows = emis.map((e, i) => {
    const mx = emis.length > 1 && +e.months === maxM;
    return `<tr${mx ? ' class="qp-max"' : ''}><td>${esc(per(+e.months))}${mx ? `<span>${f('max_tag')}</span>` : ''}</td><td class="qp-red">${qpRs(e.before)}</td><td class="qp-grn">${qpRs(e.after)}</td>`
      + (i ? '' : `<td class="qp-sav" rowspan="${emis.length}">About<b>${qpRs(L.saving)}</b>${f('per_month')}<small>${f('saving_calc')}</small></td>`) + '</tr>';
  }).join('');
  const steps = (Array.isArray(T.steps) ? T.steps : []).map((s, i) => `<div><span class="qp-num">${i + 1}</span><b>${qpRich(fill(s.t || ''))}</b><span>${qpRich(fill(s.d || ''))}</span></div>`).join('');
  return qpPage('qp-loan', ctx, qpHead(ctx) + qpH1(f('title'), fill(T.sub || ''))
    + '<div class="qp-lb">'
    + `<div class="qp-lb1"><small>${f('margin_label')}</small><b>${qpRs(L.margin)}</b><span>${f('margin_note')}</span></div>`
    + `<div class="qp-lb2"><small>${f('loan_label')}</small><b>${qpRs(L.loan)}</b><span>${f('loan_note')}</span></div>`
    + `<div class="qp-lb3"><small>${f('subsidy_label')}</small><b>${qpRs(calc.subsidy)}</b><span>${f('subsidy_note')}</span></div></div>`
    + qpSec(fill(T.emi_title || ''))
    + `<table class="qp-emi" data-nofit="1"><thead><tr><th>${f('col_period')}</th><th>${f('col_before')}<small>${f('col_before_sub')}</small></th><th>${f('col_after')}<small>${f('col_after_sub')}</small></th><th>${f('col_saving')}</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<p class="qp-note">${f('illustration')}</p>`
    + `<div class="qp-two qp-ltw">${qpCard(fill(T.terms_title || ''), `<ul class="qp-dots">${list('terms')}</ul>`)}${qpCard(fill(T.who_title || ''), `<ul class="qp-dots">${list('who')}</ul>`)}</div>`
    + qpSec(fill(T.how_title || ''), 'qp-sec-tight') + `<div class="qp-steps" ${qpCols((T.steps || []).length || 4)}>${steps}</div>`
    + `<div class="qp-help">${f('helpline')}</div><p class="qp-foot2">${f('footnote')}</p>`);
}

function qpTerms(doc, calc, st, ctx, fill) {
  const del = doc.delivery || st.delivery || [], terms = doc.terms || st.terms || [], pay = calc.pay || [];
  const rates = (typeof S !== 'undefined' && S && S.subsidy_rates) || QP_RATES;
  /* the "worked out on…" sum is shown only below the cap; a capped subsidy just says how it is paid (as in the 3 kW and 5 kW quotations) */
  const stext = calc.subsidy === calc.subsidyAuto && calc.panelCount && calc.subsidy < (+rates.cap || Infinity) ? QM.subsidyText(calc.panelCount, calc.panelWp, calc.dcKwp, rates)
    : 'Credited directly to the customer’s bank account within 30 working days after commissioning.';
  const war = calc.warranties.map(w => { const p = qpSplit(w.label); return `<div><b>${esc(w.years)} ${String(w.years) === '1' ? 'yr' : 'yrs'}</b><span>${esc(p[0])}</span><span>${esc(p[1])}</span></div>`; }).join('');
  const kseb = calc.kseb.rows.map((r, i) => {
    const m = /^(.*?)\s*(\([^()]*\))\s*$/.exec(r.label || '');
    return `<tr><td>${i + 1}</td><td>${m && m[1] ? `${esc(m[1])} <small>${esc(m[2])}</small>` : esc(r.label)}</td><td><b>${QM.inr(r.amount)}</b></td></tr>`;
  }).join('') + `<tr class="qp-tot"><td></td><td>Total</td><td>${QM.inr(calc.kseb.total)}</td></tr>`;
  return qpPage('qp-terms', ctx, qpHead(ctx) + qpH1('Delivery, payment &amp; terms<span class="qp-contd">(continued)</span>')
    + '<div class="qp-two qp-t1">' + qpCard('Delivery & installation', '<ul class="qp-del">' + del.map((t, i) => `<li>${qpIcon(i)}<span>${qpRich(fill(t))}</span></li>`).join('') + '</ul>')
    + `<div class="qp-subx"><div class="qp-subl"><small>MNRE SUBSIDY</small><span>(PM Surya Ghar)</span><b>₹ ${QM.inr(calc.subsidy)}</b></div><div class="qp-vr"></div><div class="qp-subt">${esc(stext)}</div></div></div>`
    + qpSec('Payment schedule') + `<div class="qp-pay" ${qpCols(pay.length)}>` + pay.map((p, i) => `<div><span class="qp-num">${i + 1}</span><b>${esc(p.amt)}</b><span>${qpRich(fill(p.text || ''))}</span></div>`).join('') + '</div>'
    + (war ? qpSec('Warranty at a glance') + `<div class="qp-war" ${qpCols(calc.warranties.length)}>${war}</div>` : '')
    + '<div class="qp-two qp-tk">' + qpCard('Terms and conditions', '<ul class="qp-dots">' + terms.map(t => `<li><i></i>${qpRich(fill(t))}</li>`).join('') + '</ul>', 'qp-tc')
    + qpCard('KSEB charges (included)', `<p class="qp-ksn">These KSEB charges for grid connection are already included in your gross amount.</p><table class="qp-ks" data-nofit="1"><thead><tr><th>#</th><th>Particulars</th><th>Amount (₹)</th></tr></thead><tbody>${kseb}</tbody></table>`, 'qp-kc')
    + '</div>');
}

/* ---- mounting and pagination ---- */
const qpFits = p => { const inn = p.querySelector('.qp-in'), last = inn && inn.lastElementChild; return !last || last.offsetTop + last.offsetHeight <= inn.clientHeight; };
const qpTighten = p => { p.classList.remove('qp-tight', 'qp-tight2'); if (!qpFits(p)) p.classList.add('qp-tight'); if (!qpFits(p)) p.classList.add('qp-tight2'); };
/* Lays the pages out again from scratch (safe to run any number of times):
   item rows that overflow move onto "(continued)" items pages; other pages that run past the footer get tighter spacing;
   if the terms page still overflows, its Terms card (then the KSEB card) moves onto a "(continued)" page.
   A page that still does not fit gets .qp-over and its title goes into c._qmOverflow (empty when all is well). Footers are renumbered. */
function qpPaginate(c) {
  c.querySelectorAll('.qp-over').forEach(p => p.classList.remove('qp-over'));
  const all = [...c.querySelectorAll('.qp-items')];
  if (all.length) {
    const first = all[0], tb = first.querySelector('tbody'), notes = first.querySelector('.qp-notes');
    all.slice(1).forEach(p => { p.querySelectorAll('tbody > tr').forEach(tr => tb.appendChild(tr)); const n2 = p.querySelector('.qp-n2'); if (n2) notes.appendChild(n2); p.remove(); });
    const isCont = p => p && p.classList.contains('qp-items') && p.classList.contains('qp-cont');
    let page = first, guard = 0;
    while (page && guard++ < 1000) {
      const rows = page.querySelectorAll('tbody > tr'), n2 = page.querySelector('.qp-n2');
      if (qpFits(page) || (!n2 && rows.length <= 1)) { const nx = page.nextElementSibling; page = isCont(nx) ? nx : null; continue; }
      let nx = page.nextElementSibling;
      if (!isCont(nx)) {
        nx = page.cloneNode(true); nx.classList.add('qp-cont');
        nx.querySelector('tbody').innerHTML = '';
        nx.querySelectorAll('.qp-n1, .qp-n2').forEach(e => e.remove());
        page.after(nx);
      }
      const nb = nx.querySelector('tbody');
      if (n2) nx.querySelector('.qp-notes').appendChild(n2);
      /* move the last row; a page that only gets the closing note also takes one row, so it never shows an empty table */
      if (!n2 || (!nb.firstChild && rows.length > 1)) nb.insertBefore(rows[rows.length - 1], nb.firstChild);
    }
  }
  const terms = c.querySelector('.qp-terms:not(.qp-cont)'), tcont = c.querySelector('.qp-terms.qp-cont');
  if (terms && tcont) { const tk = terms.querySelector('.qp-tk'); [tcont.querySelector('.qp-tc'), tcont.querySelector('.qp-kc')].forEach(e => { if (e) tk.appendChild(e); }); tcont.remove(); }
  if (terms) { const tk = terms.querySelector('.qp-tk'), kc = tk.querySelector('.qp-kc'); if (kc) tk.appendChild(kc); } /* Terms card first, then KSEB */
  c.querySelectorAll('.qp:not(.qp-items):not(.qp-feat)').forEach(qpTighten);
  if (terms && !qpFits(terms)) {
    const nx = terms.cloneNode(true); nx.classList.add('qp-cont');
    const keep = nx.querySelector('.qp-tk');
    [...nx.querySelector('.qp-in').children].forEach(e => { if (e !== keep && !e.matches('.qp-hd, .qp-h1bar, .qp-h1')) e.remove(); });
    keep.innerHTML = '';
    terms.after(nx);
    const tk = terms.querySelector('.qp-tk');
    keep.appendChild(tk.querySelector('.qp-tc'));
    qpTighten(terms);
    if (!qpFits(terms)) { keep.appendChild(tk.querySelector('.qp-kc')); qpTighten(terms); }
    qpTighten(nx);
  }
  const pg = [...c.querySelectorAll('.qp')], over = [], kp = pg.findIndex(p => p.querySelector('.qp-kc'));
  c.querySelectorAll('.qp-kpg').forEach(e => { e.textContent = kp < 0 ? '' : ` (see page ${kp + 1})`; });
  pg.forEach((p, i) => {
    const e = p.querySelector('.qp-pno'); if (e) e.textContent = `Page ${i + 1} of ${pg.length}`;
    if (p.querySelector('.qp-in') && !qpFits(p)) {
      p.classList.add('qp-over');
      const h = p.querySelector('.qp-h1, .qp-title h1'), t = h ? h.cloneNode(true) : null;
      if (t) t.querySelectorAll('.qp-contd').forEach(x => x.remove());
      over.push(`Page ${i + 1}: ${t ? t.textContent.trim() : ''}${p.classList.contains('qp-cont') ? ' (continued)' : ''}`);
    }
  });
  c._qmOverflow = over;
}
const qpFontsReady = () => document.fonts ? Promise.all(QP_FONTS.map(f => document.fonts.load(f))).then(() => document.fonts.ready).catch(() => {}) : Promise.resolve();

/* Render the pages into container (which must be in the document and displayed), then paginate (qpPaginate).
   Paginates again once the font and pictures have loaded; container._qmReady resolves after that,
   and container._qmOverflow then lists the pages that still do not fit (the PDF is refused while it is not empty). */
function qmMount(container, pages) {
  const tok = container._qmTok = (container._qmTok || 0) + 1;
  container.innerHTML = (pages || []).join('');
  qpPaginate(container);
  const imgs = [...container.querySelectorAll('img')].filter(i => !i.complete);
  const fontsOk = !document.fonts || QP_FONTS.every(f => document.fonts.check(f));
  container._qmReady = imgs.length || !fontsOk
    ? Promise.all([qpFontsReady()].concat(imgs.map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))))
      .then(() => { if (container._qmTok === tok) qpPaginate(container); })
    : Promise.resolve();
}

/* ---- PDF ---- */
let QP_LIBS = null;
const qpScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Could not load the PDF library')); document.head.appendChild(s); });
const qpLibs = () => QP_LIBS = QP_LIBS || Promise.all([
  window.html2canvas ? 0 : qpScript('assets/vendor/html2canvas-1.4.1.min.js'),
  window.jspdf ? 0 : qpScript('assets/vendor/jspdf-2.5.1.umd.min.js'),
]).catch(e => { QP_LIBS = null; throw e; });

/* a feature page goes into the PDF as its own picture (JPEG/PNG bytes as they are, other types through a canvas), fitted to A4 */
async function qpAddPicture(pdf, el, W, H) {
  try {
    const img = el.querySelector('img'), url = el.getAttribute('data-src');
    if (!img || !url) return false;
    if (!img.complete || !img.naturalWidth) await img.decode();
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) return false;
    const b = new Uint8Array(await r.arrayBuffer());
    let fmt = b[0] === 0xFF && b[1] === 0xD8 ? 'JPEG' : b[0] === 0x89 && b[1] === 0x50 ? 'PNG' : '', data = b;
    if (!fmt) {
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0);
      data = cv.toDataURL('image/jpeg', 0.92); fmt = 'JPEG';
    }
    const k = Math.min(W / img.naturalWidth, H / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
    pdf.addImage(data, fmt, (W - w) / 2, (H - h) / 2, w, h);
    return true;
  } catch (e) { return false; }
}

/* Every .qp page in container -> one A4 page (595.28 × 841.89 pt); saved as fileName. */
async function qmDownloadPdf(container, fileName) {
  await qpLibs();
  if (container._qmReady) await container._qmReady;
  await qpFontsReady();
  const over = container._qmOverflow || [];
  if (over.length) throw new Error('Some pages do not fit on A4 (' + over.join('; ') + '). Shorten their text first.');
  const W = 595.28, H = 841.89, pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
  const pages = [...container.querySelectorAll('.qp')];
  for (let i = 0; i < pages.length; i++) {
    if (i) pdf.addPage('a4', 'portrait');
    const el = pages[i];
    if (el.classList.contains('qp-feat') && await qpAddPicture(pdf, el, W, H)) continue;
    const cv = await window.html2canvas(el, {
      scale: 2, useCORS: false, backgroundColor: '#fff', logging: false,
      onclone: (d, c) => { for (let n = c; n && n.style; n = n.parentElement) { n.style.transform = 'none'; n.style.zoom = '1'; } c.style.margin = '0'; c.style.boxShadow = 'none'; },
    });
    pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, W, H);
    cv.width = cv.height = 0; /* free the canvas memory */
  }
  pdf.save(fileName || 'Quotation.pdf');
}
