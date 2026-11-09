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
const coBlock = co => `<div class="dhco"><img src="${location.origin}/assets/logo.png" alt=""><div><b>${esc(co.name || 'Jasper Solar Solutions')}</b><div>${esc(co.address || '')}</div><div>${[co.phone ? 'Ph: ' + esc(co.phone) : '', co.email ? esc(co.email) : '', co.gstin ? 'GSTIN: ' + esc(co.gstin) : ''].filter(Boolean).join(' · ')}</div></div></div>`;
function printDoc(title, inner) {
  const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print or save the PDF', true);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOC_CSS}@page{size:A4;margin:12mm}body{margin:0;background:#fff}.doc{box-shadow:none;margin:0 auto;border:0}</style></head><body>${inner}</body></html>`);
  w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 350);
}
const DOC_CSS = `.doc{font:12px/1.45 -apple-system,"Segoe UI",Arial,sans-serif;color:#1d1d1f;background:#fff;padding:26px 28px;max-width:794px}
.doc h1{font-size:18px;letter-spacing:.06em;text-align:center;margin:14px 0 12px;font-weight:700}
.dhco{display:flex;gap:12px;align-items:center;border-bottom:2px solid #1d1d1f;padding-bottom:10px}.dhco img{width:54px;height:54px;object-fit:contain}.dhco b{font-size:17px}.dhco div div{color:#3a3a3c;font-size:11.5px}
.dmeta{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;margin:8px 0 12px}.dmeta div{display:flex;gap:6px}.dmeta span{color:#6e6e73;min-width:110px}
.dbox{border:1px solid #d1d1d6;border-radius:6px;padding:8px 10px;margin-bottom:10px}.dbox h4{margin:0 0 4px;font-size:11px;color:#6e6e73;font-weight:600}
.dt{width:100%;border-collapse:collapse;margin:6px 0 10px}.dt th,.dt td{border:1px solid #d1d1d6;padding:5px 6px;text-align:left;vertical-align:top}.dt th{background:#f5f5f7;font-size:10.5px;font-weight:600}.dt .r,.dt .h{text-align:right;white-space:nowrap}.dt .h{text-align:left}
.dtot{margin-left:auto;width:320px}.dtot td{border:0;border-bottom:1px solid #e5e5ea}.dtot tr:last-child td{font-weight:700;font-size:14px;border-bottom:2px solid #1d1d1f}
.dsig{display:flex;justify-content:space-between;align-items:flex-end;margin-top:26px}.dsig div{text-align:center;min-width:200px;border-top:1px solid #1d1d1f;padding-top:4px;font-size:11px}
.dsmall{font-size:10.5px;color:#3a3a3c;white-space:pre-wrap}.dser{columns:3;column-gap:16px;font-size:10.5px;font-family:ui-monospace,Menlo,Consolas,monospace}`;

