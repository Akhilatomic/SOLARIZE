<?php
// A new customer starts with the approved quotation and the total plant cost; the cost and payments show to the admin only (api/onboard.php).
// Usage: php tests/onboard_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
require_once __DIR__ . '/_onboard.php';
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/objar_' . $name . '_' . getmypid() . '.txt']; }
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
$PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
function pdfFile($content = null, $name = 'approved.pdf') { global $PDF; $p = sys_get_temp_dir() . '/ob_' . bin2hex(random_bytes(5)) . '.pdf'; file_put_contents($p, $content ?? $PDF); return new CURLFile($p, 'application/pdf', $name); }

echo "New customer: approved quotation and total plant cost\n";
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC); $db->exec('PRAGMA busy_timeout=5000');
$one = fn($sql, $a = []) => (function () use ($db, $sql, $a) { $s = $db->prepare($sql); $s->execute($a); return $s->fetchColumn(); })();
$rowOf = fn($sql, $a = []) => (function () use ($db, $sql, $a) { $s = $db->prepare($sql); $s->execute($a); return $s->fetch() ?: []; })();
$user = function ($name, $un, $role) use ($admin, $pw) { call($admin, 'admin', 'user_save', ['name' => $name, 'username' => $un, 'role' => $role, 'active' => 1, 'can_claim' => 1, 'password' => $pw]); $a = actor($un); call($a, 'auth', 'login', ['username' => $un, 'password' => $pw]); return $a; };
$sales = $user('Onb Seller', 'onbsales', 'sales'); $ba = $user('Onb Partner', 'onbba', 'ba'); $acct = $user('Onb Accounts', 'onbacct', 'accounts');
$nCust = fn() => (int)$one('SELECT COUNT(*) FROM customers');

/* 1. staff cannot add a customer without the papers */
$n0 = $nCust();
$r = call($sales, 'customers', 'save', ['name' => 'Onb No Papers', 'phone' => '9000000301', 'lead_type' => 'own']);
chk($r['_code'] === 400 && strpos($r['error'] ?? '', 'approved quotation') !== false && strpos($r['error'], 'Reload') !== false, 'the old way of adding (no papers) is refused with a "reload" message');
$r = call($sales, 'customers', 'save', ['name' => 'Onb No File', 'phone' => '9000000302', 'lead_type' => 'own', 'plant_cost' => 250000], '', false);
chk($r['_code'] === 400 && $r['error'] === 'Upload the approved quotation', 'plant cost without the quotation: refused');
$r = call($sales, 'customers', 'save', ['name' => 'Onb No Cost', 'phone' => '9000000303', 'lead_type' => 'own', 'quote' => pdfFile()], '', true);
chk($r['_code'] === 400 && $r['error'] === 'Enter the total plant cost', 'quotation without the plant cost: refused');
$r = call($sales, 'customers', 'save', ['name' => 'Onb Zero', 'phone' => '9000000304', 'lead_type' => 'own', 'plant_cost' => '0', 'quote' => pdfFile()], '', true);
chk($r['_code'] === 400 && $r['error'] === 'Enter the total plant cost', 'a plant cost of 0 is refused');
$r = call($sales, 'customers', 'save', ['name' => 'Onb Bad File', 'phone' => '9000000305', 'lead_type' => 'own', 'plant_cost' => '250000', 'quote' => pdfFile('not a pdf at all')], '', true);
chk($r['_code'] === 400, 'a quotation that is not a real PDF or picture is refused');
$r = call($sales, 'customers', 'save', ['name' => 'Onb Code File', 'phone' => '9000000306', 'lead_type' => 'own', 'plant_cost' => '250000', 'quote' => pdfFile($PDF . "<?php echo 1; ?>")], '', true);
chk($r['_code'] === 400, 'a quotation file carrying code is refused');
$r = call($sales, 'customers', 'save', ['name' => '', 'phone' => '9000000307', 'lead_type' => 'own', 'plant_cost' => '250000', 'quote' => pdfFile()], '', true);
chk($r['_code'] === 400, 'the other checks still run (name required)');
chk($nCust() === $n0, 'none of the refused tries made a customer');

