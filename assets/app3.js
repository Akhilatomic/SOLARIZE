// Meta leads: live feed, notifications (bell, dashboard panel, toast, sound), 30-minute auto sync,
// and a reminder every 15 minutes while new leads wait unattended (they turn Lost after 24 hours — lead_autolost() in api/claims.php)
let FEED = { leads: [], count: 0, state: {} }, KNOWN = null, FEEDTIMER = null, SYNCTIMER = null, REMINDTIMER = null, SOUND = true;
const REMIND_MS = () => RULE('lead_remind_min') * 60 * 1000; /* Settings › Rules */
try { SOUND = localStorage.metaSound !== '0'; } catch (e) { }
const agoStr = c => { const t = new Date(String(c).replace(' ', 'T') + 'Z').getTime(); const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
const clock = ts => ts ? new Date(ts * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

function startMeta() {
  clearInterval(FEEDTIMER); clearInterval(SYNCTIMER); clearInterval(REMINDTIMER); KNOWN = null;
  if (!canR('leads')) return;
  refreshFeed(true);
  if (FRAME) { FEEDTIMER = setInterval(() => { if (!document.hidden) refreshFeed(); }, 45000); document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshFeed(); }); return; } /* a menu tab only reads the feed; syncing, reminders and alerts belong to the outer window */
  autoSync();
  FEEDTIMER = setInterval(() => { if (!document.hidden) refreshFeed(); }, 45000);          // pick up new leads quickly
  SYNCTIMER = setInterval(autoSync, 30 * 60 * 1000);                                       // refresh from Meta every 30 minutes
  REMINDTIMER = setInterval(leadRemind, 60000);                                            // checks each minute; reminds every 15 minutes
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshFeed(); });
}
/* The automatic sync says nothing when it fails ("Meta is not connected yet", Meta down): nobody asked for it, and the note came back
   every half hour. The Meta Ads page shows the last error, and "Sync now" (manualSync) still reports its own result. */
