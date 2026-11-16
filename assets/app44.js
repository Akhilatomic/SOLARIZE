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
     The place of a line is the box around the words that were kept. Top to bottom, then left to right. */
  lines: (blocks, w, h, minConf) => { const out = [], A = OCR_TEXT.alnum; if (!(w > 0 && h > 0)) return out; const mc = minConf || 0;
    (blocks || []).forEach(b => (b && b.paragraphs || []).forEach(p => (p && p.lines || []).forEach(l => {
      let ws = (l && l.words || []).map(x => ({ t: String(x && x.text || '').trim(), c: +(x && x.confidence) || 0, b: x && x.bbox })).filter(x => x.t && x.b && x.b.x1 > x.b.x0 && x.b.y1 > x.b.y0);
      const top = Math.max(0, ...ws.filter(x => A(x.t)).map(x => x.c)); if (top < mc + 15) return; /* a line with no word the engine is sure of is a mark, not text */
      ws = ws.filter(x => x.c >= (top >= mc + 20 ? mc - 10 : mc)); /* beside a sure word, a slightly unsure one is still text (S/O, a date) */
      while (ws.length && !A(ws[0].t)) ws.shift(); while (ws.length && !A(ws[ws.length - 1].t)) ws.pop();
      if (!ws.length) return; const text = ws.map(x => x.t).join(' '), n = A(text);
      if (n < 3 || (ws.length === 1 && n < 4 && ws[0].c < 90)) return;
      const x0 = Math.min(...ws.map(x => x.b.x0)), y0 = Math.min(...ws.map(x => x.b.y0)), x1 = Math.max(...ws.map(x => x.b.x1)), y1 = Math.max(...ws.map(x => x.b.y1));
      out.push({ text, x: x0 / w, y: y0 / h, w: (x1 - x0) / w, h: (y1 - y0) / h }); })));
    return OCR_TEXT.rows(out).reduce((a, r) => a.concat(r), []); },
  /* lines that stand side by side on the picture (two columns, a label and its value) are one row; rows run top to bottom */
  rows: lines => { const R = []; (lines || []).slice().sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2)).forEach(l => { const c = l.y + l.h / 2, r = R[R.length - 1];
      if (r && c >= r.y0 && c <= r.y1 && (r.c >= l.y && r.c <= l.y + l.h)) r.l.push(l); else R.push({ y0: l.y, y1: l.y + l.h, c, l: [l] }); });
    return R.map(r => r.l.sort((a, b) => a.x - b.x)); },
  /* the text as it stands on the picture: one row per text line, side-by-side pieces a few spaces apart */
  text: lines => OCR_TEXT.rows(lines).map(r => r.map(l => l.text).join('    ')).join('\n'),
  /* how much was read: used to tell a picture lying on its side (next to nothing read) from one the right way up */
  score: lines => (lines || []).reduce((n, l) => n + OCR_TEXT.alnum(l.text), 0),
};
if (typeof module !== 'undefined' && module.exports) module.exports = OCR_TEXT;

// ---- browser only below ----
var OCR_DIR = 'assets/vendor/tesseract-7.0.0/', OCR_SRI = 'sha384-2BQ3U3OdKOb0Uczxqr41I9UvZkzr4V9Hv8uSzMMZAlmhsFClvdZX5wi5fDCzG+tM', OCR_MAX = 2600, OCR_LIB = null;
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
/* the same picture turned by 90, 180 or 270 degrees (a card photographed sideways) */
function ocrTurn(cv, deg) { const q = deg % 180 !== 0, o = document.createElement('canvas'); o.width = q ? cv.height : cv.width; o.height = q ? cv.width : cv.height;
  const g = o.getContext('2d'); g.translate(o.width / 2, o.height / 2); g.rotate(deg * Math.PI / 180); g.drawImage(cv, -cv.width / 2, -cv.height / 2); return o; }