/* 2. with the papers: the customer, the kept quotation and the cost */
$r = call($sales, 'customers', 'save', ['name' => 'Onb With Papers', 'phone' => '9000000311', 'lead_type' => 'own', 'address' => '4 Test Road', 'plant_cost' => '2,50,000', 'quote' => pdfFile(null, 'Quote 0042 signed.pdf')], '', true);
$c1 = (int)($r['id'] ?? 0);
chk($r['_code'] === 200 && $c1 > 0, 'a seller adds a customer with the approved quotation and plant cost');
$cu = $rowOf('SELECT * FROM customers WHERE id=?', [$c1]);
chk(($cu['name'] ?? '') === 'Onb With Papers' && ($cu['address'] ?? '') === '4 Test Road' && ($cu['lead_type'] ?? '') === 'own' && (int)$cu['owner_id'] > 0, 'the customer fields are saved as before (name, address, lead type, owner)');
$f = $rowOf("SELECT * FROM files WHERE customer_id=? AND kind='approved'", [$c1]);
chk(($f['item'] ?? '') === 'Approved quotation' && ($f['name'] ?? '') === 'Quote 0042 signed.pdf' && (string)($f['life'] ?? 'x') === '0' && is_file(dirname($dbPath) . '/uploads/' . $f['path']), 'the quotation is on the Documents page, kept until deleted');
$cc = $rowOf('SELECT * FROM cust_cost WHERE customer_id=?', [$c1]);
chk((float)($cc['plant_cost'] ?? 0) === 250000.0 && (int)$cc['kseb_extra'] === 0 && (float)$cc['kseb_extra_amt'] === 0.0, 'the plant cost is stored (₹2,50,000 typed with commas), KSEB charges included');
$r = call($sales, 'customers', 'save', ['name' => 'Onb Kseb Extra', 'phone' => '9000000312', 'lead_type' => 'office', 'plant_cost' => '310000', 'kseb_extra' => '1', 'kseb_extra_amt' => '3540', 'quote' => pdfFile()], '', true);
$c2 = (int)($r['id'] ?? 0); $cc = $rowOf('SELECT * FROM cust_cost WHERE customer_id=?', [$c2]);
chk($c2 && (int)$cc['kseb_extra'] === 1 && (float)$cc['kseb_extra_amt'] === 3540.0, 'KSEB charges paid on top are noted with their amount');
$g = call($sales, 'customers', 'get', null, '&id=' . $c1);
chk($g['_code'] === 200 && !array_key_exists('plant_cost', $g) && !array_key_exists('kseb_extra', $g), 'the customer record itself carries no plant cost');
chk(in_array('Approved quotation', array_column($g['files'] ?? [], 'item'), true), 'staff see the approved quotation among the documents');

/* 3. the admin's bulk tools still add customers without the papers; with them the admin's entry is kept too */
$r = call($admin, 'customers', 'save', ['name' => 'Onb Imported', 'phone' => '9000000321']);
$c3 = (int)($r['id'] ?? 0);
chk($r['_code'] === 200 && $c3 && !$one('SELECT COUNT(*) FROM cust_cost WHERE customer_id=?', [$c3]), 'an admin can add a customer without the papers (import, CSV)');
$r = onb($admin, 'customers', 'save', ['name' => 'Onb Admin Full', 'phone' => '9000000322', 'lead_type' => 'own'], 180000);
chk($r['_code'] === 200 && (float)$one('SELECT plant_cost FROM cust_cost WHERE customer_id=?', [(int)$r['id']]) === 180000.0, 'an admin adding with the papers has them kept');

/* 4. converting a lead */
$lead = fn($name, $phone) => (int)(call($sales, 'leads', 'save', ['name' => $name, 'phone' => $phone, 'lead_type' => 'own', 'status' => 'Contacted'])['id'] ?? 0);
$l1 = $lead('Onb Lead One', '9000000331'); $l2 = $lead('Onb Lead Two', '9000000332'); $l3 = $lead('Onb Lead Three', '9000000333');
$n0 = $nCust();
$r = call($sales, 'leads', 'convert', ['id' => $l1]);
chk($r['_code'] === 400 && strpos($r['error'] ?? '', 'approved quotation') !== false && $nCust() === $n0 && !$one('SELECT customer_id FROM leads WHERE id=?', [$l1]), 'converting a lead without the papers is refused and the lead stays a lead');
$r = onb($sales, 'leads', 'convert', ['id' => $l1], 275000, ['kseb_extra' => '1']);
$c4 = (int)($r['customer_id'] ?? 0); $cc = $rowOf('SELECT * FROM cust_cost WHERE customer_id=?', [$c4]);
chk($r['_code'] === 200 && $c4 && (float)$cc['plant_cost'] === 275000.0 && (int)$cc['kseb_extra'] === 1 && (float)$cc['kseb_extra_amt'] === 0.0, 'a lead converts with the papers (KSEB charges additional, amount not known yet)');
chk($one('SELECT status FROM leads WHERE id=?', [$l1]) === 'Won' && (int)$one("SELECT COUNT(*) FROM files WHERE customer_id=? AND kind='approved'", [$c4]) === 1, 'the lead is Won and the quotation is with the new customer');
$r = onb($sales, 'leads', 'convert', ['id' => $l1], 999);
chk(($r['customer_id'] ?? 0) == $c4 && (float)$one('SELECT plant_cost FROM cust_cost WHERE customer_id=?', [$c4]) === 275000.0 && (int)$one("SELECT COUNT(*) FROM files WHERE customer_id=? AND kind='approved'", [$c4]) === 1, 'converting the same lead again changes nothing');
$r = call($sales, 'pipeline', 'start', ['lead_id' => $l2, 'kw' => 3]);
chk($r['_code'] === 400 && !$one('SELECT customer_id FROM leads WHERE id=?', [$l2]), 'starting a project straight from a lead needs the papers too');
$r = onb($sales, 'pipeline', 'start', ['lead_id' => $l2, 'kw' => 3], 195000);
$p2 = (int)($r['id'] ?? 0); $c5 = (int)($r['customer_id'] ?? 0);
chk($r['_code'] === 200 && $p2 && (float)$one('SELECT cost FROM projects WHERE id=?', [$p2]) === 195000.0, 'with them, the new project takes the agreed plant cost');

