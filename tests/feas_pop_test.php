<?php
// Feasibility about to expire pop-up (owner's rule 2026-11-20): fees/feas_alerts lists paid feasibility with 0..3 days left,
// feas_seen starts the 3-hour wait, feas_dismiss hides a customer until the feasibility is paid again.
// Usage: php tests/feas_pop_test.php http://localhost:8094
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function call($who, $m, $a, $body = null, $qs = '') {
  global $base;
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs"); $h = ['X-Solarize: 1'];
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar']]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POST, true); $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt]; $j['_code'] = $code; return $j;
}
$ago = fn($n) => date('Y-m-d', strtotime("-$n days"));
echo "Feasibility expiry pop-up\n";
$admin = ['jar' => sys_get_temp_dir() . '/fpjar_' . getmypid() . '.txt']; $eng = ['jar' => sys_get_temp_dir() . '/fpjar_e_' . getmypid() . '.txt']; $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$ids = [];
foreach (['Feas Two Left' => 28, 'Feas Today' => 30, 'Feas Four Left' => 26, 'Feas Expired' => 31] as $n => $paidAgo) {
  $cid = (int)(call($admin, 'customers', 'save', ['name' => $n, 'phone' => '9000000' . rand(100, 999)])['id'] ?? 0);
  $ids[$n] = ['cid' => $cid, 'ago' => $paidAgo];
}
call($admin, 'fees', 'add', ['kind' => 'feasibility', 'customer_ids' => array_column($ids, 'cid')]);
$list = call($admin, 'fees', 'list', null, '&kind=feasibility')['rows'] ?? [];
foreach ($list as $f) foreach ($ids as $n => &$x) if ((int)$f['customer_id'] === $x['cid']) { $x['fid'] = (int)$f['id']; call($admin, 'fees', 'set', ['id' => $f['id'], 'demanded' => 1, 'demanded_on' => $ago($x['ago'] + 1), 'paid' => 1, 'paid_on' => $ago($x['ago'])]); }
unset($x);
$a = call($admin, 'fees', 'feas_alerts');
$names = array_column($a['rows'] ?? [], 'name');
chk(in_array('Feas Two Left', $names) && in_array('Feas Today', $names), '2 days left and expires today are listed');
chk(!in_array('Feas Four Left', $names) && !in_array('Feas Expired', $names), '4 days left and already expired are not');
chk(($a['rows'][0]['name'] ?? '') === 'Feas Today' && ($a['rows'][0]['days_left'] ?? -1) === 0, 'soonest first');
chk(($a['every'] ?? 0) === 10800, 'comes back every 3 hours');
$seen0 = (int)($a['seen'] ?? -1);
call($admin, 'fees', 'feas_seen', []);
$a2 = call($admin, 'fees', 'feas_alerts');
chk($a2['seen'] > $seen0 && $a2['now'] - $a2['seen'] < 10800, 'after it shows, the next one waits 3 hours');
call($admin, 'fees', 'feas_dismiss', ['ids' => [$ids['Feas Today']['fid']]]);
$names = array_column(call($admin, 'fees', 'feas_alerts')['rows'] ?? [], 'name');
chk(!in_array('Feas Today', $names) && in_array('Feas Two Left', $names), 'a dismissed customer is not shown again');
call($admin, 'fees', 'set', ['id' => $ids['Feas Today']['fid'], 'paid' => 1, 'paid_on' => $ago(29)]);
$names = array_column(call($admin, 'fees', 'feas_alerts')['rows'] ?? [], 'name');
chk(in_array('Feas Today', $names), 'a new payment date brings it back');
chk(call($eng, 'fees', 'feas_alerts')['_code'] === 401, 'needs sign-in');

echo "  $pass passed, $fail failed\n";
exit($fail ? 1 : 0);
