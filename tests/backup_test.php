<?php
// Data & backup: a full backup (database, optionally with every stored file) and restoring from it (api/backup.php).
// Usage: php tests/backup_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/bkjar_' . $name . '_' . getmypid() . '.txt']; }
function call($who, $m, $a, $body = null, $qs = '', $multipart = false, $raw = false) {
  global $base;
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs");
  $h = ['X-Solarize: 1'];
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar']]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POST, true);
    if ($multipart) curl_setopt($ch, CURLOPT_POSTFIELDS, $body); else { $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); } }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  if ($raw) return ['_code' => $code, '_text' => (string)$txt];
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt];
  $j['_code'] = $code; return $j;
}
$PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
function tmp($content, $ext = 'pdf') { $p = sys_get_temp_dir() . '/bk_' . bin2hex(random_bytes(5)) . '.' . $ext; file_put_contents($p, $content); return $p; }
function pdfFile($name = 'paper.pdf') { global $PDF; return new CURLFile(tmp($PDF . '% ' . bin2hex(random_bytes(6)) . "\n"), 'application/pdf', $name); }
/* a small reader and writer of ZIP files (stored entries), to look inside a backup and to make odd ones */
function zipNames($bin) { $p = strrpos($bin, "PK\x05\x06"); if ($p === false) return null; $e = unpack('vd/vc/vn/vtotal/Vsize/Voff', substr($bin, $p + 4, 16)); $o = $e['off']; $out = [];
  for ($i = 0; $i < $e['total']; $i++) { $h = unpack('vv/vn/vf/vm/Vdt/Vcrc/Vcs/Vs/vnl/vel/vcl/vd/vi/Ve/Vo', substr($bin, $o + 4, 42)); $n = substr($bin, $o + 46, $h['nl']); $l = unpack('vnl/vel', substr($bin, $h['o'] + 26, 4));
    $out[$n] = substr($bin, $h['o'] + 30 + $l['nl'] + $l['el'], $h['cs']); $o += 46 + $h['nl'] + $h['el'] + $h['cl']; } return $out; }
function zipMake($entries) { $out = ''; $cd = ''; foreach ($entries as $n => $data) { $crc = crc32($data); $len = strlen($data); $off = strlen($out);
    $out .= pack('VvvvVVVVvv', 0x04034b50, 20, 0x0800, 0, 0, $crc, $len, $len, strlen($n), 0) . $n . $data;
    $cd .= pack('VvvvvVVVVvvvvvVV', 0x02014b50, 20, 20, 0x0800, 0, 0, $crc, $len, $len, strlen($n), 0, 0, 0, 0, 0, $off) . $n; }
  return $out . $cd . pack('VvvvvVVv', 0x06054b50, 0, 0, count($entries), count($entries), strlen($cd), strlen($out), 0); }

echo "Backup with files, and restoring from it\n";
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$up = dirname($dbPath) . '/uploads';
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC); $db->exec('PRAGMA busy_timeout=8000');
$one = fn($sql, $a = []) => (function () use ($db, $sql, $a) { $s = $db->prepare($sql); $s->execute($a); return $s->fetchColumn(); })();
$rowOf = fn($sql, $a = []) => (function () use ($db, $sql, $a) { $s = $db->prepare($sql); $s->execute($a); return $s->fetch() ?: []; })();
$upload = function ($cid, $item, $kind = 'doc') use ($admin) { return (int)(call($admin, 'files', 'upload', ['customer_id' => $cid, 'kind' => $kind, 'item' => $item, 'file' => pdfFile("$item.pdf")], '', true)['id'] ?? 0); };
$gone = function ($table, $id) use ($db, $rowOf, $up) { $r = $rowOf("SELECT path FROM $table WHERE id=?", [$id]); @unlink("$up/" . $r['path']); $db->prepare("DELETE FROM $table WHERE id=?")->execute([$id]); return $r['path']; }; /* deleted for good, as after the Recycle bin's time */

