// Site survey › paper form (PDF). The same sections, in the same order and with the same names as the Site survey page, so a
// surveyor can mark the details on paper at the site and type them into the CRM afterwards. Downloaded blank from the survey
// list, or from one survey with the name, place and whatever is already entered printed in.
// SVF = the pure part (what the form holds; Node-tested in tests/svform.test.js); svFormPdf draws it with pdf-lib.
const SVF = (() => {
  const F = {};
  /* the standard PDF fonts have no rupee sign, arrows or Malayalam: such characters are written out or left out */
  F.clean = v => String(v == null ? '' : v).replace(/₹/g, 'Rs.').replace(/→/g, 'to').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/×/g, 'x')
    .replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7e\xa0-\xff]/g, '').replace(/ {2,}/g, ' ').trim();
  const PHOTOS = [['Roof top', 'whole roof from 2-3 sides, shade from trees / tanks / buildings'], ['Inverter position', 'wall for the inverter and DB boxes, route to the meter'],
    ['Earth position', 'where the earth pits go, existing earthing'], ['Other', 'meter board, KSEB pole, roof access'], ['Site plan sketch', 'drawn on the last page']];
  /* d = the survey as the CRM gives it (survey/get) or nothing for a blank form; cfg = { site: LS_SITE, opts: LS_OPTS } */
  F.sections = (d, cfg) => {
    d = d || {}; cfg = cfg || {}; const O = cfg.opts || {}, site = d.site || {}, plant = d.plant || {}, plan = d.plan || {}, t = d.target || {}, s = d.survey || {};
    const f = (src, k, label, x) => Object.assign({ k, label: F.clean(label), value: F.clean(src[k]) }, x || {});
    const out = [];
    out.push({ title: '', fields: [
      { k: 'name', label: 'Name', value: F.clean(t.name) }, { k: 'phone', label: 'Phone', value: F.clean(t.phone) },
      { k: 'place', label: 'Address / place', value: F.clean(t.place), full: 1 },
      { k: 'by', label: 'Survey by', value: F.clean(s.assigned_name) }, { k: 'visit', label: 'Visit date', value: F.clean(s.visit_date ? String(s.visit_date).split('-').reverse().join('-') : '') }] });
    out.push({ title: '1 - Site photos (tick when taken)', checks: PHOTOS.map(p => ({ label: p[0], hint: p[1] })) });
    out.push({ title: '2 - Products and structure', fields: [
      f(plant, 'system_type', 'System type', { opts: O.system_type }), f(plant, 'capacity', 'Capacity (kWp)'), f(plant, 'structure_material', 'Structure material / height'),
      f(plant, 'panel_make', 'Panel (make and model)', { full: 1 }), f(plant, 'panel_wattage', 'Panel wattage (W)'), f(plant, 'panel_count', 'Number of panels'),
      f(plant, 'inverter_make', 'Inverter (make and model)', { full: 1 }), f(plant, 'inverter_capacity', 'Inverter capacity (kW)'), f(plant, 'inverter_count', 'Number of inverters'),
      f(plant, 'structure_type', 'Structure type', { opts: O.structure_type }),
      f(plant, 'plant_remarks', 'Remarks', { area: 2 }),
      { k: 'confirmed', label: 'Products and structure type confirmed with the customer', tick: 1, value: +s.confirmed ? '1' : '' }] });
    out.push({ title: '3 - Site plan for panel arrangement', fields: [
      f(plan, 'plan_panels', 'Panels in the plan'), f(plan, 'plan_rows', 'Rows (e.g. 7 + 4 + 5)'), f(plan, 'plan_orient', 'Panel direction', { opts: ['Portrait', 'Landscape', 'Mixed'] }),
      f(plan, 'plan_size', 'Panel size (mm)'), f(plan, 'plan_gap', 'Gap between panels'), f(plan, 'plan_facing', 'Panels face', { opts: O.orientation }),
      f(plan, 'plan_note', 'Plan notes', { area: 2 })] });
    let first = true; /* visit date and surveyor are at the top of the form already */
    (cfg.site || []).forEach(g => { const fs = g[1].filter(x => !(x[0] === 'visit_date' || x[0] === 'surveyed_by')).map(x => f(site, x[0], x[1], { opts: O[x[0]] })); if (!fs.length) return;
      out.push({ title: (first ? '4 - Site details: ' : '') + F.clean(g[0]), sub: !first, fields: fs }); first = false; });
    out.push({ title: '', fields: [f(site, 'site_remarks', 'Site remarks', { area: 3 })] });
    return out.filter(sec => sec.checks || (sec.fields && sec.fields.length));
  };
  F.fileName = d => ('Site survey form - ' + (d && d.target && d.target.name ? F.clean(d.target.name) : 'blank')).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 150) + '.pdf';
  return F;
})();
if (typeof module !== 'undefined') module.exports = SVF;

