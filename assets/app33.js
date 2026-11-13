/* Accounts page (assets/app33.js): the sidebar's Accounts entry.
   #/accounts/<tab>          tab bar + period bar + the tab's content; tab = overview | pending | received | profit | expenses | materials
   #/accounts/cost/<project> the project's Project cost sheet (acCostSheet, app34.js); Pending, Received and Profit rows have a Project cost button to it
   route() turns the word after #/accounts/ into NaN, so pgAccounts reads location.hash itself.
   ACCT_TABS: tab key -> async (box, period) => void, period = {key, from, to, label, kind} (ACC.period; key goes to the API as &period=).
   Each run paints into a fresh box inside #acx_box, so a slow answer for a period the user already left lands in a box that is no longer
   on the page; a tab that fails to load shows its message (and Try again) in its box.
   A tab not registered yet shows "Coming in the next step". Tabs listed in ACCT_NOPER have no period bar.
   The chosen period is kept per browser in localStorage.accPeriod ('YYYY-MM' or 'fy-26-27'). Uses ACC (app32.js).
   Tabs here: overview, pending, received, profit, expenses (materials: app34.js). Also:
   acRemind(row, done)       WhatsApp payment reminder for a pending project (template ac_tpl.remind), logged as acc/log kind 'remind'
   acAddPayment(row, done)   + Payment on a pending project (payments/save), then its receipt (acReceipt) when it can be made
   Uses acTpl / acLog / acReceipt / acKw / acWhen / acIsCash (app35.js), acPl / acNum / acV / ACX_GSTS (app34.js), inr2 / fdt (app18.js). */
const ACCT_TAB_NAMES = [['overview', 'Overview'], ['books', 'Cash & bank'], ['dues', 'Supplier dues'], ['gst', 'GST'], ['progress', 'In progress'], ['done', 'Completed'], ['pending', 'Pending payments'], ['received', 'Payments received'], ['profit', 'Project profit'], ['expenses', 'Expenses'], ['materials', 'Price list']];
const ACCT_TABS = {};
const ACCT_NOPER = ['pending', 'materials', 'progress', 'done', 'dues']; /* lists as they stand today: no month to choose */

const acP2 = n => String(n).padStart(2, '0');
/* the financial year of a date, as used in document numbers: '2026-11-12' -> '26-27' */
const acFy = d => { const y = +String(d).slice(0, 4), s = +String(d).slice(5, 7) >= 4 ? y : y - 1; return `${acP2(s % 100)}-${acP2((s + 1) % 100)}`; };
const acPerOk = s => /^(\d{4}-(0[1-9]|1[0-2])|fy-\d\d-\d\d)$/.test(s || '');
const acPerKey = () => { let s = ''; try { s = localStorage.accPeriod || ''; } catch (e) { } return acPerOk(s) ? s : today().slice(0, 7); };
const acPerSet = s => { try { localStorage.accPeriod = s; } catch (e) { } };
/* one step back (-1) or forward (+1): a month in month view, a financial year in FY view */
function acPerStep(s, n) {
  const fy = /^fy-(\d\d)-(\d\d)$/.exec(s);
  if (fy) { const a = (+fy[1] + n + 100) % 100; return `fy-${acP2(a)}-${acP2((a + 1) % 100)}`; }
  const [y, m] = s.split('-').map(Number), t = y * 12 + m - 1 + n;
  return `${Math.floor(t / 12)}-${acP2(t % 12 + 1)}`;
}

