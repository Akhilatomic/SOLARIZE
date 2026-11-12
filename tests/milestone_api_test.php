<?php
// Milestone incentive API tests. Usage: php tests/milestone_api_test.php http://localhost:8094 <path to crm.sqlite>
// Runs after the other API suites on the same throw-away server (the admin "boss" may already exist).
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
require_once __DIR__ . '/_onboard.php'; /* onb(): staff add customers with the approved quotation and plant cost */
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/msjar_' . $name . '_' . getmypid() . '.txt']; }
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
function by_cid($rows, $cid) { foreach ((array)$rows as $r) if ((int)($r['customer_id'] ?? 0) === $cid) return $r; return null; }
function inc_row($admin, $cid) { return by_cid(call($admin, 'comm', 'list', null, '&kind=incentive')['rows'] ?? [], $cid); }

echo "Milestone incentive\n";
$admin = actor('admin'); $mira = actor('mira'); $kiran = actor('kiran'); $acc = actor('acc'); $ba = actor('ba');
$pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$ids = [];
foreach ([['Mira Sales', 'msmira', 'sales'], ['Kiran Sales', 'mskiran', 'sales'], ['Asha Accounts', 'msacc', 'accounts'], ['Bala Partner', 'msba', 'ba']] as [$n, $un, $role])
  $ids[$un] = (int)(call($admin, 'admin', 'user_save', ['name' => $n, 'username' => $un, 'role' => $role, 'active' => 1, 'can_claim' => 1, 'password' => $pw])['id'] ?? 0);
foreach ([[$mira, 'msmira'], [$kiran, 'mskiran'], [$acc, 'msacc'], [$ba, 'msba']] as [$who, $un]) call($who, 'auth', 'login', ['username' => $un, 'password' => $pw]);
chk($ids['msmira'] && $ids['mskiran'] && $ids['msacc'] && $ids['msba'], 'users created and signed in');

// lead type on leads
$l1 = call($mira, 'leads', 'save', ['name' => 'Ms Lead Own', 'phone' => '9100000001', 'status' => 'New', 'lead_type' => 'own']);
$l2 = call($mira, 'leads', 'save', ['name' => 'Ms Lead Office', 'phone' => '9100000002', 'status' => 'New', 'lead_type' => 'office']);
$l3 = call($mira, 'leads', 'save', ['name' => 'Ms Lead Blank', 'phone' => '9100000003', 'status' => 'New']);
$l4 = call($mira, 'leads', 'save', ['name' => 'Ms Lead Odd', 'phone' => '9100000004', 'status' => 'New', 'lead_type' => 'friend']);
$g = fn($id) => call($admin, 'leads', 'get', null, '&id=' . (int)$id);
chk(($g($l1['id'])['lead_type'] ?? '') === 'own' && ($g($l2['id'])['lead_type'] ?? '') === 'office', 'lead type saved: own / office');
chk(($g($l3['id'])['lead_type'] ?? '') === 'office' && ($g($l4['id'])['lead_type'] ?? '') === 'office', 'missing or unknown lead type → office');
if ($dbPath && is_file($dbPath)) {
  $db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $db->prepare("INSERT INTO leads(name, phone, source, status, meta_id, lead_type, assigned_to) VALUES(?,?,?,?,?,?,?)")->execute(['Ms Lead Meta', '9100000005', 'Meta Ads', 'New', 'ms-meta-1', 'meta', $ids['msmira']]);
  $metaId = (int)$db->lastInsertId(); $db = null;
  $lm = $g($metaId); $lm['lead_type'] = 'own';
  call($mira, 'leads', 'save', $lm);
  chk(($g($metaId)['lead_type'] ?? '') === 'meta', 'a Meta form lead stays Meta');
} else chk(false, 'database path given');
$l2b = $g($l2['id']); $l2b['lead_type'] = 'own'; call($mira, 'leads', 'save', $l2b);
chk(($g($l2['id'])['lead_type'] ?? '') === 'own', 'staff can still change their lead before it is won');
$l2b['lead_type'] = 'office'; call($mira, 'leads', 'save', $l2b);

