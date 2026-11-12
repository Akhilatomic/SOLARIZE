<?php
// Settings as the control centre: the rules the CRM works by are settings (and take effect), document types, user controls.
// Usage: php tests/control_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/ctjar_' . $name . '_' . getmypid() . '.txt']; }
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
function pdfFile($name = 'paper.pdf') { global $PDF; $p = sys_get_temp_dir() . '/ct_' . bin2hex(random_bytes(5)) . '.pdf'; file_put_contents($p, $PDF . '% ' . bin2hex(random_bytes(4)) . "\n"); return new CURLFile($p, 'application/pdf', $name); }

echo "Settings: rules, document types, user controls\n";
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC); $db->exec('PRAGMA busy_timeout=5000');
$one = fn($sql, $a = []) => (function () use ($db, $sql, $a) { $s = $db->prepare($sql); $s->execute($a); return $s->fetchColumn(); })();
$upkeep = function () use ($db, $admin) { $db->exec("INSERT OR REPLACE INTO settings(k,v) VALUES('hk_last','0')"); call($admin, 'meta', 'feed'); }; /* any signed-in request runs the hourly upkeep */
$USUAL = ['doc_days' => 365, 'gen_days' => 120, 'trash_hours' => 72, 'lead_lost_hours' => 24, 'lead_remind_min' => 15, 'feas_valid_days' => 30, 'feas_alert_days' => 3];
$save = fn($who, $k, $v) => call($who, 'settings', 'save', ['key' => $k, 'value' => $v]);
$S = fn() => call($admin, 'settings', 'get');

/* 1. the rules are settings */
$db->exec("DELETE FROM settings WHERE k IN ('rules','doc_types')");
$s = $S();
chk(($s['rules'] ?? null) == $USUAL, 'the rules start at their usual values');
chk(isset($s['rule_limits']['doc_days'], $s['rule_names']['lead_lost_hours']) && count($s['rule_limits']) === 7 && is_array($s['kseb_defaults'] ?? null) && ($s['kseb_defaults']['vendor_name'] ?? '') !== '', 'Settings gets the limits, their names and the KSEB paper details');
chk(is_array($s['doc_types'] ?? null) && in_array('Aadhaar card', $s['doc_types'], true), 'and the document types');
$r = $save($admin, 'rules', ['gen_days' => 60, 'doc_days' => 30]);
chk($r['_code'] === 200 && $S()['rules'] == ['doc_days' => 30, 'gen_days' => 60] + $USUAL, 'a saved rule is kept; the others stay as they were');
chk($save($admin, 'rules', ['doc_days' => 5])['_code'] === 400 && $save($admin, 'rules', ['doc_days' => 99999])['_code'] === 400, 'a value outside its limits is refused');
chk($save($admin, 'rules', ['trash_hours' => 'soon'])['_code'] === 400 && $save($admin, 'rules', ['trash_hours' => 2.5])['_code'] === 400 && $save($admin, 'rules', ['trash_hours' => null])['_code'] === 400, 'only whole numbers are taken');
chk($save($admin, 'rules', ['feas_valid_days' => 5, 'feas_alert_days' => 5])['_code'] === 400, 'the feasibility warning must come before it runs out');
chk($S()['rules'] == ['doc_days' => 30, 'gen_days' => 60] + $USUAL, 'a refused save changes nothing');
call($admin, 'admin', 'user_save', ['name' => 'Ctl Seller', 'username' => 'ctlsales', 'role' => 'sales', 'active' => 1, 'can_claim' => 1, 'password' => $pw]);
$sales = actor('sales'); call($sales, 'auth', 'login', ['username' => 'ctlsales', 'password' => $pw]);
chk($save($sales, 'rules', ['doc_days' => 100])['_code'] === 403 && $save($sales, 'doc_types', ['x'])['_code'] === 403, 'only an admin changes rules or document types');
chk((call($sales, 'settings', 'get')['rules']['gen_days'] ?? 0) === 60, 'everyone\'s screens get the rules in force');

