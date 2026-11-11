<?php
// Folder page (file manager) API tests. Usage: php tests/folder_api_test.php http://localhost:8094 /path/to/crm.sqlite
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }

function actor($name) { return ['jar' => sys_get_temp_dir() . '/fxjar_' . $name . '_' . getmypid() . '.txt']; }
function call($who, $m, $a, $body = null, $qs = '') {
  global $base;
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs");
  $h = ['X-Solarize: 1'];
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar']]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POST, true); $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt];
  $j['_code'] = $code; return $j;
}
/* raw GET: returns [http code, body, headers] */
function raw($who, $m, $a, $qs = '') {
  global $base;
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs"); $hdr = [];
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar'], CURLOPT_HTTPHEADER => ['X-Solarize: 1'],
    CURLOPT_HEADERFUNCTION => function ($c, $l) use (&$hdr) { $p = explode(':', $l, 2); if (count($p) === 2) $hdr[strtolower(trim($p[0]))] = trim($p[1]); return strlen($l); }]);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  return [$code, (string)$txt, $hdr];
}
function upload($who, $name, $bytes, $folderId) {
  global $base;
  $tmp = sys_get_temp_dir() . '/fxup_' . getmypid() . '_' . mt_rand() . '.pdf'; file_put_contents($tmp, $bytes);
  $ch = curl_init("$base/api.php?m=folder&a=upload");
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar'], CURLOPT_HTTPHEADER => ['X-Solarize: 1'], CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => ['folder_id' => (string)$folderId, 'file' => new CURLFile($tmp, 'application/pdf', $name)]]);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch); @unlink($tmp);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt];
  $j['_code'] = $code; return $j;
}
/* reads a stored ZIP: [name => bytes]; fails the check if a CRC or offset is wrong */
function zip_read($z) {
  $eo = strrpos($z, "PK\x05\x06"); if ($eo === false) return null;
  $e = unpack('vdisk/vcd_disk/vn_disk/vn/Vcd_size/Vcd_off', substr($z, $eo + 4, 18));
  $out = []; $p = $e['cd_off'];
  for ($i = 0; $i < $e['n']; $i++) {
    $c = unpack('Vsig/vver/vneed/vflags/vmethod/vtime/vdate/Vcrc/Vcsize/Vusize/vnlen/vxlen/vclen/vdisk/vint/Vext/Voff', substr($z, $p, 46));
    $name = substr($z, $p + 46, $c['nlen']); $p += 46 + $c['nlen'] + $c['xlen'] + $c['clen'];
    $l = unpack('Vsig/vver/vflags/vmethod/vtime/vdate/Vcrc/Vcsize/Vusize/vnlen/vxlen', substr($z, $c['off'], 30));
    if ($l['sig'] !== 0x04034b50 || $c['method'] !== 0) return null;
    $data = substr($z, $c['off'] + 30 + $l['nlen'] + $l['xlen'], $c['usize']);
    if (crc32($data) !== $c['crc']) return null;
    $out[$name] = $data;
  }
  return $out;
}
function names($r) { return array_column($r['items'] ?? [], 'file_name'); }
function fid($r, $name) { foreach ($r['folders'] ?? [] as $f) if ($f['name'] === $name) return (int)$f['id']; return 0; }

$anon = actor('anon'); $admin = actor('admin'); $sales = actor('sales'); $eng = actor('eng'); $acc = actor('acc'); $ba = actor('ba');
$pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
foreach ([['fxsales', 'sales', $sales], ['fxeng', 'engineer', $eng], ['fxacc', 'accounts', $acc], ['fxba', 'ba', $ba]] as [$un, $role, $who]) {
  $u = call($admin, 'admin', 'user_save', ['name' => 'FX ' . $role, 'username' => $un, 'role' => $role, 'active' => 1, 'can_claim' => 0, 'password' => $pw]);
  chk(!empty($u['id']), "$role user created");
  chk(call($who, 'auth', 'login', ['username' => $un, 'password' => $pw])['_code'] === 200, "$role signed in");
}

