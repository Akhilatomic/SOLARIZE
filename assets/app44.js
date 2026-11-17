/* Documents: copy the text out of an uploaded picture (OCR).
   The reading is done in this browser by Tesseract (assets/vendor/tesseract-7.0.0, loaded only when the window is first opened) —
   the picture is not sent anywhere and nothing is changed on the customer. English by default; "English + Malayalam" reads both
   (slower). The files are served from the CRM itself: the engine, its worker and the language data (kept unzipped, .gz is web-denied).
   OCR_TEXT (pure) tidies what the engine gives; Node-tested in tests/ocr.test.js. */
const OCR_TEXT = {
  /* trailing spaces off, runs of blank lines down to one, no blank lines at the ends */
  tidy: t => String(t || '').replace(/\r/g, '').split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, ''),
  /* the size to read a picture at: phone photos are brought down to `max` px on the long side (faster, and reads as well) */
  fit: (w, h, max) => { const m = Math.max(w, h); if (!(m > 0)) return [0, 0]; const k = m > max ? max / m : 1; return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]; },
  langs: v => v === 'eng+mal' ? ['eng', 'mal'] : ['eng'],
  /* how many letters and digits a text has (symbols and spaces do not count) */
  alnum: t => (String(t || '').match(/[\p{L}\p{N}]/gu) || []).length,
  /* The lines the engine found, cleaned, each with its place on the picture as fractions of the picture (0..1) so the text can be
     laid over the picture where it stands. Cleaning, word by word: a word the engine is not sure of (< minConf; a little lower beside a sure word) is left out, stray
     symbols at the two ends of a line go, and a line left with almost nothing (a lone mark read off a logo, photo or QR code) is dropped.
     The place of a line is the box around the words that were kept. Top to bottom, then left to right.
     Numbers (2026-11-17): a group of digits the engine is less sure of is kept when it stands with sure digit groups - in the same
     line, or as a piece of its own beside them (the bold first group of an Aadhaar number). A mark read off an icon in front of an
     e-mail address, web address or phone number goes; so do stray quote marks at the two ends of a line. Pieces of one printed line
     the engine split (a small gap between them) are put back together. */
  lines: (blocks, w, h, minConf) => { const out = [], weak = [], A = OCR_TEXT.alnum; if (!(w > 0 && h > 0)) return out; const mc = minConf || 0;
    const DG = /^\d{3,}$/, box = ws => { const x0 = Math.min(...ws.map(x => x.b.x0)), y0 = Math.min(...ws.map(x => x.b.y0)), x1 = Math.max(...ws.map(x => x.b.x1)), y1 = Math.max(...ws.map(x => x.b.y1)); return { x: x0 / w, y: y0 / h, w: (x1 - x0) / w, h: (y1 - y0) / h }; };
    (blocks || []).forEach(b => (b && b.paragraphs || []).forEach(p => (p && p.lines || []).forEach(l => {
      let ws = (l && l.words || []).map(x => ({ t: String(x && x.text || '').trim(), c: +(x && x.confidence) || 0, b: x && x.bbox })).filter(x => x.t && x.b && x.b.x1 > x.b.x0 && x.b.y1 > x.b.y0);
      const top = Math.max(0, ...ws.filter(x => A(x.t)).map(x => x.c));
      if (top < mc + 15) { /* a line with no word the engine is sure of is a mark, not text - unless it is digits standing beside sure digits (looked at below) */
        if (top >= OCR_TEXT.WEAK && ws.length && ws.every(x => DG.test(x.t) && x.c >= OCR_TEXT.WEAK)) weak.push({ text: ws.map(x => x.t).join(' '), ...box(ws) });
        return; }
      const sureDg = ws.some(x => DG.test(x.t) && x.c >= mc);
      ws = ws.filter(x => x.c >= (top >= mc + 20 ? mc - 10 : mc) || (sureDg && DG.test(x.t) && x.c >= OCR_TEXT.WEAK)); /* beside a sure word, a slightly unsure one is still text (S/O, a date) */
      while (ws.length && !A(ws[0].t)) ws.shift(); while (ws.length && !A(ws[ws.length - 1].t)) ws.pop();
      if (ws.length > 1 && /^[A-Za-z]{1,2}$/.test(ws[0].t) && ws[0].c < 80 && ws[0].c < top - 10 && /@|^www\.|^https?:|^\d{4,}$/i.test(ws[1].t)) ws.shift(); /* an icon read as a letter or two */
      if (!ws.length) return;
      ws[0] = { ...ws[0], t: ws[0].t.replace(/^['"‘’“”`|~^*_=\\]+(?=[\p{L}\p{N}])/u, '') }; const z = ws.length - 1; ws[z] = { ...ws[z], t: ws[z].t.replace(/(?<=[\p{L}\p{N}.,)])['"‘’“”`|~^*_=\\]+$/u, '') };
      const text = ws.map(x => x.t).join(' '), n = A(text);
      if (n < 3 || (ws.length === 1 && n < 4 && ws[0].c < 90)) return;
      if (n < 5 && !/\d/.test(text) && ws.every(x => A(x.t) <= 2)) return; /* a few loose letters (read off a QR code or a pattern) */
      out.push({ text, ...box(ws) }); })));
    const digits = t => /^\d{3,}( \d{3,})*$/.test(t), mid = l => l.y + l.h / 2;
    weak.forEach(k => { if (out.some(o => digits(o.text) && mid(k) >= o.y && mid(k) <= o.y + o.h && Math.max(o.x - (k.x + k.w), k.x - (o.x + o.w)) * w <= 3 * o.h * h)) out.push(k); });
    return OCR_TEXT.rows(out).reduce((a, r) => a.concat(OCR_TEXT.join(r, w, h)), []); },
  WEAK: 30, /* the least sure a digit group may be and still be kept beside sure ones */
  /* pieces of one row that stand close together (a gap of at most 1.5 x the letter height) are one line */
  join: (row, w, h) => { const o = []; (row || []).forEach(l => { const p = o[o.length - 1];
      if (p && (l.x - (p.x + p.w)) * w <= 1.5 * Math.max(p.h, l.h) * h) { const x1 = Math.max(p.x + p.w, l.x + l.w), y0 = Math.min(p.y, l.y), y1 = Math.max(p.y + p.h, l.y + l.h); p.text += ' ' + l.text; p.w = x1 - p.x; p.y = y0; p.h = y1 - y0; }
      else o.push({ ...l }); }); return o; },
  /* lines that stand side by side on the picture (two columns, a label and its value) are one row; rows run top to bottom */
  rows: lines => { const R = []; (lines || []).slice().sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2)).forEach(l => { const c = l.y + l.h / 2, r = R[R.length - 1];
      if (r && c >= r.y0 && c <= r.y1 && (r.c >= l.y && r.c <= l.y + l.h)) r.l.push(l); else R.push({ y0: l.y, y1: l.y + l.h, c, l: [l] }); });
    return R.map(r => r.l.sort((a, b) => a.x - b.x)); },
  /* the text as it stands on the picture: one row per text line, side-by-side pieces a few spaces apart */
  text: lines => OCR_TEXT.rows(lines).map(r => r.map(l => l.text).join('    ')).join('\n'),
  /* how much was read: used to tell a picture lying on its side (next to nothing read) from one the right way up */
  score: lines => (lines || []).reduce((n, l) => n + OCR_TEXT.alnum(l.text), 0),
};
/* Aadhaar and PAN cards: what the text read from the card says (pure; Node-tested). Nothing is saved from here - the window shows
   what was found and the user decides. An Aadhaar number is only taken when its check digit is right (Verhoeff), so a misread
   digit is refused instead of saved. */