/* 2. the rules take effect */
$cid = (int)(call($admin, 'customers', 'save', ['name' => 'Ctl Customer', 'phone' => '9000000501'])['id'] ?? 0);
$r = call($admin, 'files', 'keep', ['title' => 'Work Completion Report', 'file' => pdfFile()], '&customer_id=' . $cid . '&gen=kseb:wcr', true);
chk($r['_code'] === 200 && ($r['life'] ?? 0) === 60, 'a paper made in the CRM is now kept 60 days');
$r = call($admin, 'files', 'keep', ['title' => 'Tax invoice', 'file' => pdfFile()], '&customer_id=' . $cid . '&gen=tax', true);
chk(($r['life'] ?? 1) === 0, 'a tax bill is still kept until deleted');
$up = function ($days) use ($admin, $cid, $db) { $r = call($admin, 'files', 'upload', ['customer_id' => $cid, 'kind' => 'doc', 'item' => 'Test', 'file' => pdfFile()], '', true); $id = (int)($r['id'] ?? 0);
  $db->prepare("UPDATE files SET created=datetime('now', ?) WHERE id=?")->execute(['-' . $days . ' days', $id]); return $id; };
$old = $up(31); $young = $up(29); $upkeep();
chk(!$one('SELECT 1 FROM files WHERE id=?', [$old]) && (bool)$one('SELECT 1 FROM files WHERE id=?', [$young]), 'uploads now leave after 30 days (31 days gone, 29 days stays)');
chk((bool)$one("SELECT 1 FROM trash WHERE kind='Document (expired)' AND label LIKE '%older than 30 days%'"), 'the Recycle bin says "older than 30 days"');
$save($admin, 'rules', ['trash_hours' => 5]);
$t = call($admin, 'trash', 'list');
chk(($t['hours'] ?? 0) === 5 && ($t['doc_days'] ?? 0) === 30 && ($t['gen_days'] ?? 0) === 60, 'the Recycle bin page shows the times in force');
$tid = (int)$one("SELECT id FROM trash WHERE kind='Document (expired)' ORDER BY id DESC LIMIT 1");
$db->prepare("UPDATE trash SET deleted_at=datetime('now','-6 hours') WHERE id=?")->execute([$tid]); $upkeep();
chk(!$one('SELECT 1 FROM trash WHERE id=?', [$tid]), 'an item 6 hours in the bin is removed when the bin keeps 5 hours');
$mk = function ($hours) use ($db) { $at = gmdate('Y-m-d H:i:s', time() - $hours * 3600);
  $db->prepare("INSERT INTO leads(name,phone,source,status,notify,created,updated,lead_type) VALUES(?,?,'Meta Ads','New',1,?,?,'meta')")->execute(['Ctl Lead ' . $hours, '90000005' . str_pad((string)$hours, 2, '0', STR_PAD_LEFT), $at, $at]); return (int)$db->lastInsertId(); };
$save($admin, 'rules', ['lead_lost_hours' => 2]);
$l3 = $mk(3); $l1 = $mk(1); $upkeep();
chk($one('SELECT status FROM leads WHERE id=?', [$l3]) === 'Lost' && $one('SELECT status FROM leads WHERE id=?', [$l1]) === 'New', 'an unattended new lead is marked Lost after 2 hours (3 hours Lost, 1 hour still New)');
chk((bool)$one("SELECT 1 FROM notes WHERE entity='leads' AND entity_id=? AND text LIKE '%within 2 hours%'", [$l3]), 'its note says "within 2 hours"');
$save($admin, 'rules', ['feas_valid_days' => 10, 'feas_alert_days' => 2]);
call($admin, 'fees', 'add', ['kind' => 'feasibility', 'customer_ids' => [$cid]]);
$fid = (int)$one("SELECT id FROM fees WHERE customer_id=? AND kind='feasibility'", [$cid]);
call($admin, 'fees', 'set', ['id' => $fid, 'paid' => 1, 'paid_on' => date('Y-m-d', strtotime('-9 days'))]);
$f = call($admin, 'fees', 'list', null, '&kind=feasibility'); $row = array_values(array_filter($f['rows'] ?? [], fn($x) => (int)$x['id'] === $fid))[0] ?? [];
chk(($f['valid_days'] ?? 0) === 10 && ($f['alert_days'] ?? 0) === 2 && ($row['days_left'] ?? 99) === 1, 'a feasibility paid 9 days ago has 1 day left when it is valid 10 days');
$upkeep();
chk((bool)$one("SELECT 1 FROM notifs WHERE kind='feas' AND customer_id=?", [$cid]), 'and the warning goes out (inside the 2-day warning time)');
chk($save($admin, 'rules', $USUAL)['_code'] === 200 && $S()['rules'] == $USUAL, 'the usual values can be put back in one save');

