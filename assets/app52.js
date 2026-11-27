/* Signed quotations: the badge, Ask admin to sign, Review & sign (admin), and the signed PDF's view / download / share (assets/app52.js).
   qsBadge(sign)            the badge (green Signed & sealed · 26 Nov, amber Waiting for signature, '' when not signed)
   qsBtns(can, q, o)        the buttons for a quotation (data-qsg); qsBind(root, getQ, who, done) wires them to qsAct
   qsAsk(q) / qsCancel(q)   ask the admins to sign / withdraw the request (POST qm sign_req / sign_cancel) -> the new sign object
   qsSign(id, ver, resign)  admin: makes the PDF of the saved quotation with the seal drawn in (off screen) and uploads it (POST qm sign)
   qsReview(id, done)       admin: the saved quotation with the seal drawn in, and Add seal & signature (or Make the signed copy)
   qsView(q) / qsDownload(q) / qsShare(q, who)   the stored signed PDF: the document window, a download, the share window
   Uses QSIGN (app51.js), qmSavedPages / QMB / QMK (app22.js), qmMount / qmDownloadPdf (app21.js), docViewer (app12.js), acDownload /
   acMobile / acMailReady / acSharedHtml (app35.js), composeMail (app19.js), ACC.waLink (app32.js). CSS: .qsg- in assets/quote.css.
   Every value shown in HTML goes through esc(). */
const qsUrl = (id, dl) => 'api.php?m=qm&a=signed&id=' + (+id) + (dl ? '&dl=1' : '');
const qsName = q => (q.sign && q.sign.file_name) || ('Quotation ' + String(q.number || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-') + '.pdf').replace(/\s+/g, ' ');
/* ruling R2: a list row carries sign_state / signed_at, a loaded quotation its sign object */
const qsOf = q => (q && q.sign) || { state: (q && q.sign_state) || '', signed_at: (q && q.signed_at) || '' };
const qsDocOf = q => { let d = null; try { d = q && q.doc ? JSON.parse(q.doc) : null; } catch (e) { d = null; } return d && typeof d === 'object' && !Array.isArray(d) ? d : null; };
/* the saved quotation as signed: its doc with the seal on (the version token does not count the seal) */
const qsSealed = q => { const d = qsDocOf(q); return d ? Object.assign({}, q, { doc: JSON.stringify(Object.assign(d, { seal: true })) }) : q; };
const qsPics = () => { const so = (typeof QMB !== 'undefined' && QMB && QMB.settings && QMB.settings.signoff) || {}; return !!(so.sign || so.seal); };
/* the pictures may have been uploaded after the catalogue was loaded (QMB is kept for the whole visit): look once more before saying no */
const qsPicsNow = async () => { if (!qsPics()) { try { QMB = await api('qm', 'boot'); } catch (e) { } } return qsPics(); };
const QS_NOPICS = 'Upload the seal and signature first: gear button › Quotation settings › Seal and signature.';
/* a failure the user has already been told about (toast) */
const qsFail = msg => { toast(msg, true); return { error: msg, shown: 1 }; };

function qsBadge(sign) {
  const s = QSIGN.state(sign); if (!s.k) return '';
  const g = s.k === 'signed', who = g ? sign.signed_name : sign.req_name;
  const tip = g ? 'The signed PDF is the copy everyone views, downloads and shares' + (who ? ' · signed by ' + who : '') : 'An admin has been asked to add the seal and signature' + (who ? ' · asked by ' + who : '');
  return `<span class="pill qsg-b qsg-${s.cls}" title="${esc(tip)}"><i class="i i-${g ? 'check' : 'clock'}"></i>${esc(s.label)}</span>`;
}
/* c = QSIGN.can(...); q needs id (and maker or doc for the signing buttons); o.view / o.dl / o.share: false hides, o.dl: true shows Download */
function qsBtns(c, q, o = {}) {
  const b = (a, ic, t, tip, main) => `<button type="button" class="btn ${main ? '' : 'sec '}sm" data-qsg="${a}" data-id="${+q.id}" title="${tip}"><i class="i i-${ic}"></i> ${t}</button>`;
  const doc = !!(q.maker || q.doc || o.doc), wait = qsOf(q).state === 'waiting'; /* Review & sign stands out when someone asked */
  return [c.share && o.view !== false && b('view', 'eye', 'View', 'Open the signed PDF'),
    c.share && o.dl && b('dl', 'download', 'Download', 'Download the signed PDF'),
    c.share && o.share !== false && b('share', 'link', 'Share', 'Send the signed PDF on WhatsApp or by email, to the customer or the bank'),
    doc && c.ask && b('ask', 'award', 'Ask admin to sign', 'Tell the admins this quotation needs the seal and signature'),
    doc && c.sign && b('sign', 'award', c.make ? 'Make the signed copy' : 'Review &amp; sign', 'See the quotation with the seal and signature, then sign it', wait),
    c.cancel && b('cancel', 'x', 'Cancel request', 'Withdraw the request for a signature')].filter(Boolean).join('');
}
function qsBind(root, getQ, who, done) {
  $$('[data-qsg]', root).forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); const q = getQ(b.dataset.id); if (q) qsAct(b.dataset.qsg, q, typeof who === 'function' ? who(q) : who, done, b); });
}
/* one button's action; done(sign) follows a change (ask, cancel, sign) */
async function qsAct(a, q, who, done, btn) {
  try {
    if (a === 'view') return qsView(q);
    if (a === 'dl') return qsDownload(q);
    if (a === 'share') return await qsShare(q, who);
    if (a === 'sign') return await qsReview(q.id, done);
    if (btn) btn.disabled = true;
    const s = a === 'ask' ? await qsAsk(q, done) : a === 'cancel' ? await qsCancel(q) : null;
    if (s && done) done(s);
  } catch (e) { if (e && !e.error && !e.shown) toast((e && e.message) || String(e), true); }
  finally { if (btn && btn.isConnected) btn.disabled = false; }
}

