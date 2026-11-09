// Customer profile tabs: Plant details (panels / inverters with serial numbers) and Documents (typed upload, previews, viewer, share, download all).
const DOC_TYPES = ['Aadhaar card', 'Aadhaar card back side', 'Aadhaar 2', 'PAN card', 'Electricity bill', 'Latest paid bill', 'Passbook', 'Passbook or cancelled cheque', 'DCR Certificate',
  'Loan Quotation', 'Loan Papers', 'Building tax', 'Land tax', 'Agreement', 'Feasibility', 'Acknowledgement', 'Site Photo', 'Geo-tagged Photo', 'Customer Geo Tagged Photo'];
const PL_OPTS = {
  panel_type: ['Mono PERC', 'TOPCon', 'Bifacial', 'HJT', 'Polycrystalline'], inverter_type: ['Single phase', 'Three phase', 'Hybrid', 'Micro inverter', 'Optimizer (SolarEdge)'],
  structure_type: ['GI elevated', 'Aluminium', 'Shed / sheet mount', 'Ground mount'], structure_material: ['Hot-dip galvanised iron', 'Aluminium', 'MS painted'], panel_arrangement: ['Portrait', 'Landscape', 'Mixed'],
  system_type: ['On-grid', 'Off-grid', 'Hybrid'], rooftop_type: ['RCC flat', 'RCC sloped', 'Sheet / tin', 'Tile', 'Ground'], rooftop_penetration: ['No (ballasted)', 'Yes (anchored)'],
};
const PL_SECTIONS = [
  ['Plant', 'sun', [['capacity', 'Solar capacity (kWp)', 'n'], ['panel_make', 'Panel make'], ['panel_type', 'Panel type'], ['panel_wattage', 'Panel wattage (W)', 'n'], ['panel_count', 'Number of panels', 'n']]],
  ['Inverter', 'gear', [['inverter_make', 'Inverter make'], ['inverter_count', 'Number of inverters', 'n'], ['inverter_type', 'Inverter type'], ['inverter_capacity', 'Inverter capacity (kW)', 'n']]],
  ['Structure', 'project', [['structure_type', 'Structure type'], ['structure_material', 'Material'], ['panel_arrangement', 'Panel arrangement']]],
  ['Rooftop', 'target', [['system_type', 'System type'], ['rooftop_type', 'Rooftop type'], ['rooftop_age', 'Rooftop age (years)', 'n'], ['building_height', 'Building height (m)', 'n'], ['floors', 'Number of floors', 'n'], ['rooftop_penetration', 'Rooftop penetration'], ['slab_thickness', 'Slab thickness (mm)', 'n'], ['slab_slope', 'Slope of slab (degrees)', 'n']]],
  ['Application', 'receipt', [['application_no', 'Application no.'], ['application_date', 'Application date', 'd'], ['gst_invoice_no', 'GST invoice no.'], ['commissioned_on', 'Commissioned on', 'd'], ['warranty_till', 'Warranty till', 'd']]],
];
const cpv = (v, l) => v ? `<button class="pfv" data-cp="${esc(v)}" data-l="${esc(l)}" title="Click to copy">${esc(v)}<i class="i i-copy"></i></button>` : '<em class="mut">—</em>';
const bindCopy = root => $$('[data-cp]', root).forEach(b => b.onclick = e => { e.preventDefault(); copyText(b.dataset.cp, b.dataset.l || ''); b.classList.add('ok'); setTimeout(() => b.classList.remove('ok'), 900); });

