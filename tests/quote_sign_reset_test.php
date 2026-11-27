<?php
// Signed quotations and Settings › Reset data: the reset deletes every quotation and starts their numbers again, so it must take the signing rows,
// the share log, the signed PDFs (they are not in `files`) and the quotations' notifications with them — else quotation #1 made after a reset
// would come out signed with an old customer's PDF. A total reset wipes the shared test database: run this file LAST in tests/run_api.sh.
// Usage: php tests/quote_sign_reset_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/'); $dbPath = $argv[2] ?? '';
require_once __DIR__ . '/_onboard.php';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/qsrjar_' . $name . '_' . getmypid() . '.txt']; }
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
function sign($who, $id, $ver) { /* the admin's upload of the signed PDF (POST qm sign, multipart) */
  global $base;
  $ch = curl_init("$base/api.php?m=qm&a=sign");
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar'], CURLOPT_POST => true, CURLOPT_HTTPHEADER => ['X-Solarize: 1'],
    CURLOPT_POSTFIELDS => ['id' => $id, 'ver' => $ver, 'file' => new CURLFile(__DIR__ . '/../assets/kseb/blank.pdf', 'application/pdf', 'Signed Quote.pdf')]]);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt]; $j['_code'] = $code; return $j;
}
echo "Signed quotations: Reset data\n";
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->exec('PRAGMA busy_timeout=5000');
$n = fn($sql) => (int)$db->query($sql)->fetchColumn();
$admin = actor('admin'); $sales = actor('sales'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
call($admin, 'admin', 'user_save', ['name' => 'QS Reset Seller', 'username' => 'qsrseller', 'role' => 'sales', 'active' => 1, 'can_claim' => 0, 'password' => $pw]);
chk(call($sales, 'auth', 'login', ['username' => 'qsrseller', 'password' => $pw])['_code'] === 200, 'sales signed in');

$doc = fn($name, $price) => ['price' => $price, 'customer' => ['name' => $name], 'items' => new stdClass()];
$cust = (int)(onb($admin, 'customers', 'save', ['name' => 'Test Reset Customer', 'phone' => '9800000601'])['id'] ?? 0);
$lead = (int)(call($admin, 'leads', 'save', ['name' => 'Test Reset Lead', 'phone' => '9800000602'])['id'] ?? 0);
$qa = (int)(call($sales, 'qm', 'save', ['customer_id' => $cust, 'status' => 'Draft', 'doc' => $doc('Test Reset Customer', 150000)])['id'] ?? 0);
$qb = (int)(call($sales, 'qm', 'save', ['lead_id' => $lead, 'status' => 'Draft', 'doc' => $doc('Test Reset Lead', 160000)])['id'] ?? 0);
$qc = (int)(call($sales, 'qm', 'save', ['lead_id' => $lead, 'status' => 'Draft', 'doc' => $doc('Test Reset Lead', 170000)])['id'] ?? 0);
foreach ([$qa, $qb] as $q) { call($sales, 'qm', 'sign_req', ['id' => $q]); sign($admin, $q, call($admin, 'quotes', 'get', null, "&id=$q")['sign']['ver'] ?? ''); }
call($sales, 'qm', 'sign_req', ['id' => $qc]); /* waiting */
call($sales, 'qm', 'share_log', ['id' => $qb, 'via' => 'whatsapp', 'to_whom' => 'customer', 'to_addr' => '9800000602']);
$up = dirname($dbPath) . '/uploads';
$mine = $db->query("SELECT file FROM quote_sign WHERE file<>'' AND quote_id IN ($qa,$qb)")->fetchAll(PDO::FETCH_COLUMN);
$signed = array_values(array_filter($db->query("SELECT file FROM quote_sign WHERE file<>''")->fetchAll(PDO::FETCH_COLUMN), fn($f) => is_file("$up/" . basename($f)))); /* every signed PDF in uploads (other tests' too) */
chk($cust > 0 && $lead > 0 && count($mine) === 2 && !array_diff($mine, $signed) && $n("SELECT COUNT(*) FROM quote_sign WHERE quote_id=$qc AND req_by>0") === 1
  && $n("SELECT COUNT(*) FROM quote_log WHERE quote_id=$qb") === 1 && $n("SELECT COUNT(*) FROM notifs WHERE quote_id=$qb AND customer_id IS NULL") >= 1, 'set-up: two signed quotations (files in uploads), a waiting one, a share, lead-quotation notifications');

$r = call($admin, 'reset', 'reset', ['password' => $pw, 'confirm' => 'RESET']);
clearstatcache();
chk(($r['ok'] ?? false) === true, 'reset ran');
chk($n('SELECT COUNT(*) FROM quote_sign') === 0 && $n('SELECT COUNT(*) FROM quote_log') === 0, 'reset: quote_sign and quote_log are empty');
chk(count(array_filter($signed, fn($f) => is_file("$up/$f"))) === 0, 'reset: the signed PDFs are removed from uploads');
chk($n('SELECT COUNT(*) FROM notifs WHERE quote_id IS NOT NULL') === 0, 'reset: notifications that point at a quotation are gone');

$lead2 = (int)(call($admin, 'leads', 'save', ['name' => 'Test Reset Lead Two', 'phone' => '9800000603'])['id'] ?? 0);
$q1 = (int)(call($sales, 'qm', 'save', ['lead_id' => $lead2 ?: $lead, 'status' => 'Draft', 'doc' => $doc('Test Reset Lead Two', 180000)])['id'] ?? 0);
$g = call($sales, 'quotes', 'get', null, "&id=$q1");
$ch = curl_init("$base/api.php?m=qm&a=signed&id=$q1"); curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $sales['jar'], CURLOPT_COOKIEFILE => $sales['jar']]); curl_exec($ch); $gc = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
chk($q1 === 1 && ($g['sign']['state'] ?? 'x') === '' && $gc === 404, 'after the reset quotation #1 starts unsigned (signed GET 404)');

foreach (['admin', 'sales'] as $a) @unlink(actor($a)['jar']);
echo "\n$pass passed, $fail failed\n"; exit($fail ? 1 : 0);
