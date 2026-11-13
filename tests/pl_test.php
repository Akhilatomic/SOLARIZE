<?php
// Accounts › Salaries and Profit & loss: payments to people, Meta ad spend in the book, the statement by month and financial year.
// Usage: php tests/pl_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/pljar_' . $name . '_' . getmypid() . '.txt']; }
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

echo "Accounts: salaries and profit & loss\n";
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->exec('PRAGMA busy_timeout=5000');
$one = fn($sql, $a = []) => (function () use ($db, $sql, $a) { $s = $db->prepare($sql); $s->execute($a); return $s->fetchColumn(); })();
$user = function ($name, $un, $role) use ($admin, $pw) { call($admin, 'admin', 'user_save', ['name' => $name, 'username' => $un, 'role' => $role, 'active' => 1, 'can_claim' => 0, 'password' => $pw]); $a = actor($un); call($a, 'auth', 'login', ['username' => $un, 'password' => $pw]); return $a; };
$acct = $user('Pl Accounts', 'placct', 'accounts'); $sales = $user('Pl Seller', 'plsales', 'sales');
$D = '2034-06-'; $PER = '&period=2034-06';
$near = fn($a, $b) => abs($a - $b) < 0.011;
$books = call($acct, 'acc', 'ac_books')['books'];
$bank = array_values(array_filter($books, fn($b) => $b['kind'] === 'bank' && !$b['hidden']))[0]['id'];
$cash = array_values(array_filter($books, fn($b) => $b['kind'] === 'cash'))[0]['id'];
$bal = function ($id) use ($acct) { foreach (call($acct, 'acc', 'ac_books')['books'] as $b) if ($b['id'] === $id) return $b['balance']; return null; };
$pl = fn($p = null) => call($acct, 'acc', 'ac_pl', null, $p ?? $GLOBALS['PER']);
$L = function ($d) { $o = []; foreach ($d['lines'] as $l) $o[$l['key']] = $l; return $o; };

/* salaries */
$s0 = call($acct, 'acc', 'ac_salary', null, $PER);
$staffId = (int)$one("SELECT id FROM users WHERE username='plsales'");
chk($s0['_code'] === 200 && $s0['rows'] === [] && $s0['kinds'] === ['Salary', 'Advance', 'Bonus', 'Other'] && in_array($staffId, array_column($s0['staff'], 'id')), 'the Salaries page lists the staff to choose from');
chk(call($sales, 'acc', 'ac_salary', null, $PER)['_code'] === 403 && call($sales, 'acc', 'ac_pl', null, $PER)['_code'] === 403, 'no accounts access: no salaries, no profit and loss');
$c0 = $bal($cash); $k0 = $bal($bank);
$p1 = call($acct, 'acc', 'salary_save', ['user_id' => $staffId, 'kind' => 'Salary', 'date' => $D . '07', 'amount' => '12,000', 'for_what' => 'Week ending 7 Jun', 'book_id' => $cash]);
$p2 = call($acct, 'acc', 'salary_save', ['user_id' => $staffId, 'kind' => 'Advance', 'date' => $D . '10', 'amount' => 3000, 'book_id' => $bank, 'ref' => 'UTR-PL-1']);
$p3 = call($acct, 'acc', 'salary_save', ['name' => 'Pl Helper', 'kind' => 'Salary', 'date' => $D . '14', 'amount' => 5000, 'book_id' => $cash]);
$s1 = call($acct, 'acc', 'ac_salary', null, $PER);
$by = array_column($s1['by'], null, 'name');
chk($p1['_code'] === 200 && $p2['_code'] === 200 && $p3['_code'] === 200 && count($s1['rows']) === 3 && $near($s1['total'], 20000) && $near($by['Pl Seller']['total'], 15000) && $near($by['Pl Seller']['advance'], 3000) && $by['Pl Seller']['n'] === 2 && $near($by['Pl Helper']['total'], 5000), 'salary, advance and a helper who is not a CRM user: listed, with a total per person');
chk($near($bal($cash), $c0 - 17000) && $near($bal($bank), $k0 - 3000), 'each payment goes out of the account it was paid from');
$bk = call($acct, 'acc', 'ac_book', null, "&book=$bank&period=2034-06");
$e = array_values(array_filter($bk['rows'], fn($x) => $x['key'] === 'sal:' . $p2['id']))[0] ?? [];
chk(($e['title'] ?? '') === 'Advance · Pl Seller' && ($e['ref'] ?? '') === 'UTR-PL-1' && ($e['dir'] ?? '') === 'out', 'the cash and bank book names the person and the kind of payment');
chk(call($acct, 'acc', 'salary_save', ['name' => '', 'kind' => 'Salary', 'date' => $D . '07', 'amount' => 5, 'book_id' => $cash])['_code'] === 400 && call($acct, 'acc', 'salary_save', ['name' => 'Pl X', 'kind' => 'Gift', 'date' => $D . '07', 'amount' => 5, 'book_id' => $cash])['_code'] === 400
  && call($acct, 'acc', 'salary_save', ['name' => 'Pl X', 'kind' => 'Salary', 'date' => $D . '07', 'amount' => 0, 'book_id' => $cash])['_code'] === 400 && call($acct, 'acc', 'salary_save', ['name' => 'Pl X', 'kind' => 'Salary', 'date' => $D . '07', 'amount' => 5, 'book_id' => 999999])['_code'] === 400
  && call($acct, 'acc', 'salary_save', ['user_id' => 999999, 'kind' => 'Salary', 'date' => $D . '07', 'amount' => 5, 'book_id' => $cash])['_code'] === 404 && call($sales, 'acc', 'salary_save', ['name' => 'Pl X', 'kind' => 'Salary', 'date' => $D . '07', 'amount' => 5, 'book_id' => $cash])['_code'] === 403, 'no person, an unknown kind, no amount, an unknown account or person, or no access is refused');