const OCR_ID = {
  D: [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]],
  P: [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]],
  /* true when the last digit of the number is its Verhoeff check digit */
  verhoeff: s => { s = String(s || ''); if (!/^\d+$/.test(s)) return false; let c = 0; s.split('').reverse().forEach((d, i) => { c = OCR_ID.D[c][OCR_ID.P[i % 8][+d]]; }); return c === 0; },
  /* the check digit for 11 digits (used by the tests to make up numbers) */
  checkDigit: s => { for (let d = 0; d < 10; d++) if (OCR_ID.verhoeff(String(s) + d)) return String(d); return ''; },
  group: n => String(n || '').replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 '),
  /* the 12-digit Aadhaar number in a text: printed in groups of four, first digit 2-9, check digit right. The 16-digit VID is not it. */
  aadhaar: t => { const runs = String(t || '').match(/\d[\d \-]{10,24}\d|\d{12}/g) || [];
    for (const r of runs) { const d = r.replace(/\D/g, ''); if (d.length === 12 && /^[2-9]/.test(d) && OCR_ID.verhoeff(d)) return d; }
    return ''; },
  /* a PAN: 5 letters, 4 digits, 1 letter; the 4th letter says who holds it. Letters and digits the engine mixes up (O/0, I/1, S/5, B/8, Z/2) are put right by their place. */
  pan: t => { const L = { 0: 'O', 1: 'I', 5: 'S', 8: 'B', 2: 'Z' }, N = { O: '0', D: '0', Q: '0', I: '1', L: '1', S: '5', B: '8', Z: '2' };
    for (const m of String(t || '').toUpperCase().match(/[A-Z0-9]{10}/g) || []) { if (!/\d/.test(m)) continue;
      const v = m.split('').map((ch, i) => i < 5 || i === 9 ? (L[ch] || ch) : (N[ch] || ch)).join('');
      if (/^[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]$/.test(v)) return v; }
    return ''; },
  /* one printed line of the card; a piece standing far to its right (a photo, a QR code) is not part of it */
  rows: t => String(t || '').split('\n').map(l => l.split(/ {4,}/)[0].trim()).filter(Boolean),
  parse: t => { const text = String(t || ''), R = OCR_ID.rows(text), o = { kind: '', aadhaar_no: '', pan_no: '', name: '', dob: '', gender: '', address: '', pincode: '' };
    const pan = OCR_ID.pan(text), aad = OCR_ID.aadhaar(text);
    const isPan = /INCOME\s*TAX|Permanent\s+Account/i.test(text) || (pan && !aad);
    if (isPan && pan) { o.kind = 'pan'; o.pan_no = pan; } else if (aad) { o.kind = 'aadhaar'; o.aadhaar_no = OCR_ID.group(aad); } else if (pan) { o.kind = 'pan'; o.pan_no = pan; } else return o;
    const dm = text.match(/(?:DOB|D\.O\.B|Date\s+of\s+Birth|Year\s+of\s+Birth|YOB)\s*[:\-]?\s*(\d{2}[\/\-.]\d{2}[\/\-.]\d{4}|\d{4})/i) || (o.kind === 'pan' ? text.match(/(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})/) : null);
    if (dm) o.dob = dm[1].replace(/[\-.]/g, '/');
    const gm = text.match(/\b(FEMALE|MALE|TRANSGENDER)\b/i); if (gm && o.kind === 'aadhaar') o.gender = gm[1][0].toUpperCase() + gm[1].slice(1).toLowerCase();
    const nameOk = s => /^[A-Za-z][A-Za-z .']{2,60}$/.test(s) && !/GOVERNMENT|GOVT|INDIA|INCOME|TAX|DEPARTMENT|ACCOUNT|NUMBER|CARD|SIGNATURE|AUTHORITY|AADHAAR|ADDRESS|BIRTH|FATHER|MALE\b/i.test(s);
    if (o.kind === 'pan') { const i = R.findIndex(l => /^\W*(?:\S+\s*\/\s*)?Name\W*$/i.test(l));
      if (i >= 0 && R[i + 1] && nameOk(R[i + 1])) o.name = R[i + 1];
      else { const j = R.findIndex(l => /INCOME\s*TAX|GOVT\.?\s*OF\s*INDIA/i.test(l)); o.name = R.slice(j + 1).find(l => l === l.toUpperCase() && nameOk(l)) || ''; } }
    else { const i = R.findIndex(l => /DOB|Date\s+of\s+Birth|Year\s+of\s+Birth|YOB/i.test(l)); /* the name stands just above the date of birth */
      for (let k = i - 1; i > 0 && k >= Math.max(0, i - 3); k--) if (nameOk(R[k])) { o.name = R[k]; break; }
      const a = R.findIndex(l => /Address\s*:?/i.test(l));
      if (a >= 0) { const parts = [R[a].replace(/^.*?Address\s*:?\s*/i, '')];
        for (let k = a + 1; k < R.length && k < a + 9; k++) { if (/^\d{4} ?\d{4} ?\d{4}$|uidai|^\W*1947\b|help@/i.test(R[k])) break; parts.push(R[k]); if (/\b\d{6}\b/.test(R[k])) break; }
        let ad = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
        const pm = ad.match(/\b(\d{6})\b(?!.*\b\d{6}\b)/); if (pm) { o.pincode = pm[1]; ad = ad.slice(0, pm.index).replace(/[\s,\-]+$/, ''); }
        o.address = ad.replace(/^[\s,]+/, ''); } }
    o.name = o.name.replace(/\s+/g, ' ').trim();
    return o; },
  /* the same person? letters only, any order of the name parts and initials */
  sameName: (a, b) => { const k = s => String(s || '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' '); return !!k(a) && k(a) === k(b); },
};
if (typeof module !== 'undefined' && module.exports) { module.exports = OCR_TEXT; module.exports.ID = OCR_ID; }

// ---- browser only below ----
var OCR_DIR = 'assets/vendor/tesseract-7.0.0/', OCR_SRI = 'sha384-2BQ3U3OdKOb0Uczxqr41I9UvZkzr4V9Hv8uSzMMZAlmhsFClvdZX5wi5fDCzG+tM', OCR_MAX = 2600, OCR_SMALL = 1800, OCR_LIB = null;
function ocrLib() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!OCR_LIB) OCR_LIB = new Promise((res, rej) => { const s = document.createElement('script'); s.src = OCR_DIR + 'tesseract.min.js'; s.integrity = OCR_SRI; s.crossOrigin = 'anonymous';
    s.onload = () => window.Tesseract ? res(window.Tesseract) : rej(new Error('The text reader did not start'));
    s.onerror = () => { OCR_LIB = null; rej(new Error('The text reader could not be loaded')); }; document.head.appendChild(s); });
  return OCR_LIB;
}
/* the picture as the engine should see it: turned the way the camera held it (EXIF) and not larger than OCR_MAX */
async function ocrCanvas(blob) {
  let src, w, h;
  if (window.createImageBitmap) { try { src = await createImageBitmap(blob, { imageOrientation: 'from-image' }); w = src.width; h = src.height; } catch (e) { src = null; } }
  if (!src) { src = await new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(blob); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('This picture could not be opened')); }; im.src = u; }); w = src.naturalWidth; h = src.naturalHeight; }
  const [cw, ch] = OCR_TEXT.fit(w, h, OCR_MAX); if (!cw) throw new Error('This picture could not be opened');
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); g.drawImage(src, 0, 0, cw, ch);
  if (src.close) src.close();
  return cv;
}
/* What the engine reads (the picture shown stays as it is): a small picture is enlarged so the letters are tall enough, and it is
   made grey with its contrast stretched - faint print on a coloured card (Aadhaar, PAN) stands out. Same proportions, so the
   places found fit the picture shown. */
