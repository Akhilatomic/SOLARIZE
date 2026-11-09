// Calendar: month / week / day / agenda views, events CRUD, drag & drop reschedule, lead appointments, project dates,
// filters, reminders, Google Calendar link and .ics export.
const CAL = { view: 'month', date: null, hide: new Set(), user: '', sel: null, data: null };
const CT = { 'Site visit': 'site', 'Installation': 'inst', 'Follow-up': 'fu', 'Meeting': 'meet', 'KSEB inspection': 'kseb', 'Payment': 'pay', 'Other': 'oth', 'Lead appointment': 'appt', 'Project': 'proj' };
const pad2 = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const pdate = s => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = d => addD(d, -((d.getDay() + 6) % 7));
const hm = t => t ? (+t.slice(0, 2) % 12 || 12) + ':' + t.slice(3, 5) + (+t.slice(0, 2) < 12 ? ' am' : ' pm') : '';
const mins = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const DAY0 = 6, DAY1 = 22, HPX = 48; // week/day grid 6am–10pm

function calRange() {
  const d = CAL.date;
  if (CAL.view === 'month') { const f = monday(new Date(d.getFullYear(), d.getMonth(), 1)); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0); const t = addD(monday(last), 6); return [f, t]; }
  if (CAL.view === 'week') { const f = monday(d); return [f, addD(f, 6)]; }
  if (CAL.view === 'day') return [d, d];
  return [d, addD(d, 59)];
}
function calItems() {
  const D = CAL.data, out = [];
  for (const e of D.events) {
    const sd = e.start.slice(0, 10), ed = (e.end || e.start).slice(0, 10);
    out.push({ kind: 'event', id: e.id, title: e.title, type: e.type, date: sd, endDate: ed < sd ? sd : ed, time: e.all_day ? '' : e.start.slice(11, 16), endTime: !e.all_day && e.end && e.end.length > 10 ? e.end.slice(11, 16) : '', status: e.status, raw: e, can: !!e.can_edit,
      sub: [e.user_name, e.lead_name || e.customer_name || e.project_title, e.location].filter(Boolean).join(' · ') });
  }
  if (!CAL.hide.has('Lead appointment')) for (const l of D.appts) out.push({ kind: 'appt', id: l.id, title: l.name, type: 'Lead appointment', date: l.appt, endDate: l.appt, time: '', status: l.status, raw: l, can: !!l.can_edit, sub: [l.owner_name ? 'Claimed by ' + l.owner_name : 'Unclaimed', l.city, l.phone].filter(Boolean).join(' · ') });
  if (!CAL.hide.has('Project')) for (const p of D.projects) {
    if (p.start) out.push({ kind: 'proj', id: p.id, title: 'Start: ' + (p.customer || p.title), type: 'Project', date: p.start, endDate: p.start, time: '', raw: p, can: false, sub: p.title + ' · ' + p.stage });
    if (p.end) out.push({ kind: 'proj', id: p.id, title: 'Finish: ' + (p.customer || p.title), type: 'Project', date: p.end, endDate: p.end, time: '', raw: p, can: false, sub: p.title + ' · ' + p.stage });
  }
  return out.filter(i => !CAL.hide.has(i.type)).sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')));
}
const onDay = (it, ds) => it.date <= ds && it.endDate >= ds;
const chip = (it, ds) => `<div class="ce t-${CT[it.type] || 'oth'} ${it.status === 'Done' ? 'done' : ''} ${it.status === 'Cancelled' ? 'cxl' : ''}" draggable="${it.can && it.kind !== 'proj' && it.date === it.endDate ? 'true' : 'false'}" data-k="${it.kind}" data-id="${it.id}" data-d="${ds || it.date}" title="${esc(it.title + (it.time ? ' · ' + hm(it.time) : '') + (it.sub ? '\n' + it.sub : ''))}">${it.time ? `<b>${hm(it.time)}</b> ` : ''}${esc(it.title)}</div>`;

