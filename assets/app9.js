// Team discussions on customers and leads: chat with @mentions, notifications in the bell, "end discussion".
let DISC = { sum: {}, lsum: {}, notifs: [], count: 0, seen: null, timer: null, live: null, redraw: null, lredraw: null };
// a discussion subject: a customer id (number) or {customer_id} / {lead_id}
const discT = t => (t && typeof t === 'object') ? (t.lead_id ? { lead_id: +t.lead_id } : { customer_id: +t.customer_id }) : { customer_id: +t };
const discRank = id => { const x = DISC.sum[id]; return x ? (+x.unread ? 2 : 1) : 0; };
// desktop notifications: ask once on the first click (browsers only allow the prompt after a user action)
function discDesk(title, body, tgt) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { const n = new Notification(title, { body, tag: 'disc-' + Date.now(), icon: 'assets/logo.png' }); n.onclick = () => { window.focus(); n.close(); if (typeof tgt === 'string') location.hash = tgt; else if (typeof tgt === 'function') tgt(); else if (tgt) discOpen(tgt); }; } catch (e) { }
}
document.addEventListener('click', function askDesk() { document.removeEventListener('click', askDesk, true);
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(p => { if (p === 'granted') toast('Desktop notifications turned on'); }); }, true);

async function discSummary() {
  if (!canR('customers') && !canR('leads')) return;
  let r; try { r = await api('disc', 'summary'); } catch (e) { return; }
  const before = JSON.stringify([DISC.sum, DISC.lsum]);
  DISC.sum = Object.fromEntries(r.customers.map(x => [x.customer_id, x])); DISC.lsum = Object.fromEntries(r.leads.map(x => [x.lead_id, x]));
  const all = [...r.customers, ...r.leads], ids = all.map(x => x.id);
  if (DISC.live) all.filter(x => !DISC.live.includes(x.id) && x.created_by != ME.id).forEach(x => { const what = (x.lead_id ? 'lead ' : '') + x.subject;
    toast(`Live discussion started on ${what} by ${x.created_name}`);
    discDesk('Live discussion · ' + what, (x.created_name || 'Someone') + ' started a discussion' + (x.topic ? ': ' + x.topic : ''), x.lead_id ? { lead_id: x.lead_id } : { customer_id: x.customer_id }); });
  DISC.live = ids;
  if (JSON.stringify([DISC.sum, DISC.lsum]) !== before && !document.querySelector('.xdmod')) {
    if (DISC.redraw && /^#\/customers\/?$/.test(location.hash)) DISC.redraw();
    if (DISC.lredraw && /^#\/leads\/?$/.test(location.hash) && !document.querySelector('#ltb .editing, #ltb input, #ltb select')) DISC.lredraw(); }
}
function discBtn(cid, lead) {
  const s = (lead ? DISC.lsum : DISC.sum)[cid], n = s ? +s.unread : 0;
  return `<button class="ib xdb ${s ? 'on live' : ''}" data-a="ds" title="${s ? `LIVE discussion · ${s.msgs} message${s.msgs == 1 ? '' : 's'}${n ? ` · ${n} unread` : ''}` : 'Start a team discussion'}"><i class="i i-chat"></i>${n ? `<span class="xdn">${n > 9 ? '9+' : n}</span>` : ''}</button>`;
}

// ---------- discussion panel ----------
function discFmt(m, users) {
  let h = esc(m.body);
  (m.mentions || []).forEach(id => { const u = users.find(x => x.id == id); if (u) h = h.split('@' + esc(u.name)).join(`<span class="xdm">@${esc(u.name)}</span>`); });
  return h.replace(/\n/g, '<br>');
}
function discTime(c) { const d = new Date(String(c).replace(' ', 'T') + 'Z'); return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function discMsgs(d, data) {
  if (!d.msgs.length) return '<p class="mut xdempty">No messages yet.</p>';
  return d.msgs.map(m => m.kind === 'end'
    ? `<div class="xdsys"><i class="i i-check"></i> Discussion ended by <b>${esc(m.user_name || '')}</b> · ${discTime(m.created)}${m.body ? `<div class="xdout">${esc(m.body)}</div>` : ''}</div>`
    : `<div class="xdmsg ${m.user_id == data.me ? 'me' : ''}"><div class="xdav">${m.user_av ? avImg(m.user_id, m.user_av, m.user_name) : esc((m.user_name || '?').trim().charAt(0).toUpperCase())}</div><div class="xdbub"><div class="xdhd"><b>${esc(m.user_name || 'Removed user')}</b><span>${discTime(m.created)}</span></div><div class="xdtx">${discFmt(m, data.users)}</div></div></div>`).join('');
}

async function discOpen(tgt) {
  const T = discT(tgt), isLead = !!T.lead_id;
  let data, openD, pastOpen = {};
  const m = modal('<div class="xdw"><p class="mut" style="padding:20px">Loading…</p></div>'); m.classList.add('xdmod');
  const close = () => { clearInterval(DISC.timer); m.remove(); discSummary().then(() => { if (/^#\/(customers|leads)\/?$/.test(location.hash)) route(); }); refreshNotifs(); };
  m.addEventListener('mouseup', () => { if (!document.body.contains(m)) close(); });
  const load = async () => { data = await api('disc', 'thread', undefined, isLead ? '&lead_id=' + T.lead_id : '&customer_id=' + T.customer_id); openD = data.discussions.find(d => d.status === 'Open'); };
  const draw = () => {
    const c = data.customer, past = data.discussions.filter(d => d.status !== 'Open');
    const keep = $('#xdtx', m) ? { v: $('#xdtx', m).value, s: $('#xdtx', m).selectionStart, f: document.activeElement === $('#xdtx', m), tags: m._tags } : null;
    $('.xdw', m).innerHTML = `
     <div class="xdh"><span class="lvi"><i class="i i-chat"></i></span><div class="xdht"><h2>${isLead ? '<span class="pill b" style="vertical-align:3px;margin-right:6px">Lead</span>' : ''}${esc(c.name)}</h2><small>${openD ? `Discussion${openD.topic ? ' · ' + esc(openD.topic) : ''} · started by ${esc(openD.created_name || '')} ${agoStr(openD.created)}` : (isLead ? 'Team discussion about this lead' : 'Team discussion about this customer')}</small></div>
      ${openD && openD.can_end ? '<button class="btn sec sm" id="xdend"><i class="i i-check"></i> End discussion</button>' : ''}<button class="lvx" id="xdx" title="Close"><i class="i i-x"></i></button></div>
     <div class="xdbody" id="xdb">
      ${past.length ? `<div class="xdhist"><div class="xdhl"><i class="i i-clock"></i> History · ${past.length} ended discussion${past.length === 1 ? '' : 's'}</div>${past.slice().reverse().map((d, k, arr) => { const isOpen = pastOpen[d.id] ?? (!openD && k === arr.length - 1), n = d.msgs.filter(x => x.kind !== 'end').length;
        return `<details class="xdold" data-pd="${d.id}" ${isOpen ? 'open' : ''}><summary><div class="xdoh"><span class="pill">Ended</span><b>${esc(d.topic || 'Discussion')}</b><span class="mut">${n} message${n === 1 ? '' : 's'}</span></div>
          <div class="mut xdom">Started by ${esc(d.created_name || '')} · ${discTime(d.created)} — ended by ${esc(d.closed_name || '')} · ${discTime(d.closed_at)}</div>${d.outcome ? `<div class="xdout"><b>Outcome:</b> ${esc(d.outcome)}</div>` : ''}</summary><div class="xdlist">${discMsgs(d, data)}</div></details>`; }).join('')}</div>` : ''}
      ${openD ? `<div class="xdlist" id="xdl">${discMsgs(openD, data)}</div>` : `<div class="xdnew"><i class="i i-chat"></i><b>${past.length ? 'Start a new discussion' : 'No discussion yet'}</b><span class="mut">Start one to discuss ${isLead ? 'this lead' : 'status and updates'} with the team. Tag people with @ to notify them.</span><input id="xdtopic" placeholder="Topic (optional), e.g. KSEB feasibility delay" maxlength="120"></div>`}
     </div>
     <div class="xdcomp"><div class="xdmenu hide" id="xdmenu"></div>
      <textarea id="xdtx" rows="2" placeholder="${openD ? 'Write an update… type @ to tag someone' : 'First message… type @ to tag someone'}"></textarea>
      <div class="xdbar"><button class="btn sec sm" id="xdtag" title="Tag a user">@ Tag</button><span class="mut" style="font-size:12px">Enter to send · Shift+Enter for a new line</span><span class="sp"></span><button class="btn" id="xdsend"><i class="i i-chat"></i> ${openD ? 'Send' : 'Start discussion'}</button></div></div>`;
    const tx = $('#xdtx', m); m._tags = keep ? keep.tags : (m._tags || {});
    if (keep) { tx.value = keep.v; if (keep.f) { tx.focus(); tx.setSelectionRange(keep.s, keep.s); } }
    $('#xdb', m).scrollTop = $('#xdb', m).scrollHeight;
    $$('[data-pd]', m).forEach(x => x.ontoggle = () => pastOpen[x.dataset.pd] = x.open);
    $('#xdx', m).onclick = close;
    if ($('#xdend', m)) $('#xdend', m).onclick = async () => { const note = prompt('End this discussion?\n\nAll messages are kept in the History below and can be read any time.\n\nOutcome / summary (optional):', ''); if (note === null) return; await api('disc', 'end', { id: openD.id, note }); toast('Discussion ended · kept in History'); await load(); draw(); };
    // @mention picker
    const menu = $('#xdmenu', m); let sel = 0, opts = [];
    const hide = () => { menu.classList.add('hide'); opts = []; };
    const query = () => { const v = tx.value.slice(0, tx.selectionStart), i = v.lastIndexOf('@'); if (i < 0 || (i > 0 && !/\s/.test(v[i - 1]))) return null; const q = v.slice(i + 1); return /\n/.test(q) || q.length > 30 ? null : { i, q }; };
    const show = () => { const q = query(); if (!q) return hide();
      opts = data.users.filter(u => u.id != data.me && u.name.toLowerCase().includes(q.q.toLowerCase())).slice(0, 8); if (!opts.length) return hide(); sel = Math.min(sel, opts.length - 1);
      menu.innerHTML = opts.map((u, k) => `<button data-u="${u.id}" class="${k === sel ? 'on' : ''}"><span class="xdav">${u.avatar ? avImg(u.id, u.avatar, u.name) : esc(u.name.charAt(0).toUpperCase())}</span>${esc(u.name)} <small class="mut">${esc((S.role_names || {})[u.role] || u.role)}</small></button>`).join('');
      menu.classList.remove('hide'); $$('[data-u]', menu).forEach(b => b.onmousedown = e => { e.preventDefault(); pick(opts.find(u => u.id == b.dataset.u)); }); };
    const pick = u => { const q = query(); const pos = q ? q.i : tx.selectionStart; const before = tx.value.slice(0, pos), after = tx.value.slice(q ? tx.selectionStart : pos);
      tx.value = before + '@' + u.name + ' ' + after; const p = (before + '@' + u.name + ' ').length; tx.focus(); tx.setSelectionRange(p, p); m._tags[u.id] = u.name; hide(); };
    tx.oninput = () => { sel = 0; show(); };
    tx.onkeydown = e => {
      if (!menu.classList.contains('hide') && opts.length) {
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % opts.length; show(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + opts.length) % opts.length; show(); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(opts[sel]); return; }
        if (e.key === 'Escape') { e.stopPropagation(); hide(); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    };
    tx.onblur = () => setTimeout(hide, 150);
    $('#xdtag', m).onclick = () => { const p = tx.selectionStart, v = tx.value, pre = p > 0 && !/\s/.test(v[p - 1]) ? ' @' : '@'; tx.value = v.slice(0, p) + pre + v.slice(p); tx.focus(); tx.setSelectionRange(p + pre.length, p + pre.length); sel = 0; show(); };
    const send = async () => {
      const body = tx.value.trim(); if (!body) return tx.focus();
      const mentions = Object.entries(m._tags).filter(([, n]) => body.includes('@' + n)).map(([id]) => +id);
      const b = $('#xdsend', m); b.disabled = true;
      try { await api('disc', 'post', { ...T, body, mentions, topic: $('#xdtopic', m) ? $('#xdtopic', m).value : '' }); tx.value = ''; m._tags = {};
        if (mentions.length) toast(`Sent · ${mentions.length} tagged user${mentions.length === 1 ? '' : 's'} notified`);
        await load(); draw(); $('#xdtx', m).focus(); } finally { if (document.body.contains(b)) b.disabled = false; } };
    $('#xdsend', m).onclick = send;
  };
  try { await load(); } catch (e) { m.remove(); return; }
  draw(); $('#xdtx', m).focus();
  clearInterval(DISC.timer);
  DISC.timer = setInterval(async () => { if (!document.body.contains(m)) return clearInterval(DISC.timer); if (document.hidden) return;
    const before = JSON.stringify(data.discussions.map(d => [d.id, d.status, d.msgs.length]));
    try { await load(); } catch (e) { return; }
    if (JSON.stringify(data.discussions.map(d => [d.id, d.status, d.msgs.length])) !== before) draw(); }, 6000);
}

// ---------- notifications (bell) ----------
async function refreshNotifs() {
  try { const r = await api('disc', 'notifs'); DISC.notifs = r.rows; DISC.count = r.count; } catch (e) { return; }
  const ids = DISC.notifs.map(n => n.id);
  if (DISC.seen) { const fresh = DISC.notifs.filter(n => !DISC.seen.includes(n.id));
    fresh.slice(0, 3).forEach(n => toast(n.kind === 'feas' ? n.text : n.kind === 'mention' ? `${n.from_name} tagged you · ${n.customer_name}` : n.text));
    if (fresh.length && typeof SOUND !== 'undefined' && SOUND) try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 990; g.gain.setValueAtTime(.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(.12, a.currentTime + .02); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + .4); o.start(); o.stop(a.currentTime + .4); } catch (e) { }
    fresh.filter(n => n.kind === 'feas').slice(0, 3).forEach(n => discDesk('Feasibility expiry', n.text, '#/fees/feasibility'));
    fresh.filter(n => n.kind === 'callback').slice(0, 3).forEach(n => discDesk('Call back · ' + (n.customer_name || 'lead'), n.text, () => leadModal(n.lead_id)));
    fresh.filter(n => n.kind !== 'feas' && n.kind !== 'callback').slice(0, 3).forEach(n => discDesk(n.kind === 'mention' ? `${n.from_name} tagged you · ${n.customer_name}` : n.kind === 'end' ? `Discussion ended · ${n.customer_name}` : `${n.from_name} · ${n.customer_name}`, n.text.replace(/^.*?:\s/, ''), n.lead_id ? { lead_id: n.lead_id } : { customer_id: n.customer_id })); }
  DISC.seen = ids;
  if (typeof drawBell === 'function') drawBell();
  const p = $('#bellp'); if (p && !p.classList.contains('hide') && typeof drawBellPanel === 'function') drawBellPanel();
}
function discBellHtml() {
  const N = DISC.notifs; if (!N.length) return '';
  const lbl = { mention: 'tagged you', reply: 'replied', end: 'ended the discussion' };
  return `<div class="bar" style="margin:0 0 4px"><b>Notifications (${DISC.count})</b><span class="sp"></span><button class="btn sec sm" id="dnall">Mark all read</button></div>
   ${N.slice(0, 8).map(n => n.kind === 'callback' ? `<div class="nl xdnot cbn" data-dn="${n.id}" data-lead="${n.lead_id}"><div class="xdav cbav"><i class="i i-phone"></i></div><div class="nlm"><b>Call back</b> <span class="mut">· ${agoStr(n.created)}</span><br><span style="font-size:13px">${esc(n.text)}</span></div></div>` : n.kind === 'feas' ? `<div class="nl xdnot feasn" data-dn="${n.id}" data-go="#/fees/feasibility"><div class="xdav warn">!</div><div class="nlm"><b>Feasibility</b> <span class="mut">· ${agoStr(n.created)}</span><br><span style="font-size:13px">${esc(n.text)}</span></div></div>` : `<div class="nl xdnot" data-dn="${n.id}" data-dt='${JSON.stringify(n.lead_id ? { lead_id: n.lead_id } : { customer_id: n.customer_id })}'><div class="xdav">${n.from_av ? avImg(n.from_id, n.from_av, n.from_name) : esc((n.from_name || '?').charAt(0).toUpperCase())}</div><div class="nlm"><b>${esc(n.from_name || '')}</b> ${lbl[n.kind] || ''} <span class="mut">· ${agoStr(n.created)}</span><br><span style="font-size:13px"><b>${n.lead_id ? '<span class="pill b">Lead</span> ' : ''}${esc(n.customer_name || '')}</b> — ${esc(n.text.replace(/^.*?:\s/, ''))}</span></div></div>`).join('')}<div class="bsep"></div>`;
}
function discBellBind(root) {
  if ($('#dnall', root)) $('#dnall', root).onclick = async e => { e.stopPropagation(); await api('disc', 'seen', { all: 1 }); refreshNotifs(); };
  $$('[data-dn]', root).forEach(x => x.onclick = async () => { const p = $('#bellp'); if (p) p.classList.add('hide'); api('disc', 'seen', { id: +x.dataset.dn }); if (x.dataset.lead) { leadModal(+x.dataset.lead); refreshNotifs(); } else if (x.dataset.go) { location.hash = x.dataset.go; refreshNotifs(); } else discOpen(JSON.parse(x.dataset.dt)); });
}
function startDisc() {
  if (!canR('customers') && !canR('leads')) return;
  if (typeof mountBell === 'function') mountBell();
  discSummary(); refreshNotifs();
  // every 20 s while the tab is in view, 30 s in a background tab (the old setInterval picked one delay at start-up and kept it);
  // one timer only, even when boot() runs again after a sign-in
  clearTimeout(DISC.poll);
  const next = () => { DISC.poll = setTimeout(() => { refreshNotifs(); discSummary(); next(); }, document.hidden ? 30000 : 20000); };
  next();
}
