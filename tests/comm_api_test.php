<?php
// Finance › Commission / Incentive API tests. Usage: php tests/comm_api_test.php http://localhost:8094 <path to crm.sqlite>
// Runs after the other API suites on the same throw-away server (the admin "boss" may already exist).
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/cmjar_' . $name . '_' . getmypid() . '.txt']; }
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
function by_cid($rows, $cid) { foreach ((array)$rows as $r) if ((int)($r['customer_id'] ?? 0) === $cid) return $r; return null; }

echo "Commission / incentive\n";
$anon = actor('anon'); $admin = actor('admin'); $ba = actor('ba'); $sales = actor('sales'); $eng = actor('eng');
$pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$ids = [];
foreach ([['Bina Assoc', 'cmba', 'ba'], ['Sam Seller', 'cmsales', 'sales'], ['Eno Engineer', 'cmeng', 'engineer']] as [$n, $un, $role]) {
  $u = call($admin, 'admin', 'user_save', ['name' => $n, 'username' => $un, 'role' => $role, 'active' => 1, 'can_claim' => 0, 'password' => $pw]);
  $ids[$role] = (int)($u['id'] ?? 0);
}
chk($ids['ba'] && $ids['sales'] && $ids['engineer'], 'BA, sales and engineer users created');
chk(call($ba, 'auth', 'login', ['username' => 'cmba', 'password' => $pw])['_code'] === 200, 'BA signed in');
chk(call($sales, 'auth', 'login', ['username' => 'cmsales', 'password' => $pw])['_code'] === 200, 'sales signed in');
chk(call($eng, 'auth', 'login', ['username' => 'cmeng', 'password' => $pw])['_code'] === 200, 'engineer signed in');

$cBa = (int)(call($ba, 'customers', 'save', ['name' => 'Test Customer One', 'phone' => '9000000001'])['id'] ?? 0);
$cSa = (int)(call($sales, 'customers', 'save', ['name' => 'Test Customer Two', 'phone' => '9000000002'])['id'] ?? 0);
$cAd = (int)(call($admin, 'customers', 'save', ['name' => 'Test Customer Three', 'phone' => '9000000003'])['id'] ?? 0);
chk($cBa && $cSa && $cAd, 'customers added by the BA, sales and the admin');
$p1 = (int)(call($admin, 'projects', 'save', ['customer_id' => $cBa, 'title' => 'Roof 3 kW', 'cost' => 180000, 'stage' => 'New'])['id'] ?? 0);
$p2 = (int)(call($admin, 'projects', 'save', ['customer_id' => $cBa, 'title' => 'Extension', 'cost' => 20000, 'stage' => 'New'])['id'] ?? 0);
call($admin, 'payments', 'save', ['project_id' => $p1, 'date' => '2026-11-01', 'amount' => 50000, 'mode' => 'UPI', 'ref_no' => 'T1']);
call($admin, 'payments', 'save', ['project_id' => $p2, 'date' => '2026-11-02', 'amount' => 5000, 'mode' => 'Cash']);

// admin lists
$L = call($admin, 'comm', 'list', null, '&kind=commission');
$row = by_cid($L['rows'] ?? [], $cBa);
chk($L['_code'] === 200 && ($L['admin'] ?? false) === true && $L['kind'] === 'commission', 'admin: commission list');
chk($row && (int)$row['user_id'] === $ids['ba'] && $row['id'] === 0, 'BA customer listed under its owner, nothing saved yet');
chk($row && abs($row['cost'] - 200000) < 0.01 && abs($row['received'] - 55000) < 0.01, 'project cost and payments received are totals of all projects');
chk(!by_cid($L['rows'], $cSa) && !by_cid($L['rows'], $cAd), 'staff and admin customers are not on the commission list');
$I = call($admin, 'comm', 'list', null, '&kind=incentive');
chk(by_cid($I['rows'] ?? [], $cSa) && !by_cid($I['rows'], $cBa) && !by_cid($I['rows'], $cAd), 'incentive list: the sales customer only');
$people = array_column($L['people'] ?? [], 'kind', 'id');
chk(($people[$ids['ba']] ?? '') === 'commission' && ($people[$ids['sales']] ?? '') === 'incentive' && !in_array('admin', array_column($L['people'], 'role')), 'people: BA = commission, staff = incentive, no admins');
$cand = call($admin, 'comm', 'candidates');
chk(in_array($cAd, array_map('intval', array_column($cand, 'id'))) && !in_array($cBa, array_map('intval', array_column($cand, 'id'))), 'candidates: admin-owned customer only');