/* --- what is there before the backup --- */
$cA = (int)(call($admin, 'customers', 'save', ['name' => 'Backup Customer A', 'phone' => '9000000701'])['id'] ?? 0);
$cB = (int)(call($admin, 'customers', 'save', ['name' => 'Backup Customer B', 'phone' => '9000000702'])['id'] ?? 0);
$d1 = $upload($cA, 'Aadhaar card'); $d2 = $upload($cA, 'Electricity bill'); $d3 = $upload($cA, 'PAN card'); $d4 = $upload($cB, 'Passbook');
call($admin, 'files', 'keep', ['title' => 'Tax invoice 1', 'file' => pdfFile('tax.pdf')], '&customer_id=' . $cA . '&gen=tax', true);
$kept = (int)$one("SELECT id FROM files WHERE customer_id=? AND gen='tax'", [$cA]);
$fold = (int)(call($admin, 'folder', 'folder_new', ['name' => 'Backup test folder ' . bin2hex(random_bytes(3))])['id'] ?? 0);
$sub = (int)(call($admin, 'folder', 'folder_new', ['name' => 'Inner', 'parent_id' => $fold])['id'] ?? 0);
$s1 = (int)(call($admin, 'folder', 'upload', ['folder_id' => $sub, 'file' => pdfFile('Inverter datasheet.pdf')], '', true)['id'] ?? 0);
$s2 = (int)(call($admin, 'folder', 'upload', ['folder_id' => $fold, 'file' => pdfFile('Panel datasheet.pdf')], '', true)['id'] ?? 0);
chk($cA && $d1 && $d2 && $d3 && $d4 && $kept && $fold && $sub && $s1 && $s2, 'a customer with documents and a Folder with files are in place');

/* --- 1. the backup --- */
$info = call($admin, 'reset', 'backup_info');
chk($info['_code'] === 200 && $info['files'] >= 7 && $info['bytes'] > 0 && $info['upload_limit'] > 0, 'backup info: how many files, how big, and the upload limit');
$z0 = call($admin, 'reset', 'backup_zip', null, '', false, true); $n0 = zipNames($z0['_text']);
chk($z0['_code'] === 200 && is_array($n0) && isset($n0['solarize-backup.json'], $n0['crm.sqlite']) && count($n0) === 2 && strpos($n0['crm.sqlite'], 'SQLite format 3') === 0, 'database-only ZIP: the note and a readable database, nothing else');
$zf = call($admin, 'reset', 'backup_zip', null, '&files=1', false, true); $nf = zipNames($zf['_text']); $note = json_decode($nf['solarize-backup.json'] ?? '', true);
$paths = fn($ids, $t = 'files') => array_map(fn($i) => $one("SELECT path FROM $t WHERE id=?", [$i]), $ids);
$all = array_merge($paths([$d1, $d2, $d3, $d4, $kept]), $paths([$s1, $s2], 'datasheets'));
chk($zf['_code'] === 200 && !array_filter($all, fn($p) => !isset($nf["uploads/$p"])) && ($note['kind'] ?? '') === 'solarize-backup' && !empty($note['with_files']) && $note['files'] >= 7, 'full ZIP: every stored file is in it, and the note says so');
chk($nf['uploads/' . $all[0]] === file_get_contents("$up/{$all[0]}"), 'a file in the backup is the same as on the server');
chk(!array_filter(array_keys($nf), fn($n) => preg_match('/mail\.key|error\.log|backups\//', $n)), 'the email key, the error log and other backups are not in it');
$zipPath = tmp($zf['_text'], 'zip'); $sqlitePath = tmp(call($admin, 'admin', 'backup', null, '', false, true)['_text'], 'sqlite');
call($admin, 'admin', 'user_save', ['name' => 'Bk Seller', 'username' => 'bksales', 'role' => 'sales', 'active' => 1, 'can_claim' => 1, 'password' => $pw]);
$sales = actor('sales'); call($sales, 'auth', 'login', ['username' => 'bksales', 'password' => $pw]);
chk(call($sales, 'reset', 'backup_zip', null, '&files=1', false, true)['_code'] === 403 && call($sales, 'reset', 'backup_info')['_code'] === 403 && call($sales, 'reset', 'restore_run', ['token' => 'x', 'mode' => 'missing'])['_code'] === 403, 'only an admin can take or restore a backup');

