/* Read & fill: recognise a KSEB / MNRE / bank / DCR paper (PDF with text) and pull out the details the CRM keeps.
   KREAD (pure: no DOM, no network; tested in tests/kread.test.js) + docRead() — the review window on a customer's Documents tab.
   Bills downloaded from the KSEB website and papers from the National Portal carry real text; scans and photos do not (no reading those). */
var KREAD = (function () {
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function norm(s) { return String(s == null ? '' : s).replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /* '03-Sep-2026' / '03-09-2026' / '03.09.2026' / '18 June 2026' / '2026-09-03' -> '2026-09-03' ('' if not a real date) */
  function iso(d) {
    d = norm(d); var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d), y, mo, da;
    if (m) { y = +m[1]; mo = +m[2]; da = +m[3]; }
    else {
      m = /^(\d{1,2})[-./ ]([A-Za-z]{3,9}|\d{1,2})[-./ ,]+(\d{2,4})$/.exec(d); if (!m) return '';
      da = +m[1]; mo = /^\d+$/.test(m[2]) ? +m[2] : MON[m[2].slice(0, 3).toLowerCase()]; y = +m[3] + (m[3].length === 2 ? 2000 : 0);
    }
    var t = new Date(Date.UTC(y, mo - 1, da));
    return mo && t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === da ? y + '-' + pad(mo) + '-' + pad(da) : '';
  }
  function grab(re, t) { var m = re.exec(t); return m ? norm(m[1]) : ''; }
  function idv(s) { return String(s || '').replace(/\s+/g, ''); }
  var APP = /(NP\s*-\s*[A-Z0-9]+\s*-\s*\d+)/;
  function num(s) { s = String(s || '').replace(/,/g, ''); return /^\d+(\.\d+)?$/.test(s) ? String(+s) : ''; }

  /* every detail a paper can fill: [key, label, where it is saved] — kseb / contact / reg / bank = profile pages, plant = plant details */
  var FIELDS = [
    ['name', 'Consumer name', 'kseb'], ['consumer_no', 'Consumer no.', 'kseb'], ['kseb_section', 'KSEB section', 'kseb'], ['tariff', 'Tariff', 'kseb'], ['phase', 'Phase', 'kseb'],
    ['sanctioned_load', 'Connected load (kW)', 'kseb'], ['meter_no', 'KSEB meter no.', 'kseb'], ['pole_no', 'Pole no.', 'kseb'], ['transformer', 'Transformer', 'kseb'],
    ['address', 'Address', 'kseb'], ['district', 'District', 'kseb'], ['pincode', 'PIN code', 'kseb'],
    ['phone', 'Phone', 'contact'], ['email', 'Email', 'contact'],
    ['application_no', 'Application no.', 'reg'], ['application_date', 'Application date', 'reg'], ['applied_kw', 'Applied capacity (kW)', 'reg'], ['etoken_id', 'E-token ID', 'reg'],
    ['approved_kw', 'Approved capacity (kW)', 'reg'], ['approved_on', 'Feasibility approved on', 'reg'], ['subsidy_amount', 'Eligible subsidy', 'reg'],
    ['jansamarth_id', 'Jan Samarth ID', 'bank'], ['loan_bank', 'Loan bank', 'bank'], ['loan_amount', 'Loan amount', 'bank'], ['loan_sanctioned_on', 'Loan sanctioned on', 'bank'],
    ['capacity', 'Solar capacity (kWp)', 'plant'], ['panel_make', 'Panel make', 'plant'], ['panel_type', 'Panel type', 'plant'], ['panel_wattage', 'Panel wattage (W)', 'plant'],
    ['panel_count', 'Number of panels', 'plant'], ['panel_model', 'Panel model no.', 'plant'], ['panel_efficiency', 'Panel efficiency (%)', 'plant'], ['cell_maker', 'Cell manufacturer', 'plant'],
    ['dcr_po_no', 'DCR invoice no.', 'plant'], ['dcr_po_date', 'DCR invoice date', 'plant']
  ];
  var TITLES = { bill: 'KSEB bill', ack: 'MNRE application acknowledgement', feas: 'KSEB feasibility approval', feas_bank: 'Site feasibility report for bank', token: 'MNRE e-token',
    loan: 'Jan Samarth loan letter', dcr: 'DCR certificate' };

  function kind(t) {
    t = norm(t);
    if (/DCR Certificate Number/.test(t)) return 'dcr';
    if (/Acknowledgement for Submission of Rooftop Solar Application/.test(t)) return 'ack';
    if (/Approval of feasibility/i.test(t)) return 'feas';
    if (/RTS Site Feasibility Report Format for Bank/.test(t)) return 'feas_bank';
    if (/E token ID|eligible for Government of India subsidy/.test(t)) return 'token';
    if (/DEMAND CUM DISCONNECTION NOTICE/.test(t) && /Consumer#/.test(t)) return 'bill';
    if (/Digital (approval|Sanction) for your application/i.test(t)) return 'loan';
    return '';
  }

  /* text: what the PDF says, lines separated by \n. Returns {kind, title, fields: {key: value}, serials: [...], warn: [...]} */
  function parse(text) {
    var raw = String(text || ''), T = norm(raw), k = kind(T), f = {}, serials = [], warn = [];
    function put(key, v) { v = norm(v); if (v && v !== '-' && f[key] === undefined) f[key] = v; }
    if (k === 'bill') {
      var L = raw.split(/\n/).map(norm), i = -1, j;
      /* two bill layouts: older "Name & Mailing Address / NAME / address…"; newer "Customer Name NAME Mob# …" then "Mailing Address / NAME / address… / Bill#" */
      var cn = grab(/Customer Name\s+(.+?)\s+Mob#/, T);
      for (j = 0; j < L.length; j++) if (/(Name & )?Mailing Address/i.test(L[j])) { i = j; break; }
      if (i >= 0) {
        var rest = L[i].replace(/^.*Mailing Address/i, '').trim(), lines = (rest ? [rest] : []).concat(L.slice(i + 1, i + 6)).filter(Boolean);
        var stop = lines.findIndex(function (x) { return /^(For redressing|Bill#|South:|Bill Area)/i.test(x); });
        if (stop >= 0) lines = lines.slice(0, stop);
        if (cn) { put('name', cn); if (lines.length && same('name', lines[0], cn)) lines = lines.slice(1); }
        else if (lines.length) { put('name', lines[0]); lines = lines.slice(1); }
        /* the bill wraps the address at a fixed width, sometimes inside a word ("THRIVENI JUN" / "CTION"): a full line ending in a letter runs on */
        var addr = lines.reduce(function (a, x, n) { var prev = lines[n - 1] || ''; return n && prev.length >= 34 && /[A-Za-z]$/.test(prev) && /^[A-Za-z]/.test(x) ? a + x : (a ? a + ' ' : '') + x; }, '');
        if (addr) put('address', addr.replace(/\s*,\s*/g, ', ').replace(/,\s*$/, ''));
      } else if (cn) put('name', cn);
      if (!f.name) warn.push('The consumer name is not in this PDF’s text — check it on the bill');
      put('consumer_no', grab(/Consumer#\s*(\d{13})/, T));
      put('kseb_section', grab(/Section\s*\[\d+\]\s*-\s*Electrical Section\s+(.+?)\s+Phone#/i, T));
      var tp = grab(/Tariff\/Phase\s+([A-Z0-9-]+\/\w+)/i, T), tp2 = /Tariff\s+(LT\s*-?\s*[0-9A-Z]+)\s+Phase\s+(\w+)/i.exec(T);
      if (!tp && tp2) tp = tp2[1].replace(/\s+/g, '') + '/' + tp2[2];
      if (tp) {
        var p2 = tp.split('/'), tm = [['LT-1', 'LT-1A Domestic'], ['LT-6', 'LT-6 Non-domestic'], ['LT-7', 'LT-7 Commercial'], ['LT-4', 'LT-4 Industrial']], tv = 'Other';
        tm.forEach(function (x) { if (p2[0].toUpperCase().indexOf(x[0]) === 0 && tv === 'Other') tv = x[1]; });
        put('tariff', tv); put('phase', /^three/i.test(p2[1]) ? 'Three phase' : 'Single phase');
      }
      var w = grab(/Connected Load\s+(\d+)\s*Watts/i, T); if (w) put('sanctioned_load', String(+w / 1000));
      put('meter_no', grab(/Meter#\s+(\S+)/, T)); put('pole_no', grab(/Pole#\s+(\S+)/, T));
      put('transformer', grab(/DTR\s+(.+?)\s+(?:Billing Period|Bill Period|Contract Demand|Tariff)/, T));
    }
    if (k === 'ack' || k === 'feas') {
      put('name', grab(/Name of Applicant\s+(.+?)\s+\d+\s+Mobile/, T));
      put('phone', grab(/Mobile No\.\s*(\d{10})/, T)); put('email', grab(/Email ID\s+(\S+@\S+?)\s+\d/, T));
      put('consumer_no', grab(/Consumer Account Number in Discom\s+(\d{6,})/, T));
      var sl = num(grab(/Sanctioned Load in Discom\s+([\d.]+)\s*kW/i, T)); if (sl) put('sanctioned_load', sl);
      put('applied_kw', num(grab(/Applied Roof Top Solar Capacity \(in kWp\)\s+([\d.]+)/, T)));
      var ap = /Application Reference Number\/ Date\s+(NP\s*-\s*[A-Z0-9]+\s*-\s*\d+)\s*\/\s*(\d{2}\s*-\s*\d{2}\s*-\s*\d{4})/.exec(T);
      if (ap) { put('application_no', idv(ap[1])); ap[2] = idv(ap[2]); if (k === 'ack') put('application_date', iso(ap[2])); }
      put('address', grab(/Address of Premises for Installation:\s*(.+?),\s*District:/, T));
      put('district', grab(/District:\s*([A-Za-z ]+?),\s*State/, T)); put('pincode', grab(/PIN Code:\s*(\d{6})/i, T));
      if (k === 'feas') { put('approved_kw', num(grab(/Capacity Approved by Discom:\s*([\d.]+)\s*kWp/, T))); put('approved_on', iso(grab(/Approved on\s*:\s*(\d{2}-\d{2}-\d{4})/, T))); }
    }
    if (k === 'feas_bank') {
      put('name', grab(/i\. Name\s*:\s*(.+?)\s+ii\. Mobile/, T)); put('phone', grab(/Mobile Number\s*:\s*(\d{10})/, T));
      put('consumer_no', grab(/CA number\s*:\s*(\d{6,})/i, T)); put('sanctioned_load', num(grab(/Sanctioned Load\s*:\s*([\d.]+)\s*kW/i, T)));
      put('address', grab(/Address of RTS Installation\s*:\s*(.+?)\s+iv\. CA number/i, T));
    }
    if (k === 'token') {
      put('etoken_id', grab(/E token ID:\s*(\d+)/, T)); put('subsidy_amount', num(grab(/subsidy of\s*\S?\s*([\d,]+)/, T)));
      put('application_no', idv(grab(/Application No:\s*(NP\s*-\s*[A-Z0-9]+\s*-\s*\d+)/, T))); put('application_date', iso(grab(/Date & time of Application:\s*(\d{4}-\d{2}-\d{2})/, T)));
      put('name', grab(/Beneficiary Details Name:\s*(.+?)\s+Application No/, T));
    }
    if (k === 'loan') {
      put('jansamarth_id', idv(grab(/for your application\s*:\s*(ANS\s*-\s*[A-Z]+\s*-\s*\d+\s*-\s*\d+)/i, T))); put('loan_amount', num(grab(/Financing for Rs\.\s*([\d,]+)/i, T)));
      put('loan_bank', grab(/required by\s+(.+?)\s+and upon/, T));
      if (/Digital Sanction/i.test(T)) put('loan_sanctioned_on', iso(grab(/Date\s*:\s*(\d{1,2} [A-Za-z]+ \d{4})/, T)));
    }
    if (k === 'dcr') {
      var head = T.indexOf('Application Number') > 0 ? T.slice(0, T.indexOf('Application Number')) : '';
      if (/To whomsoever it may concern\s*To\s+Jasper Solar/i.test(T)) warn.push('This DCR is made out to Jasper Solar (a supplier certificate), not to a customer');
      else {
        var to = /To whomsoever it may concern\s*To\s+(.+?),\s*(.+?)\s*(?:State\s*:|District\s*:)/.exec(T);
        if (to) { put('name', to[1]); put('address', to[2].replace(/,?\s*District:.*$/, '').replace(/[ ,]+$/, '')); }
        put('district', grab(/District:\s*([A-Za-z ]+?),\s*State/, head)); put('pincode', grab(/Pin Code\s*:\s*(\d{6})/i, head));
      }
      put('application_no', idv(grab(/Application Number\s*#\s*(NP\s*-\s*[A-Z0-9]+\s*-\s*\d+)/, T)));
      put('cell_maker', grab(/Solar Cell Manufactured By\s*:\s*(.+?)\s*Address/, T)); put('panel_make', grab(/Solar Module Manufactured By\s*:\s*(.+?)\s*Address/, T));
      var iv = /Invoice \/ E\s*-\s*Way Ref Date KW \(Kilowatt\) Quantity\s+(\S+)\s+(\d{1,2}\s*-\s*[A-Za-z]{3}\s*-\s*\d{4})\s+([\d.]+)\s+(\d+)/.exec(T);
      if (iv) { put('dcr_po_no', iv[1]); put('dcr_po_date', iso(idv(iv[2]))); put('capacity', num(iv[3])); put('panel_count', iv[4]); }
      /* the model runs up to the quantity and kW columns; the PDF reader writes "M10-PERC-BIFACIAL-550" as "M10 - PERC - BIFACIAL - 550", so spaces round hyphens go */
      var md = /\(Wp\s*:\s*(\d+),?\s*Efficiency\s*:\s*([\d.]+)(?:,\s*Cell Technology\s*:\s*([^)]+))?\)\s*(.+?)\s+\d+\s+\d+\.\d+/.exec(T);
      if (md) { put('panel_wattage', md[1]); put('panel_efficiency', md[2]); put('panel_model', md[4].replace(/\s*-\s*/g, '-')); if (md[3]) put('panel_type', md[3]); }
      put('phone', grab(/Mobile(?: No\.?| Number)?\s*:?\s*(\d{10})/, T)); /* newer DCRs carry the portal warranty certificate with the customer's mobile */
      var re = /\b([A-Z0-9]{8,20})\s*\((\d{3}) Wp\)/g, s;
      while ((s = re.exec(T))) if (serials.indexOf(s[1]) < 0) serials.push(s[1]);
      if (!f.panel_wattage && serials.length) put('panel_wattage', (/\((\d{3}) Wp\)/.exec(T) || [])[1]);
      if (!f.panel_count && serials.length) put('panel_count', String(serials.length));
      if (f.panel_count && serials.length && +f.panel_count !== serials.length) warn.push('The DCR lists ' + serials.length + ' panel serial numbers for ' + f.panel_count + ' panels');
      if (!f.capacity && f.panel_count && f.panel_wattage) put('capacity', String(Math.round(+f.panel_count * +f.panel_wattage / 10) / 100));
    }
    return { kind: k, title: TITLES[k] || '', fields: f, serials: serials, warn: warn };
  }

  /* same value? (case, spaces, number formatting and leading zeros of plain numbers do not count) */
  function same(key, a, b) {
    a = norm(a); b = norm(b); if (a === b) return true;
    if (/^\d+(\.\d+)?$/.test(a) && /^\d+(\.\d+)?$/.test(b) && key !== 'consumer_no' && key !== 'etoken_id' && key !== 'pincode') return +a === +b;
    return a.replace(/[^a-z0-9]/gi, '').toLowerCase() === b.replace(/[^a-z0-9]/gi, '').toLowerCase();
  }
  function empty(v) { v = norm(v); return v === '' || v === '0' || /^0(\.0+)?$/.test(v); }
  return { parse: parse, kind: kind, iso: iso, same: same, empty: empty, norm: norm, FIELDS: FIELDS, TITLES: TITLES };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = KREAD;

/* ---------- browser: the PDF reader (pdf.js, loaded the first time it is needed) and the review window ---------- */
var KREAD_PDFJS = 'assets/vendor/pdfjs-3.11.174/';
function kreadLib() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!kreadLib.p) kreadLib.p = new Promise(function (res, rej) {
    var s = document.createElement('script'); s.src = KREAD_PDFJS + 'pdf.min.js';
    s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = KREAD_PDFJS + 'pdf.worker.min.js'; res(window.pdfjsLib); };
    s.onerror = function () { kreadLib.p = null; rej(new Error('The PDF reader could not load')); };
    document.head.appendChild(s);
  });
  return kreadLib.p;
}
/* the text of a PDF (first 12 pages), one line per text line */
async function kreadText(url) {
  const lib = await kreadLib();
  const task = lib.getDocument({ url, isEvalSupported: false }); let out = '';
  try {
    const pdf = await task.promise;
    for (let i = 1; i <= Math.min(pdf.numPages, 12); i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();
      out += tc.items.map(it => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join('') + '\n';
    }
  } finally { task.destroy(); } /* frees the document and its worker memory */
  return out;
}

/* Documents tab → Read & fill: read one PDF, show what it says next to what is saved, fill the ticked details */
async function docRead(f, id, done) {
  const m = modal(`<div class="krw"><h2 style="margin:0 0 4px">Read &amp; fill</h2><p class="mut" style="margin:0 0 12px">${esc(f.item || 'Document')} · ${esc(f.name)}</p><div id="krb"><p class="mut">Reading the PDF…</p></div></div>`, true);
  const body = $('#krb', m), close = () => m.remove();
  const fail = msg => { body.innerHTML = `<p>${msg}</p><div class="bar" style="margin-top:12px"><button class="btn sec" id="krx">Close</button></div>`; $('#krx', m).onclick = close; };
  let text;
  try { text = await kreadText(fileUrl(f)); } catch (e) { return fail('This file could not be read as a PDF.'); }
  if (KREAD.norm(text).length < 60) return fail('This PDF has no text in it — it is a scan or a photo, so it cannot be read. Download the PDF from the KSEB website or the National Portal (pmsuryaghar.gov.in) and upload that, or type the details.');
  const r = KREAD.parse(text);
  if (!r.kind) return fail('This is not a paper the CRM can read. It reads: KSEB bill (downloaded from the KSEB website), MNRE application acknowledgement, KSEB feasibility approval, MNRE e-token, site feasibility report for bank, Jan Samarth loan letter and the DCR certificate.');
  let c, pl, pj;
  try { c = await api('customers', 'get', undefined, '&id=' + id); pl = (await api('plant', 'get', undefined, '&customer_id=' + id)).data || {}; } catch (e) { return fail('Could not load this customer.'); }
  pj = (c.projects || [])[0] || {};
  const cur = k => { const pg = (KREAD.FIELDS.find(x => x[0] === k) || [])[2]; return pg === 'plant' || ['application_no', 'application_date', 'applied_kw', 'etoken_id', 'approved_kw', 'approved_on'].includes(k) ? (pl[k] ?? (k === 'application_no' ? pj.application_no : '')) : k === 'subsidy_amount' ? pj.subsidy_amount : c[k]; };
  const canFill = pg => pg === 'bank' ? canW('loans') : pg === 'reg' ? canW('customers') : canW('customers');
  const otherCon = r.fields.consumer_no && c.consumer_no && !KREAD.same('consumer_no', r.fields.consumer_no, c.consumer_no);
  const rows = KREAD.FIELDS.filter(x => r.fields[x[0]] !== undefined).map(([k, l, pg]) => {
    const v = r.fields[k], now = cur(k) == null ? '' : String(cur(k));
    const isSame = !KREAD.empty(now) && KREAD.same(k, v, now), money = k === 'subsidy_amount' || k === 'loan_amount';
    const allowed = canFill(pg) && !(k === 'subsidy_amount' && !(canR('finance') && canW('projects') && pj.id));
    const tick = allowed && !isSame && KREAD.empty(now) && !otherCon;
    return { k, l, pg, v, now, isSame, allowed, tick, money };
  });
  const serialsNow = (pl.panels || []).filter(x => x.serial).length;
  const showSerials = r.serials.length && canW('customers');
  const fmt = (k, v) => v === '' || v == null ? '<span class="mut">—</span>' : esc(/(_date|_on)$/.test(k) && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('-') : v);
  body.innerHTML = `<p style="margin:0 0 10px"><span class="pill b">${esc(r.title)}</span> ${r.fields.consumer_no ? `<span class="mut">Consumer no. ${esc(r.fields.consumer_no)}</span>` : ''}</p>
    ${otherCon ? `<div class="kr-warn"><b>Different customer?</b> This paper is for consumer no. ${esc(r.fields.consumer_no)}, but this customer has ${esc(c.consumer_no)}. Nothing is ticked — check you opened the right customer.</div>` : ''}
    ${r.warn.map(x => `<div class="kr-warn">${esc(x)}</div>`).join('')}
    <div class="tw" style="max-height:52vh;overflow:auto;border:1px solid var(--bd);border-radius:12px"><table class="kr-t"><thead><tr><th style="width:34px"></th><th>Detail</th><th>In the paper</th><th>Saved now</th></tr></thead><tbody>
    ${rows.map((x, i) => `<tr class="${x.isSame ? 'kr-same' : !KREAD.empty(x.now) ? 'kr-diff' : ''}"><td>${x.isSame ? '<i class="i i-check" title="Same"></i>' : x.allowed ? `<input type="checkbox" data-i="${i}" ${x.tick ? 'checked' : ''}>` : '<span class="mut" title="You cannot change this">—</span>'}</td>
      <td>${esc(x.l)}${x.k === 'name' && !x.isSame && !KREAD.empty(x.now) ? '<br><small class="mut">The KSEB bill name is printed on every paper</small>' : ''}</td><td><b>${fmt(x.k, x.v)}</b></td><td>${x.isSame ? '<span class="mut">same</span>' : KREAD.empty(x.now) ? '<span class="mut">—</span>' : fmt(x.k, x.now)}${!x.isSame && !KREAD.empty(x.now) ? ' <span class="pill y">differs</span>' : ''}</td></tr>`).join('')}
    ${showSerials ? `<tr class="${serialsNow ? 'kr-diff' : ''}"><td><input type="checkbox" id="krser" ${serialsNow || otherCon ? '' : 'checked'}></td><td>Panel serial numbers</td><td><b>${r.serials.length} serials</b><br><small class="mut">${esc(r.serials.slice(0, 3).join(', '))}${r.serials.length > 3 ? '…' : ''}</small></td><td>${serialsNow ? serialsNow + ' saved <span class="pill y">replaces them</span>' : '<span class="mut">—</span>'}</td></tr>` : ''}
    </tbody></table></div>
    <p class="mut" style="font-size:12px;margin:8px 0 0">Ticked details are saved to the profile. Empty ones are ticked for you; ones that differ are not — tick them to replace what is saved.</p>
    <div class="bar" style="margin-top:12px"><button class="btn" id="krgo"><i class="i i-check"></i> Fill ticked details</button><button class="btn sec" id="krx">Cancel</button></div>`;
  $('#krx', m).onclick = close;
  $('#krgo', m).onclick = async () => {
    const pick = rows.filter((x, i) => { const cb = $(`[data-i="${i}"]`, body); return cb && cb.checked; });
    const ser = showSerials && $('#krser', body) && $('#krser', body).checked;
    if (!pick.length && !ser) { toast('Nothing ticked', 1); return; }
    if (pick.some(x => x.k === 'name') && !confirm(`Change the customer name to “${r.fields.name}”?\n\nThe name is printed on every KSEB paper.`)) return;
    $('#krgo', m).disabled = true;
    const by = {}; pick.forEach(x => { (by[x.pg] = by[x.pg] || {})[x.k] = x.v; });
    try {
      for (const pg of ['kseb', 'contact', 'reg', 'bank']) if (by[pg]) await api('profile', 'page_save', { customer_id: id, page: pg, data: by[pg] });
      const pd = Object.assign({}, by.plant || {});
      if (ser) pd.panels = r.serials.map(s => ({ make: r.fields.panel_make || pd.panel_make || pl.panel_make || '', wattage: r.fields.panel_wattage || pl.panel_wattage || '', serial: s }));
      if (Object.keys(pd).length) await api('plant', 'save', { customer_id: id, data: pd });
      toast(`Filled ${pick.length + (ser ? 1 : 0)} detail${pick.length + (ser ? 1 : 0) === 1 ? '' : 's'} from the ${r.title}`);
      close(); done && done();
    } catch (e) { $('#krgo', m).disabled = false; }
  };
}