async function pgAccounts() {
  const part = location.hash.replace(/^#\/?/, '').split('/');
  if (part[1] === 'cost') return acCostSheet(parseInt(part[2], 10) || 0);
  const tab = ACCT_TAB_NAMES.some(t => t[0] === part[1]) ? part[1] : 'overview', label = ACCT_TAB_NAMES.find(t => t[0] === tab)[1];
  $('#title').innerHTML = `<span class="ft t-accounts"><i class="i i-coin"></i></span><span class="ttl">Accounts</span><span class="mut ttls">› ${esc(label)}</span>`;
  const main = $('#main');
  main.innerHTML = `<div class="acx-pg"><div class="acx-hd"><div class="tabs acx-tabs" role="tablist">${ACCT_TAB_NAMES.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === tab}" data-acx-tab="${k}" class="${k === tab ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>${ME.role === 'admin' ? '<button type="button" class="btn sec sm" data-acx-tpl title="Edit the email and WhatsApp wording"><i class="i i-gear"></i> Templates</button>' : ''}</div>
    <div class="acx-per" id="acx_per"></div><div id="acx_box"><p class="mut">Loading…</p></div></div>`;
  $$('[data-acx-tab]', main).forEach(b => b.onclick = () => { location.hash = '#/accounts/' + b.dataset.acxTab; });
  const box = $('#acx_box', main), per = $('#acx_per', main);
  const gear = $('[data-acx-tpl]', main); if (gear) gear.onclick = () => acTplEditor();
  const run = async () => {
    const key = acPerKey(), P = Object.assign({ key }, ACC.period(key)), now = today(), month = now.slice(0, 7), fy = 'fy-' + acFy(now);
    per.hidden = ACCT_NOPER.includes(tab);
    if (!per.hidden) {
      per.innerHTML = `<button type="button" class="ib acx-step" data-acx-p="-1" title="${P.kind === 'fy' ? 'Previous financial year' : 'Previous month'}" aria-label="Previous">‹</button>
        <b class="acx-perl">${esc(P.label)}</b>
        <button type="button" class="ib acx-step" data-acx-p="1" title="${P.kind === 'fy' ? 'Next financial year' : 'Next month'}" aria-label="Next">›</button>
        <span class="sp"></span>
        <button type="button" class="btn sec sm ${key === month ? 'on' : ''}" data-acx-p="m">This month</button><button type="button" class="btn sec sm ${key === fy ? 'on' : ''}" data-acx-p="fy">This FY</button>`;
      $$('[data-acx-p]', per).forEach(b => b.onclick = () => {
        const v = b.dataset.acxP;
        acPerSet(v === 'm' ? month : v === 'fy' ? fy : acPerStep(key, +v));
        run();
      });
    }
    const fn = ACCT_TABS[tab];
    if (!fn) { box.innerHTML = `<div class="card acx-soon"><b>${esc(label)}</b><span class="mut">Coming in the next step.</span></div>`; return; }
    /* each run paints into its own box: an answer for a period the user already left lands in a box that is gone from the page */
    const tb = document.createElement('div');
    tb.innerHTML = '<p class="mut">Loading…</p>';
    box.innerHTML = ''; box.appendChild(tb);
    try { await fn(tb, P); }
    catch (e) {
      if (!(e && e.error)) console.error(e); /* api() has already shown the server's message */
      if (!tb.isConnected) return;
      tb.innerHTML = `<div class="card acx-err"><b>${esc(label)} could not be loaded</b><span class="mut">${esc((e && (e.error || e.message)) || 'Please try again.')}</span><button type="button" class="btn sec sm" data-acx-retry><i class="i i-refresh"></i> Try again</button></div>`;
      $('[data-acx-retry]', tb).onclick = () => run();
    }
  };
  await run();
}

/* ---------- shared by the list tabs ---------- */
const ACX_MODES = ['UPI', 'Bank transfer', 'Cash', 'Cheque', 'Card', 'Loan', 'Subsidy']; /* payment modes, as on the Tax bill tab (app18.js) */
const ACX_XMODES = ['UPI', 'Bank transfer', 'Cash', 'Cheque', 'Card']; /* how the company paid an expense */
const ACX_FIXED = ['Ads', 'AI tools', 'Other']; /* expense categories always kept: the Overview shows Ads and AI tools, every other category counts as Other */
const ACX_REMIND = 'Dear {customer}, a balance of ₹{pending} is pending for your {kw} kW solar plant. Kindly pay at the earliest. Account: {bank_details}. Thank you, {company}.';
const ACX_DC = new Map(); /* fdt() answers by date: long lists repeat the same few dates */
const acDt = s => { s = String(s || '').slice(0, 10); if (!s) return '—'; let v = ACX_DC.get(s); if (v === undefined) { v = fdt(s); ACX_DC.set(s, v); } return v; };
/* whole days from a date (YYYY-MM-DD) to today; both read as UTC midnight, so no time zone shift */
const acDays = s => Math.round((Date.parse(today()) - Date.parse(String(s).slice(0, 10))) / 864e5);
const acAgo = n => n <= 0 ? 'today' : n === 1 ? '1 day' : `${n} days`;
/* a log time (UTC 'YYYY-MM-DD HH:MM:SS', SQLite CURRENT_TIMESTAMP) as the local date */
const acDay = s => { const d = new Date(String(s || '').replace(' ', 'T') + 'Z'); return isNaN(d) ? String(s || '').slice(0, 10) : `${d.getFullYear()}-${acP2(d.getMonth() + 1)}-${acP2(d.getDate())}`; };
const acSigned = n => (+n < 0 ? '−' : '') + inr2(Math.abs(+n || 0));
const acPct = n => `${ACC.r2(n)}%`;
const acLoan = r => r.loan === 'Yes' ? ' <span class="pill acx-tag">Loan</span>' : '';
const acCanRemind = () => canW('payments') || canW('accounts'); /* the reminder is logged (acc/log needs payments or accounts write) */
const acQ = s => String(s || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
const acPer = P => `&period=${encodeURIComponent(P.key)}`;
/* the company's bank account in one line for the reminder ({bank_details}); company.bank = {bank, name, account, ifsc} (Quotation maker settings) */
const acBankLine = co => { const b = (co && co.bank) || {}, t = v => String(v || '').trim();
  return [t(b.name) && 'A/c name ' + t(b.name), t(b.account) && 'A/c no. ' + t(b.account), t(b.bank), t(b.ifsc) && 'IFSC ' + t(b.ifsc)].filter(Boolean).join(', '); };
const acTile = (label, val, sub, cls, href, title) => `<${href ? `a href="${href}"` : 'div'} class="card acx-t ${href ? 'acx-go' : ''} ${cls || ''}"${title ? ` title="${esc(title)}"` : ''}><small>${label}</small><b>${val}</b><em>${sub}</em></${href ? 'a' : 'div'}>`;
const acTone = n => +n < 0 ? 'acx-neg' : +n > 0 ? 'acx-pos' : '';
/* a row's Project cost button: the project's Project cost sheet (purchases, services, commission / incentive, profit) */
const acExpBtn = pid => +pid ? `<a class="btn sec sm" href="#/accounts/cost/${+pid}" title="Project cost sheet of this project"><i class="i i-coin"></i> Project cost</a>` : '';
/* run fn() once the modal m is closed (any way: its buttons, the backdrop, or a share that leaves the page) */
function acOnClose(m, fn) {
  if (!(m instanceof Element)) return;
  const mo = new MutationObserver(() => { if (!m.isConnected) { mo.disconnect(); fn(); } });
  mo.observe(document.body, { childList: true });
}
/* rows into a table's body: the first LAZY_FIRST now, the next ones as the last row scrolls into view (lazyMore, app.js) */
function acFill(tb, rows, html, empty) {
  const body = tb.tBodies[0], cols = tb.tHead ? tb.tHead.rows[0].cells.length : 1;
  let n = Math.min(rows.length, LAZY_FIRST);
  body.innerHTML = rows.slice(0, n).map(html).join('') || `<tr><td colspan="${cols}" class="mut">${empty}</td></tr>`;
  lazyMore(tb, step => { const next = rows.slice(n, n + step); body.insertAdjacentHTML('beforeend', next.map(html).join('')); n += next.length; return n < rows.length; }, n < rows.length);
}

/* ---------- pending projects (Overview's top 10 and the Pending payments tab) ---------- */
const acPendHead = rem => `<thead><tr><th>Customer</th><th class="num">Plant</th><th class="num">Project price</th><th class="num">Received</th><th class="num">Pending</th><th>Last payment</th>${rem ? '<th>Last reminder</th>' : ''}<th><span class="acx-sr">Actions</span></th></tr></thead><tbody></tbody>`;
const acRemCell = r => r.last_remind ? `${acDt(acDay(r.last_remind.at))}${r.last_remind.by ? `<span class="mut"> · ${esc(r.last_remind.by)}</span>` : ''}` : '<span class="mut">—</span>';
/* r.cust_due = what the customer still owes (on a loan project only their own share, price − loan amount); r.bank_only = a loan project
   where only the bank's part is left: no reminder (the customer owes nothing) */
function acPendRow(r, rem) {
  const kw = acKw(r.kw), n = r.last_pay ? acDays(r.last_pay) : 0, part = r.loan === 'Yes' && !r.bank_only && +r.cust_due < +r.due;
  const acts = (!r.early && !r.bank_only && acCanRemind() ? `<button type="button" class="btn sec sm" data-acx-a="remind" title="WhatsApp payment reminder for ${esc(inr2(ACC.remindDue(r)))}: opens WhatsApp with the message ready"><i class="i i-whatsapp"></i> Reminder</button>` : '')
    + (canW('payments') ? '<button type="button" class="btn sec sm" data-acx-a="pay" title="Record a payment received"><i class="i i-plus"></i> Payment</button>' : '')
    + acExpBtn(r.id)
    + `<a class="ib" href="#/customers/${+r.customer_id}" title="Open customer" aria-label="Open customer"><i class="i i-user"></i></a>`;
  return `<tr data-id="${+r.id}"><td class="acx-cn"><a href="#/customers/${+r.customer_id}">${esc(r.customer || r.title || '')}</a>${acLoan(r)}${r.bank_only ? ' <span class="pill b acx-tag" title="The customer has paid their share; the rest comes from the loan bank, so there is no reminder">Bank\'s part only</span>' : ''}${r.stage ? `<small>${esc(r.stage)}</small>` : ''}</td>
    <td class="num">${kw ? esc(kw) + ' kW' : '<span class="mut">—</span>'}</td><td class="num">${inr2(r.cost)}</td><td class="num">${inr2(r.paid)}</td><td class="num over">${inr2(r.due)}${part ? `<small class="acx-cp" title="The customer's own share (price − loan amount) still unpaid; the rest comes from the bank">customer ${inr2(r.cust_due)}</small>` : ''}</td>
    <td>${r.last_pay ? `${acDt(r.last_pay)} <span class="${n > 30 ? 'acx-late' : 'mut'}">· ${acAgo(n)}</span>` : '<span class="mut">None yet</span>'}</td>
    ${rem ? `<td data-acx-rm>${acRemCell(r)}</td>` : ''}<td class="acx-act">${acts}</td></tr>`;
}
/* the row buttons of a pending table: rows() = the rows behind it, reload() after a payment */
function acPendBind(tb, rows, reload) {
  tb.onclick = async e => {
    const b = e.target.closest('[data-acx-a]'), tr = b && b.closest('tr[data-id]'), r = tr && rows().find(x => x.id === +tr.dataset.id);
    if (!r || b.disabled) return;
    if (b.dataset.acxA === 'pay') return acAddPayment(r, reload);
    b.disabled = true;
    try { await acRemind(r, () => { const c = tb.querySelector(`tr[data-id="${r.id}"] [data-acx-rm]`); if (c) c.innerHTML = acRemCell(r); }); }
    finally { b.disabled = false; }
  };
}

/* WhatsApp payment reminder. r = a pending row {id: project, customer_id, customer, phone, kw, due, cust_due, bank_only}. The admin's template
   (ac_tpl.remind) is filled in ({pending} = ACC.remindDue: on a loan project only the customer's own part, never the bank's money) and WhatsApp
   opens to the customer with the message ready (staff press send there); then it is logged (acc/log kind 'remind') and done(r) runs with
   r.last_remind set. A log that fails never stops the reminder. */
async function acRemind(r, done) {
  if (r.bank_only || !(ACC.remindDue(r) > 0)) { toast("Only the bank's part is left on this project, so the customer owes nothing.", true); return false; }
  if (!String(r.phone || '').replace(/\D/g, '')) { toast('This customer has no phone number. Add it on the customer page.', true); return false; }
  /* the window opens right at the click: a pop-up opened after the template arrives can be blocked */
  const win = window.open('', '_blank');
  if (win) { try { win.opener = null; win.document.title = 'WhatsApp'; win.document.body.textContent = 'Opening WhatsApp…'; } catch (e) { } }
  let T;
  try { T = await acTpl(); }
  catch (e) { if (win && !win.closed) win.close(); if (!(e && e.error)) toast('Could not load the reminder message. Check the connection and try again.', true); return false; }
  const co = T.company || {}, bank = acBankLine(co);
  const text = ACC.fill(String(T.remind || '').trim() ? T.remind : ACX_REMIND, { customer: r.customer || '', pending: ACC.remindDue(r), kw: acKw(r.kw), company: co.name || '', bank_details: bank, bank });
  const url = ACC.waLink(r.phone, text);
  if (win && !win.closed) win.location.href = url;
  else {
    const w2 = window.open(url, '_blank');
    if (!w2) { toast('The browser blocked the WhatsApp window. Allow pop-ups for this site, then try again.', true); return false; }
    try { w2.opener = null; } catch (e) { }
  }
  const ok = await acLog({ kind: 'remind', customer_id: r.customer_id, project_id: r.id, via: 'whatsapp', to_whom: 'customer',
    onLogged: s => { r.last_remind = { at: s.created, by: s.who }; if (done) done(r); } }, r.phone);
  const warn = [!bank && 'The company bank account is not set (Quotation maker settings), so the message has no account details: add them in WhatsApp before sending.',
    !ok && 'The reminder could not be recorded.'].filter(Boolean).join(' ');
  toast(warn || 'Reminder ready in WhatsApp. Press send there.', !!warn);
  return true;
}

/* + Payment on a pending row; done() redraws the list */
function acAddPayment(r, done) { acPayForm({ pid: r.id, customer: r.customer, kw: r.kw, loan: r.loan, due: r.due }, null, { done }); }
/* A payment belongs to a project: a customer who has none gets it started with the plant cost first (gen/cost). Gives the project id, or 0 after saying why not. */
async function acProjectFor(customerId, cost) {
  if (!(+cost > 0)) { toast('Enter the total plant cost first, on the customer’s Payments tab', true); return 0; }
  try { return +(await api('gen', 'cost', { kind: 'tax', customer_id: customerId, cost: +cost })).acct.project_id || 0; } catch (e) { return 0; }
}

/* The payment form: date, amount, mode, reference no., who paid (loan projects), note -> payments/save; then the receipt when it can be made
   (a reference no., or cash). j = {pid, customer, kw?, loan, due?}; p = a saved payment to correct (a receipt that needs its reference no.);
   o = {done(), why: the reason shown, open(id): opens the receipt (default acReceipt)}. */
function acPayForm(j, p, o = {}) {
  const loan = j.loan === 'Yes', src = p && p.src === 'bank' ? 'bank' : 'customer', due = +j.due || 0, kw = acKw(j.kw);
  const modes = p && p.mode && !ACX_MODES.includes(p.mode) ? ACX_MODES.concat(p.mode) : ACX_MODES;
  const info = [kw && kw + ' kW', loan && 'Loan project', due > 0 && inr2(due) + ' pending'].filter(Boolean);
  const m = modal(`<div class="mh"><h3>${p ? 'Edit payment' : 'Add payment'} · ${esc(j.customer || '')}</h3><button type="button" class="ib" data-x title="Close" aria-label="Close"><i class="i i-x"></i></button></div>
    ${o.why ? `<p class="mfw acx-top0">${esc(o.why)}</p>` : !p && info.length ? `<p class="mut acx-small acx-top0">${info.map(esc).join(' · ')}</p>` : ''}
    <div class="two"><div><label for="acx_yd">Date</label><input type="date" id="acx_yd" value="${esc(p ? p.date : today())}"></div>
     <div><label for="acx_ya">Amount (₹)</label><input id="acx_ya" inputmode="decimal" autocomplete="off" value="${p ? acV(p.amount) : ''}">${!p && due > 0 ? `<button type="button" class="acx-link acx-small" id="acx_yfull">Whole pending amount, ${inr2(due)}</button>` : ''}</div>
     <div><label for="acx_ym">Mode</label><select id="acx_ym">${modes.map(x => `<option ${p && x === p.mode ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
     <div><label for="acx_yr">Reference no.</label><input id="acx_yr" maxlength="60" autocomplete="off" value="${esc(p ? p.ref_no || '' : '')}"></div>
     ${loan || src === 'bank' ? `<div><label for="acx_ys">From</label><select id="acx_ys"><option value="customer">Customer</option><option value="bank" ${src === 'bank' ? 'selected' : ''}>Bank (loan)</option></select></div>` : ''}
     <div class="full"><label for="acx_yn">Note</label><input id="acx_yn" maxlength="120" value="${esc(p ? p.note || '' : '')}" ${SPELL}></div></div>
    <p class="acx-note acx-top8">A receipt needs the reference number (UTR / cheque / transaction no.) unless the payment is in cash.${p && p.receipt_no ? ' The receipt keeps its number.' : ''}</p>
    <div class="bar acx-mft"><button type="button" class="btn" id="acx_ygo">${p ? 'Save' : 'Save payment'}</button><button type="button" class="btn sec" data-x>Cancel</button></div>`);
  const amt = $('#acx_ya', m), ref = $('#acx_yr', m), mode = $('#acx_ym', m), from = $('#acx_ys', m);
  const ph = () => { ref.placeholder = mode.value === 'Cash' ? 'Optional for cash' : 'UTR / cheque / transaction no.'; };
  let autoBank = false; /* mode Loan puts From on Bank; another mode puts it back, unless Bank was picked by hand */
  mode.onchange = () => { ph(); if (!from) return; if (mode.value === 'Loan') { if (from.value !== 'bank') { from.value = 'bank'; autoBank = true; } } else if (autoBank) { from.value = 'customer'; autoBank = false; } };
  if (from) from.onchange = () => { autoBank = false; };
  ph();
  $$('[data-x]', m).forEach(b => b.onclick = () => m.remove());
  if ($('#acx_yfull', m)) $('#acx_yfull', m).onclick = () => { amt.value = String(ACC.r2(due)); amt.focus(); };
  $('#acx_ygo', m).onclick = async e => {
    const a = acNum(amt.value);
    if (!a) { toast('Enter the amount received', true); amt.focus(); return; }
    if (!p && due > 0 && a > due + 1 && !confirm(`${inr2(a)} is more than the ${inr2(due)} pending on this project.\n\nSave it anyway?`)) return;
    const b = e.currentTarget; b.disabled = true;
    /* src is always sent: a save without it would turn a bank payment into a customer one */
    const x = { project_id: j.pid, date: $('#acx_yd', m).value || today(), amount: a, mode: mode.value, ref_no: ref.value.trim(), note: $('#acx_yn', m).value.trim(), src: $('#acx_ys', m) ? $('#acx_ys', m).value : src };
    if (p) x.id = p.id;
    let id = 0;
    try { id = +(await api('payments', 'save', x)).id || (p ? p.id : 0); } catch (er) { b.disabled = false; return; }
    m.remove();
    if (o.done) o.done();
    if (!acIsCash(x) && !x.ref_no) { toast(`Payment ${p ? 'saved' : 'added'}. Add its reference number to make the receipt.`, true); return; }
    toast(`Payment ${p ? 'saved' : 'added'}`);
    if (id) (o.open || acReceipt)(id);
  };
  setTimeout(() => (o.why ? ref : amt).focus(), 50);
}

/* ---------- Overview ---------- */
ACCT_TABS.overview = async (box, P) => {
  const [d, bk] = await Promise.all([api('acc', 'ac_overview', undefined, acPer(P)), api('acc', 'ac_books').catch(() => null)]);
  if (!box.isConnected) return;
  const x = d.expenses || {}, top = d.top || [], n = +d.pending_n || 0, nc = +d.no_cost_n || 0;
  /* billed projects with no cost lines are left out of the profit: said on the tile, so a missing cost sheet never reads as a loss or a gain */
  const pSub = `before GST · ${acPl(+d.profit_n || 0, 'project')} counted${nc ? ` · <span class="acx-late">${acPl(nc, 'billed project')} without cost — left out</span>` : ''}`;
  box.innerHTML = `<div class="acx-view"><div class="acx-tiles ${bk ? 'acx-t6' : 'acx-t5'}">
      ${bk ? acTile('Cash & bank', acSigned(bk.total), bk.books.filter(b => !b.hidden).map(b => `${esc(b.name)} ${acSigned(b.balance)}`).join(' · ') + (bk.due.n ? ` · owed to suppliers ${inr2(bk.due.total)}` : ''), acTone(bk.total), '#/accounts/books', 'What is in cash and in the bank accounts today, whatever the period') : ''}
      ${acTile('Customers in progress', +d.track_open_n || 0, `${+d.track_done_n || 0} completed`, '', '#/accounts/progress', 'Every customer shown in Accounts, until they are moved to Completed')}
      ${acTile('Received', inr2(d.received), `${acPl(+d.received_n || 0, 'payment')} in ${esc(P.label)}`, '', '#/accounts/received')}
      ${acTile('Pending', inr2(d.pending), `${acPl(n, 'project')} · ${+d.pending_loan_n || 0} loan`, +d.pending > 0 ? 'acx-neg' : '', '#/accounts/pending', 'Still due today, whatever the period')}
      ${acTile('Expenses', inr2(x.total), `Ads ${inr2(x.ads)} · AI ${inr2(x.ai)} · Other ${inr2(x.other)}`, '', '#/accounts/expenses', 'Before GST. Ads include the campaign spend from Meta Ads.')}
      ${acTile('Profit (projects billed − expenses)', acSigned(d.profit), pSub, acTone(d.profit), '#/accounts/profit', 'Profit of the projects whose tax bill was issued in the period, less the company expenses' + (nc ? '. Projects billed without a Project cost sheet are left out until their cost is entered (see Project profit).' : ''))}</div>
    <div class="acx-ch"><h3>Pending payments</h3><span class="mut acx-small">${n ? 'biggest first' : ''}</span><span class="sp"></span>${n > top.length ? `<a class="btn sec sm" href="#/accounts/pending">See all ${n}</a>` : ''}</div>
    <div class="card tw"><table class="acx-pt" data-min="990">${acPendHead(false)}</table></div></div>`;
  const tb = $('table', box);
  acFill(tb, top, r => acPendRow(r, false), 'Nothing pending. Every project past the early stages is paid.');
  acPendBind(tb, () => top, () => { if (box.isConnected) pgAccounts(); });
  if (top.length && acCanRemind()) acTpl().catch(() => { });
};

/* ---------- In progress / Completed: customers tracked from their first payment (acc/ac_track) ---------- */
const ACXT = { q: '', f: 'all' };
const ACXT_F = [['all', 'All'], ['none', 'No payment yet'], ['due', 'Balance due'], ['full', 'Fully paid']];
/* where the customer's project stands: its stage and how far along the pipeline that is */
const acStage = r => { const L = S.project_stages || [], i = L.indexOf(r.stage); if (!r.stage) return '<span class="mut">No project</span>';
  return `<span class="acx-ip-st">${esc(r.stage)}</span>${i >= 0 ? `<span class="acx-ip-bar" title="Step ${i + 1} of ${L.length}"><i style="width:${Math.round((i + 1) / L.length * 100)}%"></i></span><small class="mut">Step ${i + 1} of ${L.length}</small>` : ''}`; };
function acTrackRow(r, done) {
  const kw = acKw(r.kw), pct = r.cost > 0 ? Math.min(100, Math.round(r.paid / r.cost * 100)) : 0, n = r.last_pay ? acDays(r.last_pay) : 0;
  const acts = done ? (canW('accounts') ? '<button type="button" class="btn sec sm" data-acx-a="back" title="Move back to In progress"><i class="i i-undo"></i> Move back</button>' : '')
    : (canW('payments') ? '<button type="button" class="btn sec sm" data-acx-a="pay" title="Record a payment received"><i class="i i-plus"></i> Payment</button>' : '')
      + (canW('accounts') ? `<button type="button" class="btn ${r.full ? '' : 'sec'} sm" data-acx-a="done" title="${r.full ? 'The payment is complete: move to Completed' : 'Move to Completed'}"><i class="i i-check"></i> Completed</button>` : '');
  return `<tr data-id="${r.customer_id}"><td class="acx-cn"><a href="#/customers/${r.customer_id}">${esc(r.customer || '')}</a>${acLoan(r)}${r.full && !done ? ' <span class="pill g acx-tag">Fully paid</span>' : ''}${done && r.due > 1 ? ' <span class="pill r acx-tag">Balance due</span>' : ''}<small>${[r.phone, kw && kw + ' kW', r.projects > 1 && r.projects + ' projects'].filter(Boolean).map(esc).join(' · ')}</small></td>
    <td class="acx-ip-sc">${acStage(r)}</td>
    <td class="num">${r.cost > 0 ? inr2(r.cost) : '<span class="mut" title="Enter the total plant cost on the customer’s Overview">Not entered</span>'}</td>
    <td class="num">${inr2(r.paid)}${r.cost > 0 ? `<small class="acx-ip-pc">${pct}%</small>` : ''}</td>
    <td class="num ${r.due > 1 ? 'over' : ''}">${r.cost > 0 ? inr2(r.due) : '<span class="mut">—</span>'}</td>
    <td>${done ? `${acDt(acDay(r.done_at))}${r.done_by ? `<span class="mut"> · ${esc(r.done_by)}</span>` : ''}` : r.last_pay ? `${acDt(r.last_pay)} <span class="mut">· ${acAgo(n)}</span>` : '<span class="mut">No payment yet</span>'}</td>
    <td class="acx-act">${acts}${acExpBtn(r.project_id)}<a class="ib" href="#/customers/${r.customer_id}" title="Open customer" aria-label="Open customer"><i class="i i-user"></i></a></td></tr>`;
}
async function acTrackTab(box, done) {
  const load = () => api('acc', 'ac_track', undefined, done ? '&state=done' : '');
  let d = await load();
  if (!box.isConnected) return;
  box.innerHTML = `<div class="acx-view"><div class="acx-tiles" data-acx-tiles></div>
    <div class="bar acx-fbar"><input type="search" data-acx-q placeholder="Search customer, phone, stage…" value="${esc(ACXT.q)}" autocomplete="off" aria-label="Search customers">
      ${done ? '' : `<div class="tabs">${ACXT_F.map(([k, l]) => `<button type="button" data-acx-f="${k}" class="${ACXT.f === k ? 'on' : ''}">${l} <span class="acx-n"></span></button>`).join('')}</div>`}
      <span class="sp"></span>${!done && canW('accounts') ? '<button type="button" class="btn sec sm" data-acx-all hidden></button>' : ''}</div>
    <div class="card tw"><table class="acx-pt" data-min="1090"><thead><tr><th>Customer</th><th>Project</th><th class="num">Plant cost</th><th class="num">Received</th><th class="num">Pending</th><th>${done ? 'Completed' : 'Last payment'}</th><th><span class="acx-sr">Actions</span></th></tr></thead><tbody></tbody></table></div>
    <p class="acx-note">${done ? 'Customers whose payment is complete, moved here from In progress. Move back returns one to In progress.'
      : 'Every customer is on this list from the day they are added, until moved to Completed. Completed is for a customer whose payment is complete; an admin can also close one with a balance left. To take a customer off Accounts, switch off “Show in Accounts” on their Payments tab.'}</p></div>`;
  const tb = $('table', box); let L = [];
  const pass = (r, f) => f === 'all' || (f === 'none' ? !(r.pays > 0) : f === 'full' ? !!r.full : !r.full && r.pays > 0);
  const draw = () => {
    const rows = d.rows || [], q = acQ(ACXT.q), hit = q.length ? rows.filter(r => q.every(t => [r.customer, r.phone, r.stage, r.title, r.kw && r.kw + ' kw'].join(' ').toLowerCase().includes(t))) : rows;
    L = done ? hit : hit.filter(r => pass(r, ACXT.f));
    $$('[data-acx-f]', box).forEach(b => { b.classList.toggle('on', b.dataset.acxF === ACXT.f); $('.acx-n', b).textContent = hit.filter(r => pass(r, b.dataset.acxF)).length; });
    const sum = k => ACC.r2(rows.reduce((s, r) => s + (+r[k] || 0), 0)), full = rows.filter(r => r.full).length;
    $('[data-acx-tiles]', box).innerHTML = done
      ? acTile('Completed', rows.length, `${acPl(rows.length, 'customer')} with the payment complete`) + acTile('Plant cost', inr2(sum('cost')), 'of these customers') + acTile('Received', inr2(sum('paid')), 'in all', 'acx-pos') + acTile('In progress', +d.open_n || 0, 'still being paid', '', '#/accounts/progress')
      : acTile('In progress', rows.length, `${acPl(rows.length, 'customer')} · ${full} fully paid`) + acTile('Plant cost', inr2(sum('cost')), 'of these customers') + acTile('Received', inr2(sum('paid')), 'so far', 'acx-pos') + acTile('Pending', inr2(sum('due')), `still to come · ${+d.done_n || 0} completed`, sum('due') > 0 ? 'acx-neg' : '', '#/accounts/done', 'Open Completed');
    const all = $('[data-acx-all]', box); if (all) { all.hidden = !full; all.innerHTML = `<i class="i i-check"></i> Move ${acPl(full, 'fully paid customer')} to Completed`; }
    acFill(tb, L, r => acTrackRow(r, done), rows.length ? 'Nothing matches.' : done ? 'No customer has been moved to Completed yet.' : 'No customer is in progress.');
  };
  const reload = async () => { try { d = await load(); } catch (e) { return; } if (box.isConnected) draw(); };
  tb.onclick = async e => {
    const b = e.target.closest('[data-acx-a]'), tr = b && b.closest('tr[data-id]'), r = tr && L.find(x => x.customer_id === +tr.dataset.id);
    if (!r || b.disabled) return;
    const a = b.dataset.acxA;
    if (a === 'pay') { let pid = r.project_id; if (!pid) { b.disabled = true; pid = await acProjectFor(r.customer_id, r.cost); b.disabled = false; if (!pid) return; }
      return acPayForm({ pid, customer: r.customer, kw: r.kw, loan: r.loan, due: r.due }, null, { done: reload }); }
    let body = { customer_id: r.customer_id, done: a === 'done' ? 1 : 0 };
    if (a === 'done' && !r.full) { /* a balance is left (or no plant cost): only an admin may close it, after a confirm */
      if (ME.role !== 'admin') return toast(r.cost > 0 ? `${inr2(r.due)} is still pending, so this customer stays In progress.` : 'Enter the total plant cost first.', true);
      if (!confirm(r.cost > 0 ? `${inr2(r.due)} is still pending for ${r.customer}.\n\nMove to Completed anyway?` : `No plant cost is entered for ${r.customer}.\n\nMove to Completed anyway?`)) return;
      body.force = 1;
    }
    b.disabled = true;
    try { await api('acc', 'track_set', body); toast(r.customer + (a === 'done' ? ' moved to Completed' : ' moved back to In progress')); await reload(); } catch (x) { b.disabled = false; }
  };
  const all = $('[data-acx-all]', box);
  if (all) all.onclick = async () => { const n = (d.rows || []).filter(r => r.full).length; if (!confirm(`Move ${acPl(n, 'fully paid customer')} to Completed?`)) return;
    all.disabled = true; try { const r = await api('acc', 'track_all', {}); toast(`${acPl(+r.moved || 0, 'customer')} moved to Completed`); await reload(); } catch (x) { } finally { all.disabled = false; } };
  const drawSoon = debounce(draw, 120);
  $('[data-acx-q]', box).oninput = e => { ACXT.q = e.target.value; drawSoon(); };
  $$('[data-acx-f]', box).forEach(b => b.onclick = () => { ACXT.f = b.dataset.acxF; draw(); });
  draw();
}
ACCT_TABS.progress = box => acTrackTab(box, false);
ACCT_TABS.done = box => acTrackTab(box, true);

/* ---------- Pending payments ---------- */
const ACXP = { f: 'all', q: '' };
const ACXP_F = [['all', 'All'], ['loan', 'Loan'], ['nloan', 'Not loan'], ['early', 'Not started']];
const acPendPass = (r, f) => f === 'early' ? !!r.early : !r.early && (f === 'all' || (f === 'loan') === (r.loan === 'Yes'));
ACCT_TABS.pending = async box => {
  const load = async () => (await api('acc', 'ac_pending', undefined, '&early=1')).rows || [];
  let rows = await load();
  if (!box.isConnected) return;
  box.innerHTML = `<div class="acx-view"><div class="bar acx-fbar"><input type="search" data-acx-q placeholder="Search customer, phone, stage…" value="${esc(ACXP.q)}" autocomplete="off" aria-label="Search pending payments">
      <div class="tabs">${ACXP_F.map(([k, l]) => `<button type="button" data-acx-f="${k}" class="${ACXP.f === k ? 'on' : ''}">${l} <span class="acx-n"></span></button>`).join('')}</div>
      <span class="sp"></span><span class="acx-sum" aria-live="polite"></span></div>
    <div class="card tw"><table class="acx-pt" data-min="1090">${acPendHead(true)}</table></div>
    <p class="acx-note" data-acx-note></p></div>`;
  const tb = $('table', box);
  let L = [];
  const draw = () => {
    const q = acQ(ACXP.q), hit = q.length ? rows.filter(r => q.every(t => [r.customer, r.phone, r.title, r.stage, r.kw && r.kw + ' kw'].join(' ').toLowerCase().includes(t))) : rows;
    L = hit.filter(r => acPendPass(r, ACXP.f));
    $$('[data-acx-f]', box).forEach(b => { b.classList.toggle('on', b.dataset.acxF === ACXP.f); $('.acx-n', b).textContent = hit.filter(r => acPendPass(r, b.dataset.acxF)).length; });
    $('.acx-sum', box).textContent = `${acPl(L.length, 'project')} · ${inr2(ACC.r2(L.reduce((s, r) => s + (+r.due || 0), 0)))} pending`;
    $('[data-acx-note]', box).textContent = ACXP.f === 'early'
      ? 'Projects still in an early stage (Customer, KSEB feasibility check, Loan registration, KSEB feasibility payment, PMSG portal registration). They are not in the pending total and get no reminder.'
      : "Projects past the early stages with money still due: the same list as the Dashboard, biggest first. Reminder opens WhatsApp with the message ready; press send there. On a loan project it asks only for the customer's own share (price − loan amount); Bank's part only = the customer has paid theirs, so there is no reminder.";
    acFill(tb, L, r => acPendRow(r, true), rows.length ? 'Nothing matches.' : 'Nothing pending.');
  };
  const reload = async () => { try { rows = await load(); } catch (e) { return; } if (box.isConnected) draw(); };
  const drawSoon = debounce(draw, 120);
  $('[data-acx-q]', box).oninput = e => { ACXP.q = e.target.value; drawSoon(); };
  $$('[data-acx-f]', box).forEach(b => b.onclick = () => { ACXP.f = b.dataset.acxF; draw(); });
  acPendBind(tb, () => L, reload);
  draw();
  if (acCanRemind()) acTpl().catch(() => { });
};

/* ---------- Payments received ---------- */
const ACXR = { q: '' };
const ACX_SVIA = { email: 'Email', whatsapp: 'WhatsApp' };
/* "sent" ticks from a payment's share log: one per way and person (Email / WhatsApp, to the customer or the bank); a PDF download is
   shown as "Downloaded", not as sent. sh is oldest first. */
function acTicks(sh) {
  const g = new Map();
  (sh || []).forEach(s => { const k = s.via === 'pdf' ? 'pdf' : s.via + '|' + s.to_whom, x = g.get(k) || { s, n: 0 }; x.n++; x.at = s.created; g.set(k, x); });
  return [...g.values()].map(({ s, n, at }) => {
    const dl = s.via === 'pdf', how = ACX_SVIA[s.via] || String(s.via || ''), lbl = dl ? 'Downloaded' : how + (s.to_whom === 'bank' ? ' · bank' : '');
    const tip = (dl ? 'PDF downloaded' : `Sent by ${how} to the ${s.to_whom === 'bank' ? 'bank' : 'customer'}`) + (n > 1 ? `, ${n} times, last on ` : ' on ') + acWhen(at);
    return `<span class="acx-tk${dl ? ' acx-dl' : ''}" title="${esc(tip)}"><i class="i i-${dl ? 'download' : 'check'}"></i>${esc(lbl)}${n > 1 ? ` ×${n}` : ''}</span>`;
  }).join('') || '<span class="mut">Not sent</span>';
}
function acRecvRow(r) {
  const ref = String(r.ref_no || '').trim();
  return `<tr data-id="${+r.id}"><td>${acDt(r.date)}</td><td class="acx-cn"><a href="#/customers/${+r.customer_id}">${esc(r.customer)}</a>${acLoan(r)}</td>
    <td>${r.src === 'bank' ? 'Bank (loan)' : 'Customer'}</td><td class="num">${inr2(r.amount)}</td>
    <td>${esc(r.mode || '—')}${ref ? `<span class="mut"> · ${esc(ref)}</span>` : ''}</td>
    <td>${r.receipt_no ? esc(r.receipt_no) : !acIsCash(r) && !ref ? '<span class="acx-late">Needs reference no.</span>' : '<span class="mut">Not made yet</span>'}</td>
    <td class="acx-tks">${acTicks(r.shared)}</td>
    <td class="acx-act"><button type="button" class="btn sec sm" data-acx-a="rc" title="Receipt: PDF, WhatsApp, email${r.loan === 'Yes' ? ', bank' : ''}"><i class="i i-receipt"></i> Receipt</button>${acExpBtn(r.project_id)}</td></tr>`;
}
ACCT_TABS.received = async (box, P) => {
  const load = () => api('acc', 'ac_received', undefined, acPer(P));
  let d = await load();
  if (!box.isConnected) return;
  box.innerHTML = `<div class="acx-view"><div class="acx-tiles" data-acx-tiles></div>
    <div class="bar acx-fbar"><input type="search" data-acx-q placeholder="Search customer, reference, receipt no.…" value="${esc(ACXR.q)}" autocomplete="off" aria-label="Search payments"><span class="sp"></span><span class="acx-sum" aria-live="polite"></span></div>
    <div class="card tw"><table class="acx-rv" data-min="1050"><thead><tr><th>Date</th><th>Customer</th><th>From</th><th class="num">Amount</th><th>Mode · reference</th><th>Receipt no.</th><th>Shared</th><th><span class="acx-sr">Actions</span></th></tr></thead><tbody></tbody></table></div>
    <p class="acx-note">Every payment dated in ${esc(P.label)}, the same records as the customers' Tax bill tabs. Receipt opens the receipt with PDF, WhatsApp and email (and the bank on loan projects); the first time, it also gives the payment its receipt number.</p></div>`;
  const tb = $('table', box);
  const sum = L => ACC.r2(L.reduce((s, r) => s + (+r.amount || 0), 0));
  const draw = () => {
    const rows = d.rows || [], q = acQ(ACXR.q), bank = rows.filter(r => r.src === 'bank'), made = rows.filter(r => r.receipt_no).length, sent = rows.filter(r => (r.shared || []).some(s => s.via !== 'pdf')).length;
    const L = q.length ? rows.filter(r => q.every(t => [r.customer, r.mode, r.ref_no, r.receipt_no, r.src === 'bank' ? 'bank loan' : 'customer', acDt(r.date)].join(' ').toLowerCase().includes(t))) : rows;
    $('[data-acx-tiles]', box).innerHTML = acTile('Received', inr2(d.total), `${acPl(rows.length, 'payment')} in ${esc(P.label)}`)
      + acTile('From customers', inr2(sum(rows.filter(r => r.src !== 'bank'))), acPl(rows.length - bank.length, 'payment'))
      + acTile('From banks (loan)', inr2(sum(bank)), acPl(bank.length, 'payment'))
      + acTile('Receipts', `${made} of ${rows.length}`, `made · ${sent} sent`);
    $('.acx-sum', box).textContent = q.length ? `${L.length} of ${rows.length} · ${inr2(sum(L))}` : '';
    acFill(tb, L, acRecvRow, rows.length ? 'Nothing matches.' : `No payments in ${esc(P.label)}.`);
  };
  const reload = async () => { try { d = await load(); } catch (e) { return; } if (box.isConnected) draw(); };
  /* the receipt window; a payment without its reference no. opens the payment to add it (payments write), then the receipt */
  const open = async (id, r) => {
    const m = await acReceipt(id, { onNoRef: (p, why) => canW('payments')
      ? acPayForm({ pid: p.project_id, customer: r.customer, loan: r.loan }, p, { done: reload, why, open: nid => open(nid, r) })
      : toast('This payment has no reference number, so no receipt can be made. Ask someone who can edit payments.', true) });
    acOnClose(m, reload); /* new receipt number and share ticks */
  };
  const drawSoon = debounce(draw, 120);
  $('[data-acx-q]', box).oninput = e => { ACXR.q = e.target.value; drawSoon(); };
  tb.onclick = async e => {
    const b = e.target.closest('[data-acx-a="rc"]'), tr = b && b.closest('tr[data-id]'), r = tr && (d.rows || []).find(x => x.id === +tr.dataset.id);
    if (!r || b.disabled) return;
    b.disabled = true;
    try { await open(r.id, r); } finally { b.disabled = false; }
  };
  draw();
};

/* ---------- Project profit ---------- */
function acProfRow(r) {
  const kw = acKw(r.kw);
  return `<tr data-id="${+r.project_id}"><td class="acx-cn"><a href="#/accounts/cost/${+r.project_id}">${esc(r.customer)}</a></td><td class="num">${kw ? esc(kw) + ' kW' : '<span class="mut">—</span>'}</td>
    <td>${esc(r.bill_no || '')}<span class="mut"> · ${acDt(r.bill_on)}</span></td><td class="num">${inr2(r.before)}</td><td class="num">${inr2(r.cost)}</td>
    <td class="num">${+r.comm ? inr2(r.comm) : '<span class="mut">—</span>'}</td><td class="num ${+r.profit < 0 ? 'over' : ''}">${acSigned(r.profit)}</td><td class="num">${acPct(r.margin)}</td>
    <td>${acPl(+r.lines || 0, 'line')}${+r.missing ? ` <span class="pill y acx-tag" title="${acPl(+r.missing, 'line')} without a dealer price">Incomplete</span>` : ''}</td><td class="acx-act">${acExpBtn(r.project_id)}</td></tr>`;
}
ACCT_TABS.profit = async (box, P) => {
  const d = await api('acc', 'ac_profit', undefined, acPer(P));
  if (!box.isConnected) return;
  const c = d.counted || {}, rows = d.rows || [], nc = d.no_cost || [], inc = rows.filter(r => +r.missing > 0).length;
  box.innerHTML = `<div class="acx-view"><div class="acx-tiles">
      ${acTile('Project price (before GST)', inr2(c.before), `${acPl(rows.length, 'project')} billed in ${esc(P.label)}`)}
      ${acTile('Cost (before GST)', inr2(c.cost), +c.comm ? `+ ${inr2(c.comm)} incentive / commission` : 'materials and services')}
      ${acTile('Profit', acSigned(c.profit), `${acPct(+c.before ? c.profit / c.before * 100 : 0)} margin${inc ? ` · ${inc} incomplete` : ''}`, acTone(c.profit))}
      ${acTile('Cost not entered', nc.length ? acPl(nc.length, 'project') : 'None', nc.length ? 'left out of the profit' : 'every billed project has costs', nc.length ? 'acx-warn' : '')}</div>
    <div class="card tw"><table class="acx-pf" data-min="1040"><thead><tr><th>Customer</th><th class="num">Plant</th><th>Tax bill</th><th class="num">Price before GST</th><th class="num">Cost before GST</th><th class="num">Incentive</th><th class="num">Profit</th><th class="num">Margin</th><th>Cost lines</th><th><span class="acx-sr">Actions</span></th></tr></thead><tbody></tbody></table></div>
    ${nc.length ? `<div class="card acx-nc"><h3>Cost not entered (${nc.length})</h3><p class="mut acx-small">Billed in ${esc(P.label)} with no Project cost lines yet, so they are left out of the profit until their Project cost sheet is filled in.</p>
      <ul>${nc.map(x => `<li><a href="#/accounts/cost/${+x.project_id}">${esc(x.customer)}</a><span class="mut">${x.bill_no ? ' · tax bill ' + esc(x.bill_no) : ''}</span><a class="btn sec sm" href="#/accounts/cost/${+x.project_id}"><i class="i i-coin"></i> Project cost</a></li>`).join('')}</ul></div>` : ''}
    <p class="acx-note">A project counts in the month its tax bill was issued. Price before GST is the bill's taxable value (or the price ÷ ${ACC.GST_DIV}). Profit = price before GST − cost before GST (quantity × dealer price) − incentive / commission; the Overview also takes off the company expenses. Incomplete: some lines have no dealer price yet. Click a project to open its Project cost sheet.</p></div>`;
  const tb = $('table', box);
  acFill(tb, rows, acProfRow, nc.length ? `No billed project in ${esc(P.label)} has its cost entered yet.` : `No tax bill was issued in ${esc(P.label)}.`);
  tb.onclick = e => { if (e.target.closest('a,button')) return; const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = '#/accounts/cost/' + tr.dataset.id; };
};

/* ---------- Expenses ---------- */
ACCT_TABS.expenses = async (box, P) => {
  const w = canW('accounts'), adm = ME.role === 'admin';
  const load = () => api('acc', 'ac_expenses', undefined, acPer(P));
  let d = await load();
  if (!box.isConnected) return;
  box.innerHTML = `<div class="acx-view"><div class="acx-tiles" data-acx-tiles></div>
    <div class="acx-ch"><h3>Expenses in ${esc(P.label)}</h3><span class="mut acx-small" data-acx-n></span><span class="sp"></span>${adm ? '<button type="button" class="btn sec" data-acx-a="cats"><i class="i i-gear"></i> Categories</button>' : ''}${w ? '<button type="button" class="btn" data-acx-a="add"><i class="i i-plus"></i> Add expense</button>' : ''}</div>
    <div class="card tw"><table class="acx-ex ${w ? 'acx-ed' : ''}" data-min="940"><thead><tr><th>Date</th><th>Category</th><th>Paid to</th><th>Mode</th><th>Note</th><th class="num">Amount paid</th><th class="num">GST</th><th class="num">Before GST</th>${w ? '<th><span class="acx-sr">Actions</span></th>' : ''}</tr></thead><tbody></tbody></table></div>
    <p class="acx-note">Company running costs. Profit uses the amount before GST. Ads (from campaigns) is the Meta Ads campaign spend of the month, added automatically; type an Ads expense only for ad costs not entered as campaign spend.${w ? ' A deleted expense goes to the Recycle bin.' : ''}</p></div>`;
  const tb = $('table', box);
  const row = x => x.auto
    ? `<tr class="acx-auto"><td>${esc(ACC.period(x.date).label)}</td><td>Ads (from campaigns) <span class="pill acx-tag">auto</span></td><td>Meta Ads</td><td><span class="mut">—</span></td><td class="mut">Campaign spend for the month</td><td class="num">${inr2(x.amount)}</td><td class="num"><span class="mut">—</span></td><td class="num">${inr2(x.before)}</td>${w ? '<td></td>' : ''}</tr>`
    : `<tr data-id="${+x.id}"><td>${acDt(x.date)}</td><td>${esc(x.cat)}</td><td>${esc(x.paid_to) || '<span class="mut">—</span>'}</td><td>${esc(x.mode) || '<span class="mut">—</span>'}</td><td class="acx-nt">${esc(x.note)}</td>
      <td class="num">${inr2(x.amount)}</td><td class="num">${+x.gst}%</td><td class="num">${inr2(x.before)}</td>
      ${w ? '<td class="acx-act"><button type="button" class="ib" data-acx-a="edit" title="Edit" aria-label="Edit"><i class="i i-pencil"></i></button><button type="button" class="ib" data-acx-a="del" title="Delete" aria-label="Delete"><i class="i i-trash"></i></button></td>' : ''}</tr>`;
  const draw = () => {
    const ads = (d.ads || []).map(a => ({ auto: 1, k: a.month + '-32', date: a.month, amount: +a.spend || 0, before: +a.spend || 0 }));
    const L = ads.concat((d.rows || []).map(x => Object.assign({ k: x.date, before: ACC.exBefore(x) }, x))).sort((a, b) => a.k < b.k ? 1 : a.k > b.k ? -1 : 0);
    const s = { ads: 0, ai: 0, other: 0, paid: 0 };
    L.forEach(x => { s.paid += +x.amount || 0; s[x.auto || x.cat === 'Ads' ? 'ads' : x.cat === 'AI tools' ? 'ai' : 'other'] += x.before; });
    $('[data-acx-tiles]', box).innerHTML = acTile('Total (before GST)', inr2(ACC.r2(s.ads + s.ai + s.other)), `${inr2(ACC.r2(s.paid))} paid, GST included`)
      + acTile('Ads', inr2(ACC.r2(s.ads)), (d.ads || []).length ? 'campaign spend + typed' : 'typed')
      + acTile('AI tools', inr2(ACC.r2(s.ai)), 'subscriptions and credits')
      + acTile('Other', inr2(ACC.r2(s.other)), 'every other category');
    $('[data-acx-n]', box).textContent = (d.rows || []).length ? acPl(d.rows.length, 'entry', 'entries') : '';
    acFill(tb, L, row, `No expenses in ${esc(P.label)}.`);
  };
  const reload = async () => { try { d = await load(); } catch (e) { return; } if (box.isConnected) draw(); };
  $('.acx-view', box).onclick = async e => {
    const b = e.target.closest('[data-acx-a]'), tr = e.target.closest('tr[data-id]'), x = tr && (d.rows || []).find(y => y.id === +tr.dataset.id);
    if (!b) { if (w && x && !e.target.closest('a,button')) acExpForm(x, d.cats || [], P, reload); return; }
    const a = b.dataset.acxA;
    if (a === 'add') return acExpForm({ date: today(), gst: 0 }, d.cats || [], P, reload);
    if (a === 'cats') return acCatsForm(d.cats || [], reload);
    if (!x) return;
    if (a === 'edit') return acExpForm(x, d.cats || [], P, reload);
    if (a !== 'del' || b.disabled) return;
    if (!confirm(`Delete this expense (${x.cat}, ${inr2(x.amount)} on ${acDt(x.date)})?\n\nIt goes to the Recycle bin.`)) return;
    b.disabled = true;
    try { await api('acc', 'expense_delete', { id: x.id }); } catch (er) { b.disabled = false; return; }
    toast('Expense deleted. It is in the Recycle bin.');
    reload();
  };
  draw();
};

/* add / edit an expense: date, category, amount as paid, GST %, paid to, mode, note (acc/expense_save). P = the period on screen. */
function acExpForm(x, cats, P, done) {
  const cur = x.cat || '', gone = cur && !cats.includes(cur), modes = x.mode && !ACX_XMODES.includes(x.mode) ? ACX_XMODES.concat(x.mode) : ACX_XMODES;
  const m = modal(`<div class="mh"><h3>${x.id ? 'Edit expense' : 'Add expense'}</h3><button type="button" class="ib" data-x title="Close" aria-label="Close"><i class="i i-x"></i></button></div>
    <div class="two"><div><label for="acx_xd">Date</label><input type="date" id="acx_xd" value="${esc(x.date || today())}"></div>
     <div><label for="acx_xc">Category</label><select id="acx_xc">${gone ? `<option value="" selected disabled>${esc(cur)} (no longer a category): choose one</option>` : cur ? '' : '<option value="" selected disabled>Choose…</option>'}${cats.map(c => `<option ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
     <div><label for="acx_xa">Amount paid (₹)</label><input id="acx_xa" inputmode="decimal" autocomplete="off" placeholder="As paid, GST included" value="${acV(x.amount)}"></div>
     <div><label for="acx_xg">GST %</label><select id="acx_xg">${ACX_GSTS.map(v => `<option value="${v}" ${+(x.gst || 0) === v ? 'selected' : ''}>${v}%</option>`).join('')}</select></div>
     <div><label for="acx_xp">Paid to</label><input id="acx_xp" maxlength="120" autocomplete="off" value="${esc(x.paid_to || '')}"></div>
     <div><label for="acx_xm">Mode</label><select id="acx_xm"><option value="">—</option>${modes.map(v => `<option ${v === x.mode ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
     <div class="full"><label for="acx_xn">Note</label><input id="acx_xn" maxlength="300" value="${esc(x.note || '')}" ${SPELL}></div></div>
    <p class="acx-note acx-top8" id="acx_xb" aria-live="polite"></p>
    <div class="bar acx-mft"><button type="button" class="btn" id="acx_xs">Save</button><button type="button" class="btn sec" data-x>Cancel</button></div>`);
  const amt = $('#acx_xa', m), gst = $('#acx_xg', m);
  const upd = () => { const a = acNum(amt.value);
    $('#acx_xb', m).textContent = a ? `Before GST: ${inr2(ACC.exBefore({ amount: a, gst: +gst.value }))}. Profit uses this amount.` : 'Type the amount as paid, GST included. Profit uses the amount before GST.'; };
  amt.oninput = upd; gst.onchange = upd; upd();
  $$('[data-x]', m).forEach(b => b.onclick = () => m.remove());
  $('#acx_xs', m).onclick = async e => {
    const date = $('#acx_xd', m).value, cat = $('#acx_xc', m).value, a = acNum(amt.value);
    if (!/^\d{4}-\d\d-\d\d$/.test(date)) { toast('Enter the date of the expense', true); $('#acx_xd', m).focus(); return; }
    if (!cat) { toast('Choose a category', true); $('#acx_xc', m).focus(); return; }
    if (!a) { toast('Enter the amount paid', true); amt.focus(); return; }
    const b = e.currentTarget; b.disabled = true;
    try { await api('acc', 'expense_save', { id: x.id || 0, date, cat, amount: a, gst: +gst.value, paid_to: $('#acx_xp', m).value.trim(), mode: $('#acx_xm', m).value, note: $('#acx_xn', m).value.trim() }); }
    catch (er) { b.disabled = false; return; }
    m.remove();
    toast(date < P.from || date > P.to ? `Expense saved. It is dated ${acDt(date)}, so it shows under ${ACC.period(date.slice(0, 7)).label}.` : 'Expense saved');
    done();
  };
  setTimeout(() => (x.id ? amt : $('#acx_xc', m)).focus(), 50);
}

/* admin: the expense categories (acc/cats_save). Ads, AI tools and Other always stay; others can be added, renamed or removed. */
function acCatsForm(cats, done) {
  const row = c => `<div class="acx-cat"><input maxlength="40" value="${esc(c)}" placeholder="Category name" aria-label="Category name" autocomplete="off"><button type="button" class="ib" data-acx-rmv title="Remove" aria-label="Remove"><i class="i i-trash"></i></button></div>`;
  const m = modal(`<div class="mh"><h3>Expense categories</h3><button type="button" class="ib" data-x title="Close" aria-label="Close"><i class="i i-x"></i></button></div>
    <p class="mut acx-small acx-top0">Ads, AI tools and Other always stay: the Overview shows Ads and AI tools on their own and adds every other category to Other. Expenses already entered keep their category.</p>
    <div class="acx-cats">${ACX_FIXED.map(c => `<div class="acx-cat acx-fx"><span>${esc(c)}</span><i class="i i-lock" title="Always kept"></i></div>`).join('')}<div class="acx-cats" id="acx_kl">${cats.filter(c => !ACX_FIXED.includes(c)).map(row).join('')}</div></div>
    <button type="button" class="btn sec sm" id="acx_kadd"><i class="i i-plus"></i> Add category</button>
    <div class="bar acx-mft"><button type="button" class="btn" id="acx_ksave">Save</button><button type="button" class="btn sec" data-x>Cancel</button></div>`);
  const list = $('#acx_kl', m);
  $$('[data-x]', m).forEach(b => b.onclick = () => m.remove());
  list.onclick = e => { const b = e.target.closest('[data-acx-rmv]'); if (b) b.closest('.acx-cat').remove(); };
  $('#acx_kadd', m).onclick = () => { list.insertAdjacentHTML('beforeend', row('')); list.lastElementChild.querySelector('input').focus(); };
  $('#acx_ksave', m).onclick = async e => {
    const out = ACX_FIXED.slice(), seen = new Set(out.map(c => c.toLowerCase()));
    $$('input', list).forEach(i => { const c = i.value.trim().replace(/\s+/g, ' '); if (c && !seen.has(c.toLowerCase())) { seen.add(c.toLowerCase()); out.push(c); } });
    if (out.length > 30) { toast('At most 30 categories', true); return; }
    const b = e.currentTarget; b.disabled = true;
    try { await api('acc', 'cats_save', { cats: out }); } catch (er) { b.disabled = false; return; }
    m.remove(); toast('Categories saved'); done();
  };
}

/* ---------- templates editor (admin): bank emails and the payment reminder ---------- */
const ACX_TPL_BOXES = [
  ['rc_subject', 'Receipt email to the bank: subject', 1, 'rc'], ['rc_body', 'Receipt email to the bank: message', 8, 'rc'],
  ['tb_subject', 'Tax bill email to the bank: subject', 1, 'rc'], ['tb_body', 'Tax bill email to the bank: message', 8, 'rc'],
  ['remind', 'WhatsApp payment reminder to the customer', 5, 'rm']];
const ACX_TPL_VARS = {
  rc: '{manager} {bank} {customer} {consumer_no} {loan_ref} {amount} {amount_words} {date} {receipt_no} {mode_ref} {bill_no} {bill_total} {received_total} {kw} {company} {sender} {sender_phone}',
  rm: '{customer} {pending} {kw} {company} {bank_details} {bank}' };
async function acTplEditor() {
  let T;
  try { T = await api('acc', 'ac_tpl'); } catch (e) { if (!(e && e.error)) toast('Could not load the templates.', true); return; }
  const D = T.defaults || {};
  const m = modal(`<div class="mh"><h3>Email and WhatsApp templates</h3></div>
    <p class="mut acx-small">Words in braces are filled in when the message is made. The receipt and tax bill emails go to the loan bank manager. A box left empty uses the default.</p>
    ${ACX_TPL_BOXES.map(([k, l, rows, g]) => `<div class="acx-tpf"><label>${l}</label><textarea data-k="${k}" rows="${rows}" maxlength="4000" ${SPELL}>${esc(T[k] || '')}</textarea>
      <div class="acx-tpv mut">Placeholders: ${esc(ACX_TPL_VARS[g])}</div>
      <button type="button" class="acx-link" data-acx-reset="${k}">Reset to default</button></div>`).join('')}
    <div class="bar"><button type="button" class="btn" data-acx-save>Save</button><button type="button" class="btn sec" data-acx-x>Cancel</button></div>`, true);
  $$('[data-acx-reset]', m).forEach(b => b.onclick = () => { $(`[data-k="${b.dataset.acxReset}"]`, m).value = D[b.dataset.acxReset] || ''; });
  $('[data-acx-x]', m).onclick = () => m.remove();
  const sv = $('[data-acx-save]', m);
  sv.onclick = async () => {
    const body = {}; ACX_TPL_BOXES.forEach(([k]) => { const v = $(`[data-k="${k}"]`, m).value.trim(); body[k] = v || D[k] || ''; });
    sv.disabled = true;
    try { await api('acc', 'tpl_save', body); ACX_TPL = null; m.remove(); toast('Templates saved'); }
    catch (e) { sv.disabled = false; if (!(e && e.error)) toast('Could not save the templates.', true); }
  };
}
