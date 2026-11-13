/* Two-step sign-in: QR code maker (pure, unit tested), the code step on the sign-in page, and My account › Two-step sign-in. */

/* ---- QR code (byte mode, error correction M, versions 1-9 = up to 180 bytes; enough for an authenticator link) ---- */
const QR = {
  /* per version: [error-correction bytes per block, short blocks, data bytes in a short block, long blocks (one byte more)] */
  EC: [null, [10, 1, 16, 0], [16, 1, 28, 0], [26, 1, 44, 0], [18, 2, 32, 0], [24, 2, 43, 0], [16, 4, 27, 0], [18, 4, 31, 0], [22, 2, 38, 2], [22, 3, 36, 2]],
  ALIGN: [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46]],
  cap(v) { const e = QR.EC[v]; return e[1] * e[2] + e[3] * (e[2] + 1); },
  mul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; },
  divisor(deg) { const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
    for (let i = 0; i < deg; i++) { for (let j = 0; j < deg; j++) { r[j] = QR.mul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; } root = QR.mul(root, 2); } return r; },
  remainder(data, div) { const r = new Array(div.length).fill(0);
    for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= QR.mul(c, f); }); } return r; },
  bytes(text) { return Array.from(new TextEncoder().encode(String(text))); },
  /* all codewords (data + error correction, interleaved) for a version */
  codewords(bytes, v) {
    const cap = QR.cap(v), bits = [];
    const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, 8); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, cap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => a << 1 | b, 0));
    for (let p = 0xEC; data.length < cap; p ^= 0xEC ^ 0x11) data.push(p);
    const [ecn, ns, ds, nl] = QR.EC[v], div = QR.divisor(ecn), blocks = []; let k = 0;
    for (let i = 0; i < ns + nl; i++) { const n = ds + (i < ns ? 0 : 1), d = data.slice(k, k + n); k += n; blocks.push([d, QR.remainder(d, div)]); }
    const out = [];
    for (let i = 0; i <= ds; i++) blocks.forEach(b => { if (i < b[0].length) out.push(b[0][i]); });
    for (let i = 0; i < ecn; i++) blocks.forEach(b => out.push(b[1][i]));
    return out;
  },
  /* text → square of true (dark) / false, or null when the text is too long */
  matrix(text) {
    const bytes = QR.bytes(text); let v = 1; while (v <= 9 && bytes.length > QR.cap(v) - 2) v++; if (v > 9) return null;
    const n = 17 + 4 * v, M = [], F = []; for (let i = 0; i < n; i++) { M.push(new Array(n).fill(false)); F.push(new Array(n).fill(false)); }
    const set = (x, y, d) => { M[y][x] = !!d; F[y][x] = true; };
    for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [n - 4, 3], [3, n - 4]].forEach(([cx, cy]) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy)); if (x >= 0 && x < n && y >= 0 && y < n) set(x, y, d !== 2 && d !== 4); } });
    const al = QR.ALIGN[v]; al.forEach((cy, i) => al.forEach((cx, j) => { if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
    /* format: level M, mask 0 */
    let rem = 0; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const fb = rem ^ 0x5412, bit = (val, i) => ((val >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(fb, i));
    set(8, 7, bit(fb, 6)); set(8, 8, bit(fb, 7)); set(7, 8, bit(fb, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(fb, i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(fb, i));
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(fb, i));
    set(8, n - 8, true);
    if (v >= 7) { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const vb = v << 12 | r;
      for (let i = 0; i < 18; i++) { const a = n - 11 + i % 3, b = Math.floor(i / 3); set(a, b, bit(vb, i)); set(b, a, bit(vb, i)); } }
    const cw = QR.codewords(bytes, v); let k = 0;
    for (let right = n - 1; right >= 1; right -= 2) { if (right === 6) right = 5;
      for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - vert : vert;
        if (!F[y][x]) { let d = false; if (k < cw.length * 8) { d = ((cw[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; } k++; M[y][x] = d !== ((x + y) % 2 === 0); } } }
    return M;
  },
  /* draws onto a canvas with the 4-module quiet border */
  draw(canvas, text, px) {
    const m = QR.matrix(text); if (!m) return false; const n = m.length, s = Math.max(2, Math.floor((px || 220) / (n + 8)));
    canvas.width = canvas.height = (n + 8) * s; const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height); g.fillStyle = '#000';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) g.fillRect((x + 4) * s, (y + 4) * s, s, s);
    return true;
  }
};

/* ---- sign-in page: the code after the password ---- */
function tfaStep() {
  const f = $('#lf'); if (!f) return; let backup = false;
  const draw = () => {
    f.innerHTML = `<img src="assets/logo.png" alt="Jasper" class="lg-logo"><h2>Two-step sign-in</h2>
      <p class="lg-sub">${backup ? 'Enter one of your backup codes. Each code works once.' : 'Enter the 6-digit code from your authenticator app.'}</p>
      <div class="lg-f"><i class="i i-lock"></i><input id="tc" ${backup ? 'placeholder="Backup code" autocapitalize="characters" maxlength="14"' : 'placeholder="6-digit code" inputmode="numeric" pattern="[0-9 ]*" maxlength="7"'} autocomplete="one-time-code" autofocus></div>
      <div class="err" id="e"></div><button class="btn lg-go" id="go" type="submit">Verify</button>
      <p class="lg-foot tfa-ft"><button type="button" class="tfa-lk" id="tsw">${backup ? 'Use the authenticator app' : 'Lost your phone? Use a backup code'}</button><button type="button" class="tfa-lk" id="tbk">Back to sign in</button></p>`;
    $('#tsw', f).onclick = () => { backup = !backup; draw(); };
    $('#tbk', f).onclick = async () => { try { await api('auth', 'logout', {}); } catch (e) { } boot(); };
    const t = $('#tc', f); t.focus();
    if (!backup) t.oninput = () => { if (t.value.replace(/\D/g, '').length === 6) f.requestSubmit(); };
  };
  f.onsubmit = async e => {
    e.preventDefault(); const b = $('#go', f), code = $('#tc', f).value.trim(); if (!code || b.disabled) return;
    b.disabled = true; b.textContent = 'Please wait…';
    try { const r = await api('auth', 'login2', { code }); if (r && r.backup) setTimeout(() => toast('You signed in with a backup code. Make new ones in My account › Two-step sign-in if few are left.'), 1200); boot(); }
    catch (j) { $('#e', f).textContent = (j && j.error) || 'Failed'; b.disabled = false; b.textContent = 'Verify'; const t = $('#tc', f); t.value = ''; t.focus(); }
  };
  draw();
}

/* ---- My account › Two-step sign-in ---- */
async function tfaOpen() {
  let st; try { st = await api('auth', 'tfa_status'); } catch (e) { toast('Two-step sign-in could not be opened', true); return; }
  const m = modal('<div class="tfa" id="tfab"></div>'), box = $('#tfab', m); m.firstElementChild.style.maxWidth = '460px';
  const head = (t, sub) => `<h3 style="margin-top:0"><i class="i i-shield"></i> ${t}</h3><p class="mut tfa-p">${sub}</p>`;
  const err = msg => { const e = $('.err', box); if (e) e.textContent = msg || ''; };
  const call = async (a, body, btn) => { err(''); if (btn) btn.disabled = true; try { return await api('auth', a, body); } catch (j) { err((j && j.error) || 'Failed'); return null; } finally { if (btn) btn.disabled = false; } };
  const pwField = '<label for="tfpw">Your CRM password</label><input id="tfpw" type="password" autocomplete="current-password">';
  const codes = (list, first) => {
    box.innerHTML = head(first ? 'Two-step sign-in is on' : 'New backup codes', 'Keep these backup codes somewhere safe, away from your phone. If you lose the phone, each code signs you in once.' + (first ? ' Your other devices have been signed out.' : ' The old codes no longer work.'))
      + `<div class="tfa-codes">${list.map(c => `<code>${esc(c)}</code>`).join('')}</div>
         <div class="bar" style="margin-top:14px"><button class="btn" id="tfdone" type="button">I have saved them</button><button class="btn sec" id="tfcopy" type="button"><i class="i i-copy"></i> Copy</button></div>`;
    $('#tfcopy', box).onclick = async () => { try { await navigator.clipboard.writeText('Solarize CRM backup codes (' + ME.username + ')\n' + list.join('\n')); toast('Backup codes copied'); } catch (e) { toast('Could not copy — write them down', true); } };
    $('#tfdone', box).onclick = () => m.remove();
  };
  const off = () => {
    box.innerHTML = head('Two-step sign-in', 'Adds a second lock to your login. After your password, the CRM asks for a 6-digit code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, Authy or the iPhone Passwords app). A stolen password alone can no longer open your account.')
      + pwField + '<div class="err"></div><div class="bar" style="margin-top:14px"><button class="btn" id="tfgo" type="button">Turn on</button><button class="btn sec" id="tfx" type="button">Cancel</button></div>';
    $('#tfx', box).onclick = () => m.remove();
    $('#tfgo', box).onclick = async e => { const r = await call('tfa_begin', { password: $('#tfpw', box).value }, e.currentTarget); if (r) setup(r); };
    $('#tfpw', box).focus();
  };
  const setup = r => {
    box.innerHTML = head('Add the CRM to your app', '1. Open your authenticator app and scan this code (or type the key).<br>2. Enter the 6-digit code the app shows.')
      + `<div class="tfa-qr"><canvas id="tfqr" width="220" height="220" aria-label="QR code"></canvas></div>
         <p class="tfa-key"><span class="mut">Key</span> <code>${esc(r.secret.replace(/(.{4})/g, '$1 ').trim())}</code></p>
         <p class="tfa-open"><a class="btn sec sm" href="${esc(r.uri)}">Open in the authenticator app on this device</a></p>
         <label for="tfcode">6-digit code</label><input id="tfcode" inputmode="numeric" maxlength="7" autocomplete="one-time-code" placeholder="123456">
         <div class="err"></div><div class="bar" style="margin-top:14px"><button class="btn" id="tfok" type="button">Confirm and turn on</button><button class="btn sec" id="tfx" type="button">Cancel</button></div>`;
    QR.draw($('#tfqr', box), r.uri, 220);
    $('#tfx', box).onclick = () => m.remove();
    $('#tfok', box).onclick = async e => { const x = await call('tfa_enable', { code: $('#tfcode', box).value }, e.currentTarget); if (x) codes(x.codes, true); };
    $('#tfcode', box).focus();
  };
  const on = () => {
    box.innerHTML = head('Two-step sign-in is on', `Your login asks for a code from your authenticator app. Backup codes left: <b>${+st.codes_left}</b>.`)
      + pwField + '<div class="err"></div><div class="bar" style="margin-top:14px"><button class="btn sec" id="tfnew" type="button">New backup codes</button><button class="btn bad" id="tfoff" type="button">Turn off</button><span class="sp"></span><button class="btn sec" id="tfx" type="button">Close</button></div>';
    $('#tfx', box).onclick = () => m.remove();
    $('#tfnew', box).onclick = async e => { const r = await call('tfa_codes', { password: $('#tfpw', box).value }, e.currentTarget); if (r) codes(r.codes, false); };
    $('#tfoff', box).onclick = async e => { if (!$('#tfpw', box).value) return err('Enter your password first'); if (!confirm('Turn off two-step sign-in?\n\nYour login will need only the password again.')) return;
      const r = await call('tfa_off', { password: $('#tfpw', box).value }, e.currentTarget); if (r) { m.remove(); toast('Two-step sign-in is off'); } };
  };
  st.on ? on() : off();
}
if (typeof module !== 'undefined') module.exports = QR;
