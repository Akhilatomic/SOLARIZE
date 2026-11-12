/* Accounts: a project's cost sheet, the Materials list tab and the material list PDF (assets/app34.js).
   acCostSheet(pid)  #/accounts/cost/<pid>: what the plant cost us, line by line (rates before GST), grouped like the quotation (ACC.GROUPS),
                     with the price before GST, total cost, profit and lines without a rate on top. Saving replaces every line (acc/cost_save);
                     a line that is not on the Materials list yet is added to it, and a typed rate becomes the material's last purchase rate.
   acMaterials(box)  the Materials list tab (ACCT_TABS.materials): add, edit, hide, delete (Recycle bin).
   acMaterialPdf(d)  A4 material list for purchase and the site delivery check (no prices, services left out), drawn with jsPDF from ACC.mlLayout.
   Uses ACC (app32.js), acFy / ACCT_TABS (app33.js), acKw / acFileName (app35.js), qpLibs (app21.js), inr2 / fdt (app18.js). */
const ACX_SVC = 'Services and charges';
const ACX_GSTS = [0, 5, 12, 18, 28];
const ACX_UNITS = ['Nos', 'm', 'kg', 'kW', 'Job', 'Set', 'Lot', 'Pair', 'Roll', 'Box', 'Bag'];
const ACX_COLS = 11;
/* the open cost sheet: d = the ac_cost answer, lines = the lines being edited (in group order) */
const ACS = { pid: 0, d: null, lines: [], dirty: false, hash: '', w: false, busy: false, mats: null };

/* a typed amount: '' = 0, '1,250.50' = 1250.5, anything else (or below 0) = null */
const acNum = v => { const s = String(v ?? '').replace(/[,₹\s]/g, ''); if (s === '') return 0; const n = Number(s); return isFinite(n) && n >= 0 ? n : null; };
const acV = n => +n ? String(+n) : '';
const acGi = g => { const i = ACC.GROUPS.indexOf(g); return i < 0 ? ACC.GROUPS.length : i; };
/* quotation group order, groups not in ACC.GROUPS last (by name); lines keep their order inside a group */
const acSort = ls => ls.map((l, i) => [l, i]).sort((a, b) => acGi(a[0].grp) - acGi(b[0].grp) || (acGi(a[0].grp) === ACC.GROUPS.length ? String(a[0].grp || '').localeCompare(String(b[0].grp || '')) : 0) || a[1] - b[1]).map(x => x[0]);
const acIn = l => ({ material_id: +l.material_id || 0, grp: String(l.grp || ''), name: String(l.name || ''), qty: +l.qty || 0, unit: String(l.unit || ''), rate: +l.rate || 0, gst: ACX_GSTS.includes(+l.gst) ? +l.gst : 18,
  supplier: String(l.supplier || ''), bill_no: String(l.bill_no || ''), bill_date: String(l.bill_date || ''), note: String(l.note || '') });
const acOut = l => ({ material_id: l.material_id, grp: l.grp, name: l.name, qty: l.qty, unit: l.unit, rate: l.rate, gst: l.gst, supplier: l.supplier, bill_no: l.bill_no, bill_date: l.bill_date, note: l.note });
const acFromMat = m => acIn({ material_id: m.id, grp: m.grp, name: m.name, qty: 1, unit: m.unit, rate: m.rate, gst: m.gst });
const acMats = async fresh => { if (fresh || !ACS.mats) ACS.mats = await api('acc', 'ac_materials'); return ACS.mats; };
const acGroups = mats => [...new Set(ACC.GROUPS.concat((mats || []).map(m => m.grp).filter(Boolean)))];
const acUnits = () => { if (!document.getElementById('acx_units')) document.body.insertAdjacentHTML('beforeend', `<datalist id="acx_units">${ACX_UNITS.map(u => `<option value="${u}">`).join('')}</datalist>`); };
const acPl = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;

function acDirty(on) {
  ACS.dirty = on;
  const s = $('#acx_st'); if (!s) return;
  s.textContent = on ? 'Unsaved changes' : ACS.lines.length ? 'Saved' : 'No lines yet';
  s.classList.toggle('acx-dirty', on);
}
/* lines added, removed or copied: back into group order and drawn again */
function acChanged() { ACS.lines = acSort(ACS.lines); acCsTable(); acCsTiles(); acDirty(true); }

