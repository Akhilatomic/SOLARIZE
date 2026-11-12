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

/* the price list: {rows, profit_default}; mats() = its rows */
$mats = fn() => call($acct, 'acc', 'ac_materials')['rows'] ?? [];
$mr = call($acct, 'acc', 'ac_materials'); $m = $mr['rows'] ?? [];
chk($mr['_code'] === 200 && count($m) >= 49, 'accounts role sees 49 seeded materials');
chk(($mr['profit_default'] ?? null) !== null && (float)$mr['profit_default'] === 15.0, 'the price list carries the default profit % (15 at first)');
chk(array_key_exists('profit', $m[0] ?? []) && $m[0]['profit'] === null, 'a seeded item has no profit % of its own (blank = the default)');
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
  ['material_id' => $seedId, 'grp' => $m[0]['grp'], 'name' => $m[0]['name'], 'qty' => 1, 'unit' => 'Nos', 'rate' => 50000, 'gst' => 5, 'price_typed' => 1],
  ['grp' => 'Solar panels', 'name' => 'Test Panel 550', 'unit' => 'Nos', 'qty' => 6, 'rate' => 9000, 'gst' => 5],
]]);
chk($cs['_code'] === 200 && count($cs['lines'] ?? []) === 2, 'cost_save returns 2 lines');
chk(($cs['project']['cost'] ?? 0) == 108900 && ($cs['customer']['name'] ?? '') === 'Test Person One', 'cost sheet carries project and customer');
$m2 = $mats();
$tp = find_by($m2, 'name', 'Test Panel 550'); $sd = find_by($m2, 'id', $seedId);
chk($tp && (float)$tp['rate'] == 9000 && $tp['grp'] === 'Solar panels', 'new line was added to materials with its rate');
chk($sd && (float)$sd['rate'] == 50000, 'a dealer price typed on the sheet (price_typed) updates the item');
/* version guard (Review Focus 5): a save with the version the sheet was opened at replaces every line; a save with an older version is 409 and writes nothing */
$v1 = (string)($cs['version'] ?? '');
chk($v1 !== '' && (string)(call($acct, 'acc', 'ac_cost', null, "&project_id=$pid")['version'] ?? '') === $v1, 'ac_cost and cost_save give the same version for the sheet');
$s2 = call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'version' => $v1, 'lines' => [['grp' => 'Solar panels', 'name' => 'Test Panel 550', 'qty' => 4, 'rate' => 9100, 'gst' => 5]]]);
$v2 = (string)($s2['version'] ?? '');
chk($s2['_code'] === 200 && $v2 !== '' && $v2 !== $v1, 'a save with the fresh version is accepted and gives a new version (same second)');
$st = call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'version' => $v1, 'lines' => [['grp' => 'Solar panels', 'name' => 'Stale Only Panel', 'qty' => 9, 'rate' => 1, 'gst' => 5], ['grp' => 'Solar panels', 'name' => 'Test Panel 550', 'qty' => 7, 'rate' => 1, 'gst' => 5]]]);
chk($st['_code'] === 409 && ($st['error'] ?? '') === 'This Expense sheet was changed since you opened it — reload to see the latest', 'a save with a stale version is 409 with the reload message');
$g = call($acct, 'acc', 'ac_cost', null, "&project_id=$pid");
chk($g['_code'] === 200 && count($g['lines']) === 1 && (float)$g['lines'][0]['qty'] == 4 && (string)$g['version'] === $v2, 'the stale save wrote nothing: the fresh save replaced all lines (1 line) and stays');
chk(find_by($mats(), 'name', 'Stale Only Panel') === null, 'the stale save added no material');
$s3 = call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'lines' => [['grp' => 'Solar panels', 'name' => 'Test Panel 550', 'qty' => 4, 'rate' => 9100, 'gst' => 5]]]);
chk($s3['_code'] === 200 && (string)$s3['version'] !== $v2, 'a save with no version (older page) is still accepted and moves the version on');
$cnt = 0; foreach ($mats() as $x) if (is_array($x) && ($x['name'] ?? '') === 'Test Panel 550') $cnt++;
chk($cnt === 1, 'no duplicate material created on re-save');
chk(call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'lines' => [['grp' => 'Solar panels', 'name' => 'X', 'qty' => 1, 'rate' => -5, 'gst' => 5]]])['_code'] === 400, 'negative rate refused');
chk(call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'lines' => [['grp' => 'Solar panels', 'name' => 'X', 'qty' => 1, 'rate' => 5, 'gst' => 7]]])['_code'] === 400, 'bad GST refused');
chk(call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'lines' => [['grp' => 'Solar panels', 'name' => '', 'qty' => 1, 'rate' => 5, 'gst' => 5]]])['_code'] === 400, 'blank name refused');
chk(count(call($acct, 'acc', 'ac_cost', null, "&project_id=$pid")['lines']) === 1, 'failed saves left the lines alone');
chk(call($sales, 'acc', 'cost_save', ['project_id' => $pid, 'lines' => []])['_code'] === 403, 'sales cannot save a cost sheet');
chk(call($acct, 'acc', 'ac_cost', null, '&project_id=999999')['_code'] === 404, 'unknown project is 404');
/* the material list PDF's customer / project blocks */
$cidM = (int)(call($admin, 'customers', 'save', ['name' => 'Test Person Ml', 'phone' => '9000000002', 'phase' => 'Three phase'])['id'] ?? 0);
$pidM = (int)(call($admin, 'projects', 'save', ['customer_id' => $cidM, 'title' => 'Roof 10 kW', 'kw' => 10, 'cost' => 500000, 'engineer' => 'Test Engineer', 'start' => '2026-11-20', 'panel' => 'Test Panel 600', 'inverter' => 'Test Inverter 10'])['id'] ?? 0);
$gm = call($acct, 'acc', 'ac_cost', null, "&project_id=$pidM");
chk($gm['_code'] === 200 && ($gm['project']['engineer'] ?? '') === 'Test Engineer' && ($gm['project']['start'] ?? '') === '2026-11-20' && ($gm['project']['panel'] ?? '') === 'Test Panel 600'
  && ($gm['project']['inverter'] ?? '') === 'Test Inverter 10' && ($gm['customer']['phase'] ?? '') === 'Three phase', 'ac_cost carries engineer, start, panel, inverter and phase');
chk(isset($gm['company']['name'], $gm['company']['gstin']) && !isset($gm['company']['bank']), 'ac_cost carries the company header (no bank details)');

$d = call($acct, 'acc', 'material_save', ['grp' => 'Solar panels', 'name' => 'test panel 550', 'unit' => 'Nos', 'gst' => 5, 'rate' => 1]);
chk($d['_code'] === 409 && stripos($d['error'] ?? '', 'already in Solar panels') !== false, 'duplicate name (any case) is 409');
$n = call($acct, 'acc', 'material_save', ['grp' => 'Services and charges', 'name' => 'Test Service', 'unit' => 'Job', 'gst' => 18, 'rate' => 100]);
$nid = (int)($n['id'] ?? 0);
chk($n['_code'] === 200 && $nid > 0, 'material_save adds a material');
call($acct, 'acc', 'material_save', ['id' => $nid, 'grp' => 'Services and charges', 'name' => 'Test Service', 'unit' => 'Job', 'gst' => 18, 'rate' => 150, 'hidden' => 1]);
$hit = find_by($mats(), 'id', $nid);
chk($hit && (float)$hit['rate'] == 150 && (int)$hit['hidden'] === 1, 'material edited and hidden, still listed');
$svcLine = ['material_id' => $nid, 'grp' => 'Services and charges', 'name' => 'Test Service', 'qty' => 1, 'unit' => 'Job', 'rate' => 150, 'gst' => 18];
call($acct, 'acc', 'cost_save', ['project_id' => $pidM, 'lines' => [$svcLine]]);
chk(call($sales, 'acc', 'material_delete', ['id' => $nid])['_code'] === 403, 'sales cannot delete materials');
chk(call($acct, 'acc', 'material_delete', ['id' => $nid])['_code'] === 200, 'material_delete ok');
chk(find_by($mats(), 'id', $nid) === null, 'deleted material is gone');
/* a cost line of a deleted material keeps its name and never brings the material back, however often the sheet is saved */
call($acct, 'acc', 'cost_save', ['project_id' => $pidM, 'lines' => [$svcLine]]);
$sv2 = call($acct, 'acc', 'cost_save', ['project_id' => $pidM, 'lines' => (call($acct, 'acc', 'ac_cost', null, "&project_id=$pidM")['lines'] ?? [])]);
chk($sv2['_code'] === 200 && count($sv2['lines']) === 1 && $sv2['lines'][0]['name'] === 'Test Service' && find_by($mats(), 'name', 'Test Service') === null, 'saving a line of a deleted material (twice) keeps the line and creates no material');

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
/* src is always stored as exactly 'bank' or 'customer' */
$srcIds = [];
foreach ([['Bank', 'bank'], ['someone', 'customer'], ['', 'customer'], [null, 'customer']] as [$in, $want]) {
  $b = ['project_id' => $pid, 'date' => '2026-11-01', 'amount' => 10, 'mode' => 'UPI']; if ($in !== null) $b['src'] = $in;
  $sid = (int)(call($admin, 'payments', 'save', $b)['id'] ?? 0); $srcIds[] = $sid;
  $sx = find_by(call($admin, 'payments', 'list', null, "&project_id=$pid"), 'id', $sid);
  chk($sx && $sx['src'] === $want, 'payments/save with src ' . var_export($in, true) . " stores '$want'");
}
call($admin, 'payments', 'save', ['id' => $srcIds[0], 'project_id' => $pid, 'date' => '2026-11-01', 'amount' => 10, 'mode' => 'UPI', 'src' => 'nonsense']);
chk((find_by(call($admin, 'payments', 'list', null, "&project_id=$pid"), 'id', $srcIds[0])['src'] ?? '') === 'customer', 'editing a payment normalises src too');
foreach ($srcIds as $sid) call($admin, 'payments', 'delete', ['id' => $sid]);

