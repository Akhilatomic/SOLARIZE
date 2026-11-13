/* Accounts › Supplier dues (assets/app38.js): what is owed to each supplier. Server: api/dues.php (acc/ac_dues, ac_sup, ac_bill, ac_spay,
   bill_save, bill_delete, spay_save, spay_delete). A supplier's balance = bills on credit (purchased lines marked "Not paid yet" on
   Project cost sheets + bills added here) − payments. Payments also go out of the cash and bank book.
   acBillForm(b, done)       add / edit a supplier bill that is not on a Project cost sheet
   acSpayForm(p, done)       record / edit a payment to a supplier (p.supplier, p.amount prefill a new one)
   acSupLedger(name, reload) one supplier's bills and payments with the running balance */
const ACD = { d: null };
const acdBooks = () => (ACD.d && ACD.d.books) || [];
const acdAcc = (sel, credit) => (credit ? `<option value="0" ${!+sel ? 'selected' : ''}>Not paid yet (on credit)</option>` : '') + acdBooks().filter(b => !b.hidden || b.id === +sel).map(b => `<option value="${b.id}" ${+sel === b.id ? 'selected' : ''}>${credit ? 'Paid from ' : ''}${esc(b.name)}</option>`).join('');
const acdSupList = () => { let d = document.getElementById('acd_sups'); if (!d) { d = document.createElement('datalist'); d.id = 'acd_sups'; document.body.appendChild(d); }
  const names = [...new Set([...((ACD.d && ACD.d.suppliers) || []), ...((ACD.d && ACD.d.rows) || []).filter(r => r.key).map(r => r.name)])]; d.innerHTML = names.map(n => `<option value="${esc(n)}">`).join(''); };

function acBillForm(b, done) {
  acdSupList();
  const m = modal(`<div class="mh"><h3>${b.id ? 'Edit supplier bill' : 'Add supplier bill'}</h3><button type="button" class="ib" data-x title="Close" aria-label="Close"><i class="i i-x"></i></button></div>
    <p class="mut acx-small acx-top0">For a bill that is not on a Project cost sheet: stock bought in bulk, tools, or a balance from before the CRM. If its items are later marked Purchased on a sheet with the same supplier and bill no., they are not counted twice.</p>
    <div class="two"><div class="full"><label for="acd_s">Supplier</label><input id="acd_s" list="acd_sups" maxlength="120" autocomplete="off" value="${esc(b.supplier || '')}"></div>
    <div><label for="acd_n">Bill no.</label><input id="acd_n" maxlength="60" autocomplete="off" value="${esc(b.bill_no || '')}"></div>
    <div><label for="acd_d">Bill date</label><input id="acd_d" type="date" value="${esc(b.date || today())}"></div>
    <div><label for="acd_a">Bill amount, with GST (₹)</label><input id="acd_a" inputmode="decimal" autocomplete="off" value="${b.amount ? esc(String(b.amount)) : ''}"></div>
    <div><label for="acd_g">GST in the bill (₹)</label><input id="acd_g" inputmode="decimal" autocomplete="off" value="${b.gst_amt ? esc(String(b.gst_amt)) : ''}" placeholder="If known"></div>
    <div class="full"><label for="acd_p">Payment</label><select id="acd_p">${acdAcc(b.pay_book || 0, true)}</select></div>
    <div class="full"><label for="acd_t">Note</label><input id="acd_t" maxlength="300" autocomplete="off" value="${esc(b.note || '')}" placeholder="What was bought" ${SPELL}></div></div>
    <div class="bar acx-mft"><button type="button" class="btn" id="acd_ok">Save</button><button type="button" class="btn sec" data-x>Cancel</button></div>`);
  $$('[data-x]', m).forEach(x => x.onclick = () => m.remove());
  $('#acd_ok', m).onclick = async e => {
    const amount = acNum($('#acd_a', m).value), gst = acNum($('#acd_g', m).value);
    if (!$('#acd_s', m).value.trim()) { toast('Type the supplier name', true); $('#acd_s', m).focus(); return; }
    if (!amount) { toast('Type the bill amount', true); $('#acd_a', m).focus(); return; }
    if (gst === null || gst > amount) { toast('The GST cannot be more than the bill amount', true); $('#acd_g', m).focus(); return; }
    const bt = e.currentTarget; bt.disabled = true;
    try {
      await api('acc', 'bill_save', { id: b.id || 0, supplier: $('#acd_s', m).value.trim(), bill_no: $('#acd_n', m).value.trim(), date: $('#acd_d', m).value, amount, gst_amt: gst || 0, pay_book: +$('#acd_p', m).value, note: $('#acd_t', m).value.trim() });
      m.remove(); toast(b.id ? 'Bill saved' : 'Bill added'); if (done) done();
    } catch (er) { bt.disabled = false; if (er && er.quiet && er.error) toast(er.error, true); }
  };
  $(b.supplier ? '#acd_n' : '#acd_s', m).focus();
}