// customers carry the lead type
$cOwn = (int)(onb($mira, 'leads', 'convert', ['id' => $l1['id']])['customer_id'] ?? 0);
$cOff = (int)(onb($mira, 'leads', 'convert', ['id' => $l2['id']])['customer_id'] ?? 0);
$cMeta = (int)(onb($mira, 'leads', 'convert', ['id' => $metaId])['customer_id'] ?? 0);
$cust = fn($id) => call($admin, 'customers', 'get', null, "&id=$id");
chk(($cust($cOwn)['lead_type'] ?? '') === 'own' && ($cust($cOff)['lead_type'] ?? '') === 'office' && ($cust($cMeta)['lead_type'] ?? '') === 'meta', 'converted customers keep the lead type');
$cDirect = (int)(onb($mira, 'customers', 'save', ['name' => 'Ms Direct Own', 'phone' => '9100000006', 'lead_type' => 'own'])['id'] ?? 0);
chk(($cust($cDirect)['lead_type'] ?? '') === 'own', 'customer added directly: lead type chosen');
$cd = $cust($cDirect); $cd['lead_type'] = 'office'; call($mira, 'customers', 'save', $cd);
chk(($cust($cDirect)['lead_type'] ?? '') === 'own', 'staff cannot re-type an existing customer');
$cd['lead_type'] = 'office'; call($admin, 'customers', 'save', $cd);
chk(($cust($cDirect)['lead_type'] ?? '') === 'office', 'the admin can');
$cd['lead_type'] = 'own'; call($admin, 'customers', 'save', $cd);

// Meta only comes from a lead: a customer added directly is never Meta
$dm = (int)(onb($mira, 'customers', 'save', ['name' => 'Ms Direct Meta', 'phone' => '9100000007', 'lead_type' => 'meta'])['id'] ?? 0);
chk(($cust($dm)['lead_type'] ?? '') === 'office', 'customer added directly as Meta is saved as Office');
$x = $cust($dm); $x['lead_type'] = 'meta'; call($admin, 'customers', 'save', $x);
chk(($cust($dm)['lead_type'] ?? '') === 'office', 'the admin cannot make a direct customer Meta either');
chk(call($admin, 'comm', 'approve', ['customer_id' => $dm, 'lead_type' => 'meta', 'ok' => 1])['_code'] === 400, 'approval refuses Meta for a direct customer');
$x = $cust($cMeta); $x['phone'] = '9100000099'; call($admin, 'customers', 'save', $x);
chk(($cust($cMeta)['lead_type'] ?? '') === 'meta', 'a customer won from a Meta lead keeps Meta');
$rd = inc_row($admin, $dm); $rm = inc_row($admin, $cMeta);
chk($rd && $rd['from_lead'] === 0 && $rm && $rm['from_lead'] === 1, 'the list tells which customers came from a lead');
call($admin, 'comm', 'approve', ['customer_id' => $dm, 'lead_type' => 'office', 'ok' => 0]); // out of the way of the counts below

// kW from projects (3 kW each)
foreach ([$cOwn, $cOff, $cMeta, $cDirect] as $cid) call($admin, 'projects', 'save', ['customer_id' => $cid, 'title' => 'Roof', 'kw' => 3, 'cost' => 180000]);

// waiting for approval
$r = inc_row($admin, $cOff);
chk($r && $r['pending'] === 1 && $r['scheme'] === 1 && $r['amount'] == 0, 'won this month: waiting for approval');
chk(($r['preview']['company'] ?? 0) == 3000 && ($r['preview']['own'] ?? 0) == 9000 && ($r['preview']['pos'] ?? 0) === 1, 'approval preview: 1st company project 3 kW × ₹1,000; as own 3 kW × ₹3,000');
$ms = call($mira, 'comm', 'milestone');
chk($ms['_code'] === 200 && $ms['pending'] === 4 && $ms['company'] === 0 && $ms['tiers'] === [[2, 1000], [5, 2000], [null, 3000]], 'milestone: 4 waiting, no approved project yet, steps sent');
chk(call($mira, 'comm', 'list')['rows'] === [], 'staff see nothing before approval');
chk(call($acc, 'comm', 'approve', ['customer_id' => $cOff, 'lead_type' => 'office', 'ok' => 1])['_code'] === 403, 'only the admin approves');
chk(call($admin, 'comm', 'save', ['customer_id' => $cOff, 'visible' => 1])['_code'] === 409, 'a Visible click does not approve');
chk(call($admin, 'comm', 'approve', ['customer_id' => $cOff, 'lead_type' => 'bogus', 'ok' => 1])['_code'] === 400, 'approval needs a lead type');

