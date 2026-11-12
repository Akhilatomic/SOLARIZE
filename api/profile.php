<?php
// Customer profile: one timeline of everything that happened (lead → customer → project stages → payments → documents …)
// plus pipeline progress and the reference numbers collected along the way.

/* which fields each profile page saves; c = customers column, p = plant key, j = latest project column */
const PF_PAGES = [
  'kseb' => ['c' => ['name', 'consumer_no', 'kseb_section', 'kseb_subdivision', 'kseb_division', 'kseb_circle', 'tariff', 'phase', 'sanctioned_load', 'meter_no', 'transformer', 'pole_no', 'address', 'district', 'pincode', 'local_body', 'village_survey', 'premises']],
  'contact' => ['c' => ['phone', 'alt_phone', 'email', 'aadhaar_no', 'pan_no', 'gst_no', 'lead_type', 'landmark', 'notes']],
  'reg' => ['p' => ['application_no', 'application_date', 'applied_kw', 'etoken_id', 'approved_kw', 'approved_on', 'kseb_reg_no', 'spin', 'installed_on', 'inspected_on', 'netmeter_on', 'commissioned_on'], 'j' => ['subsidy_amount']],
  'loc' => ['c' => ['lat', 'lng', 'landmark']],
  'bank' => ['c' => ['bank_holder', 'bank_name', 'bank_branch', 'bank_account', 'bank_ifsc', 'jansamarth_id', 'loan_bank', 'loan_branch', 'loan_amount', 'loan_sanctioned_on', 'loan_bank_email', 'loan_mgr_name', 'loan_mgr_phone']],
];