/* --- 2. things go missing after the backup --- */
$p1 = $gone('files', $d1);                                   /* a document deleted for good */
$p4 = $gone('files', $d4); call($admin, 'customers', 'delete', ['id' => $cB]); /* a document whose customer is deleted too */
$p2 = $one('SELECT path FROM files WHERE id=?', [$d2]); unlink("$up/$p2");     /* still listed, the file lost from the server */
call($admin, 'files', 'keep', ['title' => 'Tax invoice 1 (again)', 'file' => pdfFile('tax2.pdf')], '&customer_id=' . $cA . '&gen=tax', true); /* a paper made again: the old copy was replaced */
$q1 = $gone('datasheets', $s1); $db->prepare('DELETE FROM ds_folders WHERE id=?')->execute([$sub]); /* a Folder file and its folder */
$nNew = (int)(call($admin, 'customers', 'save', ['name' => 'Added After Backup', 'phone' => '9000000703'])['id'] ?? 0);
$dNew = $upload($cA, 'Passbook');

/* --- 3. look at the backup --- */
$ck = call($admin, 'reset', 'restore_check', ['file' => new CURLFile($zipPath, 'application/zip', 'solarize-backup.zip')], '', true);
chk($ck['_code'] === 200 && preg_match('/^[0-9a-f]{24}$/', $ck['token'] ?? '') && $ck['with_files'] === true && $ck['files'] >= 7 && ($ck['made'] ?? '') !== '', 'the uploaded backup is read: when it was made and that it has the files');
chk($ck['docs'] === 1 && ($ck['docs_list'][0]['name'] ?? '') === 'Aadhaar card' && ($ck['docs_list'][0]['owner'] ?? '') === 'Backup Customer A', 'one document can be brought back, named with its customer');
chk($ck['docs_skip']['owner'] === 1 && $ck['docs_skip']['replaced'] === 1, 'left out: the document of a deleted customer, and the paper that was made again since');
chk($ck['sheets'] === 1 && ($ck['sheets_list'][0]['name'] ?? '') === 'Inverter datasheet.pdf' && $ck['lost'] === 1, 'one Folder file is missing and one listed file is lost from the server');
$cust = array_values(array_filter($ck['counts'], fn($c) => $c[0] === 'Customers'))[0];
chk($cust[2] === (int)$one('SELECT COUNT(*) FROM customers'), 'the summary compares the backup with the CRM now');

