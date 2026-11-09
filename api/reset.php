<?php
// Admin: total reset. Always keeps leads, Meta Ads (connection, sync state, campaigns, ad spend) and the admin's own login.
// A full database backup is written to data/backups/ before anything is deleted.

function backups_dir() { $d = dirname(__DIR__) . '/data/backups'; if (!is_dir($d)) mkdir($d, 0750, true); return $d; }

function handle_reset($a) {
  if (($_SESSION['role'] ?? '') !== 'admin') fail('Admin only', 403);
  $in = body();
  if ($a === 'backups') {
    $out = [];
    foreach (glob(backups_dir() . '/*.sqlite') ?: [] as $f) $out[] = ['name' => basename($f), 'size' => filesize($f), 'time' => date('Y-m-d H:i', filemtime($f))];
    usort($out, fn($x, $y) => strcmp($y['name'], $x['name'])); out($out);
  }
  if ($a === 'backup_get') {
    $f = backups_dir() . '/' . basename((string)($_GET['name'] ?? ''));
    if (!preg_match('/^[\w.-]+\.sqlite$/', basename($f)) || !is_file($f)) fail('Backup not found', 404);
    header_remove('Content-Type'); header('Content-Type: application/octet-stream'); header('Content-Disposition: attachment; filename="' . basename($f) . '"'); readfile($f); exit;
  }
  if ($a !== 'reset') fail('Unknown action', 404);

  $me = row('SELECT * FROM users WHERE id=?', [uid()]);
  if (!$me || !password_verify((string)($in['password'] ?? ''), $me['hash'])) fail('Wrong admin password', 401);
  if (($in['confirm'] ?? '') !== 'RESET') fail('Type RESET to confirm');
  $o = $in['opts'] ?? [];
  $db = db();

  // 1) safety backup
  $db->exec('PRAGMA wal_checkpoint(TRUNCATE)');
  $name = 'pre-reset-' . date('Y-m-d-His') . '-' . bin2hex(random_bytes(3)) . '.sqlite';
  if (!copy(dirname(__DIR__) . '/data/crm.sqlite', backups_dir() . "/$name")) fail('Could not create the safety backup — nothing was deleted', 500);

  // 2) collect files to remove from disk after the database is cleared
  $up = dirname(__DIR__) . '/data/uploads'; $paths = array_column(rows('SELECT path FROM files'), 'path');
  if (!empty($o['datasheets'])) $paths = array_merge($paths, array_column(rows('SELECT path FROM datasheets'), 'path'));

  $db->beginTransaction();
  try {
    foreach (['customers', 'projects', 'quotes', 'payments', 'checklist', 'files', 'project_steps', 'stage_data', 'services', 'events', 'notes', 'messages', 'wa_chats', 'wa_msgs'] as $t) $db->exec("DELETE FROM $t");
    $db->exec('DELETE FROM disc_msgs WHERE discussion_id IN (SELECT id FROM discussions WHERE customer_id IS NOT NULL)'); $db->exec('DELETE FROM disc_reads WHERE discussion_id IN (SELECT id FROM discussions WHERE customer_id IS NOT NULL)');
    $db->exec('DELETE FROM discussions WHERE customer_id IS NOT NULL'); $db->exec('DELETE FROM notifs WHERE customer_id IS NOT NULL');
    $db->exec("UPDATE leads SET customer_id=NULL, status=CASE WHEN status='Won' THEN 'Contacted' ELSE status END"); // leads stay; links to deleted customers removed
    if (!empty($o['audit'])) $db->exec('DELETE FROM audit_log');
    if (!empty($o['datasheets'])) $db->exec('DELETE FROM datasheets');
    if (!empty($o['settings'])) $db->exec("DELETE FROM settings WHERE k NOT IN ('meta_cfg','meta_state','v1_migrated','pipe_v2')");
    if (!empty($o['users'])) { $db->prepare('DELETE FROM users WHERE id<>?')->execute([uid()]); $db->exec('UPDATE leads SET assigned_to=NULL, claimed_at=\'\' WHERE assigned_to IS NOT NULL'); }
    try { $db->exec("DELETE FROM sqlite_sequence WHERE name IN ('customers','projects','quotes','payments','checklist','files','project_steps','services','events','notes','messages'" . (!empty($o['datasheets']) ? ",'datasheets'" : '') . ')'); } catch (Throwable $e) { }
    $db->commit();
  } catch (Throwable $e) { $db->rollBack(); fail('Reset failed, nothing was changed: ' . $e->getMessage(), 500); }

  foreach ($paths as $p) @unlink("$up/" . basename($p));
  try { $db->exec('VACUUM'); } catch (Throwable $e) { }
  audit('reset', 'system', null, 'Total reset · backup ' . $name . ' · options ' . json_encode(array_keys(array_filter($o))));
  out(['ok' => true, 'backup' => $name, 'leads_kept' => (int)row('SELECT COUNT(*) c FROM leads')['c']]);
}