// others
$B = call($ba, 'comm', 'list', null, '&kind=incentive');
chk($B['_code'] === 200 && $B['kind'] === 'commission' && ($B['admin'] ?? true) === false && ($B['rows'] ?? null) === [], 'BA: own commission list, empty until shared');
chk(call($ba, 'comm', 'save', ['customer_id' => $cBa, 'amount' => 1])['_code'] === 403, 'BA cannot save');
chk(call($sales, 'comm', 'save', ['customer_id' => $cSa, 'amount' => 1])['_code'] === 403, 'sales cannot save');
chk(call($ba, 'comm', 'candidates')['_code'] === 403, 'BA cannot list candidates');
chk(call($anon, 'comm', 'list')['_code'] === 401, 'anonymous is 401');
chk(call($admin, 'comm', 'save', null, "&customer_id=$cBa")['_code'] === 405, 'save over GET is refused');
$me = call($sales, 'auth', 'status')['user'] ?? [];
chk(in_array('incentive', (array)($me['read'] ?? [])) && !in_array('incentive', (array)($me['write'] ?? [])), 'sales: Incentive view by default, no edit');

// validation
$bad = fn($b) => call($admin, 'comm', 'save', ['customer_id' => $cBa] + $b);
chk($bad(['amount' => 10000, 'p1_amount' => 8000, 'p1_date' => '2026-11-05', 'p2_amount' => 3000, 'p2_date' => '2026-11-06'])['_code'] === 400, 'paid more than the amount is refused');
chk($bad(['amount' => 10000, 'p2_amount' => 3000, 'p2_date' => '2026-11-06'])['_code'] === 400, 'part 2 before part 1 is refused');
chk($bad(['amount' => 10000, 'p1_amount' => 3000])['_code'] === 400, 'part without a date is refused');
chk($bad(['amount' => 10000, 'p1_amount' => 3000, 'p1_date' => '2026-02-30'])['_code'] === 400, 'impossible date is refused');
chk($bad(['amount' => 10000, 'p1_ref' => 'UTR9'])['_code'] === 400, 'transaction ID without an amount is refused');
chk($bad(['amount' => -5])['_code'] === 400, 'negative amount is refused');
chk($bad(['amount' => 'abc'])['_code'] === 400, 'text amount is refused');
chk($bad(['user_id' => 1, 'amount' => 100])['_code'] === 400, 'paying an admin is refused');
chk(call($admin, 'comm', 'save', ['customer_id' => 999999, 'amount' => 1])['_code'] === 404, 'unknown customer is 404');
chk(by_cid(call($admin, 'comm', 'list', null, '&kind=commission')['rows'], $cBa)['id'] === 0, 'refused saves wrote nothing');

// save, share, part payments
$s = call($admin, 'comm', 'save', ['customer_id' => $cBa, 'amount' => '20,000', 'p1_amount' => 10000, 'p1_date' => '2026-11-05', 'p1_ref' => ' UTR123 ', 'note' => 'cash later', 'visible' => 1]);
chk($s['_code'] === 200 && ($s['row']['kind'] ?? '') === 'commission' && $s['row']['amount'] == 20000 && $s['row']['p1_ref'] === 'UTR123' && $s['row']['visible'] === 1, 'admin saves amount, part 1 with transaction ID, visible');
$B = call($ba, 'comm', 'list');
$br = by_cid($B['rows'] ?? [], $cBa);
chk($br && $br['amount'] == 20000 && $br['p1_amount'] == 10000 && $br['p1_ref'] === 'UTR123' && abs($br['received'] - 55000) < 0.01, 'BA sees the shared customer with part 1 and its transaction ID');
chk($br && !array_key_exists('note', $br) && !array_key_exists('user_name', $br) && !array_key_exists('visible', $br), "BA does not get the admin's note or switches");
$s = call($admin, 'comm', 'save', ['customer_id' => $cBa, 'p2_amount' => 10000, 'p2_date' => '2026-11-10', 'p2_ref' => 'UTR456']);
chk($s['_code'] === 200 && $s['row']['p1_ref'] === 'UTR123' && $s['row']['note'] === 'cash later' && $s['row']['p2_ref'] === 'UTR456', 'saving part 2 keeps everything not sent');
$s = call($admin, 'comm', 'save', ['customer_id' => $cBa, 'visible' => 0]);
chk($s['_code'] === 200 && $s['row']['visible'] === 0 && $s['row']['amount'] == 20000, 'visible switch alone keeps the amounts');
chk(call($ba, 'comm', 'list')['rows'] === [], 'hidden again: BA sees nothing');
call($admin, 'comm', 'save', ['customer_id' => $cBa, 'visible' => 1]);

