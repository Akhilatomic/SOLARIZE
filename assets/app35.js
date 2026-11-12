/* Accounts: payment receipts and the tax bill as PDF files, shared by email or WhatsApp with the customer or the loan bank (assets/app35.js).
   acReceipt(paymentId)            the receipt window (gives the payment its receipt number the first time)
   acPdfFromHtml(html, css, name)  one A4 page PDF (html2canvas picture in jsPDF), returned as a File called `name`
   acShare(o)                      PDF download, email (compose window with the PDF attached) or WhatsApp; each share is logged (acc/log)
   Uses ACC (app32.js), composeMail / EM (app19.js), qpLibs (app21.js), DOC_CSS, fdt, inr2, rupeeWords, printDoc (app18.js). */

/* the customer's own wording; the editable templates (Accounts settings, ac_tpl) are written to the bank manager */
const ACX_CUST = {
  rc_subject: 'Payment receipt {receipt_no} – {kw} kW solar plant – {company}',
  rc_body: 'Dear {customer},\n\nThank you for your payment of ₹{amount} received on {date} ({mode_ref}) towards your {kw} kW rooftop solar plant. Please find attached the payment receipt {receipt_no}.\n\nRegards,\n{sender}\n{company}\n{sender_phone}',
  tb_subject: 'Tax invoice {bill_no} – {kw} kW solar plant – {company}',
  tb_body: 'Dear {customer},\n\nThank you for choosing {company}. Please find attached the tax invoice {bill_no} for ₹{bill_total} for your {kw} kW rooftop solar plant.\n\nRegards,\n{sender}\n{company}\n{sender_phone}',
};
/* the tax bill fills the A4 page with the signature at its foot (794 × 1123 px = A4 at 96 dpi), as the printed copy does */
const ACX_A4_FILL = '.dtax{min-height:1123px;display:flex;flex-direction:column}.dtax .dsign{margin-top:auto;padding-top:10px}';
/* the app's own styles must not leak into a document: table cells (upper-case headers, 14px), the Dashboard's .dhead (a column on
   phones) and the .dsp list box start from plain, so the preview and the PDF look like the printed copy on any screen */
const ACX_RESET = 'th,td{font-size:inherit;font-weight:inherit;text-transform:none;letter-spacing:normal;color:inherit;overflow-wrap:normal;border:0;padding:0}'
  + '.dhead{flex-direction:row;flex-wrap:nowrap;margin-bottom:0}.dsp{max-height:none;overflow:visible;margin-top:0;display:block}';
/* prefix every selector of a flat style sheet (no @-rules) with root, so a document's styles stay inside it */
const acScope = (css, root) => (ACX_RESET + String(css || '')).replace(/(^|\})\s*([^{}]+)\{/g, (m, b, sel) => b + sel.split(',').map(s => `${root} ${s.trim()}`).join(',') + '{');
const acCss = () => { if (!document.getElementById('acx-doc-css')) document.head.insertAdjacentHTML('beforeend', `<style id="acx-doc-css">${acScope(DOC_CSS, '.acx-doc')}</style>`); };

const acIsCash = p => String((p && p.mode) || '').trim().toLowerCase() === 'cash';
const acModeRef = p => [String(p.mode || '').trim(), String(p.ref_no || '').trim() && 'ref ' + String(p.ref_no).trim()].filter(Boolean).join(', ') || 'Cash';
const acKw = kw => +kw ? String(+kw) : String(kw || '').trim();
const acFileName = (what, no, name) => `${what} ${no || ''} ${name || ''}`.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() + '.pdf';
const acMobile = () => !!(navigator.userAgentData ? navigator.userAgentData.mobile : /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent || ''));
let ACX_TPL = null, ACX_DTF = null;
/* the saved email / WhatsApp templates, fetched again after a minute (the admin may change them) */
const acTpl = () => { if (!ACX_TPL || Date.now() - ACX_TPL.at > 60000) { const p = api('acc', 'ac_tpl').catch(e => { ACX_TPL = null; throw e; }); ACX_TPL = { at: Date.now(), p }; } return ACX_TPL.p; };
const acWhen = s => { const d = new Date(String(s || '').replace(' ', 'T') + 'Z'); if (isNaN(d)) return String(s || '');
  ACX_DTF = ACX_DTF || new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); return ACX_DTF.format(d); };

