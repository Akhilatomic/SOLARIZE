<?php
// Subsidy tracker API tests. Usage: php tests/subsidy_api_test.php http://localhost:8094 <path to crm.sqlite>
// Runs after the other API suites on the same throw-away server (the admin "boss" may already exist).
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/'); $dbf = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/sdyjar_' . $name . '_' . getmypid() . '.txt']; }
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
/* multipart POST (file uploads) and a raw GET (code + content type) */
function upload($who, $m, $a, $fields) {
  global $base; $ch = curl_init("$base/api.php?m=$m&a=$a");
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar'], CURLOPT_POST => true, CURLOPT_POSTFIELDS => $fields, CURLOPT_HTTPHEADER => ['X-Solarize: 1']]);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt]; $j['_code'] = $code; return $j;
}
function raw($who, $m, $a, $qs) {
  global $base; $ch = curl_init("$base/api.php?m=$m&a=$a$qs");
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar'], CURLOPT_HTTPHEADER => ['X-Solarize: 1']]);
  $txt = curl_exec($ch); $r = ['_code' => curl_getinfo($ch, CURLINFO_HTTP_CODE), 'type' => (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE), 'body' => (string)$txt]; curl_close($ch); return $r;
}
function tmpfile_with($bytes) { $p = tempnam(sys_get_temp_dir(), 'sdy'); file_put_contents($p, $bytes); return $p; }
function by_cid($rows, $cid) { foreach ((array)$rows as $r) if ((int)($r['customer_id'] ?? $r['id'] ?? 0) === $cid) return $r; return null; }

echo "Subsidy tracker\n";
$admin = actor('admin'); $ba = actor('ba'); $eng = actor('eng');
$pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
foreach ([['Sdy Assoc', 'sdyba', 'ba'], ['Sdy Engineer', 'sdyeng', 'engineer']] as [$n, $un, $role]) call($admin, 'admin', 'user_save', ['name' => $n, 'username' => $un, 'role' => $role, 'active' => 1, 'can_claim' => 0, 'password' => $pw]);
chk(call($ba, 'auth', 'login', ['username' => 'sdyba', 'password' => $pw])['_code'] === 200, 'BA signed in');
chk(call($eng, 'auth', 'login', ['username' => 'sdyeng', 'password' => $pw])['_code'] === 200, 'engineer signed in');

$c1 = (int)(call($admin, 'customers', 'save', ['name' => 'Subsidy Test One', 'phone' => '9000000101'])['id'] ?? 0);
$c2 = (int)(call($admin, 'customers', 'save', ['name' => 'Subsidy Test Two', 'phone' => '9000000102'])['id'] ?? 0);
chk($c1 && $c2, 'two customers added');
$p1 = (int)(call($admin, 'projects', 'save', ['customer_id' => $c1, 'title' => 'Subsidy Test 3 kW', 'kw' => 3, 'application_no' => 'NP-TEST-1', 'subsidy_amount' => 78000])['id'] ?? 0);

$l = call($admin, 'subsidy', 'list');
chk($l['_code'] === 200 && count($l['flow']) === 7 && $l['side'] === ['Subsidy rejected', 'Reverify'] && $l['write'] === true, 'list gives the 7 stages and 2 side statuses');
$n0 = count($l['rows']);
chk(by_cid(call($admin, 'subsidy', 'candidates'), $c1) !== null, 'a new customer is a candidate');

$r = call($admin, 'subsidy', 'add', ['customer_id' => $c1]);
chk($r['_code'] === 200 && $r['row']['status'] === 'Netmeter installed' && $r['row']['status_date'] === date('Y-m-d'), 'add starts at Netmeter installed, today');
chk(abs($r['row']['kw'] - 3) < 0.01 && $r['row']['application_no'] === 'NP-TEST-1' && (float)$r['row']['subsidy_amount'] === 78000.0, 'row carries kW, application no. and amount from the project');
chk(call($admin, 'subsidy', 'add', ['customer_id' => $c1])['_code'] === 409, 'adding twice is refused');
chk(call($admin, 'subsidy', 'add', ['customer_id' => 99999999])['_code'] === 404, 'unknown customer is refused');
chk(by_cid(call($admin, 'subsidy', 'candidates'), $c1) === null, 'no longer a candidate');
chk(count(call($admin, 'subsidy', 'list')['rows']) === $n0 + 1, 'list has one more row');