/* ---- pending, received, profit, expenses, overview ---- */
echo "Accounts: money lists\n";
$dbPath = $argv[2] ?? '';
$setStage = function ($pid, $stage) use ($dbPath) { $pdo = new PDO("sqlite:" . $dbPath); $pdo->prepare("UPDATE projects SET stage=? WHERE id=?")->execute([$stage, $pid]); };
$mkc = function ($name, $phone, $stage, $cost, $kw = 3) use ($admin, $setStage) {
  $cid = (int)(call($admin, 'customers', 'save', ['name' => $name, 'phone' => $phone])['id'] ?? 0);
  $pid = (int)(call($admin, 'projects', 'save', ['customer_id' => $cid, 'title' => "$name plant", 'kw' => $kw, 'cost' => $cost, 'stage' => $stage])['id'] ?? 0);
  $setStage($pid, $stage);
  return [$cid, $pid];
};
$pay = fn($pid, $amt, $date = '2026-11-05', $src = '') => call($admin, 'payments', 'save', ['project_id' => $pid, 'date' => $date, 'amount' => $amt, 'mode' => 'UPI', 'ref_no' => 'T' . $amt, 'src' => $src]);
[$cidA, $pidA] = $mkc('Pend Alpha', '9000000011', 'Electrical installation', 200000);
$pay($pidA, 50000); $pay($pidA, 30000, '2026-11-06', 'bank');
[$cidB, $pidB] = $mkc('Pend Beta', '9000000012', 'Customer', 100000);
[$cidC, $pidC] = $mkc('Pend Gamma', '9000000013', 'Electrical installation', 1000);
$pay($pidC, 1500);
$pp = call($acct, 'acc', 'ac_pending');
$ra = find_by($pp['rows'] ?? [], 'id', $pidA);
chk($pp['_code'] === 200 && $ra && (float)$ra['due'] == 120000 && (float)$ra['paid'] == 80000 && $ra['customer'] === 'Pend Alpha' && $ra['last_pay'] === '2026-11-06' && $ra['last_remind'] === null && $ra['early'] == 0, 'ac_pending: project A due 120000 with paid, last_pay, no last_remind');
chk(find_by($pp['rows'], 'id', $pidB) === null, 'ac_pending: early-stage project hidden by default');
chk(find_by($pp['rows'], 'id', $pidC) === null, 'ac_pending: overpaid project absent');
$dues = array_column($pp['rows'], 'due'); $sorted = $dues; rsort($sorted);
chk($dues === $sorted, 'ac_pending ordered by due DESC');
$pe = call($acct, 'acc', 'ac_pending', null, '&early=1');
$rb = find_by($pe['rows'] ?? [], 'id', $pidB);
chk($rb && (float)$rb['due'] == 100000 && $rb['early'] == 1 && find_by($pe['rows'], 'id', $pidA)['early'] == 0, 'ac_pending early=1 lists project B flagged early');
$dash = call($admin, 'dashboard', 'get');
$da = find_by($dash['dues'] ?? [], 'id', $pidA);
chk($da && (float)$da['due'] == 120000 && $da['customer'] === 'Pend Alpha' && $da['title'] === 'Pend Alpha plant' && find_by($dash['dues'], 'id', $pidB) === null && find_by($dash['dues'], 'id', $pidC) === null, 'dashboard dues share the pending rows (same shape)');

/* two projects, payment on the older one */
$cidD = (int)(call($admin, 'customers', 'save', ['name' => 'Pend Delta', 'phone' => '9000000014'])['id'] ?? 0);
$pidD1 = (int)(call($admin, 'projects', 'save', ['customer_id' => $cidD, 'title' => 'Delta old', 'cost' => 50000, 'stage' => 'Electrical installation'])['id'] ?? 0);
$pidD2 = (int)(call($admin, 'projects', 'save', ['customer_id' => $cidD, 'title' => 'Delta new', 'cost' => 70000, 'stage' => 'Electrical installation'])['id'] ?? 0);
$setStage($pidD1, "Electrical installation"); $setStage($pidD2, "Electrical installation");
$pay($pidD1, 20000, '2026-11-07');
$rc = call($acct, 'acc', 'ac_received', null, '&period=2026-11');
$rd = null; foreach ($rc['rows'] ?? [] as $x) if ((int)$x['customer_id'] === $cidD) $rd = $x;
chk($rc['_code'] === 200 && $rd && (int)$rd['project_id'] === $pidD1 && (float)$rd['amount'] == 20000 && $rd['customer'] === 'Pend Delta', 'ac_received keeps the payment on its own (older) project');
$ra2 = null; foreach ($rc['rows'] as $x) if ((float)$x['amount'] == 30000 && (int)$x['customer_id'] === $cidA) $ra2 = $x;
chk($ra2 && $ra2['src'] === 'bank' && is_array($ra2['shared']) && $ra2['mode'] === 'UPI', 'ac_received row carries src and shared[]');
$dts = array_column($rc['rows'], 'date'); $ds = $dts; rsort($ds);
chk($dts === $ds && abs($rc['total'] - array_sum(array_column($rc['rows'], 'amount'))) < 0.01, 'ac_received newest first with total');
chk(count(call($acct, 'acc', 'ac_received', null, '&period=2026-10')['rows']) === 0, 'ac_received: other month empty');
chk(count(call($acct, 'acc', 'ac_received', null, '&period=fy-26-27')['rows']) === count($rc['rows']), 'ac_received: financial year covers the month');
chk(count(call($acct, 'acc', 'ac_received', null, '&period=fy-25-26')['rows']) === 0, 'ac_received: previous financial year empty');

/* profit */
[$cidE, $pidE] = $mkc('Prof Echo', '9000000015', 'Electrical installation', 108900, 5);
if ($dbPath) { $pdo = new PDO('sqlite:' . $dbPath); $pdo->exec("INSERT INTO commissions(customer_id,user_id,amount) VALUES($cidE,1,5000)"); $pdo = null; }
call($acct, 'acc', 'cost_save', ['project_id' => $pidE, 'lines' => [['grp' => 'Solar panels', 'name' => 'Prof Panel', 'qty' => 6, 'rate' => 10000, 'gst' => 0]]]);
call($admin, 'gen', 'save', ['kind' => 'tax', 'early' => 1, 'customer_id' => $cidE, 'issued_on' => '2026-11-10', 'number' => 'T3-001', 'data' => ['taxable' => 100000, 'grand' => 108900]]);
[$cidF, $pidF] = $mkc('Prof Foxtrot', '9000000016', 'Electrical installation', 54450, 3);
call($admin, 'gen', 'save', ['kind' => 'tax', 'early' => 1, 'customer_id' => $cidF, 'issued_on' => '2026-11-11', 'number' => 'T3-002', 'data' => ['grand' => 54450]]);
$pf = call($acct, 'acc', 'ac_profit', null, '&period=2026-11');
$re = find_by($pf['rows'] ?? [], 'project_id', $pidE);
$cm = $dbPath ? 5000 : 0;
chk($pf['_code'] === 200 && $re && (float)$re['before'] == 100000 && (float)$re['cost'] == 60000 && (float)$re['comm'] == $cm && (float)$re['profit'] == 40000 - $cm && $re['bill_no'] === 'T3-001' && $re['bill_on'] === '2026-11-10' && (int)$re['lines'] === 1, 'ac_profit: before 100000 - cost 60000 - comm');
$nc = find_by($pf['no_cost'] ?? [], 'project_id', $pidF);
chk($nc && $nc['bill_no'] === 'T3-002' && find_by($pf['rows'], 'project_id', $pidF) === null, 'ac_profit: billed project with no lines goes to no_cost');
chk((float)$pf['counted']['profit'] == 40000 - $cm && (float)$pf['counted']['before'] == 100000 && (float)$pf['counted']['cost'] == 60000, 'ac_profit: counted excludes no_cost projects');
chk(count(call($acct, 'acc', 'ac_profit', null, '&period=2026-10')['rows']) === 0, 'ac_profit: bill outside period not counted');

