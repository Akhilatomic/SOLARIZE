/* Accounts rules (assets/app32.js): pure functions for GST, project cost, profit, periods, message templates,
   WhatsApp links and the material-list PDF layout. No DOM, no fetch, no side effects, so Node can test it
   (tests/acc.test.js). The browser loads it with a plain <script> tag and uses the global ACC. */
const ACC = {
  GST_DIV: 1.089,
  GROUPS: ['Inverter & optimizers', 'Solar panels', 'Structure & supports', 'Distribution boards', 'Metering & isolation', 'DC cables & connectors',
    'AC cables & lugs', 'Earthing & lightning protection', 'Pipes & conduit fittings', 'Cable accessories & consumables', 'Services and charges'],
  r2: n => Math.round((Number(n) || 0) * 100 + (Number(n) >= 0 ? 1e-9 : -1e-9)) / 100,
  /* project value before GST: the tax bill's taxable amount if there is one, else the quoted price ÷ 1.089 */
  beforeGst(price, taxable) { return Number(taxable) > 0 ? ACC.r2(taxable) : ACC.r2((Number(price) || 0) / ACC.GST_DIV); },
  lineAmount(l) { return ACC.r2((Number(l && l.qty) || 0) * (Number(l && l.rate) || 0)); },
  costTotals(lines) {
    let total = 0, missing = 0;
    (lines || []).forEach(l => { total += ACC.lineAmount(l); if ((Number(l.qty) || 0) > 0 && !((Number(l.rate) || 0) > 0)) missing++; });
    return { total: ACC.r2(total), n: (lines || []).length, missing };
  },
  profit(p) {
    const before = ACC.beforeGst(p.price, p.taxable), cost = ACC.costTotals(p.lines).total, comm = ACC.r2(p.comm);
    const profit = ACC.r2(before - cost - comm);
    return { before, cost, comm, profit, margin: before ? ACC.r2(profit / before * 100) : 0 };
  },
  exBefore(e) { return ACC.r2((Number(e.amount) || 0) / (1 + (Number(e.gst) || 0) / 100)); },
  /* who paid, when the payment form's mode changes: a Loan payment is the bank's disbursement; any other mode keeps the choice */
  payFrom(mode, cur) { return mode === 'Loan' ? 'bank' : cur === 'bank' ? 'bank' : 'customer'; },
  /* {pending} in the payment reminder: a pending row's cust_due (on a loan project only the customer's own part), else its due */
  remindDue(r) { return ACC.r2(r && r.cust_due !== undefined && r.cust_due !== null ? r.cust_due : r && r.due); },
  /* KSEB / stamp paper fees: each customer's own (Finance › Fees), added on a cost sheet with this note; never copied between projects */
  FEE_NAMES: ['KSEB feasibility', 'KSEB registration', 'Stamp paper'],
  FEE_NOTE: 'From Finance › Fees',
  isFee(l) {
    const n = String((l && l.name) || '').trim().toLowerCase();
    return ACC.FEE_NAMES.some(f => f.toLowerCase() === n) || String((l && l.note) || '').trim() === ACC.FEE_NOTE;
  },
  /* Copy from another project: the source's lines without its fee lines, and without lines the sheet already has (same material,
     or same group + name in any case); have = the lines kept on the sheet ([] when they are replaced). Items and quantities
     only, rates when asked; supplier, bill and note stay behind. Returns {lines, fees, dup} (fees / dup = lines left out). */
  copyLines(src, have, rates) {
    const key = l => String(l.grp || '').trim().toLowerCase() + '|' + String(l.name || '').trim().toLowerCase();
    const ids = new Set((have || []).map(l => Number(l.material_id) || 0).filter(Boolean)), keys = new Set((have || []).map(key));
    const out = { lines: [], fees: 0, dup: 0 };
    (src || []).forEach(l => {
      if (ACC.isFee(l)) { out.fees++; return; }
      const id = Number(l.material_id) || 0;
      if ((id && ids.has(id)) || keys.has(key(l))) { out.dup++; return; }
      out.lines.push({ material_id: id, grp: String(l.grp || ''), name: String(l.name || ''), qty: Number(l.qty) || 0, unit: String(l.unit || ''), rate: rates ? Number(l.rate) || 0 : 0, gst: Number(l.gst),
        profit: ACC.pctSet(l.profit) ? Number(l.profit) : null });
    });
    return out;
  },
  /* Save as template: a sheet's lines as template items, product + quantity only (no prices, % , GST, supplier, bill, note).
     KSEB / stamp paper fee lines and the automatic commission / incentive line are not part of a template. */
  tplFromLines(lines) {
    return (lines || []).filter(l => l && !ACC.isFee(l) && !l.auto)
      .map(l => ({ material_id: Number(l.material_id) || 0, grp: String(l.grp || ''), name: String(l.name || ''), unit: String(l.unit || ''), qty: Number(l.qty) || 0 }));
  },
  /* Load from template: the template's items as new sheet lines at today's price list (dealer price, GST, profit % by addPct with
     the default def). mats = the price list, have = the lines on the sheet, mode 'add' (skip items already there: same material, or
     same group + name in any case) or 'replace' (only the sheet's own fee lines stay). An item whose product is not on the list
     (deleted or hidden) keeps its saved name, dealer price 0, and is named in missing. Returns {lines, skipped, missing}. */
  tplToLines(tpl, mats, have, mode, def) {
    const key = l => String(l.grp || '').trim().toLowerCase() + '|' + String(l.name || '').trim().toLowerCase();
    const keep = mode === 'replace' ? (have || []).filter(l => ACC.isFee(l)) : (have || []);
    const ids = new Set(keep.map(l => Number(l.material_id) || 0).filter(Boolean)), keys = new Set(keep.map(key));
    const live = (mats || []).filter(m => !Number(m.hidden));
    const out = { lines: [], skipped: 0, missing: [] };
    ((tpl && tpl.items) || []).forEach(it => {
      const id = Number(it.material_id) || 0;
      const m = live.find(x => id && Number(x.id) === id) || live.find(x => key(x) === key(it));
      const mid = m ? Number(m.id) : id; /* a product off the list keeps its old id: saving the sheet does not put it back on the price list */
      if ((mid && ids.has(mid)) || keys.has(key(m || it))) { out.skipped++; return; }
      if (mid) ids.add(mid); keys.add(key(m || it));
      if (!m) out.missing.push(String(it.name || ''));
      out.lines.push({ material_id: mid, grp: String((m || it).grp || ''), name: String((m || it).name || ''), qty: Number(it.qty) || 0, unit: String((m || it).unit || it.unit || ''),
        rate: m ? Number(m.rate) || 0 : 0, gst: m ? Number(m.gst) : 18, profit: ACC.addPct(m || { name: it.name }, def), supplier: '', bill_no: '', bill_date: '', note: '' });
    });
    return out;
  },
  /* ---- Expense sheet and price list: dealer price (before GST) + profit % = customer price ---- */
  SVC: 'Services and charges', /* the services group; every other group is a purchase */
  /* short names for the category tabs of the Add item window; any other group keeps its own name */
  GRP_SHORT: { 'Inverter & optimizers': 'Inverter', 'Solar panels': 'Panels', 'Structure & supports': 'Structure', 'Distribution boards': 'DB boxes',
    'Metering & isolation': 'Meter', 'DC cables & connectors': 'DC cables', 'AC cables & lugs': 'AC cables', 'Earthing & lightning protection': 'Earthing',
    'Pipes & conduit fittings': 'Pipes', 'Cable accessories & consumables': 'Accessories', 'Services and charges': 'Services' },
  grpShort: g => (g ? ACC.GRP_SHORT[g] || String(g) : 'Other'),
  /* ---- categories: the built-in groups (GROUPS) plus the ones added in the app ---- */
  GRP_LEN: 40, /* characters in a category name (ACC_GROUP_LEN in api/accounts.php) */
  /* by name, any case; the exact spelling settles a tie so two groups never interleave */
  grpCmp(a, b) { const p = String(a || ''), q = String(b || ''), x = p.toLowerCase(), y = q.toLowerCase(); return x < y ? -1 : x > y ? 1 : p < q ? -1 : p > q ? 1 : 0; },
  /* where a group sorts: the built-in purchase groups in their order, the added categories next (by name), Services, then no group */
  grpIdx(g) { const i = ACC.GROUPS.indexOf(g); return i >= 0 ? i : g ? ACC.GROUPS.indexOf(ACC.SVC) - 0.5 : ACC.GROUPS.length; },
  /* every category in order: extra = the saved list (ac_materials groups), used = the groups the products have */
  grpAll(extra, used) {
    const own = [...new Set((extra || []).concat(used || []).map(g => String(g || '')).filter(g => g && !ACC.GROUPS.includes(g)))].sort(ACC.grpCmp);
    return ACC.GROUPS.filter(g => g !== ACC.SVC).concat(own, [ACC.SVC]);
  },
  /* a category name as typed → {name, error, same}. name = trimmed, single spaces; error = why it cannot be used; same = the category
     already there under that name (any case) or under a built-in group's short tab name. skip = the category being renamed. */
  grpCheck(raw, groups, skip) {
    const name = String(raw == null ? '' : raw).replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim(), l = name.toLowerCase();
    if (!name) return { name, error: 'Type the category name', same: '' };
    if ([...name].length > ACC.GRP_LEN) return { name, error: `The category name is too long (${ACC.GRP_LEN} characters at most)`, same: '' };
    if (l === 'all' || l === 'other') return { name, error: `“${name}” is a name the app uses itself. Pick another name.`, same: '' };
    const same = (groups || []).find(g => g !== skip && String(g).toLowerCase() === l)
      || ACC.GROUPS.find(g => g !== skip && (g.toLowerCase() === l || ACC.GRP_SHORT[g].toLowerCase() === l)) || '';
    return { name, error: '', same };
  },
  PROFIT_DEF: 15,              /* the default profit % until Settings › Price list changes it (acc_profit_default) */
  pctSet: p => p !== null && p !== undefined && String(p).trim() !== '' && isFinite(Number(p)),
  /* a profit % as stored: blank (null / '') = the default (def, else 15); a typed 0 stays 0 */
  pctOf(p, def) { return ACC.pctSet(p) ? Number(p) : ACC.pctSet(def) ? Number(def) : ACC.PROFIT_DEF; },
  /* the profit % a new sheet line gets from a price list item: the item's own; a blank % = 0 for a KSEB / stamp paper fee (passed on
     at cost), else the default */
  addPct(item, def) { return ACC.pctSet(item && item.profit) ? Number(item.profit) : ACC.isFee(item) ? 0 : ACC.pctOf(null, def); },
  /* Add item, several products at once: picks = [{id, qty}] (qty as typed: '' = not typed, '1,250.5' = 1250.5) against the price list
     rows. rows = the ticked products still on the list, in tick order, with qty (a number > 0 or null); ok = at least one row and every
     row has a quantity above 0 (the "product + quantity" rule); need = rows still without one. */
  pickPlan(picks, mats) {
    const byId = new Map((mats || []).map(m => [Number(m.id), m]));
    const rows = [];
    (picks || []).forEach(p => {
      const item = byId.get(Number(p && p.id)); if (!item) return;
      const s = String(p.qty == null ? '' : p.qty).replace(/[,₹\s]/g, ''), n = s === '' ? NaN : Number(s);
      rows.push({ item, qty: isFinite(n) && n > 0 ? n : null });
    });
    const need = rows.filter(r => r.qty === null).length;
    return { rows, ok: rows.length > 0 && need === 0, need };
  },
  /* ---- Purchased / To buy: a line is bought (1) or not; services say To pay / Paid ---- */
  isBought: l => !!l && Number(l.bought) === 1,
  statusWord(l) { const svc = !!l && l.grp === ACC.SVC; return ACC.isBought(l) ? (svc ? 'Paid' : 'Purchased') : (svc ? 'To pay' : 'To buy'); },
  /* the common value of a field over the chosen lines (idxs), blank when they differ or any is blank */
  sharedValue(lines, idxs, key) {
    const vs = (idxs || []).map(i => String(((lines || [])[i] || {})[key] || '').trim());
    return vs.length && vs.every(v => v === vs[0]) ? vs[0] : '';
  },
  /* form = {date, supplier, bill_no, bill_date, rates: {lineIndex: price paid}}; '' when it can be applied, else what to fix */
  boughtCheck(idxs, form) {
    const f = form || {}, ok = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
    if (!(idxs || []).length) return 'Choose at least one line';
    if (!ok(f.date)) return 'Enter the purchase date';
    if (String(f.bill_date || '') !== '' && !ok(f.bill_date)) return 'The bill date is not a valid date';
    for (const i of idxs) { const r = (f.rates || {})[i]; if (r !== undefined && !(typeof r === 'number' && isFinite(r) && r >= 0)) return 'The price paid must be a number, 0 or more'; }
    return '';
  },
  /* Mark purchased: new lines (the input is not changed); the chosen ones get status, date, supplier, bill no., bill date (blank = the purchase
     date); a blank supplier / bill no. keeps the line's own and the price paid; a price different from the line's counts as a typed dealer price (typed), so it can update the price list on Save */
  markBought(lines, idxs, form) {
    const f = form || {}, pick = new Set((idxs || []).map(Number));
    return (lines || []).map((l, i) => {
      if (!pick.has(i)) return l;
      const n = Object.assign({}, l, { bought: 1, bought_on: String(f.date || ''), supplier: String(f.supplier || '').trim() || l.supplier, bill_no: String(f.bill_no || '').trim() || l.bill_no, bill_date: String(f.bill_date || '') || String(f.date || '') });
      const r = (f.rates || {})[i];
      if (r !== undefined && r !== null && isFinite(Number(r))) { if (Math.abs(Number(r) - (Number(l.rate) || 0)) > 0.0001) n.typed = true; n.rate = Number(r); }
      return n;
    });
  },
  /* Undo: back to To buy; supplier and bill text stay */
  undoBought: l => Object.assign({}, l, { bought: 0, bought_on: '' }),
  /* the material list's lines: materials only (no services, no blank names); onlyToBuy also drops the purchased ones */
  mlLines(lines, onlyToBuy) { return (lines || []).filter(l => l.grp !== ACC.SVC && String(l.name || '').trim() && !(onlyToBuy && ACC.isBought(l))); },
  /* true when a material (not a service) is already purchased: only then the PDF asks All items / Only items still to buy */
  hasBoughtMaterial: lines => (lines || []).some(l => l.grp !== ACC.SVC && ACC.isBought(l)),
  custPrice(dealer, pct) { return ACC.r2((Number(dealer) || 0) * (1 + (Number(pct) || 0) / 100)); },
  /* ---- suppliers and their prices for a price list item (mat.offers, mat.offer_id = the one in use) ---- */
  /* the short name shown beside a price: the supplier's tag, else the first word of its name */
  supTag(s) { const t = String((s && s.tag) || '').trim(); return (t || String((s && s.name) || '').trim().split(/\s+/)[0] || '').slice(0, 14); },
  /* an item's supplier prices side by side, cheapest first (then supplier name): each with sup (name), tag, low (the lowest price, when
     there are two or more) and diff (its price − the dealer price; null while the item has none). used = the one in use (or null),
     others = the rest, lowest = the lowest price, save = what the lowest saves against the dealer price (0 when nothing). Prices of a
     supplier not in sups are left out. */
  offerView(mat, sups) {
    const by = {}; (sups || []).forEach(s => { by[s.id] = s; });
    const rate = Number(mat && mat.rate) || 0;
    const all = ((mat && mat.offers) || []).filter(o => by[o.supplier_id]).map(o => Object.assign({}, o, { rate: Number(o.rate) || 0, sup: by[o.supplier_id].name, tag: ACC.supTag(by[o.supplier_id]) }))
      .sort((a, b) => a.rate - b.rate || String(a.sup).localeCompare(String(b.sup)) || a.id - b.id);
    const lowest = all.length ? all[0].rate : 0;
    all.forEach(o => { o.low = all.length > 1 && Math.abs(o.rate - lowest) < 0.005; o.diff = rate > 0 ? ACC.r2(o.rate - rate) : null; });
    const used = all.find(o => o.id === (mat && mat.offer_id)) || null;
    return { all, used, others: all.filter(o => o !== used), lowest, n: all.length, save: rate > 0 && all.length && rate - lowest > 0.005 ? ACC.r2(rate - lowest) : 0 };
  },
  /* where to buy a sheet line: the supplier typed on the line, else the supplier (and brand) of the item's price in use; '' when
     neither. mat = the price list item of the line (or null). */
  buyFrom(line, mat, sups) {
    const typed = String((line && line.supplier) || '').trim();
    const u = mat ? ACC.offerView(mat, sups).used : null;
    if (typed) return u && u.brand && typed.toLowerCase() === String(u.sup).toLowerCase() ? typed + ' (' + u.brand + ')' : typed;
    return u ? u.sup + (u.brand ? ' (' + u.brand + ')' : '') : '';
  },
  /* the price list's supplier filter: '' = every item, 'cheaper' = a supplier is cheaper than the dealer price, 'pick' = has supplier
     prices but none in use, 'none' = no supplier price, else a supplier id */
  offerFilter(mat, f, sups) {
    if (!f) return true;
    const v = ACC.offerView(mat, sups);
    if (f === 'cheaper') return v.save > 0;
    if (f === 'pick') return v.n > 0 && !v.used;
    if (f === 'none') return v.n === 0;
    return v.all.some(o => String(o.supplier_id) === String(f));
  },
  lineExpense(l) { return ACC.lineAmount(l); },
  lineCust(l, def) { return ACC.r2((Number(l && l.qty) || 0) * (Number(l && l.rate) || 0) * (1 + ACC.pctOf(l && l.profit, def) / 100)); },
  /* the sheet's money: purchases (every group but services), services, commission / incentive, expense (all three), customer total from the list */
  sheetTotals(lines, comm, def) {
    const t = { purchases: 0, services: 0, comm: ACC.r2(comm), expense: 0, cust: 0, n: 0, missing: 0, bought: 0, tobuy: 0 };
    (lines || []).forEach(l => {
      t[l.grp === ACC.SVC ? 'services' : 'purchases'] += ACC.lineAmount(l);
      t[ACC.isBought(l) ? 'bought' : 'tobuy'] += ACC.lineAmount(l); /* purchased / paid vs still to buy / pay: before GST, commission in neither */
      t.cust += ACC.lineCust(l, def); t.n++;
      if ((Number(l.qty) || 0) > 0 && !((Number(l.rate) || 0) > 0)) t.missing++;
    });
    t.purchases = ACC.r2(t.purchases); t.services = ACC.r2(t.services); t.cust = ACC.r2(t.cust); t.bought = ACC.r2(t.bought); t.tobuy = ACC.r2(t.tobuy);
    t.expense = ACC.r2(t.purchases + t.services + t.comm);
    return t;
  },
  /* the automatic commission / incentive line: c = ac_cost's comm {amount, kind, person, p1, p2} */
  commLabel(c) { return c && c.person ? `${c.kind === 'commission' ? 'Commission' : 'Incentive'} — ${c.person}` : 'Commission / incentive'; },
  commStatus(c) {
    const a = Number(c && c.amount) || 0, p1 = Number(c && c.p1) || 0, paid = p1 + (Number(c && c.p2) || 0);
    return a <= 0 ? 'Not set' : paid >= a - 0.005 ? 'Paid' : p1 > 0 ? 'Part 1 paid' : 'Pending';
  },
  /* agreed price before GST against the customer total from the price list: within ₹1 = matches */
  listGap(before, cust) { const diff = ACC.r2((Number(before) || 0) - (Number(cust) || 0)); return { diff, word: Math.abs(diff) < 1 ? 'matches' : diff > 0 ? 'more' : 'less' }; },
  /* message templates: {name} -> value; money placeholders are formatted en-IN (decimals only when not whole) */
  fill(tpl, vars) {
    const money = ['amount', 'pending', 'bill_total', 'received_total'];
    return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => {
      const v = vars && vars[k];
      if (v === undefined || v === null) return '';
      if (money.includes(k) && v !== '' && !isNaN(Number(v))) {
        const n = Number(v);
        return n.toLocaleString('en-IN', Number.isInteger(n) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      return String(v);
    });
  },
  /* report period: '2026-11' (a month) or 'fy-26-27' (1 Apr 2026 - 31 Mar 2027); empty = the month of `today` */
  period(s, today) {
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], p2 = n => String(n).padStart(2, '0');
    const fy = /^fy-(\d\d)-(\d\d)$/.exec(s || '');
    if (fy) return { from: `20${fy[1]}-04-01`, to: `20${fy[2]}-03-31`, label: `FY 20${fy[1]}-${fy[2]}`, kind: 'fy' };
    let m = /^(\d{4})-(\d\d)$/.exec(s || '');
    if (!m) {
      const t = today || new Date().toISOString().slice(0, 10);
      m = /^(\d{4})-(\d\d)/.exec(t);
    }
    const y = +m[1], mo = +m[2], last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return { from: `${y}-${p2(mo)}-01`, to: `${y}-${p2(mo)}-${p2(last)}`, label: `${MON[mo - 1]} ${y}`, kind: 'month' };
  },
  waLink(phone, text) {
    let n = String(phone || '').replace(/\D/g, '').replace(/^0+/, '');
    if (n.length === 10) n = '91' + n;
    return `https://wa.me/${n}?text=${encodeURIComponent(text || '')}`;
  },
  /* Material-list PDF layout: mm on A4 (210 x 297), text sizes in pt. Returns {pages:[{ops}]}; the caller draws the ops with jsPDF.
     d.wrap(text, widthMm, sizePt) -> string[] may be supplied (jsPDF's splitTextToSize); the default estimates the width.
     Ops: {t:'text',x,y,s,txt,b?,c?,a?} (a:'r' = right-aligned at x), {t:'line',x1,y1,x2,y2,w}, {t:'box',x,y,w,h}. No prices.
     A line may carry sup (the supplier to buy it from, with the brand): printed under the item name. */
  mlLayout(d) {
    const M = 14, W = 210, H = 297, R = W - M, BOTTOM = H - M - 6, LH = 4.4, SIG_H = 30;
    const wrap = d.wrap || ((t, w, s) => {
      const per = Math.max(1, Math.floor(w / (0.5 * s * 0.3528))), out = [];
      let cur = '';
      String(t || '').split(/\s+/).filter(Boolean).forEach(word => {
        while (word.length > per) { if (cur) { out.push(cur); cur = ''; } out.push(word.slice(0, per)); word = word.slice(per); }
        if (!cur) cur = word; else if ((cur + ' ' + word).length <= per) cur += ' ' + word; else { out.push(cur); cur = word; }
      });
      if (cur) out.push(cur);
      return out.length ? out : [''];
    });
    const co = d.company || {}, cu = d.customer || {}, pr = d.project || {};
    const X = { sr: 15, name: 23, qr: 108, unit: 111, ord: 125, del: 137, ok: 159, rem: 168 };
    const pages = [];
    let ops, y;
    const text = (x, yy, s, txt, o) => ops.push(Object.assign({ t: 'text', x, y: yy, s, txt }, o));
    const line = (x1, y1, x2, y2, w) => ops.push({ t: 'line', x1, y1, x2, y2, w: w || 0.2 });
    const newPage = first => {
      ops = []; pages.push({ ops }); y = M + 4;
      text(M, y, first ? 15 : 11, co.name || '', { b: 1 });
      text(R, y, d.partial && !first ? 11 : 13, d.partial && !first ? 'MATERIAL LIST (items still to buy)' : 'MATERIAL LIST', { b: 1, a: 'r' });
      if (first) {
        text(R, y + 4.5, 8, 'Purchase & site delivery check', { a: 'r', c: '#555555' });
        if (d.partial) text(R, y + 9, 9, '(items still to buy)', { b: 1, a: 'r' });
        const y0 = y + (d.partial ? 13.5 : 9);
        [d.no && 'No: ' + d.no, d.date && 'Date: ' + d.date].filter(Boolean).forEach((l, i) => text(R, y0 + i * 4, 9, l, { a: 'r' }));
        const sub = [co.address, co.phone && 'Ph: ' + co.phone, co.gstin && 'GSTIN: ' + co.gstin].filter(Boolean).join('  |  ');
        y += 1;
        /* a wrapped line never starts or ends on the | separator */
        if (sub) wrap(sub, 120, 8).map(l => l.replace(/^\s*\|\s*|\s*\|\s*$/g, '')).filter(Boolean).forEach(l => { y += 3.8; text(M, y, 8, l, { c: '#555555' }); });
        y = Math.max(y, y0 + 4);
      } else {
        y += 5; text(R, y, 9, [d.no && 'No: ' + d.no, d.date].filter(Boolean).join('   '), { a: 'r' });
      }
      y += 3; line(M, y, R, y, 0.5); y += 5;
    };
    const block = (title, fields) => {
      const rows = fields.filter(f => f[1] !== undefined && f[1] !== null && String(f[1]).trim() !== '');
      if (!rows.length) return;
      text(M, y, 10, title, { b: 1 }); y += 5;
      rows.forEach(([k, v]) => {
        const ls = wrap(String(v), R - (M + 34), 9);
        text(M + 1, y, 9, k, { c: '#555555' });
        ls.forEach(l => { text(M + 34, y, 9, l); y += LH; });
      });
      y += 2;
    };
    const tableHead = top => { /* top = false right under a continuation page's header rule (no double line) */
      if (top !== false) line(M, y - 4, R, y - 4, 0.3);
      text(X.sr, y, 8, '#', { b: 1 }); text(X.name, y, 8, 'Item', { b: 1 });
      text(X.qr, y, 8, 'Qty', { b: 1, a: 'r' }); text(X.unit, y, 8, 'Unit', { b: 1 });
      text(X.ord, y, 8, 'Ordered', { b: 1 }); text(X.del, y, 8, 'Delivered qty', { b: 1 }); text(X.ok - 1, y, 8, 'OK', { b: 1 }); text(X.rem, y, 8, 'Remarks', { b: 1 });
      y += 2; line(M, y, R, y, 0.3); y += 5;
    };
    newPage(true);
    block('Customer', [['Name', cu.name], ['Phone', cu.phone], ['Address', cu.address], ['Consumer no.', cu.consumer_no], ['Section', cu.section], ['Landmark', cu.landmark], ['Map', cu.map]]);
    block('Project', [['Capacity (kW)', pr.kw], ['Phase', pr.phase], ['System', pr.system], ['Panels', pr.panels], ['Inverter', pr.inverter], ['Structure', pr.structure], ['Quote no.', pr.quote_no], ['Engineer', pr.engineer], ['Install on', pr.install_on]]);
    y += 2; tableHead();
    const next = () => { newPage(false); tableHead(false); };
    let grp = null, sr = 0;
    (d.lines || []).forEach(l => {
      /* l.sup = where to buy it (supplier, brand): a small grey line under the item name */
      const names = wrap(l.name || '', X.qr - X.name - 10, 9), sups = l.sup ? wrap('Buy from: ' + l.sup, X.qr - X.name - 10, 8) : [];
      const h = Math.max(1, names.length) * LH + sups.length * 3.6 + 2.6;
      const g = l.grp || '';
      const needG = g && g !== grp;
      if (y + h + (needG ? 7 : 0) > BOTTOM) { next(); grp = null; }
      if (g && g !== grp) {
        grp = g; ops.push({ t: 'text', x: M + 1, y: y, s: 9, txt: g, b: 1 });
        line(M, y + 1.6, R, y + 1.6, 0.2); y += 6.2;
      }
      sr++;
      text(X.sr, y, 9, String(sr));
      names.forEach((n, i) => text(X.name, y + i * LH, 9, n));
      sups.forEach((n, i) => text(X.name, y + Math.max(1, names.length) * LH + i * 3.6 - 0.6, 8, n, { c: '#555555' }));
      text(X.qr, y, 9, String(l.qty === undefined || l.qty === null ? '' : l.qty), { a: 'r' });
      text(X.unit, y, 9, String(l.unit || ''));
      ops.push({ t: 'box', x: X.ord + 3.2, y: y - 3, w: 3.6, h: 3.6 });
      line(X.del, y + 0.4, X.del + 18, y + 0.4, 0.2);
      ops.push({ t: 'box', x: X.ok, y: y - 3, w: 3.6, h: 3.6 });
      y += h - 2.6 + 1; line(M, y - 3.2, R, y - 3.2, 0.1); y += 2.2;
    });
    if (y + SIG_H > BOTTOM) newPage(false);
    y = Math.max(y + 10, BOTTOM - SIG_H + 8);
    if (y > BOTTOM - 4) y = BOTTOM - 4;
    /* three columns; a label wider than its column (the 3rd is ~70 mm at 8 pt) wraps under its line */
    const cw = (R - M) / 3;
    ['Purchased by · date', 'Delivered by (driver / supplier) · date', 'Received at site (engineer / customer) · signature'].forEach((t, i) => {
      line(M + i * cw + 1, y, M + (i + 1) * cw - 4, y, 0.3);
      wrap(t, cw - 5, 8).forEach((l, k) => text(M + i * cw + 1, y + 4 + k * 3.6, 8, l));
    });
    pages.forEach((p, i) => p.ops.push({ t: 'text', x: R, y: H - M + 2, s: 8, txt: `Page ${i + 1} / ${pages.length}`, a: 'r', c: '#555555' }));
    return { pages };
  }
};
if (typeof module !== 'undefined' && module.exports) module.exports = ACC;
