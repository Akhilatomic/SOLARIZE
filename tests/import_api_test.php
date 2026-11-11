<?php
// Customer import API tests (made-up customers). Usage: php tests/import_api_test.php http://localhost:8094 /path/to/crm.sqlite
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/imjar_' . $name . '_' . getmypid() . '.txt']; }
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
$db = $dbPath ? new PDO('sqlite:' . $dbPath) : null;
$one = fn($sql, $a = []) => $db ? (function () use ($db, $sql, $a) { $s = $db->prepare($sql); $s->execute($a); return $s->fetch(PDO::FETCH_ASSOC); })() : null;

$admin = actor('admin'); $sales = actor('sales');
$pw = 'Sunny2026pass';
call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
call($admin, 'admin', 'user_save', ['name' => 'Sam Sales', 'username' => 'sam', 'role' => 'sales', 'active' => 1, 'can_claim' => 0, 'password' => $pw]);
call($sales, 'auth', 'login', ['username' => 'sam', 'password' => $pw]);

// an existing customer with some details already filled, and an existing project
$ex = call($admin, 'customers', 'save', ['name' => 'MEERA K', 'phone' => '9000000003', 'consumer_no' => '1146910000003', 'address' => 'Old address kept']);
$exId = (int)($ex['id'] ?? 0);
call($admin, 'projects', 'save', ['customer_id' => $exId, 'title' => 'Existing project', 'kw' => 0]);

$rec = function ($n, $name, $cons, $app, $phone, $serials) {
  return ['ref' => "Folder $n", 'customer' => ['name' => $name, 'phone' => $phone, 'email' => "c$n@example.com", 'address' => "House $n, Test Lane", 'district' => 'Thiruvananthapuram',
    'pincode' => '695001', 'consumer_no' => $cons, 'kseb_section' => '', 'tariff' => 'LT-1A Domestic', 'phase' => 'Single phase', 'sanctioned_load' => '4.3', 'meter_no' => "MTR$n",
    'pole_no' => "P-$n", 'transformer' => 'TEST DTR', 'jansamarth_id' => "ANS-SOLAR-$n-1", 'loan_bank' => 'Test Bank', 'loan_amount' => '150000', 'loan_sanctioned_on' => '2026-05-01', 'notes' => "Imported test $n"],
    'project' => ['kw' => '3.3', 'panel' => 'Test Panels 550 Wp', 'inverter' => 'Test Inverter', 'application_no' => $app, 'subsidy_amount' => '78000', 'loan' => 'Yes', 'start' => '2026-04-01', 'end' => '2026-05-20', 'notes' => 'DCR 1111'],
    'plant' => ['capacity' => '3.3', 'panel_make' => 'Test Panels', 'panel_wattage' => '550', 'panel_count' => (string)count($serials), 'panel_model' => 'TP-550', 'application_no' => $app,
      'application_date' => '2026-04-01', 'installed_on' => '2026-05-20', 'inverter_make' => 'Test Inverter', 'inverter_count' => '1',
      'panels' => array_map(fn($s) => ['make' => 'Test Panels', 'wattage' => '550', 'serial' => $s], $serials), 'inverters' => [['make' => 'Test Inverter', 'type' => '', 'capacity' => '3', 'serial' => "INV$n"]]]];
};
$file = ['kind' => 'solarize-customer-import', 'version' => 1, 'customers' => [
  $rec(1, 'ARUN T', '1146910000001', 'NP-TEST26-0001', '9000000001', ['S1A', 'S1B']),
  $rec(2, 'BEENA R', '1146910000002', 'NP-TEST26-0002', '9000000002', ['S2A', 'S2B']),
  $rec(3, 'MEERA K.', '1146910000003', 'NP-TEST26-0003', '9000000099', ['S3A', 'S3B']),     // already here (same consumer no.)
  $rec(4, 'ARUN T COPY', '1146910000001', 'NP-TEST26-0009', '9000000001', ['S4A']),       // same consumer no. as #1 in this file
  $rec(5, 'DUP SERIAL', '1146910000005', 'NP-TEST26-0005', '9000000005', ['S5A', 'S5A']), // a serial twice
]];

echo "permissions and file checks\n";
chk((call($sales, 'import', 'preview', $file)['_code'] ?? 0) === 403, 'a non-admin cannot preview an import');
chk((call($sales, 'import', 'run', $file)['_code'] ?? 0) === 403, 'a non-admin cannot run an import');
$bad = call($admin, 'import', 'preview', ['kind' => 'something-else', 'customers' => []]);
chk(($bad['_code'] ?? 0) === 400 && str_contains($bad['error'] ?? '', 'not a Solarize'), 'a file of another kind is refused');
chk((call($admin, 'import', 'preview', ['kind' => 'solarize-customer-import', 'customers' => []])['_code'] ?? 0) === 400, 'an empty file is refused');

