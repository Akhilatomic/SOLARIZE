<?php
// Accounts › GST: GST collected on tax bills, input credit on purchases / supplier bills / expenses, net payable, the two registers.
// Usage: php tests/gst_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/gsjar_' . $name . '_' . getmypid() . '.txt']; }
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

echo "Accounts: GST working\n";
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$user = function ($name, $un, $role) use ($admin, $pw) { call($admin, 'admin', 'user_save', ['name' => $name, 'username' => $un, 'role' => $role, 'active' => 1, 'can_claim' => 0, 'password' => $pw]); $a = actor($un); call($a, 'auth', 'login', ['username' => $un, 'password' => $pw]); return $a; };
$acct = $user('Gs Accounts', 'gsacct', 'accounts'); $sales = $user('Gs Seller', 'gssales', 'sales');
$D = '2033-03-'; $PER = '&period=2033-03';
$gst = fn($p = null) => call($acct, 'acc', 'ac_gst', null, $p ?? $GLOBALS['PER']);
$near = fn($a, $b) => abs($a - $b) < 0.011;

$e = $gst();
chk($e['_code'] === 200 && $e['sales'] === [] && $e['purchases'] === [] && $e['net'] == 0 && $e['from'] === '2033-03-01' && $e['to'] === '2033-03-31', 'an empty month has nothing to pay');
chk(call($sales, 'acc', 'ac_gst', null, $PER)['_code'] === 403, 'no accounts access: no GST working');

/* GST collected */
$mk = function ($name, $phone) use ($admin) { $cid = (int)(call($admin, 'customers', 'save', ['name' => $name, 'phone' => $phone])['id'] ?? 0); $pid = (int)(call($admin, 'projects', 'save', ['customer_id' => $cid, 'title' => '5 kW rooftop solar', 'kw' => 5, 'cost' => 108900])['id'] ?? 0); return [$cid, $pid]; };
[$c1, $p1] = $mk('Gs Customer One', '9000000771'); [$c2, $p2] = $mk('Gs Customer Two', '9000000772'); [$c3] = $mk('Gs Customer Three', '9000000773');
$parts = ['total' => 108900, 'share' => 70, 'a' => ['title' => 'Supply', 'lines' => '', 'hsn' => '85414300', 'gst' => 5], 'b' => ['title' => 'Installation', 'lines' => '', 'hsn' => '995461', 'gst' => 18]];
$t1 = call($admin, 'gen', 'save', ['kind' => 'tax', 'early' => 1, 'customer_id' => $c1, 'issued_on' => $D . '05', 'number' => 'GS-001', 'data' => ['bill_name' => 'Gs Customer One', 'parts' => $parts, 'items' => [], 'interstate' => 0, 'grand' => 108900, 'taxable' => 100000, 'tax' => 8900]]);
$t2 = call($admin, 'gen', 'save', ['kind' => 'tax', 'early' => 1, 'customer_id' => $c2, 'issued_on' => $D . '20', 'number' => 'GS-002', 'data' => ['bill_name' => 'Gs Firm Two', 'cust_gstin' => '29ABCDE1234F1Z5', 'interstate' => 1, 'items' => [['desc' => 'Panels', 'hsn' => '85414300', 'qty' => 10, 'rate' => 5000, 'gst' => 5], ['desc' => 'Work', 'hsn' => '995461', 'qty' => 1, 'rate' => 10000, 'gst' => 18], ['desc' => '', 'qty' => 5, 'rate' => 5, 'gst' => 18]], 'grand' => 64300, 'taxable' => 60000, 'tax' => 4300]]);
call($admin, 'gen', 'save', ['kind' => 'tax', 'early' => 1, 'customer_id' => $c3, 'issued_on' => '2033-04-02', 'number' => 'GS-003', 'data' => ['parts' => $parts, 'grand' => 108900, 'taxable' => 100000, 'tax' => 8900]]);
$g = $gst();
chk($t1['_code'] === 200 && $t2['_code'] === 200 && count($g['sales']) === 2 && $g['out']['n'] === 2, 'only the bills issued in the month are counted');
chk($near($g['out']['taxable'], 160000) && $near($g['out']['tax'], 13200) && $near($g['out']['cgst'], 4450) && $near($g['out']['sgst'], 4450) && $near($g['out']['igst'], 4300), 'a Kerala bill is CGST + SGST, an interstate bill IGST');
$by = array_column($g['out']['by'], null, 'rate');
chk($near($by[5]['taxable'], 120000) && $near($by[5]['tax'], 6000) && $near($by[18]['taxable'], 40000) && $near($by[18]['tax'], 7200), 'by rate: Part A / Part B split and item lines (an empty item line is ignored)');
$s2 = array_column($g['sales'], null, 'no')['GS-002'];
chk($s2['customer'] === 'Gs Firm Two' && $s2['gstin'] === '29ABCDE1234F1Z5' && $s2['inter'] === 1 && $near($s2['taxable'], 60000) && $near($s2['tax'], 4300) && $near($s2['total'], 64300), 'the sales register carries the bill name, GSTIN and totals');