/* --- 4. bring back what is missing --- */
$before = [(int)$one('SELECT COUNT(*) FROM customers'), (int)$one('SELECT COUNT(*) FROM files'), $one('SELECT name FROM customers WHERE id=?', [$cA])];
$rr = call($admin, 'reset', 'restore_run', ['token' => $ck['token'], 'mode' => 'missing']);
chk($rr['_code'] === 200 && $rr['docs'] === 1 && $rr['sheets'] === 1 && $rr['lost'] === 1 && $rr['failed'] === 0, 'restore: 1 document, 1 Folder file and 1 lost file brought back');
$f1 = $rowOf('SELECT * FROM files WHERE id=?', [$d1]);
chk(($f1['item'] ?? '') === 'Aadhaar card' && (int)$f1['customer_id'] === $cA && $f1['path'] === $p1 && is_file("$up/$p1") && strpos(file_get_contents("$up/$p1"), '%PDF-') === 0, 'the document is back on the customer with its file');
chk(is_file("$up/$p2") && file_get_contents("$up/$p2") === $nf["uploads/$p2"], 'the lost file is back, byte for byte');
$sh = $rowOf('SELECT * FROM datasheets WHERE id=?', [$s1]);
chk(($sh['file_name'] ?? '') === 'Inverter datasheet.pdf' && (int)$sh['folder_id'] === $sub && is_file("$up/$q1") && (int)$one('SELECT parent_id FROM ds_folders WHERE id=?', [$sub]) === $fold, 'the Folder file is back inside its folder, which came back too');
chk(!$one('SELECT 1 FROM files WHERE id=?', [$d4]) && !is_file("$up/$p4") && (int)$one("SELECT COUNT(*) FROM files WHERE customer_id=? AND gen='tax'", [$cA]) === 1, 'the deleted customer\'s document and the replaced paper stay away');
chk((int)$one('SELECT COUNT(*) FROM customers') === $before[0] && (int)$one('SELECT COUNT(*) FROM files') === $before[1] + 1 && (bool)$one('SELECT 1 FROM customers WHERE id=?', [$nNew]) && (bool)$one('SELECT 1 FROM files WHERE id=?', [$dNew]), 'nothing else changed: what was added after the backup is still there');
chk((bool)$one("SELECT 1 FROM audit_log WHERE action='restore' AND detail LIKE '%1 document(s)%'"), 'the restore is in the audit log');
$ck2 = call($admin, 'reset', 'restore_check', ['file' => new CURLFile($zipPath, 'application/zip', 'solarize-backup.zip')], '', true);
chk($ck2['docs'] === 0 && $ck2['sheets'] === 0 && $ck2['lost'] === 0, 'checked again, nothing is missing any more');
chk(call($admin, 'reset', 'restore_run', ['token' => $ck['token'], 'mode' => 'missing'])['_code'] === 410, 'a backup that was restored is cleared from the server');

/* --- 5. a database-only backup cannot bring back a file that is gone --- */
$gone('files', $d3);
$ck3 = call($admin, 'reset', 'restore_check', ['file' => new CURLFile($sqlitePath, 'application/octet-stream', 'solarize-backup.sqlite')], '', true);
chk($ck3['_code'] === 200 && $ck3['with_files'] === false && $ck3['docs'] === 0 && $ck3['docs_skip']['nofile'] === 1, 'database-only backup: the document is known but its file is not in it');
$ck4 = call($admin, 'reset', 'restore_check', ['file' => new CURLFile($zipPath, 'application/zip', 'b.zip')], '', true);
chk($ck4['docs'] === 1 && call($admin, 'reset', 'restore_run', ['token' => $ck4['token'], 'mode' => 'missing'])['docs'] === 1 && (bool)$one('SELECT 1 FROM files WHERE id=?', [$d3]), 'the full backup brings it back');

/* --- 6. files that are not backups, or carry something odd --- */
$bad = fn($content, $name) => call($admin, 'reset', 'restore_check', ['file' => new CURLFile(tmp($content, pathinfo($name, PATHINFO_EXTENSION)), 'application/octet-stream', $name)], '', true);
chk($bad('hello', 'notes.zip')['_code'] === 400 && $bad('hello', 'notes.sqlite')['_code'] === 400 && $bad($PDF, 'paper.pdf')['_code'] === 400, 'a file that is not a backup is refused');
chk($bad(zipMake(['readme.txt' => 'no database here']), 'x.zip')['_code'] === 400, 'a ZIP without the database is refused');
chk($bad(zipMake(['crm.sqlite' => 'not really a database']), 'x.zip')['_code'] === 400, 'a ZIP whose database is not one is refused');
$odd = zipMake(['crm.sqlite' => $nf['crm.sqlite'], 'uploads/../evil.php' => '<?php echo 1;', 'uploads/evil.php' => '<?php echo 1;', "uploads/$p1" => 'OVERWRITE', 'uploads/sneaky.pdf' => $PDF . '<?php system("id"); ?>', 'uploads/fine-extra.pdf' => $PDF, 'public/index.php' => '<?php', '../outside.txt' => 'x']);
$ck5 = $bad($odd, 'odd.zip'); $keep = file_get_contents("$up/$p1");
$r5 = call($admin, 'reset', 'restore_run', ['token' => $ck5['token'] ?? '', 'mode' => 'missing']);
chk($ck5['_code'] === 200 && $r5['_code'] === 200 && !is_file("$up/evil.php") && !is_file(dirname($up) . '/evil.php') && !is_file("$up/sneaky.pdf") && !is_file(dirname($dbPath, 2) . '/uploads/index.php') && !is_file(dirname($dbPath, 2) . '/outside.txt'), 'program files, paths outside the folder and files carrying code are never written');
chk(file_get_contents("$up/$p1") === $keep && !is_file("$up/fine-extra.pdf"), 'an existing file is never overwritten, and a file the CRM does not list is not added');
chk(call($admin, 'reset', 'restore_run', ['token' => 'saved:../../crm.sqlite', 'mode' => 'missing'])['_code'] === 410 && call($admin, 'reset', 'restore_check', ['name' => '../crm.sqlite'])['_code'] === 410, 'a saved-backup name cannot point outside the backups folder');

