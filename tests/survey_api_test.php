<?php
// Site survey: add from a lead / customer, designated surveyor, photos, products, plan, done; who sees what.
// Usage: php tests/survey_api_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/svjar_' . $name . '_' . getmypid() . '.txt']; }
function call($who, $m, $a, $body = null, $qs = '', $raw = false) {
  global $base;
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs"); $h = ['X-Solarize: 1'];
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar']]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POST, true); if ($raw) curl_setopt($ch, CURLOPT_POSTFIELDS, $body); else { $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); } }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); $type = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt];
  $j['_code'] = $code; $j['_type'] = $type; return $j;
}
echo "Site survey\n";
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$admin = actor('admin'); $eng = actor('eng'); $sal = actor('sal'); $ba = actor('ba'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$mk = fn($n, $u, $role) => (int)(call($admin, 'admin', 'user_save', ['name' => $n, 'username' => $u, 'role' => $role, 'active' => 1, 'can_claim' => 1, 'password' => $pw])['id'] ?? 0);
$eid = $mk('Evan Engineer', 'sveng', 'engineer'); $sid = $mk('Sara Seller', 'svsal', 'sales'); $bid = $mk('Bala Partner', 'svba', 'ba');
chk(call($eng, 'auth', 'login', ['username' => 'sveng', 'password' => $pw])['_code'] === 200 && call($sal, 'auth', 'login', ['username' => 'svsal', 'password' => $pw])['_code'] === 200 && call($ba, 'auth', 'login', ['username' => 'svba', 'password' => $pw])['_code'] === 200, 'engineer, sales and BA signed in');
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$db->exec('PRAGMA busy_timeout=5000');
$adminId = (int)$db->query("SELECT id FROM users WHERE username='boss'")->fetch()['id'];
$db->exec("INSERT INTO leads(name,phone,address,city,status,site) VALUES('Survey Lead Test','9000000011','Hill Road','Testville','New','{\"roof_type\":\"RCC flat\"}')"); $lid = (int)$db->lastInsertId();
$db->exec("INSERT INTO customers(name,phone,address,district) VALUES('Survey Customer Test','9000000012','Lake View','Testpuram')"); $cid = (int)$db->lastInsertId();

/* add */
$b = call($sal, 'survey', 'boot');
chk($b['_code'] === 200 && (int)$b['default_user'] === $adminId && !in_array($bid, array_column($b['users'], 'id')), 'popup: default surveyor is the admin; BAs are not offered');
$r = call($sal, 'survey', 'add', ['lead_id' => $lid]); $s1 = (int)($r['id'] ?? 0);
chk($r['_code'] === 200 && !empty($r['new']) && (int)$db->query("SELECT assigned_to FROM surveys WHERE id=$s1")->fetch()['assigned_to'] === $adminId, 'lead added to site survey, given to the admin by default');
chk((int)$db->query("SELECT COUNT(*) c FROM notifs WHERE kind='survey' AND user_id=$adminId AND lead_id=$lid")->fetch()['c'] === 1, 'the surveyor gets a bell message');
$r = call($sal, 'survey', 'add', ['lead_id' => $lid, 'assigned_to' => $eid, 'visit_date' => '2026-12-01', 'note' => 'Call before coming']);
chk($r['_code'] === 200 && empty($r['new']) && (int)$r['id'] === $s1 && (int)$db->query("SELECT assigned_to FROM surveys WHERE id=$s1")->fetch()['assigned_to'] === $eid, 'adding again does not make a second survey; it is handed to the chosen person');
$r = call($admin, 'survey', 'add', ['customer_id' => $cid, 'assigned_to' => $eid]); $s2 = (int)($r['id'] ?? 0);
chk($r['_code'] === 200 && $s2 > 0 && $s2 !== $s1, 'customer added to site survey');
chk(call($sal, 'survey', 'add', ['lead_id' => $lid, 'assigned_to' => $bid])['_code'] !== 200, 'a BA cannot be the surveyor');
chk(call($ba, 'survey', 'list')['_code'] === 403 && call($ba, 'survey', 'add', ['lead_id' => $lid])['_code'] === 403, 'BA has no site survey');

/* who sees what */
$ids = array_map('intval', array_column(call($admin, 'survey', 'list')['rows'], 'id')); chk(in_array($s1, $ids) && in_array($s2, $ids), 'admin sees every survey');
chk(array_column(call($eng, 'survey', 'list')['rows'], 'id') == [$s1, $s2] || array_column(call($eng, 'survey', 'list')['rows'], 'id') == [$s2, $s1], 'the surveyor sees the surveys given to them');
chk(array_map('intval', array_column(call($sal, 'survey', 'list')['rows'], 'id')) === [$s1], 'sales sees only the survey they added');
chk(call($sal, 'survey', 'get', null, "&id=$s2")['_code'] === 403, 'and cannot open someone else’s');

/* fill in */
$g = call($eng, 'survey', 'get', null, "&id=$s1");
chk($g['_code'] === 200 && $g['target']['kind'] === 'lead' && ($g['site']['roof_type'] ?? '') === 'RCC flat' && $g['survey']['status'] === 'To visit', 'survey page loads with the lead’s own site details');
$r = call($eng, 'survey', 'save', ['id' => $s1, 'site' => ['roof_type' => 'RCC flat', 'free_area' => '650', 'junk' => 'x'], 'plant' => ['capacity' => '5', 'panel_make' => 'Test Panel 550', 'panel_count' => '9', 'structure_type' => 'Hot Dip Galvanized', 'structure_material' => 'HDG 2 m'], 'confirmed' => 1, 'plan' => ['plan_panels' => '9', 'plan_rows' => '5 + 4']]);
chk($r['_code'] === 200 && $r['status'] === 'In progress', 'saving starts the survey (In progress)');
$l = $db->query("SELECT site, plant FROM leads WHERE id=$lid")->fetch(); $ls = json_decode($l['site'], true); $lp = json_decode($l['plant'], true);
chk(($ls['free_area'] ?? '') === '650' && !isset($ls['junk']) && ($lp['panel_make'] ?? '') === 'Test Panel 550' && ($lp['structure_type'] ?? '') === 'Hot Dip Galvanized', 'site details and products are written to the lead (unknown fields dropped)');
$g = call($eng, 'survey', 'get', null, "&id=$s1");
chk((int)$g['survey']['confirmed'] === 1 && $g['survey']['confirmed_by'] === 'Evan Engineer' && ($g['plan']['plan_rows'] ?? '') === '5 + 4' && ($g['plant']['structure_material'] ?? '') === 'HDG 2 m', 'confirmation (who, when), plan fields and structure material are kept');

/* photos */
$png = sys_get_temp_dir() . '/sv_' . getmypid() . '.png';
file_put_contents($png, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
$up = fn($who, $sv, $slot) => call($who, 'survey', 'upload', ['id' => $sv, 'slot' => $slot, 'file' => new CURLFile($png, 'image/png', 'roof one.png')], '', true);
$r = $up($eng, $s1, 'roof'); $f1 = (int)($r['id'] ?? 0);
chk($r['_code'] === 200 && $f1 > 0, 'roof-top photo uploaded');
chk($up($eng, $s1, 'inverter')['_code'] === 200 && $up($eng, $s1, 'earth')['_code'] === 200 && $up($eng, $s1, 'plan')['_code'] === 200, 'inverter, earth and site plan uploaded');
chk($up($eng, $s1, 'kitchen')['_code'] !== 200, 'unknown photo place refused');
chk($up($sal, $s2, 'roof')['_code'] === 403, 'no upload to a survey that is not yours');
$txt = sys_get_temp_dir() . '/sv_' . getmypid() . '.txt'; file_put_contents($txt, 'not a picture');
chk(call($eng, 'survey', 'upload', ['id' => $s1, 'slot' => 'roof', 'file' => new CURLFile($txt, 'image/png', 'fake.png')], '', true)['_code'] !== 200, 'a file that is not an image is refused');
$img = call($eng, 'survey', 'img', null, "&id=$f1");
chk($img['_code'] === 200 && str_starts_with($img['_type'], 'image/png'), 'photo is served as an image');
chk(call($sal, 'survey', 'img', null, "&id=" . (int)$db->query("SELECT id FROM survey_files WHERE survey_id=$s1 LIMIT 1")->fetch()['id'])['_code'] === 200, 'the person who added the survey can see its photos');
chk(count(call($eng, 'survey', 'get', null, "&id=$s1")['files']) === 4, 'four files listed on the survey');
$n = (int)$db->query('SELECT COUNT(*) c FROM trash')->fetch()['c'];
chk(call($eng, 'survey', 'file_del', ['id' => $f1])['_code'] === 200 && (int)$db->query('SELECT COUNT(*) c FROM trash')->fetch()['c'] === $n + 1 && count(call($eng, 'survey', 'get', null, "&id=$s1")['files']) === 3, 'deleting a photo sends it to the Recycle bin');

/* hand over, done, reopen, remove */
chk(call($eng, 'survey', 'save', ['id' => $s2, 'assigned_to' => $sid])['_code'] === 403, 'the surveyor cannot hand a survey on (manager or the person who added it can)');
chk(call($admin, 'survey', 'save', ['id' => $s2, 'assigned_to' => $sid])['_code'] === 200 && call($sal, 'survey', 'get', null, "&id=$s2")['_code'] === 200, 'admin hands it to sales, who can now open it');
$r = call($eng, 'survey', 'save', ['id' => $s1, 'status' => 'Done']);
chk($r['_code'] === 200 && $r['status'] === 'Done' && (int)$db->query("SELECT COUNT(*) c FROM notifs WHERE kind='survey' AND user_id=$sid AND text LIKE 'Site survey done%'")->fetch()['c'] === 1, 'marked done; the person who added it is told');
chk(call($eng, 'survey', 'save', ['id' => $s1, 'plan' => ['plan_panels' => '12']])['_code'] !== 200, 'a done survey cannot be changed');
chk(call($eng, 'survey', 'save', ['id' => $s1, 'status' => 'In progress'])['_code'] === 200 && call($eng, 'survey', 'save', ['id' => $s1, 'plan' => ['plan_panels' => '12']])['_code'] === 200, 'until it is reopened');
chk(call($eng, 'survey', 'delete', ['id' => $s1])['_code'] === 403, 'the surveyor cannot remove a survey');
chk(call($sal, 'survey', 'delete', ['id' => $s1])['_code'] === 200 && !$db->query("SELECT 1 FROM surveys WHERE id=$s1")->fetch() && !$db->query("SELECT 1 FROM survey_files WHERE survey_id=$s1")->fetch(), 'the person who added it removes it (Recycle bin)');

/* pipeline → site survey */
$db->exec("DELETE FROM surveys"); $db->exec("DELETE FROM notifs WHERE kind='survey'");
$db->exec("INSERT INTO customers(name,phone,address,district) VALUES('Pipeline Customer Test','9000000013','Canal Road','Testpuram')"); $c2 = (int)$db->lastInsertId();
$r = call($sal, 'pipeline', 'start', ['customer_id' => $c2, 'kw' => 5]); $p1 = (int)($r['id'] ?? 0);
$sv = $db->query("SELECT * FROM surveys WHERE customer_id=$c2")->fetchAll();
chk($r['_code'] === 200 && count($sv) === 1 && (int)$sv[0]['assigned_to'] === $adminId && $sv[0]['status'] === 'To visit', 'customer put on the pipeline is added to site survey by itself, given to the admin');
chk((int)$db->query("SELECT COUNT(*) c FROM notifs WHERE kind='survey' AND user_id=$adminId AND customer_id=$c2")->fetch()['c'] === 1, 'the admin gets a bell message');
call($sal, 'pipeline', 'start', ['customer_id' => $c2, 'kw' => 3]);
chk((int)$db->query("SELECT COUNT(*) c FROM surveys WHERE customer_id=$c2")->fetch()['c'] === 1, 'a second project does not make a second survey');
$pg = call($admin, 'projects', 'get', null, "&id=$p1");
chk(($pg['survey']['status'] ?? '') === 'To visit' && (int)$pg['survey']['id'] === (int)$sv[0]['id'], 'the project page shows the site survey status');
$sg = call($admin, 'survey', 'get', null, '&id=' . (int)$sv[0]['id']);
chk(($sg['project']['stage'] ?? '') === 'Customer', 'the survey page shows the pipeline stage');
chk((call($admin, 'survey', 'list')['rows'][0]['stage'] ?? '') === 'Customer', 'and so does the survey list');
/* a survey started on the lead is kept when that lead becomes a customer on the pipeline */
$db->exec("INSERT INTO customers(name,phone) VALUES('Converted Lead Test','9000000014')"); $c3 = (int)$db->lastInsertId();
$db->exec("INSERT INTO leads(name,phone,status,customer_id) VALUES('Converted Lead Test','9000000014','Won',$c3)"); $l3 = (int)$db->lastInsertId();
$db->exec("INSERT INTO surveys(lead_id,assigned_to,status,created_by) VALUES($l3,$eid,'In progress',$adminId)");
call($admin, 'pipeline', 'start', ['customer_id' => $c3, 'kw' => 4]);
chk((int)$db->query("SELECT COUNT(*) c FROM surveys WHERE customer_id=$c3 OR lead_id=$l3")->fetch()['c'] === 1, 'a survey started on the lead is reused, not duplicated');
$db->exec("DELETE FROM projects WHERE customer_id IN ($c2,$c3)"); $db->exec("DELETE FROM customers WHERE id IN ($c2,$c3)"); $db->exec("DELETE FROM leads WHERE id=$l3");

$db->exec("DELETE FROM surveys"); $db->exec("DELETE FROM survey_files"); $db->exec("DELETE FROM notifs WHERE kind='survey'"); $db->exec("DELETE FROM leads WHERE id=$lid"); $db->exec("DELETE FROM customers WHERE id=$cid");
@unlink($png); @unlink($txt);
echo "  $pass passed, $fail failed\n"; exit($fail ? 1 : 0);