/* folders */
$a = call($sales, 'folder', 'folder_new', ['parent_id' => null, 'name' => '  Solar panels ']);
$sp = (int)($a['id'] ?? 0); chk($sp > 0, 'sales creates a top-level folder (name trimmed)');
$rn = call($sales, 'folder', 'folder_new', ['parent_id' => $sp, 'name' => 'ReNew']); $renew = (int)($rn['id'] ?? 0);
chk($renew > 0, 'sub-folder ReNew');
$w = call($sales, 'folder', 'folder_new', ['parent_id' => $renew, 'name' => '550 Wp']); $wp = (int)($w['id'] ?? 0);
chk($wp > 0, 'sub-folder 550 Wp');
$d = call($sales, 'folder', 'folder_new', ['parent_id' => $sp, 'name' => 'renew']);
chk($d['_code'] === 409 && ($d['error'] ?? '') === 'A folder with this name is already here', 'duplicate sibling name (any case) is 409');
chk(call($sales, 'folder', 'folder_new', ['parent_id' => $sp, 'name' => 'A/B'])['_code'] === 400, 'name with / is 400');
chk(call($sales, 'folder', 'folder_new', ['parent_id' => $sp, 'name' => 'A\\B'])['_code'] === 400, 'name with \\ is 400');
chk(call($sales, 'folder', 'folder_new', ['parent_id' => $sp, 'name' => '   '])['_code'] === 400, 'empty name is 400');
chk(call($sales, 'folder', 'folder_new', ['parent_id' => $sp, 'name' => str_repeat('x', 81)])['_code'] === 400, 'name over 80 characters is 400');
chk(call($sales, 'folder', 'folder_new', ['parent_id' => 99999, 'name' => 'Ghost'])['_code'] === 404, 'unknown parent is 404');
chk(call($sales, 'folder', 'folder_new', ['parent_id' => $renew, 'name' => 'Solar panels'])['_code'] === 200, 'same name is fine under a different parent');
$o = call($sales, 'folder', 'folder_new', ['parent_id' => null, 'name' => 'Other']); $other = (int)($o['id'] ?? 0);
chk(call($sales, 'folder', 'folder_rename', ['id' => $other, 'name' => 'Inverters'])['_code'] === 200, 'folder rename');
chk(call($sales, 'folder', 'folder_rename', ['id' => $other, 'name' => 'solar PANELS'])['_code'] === 409, 'folder rename onto a sibling name is 409');
$l = call($eng, 'folder', 'list');
chk($l['_code'] === 200 && fid($l, 'Inverters') === $other && fid($l, 'Other') === 0, 'list shows the rename');
chk(isset($l['folders'][0]['parent_id']) || array_key_exists('parent_id', $l['folders'][0] ?? []), 'folders carry parent_id');

/* upload / replace */
$pdf1 = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n" . str_repeat('A', 100);
$pdf2 = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n" . str_repeat('B', 400);
$u1 = upload($sales, 'datasheet.pdf', $pdf1, $wp);
chk($u1['_code'] === 200 && ($u1['replaced'] ?? null) === false && ($u1['id'] ?? 0) > 0, 'upload into 550 Wp');
$f1 = (int)$u1['id'];
$l = call($sales, 'folder', 'list');
$it = null; foreach ($l['items'] as $x) if ((int)$x['id'] === $f1) $it = $x;
chk($it && (int)$it['folder_id'] === $wp && $it['file_name'] === 'datasheet.pdf' && $it['title'] === 'datasheet' && (int)$it['size'] === strlen($pdf1), 'listed with folder_id, title and size');
$u2 = upload($sales, 'DataSheet.pdf', $pdf2, $wp);
chk($u2['_code'] === 200 && ($u2['replaced'] ?? null) === true, 'same name (any case) in the same folder replaces');
$l = call($sales, 'folder', 'list');
$inWp = array_values(array_filter($l['items'], fn($x) => (int)$x['folder_id'] === $wp));
chk(count($inWp) === 1 && (int)$inWp[0]['size'] === strlen($pdf2), 'one file left in the folder with the new size');
$tr = call($admin, 'trash', 'list');
$hit = array_filter($tr['rows'] ?? [], fn($t) => $t['kind'] === 'Datasheet' && strpos($t['label'], 'replaced by a new version') !== false);
chk(count($hit) === 1, 'the old version is in the Recycle bin');
chk(upload($sales, 'x.pdf', $pdf1, 99999)['_code'] === 404, 'upload to an unknown folder is 404');
$top = upload($sales, 'loose.pdf', $pdf1, 0);
chk($top['_code'] === 200, 'upload at the top level'); $loose = (int)$top['id'];
chk(call($sales, 'folder', 'list')['items'] !== null && array_values(array_filter(call($sales, 'folder', 'list')['items'], fn($x) => (int)$x['id'] === $loose))[0]['folder_id'] === null, 'top-level file has folder_id null');
chk(upload($acc, 'nope.pdf', $pdf1, $wp)['_code'] === 403, 'accounts (read only) cannot upload');