/* 5. a project started later takes the agreed cost unless a value is typed */
$r = call($admin, 'projects', 'save', ['customer_id' => $c1, 'title' => '5 kW rooftop solar', 'kw' => 5]);
$p1 = (int)($r['id'] ?? 0);
chk($p1 && (float)$one('SELECT cost FROM projects WHERE id=?', [$p1]) === 250000.0, 'a new project with no value takes the agreed plant cost');
$r = call($admin, 'projects', 'save', ['customer_id' => $c2, 'title' => '6 kW rooftop solar', 'kw' => 6, 'cost' => 333000]);
chk((float)$one('SELECT cost FROM projects WHERE id=?', [(int)$r['id']]) === 333000.0, 'a typed project value is kept');
$r = call($admin, 'projects', 'save', ['customer_id' => $c3, 'title' => '3 kW rooftop solar', 'kw' => 3]);
chk((float)$one('SELECT cost FROM projects WHERE id=?', [(int)$r['id']]) === 0.0, 'a customer without an agreed cost: the project value stays empty');

/* 6. Overview › Plant cost and payments: admin only */
foreach ([['seller', $sales], ['accounts role', $acct]] as [$who, $a]) chk(call($a, 'profile', 'cost_get', null, '&customer_id=' . $c1)['_code'] === 403, "$who cannot open the plant cost summary");
chk(call($sales, 'profile', 'cost_save', ['customer_id' => $c1, 'plant_cost' => 1])['_code'] === 403 && (float)$one('SELECT plant_cost FROM cust_cost WHERE customer_id=?', [$c1]) === 250000.0, 'nor change it');
call($admin, 'payments', 'save', ['project_id' => $p1, 'date' => '2026-11-01', 'amount' => 100000, 'mode' => 'Cash', 'note' => 'advance']);
call($admin, 'payments', 'save', ['project_id' => $p1, 'date' => '2026-11-08', 'amount' => 50000, 'mode' => 'UPI', 'ref_no' => 'UTR123TEST']);
$s = call($admin, 'profile', 'cost_get', null, '&customer_id=' . $c1);
chk($s['_code'] === 200 && $s['cost'] == 250000 && $s['agreed'] == 250000 && $s['from_project'] === 1 && $s['kseb_extra'] === 0, 'admin: total plant cost and KSEB note');
chk(count($s['projects']) === 1 && count($s['projects'][0]['payments']) === 2 && $s['paid'] == 150000 && $s['balance'] == 100000, 'admin: two part payments, received ₹1,50,000, balance ₹1,00,000');
$pm = $s['projects'][0]['payments'];
chk($pm[0]['date'] === '2026-11-01' && $pm[0]['mode'] === 'Cash' && $pm[1]['ref_no'] === 'UTR123TEST' && $pm[1]['src'] === 'customer', 'admin: each payment with its date, mode, reference and who paid');
chk(($s['quote']['name'] ?? '') === 'Quote 0042 signed.pdf' && (int)$s['quote']['id'] > 0, 'admin: the approved quotation is linked');
$s = call($admin, 'profile', 'cost_get', null, '&customer_id=' . $c4);
chk($s['cost'] == 275000 && $s['from_project'] === 0 && $s['projects'] === [] && $s['paid'] == 0 && $s['balance'] == 275000 && $s['kseb_extra'] === 1, 'no project yet: the agreed cost, nothing received');
$s = call($admin, 'profile', 'cost_get', null, '&customer_id=' . $c3);
chk($s['cost'] == 0 && $s['quote'] === null, 'a customer added without the papers: empty summary');
chk(call($admin, 'profile', 'cost_get', null, '&customer_id=999999')['_code'] === 404, 'unknown customer: not found');

