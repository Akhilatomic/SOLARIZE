<?php
// Unattended team discussions: an hourly reminder while office is open, until the discussion is read.
// Usage: php tests/disc_remind_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/drjar_' . $name . '_' . getmypid() . '.txt']; }
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

echo "Discussions: reminders about unread discussions\n";
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
date_default_timezone_set('Asia/Kolkata');
$admin = actor('admin'); $sales = actor('sales'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$sid = (int)(call($admin, 'admin', 'user_save', ['name' => 'Remi Seller', 'username' => 'remiseller', 'role' => 'sales', 'active' => 1, 'password' => $pw])['id'] ?? 0);
chk($sid && call($sales, 'auth', 'login', ['username' => 'remiseller', 'password' => $pw])['_code'] === 200, 'second user signed in');
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC); $db->exec('PRAGMA busy_timeout=5000');
$cfg = fn($start, $end, $off = []) => call($admin, 'hr', 'cfg_save', null) && call($admin, 'hr', 'cfg_save', ['value' => ['start' => $start, 'end' => $end, 'half_after' => '14:00', 'grace' => 15, 'year_max' => 30, 'half_hours' => 0, 'full_hours' => 9, 'week_off' => $off, 'holidays' => [], 'pay_day' => 6]]);
$cfg('00:00', '23:59'); /* office open all day, so the test does not depend on the time it runs */
$cid = (int)(call($admin, 'customers', 'save', ['name' => 'Disc Remind Test', 'phone' => '9' . random_int(100000000, 999999999)])['id'] ?? 0);
call($admin, 'disc', 'post', ['customer_id' => $cid, 'body' => 'Please check the roof photos', 'mentions' => [$sid], 'topic' => 'Roof']);
$did = (int)$db->query("SELECT id FROM discussions WHERE customer_id=$cid")->fetchColumn();
$rem = fn() => (int)$db->query("SELECT COUNT(*) FROM notifs WHERE user_id=$sid AND discussion_id=$did AND kind='remind'")->fetchColumn();
$remUnseen = fn() => (int)$db->query("SELECT COUNT(*) FROM notifs WHERE user_id=$sid AND discussion_id=$did AND kind='remind' AND seen=0")->fetchColumn();
$poll = function () use ($sales, $db) { $db->exec("DELETE FROM settings WHERE k='disc_rem_last'"); return call($sales, 'disc', 'notifs'); };
$ago = fn($min) => gmdate('Y-m-d H:i:s', time() - $min * 60);

$poll(); chk($rem() === 0, 'no reminder right after the message (the tag alert is the first notification)');
$db->exec("UPDATE disc_msgs SET created='" . $ago(30) . "' WHERE discussion_id=$did"); $poll();
chk($rem() === 0, 'none after 30 minutes either');
$db->exec("UPDATE disc_msgs SET created='" . $ago(61) . "' WHERE discussion_id=$did"); $n = $poll();
chk($rem() === 1, 'a reminder after an hour unread');
$row = $db->query("SELECT * FROM notifs WHERE user_id=$sid AND kind='remind' ORDER BY id DESC LIMIT 1")->fetch();
chk(strpos($row['text'], 'Unattended discussion on Disc Remind Test') === 0 && strpos($row['text'], '1 unread message') !== false && strpos($row['text'], 'last from Boss') !== false && (int)$row['customer_id'] === $cid, 'it names the customer, the unread count and who wrote last');
$bell = array_values(array_filter($n['rows'] ?? [], fn($x) => $x['kind'] === 'remind'));
chk(count($bell) === 1 && $bell[0]['customer_name'] === 'Disc Remind Test', 'it shows in the bell');
$poll(); chk($rem() === 1, 'not repeated within the hour');
$db->exec("UPDATE notifs SET created='" . $ago(61) . "' WHERE kind='remind' AND discussion_id=$did"); $poll();
chk($rem() === 2 && $remUnseen() === 1, 'a second reminder an hour later; the earlier one is marked read, one stays in the bell');
/* more waiting */
call($admin, 'disc', 'post', ['customer_id' => $cid, 'body' => 'Any news?']);
$db->exec("UPDATE notifs SET created='" . $ago(61) . "' WHERE kind='remind' AND discussion_id=$did"); $poll();
$last = $db->query("SELECT text FROM notifs WHERE user_id=$sid AND kind='remind' ORDER BY id DESC LIMIT 1")->fetchColumn();
chk(strpos($last, '2 unread messages') !== false, 'the count follows the unread messages');
/* the person who wrote is not reminded about their own message */
chk((int)$db->query("SELECT COUNT(*) FROM notifs WHERE kind='remind' AND user_id=" . (int)call($admin, 'auth', 'status')['user']['id'])->fetchColumn() === 0, 'the writer is not reminded about their own message');
/* closed office: nothing */
$cfg('00:00', '00:01'); $db->exec("UPDATE notifs SET created='" . $ago(61) . "' WHERE kind='remind' AND discussion_id=$did"); $before = $rem(); $poll();
chk($rem() === $before, 'nothing is sent outside office hours (after the end time)');
$cfg('00:00', '23:59', [0, 1, 2, 3, 4, 5, 6]); $poll(); chk($rem() === $before, 'nothing on a weekly off');
$cfg('00:00', '23:59');
/* read it: the reminders stop */
call($sales, 'disc', 'thread', null, "&customer_id=$cid");
$db->exec("UPDATE notifs SET created='" . $ago(61) . "' WHERE kind='remind' AND discussion_id=$did"); $before = $rem(); $poll();
chk($rem() === $before, 'once the discussion is opened (read) the reminders stop');
chk((int)$db->query("SELECT COUNT(*) FROM notifs WHERE user_id=$sid AND kind='remind' AND seen=0")->fetchColumn() === 0, 'and opening it clears the reminder from the bell');
/* a new unread message starts the clock again; an ended discussion is left alone */
call($admin, 'disc', 'post', ['customer_id' => $cid, 'body' => 'One more thing']);
$db->exec("UPDATE disc_msgs SET created='" . $ago(70) . "' WHERE discussion_id=$did AND id=(SELECT MAX(id) FROM disc_msgs WHERE discussion_id=$did)"); $db->exec("UPDATE notifs SET created='" . $ago(200) . "' WHERE kind='remind' AND discussion_id=$did"); $before = $rem(); $poll();
chk($rem() === $before + 1, 'a new unread message is reminded about after an hour');
call($admin, 'disc', 'end', ['id' => $did, 'note' => 'done']); $db->exec("UPDATE notifs SET created='" . $ago(200) . "' WHERE kind='remind' AND discussion_id=$did"); $before = $rem(); $poll();
chk($rem() === $before, 'an ended discussion is not reminded about');
chk(call(actor('nobody'), 'disc', 'notifs')['_code'] === 401, 'the notification list needs sign-in');
/* the rule is settable */
chk(in_array('disc_remind_min', array_keys(call($admin, 'settings', 'get')['rule_names'] ?? []), true), 'the reminder interval is a setting (Rules)');

echo "  $pass ok, $fail FAIL\n";
exit($fail ? 1 : 0);
