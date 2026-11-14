<?php
// A claimed lead that is not a customer within 36 hours is unlocked for everyone.
// Usage: php tests/claim_unlock_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/cujar_' . $name . '_' . getmypid() . '.txt']; }
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

echo "Leads: a claim unlocks after 36 hours without a conversion\n";
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$admin = actor('admin'); $s1 = actor('s1'); $s2 = actor('s2');
$pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$u1 = (int)(call($admin, 'admin', 'user_save', ['name' => 'Claim One', 'username' => 'claimone', 'role' => 'sales', 'active' => 1, 'can_claim' => 1, 'password' => $pw])['id'] ?? 0);
$u2 = (int)(call($admin, 'admin', 'user_save', ['name' => 'Claim Two', 'username' => 'claimtwo', 'role' => 'sales', 'active' => 1, 'can_claim' => 1, 'password' => $pw])['id'] ?? 0);
chk($u1 && $u2 && call($s1, 'auth', 'login', ['username' => 'claimone', 'password' => $pw])['_code'] === 200 && call($s2, 'auth', 'login', ['username' => 'claimtwo', 'password' => $pw])['_code'] === 200, 'two sales users who can claim');

$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$db->exec('PRAGMA busy_timeout=5000');
$ago = fn($h) => gmdate('Y-m-d H:i:s', time() - (int)round($h * 3600));
$mk = function ($name, $hours, $uid, $by = 'Meta', $cust = null) use ($db, $ago) {
  $db->prepare("INSERT INTO leads(name,phone,source,status,notify,customer_id,assigned_to,claimed_at,added_by,created,updated,lead_type) VALUES(?,?,'Meta Ads','Contacted',0,?,?,?,?,?,?,'meta')")
     ->execute([$name, '90000001' . str_pad((string)random_int(10, 99), 2, '0'), $cust, $uid, $uid ? $ago($hours) : '', $by, $ago(200), $ago(200)]);
  return (int)$db->lastInsertId();
};
$get = fn($id) => $db->query('SELECT assigned_to, claimed_at FROM leads WHERE id=' . (int)$id)->fetch();
$rowOf = function ($who, $id) { foreach (call($who, 'leads', 'list') as $l) if (is_array($l) && (int)($l['id'] ?? 0) === $id) return $l; return null; };
$from = fn($t) => $db->exec("INSERT OR REPLACE INTO settings(k,v) VALUES('claim_unlock_from','" . (int)$t . "')");

chk((int)(call($admin, 'settings', 'get')['rules']['claim_hours'] ?? 0) === 36, 'the rule is 36 hours unless changed in Settings');

/* the rule has been live for a long time */
$from(time() - 200 * 3600);
$late = $mk('Late Claim Test', 37, $u1);
$fresh = $mk('Fresh Claim Test', 35, $u1);
$conv = $mk('Converted Claim Test', 40, $u1, 'Meta', 99999);
$own = $mk('Own Lead Test', 40, $u1, 'Claim One');
$free = $mk('Free Lead Test', 0, null);

$f = $rowOf($s1, $fresh);
chk($f && abs((int)$f['unlock_at'] - (time() + 3600)) < 120, 'the list says when a running claim ends');
chk(empty($get($late)['assigned_to']) && $get($late)['claimed_at'] === '', 'a claim older than 36 hours is unlocked');
$n = $db->query("SELECT text, user FROM notes WHERE entity='leads' AND entity_id=$late")->fetch();
chk($n && $n['user'] === 'System' && strpos($n['text'], 'within 36 hours of being claimed by Claim One') !== false, 'a note on the lead says why');
chk((int)$db->query("SELECT COUNT(*) FROM notifs WHERE user_id=$u1 AND lead_id=$late AND kind='assign'")->fetchColumn() === 1, 'the person who held it is told');
chk((int)$db->query("SELECT COUNT(*) FROM audit_log WHERE action='leads_unlocked'")->fetchColumn() >= 1, 'audit log records the unlock');
chk((int)$get($fresh)['assigned_to'] === $u1, 'a claim younger than 36 hours stays');
chk((int)$get($conv)['assigned_to'] === $u1, 'a lead already converted to a customer stays with its holder');
$o = $rowOf($s1, $own);
chk((int)$get($own)['assigned_to'] === $u1 && $o && (int)$o['unlock_at'] === 0, 'a lead its holder added themself is not on the clock');
$x = $rowOf($s1, $free); chk($x && (int)$x['unlock_at'] === 0, 'an unclaimed lead has no clock');

/* the unlocked lead is open to the others */
$l2 = $rowOf($s2, $late); chk($l2 && empty($l2['assigned_to']), 'another user now sees the unlocked lead');
$c = call($s2, 'leads', 'claim', ['id' => $late]);
chk($c['_code'] === 200 && (int)($c['hours'] ?? 0) === 36 && abs((int)($c['unlock_at'] ?? 0) - (time() + 36 * 3600)) < 120, 'claiming it starts a new 36 hour clock');
chk((int)$get($late)['assigned_to'] === $u2, 'and it is locked to the new holder');