// approve: amounts are calculated
$a = call($admin, 'comm', 'approve', ['customer_id' => $cOff, 'lead_type' => 'office', 'ok' => 1]);
chk($a['_code'] === 200 && $a['row']['amount'] == 3000 && $a['row']['auto'] === 1 && $a['row']['visible'] === 1 && strpos($a['row']['calc'], '1st Meta / Office project') !== false, 'approved office lead: 3 kW × ₹1,000 = ₹3,000, visible');
$a = call($admin, 'comm', 'approve', ['customer_id' => $cOwn, 'lead_type' => 'own', 'ok' => 1]);
chk($a['row']['amount'] == 9000 && strpos($a['row']['calc'], 'own lead') !== false, 'approved own lead: 3 kW × ₹3,000 = ₹9,000');
$a = call($admin, 'comm', 'approve', ['customer_id' => $cMeta, 'lead_type' => 'meta', 'ok' => 1]);
chk($a['row']['amount'] == 3000, 'approved Meta lead: 2nd company project still ₹1,000/kW');
$a = call($admin, 'comm', 'approve', ['customer_id' => $cDirect, 'lead_type' => 'office', 'ok' => 1]);
chk($a['row']['amount'] == 6000 && strpos($a['row']['calc'], '3rd') !== false && ($cust($cDirect)['lead_type'] ?? '') === 'office', 'admin corrects own → office on approval: 3rd company project, 3 kW × ₹2,000');
$ms = call($mira, 'comm', 'milestone');
chk($ms['company'] === 3 && $ms['own'] === 1 && $ms['pending'] === 0 && abs($ms['earned'] - 21000) < 0.01, 'milestone: 3 company + 1 own, ₹21,000 this month');
$mine = call($mira, 'comm', 'list');
chk(count($mine['rows']) === 4 && by_cid($mine['rows'], $cDirect)['calc'] !== '' && !array_key_exists('note', $mine['rows'][0]), 'staff see their approved incentives with the calculation');

// more company projects: steps 2 and 3
$more = [];
for ($i = 1; $i <= 4; $i++) {
  $cid = (int)(onb($mira, 'customers', 'save', ['name' => "Ms Step $i", 'phone' => '91000001' . str_pad($i, 2, '0', STR_PAD_LEFT), 'lead_type' => 'office'])['id'] ?? 0);
  call($admin, 'projects', 'save', ['customer_id' => $cid, 'title' => 'Roof', 'kw' => 1, 'cost' => 60000]);
  $more[] = $cid;
}
foreach ($more as $cid) call($admin, 'comm', 'approve', ['customer_id' => $cid, 'lead_type' => 'office', 'ok' => 1]);
$amt = array_map(fn($cid) => inc_row($admin, $cid)['amount'], $more);
chk($amt == [2000, 2000, 3000, 3000], '4th–5th company project ₹2,000/kW, 6th and 7th ₹3,000/kW (1 kW each)');

// order in the month decides; a later approval of an earlier customer moves the others up, until paid
$o = [];
for ($i = 1; $i <= 3; $i++) {
  $cid = (int)(onb($kiran, 'customers', 'save', ['name' => "Ms Order $i", 'phone' => '91000002' . $i, 'lead_type' => 'office'])['id'] ?? 0);
  call($admin, 'projects', 'save', ['customer_id' => $cid, 'title' => 'Roof', 'kw' => 2, 'cost' => 120000]);
  $o[] = $cid;
}
call($admin, 'comm', 'approve', ['customer_id' => $o[2], 'lead_type' => 'office', 'ok' => 1]);
chk(inc_row($admin, $o[2])['amount'] == 2000, 'approved alone: 1st of the month for Kiran');
call($admin, 'comm', 'save', ['customer_id' => $o[2], 'p1_amount' => 1000, 'p1_date' => date('Y-m-d'), 'p1_ref' => 'UTR-MS-1']);
call($admin, 'comm', 'approve', ['customer_id' => $o[0], 'lead_type' => 'office', 'ok' => 1]);
call($admin, 'comm', 'approve', ['customer_id' => $o[1], 'lead_type' => 'office', 'ok' => 1]);
chk(inc_row($admin, $o[2])['amount'] == 2000, 'part 1 paid: its amount is fixed even though it is now 3rd');
chk(inc_row($admin, $o[0])['amount'] == 2000 && inc_row($admin, $o[1])['amount'] == 2000, 'the earlier ones are 1st and 2nd');
call($admin, 'comm', 'save', ['customer_id' => $o[0], 'p1_amount' => '', 'p1_date' => '', 'p1_ref' => '']);
// kW change follows while unpaid
$pj = null; foreach (call($admin, 'projects', 'list') as $x) if (is_array($x) && (int)($x['customer_id'] ?? 0) === $o[0]) $pj = $x; // (the list has no customer filter)
if ($pj) { $pj['kw'] = 5; call($admin, 'projects', 'save', $pj); }
chk(inc_row($admin, $o[0])['amount'] == 5000, 'unpaid auto amount follows a kW change (5 kW × ₹1,000)');

