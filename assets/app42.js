// Site survey — the first stage of a project: who visits the site, site photos, confirmed products & structure, site plan (api/survey.php).
const SV = { tab: 'open' };
const SV_ST = { 'To visit': 'y', 'In progress': 'b', Done: 'g' };
const svDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
const svImg = (id, dl) => `api.php?m=survey&a=img&id=${+id}${dl ? '&dl=1' : ''}`;

// "Add to site survey" window, opened from a lead's or a customer's action menu. who = { lead_id | customer_id, name }
async function svAddBox(who) {
  let b; try { b = await api('survey', 'boot'); } catch (e) { return; }
  const m = modal(`<div class="lvm">
   <div class="lvh"><span class="lvi"><i class="i i-pin"></i></span><div><h2>Add to site survey</h2><small>${esc(who.name || '')}</small></div><button class="lvx" id="svx" title="Close"><i class="i i-x"></i></button></div>
   <div class="lvb">
    <div><label>Site survey by</label><select id="svu">${b.users.map(u => `<option value="${u.id}" ${u.id == b.default_user ? 'selected' : ''}>${esc(u.name)}${u.id == ME.id ? ' (me)' : ''}</option>`).join('')}</select></div>
    <div><label>Planned visit date <span class="mut" style="font-weight:400">· optional</span></label><input type="date" id="svd"></div>
    <div><label>Note for the surveyor <span class="mut" style="font-weight:400">· optional</span></label><textarea id="svn" rows="2" placeholder="Landmark, best time to visit, what to check…"></textarea></div>
   </div>
   <div class="lvf"><button class="btn sec" id="svc">Cancel</button><button class="btn" id="svs">Add to site survey</button></div></div>`);
  m.classList.add('lvmod');
  $('#svx', m).onclick = $('#svc', m).onclick = () => m.remove();
  $('#svs', m).onclick = async () => { const btn = $('#svs', m); btn.disabled = true;
    try { const r = await api('survey', 'add', { lead_id: who.lead_id || 0, customer_id: who.customer_id || 0, assigned_to: +$('#svu', m).value, visit_date: $('#svd', m).value, note: $('#svn', m).value });
      m.remove(); toast(r.new ? 'Added to site survey' : 'Already on the survey list · handed to the person you chose', false, () => location.hash = '#/survey/' + r.id); }
    catch (e) { btn.disabled = false; } };
}

