<?php
// KSEB documents API tests. Usage: php tests/kseb_api_test.php http://localhost:8094  (same server/data folder as qm_api_test.php)
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }

function actor($name) { return ['jar' => sys_get_temp_dir() . '/ksjar_' . $name . '_' . getmypid() . '.txt']; }
function call($who, $m, $a, $body = null, $qs = '') {
  global $base;
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs");
  $h = ['X-Solarize: 1'];
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar']]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POST, true); $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt];
  $j['_code'] = $code; return $j;
}

$anon = actor('anon'); $admin = actor('admin'); $sales = actor('sales');
$pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$u = call($admin, 'admin', 'user_save', ['name' => 'KSeller', 'username' => 'kseller', 'role' => 'sales', 'active' => 1, 'can_claim' => 0, 'password' => $pw]);
chk(!empty($u['id']), 'sales user created');
chk(call($sales, 'auth', 'login', ['username' => 'kseller', 'password' => $pw])['_code'] === 200, 'sales signed in');

$c = call($admin, 'customers', 'save', ['name' => 'Anil Kumar', 'phone' => '9876543210', 'consumer_no' => '1234567890123', 'kseb_section' => 'Nedumangad', 'sanctioned_load' => '5', 'phase' => '1', 'district' => 'Thiruvananthapuram']);
$cid = (int)($c['id'] ?? 0);
chk($cid > 0, 'customer created');
chk(call($admin, 'plant', 'save', ['customer_id' => $cid, 'data' => ['capacity' => '5', 'inverters' => [['make' => 'Deye', 'type' => 'On-grid', 'capacity' => '5', 'serial' => 'KSINV001']]]])['_code'] === 200, 'plant saved');

$g = call($admin, 'kseb', 'get', null, "&customer_id=$cid");
chk($g['_code'] === 200 && ($g['customer']['name'] ?? '') === 'Anil Kumar', 'get as admin: customer');
chk(($g['plant']['capacity'] ?? null) === '5', 'get as admin: plant capacity');
chk(($g['defaults']['sign_name'] ?? '') === 'Er Akhil ST' && ($g['defaults']['vendor_phone'] ?? '') === '0960 552 5552', 'get as admin: company defaults');
chk(array_key_exists('saved', $g) && $g['saved']['wcr'] === null && $g['saved']['an1'] === null, 'get as admin: nothing saved yet');
chk(call($admin, 'kseb', 'save', null, "&customer_id=$cid")['_code'] === 405, 'save over GET is refused');

$s = call($admin, 'kseb', 'save', ['customer_id' => $cid, 'doc' => 'wcr', 'data' => ['cust_phone' => '999', 'date' => '2026-11-06']]);
chk($s['_code'] === 200 && ($s['ok'] ?? false) === true, 'save as admin');
$g = call($admin, 'kseb', 'get', null, "&customer_id=$cid");
chk(($g['saved']['wcr']['data']['cust_phone'] ?? '') === '999' && ($g['saved']['wcr']['issued_on'] ?? '') === '2026-11-06', 'saved override and issue date come back');
call($admin, 'kseb', 'save', ['customer_id' => $cid, 'doc' => 'wcr', 'data' => ['date' => 'bad']]);
$g = call($admin, 'kseb', 'get', null, "&customer_id=$cid");
chk(($g['saved']['wcr']['issued_on'] ?? '') === date('Y-m-d') && !isset($g['saved']['wcr']['data']['cust_phone']), 'second save replaces the first, bad date becomes today');

call($admin, 'kseb', 'save', ['customer_id' => $cid, 'doc' => 'wcr', 'data' => ['date' => '2026-02-30']]);
$g = call($admin, 'kseb', 'get', null, "&customer_id=$cid");
chk(($g['saved']['wcr']['issued_on'] ?? '') === date('Y-m-d'), 'impossible date 2026-02-30 becomes today');
chk(call($admin, 'kseb', 'save', ['doc' => 'wcr', 'data' => []])['_code'] === 404, 'save with no customer_id is 404');

chk(call($admin, 'kseb', 'save', ['customer_id' => $cid, 'doc' => 'zzz', 'data' => []])['_code'] === 400, 'unknown doc is refused');
chk(call($admin, 'kseb', 'get', null, '&customer_id=999999')['_code'] === 404, 'unknown customer is 404');
chk(call($anon, 'kseb', 'get', null, "&customer_id=$cid")['_code'] === 401, 'anonymous get is 401');

