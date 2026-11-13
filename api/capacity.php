<?php
// Plant capacity is held ONCE per customer: customers.plant_kw (kW).
// It can be typed in several places (lead, project, Start a project, Plant details, Registration page, a read document);
// whichever is used, the value lands here and every screen shows this one figure:
//   customers list · project (system size) · Plant details · KSEB and bank papers · incentive.
// A customer with several projects: the capacity is the total of their projects.

function cap_num($v) { return preg_match('/\d+(?:\.\d+)?/', str_replace(',', '', (string)$v), $m) ? round((float)$m[0], 3) : 0.0; }
function cap_txt($kw) { return rtrim(rtrim(number_format((float)$kw, 3, '.', ''), '0'), '.'); }
function cap_get($cid) { return (float)(row('SELECT plant_kw FROM customers WHERE id=?', [(int)$cid])['plant_kw'] ?? 0); }

// a capacity was typed: store it and bring the customer's project in line. $pid = the project it was typed on (0 = not on a project).
function cap_set($cid, $kw, $pid = 0) {
  $cid = (int)$cid; $kw = cap_num($kw); if ($cid <= 0 || $kw <= 0) return;
  $ps = rows('SELECT id FROM projects WHERE customer_id=? ORDER BY id', [$cid]);
  if ($pid) q('UPDATE projects SET kw=? WHERE id=? AND customer_id=?', [$kw, (int)$pid, $cid]);
  elseif (count($ps) === 1) q('UPDATE projects SET kw=? WHERE id=?', [$kw, $ps[0]['id']]);
  if ($pid && count($ps) > 1) $kw = (float)row('SELECT COALESCE(SUM(kw),0) s FROM projects WHERE customer_id=?', [$cid])['s'];
  q('UPDATE customers SET plant_kw=? WHERE id=?', [$kw, $cid]);
}
// only when nothing is known yet (a lead's interest, an applied / approved capacity read from a paper)
function cap_fill($cid, $kw) { if (cap_num($kw) > 0 && cap_get($cid) <= 0) cap_set($cid, $kw); }

// Plant details / Registration page / papers were saved with these plant keys
function cap_from_plant($cid, array $kv) {
  if (array_key_exists('capacity', $kv) && cap_num($kv['capacity']) > 0) cap_set($cid, $kv['capacity']);
  foreach (['approved_kw', 'applied_kw'] as $k) if (array_key_exists($k, $kv)) cap_fill($cid, $kv[$k]);
  /* panel and inverter make: the same on the customer's project (when they have one project) */
  $ps = rows('SELECT id FROM projects WHERE customer_id=?', [(int)$cid]);
  if (count($ps) === 1) foreach (['panel_make' => 'panel', 'inverter_make' => 'inverter'] as $k => $col)
    if (array_key_exists($k, $kv) && trim((string)$kv[$k]) !== '') q("UPDATE projects SET $col=? WHERE id=?", [mb_substr(trim((string)$kv[$k]), 0, 120), $ps[0]['id']]);
}
// a project was added or saved
function cap_from_project($pid) {
  $p = row('SELECT id, customer_id, kw, panel, inverter FROM projects WHERE id=?', [(int)$pid]); if (!$p || !$p['customer_id']) return;
  /* panels / inverter typed on the customer's only project: Plant details shows the same make */
  if ((int)row('SELECT COUNT(*) c FROM projects WHERE customer_id=?', [$p['customer_id']])['c'] === 1) {
    $d = json_decode((string)(row('SELECT data FROM plant WHERE customer_id=?', [$p['customer_id']])['data'] ?? ''), true) ?: []; $ch = false;
    foreach (['panel' => 'panel_make', 'inverter' => 'inverter_make'] as $col => $k) { $x = mb_substr(trim((string)$p[$col]), 0, 120); if ($x !== '' && $x !== (string)($d[$k] ?? '')) { $d[$k] = $x; $ch = true; } }
    if ($ch) { $d['panels'] = $d['panels'] ?? []; $d['inverters'] = $d['inverters'] ?? [];
      q('INSERT INTO plant(customer_id,data,updated,updated_by) VALUES(?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(customer_id) DO UPDATE SET data=excluded.data, updated=excluded.updated, updated_by=excluded.updated_by', [$p['customer_id'], json_encode($d, JSON_UNESCAPED_UNICODE), $_SESSION['name'] ?? '']); }
  }
  if ((float)$p['kw'] > 0) { cap_set($p['customer_id'], $p['kw'], $p['id']); return; }
  $kw = cap_get($p['customer_id']); /* no size typed: the capacity already known for this customer */
  if ($kw > 0 && (int)row('SELECT COUNT(*) c FROM projects WHERE customer_id=?', [$p['customer_id']])['c'] === 1) q('UPDATE projects SET kw=? WHERE id=?', [$kw, $p['id']]);
}
// Nothing stored yet: take it from what was entered elsewhere (projects, plant details, approved / applied capacity, the lead). Used after
// a lead becomes a customer, after an import, and once for every customer that existed before this rule.
function cap_reconcile($cid) {
  $cid = (int)$cid; if ($cid <= 0) return 0.0;
  $kw = cap_get($cid);
  if ($kw <= 0) {
    $kw = (float)row('SELECT COALESCE(SUM(kw),0) s FROM projects WHERE customer_id=?', [$cid])['s'];
    if ($kw <= 0) { $d = json_decode((string)(row('SELECT data FROM plant WHERE customer_id=?', [$cid])['data'] ?? ''), true) ?: [];
      foreach (['capacity', 'approved_kw', 'applied_kw'] as $k) if ($kw <= 0) $kw = cap_num($d[$k] ?? ''); }
    if ($kw <= 0) { $l = row('SELECT kw, plant FROM leads WHERE customer_id=? ORDER BY id DESC LIMIT 1', [$cid]);
      if ($l) { $kw = cap_num((json_decode((string)($l['plant'] ?? ''), true) ?: [])['capacity'] ?? ''); if ($kw <= 0) $kw = (float)$l['kw']; } }
    if ($kw <= 0) return 0.0;
    q('UPDATE customers SET plant_kw=? WHERE id=?', [$kw, $cid]);
  }
  /* the customer's only project has no size: it is this capacity */
  $ps = rows('SELECT id, kw FROM projects WHERE customer_id=?', [$cid]);
  if (count($ps) === 1 && (float)$ps[0]['kw'] <= 0) q('UPDATE projects SET kw=? WHERE id=?', [$kw, $ps[0]['id']]);
  return $kw;
}
// A lead has two boxes for the same thing (Interested kW and Proposed capacity): they always agree. Returns [kw, plant JSON].
function cap_lead_sync($kw, $plantJson, $old = null) {
  $pl = json_decode((string)$plantJson, true) ?: []; $pk = cap_num($pl['capacity'] ?? ''); $lk = (float)$kw;
  if ($pk > 0 && $lk > 0 && $pk != $lk) { if ($old && (float)$old['kw'] == $lk) $lk = $pk; else $pk = $lk; } /* the one that was just changed wins */
  elseif ($pk > 0 && $lk <= 0) $lk = $pk;
  elseif ($lk > 0 && $pk <= 0) $pk = $lk;
  if ($pk > 0) { $pl['capacity'] = cap_txt($pk); $plantJson = json_encode($pl, JSON_UNESCAPED_UNICODE); }
  return [$lk > 0 ? $lk : $kw, $plantJson];
}