/* Draws the form. Thin lines only (0.3 - 0.5 pt), no filled boxes: it is printed on the office printer. */
async function svFormPdf(d) {
  const L = await kdLibs(), pdf = await L.PDFDocument.create(), R = await pdf.embedFont(L.StandardFonts.Helvetica), B = await pdf.embedFont(L.StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 38, GAP = 18, ROW = 27, CW = (W - 2 * M - GAP) / 2, rgb = L.rgb;
  const INK = rgb(.11, .11, .12), GREY = rgb(.43, .43, .45), LINE = rgb(.62, .62, .64), RED = rgb(.84, .23, .24), FAINT = rgb(.85, .85, .87);
  const co = SVF.clean((typeof S !== 'undefined' && S.company && S.company.name) || 'Jasper Solar'), who = SVF.clean(d && d.target && d.target.name);
  const secs = SVF.sections(d, { site: typeof LS_SITE !== 'undefined' ? LS_SITE : [], opts: typeof LS_OPTS !== 'undefined' ? LS_OPTS : {} });
  let pg, y, n = 0;
  const txt = (s, x, yy, size, font, color) => pg.drawText(s, { x, y: yy, size, font: font || R, color: color || INK });
  const ln = (x1, y1, x2, y2, t, c) => pg.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t || .3, color: c || LINE });
  const fit = (s, max, size, font) => { let z = size; while (z > 7 && font.widthOfTextAtSize(s, z) > max) z -= .5; while (s.length > 3 && font.widthOfTextAtSize(s, z) > max) s = s.slice(0, -2); return [s, z]; };
  const box = (x, yy, on) => { pg.drawRectangle({ x, y: yy, width: 8, height: 8, borderWidth: .5, borderColor: GREY }); if (on) { ln(x + 1.6, yy + 4, x + 3.4, yy + 1.8, .9, INK); ln(x + 3.4, yy + 1.8, x + 6.8, yy + 6.6, .9, INK); } };
  const page = () => { pg = pdf.addPage([W, H]); n++; y = H - M;
    txt(co, M, y - 10, 13, B); const tt = 'SITE SURVEY FORM', tw = B.widthOfTextAtSize(tt, 11); txt(tt, W - M - tw, y - 10, 11, B, RED);
    ln(M, y - 17, W - M, y - 17, .5, RED); y -= 30; };
  const need = h => { if (y - h < M + 16) page(); };
  const head = (t, sub) => { need(sub ? 60 : 70); y -= sub ? 1 : 4; txt(t, M, y - 9, sub ? 9 : 10.5, B, sub ? INK : RED); if (!sub) ln(M, y - 14, W - M, y - 14, .5, RED); y -= sub ? 15 : 21; };
  /* one write-on field: small grey label, the value (if the CRM has one) and a hairline to write on */
  const field = (f, x, w) => { txt(f.label, x, y - 7, 7.5, R, GREY); if (f.value) { const [s, z] = fit(f.value, w, 10, R); txt(s, x, y - 19, z); } ln(x, y - 22, x + w, y - 22); };
  /* a field with fixed choices: tick boxes across the full width (wrapping), then "Other" with a line */
  const choice = f => { const opts = f.opts.map(SVF.clean), hit = opts.find(o => o.toLowerCase() === f.value.toLowerCase());
    let rows = 1, x = M; opts.concat(['Other:']).forEach(o => { const w = 12 + R.widthOfTextAtSize(o, 9) + 14; if (x + w > W - M - (o === 'Other:' ? 60 : 0)) { rows++; x = M; } x += w; });
    need(12 + rows * 15 + 3); txt(f.label, M, y - 7, 7.5, R, GREY); y -= 11; x = M;
    opts.concat(['Other:']).forEach(o => { const w = 12 + R.widthOfTextAtSize(o, 9) + 14, last = o === 'Other:'; if (x + w > W - M - (last ? 60 : 0)) { y -= 15; x = M; }
      box(x, y - 10, last ? !!f.value && !hit : o === hit); txt(o, x + 12, y - 9, 9);
      if (last) { const lx = x + w - 10; if (f.value && !hit) { const [s, z] = fit(f.value, W - M - lx, 9.5, R); txt(s, lx, y - 9, z); } ln(lx, y - 11, W - M, y - 11); }
      x += w; });
    y -= 18; };
  const fields = list => { let col = 0; const flush = () => { if (col) { y -= ROW; col = 0; } };
    list.forEach(f => {
      if (f.opts && f.opts.length) { flush(); choice(f); return; }
      if (f.tick) { flush(); need(22); box(M, y - 12, !!f.value); txt(f.label, M + 13, y - 11, 9.5, B); y -= 24; return; }
      if (f.area) { flush(); need(14 + f.area * 18); txt(f.label, M, y - 7, 7.5, R, GREY); y -= 8;
        const words = f.value ? f.value.split(' ') : []; for (let i = 0; i < f.area; i++) { let s = ''; while (words.length && R.widthOfTextAtSize(s + ' ' + words[0], 9.5) < W - 2 * M) s = (s ? s + ' ' : '') + words.shift(); if (s) txt(s, M, y - 13, 9.5); ln(M, y - 16, W - M, y - 16); y -= 18; }
        y -= 4; return; }
      if (f.full) { flush(); need(ROW); field(f, M, W - 2 * M); y -= ROW; return; }
      if (!col) need(ROW); field(f, M + col * (CW + GAP), CW); col++; if (col === 2) flush(); });
    flush(); };
  page();
  secs.forEach(sec => {
    if (sec.title) head(sec.title, sec.sub);
    if (sec.checks) { sec.checks.forEach((c, i) => { const x = M + (i % 2) * (CW + GAP); if (i % 2 === 0) need(26); box(x, y - 12, false); txt(c.label, x + 13, y - 10.5, 9.5, B); const [s, z] = fit(c.hint, CW - 13, 7.5, R); txt(s, x + 13, y - 20, z, R, GREY); if (i % 2 === 1 || i === sec.checks.length - 1) y -= 25; }); }
    else fields(sec.fields);
  });
  /* signatures, kept together */
  need(46); y -= 24; ln(M, y, M + 170, y); ln(W - M - 170, y, W - M, y); txt('Surveyor - name and signature', M, y - 10, 7.5, R, GREY); txt('Customer - signature', W - M - 170, y - 10, 7.5, R, GREY); y -= 20;
  /* the sketch page: a light 1 cm grid to draw the roof and the panels on */
  page(); txt('Site plan sketch', M, y - 9, 10.5, B, RED); ln(M, y - 14, W - M, y - 14, .5, RED); y -= 22;
  txt('Roof outline with measurements, panels numbered, walkways, tanks and other obstacles. Mark North with an arrow.', M, y - 7, 8, R, GREY); y -= 16;
  const top = y, bot = M + 40, step = 28.3465, cols = Math.floor((W - 2 * M) / step), rows = Math.floor((top - bot) / step), gw = cols * step, gh = rows * step, gx = M + (W - 2 * M - gw) / 2, gy = top - gh;
  for (let i = 0; i <= cols; i++) ln(gx + i * step, gy, gx + i * step, top, i % 5 ? .2 : .35, i % 5 ? FAINT : LINE);
  for (let j = 0; j <= rows; j++) ln(gx, gy + j * step, gx + gw, gy + j * step, j % 5 ? .2 : .35, j % 5 ? FAINT : LINE);
  txt('1 square = ............ m', gx, gy - 14, 8, R, GREY); const nt = 'North:  ......................', nw = R.widthOfTextAtSize(nt, 8); txt(nt, gx + gw - nw, gy - 14, 8, R, GREY);
  /* footers */
  pdf.getPages().forEach((p, i, all) => { pg = p; const a = 'Enter these details in Solarize CRM > Site survey' + (who ? '  -  ' + who : ''), b = 'Page ' + (i + 1) + ' of ' + all.length; const [s, z] = fit(a, W - 2 * M - 70, 7.5, R);
    txt(s, M, M - 14, z, R, GREY); txt(b, W - M - R.widthOfTextAtSize(b, 7.5), M - 14, 7.5, R, GREY); });
  pdf.setTitle('Site survey form' + (who ? ' - ' + who : '')); pdf.setCreator('Solarize CRM');
  return pdf.save();
}
/* button handler: d = the open survey (survey/get answer) or nothing for the blank form */
async function svFormDownload(d, btn) {
  if (btn) btn.disabled = true;
  try { const bytes = await svFormPdf(d || null), url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), a = document.createElement('a');
    a.href = url; a.download = SVF.fileName(d); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast(d ? 'Paper form downloaded - fill it at the site, then type it in here' : 'Blank survey form downloaded'); }
  catch (e) { sayBad('The form could not be made: ' + (e && e.message ? e.message : 'try again')); }
  if (btn) btn.disabled = false;
}