chk(call($sales, 'kseb', 'get', null, "&customer_id=$cid")['_code'] === 200, 'sales can read');
chk(call($admin, 'kseb', 'save', ['customer_id' => $cid, 'doc' => 'an3', 'data' => ['reg_no' => 'REG-9', 'date' => '2026-11-07']])['_code'] === 200, 'annexure 3 saves');
$g = call($admin, 'kseb', 'get', null, "&customer_id=$cid");
chk(($g['saved']['an3']['data']['reg_no'] ?? '') === 'REG-9' && array_key_exists('an2', $g['saved'] ?? []) && $g['saved']['an2'] === null, 'get returns saved edits for annexures 2 and 3');
chk(call($sales, 'kseb', 'save', ['customer_id' => $cid, 'doc' => 'an1', 'data' => []])['_code'] === 403, 'sales cannot save');
chk(array_key_exists('doi', $g['saved'] ?? []) && $g['saved']['doi'] === null, 'details of installation: nothing saved yet');
chk(call($admin, 'kseb', 'save', ['customer_id' => $cid, 'doc' => 'doi', 'data' => ['dc_voltage' => '600 Vdc', 'date' => '2026-11-08']])['_code'] === 200, 'details of installation saves');
$g = call($admin, 'kseb', 'get', null, "&customer_id=$cid");
chk(($g['saved']['doi']['data']['dc_voltage'] ?? '') === '600 Vdc' && ($g['saved']['doi']['issued_on'] ?? '') === '2026-11-08', 'details of installation: the saved edit and date come back');
chk(call($admin, 'kseb', 'save', ['customer_id' => $cid, 'doc' => 'cov', 'data' => ['ref' => 'JSS/KSEB/12', 'date' => '2026-11-09']])['_code'] === 200, 'cover page saves');
$g = call($admin, 'kseb', 'get', null, "&customer_id=$cid");
chk(($g['saved']['cov']['data']['ref'] ?? '') === 'JSS/KSEB/12' && ($g['saved']['cov']['issued_on'] ?? '') === '2026-11-09', 'cover page: the saved Ref No. and date come back');
chk(call($sales, 'kseb', 'defaults_save', ['data' => ['sign_name' => 'X']])['_code'] === 403, 'sales cannot save defaults');

$d = call($admin, 'kseb', 'defaults_save', ['data' => ['sign_name' => 'Er X', 'bogus' => 'y']]);
chk($d['_code'] === 200 && ($d['defaults']['sign_name'] ?? '') === 'Er X' && !isset($d['defaults']['bogus']) && ($d['defaults']['vendor_email'] ?? '') === 'info@jasper.solar' && count($d['defaults']) === 7, 'defaults_save keeps the seven keys only');
$g = call($admin, 'kseb', 'get', null, "&customer_id=$cid");
chk(($g['defaults']['sign_name'] ?? '') === 'Er X', 'get returns the saved defaults');

$d = call($admin, 'kseb', 'defaults_save', ['data' => ['sign_name' => '  ' . str_repeat('x', 250) . '  ', 'vendor_email' => '  a@b.c  ']]);
chk(($d['defaults']['vendor_email'] ?? '') === 'a@b.c' && ($d['defaults']['sign_name'] ?? '') === str_repeat('x', 200), 'defaults_save trims and caps at 200 characters');
$d = call($admin, 'kseb', 'defaults_save', ['data' => ['sign_name' => ['x'], 'sign_designation' => 'MD']]);
chk($d['_code'] === 200 && ($d['defaults']['sign_name'] ?? '') === str_repeat('x', 200) && ($d['defaults']['sign_designation'] ?? '') === 'MD', 'defaults_save skips a non-scalar value (no "Array"), saves the rest');
$g = call($admin, 'kseb', 'get', null, "&customer_id=$cid");
chk(($g['defaults']['sign_name'] ?? '') === str_repeat('x', 200) && ($g['defaults']['sign_designation'] ?? '') === 'MD', 'get returns the defaults without the skipped value');

