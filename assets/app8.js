// Team: Attendance (check-in/out, today board, monthly register, corrections) and Leaves (apply, approve, balances, settings).
let HR = { me: null, attTab: null, lvTab: null, month: null };
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hmAgo = t => t || '—';
const hrsBetween = (a, b) => a && b ? Math.max(0, (+b.slice(0, 2) * 60 + +b.slice(3)) - (+a.slice(0, 2) * 60 + +a.slice(3))) / 60 : 0;
const fmtH = h => h ? Math.floor(h) + 'h ' + String(Math.round((h % 1) * 60)).padStart(2, '0') + 'm' : '—';
const mapLink = (lat, lng) => lat ? `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" title="Open location"><i class="i i-target"></i></a>` : '';
const ATT = { Present: 'g', Late: 'y', 'Half day': 'y', Absent: 'r', 'On duty': 'b' };

async function hrMe() { try { HR.me = await api('hr', 'me'); } catch (e) { HR.me = null; } drawPunch(); hrBadge(); return HR.me; }
function getLoc() {
  return new Promise(res => { if (!navigator.geolocation) return res({});
    navigator.geolocation.getCurrentPosition(p => res({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }), () => res({}), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }); });
}
async function punch(kind, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Getting location…'; }
  const loc = await getLoc();
  try { const r = await api('hr', 'punch', { kind, ...loc }); toast(kind === 'in' ? `Checked in at ${r.time}${r.status === 'Half day' ? ' (half day)' : r.late ? ' (late)' : ''}${loc.lat ? '' : ' · location not shared'}` : `Checked out at ${r.time} · ${fmtH(r.hours)}${r.status === 'Half day' ? ' · half day' : r.early ? ' · left early' : ''}`); }
  finally { await hrMe(); if (location.hash.startsWith('#/attendance')) route(); }
}
// top-bar check-in / check-out button
function drawPunch() {
  const top = $('.top'); if (!top || !canR('attendance')) return;
  let b = $('#punch'); if (!b) { b = document.createElement('button'); b.id = 'punch'; b.className = 'btn sm'; top.insertBefore(b, $('#pwb')); }
  const t = HR.me && HR.me.today;
  if (HR.me && HR.me.on_leave && !t) { b.className = 'btn sec sm'; b.innerHTML = '<i class="i i-leave"></i> On leave'; b.onclick = () => location.hash = '#/leaves'; return; }
  if (!t || !t.check_in) { b.className = 'btn sm'; b.innerHTML = '<i class="i i-clock"></i> Check in'; b.onclick = () => punch('in', b); }
  else if (!t.check_out) { b.className = 'btn ok sm'; b.innerHTML = `<i class="i i-clock"></i> In since ${t.check_in} · Check out`; b.onclick = () => { if (confirm('Check out now?')) punch('out', b); }; }
  else { b.className = 'btn sec sm'; b.innerHTML = `<i class="i i-check"></i> ${t.check_in}–${t.check_out}`; b.onclick = () => location.hash = '#/attendance'; }
}
function hrBadge() {
  const a = $('aside a[data-m="leaves"]'); if (!a) return; let b = a.querySelector('.nb');
  const n = HR.me ? HR.me.pending_requests : 0; if (!b) { b = document.createElement('span'); b.className = 'nb nbo'; a.appendChild(b); }
  b.textContent = n || ''; b.style.display = n ? '' : 'none';
}
function startHr() { if (canR('attendance') || canR('leaves')) hrMe(); setInterval(() => { if (!document.hidden && (canR('attendance') || canR('leaves'))) hrMe(); }, 120000); }

