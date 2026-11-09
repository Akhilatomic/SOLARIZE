// Folder: product datasheets by category, public share links, WhatsApp sharing, admin-controlled availability
let FD = { cat: '', q: '', av: '', sel: new Set() };
const fsize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const baseUrl = () => location.origin + location.pathname.replace(/[^/]*$/, '');
const shareUrl = d => `${baseUrl()}api.php?m=share&t=${d.token}`;
const fext = n => ((n || '').split('.').pop() || '').toUpperCase().slice(0, 4);
function availBadge(d) { return d.available ? `<span class="av on" title="${esc(d.avail_note || 'Available')}"><i></i>Available${d.avail_note ? ' · ' + esc(d.avail_note) : ''}</span>` : `<span class="av off" title="${esc(d.avail_note || 'Currently unavailable')}"><i></i>Unavailable${d.avail_note ? ' · ' + esc(d.avail_note) : ''}</span>`; }

async function pgFolder() {
  const data = await api('folder', 'list'); const cats = data.cats, items = data.items;
  const adm = ME.role === 'admin', w = canW('folder');
  const counts = Object.fromEntries(cats.map(c => [c, items.filter(i => i.category === c).length]));
  const draw = () => {
    const t = FD.q.toLowerCase();
    const rows = items.filter(i => (!FD.cat || i.category === FD.cat) && (!FD.av || String(i.available) === FD.av) && (!t || [i.title, i.brand, i.model, i.notes, i.file_name].join(' ').toLowerCase().includes(t)));
    $('#dsg').innerHTML = rows.map(d => `<div class="dsc ${FD.sel.has(d.id) ? 'sel' : ''} ${d.available ? '' : 'na'}" data-id="${d.id}">
      <div class="dsh"><label class="dsk"><input type="checkbox" data-sel="${d.id}" ${FD.sel.has(d.id) ? 'checked' : ''}></label><div class="dsf">${esc(fext(d.file_name))}</div>
       <div class="dst"><b>${esc(d.title)}</b><div class="mut" style="font-size:13px">${esc([d.brand, d.model].filter(Boolean).join(' · ')) || '&nbsp;'}</div></div></div>
      <div class="dsm">${pill(d.category)} ${availBadge(d)}</div>
      ${d.notes ? `<div class="mut" style="font-size:13px;margin-top:8px">${esc(d.notes)}</div>` : ''}
      <div class="mut" style="font-size:12px;margin-top:8px">${fsize(d.size)} · ${dmy(d.created)}${d.user ? ' · ' + esc(d.user) : ''}</div>
      <div class="dsa"><a class="btn sm" href="api.php?m=folder&a=get&id=${d.id}&dl=1" title="Download"><i class="i i-download"></i> Download</a>
       <button class="btn sm ok" data-wa="${d.id}" title="Share on WhatsApp"><i class="i i-chat"></i> WhatsApp</button>
       <button class="btn sm sec" data-copy="${d.id}" title="Copy share link"><i class="i i-link"></i></button><a class="btn sm sec" href="api.php?m=folder&a=get&id=${d.id}" target="_blank" title="Preview"><i class="i i-eye"></i></a>
       ${w ? `<button class="btn sm sec" data-edit="${d.id}" title="Edit"><i class="i i-pencil"></i></button>` : ''}</div>
      ${adm ? `<label class="sw"><input type="checkbox" data-av="${d.id}" ${d.available ? 'checked' : ''}><span class="swt"></span><span class="swl">${d.available ? 'Available — switch off if out of stock' : 'Unavailable — switch on when back in stock'}</span></label>` : ''}</div>`).join('') || `<div class="card mut" style="grid-column:1/-1;text-align:center;padding:30px">No datasheets here yet.${w ? ' Use <b>Upload</b> to add the first one.' : ''}</div>`;
    $$('[data-sel]').forEach(c => c.onchange = () => { c.checked ? FD.sel.add(+c.dataset.sel) : FD.sel.delete(+c.dataset.sel); c.closest('.dsc').classList.toggle('sel', c.checked); bar(); });
    $$('[data-wa]').forEach(b => b.onclick = () => shareModal([items.find(i => i.id == b.dataset.wa)]));
    $$('[data-copy]').forEach(b => b.onclick = async () => { const d = items.find(i => i.id == b.dataset.copy); try { await navigator.clipboard.writeText(shareUrl(d)); toast('Share link copied'); } catch (e) { prompt('Copy this link', shareUrl(d)); } });
    $$('[data-edit]').forEach(b => b.onclick = () => editModal(items.find(i => i.id == b.dataset.edit), cats));
    $$('[data-av]').forEach(c => c.onchange = async () => { const d = items.find(i => i.id == c.dataset.av); let note = d.avail_note || ''; if (!c.checked) { const n = prompt('Optional note shown with the badge (e.g. "Back in stock next week"):', note); if (n === null) { c.checked = true; return; } note = n; } else note = ''; await api('folder', 'toggle', { id: d.id, available: c.checked, avail_note: note }); route(); });
    bar();
  };
  const bar = () => { const n = FD.sel.size; const b = $('#dsbar'); b.classList.toggle('hide', !n); b.querySelector('b').textContent = n + ' selected'; };
  $('#main').innerHTML = `<div class="bar" style="align-items:flex-start;margin-bottom:6px"><div><h2 style="margin:0;font-size:26px">Folder</h2><div class="mut">Product datasheets — download or share on WhatsApp instantly</div></div><span class="sp"></span>${w ? '<button class="btn" id="dsup"><i class="i i-upload"></i> Upload</button>' : ''}</div>
   <div class="tabs" style="margin-top:12px" id="dstabs"><button data-c="" class="${!FD.cat ? 'on' : ''}">All (${items.length})</button>${cats.map(c => `<button data-c="${esc(c)}" class="${FD.cat === c ? 'on' : ''}">${esc(c)} (${counts[c]})</button>`).join('')}</div>
   <div class="bar"><input id="dsq" placeholder="Search by name, brand, model…" style="max-width:340px" value="${esc(FD.q)}"><select id="dsav"><option value="">All availability</option><option value="1" ${FD.av === '1' ? 'selected' : ''}>Available</option><option value="0" ${FD.av === '0' ? 'selected' : ''}>Unavailable</option></select></div>
   <div id="dsg" class="dsg"></div>
   <div id="dsbar" class="dsbar hide"><b></b><span class="sp"></span><button class="btn sec sm" id="dsclr">Clear</button><button class="btn ok" id="dssh"><i class="i i-chat"></i> Share selected on WhatsApp</button></div>`;
  $$('#dstabs button').forEach(b => b.onclick = () => { FD.cat = b.dataset.c; route(); });
  $('#dsq').oninput = e => { FD.q = e.target.value; draw(); }; $('#dsav').onchange = e => { FD.av = e.target.value; draw(); };
  $('#dsclr').onclick = () => { FD.sel.clear(); draw(); };
  $('#dssh').onclick = () => shareModal(items.filter(i => FD.sel.has(i.id)));
  if ($('#dsup')) $('#dsup').onclick = () => uploadModal(cats);
  draw();
}

