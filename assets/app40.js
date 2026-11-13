/* Accounts › Salaries and Accounts › Profit & loss (assets/app40.js). Server: api/pl.php (acc/ac_salary, ac_sal, salary_save,
   salary_delete, ac_pl, ads_book_save). Salaries are payments to people, each out of a cash or bank account. The profit and loss is
   computed each time: gross profit of the billed projects + other income − overheads; a month is one column, a financial year twelve.
   acSalForm(p, d, done)  pay a person / edit a payment (d = the ac_salary answer: staff, kinds, books) */
function acSalForm(p, d, done) {
  const books = (d.books || []).filter(b => !b.hidden || b.id === +p.book_id), staff = d.staff || [];
  const first = +p.book_id || (books.find(b => b.kind === 'bank' && b.is_default) || books.find(b => b.kind === 'bank') || books[0] || {}).id || 0; /* the default bank account */
  const other = !!p.id && !+p.user_id;
  const m = modal(`<div class="mh"><h3>${p.id ? 'Edit payment' : 'Pay a person'}</h3><button type="button" class="ib" data-x title="Close" aria-label="Close"><i class="i i-x"></i></button></div>
    <div class="two"><div><label for="asl_u">Staff member</label><select id="asl_u">${staff.map(s => `<option value="${s.id}" ${+p.user_id === +s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="0" ${other ? 'selected' : ''}>Someone else…</option></select></div>
    <div><label for="asl_n">Name</label><input id="asl_n" maxlength="120" autocomplete="off" value="${other ? esc(p.name || '') : ''}" placeholder="Helper, daily wage worker"></div>
    <div><label for="asl_k">What is it</label><select id="asl_k">${(d.kinds || []).map(k => `<option ${p.kind === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
    <div><label for="asl_f">For</label><input id="asl_f" maxlength="80" autocomplete="off" value="${esc(p.for_what || '')}" placeholder="Week ending 14 Nov, Nov 2026"></div>
    <div><label for="asl_d">Paid on</label><input id="asl_d" type="date" value="${esc(p.date || today())}"></div>
    <div><label for="asl_a">Amount (₹)</label><input id="asl_a" inputmode="decimal" autocomplete="off" value="${p.amount ? esc(String(p.amount)) : ''}"></div>
    <div><label for="asl_b">Paid from</label><select id="asl_b">${books.map(b => `<option value="${b.id}" ${first === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
    <div><label for="asl_r">Reference no.</label><input id="asl_r" maxlength="60" autocomplete="off" value="${esc(p.ref || '')}" placeholder="UTR, if by bank"></div>
    <div class="full"><label for="asl_t">Note</label><input id="asl_t" maxlength="300" autocomplete="off" value="${esc(p.note || '')}" ${SPELL}></div></div>
    <div class="bar acx-mft"><button type="button" class="btn" id="asl_ok">Save</button><button type="button" class="btn sec" data-x>Cancel</button></div>`);
  $$('[data-x]', m).forEach(x => x.onclick = () => m.remove());
  const su = $('#asl_u', m), sn = $('#asl_n', m);
  const sync = () => { sn.disabled = +su.value !== 0; if (sn.disabled) sn.value = ''; };
  su.onchange = () => { sync(); if (!sn.disabled) sn.focus(); }; sync();
  $('#asl_ok', m).onclick = async e => {
    const amount = acNum($('#asl_a', m).value);
    if (!+su.value && !sn.value.trim()) { toast('Type the name', true); sn.focus(); return; }
    if (!amount) { toast('Type the amount', true); $('#asl_a', m).focus(); return; }
    const bt = e.currentTarget; bt.disabled = true;
    try {
      await api('acc', 'salary_save', { id: p.id || 0, user_id: +su.value, name: sn.value.trim(), kind: $('#asl_k', m).value, for_what: $('#asl_f', m).value.trim(), date: $('#asl_d', m).value, amount, book_id: +$('#asl_b', m).value, ref: $('#asl_r', m).value.trim(), note: $('#asl_t', m).value.trim() });
      m.remove(); toast(p.id ? 'Payment saved' : 'Payment recorded'); if (done) done();
    } catch (er) { bt.disabled = false; }
  };
  $('#asl_a', m).focus();
}

ACCT_TABS.salary = async (box, P) => {
  const w = canW('accounts');
  const load = async () => {
    const d = await api('acc', 'ac_salary', undefined, acPer(P));
    if (!box.isConnected) return;
    const bn = {}; (d.books || []).forEach(b => { bn[b.id] = b.name; });
    const adv = d.rows.filter(r => r.kind === 'Advance').reduce((a, r) => a + r.amount, 0);
    box.innerHTML = `<div class="acx-view"><div class="acx-tiles">
        ${acTile('Paid to people', inr2(d.total), `${acPl(d.rows.length, 'payment')} in ${esc(P.label)}`)}
        ${acTile('People paid', d.by.length, d.by.length ? esc(d.by.slice(0, 3).map(x => x.name).join(', ')) + (d.by.length > 3 ? '…' : '') : 'nobody yet')}
        ${acTile('Advances', inr2(adv), 'counted as salary when paid')}
        ${acTile('Biggest', d.by.length ? inr2(d.by[0].total) : '—', d.by.length ? esc(d.by[0].name) : '')}</div>
      <div class="bar acx-mbar"><h3 class="acb-h">Payments</h3><span class="mut">${esc(P.label)}</span><span class="sp"></span>${w ? '<button type="button" class="btn" id="asl_add"><i class="i i-plus"></i> Pay a person</button>' : ''}</div>
      <div class="card tw"><table class="acx-mt asl-t" data-min="760"><colgroup><col style="width:104px"><col><col style="width:110px"><col style="width:190px"><col style="width:150px"><col style="width:130px">${w ? '<col style="width:76px">' : ''}</colgroup>
        <thead><tr><th>Paid on</th><th>Person</th><th>What</th><th>For</th><th>Paid from</th><th class="num">Amount</th>${w ? '<th><span class="acx-sr">Actions</span></th>' : ''}</tr></thead>
        <tbody>${d.rows.map((r, i) => `<tr data-i="${i}"><td>${acDt(r.date)}</td><td class="acx-nm">${esc(r.name)}${r.note ? `<small class="acs-by">${esc(r.note)}</small>` : ''}</td><td>${esc(r.kind)}</td><td>${esc(r.for_what)}</td>
          <td>${esc(bn[r.book_id] || '')}${r.ref ? `<small class="acs-by">${esc(r.ref)}</small>` : ''}</td><td class="num">${inr2(r.amount)}</td>
          ${w ? '<td class="acx-act"><button type="button" class="ib" data-a="edit" title="Edit" aria-label="Edit"><i class="i i-pencil"></i></button><button type="button" class="ib" data-a="del" title="Delete" aria-label="Delete"><i class="i i-trash"></i></button></td>' : ''}</tr>`).join('')
          || `<tr><td colspan="${w ? 7 : 6}" class="mut">No payments to people in ${esc(P.label)}.</td></tr>`}</tbody></table></div>
      ${d.by.length ? `<div class="bar acx-mbar"><h3 class="acb-h">Per person</h3></div><div class="card tw"><table class="acx-mt" data-min="420"><thead><tr><th>Person</th><th class="num">Payments</th><th class="num">Of which advance</th><th class="num">Total</th></tr></thead>
        <tbody>${d.by.map(x => `<tr><td class="acx-nm">${esc(x.name)}</td><td class="num">${x.n}</td><td class="num">${x.advance ? inr2(x.advance) : '—'}</td><td class="num"><b>${inr2(x.total)}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
      <p class="acx-note">Every salary, advance or bonus paid to a person, by the day it was paid. Each one goes out of the account chosen in Cash &amp; bank and counts under Salaries in Profit &amp; loss. Commission and incentive are not here: they are paid from Finance › Commission / Incentive and belong to their projects.</p></div>`;
    if (w) {
      $('#asl_add', box).onclick = () => acSalForm({}, d, load);
      $('.asl-t', box).onclick = async e => {
        const b = e.target.closest('[data-a]'), tr = b && b.closest('tr[data-i]'), r = tr && d.rows[+tr.dataset.i]; if (!r) return;
        if (b.dataset.a === 'edit') return acSalForm(r, d, load);
        if (!confirm(`Delete the payment of ${inr2(r.amount)} to ${r.name}?\n\nIt goes to the Recycle bin.`)) return;
        b.disabled = true;
        try { await api('acc', 'salary_delete', { id: r.id }); toast('Payment deleted. It is in the Recycle bin.'); await load(); } catch (er) { b.disabled = false; }
      };
    }
    if (typeof fitSoon === 'function') fitSoon();
  };
  await load();
};

ACCT_TABS.pl = async (box, P) => {
  const w = canW('accounts');
  const load = async () => {
    const d = await api('acc', 'ac_pl', undefined, acPer(P));
    if (!box.isConnected) return;
    const many = d.cols.length > 1, L = {}; d.lines.forEach(l => { L[l.key] = l; });
    const cell = (l, v) => l.kind === 'head' ? '' : l.kind === 'less' ? (v ? inr2(v) : '<span class="mut">—</span>') : acSigned(v);
    const row = l => l.kind === 'head' ? `<tr class="acx-grp"><td colspan="${d.cols.length + (many ? 2 : 1)}"><b>${esc(l.label)}</b></td></tr>`
      : `<tr class="apl-${l.kind}"><td class="acx-nm">${esc(l.label)}</td>${l.vals.map(v => `<td class="num">${cell(l, v)}</td>`).join('')}${many ? `<td class="num apl-tot">${cell(l, l.total)}</td>` : ''}</tr>`;
    const net = L.net ? L.net.total : 0, gross = L.gross ? L.gross.total : 0;
    box.innerHTML = `<div class="acx-view"><div class="acx-tiles">
        ${acTile('Sales', inr2(L.sales ? L.sales.total : 0), `${acPl(d.bills, 'project')} billed · before GST`)}
        ${acTile('Gross profit', acSigned(gross), 'after project cost and commission', acTone(gross))}
        ${acTile('Overheads', inr2(L.over ? L.over.total : 0), `salaries ${inr2(L.salary ? L.salary.total : 0)} · ads ${inr2(L.ads ? L.ads.total : 0)}`)}
        ${acTile(net < 0 ? 'Net loss' : 'Net profit', inr2(Math.abs(net)), 'before income tax', acTone(net))}</div>
      ${d.no_cost.length ? `<div class="acb-note"><p>${acPl(d.no_cost.length, 'billed project')} left out because the Project cost sheet is empty: ${d.no_cost.map(x => `<a href="#/accounts/cost/${+x.project_id}">${esc(x.customer)}</a>`).join(', ')}. Fill the sheet and it joins the sales and the profit.</p></div>` : ''}
      <div class="card tw"><table class="acx-mt apl-t" data-min="${many ? 1180 : 420}"><thead><tr><th>${esc(P.label)}</th>${d.cols.map(c => `<th class="num">${esc(c.label)}</th>`).join('')}${many ? '<th class="num">Total</th>' : ''}</tr></thead>
        <tbody>${d.lines.map(row).join('')}</tbody></table></div>
      <div class="card apl-ads"><b>Meta ad spend</b> <span class="mut">is paid from</span> <select id="apl_b" ${w ? '' : 'disabled'} aria-label="Account Meta ads are paid from"><option value="0">Not in Cash &amp; bank</option>${(d.books || []).filter(b => !b.hidden || b.id === d.ads.book).map(b => `<option value="${b.id}" ${d.ads.book === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
        <label class="acx-chk"><input type="checkbox" id="apl_g" ${d.ads.gst ? 'checked' : ''} ${w ? '' : 'disabled'}> add 18% GST</label>${w ? '<button type="button" class="btn sec sm" id="apl_s">Save</button>' : ''}
        <span class="mut acx-small">Choose the card's or bank's account and each month's Meta spend goes out of it in Cash &amp; bank.</span></div>
      <p class="acx-note">Sales, project cost and commission are counted in the month the project's tax bill was issued (as on Project profit); a billed project with an empty Project cost sheet is left out until it is filled. Salaries and other overheads are counted in the month they were paid, before GST. Not in this statement, because they are not profit or loss: your own money put in or taken out, loans, transfers, GST, and stock bought but not yet used on a project. It is the company's working profit before income tax, not the audited accounts.</p></div>`;
    if (w) $('#apl_s', box).onclick = async e => {
      const bt = e.currentTarget; bt.disabled = true;
      try { await api('acc', 'ads_book_save', { book: +$('#apl_b', box).value, gst: $('#apl_g', box).checked ? 1 : 0 }); toast(+$('#apl_b', box).value ? 'Saved: Meta ad spend now goes out of that account' : 'Saved: Meta ad spend is not in Cash & bank'); }
      catch (er) { }
      bt.disabled = false;
    };
    if (typeof fitSoon === 'function') fitSoon();
  };
  await load();
};
