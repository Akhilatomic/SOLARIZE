<?php
// Sign-in page "Remember this device for 7 days": that browser stays signed in 7 days, closed or idle; without the tick the old rules hold.
// Usage: php tests/remember_test.php http://localhost:8094 <path to the data folder's crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$data = dirname($argv[2] ?? '');
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function call($jar, $m, $a, $body = null) {
  global $base; $hdr = '';
  $ch = curl_init("$base/api.php?m=$m&a=$a");
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $jar, CURLOPT_COOKIEFILE => $jar, CURLOPT_HTTPHEADER => ['X-Solarize: 1', 'Content-Type: application/json'],
    CURLOPT_HEADERFUNCTION => function ($c, $h) use (&$hdr) { $hdr .= $h; return strlen($h); }]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POST, true); curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); }
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = [];
  $j['_code'] = $code; $j['_hdr'] = $hdr; return $j;
}
/* the SOLSESS cookie a reply sets: [session id, expiry as unix time (0 = until the browser closes)] */
function sess_cookie($hdr) { $id = ''; $exp = 0;
  foreach (preg_split('/\r?\n/', $hdr) as $l) if (preg_match('/^Set-Cookie:\s*SOLSESS=([^;]+)(.*)$/i', $l, $m) && $m[1] !== 'deleted' && $m[1] !== '') { $id = $m[1]; $exp = preg_match('/expires=([^;]+)/i', $m[2], $e) ? (int)strtotime($e[1]) : 0; }
  return [$id, $exp]; }
/* change one number kept in a session file (the server keeps sessions in data/sessions) */
function sess_set($id, $key, $val) { global $data; $f = "$data/sessions/sess_$id"; $s = (string)@file_get_contents($f);
  $n = preg_replace('/(^|;|\})' . $key . '\|i:\d+;/', '${1}' . $key . '|i:' . (int)$val . ';', $s, 1, $c); if ($c) file_put_contents($f, $n); return (bool)$c; }
$jar = fn($n) => sys_get_temp_dir() . '/remjar_' . $n . '_' . getmypid() . '.txt';

echo "Sign-in: remember this device for 7 days\n";
$pw = 'Sunny2026pass'; $a = $jar('setup');
$r = call($a, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($a, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');

/* 1. ticked: the cookie and the sign-in last 7 days */
$rj = $jar('rem'); $t0 = time();
$r = call($rj, 'auth', 'login', ['username' => 'boss', 'password' => $pw, 'remember' => 1]); [$rid, $exp] = sess_cookie($r['_hdr']);
chk($r['_code'] === 200 && abs(($r['stay'] ?? 0) - ($t0 + 7 * 86400)) < 30, 'ticked: signed in until 7 days from now');
chk($rid !== '' && abs($exp - ($t0 + 7 * 86400)) < 30, 'the cookie is kept 7 days (it survives closing the browser)');
$s = call($rj, 'auth', 'status'); chk(!empty($s['auth']) && abs(($s['stay'] ?? 0) - ($t0 + 7 * 86400)) < 30, 'the page is told until when (no sign-out for inactivity)');
chk(sess_set($rid, 'seen', time() - 13 * 3600) && !empty(call($rj, 'auth', 'status')['auth']), 'still signed in after 13 hours without use');
chk(sess_set($rid, 'seen', time() - 6 * 86400) && call($rj, 'customers', 'list')['_code'] === 200, 'and after 6 days without use');

/* 2. not ticked: as before — a cookie for the browser session, signed out after 12 hours without use */
$nj = $jar('plain');
$r = call($nj, 'auth', 'login', ['username' => 'boss', 'password' => $pw]); [$nid, $nexp] = sess_cookie($r['_hdr']);
chk($r['_code'] === 200 && empty($r['stay']) && $nid !== '' && $nexp === 0, 'not ticked: no 7 days, the cookie ends with the browser');
chk(sess_set($nid, 'seen', time() - 13 * 3600) && call($nj, 'customers', 'list')['_code'] === 401, 'not ticked: signed out after 13 hours without use');

/* 3. a phone: ticked = 7 days (not only until office end time) */
$pj = $jar('phone');
$r = call($pj, 'auth', 'login', ['username' => 'boss', 'password' => $pw, 'phone' => 1, 'remember' => 1]);
chk(abs(($r['stay'] ?? 0) - (time() + 7 * 86400)) < 30, 'a phone with the tick is remembered 7 days');

/* 4. the Android app keeps its own device token: the tick does nothing there */
$r = call($jar('app'), 'auth', 'login', ['username' => 'boss', 'password' => $pw, 'app' => 1, 'remember' => 1, 'device' => 'test']);
chk($r['_code'] === 200 && empty($r['stay']) && !empty($r['app_token']), 'the Android app is not changed');

/* 5. the 7 days end; and the admin's "sign out everywhere" (or a new password) still ends a remembered sign-in at once */
chk(sess_set($rid, 'stay', time() - 5), 'seven days later…');
$r = call($rj, 'customers', 'list'); chk($r['_code'] === 401 && strpos((string)($r['error'] ?? ''), '7 days') !== false, 'the device has to sign in again, and is told why');
$r = call($pj, 'auth', 'password', ['old' => $pw, 'new' => $pw . 'X']); /* a new password signs every other device out */
$kj = $jar('k'); call($kj, 'auth', 'login', ['username' => 'boss', 'password' => $pw . 'X', 'remember' => 1]);
call($kj, 'auth', 'password', ['old' => $pw . 'X', 'new' => $pw]);
chk($r['_code'] === 200 && call($pj, 'customers', 'list')['_code'] === 401, 'a changed password signs a remembered device out');
$r = call($kj, 'auth', 'logout', []); chk(call($kj, 'auth', 'status')['auth'] === false, 'Sign out ends it on that device');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
