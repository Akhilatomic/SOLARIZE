<?php
// Accounts › In progress / Completed: a customer is tracked from their first payment; Completed is a mark set once the payment is complete.
// Usage: php tests/track_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/trjar_' . $name . '_' . getmypid() . '.txt']; }
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

echo "Accounts: In progress and Completed\n";
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->exec('PRAGMA busy_timeout=5000');
$one = fn($sql, $a = []) => (function () use ($db, $sql, $a) { $s = $db->prepare($sql); $s->execute($a); return $s->fetchColumn(); })();
$user = function ($name, $un, $role) use ($admin, $pw) { call($admin, 'admin', 'user_save', ['name' => $name, 'username' => $un, 'role' => $role, 'active' => 1, 'can_claim' => 1, 'password' => $pw]); $a = actor($un); call($a, 'auth', 'login', ['username' => $un, 'password' => $pw]); return $a; };
$acct = $user('Tr Accounts', 'tracct', 'accounts'); $sales = $user('Tr Seller', 'trsales', 'sales');
$cust = fn($name, $phone) => (int)(call($admin, 'customers', 'save', ['name' => $name, 'phone' => $phone])['id'] ?? 0);
$proj = fn($cid, $cost, $kw = 5) => (int)(call($admin, 'projects', 'save', ['customer_id' => $cid, 'title' => "$kw kW rooftop solar", 'kw' => $kw, 'cost' => $cost])['id'] ?? 0);
$pay = fn($pid, $amt, $date = '2026-11-05') => (int)(call($admin, 'payments', 'save', ['project_id' => $pid, 'date' => $date, 'amount' => $amt, 'mode' => 'Cash'])['id'] ?? 0);
$list = function ($who, $done = false) { return call($who, 'acc', 'ac_track', null, $done ? '&state=done' : ''); };
$rowOf = function ($d, $cid) { foreach ($d['rows'] ?? [] as $r) if ((int)$r['customer_id'] === $cid) return $r; return null; };
$state = fn($cid) => call($admin, 'profile', 'cost_get', null, '&customer_id=' . $cid)['track']['state'] ?? '?';

/* 1. the first payment puts the customer on the list */
$a = $cust('Track Customer A', '9000000901'); $pa = $proj($a, 300000);
$o0 = $list($admin);
chk($o0['_code'] === 200 && $rowOf($o0, $a) === null && $state($a) === 'none', 'a customer without a payment is not in Accounts');
$pay($pa, 100000, '2026-11-03');
$r = $rowOf($list($admin), $a);
chk($r !== null && $r['cost'] == 300000 && $r['paid'] == 100000 && $r['due'] == 200000 && $r['full'] === 0 && $r['pays'] === 1 && $r['last_pay'] === '2026-11-03', 'the first payment adds them to In progress with plant cost, received and pending');
chk($r['stage'] === 'Customer' && $r['project_id'] === $pa && $r['kw'] == 5 && $state($a) === 'open', 'the row shows the project and its stage; the profile says In progress');
$pay($pa, 50000, '2026-11-07'); $r = $rowOf($list($admin), $a);
chk($r['paid'] == 150000 && $r['due'] == 150000 && $r['pays'] === 2 && $r['last_pay'] === '2026-11-07', 'a second part payment adds up');
$ov = call($admin, 'acc', 'ac_overview');
chk(($ov['track_open_n'] ?? 0) >= 1 && array_key_exists('track_done_n', $ov), 'the Overview counts customers in progress and completed');

/* 2. Completed is for a customer whose payment is complete */
$r1 = call($acct, 'acc', 'track_set', ['customer_id' => $a, 'done' => 1]);
chk($r1['_code'] === 409 && strpos($r1['error'] ?? '', 'still pending') !== false, 'with a balance left the customer stays In progress');
chk(call($acct, 'acc', 'track_set', ['customer_id' => $a, 'done' => 1, 'force' => 1])['_code'] === 409 && call($admin, 'acc', 'track_set', ['customer_id' => $a, 'done' => 1])['_code'] === 409, 'staff cannot force it, and the admin must confirm');
$pay($pa, 150000, '2026-11-09'); $r = $rowOf($list($admin), $a);
chk($r['due'] == 0 && $r['full'] === 1, 'paid in full: marked fully paid');
$r2 = call($acct, 'acc', 'track_set', ['customer_id' => $a, 'done' => 1]);
chk($r2['_code'] === 200 && $rowOf($list($admin), $a) === null, 'the accounts team moves them to Completed; they leave In progress');
$dn = $list($admin, true); $r = $rowOf($dn, $a);
chk($r !== null && $r['done'] === 1 && $r['done_by'] === 'Tr Accounts' && $r['done_at'] !== '' && $state($a) === 'done', 'Completed lists them with who moved them and when; the profile says Completed');
chk(($dn['done_n'] ?? 0) >= 1 && array_key_exists('open_n', $dn), 'each list also says how many are on the other one');
chk(call($acct, 'acc', 'track_set', ['customer_id' => $a, 'done' => 0])['_code'] === 200 && $rowOf($list($admin), $a) !== null && $rowOf($list($admin, true), $a) === null && $state($a) === 'open', 'Move back returns them to In progress');

