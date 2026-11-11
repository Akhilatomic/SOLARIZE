<?php
// Customer import (admin only): bring in finished jobs from a prepared file, e.g. every customer with a DCR certificate in the customer folders.
//   preview: what would happen to each record (nothing is written)
//   run:     new customers are added with a project at "Project completed" and their plant details; customers already here
//            (same consumer no., else same MNRE application no., else same phone + name) only get their EMPTY details filled — nothing is overwritten.
// File: {"kind": "solarize-customer-import", "version": 1, "customers": [{"ref", "customer": {...}, "project": {...}, "plant": {..., "panels": [], "inverters": []}}]}

const IMP_CUST = ['name', 'phone', 'alt_phone', 'email', 'address', 'district', 'pincode', 'consumer_no', 'kseb_section', 'kseb_subdivision', 'kseb_division', 'kseb_circle',
  'tariff', 'phase', 'sanctioned_load', 'meter_no', 'pole_no', 'transformer', 'jansamarth_id', 'loan_bank', 'loan_amount', 'loan_sanctioned_on', 'notes'];
const IMP_PROJ = ['title', 'kw', 'panel', 'inverter', 'application_no', 'subsidy_amount', 'loan', 'start', 'end', 'notes'];
const IMP_DATES = ['loan_sanctioned_on', 'start', 'end', 'application_date', 'approved_on', 'installed_on', 'commissioned_on', 'netmeter_on', 'inspected_on'];
const IMP_MAX = 500;
const IMP_DONE = 'Project completed';

function imp_digits($s) { return preg_replace('/\D/', '', (string)$s); }
function imp_letters($s) { return preg_replace('/[^A-Z]/', '', strtoupper((string)$s)); }
function imp_same_name($a, $b) {
  $x = imp_letters($a); $y = imp_letters($b);
  if ($x === '' || $y === '') return false;
  if ($x === $y || str_contains($x, $y) || str_contains($y, $x)) return true;
  similar_text($x, $y, $pct); return $pct >= 80;
}
/* one text value: trimmed, length-capped; dates must be YYYY-MM-DD; numbers stay numbers */
function imp_val($k, $v) {
  if (is_array($v) || is_object($v)) return '';
  $v = trim(preg_replace('/\s+/u', ' ', (string)$v));
  if (in_array($k, IMP_DATES, true)) return preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : '';
  if (in_array($k, ['kw', 'subsidy_amount', 'sanctioned_load', 'loan_amount'], true)) return is_numeric($v) ? (string)(0 + $v) : '';
  return mb_substr($v, 0, $k === 'notes' ? 3000 : ($k === 'address' ? 400 : 160));
}
function imp_clean(array $in, array $keys) { $o = []; foreach ($keys as $k) { $x = imp_val($k, $in[$k] ?? ''); if ($x !== '') $o[$k] = $x; } return $o; }
function imp_list($l, array $keys) {
  return array_values(array_filter(array_map(fn($x) => is_array($x) ? array_combine($keys, array_map(fn($k) => mb_substr(trim((string)($x[$k] ?? '')), 0, 80), $keys)) : null, array_slice((array)$l, 0, 400)), fn($x) => $x && $x['serial'] !== ''));
}
function imp_empty($v) { $v = trim((string)$v); return $v === '' || (is_numeric($v) && (float)$v == 0); }

/* the customer already in the CRM for this record */
function imp_match(array $c, array $p, array $pl) {
  $cn = imp_digits($c['consumer_no'] ?? '');
  if (strlen($cn) >= 6) foreach (rows("SELECT id,name,consumer_no FROM customers WHERE consumer_no LIKE ?", ['%' . substr($cn, -6) . '%']) as $r)
    if (imp_digits($r['consumer_no']) === $cn) return [$r, 'same consumer no.'];
  $an = trim((string)($p['application_no'] ?? ($pl['application_no'] ?? '')));
  if ($an !== '') {
    if ($r = row('SELECT c.id,c.name FROM projects p JOIN customers c ON c.id=p.customer_id WHERE p.application_no=? LIMIT 1', [$an])) return [$r, 'same MNRE application no.'];
    if ($r = row('SELECT c.id,c.name FROM plant x JOIN customers c ON c.id=x.customer_id WHERE x.data LIKE ? LIMIT 1', ['%"application_no":"' . $an . '"%'])) return [$r, 'same MNRE application no.'];
  }
  $ph = substr(imp_digits($c['phone'] ?? ''), -10);
  if (strlen($ph) === 10) foreach (rows('SELECT id,name FROM customers WHERE phone LIKE ?', ['%' . $ph]) as $r)
    if (imp_same_name($r['name'], $c['name'] ?? '')) return [$r, 'same phone and name'];
  return [null, ''];
}