// ---------- Attendance page ----------
async function pgAttendance() {
  const me = await hrMe(); if (!me) return;
  const mgr = !!me.manage_att; if (!HR.attTab) HR.attTab = mgr ? 'today' : 'mine'; if (!HR.month) HR.month = today().slice(0, 7);
  const t = me.today, worked = t && t.check_in ? hrsBetween(t.check_in, t.check_out || new Date().toTimeString().slice(0, 5)) : 0;
  $('#main').innerHTML = `<div class="bar" style="align-items:flex-start;margin-bottom:10px"><div><h2 style="margin:0;font-size:26px">Attendance</h2><div class="mut">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Office ${esc(me.cfg.start)}–${esc(me.cfg.end || '18:00')} · late after ${me.cfg.grace} min · half day if in after / out before ${esc(me.cfg.half_after || '14:00')}</div></div><span class="sp"></span>
    ${mgr ? `<div class="tabs" style="margin:0">${[['today', 'Today'], ['week', 'Weekly (salary)'], ['register', 'Monthly register'], ['mine', 'My attendance']].map(([k, l]) => `<button data-at="${k}" class="${HR.attTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}</div>
   <div class="grid cols2 ${(HR.attTab === 'register' || HR.attTab === 'week') && mgr ? 'attfull' : ''}" style="grid-template-columns:minmax(280px,360px) minmax(0,1fr);align-items:start">
    <div class="card punchcard"><div class="pclock" id="pclock">${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
     ${me.on_leave && !t ? `<p class="mut">You are on approved leave today (${esc(me.on_leave.type)}).</p>` : ''}
     <div class="pstat">${t && t.check_in ? pill(t.status, ATT[t.status]) : pill('Not checked in')}</div>
     <div class="pgrid"><div><small>Check in</small><b>${hmAgo(t && t.check_in)}</b></div><div><small>Check out</small><b>${hmAgo(t && t.check_out)}</b></div><div><small>Worked</small><b>${fmtH(worked)}</b></div></div>
     ${!t || !t.check_in ? '<button class="btn pbig" id="pin"><i class="i i-clock"></i> Check in</button>' : !t.check_out ? '<button class="btn ok pbig" id="pout"><i class="i i-clock"></i> Check out</button>' : '<p class="mut" style="text-align:center;margin:8px 0 0">Done for today 👍</p>'}
     <p class="mut" style="font-size:12px;margin:10px 0 0">Your location is recorded with each check-in/out if you allow it — useful for site visits.</p></div>
    <div id="atb"></div></div>`;
  const tick = setInterval(() => { const c = $('#pclock'); if (!c) return clearInterval(tick); c.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); }, 15000);
  if ($('#pin')) $('#pin').onclick = e => punch('in', e.currentTarget); if ($('#pout')) $('#pout').onclick = e => punch('out', e.currentTarget);
  $$('[data-at]').forEach(b => b.onclick = () => { HR.attTab = b.dataset.at; pgAttendance(); });
  if (HR.attTab === 'today' && mgr) return attToday();
  if (HR.attTab === 'week' && mgr) return attWeek(false);
  return attRegister(HR.attTab === 'mine' || !mgr);
}
async function attToday() {
  const d = await api('hr', 'today'), box = $('#atb');
  const cnt = k => d.rows.filter(r => k === 'leave' ? r.leave : k === 'absent' ? !r.check_in && !r.leave && !r.status : r.status === k).length;
  box.innerHTML = `<div class="grid stats" style="margin-bottom:12px">${[['Present', d.rows.filter(r => r.check_in).length, 'g'], ['Late', cnt('Late'), 'y'], ['On leave', cnt('leave'), 'b'], ['Not in yet', cnt('absent'), 'r']].map(([l, v]) => `<div class="card stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
   <div class="card tw" style="padding:0"><table id="att"><thead><tr><th>Staff</th><th>Status</th><th>In</th><th>Out</th><th>Hours</th><th>Location</th><th class="right">Edit</th></tr></thead><tbody>
   ${d.rows.map(r => `<tr><td><b>${esc(r.name)}</b><br><small class="mut">${esc((S.role_names || {})[r.role] || r.role)}</small></td><td>${r.leave ? pill('Leave · ' + r.leave, 'b') : r.status ? pill(r.status, ATT[r.status]) : pill('Not in', 'r')}${r.notes ? `<br><small class="mut">${esc(r.notes)}</small>` : ''}</td>
     <td>${hmAgo(r.check_in)}</td><td>${hmAgo(r.check_out)}${r.check_out && r.check_out < (HR.me.cfg.end || '18:00') ? ' <span class="pill y" title="Left before office end">early</span>' : ''}</td><td>${fmtH(hrsBetween(r.check_in, r.check_out))}</td><td>${mapLink(r.in_lat, r.in_lng)} ${mapLink(r.out_lat, r.out_lng)}</td>
     <td class="right"><button class="ib" data-ed="${r.user_id}" title="Correct attendance"><i class="i i-pencil"></i></button></td></tr>`).join('')}</tbody></table></div>`;
  $$('[data-ed]', box).forEach(b => b.onclick = () => { const r = d.rows.find(x => x.user_id == b.dataset.ed); attEdit({ user_id: r.user_id, name: r.name, date: d.date, ...r }, attToday); });
}
async function attRegister(mine) {
  const d = await api('hr', 'month', undefined, '&month=' + HR.month + (mine ? '&mine=1' : '')), box = $('#atb'); if (!box) return;
  const [y, m] = HR.month.split('-').map(Number), dim = new Date(y, m, 0).getDate(), hol = Object.fromEntries(d.cfg.holidays.map(h => [h.date, h.name]));
  const days = Array.from({ length: dim }, (_, i) => `${HR.month}-${String(i + 1).padStart(2, '0')}`);
  const rec = {}; d.records.forEach(r => rec[r.user_id + '|' + r.date] = r);
  const lvOn = (u, ds) => d.leaves.find(l => l.user_id == u && ds >= l.from_date && ds <= l.to_date);
  const code = (u, ds) => { const r = rec[u + '|' + ds], l = lvOn(u, ds), wd = new Date(ds + 'T00:00:00').getDay();
    if (r && r.status === 'Absent') return ['A', 'ab', 'Absent' + (r.notes ? ' · ' + r.notes : '')];
    if (r && r.check_in || r && r.status) return [{ Present: 'P', Late: 'L', 'Half day': 'HD', 'On duty': 'OD' }[r.status] || 'P', { Present: 'pr', Late: 'lt', 'Half day': 'hd', 'On duty': 'od' }[r.status] || 'pr', `${r.status} ${r.check_in || ''}${r.check_out ? '–' + r.check_out : ''}${r.notes ? ' · ' + r.notes : ''}`];
    if (hol[ds]) return ['H', 'ho', 'Holiday · ' + hol[ds]]; if (d.cfg.week_off.includes(wd)) return ['WO', 'wo', 'Weekly off'];
    if (l) return [l.half ? 'HL' : 'LV', 'lv', 'Leave · ' + l.type + (l.half ? ' (half)' : '')];
    if (ds < d.today) return ['A', 'ab', 'Absent (no check-in)']; return ['', '', ''];
  };
  const totals = u => { const c = { P: 0, L: 0, HD: 0, A: 0, LV: 0 }; days.forEach(ds => { const k = code(u, ds)[0]; if (k === 'P' || k === 'OD') c.P++; else if (k === 'L') c.L++; else if (k === 'HD') c.HD++; else if (k === 'A') c.A++; else if (k === 'LV') c.LV++; else if (k === 'HL') c.LV += .5; }); return c; };
  box.innerHTML = `<div class="card"><div class="ch"><h3>${mine ? 'My attendance' : 'Monthly register'}</h3><span class="sp"></span><input type="month" id="amon" value="${HR.month}" style="max-width:170px">${mine ? '' : '<button class="btn sec sm" id="acsv"><i class="i i-download"></i> CSV</button>'}</div>
    <div class="alegend">${[['P', 'pr', 'Present'], ['L', 'lt', 'Late'], ['HD', 'hd', 'Half day'], ['A', 'ab', 'Absent'], ['LV', 'lv', 'Leave'], ['H', 'ho', 'Holiday'], ['WO', 'wo', 'Weekly off']].map(([k, c, l]) => `<span><i class="ac ${c}">${k}</i>${l}</span>`).join('')}</div>
    <div class="tw areg"><table class="regt" data-nofit="1"><thead><tr><th class="rn">Staff</th>${days.map(ds => { const dt = new Date(ds + 'T00:00:00'); return `<th class="${ds === d.today ? 'tdy' : ''}"><small>${WD[dt.getDay()][0]}</small>${dt.getDate()}</th>`; }).join('')}<th>P</th><th>L</th><th>HD</th><th>LV</th><th>A</th></tr></thead><tbody>
    ${d.users.map(u => { const t = totals(u.id); return `<tr><td class="rn"><b>${esc(u.name)}</b></td>${days.map(ds => { const [k, c, tip] = code(u.id, ds); return `<td><button class="ac ${c}" data-u="${u.id}" data-d="${ds}" title="${esc(ds + ' · ' + (tip || '—'))}" ${!mine && !c.match(/lv|ho|wo/) && ds <= d.today ? '' : 'disabled'}>${k}</button></td>`; }).join('')}<td><b>${t.P}</b></td><td>${t.L}</td><td>${t.HD}</td><td>${t.LV}</td><td class="${t.A ? 'over' : ''}">${t.A}</td></tr>`; }).join('')}</tbody></table></div>
    ${mine ? '' : '<p class="mut" style="font-size:12px;margin:8px 0 0">Click a day to correct it. Corrections are recorded in the audit log.</p>'}</div>`;
  $('#amon').onchange = e => { HR.month = e.target.value; attRegister(mine); };
  if (!mine) $$('.regt button.ac:not([disabled])', box).forEach(b => b.onclick = () => { const u = d.users.find(x => x.id == b.dataset.u), r = rec[b.dataset.u + '|' + b.dataset.d] || {}; attEdit({ ...r, user_id: u.id, name: u.name, date: b.dataset.d }, () => attRegister(false)); });
  if ($('#acsv')) $('#acsv').onclick = () => csvDownload(`attendance-${HR.month}.csv`, ['name', ...days.map(x => x.slice(8)), 'present', 'late', 'half_day', 'leave', 'absent'], d.users.map(u => { const t = totals(u.id), o = { name: u.name, present: t.P, late: t.L, half_day: t.HD, leave: t.LV, absent: t.A }; days.forEach(ds => o[ds.slice(8)] = code(u.id, ds)[0]); return o; }));
}
function attEdit(r, done) {
  const m = modal(`<h3 style="margin-top:0">Attendance · ${esc(r.name)}</h3><p class="mut" style="margin-top:-6px">${new Date(r.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
   <div class="two"><div><label>Status</label><select id="ast">${['Present', 'Late', 'Half day', 'On duty', 'Absent'].map(s => `<option ${r.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div></div>
   <div><label>Check in</label><input type="time" id="aci" value="${esc(r.check_in || '')}"></div><div><label>Check out</label><input type="time" id="aco" value="${esc(r.check_out || '')}"></div>
   <div class="full"><label>Reason for correction</label><input id="ano" value="${esc(r.notes || '')}" placeholder="e.g. Forgot to check in — site visit at Kollam"></div></div>
   <div class="bar" style="margin-top:12px"><button class="btn" id="asv">Save</button><button class="btn sec" id="acx">Cancel</button><span class="sp"></span>${r.check_in || r.status ? '<button class="btn bad" id="aclr">Clear day</button>' : ''}</div>`);
  $('#acx', m).onclick = () => m.remove();
  $('#asv', m).onclick = async () => { await api('hr', 'mark', { user_id: r.user_id, date: r.date, status: $('#ast', m).value, check_in: $('#aci', m).value, check_out: $('#aco', m).value, notes: $('#ano', m).value }); m.remove(); toast('Attendance updated'); done(); };
  if ($('#aclr', m)) $('#aclr', m).onclick = async () => { if (!confirm('Remove this day’s attendance record?')) return; await api('hr', 'mark', { user_id: r.user_id, date: r.date, clear: 1 }); m.remove(); done(); };
}

// ---------- Leaves page ----------
async function pgLeaves() {
  const d = await api('hr', 'leaves'), mgr = !!d.manage; if (!HR.lvTab) HR.lvTab = mgr ? 'requests' : 'mine';
  const pend = d.rows.filter(r => r.status === 'Pending' && (r.user_id != ME.id || ME.role === 'admin')).length;
  $('#main').innerHTML = `<div class="bar" style="align-items:flex-start;margin-bottom:10px"><div><h2 style="margin:0;font-size:26px">Leaves</h2><div class="mut">${new Date().getFullYear()} balances · weekly off: ${d.cfg.week_off.map(x => WD[x]).join(', ') || 'none'}</div></div><span class="sp"></span>
    ${mgr ? `<div class="tabs" style="margin:0">${[['requests', `Requests${pend ? ' (' + pend + ')' : ''}`], ['all', 'All leaves'], ['bal', 'Team balances'], ['mine', 'My leaves']].map(([k, l]) => `<button data-lt="${k}" class="${HR.lvTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
    <button class="btn" id="lapply"><i class="i i-plus"></i> Apply for leave</button></div>
   <div class="grid stats" style="margin-bottom:14px">${d.balance.map(b => `<div class="card stat lbal"><b>${b.left === null ? (b.used || 0) : b.left}</b><span>${esc(b.name)}</span><small class="mut">${b.left === null ? 'days taken (no limit)' : `left of ${b.quota} · used ${b.used}${b.pending ? ' · ' + b.pending + ' pending' : ''}`}</small></div>`).join('')}</div><div id="lvb"></div>`;
  $$('[data-lt]').forEach(b => b.onclick = () => { HR.lvTab = b.dataset.lt; pgLeaves(); });
  $('#lapply').onclick = () => applyModal(d);
  const box = $('#lvb');
  if (HR.lvTab === 'bal' && mgr) {
    const bs = await api('hr', 'balances'); const types = d.cfg.leave_types;
    box.innerHTML = `<div class="card tw" style="padding:0"><table><thead><tr><th>Staff</th>${types.map(t => `<th>${esc(t.code)} <small class="mut">${t.quota ? '/' + t.quota : ''}</small></th>`).join('')}</tr></thead><tbody>${bs.map(x => `<tr><td><b>${esc(x.user.name)}</b></td>${x.balance.map(b => `<td>${b.left === null ? b.used + ' taken' : `<b>${b.left}</b> left <small class="mut">(${b.used} used${b.pending ? ', ' + b.pending + ' pending' : ''})</small>`}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    return;
  }
  const rows = HR.lvTab === 'mine' || !mgr ? d.rows.filter(r => r.user_id == ME.id) : HR.lvTab === 'requests' ? d.rows.filter(r => r.status === 'Pending') : d.rows;
  const st = { Pending: 'y', Approved: 'g', Rejected: 'r', Cancelled: '' };
  box.innerHTML = `<div class="card tw" style="padding:0"><table id="lvt"><thead><tr>${mgr && HR.lvTab !== 'mine' ? '<th>Staff</th>' : ''}<th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th class="right">Actions</th></tr></thead><tbody>
   ${rows.map(r => { const own = r.user_id == ME.id, canDecide = mgr && r.status === 'Pending' && (!own || ME.role === 'admin');
     return `<tr>${mgr && HR.lvTab !== 'mine' ? `<td><b>${esc(r.user_name)}</b></td>` : ''}<td>${pill(r.type)}</td><td>${dmy(r.from_date)}${r.to_date !== r.from_date ? ' – ' + dmy(r.to_date) : ''}${r.half ? `<br><small class="mut">${r.half} half</small>` : ''}</td><td>${r.days}</td>
       <td>${esc(r.reason)}${r.approver_note ? `<br><small class="mut">${esc(r.approver_name || '')}: ${esc(r.approver_note)}</small>` : ''}</td><td>${pill(r.status, st[r.status])}</td>
       <td class="right" style="white-space:nowrap">${canDecide ? `<button class="btn ok sm" data-ap="${r.id}"><i class="i i-check"></i> Approve</button> <button class="btn bad sm" data-rj="${r.id}">Reject</button>` : ''}${(own && r.status === 'Pending') || (mgr && r.status === 'Approved') ? ` <button class="btn sec sm" data-cx="${r.id}">Cancel</button>` : ''}</td></tr>`; }).join('') || `<tr><td colspan="7" class="mut">${HR.lvTab === 'requests' ? 'No pending requests 🎉' : 'No leaves yet'}</td></tr>`}</tbody></table></div>`;
  const decide = async (id, decision) => { const note = prompt(decision === 'Approved' ? 'Note to the employee (optional):' : 'Reason for rejecting:', ''); if (note === null) return; if (decision === 'Rejected' && !note.trim()) return toast('Add a reason for rejecting', true); await api('hr', 'decide', { id, decision, note }); toast('Leave ' + decision.toLowerCase()); hrMe(); pgLeaves(); };
  $$('[data-ap]', box).forEach(b => b.onclick = () => decide(+b.dataset.ap, 'Approved'));
  $$('[data-rj]', box).forEach(b => b.onclick = () => decide(+b.dataset.rj, 'Rejected'));
  $$('[data-cx]', box).forEach(b => b.onclick = async () => { if (!confirm('Cancel this leave?')) return; await api('hr', 'cancel', { id: +b.dataset.cx }); toast('Leave cancelled'); hrMe(); pgLeaves(); });
}
async function applyModal(d) {
  const mgr = !!d.manage; let users = [];
  if (mgr) { try { users = (await api('calendar', 'list', undefined, '&from=2000-01-01&to=2000-01-01')).users; } catch (e) { } }
  const m = modal(`<h2 style="margin-top:0">Apply for leave</h2><div class="two">
   ${mgr && users.length ? `<div class="full"><label>For</label><select id="lu">${users.map(u => `<option value="${u.id}" ${u.id == ME.id ? 'selected' : ''}>${esc(u.name)}${u.id == ME.id ? ' (me)' : ''}</option>`).join('')}</select></div>` : ''}
   <div class="full"><label>Leave type</label><select id="lty">${d.cfg.leave_types.map(t => { const b = d.balance.find(x => x.code === t.code); return `<option value="${t.code}">${esc(t.name)}${b && b.left !== null ? ` — ${b.left - b.pending} left` : ''}</option>`; }).join('')}</select></div>
   <div><label>From</label><input type="date" id="lfr" value="${today()}"></div><div><label>To</label><input type="date" id="lto" value="${today()}"></div>
   <div class="full" id="lhw"><label>Half day?</label><select id="lhf"><option value="">Full day</option><option value="first">First half</option><option value="second">Second half</option></select></div>
   <div class="full"><label>Reason</label><textarea id="lrs" rows="3" placeholder="Reason for leave"></textarea></div></div>
   <div class="ldays" id="ldy"></div>
   <div class="bar" style="margin-top:12px"><button class="btn" id="lsv">Submit request</button><button class="btn sec" id="lcx">Cancel</button></div>`);
  const upd = async () => { const f = $('#lfr', m).value, t = $('#lto', m).value; $('#lhw', m).style.display = f && f === t ? '' : 'none'; if (f !== t) $('#lhf', m).value = '';
    if (!f || !t || t < f) { $('#ldy', m).textContent = '“To” must be on or after “From”'; return; }
    try { const r = await api('hr', 'days', undefined, `&from=${f}&to=${t}${$('#lhf', m).value ? '&half=1' : ''}`); $('#ldy', m).innerHTML = `<b>${r.days}</b> working day${r.days === 1 ? '' : 's'} <span class="mut">(weekly offs and holidays are not counted)</span>`; } catch (e) { } };
  ['#lfr', '#lto', '#lhf'].forEach(s => $(s, m).onchange = upd); upd();
  $('#lfr', m).addEventListener('change', () => { if ($('#lto', m).value < $('#lfr', m).value) { $('#lto', m).value = $('#lfr', m).value; upd(); } });
  $('#lcx', m).onclick = () => m.remove();
  $('#lsv', m).onclick = async () => { const r = await api('hr', 'apply', { user_id: $('#lu', m)?.value, type: $('#lty', m).value, from: $('#lfr', m).value, to: $('#lto', m).value, half: $('#lhf', m).value, reason: $('#lrs', m).value });
    m.remove(); toast(`Leave request sent (${r.days} day${r.days === 1 ? '' : 's'})`); HR.lvTab = 'mine'; hrMe(); pgLeaves(); };
}

// ---------- Settings → Attendance & leave ----------
async function drawHrSettings() {
  const box = $('#hrset'); if (!box) return;
  const c = (await api('hr', 'me')).cfg;
  box.innerHTML = `<div class="ch"><h3>Attendance & leave</h3></div><div class="two">
    <div><label>Office start time</label><input type="time" id="hs1" value="${esc(c.start)}"></div><div><label>Office end time</label><input type="time" id="hs7" value="${esc(c.end || '18:00')}"></div>
    <div><label>Grace (minutes before “Late”)</label><input type="number" id="hs2" value="${c.grace}"></div><div><label>Half day if check-in after / check-out before</label><input type="time" id="hs8" value="${esc(c.half_after || '14:00')}"></div>
    <div><label>Also half day if worked less than (hours, 0 = off)</label><input type="number" step="0.5" id="hs3" value="${c.half_hours}"></div><div><label>Full day hours</label><input type="number" step="0.5" id="hs4" value="${c.full_hours}"></div>
    <div class="full"><label>Salary day (weekly attendance ends on)</label><select id="hs9">${WD.map((w, i) => `<option value="${i}" ${(c.pay_day ?? 6) == i ? 'selected' : ''}>${w}</option>`).join('')}</select></div>
    <div class="full"><label>Weekly off</label><div class="wkd">${WD.map((w, i) => `<label class="ck"><input type="checkbox" data-wo="${i}" ${c.week_off.includes(i) ? 'checked' : ''}> ${w}</label>`).join('')}</div></div>
    <div class="full"><label>Holidays (one per line: YYYY-MM-DD | name)</label><textarea id="hs5" rows="5" placeholder="2026-12-25 | Christmas">${esc(c.holidays.map(h => h.date + ' | ' + h.name).join('\n'))}</textarea></div>
    <div class="full"><label>Leave types (one per line: CODE | name | days per year, 0 = unlimited/unpaid)</label><textarea id="hs6" rows="5">${esc(c.leave_types.map(t => t.code + ' | ' + t.name + ' | ' + t.quota).join('\n'))}</textarea></div></div>
    <button class="btn" id="hssv" style="margin-top:10px">Save attendance & leave settings</button>`;
  $('#hssv').onclick = async () => {
    const lines = id => $(id).value.split('\n').map(x => x.split('|').map(s => s.trim())).filter(x => x[0]);
    await api('hr', 'cfg_save', { value: { start: $('#hs1').value, end: $('#hs7').value, half_after: $('#hs8').value, pay_day: +$('#hs9').value, grace: $('#hs2').value, half_hours: $('#hs3').value, full_hours: $('#hs4').value, week_off: $$('[data-wo]').filter(x => x.checked).map(x => +x.dataset.wo),
      holidays: lines('#hs5').map(([date, name]) => ({ date, name: name || 'Holiday' })), leave_types: lines('#hs6').map(([code, name, quota]) => ({ code, name, quota: +quota || 0 })) } });
    toast('Attendance & leave settings saved'); hrMe(); drawHrSettings();
  };
}

// ---------- Weekly attendance (salary week ends on the pay day, default Saturday) ----------
const payDay = () => (HR.me && HR.me.cfg.pay_day != null) ? +HR.me.cfg.pay_day : 6;
function weekEnd(dt) { const d = new Date(dt); const diff = (payDay() - d.getDay() + 7) % 7; d.setDate(d.getDate() + diff); return d; }
const ymd2 = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
async function attWeek(mine) {
  if (!HR.wkEnd) HR.wkEnd = ymd2(weekEnd(new Date()));
  const end = new Date(HR.wkEnd + 'T00:00:00'), start = new Date(end); start.setDate(end.getDate() - 6);
  const from = ymd2(start), to = HR.wkEnd;
  const d = await api('hr', 'range', undefined, `&from=${from}&to=${to}${mine ? '&mine=1' : ''}`), box = $('#atb'); if (!box) return;
  const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(start); x.setDate(start.getDate() + i); return ymd2(x); });
  const hol = Object.fromEntries(d.cfg.holidays.map(h => [h.date, h.name])), paid = Object.fromEntries(d.cfg.leave_types.map(t => [t.code, +t.quota > 0]));
  const rec = {}; d.records.forEach(r => rec[r.user_id + '|' + r.date] = r);
  const lvOn = (u, ds) => d.leaves.find(l => l.user_id == u && ds >= l.from_date && ds <= l.to_date);
  const day = (u, ds) => { const r = rec[u + '|' + ds], l = lvOn(u, ds), wd = new Date(ds + 'T00:00:00').getDay();
    if (r && r.status === 'Absent') return { k: 'A', c: 'ab', pay: 0, work: 1, tip: 'Absent' + (r.notes ? ' · ' + r.notes : '') };
    if (r && (r.check_in || r.status)) { const hd = r.status === 'Half day', h = hrsBetween(r.check_in, r.check_out);
      return { k: { Present: 'P', Late: 'L', 'Half day': 'HD', 'On duty': 'OD' }[r.status] || 'P', c: { Present: 'pr', Late: 'lt', 'Half day': 'hd', 'On duty': 'od' }[r.status] || 'pr', pay: hd ? .5 : 1, work: d.cfg.week_off.includes(wd) || hol[ds] ? 0 : 1, hrs: h, late: r.status === 'Late', hd, early: r.check_out && r.check_out < (d.cfg.end || '18:00') && !hd,
        tip: `${r.status} ${r.check_in || ''}${r.check_out ? '–' + r.check_out : ' (no check-out)'}${r.notes ? ' · ' + r.notes : ''}` }; }
    if (hol[ds]) return { k: 'H', c: 'ho', pay: 1, work: 0, tip: 'Holiday · ' + hol[ds] };
    if (d.cfg.week_off.includes(wd)) return { k: 'WO', c: 'wo', pay: 0, work: 0, tip: 'Weekly off' };
    if (l) { const p = paid[l.type] ? (l.half ? .5 : 1) : 0; return { k: l.half ? 'HL' : 'LV', c: 'lv', pay: p, work: 1, lv: l.half ? .5 : 1, lop: paid[l.type] ? 0 : (l.half ? .5 : 1), tip: 'Leave · ' + l.type + (paid[l.type] ? ' (paid)' : ' (unpaid)') }; }
    if (ds > d.today) return { k: '', c: '', pay: 0, work: 1, future: 1, tip: 'Upcoming' };
    return { k: 'A', c: 'ab', pay: 0, work: 1, tip: 'Absent (no check-in)' };
  };
  const sum = u => { const s = { work: 0, pay: 0, P: 0, L: 0, HD: 0, A: 0, LV: 0, LOP: 0, hrs: 0, early: 0 }; days.forEach(ds => { const x = day(u, ds); s.work += x.work; s.pay += x.pay; s.hrs += x.hrs || 0; if (x.k === 'P' || x.k === 'OD') s.P++; if (x.k === 'L') { s.L++; } if (x.hd) s.HD++; if (x.k === 'A') s.A++; if (x.lv) s.LV += x.lv; if (x.lop) s.LOP += x.lop; if (x.early) s.early++; }); return s; };
  const lbl = `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const isCur = HR.wkEnd === ymd2(weekEnd(new Date()));
  const html = `<div class="card"><div class="ch"><h3>${mine ? 'My week' : 'Weekly attendance'} <span class="mut" style="font-weight:400">· salary on ${WD[payDay()]} ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></h3><span class="sp"></span>
     <button class="btn sec sm" id="wkp" title="Previous week">‹</button><b style="font-size:14px;white-space:nowrap">${lbl}</b><button class="btn sec sm" id="wkn" title="Next week" ${isCur ? 'disabled' : ''}>›</button>${isCur ? '' : '<button class="btn sec sm" id="wkt">This week</button>'}${mine ? '' : '<button class="btn sec sm" id="wkcsv"><i class="i i-download"></i> CSV</button>'}</div>
    <div class="tw areg"><table class="regt wkt" data-nofit="1"><thead><tr><th class="rn">Staff</th>${days.map(ds => { const dt = new Date(ds + 'T00:00:00'); return `<th class="${ds === d.today ? 'tdy' : ''}"><small>${WD[dt.getDay()]}</small>${dt.getDate()}</th>`; }).join('')}<th>Hours</th><th>Late</th><th>Half</th><th>Leave</th><th>Absent</th><th class="pay">Payable days</th></tr></thead><tbody>
    ${d.users.map(u => { const s = sum(u.id); return `<tr><td class="rn"><b>${esc(u.name)}</b></td>${days.map(ds => { const x = day(u.id, ds); return `<td><button class="ac ${x.c}" data-u="${u.id}" data-d="${ds}" title="${esc(ds + ' · ' + x.tip)}" ${!mine && !x.c.match(/lv|ho|wo/) && ds <= d.today ? '' : 'disabled'}>${x.k}${x.early ? '<sup>e</sup>' : ''}</button>${x.hrs ? `<small class="wkh">${fmtH(x.hrs)}</small>` : ''}</td>`; }).join('')}
      <td>${fmtH(s.hrs)}</td><td>${s.L || ''}</td><td>${s.HD || ''}</td><td>${s.LV ? s.LV + (s.LOP ? ` <small class="over">(${s.LOP} unpaid)</small>` : '') : ''}</td><td class="${s.A ? 'over' : ''}">${s.A || ''}</td><td class="pay"><b>${s.pay}</b> <small class="mut">/ ${s.work}</small></td></tr>`; }).join('')}</tbody></table></div>
    <p class="mut" style="font-size:12px;margin:8px 0 0"><b>Payable days</b> = full days (late counts as a full day) + ½ for half days + paid leave + holidays, out of the week's working days. Unpaid leave (LOP) and absences are not paid. <sup>e</sup> = left before ${esc(d.cfg.end || '18:00')}.${mine ? '' : ' Click a day to correct it.'}</p></div>`;
  box.innerHTML = html;
  $('#wkp').onclick = () => { const x = new Date(HR.wkEnd + 'T00:00:00'); x.setDate(x.getDate() - 7); HR.wkEnd = ymd2(x); attWeek(mine); };
  $('#wkn').onclick = () => { const x = new Date(HR.wkEnd + 'T00:00:00'); x.setDate(x.getDate() + 7); HR.wkEnd = ymd2(x); attWeek(mine); };
  if ($('#wkt')) $('#wkt').onclick = () => { HR.wkEnd = ymd2(weekEnd(new Date())); attWeek(mine); };
  if (!mine) $$('.wkt button.ac:not([disabled])', box).forEach(b => b.onclick = () => { const u = d.users.find(x => x.id == b.dataset.u), r = rec[b.dataset.u + '|' + b.dataset.d] || {}; attEdit({ ...r, user_id: u.id, name: u.name, date: b.dataset.d }, () => attWeek(false)); });
  if ($('#wkcsv')) $('#wkcsv').onclick = () => csvDownload(`attendance-week-${from}-to-${to}.csv`, ['name', ...days.map(x => WD[new Date(x + 'T00:00:00').getDay()] + ' ' + x.slice(8)), 'hours', 'late', 'half_days', 'leave', 'unpaid_leave', 'absent', 'payable_days', 'working_days'],
    d.users.map(u => { const s = sum(u.id), o = { name: u.name, hours: s.hrs.toFixed(2), late: s.L, half_days: s.HD, leave: s.LV, unpaid_leave: s.LOP, absent: s.A, payable_days: s.pay, working_days: s.work }; days.forEach(ds => o[WD[new Date(ds + 'T00:00:00').getDay()] + ' ' + ds.slice(8)] = day(u.id, ds).k); return o; }));
}
