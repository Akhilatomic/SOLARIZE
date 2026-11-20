// Solarize CRM - customer profile › KSEB login: the customer's KSEB consumer-portal User ID and password, kept with the
// customer so the office can download their KSEB bill. The password is stored encrypted on the server (profile/kl_save),
// is never sent with the customer record, and is fetched only when someone presses Show or Copy (profile/kl_pw, logged).
// The CRM does not sign in to KSEB: the button only opens the official site in a new tab.
const KSEB_PORTAL = 'https://wss.kseb.in/selfservices/';
async function renderKsebLogin(box, c, id) {
  box.innerHTML = '<div class="card kbl"><p class="mut" style="margin:0">Loading…</p></div>';
  let d; try { d = await api('profile', 'kl_get', undefined, '&customer_id=' + id); } catch (e) { box.innerHTML = '<div class="card kbl"><p class="over" style="margin:0">Could not load the KSEB login.</p></div>'; return; }
  if (!document.body.contains(box)) return;
  const w = !!d.can_edit; let pw = null, shown = false, dirty = false; /* pw: null = not fetched yet */
  const draw = () => {
    box.innerHTML = `<div class="card kbl"><div class="kbl-h"><h3>KSEB login</h3><p>Consumer portal login for downloading this customer’s KSEB bill. Saved on this customer record and available wherever the record is opened.</p></div>
      <div class="kbl-f"><label for="kblu">User ID</label><div class="kbl-i"><input id="kblu" value="${esc(d.user_id || '')}" placeholder="KSEB portal user ID" autocomplete="off" autocapitalize="off" spellcheck="false" ${w ? '' : 'disabled'}><i class="i i-user"></i></div></div>
      <div class="kbl-f"><label for="kblp">Password</label><div class="kbl-i"><input id="kblp" type="password" value="" placeholder="${d.has_pw ? '••••••••  (saved — press the eye to show it)' : 'Not saved yet'}" autocomplete="new-password" autocapitalize="off" spellcheck="false" ${w ? '' : 'disabled'}>
        ${w ? '<button type="button" class="ib" id="kble" title="Show or hide the password" aria-label="Show or hide the password"><i class="i i-eye"></i></button>' : ''}<i class="i i-lock"></i></div></div>
      <div class="kbl-a">${w ? '<button type="button" class="btn" id="kbls">Save</button>' : ''}<span class="sp"></span>
        <button type="button" class="btn sec" id="kblcu"><i class="i i-copy"></i> Copy User ID</button>${w ? '<button type="button" class="btn sec" id="kblcp"><i class="i i-copy"></i> Copy password</button>' : ''}
        <a class="btn kbl-go" href="${KSEB_PORTAL}" target="_blank" rel="noopener noreferrer"><i class="i i-link"></i> Open KSEB to download bill</a></div>
      <p class="kbl-n">Opens the official KSEB self-service site in a new tab. Paste the saved User ID and password there to download the bill. This CRM does not connect to or sign in to KSEB.${d.updated ? ` <span>Last saved ${dmy(d.updated)}${d.updated_by ? ' by ' + esc(d.updated_by) : ''}.</span>` : ''}
        ${w && (d.user_id || d.has_pw) ? ' <a href="#" id="kblx">Remove the saved login</a>' : ''}${w ? '' : ' <span>You can see the User ID; the password is for staff who can edit customers.</span>'}</p></div>`;
    const u = $('#kblu', box), p = $('#kblp', box);
    const need = async () => { if (pw === null && d.has_pw) pw = (await api('profile', 'kl_pw', { customer_id: id })).password || ''; return pw || ''; };
    if (w) {
      p.oninput = () => { dirty = true; pw = p.value; };
      $('#kble', box).onclick = async () => { try { if (!dirty) { await need(); p.value = pw || ''; } shown = !shown; p.type = shown ? 'text' : 'password'; } catch (e) { } };
      $('#kblcp', box).onclick = async () => { try { const v = dirty ? p.value : await need(); if (!v) return toast('No password is saved', true); copyText(v, 'Password'); } catch (e) { } };
      $('#kbls', box).onclick = async e => { const b = e.currentTarget; b.disabled = true;
        try { const body = { customer_id: id, user_id: u.value.trim() }; if (dirty) body.password = p.value;
          d = Object.assign(d, await api('profile', 'kl_save', body)); if (dirty) pw = p.value; dirty = false; shown = false; toast('KSEB login saved'); draw(); } catch (x) { b.disabled = false; } };
      const rm = $('#kblx', box); if (rm) rm.onclick = async e => { e.preventDefault(); if (!await ask(`Remove the saved KSEB login of ${c.name}?`)) return;
        try { d = Object.assign(d, await api('profile', 'kl_save', { customer_id: id, user_id: '', password: '' })); pw = ''; dirty = false; toast('KSEB login removed'); draw(); } catch (x) { } };
      u.onkeydown = p.onkeydown = e => { if (e.key === 'Enter') $('#kbls', box).click(); };
    }
    $('#kblcu', box).onclick = () => { const v = u.value.trim(); if (!v) return toast('No User ID is saved', true); copyText(v, 'User ID'); };
  };
  draw();
}
