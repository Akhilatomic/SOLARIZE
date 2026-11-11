// User display pictures: square crop on the device, upload, show everywhere initials were used.
const avInitials = n => esc(String(n || '?').trim().split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase());
const avUrl = (id, av) => av ? `api.php?m=user&a=avatar&id=${id}&v=${encodeURIComponent(String(av).slice(3, 13))}` : '';
const avImg = (id, av, name) => av ? `<img class="avimg" src="${avUrl(id, av)}" alt="" loading="lazy">` : avInitials(name);

// choose a photo → centred square crop (zoom with the slider) → upload
function pickAvatar(userId, name, done) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    let img; try { img = await createImageBitmap(f); } catch (e) { return toast('That file is not a photo we can read — use JPG or PNG', true); }
    const m = modal(`<h2 style="margin-top:0">Profile photo</h2><p class="mut" style="margin-top:-6px">${esc(name || '')}</p>
      <div class="avcrop"><canvas id="avc" width="320" height="320"></canvas></div>
      <label>Zoom</label><input type="range" id="avz" min="1" max="3" step="0.01" value="1">
      <div class="bar" style="margin-top:12px"><button class="btn" id="avs">Save photo</button><button class="btn sec" id="avo">Choose another</button><button class="btn sec" id="avx">Cancel</button></div>`);
    const cv = $('#avc', m), cx = cv.getContext('2d');
    let z = 1, ox = 0, oy = 0, drag = null;
    const draw = () => { const s = Math.min(img.width, img.height) / z; const sx = Math.max(0, Math.min(img.width - s, (img.width - s) / 2 + ox)), sy = Math.max(0, Math.min(img.height - s, (img.height - s) / 2 + oy));
      cx.clearRect(0, 0, 320, 320); cx.drawImage(img, sx, sy, s, s, 0, 0, 320, 320); };
    draw();
    $('#avz', m).oninput = e => { z = +e.target.value; draw(); };
    cv.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY, ox, oy }; cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = e => { if (!drag) return; const k = Math.min(img.width, img.height) / z / 320; ox = drag.ox - (e.clientX - drag.x) * k; oy = drag.oy - (e.clientY - drag.y) * k; draw(); };
    cv.onpointerup = () => drag = null;
    $('#avx', m).onclick = () => m.remove();
    $('#avo', m).onclick = () => { m.remove(); pickAvatar(userId, name, done); };
    $('#avs', m).onclick = async () => { const b = $('#avs', m); b.disabled = true;
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', .88)); const fd = new FormData(); fd.append('file', blob, 'photo.jpg'); if (userId) fd.append('user_id', userId);
      try { const r = await api('user', 'avatar_set', fd); m.remove(); toast('Photo updated'); done && done(r.avatar); } catch (e) { b.disabled = false; } };
  };
  inp.click();
}
function setMyAvatar(av) {
  ME.avatar = av || '';
  $$('.acav').forEach(x => x.innerHTML = avImg(ME.id, ME.avatar, ME.name));
  const rm = $('#pdr'); if (rm) rm.hidden = !ME.avatar;
}
async function removeAvatar(userId, done) { if (!confirm('Remove this photo?')) return; await api('user', 'avatar_remove', { user_id: userId || 0 }); toast('Photo removed'); done && done(''); }

/* ---- Presence: a coloured ring on people's pictures.
   Green: using the CRM now (mouse / keyboard in the last 5 minutes) · Yellow: CRM open but idle, or checked in for attendance
   today · Red: offline. Each open tab sends a heartbeat every minute (and when it comes back into view); the server keeps
   seen_at / active_at per user (user/presence). Any element with data-pres="<user id>" gets the ring and a hover label. ---- */
const PRES = { map: {}, used: Date.now(), t: 0, on: false };
const presAgo = s => s < 90 ? 'a minute' : s < 3600 ? Math.round(s / 60) + ' min' : s < 172800 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' days';
const presLabel = u => !u ? 'Offline' : u.st === 'on' ? 'Online'
  : u.st === 'away' ? (u.open ? 'Idle' + (u.idle != null ? ' for ' + presAgo(u.idle) : '') + (u.in ? ' · checked in at ' + u.in : '') : 'Present — checked in at ' + u.in)
  : 'Offline' + (u.seen != null ? ' · last seen ' + presAgo(u.seen) + ' ago' : '');
