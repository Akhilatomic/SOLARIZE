<?php
// Upload safety check (sec_upload in api/security.php): real code and active PDF content are refused; an ordinary file is not refused
// because a few bytes of its compressed data happen to look like a tag.
// Usage: php tests/upload_scan_test.php http://localhost:8094
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/usjar_' . $name . '_' . getmypid() . '.txt']; }
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
/* the patterns as the server has them, read from the source (the test does not load the app) */
$src = file_get_contents(__DIR__ . '/../api/security.php');
$const = function ($name) use ($src) { return preg_match('/^const ' . $name . " = '(.*)';\\s*$/m", $src, $m) ? $m[1] : ''; };
$CODE = $const('UP_CODE'); $ACTIVE = $const('UP_PDF_ACTIVE');
$OLD_CODE = '/<\?php|<\?=|<script\b|<%@|#!\/(usr|bin)/i'; $OLD_ACTIVE = '#/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA)\b#'; /* before Nov 2026 */

echo "Uploads: the safety check\n";
chk($CODE !== '' && $ACTIVE !== '' && @preg_match($CODE, '') === 0 && @preg_match($ACTIVE, '') === 0, 'the two patterns are read from api/security.php');
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$cid = (int)(call($admin, 'customers', 'save', ['name' => 'Scan Test', 'phone' => '9000000091'])['id'] ?? 0);

$up = function ($content, $name = 'paper.pdf', $mime = 'application/pdf') use ($admin, $cid) {
  $p = sys_get_temp_dir() . '/us_' . bin2hex(random_bytes(5)) . '.bin'; file_put_contents($p, $content);
  $r = call($admin, 'files', 'upload', ['customer_id' => $cid, 'kind' => 'doc', 'item' => 'Scan test', 'file' => new CURLFile($p, $mime, $name)], '', true);
  @unlink($p); return $r; };
$PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\n";
$END = "\ntrailer<</Root 1 0 R>>\n%%EOF\n";
$refused = fn($r) => $r['_code'] === 400 && preg_match('/contains code|contains scripts/', (string)($r['error'] ?? ''));

/* 1. compressed data: bytes that only look like a tag. The same bytes every run (seeded), so the result never changes. */
mt_srand(20261112);
$rnd = function ($n) { $s = ''; for ($i = 0; $i < $n; $i += 2) $s .= pack('v', mt_rand(0, 65535)); return substr($s, 0, $n); };
$files = []; for ($i = 0; $i < 12; $i++) $files[] = $PDF . $rnd(1500000) . $END; /* 1.5 MB each: under the test server's 2 MB upload limit */
$old = 0; $new = 0;
foreach ($files as $f) { if (preg_match($OLD_CODE, $f) || preg_match($OLD_ACTIVE, $f)) $old++; if (preg_match($CODE, $f) || preg_match($ACTIVE, $f)) $new++; }
echo "       (of 12 files of 1.5 MB random bytes the old check refused $old, the new one $new)\n";
chk($old >= 1, 'the old check refused ordinary compressed data by chance');
chk($new === 0, 'the new check refuses none of it');
$okN = 0; foreach (array_slice($files, 0, 4) as $f) if ($up($f)['_code'] === 200) $okN++;
chk($okN === 4, 'four 1.5 MB files of compressed data upload');
$bare = $PDF . $rnd(4000) . "<?=\x00\x01\x02" . $rnd(4000) . "<%@\xff\xfe" . $rnd(4000) . "/JS\x00\x01" . $rnd(3000) . "/JS(\x00\x01\x02\x03" . $rnd(3000) . "/XFA\x00" . $rnd(3000) . "<?=ab\x00" . $END;
chk(!preg_match($CODE, $bare) && !preg_match($ACTIVE, $bare) && preg_match($OLD_CODE, $bare) && preg_match($OLD_ACTIVE, $bare), 'bare "<?=", "<%@", "/JS", "/XFA" inside binary data: old check refuses, new one does not');
chk($up($bare)['_code'] === 200, 'a PDF with those bare bytes uploads');
$PNG = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
chk($up($PNG . $rnd(2000) . "<?=\x00\x01<%@\xff" . $rnd(2000), 'photo.png', 'image/png')['_code'] === 200, 'a picture with those bare bytes uploads');
$p = sys_get_temp_dir() . '/us_keep.bin'; file_put_contents($p, $bare);
$r = call($admin, 'files', 'keep', ['title' => 'Scan', 'file' => new CURLFile($p, 'application/pdf', 'kept.pdf')], '&customer_id=' . $cid . '&gen=kseb:wcr', true); @unlink($p);
chk($r['_code'] === 200, 'a paper kept automatically goes through the same check');

/* 2. real code is still refused, in every kind of file */
$code = [
  'PHP open tag' => "<?php system('id'); ?>",
  'PHP open tag in capitals' => "<?PHP echo 1;",
  'PHP short echo tag' => '<?= $_GET[0] ?>',
  'PHP short echo with a shell command' => '<?=`id`?>',
  'PHP short echo, code on the next lines' => "<?=\n\n  \$a . \$b",
  'HTML script' => '<script>alert(1)</script>',
  'HTML script in capitals with attributes' => '<SCRIPT src="x.js">',
  'JSP page directive' => '<%@ page import="java.io.*" %>',
  'ASP language directive' => '<%@ Language=VBScript %>',
  'shell script line' => "#!/bin/sh\nrm -rf x",
  'interpreter line' => '#!/usr/bin/env python',
];
foreach ($code as $what => $c) {
  chk($refused($up($PDF . $rnd(900) . $c . $rnd(900) . $END)), "$what in a PDF is refused");
}
chk($refused($up($PNG . $rnd(500) . "<?php echo 1; ?>", 'photo.png', 'image/png')), 'a picture carrying PHP is refused');
chk($refused($up($PNG . $rnd(500) . '<?=`$_GET[1]`;', 'photo.png', 'image/png')), 'a picture carrying a PHP short tag with code is refused');

/* 3. active content in a PDF is still refused */
$active = [
  'JavaScript action' => '<< /S /JavaScript /JS (app.alert(1)) >>',
  'script without the word JavaScript (rendition action)' => "<< /S /Rendition /JS (app.alert('x')) >>",
  'script with a space before it' => '/JS  (this.print())',
  'script as hex text' => '/JS <6170702e616c657274283129>',
  'script kept in another object' => '/JS 12 0 R',
  'script in UTF-16' => "/JS (\xfe\xff\x00a\x00p\x00p\x00.",
  'Launch action' => '/OpenAction << /S /Launch /F (cmd.exe) >>',
  'embedded file' => '<< /Type /EmbeddedFile /Length 10 >>',
  'XFA form (list)' => '/XFA [(template) 5 0 R]',
  'XFA form (object)' => '/XFA 7 0 R',
  'rich media' => '/Subtype /RichMedia',
];
foreach ($active as $what => $c) chk($refused($up($PDF . $c . $END)), "$what in a PDF is refused");

/* 4. the other checks are as before */
chk($up('just text', 'x.pdf')['_code'] === 400, 'a file that is not a PDF is refused');
chk($up($PDF . $END, 'x.php')['_code'] === 400 && $up($PDF . $END, 'x.pdf.php')['_code'] === 400 && $up($PDF . $END, 'x.html')['_code'] === 400, 'file names that could run are refused');
chk($up($PDF . $END, 'plain.pdf')['_code'] === 200 && $up($PNG, 'plain.png', 'image/png')['_code'] === 200, 'a plain PDF and a plain picture upload');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