// typed amount overrides; auto=1 goes back
$s = call($admin, 'comm', 'save', ['customer_id' => $o[1], 'amount' => 2500]);
chk($s['_code'] === 200 && $s['row']['auto'] === 0 && $s['row']['amount'] == 2500, 'admin types an amount: manual');
chk(inc_row($admin, $o[1])['amount'] == 2500, 'manual amount is not recalculated');
$s = call($admin, 'comm', 'save', ['customer_id' => $o[1], 'auto' => 1]);
chk($s['row']['auto'] === 1 && $s['row']['amount'] == 2000, 'back to the calculated amount');
chk(call($admin, 'comm', 'save', ['customer_id' => $o[1], 'p1_amount' => 99999, 'p1_date' => date('Y-m-d')])['_code'] === 400, 'cannot pay more than the calculated amount');
chk(inc_row($admin, $o[1])['p1_amount'] == 0, '…and nothing was saved');

// not eligible
$n = (int)(onb($kiran, 'customers', 'save', ['name' => 'Ms Not Eligible', 'phone' => '9100000300', 'lead_type' => 'own'])['id'] ?? 0);
call($admin, 'projects', 'save', ['customer_id' => $n, 'title' => 'Roof', 'kw' => 4, 'cost' => 200000]);
$a = call($admin, 'comm', 'approve', ['customer_id' => $n, 'lead_type' => 'office', 'ok' => 0]);
chk($a['_code'] === 200 && $a['row']['appr'] === 'no' && $a['row']['amount'] == 0, 'marked not eligible: no amount');
chk(by_cid(call($kiran, 'comm', 'list')['rows'], $n) === null, 'staff do not see a not-eligible customer');
chk(call($admin, 'comm', 'save', ['customer_id' => $n, 'amount' => 100])['_code'] === 409, 'not eligible: approve again before paying');
chk(call($admin, 'comm', 'approve', ['customer_id' => $o[2], 'lead_type' => 'office', 'ok' => 0])['_code'] === 400, 'cannot mark not eligible after part 1 is paid');

// a typed amount stays typed when the admin approves (here a BA's customer handed to a staff member)
$t = (int)(onb($ba, 'customers', 'save', ['name' => 'Ms Typed', 'phone' => '9100000500'])['id'] ?? 0);
call($admin, 'comm', 'save', ['customer_id' => $t, 'amount' => 7000]);
$a = call($admin, 'comm', 'approve', ['customer_id' => $t, 'user_id' => $ids['mskiran'], 'lead_type' => 'own', 'ok' => 1]);
chk($a['_code'] === 200 && $a['row']['amount'] == 7000 && $a['row']['auto'] === 0 && $a['row']['kind'] === 'incentive', 'approving keeps an amount typed before');

// milestone access
chk(call($kiran, 'comm', 'milestone', null, '&user_id=' . $ids['msmira'])['_code'] === 403, "staff cannot see someone else's milestone");
$mk = call($admin, 'comm', 'milestone', null, '&user_id=' . $ids['mskiran']);
chk($mk['_code'] === 200 && $mk['company'] === 3 && $mk['name'] === 'Kiran Sales', 'admin sees any staff milestone');
chk(call($ba, 'comm', 'milestone')['_code'] === 403, 'BA has no milestone');
chk(call($admin, 'comm', 'milestone', null, '&user_id=' . $ids['msba'])['_code'] === 404, 'no milestone for a BA user');
$old = call($mira, 'comm', 'milestone', null, '&month=2026-10');
chk($old['_code'] === 200 && $old['scheme'] === false && $old['company'] === 0, 'months before the scheme: no milestone');
// incentive manager: sees, cannot approve or pay a waiting customer
$perm = call($admin, 'settings', 'get')['roles_now']; $perm['accounts']['write'][] = 'incentive';
call($admin, 'settings', 'save', ['key' => 'role_perms', 'value' => $perm]);
$w = (int)(onb($mira, 'customers', 'save', ['name' => 'Ms Waiting', 'phone' => '9100000400', 'lead_type' => 'office'])['id'] ?? 0);
chk(call($acc, 'comm', 'save', ['customer_id' => $w, 'amount' => 500])['_code'] === 409, 'incentive manager: waiting customers need the admin first');
chk(call($acc, 'comm', 'milestone', null, '&user_id=' . $ids['msmira'])['_code'] === 200, "incentive manager sees a staff member's milestone");
call($admin, 'settings', 'save', ['key' => 'role_perms', 'value' => []]);

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
