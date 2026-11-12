// Finance › Commission (customers owned by a Business Associate) and Incentive (customers owned by other staff).
// Commission: the admin types the amount. Incentive: staff customers won from the scheme's start are approved by the admin with
// their lead type (Own / Office / Meta), then the amount is calculated: own leads ₹3,000/kW; Meta / Office leads by the person's
// milestone in that month (1st–2nd ₹1,000/kW, 3rd–5th ₹2,000/kW, 6th on ₹3,000/kW). Both are paid in two parts with transaction IDs.
// Incentive "Edit" (Settings → User access) manages the staff incentives too, never one's own and never approving.
// A BA / staff member sees only what was shared with them, as "Commission received" / "Incentive received", plus the milestone bar.
// The rules in COMM are plain functions (Node-tested in tests/comm.test.js); the screen code below runs only in the browser.
const COMM = {
  num: v => { const s = String(v ?? '').replace(/[,₹\s]/g, ''); return s === '' ? 0 : +s; },
  paid: r => (+r.p1_amount || 0) + (+r.p2_amount || 0),
  balance: r => Math.max(0, (+r.amount || 0) - COMM.paid(r)),
  LT: { own: 'Own lead', office: 'Office', meta: 'Meta' },
  // 'approve' waiting for the admin · 'no' not eligible · 'unset' no amount yet · 'due' something left to pay · 'paid' fully paid
  status: r => r.pending ? 'approve' : r.appr === 'no' ? 'no' : !(+r.amount > 0) ? 'unset' : COMM.paid(r) + 0.005 >= +r.amount ? 'paid' : 'due',
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
  // search text, status tab ('all' | 'approve' | 'unset' | 'due' | 'paid') and person (0 = everyone)
  filter: (rows, q, st, person) => { const t = String(q || '').trim().toLowerCase();
    return rows.filter(r => (!person || +r.user_id === +person) && (st === 'all' || !st || COMM.status(r) === st)
      && (!t || [r.name, r.phone, r.district, r.user_name, r.p1_ref, r.p2_ref, COMM.LT[r.lead_type]].join(' ').toLowerCase().includes(t))); },
  // milestone steps, tiers = [[last project of the step | null, rate per kW], …]: what the k-th Meta / Office project of the month earns
  rate: (k, tiers) => (tiers.find(t => t[0] === null || k <= t[0]) || tiers[tiers.length - 1])[1],
  // after n approved projects: what the next one earns, the next better rate and how many more projects until it (up 0 = top step)
  step: (n, tiers) => { const next = COMM.rate(n + 1, tiers); let from = 1;
    for (const [u, r] of tiers) { if (r > next) return { next, up: r, more: from - (n + 1) }; from = (u === null ? Infinity : u) + 1; }
    return { next, up: 0, more: 0 }; },
  // the bar: one group of numbered cells per step; the last step is drawn up to `cap`
  groups: (tiers, cap = 10) => { let from = 1; return tiers.map(([u, r]) => { const g = { from, to: u === null ? Math.max(cap, from) : u, rate: r }; from = g.to + 1; return g; }); },
};
if (typeof module !== 'undefined' && module.exports) module.exports = COMM;

