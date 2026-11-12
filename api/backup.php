<?php
// Settings › Data & backup: a full backup to download — the database, and every stored file if wanted — and restoring from one.
//
// A full backup is a ZIP, written and read here (the server may not have the zip extension):
//   solarize-backup.json   what it is and when it was made
//   crm.sqlite             a consistent copy of the database
//   uploads/<file>         data/uploads: customer documents, Folder files, WhatsApp media, pictures (only with "all files")
//   trash/<file>           files waiting in the Recycle bin                                       (only with "all files")
//   public/<file>          the sign-in screen picture                                             (only with "all files")
// mail.key, the key that locks saved email passwords, is never put in a backup.
//
// Restore takes that ZIP, or a plain .sqlite backup (database only), uploaded or picked from the saved backups on the server:
//   'missing'  brings back documents and Folder files that are in the backup but no longer in the CRM, and files that were lost from
//              the server. Nothing that exists now is changed. (For something deleted by mistake after the Recycle bin's time ran out.)
//   'full'     puts the whole database back as it was when the backup was made — a copy of the current database is saved first —
//              and adds the backup's files. Needs the admin's password and the word RESTORE.

const BK_MARK = 'solarize-backup';
const BK_NAME_OK = '/^\w[\w.\-]{0,200}$/'; /* a file name as the CRM stores them: no folders, no odd characters */
const BK_BAD_EXT = '/\.(php\d?|phtml|phar|pht|html?|svg|js|exe|bat|cmd|sh|py|pl|cgi|htaccess)(\.|$)/i';
const BK_PUBLIC_OK = '/^login-bg-\w+\.(jpe?g|png|webp)$/i';
const BK_SHOW = ['customers' => 'Customers', 'leads' => 'Leads', 'projects' => 'Projects', 'quotes' => 'Quotations', 'payments' => 'Payments', 'files' => 'Documents', 'datasheets' => 'Folder files', 'users' => 'Users'];

function bk_public_dir() { return dirname(__DIR__) . '/uploads'; }
function bk_ini_bytes($v) { $v = trim((string)$v); $n = (float)$v; $u = strtolower(substr($v, -1)); return (int)($n * ($u === 'g' ? 1073741824 : ($u === 'm' ? 1048576 : ($u === 'k' ? 1024 : 1)))); }
function bk_upload_limit() { $a = bk_ini_bytes(ini_get('upload_max_filesize')); $b = bk_ini_bytes(ini_get('post_max_size')); return $b > 0 ? min($a, $b) : $a; }
function bk_dos($ts) { $d = getdate($ts ?: time()); return ((max(1980, $d['year']) - 1980) << 25) | ($d['mon'] << 21) | ($d['mday'] << 16) | ($d['hours'] << 11) | ($d['minutes'] << 5) | ($d['seconds'] >> 1); }
/* working copies older than six hours (an upload that was checked but never restored, a snapshot of an interrupted download) */
function bk_cleanup() { foreach (array_merge(glob(backups_dir() . '/restore-*') ?: [], glob(backups_dir() . '/snap-*') ?: []) as $f) if (is_file($f) && filemtime($f) < time() - 6 * 3600) @unlink($f); }

/* every stored file: [name in the backup, path on the server, size, time] */
function bk_file_list() {
  $out = [];
  foreach ([['uploads/', up_dir()], ['trash/', trash_dir()], ['public/', bk_public_dir()]] as [$pre, $dir]) {
    if (!is_dir($dir)) continue;
    foreach (scandir($dir) ?: [] as $f) {
      $p = "$dir/$f";
      if ($f[0] === '.' || !is_file($p) || !preg_match(BK_NAME_OK, $f) || preg_match(BK_BAD_EXT, $f)) continue;
      if ($pre === 'public/' && !preg_match(BK_PUBLIC_OK, $f)) continue;
      $out[] = [$pre . $f, $p, (int)filesize($p), (int)filemtime($p)];
    }
  }
  return $out;
}
/* a consistent copy of the database in a file of its own (the caller removes it) */
function bk_db_snapshot($name = null) {
  $tmp = backups_dir() . '/' . ($name ?: 'snap-' . bin2hex(random_bytes(6)) . '.sqlite');
  try { db()->exec('VACUUM INTO ' . db()->quote($tmp)); }
  catch (Throwable $e) { @unlink($tmp); db()->exec('PRAGMA wal_checkpoint(TRUNCATE)'); if (!@copy(dirname(__DIR__) . '/data/crm.sqlite', $tmp)) fail('Could not copy the database', 500); }
  return $tmp;
}

