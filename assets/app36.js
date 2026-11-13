/* Accounts › Price list: suppliers and their prices per item (assets/app36.js). Rules in ACC (app32.js): offerView, offerFilter, supTag.
   The list itself is acMaterials in app34.js; this file gives it the supplier rows and the windows:
   acSups()                 the suppliers as last loaded with the price list (ACS.sups)
   acSupOpts(sel)           <option>s for a supplier <select>: none, every supplier, "+ New supplier…" (ACX_NEWSUP)
   acSupPick(sel, after)    wires that <select>: choosing "+ New supplier…" opens acSupForm and selects the new one
   acSupForm(s, done)       add / edit a supplier; done(supplier)
   acSupManage(reload)      Suppliers window: every supplier with contact, GSTIN and its number of prices; add, edit, delete
   acOfferForm(mat, o, done) add / edit one supplier's price for an item; done(item as saved)
   acOfferRows(x, v, w, def) the rows listed under an item: the other suppliers' prices, to compare and pick
   acOfferAct(a, x, oid, reload) a click on one of those rows: use / edit / del */
const ACX_NEWSUP = '__newsup';
const acSups = () => ACS.sups || [];
const acSupOpts = sel => `<option value="">No supplier</option>${acSups().map(s => `<option value="${s.id}" ${String(sel || '') === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="${ACX_NEWSUP}">+ New supplier…</option>`;
function acSupPick(sel, after) {
  let cur = sel.value;
  sel.addEventListener('change', () => {
    if (sel.value !== ACX_NEWSUP) { cur = sel.value; if (after) after(); return; }
    sel.value = cur;
    acSupForm({}, s => { if (!sel.isConnected) return; sel.innerHTML = acSupOpts(s.id); cur = sel.value; if (after) after(); });
  });
}

function acSupForm(s, done) {
  const v = k => esc(s[k] || '');
  const m = modal(`<div class="mh"><h3>${s.id ? 'Edit supplier' : 'New supplier'}</h3><button type="button" class="ib" data-x title="Close" aria-label="Close"><i class="i i-x"></i></button></div>
    <div class="two"><div class="full"><label for="acs_n">Supplier name</label><input id="acs_n" maxlength="120" autocomplete="off" value="${v('name')}"></div>
    <div><label for="acs_t">Short name</label><input id="acs_t" maxlength="14" autocomplete="off" value="${v('tag')}" placeholder="For example: GIG"></div>
    <div><label for="acs_c">Contact person</label><input id="acs_c" maxlength="80" autocomplete="off" value="${v('contact')}"></div>
    <div><label for="acs_p">Phone</label><input id="acs_p" maxlength="40" inputmode="tel" autocomplete="off" value="${v('phone')}"></div>
    <div><label for="acs_e">Email</label><input id="acs_e" maxlength="120" type="email" autocomplete="off" value="${v('email')}"></div>
    <div class="full"><label for="acs_g">GSTIN</label><input id="acs_g" maxlength="15" autocomplete="off" value="${v('gstin')}" placeholder="15 letters and numbers"></div>
    <div class="full"><label for="acs_a">Address</label><input id="acs_a" maxlength="300" autocomplete="off" value="${v('address')}"></div>
    <div class="full"><label for="acs_o">Note</label><input id="acs_o" maxlength="300" autocomplete="off" value="${v('note')}" placeholder="Payment terms, delivery, what they are good for" ${SPELL}></div></div>
    <div class="bar acx-mft"><button type="button" class="btn" id="acs_s">Save</button><button type="button" class="btn sec" data-x>Cancel</button></div>`);
  $$('[data-x]', m).forEach(b => b.onclick = () => m.remove());
  const g = id => $('#' + id, m).value.trim();
  $('#acs_s', m).onclick = async e => {
    if (!g('acs_n')) { toast('Type the supplier name', true); $('#acs_n', m).focus(); return; }
    const b = e.currentTarget; b.disabled = true;
    let r;
    try { r = await api('acc', 'supplier_save', { id: s.id || 0, name: g('acs_n'), tag: g('acs_t'), contact: g('acs_c'), phone: g('acs_p'), email: g('acs_e'), gstin: g('acs_g'), address: g('acs_a'), note: g('acs_o') }); }
    catch (er) { b.disabled = false; if (er && er.quiet && er.error) toast(er.error, true); return; }
    ACS.sups = r.suppliers || [];
    m.remove(); toast(s.id ? 'Supplier saved' : `“${g('acs_n')}” added to the suppliers`);
    if (done) done(acSups().find(x => x.id === r.id) || { id: r.id });
  };
  $('#acs_n', m).focus();
}

function acSupManage(reload) {
  const w = canW('accounts');
  const m = modal(`<div class="mh"><h3>Suppliers</h3><button type="button" class="ib" data-x title="Close" aria-label="Close"><i class="i i-x"></i></button></div>
    <p class="mut acx-small acx-top0">The dealers you buy from. Each item on the price list can hold a price from every supplier, so you can compare before buying.</p>
    <div class="acs-sl" id="acs_sl"></div>
    <div class="bar acx-mft">${w ? '<button type="button" class="btn" id="acs_add"><i class="i i-plus"></i> New supplier</button>' : ''}<span class="sp"></span><button type="button" class="btn sec" data-x>Done</button></div>`, true);
  const list = $('#acs_sl', m);
  let changed = false;
  const draw = () => {
    list.innerHTML = acSups().map(s => `<div class="acs-sr" data-id="${s.id}"><span class="acs-sn"><span><b>${esc(s.name)}</b>${s.tag ? ` <span class="pill acx-tag">${esc(s.tag)}</span>` : ''}</span>
        <small>${[s.contact, s.phone, s.email].filter(Boolean).map(esc).join(' · ') || 'No contact details yet'}</small>
        <small>${[s.gstin && 'GSTIN ' + s.gstin, s.address].filter(Boolean).map(esc).join(' · ')}</small>${s.note ? `<small>${esc(s.note)}</small>` : ''}</span>
      <span class="acs-sc">${s.n ? acPl(s.n, 'price') : 'No prices yet'}</span>
      ${w ? `<button type="button" class="ib" data-s="edit" title="Edit" aria-label="Edit ${esc(s.name)}"><i class="i i-pencil"></i></button><button type="button" class="ib" data-s="del" title="Delete" aria-label="Delete ${esc(s.name)}"><i class="i i-trash"></i></button>` : ''}</div>`).join('')
      || '<p class="mut">No suppliers yet.</p>';
  };
  const close = () => { m.remove(); if (changed && reload) reload(); };
  $$('[data-x]', m).forEach(b => b.onclick = close);
  if (w) {
    $('#acs_add', m).onclick = () => acSupForm({}, () => { changed = true; if (m.isConnected) draw(); });
    list.onclick = async e => {
      const b = e.target.closest('[data-s]'), row = b && b.closest('[data-id]'), s = row && acSups().find(x => x.id === +row.dataset.id);
      if (!s) return;
      if (b.dataset.s === 'edit') { acSupForm(s, () => { changed = true; if (m.isConnected) draw(); }); return; }
      if (!confirm(`Delete the supplier “${s.name}”?\n\n${s.n ? `Its ${acPl(s.n, 'price')} on the price list go with it. Items that use one of them keep their dealer price.` : 'It has no prices on the price list.'}\n\nIt goes to the Recycle bin.`)) return;
      b.disabled = true;
      try { const r = await api('acc', 'supplier_delete', { id: s.id }); ACS.sups = r.suppliers || []; ACS.mats = null; changed = true; toast('Supplier deleted. It is in the Recycle bin.'); draw(); }
      catch (er) { b.disabled = false; }
    };
  }
  draw();
}

/* one supplier's price for an item. o = the price being edited ({} = a new one) */
function acOfferForm(mat, o, done) {
  const inUse = !!o.id && o.id === mat.offer_id, today = new Date().toLocaleDateString('en-CA');
  const m = modal(`<div class="mh"><h3>${o.id ? 'Edit supplier price' : 'Add supplier price'}</h3><button type="button" class="ib" data-x title="Close" aria-label="Close"><i class="i i-x"></i></button></div>
    <p class="acs-for">${esc(mat.name)} <span class="mut">· per ${esc(mat.unit || 'Nos')}</span></p>
    <div class="two"><div><label for="aco_s">Supplier</label><select id="aco_s">${acSupOpts(o.supplier_id)}</select></div>
    <div><label for="aco_b">Brand</label><input id="aco_b" maxlength="80" autocomplete="off" value="${esc(o.brand || '')}" placeholder="Make, as on the bill"></div>
    <div><label for="aco_r">Price, before GST (₹)</label><input id="aco_r" inputmode="decimal" autocomplete="off" value="${acV(o.rate)}"></div>
    <div><label for="aco_d">Price as on</label><input id="aco_d" type="date" value="${esc(o.id ? o.on_date || '' : today)}"></div>
    <div><label for="aco_f">Bill or quotation no.</label><input id="aco_f" maxlength="60" autocomplete="off" value="${esc(o.ref || '')}"></div>
    <div><label for="aco_n">Note</label><input id="aco_n" maxlength="300" autocomplete="off" value="${esc(o.note || '')}" ${SPELL}></div>
    <div class="full acs-pk">${inUse ? '<span class="mut acx-small">This is the price in use: the dealer price follows it.</span>'
      : `<label class="acx-chk"><input type="checkbox" id="aco_k" ${!o.id && !(+mat.rate) ? 'checked' : ''}> Use this as the dealer price</label>`}</div></div>
    <div class="bar acx-mft"><button type="button" class="btn" id="aco_ok">Save</button><button type="button" class="btn sec" data-x>Cancel</button></div>`);
  const fs = $('#aco_s', m), fr = $('#aco_r', m);
  acSupPick(fs);
  fr.oninput = () => fr.classList.toggle('acx-bad', acNum(fr.value) === null);
  $$('[data-x]', m).forEach(b => b.onclick = () => m.remove());
  $('#aco_ok', m).onclick = async e => {
    const rate = acNum(fr.value);
    if (!+fs.value) { toast('Choose the supplier', true); fs.focus(); return; }
    if (!rate) { toast('Type the price from this supplier', true); fr.focus(); return; }
    const b = e.currentTarget; b.disabled = true;
    let r;
    try {
      r = await api('acc', 'offer_save', { id: o.id || 0, material_id: mat.id, supplier_id: +fs.value, brand: $('#aco_b', m).value.trim(), rate, on_date: $('#aco_d', m).value,
        ref: $('#aco_f', m).value.trim(), note: $('#aco_n', m).value.trim(), pick: $('#aco_k', m) && $('#aco_k', m).checked ? 1 : 0 });
    } catch (er) { b.disabled = false; return; }
    m.remove(); toast(o.id ? 'Supplier price saved' : 'Supplier price added');
    ACS.mats = null; if (done) done(r.item);
  };
  (o.id ? fr : fs).focus();
}

/* the tiny line under an item's name: the brand and supplier of the price in use */
const acOfferBy = v => v.used ? `<small class="acs-by">${[v.used.brand, v.used.sup].filter(Boolean).map(esc).join(' · ')}</small>`
  : v.n ? '<small class="acs-by acs-pick">No supplier picked yet: choose one below</small>' : '';
/* how a supplier's price compares with the dealer price */
const acOfferDiff = o => o.diff === null ? '' : Math.abs(o.diff) < 0.005 ? '<span class="mut">Same price</span>'
  : o.diff < 0 ? `<span class="acs-less">${inr2(-o.diff)} less</span>` : `<span class="mut">${inr2(o.diff)} more</span>`;
/* the rows under an item: every other supplier's price for it. x = the item, v = ACC.offerView, w = may edit, def = default profit % */
function acOfferRows(x, v, w, def) {
  const pc = ACC.pctOf(x.profit, def);
  return v.others.map(o => `<tr class="acs-alt${x.hidden ? ' acx-hid' : ''}" data-id="${x.id}" data-oid="${o.id}">
      <td class="acs-an"><span class="acs-as">${esc(o.sup)}</span><small class="acs-by" ${o.note ? `title="${esc(o.note)}"` : ''}>${[o.brand || 'Brand not on the bill', o.on_date && fdt(o.on_date), o.ref].filter(Boolean).map(esc).join(' · ')}</small></td>
      <td></td><td class="num">${inr2(o.rate)}${o.low ? ' <span class="pill acs-lowp">Lowest</span>' : ''}</td><td class="num acs-df">${acOfferDiff(o)}</td>
      <td class="num mut">${inr2(ACC.custPrice(o.rate, pc))}</td><td></td>
      ${w ? `<td class="acx-act"><button type="button" class="btn sec sm" data-acs-o="use" title="Make this the dealer price">Use</button><button type="button" class="ib" data-acs-o="edit" title="Edit this price" aria-label="Edit the price from ${esc(o.sup)}"><i class="i i-pencil"></i></button><button type="button" class="ib" data-acs-o="del" title="Delete this price" aria-label="Delete the price from ${esc(o.sup)}"><i class="i i-trash"></i></button></td>` : ''}</tr>`).join('');
}
async function acOfferAct(a, x, oid, reload) {
  const o = (x.offers || []).find(y => y.id === oid), s = o && acSups().find(y => y.id === o.supplier_id);
  if (!o) return;
  const who = s ? s.name : 'this supplier';
  if (a === 'edit') return acOfferForm(x, o, reload);
  if (a === 'use') {
    if (+x.rate && Math.abs(+x.rate - o.rate) > 0.005 && !confirm(`Use the price from ${who} for “${x.name}”?\n\nThe dealer price changes from ${inr2(x.rate)} to ${inr2(o.rate)}. Expense sheets already made keep their prices.`)) return;
    await api('acc', 'offer_pick', { material_id: x.id, offer_id: o.id });
    toast(`“${x.name}” now uses the price from ${who}`);
  }
  if (a === 'del') {
    if (!confirm(`Delete the price from ${who} for “${x.name}”?\n\nIt goes to the Recycle bin.`)) return;
    await api('acc', 'offer_delete', { id: o.id });
    toast('Supplier price deleted. It is in the Recycle bin.');
  }
  ACS.mats = null; await reload();
}