/* reading the list again changes nothing more */
$before = (int)$db->query("SELECT COUNT(*) FROM notes WHERE entity='leads' AND entity_id=$late")->fetchColumn();
call($admin, 'leads', 'list');
chk((int)$db->query("SELECT COUNT(*) FROM notes WHERE entity='leads' AND entity_id=$late")->fetchColumn() === $before, 'a second read adds no second note');

/* claims made before the rule went live count from that moment */
$from(time());
$pre = $mk('Old Claim Test', 100, $u1);
$p = $rowOf($s1, $pre);
chk((int)$get($pre)['assigned_to'] === $u1 && $p && abs((int)$p['unlock_at'] - (time() + 36 * 3600)) < 120, 'an older claim gets the full 36 hours from go-live');

/* the hourly check unlocks too, when nobody opens the Leads list */
$from(time() - 200 * 3600);
$hk = $mk('Hourly Claim Test', 50, $u1);
$db->exec("INSERT OR REPLACE INTO settings(k,v) VALUES('hk_last','0')");
call($admin, 'meta', 'feed');
chk(empty($get($hk)['assigned_to']), 'the hourly check unlocks an overdue claim');
/* grace period: the holder adds 12 hours to a running claim, up to 3 times per claim */
$from(time() - 200 * 3600);
$g = $mk('Grace Claim Test', 35, $u1);
$u0 = (int)$rowOf($s1, $g)['unlock_at'];
chk(abs($u0 - (time() + 3600)) < 120 && (int)$rowOf($s1, $g)['grace_used'] === 0 && (int)$rowOf($s1, $g)['grace_max'] === 3, 'a running claim shows no grace period used, 3 allowed');
chk(call($s2, 'leads', 'extend', ['id' => $g])['_code'] !== 200, 'someone else cannot add time to it');
$x1 = call($s1, 'leads', 'extend', ['id' => $g]);
chk($x1['_code'] === 200 && (int)$x1['used'] === 1 && (int)$x1['left'] === 2 && (int)$x1['hours'] === 12 && (int)$x1['unlock_at'] === $u0 + 12 * 3600, 'the holder adds 12 hours (1 of 3)');
$r1 = $rowOf($s1, $g); chk((int)$r1['unlock_at'] === $u0 + 12 * 3600 && (int)$r1['grace_used'] === 1, 'the list shows the new time and the count');
$n = $db->query("SELECT text FROM notes WHERE entity='leads' AND entity_id=$g ORDER BY id DESC")->fetchColumn();
chk(strpos((string)$n, 'Grace period 1 of 3 activated') !== false, 'a note on the lead records it');
$x2 = call($s1, 'leads', 'extend', ['id' => $g]); $x3 = call($admin, 'leads', 'extend', ['id' => $g]);
chk((int)$x2['used'] === 2 && (int)$x3['used'] === 3 && (int)$x3['left'] === 0 && (int)$x3['unlock_at'] === $u0 + 36 * 3600, 'three times in all (the admin may add one too): 36 more hours');
chk(call($s1, 'leads', 'extend', ['id' => $g])['_code'] === 409, 'a fourth is refused');
/* the extension holds: a claim 60 hours old with 3 grace periods (36 + 36 = 72 h) is not unlocked; without them it would be */
$db->exec("UPDATE leads SET claimed_at='" . $ago(60) . "', claim_ext_for='" . $ago(60) . "' WHERE id=$g");
call($admin, 'leads', 'list'); chk((int)$get($g)['assigned_to'] === $u1, 'a claim inside its grace time is not unlocked');
$db->exec("UPDATE leads SET claimed_at='" . $ago(73) . "', claim_ext_for='" . $ago(73) . "' WHERE id=$g");
call($admin, 'leads', 'list'); chk(empty($get($g)['assigned_to']), 'once the grace time runs out too, it unlocks');
/* a new claim starts with all three again */
call($s2, 'leads', 'claim', ['id' => $g]);
$r2 = $rowOf($s2, $g); chk((int)$r2['grace_used'] === 0 && abs((int)$r2['unlock_at'] - (time() + 36 * 3600)) < 120, 'a new claim starts with no grace period used');
chk(call($s2, 'leads', 'extend', ['id' => $own])['_code'] !== 200 && call($s1, 'leads', 'extend', ['id' => $own])['_code'] === 400, 'a lead with no clock (added by its holder) has nothing to extend');
/* leave the shared test database as other tests expect it: the rule starts now, so nothing else unlocks */
$db->exec("UPDATE leads SET claimed_at='" . gmdate('Y-m-d H:i:s') . "' WHERE id IN ($pre,$fresh)");
$from(time());

echo "  $pass ok, $fail FAIL\n";
exit($fail ? 1 : 0);
