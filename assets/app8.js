// Team: Attendance (check-in/out, today board, monthly register, corrections) and Leaves (apply, approve, balances, settings).
let HR = { me: null, attTab: null, lvTab: null, month: null };
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hmAgo = t => t || '—';
const hrsBetween = (a, b) => a && b ? Math.max(0, (+b.slice(0, 2) * 60 + +b.slice(3)) - (+a.slice(0, 2) * 60 + +a.slice(3))) / 60 : 0;
const fmtH = h => h ? Math.floor(h) + 'h ' + String(Math.round((h % 1) * 60)).padStart(2, '0') + 'm' : '—';
const placeCell = (lbl, place, lat, lng, acc) => lat ? `<div class="aplace"><small class="mut">${lbl}</small> <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" title="Open in Google Maps${acc ? ' · accuracy ±' + acc + ' m' : ''}">${esc(place || 'Open map')}</a></div>` : '';
const mapLink = (lat, lng) => lat ? `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" title="Open location"><i class="i i-target"></i></a>` : '';
const ATT = { Present: 'g', Late: 'y', 'Half day': 'y', Absent: 'r', 'On duty': 'b' };

async function hrMe() {
  const was = HR.me && HR.me.today;
  try { HR.me = await api('hr', 'me'); } catch (e) { HR.me = null; }
  drawPunch(); hrBadge(); hrPending();
  const t = HR.me && HR.me.today; /* the CRM checked this person out at office end time while they were looking: say so and offer to continue */
  if (was && was.check_in && !was.check_out && t && t.date === was.date && t.check_out && +t.auto_out) { HR.wk = null; toast('Checked out automatically at ' + t.check_out); pnOpen(); if (location.hash.startsWith('#/attendance')) route(); }
  return HR.me;
}
// leave requests waiting for approval → bell + toast for managers
async function hrPending() {
  if (!HR.me || !HR.me.manage_lv) { HR.pend = []; return; }
  if (typeof mountBell === 'function') mountBell();
  try { HR.pend = (await api('hr', 'pending')).rows; } catch (e) { return; }
  const ids = HR.pend.map(x => x.id);
  if (HR.pendSeen) { const fresh = HR.pend.filter(x => !HR.pendSeen.includes(x.id));
    fresh.slice(0, 3).forEach(x => toast(`Leave request from ${x.user_name}: ${x.type} · ${lvRange(x)}`));
    if (fresh.length && typeof SOUND !== 'undefined' && SOUND) try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 740; g.gain.setValueAtTime(.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(.12, a.currentTime + .02); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + .5); o.start(); o.stop(a.currentTime + .5); } catch (e) { }
    if (fresh.length && 'Notification' in window && Notification.permission === 'granted' && document.hidden) try { new Notification('Leave request', { body: fresh.map(x => x.user_name + ' · ' + x.type + ' · ' + lvRange(x)).join('\n') }); } catch (e) { } }
  HR.pendSeen = ids;
  if (typeof drawBell === 'function') drawBell();
  const p = $('#bellp'); if (p && !p.classList.contains('hide') && typeof drawBellPanel === 'function') drawBellPanel();
}
const lvRange = x => { const f = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); return (x.from_date === x.to_date ? f(x.from_date) : f(x.from_date) + ' – ' + f(x.to_date)) + ` (${+x.days} day${+x.days === 1 ? '' : 's'}${x.half ? ', ' + x.half + ' half' : ''})`; };
function hrBellHtml() {
  const P = HR.pend || []; if (!P.length) return '';
  return `<div class="bar" style="margin:0 0 4px"><b>Leave requests (${P.length})</b><span class="sp"></span><a class="btn sec sm" href="#/leaves">Open</a></div>
   ${P.slice(0, 8).map(x => `<div class="nl lvn"><div class="nlm"><b>${esc(x.user_name || '')}</b> <span class="mut">· ${agoStr(x.created)}</span><br><span style="font-size:13px"><span class="pill b">${esc(x.type)}</span> ${esc(lvRange(x))}</span>${x.reason ? `<br><small class="mut">${esc(x.reason)}</small>` : ''}</div>
     <div class="nla"><button class="btn ok sm" data-lap="${x.id}"><i class="i i-check"></i> Approve</button><button class="btn sec sm" data-lrv="${x.id}">Review</button></div></div>`).join('')}<div class="bsep"></div>`;
}
function hrBellBind(root) {
  const after = async () => { await hrMe(); if (/^#\/(leaves|attendance)/.test(location.hash)) route(); };
  $$('[data-lap]', root).forEach(b => b.onclick = async e => { e.stopPropagation(); b.disabled = true;
    try { const r = await api('hr', 'decide', { id: +b.dataset.lap, decision: 'Approved', note: '' }); toast('Leave approved' + lvCleared(r.cleared)); await after(); } catch (e) { b.disabled = false; } });
  $$('[data-lrv]', root).forEach(b => b.onclick = e => { e.stopPropagation(); const p = $('#bellp'); if (p) p.classList.add('hide'); lvReview(+b.dataset.lrv, after); });
}
const lvCleared = n => n ? ` · ${n} attendance entr${n === 1 ? 'y' : 'ies'} removed, shown as leave` : '';
// review window for one leave request: balance, who else is away, attendance already marked, note, Approve / Reject
async function lvReview(id, done) {
  let r; try { r = await api('hr', 'review', undefined, '&id=' + id); } catch (e) { return; }
  const l = r.leave, b = r.balance, tn = ((HR.me && HR.me.cfg.leave_types || []).find(t => t.code === l.type) || {}).name || l.type;
  if (l.status !== 'Pending') { toast('This request was already ' + l.status.toLowerCase(), true); return done && done(); }
  const after = b && b.left !== null ? b.left - l.days : null, fd = x => new Date(x + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const row = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
  const m = modal(`<div class="lvm">
   <div class="lvh"><span class="lvi"><i class="i i-leave"></i></span><div><h2>${esc(l.user_name || '')}</h2><small>Leave request · asked ${agoStr(l.created)}</small></div><button class="lvx" id="rvx" title="Close"><i class="i i-x"></i></button></div>
   <div class="lvb">
    <div class="lrv">${row('Leave type', esc(tn))}${row('Dates', esc(lvRange(l)))}${row('Balance', !b ? '—' : b.left === null ? `${b.used} day${b.used === 1 ? '' : 's'} taken this year · no limit` : `${b.left} left · <span class="${after < 0 ? 'over' : ''}">${after} after this leave</span>`)}${r.year && r.year.max > 0 ? row('This year', `${r.year.used} of ${r.year.max} days used · <span class="${r.year.used + l.days > r.year.max ? 'over' : ''}">${r.year.used + l.days} after this leave</span>`) : ''}${row('Reason', esc(l.reason || '—'))}</div>
    ${r.marked.length && !l.half ? `<div class="lvd lrv-w"><i class="i i-clock"></i> <span>Attendance is already marked on ${r.marked.map(x => fd(x.date) + (x.check_in ? ' (' + esc(x.check_in) + (x.check_out ? '–' + esc(x.check_out) : '') + ')' : ' (' + esc(x.status) + ')')).join(', ')}. Approving removes it and the day${r.marked.length === 1 ? '' : 's'} will show as leave.</span></div>` : ''}
    ${l.half ? `<div class="lvd"><i class="i i-clock"></i> <span>Half-day leave (${esc(l.half)} half): the check-in for the other half is kept.</span></div>` : ''}
    <div><label>Also away on these dates</label>${r.away.length ? `<div class="lrv-a">${r.away.map(x => `<div><b>${esc(x.name)}</b> <span class="mut">${esc(x.type)} · ${esc(lvRange({ ...x, days: '' }).replace(/ \(.*$/, ''))}</span> ${x.status === 'Pending' ? pill('Pending', 'y') : ''}</div>`).join('')}</div>` : '<div class="mut" style="font-size:13px">Nobody else has leave on these dates.</div>'}</div>
    <div><label>Note to ${esc((l.user_name || '').split(' ')[0])} <span class="mut" style="font-weight:400">· needed to reject</span></label><textarea id="rvn" rows="2" placeholder="Optional when approving"></textarea></div>
   </div>
   <div class="lvf"><button class="btn bad" id="rvr">Reject</button><button class="btn ok" id="rva"><i class="i i-check"></i> Approve</button></div></div>`);
  m.classList.add('lvmod');
  $('#rvx', m).onclick = () => m.remove();
  const go = async decision => { const note = $('#rvn', m).value.trim();
    if (decision === 'Rejected' && !note) { $('#rvn', m).focus(); return toast('Add a reason for rejecting', true); }
    $('#rva', m).disabled = $('#rvr', m).disabled = true;
    try { const x = await api('hr', 'decide', { id, decision, note }); m.remove(); toast(decision === 'Approved' ? 'Leave approved' + lvCleared(x.cleared) : 'Leave rejected'); if (done) done(); }
    catch (e) { if ($('#rva', m)) $('#rva', m).disabled = $('#rvr', m).disabled = false; } };
  $('#rva', m).onclick = () => go('Approved'); $('#rvr', m).onclick = () => go('Rejected');
}

function getLoc() {
  return new Promise(res => { if (!navigator.geolocation) return res({});
    navigator.geolocation.getCurrentPosition(p => res({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }), () => res({}), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }); });
}
async function punch(kind, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Getting location…'; }
  const loc = await getLoc();
  try { const r = await api('hr', 'punch', { kind, ...loc }); toast(kind === 'in' ? `Checked in at ${r.time}${r.status === 'Half day' ? ' (half day)' : r.late ? ' (late)' : ''}${loc.lat ? (r.place ? ' · ' + r.place : '') : ' · location not shared'}` : `Checked out at ${r.time} · ${fmtH(r.hours)}${r.status === 'Half day' ? ' · half day' : r.early ? ' · left early' : ''}`); }
  finally { if (btn) btn.disabled = false; HR.wk = null; await hrMe(); if (location.hash.startsWith('#/attendance')) route(); }
}
// keep working past office end time: no auto check-out today (also takes back today's auto check-out)
async function pnContinue(btn) {
  if (btn) btn.disabled = true;
  try { await api('hr', 'continue', {}); toast('Still checked in · remember to check out when you finish'); }
  finally { HR.wk = null; await hrMe(); if (location.hash.startsWith('#/attendance')) route(); }
}
const pnNow = () => new Date().toTimeString().slice(0, 5);
const pnMin = t => +t.slice(0, 2) * 60 + +t.slice(3);
const pnDur = m => Math.floor(m / 60) + 'h ' + String(Math.round(m % 60)).padStart(2, '0') + 'm';
const pnEnd = () => (HR.me && HR.me.cfg && HR.me.cfg.end) || '18:00';
const pnDays = n => (n % 1 ? (Math.floor(n) || '') + '½' : n) + ' day' + (n === 1 || n === .5 ? '' : 's');
const PN_WARN = 10, PN_OFFER = 30; /* minutes before office end time: the card opens by itself · "Continue working" can be chosen */
// minutes left until the auto check-out (null when it does not apply: not in, already out, or continuing)
function pnLeft() { const t = HR.me && HR.me.today; if (!t || !t.check_in || t.check_out || +t.cont) return null; return pnMin(pnEnd()) - pnMin(pnNow()); }
// this week's attendance (Monday to Sunday) for the signed-in person; kept for 5 minutes
async function pnWeekLoad() {
  const mon = new Date(); mon.setDate(mon.getDate() - (mon.getDay() + 6) % 7); const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const from = ymd2(mon);
  if (HR.wk && HR.wk.from === from && Date.now() - HR.wk.at < 300000) return HR.wk.d;
  const d = await api('hr', 'range', undefined, `&from=${from}&to=${ymd2(sun)}&mine=1`);
  HR.wk = { from, at: Date.now(), d }; return d;
}
function pnWeekHtml(d) {
  const [y, m, dd] = d.from.split('-').map(Number), td = ymd2(new Date()), me = d.users[0] ? d.users[0].id : 0;
  const hol = Object.fromEntries(d.cfg.holidays.map(h => [h.date, h.name])), rec = Object.fromEntries(d.records.map(r => [r.date, r]));
  if (HR.me && HR.me.today) rec[td] = HR.me.today;
  let days = 0, mins = 0; const rows = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(y, m - 1, dd + i), ds = ymd2(x), r = rec[ds], l = d.leaves.find(v => v.user_id == me && ds >= v.from_date && ds <= v.to_date), off = d.cfg.week_off.includes(x.getDay());
    let k = '–', c = '', txt = '', h = '';
    if (r && r.status === 'Absent') { k = 'A'; c = 'ab'; txt = 'Absent'; }
    else if (r && r.check_in) { k = { Present: 'P', Late: 'L', 'Half day': 'HD', 'On duty': 'OD' }[r.status] || 'P'; c = { Present: 'pr', Late: 'lt', 'Half day': 'hd', 'On duty': 'od' }[r.status] || 'pr';
      const out = r.check_out || (ds === td ? pnNow() : ''), mn = out ? Math.max(0, pnMin(out) - pnMin(r.check_in)) : 0; mins += mn; days += r.status === 'Half day' ? .5 : 1;
      txt = `${esc(r.check_in)} – ${r.check_out ? esc(r.check_out) : ds === td ? 'now' : 'no check-out'}${+r.auto_out ? ' <span class="pn-auto" title="Checked out automatically at office end time">auto</span>' : ''}`; h = mn ? pnDur(mn) : ''; }
    else if (r && r.status) { k = 'OD'; c = 'od'; txt = esc(r.status); days += r.status === 'Half day' ? .5 : 1; }
    else if (l) { k = 'LV'; c = 'lv'; txt = 'Leave · ' + esc(l.type); }
    else if (hol[ds]) { k = 'H'; c = 'ho'; txt = esc(hol[ds]); }
    else if (off) continue;
    else if (ds < td) { k = 'A'; c = 'ab'; txt = 'Absent'; }
    else if (ds === td) txt = 'Not checked in';
    rows.push(`<div class="pn-d${ds === td ? ' pn-td' : ''}${ds > td ? ' pn-fu' : ''}"><span class="pn-dn">${WD[x.getDay()]} <small>${x.getDate()}</small></span><span class="ac ${c}">${k}</span><span class="pn-dt">${txt}</span><span class="pn-dh">${h}</span></div>`);
  }
  return `<div class="pn-wkh">This week</div>${rows.join('')}<div class="pn-tot"><span>Total</span><b>${pnDays(days)} · ${mins ? pnDur(mins) : '0h'}</b></div>`;
}
// fills every week box on screen (card under the top-bar button, Attendance page)
async function pnWeekFill() {
  if (!$('.pn-wk')) return;
  try { const d = await pnWeekLoad(); $$('.pn-wk').forEach(b => b.innerHTML = pnWeekHtml(d)); } catch (e) { $$('.pn-wk').forEach(b => b.innerHTML = '<small class="mut">Could not load this week.</small>'); }
}
// the line about auto check-out + its buttons, shared by the card and the Attendance page
function pnNote() {
  const t = HR.me && HR.me.today, end = pnEnd(); if (!t || !t.check_in) return '';
  if (t.check_out) return +t.auto_out ? `<div class="pn-note"><span>Checked out automatically at ${esc(t.check_out)}. Still working?</span><button class="btn sec sm" data-pncont>Continue working</button></div>` : '';
  if (+t.cont) return `<div class="pn-note"><span>Working past ${esc(end)} · no auto check-out today. Remember to check out when you finish.</span></div>`;
  const left = pnLeft();
  if (left > PN_OFFER) return `<div class="pn-note pn-q"><span>Auto check-out at ${esc(end)}</span></div>`;
  return `<div class="pn-note${left <= PN_WARN ? ' pn-warn' : ''}"><span>Auto check-out at ${esc(end)}${left > 0 ? ` · in ${left} min` : ''}. Staying longer?</span><button class="btn sec sm" data-pncont>Continue working</button></div>`;
}
function pnBind(root) {
  $$('[data-pncont]', root).forEach(b => b.onclick = e => { e.stopPropagation(); pnContinue(b); });
  $$('[data-pnout]', root).forEach(b => b.onclick = e => { e.stopPropagation(); punch('out', b); });
}
function pnCard() {
  const c = $('#pncard'), t = HR.me && HR.me.today; if (!c || c.classList.contains('hide')) return;
  if (!t || !t.check_in) return pnClose();
  const worked = Math.max(0, pnMin(t.check_out || pnNow()) - pnMin(t.check_in));
  c.innerHTML = `<div class="pn-h"><div><small>${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</small><b>${pnDur(worked)}</b><span class="mut">${t.check_out ? 'worked today' : 'so far today'}</span></div>${pill(t.status, ATT[t.status])}</div>
   <div class="pn-io"><div><small>Check in</small><b>${esc(t.check_in)}</b></div><div><small>Check out</small><b>${t.check_out ? esc(t.check_out) : '—'}</b></div></div>
   ${pnNote()}
   ${t.check_out ? '' : '<button class="btn pn-out" data-pnout><i class="i i-clock"></i> Check out</button>'}
   <div class="pn-wk">${HR.wk ? pnWeekHtml(HR.wk.d) : '<small class="mut">Loading this week…</small>'}</div>
   <a class="pn-more" href="#/attendance">Open attendance</a>`;
  pnBind(c); $('.pn-more', c).onclick = () => pnClose(); pnWeekFill();
}
function pnOpen() { const c = $('#pncard'); if (!c) return; c.classList.remove('hide'); const p = $('#bellp'); if (p) p.classList.add('hide'); pnCard(); }
function pnClose() { const c = $('#pncard'); if (c) c.classList.add('hide'); }
// top-bar check-in / check-out button
function drawPunch() {
  const top = $('.top'); if (!top || !canR('attendance')) return;
  let w = $('#pnw');
  if (!w) { w = document.createElement('div'); w.id = 'pnw'; w.innerHTML = '<button id="punch" class="btn sm"></button><div id="pncard" class="card hide"></div>'; top.insertBefore(w, $('#pwb'));
    $('#pncard').onclick = e => e.stopPropagation(); }
  if (!HR.pnDoc) { HR.pnDoc = 1; document.addEventListener('click', e => { if (!e.target.closest('#pnw')) pnClose(); }); document.addEventListener('keydown', e => { if (e.key === 'Escape') pnClose(); }); window.addEventListener('hashchange', pnClose); }
  const b = $('#punch'), t = HR.me && HR.me.today, tog = e => { e.stopPropagation(); $('#pncard').classList.contains('hide') ? pnOpen() : pnClose(); };
  if (HR.me && HR.me.on_leave && !t) { b.className = 'btn sec sm'; b.title = ''; b.innerHTML = '<i class="i i-leave"></i><span class="pl"> On leave</span>'; b.onclick = () => location.hash = '#/leaves'; pnClose(); }
  else if (!t || !t.check_in) { b.className = 'btn sm'; b.title = 'Start your day'; b.innerHTML = '<i class="i i-clock"></i><span class="pl"> Check in</span><span class="ps"> In</span>'; b.onclick = () => punch('in', b); pnClose(); }
  else if (!t.check_out) { const left = pnLeft(), dur = pnDur(Math.max(0, pnMin(pnNow()) - pnMin(t.check_in)));
    b.className = 'btn sm pn-on' + (left !== null && left <= PN_WARN ? ' pn-soon' : ''); b.title = 'Checked in at ' + t.check_in + ' · click to check out';
    b.innerHTML = `<span class="pn-dot"></span><span class="pl">${esc(t.check_in)} · <b>${dur}</b></span><span class="ps">${dur}</span><span class="pn-cv"></span>`; b.onclick = tog; }
  else { b.className = 'btn sec sm pn-done'; b.title = 'Today’s attendance'; b.innerHTML = `<i class="i i-check"></i><span class="pl"> ${esc(t.check_in)} – ${esc(t.check_out)}${+t.auto_out ? ' <span class="pn-auto">auto</span>' : ''}</span>`; b.onclick = tog; }
  pnCard(); pnWatch();
}
// every 20 s: running time on the button, the card opens 10 minutes before office end time, and the server is asked again at end time
function pnWatch() {
  if (HR.pnT || FRAME) return; /* the attendance button lives in the outer window, not in a menu tab */
  HR.pnT = setInterval(() => {
    const t = HR.me && HR.me.today; if (!t || !t.check_in || t.check_out || !$('#punch')) return;
    const left = pnLeft(), day = HR.me.date;
    if (left !== null && left <= 0) { if (HR.pnAsked !== day + pnNow()) { HR.pnAsked = day + pnNow(); hrMe(); } return; } /* office end time: the server checks out */
    drawPunch();
    if (left !== null && left <= PN_WARN && HR.pnWarned !== day) { HR.pnWarned = day; pnOpen();
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) try { new Notification('Auto check-out at ' + pnEnd(), { body: 'Open the CRM and choose Continue working if you are staying longer.' }); } catch (e) { } }
  }, 20000);
}
function hrBadge() {
  const a = $('aside a[data-m="leaves"]'); if (!a) return; let b = a.querySelector('.nb');
  const n = HR.me ? HR.me.pending_requests : 0; if (!b) { b = document.createElement('span'); b.className = 'nb nbo'; a.appendChild(b); }
  b.textContent = n || ''; b.style.display = n ? '' : 'none';
}
// one timer only, even when boot() runs again after a sign-in
function startHr() { if (canR('attendance') || canR('leaves')) hrMe(); clearInterval(HR.poll); HR.poll = setInterval(() => { if (canR('attendance') || canR('leaves')) { if (!document.hidden) hrMe(); else if (!FRAME && HR.me && HR.me.manage_lv) hrPending(); } }, 60000); }