function ocrPrep(cv) {
  const m = Math.max(cv.width, cv.height), k = m < OCR_SMALL ? Math.min(3, OCR_SMALL / m) : 1, o = document.createElement('canvas');
  o.width = Math.round(cv.width * k); o.height = Math.round(cv.height * k);
  const g = o.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(cv, 0, 0, o.width, o.height);
  try { const im = g.getImageData(0, 0, o.width, o.height), d = im.data, hist = new Uint32Array(256), n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { const y = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8; d[i] = y; hist[y]++; }
    let lo = 0, hi = 255, c = 0; for (; lo < 255 && (c += hist[lo]) < n * 0.01; lo++); c = 0; for (; hi > 0 && (c += hist[hi]) < n * 0.01; hi--);
    const sp = hi - lo; for (let i = 0; i < d.length; i += 4) { const y = sp > 40 ? Math.max(0, Math.min(255, Math.round((d[i] - lo) * 255 / sp))) : d[i]; d[i] = d[i + 1] = d[i + 2] = y; }
    g.putImageData(im, 0, 0); } catch (e) { } /* could not be sharpened: read as it is */
  return o;
}
/* the same picture turned by 90, 180 or 270 degrees (a card photographed sideways) */
function ocrTurn(cv, deg) { const q = deg % 180 !== 0, o = document.createElement('canvas'); o.width = q ? cv.height : cv.width; o.height = q ? cv.width : cv.height;
  const g = o.getContext('2d'); g.translate(o.width / 2, o.height / 2); g.rotate(deg * Math.PI / 180); g.drawImage(cv, -cv.width / 2, -cv.height / 2); return o; }
