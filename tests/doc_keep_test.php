<?php
// Papers the CRM makes for a customer are kept on the Documents page (files/keep): 120 days, tax bills and warranty cards until deleted.
// Usage: php tests/doc_keep_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/dkjar_' . $name . '_' . getmypid() . '.txt']; }
function call($who, $m, $a, $body = null, $qs = '', $multipart = false) {
  global $base;
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs");
  $h = ['X-Solarize: 1'];
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar']]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POST, true);
    if ($multipart) curl_setopt($ch, CURLOPT_POSTFIELDS, $body); else { $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); } }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt];
  $j['_code'] = $code; return $j;
}
/* a small file on disk to post: a real (empty) PDF unless $content says otherwise */
function tmpfile_with($content, $ext = 'pdf') { $p = sys_get_temp_dir() . '/dk_' . bin2hex(random_bytes(5)) . '.' . $ext; file_put_contents($p, $content); return $p; }
$PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
function keep($who, $cid, $gen, $title, $name, $content = null) { global $PDF;
  $p = tmpfile_with($content ?? $PDF . '% ' . bin2hex(random_bytes(4)) . "\n");
  $r = call($who, 'files', 'keep', ['title' => $title, 'file' => new CURLFile($p, 'application/pdf', $name)], '&customer_id=' . $cid . '&gen=' . rawurlencode($gen), true);
  @unlink($p); return $r; }

echo "Documents: papers made for a customer are kept automatically\n";
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); } /* the first request makes the database */
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC); $db->exec('PRAGMA busy_timeout=5000');
$cols = array_column($db->query('PRAGMA table_info(files)')->fetchAll(), 'name');
chk(in_array('life', $cols) && in_array('gen', $cols), 'files has the life and gen columns');

$cid = (int)(call($admin, 'customers', 'save', ['name' => 'Keep Test One', 'phone' => '9000000081'])['id'] ?? 0);
$cid2 = (int)(call($admin, 'customers', 'save', ['name' => 'Keep Test Two', 'phone' => '9000000082'])['id'] ?? 0);
$files = fn($c) => call($admin, 'customers', 'get', null, '&id=' . $c)['files'] ?? [];
$byGen = function ($c, $gen) use ($files) { return array_values(array_filter($files($c), fn($f) => ($f['gen'] ?? '') === $gen)); };

/* 1. kept with the right keeping time */
$r = keep($admin, $cid, 'kseb:wcr', 'Work Completion Report', 'Work Completion Report - Keep Test One.pdf');
$f = $byGen($cid, 'kseb:wcr');
chk($r['_code'] === 200 && ($r['life'] ?? null) === 200 && count($f) === 1, 'a KSEB paper is kept on the customer (200 days)');
chk(($f[0]['item'] ?? '') === 'Work Completion Report' && ($f[0]['name'] ?? '') === 'Work Completion Report - Keep Test One.pdf' && ($f[0]['kind'] ?? '') === 'gen' && (int)$f[0]['life'] === 200, 'title, file name, kind and 200 days are stored');
$g = call($admin, 'files', 'get', null, '&id=' . $f[0]['id']);
chk($g['_code'] === 200 && strpos($g['_text'] ?? '', '%PDF-') === 0, 'the kept copy opens as a PDF');
foreach ([['bank:bfr', 120], ['quote:17', 120], ['receipt:5', 120], ['tax', 0], ['warranty', 0]] as [$gen, $life]) {
  $r = keep($admin, $cid, $gen, 'Paper ' . $gen, 'paper.pdf'); $f = $byGen($cid, $gen);
  chk($r['_code'] === 200 && ($r['life'] ?? null) === $life && count($f) === 1 && (int)$f[0]['life'] === $life, "$gen is kept " . ($life ? "$life days" : 'until deleted'));
}

