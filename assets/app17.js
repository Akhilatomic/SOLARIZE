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