/* rename file */
$fid2 = (int)$u2['id'];
chk(call($sales, 'folder', 'rename', ['id' => $fid2, 'name' => 'ReNew 550 datasheet'])['_code'] === 200, 'file rename');
$l = call($sales, 'folder', 'list');
$it = array_values(array_filter($l['items'], fn($x) => (int)$x['id'] === $fid2))[0];
chk($it['file_name'] === 'ReNew 550 datasheet.pdf' && $it['title'] === 'ReNew 550 datasheet', 'extension added, title without extension');
$u3 = upload($sales, 'second.pdf', $pdf1, $wp); $f3 = (int)$u3['id'];
$rr = call($sales, 'folder', 'rename', ['id' => $f3, 'name' => 'renew 550 DATASHEET.pdf']);
chk($rr['_code'] === 409 && ($rr['error'] ?? '') === 'A file with this name is already here', 'rename onto an existing name is 409');

/* move */
chk(call($sales, 'folder', 'move', ['files' => [], 'folders' => [$renew], 'to' => $wp])['_code'] === 400, 'folder into its own sub-tree is 400');
chk(call($sales, 'folder', 'move', ['files' => [], 'folders' => [$renew], 'to' => $renew])['_code'] === 400, 'folder into itself is 400');
chk(call($sales, 'folder', 'move', ['files' => [$f3], 'folders' => [], 'to' => null])['_code'] === 200, 'move a file to the top level');
$l = call($sales, 'folder', 'list');
$it = array_values(array_filter($l['items'], fn($x) => (int)$x['id'] === $f3))[0];
chk($it['folder_id'] === null, 'moved file has folder_id null');
$c1 = upload($sales, 'clash.pdf', $pdf1, 0); $c1id = (int)$c1['id'];
$c2 = upload($sales, 'clash.pdf', $pdf2, $wp); $c2id = (int)$c2['id'];
$mv = call($sales, 'folder', 'move', ['files' => [$c1id, $f3], 'folders' => [], 'to' => $wp]);
chk($mv['_code'] === 409 && strpos($mv['error'] ?? '', 'clash.pdf') !== false, 'move with a name clash is 409 and names the file');
$l = call($sales, 'folder', 'list');
$byId = []; foreach ($l['items'] as $x) $byId[(int)$x['id']] = $x;
chk($byId[$c1id]['folder_id'] === null && $byId[$f3]['folder_id'] === null, 'nothing moved when refused');
$fc = call($sales, 'folder', 'folder_new', ['parent_id' => null, 'name' => 'Clashy']); $clashy = (int)$fc['id'];
call($sales, 'folder', 'folder_new', ['parent_id' => $sp, 'name' => 'Clashy']);
$mv = call($sales, 'folder', 'move', ['files' => [], 'folders' => [$clashy], 'to' => $sp]);
chk($mv['_code'] === 409 && strpos($mv['error'] ?? '', 'Clashy') !== false, 'folder name clash in the target is 409');
call($sales, 'folder', 'delete', ['files' => [$c1id, $c2id], 'folders' => [$clashy]]);

/* ZIP */
$zres = raw($eng, 'folder', 'zip', "&files=$loose&folders=$sp");
chk($zres[0] === 200 && strpos($zres[2]['content-type'] ?? '', 'application/zip') === 0, 'zip downloads as application/zip');
chk((int)($zres[2]['content-length'] ?? -1) === strlen($zres[1]), 'content-length matches the streamed bytes');
$z = zip_read($zres[1]);
chk(is_array($z), 'zip parses: stored entries, CRCs and offsets are right');
$entry = 'Solar panels/ReNew/550 Wp/ReNew 550 datasheet.pdf';
chk(isset($z[$entry]) && isset($z['loose.pdf']), 'zip has the nested path and the loose file at the root');
$got = raw($eng, 'folder', 'get', "&id=$fid2&dl=1");
chk(($z[$entry] ?? null) === $got[1] && $got[1] === $pdf2, 'extracted entry equals folder/get bytes');
$one = raw($eng, 'folder', 'zip', "&folders=$sp");
chk(strpos($one[2]['content-disposition'] ?? '', 'Solar panels.zip') !== false, 'single folder zip is named after the folder');
$many = raw($eng, 'folder', 'zip', "&files=$loose");
chk(strpos($many[2]['content-disposition'] ?? '', 'Files ' . date('Y-m-d') . '.zip') !== false, 'other zips are named Files <date>.zip');
chk(raw($eng, 'folder', 'zip', '')[0] === 404, 'zip with nothing selected is 404');
chk(raw($eng, 'folder', 'zip', '&files=99999')[0] === 404, 'zip of unknown files is 404');
chk(raw($anon, 'folder', 'zip', "&files=$loose")[0] === 401, 'anonymous zip is 401');
chk(raw($ba, 'folder', 'zip', "&files=$loose")[0] === 403, 'BA zip is 403');
$dup = upload($sales, 'loose.pdf', $pdf2, $sp); /* same name as the loose file, but inside the folder */
$zd = zip_read(raw($eng, 'folder', 'zip', "&files=$loose," . (int)$dup['id'])[1]);
chk(isset($zd['loose.pdf']) && isset($zd['loose (2).pdf']), 'a repeated path gets (2) before the extension');

