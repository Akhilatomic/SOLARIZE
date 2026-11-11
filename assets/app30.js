/* Customers → Import (admin): load a prepared customer file (.json), preview what happens to each record, then import.
   New customers get a project at "Project completed" and their plant details; customers already here only get their EMPTY details filled. */
function custImport(done) {
  const m = modal(`<h2 style="margin-top:0">Import customers</h2>
    <p class="mut" style="margin:0 0 10px">Choose the import file (.json). You see what will happen first — nothing changes until you press Import.
    Customers already here (same consumer no. or MNRE application no.) only get their empty details filled; nothing is overwritten.</p>
    <input type="file" id="imf" accept=".json,application/json"><div id="imv" style="margin-top:12px"></div>
    <div class="bar" style="margin-top:12px"><button class="btn" id="imgo" disabled><i class="i i-upload"></i> Import</button><button class="btn sec" id="imx">Cancel</button></div>`, true);
  let file = null;
  const FIELD = { phone: 'phone', alt_phone: 'alt. phone', email: 'email', address: 'address', district: 'district', pincode: 'PIN', consumer_no: 'consumer no.', kseb_section: 'section',
    kseb_subdivision: 'sub division', kseb_division: 'division', kseb_circle: 'circle', tariff: 'tariff', phase: 'phase', sanctioned_load: 'load', meter_no: 'meter no.', pole_no: 'pole no.',
    transformer: 'transformer', jansamarth_id: 'Jan Samarth ID', loan_bank: 'loan bank', loan_amount: 'loan amount', loan_sanctioned_on: 'loan date', notes: 'notes' };
  const what = r => r.action === 'new' ? '<span class="pill g">New customer</span>'
    : r.action === 'skip' ? `<span class="pill r">Skipped</span> <small class="mut">${esc(r.problems.join('; '))}</small>`
    : `<span class="pill b">Already here</span> <small class="mut">${esc(r.match)}${r.match_name && r.match_name !== r.name ? ' · “' + esc(r.match_name) + '”' : ''}${r.fill.length ? ' · fills ' + esc(r.fill.map(k => FIELD[k] || k).join(', ')) : ' · nothing to fill'}</small>`;
  const proj = r => r.action === 'skip' ? '' : r.project === 'create' ? 'New · Project completed' : r.project === 'fill' ? 'Fills empty details' + (r.project_stage ? ` (stays at ${esc(r.project_stage)})` : '') : 'No change';
  const show = (res, ran) => {
    const c = res.counts;
    $('#imv', m).innerHTML = `<div class="bar" style="gap:8px;margin-bottom:8px"><b>${ran ? 'Imported' : 'Preview'}:</b> <span class="pill g">${c.new} new</span><span class="pill b">${c.update} already here</span>${c.skip ? `<span class="pill r">${c.skip} skipped</span>` : ''}</div>
      <div class="tw" style="max-height:52vh;overflow:auto;border:1px solid var(--bd);border-radius:12px"><table><thead><tr><th>#</th><th>Name</th><th>Consumer no.</th><th>What happens</th><th>Project</th></tr></thead><tbody>
      ${res.rows.map((r, i) => `<tr><td class="mut">${i + 1}</td><td><b>${esc(r.name)}</b><br><small class="mut">${esc(r.ref)}</small></td><td class="mono">${esc(r.consumer_no) || '—'}</td><td>${what(r)}</td><td><small>${proj(r)}${r.plant ? '<br>Plant: ' + esc(r.plant) : ''}</small></td></tr>`).join('')}
      </tbody></table></div>`;
  };
  $('#imx', m).onclick = () => m.remove();
  $('#imf', m).onchange = async e => {
    const f = e.target.files[0]; file = null; $('#imgo', m).disabled = true; $('#imv', m).innerHTML = '';
    if (!f) return;
    try { file = JSON.parse(await f.text()); } catch (err) { toast('That file is not a valid import file', 1); return; }
    $('#imv', m).innerHTML = '<p class="mut">Checking…</p>';
    try { show(await api('import', 'preview', file)); $('#imgo', m).disabled = false; } catch (err) { file = null; $('#imv', m).innerHTML = ''; }
  };
  $('#imgo', m).onclick = async () => {
    if (!file || !confirm('Import these customers now?')) return;
    $('#imgo', m).disabled = true;
    try { const res = await api('import', 'run', file); show(res, true); toast(`${res.counts.new} customers added · ${res.counts.update} updated`); $('#imgo', m).remove(); $('#imx', m).textContent = 'Close'; $('#imx', m).onclick = () => { m.remove(); done && done(); }; }
    catch (err) { $('#imgo', m).disabled = false; }
  };
}
