// WhatsApp: built-in inbox (WhatsApp Business Cloud API) + WhatsApp Web docked window + message log.
let WA = { tab: null, chat: null, f: '', q: '', on: null, info: true, timer: null, sig: '' };
const isMobile = () => matchMedia('(max-width:820px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
// open a chat in WhatsApp Web, reusing one docked window on the right of the screen (mobile: WhatsApp app)
function waLaunch(phone, text) {
  const n = waNum(phone), t = text ? encodeURIComponent(text) : '';
  if (isMobile()) { window.open(`https://wa.me/${n}${t ? '?text=' + t : ''}`, '_blank'); return; }
  const w = Math.min(620, Math.round(screen.availWidth * 0.42)), h = screen.availHeight;
  const url = n ? `https://web.whatsapp.com/send?phone=${n}${t ? '&text=' + t : ''}` : t ? `https://wa.me/?text=${t}` : 'https://web.whatsapp.com/';
  const win = window.open(url, 'jasperwa', `width=${w},height=${h},left=${screen.availWidth - w},top=0`);
  if (!win) toast('Allow pop-ups for this site to open WhatsApp Web', true); else win.focus();
}
const waTime = s => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('T') || String(s).endsWith('Z') ? '' : 'Z')); const td = new Date(); return d.toDateString() === td.toDateString() ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); };
const initials = n => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '#';
const ticks = m => m.dir !== 'out' ? '' : m.status === 'failed' ? `<span class="tk fail" title="${esc(m.error || 'Failed')}">!</span>` : `<span class="tk ${m.status === 'read' ? 'rd' : ''}" title="${esc(m.status)}">${m.status === 'sent' ? '✓' : '✓✓'}</span>`;
const prettyNum = w => w && w.length === 12 && w.startsWith('91') ? '+91 ' + w.slice(2, 7) + ' ' + w.slice(7) : '+' + (w || '');

