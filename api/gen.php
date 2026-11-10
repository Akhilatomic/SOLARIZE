<?php
// Customer documents generated in the CRM: Warranty card and Tax bill (GST invoice).
// One of each per customer; numbers are issued once per financial year (Apr–Mar) and never reused.

const GEN_KINDS = ['warranty' => 'WC', 'tax' => 'INV', 'mfr' => '', 'wcs' => '']; // mfr = panel manufacturer warranty form, wcs = warranty card handover status (no number)

function gen_fy($date) { $t = strtotime($date ?: 'now'); $y = (int)date('Y', $t); $s = (int)date('n', $t) >= 4 ? $y : $y - 1; return sprintf('%02d-%02d', $s % 100, ($s + 1) % 100); }
// "JS/INV/26-27/007" → "JS/INV/26-27/008", "59" → "60", "A-099" → "A-100" (keeps the zero padding); null when there is no number at the end
function gen_bump($no) {
  if (!preg_match('/^(.*?)(\d+)(\D*)$/', (string)$no, $m)) return null;
  $n = (string)((int)$m[2] + 1); if (strlen($n) < strlen($m[2])) $n = str_pad($n, strlen($m[2]), '0', STR_PAD_LEFT);
  return $m[1] . $n . $m[3];
}
function gen_no_taken($kind, $no, $except_cid = 0) {
  return (bool)row('SELECT 1 FROM gen_docs WHERE kind=? AND lower(trim(number))=lower(trim(?)) AND customer_id<>?', [$kind, $no, (int)$except_cid]);
}
// Next number: carry on from the last bill issued this financial year — typed numbers included, so after a manual "59" comes "60" —
// else the standard series PREFIX/INV/FY/001. Never a number already used. $peek: show it without using it up.
function gen_next_no($kind, $date, $peek = false) {
  $fy = gen_fy($date); $k = "seq_{$kind}_{$fy}"; $mid = GEN_KINDS[$kind];
  $last = row("SELECT number, issued_on FROM gen_docs WHERE kind=? AND number<>'' ORDER BY id DESC LIMIT 1", [$kind]);
  $no = $last && gen_fy($last['issued_on']) === $fy ? gen_bump($last['number']) : null;
  if ($no === null) {
    /* kv_set stores JSON, so the counter reads back as "1" with quotes; (int) of that was 0 and every bill got number 001.
       Decode it, and never go below a number already issued this year (repairs counters left stuck by that bug). */
    $raw = (string)(row('SELECT v FROM settings WHERE k=?', [$k])['v'] ?? '0'); $n = (int)(json_decode($raw, true) ?? $raw);
    foreach (rows('SELECT number FROM gen_docs WHERE kind=? AND number LIKE ?', [$kind, "%/$mid/$fy/%"]) as $r) $n = max($n, (int)substr(strrchr($r['number'], '/'), 1));
    $pre = trim((string)(settings()['company']['quote_prefix'] ?? 'JS')) ?: 'JS';
    $no = sprintf('%s/%s/%s/%03d', $pre, $mid, $fy, $n + 1);
  }
  for ($i = 0; $i < 1000 && gen_no_taken($kind, $no); $i++) $no = gen_bump($no);
  if (!$peek && preg_match('#/' . preg_quote($mid, '#') . '/' . preg_quote($fy, '#') . '/(\d+)$#', $no, $m)) kv_set($k, (int)$m[1]);
  return $no;
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
        'next_no' => !$r && GEN_KINDS[$kind] !== '' ? gen_next_no($kind, date('Y-m-d'), true) : null, // what a new bill will get (the editor shows it)
        'acct' => $kind === 'tax' ? gen_acct($cid) : null,
        'qm' => $kind === 'tax' ? gen_qm_info() : null,
        'mnre' => $kind === 'warranty' ? kv_get('mnre_defaults', ['sign_name' => '', 'sign_desig' => 'Proprietor', 'sign_phone' => (gen_qm_info() ?: [])['phone'] ?? '']) : null]);

    case 'cost': // plant cost = the customer's project value (creates the project if there is none yet)
      need('customers', true); need('finance');
      $cost = round(max(0, (float)($in['cost'] ?? 0)), 2);
      $p = row('SELECT id FROM projects WHERE customer_id=? ORDER BY id DESC LIMIT 1', [$cid]);
      if ($p) q('UPDATE projects SET cost=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$cost, $p['id']]);
      else { [$pl] = plant_get($cid); q("INSERT INTO projects(customer_id,title,kw,cost,stage) VALUES(?,?,?,?,'Customer')", [$cid, trim(($pl['capacity'] ?? '') ? $pl['capacity'] . ' kWp solar plant' : 'Solar plant'), (float)($pl['capacity'] ?? 0), $cost]);
        $pid = (int)db()->lastInsertId(); step_log($pid, 'Customer', 'Project created from the tax bill'); }
      audit('plant_cost', 'customers', $cid, '₹' . $cost);
      out(['ok' => true, 'acct' => gen_acct($cid)]);

    case 'next': // the number the next bill would get on that date (not used up)
      if (GEN_KINDS[$kind] === '') out(['number' => '']);
      out(['number' => gen_next_no($kind, preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_GET['date'] ?? '')) ? $_GET['date'] : date('Y-m-d'), true)]);

    case 'save':
      need('customers', true); if ($kind === 'tax') need('finance');
      $data = gen_clean((array)($in['data'] ?? []));
      $issued = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($in['issued_on'] ?? '')) ? $in['issued_on'] : date('Y-m-d');
      $r = row('SELECT * FROM gen_docs WHERE customer_id=? AND kind=?', [$cid, $kind]);
      /* a typed invoice number (tax bill): any text, but never one another bill already has */
      $man = in_array($kind, ['tax', 'warranty'], true) ? preg_replace('/\s+/', ' ', trim((string)($in['number'] ?? ''))) : '';
      $what = $kind === 'tax' ? ['Invoice number', 'bill'] : ['Ref no.', 'warranty certificate'];
      if ($man !== '') { if (mb_strlen($man) > 40) fail("The {$what[0]} is too long (40 characters at most)");
        if (gen_no_taken($kind, $man, $cid)) fail("{$what[0]} $man is already used on another {$what[1]}", 409); }
      if ($r) { q('UPDATE gen_docs SET data=?, issued_on=?, updated=CURRENT_TIMESTAMP, updated_by=? WHERE id=?', [json_encode($data, JSON_UNESCAPED_UNICODE), $issued, $_SESSION['name'] ?? '', $r['id']]); $no = $r['number'];
        if ($man !== '' && $man !== $no) { q('UPDATE gen_docs SET number=? WHERE id=?', [$man, $r['id']]); audit($kind === 'tax' ? 'tax_bill_number' : 'warranty_ref', 'customers', $cid, "$no → $man"); $no = $man; } }
      elseif ($man !== '') { $no = $man; q('INSERT INTO gen_docs(customer_id,kind,number,issued_on,data,updated_by) VALUES(?,?,?,?,?,?)', [$cid, $kind, $no, $issued, json_encode($data, JSON_UNESCAPED_UNICODE), $_SESSION['name'] ?? '']); }
      elseif (GEN_KINDS[$kind] === '') { $no = ''; q('INSERT INTO gen_docs(customer_id,kind,number,issued_on,data,updated_by) VALUES(?,?,?,?,?,?)', [$cid, $kind, '', $issued, json_encode($data, JSON_UNESCAPED_UNICODE), $_SESSION['name'] ?? '']); }
      else { $no = gen_next_no($kind, $issued); q('INSERT INTO gen_docs(customer_id,kind,number,issued_on,data,updated_by) VALUES(?,?,?,?,?,?)', [$cid, $kind, $no, $issued, json_encode($data, JSON_UNESCAPED_UNICODE), $_SESSION['name'] ?? '']); }
      if ($kind === 'tax' && $no !== '') { [$pl] = plant_get($cid); if (($pl['gst_invoice_no'] ?? '') !== $no) { $pl['gst_invoice_no'] = $no; $pl['panels'] = $pl['panels'] ?? []; $pl['inverters'] = $pl['inverters'] ?? [];
        q('INSERT INTO plant(customer_id,data,updated,updated_by) VALUES(?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(customer_id) DO UPDATE SET data=excluded.data, updated=excluded.updated, updated_by=excluded.updated_by', [$cid, json_encode($pl, JSON_UNESCAPED_UNICODE), $_SESSION['name'] ?? '']); } }
      if ($kind === 'warranty') kv_set('mnre_defaults', ['sign_name' => (string)($data['sign_name'] ?? ''), 'sign_desig' => (string)($data['sign_desig'] ?? ''), 'sign_phone' => (string)($data['sign_phone'] ?? '')]);
      if ($kind === 'mfr') kv_set('mfr_defaults', ['distributor' => $data['distributor'] ?? '', 'email' => $data['email'] ?? '']);
      audit($kind === 'tax' ? 'tax_bill' : ($kind === 'mfr' ? 'mfr_warranty' : ($kind === 'wcs' ? 'warranty_status' : 'warranty_card')), 'customers', $cid, ($kind === 'wcs' ? (string)($data['status'] ?? '') : $no) . ($kind === 'tax' && isset($data['grand']) ? ' · ₹' . $data['grand'] : ''));
      out(['ok' => true, 'number' => $no]);
  }
  fail('Unknown action', 404);
}
