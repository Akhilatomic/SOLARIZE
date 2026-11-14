<?php
// KSEB documents (Work Completion Report, Annexures 1-3): customer data for the page, per-customer edits, company defaults.
// Edits live in gen_docs (kind 'kseb_wcr', 'kseb_an1' … 'kseb_an3', 'kseb_agr', 'kseb_chk'); the PDF itself is built in the browser.
// Any KSEB or bank document may also fill EMPTY customer profile / plant fields with what was typed in it (kseb_fill).

const KSEB_DOCS = ['cov', 'req', 'wcr', 'an1', 'an2', 'an3', 'doi', 'almm', 'agr', 'chk'];
/* profile fields a document may fill when they are still empty (the fields with src in assets/app24.js; KD.fill picks them) */
const KSEB_FILL = ['c' => ['consumer_no', 'kseb_section', 'premises', 'transformer', 'local_body', 'village_survey', 'sanctioned_load', 'gps',
    'phone', 'alt_phone', 'email', 'address', 'district', 'pincode', 'phase', 'bank_name', 'bank_ifsc', 'jansamarth_id'],
  'p' => ['meter_by', 'net_meter_by', 'meter_serial', 'meter_make', 'meter_reading', 'spin', 'capacity', 'panel_make', 'panel_type', 'panel_wattage', 'panel_count',
    'panel_model', 'panel_efficiency', 'inverter_make', 'inverter_capacity', 'inverter_dc_voltage', 'cell_invoice_no', 'application_no', 'application_date', 'installed_on', 'kseb_reg_no']];
const KSEB_FILL_NUM = ['sanctioned_load', 'capacity', 'panel_wattage', 'panel_count', 'panel_efficiency', 'inverter_capacity', 'inverter_dc_voltage'];
/* a value that does not look right for its profile field is not stored there (it stays in the document) */
function kseb_fill_ok($col, $v) {
  if (in_array($col, KSEB_FILL_NUM, true)) return is_numeric($v) && (float)$v > 0;
  if ($col === 'meter_reading') return is_numeric($v) && (float)$v >= 0;
  if (in_array($col, ['application_date', 'installed_on'], true)) return (bool)preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) && checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
  return match ($col) {
    'phase' => in_array($v, ['Single phase', 'Three phase'], true),
    'phone', 'alt_phone' => (bool)preg_match('/^\d{10}$/', $v),
    'pincode' => (bool)preg_match('/^\d{6}$/', $v),
    'consumer_no' => (bool)preg_match('/^\d{6,16}$/', $v),
    'bank_ifsc' => (bool)preg_match('/^[A-Z]{4}0[A-Z0-9]{6}$/', $v),
    'email' => filter_var($v, FILTER_VALIDATE_EMAIL) !== false,
    'premises' => in_array($v, ['Owned', 'Leased'], true),
    'meter_by', 'net_meter_by' => in_array($v, ['Consumer', 'KSEB'], true),
    default => true,
  };
}
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

/* fill the customer's / plant's EMPTY profile fields from a document; a field that already has a value is never changed.
   $list = [{k: document field, t: 'c'|'p', col, v}]. Returns the document field keys that went into the profile. */