// incentive for staff; menu flag
$s = call($admin, 'comm', 'save', ['customer_id' => $cSa, 'amount' => 5000, 'visible' => 1]);
chk($s['_code'] === 200 && $s['row']['kind'] === 'incentive' && (int)$s['row']['user_id'] === $ids['sales'], 'staff customer saves as incentive for its owner');
$S = call($sales, 'comm', 'list', null, '&kind=commission');
chk($S['kind'] === 'incentive' && count($S['rows']) === 1 && by_cid($S['rows'], $cSa), 'sales sees only their incentive');
chk(call($eng, 'comm', 'list')['rows'] === [], 'engineer sees nothing');

// the person is fixed on the row: reassigning the customer does not move it
$ra = call($admin, 'customers', 'reassign', ['id' => $cBa, 'user_id' => $ids['sales']]);
chk($ra['_code'] === 200, 'customer reassigned to sales');
$row = by_cid(call($admin, 'comm', 'list', null, '&kind=commission')['rows'], $cBa);
chk($row && (int)$row['user_id'] === $ids['ba'], 'commission stays with the BA after the reassignment');
chk(by_cid(call($ba, 'comm', 'list')['rows'], $cBa) !== null, 'BA still sees it');
// admin moves it by hand
$s = call($admin, 'comm', 'save', ['customer_id' => $cBa, 'user_id' => $ids['sales']]);
chk($s['_code'] === 200 && $s['row']['kind'] === 'incentive', 'admin changes the person: row moves to incentive');
chk(by_cid(call($ba, 'comm', 'list')['rows'], $cBa) === null, 'BA no longer sees it');
call($admin, 'comm', 'save', ['customer_id' => $cBa, 'user_id' => $ids['ba']]);

// admin-owned customer added by hand
$s = call($admin, 'comm', 'save', ['customer_id' => $cAd, 'user_id' => $ids['ba'], 'amount' => 3000]);
chk($s['_code'] === 200 && $s['row']['kind'] === 'commission', 'admin-owned customer added to a BA by hand');
chk(!in_array($cAd, array_map('intval', array_column(call($admin, 'comm', 'candidates'), 'id'))), 'it leaves the candidates');

// delete → recycle bin → restore
chk(call($admin, 'customers', 'delete', ['id' => $cAd])['_code'] === 200, 'customer deleted');
chk(by_cid(call($admin, 'comm', 'list', null, '&kind=commission')['rows'], $cAd) === null, 'its commission is gone from the list');
$t = call($admin, 'trash', 'list')['rows'][0] ?? [];
chk(($t['kind'] ?? '') === 'Customer', 'customer is in the Recycle bin');
chk(call($admin, 'trash', 'restore', ['id' => (int)($t['id'] ?? 0)])['_code'] === 200, 'restored');
$row = by_cid(call($admin, 'comm', 'list', null, '&kind=commission')['rows'], $cAd);
chk($row && $row['amount'] == 3000 && (int)$row['user_id'] === $ids['ba'], 'commission comes back with the customer');

// audit stays off the customer timeline
$tl = call($admin, 'profile', 'timeline', null, "&customer_id=$cBa");
$tj = json_encode($tl);
chk($tl['_code'] === 200 && !preg_match('/UTR123|\bcommission\b|\bincentive\b/i', $tj), 'customer timeline shows no commission'); // ("net-meter commissioning" is a pipeline stage)