// ---------- Attendance page ----------
// managers: show one person in the weekly / monthly lists (HR.attUser, 0 = all staff). Returns the full staff list for the picker.
function attUserPick(d, mine) { const all = d.users; if (!mine && HR.attUser && all.some(u => u.id == HR.attUser)) d.users = all.filter(u => u.id == HR.attUser); return all; }
const attUserSel = (all, mine) => mine || all.length < 2 ? '' : `<select id="atu" title="Show one person" style="width:auto;max-width:200px"><option value="">All staff</option>${all.map(u => `<option value="${u.id}" ${u.id == HR.attUser ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>`;
async function pgAttendance() {
  const me = await hrMe(); if (!me) return;
  const mgr = !!me.manage_att; if (!HR.attTab) HR.attTab = mgr ? 'today' : 'mine'; if (!HR.month) HR.month = today().slice(0, 7);
  const t = me.today, worked = t && t.check_in ? hrsBetween(t.check_in, t.check_out || new Date().toTimeString().slice(0, 5)) : 0;
  $('#main').innerHTML = `<div class="bar pghd"><div><div class="mut pghd-s">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Office ${esc(me.cfg.start)}–${esc(me.cfg.end || '18:00')} · late after ${me.cfg.grace} min · half day if in after / out before ${esc(me.cfg.half_after || '14:00')}</div></div><span class="sp"></span>
    ${mgr ? `<div class="tabs" style="margin:0">${[['today', 'Today'], ['week', 'Weekly (salary)'], ['register', 'Monthly register'], ['mine', 'My attendance']].map(([k, l]) => `<button data-at="${k}" class="${HR.attTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}</div>
   <div class="grid cols2 attg ${(HR.attTab === 'register' || HR.attTab === 'week') && mgr ? 'attfull' : ''}" style="grid-template-columns:minmax(280px,360px) minmax(0,1fr);align-items:start">
    <div class="card punchcard"><div class="pclock" id="pclock">${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
     ${me.on_leave && !t ? `<p class="mut">You are on approved leave today (${esc(me.on_leave.type)}).</p>` : ''}
     <div class="pstat">${t && t.check_in ? pill(t.status, ATT[t.status]) : pill('Not checked in')}</div>
     <div class="pgrid"><div><small>Check in</small><b>${hmAgo(t && t.check_in)}</b></div><div><small>Check out</small><b>${hmAgo(t && t.check_out)}</b></div><div><small>Worked</small><b>${fmtH(worked)}</b></div></div>
     ${!t || !t.check_in ? '<button class="btn pbig" id="pin"><i class="i i-clock"></i> Check in</button>' : !t.check_out ? '<button class="btn ok pbig" id="pout"><i class="i i-clock"></i> Check out</button>' : '<p class="mut" style="text-align:center;margin:8px 0 0">Done for today</p>'}
     ${pnNote()}
     <div class="pn-wk"><small class="mut">Loading this week…</small></div>
     <p class="mut" style="font-size:12px;margin:10px 0 0">Your location is recorded with each check-in/out if you allow it — useful for site visits.</p></div>
    <div id="atb"></div></div>`;
  const tick = setInterval(() => { const c = $('#pclock'); if (!c) return clearInterval(tick); c.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); }, 15000);
  if ($('#pin')) $('#pin').onclick = e => punch('in', e.currentTarget); if ($('#pout')) $('#pout').onclick = e => punch('out', e.currentTarget); pnBind($('.punchcard')); pnWeekFill();
  $$('[data-at]').forEach(b => b.onclick = () => { HR.attTab = b.dataset.at; pgAttendance(); });
  $('#atb').onchange = e => { if (e.target.id === 'atu') { HR.attUser = +e.target.value || 0; HR.attTab === 'week' ? attWeek(false) : attRegister(false); } };
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
     <td>${hmAgo(r.check_in)}</td><td>${hmAgo(r.check_out)}${+r.auto_out ? ' <span class="pn-auto" title="Checked out automatically at office end time">auto</span>' : ''}${r.check_out && r.check_out < (HR.me.cfg.end || '18:00') ? ' <span class="pill y" title="Left before office end">early</span>' : ''}</td><td>${fmtH(hrsBetween(r.check_in, r.check_out))}</td><td>${placeCell('In', r.in_place, r.in_lat, r.in_lng) + placeCell('Out', r.out_place, r.out_lat, r.out_lng) || (r.check_in ? '<small class="mut">Not shared</small>' : '')}</td>
     <td class="right"><button class="ib" data-ed="${r.user_id}" title="Correct attendance"><i class="i i-pencil"></i></button></td></tr>`).join('')}</tbody></table></div>`;
  $$('[data-ed]', box).forEach(b => b.onclick = () => { const r = d.rows.find(x => x.user_id == b.dataset.ed); attEdit({ user_id: r.user_id, name: r.name, date: d.date, ...r }, attToday); });
}
async function attRegister(mine) {
  const d = await api('hr', 'month', undefined, '&month=' + HR.month + (mine ? '&mine=1' : '')), box = $('#atb'); if (!box) return;
  const staff = attUserPick(d, mine);
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
  box.innerHTML = `<div class="card"><div class="ch"><h3>${mine ? 'My attendance' : 'Monthly register'}</h3><span class="sp"></span>${attUserSel(staff, mine)}<input type="month" id="amon" value="${HR.month}" style="max-width:170px">${mine ? '' : '<button class="btn sec sm" id="acsv"><i class="i i-download"></i> CSV</button>'}</div>
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
  if ($('#aclr', m)) $('#aclr', m).onclick = async () => { if (!await ask('Remove this day’s attendance record?')) return; await api('hr', 'mark', { user_id: r.user_id, date: r.date, clear: 1 }); m.remove(); done(); };
}

