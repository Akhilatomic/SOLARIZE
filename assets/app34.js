/* Accounts: a project's Expense sheet, the price list (Accounts › Price list and Settings › Price list) and the material list PDF (assets/app34.js).
   acCostSheet(pid)  #/accounts/cost/<pid>: the Expense sheet, what the plant cost us line by line (dealer prices before GST), grouped like the
                     quotation (ACC.GROUPS): qty × dealer price = expense, + the line's profit % = customer price. The commission (Business
                     Associate) or incentive (staff) of the customer is an automatic line. Tiles: income, expense, profit, customer price from
                     the list. Saving replaces every line (acc/cost_save); every line needs its quantity; a typed dealer price becomes the item's.
   acCsAdd()         Add item: a product from the price list + its quantity, or a new product (saved to the price list at once) + quantity.
   acMaterials(box)  the price list (ACCT_TABS.materials, and Settings › Price list): default profit %, dealer price, profit %, customer price;
                     add, edit, hide, delete (Recycle bin).
   acMaterialPdf(d)  A4 material list for purchase and the site delivery check (no prices, services left out), drawn with jsPDF from ACC.mlLayout.
   Uses ACC (app32.js), acFy / ACCT_TABS (app33.js), acKw / acFileName (app35.js), qpLibs (app21.js), inr2 / fdt (app18.js). */
const ACX_SVC = 'Services and charges';
const ACX_GSTS = [0, 5, 12, 18, 28];
const ACX_UNITS = ['Nos', 'm', 'kg', 'kW', 'Job', 'Set', 'Lot', 'Pair', 'Roll', 'Box', 'Bag'];
const ACX_COLS = 13;
/* the open Expense sheet: d = the ac_cost answer, lines = the lines being edited (in group order);
   mats / mdef = the price list and its default profit % as last loaded (acMats) */
const ACS = { pid: 0, d: null, lines: [], dirty: false, hash: '', w: false, busy: false, mats: null, mdef: ACC.PROFIT_DEF };

