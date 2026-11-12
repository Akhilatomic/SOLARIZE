<?php
// Router: api.php?m=<module>&a=<action>
ini_set('display_errors', '0'); error_reporting(E_ALL);
require __DIR__ . '/api/security.php';
sec_session_start();
date_default_timezone_set('Asia/Kolkata');
header('Content-Type: application/json; charset=utf-8');
sec_headers();
require __DIR__ . '/api/lib.php';
require __DIR__ . '/api/core.php';
require __DIR__ . '/api/ops.php';
require __DIR__ . '/api/meta.php';
require __DIR__ . '/api/folder.php';
require __DIR__ . '/api/claims.php';
require __DIR__ . '/api/calendar.php';
require __DIR__ . '/api/pipeline.php';
require __DIR__ . '/api/reset.php';
require __DIR__ . '/api/wa.php';
require __DIR__ . '/api/hr.php';
require __DIR__ . '/api/disc.php';
require __DIR__ . '/api/trash.php';
require __DIR__ . '/api/profile.php';
require __DIR__ . '/api/plant.php';
require __DIR__ . '/api/fees.php';
require __DIR__ . '/api/user.php';
require __DIR__ . '/api/gen.php';
require __DIR__ . '/api/kseb.php';
require_once __DIR__ . '/api/kseb_offices.php';
require __DIR__ . '/api/bank.php';
require __DIR__ . '/api/mail.php';
require __DIR__ . '/api/quotemaker.php';
require __DIR__ . '/api/comm.php';
require __DIR__ . '/api/accounts.php';
require __DIR__ . '/api/import.php';

try {
  $m = $_GET['m'] ?? ''; $a = $_GET['a'] ?? '';
  if ($m === 'meta' && $a === 'cron') handle_meta_cron();
  if ($m === 'share') handle_share();                    // public datasheet link (token-protected)
  if ($m === 'wa' && $a === 'hook') handle_wa_hook();   // WhatsApp webhook (public, signature-checked)
  sec_csrf();                                           // every other POST must come from this app
  if (!empty($_SESSION['uid'])) sec_session_check($m === 'auth'); // still active, same password, not idle
  if ($m === 'auth') handle_auth($a);
  if (empty($_SESSION['uid'])) fail('Unauthorized', 401);
  // Speed: nothing below writes the session, so release its file lock now. Otherwise every request from this browser
  // waits in line behind a slow one (Meta sync, mailbox, WhatsApp) instead of running in parallel. $_SESSION stays readable.
  session_write_close();
  try { housekeeping(); } catch (Throwable $e) { } // hourly: expire 200-day documents, purge the 72-hour recycle bin
  ba_gate($m, $a); // Business Associate: only their own customers, projects and leads
  // CSRF-light: state-changing calls must be POST
  if ($a !== '' && !in_array($a, ['list', 'get', 'report', 'recent', 'users', 'audit', 'stats', 'backup', 'overview', 'feed', 'config', 'upcoming', 'board', 'services', 'backups', 'backup_get', 'chats', 'thread', 'templates', 'media', 'unread', 'status', 'me', 'today', 'month', 'range', 'pending', 'summary', 'notifs', 'timeline', 'serial', 'zip', 'candidates', 'member', 'avatar', 'leaves', 'balances', 'days', 'folders', 'att', 'admin_list', 'boot', 'img', 'owners', 'next', 'presence', 'office', 'offices', 'milestone', 'ac_cost', 'ac_materials']) && $_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required', 405);
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
    case 'calendar': handle_calendar($a);
    case 'pipeline': handle_pipeline($a);
    case 'reset': handle_reset($a);
    case 'wa': handle_wa($a);
    case 'hr': handle_hr($a);
    case 'disc': handle_disc($a);
    case 'trash': handle_trash($a);
    case 'profile': handle_profile($a);
    case 'plant': handle_plant($a);
    case 'sec': handle_sec($a);
    case 'fees': handle_fees($a);
    case 'user': handle_user($a);
    case 'gen': handle_gen($a);
    case 'kseb': handle_kseb($a);
    case 'bank': handle_bank($a);
    case 'mail': handle_mail($a);
    case 'qm': handle_qm($a);
    case 'comm': handle_comm($a);
    case 'acc': handle_acc($a);
    case 'import': handle_import($a);
  }
  fail('Unknown module', 404);
} catch (Throwable $e) {
  sec_fail_server($e);
}