/* delete a single file, then its folder: restore order */
$sf = call($sales, 'folder', 'folder_new', ['parent_id' => $other, 'name' => 'Pair']); $pair = (int)$sf['id'];
$pf = upload($sales, 'pair.pdf', $pdf1, $pair); $pfid = (int)$pf['id'];
chk(call($sales, 'folder', 'delete', ['files' => [$pfid], 'folders' => []])['_code'] === 200, 'delete a single file');
chk(call($sales, 'folder', 'delete', ['files' => [], 'folders' => [$pair]])['_code'] === 200, 'delete its (now empty) folder');
$tr = call($admin, 'trash', 'list')['rows'];
$tFile = 0; $tFolder = 0;
foreach ($tr as $t) { if ($t['kind'] === 'Datasheet' && $t['label'] === 'pair') $tFile = (int)$t['id']; if ($t['kind'] === 'Folder' && $t['label'] === 'Inverters / Pair') $tFolder = (int)$t['id']; }
chk($tFile > 0 && $tFolder > 0, 'both are in the Recycle bin (folder labelled with its path)');
$rs = call($admin, 'trash', 'restore', ['id' => $tFile]);
chk($rs['_code'] === 400 && strpos($rs['error'] ?? '', 'the folder "Pair"') !== false, 'restoring the file first asks for its folder');
chk(call($admin, 'trash', 'restore', ['id' => $tFolder])['_code'] === 200, 'restore the folder');
chk(call($admin, 'trash', 'restore', ['id' => $tFile])['_code'] === 200, 'then the file');
$l = call($sales, 'folder', 'list');
chk(fid($l, 'Pair') === $pair && in_array('pair.pdf', names($l)), 'folder and file are back');
call($sales, 'folder', 'delete', ['files' => [], 'folders' => [$pair]]);

/* delete the whole tree and restore */
$cnt = fn($l) => count($l['folders']);
$before = call($sales, 'folder', 'list');
$tr0 = count(call($admin, 'trash', 'list')['rows']);
chk(call($sales, 'folder', 'delete', ['files' => [], 'folders' => [$sp]])['_code'] === 200, 'delete folder Solar panels');
$l = call($sales, 'folder', 'list');
chk(fid($l, 'Solar panels') === 0 && fid($l, 'ReNew') === 0 && fid($l, '550 Wp') === 0 && !in_array('ReNew 550 datasheet.pdf', names($l)) && in_array('loose.pdf', names($l)), 'sub-folders and their files are gone; the loose top-level file stays');
$tr = call($admin, 'trash', 'list')['rows'];
$entries = array_values(array_filter($tr, fn($t) => $t['kind'] === 'Folder' && $t['label'] === 'Solar panels'));
chk(count($tr) === $tr0 + 1 && count($entries) === 1, 'one Recycle bin entry for the whole tree');
chk(call($admin, 'trash', 'restore', ['id' => (int)$entries[0]['id']])['_code'] === 200, 'restore it');
$l = call($sales, 'folder', 'list');
chk(fid($l, 'Solar panels') === $sp && fid($l, 'ReNew') === $renew && fid($l, '550 Wp') === $wp && in_array('ReNew 550 datasheet.pdf', names($l)), 'folders and files are all back');
$g = raw($sales, 'folder', 'get', "&id=$fid2&dl=1");
chk($g[0] === 200 && $g[1] === $pdf2, 'the restored file downloads again');

