<?php
// Feasibility expiry notifications end in two ways (owner's rule 2026-11-25): the feasibility is paid again, or the registration fee
// is paid. Then the customer's old bell notifications are removed, and the hourly job sends none while the registration fee is paid.
// Usage: php tests/feas_reset_test.php http://localhost:8094 path/to/data/crm.sqlite
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/'); $dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function call($who, $m, $a, $body = null, $qs = '') {
  global $base;
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs"); $h = ['X-Solarize: 1'];
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar']]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POST, true); $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt]; $j['_code'] = $code; return $j;
}
echo "Feasibility expiry: reset after re-payment or registration fee\n";
if (!$dbPath || !is_file($dbPath)) { echo "  (needs the database path)\n  0 passed, 1 failed\n"; exit(1); }
$pdo = new PDO('sqlite:' . $dbPath, null, null, [PDO::ATTR_TIMEOUT => 10]); $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$one = function ($sql, $args = []) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($args); $v = $s->fetchColumn(); $s->closeCursor(); return $v; }; /* never leave a read open: it locks out the server's writes */
$ago = fn($n) => date('Y-m-d', strtotime("-$n days"));
$hourly = function () use ($pdo) { $pdo->exec("UPDATE settings SET v='0' WHERE k='hk_last'"); }; /* the next request runs the hourly job */
$admin = ['jar' => sys_get_temp_dir() . '/frjar_' . getmypid() . '.txt']; $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$C = [];
foreach (['Repay Later' => 31, 'Reg Paid Later' => 31, 'Reg Paid First' => 31, 'Two Days Left' => 28] as $n => $paidAgo) $C[$n] = ['cid' => (int)(call($admin, 'customers', 'save', ['name' => $n, 'phone' => '9100000' . rand(100, 999)])['id'] ?? 0), 'ago' => $paidAgo];
call($admin, 'fees', 'add', ['kind' => 'feasibility', 'customer_ids' => array_column($C, 'cid')]);
call($admin, 'fees', 'add', ['kind' => 'registration', 'customer_ids' => [$C['Reg Paid Later']['cid'], $C['Reg Paid First']['cid']]]);
$fid = fn($cid, $kind) => (int)$one('SELECT id FROM fees WHERE customer_id=? AND kind=?', [$cid, $kind]);
foreach ($C as $n => $x) call($admin, 'fees', 'set', ['id' => $fid($x['cid'], 'feasibility'), 'paid' => 1, 'paid_on' => $ago($x['ago'])]);
call($admin, 'fees', 'set', ['id' => $fid($C['Reg Paid First']['cid'], 'registration'), 'paid' => 1, 'paid_on' => $ago(20)]);
$bell = fn($cid) => (int)$one("SELECT COUNT(*) FROM notifs WHERE kind='feas' AND customer_id=?", [$cid]);
$hourly(); call($admin, 'disc', 'notifs');
chk($bell($C['Repay Later']['cid']) > 0 && $bell($C['Reg Paid Later']['cid']) > 0, 'expired feasibility: bell notifications are sent');
chk($bell($C['Two Days Left']['cid']) > 0, 'expiring in 2 days: bell notification is sent');
chk($bell($C['Reg Paid First']['cid']) === 0, 'registration fee already paid: no expiry notification at all');
$mine = array_column(call($admin, 'disc', 'notifs')['rows'] ?? [], 'customer_id');
chk(in_array($C['Repay Later']['cid'], array_map('intval', $mine), true), 'it shows in the bell');

/* 1: the feasibility is paid again → the old notifications go, no new one until the new payment nears its end */
call($admin, 'fees', 'set', ['id' => $fid($C['Repay Later']['cid'], 'feasibility'), 'paid' => 1, 'paid_on' => $ago(0)]);
chk($bell($C['Repay Later']['cid']) === 0, 'feasibility paid again: its old notifications are removed at once');
$mine = array_map('intval', array_column(call($admin, 'disc', 'notifs')['rows'] ?? [], 'customer_id'));
chk(!in_array($C['Repay Later']['cid'], $mine, true), '…and are gone from the bell');
$hourly(); call($admin, 'disc', 'notifs');
chk($bell($C['Repay Later']['cid']) === 0, '…and the hourly job sends nothing for the new payment yet');
chk((int)$one('SELECT alert FROM fees WHERE id=?', [$fid($C['Repay Later']['cid'], 'feasibility')]) === 0, 'the warnings start again for the new payment date');

/* 2: the registration fee is paid → the old notifications go and none come back */
call($admin, 'fees', 'set', ['id' => $fid($C['Reg Paid Later']['cid'], 'registration'), 'paid' => 1, 'paid_on' => $ago(0)]);
chk($bell($C['Reg Paid Later']['cid']) === 0, 'registration fee paid: the old expiry notifications are removed at once');
$pdo->exec("UPDATE fees SET alert=0 WHERE kind='feasibility' AND customer_id=" . $C['Reg Paid Later']['cid']);
$hourly(); call($admin, 'disc', 'notifs');
chk($bell($C['Reg Paid Later']['cid']) === 0, '…and the hourly job never sends one again');

/* a still-valid warning stays: saving the same payment again, or editing the amount, changes nothing */
$before = $bell($C['Two Days Left']['cid']);
call($admin, 'fees', 'set', ['id' => $fid($C['Two Days Left']['cid'], 'feasibility'), 'paid' => 1, 'paid_on' => $ago(28)]);
call($admin, 'fees', 'set', ['id' => $fid($C['Two Days Left']['cid'], 'feasibility'), 'amount' => 1180]);
$hourly(); call($admin, 'disc', 'notifs');
chk($before > 0 && $bell($C['Two Days Left']['cid']) === $before, 'a current warning stays, and is not sent twice');

/* leftovers already in the bell (from before this rule) are swept by the hourly job */
$pdo->exec("INSERT INTO notifs(user_id,kind,customer_id,text) VALUES(1,'feas'," . $C['Reg Paid Later']['cid'] . ",'Feasibility EXPIRED (old)')");
$pdo->exec("INSERT INTO notifs(user_id,kind,customer_id,text) VALUES(1,'feas'," . $C['Repay Later']['cid'] . ",'Feasibility EXPIRED (old)')");
$hourly(); call($admin, 'disc', 'notifs');
chk($bell($C['Reg Paid Later']['cid']) === 0 && $bell($C['Repay Later']['cid']) === 0, 'old leftovers are removed by the hourly job');
chk($bell($C['Two Days Left']['cid']) === $before, '…but the current warning stays');

/* a payment date changed later (a correction or a new payment) clears that customer too */
$pdo->exec("INSERT INTO notifs(user_id,kind,customer_id,text) VALUES(1,'feas'," . $C['Two Days Left']['cid'] . ",'x')");
call($admin, 'fees', 'set', ['id' => $fid($C['Two Days Left']['cid'], 'feasibility'), 'paid' => 1, 'paid_on' => $ago(1)]);
chk($bell($C['Two Days Left']['cid']) === 0, 'a new payment date clears that customer too');

echo "  $pass passed, $fail failed\n";
exit($fail ? 1 : 0);
