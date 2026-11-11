<?php
// Security layer: upload validation (type + real content), login lockout, session hardening,
// cross-site request protection, safe error reporting, sensitive-data masking.

// ---------- uploads: only documents and images, checked by content (not just the file name) ----------
const UP_KINDS = [
  'image'  => ['jpg', 'jpeg', 'png', 'webp'],
  'pdf'    => ['pdf'],
  'office' => ['doc', 'docx', 'xls', 'xlsx'],
];
function up_err($code) {
  return [UPLOAD_ERR_INI_SIZE => 'File is larger than the server upload limit', UPLOAD_ERR_FORM_SIZE => 'File is too large', UPLOAD_ERR_PARTIAL => 'Upload was interrupted — try again',
    UPLOAD_ERR_NO_FILE => 'Choose a file', UPLOAD_ERR_NO_TMP_DIR => 'Server upload folder missing', UPLOAD_ERR_CANT_WRITE => 'Server could not save the file'][$code] ?? 'Upload failed';
}
// Validates $_FILES entry; returns the safe extension to store with. Fails with a clear message otherwise.
function sec_upload($fl, array $kinds = ['image', 'pdf', 'office'], $maxMB = 10) {
  if (!$fl || !isset($fl['error'])) fail('Choose a file');
  if ($fl['error'] !== UPLOAD_ERR_OK) fail(up_err($fl['error']));
  if (!is_uploaded_file($fl['tmp_name'])) fail('Upload failed');
  if ($fl['size'] <= 0) fail('The file is empty');
  if ($fl['size'] > $maxMB * 1024 * 1024) fail("File too large (max $maxMB MB)");
  $allowed = array_merge(...array_map(fn($k) => UP_KINDS[$k], $kinds));
  $ext = strtolower(pathinfo((string)$fl['name'], PATHINFO_EXTENSION));
  $nice = implode(', ', array_map('strtoupper', array_unique(array_map(fn($e) => $e === 'jpeg' ? 'jpg' : $e, $allowed))));
  if (!in_array($ext, $allowed, true)) fail("Only documents and images can be uploaded ($nice)");
  if (preg_match('/\.(php\d?|phtml|phar|pht|html?|svg|js|exe|bat|cmd|sh|py|pl|cgi|htaccess)(\.|$)/i', (string)$fl['name'])) fail('This file name is not allowed');
  $data = file_get_contents($fl['tmp_name']);
  $head = substr($data, 0, 16);
  // never accept anything that carries script / server code (polyglot files)
  if (preg_match('/<\?php|<\?=|<script\b|<%@|#!\/(usr|bin)/i', $data)) fail('This file contains code and was blocked');
  $finfo = function_exists('finfo_open') ? (finfo_file($fi = finfo_open(FILEINFO_MIME_TYPE), $fl['tmp_name']) ?: '') : '';
  switch ($ext) {
    case 'jpg': case 'jpeg': case 'png': case 'webp':
      $info = @getimagesize($fl['tmp_name']);
      $want = ['jpg' => IMAGETYPE_JPEG, 'jpeg' => IMAGETYPE_JPEG, 'png' => IMAGETYPE_PNG, 'webp' => IMAGETYPE_WEBP][$ext];
      if (!$info || $info[2] !== $want) {
        // a photo saved with the wrong extension: accept it under its real type
        $real = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'][$info[2] ?? 0] ?? null;
        if (!$real || !in_array('image', $kinds)) fail('That is not a valid image file');
        return $real;
      }
      if ($info[0] < 1 || $info[1] < 1 || $info[0] * $info[1] > 80e6) fail('Image size is not supported');
      return $ext === 'jpeg' ? 'jpg' : $ext;
    case 'pdf':
      if (strpos(substr($data, 0, 1024), '%PDF-') === false) fail('That is not a valid PDF file');
      if (preg_match('#/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA)\b#', $data)) fail('This PDF contains scripts or embedded files and was blocked. Please print it to PDF again or upload a scan.');
      return 'pdf';
    case 'docx': case 'xlsx':
      if (substr($head, 0, 4) !== "PK\x03\x04" || strpos($data, '[Content_Types].xml') === false) fail('That is not a valid ' . strtoupper($ext) . ' file');
      if (stripos($data, 'vbaProject') !== false || stripos($data, 'macroEnabled') !== false) fail('Files with macros are not allowed');
      return $ext;
    case 'doc': case 'xls':
      if (substr($head, 0, 8) !== "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1") fail('That is not a valid ' . strtoupper($ext) . ' file');
      if (stripos($data, '_VBA_PROJECT') !== false || stripos($data, 'VBA') !== false && stripos($data, 'Macros') !== false) fail('Files with macros are not allowed');
      return $ext;
  }
  fail('File type not allowed');
}