function acSpayForm(p, done) {
  acdSupList();
  const first = +p.book_id || (acdBooks().find(b => b.is_default && !b.hidden) || acdBooks().find(b => !b.hidden) || {}).id || 0;
  const m = modal(`<div class="mh"><h3>${p.id ? 'Edit supplier payment' : 'Pay a supplier'}</h3><button type="button" class="ib" data-x title="Close" aria-label="Close"><i class="i i-x"></i></button></div>
    <div class="two"><div class="full"><label for="acy_s">Supplier</label><input id="acy_s" list="acd_sups" maxlength="120" autocomplete="off" value="${esc(p.supplier || '')}"></div>
    <div><label for="acy_d">Paid on</label><input id="acy_d" type="date" value="${esc(p.date || today())}"></div>
    <div><label for="acy_a">Amount (₹)</label><input id="acy_a" inputmode="decimal" autocomplete="off" value="${p.amount > 0 ? esc(String(p.amount)) : ''}"></div>
    <div><label for="acy_b">Paid from</label><select id="acy_b">${acdAcc(first, false)}</select></div>
    <div><label for="acy_r">Reference no.</label><input id="acy_r" maxlength="60" autocomplete="off" value="${esc(p.ref || '')}" placeholder="UTR, cheque no."></div>
    <div><label for="acy_n">Against bill no.</label><input id="acy_n" maxlength="60" autocomplete="off" value="${esc(p.bill_no || '')}" placeholder="Optional"></div>
    <div><label for="acy_t">Note</label><input id="acy_t" maxlength="300" autocomplete="off" value="${esc(p.note || '')}" ${SPELL}></div></div>
    <p class="mut acx-small">The payment comes off this supplier's balance and goes out of the account in Cash &amp; bank. A part payment is fine.</p>
    <div class="bar acx-mft"><button type="button" class="btn" id="acy_ok">Save</button><button type="button" class="btn sec" data-x>Cancel</button></div>`);
  $$('[data-x]', m).forEach(x => x.onclick = () => m.remove());
  $('#acy_ok', m).onclick = async e => {
    const amount = acNum($('#acy_a', m).value);
    if (!$('#acy_s', m).value.trim()) { toast('Type the supplier name', true); $('#acy_s', m).focus(); return; }
    if (!amount) { toast('Type the amount', true); $('#acy_a', m).focus(); return; }
    if (!+$('#acy_b', m).value) { toast('Choose the account it was paid from', true); return; }
    const bt = e.currentTarget; bt.disabled = true;
    try {
      await api('acc', 'spay_save', { id: p.id || 0, supplier: $('#acy_s', m).value.trim(), date: $('#acy_d', m).value, amount, book_id: +$('#acy_b', m).value, ref: $('#acy_r', m).value.trim(), bill_no: $('#acy_n', m).value.trim(), note: $('#acy_t', m).value.trim() });
      m.remove(); toast(p.id ? 'Payment saved' : 'Payment recorded'); if (done) done();
    } catch (er) { bt.disabled = false; }
  };
  $(p.supplier ? '#acy_a' : '#acy_s', m).focus();
}

