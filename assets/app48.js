// Solarize CRM - feasibility about to expire: the CRM's own pop-up with a warning sound (owner's rule 2026-11-20)
/* For staff with Finance fee access. Every paid KSEB feasibility with 3 days or fewer left (Settings › Rules: feasibility alert days)
   shows in one pop-up; it comes back every 3 hours (counted per person on the server, so every tab and device agrees) until the
   person dismisses a customer's one, or that feasibility is renewed (a new payment date), the registration fee is paid or the
   project completes. "Remind me in 3 hours" just closes it for now. Checked when the CRM opens and every 5 minutes after that. */
const FEASPOP = { t: null, open: false, busy: false };
function startFeasPop() {
  if (typeof FRAME !== 'undefined' && FRAME) return; /* menu tabs: only the outer window asks, so it shows once */
  if (!canR('fees')) return;
  clearInterval(FEASPOP.t); FEASPOP.t = setInterval(feasPopCheck, 5 * 60000);
  setTimeout(feasPopCheck, 4000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) feasPopCheck(); });
}
async function feasPopCheck() {
  if (FEASPOP.open || FEASPOP.busy || document.hidden || !ME || !canR('fees')) return;
  FEASPOP.busy = true;
  try {
    const d = await api('fees', 'feas_alerts');
    if (d.rows && d.rows.length && d.now - d.seen >= d.every) feasPopShow(d);
  } catch (e) { } finally { FEASPOP.busy = false; }
}
/* a short two-tone warning (no sound file needed); follows the bell's sound switch only when it was turned off on purpose */
function feasPopSound() {
  if (typeof SOUND !== 'undefined' && SOUND === false) return;
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)(), g = a.createGain(); g.connect(a.destination);
    [[880, 0], [660, .22], [880, .44], [660, .66]].forEach(([f, t]) => { const o = a.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(g); o.start(a.currentTime + t); o.stop(a.currentTime + t + .18); });
    g.gain.setValueAtTime(.06, a.currentTime); g.gain.setValueAtTime(.06, a.currentTime + .84); g.gain.linearRampToValueAtTime(0, a.currentTime + .9);
    setTimeout(() => a.close && a.close(), 1500);
  } catch (e) { }
}
function feasPopShow(d) {
  FEASPOP.open = true;
  const when = n => n <= 0 ? 'Expires today' : n === 1 ? '1 day left' : n + ' days left';
  const m = modal(`<div class="fpw"><div class="fpw-h"><span class="fpw-i"><i class="i i-alert"></i></span><div><h3>Feasibility about to expire</h3>
      <small class="mut">${d.rows.length} customer${d.rows.length === 1 ? '' : 's'} with ${d.warn_days} days or fewer left. Renew the KSEB feasibility payment before it runs out.</small></div></div>
    <div class="fpw-l">${d.rows.map(r => `<div class="fpw-r" data-fid="${r.id}"><div><a href="#/customers/${r.customer_id}" data-go><b>${esc(r.name)}</b></a>
      <small class="mut">${esc([r.phone, r.consumer_no].filter(Boolean).join(' · '))}${r.phone || r.consumer_no ? ' · ' : ''}expires ${dmy(r.expires)}</small></div>
      <span class="pill r">${when(r.days_left)}</span><button class="btn sec sm" type="button" data-dis="${r.id}" title="No more pop-ups for this customer until the feasibility is paid again">Dismiss</button></div>`).join('')}</div>
    <div class="bar fpw-b"><a href="#/fees/feasibility" class="btn sec" data-go>Open Feasibility fee</a><span class="sp"></span>
      <button class="btn sec" id="fpwl" type="button">Remind me in 3 hours</button>${d.rows.length > 1 ? '<button class="btn bad" id="fpwa" type="button">Dismiss all</button>' : ''}</div></div>`);
  m.classList.add('fpwm');
  let closed = false;
  const close = () => { if (closed) return; closed = true; FEASPOP.open = false; ob.disconnect(); m.remove(); };
  const later = () => { api('fees', 'feas_seen', {}).catch(() => { }); close(); };
  const ob = new MutationObserver(() => { if (!document.body.contains(m)) { if (!closed) { closed = true; FEASPOP.open = false; ob.disconnect(); api('fees', 'feas_seen', {}).catch(() => { }); } } });
  ob.observe(document.body, { childList: true }); /* a click outside or Esc = Remind me later */
  const dismiss = async ids => { try { await api('fees', 'feas_dismiss', { ids }); } catch (e) { return; }
    ids.forEach(id => { const r = $(`[data-fid="${id}"]`, m); if (r) r.remove(); });
    if (!$('.fpw-r', m)) { toast('Feasibility reminders dismissed'); close(); } };
  $$('[data-dis]', m).forEach(b => b.onclick = () => dismiss([+b.dataset.dis]));
  if ($('#fpwa', m)) $('#fpwa', m).onclick = () => dismiss(d.rows.map(r => r.id));
  $('#fpwl', m).onclick = later;
  $$('[data-go]', m).forEach(a => a.addEventListener('click', later));
  m.addEventListener('keydown', e => { if (e.key === 'Escape') later(); });
  setTimeout(() => { const b = $('#fpwl', m); if (b) b.focus(); }); /* Esc works at once */
  feasPopSound();
  if (typeof discDesk === 'function') { try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification('Feasibility about to expire', { body: d.rows.map(r => r.name + ' — ' + when(r.days_left)).join('\n'), icon: 'assets/logo.png' }); } catch (e) { } }
}