chk(call($admin, 'subsidy', 'set', ['customer_id' => $c1, 'status' => 'Paid'])['_code'] === 400, 'unknown status is refused');
chk(call($admin, 'subsidy', 'set', ['customer_id' => $c1, 'status' => 'DISCOM inspection', 'date' => '2026-13-40'])['_code'] === 400, 'bad date is refused');
chk(call($admin, 'subsidy', 'set', ['customer_id' => $c1, 'status' => 'DISCOM inspection', 'date' => date('Y-m-d', strtotime('+5 days'))])['_code'] === 400, 'future date is refused');
chk(call($admin, 'subsidy', 'set', ['customer_id' => $c2, 'status' => 'DISCOM inspection'])['_code'] === 404, 'a customer not on the list cannot be changed');
$d = date('Y-m-d', strtotime('-2 days'));
$r = call($admin, 'subsidy', 'set', ['customer_id' => $c1, 'status' => 'DISCOM inspection', 'date' => $d, 'note' => 'Inspection fixed']);
chk($r['_code'] === 200 && $r['row']['status'] === 'DISCOM inspection' && $r['row']['status_date'] === $d && $r['row']['note'] === 'Inspection fixed', 'status, date and note saved');
chk(!empty(call($admin, 'subsidy', 'set', ['customer_id' => $c1, 'status' => 'DISCOM inspection', 'date' => $d, 'note' => 'Inspection fixed'])['same']), 'the same save again changes nothing');
call($admin, 'subsidy', 'set', ['customer_id' => $c1, 'status' => 'Reverify', 'note' => 'Bank name mismatch']);
$g = call($admin, 'subsidy', 'get', null, "&customer_id=$c1");
chk($g['row']['status'] === 'Reverify' && count($g['log']) === 3 && $g['log'][0]['status'] === 'Reverify' && $g['log'][2]['status'] === 'Netmeter installed' && $g['log'][0]['by'] === 'Boss', 'history keeps every change, newest first');
chk(call($admin, 'subsidy', 'get', null, "&customer_id=$c2")['row'] === null, 'get for a customer not on the list gives no row');
$pj = call($admin, 'projects', 'get', null, "&id=$p1");
chk(($pj['subsidy_status'] ?? '') === 'Reverify', "the customer's project shows the same status");

$dash = call($admin, 'dashboard', '');
chk(by_cid(array_map(fn($x) => ['customer_id' => $x['id']] + $x, $dash['subsidy_open'] ?? []), $c1) !== null, 'dashboard lists the customer under Subsidy in progress');
call($admin, 'subsidy', 'set', ['customer_id' => $c1, 'status' => 'Subsidy disbursed']);
$dash = call($admin, 'dashboard', '');
chk(by_cid(array_map(fn($x) => ['customer_id' => $x['id']] + $x, $dash['subsidy_open'] ?? []), $c1) === null, 'a disbursed subsidy leaves the dashboard list');

// access: engineer reads without amounts and cannot change; BA has no Subsidy page
$le = call($eng, 'subsidy', 'list');
if ($le['_code'] === 200) {
  $row = by_cid($le['rows'], $c1);
  chk($row && !array_key_exists('subsidy_amount', $row) && $le['fin'] === false, 'no Finance access: the amount is left out');
  if (!$le['write']) chk(call($eng, 'subsidy', 'set', ['customer_id' => $c1, 'status' => 'Reverify'])['_code'] === 403, 'view-only role cannot change the status');
} else chk($le['_code'] === 403, 'role without Subsidy access is refused');
chk(in_array(call($ba, 'subsidy', 'list')['_code'], [403], true), 'a Business Associate has no Subsidy list');
chk(in_array(call($ba, 'subsidy', 'add', ['customer_id' => $c2])['_code'], [403, 404], true), 'a Business Associate cannot add a customer');