function acSupLedger(name, reload) {
  const w = canW('accounts');
  const m = modal(`<div class="mh"><h3>${esc(name)}</h3><button type="button" class="ib" data-x title="Close" aria-label="Close"><i class="i i-x"></i></button></div>
    <div id="acd_lb"><p class="mut">Loading…</p></div>
    <div class="bar acx-mft">${w ? '<button type="button" class="btn" id="acd_lp"><i class="i i-plus"></i> Pay</button><button type="button" class="btn sec" id="acd_la"><i class="i i-plus"></i> Add bill</button>' : ''}<span class="sp"></span><button type="button" class="btn sec" data-x>Done</button></div>`, true);
  let changed = false, d = null;
  const box = $('#acd_lb', m);
  const load = async () => {
    d = await api('acc', 'ac_sup', undefined, '&name=' + encodeURIComponent(name));
    if (!m.isConnected) return;
    box.innerHTML = `<p class="acs-for">${d.balance > 0.004 ? `Owed <b class="acx-neg">${inr2(d.balance)}</b>` : d.balance < -0.004 ? `Advance paid <b>${inr2(-d.balance)}</b>` : 'Nothing owed'} <span class="mut">· bills on credit and payments, oldest first</span></p>
      <div class="card tw"><table class="acx-mt" data-min="640"><colgroup><col style="width:104px"><col><col style="width:120px"><col style="width:120px"><col style="width:120px">${w ? '<col style="width:76px">' : ''}</colgroup>
      <thead><tr><th>Date</th><th>Particulars</th><th class="num">Bill</th><th class="num">Paid</th><th class="num">Balance</th>${w ? '<th><span class="acx-sr">Actions</span></th>' : ''}</tr></thead>
      <tbody>${d.rows.map((r, i) => `<tr data-i="${i}"><td>${acDt(r.date)}</td><td class="acx-nm">${r.kind === 'sheet' && r.project_id ? `<a href="#/accounts/cost/${+r.project_id}">${esc(r.title)}</a>` : esc(r.title)}${r.sub ? `<small class="acs-by">${esc(r.sub)}</small>` : ''}</td>
        <td class="num">${r.bill ? inr2(r.bill) : ''}</td><td class="num">${r.paid ? `<span class="acs-less">${inr2(r.paid)}</span>` : ''}</td><td class="num">${acSigned(r.balance)}</td>
        ${w ? `<td class="acx-act">${r.kind === 'sheet' ? '' : '<button type="button" class="ib" data-a="edit" title="Edit" aria-label="Edit"><i class="i i-pencil"></i></button><button type="button" class="ib" data-a="del" title="Delete" aria-label="Delete"><i class="i i-trash"></i></button>'}</td>` : ''}</tr>`).join('') || `<tr><td colspan="${w ? 6 : 5}" class="mut">Nothing on credit and no payments yet.</td></tr>`}</tbody></table></div>
      <p class="acx-note">A bill with a link is from a Project cost sheet (items marked “Not paid yet”): change it there. Bills added here and payments can be edited or deleted on this list.</p>`;
  };
  const after = async () => { changed = true; try { await load(); } catch (e) { } };
  $$('[data-x]', m).forEach(x => x.onclick = () => { m.remove(); if (changed && reload) reload(); });
  box.addEventListener('click', e => { if (e.target.closest('a[href]')) m.remove(); });
  if (w) {
    $('#acd_lp', m).onclick = () => acSpayForm({ supplier: name === 'Supplier not named' ? '' : name, amount: d && d.balance > 0 ? d.balance : 0 }, after);
    $('#acd_la', m).onclick = () => acBillForm({ supplier: name === 'Supplier not named' ? '' : name }, after);
    box.onclick = async e => {
      const b = e.target.closest('[data-a]'), tr = b && b.closest('tr[data-i]'), r = tr && d.rows[+tr.dataset.i]; if (!r) return;
      b.disabled = true;
      try {
        if (b.dataset.a === 'edit') {
          if (r.kind === 'pay') { const x = await api('acc', 'ac_spay', undefined, '&id=' + r.id); acSpayForm(x.pay, after); } else { const x = await api('acc', 'ac_bill', undefined, '&id=' + r.id); acBillForm(x.bill, after); }
        } else {
          if (!confirm(`Delete this ${r.kind === 'pay' ? 'payment' : 'bill'} of ${inr2(r.kind === 'pay' ? r.paid : r.bill)}?\n\nIt goes to the Recycle bin.`)) { b.disabled = false; return; }
          await api('acc', r.kind === 'pay' ? 'spay_delete' : 'bill_delete', { id: r.id }); toast('Deleted. It is in the Recycle bin.'); await after();
        }
      } catch (er) { }
      if (b.isConnected) b.disabled = false;
    };
  }
  load().catch(() => { box.innerHTML = '<p class="mut">Could not load this supplier.</p>'; });
}

