// Lead edit: Site condition (survey) and Plant details (proposed system) tabs. Copied to the customer's Plant details on conversion.
const LS_OPTS = {
  roof_type: ['RCC flat', 'RCC sloped', 'Sheet / tin', 'Tile', 'Ground'], orientation: ['South facing', 'East–West', 'East facing', 'West facing', 'North facing', 'Flat (no tilt)'],
  shading: ['No shade', 'Partial — morning', 'Partial — evening', 'Partial — midday', 'Heavy shade'], phase: ['Single phase', 'Three phase'], earthing: ['Available', 'Needs new earthing', 'Not checked'],
  access: ['Staircase', 'Ladder only', 'Difficult access'], water: ['Water point on roof', 'Water nearby', 'No water'], structure_suggest: ['Hot Dip Galvanized', 'GI elevated', 'Flush mount', 'Shed / sheet mount', 'Ground mount'],
  system_type: ['On-grid', 'Off-grid', 'Hybrid'], panel_type: ['Mono PERC', 'TOPCon', 'Bifacial', 'HJT', 'Polycrystalline'], inverter_type: ['Single phase', 'Three phase', 'Hybrid', 'Micro inverter', 'Optimizer (SolarEdge)'],
  structure_type: ['Hot Dip Galvanized', 'GI elevated', 'Aluminium', 'Shed / sheet mount', 'Ground mount'],
};
const LS_SITE = [
  ['Survey', [['visit_date', 'Site visit date', 'date'], ['surveyed_by', 'Surveyed by']]],
  ['Roof', [['roof_type', 'Roof type'], ['roof_area', 'Total roof area (sq ft)', 'n'], ['free_area', 'Shade-free area (sq ft)', 'n'], ['orientation', 'Orientation'], ['shading', 'Shading'], ['shade_objects', 'Shade from (trees, tank…)'],
    ['rooftop_age', 'Roof age (years)', 'n'], ['building_height', 'Building height (m)', 'n'], ['floors', 'Number of floors', 'n'], ['slab_thickness', 'Slab thickness (mm)', 'n'], ['slab_slope', 'Slope of slab (degrees)', 'n']]],
  ['Electrical & access', [['phase', 'Connection'], ['sanctioned_load', 'Sanctioned load (kW)', 'n'], ['monthly_bill', 'Average monthly bill (₹)', 'n'], ['monthly_units', 'Average monthly units', 'n'],
    ['meter_location', 'Meter location'], ['cable_distance', 'Inverter → meter distance (m)', 'n'], ['earthing', 'Earthing'], ['access', 'Roof access'], ['water', 'Water for cleaning'], ['structure_suggest', 'Suggested structure']]],
];
const LS_PLANT = [
  ['System', [['system_type', 'System type'], ['capacity', 'Proposed capacity (kWp)', 'n'], ['structure_type', 'Structure type']]],
  ['Panels', [['panel_make', 'Panel make'], ['panel_type', 'Panel type'], ['panel_wattage', 'Panel wattage (W)', 'n'], ['panel_count', 'Number of panels', 'n']]],
  ['Inverter', [['inverter_make', 'Inverter make'], ['inverter_type', 'Inverter type'], ['inverter_capacity', 'Inverter capacity (kW)', 'n'], ['inverter_count', 'Number of inverters', 'n']]],
];
const ljson = v => { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(v) || {}; } catch (e) { return {}; } };
const lsField = (attr, d) => ([k, l, t]) => `<div><label>${l}</label><input ${attr}="${k}" ${t === 'n' ? 'inputmode="decimal"' : ''} ${t === 'date' ? 'type="date"' : ''} value="${esc(d[k] || '')}" ${LS_OPTS[k] ? `list="ls-${k}"` : ''}></div>`;
function leadTabs(l) {
  const s = ljson(l.site), p = ljson(l.plant), ns = Object.keys(s).length, np = Object.keys(p).length;
  const S2 = ljson(l.site), P2 = ljson(l.plant);
  return `${Object.entries(LS_OPTS).map(([k, o]) => `<datalist id="ls-${k}">${o.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`).join('')}
   <div class="tabs ltabs"><button data-lt="d" class="on"><i class="i i-user"></i> Details</button><button data-lt="s"><i class="i i-target"></i> Site condition${ns ? ` <span class="pill g">${ns}</span>` : ''}</button><button data-lt="p"><i class="i i-sun"></i> Plant details${np ? ` <span class="pill g">${np}</span>` : ''}</button></div>`;
}
function leadSitePane(l) {
  const d = ljson(l.site);
  return `<div class="ltp" data-lp="s" hidden><div class="lshint" id="lsh"></div>
    ${LS_SITE.map(([t, fs]) => `<div class="lsg"><div class="lsgh">${t}</div><div class="two">${fs.map(lsField('data-ls', d)).join('')}</div></div>`).join('')}
    <div class="lsg"><div class="lsgh">Remarks</div><textarea data-ls="site_remarks" rows="3" placeholder="Anything the installation team should know — roof damage, neighbour shade, ladder needed…">${esc(d.site_remarks || '')}</textarea></div></div>`;
}
function leadPlantPane(l) {
  const d = ljson(l.plant);
  return `<div class="ltp" data-lp="p" hidden><div class="lpsum" id="lps"></div>
    ${LS_PLANT.map(([t, fs]) => `<div class="lsg"><div class="lsgh">${t}${t === 'Panels' ? '<button class="btn sec sm" id="lpcalc" type="button">Calculate number of panels</button>' : ''}</div><div class="two">${fs.map(lsField('data-lpk', d)).join('')}</div></div>`).join('')}
    <div class="lsg"><div class="lsgh">Remarks</div><textarea data-lpk="plant_remarks" rows="2" placeholder="Options discussed, upgrades, battery later…">${esc(d.plant_remarks || '')}</textarea></div>
    <p class="mut" style="font-size:12px;margin:6px 0 0">When this lead is converted, the site condition and plant details are copied to the customer’s <b>Plant details</b> tab.</p></div>`;
}
function leadExtra(m) {
  const site = {}, plant = {};
  $$('[data-ls]', m).forEach(e => { if (e.value.trim()) site[e.dataset.ls] = e.value.trim(); });
  $$('[data-lpk]', m).forEach(e => { if (e.value.trim()) plant[e.dataset.lpk] = e.value.trim(); });
  return { site, plant };
}
function bindLeadTabs(m, l, w) {
  $$('[data-lt]', m).forEach(b => b.onclick = () => { $$('[data-lt]', m).forEach(x => x.classList.toggle('on', x === b));
    $$('[data-lp]', m).forEach(p => p.hidden = p.dataset.lp !== b.dataset.lt); $$('.ltp-d', m).forEach(p => p.hidden = b.dataset.lt !== 'd'); const sc = $('.lmb', m); if (sc) sc.scrollTop = 0; });
  if (!w) $$('[data-ls],[data-lpk]', m).forEach(e => e.disabled = true);
  const g = k => { const e = $(`[data-ls="${k}"]`, m) || $(`[data-lpk="${k}"]`, m); return e ? +e.value || 0 : 0; };
  const setp = (k, v) => { const e = $(`[data-lpk="${k}"]`, m); if (e && w) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } };
  const r = (S.subsidy_rates || { per_kw_first2: 30000, third_kw: 18000, cap: 78000 });
  const subsidy = kw => Math.min(r.cap, Math.min(kw, 2) * r.per_kw_first2 + Math.max(0, Math.min(kw, 3) - 2) * r.third_kw);
  const hint = () => { // site → suggested size
    const units = g('monthly_units'), area = g('free_area'), load = g('sanctioned_load'), out = [];
    const byUnits = units ? Math.round(units / 120 * 2) / 2 : 0, byArea = area ? Math.floor(area / 100 * 2) / 2 : 0;
    if (byUnits) out.push(`<b>${byUnits} kW</b> covers ${units} units / month`);
    if (byArea) out.push(`roof fits up to <b>${byArea} kW</b>`);
    if (load && byUnits > load) out.push(`<span class="dexp">above the ${load} kW sanctioned load — may need a load increase</span>`);
    const sug = byUnits && byArea ? Math.min(byUnits, byArea) : byUnits || byArea;
    $('#lsh', m).innerHTML = out.length ? `<i class="i i-sun"></i><div>Suggested system: ${out.join(' · ')}${sug && w ? ` <button class="btn sm" id="lsuse" type="button">Use ${sug} kW</button>` : ''}</div>` : '<i class="i i-sun"></i><div class="mut">Enter the monthly units and the shade-free roof area to get a suggested system size.</div>';
    if ($('#lsuse', m)) $('#lsuse', m).onclick = () => { setp('capacity', sug); if (!$('[data-lpk="system_type"]', m).value) setp('system_type', 'On-grid'); toast(`Proposed capacity set to ${sug} kW — see Plant details`); };
  };
  const sum = () => { // plant → generation, subsidy
    const kw = g('capacity'), wp = g('panel_wattage'), n = g('panel_count'), pkw = wp && n ? wp * n / 1000 : 0;
    $('#lps', m).innerHTML = kw || pkw ? `<div><small>Capacity</small><b>${kw || pkw} kWp</b>${pkw && kw && Math.abs(pkw - kw) > .05 ? `<em class="dexp">panels add up to ${pkw.toFixed(2)} kWp</em>` : ''}</div>
      <div><small>Expected generation</small><b>~${Math.round((kw || pkw) * 120)} units</b><em>per month</em></div>
      <div><small>PM Surya Ghar subsidy (est.)</small><b>${inr(subsidy(kw || pkw))}</b><em>residential on-grid</em></div>` : '<div class="mut" style="grid-column:1/-1">Enter the proposed capacity to see generation and subsidy estimates.</div>';
  };
  m.addEventListener('input', e => { if (e.target.matches('[data-ls]')) hint(); if (e.target.matches('[data-lpk]')) sum(); });
  if ($('#lpcalc', m)) $('#lpcalc', m).onclick = () => { const kw = g('capacity'), wp = g('panel_wattage'); if (!kw || !wp) return toast('Enter the capacity and panel wattage first', true); setp('panel_count', Math.ceil(kw * 1000 / wp)); };
  hint(); sum();
}