/* 2. one copy per paper: the newer takes the place of the older; other papers and other customers are not touched */
$n0 = count($files($cid)); $old = $byGen($cid, 'kseb:wcr')[0];
$oldPath = $db->query('SELECT path FROM files WHERE id=' . (int)$old['id'])->fetchColumn();
$r = keep($admin, $cid, 'kseb:wcr', 'Work Completion Report', 'Work Completion Report - new.pdf'); $f = $byGen($cid, 'kseb:wcr');
chk($r['_code'] === 200 && count($f) === 1 && (int)$f[0]['id'] !== (int)$old['id'] && $f[0]['name'] === 'Work Completion Report - new.pdf' && count($files($cid)) === $n0, 'a newer copy replaces the older one');
chk(!is_file(dirname($dbPath) . '/uploads/' . $oldPath) && !$db->query("SELECT COUNT(*) FROM trash WHERE data LIKE '%" . $oldPath . "%'")->fetchColumn(), 'the replaced file is removed and does not go to the Recycle bin');
keep($admin, $cid2, 'kseb:wcr', 'Work Completion Report', 'two.pdf'); keep($admin, $cid, 'quote:18', 'Quotation 18', 'q18.pdf');
chk(count($byGen($cid, 'kseb:wcr')) === 1 && count($byGen($cid2, 'kseb:wcr')) === 1 && count($byGen($cid, 'quote:17')) === 1 && count($byGen($cid, 'quote:18')) === 1, 'each customer and each quotation keeps its own copy');

/* 3. what is refused */
chk(keep($admin, $cid, 'party', 'x', 'x.pdf')['_code'] === 400 && keep($admin, $cid, 'kseb:../x', 'x', 'x.pdf')['_code'] === 400 && keep($admin, $cid, '', 'x', 'x.pdf')['_code'] === 400, 'an unknown paper is refused');
chk(keep($admin, 999999, 'tax', 'x', 'x.pdf')['_code'] === 404, 'an unknown customer is refused');
chk(keep($admin, $cid, 'tax', 'x', 'x.pdf', 'just some text, not a PDF')['_code'] === 400, 'a file that is not a PDF is refused');
chk(keep($admin, $cid, 'tax', 'x', 'x.pdf', $PDF . "<?php echo 1; ?>\n")['_code'] === 400, 'a PDF carrying code is refused');
$p = tmpfile_with($PDF, 'pdf'); $r = call($admin, 'files', 'keep', ['file' => new CURLFile($p, 'application/pdf', 'evil.php')], '&customer_id=' . $cid . '&gen=tax', true); @unlink($p);
chk($r['_code'] === 400, 'only a .pdf name is accepted');
$r = keep($admin, $cid, 'kseb:an1', '', 'a/b\\c:d.pdf'); $f = $byGen($cid, 'kseb:an1');
chk($r['_code'] === 200 && $f[0]['item'] === 'Document' && strpbrk($f[0]['name'], '/\\:') === false, 'an empty title and unsafe file name are cleaned');
chk(count($byGen($cid, 'tax')) === 1, 'a refused copy leaves the kept one alone');

/* 4. who may keep a copy: whoever may make the paper */
call($admin, 'admin', 'user_save', ['name' => 'Keep Partner', 'username' => 'keepba', 'role' => 'ba', 'active' => 1, 'password' => $pw]);
$ba = actor('ba'); call($ba, 'auth', 'login', ['username' => 'keepba', 'password' => $pw]);
chk(in_array(keep($ba, $cid, 'kseb:wcr', 'x', 'x.pdf')['_code'], [403, 404], true) && in_array(keep($ba, $cid, 'tax', 'x', 'x.pdf')['_code'], [403, 404], true), 'a Business Associate cannot keep papers on someone else\'s customer');
call($admin, 'admin', 'user_save', ['name' => 'Keep Engineer', 'username' => 'keepeng', 'role' => 'engineer', 'active' => 1, 'password' => $pw]);
$eng = actor('eng'); call($eng, 'auth', 'login', ['username' => 'keepeng', 'password' => $pw]);
$me = call($eng, 'auth', 'status')['user'] ?? [];
$canKseb = in_array('checklist', $me['read'] ?? []) && in_array('customers', $me['read'] ?? []); $noFin = !in_array('finance', $me['read'] ?? []); $noFilesW = !in_array('files', $me['write'] ?? []);
if ($canKseb && $noFin) {
  chk(keep($eng, $cid, 'kseb:req', 'Request Letter', 'req.pdf')['_code'] === 200, 'an engineer keeps a KSEB paper' . ($noFilesW ? ' without Documents edit access' : ''));
  chk(keep($eng, $cid, 'tax', 'x', 'x.pdf')['_code'] === 403, 'but not a tax bill (no Finance access)');
} else echo "  (engineer role is set up differently here; role checks skipped)\n";
$out = actor('out'); chk(keep($out, $cid, 'tax', 'x', 'x.pdf')['_code'] === 401, 'signed out: refused');

