<?php
// Customer documents generated in the CRM: Warranty card and Tax bill (GST invoice).
// One of each per customer; numbers are issued once per financial year (Apr–Mar) and never reused.

const GEN_KINDS = ['warranty' => 'WC', 'tax' => 'INV', 'mfr' => '', 'wcs' => '']; // mfr = panel manufacturer warranty form, wcs = warranty card handover status (no number)

function gen_fy($date) { $t = strtotime($date ?: 'now'); $y = (int)date('Y', $t); $s = (int)date('n', $t) >= 4 ? $y : $y - 1; return sprintf('%02d-%02d', $s % 100, ($s + 1) % 100); }
function gen_next_no($kind, $date) {
  $fy = gen_fy($date); $k = "seq_{$kind}_{$fy}"; $mid = GEN_KINDS[$kind];
  /* kv_set stores JSON, so the counter reads back as "1" with quotes; (int) of that was 0 and every bill got number 001.
     Decode it, and never go below a number already issued this year (repairs counters left stuck by that bug). */
  $raw = (string)(row('SELECT v FROM settings WHERE k=?', [$k])['v'] ?? '0'); $n = (int)(json_decode($raw, true) ?? $raw);
  foreach (rows('SELECT number FROM gen_docs WHERE kind=? AND number LIKE ?', [$kind, "%/$mid/$fy/%"]) as $r) $n = max($n, (int)substr(strrchr($r['number'], '/'), 1));
  $n++; kv_set($k, $n);
  $pre = trim((string)(settings()['company']['quote_prefix'] ?? 'JS')) ?: 'JS';
  return sprintf('%s/%s/%s/%03d', $pre, $mid, $fy, $n);
}
// The company address, contacts, bank account and KSEB fees set in the Quotation maker — the tax bill prints the same details.
function gen_qm_info() {
  try { $s = qm_settings(); } catch (Throwable $e) { return null; }
  $co = (array)($s['company'] ?? []); $addr = '';
  foreach ((array)($co['lines'] ?? []) as $l) if (preg_match('/office|address/i', (string)($l['label'] ?? ''))) { $addr = (string)($l['text'] ?? ''); break; }
  return ['name' => (string)($co['name'] ?? ''), 'address' => $addr, 'phone' => (string)($co['phone'] ?? ''), 'email' => (string)($co['email'] ?? ''), 'site' => (string)($s['site'] ?? ''),
    'bank' => $s['bank'] ?? null, 'kseb' => $s['kseb'] ?? null];
}
function gen_clean($v, $depth = 0) { // keep plain text / numbers / small nested lists only
  if (is_array($v)) { if ($depth > 3) return []; $o = []; foreach (array_slice($v, 0, 200, true) as $k => $x) $o[is_int($k) ? $k : mb_substr(preg_replace('/[^\w]/', '', (string)$k), 0, 40)] = gen_clean($x, $depth + 1); return $o; }
  if (is_bool($v) || is_int($v) || is_float($v)) return $v;
  return mb_substr(trim((string)$v), 0, 2000);
}

