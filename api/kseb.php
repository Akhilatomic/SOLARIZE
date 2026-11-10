<?php
// KSEB documents (Work Completion Report, Annexures 1-3): customer data for the page, per-customer edits, company defaults.
// Edits live in gen_docs (kind 'kseb_wcr', 'kseb_an1' … 'kseb_an3', 'kseb_chk'); the PDF itself is built in the browser.

const KSEB_DOCS = ['wcr', 'an1', 'an2', 'an3', 'doi', 'chk'];
const KSEB_DEFAULTS = [
  'vendor_name' => 'M/S JASPER SOLAR SOLUTIONS',
  'vendor_address' => 'Jasper Building Anad Bank Junction Nedumangad Thiruvananthapuram',
  'vendor_email' => 'info@jasper.solar',
  'vendor_phone' => '0960 552 5552',
  'sign_name' => 'Er Akhil ST',
  'sign_designation' => 'PROPRIETOR',
  'sign_phone' => '0960 552 5552',
];

function kseb_defaults(): array {
  $s = json_decode((string)(row("SELECT v FROM settings WHERE k='kseb_defaults'")['v'] ?? ''), true);
  $o = KSEB_DEFAULTS;
  if (is_array($s)) foreach (KSEB_DEFAULTS as $k => $_) if (isset($s[$k]) && is_string($s[$k])) $o[$k] = $s[$k];
  return $o;
}
function kseb_saved($cid, $doc) {
  $r = row('SELECT data, issued_on, updated, updated_by FROM gen_docs WHERE customer_id=? AND kind=?', [$cid, 'kseb_' . $doc]);
  return $r ? ['data' => json_decode($r['data'], true) ?: [], 'issued_on' => $r['issued_on'], 'updated' => $r['updated'], 'updated_by' => $r['updated_by']] : null;
}

function handle_kseb($a) {
  $in = body();
  need('checklist');
  switch ($a) {
    case 'get':
      need('customers');
      $cid = (int)($_GET['customer_id'] ?? 0);
      $c = row('SELECT * FROM customers WHERE id=?', [$cid]); if (!$c) fail('Customer not found', 404);
      [$plant] = plant_get($cid);
      $p = row('SELECT * FROM projects WHERE customer_id=? ORDER BY id DESC LIMIT 1', [$cid]);
      out(['customer' => mask_customer($c), 'plant' => $plant,
        'project' => $p ? ['id' => (int)$p['id'], 'title' => $p['title'], 'kw' => $p['kw'], 'stage' => $p['stage']] : null,
        'defaults' => kseb_defaults(),
        'saved' => array_combine(KSEB_DOCS, array_map(fn($d) => kseb_saved($cid, $d), KSEB_DOCS))]);

    case 'save':
      need('checklist', true);
      $doc = (string)($in['doc'] ?? ''); if (!in_array($doc, KSEB_DOCS, true)) fail('Unknown document');
      $cid = (int)($in['customer_id'] ?? 0); if (!row('SELECT 1 FROM customers WHERE id=?', [$cid])) fail('Customer not found', 404);
      $data = gen_clean((array)($in['data'] ?? []));
      $dt = (string)($data['date'] ?? '');
      $issued = preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $dt, $dm) && checkdate((int)$dm[2], (int)$dm[3], (int)$dm[1]) ? $dt : date('Y-m-d');
      q('INSERT INTO gen_docs(customer_id,kind,number,issued_on,data,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(customer_id,kind) DO UPDATE SET issued_on=excluded.issued_on, data=excluded.data, updated=CURRENT_TIMESTAMP, updated_by=excluded.updated_by',
        [$cid, 'kseb_' . $doc, '', $issued, json_encode($data, JSON_UNESCAPED_UNICODE), $_SESSION['name'] ?? '']);
      audit('kseb_doc', 'customers', $cid, $doc);
      out(['ok' => true, 'saved' => kseb_saved($cid, $doc)]);

    case 'defaults_save':
      need('checklist', true);
      $v = (array)($in['data'] ?? []); $d = kseb_defaults();
      foreach (KSEB_DEFAULTS as $k => $_) if (array_key_exists($k, $v) && is_scalar($v[$k])) $d[$k] = mb_substr(trim((string)$v[$k]), 0, 200); /* a list or object is skipped, never stored as "Array" */
      kv_set('kseb_defaults', $d);
      audit('kseb_defaults', 'settings', 0, '');
      out(['ok' => true, 'defaults' => $d]);
  }
  fail('Unknown action', 404);
}