// ---------- list ----------
async function pgSurveys() {
  const d = await api('survey', 'list'), rows = d.rows, open = rows.filter(r => r.status !== 'Done'), mine = open.filter(r => r.assigned_to == ME.id);
  const show = SV.tab === 'done' ? rows.filter(r => r.status === 'Done') : SV.tab === 'mine' ? mine : SV.tab === 'all' ? rows : open;
  $('#main').innerHTML = `<div class="bar" style="align-items:flex-start;margin-bottom:10px"><div><h2 style="margin:0;font-size:26px">Site survey</h2><div class="mut">First stage of a project: site photos, products and structure, site plan. Add a lead or customer from its action menu.</div></div><span class="sp"></span>
    <button class="btn sec" id="svblank" title="A blank site survey form to print: fill it on paper at the site, then enter the details here"><i class="i i-download"></i> Blank form (PDF)</button>
    <div class="tabs" style="margin:0">${[['open', `To do (${open.length})`], ...(d.all ? [['mine', `Mine (${mine.length})`]] : []), ['done', 'Done'], ['all', 'All']].map(([k, l]) => `<button data-svt="${k}" class="${SV.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
   <div class="card tw" style="padding:0"><table id="svt"><thead><tr><th>Name</th><th>Place</th><th>Survey by</th><th>Visit</th><th>Status</th><th class="num">Files</th></tr></thead><tbody>
   ${show.map(r => `<tr data-sv="${r.id}" style="cursor:pointer"><td><b>${esc(r.name || '—')}</b> ${r.lead_id ? '<span class="pill b">Lead</span>' : ''}${r.stage ? ` <span class="pill" title="Pipeline stage">${esc(r.stage)}</span>` : ''}<br><small class="mut">${esc(r.phone || '')}</small></td><td>${esc(r.place || '—')}${r.note ? `<br><small class="mut">${esc(r.note)}</small>` : ''}</td>
     <td>${esc(r.assigned_name || '—')}</td><td>${r.visit_date ? `<span class="${r.status !== 'Done' && r.visit_date < today() ? 'over' : ''}">${svDate(r.visit_date)}</span>` : '<span class="mut">Not set</span>'}</td><td>${pill(r.status, SV_ST[r.status])}</td><td class="num">${r.files || ''}</td></tr>`).join('') || `<tr><td colspan="6" class="mut">${SV.tab === 'done' ? 'No finished surveys yet' : 'Nothing to survey. Open a lead or customer’s action menu and choose “Add to site survey”.'}</td></tr>`}</tbody></table></div>`;
  $$('[data-svt]').forEach(b => b.onclick = () => { SV.tab = b.dataset.svt; pgSurveys(); });
  $('#svblank').onclick = e => svFormDownload(null, e.currentTarget);
  $$('[data-sv]').forEach(tr => tr.onclick = () => location.hash = '#/survey/' + tr.dataset.sv);
}

// ---------- one survey ----------
// phone photos are made smaller before sending (longest side 2000 px) so they upload quickly on site
async function svShrink(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 700000) return file;
  try { const bmp = await createImageBitmap(file), k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height)); if (k === 1 && file.size < 3000000) return file;
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .85)); return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file; } catch (e) { return file; }
}
async function pgSurvey(id) {
  let d; try { d = await api('survey', 'get', undefined, '&id=' + (+id)); } catch (e) { $('#main').innerHTML = '<p class="mut">This site survey could not be opened. <a href="#/survey">Back to the list</a></p>'; return; }
  const s = d.survey, t = d.target, done = s.status === 'Done', ed = !!d.can_edit && !done, P = d.products || {};
  const files = k => d.files.filter(f => f.slot === k), isPdf = f => /\.pdf$/i.test(f.name);
  const fld = (g, k, l, o = {}) => `<div${o.full ? ' class="full"' : o.wide ? ' class="wide"' : ''}><label>${l}</label>${o.area ? `<textarea data-g="${g}" data-k="${k}" rows="2" ${ed ? '' : 'disabled'}>${esc(d[g][k] || '')}</textarea>` : `<input data-g="${g}" data-k="${k}" value="${esc(d[g][k] || '')}" ${o.n ? 'inputmode="decimal"' : ''} ${o.date ? 'type="date"' : ''} ${o.list ? `list="svl-${k}"` : ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${ed ? '' : 'disabled'}>`}${o.list ? `<datalist id="svl-${k}">${o.list.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}</div>`;
  const thumbs = k => files(k).map(f => `<div class="sv-ph">${isPdf(f) ? `<a class="sv-pdf" href="${svImg(f.id)}" target="_blank" title="${esc(f.name)}"><i class="i i-file"></i><span>${esc(f.name)}</span></a>` : `<a href="${svImg(f.id)}" target="_blank" title="${esc(f.name)} · ${esc(f.user || '')}"><img loading="lazy" src="${svImg(f.id)}" alt="${esc(d.slots[k])}"></a>`}${ed ? `<button class="sv-del" data-svdel="${f.id}" title="Delete"><i class="i i-x"></i></button>` : ''}</div>`).join('');
  /* The page: a header card (who, where, who surveys and when), a strip with the four steps and how far each is, then the steps.
     A step's number turns green when it is complete: the three photo sets, products confirmed, plan uploaded, every site detail filled. */
  const req = ['roof', 'inverter', 'earth'];
  const slot = (k, hint) => { const fs = files(k); return `<div class="sv-slot"><div class="sv-ch"><h4>${esc(d.slots[k])}${req.includes(k) ? '' : ' <small class="mut">optional</small>'}</h4>${fs.length ? `<span class="sv-n">${fs.length}</span>` : ''}${ed && fs.length ? `<button class="btn sec sm" data-svup="${k}"><i class="i i-plus"></i> Add</button>` : ''}</div>
     ${fs.length ? `<div class="sv-grid">${thumbs(k)}</div>` : ed ? `<button type="button" class="sv-drop" data-svup="${k}"><i class="i i-plus"></i><b>Add photo</b><span>${hint}</span></button>` : '<div class="sv-empty">No photo was added.</div>'}</div>`; };
  const sec = (n, title, body) => `<section class="sv-sec" id="svs${n}"><div class="sv-sh"><span class="sv-no">${n}</span><h3>${title}</h3><span class="sv-st" data-svst="${n}"></span></div>${body}</section>`;
  const plan = files('plan'), L = typeof LS_OPTS !== 'undefined' ? LS_OPTS : {}, site = typeof LS_SITE !== 'undefined' ? LS_SITE : [];
  const STEPS = ['Site photos', 'Products and structure', 'Site plan', 'Site details'];
  $('#main').innerHTML = `<div class="card sv-head">
     <div class="sv-hl"><a class="sv-back" href="#/survey"><i class="i i-chev"></i> Site survey</a>
      <h2>${esc(t.name)} ${pill(s.status, SV_ST[s.status])}</h2>
      <div class="sv-meta"><span>${t.kind === 'lead' ? 'Lead' : 'Customer'}</span>${t.phone ? `<a href="tel:${esc(String(t.phone).replace(/[^\d+]/g, ''))}"><i class="i i-phone"></i>${esc(t.phone)}</a>` : ''}${t.place ? `<span><i class="i i-pin"></i>${esc(t.place)}</span>` : ''}${d.project ? `<a href="#/projects/${+d.project.id}" title="Pipeline stage"><i class="i i-project"></i>${esc(d.project.stage)}</a>` : ''}<a href="#/${t.kind === 'lead' ? 'leads' : 'customers/' + t.id}">${t.kind === 'lead' ? 'Open leads' : 'Open customer'}</a></div>
      ${s.note ? `<div class="sv-note">${esc(s.note)}</div>` : ''}</div>
     <div class="sv-hr"><div class="sv-ctl"><div><label>Survey by</label>${d.can_assign && !done ? `<select id="svby">${d.users.map(u => `<option value="${u.id}" ${u.id == s.assigned_to ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>` : `<b class="sv-by">${esc(s.assigned_name || '—')}</b>`}</div>
      <div><label>Visit date</label><input type="date" id="svvd" value="${esc(s.visit_date || '')}" ${ed ? '' : 'disabled'}></div></div>
      <button class="btn sec" id="svpdf" title="This survey as a paper form: name, place and what is already entered are printed in, the rest is filled by hand at the site"><i class="i i-download"></i> Paper form (PDF)</button></div></div>
   ${done ? `<div class="sv-done"><i class="i i-check"></i> Survey marked done${s.done_at ? ' on ' + dmy(s.done_at.slice(0, 10)) : ''}.${d.can_edit ? ' <button class="btn sec sm" id="svre">Reopen</button>' : ''}</div>` : ''}
   <nav class="sv-nav" aria-label="Survey steps">${STEPS.map((x, i) => `<button type="button" data-svgo="${i + 1}"><span class="sv-no">${i + 1}</span><span class="sv-nt"><b>${x}</b><small data-svnv="${i + 1}"></small></span></button>`).join('')}</nav>
   ${sec(1, 'Site photos', `<div class="sv-slots">${slot('roof', 'Whole roof from two or three sides, and any shade from trees, tanks or buildings.')}${slot('inverter', 'The wall for the inverter and DB boxes, and the route to the meter.')}${slot('earth', 'Where the earth pits will be dug, and the existing earthing if any.')}${slot('other', 'Meter board, KSEB pole, roof access, anything else worth keeping.')}</div>`)}
   ${sec(2, 'Products and structure', `<div class="card">
     <div class="sv-sub">System</div><div class="fg sv-fg">${fld('plant', 'system_type', 'System type', { list: L.system_type })}${fld('plant', 'capacity', 'Capacity (kWp)', { n: 1 })}</div>
     <div class="sv-sub">Panels</div><div class="fg sv-fg">${fld('plant', 'panel_make', 'Panel', { list: P.Panels || [], ph: 'Make and model', wide: 1 })}${fld('plant', 'panel_wattage', 'Panel wattage (W)', { n: 1 })}${fld('plant', 'panel_count', 'Number of panels', { n: 1 })}</div>
     <div class="sv-sub">Inverter</div><div class="fg sv-fg">${fld('plant', 'inverter_make', 'Inverter', { list: P.Inverter || [], ph: 'Make and model', wide: 1 })}${fld('plant', 'inverter_capacity', 'Inverter capacity (kW)', { n: 1 })}${fld('plant', 'inverter_count', 'Number of inverters', { n: 1 })}</div>
     <div class="sv-sub">Structure</div><div class="fg sv-fg">${fld('plant', 'structure_type', 'Structure type', { list: [...new Set([...(L.structure_type || []), ...(P.Structure || [])])] })}${fld('plant', 'structure_material', 'Structure material / height', { ph: 'e.g. HDG, 2 m front leg', wide: 1 })}
     ${fld('plant', 'plant_remarks', 'Remarks', { area: 1, full: 1 })}</div>
     <label class="sv-ok${s.confirmed ? ' on' : ''}"><input type="checkbox" id="svok" ${s.confirmed ? 'checked' : ''} ${ed ? '' : 'disabled'}> <span><b>Products and structure type confirmed with the customer</b>${s.confirmed && s.confirmed_by ? `<small class="mut"> · ${esc(s.confirmed_by)}, ${esc(s.confirmed_at)}</small>` : ''}</span></label></div>`)}
   ${sec(3, 'Site plan for panel arrangement', `<div class="card"><div class="sv-ch"><h4>Plan drawing <small class="mut">sketch photo, image or PDF</small></h4>${ed && plan.length ? '<button class="btn sec sm" data-svup="plan"><i class="i i-upload"></i> Upload another</button>' : ''}</div>
     ${plan.length ? plan.map(f => `<div class="sv-plan">${isPdf(f) ? `<a class="sv-pdf" href="${svImg(f.id)}" target="_blank"><i class="i i-file"></i><span>${esc(f.name)} — open PDF</span></a>` : `<a href="${svImg(f.id)}" target="_blank" title="Open full size"><img src="${svImg(f.id)}" alt="Site plan"></a>`}${ed ? `<button class="sv-del" data-svdel="${f.id}" title="Delete"><i class="i i-x"></i></button>` : ''}</div>`).join('')
       : ed ? '<button type="button" class="sv-drop sv-dropw" data-svup="plan"><i class="i i-upload"></i><b>Upload the plan</b><span>The roof sketch with the panel positions: roof outline with measurements, panels numbered, walkways, tanks and other obstacles, north direction.</span></button>' : '<div class="sv-empty">No plan drawing was uploaded.</div>'}
     <div class="fg sv-fg" style="margin-top:14px">${fld('plan', 'plan_panels', 'Panels in the plan', { n: 1 })}${fld('plan', 'plan_rows', 'Rows', { ph: 'e.g. 7 + 4 + 5' })}${fld('plan', 'plan_orient', 'Panel direction', { list: ['Portrait', 'Landscape', 'Mixed'] })}
     ${fld('plan', 'plan_size', 'Panel size (mm)', { ph: 'e.g. 2382 × 1138' })}${fld('plan', 'plan_gap', 'Gap between panels', { ph: 'e.g. 3 cm' })}${fld('plan', 'plan_facing', 'Panels face', { list: L.orientation })}${fld('plan', 'plan_note', 'Plan notes', { area: 1, full: 1 })}</div></div>`)}
   ${sec(4, 'Site details', `<div class="card">${site.map(([title, fs]) => `<div class="sv-sub">${esc(title)}</div><div class="fg sv-fg">${fs.map(([k, l, ty]) => fld('site', k, l, { n: ty === 'n', date: ty === 'date', list: L[k] })).join('')}</div>`).join('')}
     <div class="fg sv-fg">${fld('site', 'site_remarks', 'Site remarks', { area: 1, full: 1 })}</div></div>`)}
   ${d.can_edit && !done ? `<div class="sv-bar"><span class="mut" id="svmsg"></span><span class="sp"></span><button class="btn sec" id="svsave">Save</button><button class="btn ok" id="svdone"><i class="i i-check"></i> Save and mark survey done</button></div>` : ''}`;

  /* how far each step is: shown in the strip and beside each step's title, and kept in step while typing */
  const stat = () => { const n = g => $$(`#main [data-g="${g}"]`), fill = g => n(g).filter(i => i.value.trim()).length, ph = req.filter(k => files(k).length).length, okc = $('#svok').checked;
    [[ph === req.length, `${ph} of ${req.length} photo sets`], [okc, okc ? 'Confirmed with the customer' : `Not confirmed yet, ${fill('plant')} of ${n('plant').length} filled`],
     [plan.length > 0, plan.length ? (plan.length === 1 ? 'Plan uploaded' : plan.length + ' plans uploaded') : 'No plan drawing yet'], [fill('site') === n('site').length, `${fill('site')} of ${n('site').length} filled`]]
      .forEach(([ok, text], i) => { const nv = $(`[data-svnv="${i + 1}"]`), st = $(`[data-svst="${i + 1}"]`); if (nv) { nv.textContent = text; nv.closest('button').classList.toggle('svdn', ok); } if (st) { st.textContent = ok ? 'Complete' : text; st.closest('.sv-sec').classList.toggle('svdn', ok); } }); };
  stat(); $$('#main [data-g], #svok').forEach(i => i.addEventListener('input', stat));
  $('#svok').addEventListener('change', e => e.target.closest('.sv-ok').classList.toggle('on', e.target.checked));
  $$('[data-svgo]').forEach(b => b.onclick = () => { const el = $('#svs' + b.dataset.svgo); if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); });

  const grab = g => Object.fromEntries($$(`[data-g="${g}"]`).map(i => [i.dataset.k, i.value]));
  /* the paper form takes what is on the screen now (typed but not saved yet too) */
  $('#svpdf').onclick = e => svFormDownload({ ...d, site: grab('site'), plant: grab('plant'), plan: grab('plan'), survey: { ...s, visit_date: $('#svvd').value, confirmed: $('#svok').checked ? 1 : 0, assigned_name: $('#svby') ? $('#svby').selectedOptions[0].textContent : s.assigned_name } }, e.currentTarget);
  let dirty = false; $$('#main [data-g], #svok').forEach(i => i.addEventListener('input', () => { dirty = true; if ($('#svmsg')) $('#svmsg').textContent = 'Not saved yet'; }));
  const save = async extra => { await api('survey', 'save', { id: s.id, site: grab('site'), plant: grab('plant'), plan: grab('plan'), confirmed: $('#svok').checked ? 1 : 0, visit_date: $('#svvd').value, ...(extra || {}) }); dirty = false; };
  const keep = async () => { if (dirty && ed) { try { await save(); } catch (e) { return false; } } return true; }; /* typed values are saved before the page redraws */
  if ($('#svsave')) $('#svsave').onclick = async e => { e.currentTarget.disabled = true; try { await save(); toast('Survey saved'); pgSurvey(id); } catch (x) { e.currentTarget.disabled = false; } };
  if ($('#svdone')) $('#svdone').onclick = async e => {
    const miss = ['roof', 'inverter', 'earth'].filter(k => !files(k).length).map(k => d.slots[k]).concat(plan.length ? [] : ['Site plan']).concat($('#svok').checked ? [] : ['products not confirmed']);
    if (miss.length && !confirm('Still missing: ' + miss.join(', ') + '.\n\nMark the survey done anyway?')) return;
    e.currentTarget.disabled = true; try { await save({ status: 'Done' }); toast('Site survey marked done'); pgSurvey(id); } catch (x) { e.currentTarget.disabled = false; } };
  if ($('#svre')) $('#svre').onclick = async () => { await api('survey', 'save', { id: s.id, status: 'In progress' }); pgSurvey(id); };
  if ($('#svby')) $('#svby').onchange = async e => { if (!await keep()) return; try { await api('survey', 'save', { id: s.id, assigned_to: +e.target.value }); toast('Survey handed to ' + e.target.selectedOptions[0].textContent); } finally { pgSurvey(id); } };
  if (ed) $('#svvd').onchange = () => { dirty = true; keep().then(ok => ok && toast('Visit date saved')); };
  $$('[data-svup]').forEach(b => b.onclick = () => { const k = b.dataset.svup, i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = k === 'plan' ? 'image/*,.pdf' : 'image/*';
    i.onchange = async () => { const list = [...i.files]; if (!list.length) return; if (!await keep()) return; b.disabled = true; let n = 0;
      for (const f of list) { b.textContent = `Uploading ${n + 1} of ${list.length}…`; try { const fd = new FormData(); fd.append('id', s.id); fd.append('slot', k); fd.append('file', await svShrink(f)); await api('survey', 'upload', fd); n++; } catch (e) { } }
      if (n) toast(n === 1 ? 'Added to ' + d.slots[k] : `${n} files added to ${d.slots[k]}`); pgSurvey(id); };
    i.click(); });
  $$('[data-svdel]').forEach(b => b.onclick = async e => { e.preventDefault(); e.stopPropagation(); if (!confirm('Delete this file? It goes to the Recycle bin.')) return; if (!await keep()) return; await api('survey', 'file_del', { id: +b.dataset.svdel }); pgSurvey(id); });
}
