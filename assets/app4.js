// Folder: file manager (nested folders, upload/drag-drop, move/delete/zip), public share links, WhatsApp sharing
/* File drags anywhere on the Folder page: stop the browser opening the file; writers upload into the current folder. Bound once. */
let FMUP = null, FMDOC = false;
function fmDocDrag() {
  if (FMDOC) return; FMDOC = true;
  const hf = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  document.addEventListener('dragover', e => { if ($('#fm') && hf(e)) e.preventDefault(); });
  document.addEventListener('drop', e => { if (!$('#fm') || !hf(e)) return; e.preventDefault(); const dz = $('#fmdrop'); if (dz) dz.classList.add('hide'); if (FMUP) FMUP(e.dataTransfer.files); else toast("You can't upload here", 1); });
}
/* view options remembered per browser (list / grid, sort order); localStorage can be blocked, so both reads and writes are guarded */
const fmPref = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const fmSave = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
/* hist/pos: the folders opened on this page, for the Back / Forward buttons (kept in step with the browser's own Back) */
/* focus: the item shown in the right-hand preview ({k:'f12'|'d3'}); pvStack: items previewed before it (the preview's back link); anchor: start of a Shift+click range */
let FM = { q: '', cur: 0, files: new Set(), folders: new Set(), hist: [], pos: -1, view: fmPref('fmView', 'list'), sort: fmPref('fmSort', 'name'), focus: null, pvStack: [], anchor: null };
/* download through a hidden frame, so a refused download never replaces the page */
const fmDl = url => { const fr = document.createElement('iframe'); fr.style.display = 'none'; fr.src = url; document.body.appendChild(fr); setTimeout(() => fr.remove(), 120000); };
const fmNarrow = () => matchMedia('(max-width: 820px)').matches; /* phones: no room for the preview, a tap opens */
const FM_SORTS = [['name', 'Name A–Z'], ['name-d', 'Name Z–A'], ['new', 'Newest first'], ['old', 'Oldest first'], ['big', 'Largest first'], ['small', 'Smallest first']];
const fmCmp = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }); /* "550 Wp" before "580 Wp" */
function fmSorted(list, name, date, size) {
  const s = FM.sort, out = list.slice();
  out.sort((a, b) => s === 'name-d' ? fmCmp(name(b), name(a)) : s === 'new' ? String(date(b)).localeCompare(String(date(a)))
    : s === 'old' ? String(date(a)).localeCompare(String(date(b))) : s === 'big' ? size(b) - size(a) : s === 'small' ? size(a) - size(b) : fmCmp(name(a), name(b)));
  return out;
}
const fsize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const baseUrl = () => location.origin + location.pathname.replace(/[^/]*$/, '');
const shareUrl = d => `${baseUrl()}api.php?m=share&t=${d.token}`;
const fext = n => ((n || '').split('.').pop() || '').toUpperCase().slice(0, 4);
/* Path from the top level down to folder `id`: [{id, name}, ...]. Stops if the chain is broken or loops. */
function fmPath(folders, id) {
  const by = new Map(folders.map(f => [+f.id, f])), out = []; let c = +id || 0, n = 0;
  while (c && by.has(c) && n++ < 50) { const f = by.get(c); out.unshift({ id: +f.id, name: f.name }); c = +f.parent_id || 0; }
  return out;
}
const fmPathText = (folders, id) => ['Folder'].concat(fmPath(folders, id).map(p => p.name)).join(' › ');