/* a typed amount: '' = 0, '1,250.50' = 1250.5, anything else (or below 0) = null */
const acNum = v => { const s = String(v ?? '').replace(/[,₹\s]/g, ''); if (s === '') return 0; const n = Number(s); return isFinite(n) && n >= 0 ? n : null; };
/* a typed profit %: '' = null (the default), 0-500 = the number, anything else = NaN */
const acPctIn = v => { const s = String(v ?? '').replace(/[%\s]/g, ''); if (s === '') return null; const n = Number(s); return isFinite(n) && n >= 0 && n <= 500 ? n : NaN; };
const acV = n => +n ? String(+n) : '';
const acPv = p => ACC.pctSet(p) ? String(+p) : '';
const acPctTxt = n => `${(+n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
const acGi = g => { const i = ACC.GROUPS.indexOf(g); return i < 0 ? ACC.GROUPS.length : i; };
/* quotation group order, groups not in ACC.GROUPS last (by name); lines keep their order inside a group */
const acSort = ls => ls.map((l, i) => [l, i]).sort((a, b) => acGi(a[0].grp) - acGi(b[0].grp) || (acGi(a[0].grp) === ACC.GROUPS.length ? String(a[0].grp || '').localeCompare(String(b[0].grp || '')) : 0) || a[1] - b[1]).map(x => x[0]);
const acIn = l => ({ material_id: +l.material_id || 0, grp: String(l.grp || ''), name: String(l.name || ''), qty: +l.qty || 0, unit: String(l.unit || ''), rate: +l.rate || 0, gst: ACX_GSTS.includes(+l.gst) ? +l.gst : 18,
  profit: ACC.pctSet(l.profit) ? +l.profit : null, supplier: String(l.supplier || ''), bill_no: String(l.bill_no || ''), bill_date: String(l.bill_date || ''), note: String(l.note || '') });
const acOut = l => ({ material_id: l.material_id, grp: l.grp, name: l.name, qty: l.qty, unit: l.unit, rate: l.rate, gst: l.gst, profit: l.profit, supplier: l.supplier, bill_no: l.bill_no, bill_date: l.bill_date, note: l.note });
/* the sheet's default profit % (settings acc_profit_default, as ac_cost sent it) */
const acDef = () => ACC.pctOf(ACS.d && ACS.d.profit_default, ACS.mdef);
/* a price list item as a sheet line with the quantity typed: its dealer price, and its profit % (blank = today's default, copied) */
const acFromMat = (m, qty) => acIn({ material_id: m.id, grp: m.grp, name: m.name, qty, unit: m.unit, rate: m.rate, gst: m.gst, profit: ACC.pctOf(m.profit, acDef()) });
const acMats = async fresh => {
  if (fresh || !ACS.mats) { const r = await api('acc', 'ac_materials'); ACS.mats = r.rows || []; ACS.mdef = ACC.pctOf(r.profit_default, null); }
  return ACS.mats;
};
const acGroups = mats => [...new Set(ACC.GROUPS.concat((mats || []).map(m => m.grp).filter(Boolean)))];
const acUnits = () => { if (!document.getElementById('acx_units')) document.body.insertAdjacentHTML('beforeend', `<datalist id="acx_units">${ACX_UNITS.map(u => `<option value="${u}">`).join('')}</datalist>`); };
const acPl = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
const ACX_CST = { 'Not set': '', Pending: 'y', 'Part 1 paid': 'b', Paid: 'g' };

function acDirty(on) {
  ACS.dirty = on;
  const s = $('#acx_st'), b = $('#acx_pdf');
  if (b) b.innerHTML = `<i class="i i-download"></i> ${on && ACS.w ? 'Save &amp; download' : 'Download material list'}`;
  if (!s) return;
  s.textContent = on ? 'Unsaved changes' : ACS.lines.length ? 'Saved' : 'No lines yet';
  s.classList.toggle('acx-dirty', on);
}
/* lines added, removed or copied: back into group order and drawn again */
function acChanged() { ACS.lines = acSort(ACS.lines); acCsTable(); acCsTiles(); acDirty(true); }

async function acCostSheet(pid) {
  $('#title').innerHTML = '<span class="ft t-accounts"><i class="i i-coin"></i></span><span class="ttl">Accounts</span><span class="mut ttls">› Expense</span>';
  const main = $('#main'), nav = ROUTE_N;
  if (!pid) { main.innerHTML = '<p class="over">No project chosen. Open a customer or a project and press Expense.</p>'; return; }
  let d;
  try { d = await api('acc', 'ac_cost', undefined, `&project_id=${pid}`); }
  catch (e) { if (nav === ROUTE_N) main.innerHTML = `<p class="over">${esc((e && e.error) || 'Could not open the Expense sheet')}</p>`; return; }
  if (nav !== ROUTE_N) return; /* the user moved on while it loaded */
  Object.assign(ACS, { pid, d, lines: acSort((d.lines || []).map(acIn)), hash: location.hash, w: canW('accounts'), busy: false, dirty: false });
  const p = d.project || {}, cu = d.customer || {}, kw = acKw(p.kw), w = ACS.w;
  acUnits();
  main.innerHTML = `<div class="acx-pg" id="acx_cs">
    <div class="acx-crumb"><a href="#/accounts/profit">← Project profit</a>${cu.id ? ` · <a href="#/customers/${+cu.id}">${esc(cu.name)}</a>` : ''} · <a href="#/projects/${+p.id}">Open project</a></div>
    <div class="acx-hd"><div><h2>Expense · ${esc(cu.name || p.title || '')}${kw ? ` <span class="mut">${esc(kw)} kW</span>` : ''}</h2>
      <div class="acx-sub">${p.loan === 'Yes' ? '<span class="pill acx-tag">Loan</span>' : ''}<span>${esc([p.title, p.stage].filter(Boolean).join(' · '))}</span></div></div>
      <span class="sp"></span><span class="acx-st" id="acx_st" aria-live="polite"></span>
      <button type="button" class="btn sec" id="acx_pdf"><i class="i i-download"></i> Download material list</button>${w ? '<button type="button" class="btn" id="acx_save"><i class="i i-check"></i> Save</button>' : ''}</div>
    <div class="acx-tiles" id="acx_tiles"></div>
    <div class="acx-ch"><h3>Purchases and services</h3><span class="sp"></span>${w ? '<button type="button" class="btn sec" id="acx_copy"><i class="i i-copy"></i> Copy from another project</button><button type="button" class="btn" id="acx_add"><i class="i i-plus"></i> Add item</button>' : ''}</div>
    <div class="card tw"><table class="acx-cst" id="acx_tb" data-min="1160"></table></div>
    <div id="acx_fee"></div>
    <p class="acx-note">Dealer prices and expense are before GST. Customer price = dealer price + the line's profit % (blank = the default, ${esc(acPctTxt(acDef()))}). Profit = project price before GST − expense (purchases, services and the commission / incentive). ${w ? 'A product added here goes on the price list, and the dealer price you type becomes its dealer price. ' : ''}The material list PDF has every material with its quantity, no prices, and leaves out services.</p>
  </div>`;
  acCsTable(); acCsTiles(); acDirty(false);
  const tb = $('#acx_tb');
  const onEdit = e => {
    const el = e.target.closest('[data-f]'), tr = el && el.closest('tr[data-i]'), l = tr && ACS.lines[+tr.dataset.i];
    if (!l) return;
    const f = el.dataset.f;
    if (f === 'qty' || f === 'rate') {
      const n = acNum(el.value);
      el.classList.toggle('acx-bad', n === null); el.title = n === null ? 'Enter a number' : '';
      if (f === 'qty') el.classList.toggle('acx-need', n !== null && !(n > 0));
      l[f] = n || 0;
    } else if (f === 'profit') {
      const n = acPctIn(el.value), bad = Number.isNaN(n);
      el.classList.toggle('acx-bad', bad); el.title = bad ? 'Enter a profit % from 0 to 500, or leave it blank for the default' : '';
      l.profit = bad ? l.profit : n;
    } else { l[f] = f === 'gst' ? +el.value : el.value; acDirty(true); return; }
    $('.acx-amt', tr).textContent = inr2(ACC.lineExpense(l)); $('.acx-cpr', tr).textContent = inr2(ACC.lineCust(l, acDef()));
    acGsum(); acCsTiles(); acDirty(true);
  };
  tb.addEventListener('input', onEdit); tb.addEventListener('change', onEdit);
  tb.addEventListener('click', e => {
    const b = e.target.closest('[data-acx-del]'); if (!b) return;
    const i = +b.closest('tr').dataset.i, l = ACS.lines[i]; if (!l) return;
    if ((l.rate || l.supplier || l.bill_no || l.note) && !confirm(`Remove “${l.name}” from this Expense sheet?`)) return;
    ACS.lines.splice(i, 1); acChanged();
  });
  /* Download material list; with unsaved changes the button reads Save & download and saves first (a failed save downloads nothing) */
  $('#acx_pdf').onclick = async e => {
    const b = e.currentTarget; if (b.disabled) return;
    b.disabled = true;
    try {
      if (ACS.w && ACS.dirty && !(await acCsSave())) return;
      await acMaterialPdf(Object.assign({}, ACS.d, { lines: ACS.lines }));
    } catch (x) { toast((x && (x.message || x.error)) || 'Could not make the PDF', true); }
    finally { if (b.isConnected) b.disabled = false; }
  };
  if (w) {
    $('#acx_save').onclick = () => acCsSave();
    $('#acx_add').onclick = () => acCsAdd();
    $('#acx_copy').onclick = () => acCsCopy();
  }
}

/* the lines table: a group row, then its lines; the automatic commission / incentive row last */
function acCsTable() {
  const tb = $('#acx_tb'); if (!tb) return;
  const w = ACS.w, n = w ? ACX_COLS : ACX_COLS - 1, def = acDef(), dp = esc(String(def));
  const cols = [['', ''], [58, 'num'], [72, ''], [94, 'num'], [100, 'num'], [60, 'num'], [106, 'num'], [60, 'num'], [104, ''], [80, ''], [124, ''], [104, '']].concat(w ? [[36, '']] : []);
  let body = '', g = null, gi = -1;
  ACS.lines.forEach((l, i) => {
    if (gi < 0 || l.grp !== g) { g = l.grp; gi++; body += `<tr class="acx-grp"><td colspan="${n}"><b>${esc(g || 'Other')}</b><span class="acx-gsum" data-acx-g="${gi}"></span></td></tr>`; }
    const exp = inr2(ACC.lineExpense(l)), cp = inr2(ACC.lineCust(l, def));
    body += w ? `<tr data-i="${i}" data-g="${gi}"><td class="acx-nm">${esc(l.name)}${l.material_id ? '' : ' <span class="pill acx-new" title="Goes on the price list when you save">new</span>'}</td>
      <td class="num"><input data-f="qty" inputmode="decimal" value="${acV(l.qty)}" placeholder="Qty" class="${l.qty > 0 ? '' : 'acx-need'}" aria-label="Quantity of ${esc(l.name)}"></td>
      <td><input data-f="unit" value="${esc(l.unit)}" list="acx_units" maxlength="20" aria-label="Unit"></td>
      <td class="num"><input data-f="rate" inputmode="decimal" value="${acV(l.rate)}" placeholder="0" aria-label="Dealer price before GST"></td>
      <td class="num acx-amt">${exp}</td>
      <td class="num"><input data-f="profit" inputmode="decimal" value="${acPv(l.profit)}" placeholder="${dp}" aria-label="Profit % (blank = the default ${dp}%)"></td>
      <td class="num acx-cpr">${cp}</td>
      <td class="num"><select data-f="gst" aria-label="GST %">${ACX_GSTS.map(v => `<option value="${v}" ${l.gst === v ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
      <td><input data-f="supplier" value="${esc(l.supplier)}" maxlength="120" aria-label="Supplier"></td>
      <td><input data-f="bill_no" value="${esc(l.bill_no)}" maxlength="60" aria-label="Bill no."></td>
      <td><input data-f="bill_date" type="date" value="${esc(l.bill_date)}" aria-label="Bill date"></td>
      <td><input data-f="note" value="${esc(l.note)}" maxlength="300" aria-label="Note" ${SPELL}></td>
      <td><button type="button" class="ib" data-acx-del title="Remove this line" aria-label="Remove ${esc(l.name)}"><i class="i i-trash"></i></button></td></tr>`
      : `<tr data-i="${i}" data-g="${gi}"><td class="acx-nm">${esc(l.name)}</td><td class="num">${l.qty > 0 ? esc(acV(l.qty)) : '<span class="acx-late">—</span>'}</td><td>${esc(l.unit)}</td><td class="num">${l.rate ? inr2(l.rate) : '<span class="mut">—</span>'}</td>
      <td class="num acx-amt">${exp}</td><td class="num">${ACC.pctSet(l.profit) ? esc(acPctTxt(l.profit)) : `<span class="mut">${esc(acPctTxt(def))}</span>`}</td><td class="num acx-cpr">${cp}</td><td class="num">${l.gst}</td>
      <td>${esc(l.supplier)}</td><td>${esc(l.bill_no)}</td><td>${l.bill_date ? fdt(l.bill_date) : ''}</td><td>${esc(l.note)}</td></tr>`;
  });
  if (!ACS.lines.length) body += `<tr><td colspan="${n}" class="mut">No lines yet.${w ? ' Use <b>Add item</b> or <b>Copy from another project</b>.' : ''}</td></tr>`;
  body += acCommRow(n);
  tb.innerHTML = `<colgroup>${cols.map(([wd]) => `<col${wd ? ` style="width:${wd}px"` : ''}>`).join('')}</colgroup>
    <thead><tr><th>Item</th><th class="num">Qty</th><th>Unit</th><th class="num">Dealer price</th><th class="num">Expense</th><th class="num">Profit %</th><th class="num">Customer price</th><th class="num">GST %</th><th>Supplier</th><th>Bill no.</th><th>Bill date</th><th>Note</th>${w ? '<th><span class="acx-sr">Remove</span></th>' : ''}</tr></thead><tbody>${body}</tbody>`;
  acGsum(); acFeeBar();
}
/* the automatic commission (Business Associate) / incentive (staff) line, from Finance › Commission / Incentive; counts in the expense */
function acCommRow(n) {
  const c = acComm(), st = ACC.commStatus(c), adm = ME.role === 'admin' && (c.kind === 'commission' || c.kind === 'incentive');
  const why = c.person ? `<span class="pill ${ACX_CST[st] || ''} acx-tag">${esc(st)}</span>${+c.p1 || +c.p2 ? ` <span class="mut">paid ${inr2(ACC.r2((+c.p1 || 0) + (+c.p2 || 0)))}</span>` : ''}`
    : `<span class="mut">${+c.amount ? 'From Finance' : 'No Business Associate or staff owner, so no commission or incentive'}</span>`;
  /* data-label set here: the stacked (narrow) layout labels cells by position, which the colspans would throw off */
  return `<tr class="acx-auto"><td class="acx-nm" data-label="">${esc(ACC.commLabel(c))} <span class="pill acx-tag">auto</span></td><td colspan="3">${why}${adm ? ` <a class="acx-link acx-small" href="#/comm/${c.kind}">Open in Finance</a>` : ''}</td>
    <td class="num acx-amt" data-label="Expense">${inr2(c.amount)}</td><td colspan="${n - 5}"></td></tr>`;
}
/* the commission / incentive of the open sheet: ac_cost's comm, or auto.comm from an older answer */
const acComm = () => { const d = ACS.d || {}; return d.comm || { amount: +(d.auto || {}).comm || 0, kind: '', person: '', p1: 0, p2: 0 }; };
/* each group row: number of lines and their expense */
function acGsum() {
  const s = {};
  ACS.lines.forEach(l => { const k = l.grp; (s[k] = s[k] || [0, 0])[0]++; s[k][1] += ACC.lineExpense(l); });
  let gi = -1, g = null;
  const keys = []; ACS.lines.forEach(l => { if (gi < 0 || l.grp !== g) { g = l.grp; gi++; keys.push(g); } });
  $$('#acx_tb [data-acx-g]').forEach(el => { const v = s[keys[+el.dataset.acxG]]; if (v) el.textContent = `${acPl(v[0], 'line')} · ${inr2(ACC.r2(v[1]))}`; });
}
/* Income (payments for this project), Expense (purchases · services · commission / incentive), Profit (before GST, same rule as
   Accounts › Project profit) and the customer price from the list against the agreed price before GST */
