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

/* ---- step 2: ask an admin to sign / cancel ---- */
$sellerName = (string)$db->query("SELECT name FROM users WHERE username='qsseller'")->fetchColumn();
$sellerId = (int)$db->query("SELECT id FROM users WHERE username='qsseller'")->fetchColumn();
call($admin, 'admin', 'user_save', ['name' => 'QS Other', 'username' => 'qsother', 'role' => 'sales', 'active' => 1, 'can_claim' => 0, 'password' => $pw]);
$other = actor('other'); call($other, 'auth', 'login', ['username' => 'qsother', 'password' => $pw]);
call($admin, 'admin', 'user_save', ['name' => 'QS Associate', 'username' => 'qsba', 'role' => 'ba', 'active' => 1, 'can_claim' => 0, 'password' => $pw]);
$ba = actor('ba'); call($ba, 'auth', 'login', ['username' => 'qsba', 'password' => $pw]);
$q3 = (int)(call($admin, 'qm', 'save', ['lead_id' => $lead, 'status' => 'Draft', 'doc' => $doc('Test Sign Lead', 170000)])['id'] ?? 0);
$no3 = (string)$db->query("SELECT number FROM quotes WHERE id=$q3")->fetchColumn();
$nCount = fn($qid) => (int)$db->query("SELECT COUNT(*) FROM notifs WHERE kind='sign_req' AND quote_id=$qid")->fetchColumn();
$r = call($sales, 'qm', 'sign_req', ['id' => $q3]);
chk(($r['ok'] ?? false) && ($r['sign']['state'] ?? '') === 'waiting' && (int)$r['sign']['req_by'] === $sellerId, 'sign_req: sales asks, answer is ok with sign.state waiting');
$admins = array_map('intval', $db->query("SELECT id FROM users WHERE role='admin' AND active=1")->fetchAll(PDO::FETCH_COLUMN));
$want = "$sellerName asks you to sign quotation $no3 · Test Sign Lead"; $okN = count($admins) > 0;
foreach ($admins as $aid) { $st = $db->prepare("SELECT text FROM notifs WHERE kind='sign_req' AND quote_id=? AND user_id=?"); $st->execute([$q3, $aid]); $t = $st->fetchAll(PDO::FETCH_COLUMN); if ($t !== [$want]) $okN = false; }
chk($okN && $nCount($q3) === count($admins), 'sign_req: every admin gets a sign_req notif with quote_id and the exact text');
$lr = null; foreach (call($sales, 'quotes', 'list') as $x) if (is_array($x) && ($x['id'] ?? 0) == $q3) $lr = $x;
$g3 = call($sales, 'quotes', 'get', null, "&id=$q3");
chk($lr && $lr['sign_state'] === 'waiting' && $g3['sign']['state'] === 'waiting', 'sign_req: state becomes waiting on list and get');
$r = call($sales, 'qm', 'sign_req', ['id' => $q3]);
chk(($r['ok'] ?? false) && $nCount($q3) === count($admins), 'sign_req twice: ok and no second notification');
$cust2 = (int)(onb($admin, 'customers', 'save', ['name' => 'Test Sign Customer Two', 'phone' => '9800000403'])['id'] ?? 0);
$q4 = (int)(call($admin, 'qm', 'save', ['customer_id' => $cust2, 'status' => 'Draft', 'doc' => $doc('Test Sign Customer Two')])['id'] ?? 0);
call($sales, 'qm', 'sign_req', ['id' => $q4]);
chk(strpos((string)$db->query("SELECT text FROM notifs WHERE kind='sign_req' AND quote_id=$q4 LIMIT 1")->fetchColumn(), '· Test Sign Customer Two') !== false, 'sign_req: a customer quotation uses the customer name');
$mk($q4, "qs_test_$q4.pdf");
$r = call($sales, 'qm', 'sign_req', ['id' => $q4]);
chk($r['_code'] === 409 && ($r['error'] ?? '') === 'already signed', 'sign_req on a signed quotation: 409 "already signed"');
$db->exec("INSERT INTO quotes(lead_id,number,date,items,gst_rate,subsidy,terms,status,total,doc,made_by) VALUES($lead,'QS-NODOC','2026-11-26','[]',0,0,'','Draft',0,'',1)");
$q5 = (int)$db->lastInsertId();
chk(call($sales, 'qm', 'sign_req', ['id' => $q5])['_code'] === 400 && call($sales, 'qm', 'sign_req', ['id' => 99999999])['_code'] === 404, 'sign_req on a quotation without a maker doc: 400 (unknown id 404)');
chk(call($ba, 'qm', 'sign_req', ['id' => $q3])['_code'] === 403, 'sign_req: a BA gets 403');
$q6 = (int)(call($admin, 'qm', 'save', ['lead_id' => $lead, 'status' => 'Draft', 'doc' => $doc('Test Sign Lead', 180000)])['id'] ?? 0);
$r = call($admin, 'qm', 'sign_req', ['id' => $q6]);
chk(($r['ok'] ?? false) && $nCount($q6) === 0 && ($r['sign']['state'] ?? 'x') === '', 'sign_req by an admin: ok, no request created, no notification');
chk(call($other, 'qm', 'sign_cancel', ['id' => $q3])['_code'] === 403 && ($db->query("SELECT req_by FROM quote_sign WHERE quote_id=$q3")->fetchColumn() == $sellerId), 'sign_cancel by another sales user: 403, request stays');
$r = call($sales, 'qm', 'sign_cancel', ['id' => $q3]);
chk(($r['ok'] ?? false) && ($r['sign']['state'] ?? 'x') === '' && (int)$db->query("SELECT COUNT(*) FROM quote_sign WHERE quote_id=$q3")->fetchColumn() === 0, 'sign_cancel by the requester clears it');
call($sales, 'qm', 'sign_req', ['id' => $q3]);
$r = call($admin, 'qm', 'sign_cancel', ['id' => $q3]);
chk(($r['ok'] ?? false) && ($r['sign']['state'] ?? 'x') === '', 'sign_cancel by an admin: ok');
$r = call($sales, 'qm', 'sign_cancel', ['id' => $q3]);
chk(($r['ok'] ?? false) && ($r['sign']['state'] ?? 'x') === '', 'sign_cancel with nothing waiting: ok');
chk(call($sales, 'qm', 'sign_cancel', ['id' => $q4])['_code'] === 409, 'sign_cancel on a signed quotation: 409 (the signed copy stays)');
call($sales, 'qm', 'sign_req', ['id' => $q3]);
$db->prepare('INSERT INTO quote_log(quote_id,via,to_whom,to_addr,user_id) VALUES(?,?,?,?,?)')->execute([$q3, 'email', 'customer', 'x@example.com', $sellerId]);
$si = call($sales, 'qm', 'sign_info', null, "&id=$q3");
chk(($si['sign']['state'] ?? '') === 'waiting' && count($si['shares'] ?? []) === 1 && $si['shares'][0]['via'] === 'email' && $si['shares'][0]['to_addr'] === 'x@example.com' && $si['shares'][0]['who'] === $sellerName && !empty($si['shares'][0]['created']), 'sign_info: sales gets state and shares');
chk(call($ba, 'qm', 'sign_info', null, "&id=$q3")['_code'] === 403, 'sign_info: a BA gets 403');
for ($i = 0; $i < 6; $i++) $db->prepare('INSERT INTO quote_log(quote_id,via,to_whom) VALUES(?,?,?)')->execute([$q3, 'whatsapp', 'customer']);
chk(count(call($sales, 'qm', 'sign_info', null, "&id=$q3")['shares']) === 5, 'sign_info: only the latest 5 shares');


