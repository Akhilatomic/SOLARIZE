<?php
// Plant capacity is held once per customer: wherever it is typed, the customers list, the project, Plant details and the papers show it.
// Usage: php tests/capacity_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function call($m, $a, $body = null, $qs = '') {
  global $base; static $jar; $jar = $jar ?: sys_get_temp_dir() . '/capjar_' . getmypid() . '.txt';
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs"); $h = ['X-Solarize: 1'];
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $jar, CURLOPT_COOKIEFILE => $jar]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POST, true); $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt]; $j['_code'] = $code; return $j;
}
echo "Plant capacity: entered once\n";
$pw = 'Sunny2026pass';
$r = call('auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call('auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->exec('PRAGMA busy_timeout=5000');
$one = fn($sql, $a = []) => (function () use ($db, $sql, $a) { $s = $db->prepare($sql); $s->execute($a); return $s->fetchColumn(); })();
$tag = 'Cap' . getmypid();
$cust = function ($n) use ($tag) { $r = call('customers', 'save', ['name' => "$tag $n", 'phone' => '90000' . random_int(10000, 99999)]); return (int)($r['id'] ?? 0); };
$listKw = function ($cid) { foreach (call('customers', 'list') as $c) if (is_array($c) && ($c['id'] ?? 0) == $cid) return (float)$c['kw']; return -1.0; };
$plantCap = fn($cid) => (string)(call('plant', 'get', null, "&customer_id=$cid")['data']['capacity'] ?? '');

// 1. typed in Plant details, no project yet -> the list shows it (this was the gap)
$a = $cust('A'); chk($a > 0 && $listKw($a) == 0.0, 'new customer: no capacity yet');
$r = call('plant', 'save', ['customer_id' => $a, 'data' => ['capacity' => '3', 'panel_make' => 'ReNew']]);
chk($r['_code'] === 200 && $listKw($a) == 3.0, 'capacity typed in Plant details shows in the customers list (no project needed)');
// 2. a project started without a size takes it
$r = call('pipeline', 'start', ['customer_id' => $a, 'kw' => '', 'title' => '']);
$pa = (int)($r['id'] ?? 0); chk($pa > 0 && (float)$one('SELECT kw FROM projects WHERE id=?', [$pa]) == 3.0, 'Start a project without a size: the project takes the known capacity');
// 3. changed on the project -> Plant details and the list follow
$p = call('projects', 'get', null, "&id=$pa"); $p = $p['id'] ?? null ? $p : ['id' => $pa, 'customer_id' => $a, 'title' => 'x'];
$r = call('projects', 'save', ['id' => $pa, 'customer_id' => $a, 'title' => 'Rooftop solar', 'kw' => 5]);
chk($r['_code'] === 200 && $listKw($a) == 5.0 && $plantCap($a) === '5', 'changed on the project: the list and Plant details show 5');
// 4. changed in Plant details -> the project follows
call('plant', 'save', ['customer_id' => $a, 'data' => ['capacity' => '4.5 kW']]);
chk((float)$one('SELECT kw FROM projects WHERE id=?', [$pa]) == 4.5 && $listKw($a) == 4.5 && $plantCap($a) === '4.5', 'changed in Plant details (typed "4.5 kW"): the project and the list show 4.5');
// 4b. panel / inverter make: one value on the project and in Plant details
call('projects', 'save', ['id' => $pa, 'customer_id' => $a, 'title' => 'Rooftop solar', 'kw' => 4.5, 'panel' => 'Waaree 540', 'inverter' => 'Growatt']);
$pd = call('plant', 'get', null, "&customer_id=$a")['data'];
chk(($pd['panel_make'] ?? '') === 'Waaree 540' && ($pd['inverter_make'] ?? '') === 'Growatt', 'panels and inverter typed on the project show in Plant details');
call('plant', 'save', ['customer_id' => $a, 'data' => ['inverter_make' => 'Solis']]);
chk((string)$one('SELECT inverter FROM projects WHERE id=?', [$pa]) === 'Solis' && (string)$one('SELECT panel FROM projects WHERE id=?', [$pa]) === 'Waaree 540', 'inverter changed in Plant details shows on the project');
// 5. Registration page: approved capacity never overrides, but fills when nothing is known
$r = call('profile', 'page_save', ['customer_id' => $a, 'page' => 'reg', 'data' => ['approved_kw' => '3']]);
chk($r['_code'] === 200 && $listKw($a) == 4.5, 'an approved capacity typed later does not overwrite the plant capacity');
$b = $cust('B'); $r = call('profile', 'page_save', ['customer_id' => $b, 'page' => 'reg', 'data' => ['applied_kw' => '6']]);
chk($r['_code'] === 200 && $listKw($b) == 6.0 && $plantCap($b) === '6', 'nothing known yet: the applied capacity on the Registration page becomes the capacity');
// 6. Start a project with a size
$c = $cust('C'); $r = call('pipeline', 'start', ['customer_id' => $c, 'kw' => 10]);
chk($listKw($c) == 10.0 && $plantCap($c) === '10', 'size typed in Start a project shows in the list and Plant details');
// 7. a second project: the capacity is the total
$r = call('pipeline', 'start', ['customer_id' => $c, 'kw' => 2]); $pc2 = (int)$r['id'];
chk($listKw($c) == 12.0 && (float)$one('SELECT kw FROM projects WHERE id=?', [$pc2]) == 2.0, 'two projects (10 + 2): the customer shows 12, each project keeps its own size');
// 8. lead -> customer: one figure on the lead, carried over
$r = call('leads', 'save', ['name' => "$tag Lead", 'phone' => '90000' . random_int(10000, 99999), 'kw' => 7]);
$lid = (int)$r['id']; $pl = json_decode((string)$one('SELECT plant FROM leads WHERE id=?', [$lid]), true) ?: [];
chk(($pl['capacity'] ?? '') === '7', 'lead: Interested kW also fills Proposed capacity');
call('leads', 'save', ['id' => $lid, 'name' => "$tag Lead", 'kw' => 7, 'plant' => ['capacity' => '8']]);
chk((float)$one('SELECT kw FROM leads WHERE id=?', [$lid]) == 8.0, 'lead: Proposed capacity changed to 8, Interested kW follows');
$r = call('leads', 'convert', ['id' => $lid]); $lc = (int)($r['customer_id'] ?? 0);
chk($lc > 0 && $listKw($lc) == 8.0 && $plantCap($lc) === '8', 'converted: the customer starts with the lead\'s capacity');
// 9. existing data from before this rule is picked up once
$d = $cust('D'); $db->prepare("INSERT INTO plant(customer_id,data) VALUES(?,?)")->execute([$d, json_encode(['capacity' => '3.3', 'panels' => [], 'inverters' => []])]);
$e = $cust('E'); $db->prepare("INSERT INTO projects(customer_id,title,kw,stage) VALUES(?,?,?,'Customer')")->execute([$e, 'Old', 0]);
$db->prepare("INSERT INTO plant(customer_id,data) VALUES(?,?)")->execute([$e, json_encode(['approved_kw' => '5', 'panels' => [], 'inverters' => []])]);
$db->exec("DELETE FROM settings WHERE k='cap_v1'"); $db->exec('PRAGMA user_version=59'); call('auth', 'status');
chk($listKw($d) == 3.3, 'older customer with a capacity only in Plant details: now in the list');
chk($listKw($e) == 5.0 && (float)$one('SELECT kw FROM projects WHERE customer_id=?', [$e]) == 5.0, 'older customer with only an approved capacity: in the list, and on their project');
chk($listKw($a) == 4.5 && $listKw($c) == 12.0, 'the one-time pass leaves stored capacities alone');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
