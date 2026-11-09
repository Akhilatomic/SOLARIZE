<?php
// Datasheet folder: categorised product files, public share links, admin-controlled availability.

const DS_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx', 'zip'];
const DS_MIME = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png'];

function ds_cats() { return settings()['ds_categories']; }
function ds_dir() { $d = dirname(__DIR__) . '/data/uploads'; if (!is_dir($d)) mkdir($d, 0750, true); return $d; }
function ds_upload_err($code) {
  return [UPLOAD_ERR_INI_SIZE => 'File is larger than the server upload limit (raise upload_max_filesize in hPanel → PHP Configuration)', UPLOAD_ERR_FORM_SIZE => 'File too large', UPLOAD_ERR_PARTIAL => 'Upload was interrupted, try again', UPLOAD_ERR_NO_FILE => 'Choose a file first'][$code] ?? 'Upload failed';
}
function ds_serve($r, $download) {
  $p = ds_dir() . '/' . basename($r['path']); if (!is_file($p)) fail('File missing', 404);
  $ext = strtolower(pathinfo($r['file_name'], PATHINFO_EXTENSION)); $mime = DS_MIME[$ext] ?? 'application/octet-stream';
  header_remove('Content-Type'); header('Content-Type: ' . $mime); header('X-Content-Type-Options: nosniff'); header('Content-Length: ' . filesize($p));
  $inline = !$download && isset(DS_MIME[$ext]);
  header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . str_replace(['"', "\r", "\n"], '', $r['file_name']) . '"');
  readfile($p); exit;
}

// Public, no login: api.php?m=share&t=<token>  (unguessable per-file token)
function handle_share() {
  $t = preg_replace('/[^a-f0-9]/', '', (string)($_GET['t'] ?? ''));
  $r = strlen($t) >= 20 ? row('SELECT * FROM datasheets WHERE token=?', [$t]) : null;
  if (!$r) { http_response_code(404); header('Content-Type: text/plain'); echo 'This link is no longer available.'; exit; }
  ds_serve($r, !empty($_GET['dl']));
}

function handle_folder($a) {
  $in = body(); $admin = ($_SESSION['role'] ?? '') === 'admin';
  need('folder', in_array($a, ['upload', 'save', 'delete']));
  switch ($a) {
    case 'list':
      out(['cats' => ds_cats(), 'items' => rows('SELECT id,category,title,brand,model,notes,file_name,size,available,avail_note,token,created,updated,user FROM datasheets ORDER BY category, title COLLATE NOCASE')]);
    case 'get':
      $r = row('SELECT * FROM datasheets WHERE id=?', [(int)($_GET['id'] ?? 0)]); if (!$r) fail('Not found', 404);
      ds_serve($r, !empty($_GET['dl']));
    case 'upload':
      $cat = trim((string)($_POST['category'] ?? '')); if (!in_array($cat, ds_cats())) fail('Choose a category');
      $fl = $_FILES['file'] ?? null; if (!$fl || $fl['error'] !== UPLOAD_ERR_OK) fail(ds_upload_err($fl['error'] ?? UPLOAD_ERR_NO_FILE));
      if ($fl['size'] > 25 * 1024 * 1024) fail('File too large (max 25 MB)');
      $ext = strtolower(pathinfo($fl['name'], PATHINFO_EXTENSION)); if (!in_array($ext, DS_EXT)) fail('Allowed types: ' . implode(', ', DS_EXT));
      $name = 'ds-' . bin2hex(random_bytes(10)) . '.' . $ext;
      if (!move_uploaded_file($fl['tmp_name'], ds_dir() . "/$name")) fail('Could not save file', 500);
      $title = trim((string)($_POST['title'] ?? '')) ?: pathinfo($fl['name'], PATHINFO_FILENAME);
      q('INSERT INTO datasheets(category,title,brand,model,notes,file_name,path,size,available,avail_note,token,user) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        [$cat, $title, trim((string)($_POST['brand'] ?? '')), trim((string)($_POST['model'] ?? '')), trim((string)($_POST['notes'] ?? '')), basename($fl['name']), $name, $fl['size'], 1, '', bin2hex(random_bytes(12)), $_SESSION['name'] ?? '']);
      $id = (int)db()->lastInsertId(); audit('upload', 'datasheet', $id, $title); out(['id' => $id]);
    case 'save':
      $id = (int)($in['id'] ?? 0); $cat = trim((string)($in['category'] ?? '')); if (!in_array($cat, ds_cats())) fail('Choose a category');
      $title = trim((string)($in['title'] ?? '')); if ($title === '') fail('Title required');
      q('UPDATE datasheets SET category=?,title=?,brand=?,model=?,notes=?,updated=CURRENT_TIMESTAMP WHERE id=?', [$cat, $title, trim((string)($in['brand'] ?? '')), trim((string)($in['model'] ?? '')), trim((string)($in['notes'] ?? '')), $id]);
      audit('update', 'datasheet', $id, $title); out(['ok' => true]);
    case 'toggle': // availability: admin only
      if (!$admin) fail('Only the admin can change availability', 403);
      $id = (int)($in['id'] ?? 0); $on = !empty($in['available']) ? 1 : 0;
      q('UPDATE datasheets SET available=?, avail_note=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$on, mb_substr(trim((string)($in['avail_note'] ?? '')), 0, 60), $id]);
      audit('availability', 'datasheet', $id, $on ? 'available' : 'unavailable'); out(['ok' => true]);
    case 'delete':
      $r = row('SELECT * FROM datasheets WHERE id=?', [(int)($in['id'] ?? 0)]); if (!$r) fail('Not found', 404);
      @unlink(ds_dir() . '/' . basename($r['path'])); q('DELETE FROM datasheets WHERE id=?', [$r['id']]); audit('delete', 'datasheet', $r['id'], $r['title']); out(['ok' => true]);
  }
  fail('Unknown action', 404);
}