/* KSEB checklist: a database still on the old list switches to the new 17 items once, carrying matching ticks and files over */
$st = call($admin, 'settings', 'get');
chk(count($st['kseb_items'] ?? []) === 17 && ($st['kseb_items'][0] ?? '') === 'Annexure II' && ($st['kseb_items_rev'] ?? 0) === 2, 'settings carry the new 17-item KSEB checklist');
$dbPath = $argv[2] ?? '';
if ($dbPath !== '' && is_file($dbPath)) {
  $pj = call($admin, 'projects', 'save', ['customer_id' => $cid, 'title' => 'Checklist test', 'kw' => 3]);
  $pid = (int)($pj['id'] ?? 0);
  $pdo = new PDO('sqlite:' . $dbPath); $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $pdo->exec('PRAGMA busy_timeout=5000');
  $pdo->prepare("INSERT INTO checklist(project_id,kind,item,status) VALUES(?,'kseb','Single line diagram','Approved')")->execute([$pid]);
  $pdo->prepare("INSERT INTO checklist(project_id,kind,item,status) VALUES(?,'kseb','Roof ownership / NOC','Approved')")->execute([$pid]);
  $pdo->prepare("INSERT INTO files(customer_id,project_id,kind,item,name,path,size,user) VALUES(?,?,'kseb','Agreement with KSEB','agreement.pdf','x.pdf',1,'boss')")->execute([$cid, $pid]);
  $pdo->exec("UPDATE settings SET v='" . json_encode(['Single line diagram', 'Agreement with KSEB', 'Roof ownership / NOC']) . "' WHERE k='kseb_items'");
  $pdo->exec("UPDATE settings SET v='0' WHERE k='kseb_items_rev'");
  $pdo = null;
  $st = call($admin, 'settings', 'get');
  chk(count($st['kseb_items'] ?? []) === 17 && ($st['kseb_items_rev'] ?? 0) === 2, 'an old saved list is replaced by the new one');
  $pdo = new PDO('sqlite:' . $dbPath); $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $items = $pdo->query("SELECT item FROM checklist WHERE kind='kseb' AND project_id=$pid ORDER BY item")->fetchAll(PDO::FETCH_COLUMN);
  $fitem = $pdo->query("SELECT item FROM files WHERE kind='kseb' AND project_id=$pid")->fetchColumn();
  $pdo = null;
  chk($items === ['Roof ownership / NOC', 'Single line drawing'] && $fitem === 'Solar agreement', 'matching ticks and files move to the new item names, others stay as they were');
  $ov = call($admin, 'checklist', 'list', null, '&kind=kseb');
  $row = array_values(array_filter(is_array($ov) ? $ov : [], fn($p) => is_array($p) && (int)($p['id'] ?? 0) === $pid))[0] ?? [];
  chk(($row['total'] ?? 0) === 17 && ($row['approved'] ?? -1) === 1, 'progress counts only items on the new list (1/17)');
} else echo "  skip checklist carry-over test (no database path given)\n";

/* fields the KSEB / MNRE papers ask for: customer columns + plant keys save and come back */
$kx = ['kseb_circle' => 'Electrical Circle (Rural) Kattakada', 'kseb_division' => 'Electrical Division Neyyattinkara', 'kseb_subdivision' => 'Kattakada', 'local_body' => 'ANAD', 'village_survey' => 'Anad 123/4'];
$cf = call($admin, 'customers', 'save', array_merge(['name' => 'Field Test', 'phone' => '9811111111'], $kx));
$cfid = (int)($cf['id'] ?? 0);
$cg = call($admin, 'customers', 'get', null, "&id=$cfid");
chk($cfid > 0 && count(array_filter(array_keys($kx), fn($k) => ($cg[$k] ?? null) === $kx[$k])) === 5, 'customer KSEB fields (circle, division, sub division, local body, village & survey) save and load');
$px = ['panel_model' => 'RPS2MH72BD550', 'panel_efficiency' => '21.29', 'inverter_model' => 'SUN-5K-G03', 'inverter_dc_voltage' => '480', 'meter_reading' => '0.2794',
  'kseb_reg_no' => 'KSEB/REG/9', 'spin' => 'SPIN-77', 'installed_on' => '2026-11-01', 'inspected_on' => '2026-11-08',
  'dcr_po_no' => 'SPS/123', 'dcr_po_date' => '2026-10-20', 'cell_maker' => 'ReNew', 'cell_invoice_no' => 'INV-9',
  'ir_total' => '50', 'ir_earth' => '40', 'ir_between' => '30', 'earth_resistance' => '1.5', 'earth_max' => '2'];
