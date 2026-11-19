<?php
// Who is online: active / idle time per person per day, counted from the presence heartbeat.
// Usage: php tests/presence_time_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/ptjar_' . $name . '_' . getmypid() . '.txt']; }
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

echo "Presence: active and idle time\n";
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
date_default_timezone_set('Asia/Kolkata');
$admin = actor('admin'); $staff = actor('staff'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$sid = (int)(call($admin, 'admin', 'user_save', ['name' => 'Tina Staff', 'username' => 'tinastaff', 'role' => 'sales', 'active' => 1, 'password' => $pw])['id'] ?? 0);
chk($sid && call($staff, 'auth', 'login', ['username' => 'tinastaff', 'password' => $pw])['_code'] === 200, 'staff user signed in');
$aid = (int)call($admin, 'auth', 'status')['user']['id'];
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC); $db->exec('PRAGMA busy_timeout=5000');
$day = date('Y-m-d');
$t = fn($uid) => $db->query("SELECT * FROM presence_day WHERE user_id=$uid AND day='$day'")->fetch() ?: ['active_s' => 0, 'idle_s' => 0, 'first_at' => 0, 'act_at' => 0];
$beat = fn($who, $ia, $act = null) => call($who, 'user', 'presence', null, '&act=' . ($act ?? ($ia < 300 ? 1 : 0)) . '&ia=' . $ia);
$back = fn($uid, $secs) => $db->exec('UPDATE users SET seen_at=' . (time() - $secs) . ' WHERE id=' . $uid);
$near = fn($v, $want, $tol = 4) => $v >= $want - 1 && $v <= $want + $tol;

/* the first beat only opens the day */
$beat($staff, 5);
$x = $t($sid); chk((int)$x['active_s'] === 0 && (int)$x['idle_s'] === 0 && (int)$x['first_at'] > 0, 'the first heartbeat starts the day with nothing counted');
/* a minute later with the mouse used: a minute of active time */
$back($sid, 60); $beat($staff, 5);
$x = $t($sid); chk($near((int)$x['active_s'], 60) && (int)$x['idle_s'] === 0, 'a minute of use counts as active time');
/* a minute later, untouched, but the active beat was moments ago (e.g. another tab): still active */
$back($sid, 60); $beat($staff, 900, 0);
$x = $t($sid); chk($near((int)$x['active_s'], 120, 8) && (int)$x['idle_s'] === 0, 'an untouched tab right after use elsewhere does not count as idle');
/* nothing used for a while: idle */
$db->exec('UPDATE presence_day SET act_at=act_at-1000 WHERE user_id=' . $sid . " AND day='$day'");
$back($sid, 60); $beat($staff, 900, 0);
$x = $t($sid); chk($near((int)$x['idle_s'], 60) && $near((int)$x['active_s'], 120, 8), 'a minute with the CRM open but untouched counts as idle time');
/* the CRM was closed (a gap): nothing is counted for it */
$a0 = (int)$x['active_s']; $i0 = (int)$x['idle_s'];
$back($sid, 1000); $beat($staff, 5);
$x = $t($sid); chk((int)$x['active_s'] === $a0 && (int)$x['idle_s'] === $i0, 'a long gap (CRM closed, computer asleep) counts nothing');
/* a second beat within seconds writes nothing (one count a minute) */
$beat($staff, 5); $x2 = $t($sid); chk((int)$x2['active_s'] === $a0 && (int)$x2['idle_s'] === $i0, 'heartbeats a few seconds apart are not counted twice');

/* the time list */
$db->exec("INSERT OR REPLACE INTO presence_day(user_id,day,active_s,idle_s,first_at,last_at,act_at) VALUES($sid,'" . date('Y-m-d', time() - 86400) . "',7200,1800,1,2,0)");
$ad = call($admin, 'user', 'presence_time', null, '&range=today');
chk($ad['_code'] === 200 && (int)$ad['all'] === 1 && isset($ad['users'][$sid]) && $near((int)$ad['users'][$sid]['a'], $a0, 3), 'an admin gets everyone’s time for today');
$yd = call($admin, 'user', 'presence_time', null, '&range=yesterday');
chk((int)($yd['users'][$sid]['a'] ?? 0) === 7200 && (int)($yd['users'][$sid]['i'] ?? 0) === 1800, 'yesterday’s time is its own range');
$wk = call($admin, 'user', 'presence_time', null, '&range=week');
chk((int)($wk['users'][$sid]['a'] ?? 0) >= 7200 + $a0 - 2 && (int)($wk['users'][$sid]['d'] ?? 0) === 2, 'the last 7 days add the days up');
$own = call($staff, 'user', 'presence_time', null, '&range=week');
chk($own['_code'] === 200 && (int)$own['all'] === 1 && (int)($own['users'][$sid]['a'] ?? 0) === (int)($wk['users'][$sid]['a'] ?? -1) && count((array)$own['users']) === count((array)$wk['users']), 'other staff get everyone’s time too, the same list as the admin');
$ba = actor('ba'); $bid = (int)(call($admin, 'admin', 'user_save', ['name' => 'Tara Partner', 'username' => 'tarapartner', 'role' => 'ba', 'active' => 1, 'password' => $pw])['id'] ?? 0);
call($ba, 'auth', 'login', ['username' => 'tarapartner', 'password' => $pw]); $beat($ba, 5);
$bo = call($ba, 'user', 'presence_time', null, '&range=week');
chk($bid && $bo['_code'] === 200 && (int)$bo['all'] === 0 && array_map('intval', array_keys((array)$bo['users'])) === [$bid], 'a Business Associate sees only their own time');
chk(call(actor('nobody'), 'user', 'presence_time')['_code'] === 401, 'the time list needs sign-in');
chk(call($admin, 'user', 'presence_time', null, '&range=bogus')['range'] === 'today', 'an unknown range means today');
/* the beat without the new idle figure (an older open tab) still counts by its active flag */
$back($sid, 60); call($staff, 'user', 'presence', null, '&act=1'); $x = $t($sid); chk((int)$x['active_s'] > $a0, 'an older client without the idle figure still counts');

echo "  $pass ok, $fail FAIL\n";
exit($fail ? 1 : 0);
