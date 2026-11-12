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
call($admin, 'gen', 'save', ['kind' => 'tax', 'customer_id' => $cidE, 'issued_on' => '2026-11-10', 'number' => 'T3-001', 'data' => ['taxable' => 100000, 'grand' => 108900]]);
[$cidF, $pidF] = $mkc('Prof Foxtrot', '9000000016', 'Electrical installation', 54450, 3);
call($admin, 'gen', 'save', ['kind' => 'tax', 'customer_id' => $cidF, 'issued_on' => '2026-11-11', 'number' => 'T3-002', 'data' => ['grand' => 54450]]);
$pf = call($acct, 'acc', 'ac_profit', null, '&period=2026-11');
$re = find_by($pf['rows'] ?? [], 'project_id', $pidE);
$cm = $dbPath ? 5000 : 0;
chk($pf['_code'] === 200 && $re && (float)$re['before'] == 100000 && (float)$re['cost'] == 60000 && (float)$re['comm'] == $cm && (float)$re['profit'] == 40000 - $cm && $re['bill_no'] === 'T3-001' && $re['bill_on'] === '2026-11-10' && (int)$re['lines'] === 1, 'ac_profit: before 100000 - cost 60000 - comm');
$nc = find_by($pf['no_cost'] ?? [], 'project_id', $pidF);
chk($nc && $nc['bill_no'] === 'T3-002' && find_by($pf['rows'], 'project_id', $pidF) === null, 'ac_profit: billed project with no lines goes to no_cost');
chk((float)$pf['counted']['profit'] == 40000 - $cm && (float)$pf['counted']['before'] == 100000 && (float)$pf['counted']['cost'] == 60000, 'ac_profit: counted excludes no_cost projects');
chk(count(call($acct, 'acc', 'ac_profit', null, '&period=2026-10')['rows']) === 0, 'ac_profit: bill outside period not counted');

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
$pp = call($acct, "acc", "ac_pending");
chk((float)$ov['received'] == (float)$rc['total'] && $ov['received_n'] === count($rc['rows']) && $ov["pending_n"] === count($pp["rows"]) && count($ov['top']) <= 10 && abs($ov['pending'] - array_sum(array_column($pp['rows'], 'due'))) < 0.01, 'ac_overview: received and pending match the lists');
chk(call($acct, 'acc', 'cats_save', ['cats' => ['Ads', 'AI tools', 'Rent']])['_code'] === 403, 'cats_save is admin only');
chk(call($admin, 'acc', 'cats_save', ['cats' => ['Ads', 'AI tools', 'Rent', 'Rent', ' ']])['cats'] === ['Ads', 'AI tools', 'Rent'], 'cats_save (admin) cleans the list');
chk(call($acct, 'acc', 'expense_save', ['date' => '2026-11-12', 'cat' => 'Rent', 'amount' => 500, 'gst' => 0])['_code'] === 200, 'new category usable');
$ov2 = call($acct, 'acc', 'ac_overview', null, '&period=2026-11');
chk((float)$ov2['expenses']['other'] == 500, 'ac_overview: other categories counted under other');
chk(call($acct, 'acc', 'expense_delete', ['id' => $e1['id']])['_code'] === 200 && count(call($acct, 'acc', 'ac_expenses', null, '&period=2026-11')['rows']) === 1, 'expense_delete removes it');
foreach (['ac_overview', 'ac_pending', 'ac_received', 'ac_profit', 'ac_expenses'] as $act) {
  chk(call($sales, 'acc', $act)['_code'] === 403 && call($ba, 'acc', $act)['_code'] === 403, "sales and ba get 403 on $act");
}

echo "\n$pass ok, $fail FAIL\n";
exit($fail ? 1 : 0);