chk(call($admin, 'plant', 'save', ['customer_id' => $cfid, 'data' => $px + ['panels' => [], 'inverters' => []]])['_code'] === 200, 'plant with the new KSEB fields saved');
$pg = call($admin, 'plant', 'get', null, "&customer_id=$cfid");
chk(count(array_filter(array_keys($px), fn($k) => ($pg['data'][$k] ?? null) === $px[$k])) === count($px), 'all 18 new plant fields come back');
$kg = call($admin, 'kseb', 'get', null, "&customer_id=$cfid");
chk(($kg['customer']['kseb_division'] ?? '') === $kx['kseb_division'] && ($kg['plant']['kseb_reg_no'] ?? '') === 'KSEB/REG/9', 'kseb/get carries the new customer and plant fields');

/* Agreement tab: values typed for EMPTY profile fields fill the profile (customers write access only); filled ones are not stored as edits */
$ag = call($admin, 'customers', 'save', ['name' => 'Agreement Test', 'phone' => '9822222222', 'kseb_section' => '', 'lat' => '', 'lng' => '', 'local_body' => 'Anad']);
$agid = (int)($ag['id'] ?? 0);
call($admin, 'plant', 'save', ['customer_id' => $agid, 'data' => ['capacity' => '3', 'meter_make' => 'GENUS', 'panels' => [], 'inverters' => []]]);
chk(array_key_exists('agr', call($admin, 'kseb', 'get', null, "&customer_id=$agid")['saved'] ?? []), 'agreement is a KSEB document');
chk(call($admin, 'kseb', 'save', ['customer_id' => $agid, 'doc' => 'req', 'data' => ['vendor_phone' => '0471 000000', 'date' => '2026-11-11']])['_code'] === 200
  && (call($admin, 'kseb', 'get', null, "&customer_id=$agid")['saved']['req']['data']['vendor_phone'] ?? '') === '0471 000000', 'request letter saves and comes back');
$fill = [['k' => 'transformer', 't' => 'c', 'col' => 'transformer', 'v' => 'Anad Jn TF'], ['k' => 'premises', 't' => 'c', 'col' => 'premises', 'v' => 'Leased'],
  ['k' => 'load', 't' => 'c', 'col' => 'sanctioned_load', 'v' => '3'], ['k' => 'gps', 't' => 'c', 'col' => 'gps', 'v' => '8.6,77.01'],
  ['k' => 'local_body', 't' => 'c', 'col' => 'local_body', 'v' => 'Vembayam'], ['k' => 'meter_make', 't' => 'p', 'col' => 'meter_make', 'v' => 'HPL'],
  ['k' => 'meter_by', 't' => 'p', 'col' => 'meter_by', 'v' => 'KSEB'], ['k' => 'meter_reading', 't' => 'p', 'col' => 'meter_reading', 'v' => '1.5'],
  ['k' => 'net_meter_by', 't' => 'p', 'col' => 'net_meter_by', 'v' => 'Consumer'], ['k' => 'z', 't' => 'p', 'col' => 'net_meter_by', 'v' => 'Neighbour'],
  ['k' => 'x', 't' => 'c', 'col' => 'name', 'v' => 'Hacked'], ['k' => 'y', 't' => 'c', 'col' => 'premises', 'v' => 'Rented']];
