// Project pipeline v2: 4 step tabs, gated stages (KSEB receipts), stepper on the project page, AMC & service.
const STEPS = [[1, 'Step 1', 'Registration'], [2, 'Step 2', 'Execution'], [3, 'Step 3', 'Closure'], [4, 'Step 4', 'AMC & Service']];
let PIPE = null, PL = { step: 1, q: '', view: 'list' };
const stepOf = label => { const s = (PIPE || []).find(x => x[1] === label); return s ? s[2] : 0; };
const stepCls = label => ({ 1: 'y', 2: 'c', 3: 'g' })[stepOf(label)] || '';
const daysSince = d => d ? Math.max(0, Math.floor((Date.now() - new Date(String(d).replace(' ', 'T') + 'Z')) / 864e5)) : 0;
const addMonths = (ds, n) => { const d = pdate(ds); d.setMonth(d.getMonth() + n); return ymd(d); };
function nextService(p) {
  if (!p.amc_start) return '';
  if (p.svc && p.svc.next_sched) return p.svc.next_sched;
  const base = p.svc && p.svc.last_done ? p.svc.last_done : p.amc_start;
  return p.svc && p.svc.last_done ? addMonths(base, +p.amc_interval || 6) : addMonths(base, +p.amc_interval || 6);
}

async function pgPipeline() {
  const B = await api('pipeline', 'board'); PIPE = B.stages;
  const w = canW('projects'), t = PL.q.toLowerCase();
  const match = p => !t || [p.customer, p.title, p.phone, p.district].join(' ').toLowerCase().includes(t);
  const ps = B.projects.filter(match);
  const done = ps.filter(p => p.stage === 'Project completed');
  const counts = { 1: ps.filter(p => stepOf(p.stage) === 1).length, 2: ps.filter(p => stepOf(p.stage) === 2).length, 3: ps.filter(p => stepOf(p.stage) === 3 && p.stage !== 'Project completed').length, 4: done.length };
  $('#main').innerHTML = `<div class="bar" style="align-items:flex-start;margin-bottom:8px"><div><h2 style="margin:0;font-size:26px">Project pipeline</h2><div class="mut">${B.projects.length} projects · ${B.projects.filter(p => p.stage !== 'Project completed').length} in progress</div></div><span class="sp"></span>
    <input id="plq" placeholder="Search customer, phone…" value="${esc(PL.q)}" style="max-width:260px">${PL.step < 4 ? `<div class="tabs" style="margin:0"><button data-pv="list" class="${PL.view === 'list' ? 'on' : ''}">List</button><button data-pv="board" class="${PL.view === 'board' ? 'on' : ''}">Board</button></div>` : ''}
    ${w ? '<button class="btn" id="pnew"><i class="i i-plus"></i> Start project</button>' : ''}</div>
   <div class="stepper-tabs">${STEPS.map(([n, a, b]) => `<button data-step="${n}" class="${PL.step === n ? 'on' : ''}"><span class="sn">${n}</span><span><b>${b}</b><small>${a} · ${counts[n]} ${n === 4 ? 'completed' : 'active'}</small></span></button>`).join('')}</div>
   <div id="pbody"></div>`;
  $$('[data-step]').forEach(b => b.onclick = () => { PL.step = +b.dataset.step; pgPipeline(); });
  $$('[data-pv]').forEach(b => b.onclick = () => { PL.view = b.dataset.pv; pgPipeline(); });
  $('#plq').oninput = e => { PL.q = e.target.value; clearTimeout(window._plt); window._plt = setTimeout(pgPipeline, 250); };
  if ($('#pnew')) $('#pnew').onclick = () => startModal({});
  const body = $('#pbody');
  if (PL.step === 4) return amcBoard(body, done, B.service_types);
  const cols = PIPE.filter(s => s[2] === PL.step);
  if (PL.view === 'list') {
    const rows = ps.filter(p => stepOf(p.stage) === PL.step);
    body.innerHTML = `<div class="card tw fitbox" style="padding:0"><table id="ptb"><thead><tr><th>Customer</th><th>Project</th><th>Stage</th><th>In stage</th><th>Receipts</th><th>Engineer</th><th class="right">Actions</th></tr></thead><tbody>${rows.map(p => `<tr class="row" data-id="${p.id}"><td><b>${esc(p.customer)}</b><br><small class="mut">${esc(p.phone || '')}</small></td><td>${esc(p.title)}<br><small class="mut">${p.kw} kW${FIN() ? ' · ' + inr(p.cost) : ''}</small></td><td>${pill(p.stage, stepCls(p.stage))}</td><td>${daysSince(p.since)}d</td><td>${rcBadges(p)}</td><td>${esc(p.engineer) || '—'}</td><td class="right">${w ? nextBtn(p) : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="mut">No projects in this step</td></tr>'}</tbody></table></div>`;
    $$('#ptb tr.row').forEach(r => r.onclick = e => { if (!e.target.closest('button')) location.hash = '#/projects/' + r.dataset.id; });
    bindNext(body, ps); return;
  }

  body.innerHTML = `<div class="pboard s${PL.step}">${cols.map(([k, label, , gate]) => { const cs = ps.filter(p => p.stage === label);
    return `<div class="pcol" data-stage="${esc(label)}"><div class="pch"><b title="${esc(label)}">${esc(label)}</b><span>${cs.length}</span></div>${gate === 'receipt' ? '<div class="pgate"><i class="i i-lock"></i> Receipt required to move on</div>' : gate === 'optional' ? '<div class="pgate">Only if a loan is taken</div>' : ''}
     <div class="pcl">${cs.map(p => pcard(p, k, gate)).join('') || '<p class="mut pce">—</p>'}</div></div>`; }).join('')}</div>`;
  $$('.pk[data-id]', body).forEach(c => { c.onclick = e => { if (!e.target.closest('button')) location.hash = '#/projects/' + c.dataset.id; }; if (w) c.ondragstart = e => e.dataTransfer.setData('text/plain', c.dataset.id); });
  if (w) $$('.pcol[data-stage]', body).forEach(col => { if (!col.dataset.stage) return;
    col.ondragover = e => { e.preventDefault(); col.classList.add('drop'); }; col.ondragleave = () => col.classList.remove('drop');
    col.ondrop = async e => { e.preventDefault(); col.classList.remove('drop'); const p = ps.find(x => x.id == e.dataTransfer.getData('text/plain')); if (p) await moveTo(p, col.dataset.stage); };
  });


  bindNext(body, ps);
}
const rcBadges = p => [['feas_pay', 'Feasibility'], ['reg_pay', 'Registration']].filter(([k]) => PIPE.findIndex(s => s[0] === k) <= PIPE.findIndex(s => s[1] === p.stage)).map(([k, l]) => `<span class="pill ${p.receipts[k] ? 'g' : 'r'}" title="${l} fee receipt">${p.receipts[k] ? '<i class="i i-check"></i>' : '<i class="i i-alert"></i>'} ${l}</span>`).join(' ') || '<span class="mut">—</span>';
function pcard(p, key, gate) {
  const need = gate === 'receipt' && !p.receipts[key];
  return `<div class="pk" data-id="${p.id}" draggable="${canW('projects')}"><b>${esc(p.customer || '—')}</b><small>${esc(p.title)} · ${p.kw} kW</small>
   <div class="pkm">${p.loan === 'Yes' ? '<span class="pill">Loan</span>' : ''}${gate === 'receipt' ? (need ? '<span class="pill r"><i class="i i-alert"></i> Receipt needed</span>' : '<span class="pill g"><i class="i i-check"></i> Receipt</span>') : ''}<span class="mut" title="Days in this stage">${daysSince(p.since)}d</span></div>
   ${canW('projects') ? nextBtn(p) : ''}</div>`;
}
function nextBtn(p) {
  const i = PIPE.findIndex(s => s[1] === p.stage), cur = PIPE[i], nx = PIPE[i + 1]; if (!nx) return '';
  if (cur[3] === 'receipt' && !p.receipts[cur[0]]) return `<button class="btn sm rc" data-rc="${p.id}" data-key="${cur[0]}"><i class="i i-upload"></i> Upload receipt</button>`;
  const skip = nx[0] === 'loan' && p.loan === 'No' ? PIPE[i + 2] : nx;
  return `<button class="btn sm sec nx" data-next="${p.id}" data-to="${esc(skip[1])}" title="Move to ${esc(skip[1])}">Next: ${esc(skip[1])} →</button>`;
}
function bindNext(root, ps) {
  $$('[data-next]', root).forEach(b => b.onclick = async e => { e.stopPropagation(); const p = ps.find(x => x.id == b.dataset.next); await moveTo(p, b.dataset.to); });
  $$('[data-rc]', root).forEach(b => b.onclick = e => { e.stopPropagation(); const p = ps.find(x => x.id == b.dataset.rc); receiptModal(p.id, b.dataset.key, () => pgPipeline()); });
}
async function moveTo(p, stage, note) {
  if (p.stage === stage) return;
  const r = await fetch('api.php?m=pipeline&a=move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, stage, note: note || '' }) }).then(x => x.json());
  if (r.error) { toast(r.error, true); const blocked = PIPE.find(s => r.error.includes(s[1]) && s[3] === 'receipt'); if (blocked) receiptModal(p.id, blocked[0], () => route()); return false; }
  toast((p.customer ? p.customer + ': ' : '') + 'moved to ' + stage); route(); return true;
}
function receiptModal(pid, key, done) {
  const st = PIPE.find(s => s[0] === key);
  const m = modal(`<h2 style="margin-top:0">Upload receipt</h2><p class="mut" style="margin-top:-6px">${esc(st[1])} — the project can move to the next stage only after this receipt is uploaded.</p>
   <div class="two"><div><label>Amount paid (₹)</label><input id="ra" type="number" step="any"></div><div><label>Payment date</label><input id="rd" type="date" value="${today()}"></div>
   <div class="full"><label>Receipt / transaction no.</label><input id="rr" placeholder="Optional"></div></div>
   <div id="rdrop" class="drop"><i class="i i-upload" style="width:26px;height:26px"></i><div><b>Choose receipt</b> or drop it here</div><small class="mut">JPG or PDF only · maximum 2 MB</small><input type="file" id="rf" accept=".jpg,.jpeg,.pdf,image/jpeg,application/pdf" class="hide"></div><div id="rinfo" style="margin-top:8px;font-size:14px"></div>
   <div class="bar" style="margin-top:12px"><button class="btn" id="rsv" disabled>Upload receipt</button><button class="btn sec" id="rcx">Cancel</button></div>`);
  let file = null; const dz = $('#rdrop', m);
  const pick = f => { const ext = (f.name.split('.').pop() || '').toLowerCase(), info = $('#rinfo', m);
    if (!['jpg', 'jpeg', 'pdf'].includes(ext)) { file = null; info.innerHTML = '<span class="over">Only JPG or PDF files are allowed.</span>'; }
    else if (f.size > 2 * 1024 * 1024) { file = null; info.innerHTML = `<span class="over">${esc(f.name)} is ${(f.size / 1048576).toFixed(1)} MB — the limit is 2 MB.</span>`; }
    else { file = f; info.innerHTML = `<div class="act">${esc(f.name)} <small>${Math.round(f.size / 1024)} KB</small></div>`; }
    $('#rsv', m).disabled = !file; };
  dz.onclick = () => $('#rf', m).click(); $('#rf', m).onchange = e => e.target.files[0] && pick(e.target.files[0]);
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('hov'); }; dz.ondragleave = () => dz.classList.remove('hov'); dz.ondrop = e => { e.preventDefault(); dz.classList.remove('hov'); e.dataTransfer.files[0] && pick(e.dataTransfer.files[0]); };
  $('#rcx', m).onclick = () => m.remove();
  $('#rsv', m).onclick = async () => { const fd = new FormData(); fd.append('file', file); fd.append('project_id', pid); fd.append('stage', key); fd.append('amount', $('#ra', m).value); fd.append('date', $('#rd', m).value); fd.append('ref', $('#rr', m).value);
    $('#rsv', m).disabled = true; try { await api('pipeline', 'receipt', fd); toast('Receipt uploaded — you can move this project on'); m.remove(); done && done(); } catch (e) { $('#rsv', m).disabled = false; } };
}
async function startModal({ customer_id }) {
  const cs = canR('customers') ? await api('customers', 'list') : [];
  const m = modal(`<h2 style="margin-top:0">Start a project</h2><p class="mut" style="margin-top:-6px">Projects start from a customer. To turn a lead into a customer, use <b>Convert lead</b> on the Customers page.</p><div class="two">
   <div class="full"><label>Customer</label><select id="sfrom"><option value="">— choose a customer —</option>${cs.map(c => `<option value="${c.id}" ${customer_id == c.id ? 'selected' : ''}>${esc(c.name)}${c.phone ? ' · ' + esc(c.phone) : ''}${c.stage ? ' (has a project)' : ''}</option>`).join('')}</select></div>
   <div><label>System size (kW)</label><input id="skw" type="number" step="any"></div>${FIN() ? '<div><label>Project value (₹)</label><input id="scost" type="number" step="any"></div>' : ''}
   <div><label>Loan taken?</label><select id="sloan"><option value="">Not decided</option><option>Yes</option><option>No</option></select></div><div><label>Site engineer</label><input id="seng"></div>
   <div class="full"><label>Project title</label><input id="stitle" placeholder="e.g. 3 kW rooftop solar (blank = automatic)"></div></div>
   <div class="bar" style="margin-top:14px"><button class="btn" id="ssv">Start project</button><button class="btn sec" id="scx">Cancel</button><span class="sp"></span><a class="btn sec" href="#/customers" id="sgoc">Go to Customers</a></div>`);
  $('#scx', m).onclick = () => m.remove(); $('#sgoc', m).onclick = () => m.remove();
  $('#ssv', m).onclick = async () => { const v = $('#sfrom', m).value; if (!v) return toast('Choose a customer', true);
    const r = await api('pipeline', 'start', { customer_id: +v, kw: $('#skw', m).value, cost: $('#scost', m)?.value || 0, loan: $('#sloan', m).value, engineer: $('#seng', m).value, title: $('#stitle', m).value });
    m.remove(); toast('Project started'); location.hash = '#/projects/' + r.id; };
}

// ---------- Step 4: AMC & service ----------
function amcBoard(body, done, types) {
  const td = today(), w = canW('projects');
  const rows = done.map(p => ({ ...p, next: nextService(p) })).sort((a, b) => (a.next || '9999').localeCompare(b.next || '9999'));
  const od = rows.filter(r => r.next && r.next < td).length, soon = rows.filter(r => r.next && r.next >= td && r.next <= ymd(addD(new Date(), 30))).length, noamc = rows.filter(r => !r.amc_start).length;
  body.innerHTML = `<div class="grid stats" style="margin-bottom:14px">${[['Completed projects', rows.length], ['Service overdue', od], ['Due in 30 days', soon], ['Without AMC', noamc]].map(([l, v]) => `<div class="card stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
   <div class="card tw fitbox" style="padding:0"><table id="amt"><thead><tr><th>Customer</th><th>System</th><th>AMC period</th><th>Every</th><th>Last service</th><th>Next service</th><th class="right">Actions</th></tr></thead><tbody>
   ${rows.map(p => `<tr class="row" data-id="${p.id}"><td><b>${esc(p.customer)}</b><br><small class="mut">${esc(p.phone || '')}${p.district ? ' · ' + esc(p.district) : ''}</small></td><td>${p.kw} kW<br><small class="mut">${esc(p.title)}</small></td>
     <td>${p.amc_start ? dmy(p.amc_start) + ' – ' + (p.amc_end ? dmy(p.amc_end) : 'open') : '<span class="mut">No AMC</span>'}${p.amc_end && p.amc_end < td ? ' ' + pill('Expired', 'r') : ''}</td><td>${p.amc_start ? (p.amc_interval || 6) + ' months' : '—'}</td>
     <td>${p.svc && p.svc.last_done ? dmy(p.svc.last_done) : '<span class="mut">—</span>'}</td><td>${p.next ? pill(dmy(p.next), p.next < td ? 'r' : p.next <= ymd(addD(new Date(), 30)) ? 'y' : 'g') : '<span class="mut">—</span>'}</td>
     <td class="right" style="white-space:nowrap">${w ? `<button class="btn sm" data-svc="${p.id}"><i class="i i-plus"></i> Service</button> <button class="btn sm sec" data-amc="${p.id}">AMC</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="mut">No completed projects yet. Projects appear here once they reach “Project completed”.</td></tr>'}</tbody></table></div>`;
  $$('#amt tr.row').forEach(r => r.onclick = e => { if (!e.target.closest('button')) { TAB.proj = 'amc'; location.hash = '#/projects/' + r.dataset.id; } });
  $$('[data-svc]', body).forEach(b => b.onclick = () => serviceModal(+b.dataset.svc, {}, types, () => pgPipeline(), rows.find(p => p.id == b.dataset.svc)));
  $$('[data-amc]', body).forEach(b => b.onclick = () => amcModal(rows.find(p => p.id == b.dataset.amc), () => pgPipeline()));
}
function amcModal(p, done) {
  const m = modal(`<h2 style="margin-top:0">AMC — ${esc(p.customer || p.title)}</h2><div class="two"><div><label>AMC start</label><input type="date" id="as" value="${esc(p.amc_start || today())}"></div><div><label>AMC end</label><input type="date" id="ae" value="${esc(p.amc_end || addMonths(today(), 12))}"></div>
   <div><label>Service every</label><select id="ai">${[1, 2, 3, 4, 6, 12].map(n => `<option value="${n}" ${(p.amc_interval || 6) == n ? 'selected' : ''}>${n} month${n > 1 ? 's' : ''}</option>`).join('')}</select></div></div>
   <div class="bar" style="margin-top:14px"><button class="btn" id="asv">Save AMC</button><button class="btn sec" id="acx">Cancel</button></div>`);
  $('#acx', m).onclick = () => m.remove();
  $('#asv', m).onclick = async () => { await api('pipeline', 'amc', { id: p.id, amc_start: $('#as', m).value, amc_end: $('#ae', m).value, amc_interval: $('#ai', m).value }); m.remove(); toast('AMC saved'); done(); };
}
function serviceModal(pid, s, types, done, p) {
  const m = modal(`<h2 style="margin-top:0">${s.id ? 'Service record' : 'Add service'}</h2><div class="two">
   <div><label>Date</label><input type="date" id="vd" value="${esc(s.date || (p && p.next) || today())}"></div><div><label>Type</label><select id="vt">${(types || []).map(t => `<option ${s.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
   <div><label>Status</label><select id="vs">${['Scheduled', 'Done'].map(x => `<option ${s.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div><label>Technician</label><input id="vtech" value="${esc(s.technician || '')}"></div>
   <div><label>Charge (₹)</label><input id="vc" type="number" step="any" value="${s.cost || ''}"></div><div></div>
   <div class="full"><label>Notes / work done</label><textarea id="vn" rows="3">${esc(s.notes || '')}</textarea></div>
   ${s.id ? '' : '<div class="full"><label style="display:flex;gap:8px;align-items:center;color:var(--tx);font-size:14px"><input type="checkbox" id="vcal" style="width:auto" checked> Also add to the calendar</label></div>'}</div>
   <div class="bar" style="margin-top:14px"><button class="btn" id="vsv">Save</button><button class="btn sec" id="vcx">Cancel</button><span class="sp"></span>${s.id ? '<button class="btn bad" id="vdl">Delete</button>' : ''}</div>`);
  $('#vcx', m).onclick = () => m.remove();
  $('#vsv', m).onclick = async () => { const o = { id: s.id, project_id: pid, date: $('#vd', m).value, type: $('#vt', m).value, status: $('#vs', m).value, technician: $('#vtech', m).value, cost: $('#vc', m).value, notes: $('#vn', m).value };
    await api('pipeline', 'service_save', o);
    if ($('#vcal', m) && $('#vcal', m).checked && o.status === 'Scheduled' && canW('calendar')) { try { await api('calendar', 'save', { title: o.type + (p && p.customer ? ' — ' + p.customer : ''), type: 'Other', all_day: 1, start: o.date, project_id: pid, location: p && p.district || '', notes: o.notes }); } catch (e) { } }
    m.remove(); toast('Service saved'); done(); };
  if ($('#vdl', m)) $('#vdl', m).onclick = async () => { if (confirm('Delete this service record?')) { await api('pipeline', 'service_delete', { id: s.id }); m.remove(); done(); } };
}

// ---------- stepper on the project page ----------
async function renderStepper(p, box) {
  if (!PIPE) PIPE = (await api('pipeline', 'board')).stages;
  const cur = PIPE.findIndex(s => s[1] === p.stage), w = canW('projects');
  const rec = Object.fromEntries((p.stage_data || []).map(d => [d.stage, d]));
  const when = {}; (p.steps || []).forEach(s => { when[s.stage] = s; });
  const pp = { ...p, receipts: { feas_pay: !!(rec.feas_pay && rec.feas_pay.file_id), reg_pay: !!(rec.reg_pay && rec.reg_pay.file_id) } };
  box.innerHTML = `<div class="card pst"><div class="ch"><h3>Progress</h3><span class="pill ${stepCls(p.stage)}">Step ${stepOf(p.stage)} · ${esc(p.stage)}</span><span class="sp"></span>${w ? nextBtn(pp) : ''}${w ? `<select id="pmove" title="Move to any stage (receipts still required)"><option value="">Move to…</option>${PIPE.map(s => `<option ${s[1] === p.stage ? 'disabled' : ''}>${esc(s[1])}</option>`).join('')}</select>` : ''}</div>
   <div class="psteps">${[1, 2, 3].map(n => `<div class="pstep"><div class="psh">${STEPS[n - 1][1]} · ${STEPS[n - 1][2]}</div>${PIPE.filter(s => s[2] === n).map(s => { const i = PIPE.indexOf(s), st = i < cur || (i === cur && s[0] === 'completed') ? 'done' : i === cur ? 'cur' : '';
      const r = rec[s[0]]; return `<div class="psi ${st} ${s[0] === 'loan' && p.loan === 'No' ? 'skip' : ''}"><span class="pdot">${st === 'done' ? '<i class="i i-check"></i>' : ''}</span><div><b>${esc(s[1])}</b>${when[s[1]] ? `<small>${dmy(when[s[1]].created)} · ${esc(when[s[1]].user)}${when[s[1]].note ? ' · ' + esc(when[s[1]].note) : ''}</small>` : ''}
        ${s[3] === 'receipt' ? (r && r.file_id ? `<small><a href="api.php?m=files&a=get&id=${r.file_id}" target="_blank"><i class="i i-file"></i> Receipt${r.amount ? ' · ' + inr(r.amount) : ''}${r.ref ? ' · ' + esc(r.ref) : ''}</a>${w ? ` · <a href="#" data-rcu="${s[0]}">replace</a>` : ''}</small>` : (i <= cur && w ? `<small><a href="#" data-rcu="${s[0]}" class="over"><i class="i i-upload"></i> Upload receipt (required)</a></small>` : '<small class="mut">Receipt required</small>')) : ''}
        ${s[0] === 'loan' && p.loan === 'No' ? '<small class="mut">No loan — skipped</small>' : ''}</div></div>`; }).join('')}</div>`).join('')}</div></div>`;
  $$('[data-next]', box).forEach(b => b.onclick = () => moveTo(pp, b.dataset.to));
  $$('[data-rc]', box).forEach(b => b.onclick = () => receiptModal(p.id, b.dataset.key, () => route()));
  $$('[data-rcu]', box).forEach(a => a.onclick = e => { e.preventDefault(); receiptModal(p.id, a.dataset.rcu, () => route()); });
  if ($('#pmove', box)) $('#pmove', box).onchange = async e => { const to = e.target.value; if (!to) return; const note = prompt('Note for this step (optional):', '') ?? ''; if (!(await moveTo(pp, to, note))) e.target.value = ''; };
}
async function amcTab(p, box) {
  const types = ['AMC visit', 'Panel cleaning', 'Periodic maintenance', 'Inverter service', 'Repair / complaint', 'Inspection'], w = canW('projects');
  const pp = { ...p, svc: { last_done: (p.services || []).filter(s => s.status === 'Done').map(s => s.date).sort().pop(), next_sched: (p.services || []).filter(s => s.status === 'Scheduled').map(s => s.date).sort()[0] }, customer: p.customer && p.customer.name };
  const nx = nextService(pp);
  box.innerHTML = `<div class="grid cols2"><div class="card"><div class="ch"><h3>AMC contract</h3>${w ? '<button class="btn sm sec" id="tamc">Edit AMC</button>' : ''}</div>
    ${p.amc_start ? `<p style="margin:0">From <b>${dmy(p.amc_start)}</b> to <b>${p.amc_end ? dmy(p.amc_end) : 'open'}</b>, service every <b>${p.amc_interval || 6} months</b>.</p><p>Next service: ${nx ? pill(dmy(nx), nx < today() ? 'r' : 'g') : '—'}</p>` : '<p class="mut">No AMC set up for this project.</p>'}</div>
   <div class="card"><div class="ch"><h3>Service history (${(p.services || []).length})</h3>${w ? '<button class="btn sm" id="tsvc"><i class="i i-plus"></i> Add service</button>' : ''}</div>
    ${(p.services || []).map(s => `<div class="act" data-s="${s.id}" style="cursor:pointer"><b>${esc(s.type)}</b> ${pill(s.status, s.status === 'Done' ? 'g' : 'y')} <span class="mut">${dmy(s.date)}</span><br><small>${[s.technician, s.cost ? inr(s.cost) : '', s.notes].filter(Boolean).map(esc).join(' · ')}</small></div>`).join('') || '<p class="mut">No service records yet.</p>'}</div></div>`;
  if ($('#tamc', box)) $('#tamc', box).onclick = () => amcModal(pp, () => route());
  if ($('#tsvc', box)) $('#tsvc', box).onclick = () => serviceModal(p.id, {}, types, () => route(), { ...pp, next: nx, district: '' });
  $$('[data-s]', box).forEach(el => el.onclick = () => w && serviceModal(p.id, p.services.find(s => s.id == el.dataset.s), types, () => route(), pp));
}