/* ---------- download ---------- */
function bk_download() {
  @set_time_limit(0); bk_cleanup();
  $with = !empty($_GET['files']); $files = $with ? bk_file_list() : [];
  $snap = bk_db_snapshot();
  $info = json_encode(['kind' => BK_MARK, 'version' => 1, 'made' => gmdate('Y-m-d\TH:i:s\Z'), 'schema' => SCHEMA_VERSION, 'with_files' => $with, 'files' => count($files), 'bytes' => array_sum(array_column($files, 2)), 'site' => (string)($_SERVER['HTTP_HOST'] ?? '')]);
  $es = [['solarize-backup.json', null, strlen($info), time(), $info], ['crm.sqlite', $snap, (int)filesize($snap), time(), null]];
  foreach ($files as $f) $es[] = [$f[0], $f[1], $f[2], $f[3], null];
  $len = 22; foreach ($es as $e) $len += 30 + strlen($e[0]) + $e[2] + 46 + strlen($e[0]);
  if (count($es) > 65000 || $len > 0xFFFFFF00) { @unlink($snap); fail('There are too many files for one backup (over 4 GB). Download the database alone and copy the data/uploads folder with the hosting File Manager.', 413); }
  audit('backup', 'db', null, $with ? 'database and ' . count($files) . ' file(s)' : 'database, as a ZIP');
  if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
  while (ob_get_level()) ob_end_clean();
  header_remove('Content-Type'); header('Content-Type: application/zip'); header('Content-Length: ' . $len); header('X-Content-Type-Options: nosniff'); header('Cache-Control: private, no-store');
  header('Content-Disposition: attachment; filename="solarize-backup-' . date('Y-m-d-Hi') . ($with ? '-with-files' : '') . '.zip"');
  $off = 0; $cd = '';
  foreach ($es as [$n, $p, $size, $mt, $str]) {
    $crc = $str !== null ? crc32($str) : hexdec(hash_file('crc32b', $p)); $dt = bk_dos($mt);
    $h = pack('VvvvVVVVvv', 0x04034b50, 20, 0x0800, 0, $dt, $crc, $size, $size, strlen($n), 0) . $n;
    $cd .= pack('VvvvvVVVVvvvvvVV', 0x02014b50, 20, 20, 0x0800, 0, $dt, $crc, $size, $size, strlen($n), 0, 0, 0, 0, 0, $off) . $n;
    echo $h; if ($str !== null) echo $str; else readfile($p);
    $off += strlen($h) + $size;
  }
  echo $cd . pack('VvvvvVVv', 0x06054b50, 0, 0, count($es), count($es), strlen($cd), $off, 0);
  @unlink($snap); exit;
}

