<?php
// Accounts › Supplier dues: bills on credit (Project cost sheets + bills added directly), payments on account, the ledger, the cash and bank book.
// Usage: php tests/dues_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/dujar_' . $name . '_' . getmypid() . '.txt']; }
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

echo "Accounts: supplier dues\n";
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->exec('PRAGMA busy_timeout=5000');
$one = fn($sql, $a = []) => (function () use ($db, $sql, $a) { $s = $db->prepare($sql); $s->execute($a); return $s->fetchColumn(); })();
$user = function ($name, $un, $role) use ($admin, $pw) { call($admin, 'admin', 'user_save', ['name' => $name, 'username' => $un, 'role' => $role, 'active' => 1, 'can_claim' => 0, 'password' => $pw]); $a = actor($un); call($a, 'auth', 'login', ['username' => $un, 'password' => $pw]); return $a; };
$acct = $user('Du Accounts', 'duacct', 'accounts'); $sales = $user('Du Seller', 'dusales', 'sales');
$D = '2032-02-';
$dues = fn() => call($acct, 'acc', 'ac_dues');
$sup = function ($name) use ($dues) { foreach ($dues()['rows'] as $r) if ($r['name'] === $name) return $r; return null; };
$led = fn($name) => call($acct, 'acc', 'ac_sup', null, '&name=' . rawurlencode($name));
$books = call($acct, 'acc', 'ac_books')['books'];
$bank = array_values(array_filter($books, fn($b) => $b['kind'] === 'bank' && !$b['hidden']))[0]['id'];
$bal = function ($id) use ($acct) { foreach (call($acct, 'acc', 'ac_books')['books'] as $b) if ($b['id'] === $id) return $b['balance']; return null; };
chk(call($sales, 'acc', 'ac_dues')['_code'] === 403, 'no accounts access: no supplier dues');
$tot0 = $dues()['due']['total'];

/* bills on credit from a Project cost sheet */
$cid = (int)(call($admin, 'customers', 'save', ['name' => 'Du Test Customer', 'phone' => '9000000661'])['id'] ?? 0);
$pid = (int)(call($admin, 'projects', 'save', ['customer_id' => $cid, 'title' => '3 kW rooftop solar', 'kw' => 3, 'cost' => 200000])['id'] ?? 0);
$line = fn($name, $qty, $rate, $x = []) => $x + ['grp' => 'Solar panels', 'name' => $name, 'qty' => $qty, 'unit' => 'Nos', 'rate' => $rate, 'gst' => 18, 'bought' => 1, 'bought_on' => $D . '05', 'bill_date' => $D . '04', 'supplier' => 'Du Alpha Traders', 'bill_no' => 'DA-1', 'pay_book' => 0];
$cs = call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'lines' => [
  $line('Du Item A', 2, 1000), $line('Du Item B', 1, 500), $line('Du Item C', 1, 100, ['bill_no' => 'DA-2']),
  $line('Du Item D', 1, 1000, ['supplier' => 'du alpha TRADERS', 'bill_no' => '', 'pay_book' => 0]),
  $line('Du Item E', 1, 5000, ['pay_book' => $bank]), $line('Du Item F', 1, 700, ['pay_book' => null]),
  $line('Du Item G', 1, 200, ['supplier' => '', 'bill_no' => ''])]]);
$s = $sup('Du Alpha Traders');
chk($cs['_code'] === 200 && $s && abs($s['bills'] - (2950 + 118 + 1180)) < 0.01 && $s['bills_n'] === 3 && $s['paid'] == 0 && abs($s['balance'] - 4248) < 0.01, 'Not paid yet lines become bills on credit, grouped per bill no., whatever the case of the supplier name');
$nn = $sup('Supplier not named');
chk($nn && abs($nn['bills'] - 236) < 0.01, 'a credit line with no supplier is kept under “Supplier not named”');
chk(abs($dues()['due']['total'] - $tot0 - 4248 - 236) < 0.01, 'paid-at-purchase and not-recorded lines are not owed');
$L = $led('Du Alpha Traders');
chk(count($L['rows']) === 3 && $L['rows'][0]['title'] === 'Bill DA-1' && $L['rows'][0]['bill'] == 2950 && $L['rows'][0]['date'] === $D . '04' && strpos($L['rows'][0]['sub'], '2 items') !== false && $L['rows'][0]['project_id'] === $pid && abs($L['balance'] - 4248) < 0.01, 'the ledger lists each bill with its date, items and project');