$data = ['date' => '2026-11-11', 'transformer' => 'Anad Jn TF', 'premises' => 'Leased', 'load' => '3', 'gps' => '8.6,77.01', 'local_body' => 'Vembayam', 'meter_make' => 'HPL', 'meter_by' => 'KSEB', 'meter_reading' => '1.5 kWh', 'party2' => 'KSEB Ltd'];
chk(call($sales, 'kseb', 'save', ['customer_id' => $agid, 'doc' => 'agr', 'data' => $data, 'fill' => $fill])['_code'] === 403, 'sales cannot save the agreement');
$s = call($admin, 'kseb', 'save', ['customer_id' => $agid, 'doc' => 'agr', 'data' => $data, 'fill' => $fill]);
chk($s['_code'] === 200 && ($s['filled'] ?? []) === ['transformer', 'premises', 'load', 'gps', 'meter_by', 'meter_reading', 'net_meter_by'], 'only empty, allowed profile fields are filled');
$cg = call($admin, 'customers', 'get', null, "&id=$agid");
chk(($cg['transformer'] ?? '') === 'Anad Jn TF' && ($cg['premises'] ?? '') === 'Leased' && (float)($cg['sanctioned_load'] ?? 0) === 3.0 && ($cg['lat'] ?? '') == '8.6' && ($cg['lng'] ?? '') == '77.01', 'customer profile now has transformer, premises, load and GPS');
chk(($cg['local_body'] ?? '') === 'Anad' && ($cg['name'] ?? '') === 'Agreement Test', 'a filled profile field and a field outside the list stay as they were');
$pg = call($admin, 'plant', 'get', null, "&customer_id=$agid");
chk(($pg['data']['meter_by'] ?? '') === 'KSEB' && ($pg['data']['net_meter_by'] ?? '') === 'Consumer' && ($pg['data']['meter_reading'] ?? '') === '1.5' && ($pg['data']['meter_make'] ?? '') === 'GENUS' && ($pg['data']['capacity'] ?? '') === '3', 'plant gets meter provider and reading; its meter make stays');
$sd = $s['saved']['data'] ?? [];
chk(!isset($sd['transformer']) && !isset($sd['gps']) && ($sd['local_body'] ?? '') === 'Vembayam' && ($sd['meter_make'] ?? '') === 'HPL' && ($sd['party2'] ?? '') === 'KSEB Ltd', 'filled fields are not kept as edits; the others are');
chk(($s['customer']['transformer'] ?? '') === 'Anad Jn TF' && ($s['plant']['meter_by'] ?? '') === 'KSEB', 'save returns the updated customer and plant');
$s2 = call($admin, 'kseb', 'save', ['customer_id' => $agid, 'doc' => 'agr', 'data' => ['transformer' => 'Other TF'], 'fill' => [['k' => 'transformer', 't' => 'c', 'col' => 'transformer', 'v' => 'Other TF']]]);
chk(empty($s2['filled']) && ($s2['saved']['data']['transformer'] ?? '') === 'Other TF' && (call($admin, 'customers', 'get', null, "&id=$agid")['transformer'] ?? '') === 'Anad Jn TF', 'a profile value is never overwritten: the agreement keeps its own copy');

/* every KSEB / bank document: what was typed for an EMPTY profile field fills it (made-up customer) */
$dc = call($admin, 'customers', 'save', ['name' => 'Docs Fill Test', 'phone' => '']); $dcid = (int)($dc['id'] ?? 0);
call($admin, 'projects', 'save', ['customer_id' => $dcid, 'title' => 'Fill test project', 'kw' => 0]);
$wf = [['k' => 'cust_phone', 't' => 'c', 'col' => 'phone', 'v' => '9811111111'], ['k' => 'consumer_no', 't' => 'c', 'col' => 'consumer_no', 'v' => '1146910000077'],
  ['k' => 'phase', 't' => 'c', 'col' => 'phase', 'v' => 'Three phase'], ['k' => 'capacity', 't' => 'p', 'col' => 'capacity', 'v' => '3.3'],
  ['k' => 'pv_make', 't' => 'p', 'col' => 'panel_make', 'v' => 'Test Panels'], ['k' => 'pv_watt', 't' => 'p', 'col' => 'panel_wattage', 'v' => '550'],
  ['k' => 'inv_capacity', 't' => 'p', 'col' => 'inverter_capacity', 'v' => '2 × 1 KW (2 KW)'], ['k' => 'cust_address', 't' => 'c', 'col' => 'address', 'v' => 'Test House, Test Lane'],
  ['k' => 'section', 't' => 'c', 'col' => 'name', 'v' => 'Not A Fill Column']];
