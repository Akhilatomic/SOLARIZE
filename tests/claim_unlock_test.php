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
/* owner's rule (2026-11-16): a lead typed in by hand never unlocks, whoever typed it; only leads from the shared pool (Meta, WhatsApp) run the clock */
$given = $mk('Given Lead Test', 40, $u1, 'Boss'); $renamed = $mk('Renamed Adder Test', 40, $u1, 'Claim One Old Name');
$wa = $mk('WhatsApp Pool Test', 40, $u1, 'WhatsApp'); $ma = $mk('Meta Ads Pool Test', 40, $u1, 'Meta Ads');
$g = $rowOf($s1, $given);
chk((int)$get($given)['assigned_to'] === $u1 && $g && (int)$g['unlock_at'] === 0, 'a lead the admin typed in and gave to someone stays with them (no clock)');
chk((int)$get($renamed)['assigned_to'] === $u1, 'a typed-in lead stays although the name of who added it is no longer a user name');
chk(empty($get($wa)['assigned_to']) && empty($get($ma)['assigned_to']), 'WhatsApp and Meta leads still unlock after 36 hours');
$typed = (int)(call($s2, 'leads', 'save', ['name' => 'Typed By Two Test', 'phone' => '9000000771', 'status' => 'New'])['id'] ?? 0);
$db->exec("UPDATE leads SET claimed_at='" . $ago(60) . "' WHERE id=$typed"); call($admin, 'leads', 'assign', ['id' => $typed, 'user_id' => $u1]);
$db->exec("UPDATE leads SET claimed_at='" . $ago(60) . "' WHERE id=$typed"); call($admin, 'leads', 'list');
chk((int)$get($typed)['assigned_to'] === $u1, 'a typed-in lead handed to someone else stays with the new holder');
/* once, when the rule came in: typed-in leads the clock had already unlocked go back to who held them */
$mkFreed = function ($name, $by, $to) use ($db, $mk) { $id = $mk($name, 0, null, $by);
  $db->exec("INSERT INTO notifs(user_id,kind,lead_id,from_id,text) VALUES($to,'assign',$id,NULL,'Your claim on $name ended after 36 hours — the lead is open to everyone again')"); return $id; };
