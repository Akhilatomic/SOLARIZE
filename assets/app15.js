// Finance: Feasibility fee (30-day validity) · Registration fee · Stamp paper
const FEES = {
  feasibility: { title: 'Feasibility fee', sub: 'KSEB feasibility payments — valid 30 days from the payment date', icon: 'check', tc: 't-feas', paid: 'Paid', pend: 'Pending', filters: [['pending', 'Pending'], ['demanded', 'Demanded'], ['paid', 'Paid'], ['expiring', 'Expiring'], ['all', 'All']] },
  registration: { title: 'Registration fee', sub: 'KSEB registration fee payments', icon: 'card', tc: 't-reg', paid: 'Paid', pend: 'Pending', filters: [['pending', 'Pending'], ['demanded', 'Demanded'], ['paid', 'Paid'], ['all', 'All']] },
  stamp: { title: 'Stamp paper', sub: 'Stamp paper purchases for customer agreements', icon: 'note', tc: 't-stamp', paid: 'Purchased', pend: 'Pending', filters: [['pending', 'Pending'], ['paid', 'Purchased'], ['all', 'All']] },
};
let FEEQ = { q: '', f: {} };
const feeOpen = () => { try { return localStorage.feesOpen !== '0'; } catch (e) { return true; } };
// sidebar group: Finance › Feasibility fee / Registration fee / Stamp paper (Finance access) · Commission / Incentive (assets/app27.js)
const feesNavItems = () => [...(canR('fees') ? Object.entries(FEES).map(([k, v]) => [`#/fees/${k}`, k, v.title, v.icon, v.tc]) : []),
  ...(typeof COMM !== 'undefined' ? COMM.nav(ME).map(([k, l]) => [`#/comm/${k}`, 'comm-' + k, l, COMM_ICON[k], COMM_TC[k]]) : [])];
function feesNav() {
  const L = feesNavItems(); if (!L.length) return '';
  return `<div class="sgrp ${feeOpen() ? 'open' : ''}" id="feesg"><a href="${L[0][0]}" class="sgh" data-g="fees" title="Finance"><span class="ft t-fees"><i class="i i-coin"></i></span><span class="lbl">Finance</span><i class="i i-chev"></i></a>
    <div class="sgc">${L.map(([h, k, t, ic, tc]) => `<a href="${h}" data-sub="${k}" title="${t}"><span class="ft ${tc}"><i class="i i-${ic}"></i></span><span class="lbl">${t}</span></a>`).join('')}</div></div>`;
}
document.addEventListener('click', e => { const h = e.target.closest('.sgh'); if (!h) return;
  const g = h.closest('.sgrp'), onFees = /^#\/(fees|comm)(\/|$)/.test(location.hash);
  if (onFees) { e.preventDefault(); g.classList.toggle('open'); try { localStorage.feesOpen = g.classList.contains('open') ? '1' : '0'; } catch (x) { } }
  else { g.classList.add('open'); try { localStorage.feesOpen = '1'; } catch (x) { } } });

