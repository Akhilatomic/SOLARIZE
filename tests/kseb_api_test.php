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