async function acCostSheet(pid) {
  $('#title').innerHTML = '<span class="ft t-accounts"><i class="i i-coin"></i></span><span class="ttl">Accounts</span><span class="mut ttls">› Project cost</span>';
  const main = $('#main'), nav = ROUTE_N;
  if (!pid) { main.innerHTML = '<p class="over">No project chosen. Open a project and press Project cost.</p>'; return; }
  let d;
  try { d = await api('acc', 'ac_cost', undefined, `&project_id=${pid}`); }
  catch (e) { if (nav === ROUTE_N) main.innerHTML = `<p class="over">${esc((e && e.error) || 'Could not open the cost sheet')}</p>`; return; }
  if (nav !== ROUTE_N) return; /* the user moved on while it loaded */
  Object.assign(ACS, { pid, d, lines: acSort((d.lines || []).map(acIn)), hash: location.hash, w: canW('accounts'), busy: false, dirty: false });
  const p = d.project || {}, cu = d.customer || {}, kw = acKw(p.kw), w = ACS.w;
  acUnits();
  main.innerHTML = `<div class="acx-pg" id="acx_cs">
    <div class="acx-crumb"><a href="#/accounts/profit">← Project profit</a>${cu.id ? ` · <a href="#/customers/${cu.id}">${esc(cu.name)}</a>` : ''} · <a href="#/projects/${p.id}">Open project</a></div>
    <div class="acx-hd"><div><h2>Project cost · ${esc(cu.name || p.title || '')}${kw ? ` <span class="mut">${esc(kw)} kW</span>` : ''}</h2>
      <div class="acx-sub">${p.loan === 'Yes' ? '<span class="pill acx-tag">Loan</span>' : ''}<span>${esc([p.title, p.stage].filter(Boolean).join(' · '))}</span></div></div>
      <span class="sp"></span><span class="acx-st" id="acx_st" aria-live="polite"></span>
      <button type="button" class="btn sec" id="acx_pdf"><i class="i i-download"></i> Download material list</button>${w ? '<button type="button" class="btn" id="acx_save"><i class="i i-check"></i> Save</button>' : ''}</div>
    <div class="acx-tiles" id="acx_tiles"></div>
    <div class="acx-ch"><h3>Materials and services</h3><span class="sp"></span>${w ? '<button type="button" class="btn sec" id="acx_copy"><i class="i i-copy"></i> Copy from another project</button><button type="button" class="btn" id="acx_add"><i class="i i-plus"></i> Add material</button>' : ''}</div>
    <div class="card tw"><table class="acx-cst" id="acx_tb" data-min="1060"></table></div>
    <div id="acx_fee"></div>
    <p class="acx-note">Rates and amounts are before GST. Profit = project price before GST − total cost − incentive / commission. ${w ? 'A material typed here is saved to the Materials list with its group, unit and GST %, and the rate you enter becomes its last purchase rate. ' : ''}The material list PDF has no prices and leaves out services.</p>
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
      l[f] = n || 0;
      $('.acx-amt', tr).textContent = inr2(ACC.lineAmount(l)); acGsum(); acCsTiles();
    } else l[f] = f === 'gst' ? +el.value : el.value;
    acDirty(true);
  };
  tb.addEventListener('input', onEdit); tb.addEventListener('change', onEdit);
  tb.addEventListener('click', e => {
    const b = e.target.closest('[data-acx-del]'); if (!b) return;
    const i = +b.closest('tr').dataset.i, l = ACS.lines[i]; if (!l) return;
    if ((l.rate || l.supplier || l.bill_no || l.note) && !confirm(`Remove “${l.name}” from this cost sheet?`)) return;
    ACS.lines.splice(i, 1); acChanged();
  });
  $('#acx_pdf').onclick = async e => { const b = e.currentTarget; b.disabled = true; try { await acMaterialPdf(Object.assign({}, ACS.d, { lines: ACS.lines })); } catch (x) { toast((x && (x.message || x.error)) || 'Could not make the PDF', true); } b.disabled = false; };
  if (w) {
    $('#acx_save').onclick = () => acCsSave();
    $('#acx_add').onclick = () => acCsAdd();
    $('#acx_copy').onclick = () => acCsCopy();
  }
}

/* the lines table: a group row, then its lines; the automatic incentive / commission row last */
function acCsTable() {
  const tb = $('#acx_tb'); if (!tb) return;
  const w = ACS.w, n = w ? ACX_COLS : ACX_COLS - 1, comm = +((ACS.d || {}).auto || {}).comm || 0;
  const cols = [['', ''], [64, 'num'], [76, ''], [100, 'num'], [64, 'num'], [108, 'num'], [130, ''], [96, ''], [132, ''], [130, '']].concat(w ? [[40, '']] : []);
  let body = '', g = null, gi = -1;
  ACS.lines.forEach((l, i) => {
    if (gi < 0 || l.grp !== g) { g = l.grp; gi++; body += `<tr class="acx-grp"><td colspan="${n}"><b>${esc(g || 'Other')}</b><span class="acx-gsum" data-acx-g="${gi}"></span></td></tr>`; }
    body += w ? `<tr data-i="${i}" data-g="${gi}"><td class="acx-nm">${esc(l.name)}${l.material_id ? '' : ' <span class="pill acx-new" title="Goes on the Materials list when you save">new</span>'}</td>
      <td class="num"><input data-f="qty" inputmode="decimal" value="${acV(l.qty)}" aria-label="Quantity"></td>
      <td><input data-f="unit" value="${esc(l.unit)}" list="acx_units" maxlength="20" aria-label="Unit"></td>
      <td class="num"><input data-f="rate" inputmode="decimal" value="${acV(l.rate)}" placeholder="0" aria-label="Rate before GST"></td>
      <td class="num"><select data-f="gst" aria-label="GST %">${ACX_GSTS.map(v => `<option value="${v}" ${l.gst === v ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
      <td class="num acx-amt">${inr2(ACC.lineAmount(l))}</td>
      <td><input data-f="supplier" value="${esc(l.supplier)}" maxlength="120" aria-label="Supplier"></td>
      <td><input data-f="bill_no" value="${esc(l.bill_no)}" maxlength="60" aria-label="Bill no."></td>
      <td><input data-f="bill_date" type="date" value="${esc(l.bill_date)}" aria-label="Bill date"></td>
      <td><input data-f="note" value="${esc(l.note)}" maxlength="300" aria-label="Note" ${SPELL}></td>
      <td><button type="button" class="ib" data-acx-del title="Remove this line"><i class="i i-trash"></i></button></td></tr>`
      : `<tr data-i="${i}" data-g="${gi}"><td class="acx-nm">${esc(l.name)}</td><td class="num">${esc(acV(l.qty))}</td><td>${esc(l.unit)}</td><td class="num">${l.rate ? inr2(l.rate) : '<span class="mut">—</span>'}</td><td class="num">${l.gst}</td>
      <td class="num acx-amt">${inr2(ACC.lineAmount(l))}</td><td>${esc(l.supplier)}</td><td>${esc(l.bill_no)}</td><td>${l.bill_date ? fdt(l.bill_date) : ''}</td><td>${esc(l.note)}</td></tr>`;
  });
  if (!ACS.lines.length) body += `<tr><td colspan="${n}" class="mut">No cost lines yet.${w ? ' Use <b>Add material</b> or <b>Copy from another project</b>.' : ''}</td></tr>`;
  body += `<tr class="acx-auto"><td class="acx-nm">Incentive / commission <span class="pill acx-tag">auto</span></td><td colspan="4" class="mut">${comm ? 'from Finance › Incentive' : 'none in Finance › Incentive for this customer'}</td><td class="num">${inr2(comm)}</td><td colspan="${n - 6}"></td></tr>`;
  tb.innerHTML = `<colgroup>${cols.map(([wd]) => `<col${wd ? ` style="width:${wd}px"` : ''}>`).join('')}</colgroup>
    <thead><tr><th>Item</th><th class="num">Qty</th><th>Unit</th><th class="num">Rate</th><th class="num">GST %</th><th class="num">Amount</th><th>Supplier</th><th>Bill no.</th><th>Bill date</th><th>Note</th>${w ? '<th><span class="acx-sr">Remove</span></th>' : ''}</tr></thead><tbody>${body}</tbody>`;
  acGsum(); acFeeBar();
}
/* each group row: number of lines and their amount */
function acGsum() {
  const s = {};
  ACS.lines.forEach(l => { const k = l.grp; (s[k] = s[k] || [0, 0])[0]++; s[k][1] += ACC.lineAmount(l); });
  let gi = -1, g = null;
  const keys = []; ACS.lines.forEach(l => { if (gi < 0 || l.grp !== g) { g = l.grp; gi++; keys.push(g); } });
  $$('#acx_tb [data-acx-g]').forEach(el => { const v = s[keys[+el.dataset.acxG]]; if (v) el.textContent = `${acPl(v[0], 'line')} · ${inr2(ACC.r2(v[1]))}`; });
}
function acCsTiles() {
  const box = $('#acx_tiles'); if (!box || !ACS.d) return;
  const d = ACS.d, p = d.project || {}, comm = +(d.auto || {}).comm || 0;
  const P = ACC.profit({ price: p.cost, taxable: d.taxable, lines: ACS.lines, comm }), T = ACC.costTotals(ACS.lines);
  const t = (k, label, val, sub, cls) => `<div class="card acx-t ${cls || ''}" data-acx-t="${k}"><small>${label}</small><b>${val}</b><em>${sub}</em></div>`;
  box.innerHTML = t('before', 'Project price (before GST)', inr2(P.before), +d.taxable > 0 ? 'from the tax bill' : +p.cost ? `${inr2(p.cost)} ÷ ${ACC.GST_DIV}` : 'project price not set')
    + t('cost', 'Total cost (before GST)', inr2(P.cost), `${acPl(T.n, 'line')}${comm ? ` · + ${inr2(comm)} incentive` : ''}`)
    + t('profit', 'Profit', P.profit < 0 ? '−' + inr2(-P.profit) : inr2(P.profit), `${P.margin.toLocaleString('en-IN', { maximumFractionDigits: 2 })}% margin${comm ? ' · after incentive' : ''}`, P.profit < 0 ? 'acx-neg' : P.profit > 0 ? 'acx-pos' : '')
    + t('missing', 'Still to enter', T.missing ? acPl(T.missing, 'line') : 'None', T.missing ? 'no cost rate yet' : T.n ? 'every line has a rate' : 'no lines yet', T.missing ? 'acx-warn' : '');
}