function uploadModal(cats) {
  let files = [];
  const m = modal(`<h2 style="margin-top:0">Upload datasheets</h2><div class="two"><div><label>Category</label><select id="uc">${cats.map(c => `<option ${FD.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div><div><label>Brand</label><input id="ub" placeholder="e.g. Waaree, Growatt"></div>
   <div id="utw"><label>Title <span class="mut">(blank = file name)</span></label><input id="ut"></div><div><label>Model</label><input id="um"></div><div class="full"><label>Notes</label><input id="un2" placeholder="e.g. 550 Wp bifacial, DCR"></div></div>
   <div id="drop" class="drop"><i class="i i-upload" style="width:26px;height:26px"></i><div><b>Choose files</b> or drop them here</div><small class="mut">PDF, JPG, PNG, DOC, XLS, ZIP · up to 25 MB each · several files at once</small><input type="file" id="uf" multiple class="hide" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.zip"></div><div id="ul" style="margin-top:8px;font-size:14px"></div>
   <div class="bar" style="margin-top:12px"><button class="btn" id="usv" disabled>Upload</button><button class="btn sec" id="ucx">Cancel</button></div>`);
  const show = () => { $('#ul', m).innerHTML = files.map(f => `<div class="act">${esc(f.name)} <small>${fsize(f.size)}</small></div>`).join(''); $('#usv', m).disabled = !files.length; $('#utw', m).style.opacity = files.length > 1 ? .4 : 1; $('#ut', m).disabled = files.length > 1; };
  const drop = $('#drop', m); drop.onclick = () => $('#uf', m).click(); $('#uf', m).onchange = e => { files = [...e.target.files]; show(); };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('hov'); }; drop.ondragleave = () => drop.classList.remove('hov'); drop.ondrop = e => { e.preventDefault(); drop.classList.remove('hov'); files = [...e.dataTransfer.files]; show(); };
  $('#ucx', m).onclick = () => m.remove();
  $('#usv', m).onclick = async () => {
    const b = $('#usv', m); b.disabled = true; let ok = 0;
    for (const [i, f] of files.entries()) {
      b.textContent = `Uploading ${i + 1}/${files.length}…`;
      const fd = new FormData(); fd.append('file', f); fd.append('category', $('#uc', m).value); fd.append('brand', $('#ub', m).value); fd.append('model', $('#um', m).value); fd.append('notes', $('#un2', m).value); if (files.length === 1) fd.append('title', $('#ut', m).value);
      try { await api('folder', 'upload', fd); ok++; } catch (e) { break; }
    }
    if (ok) { toast(ok + ' file' + (ok > 1 ? 's' : '') + ' uploaded'); m.remove(); route(); } else { b.disabled = false; b.textContent = 'Upload'; }
  };
}

function editModal(d, cats) {
  const adm = ME.role === 'admin';
  const m = modal(`<h2 style="margin-top:0">Edit datasheet</h2><div class="two"><div class="full"><label>Title</label><input id="et" value="${esc(d.title)}"></div><div><label>Category</label><select id="ec">${cats.map(c => `<option ${d.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div><div><label>Brand</label><input id="eb" value="${esc(d.brand)}"></div>
   <div><label>Model</label><input id="em" value="${esc(d.model)}"></div><div><label>Notes</label><input id="en" value="${esc(d.notes)}"></div>
   ${adm ? `<div class="full"><label>Availability note (shown on the badge, optional)</label><input id="ea" value="${esc(d.avail_note)}" placeholder="e.g. 20 units in stock"></div>` : ''}</div>
   <p class="mut" style="font-size:12px;margin:10px 0 0">File: ${esc(d.file_name)} (${fsize(d.size)}). To replace the file, upload a new one and delete this entry.</p>
   <div class="bar" style="margin-top:12px"><button class="btn" id="esv">Save</button><button class="btn sec" id="ecx">Cancel</button><span class="sp"></span><button class="btn bad" id="edl">Delete</button></div>`);
  $('#ecx', m).onclick = () => m.remove();
  $('#esv', m).onclick = async () => { await api('folder', 'save', { id: d.id, title: $('#et', m).value, category: $('#ec', m).value, brand: $('#eb', m).value, model: $('#em', m).value, notes: $('#en', m).value }); if (adm && $('#ea', m).value !== (d.avail_note || '')) await api('folder', 'toggle', { id: d.id, available: d.available, avail_note: $('#ea', m).value }); m.remove(); route(); };
  $('#edl', m).onclick = async () => { if (confirm('Delete this datasheet? Any share links already sent will stop working.')) { await api('folder', 'delete', { id: d.id }); FD.sel.delete(d.id); m.remove(); route(); } };
}

async function shareModal(list) {
  list = list.filter(Boolean); if (!list.length) return;
  const [cs, ls] = await Promise.all([canR('customers') ? list_('customers') : [], canR('leads') ? list_('leads') : []]);
  const contacts = cs.map(c => ({ ...c, type: 'customer' })).concat(ls.filter(l => !l.customer_id).map(l => ({ ...l, type: 'lead' }))).filter(c => c.phone);
  const compose = (name, incl) => `Hello${name ? ' ' + name : ''}, as requested, here ${list.length > 1 ? 'are the product datasheets' : 'is the product datasheet'} from ${S.company.name}:\n\n` +
    list.map((d, i) => `${list.length > 1 ? (i + 1) + '. ' : ''}${d.title}${[d.brand, d.model].filter(Boolean).length ? ' (' + [d.brand, d.model].filter(Boolean).join(' ') + ')' : ''}${incl ? (d.available ? ' - In stock' : ' - Currently unavailable') + (d.avail_note ? ' (' + d.avail_note + ')' : '') : ''}\n${shareUrl(d)}`).join('\n\n') + '\n\nPlease let us know if you need anything else.';
  const m = modal(`<h2 style="margin-top:0">Share on WhatsApp</h2><p class="mut" style="margin:0 0 6px">${list.map(d => esc(d.title)).join(' · ')}</p>
   <label>Send to (customer / lead) — or type a number</label><input id="sc" list="scl" placeholder="Search name or phone…" autocomplete="off"><datalist id="scl">${contacts.map(c => `<option value="${esc(c.name)} · ${esc(c.phone)}"></option>`).join('')}</datalist>
   <input id="sn" placeholder="Phone number (optional — leave empty to choose the chat in WhatsApp)" style="margin-top:8px" type="tel">
   <label style="display:flex;gap:8px;align-items:center;color:var(--tx);font-size:14px;margin-top:10px"><input type="checkbox" id="sa" style="width:auto" checked> Include availability in the message</label>
   <label>Message (editable)</label><textarea id="sm" rows="9"></textarea>
   <div class="bar" style="margin-top:12px"><button class="btn ok" id="sgo"><i class="i i-chat"></i> Open WhatsApp</button><button class="btn sec" id="scp">Copy message</button><button class="btn sec" id="scx">Cancel</button></div>
   <p class="mut" style="font-size:12px;margin:6px 0 0">Customers get a private link to each file — no login needed.</p>`);
  let who = null; const sm = $('#sm', m);
  const redo = () => sm.value = compose(who?.name || '', $('#sa', m).checked); redo();
  $('#sa', m).onchange = redo;
  $('#sc', m).oninput = e => { const c = contacts.find(x => `${x.name} · ${x.phone}` === e.target.value); who = c || null; if (c) $('#sn', m).value = c.phone; redo(); };
  $('#scx', m).onclick = () => m.remove();
  $('#scp', m).onclick = async () => { try { await navigator.clipboard.writeText(sm.value); toast('Message copied'); } catch (e) { sm.select(); } };
  $('#sgo', m).onclick = async () => {
    const num = waNum($('#sn', m).value), text = sm.value;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank');
    if (who && canW('whatsapp')) { try { await api('whatsapp', 'log', { customer_id: who.type === 'customer' ? who.id : null, lead_id: who.type === 'lead' ? who.id : null, phone: who.phone, text }); } catch (e) { } }
    m.remove(); FD.sel.clear(); route();
  };
}
const list_ = m => api(m, 'list');
