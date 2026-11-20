<?php
// Ctrl+K quick search (api/find.php). Usage: php tests/find_test.php http://localhost:8094
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
$find = fn($who, $q) => call($who, 'find', 'go', null, '&q=' . urlencode($q));
$names = fn($r, $k) => array_column($r[$k] ?? [], $k === 'quotes' ? 'number' : ($k === 'projects' ? 'title' : 'name'));
echo "Quick search\n";
$admin = ['jar' => sys_get_temp_dir() . '/fdjar_' . getmypid() . '.txt']; $sales = ['jar' => sys_get_temp_dir() . '/fdjar_s_' . getmypid() . '.txt']; $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
call($admin, 'admin', 'user_save', ['name' => 'Find Sales', 'username' => 'findsales', 'role' => 'sales', 'active' => 1, 'can_claim' => 1, 'password' => $pw]);
chk(call($sales, 'auth', 'login', ['username' => 'findsales', 'password' => $pw])['_code'] === 200, 'sales signed in');
$lid = (int)(call($admin, 'leads', 'save', ['name' => 'Zebrafind Lead', 'phone' => '9445512345', 'city' => 'Kollam'])['id'] ?? 0);
$cid = (int)(call($admin, 'customers', 'save', ['name' => 'Zebrafind Customer', 'phone' => '9445598765', 'consumer_no' => '1145999888777'])['id'] ?? 0);
call($admin, 'projects', 'save', ['customer_id' => $cid, 'title' => 'Zebrafind Customer 5 kW', 'kw' => 5]);
chk($lid && $cid, 'lead, customer and project made');
$a = $find($admin, 'zebrafind');
chk(in_array('Zebrafind Lead', $names($a, 'leads')) && in_array('Zebrafind Customer', $names($a, 'customers')) && in_array('Zebrafind Customer 5 kW', $names($a, 'projects')), 'a name finds the lead, the customer and the project');
chk(in_array('Zebrafind Customer', $names($find($admin, '99888'), 'customers')), 'part of a consumer no. finds the customer');
chk(in_array('Zebrafind Customer', $names($find($admin, '98765'), 'customers')), 'part of a phone number finds the customer');
chk(in_array('Zebrafind Lead', $names($find($admin, '9445512'), 'leads')), 'the admin finds a lead by phone');
chk(!in_array('Zebrafind Lead', $names($find($sales, '9445512'), 'leads')), 'staff cannot look up a phone number in the unclaimed pool');
$sl = $find($sales, 'Zebrafind Lead')['leads'][0] ?? [];
chk(($sl['name'] ?? '') === 'Zebrafind Lead' && strpos((string)($sl['phone'] ?? ''), '•') !== false, 'staff find an unclaimed lead by name, with the phone masked');
chk(($find($admin, 'z')['leads'] ?? null) === [], 'one letter searches nothing');
chk(call(['jar' => sys_get_temp_dir() . '/fdjar_anon.txt'], 'find', 'go', null, '&q=zebra')['_code'] === 401, 'needs sign-in');
echo "  $pass passed, $fail failed\n";
exit($fail ? 1 : 0);
