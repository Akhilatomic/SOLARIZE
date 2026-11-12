<?php
// Business Associates never have WhatsApp. Usage: php tests/ba_whatsapp_test.php http://localhost:8094 <path to crm.sqlite>
// Runs after the other API suites on the same throw-away server (the admin "boss" may already exist).
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
require_once __DIR__ . '/_onboard.php'; /* onb(): staff add customers with the approved quotation and plant cost */
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/bawjar_' . $name . '_' . getmypid() . '.txt']; }
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

echo "Business Associate: no WhatsApp\n";
$admin = actor('admin'); $ba = actor('ba'); $sales = actor('sales');
$pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
// the old gap: "Can see & claim leads" used to bring WhatsApp along, for a BA too
$baId = (int)(call($admin, 'admin', 'user_save', ['name' => 'Wanda Partner', 'username' => 'wapartner', 'role' => 'ba', 'active' => 1, 'can_claim' => 1, 'password' => $pw])['id'] ?? 0);
$saId = (int)(call($admin, 'admin', 'user_save', ['name' => 'Walter Seller', 'username' => 'waseller', 'role' => 'sales', 'active' => 1, 'can_claim' => 1, 'password' => $pw])['id'] ?? 0);
chk($baId && $saId, 'BA and sales users created (both may claim leads)');
chk(call($ba, 'auth', 'login', ['username' => 'wapartner', 'password' => $pw])['_code'] === 200, 'BA signed in');
chk(call($sales, 'auth', 'login', ['username' => 'waseller', 'password' => $pw])['_code'] === 200, 'sales signed in');

$me = call($ba, 'auth', 'status')['user'] ?? [];
chk(in_array('leads', (array)($me['read'] ?? [])) && !in_array('whatsapp', (array)($me['read'] ?? [])) && !in_array('whatsapp', (array)($me['write'] ?? [])), 'BA with claim access: leads yes, WhatsApp no');
$me = call($sales, 'auth', 'status')['user'] ?? [];
chk(in_array('whatsapp', (array)($me['read'] ?? [])), 'sales still has WhatsApp');

chk(call($ba, 'wa', 'chats')['_code'] === 403, 'BA: WhatsApp inbox refused');
chk(call($ba, 'wa', 'unread')['_code'] === 403, 'BA: unread count refused');
chk(call($ba, 'wa', 'status')['_code'] === 403, 'BA: inbox status refused');
chk(call($ba, 'whatsapp', 'recent')['_code'] === 403, 'BA: message log refused');
chk(call($ba, 'whatsapp', 'log', ['phone' => '9000000000', 'text' => 'hi'])['_code'] === 403, 'BA: cannot log a WhatsApp message');

// admin ticks WhatsApp for BAs in Settings → User access: it does not stick
$s = call($admin, 'settings', 'get');
chk(in_array('whatsapp', $s['role_never']['ba'] ?? []), 'settings tell the screen BAs never get WhatsApp');
$perm = $s['roles_now']; $perm['ba']['read'][] = 'whatsapp'; $perm['ba']['write'][] = 'whatsapp';
chk(call($admin, 'settings', 'save', ['key' => 'role_perms', 'value' => $perm])['_code'] === 200, 'admin saves access with WhatsApp ticked for BAs');
$s = call($admin, 'settings', 'get');
chk(!in_array('whatsapp', $s['roles_now']['ba']['read']) && !in_array('whatsapp', $s['roles_now']['ba']['write']), 'BA access still has no WhatsApp');
chk(in_array('whatsapp', $s['roles_now']['sales']['read']), 'sales access keeps WhatsApp');
chk(call($ba, 'wa', 'chats')['_code'] === 403, 'BA inbox still refused');
call($admin, 'settings', 'save', ['key' => 'role_perms', 'value' => []]); // back to defaults

// WhatsApp history on the BA's own lead and customer is hidden from them
$lid = (int)(call($ba, 'leads', 'save', ['name' => 'Wa Lead Test', 'phone' => '9000000077', 'status' => 'New'])['id'] ?? 0);
$cid = (int)(onb($ba, 'customers', 'save', ['name' => 'Wa Customer Test', 'phone' => '9000000078'])['id'] ?? 0);
chk($lid && $cid, 'BA added a lead and a customer');
call($admin, 'whatsapp', 'log', ['lead_id' => $lid, 'phone' => '9000000077', 'text' => 'Quote sent on WhatsApp']);
call($admin, 'whatsapp', 'log', ['customer_id' => $cid, 'phone' => '9000000078', 'text' => 'Welcome message on WhatsApp']);
chk(count(call($admin, 'leads', 'get', null, "&id=$lid")['messages'] ?? []) === 1, 'admin sees the lead WhatsApp history');
$g = call($ba, 'leads', 'get', null, "&id=$lid");
chk($g['_code'] === 200 && ($g['messages'] ?? null) === [], 'BA: lead WhatsApp history empty');
$g = call($ba, 'customers', 'get', null, "&id=$cid");
chk($g['_code'] === 200 && ($g['messages'] ?? null) === [], 'BA: customer WhatsApp history empty');
$tl = json_encode(call($ba, 'profile', 'timeline', null, "&customer_id=$cid"));
chk(strpos($tl, 'Welcome message') === false, 'BA: no WhatsApp in the customer timeline');
chk(strpos(json_encode(call($admin, 'profile', 'timeline', null, "&customer_id=$cid")), 'Welcome message') !== false, 'admin timeline still shows it');

// a chat assigned to someone who becomes a BA goes back to unassigned
if ($dbPath && is_file($dbPath)) {
  $db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $db->prepare("INSERT INTO wa_chats(wa_id, name, assigned_to) VALUES(?,?,?)")->execute(['919000000079', 'Wa Chat Test', $saId]);
  $chat = (int)$db->lastInsertId();
  call($admin, 'admin', 'user_save', ['id' => $saId, 'name' => 'Walter Seller', 'username' => 'waseller', 'role' => 'ba', 'active' => 1, 'can_claim' => 1]);
  $st = $db->prepare('SELECT assigned_to FROM wa_chats WHERE id=?'); $st->execute([$chat]);
  chk($st->fetchColumn() === null, 'user turned into a BA: their WhatsApp chat is unassigned');
  $db = null;
} else chk(false, 'database path given');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