/* KSEB fees recorded under Finance › Fees and not on the sheet yet: added as ordinary lines, the paid amount taken back to before GST */
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
        supplier: f.kind === 'stamp' ? '' : 'KSEB', note: ACC.FEE_NOTE }));
    });
    acChanged(); toast(`${acPl(miss.length, 'fee line')} added. Save to keep ${miss.length === 1 ? 'it' : 'them'}.`);
  };
}

async function acCsSave() {
  if (!ACS.w || ACS.busy || !$('#acx_cs')) return false;
  const bad = $('#acx_tb .acx-bad');
  if (bad) { toast('A quantity or rate is not a number (marked in red)', true); bad.focus(); return false; }
  ACS.busy = true;
  const btn = $('#acx_save'), tb = $('#acx_tb');
  if (btn) btn.disabled = true;
  $$('input,select,button', tb).forEach(x => { x.disabled = true; }); /* no typing into lines that the answer is about to replace */
  let ok = false;
  try {
    const r = await api('acc', 'cost_save', { project_id: ACS.pid, lines: ACS.lines.map(acOut) });
    ACS.d = r; ACS.lines = acSort((r.lines || []).map(acIn)); ACS.mats = null; /* new materials and rates are on the list now */
    ok = true;
  } catch (e) { /* api() has shown the reason */ }
  ACS.busy = false;
  if (btn && btn.isConnected) btn.disabled = false;
  if ($('#acx_cs')) { acCsTable(); acCsTiles(); }
  if (ok) { acDirty(false); toast('Cost sheet saved'); }
  return ok;
}

