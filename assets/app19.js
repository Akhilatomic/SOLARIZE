// Email: the company mailbox (Hostinger, over IMAP/SMTP on the server). Folders · message list · reader · compose.
const EM = { f: 'INBOX', p: 1, q: '', unread: false, uid: null, folders: [], cfg: null, list: null, msg: null };
const emWhen = iso => { if (!iso) return ''; const d = new Date(iso), n = new Date();
  if (d.toDateString() === n.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', d.getFullYear() === n.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }); };
const emFull = iso => iso ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const emWho = a => a ? (a.name || a.email || '') : '';
const emAddr = a => a.name ? `${a.name} <${a.email}>` : a.email;
const emSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const emRole = () => (EM.folders.find(f => f.id === EM.f) || {}).role || (/sent/i.test(EM.f) ? 'sent' : '');
const emLinkify = t => esc(t).replace(/(https?:\/\/[^\s<>"']+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
const emPerson = (p, email) => { const x = p && p[email]; return x ? `<a class="emcp" href="#/${x.kind === 'customer' ? 'customers/' + x.id : 'leads'}" title="Open ${x.kind}"><i class="i i-user"></i>${esc(x.name)}</a>` : ''; };

async function pgEmail() {
  const main = $('#main');
  EM.cfg = await api('mail', 'config');
  if (!EM.cfg.ready) return emSetupView(main);
  main.innerHTML = `<div class="emw v-list" id="emw">
    <nav class="emf card"><button class="btn emnew" id="emnew"><i class="i i-pencil"></i> New email</button><div id="emfl"><p class="mut" style="padding:6px 10px">Loading folders…</p></div>
      <div class="emacct"><small class="mut">${esc(EM.cfg.email)}</small>${EM.cfg.admin ? '<button class="ib" id="emset" title="Mailbox settings"><i class="i i-gear"></i></button>' : ''}</div></nav>
    <section class="eml card"><div class="emlh"><select id="emfs" class="emfs" aria-label="Folder"></select><div class="emsr"><i class="i i-search"></i><input id="emq" type="search" placeholder="Search mail" value="${esc(EM.q)}"></div>
      <button class="ib ${EM.unread ? 'on' : ''}" id="emun" title="Show unread only"><i class="i i-eye"></i></button><button class="ib" id="emrf" title="Refresh"><i class="i i-refresh"></i></button><button class="btn sm emnew2" id="emnew2" title="New email"><i class="i i-pencil"></i></button></div>
      <div class="emls" id="emls"><p class="mut" style="padding:14px">Loading…</p></div><div class="emp" id="emp"></div></section>
    <section class="emr card" id="emr"><div class="emempty"><i class="i i-mail"></i><p>Select an email to read it</p></div></section></div>`;
  $('#emnew').onclick = $('#emnew2').onclick = () => composeMail({});
  if ($('#emset')) $('#emset').onclick = emSettings;
  $('#emrf').onclick = () => { emFolders(); emList(); };
  $('#emun').onclick = e => { EM.unread = !EM.unread; EM.p = 1; e.currentTarget.classList.toggle('on', EM.unread); emList(); };
  let tq; $('#emq').oninput = e => { clearTimeout(tq); tq = setTimeout(() => { EM.q = e.target.value.trim(); EM.p = 1; emList(); }, 450); };
  $('#emfs').onchange = e => emOpenFolder(e.target.value);
  emFolders(); emList();
}

function emSetupView(main) {
  if (!EM.cfg.admin) { main.innerHTML = `<div class="card emsetup"><div class="emempty"><i class="i i-mail"></i><h3>Email is not connected yet</h3><p>Ask an admin to connect the company mailbox.</p></div></div>`; return; }
  main.innerHTML = `<div class="card emsetup"><div class="pfch"><i class="i i-mail"></i><h3>Connect the company mailbox</h3></div>
    <p class="mut" style="margin:0 0 12px">Use the Hostinger email address and its password (the one you use at mail.hostinger.com). The password is stored encrypted on the server and is never shown again.</p>
    <div id="emsf"></div></div>`;
  emSettingsForm($('#emsf'), () => route());
}
function emSettingsForm(box, done) {
  const a = EM.cfg.admin || {}, c = EM.cfg;
  box.innerHTML = `<div class="two"><div><label>Email address</label><input id="ems_e" type="email" value="${esc(c.email || '')}" placeholder="info@jasper.solar" autocomplete="off"></div>
      <div><label>Password</label><input id="ems_p" type="password" autocomplete="new-password" placeholder="${a.has_pass ? 'Unchanged — type to replace' : 'Mailbox password'}"></div>
      <div><label>Sender name</label><input id="ems_n" value="${esc(c.name || '')}" placeholder="Jasper Solar Solutions"></div><div></div>
      <div><label>Incoming (IMAP) server</label><input id="ems_ih" value="${esc(a.imap_host || 'imap.hostinger.com')}"></div><div><label>IMAP port (SSL)</label><input id="ems_ip" inputmode="numeric" value="${a.imap_port || 993}"></div>
      <div><label>Outgoing (SMTP) server</label><input id="ems_sh" value="${esc(a.smtp_host || 'smtp.hostinger.com')}"></div><div><label>SMTP port (SSL)</label><input id="ems_sp" inputmode="numeric" value="${a.smtp_port || 465}"></div>
      <div class="full"><label>Signature</label><textarea id="ems_s" rows="4" placeholder="Regards,&#10;Jasper Solar Solutions&#10;Phone…">${esc(c.signature || '')}</textarea></div></div>
    <div class="bar" style="margin-top:12px"><button class="btn" id="ems_go">Save & connect</button>${c.ready ? '<span class="sp"></span><button class="btn sec" id="ems_rm">Disconnect mailbox</button>' : ''}</div>
    <p class="mut" style="font-size:12px;margin:8px 0 0">The server settings are already filled in for Hostinger. Saving signs in to the mailbox to check the details.</p>`;
  $('#ems_go', box).onclick = async e => { const b = e.currentTarget; b.disabled = true; b.textContent = 'Connecting…';
    try { await api('mail', 'setup', { email: $('#ems_e', box).value, password: $('#ems_p', box).value, name: $('#ems_n', box).value, imap_host: $('#ems_ih', box).value, imap_port: +$('#ems_ip', box).value, smtp_host: $('#ems_sh', box).value, smtp_port: +$('#ems_sp', box).value, signature: $('#ems_s', box).value });
      toast('Mailbox connected'); $('#ems_p', box).value = ''; done(); } catch (x) { b.disabled = false; b.textContent = 'Save & connect'; } };
  if ($('#ems_rm', box)) $('#ems_rm', box).onclick = async () => { if (!confirm('Disconnect the mailbox? The CRM forgets the password; your emails stay on Hostinger.')) return; await api('mail', 'remove', {}); toast('Mailbox disconnected'); done(); };
}
function emSettings() { const m = modal(`<div class="mh"><h3>Mailbox settings</h3><button class="ib" data-x title="Close"><i class="i i-x"></i></button></div><div id="emsf2"></div>`, true);
  $('[data-x]', m).onclick = () => m.remove(); emSettingsForm($('#emsf2', m), () => { m.remove(); route(); }); }

async function emFolders() {
  try { EM.folders = await api('mail', 'folders'); } catch (e) { $('#emfl') && ($('#emfl').innerHTML = '<p class="mut" style="padding:6px 10px">Could not load folders.</p>'); return; }
  const ic = { inbox: 'mail', sent: 'upload', drafts: 'note', junk: 'alert', trash: 'trash', archive: 'folder', '': 'folder' };
  if ($('#emfl')) $('#emfl').innerHTML = EM.folders.map(f => `<button class="emfi ${f.id === EM.f ? 'on' : ''}" data-f="${esc(f.id)}"><i class="i i-${ic[f.role] || 'folder'}"></i><span>${esc(f.name)}</span>${f.unseen ? `<b>${f.unseen}</b>` : ''}</button>`).join('');
  if ($('#emfs')) $('#emfs').innerHTML = EM.folders.map(f => `<option value="${esc(f.id)}" ${f.id === EM.f ? 'selected' : ''}>${esc(f.name)}${f.unseen ? ` (${f.unseen})` : ''}</option>`).join('');
  $$('.emfi').forEach(b => b.onclick = () => emOpenFolder(b.dataset.f));
  const ib = EM.folders.find(f => f.role === 'inbox'); if (ib) mailBadgeSet(ib.unseen);
}
function emOpenFolder(f) { EM.f = f; EM.p = 1; EM.uid = null; $$('.emfi').forEach(b => b.classList.toggle('on', b.dataset.f === f)); if ($('#emfs')) $('#emfs').value = f; emReaderEmpty(); emList(); }
function emReaderEmpty() { const r = $('#emr'); if (r) r.innerHTML = '<div class="emempty"><i class="i i-mail"></i><p>Select an email to read it</p></div>'; $('#emw')?.classList.replace('v-read', 'v-list'); }

async function emList() {
  const box = $('#emls'); if (!box) return; const key = EM.f + '|' + EM.p + '|' + EM.q + '|' + EM.unread;
  box.classList.add('busy');
  let r; try { r = await api('mail', 'list', undefined, `&folder=${encodeURIComponent(EM.f)}&page=${EM.p}&q=${encodeURIComponent(EM.q)}${EM.unread ? '&only=unread' : ''}`); } catch (e) { box.classList.remove('busy'); box.innerHTML = '<p class="mut" style="padding:14px">Could not load emails.</p>'; return; }
  if (key !== EM.f + '|' + EM.p + '|' + EM.q + '|' + EM.unread || !$('#emls')) return; // a newer request is on its way
  EM.list = r; box.classList.remove('busy');
  const sent = emRole() === 'sent' || emRole() === 'drafts';
  box.innerHTML = r.items.map(m => { const who = sent ? 'To: ' + (m.to.map(emWho).join(', ') || '—') : emWho(m.from), em = sent ? (m.to[0] || {}).email : m.from.email, cp = r.people && r.people[em];
    return `<button class="emi ${m.seen ? '' : 'un'} ${m.uid === EM.uid ? 'on' : ''}" data-uid="${m.uid}"><span class="emav">${esc((who.replace(/^To: /, '')[0] || '?').toUpperCase())}</span>
      <span class="emb"><span class="emt"><b>${esc(who)}</b><time>${emWhen(m.date)}</time></span><span class="ems">${m.answered ? '<i class="i i-undo" title="Replied"></i>' : ''}${esc(m.subject || '(no subject)')}</span>
      ${cp || m.att ? `<span class="emx">${cp ? `<span class="emcp sm"><i class="i i-user"></i>${esc(cp.name)}</span>` : ''}${m.att ? '<i class="i i-clip" title="Has attachments"></i>' : ''}</span>` : ''}</span></button>`; }).join('')
    || `<div class="emempty sm"><p>${EM.q ? 'No emails match your search.' : EM.unread ? 'No unread emails.' : 'This folder is empty.'}</p></div>`;
  const from = (r.page - 1) * 40 + 1, to = Math.min(r.total, r.page * 40);
  $('#emp').innerHTML = r.total ? `<span class="mut">${from}–${to} of ${r.total}</span><span class="sp"></span><button class="ib" id="empv" ${r.page <= 1 ? 'disabled' : ''} title="Newer">‹</button><button class="ib" id="empn" ${r.page >= r.pages ? 'disabled' : ''} title="Older">›</button>` : '';
  if ($('#empv')) { $('#empv').onclick = () => { EM.p--; emList(); }; $('#empn').onclick = () => { EM.p++; emList(); }; }
  $$('.emi', box).forEach(b => b.onclick = () => emOpen(+b.dataset.uid));
  box.scrollTop = 0;
}

async function emOpen(uid) {
  EM.uid = uid; $$('.emi').forEach(b => b.classList.toggle('on', +b.dataset.uid === uid));
  const r = $('#emr'); r.innerHTML = '<p class="mut" style="padding:20px">Opening…</p>'; $('#emw').classList.replace('v-list', 'v-read');
  let m; try { m = await api('mail', 'get', undefined, `&folder=${encodeURIComponent(EM.f)}&uid=${uid}`); } catch (e) { r.innerHTML = '<p class="mut" style="padding:20px">Could not open this email.</p>'; return; }
  if (EM.uid !== uid) return; EM.msg = m;
  const li = $(`.emi[data-uid="${uid}"]`); if (li && li.classList.contains('un')) { li.classList.remove('un'); const it = (EM.list.items || []).find(x => x.uid === uid); if (it) it.seen = true; const f = EM.folders.find(x => x.id === EM.f); if (f && f.unseen > 0) { f.unseen--; emFoldersCounts(); } }
  const w = canW('email'), others = EM.folders.filter(f => f.id !== EM.f);
  const line = (l, arr) => arr && arr.length ? `<div><span>${l}</span>${arr.map(a => `<span class="emad" title="${esc(a.email)}">${esc(emWho(a))}</span>${emPerson(m.people, a.email)}`).join(', ')}</div>` : '';
  r.innerHTML = `<div class="emrh"><button class="btn sec sm emback" id="emback">‹ Back</button><span class="sp"></span>
      ${w ? `<button class="btn sec sm" data-act="reply"><i class="i i-undo"></i> Reply</button><button class="btn sec sm" data-act="all">Reply all</button><button class="btn sec sm" data-act="fwd">Forward</button>
      <button class="ib" data-act="unread" title="Mark as unread"><i class="i i-eye"></i></button>
      ${others.length ? `<select class="emmv" id="emmv" title="Move to folder"><option value="">Move to…</option>${others.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select>` : ''}
      <button class="ib" data-act="del" title="${emRole() === 'trash' ? 'Delete forever' : 'Delete'}"><i class="i i-trash"></i></button>` : ''}</div>
    <div class="emrs"><h2>${esc(m.subject || '(no subject)')}</h2>
      <div class="emhd"><span class="emav emavl">${esc((emWho(m.from)[0] || '?').toUpperCase())}</span><div class="emhm">
        <div class="emfr"><b>${esc(emWho(m.from))}</b> <span class="mut">&lt;${esc(m.from.email)}&gt;</span>${emPerson(m.people, m.from.email)}<span class="sp"></span><time>${emFull(m.date)}</time></div>
        <div class="emto">${line('To', m.to)}${line('Cc', m.cc)}</div></div></div>
      ${m.att.length ? `<div class="emat">${m.att.map(a => `<a class="emac" href="api.php?m=mail&a=att&folder=${encodeURIComponent(EM.f)}&uid=${uid}&i=${a.i}" title="Download ${esc(a.name)}"><i class="i i-clip"></i><span>${esc(a.name)}</span><small>${emSize(a.size)}</small></a>`).join('')}</div>` : ''}
      ${m.remote ? '<p class="emnote">Pictures from the internet are not loaded, to keep this mailbox safe from tracking.</p>' : ''}
      <div class="embd" id="embd"></div></div>`;
  const bd = $('#embd');
  if (m.html) { const f = document.createElement('iframe'); f.className = 'emif'; f.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox'); f.setAttribute('referrerpolicy', 'no-referrer'); f.title = 'Email content';
    f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;padding:0;background:#fff}body{font:14px/1.5 -apple-system,"Segoe UI",Arial,sans-serif;color:#1d1d1f;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%!important}pre{white-space:pre-wrap}</style></head><body>${m.html}</body></html>`;
    const fit = () => { try { f.style.height = Math.max(120, f.contentDocument.documentElement.scrollHeight + 8) + 'px'; } catch (e) { f.style.height = '70vh'; } };
    f.onload = () => { fit(); setTimeout(fit, 400); setTimeout(fit, 1500); }; bd.appendChild(f); }
  else bd.innerHTML = `<div class="emtx">${emLinkify(m.text || '')}</div>`;
  $('#emback').onclick = () => { EM.uid = null; emReaderEmpty(); $$('.emi').forEach(b => b.classList.remove('on')); };
  $$('[data-act]', r).forEach(b => b.onclick = () => emAct(b.dataset.act));
  if ($('#emmv')) $('#emmv').onchange = e => e.target.value && emMove(e.target.value);
}
function emFoldersCounts() { $$('.emfi').forEach(b => { const f = EM.folders.find(x => x.id === b.dataset.f); let c = b.querySelector('b'); if (f && f.unseen) { if (!c) { c = document.createElement('b'); b.appendChild(c); } c.textContent = f.unseen; } else if (c) c.remove(); });
  const ib = EM.folders.find(f => f.role === 'inbox'); if (ib) mailBadgeSet(ib.unseen); }
async function emMove(to) {
  const uid = EM.uid, del = to === 'trash';
  if (del && emRole() === 'trash' && !confirm('Delete this email forever? It cannot be recovered.')) return;
  try { const r = await api('mail', 'move', { folder: EM.f, uids: [uid], to }); toast(del ? (r.forever ? 'Email deleted forever' : 'Moved to Trash') : 'Email moved'); } catch (e) { return; }
  const li = $(`.emi[data-uid="${uid}"]`), nx = li && (li.nextElementSibling || li.previousElementSibling); if (li) li.remove();
  if (EM.list) EM.list.items = EM.list.items.filter(x => x.uid !== uid);
  if (nx && nx.dataset.uid && matchMedia('(min-width:761px)').matches) emOpen(+nx.dataset.uid); else { EM.uid = null; emReaderEmpty(); }
  emFolders();
}
async function emAct(k) {
  const m = EM.msg; if (!m) return;
  if (k === 'del') return emMove('trash');
  if (k === 'unread') { await api('mail', 'flag', { folder: EM.f, uids: [m.uid], flag: 'seen', on: 0 }); const li = $(`.emi[data-uid="${m.uid}"]`); if (li) li.classList.add('un'); const f = EM.folders.find(x => x.id === EM.f); if (f) { f.unseen++; emFoldersCounts(); } EM.uid = null; emReaderEmpty(); return; }
  const me = (EM.cfg.email || '').toLowerCase(), quoteText = (m.text || (m.html ? new DOMParser().parseFromString(m.html, 'text/html').body.innerText : '')).trim();
  const head = `On ${emFull(m.date)}, ${emAddr(m.from)} wrote:`;
  const re = s => /^(re|aw):/i.test(s) ? s : 'Re: ' + s, fw = s => /^(fwd?|wg):/i.test(s) ? s : 'Fwd: ' + s;
  if (k === 'fwd') return composeMail({ subject: fw(m.subject || ''), body: `\n\n---------- Forwarded message ----------\nFrom: ${emAddr(m.from)}\nDate: ${emFull(m.date)}\nSubject: ${m.subject || ''}\nTo: ${m.to.map(emAddr).join(', ')}\n\n${quoteText}`, fwd: m.att.length ? { folder: EM.f, uid: m.uid, names: m.att.map(a => a.name) } : null });
  const to = [m.reply_to || m.from], cc = [];
  if (k === 'all') { m.to.concat(m.cc).forEach(a => { if (a.email !== me && !to.some(x => x.email === a.email)) cc.push(a); }); }
  composeMail({ to: to.map(a => a.email).join(', '), cc: cc.map(a => a.email).join(', '), subject: re(m.subject || ''), body: `\n\n${head}\n` + quoteText.split('\n').map(l => '> ' + l).join('\n'), reply: { msgid: m.msgid, refs: m.refs, uid: m.uid, folder: EM.f } });
}

// Compose — also used from other pages (e.g. Warranty card → "Sent via email"): composeMail({to, subject, body, files:[{id,name}]})
async function composeMail(o = {}) {
  if (!EM.cfg) { try { EM.cfg = await api('mail', 'config'); } catch (e) { return; } }
  if (!EM.cfg.ready) return toast('Connect the mailbox first (Email menu)', true);
  const sig = EM.cfg.signature ? '\n\n-- \n' + EM.cfg.signature : '';
  const body = (o.body || '').startsWith('\n\n') ? sig + o.body : (o.body || '') + sig;
  const crm = (o.files || []).slice(), local = [];
  const m = modal(`<div class="mh"><h3>${o.reply ? 'Reply' : o.fwd ? 'Forward' : 'New email'}</h3><button class="ib" data-x title="Close"><i class="i i-x"></i></button></div>
    <div class="emc"><div class="emcr"><label>From</label><div class="emcf">${esc(EM.cfg.name ? `${EM.cfg.name} <${EM.cfg.email}>` : EM.cfg.email)}</div></div>
      <div class="emcr"><label for="emc_to">To</label><input id="emc_to" list="emc_dl" value="${esc(o.to || '')}" placeholder="name@example.com, …" autocomplete="off"><button class="btn sec sm" id="emc_ccb" type="button" ${o.cc ? 'hidden' : ''}>Cc / Bcc</button></div>
      <div class="emcr" id="emc_ccr" ${o.cc ? '' : 'hidden'}><label for="emc_cc">Cc</label><input id="emc_cc" list="emc_dl" value="${esc(o.cc || '')}" autocomplete="off"></div>
      <div class="emcr" id="emc_bccr" hidden><label for="emc_bcc">Bcc</label><input id="emc_bcc" list="emc_dl" autocomplete="off"></div>
      <div class="emcr"><label for="emc_su">Subject</label><input id="emc_su" value="${esc(o.subject || '')}"></div>
      <textarea id="emc_bd" rows="14" placeholder="Write your message…">${esc(body)}</textarea>
      <div class="emcat" id="emc_at"></div>
      <div class="bar"><button class="btn" id="emc_go"><i class="i i-upload"></i> Send</button><label class="btn sec" title="Attach files from this computer"><input type="file" id="emc_f" multiple hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"><i class="i i-clip"></i> Attach</label><span class="sp"></span><span class="mut" style="font-size:12px">Documents and images, up to 24 MB in total</span></div></div>
    <datalist id="emc_dl"></datalist>`, true);
  m.classList.add('emmod');
  const close = () => m.remove(); $('[data-x]', m).onclick = close;
  $('#emc_ccb', m).onclick = e => { e.currentTarget.hidden = true; $('#emc_ccr', m).hidden = false; $('#emc_bccr', m).hidden = false; $('#emc_cc', m).focus(); };
  const drawAt = () => { $('#emc_at', m).innerHTML = [...(o.fwd ? o.fwd.names.map(n => `<span class="emch"><i class="i i-clip"></i>${esc(n)}<small>from the original</small></span>`) : []),
    ...crm.map((f, i) => `<span class="emch"><i class="i i-file"></i>${esc(f.name)}<small>CRM document</small><button data-rc="${i}" title="Remove"><i class="i i-x"></i></button></span>`),
    ...local.map((f, i) => `<span class="emch"><i class="i i-clip"></i>${esc(f.name)}<small>${emSize(f.size)}</small><button data-rl="${i}" title="Remove"><i class="i i-x"></i></button></span>`)].join('');
    $$('[data-rc]', m).forEach(b => b.onclick = () => { crm.splice(+b.dataset.rc, 1); drawAt(); }); $$('[data-rl]', m).forEach(b => b.onclick = () => { local.splice(+b.dataset.rl, 1); drawAt(); }); };
  drawAt();
  $('#emc_f', m).onchange = e => { local.push(...e.target.files); e.target.value = ''; drawAt(); };
  if (canR('customers')) list('customers').then(cs => { const dl = $('#emc_dl', m); if (dl) dl.innerHTML = cs.filter(c => c.email).map(c => `<option value="${esc(c.email)}">${esc(c.name)}</option>`).join(''); }).catch(() => { });
  $("#emc_bd", m).value = body; // set directly: a textarea drops its first newline in HTML
  setTimeout(() => (o.to ? $('#emc_bd', m) : $('#emc_to', m)).focus(), 50); if (o.to) $('#emc_bd', m).setSelectionRange(0, 0);
  $('#emc_go', m).onclick = async e => { const b = e.currentTarget;
    if (!$('#emc_to', m).value.trim()) return toast('Add a recipient', true);
    if (!$('#emc_su', m).value.trim() && !confirm('Send without a subject?')) return;
    const fd = new FormData(); fd.append('data', JSON.stringify({ to: $('#emc_to', m).value, cc: $('#emc_cc', m).value, bcc: $('#emc_bcc', m).value, subject: $('#emc_su', m).value, body: $('#emc_bd', m).value, file_ids: crm.map(f => f.id), reply: o.reply || null, fwd: o.fwd ? { folder: o.fwd.folder, uid: o.fwd.uid } : null }));
    local.forEach(f => fd.append('att[]', f, f.name));
    b.disabled = true; b.innerHTML = 'Sending…';
    try { const r = await api('mail', 'send', fd); toast(r.saved ? 'Email sent' : 'Email sent (a copy could not be saved in Sent)'); close(); if (o.onSent) o.onSent(); if ($('#emw') && (emRole() === 'sent' || o.reply)) emList(); }
    catch (x) { b.disabled = false; b.innerHTML = '<i class="i i-upload"></i> Send'; } };
}

// unread badge on the sidebar
let MAILU = null;
function mailBadgeSet(n) { const a = $('aside a[data-m="email"]'); if (!a) return; let b = a.querySelector('.nb'); if (!b) { b = document.createElement('span'); b.className = 'nb'; a.appendChild(b); } b.textContent = n || ''; b.style.display = n ? '' : 'none'; }
async function mailBadge() { if (!canR('email')) return; try { const r = await api('mail', 'unread'); if (!r.ready) { clearInterval(MAILU); return; } mailBadgeSet(r.unread); } catch (e) { } }
function startMail() { clearInterval(MAILU); if (!canR('email')) return; mailBadge(); MAILU = setInterval(() => { if (!document.hidden) mailBadge(); }, 90000); }
