// Solarize CRM - Subsidy (PM Surya Ghar) tracker: add a customer, then follow the subsidy status to the end (api/subsidy.php)
/* Pure rules (Node-tested in tests/subsidy.test.js) */
const SUBSIDY = {
  CLS: { 'Netmeter installed': 'b', 'KSEB doc uploaded': 'b', 'DISCOM inspection': 'y', 'Inspection completed': 'c', 'Subsidy redeem stage': 'p', 'Subsidy redeemed': 'c', 'Subsidy disbursed': 'g', 'Subsidy rejected': 'r', Reverify: 'y' },
  cls(s) { return this.CLS[s] || ''; },
  /* how many customers stand at each status */
  counts(rows, statuses) { const n = Object.fromEntries(statuses.map(s => [s, 0])); rows.forEach(r => { if (r.status in n) n[r.status]++; }); return n; },
  /* the list as filtered by a status tile and the search box (name, phone, consumer no., application no., district) */
  filter(rows, status, q) {
    const t = String(q || '').trim().toLowerCase();
    return rows.filter(r => (!status || r.status === status) && (!t || [r.name, r.phone, r.consumer_no, r.application_no, r.district].join(' ').toLowerCase().includes(t)));
  },
  /* whole days a customer has stood at the status (0 = since today; a wrong / future date counts as 0) */
  days(date, today) { const a = Date.parse(String(date || '').slice(0, 10) + 'T00:00:00Z'), b = Date.parse(today + 'T00:00:00Z'); return isNaN(a) || isNaN(b) ? 0 : Math.max(0, Math.round((b - a) / 864e5)); },
  daysTxt(n) { return n <= 0 ? 'today' : n === 1 ? '1 day' : n + ' days'; },
  /* the step strip: every stage of the usual path is done / now / todo. On a side status (Rejected, Reverify) the path
     shows how far the customer had come, from the history (newest first). */
  steps(flow, status, log) {
    let at = flow.indexOf(status);
    if (at < 0) { const last = (log || []).find(l => flow.includes(l.status)); at = last ? flow.indexOf(last.status) : -1; return flow.map((s, i) => ({ s, st: i <= at ? 'done' : 'todo' })); }
    return flow.map((s, i) => ({ s, st: i < at ? 'done' : i === at ? 'now' : 'todo' }));
  },
  /* the status the "next" button offers: the following stage, or after Reverify the redeem stage again */
  next(flow, status) { const i = flow.indexOf(status); if (i >= 0) return flow[i + 1] || ''; return status === 'Reverify' ? 'Subsidy redeem stage' : ''; }
};
if (typeof module !== 'undefined') module.exports = { SUBSIDY };
/* the redeemed-subsidy screenshot (owner, 2026-11-22): offered at these statuses, saved in the customer's Documents (api/subsidy.php shot / img) */
const SDY_SHOT_AT = ['Subsidy redeemed', 'Subsidy disbursed'];
const sdyShotUrl = (f, dl) => `api.php?m=subsidy&a=img&id=${f.id}${dl === 1 ? '&dl=1' : dl === 'v' ? '&v=1' : ''}`;

