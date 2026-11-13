<?php
// Accounts › Cash & bank: accounts, the book worked out from payments / expenses / purchases / manual entries, moving and deleting.
// Usage: php tests/books_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/bkjar_' . $name . '_' . getmypid() . '.txt']; }
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

echo "Accounts: cash and bank book\n";
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->exec('PRAGMA busy_timeout=5000');
$one = fn($sql, $a = []) => (function () use ($db, $sql, $a) { $s = $db->prepare($sql); $s->execute($a); return $s->fetchColumn(); })();
$user = function ($name, $un, $role) use ($admin, $pw) { call($admin, 'admin', 'user_save', ['name' => $name, 'username' => $un, 'role' => $role, 'active' => 1, 'can_claim' => 0, 'password' => $pw]); $a = actor($un); call($a, 'auth', 'login', ['username' => $un, 'password' => $pw]); return $a; };
$acct = $user('Bk Accounts', 'bkacct', 'accounts'); $sales = $user('Bk Seller', 'bksales', 'sales');
/* the suite shares one database: work in a far-away month so other tests' payments do not get in the way, and measure changes */
$PER = '&period=2031-05'; $D = '2031-05-';
$sum = fn() => call($acct, 'acc', 'ac_books');
$bal = function ($id) use ($sum) { foreach ($sum()['books'] as $b) if ($b['id'] === $id) return $b['balance']; return null; };
$book = fn($id) => call($acct, 'acc', 'ac_book', null, "&book=$id" . $GLOBALS['PER']);

$s = $sum();
$cash = array_values(array_filter($s['books'], fn($b) => $b['kind'] === 'cash'))[0]['id'] ?? 0;
$bank = array_values(array_filter($s['books'], fn($b) => $b['kind'] === 'bank' && $b['is_default']))[0]['id'] ?? 0;
chk($s['_code'] === 200 && $cash > 0 && $bank > 0 && count($s['cats']) === 9, 'a cash account and a default bank account are there from the start');
chk(call($sales, 'acc', 'ac_books')['_code'] === 403 && call($sales, 'acc', 'book_save', ['name' => 'Bk Nope'])['_code'] === 403, 'no accounts access: no book');

/* accounts */
$n = call($acct, 'acc', 'book_save', ['name' => 'Bk Second Bank', 'kind' => 'bank', 'opening' => '10,000', 'opening_on' => $D . '01']);
$b2 = $n['id'];
chk($n['_code'] === 200 && $bal($b2) == 10000, 'a new account starts at its opening balance');
chk(call($acct, 'acc', 'book_save', ['name' => 'bk second bank', 'kind' => 'bank'])['_code'] === 409 && call($acct, 'acc', 'book_save', ['name' => '', 'kind' => 'bank'])['_code'] === 400
  && call($acct, 'acc', 'book_save', ['name' => 'Bk X', 'kind' => 'wallet'])['_code'] === 400 && call($acct, 'acc', 'book_save', ['name' => 'Bk X', 'kind' => 'bank', 'opening' => 500])['_code'] === 400, 'a taken name, no name, an unknown kind or an opening balance without its date is refused');

/* money in: payments by mode */
$c0 = $bal($cash); $k0 = $bal($bank);
$cid = (int)(call($admin, 'customers', 'save', ['name' => 'Bk Test Customer', 'phone' => '9000000551'])['id'] ?? 0);
$pid = (int)(call($admin, 'projects', 'save', ['customer_id' => $cid, 'title' => '3 kW rooftop solar', 'kw' => 3, 'cost' => 200000])['id'] ?? 0);
$p1 = (int)(call($admin, 'payments', 'save', ['project_id' => $pid, 'date' => $D . '03', 'amount' => 5000, 'mode' => 'Cash'])['id'] ?? 0);
$p2 = (int)(call($admin, 'payments', 'save', ['project_id' => $pid, 'date' => $D . '04', 'amount' => 140000, 'mode' => 'Loan', 'ref_no' => 'UTR-BK-1'])['id'] ?? 0);
chk($p1 > 0 && $p2 > 0 && $bal($cash) == $c0 + 5000 && $bal($bank) == $k0 + 140000, 'a cash payment lands in Cash, any other mode in the default bank account');
$bk = $book($bank);
$row = array_values(array_filter($bk['rows'], fn($e) => $e['key'] === "pay:$p2"))[0] ?? [];
chk(($row['dir'] ?? '') === 'in' && ($row['title'] ?? '') === 'Received from Bk Test Customer' && ($row['ref'] ?? '') === 'UTR-BK-1' && ($row['movable'] ?? 0) === 1, 'the entry names the customer and carries the reference');