/* + Add material: pick from the Materials list (the window stays open to add several), or type a new one */
async function acCsAdd() {
  let mats; try { mats = await acMats(); } catch (e) { return; }
  const groups = acGroups(mats);
  const gOpts = sel => groups.map(g => `<option ${g === sel ? 'selected' : ''}>${esc(g)}</option>`).join('');
  const m = modal(`<div class="mh"><h3>Add material</h3><button type="button" class="ib" data-x title="Close"><i class="i i-x"></i></button></div>
    <div class="acx-pbar"><input id="acx_q" type="search" placeholder="Search the Materials list…" autocomplete="off" aria-label="Search materials"><select id="acx_qg" aria-label="Group"><option value="">All groups</option>${gOpts('')}</select></div>
    <div class="acx-pick" id="acx_pl"></div>
    <details class="acx-nw" id="acx_nw"><summary>New material (not on the list)</summary>
      <div class="two"><div><label for="acx_ng">Group</label><select id="acx_ng">${gOpts(ACC.GROUPS[0])}</select></div>
      <div class="acx-two"><div><label for="acx_nu">Unit</label><input id="acx_nu" list="acx_units" value="Nos" maxlength="20"></div><div><label for="acx_nt">GST %</label><select id="acx_nt">${ACX_GSTS.map(v => `<option value="${v}" ${v === 18 ? 'selected' : ''}>${v}%</option>`).join('')}</select></div></div>
      <div class="full"><label for="acx_nn">Name, make and size</label><input id="acx_nn" maxlength="200" autocomplete="off" ${SPELL}></div></div>
      <div class="bar acx-nwgo"><button type="button" class="btn" id="acx_nwa"><i class="i i-plus"></i> Add to the sheet</button><span class="mut acx-small">Saved to the Materials list when you save the cost sheet.</span></div></details>
    <div class="bar acx-mft"><span class="mut" id="acx_pn"></span><span class="sp"></span><button type="button" class="btn" data-x>Done</button></div>`, true);
  let added = 0, last = null;
  const count = () => { $('#acx_pn', m).textContent = added ? `${acPl(added, 'line')} added` : 'Click a material to add it.'; };
  const draw = () => {
    const q = $('#acx_q', m).value.trim().toLowerCase().split(/\s+/).filter(Boolean), g = $('#acx_qg', m).value;
    const L = mats.filter(x => !x.hidden && (!g || x.grp === g) && q.every(t => (x.name + ' ' + x.grp).toLowerCase().includes(t)));
    let h = '', cur = null;
    L.slice(0, 300).forEach(x => {
      if (x.grp !== cur) { cur = x.grp; h += `<div class="acx-pgh">${esc(cur || 'Other')}</div>`; }
      const on = ACS.lines.filter(l => l.material_id === x.id).length;
      h += `<button type="button" class="acx-pi" data-mid="${x.id}"><span>${esc(x.name)}</span><small>${esc(x.unit)} · GST ${+x.gst}%${+x.rate ? ' · last rate ' + inr2(x.rate) : ''}${on ? ` · <b>on the sheet${on > 1 ? ' ×' + on : ''}</b>` : ''}</small></button>`;
    });
    $('#acx_pl', m).innerHTML = h || '<p class="mut acx-pe">Nothing matches. Add it as a new material below.</p>';
    if (!L.length && q.length) { $('#acx_nw', m).open = true; if (!$('#acx_nn', m).value) $('#acx_nn', m).value = $('#acx_q', m).value.trim(); }
  };
  const add = line => { ACS.lines.push(line); last = line; added++; acChanged(); count(); };
  $('#acx_pl', m).onclick = e => { const b = e.target.closest('[data-mid]'), x = b && mats.find(y => y.id === +b.dataset.mid); if (!x) return; add(acFromMat(x)); draw(); };
  $('#acx_q', m).oninput = draw; $('#acx_qg', m).onchange = draw;
  $('#acx_q', m).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const b = $('#acx_pl [data-mid]', m); if (b) b.click(); } };
  $('#acx_nwa', m).onclick = () => {
    const grp = $('#acx_ng', m).value, name = $('#acx_nn', m).value.trim().replace(/\s+/g, ' '), unit = $('#acx_nu', m).value.trim() || 'Nos', gst = +$('#acx_nt', m).value;
    if (!name) { toast('Type the material name', true); $('#acx_nn', m).focus(); return; }
    const ex = mats.find(x => x.grp === grp && x.name.toLowerCase() === name.toLowerCase());
    if (ex) { add(acFromMat(ex)); toast(`“${ex.name}” is already on the Materials list, so that one was added`); }
    else add(acIn({ material_id: 0, grp, name, qty: 1, unit, rate: 0, gst }));
    $('#acx_nn', m).value = ''; draw();
  };
  $$('[data-x]', m).forEach(b => b.onclick = () => {
    m.remove();
    const i = ACS.lines.indexOf(last), q = i >= 0 && $(`#acx_tb tr[data-i="${i}"] input[data-f="qty"]`); /* the last line added, ready for its quantity */
    if (q) { q.scrollIntoView({ block: 'center' }); q.focus(); q.select(); }
  });
  count(); draw(); $('#acx_q', m).focus();
}

