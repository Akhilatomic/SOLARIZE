// Customer profile: Warranty card and Tax bill (GST invoice) — edit on the left, live printable preview on the right.
const GEN = {};
const inr2 = n => '₹' + (+n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fdt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
function inWords(n) { // Indian numbering: crore, lakh, thousand
  n = Math.round(+n || 0); if (!n) return 'Zero';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'], b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = x => x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : ''), three = x => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : '') + (x % 100 ? two(x % 100) : '');
  const parts = [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']]; let s = '';
  for (const [v, w] of parts) if (n >= v) { s += (v === 10000000 ? inWords(Math.floor(n / v)) : two(Math.floor(n / v))) + ' ' + w + ' '; n %= v; }
  return (s + three(n)).trim();
}
/* "Rupees Twelve Thousand and Fifty paise only" (receipts and the email templates' {amount_words}) */
const rupeeWords = a => { a = +a || 0; const r = Math.floor(a + 1e-9), ps = Math.round((a - r) * 100); return `Rupees ${inWords(r)}${ps ? ' and ' + inWords(ps) + ' paise' : ''} only`; };
const coBlock = co => `<div class="dhco"><img src="${location.origin}/assets/logo.png" alt=""><div><b>${esc(co.name || 'Jasper Solar Solutions')}</b><div>${esc(co.address || '')}</div><div>${[co.phone ? 'Ph: ' + esc(co.phone) : '', co.email ? esc(co.email) : '', co.gstin ? 'GSTIN: ' + esc(co.gstin) : ''].filter(Boolean).join(' · ')}</div></div></div>`;
/* print window HTML; fit = one A4 page: the document sits in a .dpage box exactly the printable area (A4 less the 12 mm margins) */
const printHtml = (title, inner, fit) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOC_CSS}@page{size:A4;margin:12mm}body{margin:0;background:#fff}.doc{box-shadow:none;margin:0 auto;border:0}</style></head><body>${fit ? `<div class="dpage">${inner}</div>` : inner}</body></html>`;
/* Fit the document in .dpage onto one page: measured at the page width, it is scaled down (transform, so the text stays vector)
   just enough to fit the height, and widened by the same factor so it still fills the width. A document shorter than the page
   is stretched to the full height instead, which puts the signature (margin-top:auto) at the foot of the page. */
const PRINT_A4 = { w: 186, h: 271 }; /* mm: A4 210 × 297 less 12 mm margins, with 2 mm to spare on the height */
function fitPage(win) {
  const page = win.document.querySelector('.dpage'), el = page && page.firstElementChild; if (!el) return 1;
  const mm = 96 / 25.4, W = PRINT_A4.w * mm, H = PRINT_A4.h * mm;
  const height = z => { el.style.width = W / z + 'px'; el.style.minHeight = '0'; return el.offsetHeight; };
  let z = 1;
  for (let i = 0; i < 6; i++) { const nz = Math.min(1, H / height(z)); if (Math.abs(nz - z) < 0.002) { z = nz; break; } z = nz; }
  while (z > 0.5 && height(z) * z > H) z -= 0.01; /* the iteration can stop just above the fit */
  el.style.width = W / z + 'px'; el.style.minHeight = H / z + 'px';
  el.style.transformOrigin = '0 0'; el.style.transform = z < 1 ? `scale(${z})` : '';
  return z;
}
function printDoc(title, inner, fit) {
  const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print or save the PDF', true);
  w.document.write(printHtml(title, inner, fit));
  w.document.close(); setTimeout(() => { if (fit) fitPage(w); w.focus(); w.print(); }, 350);
}
/* tax bill layout (header with the title on the right, Bill to / Ship to, item table with CGST/SGST % and amount, totals beside the words) */
const TAXDOC_CSS = `.dhead{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;border-bottom:2px solid #1d1d1f;padding-bottom:10px}
.dhead .dhco{border:0!important;padding:0!important}.dhead h1{margin:0!important;font-size:22px!important;font-weight:600!important;letter-spacing:.04em;text-align:right!important;white-space:nowrap}
.dco{color:#3a3a3c;font-size:11px;line-height:1.45}.dbs{display:grid;grid-template-columns:1fr 1fr;gap:10px}.dsubj{margin:0 0 4px;font-size:12px}.dsubj span{color:#6e6e73;margin-right:6px}
.dit th{text-align:center!important;vertical-align:middle!important;white-space:nowrap}.dit th.l{text-align:left!important}.dit td.r{text-align:right}
.dfoot{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:12px;align-items:start;margin-top:4px}.dfoot .dtot{margin:0!important;width:100%!important}
.dfoot .dtot tr:last-child td{font-weight:400;font-size:12px;border-bottom:1px solid #e5e5ea}
.dtax .dmeta{grid-template-columns:repeat(3,minmax(0,1fr));gap:3px 14px;margin:8px 0 10px}.dtax .dmeta span{min-width:84px}.dtax .dbox{padding:6px 9px;margin-bottom:8px}
.dit .dpt{text-transform:none!important}.dit .dpk{margin:0 4px 0 0!important;font-size:9.5px}
.dit td{font-size:11px}.dit .dsub{font-size:10.5px}.dit .dpt{font-size:11.5px}.dfoot .dtot td{padding:3px 6px}.dfoot .dbox{margin-bottom:8px}.dlbl{color:#6e6e73;font-size:11px}
.drc{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:20px;align-items:start;margin:22px 0 18px}
.drc .rf{display:grid;grid-template-columns:150px minmax(0,1fr);gap:9px 12px;align-items:end}.drc .rf span{color:#6e6e73}.drc .rf b{border-bottom:1px solid #e5e5ea;padding-bottom:3px;min-height:1.2em}
.drbox{background:#6aa84f;color:#fff;border-radius:6px;padding:24px 14px;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}.drbox small{display:block;font-size:12.5px}.drbox b{display:block;font-size:22px;font-weight:600;margin-top:2px}
.drfrom{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:20px;align-items:end;margin:6px 0 18px}.drfrom h4{margin:0 0 4px;font-size:11px;color:#6e6e73;font-weight:600}
.drcpt h1.drt{text-align:center!important;font-size:17px!important;letter-spacing:.08em;margin:26px 0 0!important;font-weight:600!important}
.dsrt{margin:0 0 10px!important}.dsrt th{text-align:left!important;font-size:10.5px}.dsrt th.dsrh{background:#fff!important;color:#6e6e73;font-weight:600}.dsrt .dsrw{width:55%}.dsrt td{vertical-align:top}
.dsrl{margin:0;padding:0 0 0 22px;column-gap:18px;font:10.5px/1.6 ui-monospace,Menlo,Consolas,monospace}.dsrl li{break-inside:avoid}
.dsign{display:flex;justify-content:flex-end;margin-top:18px;break-inside:avoid}.dstamp{width:260px;text-align:center;font-size:11px}.dstamp .dfor{font-weight:600}
.dstamp .dsp{height:92px}.dstamp .dsl{border-top:1px solid #1d1d1f;padding-top:4px;font-weight:600}.dstamp small{display:block;color:#6e6e73;font-size:10px}
.dpage{width:186mm;height:271mm;overflow:hidden}.dpage .doc{max-width:none;padding:0;margin:0}
.dpage .dtax{font-size:11px;line-height:1.36;box-sizing:border-box;display:flex;flex-direction:column}.dpage .dtax .dsign{margin-top:auto;padding-top:10px}
.dpage .dt{margin:4px 0 8px}.dpage .dt th,.dpage .dt td{padding:3px 5px}.dpage .dbox{padding:5px 8px;margin-bottom:6px}.dpage .dtax .dmeta{margin:6px 0 8px}
.dpage .dhead{padding-bottom:8px}.dpage .dhco img{width:48px;height:48px}.dpage .dstamp .dsp{height:84px}.dtot .dgt td,.dtot .dbal td{font-weight:700!important;font-size:13.5px!important;border-bottom:2px solid #1d1d1f!important}.dtot .dpay td{color:#c4271f}`;
const DOC_CSS = `.tbg{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:1px 12px;margin-top:2px}.tbs+.tbs{margin-top:6px}
.doc{font:12px/1.45 -apple-system,"Segoe UI",Arial,sans-serif;color:#1d1d1f;background:#fff;padding:26px 28px;max-width:794px}
.doc h1{font-size:18px;letter-spacing:.06em;text-align:center;margin:14px 0 12px;font-weight:700}
.dhco{display:flex;gap:12px;align-items:center;border-bottom:2px solid #1d1d1f;padding-bottom:10px}.dhco img{width:54px;height:54px;object-fit:contain}.dhco b{font-size:17px}.dhco div div{color:#3a3a3c;font-size:11.5px}
.dmeta{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;margin:8px 0 12px}.dmeta div{display:flex;gap:6px}.dmeta span{color:#6e6e73;min-width:110px}
.dbox{border:1px solid #d1d1d6;border-radius:6px;padding:8px 10px;margin-bottom:10px}.dbox h4{margin:0 0 4px;font-size:11px;color:#6e6e73;font-weight:600}
.dt{width:100%;border-collapse:collapse;margin:6px 0 10px}.dt th,.dt td{border:1px solid #d1d1d6;padding:5px 6px;text-align:left;vertical-align:top}.dt th{background:#f5f5f7;font-size:10.5px;font-weight:600}.dt .r,.dt .h{text-align:right;white-space:nowrap}.dt .h{text-align:left}
.dtot{margin-left:auto;width:320px}.dtot td{border:0;border-bottom:1px solid #e5e5ea}.dtot tr:last-child td{font-weight:700;font-size:14px;border-bottom:2px solid #1d1d1f}
.dsig{display:flex;justify-content:space-between;align-items:flex-end;margin-top:26px}.dsig div{text-align:center;min-width:200px;border-top:1px solid #1d1d1f;padding-top:4px;font-size:11px}
.dsmall{font-size:10.5px;color:#3a3a3c;white-space:pre-wrap}.dser{columns:3;column-gap:16px;font-size:10.5px;font-family:ui-monospace,Menlo,Consolas,monospace}
.dpt{font-weight:700;text-transform:uppercase}.dpk{display:inline-block;font-size:9.5px;font-weight:700;letter-spacing:.06em;color:#6e6e73;margin-bottom:1px}.dsub{white-space:pre-line;font-size:11px;color:#3a3a3c;margin-top:2px}` + TAXDOC_CSS;

// ---------------- Warranty card ----------------
const W_DEF = { panel_product: 12, panel_perf: 25, inverter: 5, workmanship: 5, structure: 10 };
// Warranty card tab: handover status (manufacturer → office → customer), the uploaded card (kept forever), manufacturer form
const WC_STEPS = [['req', 'Warranty card request submitted', 'Request sent to the manufacturer / distributor'], ['recv', 'Warranty card received', 'Card received from the manufacturer'],
  ['hand', 'Warranty card submitted to customer', 'Handed over to the customer'], ['wa', 'Sent to customer via WhatsApp', 'Card sent on WhatsApp'], ['mail', 'Sent to customer via email', 'Card sent by email']];
async function renderWarranty(box, c, id) {
  box.innerHTML = '<p class="mut">Loading…</p>';
  const [g, cu] = await Promise.all([api('gen', 'get', undefined, `&kind=wcs&customer_id=${id}`), api('customers', 'get', undefined, `&id=${id}`)]);
  const w = canW('customers'), wf = canW('files'), co = g.company || {}, S = Object.assign({ steps: {}, note: '' }, (g.doc || {}).data || {});
  const F = (cu.files || []).filter(f => f.kind === 'warranty');
  box.innerHTML = `<div class="wyg"><div class="card" id="wcs"></div><div class="card" id="wcu"></div></div><div class="card mfc" id="mfr"><p class="mut">Loading…</p></div>`;
  const last = () => { const k = [...WC_STEPS].reverse().find(([k]) => S.steps[k]); return k ? k[1] : 'Not started'; };
  const save = async (msg) => { S.status = last(); try { await api('gen', 'save', { kind: 'wcs', customer_id: id, issued_on: today(), data: S }); if (msg) toast(msg); } catch (e) { } drawS(); };
  const drawS = () => { const done = WC_STEPS.filter(([k]) => S.steps[k]).length;
    $('#wcs', box).innerHTML = `<div class="pfch"><i class="i i-shield"></i><h3>Warranty card handover</h3><span class="sp"></span><span class="pill ${done === WC_STEPS.length ? 'g' : ''}">${esc(last())}</span></div>
      <div class="wyp"><span style="width:${done / WC_STEPS.length * 100}%"></span></div>
      <div class="wyl">${WC_STEPS.map(([k, l], i) => { const x = S.steps[k];
        return `<div class="wyr ${x ? 'on' : ''}"><button class="wyb" data-wk="${k}" ${w ? '' : 'disabled'} title="${x ? 'Mark as not done' : 'Mark as done'}">${x ? '<i class="i i-check"></i>' : i + 1}</button>
          <div class="wyt"><b>${l}</b>${x ? `<small>${fdt(x.on)}${x.by ? ' · ' + esc(x.by) : ''}</small>` : '<small>Pending</small>'}</div>
          ${x && w ? `<input type="date" data-wd="${k}" value="${esc(x.on)}" title="Change the date">` : ''}
          ${k === 'wa' && c.phone ? `<button class="btn sec sm" data-send="wa"><i class="i i-whatsapp"></i> Send</button>` : ''}${k === 'mail' ? `<button class="btn sec sm" data-send="mail"><i class="i i-mail"></i> Send</button>` : ''}${k === 'req' ? '<button class="btn sec sm" data-send="form">Form</button>' : ''}</div>`; }).join('')}</div>
      <label>Note</label><textarea id="wcn" rows="2" placeholder="e.g. courier details, who collected the card" ${w ? '' : 'disabled'}>${esc(S.note || '')}</textarea>
      ${w ? '<div class="bar" style="margin-top:8px"><button class="btn sec sm" id="wcns">Save note</button></div>' : ''}`;
    $$('[data-wk]', box).forEach(b => b.onclick = () => { const k = b.dataset.wk; if (S.steps[k]) { if (!confirm('Mark this step as not done?')) return; delete S.steps[k]; } else S.steps[k] = { on: today(), by: (ME || {}).name || '' }; save(S.steps[k] ? 'Status updated' : 'Step cleared'); });
    $$('[data-wd]', box).forEach(e => e.onchange = () => { if (!e.value) return; S.steps[e.dataset.wd].on = e.value; save('Date updated'); });
    if ($('#wcns', box)) $('#wcns', box).onclick = () => { S.note = $('#wcn', box).value.trim(); save('Note saved'); };
    $$('[data-send]', box).forEach(b => b.onclick = async () => { const k = b.dataset.send;
      if (k === 'form') return $('#mfr', box).scrollIntoView({ behavior: 'smooth' });
      const msg = `Dear ${c.name},\n\nPlease find attached the warranty card for your solar power plant installed by ${co.name || 'us'}. Kindly keep it safe for future warranty claims.${co.phone ? '\n\nFor service, call ' + co.phone + '.' : ''}`;
      // email from the CRM mailbox, with the uploaded warranty cards attached
      if (k === 'mail' && typeof composeMail === 'function' && canW('email')) { try { EM.cfg = EM.cfg || await api('mail', 'config'); } catch (e) { }
        if (EM.cfg && EM.cfg.ready) return composeMail({ to: c.email || '', subject: 'Warranty card — ' + (co.name || 'solar power plant'), body: msg, files: F.map(f => ({ id: f.id, name: f.item ? `${f.item} — ${f.name}` : f.name })),
          onSent: () => { if (w && !S.steps.mail) { S.steps.mail = { on: today(), by: (ME || {}).name || '' }; save('Marked as sent by email'); } } }); }
      if (k === 'wa') { const ph = String(c.phone).replace(/\D/g, '').replace(/^0+/, ''); window.open(`https://wa.me/${ph.length === 10 ? '91' + ph : ph}?text=${encodeURIComponent(msg + '\n\nRegards,\n' + (co.name || ''))}`, '_blank', 'noopener'); }
      else location.href = `mailto:${encodeURIComponent(c.email || '')}?subject=${encodeURIComponent('Warranty card — ' + (co.name || 'solar power plant'))}&body=${encodeURIComponent(msg + '\n\nRegards,\n' + (co.name || ''))}`;
      toast('Attach the warranty card file, send it, then tick the step');
      if (F.length && k === 'wa') window.open(fileUrl(F[0], 1), '_blank', 'noopener'); }); };
  const drawU = () => {
    const G = [['Panel warranty card', 'Solar panels', ''], ['Inverter warranty card', 'Inverter', ''], ['Energy meter warranty card', 'Energy meter', '']];
    if (F.some(f => !G.some(x => x[0] === f.item))) G.push(['Warranty card', 'Other', '']);
    const card = (f, i) => `<div class="wyi"><button class="dcth" data-wv="${i}" title="View">${isImg(f) ? `<img loading="lazy" src="${fileUrl(f)}" alt="">` : `<span class="dcic"><i class="i i-file"></i><b>${esc((f.name.split('.').pop() || '').toUpperCase())}</b></span>`}</button>
        <div class="wym"><b title="${esc(f.name)}">${esc(f.name)}</b><small class="mut">Uploaded ${fdt(String(f.created).slice(0, 10))} · ${Math.round(f.size / 1024)} KB</small>
        <div class="bar"><a class="btn sec sm" href="${fileUrl(f, 1)}"><i class="i i-download"></i> Download</a>${(ME && ME.role === 'admin') ? `<button class="ib" data-wx="${f.id}" title="Delete"><i class="i i-trash"></i></button>` : ''}</div></div></div>`;
    $('#wcu', box).innerHTML = `<div class="pfch"><i class="i i-file"></i><h3>Warranty cards</h3><span class="sp"></span><span class="pill g">Kept forever</span></div>
      <p class="mut" style="font-size:12.5px;margin:0 0 6px">Manufacturer warranty cards. They are never deleted automatically (other documents expire after ${DOC_DAYS} days); only an admin can delete them.</p>
      ${G.map(([item, label]) => { const L = F.map((f, i) => [f, i]).filter(([f]) => item === 'Warranty card' ? !G.slice(0, 3).some(x => x[0] === f.item) : f.item === item);
        return `<div class="wysec"><div class="wyh"><b>${label}</b><span class="wyst ${L.length ? 'ok' : ''}">${L.length ? '<i class="i i-check"></i> Uploaded' : 'Not uploaded'}</span><span class="sp"></span>
          ${wf && item !== 'Warranty card' ? `<label class="btn sec sm wyup" title="Upload the ${label.toLowerCase()} warranty card"><input type="file" accept="image/*,.pdf" hidden multiple data-item="${item}"><i class="i i-upload"></i> Upload</label>` : ''}</div>
          ${L.length ? `<div class="wyf">${L.map(([f, i]) => card(f, i)).join('')}</div>` : ''}</div>`; }).join('')}`;
    $$('[data-wv]', box).forEach(b => b.onclick = () => docViewer(F, +b.dataset.wv));
    $$('[data-wx]', box).forEach(b => b.onclick = async () => { if (!confirm('Delete this warranty card? It goes to the Recycle bin for 72 hours.')) return; try { await api('files', 'delete', { id: +b.dataset.wx }); toast('Warranty card deleted'); renderWarranty(box, c, id); } catch (e) { } });
    $$('.wyup input', box).forEach(inp => inp.onchange = async () => { const files = [...inp.files]; inp.value = ''; if (!files.length) return; const lab = inp.parentElement; lab.classList.add('busy'); let n = 0;
      for (const f0 of files) { const f = f0.size > 10 * 1024 * 1024 && /^image\//.test(f0.type) ? await shrinkImage(f0) : f0;
        if (f.size > 10 * 1024 * 1024) { toast(`${f0.name} is larger than 10 MB`, true); continue; }
        const fd = new FormData(); fd.append('file', f, f.name); fd.append('customer_id', id); fd.append('kind', 'warranty'); fd.append('item', inp.dataset.item);
        try { await api('files', 'upload', fd); n++; } catch (e) { } }
      lab.classList.remove('busy');
      if (n) { toast('Warranty card uploaded'); if (!S.steps.recv && w) { S.steps.recv = { on: today(), by: (ME || {}).name || '' }; await save(); } renderWarranty(box, c, id); } }); };
  drawS(); drawU(); renderMfr($('#mfr', box), c, id);
}

// ---------------- Panel manufacturer warranty form (e.g. ReNew) ----------------
// Same rows as the distributor's Excel form; downloads as .xls in that layout.
const MFR_ROWS = [['distributor', 'Distributer '], ['dealer', 'Dealer Name'], ['module', 'Module Type'], ['serials', 'Sl Nos'], ['sp_invoice', 'Southern Power Invoice No:'], ['cust_name', 'Final Customer Name'], ['cust_invoice', 'Final Customer Invoice No:'], ['invoice_date', 'Final Invoice Date'], ['address', 'Customer Address'], ['phone', 'Customer Phone No: '], ['pdf', 'PDF of Final customer Invoice']];
const mfDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.split('-').reverse().join('-') : (d || '');
/* column widths in characters (SheetJS "wch"); an unknown key saves the columns 0 wide and hidden, and the file opens looking empty */
const MFR_COLS = [{ wch: 32 }, { wch: 85 }];
let XLSX_P = null;
const loadXlsx = () => XLSX_P = XLSX_P || new Promise((ok, no) => { if (window.XLSX) return ok(window.XLSX); const sc = document.createElement('script'); sc.src = 'assets/vendor/xlsx-0.18.5.min.js'; sc.onload = () => ok(window.XLSX); sc.onerror = () => { XLSX_P = null; no(new Error('Could not load the Excel library')); }; document.head.appendChild(sc); });
async function renderMfr(box, c, id, fresh) {
  let g; try { g = await api('gen', 'get', undefined, `&kind=mfr&customer_id=${id}`); } catch (e) { box.innerHTML = '<p class="mut">Could not load the manufacturer form.</p>'; return; }
  const w = canW('customers'), P = g.plant || {}, co = g.company || {}, md = g.mfr_defaults || {}, t = g.tax, sn = (P.panels || []).map(p => (p.serial || '').trim()).filter(Boolean);
  const def = { title: `Form for Warranty Certificate for ${P.panel_make || 'Renew'} `, distributor: md.distributor || 'Southern Power Source Pvt Ltd', email: md.email || '',
    dealer: co.name || 'Jasper Solar Solutions', module: [P.panel_make, P.panel_wattage ? P.panel_wattage + 'W' : '', P.panel_type].filter(Boolean).join(' '),
    serials: sn.join(', '), sp_invoice: '', cust_name: c.name || '', cust_invoice: t ? t.number : '', invoice_date: t ? t.issued_on : '',
    address: [c.address, c.district, c.pincode].filter(Boolean).join(', '), phone: c.phone || '', pdf: t ? `Attached — ${t.number}.pdf` : 'Attached' };
  const D = Object.assign({}, def, fresh ? { distributor: def.distributor, email: def.email, sp_invoice: ((g.doc || {}).data || {}).sp_invoice || '' } : ((g.doc || {}).data || {}));
  const fld = (k, l) => { const v = esc(D[k] ?? ''), dis = w ? '' : 'disabled';
    const inp = k === 'serials' || k === 'address' ? `<textarea data-m="${k}" rows="${k === 'serials' ? 3 : 2}" ${dis}>${v}</textarea>` : k === 'invoice_date' ? `<input type="date" data-m="${k}" value="${v}" ${dis}>` : `<input data-m="${k}" value="${v}" ${dis}${k === 'sp_invoice' ? ' placeholder="From the distributor\'s bill"' : ''}>`;
    return `<div class="mfr"><div class="mfl">${esc(l.trim())}${k === 'serials' ? ` <span class="mfn" id="mfn"></span>` : ''}</div><div class="mfv">${inp}</div></div>`; };
  box.innerHTML = `<div class="pfch"><i class="i i-shield"></i><h3>Manufacturer warranty form</h3><span class="sp"></span><span class="pill ${g.doc ? 'g' : ''}">${g.doc ? 'Saved' : 'Not saved'}</span></div>
    <p class="mut mfh">Panel warranty certificates are issued by the manufacturer. Check the details, download the Excel form and email it with the customer's invoice PDF.</p>
    <div class="mfg"><div class="mfr mft"><div class="mfl">Form title</div><div class="mfv"><input data-m="title" value="${esc(D.title)}" ${w ? '' : 'disabled'}></div></div>
    ${MFR_ROWS.map(([k, l]) => fld(k, l)).join('')}
    <div class="mfr mfe"><div class="mfl">Send to (email)</div><div class="mfv"><input type="email" data-m="email" value="${esc(D.email)}" placeholder="Distributor's email" ${w ? '' : 'disabled'}></div></div></div>
    <div id="mfw"></div>
    <div class="bar" style="margin-top:12px">${w ? '<button class="btn" id="mfs">Save</button>' : ''}<button class="btn sec" id="mfx"><i class="i i-download"></i> Download Excel</button><button class="btn sec" id="mfm"><i class="i i-mail"></i> Email</button><button class="btn sec" id="mfc">Copy details</button>${w ? '<span class="sp"></span><button class="btn sec" id="mfr0" title="Fill again from the profile, plant details and tax bill">Refresh from profile</button>' : ''}</div>
    ${g.doc ? `<p class="mut" style="font-size:12px;margin:8px 0 0">Saved ${new Date(g.doc.updated.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${g.doc.updated_by ? ' by ' + esc(g.doc.updated_by) : ''}</p>` : ''}`;
  const val = () => { const o = {}; $$('[data-m]', box).forEach(e => o[e.dataset.m] = e.value.trim()); return o; };
  const nums = v => (v.serials || '').split(/[\s,;]+/).filter(Boolean);
  const check = () => { const v = val(), n = nums(v), miss = MFR_ROWS.filter(([k]) => !v[k]).map(([, l]) => l.replace(/[: ]+$/, ''));
    $('#mfn', box).textContent = n.length ? `(${n.length}${P.panel_count && +P.panel_count !== n.length ? ' of ' + P.panel_count : ''})` : '';
    $('#mfw', box).innerHTML = miss.length ? `<p class="mfw">Still empty: ${esc(miss.join(', '))}</p>` : ''; };
  check(); box.oninput = check;
  const rows = v => [[v.title || def.title], ...MFR_ROWS.map(([k, l]) => [l, k === 'invoice_date' ? mfDate(v[k]) : v[k] || ''])];
  const fname = v => `${(P.panel_make || 'Renew').replace(/[^\w ]+/g, '').trim() || 'Renew'} Warranty Certificate - ${(v.cust_name || c.name || 'customer').replace(/[\\/:*?"<>|]+/g, '').trim()}.xls`;
  $('#mfx', box).onclick = async e => { const b = e.currentTarget; b.disabled = true;
    try { const X = await loadXlsx(), v = val(), ws = X.utils.aoa_to_sheet(rows(v));
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]; ws['!cols'] = MFR_COLS;
      const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Sheet1'); X.writeFile(wb, fname(v), { bookType: 'biff8' }); toast('Excel form downloaded');
    } catch (x) { toast(x.message || 'Download failed'); } b.disabled = false; };
  const text = v => rows(v).map(r => r.length > 1 ? `${r[0].trim()} ${r[1]}` : r[0].trim()).join('\n');
  $('#mfc', box).onclick = () => copyText(text(val()), 'details');
  $('#mfm', box).onclick = () => { const v = val(), body = `Dear Sir/Madam,\n\nPlease issue the panel warranty certificate for the customer below. The Excel form and the customer invoice PDF are attached.\n\n${text(v)}\n\nRegards,\n${co.name || ''}${co.phone ? '\n' + co.phone : ''}`;
    location.href = `mailto:${encodeURIComponent(v.email || '')}?subject=${encodeURIComponent(`Warranty certificate request — ${v.cust_name} — ${v.module}`)}&body=${encodeURIComponent(body)}`;
    toast('Attach the downloaded Excel form and the invoice PDF before sending'); };
  if ($('#mfs', box)) $('#mfs', box).onclick = async e => { const b = e.currentTarget; b.disabled = true;
    try { await api('gen', 'save', { kind: 'mfr', customer_id: id, issued_on: today(), data: val() }); toast('Manufacturer form saved'); renderMfr(box, c, id); } catch (x) { b.disabled = false; } };
  if ($('#mfr0', box)) $('#mfr0', box).onclick = () => renderMfr(box, c, id, true);
}

// ---------------- Tax bill (GST invoice) ----------------
const HSN = [[/install|commission|labour|service|kseb|net.?meter|formalit/i, '995461', 18], [/panel|module|pv|mono|perc|topcon/i, '85414300', 5], [/inverter|micro|optimi/i, '85044090', 5], [/structure|mount|gi |frame|rail/i, '73089090', 18], [/cable|wire|mc4|earth|la |lightning|db|acdb|dcdb|meter/i, '85444999', 18]]; 
const guessHsn = d => (HSN.find(([re]) => re.test(d || '')) || [null, '', 18]);
async function renderTax(box, c, id) {
  box.innerHTML = '<p class="mut">Loading…</p>';
  if (!document.getElementById('taxdoc-css')) document.head.insertAdjacentHTML('beforeend', `<style id="taxdoc-css">${TAXDOC_CSS}</style>`);
  const g = await api('gen', 'get', undefined, `&kind=tax&customer_id=${id}`), w = canW('customers'), co = g.company, P = g.plant || {};
  const cs = String(co.gstin || '32').slice(0, 2);
  let D = (g.doc || {}).data;
  if (!D) { const items = g.quote && g.quote.items.length ? g.quote.items.map(i => { const h = guessHsn(i.desc); return { desc: i.desc, hsn: h[1], qty: i.qty, rate: i.rate, gst: h[2] }; })
      : [{ desc: `Solar PV power plant ${P.capacity || (g.project || {}).kw || ''} kWp — supply, installation & commissioning`.replace(/\s+kWp/, ' kWp'), hsn: '85414300', qty: 1, rate: Math.round(((g.acct || {}).cost || (g.project || {}).cost || 0) / 1.05 * 100) / 100, gst: 5 }];
    const kwN = parseFloat(P.capacity || (g.project || {}).kw) || 0, ks = (g.qm || {}).kseb || {}, ba = [c.address, c.district, c.pincode].filter(Boolean).join(', ');
    const fee = kwN && ks.reg_per_kw != null ? Math.round((+ks.feas || 0) + (+ks.reg_per_kw || 0) * kwN * (100 + (+ks.reg_gst || 0)) / 100) : 0;
    D = { bill_name: c.name, bill_address: ba, ship_address: ba, cust_gstin: c.gst_no || '', interstate: c.gst_no && String(c.gst_no).slice(0, 2) !== cs ? 1 : 0, items, show_paid: 1, terms: 'Due on receipt',
      subject: kwN ? `${kwN} kW on-grid solar power plant` : 'On-grid solar power plant',
      notes: (fee ? `Customer scope: KSEB feasibility and registration fee ₹${fee.toLocaleString('en-IN')} (registration fee 80% refundable by KSEB).\n` : '') + 'Goods once sold will not be taken back. Subject to Thiruvananthapuram jurisdiction.' }; }
  D.ser = D.ser || { p: 1, i: 1, m: 1 }; D.show_paid = +D.show_paid || 0;
  let A = g.acct || { project_id: 0, cost: 0, payments: [], paid: 0 };
  /* Part A / Part B bill (solar plant under the GST 70:30 rule): the total (incl. GST) is split so that 70% of the taxable value is
     Part A — supply of the plant (panels + inverter, goods at 5%) and 30% is Part B — installation and the rest (service at 18%):
     8.9% overall, the rate quotations use. New bills use it; a bill issued with item lines keeps them until switched. */
  const kwTxt = String(P.capacity || (g.project || {}).kw || '').trim();
  const sp = s => s.replace(/\s+/g, ' ').replace(/\(\s*\)/g, '').trim();
  const defParts = () => {
    const pc = P.panel_count || (P.panels || []).length || '', pa = [];
    const pnl = sp(`${kwTxt ? kwTxt + ' kW — ' : ''}${pc ? pc + ' × ' : ''}${P.panel_wattage ? P.panel_wattage + ' Wp ' : ''}${P.panel_type || ''} ${P.panel_model ? '(' + P.panel_model + ')' : ''}`);
    const inv = sp(`${P.inverter_capacity ? P.inverter_capacity + ' kW ' : ''}${P.inverter_type || ''} ${P.inverter_model ? '(' + P.inverter_model + ')' : ''}`);
    pa.push('Solar panel: ' + (pnl || 'Solar PV modules')); if (P.panel_make) pa.push('Make: ' + P.panel_make);
    pa.push('Grid-tied inverter: ' + (inv || 'On-grid inverter')); if (P.inverter_make) pa.push('Make: ' + P.inverter_make);
    return { total: +A.cost || +(g.project || {}).cost || 0, share: 70,
      a: { title: sp(`Supply of ${kwTxt ? kwTxt + ' kW ' : ''}on-grid solar power plant`), lines: pa.join('\n'), hsn: '85414300', gst: 5 },
      b: { title: sp(`Installation of ${kwTxt ? kwTxt + ' kW ' : ''}on-grid solar power plant`), lines: 'ACDB, DCDB, cables, solar panel mounting structure, earthing materials, wiring materials, lightning arrester, electrical and solar accessories, transit and work cost', hsn: '995461', gst: 18 } }; };
  let PT = D.parts && D.parts.a ? { ...D.parts, a: { ...D.parts.a }, b: { ...D.parts.b } } : (g.doc && (D.items || []).length ? null : defParts());
  const pn = (P.panels || []).filter(x => x.serial), iv = (P.inverters || []).filter(x => x.serial);
  const issued = (g.doc || {}).issued_on || today();
  box.innerHTML = `<div class="gdl"><div class="card gdf"><div class="pfch"><i class="i i-receipt"></i><h3>Tax bill</h3><span class="sp"></span><span class="pill ${g.doc ? 'g' : ''}">${g.doc ? esc(g.doc.number) : 'Not issued yet'}</span></div>
      ${g.quote && g.quote.items.length && !g.doc && !PT ? `<p class="mut" style="font-size:12.5px;margin:0 0 6px">Items copied from quotation ${esc(g.quote.number)} — check HSN codes and GST rates before issuing.</p>` : ''}
      <div class="two"><div class="full"><label for="tno">Invoice no.</label><div class="tbr"><input id="tno" maxlength="40" autocomplete="off" value="${esc(g.doc ? g.doc.number : (g.next_no || ''))}" ${w ? '' : 'disabled'}>${w ? '<button class="btn sec sm" id="tnoauto" type="button" title="Put the next number in the series">Auto</button>' : ''}</div><small class="mut" id="tnoh"></small></div>
       <div><label>Invoice date</label><input type="date" id="tdate" value="${issued}" ${w ? '' : 'disabled'}></div>
       <div><label>Supply</label><select id="tinter" ${w ? '' : 'disabled'}><option value="0" ${+D.interstate ? '' : 'selected'}>Within Kerala — CGST + SGST</option><option value="1" ${+D.interstate ? 'selected' : ''}>Outside Kerala — IGST</option></select></div>
       <div><label>Bill to (name)</label><input data-t="bill_name" value="${esc(D.bill_name || '')}" ${w ? '' : 'disabled'}></div><div><label>Customer GSTIN (if any)</label><input data-t="cust_gstin" value="${esc(D.cust_gstin || '')}" maxlength="15" ${w ? '' : 'disabled'}></div>
       <div class="full"><label>Billing address</label><input data-t="bill_address" value="${esc(D.bill_address || '')}" ${w ? '' : 'disabled'}></div>
       <div class="full"><label>Ship to — installation site</label><input data-t="ship_address" value="${esc(D.ship_address ?? D.bill_address ?? '')}" ${w ? '' : 'disabled'}></div>
       <div class="full"><label>Subject</label><input data-t="subject" value="${esc(D.subject || '')}" placeholder="e.g. 5 kW on-grid solar power plant" ${w ? '' : 'disabled'}></div>
       <div><label>Terms</label><input data-t="terms" value="${esc(D.terms || '')}" placeholder="Due on receipt" ${w ? '' : 'disabled'}></div><div><label>Due date</label><input type="date" data-t="due_on" value="${esc(D.due_on || '')}" ${w ? '' : 'disabled'}></div></div>
      <div id="tlines"></div>
      <label>Notes</label><textarea data-t="notes" rows="2" ${w ? '' : 'disabled'}>${esc(D.notes || '')}</textarea>
      <label>Serial numbers on the bill</label><div class="tbo">${[['p', `Solar panels — ${pn.length ? pn.length + ' entered' : 'none entered'}`], ['i', `Inverter — ${iv.length ? iv.length + ' entered' : 'none entered'}`], ['m', `Energy meter — ${P.meter_serial ? 'entered' : 'not entered'}`]].map(([k, l]) => `<label><input type="checkbox" data-o="${k}" ${D.ser[k] ? 'checked' : ''} ${w ? '' : 'disabled'}> ${l}</label>`).join('')}</div>
      ${!pn.length || !iv.length || !P.meter_serial ? `<p class="mut" style="font-size:12.5px;margin:4px 0 0">Serial numbers come from <b>Plant details</b>${[!pn.length && 'panels', !iv.length && 'inverter', !P.meter_serial && 'energy meter'].filter(Boolean).length ? ' — still missing: ' + [!pn.length && 'panels', !iv.length && 'inverter', !P.meter_serial && 'energy meter'].filter(Boolean).join(', ') : ''}. <button class="btn sec sm" id="tgoplant" type="button">Open Plant details</button></p>` : ''}
      <label>Also print</label><div class="tbo"><label><input type="checkbox" data-o="paid" ${D.show_paid ? 'checked' : ''} ${w ? '' : 'disabled'}> Payment made & balance due</label></div>
      <div class="bar" style="margin:12px 0 0">${w ? '<span class="acx-iss" id="tiss"></span>' : ''}<button class="btn sec" id="tpr"><i class="i i-download"></i> ${g.doc ? 'Print' : 'Print / PDF'}</button></div>
      <small class="acx-lkn" id="tlkn"></small><div id="tshr"></div>
      <p class="mut" style="font-size:12px;margin:8px 0 0">HSN codes and GST rates are suggestions — confirm them with your accountant. The invoice number is issued once and never reused.</p></div>
    <div class="gdp"><div class="doc dtax" id="tdoc"></div></div></div>
    <div class="tbx"><div class="card" id="tacc"></div><div class="card" id="tsum"></div></div>
    <datalist id="hsnl">${['85414300 — Solar PV modules', '85044090 — Inverters', '73089090 — Mounting structure', '85444999 — Cables', '853690 — Connectors / DB', '995461 — Installation services', '998732 — Repair & maintenance'].map(x => `<option value="${x.split(' ')[0]}">${x}</option>`).join('')}</datalist>`;
  let I = (D.items || []).map(x => ({ ...x }));
  const ro = w ? '' : 'disabled';
  const partBox = p => `<div class="tpart"><div class="tpk">Part ${p.toUpperCase()} — ${p === 'a' ? 'solar panel & inverter (goods)' : 'installation & other items (service)'}<span class="sp"></span><small id="pamt_${p}" class="mut"></small></div>
    <label>Title</label><input data-p="${p}.title" value="${esc(PT[p].title)}" ${ro}>
    <label>Details printed under the title (one per line)</label><textarea data-p="${p}.lines" rows="${p === 'a' ? 5 : 3}" ${SPELL} ${ro}>${esc(PT[p].lines)}</textarea>
    <div class="two"><div><label>HSN/SAC</label><input data-p="${p}.hsn" list="hsnl" value="${esc(PT[p].hsn || '')}" ${ro}></div><div><label>GST %</label><select data-p="${p}.gst" ${ro}>${[0, 5, 12, 18, 28].map(r => `<option ${+PT[p].gst === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div></div></div>`;
  const drawItems = () => {
    if (PT) {
      $('#tlines', box).innerHTML = `<label style="margin-top:12px">Total amount incl. GST (₹)</label><div class="tbr"><input id="ptot" data-p="total" inputmode="decimal" value="${+PT.total || ''}" placeholder="Plant cost incl. GST" ${ro}>${w && +A.cost && +A.cost !== +PT.total ? `<button class="btn sec sm" id="puse" type="button">Use plant cost ${inr2(A.cost)}</button>` : ''}</div>
       <div class="two"><div><label>Part A share of the taxable value (%)</label><input data-p="share" inputmode="decimal" value="${+PT.share}" ${ro}></div><div><label>Part B share (%)</label><input id="pshb" value="${100 - Math.min(100, +PT.share || 0)}" disabled></div></div>
       ${partBox('a')}${partBox('b')}`;
      if ($('#puse', box)) $('#puse', box).onclick = () => { PT.total = +A.cost; drawItems(); upd(); };
      return; }
    $('#tlines', box).innerHTML = `<label style="margin-top:12px">Items</label><div id="titems"></div>${w ? '<button class="btn sec sm" id="tadd" type="button"><i class="i i-plus"></i> Add line</button> <button class="btn sec sm" id="tconv" type="button">Use Part A / Part B layout</button>' : ''}`;
    if ($('#tadd', box)) $('#tadd', box).onclick = () => { I.push({ desc: '', hsn: '', qty: 1, rate: 0, gst: 18 }); drawItems(); };
    if ($('#tconv', box)) $('#tconv', box).onclick = () => { PT = defParts(); drawItems(); upd(); toast('Switched to Part A / Part B — check it, then save'); };
    $('#titems', box).innerHTML = I.map((x, i) => `<div class="tirow"><input data-i="${i}" data-f="desc" value="${esc(x.desc)}" placeholder="Description" ${w ? '' : 'disabled'}><input data-i="${i}" data-f="hsn" value="${esc(x.hsn || '')}" placeholder="HSN/SAC" list="hsnl" ${w ? '' : 'disabled'}><input data-i="${i}" data-f="qty" value="${x.qty}" inputmode="decimal" placeholder="Qty" ${w ? '' : 'disabled'}><input data-i="${i}" data-f="rate" value="${x.rate}" inputmode="decimal" placeholder="Rate" ${w ? '' : 'disabled'}><select data-i="${i}" data-f="gst" ${w ? '' : 'disabled'}>${[0, 5, 12, 18, 28].map(r => `<option ${+x.gst === r ? 'selected' : ''}>${r}</option>`).join('')}</select>${w ? `<button class="ib" data-del="${i}" title="Remove line" type="button"><i class="i i-x"></i></button>` : ''}</div>`).join('');
    $$('[data-del]', box).forEach(b => b.onclick = () => { I.splice(+b.dataset.del, 1); drawItems(); upd(); }); };
  const calc = () => { const inter = $('#tinter', box).value === '1'; let tx = 0, tt = 0;
    if (PT) { const r2 = x => Math.round(x * 100) / 100, sh = Math.min(100, Math.max(0, +PT.share || 0)), ga = +PT.a.gst || 0, gb = +PT.b.gst || 0;
      const T = r2((+PT.total || 0) / (1 + (sh * ga + (100 - sh) * gb) / 10000)), atv = r2(T * sh / 100);
      const rows = [['a', atv, ga], ['b', r2(T - atv), gb]].filter(x => x[1] > 0).map(([p, tv, gst]) => ({ part: p.toUpperCase(), desc: PT[p].title, sub: PT[p].lines, hsn: PT[p].hsn, qty: 1, rate: tv, gst, tv, t: inter ? r2(tv * gst / 100) : 2 * r2(tv * gst / 200) })); /* CGST and SGST each at half the rate, so the columns add up */
      rows.forEach(x => { tx += x.tv; tt += x.t; }); const sum = r2(tx + tt), grand = Math.round(sum);
      return { inter, rows, tx: r2(tx), tt: r2(tt), ro: r2(grand - sum), grand, parts: 1, sh, ga, gb }; } const rows = I.filter(x => x.desc).map(x => { const tv = (+x.qty || 0) * (+x.rate || 0), t = tv * (+x.gst || 0) / 100; tx += tv; tt += t; return { ...x, tv, t }; });
    const sum = tx + tt, grand = Math.round(sum); return { inter, rows, tx, tt, ro: grand - sum, grand }; };
  const val = () => { const o = { items: PT ? [] : I, ...(PT ? { parts: PT } : {}), interstate: +$('#tinter', box).value, ser: {}, show_paid: 0 }; $$('[data-t]', box).forEach(e => o[e.dataset.t] = e.value); $$('[data-o]', box).forEach(e => { if (e.dataset.o === 'paid') o.show_paid = e.checked ? 1 : 0; else o.ser[e.dataset.o] = e.checked ? 1 : 0; }); return o; };
  const html = () => { const v = val(), k = calc(), Q = g.qm || {}, inter = k.inter, date = $('#tdate', box).value;
    const CN = Q.name || co.name || 'Jasper Solar Solutions', web = Q.site || '', ph = Q.phone || co.phone || '', em = Q.email || co.email || '';
    const meta = [['Invoice no.', `<b>${esc(($('#tno', box) || {}).value || (g.doc ? g.doc.number : '(issued on save)'))}</b>`], ['Invoice date', fdt(date)], ...(v.terms ? [['Terms', esc(v.terms)]] : []), ['Due date', fdt(v.due_on || date)],
      ['Place of supply', inter ? 'Outside Kerala (IGST)' : 'Kerala (32)'], ['Consumer no.', esc(c.consumer_no || '—')]];
    const nb = x => inr2(x).replace('₹', ''), taxTd = x => inter ? `<td class="r">${+x.gst}%</td><td class="r">${nb(x.t)}</td>` : `<td class="r">${+x.gst / 2}%</td><td class="r">${nb(x.t / 2)}</td><td class="r">${+x.gst / 2}%</td><td class="r">${nb(x.t / 2)}</td>`;
    const colg = `<colgroup><col style="width:20px"><col><col style="width:62px"><col style="width:28px"><col style="width:74px">${inter ? '<col style="width:34px"><col style="width:64px">' : '<col style="width:34px"><col style="width:62px"><col style="width:34px"><col style="width:62px">'}<col style="width:76px"></colgroup>`;
    const desc = x => k.parts ? `<div class="dpt"><span class="dpk">PART ${x.part}</span> ${esc(x.desc)}</div>${x.sub ? `<div class="dsub">${esc(x.sub)}</div>` : ''}` : esc(x.desc);
    const byRate = {}; k.rows.forEach(x => { if (+x.gst) byRate[+x.gst] = (byRate[+x.gst] || 0) + x.t; });
    const taxLines = Object.keys(byRate).map(Number).sort((a, b) => a - b).flatMap(r => inter ? [[`IGST ${r}%`, byRate[r]]] : [[`CGST ${r / 2}%`, byRate[r] / 2], [`SGST ${r / 2}%`, byRate[r] / 2]]);
    const bank = Q.bank ? [['Bank', Q.bank.bank], ['Account name', Q.bank.name], ['Account no.', Q.bank.account], ['IFSC', Q.bank.ifsc]].filter(x => x[1]) : [];
    return `<div class="dhead"><div class="dhco"><img src="${location.origin}/assets/logo.png" alt=""><div><b>${esc(CN)}</b><div class="dco">${esc(Q.address || co.address || '')}${co.gstin ? '<br>GSTIN ' + esc(co.gstin) : ''}${[ph, em, web].filter(Boolean).length ? '<br>' + [ph, em, web].filter(Boolean).map(esc).join(' · ') : ''}</div></div></div><h1>TAX INVOICE</h1></div>
      <div class="dmeta">${meta.map(([l, x]) => `<div><span>${l}</span>${x}</div>`).join('')}</div>
      <div class="dbs"><div class="dbox"><h4>Bill to</h4><b>${esc(v.bill_name)}</b><br>${esc(v.bill_address || '')}${v.cust_gstin ? '<br>GSTIN: ' + esc(v.cust_gstin) : ''}${c.phone ? '<br>Ph: ' + esc(c.phone) : ''}</div>
       <div class="dbox"><h4>Ship to — installation site</h4>${esc(v.ship_address || v.bill_address || '')}</div></div>
      ${v.subject ? `<div class="dsubj"><span>Subject:</span><b>${esc(v.subject)}</b></div>` : ''}
      <table class="dt dit">${colg}<thead><tr><th rowspan="2">#</th><th rowspan="2" class="l">Item &amp; description</th><th rowspan="2">HSN/SAC</th><th rowspan="2">Qty</th><th rowspan="2">Rate (₹)</th>${inter ? '<th colspan="2">IGST</th>' : '<th colspan="2">CGST</th><th colspan="2">SGST</th>'}<th rowspan="2">Amount (₹)</th></tr>
       <tr>${inter ? '<th>%</th><th>Amt</th>' : '<th>%</th><th>Amt</th><th>%</th><th>Amt</th>'}</tr></thead><tbody>
       ${k.rows.map((x, i) => `<tr><td>${i + 1}</td><td>${desc(x)}</td><td class="h">${esc(x.hsn || '')}</td><td class="r">${+x.qty}</td><td class="r">${nb(x.rate)}</td>${taxTd(x)}<td class="r">${nb(x.tv)}</td></tr>`).join('') || `<tr><td colspan="${inter ? 8 : 10}">${k.parts ? 'Enter the total amount' : 'No items'}</td></tr>`}</tbody></table>
      ${k.parts ? `<div class="dsmall" style="margin:-4px 0 8px">GST for a solar power plant: ${k.sh}% of the taxable value is supply of goods (Part A) at ${k.ga}% and ${100 - k.sh}% is installation / service (Part B) at ${k.gb}%.</div>` : ''}
      ${serBox(v)}
      <div class="dfoot"><div><div class="dbox"><span class="dlbl">Total in words:</span> <b>Rupees ${inWords(k.grand)} only</b></div>
        ${v.notes ? `<div class="dbox"><h4>Notes</h4><div class="dsmall">${esc(v.notes)}</div></div>` : ''}
        ${bank.length ? `<div class="dbox"><h4>Bank account details</h4><div class="dsmall">${bank.map(([l, x], i) => `${i === 2 ? '<br>' : i ? ' · ' : ''}${l}: <b>${esc(x)}</b>`).join('')}</div></div>` : ''}</div>
       <table class="dt dtot"><tbody><tr><td>Sub total</td><td class="r">${inr2(k.tx)}</td></tr>${taxLines.map(([l, a]) => `<tr><td>${l}</td><td class="r">${inr2(a)}</td></tr>`).join('')}
        <tr><td>Rounding</td><td class="r">${inr2(k.ro)}</td></tr><tr class="dgt"><td>Total</td><td class="r">${inr2(k.grand)}</td></tr>
        ${v.show_paid ? `<tr class="dpay"><td>Payment made (−)</td><td class="r">${inr2(A.paid)}</td></tr><tr class="dbal"><td>Balance due</td><td class="r">${inr2(Math.max(0, k.grand - A.paid))}</td></tr>` : ''}</tbody></table></div>
      <div class="dsign"><div class="dstamp"><div class="dfor">For ${esc(CN)}</div><div class="dsp"></div><div class="dsl">Authorised signatory</div><small>Seal &amp; signature</small></div></div>`; };
  function serBox(v) { const nm = a => esc(a.filter(Boolean).join(' ')), cols = [];
    if (v.ser.p && pn.length) cols.push([`Panel serial nos. — ${nm([P.panel_make, P.panel_wattage ? P.panel_wattage + ' Wp' : '', P.panel_model])} (${pn.length} nos)`, pn.map(x => x.serial), 1]);
    if (v.ser.i && iv.length) cols.push([`Inverter serial no. — ${nm([P.inverter_make, P.inverter_capacity ? P.inverter_capacity + ' kW' : '', P.inverter_model])}${iv.length > 1 ? ` (${iv.length} nos)` : ''}`, iv.map(x => x.serial)]);
    if (v.ser.m && P.meter_serial) cols.push([`Energy meter serial no. — ${P.meter_make ? nm([P.meter_make]) + ' ' : ''}(uni-directional)`, [P.meter_serial]]); /* our meter is always the uni-directional solar generation meter */
    if (!cols.length) return '';
    /* panels get the wide column and split their list into sub-columns (read top to bottom) so 20+ panels still fit */
    const sub = n => n > 12 ? 3 : n > 4 ? 2 : 1, /* 3 columns is the most that fits the width */ wide = cols.length > 1 && cols[0][2];
    return `<table class="dt dsrt"><thead><tr>${cols.map(([t], i) => `<th${wide && i === 0 ? ' class="dsrw"' : ''}>${t}</th>`).join('')}</tr></thead>
      <tbody><tr>${cols.map(([, a, isP]) => `<td><ol class="dsrl" style="columns:${isP ? sub(a.length) : 1}">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ol></td>`).join('')}</tr></tbody></table>`; }
  // ---- plant cost & payments received
  const MODES = ['UPI', 'Bank transfer', 'Cash', 'Cheque', 'Card', 'Loan', 'Subsidy'];
  /* loan projects: a payment is from the customer or from the bank (the tax bill unlocks once the customer's own share is paid) */
  const isLoan = (g.project || {}).loan === 'Yes';
  const srcSel = (id, cur) => `<select id="${id}" title="Who paid"><option value="customer">From: Customer</option><option value="bank" ${cur === 'bank' ? 'selected' : ''}>From: Bank (loan)</option></select>`;
  const drawAcc = () => { const bal = Math.max(0, (A.cost || 0) - A.paid), wp = w && canW('payments');
    $('#tacc', box).innerHTML = `<div class="pfch"><i class="i i-coin"></i><h3>Plant cost & payments</h3>${A.project_id ? `<span class="sp"></span>${canR('accounts') ? `<a class="btn sec sm" href="#/accounts/cost/${A.project_id}">Project cost</a>` : ''}<a class="btn sec sm" href="#/projects/${A.project_id}">Open project</a>` : ''}</div>
      <div class="tbk"><div><small>Plant cost</small><b>${A.cost ? inr2(A.cost) : 'Not set'}</b></div><div><small>Received</small><b>${inr2(A.paid)}</b></div><div class="${bal > 0 ? 'due' : ''}"><small>Balance</small><b>${A.cost ? inr2(bal) : '—'}</b></div></div>
      ${w ? `<div class="tbr"><input id="tcost" inputmode="decimal" placeholder="Total plant cost (₹)" value="${A.cost || ''}"><button class="btn sec" id="tcsv">Save cost</button></div>` : ''}
      <div class="tbl">${A.payments.map(p => `<div class="tbp"><span>${fdt(p.date)}</span><span>${esc(p.mode || '—')}${p.ref_no ? `<em>Ref ${esc(p.ref_no)}</em>` : !isCash(p) ? '<em class="noref">No reference no. — needed for the receipt</em>' : ''}${p.note ? `<em>${esc(p.note)}</em>` : ''}${p.src === 'bank' ? '<em>From the bank (loan)</em>' : ''}${p.receipt_no ? `<em>Receipt ${esc(p.receipt_no)}</em>` : ''}</span><b>${inr2(p.amount)}</b><button class="ib" data-prc="${p.id}" title="Payment receipt — PDF, WhatsApp, email"><i class="i i-receipt"></i></button>${wp ? `<button class="ib" data-pedit="${p.id}" title="Edit payment"><i class="i i-pencil"></i></button><button class="ib" data-pdel="${p.id}" title="Delete payment"><i class="i i-trash"></i></button>` : ''}</div>`).join('') || '<p class="mut" style="margin:6px 0">No payments recorded yet.</p>'}</div>
      ${wp ? `<div class="tbr tba"><input type="date" id="tpd" value="${today()}"><input id="tpa" inputmode="decimal" placeholder="Amount (₹)"><select id="tpm">${MODES.map(m => `<option>${m}</option>`).join('')}</select><input id="tpref" placeholder="${REF_PH}" maxlength="60" autocomplete="off"><input id="tpn" placeholder="Note (optional)" maxlength="120">${isLoan ? srcSel('tpsrc', 'customer') : ''}<button class="btn" id="tpadd">Add payment</button></div>` : ''}
      ${!A.project_id && w ? '<p class="mut" style="font-size:12px;margin:6px 0 0">Saving the plant cost also starts this customer\'s project in the pipeline.</p>' : ''}`;
    const reload = accReload;
    if ($('#tcsv', box)) $('#tcsv', box).onclick = async e => { e.currentTarget.disabled = true; try { await api('gen', 'cost', { kind: 'tax', customer_id: id, cost: +$('#tcost', box).value || 0 }); toast('Plant cost saved'); await accReload(); } catch (x) { drawAcc(); } }; /* the cost changes what is still due, so the bill lock is read again */
    if ($('#tpadd', box)) $('#tpadd', box).onclick = async e => { const amt = +$('#tpa', box).value || 0; if (amt <= 0) return toast('Enter the amount received', true);
      if (!A.project_id) return toast('Save the plant cost first', true); e.currentTarget.disabled = true;
      const pay = { project_id: A.project_id, date: $('#tpd', box).value || today(), amount: amt, mode: $('#tpm', box).value, ref_no: $('#tpref', box).value.trim(), note: $('#tpn', box).value.trim(), src: $('#tpsrc', box) ? $('#tpsrc', box).value : 'customer' };
      let nid = 0; try { nid = (await api('payments', 'save', pay)).id; } catch (x) { }
      await reload(); if (!nid) return;
      if (isCash(pay) || pay.ref_no) { toast('Payment added'); openReceipt(nid); } else toast('Payment added. Add its reference number (Edit) to make the receipt.', true); };
    if ($('#tpm', box)) $('#tpm', box).onchange = () => { $('#tpref', box).placeholder = $('#tpm', box).value === 'Cash' ? 'Reference no. (optional for cash)' : REF_PH; };
    $$('[data-pedit]', box).forEach(b => b.onclick = () => editPayment(b.dataset.pedit));
    $$('[data-prc]', box).forEach(b => b.onclick = () => openReceipt(b.dataset.prc));
    $$('[data-pdel]', box).forEach(b => b.onclick = async () => { if (!confirm('Delete this payment? It goes to the Recycle bin for 72 hours.')) return; try { await api('payments', 'delete', { id: +b.dataset.pdel }); toast('Payment deleted'); } catch (x) { } reload(); }); };
  // ---- payment receipt (the receipt window, its PDF and sharing live in app35.js: acReceipt)
  const isCash = p => String(p.mode || '').trim().toLowerCase() === 'cash';
  const REF_PH = 'Reference no. (UTR / cheque / txn)';
  /* payments, plant cost and the tax bill lock again (a payment can unlock the bill) */
  const accReload = async () => { const r = await api('gen', 'get', undefined, `&kind=tax&customer_id=${id}`); A = r.acct; g.lock = r.lock; drawAcc(); upd(); drawIssue(); };
  /* edit a payment: date, amount, mode, reference no. (needed for the receipt unless cash), who paid (loan projects), note; a receipt already made keeps its number */
  const editPayment = (pid, why) => {
    const p = A.payments.find(x => x.id == pid); if (!p) return;
    const modes = MODES.includes(p.mode) || !p.mode ? MODES : MODES.concat(p.mode);
    /* older payments kept the reference in the note ("Reference / note"): offer it when it looks like one (has a number, short) */
    const guess = !p.ref_no && /\d/.test(p.note || '') && String(p.note).length <= 40 ? p.note : '';
    const m = modal(`<h3 style="margin-top:0">Edit payment${p.receipt_no ? ' · receipt ' + esc(p.receipt_no) : ''}</h3>${why ? `<p class="mfw" style="margin:0 0 10px">${esc(why)}</p>` : ''}
      <div class="two"><div><label for="pe_d">Date</label><input type="date" id="pe_d" value="${esc(p.date || '')}"></div><div><label for="pe_a">Amount (₹)</label><input id="pe_a" inputmode="decimal" value="${+p.amount || ''}"></div>
       <div><label for="pe_m">Mode</label><select id="pe_m">${modes.map(x => `<option ${x === p.mode ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div><div><label for="pe_r">Reference no.</label><input id="pe_r" maxlength="60" autocomplete="off" placeholder="UTR / cheque / transaction no." value="${esc(p.ref_no || guess)}">${guess ? '<small class="mut">Filled in from the note — check it.</small>' : ''}</div>
       ${isLoan || p.src === 'bank' ? `<div><label for="pe_src">Paid by</label>${srcSel('pe_src', p.src)}</div>` : ''}
       <div class="full"><label for="pe_n">Note</label><input id="pe_n" maxlength="120" value="${esc(p.note || '')}"></div></div>
      ${p.receipt_no ? '<p class="mut" style="font-size:12.5px;margin:8px 0 0">The receipt keeps its number. Open it again after saving to get the corrected copy.</p>' : ''}
      <div class="bar" style="margin-top:12px"><button class="btn" id="pe_s">Save</button><button class="btn sec" id="pe_x">Cancel</button></div>`);
    if (why) setTimeout(() => $('#pe_r', m).focus(), 50);
    $('#pe_x', m).onclick = () => m.remove();
    $('#pe_s', m).onclick = async e => { const amt = +$('#pe_a', m).value || 0; if (amt <= 0) return toast('Enter the amount', true); e.currentTarget.disabled = true;
      /* src is always sent: a save without it would turn a bank payment into a customer one */
      const o = { id: p.id, project_id: A.project_id, date: $('#pe_d', m).value || p.date, amount: amt, mode: $('#pe_m', m).value, ref_no: $('#pe_r', m).value.trim(), note: $('#pe_n', m).value.trim(), src: $('#pe_src', m) ? $('#pe_src', m).value : (p.src === 'bank' ? 'bank' : 'customer') };
      try { await api('payments', 'save', o); toast('Payment updated'); m.remove(); await accReload(); if (why && (isCash(o) || o.ref_no)) openReceipt(p.id); } catch (x) { e.currentTarget.disabled = false; } };
  };
  const openReceipt = pid => acReceipt(pid, { onChange: accReload,
    onNoRef: (p, why) => w && canW('payments') ? editPayment(pid, why) : toast('This payment has no reference number, so no receipt can be made. Ask someone who can edit payments.', true) });
  // ---- bill details for the warranty card and GST filing
  const sumRows = () => { const v = val(), k = calc(), hs = {};
    k.rows.forEach(x => { const key = (x.hsn || '—') + '|' + (+x.gst); (hs[key] = hs[key] || { hsn: x.hsn || '—', gst: +x.gst, qty: 0, tv: 0, t: 0 }); hs[key].qty += +x.qty || 0; hs[key].tv += x.tv; hs[key].t += x.t; });
    return { v, k, hs: Object.values(hs), info: [['Invoice no.', ($('#tno', box) || {}).value || (g.doc ? g.doc.number : 'Not issued yet')], ['Invoice date', fdt($('#tdate', box).value)], ['Customer', v.bill_name], ['Customer GSTIN', v.cust_gstin || 'Unregistered (B2C)'], ['Place of supply', k.inter ? 'Outside Kerala (IGST)' : '32 — Kerala'], ['Supplier GSTIN', co.gstin || '—'],
      ['Taxable value', inr2(k.tx)], ...(k.inter ? [['IGST', inr2(k.tt)]] : [['CGST', inr2(k.tt / 2)], ['SGST', inr2(k.tt / 2)]]), ['Invoice total', inr2(k.grand)], ['Plant cost', A.cost ? inr2(A.cost) : 'Not set'], ['Payments received', inr2(A.paid)], ['Balance due', inr2(Math.max(0, k.grand - A.paid))]] }; };
  const drawSum = () => { const { k, hs, info } = sumRows(), diff = A.cost && Math.abs(A.cost - k.grand) >= 1;
    $('#tsum', box).innerHTML = `<div class="pfch"><i class="i i-file"></i><h3>Bill details</h3><span class="sp"></span><button class="btn sec sm" id="tscp"><i class="i i-copy"></i> Copy</button><button class="btn sec sm" id="tscsv"><i class="i i-download"></i> CSV</button></div>
      <p class="mut" style="font-size:12.5px;margin:0 0 8px">For the warranty card and GST filing (GSTR-1). The bill number is also saved in Plant details.</p>
      <div class="tbd">${info.map(([l, x]) => `<div><span>${l}</span><b>${esc(x)}</b></div>`).join('')}</div>
      ${diff ? `<p class="mfw">Plant cost (${inr2(A.cost)}) and invoice total (${inr2(k.grand)}) differ by ${inr2(Math.abs(A.cost - k.grand))}.${w ? ' <button class="btn sec sm" id="tmatch" title="Scale the item rates so the invoice total (with GST) equals the plant cost">Match plant cost</button>' : ''}</p>` : ''}
      <table class="tbh"><thead><tr><th>HSN/SAC</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Taxable</th>${k.inter ? '<th class="r">IGST</th>' : '<th class="r">CGST</th><th class="r">SGST</th>'}</tr></thead>
      <tbody>${hs.map(h => `<tr><td>${esc(h.hsn)}</td><td class="r">${+h.qty.toFixed(2)}</td><td class="r">${h.gst}%</td><td class="r">${inr2(h.tv)}</td>${k.inter ? `<td class="r">${inr2(h.t)}</td>` : `<td class="r">${inr2(h.t / 2)}</td><td class="r">${inr2(h.t / 2)}</td>`}</tr>`).join('')}</tbody></table>`;
    if ($('#tmatch', box)) $('#tmatch', box).onclick = () => { if (PT) { PT.total = +A.cost; drawItems(); upd(); return toast('Total set to the plant cost — save to keep'); } const f = A.cost / calc().grand; I.forEach(x => x.rate = Math.round((+x.rate || 0) * f * 100) / 100); drawItems(); upd(); const d = A.cost - calc().grand; if (Math.abs(d) >= 0.5 && I.length) { const x = I.find(y => +y.qty === 1) || I[0]; x.rate = Math.round((x.rate + d / (+x.qty || 1) / (1 + (+x.gst || 0) / 100)) * 100) / 100; drawItems(); upd(); } toast('Item rates adjusted — save to keep'); };
    $('#tscp', box).onclick = () => { const r = sumRows(); copyText(r.info.map(([l, x]) => `${l}: ${x}`).join('\n') + '\n\nHSN summary\n' + r.hs.map(h => `${h.hsn} · ${h.gst}% · taxable ${inr2(h.tv)} · tax ${inr2(h.t)}`).join('\n'), 'bill details'); };
    $('#tscsv', box).onclick = () => { const r = sumRows(), q = x => '"' + String(x).replace(/"/g, '""') + '"', n = x => (Math.round(x * 100) / 100).toFixed(2);
      const csv = ['Invoice no,Invoice date,Customer,Customer GSTIN,Place of supply,HSN/SAC,Qty,GST rate %,Taxable value,CGST,SGST,IGST,Invoice total',
        ...r.hs.map(h => [g.doc ? g.doc.number : '', $('#tdate', box).value, r.v.bill_name, r.v.cust_gstin, r.k.inter ? 'Other state' : '32-Kerala', h.hsn, +h.qty.toFixed(2), h.gst, n(h.tv), r.k.inter ? 0 : n(h.t / 2), r.k.inter ? 0 : n(h.t / 2), r.k.inter ? n(h.t) : 0, r.k.grand].map(q).join(','))].join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' })); a.download = `Tax bill ${(g.doc ? g.doc.number : 'draft').replace(/\//g, '-')} - ${c.name}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }; };
  const upd = () => { $('#tdoc', box).innerHTML = html(); drawSum();
    if (PT) { const k = calc(); ['A', 'B'].forEach(p => { const x = k.rows.find(r => r.part === p), el = $('#pamt_' + p.toLowerCase(), box); if (el) el.textContent = x ? `${inr2(x.tv)} + GST ${inr2(x.t)} = ${inr2(x.tv + x.t)}` : '—'; });
      const b = $('#pshb', box); if (b) b.value = 100 - k.sh; } };
  drawItems(); drawAcc(); upd();
  box.addEventListener('input', e => { if (PT && e.target.dataset.p) { const [k, f] = e.target.dataset.p.split('.');
      if (f) PT[k][f] = f === 'gst' ? +e.target.value : e.target.value; else PT[k] = Math.max(0, +String(e.target.value).replace(/[^\d.]/g, '') || 0); upd(); return; }
    if (e.target.dataset.i !== undefined) { const x = I[+e.target.dataset.i]; x[e.target.dataset.f] = e.target.dataset.f === 'desc' || e.target.dataset.f === 'hsn' ? e.target.value : +e.target.value || 0;
      if (e.target.dataset.f === 'desc' && !x.hsn) { const h = guessHsn(x.desc); if (h[1]) { x.hsn = h[1]; x.gst = h[2]; drawItems(); } } } upd(); });
  box.addEventListener('change', e => { if (e.target.dataset.f === 'gst') { I[+e.target.dataset.i].gst = +e.target.value; } upd(); });
  let noAuto = !g.doc;
  const noHint = () => { const h = $('#tnoh', box); if (h) h.textContent = g.doc ? 'Change it only to correct a mistake. A number can be on one bill only.' : noAuto ? 'Next number in the series. Type your own to change it — the series then carries on from it.' : 'Your own number. It must not be on any other bill.'; };
  const nextNo = async () => { try { const r = await api('gen', 'next', undefined, `&kind=tax&customer_id=${id}&date=${$('#tdate', box).value}`); $('#tno', box).value = r.number; } catch (e) { } upd(); };
  if ($('#tno', box)) $('#tno', box).addEventListener('input', () => { if (!g.doc) noAuto = false; noHint(); });
  if ($('#tnoauto', box)) $('#tnoauto', box).onclick = async () => { if (g.doc && !confirm('Give this bill the next number in the series? The old number will no longer be on it.')) return; noAuto = !g.doc; await nextNo(); noHint(); };
  $('#tdate', box).addEventListener('change', () => { if (!g.doc && noAuto) nextNo(); });
  noHint();
  if ($('#tgoplant', box)) $('#tgoplant', box).onclick = () => { const t = document.querySelector('[data-pt="plant"]'); if (t) { t.click(); scrollTo({ top: 0, behavior: 'smooth' }); } };
  $('#tpr', box).onclick = () => printDoc(`Tax invoice — ${c.name}`, `<div class="doc dtax">${html()}</div>`, true); /* always one A4 page */
  /* issue (gives the number) or save the bill. The first issue waits for the final payment (g.lock from the server; a loan project
     unlocks once only the bank's part is left); an admin may issue it early after a confirm (early:1, audited by the server). */
  const issue = async early => { const v = val(), k = calc(); if (!k.rows.length) return toast(PT ? 'Enter the total amount (incl. GST)' : 'Add at least one item', true);
    v.grand = k.grand; v.taxable = Math.round(k.tx * 100) / 100; v.tax = Math.round(k.tt * 100) / 100; const b = $('#tsv', box); if (b) b.disabled = true;
    try { const r = await api('gen', 'save', { kind: 'tax', customer_id: id, issued_on: $('#tdate', box).value, number: !g.doc && noAuto ? '' : $('#tno', box).value.trim(), data: v, ...(early ? { early: 1 } : {}) });
      toast(`Tax bill ${r.number} saved`); renderTax(box, c, id); } catch (e) { accReload().catch(() => { if (b) b.disabled = false; }); } };
  function drawIssue() { const el = $('#tiss', box), n = $('#tlkn', box), L = g.lock || {}, locked = !g.doc && !!L.locked;
    if (n) n.textContent = !g.doc && !L.locked && L.why === 'bank_left' ? `${L.msg}. The bill can be issued now; the bank releases its part after it gets the bill.` : '';
    if (!el) return;
    el.innerHTML = `<button class="btn" id="tsv" ${locked ? 'disabled' : ''}>${g.doc ? 'Save changes' : 'Issue tax bill' + (locked ? ' — ' + esc(L.msg || 'payment still due') : '')}</button>${locked && ME && ME.role === 'admin' ? '<button type="button" class="acx-link" id="tearly" title="Admin only: issue the bill although money is still due">Issue early</button>' : ''}`;
    $('#tsv', box).onclick = () => issue(false);
    if ($('#tearly', box)) $('#tearly', box).onclick = () => { if (confirm('Issue the tax bill before full payment?')) issue(true); }; }
  /* an issued bill: PDF, Email / WhatsApp to the customer and, on a loan project, to the bank (tax bill template), each share logged */
  const drawShare = () => { const el = $('#tshr', box); if (!el || !g.doc) return;
    const bk = isLoan && canR('loans'), sb = (via, to, icon, label) => `<button class="btn sec sm" data-via="${via}" data-to="${to}"><i class="i i-${icon}"></i> ${label}</button>`;
    el.innerHTML = `<div class="acx-tsh"><div class="bar"><b>Send the bill</b><span class="sp"></span>${sb('pdf', 'customer', 'download', 'PDF')}${sb('email', 'customer', 'mail', 'Email')}${sb('whatsapp', 'customer', 'whatsapp', 'WhatsApp')}${bk ? sb('email', 'bank', 'bank', 'Email to bank') + sb('whatsapp', 'bank', 'whatsapp', 'WhatsApp to bank') : ''}</div>
      <div class="acx-shl">${acSharedHtml(g.shared || [])}</div></div>`;
    $$('[data-via]', el).forEach(btn => btn.onclick = () => acShareBtn(btn, async () => { const k = calc(), Q = g.qm || {}, cu = g.customer || c, name = acFileName('Tax invoice', g.doc.number, c.name);
      const blob = await acPdfFromHtml(`<div class="doc dtax">${html()}</div>`, DOC_CSS + ACX_A4_FILL, name); /* one A4 page, as printed */
      return { kind: 'tax', via: btn.dataset.via, to_whom: btn.dataset.to, blob, name, cust: cu, customer_id: id, project_id: A.project_id, payment_id: 0,
        vars: acVars({ customer: cu, company: { name: Q.name || co.name, phone: Q.phone || co.phone }, bill: { no: g.doc.number, date: g.doc.issued_on, total: k.grand }, received_total: A.paid, kw: kwTxt || (g.project || {}).kw }),
        onLogged: s => { g.shared = [s].concat(g.shared || []); drawShare(); } }; })); };
  drawIssue(); drawShare();
}

// ---------------- MNRE warranty certificate, printed on the Jasper Solar letterhead ----------------
/* The letterhead is the company's own PDF rendered at 200 dpi (assets/letterhead.png): header with the logos and contacts,
   "Ref No." and "Date" lines at 62.6–66.1 mm, watermark, and the office / GSTIN footer from about 264 mm. The certificate
   text follows the MNRE recommended format: 5-year system warranty, module performance note, customer data, module and
   inverter details, module serial numbers, and the company seal & signature. */
const MNRE_CSS = `.lhp{position:relative;width:210mm;height:297mm;background:#fff;overflow:hidden;box-sizing:border-box;color:#111;font:12.5px/1.36 "Times New Roman",Times,serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.lhp .lhbg{position:absolute;left:0;top:0;width:100%;height:100%;z-index:0}
.lhp .lhref,.lhp .lhdate{position:absolute;top:61.4mm;z-index:1;font:600 12.5px/1.2 "Times New Roman",Times,serif;background:#fff;padding:0 2px}
.lhp .lhref{left:27mm}.lhp .lhdate{left:155mm}
.lhp .lhbody{position:absolute;top:71mm;left:14mm;right:14mm;bottom:35mm;z-index:1}
.lhp h2{margin:0 0 5px;text-align:center;font-size:15px;font-weight:700;text-decoration:underline;letter-spacing:.02em}
.lhp p{margin:0 0 5px;text-align:justify}
.lhp h3{margin:7px 0 3px;text-align:center;font-size:13px;font-weight:700;text-decoration:underline}
.lhp table{width:100%;border-collapse:collapse;background:transparent;margin:0}
.lhp td{border:1px solid #222!important;padding:1px 6px!important;font-size:12px!important;vertical-align:top;text-align:left;overflow-wrap:normal!important;word-break:normal;background:transparent!important}
.lhp th{border:0!important;padding:2px 0!important;font-size:12.5px!important;font-weight:700;text-decoration:underline;text-align:center;color:#111!important;background:transparent!important;text-transform:none!important;letter-spacing:0!important}
.lhp .mcd td:first-child{width:44%}.lhp td.pre{white-space:pre-line}
.lhp .mgrid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px;margin-top:5px}.lhp .mgrid td:first-child{width:42%}
.lhp .mbot{display:grid;grid-template-columns:54% 1fr;gap:14px;margin-top:6px;align-items:start}.lhp .mbot .msig{align-self:end}.lhp .mbot.full{grid-template-columns:1fr}
.lhp .msrh{text-align:center;font-size:12.5px;font-weight:700;text-decoration:underline;padding:2px 0}.lhp .msrg{display:grid;gap:0 10px;align-items:start}
.lhp .msr td{font-family:"Times New Roman",Times,serif}.lhp .msr td.n{width:28px;text-align:center}.lhp .msig .bl{display:inline-block;min-width:38mm;border-bottom:1px dotted #555}
.lhp .msig{display:flex;flex-direction:column;align-items:center;text-align:center;font-size:12.5px}.lhp .msig .seal{height:34mm;width:100%}
.lhp .msig b{font-size:13px}
.lhwrap{overflow:hidden;margin:0 auto}.lhfit{transform-origin:top left;box-shadow:0 1px 3px rgba(0,0,0,.08),0 10px 30px rgba(0,0,0,.10)}`;
const dotd = s => s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : '';
function mnrePage(v, ref, date, pn, iv) {
  const sn = pn.map(x => x.serial), n = sn.length, pairs = n > 20 ? 3 : n > 10 ? 2 : 1, per = Math.ceil(n / pairs) || 0; /* one row per panel, no blank rows */
  const stabs = Array.from({ length: pairs }, (_, p) => sn.slice(p * per, (p + 1) * per)).filter(a => a.length).map((a, p) => `<table class="msr">${a.map((x, r) => `<tr><td class="n">${p * per + r + 1}</td><td>${esc(x)}</td></tr>`).join('')}</table>`).join('');
  const row = (l, x) => `<tr><td>${l}</td><td>${esc(x || '')}</td></tr>`;
  return `<div class="lhp"><img class="lhbg" src="${location.origin}/assets/letterhead.png" alt="">
   ${ref ? `<div class="lhref">${esc(ref)}</div>` : ''}${date ? `<div class="lhdate">${esc(dotd(date))}</div>` : ''}
   <div class="lhbody"><h2>WARRANTY CERTIFICATE</h2>
    <p>The module mounting structure, electrical works including power conditioners/inverters/maximum power point tracker units/distribution boards/digital meters/switchgear etc. and overall workmanship of the SPV power plants/systems are warranted against any design/installation defects except from natural calamities with effect from <b>${esc(dotd(v.eff) || '—')}</b> for a period of <b>${+v.years || 5} years</b>.</p>
    <p><b>Note: -</b> All PV modules shall carry a performance warranty of &gt;90% during the first 10 years, and &gt;80% during the next 15 years. Further, module shall have performance warranty of &gt;97% during the first year of installation. The degradation of the module below 1% per annum.</p>
    <h3>CUSTOMER DATA</h3>
    <table class="mcd">${row('NAME', v.name)}<tr><td>ADDRESS</td><td class="pre">${esc(v.address || '')}</td></tr>${row('EB CONSUMER NUMBER', v.consumer_no)}${row('INSTALLED PLANT CAPACITY', v.capacity)}${row('CONTACT NUMBER', v.phone)}${row('EB PHASE', v.phase)}</table>
    <div class="mgrid"><table><tr><th colspan="2">SPV MODULE</th></tr>${row('MAKE/MODEL', v.mod_make)}${row('MODULE TYPE', v.mod_type)}${row('MODULE WATTS', v.mod_watts)}</table>
     <table><tr><th colspan="2">INVERTER</th></tr>${row('MAKE/MODEL', v.inv_make)}${row('CAPACITY', v.inv_capacity)}${row('SERIAL NUMBER', iv.map(x => x.serial).join(', '))}</table></div>
    <div class="mbot${pairs === 3 ? ' full' : ''}"><div>${n ? `<div class="msrh">SPV MODULE SERIAL NUMBER</div><div class="msrg" style="grid-template-columns:repeat(${pairs},minmax(0,1fr))">${stabs}</div>` : ''}</div>
     <div class="msig"><div class="seal"></div><b>For JASPER SOLAR SOLUTIONS</b><div>Name: ${v.sign_name ? esc(v.sign_name) : '<span class="bl"></span>'}</div><div>Designation: ${v.sign_desig ? esc(v.sign_desig) : '<span class="bl"></span>'}</div>${v.sign_phone ? `<div>Phone: ${esc(v.sign_phone)}</div>` : ''}</div></div>
   </div></div>`;
}
function printLetter(title, page) {
  const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print or save the PDF', true);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:0}html,body{margin:0;background:#fff}${MNRE_CSS}</style></head><body>${page}</body></html>`);
  w.document.close();
  const im = w.document.querySelector('img'), go = () => setTimeout(() => { w.focus(); w.print(); }, 250);
  if (!im || im.complete) go(); else { im.onload = go; im.onerror = go; }
}
async function renderMnre(box, c, id) {
  box.innerHTML = '<p class="mut">Loading…</p>';
  if (!document.getElementById('mnre-css')) document.head.insertAdjacentHTML('beforeend', `<style id="mnre-css">${MNRE_CSS}</style>`);
  const g = await api('gen', 'get', undefined, `&kind=warranty&customer_id=${id}`), w = canW('customers'), P = g.plant || {}, M = g.mnre || {};
  const pn = (P.panels || []).filter(x => x.serial), iv = (P.inverters || []).filter(x => x.serial);
  const invCap = (P.inverters || []).filter(x => x.capacity).map(x => x.capacity + ' kW').join(', ') || (P.inverter_capacity ? P.inverter_capacity + ' kW' : '');
  const def = { eff: P.commissioned_on || P.installed_on || today(), years: 5, name: c.name || '', address: [c.address, [c.district, c.pincode].filter(Boolean).join(' - ')].filter(Boolean).join('\n'),
    consumer_no: c.consumer_no || '', capacity: P.capacity ? P.capacity + ' kW' : '', phone: c.phone || '', phase: c.phase || '',
    mod_make: [P.panel_make, P.panel_model].filter(Boolean).join(' / '), mod_type: P.panel_type || '', mod_watts: P.panel_wattage ? P.panel_wattage + ' Wp' : '',
    inv_make: [P.inverter_make, P.inverter_model].filter(Boolean).join(' / '), inv_capacity: invCap,
    sign_name: M.sign_name || '', sign_desig: M.sign_desig || 'Proprietor', sign_phone: M.sign_phone || '' };
  const D = Object.assign({}, def, (g.doc || {}).data || {}), ro = w ? '' : 'disabled';
  const f = (k, l, o = {}) => `<div class="${o.full ? 'full' : ''}"><label for="mf_${k}">${l}</label>${o.ta ? `<textarea id="mf_${k}" data-m="${k}" rows="${o.ta}" ${ro}>${esc(D[k] || '')}</textarea>` : `<input id="mf_${k}" data-m="${k}" ${o.type ? `type="${o.type}"` : ''} value="${esc(D[k] ?? '')}" ${ro}>`}</div>`;
  box.innerHTML = `<div class="gdl"><div class="card gdf"><div class="pfch"><i class="i i-award"></i><h3>MNRE warranty card</h3><span class="sp"></span><span class="pill ${g.doc ? 'g' : ''}">${g.doc ? esc(g.doc.number) : 'Not issued yet'}</span></div>
      <p class="mut" style="font-size:12.5px;margin:0 0 8px">Warranty certificate in the MNRE recommended format, printed on the Jasper Solar letterhead.</p>
      <div class="two"><div class="full"><label for="mref">Ref No.</label><div class="tbr"><input id="mref" maxlength="40" autocomplete="off" value="${esc(g.doc ? g.doc.number : (g.next_no || ''))}" ${ro}>${w ? '<button class="btn sec sm" id="mrefauto" type="button" title="Put the next number in the series">Auto</button>' : ''}</div><small class="mut" id="mrefh"></small></div>
       <div><label for="mdate">Date</label><input type="date" id="mdate" value="${esc((g.doc || {}).issued_on || today())}" ${ro}></div><div></div>
       ${f('eff', 'Warranty with effect from', { type: 'date' })}${f('years', 'Warranty period (years)', { type: 'number' })}</div>
      <label class="msec">Customer data</label><div class="two">${f('name', 'Name', { full: 1 })}${f('address', 'Address', { full: 1, ta: 2 })}${f('consumer_no', 'EB consumer number')}${f('capacity', 'Installed plant capacity')}${f('phone', 'Contact number')}${f('phase', 'EB phase')}</div>
      <label class="msec">SPV module</label><div class="two">${f('mod_make', 'Make / model', { full: 1 })}${f('mod_type', 'Module type')}${f('mod_watts', 'Module watts')}</div>
      <label class="msec">Inverter</label><div class="two">${f('inv_make', 'Make / model')}${f('inv_capacity', 'Capacity')}</div>
      <p class="mut" style="font-size:12.5px;margin:6px 0 0">Serial numbers come from <b>Plant details</b>: ${pn.length} module${pn.length === 1 ? '' : 's'}, ${iv.length} inverter${iv.length === 1 ? '' : 's'}. <button class="btn sec sm" id="mgoplant" type="button">Open Plant details</button></p>
      <label class="msec">Signed by</label><div class="two">${f('sign_name', 'Name')}${f('sign_desig', 'Designation')}${f('sign_phone', 'Phone')}</div>
      <div class="bar" style="margin-top:12px">${w ? `<button class="btn" id="msv">${g.doc ? 'Save changes' : 'Issue warranty card'}</button>` : ''}<button class="btn sec" id="mpr"><i class="i i-download"></i> Print / PDF</button></div>
      <p class="mut" style="font-size:12px;margin:8px 0 0">Prints on A4 with the letterhead. Leave the space above "For JASPER SOLAR SOLUTIONS" for the seal and signature.</p></div>
    <div class="gdp"><div class="lhwrap" id="mwrap"><div class="lhfit" id="mdoc"></div></div></div></div>`;
  const ref = () => $('#mref', box).value.trim(), page = () => mnrePage(D, ref(), $('#mdate', box).value, pn, iv);
  const fit = () => { const wr = $('#mwrap', box), pg = $('#mdoc', box); if (!wr || !pg) return; const s = Math.min(1, (wr.parentElement.clientWidth - 2) / 794); pg.style.transform = `scale(${s})`; wr.style.width = 794 * s + 'px'; wr.style.height = 1123 * s + 'px'; };
  const upd = () => { $('#mdoc', box).innerHTML = page(); fit(); };
  let noAuto = !g.doc;
  const hint = () => { $('#mrefh', box).textContent = g.doc ? 'Change it only to correct a mistake. A number can be on one certificate only.' : noAuto ? 'Next number in the series. Type your own to change it.' : 'Your own number. It must not be on any other certificate.'; };
  box.addEventListener('input', e => { if (e.target.dataset.m) D[e.target.dataset.m] = e.target.value; if (e.target.id === 'mref' && !g.doc) { noAuto = false; hint(); } upd(); });
  $('#mdate', box).addEventListener('change', async () => { if (!g.doc && noAuto) { try { $('#mref', box).value = (await api('gen', 'next', undefined, `&kind=warranty&customer_id=${id}&date=${$('#mdate', box).value}`)).number; } catch (e) { } } upd(); });
  if ($('#mrefauto', box)) $('#mrefauto', box).onclick = async () => { if (g.doc && !confirm('Give this certificate the next number in the series?')) return; noAuto = !g.doc;
    try { $('#mref', box).value = (await api('gen', 'next', undefined, `&kind=warranty&customer_id=${id}&date=${$('#mdate', box).value}`)).number; } catch (e) { } hint(); upd(); };
  $('#mgoplant', box).onclick = () => { const t = document.querySelector('[data-pt="plant"]'); if (t) { t.click(); scrollTo({ top: 0, behavior: 'smooth' }); } else { PFT = 'plant'; PFT_ID = id; location.hash = '#/customers/' + id; } };
  $('#mpr', box).onclick = () => printLetter(`Warranty certificate — ${c.name}`, page());
  if ($('#msv', box)) $('#msv', box).onclick = async e => { const b = e.currentTarget; b.disabled = true;
    try { const r = await api('gen', 'save', { kind: 'warranty', customer_id: id, issued_on: $('#mdate', box).value || today(), number: !g.doc && noAuto ? '' : ref(), data: D }); toast(`Warranty card ${r.number} saved`); renderMnre(box, c, id); } catch (x) { b.disabled = false; } };
  if (!window._mnreFit) { window._mnreFit = true; addEventListener('resize', () => { const wr = document.getElementById('mwrap'); if (wr) { const pg = document.getElementById('mdoc'), s = Math.min(1, (wr.parentElement.clientWidth - 2) / 794); pg.style.transform = `scale(${s})`; wr.style.width = 794 * s + 'px'; wr.style.height = 1123 * s + 'px'; } }); }
  hint(); upd();
}