/* profit: price / 1.089 fallback (bill without taxable) and unpriced lines (own period so the November totals stay put) */
[$cidG, $pidG] = $mkc('Prof Golf', '9000000017', 'Electrical installation', 108900, 3);
call($acct, 'acc', 'cost_save', ['project_id' => $pidG, 'lines' => [['grp' => 'Solar panels', 'name' => 'Golf Panel', 'qty' => 1, 'rate' => 50000, 'gst' => 0]]]);
call($admin, 'gen', 'save', ['kind' => 'tax', 'early' => 1, 'customer_id' => $cidG, 'issued_on' => '2026-09-10', 'number' => 'T3-003', 'data' => ['grand' => 108900]]);
[$cidH, $pidH] = $mkc('Prof Hotel', '9000000018', 'Electrical installation', 80000, 3);
call($acct, 'acc', 'cost_save', ['project_id' => $pidH, 'lines' => [['grp' => 'Solar panels', 'name' => 'Hotel Panel', 'qty' => 1, 'rate' => 10000, 'gst' => 0], ['grp' => 'Solar panels', 'name' => 'Hotel Unpriced', 'qty' => 2, 'rate' => 0, 'gst' => 0]]]);
call($admin, 'gen', 'save', ['kind' => 'tax', 'early' => 1, 'customer_id' => $cidH, 'issued_on' => '2026-09-11', 'number' => 'T3-004', 'data' => ['taxable' => 50000, 'grand' => 54450]]);
$ps = call($acct, 'acc', 'ac_profit', null, '&period=2026-09');
$rg = find_by($ps['rows'] ?? [], 'project_id', $pidG); $rh = find_by($ps['rows'] ?? [], 'project_id', $pidH);
chk($rg && (float)$rg['before'] == round(108900 / 1.089, 2) && (float)$rg['cost'] == 50000 && (float)$rg['profit'] == 50000 && (int)$rg['missing'] === 0, 'ac_profit: no taxable on the bill falls back to price / 1.089');
chk($rh && (int)$rh['missing'] === 1 && (int)$rh['lines'] === 2 && (float)$rh['profit'] == 40000 && find_by($ps['no_cost'], 'project_id', $pidH) === null, 'ac_profit: a qty>0 rate 0 line is flagged missing and the project is still counted');
chk((float)$ps['counted']['profit'] == 90000 && (float)$ps['counted']['before'] == 150000 && (float)$ps['counted']['cost'] == 60000, 'ac_profit: counted sums both projects');

/* expenses */
chk(call($acct, 'acc', 'ac_expenses', null, '&period=2026-11')['cats'] === ['Ads', 'AI tools', 'Other'], 'ac_expenses: default categories');
$e1 = call($acct, 'acc', 'expense_save', ['date' => '2026-11-08', 'cat' => 'AI tools', 'amount' => 1180, 'gst' => 18, 'paid_to' => 'Test AI Co', 'mode' => 'UPI', 'note' => 'plan']);
chk($e1['_code'] === 200 && ($e1['id'] ?? 0) > 0, 'expense_save adds an expense');
chk(call($acct, 'acc', 'expense_save', ['date' => '2026-11-08', 'cat' => 'Nope', 'amount' => 10, 'gst' => 0])['_code'] === 400, 'expense_save: unknown category refused');
chk(call($acct, 'acc', 'expense_save', ['date' => '2026-11-08', 'cat' => 'Other', 'amount' => 10, 'gst' => 7])['_code'] === 400, 'expense_save: bad GST refused');
chk(call($acct, 'acc', 'expense_save', ['date' => '08-11-2026', 'cat' => 'Other', 'amount' => 10, 'gst' => 0])['_code'] === 400, 'expense_save: bad date refused');
chk(call($sales, 'acc', 'expense_save', ['date' => '2026-11-08', 'cat' => 'Other', 'amount' => 10, 'gst' => 0])['_code'] === 403, 'sales cannot save an expense');
call($admin, 'ads', 'import', ['rows' => [['campaign' => 'Test Camp T3', 'date' => '2026-11-09', 'spend' => 5000]]]);
$ex = call($acct, 'acc', 'ac_expenses', null, '&period=2026-11');
chk(count($ex['rows']) === 1 && $ex['rows'][0]['cat'] === 'AI tools' && $ex['ads'] == [['month' => '2026-11', 'spend' => 5000]], 'ac_expenses: rows and campaign spend by month');
$ov = call($acct, 'acc', 'ac_overview', null, '&period=2026-11');
chk($ov['_code'] === 200 && (float)$ov['expenses']['ai'] == 1000 && (float)$ov['expenses']['ads'] == 5000 && (float)$ov['expenses']['total'] == 6000 && (float)$ov['expenses']['other'] == 0, 'ac_overview: AI 1000, ads 5000, total 6000');
chk((float)$ov['profit'] == 40000 - $cm - 6000, 'ac_overview: profit = counted profit - expenses');
chk(($ov['no_cost_n'] ?? null) === 1 && ($ov['profit_n'] ?? null) === 1, 'ac_overview: 1 billed project counted, 1 billed without cost (left out of the profit)');
$pp = call($acct, "acc", "ac_pending");
chk((float)$ov['received'] == (float)$rc['total'] && $ov['received_n'] === count($rc['rows']) && $ov["pending_n"] === count($pp["rows"]) && count($ov['top']) <= 10 && abs($ov['pending'] - array_sum(array_column($pp['rows'], 'due'))) < 0.01, 'ac_overview: received and pending match the lists');
chk(call($acct, 'acc', 'cats_save', ['cats' => ['Ads', 'AI tools', 'Rent']])['_code'] === 403, 'cats_save is admin only');
chk(call($admin, 'acc', 'cats_save', ['cats' => ['Ads', 'AI tools', 'Rent', 'Rent', ' ']])['cats'] === ['Ads', 'AI tools', 'Rent'], 'cats_save (admin) cleans the list');
chk(call($acct, 'acc', 'expense_save', ['date' => '2026-11-12', 'cat' => 'Rent', 'amount' => 500, 'gst' => 0])['_code'] === 200, 'new category usable');
/* paise: the server rounds each cost line and each expense like the screens do (ACC.lineAmount / ACC.exBefore) */
foreach (['07-01', '07-02', '07-03'] as $dd) call($acct, 'acc', 'expense_save', ['date' => "2026-$dd", 'cat' => 'Rent', 'amount' => 10, 'gst' => 18]);
$ovJ = call($acct, 'acc', 'ac_overview', null, '&period=2026-07');
chk((float)$ovJ['expenses']['other'] == 25.41 && (float)$ovJ['expenses']['total'] == 25.41, 'ac_overview: expenses before GST are rounded per entry (3 × 8.47 = 25.41, not 25.42)');
[$cidK, $pidK] = $mkc('Round Kilo', '9000000019', 'Electrical installation', 10000, 1);
call($acct, 'acc', 'cost_save', ['project_id' => $pidK, 'lines' => array_map(fn($n) => ['grp' => 'DC cables & connectors', 'name' => "Round Wire $n", 'qty' => 1.25, 'unit' => 'm', 'rate' => 0.33, 'gst' => 18], ['A', 'B', 'C'])]);
call($admin, 'gen', 'save', ['kind' => 'tax', 'early' => 1, 'customer_id' => $cidK, 'issued_on' => '2026-08-10', 'number' => 'T3-005', 'data' => ['taxable' => 1000, 'grand' => 1089]]);
$pk = find_by(call($acct, 'acc', 'ac_profit', null, '&period=2026-08')['rows'] ?? [], 'project_id', $pidK);
chk($pk && (float)$pk['cost'] == 1.23 && (float)$pk['profit'] == 998.77, 'ac_profit: cost is the sum of the lines rounded to paise (3 × 0.41 = 1.23, not 1.24)');
$ov2 = call($acct, 'acc', 'ac_overview', null, '&period=2026-11');
chk((float)$ov2['expenses']['other'] == 500, 'ac_overview: other categories counted under other');
chk(call($acct, 'acc', 'expense_delete', ['id' => $e1['id']])['_code'] === 200 && count(call($acct, 'acc', 'ac_expenses', null, '&period=2026-11')['rows']) === 1, 'expense_delete removes it');
foreach (['ac_overview', 'ac_pending', 'ac_received', 'ac_profit', 'ac_expenses'] as $act) {
  chk(call($sales, 'acc', $act)['_code'] === 403 && call($ba, 'acc', $act)['_code'] === 403, "sales and ba get 403 on $act");
}

