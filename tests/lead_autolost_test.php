<?php
// Meta leads nobody attended within 24 hours of arriving are marked Lost by the hourly check.
// Usage: php tests/lead_autolost_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/lajar_' . $name . '_' . getmypid() . '.txt']; }
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

echo "Leads: unattended Meta leads become Lost after 24 hours\n";
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$admin = actor('admin');
$pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');

$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$db->exec('PRAGMA busy_timeout=5000');
$ago = fn($h) => gmdate('Y-m-d H:i:s', time() - (int)round($h * 3600));
$mk = function ($name, $hours, $notify, $status = 'New', $cust = null) use ($db, $ago) {
  $db->prepare("INSERT INTO leads(name,phone,source,status,notify,customer_id,created,updated,lead_type) VALUES(?,?,'Meta Ads',?,?,?,?,?,'meta')")
     ->execute([$name, '90000000' . str_pad((string)random_int(10, 99), 2, '0'), $status, $notify, $cust, $ago($hours), $ago($hours)]);
  return (int)$db->lastInsertId();
};
$old = $mk('Stale Lead Test', 25, 1);
$young = $mk('Young Lead Test', 23, 1);
$seen = $mk('Seen Lead Test', 30, 0);
$won = $mk('Won Lead Test', 30, 1, 'Won');
$conv = $mk('Converted Lead Test', 30, 1, 'Contacted', 99999);
$get = fn($id) => $db->query('SELECT status, notify FROM leads WHERE id=' . (int)$id)->fetch();

/* the hourly check runs on the next signed-in request once the last run is over an hour old */
$db->exec("INSERT OR REPLACE INTO settings(k,v) VALUES('hk_last','0')");
call($admin, 'meta', 'feed');

$s = $get($old);
chk($s['status'] === 'Lost' && (int)$s['notify'] === 0, 'unattended Meta lead older than 24 h → Lost and off the new-leads list');
$n = $db->query("SELECT text, user FROM notes WHERE entity='leads' AND entity_id=$old")->fetch();
chk($n && strpos($n['text'], 'Not attended within 24 hours (automatic)') !== false, 'a note on the lead says why');
$s = $get($young); chk($s['status'] === 'New' && (int)$s['notify'] === 1, 'a lead younger than 24 h is left alone');
$s = $get($seen); chk($s['status'] === 'New' && (int)$s['notify'] === 0, 'an attended lead (opened / called) is left alone');
$s = $get($won); chk($s['status'] === 'Won', 'a Won lead is never marked Lost');
$s = $get($conv); chk($s['status'] === 'Contacted', 'a lead already converted to a customer is left alone');
chk((int)$db->query("SELECT COUNT(*) FROM audit_log WHERE action='leads_autolost'")->fetchColumn() >= 1, 'audit log records the automatic change');

$feed = call($admin, 'meta', 'feed');
$ids = array_map(fn($l) => (int)$l['id'], $feed['leads'] ?? []);
chk(!in_array($old, $ids, true) && in_array($young, $ids, true), 'the bell / new-leads feed drops the Lost lead and keeps the young one');
$list = call($admin, 'leads', 'list');
$L = array_values(array_filter(is_array($list) ? $list : [], fn($l) => is_array($l) && (int)($l['id'] ?? 0) === $old));
chk($L && $L[0]['status'] === 'Lost', 'the lead is still in the Leads list under Lost (can be reopened)');

/* running again changes nothing more (idempotent) */
$before = (int)$db->query("SELECT COUNT(*) FROM notes WHERE entity='leads' AND entity_id=$old")->fetchColumn();
$db->exec("INSERT OR REPLACE INTO settings(k,v) VALUES('hk_last','0')");
call($admin, 'meta', 'feed');
chk((int)$db->query("SELECT COUNT(*) FROM notes WHERE entity='leads' AND entity_id=$old")->fetchColumn() === $before, 'a second run adds no second note');

echo "  $pass ok, $fail FAIL\n";
exit($fail ? 1 : 0);
