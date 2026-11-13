<?php
// Two-step sign-in: after the password, a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator,
// Authy, the iPhone Passwords app …) or a one-time backup code. Each person switches it on for their own login (My account).
// The key is stored encrypted (data/mail.key); backup codes are stored only as hashes; a code cannot be used twice.

const TFA_STEP = 30;       // seconds a code lasts
const TFA_WINDOW = 1;      // accept the code before / after as well (clock drift)
const TFA_PENDING = 300;   // seconds allowed between the password and the code
const TFA_CODES = 8;       // backup codes per set
const TFA_B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function tfa_b32($bin) { $bits = ''; foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT); $o = ''; foreach (str_split($bits, 5) as $ch) $o .= TFA_B32[bindec(str_pad($ch, 5, '0'))]; return $o; }
function tfa_unb32($s) { $bits = ''; foreach (str_split(strtoupper(preg_replace('/[^A-Za-z2-7]/', '', (string)$s))) as $c) $bits .= str_pad(decbin(strpos(TFA_B32, $c)), 5, '0', STR_PAD_LEFT); $o = ''; foreach (str_split($bits, 8) as $by) if (strlen($by) === 8) $o .= chr(bindec($by)); return $o; }
// RFC 6238 (HMAC-SHA1, 6 digits, 30 s) — what every authenticator app uses by default
function tfa_code($secretB32, $counter) {
  $h = hash_hmac('sha1', pack('N2', 0, $counter), tfa_unb32($secretB32), true);
  $o = ord($h[19]) & 15;
  $n = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
  return str_pad((string)($n % 1000000), 6, '0', STR_PAD_LEFT);
}
// the time step a typed code belongs to (0 = wrong). $after = last step already used: the same code never works twice.
function tfa_match($secretB32, $code, $after = 0, $now = null) {
  $code = preg_replace('/\D/', '', (string)$code); if (strlen($code) !== 6 || $secretB32 === '') return 0;
  $t = intdiv($now ?? time(), TFA_STEP);
  for ($i = -TFA_WINDOW; $i <= TFA_WINDOW; $i++) if ($t + $i > $after && hash_equals(tfa_code($secretB32, $t + $i), $code)) return $t + $i;
  return 0;
}
function tfa_secret($u) { return empty($u['totp']) ? '' : mail_dec($u['totp']); }
// on = a key is stored and can still be read (a restore onto a new server without data/mail.key leaves keys unreadable: two-step is then off, and logged)
function tfa_on($u) { return tfa_secret($u) !== ''; }
function tfa_code_hash($c) { return hash_hmac('sha256', strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)$c)), mail_key()); }
function tfa_new_codes($uid) {
  $codes = []; $al = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; /* no 0/O/1/I */
  for ($i = 0; $i < TFA_CODES; $i++) { $c = ''; for ($j = 0; $j < 10; $j++) $c .= $al[random_int(0, 31)]; $codes[] = substr($c, 0, 5) . '-' . substr($c, 5); }
  q('UPDATE users SET totp_codes=? WHERE id=?', [json_encode(array_map('tfa_code_hash', $codes)), $uid]);
  return $codes;
}
function tfa_codes_left($u) { return count(json_decode((string)($u['totp_codes'] ?? ''), true) ?: []); }
// checks an authenticator code or a backup code for this user and marks it used; returns 'app' | 'backup' | ''
function tfa_verify($u, $code) {
  $step = tfa_match(tfa_secret($u), $code, (int)($u['totp_last'] ?? 0));
  if ($step) { q('UPDATE users SET totp_last=? WHERE id=?', [$step, $u['id']]); return 'app'; }
  $clean = preg_replace('/[^A-Za-z0-9]/', '', (string)$code); if (strlen($clean) !== 10) return '';
  $have = json_decode((string)($u['totp_codes'] ?? ''), true) ?: []; $h = tfa_code_hash($clean); $left = [];
  $hit = false; foreach ($have as $x) { if (!$hit && hash_equals((string)$x, $h)) $hit = true; else $left[] = $x; }
  if (!$hit) return '';
  q('UPDATE users SET totp_codes=? WHERE id=?', [json_encode($left), $u['id']]); return 'backup';
}