/* --- 7. put everything back as it was --- */
call($admin, 'customers', 'save', ['id' => $cA, 'name' => 'Renamed After Backup', 'phone' => '9000000701']);
$ck6 = call($admin, 'reset', 'restore_check', ['file' => new CURLFile($zipPath, 'application/zip', 'solarize-backup.zip')], '', true);
chk(call($admin, 'reset', 'restore_run', ['token' => $ck6['token'], 'mode' => 'full', 'password' => 'wrong', 'confirm' => 'RESTORE'])['_code'] === 401 && call($admin, 'reset', 'restore_run', ['token' => $ck6['token'], 'mode' => 'full', 'password' => $pw, 'confirm' => 'yes'])['_code'] === 400, 'a full restore needs the admin password and the word RESTORE');
chk($one('SELECT name FROM customers WHERE id=?', [$cA]) === 'Renamed After Backup', 'a refused full restore changes nothing');
$fr = call($admin, 'reset', 'restore_run', ['token' => $ck6['token'], 'mode' => 'full', 'password' => $pw, 'confirm' => 'RESTORE']);
chk($fr['_code'] === 200 && $fr['mode'] === 'full' && preg_match('/^pre-restore-[\w.-]+\.sqlite$/', $fr['backup'] ?? ''), 'full restore runs and saves the database as it was just before');
chk($one('SELECT name FROM customers WHERE id=?', [$cA]) === 'Backup Customer A' && (bool)$one('SELECT 1 FROM customers WHERE id=?', [$cB]) && !$one('SELECT 1 FROM customers WHERE id=?', [$nNew]) && !$one('SELECT 1 FROM files WHERE id=?', [$dNew]), 'the database is as it was at the backup: the rename is undone, the deleted customer is back, later additions are gone');
chk((bool)$one('SELECT 1 FROM files WHERE id=?', [$d4]) && is_file("$up/$p4"), 'and its files are back on the server');
if (call($admin, 'customers', 'list')['_code'] === 401) call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
$g = call($admin, 'settings', 'get'); $bl = call($admin, 'reset', 'backups');
chk($g['_code'] === 200 && isset($g['rules']) && (int)$one('PRAGMA user_version') >= 48, 'the CRM works after it, updated to the current version');
chk(in_array($fr['backup'], array_column(array_filter($bl, 'is_array'), 'name'), true) && !array_filter(array_column(array_filter($bl, 'is_array'), 'name'), fn($n) => preg_match('/^(restore|snap)-/', $n)), 'the copy from before is among the saved backups; working copies are not listed');
$ck7 = call($admin, 'reset', 'restore_check', ['name' => $fr['backup']]);
chk($ck7['_code'] === 200 && $ck7['token'] === 'saved:' . $fr['backup'] && $ck7['with_files'] === false, 'a saved backup on the server can be picked for a restore');
$cn = array_values(array_filter($ck7['counts'], fn($c) => $c[0] === 'Customers'))[0];
chk($cn[1] >= 2 && $cn[2] >= 2, 'and shows what it holds beside what the CRM holds now');
chk((bool)$one("SELECT 1 FROM audit_log WHERE action='restore' AND detail LIKE 'Everything put back%'"), 'the full restore is in the audit log');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
