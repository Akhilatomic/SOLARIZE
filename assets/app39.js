/* Accounts › GST (assets/app39.js): the GST working for the chosen month or financial year. Server: api/gst.php (acc/ac_gst).
   GST collected on the tax bills issued, input credit on purchases / supplier bills / office expenses (each marked Claim, Check or
   No credit), the net payable, and the sales and purchase registers. Computed from the bills every time; nothing is stored. */
const ACG_MARK = { yes: ['Claim', 'g'], check: ['Check', 'y'], no: ['No credit', 'r'] };
const acgRate = r => +r < 0 ? 'As on the bill' : `${+r}%`;
ACCT_TABS.gst = async (box, P) => {
  const d = await api('acc', 'ac_gst', undefined, acPer(P));
  if (!box.isConnected) return;
  const o = d.out, c = d.itc, pay = d.net > 0;
  const src = { sheet: 'Project cost sheet', bill: 'Supplier bill', expense: 'Office expense' };
  box.innerHTML = `<div class="acx-view"><div class="acx-tiles">
      ${acTile('GST collected', inr2(o.tax), `${acPl(o.n, 'tax bill')} · taxable ${inr2(o.taxable)}`, '', '', 'GST on the tax bills issued in the period')}
      ${acTile('Input credit to claim', inr2(c.yes), 'bills of suppliers with a GSTIN', 'acx-pos', '', 'GST paid on purchases from suppliers in the supplier list with a GSTIN')}
      ${acTile('Credit to check', inr2(c.check), c.no ? `and ${inr2(c.no)} with no credit` : 'needs a proper GST bill', c.check > 0 ? 'acx-warn' : '', '', 'GST paid where the CRM cannot tell that a valid GST bill in the company’s GSTIN exists')}
      ${acTile(pay ? 'Net GST payable' : 'Credit carried forward', inr2(Math.abs(d.net)), c.check > 0 ? `${d.net_if_all >= 0 ? inr2(d.net_if_all) + ' payable' : inr2(-d.net_if_all) + ' credit'} if the rows to check are valid` : 'collected − credit to claim', pay ? 'acx-neg' : 'acx-pos')}</div>
    <div class="acg-two">
      <div class="card tw"><table class="acx-mt" data-min="430"><thead><tr><th>GST collected, by rate</th><th class="num">Taxable</th><th class="num">CGST</th><th class="num">SGST</th><th class="num">IGST</th><th class="num">Tax</th></tr></thead>
        <tbody>${o.by.map(x => `<tr><td>${acgRate(x.rate)}</td><td class="num">${inr2(x.taxable)}</td><td class="num">${inr2(x.cgst)}</td><td class="num">${inr2(x.sgst)}</td><td class="num">${x.igst ? inr2(x.igst) : '—'}</td><td class="num">${inr2(x.tax)}</td></tr>`).join('') || '<tr><td colspan="6" class="mut">No tax bill issued in this period.</td></tr>'}
        ${o.by.length ? `<tr class="acb-ob"><td><b>Total</b></td><td class="num"><b>${inr2(o.taxable)}</b></td><td class="num"><b>${inr2(o.cgst)}</b></td><td class="num"><b>${inr2(o.sgst)}</b></td><td class="num"><b>${o.igst ? inr2(o.igst) : '—'}</b></td><td class="num"><b>${inr2(o.tax)}</b></td></tr>` : ''}</tbody></table></div>
      <div class="card tw"><table class="acx-mt" data-min="320"><thead><tr><th>Input credit, by rate</th><th class="num">Taxable</th><th class="num">CGST</th><th class="num">SGST</th><th class="num">Tax</th></tr></thead>
        <tbody>${c.by.map(x => `<tr><td>${acgRate(x.rate)}</td><td class="num">${inr2(x.taxable)}</td><td class="num">${inr2(x.tax / 2)}</td><td class="num">${inr2(x.tax / 2)}</td><td class="num">${inr2(x.tax)}</td></tr>`).join('') || '<tr><td colspan="5" class="mut">No purchase with GST in this period.</td></tr>'}
        ${c.by.length ? `<tr class="acb-ob"><td><b>Claim + Check</b></td><td></td><td class="num"><b>${inr2((c.yes + c.check) / 2)}</b></td><td class="num"><b>${inr2((c.yes + c.check) / 2)}</b></td><td class="num"><b>${inr2(c.yes + c.check)}</b></td></tr>` : ''}</tbody></table></div></div>
    <div class="bar acx-mbar"><h3 class="acb-h">Sales register</h3><span class="mut">tax bills issued in ${esc(P.label)}</span></div>
    <div class="card tw"><table class="acx-mt" data-min="720"><colgroup><col style="width:130px"><col style="width:104px"><col><col style="width:170px"><col style="width:130px"><col style="width:120px"><col style="width:130px"></colgroup>
      <thead><tr><th>Bill no.</th><th>Date</th><th>Customer</th><th>GSTIN</th><th class="num">Taxable</th><th class="num">GST</th><th class="num">Bill total</th></tr></thead>
      <tbody>${d.sales.map(s => `<tr><td>${esc(s.no)}</td><td>${acDt(s.date)}</td><td class="acx-nm"><a href="#/customers/${+s.customer_id}">${esc(s.customer)}</a>${s.inter ? '<small class="acs-by">Outside Kerala (IGST)</small>' : ''}</td><td>${s.gstin ? esc(s.gstin) : '<span class="mut">Consumer</span>'}</td>
        <td class="num">${inr2(s.taxable)}</td><td class="num">${inr2(s.tax)}</td><td class="num">${inr2(s.total)}</td></tr>`).join('') || '<tr><td colspan="7" class="mut">No tax bill issued in this period.</td></tr>'}</tbody></table></div>
    <div class="bar acx-mbar"><h3 class="acb-h">Purchase register</h3><span class="mut">purchases with GST, by bill date</span></div>
    <div class="card tw"><table class="acx-mt" data-min="860"><colgroup><col style="width:104px"><col><col style="width:160px"><col style="width:120px"><col style="width:120px"><col style="width:110px"><col style="width:120px"><col style="width:190px"></colgroup>
      <thead><tr><th>Date</th><th>Supplier</th><th>GSTIN</th><th>Bill no.</th><th class="num">Taxable</th><th class="num">GST</th><th class="num">Bill total</th><th>Credit</th></tr></thead>
      <tbody>${d.purchases.map(p => `<tr><td>${acDt(p.date)}</td><td class="acx-nm"><a href="${esc(p.link)}">${esc(p.supplier)}</a><small class="acs-by">${esc(src[p.src] || '')}${p.what ? ' · ' + esc(p.what) : ''}</small></td><td>${p.gstin ? esc(p.gstin) : '<span class="mut">—</span>'}</td><td>${esc(p.bill_no)}</td>
        <td class="num">${inr2(p.taxable)}</td><td class="num">${inr2(p.tax)}</td><td class="num">${inr2(p.total)}</td><td><span class="pill ${ACG_MARK[p.mark][1]}">${ACG_MARK[p.mark][0]}</span>${p.why ? `<small class="acs-by">${esc(p.why)}</small>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="mut">No purchase with GST in this period.</td></tr>'}</tbody></table></div>
    <p class="acx-note">This is a working for you and your accountant, not the GST return. GST collected is from the tax bills issued in the period. Input credit is the GST on items marked Purchased on Project cost sheets (by bill date), on supplier bills added in Supplier dues, and on office expenses with GST. <b>Claim</b> = the supplier is in the supplier list with a GSTIN. <b>Check</b> = the CRM has no GSTIN for it: add the supplier's GSTIN on the price list's Suppliers window, or make sure there is a GST bill in the company's GSTIN. <b>No credit</b> = KSEB fees, billed in the customer's name. Credit is finally allowed only when the supplier has filed the bill (GSTR-2B). Purchases are taken as bought within Kerala. Credit notes, advances and reverse charge are not handled here.</p></div>`;
  if (typeof fitSoon === 'function') fitSoon();
};