async function pgCalendar() {
  if (!CAL.date) { CAL.date = pdate(today()); CAL.sel = today(); }
  const [f, t] = calRange();
  CAL.data = await api('calendar', 'list', undefined, `&from=${ymd(f)}&to=${ymd(t)}${CAL.user ? '&user=' + CAL.user : ''}`);
  const w = canW('calendar'), d = CAL.date;
  const label = CAL.view === 'month' ? d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : CAL.view === 'week' ? `${f.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : CAL.view === 'day' ? d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Next 60 days from ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const types = [...CAL.data.types, 'Lead appointment', 'Project'];
  $('#main').innerHTML = `<div class="bar calbar"><h2 style="margin:0;font-size:26px">Calendar</h2>
    <button class="btn sec sm" id="ctoday">Today</button><button class="btn sec sm" id="cprev" title="Previous">‹</button><button class="btn sec sm" id="cnext" title="Next">›</button><b class="clabel">${label}</b>
    <span class="sp"></span><div class="tabs" style="margin:0">${[['month', 'Month'], ['week', 'Week'], ['day', 'Day'], ['agenda', 'Agenda']].map(([k, l]) => `<button data-v="${k}" class="${CAL.view === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <button class="btn sec sm" id="cics" title="Download these events as .ics"><i class="i i-download"></i> .ics</button>${w ? '<button class="btn" id="cnew"><i class="i i-plus"></i> New event</button>' : ''}</div>
   <div class="bar calf">${types.map(x => `<button class="cf t-${CT[x]} ${CAL.hide.has(x) ? 'off' : ''}" data-t="${esc(x)}"><i></i>${esc(x)}</button>`).join('')}<span class="sp"></span>
    <select id="cuser" title="Show events for"><option value="">Everyone</option>${CAL.data.users.map(u => `<option value="${u.id}" ${CAL.user == u.id ? 'selected' : ''}>${u.id == ME.id ? 'Me (' + esc(u.name) + ')' : esc(u.name)}</option>`).join('')}</select></div>
   <div class="calwrap"><div id="cview" class="cview fitbox"></div><div class="cside card" id="cside"></div></div>`;
  $$('[data-v]', $('.calbar')).forEach(b => b.onclick = () => { CAL.view = b.dataset.v; if (CAL.sel) CAL.date = pdate(CAL.sel); route(); });
  $('#ctoday').onclick = () => { CAL.date = pdate(today()); CAL.sel = today(); route(); };
  const step = n => { const x = new Date(CAL.date); if (CAL.view === 'month') { x.setDate(1); x.setMonth(x.getMonth() + n); } else x.setDate(x.getDate() + n * (CAL.view === 'week' ? 7 : CAL.view === 'day' ? 1 : 30)); CAL.date = x; CAL.sel = ymd(x); route(); };
  $('#cprev').onclick = () => step(-1); $('#cnext').onclick = () => step(1);
  $$('.cf').forEach(b => b.onclick = () => { const x = b.dataset.t; CAL.hide.has(x) ? CAL.hide.delete(x) : CAL.hide.add(x); drawCal(); b.classList.toggle('off'); });
  $('#cuser').onchange = e => { CAL.user = e.target.value; route(); };
  $('#cics').onclick = exportIcs;
  if ($('#cnew')) $('#cnew').onclick = () => evModal({ start: CAL.sel || today() });
  drawCal();
}

function drawCal() {
  const items = calItems(), box = $('#cview'); if (!box) return;
  if (CAL.view === 'month') drawMonth(box, items); else if (CAL.view === 'agenda') drawAgenda(box, items); else drawWeek(box, items);
  drawSide(items); bindItems(box);
  requestAnimationFrame(() => { autoFit(); if (CAL.view === 'month') { box.style.height = box.style.maxHeight; fitMonth(); } });
}
function drawMonth(box, items) {
  const [f, t] = calRange(), cur = CAL.date.getMonth(), td = today(); let cells = '';
  for (let d = new Date(f); d <= t; d = addD(d, 1)) {
    const ds = ymd(d), its = items.filter(i => onDay(i, ds));
    cells += `<div class="cd2 ${d.getMonth() !== cur ? 'out' : ''} ${ds === td ? 'tdy' : ''} ${ds === CAL.sel ? 'sel' : ''}" data-day="${ds}"><div class="cdn"><span>${d.getDate()}</span></div><div class="cevs">${its.map(i => chip(i, ds)).join('')}</div><button class="cmore hide" data-more="${ds}"></button></div>`;
  }
  box.className = 'cview fitbox month';
  box.innerHTML = `<div class="cmh">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<div>${x}</div>`).join('')}</div><div class="cmg" style="grid-template-rows:repeat(${Math.round((t - f) / 864e5 + 1) / 7},1fr)">${cells}</div>`;
  $$('.cd2', box).forEach(c => {
    c.onclick = e => { if (e.target.closest('.ce,.cmore')) return; CAL.sel = c.dataset.day; $$('.cd2.sel', box).forEach(x => x.classList.remove('sel')); c.classList.add('sel'); drawSide(calItems()); };
    c.ondblclick = e => { if (!e.target.closest('.ce') && canW('calendar')) evModal({ start: c.dataset.day }); };
  });
  $$('.cmore', box).forEach(b => b.onclick = () => { CAL.sel = b.dataset.more; CAL.date = pdate(CAL.sel); CAL.view = 'day'; route(); });
  dropTargets($$('.cd2', box), c => c.dataset.day, null);
}
// show as many chips as fit in each cell, then "+N more"
function fitMonth() {
  $$('.cd2').forEach(c => {
    const list = $('.cevs', c), evs = [...list.children], more = $('.cmore', c); evs.forEach(e => e.style.display = '');
    more.classList.add('hide'); const room = c.clientHeight - $('.cdn', c).offsetHeight - 6; let used = 0, shown = 0;
    for (const e of evs) { used += e.offsetHeight + 3; if (used > room - (shown < evs.length - 1 ? 20 : 0) && shown < evs.length) { e.style.display = 'none'; } else shown++; }
    if (shown < evs.length) { more.textContent = '+' + (evs.length - shown) + ' more'; more.classList.remove('hide'); }
  });
}
function drawWeek(box, items) {
  const [f, t] = calRange(), days = []; for (let d = new Date(f); d <= t; d = addD(d, 1)) days.push(ymd(d));
  const td = today(), H = DAY1 - DAY0;
  box.className = 'cview fitbox week';
  const allday = ds => items.filter(i => onDay(i, ds) && !i.time);
  const timed = ds => { // lay out overlapping events side by side
    const ev = items.filter(i => i.date === ds && i.time).map(i => ({ ...i, s: mins(i.time), e: i.endTime && i.endDate === ds ? Math.max(mins(i.endTime), mins(i.time) + 30) : mins(i.time) + 60 }));
    const lanes = []; ev.forEach(x => { let k = lanes.findIndex(end => end <= x.s); if (k < 0) { k = lanes.length; lanes.push(0); } lanes[k] = x.e; x.lane = k; }); ev.forEach(x => x.n = lanes.length || 1); return ev;
  };
  box.innerHTML = `<div class="cwh" style="grid-template-columns:56px repeat(${days.length},1fr)"><div></div>${days.map(ds => `<div class="${ds === td ? 'tdy' : ''}" data-day="${ds}"><small>${pdate(ds).toLocaleDateString('en-GB', { weekday: 'short' })}</small><b>${pdate(ds).getDate()}</b></div>`).join('')}</div>
   <div class="cwa" style="grid-template-columns:56px repeat(${days.length},1fr)"><div class="mut">all-day</div>${days.map(ds => `<div class="cwad" data-day="${ds}">${allday(ds).map(i => chip(i, ds)).join('')}</div>`).join('')}</div>
   <div class="cwb" style="grid-template-columns:56px repeat(${days.length},1fr)"><div class="cwt">${Array.from({ length: H }, (_, h) => `<div style="height:${HPX}px">${hm(pad2(DAY0 + h) + ':00').replace(':00', '')}</div>`).join('')}</div>
    ${days.map(ds => `<div class="cwc ${ds === td ? 'tdy' : ''}" data-day="${ds}" style="height:${H * HPX}px">${Array.from({ length: H }, (_, h) => `<div class="cws" style="top:${h * HPX}px;height:${HPX}px"></div>`).join('')}
      ${timed(ds).map(x => { const top = Math.max(0, (x.s - DAY0 * 60) / 60 * HPX), h = Math.max(22, (x.e - x.s) / 60 * HPX - 2); return `<div class="cwe-wrap" style="top:${top}px;height:${h}px;left:calc(${x.lane / x.n * 100}% + 2px);width:calc(${100 / x.n}% - 4px)">${chip(x, ds).replace('class="ce', 'class="ce cwe')}</div>`; }).join('')}
      ${ds === td ? `<div class="cnow" style="top:${(new Date().getHours() * 60 + new Date().getMinutes() - DAY0 * 60) / 60 * HPX}px"></div>` : ''}</div>`).join('')}</div>`;
  $$('.cwc', box).forEach(c => {
    c.onclick = e => { if (e.target.closest('.ce') || !canW('calendar')) return; const y = e.clientY - c.getBoundingClientRect().top; const m = Math.floor((DAY0 * 60 + y / HPX * 60) / 30) * 30; evModal({ start: c.dataset.day + 'T' + pad2(Math.floor(m / 60)) + ':' + pad2(m % 60) }); };
  });
  $$('.cwh [data-day]', box).forEach(h => h.onclick = () => { CAL.sel = h.dataset.day; CAL.date = pdate(CAL.sel); CAL.view = 'day'; route(); });
  $$('.cwad', box).forEach(c => c.ondblclick = e => { if (!e.target.closest('.ce') && canW('calendar')) evModal({ start: c.dataset.day }); });
  dropTargets($$('.cwc', box), c => c.dataset.day, (c, e) => { const y = e.clientY - c.getBoundingClientRect().top; const m = Math.max(DAY0 * 60, Math.round((DAY0 * 60 + y / HPX * 60) / 15) * 15); return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); });
  dropTargets($$('.cwad', box), c => c.dataset.day, null);
  const now = new Date().getHours(); box.scrollTop = Math.max(0, ((CAL.view === 'day' || days.includes(td) ? Math.min(now, 17) : 8) - DAY0 - 1) * HPX);
}
function drawAgenda(box, items) {
  const [f, t] = calRange(), groups = []; box.className = 'cview fitbox agenda';
  for (let d = new Date(f); d <= t; d = addD(d, 1)) { const ds = ymd(d), its = items.filter(i => onDay(i, ds)); if (its.length) groups.push([ds, its]); }
  box.innerHTML = groups.map(([ds, its]) => `<div class="cag"><div class="cagd ${ds === today() ? 'tdy' : ''}"><b>${pdate(ds).getDate()}</b><small>${pdate(ds).toLocaleDateString('en-GB', { weekday: 'short', month: 'short' })}</small></div><div class="cagl">${its.map(i => `<div class="cagi" data-k="${i.kind}" data-id="${i.id}"><span class="cagt">${i.time ? hm(i.time) + (i.endTime ? ' – ' + hm(i.endTime) : '') : 'All day'}</span><span class="cf t-${CT[i.type]}"><i></i>${esc(i.type)}</span><span class="cagx"><b class="${i.status === 'Done' ? 'done' : ''} ${i.status === 'Cancelled' ? 'cxl' : ''}">${esc(i.title)}</b><small class="mut">${esc(i.sub || '')}</small></span>${i.kind === 'event' && i.status && i.status !== 'Scheduled' ? pill(i.status, i.status === 'Done' ? 'g' : 'r') : ''}</div>`).join('')}</div></div>`).join('')
    || '<p class="mut" style="padding:20px">Nothing scheduled in the next 60 days.</p>';
}
function drawSide(items) {
  const ds = CAL.sel || today(), its = items.filter(i => onDay(i, ds)), side = $('#cside'); if (!side) return;
  const up = items.filter(i => i.date > ds).slice(0, 8);
  side.innerHTML = `<div class="ch"><h3>${pdate(ds).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>${canW('calendar') ? '<button class="btn sm" id="sadd"><i class="i i-plus"></i> Add</button>' : ''}</div>
   ${its.map(i => `<div class="sitem" data-k="${i.kind}" data-id="${i.id}"><span class="sdot t-${CT[i.type]}"></span><div><b class="${i.status === 'Done' ? 'done' : ''} ${i.status === 'Cancelled' ? 'cxl' : ''}">${esc(i.title)}</b><small>${i.time ? hm(i.time) + (i.endTime ? ' – ' + hm(i.endTime) : '') : 'All day'} · ${esc(i.type)}</small>${i.sub ? `<small class="mut">${esc(i.sub)}</small>` : ''}</div></div>`).join('') || '<p class="mut" style="font-size:13px">Nothing scheduled. Double-click a day to add an event.</p>'}
   ${up.length ? `<h3 style="margin-top:18px">Coming up</h3>${up.map(i => `<div class="sitem" data-k="${i.kind}" data-id="${i.id}"><span class="sdot t-${CT[i.type]}"></span><div><b>${esc(i.title)}</b><small>${pdate(i.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}${i.time ? ' · ' + hm(i.time) : ''} · ${esc(i.type)}</small></div></div>`).join('')}` : ''}`;
  if ($('#sadd')) $('#sadd').onclick = () => evModal({ start: ds });
  bindItems(side);
}
function bindItems(root) {
  $$('.ce,.sitem,.cagi', root).forEach(el => el.onclick = e => {
    e.stopPropagation(); const k = el.dataset.k, id = +el.dataset.id;
    if (k === 'event') evModal(CAL.data.events.find(x => x.id === id));
    if (k === 'appt') leadModal(id);
    if (k === 'proj') { TAB.proj = 'overview'; location.hash = '#/projects/' + id; }
  });
  $$('.ce[draggable=true]', root).forEach(el => el.ondragstart = e => { e.dataTransfer.setData('text/plain', JSON.stringify({ k: el.dataset.k, id: +el.dataset.id, from: el.dataset.d })); e.dataTransfer.effectAllowed = 'move'; });
}
function dropTargets(cells, dayOf, timeOf) {
  cells.forEach(c => {
    c.ondragover = e => { e.preventDefault(); c.classList.add('drop'); };
    c.ondragleave = () => c.classList.remove('drop');
    c.ondrop = async e => {
      e.preventDefault(); c.classList.remove('drop');
      let p; try { p = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (x) { return; }
      const day = dayOf(c), tm = timeOf ? timeOf(c, e) : null;
      if (p.k === 'appt') { if (day === p.from) return; await api('calendar', 'move', { kind: 'appt', id: p.id, start: day }); toast('Appointment moved to ' + pdate(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })); return route(); }
      const ev = CAL.data.events.find(x => x.id === p.id); if (!ev) return;
      const oldT = ev.all_day ? '' : ev.start.slice(11, 16), newT = tm || oldT;
      if (day === p.from && newT === oldT) return;
      let start = day + (ev.all_day && !tm ? '' : 'T' + (newT || '09:00')), end = '';
      if (ev.end) { const dur = (new Date(ev.end.length > 10 ? ev.end : ev.end + 'T00:00') - new Date(ev.start.length > 10 ? ev.start : ev.start + 'T00:00')); const ne = new Date(new Date(start.length > 10 ? start : start + 'T00:00').getTime() + dur); end = ev.end.length > 10 || start.length > 10 ? ymd(ne) + 'T' + pad2(ne.getHours()) + ':' + pad2(ne.getMinutes()) : ymd(ne); }
      if (tm && ev.all_day) { await api('calendar', 'save', { ...ev, all_day: 0, start, end: '' }); } else await api('calendar', 'move', { id: ev.id, start, end });
      toast('Event moved'); route();
    };
  });
}

async function evModal(ev) {
  ev = ev || {}; const isNew = !ev.id, w = isNew ? canW('calendar') : !!ev.can_edit;
  const [ls, cs, ps] = await Promise.all([canR('leads') ? api('leads', 'list') : [], canR('customers') ? api('customers', 'list') : [], canR('projects') ? api('projects', 'list') : []]);
  const s = ev.start || today(), e = ev.end || '', allDay = isNew ? s.length <= 10 : !!ev.all_day;
  const sT = s.length > 10 ? s.slice(11, 16) : '10:00', eT = e.length > 10 ? e.slice(11, 16) : (() => { const m = mins(sT) + 60; return pad2(Math.min(23, Math.floor(m / 60))) + ':' + pad2(m % 60); })();
  const users = CAL.data ? CAL.data.users : [];
  const m = modal(`<h2 style="margin-top:0">${isNew ? 'New event' : 'Event'}</h2><div class="two">
   <div class="full"><label>Title</label><input id="et" value="${esc(ev.title || '')}" placeholder="e.g. Site visit — Hari Kumar"></div>
   <div><label>Type</label><select id="ety">${(CAL.data ? CAL.data.types : Object.keys(CT).slice(0, 7)).map(x => `<option ${ev.type === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
   <div><label>Assigned to</label><select id="eu"><option value="">Team (everyone)</option>${users.map(u => `<option value="${u.id}" ${(isNew ? ME.id : ev.user_id) == u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
   <div class="full"><label style="display:flex;gap:8px;align-items:center;color:var(--tx);font-size:14px"><input type="checkbox" id="ead" style="width:auto" ${allDay ? 'checked' : ''}> All day</label></div>
   <div><label>Start date</label><input type="date" id="esd" value="${s.slice(0, 10)}"></div><div class="tm"><label>Start time</label><input type="time" id="est" step="900" value="${sT}"></div>
   <div><label>End date</label><input type="date" id="eed" value="${(e || s).slice(0, 10)}"></div><div class="tm"><label>End time</label><input type="time" id="eet" step="900" value="${eT}"></div>
   <div><label>Lead</label><select id="el"><option value="">—</option>${ls.filter(l => l.can_edit || l.id == ev.lead_id).map(l => `<option value="${l.id}" ${ev.lead_id == l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
   <div><label>Customer</label><select id="ec"><option value="">—</option>${cs.map(c => `<option value="${c.id}" ${ev.customer_id == c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
   <div><label>Project</label><select id="ep"><option value="">—</option>${ps.map(p => `<option value="${p.id}" ${ev.project_id == p.id ? 'selected' : ''}>${esc((p.customer ? p.customer + ' — ' : '') + p.title)}</option>`).join('')}</select></div>
   <div><label>Reminder</label><select id="er">${[[0, 'None'], [5, '5 min before'], [10, '10 min before'], [15, '15 min before'], [30, '30 min before'], [60, '1 hour before'], [1440, '1 day before']].map(([v, t]) => `<option value="${v}" ${(ev.remind ?? 10) == v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
   <div class="full"><label>Location</label><input id="eloc" value="${esc(ev.location || '')}" placeholder="Address or Google Maps link"></div>
   <div class="full"><label>Notes</label><textarea id="en" rows="3">${esc(ev.notes || '')}</textarea></div>
   ${isNew ? '' : `<div><label>Status</label><select id="es">${['Scheduled', 'Done', 'Cancelled'].map(x => `<option ${ev.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div><label>Created by</label><input disabled value="${esc(ev.created_by_name || '')}"></div>`}</div>
   <div class="bar" style="margin-top:14px">${w ? '<button class="btn" id="esv">Save</button>' : ''}<button class="btn sec" id="ecx">Close</button>
    ${!isNew && w && ev.status !== 'Done' ? '<button class="btn sec" id="edone"><i class="i i-check"></i> Mark done</button>' : ''}
    ${!isNew ? '<a class="btn sec" id="egc" target="_blank" title="Add to Google Calendar"><i class="i i-calendar"></i> Google</a>' : ''}
    ${!isNew && ev.location ? `<a class="btn sec" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}"><i class="i i-target"></i> Map</a>` : ''}
    <span class="sp"></span>${!isNew && w ? '<button class="btn bad" id="edl">Delete</button>' : ''}</div>`);
  const tog = () => $$('.tm', m).forEach(x => x.style.display = $('#ead', m).checked ? 'none' : ''); $('#ead', m).onchange = tog; tog();
  if (!w) $$('input,select,textarea', m).forEach(x => x.disabled = true);
  // picking a lead/customer pre-fills an empty title and location
  $('#el', m).onchange = () => { const l = ls.find(x => x.id == $('#el', m).value); if (l && !$('#et', m).value) $('#et', m).value = $('#ety', m).value + ' — ' + l.name; if (l && !$('#eloc', m).value) $('#eloc', m).value = [l.location || l.address, l.city].filter(Boolean).join(', '); };
  $('#ec', m).onchange = () => { const c = cs.find(x => x.id == $('#ec', m).value); if (c && !$('#et', m).value) $('#et', m).value = $('#ety', m).value + ' — ' + c.name; if (c && !$('#eloc', m).value) $('#eloc', m).value = c.address || ''; };
  const collectEv = () => { const ad = $('#ead', m).checked, sd = $('#esd', m).value, ed = $('#eed', m).value;
    return { id: ev.id, title: $('#et', m).value, type: $('#ety', m).value, all_day: ad ? 1 : 0, start: ad ? sd : sd + 'T' + ($('#est', m).value || '10:00'), end: ad ? (ed && ed !== sd ? ed : '') : (ed || sd) + 'T' + ($('#eet', m).value || '11:00'),
      user_id: $('#eu', m).value, lead_id: $('#el', m).value, customer_id: $('#ec', m).value, project_id: $('#ep', m).value, remind: $('#er', m).value, location: $('#eloc', m).value, notes: $('#en', m).value, status: $('#es', m)?.value || 'Scheduled' }; };
  $('#ecx', m).onclick = () => m.remove();
  if ($('#esv', m)) $('#esv', m).onclick = async () => { const o = collectEv(); if (!o.title.trim()) return alert('Title required'); await api('calendar', 'save', o); m.remove(); toast(isNew ? 'Event added' : 'Event saved'); if (location.hash.startsWith('#/calendar')) route(); };
  if ($('#edone', m)) $('#edone', m).onclick = async () => { await api('calendar', 'status', { id: ev.id, status: 'Done' }); m.remove(); toast('Marked done'); route(); };
  if ($('#edl', m)) $('#edl', m).onclick = async () => { if (confirm('Delete this event?')) { await api('calendar', 'delete', { id: ev.id }); m.remove(); toast('Event deleted'); route(); } };
  if ($('#egc', m)) { const o = collectEv(), z = x => x.replace(/[-:]/g, ''), nd = d => ymd(addD(pdate(d), 1)).replace(/-/g, '');
    const dates = o.all_day ? z(o.start) + '/' + (o.end ? nd(o.end) : nd(o.start)) : z(o.start) + '00/' + z(o.end) + '00';
    $('#egc', m).href = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(o.title)}&dates=${dates}&details=${encodeURIComponent(o.notes || '')}&location=${encodeURIComponent(o.location || '')}&ctz=Asia/Kolkata`; }
}

function exportIcs() {
  const evs = (CAL.data?.events || []).filter(e => !CAL.hide.has(e.type)); if (!evs.length) return toast('No events in this view to export', true);
  const z = x => x.replace(/[-:]/g, ''), esc2 = t => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jasper Solar//Solarize CRM//EN', 'CALSCALE:GREGORIAN'];
  for (const e of evs) {
    L.push('BEGIN:VEVENT', 'UID:solarize-ev-' + e.id + '@' + location.host, 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z');
    if (e.all_day) { L.push('DTSTART;VALUE=DATE:' + z(e.start.slice(0, 10)), 'DTEND;VALUE=DATE:' + ymd(addD(pdate(e.end || e.start), 1)).replace(/-/g, '')); }
    else { L.push('DTSTART;TZID=Asia/Kolkata:' + z(e.start) + '00', 'DTEND;TZID=Asia/Kolkata:' + z(e.end && e.end.length > 10 ? e.end : e.start.slice(0, 11) + pad2(Math.min(23, +e.start.slice(11, 13) + 1)) + e.start.slice(13)) + '00'); }
    L.push('SUMMARY:' + esc2(e.title), 'CATEGORIES:' + esc2(e.type), 'LOCATION:' + esc2(e.location), 'DESCRIPTION:' + esc2([e.notes, e.user_name && 'Assigned: ' + e.user_name].filter(Boolean).join('\n')), 'STATUS:' + (e.status === 'Cancelled' ? 'CANCELLED' : 'CONFIRMED'), 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([L.join('\r\n')], { type: 'text/calendar' })); a.download = 'solarize-calendar-' + today() + '.ics'; a.click();
}

// reminders while the CRM is open: toast + sound + desktop notification
let CALUP = [], CALT1 = null, CALT2 = null;
function startCal() {
  clearInterval(CALT1); clearInterval(CALT2); if (!canR('calendar')) return;
  const load = async () => { try { CALUP = await api('calendar', 'upcoming'); } catch (e) { } };
  const tick = () => {
    const now = Date.now(); let seen; try { seen = JSON.parse(sessionStorage.calSeen || '[]'); } catch (e) { seen = []; }
    for (const e of CALUP) {
      if (!+e.remind) continue; const at = new Date(e.start).getTime(), key = e.id + '@' + e.start;
      if (now >= at - e.remind * 60000 && now < at + 5 * 60000 && !seen.includes(key)) {
        seen.push(key); const msg = e.title + ' — ' + hm(e.start.slice(11, 16)) + (e.location ? ' · ' + e.location : '');
        toast('Reminder: ' + msg, false, false);
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Solarize reminder', { body: msg, icon: 'assets/logo.png' }); } catch (x) { }
        try { if (SOUND) { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 660; g.gain.setValueAtTime(.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(.12, a.currentTime + .02); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + .6); o.start(); o.stop(a.currentTime + .6); } } catch (x) { }
      }
    }
    try { sessionStorage.calSeen = JSON.stringify(seen.slice(-200)); } catch (e) { }
  };
  load().then(tick); CALT1 = setInterval(load, 5 * 60000); CALT2 = setInterval(tick, 30000);
}
addEventListener('resize', () => { if (location.hash.startsWith('#/calendar') && CAL.view === 'month') requestAnimationFrame(() => requestAnimationFrame(() => { const b = $('#cview'); if (b) { b.style.height = b.style.maxHeight; fitMonth(); } })); });
