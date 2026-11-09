// Recycle bin: deleted items stay 72 hours and can be restored; then they are removed for good.
let RB = { q: '', kind: '' };
async function pgRecycle() {
  const d = await api('trash', 'list'), adm = ME.role === 'admin', w = canW('recycle');
  const now = new Date(d.now.replace(' ', 'T') + 'Z').getTime(), skew = Date.now() - now;
  const leftMs = t => new Date(t.deleted_at.replace(' ', 'T') + 'Z').getTime() + d.hours * 36e5 - (Date.now() - skew);
  const fmtLeft = ms => { if (ms <= 0) return 'removing…'; const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4); return h >= 1 ? `${h} h ${m} min left` : `${m} min left`; };
  const kinds = [...new Set(d.rows.map(r => r.kind))].sort();
  $('#main').innerHTML = `<div class="bar" style="align-items:flex-start;margin-bottom:10px"><div><h2 style="margin:0;font-size:26px">Recycle bin</h2><div class="mut" id="rbc"></div></div><span class="sp"></span>
     ${adm && d.rows.length ? '<button class="btn bad" id="rbempty"><i class="i i-trash"></i> Empty bin</button>' : ''}</div>
   <div class="rbh"><i class="i i-alert"></i><div>Deleted items stay here for <b>${d.hours} hours</b> and can be restored — after that they are removed for good.
     Uploaded documents are kept for <b>${d.doc_days} days</b>, then they move here automatically.</div></div>
   <div class="bar" style="margin-bottom:10px"><input id="rbq" placeholder="Search deleted items…" style="max-width:320px" value="${esc(RB.q)}">
     <select id="rbk" style="width:auto"><option value="">All types</option>${kinds.map(k => `<option ${RB.kind === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
   <div class="card tw fitbox" style="padding:0"><table id="rbt" data-min="760"></table></div>`;
  const draw = () => {
    const t = RB.q.toLowerCase(), rows = d.rows.filter(r => (!RB.kind || r.kind === RB.kind) && (!t || (r.kind + ' ' + r.label + ' ' + r.deleted_by).toLowerCase().includes(t)));
    $('#rbc').textContent = `${rows.length} item${rows.length === 1 ? '' : 's'}`;
    $('#rbt').innerHTML = `<colgroup><col style="width:150px"><col><col style="width:150px"><col style="width:150px"><col style="width:150px"><col style="width:${adm ? 200 : 120}px"></colgroup>
     <thead><tr><th>Type</th><th>Item</th><th>Deleted by</th><th>Deleted</th><th>Removed in</th><th class="right">Actions</th></tr></thead><tbody>
     ${rows.map(r => { const ms = leftMs(r), pct = Math.max(0, Math.min(100, ms / (d.hours * 36e5) * 100));
       return `<tr><td class="rbk">${esc(r.kind)}</td><td class="rbl" title="${esc(r.label)}"><b>${esc(r.label)}</b>${r.count > 1 || r.files ? `<br><small class="mut">${r.count} record${r.count === 1 ? '' : 's'}${r.files ? ` · ${r.files} file${r.files === 1 ? '' : 's'}` : ''}</small>` : ''}</td>
        <td>${esc(r.deleted_by || '')}</td><td class="mut">${new Date(r.deleted_at.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
        <td><span class="rbleft ${ms < 6 * 36e5 ? 'soon' : ''}">${fmtLeft(ms)}</span><div class="rbbar"><i style="width:${pct}%"></i></div></td>
        <td class="right">${w ? `<button class="btn sm" data-rs="${r.id}"><i class="i i-undo"></i> Restore</button>` : ''}${adm ? ` <button class="ib" data-pg="${r.id}" title="Delete forever"><i class="i i-trash"></i></button>` : ''}</td></tr>`; }).join('')
      || `<tr><td colspan="6" class="mut" style="text-align:center;padding:30px">${d.rows.length ? 'Nothing matches' : 'The recycle bin is empty.'}</td></tr>`}</tbody>`;
    $$('[data-rs]').forEach(b => b.onclick = async () => { const r = d.rows.find(x => x.id == b.dataset.rs); b.disabled = true;
      try { await api('trash', 'restore', { id: r.id }); toast(`Restored: ${r.kind} — ${r.label}`); pgRecycle(); } catch (e) { b.disabled = false; } });
    $$('[data-pg]').forEach(b => b.onclick = async () => { const r = d.rows.find(x => x.id == b.dataset.pg);
      if (!confirm(`Delete "${r.label}" for good?\n\nThis cannot be undone.`)) return; await api('trash', 'purge', { id: r.id }); toast('Deleted for good'); pgRecycle(); });
  };
  $('#rbq').oninput = e => { RB.q = e.target.value; draw(); };
  $('#rbk').onchange = e => { RB.kind = e.target.value; draw(); };
  if ($('#rbempty')) $('#rbempty').onclick = async () => { if (!confirm(`Empty the recycle bin?\n\nAll ${d.rows.length} item(s) will be deleted for good. This cannot be undone.`)) return; await api('trash', 'purge', { all: 1 }); toast('Recycle bin emptied'); pgRecycle(); };
  draw();
}