/* ---------- reading a ZIP (stored or deflated entries; no ZIP64, no passwords) ---------- */
function bk_zip_index($path) { /* name => [method, crc, compressed size, size, offset, flags], or null when it is not a ZIP we can read */
  $size = (int)@filesize($path); $fh = @fopen($path, 'rb'); if (!$fh || $size < 22) return null;
  $tail = min($size, 65557); fseek($fh, $size - $tail); $buf = (string)fread($fh, $tail); $p = strrpos($buf, "PK\x05\x06");
  if ($p === false || strlen($buf) < $p + 22) { fclose($fh); return null; }
  $e = unpack('vdisk/vcdisk/vn/vtotal/Vcdsize/Vcdoff', substr($buf, $p + 4, 16));
  if ($e['total'] === 0xFFFF || $e['cdoff'] === 0xFFFFFFFF || $e['cdoff'] + $e['cdsize'] > $size) { fclose($fh); return null; }
  fseek($fh, $e['cdoff']); $cd = $e['cdsize'] > 0 ? (string)fread($fh, $e['cdsize']) : ''; fclose($fh);
  $o = 0; $out = [];
  for ($i = 0; $i < $e['total']; $i++) {
    if (substr($cd, $o, 4) !== "PK\x01\x02" || strlen($cd) < $o + 46) return null;
    $h = unpack('vver/vneed/vflag/vmethod/Vdt/Vcrc/Vcsize/Vsize/vnlen/velen/vclen/vdisk/viattr/Veattr/Voff', substr($cd, $o + 4, 42));
    $name = substr($cd, $o + 46, $h['nlen']); $o += 46 + $h['nlen'] + $h['elen'] + $h['clen'];
    $out[$name] = [$h['method'], $h['crc'], $h['csize'], $h['size'], $h['off'], $h['flag']];
  }
  return $out;
}
function bk_zip_extract($path, $ent, $dest, $max = 2147483648) { /* writes one entry to $dest; false when it cannot be read, is too big or its checksum is wrong */
  [$method, $crc, $csize, $size, $off, $flag] = $ent;
  if (($flag & 1) || ($method !== 0 && $method !== 8) || $size > $max) return false;
  $fh = @fopen($path, 'rb'); if (!$fh) return false;
  fseek($fh, $off); $lh = (string)fread($fh, 30);
  if (strlen($lh) < 30 || substr($lh, 0, 4) !== "PK\x03\x04") { fclose($fh); return false; }
  $l = unpack('vnlen/velen', substr($lh, 26, 4)); fseek($fh, $off + 30 + $l['nlen'] + $l['elen']);
  $out = @fopen($dest, 'wb'); if (!$out) { fclose($fh); return false; }
  $ctx = hash_init('crc32b'); $left = $csize; $ok = true; $written = 0; $inf = $method === 8 ? inflate_init(ZLIB_ENCODING_RAW) : null;
  if ($method === 8 && $csize === 0 && $size > 0) $ok = false;
  while ($ok && $left > 0) {
    $chunk = fread($fh, (int)min(1048576, $left)); if ($chunk === false || $chunk === '') { $ok = false; break; }
    $left -= strlen($chunk);
    if ($inf) { $chunk = @inflate_add($inf, $chunk, $left > 0 ? ZLIB_NO_FLUSH : ZLIB_FINISH); if ($chunk === false) { $ok = false; break; } }
    $written += strlen($chunk); if ($written > $size) { $ok = false; break; }
    hash_update($ctx, $chunk); fwrite($out, $chunk);
  }
  fclose($fh); fclose($out);
  if ($ok && (hexdec(hash_final($ctx)) !== $crc || $written !== $size)) $ok = false;
  if (!$ok) @unlink($dest);
  return $ok;
}