const SDY = { d: null, f: '', q: '' };
async function pgSubsidy(id) {
  const main = $('#main');
  SDY.d = await api('subsidy', 'list');
  const d = SDY.d, all = [...d.flow, ...d.side];
  const draw = () => {
    const n = SUBSIDY.counts(d.rows, all), list = SUBSIDY.filter(d.rows, SDY.f, SDY.q), td = today();
    const tile = (s, label, cnt) => `<button type="button" class="sdy-t${SDY.f === s ? ' on' : ''}" data-f="${esc(s)}"><b>${cnt}</b><span>${s ? `<i class="sdy-dot ${SUBSIDY.cls(s)}"></i>` : ''}${esc(label)}</span></button>`;
    const cols = [['Customer', r => `<b>${esc(r.name)}</b><br><small class="mut">${esc([r.phone, r.district].filter(Boolean).join(' · '))}</small>`],
      ['kW', r => r.kw || '—', 'num'],
      ['Consumer / application no.', r => `${esc(r.consumer_no) || '—'}${r.application_no ? `<br><small class="mut">${esc(r.application_no)}</small>` : ''}`],
      ['Status', r => pill(r.status, SUBSIDY.cls(r.status))],
      ['Since', r => `<span class="sdy-nw">${dshort(r.status_date)}</span>${d.closed.includes(r.status) ? '' : `<br><small class="mut">${SUBSIDY.daysTxt(SUBSIDY.days(r.status_date, td))}</small>`}`],
      ...(d.fin ? [['Subsidy amount', r => r.subsidy_amount ? inr(r.subsidy_amount) : '—', 'num']] : []),
      ['Note', r => `<span class="sdy-note">${esc(r.note)}</span>`],
      /* row actions: the customer's team discussion (as on the Customers list), edit = the status box, delete = off the list */
      ['Actions', r => `${canR('customers') && typeof discBtn === 'function' ? discBtn(r.customer_id) : ''}<button class="ib" data-a="ed" title="${d.write ? 'Edit status, date and note' : 'Open'}"><i class="i i-pencil"></i></button>${d.write ? '<button class="ib sdy-del" data-a="rm" title="Delete from the subsidy list"><i class="i i-trash"></i></button>' : ''}`, 'sdy-ac']];
    main.innerHTML = `<div class="sdy-bar"><input id="sdyq" type="search" placeholder="Search name, phone, consumer no.…" value="${esc(SDY.q)}">${d.write ? '<button class="btn" id="sdyadd"><i class="i i-plus"></i> Add customer</button>' : ''}</div>
      <div class="sdy-tiles">${tile('', 'All', d.rows.length)}${all.map(s => tile(s, s, n[s])).join('')}</div>
      <div id="sdyl">${d.rows.length ? table(cols, list.map(r => ({ ...r, id: r.customer_id })), cid => sdyBox(+cid, reload)) : `<div class="card sdy-empty"><b>No customers on the subsidy list yet</b><p class="mut">${d.write ? 'Add a customer once their net meter is installed, then follow the subsidy here until it reaches their bank.' : 'Customers appear here once they are added for subsidy follow-up.'}</p>${d.write ? '<button class="btn" id="sdyadd2"><i class="i i-plus"></i> Add customer</button>' : ''}</div>`}</div>`;
    $$('.sdy-t', main).forEach(b => b.onclick = () => { SDY.f = b.dataset.f; draw(); });
    const q = $('#sdyq', main); q.oninput = () => { SDY.q = q.value; const pos = q.selectionStart; draw(); const nq = $('#sdyq', main); nq.focus(); nq.setSelectionRange(pos, pos); };
    [$('#sdyadd', main), $('#sdyadd2', main)].forEach(b => { if (b) b.onclick = () => sdyPick(reload); });
    $$('#sdyl tr.row [data-a]', main).forEach(b => b.onclick = () => { const cid = +b.closest('tr').dataset.id, r = d.rows.find(x => x.customer_id === cid), a = b.dataset.a; if (!r) return;
      if (a === 'ed') sdyBox(cid, reload);
      if (a === 'rm') sdyRemove(r, reload);
      if (a === 'ds') sdyDisc(cid, () => { if ($('#sdyq', main)) draw(); }); });
    if (typeof fitSoon === 'function') fitSoon();
  };
  const reload = async () => { SDY.d = await api('subsidy', 'list'); Object.assign(d, SDY.d); if ($('#sdyq', main)) draw(); };
  draw();
  if (typeof discSummary === 'function') discSummary().then(() => { if ($('#sdyq', main) && !document.querySelector('.modal')) draw(); }); /* fresh discussion marks */
  if (id) sdyBox(+id, reload); /* #/subsidy/<customer id>: straight to that customer (dashboard, project page) */
}

