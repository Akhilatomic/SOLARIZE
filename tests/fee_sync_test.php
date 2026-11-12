<?php
// Finance fees (feasibility, registration, stamp paper) marked paid → the line on the customer's Expense sheet is added / updated as Paid.
// Usage: php tests/fee_sync_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/fsjar_' . $name . '_' . getmypid() . '.txt']; }
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

echo "Finance fees paid → Expense sheet lines\n";
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');

$mkCust = function ($name, $phone, $withProject) use ($admin) {
  $cid = (int)(call($admin, 'customers', 'save', ['name' => $name, 'phone' => $phone])['id'] ?? 0);
  $pid = $withProject ? (int)(call($admin, 'projects', 'save', ['customer_id' => $cid, 'title' => '5 kW test plant', 'kw' => 5, 'cost' => 300000])['id'] ?? 0) : 0;
  return [$cid, $pid];
};
$feeId = function ($kind, $cid) use ($admin) {
  call($admin, 'fees', 'add', ['kind' => $kind, 'customer_ids' => [$cid]]);
  foreach (call($admin, 'fees', 'list', null, "&kind=$kind")['rows'] ?? [] as $f) if ((int)$f['customer_id'] === $cid) return (int)$f['id'];
  return 0;
};
$sheet = fn($pid) => call($admin, 'acc', 'ac_cost', null, "&project_id=$pid");
$line = function ($pid, $name) use ($sheet) { $L = array_values(array_filter($sheet($pid)['lines'] ?? [], fn($l) => strcasecmp($l['name'], $name) === 0)); return [count($L), $L[0] ?? null]; };

[$cA, $pA] = $mkCust('Fee Test One', '9000000061', true);
chk($cA && $pA, 'customer with a project');
$v0 = $sheet($pA)['version'] ?? '';
$fF = $feeId('feasibility', $cA);
call($admin, 'fees', 'set', ['id' => $fF, 'paid' => 1, 'paid_on' => '2026-11-10', 'amount' => 1180, 'ref' => 'KSEB-R1']);
[$n, $l] = $line($pA, 'KSEB feasibility');
chk($n === 1 && $l['bought'] === 1 && $l['bought_on'] === '2026-11-10' && abs($l['rate'] - 1000) < 0.01 && (int)$l['gst'] === 18 && (float)$l['qty'] === 1.0
  && $l['bill_no'] === 'KSEB-R1' && $l['grp'] === 'Services and charges', 'feasibility paid → a Paid line on the Expense sheet (₹1,180 incl. GST → ₹1,000 before GST, bill = reference)');
chk(($sheet($pA)['version'] ?? '') !== $v0, 'the sheet version moves on, so a copy of the sheet open elsewhere cannot overwrite it');
call($admin, 'fees', 'set', ['id' => $fF, 'amount' => 2360]);
[$n, $l] = $line($pA, 'KSEB feasibility');
chk($n === 1 && abs($l['rate'] - 2000) < 0.01, 'amount changed while paid → the same line is updated, no second line');
call($admin, 'fees', 'set', ['id' => $fF, 'paid' => 0]);
[$n, $l] = $line($pA, 'KSEB feasibility');
chk($n === 1 && $l['bought'] === 0 && $l['bought_on'] === '', 'marked unpaid in Finance → the line goes back to To pay');

$fS = $feeId('stamp', $cA);
call($admin, 'fees', 'set', ['id' => $fS, 'paid' => 1, 'paid_on' => '2026-11-11', 'amount' => 200]);
[$n, $l] = $line($pA, 'Stamp paper');
chk($n === 1 && $l['bought'] === 1 && abs($l['rate'] - 200) < 0.01 && (int)$l['gst'] === 0, 'stamp paper purchased → a Paid line at 0% GST');

/* a registration line already on the sheet (typed by hand) is updated, not duplicated */
$d = $sheet($pA);
$keep = array_map(fn($x) => ['material_id' => $x['material_id'], 'grp' => $x['grp'], 'name' => $x['name'], 'qty' => $x['qty'], 'unit' => $x['unit'], 'rate' => $x['rate'], 'gst' => $x['gst'],
  'supplier' => $x['supplier'], 'bill_no' => $x['bill_no'], 'bill_date' => $x['bill_date'], 'note' => $x['note'], 'bought' => $x['bought'], 'bought_on' => $x['bought_on']], $d['lines']);
$keep[] = ['grp' => 'Services and charges', 'name' => 'KSEB registration', 'qty' => 1, 'unit' => 'Job', 'rate' => 0, 'gst' => 18];
chk(call($admin, 'acc', 'cost_save', ['project_id' => $pA, 'lines' => $keep, 'version' => $d['version']])['_code'] === 200, 'a registration line typed on the sheet');
$fR = $feeId('registration', $cA);
call($admin, 'fees', 'set', ['id' => $fR, 'paid' => 1, 'paid_on' => '2026-11-12', 'amount' => 11800, 'ref' => 'REG-9']);
[$n, $l] = $line($pA, 'KSEB registration');
chk($n === 1 && $l['bought'] === 1 && abs($l['rate'] - 10000) < 0.01 && $l['bill_no'] === 'REG-9', 'registration paid → the existing line is updated and marked Paid, no duplicate');

[$cB] = $mkCust('Fee Test Two', '9000000062', false);
$fB = $feeId('feasibility', $cB);
chk(call($admin, 'fees', 'set', ['id' => $fB, 'paid' => 1, 'paid_on' => '2026-11-10', 'amount' => 1180])['_code'] === 200, 'a customer with no project: paying the fee still works (nothing to add yet)');

/* one-time catch-up for fees paid before this update */
[$cC, $pC] = $mkCust('Fee Test Three', '9000000063', true);
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->exec('PRAGMA busy_timeout=5000');
$db->prepare("INSERT INTO fees(customer_id,kind,amount,paid,paid_on,ref,demanded,demanded_on) VALUES(?,'feasibility',1180,1,'2026-11-01','OLD-1',1,'2026-11-01')")->execute([$cC]);
$db->exec("DELETE FROM settings WHERE k='acc_fee_sync_v1'"); $db->exec('PRAGMA user_version=45'); $db = null;
call($admin, 'acc', 'ac_pending');
[$n, $l] = $line($pC, 'KSEB feasibility');
chk($n === 1 && $l['bought'] === 1 && $l['bill_no'] === 'OLD-1', 'update: a fee paid earlier is added to that customer\'s Expense sheet once');
$db = new PDO('sqlite:' . $dbPath); $db->exec('PRAGMA user_version=45'); $db = null;
call($admin, 'acc', 'ac_pending');
[$n] = $line($pC, 'KSEB feasibility');
chk($n === 1, 'running the update again adds nothing twice');

echo "  $pass ok, $fail FAIL\n";
exit($fail ? 1 : 0);