/* ---------- the backup being restored ---------- */
/* token → the file: 24 hex = an upload kept as restore-<token>.zip|sqlite, "saved:<name>" = a saved backup on the server */
function bk_source($token) {
  $token = (string)$token; $dir = backups_dir();
  if (preg_match('/^[0-9a-f]{24}$/', $token)) { foreach (['zip', 'sqlite'] as $x) if (is_file("$dir/restore-$token.$x")) return ["$dir/restore-$token.$x", $x, $token]; }
  elseif (preg_match('/^saved:([\w.\-]+\.(sqlite|zip))$/', $token, $m) && !preg_match('/^(restore|snap)-/', $m[1]) && is_file("$dir/{$m[1]}")) return ["$dir/{$m[1]}", $m[2], md5($m[1] . filemtime("$dir/{$m[1]}"))];
  fail('That backup is no longer here. Choose the file again.', 410);
}
/* opens it: ['zip' => index or null, 'path' => the file, 'db' => the database file, 'info' => what the backup says about itself] */
function bk_open($token) {
  [$path, $ext, $key] = bk_source($token);
  $head = (string)@file_get_contents($path, false, null, 0, 16);
  if ($ext === 'sqlite' || strpos($head, 'SQLite format 3') === 0) { $idx = null; $dbf = $path; $info = ['with_files' => false, 'files' => 0, 'made' => gmdate('Y-m-d\TH:i:s\Z', (int)filemtime($path))]; }
  else {
    $idx = bk_zip_index($path); if ($idx === null) fail('This file cannot be read as a backup (not a ZIP made by the CRM, or damaged).');
    if (!isset($idx['crm.sqlite'])) fail('This ZIP has no database in it (crm.sqlite) — it is not a CRM backup.');
    $dbf = backups_dir() . "/restore-$key-db.sqlite";
    if (!is_file($dbf) && !bk_zip_extract($path, $idx['crm.sqlite'], $dbf)) fail('The database inside this backup is damaged.');
    $info = ['with_files' => false, 'files' => 0, 'made' => ''];
    if (isset($idx['solarize-backup.json']) && $idx['solarize-backup.json'][3] < 65536) { $t = backups_dir() . "/restore-$key-info.json";
      if (bk_zip_extract($path, $idx['solarize-backup.json'], $t)) { $j = json_decode((string)file_get_contents($t), true); @unlink($t); if (is_array($j) && ($j['kind'] ?? '') === BK_MARK) $info = ['with_files' => !empty($j['with_files']), 'files' => (int)($j['files'] ?? 0), 'made' => (string)($j['made'] ?? '')]; } }
    $n = 0; foreach ($idx as $name => $_) if (strpos($name, 'uploads/') === 0) $n++;
    $info['files'] = $n; $info['with_files'] = $n > 0;
  }
  if (strpos((string)@file_get_contents($dbf, false, null, 0, 16), 'SQLite format 3') !== 0) fail('This file is not a CRM database backup.');
  return ['zip' => $idx, 'path' => $path, 'db' => $dbf, 'info' => $info];
}
/* joins the backup's database to this connection as "bk"; fails when it is not a CRM database or is from a newer version */
function bk_attach($dbf) {
  $db = db();
  try { $db->exec('ATTACH DATABASE ' . $db->quote($dbf) . ' AS bk'); $tabs = bk_tables('bk'); $ver = (int)$db->query('PRAGMA bk.user_version')->fetchColumn(); }
  catch (Throwable $e) { bk_detach(); fail('This file is not a CRM database backup.'); }
  if (array_diff(['users', 'customers', 'settings', 'files'], $tabs)) { bk_detach(); fail('This file is not a CRM database backup.'); }
  if ($ver > SCHEMA_VERSION) { bk_detach(); fail('This backup was made by a newer version of the CRM than this one. Update the CRM first.'); }
  return $ver;
}
function bk_detach() { try { db()->exec('DETACH DATABASE bk'); } catch (Throwable $e) { } }
function bk_tables($s) { return array_column(db()->query("SELECT name FROM $s.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchAll(), 'name'); }
function bk_cols($t) { /* columns the table has both here and in the backup */
  $a = array_column(db()->query("PRAGMA main.table_info(\"$t\")")->fetchAll(), 'name'); $b = array_column(db()->query("PRAGMA bk.table_info(\"$t\")")->fetchAll(), 'name');
  return array_values(array_intersect($a, $b));
}
function bk_has_file($b, $name, $pre = 'uploads/') { return $b['zip'] !== null && isset($b['zip'][$pre . $name]); }
/* puts one file of the backup into $dir unless it is there already; refuses names and contents an upload would refuse. 1 = written, 0 = already there, -1 = not possible */
function bk_put_file($b, $name, $dir, $pre = 'uploads/') {
  if (!preg_match(BK_NAME_OK, $name) || preg_match(BK_BAD_EXT, $name) || ($pre === 'public/' && !preg_match(BK_PUBLIC_OK, $name))) return -1;
  if (is_file("$dir/$name")) return 0;
  if (!bk_has_file($b, $name, $pre)) return -1;
  if (!is_dir($dir)) @mkdir($dir, $pre === 'public/' ? 0755 : 0750, true);
  $tmp = "$dir/.restore-" . bin2hex(random_bytes(6)) . '.tmp';
  if (!bk_zip_extract($b['path'], $b['zip'][$pre . $name], $tmp, 524288000)) return -1;
  if (preg_match(UP_CODE, (string)file_get_contents($tmp))) { @unlink($tmp); return -1; } /* the same "contains code" check as an upload */
  if (!@rename($tmp, "$dir/$name")) { @unlink($tmp); return -1; }
  return 1;
}

/* what is in the backup but no longer in the CRM — documents and Folder files — and files the server has lost */
function bk_missing($b) {
  $db = db(); $bt = bk_tables('bk'); $out = ['docs' => [], 'docs_skip' => ['owner' => 0, 'replaced' => 0, 'nofile' => 0], 'sheets' => [], 'sheets_skip' => ['nofile' => 0], 'lost' => []];
  $fc = array_column($db->query('PRAGMA bk.table_info(files)')->fetchAll(), 'name'); $gen = in_array('gen', $fc) ? 'f.gen' : "''";
  foreach ($db->query("SELECT f.*, $gen bk_gen FROM bk.files f WHERE f.id NOT IN (SELECT id FROM main.files) ORDER BY f.id")->fetchAll() as $f) {
    $cid = (int)$f['customer_id']; $pid = (int)$f['project_id'];
    $hasC = $cid && row('SELECT 1 FROM customers WHERE id=?', [$cid]); $hasP = $pid && row('SELECT 1 FROM projects WHERE id=?', [$pid]);
    if ($cid ? !$hasC : !$hasP) { $out['docs_skip']['owner']++; continue; } /* its customer (or project) is no longer in the CRM */
    if ($pid && !$hasP) $f['project_id'] = null; /* the project is gone, the customer is still there */
    if ((string)$f['bk_gen'] !== '' && $cid && row('SELECT 1 FROM files WHERE customer_id=? AND gen=?', [$cid, $f['bk_gen']])) { $out['docs_skip']['replaced']++; continue; } /* a paper the CRM made again since: the newer copy is there */
    $name = basename((string)$f['path']);
    if (!is_file(up_dir() . "/$name") && !bk_has_file($b, $name)) { $out['docs_skip']['nofile']++; continue; }
    $f['bk_owner'] = $cid ? (string)(row('SELECT name FROM customers WHERE id=?', [$cid])['name'] ?? '') : (string)(row('SELECT title FROM projects WHERE id=?', [$pid])['title'] ?? '');
    $out['docs'][] = $f;
  }
  if (in_array('datasheets', $bt)) foreach ($db->query('SELECT d.* FROM bk.datasheets d WHERE d.id NOT IN (SELECT id FROM main.datasheets) ORDER BY d.id')->fetchAll() as $d) {
    $name = basename((string)$d['path']);
    if (!is_file(up_dir() . "/$name") && !bk_has_file($b, $name)) { $out['sheets_skip']['nofile']++; continue; }
    if (!empty($d['token']) && row('SELECT 1 FROM datasheets WHERE token=?', [$d['token']])) continue;
    $out['sheets'][] = $d;
  }
  /* still listed in the CRM, gone from the server, present in the backup */
  if ($b['zip'] !== null) {
    $names = array_merge(array_column(rows("SELECT path n FROM files WHERE COALESCE(path,'')<>''"), 'n'), array_column(rows("SELECT path n FROM datasheets WHERE COALESCE(path,'')<>''"), 'n'),
      array_column(rows("SELECT file_path n FROM wa_msgs WHERE COALESCE(file_path,'')<>''"), 'n'), array_column(rows("SELECT avatar n FROM users WHERE COALESCE(avatar,'')<>''"), 'n'));
    foreach ($b['zip'] as $zn => $_) if (preg_match('#^uploads/(qm-[0-9a-f]{24}\.(png|jpg|webp))$#', $zn, $m)) $names[] = $m[1]; /* quotation pictures */
    foreach (array_unique(array_map('basename', $names)) as $n) if ($n !== '' && !is_file(up_dir() . "/$n") && bk_has_file($b, $n)) $out['lost'][] = $n;
  }
  return $out;
}
/* a Folder that was deleted comes back with the files that were in it (and its parent folders) */
function bk_folder($id, $depth = 0) {
  $id = (int)$id; if (!$id) return null;
  if (row('SELECT 1 FROM ds_folders WHERE id=?', [$id])) return $id;
  if ($depth > 30 || !in_array('ds_folders', bk_tables('bk'))) return null;
  $s = db()->prepare('SELECT * FROM bk.ds_folders WHERE id=?'); $s->execute([$id]); $f = $s->fetch(); if (!$f) return null;
  $parent = bk_folder($f['parent_id'] ?? 0, $depth + 1);
  q('INSERT OR IGNORE INTO ds_folders(id,parent_id,name,created,user) VALUES(?,?,?,?,?)', [$id, $parent, (string)$f['name'], (string)($f['created'] ?? ''), (string)($f['user'] ?? '')]);
  return row('SELECT 1 FROM ds_folders WHERE id=?', [$id]) ? $id : null;
}

/* ---------- restore: look first ---------- */
function bk_check() {
  @set_time_limit(0); bk_cleanup();
  if (!empty($_FILES['file']) && (int)($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
    $fl = $_FILES['file'];
    if ($fl['error'] !== UPLOAD_ERR_OK) fail($fl['error'] === UPLOAD_ERR_INI_SIZE || $fl['error'] === UPLOAD_ERR_FORM_SIZE ? 'This backup is larger than the server accepts in one upload (' . round(bk_upload_limit() / 1048576) . ' MB). Put it in the data/backups folder with the hosting File Manager and pick it under Saved backups.' : up_err($fl['error']));
    if (!is_uploaded_file($fl['tmp_name'])) fail('Upload failed');
    $ext = strtolower(pathinfo((string)$fl['name'], PATHINFO_EXTENSION)); if (!in_array($ext, ['zip', 'sqlite'], true)) fail('Choose a backup file: the .zip or .sqlite downloaded from here.');
    $token = bin2hex(random_bytes(12));
    if (!move_uploaded_file($fl['tmp_name'], backups_dir() . "/restore-$token.$ext")) fail('Could not read the file', 500);
    $label = basename((string)$fl['name']);
  } else {
    $name = basename((string)(body()['name'] ?? '')); if ($name === '') fail('Choose a backup file');
    $token = 'saved:' . $name; $label = $name;
  }
  $b = bk_open($token); $ver = bk_attach($b['db']);
  try {
    $bt = bk_tables('bk'); $counts = [];
    foreach (BK_SHOW as $t => $l) $counts[] = [$l, in_array($t, $bt) ? (int)db()->query("SELECT COUNT(*) FROM bk.\"$t\"")->fetchColumn() : 0, (int)db()->query("SELECT COUNT(*) FROM main.\"$t\"")->fetchColumn()];
    $m = bk_missing($b);
    $show = fn($f) => ['name' => (string)($f['item'] ?? '') !== '' ? $f['item'] : $f['name'], 'file' => (string)$f['name'], 'owner' => (string)$f['bk_owner'], 'date' => substr((string)$f['created'], 0, 10)];
    $sheet = fn($d) => ['name' => (string)($d['file_name'] ?? '') !== '' ? $d['file_name'] : (string)($d['title'] ?? ''), 'date' => substr((string)($d['created'] ?? ''), 0, 10)];
    $res = ['token' => $token, 'label' => $label, 'made' => $b['info']['made'], 'schema' => $ver, 'with_files' => $b['info']['with_files'], 'files' => $b['info']['files'], 'counts' => $counts,
      'docs' => count($m['docs']), 'docs_list' => array_map($show, array_slice($m['docs'], 0, 200)), 'docs_skip' => $m['docs_skip'],
      'sheets' => count($m['sheets']), 'sheets_list' => array_map($sheet, array_slice($m['sheets'], 0, 200)), 'sheets_skip' => $m['sheets_skip'], 'lost' => count($m['lost'])];
  } finally { bk_detach(); }
  out($res);
}

/* ---------- restore: do it ---------- */
function bk_run($in) {
  @set_time_limit(0);
  $mode = (string)($in['mode'] ?? ''); if (!in_array($mode, ['missing', 'full'], true)) fail('Choose what to restore');
  if ($mode === 'full') {
    $me = row('SELECT * FROM users WHERE id=?', [uid()]);
    if (!$me || !password_verify((string)($in['password'] ?? ''), $me['hash'])) fail('Wrong admin password', 401);
    if (($in['confirm'] ?? '') !== 'RESTORE') fail('Type RESTORE to confirm');
  }
  $b = bk_open($in['token'] ?? ''); $db = db();
  if ($mode === 'full') { /* the current database is kept as a saved backup before anything changes */
    $safe = 'pre-restore-' . date('Y-m-d-His') . '-' . bin2hex(random_bytes(3)) . '.sqlite';
    bk_db_snapshot($safe); if (!is_file(backups_dir() . "/$safe")) fail('Could not save a copy of the current database — nothing was changed', 500);
  }
  $ver = bk_attach($b['db']);
  try {
    if ($mode === 'missing') {
      $m = bk_missing($b); $r = ['docs' => 0, 'sheets' => 0, 'lost' => 0, 'failed' => 0];
      $cols = bk_cols('files');
      foreach ($m['docs'] as $f) {
        $name = basename((string)$f['path']); if (bk_put_file($b, $name, up_dir()) < 0) { $r['failed']++; continue; }
        $v = []; foreach ($cols as $c) $v[$c] = $f[$c];
        /* a document already past its keeping time would go straight back to the Recycle bin: it starts a fresh one */
        $life = array_key_exists('life', $v) && $v['life'] !== null ? (int)$v['life'] : rule('doc_days');
        if ($life > 0 && strtotime((string)$v['created'] . ' UTC') < time() - $life * 86400) $v['created'] = gmdate('Y-m-d H:i:s');
        q('INSERT OR IGNORE INTO files(' . implode(',', array_map(fn($c) => "\"$c\"", $cols)) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')', array_values($v));
        if (row('SELECT 1 FROM files WHERE id=?', [$f['id']])) $r['docs']++; else $r['failed']++;
      }
      $cols = bk_cols('datasheets');
      foreach ($m['sheets'] as $d) {
        $name = basename((string)$d['path']); if (bk_put_file($b, $name, up_dir()) < 0) { $r['failed']++; continue; }
        $v = []; foreach ($cols as $c) $v[$c] = $d[$c];
        if (array_key_exists('folder_id', $v)) $v['folder_id'] = bk_folder($v['folder_id']); /* its folder, brought back too; the top level when that is gone */
        q('INSERT OR IGNORE INTO datasheets(' . implode(',', array_map(fn($c) => "\"$c\"", $cols)) . ') VALUES(' . implode(',', array_fill(0, count($cols), '?')) . ')', array_values($v));
        if (row('SELECT 1 FROM datasheets WHERE id=?', [$d['id']])) $r['sheets']++; else $r['failed']++;
      }
      foreach ($m['lost'] as $n) { $x = bk_put_file($b, $n, up_dir()); if ($x > 0) $r['lost']++; elseif ($x < 0) $r['failed']++; }
      audit('restore', 'system', null, "Brought back from a backup: {$r['docs']} document(s), {$r['sheets']} Folder file(s), {$r['lost']} lost file(s)" . ($r['failed'] ? ", {$r['failed']} could not be restored" : ''));
      $res = ['ok' => true, 'mode' => 'missing'] + $r;
    } else {
      $main = bk_tables('main'); $bt = bk_tables('bk');
      $db->beginTransaction();
      try {
        foreach ($main as $t) {
          $db->exec("DELETE FROM main.\"$t\"");
          if (!in_array($t, $bt, true)) continue; /* a table that did not exist yet when the backup was made stays empty */
          $cols = bk_cols($t); if (!$cols) continue;
          $c = implode(',', array_map(fn($x) => "\"$x\"", $cols));
          $db->exec("INSERT INTO main.\"$t\"($c) SELECT $c FROM bk.\"$t\"");
        }
        $db->commit();
      } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); fail('The restore failed and nothing was changed: ' . $e->getMessage(), 500); }
      $db->exec('PRAGMA main.user_version=' . (int)$ver); /* the changes made to the CRM since that backup are applied again on the next page load */
      $put = ['files' => 0, 'failed' => 0];
      if ($b['zip'] !== null) foreach ($b['zip'] as $zn => $_) {
        foreach ([['uploads/', up_dir()], ['trash/', trash_dir()], ['public/', bk_public_dir()]] as [$pre, $dir]) if (strpos($zn, $pre) === 0) { $x = bk_put_file($b, substr($zn, strlen($pre)), $dir, $pre); if ($x > 0) $put['files']++; elseif ($x < 0) $put['failed']++; }
      }
      q('INSERT INTO audit_log(user,action,entity,entity_id,detail) VALUES(?,?,?,?,?)', [$_SESSION['username'] ?? '-', 'restore', 'system', null, 'Everything put back from a backup made ' . ($b['info']['made'] ?: 'earlier') . " · {$put['files']} file(s) added · the database before it is saved as $safe"]);
      $res = ['ok' => true, 'mode' => 'full', 'backup' => $safe, 'files' => $put['files'], 'failed' => $put['failed'], 'customers' => (int)$db->query('SELECT COUNT(*) FROM main.customers')->fetchColumn()];
    }
  } finally { bk_detach(); }
  /* the working copies of an uploaded backup are not needed any more */
  if (preg_match('/^[0-9a-f]{24}$/', (string)($in['token'] ?? ''))) foreach (glob(backups_dir() . '/restore-' . $in['token'] . '*') ?: [] as $f) @unlink($f);
  out($res);
}

/* reset/backup_info: what a full backup would hold, the upload limit, the saved backups */
function bk_info() {
  $files = bk_file_list();
  out(['files' => count($files), 'bytes' => array_sum(array_column($files, 2)), 'db_bytes' => (int)@filesize(dirname(__DIR__) . '/data/crm.sqlite'), 'upload_limit' => bk_upload_limit()]);
}
