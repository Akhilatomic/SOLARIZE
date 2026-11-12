<?php
// Dashboard daily summary: KSEB feasibility / registration fees not paid yet (dashboard/get fees_due), only for Finance › Fees readers.
// Usage: php tests/dash_fees_test.php http://localhost:8094
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/dfjar_' . $name . '_' . getmypid() . '.txt']; }
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

echo "Dashboard: feasibility / registration fees pending\n";
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');

$cust = fn($name, $phone) => (int)(call($admin, 'customers', 'save', ['name' => $name, 'phone' => $phone])['id'] ?? 0);
$feeId = function ($kind, $cid) use ($admin) {
  call($admin, 'fees', 'add', ['kind' => $kind, 'customer_ids' => [$cid]]);
  foreach (call($admin, 'fees', 'list', null, "&kind=$kind")['rows'] ?? [] as $f) if ((int)$f['customer_id'] === $cid) return (int)$f['id'];
  return 0;
};
$due = function ($who, $kind) { return array_values(array_filter(call($who, 'dashboard', 'get')['fees_due'] ?? [], fn($f) => $f['kind'] === $kind)); };
$mine = fn($rows, $cid) => array_values(array_filter($rows, fn($f) => (int)$f['customer_id'] === $cid));

$f0 = count($due($admin, 'feasibility')); $r0 = count($due($admin, 'registration'));
$a = $cust('Dash Fee One', '9000000071'); $b = $cust('Dash Fee Two', '9000000072');
$fa = $feeId('feasibility', $a); $fb = $feeId('feasibility', $b); $ra = $feeId('registration', $a); $st = $feeId('stamp', $a);
chk($fa && $fb && $ra && $st, 'fees added');

$F = $due($admin, 'feasibility'); $R = $due($admin, 'registration');
chk(count($F) === $f0 + 2, 'two unpaid feasibility fees counted');
chk(count($R) === $r0 + 1, 'one unpaid registration fee counted');
chk(!array_filter(call($admin, 'dashboard', 'get')['fees_due'] ?? [], fn($f) => $f['kind'] === 'stamp'), 'stamp paper is not on the dashboard');
chk(($mine($F, $a)[0]['customer'] ?? '') === 'Dash Fee One' && ($mine($F, $a)[0]['phone'] ?? '') === '9000000071', 'row carries customer name + phone');

call($admin, 'fees', 'set', ['id' => $fb, 'demanded' => 1, 'demanded_on' => date('Y-m-d')]);
$F = $due($admin, 'feasibility');
chk(count($F) === $f0 + 2 && (int)($mine($F, $b)[0]['demanded'] ?? 0) === 1, 'demanded but not paid is still pending');
chk((int)$F[0]['demanded'] === 1, 'demanded rows come first');

call($admin, 'fees', 'set', ['id' => $fa, 'paid' => 1, 'paid_on' => date('Y-m-d')]);
call($admin, 'fees', 'set', ['id' => $ra, 'paid' => 1, 'paid_on' => date('Y-m-d')]);
$F = $due($admin, 'feasibility'); $R = $due($admin, 'registration');
chk(count($F) === $f0 + 1 && !$mine($F, $a), 'paid feasibility drops off');
chk(count($R) === $r0 && !$mine($R, $a), 'paid registration drops off');

/* a role without Finance › Fees gets nothing */
$baId = (int)(call($admin, 'admin', 'user_save', ['name' => 'Dash Partner', 'username' => 'dashba', 'role' => 'ba', 'active' => 1, 'password' => $pw])['id'] ?? 0);
$ba = actor('ba'); $r = call($ba, 'auth', 'login', ['username' => 'dashba', 'password' => $pw]);
chk($baId && $r['_code'] === 200, 'BA signed in');
$d = call($ba, 'dashboard', 'get');
chk($d['_code'] === 200 && ($d['fees_due'] ?? null) === [], 'BA (no Finance access) gets an empty fees_due');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