/* ---- tax bill lock, receipts data, share log, templates ---- */
echo "Accounts: tax bill lock, receipts, log, templates\n";
$dbq = function ($sql, $args = []) use ($dbPath) { $pdo = new PDO('sqlite:' . $dbPath); $st = $pdo->prepare($sql); $st->execute($args); return $st; };
$taxSave = fn($who, $cid, $extra = []) => call($who, 'gen', 'save', array_merge(['kind' => 'tax', 'customer_id' => $cid, 'issued_on' => '2026-11-12', 'data' => ['grand' => 100000, 'taxable' => 91827]], $extra));
$lockOf = fn($cid) => call($admin, 'gen', 'get', null, "&kind=tax&customer_id=$cid")['lock'] ?? null;
$hasBill = fn($cid) => (bool)$dbq("SELECT 1 FROM gen_docs WHERE customer_id=? AND kind='tax'", [$cid])->fetch();
[$cidL, $pidL] = $mkc('Lock India', '9000000021', 'Electrical installation', 100000);
$pay($pidL, 60000, '2026-11-02');
$lk = $lockOf($cidL);
chk($lk && $lk['locked'] === true && $lk['why'] === 'due' && (float)$lk['due'] == 40000 && $lk['msg'] === '₹40,000 still due', 'lock: non-loan with 40000 due is locked');
$r = $taxSave($admin, $cidL);
chk($r['_code'] === 409 && ($r['error'] ?? '') === '₹40,000 still due' && !$hasBill($cidL), 'gen/save tax is 409 while locked and creates no bill');
/* the engineer role gets Finance (read) and keeps Customers (write), so it passes gen/save's own gates and only the lock stands in the way; Loans (read) is taken away to test the bank fields */
$dbq("INSERT OR REPLACE INTO settings(k,v) VALUES('role_perms', ?)", [json_encode(["engineer" => ["read" => ["dashboard", "customers", "projects", "payments", "finance", "files", "settings"], "write" => ["projects", "files", "customers"]]])]);
$r = $taxSave($eng, $cidL, ["early" => 1]);
chk($r["_code"] === 409 && ($r["error"] ?? "") === "₹40,000 still due" && !$hasBill($cidL), "a non-admin early:1 gets 409 with the lock message and creates no bill");
$r = $taxSave($acct, $cidL, ["early" => 1]);
chk(in_array($r["_code"], [403, 409], true) && !$hasBill($cidL), "accounts role early:1 refused, no bill");
$r = $taxSave($admin, $cidL, ['early' => 1]);
chk($r['_code'] === 200 && $hasBill($cidL) && $dbq("SELECT COUNT(*) FROM audit_log WHERE action='tax_bill_early' AND entity_id=?", [$cidL])->fetchColumn() == 1, 'admin early:1 issues the bill and audits tax_bill_early');
$pay2 = $pay($pidL, 40000, '2026-11-03');
call($admin, 'payments', 'delete', ['id' => (int)($pay2['id'] ?? 0)]);
$r = $taxSave($admin, $cidL, ['data' => ['grand' => 100000, 'taxable' => 91800]]);
chk($r['_code'] === 200, 'an issued bill can still be edited while money is due');
[$cidM, $pidM] = $mkc('Lock Mike', '9000000022', 'Electrical installation', 50000);
$pay($pidM, 50000);
$lk = $lockOf($cidM);
chk($lk && $lk['locked'] === false && $lk['why'] === 'paid', 'lock: fully paid is unlocked (paid)');
chk($taxSave($admin, $cidM)['_code'] === 200, 'gen/save tax allowed when fully paid');
$mkl = function ($name, $phone, $cost, $loanAmt) use ($mkc, $dbq) {
  [$c, $p] = $mkc($name, $phone, 'Electrical installation', $cost);
  $dbq("UPDATE projects SET loan='Yes' WHERE id=?", [$p]); $dbq('UPDATE customers SET loan_amount=? WHERE id=?', [$loanAmt, $c]);
  return [$c, $p];
};
[$cidN, $pidN] = $mkl('Lock November', '9000000023', 300000, '270000');
$pay($pidN, 30000, '2026-11-04', 'customer');
$lk = $lockOf($cidN);
chk($lk && $lk['locked'] === false && $lk['why'] === 'bank_left' && $lk['msg'] === "Only the bank's part is left (₹2,70,000)", 'lock: loan, customer share paid -> unlocked bank_left (Indian grouping)');
chk($taxSave($admin, $cidN)['_code'] === 200, 'gen/save tax allowed when only the bank part is left');
[$cidO, $pidO] = $mkl('Lock Oscar', '9000000024', 300000, '270000');
$pay($pidO, 20000, '2026-11-04', 'customer'); $pay($pidO, 50000, '2026-11-05', 'bank');
$lk = $lockOf($cidO);
chk($lk && $lk['locked'] === true && $lk['why'] === 'due' && $lk['msg'] === '₹10,000 still due from the customer', 'lock: loan, customer paid 20000 of 30000 -> locked (bank money does not count)');
$gO = call($admin, 'gen', 'get', null, "&kind=tax&customer_id=$cidO");
chk(($gO['project']['loan'] ?? '') === 'Yes' && array_column($gO['acct']['payments'] ?? [], 'src') === ['customer', 'bank'], 'gen/get tax: project loan flag and each payment\'s src (for the Tax bill tab)');
[$cidP, $pidP] = $mkl('Lock Papa', '9000000025', 300000, '');
$lk = $lockOf($cidP);
chk($lk && $lk['locked'] === true && $lk['why'] === 'loan_amount' && $lk['msg'] === 'Enter the loan amount on the Bank & loan page', 'lock: loan with blank loan amount is locked (loan_amount)');
[$cidQ, $pidQ] = $mkl('Lock Quebec', '9000000026', 300000, '400000');
$lk = $lockOf($cidQ);
chk($lk && $lk['locked'] === false && $lk['why'] === 'bank_left', 'lock: loan larger than cost -> share 0 -> unlocked');
/* pending rows: on a loan project the reminder asks only for the customer's part (same rule as the lock) */
$pe = call($acct, 'acc', 'ac_pending')['rows'] ?? [];
$rN = find_by($pe, 'id', $pidN); $rO = find_by($pe, 'id', $pidO); $rP = find_by($pe, 'id', $pidP); $rQ = find_by($pe, 'id', $pidQ); $rA = find_by($pe, 'id', $pidA);
chk($rN && (float)$rN['due'] == 270000 && (float)$rN['cust_due'] == 0 && $rN['bank_only'] === true, "ac_pending: loan, customer's share paid -> cust_due 0, bank's part only");
chk($rO && (float)$rO['due'] == 230000 && (float)$rO['cust_due'] == 10000 && $rO['bank_only'] === false, 'ac_pending: loan, customer paid 20000 of 30000 (bank money not counted) -> cust_due 10000');
chk($rP && (float)$rP['cust_due'] == (float)$rP['due'] && (float)$rP['due'] == 300000 && $rP['bank_only'] === false, 'ac_pending: loan with blank loan amount -> cust_due is the whole due');
chk($rQ && (float)$rQ['cust_due'] == 0 && $rQ['bank_only'] === true, "ac_pending: loan larger than the price -> share 0 -> bank's part only");
chk($rA && (float)$rA['cust_due'] == (float)$rA['due'] && $rA['bank_only'] === false, 'ac_pending: not a loan -> cust_due is the due');
/* v42 backfill: Loan-mode payments with no source on loan projects become bank payments (once; the WHERE keeps it idempotent) */
[$cidS, $pidS] = $mkl('Fill Sierra', '9000000028', 200000, '150000');
[$cidT, $pidT] = $mkc('Fill Tango', '9000000029', 'Electrical installation', 200000);
foreach ([[$pidS, 'Loan', null, 'fill-a'], [$pidS, 'Loan', '', 'fill-b'], [$pidS, 'UPI', null, 'fill-c'], [$pidS, 'Loan', 'customer', 'fill-d'], [$pidT, 'Loan', null, 'fill-e']] as [$fp, $fm, $fs, $fn])
  $dbq('INSERT INTO payments(project_id,date,amount,mode,src,note) VALUES(?,?,?,?,?,?)', [$fp, '2026-10-20', 100, $fm, $fs, $fn]);
$dbq('PRAGMA user_version=41');
call($acct, 'acc', 'ac_tpl'); /* the next request upgrades the database again */
$fill = []; foreach ($dbq("SELECT note, src FROM payments WHERE note LIKE 'fill-%'")->fetchAll(PDO::FETCH_ASSOC) as $x) $fill[$x['note']] = $x['src'];
chk($dbq('PRAGMA user_version')->fetchColumn() == 44 &&($fill['fill-a'] ?? '') === 'bank' && ($fill['fill-b'] ?? '') === 'bank', 'backfill: Loan-mode payments with no source on a loan project are now bank');
chk(array_key_exists('fill-c', $fill) && $fill['fill-c'] === null && ($fill['fill-d'] ?? '') === 'customer' && array_key_exists('fill-e', $fill) && $fill['fill-e'] === null,'backfill: other modes, a set source and non-loan projects are left alone');
$ixs = $dbq("SELECT name FROM sqlite_master WHERE type='index'")->fetchAll(PDO::FETCH_COLUMN);
chk(!array_diff(['pay_date', 'spend_date', 'accl_kind'], $ixs), 'indexes on payments(date), ad_spend(date), acc_log(kind, project_id)');