/* 5. uploads: a warranty card is kept until deleted, other uploads the usual time */
$up = function ($kind) use ($admin, $cid, $PDF) { $p = tmpfile_with($PDF); $r = call($admin, 'files', 'upload', ['customer_id' => $cid, 'kind' => $kind, 'item' => 'Test', 'file' => new CURLFile($p, 'application/pdf', "up-$kind.pdf")], '', true); @unlink($p); return (int)($r['id'] ?? 0); };
$wId = $up('warranty'); $dId = $up('doc');
$life = fn($id) => $db->query('SELECT life FROM files WHERE id=' . (int)$id)->fetchColumn();
chk($wId && (string)$life($wId) === '0', 'an uploaded warranty card is kept until deleted');
chk($dId && $life($dId) === null, 'another upload keeps the usual 365 days');

/* 6. hourly upkeep: each document goes by its own keeping time */
$age = function ($id, $days) use ($db) { $db->prepare("UPDATE files SET created=datetime('now', ?) WHERE id=?")->execute(['-' . $days . ' days', $id]); };
$id = fn($gen) => (int)$byGen($cid, $gen)[0]['id'];
$kOld = $id('kseb:wcr'); $bFresh = $id('bank:bfr'); $tax = $id('tax'); $war = $id('warranty'); $q17 = $id('quote:17');
$age($kOld, 201); $age($bFresh, 119); $kYoung = $id('kseb:an1'); $age($kYoung, 199); $age($tax, 900); $age($war, 900); $age($q17, 400); $age($wId, 900); $age($dId, 300);
$d2 = $up('doc'); $age($d2, 366);
$db->exec("INSERT OR REPLACE INTO settings(k,v) VALUES('hk_last','0')"); call($admin, 'customers', 'get', null, '&id=' . $cid); /* any signed-in request runs the hourly upkeep */
$has = fn($x) => (bool)$db->query('SELECT 1 FROM files WHERE id=' . (int)$x)->fetchColumn();
chk(!$has($kOld) && !$has($q17), 'a KSEB paper older than 200 days and other made papers older than 120 days leave the Documents page');
chk($has($bFresh), 'a made paper of 119 days stays');
chk($has($kYoung), 'a KSEB paper of 199 days stays (kept 200 days)');
chk($has($tax) && $has($war), 'the tax bill and the warranty certificate stay however old');
chk($has($wId), 'the uploaded warranty card stays however old');
chk($has($dId) && !$has($d2), 'uploads still go by 365 days');
$bin = $db->query("SELECT COUNT(*) FROM trash WHERE kind='Document (expired)' AND deleted_at > datetime('now','-5 minutes')")->fetchColumn();
chk((int)$bin >= 3, 'expired papers wait in the Recycle bin');
chk((bool)$db->query("SELECT 1 FROM trash WHERE kind='Document (expired)' AND label LIKE '%older than 120 days%'")->fetchColumn(), 'the bin says "older than 120 days"');

/* 7. the customer timeline tells made papers from uploads */
$tl = call($admin, 'profile', 'timeline', null, '&customer_id=' . $cid);
$txt = json_encode($tl);
chk(strpos($txt, 'Document generated') !== false && strpos($txt, 'Document uploaded') !== false, 'timeline: "Document generated" and "Document uploaded"');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