// ---------- Leaves page ----------
async function pgLeaves() {
  const d = await api('hr', 'leaves'), mgr = !!d.manage; if (!HR.lvTab) HR.lvTab = mgr ? 'requests' : 'mine';
  const pend = d.rows.filter(r => r.status === 'Pending' && (r.user_id != ME.id || ME.role === 'admin')).length;
  $('#main').innerHTML = `<div class="bar pghd"><div><div class="mut pghd-s">${new Date().getFullYear()} balances · weekly off: ${d.cfg.week_off.map(x => WD[x]).join(', ') || 'none'}</div></div><span class="sp"></span>
    ${mgr ? `<div class="tabs" style="margin:0">${[['requests', `Requests${pend ? ' (' + pend + ')' : ''}`], ['all', 'All leaves'], ['bal', 'Team balances'], ['mine', 'My leaves']].map(([k, l]) => `<button data-lt="${k}" class="${HR.lvTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
    <button class="btn" id="lapply"><i class="i i-plus"></i> New Leave Request</button></div>
   <div class="grid stats" style="margin-bottom:14px">${d.year && d.year.max > 0 ? `<div class="card stat lbal"><b>${Math.max(0, d.year.max - d.year.used)}</b><span>Days left this year</span><small class="mut">of ${d.year.max} · used ${d.year.used}${d.year.pending ? ' · ' + d.year.pending + ' pending' : ''}</small></div>` : ''}${d.balance.map(b => `<div class="card stat lbal"><b>${b.left === null ? (b.used || 0) : b.left}</b><span>${esc(b.name)}</span><small class="mut">${b.left === null ? 'days taken (no limit)' : `left of ${b.quota} · used ${b.used}${b.pending ? ' · ' + b.pending + ' pending' : ''}`}</small></div>`).join('')}</div><div id="lvb"></div>`;
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
     return `<tr>${mgr && HR.lvTab !== 'mine' ? `<td><b>${esc(r.user_name)}</b><br><small class="mut">asked ${agoStr(r.created)}</small></td>` : ''}<td>${pill(r.type)}</td><td>${dmy(r.from_date)}${r.to_date !== r.from_date ? ' – ' + dmy(r.to_date) : ''}${r.half ? `<br><small class="mut">${r.half} half</small>` : ''}</td><td>${r.days}</td>
       <td>${esc(r.reason)}${r.approver_note ? `<br><small class="mut">${esc(r.approver_name || '')}: ${esc(r.approver_note)}</small>` : ''}</td><td>${pill(r.status, st[r.status])}${r.status !== 'Pending' && r.approver_name ? `<br><small class="mut">by ${esc(r.approver_name)}</small>` : ''}</td>
       <td class="right" style="white-space:nowrap">${canDecide ? `<button class="btn ok sm" data-ap="${r.id}"><i class="i i-check"></i> Approve</button> <button class="btn sec sm" data-rv="${r.id}">Review</button>` : ''}${(own && r.status === 'Pending') || (r.status === 'Approved' && (mgr || (own && r.from_date > today()))) ? ` <button class="btn sec sm" data-cx="${r.id}">Cancel</button>` : ''}</td></tr>`; }).join('') || `<tr><td colspan="7" class="mut">${HR.lvTab === 'requests' ? 'No pending requests' : 'No leaves yet'}</td></tr>`}</tbody></table></div>`;
  const redo = () => { hrMe(); if (location.hash.startsWith('#/leaves')) pgLeaves(); };
  $$('[data-ap]', box).forEach(b => b.onclick = async () => { b.disabled = true; try { const x = await api('hr', 'decide', { id: +b.dataset.ap, decision: 'Approved', note: '' }); toast('Leave approved' + lvCleared(x.cleared)); redo(); } catch (e) { b.disabled = false; } });
  $$('[data-rv]', box).forEach(b => b.onclick = () => lvReview(+b.dataset.rv, redo));
  $$('[data-cx]', box).forEach(b => b.onclick = async () => { if (!await ask('Cancel this leave?')) return; await api('hr', 'cancel', { id: +b.dataset.cx }); toast('Leave cancelled'); hrMe(); pgLeaves(); });
}
async function applyModal(d) {
  const mgr = !!d.manage; let users = [];
  if (mgr) { try { users = (await api('calendar', 'list', undefined, '&from=2000-01-01&to=2000-01-01')).users; } catch (e) { } }
  const left = c => { const b = d.balance.find(x => x.code === c); return b && b.left !== null ? b.left - b.pending : null; };
  const m = modal(`<div class="lvm">
   <div class="lvh"><span class="lvi"><i class="i i-calendar"></i></span><div><h2>New Leave Request</h2><small>Request time off from work</small></div><button class="lvx" id="lcx2" title="Close"><i class="i i-x"></i></button></div>
   <div class="lvb">
    ${mgr && users.length ? `<div><label>For</label><select id="lu">${users.map(u => `<option value="${u.id}" ${u.id == ME.id ? 'selected' : ''}>${esc(u.name)}${u.id == ME.id ? ' (me)' : ''}</option>`).join('')}</select></div>` : ''}
    <div class="two"><div><label>From Date <em>*</em></label><input type="date" id="lfr" value="${today()}"></div><div><label>To Date <em>*</em></label><input type="date" id="lto" value="${today()}"></div></div>
    <div class="lvd" id="ldy"><i class="i i-calendar"></i> <span>…</span></div>
    <div id="lhw"><label>Duration</label><select id="lhf"><option value="">Full day</option><option value="first">Half day — first half (morning)</option><option value="second">Half day — second half (afternoon)</option></select></div>
    <div><label>Leave Type <em>*</em></label><select id="lty"><option value="">— Select leave type —</option>${d.cfg.leave_types.map(t => `<option value="${t.code}">${esc(t.name)}</option>`).join('')}</select><small class="mut" id="lbl" style="display:block;margin-top:4px"></small></div>
    <div><label>Reason / Remarks <em>*</em></label><textarea id="lrs" rows="3" placeholder="Briefly describe the reason for your leave..."></textarea></div>
    ${mgr ? `<label class="lrv-now" id="lnw"><input type="checkbox" id="lnow" checked> <span>Approve now <small class="mut">· the days show as leave in attendance straight away</small></span></label>` : ''}
   </div>
   <div class="lvf"><button class="btn sec" id="lcx">Cancel</button><button class="btn" id="lsv">Submit Request</button></div></div>`);
  m.classList.add('lvmod');
  const upd = async () => { const f = $('#lfr', m).value, t = $('#lto', m).value; $('#lhw', m).style.display = f && f === t ? '' : 'none'; if (f !== t) $('#lhf', m).value = '';
    const box = $('#ldy span', m); $('#ldy', m).classList.remove('bad');
    if (!f || !t || t < f) { box.textContent = '“To Date” must be on or after “From Date”'; $('#ldy', m).classList.add('bad'); return; }
    try { const r = await api('hr', 'days', undefined, `&from=${f}&to=${t}${$('#lhf', m).value ? '&half=1' : ''}`);
      box.innerHTML = r.days ? `<b>${r.days}</b> day${r.days === 1 ? '' : 's'} of leave <span class="mut">· weekly offs and holidays not counted</span>` : 'These dates are all holidays or weekly offs'; if (!r.days) $('#ldy', m).classList.add('bad'); } catch (e) { } };
  ['#lfr', '#lto', '#lhf'].forEach(x => $(x, m).onchange = upd); upd();
  /* own balance of the chosen type · "Approve now" only where this person may approve (someone else's leave, or the admin's own) */
  const hint = () => { const me = !$('#lu', m) || $('#lu', m).value == ME.id, c = $('#lty', m).value, x = left(c);
    $('#lbl', m).textContent = !c || !me ? '' : (x === null ? 'No limit for this type' : `${x} day${x === 1 ? '' : 's'} available`) + (d.year && d.year.max > 0 ? ` · ${Math.max(0, d.year.max - d.year.used - d.year.pending)} of ${d.year.max} left this year` : '');
    if ($('#lnw', m)) $('#lnw', m).style.display = !me || ME.role === 'admin' ? '' : 'none'; };
  $('#lty', m).addEventListener('change', hint); if ($('#lu', m)) $('#lu', m).onchange = hint; hint();
  $('#lfr', m).addEventListener('change', () => { if ($('#lto', m).value < $('#lfr', m).value) { $('#lto', m).value = $('#lfr', m).value; upd(); } });
  $('#lcx', m).onclick = $('#lcx2', m).onclick = () => m.remove();
  $('#lsv', m).onclick = async () => {
    if (!$('#lty', m).value) { $('#lty', m).focus(); return toast('Select a leave type', true); }
    if (!$('#lrs', m).value.trim()) { $('#lrs', m).focus(); return toast('Add a reason', true); }
    const b = $('#lsv', m); b.disabled = true;
    try { const r = await api('hr', 'apply', { user_id: $('#lu', m)?.value, type: $('#lty', m).value, from: $('#lfr', m).value, to: $('#lto', m).value, half: $('#lhf', m).value, reason: $('#lrs', m).value, approve: $('#lnw', m) && $('#lnw', m).style.display !== 'none' && $('#lnow', m).checked ? 1 : 0 });
      m.remove(); toast(r.approved ? `Leave approved (${r.days} day${r.days === 1 ? '' : 's'})` + lvCleared(r.cleared) : `Leave request sent for approval (${r.days} day${r.days === 1 ? '' : 's'})`); if (!mgr) HR.lvTab = 'mine'; else if (r.approved) HR.lvTab = 'all'; hrMe(); if (location.hash.startsWith('#/leaves')) pgLeaves(); } finally { b.disabled = false; } };
}

// ---------- Settings → Attendance & leave ----------
async function drawHrSettings() {
  const box = $('#hrset'); if (!box) return;
  const c = (await api('hr', 'me')).cfg;
  box.innerHTML = `<h3>Working hours & leave</h3><div class="two">
    <div><label>Office start time</label><input type="time" id="hs1" value="${esc(c.start)}"></div><div><label>Office end time</label><input type="time" id="hs7" value="${esc(c.end || '18:00')}"></div>
    <div><label>Grace (minutes before “Late”)</label><input type="number" id="hs2" value="${c.grace}"></div><div><label>Half day if check-in after / check-out before</label><input type="time" id="hs8" value="${esc(c.half_after || '14:00')}"></div>
    <div><label>Also half day if worked less than (hours, 0 = off)</label><input type="number" step="0.5" id="hs3" value="${c.half_hours}"></div><div><label>Full day hours</label><input type="number" step="0.5" id="hs4" value="${c.full_hours}"></div>
    <div class="full"><label>Salary day (weekly attendance ends on)</label><select id="hs9">${WD.map((w, i) => `<option value="${i}" ${(c.pay_day ?? 6) == i ? 'selected' : ''}>${w}</option>`).join('')}</select></div>
    <div class="full"><label>Weekly off</label><div class="wkd">${WD.map((w, i) => `<label class="ck"><input type="checkbox" data-wo="${i}" ${c.week_off.includes(i) ? 'checked' : ''}> ${w}</label>`).join('')}</div></div>
    <div class="full"><label>Maximum leave days per person in a year <span class="mut" style="font-weight:400">· all leave types together, 0 = no limit</span></label><input type="number" id="hs10" min="0" max="366" step="1" value="${+(c.year_max ?? 30)}" style="max-width:160px"></div>
    <div class="full"><label>Leave types (one per line: CODE | name | days per year, 0 = unlimited/unpaid)</label><textarea id="hs6" rows="5">${esc(c.leave_types.map(t => t.code + ' | ' + t.name + ' | ' + t.quota).join('\n'))}</textarea></div></div>
    <button class="btn" id="hssv" style="margin-top:10px">Save attendance & leave settings</button>`;
  $('#hssv').onclick = async () => {
    const lines = id => $(id).value.split('\n').map(x => x.split('|').map(s => s.trim())).filter(x => x[0]);
    await api('hr', 'cfg_save', { value: { start: $('#hs1').value, end: $('#hs7').value, half_after: $('#hs8').value, pay_day: +$('#hs9').value, grace: $('#hs2').value, year_max: +$('#hs10').value || 0, half_hours: $('#hs3').value, full_hours: $('#hs4').value, week_off: $$('[data-wo]').filter(x => x.checked).map(x => +x.dataset.wo),
      leave_types: lines('#hs6').map(([code, name, quota]) => ({ code, name, quota: +quota || 0 })) } });
    toast('Attendance & leave settings saved'); hrMe(); drawHrSettings();
  };
  drawHolidays(c.holidays);
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
  const staff = attUserPick(d, mine);
  const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(start); x.setDate(start.getDate() + i); return ymd2(x); });
  const hol = Object.fromEntries(d.cfg.holidays.map(h => [h.date, h.name])), paid = Object.fromEntries(d.cfg.leave_types.map(t => [t.code, +t.quota > 0]));
  const rec = {}; d.records.forEach(r => rec[r.user_id + '|' + r.date] = r);
  const lvOn = (u, ds) => d.leaves.find(l => l.user_id == u && ds >= l.from_date && ds <= l.to_date);
  const day = (u, ds) => { const r = rec[u + '|' + ds], l = lvOn(u, ds), wd = new Date(ds + 'T00:00:00').getDay();
    if (r && r.status === 'Absent') return { k: 'A', c: 'ab', pay: 0, work: 1, tip: 'Absent' + (r.notes ? ' · ' + r.notes : '') };
    if (r && (r.check_in || r.status)) { const hd = r.status === 'Half day', h = hrsBetween(r.check_in, r.check_out);
      return { k: { Present: 'P', Late: 'L', 'Half day': 'HD', 'On duty': 'OD' }[r.status] || 'P', c: { Present: 'pr', Late: 'lt', 'Half day': 'hd', 'On duty': 'od' }[r.status] || 'pr', pay: hd ? (l && l.half && paid[l.type] ? 1 : .5) : 1, lv: hd && l && l.half ? .5 : 0, lop: hd && l && l.half && !paid[l.type] ? .5 : 0, work: d.cfg.week_off.includes(wd) || hol[ds] ? 0 : 1, hrs: h, late: r.status === 'Late', hd, early: r.check_out && r.check_out < (d.cfg.end || '18:00') && !hd,
        tip: `${r.status} ${r.check_in || ''}${r.check_out ? '–' + r.check_out + (+r.auto_out ? ' (auto check-out)' : '') : ' (no check-out)'}${r.in_place ? ' · in at ' + r.in_place : ''}${r.out_place && r.out_place !== r.in_place ? ' · out at ' + r.out_place : ''}${r.notes ? ' · ' + r.notes : ''}${l && l.half ? ' · half-day leave ' + l.type + (paid[l.type] ? ' (paid)' : ' (unpaid)') : ''}` }; }
    if (hol[ds]) return { k: 'H', c: 'ho', pay: d.cfg.week_off.includes(wd) ? 0 : 1, work: 0, tip: 'Holiday · ' + hol[ds] };
    if (d.cfg.week_off.includes(wd)) return { k: 'WO', c: 'wo', pay: 0, work: 0, tip: 'Weekly off' };
    if (l) { const p = paid[l.type] ? (l.half ? .5 : 1) : 0; return { k: l.half ? 'HL' : 'LV', c: 'lv', pay: p, work: 1, lv: l.half ? .5 : 1, lop: paid[l.type] ? 0 : (l.half ? .5 : 1), tip: 'Leave · ' + l.type + (paid[l.type] ? ' (paid)' : ' (unpaid)') }; }
    if (ds > d.today) return { k: '', c: '', pay: 0, work: 1, future: 1, tip: 'Upcoming' };
    return { k: 'A', c: 'ab', pay: 0, work: 1, tip: 'Absent (no check-in)' };
  };
  const sum = u => { const s = { work: 0, pay: 0, P: 0, L: 0, HD: 0, A: 0, LV: 0, LOP: 0, hrs: 0, early: 0 }; days.forEach(ds => { const x = day(u, ds); s.work += x.work; s.pay += x.pay; s.hrs += x.hrs || 0; if (x.k === 'P' || x.k === 'OD') s.P++; if (x.k === 'L') { s.L++; } if (x.hd) s.HD++; if (x.k === 'A') s.A++; if (x.lv) s.LV += x.lv; if (x.lop) s.LOP += x.lop; if (x.early) s.early++; }); return s; };
  const lbl = `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const isCur = HR.wkEnd === ymd2(weekEnd(new Date()));
  const html = `<div class="card"><div class="ch"><h3>${mine ? 'My week' : 'Weekly attendance'} <span class="mut" style="font-weight:400">· salary on ${WD[payDay()]} ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></h3><span class="sp"></span>${attUserSel(staff, mine)}
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

// ---------- Holidays (Settings): add / edit / remove, saved instantly ----------
async function drawHolidays(list) {
  const box = $('#holset'); if (!box) return;
  HR.hol = list.map(x => ({ ...x }));
  const years = [...new Set([...HR.hol.map(x => +x.date.slice(0, 4)), new Date().getFullYear(), new Date().getFullYear() + 1])].sort();
  if (!HR.holYr) HR.holYr = new Date().getFullYear();
  const save = async (next, msg) => { try { const r = await api('hr', 'holidays_save', { holidays: next }); toast(msg); hrMe(); drawHolidays(r.holidays); } catch (e) { drawHolidays(HR.hol); } };
  const rows = HR.hol.map((x, i) => ({ ...x, i })).filter(x => x.date.startsWith(HR.holYr + '-'));
  const wd = ds => WD[new Date(ds + 'T00:00:00').getDay()], off = ds => (HR.me?.cfg.week_off || [0]).includes(new Date(ds + 'T00:00:00').getDay());
  box.innerHTML = `<div class="ch"><h3>Holidays</h3><span class="sp"></span><select id="hly" style="width:auto">${years.map(y => `<option ${y == HR.holYr ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
    <div class="holadd"><input type="date" id="hld" min="${HR.holYr}-01-01" max="${HR.holYr}-12-31"><input id="hln" placeholder="Holiday name, e.g. Thiruvonam" maxlength="60"><button class="btn" id="hlad"><i class="i i-plus"></i> Add</button></div>
    <div class="hollist">${rows.length ? rows.map(x => `<div class="holrow" data-i="${x.i}"><input type="date" value="${x.date}" data-f="date"><span class="mut holwd">${wd(x.date)}${off(x.date) ? ' · weekly off' : ''}</span><input value="${esc(x.name)}" data-f="name" maxlength="60"><button class="btn sec sm" data-del title="Remove holiday"><i class="i i-x"></i></button></div>`).join('') : '<p class="mut" style="margin:8px 0">No holidays for ' + HR.holYr + ' yet.</p>'}</div>
    <p class="mut" style="font-size:12px;margin:8px 0 0">${rows.length} holiday${rows.length === 1 ? '' : 's'} in ${HR.holYr} · changes save instantly · holidays are paid and are not counted as leave days.</p>`;
  $('#hly').onchange = e => { HR.holYr = +e.target.value; drawHolidays(HR.hol); };
  const add = () => { const date = $('#hld').value, name = $('#hln').value.trim();
    if (!date) return toast('Pick a date'); if (!name) return toast('Enter the holiday name');
    if (HR.hol.some(x => x.date === date)) return toast('There is already a holiday on that date');
    HR.holYr = +date.slice(0, 4); save([...HR.hol, { date, name }], 'Holiday added'); };
  $('#hlad').onclick = add; $('#hln').onkeydown = e => { if (e.key === 'Enter') add(); };
  $$('.holrow', box).forEach(r => { const i = +r.dataset.i;
    $$('input', r).forEach(inp => inp.onchange = () => { const v = inp.value.trim(); if (!v) return drawHolidays(HR.hol);
      if (inp.dataset.f === 'date' && HR.hol.some((x, j) => j !== i && x.date === v)) { toast('There is already a holiday on that date'); return drawHolidays(HR.hol); }
      save(HR.hol.map((x, j) => j === i ? { ...x, [inp.dataset.f]: v } : x), 'Holiday updated'); });
    $('[data-del]', r).onclick = async () => { if (await ask(`Remove "${HR.hol[i].name}" (${HR.hol[i].date})?`)) save(HR.hol.filter((_, j) => j !== i), 'Holiday removed'); };
  });
}