/* receipt data */
[$cidR, $pidR] = $mkc('Rcpt Romeo', '9000000027', 'Electrical installation', 100000, 4);
$chq = call($admin, 'payments', 'save', ['project_id' => $pidR, 'date' => '2026-11-06', 'amount' => 25000, 'mode' => 'Cheque', 'src' => 'customer']);
$chqId = (int)($chq['id'] ?? 0);
chk($chqId > 0 && call($admin, "acc", "ac_receipt", null, "&payment_id=$chqId")["payment"]["receipt_no"] === "", "ac_receipt (GET) on a fresh payment shows an empty receipt number and does not issue one");
chk(call($acct, "acc", "receipt_no", ["payment_id" => $chqId])["_code"] === 422, "receipt_no: cheque without a reference is 422");
chk(call($acct, "acc", "receipt_no", [])["_code"] === 404, "receipt_no: no payment is 404");
chk(call($sales, "acc", "ac_receipt", null, "&payment_id=$chqId")["_code"] === 403, "ac_receipt: a Payments role without Finance (sales) is 403");
chk(call($sales, "acc", "receipt_no", ["payment_id" => $chqId])["_code"] === 403, "receipt_no: payments read-only role is 403");
chk(call($eng, "acc", "receipt_no", ["payment_id" => $chqId])["_code"] === 403, "receipt_no: engineer (payments read, no write) is 403");
chk(call($acct, "acc", "receipt_no", null, "&payment_id=$chqId")["_code"] === 405,"receipt_no is not GET-whitelisted");
call($admin, 'payments', 'save', ['id' => $chqId, 'project_id' => $pidR, 'date' => '2026-11-06', 'amount' => 25000, 'mode' => 'Cheque', 'ref_no' => 'CHQ0001', 'src' => 'customer']);
$n1 = call($acct, "acc", "receipt_no", ["payment_id" => $chqId]);
chk($n1["_code"] === 200 && preg_match("#/RCPT/\d\d-\d\d/\d+$#", $n1["receipt_no"] ?? "") === 1, "receipt_no (POST): cheque with a reference gets a receipt number");
$n2 = call($acct, "acc", "receipt_no", ["payment_id" => $chqId]);
chk(($n2["receipt_no"] ?? "x") === ($n1["receipt_no"] ?? "y"), "receipt_no: second call returns the same number");
$rc1 = call($acct, "acc", "ac_receipt", null, "&payment_id=$chqId");
chk($rc1["_code"] === 200 && ($rc1["payment"]["receipt_no"] ?? "") === $n1["receipt_no"], "ac_receipt (GET) afterwards shows the stored number");
$rce = call($eng, "acc", "ac_receipt", null, "&payment_id=$chqId");
chk($rce["_code"] === 200 && !array_key_exists("loan_bank_email", $rce["customer"]) && !array_key_exists("jansamarth_id", $rce["customer"]), "ac_receipt: a role without Loans gets no bank fields");
chk(($rc1['project']['id'] ?? 0) == $pidR && ($rc1['customer']['name'] ?? '') === 'Rcpt Romeo' && count($rc1['payments'] ?? []) === 1 && array_key_exists('bill', $rc1) && $rc1['bill'] === null && !empty($rc1['company']['gstin']) && array_key_exists('loan_bank_email', $rc1['customer']), 'ac_receipt: project, customer with bank fields, payments, bill null, company gstin');
$taxSave($admin, $cidR, ['early' => 1]);
$rc3 = call($acct, 'acc', 'ac_receipt', null, "&payment_id=$chqId");
chk(!empty($rc3['bill']['no']) && (float)$rc3['bill']['total'] == 100000, 'ac_receipt: bill data once the tax bill exists');
chk(call($ba, 'acc', 'ac_receipt', null, "&payment_id=$chqId")['_code'] === 403, 'ac_receipt: ba is refused');
chk(call($acct, 'acc', 'ac_receipt', null, '&payment_id=99999999')['_code'] === 404, 'ac_receipt: unknown payment is 404');
/* log */
$lg = call($acct, 'acc', 'log', ['kind' => 'receipt', 'payment_id' => $chqId, 'customer_id' => $cidR, 'project_id' => $pidR, 'via' => 'email', 'to_whom' => 'bank', 'to_addr' => 'bank@test.example']);
chk($lg['_code'] === 200 && $dbq('SELECT COUNT(*) FROM acc_log WHERE payment_id=?', [$chqId])->fetchColumn() == 1, 'log: a share is recorded');
$sh = call($acct, 'acc', 'ac_receipt', null, "&payment_id=$chqId")['shared'] ?? [];
chk(count($sh) === 1 && $sh[0]['via'] === 'email' && $sh[0]['to_whom'] === 'bank' && $sh[0]['to_addr'] === 'bank@test.example' && $sh[0]['who'] === 'Acc Person' && !empty($sh[0]['created']), 'ac_receipt: shared lists the logged share (via, to whom, address, who, when)');
call($acct, 'acc', 'log', ['kind' => 'tax', 'customer_id' => $cidR, 'project_id' => $pidR, 'via' => 'whatsapp', 'to_whom' => 'customer', 'to_addr' => '9000000027']);
$gs = call($admin, 'gen', 'get', null, "&kind=tax&customer_id=$cidR")['shared'] ?? [];
chk(count($gs) === 1 && $gs[0]['via'] === 'whatsapp' && $gs[0]['to_whom'] === 'customer', 'gen/get tax: shared lists the tax bill shares only (not the receipt share)');
chk(call($sales, 'acc', 'log', ['kind' => 'receipt', 'customer_id' => $cidR, 'via' => 'email', 'to_whom' => 'bank'])['_code'] === 403 && call($eng, 'acc', 'log', ['kind' => 'receipt', 'customer_id' => $cidR, 'via' => 'email', 'to_whom' => 'bank'])['_code'] === 403, 'log: payments read-only roles (sales, engineer) are 403');
chk(call($acct, 'acc', 'log', ['kind' => 'nope', 'customer_id' => $cidR, 'via' => 'email', 'to_whom' => 'bank'])['_code'] === 400, 'log: bad kind refused');
chk(call($acct, 'acc', 'log', ['kind' => 'receipt', 'customer_id' => $cidR, 'via' => 'fax', 'to_whom' => 'bank'])['_code'] === 400, 'log: bad via refused');
chk(in_array(call($ba, 'acc', 'log', ['kind' => 'receipt', 'customer_id' => $cidR, 'via' => 'email', 'to_whom' => 'bank'])['_code'], [403, 404], true), 'log: ba refused (403, or 404 from the BA customer gate)');
call($acct, 'acc', 'log', ['kind' => 'remind', 'customer_id' => $cidA, 'project_id' => $pidA, 'via' => 'whatsapp', 'to_whom' => 'customer', 'to_addr' => '9000000011']);
$ra = find_by(call($acct, 'acc', 'ac_pending')['rows'], 'id', $pidA);
chk(($ra['last_remind']['by'] ?? '') === 'Acc Person' && !empty($ra['last_remind']['at']), 'ac_pending: last_remind shows the logged reminder');
$rcvd = call($acct, 'acc', 'ac_received', null, '&period=2026-11');
call($admin, 'payments', 'delete', ['id' => $chqId]);
$rcvd2 = call($acct, 'acc', 'ac_received', null, '&period=2026-11');
chk(abs($rcvd['total'] - $rcvd2['total'] - 25000) < 0.01 && $dbq('SELECT COUNT(*) FROM acc_log WHERE payment_id=?', [$chqId])->fetchColumn() == 1, 'deleting a payment lowers received and keeps its log rows');
/* templates */
$t0 = call($acct, 'acc', 'ac_tpl');
chk($t0['_code'] === 200 && strpos($t0['rc_subject'] ?? '', '{receipt_no}') !== false && strpos($t0['remind'] ?? '', '{pending}') !== false && isset($t0['company']['name']), 'ac_tpl: defaults and company');
chk(call($sales, 'acc', 'ac_tpl')['_code'] === 200 && call($ba, 'acc', 'ac_tpl')['_code'] === 403, 'ac_tpl: sales (payments) allowed, ba refused');
chk(($t0['defaults']['rc_subject'] ?? '') === $t0['rc_subject'] && strpos($t0['defaults']['remind'] ?? '', '{bank_details}') !== false && count($t0['defaults']) === 5, 'ac_tpl: carries the default texts for Reset');
chk(call($acct, 'acc', 'tpl_save', ['rc_subject' => 'X'])['_code'] === 403, 'tpl_save by accounts role is 403');
chk(call($admin, 'acc', 'tpl_save', ['rc_subject' => 'My subject {receipt_no}', 'rc_body' => 'B1', 'tb_subject' => 'S2', 'tb_body' => 'B2', 'remind' => 'R'])['_code'] === 200, 'tpl_save by admin ok');
$t1 = call($acct, 'acc', 'ac_tpl');
chk($t1['rc_subject'] === 'My subject {receipt_no}' && $t1['remind'] === 'R' && $t1['tb_body'] === 'B2', 'ac_tpl returns the saved templates');
chk(($t1['defaults']['rc_subject'] ?? '') === $t0['rc_subject'], 'ac_tpl defaults stay the built-in text after a save');

/* no cap on the Pending payments tab (it draws lazily); the Dashboard list keeps its 500 */
$pdo = new PDO('sqlite:' . $dbPath); $pdo->beginTransaction();
$ci = $pdo->prepare('INSERT INTO customers(name, phone) VALUES(?, ?)'); $pi = $pdo->prepare('INSERT INTO projects(customer_id, title, cost, stage) VALUES(?, ?, ?, ?)');
for ($i = 0; $i < 505; $i++) { $ci->execute(["Bulk Owing $i", '9000000000']); $pi->execute([(int)$pdo->lastInsertId(), "Bulk Owing $i plant", 100, 'Electrical installation']); }
$pdo->commit(); $pdo = null;
$np = count(call($acct, 'acc', 'ac_pending')['rows'] ?? []); $npe = count(call($acct, 'acc', 'ac_pending', null, '&early=1')['rows'] ?? []);
chk($np > 505 && $npe > $np, "ac_pending lists every owing project (no 500 cap): $np, with early stages $npe");
chk(count(call($admin, 'dashboard', 'get')['dues'] ?? []) === 500, 'the Dashboard dues list keeps its 500 cap');
$dbq("DELETE FROM projects WHERE title LIKE 'Bulk Owing %'"); $dbq("DELETE FROM customers WHERE name LIKE 'Bulk Owing %'");

