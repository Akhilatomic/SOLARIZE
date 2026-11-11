/* Profile pages: one page per set of source papers, view and edit. Uses PFP (app28.js) for what is empty and what changed. */
function pfCtx(st) {
  return { c: st.c, p: st.p, j: st.j, prog: st.prog, pipe: st.pipe, can: perm => perm === 'loans' ? canR('loans') : perm === 'fin' ? FIN() : true };
}
function pfNeed(f, ctx) {
  if (PFP.value(f, ctx) || !PFP.docsFor(f, ctx).length || f.opt) return '';
  if (PFP.later(f, ctx)) return '<small class="pp-later">needed later</small>';
  const names = PFP.docsFor(f, ctx).map(d => (KD.DOCS[d] && KD.DOCS[d].tab) || d);
  const shown = names.length > 2 ? names.slice(0, 2).join(', ') + ' +' + (names.length - 2) + ' more' : names.join(', ');
  return '<small class="pp-need" title="' + esc(names.join(', ')) + '">empty · needed by ' + esc(shown) + '</small>';
}
function pfShown(f, st) {
  if (f.perm === 'loans') return canR('loans');
  if (f.perm === 'fin') return FIN() && !!st.j;
  return true;
}
function pfCanEdit(f) { return f.perm === 'loans' ? canW('loans') : f.perm === 'fin' ? FIN() && canW('projects') : canW('customers'); }
function pfMasked(v) { return String(v == null ? '' : v).indexOf('•') >= 0; }
function pfInput(f, v) {
  const masked = pfMasked(v), val = masked ? '' : v, ph = masked ? ` placeholder="${esc(v + ' — type to replace')}"` : '', k = `data-k="${esc(f.k)}"${masked ? ' data-masked="1"' : ''}`;
  if (f.t === 'area') return `<textarea ${k} rows="3"${ph}>${esc(val)}</textarea>`;
  let opts = f.opts;
  if (f.k === 'lead_type') opts = LT_OPTS;
  if (f.t === 'opts' && opts) {
    const list = !val || opts.some(o => o[0] === val) ? opts : opts.concat([[val, val]]);
    return `<select ${k}>${list.map(o => `<option value="${esc(o[0])}"${o[0] === val ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
  }
  const t = f.t === 'date' ? 'date' : 'text', im = f.t === 'num' ? ' inputmode="decimal"' : '';
  return `<input type="${t}"${im} ${k} value="${esc(val)}"${ph} autocomplete="off">`;
}
function pfCopy(v, l) {
  return `<button class="pfv" data-cp="${esc(v)}" data-l="${esc(l)}" title="Click to copy">${esc(v)}<i class="i i-copy"></i></button>`;
}
function pfRow(f, ctx, edit) {
  const v = PFP.value(f, ctx), need = pfNeed(f, ctx);
  if (f.k === 'gps') {
    return `<div class="pfr pp-row"><span>${esc(f.l)}</span><div class="pp-val">${v ? pfCopy(v, f.l) : '<em class="mut">—</em>'}${need}${canW('customers') ? `<button class="btn sec sm" data-loc="1"><i class="i i-target"></i> ${v ? 'Change' : 'Set'} location</button>` : ''}</div></div>`;
  }
  if (f.ro) return '';
  const readOnly = !pfCanEdit(f) || (f.k === 'lead_type' && !isAdm());
  let body;
  if (edit && !readOnly) body = pfInput(f, v) + need;
  else if (f.k === 'lead_type' && v) body = esc((LT_OPTS.find(o => o[0] === v) || [0, v])[1]);
  else if (v && !pfMasked(v)) body = pfCopy(v, f.l);
  else if (v) body = esc(v);
  else body = '<em class="mut">—</em>' + need;
  if (f.hi) return `<div class="pp-hi"><label>${esc(f.l)}</label><div class="pp-val">${body}</div></div>`;
  return `<div class="pfr pp-row"><span>${esc(f.l)}</span><div class="pp-val">${body}</div></div>`;
}
function renderPfPage(box, st, key, edit, onSaved) {
  const pg = PFP.PAGES.find(p => p.key === key);
  if (!pg) { box.innerHTML = ''; return; }
  const ctx = pfCtx(st);
  const w = canW('customers') || (canW('loans') && pg.sections.some(sec => sec.fields.some(f => f.perm === 'loans' && pfShown(f, st))));
  const secs = pg.sections.map(sec => {
    const fields = sec.fields.filter(f => pfShown(f, st));
    if (!fields.length) return '';
    const hi = fields.filter(f => f.hi), rest = fields.filter(f => !f.hi);
    return `<div class="card pfc pp-sec"><div class="pfch"><i class="i i-${esc(pg.icon)}"></i><h3>${esc(sec.paper)}</h3></div>
      <div class="pp-hand mut">Keep the ${esc(sec.paper)} in hand</div>
      ${hi.map(f => pfRow(f, ctx, edit)).join('')}
      <div class="pp-grid">${rest.map(f => pfRow(f, ctx, edit)).join('')}</div></div>`;
  }).join('');
  /* read-only: references already recorded in the pipeline (not typed twice) */
  const refs = key === 'reg' && st.refs && st.refs.length ? `<div class="card pfc"><div class="pfch"><i class="i i-${esc(pg.icon)}"></i><h3>Recorded in the pipeline</h3></div>${st.refs.map(r => {
    const t = [r.ref ? 'Ref ' + r.ref : '', r.date, r.amount ? inr(r.amount) : ''].filter(Boolean).join(' · ');
    return `<div class="pfr"><span>${esc(r.stage)}</span>${t ? pfCopy(t, r.stage) : '<em class="mut">—</em>'}</div>`; }).join('')}</div>` : '';
  box.innerHTML = `<div class="pp">
    <div class="pp-head"><h2>${esc(pg.tab)}</h2><span class="sp"></span>${w ? (edit ? '<button class="btn sec" id="ppx">Cancel</button><button class="btn" id="pps">Save</button>' : '<button class="btn" id="ppe"><i class="i i-pencil"></i> Edit this page</button>') : ''}</div>
    ${secs}${refs}</div>`;
  bindCopy(box);
  const lb = $('[data-loc]', box);
  if (lb) lb.onclick = () => locModal(st.c, st.id);
  const eb = $('#ppe', box); if (eb) eb.onclick = () => renderPfPage(box, st, key, true, onSaved);
  const xb = $('#ppx', box); if (xb) xb.onclick = () => renderPfPage(box, st, key, false, onSaved);
  const sb = $('#pps', box);
  if (sb) sb.onclick = async () => {
    const form = {};
    $$('[data-k]', box).forEach(el => { if (el.dataset.masked && !el.value.trim()) return; form[el.dataset.k] = el.value; });
    const data = PFP.diff(key, ctx, form);
    if (!Object.keys(data).length) { toast('No changes'); return; }
    sb.disabled = true;
    try {
      const r = await api('profile', 'page_save', { customer_id: st.id, page: key, data });
      st.c = Object.assign({}, st.c, r.customer);
      if (r.plant) st.p = r.plant;
      if (r.project) st.j = r.project;
      toast('Saved');
      renderPfPage(box, st, key, false, onSaved);
      if (onSaved) onSaved(st);
    } catch (e) { sb.disabled = false; }
  };
}