/* mixed delete: a folder and a file inside it in one request is one entry, no error */
$mx = call($sales, 'folder', 'folder_new', ['parent_id' => null, 'name' => 'Mixed']); $mxid = (int)$mx['id'];
$mf = upload($sales, 'm.pdf', $pdf1, $mxid);
$tr0 = count(call($admin, 'trash', 'list')['rows']);
chk(call($sales, 'folder', 'delete', ['files' => [(int)$mf['id']], 'folders' => [$mxid]])['_code'] === 200, 'delete a folder and a file inside it together');
chk(count(call($admin, 'trash', 'list')['rows']) === $tr0 + 1, 'that is one Recycle bin entry');

/* migration */
if ($dbPath !== '') {
  $pdo = new PDO('sqlite:' . $dbPath); $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("INSERT INTO datasheets(category,title,file_name,path,size,token,folder_id) VALUES('Solar Panel','Legacy panel','legacy.pdf','ds-legacy.pdf',10,'" . bin2hex(random_bytes(12)) . "',NULL)");
  $pdo->exec("INSERT INTO datasheets(category,title,file_name,path,size,token,folder_id) VALUES('','Legacy plain','legacy2.pdf','ds-legacy2.pdf',10,'" . bin2hex(random_bytes(12)) . "',NULL)");
  $pdo->exec('PRAGMA user_version=40'); $pdo = null;
  $l = call($admin, 'folder', 'list');
  $oldId = fid($l, 'Old uploads'); $catId = 0; foreach ($l['folders'] as $f) if ($f['name'] === 'Solar Panel' && (int)$f['parent_id'] === $oldId) $catId = (int)$f['id'];
  $by = []; foreach ($l['items'] as $x) $by[$x['file_name']] = $x;
  chk($oldId > 0 && $catId > 0 && (int)$by['legacy.pdf']['folder_id'] === $catId, 'migration: category file lands in Old uploads / Solar Panel');
  chk((int)$by['legacy2.pdf']['folder_id'] === $oldId, 'migration: file with no category lands in Old uploads');
  $pdo = new PDO('sqlite:' . $dbPath); $pdo->exec("INSERT INTO datasheets(category,title,file_name,path,size,token,folder_id) VALUES('Solar Panel','Legacy again','legacy3.pdf','ds-legacy3.pdf',10,'" . bin2hex(random_bytes(12)) . "',NULL)");
  $pdo->exec('PRAGMA user_version=40'); $pdo = null;
  $l = call($admin, 'folder', 'list');
  $n1 = count(array_filter($l['folders'], fn($f) => $f['name'] === 'Old uploads' && $f['parent_id'] === null));
  $n2 = count(array_filter($l['folders'], fn($f) => $f['name'] === 'Solar Panel'));
  $by = []; foreach ($l['items'] as $x) $by[$x['file_name']] = $x;
  chk($n1 === 1 && $n2 === 1 && (int)$by['legacy3.pdf']['folder_id'] === $catId, 'migration run again: still one Old uploads and one Solar Panel folder');
  chk((int)$by['ReNew 550 datasheet.pdf']['folder_id'] === $wp, 'migration never touches files already in a folder');
}

/* permissions */
chk(call($acc, 'folder', 'list')['_code'] === 200, 'accounts can read');
chk(call($acc, 'folder', 'folder_new', ['parent_id' => null, 'name' => 'Nope'])['_code'] === 403, 'accounts cannot create a folder');
chk(call($acc, 'folder', 'delete', ['files' => [$loose], 'folders' => []])['_code'] === 403, 'accounts cannot delete');
chk(call($acc, 'folder', 'move', ['files' => [$loose], 'folders' => [], 'to' => null])['_code'] === 403, 'accounts cannot move');
chk(call($acc, 'folder', 'rename', ['id' => $loose, 'name' => 'x'])['_code'] === 403, 'accounts cannot rename');
chk(call($ba, 'folder', 'list')['_code'] === 403, 'BA list is 403');
chk(call($ba, 'folder', 'folder_new', ['parent_id' => null, 'name' => 'Nope'])['_code'] === 403, 'BA folder_new is 403');
chk(call($anon, 'folder', 'list')['_code'] === 401, 'anonymous list is 401');
chk(call($sales, 'folder', 'save', ['id' => 1])['_code'] === 404 && call($sales, 'folder', 'toggle', ['id' => 1])['_code'] === 404, 'save and toggle are gone');
$au = call($admin, 'admin', 'audit');
chk(strpos(json_encode($au), 'ds_folder') !== false, 'folder changes are in the audit log');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