// ---------- login protection: lock after repeated failures ----------
const LOGIN_MAX_USER = 5;   // wrong passwords per username …
const LOGIN_MAX_IP = 20;    // … or per network address
const LOGIN_WINDOW = 900;   // within 15 minutes
const LOGIN_LOCK = 900;     // locked for 15 minutes
function client_ip() { return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45); }
function login_guard_check($user) {
  foreach (['u:' . strtolower($user), 'ip:' . client_ip()] as $k) {
    $r = row('SELECT * FROM login_guard WHERE k=?', [$k]);
    if ($r && (int)$r['until'] > time()) fail('Too many wrong attempts. Try again in ' . max(1, ceil(((int)$r['until'] - time()) / 60)) . ' minute(s) or ask the admin.', 429);
  }
}
function login_guard_fail($user) {
  $now = time();
  foreach (['u:' . strtolower($user) => LOGIN_MAX_USER, 'ip:' . client_ip() => LOGIN_MAX_IP] as $k => $max) {
    $r = row('SELECT * FROM login_guard WHERE k=?', [$k]);
    $n = ($r && $now - (int)$r['first'] < LOGIN_WINDOW) ? (int)$r['fails'] + 1 : 1; $first = ($r && $n > 1) ? (int)$r['first'] : $now;
    $until = $n >= $max ? $now + LOGIN_LOCK : 0;
    q('INSERT OR REPLACE INTO login_guard(k,fails,first,until) VALUES(?,?,?,?)', [$k, $n, $first, $until]);
    if ($until) q('INSERT INTO audit_log(user,action,entity,entity_id,detail) VALUES(?,?,?,?,?)', [$user ?: '-', 'login_locked', 'security', null, "$k locked for " . (LOGIN_LOCK / 60) . ' min after ' . $n . ' wrong attempts']);
  }
  q('INSERT INTO audit_log(user,action,entity,entity_id,detail) VALUES(?,?,?,?,?)', [$user ?: '-', 'login_failed', 'security', null, 'from ' . client_ip()]);
}
function login_guard_ok($user) { q('DELETE FROM login_guard WHERE k=?', ['u:' . strtolower($user)]); }

// ---------- sessions ----------
const SESSION_IDLE = 12 * 3600; // signed out after 12 hours without activity
function sec_session_start() {
  ini_set('session.use_strict_mode', '1'); ini_set('session.use_only_cookies', '1'); ini_set('session.cookie_httponly', '1');
  session_name('SOLSESS');
  session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict', 'secure' => !empty($_SERVER['HTTPS']) || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https']);
  session_start();
}
// every request: the user must still exist, be active, and not have changed password since this session began
function sec_session_check($soft = false) {
  if (empty($_SESSION['uid'])) return;
  $end = function ($msg) use ($soft) { session_unset(); session_destroy(); if (!$soft) fail($msg, 401); };
  if (!empty($_SESSION['seen']) && time() - (int)$_SESSION['seen'] > SESSION_IDLE) return $end('Your session expired — please sign in again');
  $u = row('SELECT id,name,username,role,active,sess_ver FROM users WHERE id=?', [(int)$_SESSION['uid']]);
  if (!$u || !(int)$u['active'] || (int)$u['sess_ver'] !== (int)($_SESSION['sv'] ?? 0)) return $end('Please sign in again');
  $_SESSION['role'] = $u['role']; $_SESSION['name'] = $u['name']; $_SESSION['username'] = $u['username'];
  if (time() - (int)($_SESSION['seen'] ?? 0) > 60) $_SESSION['seen'] = time();
}

