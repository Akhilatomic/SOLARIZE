<?php
// Datasheet folder: a file manager - nested folders, files, bulk move/delete, ZIP download, public share links.

const DS_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx'];
const DS_MIME = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png'];
const DS_ZIP_MAX = 500 * 1024 * 1024;

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

function ds_ids($v) { return array_values(array_unique(array_filter(array_map('intval', is_array($v) ? $v : preg_split('/[,\s]+/', (string)$v)), fn($x) => $x > 0))); }
function ds_in(array $ids) { return $ids ? implode(',', array_map('intval', $ids)) : '0'; }
function ds_fid($v) { $v = (int)$v; return $v > 0 ? $v : null; }
function ds_folder($id) { return row('SELECT * FROM ds_folders WHERE id=?', [(int)$id]); }
function ds_name($v) {
  $n = trim((string)$v);
  if ($n === '' || mb_strlen($n) > 80) fail('Names must be 1 to 80 characters');
  if (strpbrk($n, '/\\') !== false) fail('Folder names cannot contain / or \\');
  return $n;
}
// ids of the given folders and everything below them
function ds_subtree(array $ids) {
  $all = []; $todo = array_map('intval', $ids);
  while ($todo) {
    $todo = array_values(array_diff($todo, $all)); if (!$todo) break;
    $all = array_merge($all, $todo);
    $todo = array_map('intval', array_column(rows('SELECT id FROM ds_folders WHERE parent_id IN (' . ds_in($todo) . ')'), 'id'));
  }
  return $all;
}
function ds_path($id) {
  $p = []; $n = 0;
  while ($id && $n++ < 50) { $f = ds_folder($id); if (!$f) break; array_unshift($p, $f['name']); $id = $f['parent_id']; }
  return implode(' / ', $p);
}
function ds_folder_clash($parent, $name, $skip = 0) {
  return (bool)row('SELECT 1 FROM ds_folders WHERE COALESCE(parent_id,0)=' . (int)$parent . ' AND name=? COLLATE NOCASE AND id<>' . (int)$skip, [$name]);
}
function ds_file_clash($folder, $name, $skip = 0) {
  return row('SELECT id FROM datasheets WHERE COALESCE(folder_id,0)=' . (int)$folder . ' AND file_name=? COLLATE NOCASE AND id<>' . (int)$skip, [$name]);
}
// one file to the Recycle bin (asks for its folder to be restored first when it is deleted on its own)
function ds_trash_file($r, $label, $needParent = true) {
  $needs = [];
  if ($needParent && $r['folder_id'] && ($pf = ds_folder($r['folder_id']))) $needs[] = ['ds_folders', $pf['id'], 'the folder "' . $pf['name'] . '"'];
  trash_put('Datasheet', $label, [['datasheets', 'id=?', [$r['id']]]], $needs);
  q('DELETE FROM datasheets WHERE id=?', [$r['id']]);
}

// ZIP entries: [zip path, file path on disk, size, dos time]
function ds_zip_entries(array $fileIds, array $folderIds) {
  $out = []; $used = [];
  $add = function ($path, $r) use (&$out, &$used) {
    $p = ds_dir() . '/' . basename($r['path']); if (!is_file($p)) return;
    $ext = pathinfo($path, PATHINFO_EXTENSION); $base = $ext === '' ? $path : substr($path, 0, -(strlen($ext) + 1)); $n = $path; $k = 2;
    while (isset($used[mb_strtolower($n)])) $n = $base . ' (' . $k++ . ')' . ($ext === '' ? '' : ".$ext");
    $used[mb_strtolower($n)] = 1;
    $t = strtotime($r['updated'] ?: ($r['created'] ?: 'now')) ?: time(); $t = max($t, 315532800);
    $dt = ((date('Y', $t) - 1980) << 25) | (date('n', $t) << 21) | (date('j', $t) << 16) | (date('G', $t) << 11) | ((int)date('i', $t) << 5) | ((int)date('s', $t) >> 1);
    $out[] = [$n, $p, filesize($p), $dt];
  };
  $walk = function ($fid, $prefix) use (&$walk, $add) {
    foreach (rows('SELECT * FROM datasheets WHERE folder_id=? ORDER BY file_name COLLATE NOCASE', [$fid]) as $r) $add($prefix . $r['file_name'], $r);
    foreach (rows('SELECT * FROM ds_folders WHERE parent_id=? ORDER BY name COLLATE NOCASE', [$fid]) as $f) $walk($f['id'], $prefix . $f['name'] . '/');
  };
  foreach ($folderIds as $id) if ($f = ds_folder($id)) $walk($f['id'], $f['name'] . '/');
  if ($fileIds) foreach (rows('SELECT * FROM datasheets WHERE id IN (' . ds_in($fileIds) . ') ORDER BY file_name COLLATE NOCASE') as $r) $add($r['file_name'], $r);
  return $out;
}

