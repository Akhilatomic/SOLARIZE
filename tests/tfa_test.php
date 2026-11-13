<?php
// Two-step sign-in, password storage, cross-site request refusal and the one-request start-up.
// Usage: php tests/tfa_test.php http://localhost:8094 <path to crm.sqlite>
require __DIR__ . '/../api/twofa.php'; // tfa_code() / tfa_b32() are pure
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { $j = sys_get_temp_dir() . '/tfjar_' . $name . '_' . getmypid() . '.txt'; @unlink($j); return ['jar' => $j]; }
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

echo "Two-step sign-in and request hardening\n";
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200 && empty($r['need2']), 'admin signed in');
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
chk($r['_code'] === 200 && empty($r['need2']), 'signs in with an older (bcrypt) hash');
chk(!defined('PASSWORD_ARGON2ID') || strncmp((string)$one('SELECT hash FROM users WHERE id=?', [$uid]), '$argon2id$', 10) === 0, 'the old hash is upgraded at sign-in');

// ---- switching two-step on ----
$st = call($u, 'auth', 'tfa_status'); chk($st['_code'] === 200 && $st['on'] === false, 'two-step is off at first');
$b = call($u, 'auth', 'tfa_begin', ['password' => 'wrong-pass1']); chk($b['_code'] === 403, 'turning on needs the right password');
$b = call($u, 'auth', 'tfa_begin', ['password' => $pw]);
chk($b['_code'] === 200 && preg_match('/^[A-Z2-7]{32}$/', $b['secret'] ?? '') && strpos($b['uri'], 'otpauth://totp/') === 0 && strpos($b['uri'], $b['secret']) !== false, 'a key and an authenticator link come back');
$secret = $b['secret']; $now = fn() => intdiv(time(), 30);
chk((string)$one('SELECT totp FROM users WHERE id=?', [$uid]) === '', 'not on until a code proves the app has the key');
$e = call($u, 'auth', 'tfa_enable', ['code' => '000000']);
chk($e['_code'] === 400 || (tfa_code($secret, $now()) === '000000'), 'a wrong code does not turn it on');
$step = $now(); $e = call($u, 'auth', 'tfa_enable', ['code' => tfa_code($secret, $step)]);
chk($e['_code'] === 200 && count($e['codes'] ?? []) === 8 && preg_match('/^[A-Z2-9]{5}-[A-Z2-9]{5}$/', $e['codes'][0]), 'the right code turns it on and gives 8 backup codes');
$codes = $e['codes'] ?? [];
$stored = (string)$one('SELECT totp FROM users WHERE id=?', [$uid]);
chk($stored !== '' && strpos($stored, $secret) === false && strpos((string)$one('SELECT totp_codes FROM users WHERE id=?', [$uid]), str_replace('-', '', $codes[0])) === false, 'the key is stored encrypted and the backup codes only as hashes');
chk(call($u, 'auth', 'status')['auth'] === true, 'this device stays signed in');
$st = call($u, 'auth', 'tfa_status'); chk($st['on'] === true && $st['codes_left'] === 8, 'status: on, 8 codes left');
$L = call($admin, 'admin', 'users'); $me = array_values(array_filter($L, fn($x) => is_array($x) && ($x['id'] ?? 0) == $uid))[0] ?? [];
chk((int)($me['tfa'] ?? 0) === 1 && !isset($me['totp']) && !isset($me['hash']), 'the admin sees who has two-step on, never the key');

// ---- signing in with it ----
$d = actor($un . 'b'); $r = call($d, 'auth', 'login', ['username' => $un, 'password' => $pw]);
chk($r['_code'] === 200 && !empty($r['need2']), 'the password alone answers "code needed"');
chk(call($d, 'auth', 'status')['auth'] === false && call($d, 'customers', 'list')['_code'] === 401, 'and does not sign in');
$r = call($d, 'auth', 'login2', ['code' => tfa_code($secret, $step)]);
chk($r['_code'] === 401, 'the code already used cannot be used again');
$r = call($d, 'auth', 'login2', ['code' => tfa_code($secret, $now() + 1)]);
chk($r['_code'] === 200 && call($d, 'auth', 'status')['auth'] === true, 'a fresh code signs in');
$d2 = actor($un . 'c'); $r = call($d2, 'auth', 'login2', ['code' => tfa_code($secret, $now())]);
chk($r['_code'] === 401, 'a code without the password step is refused');
call($d2, 'auth', 'login', ['username' => $un, 'password' => $pw]);
$r = call($d2, 'auth', 'login2', ['code' => strtolower($codes[0])]);
chk($r['_code'] === 200 && !empty($r['backup']) && call($d2, 'auth', 'status')['auth'] === true, 'a backup code signs in (any case)');
$d3 = actor($un . 'd'); call($d3, 'auth', 'login', ['username' => $un, 'password' => $pw]);
chk(call($d3, 'auth', 'login2', ['code' => $codes[0]])['_code'] === 401, 'the same backup code does not work twice');
chk(call($d2, 'auth', 'tfa_status')['codes_left'] === 7, '7 backup codes left');
$n = call($d2, 'auth', 'tfa_codes', ['password' => $pw]);
chk($n['_code'] === 200 && count($n['codes']) === 8 && !in_array($codes[1], $n['codes'], true), 'new backup codes replace the old set');
call($d3, 'auth', 'login', ['username' => $un, 'password' => $pw]);
chk(call($d3, 'auth', 'login2', ['code' => $codes[1]])['_code'] === 401, 'an old backup code no longer works');

// ---- the admin switches it off for someone who lost the phone ----
chk(call($u, 'admin', 'user_tfa_off', ['id' => $uid])['_code'] === 403, 'only the admin can switch someone\'s two-step off');
$r = call($admin, 'admin', 'user_tfa_off', ['id' => $uid]); chk($r['_code'] === 200, 'admin switches it off');
chk(call($d2, 'auth', 'status')['auth'] === false, 'their devices are signed out');
$d4 = actor($un . 'e'); $r = call($d4, 'auth', 'login', ['username' => $un, 'password' => $pw]);
chk($r['_code'] === 200 && empty($r['need2']) && call($d4, 'auth', 'status')['auth'] === true, 'they sign in with the password only again');

// ---- turning it off yourself, and wrong codes lock the login ----
$b = call($d4, 'auth', 'tfa_begin', ['password' => $pw]); $secret = $b['secret'];
call($d4, 'auth', 'tfa_enable', ['code' => tfa_code($secret, $now())]);
chk(call($d4, 'auth', 'tfa_off', ['password' => 'nope12345'])['_code'] === 403 && call($d4, 'auth', 'tfa_status')['on'] === true, 'turning off needs the password');
chk(call($d4, 'auth', 'tfa_off', ['password' => $pw])['_code'] === 200 && call($d4, 'auth', 'tfa_status')['on'] === false, 'turned off with the password');
$b = call($d4, 'auth', 'tfa_begin', ['password' => $pw]); call($d4, 'auth', 'tfa_enable', ['code' => tfa_code($b['secret'], $now())]);
$d5 = actor($un . 'f'); call($d5, 'auth', 'login', ['username' => $un, 'password' => $pw]);
$codesSeen = []; for ($i = 0; $i < 6; $i++) $codesSeen[] = call($d5, 'auth', 'login2', ['code' => '111111'])['_code'];
chk(end($codesSeen) === 429 && $codesSeen[0] === 401, 'wrong codes lock the login like wrong passwords (' . implode(',', $codesSeen) . ')');
$db->prepare('DELETE FROM login_guard WHERE k=? OR k LIKE ?')->execute(['u:' . $un, 'ip:%']);

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
