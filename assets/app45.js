/* Customer profile › KYC PDF: "Jasper Solar KYC Doc" - every detail held for the customer on a clean A4 document.
   Branding, not the letterhead: the logo and company name as a slim line on top of the first page, a running line on the
   following pages, a footer with the company contacts and the page number. Same quiet style as the KSEB cover page
   (docs/design/hairline-ledger.md): red section headings over a hairline, grey caps labels, no fills, no thick lines.
   KYC (pure, Node-tested in tests/kyc.test.js) lays the page out as drawing ops; the browser part below collects the details
   from the open profile (the same fields as Overview › All details, so a hidden value stays hidden) and writes the PDF with pdf-lib. */
var KYC = (function () {
  var K = {};
  K.TITLE = 'Jasper Solar KYC Doc';
  K.PAGE = { w: 595.28, h: 841.89, x0: 44, x1: 551.28, top: 104, next: 62, bottom: 772, foot: 800 };
  K.COL = { red: [0.843, 0.231, 0.243], ink: [0.11, 0.11, 0.118], grey: [0.42, 0.42, 0.44], hair: [0.80, 0.80, 0.82] };
  var str = function (v) { return v == null ? '' : String(v); }, r2 = function (n) { return Math.round(n * 100) / 100; };
  var one = function (v) { return str(v).replace(/\s*\r?\n\s*/g, ', ').replace(/\s+/g, ' ').trim(); };
  /* lines of at most `width` pt (words; a word wider than the line is broken by characters) */
  K.wrap = function (text, width, f, size, measure) {
    var out = [], line = '', fits = function (s) { return measure(s, f, size) <= width; };
    one(text).split(' ').forEach(function (w) {
      if (!w) return; var both = line ? line + ' ' + w : w;
      if (fits(both)) { line = both; return; }
      if (line) out.push(line); line = '';
      if (fits(w)) { line = w; return; }
      for (var ch of w) { if (line && !fits(line + ch)) { out.push(line); line = ''; } line += ch; }
    });
    if (line) out.push(line);
    return out;
  };
  /* d = { company: {name, address, phone, email, gstin}, customer: {name, facts: [[label, value]...]}, sections: [{title, rows: [[label, value]...]}],
           date, by, ref }  ->  { ops, pages }.  Ops: {t,x,y,f,s,c,p} text (y = baseline from the top), {ln:[x1,y1,x2,y2],w,c,p} line, {img:'logo',x,y,w,h,p}. */
  K.layout = function (d, measure) {
    d = d || {}; var P = K.PAGE, C = K.COL, ops = [], pg = 0, y = P.top, W = P.x1 - P.x0, gap = 22, cw = (W - gap) / 2;
    var co = d.company || {}, cu = d.customer || {}, name = one(cu.name) || 'Customer';
    var T = function (t, x, yy, f, s, c, right) { t = one(t); if (!t) return; ops.push({ t: t, x: r2(right ? x - measure(t, f, s) : x), y: r2(yy), f: f, s: s, c: c || C.ink, p: pg }); };
    var L = function (x1, y1, x2, y2, w, c) { ops.push({ ln: [r2(x1), r2(y1), r2(x2), r2(y2)], w: w, c: c || C.hair, p: pg }); };
    var newPage = function () { pg++; y = P.next;
      T(K.TITLE, P.x0, 40, 'HB', 8, C.red); T(name, P.x1, 40, 'H', 8, C.grey, true); L(P.x0, 46, P.x1, 46, 0.3); };
    var room = function (h) { if (y + h > P.bottom) newPage(); };

    /* brand line: logo, company name and contacts on the left; the document's name, reference and date on the right */
    ops.push({ img: 'logo', x: P.x0, y: 36, w: 38, h: 38, p: 0 });
    T((one(co.name) || 'Jasper Solar').toUpperCase(), P.x0 + 48, 52, 'HB', 13, C.ink);
    T([one(co.address), one(co.phone), one(co.email)].filter(Boolean).join('  ·  '), P.x0 + 48, 64, 'H', 7.5, C.grey);
    if (one(co.gstin)) T('GSTIN ' + one(co.gstin), P.x0 + 48, 73.5, 'H', 7.5, C.grey);
    T(K.TITLE, P.x1, 52, 'HB', 13, C.red, true);
    T([one(d.ref), one(d.date)].filter(Boolean).join('  ·  '), P.x1, 64, 'H', 7.5, C.grey, true);
    L(P.x0, 84, P.x1, 84, 0.5, C.red);

    /* the customer: name, then the key facts in one row */
    y = 112; K.wrap(name, W, 'HB', 17, measure).slice(0, 2).forEach(function (ln) { T(ln, P.x0, y, 'HB', 17); y += 20; });
    var facts = (cu.facts || []).filter(function (f) { return one(f[1]); }).slice(0, 4);
    if (facts.length) { var fw = W / facts.length; y += 2;
      facts.forEach(function (f, i) { var x = P.x0 + i * fw; T(one(f[0]).toUpperCase(), x, y, 'H', 6.5, C.grey); T((K.wrap(f[1], fw - 10, 'H', 10, measure)[0] || ''), x, y + 13, 'H', 10); });
      y += 26; }
    y += 6;

    /* sections: a red heading over a hairline, then label / value cells two to a row; a long value takes the whole width */
    var cell = function (r, width) { return { l: one(r[0]).toUpperCase(), v: K.wrap(r[1], width, 'H', 9.5, measure) }; };
    var hOf = function (c) { return 13 + c.v.length * 11.5 + 5; };
    var draw = function (c, x, yy) { T(c.l, x, yy + 9, 'H', 6.5, C.grey); c.v.forEach(function (ln, i) { T(ln, x, yy + 21 + i * 11.5, 'H', 9.5); }); };
    (d.sections || []).forEach(function (sec) {
      var rows = (sec.rows || []).filter(function (r) { return one(r[1]); }); if (!rows.length) return;
      var items = [], i = 0;
      while (i < rows.length) { var a = rows[i], wide = measure(one(a[1]), 'H', 9.5) > cw * 2; /* more than two lines in a half: the whole width */
        if (wide) { items.push([cell(a, W)]); i++; continue; }
        var b = rows[i + 1]; if (b && measure(one(b[1]), 'H', 9.5) <= cw * 2) { items.push([cell(a, cw), cell(b, cw)]); i += 2; } else { items.push([cell(a, cw)]); i++; } }
      var h0 = Math.max.apply(null, items[0].map(hOf));
      room(24 + h0); /* the heading stays with its first row */
      y += 10; T(one(sec.title).toUpperCase(), P.x0, y, 'HB', 8.5, C.red); y += 5; L(P.x0, y, P.x1, y, 0.5, C.red);
      items.forEach(function (it) { var h = Math.max.apply(null, it.map(hOf)); room(h);
        it.forEach(function (c, k) { draw(c, P.x0 + k * (cw + gap), y); });
        y += h; L(P.x0, y, P.x1, y, 0.3); });
      y += 6;
    });

    /* signatures */
    room(74); y += 46; var sw = (W - 60) / 2;
    L(P.x0, y, P.x0 + sw, y, 0.5, C.grey); L(P.x1 - sw, y, P.x1, y, 0.5, C.grey);
    T('Customer signature', P.x0, y + 11, 'H', 7.5, C.grey); T('For ' + (one(co.name) || 'Jasper Solar'), P.x1 - sw, y + 11, 'H', 7.5, C.grey);

    /* footer on every page */
    var pages = pg + 1, foot = [one(co.name), one(co.phone), one(co.email)].filter(Boolean).join('  ·  ');
    for (var p = 0; p < pages; p++) { pg = p; L(P.x0, P.foot, P.x1, P.foot, 0.3);
      T(foot, P.x0, P.foot + 11, 'H', 7, C.grey); T('Page ' + (p + 1) + ' of ' + pages, P.x1, P.foot + 11, 'H', 7, C.grey, true);
      T('Confidential - customer KYC record.' + (one(d.date) ? ' Prepared on ' + one(d.date) : '') + (one(d.by) ? ' by ' + one(d.by) : '') + '.', P.x0, P.foot + 21, 'H', 7, C.grey); }
    return { ops: ops, pages: pages };
  };
  /* the PDF itself: lay = layout(), logo = the PNG bytes (or null), ansi = text made safe for the standard fonts -> Promise of the bytes */
  K.build = function (PDFLib, lay, logo, meta, ansi) {
    var P = K.PAGE, col = function (c) { return PDFLib.rgb(c[0], c[1], c[2]); }; meta = meta || {}; ansi = ansi || str;
    return PDFLib.PDFDocument.create().then(function (doc) {
      return Promise.all([doc.embedFont(PDFLib.StandardFonts.Helvetica), doc.embedFont(PDFLib.StandardFonts.HelveticaBold), logo ? doc.embedPng(logo) : null]).then(function (r) {
        var fonts = { H: r[0], HB: r[1] }, img = r[2], pages = [];
        doc.setTitle(K.TITLE + (meta.name ? ' - ' + meta.name : '')); doc.setAuthor(meta.company || 'Jasper Solar'); doc.setSubject('Customer KYC record'); doc.setCreator('Solarize CRM');
        for (var i = 0; i < lay.pages; i++) pages.push(doc.addPage([P.w, P.h]));
        lay.ops.forEach(function (o) { var pg = pages[o.p || 0];
          if (o.img) { if (img) pg.drawImage(img, { x: o.x, y: P.h - o.y - o.h, width: o.w, height: o.h }); return; }
          if (o.ln) { pg.drawLine({ start: { x: o.ln[0], y: P.h - o.ln[1] }, end: { x: o.ln[2], y: P.h - o.ln[3] }, thickness: o.w, color: col(o.c) }); return; }
          var t = ansi(o.t).replace(/\n/g, ' '); if (t) pg.drawText(t, { x: o.x, y: P.h - o.y, size: o.s, font: fonts[o.f], color: col(o.c) }); });
        return doc.save({ useObjectStreams: false });
      });
    });
  };
  /* a file name Windows accepts */
  K.fileName = function (name) { var n = one(name).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim(); return K.TITLE + (n ? ' - ' + n : '') + '.pdf'; };
  return K;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = KYC;

// ---- browser only below ----
/* the details of the open profile, in page order (st = the profile's state, tl = its timeline answer) */
function kycData(st, tl) {
  const c = st.c, ctx = pfCtx(st), co = (typeof S !== 'undefined' && S && S.company) || {};
  const sections = PFP.PAGES.map(pg => ({ title: pg.tab, rows: [].concat(...pg.sections.map(sec => sec.fields)).filter(f => pfShown(f, st) && (!f.ro || f.k === 'gps'))
    .map(f => { let v = PFP.value(f, ctx); if (f.k === 'lead_type' && v) v = (LT_OPTS.find(o => o[0] === v) || [0, v])[1]; if (f.t === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) v = fdate(v); return [f.l.split(' (')[0], v]; }).filter(r => r[0] !== 'Customer name') }));
  const projs = (tl && tl.progress || []).map(p => [p.title || 'Project', [p.kw ? p.kw + ' kW' : '', p.stage, p.loan === 'Yes' ? 'Bank loan' : p.loan === 'No' ? 'No loan' : ''].filter(Boolean).join(' · ')]);
  if (projs.length) sections.push({ title: projs.length > 1 ? 'Projects' : 'Project', rows: projs });
  const docs = [...new Set((c.files || []).map(f => f.item || f.kind || '').filter(Boolean))];
  if (docs.length) sections.push({ title: 'Documents on file', rows: [['Held in the CRM', docs.join(', ')]] });
  return { company: co, ref: 'KYC/' + c.id, date: fdate(today()), by: ME.name || '',
    customer: { name: c.name, facts: [['Phone', c.phone], ['Consumer no.', c.consumer_no], ['Customer since', c.created ? fdate(String(c.created).slice(0, 10)) : ''], ['Handled by', +c.owner_id ? (+c.owner_id === +ME.id ? ME.name : c.owner_name) : '']] },
    sections };
}
var KYC_LOGO = null;
async function kycDownload(st, tl, btn) {
  if (btn) btn.disabled = true;
  try {
    const L = await kdLibs(), measure = await KD.measurer(L), d = kycData(st, tl), lay = KYC.layout(d, measure);
    KYC_LOGO = KYC_LOGO || fetch('assets/logo.png').then(r => { if (!r.ok) throw new Error('logo'); return r.arrayBuffer(); }).catch(() => { KYC_LOGO = null; return null; });
    const bytes = await KYC.build(L, lay, await KYC_LOGO, { name: st.c.name || '', company: d.company && d.company.name }, KD.ansi), a = document.createElement('a'), url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    a.href = url; a.download = KYC.fileName(st.c.name); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(KYC.TITLE + ' downloaded');
    api('profile', 'kyc_log', { customer_id: st.c.id }).catch(() => { }); /* who took the customer's details out, in the audit log */
  } catch (e) { toast('The KYC document could not be made' + (e && e.message && e.message.length < 80 ? ': ' + e.message : ''), true); }
  if (btn) btn.disabled = false;
}