$back = $mkFreed('Freed Hand Test', 'Boss', $u1); $pool = $mkFreed('Freed Meta Test', 'Meta Ads', $u1); $taken = $mkFreed('Freed Then Claimed Test', 'Boss', $u1);
$db->exec("UPDATE leads SET assigned_to=$u2, claimed_at='" . $ago(1) . "' WHERE id=$taken");
$db->exec("DELETE FROM settings WHERE k='claim_hand_restored'"); $db->exec('PRAGMA user_version=72'); call($admin, 'leads', 'list');
chk((int)$get($back)['assigned_to'] === $u1 && $get($back)['claimed_at'] !== '', 'an unlocked typed-in lead goes back to the person who held it');
chk((bool)$db->query("SELECT 1 FROM notes WHERE entity='leads' AND entity_id=$back AND user='System' AND text LIKE '%Given back to Claim One%'")->fetchColumn(), 'a note on the lead says so');
chk(empty($get($pool)['assigned_to']), 'an unlocked Meta lead stays open');
chk((int)$get($taken)['assigned_to'] === $u2, 'a lead someone else has claimed since is not taken away');
$db->exec("UPDATE leads SET assigned_to=NULL, claimed_at='' WHERE id=$back"); $db->exec('PRAGMA user_version=72'); call($admin, 'leads', 'list');
chk(empty($get($back)['assigned_to']), 'the give-back runs once only');

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
/* appointment / call back: the lead stays locked until that date + 24 hours, however old the claim is */
$from(time() - 400 * 3600);
$ist = new DateTimeZone('Asia/Kolkata');
$day = fn($n) => (new DateTime('now', $ist))->modify(($n >= 0 ? '+' : '') . $n . ' day')->format('Y-m-d');
$min = fn($h) => (new DateTime('@' . (time() + (int)round($h * 3600))))->setTimezone($ist)->format('Y-m-d H:i');
$dayEnd = fn($d) => (new DateTime($d . ' 00:00:00', $ist))->getTimestamp() + 86400;
$set = fn($id, $appt, $cb) => $db->prepare('UPDATE leads SET appt=?, callback_at=? WHERE id=?')->execute([$appt, $cb, $id]);
$ha = $mk('Appt Hold Test', 100, $u1); $set($ha, $day(3), '');
$r = $rowOf($s1, $ha);
chk((int)$get($ha)['assigned_to'] === $u1 && $r && (int)$r['unlock_at'] === $dayEnd($day(3)) + 24 * 3600 && $r['hold'] === 'appt', 'an appointment keeps an old claim locked until the end of that day + 24 hours');
$hb = $mk('Call Back Hold Test', 100, $u1); $cbAt = $min(5); $set($hb, '', $cbAt);
$r = $rowOf($s1, $hb);
chk((int)$get($hb)['assigned_to'] === $u1 && $r && (int)$r['unlock_at'] === (new DateTime($cbAt, $ist))->getTimestamp() + 24 * 3600 && $r['hold'] === 'cb', 'a call back keeps it locked until its time + 24 hours');
$hc = $mk('Both Hold Test', 100, $u1); $set($hc, $day(1), $min(100));
chk($rowOf($s1, $hc)['hold'] === 'cb', 'with both set, the later one counts');
$hd = $mk('Short Hold Test', 1, $u1); $set($hd, $day(-1), '');
$r = $rowOf($s1, $hd); chk($r['hold'] === '' && abs((int)$r['unlock_at'] - (time() + 35 * 3600)) < 120, 'the 36 hour clock still applies when it ends later');
$he = $mk('Past Appt Test', 100, $u1); $set($he, $day(-3), $min(-30));
call($admin, 'leads', 'list');
chk(empty($get($he)['assigned_to']), 'once the date + 24 hours has passed, the lead unlocks');
$n = $db->query("SELECT text FROM notes WHERE entity='leads' AND entity_id=$he ORDER BY id DESC")->fetchColumn();
chk(strpos((string)$n, 'within 24 hours after the') !== false, 'the note says the appointment / call back time ran out');
$o2 = $mk('Own Appt Test', 100, $u1, 'Claim One'); $set($o2, $day(2), '');
chk((int)$rowOf($s1, $o2)['unlock_at'] === 0, 'a lead its holder added still has no clock');
/* set through the CRM: the answer carries the new time */
$hf = $mk('Api Hold Test', 30, $u1);
$sv = call($s1, 'leads', 'save', ['id' => $hf, 'name' => 'Api Hold Test', 'phone' => '9000000881', 'status' => 'Contacted', 'appt' => $day(4)]);
chk($sv['_code'] === 200 && (int)($sv['unlock_at'] ?? 0) === $dayEnd($day(4)) + 24 * 3600 && ($sv['hold'] ?? '') === 'appt', 'saving an appointment answers with the new unlock time');
$sv = call($s1, 'leads', 'save', ['id' => $hf, 'name' => 'Api Hold Test', 'phone' => '9000000881', 'status' => 'Contacted', 'appt' => '']);
chk(($sv['hold'] ?? 'x') === '' && abs((int)$sv['unlock_at'] - (time() + 6 * 3600)) < 120, 'removing the appointment puts the 36 hour clock back');
$cbAt = $min(48); $cb = call($s1, 'leads', 'callback', ['id' => $hf, 'at' => $cbAt, 'note' => 'ring again']);
chk($cb['_code'] === 200 && (int)$cb['unlock_at'] === (new DateTime($cbAt, $ist))->getTimestamp() + 24 * 3600 && $cb['hold'] === 'cb', 'setting a call back answers with the new unlock time');
/* a call back marked done keeps its 24 hours */
$hg = $mk('Done Hold Test', 100, $u1); $set($hg, '', $min(-2));
$dn = call($s1, 'leads', 'callback', ['id' => $hg, 'at' => '', 'done' => 1]);
chk($dn['_code'] === 200 && abs((int)$dn['unlock_at'] - (time() + 22 * 3600)) < 120 && $dn['hold'] === 'cb', 'call back done: the lead stays locked 24 hours from the call-back time');
call($admin, 'leads', 'list'); chk((int)$get($hg)['assigned_to'] === $u1, 'and it is not unlocked meanwhile');
$hh = $mk('Removed Hold Test', 100, $u1); $set($hh, '', $min(50));
call($s1, 'leads', 'callback', ['id' => $hh, 'at' => '']);
call($admin, 'leads', 'list'); chk(empty($get($hh)['assigned_to']), 'a call back that is removed (not done) holds nothing');
/* a new claim does not inherit the last holder's kept time */
$db->exec("UPDATE leads SET assigned_to=NULL, claimed_at='' WHERE id=$hg");
$c = call($s2, 'leads', 'claim', ['id' => $hg]);
chk(($c['hold'] ?? 'x') === '' && abs((int)$c['unlock_at'] - (time() + 36 * 3600)) < 120, 'a new claim starts on the plain 36 hour clock');
$db->exec("UPDATE leads SET appt='', callback_at='' WHERE id IN ($ha,$hb,$hc,$hd,$o2,$hf)");
/* Admin › Users › Edit › Delete: the login goes, the history stays, the work is handed on */
$u3 = (int)(call($admin, 'admin', 'user_save', ['name' => 'Delete Me', 'username' => 'deleteme', 'role' => 'sales', 'active' => 1, 'can_claim' => 1, 'password' => $pw])['id'] ?? 0);
$s3 = actor('s3'); call($s3, 'auth', 'login', ['username' => 'deleteme', 'password' => $pw]);
$dl = $mk('Deleted User Lead Test', 1, $u3);
$dcid = (int)(call($admin, 'customers', 'save', ['name' => 'Deleted User Customer', 'phone' => '9000000771'])['id'] ?? 0);
call($admin, 'customers', 'reassign', ['id' => $dcid, 'user_id' => $u3]);
$db->exec("INSERT INTO notes(entity,entity_id,text,user) VALUES('leads',$dl,'a note by them','Delete Me')");
chk(call($s3, 'admin', 'user_delete', ['id' => $u2])['_code'] === 403, 'only an admin can delete a user');
$me = (int)$db->query("SELECT id FROM users WHERE username='boss'")->fetchColumn();
chk(call($admin, 'admin', 'user_delete', ['id' => $me])['_code'] === 400, 'you cannot delete yourself');
chk(call($admin, 'admin', 'user_delete', ['id' => $u3, 'to' => $u3])['_code'] === 400 && call($admin, 'admin', 'user_delete', ['id' => $u3, 'to' => 999999])['_code'] === 400, 'their customers need an active user (or nobody) to go to');
$del = call($admin, 'admin', 'user_delete', ['id' => $u3, 'to' => $u1]);
chk($del['_code'] === 200 && (int)$del['leads'] === 1 && (int)$del['customers'] === 1, 'deleting reports what was handed on');
chk(empty($get($dl)['assigned_to']) && (int)$db->query("SELECT owner_id FROM customers WHERE id=$dcid")->fetchColumn() === $u1, 'their lead is back in the shared list and their customer has the new owner');
chk(!in_array($u3, array_map(fn($x) => (int)$x['id'], array_filter(call($admin, 'admin', 'users'), 'is_array')), true), 'they are gone from the users list');
chk(call($s3, 'leads', 'list')['_code'] === 401 && call(actor('s3b'), 'auth', 'login', ['username' => 'deleteme', 'password' => $pw])['_code'] !== 200, 'they are signed out and cannot sign in again');
$ur = $db->query("SELECT name, deleted, active FROM users WHERE id=$u3")->fetch();
chk($ur && $ur['name'] === 'Delete Me' && (int)$ur['deleted'] === 1 && (int)$ur['active'] === 0 && (int)$db->query("SELECT COUNT(*) FROM notes WHERE user='Delete Me'")->fetchColumn() === 1, 'their name and what they wrote are kept');
$again = call($admin, 'admin', 'user_save', ['name' => 'New Person', 'username' => 'deleteme', 'role' => 'sales', 'active' => 1, 'can_claim' => 0, 'password' => $pw]);
chk($again['_code'] === 200 && (int)$again['id'] !== $u3, 'the username is free for a new user');
chk(call($admin, 'admin', 'user_delete', ['id' => $u3])['_code'] === 404, 'a deleted user cannot be deleted twice');
/* leave the shared test database as other tests expect it: the rule starts now, so nothing else unlocks */
$db->exec("UPDATE leads SET claimed_at='" . gmdate('Y-m-d H:i:s') . "' WHERE id IN ($pre,$fresh)");
$from(time());

echo "  $pass ok, $fail FAIL\n";
exit($fail ? 1 : 0);