function handle_folder($a) {
  $in = body();
  need('folder', in_array($a, ['folder_new', 'folder_rename', 'upload', 'rename', 'move', 'delete']));
  switch ($a) {
    case 'list':
      out(['folders' => rows('SELECT id,parent_id,name,created,user FROM ds_folders ORDER BY name COLLATE NOCASE'),
        'items' => rows('SELECT id,folder_id,title,file_name,size,token,created,updated,user,brand,model,notes FROM datasheets ORDER BY title COLLATE NOCASE')]);
    case 'get':
      $r = row('SELECT * FROM datasheets WHERE id=?', [(int)($_GET['id'] ?? 0)]); if (!$r) fail('Not found', 404);
      ds_serve($r, !empty($_GET['dl']));
    case 'folder_new':
      $parent = ds_fid($in['parent_id'] ?? 0); $name = ds_name($in['name'] ?? '');
      if ($parent && !ds_folder($parent)) fail('Folder not found', 404);
      if (ds_folder_clash($parent, $name)) fail('A folder with this name is already here', 409);
      q('INSERT INTO ds_folders(parent_id,name,user) VALUES(?,?,?)', [$parent, $name, $_SESSION['name'] ?? '']);
      $id = (int)db()->lastInsertId(); audit('create', 'ds_folder', $id, $name); out(['id' => $id]);
    case 'folder_rename':
      $f = ds_folder($in['id'] ?? 0); if (!$f) fail('Folder not found', 404);
      $name = ds_name($in['name'] ?? '');
      if (ds_folder_clash($f['parent_id'], $name, $f['id'])) fail('A folder with this name is already here', 409);
      q('UPDATE ds_folders SET name=? WHERE id=?', [$name, $f['id']]); audit('update', 'ds_folder', $f['id'], $name); out(['ok' => true]);
    case 'upload':
      $folder = ds_fid($_POST['folder_id'] ?? 0); if ($folder && !ds_folder($folder)) fail('Folder not found', 404);
      $fl = $_FILES['file'] ?? null; if (!$fl || $fl['error'] !== UPLOAD_ERR_OK) fail(ds_upload_err($fl['error'] ?? UPLOAD_ERR_NO_FILE));
      $ext = sec_upload($fl, ['image', 'pdf', 'office'], 25);
      $fname = basename(str_replace('\\', '/', (string)$fl['name']));
      $name = 'ds-' . bin2hex(random_bytes(10)) . '.' . $ext;
      if (!move_uploaded_file($fl['tmp_name'], ds_dir() . "/$name")) fail('Could not save file', 500);
      $replaced = false;
      if ($old = ds_file_clash($folder, $fname)) { $o = row('SELECT * FROM datasheets WHERE id=?', [$old['id']]); ds_trash_file($o, $o['file_name'] . ' (replaced by a new version)', false); $replaced = true; }
      q('INSERT INTO datasheets(folder_id,category,title,brand,model,notes,file_name,path,size,available,avail_note,token,user) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [$folder, '', pathinfo($fname, PATHINFO_FILENAME), '', '', '', $fname, $name, $fl['size'], 1, '', bin2hex(random_bytes(12)), $_SESSION['name'] ?? '']);
      $id = (int)db()->lastInsertId(); audit('upload', 'datasheet', $id, $fname); out(['id' => $id, 'replaced' => $replaced]);
    case 'rename':
      $r = row('SELECT * FROM datasheets WHERE id=?', [(int)($in['id'] ?? 0)]); if (!$r) fail('Not found', 404);
      $name = ds_name($in['name'] ?? ''); $oe = pathinfo($r['file_name'], PATHINFO_EXTENSION);
      if ($oe !== '' && strcasecmp(pathinfo($name, PATHINFO_EXTENSION), $oe) !== 0) $name .= ".$oe";
      if (ds_file_clash($r['folder_id'], $name, $r['id'])) fail('A file with this name is already here', 409);
      q('UPDATE datasheets SET file_name=?, title=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$name, pathinfo($name, PATHINFO_FILENAME), $r['id']]);
      audit('update', 'datasheet', $r['id'], $name); out(['ok' => true]);
    case 'move':
      $files = ds_ids($in['files'] ?? []); $folders = ds_ids($in['folders'] ?? []); $to = ds_fid($in['to'] ?? 0);
      if ($to && !ds_folder($to)) fail('Folder not found', 404);
      if ($to && in_array($to, ds_subtree($folders))) fail('A folder cannot go inside itself');
      $fr = $files ? rows('SELECT * FROM datasheets WHERE id IN (' . ds_in($files) . ')') : [];
      $dr = $folders ? rows('SELECT * FROM ds_folders WHERE id IN (' . ds_in($folders) . ')') : [];
      $bad = []; $seen = [];
      foreach ($fr as $r) { $k = 'f:' . mb_strtolower($r['file_name']); if (isset($seen[$k]) || ds_file_clash($to, $r['file_name'], $r['id'])) $bad[] = $r['file_name']; $seen[$k] = 1; }
      foreach ($dr as $f) { $k = 'd:' . mb_strtolower($f['name']); if (isset($seen[$k]) || ds_folder_clash($to, $f['name'], $f['id'])) $bad[] = $f['name']; $seen[$k] = 1; }
      if ($bad) fail('Already in the destination: ' . implode(', ', array_unique($bad)), 409);
      $db = db(); $db->beginTransaction();
      try {
        foreach ($fr as $r) { q('UPDATE datasheets SET folder_id=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$to, $r['id']]); audit('move', 'datasheet', $r['id'], $r['file_name']); }
        foreach ($dr as $f) { q('UPDATE ds_folders SET parent_id=? WHERE id=?', [$to, $f['id']]); audit('move', 'ds_folder', $f['id'], $f['name']); }
        $db->commit();
      } catch (Throwable $e) { $db->rollBack(); fail('Could not move: ' . $e->getMessage(), 500); }
      out(['ok' => true]);
    case 'delete':
      $files = ds_ids($in['files'] ?? []); $folders = ds_ids($in['folders'] ?? []);
      // a selected folder that sits inside another selected folder goes with its parent
      $top = [];
      foreach ($folders as $id) {
        $f = ds_folder($id); if (!$f) continue; $inner = false; $p = $f['parent_id']; $n = 0;
        while ($p && $n++ < 50) { if (in_array((int)$p, $folders)) { $inner = true; break; } $pf = ds_folder($p); $p = $pf ? $pf['parent_id'] : null; }
        if (!$inner) $top[] = $f;
      }
      $single = count($top) + count($files) === 1;
      foreach ($top as $f) {
        $sub = ds_in(ds_subtree([$f['id']])); $needs = [];
        if ($single && $f['parent_id'] && ($pf = ds_folder($f['parent_id']))) $needs[] = ['ds_folders', $pf['id'], 'the folder "' . $pf['name'] . '"'];
        trash_put('Folder', ds_path($f['id']), [['ds_folders', "id IN ($sub)", []], ['datasheets', "folder_id IN ($sub)", []]], $needs);
        foreach (rows("SELECT id,file_name FROM datasheets WHERE folder_id IN ($sub)") as $r) audit('delete', 'datasheet', $r['id'], $r['file_name']);
        q("DELETE FROM datasheets WHERE folder_id IN ($sub)"); q("DELETE FROM ds_folders WHERE id IN ($sub)");
        audit('delete', 'ds_folder', $f['id'], $f['name']);
      }
      foreach ($files as $id) {
        $r = row('SELECT * FROM datasheets WHERE id=?', [$id]); if (!$r) continue;
        ds_trash_file($r, $r['title'], $single); audit('delete', 'datasheet', $r['id'], $r['title']);
      }
      out(['ok' => true]);
    case 'zip':
      $files = ds_ids($_GET['files'] ?? ''); $folders = ds_ids($_GET['folders'] ?? '');
      $es = ds_zip_entries($files, $folders); if (!$es) fail('Nothing to download', 404);
      $total = array_sum(array_column($es, 2)); if ($total > DS_ZIP_MAX) fail('Too much to download at once — select fewer files', 413);
      $one = (count($folders) === 1 && !$files) ? ds_folder($folders[0]) : null;
      $fn = $one ? preg_replace('/[^\w\- .()]+/u', '_', $one['name']) . '.zip' : 'Files ' . date('Y-m-d') . '.zip';
      $len = 22; foreach ($es as $e) $len += 30 + strlen($e[0]) + $e[2] + 46 + strlen($e[0]);
      audit('download', 'datasheet', null, count($es) . ' file(s)');
      if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
      while (ob_get_level()) ob_end_clean();
      header_remove('Content-Type'); header('Content-Type: application/zip'); header('Content-Length: ' . $len);
      header('Content-Disposition: attachment; filename="' . $fn . '"'); header('X-Content-Type-Options: nosniff');
      $off = 0; $cd = '';
      foreach ($es as [$n, $p, $size, $dt]) {
        $crc = hexdec(hash_file('crc32b', $p)); $size = filesize($p);
        $h = pack('VvvvVVVVvv', 0x04034b50, 20, 0x0800, 0, $dt, $crc, $size, $size, strlen($n), 0) . $n;
        $cd .= pack('VvvvvVVVVvvvvvVV', 0x02014b50, 20, 20, 0x0800, 0, $dt, $crc, $size, $size, strlen($n), 0, 0, 0, 0, 0, $off) . $n;
        echo $h; readfile($p); $off += strlen($h) + $size;
      }
      echo $cd . pack('VvvvvVVv', 0x06054b50, 0, 0, count($es), count($es), strlen($cd), $off, 0);
      exit;
  }
  fail('Unknown action', 404);
}
