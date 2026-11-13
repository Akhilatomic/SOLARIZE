<?php
// Password storage, cross-site request refusal and the one-request start-up.
// Usage: php tests/harden_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { $j = sys_get_temp_dir() . '/hdjar_' . $name . '_' . getmypid() . '.txt'; @unlink($j); return ['jar' => $j]; }
function call($who, $m, $a, $body = null, $qs = '', $hdr = []) {
  global $base;
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs");
  $h = array_merge(['X-Solarize: 1'], $hdr);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar'], CURLOPT_HEADER => true]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POST, true); $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $txt = (string)curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); $hs = curl_getinfo($ch, CURLINFO_HEADER_SIZE); curl_close($ch);
  $j = json_decode(substr($txt, $hs), true); if (!is_array($j)) $j = ['_text' => substr($txt, $hs)];
  $j['_code'] = $code; $j['_head'] = substr($txt, 0, $hs); return $j;
}

echo "Sign-in and request hardening\n";
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->exec('PRAGMA busy_timeout=5000');
$one = fn($sql, $a = []) => (function () use ($db, $sql, $a) { $s = $db->prepare($sql); $s->execute($a); return $s->fetchColumn(); })();

// ---- start-up in one request ----
$s = call($admin, 'auth', 'status', null, '&boot=1');
chk($s['auth'] === true && is_array($s['settings'] ?? null) && isset($s['settings']['company'], $s['settings']['modules']), 'status?boot=1 carries the settings for a signed-in user');
$g = call($admin, 'settings', 'get');
chk(json_encode($g['company']) === json_encode($s['settings']['company']) && array_keys($s['settings']) == array_values(array_diff(array_keys($g), ['_code', '_head'])), 'they are the same settings settings/get answers');
$anon = actor('anon'); $s0 = call($anon, 'auth', 'status', null, '&boot=1');
chk($s0['auth'] === false && !isset($s0['settings']), 'signed out: no settings');
chk(stripos($s['_head'], 'Cross-Origin-Opener-Policy: same-origin-allow-popups') !== false, 'API answers carry Cross-Origin-Opener-Policy');
chk(stripos($g['_head'], 'Cross-Origin-Resource-Policy: same-origin') !== false, 'signed-in answers carry Cross-Origin-Resource-Policy');

// ---- requests started by another website ----
$x = call($admin, 'customers', 'list', null, '', ['Sec-Fetch-Site: cross-site', 'Sec-Fetch-Mode: cors']);
chk($x['_code'] === 403, 'a cross-site read is refused (403)');
$x = call($admin, 'notes', 'save', ['text' => 'x'], '', ['Sec-Fetch-Site: cross-site', 'Sec-Fetch-Mode: cors']);
chk($x['_code'] === 403, 'a cross-site write is refused (403)');
$x = call($admin, 'auth', 'status', null, '', ['Sec-Fetch-Site: cross-site', 'Sec-Fetch-Mode: navigate']);
chk($x['_code'] === 200, 'a link opened from another site still loads');
$x = call($admin, 'customers', 'list', null, '', ['Sec-Fetch-Site: same-origin', 'Sec-Fetch-Mode: cors']);
chk($x['_code'] === 200, 'the CRM\'s own requests pass');

// ---- password storage ----
$un = 'tf' . getmypid(); $r = call($admin, 'admin', 'user_save', ['name' => 'Two Step', 'username' => $un, 'role' => 'sales', 'active' => 1, 'password' => $pw]);
$uid = (int)($r['id'] ?? 0); chk($uid > 0, 'user made');
$hash = (string)$one('SELECT hash FROM users WHERE id=?', [$uid]);
chk(!defined('PASSWORD_ARGON2ID') || strncmp($hash, '$argon2id$', 10) === 0, 'new passwords are stored with Argon2id');
$db->prepare('UPDATE users SET hash=? WHERE id=?')->execute([password_hash($pw, PASSWORD_BCRYPT), $uid]);
$u = actor($un); $r = call($u, 'auth', 'login', ['username' => $un, 'password' => $pw]);
chk($r['_code'] === 200, 'signs in with an older (bcrypt) hash');
chk(!defined('PASSWORD_ARGON2ID') || strncmp((string)$one('SELECT hash FROM users WHERE id=?', [$uid]), '$argon2id$', 10) === 0, 'the old hash is upgraded at sign-in');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