/* money out: office expense */
$cats = call($acct, 'acc', 'ac_expenses', null, $PER)['cats'] ?? [];
$ex = call($acct, 'acc', 'expense_save', ['date' => $D . '05', 'cat' => $cats[0] ?? '', 'amount' => 1180, 'gst' => 18, 'paid_to' => 'Bk Shop', 'mode' => 'UPI', 'note' => '']);
chk($ex['_code'] === 200 && $bal($bank) == $k0 + 140000 - 1180, 'an office expense goes out of the bank with its GST');

/* move an entry to another account */
$mv = call($acct, 'acc', 'book_move', ['kind' => 'pay', 'ref_id' => $p2, 'book_id' => $b2]);
chk($mv['_code'] === 200 && $bal($bank) == $k0 - 1180 && $bal($b2) == 150000, 'a payment moved to the other bank account');
chk(call($acct, 'acc', 'book_move', ['kind' => 'cost', 'ref_id' => 1, 'book_id' => $b2])['_code'] === 400 && call($acct, 'acc', 'book_move', ['kind' => 'pay', 'ref_id' => $p2, 'book_id' => 999999])['_code'] === 400
  && call($sales, 'acc', 'book_move', ['kind' => 'pay', 'ref_id' => $p2, 'book_id' => $bank])['_code'] === 403, 'a purchase entry, an unknown account or a person without access cannot move');

/* manual entries and transfers */
$t1 = call($acct, 'acc', 'txn_save', ['date' => $D . '06', 'cat' => 'owner_in', 'amount' => 20000, 'book_id' => $cash, 'party' => 'Bk Owner']);
$t2 = call($acct, 'acc', 'txn_save', ['date' => $D . '07', 'cat' => 'charges', 'amount' => 59, 'book_id' => $b2]);
$t3 = call($acct, 'acc', 'txn_save', ['date' => $D . '08', 'cat' => 'transfer', 'amount' => 3000, 'book_id' => $cash, 'to_book_id' => $b2, 'note' => 'deposit']);
chk($t1['_code'] === 200 && $t2['_code'] === 200 && $t3['_code'] === 200 && $bal($cash) == $c0 + 5000 + 20000 - 3000 && $bal($b2) == 150000 - 59 + 3000, 'owner money in, bank charges out, and a transfer from cash to bank');
chk(call($acct, 'acc', 'txn_save', ['date' => $D . '08', 'cat' => 'transfer', 'amount' => 10, 'book_id' => $cash, 'to_book_id' => $cash])['_code'] === 400 && call($acct, 'acc', 'txn_save', ['date' => 'x', 'cat' => 'other_in', 'amount' => 10, 'book_id' => $cash])['_code'] === 400
  && call($acct, 'acc', 'txn_save', ['date' => $D . '08', 'cat' => 'other_in', 'amount' => 0, 'book_id' => $cash])['_code'] === 400 && call($acct, 'acc', 'txn_save', ['date' => $D . '08', 'cat' => 'nope', 'amount' => 5, 'book_id' => $cash])['_code'] === 400
  && call($sales, 'acc', 'txn_save', ['date' => $D . '08', 'cat' => 'other_in', 'amount' => 5, 'book_id' => $cash])['_code'] === 403, 'a transfer to the same account, a bad date, no amount, an unknown kind or no access is refused');
$g = call($acct, 'acc', 'ac_txn', null, '&id=' . $t1['id']);
$e2 = call($acct, 'acc', 'txn_save', ['id' => $t1['id'], 'date' => $D . '06', 'cat' => 'owner_in', 'amount' => 25000, 'book_id' => $cash, 'party' => 'Bk Owner']);
chk(($g['txn']['amount'] ?? 0) == 20000 && $e2['_code'] === 200 && $bal($cash) == $c0 + 5000 + 25000 - 3000, 'a manual entry is read back and edited');

/* purchases on a Project cost sheet: paid from an account, not paid yet, not recorded */
$line = fn($name, $qty, $rate, $x = []) => $x + ['grp' => 'Solar panels', 'name' => $name, 'qty' => $qty, 'unit' => 'Nos', 'rate' => $rate, 'gst' => 5, 'bought' => 1, 'bought_on' => $D . '10', 'supplier' => 'Bk Supplier', 'bill_no' => 'BK-77'];
$due0 = $sum()['due']['total']; $un0 = $sum()['unrec']['total']; $b2a = $bal($b2);
$cs = call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'lines' => [
  $line('Bk Panel A', 2, 10000, ['pay_book' => $b2]), $line('Bk Panel B', 1, 4000, ['pay_book' => $b2]),
  $line('Bk Panel C', 1, 1000, ['pay_book' => 0]), $line('Bk Panel D', 1, 2000), ['grp' => 'Solar panels', 'name' => 'Bk Panel E', 'qty' => 1, 'unit' => 'Nos', 'rate' => 500, 'gst' => 5, 'pay_book' => $b2]]]);