// the redeemed-subsidy screenshot (owner, 2026-11-22): optional upload, kept in the customer's Documents until deleted
$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='); /* a 1 × 1 picture */
chk(empty(call($admin, 'subsidy', 'get', null, "&customer_id=$c1")['shots']), 'no screenshot yet');
$up = upload($admin, 'subsidy', 'shot', ['customer_id' => $c1, 'file' => new CURLFile(tmpfile_with($png), 'image/png', 'image.png')]);
chk($up['_code'] === 200 && count($up['shots'] ?? []) === 1 && $up['shots'][0]['name'] === 'image.png', 'screenshot uploaded');
$sid = (int)($up['id'] ?? 0);
$g = call($admin, 'subsidy', 'get', null, "&customer_id=$c1");
chk(count($g['shots'] ?? []) === 1 && (int)$g['shots'][0]['id'] === $sid, 'the window lists the screenshot');
$doc = null; foreach ((array)(call($admin, 'customers', 'get', null, "&id=$c1")['files'] ?? []) as $f) if ((int)$f['id'] === $sid) $doc = $f;
chk($doc && $doc['item'] === 'Subsidy redeemed screenshot' && $doc['kind'] === 'subsidy' && (int)$doc['life'] === 0, "it is in the customer's Documents, kept until deleted");
$img = raw($admin, 'subsidy', 'img', "&id=$sid&v=1");
chk($img['_code'] === 200 && strpos($img['type'], 'image/png') === 0 && $img['body'] === $png, 'the screenshot opens from the subsidy window');
chk(raw($admin, 'subsidy', 'img', '&id=999999999')['_code'] === 404, 'an unknown screenshot is not found');
$up2 = upload($admin, 'subsidy', 'shot', ['customer_id' => $c1, 'file' => new CURLFile(tmpfile_with("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"), 'application/pdf', 'redeemed.pdf')]);
chk($up2['_code'] === 200 && count($up2['shots']) === 2 && $up2['shots'][0]['name'] === 'redeemed.pdf', 'a PDF can be uploaded too; the newest comes first');
chk(upload($admin, 'subsidy', 'shot', ['customer_id' => $c1, 'file' => new CURLFile(tmpfile_with($png . '<?php system($_GET["c"]); ?>'), 'image/png', 'x.png')])['_code'] === 400, 'a picture carrying code is blocked by the upload check');
chk(upload($admin, 'subsidy', 'shot', ['customer_id' => $c1, 'file' => new CURLFile(tmpfile_with('hello'), 'text/plain', 'notes.txt')])['_code'] === 400, 'only pictures and PDFs');
chk(upload($admin, 'subsidy', 'shot', ['customer_id' => $c2, 'file' => new CURLFile(tmpfile_with($png), 'image/png', 'image.png')])['_code'] === 404, 'a customer not on the subsidy list gets none');
if ($le['_code'] === 200 && !$le['write']) chk(upload($eng, 'subsidy', 'shot', ['customer_id' => $c1, 'file' => new CURLFile(tmpfile_with($png), 'image/png', 'image.png')])['_code'] === 403, 'a view-only role cannot upload');
if ($le['_code'] === 200) chk(raw($eng, 'subsidy', 'img', "&id=$sid")['_code'] === 200, 'a role that can see the subsidy list can open the screenshot');
chk(raw($ba, 'subsidy', 'img', "&id=$sid")['_code'] === 403, 'a Business Associate cannot open it');

// remove → Recycle bin → restore
chk(call($admin, 'subsidy', 'remove', ['customer_id' => $c1])['_code'] === 200, 'removed from the list');
chk(call($admin, 'subsidy', 'get', null, "&customer_id=$c1")['row'] === null && by_cid(call($admin, 'subsidy', 'candidates'), $c1) !== null, 'gone from the list, a candidate again');
$bin = call($admin, 'trash', 'list'); $tid = 0;
foreach ((array)($bin['rows'] ?? $bin) as $t) if (is_array($t) && ($t['kind'] ?? '') === 'Subsidy tracking' && strpos((string)$t['label'], 'Subsidy Test One') === 0) $tid = (int)$t['id'];
chk($tid > 0, 'the removal is in the Recycle bin');
if ($tid) {
  chk(call($admin, 'trash', 'restore', ['id' => $tid])['_code'] === 200, 'restored from the Recycle bin');
  $g = call($admin, 'subsidy', 'get', null, "&customer_id=$c1");
  chk(($g['row']['status'] ?? '') === 'Subsidy disbursed' && count($g['log']) === 4, 'status and history are back');
}

// deleting the customer takes the subsidy rows along
call($admin, 'subsidy', 'add', ['customer_id' => $c2, 'status' => 'KSEB doc uploaded']);
chk(call($admin, 'subsidy', 'get', null, "&customer_id=$c2")['row']['status'] === 'KSEB doc uploaded', 'add with a chosen status');
call($admin, 'customers', 'delete', ['id' => $c2, 'confirm' => 1]);
if ($dbf && is_file($dbf)) {
  $db = new PDO('sqlite:' . $dbf);
  chk((int)$db->query("SELECT COUNT(*) FROM subsidy_track WHERE customer_id=$c2")->fetchColumn() === 0 && (int)$db->query("SELECT COUNT(*) FROM subsidy_log WHERE customer_id=$c2")->fetchColumn() === 0, 'deleting the customer clears their subsidy rows');
}
call($admin, 'subsidy', 'remove', ['customer_id' => $c1]);

echo "  $pass passed, $fail failed\n";
exit($fail ? 1 : 0);