const COMMQ = { q: '', st: {}, who: {}, month: '' };
const COMM_ICON = { commission: 'users', incentive: 'award', mine: 'award' }, COMM_TC = { commission: 't-comm', incentive: 't-inc', mine: 't-inc' };
const cmDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const cmMoney = v => +v > 0 ? inr(v) : '<span class="mut">—</span>';
const cmYm = ym => { const [y, m] = String(ym || '').split('-').map(Number); return y && m ? new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : ''; };
const cmShift = (ym, d) => { const [y, m] = ym.split('-').map(Number), t = new Date(y, m - 1 + d, 1); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0'); };
const cmRs = n => '₹' + Math.round(+n || 0).toLocaleString('en-IN');

async function pgComm() {
  const seg = location.hash.split('/')[2], want = ['incentive', 'mine'].includes(seg) ? seg : 'commission';
  /* adm = managing the whole list (admin, or Incentive "Edit"); boss = the admin; a manager's own rows are read-only for them */
  const d = await api('comm', 'list', undefined, want === 'mine' ? '&kind=incentive&mine=1' : '&kind=' + want), kind = d.kind, adm = !!d.manage, boss = !!d.admin, W = COMM.words(kind, adm), inc = kind === 'incentive';
  $$('aside [data-sub]').forEach(a => a.classList.toggle('on', a.dataset.sub === 'comm-' + want)); const g = $('#feesg'); if (g) g.classList.add('open');
  $('#title').innerHTML = `<span class="ft t-fees"><i class="i i-coin"></i></span><span class="ttl">Finance</span><span class="mut ttls">› ${W.title}</span>`;
  if (!COMMQ.st[kind]) COMMQ.st[kind] = inc && boss && d.rows.some(r => r.pending) ? 'approve' : 'all';
  const people = (d.people || []).filter(p => p.kind === kind), who = () => adm ? +COMMQ.who[kind] || 0 : 0;
  const sub = adm ? (kind === 'commission' ? 'Customers brought in by Business Associates. Type the commission, record it paid in two parts, and choose who can see it.'
    : (boss ? 'Approve each staff customer with its lead type; the incentive is then calculated (own lead ₹3,000/kW, Meta / Office by the monthly milestone). Record it paid in two parts.' : 'Staff incentives. Customers waiting for the admin’s approval cannot be paid yet. Your own incentive is read-only here.'))
    : `Your customers the admin has approved and shared with you, and the ${W.K.toLowerCase()} received for each.`;
  const tabs = [['all', 'All'], ...(adm && inc ? [['approve', boss ? 'To approve' : 'Waiting approval']] : []), ...(adm ? [['unset', 'Not set']] : []), ['due', 'Due'], ['paid', W.done]];
  if (!tabs.some(t => t[0] === COMMQ.st[kind])) COMMQ.st[kind] = 'all';
  $('#main').innerHTML = `<div class="fhead"><span class="ft ftl ${COMM_TC[kind]}"><i class="i i-${COMM_ICON[kind]}"></i></span><div><h2>${W.title}</h2><div class="mut">${sub}</div></div><span class="sp"></span>
     <button class="btn sec" id="cmrf"><i class="i i-refresh"></i> Refresh</button>${adm ? '<button class="btn" id="cmadd"><i class="i i-plus"></i> Add customer</button>' : ''}</div>
   ${inc ? '<div id="cmms"></div>' : ''}
   <div class="fstats" id="cmst"></div>
   <div class="bar fbar"><input id="fq" placeholder="Search by customer, phone, ${adm ? 'person, ' : ''}transaction ID…" value="${esc(COMMQ.q)}">
     ${adm ? `<select id="cmwho" class="cmn-who"><option value="0">${kind === 'commission' ? 'All Business Associates' : 'All staff'}</option>${people.map(p => `<option value="${p.id}" ${who() === p.id ? 'selected' : ''}>${esc(p.name)}${p.active ? '' : ' (inactive)'}</option>`).join('')}</select>` : ''}
     <div class="tabs" style="margin:0">${tabs.map(([k, l]) => `<button data-cst="${k}" class="${COMMQ.st[kind] === k ? 'on' : ''}">${l}</button>`).join('')}</div><span class="mut" id="fcnt"></span></div>
   <div class="card tw" style="padding:0"><table id="cmtb" class="ftb cmn-tb" data-min="${adm ? 1120 : 860}"></table></div>
   <p class="mut cmn-foot">${adm ? `Project cost and payments received are totals of all the customer’s projects (Tax bill payments)${inc ? '; kW comes from the projects, else the lead' : ''}. A calculated incentive follows changes (kW, lead type, order in the month) until part 1 is paid. Switch on <b>Visible</b> to let the ${W.person.toLowerCase()} see a customer under <i>${W.K} received</i>; everything else here is only for ${boss ? 'you' : 'the admin and incentive managers'}.` : `Shown only for the customers the admin has approved and shared with you.`}</p>`;

  const ms = () => { const box = $('#cmms'); if (!box) return;
    if (!adm) return commMilestone(box, 0);
    if (who()) return commMilestone(box, who());
    box.innerHTML = `<p class="mut cmn-mshint"><i class="i i-award"></i> Choose a staff member above to see their milestone for the month.</p>`; };
  const base = () => COMM.filter(d.rows, COMMQ.q, 'all', who());
  const stats = () => { const t = COMM.totals(base()), wait = base().filter(r => r.pending).length;
    $('#cmst').innerHTML = [['Customers', t.n, ''], ...(adm && inc ? [[boss ? 'To approve' : 'Waiting approval', wait, wait ? 'b' : '']] : []), [W.K + ' total', inr(t.amount), ''], [W.paid, inr(t.paid), 'g'], ['Balance due', inr(t.balance), t.balance > 0 ? 'o' : '']]
      .map(([l, v, c]) => `<div class="card fst ${c}"><b>${v}</b><span>${l}</span></div>`).join(''); };
  const part = (r, n) => +r['p' + n + '_amount'] > 0 ? `<div class="fval"><b class="cmn-amt">${inr(r['p' + n + '_amount'])}</b><small>${cmDate(r['p' + n + '_date'])}</small>${r['p' + n + '_ref'] ? `<small class="cmn-ref" title="Transaction ID">Txn ${esc(r['p' + n + '_ref'])}</small>` : ''}</div>` : '<span class="mut">—</span>';
  const bal = r => { const s = COMM.status(r); return s === 'paid' ? `<span class="pill g">${W.done}</span>` : s === 'due' ? `<b class="cmn-due">${inr(COMM.balance(r))}</b>` : s === 'unset' ? '<span class="mut">Not set</span>' : '<span class="mut">—</span>'; };
  const ed = r => adm && !r.own && !r.pending && r.appr !== 'no'; /* a manager cannot change their own incentive; waiting / not eligible ones go through approval */
  const apr = r => boss && (r.pending || r.appr === 'no');
  const amountCell = r => {
    if (r.pending) return boss ? `<button class="btn sm" data-cma="${r.customer_id}">Approve</button>` : '<span class="mut">Waiting for approval</span>';
    if (r.appr === 'no') return boss ? `<button class="famt" data-cma="${r.customer_id}" title="Change the decision"><span class="pill">Not eligible</span></button>` : '<span class="pill">Not eligible</span>';
    const note = r.scheme && r.auto && r.calc ? `<div class="cmn-calc">${esc(r.calc)}</div>` : r.scheme && !r.auto && +r.amount > 0 ? '<div class="cmn-calc">typed amount</div>' : '';
    return (ed(r) ? `<button class="famt" data-cme="${r.customer_id}" title="Edit">${+r.amount > 0 ? inr(r.amount) : '<span class="mut">Set</span>'}</button>` : cmMoney(r.amount)) + note; };
  const rowHtml = (r, i) => `<tr data-cid="${r.customer_id}" class="${ed(r) || apr(r) ? 'cmn-row' : ''}${r.pending ? ' cmn-wait' : ''}"><td class="mut">${i + 1}</td>
      <td><a href="#/customers/${r.customer_id}"><b>${esc(r.name)}</b></a>${r.phone ? `<div class="fsm">${esc(r.phone)}</div>` : ''}${inc ? `<div class="fsm cmn-lt">${ltBadge(r.lead_type)}${r.ym ? `<span class="mut">won ${cmYm(r.ym)}</span>` : ''}${+r.kw ? `<span class="mut">· ${+r.kw} kW</span>` : ''}</div>` : r.district ? `<div class="fsm mut">${esc(r.district)}</div>` : ''}</td>
      ${adm ? `<td><b class="cmn-who-n">${esc(r.user_name)}</b>${r.own ? ' <span class="pill b">You</span>' : ''}${r.user_active ? '' : ' <span class="pill">inactive</span>'}${r.id ? '' : '<div class="fsm mut">customer owner</div>'}</td>` : ''}
      <td class="num">${cmMoney(r.cost)}</td><td class="num">${cmMoney(r.received)}</td>
      <td class="num">${amountCell(r)}</td>
      <td>${part(r, 1)}</td><td>${part(r, 2)}</td><td class="num">${bal(r)}</td>
      ${adm ? `<td><button class="fchk ${r.visible ? 'on g' : ''}" ${ed(r) ? `data-cmv="${r.customer_id}"` : 'disabled'} title="${r.visible ? 'Visible to ' + esc(r.user_name) + (ed(r) ? ' — click to hide' : '') : 'Hidden from ' + esc(r.user_name) + (ed(r) ? ' — click to show' : '')}"><i class="i i-check"></i></button></td>
      <td class="right">${ed(r) ? `<button class="ib" data-cme="${r.customer_id}" title="Edit"><i class="i i-pencil"></i></button>` : apr(r) ? `<button class="ib" data-cma="${r.customer_id}" title="Approve"><i class="i i-check"></i></button>` : ''}</td>` : ''}</tr>`;
  const draw = () => { stats();
    const rows = COMM.filter(d.rows, COMMQ.q, COMMQ.st[kind], who()), tb = $('#cmtb');
    $('#fcnt').textContent = `${rows.length} customer${rows.length === 1 ? '' : 's'}`;
    $$('[data-cst]').forEach(b => { const k = b.dataset.cst, n = COMM.filter(d.rows, COMMQ.q, k, who()).length; b.textContent = `${tabs.find(t => t[0] === k)[1]} (${n})`; });
    tb.innerHTML = `<thead><tr><th style="width:44px">#</th><th>Customer</th>${adm ? `<th>${W.person}</th>` : ''}<th class="num">Project cost</th><th class="num">Payments received</th><th class="num">${W.K}</th><th>Part 1</th><th>Part 2</th><th class="num">Balance due</th>${adm ? '<th style="width:70px">Visible</th><th style="width:48px"></th>' : ''}</tr></thead>
      <tbody>${rows.slice(0, LAZY_FIRST).map(rowHtml).join('') || `<tr><td colspan="${adm ? 11 : 8}" class="mut" style="text-align:center;padding:28px">${d.rows.length ? (COMMQ.st[kind] === 'approve' ? 'Nothing waiting for approval.' : 'Nothing matches.') : adm ? `No customers are owned by ${kind === 'commission' ? 'a Business Associate' : 'staff'} yet.` : 'Nothing shared with you yet.'}</td></tr>`}</tbody>`;
    let n = Math.min(rows.length, LAZY_FIRST);
    lazyMore(tb, step => { const next = rows.slice(n, n + step); tb.tBodies[0].insertAdjacentHTML('beforeend', next.map((r, j) => rowHtml(r, n + j)).join('')); n += next.length; return n < rows.length; }, n < rows.length);
  };
  const drawSoon = debounce(draw, 120);
  $('#fq').oninput = e => { COMMQ.q = e.target.value; drawSoon(); };
  $$('[data-cst]').forEach(b => b.onclick = () => { COMMQ.st[kind] = b.dataset.cst; $$('[data-cst]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  if ($('#cmwho')) $('#cmwho').onchange = e => { COMMQ.who[kind] = +e.target.value; draw(); ms(); };
  $('#cmrf').onclick = () => pgComm();
  const put = row => { const i = d.rows.findIndex(x => x.customer_id === row.customer_id);
    if (row.kind !== kind) { if (i >= 0) d.rows.splice(i, 1); toast(`${row.name} moved to ${COMM.words(row.kind, true).K}`); }
    else if (i >= 0) d.rows[i] = { ...d.rows[i], ...row }; else d.rows.unshift(row);
    draw(); };
  const reload = () => pgComm(); // an approval can change the other incentives of that person's month
  if (adm) {
    $('#cmtb').onclick = async e => {
      const v = e.target.closest('[data-cmv]');
      if (v) { const r = d.rows.find(x => x.customer_id === +v.dataset.cmv); v.disabled = true;
        try { const j = await api('comm', 'save', { customer_id: r.customer_id, visible: r.visible ? 0 : 1 }); toast(j.row.visible ? `Visible to ${j.row.user_name}` : `Hidden from ${j.row.user_name}`); put(j.row); } catch (x) { v.disabled = false; } return; }
      const ab = e.target.closest('[data-cma]');
      if (ab) return commApprove(d.rows.find(x => x.customer_id === +ab.dataset.cma), d.people, reload);
      const eb = e.target.closest('[data-cme]'), tr = e.target.closest('tr.cmn-row');
      if (!eb && !(tr && !e.target.closest('a,button,input,select'))) return;
      const r = d.rows.find(x => x.customer_id === +(eb ? eb.dataset.cme : tr.dataset.cid));
      if (apr(r)) return commApprove(r, d.people, reload);
      commEdit(r, d.people, row => r.scheme ? reload() : put(row));
    };
    $('#cmadd').onclick = () => commPick(d, put, reload);
  }
  draw(); ms();
}

// one person's month: the steps as numbered cells, filled for every approved Meta / Office project, and what the next one earns
async function commMilestone(box, uid) {
  const cur = today().slice(0, 7); if (!COMMQ.month) COMMQ.month = cur;
  let m; try { m = await api('comm', 'milestone', undefined, `&month=${COMMQ.month}${uid ? '&user_id=' + uid : ''}`); } catch (e) { box.innerHTML = ''; return; }
  const head = `<div class="cmn-msh"><i class="i i-award"></i><b>${uid ? esc(m.name) + ' · ' : ''}Monthly milestone</b><span class="sp"></span>
    <button class="ib" data-msm="-1" title="Previous month"><i class="i i-chev cmn-left"></i></button><span class="cmn-msm">${esc(m.label)}</span><button class="ib" data-msm="1" title="Next month" ${COMMQ.month >= cur ? 'disabled' : ''}><i class="i i-chev"></i></button></div>`;
  if (!m.scheme) box.innerHTML = `<div class="card cmn-ms">${head}<p class="mut" style="margin:8px 0 0">Milestone incentives start in ${esc(m.start_label)}.</p></div>`;
  else {
    const n = m.company, past = m.month < cur, s = COMM.step(n, m.tiers), G = COMM.groups(m.tiers, Math.max(10, n));
    const cells = G.map((g, gi) => `<div class="cmn-grp cmn-t${gi + 1}" style="flex:${g.to - g.from + 1}"><div class="cmn-cells">${Array.from({ length: g.to - g.from + 1 }, (_, k) => { const i = g.from + k;
        return `<span class="cmn-cell${i <= n ? ' on' : ''}${!past && i === n + 1 ? ' nx' : ''}" title="Project ${i}: ₹${g.rate.toLocaleString('en-IN')}/kW">${i <= n ? '<i class="i i-check"></i>' : i}</span>`; }).join('')}</div>
      <small>${g.from === g.to ? g.from : g.from + '–' + (g === G[G.length - 1] && m.tiers[m.tiers.length - 1][0] === null ? g.to + '+' : g.to)} · ${cmRs(g.rate)}/kW</small></div>`).join('');
    const reached = n ? COMM.rate(n, m.tiers) : 0;
    const msg = past ? (n ? `Month closed with ${n} Meta / Office project${n === 1 ? '' : 's'}, up to the ${cmRs(reached)}/kW step.` : 'No approved Meta / Office project in this month.')
      : s.up ? `Your next project earns <b>${cmRs(s.next)}/kW</b>. ${s.more} more project${s.more === 1 ? '' : 's'} to unlock <b>${cmRs(s.up)}/kW</b>.` : `Top step reached: every Meta / Office project this month earns <b>${cmRs(s.next)}/kW</b>.`;
    box.innerHTML = `<div class="card cmn-ms">${head}
      <div class="cmn-msbig"><div><b>${n}</b><span>Meta / Office project${n === 1 ? '' : 's'} approved</span></div>
        <div><b>${past ? (reached ? cmRs(reached) + '/kW' : '—') : cmRs(s.next) + '/kW'}</b><span>${past ? 'step reached' : 'your next project earns'}</span></div>
        <div><b>${inr(m.earned)}</b><span>incentive in ${esc(m.label)}</span></div></div>
      <div class="cmn-bar">${cells}</div>
      <p class="cmn-msmsg">${msg}</p>
      <p class="mut cmn-msfoot">Own leads: ${m.own} project${m.own === 1 ? '' : 's'} · ${inr(m.own_amt)} (${cmRs(m.own_rate)}/kW, not counted in the steps)${m.pending ? ` · <b>${m.pending}</b> waiting for the admin’s approval` : ''}</p></div>`;
  }
  $$('[data-msm]', box).forEach(b => b.onclick = () => { COMMQ.month = cmShift(COMMQ.month, +b.dataset.msm); commMilestone(box, uid); });
}

// admin: a staff customer is eligible (with its lead type, which decides the rate) or not
function commApprove(r, people, done) {
  const staff = people.filter(p => p.kind === 'incentive');
  /* Meta only comes from a lead: a customer added directly is Own lead or Office */
  const types = Object.entries(COMM.LT).filter(([k]) => k !== 'meta' || +r.from_lead), cur = types.some(([k]) => k === r.lead_type) ? r.lead_type : 'office';
  const m = modal(`<h2 style="margin-top:0">Approve incentive</h2><p class="mut" style="margin-top:-6px"><b>${esc(r.name)}</b>${r.ym ? ' · won ' + cmYm(r.ym) : ''}${+r.kw ? ' · ' + (+r.kw) + ' kW' : ' · kW not set yet'}${+r.from_lead ? '' : ' · added directly, not from a lead'}</p>
    <div class="two"><div><label>Staff member</label><select id="apu">${r.user_id ? '' : '<option value="">Choose…</option>'}${staff.map(p => `<option value="${p.id}" ${+r.user_id === p.id ? 'selected' : ''}>${esc(p.name)}${p.active ? '' : ' (inactive)'}</option>`).join('')}</select></div>
      <div><label>Lead type</label><select id="apt">${types.map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="cmn-sum" id="apv"></div>
    <label class="cmn-vis"><input type="checkbox" id="apvis" ${r.appr === 'no' && !r.visible ? '' : 'checked'}> <span id="apvl"></span></label>
    <p class="mut" style="font-size:12px;margin:6px 0 0">Own lead: ₹3,000 per kW. Meta / Office lead: by the staff member’s milestone in the month the customer was won. Only approved customers get an incentive.</p>
    <div class="err" id="ape"></div>
    <div class="bar" style="margin-top:8px"><button class="btn" id="apok">Approve</button><button class="btn sec" id="apno">Not eligible</button><span class="sp"></span><button class="btn sec" id="apx">Cancel</button></div>`);
  const upd = () => { const t = $('#apt', m).value, p = staff.find(x => x.id === +$('#apu', m).value), pv = r.preview;
    $('#apv', m).innerHTML = pv && p && +r.user_id === p.id ? `Incentive: <b>${inr(t === 'own' ? pv.own : pv.company)}</b> <span class="mut">(${esc(t === 'own' ? pv.own_txt : pv.company_txt)})</span>` : 'The incentive is worked out when you approve.';
    $('#apvl', m).textContent = p ? `Visible to ${p.name} under “Incentive received”` : 'Visible to the staff member'; $('#ape', m).textContent = ''; };
  m.addEventListener('change', upd); upd();
  $('#apx', m).onclick = () => m.remove();
  const send = async ok => { const uid = +$('#apu', m).value; if (!uid) { $('#ape', m).textContent = 'Choose the staff member'; return; }
    if (!ok && !confirm(`Mark ${r.name} as not eligible for an incentive?`)) return;
    $$('button', m).forEach(b => b.disabled = true);
    try { const j = await api('comm', 'approve', { customer_id: r.customer_id, user_id: uid, lead_type: $('#apt', m).value, ok: ok ? 1 : 0, visible: ok && $('#apvis', m).checked ? 1 : 0 });
      m.remove(); toast(ok ? `Approved: ${j.row.name} · ${inr(j.row.amount)}` : `${j.row.name}: not eligible`); done(j.row); }
    catch (x) { $$('button', m).forEach(b => b.disabled = false); } };
  $('#apok', m).onclick = () => send(true); $('#apno', m).onclick = () => send(false);
}

// admin / incentive manager: amount (typed, or calculated for the milestone scheme), two part payments, person, note, visibility
function commEdit(r, people, done) {
  const opts = k => people.filter(p => p.kind === k && (ME.role === 'admin' || p.id !== ME.id)).map(p => `<option value="${p.id}" ${+r.user_id === p.id ? 'selected' : ''}>${esc(p.name)}${p.active ? '' : ' (inactive)'}</option>`).join('');
  const prt = n => `<div class="cmn-part"><div class="cmn-pn">Part ${n}</div>
      <div><label>Amount (₹)</label><input id="cmp${n}a" inputmode="decimal" value="${+r['p' + n + '_amount'] || ''}" placeholder="0"></div>
      <div><label>Paid on</label><input type="date" id="cmp${n}d" value="${esc(r['p' + n + '_date'] || '')}" max="${today()}"></div>
      <div><label>Transaction ID</label><input id="cmp${n}r" value="${esc(r['p' + n + '_ref'] || '')}" maxlength="80" placeholder="UTR / UPI / cheque no."></div></div>`;
  const sch = !!r.scheme;
  const m = modal(`<h2 style="margin-top:0" id="cmh"></h2><p class="mut" style="margin-top:-6px"><b>${esc(r.name)}</b>${sch ? ' · ' + COMM.LT[r.lead_type] + (r.ym ? ' · won ' + cmYm(r.ym) : '') : ''}${r.cost ? ' · Project cost ' + inr(r.cost) : ''}${r.received ? ' · Received ' + inr(r.received) : ''}</p>
    <div class="two"><div><label>Paid to</label><select id="cmu">${r.user_id ? '' : '<option value="">Choose…</option>'}${[['commission', 'Business Associates — commission'], ['incentive', 'Staff — incentive']].filter(([k]) => people.some(p => p.kind === k)).map(([k, l]) => `<optgroup label="${l}">${opts(k)}</optgroup>`).join('')}</select></div>
      <div><label id="cmal"></label><input id="cma" inputmode="decimal" value="${+r.amount || ''}" placeholder="0"></div></div>
    ${sch ? `<label class="cmn-vis"><input type="checkbox" id="cmauto" ${r.auto ? 'checked' : ''}> Calculated amount <span class="mut" id="cmcalc">${esc(r.auto && r.calc ? r.calc : 'worked out when you save')}</span></label>` : ''}
    ${prt(1)}${prt(2)}
    <div class="cmn-sum" id="cmsum"></div>
    <label class="cmn-vis"><input type="checkbox" id="cmv" ${r.visible ? 'checked' : ''}> <span id="cmvl"></span></label>
    <label>Note <span class="mut">(only you see this)</span></label><textarea id="cmn" rows="2" maxlength="500" ${SPELL}>${esc(r.note || '')}</textarea>
    <div class="err" id="cme"></div>
    <div class="bar" style="margin-top:6px"><button class="btn" id="cms">Save</button><button class="btn sec" id="cmc">Cancel</button></div>`);
  const auto = () => !!($('#cmauto', m) && $('#cmauto', m).checked);
  const f = () => ({ user_id: $('#cmu', m).value, ...(auto() ? { auto: 1 } : { amount: $('#cma', m).value, ...(sch ? { auto: 0 } : {}) }), p1_amount: $('#cmp1a', m).value, p1_date: $('#cmp1d', m).value, p1_ref: $('#cmp1r', m).value.trim(),
    p2_amount: $('#cmp2a', m).value, p2_date: $('#cmp2d', m).value, p2_ref: $('#cmp2r', m).value.trim(), visible: $('#cmv', m).checked ? 1 : 0, note: $('#cmn', m).value });
  const upd = () => { const p = people.find(x => x.id === +$('#cmu', m).value), W = COMM.words(p ? p.kind : 'commission', true), o = f(), a = auto() ? (r.auto ? +r.amount : NaN) : COMM.num(o.amount), paid = COMM.num(o.p1_amount) + COMM.num(o.p2_amount);
    $('#cma', m).disabled = auto(); if (auto() && r.auto) $('#cma', m).value = +r.amount || '';
    $('#cmh', m).textContent = W.K; $('#cmal', m).textContent = W.K + ' amount (₹)';
    $('#cmvl', m).textContent = p ? `Visible to ${p.name} — they see this customer under “${W.K} received”` : 'Visible to the person it is paid to';
    $('#cmsum', m).innerHTML = a > 0 && paid >= 0 ? `Paid <b>${inr(paid)}</b> of <b>${inr(a)}</b> · Balance <b class="${a - paid > 0.005 ? 'cmn-due' : ''}">${inr(Math.max(0, a - paid))}</b>` : '';
    $('#cme', m).textContent = ''; };
  [1, 2].forEach(n => $(`#cmp${n}a`, m).addEventListener('input', () => { const d = $(`#cmp${n}d`, m); if (COMM.num($(`#cmp${n}a`, m).value) > 0 && !d.value) d.value = today(); }));
  m.addEventListener('input', upd); m.addEventListener('change', upd); upd();
  $('#cmc', m).onclick = () => m.remove();
  $('#cms', m).onclick = async () => { const o = f(), p = people.find(x => x.id === +o.user_id);
    if (!p) { $('#cme', m).textContent = 'Choose who this is paid to'; return; }
    const bad = COMM.check(auto() ? { ...o, amount: r.auto ? r.amount : 1e12 } : o, COMM.words(p.kind, true).K); if (bad) { $('#cme', m).textContent = bad; return; }
    const b = $('#cms', m); b.disabled = true;
    try { const j = await api('comm', 'save', { customer_id: r.customer_id, ...o, user_id: +o.user_id }); m.remove(); toast(`${COMM.words(j.row.kind, true).K} saved for ${j.row.name}`); done(j.row); } catch (x) { b.disabled = false; } };
}

// admin / incentive manager: a customer that is on neither list (no owner, or owned by an admin)
async function commPick(d, done, reload) {
  const cs = await api('comm', 'candidates');
  const m = modal(`<h2 style="margin-top:0">Add a customer</h2><p class="mut" style="margin-top:-6px">Customers owned by a Business Associate or staff member are listed already. Pick one that has no such owner.</p>
    <input id="cmq" placeholder="Search customers…"><div class="fcl2" id="cml"></div><div class="bar" style="margin-top:12px"><button class="btn sec" id="cmx">Cancel</button></div>`);
  const dr = () => { const t = $('#cmq', m).value.toLowerCase(), L = cs.filter(c => !t || [c.name, c.phone, c.district].join(' ').toLowerCase().includes(t)).slice(0, 200);
    $('#cml', m).innerHTML = L.map(c => `<button type="button" class="fci cmn-pick" data-pk="${c.id}"><span><b>${esc(c.name)}</b><small class="mut">${esc([c.phone, c.district, c.ym ? 'won ' + cmYm(c.ym) : ''].filter(Boolean).join(' · '))}</small></span></button>`).join('') || '<p class="mut">No other customers.</p>'; };
  $('#cmq', m).oninput = dr; dr(); $('#cmx', m).onclick = () => m.remove();
  $('#cml', m).onclick = e => { const b = e.target.closest('[data-pk]'); if (!b) return; const c = cs.find(x => x.id === +b.dataset.pk); m.remove();
    /* on the Incentive list, a customer won since the scheme started goes through approval (it chooses the staff member and lead type) */
    if (d.admin && d.kind === 'incentive' && c.ym >= d.start) return commApprove({ customer_id: c.id, name: c.name, user_id: 0, lead_type: 'office', ym: c.ym, kw: 0, appr: '', from_lead: +c.from_lead }, d.people, reload);
    commEdit({ customer_id: c.id, name: c.name, user_id: 0, amount: 0, p1_amount: 0, p2_amount: 0, visible: 0, note: '', cost: 0, received: 0 }, d.people, done); };
}

/* customer profile › Commission / Incentive (admin only, app11.js): this customer's one record — who it is paid to (a Business Associate earns
   commission, a staff member an incentive), the amount, the two part payments and the status. Assign, edit and approve with the same windows as
   Finance › Commission / Incentive (commEdit / commApprove), so both places always show the same record. */
async function commProfileTab(box, c, cid) {
  box.innerHTML = '<p class="mut">Loading…</p>';
  let d; try { d = await api('comm', 'for_customer', undefined, '&customer_id=' + (+cid)); }
  catch (e) { if (box.isConnected) box.innerHTML = `<div class="card pfc"><p class="over" style="margin:0">${esc((e && (e.error || e.message)) || 'Could not load the commission / incentive')}</p></div>`; return; }
  if (!box.isConnected || !$('[data-pt="comm"].on')) return; /* another tab was opened meanwhile */
  const r = d.row, people = d.people || [], reload = () => commProfileTab(box, c, cid);
  const head = (t, extra) => `<div class="pfch"><i class="i i-users"></i><h3>${t}</h3>${extra || ''}</div>`;
  if (!r) {
    box.innerHTML = `<div class="card pfc">${head('Commission / Incentive')}
      <p class="mut" style="margin:0 0 12px">No Business Associate or staff member is assigned to this customer yet. Assign a Business Associate for a commission, or a staff member for an incentive.</p>
      <div class="bar"><button type="button" class="btn" id="cmpa"><i class="i i-userplus"></i> Assign and set the amount</button></div></div>`;
    $('#cmpa', box).onclick = () => commEdit({ customer_id: +cid, name: d.customer.name, user_id: 0, amount: 0, p1_amount: 0, p1_date: '', p1_ref: '', p2_amount: 0, p2_date: '', p2_ref: '', visible: 0, note: '', cost: 0, received: 0 }, people, reload);
    return;
  }
  const W = COMM.words(r.kind, true), p = people.find(x => x.id === +r.user_id) || {}, s = COMM.status(r), paid = COMM.paid(r);
  const pill = { approve: ['Waiting for approval', 'y'], no: ['Not eligible', 'r'], unset: ['Amount not set', ''], due: [paid > 0 ? 'Part paid' : 'To pay', 'y'], paid: ['Paid', 'g'] }[s] || ['', ''];
  const part = n => +r['p' + n + '_amount'] > 0 ? `<b>${inr(r['p' + n + '_amount'])}</b> <span class="mut">· ${r['p' + n + '_date'] ? fdt(r['p' + n + '_date']) : 'no date'}${r['p' + n + '_ref'] ? ' · ' + esc(r['p' + n + '_ref']) : ''}</span>` : '<span class="mut">Not paid yet</span>';
  const row = (l, v) => `<div class="pfr"><span>${l}</span><div>${v}</div></div>`;
  box.innerHTML = `<div class="card pfc cmn-pt">${head(W.K, `<span class="pill ${pill[1]}">${pill[0]}</span><span class="sp"></span>
      ${r.pending ? '<button type="button" class="btn" id="cmpap"><i class="i i-check"></i> Approve</button>' : ''}
      <button type="button" class="btn${r.pending ? ' sec' : ''}" id="cmped"><i class="i i-pencil"></i> Edit</button>
      <a class="btn sec" href="#/comm/${r.kind === 'commission' ? 'commission' : 'incentive'}">Open in Finance</a>`)}
    ${row('Paid to', `<b>${esc(r.user_name)}</b> <span class="mut">· ${esc(p.role_name || (r.kind === 'commission' ? 'Business Associate' : 'Staff'))}${+r.user_active ? '' : ' · inactive'}</span>`)}
    ${row('Type', r.kind === 'commission' ? 'Commission (Business Associate)' : 'Incentive (staff)' + (r.scheme ? ` · ${esc(COMM.LT[r.lead_type] || r.lead_type)}${r.ym ? ' · won ' + cmYm(r.ym) : ''}` : ''))}
    ${row(W.K + ' amount', +r.amount > 0 ? `<b>${inr(r.amount)}</b>${r.auto && r.calc ? ` <span class="mut">· ${esc(r.calc)}</span>` : ''}` : '<span class="mut">Not set</span>')}
    ${row('Part 1', part(1))}${row('Part 2', part(2))}
    ${+r.amount > 0 ? row('Balance', `Paid <b>${inr(paid)}</b> of <b>${inr(r.amount)}</b> · Balance <b class="${+r.amount - paid > 0.005 ? 'cmn-due' : ''}">${inr(Math.max(0, +r.amount - paid))}</b>`) : ''}
    ${row('Visible to the person', r.visible ? `Yes — ${esc(r.user_name)} sees it under “${W.K} received”` : '<span class="mut">No</span>')}
    ${r.note ? row('Note', esc(r.note)) : ''}
    ${r.updated ? `<p class="mut cmn-pu">Last changed ${esc(fdt(String(r.updated).slice(0, 10)))}${r.updated_by ? ' by ' + esc(r.updated_by) : ''}</p>` : ''}</div>`;
  $('#cmped', box).onclick = () => commEdit(r, people, reload);
  if ($('#cmpap', box)) $('#cmpap', box).onclick = () => commApprove(r, people, reload);
}