/* pick a customer who is not on the list yet; they start at the first status and their box opens to set the date / status */
async function sdyPick(reload) {
  const cs = await api('subsidy', 'candidates');
  const m = modal(`<h2 class="u-mt0">Add a customer</h2><p class="mut u-mtn6">Pick the customer to follow for subsidy. They start at “Netmeter installed”.</p>
    <input id="sdypq" placeholder="Search name, phone, consumer no.…"><div class="fcl2" id="sdypl"></div><div class="bar u-mt12"><button class="btn sec" id="sdypx">Cancel</button></div>`);
  const dr = () => { const t = $('#sdypq', m).value.trim().toLowerCase(), L = cs.filter(c => !t || [c.name, c.phone, c.consumer_no, c.district].join(' ').toLowerCase().includes(t)).slice(0, 200);
    $('#sdypl', m).innerHTML = L.map(c => `<button type="button" class="fci cmn-pick" data-pk="${c.id}"><span><b>${esc(c.name)}</b><small class="mut">${esc([c.phone, c.consumer_no, c.district].filter(Boolean).join(' · '))}</small></span></button>`).join('') || `<p class="mut" style="padding:10px 12px;margin:0">${cs.length ? 'No customer matches.' : 'Every customer is on the subsidy list already.'}</p>`; };
  $('#sdypq', m).oninput = dr; dr(); $('#sdypq', m).focus(); $('#sdypx', m).onclick = () => m.remove();
  let busy = false;
  $('#sdypl', m).onclick = async e => { const b = e.target.closest('[data-pk]'); if (!b || busy) return; busy = true;
    try { await api('subsidy', 'add', { customer_id: +b.dataset.pk }); } catch (x) { busy = false; return; }
    m.remove(); await reload(); sdyBox(+b.dataset.pk, reload); };
}