$L = array_column($cs['lines'] ?? [], null, 'name');
chk($cs['_code'] === 200 && $L['Bk Panel A']['pay_book'] === $b2 && $L['Bk Panel C']['pay_book'] === 0 && $L['Bk Panel D']['pay_book'] === null && $L['Bk Panel E']['pay_book'] === null, 'the sheet keeps Paid from per purchased line; a To buy line has none');
chk($bal($b2) == $b2a - 25200, 'purchases paid from the bank go out with GST (2 × 10,000 + 4,000, + 5%)');
$bk = $book($b2);
$pr = array_values(array_filter($bk['rows'], fn($e) => $e['kind'] === 'cost'));
chk(count($pr) === 1 && $pr[0]['amount'] == 25200 && $pr[0]['title'] === 'Purchase · Bk Supplier' && $pr[0]['ref'] === 'BK-77' && strpos($pr[0]['sub'], '2 items') !== false && $pr[0]['movable'] === 0, 'one entry per bill, with the supplier, bill no. and number of items');
$s = $sum();
chk(abs($s['due']['total'] - $due0 - 1050) < 0.01 && abs($s['unrec']['total'] - $un0 - 2100) < 0.01, 'Not paid yet counts as owed to suppliers; a purchase with nothing recorded is listed apart');
chk(call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'version' => $cs['version'], 'lines' => [$line('Bk Panel A', 2, 10000, ['pay_book' => 999999])]])['_code'] === 400, 'an account that does not exist is refused on a line');

/* the period view */
$all = call($acct, 'acc', 'ac_book', null, '&book=0' . $PER);
$one2 = $book($b2);
chk(abs($one2['close'] - $bal($b2)) < 0.01 && abs($one2['open'] + $one2['in'] - $one2['out'] - $one2['close']) < 0.01 && $one2['from'] === '2031-05-01' && $one2['to'] === '2031-05-31', 'opening + in − out = closing, and the closing balance is the account balance');
chk(!array_filter($all['rows'], fn($e) => strpos($e['title'], 'Transfer') === 0) && (bool)array_filter($one2['rows'], fn($e) => $e['title'] === 'Transfer from Cash in hand' || strpos($e['title'], 'Transfer from') === 0), 'all accounts together leaves transfers out; one account shows them');
$next = call($acct, 'acc', 'ac_book', null, "&book=$b2&period=2031-06");
chk(abs($next['open'] - $one2['close']) < 0.01 && $next['rows'] === [], 'next month opens with this month’s closing balance');
$dates = array_column($one2['rows'], 'date'); $sorted = $dates; sort($sorted);
chk($dates === $sorted, 'entries are in date order');

/* deleting */
$td = call($acct, 'acc', 'txn_delete', ['id' => $t2['id']]);
chk($td['_code'] === 200 && (int)$one("SELECT COUNT(*) FROM trash WHERE kind='Account entry'") >= 1 && call($sales, 'acc', 'txn_delete', ['id' => $t1['id']])['_code'] === 403, 'a manual entry is deleted to the Recycle bin');
chk(call($acct, 'acc', 'book_delete', ['id' => $b2])['_code'] === 400, 'an account with entries cannot be deleted');
$hid = call($acct, 'acc', 'book_save', ['id' => $b2, 'name' => 'Bk Second Bank', 'kind' => 'bank', 'opening' => 10000, 'opening_on' => $D . '01', 'hidden' => 1]);
chk($hid['_code'] === 200, 'it can be hidden instead');
$e3 = call($acct, 'acc', 'book_save', ['name' => 'Bk Empty', 'kind' => 'bank']);
$dl = call($acct, 'acc', 'book_delete', ['id' => $e3['id']]);
chk($dl['_code'] === 200 && !in_array($e3['id'], array_column($dl['books'], 'id'), true), 'an account nothing uses is deleted');
$df = call($acct, 'acc', 'book_save', ['id' => $b2, 'name' => 'Bk Second Bank', 'kind' => 'bank', 'opening' => 10000, 'opening_on' => $D . '01', 'is_default' => 1]);
chk((int)$one('SELECT COUNT(*) FROM acc_books WHERE is_default=1') === 1 && (int)$one('SELECT is_default FROM acc_books WHERE id=?', [$b2]) === 1, 'only one account is the default');
call($acct, 'acc', 'book_save', ['id' => $bank, 'name' => 'Bank account', 'kind' => 'bank', 'is_default' => 1]); /* back, for the other suites */

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