$ed = call($acct, 'acc', 'salary_save', ['id' => $p3['id'], 'name' => 'Pl Helper', 'kind' => 'Salary', 'date' => $D . '14', 'amount' => 6000, 'book_id' => $cash]);
chk($ed['_code'] === 200 && call($acct, 'acc', 'ac_sal', null, '&id=' . $p3['id'])['pay']['amount'] == 6000 && $near($bal($cash), $c0 - 18000), 'a payment is read back and edited');

/* profit and loss for the month */
[$cid, $pid] = (function () use ($admin) { $cid = (int)(call($admin, 'customers', 'save', ['name' => 'Pl Customer', 'phone' => '9000000881'])['id'] ?? 0); return [$cid, (int)(call($admin, 'projects', 'save', ['customer_id' => $cid, 'title' => '5 kW rooftop solar', 'kw' => 5, 'cost' => 108900])['id'] ?? 0)]; })();
call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'lines' => [['grp' => 'Solar panels', 'name' => 'Pl Panel', 'qty' => 10, 'unit' => 'Nos', 'rate' => 6000, 'gst' => 5]]]);
call($admin, 'gen', 'save', ['kind' => 'tax', 'early' => 1, 'customer_id' => $cid, 'issued_on' => $D . '20', 'number' => 'PL-001', 'data' => ['taxable' => 100000, 'grand' => 108900]]);
$cid2 = (int)(call($admin, 'customers', 'save', ['name' => 'Pl No Cost', 'phone' => '9000000882'])['id'] ?? 0);
call($admin, 'projects', 'save', ['customer_id' => $cid2, 'title' => '3 kW rooftop solar', 'kw' => 3, 'cost' => 54450]);
call($admin, 'gen', 'save', ['kind' => 'tax', 'early' => 1, 'customer_id' => $cid2, 'issued_on' => $D . '21', 'number' => 'PL-002', 'data' => ['taxable' => 50000, 'grand' => 54450]]);
$cats = call($acct, 'acc', 'ac_expenses', null, $PER)['cats'] ?? [];
$catO = array_values(array_filter($cats, fn($c) => $c !== 'Ads'))[0] ?? ''; $hasAds = in_array('Ads', $cats, true); $adsX = $hasAds ? 2000 : 0; /* the suite shares one database: another test may have changed the categories */
call($acct, 'acc', 'expense_save', ['date' => $D . '09', 'cat' => $catO, 'amount' => 1180, 'gst' => 18, 'paid_to' => 'Pl Shop', 'mode' => 'UPI']);
if ($hasAds) call($acct, 'acc', 'expense_save', ['date' => $D . '09', 'cat' => 'Ads', 'amount' => 2000, 'gst' => 0, 'paid_to' => 'Pl Printer', 'mode' => 'Cash']);
$db->exec("INSERT INTO ad_spend(campaign_id,date,spend,impressions,clicks,leads) VALUES(990001,'2034-06-11',1500,0,0,0),(990001,'2034-06-25',500,0,0,0)");
call($acct, 'acc', 'txn_save', ['date' => $D . '12', 'cat' => 'charges', 'amount' => 59, 'book_id' => $bank]);
call($acct, 'acc', 'txn_save', ['date' => $D . '12', 'cat' => 'interest', 'amount' => 200, 'book_id' => $bank]);
call($acct, 'acc', 'txn_save', ['date' => $D . '13', 'cat' => 'owner_in', 'amount' => 50000, 'book_id' => $bank]);
$d = $pl(); $l = $L($d);
chk($d['_code'] === 200 && count($d['cols']) === 1 && $d['cols'][0]['key'] === '2034-06' && $catO !== '', 'a month is one column');
chk($near($l['sales']['total'], 100000) && $near($l['cost']['total'], 60000) && $near($l['gross']['total'], 40000) && count($d['no_cost']) === 1 && $d['no_cost'][0]['bill_no'] === 'PL-002', 'gross profit is the billed projects’ profit; a billed project without cost lines is left out and listed');
chk($near($l['salary']['total'], 21000) && $near($l['ads']['total'], 2000 + $adsX) && $near($l['exp:' . $catO]['total'] ?? -1, 1000) && $near($l['charges']['total'], 59) && $near($l['other_in']['total'], 200), 'overheads: salaries, ads (Meta + the Ads category), other expenses before GST, bank charges; and other income');
chk($near($l['over']['total'], 21000 + 2000 + $adsX + 1000 + 59) && $near($l['net']['total'], 40000 + 200 - 24059 - $adsX) && $near($d['net'], 16141 - $adsX), 'net profit = gross profit + other income − overheads; the owner’s own money is not profit');
$ov = call($acct, 'acc', 'ac_overview', null, $PER);
chk($near($ov['profit'], 16141 - $adsX), 'the Overview shows the same net profit');