/* payments on account */
$b0 = $bal($bank);
$p1 = call($acct, 'acc', 'spay_save', ['supplier' => 'du alpha traders', 'date' => $D . '10', 'amount' => '2,000', 'book_id' => $bank, 'ref' => 'UTR-DU-1', 'bill_no' => 'DA-1']);
chk($p1['_code'] === 200 && abs($sup('Du Alpha Traders')['balance'] - 2248) < 0.01 && $sup('Du Alpha Traders')['last_paid'] === $D . '10' && abs($bal($bank) - ($b0 - 2000)) < 0.01, 'a part payment reduces the balance and goes out of the bank');
$bk = call($acct, 'acc', 'ac_book', null, "&book=$bank&period=2032-02");
$e = array_values(array_filter($bk['rows'], fn($x) => $x['key'] === 'spay:' . $p1['id']))[0] ?? [];
chk(($e['title'] ?? '') === 'Paid to du alpha traders' && ($e['ref'] ?? '') === 'UTR-DU-1' && ($e['dir'] ?? '') === 'out', 'the payment is in the cash and bank book with its reference');
$L = $led('Du Alpha Traders');
chk(count($L['rows']) === 4 && end($L['rows'])['kind'] === 'pay' && abs(end($L['rows'])['balance'] - 2248) < 0.01, 'the ledger runs the balance after each bill and payment');
chk(call($acct, 'acc', 'spay_save', ['supplier' => '', 'date' => $D . '10', 'amount' => 5, 'book_id' => $bank])['_code'] === 400 && call($acct, 'acc', 'spay_save', ['supplier' => 'Du X', 'date' => $D . '10', 'amount' => 0, 'book_id' => $bank])['_code'] === 400
  && call($acct, 'acc', 'spay_save', ['supplier' => 'Du X', 'date' => 'bad', 'amount' => 5, 'book_id' => $bank])['_code'] === 400 && call($acct, 'acc', 'spay_save', ['supplier' => 'Du X', 'date' => $D . '10', 'amount' => 5, 'book_id' => 999999])['_code'] === 400
  && call($sales, 'acc', 'spay_save', ['supplier' => 'Du X', 'date' => $D . '10', 'amount' => 5, 'book_id' => $bank])['_code'] === 403, 'no supplier, no amount, a bad date, an unknown account or no access is refused');
$p2 = call($acct, 'acc', 'spay_save', ['id' => $p1['id'], 'supplier' => 'Du Alpha Traders', 'date' => $D . '10', 'amount' => 5000, 'book_id' => $bank]);
chk($p2['_code'] === 200 && abs($sup('Du Alpha Traders')['balance'] + 752) < 0.01 && abs($dues()['advance'] - 752) >= 0 && call($acct, 'acc', 'ac_spay', null, '&id=' . $p1['id'])['pay']['amount'] == 5000, 'a payment is edited; paying more than the bills shows as an advance');
call($acct, 'acc', 'spay_save', ['id' => $p1['id'], 'supplier' => 'Du Alpha Traders', 'date' => $D . '10', 'amount' => 2000, 'book_id' => $bank]);

/* bills added directly */
$d1 = call($acct, 'acc', 'bill_save', ['supplier' => 'Du Beta Electricals', 'bill_no' => 'DB-9', 'date' => $D . '12', 'amount' => 11800, 'gst_amt' => 1800, 'pay_book' => 0, 'note' => 'cable for stock']);
chk($d1['_code'] === 200 && abs($sup('Du Beta Electricals')['balance'] - 11800) < 0.01, 'a bill added directly, on credit, is owed');
chk(call($acct, 'acc', 'bill_save', ['supplier' => 'du beta electricals', 'bill_no' => 'db-9', 'date' => $D . '12', 'amount' => 5])['_code'] === 409 && call($acct, 'acc', 'bill_save', ['supplier' => 'Du Beta Electricals', 'bill_no' => 'X', 'date' => $D . '12', 'amount' => 100, 'gst_amt' => 200])['_code'] === 400
  && call($acct, 'acc', 'bill_save', ['supplier' => 'Du Beta Electricals', 'bill_no' => 'X', 'date' => $D . '12', 'amount' => 0])['_code'] === 400 && call($sales, 'acc', 'bill_save', ['supplier' => 'Du Z', 'date' => $D . '12', 'amount' => 5])['_code'] === 403, 'the same bill twice, GST above the amount, no amount or no access is refused');