/* input credit */
call($acct, 'acc', 'supplier_save', ['name' => 'Gs Alpha Traders', 'gstin' => '32ABCDE1234F1Z5']);
call($acct, 'acc', 'supplier_save', ['name' => 'Gs Beta Electricals']);
$line = fn($name, $qty, $rate, $gstp, $x = []) => $x + ['grp' => 'Solar panels', 'name' => $name, 'qty' => $qty, 'unit' => 'Nos', 'rate' => $rate, 'gst' => $gstp, 'bought' => 1, 'bought_on' => $D . '08', 'bill_date' => $D . '07', 'supplier' => 'gs alpha traders', 'bill_no' => 'GA-1'];
$cs = call($acct, 'acc', 'cost_save', ['project_id' => $p1, 'lines' => [
  $line('Gs Panel', 10, 6000, 5), $line('Gs Cable', 100, 50, 18),
  $line('Gs Box', 1, 1000, 18, ['supplier' => 'Gs Beta Electricals', 'bill_no' => 'GB-1']),
  $line('Gs Loose', 1, 500, 18, ['supplier' => 'Gs Nobody Stores', 'bill_no' => '']),
  $line('Gs Unnamed', 1, 200, 18, ['supplier' => '', 'bill_no' => '']),
  $line('KSEB registration', 1, 5000, 18, ['grp' => 'Services and charges', 'unit' => 'Job', 'supplier' => 'KSEB', 'bill_no' => '', 'note' => 'From Finance › Fees']),
  $line('Gs Zero', 1, 900, 0), $line('Gs Next Month', 1, 1000, 18, ['bill_date' => '2033-04-01', 'bought_on' => '2033-04-01']),
  ['grp' => 'Solar panels', 'name' => 'Gs To Buy', 'qty' => 1, 'unit' => 'Nos', 'rate' => 700, 'gst' => 18]]]);
$cats = call($acct, 'acc', 'ac_expenses', null, $PER)['cats'] ?? [];
call($acct, 'acc', 'expense_save', ['date' => $D . '09', 'cat' => $cats[0] ?? '', 'amount' => 1180, 'gst' => 18, 'paid_to' => 'Gs Shop', 'mode' => 'UPI']);
call($acct, 'acc', 'expense_save', ['date' => $D . '09', 'cat' => $cats[0] ?? '', 'amount' => 500, 'gst' => 0, 'paid_to' => 'Gs Tea', 'mode' => 'Cash']);
call($acct, 'acc', 'bill_save', ['supplier' => 'Gs Alpha Traders', 'bill_no' => 'GA-STOCK', 'date' => $D . '15', 'amount' => 11800, 'gst_amt' => 1800, 'pay_book' => 0]);
$g = $gst();
$P = []; foreach ($g['purchases'] as $p) $P[$p['supplier'] . '|' . $p['bill_no']] = $p;
$a1 = $P['gs alpha traders|GA-1'] ?? [];
chk($cs['_code'] === 200 && ($a1['mark'] ?? '') === 'yes' && $near($a1['taxable'], 65000) && $near($a1['tax'], 3900) && $a1['gstin'] === '32ABCDE1234F1Z5' && $a1['date'] === $D . '07' && strpos($a1['what'], '2 items') !== false, 'a listed supplier with a GSTIN: one row per bill, marked to claim, dated by the bill');
chk(($P['Gs Beta Electricals|GB-1']['mark'] ?? '') === 'check' && ($P['Gs Nobody Stores|']['mark'] ?? '') === 'check' && ($P['Supplier not named|']['mark'] ?? '') === 'check', 'no GSTIN, an unlisted supplier or no supplier: to check');
chk(($P['KSEB|']['mark'] ?? '') === 'no' && $near($P['KSEB|']['tax'], 900), 'a KSEB fee line gives no credit');
chk(($P['Gs Shop|']['mark'] ?? '') === 'check' && $near($P['Gs Shop|']['tax'], 180) && $near($P['Gs Shop|']['taxable'], 1000) && !isset($P['Gs Tea|']), 'an office expense with GST is to check; one without GST is not listed');
chk(($P['Gs Alpha Traders|GA-STOCK']['mark'] ?? '') === 'yes' && $near($P['Gs Alpha Traders|GA-STOCK']['tax'], 1800) && $near($P['Gs Alpha Traders|GA-STOCK']['taxable'], 10000), 'a bill added directly uses the GST typed on it');
chk(count($g['purchases']) === 7, 'a 0 % line, next month’s bill and a To buy line are left out');
chk($near($g['itc']['yes'], 5700) && $near($g['itc']['check'], 180 + 90 + 36 + 180) && $near($g['itc']['no'], 900), 'credit to claim, to check and not allowed are totalled apart');
chk($near($g['net'], 13200 - 5700) && $near($g['net_if_all'], 13200 - 5700 - 486), 'net payable = collected − credit to claim; and what it is if the rows to check are valid');

/* a direct bill replaces sheet lines of the same bill */
call($acct, 'acc', 'bill_save', ['supplier' => 'Gs Alpha Traders', 'bill_no' => 'ga-1', 'date' => $D . '07', 'amount' => 70000, 'gst_amt' => 4000, 'pay_book' => 0]);
$g2 = $gst();
chk($near($g2['itc']['yes'], 1800 + 4000) && count($g2['purchases']) === 7, 'the same bill entered directly is counted once, with its own GST');

/* periods */
$fy = $gst('&period=fy-32-33');
chk($fy['from'] === '2032-04-01' && $fy['to'] === '2033-03-31' && count($fy['sales']) === 2, 'the financial year view covers April to March');
chk(count($gst('&period=2033-04')['sales']) === 1, 'next month has its own bill');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