function profile_page_save($cid, $old) {
  $in = body(); $page = (string)($in['page'] ?? ''); $data = $in['data'] ?? [];
  if (!isset(PF_PAGES[$page])) fail('Unknown page');
  if (!is_array($data) || !$data) fail('Nothing to save');
  $spec = PF_PAGES[$page]; $cc = $spec['c'] ?? []; $pc = $spec['p'] ?? []; $jc = $spec['j'] ?? [];
  $loanKeys = LOAN_COLS;
  $proj = row('SELECT * FROM projects WHERE customer_id=? ORDER BY id DESC LIMIT 1', [$cid]);
  foreach ($data as $k => $v) {
    if (!in_array($k, array_merge($cc, $pc, $jc), true)) fail('Not on this page: ' . $k);
    if (is_array($v)) fail('Not on this page: ' . $k);
  }
  foreach ($data as $k => $v) {
    if (in_array($k, $loanKeys, true)) { if (!can('loans', true)) fail('No access to loan details', 403); }
    elseif (in_array($k, $cc, true)) need('customers', true);
    elseif (in_array($k, $jc, true) && (!can('finance') || !can('projects', true) || !$proj)) fail('Not allowed to change ' . $k, 403);
    elseif (in_array($k, $pc, true)) need('customers', true);
  }
  if (array_key_exists('name', $data) && trim((string)$data['name']) === '') fail('Name required');
  $c = []; $p = []; $j = [];
  foreach ($data as $k => $v) {
    $v = is_string($v) ? trim($v) : (string)$v;
    if (in_array($k, ['bank_account', 'aadhaar_no', 'pan_no'], true) && strpos($v, '•') !== false) continue;
    if (in_array($k, $cc, true)) $c[$k] = $k === 'sanctioned_load' ? (float)$v : $v;
    elseif (in_array($k, $pc, true)) $p[$k] = $v;
    else $j[$k] = (float)$v;
  }
  if (array_key_exists('lead_type', $c)) $c['lead_type'] = lead_type_save('customers', $c, $cid);
  if (array_key_exists('consumer_no', $c) || array_key_exists('kseb_section', $c)) {
    $nv = kseb_autofill(array_merge($old, $c), $old);
    foreach (KSEB_OFFICE_FIELDS as $col => $_) if (!array_key_exists($col, $c) && (string)($nv[$col] ?? '') !== (string)($old[$col] ?? '')) $c[$col] = $nv[$col];
  }
  if ($c) q('UPDATE customers SET ' . implode(',', array_map(fn($k) => "$k=:$k", array_keys($c))) . ', updated=CURRENT_TIMESTAMP WHERE id=:__id', $c + ['__id' => $cid]);
  if ($p) {
    plant_patch($cid, $p);
    if (array_key_exists('application_no', $p) && $proj) q('UPDATE projects SET application_no=? WHERE id=?', [mb_substr(trim((string)$p['application_no']), 0, 120), $proj['id']]);
  }
  if ($j && $proj) q('UPDATE projects SET subsidy_amount=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$j['subsidy_amount'], $proj['id']]);
  audit('update', 'customers', $cid, 'Profile page: ' . $page);
  $np = row('SELECT * FROM projects WHERE customer_id=? ORDER BY id DESC LIMIT 1', [$cid]);
  out(['ok' => true, 'customer' => mask_customer(strip_fin(row('SELECT * FROM customers WHERE id=?', [$cid]))), 'plant' => plant_get($cid)[0], 'project' => $np ? strip_fin($np) : null]);
}

function handle_profile($a) {
  need('customers');
  if ($a === 'page_save') { $pcid = (int)(body()['customer_id'] ?? 0); $po = row('SELECT * FROM customers WHERE id=?', [$pcid]); if (!$po) fail('Customer not found', 404); profile_page_save($pcid, $po); }
  $cid = (int)($_GET['customer_id'] ?? 0);
  $c = row('SELECT * FROM customers WHERE id=?', [$cid]); if (!$c) fail('Customer not found', 404);
  $fin = can('finance'); $ev = [];
  $add = function ($ts, $kind, $title, $detail = '', $user = '', $extra = []) use (&$ev, $fin) { if (!$ts) return;
    if (!$fin) $detail = trim(preg_replace('/\s*(·\s*)?₹\s?[\d,]+(\.\d+)?/u', '', (string)$detail), " ·"); // no money in the timeline without finance access (e.g. "Tax bill saved · 59 · ₹2,25,000")
    $ev[] = ['seq' => count($ev), 'ts' => $ts, 'kind' => $kind, 'title' => $title, 'detail' => (string)$detail, 'user' => (string)$user] + $extra; };
  $money = fn($v) => $fin ? ' · ₹' . number_format((float)$v) : '';

  // lead origin
  foreach (rows('SELECT * FROM leads WHERE customer_id=?', [$cid]) as $l) {
    $add($l['created'], 'lead', 'Lead added', trim(($l['source'] ?: '') . ($l['meta_campaign'] ? ' · ' . $l['meta_campaign'] : '') . ($l['city'] ? ' · ' . $l['city'] : ''), ' ·'), $l['added_by']);
    foreach (rows("SELECT * FROM audit_log WHERE entity='leads' AND entity_id=? AND action IN ('convert','claim','unclaim','assign')", [$l['id']]) as $a2)
      $add($a2['created'], $a2['action'] === 'convert' ? 'convert' : 'lead', ['convert' => 'Converted to customer', 'claim' => 'Lead claimed', 'unclaim' => 'Lead released', 'assign' => 'Lead reassigned'][$a2['action']], $a2['action'] === 'assign' ? $a2['detail'] : '', $a2['user']);
  }
  $add($c['created'], 'customer', 'Customer created', $c['district'] ?? '', $c['added_by']);
  foreach (rows("SELECT * FROM audit_log WHERE entity='customers' AND entity_id=? AND action IN ('update','plant','download_all','fees_paid','fees_unpaid','fees_demanded','tax_bill','warranty_card','reassign') ORDER BY id", [$cid]) as $a2)
    $add($a2['created'], in_array($a2['action'], ['fees_paid', 'fees_unpaid', 'fees_demanded', 'tax_bill']) ? 'payment' : ($a2['action'] === 'warranty_card' ? 'file' : ($a2['action'] === 'plant' ? 'project' : 'edit')), ['update' => 'Profile updated', 'plant' => 'Plant details updated', 'download_all' => 'All documents downloaded', 'fees_paid' => 'Fee paid', 'fees_unpaid' => 'Fee marked unpaid', 'fees_demanded' => 'Fee demanded', 'tax_bill' => 'Tax bill saved', 'warranty_card' => 'Warranty card saved', 'reassign' => 'Owner changed'][$a2['action']], $a2['action'] === 'update' ? '' : $a2['detail'], $a2['user']);

  // projects and pipeline
  $S = settings(); $labels = function_exists('pipe_labels') ? pipe_labels() : ($S['project_stages'] ?? []);
  $progress = []; $refs = [];
  foreach (rows('SELECT * FROM projects WHERE customer_id=? ORDER BY id', [$cid]) as $p) {
    $add($p['created'], 'project', 'Project created', trim(($p['title'] ?: '') . ($p['kw'] ? " · {$p['kw']} kW" : '') . $money($p['cost']), ' ·'), '', ['link' => '#/projects/' . $p['id']]);
    $steps = rows('SELECT * FROM project_steps WHERE project_id=? ORDER BY id', [$p['id']]);
    foreach ($steps as $s) $add($s['created'], 'stage', $s['stage'], $s['note'], $s['user'], ['link' => '#/projects/' . $p['id']]);
    foreach (rows('SELECT sd.*, f.name fname FROM stage_data sd LEFT JOIN files f ON f.id=sd.file_id WHERE sd.project_id=?', [$p['id']]) as $sd) {
      $lbl = defined('PIPE') ? (array_values(array_filter(PIPE, fn($x) => $x[0] === $sd['stage']))[0][1] ?? $sd['stage']) : $sd['stage'];
      $add($sd['updated'], 'receipt', $lbl . ' — details recorded', trim(($sd['ref'] ? 'Ref ' . $sd['ref'] : '') . ((float)$sd['amount'] ? $money($sd['amount']) : '') . ($sd['date'] ? ' · ' . $sd['date'] : '') . ($sd['fname'] ? ' · receipt ' . $sd['fname'] : ''), ' ·'), $sd['user']);
      $refs[] = ['stage' => $lbl, 'ref' => $sd['ref'], 'date' => $sd['date'], 'amount' => $fin ? (float)$sd['amount'] : null, 'project' => $p['title']];
    }
    foreach (rows('SELECT * FROM payments WHERE project_id=? ORDER BY id', [$p['id']]) as $pay) if ($fin) $add($pay['created'] ?: $pay['date'], 'payment', 'Payment received', '₹' . number_format((float)$pay['amount']) . ($pay['mode'] ? ' · ' . $pay['mode'] : '') . ($pay['note'] ? ' · ' . $pay['note'] : ''));
    foreach (rows('SELECT * FROM services WHERE project_id=? ORDER BY id', [$p['id']]) as $sv) $add($sv['date'] . ' 00:00:00', 'service', $sv['type'] . ' — ' . $sv['status'], trim(($sv['technician'] ? 'by ' . $sv['technician'] : '') . ($sv['notes'] ? ' · ' . $sv['notes'] : ''), ' ·'), $sv['user'], ['local' => 1]);
    $idx = array_search($p['stage'], $labels, true);
    $done = []; foreach ($steps as $s) $done[$s['stage']] = $s['created'];
    $progress[] = ['id' => (int)$p['id'], 'title' => $p['title'], 'kw' => $p['kw'], 'stage' => $p['stage'], 'idx' => $idx === false ? -1 : $idx, 'key' => $idx === false ? '' : (PIPE[$idx][0] ?? ''), 'loan' => (string)($p['loan'] ?? ''), 'total' => count($labels),
      'stages' => array_map(fn($lb, $i) => ['label' => $lb, 'step' => defined('PIPE') ? PIPE[$i][2] : 0, 'at' => $done[$lb] ?? null], $labels, array_keys($labels))];
  }
  foreach (rows('SELECT * FROM quotes WHERE customer_id=? ORDER BY id', [$cid]) as $q) $add($q['created'], 'quote', 'Quotation ' . $q['number'], $q['status'] . $money($q['total']), '', ['link' => '#/quotes/' . $q['id']]);
  foreach (rows('SELECT f.* FROM files f WHERE f.customer_id=? ORDER BY id', [$cid]) as $f) $add($f['created'], 'file', ($f['gen'] ?? '') !== '' ? 'Document generated' : 'Document uploaded', $f['name'] . ($f['item'] ? ' · ' . $f['item'] : ''), $f['user'], ['file' => (int)$f['id']]);
  foreach (rows("SELECT * FROM notes WHERE entity='customers' AND entity_id=? ORDER BY id", [$cid]) as $n) $add($n['created'], 'note', 'Note', $n['text'], $n['user']);
  if (!is_ba()) foreach (rows('SELECT * FROM messages WHERE customer_id=? ORDER BY id', [$cid]) as $m) $add($m['created'], 'wa', 'WhatsApp sent', $m['text'], $m['user']);
  foreach (rows('SELECT d.*, a.name an, b.name bn FROM discussions d LEFT JOIN users a ON a.id=d.created_by LEFT JOIN users b ON b.id=d.closed_by WHERE d.customer_id=?', [$cid]) as $d) {
    $add($d['created'], 'disc', 'Discussion started', $d['topic'], $d['an']);
    if ($d['status'] === 'Closed') $add($d['closed_at'], 'disc', 'Discussion ended', $d['outcome'], $d['bn']);
  }
  foreach (rows('SELECT e.*, u.name un FROM events e LEFT JOIN users u ON u.id=e.user_id WHERE e.customer_id=? OR e.project_id IN (SELECT id FROM projects WHERE customer_id=?)', [$cid, $cid]) as $e)
    $add($e['start'], 'event', ($e['type'] ?: 'Event') . ': ' . $e['title'], $e['status'] . ($e['location'] ? ' · ' . $e['location'] : ''), $e['un'], ['local' => 1]);

  usort($ev, fn($x, $y) => strcmp($y['ts'], $x['ts']) ?: $y['seq'] <=> $x['seq']); // newest first; same second → later step first
  out(['events' => $ev, 'progress' => $progress, 'pipe' => array_column(PIPE, 0), 'refs' => array_values(array_filter($refs, fn($r) => $r['ref'] || $r['date'] || $r['amount']))]);
}
