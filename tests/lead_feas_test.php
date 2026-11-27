<?php
// Leads › Add to feasibility (owner's rule 2026-11-27): any user who can see a lead can put it on Finance › Feasibility fee; it stays a
// lead until the feasibility is marked paid (then it becomes a customer by itself) or someone converts it by hand.
// Usage: php tests/lead_feas_test.php http://localhost:8094
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/lfjar_' . $name . '_' . getmypid() . '.txt']; }
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
$lead = function ($who, $id) { foreach (call($who, 'leads', 'list') as $l) if (is_array($l) && (int)($l['id'] ?? 0) === $id) return $l; return null; };
$feasRow = function ($who, $name) { foreach (call($who, 'fees', 'list', null, '&kind=feasibility')['rows'] ?? [] as $r) if ($r['name'] === $name) return $r; return null; };

echo "Leads: add to feasibility, stays a lead until paid\n";
$admin = actor('admin'); $s1 = actor('sales'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$uid = (int)(call($admin, 'admin', 'user_save', ['name' => 'Sales Feas', 'username' => 'salesfeas', 'role' => 'sales', 'active' => 1, 'can_claim' => 1, 'password' => $pw])['id'] ?? 0);
chk($uid && call($s1, 'auth', 'login', ['username' => 'salesfeas', 'password' => $pw])['_code'] === 200, 'a sales user signed in');

$a = (int)(call($s1, 'leads', 'save', ['name' => 'Feas Lead A', 'phone' => '9000011101', 'city' => 'Kochi', 'lead_type' => 'own'])['id'] ?? 0);
$b = (int)(call($admin, 'leads', 'save', ['name' => 'Feas Lead B', 'phone' => '9000011102', 'city' => 'Kollam', 'lead_type' => 'office'])['id'] ?? 0);
$c = (int)(call($admin, 'leads', 'save', ['name' => 'Feas Lead C', 'phone' => '9000011103', 'lead_type' => 'office'])['id'] ?? 0);
call($s1, 'leads', 'claim', ['id' => $a]);
chk($a && $b && $c, 'three leads');

$r = call($s1, 'fees', 'lead_add', ['lead_id' => $a]);
chk($r['_code'] === 200 && (int)$r['added'] === 1, 'a sales user (no Finance access) adds a lead to feasibility');
chk((int)(call($s1, 'fees', 'lead_add', ['lead_id' => $a])['added'] ?? 9) === 0, 'adding it again adds nothing');
$l = $lead($s1, $a);
chk($l && !$l['customer_id'] && $l['feas'] !== null && (int)$l['feas'] === 0, 'it stays a lead, marked as on the feasibility list');
chk(call($s1, 'fees', 'list', null, '&kind=feasibility')['_code'] === 403, 'the sales user still cannot open the Finance list');
$fa = $feasRow($admin, 'Feas Lead A');
chk($fa && (int)$fa['is_lead'] === 1 && $fa['phone'] === '9000011101' && $fa['district'] === 'Kochi', 'Finance › Feasibility fee shows the lead');
chk($lead($admin, $b)['feas'] === null, 'a lead not on the list has feas = null');

call($admin, 'customers', 'save', ['name' => 'Feas Direct', 'phone' => '9000011109']);
$names = array_column(call($admin, 'fees', 'candidates', null, '&kind=feasibility'), 'name');
chk(in_array('Feas Direct', $names, true), 'Add customers still lists customers while a lead row is on the list');

// demanded on a lead row: no conversion
chk(call($admin, 'fees', 'set', ['id' => $fa['id'], 'demanded' => 1, 'demanded_on' => date('Y-m-d')])['_code'] === 200 && !$lead($admin, $a)['customer_id'], 'marking demanded keeps it a lead');

// paid → customer
$r = call($admin, 'fees', 'set', ['id' => $fa['id'], 'paid' => 1, 'paid_on' => date('Y-m-d'), 'amount' => 1500]);
$la = $lead($admin, $a);
chk($r['_code'] === 200 && (int)($r['converted'] ?? 0) > 0 && (int)$la['customer_id'] === (int)$r['converted'] && $la['status'] === 'Won', 'marking the feasibility paid makes the lead a customer');
$cu = call($admin, 'customers', 'get', null, '&id=' . (int)$r['converted']);
chk(($cu['name'] ?? '') === 'Feas Lead A' && (int)($cu['owner_id'] ?? 0) === $uid, 'the customer is owned by the sales user who claimed the lead');
$fa2 = $feasRow($admin, 'Feas Lead A');
chk($fa2 && (int)$fa2['is_lead'] === 0 && (int)$fa2['customer_id'] === (int)$r['converted'] && (int)$fa2['paid'] === 1, 'the list row is now the customer, paid');
$left = call($admin, 'fees', 'feas_left');
chk(isset($left[(string)$r['converted']]) || isset($left[(int)$r['converted']]), 'the AF clock runs for the new customer');

// manual conversion moves the row
call($admin, 'fees', 'lead_add', ['lead_id' => $b]);
$cv = call($admin, 'leads', 'convert', ['id' => $b, 'plant_cost' => '250000', 'no_quote' => '1']);
$fb = $feasRow($admin, 'Feas Lead B');
chk((int)($cv['customer_id'] ?? 0) > 0 && $fb && (int)$fb['customer_id'] === (int)$cv['customer_id'] && (int)$fb['is_lead'] === 0 && (int)$fb['paid'] === 0, 'Convert to customer takes the unpaid feasibility row along');

// remove a lead row
call($admin, 'fees', 'lead_add', ['lead_id' => $c]);
$fc = $feasRow($admin, 'Feas Lead C');
chk($fc && call($admin, 'fees', 'remove', ['id' => $fc['id']])['_code'] === 200 && !$feasRow($admin, 'Feas Lead C') && !$lead($admin, $c)['customer_id'], 'a lead row can be removed; the lead stays');

// dashboard tile counts the lead rows
call($admin, 'fees', 'lead_add', ['lead_id' => $c]);
$due = array_column(call($admin, 'dashboard', 'get')['fees_due'] ?? [], 'customer');
chk(in_array('Feas Lead C', $due, true), 'the dashboard "Feasibility fee pending" tile includes leads');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