function acCsTiles() {
  const box = $('#acx_tiles'); if (!box || !ACS.d) return;
  const d = ACS.d, p = d.project || {}, c = acComm(), ck = c.kind === 'commission' ? 'commission' : c.kind === 'incentive' ? 'incentive' : 'commission / incentive';
  const T = ACC.sheetTotals(ACS.lines, c.amount, acDef()), P = ACC.profit({ price: p.cost, taxable: d.taxable, lines: ACS.lines, comm: c.amount }), G = ACC.listGap(P.before, T.cust);
  const paid = +d.paid || 0, priced = +p.cost > 0 || +d.taxable > 0;
  const t = (k, label, val, sub, cls, tip) => `<div class="card acx-t ${cls || ''}" data-acx-t="${k}"${tip ? ` title="${esc(tip)}"` : ''}><small>${label}</small><b>${val}</b><em>${sub}</em></div>`;
  box.innerHTML = t('income', 'Income', inr2(paid), +p.cost ? `of ${inr2(p.cost)} price${paid >= +p.cost - 1 ? ' · fully paid' : ''}` : 'project price not set', '', 'Payments received for this project (Tax bill tab and Accounts)')
    + t('expense', 'Expense', inr2(T.expense), `purchases ${inr2(T.purchases)} · services ${inr2(T.services)} · ${ck} ${inr2(T.comm)}${T.missing ? ` · <span class="acx-late">${acPl(T.missing, 'line')} without a dealer price</span>` : ''}`, T.missing ? 'acx-warn' : '', 'Before GST: quantity × dealer price of every line, plus the commission / incentive')
    + t('profit', 'Profit', P.profit < 0 ? '−' + inr2(-P.profit) : inr2(P.profit), priced ? `${P.margin.toLocaleString('en-IN', { maximumFractionDigits: 2 })}% margin · before GST` : 'project price not set', P.profit < 0 ? 'acx-neg' : P.profit > 0 ? 'acx-pos' : '',
      `Project price before GST ${inr2(P.before)}${+d.taxable > 0 ? ' (from the tax bill)' : +p.cost ? ` (${inr2(p.cost)} ÷ ${ACC.GST_DIV})` : ''} − expense ${inr2(T.expense)}`)
    + t('list', 'Customer price from the list', inr2(T.cust), !priced ? 'project price not set' : G.word === 'matches' ? `matches the agreed ${inr2(P.before)} before GST` : `agreed price (${inr2(P.before)} before GST) is ${inr2(Math.abs(G.diff))} ${G.word}`,
      priced && G.word === 'less' ? 'acx-warn' : '', 'Every line: quantity × dealer price + its profit %');
}

