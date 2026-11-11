// Finance › Commission (customers owned by a Business Associate) and Incentive (customers owned by other staff).
// Admin: both lists; types the amount, records it paid in two parts (amount, date, transaction ID) and switches each customer
// visible to its person. Incentive "Edit" (Settings → User access) manages the staff incentives too, never one's own.
// A BA / staff member sees only what was shared with them, as "Commission received" / "Incentive received" (Incentive "View").
// The rules in COMM are plain functions (Node-tested in tests/comm.test.js); the screen code below runs only in the browser.
const COMM = {
  num: v => { const s = String(v ?? '').replace(/[,₹\s]/g, ''); return s === '' ? 0 : +s; },
  paid: r => (+r.p1_amount || 0) + (+r.p2_amount || 0),
  balance: r => Math.max(0, (+r.amount || 0) - COMM.paid(r)),
  // 'unset' no amount typed yet · 'due' something left to pay · 'paid' fully paid
  status: r => !(+r.amount > 0) ? 'unset' : COMM.paid(r) + 0.005 >= +r.amount ? 'paid' : 'due',
  totals: rows => rows.reduce((t, r) => { t.n++; t.amount += +r.amount || 0; t.paid += COMM.paid(r); t.balance += COMM.balance(r); return t; }, { n: 0, amount: 0, paid: 0, balance: 0 }),
  // the admin pays, the person receives
  words: (kind, admin) => { const K = kind === 'commission' ? 'Commission' : 'Incentive', k = K.toLowerCase();
    return { K, title: admin ? K : K + ' received', paid: admin ? 'Paid ' + k : K + ' received', done: admin ? 'Paid' : 'Received', person: kind === 'commission' ? 'Business Associate' : 'Staff member' }; },
  // the Finance › entries this user gets: admin both lists; a BA their commission; staff by Incentive access (Edit = the whole list too)
  nav: me => { if (!me) return [];
    if (me.role === 'admin') return [['commission', 'Commission'], ['incentive', 'Incentive']];
    if (me.role === 'ba') return [['commission', 'Commission received']];
    const has = (k, m) => me[k] === '*' || (Array.isArray(me[k]) && me[k].includes(m)), edit = has('write', 'incentive');
    return [...(edit ? [['incentive', 'Incentive']] : []), ...(edit || has('read', 'incentive') ? [[edit ? 'mine' : 'incentive', 'Incentive received']] : [])]; },
  // same checks as the server (api/comm.php save), so the form can say what is wrong before sending
  check: (f, K = 'Commission') => {
    const a = COMM.num(f.amount), p = [1, 2].map(n => COMM.num(f['p' + n + '_amount']));
    if (!(a >= 0)) return K + ' amount: enter an amount in rupees';
    for (const n of [1, 2]) { const x = p[n - 1];
      if (!(x >= 0)) return `Part ${n} amount: enter an amount in rupees`;
      if (x > 0 && !f['p' + n + '_date']) return `Part ${n}: enter the date it was paid`;
      if (!(x > 0) && (f['p' + n + '_date'] || String(f['p' + n + '_ref'] || '').trim())) return `Part ${n}: enter the amount paid, or clear its date and transaction ID`; }
    if (p[1] > 0 && !(p[0] > 0)) return 'Record part 1 before part 2';
    if (p[0] + p[1] > a + 0.005) return `Paid so far (₹${Math.round(p[0] + p[1]).toLocaleString('en-IN')}) is more than the ${K.toLowerCase()} amount (₹${Math.round(a).toLocaleString('en-IN')})`;
    return '';
  },
  // search text, status tab ('all' | 'unset' | 'due' | 'paid') and person (0 = everyone)
  filter: (rows, q, st, person) => { const t = String(q || '').trim().toLowerCase();
    return rows.filter(r => (!person || +r.user_id === +person) && (st === 'all' || !st || COMM.status(r) === st)
      && (!t || [r.name, r.phone, r.district, r.user_name, r.p1_ref, r.p2_ref].join(' ').toLowerCase().includes(t))); },
};
if (typeof module !== 'undefined' && module.exports) module.exports = COMM;

