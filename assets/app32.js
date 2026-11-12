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
     Ops: {t:'text',x,y,s,txt,b?,c?,a?} (a:'r' = right-aligned at x), {t:'line',x1,y1,x2,y2,w}, {t:'box',x,y,w,h}. No prices. */
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
      text(R, y, 13, 'MATERIAL LIST', { b: 1, a: 'r' });
      if (first) {
        text(R, y + 4.5, 8, 'Purchase & site delivery check', { a: 'r', c: '#555555' });
        const y0 = y + 9;
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
      const names = wrap(l.name || '', X.qr - X.name - 10, 9), h = Math.max(1, names.length) * LH + 2.6;
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