// ---------- cross-site request protection ----------
// state-changing requests must come from this app: custom header (cannot be sent cross-site without CORS) + same-origin check
function sec_csrf() {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') return;
  if (($_SERVER['HTTP_X_SOLARIZE'] ?? '') !== '1') fail('Request blocked', 403);
  $o = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($o !== '') { $h = parse_url($o, PHP_URL_HOST); if (!$h || strcasecmp($h, explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]) !== 0) fail('Request blocked', 403); }
}

// ---------- headers & errors ----------
function sec_headers() {
  header('X-Content-Type-Options: nosniff');
  header('X-Frame-Options: SAMEORIGIN');
  header('Referrer-Policy: same-origin');
  header('Cache-Control: no-store');
  header("Content-Security-Policy: default-src 'none'; frame-ancestors 'self'");
}
function sec_fail_server($e) {
  $ref = strtoupper(bin2hex(random_bytes(3)));
  $dir = dirname(__DIR__) . '/data'; if (is_dir($dir)) @file_put_contents("$dir/error.log", date('c') . " [$ref] " . ($_GET['m'] ?? '') . '/' . ($_GET['a'] ?? '') . ' user=' . ($_SESSION['username'] ?? '-') . ' ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine() . "\n", FILE_APPEND | LOCK_EX);
  fail(($_SESSION['role'] ?? '') === 'admin' ? 'Server error (ref ' . $ref . '): ' . $e->getMessage() : 'Something went wrong (ref ' . $ref . '). Please try again or tell the admin.', 500);
}

// ---------- password rules ----------
function sec_password_ok($pw, $username = '') {
  if (strlen($pw) < 8) fail('Password must be at least 8 characters');
  if (!preg_match('/[A-Za-z]/', $pw) || !preg_match('/\d/', $pw)) fail('Password must contain both letters and numbers');
  if ($username !== '' && stripos($pw, $username) !== false) fail('Password must not contain the username');
  if (in_array(strtolower($pw), ['password1', 'password123', '12345678a', 'qwerty123', 'admin123', 'jasper123', 'solar123', 'welcome1', 'abc12345'])) fail('That password is too common');
}

// ---------- sensitive data masking ----------
function mask_tail($v, $keep = 4) { $v = (string)$v; $n = strlen($v); return $n <= $keep ? $v : str_repeat('•', min(8, $n - $keep)) . substr($v, -$keep); }
function can_see_bank() { return is_admin() || ($_SESSION['role'] ?? '') === 'assistant_manager' || can('finance'); }
const LOAN_COLS = ['jansamarth_id','loan_bank','loan_branch','loan_amount','loan_sanctioned_on'];
function mask_customer($r) { // full bank account only for admin, assistant manager and finance users (needed for subsidy); others see the last 4 digits
  if (!can_see_bank() && !empty($r['bank_account'])) $r['bank_account'] = mask_tail($r['bank_account']);
  if (!can_see_bank()) foreach (['aadhaar_no', 'pan_no'] as $k) if (!empty($r[$k])) $r[$k] = mask_tail($r[$k]);
  if (!can('loans')) foreach (LOAN_COLS as $k) unset($r[$k]);
  return $r;
}

// ---------- security log entries from the app ----------
function handle_sec($a) {
  $in = body();
  if ($a === 'log_export') { // bulk CSV exports are recorded (who, what, how many rows)
    if (!in_array($_SESSION['role'] ?? '', ['admin', 'assistant_manager'])) fail('Not allowed', 403);
    audit('export', 'security', null, mb_substr(preg_replace('/[^\w\-. ]/', '', (string)($in['name'] ?? '')), 0, 80) . ' · ' . (int)($in['rows'] ?? 0) . ' rows'); out(['ok' => true]);
  }
  fail('Unknown action', 404);
}