/* 7. the admin corrects the cost */
$s = call($admin, 'profile', 'cost_save', ['customer_id' => $c1, 'plant_cost' => '2,60,000', 'kseb_extra' => 1, 'kseb_extra_amt' => 4130]);
chk($s['_code'] === 200 && $s['cost'] == 260000 && $s['kseb_extra'] === 1 && $s['kseb_extra_amt'] == 4130 && $s['balance'] == 110000, 'admin changes the plant cost and notes the KSEB charges');
chk((float)$one('SELECT cost FROM projects WHERE id=?', [$p1]) === 260000.0, 'the customer\'s one project follows, so Accounts agree');
chk(call($admin, 'profile', 'cost_save', ['customer_id' => $c1, 'plant_cost' => 0])['_code'] === 400, 'a plant cost of 0 is refused');
$s = call($admin, 'profile', 'cost_save', ['customer_id' => $c3, 'plant_cost' => 150000, 'kseb_extra' => 0]);
chk($s['_code'] === 200 && $s['agreed'] == 150000, 'admin enters the cost for a customer added without it');

/* 8. the approved quotation as a document */
$fid = (int)$one("SELECT id FROM files WHERE customer_id=? AND kind='approved'", [$c1]);
chk(call($sales, 'files', 'delete', ['id' => $fid])['_code'] === 403 && (bool)$one('SELECT 1 FROM files WHERE id=?', [$fid]), 'staff cannot delete the approved quotation');
$r = call($sales, 'files', 'upload', ['customer_id' => $c1, 'kind' => 'approved', 'file' => pdfFile()], '', true);
chk($r['_code'] === 403 && (int)$one("SELECT COUNT(*) FROM files WHERE customer_id=? AND kind='approved'", [$c1]) === 1, 'nor add another one');
$r = call($admin, 'files', 'upload', ['customer_id' => $c1, 'kind' => 'approved', 'item' => 'something else', 'file' => pdfFile(null, 'Revised quote.pdf')], '', true);
$nf = $rowOf('SELECT * FROM files WHERE id=?', [(int)($r['id'] ?? 0)]);
chk($r['_code'] === 200 && $nf['item'] === 'Approved quotation' && (string)$nf['life'] === '0', 'an admin adds a revised one, kept until deleted');
chk(call($admin, 'profile', 'cost_get', null, '&customer_id=' . $c1)['quote']['name'] === 'Revised quote.pdf', 'the summary shows the latest one');
$db->prepare("UPDATE files SET created=datetime('now','-900 days') WHERE id=?")->execute([$fid]);
$db->exec("INSERT OR REPLACE INTO settings(k,v) VALUES('hk_last','0')"); call($admin, 'customers', 'get', null, '&id=' . $c1);
chk((bool)$one('SELECT 1 FROM files WHERE id=?', [$fid]), 'however old, it is not moved to the Recycle bin');
chk(call($admin, 'files', 'delete', ['id' => $fid])['_code'] === 200, 'an admin can delete it');

/* 9. Business Associate */
$r = onb($ba, 'customers', 'save', ['name' => 'Onb BA Customer', 'phone' => '9000000341'], 220000);
$cb = (int)($r['id'] ?? 0);
chk($r['_code'] === 200 && $cb && (float)$one('SELECT plant_cost FROM cust_cost WHERE customer_id=?', [$cb]) === 220000.0, 'a Business Associate adds a customer with the papers');
chk(call($ba, 'customers', 'save', ['name' => 'Onb BA No Papers', 'phone' => '9000000342'])['_code'] === 400, 'and not without them');
$r = call($ba, 'files', 'upload', ['customer_id' => $c1, 'kind' => 'doc', 'item' => 'Test', 'file' => pdfFile()], '', true);
chk($r['_code'] === 404, 'a Business Associate cannot upload a file to someone else\'s customer (form fields are checked like JSON)');
chk(call($ba, 'profile', 'cost_get', null, '&customer_id=' . $cb)['_code'] === 403 && in_array(call($ba, 'profile', 'cost_get', null, '&customer_id=' . $c1)['_code'], [403, 404], true), 'nor open the plant cost summary, even of their own customer');

/* 10. the cost leaves with the customer */
call($admin, 'customers', 'delete', ['id' => $c2]);
chk(!$one('SELECT COUNT(*) FROM cust_cost WHERE customer_id=?', [$c2]) && (bool)$one("SELECT 1 FROM trash WHERE data LIKE '%cust_cost%' ORDER BY id DESC LIMIT 1"), 'deleting a customer removes the cost and keeps it in the Recycle bin snapshot');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
