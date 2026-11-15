<?php
// Leaves ↔ attendance: an approved leave shows as leave in attendance, the person is told, and the request flow rules hold.
// Usage: php tests/leave_sync_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/lvjar_' . $name . '_' . getmypid() . '.txt']; }
function call($who, $m, $a, $body = null, $qs = '') {
  global $base;
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs"); $h = ['X-Solarize: 1'];
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar']]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POST, true); $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt];
  $j['_code'] = $code; return $j;
}
echo "Leaves: approval marks the days as leave in attendance\n";
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
date_default_timezone_set('Asia/Kolkata');
$admin = actor('admin'); $staff = actor('staff'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$sid = (int)(call($admin, 'admin', 'user_save', ['name' => 'Lena Leaver', 'username' => 'lvstaff', 'role' => 'sales', 'active' => 1, 'password' => $pw])['id'] ?? 0);
chk($sid > 0 && call($staff, 'auth', 'login', ['username' => 'lvstaff', 'password' => $pw])['_code'] === 200, 'staff signed in');
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$db->exec('PRAGMA busy_timeout=5000');
$db->exec("DELETE FROM leaves WHERE user_id=$sid"); $db->exec("DELETE FROM attendance WHERE user_id=$sid"); $db->exec("DELETE FROM notifs WHERE user_id=$sid");
/* no weekly off / holidays, so any date counts */
$db->prepare("INSERT OR REPLACE INTO settings(k,v) VALUES('hr',?)")->execute([json_encode(['start' => '09:00', 'end' => '23:59', 'half_after' => '14:00', 'grace' => 15, 'week_off' => [], 'holidays' => [], 'holidays_set' => 1])]);
$today = date('Y-m-d'); $day = fn($n) => date('Y-m-d', time() + $n * 86400);
$note = fn() => $db->query("SELECT text FROM notifs WHERE user_id=$sid AND kind='leave' ORDER BY id DESC LIMIT 1")->fetch()['text'] ?? '';
$att = fn($d) => $db->query("SELECT * FROM attendance WHERE user_id=$sid AND date='$d'")->fetch();

/* 1. full-day leave today, after the person already checked in */
chk(call($staff, 'hr', 'punch', ['kind' => 'in'])['_code'] === 200, 'staff checked in today');
$r = call($staff, 'hr', 'apply', ['type' => 'PE', 'from' => $today, 'to' => $day(1), 'reason' => 'Family function', 'approve' => 1]);
chk($r['_code'] === 200 && empty($r['approved']), 'staff request waits for approval (cannot approve own)');
$id = (int)$r['id'];
$rv = call($admin, 'hr', 'review', null, "&id=$id");
chk($rv['_code'] === 200 && count($rv['marked']) === 1 && $rv['marked'][0]['date'] === $today && (float)$rv['balance']['left'] === 12.0, 'review shows the balance and the attendance already marked');
chk(call($staff, 'hr', 'review', null, "&id=$id")['_code'] === 403, 'staff cannot open the review');
chk(call($admin, 'hr', 'decide', ['id' => $id, 'decision' => 'Rejected', 'note' => ''])['_code'] !== 200, 'rejecting needs a reason');
$r = call($admin, 'hr', 'decide', ['id' => $id, 'decision' => 'Approved', 'note' => 'Enjoy']);
chk($r['_code'] === 200 && (int)$r['cleared'] === 1 && !$att($today), 'approval removes the attendance entry on the leave day');
chk(str_contains($note(), 'Leave approved') && str_contains($note(), 'Enjoy'), 'staff gets a bell message with the note');
$me = call($staff, 'hr', 'me');
chk(!empty($me['on_leave']) && empty($me['today']), 'staff own button: on leave today');
$t = call($admin, 'hr', 'today'); $row = array_values(array_filter($t['rows'], fn($x) => (int)$x['user_id'] === $sid))[0] ?? [];
chk(($row['leave'] ?? '') === 'PE' && empty($row['check_in']), 'Today board shows the person on leave');
$w = call($admin, 'hr', 'range', null, "&from=$today&to=" . $day(1));
chk(count(array_filter($w['leaves'], fn($x) => (int)$x['user_id'] === $sid)) === 1 && !array_filter($w['records'], fn($x) => (int)$x['user_id'] === $sid), 'weekly / monthly data: leave, no attendance entry');
chk(call($staff, 'hr', 'punch', ['kind' => 'in'])['_code'] !== 200, 'check-in refused on an approved leave day');
chk(call($admin, 'hr', 'mark', ['user_id' => $sid, 'date' => $today, 'status' => 'Present', 'check_in' => '09:00'])['_code'] !== 200, 'manager cannot mark attendance over the leave');

/* 2. cancelling */
chk(call($staff, 'hr', 'cancel', ['id' => $id])['_code'] === 403, 'staff cannot cancel a leave that has started');
chk(call($admin, 'hr', 'cancel', ['id' => $id])['_code'] === 200 && str_contains($note(), 'Leave cancelled'), 'manager cancels it, staff is told');
chk(empty(call($staff, 'hr', 'me')['on_leave']) && call($staff, 'hr', 'punch', ['kind' => 'in'])['_code'] === 200, 'after cancelling, the day is open again and check-in works');
$r = call($staff, 'hr', 'apply', ['type' => 'SL', 'from' => $day(5), 'to' => $day(5), 'reason' => 'Doctor']); $id2 = (int)$r['id'];
call($admin, 'hr', 'decide', ['id' => $id2, 'decision' => 'Approved']);
$n0 = (int)$db->query("SELECT COUNT(*) c FROM notifs WHERE kind='leave' AND user_id<>$sid")->fetch()['c'];
chk(call($staff, 'hr', 'cancel', ['id' => $id2])['_code'] === 200, 'staff can cancel an approved leave before it starts');
chk((int)$db->query("SELECT COUNT(*) c FROM notifs WHERE kind='leave' AND user_id<>$sid")->fetch()['c'] === $n0 + 1, 'the approver is told about it');

/* 3. rejected */
$r = call($staff, 'hr', 'apply', ['type' => 'PE', 'from' => $day(8), 'to' => $day(8), 'reason' => 'Trip']); $id3 = (int)$r['id'];
chk(call($admin, 'hr', 'decide', ['id' => $id3, 'decision' => 'Rejected', 'note' => 'Site work that day'])['_code'] === 200 && str_contains($note(), 'Site work that day'), 'rejection reaches the staff with the reason');

/* 4. manager enters leave for staff and approves in one step */
$db->prepare("INSERT INTO attendance(user_id,date,status,notes) VALUES(?,?,'Absent','')")->execute([$sid, $day(-1)]);
$r = call($admin, 'hr', 'apply', ['user_id' => $sid, 'type' => 'SL', 'from' => $day(-1), 'to' => $day(-1), 'reason' => 'Was sick', 'approve' => 1]);
chk($r['_code'] === 200 && !empty($r['approved']) && (int)$r['cleared'] === 1 && !$att($day(-1)), 'entered and approved in one step; the Absent mark becomes leave');
chk($db->query("SELECT status FROM leaves WHERE id=" . (int)$r['id'])->fetch()['status'] === 'Approved' && str_contains($note(), 'Leave approved'), 'leave is Approved and staff is told');
$r = call($admin, 'hr', 'apply', ['user_id' => $sid, 'type' => 'PE', 'from' => $day(12), 'to' => $day(12), 'reason' => 'Asked by phone']);
chk($r['_code'] === 200 && empty($r['approved']) && str_contains($note(), 'entered a leave request for you'), 'without "approve now" it waits, and staff is told it was entered');

/* 5. half-day leave keeps the attendance entry */
$db->exec("DELETE FROM attendance WHERE user_id=$sid AND date='$today'");
call($staff, 'hr', 'punch', ['kind' => 'in']);
$r = call($staff, 'hr', 'apply', ['type' => 'PE', 'from' => $today, 'to' => $today, 'half' => 'second', 'reason' => 'Bank work']);
$r2 = call($admin, 'hr', 'decide', ['id' => (int)$r['id'], 'decision' => 'Approved']);
chk($r2['_code'] === 200 && (int)$r2['cleared'] === 0 && $att($today), 'half-day leave keeps the check-in for the half worked');

$db->exec("DELETE FROM leaves WHERE user_id=$sid"); $db->exec("DELETE FROM attendance WHERE user_id=$sid"); $db->exec("DELETE FROM notifs WHERE kind='leave'"); $db->exec("DELETE FROM settings WHERE k='hr'");
$t = array_column(call($admin, 'hr', 'me')['cfg']['leave_types'], 'code');
chk($t === ['EM', 'SL', 'PE'], 'leave types are Emergency, Sick, Personal only');
chk(call($admin, 'hr', 'apply', ['type' => 'CL', 'from' => $day(20), 'to' => $day(20), 'reason' => 'x'])['_code'] !== 200, 'Casual leave can no longer be requested');
/* upgrade of an office that saved the old type list and has old leaves */
$db->exec("DELETE FROM settings WHERE k='hr_types_rev'");
$db->prepare("INSERT OR REPLACE INTO settings(k,v) VALUES('hr',?)")->execute([json_encode(['start' => '09:30', 'half_after' => '14:00', 'leave_types' => [['code' => 'SL', 'name' => 'Sick Leave', 'quota' => 12], ['code' => 'CL', 'name' => 'Casual Leave', 'quota' => 12], ['code' => 'LOP', 'name' => 'Unpaid', 'quota' => 0]]])]);
$db->exec("INSERT INTO leaves(user_id,type,from_date,to_date,days,reason,status) VALUES($sid,'CL','2026-01-05','2026-01-05',1,'old','Approved'),($sid,'LOP','2026-01-06','2026-01-06',1,'old','Approved')");
$db->exec('PRAGMA user_version=66'); $db = null;
$c = call($admin, 'hr', 'me')['cfg'];
chk(array_column($c['leave_types'], 'code') === ['EM', 'SL', 'PE'] && $c['start'] === '09:30', 'upgrade replaces a saved type list and keeps the other settings');
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$ty = array_column($db->query("SELECT type FROM leaves WHERE user_id=$sid ORDER BY from_date")->fetchAll(), 'type');
chk($ty === ['PE', 'LOP'], 'old Casual leave is kept as Personal; old unpaid leave untouched');
$db->exec("DELETE FROM leaves WHERE user_id=$sid"); $db->exec("DELETE FROM settings WHERE k='hr'");
echo "  $pass passed, $fail failed\n"; exit($fail ? 1 : 0);