/* template values: d = {customer, company:{name, phone}, payment?, bill?:{no, date, total}, received_total, kw} */
function acVars(d) {
  const cu = d.customer || {}, co = d.company || {}, p = d.payment || null, b = d.bill || null, amt = p ? +p.amount || 0 : b ? +b.total || 0 : 0;
  return { manager: cu.loan_mgr_name || 'Sir/Madam', bank: cu.loan_bank || '', customer: cu.name || '', consumer_no: cu.consumer_no || '—', loan_ref: cu.jansamarth_id || '—',
    amount: amt, amount_words: rupeeWords(amt), date: fdt(p ? p.date : b && b.date), receipt_no: p ? p.receipt_no || '' : '', mode_ref: p ? acModeRef(p) : '',
    bill_no: b ? b.no || '' : '', bill_total: b ? +b.total || 0 : '', received_total: +d.received_total || 0, kw: acKw(d.kw), company: co.name || '',
    sender: (ME || {}).name || '', sender_phone: co.phone || '' };
}

/* past shares: "Email to bank · 12 Nov 2026, 10:30 · Asha" */
const ACX_VIA = { email: ['mail', 'Email'], whatsapp: ['whatsapp', 'WhatsApp'], pdf: ['download', 'PDF downloaded'] };
function acSharedHtml(list) {
  if (!list || !list.length) return '<span>Not shared yet.</span>';
  const more = list.length - 4; /* the latest four; the rest as a count, so the document stays in view */
  return '<b>Shared</b>' + list.slice(0, 4).map(s => { const v = ACX_VIA[s.via] || ['file', String(s.via || '')], to = s.via === 'pdf' ? '' : s.to_whom === 'bank' ? ' to bank' : ' to customer';
    return `<span class="acx-sh" title="${esc(s.to_addr || '')}"><i class="i i-${v[0]}"></i>${esc(v[1] + to)} · ${esc(acWhen(s.created))}${s.who ? ' · ' + esc(s.who) : ''}</span>`; }).join('') + (more > 0 ? `<span>and ${more} earlier</span>` : '');
}

/* One A4 page: the document is drawn 794 px wide off screen, pictured by html2canvas at scale 2 and placed in the PDF at the full page
   width (scaled down to the page height when taller). css = the document's style sheet, kept inside the drawing. */
async function acPdfFromHtml(html, css, name) {
  await qpLibs();
  const host = document.createElement('div');
  host.className = 'acx-pdf'; host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;left:-12000px;top:0;width:794px;background:#fff;pointer-events:none';
  host.innerHTML = `<style>${acScope(css, '.acx-pdf')}</style>${html}`;
  document.body.appendChild(host);
  try {
    const el = host.querySelector('.doc') || host.lastElementChild;
    Object.assign(el.style, { width: '794px', maxWidth: '794px', margin: '0', boxSizing: 'border-box', boxShadow: 'none', borderRadius: '0' });
    await Promise.all([...host.querySelectorAll('img')].map(i => i.complete && i.naturalWidth ? 0 : i.decode().catch(() => 0)));
    const cv = await window.html2canvas(el, { scale: 2, backgroundColor: '#fff', logging: false, useCORS: false });
    const W = 595.28, H = 841.89; let w = W, h = cv.height * W / cv.width;
    if (h > H) { w = W * H / h; h = H; }
    const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
    pdf.setProperties({ title: String(name || '').replace(/\.pdf$/i, '') });
    pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', (W - w) / 2, 0, w, h);
    cv.width = cv.height = 0; /* free the canvas memory */
    return new File([pdf.output('blob')], name || 'Document.pdf', { type: 'application/pdf' });
  } finally { host.remove(); }
}