var OCR_FONT = 'system-ui,-apple-system,"Segoe UI","Nirmala UI","Noto Sans Malayalam",sans-serif', OCR_MIN = 60, OCR_POOR = 40;
const ocrLang = () => { try { return localStorage.getItem('ocrLang') === 'eng+mal' ? 'eng+mal' : 'eng'; } catch (e) { return 'eng'; } };
function docOcr(f, c, saved) { /* c = the customer the document belongs to (Aadhaar / PAN details can be saved to them); saved() after a save */
  const m = modal(`<div class="ocw"><div class="och"><h3>Copy text from picture</h3><span class="mut ocn" title="${esc(f.name || '')}">${esc(f.item || f.name || '')}</span><span class="sp"></span>
      <select id="ocl" title="Language of the text in the picture"><option value="eng">English</option><option value="eng+mal"${ocrLang() === 'eng+mal' ? ' selected' : ''}>English + Malayalam</option></select></div>
    <div class="ocb"><div class="oci"><div class="ociw"><img id="ocim" src="${fileUrl(f)}" alt=""><div class="ocov" id="ocov"></div></div></div>
      <div class="oct"><div class="ocs" id="ocs"><div class="ocp"><i id="ocpb"></i></div><span id="ocst">Starting…</span></div>
        <div class="ocid" id="ocid" hidden></div>
        <textarea id="octx" spellcheck="false" placeholder="The text read from the picture shows here. You can correct it before copying." readonly></textarea></div></div>
    <div class="bar ocf"><small class="mut">Select text on the picture, or click a line to copy it. Read in this browser — the picture is not sent anywhere. Check numbers before using them.</small><span class="sp"></span>
      <button class="btn" id="occp" disabled><i class="i i-copy"></i> Copy text</button><button class="btn sec" id="octg" hidden>Hide text on picture</button><button class="btn sec" id="ocag" disabled>Read again</button><button class="btn sec" id="occl">Close</button></div></div>`, 1);
  m.classList.add('ocmod');
  const tx = $('#octx', m), st = $('#ocst', m), bar = $('#ocpb', m), box = $('#ocs', m), cp = $('#occp', m), ag = $('#ocag', m), sel = $('#ocl', m);
  const ov = $('#ocov', m), tg = $('#octg', m);
  const im = $('#ocim', m); let run = 0, worker = null, LN = [], shown = '';
  const show = cv => new Promise(res => cv.toBlob(b => { if (b) { const u = URL.createObjectURL(b); im.onload = () => { fitOv(); res(); }; im.onerror = () => res(); im.src = u; if (shown) URL.revokeObjectURL(shown); shown = u; } else res(); }, 'image/jpeg', 0.9));
  /* each line is laid over the picture where it was found, its letters sized to fill the line's box (width first, never taller than the box) */
  const mg = document.createElement('canvas').getContext('2d');
  const fitOv = () => { const H = ov.clientHeight, W = ov.clientWidth; if (!H || !W) return; mg.font = '100px ' + OCR_FONT;
    [...ov.children].forEach((el, i) => { const l = LN[i]; if (!l) return; const tw = mg.measureText(l.text).width || 1;
      el.style.fontSize = Math.max(4, Math.min(l.h * H * 1.3, 100 * l.w * W / tw)).toFixed(2) + 'px'; }); };
  const drawOv = lines => { LN = lines || []; const p = v => (v * 100).toFixed(3) + '%';
    ov.innerHTML = LN.map(l => `<div class="ocl" style="left:${p(l.x)};top:${p(l.y + l.h / 2)};width:${p(l.w)};min-height:${p(l.h)}">${esc(l.text)}</div>`).join('');
    ov.classList.toggle('on', !!LN.length); tg.hidden = !LN.length; tg.textContent = 'Hide text on picture'; ov.hidden = false; fitOv(); };
  ov.onclick = e => { const el = e.target.closest('.ocl'), s = window.getSelection && window.getSelection(); if (!el || (s && !s.isCollapsed)) return; copyText(el.textContent, 'line'); };
  tg.onclick = () => { ov.hidden = !ov.hidden; tg.textContent = ov.hidden ? 'Show text on picture' : 'Hide text on picture'; if (!ov.hidden) fitOv(); };
  const ro = window.ResizeObserver ? new ResizeObserver(fitOv) : null; if (ro) ro.observe(ov);
  /* Aadhaar / PAN card: the details found, each with a tick; "Save to customer" writes the ticked ones (profile pages 1 and 2) */
  const idb = $('#ocid', m), dig = v => String(v || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const same = (card, have) => { have = String(have || ''); return have.includes('•') ? dig(card).slice(-4) === have.slice(-4) : !!dig(have) && dig(card) === dig(have); };
  const idShow = () => { const d = OCR_ID.parse(tx.value); if (!d.kind) { idb.hidden = true; idb.innerHTML = ''; return; }
    const can = c && c.id && canW('customers'), rows = [];
    const add = (k, label, val, have, note) => rows.push({ k, label, val, done: same(val, have), note: note || (String(have || '').trim() && !same(val, have) ? 'replaces ' + have : '') });
    if (d.aadhaar_no) add('aadhaar_no', 'Aadhaar no.', d.aadhaar_no, c && c.aadhaar_no);
    if (d.pan_no) add('pan_no', 'PAN no.', d.pan_no, c && c.pan_no);
    if (d.address) add('address', 'Address', d.address, c && c.address);
    if (d.pincode) add('pincode', 'PIN code', d.pincode, c && c.pincode);
    const nm = d.name ? `<div class="ocidn ${c && OCR_ID.sameName(d.name, c.name) ? 'ok' : c ? 'warn' : ''}">Name on the card: <b>${esc(d.name)}</b>${c ? (OCR_ID.sameName(d.name, c.name) ? ' — matches the customer' : ` — the customer is <b>${esc(c.name || '')}</b>`) : ''}${d.dob ? ` · Born ${esc(d.dob)}` : ''}${d.gender ? ` · ${esc(d.gender)}` : ''}</div>` : '';
    idb.innerHTML = `<div class="ocidh"><i class="i i-user"></i><b>${d.kind === 'pan' ? 'PAN card' : 'Aadhaar card'}</b><span class="sp"></span>${can && rows.some(r => !r.done) ? '<button class="btn sm" id="ocidsv">Save to customer</button>' : ''}</div>${nm}
      ${rows.map(r => `<label class="ocidr${r.done ? ' done' : ''}">${can && !r.done ? `<input type="checkbox" data-idk="${r.k}" ${r.k === 'address' || r.k === 'pincode' ? (r.note ? '' : 'checked') : 'checked'}>` : r.done ? '<i class="i i-check"></i>' : '<i></i>'}<span>${esc(r.label)}</span><b>${esc(r.val)}</b>${r.done ? '<small>saved on the customer</small>' : r.note ? `<small>${esc(r.note)}</small>` : ''}</label>`).join('')}
      ${can ? '' : c ? '' : '<small class="mut">Open the picture from a customer’s Documents to save these.</small>'}`;
    idb.hidden = false;
    const sv = $('#ocidsv', idb); if (sv) sv.onclick = async () => { const pick = $$('[data-idk]:checked', idb).map(x => x.dataset.idk); if (!pick.length) return toast('Tick what to save', true);
      const val = k => rows.find(r => r.k === k).val, p2 = {}, p1 = {}; pick.forEach(k => { (k === 'aadhaar_no' || k === 'pan_no' ? p2 : p1)[k] = val(k); });
      sv.disabled = true;
      try { let r; if (Object.keys(p2).length) r = await api('profile', 'page_save', { customer_id: c.id, page: 'contact', data: p2 });
        if (Object.keys(p1).length) r = await api('profile', 'page_save', { customer_id: c.id, page: 'kseb', data: p1 });
        if (r && r.customer) Object.assign(c, r.customer); else pick.forEach(k => { c[k] = val(k); });
        toast('Saved to ' + (c.name || 'the customer')); idShow(); if (saved) saved(c); } catch (e) { sv.disabled = false; } }; };
  const stop = () => { run++; const w = worker; worker = null; if (w) { try { w.terminate(); } catch (e) { } } };
  const say = (t, p, bad) => { st.textContent = t; bar.style.width = Math.round(Math.max(0, Math.min(1, p || 0)) * 100) + '%'; box.classList.toggle('bad', !!bad); box.hidden = false; };
  const read = async () => {
    stop(); const my = run; cp.disabled = ag.disabled = true; tx.readOnly = true; tx.value = ''; idb.hidden = true; drawOv([]); if (shown) { im.src = fileUrl(f); URL.revokeObjectURL(shown); shown = ''; } say('Getting the text reader ready…', 0.03);
    try {
      const T = await ocrLib(); if (my !== run) return;
      const base = new URL(OCR_DIR, location.href).href, langs = OCR_TEXT.langs(sel.value);
      const blob = await (await fetch(fileUrl(f), { credentials: 'same-origin' })).blob(); if (my !== run) return;
      const cv = await ocrCanvas(blob); if (my !== run) return;
      say(langs.length > 1 ? 'Loading English and Malayalam…' : 'Loading the language…', 0.08);
      const w = await T.createWorker(langs, 1, { workerPath: base + 'worker.min.js', corePath: base.replace(/\/$/, ''), langPath: base + 'lang', gzip: false, workerBlobURL: false,
        logger: x => { if (my !== run || !x) return; if (x.status === 'recognizing text') say('Reading the picture… ' + Math.round((x.progress || 0) * 100) + '%', 0.3 + 0.7 * (x.progress || 0)); else if (/load|initializ/i.test(x.status || '')) say('Loading the text reader…', 0.08 + 0.2 * (x.progress || 0)); },
        errorHandler: () => { } });
      if (my !== run) { try { w.terminate(); } catch (e) { } return; }
      worker = w;
      await w.setParameters({ tessedit_pageseg_mode: '11' }); if (my !== run) return; /* 11 = find text wherever it is: cards and bills are scattered text, not a page of prose */
      const pass = async c => { const pc = ocrPrep(c), r = await w.recognize(pc, {}, { text: false, blocks: true }); return OCR_TEXT.lines(r && r.data && r.data.blocks, pc.width, pc.height, OCR_MIN); };
      let best = cv, lines = await pass(cv); if (my !== run) return;
      if (OCR_TEXT.score(lines) < OCR_POOR) { /* next to nothing read: the picture may be lying on its side - try it turned */
        let sc = OCR_TEXT.score(lines);
        for (const d of [90, 270, 180]) { say('Trying the picture turned…', 0.5); const c = ocrTurn(cv, d), ls = await pass(c); if (my !== run) return; const s2 = OCR_TEXT.score(ls);
          if (s2 >= 20 && s2 > sc * 1.5) { sc = s2; best = c; lines = ls; if (sc >= OCR_POOR * 2) break; } } }
      stop(); run = my; /* the engine's memory is given back; this result stays */
      await show(best); if (my !== run) return; /* the picture shown is the very one that was read (turned upright), so the text sits exactly on it */
      const text = OCR_TEXT.tidy(OCR_TEXT.text(lines));
      drawOv(lines);
      tx.value = text; tx.readOnly = false; ag.disabled = false; cp.disabled = !text; idShow();
      if (text) { box.hidden = true; } else say('No text was found in this picture. Try the other language, or a sharper photo.', 1, true);
    } catch (e) { if (my !== run) return; stop(); run = my; ag.disabled = false; say((e && e.message && e.message.length < 90 ? e.message : 'The picture could not be read') + '. Check the connection and press Read again.', 1, true); }
  };
  const close = () => { stop(); if (ro) ro.disconnect(); if (shown) URL.revokeObjectURL(shown); document.removeEventListener('keydown', key); m.remove(); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  new MutationObserver((_, o) => { if (!document.body.contains(m)) { o.disconnect(); stop(); document.removeEventListener('keydown', key); } }).observe(document.body, { childList: true }); /* closed by a click outside */
  $('#occl', m).onclick = close; ag.onclick = read;
  cp.onclick = () => copyText(tx.selectionStart !== tx.selectionEnd ? tx.value.slice(tx.selectionStart, tx.selectionEnd) : tx.value, 'text');
  let idT = 0; tx.oninput = () => { cp.disabled = !tx.value.trim(); clearTimeout(idT); idT = setTimeout(idShow, 300); }; /* a corrected number is read again */
  sel.onchange = () => { try { localStorage.setItem('ocrLang', sel.value); } catch (e) { } read(); };
  read();
}