// Incentive access: View for staff by default; Edit manages staff incentives, never one's own or any commission
$acc = actor('acc');
$accId = (int)(call($admin, 'admin', 'user_save', ['name' => 'Ann Accounts', 'username' => 'cmacc', 'role' => 'accounts', 'active' => 1, 'can_claim' => 0, 'password' => $pw])['id'] ?? 0);
chk($accId && call($acc, 'auth', 'login', ['username' => 'cmacc', 'password' => $pw])['_code'] === 200, 'accounts user signed in');
$A = call($acc, 'comm', 'list', null, '&kind=incentive');
chk($A['_code'] === 200 && $A['manage'] === false && $A['rows'] === [], 'accounts (view only): own incentive list, empty');
chk(call($acc, 'comm', 'save', ['customer_id' => $cSa, 'amount' => 1])['_code'] === 403, 'view only cannot save');
chk(call($acc, 'comm', 'candidates')['_code'] === 403, 'view only cannot list candidates');
$perm = call($admin, 'settings', 'get')['roles_now']; $perm['accounts']['write'][] = 'incentive';
chk(call($admin, 'settings', 'save', ['key' => 'role_perms', 'value' => $perm])['_code'] === 200, 'admin gives Accounts Incentive edit');
$A = call($acc, 'comm', 'list', null, '&kind=incentive');
chk($A['manage'] === true && $A['admin'] === false && by_cid($A['rows'], $cSa) && !by_cid($A['rows'], $cBa), 'manager: whole incentive list, no commission rows');
chk(!in_array('commission', array_column($A['people'], 'kind')), 'manager: only staff to choose from');
$C2 = call($acc, 'comm', 'list', null, '&kind=commission');
chk($C2['manage'] === false && $C2['kind'] === 'incentive', 'manager: no commission list');
$s = call($acc, 'comm', 'save', ['customer_id' => $cSa, 'amount' => 6000, 'p1_amount' => 3000, 'p1_date' => '2026-11-08', 'p1_ref' => 'IMPS77']);
chk($s['_code'] === 200 && $s['row']['amount'] == 6000 && $s['row']['p1_ref'] === 'IMPS77', 'manager records a staff incentive part payment');
chk(call($acc, 'comm', 'save', ['customer_id' => $cBa, 'amount' => 1])['_code'] === 403, 'manager cannot change a BA commission');
chk(call($acc, 'comm', 'save', ['customer_id' => $cSa, 'user_id' => $ids['ba']])['_code'] === 403, 'manager cannot move an incentive to a BA');
$cAc = (int)(call($admin, 'customers', 'save', ['name' => 'Test Customer Four', 'phone' => '9000000004'])['id'] ?? 0);
chk(call($admin, 'comm', 'save', ['customer_id' => $cAc, 'user_id' => $accId, 'amount' => 4000, 'visible' => 1])['_code'] === 200, 'admin gives the accounts user an incentive');
$row = by_cid(call($acc, 'comm', 'list', null, '&kind=incentive')['rows'], $cAc);
chk($row && $row['own'] === 1, 'manager sees their own incentive marked as theirs');
chk(call($acc, 'comm', 'save', ['customer_id' => $cAc, 'amount' => 9000])['_code'] === 403, 'manager cannot change their own incentive');
chk(call($acc, 'comm', 'save', ['customer_id' => $cAc, 'visible' => 0])['_code'] === 403, 'manager cannot hide their own incentive');
chk(call($acc, 'comm', 'save', ['customer_id' => $cSa, 'user_id' => $accId])['_code'] === 403, 'manager cannot give an incentive to themself');
$M = call($acc, 'comm', 'list', null, '&kind=incentive&mine=1');
chk($M['manage'] === false && count($M['rows']) === 1 && by_cid($M['rows'], $cAc), 'manager: Incentive received shows just their own');
chk(call($acc, 'comm', 'candidates')['_code'] === 200, 'manager can add a customer by hand');
$perm['engineer']['read'] = array_values(array_diff($perm['engineer']['read'], ['incentive'])); $perm['engineer']['write'] = array_values(array_diff($perm['engineer']['write'], ['incentive']));
call($admin, 'settings', 'save', ['key' => 'role_perms', 'value' => $perm]);
chk(call($eng, 'comm', 'list')['_code'] === 403, 'engineer without Incentive view: refused');
$st = call($admin, 'settings', 'get');
chk(in_array('incentive', $st['role_never']['ba'] ?? []) && !in_array('incentive', $st['roles_now']['ba']['read']), 'BA: incentive is not for this role');
call($admin, 'settings', 'save', ['key' => 'role_perms', 'value' => []]); // back to defaults
chk(call($acc, 'comm', 'save', ['customer_id' => $cSa, 'amount' => 1])['_code'] === 403, 'defaults again: accounts cannot manage');
chk(call($eng, 'comm', 'list')['_code'] === 200, 'defaults again: engineer sees their own list');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