/* the plant JSON for a record: known keys + panel / inverter serials (a serial repeated inside the record is refused) */
function imp_plant(array $in) {
  $d = []; foreach (PLANT_KEYS as $k) { $x = imp_val($k, $in[$k] ?? ''); if ($x !== '') $d[$k] = mb_substr($x, 0, 120); }
  $pn = imp_list($in['panels'] ?? [], ['make', 'wattage', 'serial']); $iv = imp_list($in['inverters'] ?? [], ['make', 'type', 'capacity', 'serial']);
  $all = array_merge(array_column($pn, 'serial'), array_column($iv, 'serial'));
  $dup = array_keys(array_filter(array_count_values($all), fn($n) => $n > 1));
  return [$d, $pn, $iv, $dup];
}

/* what happens to one record; with $write = false nothing is changed */
function imp_one(array $rec, bool $write, array &$seen) {
  $c = imp_clean((array)($rec['customer'] ?? []), IMP_CUST); $p = imp_clean((array)($rec['project'] ?? []), IMP_PROJ); $plin = (array)($rec['plant'] ?? []);
  [$pd, $pn, $iv, $dup] = imp_plant($plin);
  $res = ['ref' => mb_substr((string)($rec['ref'] ?? ''), 0, 200), 'name' => $c['name'] ?? '', 'consumer_no' => $c['consumer_no'] ?? '', 'action' => '', 'match' => '', 'match_name' => '', 'id' => null, 'fill' => [], 'project' => '', 'problems' => []];
  if (($c['name'] ?? '') === '') { $res['action'] = 'skip'; $res['problems'][] = 'No name'; return $res; }
  if ($dup) { $res['action'] = 'skip'; $res['problems'][] = 'Serial number repeated: ' . implode(', ', array_slice($dup, 0, 3)); return $res; }
  $key = imp_digits($c['consumer_no'] ?? '') ?: ('app:' . ($p['application_no'] ?? $pd['application_no'] ?? $res['ref']));
  if (isset($seen[$key])) { $res['action'] = 'skip'; $res['problems'][] = 'Same customer appears earlier in this file (' . $seen[$key] . ')'; return $res; }
  $seen[$key] = $c['name'];
  [$m, $why] = imp_match($c, $p, $pd);
  $who = $_SESSION['name'] ?? '';
  if (!$m) {
    $res['action'] = 'new'; $res['project'] = 'create';
    if (!$write) return $res;
    foreach (array_keys(KSEB_OFFICE_FIELDS) as $k) $c[$k] = $c[$k] ?? ''; /* section / sub division / division / circle from the consumer no. */
    $c = array_filter(kseb_autofill($c), fn($x) => $x !== '' && $x !== null);
    $cols = array_keys($c);
    q('INSERT INTO customers(' . implode(',', $cols) . ',added_by,owner_id) VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ',?,?)', array_merge(array_values($c), [$who, uid()]));
    $cid = (int)db()->lastInsertId(); $res['id'] = $cid;
    audit('import', 'customers', $cid, $c['name']);
  } else {
    $cid = (int)$m['id']; $res['id'] = $cid; $res['action'] = 'update'; $res['match'] = $why; $res['match_name'] = $m['name'];
    $cur = row('SELECT * FROM customers WHERE id=?', [$cid]);
    $want = $c; unset($want['name']); // the name is never changed
    if (!$write) { foreach ($want as $k => $v) if (array_key_exists($k, $cur) && imp_empty($cur[$k])) $res['fill'][] = $k; }
    else {
      $merged = $cur; foreach ($want as $k => $v) if (array_key_exists($k, $cur) && imp_empty($cur[$k])) $merged[$k] = $v;
      $merged = kseb_autofill($merged);
      foreach (array_merge(array_keys($want), ['kseb_subdivision', 'kseb_division', 'kseb_circle']) as $k)
        if (array_key_exists($k, $cur) && imp_empty($cur[$k]) && !imp_empty($merged[$k] ?? '') && !in_array($k, $res['fill'], true)) {
          q("UPDATE customers SET $k=?, updated=CURRENT_TIMESTAMP WHERE id=?", [$merged[$k], $cid]); $res['fill'][] = $k; }
      if ($res['fill']) audit('import', 'customers', $cid, 'filled ' . implode(', ', $res['fill']));
    }
  }
  // project: a new one at "Project completed" (the work is done), or the empty details of the existing one (its stage is kept)
  $pj = row('SELECT * FROM projects WHERE customer_id=? ORDER BY id DESC LIMIT 1', [$cid]);
  if (!$pj) {
    $res['project'] = 'create';
    if ($write) {
      $kw = (float)($p['kw'] ?? ($pd['capacity'] ?? 0));
      $v = $p + ['title' => ($kw ? $kw . ' kWp ' : '') . 'rooftop solar'];
      $cols = array_keys($v);
      q('INSERT INTO projects(customer_id,' . implode(',', $cols) . ',stage) VALUES(?,' . implode(',', array_fill(0, count($cols), '?')) . ',?)', array_merge([$cid], array_values($v), [IMP_DONE]));
      $pid = (int)db()->lastInsertId(); step_log($pid, IMP_DONE, 'Imported — work already completed'); audit('import', 'projects', $pid, $v['title']);
    }
  } else {
    $f = []; foreach ($p as $k => $v) if ($k !== 'title' && array_key_exists($k, $pj) && imp_empty($pj[$k])) $f[$k] = $v;
    $res['project'] = $f ? 'fill' : 'kept'; $res['project_stage'] = $pj['stage'];
    if ($write && $f) { foreach ($f as $k => $v) q("UPDATE projects SET $k=?, updated=CURRENT_TIMESTAMP WHERE id=?", [$v, $pj['id']]); }
  }
  // plant details: only empty keys; serial lists only when there are none yet
  [$old, $r0] = plant_get($cid);
  $add = []; foreach ($pd as $k => $v) if (imp_empty($old[$k] ?? '')) $add[$k] = $v;
  $np = empty($old['panels']) && $pn; $ni = empty($old['inverters']) && $iv;
  if ($add || $np || $ni) {
    $res['plant'] = count($add) . ' details' . ($np ? ', ' . count($pn) . ' panel serials' : '') . ($ni ? ', ' . count($iv) . ' inverter serials' : '');
    if ($write) {
      $d = $old + $add; if ($np) $d['panels'] = $pn; if ($ni) $d['inverters'] = $iv;
      $d['panels'] = $d['panels'] ?? []; $d['inverters'] = $d['inverters'] ?? [];
      q('INSERT INTO plant(customer_id,data,updated,updated_by) VALUES(?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(customer_id) DO UPDATE SET data=excluded.data, updated=excluded.updated, updated_by=excluded.updated_by',
        [$cid, json_encode($d, JSON_UNESCAPED_UNICODE), $who]);
    }
  }
  return $res;
}

