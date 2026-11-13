/* The outside accountant's own view (assets/app42.js). Role 'accountant' sees the Accounts pages only (acTabs in app33.js), so:
   caNav()            the sidebar becomes the accounting menu: one entry per page they have (shell() in app.js uses it for that role)
   ACCT_TABS.cadash   "Dashboard": what an accountant looks at first: cash and bank, to receive, to pay, GST of the period, the
                      period's receipts / expenses / salaries, things to check, the latest entries, and the Excel export.
   No profit anywhere: the server does not give it to this role. */
const CA_ICONS = { cadash: 'dashboard', books: 'bank', dues: 'users', gst: 'receipt', salary: 'user', pending: 'clock', received: 'coin', expenses: 'card' };
function caNav() {
  return '<div class="sep">Accounting</div>' + acTabs().map(([k, l]) => `<a href="#/accounts/${k}" data-m="acc-${k}" data-atab="${k}" title="${esc(l)}"><span class="ft t-accounts"><i class="i i-${CA_ICONS[k] || 'coin'}"></i></span><span class="lbl">${esc(l)}</span></a>`).join('');
}

ACCT_TABS.cadash = async (box, P) => {
  const per = acPer(P);
  const [ov, bk, gst, sal, dues, book] = await Promise.all([api('acc', 'ac_overview', undefined, per), api('acc', 'ac_books'), api('acc', 'ac_gst', undefined, per), api('acc', 'ac_salary', undefined, per), api('acc', 'ac_dues'), api('acc', 'ac_book', undefined, per + '&book=0')]);
  if (!box.isConnected) return;
  const x = ov.expenses || {}, top = (ov.top || []).slice(0, 5), owing = (dues.rows || []).filter(r => r.balance > 0.004).slice(0, 5);
  const chk = (gst.purchases || []).filter(p => p.mark === 'check'), over = (bk.books || []).filter(b => !b.hidden && +b.credit_limit > 0 && b.balance < -b.credit_limit);
  const recent = (book.rows || []).slice().reverse().slice(0, 10), bn = {}; (bk.books || []).forEach(b => { bn[b.id] = b.name; });
  const todo = [];
  if (chk.length) todo.push(`<a href="#/accounts/gst"><b>${acPl(chk.length, 'purchase')}</b> with GST of ${inr2(gst.itc.check)} to check before claiming credit</a>`);
  if (bk.unrec && bk.unrec.n) todo.push(`<span><b>${acPl(bk.unrec.n, 'purchased item')}</b> (${inr2(bk.unrec.total)}) with no payment recorded: ask the office to complete them</span>`);
  over.forEach(b => todo.push(`<a href="#/accounts/books"><b>${esc(b.name)}</b> is over its limit by ${inr2(-b.balance - b.credit_limit)}</a>`));
  if (gst.out.n === 0) todo.push(`<span>No tax bill issued in ${esc(P.label)} yet</span>`);
  const list = (title, href, rows, empty) => `<div class="card cad-l"><div class="acx-ch"><h3>${title}</h3><span class="sp"></span><a class="btn sec sm" href="${href}">Open</a></div>${rows.length ? `<ul>${rows.join('')}</ul>` : `<p class="mut">${empty}</p>`}</div>`;
  box.innerHTML = `<div class="acx-view">
    <div class="cad-top"><div><h3 class="acb-h">Books at a glance</h3><span class="mut acx-small">Balances are as of today; the GST, receipts, expenses and salaries are for ${esc(P.label)}.</span></div><span class="sp"></span>
      <button type="button" class="btn" id="cad_exp"><i class="i i-download"></i> Export ${esc(P.label)} to Excel</button></div>
    <div class="acx-tiles">
      ${acTile('Cash & bank', acSigned(bk.total), (bk.books || []).filter(b => !b.hidden).map(b => `${esc(b.name)} ${acSigned(b.balance)}`).join(' · '), acTone(bk.total), '#/accounts/books')}
      ${acTile('To receive from customers', inr2(ov.pending), `${acPl(+ov.pending_n || 0, 'project')} with a balance`, '', '#/accounts/pending')}
      ${acTile('To pay suppliers', inr2(dues.due.total), `${acPl(dues.due.n, 'supplier')} with a balance`, dues.due.total > 0 ? 'acx-neg' : '', '#/accounts/dues')}
      ${acTile(gst.net > 0 ? 'Net GST payable' : 'GST credit carried', inr2(Math.abs(gst.net)), `collected ${inr2(gst.out.tax)} · credit ${inr2(gst.itc.yes)}`, gst.net > 0 ? 'acx-neg' : '', '#/accounts/gst')}</div>
    <div class="acx-tiles">
      ${acTile('Received', inr2(ov.received), `${acPl(+ov.received_n || 0, 'payment')} in ${esc(P.label)}`, '', '#/accounts/received')}
      ${acTile('Sales billed', inr2(gst.out.taxable), `${acPl(gst.out.n, 'tax bill')} · before GST`, '', '#/accounts/gst')}
      ${acTile('Office expenses', inr2(x.total), 'before GST · with Meta ad spend', '', '#/accounts/expenses')}
      ${acTile('Salaries paid', inr2(sal.total), `${acPl((sal.rows || []).length, 'payment')} to ${acPl((sal.by || []).length, 'person', 'people')}`, '', '#/accounts/salary')}</div>
    ${todo.length ? `<div class="acb-note cad-todo"><b>To look at</b>${todo.map(t => `<p>${t}</p>`).join('')}</div>` : ''}
    <div class="cad-cols">
      ${list('Customers who owe the most', '#/accounts/pending', top.map(r => `<li><span>${esc(r.customer || r.name || '')}</span><b>${inr2(r.due)}</b></li>`), 'Nothing to receive.')}
      ${list('Suppliers owed the most', '#/accounts/dues', owing.map(r => `<li><span>${esc(r.name)}</span><b>${inr2(r.balance)}</b></li>`), 'Nothing owed to suppliers.')}
    </div>
    <div class="bar acx-mbar"><h3 class="acb-h">Latest entries</h3><span class="mut">${esc(P.label)} · all accounts</span><span class="sp"></span><a class="btn sec sm" href="#/accounts/books">Open Cash &amp; bank</a></div>
    <div class="card tw"><table class="acx-mt" data-min="640"><colgroup><col style="width:104px"><col><col style="width:170px"><col style="width:130px"><col style="width:130px"></colgroup>
      <thead><tr><th>Date</th><th>Particulars</th><th>Account</th><th class="num">Money in</th><th class="num">Money out</th></tr></thead>
      <tbody>${recent.map(e => `<tr><td>${acDt(e.date)}</td><td class="acx-nm">${esc(e.title)}${e.sub ? `<small class="acs-by">${esc(e.sub)}</small>` : ''}</td><td>${esc(bn[e.book_id] || '')}</td><td class="num">${e.dir === 'in' ? `<span class="acs-less">${inr2(e.amount)}</span>` : ''}</td><td class="num">${e.dir === 'out' ? inr2(e.amount) : ''}</td></tr>`).join('')
        || `<tr><td colspan="5" class="mut">No entries in ${esc(P.label)}.</td></tr>`}</tbody></table></div>
    <p class="acx-note">Everything here is read from the office's entries; you cannot change it. Use Export for one Excel file with the cash and bank book, the sales and purchase registers, the GST summary, payments received, expenses, salaries and supplier dues of the chosen period, ready to record in Tally.</p></div>`;
  $('#cad_exp', box).onclick = e => acExport(e.currentTarget);
  if (typeof fitSoon === 'function') fitSoon();
};
