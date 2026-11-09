<?php
// Router: api.php?m=<module>&a=<action>
session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS'])]);
session_start();
date_default_timezone_set('Asia/Kolkata');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
require __DIR__ . '/api/lib.php';
require __DIR__ . '/api/core.php';
require __DIR__ . '/api/ops.php';
require __DIR__ . '/api/meta.php';
require __DIR__ . '/api/folder.php';

try {
  $m = $_GET['m'] ?? ''; $a = $_GET['a'] ?? '';
  if ($m === 'auth') handle_auth($a);
  if ($m === 'meta' && $a === 'cron') handle_meta_cron();
  if ($m === 'share') handle_share();   // public datasheet link (token-protected)
  if (empty($_SESSION['uid'])) fail('Unauthorized', 401);
  // CSRF-light: state-changing calls must be POST
  if ($a !== '' && !in_array($a, ['list', 'get', 'report', 'recent', 'users', 'audit', 'stats', 'backup', 'overview', 'feed', 'config']) && $_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required', 405);
  if (isset($E[$m])) handle_crud($m, $a);
  switch ($m) {
    case 'dashboard': handle_dashboard();
    case 'checklist': handle_checklist($a);
    case 'files': handle_files($a);
    case 'notes': handle_notes($a);
    case 'ads': handle_ads($a);
    case 'whatsapp': handle_whatsapp($a);
    case 'settings': handle_settings($a);
    case 'admin': handle_admin($a);
    case 'meta': handle_meta($a);
    case 'folder': handle_folder($a);
  }
  fail('Unknown module', 404);
} catch (Throwable $e) {
  fail('Server error: ' . $e->getMessage(), 500);
}