echo "preview\n";
$before = $db ? (int)$one('SELECT COUNT(*) n FROM customers')['n'] : 0;
$pv = call($admin, 'import', 'preview', $file);
$act = array_column($pv['rows'] ?? [], 'action');
chk($act === ['new', 'new', 'update', 'skip', 'skip'], 'preview: 2 new, 1 already here, 2 skipped (got ' . implode(',', $act) . ')');
chk(($pv['rows'][2]['match'] ?? '') === 'same consumer no.' && ($pv['rows'][2]['match_name'] ?? '') === 'MEERA K', 'the existing customer is matched by consumer no.');
chk(in_array('email', $pv['rows'][2]['fill'] ?? []) && !in_array('address', $pv['rows'][2]['fill'] ?? []) && !in_array('phone', $pv['rows'][2]['fill'] ?? []), 'preview lists only the empty details to fill');
chk(str_contains(implode(' ', $pv['rows'][3]['problems'] ?? []), 'earlier in this file'), 'the same consumer no. twice in one file is skipped');
chk(str_contains(implode(' ', $pv['rows'][4]['problems'] ?? []), 'Serial number repeated'), 'a serial repeated inside one record is skipped');
chk(($pv['counts'] ?? []) == ['new' => 2, 'update' => 1, 'skip' => 2], 'preview counts');
if ($db) chk((int)$one('SELECT COUNT(*) n FROM customers')['n'] === $before, 'preview writes nothing');

echo "run\n";
$projBefore = $db ? (int)$one('SELECT COUNT(*) n FROM projects')['n'] : 0;
$run = call($admin, 'import', 'run', $file);
if ($db) chk((int)$one('SELECT COUNT(*) n FROM projects')['n'] === $projBefore + 2, 'run: one project for each of the 2 new customers');
chk(($run['counts'] ?? []) == ['new' => 2, 'update' => 1, 'skip' => 2], 'run counts match the preview');
$id1 = (int)($run['rows'][0]['id'] ?? 0);
$c1 = call($admin, 'customers', 'get', null, "&id=$id1");
chk(($c1['name'] ?? '') === 'ARUN T' && ($c1['consumer_no'] ?? '') === '1146910000001' && ($c1['meter_no'] ?? '') === 'MTR1' && ($c1['transformer'] ?? '') === 'TEST DTR', 'new customer has the KSEB details');
chk(($c1['kseb_section'] ?? '') !== '' && ($c1['kseb_subdivision'] ?? '') !== '', 'section and sub division come from the consumer no. (KSEB office list)');
chk(($c1['jansamarth_id'] ?? '') === 'ANS-SOLAR-1-1' && (float)($c1['loan_amount'] ?? 0) == 150000, 'loan details imported');
if ($db) {
  $p1 = $one('SELECT * FROM projects WHERE customer_id=?', [$id1]);
  chk(($p1['stage'] ?? '') === 'Project completed' && (float)$p1['kw'] == 3.3 && $p1['application_no'] === 'NP-TEST26-0001' && $p1['loan'] === 'Yes', 'new project is at "Project completed" with its details');
  chk((float)$p1['cost'] == 0, 'no project value is set (no payments are recorded, so nothing shows as due)');
  chk((bool)$one("SELECT 1 FROM project_steps WHERE project_id=? AND stage='Project completed'", [$p1['id']]), 'the stage history records the import');
  $pl = json_decode($one('SELECT data FROM plant WHERE customer_id=?', [$id1])['data'] ?? '{}', true);
  chk(($pl['panel_model'] ?? '') === 'TP-550' && count($pl['panels'] ?? []) === 2 && ($pl['panels'][1]['serial'] ?? '') === 'S1B' && ($pl['inverters'][0]['serial'] ?? '') === 'INV1', 'plant details with panel and inverter serials');
  $m = $one('SELECT * FROM customers WHERE id=?', [$exId]);
  chk($m['name'] === 'MEERA K' && $m['address'] === 'Old address kept' && $m['phone'] === '9000000003', 'existing customer: name, address and phone are not overwritten');
  chk($m['email'] === 'c3@example.com' && $m['meter_no'] === 'MTR3', 'existing customer: empty details are filled');
  $mp = $one('SELECT * FROM projects WHERE customer_id=? ORDER BY id DESC', [$exId]);
  chk($mp['stage'] === 'Customer' && $mp['application_no'] === 'NP-TEST26-0003' && $mp['title'] === 'Existing project', 'existing project: stage and title kept, empty application no. filled');
  chk((int)$one("SELECT COUNT(*) n FROM customers WHERE consumer_no='1146910000001'")['n'] === 1, 'the duplicate in the file did not create a second customer');
  chk(!$one("SELECT 1 FROM customers WHERE name='DUP SERIAL'"), 'the record with a repeated serial was not imported');
}

echo "run again\n";
$again = call($admin, 'import', 'run', $file);
chk(($again['counts']['new'] ?? -1) === 0 && ($again['counts']['update'] ?? 0) === 3, 'second run: nothing new, the three are matched');
chk(!array_filter($again['rows'] ?? [], fn($r) => $r['fill']), 'second run: nothing left to fill');
if ($db) chk((int)$one('SELECT COUNT(*) n FROM projects')['n'] === $projBefore + 2, 'second run: no extra projects');
$byApp = $rec(6, 'ARUN THOMAS', '', 'NP-TEST26-0002', '', ['S6A']);
$x = call($admin, 'import', 'preview', ['kind' => 'solarize-customer-import', 'customers' => [$byApp]]);
chk(($x['rows'][0]['action'] ?? '') === 'update' && ($x['rows'][0]['match'] ?? '') === 'same MNRE application no.', 'without a consumer no. a customer is matched by application no.');
if ($db) chk((bool)$one("SELECT 1 FROM audit_log WHERE action='import'"), 'imports are in the audit log');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