// ---------------- Plant details ----------------
async function renderPlant(box, c, id, edit) {
  box.innerHTML = '<p class="mut">Loading…</p>';
  const r = await api('plant', 'get', undefined, '&customer_id=' + id), d = r.data || {}, w = canW('customers');
  d.panels = d.panels || []; d.inverters = d.inverters || [];
  if (edit) return plantForm(box, c, id, d, r);
  const field = ([k, l]) => `<div class="plf"><span>${l}</span>${cpv(d[k], l)}</div>`;
  const pw = d.panels.reduce((a, p) => a + (+p.wattage || +d.panel_wattage || 0), 0);
  const serialList = (list, kind, cols) => list.length ? `<div class="plser">${list.map((x, i) => `<div class="pls"><b>${kind} ${i + 1}</b><span>${cols.map(([k, l, u]) => x[k] ? esc(x[k]) + (u || '') : '').filter(Boolean).join(' · ') || '<em class="mut">—</em>'}</span>${x.serial ? cpv(x.serial, kind + ' ' + (i + 1) + ' serial') : '<em class="mut">no serial</em>'}</div>`).join('')}</div>` : `<p class="mut" style="margin:0;font-size:13px">No ${kind.toLowerCase()}s listed yet.${w ? ' Use <b>Edit</b> to add them with serial numbers.' : ''}</p>`;
  const sec = ([t, ic, fs], extra = '') => `<div class="card pfc"><div class="pfch"><i class="i i-${ic}"></i><h3>${t}</h3></div><div class="plgrid">${fs.map(field).join('')}</div>${extra}</div>`;
  const pay = r.payment;
  box.innerHTML = `<div class="card plsum"><div class="plsi"><i class="i i-sun"></i></div><div class="plst"><h3>${d.capacity ? esc(d.capacity) + ' kWp' : 'Plant'} ${d.system_type ? '· ' + esc(d.system_type) : ''}</h3>
      <div class="mut">${[d.panel_count ? `${esc(d.panel_count)} × ${esc(d.panel_make || 'panel')}${d.panel_wattage ? ' ' + esc(d.panel_wattage) + ' W' : ''}` : '', d.inverter_count || d.inverter_make ? `${esc(d.inverter_count || 1)} × ${esc(d.inverter_make || 'inverter')}${d.inverter_capacity ? ' ' + esc(d.inverter_capacity) + ' kW' : ''}` : '', d.application_no ? 'Application ' + esc(d.application_no) : ''].filter(Boolean).join(' · ') || 'No plant details yet'}</div>
      ${r.updated ? `<small class="mut">Updated ${new Date(r.updated.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${r.updated_by ? ' by ' + esc(r.updated_by) : ''}</small>` : ''}</div>
      <span class="sp"></span>${d.panels.length || d.inverters.length ? '<button class="btn sec sm" id="plcs"><i class="i i-copy"></i> Copy serials</button>' : ''}${w ? '<button class="btn" id="pled"><i class="i i-pencil"></i> Edit plant details</button>' : ''}</div>
    <div class="plcols">
     ${sec(PL_SECTIONS[0], `<div class="pfsub">Panels (${d.panels.length})${pw ? ` · ${(pw / 1000).toFixed(2)} kWp total` : ''}</div>${serialList(d.panels, 'Panel', [['make', 'Make'], ['wattage', 'W', ' W']])}`)}
     ${sec(PL_SECTIONS[1], `<div class="pfsub">Inverters (${d.inverters.length})</div>${serialList(d.inverters, 'Inverter', [['make', 'Make'], ['type', 'Type'], ['capacity', 'kW', ' kW']])}`)}
     ${sec(PL_SECTIONS[2])}${sec(PL_SECTIONS[3])}${sec(PL_SECTIONS[4])}
     ${pay ? `<div class="card pfc"><div class="pfch"><i class="i i-coin"></i><h3>Project cost & payment</h3>${r.project ? `<span class="sp"></span><a class="btn sec sm" href="#/projects/${r.project.id}">Open project</a>` : ''}</div>
       <div class="plpay"><div class="b"><small>Total project cost</small><b>${pay.cost ? inr(pay.cost) : 'Not set'}</b></div><div class="g"><small>Total paid</small><b>${inr(pay.paid)}</b><em>${pay.count} payment${pay.count === 1 ? '' : 's'}</em></div>
        <div class="y"><small>Pending</small><b>${inr(pay.pending)}</b></div><div class="n"><small>Status</small><b>${pay.status}</b></div></div></div>` : ''}
    </div>`;
  bindCopy(box);
  if ($('#pled', box)) $('#pled', box).onclick = () => renderPlant(box, c, id, true);
  if ($('#plcs', box)) $('#plcs', box).onclick = () => copyText(`${c.name} — serial numbers\n` + d.panels.map((p, i) => `Panel ${i + 1}: ${p.serial || '-'}`).join('\n') + '\n' + d.inverters.map((p, i) => `Inverter ${i + 1}: ${p.serial || '-'}`).join('\n'), 'serial numbers');
}

function plantForm(box, c, id, d, r) {
  const inp = ([k, l, t]) => `<div><label>${l}</label><input data-pk="${k}" ${t === 'n' ? 'inputmode="decimal"' : ''} ${t === 'd' ? 'type="date"' : ''} value="${esc(d[k] || '')}" ${PL_OPTS[k] ? `list="pl-${k}"` : ''}></div>`;
  box.innerHTML = `${Object.entries(PL_OPTS).map(([k, o]) => `<datalist id="pl-${k}">${o.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`).join('')}
    <div class="card plsum"><div class="plsi"><i class="i i-pencil"></i></div><div class="plst"><h3>Edit plant details</h3><div class="mut">Set the number of panels / inverters and the rows below update. Paste serial numbers in one go.</div></div><span class="sp"></span>
     <button class="btn sec" id="plx">Cancel</button><button class="btn" id="plsv">Save</button></div>
    <div class="plcols">${PL_SECTIONS.map(([t, ic, fs], i) => `<div class="card pfc"><div class="pfch"><i class="i i-${ic}"></i><h3>${t}</h3></div><div class="two">${fs.map(inp).join('')}</div>
      ${i === 0 ? `<div class="pfsub">Panels <span id="pln"></span></div><div class="plbar"><button class="btn sec sm" data-fill="panels">Fill make & wattage</button><button class="btn sec sm" data-paste="panels">Paste serial numbers</button></div><div id="plp"></div>` : ''}
      ${i === 1 ? `<div class="pfsub">Inverters <span id="pli"></span></div><div class="plbar"><button class="btn sec sm" data-fill="inverters">Fill make, type & kW</button><button class="btn sec sm" data-paste="inverters">Paste serial numbers</button></div><div id="plv"></div>` : ''}</div>`).join('')}</div>`;
  const P = d.panels.map(x => ({ ...x })), V = d.inverters.map(x => ({ ...x }));
  const val = k => $(`[data-pk="${k}"]`, box).value.trim();
  const sync = () => { // rows follow the counts
    const np = Math.min(400, Math.max(0, parseInt(val('panel_count')) || 0)), nv = Math.min(50, Math.max(0, parseInt(val('inverter_count')) || 0));
    while (P.length < np) P.push({ make: val('panel_make'), wattage: val('panel_wattage'), serial: '' }); P.length = np;
    while (V.length < nv) V.push({ make: val('inverter_make'), type: val('inverter_type'), capacity: val('inverter_capacity'), serial: '' }); V.length = nv;
    $('#pln', box).textContent = `(${np})`; $('#pli', box).textContent = `(${nv})`;
    $('#plp', box).innerHTML = P.map((p, i) => `<div class="plrow"><b>${i + 1}</b><input data-l="P" data-i="${i}" data-f="make" placeholder="Make" value="${esc(p.make)}" list="pl-x"><input data-l="P" data-i="${i}" data-f="wattage" placeholder="W" inputmode="numeric" value="${esc(p.wattage)}"><input data-l="P" data-i="${i}" data-f="serial" placeholder="Serial no." value="${esc(p.serial)}"></div>`).join('') || '<p class="mut" style="font-size:13px;margin:4px 0">Enter the number of panels above.</p>';
    $('#plv', box).innerHTML = V.map((p, i) => `<div class="plrow inv"><b>${i + 1}</b><input data-l="V" data-i="${i}" data-f="make" placeholder="Make" value="${esc(p.make)}"><input data-l="V" data-i="${i}" data-f="type" placeholder="Type" value="${esc(p.type)}" list="pl-inverter_type"><input data-l="V" data-i="${i}" data-f="capacity" placeholder="kW" inputmode="decimal" value="${esc(p.capacity)}"><input data-l="V" data-i="${i}" data-f="serial" placeholder="Serial no." value="${esc(p.serial)}"></div>`).join('') || '<p class="mut" style="font-size:13px;margin:4px 0">Enter the number of inverters above.</p>';
    $$('[data-l]', box).forEach(e => e.oninput = () => { (e.dataset.l === 'P' ? P : V)[+e.dataset.i][e.dataset.f] = e.value; });
  };
  sync();
  ['panel_count', 'inverter_count'].forEach(k => $(`[data-pk="${k}"]`, box).addEventListener('change', sync));
  $$('[data-fill]', box).forEach(b => b.onclick = () => { if (b.dataset.fill === 'panels') P.forEach(p => { p.make = val('panel_make'); p.wattage = val('panel_wattage'); }); else V.forEach(p => { p.make = val('inverter_make'); p.type = val('inverter_type'); p.capacity = val('inverter_capacity'); }); sync(); toast('Filled'); });
  $$('[data-paste]', box).forEach(b => b.onclick = () => { const L = b.dataset.paste === 'panels' ? P : V;
    const m = modal(`<h2 style="margin-top:0">Paste ${b.dataset.paste === 'panels' ? 'panel' : 'inverter'} serial numbers</h2><p class="mut" style="font-size:13px">One per line (or separated by commas). They fill ${b.dataset.paste} 1, 2, 3… in order${L.length ? ` — ${L.length} rows` : ''}; extra numbers add rows.</p>
      <textarea id="psx" rows="10" placeholder="RN540M2408001\nRN540M2408002\n…"></textarea><div class="bar" style="margin-top:12px"><button class="btn" id="psok">Fill serials</button><button class="btn sec" id="psc">Cancel</button></div>`);
    $('#psc', m).onclick = () => m.remove();
    $('#psok', m).onclick = () => { const s = $('#psx', m).value.split(/[\n,;\t]+/).map(x => x.trim()).filter(Boolean);
      s.forEach((x, i) => { if (!L[i]) L.push(b.dataset.paste === 'panels' ? { make: val('panel_make'), wattage: val('panel_wattage'), serial: '' } : { make: val('inverter_make'), type: val('inverter_type'), capacity: val('inverter_capacity'), serial: '' }); L[i].serial = x; });
      $(`[data-pk="${b.dataset.paste === 'panels' ? 'panel_count' : 'inverter_count'}"]`, box).value = L.length; m.remove(); sync(); toast(`${s.length} serial number${s.length === 1 ? '' : 's'} filled`); }; });
  $('#plx', box).onclick = () => renderPlant(box, c, id);
  $('#plsv', box).onclick = async () => { const data = { panels: P, inverters: V }; $$('[data-pk]', box).forEach(e => data[e.dataset.pk] = e.value.trim());
    const b = $('#plsv', box); b.disabled = true; try { await api('plant', 'save', { customer_id: id, data }); toast('Plant details saved'); renderPlant(box, c, id); } catch (e) { b.disabled = false; } };
}

// ---------------- Documents ----------------
const isImg = f => /\.(jpe?g|png|webp|gif)$/i.test(f.name), isPdf = f => /\.pdf$/i.test(f.name);
const fileUrl = (f, dl) => `api.php?m=files&a=get&id=${f.id}${dl ? '&dl=1' : ''}`;
function renderDocs(box, c, id) {
  const F = c.files, w = canW('files'), have = new Set(F.map(f => f.item).filter(Boolean));
  box.innerHTML = `<div class="card pfc"><div class="pfch"><i class="i i-file"></i><h3>Documents</h3><small class="mut">${F.length} file${F.length === 1 ? '' : 's'} · kept 200 days</small><span class="sp"></span>
      ${F.length ? `<a class="btn sec sm dlall" href="api.php?m=files&a=zip&customer_id=${id}"><i class="i i-download"></i> Download all</a>` : ''}${w ? '<button class="btn sm" id="dcadd"><i class="i i-plus"></i> Add documents</button>' : ''}</div>
     <div class="dcchk">${DOC_TYPES.map(t => `<button class="dcc ${have.has(t) ? 'ok' : ''}" data-t="${esc(t)}" ${w ? '' : 'disabled'} title="${have.has(t) ? 'Uploaded' : 'Missing — click to upload'}">${have.has(t) ? '<i class="i i-check"></i>' : ''}${esc(t)}</button>`).join('')}</div></div>
    <div class="dcgrid">${F.map((f, i) => { const d = docLeft(f.created);
      return `<div class="card dcard"><button class="dcth" data-v="${i}" title="View">${isImg(f) ? `<img loading="lazy" src="${fileUrl(f)}" alt="">` : `<span class="dcic"><i class="i i-file"></i><b>${esc((f.name.split('.').pop() || '').toUpperCase())}</b></span>`}</button>
        <div class="dcb"><b title="${esc(f.item || f.name)}">${esc(f.item || f.name)}</b><div class="dcm"><span class="mut">${dt(f.created)}</span><span class="dcd ${d <= 30 ? 'warn' : ''}">● ${d > 0 ? d + 'd left' : 'expiring'}</span></div>
        ${f.item ? `<small class="mut dcn" title="${esc(f.name)}">${esc(f.name)}</small>` : ''}
        <div class="dca"><a href="${fileUrl(f, 1)}" download="${esc(f.name)}"><i class="i i-download"></i> Download</a><button data-v="${i}"><i class="i i-eye"></i> View</button><button data-sh="${i}"><i class="i i-link"></i> Share</button>${w ? `<button class="dcdel" data-del="${i}" title="Move to Recycle bin"><i class="i i-trash"></i></button>` : ''}</div></div></div>`; }).join('')
      || `<div class="card" style="grid-column:1/-1;text-align:center;padding:30px"><p class="mut" style="margin:0 0 10px">No documents yet.</p>${w ? '<button class="btn" id="dcadd2"><i class="i i-plus"></i> Add documents</button>' : ''}</div>`}</div>`;
  const reload = async () => { const nc = await api('customers', 'get', undefined, '&id=' + id); c.files = nc.files; renderDocs(box, c, id); const t = $('[data-pt="docs"]'); if (t) t.innerHTML = `<i class="i i-file"></i> Documents${c.files.length ? ' (' + c.files.length + ')' : ''}`; };
  [$('#dcadd', box), $('#dcadd2', box)].forEach(b => b && (b.onclick = () => docUploadModal(c, id, null, reload)));
  $$('.dcc', box).forEach(b => b.onclick = () => docUploadModal(c, id, b.dataset.t, reload));
  const noImg = img => { img.parentNode.innerHTML = '<span class="dcic"><i class="i i-file"></i><b>IMAGE</b></span>'; };
  $$('.dcth img', box).forEach(img => { if (img.complete && !img.naturalWidth) noImg(img); else img.onerror = () => noImg(img); });
  $$('[data-v]', box).forEach(b => b.onclick = () => docViewer(F, +b.dataset.v));
  $$('[data-sh]', box).forEach(b => b.onclick = () => docShare(F[+b.dataset.sh], c));
  $$('[data-del]', box).forEach(b => b.onclick = async () => { const f = F[+b.dataset.del]; if (!confirm(`Delete "${f.item || f.name}"?\n\nIt goes to the Recycle bin and can be restored for 72 hours.`)) return; await api('files', 'delete', { id: f.id }); toast('Moved to Recycle bin'); reload(); });
}
async function docShare(f, c) {
  try {
    const blob = await (await fetch(fileUrl(f), { credentials: 'same-origin' })).blob();
    const file = new File([blob], f.name, { type: blob.type || (isPdf(f) ? 'application/pdf' : 'image/jpeg') });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: `${c.name} — ${f.item || f.name}` }); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('This browser can’t share files directly — downloaded it so you can attach it');
  } catch (e) { if (e && e.name !== 'AbortError') toast('Could not share this file', true); }
}
function docViewer(F, i) {
  const m = modal('<div class="dvw"></div>', 1); m.classList.add('dvmod');
  const show = () => { const f = F[i];
    $('.dvw', m).innerHTML = `<div class="dvh"><b>${esc(f.item || f.name)}</b><span class="mut">${i + 1} / ${F.length} · ${esc(f.name)}</span><span class="sp"></span><a class="btn sec sm" href="${fileUrl(f, 1)}" download="${esc(f.name)}"><i class="i i-download"></i></a><button class="btn sec sm" id="dvs"><i class="i i-link"></i></button><button class="lvx" id="dvx"><i class="i i-x"></i></button></div>
      <div class="dvb">${isImg(f) ? `<img src="${fileUrl(f)}" alt="">` : isPdf(f) ? `<iframe src="${fileUrl(f)}" title="PDF"></iframe>` : `<p class="mut">No preview for this file type. <a href="${fileUrl(f, 1)}">Download</a></p>`}
       ${F.length > 1 ? '<button class="dvn p" id="dvp">‹</button><button class="dvn n" id="dvn">›</button>' : ''}</div>`;
    $('#dvx', m).onclick = () => { m.remove(); document.removeEventListener('keydown', key); };
    $('#dvs', m).onclick = () => docShare(f, { name: '' });
    if ($('#dvp', m)) { $('#dvp', m).onclick = () => { i = (i - 1 + F.length) % F.length; show(); }; $('#dvn', m).onclick = () => { i = (i + 1) % F.length; show(); }; } };
  const key = e => { if (!document.body.contains(m)) return document.removeEventListener('keydown', key); if (e.key === 'ArrowRight' && F.length > 1) { i = (i + 1) % F.length; show(); } if (e.key === 'ArrowLeft' && F.length > 1) { i = (i - 1 + F.length) % F.length; show(); } if (e.key === 'Escape') { m.remove(); } };
  document.addEventListener('keydown', key);
  let sx = 0; m.addEventListener('touchstart', e => sx = e.touches[0].clientX, { passive: true }); m.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 60 && F.length > 1) { i = (i + (dx < 0 ? 1 : -1) + F.length) % F.length; show(); } });
  show();
}
// big phone photos are shrunk before upload (faster, smaller) — max 2200 px, JPEG
async function shrinkImage(f) {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size < 1.2e6) return f;
  try { const img = await createImageBitmap(f), k = Math.min(1, 2200 / Math.max(img.width, img.height)); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); const b = await new Promise(r => cv.toBlob(r, 'image/jpeg', .85));
    return b && b.size < f.size ? new File([b], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : f; } catch (e) { return f; }
}
function docUploadModal(c, id, only, done) {
  const have = {}; c.files.forEach(f => f.item && (have[f.item] = (have[f.item] || 0) + 1));
  const types = only ? [only] : DOC_TYPES;
  const m = modal(`<div class="duw"><div class="duh"><h2>Add documents</h2><small class="mut">${esc(c.name)} · photo, scan or PDF (max 10 MB)</small><button class="lvx" id="dux"><i class="i i-x"></i></button></div>
    <div class="dul">${types.map(t => `<div class="dur" data-t="${esc(t)}"><div><b>${esc(t)}</b><small class="mut">${have[t] ? '✓ ' + have[t] + ' uploaded' : ''}</small></div><label class="duup" title="Upload ${esc(t)}"><input type="file" accept="image/*,.pdf" multiple hidden><i class="i i-upload"></i></label></div>`).join('')}
     ${only ? '' : `<div class="dur other"><input id="duo" placeholder="Other document — type its name"><label class="duup" title="Upload"><input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple hidden><i class="i i-upload"></i></label></div>`}</div>
    <div class="duf"><span class="mut" id="dus"></span><span class="sp"></span><button class="btn" id="dudone">Done</button></div></div>`);
  m.classList.add('dumod');
  let n = 0;
  const close = () => { m.remove(); if (n) { toast(`${n} document${n === 1 ? '' : 's'} uploaded`); done ? done() : route(); } };
  $('#dux', m).onclick = close; $('#dudone', m).onclick = close;
  $$('.dur input[type=file]', m).forEach(inp => inp.onchange = async () => {
    const row = inp.closest('.dur'), t = row.classList.contains('other') ? ($('#duo', m).value.trim() || 'Other document') : row.dataset.t, lab = inp.parentElement, st = row.querySelector('small');
    const files = [...inp.files]; inp.value = ''; if (!files.length) return;
    lab.classList.add('busy');
    for (const f0 of files) {
      const f = await shrinkImage(f0);
      if (f.size > 10 * 1024 * 1024) { toast(`${f0.name} is larger than 10 MB`, true); continue; }
      const fd = new FormData(); fd.append('file', f, f.name); fd.append('customer_id', id); fd.append('kind', 'doc'); fd.append('item', t);
      try { await api('files', 'upload', fd); n++; have[t] = (have[t] || 0) + 1; if (st) st.textContent = '✓ ' + have[t] + ' uploaded'; row.classList.add('done'); } catch (e) { }
    }
    lab.classList.remove('busy'); $('#dus', m).textContent = n ? `${n} uploaded` : '';
  });
}
