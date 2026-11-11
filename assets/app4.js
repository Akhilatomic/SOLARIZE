// Folder: file manager (nested folders, upload/drag-drop, move/delete/zip), public share links, WhatsApp sharing
/* File drags anywhere on the Folder page: stop the browser opening the file; writers upload into the current folder. Bound once. */
let FMUP = null, FMDOC = false;
function fmDocDrag() {
  if (FMDOC) return; FMDOC = true;
  const hf = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  document.addEventListener('dragover', e => { if ($('#fm') && hf(e)) e.preventDefault(); });
  document.addEventListener('drop', e => { if (!$('#fm') || !hf(e)) return; e.preventDefault(); const dz = $('#fmdrop'); if (dz) dz.classList.add('hide'); if (FMUP) FMUP(e.dataTransfer.files); else toast("You can't upload here", 1); });
}
let FM = { q: '', cur: 0, files: new Set(), folders: new Set() };
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
  if (FM.cur !== cur) { FM.files.clear(); FM.folders.clear(); FM.q = ""; FM.cur = cur; }
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
   <div class="fm-top">${crumbHtml}<input id="fmq" type="search" placeholder="Search all folders…" value="${esc(FM.q)}"></div>
   <div id="fmlist" class="fm-list"></div>
   <div id="fmdrop" class="fm-drop hide"><i class="i i-upload"></i><div>Drop files to upload into <b>${esc(crumbs.length ? crumbs[crumbs.length - 1].name : 'Folder')}</b></div></div>
   <div id="fmbar" class="fm-bar hide"></div></div>`;
  fmDocDrag(); FMUP = null;
  const reload = () => route();
  const clearSel = () => { FM.files.clear(); FM.folders.clear(); };
  const draw = () => {
    const r = rowsNow(), box = $('#fmlist');
    const fileRow = d => `<div class="fm-row ${FM.files.has(+d.id) ? 'sel' : ''}"><label class="fm-ck"><input type="checkbox" data-f="${d.id}" ${FM.files.has(+d.id) ? 'checked' : ''}></label>
      <div class="fm-ic"><span class="fm-ty">${esc(fext(d.file_name))}</span></div>
      <div class="fm-nm"><a href="api.php?m=folder&a=get&id=${d.id}" target="_blank" rel="noopener">${esc(d.file_name)}</a>${r.s ? `<small><a href="#/folder/${+d.folder_id || ''}">${esc(fmPathText(folders, d.folder_id))}</a></small>` : ''}</div>
      <div class="fm-sz">${fsize(d.size)}</div><div class="fm-dt">${dmy(d.updated || d.created)}</div><div class="fm-by">${esc(d.user || '')}</div></div>`;
    const folderRow = f => { const n = folders.filter(x => +x.parent_id === +f.id).length + items.filter(x => +x.folder_id === +f.id).length; return `<div class="fm-row ${FM.folders.has(+f.id) ? 'sel' : ''}"><label class="fm-ck"><input type="checkbox" data-d="${f.id}" ${FM.folders.has(+f.id) ? 'checked' : ''}></label>
      <div class="fm-ic"><i class="i i-folder"></i></div>
      <div class="fm-nm"><a href="#/folder/${f.id}"><b>${esc(f.name)}</b></a>${r.s ? `<small>${esc(fmPathText(folders, f.parent_id))}</small>` : ''}</div>
      <div class="fm-sz">${n} item${n === 1 ? '' : 's'}</div><div class="fm-dt">${dmy(f.created)}</div><div class="fm-by">${esc(f.user || '')}</div></div>`; };
    const all = r.fo.length + r.fi.length, ticked = r.fo.filter(f => FM.folders.has(+f.id)).length + r.fi.filter(i => FM.files.has(+i.id)).length;
    box.innerHTML = all ? `<div class="fm-row fm-hd"><label class="fm-ck"><input type="checkbox" id="fmall" ${ticked === all ? 'checked' : ''}></label><div class="fm-ic"></div><div class="fm-nm">Name</div><div class="fm-sz">Size</div><div class="fm-dt">Modified</div><div class="fm-by">By</div></div>`
      + r.fo.map(folderRow).join('') + r.fi.map(fileRow).join('')
      : `<div class="fm-empty">${r.s ? 'Nothing matches your search.' : 'This folder is empty.' + (w ? '<br><span class="mut">Drop files here or use Upload.</span>' : '')}</div>`;
    $$('[data-f]', box).forEach(c => c.onchange = () => { c.checked ? FM.files.add(+c.dataset.f) : FM.files.delete(+c.dataset.f); draw(); });
    $$('[data-d]', box).forEach(c => c.onchange = () => { c.checked ? FM.folders.add(+c.dataset.d) : FM.folders.delete(+c.dataset.d); draw(); });
    const sa = $('#fmall', box); if (sa) sa.onchange = () => { r.fo.forEach(f => sa.checked ? FM.folders.add(+f.id) : FM.folders.delete(+f.id)); r.fi.forEach(i => sa.checked ? FM.files.add(+i.id) : FM.files.delete(+i.id)); draw(); };
    bar();
  };
  const bar = () => {
    const b = $('#fmbar'), n = nsel(); b.classList.toggle('hide', !n); if (!n) { b.innerHTML = ''; return; }
    b.innerHTML = `<b>${n} selected</b><span class="sp"></span>
      <button class="btn sm" id="fmdl"><i class="i i-download"></i> Download</button>
      ${FM.folders.size === 0 ? '<button class="btn sm ok" id="fmwa"><i class="i i-chat"></i> Share on WhatsApp</button>' : ''}
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
      const fr = document.createElement('iframe'); fr.style.display = 'none'; fr.src = url; document.body.appendChild(fr); setTimeout(() => fr.remove(), 120000);
    };
    if ($('#fmwa')) $('#fmwa').onclick = () => shareModal(items.filter(i => FM.files.has(+i.id)));
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
  draw();
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