/* ---- step 3: the admin signs (uploads the signed PDF), everyone downloads it ---- */
function mcall($who, $a, $fields, $file = true, $qs = '') {
  global $base; $pdf = __DIR__ . '/../assets/kseb/blank.pdf';
  $ch = curl_init("$base/api.php?m=qm&a=$a$qs");
  $post = $fields; if ($file) $post['file'] = new CURLFile($pdf, 'application/pdf', 'Signed Quote.pdf');
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar'], CURLOPT_POST => true, CURLOPT_POSTFIELDS => $post, CURLOPT_HTTPHEADER => ['X-Solarize: 1']]);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt]; $j['_code'] = $code; return $j;
}
function rawget($who, $qs) {
  global $base; $ch = curl_init("$base/api.php?m=qm&a=signed$qs");
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar']]);
  $res = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); $hs = curl_getinfo($ch, CURLINFO_HEADER_SIZE); curl_close($ch);
  return ['code' => $code, 'head' => substr($res, 0, $hs), 'body' => substr($res, $hs)];
}
$pdfBytes = file_get_contents(__DIR__ . '/../assets/kseb/blank.pdf');
$adminId = (int)$db->query("SELECT id FROM users WHERE username='boss'")->fetchColumn();
$admName = (string)$db->query("SELECT name FROM users WHERE username='boss'")->fetchColumn();
$qS = (int)(call($admin, 'qm', 'save', ['customer_id' => $cust2, 'status' => 'Draft', 'doc' => $doc('Test Sign Customer Two', 190000)])['id'] ?? 0); $otherId = (int)$db->query("SELECT id FROM users WHERE username='qsother'")->fetchColumn(); $db->exec("UPDATE quotes SET made_by=$otherId WHERE id=$qS");
call($sales, "qm", "sign_req", ["id" => $qS]);
$noS = (string)$db->query("SELECT number FROM quotes WHERE id=$qS")->fetchColumn();
$verS = call($admin, 'quotes', 'get', null, "&id=$qS")['sign']['ver'];
chk(mcall($sales, 'sign', ['id' => $qS, 'ver' => $verS])['_code'] === 403, 'sign: sales gets 403');
chk(mcall($ba, 'sign', ['id' => $qS, 'ver' => $verS])['_code'] === 403, 'sign: a BA gets 403');
chk(mcall($admin, 'sign', ['id' => 99999999, 'ver' => $verS])['_code'] === 404, 'sign: unknown quotation 404');
chk(mcall($admin, 'sign', ['id' => $q5, 'ver' => 'x'])['_code'] === 400, 'sign: a quotation without a maker doc 400');
$r = mcall($admin, 'sign', ['id' => $qS, 'ver' => str_repeat('0', 40)]);
chk($r['_code'] === 409 && ($r['error'] ?? '') === 'This quotation was changed — open it again' && ($r['quiet'] ?? null) === 0 && (string)$db->query("SELECT COALESCE(file,'') FROM quote_sign WHERE quote_id=$qS")->fetchColumn() === '', 'stale version refused (409, nothing stored)');
chk(mcall($admin, 'sign', ['id' => $qS, 'ver' => $verS], false)['_code'] === 400, 'sign: no file 400');
$db->exec("UPDATE quotes SET updated='2026-01-01 00:00:00', edit_by='' WHERE id=$qS"); $beforeEdit = $db->query("SELECT updated||'|'||COALESCE(edit_by,'') FROM quotes WHERE id=$qS")->fetchColumn();
$db->exec("DELETE FROM notifs WHERE quote_id=$qS");
$r = mcall($admin, 'sign', ['id' => $qS, 'ver' => $verS]);
$sr = $db->query("SELECT * FROM quote_sign WHERE quote_id=$qS")->fetch();
$stored = $sr ? $dir . '/' . $sr['file'] : '';
chk(($r['ok'] ?? false) && ($r['sign']['state'] ?? '') === 'signed' && $sr && preg_match('/^[0-9a-f]{24}\.pdf$/', $sr['file']) && is_file($stored) && file_get_contents($stored) === $pdfBytes && $sr['name'] === 'Signed Quote.pdf' && (int)$sr['signed_by'] === $adminId && (int)$sr['req_by'] === 0 && $sr['ver'] === $verS && (int)$sr['size'] === strlen($pdfBytes), 'sign: admin stores the file, state signed, req cleared');
$sd = json_decode((string)$db->query("SELECT doc FROM quotes WHERE id=$qS")->fetchColumn(), true);
chk(($sd['seal'] ?? null) === true && $db->query("SELECT updated||'|'||COALESCE(edit_by,'') FROM quotes WHERE id=$qS")->fetchColumn() === $beforeEdit && call($admin, 'quotes', 'get', null, "&id=$qS")['sign']['ver'] === $verS, 'sign: doc.seal true, updated/edit_by untouched, ver unchanged');
$nt = fn($qid, $uid) => $db->query("SELECT text FROM notifs WHERE kind='signed' AND quote_id=$qid AND user_id=$uid")->fetchAll(PDO::FETCH_COLUMN);
$wantSigned = "$admName added the seal & signature to quotation $noS · Test Sign Customer Two";
chk($nt($qS, $adminId) === [] && $nt($qS, $sellerId) === [$wantSigned] && $nt($qS, $otherId) === [$wantSigned], 'signed: creator and requester notified once each with the exact text; the admin is not');
$cf = $db->query("SELECT * FROM files WHERE customer_id=$cust2 AND gen='quote:$qS'")->fetchAll();
chk(count($cf) === 1 && $cf[0]['kind'] === 'gen' && $cf[0]['item'] === "Quotation $noS · signed" && $cf[0]['life'] !== null && (int)$cf[0]['life'] === 0 && $cf[0]['path'] !== $sr['file'] && is_file("$dir/" . $cf[0]['path']) && file_get_contents("$dir/" . $cf[0]['path']) === $pdfBytes, 'signed: customer quotation → Documents copy gen quote:<id>, life 0, item "Quotation <no> · signed", a separate copy');
/* lead quotation: no files row */
$qL = (int)(call($sales, 'qm', 'save', ['lead_id' => $lead, 'status' => 'Draft', 'doc' => $doc('Test Sign Lead', 195000)])['id'] ?? 0);
$verL = call($admin, 'quotes', 'get', null, "&id=$qL")['sign']['ver'];
$filesBefore = (int)$db->query('SELECT COUNT(*) FROM files')->fetchColumn();
$r = mcall($admin, 'sign', ['id' => $qL, 'ver' => $verL]);
chk(($r['ok'] ?? false) && (int)$db->query('SELECT COUNT(*) FROM files')->fetchColumn() === $filesBefore, 'signed: lead quotation → no files row');
/* re-sign */
$oldFile = $sr['file']; $oldDoc = $cf[0]['path'];
$r = mcall($admin, 'sign', ['id' => $qS, 'ver' => $verS]);
$sr2 = $db->query("SELECT * FROM quote_sign WHERE quote_id=$qS")->fetch();
$tdir2 = dirname($dbPath) . '/trash';
$inBin = (int)$db->query("SELECT COUNT(*) FROM trash WHERE kind='Signed quotation'")->fetchColumn() >= 1;
$cf2 = $db->query("SELECT * FROM files WHERE customer_id=$cust2 AND gen='quote:$qS'")->fetchAll();
chk(($r['ok'] ?? false) && $sr2['file'] !== $oldFile && is_file("$dir/" . $sr2['file']) && !is_file("$dir/$oldFile") && is_file("$tdir2/$oldFile") && $inBin, 're-sign: older file goes to the Recycle bin');
chk(count($cf2) === 1 && $cf2[0]['path'] !== $oldDoc, 're-sign: the Documents copy is replaced, still one');
$wantUpd = "$admName updated the signed quotation $noS · Test Sign Customer Two";
chk($nt($qS, $otherId) === [$wantSigned, $wantUpd], 're-sign: notif text "updated the signed quotation"');
/* GET */
$g1 = rawget($sales, "&id=$qS"); $g2 = rawget($sales, "&id=$qS&dl=1");
chk($g1['code'] === 200 && $g1['body'] === $pdfBytes && stripos($g1['head'], 'application/pdf') !== false && stripos($g1['head'], 'inline; filename="Signed Quote.pdf"') !== false && stripos($g1['head'], 'private, no-store') !== false, 'signed GET: sales downloads the same bytes, inline');
chk($g2['code'] === 200 && stripos($g2['head'], 'attachment; filename="Signed Quote.pdf"') !== false, 'signed GET: dl=1 is an attachment');
chk(rawget($ba, "&id=$qS")['code'] === 403 && rawget($sales, '&id=99999999')['code'] === 404 && rawget($sales, "&id=$q6")['code'] === 404, 'signed GET: BA 403; unknown id 404; unsigned quotation 404');

/* a stored doc that is not a JSON object cannot be signed: 400, no file, no row */
$qB = (int)(call($admin, 'qm', 'save', ['lead_id' => $lead, 'status' => 'Draft', 'doc' => $doc('Test Sign Lead', 196000)])['id'] ?? 0);
$db->exec("UPDATE quotes SET doc='[1,2]' WHERE id=$qB");
$upBefore = count(glob("$dir/*.pdf"));
$r = mcall($admin, 'sign', ['id' => $qB, 'ver' => qs_ver([1, 2])]);
chk($r['_code'] === 400 && ($r['error'] ?? '') === 'This quotation cannot be signed' && !(int)$db->query("SELECT COUNT(*) FROM quote_sign WHERE quote_id=$qB")->fetchColumn() && count(glob("$dir/*.pdf")) === $upBefore, 'sign: a non-object doc is refused (400), nothing stored');
/* the Documents copy failing (copy() returns false) is not reachable without breaking the filesystem: not tested */

echo "\n$pass passed, $fail failed\n"; exit($fail ? 1 : 0);