/* ---- ask, cancel ---- */
/* an admin does not ask: the review window opens instead (and null comes back) */
async function qsAsk(q, done) {
  if (ME && ME.role === 'admin') { qsReview(q.id, done); return null; }
  const r = await api('qm', 'sign_req', { id: +q.id });
  toast(`Asked the admin to sign ${q.number || 'the quotation'}`);
  return r.sign;
}
async function qsCancel(q) {
  const r = await api('qm', 'sign_cancel', { id: +q.id });
  toast(`Request withdrawn · ${q.number || 'quotation'}`);
  return r.sign;
}

/* ---- signing (admin) ---- */
/* ver: the version of the quotation the admin looked at (a save's answer, or the review); the server refuses the PDF when the quotation
   changed since (409). resign: the quotation was signed before the admin's save that changed it (the creator is told "updated the signed
   quotation"). Every failure is shown here (a toast) and rejects with {error, shown}. Resolves to the new sign object. */
async function qsSign(id, ver, resign) {
  if (!ME || ME.role !== 'admin') throw qsFail('Only an admin can sign a quotation');
  let q; try { q = await api('quotes', 'get', undefined, '&id=' + (+id)); } catch (e) { throw { error: (e && e.error) || 'Could not open the quotation', shown: 1 }; } /* api() showed it */
  if (!await qsPicsNow()) throw qsFail(QS_NOPICS); /* first: the pages are drawn with the catalogue's settings, pictures included */
  let sp = null; try { sp = await qmSavedPages(qsSealed(q)); } catch (e) { throw qsFail('The quotation could not be drawn: ' + ((e && (e.error || e.message)) || e)); }
  if (!sp) throw qsFail('This quotation was made before the quotation maker, so it cannot be signed');
  const box = document.createElement('div'); box.className = 'qm-off'; box.setAttribute('aria-hidden', 'true'); document.body.appendChild(box);
  let blob;
  try { qmMount(box, sp.pages); blob = await qmDownloadPdf(box, sp.name, false); }
  catch (e) { throw qsFail((e && e.message) || 'Could not make the PDF'); }
  finally { box.remove(); }
  const fd = new FormData(); fd.append('id', String(+id)); fd.append('ver', String(ver || (q.sign && q.sign.ver) || '')); fd.append('file', new File([blob], sp.name, { type: 'application/pdf' }));
  if (resign) fd.append('resign', '1');
  let r; try { r = await fetch('api.php?m=qm&a=sign', { method: 'POST', headers: { 'X-Solarize': '1' }, body: fd }); } catch (e) { throw qsFail('No connection: the quotation is not signed yet. Please try again.'); }
  const j = await r.json().catch(() => ({ error: 'Bad server response' }));
  if (!r.ok || j.error) throw qsFail(j.error || 'The signed copy could not be saved');
  toast(`Signed & sealed · ${q.number}${q.customer_id ? ' · the signed copy is in the customer’s Documents' : ''}`);
  return j.sign;
}
/* the zoom that fits A4 pages (794 px) into a window's body, kept while the window is open */
function qsFit(m, b) {
  const fit = () => { const p = b.querySelector('.qm-pages'); if (p) p.style.zoom = Math.min(1, (b.clientWidth - 8) / 794); };
  addEventListener('resize', fit);
  new MutationObserver((r, ob) => { if (!document.body.contains(m)) { ob.disconnect(); removeEventListener('resize', fit); } }).observe(document.body, { childList: true });
  return fit;
}
async function qsReview(id, done) {
  if (!ME || ME.role !== 'admin') return toast('Only an admin can sign a quotation', true);
  const m = modal(`<div class="qmv"><div class="qmv-h"><div><h2>Review &amp; sign</h2><small class="mut" id="qsgm"></small></div><span class="sp"></span><span class="qsg-h" id="qsgb"></span></div>
    <p class="qsg-note" id="qsgn" hidden></p><div class="qmv-b" id="qsgv"><p class="mut">Loading…</p></div></div>`, true);
  m.classList.add('qmvm');
  const v = $('#qsgv', m), fit = qsFit(m, v);
  let q; try { q = await api('quotes', 'get', undefined, '&id=' + (+id)); } catch (e) { v.innerHTML = `<p class="over">${esc((e && e.error) || 'Could not open the quotation')}</p>`; return; }
  const pics = await qsPicsNow(); /* before the pages: they are drawn with the pictures */
  let sp = null; try { sp = await qmSavedPages(qsSealed(q)); } catch (e) { sp = null; }
  if (!m.isConnected) return;
  const s = q.sign || {}, k = QSIGN.state(s).k, nm = sp ? sp.d.customer.name : '';
  $('#qsgm', m).textContent = [q.number, nm, q.date ? dmy(q.date) : '', q.total ? inr(q.total) : '', q.status].filter(Boolean).join(' · ');
  const note = k === 'signed' ? `Signed by ${s.signed_name || 'an admin'} · ${dmy(s.signed_at)}. Everyone gets this signed PDF.`
    : !sp ? '' : !pics ? QS_NOPICS
    : (k === 'waiting' ? `${s.req_name || 'Someone'} asked for the signature ${agoStr(s.req_at)}. ` : '') + 'This is the saved quotation with the seal and signature drawn in. Once signed, everyone views, downloads and shares this signed PDF.';
  const n = $('#qsgn', m); n.textContent = note; n.hidden = !note;
  const lbl = s.sealed ? 'Make the signed copy' : 'Add seal &amp; signature', go = `<i class="i i-award"></i> ${lbl}`;
  $('#qsgb', m).innerHTML = qsBadge(s) + (k === 'signed' ? qsBtns({ share: true }, q)
    : sp ? `<button type="button" class="btn" id="qsggo" ${pics ? '' : 'disabled'}>${go}</button>${k === 'waiting' ? qsBtns({ cancel: true }, q) : ''}` : '');
  qsBind($('#qsgb', m), () => q, { name: nm }, ns => { m.remove(); if (done) done(ns); });
  const b = $('#qsggo', m);
  if (b) b.onclick = async () => { b.disabled = true; b.innerHTML = '<i class="i i-award"></i> Adding the seal &amp; signature…';
    try { const ns = await qsSign(q.id, s.ver); m.remove(); if (done) done(ns); } catch (e) { if (b.isConnected) { b.disabled = false; b.innerHTML = go; } } };
  if (!sp) { v.innerHTML = '<p class="mut">This quotation was made before the quotation maker, so it has no pages to sign.</p>'; return; }
  v.innerHTML = '<div class="qm-pages"></div>'; qmMount(v.firstChild, sp.pages); fit();
}