// plant cost and payments received (stored on the customer's latest project, same as the Project pipeline)
function gen_acct($cid) {
  $p = row('SELECT id, cost FROM projects WHERE customer_id=? ORDER BY id DESC LIMIT 1', [$cid]);
  if (!$p) return ['project_id' => 0, 'cost' => 0, 'payments' => [], 'paid' => 0];
  $pay = rows('SELECT id, date, amount, mode, note FROM payments WHERE project_id=? ORDER BY date, id', [$p['id']]);
  return ['project_id' => (int)$p['id'], 'cost' => (float)$p['cost'], 'payments' => $pay, 'paid' => array_sum(array_map(fn($x) => (float)$x['amount'], $pay))];
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
        'company' => settings()['company'] ?? [],
        'mfr_defaults' => json_decode((string)(row("SELECT v FROM settings WHERE k='mfr_defaults'")['v'] ?? ''), true) ?: ['distributor' => 'Southern Power Source Pvt Ltd', 'email' => ''],
        'tax' => row("SELECT number, issued_on FROM gen_docs WHERE customer_id=? AND kind='tax'", [$cid]) ?: null, // bill no. also prints on the warranty card
        'acct' => $kind === 'tax' ? gen_acct($cid) : null,
        'qm' => $kind === 'tax' ? gen_qm_info() : null]);

    case 'cost': // plant cost = the customer's project value (creates the project if there is none yet)
      need('customers', true); need('finance');
      $cost = round(max(0, (float)($in['cost'] ?? 0)), 2);
      $p = row('SELECT id FROM projects WHERE customer_id=? ORDER BY id DESC LIMIT 1', [$cid]);
      if ($p) q('UPDATE projects SET cost=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$cost, $p['id']]);
      else { [$pl] = plant_get($cid); q("INSERT INTO projects(customer_id,title,kw,cost,stage) VALUES(?,?,?,?,'Customer')", [$cid, trim(($pl['capacity'] ?? '') ? $pl['capacity'] . ' kWp solar plant' : 'Solar plant'), (float)($pl['capacity'] ?? 0), $cost]);
        $pid = (int)db()->lastInsertId(); step_log($pid, 'Customer', 'Project created from the tax bill'); }
      audit('plant_cost', 'customers', $cid, '₹' . $cost);
      out(['ok' => true, 'acct' => gen_acct($cid)]);

    case 'save':
      need('customers', true); if ($kind === 'tax') need('finance');
      $data = gen_clean((array)($in['data'] ?? []));
      $issued = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($in['issued_on'] ?? '')) ? $in['issued_on'] : date('Y-m-d');
      $r = row('SELECT * FROM gen_docs WHERE customer_id=? AND kind=?', [$cid, $kind]);
      if ($r) { q('UPDATE gen_docs SET data=?, issued_on=?, updated=CURRENT_TIMESTAMP, updated_by=? WHERE id=?', [json_encode($data, JSON_UNESCAPED_UNICODE), $issued, $_SESSION['name'] ?? '', $r['id']]); $no = $r['number']; }
      elseif (GEN_KINDS[$kind] === '') { $no = ''; q('INSERT INTO gen_docs(customer_id,kind,number,issued_on,data,updated_by) VALUES(?,?,?,?,?,?)', [$cid, $kind, '', $issued, json_encode($data, JSON_UNESCAPED_UNICODE), $_SESSION['name'] ?? '']); }
      else { $no = gen_next_no($kind, $issued); q('INSERT INTO gen_docs(customer_id,kind,number,issued_on,data,updated_by) VALUES(?,?,?,?,?,?)', [$cid, $kind, $no, $issued, json_encode($data, JSON_UNESCAPED_UNICODE), $_SESSION['name'] ?? '']); }
      if ($kind === 'tax' && $no !== '') { [$pl] = plant_get($cid); if (($pl['gst_invoice_no'] ?? '') !== $no) { $pl['gst_invoice_no'] = $no; $pl['panels'] = $pl['panels'] ?? []; $pl['inverters'] = $pl['inverters'] ?? [];
        q('INSERT INTO plant(customer_id,data,updated,updated_by) VALUES(?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(customer_id) DO UPDATE SET data=excluded.data, updated=excluded.updated, updated_by=excluded.updated_by', [$cid, json_encode($pl, JSON_UNESCAPED_UNICODE), $_SESSION['name'] ?? '']); } }
      if ($kind === 'mfr') kv_set('mfr_defaults', ['distributor' => $data['distributor'] ?? '', 'email' => $data['email'] ?? '']);
      audit($kind === 'tax' ? 'tax_bill' : ($kind === 'mfr' ? 'mfr_warranty' : ($kind === 'wcs' ? 'warranty_status' : 'warranty_card')), 'customers', $cid, ($kind === 'wcs' ? (string)($data['status'] ?? '') : $no) . ($kind === 'tax' && isset($data['grand']) ? ' · ₹' . $data['grand'] : ''));
      out(['ok' => true, 'number' => $no]);
  }
  fail('Unknown action', 404);
}