/* ---- Expense sheet and price list (v43): dealer price + profit % = customer price, quantity required, commission / incentive line ---- */
echo "Accounts: expense sheet and price list\n";
$cols = fn($t) => $dbq("PRAGMA table_info($t)")->fetchAll(PDO::FETCH_COLUMN, 1);
chk(in_array('profit', $cols('acc_materials'), true) && in_array('profit', $cols('acc_costs'), true), 'v43: acc_materials.profit and acc_costs.profit exist');
$dbq('PRAGMA user_version=42');
chk(call($acct, 'acc', 'ac_tpl')['_code'] === 200 && $dbq('PRAGMA user_version')->fetchColumn() == 44, 'the v43 upgrade runs again on a database that already has the columns (idempotent)');
chk(count(array_keys($cols('acc_costs'), 'profit')) === 1 && count(array_keys($cols('acc_materials'), 'profit')) === 1, 'each profit column exists once after the rerun');
/* default profit % (Settings › Price list) */
chk(call($acct, 'acc', 'profit_default_save', null, '&pct=20')['_code'] === 405, 'profit_default_save over GET is refused');
chk(call($sales, 'acc', 'profit_default_save', ['pct' => 20])['_code'] === 403, 'sales cannot change the default profit %');
chk(call($eng, 'acc', 'profit_default_save', ['pct' => 20])['_code'] === 403, 'engineer cannot change the default profit %');
foreach ([501, -1, 'abc', '', null] as $bad) chk(call($acct, 'acc', 'profit_default_save', ['pct' => $bad])['_code'] === 400, 'profit_default_save refuses ' . var_export($bad, true));
$pd = call($acct, 'acc', 'profit_default_save', ['pct' => '12.5']);
chk($pd['_code'] === 200 && (float)($pd['profit_default'] ?? 0) === 12.5, 'accounts write saves the default profit % (12.5)');
chk((float)(call($acct, 'acc', 'ac_materials')['profit_default'] ?? 0) === 12.5, 'ac_materials returns the saved default');
chk(call($acct, 'acc', 'profit_default_save', ['pct' => 0])['_code'] === 200 && (float)call($acct, 'acc', 'ac_materials')['profit_default'] === 0.0, 'a default of 0 % is allowed');
call($acct, 'acc', 'profit_default_save', ['pct' => 15]);
/* profit % per item */
$pm = call($acct, 'acc', 'material_save', ['grp' => 'Solar panels', 'name' => 'Exp Panel 600', 'unit' => 'Nos', 'gst' => 5, 'rate' => 14200, 'profit' => 10]);
$pmId = (int)($pm['id'] ?? 0);
$px = find_by($mats(), 'id', $pmId);
chk($pm['_code'] === 200 && $px && (float)$px['rate'] == 14200 && $px['profit'] !== null && (float)$px['profit'] === 10.0, 'material_save stores the dealer price and the profit %');
call($acct, 'acc', 'material_save', ['id' => $pmId, 'grp' => 'Solar panels', 'name' => 'Exp Panel 600', 'unit' => 'Nos', 'gst' => 5, 'rate' => 14200, 'hidden' => 0]);
chk((float)(find_by($mats(), 'id', $pmId)['profit'] ?? -1) === 10.0, 'a save without profit (older page) keeps the item\'s profit %');
call($acct, 'acc', 'material_save', ['id' => $pmId, 'grp' => 'Solar panels', 'name' => 'Exp Panel 600', 'unit' => 'Nos', 'gst' => 5, 'rate' => 14200, 'profit' => '']);
chk(find_by($mats(), 'id', $pmId)['profit'] === null, 'a blank profit % goes back to the default (null)');
foreach ([-5, 501, 'x'] as $bad) chk(call($acct, 'acc', 'material_save', ['grp' => 'Solar panels', 'name' => 'Exp Bad ' . $bad, 'unit' => 'Nos', 'gst' => 5, 'rate' => 1, 'profit' => $bad])['_code'] === 400, 'material_save refuses profit % ' . var_export($bad, true));
call($acct, 'acc', 'material_save', ['id' => $pmId, 'grp' => 'Solar panels', 'name' => 'Exp Panel 600', 'unit' => 'Nos', 'gst' => 5, 'rate' => 14200, 'profit' => 10]);
/* lines: quantity required, profit % stored per line */
[$cidX, $pidX] = $mkc('Exp Xray', '9000000031', 'Electrical installation', 435600, 10);
$q0 = call($acct, 'acc', 'cost_save', ['project_id' => $pidX, 'lines' => [['material_id' => $pmId, 'grp' => 'Solar panels', 'name' => 'Exp Panel 600', 'qty' => 0, 'unit' => 'Nos', 'rate' => 14200, 'gst' => 5, 'profit' => 10]]]);
chk($q0['_code'] === 400 && ($q0['error'] ?? '') === 'Enter the quantity for Exp Panel 600', 'cost_save refuses a line with quantity 0 ("Enter the quantity for …")');
$qb = call($acct, 'acc', 'cost_save', ['project_id' => $pidX, 'lines' => [['grp' => 'Solar panels', 'name' => 'Exp Blank Qty', 'qty' => '', 'unit' => 'Nos', 'rate' => 1, 'gst' => 5]]]);
chk($qb['_code'] === 400 && ($qb['error'] ?? '') === 'Enter the quantity for Exp Blank Qty' && find_by($mats(), 'name', 'Exp Blank Qty') === null, 'a blank quantity is refused too, and nothing goes on the list');
chk(call($acct, 'acc', 'cost_save', ['project_id' => $pidX, 'lines' => [['grp' => 'Solar panels', 'name' => 'Exp Neg', 'qty' => 1, 'rate' => 1, 'gst' => 5, 'profit' => -2]]])['_code'] === 400, 'a negative line profit % is refused');
$xs = call($acct, 'acc', 'cost_save', ['project_id' => $pidX, 'lines' => [
  ['material_id' => $pmId, 'grp' => 'Solar panels', 'name' => 'Exp Panel 600', 'qty' => 16, 'unit' => 'Nos', 'rate' => 14200, 'gst' => 5, 'profit' => 25],
  ['grp' => 'Services and charges', 'name' => 'Exp Install Job', 'qty' => 1, 'unit' => 'Job', 'rate' => 8000, 'gst' => 18, 'profit' => 0],
  ['grp' => 'Inverter & optimizers', 'name' => 'Exp Old Line', 'qty' => 1, 'unit' => 'Nos', 'rate' => 27500, 'gst' => 5],
]]);
$xl = $xs['lines'] ?? [];
chk($xs['_code'] === 200 && count($xl) === 3 && (float)$xl[0]['profit'] === 25.0 && (float)$xl[1]['profit'] === 0.0 && $xl[2]['profit'] === null, 'cost_save stores each line\'s profit % (25, 0, blank)');
chk((float)(find_by($mats(), 'id', $pmId)['profit'] ?? -1) === 10.0, 'a line\'s profit % does not change the price list item');
$ij = find_by($mats(), 'name', 'Exp Install Job');
chk($ij && $ij['profit'] !== null && (float)$ij['profit'] === 0.0 && (float)$ij['rate'] == 8000, 'a typed new line goes on the price list with its dealer price and profit %');
$xg = call($acct, 'acc', 'ac_cost', null, "&project_id=$pidX");
chk((float)($xg['profit_default'] ?? -1) === 15.0 && (float)$xg['lines'][0]['profit'] === 25.0 && $xg['lines'][2]['profit'] === null, 'ac_cost returns the lines\' profit % and the default');
/* income: payments received for this project */
$pay($pidX, 100000, '2026-11-09'); $pay($pidX, 50000, '2026-11-10');
chk((float)(call($acct, 'acc', 'ac_cost', null, "&project_id=$pidX")['paid'] ?? -1) === 150000.0, 'ac_cost returns the payments received for the project (150000)');
/* commission / incentive line */
$uid = function ($un) use ($dbq) { return (int)$dbq('SELECT id FROM users WHERE username=?', [$un])->fetchColumn(); };
$baId = $uid('ba1'); $salesId = $uid('sales1');
$dbq('UPDATE customers SET owner_id=? WHERE id=?', [$baId, $cidX]);
chk(call($admin, 'comm', 'save', ['customer_id' => $cidX, 'user_id' => $baId, 'amount' => 15000, 'p1_amount' => 5000, 'p1_date' => '2026-11-11'])['_code'] === 200, 'admin records a commission with part 1 paid');
$xc = call($acct, 'acc', 'ac_cost', null, "&project_id=$pidX");
$cm = $xc['comm'] ?? [];
chk(($cm['kind'] ?? '') === 'commission' && ($cm['person'] ?? '') === 'Ba Person' && (float)($cm['amount'] ?? 0) === 15000.0 && (float)($cm['p1'] ?? -1) === 5000.0 && (float)($cm['p2'] ?? -1) === 0.0, 'ac_cost comm: a BA-owned customer -> commission, the person, amount, part 1 and part 2');
chk((float)($xc['auto']['comm'] ?? 0) === 15000.0, 'auto.comm keeps working');
[$cidY, $pidY] = $mkc('Exp Yankee', '9000000032', 'Electrical installation', 200000, 5);
$dbq('UPDATE customers SET owner_id=? WHERE id=?', [$salesId, $cidY]);
$yc = call($acct, 'acc', 'ac_cost', null, "&project_id=$pidY")['comm'] ?? [];
chk(($yc['kind'] ?? '') === 'incentive' && ($yc['person'] ?? '') === 'Sales Person' && (float)($yc['amount'] ?? -1) === 0.0, 'ac_cost comm: a staff-owned customer with nothing recorded -> incentive, the person, amount 0');
$dbq('INSERT INTO commissions(customer_id, user_id, amount, p1_amount, p2_amount) VALUES(?,?,?,?,?)', [$cidY, $salesId, 6000, 3000, 3000]);
$yc = call($acct, 'acc', 'ac_cost', null, "&project_id=$pidY")['comm'] ?? [];
chk(($yc['kind'] ?? '') === 'incentive' && (float)$yc['amount'] === 6000.0 && (float)$yc['p1'] === 3000.0 && (float)$yc['p2'] === 3000.0, 'ac_cost comm: the incentive amount and both parts');
[$cidZ, $pidZ] = $mkc('Exp Zulu', '9000000033', 'Electrical installation', 100000, 3); /* added by the admin: owned by the admin, so no one earns on it */
$zc = call($acct, 'acc', 'ac_cost', null, "&project_id=$pidZ")['comm'] ?? null;
chk(is_array($zc) && $zc['kind'] === '' && $zc['person'] === '' && (float)$zc['amount'] === 0.0, 'ac_cost comm: an admin-owned customer -> no person, no kind');
/* Accounts › Profit math is unchanged: cost = Σ qty × dealer price, commission subtracted */
call($admin, 'gen', 'save', ['kind' => 'tax', 'early' => 1, 'customer_id' => $cidX, 'issued_on' => '2026-06-10', 'number' => 'T3-090', 'data' => ['taxable' => 400000, 'grand' => 435600]]);
$xp = find_by(call($acct, 'acc', 'ac_profit', null, '&period=2026-06')['rows'] ?? [], 'project_id', $pidX);
chk($xp && (float)$xp['cost'] == 16 * 14200 + 8000 + 27500 && (float)$xp['comm'] == 15000 && (float)$xp['profit'] == 400000 - (16 * 14200 + 8000 + 27500) - 15000, 'ac_profit: cost = Σ qty × dealer price, commission subtracted (profit % plays no part)');

