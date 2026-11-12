<?php
// Accounts schema, permission, bank fields, payment source, materials and cost sheet. Usage: php tests/acc_api_test.php http://localhost:8094
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/acjar_' . $name . '_' . getmypid() . '.txt']; }
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
function find_by($list, $key, $val) { foreach ((array)$list as $x) if (is_array($x) && ($x[$key] ?? null) == $val) return $x; return null; }

echo "Accounts: schema, materials, cost sheet\n";
$admin = actor('admin'); $acct = actor('acct'); $sales = actor('sales'); $ba = actor('ba'); $eng = actor('eng');
$pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
foreach ([['Acc Person', 'accts', 'accounts', $acct], ['Sales Person', 'sales1', 'sales', $sales], ['Ba Person', 'ba1', 'ba', $ba], ['Eng Person', 'acceng', 'engineer', $eng]] as [$n, $un, $role, $who]) {
  call($admin, 'admin', 'user_save', ['name' => $n, 'username' => $un, 'role' => $role, 'active' => 1, 'can_claim' => 0, 'password' => $pw]);
  chk(call($who, 'auth', 'login', ['username' => $un, 'password' => $pw])['_code'] === 200, "$role signed in");
}

$m = call($acct, 'acc', 'ac_materials');
chk($m['_code'] === 200 && count($m) - 1 >= 49, 'accounts role sees 49 seeded materials');
chk(($m[0]['grp'] ?? '') === 'Inverter & optimizers', 'first material is in Inverter & optimizers');
chk(call($sales, 'acc', 'ac_materials')['_code'] === 403, 'sales gets 403 on materials');
chk(call($ba, 'acc', 'ac_materials')['_code'] === 403, 'ba gets 403 on materials');
chk(call($acct, 'acc', 'material_save')['_code'] === 405, 'material_save over GET is refused');

$c = call($admin, 'customers', 'save', ['name' => 'Test Person One', 'phone' => '9000000001']);
$cid = (int)($c['id'] ?? 0);
$pid = (int)(call($admin, 'projects', 'save', ['customer_id' => $cid, 'title' => 'Roof 5 kW', 'kw' => 5, 'cost' => 108900, 'stage' => 'New'])['id'] ?? 0);
chk($cid > 0 && $pid > 0, 'customer and project created');
$seedId = (int)$m[0]['id'];
$cs = call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'lines' => [
  ['material_id' => $seedId, 'grp' => $m[0]['grp'], 'name' => $m[0]['name'], 'qty' => 1, 'unit' => 'Nos', 'rate' => 50000, 'gst' => 5],
  ['grp' => 'Solar panels', 'name' => 'Test Panel 550', 'unit' => 'Nos', 'qty' => 6, 'rate' => 9000, 'gst' => 5],
]]);
chk($cs['_code'] === 200 && count($cs['lines'] ?? []) === 2, 'cost_save returns 2 lines');
chk(($cs['project']['cost'] ?? 0) == 108900 && ($cs['customer']['name'] ?? '') === 'Test Person One', 'cost sheet carries project and customer');
$m2 = call($acct, 'acc', 'ac_materials');
$tp = find_by($m2, 'name', 'Test Panel 550'); $sd = find_by($m2, 'id', $seedId);
chk($tp && (float)$tp['rate'] == 9000 && $tp['grp'] === 'Solar panels', 'new line was added to materials with its rate');
chk($sd && (float)$sd['rate'] == 50000, 'priced line updated its material rate');
call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'lines' => [['grp' => 'Solar panels', 'name' => 'Test Panel 550', 'qty' => 4, 'rate' => 9100, 'gst' => 5]]]);
$g = call($acct, 'acc', 'ac_cost', null, "&project_id=$pid");
chk($g['_code'] === 200 && count($g['lines']) === 1 && (float)$g['lines'][0]['qty'] == 4, 'second save replaces all lines (1 line)');
$cnt = 0; foreach (call($acct, 'acc', 'ac_materials') as $x) if (is_array($x) && ($x['name'] ?? '') === 'Test Panel 550') $cnt++;
chk($cnt === 1, 'no duplicate material created on re-save');
chk(call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'lines' => [['grp' => 'Solar panels', 'name' => 'X', 'qty' => 1, 'rate' => -5, 'gst' => 5]]])['_code'] === 400, 'negative rate refused');
chk(call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'lines' => [['grp' => 'Solar panels', 'name' => 'X', 'qty' => 1, 'rate' => 5, 'gst' => 7]]])['_code'] === 400, 'bad GST refused');
chk(call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'lines' => [['grp' => 'Solar panels', 'name' => '', 'qty' => 1, 'rate' => 5, 'gst' => 5]]])['_code'] === 400, 'blank name refused');
chk(count(call($acct, 'acc', 'ac_cost', null, "&project_id=$pid")['lines']) === 1, 'failed saves left the lines alone');
chk(call($sales, 'acc', 'cost_save', ['project_id' => $pid, 'lines' => []])['_code'] === 403, 'sales cannot save a cost sheet');
chk(call($acct, 'acc', 'ac_cost', null, '&project_id=999999')['_code'] === 404, 'unknown project is 404');

