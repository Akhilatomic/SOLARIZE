<?php
// Profile pages: new fields, and saves that never blank fields they do not send. Usage: php tests/profile_pages_api_test.php http://localhost:8094 <db path>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }

function actor($name) { return ['jar' => sys_get_temp_dir() . '/pfjar_' . $name . '_' . getmypid() . '.txt']; }
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


$admin = actor('admin'); $eng = actor('eng'); $ba = actor('ba');
$pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
call($admin, 'admin', 'user_save', ['name' => 'PFEng', 'username' => 'pfeng', 'role' => 'engineer', 'active' => 1, 'can_claim' => 0, 'password' => $pw]);
call($admin, 'admin', 'user_save', ['name' => 'PFBa', 'username' => 'pfba', 'role' => 'ba', 'active' => 1, 'can_claim' => 0, 'password' => $pw]);
chk(call($eng, 'auth', 'login', ['username' => 'pfeng', 'password' => $pw])['_code'] === 200, 'engineer signed in');
chk(call($ba, 'auth', 'login', ['username' => 'pfba', 'password' => $pw])['_code'] === 200, 'ba signed in');

/* plant save never blanks keys it does not send */
$c = call($admin, 'customers', 'save', ['name' => 'Test Person One', 'phone' => '9000000001', 'aadhaar_no' => '123412341234', 'pan_no' => 'ABCDE1234F', 'pole_no' => 'CM-1/2', 'loan_bank' => 'SBI', 'loan_amount' => '200000']);
$cid = (int)($c['id'] ?? 0);
chk($cid > 0, 'customer created');
call($admin, 'plant', 'save', ['customer_id' => $cid, 'data' => ['application_no' => 'NP-TEST-1', 'kseb_reg_no' => 'R1', 'applied_kw' => '3']]);
call($admin, 'plant', 'save', ['customer_id' => $cid, 'data' => ['capacity' => '3', 'panels' => [], 'inverters' => []]]);
$p = call($admin, 'plant', 'get', null, "&customer_id=$cid")['data'] ?? [];
chk(($p['application_no'] ?? '') === 'NP-TEST-1' && ($p['kseb_reg_no'] ?? '') === 'R1' && ($p['applied_kw'] ?? '') === '3' && ($p['capacity'] ?? '') === '3', 'plant save keeps keys it did not send');

/* new customer fields round-trip */
$g = call($admin, 'customers', 'get', null, "&id=$cid");
chk(($g['aadhaar_no'] ?? '') === '123412341234' && ($g['pan_no'] ?? '') === 'ABCDE1234F' && ($g['pole_no'] ?? '') === 'CM-1/2' && ($g['loan_bank'] ?? '') === 'SBI' && ($g['loan_amount'] ?? '') === '200000', 'admin gets the five new fields unchanged');

/* engineer sees masked ids, loans readable */
$ge = call($eng, 'customers', 'get', null, "&id=$cid");
chk(($ge['aadhaar_no'] ?? '') === '••••••••1234' && ($ge['pan_no'] ?? '') === '••••••234F', 'engineer sees Aadhaar and PAN masked');
chk(($ge['loan_bank'] ?? '') === 'SBI', 'engineer reads loan_bank');

/* engineer saves the whole object back plus a change */
$ge['landmark'] = 'Temple';
chk(call($eng, 'customers', 'save', $ge)['_code'] === 200, 'engineer saves the object');
$g = call($admin, 'customers', 'get', null, "&id=$cid");
chk(($g['aadhaar_no'] ?? '') === '123412341234' && ($g['pan_no'] ?? '') === 'ABCDE1234F' && ($g['loan_bank'] ?? '') === 'SBI' && ($g['loan_amount'] ?? '') === '200000' && ($g['landmark'] ?? '') === 'Temple', 'engineer save keeps real Aadhaar/PAN/loan and writes landmark');

/* engineer cannot change loan columns (loans are read only for engineer) */
$ge['loan_bank'] = 'HACK';
call($eng, 'customers', 'save', $ge);
chk((call($admin, 'customers', 'get', null, "&id=$cid")['loan_bank'] ?? '') === 'SBI', 'engineer cannot overwrite loan_bank');

/* BA: own customer, no loan keys, save does not blank them */
$b = call($ba, 'customers', 'save', ['name' => 'Test Person Two', 'phone' => '9000000002']);
$bid = (int)($b['id'] ?? 0);
chk($bid > 0, 'ba customer created');
call($admin, 'customers', 'save', ['id' => $bid, 'name' => 'Test Person Two', 'phone' => '9000000002', 'loan_bank' => 'HDFC', 'loan_amount' => '150000']);
$gb = call($ba, 'customers', 'get', null, "&id=$bid");
chk(!array_key_exists('loan_bank', $gb) && !array_key_exists('loan_amount', $gb), 'ba get has no loan keys');
$gb['landmark'] = 'Bus stop';
chk(call($ba, 'customers', 'save', $gb)['_code'] === 200, 'ba saves what it got');
$g = call($admin, 'customers', 'get', null, "&id=$bid");
chk(($g['loan_bank'] ?? '') === 'HDFC' && ($g['loan_amount'] ?? '') === '150000' && ($g['landmark'] ?? '') === 'Bus stop', 'ba save keeps loan fields');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