$ws = call($admin, 'kseb', 'save', ['customer_id' => $dcid, 'doc' => 'wcr', 'data' => ['cust_phone' => '9811111111', 'inv_capacity' => '2 × 1 KW (2 KW)', 'date' => '2026-11-11'], 'fill' => $wf]);
chk(($ws['filled'] ?? []) === ['cust_phone', 'consumer_no', 'phase', 'capacity', 'pv_make', 'pv_watt', 'cust_address'], 'work completion report fills the empty profile fields (not a text that is no number, not a column off the list)');
$dg = call($admin, 'customers', 'get', null, "&id=$dcid");
chk(($dg['phone'] ?? '') === '9811111111' && ($dg['consumer_no'] ?? '') === '1146910000077' && ($dg['phase'] ?? '') === 'Three phase' && ($dg['address'] ?? '') === 'Test House, Test Lane' && ($dg['name'] ?? '') === 'Docs Fill Test', 'customer fields filled, name untouched');
chk(($dg['kseb_section'] ?? '') !== '' && ($dg['kseb_subdivision'] ?? '') !== '', 'the consumer no. typed in a document also fills section and sub division');
$dp = call($admin, 'plant', 'get', null, "&customer_id=$dcid")['data'] ?? [];
chk(($dp['capacity'] ?? '') === '3.3' && ($dp['panel_make'] ?? '') === 'Test Panels' && ($dp['panel_wattage'] ?? '') === '550' && empty($dp['inverter_capacity']), 'plant fields filled; "2 × 1 KW (2 KW)" is not stored as a capacity');
chk(($ws['saved']['data']['inv_capacity'] ?? '') === '2 × 1 KW (2 KW)' && !isset($ws['saved']['data']['cust_phone']), 'what went to the profile is not kept as a document edit; the rest is');
$bad = call($admin, 'kseb', 'save', ['customer_id' => $dcid, 'doc' => 'doi', 'data' => [], 'fill' => [['k' => 'email', 't' => 'c', 'col' => 'email', 'v' => 'not an email'],
  ['k' => 'alt_phone', 't' => 'c', 'col' => 'alt_phone', 'v' => '12345'], ['k' => 'bank_ifsc', 't' => 'c', 'col' => 'bank_ifsc', 'v' => 'SBIN0070422'], ['k' => 'dc_voltage', 't' => 'p', 'col' => 'inverter_dc_voltage', 'v' => 'abc']]]);
chk(($bad['filled'] ?? []) === ['bank_ifsc'], 'a value that does not look right for its field (email, phone, number) is not put in the profile');
/* bank documentation: the same, with the Jan Samarth ID (loan details) and the application no. also on the project */
$bs = call($admin, 'bank', 'save', ['customer_id' => $dcid, 'doc' => 'bfr', 'data' => ['portal_id' => 'NP-TEST26-0077'], 'fill' => [['k' => 'portal_id', 't' => 'p', 'col' => 'application_no', 'v' => 'NP-TEST26-0077'],
  ['k' => 'jansamarth_id', 't' => 'c', 'col' => 'jansamarth_id', 'v' => 'ANS-SOLAR-77-1'], ['k' => 'pincode', 't' => 'c', 'col' => 'pincode', 'v' => '695077'], ['k' => 'consumer_no', 't' => 'c', 'col' => 'consumer_no', 'v' => '1146910000099']]]);
chk(($bs['filled'] ?? []) === ['portal_id', 'jansamarth_id', 'pincode'], 'bank feasibility report fills empty fields; the consumer no. already filled is kept');
$bg = call($admin, 'customers', 'get', null, "&id=$dcid");
chk(($bg['jansamarth_id'] ?? '') === 'ANS-SOLAR-77-1' && ($bg['pincode'] ?? '') === '695077' && ($bg['consumer_no'] ?? '') === '1146910000077', 'bank fill saved; existing consumer no. not overwritten');
chk((call($admin, 'plant', 'get', null, "&customer_id=$dcid")['data']['application_no'] ?? '') === 'NP-TEST26-0077' && (($bg['projects'][0]['application_no'] ?? '') === 'NP-TEST26-0077'), 'application no. filled in the plant and on the project');
chk(isset($bs['customer'], $bs['plant']) && !isset($bs['saved']['data']['portal_id']), 'bank save returns the updated profile and keeps no copy of what went to it');

/* total reset (keep last: it wipes customers): nothing keyed by customer id may survive into a new customer #1 */
call($admin, 'kseb', 'save', ['customer_id' => $cid, 'doc' => 'wcr', 'data' => ['cust_phone' => '111']]);
$rs = call($admin, 'reset', 'reset', ['password' => $pw, 'confirm' => 'RESET', 'opts' => []]);
chk($rs['_code'] === 200, 'total reset runs');
/* ids restart at 1: create customers until one takes the old customer's id */
$cid2 = 0;
for ($i = 0; $i < $cid + 2 && $cid2 !== $cid; $i++) { $c2 = call($admin, 'customers', 'save', ['name' => 'After Reset ' . $i, 'phone' => '90000000' . sprintf('%02d', $i)]); $cid2 = (int)($c2['id'] ?? 0); }
chk($cid2 === $cid, 'new customer reuses the old customer id');
$g = call($admin, 'kseb', 'get', null, "&customer_id=$cid2");
chk($g['_code'] === 200 && array_key_exists('wcr', $g['saved'] ?? []) && $g['saved']['wcr'] === null && empty($g['plant']['capacity'] ?? ''), 'a new customer after reset inherits no saved document or plant');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
