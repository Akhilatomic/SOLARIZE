<?php
// Signed quotations, step 1: storage, version token, state on lists/get, Recycle bin keeps the signed copy.
// Usage: php tests/quote_sign_api_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/'); $dbPath = $argv[2] ?? '';
require_once __DIR__ . '/_onboard.php';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/qsjar_' . $name . '_' . getmypid() . '.txt']; }
function call($who, $m, $a, $body = null, $qs = '') {
  global $base;
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs"); $h = ['X-Solarize: 1'];
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar']]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POST, true); $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt];
  $j['_code'] = $code; return $j;
}
echo "Signed quotations: storage, version, state\n";
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$db->exec('PRAGMA busy_timeout=5000');
$admin = actor('admin'); $sales = actor('sales'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$u = call($admin, 'admin', 'user_save', ['name' => 'QS Seller', 'username' => 'qsseller', 'role' => 'sales', 'active' => 1, 'can_claim' => 0, 'password' => $pw]);
chk(!empty($u['id']), 'sales user created');
chk(call($sales, 'auth', 'login', ['username' => 'qsseller', 'password' => $pw])['_code'] === 200, 'sales signed in');

$cols = fn($t) => array_column($db->query("PRAGMA table_info($t)")->fetchAll(), 'name');
chk($cols('quote_sign') === ['quote_id', 'req_by', 'req_at', 'signed_by', 'signed_at', 'file', 'name', 'size', 'ver'] && $cols('quote_log') === ['id', 'quote_id', 'via', 'to_whom', 'to_addr', 'user_id', 'created'] && in_array('quote_id', $cols('notifs'), true),
  'schema: quote_sign and quote_log exist, notifs has quote_id');
chk((int)$db->query('PRAGMA user_version')->fetchColumn() >= 80, 'schema version is 80');

$doc = fn($name, $price = 150000) => ['price' => $price, 'customer' => ['name' => $name], 'items' => new stdClass()];
$lead = (int)(call($admin, 'leads', 'save', ['name' => 'Test Sign Lead', 'phone' => '9800000401'])['id'] ?? 0);
$cust = (int)(onb($admin, 'customers', 'save', ['name' => 'Test Sign Customer', 'phone' => '9800000402'])['id'] ?? 0);
chk($lead > 0 && $cust > 0, 'lead and customer made');
$q1 = (int)(call($admin, 'qm', 'save', ['lead_id' => $lead, 'status' => 'Draft', 'doc' => $doc('Test Sign Lead')])['id'] ?? 0);
$q2 = (int)(call($admin, 'qm', 'save', ['customer_id' => $cust, 'status' => 'Draft', 'doc' => $doc('Test Sign Customer')])['id'] ?? 0);
chk($q1 > 0 && $q2 > 0, 'two maker quotations saved');

$byId = []; foreach (call($sales, 'quotes', 'list') as $x) if (is_array($x) && isset($x['id'])) $byId[(int)$x['id']] = $x;
chk(isset($byId[$q1]) && $byId[$q1]['sign_state'] === '' && array_key_exists('signed_at', $byId[$q1]) && (int)$byId[$q1]['maker'] === 1, "quotes list: an unsigned quotation has sign_state '' and maker 1");
$g = call($sales, 'quotes', 'get', null, "&id=$q1");
chk(($g['sign']['state'] ?? 'x') === '' && preg_match('/^[0-9a-f]{40}$/', $g['sign']['ver'] ?? '') === 1 && ($g['sign']['sealed'] ?? null) === false, "quotes get: sign.state '' and a 40-char ver");

require_once __DIR__ . '/../api/quote_sign.php';
$a = ['price' => 150000, 'customer' => ['name' => 'X', 'mobile' => '1'], 'items' => ['panels' => [['pid' => 1, 'qty' => 4], ['pid' => 2, 'qty' => 1]]], 'number' => 'QT-1'];
$b = ['number' => 'QT-9', 'seal' => true, 'items' => ['panels' => [['qty' => 4, 'pid' => 1], ['qty' => 1, 'pid' => 2]]], 'customer' => ['mobile' => '1', 'name' => 'X'], 'price' => 150000];
chk(qs_ver($a) === qs_ver($b), 'ver ignores seal and number (and key order)');
chk(qs_ver($a) !== qs_ver(['price' => 160000] + $a), 'ver changes with the price');
$c = $a; $c['items']['panels'] = array_reverse($c['items']['panels']);
chk(qs_ver($a) !== qs_ver($c), 'ver keeps list order');
$v0 = $g['sign']['ver'];
call($admin, 'qm', 'save', ['id' => $q1, 'lead_id' => $lead, 'status' => 'Draft', 'doc' => $doc('Test Sign Lead') + ['seal' => true]]);
$g2 = call($admin, 'quotes', 'get', null, "&id=$q1");
chk(($g2['sign']['sealed'] ?? null) === true && $g2['sign']['ver'] === $v0, 'a sealed save keeps the ver and reports sealed');
call($admin, 'qm', 'save', ['id' => $q1, 'lead_id' => $lead, 'status' => 'Draft', 'doc' => $doc('Test Sign Lead', 160000)]);
chk(call($admin, 'quotes', 'get', null, "&id=$q1")['sign']['ver'] !== $v0, 'a price change changes the ver through the API');

/* a signed copy in uploads goes to the Recycle bin with the quotation and comes back with it */
$dir = dirname($dbPath) . '/uploads'; $tdir = dirname($dbPath) . '/trash'; if (!is_dir($dir)) mkdir($dir, 0750, true);
$mk = function ($qid, $fn) use ($db, $dir) { file_put_contents("$dir/$fn", "%PDF-1.4 signed\n"); $db->prepare("INSERT OR REPLACE INTO quote_sign(quote_id,req_by,req_at,signed_by,signed_at,file,name,size,ver) VALUES(?,1,'2026-11-26 10:00:00',1,'2026-11-26 11:00:00',?,?,16,'v')")->execute([$qid, $fn, 'signed.pdf']); };
$stateOf = function ($who, $qid) { foreach (call($who, 'quotes', 'list') as $x) if (is_array($x) && ($x['id'] ?? 0) == $qid) return $x['sign_state'] . '|' . $x['signed_at']; return 'missing'; };
$mk($q1, "qs_test_$q1.pdf");
chk($stateOf($sales, $q1) === 'signed|2026-11-26 11:00:00', 'quotes list shows signed and the date for a signed quotation');
chk(call($sales, 'quotes', 'get', null, "&id=$q1")['sign']['state'] === 'signed', 'quotes get shows signed');
$db->prepare("UPDATE quote_sign SET file='' WHERE quote_id=?")->execute([$q1]);
chk(str_starts_with($stateOf($sales, $q1), 'waiting|'), 'a request without a file is waiting');
$db->prepare('UPDATE quote_sign SET file=? WHERE quote_id=?')->execute(["qs_test_$q1.pdf", $q1]);
$db->prepare('INSERT INTO quote_log(quote_id,via,to_whom) VALUES(?,?,?)')->execute([$q1, 'whatsapp', 'customer']);
$d = call($admin, 'quotes', 'delete', ['id' => $q1]);
chk(($d['ok'] ?? false) && !is_file("$dir/qs_test_$q1.pdf") && !(int)$db->query("SELECT COUNT(*) FROM quote_sign WHERE quote_id=$q1")->fetchColumn() && !(int)$db->query("SELECT COUNT(*) FROM quote_log WHERE quote_id=$q1")->fetchColumn(), 'delete: the signed copy leaves uploads and the rows go');
$tid = 0; foreach (call($admin, 'trash', 'list')['rows'] ?? [] as $t) if ($t['kind'] === 'Quotation' && ($t['files'] ?? 0) == 1) { $tid = (int)$t['id']; break; }
chk($tid > 0 && is_file("$tdir/qs_test_$q1.pdf"), 'the signed copy sits in the Recycle bin');
$rs = call($admin, 'trash', 'restore', ['id' => $tid]);
chk(($rs['ok'] ?? false) && is_file("$dir/qs_test_$q1.pdf") && (int)$db->query("SELECT COUNT(*) FROM quote_sign WHERE quote_id=$q1")->fetchColumn() === 1 && (int)$db->query("SELECT COUNT(*) FROM quotes WHERE id=$q1")->fetchColumn() === 1, 'restore: quotation, row and file are back');
chk(call($admin, 'quotes', 'get', null, "&id=$q1")['sign']['state'] === 'signed', 'restored quotation is signed again');
chk((int)$db->query("SELECT COUNT(*) FROM quote_log WHERE quote_id=$q1 AND via='whatsapp'")->fetchColumn() === 1, 'restore: the share log row is back');

/* customer get rows, and deleting the customer keeps the signed copy in the bin too */
$mk($q2, "qs_test_$q2.pdf");
$cg = call($admin, 'customers', 'get', null, "&id=$cust"); $row = null; foreach ($cg['quotes'] ?? [] as $x) if (($x['id'] ?? 0) == $q2) $row = $x;
chk($row && $row['sign_state'] === 'signed' && $row['signed_at'] === '2026-11-26 11:00:00' && (int)$row['maker'] === 1, 'customer get quotes rows carry sign_state, signed_at and maker');
call($admin, 'customers', 'delete', ['id' => $cust]);
chk(!is_file("$dir/qs_test_$q2.pdf") && is_file("$tdir/qs_test_$q2.pdf") && !(int)$db->query("SELECT COUNT(*) FROM quote_sign WHERE quote_id=$q2")->fetchColumn(), 'deleting a customer moves its signed copies to the Recycle bin');

/* notifications can point at a quotation */
$bossId = (int)$db->query("SELECT id FROM users WHERE username='boss'")->fetchColumn();
$db->prepare('INSERT INTO notifs(user_id,kind,quote_id,text) VALUES(?,?,?,?)')->execute([$bossId, 'sign_req', $q1, 'probe']);
$hit = null; foreach (call($admin, 'disc', 'notifs')['rows'] ?? [] as $n) if (($n['text'] ?? '') === 'probe') $hit = $n;
chk($hit && (int)$hit['quote_id'] === $q1 && ($hit['quote_no'] ?? '') !== '', 'notifs feed returns quote_id and quote_no');
$db->exec("DELETE FROM notifs WHERE text='probe'");

echo "\n$pass passed, $fail failed\n"; exit($fail ? 1 : 0);