/* one customer: the step strip, the status change (date + note) and the history */
async function sdyBox(cid, reload) {
  const g = await api('subsidy', 'get', undefined, '&customer_id=' + cid);
  if (!g.row) { if (typeof toast === 'function') toast('This customer is not on the subsidy list', true); return; }
  const r = g.row, w = g.write; let sel = r.status;
  const m = modal('<div id="sdyb"></div>', true), box = $('#sdyb', m);
  g.shots = g.shots || [];
  const draw = () => {
    const steps = SUBSIDY.steps(g.flow, r.status, g.log), nx = SUBSIDY.next(g.flow, r.status), changed = sel !== r.status;
    /* the screenshot strip: at Subsidy redeemed / disbursed, or whenever one was uploaded */
    const shots = SDY_SHOT_AT.includes(r.status) || g.shots.length ? `<div class="sdy-shot"><div class="sdy-shh"><b>Redeemed screenshot</b><small class="mut">${g.shots.length ? 'Saved in the customer’s Documents' : 'Optional'}</small></div>
      <div class="sdy-shl">${g.shots.map((f, i) => `<button type="button" class="sdy-th" data-shv="${i}" title="View ${esc(f.name)}">${/\.pdf$/i.test(f.name) ? '<span class="sdy-pdf"><i class="i i-file"></i>PDF</span>' : `<img src="${sdyShotUrl(f)}" alt="" loading="lazy">`}</button>`).join('')}
      ${w ? `<button type="button" class="btn sec sm" id="sdyup"><i class="i i-upload"></i> ${g.shots.length ? 'Upload another' : 'Upload screenshot'}</button>` : g.shots.length ? '' : '<small class="mut">Not uploaded</small>'}</div></div>` : '';
    box.innerHTML = `<div class="sdy-h"><div><h2>${esc(r.name)}</h2><small class="mut">${esc([r.phone, r.consumer_no ? 'Consumer no. ' + r.consumer_no : '', r.kw ? r.kw + ' kW' : '', r.application_no ? 'Application ' + r.application_no : ''].filter(Boolean).join(' · '))}</small></div>
        <div class="sdy-hr">${pill(r.status, SUBSIDY.cls(r.status))}<small class="mut">since ${dmy(r.status_date)}</small></div></div>
      <div class="sdy-steps">${steps.map((x, i) => `<button type="button" class="sdy-s sdy-${x.st}${sel === x.s ? ' sdy-sel' : ''}" data-s="${esc(x.s)}" ${w ? '' : 'disabled'}><em>${x.st === 'done' ? '<i class="i i-check"></i>' : i + 1}</em><span>${esc(x.s)}</span></button>`).join('')}</div>
      <div class="sdy-side"><span class="mut">Or:</span>${g.side.map(s => `<button type="button" class="sdy-x ${SUBSIDY.cls(s)}${r.status === s ? ' sdy-now' : ''}${sel === s ? ' sdy-sel' : ''}" data-s="${esc(s)}" ${w ? '' : 'disabled'}>${esc(s)}</button>`).join('')}</div>
      ${shots}
      ${w ? `<div class="sdy-f"><div><label>Status</label><div class="sdy-pick">${pill(sel, SUBSIDY.cls(sel))}${changed ? '<small class="mut">was ' + esc(r.status) + '</small>' : nx ? `<a href="#" id="sdynx">Move to “${esc(nx)}”</a>` : ''}</div></div>
          <div><label for="sdyd">Date</label><input id="sdyd" type="date" max="${today()}" value="${changed ? today() : esc(r.status_date)}"></div>
          <div class="full"><label for="sdyn">Note (optional)</label><input id="sdyn" maxlength="300" ${SPELL} placeholder="e.g. Inspection fixed for Monday, reason for rejection" value="${changed ? '' : esc(r.note)}"></div></div>
        <div class="bar sdy-act"><button class="btn" id="sdysv">${changed ? 'Save status' : 'Save'}</button><button class="btn sec" id="sdycx">Close</button><span class="sdy-sp"></span><a href="#/customers/${r.customer_id}" id="sdycu">Customer profile</a><a href="#" class="over" id="sdyrm">Remove from list</a></div>`
      : `${r.note ? `<p class="sdy-ro">${esc(r.note)}</p>` : ''}<div class="bar sdy-act"><button class="btn sec" id="sdycx">Close</button><span class="sdy-sp"></span><a href="#/customers/${r.customer_id}" id="sdycu">Customer profile</a></div>`}
      <h3 class="sdy-hh">History</h3><div class="sdy-log">${g.log.map(l => `<div><i class="sdy-dot ${SUBSIDY.cls(l.status)}"></i><span><b>${esc(l.status)}</b> <small class="mut">${dmy(l.date)}${l.by ? ' · ' + esc(l.by) : ''}</small>${l.note ? `<br><small>${esc(l.note)}</small>` : ''}</span></div>`).join('') || '<p class="mut">No changes yet</p>'}</div>`;
    $$('[data-s]', box).forEach(b => b.onclick = () => { sel = b.dataset.s; draw(); });
    $('#sdycx', box).onclick = () => m.remove(); $('#sdycu', box).onclick = () => m.remove();
    if ($('#sdynx', box)) $('#sdynx', box).onclick = e => { e.preventDefault(); sel = nx; draw(); };
    if ($('#sdysv', box)) $('#sdysv', box).onclick = async () => {
      const to = sel, was = r.status;
      const res = await api('subsidy', 'set', { customer_id: cid, status: to, date: $('#sdyd', box).value, note: $('#sdyn', box).value });
      m.remove(); if (typeof toast === 'function') toast(res.same ? 'Nothing changed' : 'Subsidy status saved'); if (reload) await reload();
      if (to === 'Subsidy redeemed' && was !== to) sdyShotAsk(r); /* just redeemed: offer the screenshot upload (optional) */
    };
    $$('[data-shv]', box).forEach(b => b.onclick = () => docViewer(g.shots.map(f => ({ id: f.id, name: f.name, item: 'Subsidy redeemed screenshot' })), +b.dataset.shv, sdyShotUrl));
    if ($('#sdyup', box)) $('#sdyup', box).onclick = () => sdyShotAsk(r, sh => { g.shots = sh; draw(); });
    if ($('#sdyrm', box)) $('#sdyrm', box).onclick = async e => { e.preventDefault(); if (await sdyRemove(r, reload)) m.remove(); };
  };
  draw();
}

/* The redeemed-subsidy screenshot, optional: choose a file, drop it on the box, or paste it (Ctrl+V — a screenshot is usually on the
   clipboard). A preview shows before it is saved; it goes to the customer's Documents. done(shots) gets the new list. */
