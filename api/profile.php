<?php
// Customer profile: one timeline of everything that happened (lead → customer → project stages → payments → documents …)
// plus pipeline progress and the reference numbers collected along the way.

function handle_profile($a) {
  need('customers');
  $cid = (int)($_GET['customer_id'] ?? 0);
  $c = row('SELECT * FROM customers WHERE id=?', [$cid]); if (!$c) fail('Customer not found', 404);
  $fin = can('finance'); $ev = [];
  $add = function ($ts, $kind, $title, $detail = '', $user = '', $extra = []) use (&$ev) { if (!$ts) return; $ev[] = ['seq' => count($ev), 'ts' => $ts, 'kind' => $kind, 'title' => $title, 'detail' => (string)$detail, 'user' => (string)$user] + $extra; };
  $money = fn($v) => $fin ? ' · ₹' . number_format((float)$v) : '';

  // lead origin
  foreach (rows('SELECT * FROM leads WHERE customer_id=?', [$cid]) as $l) {
    $add($l['created'], 'lead', 'Lead added', trim(($l['source'] ?: '') . ($l['meta_campaign'] ? ' · ' . $l['meta_campaign'] : '') . ($l['city'] ? ' · ' . $l['city'] : ''), ' ·'), $l['added_by']);
    foreach (rows("SELECT * FROM audit_log WHERE entity='leads' AND entity_id=? AND action IN ('convert','claim','unclaim','assign')", [$l['id']]) as $a2)
      $add($a2['created'], $a2['action'] === 'convert' ? 'convert' : 'lead', ['convert' => 'Converted to customer', 'claim' => 'Lead claimed', 'unclaim' => 'Lead released', 'assign' => 'Lead assigned'][$a2['action']], '', $a2['user']);
  }
  $add($c['created'], 'customer', 'Customer created', $c['district'] ?? '', $c['added_by']);
  foreach (rows("SELECT * FROM audit_log WHERE entity='customers' AND entity_id=? AND action IN ('update','plant','download_all','fees_paid','fees_unpaid','fees_demanded') ORDER BY id", [$cid]) as $a2)
    $add($a2['created'], in_array($a2['action'], ['fees_paid', 'fees_unpaid', 'fees_demanded']) ? 'payment' : ($a2['action'] === 'plant' ? 'project' : 'edit'), ['update' => 'Profile updated', 'plant' => 'Plant details updated', 'download_all' => 'All documents downloaded', 'fees_paid' => 'Fee paid', 'fees_unpaid' => 'Fee marked unpaid', 'fees_demanded' => 'Fee demanded'][$a2['action']], $a2['action'] === 'update' ? '' : $a2['detail'], $a2['user']);

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
    $progress[] = ['id' => (int)$p['id'], 'title' => $p['title'], 'kw' => $p['kw'], 'stage' => $p['stage'], 'idx' => $idx === false ? -1 : $idx, 'total' => count($labels),
      'stages' => array_map(fn($lb, $i) => ['label' => $lb, 'step' => defined('PIPE') ? PIPE[$i][2] : 0, 'at' => $done[$lb] ?? null], $labels, array_keys($labels))];
  }
  foreach (rows('SELECT * FROM quotes WHERE customer_id=? ORDER BY id', [$cid]) as $q) $add($q['created'], 'quote', 'Quotation ' . $q['number'], $q['status'] . $money($q['total']), '', ['link' => '#/quotes/' . $q['id']]);
  foreach (rows('SELECT f.* FROM files f WHERE f.customer_id=? ORDER BY id', [$cid]) as $f) $add($f['created'], 'file', 'Document uploaded', $f['name'] . ($f['item'] ? ' · ' . $f['item'] : ''), $f['user'], ['file' => (int)$f['id']]);
  foreach (rows("SELECT * FROM notes WHERE entity='customers' AND entity_id=? ORDER BY id", [$cid]) as $n) $add($n['created'], 'note', 'Note', $n['text'], $n['user']);
  foreach (rows('SELECT * FROM messages WHERE customer_id=? ORDER BY id', [$cid]) as $m) $add($m['created'], 'wa', 'WhatsApp sent', $m['text'], $m['user']);
  foreach (rows('SELECT d.*, a.name an, b.name bn FROM discussions d LEFT JOIN users a ON a.id=d.created_by LEFT JOIN users b ON b.id=d.closed_by WHERE d.customer_id=?', [$cid]) as $d) {
    $add($d['created'], 'disc', 'Discussion started', $d['topic'], $d['an']);
    if ($d['status'] === 'Closed') $add($d['closed_at'], 'disc', 'Discussion ended', $d['outcome'], $d['bn']);
  }
  foreach (rows('SELECT e.*, u.name un FROM events e LEFT JOIN users u ON u.id=e.user_id WHERE e.customer_id=? OR e.project_id IN (SELECT id FROM projects WHERE customer_id=?)', [$cid, $cid]) as $e)
    $add($e['start'], 'event', ($e['type'] ?: 'Event') . ': ' . $e['title'], $e['status'] . ($e['location'] ? ' · ' . $e['location'] : ''), $e['un'], ['local' => 1]);

  usort($ev, fn($x, $y) => strcmp($y['ts'], $x['ts']) ?: $y['seq'] <=> $x['seq']); // newest first; same second → later step first
  out(['events' => $ev, 'progress' => $progress, 'refs' => array_values(array_filter($refs, fn($r) => $r['ref'] || $r['date'] || $r['amount']))]);
}