var OCR_FONT = 'system-ui,-apple-system,"Segoe UI","Nirmala UI","Noto Sans Malayalam",sans-serif', OCR_MIN = 60, OCR_POOR = 40;
const ocrLang = () => { try { return localStorage.getItem('ocrLang') === 'eng+mal' ? 'eng+mal' : 'eng'; } catch (e) { return 'eng'; } };
function docOcr(f) {
  const m = modal(`<div class="ocw"><div class="och"><h3>Copy text from picture</h3><span class="mut ocn" title="${esc(f.name || '')}">${esc(f.item || f.name || '')}</span><span class="sp"></span>
      <select id="ocl" title="Language of the text in the picture"><option value="eng">English</option><option value="eng+mal"${ocrLang() === 'eng+mal' ? ' selected' : ''}>English + Malayalam</option></select></div>
    <div class="ocb"><div class="oci"><div class="ociw"><img id="ocim" src="${fileUrl(f)}" alt=""><div class="ocov" id="ocov"></div></div></div>
      <div class="oct"><div class="ocs" id="ocs"><div class="ocp"><i id="ocpb"></i></div><span id="ocst">Starting…</span></div>
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
  const stop = () => { run++; const w = worker; worker = null; if (w) { try { w.terminate(); } catch (e) { } } };
  const say = (t, p, bad) => { st.textContent = t; bar.style.width = Math.round(Math.max(0, Math.min(1, p || 0)) * 100) + '%'; box.classList.toggle('bad', !!bad); box.hidden = false; };
  const read = async () => {
    stop(); const my = run; cp.disabled = ag.disabled = true; tx.readOnly = true; tx.value = ''; drawOv([]); if (shown) { im.src = fileUrl(f); URL.revokeObjectURL(shown); shown = ''; } say('Getting the text reader ready…', 0.03);
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
      const pass = async c => { const r = await w.recognize(c, {}, { text: false, blocks: true }); return OCR_TEXT.lines(r && r.data && r.data.blocks, c.width, c.height, OCR_MIN); };
      let best = cv, lines = await pass(cv); if (my !== run) return;
      if (OCR_TEXT.score(lines) < OCR_POOR) { /* next to nothing read: the picture may be lying on its side - try it turned */
        let sc = OCR_TEXT.score(lines);
        for (const d of [90, 270, 180]) { say('Trying the picture turned…', 0.5); const c = ocrTurn(cv, d), ls = await pass(c); if (my !== run) return; const s2 = OCR_TEXT.score(ls);
          if (s2 >= 20 && s2 > sc * 1.5) { sc = s2; best = c; lines = ls; if (sc >= OCR_POOR * 2) break; } } }
      stop(); run = my; /* the engine's memory is given back; this result stays */
      await show(best); if (my !== run) return; /* the picture shown is the very one that was read (turned upright), so the text sits exactly on it */
      const text = OCR_TEXT.tidy(OCR_TEXT.text(lines));
      drawOv(lines);
      tx.value = text; tx.readOnly = false; ag.disabled = false; cp.disabled = !text;
      if (text) { box.hidden = true; } else say('No text was found in this picture. Try the other language, or a sharper photo.', 1, true);
    } catch (e) { if (my !== run) return; stop(); run = my; ag.disabled = false; say((e && e.message && e.message.length < 90 ? e.message : 'The picture could not be read') + '. Check the connection and press Read again.', 1, true); }
  };
  const close = () => { stop(); if (ro) ro.disconnect(); if (shown) URL.revokeObjectURL(shown); document.removeEventListener('keydown', key); m.remove(); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  new MutationObserver((_, o) => { if (!document.body.contains(m)) { o.disconnect(); stop(); document.removeEventListener('keydown', key); } }).observe(document.body, { childList: true }); /* closed by a click outside */
  $('#occl', m).onclick = close; ag.onclick = read;
  cp.onclick = () => copyText(tx.selectionStart !== tx.selectionEnd ? tx.value.slice(tx.selectionStart, tx.selectionEnd) : tx.value, 'text');
  tx.oninput = () => { cp.disabled = !tx.value.trim(); };
  sel.onchange = () => { try { localStorage.setItem('ocrLang', sel.value); } catch (e) { } read(); };
  read();
}