$d = call($acct, 'acc', 'material_save', ['grp' => 'Solar panels', 'name' => 'test panel 550', 'unit' => 'Nos', 'gst' => 5, 'rate' => 1]);
chk($d['_code'] === 409 && stripos($d['error'] ?? '', 'already in Solar panels') !== false, 'duplicate name (any case) is 409');
$n = call($acct, 'acc', 'material_save', ['grp' => 'Services and charges', 'name' => 'Test Service', 'unit' => 'Job', 'gst' => 18, 'rate' => 100]);
$nid = (int)($n['id'] ?? 0);
chk($n['_code'] === 200 && $nid > 0, 'material_save adds a material');
call($acct, 'acc', 'material_save', ['id' => $nid, 'grp' => 'Services and charges', 'name' => 'Test Service', 'unit' => 'Job', 'gst' => 18, 'rate' => 150, 'hidden' => 1]);
$hit = find_by(call($acct, 'acc', 'ac_materials'), 'id', $nid);
chk($hit && (float)$hit['rate'] == 150 && (int)$hit['hidden'] === 1, 'material edited and hidden, still listed');
chk(call($sales, 'acc', 'material_delete', ['id' => $nid])['_code'] === 403, 'sales cannot delete materials');
chk(call($acct, 'acc', 'material_delete', ['id' => $nid])['_code'] === 200, 'material_delete ok');
chk(find_by(call($acct, 'acc', 'ac_materials'), 'id', $nid) === null, 'deleted material is gone');

/* bank fields */
call($admin, 'profile', 'page_save', ['customer_id' => $cid, 'page' => 'bank', 'data' => ['loan_bank_email' => 'loans@test.example', 'loan_mgr_name' => 'Test Manager', 'loan_mgr_phone' => '9000000099']]);
$g = call($admin, 'customers', 'get', null, "&id=$cid");
chk(($g['loan_bank_email'] ?? '') === 'loans@test.example' && ($g['loan_mgr_name'] ?? '') === 'Test Manager' && ($g['loan_mgr_phone'] ?? '') === '9000000099', 'admin saves and reads the bank manager fields');
call($eng, 'profile', 'page_save', ['customer_id' => $cid, 'page' => 'bank', 'data' => ['loan_bank_email' => 'hack@test.example', 'loan_mgr_name' => 'Hack', 'loan_mgr_phone' => '1']]);
$g = call($admin, 'customers', 'get', null, "&id=$cid");
chk(($g['loan_bank_email'] ?? '') === 'loans@test.example' && ($g['loan_mgr_name'] ?? '') === 'Test Manager' && ($g['loan_mgr_phone'] ?? '') === '9000000099', 'engineer (no loans write) cannot change them');
$ge = call($eng, 'customers', 'get', null, "&id=$cid");
chk(($ge['loan_mgr_name'] ?? '') === 'Test Manager', 'engineer (loans read) can read them');

/* payment source */
$pay = call($admin, 'payments', 'save', ['project_id' => $pid, 'date' => '2026-11-01', 'amount' => 1000, 'mode' => 'UPI', 'src' => 'bank']);
$pl = call($admin, 'payments', 'list', null, "&project_id=$pid");
$px = find_by($pl, 'id', (int)($pay['id'] ?? -1));
chk($px && ($px['src'] ?? null) === 'bank', 'payment stores src = bank');

echo "\n$pass ok, $fail FAIL\n";
exit($fail ? 1 : 0);