function acDownload(file) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* record a share; a refused or failed log never stops the share (no pop-up: plain fetch, not api()) */
function acLog(o, addr) {
  if (!canW('payments') && !canW('accounts')) return Promise.resolve(false);
  const body = { kind: o.kind, payment_id: o.payment_id || 0, customer_id: o.customer_id, project_id: o.project_id || 0, via: o.via, to_whom: o.to_whom, to_addr: addr || '' };
  return fetch('api.php?m=acc&a=log', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Solarize': '1' }, body: JSON.stringify(body) })
    .then(r => r.ok).catch(() => false)
    .then(ok => { if (ok && o.onLogged) o.onLogged({ via: o.via, to_whom: o.to_whom, to_addr: addr || '', created: new Date().toISOString().slice(0, 19).replace('T', ' '), who: (ME || {}).name || '' }); return ok; });
}

/* email goes out from the staff member's own mailbox: none connected -> say so and offer the Email page */
async function acMailReady() {
  if (typeof composeMail !== 'function' || !canW('email')) { toast('Email is not available for your role', true); return false; }
  if (!EM.cfg) { try { EM.cfg = await api('mail', 'config'); } catch (e) { return false; } }
  if (!emAccts().length) { if (confirm('Your email is not connected yet, so the PDF cannot be emailed from the CRM. Open Email to connect your mailbox?')) { $$('.modal').forEach(m => m.remove()); location.hash = '#/email'; } return false; }
  return true;
}

/* o = {kind:'receipt'|'tax', to_whom:'customer'|'bank', via:'email'|'whatsapp'|'pdf', blob, name, vars, cust, customer_id, project_id, payment_id, win?, onLogged?}
   cust = the customer (email, phone, loan_bank_email, loan_mgr_phone …). win = a window opened at the click for WhatsApp (pop-up blockers).
   Returns true when the share went ahead, false when it stopped (nothing to send to). */
async function acShare(o) {
  const cu = o.cust || {}, bank = o.to_whom === 'bank', k = o.kind === 'tax' ? 'tb' : 'rc';
  const file = o.blob instanceof File ? o.blob : new File([o.blob], o.name || 'Document.pdf', { type: 'application/pdf' });
  if (o.via === 'pdf') { acDownload(file); acLog(o, ''); return true; }
  if (o.via === 'email') {
    const to = String((bank ? cu.loan_bank_email : cu.email) || '').trim();
    if (!to) { toast(bank ? 'Add the bank email on the Bank & loan page' : 'This customer has no email', true); return false; }
    if (!await acMailReady()) return false;
    const T = bank ? await acTpl() : ACX_CUST;
    composeMail({ to, subject: ACC.fill(T[k + '_subject'], o.vars), body: ACC.fill(T[k + '_body'], o.vars), attach: [file], onSent: () => acLog(o, to) });
    return true;
  }
  const phone = String((bank ? cu.loan_mgr_phone : cu.phone) || '').trim();
  if (!phone.replace(/\D/g, '')) { toast(bank ? "Add the bank manager's phone on the Bank & loan page" : 'This customer has no phone number', true); return false; }
  const text = ACC.fill((bank ? await acTpl() : ACX_CUST)[k + '_body'], o.vars);
  /* a phone: the share sheet sends the PDF itself */
  if (acMobile() && navigator.share && navigator.canShare) {
    let can = false; try { can = navigator.canShare({ files: [file] }); } catch (e) { }
    if (can) { try { await navigator.share({ files: [file], text }); acLog(o, phone); return true; } catch (e) { if (e && e.name === 'AbortError') return true; } }
  }
  /* a computer: the PDF downloads and WhatsApp opens with the message ready; staff attach the file and press send */
  acDownload(file);
  const url = ACC.waLink(phone, text);
  if (o.win && !o.win.closed) o.win.location.href = url; else window.open(url, '_blank', 'noopener');
  toast('PDF downloaded. Attach it in WhatsApp, then send.');
  acLog(o, phone);
  return true;
}

/* a share button (data-via, data-to): make() -> Promise<o> builds the PDF. WhatsApp on a computer opens its window right at the
   click, because a pop-up opened after the PDF is made can be blocked. */
async function acShareBtn(btn, make) {
  let win = null;
  if (btn.dataset.via === 'whatsapp' && !acMobile()) {
    win = window.open('', '_blank');
    if (win) { try { win.opener = null; win.document.title = 'WhatsApp'; win.document.body.textContent = 'Opening WhatsApp…'; } catch (e) { } }
  }
  btn.disabled = true; let ok = false;
  try { const o = await make(); o.win = win; ok = await acShare(o); }
  catch (e) { toast((e && (e.message || e.error)) || 'Could not make the PDF', true); }
  if (!ok && win && !win.closed) win.close();
  btn.disabled = false;
}

/* receipt layout (same markup as the Tax bill tab always used): r = ac_receipt answer */
function acRcHtml(r) {
  const p = r.payment, cu = r.customer || {}, co = r.company || {}, pr = r.project || {}, bill = r.bill;
  const CN = co.name || 'Jasper Solar Solutions', ph = co.phone || '', em = co.email || '', web = co.site || '', kw = acKw(pr.kw);
  const list = r.payments || [], i = list.findIndex(x => x.id === p.id);
  const before = (i < 0 ? [] : list.slice(0, i)).reduce((t, x) => t + (+x.amount || 0), 0), amt = +p.amount || 0;
  const total = bill && +bill.total ? +bill.total : +pr.cost || 0, bal = Math.round((total - before - amt) * 100) / 100; /* the bill's total, else the plant cost */
  return `<div class="dhead"><div class="dhco"><img src="${location.origin}/assets/logo.png" alt=""><div><b>${esc(CN)}</b><div class="dco">${esc(co.address || '')}${co.gstin ? '<br>GSTIN ' + esc(co.gstin) : ''}${[ph, em, web].filter(Boolean).length ? '<br>' + [ph, em, web].filter(Boolean).map(esc).join(' · ') : ''}</div></div></div></div>
    <h1 class="drt">PAYMENT RECEIPT</h1>
    <div class="drc"><div class="rf"><span>Receipt no.</span><b>${esc(p.receipt_no)}</b><span>Payment date</span><b>${fdt(p.date)}</b><span>Reference number</span><b>${esc(p.ref_no || (acIsCash(p) ? 'Cash' : ''))}</b><span>Payment mode</span><b>${esc(p.mode || '')}</b><span>Amount received in words</span><b>${rupeeWords(amt)}</b></div>
     <div class="drbox"><small>Amount Received</small><b>${inr2(amt)}</b></div></div>
    <div class="drfrom"><div><h4>Received from</h4><b>${esc(cu.name || '')}</b><br>${esc([cu.address, cu.district, cu.pincode].filter(Boolean).join(', '))}${cu.phone ? '<br>Ph: ' + esc(cu.phone) : ''}${p.src === 'bank' ? `<br><span class="dlbl">Paid by ${esc(cu.loan_bank || 'the bank')} (loan disbursement)</span>` : ''}</div>
     <div class="dstamp"><div class="dfor">For ${esc(CN)}</div><div class="dsp"></div><div class="dsl">Authorised signatory</div><small>Seal &amp; signature</small></div></div>
    <table class="dt"><thead><tr><th>Payment for</th><th>Date</th><th class="r">Amount</th><th class="r">Received earlier</th><th class="r">This payment</th><th class="r">Balance due</th></tr></thead>
     <tbody><tr><td>${bill ? 'Tax invoice ' + esc(bill.no) : `Solar power plant${kw ? ' (' + esc(kw) + ' kW)' : ''} — plant cost`}</td><td>${bill ? fdt(bill.date) : '—'}</td><td class="r">${inr2(total)}</td><td class="r">${inr2(before)}</td><td class="r">${inr2(amt)}</td><td class="r"><b>${inr2(Math.max(0, bal))}</b></td></tr></tbody></table>
    ${bal < 0 ? `<div class="dsmall">Received ${inr2(-bal)} more than the ${bill ? 'invoice amount' : 'plant cost'}.</div>` : ''}`;
}

/* The receipt window for a payment. opt.onNoRef(payment, why): the payment needs its reference no. first (e.g. open the edit form);
   opt.onChange(): called when the payment has just been given its receipt number. */
async function acReceipt(pid, opt = {}) {
  let r; try { r = await api('acc', 'ac_receipt', undefined, `&payment_id=${+pid}`); } catch (e) { return; }
  const p = r.payment;
  if (!p.receipt_no) {
    if (!acIsCash(p) && !String(p.ref_no || '').trim()) { const why = 'A payment receipt needs the reference number (UTR / cheque / transaction no.) unless the payment was in cash.'; return opt.onNoRef ? opt.onNoRef(p, why) : toast(why, true); }
    if (!canW('payments') && !canW('accounts')) return toast('This payment has no receipt yet. Ask someone who can edit payments to make it.', true);
    try { p.receipt_no = (await api('acc', 'receipt_no', { payment_id: p.id })).receipt_no; } catch (e) { return; }
    const x = (r.payments || []).find(y => y.id === p.id); if (x) x.receipt_no = p.receipt_no;
    if (opt.onChange) opt.onChange();
  }
  acCss();
  const cu = r.customer || {}, co = r.company || {}, loan = (r.project || {}).loan === 'Yes' && canR('loans'), doc = acRcHtml(r), name = acFileName('Receipt', p.receipt_no, cu.name);
  const list = r.payments || [], i = list.findIndex(y => y.id === p.id), recv = list.slice(0, i + 1).reduce((t, y) => t + (+y.amount || 0), 0);
  const vars = acVars({ customer: cu, company: co, payment: p, bill: r.bill, received_total: recv, kw: (r.project || {}).kw });
  const b = (via, to, icon, label, main) => `<button class="btn ${main ? '' : 'sec'}" data-via="${via}" data-to="${to}"><i class="i i-${icon}"></i> ${label}</button>`;
  const m = modal(`<div class="mh"><h3>Payment receipt ${esc(p.receipt_no)}</h3><button class="ib" data-x title="Close"><i class="i i-x"></i></button></div>
    <div class="bar acx-rcb">${b('pdf', 'customer', 'download', 'PDF', 1)}${b('whatsapp', 'customer', 'whatsapp', 'WhatsApp')}${b('email', 'customer', 'mail', 'Email')}${loan ? b('email', 'bank', 'bank', 'Email to bank') + b('whatsapp', 'bank', 'whatsapp', 'WhatsApp to bank') : ''}<span class="sp"></span><button class="btn sec" data-print>Print</button></div>
    <div class="acx-shl" id="acx_sh"></div>
    <div class="gdp acx-pv"><div class="acx-doc"><div class="doc drcpt">${doc}</div></div></div>`, true);
  const shared = (r.shared || []).slice(), drawSh = () => { $('#acx_sh', m).innerHTML = acSharedHtml(shared); };
  drawSh();
  /* the preview is the A4 width (794 px) shrunk to fit a narrow window, so it looks like the PDF on a phone too */
  const pv = $('.acx-pv', m), pd = $('.doc', pv), ro = window.ResizeObserver ? new ResizeObserver(() => fit()) : null;
  const fit = () => { if (!m.isConnected) { if (ro) ro.disconnect(); return; }
    const cs = getComputedStyle(pv), k = Math.min(1, (pv.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / 794); pd.style.zoom = k > 0 && k < 1 ? k : ''; };
  fit(); if (ro) ro.observe(pv);
  /* the PDF is made as soon as the window opens, so a click shares it at once (a phone's share sheet needs the click to be fresh) */
  let pdfP = null;
  const getPdf = () => pdfP = pdfP || acPdfFromHtml(`<div class="doc drcpt">${doc}</div>`, DOC_CSS, name).catch(e => { pdfP = null; throw e; });
  getPdf().catch(() => { });
  if (loan) acTpl().catch(() => { });
  $('[data-x]', m).onclick = () => m.remove();
  $('[data-print]', m).onclick = () => printDoc(`Payment receipt ${p.receipt_no} — ${cu.name || ''}`, `<div class="doc drcpt">${doc}</div>`);
  $$('[data-via]', m).forEach(btn => btn.onclick = () => acShareBtn(btn, async () => ({ kind: 'receipt', via: btn.dataset.via, to_whom: btn.dataset.to, blob: await getPdf(), name, vars, cust: cu,
    customer_id: cu.id, project_id: (r.project || {}).id, payment_id: p.id, onLogged: s => { shared.unshift(s); if (m.isConnected) drawSh(); } })));
  return m;
}
