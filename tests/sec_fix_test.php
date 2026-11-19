<?php
// Security fixes: the WhatsApp webhook takes signed posts only, access tokens are stored encrypted,
// the Meta cron key may come in a header, and a deleted customer is gone in one piece.
// Usage: php tests/sec_fix_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { $j = sys_get_temp_dir() . '/sfjar_' . $name . '_' . getmypid() . '.txt'; @unlink($j); return ['jar' => $j]; }
function call($who, $m, $a, $body = null, $qs = '', $hdr = [], $rawBody = null) {
  global $base;
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs");
  $h = array_merge(['X-Solarize: 1'], $hdr);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true]);
  if ($who) curl_setopt_array($ch, [CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar']]);
  if ($rawBody !== null) { curl_setopt($ch, CURLOPT_POST, true); $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, $rawBody); }
  elseif ($body !== null) { curl_setopt($ch, CURLOPT_POST, true); $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = [];
  $j['_text'] = (string)$txt; $j['_code'] = $code; return $j;
}
echo "Security fixes\n";
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->exec('PRAGMA busy_timeout=8000');
$one = function ($sql, $a = []) use ($db) { $s = $db->prepare($sql); $s->execute($a); return $s->fetchColumn(); };
$setting = fn($k) => json_decode((string)$one('SELECT v FROM settings WHERE k=?', [$k]), true) ?: [];

/* --- Meta cron key: header or (older jobs) address; before any token is saved the sync answers "not connected" --- */
$key = (string)(call($admin, 'meta', 'config')['cron_key'] ?? '');
chk(strlen($key) >= 16, 'a cron key exists');
chk(call(null, 'meta', 'cron')['_code'] === 403 && call(null, 'meta', 'cron', null, '', ['X-Cron-Key: wrong'])['_code'] === 403 && call(null, 'meta', 'cron', null, '&key=')['_code'] === 403, 'cron without the key, or with a wrong one, is refused');
chk(call(null, 'meta', 'cron', null, '', ['X-Cron-Key: ' . $key])['_code'] === 200, 'cron takes the key from the X-Cron-Key header');
chk(call(null, 'meta', 'cron', null, '&key=' . $key)['_code'] === 200, 'a cron job set up earlier (key in the address) still works');

/* --- tokens are stored encrypted --- */
$tok = 'EAATESTtoken' . bin2hex(random_bytes(8)) . 'WXYZ';
/* a token saved before this change sits in the database as typed: it is read as it is, and locked at that moment */
$old = $setting('meta_cfg'); $old['token'] = $tok; $old['page_id'] = '';
$db->prepare("INSERT INTO settings(k,v) VALUES('meta_cfg',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v")->execute([json_encode($old)]);
$c = call($admin, 'meta', 'config');
chk(($c['token_set'] ?? false) === true && substr((string)$c['token_hint'], -4) === 'WXYZ', 'a token saved in the old way is still read');
chk(strncmp((string)($setting('meta_cfg')['token'] ?? ''), 'enc:', 4) === 0 && strpos((string)$one("SELECT v FROM settings WHERE k='meta_cfg'"), $tok) === false, '...and is encrypted in the database from then on');
chk(($setting('meta_cfg')['cron_key'] ?? '') === $key, 'the other Meta settings are untouched');
call($admin, 'meta', 'save', ['page_id' => '', 'form_ids' => '', 'clear_token' => 1]);
chk(($setting('meta_cfg')['token'] ?? 'x') === '' && call($admin, 'meta', 'config')['token_set'] === false, 'Disconnect empties the token');

$secret = 'appsecret' . bin2hex(random_bytes(6)); $wtok = 'EAAWAtoken' . bin2hex(random_bytes(8)) . 'QRST';
$hook = fn($raw, $hdr = []) => call(null, 'wa', 'hook', null, '', $hdr, $raw);
$msg = json_encode(['entry' => [['changes' => [['value' => ['metadata' => ['phone_number_id' => '1555000111'], 'statuses' => []]]]]]]);

/* --- WhatsApp webhook: nothing is taken in without a saved App Secret --- */
$wa0 = $setting('wa_cfg'); $wa0['app_secret'] = ''; if ($wa0) $db->prepare("UPDATE settings SET v=? WHERE k='wa_cfg'")->execute([json_encode($wa0)]);
$r = $hook($msg);
chk($r['_code'] === 403, 'webhook post without a saved App Secret is refused (was accepted)');
call($admin, 'wa', 'save', ['phone_id' => '1555000111', 'waba_id' => '1555000222', 'token' => $wtok, 'app_secret' => $secret]);
$raw = (string)$one("SELECT v FROM settings WHERE k='wa_cfg'");
chk(strpos($raw, $wtok) === false && strpos($raw, $secret) === false && strncmp((string)$setting('wa_cfg')['token'], 'enc:', 4) === 0 && strncmp((string)$setting('wa_cfg')['app_secret'], 'enc:', 4) === 0, 'WhatsApp token and App Secret are encrypted in the database');
$c = call($admin, 'wa', 'config');
chk(($c['token_set'] ?? false) === true && substr((string)$c['token_hint'], -4) === 'QRST' && ($c['secret_set'] ?? false) === true, '...and still read by the CRM');
chk($hook($msg)['_code'] === 401 && $hook($msg, ['X-Hub-Signature-256: sha256=' . hash_hmac('sha256', $msg, 'other')])['_code'] === 401, 'an unsigned or wrongly signed post is refused');
chk($hook($msg, ['X-Hub-Signature-256: sha256=' . hash_hmac('sha256', $msg, $secret)])['_code'] === 200, 'a post signed with the App Secret is taken in');
call($admin, 'wa', 'save', ['phone_id' => '', 'waba_id' => '', 'disconnect' => 1]);

/* --- delete in one piece --- */
$cid = (int)(call($admin, 'customers', 'save', ['name' => 'Atomic Delete Test', 'phone' => '9000000911', 'no_quote' => 1, 'plant_cost' => 100000])['id'] ?? 0);
if (!$cid) $cid = (int)$one("SELECT id FROM customers WHERE name='Atomic Delete Test' ORDER BY id DESC LIMIT 1");
if ($cid) {
  call($admin, 'notes', 'add', ['entity' => 'customers', 'entity_id' => $cid, 'text' => 'to be deleted']);
  $r = call($admin, 'customers', 'delete', ['id' => $cid]);
  chk($r['_code'] === 200 && !$one('SELECT 1 FROM customers WHERE id=?', [$cid]) && !$one('SELECT 1 FROM projects WHERE customer_id=?', [$cid]) && !$one("SELECT 1 FROM notes WHERE entity='customers' AND entity_id=?", [$cid]), 'a customer is deleted with everything under it');
  chk((int)$one("SELECT COUNT(*) FROM trash WHERE label LIKE 'Atomic Delete Test%'") >= 1, '...and sits in the Recycle bin');
  /* while another connection holds the write lock the delete waits its turn or fails as a whole - never half */
  $l2 = (int)(call($admin, 'leads', 'save', ['name' => 'Atomic Lead Test', 'phone' => '9000000912'])['id'] ?? 0);
  $db->exec('PRAGMA busy_timeout=0'); $db->exec('BEGIN IMMEDIATE');
  $t0 = microtime(true); $r = call($admin, 'leads', 'delete', ['id' => $l2]); $db->exec('ROLLBACK');
  chk($r['_code'] === 500 && (bool)$one('SELECT 1 FROM leads WHERE id=?', [$l2]) && !(int)$one("SELECT COUNT(*) FROM trash WHERE label LIKE 'Atomic Lead Test%'"), 'a delete that cannot get the database changes nothing (no Recycle bin entry, lead intact)');
  chk(call($admin, 'leads', 'delete', ['id' => $l2])['_code'] === 200 && !$one('SELECT 1 FROM leads WHERE id=?', [$l2]), '...and goes through on the next try');
} else chk(false, 'could not add a customer to delete');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