/* 3. an admin can close one with a balance; no plant cost; move all */
$b = $cust('Track Customer B', '9000000902'); $pb = $proj($b, 200000); $pay($pb, 190000);
chk(call($admin, 'acc', 'track_set', ['customer_id' => $b, 'done' => 1, 'force' => 1])['_code'] === 200 && $rowOf($list($admin, true), $b)['due'] == 10000, 'an admin closes a customer with ₹10,000 left (confirmed)');
$c = $cust('Track Customer C', '9000000903'); $pc = $proj($c, 0); $pay($pc, 5000); $r = $rowOf($list($admin), $c);
chk($r !== null && $r['cost'] == 0 && $r['due'] == 0 && $r['full'] === 0, 'no plant cost entered: listed, not called fully paid');
$r3 = call($acct, 'acc', 'track_set', ['customer_id' => $c, 'done' => 1]);
chk($r3['_code'] === 409 && strpos($r3['error'] ?? '', 'plant cost') !== false, 'and cannot be completed until the cost is entered');
$d = $cust('Track Customer D', '9000000904'); $pd = $proj($d, 100000); $pay($pd, 100000);
$fullNow = count(array_filter($list($admin)['rows'] ?? [], fn($x) => $x['full'])); /* other tests' customers may be fully paid too */
$all = call($acct, 'acc', 'track_all', []);
chk($all['_code'] === 200 && $all['moved'] === $fullNow && $fullNow >= 2 && $rowOf($list($admin, true), $a) !== null && $rowOf($list($admin, true), $d) !== null && $rowOf($list($admin), $c) !== null, 'Move all: every fully paid customer goes to Completed, the others stay');
chk(call($acct, 'acc', 'track_all', [])['moved'] === 0, 'nothing more to move');

/* 4. two projects of one customer are added up; a customer with no payment cannot be moved */
$e = $cust('Track Customer E', '9000000905'); $pe1 = $proj($e, 100000, 3); $pe2 = $proj($e, 150000, 5); $pay($pe1, 100000); $pay($pe2, 20000);
$r = $rowOf($list($admin), $e);
chk($r['projects'] === 2 && $r['cost'] == 250000 && $r['paid'] == 120000 && $r['due'] == 130000 && $r['project_id'] === $pe2, 'two projects: costs and payments added up, the latest project shown');
$f = $cust('Track Customer F', '9000000906');
chk(call($admin, 'acc', 'track_set', ['customer_id' => $f, 'done' => 1, 'force' => 1])['_code'] === 400 && call($admin, 'acc', 'track_set', ['customer_id' => 999999, 'done' => 1])['_code'] === 404, 'a customer with no payment, or an unknown one, cannot be moved');

/* 5. the Overview card's way: the first payment starts the project with the plant cost */
$g = $cust('Track Customer G', '9000000907');
$gc = call($admin, 'gen', 'cost', ['kind' => 'tax', 'customer_id' => $g, 'cost' => 180000]);
$pg = (int)($gc['acct']['project_id'] ?? 0); $pay($pg, 60000); $r = $rowOf($list($admin), $g);
chk($pg > 0 && $r !== null && $r['cost'] == 180000 && $r['paid'] == 60000 && $r['due'] == 120000, 'a project is started with the plant cost, the payment recorded, and the customer is In progress');

/* 6. who may see and move */
chk($list($sales)['_code'] === 403 && call($sales, 'acc', 'track_set', ['customer_id' => $e, 'done' => 0])['_code'] === 403 && call($sales, 'acc', 'track_all', [])['_code'] === 403, 'without Accounts access the lists and the moves are refused');
chk($list($acct)['_code'] === 200, 'the accounts role sees them');

/* 7. the mark leaves with the customer */
call($admin, 'customers', 'delete', ['id' => $d]);
chk(!$one('SELECT COUNT(*) FROM acc_track WHERE customer_id=?', [$d]) && $rowOf($list($admin, true), $d) === null, 'deleting a customer removes them from Completed');
chk((bool)$one("SELECT 1 FROM audit_log WHERE action='acc_completed'") && (bool)$one("SELECT 1 FROM audit_log WHERE action='acc_reopened'"), 'moves are in the audit log');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