/* KSEB fees recorded under Finance › Fees and not on the sheet yet: added as ordinary lines (one each), the paid amount taken back to before GST */
function acFeeBar() {
  const box = $('#acx_fee'); if (!box) return;
  const have = new Set(ACS.lines.map(l => l.name.trim().toLowerCase()));
  const miss = (((ACS.d || {}).auto || {}).fees || []).filter(f => !have.has(String(f.name).trim().toLowerCase()));
  box.innerHTML = ACS.w && miss.length ? `<div class="acx-fee"><button type="button" class="btn sec sm" id="acx_feeadd"><i class="i i-plus"></i> Add KSEB fees from Finance</button>
    <span class="mut">${miss.map(f => `${esc(f.name)} ${inr2(f.amount)}`).join(' · ')} paid (with GST), added before GST</span></div>` : '';
  if (box.firstChild) $('#acx_feeadd').onclick = async () => {
    let mats = []; try { mats = await acMats(); } catch (e) { }
    miss.forEach(f => {
      const g = ACX_GSTS.includes(+f.gst) ? +f.gst : 18, m = mats.find(x => x.grp === ACX_SVC && x.name.toLowerCase() === String(f.name).toLowerCase());
      ACS.lines.push(acIn({ material_id: m ? m.id : 0, grp: ACX_SVC, name: f.name, qty: 1, unit: m ? m.unit : 'Job', rate: ACC.r2((+f.amount || 0) / (1 + g / 100)), gst: g,
        profit: ACC.pctOf(m && m.profit, acDef()), supplier: f.kind === 'stamp' ? '' : 'KSEB', note: ACC.FEE_NOTE }));
    });
    acChanged(); toast(`${acPl(miss.length, 'fee line')} added. Save to keep ${miss.length === 1 ? 'it' : 'them'}.`);
  };
}

async function acCsSave() {
  if (!ACS.w || ACS.busy || !$('#acx_cs')) return false;
  const bad = $('#acx_tb .acx-bad');
  if (bad) { toast('A quantity, dealer price or profit % is not valid (marked in red)', true); bad.focus(); return false; }
  const nq = ACS.lines.findIndex(l => !(l.qty > 0));
  if (nq >= 0) {
    toast(`Enter the quantity for ${ACS.lines[nq].name}`, true);
    const q = $(`#acx_tb tr[data-i="${nq}"] input[data-f="qty"]`); if (q) { q.scrollIntoView({ block: 'center' }); q.focus(); }
    return false;
  }
  ACS.busy = true;
  const btn = $('#acx_save'), tb = $('#acx_tb');
  if (btn) btn.disabled = true;
  $$('input,select,button', tb).forEach(x => { x.disabled = true; }); /* no typing into lines that the answer is about to replace */
  let ok = false, stale = null;
  try {
    /* version: the sheet as this page loaded it; if someone saved it since, the server refuses (409, stale) and writes nothing */
    const r = await api('acc', 'cost_save', { project_id: ACS.pid, version: ACS.d && ACS.d.version, lines: ACS.lines.map(acOut) });
    ACS.d = r; ACS.lines = acSort((r.lines || []).map(acIn)); ACS.mats = null; /* new products and dealer prices are on the list now */
    ok = true;
  } catch (e) { if (e && e.stale) stale = e; /* else api() has shown the reason */ }
  ACS.busy = false;
  if (btn && btn.isConnected) btn.disabled = false;
  if ($('#acx_cs')) { acCsTable(); acCsTiles(); }
  if (ok) { acDirty(false); toast('Expense sheet saved'); }
  else if ($('#acx_cs')) acDirty(ACS.dirty);
  if (stale && $('#acx_cs')) {
    if (confirm(`${stale.error || 'This Expense sheet was changed since you opened it — reload to see the latest'}.\n\nReload it now? Your changes here are not saved and will be lost. Press Cancel to keep them on screen (note them down, then reload).`)) { ACS.dirty = false; acCostSheet(ACS.pid); }
    else toast('Not saved: someone else saved this Expense sheet. Reload the page to see their lines.', true);
  }
  return ok;
}

/* + Add item: a product from the price list or a new product (saved to the price list at once), always with its quantity.
   Add stays off until both are there; the window stays open to add several. */
