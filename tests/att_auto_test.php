<?php
// Attendance: auto check-out at office end time unless the person chose "Continue working".
// Usage: php tests/att_auto_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function call($m, $a, $body = null, $qs = '') {
  global $base; static $jar = null; if (!$jar) $jar = sys_get_temp_dir() . '/attjar_' . getmypid() . '.txt';
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs"); $h = ['X-Solarize: 1'];
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $jar, CURLOPT_COOKIEFILE => $jar]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POST, true); $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt];
  $j['_code'] = $code; return $j;
}
echo "Attendance: auto check-out and Continue working\n";
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
date_default_timezone_set('Asia/Kolkata');
$pw = 'Sunny2026pass';
$r = call('auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call('auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$db->exec('PRAGMA busy_timeout=5000');
$me = (int)$db->query("SELECT id FROM users WHERE username='boss'")->fetch()['id'];
$today = date('Y-m-d'); $yest = date('Y-m-d', time() - 86400); $d2 = date('Y-m-d', time() - 2 * 86400); $d3 = date('Y-m-d', time() - 3 * 86400);
$hr = function ($end) use ($db) { $db->prepare("INSERT OR REPLACE INTO settings(k,v) VALUES('hr',?)")->execute([json_encode(['start' => '09:00', 'end' => $end, 'half_after' => '14:00', 'grace' => 15])]); };
$put = function ($date, $in, $cont = 0) use ($db, $me) { $db->prepare('DELETE FROM attendance WHERE user_id=? AND date=?')->execute([$me, $date]);
  $db->prepare("INSERT INTO attendance(user_id,date,check_in,status,cont) VALUES(?,?,?,'Present',?)")->execute([$me, $date, $in, $cont]); };
$get = fn($date) => $db->query("SELECT * FROM attendance WHERE user_id=$me AND date='$date'")->fetch();

/* past days */
$hr('18:00');
call('hr', 'me'); chk($db->query("SELECT v FROM settings WHERE k='hr_auto_from'")->fetch()['v'] === $today, 'first run stores the day the feature started');
$db->exec("INSERT OR REPLACE INTO settings(k,v) VALUES('hr_auto_from','2026-11-10')");
$put($yest, '09:10'); $put($d2, '09:05', 1); $put($d3, '09:00', 1); $put('2026-11-01', '09:00');
$db->exec("UPDATE attendance SET last_act='20:41' WHERE user_id=$me AND date='$d2'");
call('hr', 'me');
$a = $get($yest); chk($a['check_out'] === '18:00' && (int)$a['auto_out'] === 1, 'yesterday left open is closed at office end time, marked auto');
$a = $get($d2); chk($a['check_out'] === '20:41' && (int)$a['auto_out'] === 1, 'continued day is closed at the last time the CRM was used');
$a = $get($d3); chk($a['check_out'] === '18:00', 'continued day with no later use closes at office end time');
chk(($get('2026-11-01')['check_out'] ?? '') == '', 'days before the feature started are left alone');
$db->exec("DELETE FROM attendance WHERE user_id=$me AND date='2026-11-01'");

/* today, office end time not reached */
$hr('23:59'); $put($today, '00:00'); $r = call('hr', 'me');
chk(($r['today']['check_out'] ?? '') == '', 'before office end time: still checked in');

/* today, office end time passed */
$hr('00:01'); $r = call('hr', 'me');
chk(($r['today']['check_out'] ?? '') === '00:01' && (int)$r['today']['auto_out'] === 1, 'after office end time: checked out at end time, marked auto');
$r = call('hr', 'continue', []); chk($r['_code'] === 200, 'Continue working accepted after an auto check-out');
$r = call('hr', 'me'); chk(($r['today']['check_out'] ?? '') == '' && (int)$r['today']['cont'] === 1 && (int)$r['today']['auto_out'] === 0, 'checked in again, no auto check-out while continuing');
$r = call('hr', 'punch', ['kind' => 'out']); chk($r['_code'] === 200, 'manual check-out works after Continue');
$a = $get($today); chk($a['check_out'] !== null && $a['check_out'] !== '' && (int)$a['auto_out'] === 0, 'manual check-out is not marked auto');
$r = call('hr', 'continue', []); chk($r['_code'] !== 200, 'Continue refused after a manual check-out');

/* Continue chosen before end time */
$hr('23:59'); $put($today, '00:00'); $r = call('hr', 'continue', []); chk($r['_code'] === 200, 'Continue working accepted before office end time');
$hr('00:01'); $r = call('hr', 'me'); chk(($r['today']['check_out'] ?? '') == '', 'continued: not checked out at office end time');
$db->exec("UPDATE attendance SET last_act='' WHERE user_id=$me"); call('user', 'presence', null, '&act=1');
chk($get($today)['last_act'] === date('H:i') || $get($today)['last_act'] === date('H:i', time() - 60), 'using the CRM while continuing is remembered');

/* check-in after office end time counts as continuing */
$db->exec("DELETE FROM attendance WHERE user_id=$me AND date='$today'");
$r = call('hr', 'punch', ['kind' => 'in']); chk($r['_code'] === 200, 'check-in after office end time');
$r = call('hr', 'me'); chk(($r['today']['check_out'] ?? '') == '' && (int)$r['today']['cont'] === 1, 'late check-in is not auto checked out');
$db->exec("DELETE FROM attendance WHERE user_id=$me"); $db->exec("DELETE FROM settings WHERE k='hr'");
echo "  $pass passed, $fail failed\n"; exit($fail ? 1 : 0);