/* ---- the signed PDF: view, download ---- */
function qsView(q) {
  docViewer([{ id: +q.id, name: qsName(q), item: 'Quotation ' + (q.number || '') + ' · signed' }], 0, (f, d) => qsUrl(q.id, d === 1));
}
function qsDownload(q) {
  const a = document.createElement('a'); a.href = qsUrl(q.id, 1); a.download = qsName(q); document.body.appendChild(a); a.click(); a.remove();
}

/* ---- share ---- */
/* q = the quotation (a list row is enough: it is loaded again); who = {name, phone, email} of its customer or lead, when known.
   Customer: WhatsApp / email to the phone and email of the customer (or lead); Bank: the bank manager's phone and the bank email from the
   customer's Bank & loan page, for customers only and only with Loans read (the server hides those fields from everyone else). */
async function qsShare(q, who) {
  who = who || {};
  const id = +q.id;
  const m = modal(`<div class="qsg-sw"><h3>Share the signed quotation${q.number ? ' ' + esc(q.number) : ''}</h3><div id="qsgsb"><p class="mut">Loading…</p></div></div>`);
  const body = $('#qsgsb', m);
  let full, info;
  try { [full, info] = await Promise.all([api('quotes', 'get', undefined, '&id=' + id), api('qm', 'sign_info', undefined, '&id=' + id), QMB ? 0 : api('qm', 'boot').then(b => { QMB = b; })]); }
  catch (e) { m.remove(); return; }
  if (!m.isConnected) return;
  const sign = info.sign || full.sign || {};
  if (sign.state !== 'signed') { body.innerHTML = '<p class="mut">This quotation is not signed any more. Open it to see where it stands.</p>'; return; }
  const isCust = +full.customer_id > 0, loans = canR('loans');
  let cu = {};
  if (isCust && loans && canR('customers')) { try { cu = (await api('customers', 'get', undefined, '&id=' + (+full.customer_id))) || {}; } catch (e) { cu = {}; } if (!m.isConnected) return; }
  const dc = (qsDocOf(full) || {}).customer || {};
  const ctx = { phone: cu.phone || who.phone || dc.mobile || '', email: cu.email || who.email || dc.email || '', bank_phone: cu.loan_mgr_phone || '', bank_email: cu.loan_bank_email || '', is_customer: isCust, loans };
  const T = QSIGN.targets(ctx).filter(t => t.to_whom === 'customer' || (isCust && loans)); /* a lead, or no Loans access: customer and download only */
  const co = (S && S.company) || {}, qco = ((QMB && QMB.settings) || {}).company || {}, tpl = (QMB && QMB.share_tpl) || {};
  const vars = { name: cu.name || who.name || dc.name || '', quote_no: full.number || '', amount: QM.inr(full.total), date: full.date ? dmy(full.date) : '', company: co.name || qco.name || '',
    sender: (ME && ME.name) || '', sender_phone: (ME && ME.phone) || qco.phone || co.phone || '' }; /* the company phone when the user has none, as on receipts (app35.js) */
  const fill = k => QSIGN.fill(tpl[k] || '', vars).replace(/\s+$/, '');
  const name = qsName(Object.assign({}, full, { sign })), VIA = { whatsapp: ['whatsapp', 'WhatsApp'], email: ['mail', 'Email'] };
  body.innerHTML = `<p class="mut qsg-sub">Signed &amp; sealed by ${esc(sign.signed_name || 'an admin')} · ${esc(dmy(sign.signed_at))}. This exact PDF is what goes out.</p>
    <div class="qsg-ts">${T.map((t, i) => `<button type="button" class="btn sec qsg-t" data-t="${i}" ${t.ok ? '' : 'disabled'} title="${esc(t.ok ? t.addr : t.why)}"><i class="i i-${VIA[t.via][0]}"></i><span><b>${VIA[t.via][1]} to ${t.to_whom === 'bank' ? 'bank' : 'customer'}</b><small>${esc(t.ok ? t.addr : t.why)}</small></span></button>`).join('')}</div>
    <div class="bar qsg-sb"><button type="button" class="btn sec" data-qd><i class="i i-download"></i> Download</button><button type="button" class="btn sec" data-qv><i class="i i-eye"></i> View</button></div>
    <div class="acx-shl" id="qsgsh"></div>`;
  const shares = (info.shares || []).slice(), drawSh = () => { const h = $('#qsgsh', m); if (h) h.innerHTML = typeof acSharedHtml === 'function' ? acSharedHtml(shares) : ''; };
  drawSh();
  /* every share is logged; a refused or failed log never stops the share (plain fetch: no pop-up) */
  const log = (via, to, addr) => fetch('api.php?m=qm&a=share_log', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Solarize': '1' }, body: JSON.stringify({ id, via, to_whom: to, to_addr: addr || '' }) })
    .then(r => r.ok).catch(() => false)
    .then(ok => { if (ok) { shares.unshift({ via, to_whom: to, to_addr: addr || '', who: (ME && ME.name) || '', created: new Date().toISOString().slice(0, 19).replace('T', ' ') }); if (m.isConnected) drawSh(); } });
  /* the file is fetched as the window opens, so a click shares it at once (a phone's share sheet needs a fresh click) */
  let fileP = null;
  const getFile = () => fileP = fileP || fetch(qsUrl(id, 1), { credentials: 'same-origin' })
    .then(r => { if (!r.ok) throw new Error('The signed PDF could not be loaded'); return r.blob(); })
    .then(b => new File([b], name, { type: 'application/pdf' })).catch(e => { fileP = null; throw e; });
  getFile().catch(() => { });
  const send = async (t, win) => {
    const file = await getFile(), bank = t.to_whom === 'bank';
    if (t.via === 'email') {
      if (!await acMailReady()) return false;
      composeMail({ to: t.addr, subject: fill(bank ? 'bank_subject' : 'cust_subject'), body: fill(bank ? 'bank_body' : 'cust_body'), attach: [file], onSent: () => log('email', t.to_whom, t.addr) });
      return true;
    }
    const text = fill(bank ? 'bank_body' : 'cust_body');
    if (acMobile() && navigator.share && navigator.canShare) { /* a phone: the share sheet sends the PDF itself */
      let can = false; try { can = navigator.canShare({ files: [file] }); } catch (e) { }
      if (can) { try { await navigator.share({ files: [file], text }); log('whatsapp', t.to_whom, t.addr); return true; } catch (e) { if (e && e.name === 'AbortError') return true; } }
    }
    acDownload(file); /* a computer: the PDF downloads and WhatsApp opens with the message ready */
    const url = ACC.waLink(t.addr, text);
    if (win && !win.closed) win.location.href = url; else window.open(url, '_blank', 'noopener');
    toast('PDF downloaded. Attach it in WhatsApp, then send.');
    log('whatsapp', t.to_whom, t.addr);
    return true;
  };
  $$('[data-t]', m).forEach(btn => btn.onclick = async () => {
    const t = T[+btn.dataset.t]; if (!t || !t.ok) return;
    let win = null; /* WhatsApp on a computer: its window opens right at the click (one opened later can be blocked) */
    if (t.via === 'whatsapp' && !acMobile()) { win = window.open('', '_blank'); if (win) { try { win.opener = null; win.document.title = 'WhatsApp'; win.document.body.textContent = 'Opening WhatsApp…'; } catch (e) { } } }
    btn.disabled = true; let ok = false;
    try { ok = await send(t, win); } catch (e) { toast((e && (e.message || e.error)) || 'Could not share the PDF', true); }
    if (!ok && win && !win.closed) win.close();
    if (btn.isConnected) btn.disabled = false;
  });
  $('[data-qd]', m).onclick = () => { qsDownload({ id, number: full.number, sign }); log('pdf', 'customer', ''); };
  $('[data-qv]', m).onclick = () => qsView({ id, number: full.number, sign });
  return m;
}

/* ---- the quotation maker (app22.js): header badge and buttons, the signing after an admin's sealed save ---- */
function qsMakerHead() {
  const box = $('#qmsign'); if (!box) return;
  const s = QMK.sign || {}, st = QSIGN.state(s), c = QMK.id ? QSIGN.can(s, ME, { maker: 1 }, canW('quotes')) : {};
  const key = [QMK.id, st.k, st.label, QMK.signing ? 1 : 0, c.ask, c.cancel, c.sign, c.make, c.share].join('|');
  if (box.dataset.k === key) return; box.dataset.k = key;
  box.innerHTML = !QMK.id ? '' : qsBadge(s) + (QMK.signing ? '<span class="qsg-busy">Adding the seal &amp; signature…</span>' : qsBtns(c, { id: QMK.id, maker: 1, sign: s }));
}
/* a change of the signature seen from the maker: the header follows; signed = the stored doc has the seal on now, so the box is ticked
   (an admin's next save keeps the signature instead of taking it off) */
function qsMakerSet(id, s) {
  if (!s || typeof QMK === 'undefined' || !qmkOn() || +QMK.id !== +id) return;
  QMK.sign = s;
  if (s.state === 'signed') { /* the stored doc has the seal now: the saved-copy mark (QMK.base) follows, so Save still sees no edit */
    const clean = QMK.base === qmkBase(); QMK.doc.seal = true;
    if (clean) QMK.base = qmkBase(); else { try { const b = JSON.parse(QMK.base); b[0].seal = true; QMK.base = JSON.stringify(b); } catch (e) { } }
    const cb = $('#qmseal'); if (cb) cb.checked = true; }
  qmkHead();
}
async function qsMakerAct(a) {
  if (QMK.busy || !QMK.id) return;
  if ((a === 'ask' || a === 'sign') && QMK.dirty && canW('quotes')) { if (!await qmkSave()) return; } /* unsaved changes are saved first */
  if (QMK.signP) await QMK.signP;
  if (a === 'sign' && QSIGN.state(QMK.sign).k === 'signed') return; /* the save signed it */
  const d = QMK.doc, id = QMK.id;
  const q = { id, number: d.number, total: d.price, date: d.date, customer_id: QMK.cust.customer_id, lead_id: QMK.cust.lead_id, maker: 1, sign: QMK.sign };
  return qsAct(a, q, { name: d.customer.name, phone: d.customer.mobile, email: d.customer.email }, s => qsMakerSet(id, s));
}
/* after an admin's save with the seal ticked: the signed copy is made and uploaded (the server puts it in the customer's Documents);
   resign: it was signed before that save */
function qsMakerSign(id, ver, resign) {
  QMK.signing = true; qmkHead();
  const p = qsSign(id, ver, resign).then(s => { qsMakerSet(id, s); return s; }, () => null)
    .finally(() => { if (QMK.signP === p) QMK.signP = null; QMK.signing = false; if (qmkOn()) qmkHead(); });
  QMK.signP = p;
  return p;
}
/* bell (app9.js): a signature notification about the quotation open in the maker refreshes its header */
function qsNotified(list) {
  if (typeof QMK === 'undefined' || !qmkOn() || !QMK.id || QMK.signing || !(list || []).some(n => +n.quote_id === +QMK.id)) return;
  const id = QMK.id;
  fetch('api.php?m=qm&a=sign_info&id=' + (+id)).then(r => r.ok ? r.json() : null).then(j => { if (j && j.sign) qsMakerSet(id, j.sign); }).catch(() => { });
}