async function acCsAdd() {
  let mats; try { mats = await acMats(); } catch (e) { return; }
  const groups = acGroups(mats), def = acDef();
  const gOpts = sel => groups.map(g => `<option ${g === sel ? 'selected' : ''}>${esc(g)}</option>`).join('');
  const m = modal(`<div class="mh"><h3>Add item</h3><button type="button" class="ib" data-x title="Close" aria-label="Close"><i class="i i-x"></i></button></div>
    <div class="tabs acx-amode" role="tablist"><button type="button" role="tab" data-acx-mode="list" class="on" aria-selected="true">From the price list</button><button type="button" role="tab" data-acx-mode="new" aria-selected="false">New product</button></div>
    <div data-acx-pane="list"><div class="acx-pbar"><input id="acx_q" type="search" placeholder="Search the price list…" autocomplete="off" aria-label="Search the price list"><select id="acx_qg" aria-label="Group"><option value="">All groups</option>${gOpts('')}</select></div>
      <div class="acx-pick" id="acx_pl" role="listbox" aria-label="Products"></div></div>
    <div data-acx-pane="new" hidden><p class="mut acx-small acx-top0">Saved to the price list as soon as you add it, so it is there for the next projects.</p>
      <div class="two"><div><label for="acx_ng">Group</label><select id="acx_ng">${gOpts(ACC.GROUPS[0])}</select></div>
      <div class="acx-two"><div><label for="acx_nu">Unit</label><input id="acx_nu" list="acx_units" value="Nos" maxlength="20"></div><div><label for="acx_nt">GST %</label><select id="acx_nt">${ACX_GSTS.map(v => `<option value="${v}" ${v === 18 ? 'selected' : ''}>${v}%</option>`).join('')}</select></div></div>
      <div class="full"><label for="acx_nn">Name, make and size</label><input id="acx_nn" maxlength="200" autocomplete="off" ${SPELL}></div>
      <div><label for="acx_nr">Dealer price, before GST (₹)</label><input id="acx_nr" inputmode="decimal" autocomplete="off" placeholder="Not known yet"></div>
      <div><label for="acx_np">Profit %</label><input id="acx_np" inputmode="decimal" autocomplete="off" placeholder="${esc(String(def))} (default)"></div></div>
      <p class="acx-note" id="acx_ncp" aria-live="polite"></p></div>
    <div class="acx-addbar"><div class="acx-chosen" id="acx_ch" aria-live="polite"></div>
      <div class="acx-qty"><label for="acx_aq">Quantity</label><input id="acx_aq" inputmode="decimal" autocomplete="off" placeholder="Qty"><span class="mut" id="acx_au"></span></div>
      <button type="button" class="btn" id="acx_ago" disabled><i class="i i-plus"></i> <span>Add</span></button></div>
    <div class="bar acx-mft"><span class="mut" id="acx_pn"></span><span class="sp"></span><button type="button" class="btn sec" data-x>Done</button></div>`, true);
  let added = 0, last = null, chosen = null, mode = 'list', busy = false;
  const qIn = $('#acx_aq', m), go = $('#acx_ago', m), nn = $('#acx_nn', m), nr = $('#acx_nr', m), np = $('#acx_np', m);
  const count = () => { $('#acx_pn', m).textContent = added ? `${acPl(added, 'line')} added` : ''; };
  /* what Add would do now: {ok, why} */
  const state = () => {
    const q = acNum(qIn.value);
    if (mode === 'list' && !chosen) return { ok: false, why: 'Choose a product' };
    if (mode === 'new' && !nn.value.trim()) return { ok: false, why: 'Type the product name' };
    if (mode === 'new' && acNum(nr.value) === null) return { ok: false, why: 'The dealer price is not a number' };
    if (mode === 'new' && Number.isNaN(acPctIn(np.value))) return { ok: false, why: 'Profit % is 0 to 500, or blank for the default' };
    if (q === null || !(q > 0)) return { ok: false, why: 'Enter the quantity' };
    return { ok: true, why: '' };
  };
  const upd = () => {
    const s = state(), unit = mode === 'list' ? (chosen ? chosen.unit : '') : $('#acx_nu', m).value.trim();
    go.disabled = !s.ok || busy; go.title = s.why; $('span', go).textContent = mode === 'new' ? 'Save & add' : 'Add';
    $('#acx_au', m).textContent = unit;
    qIn.classList.toggle('acx-bad', acNum(qIn.value) === null);
    $('#acx_ch', m).innerHTML = mode === 'list'
      ? chosen ? `<b>${esc(chosen.name)}</b><small>${esc(chosen.grp)} · dealer ${+chosen.rate ? inr2(chosen.rate) : 'price not set'} · profit ${esc(acPctTxt(ACC.pctOf(chosen.profit, def)))}</small>` : '<span class="mut">Choose a product above, then type its quantity.</span>'
      : nn.value.trim() ? `<b>${esc(nn.value.trim())}</b><small>${esc($('#acx_ng', m).value)}</small>` : '<span class="mut">Fill in the new product, then type its quantity.</span>';
    if (mode === 'new') {
      const r = acNum(nr.value), pc = acPctIn(np.value);
      $('#acx_ncp', m).textContent = r && !Number.isNaN(pc) ? `Customer price ${inr2(ACC.custPrice(r, ACC.pctOf(pc, def)))} per ${$('#acx_nu', m).value.trim() || 'Nos'} (${acPctTxt(ACC.pctOf(pc, def))} profit)` : '';
    }
  };
  const draw = () => {
    const q = $('#acx_q', m).value.trim().toLowerCase().split(/\s+/).filter(Boolean), g = $('#acx_qg', m).value;
    const L = mats.filter(x => !x.hidden && (!g || x.grp === g) && q.every(t => (x.name + ' ' + x.grp).toLowerCase().includes(t)));
    let h = '', cur = null;
    L.slice(0, 300).forEach(x => {
      if (x.grp !== cur) { cur = x.grp; h += `<div class="acx-pgh">${esc(cur || 'Other')}</div>`; }
      const on = ACS.lines.filter(l => l.material_id === x.id).length, sel = chosen && chosen.id === x.id;
      h += `<button type="button" class="acx-pi${sel ? ' acx-on' : ''}" role="option" aria-selected="${sel}" data-mid="${x.id}"><span>${esc(x.name)}</span><small>${esc(x.unit)} · GST ${+x.gst}%${+x.rate ? ' · dealer ' + inr2(x.rate) + ' · profit ' + esc(acPctTxt(ACC.pctOf(x.profit, def))) : ' · no dealer price yet'}${on ? ` · <b>on the sheet${on > 1 ? ' ×' + on : ''}</b>` : ''}</small></button>`;
    });
    $('#acx_pl', m).innerHTML = h || `<p class="mut acx-pe">Nothing matches. Use <b>New product</b> to add it to the price list.</p>`;
  };
  const setMode = k => {
    mode = k;
    $$('[data-acx-mode]', m).forEach(b => { const on = b.dataset.acxMode === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $$('[data-acx-pane]', m).forEach(p => { p.hidden = p.dataset.acxPane !== k; });
    if (k === 'new' && !nn.value && !$('#acx_pl [data-mid]', m)) nn.value = $('#acx_q', m).value.trim(); /* a search that found nothing: start the new product from it */
    upd(); (k === 'new' ? nn : $('#acx_q', m)).focus();
  };
  const choose = x => { chosen = x; draw(); upd(); qIn.focus(); qIn.select(); };
  const addLine = line => { ACS.lines.push(line); last = line; added++; acChanged(); count(); };
  const done = what => { qIn.value = ''; upd(); toast(`${what} added (${acPl(added, 'line')} so far). Save the sheet to keep ${added === 1 ? 'it' : 'them'}.`); };
  $('#acx_pl', m).onclick = e => { const b = e.target.closest('[data-mid]'), x = b && mats.find(y => y.id === +b.dataset.mid); if (x) choose(x); };
  $('#acx_q', m).oninput = () => { draw(); upd(); };
  $('#acx_qg', m).onchange = () => { draw(); upd(); };
  $('#acx_q', m).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const b = $('#acx_pl [data-mid]', m); if (b) b.click(); } };
  $$('[data-acx-mode]', m).forEach(b => b.onclick = () => setMode(b.dataset.acxMode));
  [qIn, nn, nr, np, $('#acx_nu', m)].forEach(x => { x.oninput = upd; });
  $('#acx_ng', m).onchange = upd;
  [qIn, nn, nr, np].forEach(x => { x.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (!go.disabled) go.click(); else { const s = state(); if (s.why) toast(s.why, true); } } }; });
  go.onclick = async () => {
    const s = state(); if (!s.ok || busy) { if (s.why) toast(s.why, true); return; }
    const qty = acNum(qIn.value);
    if (mode === 'list') { addLine(acFromMat(chosen, qty)); const nm = chosen.name; chosen = null; $('#acx_q', m).value = ''; draw(); done(`“${nm}”`); $('#acx_q', m).focus(); return; } /* a fresh search for the next product */
    const grp = $('#acx_ng', m).value, name = nn.value.trim().replace(/\s+/g, ' '), unit = $('#acx_nu', m).value.trim() || 'Nos', gst = +$('#acx_nt', m).value;
    const ex = mats.find(x => x.grp === grp && x.name.toLowerCase() === name.toLowerCase());
    if (ex) { addLine(acFromMat(ex, qty)); toast(`“${ex.name}” is already on the price list, so that one was added with its own price`); qIn.value = ''; nn.value = ''; upd(); return; }
    busy = true; upd();
    let r;
    try { r = await api('acc', 'material_save', { grp, name, unit, gst, rate: acNum(nr.value) || 0, profit: acPctIn(np.value) ?? '', hidden: 0 }); }
    catch (er) { busy = false; upd(); return; } /* api() has shown why */
    busy = false;
    try { mats = await acMats(true); } catch (er) { }
    const item = r.item || mats.find(x => x.id === +r.id) || { id: +r.id, grp, name, unit, gst, rate: acNum(nr.value) || 0, profit: acPctIn(np.value) };
    addLine(acFromMat(item, qty));
    nn.value = ''; nr.value = ''; np.value = ''; draw();
    done(`“${name}” saved to the price list and`);
    nn.focus();
  };
  $$('[data-x]', m).forEach(b => b.onclick = () => {
    m.remove();
    const i = ACS.lines.indexOf(last), row = i >= 0 && $(`#acx_tb tr[data-i="${i}"]`); /* the last line added, in view */
    if (row) row.scrollIntoView({ block: 'center' });
  });
  count(); draw(); upd(); $('#acx_q', m).focus();
}

