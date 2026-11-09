<?php
// Customer documents generated in the CRM: Warranty card and Tax bill (GST invoice).
// One of each per customer; numbers are issued once per financial year (Apr–Mar) and never reused.

const GEN_KINDS = ['warranty' => 'WC', 'tax' => 'INV'];

function gen_fy($date) { $t = strtotime($date ?: 'now'); $y = (int)date('Y', $t); $s = (int)date('n', $t) >= 4 ? $y : $y - 1; return sprintf('%02d-%02d', $s % 100, ($s + 1) % 100); }
function gen_next_no($kind, $date) {
  $fy = gen_fy($date); $k = "seq_{$kind}_{$fy}";
  $n = (int)(row('SELECT v FROM settings WHERE k=?', [$k])['v'] ?? 0) + 1; kv_set($k, (string)$n);
  $pre = trim((string)(settings()['company']['quote_prefix'] ?? 'JS')) ?: 'JS';
  return sprintf('%s/%s/%s/%03d', $pre, GEN_KINDS[$kind], $fy, $n);
}
function gen_clean($v, $depth = 0) { // keep plain text / numbers / small nested lists only
  if (is_array($v)) { if ($depth > 3) return []; $o = []; foreach (array_slice($v, 0, 200, true) as $k => $x) $o[is_int($k) ? $k : mb_substr(preg_replace('/[^\w]/', '', (string)$k), 0, 40)] = gen_clean($x, $depth + 1); return $o; }
  if (is_bool($v) || is_int($v) || is_float($v)) return $v;
  return mb_substr(trim((string)$v), 0, 2000);
}

function handle_gen($a) {
  $in = body();
  $kind = $_GET['kind'] ?? ($in['kind'] ?? ''); if (!isset(GEN_KINDS[$kind])) fail('Unknown document');
  need('customers'); if ($kind === 'tax') need('finance');
  $cid = (int)($_GET['customer_id'] ?? ($in['customer_id'] ?? 0));
  $c = row('SELECT * FROM customers WHERE id=?', [$cid]); if (!$c) fail('Customer not found', 404);
  switch ($a) {
    case 'get':
      $r = row('SELECT * FROM gen_docs WHERE customer_id=? AND kind=?', [$cid, $kind]);
      [$plant] = plant_get($cid);
      $p = row('SELECT * FROM projects WHERE customer_id=? ORDER BY id DESC LIMIT 1', [$cid]);
      $q = row("SELECT * FROM quotes WHERE customer_id=? ORDER BY CASE status WHEN 'Accepted' THEN 0 WHEN 'Sent' THEN 1 ELSE 2 END, id DESC LIMIT 1", [$cid]);
      out(['doc' => $r ? ['number' => $r['number'], 'issued_on' => $r['issued_on'], 'data' => json_decode($r['data'], true) ?: [], 'updated' => $r['updated'], 'updated_by' => $r['updated_by']] : null,
        'customer' => mask_customer($c), 'plant' => $plant, 'project' => $p ? ['id' => (int)$p['id'], 'title' => $p['title'], 'kw' => $p['kw'], 'stage' => $p['stage'], 'cost' => can('finance') ? (float)$p['cost'] : null] : null,
        'quote' => $q && can('finance') ? ['number' => $q['number'], 'items' => json_decode($q['items'], true) ?: [], 'gst_rate' => (float)$q['gst_rate']] : null,
        'company' => settings()['company'] ?? []]);

    case 'save':
      need('customers', true); if ($kind === 'tax') need('finance');
      $data = gen_clean((array)($in['data'] ?? []));
      $issued = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($in['issued_on'] ?? '')) ? $in['issued_on'] : date('Y-m-d');
      $r = row('SELECT * FROM gen_docs WHERE customer_id=? AND kind=?', [$cid, $kind]);
      if ($r) { q('UPDATE gen_docs SET data=?, issued_on=?, updated=CURRENT_TIMESTAMP, updated_by=? WHERE id=?', [json_encode($data, JSON_UNESCAPED_UNICODE), $issued, $_SESSION['name'] ?? '', $r['id']]); $no = $r['number']; }
      else { $no = gen_next_no($kind, $issued); q('INSERT INTO gen_docs(customer_id,kind,number,issued_on,data,updated_by) VALUES(?,?,?,?,?,?)', [$cid, $kind, $no, $issued, json_encode($data, JSON_UNESCAPED_UNICODE), $_SESSION['name'] ?? '']); }
      audit($kind === 'tax' ? 'tax_bill' : 'warranty_card', 'customers', $cid, $no . ($kind === 'tax' && isset($data['grand']) ? ' · ₹' . $data['grand'] : ''));
      out(['ok' => true, 'number' => $no]);
  }
  fail('Unknown action', 404);
}