$b1 = $bal($bank);
$d2 = call($acct, 'acc', 'bill_save', ['supplier' => 'Du Beta Electricals', 'bill_no' => 'DB-10', 'date' => $D . '13', 'amount' => 590, 'pay_book' => $bank]);
chk($d2['_code'] === 200 && abs($sup('Du Beta Electricals')['balance'] - 11800) < 0.01 && abs($bal($bank) - ($b1 - 590)) < 0.01, 'a direct bill paid at once is not owed; it goes out of the bank');
/* the same bill's items later marked Purchased on a sheet: counted once */
$cs2 = call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'version' => $cs['version'], 'lines' => array_merge(array_map(fn($l) => array_intersect_key($l, array_flip(['material_id', 'grp', 'name', 'qty', 'unit', 'rate', 'gst', 'bought', 'bought_on', 'bill_date', 'supplier', 'bill_no', 'pay_book'])), $cs['lines']),
  [$line('Du Cable', 100, 50, ['supplier' => 'Du Beta Electricals', 'bill_no' => 'DB-9', 'pay_book' => 0]), $line('Du Cable 2', 1, 500, ['supplier' => 'Du Beta Electricals', 'bill_no' => 'DB-10', 'pay_book' => $bank])])]);
chk($cs2['_code'] === 200 && abs($sup('Du Beta Electricals')['balance'] - 11800) < 0.01 && abs($bal($bank) - ($b1 - 590)) < 0.01, 'sheet lines of a bill entered directly are not counted twice, in the dues or in the bank');
$g = call($acct, 'acc', 'ac_bill', null, '&id=' . $d1['id']);
$d3 = call($acct, 'acc', 'bill_save', ['id' => $d1['id'], 'supplier' => 'Du Beta Electricals', 'bill_no' => 'DB-9', 'date' => $D . '12', 'amount' => 12000, 'gst_amt' => 1800, 'pay_book' => 0]);
chk(($g['bill']['amount'] ?? 0) == 11800 && $d3['_code'] === 200 && abs($sup('Du Beta Electricals')['balance'] - 12000) < 0.01, 'a direct bill is read back and edited');

/* the Cash & bank summary uses the same dues */
$sum = call($acct, 'acc', 'ac_books');
chk(abs($sum['due']['total'] - $dues()['due']['total']) < 0.01 && $sum['due']['n'] === $dues()['due']['n'], 'Cash & bank shows the same total owed');

/* deleting */
chk(call($acct, 'acc', 'book_delete', ['id' => $bank])['_code'] === 400, 'an account used by a supplier payment cannot be deleted');
$x1 = call($acct, 'acc', 'spay_delete', ['id' => $p1['id']]);
chk($x1['_code'] === 200 && abs($sup('Du Alpha Traders')['balance'] - 4248) < 0.01 && (int)$one("SELECT COUNT(*) FROM trash WHERE kind='Supplier payment'") >= 1 && call($sales, 'acc', 'spay_delete', ['id' => 1])['_code'] === 403, 'a payment is deleted to the Recycle bin and the balance returns');
$x2 = call($acct, 'acc', 'bill_delete', ['id' => $d1['id']]);
chk($x2['_code'] === 200 && abs($sup('Du Beta Electricals')['balance'] - 5900) < 0.01 && (int)$one("SELECT COUNT(*) FROM trash WHERE kind='Supplier bill'") >= 1, 'a direct bill is deleted: its sheet lines count again as their own bill');
chk($led('Du Nobody')['rows'] === [] && call($acct, 'acc', 'ac_spay', null, '&id=999999')['_code'] === 404, 'an unknown supplier has an empty ledger');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