async function pgWa() {
  clearInterval(WA.timer);
  const st = await api('wa', 'status'); WA.on = st.connected; if (!WA.tab) WA.tab = st.connected ? 'inbox' : 'web';
  $('#main').innerHTML = `<div class="bar" style="align-items:flex-start;margin-bottom:8px"><div><h2 style="margin:0;font-size:26px">WhatsApp</h2><div class="mut">${st.connected ? 'Business inbox connected' + (st.display ? ' · ' + esc(st.display) : '') : 'Business inbox not connected — WhatsApp Web works now'}</div></div><span class="sp"></span>
   <div class="tabs" style="margin:0">${[['inbox', 'Inbox'], ['web', 'WhatsApp Web'], ['log', 'Message log']].map(([k, l]) => `<button data-wt="${k}" class="${WA.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
   ${ME.role === 'admin' && st.connected ? '<button class="btn sec" id="wcfg" title="Connection settings, webhook URL and verify token"><i class="i i-gear"></i> Connection</button>' : ''}<button class="btn ok" id="wweb"><i class="i i-chat"></i> Open WhatsApp Web</button></div><div id="wab"></div>`;
  $$('[data-wt]').forEach(b => b.onclick = () => { WA.tab = b.dataset.wt; pgWa(); });
  $('#wweb').onclick = () => waLaunch('', '');
  if ($('#wcfg')) $('#wcfg').onclick = () => { clearInterval(WA.timer); $$('[data-wt]').forEach(x => x.classList.remove('on')); waSetup(); };
  if (WA.tab === 'inbox') return st.connected ? waInbox() : waSetup();
  if (WA.tab === 'web') return waWebTab();
  return waLogTab();
}

// ---------- not connected: setup (admin) ----------
async function waSetup() {
  const box = $('#wab');
  if (ME.role !== 'admin') { box.innerHTML = '<div class="card"><h3>Business inbox not connected</h3><p class="mut">Ask the admin to connect the WhatsApp Business number. Until then, use the <b>WhatsApp Web</b> tab.</p></div>'; return; }
  const c = await api('wa', 'config'); const hook = location.origin + location.pathname.replace(/[^/]*$/, '') + 'api.php?m=wa&a=hook';
  box.innerHTML = `<div class="grid cols2"><div class="card"><h3>Connect the WhatsApp Business inbox</h3>
    <ol class="steps"><li>In <a href="https://developers.facebook.com/apps/" target="_blank">Meta for Developers</a> open your app (<b>solarize</b>) → <b>Add product → WhatsApp</b>, and pick the Jasper Solar business.</li>
     <li>Under <b>WhatsApp → API Setup</b>, add your business phone number and verify it by SMS. <span class="mut">That number then works through the CRM, not the normal WhatsApp app.</span></li>
     <li>Copy the <b>Phone number ID</b> and <b>WhatsApp Business Account ID</b> below.</li>
     <li>In Business Settings → System users → <b>Jasper CRM</b> → Generate token for the app with <code>whatsapp_business_messaging</code> and <code>whatsapp_business_management</code>, expiry <b>Never</b>. Paste it below.</li>
     <li>App settings → Basic → copy the <b>App secret</b> below (secures incoming messages).</li>
     <li>WhatsApp → Configuration → Webhook: paste the <b>Callback URL</b> and <b>Verify token</b> shown here, then subscribe to <b>messages</b>.</li></ol></div>
   <div class="card"><h3>Connection</h3><div class="two">
     <div><label>Phone number ID</label><input id="wpid" value="${esc(c.phone_id)}"></div><div><label>WhatsApp Business Account ID</label><input id="wwab" value="${esc(c.waba_id)}"></div>
     <div class="full"><label>Access token ${c.token_set ? '<span class="pill g">saved ' + esc(c.token_hint) + '</span>' : ''}</label><input id="wtok" type="password" autocomplete="off" placeholder="${c.token_set ? 'Leave blank to keep' : 'Paste permanent token'}"></div>
     <div class="full"><label>App secret ${c.secret_set ? '<span class="pill g">saved</span>' : ''}</label><input id="wsec" type="password" autocomplete="off" placeholder="${c.secret_set ? 'Leave blank to keep' : 'Paste app secret'}"></div>
     <div class="full"><label>Webhook callback URL</label><input readonly value="${esc(hook)}" onclick="this.select()"></div>
     <div class="full"><label>Webhook verify token</label><input readonly value="${esc(c.verify_token)}" onclick="this.select()"></div></div>
     <div class="whk">${(() => { const h = c.hook || {}, t = x => x ? new Date(x.replace(' ', 'T') + 'Z').toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
       return '<b>Webhook status</b><br>' + (h.verified_at ? '✓ Verified by Meta ' + t(h.verified_at) : '✗ Not verified by Meta yet — do “Verify and save” in Meta') + '<br>'
         + (h.count ? (h.last_ok ? '✓' : '✗') + ' Last delivery ' + t(h.last_at) + ' (' + h.last_kind + ')' + (h.last_ok ? '' : ' — <span class="over">signature check failed: the App secret below does not match your app</span>') : '✗ No deliveries from Meta yet') + '<br>'
         + (h.last_msg_at ? '✓ Last incoming message ' + t(h.last_msg_at) : '— No incoming message received yet'); })()}</div>
     <div class="bar" style="margin-top:12px"><button class="btn" id="wsv">Save</button><button class="btn sec" id="wts">Test connection</button></div><div id="wres" class="mut" style="font-size:13px"></div>
     <h3 style="margin-top:20px">Register the number</h3><p class="mut" style="font-size:13px;margin:0 0 8px">If sending fails with <b>“Account not registered (#133010)”</b>, the business number must be activated once for the Cloud API. Choose a 6-digit PIN (it becomes the number's two-step verification PIN — write it down) and click Register.</p>
     <div class="bar" style="margin:0"><input id="wpin" inputmode="numeric" maxlength="6" placeholder="6-digit PIN" style="max-width:160px"><button class="btn sec" id="wreg">Register number</button></div><div id="wrr" class="mut" style="font-size:13px;margin-top:6px"></div></div></div>`;
  const save = () => api('wa', 'save', { phone_id: $('#wpid').value, waba_id: $('#wwab').value, token: $('#wtok').value, app_secret: $('#wsec').value });
  $('#wsv').onclick = async () => { await save(); toast('Saved'); waSetup(); };
  $('#wreg').onclick = async () => { const pin = $('#wpin').value.replace(/\D/g, ''); if (pin.length !== 6) return toast('Enter a 6-digit PIN', true); $('#wrr').textContent = 'Registering…'; const r = await api('wa', 'register', { pin }); $('#wrr').innerHTML = r.ok ? '<span style="color:var(--ok)">Number registered — you can send messages now.</span>' : '<span class="over">' + esc(r.error) + '</span>'; };
  $('#wts').onclick = async () => { await save(); $('#wres').textContent = 'Testing…'; const r = await api('wa', 'test', {}); $('#wres').innerHTML = r.ok ? `<span style="color:var(--ok)">Connected: ${esc(r.name)} · ${esc(r.number)} (quality ${esc(r.quality || '—')})</span><br>` + (r.subscribed === 'ok' ? '<span style="color:var(--ok)">WhatsApp account subscribed to the app — incoming messages enabled.</span>' : `<span class="over">Could not subscribe the WhatsApp account to the app: ${esc(r.subscribed)}</span>`) : `<span class="over">${esc(r.error)}</span>`; };
}

// ---------- inbox ----------
async function waInbox() {
  const box = $('#wab');
  box.innerHTML = `<div class="wai ${WA.info ? '' : 'noinfo'}" id="wai"><div class="wl"><div class="wlh"><input id="wq" placeholder="Search chats…" value="${esc(WA.q)}"><button class="btn sm" id="wnew" title="New chat"><i class="i i-plus"></i></button></div>
     <div class="wlf">${[['', 'All'], ['unread', 'Unread'], ['mine', 'Mine'], ['unassigned', 'Unassigned']].map(([k, l]) => `<button data-wf="${k}" class="${WA.f === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="wll" id="wll"></div></div>
    <div class="wt" id="wt"><div class="wempty"><i class="i i-chat"></i><p>Select a chat</p></div></div><div class="wi" id="wi"></div></div>`;
  const fit = () => { const el = $('#wai'); if (el) el.style.height = Math.max(420, innerHeight - el.getBoundingClientRect().top - 18) + 'px'; }; fit(); addEventListener('resize', fit);
  $('#wq').oninput = e => { WA.q = e.target.value; clearTimeout(WA.qt); WA.qt = setTimeout(loadChats, 250); };
  $$('[data-wf]').forEach(b => b.onclick = () => { WA.f = b.dataset.wf; $$('[data-wf]').forEach(x => x.classList.toggle('on', x === b)); loadChats(); });
  $('#wnew').onclick = newChatModal;
  await loadChats(); if (WA.chat) openChat(WA.chat);
  WA.timer = setInterval(() => { if (!location.hash.startsWith('#/whatsapp') || WA.tab !== 'inbox') return clearInterval(WA.timer); if (document.hidden) return; loadChats(true); if (WA.chat) openChat(WA.chat, true); }, 5000);
}
async function loadChats(quiet) {
  let cs; try { cs = await api('wa', 'chats', undefined, `&f=${WA.f}&q=${encodeURIComponent(WA.q)}`); } catch (e) { return; }
  const el = $('#wll'); if (!el) return;
  const lsig = JSON.stringify(cs); if (quiet && lsig === WA.lsig && el.childElementCount) return; WA.lsig = lsig; // 5-second poll: rebuild the list only when something changed
  el.innerHTML = cs.map(c => `<div class="wc ${c.id == WA.chat ? 'on' : ''}" data-c="${c.id}"><div class="wav">${esc(initials(c.name || c.wa_id))}</div><div class="wcm"><div class="wct"><b>${esc(c.name || prettyNum(c.wa_id))}</b><small>${waTime(c.last_at)}</small></div>
     <div class="wct"><span class="wcp">${esc(c.last_msg || '')}</span>${c.unread ? `<span class="ub">${c.unread}</span>` : ''}</div>
     <div class="wctag">${c.customer_name ? '<span class="pill g">Customer</span>' : c.lead_name ? '<span class="pill b">Lead</span>' : ''}${c.assigned_name ? `<span class="pill">${esc(c.assigned_name)}</span>` : '<span class="pill y">Unassigned</span>'}</div></div></div>`).join('') || `<p class="mut" style="padding:14px">${WA.q || WA.f ? 'No chats match.' : 'No conversations yet. Incoming WhatsApp messages appear here.'}</p>`;
  $$('.wc', el).forEach(r => r.onclick = () => openChat(+r.dataset.c));
}
async function openChat(id, poll) {
  let d; try { d = await api('wa', 'thread', undefined, '&id=' + id); } catch (e) { if (!poll) { WA.chat = null; } return; }
  const sig = id + ':' + d.messages.length + ':' + d.messages.map(m => m.status).join(''); if (poll && sig === WA.sig) return; WA.sig = sig;
  const first = WA.chat !== id; WA.chat = id; $$('.wc').forEach(r => r.classList.toggle('on', +r.dataset.c === id));
  const c = d.chat, t = $('#wt'), keep = first ? '' : ($('#wtx')?.value || ''), scrolledUp = !first && $('#wms') && ($('#wms').scrollHeight - $('#wms').scrollTop - $('#wms').clientHeight > 60);
  const left = c.window_ends ? Math.max(0, Math.round((new Date(c.window_ends) - Date.now()) / 36e5)) : 0;
  let lastDay = '';
  const msgs = d.messages.map(m => { const day = new Date(String(m.created).replace(' ', 'T') + 'Z').toDateString(); const sep = day !== lastDay ? `<div class="wday"><span>${day === new Date().toDateString() ? 'Today' : new Date(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>` : ''; lastDay = day;
    const media = m.has_media ? (m.type === 'image' || m.type === 'sticker' ? `<a href="api.php?m=wa&a=media&id=${m.id}" target="_blank"><img class="wimg" loading="lazy" src="api.php?m=wa&a=media&id=${m.id}" alt=""></a>` : m.type === 'audio' ? `<audio controls preload="none" src="api.php?m=wa&a=media&id=${m.id}"></audio>` : `<a class="wdoc" href="api.php?m=wa&a=media&id=${m.id}" target="_blank"><i class="i i-file"></i> ${esc(m.filename || m.type)}</a>`) : '';
    return sep + `<div class="wm ${m.dir} ${m.type === 'template' ? 'tpl' : ''}">${m.type === 'template' ? '<small class="wtl">Template</small>' : ''}${media}${m.body ? `<div class="wbody">${esc(m.body).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>')}</div>` : ''}<div class="wmeta">${m.dir === 'out' && m.user ? esc(m.user) + ' · ' : ''}${waTime(m.created)} ${ticks(m)}</div>${m.status === 'failed' ? `<div class="werr">${esc(m.error)}</div>` : ''}</div>`; }).join('');
  t.innerHTML = `<div class="wth"><div class="wav">${esc(initials(c.name || c.wa_id))}</div><div style="min-width:0;flex:1"><b>${esc(c.name || prettyNum(c.wa_id))}</b><small class="mut">${prettyNum(c.wa_id)}${c.assigned_name ? ' · ' + esc(c.assigned_name) : ''}</small></div>
     ${c.window_open ? `<span class="pill g" title="Free-form replies allowed until the window closes">Reply window · ${left}h left</span>` : '<span class="pill r" title="Send an approved template to reopen the conversation">Template required</span>'}
     <button class="ib" id="winf" title="Contact info"><i class="i i-user"></i></button></div>
   <div class="wms" id="wms">${msgs || '<p class="mut" style="text-align:center">No messages yet.</p>'}</div>
   <div class="wcomp ${c.window_open ? '' : 'closed'}"><div class="wtools"><button class="ib" id="wqr" title="Quick replies"><i class="i i-note"></i></button><button class="ib" id="wtp" title="Send approved template"><i class="i i-receipt"></i></button>
     <button class="ib" id="wds" title="Send a datasheet from Folder"><i class="i i-file"></i></button><button class="ib" id="wat" title="Attach photo / PDF"><i class="i i-clip"></i></button><input type="file" id="wfile" class="hide" accept="image/jpeg,image/png,application/pdf,.doc,.docx,.xls,.xlsx,video/mp4"></div>
     <textarea id="wtx" rows="1" placeholder="${c.window_open ? 'Type a message — Enter to send, Shift+Enter for a new line' : 'The 24-hour window is closed — send a template to restart the chat'}" ${c.window_open ? '' : 'disabled'}></textarea><button class="btn ok" id="wsend" ${c.window_open ? '' : 'disabled'} title="Send"><i class="i i-chat"></i></button></div>`;
  const ms = $('#wms'); if (!scrolledUp) ms.scrollTop = ms.scrollHeight;
  const tx = $('#wtx'); tx.value = keep; try { if (first && sessionStorage.waDraft) { tx.value = c.window_open ? sessionStorage.waDraft : ''; if (!c.window_open) toast('New chat: start with an approved template', true); sessionStorage.removeItem('waDraft'); } } catch (e) { } const grow = () => { tx.style.height = 'auto'; tx.style.height = Math.min(140, tx.scrollHeight) + 'px'; }; tx.oninput = grow; grow();
  const send = async () => { const v = tx.value.trim(); if (!v) return; $('#wsend').disabled = true; try { await api('wa', 'send', { chat_id: id, text: v }); tx.value = ''; WA.sig = ''; await openChat(id); loadChats(true); } finally { const b = $('#wsend'); if (b) b.disabled = !c.window_open; } };
  $('#wsend').onclick = send; tx.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  if (first) tx.focus();
  $('#winf').onclick = () => { WA.info = !WA.info; $('#wai').classList.toggle('noinfo', !WA.info); };
  $('#wat').onclick = () => $('#wfile').click();
  $('#wfile').onchange = async e => { const f = e.target.files[0]; if (!f) return; const cap = prompt('Caption (optional):', '') ?? ''; const fd = new FormData(); fd.append('chat_id', id); fd.append('file', f); fd.append('caption', cap); toast('Sending ' + f.name + '…'); await api('wa', 'send_media', fd); WA.sig = ''; openChat(id); };
  $('#wqr').onclick = e => quickReplies(e.currentTarget, c, tx);
  $('#wtp').onclick = () => templateModal(c);
  $('#wds').onclick = () => datasheetPicker(c);
  if (!poll || first) waInfo(c);
}
function waInfo(c) {
  const el = $('#wi'); if (!el) return; const adm = ME.role === 'admin';
  el.innerHTML = `<div class="wih"><div class="wav wbig">${esc(initials(c.name || c.wa_id))}</div><b>${esc(c.name || prettyNum(c.wa_id))}</b><small class="mut">${prettyNum(c.wa_id)}</small></div>
   <label>Display name</label><div class="bar" style="margin:0"><input id="wnm" value="${esc(c.name)}"><button class="btn sm sec" id="wnms">Save</button></div>
   <label>Linked lead</label>${c.lead ? `<div class="act"><a href="#" id="wol"><b>${esc(c.lead.name)}</b></a> ${pill(c.lead.status, stageCls(c.lead.status))}<br><small>${esc(c.lead.source || '')}${c.lead.city ? ' · ' + esc(c.lead.city) : ''}</small></div>` : '<p class="mut" style="margin:4px 0">None</p>'}
   <label>Linked customer</label>${c.customer ? `<div class="act"><a href="#/customers/${c.customer.id}"><b>${esc(c.customer.name)}</b></a><br><small>${esc(c.customer.district || '')}</small></div>` : `<p class="mut" style="margin:4px 0">None${canW('customers') && c.lead ? ' — <a href="#" id="wcv">convert lead to customer</a>' : ''}</p>`}
   <label>Assigned to</label>${adm ? `<select id="was"><option value="0">Unassigned</option>${(WA.users || []).filter(u => u.role !== 'ba').map(u => `<option value="${u.id}" ${c.assigned_to == u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>` : `<p style="margin:4px 0">${c.assigned_name ? esc(c.assigned_name) : 'Unassigned'} ${c.assigned_to == ME.id ? '<a href="#" id="wrel">(release)</a>' : (!c.assigned_to ? '<a href="#" id="wtake">(take this chat)</a>' : '')}</p>`}
   <div class="bar" style="margin-top:14px"><button class="btn sec sm" id="wopenweb"><i class="i i-chat"></i> Open in WhatsApp Web</button><a class="btn sec sm" href="tel:+${esc(c.wa_id)}"><i class="i i-phone"></i> Call</a>${adm ? '<button class="btn bad sm" id="wdel">Delete chat</button>' : ''}</div>`;
  if (adm && !WA.users) api('calendar', 'list', undefined, '&from=2000-01-01&to=2000-01-01').then(r => { WA.users = r.users; waInfo(c); }).catch(() => { });
  $('#wnms').onclick = async () => { await api('wa', 'link', { chat_id: c.id, name: $('#wnm').value }); toast('Saved'); WA.sig = ''; openChat(c.id); loadChats(true); };
  if ($('#wol')) $('#wol').onclick = e => { e.preventDefault(); leadModal(c.lead.id); };
  if ($('#wcv')) $('#wcv').onclick = e => { e.preventDefault(); convertBox(c.lead, async r => { await api('wa', 'link', { chat_id: c.id, customer_id: r.customer_id }); WA.sig = ''; openChat(c.id); }); };
  if ($('#was')) $('#was').onchange = async e => { await api('wa', 'assign', { chat_id: c.id, user_id: +e.target.value }); toast('Chat assigned'); WA.sig = ''; openChat(c.id); loadChats(true); };
  if ($('#wtake')) $('#wtake').onclick = async e => { e.preventDefault(); await api('wa', 'assign', { chat_id: c.id, user_id: ME.id }); WA.sig = ''; openChat(c.id); loadChats(true); };
  if ($('#wrel')) $('#wrel').onclick = async e => { e.preventDefault(); await api('wa', 'assign', { chat_id: c.id, user_id: 0 }); WA.sig = ''; openChat(c.id); loadChats(true); };
  $('#wopenweb').onclick = () => waLaunch(c.wa_id, '');
  if ($('#wdel')) $('#wdel').onclick = async () => { if (!confirm('Delete this chat and its messages from the CRM? (Nothing is deleted on WhatsApp.)')) return; await api('wa', 'delete_chat', { chat_id: c.id }); WA.chat = null; toast('Chat deleted'); pgWa(); };
}
function fillTpl(text, c) { return text.replace(/\{name\}/g, (c.name || '').split(' ')[0]).replace(/\{company\}/g, S.company.name).replace(/\{amount\}/g, '').replace(/\{quote_no\}/g, '').replace(/\{date\}/g, ''); }
function quickReplies(btn, c, tx) {
  const T = S.wa_templates || [];
  popMenu(btn, T.map((t, i) => [String(i), 'note', t.name]), i => { tx.value = fillTpl(T[+i].text, c); tx.focus(); tx.dispatchEvent(new Event('input')); });
}
async function templateModal(c) {
  let ts = []; try { ts = await api('wa', 'templates'); } catch (e) { return; }
  if (!ts.length) return toast('No approved templates yet — create them in WhatsApp Manager', true);
  const m = modal(`<h2 style="margin-top:0">Send a template</h2><p class="mut" style="margin-top:-6px">Approved templates can be sent any time, even when the 24-hour window is closed.</p>
   <label>Template</label><select id="tpn">${ts.map((t, i) => `<option value="${i}">${esc(t.name)} · ${esc(t.lang)} · ${esc(t.category)}</option>`).join('')}</select><div id="tpp"></div>
   <label>Preview</label><div class="tprev" id="tpv"></div>
   <div class="bar" style="margin-top:12px"><button class="btn ok" id="tps">Send template</button><button class="btn sec" id="tpc">Cancel</button></div>`);
  const draw = () => { const t = ts[$('#tpn', m).value]; $('#tpp', m).innerHTML = Array.from({ length: t.params }, (_, i) => `<label>Value for {{${i + 1}}}</label><input data-p="${i}" value="${i === 0 ? esc((c.name || '').split(' ')[0]) : ''}">`).join(''); $$('[data-p]', m).forEach(x => x.oninput = prev); prev(); };
  const prev = () => { const t = ts[$('#tpn', m).value]; let b = t.body; $$('[data-p]', m).forEach(x => b = b.split(`{{${+x.dataset.p + 1}}}`).join(x.value || `{{${+x.dataset.p + 1}}}`)); $('#tpv', m).textContent = b; };
  $('#tpn', m).onchange = draw; draw();
  $('#tpc', m).onclick = () => m.remove();
  $('#tps', m).onclick = async () => { const t = ts[$('#tpn', m).value]; const params = $$('[data-p]', m).map(x => x.value); if (params.some(p => !p.trim())) return toast('Fill every value', true);
    await api('wa', 'send_template', { chat_id: c.id, name: t.name, lang: t.lang, params, preview: $('#tpv', m).textContent }); m.remove(); toast('Template sent'); WA.sig = ''; openChat(c.id); loadChats(true); };
}
async function datasheetPicker(c) {
  const d = await api('folder', 'list');
  const m = modal(`<h2 style="margin-top:0">Send a datasheet</h2><input id="dsq2" placeholder="Search…"><div class="dsp" id="dsl">${d.items.map(x => `<button class="dspi" data-d="${x.id}"><i class="i i-file"></i><span><b>${esc(x.title)}</b><small>${esc(fmPathText(d.folders, x.folder_id))}</small></span></button>`).join('') || '<p class="mut">No datasheets in Folder yet.</p>'}</div>
   <div class="bar" style="margin-top:10px"><button class="btn sec" id="dsx">Close</button></div>`);
  $('#dsq2', m).oninput = e => { const t = e.target.value.toLowerCase(); $$('.dspi', m).forEach(b => b.style.display = b.innerText.toLowerCase().includes(t) ? '' : 'none'); };
  $('#dsx', m).onclick = () => m.remove();
  $$('.dspi', m).forEach(b => b.onclick = async () => { b.disabled = true; toast('Sending datasheet…'); try { await api('wa', 'send_datasheet', { chat_id: c.id, datasheet_id: +b.dataset.d }); m.remove(); toast('Datasheet sent'); WA.sig = ''; openChat(c.id); } catch (e) { b.disabled = false; } });
}
async function newChatModal() {
  const [cs, ls] = await Promise.all([canR('customers') ? api('customers', 'list') : [], canR('leads') ? api('leads', 'list') : []]);
  const people = cs.filter(x => x.phone).map(x => ({ n: x.name, p: x.phone, k: 'customer_id', id: x.id })).concat(ls.filter(l => l.phone && l.can_edit && !l.customer_id).map(l => ({ n: l.name, p: l.phone, k: 'lead_id', id: l.id })));
  const m = modal(`<h2 style="margin-top:0">New chat</h2><label>Customer or lead</label><input id="ncq" list="ncl" placeholder="Search name…" autocomplete="off"><datalist id="ncl">${people.map(p => `<option value="${esc(p.n)} · ${esc(p.p)}"></option>`).join('')}</datalist>
   <label>…or phone number</label><input id="ncp" type="tel" placeholder="10-digit mobile, e.g. 9400044297 (or +country code)"><label>Name</label><input id="ncn">
   <p class="mut" style="font-size:13px">New conversations must start with an approved template (WhatsApp rule).</p>
   <div class="bar"><button class="btn" id="ncg">Open chat</button><button class="btn sec" id="ncx">Cancel</button></div>`);
  let pick = null; $('#ncq', m).oninput = e => { pick = people.find(p => `${p.n} · ${p.p}` === e.target.value) || null; if (pick) { $('#ncp', m).value = pick.p; $('#ncn', m).value = pick.n; } };
  $('#ncx', m).onclick = () => m.remove();
  $('#ncg', m).onclick = async () => { const r = await api('wa', 'start', { phone: $('#ncp', m).value, name: $('#ncn', m).value, ...(pick ? { [pick.k]: pick.id } : {}) }); m.remove(); WA.chat = r.id; WA.f = ''; await loadChats(); openChat(r.id); };
}

// ---------- WhatsApp Web tab (no setup) ----------
async function waWebTab() {
  const [cs, ls] = await Promise.all([canR('customers') ? api('customers', 'list') : [], canR('leads') ? api('leads', 'list') : []]);
  const people = cs.filter(c => c.phone).map(c => ({ ...c, kind: 'Customer' })).concat(ls.filter(l => l.phone && l.can_edit && !l.customer_id).map(l => ({ ...l, kind: 'Lead' })));
  let q = '';
  $('#wab').innerHTML = `<div class="grid cols2" style="align-items:start"><div class="card"><div class="ch"><h3>WhatsApp Web</h3></div>
     <p style="margin:0 0 10px">WhatsApp Web opens in a window docked to the right of your screen. Keep the CRM on the left — every <b>Open chat</b> jumps straight to that person in the same window.</p>
     <ol class="steps"><li>Click <b>Open WhatsApp Web</b> and scan the QR code once with your phone (WhatsApp → Linked devices).</li><li>Allow pop-ups for this site if your browser asks.</li><li>Use <b>Open chat</b> below, or the WhatsApp buttons on leads, customers and Folder.</li></ol>
     <div class="bar" style="margin-top:8px"><button class="btn ok" id="wweb2"><i class="i i-chat"></i> Open WhatsApp Web</button></div></div>
    <div class="card"><div class="ch"><h3>Open a chat</h3><input id="wpq" placeholder="Search name or phone…" style="max-width:240px"></div><div id="wpl" class="wpl"></div>
     <div class="bar" style="margin-top:10px"><input id="wpn" type="tel" placeholder="Any number…" style="max-width:200px"><button class="btn sec sm" id="wpg">Open chat</button></div></div></div>`;
  const draw = () => { const t = q.toLowerCase(); $('#wpl').innerHTML = people.filter(p => !t || (p.name + ' ' + p.phone).toLowerCase().includes(t)).slice(0, 60).map(p => `<div class="act wpr"><div><b>${esc(p.name)}</b> <span class="pill ${p.kind === 'Lead' ? 'b' : 'g'}">${p.kind}</span><br><small>${esc(p.phone)}</small></div><span class="sp"></span><button class="btn sm ok" data-wp="${p.kind}|${p.id}"><i class="i i-chat"></i> Open chat</button></div>`).join('') || '<p class="mut">No contacts with a phone number.</p>';
    $$('[data-wp]').forEach(b => b.onclick = () => { const [k, id] = b.dataset.wp.split('|'), p = people.find(x => x.kind === k && x.id == id); waOpen({ name: p.name, phone: p.phone, [k === 'Lead' ? 'lead_id' : 'customer_id']: p.id }); }); };
  $('#wpq').oninput = e => { q = e.target.value; draw(); }; draw();
  $('#wweb2').onclick = () => waLaunch('', '');
  $('#wpg').onclick = () => { if (!waNum($('#wpn').value)) return toast('Enter a phone number', true); waLaunch($('#wpn').value, ''); };
}
async function waLogTab() {
  const rec = await api('whatsapp', 'recent');
  $('#wab').innerHTML = `<div class="card"><h3>Messages sent from the CRM (WhatsApp Web / click-to-chat)</h3>${rec.map(m => `<div class="act">${esc(m.text)}<br><small>→ ${esc(m.cname || m.lname || m.phone)} · ${esc(m.user)} · ${m.created}</small></div>`).join('') || '<p class="mut">No messages logged yet.</p>'}</div>`;
}

// unread badge on the sidebar (polls every 30 s while logged in, only when the inbox is connected)
let WAU = null;
async function waBadge() {
  const a = $('aside a[data-m="whatsapp"]'); if (!a || !canR('whatsapp')) return;
  try { const s = WA.on ?? (await api('wa', 'status')).connected; WA.on = s; if (!s) return; const r = await api('wa', 'unread'); let b = a.querySelector('.nb'); if (!b) { b = document.createElement('span'); b.className = 'nb'; a.appendChild(b); } b.textContent = r.unread || ''; b.style.display = r.unread ? '' : 'none'; } catch (e) { }
}
function startWa() { clearInterval(WAU); waBadge(); WAU = setInterval(() => { if (!document.hidden) waBadge(); }, 30000); }