async function autoSync() { try { const r = await fetch('api.php?m=meta&a=sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(x => x.json()); if (!r || r.error) return; } catch (e) { return; } refreshFeed(); }
async function manualSync(btn) {
  if (btn) { btn.disabled = true; btn.dataset.t = btn.innerHTML; btn.innerHTML = 'Syncing…'; }
  try {
    const r = await fetch('api.php?m=meta&a=sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ manual: true }) }).then(x => x.json());
    await refreshFeed();
    const msg = r.error ? 'Sync failed: ' + r.error : r.skipped ? 'Already up to date (' + r.skipped.toLowerCase() + ')' : r.new ? r.new + ' new lead' + (r.new > 1 ? 's' : '') + ' from Meta' : 'No new leads';
    toast(msg, !!r.error);
  } finally { if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.t; } if (location.hash.startsWith('#/ads')) renderMetaCard(); }
}
async function refreshFeed(first) {
  let f; try { f = await api('meta', 'feed'); } catch (e) { return; }
  const ids = new Set(f.leads.map(l => l.id));
  if (KNOWN === null) KNOWN = ids;
  else { const fresh = f.leads.filter(l => !KNOWN.has(l.id)); if (fresh.length) alertNew(fresh); ids.forEach(i => KNOWN.add(i)); }
  if (APPLITE && f.leads.length) appCall('seenLead', String(Math.max(...f.leads.map(l => +l.id || 0)))); /* Android app: shown here, so its background check does not announce them again */
  FEED = f; drawBell(); renderNewLeads(); if (location.hash.startsWith('#/ads') && $('#metasync')) renderMetaCard(true);
}
function leadBeep() {
  if (SOUND) try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.type = 'sine'; o.frequency.value = 880; g.gain.setValueAtTime(.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(.15, a.currentTime + .02); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + .5); o.start(); o.stop(a.currentTime + .5); } catch (e) { }
}
/* the last lead alert, shared by every open tab so a reminder comes once per 15 minutes, not once per tab */
const remindAt = () => { try { return +localStorage.leadRemindAt || 0; } catch (e) { return 0; } };
const remindMark = () => { try { localStorage.leadRemindAt = String(Date.now()); } catch (e) { } };
/* The pop-up for leads that just arrived: a card that drops in at the top of whatever page is open and stays until it is
   dismissed or one of its buttons is used. It does not cover the page or take the keyboard, so typing elsewhere is not
   interrupted. Leads that arrive while it is open are added to it. Rows and buttons are the same as on the dashboard card
   (nlRow / bindNl): Call, WhatsApp, Open, Mark contacted, or Claim for a lead not claimed yet. */
let NLP = [];
function leadPopClose() { const p = $('#nlp'); if (p) { p.classList.add('bye'); setTimeout(() => p.remove(), 220); } NLP = []; document.removeEventListener('keydown', leadPopKey); }
function leadPopKey(e) { if (e.key === 'Escape' && $('#nlp') && !$('.modal')) leadPopClose(); }
function leadPop(fresh) {
  fresh.forEach(l => { if (!NLP.some(x => x.id === l.id)) NLP.unshift(l); });
  const n = NLP.length, show = NLP.slice(0, 4); let p = $('#nlp');
  if (!p) { p = document.createElement('div'); p.id = 'nlp'; p.className = 'nlp'; p.setAttribute('role', 'alertdialog'); p.setAttribute('aria-live', 'assertive'); document.body.appendChild(p); document.addEventListener('keydown', leadPopKey); }
  else { p.classList.remove('again'); void p.offsetWidth; p.classList.add('again'); } /* already open: a small shake for the new arrival */
  p.setAttribute('aria-label', n === 1 ? 'New lead' : n + ' new leads');
  p.innerHTML = `<div class="nlp-g" aria-hidden="true"></div><div class="nlp-h"><span class="nlp-ping"><i class="i i-bell"></i></span><div class="nlp-t"><b>${n === 1 ? 'New lead just arrived' : n + ' new leads just arrived'}</b><small>The first to respond usually wins the customer</small></div><button type="button" class="nlp-x" id="nlpx" title="Dismiss (Esc)" aria-label="Dismiss"><i class="i i-x"></i></button></div>
    <div class="nlp-l">${show.map(nlRow).join('')}${n > show.length ? `<p class="nlp-m">+ ${n - show.length} more in Leads</p>` : ''}</div>
    <div class="nlp-f"><a class="btn sm" href="#/leads" id="nlpa">View all leads</a><button type="button" class="btn sec sm" id="nlpd">Dismiss</button></div>`;
  bindNl(p);
  $('#nlpx', p).onclick = $('#nlpd', p).onclick = leadPopClose; $('#nlpa', p).onclick = () => leadPopClose();
  /* using a lead's button answers the pop-up */
  p.onclick = e => { if (e.target.closest('[data-claim],[data-ack],[data-open],[data-done],[data-wa]')) setTimeout(leadPopClose, 0); };
}
function alertNew(fresh) {
  if (FRAME) return; /* menu tabs: the outer window shows the pop-up once */
  remindMark();
  if (document.body && $('#shell')) leadPop(fresh); else toast(fresh.length === 1 ? 'New lead: ' + fresh[0].name + (fresh[0].phone ? ' · ' + fresh[0].phone : '') : fresh.length + ' new leads from Meta', false, true);
  leadBeep();
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification('New Meta lead', { body: fresh.map(l => l.name + (l.phone ? ' · ' + l.phone : '')).join('\n'), icon: 'assets/logo.png' }); } catch (e) { }
}
/* Owner's rule: while new leads this user can see are still unattended (not opened, called, marked contacted or edited),
   remind every 15 minutes — toast, sound and a desktop notification. Runs in hidden tabs too (that is when it matters). */
async function leadRemind() {
  if (Date.now() - remindAt() < REMIND_MS()) return;
  await refreshFeed();
  const n = FEED.count || 0; if (!n || Date.now() - remindAt() < REMIND_MS()) return; /* another tab may have reminded meanwhile */
  remindMark();
  const L = FEED.leads.slice(0, 3).map(l => l.name + (l.phone ? ' · ' + l.phone : ''));
  const head = n === 1 ? '1 new lead is waiting — not attended yet' : n + ' new leads are waiting — not attended yet';
  toast(head + (L.length ? ': ' + L.join(', ') + (n > L.length ? '…' : '') : ''), false, true);
  leadBeep();
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const nt = new Notification('Leads waiting', { body: head + (L.length ? '\n' + L.join('\n') : '') + '\nUnattended leads turn Lost after ' + RULE('lead_lost_hours') + ' hours.', icon: 'assets/logo.png', tag: 'lead-remind', renotify: true });
      nt.onclick = () => { window.focus(); location.hash = '#/dashboard'; nt.close(); };
    }
  } catch (e) { }
}
function toast(msg, bad, click) {
  let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.innerHTML = `<i class="i i-${bad ? 'alert' : 'bell'}"></i><span>${esc(msg)}</span>`;
  if (click) { t.style.cursor = 'pointer'; t.onclick = () => { location.hash = '#/dashboard'; t.remove(); }; }
  if (bad) { t.setAttribute('role', 'alert'); if (!click) { t.style.cursor = 'pointer'; t.title = 'Close'; t.onclick = () => t.remove(); } }
  box.appendChild(t); setTimeout(() => t.remove(), bad ? Math.max(7000, Math.min(20000, String(msg).length * 90)) : 9000); /* a long error stays long enough to read */
}
function drawBell() {
  const lv = typeof HR !== 'undefined' && HR.pend ? HR.pend.length : 0, dn = typeof DISC !== 'undefined' ? DISC.count : 0, n = FEED.count + lv + dn;
  const b = $('#bell'); if (b) { b.querySelector('.bd').textContent = n > 99 ? '99+' : n; b.classList.toggle('has', n > 0); b.title = (FEED.count ? FEED.count + ' new lead(s)' : 'New leads') + (lv ? ' · ' + lv + ' leave request(s)' : '') + (dn ? ' · ' + dn + ' discussion update(s)' : ''); }
  document.title = (n ? '(' + n + ') ' : '') + 'Solarize CRM';
}
function nlRow(l) {
  const w = canW('leads') && !!l.can_edit;
  if (!l.can_edit) return `<div class="nl" data-id="${l.id}"><div class="nlm"><b>${esc(l.name)}</b> <span class="mut">· ${agoStr(l.created)}</span><br><span class="u-fs13">${esc(l.phone || '')}${l.city ? ' · ' + esc(l.city) : ''}</span>${l.meta_campaign ? `<br><span class="pill">${esc(l.meta_campaign)}</span>` : ''}</div><div class="nla">${ME.can_claim && canW('leads') ? `<button class="btn sm claim" data-claim="${l.id}"><i class="i i-userplus"></i> Claim</button>` : '<span class="mut u-fs12">Unclaimed</span>'}<button class="btn sm sec" data-open="${l.id}" title="Open lead"><i class="i i-eye"></i></button></div></div>`;
  return `<div class="nl" data-id="${l.id}"><div class="nlm"><b>${esc(l.name)}</b> <span class="mut">· ${agoStr(l.created)}</span><br><span class="u-fs13">${esc(l.phone || 'no phone')}${l.city ? ' · ' + esc(l.city) : ''}</span>${l.meta_campaign ? `<br><span class="pill">${esc(l.meta_campaign)}</span>` : ''}${/duplicate/i.test(l.notes || '') ? ' <span class="pill y">possible duplicate</span>' : ''}</div>
   <div class="nla">${l.phone ? `<a class="btn sm" href="tel:${esc(l.phone)}" data-ack="${l.id}" title="Call"><i class="i i-phone"></i> Call</a>${BA() ? '' : `<button class="btn sm sec" data-wa="${l.id}" title="WhatsApp"><i class="i i-chat"></i></button>`}` : ''}
   <button class="btn sm sec" data-open="${l.id}" title="Open lead"><i class="i i-eye"></i></button>${w ? `<button class="btn sm sec" data-done="${l.id}" title="Mark contacted"><i class="i i-check"></i></button>` : ''}</div></div>`;
}
function bindNl(root) {
  $$('[data-claim]', root).forEach(b => b.onclick = async () => { const l = FEED.leads.find(x => x.id == b.dataset.claim); if (await claimLead(+b.dataset.claim, l && l.name)) { await refreshFeed(); if (location.hash.startsWith('#/leads')) route(); } });
  $$('[data-ack]', root).forEach(a => a.addEventListener('click', () => { api('meta', 'ack', { id: +a.dataset.ack, contacted: 1 }).then(refreshFeed); }));
  $$('[data-wa]', root).forEach(b => b.onclick = () => { const l = FEED.leads.find(x => x.id == b.dataset.wa); if (l) waOpen({ name: l.name, phone: l.phone, lead_id: l.id }); });
  $$('[data-open]', root).forEach(b => b.onclick = () => { const p = $('#bellp'); if (p) p.classList.add('hide'); leadModal(+b.dataset.open); });
  $$('[data-done]', root).forEach(b => b.onclick = async () => { await api('meta', 'ack', { id: +b.dataset.done, contacted: 1 }); refreshFeed(); });
}
function renderNewLeads() {
  const box = $('#newleads'); if (box) {
    /* dashboard: only leads from the last 24 hours (older ones stay in Leads and the bell) */
    const R = FEED.leads.filter(l => Date.now() - new Date(String(l.created || '').replace(' ', 'T') + 'Z') <= 864e5), n = FEED.day ?? R.length, L = R.slice(0, 8);
    /* the dashboard card is the dark "radar" card (styles: #newleads in app2.css); the same rows in the bell panel keep the light look */
    box.innerHTML = `<div class="card nlc ${n ? 'hot' : ''}"><div class="nlx-bg" aria-hidden="true"></div><div class="bar nlx-h u-m0_0_6"><h3 class="u-m0"><span class="nlx-bell"><i class="i i-bell"></i></span> New leads to contact <span class="pill ${n ? 'r' : ''}">${n}</span> <small class="mut" style="font-weight:400;font-size:12px">last 24 hours</small></h3><span class="sp"></span>
     ${FEED.state.connected ? `<small class="mut nlx-sync"><span class="nlx-live" aria-hidden="true"></span>Synced ${clock(FEED.state.last_ok)}</small> <button class="btn sec sm" id="nlr"><i class="i i-refresh"></i> Refresh</button>` : ''}${n > 8 ? '<a class="btn sec sm" href="#/leads">All</a>' : ''}</div>
     ${L.length ? `<div class="nlx-list">${L.map(nlRow).join('')}</div>` : `<div class="nlx-empty"><div class="nlx-radar" aria-hidden="true"><span></span><span></span><span></span><i></i><b></b></div>
       <div class="nlx-et"><b>All clear</b><p>${FEED.state.connected ? 'No new leads in the last 24 hours. New Meta leads appear here as soon as they arrive.' : 'No new leads in the last 24 hours. Connect Meta Lead Ads on the Meta Ads page to get new leads here automatically.'}</p></div></div>`}</div>`;
    bindNl(box); if ($('#nlr')) $('#nlr').onclick = e => manualSync(e.currentTarget);
  }
  const p = $('#bellp'); if (p && !p.classList.contains('hide')) drawBellPanel();
}
function drawBellPanel() {
  const p = $('#bellp'); const L = FEED.leads.slice(0, 12), hrH = (typeof discBellHtml === 'function' ? discBellHtml() : '') + (typeof hrBellHtml === 'function' ? hrBellHtml() : '');
  if (!canR('leads')) { p.innerHTML = hrH || '<p class="mut u-fs13-m8_0">No new notifications.</p>'; if (typeof hrBellBind === 'function') hrBellBind(p); if (typeof discBellBind === 'function') discBellBind(p); return; }
  p.innerHTML = hrH + `<div class="bar u-m0_0_4"><b>New leads (${FEED.count})</b><span class="sp"></span>${FEED.count ? '<button class="btn sec sm" id="bclr">Mark all seen</button>' : ''}</div>
   ${L.map(nlRow).join('') || '<p class="mut u-fs13-m8_0">No new leads waiting.</p>'}
   <div class="bar" style="margin:8px 0 0"><label style="margin:0;display:flex;gap:6px;align-items:center;color:var(--tx);font-size:12px"><input type="checkbox" id="bsnd" style="width:auto" ${SOUND ? 'checked' : ''}> Sound</label><button class="btn sec sm" id="bpush">Desktop alerts</button><span class="sp"></span><button class="btn sec sm" id="bsy"><i class="i i-refresh"></i> Sync</button></div>`;
  bindNl(p); if (hrH) { hrBellBind(p); discBellBind(p); }
  if ($('#bclr')) $('#bclr').onclick = async () => { await api('meta', 'ack', { all: 1 }); refreshFeed(); };
  $('#bsnd').onchange = e => { SOUND = e.target.checked; try { localStorage.metaSound = SOUND ? '1' : '0'; } catch (x) { } };
  $('#bpush').onclick = async () => { if (!('Notification' in window)) return sayBad('This browser does not support desktop notifications'); const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Desktop alerts enabled' : 'Desktop alerts blocked in browser settings', r !== 'granted'); };
  $('#bsy').onclick = e => manualSync(e.currentTarget);
}
function mountBell() {
  if ((!canR('leads') && !canR('customers') && !(typeof HR !== 'undefined' && HR.me && HR.me.manage_lv)) || $('#bell')) return;
  const top = $('.top'); if (!top) return;
  const w = document.createElement('div'); w.style.position = 'relative';
  w.innerHTML = '<button class="btn sec sm" id="bell" title="Notifications"><i class="i i-bell"></i><span class="bd">0</span></button><div id="bellp" class="card hide"></div>';
  top.insertBefore(w, $('#pwb')); drawBell();
  $('#bell').onclick = e => { e.stopPropagation(); const p = $('#bellp'); p.classList.toggle('hide'); if (!p.classList.contains('hide')) drawBellPanel(); };
  document.addEventListener('click', e => { const p = $('#bellp'); if (p && !p.classList.contains('hide') && !p.contains(e.target) && !e.target.closest('[data-done],[data-ack],[data-wa],[data-lap],[data-lrj],[data-dn],#dnall,.modal')) p.classList.add('hide'); });
}

// ---------- Meta Ads page: sync status + connection ----------
/* Meta's error in full: the step, Meta's code / subcode and trace id (for Meta support), and what to check */
function metaErrHtml(d) {
  if (!d) return '';
  const meta = [d.step && 'While: ' + d.step.toLowerCase(), d.code && 'Meta error ' + d.code + (d.subcode ? ' / ' + d.subcode : ''), d.trace && 'trace ' + d.trace].filter(Boolean).join(' · ');
  return `<div class="merr">${meta ? `<small>${esc(meta)}</small>` : ''}${d.user_msg ? `<p>${esc(d.user_msg)}</p>` : ''}${d.hint ? `<p><b>What to do:</b> ${esc(d.hint)}</p>` : ''}</div>`;
}
async function renderMetaCard(soft) {
  const box = $('#metasync'); if (!box) return;
  const st = FEED.state || {}, adm = ME.role === 'admin';
  let cfg = null; if (adm) { try { cfg = await api('meta', 'config'); } catch (e) { } }
  if (!$('#metasync')) return;
  const open = $('#mcfg')?.open ?? !(st.connected);
  box.innerHTML = `<div class="card"><div class="bar u-m0"><div><h3 class="u-m0">Meta lead sync</h3><div class="mut u-fs13">${st.connected ? (st.last_error ? `<span class="over">Last sync failed: ${esc(st.last_error)}</span>${metaErrHtml(st.last_detail)}` : `Last synced <b>${clock(st.last_ok)}</b>${st.last_new ? ` · ${st.last_new} new` : ''} · automatic refresh every 30 min · ${st.total_new || 0} leads imported so far`) : 'Not connected. New Meta leads will be imported automatically once connected.'}</div></div><span class="sp"></span>
    ${st.connected ? '<button class="btn" id="msync"><i class="i i-refresh"></i> Refresh now</button>' : ''}</div>
    ${adm && cfg ? `<details id="mcfg" style="margin-top:12px" ${open ? 'open' : ''}><summary style="cursor:pointer;font-weight:600">Connection settings</summary>
     <p class="mut u-fs13-m8_0">Create a long-lived <b>Page access token</b> in Meta (Graph API Explorer or a System User) with <code>leads_retrieval</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code> and <code>pages_manage_ads</code> permissions, then paste it with your Facebook Page ID. Leave Form IDs empty to sync all lead forms on the page.</p>
     <div class="two"><div><label>Facebook Page ID</label><input id="m-page" value="${esc(cfg.page_id)}" placeholder="e.g. 1234567890"></div><div><label>Page access token ${cfg.token_set ? '<span class="pill g">saved ' + esc(cfg.token_hint) + '</span>' : ''}</label><input id="m-token" type="password" placeholder="${cfg.token_set ? 'Leave blank to keep the saved token' : 'Paste token'}" autocomplete="off"></div>
     <div class="full"><label>Lead form IDs (optional, comma separated)</label><input id="m-forms" value="${esc(cfg.form_ids)}"></div></div>
     <div class="bar u-mt10"><button class="btn" id="m-save">Save</button><button class="btn sec" id="m-test">Test connection</button>${cfg.token_set ? '<button class="btn bad" id="m-clear">Disconnect</button>' : ''}</div><div id="m-res" class="mut u-fs13"></div>
     <p class="mut" style="font-size:13px;margin:14px 0 4px"><b>Keep syncing when nobody is logged in (optional):</b> in Hostinger hPanel → Advanced → Cron Jobs, add a job every 30 minutes with this command:</p>
     <input readonly id="m-cron" style="font-family:monospace;font-size:12px" value="wget -q -O /dev/null --header=&quot;X-Cron-Key: ${esc(cfg.cron_key)}&quot; &quot;${esc(location.origin + location.pathname.replace(/[^/]*$/, ''))}api.php?m=meta&a=cron&quot;"></details>` : ''}</div>`;
  if ($('#msync')) $('#msync').onclick = e => manualSync(e.currentTarget);
  if (!adm || !cfg) return;
  $('#m-save').onclick = async () => { await api('meta', 'save', { page_id: $('#m-page').value, token: $('#m-token').value, form_ids: $('#m-forms').value }); toast('Saved'); renderMetaCard(); };
  $('#m-test').onclick = async () => {
    await api('meta', 'save', { page_id: $('#m-page').value, token: $('#m-token').value, form_ids: $('#m-forms').value });
    $('#m-res').textContent = 'Testing…'; const r = await api('meta', 'test', {});
    $('#m-res').innerHTML = r.ok ? `<span class="u-cok">Connected to “${esc(r.page)}”.</span> ${r.forms.length} lead form${r.forms.length === 1 ? '' : 's'} found${r.forms.length ? ': ' + r.forms.map(f => esc(f.name || f.id)).join(', ') : ''}. Click “Refresh now” to import leads.` : `<span class="over">${esc(r.error)}</span>${metaErrHtml(r.detail)}`;
    if (r.ok) { await refreshFeed(); }
  };
  if ($('#m-clear')) $('#m-clear').onclick = async () => { if (await ask('Disconnect Meta? Existing leads stay; syncing stops.')) { await api('meta', 'save', { page_id: $('#m-page').value, clear_token: 1 }); renderMetaCard(); } };
}
