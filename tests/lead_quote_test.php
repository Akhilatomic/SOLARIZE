<?php
// Lead quotations (owner's rule 2026-11-20): Leads list carries q_ids; a lead's quotation goes to the Recycle bin 90 days after its last
// save unless the lead became a customer; a converted lead's quotation copy in Documents is kept 200 days.
// Usage: php tests/lead_quote_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/'); $dbf = $argv[2] ?? '';
require_once __DIR__ . '/_onboard.php';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function call($who, $m, $a, $body = null, $qs = '', $multipart = false) {
  global $base;
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs"); $h = ['X-Solarize: 1'];
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar']]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POST, true); if ($multipart) curl_setopt($ch, CURLOPT_POSTFIELDS, $body); else { $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); } }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt]; $j['_code'] = $code; return $j;
}
function pdf() { $p = sys_get_temp_dir() . '/lq_' . bin2hex(random_bytes(5)) . '.pdf'; file_put_contents($p, "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"); return new CURLFile($p, 'application/pdf', 'quotation.pdf'); }
$db = $dbf ? new PDO('sqlite:' . $dbf) : null;
function upkeep() { global $db, $admin; $db->exec("UPDATE settings SET v='0' WHERE k='hk_last'"); call($admin, 'dashboard', ''); }

echo "Lead quotations\n";
$admin = ['jar' => sys_get_temp_dir() . '/lqjar_' . getmypid() . '.txt']; $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$pid = (int)(call($admin, 'qm', 'product_save', ['cat' => 'panels', 'name' => 'LQ panel 550 Wp', 'wp' => 550, 'qty' => 4])['id'] ?? 0);
$doc = fn($name) => ['items' => ['panels' => [['pid' => $pid, 'qty' => 4, 'qty_note' => '', 'over' => new stdClass()]]], 'price' => 180000, 'subsidy' => null, 'loan' => false, 'title' => '', 'project' => '', 'kseb' => null, 'pay' => null, 'terms' => null,
  'template_id' => 1, 'customer' => ['name' => $name, 'address' => '', 'consumer_no' => '', 'email' => '', 'mobile' => '9000000901'], 'number' => '', 'date' => date('Y-m-d'), 'valid_days' => 5, 'sales' => ['name' => 'Boss'],
  'snap' => ['panels' => [['name' => 'LQ panel 550 Wp', 'line' => '', 'details' => '', 'qty' => 4, 'wp' => 550]]]];

$l1 = (int)(call($admin, 'leads', 'save', ['name' => 'Lead Quote One', 'phone' => '9000000901'])['id'] ?? 0);
$l2 = (int)(call($admin, 'leads', 'save', ['name' => 'Lead Quote Two', 'phone' => '9000000902'])['id'] ?? 0);
chk($l1 && $l2, 'two leads');
$q1 = (int)(call($admin, 'qm', 'save', ['lead_id' => $l1, 'status' => 'Sent', 'subsidy' => 78000, 'doc' => $doc('Lead Quote One')])['id'] ?? 0);
$q1b = (int)(call($admin, 'qm', 'save', ['lead_id' => $l1, 'status' => 'Sent', 'subsidy' => 78000, 'doc' => $doc('Lead Quote One')])['id'] ?? 0);
$q2 = (int)(call($admin, 'qm', 'save', ['lead_id' => $l2, 'status' => 'Sent', 'subsidy' => 78000, 'doc' => $doc('Lead Quote Two')])['id'] ?? 0);
chk($q1 && $q1b && $q2, 'quotations saved for the leads');
$byId = []; foreach (call($admin, 'leads', 'list') as $x) if (is_array($x) && isset($x['id'])) $byId[(int)$x['id']] = $x;
chk(($byId[$l1]['q_ids'] ?? '') === "$q1b,$q1", 'Leads list gives the lead\'s quotations, newest first');
chk(($byId[$l2]['q_ids'] ?? '') === (string)$q2, 'one quotation for the other lead');

// 90 days: an old quotation of an open lead goes to the Recycle bin; a fresh one stays
$db->exec("UPDATE quotes SET updated=datetime('now','-91 days'), created=datetime('now','-91 days') WHERE id=$q1");
$db->exec("UPDATE quotes SET updated=datetime('now','-89 days') WHERE id=$q1b");
upkeep();
chk(!$db->query("SELECT 1 FROM quotes WHERE id=$q1")->fetch(), 'quotation 91 days after its last save is removed');
chk((bool)$db->query("SELECT 1 FROM quotes WHERE id=$q1b")->fetch(), 'quotation saved 89 days ago stays');
chk((int)$db->query("SELECT COUNT(*) FROM trash WHERE kind='Quotation' AND label LIKE '%Lead Quote One%'")->fetchColumn() === 1, 'it is in the Recycle bin');

// conversion: the quotation belongs to the customer and is never removed by the 90-day rule; its Documents copy is kept 200 days
$cv = onb($admin, 'leads', 'convert', ['id' => $l2]);
$cid = (int)($cv['customer_id'] ?? 0);
chk($cid > 0, 'lead converted');
chk((int)$db->query("SELECT customer_id FROM quotes WHERE id=$q2")->fetchColumn() === $cid, 'the quotation moved to the customer');
$k = call($admin, 'files', 'keep', ['title' => 'Quotation', 'file' => pdf()], "&customer_id=$cid&gen=quote:$q2", true);
chk(($k['life'] ?? null) === 200, 'Documents copy of a converted lead\'s quotation is kept 200 days');
$qc = (int)(call($admin, 'qm', 'save', ['customer_id' => $cid, 'status' => 'Sent', 'subsidy' => 78000, 'doc' => $doc('Lead Quote Two')])['id'] ?? 0);
$k2 = call($admin, 'files', 'keep', ['title' => 'Quotation', 'file' => pdf()], "&customer_id=$cid&gen=quote:$qc", true);
chk(isset($k2['life']) && $k2['life'] !== 200, 'a quotation made for the customer keeps the usual time (' . ($k2['life'] ?? '?') . ' days)');
$db->exec("UPDATE quotes SET updated=datetime('now','-120 days') WHERE id=$q2");
upkeep();
chk((bool)$db->query("SELECT 1 FROM quotes WHERE id=$q2")->fetch(), 'a converted lead\'s quotation is not removed after 90 days');

echo "  $pass passed, $fail failed\n";
exit($fail ? 1 : 0);