/* Copy from another project: a similar plant's items, quantities and profit % (dealer prices when ticked); supplier, bill and note stay behind */
async function acCsCopy() {
  let cs; try { cs = await list('customers'); } catch (e) { return; }
  cs = cs.filter(c => +c.project_id && +c.project_id !== ACS.pid);
  const has = ACS.lines.length;
  const m = modal(`<div class="mh"><h3>Copy lines from another project</h3><button type="button" class="ib" data-x title="Close"><i class="i i-x"></i></button></div>
    <p class="mut acx-small acx-top0">Pick a similar plant. Its items, quantities and profit % are copied into this sheet; supplier, bill and note are not, nor its KSEB / stamp paper fee lines (this customer's fees come from Finance › Fees). Check the quantities: every project is different.</p>
    <input id="acx_cq" type="search" placeholder="Search customers by name, phone, consumer no., place…" autocomplete="off" aria-label="Search customers">
    <div class="acx-opts"><label class="acx-chk"><input type="checkbox" id="acx_cr"> Copy dealer prices too</label>
      ${has ? `<label class="acx-chk"><input type="radio" name="acx_cm" value="add" checked> Add below the ${acPl(has, 'line')} here (no line twice)</label><label class="acx-chk"><input type="radio" name="acx_cm" value="replace"> Replace the lines here (fee lines stay)</label>` : ''}</div>
    <div class="acx-pick" id="acx_cl"></div>`, true);
  const draw = () => {
    const q = $('#acx_cq', m).value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const L = cs.filter(c => q.every(t => [c.name, c.phone, c.consumer_no, c.district, c.kseb_section, c.address].join(' ').toLowerCase().includes(t))).slice(0, 80);
    $('#acx_cl', m).innerHTML = L.map(c => `<button type="button" class="acx-pi" data-pid="${+c.project_id}"><span>${esc(c.name)}</span><small>${[c.kw ? c.kw + ' kW' : '', c.stage, c.district, c.phone].filter(Boolean).map(esc).join(' · ')}</small></button>`).join('')
      || '<p class="mut acx-pe">No other project matches.</p>';
  };
  $('#acx_cq', m).oninput = draw;
  $('#acx_cl', m).onclick = async e => {
    const b = e.target.closest('[data-pid]'); if (!b || b.disabled) return;
    const c = cs.find(x => +x.project_id === +b.dataset.pid);
    b.disabled = true;
    let r; try { r = await api('acc', 'ac_cost', undefined, `&project_id=${+b.dataset.pid}`); } catch (x) { b.disabled = false; return; }
    b.disabled = false;
    if (!(r.lines || []).length) { toast(`${c ? c.name : 'That project'} has no lines yet`, true); return; }
    const rates = $('#acx_cr', m).checked, mode = ($('input[name=acx_cm]:checked', m) || {}).value || 'add', who = c ? c.name : 'the other project';
    /* fee lines are the other customer's own fees: never copied, and this sheet's fee lines stay even on Replace (the fee offer
       keeps following this customer's Finance › Fees); on Add, lines already here are not added twice */
    const keep = mode === 'replace' ? ACS.lines.filter(l => ACC.isFee(l)) : ACS.lines, res = ACC.copyLines(r.lines, keep, rates), nl = res.lines.map(acIn);
    const out = [res.fees && `${acPl(res.fees, 'fee line')} (fees come from this customer's own Finance › Fees)`, res.dup && `${acPl(res.dup, 'line')} already on this sheet`].filter(Boolean).join(' and ');
    if (!nl.length) { toast(`Nothing to copy from ${who}${out ? ': ' + out + ' left out' : ''}.`, true); return; }
    ACS.lines = keep.concat(nl);
    m.remove(); acChanged();
    toast(`${acPl(nl.length, 'line')} copied from ${who}${rates ? ' with dealer prices' : ''}${out ? '; ' + out + ' left out' : ''}. Check the quantities, then save.`);
  };
  $$('[data-x]', m).forEach(b => b.onclick = () => m.remove());
  draw(); $('#acx_cq', m).focus();
}