function sdyShotAsk(r, done) {
  const m = modal(`<div class="sdy-up"><div class="sdy-uph"><span class="sdy-upi"><i class="i i-check"></i></span><div><h2>Subsidy redeemed</h2><p class="mut">${esc(r.name)} · upload a screenshot of the redeemed page (optional). It is saved in the customer’s Documents.</p></div></div>
    <label class="sdy-drop" id="sdydz" tabindex="0"><input type="file" id="sdyf" accept="image/png,image/jpeg,image/webp,application/pdf" hidden><i class="i i-upload"></i><b>Choose screenshot</b><small class="mut">or drop it here, or paste it with Ctrl+V</small></label>
    <div class="sdy-prev" id="sdypv" hidden></div>
    <div class="bar sdy-upb"><button class="btn" id="sdyus" disabled>Save to Documents</button><button class="btn sec" id="sdyuk">Skip</button></div></div>`);
  let file = null, url = '';
  const close = () => { m.remove(); document.removeEventListener('paste', paste); if (url) URL.revokeObjectURL(url); };
  const take = (f, pasted) => {
    if (!f) return;
    if (!/^(image\/(png|jpeg|webp)|application\/pdf)$/.test(f.type)) { toast('Choose a picture (PNG, JPG, WEBP) or a PDF', true); return; }
    if (pasted) f = new File([f], `subsidy-redeemed-${today()}.${f.type === 'image/jpeg' ? 'jpg' : f.type.split('/')[1]}`, { type: f.type });
    file = f; if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(f);
    const pv = $('#sdypv', m); pv.hidden = false;
    pv.innerHTML = /^image\//.test(f.type) ? `<img src="${url}" alt="">` : `<span class="sdy-pdf"><i class="i i-file"></i>PDF</span>`;
    pv.insertAdjacentHTML('beforeend', `<small class="mut">${esc(f.name)} · ${Math.max(1, Math.round(f.size / 1024))} KB</small>`);
    $('#sdyus', m).disabled = false; $('#sdyus', m).focus();
  };
  const paste = e => { if (!document.body.contains(m)) return document.removeEventListener('paste', paste);
    const f = [...((e.clipboardData && e.clipboardData.files) || [])][0]; if (f) { e.preventDefault(); take(f, true); } };
  document.addEventListener('paste', paste);
  $('#sdyf', m).onchange = e => take(e.target.files[0]);
  const dz = $('#sdydz', m);
  dz.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#sdyf', m).click(); } };
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('on'); }; dz.ondragleave = () => dz.classList.remove('on');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('on'); take(e.dataTransfer.files[0]); };
  $('#sdyuk', m).onclick = close;
  $('#sdyus', m).onclick = async () => {
    if (!file) return; const b = $('#sdyus', m); b.disabled = true; b.textContent = 'Saving…';
    try {
      const fd = new FormData(); fd.append('customer_id', r.customer_id);
      const up = typeof shrinkImage === 'function' && /^image\//.test(file.type) ? await shrinkImage(file) : file; /* big pictures are made smaller first (app12.js) */
      fd.append('file', up, up.name || file.name);
      const res = await api('subsidy', 'shot', fd);
      if (typeof DOC_STALE !== 'undefined') DOC_STALE.add(+r.customer_id); /* the Documents tab reads it again */
      close(); toast('Screenshot saved in the customer’s Documents'); if (done) done(res.shots || []);
    } catch (x) { b.disabled = false; b.textContent = 'Save to Documents'; }
  };
  dz.focus();
}

/* delete = take the customer off the subsidy list (the customer stays; the status history goes to the Recycle bin) */
async function sdyRemove(r, reload) {
  if (!await ask(`Delete ${r.name} from the subsidy list?\nThe customer stays in the CRM. The subsidy status history goes to the Recycle bin.`)) return false;
  await api('subsidy', 'remove', { customer_id: r.customer_id }); if (typeof toast === 'function') toast('Deleted from the subsidy list'); if (reload) await reload(); return true;
}
/* the customer's team discussion (app9.js); when its window closes the list shows the new live / unread mark */
function sdyDisc(cid, redraw) {
  if (typeof discOpen !== 'function') return;
  discOpen(cid);
  const m = document.querySelector('.xdmod'); if (!m) return;
  const ob = new MutationObserver(() => { if (document.body.contains(m)) return; ob.disconnect(); discSummary().then(redraw); });
  ob.observe(document.body, { childList: true });
}