ACCT_TABS.dues = async box => {
  const w = canW('accounts');
  const load = async () => {
    const d = await api('acc', 'ac_dues');
    if (!box.isConnected) return;
    ACD.d = d;
    const rows = d.rows, owing = rows.filter(r => r.balance > 0.004);
    box.innerHTML = `<div class="acx-view"><div class="acx-tiles">
        ${acTile('Owed to suppliers', inr2(d.due.total), `${acPl(d.due.n, 'supplier')} with a balance`, d.due.total > 0 ? 'acx-neg' : '')}
        ${acTile('Biggest balance', owing.length ? inr2(owing[0].balance) : '—', owing.length ? esc(owing[0].name) : 'nothing owed')}
        ${acTile('Bills on credit', inr2(rows.reduce((a, r) => a + r.bills, 0)), `${acPl(rows.reduce((a, r) => a + r.bills_n, 0), 'bill')} in all`)}
        ${acTile('Advance with suppliers', inr2(d.advance), 'paid more than the bills')}</div>
      <div class="bar acx-mbar"><h3 class="acb-h">Suppliers</h3><span class="mut">biggest balance first</span><span class="sp"></span>${w ? '<button type="button" class="btn sec" id="acd_ab"><i class="i i-plus"></i> Add bill</button><button type="button" class="btn" id="acd_pb"><i class="i i-plus"></i> Pay a supplier</button>' : ''}</div>
      <div class="card tw"><table class="acx-mt acd-t" data-min="720"><colgroup><col><col style="width:150px"><col style="width:130px"><col style="width:140px"><col style="width:130px"><col style="width:${w ? 170 : 96}px"></colgroup>
        <thead><tr><th>Supplier</th><th class="num">Bills on credit</th><th class="num">Paid</th><th class="num">Balance</th><th>Last payment</th><th><span class="acx-sr">Actions</span></th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr data-i="${i}"><td class="acx-nm">${esc(r.name)}<small class="acs-by">${acPl(r.bills_n, 'bill')} on credit</small></td><td class="num">${inr2(r.bills)}</td><td class="num">${r.paid ? inr2(r.paid) : '<span class="mut">—</span>'}</td>
          <td class="num">${r.balance > 0.004 ? `<b class="acx-neg">${inr2(r.balance)}</b>` : r.balance < -0.004 ? `<span class="acs-less">${inr2(-r.balance)} advance</span>` : '<span class="mut">Settled</span>'}</td><td>${r.last_paid ? acDt(r.last_paid) : '<span class="mut">None yet</span>'}</td>
          <td class="acx-act">${w && r.key ? '<button type="button" class="btn sec sm" data-d="pay">Pay</button>' : ''}<button type="button" class="btn sec sm" data-d="led">Ledger</button></td></tr>`).join('')
          || '<tr><td colspan="6" class="mut">Nothing is owed. Items marked Purchased with “Not paid yet” on a Project cost sheet, and bills added here, appear on this list.</td></tr>'}</tbody></table></div>
      <p class="acx-note">A supplier's balance is the bills bought on credit less the payments made. Bills on credit are the purchased items marked “Not paid yet” on Project cost sheets, and the bills added here for stock or old balances. Items paid at the time of purchase are not here: they are already in Cash &amp; bank. Payments are taken off the supplier's balance as a whole, not bill by bill.</p></div>`;
    if (w) {
      $('#acd_ab', box).onclick = () => acBillForm({}, load);
      $('#acd_pb', box).onclick = () => acSpayForm({}, load);
    }
    $('.acd-t', box).onclick = e => {
      const b = e.target.closest('[data-d]'), tr = b && b.closest('tr[data-i]'), r = tr && rows[+tr.dataset.i]; if (!r) return;
      if (b.dataset.d === 'pay') acSpayForm({ supplier: r.name, amount: r.balance > 0 ? r.balance : 0 }, load); else acSupLedger(r.name, load);
    };
    if (typeof fitSoon === 'function') fitSoon();
  };
  await load();
};