async function pgFolder(id) {
  const data = await api('folder', 'list'); const folders = data.folders, items = data.items;
  const w = canW('folder');
  const cur = +id || 0;
  if (cur && !folders.some(f => +f.id === cur)) { location.hash = '#/folder'; return; }
  if (FM.cur !== cur) { FM.files.clear(); FM.folders.clear(); FM.q = ""; FM.cur = cur; FM.focus = null; FM.pvStack = []; FM.anchor = null; }
  /* Back / Forward history: a step to the previous or next entry (our buttons or the browser's) moves along it; anything else is a new visit */
  const H = FM.hist;
  if (FM.pos >= 0 && H[FM.pos] === cur) { /* same folder (reload after a change) */ }
  else if (FM.pos > 0 && H[FM.pos - 1] === cur) FM.pos--;
  else if (FM.pos < H.length - 1 && H[FM.pos + 1] === cur) FM.pos++;
  else { H.splice(FM.pos + 1); H.push(cur); if (H.length > 50) H.shift(); FM.pos = H.length - 1; }
  for (const i of [...FM.files]) if (!items.some(x => +x.id === i)) FM.files.delete(i);
  for (const i of [...FM.folders]) if (!folders.some(x => +x.id === i)) FM.folders.delete(i);
  const kids = folders.filter(f => (+f.parent_id || 0) === cur), files = items.filter(i => (+i.folder_id || 0) === cur);
  const nsel = () => FM.files.size + FM.folders.size;
  const rowsNow = () => {
    const t = FM.q.trim().toLowerCase();
    if (!t) return { fo: kids, fi: files, s: false };
    return { s: true,
      fo: folders.filter(f => (f.name + ' ' + fmPathText(folders, f.parent_id)).toLowerCase().includes(t)),
      fi: items.filter(i => (i.file_name + ' ' + i.title + ' ' + fmPathText(folders, i.folder_id)).toLowerCase().includes(t)) };
  };
  const crumbs = fmPath(folders, cur);
  const crumbHtml = `<nav class="fm-crumbs"><a href="#/folder">Folder</a>${crumbs.map((c, i) => ` <span class="fm-sep">›</span> ${i === crumbs.length - 1 ? `<b>${esc(c.name)}</b>` : `<a href="#/folder/${c.id}">${esc(c.name)}</a>`}`).join('')}</nav>`;
  $('#main').innerHTML = `<div class="fm" id="fm">
   <div class="bar" style="align-items:flex-start;margin-bottom:6px"><div><h2 style="margin:0;font-size:26px">Folder</h2><div class="mut">Datasheets, BIS certificates and test reports</div></div><span class="sp"></span>
    ${w ? '<button class="btn sec" id="fmnew"><i class="i i-folder"></i> New folder</button><button class="btn" id="fmup"><i class="i i-upload"></i> Upload</button><input type="file" id="fmfile" multiple class="hide" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx">' : ''}</div>
   <div class="fm-top"><div class="fm-nav"><button class="ib" id="fmback" title="Back" aria-label="Back" ${FM.pos > 0 ? '' : 'disabled'}><i class="i i-chev fm-l"></i></button><button class="ib" id="fmfwd" title="Forward" aria-label="Forward" ${FM.pos < H.length - 1 ? '' : 'disabled'}><i class="i i-chev"></i></button><button class="ib" id="fmupl" title="Up one level" aria-label="Up one level" ${cur ? '' : 'disabled'}><i class="i i-chev fm-u"></i></button></div>
    ${crumbHtml}<input id="fmq" type="search" placeholder="Search all folders…" value="${esc(FM.q)}">
    <div class="fm-view"><select id="fmsort" aria-label="Sort by">${FM_SORTS.map(([v, l]) => `<option value="${v}" ${FM.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
     <div class="fm-seg" role="group" aria-label="View"><button type="button" data-v="list" class="${FM.view === 'grid' ? '' : 'on'}" title="List view" aria-label="List view"><i class="i i-menu"></i></button><button type="button" data-v="grid" class="${FM.view === 'grid' ? 'on' : ''}" title="Grid view" aria-label="Grid view"><i class="i i-dashboard"></i></button></div></div></div>
   <div class="fm-split" id="fmsplit"><div class="fm-col"><div id="fmlist" class="fm-list"></div><div id="fmbar" class="fm-bar hide"></div></div><section class="fm-pv" id="fmpv" aria-label="Preview"></section></div>
   <div id="fmdrop" class="fm-drop hide"><i class="i i-upload"></i><div>Drop files to upload into <b>${esc(crumbs.length ? crumbs[crumbs.length - 1].name : 'Folder')}</b></div></div></div>`;
  fmDocDrag(); FMUP = null;
  const reload = () => route();
  const clearSel = () => { FM.files.clear(); FM.folders.clear(); };
  const count = f => folders.filter(x => +x.parent_id === +f.id).length + items.filter(x => +x.folder_id === +f.id).length;
  const sortFo = l => fmSorted(l, f => f.name, f => f.created || '', count), sortFi = l => fmSorted(l, d => d.file_name, d => d.updated || d.created || '', d => +d.size || 0);
  const keyset = k => k[0] === 'd' ? FM.folders : FM.files;
  const itemOf = k => k && (k[0] === 'd' ? folders.find(f => +f.id === +k.slice(1)) : items.find(i => +i.id === +k.slice(1)));
  let order = []; /* keys of the items on screen, in screen order (for Shift+click and the arrow keys) */
  const tip = fmNarrow() ? '' : ' title="Click to preview · double-click to open"';
  const draw = () => {
    const r0 = rowsNow(), box = $('#fmlist'), grid = FM.view === 'grid';
    /* folders always first, each group in the chosen order (folders by name, date, or number of items) */
    const r = { s: r0.s, fo: sortFo(r0.fo), fi: sortFi(r0.fi) };
    order = r.fo.map(f => 'd' + f.id).concat(r.fi.map(d => 'f' + d.id));
    box.className = grid ? 'fm-g' : 'fm-list';
    /* names are not links: a click selects and previews, a double-click (or Enter) opens */
    const fileRow = d => `<div class="fm-row ${FM.files.has(+d.id) ? 'sel' : ''}" data-k="f${d.id}" tabindex="0"${tip}><label class="fm-ck"><input type="checkbox" data-f="${d.id}" ${FM.files.has(+d.id) ? 'checked' : ''}></label>
      <div class="fm-ic"><span class="fm-ty">${esc(fext(d.file_name))}</span></div>
      <div class="fm-nm"><span>${esc(d.file_name)}</span>${r.s ? `<small><a href="#/folder/${+d.folder_id || ''}">${esc(fmPathText(folders, d.folder_id))}</a></small>` : ''}</div>
      <div class="fm-sz">${fsize(d.size)}</div><div class="fm-dt">${dmy(d.updated || d.created)}</div><div class="fm-by">${esc(d.user || '')}</div></div>`;
    const fileCard = d => `<div class="fm-card ${FM.files.has(+d.id) ? 'sel' : ''}" data-k="f${d.id}" tabindex="0"${tip}><label class="fm-ck"><input type="checkbox" data-f="${d.id}" ${FM.files.has(+d.id) ? 'checked' : ''}></label>
      <div class="fm-cbody"><span class="fm-ty fm-big">${esc(fext(d.file_name))}</span><b>${esc(d.file_name)}</b><small>${fsize(d.size)} · ${dmy(d.updated || d.created)}</small></div>
      ${r.s ? `<a class="fm-cpath" href="#/folder/${+d.folder_id || ''}">${esc(fmPathText(folders, d.folder_id))}</a>` : ''}</div>`;
    const folderCard = f => { const n = count(f); return `<div class="fm-card ${FM.folders.has(+f.id) ? 'sel' : ''}" data-k="d${f.id}" tabindex="0"${tip}><label class="fm-ck"><input type="checkbox" data-d="${f.id}" ${FM.folders.has(+f.id) ? 'checked' : ''}></label>
      <div class="fm-cbody"><i class="i i-folder"></i><b>${esc(f.name)}</b><small>${n} item${n === 1 ? '' : 's'}</small></div>
      ${r.s ? `<span class="fm-cpath">${esc(fmPathText(folders, f.parent_id))}</span>` : ''}</div>`; };
    const folderRow = f => { const n = count(f); return `<div class="fm-row ${FM.folders.has(+f.id) ? 'sel' : ''}" data-k="d${f.id}" tabindex="0"${tip}><label class="fm-ck"><input type="checkbox" data-d="${f.id}" ${FM.folders.has(+f.id) ? 'checked' : ''}></label>
      <div class="fm-ic"><i class="i i-folder"></i></div>
      <div class="fm-nm"><b>${esc(f.name)}</b>${r.s ? `<small>${esc(fmPathText(folders, f.parent_id))}</small>` : ''}</div>
      <div class="fm-sz">${n} item${n === 1 ? '' : 's'}</div><div class="fm-dt">${dmy(f.created)}</div><div class="fm-by">${esc(f.user || '')}</div></div>`; };
    const all = r.fo.length + r.fi.length, ticked = r.fo.filter(f => FM.folders.has(+f.id)).length + r.fi.filter(i => FM.files.has(+i.id)).length;
    const allBox = `<input type="checkbox" id="fmall" ${ticked === all ? 'checked' : ''}>`;
    box.innerHTML = !all ? `<div class="fm-empty">${r.s ? 'Nothing matches your search.' : 'This folder is empty.' + (w ? '<br><span class="mut">Drop files here or use Upload.</span>' : '')}</div>`
      : grid ? `<div class="fm-ghd"><label class="fm-ck">${allBox} Select all</label><span class="sp"></span><span>${all} item${all === 1 ? '' : 's'}</span></div><div class="fm-grid">${r.fo.map(folderCard).join('')}${r.fi.map(fileCard).join('')}</div>`
      : `<div class="fm-row fm-hd"><label class="fm-ck">${allBox}</label><div class="fm-ic"></div><div class="fm-nm">Name</div><div class="fm-sz">Size</div><div class="fm-dt">Modified</div><div class="fm-by">By</div></div>`
        + r.fo.map(folderRow).join('') + r.fi.map(fileRow).join('');
    $$('[data-f]', box).forEach(c => c.onchange = () => { c.checked ? FM.files.add(+c.dataset.f) : FM.files.delete(+c.dataset.f); draw(); });
    $$('[data-d]', box).forEach(c => c.onchange = () => { c.checked ? FM.folders.add(+c.dataset.d) : FM.folders.delete(+c.dataset.d); draw(); });
    const sa = $('#fmall', box); if (sa) sa.onchange = () => { r.fo.forEach(f => sa.checked ? FM.folders.add(+f.id) : FM.folders.delete(+f.id)); r.fi.forEach(i => sa.checked ? FM.files.add(+i.id) : FM.files.delete(+i.id)); draw(); };
    paintSel();
  };
  /* selection changes from clicks repaint in place (no redraw), so double-clicks and keyboard focus keep working */
  const paintSel = () => {
    const box = $('#fmlist');
    $$('[data-k]', box).forEach(el => { const k = el.dataset.k, on = keyset(k).has(+k.slice(1)); el.classList.toggle('sel', on); el.classList.toggle('foc', !!FM.focus && FM.focus.k === k); const c = $('input[type=checkbox]', el); if (c) c.checked = on; });
    const sa = $('#fmall', box); if (sa) sa.checked = order.length > 0 && order.every(k => keyset(k).has(+k.slice(1)));
    bar();
  };
  /* click: only this item; Ctrl/⌘+click: add or remove it; Shift+click: everything from the last clicked item to this one */
  const pick = (k, e = {}) => {
    const many = e.ctrlKey || e.metaKey;
    if (e.shiftKey && FM.anchor && order.includes(FM.anchor) && order.includes(k)) {
      const a = order.indexOf(FM.anchor), b = order.indexOf(k);
      if (!many) clearSel();
      order.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => keyset(x).add(+x.slice(1)));
    } else if (many) { const s = keyset(k), id = +k.slice(1); s.has(id) ? s.delete(id) : s.add(id); FM.anchor = k; }
    else { clearSel(); keyset(k).add(+k.slice(1)); FM.anchor = k; }
    FM.focus = { k }; FM.pvStack = []; paintSel(); preview();
  };
  const openKey = k => { const id = +k.slice(1); if (k[0] === 'd') goTo(id); else window.open(`api.php?m=folder&a=get&id=${id}`, '_blank', 'noopener'); };
  const closePv = () => { FM.focus = null; FM.pvStack = []; preview(); paintSel(); };
  /* ---- right-hand preview: a file's pages, or everything inside a folder ---- */
  let pvShown = '';
  const preview = () => {
    const pv = $('#fmpv'), it = FM.focus ? itemOf(FM.focus.k) : null;
    if (!it) { FM.focus = null; FM.pvStack = []; pvShown = ''; $('#fmsplit').classList.remove('pv'); pv.innerHTML = ''; return; }
    const k = FM.focus.k, sig = k + '|' + FM.pvStack.join(',');
    $('#fmsplit').classList.add('pv'); if (sig === pvShown) return; pvShown = sig;
    const prev = FM.pvStack.length ? itemOf(FM.pvStack[FM.pvStack.length - 1]) : null;
    const back = prev ? `<button type="button" class="fm-pvback" id="fmpvb">‹ ${esc(prev.name || prev.file_name)}</button>` : '';
    const close = '<button class="ib" id="fmpvx" title="Close preview" aria-label="Close preview"><i class="i i-x"></i></button>';
    if (k[0] === 'f') {
      const url = `api.php?m=folder&a=get&id=${it.id}`, ext = fext(it.file_name).toLowerCase();
      const body = ext === 'pdf' ? `<iframe src="${url}#view=FitH&navpanes=0" aria-label="${esc(it.file_name)}"></iframe>`
        : ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? `<div class="fm-pvimg"><img src="${url}" alt="${esc(it.file_name)}"></div>`
        : `<div class="fm-pvnone"><span class="fm-ty fm-big">${esc(ext.toUpperCase())}</span><b>No preview for ${esc(ext.toUpperCase())} files</b><span class="mut">Use Open or Download to see it.</span></div>`;
      pv.innerHTML = `<div class="fm-pvh">${back}<div class="fm-pvt"><span class="fm-ty">${esc(fext(it.file_name))}</span><div><b>${esc(it.file_name)}</b><small>${esc(fmPathText(folders, it.folder_id))} · ${fsize(it.size)} · ${dmy(it.updated || it.created)}</small></div>${close}</div>
        <div class="fm-pva"><a class="btn sm" href="${url}" target="_blank" rel="noopener"><i class="i i-eye"></i> Open</a><button class="btn sm sec" id="fmpvdl"><i class="i i-download"></i> Download</button></div></div><div class="fm-pvb">${body}</div>`;
      $('#fmpvdl').onclick = () => fmDl(url + '&dl=1');
    } else {
      let nD = 0, nF = 0, bytes = 0;
      const tree = (pid, depth) => depth > 30 ? '' : sortFo(folders.filter(x => +x.parent_id === pid)).map(x => { nD++; return `<div class="fm-tr fm-trd" data-k="d${x.id}" style="--d:${depth}"${tip}><i class="i i-folder"></i><span>${esc(x.name)}</span></div>${tree(+x.id, depth + 1)}`; }).join('')
        + sortFi(items.filter(x => +x.folder_id === pid)).map(x => { nF++; bytes += +x.size || 0; return `<div class="fm-tr" data-k="f${x.id}" style="--d:${depth}"${tip}><span class="fm-ty">${esc(fext(x.file_name))}</span><span>${esc(x.file_name)}</span><small>${fsize(x.size)}</small></div>`; }).join('');
      const t = tree(+it.id, 0);
      const sum = [nD ? nD + ' folder' + (nD === 1 ? '' : 's') : '', nF ? nF + ' file' + (nF === 1 ? '' : 's') : '', nF ? fsize(bytes) : ''].filter(Boolean).join(' · ') || 'Empty';
      pv.innerHTML = `<div class="fm-pvh">${back}<div class="fm-pvt"><i class="i i-folder"></i><div><b>${esc(it.name)}</b><small>${esc(fmPathText(folders, it.parent_id))} · ${sum}</small></div>${close}</div>
        <div class="fm-pva"><button class="btn sm" id="fmpvo"><i class="i i-folder"></i> Open folder</button>${nF ? '<button class="btn sm sec" id="fmpvdl"><i class="i i-download"></i> Download all</button>' : ''}</div></div>
        <div class="fm-pvb fm-tree">${t || '<div class="fm-empty">This folder is empty.</div>'}</div>`;
      $('#fmpvo').onclick = () => goTo(+it.id);
      if ($('#fmpvdl')) $('#fmpvdl').onclick = () => bytes > 500 * 1048576 ? toast('Too much to download at once — select fewer files', 1) : fmDl(`api.php?m=folder&a=zip&files=&folders=${it.id}`);
      /* inside the folder preview: click shows that item here (with a back link), double-click opens it */
      $$('.fm-tr', pv).forEach(el => { el.onclick = () => { FM.pvStack.push(FM.focus.k); FM.focus = { k: el.dataset.k }; preview(); paintSel(); }; el.ondblclick = () => openKey(el.dataset.k); });
    }
    $('#fmpvx').onclick = closePv;
    if ($('#fmpvb')) $('#fmpvb').onclick = () => { FM.focus = { k: FM.pvStack.pop() }; preview(); paintSel(); };
  };
  const bar = () => {
    const b = $('#fmbar'), n = nsel(); b.classList.toggle('hide', !n); if (!n) { b.innerHTML = ''; return; }
    b.innerHTML = `<b>${n} selected</b><span class="sp"></span>
      <button class="btn sm" id="fmdl"><i class="i i-download"></i> Download</button>
      ${FM.folders.size === 0 ? `<button class="btn sm sec" id="fmcp" title="Copy the public link${FM.files.size > 1 ? 's' : ''} — no login needed to open"><i class="i i-link"></i> Copy link${FM.files.size > 1 ? 's' : ''}</button><button class="btn sm ok" id="fmwa"><i class="i i-chat"></i> Share on WhatsApp</button>` : ''}
      ${w && n === 1 ? '<button class="btn sm sec" id="fmrn"><i class="i i-pencil"></i> Rename</button>' : ''}
      ${w ? '<button class="btn sm sec" id="fmmv"><i class="i i-folder"></i> Move</button><button class="btn sm bad" id="fmrm"><i class="i i-trash"></i> Delete</button>' : ''}
      <button class="btn sm sec" id="fmclr">Clear</button>`;
    const fl = [...FM.files], fo = [...FM.folders];
    $('#fmclr').onclick = () => { clearSel(); draw(); };
    $('#fmdl').onclick = () => {
      const inside = new Set(fo.map(Number)); let grew = true;
      while (grew) { grew = false; folders.forEach(f => { if (!inside.has(+f.id) && inside.has(+f.parent_id)) { inside.add(+f.id); grew = true; } }); }
      const pick = items.filter(i => inside.has(+i.folder_id) || (FM.files.has(+i.id) && !inside.has(+i.folder_id)));
      if (!pick.length) { toast('Nothing to download', 1); return; }
      if (pick.reduce((t, i) => t + (+i.size || 0), 0) > 500 * 1048576) { toast('Too much to download at once — select fewer files', 1); return; }
      const url = (fl.length === 1 && !fo.length) ? `api.php?m=folder&a=get&id=${fl[0]}&dl=1` : `api.php?m=folder&a=zip&files=${fl.join(',')}&folders=${fo.join(',')}`;
      fmDl(url);
    };
    if ($('#fmwa')) $('#fmwa').onclick = () => shareModal(items.filter(i => FM.files.has(+i.id)));
    /* one file: just its link; several: each file name with its link */
    if ($('#fmcp')) $('#fmcp').onclick = () => { const ds = items.filter(i => FM.files.has(+i.id)); if (!ds.length) return;
      copyText(ds.length === 1 ? shareUrl(ds[0]) : ds.map(d => d.file_name + '\n' + shareUrl(d)).join('\n\n'), ds.length === 1 ? 'share link' : ds.length + ' share links'); };
    if ($('#fmrn')) $('#fmrn').onclick = () => {
      const isF = fo.length === 1, it = isF ? folders.find(f => +f.id === fo[0]) : items.find(i => +i.id === fl[0]); if (!it) return;
      const m = modal(`<h2 style="margin-top:0">Rename ${isF ? 'folder' : 'file'}</h2><input id="fmrnv" value="${esc(isF ? it.name : it.file_name)}">${isF ? '' : '<p class="mut" style="font-size:12px;margin:6px 0 0">The file type stays the same.</p>'}
        <div class="bar" style="margin-top:12px"><button class="btn" id="fmrnok">Rename</button><button class="btn sec" id="fmrnx">Cancel</button></div>`);
      const inp = $('#fmrnv', m); inp.focus(); inp.select(); $('#fmrnx', m).onclick = () => m.remove();
      const go = async () => { const v = inp.value.trim(); if (!v) return; try { await api('folder', isF ? 'folder_rename' : 'rename', { id: it.id, name: v }); m.remove(); clearSel(); reload(); } catch (e) { } };
      $('#fmrnok', m).onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
    };
    if ($('#fmmv')) $('#fmmv').onclick = () => moveDialog();
    if ($('#fmrm')) $('#fmrm').onclick = async () => {
      if (!confirm(`Delete ${n} item${n === 1 ? '' : 's'}${fo.length ? ' (folders include everything inside them)' : ''}?\n\nThey go to the Recycle bin for 72 hours, then are removed. Share links already sent stop working.`)) return;
      try { await api('folder', 'delete', { files: fl, folders: fo }); clearSel(); toast('Moved to the Recycle bin'); reload(); } catch (e) { }
    };
  };
  const moveDialog = () => {
    const fl = [...FM.files], fo = [...FM.folders];
    const barred = new Set(fo.map(Number)); let grew = true;
    while (grew) { grew = false; folders.forEach(f => { if (!barred.has(+f.id) && barred.has(+f.parent_id)) { barred.add(+f.id); grew = true; } }); }
    const tree = (pid, depth) => folders.filter(f => (+f.parent_id || 0) === pid && !barred.has(+f.id)).sort((a, b) => a.name.localeCompare(b.name)).map(f => `<label class="fm-pick" style="padding-left:${10 + depth * 18}px"><input type="radio" name="fmto" value="${f.id}"><i class="i i-folder"></i> ${esc(f.name)}</label>${tree(+f.id, depth + 1)}`).join('');
    const m = modal(`<h2 style="margin-top:0">Move ${fl.length + fo.length} item${fl.length + fo.length === 1 ? '' : 's'} to…</h2>
      <div class="fm-picks"><label class="fm-pick"><input type="radio" name="fmto" value="0" checked><i class="i i-folder"></i> Folder (top level)</label>${tree(0, 1)}</div>
      <div class="bar" style="margin-top:12px"><button class="btn" id="fmmvok">Move here</button><button class="btn sec" id="fmmvx">Cancel</button></div>`);
    $('#fmmvx', m).onclick = () => m.remove();
    $('#fmmvok', m).onclick = async () => { const to = +$('input[name=fmto]:checked', m).value; try { await api('folder', 'move', { files: fl, folders: fo, to: to || null }); m.remove(); clearSel(); toast('Moved'); reload(); } catch (e) { } };
  };
  const upload = async list => {
    list = [...list]; if (!list.length) return;
    const st = document.createElement('div'); st.className = 'fm-prog'; document.body.appendChild(st);
    let ok = 0, bad = 0, done = 0;
    for (const f of list) {
      done++; st.textContent = `Uploading ${done} of ${list.length}…`;
      if (f.size > 25 * 1048576) { alert(f.name + ' is larger than 25 MB.'); bad++; continue; }
      if (files.some(x => x.file_name.toLowerCase() === f.name.toLowerCase()) && !confirm(`Replace ${f.name} with the new version? The old one goes to the Recycle bin, and links already sent for it stop working.`)) continue;
      const fd = new FormData(); fd.append('file', f); fd.append('folder_id', cur ? String(cur) : '');
      try { await api('folder', 'upload', fd); ok++; } catch (e) { bad++; }
    }
    st.remove();
    if (ok || bad) toast((ok ? ok + ' uploaded' : '') + (ok && bad ? ' · ' : '') + (bad ? bad + ' failed' : ''), !ok);
    reload();
  };
  $('#fmq').oninput = e => { FM.q = e.target.value; draw(); };
  const goTo = id => { location.hash = id ? '#/folder/' + id : '#/folder'; };
  $('#fmback').onclick = () => { if (FM.pos > 0) goTo(H[FM.pos - 1]); };
  $('#fmfwd').onclick = () => { if (FM.pos < H.length - 1) goTo(H[FM.pos + 1]); };
  $('#fmupl').onclick = () => { if (cur) goTo(+(folders.find(f => +f.id === cur) || {}).parent_id || 0); };
  /* list / grid: click selects + previews (a tap opens on phones), double-click or Enter opens; checkboxes and path links work as before */
  const lbox = $('#fmlist'), hit = e => e.target.closest('.fm-ck, a') ? null : e.target.closest('[data-k]');
  lbox.onclick = e => { const el = hit(e); if (!el) return; if (fmNarrow()) openKey(el.dataset.k); else pick(el.dataset.k, e); };
  lbox.ondblclick = e => { const el = hit(e); if (el && !fmNarrow()) openKey(el.dataset.k); };
  lbox.onkeydown = e => {
    const el = e.target.closest('[data-k]'); if (!el || e.target !== el) return; /* only when the row itself has focus, not its checkbox */
    const k = el.dataset.k, i = order.indexOf(k);
    if (e.key === 'Enter') { e.preventDefault(); openKey(k); }
    else if (e.key === ' ') { e.preventDefault(); pick(k, { ctrlKey: true }); }
    else if (e.key === 'Escape') { if (FM.focus) closePv(); }
    else if (/^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
      const j = i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1), nx = order[j] && $(`[data-k="${order[j]}"]`, lbox); if (!nx) return;
      e.preventDefault(); nx.focus(); pick(order[j], { shiftKey: e.shiftKey });
    }
  };
  $('#fmsort').onchange = e => { FM.sort = e.target.value; fmSave('fmSort', FM.sort); draw(); };
  $$('.fm-seg button').forEach(b => b.onclick = () => { FM.view = b.dataset.v; fmSave('fmView', FM.view); $$('.fm-seg button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  FMUP = w ? upload : null;
  if (w) {
    $('#fmup').onclick = () => $('#fmfile').click();
    $('#fmfile').onchange = e => { const l = [...e.target.files]; e.target.value = ''; upload(l); };
    $('#fmnew').onclick = () => {
      const m = modal(`<h2 style="margin-top:0">New folder</h2><input id="fmnn" placeholder="Folder name"><div class="bar" style="margin-top:12px"><button class="btn" id="fmnok">Create</button><button class="btn sec" id="fmnx">Cancel</button></div>`);
      const inp = $('#fmnn', m); inp.focus(); $('#fmnx', m).onclick = () => m.remove();
      const go = async () => { const v = inp.value.trim(); if (!v) return; try { await api('folder', 'folder_new', { parent_id: cur || null, name: v }); m.remove(); reload(); } catch (e) { } };
      $('#fmnok', m).onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
    };
    const fm = $('#fm'), dz = $('#fmdrop'); let dn = 0;
    const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    fm.ondragenter = e => { if (!hasFiles(e)) return; e.preventDefault(); dn++; dz.classList.remove('hide'); };
    fm.ondragover = e => { if (hasFiles(e)) e.preventDefault(); };
    fm.ondragleave = e => { if (!hasFiles(e)) return; if (--dn <= 0) { dn = 0; dz.classList.add('hide'); } };
  }
  draw(); preview();
}

async function shareModal(list) {
  list = list.filter(Boolean); if (!list.length) return;
  const [cs, ls] = await Promise.all([canR('customers') ? list_('customers') : [], canR('leads') ? list_('leads') : []]);
  const contacts = cs.map(c => ({ ...c, type: 'customer' })).concat(ls.filter(l => !l.customer_id).map(l => ({ ...l, type: 'lead' }))).filter(c => c.phone);
  const compose = name => `Hello${name ? ' ' + name : ''}, as requested, here ${list.length > 1 ? 'are the product datasheets' : 'is the product datasheet'} from ${S.company.name}:\n\n` +
    list.map((d, i) => `${list.length > 1 ? (i + 1) + '. ' : ''}${d.title}${[d.brand, d.model].filter(Boolean).length ? ' (' + [d.brand, d.model].filter(Boolean).join(' ') + ')' : ''}\n${shareUrl(d)}`).join('\n\n') + '\n\nPlease let us know if you need anything else.';
  const m = modal(`<h2 style="margin-top:0">Share on WhatsApp</h2><p class="mut" style="margin:0 0 6px">${list.map(d => esc(d.title)).join(' · ')}</p>
   <label>Send to (customer / lead) — or type a number</label><input id="sc" list="scl" placeholder="Search name or phone…" autocomplete="off"><datalist id="scl">${contacts.map(c => `<option value="${esc(c.name)} · ${esc(c.phone)}"></option>`).join('')}</datalist>
   <input id="sn" placeholder="Phone number (optional — leave empty to choose the chat in WhatsApp)" style="margin-top:8px" type="tel">
   <label>Message (editable)</label><textarea id="sm" rows="9"></textarea>
   <div class="bar" style="margin-top:12px"><button class="btn ok" id="sgo"><i class="i i-chat"></i> Open WhatsApp</button><button class="btn sec" id="scp">Copy message</button><button class="btn sec" id="scx">Cancel</button></div>
   <p class="mut" style="font-size:12px;margin:6px 0 0">Customers get a private link to each file — no login needed.</p>`);
  let who = null; const sm = $('#sm', m);
  const redo = () => sm.value = compose(who?.name || ''); redo();
  $('#sc', m).oninput = e => { const c = contacts.find(x => `${x.name} · ${x.phone}` === e.target.value); who = c || null; if (c) $('#sn', m).value = c.phone; redo(); };
  $('#scx', m).onclick = () => m.remove();
  $('#scp', m).onclick = async () => { try { await navigator.clipboard.writeText(sm.value); toast('Message copied'); } catch (e) { sm.select(); } };
  $('#sgo', m).onclick = async () => {
    const num = waNum($('#sn', m).value), text = sm.value;
    waLaunch(num, text);
    if (who && canW('whatsapp')) { try { await api('whatsapp', 'log', { customer_id: who.type === 'customer' ? who.id : null, lead_id: who.type === 'lead' ? who.id : null, phone: who.phone, text }); } catch (e) { } }
    m.remove(); FM.files.clear(); FM.folders.clear(); route();
  };
}
const list_ = m => api(m, 'list');