/* financial year */
call($acct, 'acc', 'salary_save', ['name' => 'Pl Helper', 'kind' => 'Salary', 'date' => '2034-07-05', 'amount' => 4000, 'book_id' => $cash]);
$fy = $pl('&period=fy-34-35'); $f = $L($fy);
chk(count($fy['cols']) === 12 && $fy['cols'][0]['key'] === '2034-04' && $fy['cols'][11]['key'] === '2035-03' && $near($f['salary']['vals'][2], 21000) && $near($f['salary']['vals'][3], 4000) && $near($f['salary']['total'], 25000) && $near($f['net']['total'], 16141 - $adsX - 4000), 'a financial year has twelve month columns and a total');

/* Meta ad spend in the book */
chk(($d['ads']['book'] ?? -1) === 0, 'Meta ad spend is not in the cash and bank book until an account is chosen');
$outJ = fn() => call($acct, 'acc', 'ac_book', null, "&book=$bank&period=2034-06")['out']; $k1 = $outJ(); /* this month's money out of the bank: other tests' ad spend sits in other months */
$as = call($acct, 'acc', 'ads_book_save', ['book' => $bank, 'gst' => 1]);
chk($as['_code'] === 200 && $as['ads']['book'] === $bank && $near($outJ(), $k1 + 2000 * 1.18), 'with an account chosen, the month’s spend goes out of it with 18 % GST');
$bk = call($acct, 'acc', 'ac_book', null, "&book=$bank&period=2034-06");
$e = array_values(array_filter($bk['rows'], fn($x) => $x['kind'] === 'ads'))[0] ?? [];
chk(($e['title'] ?? '') === 'Meta ads · Jun 2034' && ($e['date'] ?? '') === '2034-06-25' && $near($e['amount'] ?? 0, 2360), 'one entry for the month, dated its last day with spend');
call($acct, 'acc', 'ads_book_save', ['book' => $bank, 'gst' => 0]);
chk($near($outJ(), $k1 + 2000) && call($acct, 'acc', 'book_delete', ['id' => $bank])['_code'] === 400 && call($sales, 'acc', 'ads_book_save', ['book' => 0])['_code'] === 403 && call($acct, 'acc', 'ads_book_save', ['book' => 999999])['_code'] === 400, 'without GST it is the spend alone; the account cannot be deleted; no access or an unknown account is refused');
call($acct, 'acc', 'ads_book_save', ['book' => 0, 'gst' => 1]);
chk($near($outJ(), $k1), 'switched off: the ad spend leaves the book again');
$db->exec('DELETE FROM ad_spend WHERE campaign_id=990001');

/* deleting */
$x = call($acct, 'acc', 'salary_delete', ['id' => $p1['id']]);
chk($x['_code'] === 200 && (int)$one("SELECT COUNT(*) FROM trash WHERE kind='Salary payment'") >= 1 && call($sales, 'acc', 'salary_delete', ['id' => $p2['id']])['_code'] === 403 && $near($L($pl())['salary']['total'], 9000), 'a payment is deleted to the Recycle bin and leaves the profit and loss');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