/* Copy from another project: a similar plant's items and quantities (rates when ticked); supplier, bill and note stay behind */
async function acCsCopy() {
  let cs; try { cs = await list('customers'); } catch (e) { return; }
  cs = cs.filter(c => +c.project_id && +c.project_id !== ACS.pid);
  const has = ACS.lines.length;
  const m = modal(`<div class="mh"><h3>Copy lines from another project</h3><button type="button" class="ib" data-x title="Close"><i class="i i-x"></i></button></div>
    <p class="mut acx-small acx-top0">Pick a similar plant. Its items and quantities are copied into this sheet; supplier, bill and note are not, nor its KSEB / stamp paper fee lines (this customer's fees come from Finance › Fees).</p>
    <input id="acx_cq" type="search" placeholder="Search customers by name, phone, consumer no., place…" autocomplete="off" aria-label="Search customers">
    <div class="acx-opts"><label class="acx-chk"><input type="checkbox" id="acx_cr"> Copy rates too</label>
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
    if (!(r.lines || []).length) { toast(`${c ? c.name : 'That project'} has no cost lines yet`, true); return; }
    const rates = $('#acx_cr', m).checked, mode = ($('input[name=acx_cm]:checked', m) || {}).value || 'add', who = c ? c.name : 'the other project';
    /* fee lines are the other customer's own fees: never copied, and this sheet's fee lines stay even on Replace (the fee offer
       keeps following this customer's Finance › Fees); on Add, lines already here are not added twice */
    const keep = mode === 'replace' ? ACS.lines.filter(l => ACC.isFee(l)) : ACS.lines, res = ACC.copyLines(r.lines, keep, rates), nl = res.lines.map(acIn);
    const out = [res.fees && `${acPl(res.fees, 'fee line')} (fees come from this customer's own Finance › Fees)`, res.dup && `${acPl(res.dup, 'line')} already on this sheet`].filter(Boolean).join(' and ');
    if (!nl.length) { toast(`Nothing to copy from ${who}${out ? ': ' + out + ' left out' : ''}.`, true); return; }
    ACS.lines = keep.concat(nl);
    m.remove(); acChanged();
    toast(`${acPl(nl.length, 'line')} copied from ${who}${rates ? ' with rates' : ''}${out ? '; ' + out + ' left out' : ''}. Save to keep them.`);
  };
  $$('[data-x]', m).forEach(b => b.onclick = () => m.remove());
  draw(); $('#acx_cq', m).focus();
}

/* ---- Materials list tab ---- */
const ACM = { q: '', f: 'all' };
async function acMaterials(box) {
  const w = canW('accounts');
  let mats = await acMats(true);
  acUnits();
  box.innerHTML = `<div class="bar acx-mbar"><input id="acx_mq" type="search" placeholder="Search materials…" value="${esc(ACM.q)}" autocomplete="off" aria-label="Search materials">
      <div class="tabs acx-mf">${[['all', 'All'], ['shown', 'In use'], ['hidden', 'Hidden']].map(([k, l]) => `<button type="button" data-acx-mf="${k}" class="${ACM.f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <span class="mut" id="acx_mn"></span><span class="sp"></span>${w ? '<button type="button" class="btn" id="acx_madd"><i class="i i-plus"></i> Add material</button>' : ''}</div>
    <div class="card tw"><table class="acx-mt" id="acx_mt" data-min="620"></table></div>
    <p class="acx-note">Cost sheets pick from this list. The rate is the last purchase rate before GST: saving a cost sheet with a rate updates it. Hidden materials stay here but are not offered on cost sheets. A deleted material goes to the Recycle bin; cost sheets that use it keep their lines.</p>`;
  const tb = $('#acx_mt', box);
  const draw = () => {
    const q = ACM.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const L = mats.filter(x => (ACM.f === 'all' || (ACM.f === 'hidden' ? x.hidden : !x.hidden)) && q.every(t => (x.name + ' ' + x.grp).toLowerCase().includes(t)));
    $('#acx_mn', box).textContent = acPl(L.length, 'material');
    let body = '', cur = null;
    L.forEach(x => {
      if (x.grp !== cur) { cur = x.grp; body += `<tr class="acx-grp"><td colspan="${w ? 5 : 4}"><b>${esc(cur || 'Other')}</b><span class="acx-gsum">${acPl(L.filter(y => y.grp === cur).length, 'material')}</span></td></tr>`; }
      body += `<tr class="${x.hidden ? 'acx-hid' : ''}" data-id="${x.id}"><td class="acx-nm">${esc(x.name)}${x.hidden ? ' <span class="pill acx-tag">Hidden</span>' : ''}</td><td>${esc(x.unit)}</td><td class="num">${+x.gst}</td><td class="num">${+x.rate ? inr2(x.rate) : '<span class="mut">—</span>'}</td>
        ${w ? `<td class="acx-act"><button type="button" class="ib" data-acx-m="edit" title="Edit"><i class="i i-pencil"></i></button><button type="button" class="ib" data-acx-m="hide" title="${x.hidden ? 'Show on cost sheets again' : 'Hide from cost sheets'}"><i class="i i-eye"></i></button><button type="button" class="ib" data-acx-m="del" title="Delete"><i class="i i-trash"></i></button></td>` : ''}</tr>`;
    });
    tb.innerHTML = `<colgroup><col><col style="width:80px"><col style="width:80px"><col style="width:150px">${w ? '<col style="width:120px">' : ''}</colgroup>
      <thead><tr><th>Material</th><th>Unit</th><th class="num">GST %</th><th class="num">Last rate (before GST)</th>${w ? '<th><span class="acx-sr">Actions</span></th>' : ''}</tr></thead>
      <tbody>${body || `<tr><td colspan="${w ? 5 : 4}" class="mut">${mats.length ? 'Nothing matches.' : 'The list is empty.'}</td></tr>`}</tbody>`;
  };
  const reload = async () => { mats = await acMats(true); draw(); };
  $('#acx_mq', box).oninput = e => { ACM.q = e.target.value; draw(); };
  $$('[data-acx-mf]', box).forEach(b => b.onclick = () => { ACM.f = b.dataset.acxMf; $$('[data-acx-mf]', box).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  if (w) {
    $('#acx_madd', box).onclick = () => acMatForm({ grp: ACC.GROUPS[0], unit: 'Nos', gst: 18 }, mats, reload);
    tb.onclick = async e => {
      const b = e.target.closest('[data-acx-m]'), tr = b && b.closest('tr[data-id]'), x = tr && mats.find(y => y.id === +tr.dataset.id);
      if (!x) return;
      const a = b.dataset.acxM;
      if (a === 'edit') return acMatForm(x, mats, reload);
      b.disabled = true;
      try {
        if (a === 'hide') { await api('acc', 'material_save', { id: x.id, grp: x.grp, name: x.name, unit: x.unit, gst: x.gst, rate: x.rate, hidden: x.hidden ? 0 : 1 }); toast(x.hidden ? `“${x.name}” is offered on cost sheets again` : `“${x.name}” hidden from cost sheets`); }
        if (a === 'del') {
          if (!confirm(`Delete “${x.name}” from the Materials list?\n\nIt goes to the Recycle bin. Cost sheets that use it keep their lines.`)) { b.disabled = false; return; }
          await api('acc', 'material_delete', { id: x.id }); toast('Material deleted. It is in the Recycle bin.');
        }
        await reload();
      } catch (er) { b.disabled = false; }
    };
  }
  draw();
}
ACCT_TABS.materials = acMaterials;

function acMatForm(x, mats, done) {
  const m = modal(`<div class="mh"><h3>${x.id ? 'Edit material' : 'Add material'}</h3><button type="button" class="ib" data-x title="Close"><i class="i i-x"></i></button></div>
    <div class="two"><div class="full"><label for="acx_fg">Group</label><select id="acx_fg">${acGroups(mats).map(g => `<option ${g === x.grp ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
    <div class="full"><label for="acx_fn">Name, make and size</label><input id="acx_fn" maxlength="200" value="${esc(x.name || '')}" autocomplete="off" ${SPELL}></div>
    <div><label for="acx_fu">Unit</label><input id="acx_fu" list="acx_units" maxlength="20" value="${esc(x.unit || 'Nos')}"></div>
    <div><label for="acx_ft">GST %</label><select id="acx_ft">${ACX_GSTS.map(v => `<option value="${v}" ${+(x.gst ?? 18) === v ? 'selected' : ''}>${v}%</option>`).join('')}</select></div>
    <div><label for="acx_fr">Last purchase rate, before GST (₹)</label><input id="acx_fr" inputmode="decimal" value="${acV(x.rate)}" placeholder="Not known yet"></div>
    <div class="acx-fh"><label class="acx-chk"><input type="checkbox" id="acx_fh" ${x.hidden ? 'checked' : ''}> Hidden (not offered on cost sheets)</label></div></div>
    <div class="bar acx-mft"><button type="button" class="btn" id="acx_fs">Save</button><button type="button" class="btn sec" data-x>Cancel</button></div>`);
  $$('[data-x]', m).forEach(b => b.onclick = () => m.remove());
  $('#acx_fs', m).onclick = async e => {
    const name = $('#acx_fn', m).value.trim().replace(/\s+/g, ' '), rate = acNum($('#acx_fr', m).value);
    if (!name) { toast('Type the material name', true); $('#acx_fn', m).focus(); return; }
    if (rate === null) { toast('The rate is not a number', true); $('#acx_fr', m).focus(); return; }
    const b = e.currentTarget; b.disabled = true;
    try {
      await api('acc', 'material_save', { id: x.id || 0, grp: $('#acx_fg', m).value, name, unit: $('#acx_fu', m).value.trim() || 'Nos', gst: +$('#acx_ft', m).value, rate, hidden: $('#acx_fh', m).checked ? 1 : 0 });
    } catch (er) { b.disabled = false; return; } /* e.g. already on the list (shown by api()) */
    m.remove(); toast(x.id ? 'Material saved' : `“${name}” added to the Materials list`);
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

/* d = an ac_cost answer with the lines to print (the cost sheet as it is on screen) */
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

/* leaving a cost sheet with unsaved changes (another page, the browser's back, closing the tab); Ctrl+S saves */
(() => {
  const prev = window.onhashchange;
  const on = () => ACS.dirty && !!document.getElementById('acx_cs');
  window.onhashchange = e => {
    if (on() && location.hash !== ACS.hash) {
      if (!confirm('This cost sheet has changes that are not saved.\n\nLeave without saving?')) { history.replaceState(null, '', ACS.hash); return; }
      ACS.dirty = false;
    }
    return prev ? prev.call(window, e) : undefined;
  };
  addEventListener('beforeunload', e => { if (on()) { e.preventDefault(); e.returnValue = ''; } });
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key || '').toLowerCase() === 's' && document.getElementById('acx_cs') && ACS.w) { e.preventDefault(); acCsSave(); } });
})();