/* fix round 1: the price list keeps its dealer price unless a line's price is typed on the sheet (and differs from what the sheet had) */
echo "Accounts: price list write-back, fees at 0 %, duplicate product\n";
$wb = (int)(call($acct, 'acc', 'material_save', ['grp' => 'Solar panels', 'name' => 'Wb Panel 540', 'unit' => 'Nos', 'gst' => 5, 'rate' => 13000, 'profit' => ''])['id'] ?? 0);
$wb2 = (int)(call($acct, 'acc', 'material_save', ['grp' => 'Solar panels', 'name' => 'Wb Panel 545', 'unit' => 'Nos', 'gst' => 5, 'rate' => 11000, 'profit' => ''])['id'] ?? 0);
$rateOf = fn($id) => (float)(find_by($mats(), 'id', $id)['rate'] ?? -1);
[$cidW, $pidW] = $mkc('Wb Whiskey', '9000000034', 'Electrical installation', 300000, 5);
$wl = ['material_id' => $wb, 'grp' => 'Solar panels', 'name' => 'Wb Panel 540', 'qty' => 9, 'unit' => 'Nos', 'rate' => 13500, 'gst' => 5, 'profit' => 15];
chk(call($acct, 'acc', 'cost_save', ['project_id' => $pidW, 'lines' => [$wl + ['price_typed' => 1]]])['_code'] === 200 && $rateOf($wb) === 13500.0, 'a price typed on a new line updates the price list (13,500)');
call($acct, 'acc', 'material_save', ['id' => $wb, 'grp' => 'Solar panels', 'name' => 'Wb Panel 540', 'unit' => 'Nos', 'gst' => 5, 'rate' => 14200]);
$wg = call($acct, 'acc', 'ac_cost', null, "&project_id=$pidW");
$ws = call($acct, 'acc', 'cost_save', ['project_id' => $pidW, 'version' => $wg['version'], 'lines' => array_map(fn($l) => array_merge($l, ['bill_no' => 'B-77']), $wg['lines'])]);
chk($ws['_code'] === 200 && $ws['lines'][0]['bill_no'] === 'B-77' && $rateOf($wb) === 14200.0, 'the owner sets 14,200 on the list; re-saving the old sheet (a bill no. added) keeps 14,200');
call($acct, 'acc', 'cost_save', ['project_id' => $pidW, 'lines' => [$wl + ['price_typed' => 1]]]);
chk($rateOf($wb) === 14200.0, 'a line flagged typed but still at the price the sheet had (13,500) does not write back');
call($acct, 'acc', 'cost_save', ['project_id' => $pidW, 'lines' => [$wl, ['material_id' => $wb2, 'grp' => 'Solar panels', 'name' => 'Wb Panel 545', 'qty' => 2, 'unit' => 'Nos', 'rate' => 9999, 'gst' => 5]]]);
chk($rateOf($wb2) === 11000.0, 'a line that arrives with a price but not typed here (Copy from another project) leaves the list alone');
call($acct, 'acc', 'cost_save', ['project_id' => $pidW, 'lines' => [['rate' => 15000, 'price_typed' => 1] + $wl]]);
chk($rateOf($wb) === 15000.0, 'typing a new price (15,000) on the line still updates the item');
/* KSEB fee items are pass-through costs: 0 % profit (once, only where the % was blank) */
/* null = blank (the default), else the % as a float (JSON gives a whole number as an int) */
$feeP = function ($name) use ($mats) { $x = find_by($mats(), 'name', $name); return $x ? ($x['profit'] === null ? null : (float)$x['profit']) : 'missing'; };
chk($feeP('KSEB feasibility') === 0.0 && $feeP('KSEB registration') === 0.0, 'v43: the seeded KSEB feasibility and registration items have 0 % profit');
$feeLi = find_by($mats(), 'name', 'KSEB liaisoning, documentation and subsidy process');
chk($feeLi && $feeLi['profit'] === null, 'v43: other services keep the default (blank)');
$stp = (int)(call($acct, 'acc', 'material_save', ['grp' => 'Services and charges', 'name' => 'Stamp paper', 'unit' => 'Nos', 'gst' => 0, 'rate' => 100, 'profit' => ''])['id'] ?? 0);
$reg = find_by($mats(), 'name', 'KSEB registration');
call($acct, 'acc', 'material_save', ['id' => $reg['id'], 'grp' => $reg['grp'], 'name' => $reg['name'], 'unit' => $reg['unit'], 'gst' => $reg['gst'], 'rate' => $reg['rate'], 'profit' => 5]);
$dbq("DELETE FROM settings WHERE k='acc_fee_pct0'"); $dbq('PRAGMA user_version=42'); call($acct, 'acc', 'ac_tpl');
chk($stp > 0 && $feeP('Stamp paper') === 0.0 && $feeP('KSEB registration') === 5.0, 'the fee step sets a blank Stamp paper item to 0 % and leaves a typed % (5) alone');
$fea = find_by($mats(), 'name', 'KSEB feasibility');
call($acct, 'acc', 'material_save', ['id' => $fea['id'], 'grp' => $fea['grp'], 'name' => $fea['name'], 'unit' => $fea['unit'], 'gst' => $fea['gst'], 'rate' => $fea['rate'], 'profit' => '']);
$dbq('PRAGMA user_version=42'); call($acct, 'acc', 'ac_tpl');
chk($feeP('KSEB feasibility') === null, 'it runs once: a fee item the owner set back to blank stays blank after a later upgrade');
/* a product someone else added meanwhile: 409 with the existing item's id, no pop-up (the Add window reuses it) */
$dup = call($acct, 'acc', 'material_save', ['grp' => 'Solar panels', 'name' => 'wb panel 540', 'unit' => 'Nos', 'gst' => 5, 'rate' => 1]);
chk($dup['_code'] === 409 && (int)($dup['dup_id'] ?? 0) === $wb && !empty($dup['quiet']) && ($dup['error'] ?? '') === 'wb panel 540 is already in Solar panels', 'material_save 409 carries dup_id (and quiet) for a group + name already on the list');

