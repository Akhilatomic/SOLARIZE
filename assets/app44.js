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
  /* the lines the engine found, in reading order, each with its place on the picture as fractions of the picture (0..1) -
     so the text can be laid over the picture where it stands. Empty lines and ones the engine is not sure of (< minConf) are left out. */
  lines: (blocks, w, h, minConf) => { const out = []; if (!(w > 0 && h > 0)) return out;
    (blocks || []).forEach(b => (b && b.paragraphs || []).forEach(p => (p && p.lines || []).forEach(l => { const t = String(l && l.text || '').replace(/\s+/g, ' ').trim(), bb = l && l.bbox;
      if (!t || !bb || !(bb.x1 > bb.x0 && bb.y1 > bb.y0) || (+l.confidence || 0) < (minConf || 0)) return;
      out.push({ text: t, x: bb.x0 / w, y: bb.y0 / h, w: (bb.x1 - bb.x0) / w, h: (bb.y1 - bb.y0) / h }); })));
    return out; },
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
const ocrLang = () => { try { return localStorage.getItem('ocrLang') === 'eng+mal' ? 'eng+mal' : 'eng'; } catch (e) { return 'eng'; } };
function docOcr(f) {
  const m = modal(`<div class="ocw"><div class="och"><h3>Copy text from picture</h3><span class="mut ocn" title="${esc(f.name || '')}">${esc(f.item || f.name || '')}</span><span class="sp"></span>
      <select id="ocl" title="Language of the text in the picture"><option value="eng">English</option><option value="eng+mal"${ocrLang() === 'eng+mal' ? ' selected' : ''}>English + Malayalam</option></select></div>
    <div class="ocb"><div class="oci"><div class="ociw"><img src="${fileUrl(f)}" alt=""><div class="ocov" id="ocov"></div></div></div>
      <div class="oct"><div class="ocs" id="ocs"><div class="ocp"><i id="ocpb"></i></div><span id="ocst">Starting…</span></div>
        <textarea id="octx" spellcheck="false" placeholder="The text read from the picture shows here. You can correct it before copying." readonly></textarea></div></div>
    <div class="bar ocf"><small class="mut">Select text on the picture, or click a line to copy it. Read in this browser — the picture is not sent anywhere. Check numbers before using them.</small><span class="sp"></span>
      <button class="btn" id="occp" disabled><i class="i i-copy"></i> Copy text</button><button class="btn sec" id="octg" hidden>Hide text on picture</button><button class="btn sec" id="ocag" disabled>Read again</button><button class="btn sec" id="occl">Close</button></div></div>`, 1);
  m.classList.add('ocmod');
  const tx = $('#octx', m), st = $('#ocst', m), bar = $('#ocpb', m), box = $('#ocs', m), cp = $('#occp', m), ag = $('#ocag', m), sel = $('#ocl', m);
  const ov = $('#ocov', m), tg = $('#octg', m);
  let run = 0, worker = null, LN = [];
  /* each line is laid over the picture where it was found; its letters are sized to the line's height, and made smaller if they would run past its width */
  const fitOv = () => { const H = ov.clientHeight, W = ov.clientWidth; if (!H || !W) return;
    [...ov.children].forEach((el, i) => { const l = LN[i]; if (!l) return; const bw = l.w * W; let fs = Math.max(5, l.h * H * 0.74); el.style.fontSize = fs + 'px';
      const sw = el.scrollWidth; if (sw > bw + 1) el.style.fontSize = Math.max(5, fs * bw / sw) + 'px'; }); };
  const drawOv = lines => { LN = lines || []; const p = v => (v * 100).toFixed(3) + '%';
    ov.innerHTML = LN.map(l => `<div class="ocl" style="left:${p(l.x)};top:${p(l.y)};width:${p(l.w)};height:${p(l.h)}">${esc(l.text)}</div>`).join('');
    ov.classList.toggle('on', !!LN.length); tg.hidden = !LN.length; tg.textContent = 'Hide text on picture'; ov.hidden = false; fitOv(); };
  ov.onclick = e => { const el = e.target.closest('.ocl'), s = window.getSelection && window.getSelection(); if (!el || (s && !s.isCollapsed)) return; copyText(el.textContent, 'line'); };
  tg.onclick = () => { ov.hidden = !ov.hidden; tg.textContent = ov.hidden ? 'Show text on picture' : 'Hide text on picture'; if (!ov.hidden) fitOv(); };
  const ro = window.ResizeObserver ? new ResizeObserver(fitOv) : null; if (ro) ro.observe(ov);
  const stop = () => { run++; const w = worker; worker = null; if (w) { try { w.terminate(); } catch (e) { } } };
  const say = (t, p, bad) => { st.textContent = t; bar.style.width = Math.round(Math.max(0, Math.min(1, p || 0)) * 100) + '%'; box.classList.toggle('bad', !!bad); box.hidden = false; };
  const read = async () => {
    stop(); const my = run; cp.disabled = ag.disabled = true; tx.readOnly = true; tx.value = ''; drawOv([]); say('Getting the text reader ready…', 0.03);
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
      const r = await w.recognize(cv, {}, { text: true, blocks: true }); if (my !== run) return;
      stop(); run = my; /* the engine's memory is given back; this result stays */
      const text = OCR_TEXT.tidy(r && r.data && r.data.text);
      drawOv(OCR_TEXT.lines(r && r.data && r.data.blocks, cv.width, cv.height, 30));
      tx.value = text; tx.readOnly = false; ag.disabled = false; cp.disabled = !text;
      if (text) { box.hidden = true; } else say('No text was found in this picture. Try the other language, or a sharper photo.', 1, true);
    } catch (e) { if (my !== run) return; stop(); run = my; ag.disabled = false; say((e && e.message && e.message.length < 90 ? e.message : 'The picture could not be read') + '. Check the connection and press Read again.', 1, true); }
  };
  const close = () => { stop(); if (ro) ro.disconnect(); document.removeEventListener('keydown', key); m.remove(); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  new MutationObserver((_, o) => { if (!document.body.contains(m)) { o.disconnect(); stop(); document.removeEventListener('keydown', key); } }).observe(document.body, { childList: true }); /* closed by a click outside */
  $('#occl', m).onclick = close; ag.onclick = read;
  cp.onclick = () => copyText(tx.selectionStart !== tx.selectionEnd ? tx.value.slice(tx.selectionStart, tx.selectionEnd) : tx.value, 'text');
  tx.oninput = () => { cp.disabled = !tx.value.trim(); };
  sel.onchange = () => { try { localStorage.setItem('ocrLang', sel.value); } catch (e) { } read(); };
  read();
}
