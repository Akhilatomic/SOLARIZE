/* Accounts › Cash & bank (assets/app37.js): the company's cash and bank accounts and the book of every rupee in and out.
   Server: api/books.php (acc/ac_books, ac_book, book_save, book_delete, txn_save, ac_txn, txn_delete, book_move). Rule: ACC.bookRun (app32.js).
   The book is worked out from payments received, office expenses, commission / incentive paid and purchases marked Purchased with a
   "Paid from" account (Project cost sheet), plus the manual entries and transfers added here.
   acBookForm(b, done)   add / edit an account (name, cash or bank, opening balance and its date, default, hidden; delete when unused)
   acBookManage(reload)  the Accounts window
   acTxnForm(o, done)    Money in / Money out / Transfer (o.mode = in | out | transfer; o.txn = the entry being edited)
   acBookMove(e, done)   put a payment / expense / commission entry in another account */
const ACB = { book: 0, sum: null };
const acbOpts = (books, sel, none) => (none ? `<option value="">${esc(none)}</option>` : '') + books.filter(b => !b.hidden || b.id === +sel).map(b => `<option value="${b.id}" ${+sel === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');

/* a cash credit / overdraft account: its limit and what can still be drawn (limit + balance; the balance is minus while money is owed) */
const acbLimit = b => { if (!(+b.credit_limit > 0)) return ''; const left = ACC.r2(+b.credit_limit + (+b.balance || 0)); return ` · limit ${inr2(b.credit_limit)} · ${left >= 0 ? inr2(left) + ' available' : 'over the limit by ' + inr2(-left)}`; };
function acBookForm(b, done) {
  const m = modal(`<div class="mh"><h3>${b.id ? 'Edit account' : 'New account'}</h3><button type="button" class="ib" data-x title="Close" aria-label="Close"><i class="i i-x"></i></button></div>
    <div class="two"><div class="full"><label for="acb_n">Account name</label><input id="acb_n" maxlength="60" autocomplete="off" value="${esc(b.name || '')}" placeholder="For example: SBI current account"></div>
    <div><label for="acb_k">Kind</label><select id="acb_k"><option value="bank" ${b.kind !== 'cash' ? 'selected' : ''}>Bank account</option><option value="cash" ${b.kind === 'cash' ? 'selected' : ''}>Cash</option></select></div>
    <div><label for="acb_t">Note</label><input id="acb_t" maxlength="200" autocomplete="off" value="${esc(b.note || '')}" placeholder="Branch, last 4 digits"></div>
    <div><label for="acb_o">Opening balance (₹)</label><input id="acb_o" inputmode="decimal" autocomplete="off" value="${b.opening ? esc(String(b.opening)) : ''}" placeholder="0"></div>
    <div><label for="acb_d">Opening balance as on</label><input id="acb_d" type="date" value="${esc(b.opening_on || '')}"></div>
    <div class="full"><label for="acb_l">Credit limit (₹), for a cash credit or overdraft account</label><input id="acb_l" inputmode="decimal" autocomplete="off" value="${b.credit_limit ? esc(String(b.credit_limit)) : ''}" placeholder="Leave blank for a normal account"></div>
    <div class="full acb-chks"><label class="acx-chk"><input type="checkbox" id="acb_f" ${b.is_default ? 'checked' : ''}> Default bank account (UPI, bank transfer, cheque, loan and card payments land here)</label>
      ${b.id ? `<label class="acx-chk"><input type="checkbox" id="acb_h" ${b.hidden ? 'checked' : ''}> Hidden (no longer in use)</label>` : ''}</div></div>
    <p class="mut acx-small">The opening balance is what was in the account on that day, before the entries in this book. For a cash credit or overdraft account it is a minus figure (what you owe the bank), for example -328182. Entries dated before it still count, so pick the day you start keeping the book here.</p>
    <div class="bar acx-mft"><button type="button" class="btn" id="acb_s">Save</button><button type="button" class="btn sec" data-x>Cancel</button><span class="sp"></span>${b.id && canW('accounts') ? '<button type="button" class="btn sec" id="acb_x"><i class="i i-trash"></i> Delete</button>' : ''}</div>`);
  $$('[data-x]', m).forEach(x => x.onclick = () => m.remove());
  const kind = $('#acb_k', m), df = $('#acb_f', m);
  const kd = () => { df.disabled = kind.value !== 'bank'; if (df.disabled) df.checked = false; $('#acb_l', m).disabled = kind.value !== 'bank'; };
  kind.onchange = kd; kd();
  $('#acb_s', m).onclick = async e => {
    const name = $('#acb_n', m).value.trim();
    if (!name) { toast('Type the account name', true); $('#acb_n', m).focus(); return; }
    const bt = e.currentTarget; bt.disabled = true;
    try {
      const r = await api('acc', 'book_save', { id: b.id || 0, name, kind: kind.value, note: $('#acb_t', m).value.trim(), opening: $('#acb_o', m).value.trim(), opening_on: $('#acb_d', m).value, credit_limit: kind.value === 'bank' ? $('#acb_l', m).value.trim() : '',
        is_default: df.checked ? 1 : 0, hidden: $('#acb_h', m) && $('#acb_h', m).checked ? 1 : 0 });
      ACB.sum = r; m.remove(); toast(b.id ? 'Account saved' : `“${name}” added`); if (done) done();
    } catch (er) { bt.disabled = false; if (er && er.quiet && er.error) toast(er.error, true); }
  };
  if ($('#acb_x', m)) $('#acb_x', m).onclick = async e => {
    if (!confirm(`Delete the account “${b.name}”?\n\nOnly an account with no entries can be deleted. It goes to the Recycle bin.`)) return;
    const bt = e.currentTarget; bt.disabled = true;
    try { ACB.sum = await api('acc', 'book_delete', { id: b.id }); m.remove(); toast('Account deleted'); if (ACB.book === b.id) ACB.book = 0; if (done) done(); }
    catch (er) { bt.disabled = false; }
  };
  $('#acb_n', m).focus();
}

function acBookManage(reload) {
  const w = canW('accounts');
  const m = modal(`<div class="mh"><h3>Accounts</h3><button type="button" class="ib" data-x title="Close" aria-label="Close"><i class="i i-x"></i></button></div>
    <p class="mut acx-small acx-top0">Your cash and each bank account. Set the opening balance once; after that the balance follows the entries.</p>
    <div class="acs-sl" id="acb_l"></div>
    <div class="bar acx-mft">${w ? '<button type="button" class="btn" id="acb_a"><i class="i i-plus"></i> New account</button>' : ''}<span class="sp"></span><button type="button" class="btn sec" data-x>Done</button></div>`);
  const list = $('#acb_l', m);
  let changed = false;
  const draw = () => { list.innerHTML = ((ACB.sum && ACB.sum.books) || []).map(b => `<div class="acs-sr" data-id="${b.id}"><span class="acs-sn"><span><b>${esc(b.name)}</b>${b.is_default ? ' <span class="pill acx-tag">Default</span>' : ''}${b.hidden ? ' <span class="pill acx-tag">Hidden</span>' : ''}</span>
      <small>${b.kind === 'cash' ? 'Cash' : 'Bank account'}${b.note ? ' · ' + esc(b.note) : ''}${b.opening ? ` · opening ${acSigned(b.opening)}${b.opening_on ? ' on ' + acDt(b.opening_on) : ''}` : ''}${esc(acbLimit(b))}</small></span>
      <span class="acs-sc">${acSigned(b.balance)}</span>${w ? `<button type="button" class="ib" data-e title="Edit" aria-label="Edit ${esc(b.name)}"><i class="i i-pencil"></i></button>` : ''}<span></span></div>`).join(''); };
  const after = () => { changed = true; if (m.isConnected) draw(); };
  $$('[data-x]', m).forEach(x => x.onclick = () => { m.remove(); if (changed && reload) reload(); });
  if (w) {
    $('#acb_a', m).onclick = () => acBookForm({}, after);
    list.onclick = e => { const bt = e.target.closest('[data-e]'), row = bt && bt.closest('[data-id]'), b = row && ACB.sum.books.find(x => x.id === +row.dataset.id); if (b) acBookForm(b, after); };
  }
  draw();
}

/* Money in / Money out / Transfer. o.mode = 'in' | 'out' | 'transfer'; o.txn = an entry to edit (its cat decides the mode) */
function acTxnForm(o, done) {
  const S2 = ACB.sum || {}, books = S2.books || [], t = o.txn || {};
  const mode = t.cat ? (t.cat === 'transfer' ? 'transfer' : (S2.cats.find(c => c.key === t.cat) || {}).dir || 'out') : o.mode;
  const cats = (S2.cats || []).filter(c => c.key !== 'transfer' && c.dir === mode);
  const first = +t.book_id || ACB.book || (books.find(b => b.kind === 'bank' && b.is_default && !b.hidden) || books.find(b => !b.hidden) || {}).id || 0; /* the default bank account unless one is open */
  const m = modal(`<div class="mh"><h3>${t.id ? 'Edit entry' : mode === 'transfer' ? 'Transfer between accounts' : mode === 'in' ? 'Money in' : 'Money out'}</h3><button type="button" class="ib" data-x title="Close" aria-label="Close"><i class="i i-x"></i></button></div>
    ${mode === 'transfer' ? '' : `<p class="mut acx-small acx-top0">${mode === 'in' ? 'For money that is not a customer payment. Customer payments come here by themselves when they are recorded.' : 'For money that is not an office expense or a purchase. Those come here by themselves from Expenses and the Project cost sheets.'}</p>`}
    <div class="two">${mode === 'transfer' ? '' : `<div class="full"><label for="act_c">What is it</label><select id="act_c">${cats.map(c => `<option value="${c.key}" ${t.cat === c.key ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>`}
    <div><label for="act_d">Date</label><input id="act_d" type="date" value="${esc(t.date || today())}"></div>
    <div><label for="act_a">Amount (₹)</label><input id="act_a" inputmode="decimal" autocomplete="off" value="${t.amount ? esc(String(t.amount)) : ''}"></div>
    <div><label for="act_b">${mode === 'transfer' ? 'From account' : 'Account'}</label><select id="act_b">${acbOpts(books, first)}</select></div>
    ${mode === 'transfer' ? `<div><label for="act_t">To account</label><select id="act_t">${acbOpts(books, +t.to_book_id || (books.find(b => !b.hidden && b.id !== first) || {}).id || 0)}</select></div>`
      : `<div><label for="act_p">${mode === 'in' ? 'From whom' : 'To whom'}</label><input id="act_p" maxlength="120" autocomplete="off" value="${esc(t.party || '')}"></div>`}
    <div><label for="act_r">Reference no.</label><input id="act_r" maxlength="60" autocomplete="off" value="${esc(t.ref || '')}" placeholder="UTR, cheque no."></div>
    <div${mode === 'transfer' ? '' : ' class="full"'}><label for="act_n">Note</label><input id="act_n" maxlength="300" autocomplete="off" value="${esc(t.note || '')}" ${SPELL}></div></div>
    <div class="bar acx-mft"><button type="button" class="btn" id="act_s">Save</button><button type="button" class="btn sec" data-x>Cancel</button></div>`);
  $$('[data-x]', m).forEach(x => x.onclick = () => m.remove());
  const fa = $('#act_a', m);
  fa.oninput = () => fa.classList.toggle('acx-bad', acNum(fa.value) === null);
  $('#act_s', m).onclick = async e => {
    const amount = acNum(fa.value);
    if (!amount) { toast('Type the amount', true); fa.focus(); return; }
    if (!$('#act_d', m).value) { toast('Enter the date', true); return; }
    if (mode === 'transfer' && $('#act_b', m).value === $('#act_t', m).value) { toast('Choose two different accounts', true); return; }
    const bt = e.currentTarget; bt.disabled = true;
    try {
      await api('acc', 'txn_save', { id: t.id || 0, date: $('#act_d', m).value, cat: mode === 'transfer' ? 'transfer' : $('#act_c', m).value, amount, book_id: +$('#act_b', m).value,
        to_book_id: mode === 'transfer' ? +$('#act_t', m).value : 0, party: $('#act_p', m) ? $('#act_p', m).value.trim() : '', ref: $('#act_r', m).value.trim(), note: $('#act_n', m).value.trim() });
      m.remove(); toast(t.id ? 'Entry saved' : mode === 'transfer' ? 'Transfer saved' : 'Entry added'); if (done) done();
    } catch (er) { bt.disabled = false; }
  };
  fa.focus();
}

function acBookMove(e, done) {
  const books = (ACB.sum && ACB.sum.books) || [];
  const m = modal(`<div class="mh"><h3>Move to another account</h3><button type="button" class="ib" data-x title="Close" aria-label="Close"><i class="i i-x"></i></button></div>
    <p class="acs-for">${esc(e.title)} <span class="mut">· ${acDt(e.date)} · ${inr2(e.amount)}</span></p>
    <label for="acm_b">Account the money ${e.dir === 'in' ? 'came into' : 'went out of'}</label><select id="acm_b">${acbOpts(books, e.book_id)}</select>
    <div class="bar acx-mft"><button type="button" class="btn" id="acm_s">Move</button><button type="button" class="btn sec" data-x>Cancel</button></div>`);
  $$('[data-x]', m).forEach(x => x.onclick = () => m.remove());
  $('#acm_s', m).onclick = async ev => {
    const bt = ev.currentTarget; bt.disabled = true;
    try { await api('acc', 'book_move', { kind: e.kind, ref_id: e.ref_id, book_id: +$('#acm_b', m).value }); m.remove(); toast('Moved'); if (done) done(); }
    catch (er) { bt.disabled = false; }
  };
}

ACCT_TABS.books = async (box, P) => {
  const w = canW('accounts');
  const load = async () => {
    const d = await api('acc', 'ac_book', undefined, acPer(P) + '&book=' + ACB.book);
    if (!box.isConnected) return;
    ACB.sum = d;
    if (ACB.book && !d.books.some(b => b.id === ACB.book)) { ACB.book = 0; return load(); }
    const shown = d.books.filter(b => !b.hidden || b.id === ACB.book), cur = d.books.find(b => b.id === ACB.book);
    const rows = ACC.bookRun(d.open, d.rows);
    const card = (id, name, sub, bal) => `<button type="button" class="card acx-t acb-c${ACB.book === id ? ' on' : ''}" data-acb="${id}"><small>${esc(name)}</small><b class="${acTone(bal)}">${acSigned(bal)}</b><span class="mut">${esc(sub)}</span></button>`;
    const notes = [];
    if (d.due.n) notes.push(`<b>${inr2(d.due.total)}</b> owed to ${acPl(d.due.n, 'supplier')}. <a href="#/accounts/dues">Supplier dues</a>`);
    if (d.unrec.n) notes.push(`${acPl(d.unrec.n, 'purchased item')} (${inr2(d.unrec.total)}) ${d.unrec.n === 1 ? 'has' : 'have'} no payment recorded, so ${d.unrec.n === 1 ? 'it is' : 'they are'} not in this book. Open the Project cost sheet and save it: they then count as paid from the bank account, unless you choose “Not paid yet”.`);
    box.innerHTML = `<div class="acx-view">
      <div class="acb-cs">${card(0, 'All accounts', `${acPl(shown.length, 'account')} · today`, d.total)}${shown.map(b => card(b.id, b.name, (b.kind === 'cash' ? 'Cash' : 'Bank') + (b.is_default ? ' · default' : '') + (b.hidden ? ' · hidden' : '') + acbLimit(b), b.balance)).join('')}</div>
      ${notes.length ? `<div class="acb-note">${notes.map(n => `<p>${n}</p>`).join('')}</div>` : ''}
      <div class="bar acx-mbar"><h3 class="acb-h">${esc(cur ? cur.name : 'All accounts')} <span class="mut">· ${esc(P.label)}</span></h3><span class="sp"></span>
        ${w ? '<button type="button" class="btn sec" data-acb-n="in"><i class="i i-plus"></i> Money in</button><button type="button" class="btn sec" data-acb-n="out"><i class="i i-plus"></i> Money out</button><button type="button" class="btn sec" data-acb-n="transfer"><i class="i i-refresh"></i> Transfer</button>' : ''}
        <button type="button" class="btn sec" id="acb_m"><i class="i i-bank"></i> Accounts</button></div>
      <div class="card tw"><table class="acx-mt acb-t" data-min="760"><colgroup><col style="width:104px"><col><col style="width:130px"><col style="width:120px"><col style="width:120px"><col style="width:130px">${w ? '<col style="width:86px">' : ''}</colgroup>
        <thead><tr><th>Date</th><th>Particulars</th><th>Reference</th><th class="num">Money in</th><th class="num">Money out</th><th class="num">Balance</th>${w ? '<th><span class="acx-sr">Actions</span></th>' : ''}</tr></thead>
        <tbody><tr class="acb-ob"><td>${acDt(d.from)}</td><td><b>Opening balance</b></td><td></td><td></td><td></td><td class="num"><b>${acSigned(d.open)}</b></td>${w ? '<td></td>' : ''}</tr>
        ${rows.map((e, i) => `<tr data-i="${i}"><td>${acDt(e.date)}</td><td class="acx-nm">${e.link ? `<a href="${esc(e.link)}">${esc(e.title)}</a>` : esc(e.title)}${e.sub ? `<small class="acs-by">${esc(e.sub)}</small>` : ''}${!ACB.book ? `<small class="acs-by">${esc((d.books.find(b => b.id === e.book_id) || {}).name || '')}</small>` : ''}</td>
          <td>${esc(e.ref)}</td><td class="num">${e.dir === 'in' ? `<span class="acs-less">${inr2(e.amount)}</span>` : ''}</td><td class="num">${e.dir === 'out' ? inr2(e.amount) : ''}</td><td class="num">${acSigned(e.bal)}</td>
          ${w ? `<td class="acx-act">${e.movable ? '<button type="button" class="ib" data-acb-a="move" title="Move to another account" aria-label="Move to another account"><i class="i i-refresh"></i></button>' : ''}${e.kind === 'txn' ? '<button type="button" class="ib" data-acb-a="edit" title="Edit" aria-label="Edit"><i class="i i-pencil"></i></button><button type="button" class="ib" data-acb-a="del" title="Delete" aria-label="Delete"><i class="i i-trash"></i></button>' : ''}</td>` : ''}</tr>`).join('')
          || `<tr><td colspan="${w ? 7 : 6}" class="mut">No entries in ${esc(P.label)}.</td></tr>`}
        <tr class="acb-ob"><td>${acDt(d.to)}</td><td><b>Closing balance</b></td><td></td><td class="num"><b>${inr2(d.in)}</b></td><td class="num"><b>${inr2(d.out)}</b></td><td class="num"><b>${acSigned(d.close)}</b></td>${w ? '<td></td>' : ''}</tr></tbody></table></div>
      <p class="acx-note">Customer payments, office expenses, commission / incentive paid and purchases marked Purchased with a “Paid from” account come here by themselves. A cash payment lands in the cash account, every other mode in the default bank account; use the move button on an entry that belongs elsewhere. Expenses and purchases go out with their GST. Money in / Money out are for everything else: the owner's own money, loans, bank charges, interest.${ACB.book ? '' : ' With all accounts together, transfers between them are left out.'}</p></div>`;
    $$('[data-acb]', box).forEach(b => b.onclick = () => { ACB.book = +b.dataset.acb; load(); });
    $('#acb_m', box).onclick = () => acBookManage(load);
    $$('[data-acb-n]', box).forEach(b => b.onclick = () => acTxnForm({ mode: b.dataset.acbN }, load));
    const tb = $('.acb-t', box);
    tb.onclick = async e => {
      const b = e.target.closest('[data-acb-a]'), tr = b && b.closest('tr[data-i]'), x = tr && rows[+tr.dataset.i]; if (!x) return;
      const a = b.dataset.acbA;
      if (a === 'move') return acBookMove(x, load);
      b.disabled = true;
      try {
        if (a === 'edit') { const r = await api('acc', 'ac_txn', undefined, '&id=' + x.ref_id); b.disabled = false; return acTxnForm({ txn: r.txn }, load); }
        if (a === 'del') { if (!confirm(`Delete “${x.title}” of ${inr2(x.amount)}?\n\nIt goes to the Recycle bin.`)) { b.disabled = false; return; } await api('acc', 'txn_delete', { id: x.ref_id }); toast('Entry deleted. It is in the Recycle bin.'); await load(); }
      } catch (er) { b.disabled = false; }
    };
    if (typeof fitSoon === 'function') fitSoon();
  };
  await load();
};