function kseb_fill($cid, array $list): array {
  $c = row('SELECT * FROM customers WHERE id=?', [$cid]); if (!$c) return [];
  [$pl] = plant_get($cid);
  $empty = fn($x) => trim((string)$x) === '' || (is_numeric($x) && (float)$x == 0);
  $cu = []; $pu = []; $done = [];
  foreach (array_slice($list, 0, 40) as $f) {
    if (!is_array($f)) continue;
    $t = (string)($f['t'] ?? ''); $col = (string)($f['col'] ?? ''); $k = (string)($f['k'] ?? '');
    $v = mb_substr(trim(preg_replace('/\s+/u', ' ', (string)($f['v'] ?? ''))), 0, $col === 'address' ? 400 : 120);
    if ($v === '' || !preg_match('/^\w{1,40}$/', $k) || !in_array($col, KSEB_FILL[$t] ?? [], true)) continue;
    if (in_array($col, LOAN_COLS, true) && !can('loans', true)) continue; /* the Jan Samarth ID belongs to the loan details */
    if ($col === 'gps') {
      if (!preg_match('/^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/', $v, $m) || abs((float)$m[1]) > 90 || abs((float)$m[2]) > 180) continue;
      if (!$empty($c['lat'] ?? '') || !$empty($c['lng'] ?? '') || isset($cu['lat'])) continue;
      $cu['lat'] = $m[1]; $cu['lng'] = $m[2];
    } elseif ($t === 'c') {
      if (!$empty($c[$col] ?? '') || isset($cu[$col]) || !kseb_fill_ok($col, $v)) continue;
      $cu[$col] = $col === 'sanctioned_load' ? (float)$v : $v;
    } else {
      if (!$empty($pl[$col] ?? '') || isset($pu[$col]) || !kseb_fill_ok($col, $v)) continue;
      $pu[$col] = $v;
    }
    $done[] = $k;
  }
  if ($cu) {
    /* a consumer number or section filled here also fills the sub division / division / circle, as a customer save does */
    $nv = kseb_autofill(array_merge(array_intersect_key($c, KSEB_OFFICE_FIELDS + ['consumer_no' => 1]), $cu));
    foreach (KSEB_OFFICE_FIELDS as $col => $_) if (!isset($cu[$col]) && $empty($c[$col] ?? '') && trim((string)($nv[$col] ?? '')) !== '') $cu[$col] = $nv[$col];
    $set = implode(',', array_map(fn($col) => "$col=?", array_keys($cu)));
    q("UPDATE customers SET $set, updated=CURRENT_TIMESTAMP WHERE id=?", array_merge(array_values($cu), [$cid]));
  }
  if ($pu) {
    $pl = array_merge($pl, $pu); $pl['panels'] = $pl['panels'] ?? []; $pl['inverters'] = $pl['inverters'] ?? [];
    q('INSERT INTO plant(customer_id,data,updated,updated_by) VALUES(?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(customer_id) DO UPDATE SET data=excluded.data, updated=excluded.updated, updated_by=excluded.updated_by',
      [$cid, json_encode($pl, JSON_UNESCAPED_UNICODE), $_SESSION['name'] ?? '']);
    /* the application no. is also kept on the project (as the Registration page saves it), when the project has none */
    if (isset($pu['application_no'])) q("UPDATE projects SET application_no=? WHERE id=(SELECT id FROM projects WHERE customer_id=? ORDER BY id DESC LIMIT 1) AND COALESCE(application_no,'')=''", [$pu['application_no'], $cid]);
  }
  if ($cu || $pu) audit('update', 'customers', $cid, 'From the KSEB / bank documents: ' . implode(', ', array_merge(array_keys($cu), array_keys($pu))));
  return $done;
}

function handle_kseb($a) {
  $in = body();
  /* the KSEB office list, for the customer form (anyone who can see customers) */
  if ($a === 'office') { need('customers'); out(['office' => kseb_office($_GET['consumer_no'] ?? '', $_GET['section'] ?? '')]); }
  if ($a === 'offices') { need('customers'); header('Cache-Control: private, max-age=86400'); out(array_map(fn($r) => $r['section'], kseb_offices()['list'])); }
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
      /* typed for a profile field that is still empty: it goes into the profile instead (customers write access only),
         so the copy follows the profile from now on, like any other field */
      $filled = !empty($in['fill']) && is_array($in['fill']) && can('customers', true) ? kseb_fill($cid, $in['fill']) : [];
      foreach ($filled as $k) unset($data[$k]);
      $dt = (string)($data['date'] ?? '');
      $issued = preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $dt, $dm) && checkdate((int)$dm[2], (int)$dm[3], (int)$dm[1]) ? $dt : date('Y-m-d');
      q('INSERT INTO gen_docs(customer_id,kind,number,issued_on,data,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(customer_id,kind) DO UPDATE SET issued_on=excluded.issued_on, data=excluded.data, updated=CURRENT_TIMESTAMP, updated_by=excluded.updated_by',
        [$cid, 'kseb_' . $doc, '', $issued, json_encode($data, JSON_UNESCAPED_UNICODE), $_SESSION['name'] ?? '']);
      audit('kseb_doc', 'customers', $cid, $doc);
      $res = ['ok' => true, 'saved' => kseb_saved($cid, $doc)];
      if ($filled) { [$plant] = plant_get($cid); $res += ['filled' => $filled, 'customer' => mask_customer(row('SELECT * FROM customers WHERE id=?', [$cid])), 'plant' => $plant]; }
      out($res);

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