// ---------------- Warranty card ----------------
const W_DEF = { panel_product: 12, panel_perf: 25, inverter: 5, workmanship: 5, structure: 10 };
async function renderWarranty(box, c, id) {
  box.innerHTML = '<p class="mut">Loading…</p>';
  const g = await api('gen', 'get', undefined, `&kind=warranty&customer_id=${id}`), w = canW('customers'), P = g.plant || {}, co = g.company;
  const D = Object.assign({ ...W_DEF, commissioned_on: P.commissioned_on || '', terms: `1. Solar panel product and performance warranties are given by the panel manufacturer under their terms.\n2. Inverter warranty is given by the inverter manufacturer under their terms.\n3. Installation (workmanship) warranty covers defects in the installation done by ${co.name || 'us'}.\n4. Not covered: damage from natural calamities, lightning, fire, theft, misuse, or changes made by others.\n5. For service, call ${co.phone || 'our office'}${co.email ? ' or email ' + co.email : ''}.` }, (g.doc || {}).data || {});
  const issued = (g.doc || {}).issued_on || today();
  const F = [['issued_on', 'Issue date', 'date'], ['commissioned_on', 'Commissioning date', 'date'], ['panel_product', 'Panel product warranty (years)', 'n'], ['panel_perf', 'Panel performance warranty (years)', 'n'], ['inverter', 'Inverter warranty (years)', 'n'], ['workmanship', 'Installation warranty (years)', 'n'], ['structure', 'Structure warranty (years)', 'n']];
  box.innerHTML = `<div class="gdl"><div class="card gdf"><div class="pfch"><i class="i i-shield"></i><h3>Warranty card</h3><span class="sp"></span><span class="pill ${g.doc ? 'g' : ''}">${g.doc ? esc(g.doc.number) : 'Not issued yet'}</span></div>
      <div class="two">${F.map(([k, l, t]) => `<div><label>${l}</label><input data-w="${k}" ${t === 'date' ? 'type="date"' : 'inputmode="numeric"'} value="${esc(k === 'issued_on' ? issued : D[k] ?? '')}" ${w ? '' : 'disabled'}></div>`).join('')}</div>
      <label>Terms</label><textarea data-w="terms" rows="6" ${w ? '' : 'disabled'}>${esc(D.terms)}</textarea>
      ${!(P.panels || []).some(p => p.serial) ? '<p class="mut" style="font-size:12.5px">Tip: add the panel and inverter serial numbers in <b>Plant details</b> — they print on the card.</p>' : ''}
      <div class="bar" style="margin-top:12px">${w ? `<button class="btn" id="wsv">${g.doc ? 'Save changes' : 'Issue warranty card'}</button>` : ''}<button class="btn sec" id="wpr"><i class="i i-download"></i> Print / PDF</button></div>
      ${g.doc ? `<p class="mut" style="font-size:12px;margin:8px 0 0">Saved ${new Date(g.doc.updated.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${g.doc.updated_by ? ' by ' + esc(g.doc.updated_by) : ''}</p>` : ''}</div>
    <div class="gdp"><div class="doc" id="wdoc"></div></div></div>`;
  const val = () => { const o = {}; $$('[data-w]', box).forEach(e => o[e.dataset.w] = e.value); return o; };
  const html = () => { const v = val(), pn = (P.panels || []).filter(p => p.serial), iv = (P.inverters || []).filter(p => p.serial), y = k => (+v[k] || 0) + ' year' + (+v[k] === 1 ? '' : 's');
    const till = (k) => { if (!v.commissioned_on || !+v[k]) return ''; const d = new Date(v.commissioned_on + 'T00:00:00'); d.setFullYear(d.getFullYear() + +v[k]); return ' (till ' + d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ')'; };
    return `${coBlock(co)}<h1>WARRANTY CARD</h1>
      <div class="dmeta"><div><span>Card no.</span><b>${esc(g.doc ? g.doc.number : '(issued on save)')}</b></div><div><span>Issue date</span>${fdt(v.issued_on)}</div>
       <div><span>Customer</span><b>${esc(c.name)}</b></div><div><span>Phone</span>${esc(c.phone || '—')}</div>
       <div><span>Consumer no.</span>${esc(c.consumer_no || '—')}</div><div><span>Commissioned on</span>${fdt(v.commissioned_on)}</div>
       <div style="grid-column:1/-1"><span>Installation address</span>${esc([c.address, c.district, c.pincode].filter(Boolean).join(', ') || '—')}</div></div>
      <div class="dbox"><h4>System</h4>${esc([P.capacity ? P.capacity + ' kWp' : (g.project && g.project.kw ? g.project.kw + ' kWp' : ''), P.system_type || 'On-grid'].filter(Boolean).join(' · '))}<br>
       Panels: ${esc([P.panel_count ? P.panel_count + ' ×' : '', P.panel_make, P.panel_type, P.panel_wattage ? P.panel_wattage + ' W' : ''].filter(Boolean).join(' ') || '—')}<br>
       Inverter: ${esc([P.inverter_count ? P.inverter_count + ' ×' : '', P.inverter_make, P.inverter_type, P.inverter_capacity ? P.inverter_capacity + ' kW' : ''].filter(Boolean).join(' ') || '—')}</div>
      <table class="dt"><thead><tr><th>Warranty</th><th>Period</th><th>Given by</th></tr></thead><tbody>
       <tr><td>Solar panels — product</td><td>${y('panel_product')}${till('panel_product')}</td><td>${esc(P.panel_make || 'Panel manufacturer')}</td></tr>
       <tr><td>Solar panels — performance</td><td>${y('panel_perf')}${till('panel_perf')}</td><td>${esc(P.panel_make || 'Panel manufacturer')}</td></tr>
       <tr><td>Inverter</td><td>${y('inverter')}${till('inverter')}</td><td>${esc(P.inverter_make || 'Inverter manufacturer')}</td></tr>
       <tr><td>Mounting structure</td><td>${y('structure')}${till('structure')}</td><td>${esc(co.name || '')}</td></tr>
       <tr><td>Installation (workmanship)</td><td>${y('workmanship')}${till('workmanship')}</td><td>${esc(co.name || '')}</td></tr></tbody></table>
      ${pn.length ? `<div class="dbox"><h4>Panel serial numbers (${pn.length})</h4><div class="dser">${pn.map((p, i) => `${i + 1}. ${esc(p.serial)}`).join('<br>')}</div></div>` : ''}
      ${iv.length ? `<div class="dbox"><h4>Inverter serial number${iv.length > 1 ? 's' : ''}</h4><div class="dser">${iv.map(p => esc(p.serial)).join('<br>')}</div></div>` : ''}
      <div class="dbox"><h4>Terms</h4><div class="dsmall">${esc(v.terms)}</div></div>
      <div class="dsig"><div>Customer</div><div>For ${esc(co.name || '')}<br>Authorised signatory</div></div>`; };
  const upd = () => $('#wdoc', box).innerHTML = html(); upd();
  box.addEventListener('input', e => { if (e.target.matches('[data-w]')) upd(); });
  $('#wpr', box).onclick = () => printDoc(`Warranty card — ${c.name}`, `<div class="doc">${html()}</div>`);
  if ($('#wsv', box)) $('#wsv', box).onclick = async () => { const v = val(), b = $('#wsv', box); b.disabled = true; const issued_on = v.issued_on; delete v.issued_on;
    try { const r = await api('gen', 'save', { kind: 'warranty', customer_id: id, issued_on, data: v }); toast(`Warranty card ${r.number} saved`); renderWarranty(box, c, id); } catch (e) { b.disabled = false; } };
}

// ---------------- Tax bill (GST invoice) ----------------
const HSN = [[/install|commission|labour|service|kseb|net.?meter|formalit/i, '995461', 18], [/panel|module|pv|mono|perc|topcon/i, '85414300', 5], [/inverter|micro|optimi/i, '85044090', 5], [/structure|mount|gi |frame|rail/i, '73089090', 18], [/cable|wire|mc4|earth|la |lightning|db|acdb|dcdb|meter/i, '85444999', 18]]; 
const guessHsn = d => (HSN.find(([re]) => re.test(d || '')) || [null, '', 18]);
async function renderTax(box, c, id) {
  box.innerHTML = '<p class="mut">Loading…</p>';
  const g = await api('gen', 'get', undefined, `&kind=tax&customer_id=${id}`), w = canW('customers'), co = g.company, P = g.plant || {};
  const cs = String(co.gstin || '32').slice(0, 2);
  let D = (g.doc || {}).data;
  if (!D) { const items = g.quote && g.quote.items.length ? g.quote.items.map(i => { const h = guessHsn(i.desc); return { desc: i.desc, hsn: h[1], qty: i.qty, rate: i.rate, gst: h[2] }; })
      : [{ desc: `Solar PV power plant ${P.capacity || (g.project || {}).kw || ''} kWp — supply, installation & commissioning`.replace(/\s+kWp/, ' kWp'), hsn: '85414300', qty: 1, rate: (g.project || {}).cost || 0, gst: 5 }];
    D = { bill_name: c.name, bill_address: [c.address, c.district, c.pincode].filter(Boolean).join(', '), cust_gstin: c.gst_no || '', interstate: c.gst_no && String(c.gst_no).slice(0, 2) !== cs ? 1 : 0, items, notes: 'Goods once sold will not be taken back. Subject to Thiruvananthapuram jurisdiction.' }; }
  const issued = (g.doc || {}).issued_on || today();
  box.innerHTML = `<div class="gdl"><div class="card gdf"><div class="pfch"><i class="i i-receipt"></i><h3>Tax bill</h3><span class="sp"></span><span class="pill ${g.doc ? 'g' : ''}">${g.doc ? esc(g.doc.number) : 'Not issued yet'}</span></div>
      ${g.quote && !g.doc ? `<p class="mut" style="font-size:12.5px;margin:0 0 6px">Items copied from quotation ${esc(g.quote.number)} — check HSN codes and GST rates before issuing.</p>` : ''}
      <div class="two"><div><label>Invoice date</label><input type="date" id="tdate" value="${issued}" ${w ? '' : 'disabled'}></div>
       <div><label>Supply</label><select id="tinter" ${w ? '' : 'disabled'}><option value="0" ${+D.interstate ? '' : 'selected'}>Within Kerala — CGST + SGST</option><option value="1" ${+D.interstate ? 'selected' : ''}>Outside Kerala — IGST</option></select></div>
       <div><label>Bill to (name)</label><input data-t="bill_name" value="${esc(D.bill_name || '')}" ${w ? '' : 'disabled'}></div><div><label>Customer GSTIN (if any)</label><input data-t="cust_gstin" value="${esc(D.cust_gstin || '')}" maxlength="15" ${w ? '' : 'disabled'}></div>
       <div class="full"><label>Billing address</label><input data-t="bill_address" value="${esc(D.bill_address || '')}" ${w ? '' : 'disabled'}></div></div>
      <label style="margin-top:12px">Items</label><div id="titems"></div>${w ? '<button class="btn sec sm" id="tadd" type="button"><i class="i i-plus"></i> Add line</button>' : ''}
      <label>Notes</label><textarea data-t="notes" rows="2" ${w ? '' : 'disabled'}>${esc(D.notes || '')}</textarea>
      <div class="bar" style="margin-top:12px">${w ? `<button class="btn" id="tsv">${g.doc ? 'Save changes' : 'Issue tax bill'}</button>` : ''}<button class="btn sec" id="tpr"><i class="i i-download"></i> Print / PDF</button></div>
      <p class="mut" style="font-size:12px;margin:8px 0 0">HSN codes and GST rates are suggestions — confirm them with your accountant. The invoice number is issued once and never reused.</p></div>
    <div class="gdp"><div class="doc" id="tdoc"></div></div></div>
    <datalist id="hsnl">${['85414300 — Solar PV modules', '85044090 — Inverters', '73089090 — Mounting structure', '85444999 — Cables', '853690 — Connectors / DB', '995461 — Installation services', '998732 — Repair & maintenance'].map(x => `<option value="${x.split(' ')[0]}">${x}</option>`).join('')}</datalist>`;
  let I = (D.items || []).map(x => ({ ...x }));
  const drawItems = () => { $('#titems', box).innerHTML = I.map((x, i) => `<div class="tirow"><input data-i="${i}" data-f="desc" value="${esc(x.desc)}" placeholder="Description" ${w ? '' : 'disabled'}><input data-i="${i}" data-f="hsn" value="${esc(x.hsn || '')}" placeholder="HSN/SAC" list="hsnl" ${w ? '' : 'disabled'}><input data-i="${i}" data-f="qty" value="${x.qty}" inputmode="decimal" placeholder="Qty" ${w ? '' : 'disabled'}><input data-i="${i}" data-f="rate" value="${x.rate}" inputmode="decimal" placeholder="Rate" ${w ? '' : 'disabled'}><select data-i="${i}" data-f="gst" ${w ? '' : 'disabled'}>${[0, 5, 12, 18, 28].map(r => `<option ${+x.gst === r ? 'selected' : ''}>${r}</option>`).join('')}</select>${w ? `<button class="ib" data-del="${i}" title="Remove line" type="button"><i class="i i-x"></i></button>` : ''}</div>`).join('');
    $$('[data-del]', box).forEach(b => b.onclick = () => { I.splice(+b.dataset.del, 1); drawItems(); upd(); }); };
  const calc = () => { const inter = $('#tinter', box).value === '1'; let tx = 0, tt = 0; const rows = I.filter(x => x.desc).map(x => { const tv = (+x.qty || 0) * (+x.rate || 0), t = tv * (+x.gst || 0) / 100; tx += tv; tt += t; return { ...x, tv, t }; });
    const sum = tx + tt, grand = Math.round(sum); return { inter, rows, tx, tt, ro: grand - sum, grand }; };
  const val = () => { const o = { items: I, interstate: +$('#tinter', box).value }; $$('[data-t]', box).forEach(e => o[e.dataset.t] = e.value); return o; };
  const html = () => { const v = val(), k = calc();
    return `${coBlock(co)}<h1>TAX INVOICE</h1>
      <div class="dmeta"><div><span>Invoice no.</span><b>${esc(g.doc ? g.doc.number : '(issued on save)')}</b></div><div><span>Invoice date</span>${fdt($('#tdate', box).value)}</div>
       <div><span>Place of supply</span>${k.inter ? 'Outside Kerala (IGST)' : 'Kerala (32)'}</div><div><span>Consumer no.</span>${esc(c.consumer_no || '—')}</div></div>
      <div class="dbox"><h4>Bill to</h4><b>${esc(v.bill_name)}</b><br>${esc(v.bill_address || '')}${v.cust_gstin ? '<br>GSTIN: ' + esc(v.cust_gstin) : ''}${c.phone ? '<br>Ph: ' + esc(c.phone) : ''}</div>
      <table class="dt"><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Taxable value</th><th class="r">GST</th>${k.inter ? '<th class="r">IGST</th>' : '<th class="r">CGST</th><th class="r">SGST</th>'}<th class="r">Amount</th></tr></thead><tbody>
       ${k.rows.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.desc)}</td><td class="h">${esc(x.hsn || '')}</td><td class="r">${+x.qty}</td><td class="r">${inr2(x.rate)}</td><td class="r">${inr2(x.tv)}</td><td class="r">${+x.gst}%</td>${k.inter ? `<td class="r">${inr2(x.t)}</td>` : `<td class="r">${inr2(x.t / 2)}</td><td class="r">${inr2(x.t / 2)}</td>`}<td class="r">${inr2(x.tv + x.t)}</td></tr>`).join('') || `<tr><td colspan="10">No items</td></tr>`}</tbody></table>
      <table class="dt dtot"><tbody><tr><td>Taxable value</td><td class="r">${inr2(k.tx)}</td></tr>${k.inter ? `<tr><td>IGST</td><td class="r">${inr2(k.tt)}</td></tr>` : `<tr><td>CGST</td><td class="r">${inr2(k.tt / 2)}</td></tr><tr><td>SGST</td><td class="r">${inr2(k.tt / 2)}</td></tr>`}
       <tr><td>Round off</td><td class="r">${inr2(k.ro)}</td></tr><tr><td>Total</td><td class="r">${inr2(k.grand)}</td></tr></tbody></table>
      <div class="dbox"><h4>Amount in words</h4>Rupees ${inWords(k.grand)} only</div>
      ${v.notes ? `<div class="dsmall">${esc(v.notes)}</div>` : ''}
      <div class="dsig"><div>Customer signature</div><div>For ${esc(co.name || '')}<br>Authorised signatory</div></div>`; };
  const upd = () => $('#tdoc', box).innerHTML = html();
  drawItems(); upd();
  box.addEventListener('input', e => { if (e.target.dataset.i !== undefined) { const x = I[+e.target.dataset.i]; x[e.target.dataset.f] = e.target.dataset.f === 'desc' || e.target.dataset.f === 'hsn' ? e.target.value : +e.target.value || 0;
      if (e.target.dataset.f === 'desc' && !x.hsn) { const h = guessHsn(x.desc); if (h[1]) { x.hsn = h[1]; x.gst = h[2]; drawItems(); } } } upd(); });
  box.addEventListener('change', e => { if (e.target.dataset.f === 'gst') { I[+e.target.dataset.i].gst = +e.target.value; } upd(); });
  if ($('#tadd', box)) $('#tadd', box).onclick = () => { I.push({ desc: '', hsn: '', qty: 1, rate: 0, gst: 18 }); drawItems(); };
  $('#tpr', box).onclick = () => printDoc(`Tax invoice — ${c.name}`, `<div class="doc">${html()}</div>`);
  if ($('#tsv', box)) $('#tsv', box).onclick = async () => { const v = val(), k = calc(); if (!k.rows.length) return toast('Add at least one item', true);
    v.grand = k.grand; v.taxable = Math.round(k.tx * 100) / 100; v.tax = Math.round(k.tt * 100) / 100; const b = $('#tsv', box); b.disabled = true;
    try { const r = await api('gen', 'save', { kind: 'tax', customer_id: id, issued_on: $('#tdate', box).value, data: v }); toast(`Tax bill ${r.number} saved`); renderTax(box, c, id); } catch (e) { b.disabled = false; } };
}