const COMMQ = { q: '', st: {}, who: {} };
const COMM_ICON = { commission: 'users', incentive: 'award', mine: 'award' }, COMM_TC = { commission: 't-comm', incentive: 't-inc', mine: 't-inc' };
const cmDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const cmMoney = v => +v > 0 ? inr(v) : '<span class="mut">—</span>';

async function pgComm() {
  const seg = location.hash.split('/')[2], want = ['incentive', 'mine'].includes(seg) ? seg : 'commission';
  /* adm = managing the whole list (admin, or Incentive "Edit"); boss = the admin; a manager's own rows are read-only for them */
  const d = await api('comm', 'list', undefined, want === 'mine' ? '&kind=incentive&mine=1' : '&kind=' + want), kind = d.kind, adm = !!d.manage, boss = !!d.admin, W = COMM.words(kind, adm);
  $$('aside [data-sub]').forEach(a => a.classList.toggle('on', a.dataset.sub === 'comm-' + want)); const g = $('#feesg'); if (g) g.classList.add('open');
  $('#title').innerHTML = `<span class="ft t-fees"><i class="i i-coin"></i></span><span class="ttl">Finance</span><span class="mut ttls">› ${W.title}</span>`;
  if (!COMMQ.st[kind]) COMMQ.st[kind] = 'all';
  const people = (d.people || []).filter(p => p.kind === kind), who = () => adm ? +COMMQ.who[kind] || 0 : 0;
  const sub = adm ? (kind === 'commission' ? 'Customers brought in by Business Associates. Type the commission, record it paid in two parts, and choose who can see it.' : 'Customers of sales and other staff. Type the incentive, record it paid in two parts, and choose who can see it.' + (boss ? '' : ' Your own incentive is read-only here.'))
    : `Your customers the admin has shared with you, and the ${W.K.toLowerCase()} received for each.`;
  const tabs = [...[['all', 'All']], ...(adm ? [['unset', 'Not set']] : []), ['due', 'Due'], ['paid', W.done]];
  $('#main').innerHTML = `<div class="fhead"><span class="ft ftl ${COMM_TC[kind]}"><i class="i i-${COMM_ICON[kind]}"></i></span><div><h2>${W.title}</h2><div class="mut">${sub}</div></div><span class="sp"></span>
     <button class="btn sec" id="cmrf"><i class="i i-refresh"></i> Refresh</button>${adm ? '<button class="btn" id="cmadd"><i class="i i-plus"></i> Add customer</button>' : ''}</div>
   <div class="fstats" id="cmst"></div>
   <div class="bar fbar"><input id="fq" placeholder="Search by customer, phone, ${adm ? 'person, ' : ''}transaction ID…" value="${esc(COMMQ.q)}">
     ${adm ? `<select id="cmwho" class="cmn-who"><option value="0">${kind === 'commission' ? 'All Business Associates' : 'All staff'}</option>${people.map(p => `<option value="${p.id}" ${who() === p.id ? 'selected' : ''}>${esc(p.name)}${p.active ? '' : ' (inactive)'}</option>`).join('')}</select>` : ''}
     <div class="tabs" style="margin:0">${tabs.map(([k, l]) => `<button data-cst="${k}" class="${COMMQ.st[kind] === k ? 'on' : ''}">${l}</button>`).join('')}</div><span class="mut" id="fcnt"></span></div>
   <div class="card tw" style="padding:0"><table id="cmtb" class="ftb cmn-tb" data-min="${adm ? 1080 : 820}"></table></div>
   <p class="mut cmn-foot">${adm ? `Project cost and payments received are totals of all the customer’s projects (Tax bill payments). Switch on <b>Visible</b> to let the ${W.person.toLowerCase()} see a customer under <i>${W.K} received</i>; everything else here is only for ${boss ? 'you' : 'the admin and incentive managers'}.` : `Shown only for the customers the admin has shared with you.`}</p>`;

  const base = () => COMM.filter(d.rows, COMMQ.q, 'all', who());
  const stats = () => { const t = COMM.totals(base());
    $('#cmst').innerHTML = [['Customers', t.n, ''], [W.K + ' total', inr(t.amount), ''], [W.paid, inr(t.paid), 'g'], ['Balance due', inr(t.balance), t.balance > 0 ? 'o' : '']]
      .map(([l, v, c]) => `<div class="card fst ${c}"><b>${v}</b><span>${l}</span></div>`).join(''); };
  const part = (r, n) => +r['p' + n + '_amount'] > 0 ? `<div class="fval"><b class="cmn-amt">${inr(r['p' + n + '_amount'])}</b><small>${cmDate(r['p' + n + '_date'])}</small>${r['p' + n + '_ref'] ? `<small class="cmn-ref" title="Transaction ID">Txn ${esc(r['p' + n + '_ref'])}</small>` : ''}</div>` : '<span class="mut">—</span>';
  const bal = r => { const s = COMM.status(r); return s === 'paid' ? `<span class="pill g">${W.done}</span>` : s === 'due' ? `<b class="cmn-due">${inr(COMM.balance(r))}</b>` : '<span class="mut">Not set</span>'; };
  const ed = r => adm && !r.own; /* a manager cannot change their own incentive */
  const rowHtml = (r, i) => `<tr data-cid="${r.customer_id}" class="${ed(r) ? 'cmn-row' : ''}"><td class="mut">${i + 1}</td>
      <td><a href="#/customers/${r.customer_id}"><b>${esc(r.name)}</b></a>${r.phone ? `<div class="fsm">${esc(r.phone)}</div>` : ''}${r.district ? `<div class="fsm mut">${esc(r.district)}</div>` : ''}</td>
      ${adm ? `<td><b class="cmn-who-n">${esc(r.user_name)}</b>${r.own ? ' <span class="pill b">You</span>' : ''}${r.user_active ? '' : ' <span class="pill">inactive</span>'}${r.id ? '' : '<div class="fsm mut">customer owner</div>'}</td>` : ''}
      <td class="num">${cmMoney(r.cost)}</td><td class="num">${cmMoney(r.received)}</td>
      <td class="num">${ed(r) ? `<button class="famt" data-cme="${r.customer_id}" title="Edit">${+r.amount > 0 ? inr(r.amount) : '<span class="mut">Set</span>'}</button>` : cmMoney(r.amount)}</td>
      <td>${part(r, 1)}</td><td>${part(r, 2)}</td><td class="num">${bal(r)}</td>
      ${adm ? `<td><button class="fchk ${r.visible ? 'on g' : ''}" ${ed(r) ? `data-cmv="${r.customer_id}"` : 'disabled'} title="${r.visible ? 'Visible to ' + esc(r.user_name) + (ed(r) ? ' — click to hide' : '') : 'Hidden from ' + esc(r.user_name) + (ed(r) ? ' — click to show' : '')}"><i class="i i-check"></i></button></td>
      <td class="right">${ed(r) ? `<button class="ib" data-cme="${r.customer_id}" title="Edit"><i class="i i-pencil"></i></button>` : ''}</td>` : ''}</tr>`;
  const draw = () => { stats();
    const rows = COMM.filter(d.rows, COMMQ.q, COMMQ.st[kind], who()), tb = $('#cmtb');
    $('#fcnt').textContent = `${rows.length} customer${rows.length === 1 ? '' : 's'}`;
    $$('[data-cst]').forEach(b => { const k = b.dataset.cst, n = COMM.filter(d.rows, COMMQ.q, k, who()).length; b.textContent = `${tabs.find(t => t[0] === k)[1]} (${n})`; });
    tb.innerHTML = `<thead><tr><th style="width:44px">#</th><th>Customer</th>${adm ? `<th>${W.person}</th>` : ''}<th class="num">Project cost</th><th class="num">Payments received</th><th class="num">${W.K}</th><th>Part 1</th><th>Part 2</th><th class="num">Balance due</th>${adm ? '<th style="width:70px">Visible</th><th style="width:48px"></th>' : ''}</tr></thead>
      <tbody>${rows.slice(0, LAZY_FIRST).map(rowHtml).join('') || `<tr><td colspan="${adm ? 11 : 8}" class="mut" style="text-align:center;padding:28px">${d.rows.length ? 'Nothing matches.' : adm ? `No customers are owned by ${kind === 'commission' ? 'a Business Associate' : 'staff'} yet.` : 'Nothing shared with you yet.'}</td></tr>`}</tbody>`;
    let n = Math.min(rows.length, LAZY_FIRST);
    lazyMore(tb, step => { const next = rows.slice(n, n + step); tb.tBodies[0].insertAdjacentHTML('beforeend', next.map((r, j) => rowHtml(r, n + j)).join('')); n += next.length; return n < rows.length; }, n < rows.length);
  };
  const drawSoon = debounce(draw, 120);
  $('#fq').oninput = e => { COMMQ.q = e.target.value; drawSoon(); };
  $$('[data-cst]').forEach(b => b.onclick = () => { COMMQ.st[kind] = b.dataset.cst; $$('[data-cst]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  if ($('#cmwho')) $('#cmwho').onchange = e => { COMMQ.who[kind] = +e.target.value; draw(); };
  $('#cmrf').onclick = () => pgComm();
  const put = row => { const i = d.rows.findIndex(x => x.customer_id === row.customer_id);
    if (row.kind !== kind) { if (i >= 0) d.rows.splice(i, 1); toast(`${row.name} moved to ${COMM.words(row.kind, true).K}`); }
    else if (i >= 0) d.rows[i] = row; else d.rows.unshift(row);
    draw(); };
  if (adm) {
    $('#cmtb').onclick = async e => {
      const v = e.target.closest('[data-cmv]');
      if (v) { const r = d.rows.find(x => x.customer_id === +v.dataset.cmv); v.disabled = true;
        try { const j = await api('comm', 'save', { customer_id: r.customer_id, visible: r.visible ? 0 : 1 }); toast(j.row.visible ? `Visible to ${j.row.user_name}` : `Hidden from ${j.row.user_name}`); put(j.row); } catch (x) { v.disabled = false; } return; }
      const eb = e.target.closest('[data-cme]'), tr = e.target.closest('tr.cmn-row');
      if (eb || (tr && !e.target.closest('a,button,input,select'))) commEdit(d.rows.find(x => x.customer_id === +(eb ? eb.dataset.cme : tr.dataset.cid)), d.people, put);
    };
    $('#cmadd').onclick = () => commPick(d.people, kind, put);
  }
  draw();
}

// admin / incentive manager: amount, two part payments with transaction IDs, person, note and visibility for one customer
function commEdit(r, people, done) {
  const opts = k => people.filter(p => p.kind === k && (ME.role === 'admin' || p.id !== ME.id)).map(p => `<option value="${p.id}" ${+r.user_id === p.id ? 'selected' : ''}>${esc(p.name)}${p.active ? '' : ' (inactive)'}</option>`).join('');
  const prt = n => `<div class="cmn-part"><div class="cmn-pn">Part ${n}</div>
      <div><label>Amount (₹)</label><input id="cmp${n}a" inputmode="decimal" value="${+r['p' + n + '_amount'] || ''}" placeholder="0"></div>
      <div><label>Paid on</label><input type="date" id="cmp${n}d" value="${esc(r['p' + n + '_date'] || '')}" max="${today()}"></div>
      <div><label>Transaction ID</label><input id="cmp${n}r" value="${esc(r['p' + n + '_ref'] || '')}" maxlength="80" placeholder="UTR / UPI / cheque no."></div></div>`;
  const m = modal(`<h2 style="margin-top:0" id="cmh"></h2><p class="mut" style="margin-top:-6px"><b>${esc(r.name)}</b>${r.cost ? ' · Project cost ' + inr(r.cost) : ''}${r.received ? ' · Received ' + inr(r.received) : ''}</p>
    <div class="two"><div><label>Paid to</label><select id="cmu">${r.user_id ? '' : '<option value="">Choose…</option>'}${[['commission', 'Business Associates — commission'], ['incentive', 'Staff — incentive']].filter(([k]) => people.some(p => p.kind === k)).map(([k, l]) => `<optgroup label="${l}">${opts(k)}</optgroup>`).join('')}</select></div>
      <div><label id="cmal"></label><input id="cma" inputmode="decimal" value="${+r.amount || ''}" placeholder="0"></div></div>
    ${prt(1)}${prt(2)}
    <div class="cmn-sum" id="cmsum"></div>
    <label class="cmn-vis"><input type="checkbox" id="cmv" ${r.visible ? 'checked' : ''}> <span id="cmvl"></span></label>
    <label>Note <span class="mut">(only you see this)</span></label><textarea id="cmn" rows="2" maxlength="500" ${SPELL}>${esc(r.note || '')}</textarea>
    <div class="err" id="cme"></div>
    <div class="bar" style="margin-top:6px"><button class="btn" id="cms">Save</button><button class="btn sec" id="cmc">Cancel</button></div>`);
  const f = () => ({ user_id: $('#cmu', m).value, amount: $('#cma', m).value, p1_amount: $('#cmp1a', m).value, p1_date: $('#cmp1d', m).value, p1_ref: $('#cmp1r', m).value.trim(),
    p2_amount: $('#cmp2a', m).value, p2_date: $('#cmp2d', m).value, p2_ref: $('#cmp2r', m).value.trim(), visible: $('#cmv', m).checked ? 1 : 0, note: $('#cmn', m).value });
  const upd = () => { const p = people.find(x => x.id === +$('#cmu', m).value), W = COMM.words(p ? p.kind : 'commission', true), o = f(), a = COMM.num(o.amount), paid = COMM.num(o.p1_amount) + COMM.num(o.p2_amount);
    $('#cmh', m).textContent = W.K; $('#cmal', m).textContent = W.K + ' amount (₹)';
    $('#cmvl', m).textContent = p ? `Visible to ${p.name} — they see this customer under “${W.K} received”` : 'Visible to the person it is paid to';
    $('#cmsum', m).innerHTML = a > 0 && paid >= 0 ? `Paid <b>${inr(paid)}</b> of <b>${inr(a)}</b> · Balance <b class="${a - paid > 0.005 ? 'cmn-due' : ''}">${inr(Math.max(0, a - paid))}</b>` : '';
    $('#cme', m).textContent = ''; };
  [1, 2].forEach(n => $(`#cmp${n}a`, m).addEventListener('input', () => { const d = $(`#cmp${n}d`, m); if (COMM.num($(`#cmp${n}a`, m).value) > 0 && !d.value) d.value = today(); }));
  m.addEventListener('input', upd); m.addEventListener('change', upd); upd();
  $('#cmc', m).onclick = () => m.remove();
  $('#cms', m).onclick = async () => { const o = f(), p = people.find(x => x.id === +o.user_id);
    if (!p) { $('#cme', m).textContent = 'Choose who this is paid to'; return; }
    const bad = COMM.check(o, COMM.words(p.kind, true).K); if (bad) { $('#cme', m).textContent = bad; return; }
    const b = $('#cms', m); b.disabled = true;
    try { const j = await api('comm', 'save', { customer_id: r.customer_id, ...o, user_id: +o.user_id }); m.remove(); toast(`${COMM.words(j.row.kind, true).K} saved for ${j.row.name}`); done(j.row); } catch (x) { b.disabled = false; } };
}

// admin / incentive manager: a customer that is on neither list (no owner, or owned by an admin)
async function commPick(people, kind, done) {
  const cs = await api('comm', 'candidates');
  const m = modal(`<h2 style="margin-top:0">Add a customer</h2><p class="mut" style="margin-top:-6px">Customers owned by a Business Associate or staff member are listed already. Pick one that has no such owner.</p>
    <input id="cmq" placeholder="Search customers…"><div class="fcl2" id="cml"></div><div class="bar" style="margin-top:12px"><button class="btn sec" id="cmx">Cancel</button></div>`);
  const dr = () => { const t = $('#cmq', m).value.toLowerCase(), L = cs.filter(c => !t || [c.name, c.phone, c.district].join(' ').toLowerCase().includes(t)).slice(0, 200);
    $('#cml', m).innerHTML = L.map(c => `<button type="button" class="fci cmn-pick" data-pk="${c.id}"><span><b>${esc(c.name)}</b><small class="mut">${esc([c.phone, c.district].filter(Boolean).join(' · '))}</small></span></button>`).join('') || '<p class="mut">No other customers.</p>'; };
  $('#cmq', m).oninput = dr; dr(); $('#cmx', m).onclick = () => m.remove();
  $('#cml', m).onclick = e => { const b = e.target.closest('[data-pk]'); if (!b) return; const c = cs.find(x => x.id === +b.dataset.pk); m.remove();
    commEdit({ customer_id: c.id, name: c.name, user_id: 0, amount: 0, p1_amount: 0, p2_amount: 0, visible: 0, note: '', cost: 0, received: 0 }, people, done); };
}