/* material templates: Settings › Material templates, Expense sheet Save as / Load from template */
echo "Accounts: material templates\n";
$tplItems = fn() => [['material_id' => $wb, 'grp' => 'Solar panels', 'name' => 'Wb Panel 540', 'unit' => 'Nos', 'qty' => 16], ['material_id' => 0, 'grp' => 'Structure & supports', 'name' => 'Tpl Rail', 'unit' => 'm', 'qty' => 30.5]];
$tplList = fn() => call($acct, 'acc', 'ac_tpls')['rows'] ?? [];
chk(call($acct, 'acc', 'ac_tpls')['_code'] === 200 && $tplList() === [], 'ac_tpls: empty at first');
chk(call($sales, 'acc', 'ac_tpls')['_code'] === 403 && call($ba, 'acc', 'ac_tpls')['_code'] === 403, 'ac_tpls: sales and ba get 403');
chk(call($sales, 'acc', 'ac_tpl_get', null, '&id=1')['_code'] === 403 && call($ba, 'acc', 'ac_tpl_get', null, '&id=1')['_code'] === 403, 'ac_tpl_get: sales and ba get 403');
chk(call($acct, 'acc', 'tpl_put')['_code'] === 405, 'tpl_put over GET is refused');
$t1 = call($acct, 'acc', 'tpl_put', ['name' => '  10 kW SolarEdge · sheet roof ', 'items' => $tplItems()]);
$tid = (int)($t1['id'] ?? 0);
chk($t1['_code'] === 200 && $tid > 0, 'tpl_put creates a template');
$g = call($acct, 'acc', 'ac_tpl_get', null, "&id=$tid");
chk(($g['name'] ?? '') === '10 kW SolarEdge · sheet roof' && count($g['items'] ?? []) === 2 && (int)$g['items'][0]['material_id'] === $wb && (float)$g['items'][1]['qty'] === 30.5 && ($g['items'][1]['grp'] ?? '') === 'Structure & supports', 'ac_tpl_get: trimmed name, both items with product and quantity');
$l = $tplList();
chk(count($l) === 1 && (int)$l[0]['n'] === 2 && ($l[0]['updated_by'] ?? '') === 'Acc Person' && !empty($l[0]['updated']) && !isset($l[0]['items']), 'ac_tpls: id, name, item count, updated, updated_by (no items)');
chk(call($acct, 'acc', 'ac_tpl_get', null, '&id=99999')['_code'] === 404, 'ac_tpl_get: unknown id is 404');
/* permissions on writes */
foreach (['sales' => $sales, 'ba' => $ba, 'eng' => $eng] as $who => $actor) {
  chk(call($actor, 'acc', 'tpl_put', ['name' => 'Nope', 'items' => $tplItems()])['_code'] === 403, "$who cannot save a template");
  chk(call($actor, 'acc', 'tpl_copy', ['id' => $tid])['_code'] === 403 && call($actor, 'acc', 'tpl_del', ['id' => $tid])['_code'] === 403, "$who cannot copy or delete a template");
}
/* validation */
$bad = fn($body, $label) => chk(call($acct, 'acc', 'tpl_put', $body)['_code'] === 400, $label);
$bad(['name' => '   ', 'items' => $tplItems()], 'a blank name is refused');
$bad(['name' => str_repeat('x', 81), 'items' => $tplItems()], 'a name over 80 characters is refused');
$bad(['name' => 'No items', 'items' => []], 'no items is refused');
$bad(['name' => 'No items 2'], 'missing items is refused');
$bad(['name' => 'Many', 'items' => array_fill(0, 401, ['material_id' => 0, 'grp' => 'Solar panels', 'name' => 'P', 'unit' => 'Nos', 'qty' => 1])], 'more than 400 items is refused');
$bad(['name' => 'Bad qty', 'items' => [['grp' => 'Solar panels', 'name' => 'P', 'qty' => 0]]], 'quantity 0 is refused');
$bad(['name' => 'Bad qty 2', 'items' => [['grp' => 'Solar panels', 'name' => 'P', 'qty' => -2]]], 'a negative quantity is refused');
$bad(['name' => 'No product', 'items' => [['grp' => 'Solar panels', 'name' => '  ', 'qty' => 1]]], 'an item with no product name is refused');
$bad(['name' => 'Long product', 'items' => [['grp' => 'Solar panels', 'name' => str_repeat('p', 201), 'qty' => 1]]], 'a product name over 200 characters is refused');
chk(count($tplList()) === 1, 'refused saves wrote nothing');
/* name clash: 409 with dup_id + quiet, case-insensitive; replace overwrites */
$d = call($acct, 'acc', 'tpl_put', ['name' => '10 KW solaredge · SHEET roof', 'items' => [['material_id' => 0, 'grp' => 'Solar panels', 'name' => 'Other', 'unit' => 'Nos', 'qty' => 1]]]);
chk($d['_code'] === 409 && (int)($d['dup_id'] ?? 0) === $tid && !empty($d['quiet']), 'a name clash (any case) is 409 with dup_id and quiet');
chk(count(call($acct, 'acc', 'ac_tpl_get', null, "&id=$tid")['items'] ?? []) === 2, 'the clash wrote nothing');
$rp = call($acct, 'acc', 'tpl_put', ['name' => '10 KW solaredge · SHEET roof', 'replace' => 1, 'items' => [['material_id' => 0, 'grp' => 'Solar panels', 'name' => 'Other', 'unit' => 'Nos', 'qty' => 1]]]);
$g = call($acct, 'acc', 'ac_tpl_get', null, "&id=$tid");
chk($rp['_code'] === 200 && (int)$rp['id'] === $tid && count($g['items']) === 1 && $g['name'] === '10 KW solaredge · SHEET roof' && count($tplList()) === 1, 'replace:1 overwrites the clashing template (same id, new name spelling, new items)');
/* edit by id: rename + items; renaming onto another template's name is 409 */
$t2 = (int)(call($acct, 'acc', 'tpl_put', ['name' => '5 kW Growatt', 'items' => $tplItems()])['id'] ?? 0);
$ed = call($acct, 'acc', 'tpl_put', ['id' => $t2, 'name' => '5 kW Growatt · terrace', 'items' => $tplItems()]);
chk($ed['_code'] === 200 && (int)$ed['id'] === $t2 && call($acct, 'acc', 'ac_tpl_get', null, "&id=$t2")['name'] === '5 kW Growatt · terrace' && count($tplList()) === 2, 'tpl_put with an id renames and edits in place');
$cl = call($acct, 'acc', 'tpl_put', ['id' => $t2, 'name' => '10 kw solaredge · sheet roof', 'items' => $tplItems()]);
chk($cl['_code'] === 409 && (int)$cl['dup_id'] === $tid, 'renaming onto another template\'s name is 409');
chk(call($acct, 'acc', 'tpl_put', ['id' => 99999, 'name' => 'Ghost', 'items' => $tplItems()])['_code'] === 404, 'editing an unknown id is 404');
/* duplicate */
$cp = call($acct, 'acc', 'tpl_copy', ['id' => $t2]);
$cpg = call($acct, 'acc', 'ac_tpl_get', null, '&id=' . (int)($cp['id'] ?? 0));
chk($cp['_code'] === 200 && ($cpg['name'] ?? '') === '5 kW Growatt · terrace (copy)' && count($cpg['items'] ?? []) === 2, 'tpl_copy: "<name> (copy)" with the same items');
$cp2 = call($acct, 'acc', 'tpl_copy', ['id' => $t2]);
chk($cp2['_code'] === 200 && (call($acct, 'acc', 'ac_tpl_get', null, '&id=' . (int)$cp2['id'])['name'] ?? '') === '5 kW Growatt · terrace (copy 2)', 'a second copy is "(copy 2)", no clash');
chk(call($acct, 'acc', 'tpl_copy', ['id' => 99999])['_code'] === 404, 'tpl_copy: unknown id is 404');
/* delete -> Recycle bin -> restore */
$cpId = (int)$cp['id']; $before = count($tplList());
chk(call($acct, 'acc', 'tpl_del', ['id' => $cpId])['_code'] === 200 && count($tplList()) === $before - 1, 'tpl_del removes the template');
chk(call($acct, 'acc', 'tpl_del', ['id' => $cpId])['_code'] === 404, 'tpl_del twice is 404');
$tr = find_by(call($admin, 'trash', 'list')['rows'] ?? [], 'label', '5 kW Growatt · terrace (copy)');
chk($tr && $tr['kind'] === 'Material template', 'the deleted template is in the Recycle bin');
chk($tr && call($admin, 'trash', 'restore', ['id' => $tr['id']])['_code'] === 200 && count($tplList()) === $before && count(call($acct, 'acc', 'ac_tpl_get', null, "&id=$cpId")['items'] ?? []) === 2, 'restore brings it back with its items');
/* a template never touches the price list or the quotation maker's templates */
chk(find_by($mats(), 'name', 'Tpl Rail') === null, 'saving a template does not add its typed product to the price list');
/* v44: the table and its unique name index are there, and a re-run of the upgrade changes nothing */
$dbq('PRAGMA user_version=43'); call($acct, 'acc', 'ac_tpl');
$cnt = (int)$dbq('SELECT COUNT(*) FROM acc_tpls')->fetchColumn();
chk($cnt === count($tplList()) && (int)$dbq("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='acct_name'")->fetchColumn() === 1 && (int)$dbq('PRAGMA user_version')->fetchColumn() >= 44, 'v44: re-running the upgrade keeps the templates and the unique name index');

echo "\n$pass ok, $fail FAIL\n";
exit($fail ? 1 : 0);