function presPaint() {
  $$('[data-pres]').forEach(el => { const u = PRES.map[el.dataset.pres], st = u ? u.st : 'off', lb = presLabel(u);
    if (el.dataset.pst !== st) { el.classList.remove('pres-on', 'pres-away', 'pres-off'); el.classList.add('pres-' + st); el.dataset.pst = st; }
    if (el.title !== lb) el.title = lb; });
}
async function presBeat() {
  /* team=1 while the dashboard is open: names, roles and pictures come too, for its Who's online strip */
  try { const team = document.getElementById('dteam') ? 1 : 0;
    const r = await fetch(`api.php?m=user&a=presence&act=${Date.now() - PRES.used < 3e5 ? 1 : 0}&team=${team}`, { credentials: 'same-origin' }); if (!r.ok) return;
    const j = await r.json(); PRES.map = Object.fromEntries((j.users || []).map(u => [u.id, u])); presPaint();
    if (typeof dashTeam === 'function') dashTeam(); } catch (e) { }
}
function startPresence() {
  if (!PRES.on) { PRES.on = true; const mark = () => { PRES.used = Date.now(); };
    ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, mark, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { mark(); presBeat(); } });
    new MutationObserver(debounce(presPaint, 200)).observe(document.body, { childList: true, subtree: true }); } /* pictures drawn later get their ring too */
  clearInterval(PRES.t); PRES.t = setInterval(presBeat, 60000); presBeat();
}

/* ---- Dashboard: who else is using the CRM now (header strip; a click lists everyone with their status) ---- */
const TEAM_GROUPS = [['on', 'Online now'], ['away', 'Away · CRM open but idle, or checked in'], ['off', 'Offline']];
function teamPeople() { return Object.values(PRES.map).filter(u => u.name !== undefined).sort((a, b) => String(a.name).localeCompare(String(b.name))); }
function dashTeam() {
  const el = document.getElementById('dteam'); if (!el) return;
  const all = teamPeople(); if (!all.length) { el.innerHTML = ''; el.classList.add('hide'); return; }
  el.classList.remove('hide');
  const others = all.filter(u => +u.id !== +ME.id), on = others.filter(u => u.st === 'on'), away = others.filter(u => u.st === 'away'), shown = on.concat(away).slice(0, 5);
  el.innerHTML = `${shown.length ? `<span class="dtav">${shown.map(u => `<span class="dtp" data-pres="${u.id}">${avImg(u.id, u.avatar, u.name)}</span>`).join('')}${on.length + away.length > 5 ? `<span class="dtp dtm">+${on.length + away.length - 5}</span>` : ''}</span>` : '<span class="dtdot"></span>'}
    <span class="dtt"><b>${on.length ? on.length + ' online' : 'Nobody else online'}</b>${away.length ? `<small>${away.length} away</small>` : ''}</span><i class="i i-chev"></i>`;
  el.title = on.length || away.length ? 'Who is online: ' + on.concat(away).map(u => u.name + (u.st === 'on' ? '' : ' (away)')).join(', ') : 'Who is online';
  el.onclick = teamModal; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); teamModal(); } };
  presPaint(); if (TEAM_M && document.body.contains(TEAM_M)) teamList(TEAM_M);
}
let TEAM_M = null;
function teamList(m) {
  const all = teamPeople();
  $('.tml', m).innerHTML = TEAM_GROUPS.map(([st, label]) => { const g = all.filter(u => u.st === st); return g.length ? `<h4 class="tmh"><span class="tmdot ${st}"></span>${label} <span class="mut">${g.length}</span></h4>
    ${g.map(u => `<div class="tmr"><span class="dtp" data-pres="${u.id}">${avImg(u.id, u.avatar, u.name)}</span><div><b>${esc(u.name)}${+u.id === +ME.id ? ' <small class="mut">(you)</small>' : ''}</b><small class="mut">${esc(u.role_name || '')}${u.role_name ? ' · ' : ''}${esc(presLabel(u))}</small></div></div>`).join('')}` : ''; }).join('');
  presPaint();
}
function teamModal() {
  TEAM_M = modal(`<div class="dlh"><h2>Who is online</h2><span class="sp"></span><button class="lvx" id="tmx" aria-label="Close"><i class="i i-x"></i></button></div>
    <p class="mut" style="margin:-4px 0 10px;font-size:12px">Updated every minute. Green: using the CRM now · Yellow: CRM open but idle, or checked in for attendance · Red: offline.</p><div class="tml"></div>`);
  $('#tmx', TEAM_M).onclick = () => { TEAM_M.remove(); TEAM_M = null; };
  teamList(TEAM_M);
}