const fdate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
async function pgFees() {
  const kind = FEES[(location.hash.split('/')[2] || '')] ? location.hash.split('/')[2] : 'feasibility', K = FEES[kind];
  $$('aside [data-sub]').forEach(a => a.classList.toggle('on', a.dataset.sub === kind)); const g = $('#feesg'); if (g) g.classList.add('open');
  $('#title').innerHTML = `<span class="ft t-fees"><i class="i i-coin"></i></span><span class="ttl">Finance</span><span class="mut ttls">› ${K.title}</span>`;
  const d = await api('fees', 'list', undefined, '&kind=' + kind), w = canW('fees');
  if (!FEEQ.f[kind]) FEEQ.f[kind] = 'all';
  const st = r => +r.paid ? (kind === 'feasibility' && r.days_left < 0 ? 'expired' : 'paid') : +r.demanded ? 'demanded' : 'pending';
  const cnt = k => d.rows.filter(r => k === 'all' ? true : k === 'expiring' ? (+r.paid && r.days_left >= 0 && r.days_left <= d.alert_days) : k === 'paid' ? +r.paid : st(r) === k).length;
  const stats = kind === 'stamp' ? [['Total', d.rows.length, ''], ['Pending', cnt('pending') + cnt('demanded'), 'o'], ['Purchased', cnt('paid'), 'g']]
    : [['Total', d.rows.length, ''], ['Pending', cnt('pending'), 'o'], ['Demanded', cnt('demanded'), 'b'], ['Paid', cnt('paid'), 'g'], ...(kind === 'feasibility' ? [['Expiring in 3 days', cnt('expiring'), 'r'], ['Expired', d.rows.filter(r => st(r) === 'expired').length, 'r']] : [])];
  $('#main').innerHTML = `<div class="fhead"><span class="ft ftl ${K.tc}"><i class="i i-${K.icon}"></i></span><div><h2>${K.title}</h2><div class="mut">${K.sub}</div></div><span class="sp"></span>
     <button class="btn sec" id="frf"><i class="i i-refresh"></i> Refresh</button><button class="btn sec" id="fpdf"><i class="i i-download"></i> Download PDF</button>${w ? '<button class="btn" id="fadd"><i class="i i-plus"></i> Add customers</button>' : ''}</div>
   <div class="fstats">${stats.map(([l, v, c]) => `<div class="card fst ${c}"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
   <div class="bar fbar"><input id="fq" placeholder="Search by name, phone, consumer no., address, section…" value="${esc(FEEQ.q)}"><div class="tabs" style="margin:0">${K.filters.map(([k, l]) => `<button data-ff="${k}" class="${FEEQ.f[kind] === k ? 'on' : ''}">${l}</button>`).join('')}</div><span class="mut" id="fcnt"></span></div>
   <div class="card tw" style="padding:0"><table id="ftb" class="ftb" data-min="900"></table></div>
   ${kind === 'feasibility' ? `<p class="mut" style="font-size:12px;margin:10px 2px">Feasibility is valid for ${d.valid_days} days from the payment date. Everyone with Finance access gets a notification ${d.alert_days} days before it expires and again when it expires. Uploading the KSEB feasibility receipt in the pipeline marks it paid here automatically.</p>` : kind === 'registration' ? '<p class="mut" style="font-size:12px;margin:10px 2px">Uploading the KSEB registration fee receipt in the pipeline marks it paid here automatically.</p>' : ''}`;
  const filt = () => { const t = FEEQ.q.toLowerCase(), f = FEEQ.f[kind];
    return d.rows.filter(r => (f === 'all' || (f === 'expiring' ? (+r.paid && r.days_left >= 0 && r.days_left <= d.alert_days) : f === 'paid' ? +r.paid : f === 'pending' && kind === 'stamp' ? !+r.paid : st(r) === f))
      && (!t || [r.name, r.phone, r.consumer_no, r.address, r.district, r.pincode, r.kseb_section, r.landmark].join(' ').toLowerCase().includes(t))); };
  const draw = () => { const rows = filt(); $('#fcnt').textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
    $('#ftb').innerHTML = `<colgroup><col style="width:44px"><col style="width:20%"><col><col style="width:14%"><col style="width:110px">${kind === 'stamp' ? '' : '<col style="width:120px">'}<col style="width:${kind === 'feasibility' ? 210 : 140}px"><col style="width:78px"></colgroup>
     <thead><tr><th>#</th><th>Customer</th><th>Address</th><th>Electrical section</th><th>${kind === 'stamp' ? 'Stamp value' : 'Amount'}</th>${kind === 'stamp' ? '' : '<th>Demanded</th>'}<th>${K.paid}</th><th class="right">Remove</th></tr></thead><tbody>
     ${rows.map((r, i) => { const s = st(r);
       const life = kind === 'feasibility' && +r.paid ? `<div class="fval"><small>Paid ${fdate(r.paid_on)}</small><small>Expires ${fdate(r.expires)}</small>${r.days_left < 0 ? `<span class="fbad r">Expired ${-r.days_left}d ago</span>${w ? `<button class="btn sm" data-renew="${r.id}">Renew</button>` : ''}` : `<span class="fbad ${r.days_left <= d.alert_days ? 'r' : r.days_left <= 10 ? 'y' : 'g'}">${r.days_left === 0 ? 'Expires today' : r.days_left + 'd left'}</span>`}</div>` : +r.paid && r.paid_on ? `<div class="fval"><small>${fdate(r.paid_on)}</small>${r.ref ? `<small>Ref ${esc(r.ref)}</small>` : ''}</div>` : '';
       return `<tr class="${s === 'expired' ? 'fexp' : ''}"><td class="mut">${i + 1}</td>
        <td><a href="#/customers/${r.customer_id}"><b>${esc(r.name)}</b></a><div class="fsm">${esc(r.phone || '')}</div>${r.consumer_no ? `<div class="fsm mut">${esc(r.consumer_no)}</div>` : ''}</td>
        <td class="fadr">${esc(r.address || '—')}${r.district ? `<div class="mut">${esc(r.district)}</div>` : ''}${r.pincode ? `<div class="fpin">${esc(r.pincode)}</div>` : ''}</td>
        <td>${esc(r.kseb_section || '—')}</td>
        <td>${w ? `<button class="famt" data-amt="${r.id}" title="Change amount">${inr(r.amount)}</button>` : inr(r.amount)}</td>
        ${kind === 'stamp' ? '' : `<td><button class="fchk ${+r.demanded ? 'on b' : ''}" data-dem="${r.id}" ${w ? '' : 'disabled'} title="${+r.demanded ? 'Demanded ' + fdate(r.demanded_on) : 'Mark as demanded'}"><i class="i i-check"></i></button><small class="fcl">${+r.demanded ? fdate(r.demanded_on) || 'Demanded' : ''}</small></td>`}
        <td><div class="fpay"><button class="fchk ${+r.paid ? 'on g' : ''}" data-paid="${r.id}" ${w ? '' : 'disabled'} title="${+r.paid ? K.paid : 'Mark as ' + K.paid.toLowerCase()}"><i class="i i-check"></i></button>${life}</div></td>
        <td class="right">${w ? `<button class="ib" data-rm="${r.id}" title="Remove from this list"><i class="i i-x"></i></button>` : ''}</td></tr>`; }).join('')
      || `<tr><td colspan="8" class="mut" style="text-align:center;padding:28px">${d.rows.length ? 'Nothing matches.' : `No customers on this list yet.${w ? ' Use <b>Add customers</b>.' : ''}`}</td></tr>`}</tbody>`;
    bind(); };
  const reload = () => pgFees();
  const payModal = r => { const m = modal(`<h2 style="margin-top:0">${kind === 'stamp' ? 'Stamp paper purchased' : (+r.paid ? 'Renew ' : '') + K.title + ' paid'}</h2><p class="mut" style="margin-top:-6px">${esc(r.name)}</p>
      <div class="two"><div><label>${kind === 'stamp' ? 'Purchased on' : 'Paid on'}</label><input type="date" id="fpo" value="${today()}" max="${today()}"></div><div><label>${kind === 'stamp' ? 'Stamp value (₹)' : 'Amount (₹)'}</label><input id="fpa" inputmode="decimal" value="${+r.amount || ''}"></div>
      <div class="full"><label>Receipt / reference no. (optional)</label><input id="fpr" value="${esc(r.ref || '')}" maxlength="80"></div></div>
      ${kind === 'feasibility' ? `<p class="mut" style="font-size:13px">Valid until <b id="fpx"></b> (${d.valid_days} days). You’ll be reminded ${d.alert_days} days before.</p>` : ''}
      <div class="bar" style="margin-top:12px"><button class="btn" id="fps">Save</button><button class="btn sec" id="fpc">Cancel</button></div>`);
    const upx = () => { if ($('#fpx', m)) { const x = new Date($('#fpo', m).value + 'T00:00:00'); x.setDate(x.getDate() + d.valid_days); $('#fpx', m).textContent = isNaN(x) ? '—' : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } };
    $('#fpo', m).oninput = upx; upx(); $('#fpc', m).onclick = () => m.remove();
    $('#fps', m).onclick = async () => { await api('fees', 'set', { id: r.id, paid: 1, paid_on: $('#fpo', m).value, amount: $('#fpa', m).value, ref: $('#fpr', m).value }); m.remove(); toast(`${K.title}: ${r.name} marked ${K.paid.toLowerCase()}`); reload(); }; };
  const bind = () => {
    $$('[data-dem]').forEach(b => b.onclick = async () => { const r = d.rows.find(x => x.id == b.dataset.dem); await api('fees', 'set', { id: r.id, demanded: +r.demanded ? 0 : 1, demanded_on: today() }); reload(); });
    $$('[data-paid]').forEach(b => b.onclick = async () => { const r = d.rows.find(x => x.id == b.dataset.paid);
      if (+r.paid) { if (!confirm(`Mark ${r.name}'s ${K.title.toLowerCase()} as NOT ${K.paid.toLowerCase()}?`)) return; await api('fees', 'set', { id: r.id, paid: 0 }); reload(); } else payModal(r); });
    $$('[data-renew]').forEach(b => b.onclick = () => payModal(d.rows.find(x => x.id == b.dataset.renew)));
    $$('[data-amt]').forEach(b => b.onclick = async () => { const r = d.rows.find(x => x.id == b.dataset.amt), v = prompt(`${kind === 'stamp' ? 'Stamp value' : 'Amount'} for ${r.name} (₹)`, r.amount); if (v === null || v.trim() === '' || isNaN(+v)) return; await api('fees', 'set', { id: r.id, amount: +v }); reload(); });
    $$('[data-rm]').forEach(b => b.onclick = async () => { const r = d.rows.find(x => x.id == b.dataset.rm); if (!confirm(`Remove ${r.name} from ${K.title}?\n\nIt goes to the Recycle bin for 72 hours.`)) return; await api('fees', 'remove', { id: r.id }); toast('Removed — in the Recycle bin'); reload(); });
  };
  $('#fq').oninput = e => { FEEQ.q = e.target.value; draw(); };
  $$('[data-ff]').forEach(b => b.onclick = () => { FEEQ.f[kind] = b.dataset.ff; $$('[data-ff]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#frf').onclick = reload;
  $('#fpdf').onclick = () => feesPdf(kind, K, filt(), st);
  if ($('#fadd')) $('#fadd').onclick = async () => { const cs = await api('fees', 'candidates', undefined, '&kind=' + kind);
    const m = modal(`<h2 style="margin-top:0">Add customers to ${K.title}</h2><input id="fcs" placeholder="Search customers…"><div class="fcl2" id="fcl"></div>
      <div class="bar" style="margin-top:12px"><button class="btn" id="fca">Add selected</button><button class="btn sec" id="fcx">Cancel</button><span class="sp"></span><span class="mut" id="fcn">0 selected</span></div>`);
    const sel = new Set();
    const dr = () => { const t = $('#fcs', m).value.toLowerCase(), L = cs.filter(c => !t || [c.name, c.phone, c.consumer_no, c.district, c.kseb_section].join(' ').toLowerCase().includes(t)).slice(0, 200);
      $('#fcl', m).innerHTML = L.map(c => `<label class="fci"><input type="checkbox" value="${c.id}" ${sel.has(c.id) ? 'checked' : ''}><span><b>${esc(c.name)}</b><small class="mut">${esc([c.phone, c.consumer_no, c.kseb_section].filter(Boolean).join(' · '))}</small></span></label>`).join('') || '<p class="mut">Every customer is already on this list.</p>';
      $$('input[type=checkbox]', $('#fcl', m)).forEach(x => x.onchange = () => { x.checked ? sel.add(+x.value) : sel.delete(+x.value); $('#fcn', m).textContent = sel.size + ' selected'; }); };
    $('#fcs', m).oninput = dr; dr(); $('#fcx', m).onclick = () => m.remove();
    $('#fca', m).onclick = async () => { if (!sel.size) return toast('Select at least one customer', true); const r = await api('fees', 'add', { kind, customer_ids: [...sel] }); m.remove(); toast(`${r.added} customer${r.added === 1 ? '' : 's'} added`); reload(); }; };
  draw();
}
// printable list → browser "Save as PDF"
function feesPdf(kind, K, rows, st) {
  const co = (S.company || {}).name || 'Jasper Solar Solutions', w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to download the PDF', true);
  const total = rows.reduce((a, r) => a + (+r.amount || 0), 0);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(K.title)} — ${new Date().toLocaleDateString('en-GB')}</title><style>
    body{font:12px -apple-system,"Segoe UI",Arial,sans-serif;color:#1d1d1f;margin:28px}h1{font-size:20px;margin:0}.m{color:#6e6e73;margin:2px 0 14px}
    table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e5e5ea;vertical-align:top}th{font-size:11px;color:#6e6e73;background:#f5f5f7}
    .r{color:#c4271f;font-weight:600}.g{color:#1e7a37;font-weight:600}tfoot td{font-weight:700;border-top:2px solid #1d1d1f}@page{margin:12mm}</style></head><body>
    <h1>${esc(K.title)}</h1><div class="m">${esc(co)} · ${rows.length} record${rows.length === 1 ? '' : 's'} · printed ${new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
    <table><thead><tr><th>#</th><th>Customer</th><th>Consumer no.</th><th>Address</th><th>Section</th><th>${kind === 'stamp' ? 'Stamp value' : 'Amount'}</th>${kind === 'stamp' ? '' : '<th>Demanded</th>'}<th>${K.paid}</th>${kind === 'feasibility' ? '<th>Expires</th>' : ''}</tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.name)}</b><br>${esc(r.phone || '')}</td><td>${esc(r.consumer_no || '')}</td><td>${esc(r.address || '')}${r.district ? ', ' + esc(r.district) : ''}${r.pincode ? ' ' + esc(r.pincode) : ''}</td><td>${esc(r.kseb_section || '')}</td><td>${inr(r.amount)}</td>
      ${kind === 'stamp' ? '' : `<td>${+r.demanded ? fdate(r.demanded_on) || 'Yes' : '—'}</td>`}<td class="${+r.paid ? 'g' : ''}">${+r.paid ? fdate(r.paid_on) || 'Yes' : 'Pending'}</td>${kind === 'feasibility' ? `<td class="${st(r) === 'expired' || (r.days_left <= 3 && +r.paid) ? 'r' : ''}">${+r.paid ? fdate(r.expires) + (r.days_left < 0 ? ' (expired)' : ` (${r.days_left}d left)`) : '—'}</td>` : ''}</tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="5">Total</td><td>${inr(total)}</td><td colspan="${kind === 'feasibility' ? 3 : kind === 'stamp' ? 1 : 2}"></td></tr></tfoot></table></body></html>`);
  w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 300);
}

// customer menus: add to / open the Finance lists
let FEEMAP = {};
async function feeMembers(cid) { if (!canR('fees')) return {}; try { const m = await api('fees', 'member', undefined, cid ? '&customer_id=' + cid : ''); if (cid) FEEMAP[cid] = m[cid] || {}; else FEEMAP = m || {}; } catch (e) { } return FEEMAP; }
function feeMenuItems(cid) {
  if (!canR('fees')) return [];
  const on = FEEMAP[cid] || {};
  return Object.entries(FEES).map(([k, v]) => on[k] !== undefined ? ['fopen-' + k, 'check', `On ${v.title}${on[k] ? (k === 'stamp' ? ' · purchased' : ' · paid') : ''} — open`] : canW('fees') ? ['fadd-' + k, 'plus', 'Add to ' + v.title] : null).filter(Boolean);
}
async function feeMenuRun(a, c) {
  if (a.startsWith('fopen-')) { location.hash = '#/fees/' + a.slice(6); return true; }
  if (!a.startsWith('fadd-')) return false;
  const k = a.slice(5); await api('fees', 'add', { kind: k, customer_ids: [c.id] });
  (FEEMAP[c.id] = FEEMAP[c.id] || {})[k] = 0;
  toast(`${c.name} added to ${FEES[k].title}`);
  return true;
}

// ---- feasibility at a glance on the Customers list ----
const feasOf = id => (FEEMAP[id] || {})._feas || null;
// sort key: expired first, then soonest to expire; then demanded, not paid, not on the list
function feasRank(id) { const f = feasOf(id); if (!f) return 1e7; if (f.paid && f.days_left != null) return f.days_left; return f.demanded ? 5e6 : 6e6; }
function feasText(f) {
  if (!f) return { t: 'Not on the feasibility list', c: 'n' };
  if (f.paid && f.days_left != null) return f.days_left < 0 ? { t: `Expired ${-f.days_left} day${f.days_left === -1 ? '' : 's'} ago`, c: 'r', d: `Paid ${fdate(f.paid_on)} · expired ${fdate(f.expires)}` }
    : { t: f.days_left === 0 ? 'Expires today' : `${f.days_left} day${f.days_left === 1 ? '' : 's'} left`, c: f.days_left <= 3 ? 'r' : f.days_left <= 10 ? 'y' : 'g', d: `Paid ${fdate(f.paid_on)} · expires ${fdate(f.expires)}` };
  if (f.paid) return { t: 'Paid', c: 'g', d: f.paid_on ? 'Paid ' + fdate(f.paid_on) : '' };
  return f.demanded ? { t: 'Demanded — not paid yet', c: 'y', d: f.demanded_on ? 'Demanded ' + fdate(f.demanded_on) : '' } : { t: 'Not paid', c: 'o', d: 'On the feasibility list' };
}
// touch devices have no hover → small chip under the name (only when it matters)
function feasChip(id) { if (!canR('fees') || matchMedia('(hover: hover)').matches) return ''; const f = feasOf(id); if (!f) return ''; const x = feasText(f); return `<small class="feasc ${x.c}">Feasibility · ${x.t}</small>`; }
let FH = null;
const hoverOn = () => { try { return localStorage.custHover !== '0'; } catch (e) { return true; } };
// current pipeline stage and what comes next
function stageInfo(c) {
  const P = PIPE || [], i = P.findIndex(x => x[1] === c.status);
  if (!c.project_id || i < 0) return { cur: c.status || 'New', step: '', next: canW('projects') ? 'Start a project' : 'Waiting for a project', nf: '' };
  const st = (STEPS.find(x => x[0] === P[i][2]) || [])[2] || '', n = P[i + 1];
  return { cur: P[i][1], step: st ? `Step ${P[i][2]} · ${st}` : '', next: n ? n[1] : 'Project completed — AMC & service', nf: n ? (n[3] === 'receipt' ? 'receipt needed to move on' : n[3] === 'optional' ? 'optional' : '') : '' };
}
function feasHover(tr, c) {
  if (!matchMedia('(hover: hover)').matches) return;
  tr.onmouseenter = e => { if (!hoverOn()) return; const s = stageInfo(c), f = canR('fees') ? feasText(feasOf(c.id)) : null;
    FH = FH || Object.assign(document.createElement('div'), { id: 'feash' });
    FH.innerHTML = `<div class="fhn">${esc(c.name)}</div>
      <div class="fhs"><div class="fh1">Current status</div><div class="fh2">${esc(s.cur)}</div>${s.step ? `<div class="fh3">${esc(s.step)}</div>` : ''}</div>
      <div class="fhs"><div class="fh1">Next step</div><div class="fh2 nx">${esc(s.next)}</div>${s.nf ? `<div class="fh3">${esc(s.nf)}</div>` : ''}</div>
      ${f ? `<div class="fhs"><div class="fh1"><span class="fhd ${f.c}"></span>Feasibility</div><div class="fh2 ${f.c}">${f.t}</div>${f.d ? `<div class="fh3">${f.d}</div>` : ''}</div>` : ''}`;
    document.body.appendChild(FH); FH.classList.add('on'); place(e); };
  const place = e => { if (!FH || !FH.classList.contains('on')) return; const w = FH.offsetWidth, h = FH.offsetHeight; let x = e.clientX + 16, y = e.clientY + 18; if (x + w > innerWidth - 8) x = e.clientX - w - 12; if (y + h > innerHeight - 8) y = e.clientY - h - 12; FH.style.left = x + 'px'; FH.style.top = Math.max(8, y) + 'px'; };
  tr.onmousemove = place;
  tr.onmouseleave = () => { if (FH) FH.classList.remove('on'); };
}
addEventListener('hashchange', () => { if (FH) FH.classList.remove('on'); });