function handle_import($a) {
  if (!is_admin()) fail('Only an admin can import customers', 403);
  $in = body();
  if (($in['kind'] ?? '') !== 'solarize-customer-import' || !is_array($in['customers'] ?? null)) fail('This is not a Solarize customer import file');
  $list = array_values($in['customers']);
  if (!$list) fail('The file has no customers');
  if (count($list) > IMP_MAX) fail('Too many customers in one file (max ' . IMP_MAX . ')');
  if (!in_array($a, ['preview', 'run'], true)) fail('Unknown action', 404);
  $write = $a === 'run'; $seen = []; $out = [];
  if ($write) db()->beginTransaction();
  try {
    foreach ($list as $rec) $out[] = imp_one(is_array($rec) ? $rec : [], $write, $seen);
    if ($write) db()->commit();
  } catch (Throwable $e) { if ($write && db()->inTransaction()) db()->rollBack(); throw $e; }
  $n = fn($x) => count(array_filter($out, fn($r) => $r['action'] === $x));
  if ($write) audit('import', 'customers', null, $n('new') . ' added, ' . $n('update') . ' updated, ' . $n('skip') . ' skipped');
  out(['rows' => $out, 'counts' => ['new' => $n('new'), 'update' => $n('update'), 'skip' => $n('skip')]]);
}