/* ---- the price list (Accounts › Price list, Settings › Price list) ---- */
const ACM = { q: '', f: 'all' };
async function acMaterials(box) {
  const w = canW('accounts');
  let mats = await acMats(true);
  if (!box.isConnected) return;
  acUnits();
  box.innerHTML = `<div class="acx-pdef"><label for="acx_pd">Default profit %</label><input id="acx_pd" inputmode="decimal" autocomplete="off" value="${esc(String(ACS.mdef))}" ${w ? '' : 'disabled'} aria-describedby="acx_pdh">
      ${w ? '<button type="button" class="btn sec sm" id="acx_pds">Save</button>' : ''}<span class="mut acx-small" id="acx_pdh">For every item whose profit % is blank. Customer price = dealer price + profit %.</span></div>
    <div class="bar acx-mbar"><input id="acx_mq" type="search" placeholder="Search the price list…" value="${esc(ACM.q)}" autocomplete="off" aria-label="Search the price list">
      <div class="tabs acx-mf">${[['all', 'All'], ['shown', 'In use'], ['hidden', 'Hidden']].map(([k, l]) => `<button type="button" data-acx-mf="${k}" class="${ACM.f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <span class="mut" id="acx_mn"></span><span class="sp"></span>${w ? '<button type="button" class="btn" id="acx_madd"><i class="i i-plus"></i> Add item</button>' : ''}</div>
    <div class="card tw"><table class="acx-mt" id="acx_mt" data-min="780"></table></div>
    <p class="acx-note">Materials and services with the dealer price (what we pay, before GST) and the profit % added for the customer. Expense sheets pick from this list; saving a sheet with a dealer price updates the item's. Hidden items stay here but are not offered on Expense sheets. A deleted item goes to the Recycle bin; sheets that use it keep their lines.</p>`;
  const tb = $('#acx_mt', box), nc = w ? 7 : 6;
  const draw = () => {
    const q = ACM.q.trim().toLowerCase().split(/\s+/).filter(Boolean), def = ACS.mdef;
    const L = mats.filter(x => (ACM.f === 'all' || (ACM.f === 'hidden' ? x.hidden : !x.hidden)) && q.every(t => (x.name + ' ' + x.grp).toLowerCase().includes(t)));
    $('#acx_mn', box).textContent = acPl(L.length, 'item');
    let body = '', cur = null;
    L.forEach(x => {
      if (x.grp !== cur) { cur = x.grp; body += `<tr class="acx-grp"><td colspan="${nc}"><b>${esc(cur || 'Other')}</b><span class="acx-gsum">${acPl(L.filter(y => y.grp === cur).length, 'item')}</span></td></tr>`; }
      const own = ACC.pctSet(x.profit), pc = ACC.pctOf(x.profit, def);
      body += `<tr class="${x.hidden ? 'acx-hid' : ''}" data-id="${x.id}"><td class="acx-nm">${esc(x.name)}${x.hidden ? ' <span class="pill acx-tag">Hidden</span>' : ''}</td><td>${esc(x.unit)}</td>
        <td class="num">${+x.rate ? inr2(x.rate) : '<span class="mut">—</span>'}</td><td class="num">${own ? esc(acPctTxt(pc)) : `<span class="mut" title="Blank: the default">${esc(acPctTxt(pc))}</span>`}</td>
        <td class="num">${+x.rate ? `<b>${inr2(ACC.custPrice(x.rate, pc))}</b>` : '<span class="mut">—</span>'}</td><td class="num">${+x.gst}</td>
        ${w ? `<td class="acx-act"><button type="button" class="ib" data-acx-m="edit" title="Edit" aria-label="Edit ${esc(x.name)}"><i class="i i-pencil"></i></button><button type="button" class="ib" data-acx-m="hide" title="${x.hidden ? 'Offer on Expense sheets again' : 'Hide from Expense sheets'}" aria-label="${x.hidden ? 'Show' : 'Hide'} ${esc(x.name)}"><i class="i i-eye"></i></button><button type="button" class="ib" data-acx-m="del" title="Delete" aria-label="Delete ${esc(x.name)}"><i class="i i-trash"></i></button></td>` : ''}</tr>`;
    });
    tb.innerHTML = `<colgroup><col><col style="width:70px"><col style="width:120px"><col style="width:90px"><col style="width:130px"><col style="width:70px">${w ? '<col style="width:120px">' : ''}</colgroup>
      <thead><tr><th>Item</th><th>Unit</th><th class="num">Dealer price</th><th class="num">Profit %</th><th class="num">Customer price</th><th class="num">GST %</th>${w ? '<th><span class="acx-sr">Actions</span></th>' : ''}</tr></thead>
      <tbody>${body || `<tr><td colspan="${nc}" class="mut">${mats.length ? 'Nothing matches.' : 'The list is empty.'}</td></tr>`}</tbody>`;
    if (typeof fitSoon === 'function') fitSoon();
  };
  const reload = async () => { mats = await acMats(true); if (box.isConnected) { $('#acx_pd', box).value = String(ACS.mdef); draw(); } };
  $('#acx_mq', box).oninput = e => { ACM.q = e.target.value; draw(); };
  $$('[data-acx-mf]', box).forEach(b => b.onclick = () => { ACM.f = b.dataset.acxMf; $$('[data-acx-mf]', box).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  if (w) {
    const pd = $('#acx_pd', box), pds = $('#acx_pds', box);
    const savePd = async () => {
      const n = acPctIn(pd.value);
      if (n === null || Number.isNaN(n)) { toast('Enter the default profit %, from 0 to 500', true); pd.focus(); return; }
      pds.disabled = true;
      try { const r = await api('acc', 'profit_default_save', { pct: n }); ACS.mdef = ACC.pctOf(r.profit_default, n); pd.value = String(ACS.mdef); toast(`Default profit saved: ${acPctTxt(ACS.mdef)}`); draw(); }
      catch (er) { } finally { pds.disabled = false; }
    };
    pds.onclick = savePd; pd.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); savePd(); } };
    pd.oninput = () => { const n = acPctIn(pd.value); pd.classList.toggle('acx-bad', n === null || Number.isNaN(n)); };
    $('#acx_madd', box).onclick = () => acMatForm({ grp: ACC.GROUPS[0], unit: 'Nos', gst: 18, profit: null }, mats, reload);
    tb.onclick = async e => {
      const b = e.target.closest('[data-acx-m]'), tr = b && b.closest('tr[data-id]'), x = tr && mats.find(y => y.id === +tr.dataset.id);
      if (!x) return;
      const a = b.dataset.acxM;
      if (a === 'edit') return acMatForm(x, mats, reload);
      b.disabled = true;
      try {
        if (a === 'hide') { await api('acc', 'material_save', { id: x.id, grp: x.grp, name: x.name, unit: x.unit, gst: x.gst, rate: x.rate, profit: acPv(x.profit), hidden: x.hidden ? 0 : 1 }); toast(x.hidden ? `“${x.name}” is offered on Expense sheets again` : `“${x.name}” hidden from Expense sheets`); }
        if (a === 'del') {
          if (!confirm(`Delete “${x.name}” from the price list?\n\nIt goes to the Recycle bin. Expense sheets that use it keep their lines.`)) { b.disabled = false; return; }
          await api('acc', 'material_delete', { id: x.id }); toast('Item deleted. It is in the Recycle bin.');
        }
        await reload();
      } catch (er) { b.disabled = false; }
    };
  }
  draw();
}
ACCT_TABS.materials = acMaterials;