// ---- sign-in: called from auth/login once the password is right; true = wait for the code ----
function tfa_login_needed($u) {
  if (empty($u['totp'])) return false;
  if (!tfa_on($u)) { audit('tfa_unreadable', 'security', $u['id'], 'two-step key could not be read — signed in with the password only'); return false; }
  $_SESSION['p2'] = ['uid' => (int)$u['id'], 't' => time()];
  return true;
}
// auth/login2 {code}
function tfa_login_finish($in) {
  $p = $_SESSION['p2'] ?? null;
  if (!$p || time() - (int)$p['t'] > TFA_PENDING) { unset($_SESSION['p2']); fail('That took too long — please sign in again', 401); }
  $u = row('SELECT * FROM users WHERE id=? AND active=1', [(int)$p['uid']]);
  if (!$u) { unset($_SESSION['p2']); fail('Please sign in again', 401); }
  login_guard_check($u['username']);
  usleep(300000);
  $how = tfa_verify($u, (string)($in['code'] ?? ''));
  if ($how === '') { login_guard_fail($u['username']); fail('That code is not right. Check the app and try again.', 401); }
  unset($_SESSION['p2']); login_guard_ok($u['username']); login_as($u);
  audit('login', 'users', $u['id'], 'from ' . client_ip() . ($how === 'backup' ? ' · backup code (' . tfa_codes_left(row('SELECT totp_codes FROM users WHERE id=?', [$u['id']])) . ' left)' : ' · two-step'));
  out(['ok' => true, 'backup' => $how === 'backup']);
}

// ---- My account › Two-step sign-in (signed in) ----
function tfa_handle($a, $in) {
  if (strncmp($a, 'tfa_', 4) !== 0) return;
  $u = row('SELECT * FROM users WHERE id=?', [(int)$_SESSION['uid']]);
  $pw = fn() => password_verify((string)($in['password'] ?? ''), $u['hash']) ?: fail('Wrong password', 403);
  if ($a === 'tfa_status') out(['on' => tfa_on($u), 'codes_left' => tfa_on($u) ? tfa_codes_left($u) : 0]);
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required', 405);
  if ($a === 'tfa_begin') { // a new key, kept aside until a code from the app proves it was added
    $pw(); if (tfa_on($u)) fail('Two-step sign-in is already on');
    $secret = tfa_b32(random_bytes(20));
    q('UPDATE users SET totp_tmp=? WHERE id=?', [mail_enc($secret), $u['id']]);
    $issuer = 'Solarize CRM';
    out(['secret' => $secret, 'uri' => 'otpauth://totp/' . rawurlencode($issuer . ':' . $u['username']) . '?secret=' . $secret . '&issuer=' . rawurlencode($issuer) . '&digits=6&period=30']);
  }
  if ($a === 'tfa_enable') {
    $secret = empty($u['totp_tmp']) ? '' : mail_dec($u['totp_tmp']); if ($secret === '') fail('Start again: press Turn on first');
    $step = tfa_match($secret, (string)($in['code'] ?? '')); if (!$step) fail('That code is not right. Check the app and try again.');
    q("UPDATE users SET totp=totp_tmp, totp_tmp='', totp_last=?, sess_ver=sess_ver+1 WHERE id=?", [$step, $u['id']]); // other devices are signed out
    $_SESSION['sv'] = (int)row('SELECT sess_ver FROM users WHERE id=?', [$u['id']])['sess_ver'];
    audit('tfa_on', 'users', $u['id'], $u['username']);
    out(['ok' => true, 'codes' => tfa_new_codes($u['id'])]);
  }
  if ($a === 'tfa_codes') { $pw(); if (!tfa_on($u)) fail('Two-step sign-in is off'); audit('tfa_codes', 'users', $u['id'], $u['username']); out(['codes' => tfa_new_codes($u['id'])]); }
  if ($a === 'tfa_off') { $pw(); tfa_clear($u['id']); audit('tfa_off', 'users', $u['id'], $u['username']); out(['ok' => true]); }
  fail('Unknown action', 404);
}
function tfa_clear($uid) { q("UPDATE users SET totp='', totp_tmp='', totp_codes='', totp_last=0 WHERE id=?", [(int)$uid]); }