/* 3. document types */
$r = $save($admin, 'doc_types', ['  Aadhaar card ', 'PAN card', '', 'PAN card', 'Roof photo', ['x'], str_repeat('long ', 30)]);
$dt = $S()['doc_types'];
chk($r['_code'] === 200 && array_slice($dt, 0, 3) === ['Aadhaar card', 'PAN card', 'Roof photo'] && count($dt) === 4 && mb_strlen($dt[3]) === 60, 'document types: trimmed, no repeats, no blanks, 60 characters at most');
chk($save($admin, 'doc_types', [])['_code'] === 400 && $save($admin, 'doc_types', ['', '  '])['_code'] === 400 && count($S()['doc_types']) === 4, 'an empty list is refused');
$db->exec("DELETE FROM settings WHERE k='doc_types'");

/* 4. user controls */
$us = call($admin, 'admin', 'users'); $me = array_values(array_filter($us, fn($u) => is_array($u) && ($u['username'] ?? '') === 'boss'))[0] ?? []; $u = array_values(array_filter($us, fn($x) => is_array($x) && ($x['username'] ?? '') === 'ctlsales'))[0] ?? [];
chk(array_key_exists('seen_at', $u) && array_key_exists('customers', $u) && array_key_exists('leads', $u) && (int)$me['customers'] >= 1, 'the user list carries last seen and what each person holds');
$uid = (int)$u['id'];
chk(call($sales, 'customers', 'list')['_code'] === 200, 'the seller is signed in');
chk(call($sales, 'admin', 'user_signout', ['id' => $uid])['_code'] === 403 && call($sales, 'admin', 'user_active', ['id' => (int)$me['id'], 'active' => 0])['_code'] === 403, 'staff cannot use the user controls');
chk(call($admin, 'admin', 'user_signout', ['id' => $uid])['_code'] === 200 && call($sales, 'customers', 'list')['_code'] === 401, 'Sign out: the person is signed out at once');
chk(call($sales, 'auth', 'login', ['username' => 'ctlsales', 'password' => $pw])['_code'] === 200 && call($sales, 'customers', 'list')['_code'] === 200, 'and can sign in again with the same password');
chk(call($admin, 'admin', 'user_signout', ['id' => (int)$me['id']])['_code'] === 400 && call($admin, 'customers', 'list')['_code'] === 200, 'the admin cannot sign themself out here');
chk(call($admin, 'admin', 'user_active', ['id' => $uid, 'active' => 0])['_code'] === 200 && call($sales, 'customers', 'list')['_code'] === 401, 'Disable: signed out at once');
chk(call($sales, 'auth', 'login', ['username' => 'ctlsales', 'password' => $pw])['_code'] !== 200, 'a disabled login cannot sign in');
chk(call($admin, 'admin', 'user_active', ['id' => $uid, 'active' => 1])['_code'] === 200 && call($sales, 'auth', 'login', ['username' => 'ctlsales', 'password' => $pw])['_code'] === 200, 'Enable: the person can sign in again');
chk(call($admin, 'admin', 'user_active', ['id' => (int)$me['id'], 'active' => 0])['_code'] === 400 && call($admin, 'admin', 'user_active', ['id' => 999999, 'active' => 0])['_code'] === 404, 'the admin cannot disable themself; an unknown user is not found');
chk((bool)$one("SELECT 1 FROM audit_log WHERE action='user_signout'") && (bool)$one("SELECT 1 FROM audit_log WHERE action='user_save' AND detail LIKE '%(disabled)%'"), 'both are in the audit log');

/* 5. what Settings shows about the incentive scheme */
$inc = $S()['incentive'] ?? [];
chk(($inc['own_rate'] ?? 0) > 0 && count($inc['tiers'] ?? []) === 3 && $inc['tiers'][2][0] === null, 'Settings gets the incentive rates to show');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