/* add / edit a price list item: group, name, unit, GST %, dealer price, profit % (blank = the default), with the customer price worked out as you type */
function acMatForm(x, mats, done) {
  const def = ACS.mdef;
  const m = modal(`<div class="mh"><h3>${x.id ? 'Edit item' : 'Add item'}</h3><button type="button" class="ib" data-x title="Close" aria-label="Close"><i class="i i-x"></i></button></div>
    <div class="two"><div class="full"><label for="acx_fg">Group</label><select id="acx_fg">${acGroups(mats).map(g => `<option ${g === x.grp ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
    <div class="full"><label for="acx_fn">Name, make and size</label><input id="acx_fn" maxlength="200" value="${esc(x.name || '')}" autocomplete="off" ${SPELL}></div>
    <div><label for="acx_fu">Unit</label><input id="acx_fu" list="acx_units" maxlength="20" value="${esc(x.unit || 'Nos')}"></div>
    <div><label for="acx_ft">GST %</label><select id="acx_ft">${ACX_GSTS.map(v => `<option value="${v}" ${+(x.gst ?? 18) === v ? 'selected' : ''}>${v}%</option>`).join('')}</select></div>
    <div><label for="acx_fr">Dealer price, before GST (₹)</label><input id="acx_fr" inputmode="decimal" value="${acV(x.rate)}" placeholder="Not known yet"></div>
    <div><label for="acx_fp">Profit %</label><input id="acx_fp" inputmode="decimal" value="${esc(acPv(x.profit))}" placeholder="${esc(String(def))} (default)"></div>
    <div class="full acx-fcp" id="acx_fcp" aria-live="polite"></div>
    <div class="acx-fh"><label class="acx-chk"><input type="checkbox" id="acx_fh" ${x.hidden ? 'checked' : ''}> Hidden (not offered on Expense sheets)</label></div></div>
    <div class="bar acx-mft"><button type="button" class="btn" id="acx_fs">Save</button><button type="button" class="btn sec" data-x>Cancel</button></div>`);
  const fr = $('#acx_fr', m), fp = $('#acx_fp', m);
  const calc = () => {
    const r = acNum(fr.value), p = acPctIn(fp.value);
    fr.classList.toggle('acx-bad', r === null); fp.classList.toggle('acx-bad', Number.isNaN(p));
    $('#acx_fcp', m).innerHTML = r && !Number.isNaN(p) ? `Customer price <b>${inr2(ACC.custPrice(r, ACC.pctOf(p, def)))}</b> <span class="mut">= ${inr2(r)} + ${esc(acPctTxt(ACC.pctOf(p, def)))}${p === null ? ' (the default)' : ''}</span>`
      : `<span class="mut">${r === null ? 'The dealer price is not a number.' : Number.isNaN(p) ? 'Profit % is 0 to 500, or blank for the default.' : 'Type the dealer price to see the customer price.'}</span>`;
  };
  fr.oninput = calc; fp.oninput = calc; calc();
  $$('[data-x]', m).forEach(b => b.onclick = () => m.remove());
  $('#acx_fs', m).onclick = async e => {
    const name = $('#acx_fn', m).value.trim().replace(/\s+/g, ' '), rate = acNum(fr.value), pct = acPctIn(fp.value);
    if (!name) { toast('Type the item name', true); $('#acx_fn', m).focus(); return; }
    if (rate === null) { toast('The dealer price is not a number', true); fr.focus(); return; }
    if (Number.isNaN(pct)) { toast('Profit % is 0 to 500, or blank for the default', true); fp.focus(); return; }
    const b = e.currentTarget; b.disabled = true;
    try {
      await api('acc', 'material_save', { id: x.id || 0, grp: $('#acx_fg', m).value, name, unit: $('#acx_fu', m).value.trim() || 'Nos', gst: +$('#acx_ft', m).value, rate, profit: pct ?? '', hidden: $('#acx_fh', m).checked ? 1 : 0 });
    } catch (er) { b.disabled = false; return; } /* e.g. already on the list (shown by api()) */
    m.remove(); toast(x.id ? 'Item saved' : `“${name}” added to the price list`);
    ACS.mats = null; done();
  };
  $('#acx_fn', m).focus();
}

/* ---- material list PDF ---- */
/* jsPDF's built-in Helvetica only has the Windows-1252 characters: anything else is swapped for a plain look-alike */
const ACX_PDF_SWAP = { '₹': 'Rs.', '≤': '<=', '≥': '>=', '→': '->', '←': '<-', '−': '-', '✓': 'v', '✔': 'v', '☐': '[ ]', 'Ø': 'dia ', 'ø': 'dia ', ' ': ' ', ' ': ' ', ' ': ' ', '​': '' };
const ACX_1252 = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const acPdfTxt = s => String(s ?? '').replace(/[\s\S]/g, ch => { const c = ch.charCodeAt(0);
  if (ACX_PDF_SWAP[ch] !== undefined) return ACX_PDF_SWAP[ch];
  return (c >= 32 && c < 127) || (c >= 160 && c < 256) || ACX_1252.includes(ch) ? ch : c === 10 || c === 9 ? ' ' : '?'; });
const acPdfDate = s => /^\d{4}-\d\d-\d\d$/.test(String(s || '')) ? fdt(s) : String(s || '');

/* d = an ac_cost answer with the lines to print (the Expense sheet as it is on screen) */
async function acMaterialPdf(d) {
  const lines = (d.lines || []).filter(l => l.grp !== ACX_SVC && String(l.name || '').trim());
  if (!lines.length) { toast('No materials on this sheet yet (services are not on the material list)', true); return; }
  await qpLibs();
  const p = d.project || {}, cu = d.customer || {}, pl = d.plant || {}, co0 = (typeof S === 'object' && S && S.company) || {}, co = d.company || {};
  const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  pdf.setFont('helvetica', 'normal');
  const wrap = (t, w, s) => pdf.setFontSize(s) && pdf.splitTextToSize(acPdfTxt(t), w);
  const kw = acKw(pl.capacity) || acKw(p.kw), j = (a, sep) => a.filter(v => v !== undefined && v !== null && String(v).trim() !== '').join(sep === undefined ? ' ' : sep);
  const pMake = j([pl.panel_make, pl.panel_model, pl.panel_wattage && pl.panel_wattage + ' Wp']);
  const iMake = j([pl.inverter_make, pl.inverter_model, pl.inverter_capacity && pl.inverter_capacity + ' kW']);
  const pre = String(co0.quote_prefix || '').trim() || 'JS';
  const L = ACC.mlLayout({
    company: { name: co.name || co0.name || '', address: co.address || co0.address || '', phone: co.phone || co0.phone || '', gstin: co.gstin || co0.gstin || '' },
    no: `${pre}/ML/${acFy(today())}/${p.id}`, date: fdt(today()),
    customer: { name: cu.name, phone: cu.phone, address: j([cu.address, cu.district, cu.pincode], ', '), consumer_no: cu.consumer_no, section: cu.kseb_section, landmark: cu.landmark,
      map: +cu.lat && +cu.lng ? `https://maps.google.com/?q=${+cu.lat},${+cu.lng}` : '' },
    project: { kw, phase: cu.phase, system: pl.system_type, panels: pMake ? j([+pl.panel_count ? pl.panel_count + ' ×' : '', pMake]) : +pl.panel_count ? `${pl.panel_count} panels` : p.panel,
      inverter: iMake ? j([+pl.inverter_count > 1 ? pl.inverter_count + ' ×' : '', iMake]) : p.inverter, structure: j([pl.structure_type, pl.structure_material], ', '), quote_no: d.quote_no,
      engineer: p.engineer, install_on: pl.installed_on ? acPdfDate(pl.installed_on) : p.start ? acPdfDate(p.start) + ' (planned)' : '' },
    lines: lines.map(l => ({ grp: l.grp || 'Other', name: l.name, qty: acV(l.qty), unit: l.unit })),
    wrap,
  });
  L.pages.forEach((pg, i) => {
    if (i) pdf.addPage();
    pg.ops.forEach(o => {
      if (o.t === 'text') {
        pdf.setFont('helvetica', o.b ? 'bold' : 'normal'); pdf.setFontSize(o.s); pdf.setTextColor(o.c || '#1d1d1f');
        pdf.text(acPdfTxt(o.txt), o.x, o.y, o.a === 'r' ? { align: 'right' } : {});
      } else if (o.t === 'line') {
        pdf.setDrawColor(o.w >= 0.5 ? '#c9302c' : o.w >= 0.3 ? '#555555' : '#a8a8ad'); pdf.setLineWidth(o.w); pdf.line(o.x1, o.y1, o.x2, o.y2);
      } else if (o.t === 'box') { pdf.setDrawColor('#555555'); pdf.setLineWidth(0.25); pdf.rect(o.x, o.y, o.w, o.h, 'S'); }
    });
  });
  const name = acFileName('Material list', '', j([cu.name, kw && kw + ' kW']));
  pdf.setProperties({ title: name.replace(/\.pdf$/i, ''), subject: 'Material list: purchase and site delivery check' });
  pdf.save(name);
  return L.pages.length;
}

/* leaving an Expense sheet with unsaved changes (another page, the browser's back, closing the tab); Ctrl+S saves */
(() => {
  const prev = window.onhashchange;
  const on = () => ACS.dirty && !!document.getElementById('acx_cs');
  window.onhashchange = e => {
    if (on() && location.hash !== ACS.hash) {
      if (!confirm('This Expense sheet has changes that are not saved.\n\nLeave without saving?')) { history.replaceState(null, '', ACS.hash); return; }
      ACS.dirty = false;
    }
    return prev ? prev.call(window, e) : undefined;
  };
  addEventListener('beforeunload', e => { if (on()) { e.preventDefault(); e.returnValue = ''; } });
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key || '').toLowerCase() === 's' && document.getElementById('acx_cs') && ACS.w) { e.preventDefault(); acCsSave(); } });
})();
