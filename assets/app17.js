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
  try { const r = await fetch(`api.php?m=user&a=presence&act=${Date.now() - PRES.used < 3e5 ? 1 : 0}`, { credentials: 'same-origin' }); if (!r.ok) return;
    const j = await r.json(); PRES.map = Object.fromEntries((j.users || []).map(u => [u.id, u])); presPaint(); } catch (e) { }
}
function startPresence() {
  if (!PRES.on) { PRES.on = true; const mark = () => { PRES.used = Date.now(); };
    ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, mark, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { mark(); presBeat(); } });
    new MutationObserver(debounce(presPaint, 200)).observe(document.body, { childList: true, subtree: true }); } /* pictures drawn later get their ring too */
  clearInterval(PRES.t); PRES.t = setInterval(presBeat, 60000); presBeat();
}
