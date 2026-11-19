<?php
// Workflow helpers: "this phone is already in the CRM" (leads/same, customers/same) and "move to the next step?" (pipeline/next).
// Usage: php tests/workflow_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { $j = sys_get_temp_dir() . '/wfjar_' . $name . '_' . getmypid() . '.txt'; @unlink($j); return ['jar' => $j]; }
function call($who, $m, $a, $body = null, $qs = '') {
  global $base;
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs");
  $h = ['X-Solarize: 1'];
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar']]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POST, true); $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = [];
  $j['_code'] = $code; return $j;
}
echo "Workflow: same phone, next step\n";
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$tag = bin2hex(random_bytes(3));
$mk = function ($name, $un, $role) use ($admin, $pw) { $id = (int)(call($admin, 'admin', 'user_save', ['name' => $name, 'username' => $un, 'role' => $role, 'active' => 1, 'can_claim' => 1, 'password' => $pw])['id'] ?? 0); $a = actor($un); call($a, 'auth', 'login', ['username' => $un, 'password' => $pw]); return [$id, $a]; };
[$s1Id, $s1] = $mk('Wf Seller One', 'wfs1' . $tag, 'sales'); [$s2Id, $s2] = $mk('Wf Seller Two', 'wfs2' . $tag, 'sales'); [$baId, $ba] = $mk('Wf Partner', 'wfba' . $tag, 'ba');
chk($s1Id && $s2Id && $baId, 'two sales users and a Business Associate are in place');
$ph = '98' . str_pad((string)random_int(0, 99999999), 8, '0', STR_PAD_LEFT); /* a made-up number */

/* --- same phone --- */
chk(call($s1, 'leads', 'same', ['phone' => $ph])['rows'] === [], 'a number nobody has: nothing to warn about');
chk(call($s1, 'leads', 'same', ['phone' => '12345'])['rows'] === [], 'a number still being typed (under 10 digits) is not looked up');
$lid = (int)(call($s1, 'leads', 'save', ['name' => 'Wf Lead ' . $tag, 'phone' => '+91 ' . substr($ph, 0, 5) . ' ' . substr($ph, 5), 'lead_type' => 'own'])['id'] ?? 0);
chk($lid > 0, 'seller one adds a lead (typed with +91 and a space)');
$r = call($s2, 'leads', 'same', ['phone' => $ph]); $x = $r['rows'][0] ?? [];
chk(count($r['rows'] ?? []) === 1 && $x['type'] === 'lead' && $x['id'] === $lid && $x['name'] === 'Wf Lead ' . $tag && $x['owner'] === 'Wf Seller One' && $x['open'] === 0, 'seller two typing the same number is told whose lead it is, and cannot open it');
$r = call($s2, 'customers', 'same', ['phone' => '0' . $ph]);
chk(($r['rows'][0]['id'] ?? 0) === $lid, 'the customer form gets the same warning (number typed with a leading 0)');
chk(call($s1, 'leads', 'same', ['phone' => $ph, 'skip_lead' => $lid])['rows'] === [], 'editing that lead itself: no warning about itself');
chk((call($s1, 'leads', 'same', ['phone' => $ph])['rows'][0]['open'] ?? 0) === 1 && (call($admin, 'leads', 'same', ['phone' => $ph])['rows'][0]['open'] ?? 0) === 1, 'its owner and the admin may open it');
$r = call($ba, 'leads', 'same', ['phone' => $ph]); $x = $r['rows'][0] ?? [];
chk(count($r['rows'] ?? []) === 1 && $x['type'] === 'lead' && $x['id'] === 0 && $x['name'] === '' && $x['owner'] === '', 'a Business Associate only learns that the number is already in the CRM');
$cid = (int)(call($admin, 'customers', 'save', ['name' => 'Wf Customer ' . $tag, 'phone' => '9000000000', 'alt_phone' => $ph, 'lead_type' => 'office', 'no_quote' => 1, 'plant_cost' => 150000])['id'] ?? 0);
$r = call($s2, 'leads', 'same', ['phone' => $ph]); $types = array_column($r['rows'] ?? [], 'type');
chk($cid > 0 && $types === ['customer', 'lead'] && $r['rows'][0]['id'] === $cid && $r['rows'][0]['open'] === 1, 'a customer with that number (as second phone) is listed first, and staff can open it');
chk(call($admin, 'customers', 'same', ['phone' => $ph, 'skip_customer' => $cid, 'skip_lead' => $lid])['rows'] === [], 'both skipped: nothing');

/* --- next step --- */
$labels = fn() => array_column(call($admin, 'pipeline', 'board')['stages'] ?? [], 1, 0);
$L = $labels();
$pid = (int)(call($admin, 'pipeline', 'start', ['customer_id' => $cid, 'kw' => 3, 'loan' => 'No'])['id'] ?? 0);
chk($pid > 0, 'the customer has a project');
$next = fn($who, $key, $by = null) => call($who, 'pipeline', 'next', null, ($by ?? "&customer_id=$cid") . "&key=$key");
chk(empty($next($admin, 'feas_pay')['id']), 'project at "Customer": recording the feasibility payment offers nothing');
call($admin, 'pipeline', 'move', ['id' => $pid, 'stage' => $L['feas_pay'], 'skip' => 1]);
chk(empty($next($admin, 'feas_pay')['id']), 'at the feasibility payment step but not paid yet: nothing');
$fid = (int)(call($admin, 'fees', 'add', ['kind' => 'feasibility', 'customer_ids' => [$cid]])['added'] ?? 0);
$fee = array_values(array_filter(call($admin, 'fees', 'list', null, '&kind=feasibility')['rows'] ?? [], fn($f) => (int)$f['customer_id'] === $cid))[0] ?? [];
call($admin, 'fees', 'set', ['id' => $fee['id'] ?? 0, 'paid' => 1, 'paid_on' => date('Y-m-d'), 'amount' => 1000]);
$o = $next($admin, 'feas_pay');
chk(($o['id'] ?? 0) === $pid && $o['from'] === $L['feas_pay'] && $o['to'] === $L['reg_pay'] && $o['customer'] === 'Wf Customer ' . $tag, 'fee marked paid in Finance: the offer is the registration fee step');
chk(($next($admin, 'feas_pay', "&project_id=$pid")['id'] ?? 0) === $pid, 'the same offer when asked by project');
$st = fn() => (string)(array_values(array_filter(call($admin, 'pipeline', 'board')['projects'] ?? [], fn($p) => (int)$p['id'] === $pid))[0]['stage'] ?? '');
chk($st() === $L['feas_pay'], 'asking moves nothing: the project is still at the feasibility payment');
chk(empty($next($admin, 'reg_pay')['id']) && empty($next($admin, 'nope')['id']) && empty($next($admin, 'completed')['id']), 'another step, an unknown step and the last step offer nothing');
chk(empty($next($ba, 'feas_pay')['id']), 'a Business Associate (no edit on projects) gets no offer');
call($admin, 'pipeline', 'move', ['id' => $pid, 'stage' => $o['to']]);
chk($st() === $L['reg_pay'] && empty($next($admin, 'feas_pay')['id']), 'after saying yes the project is at the next step and the offer is gone');
/* the optional loan step is passed over for a project without a loan */
call($admin, 'pipeline', 'move', ['id' => $pid, 'stage' => $L['feasibility'], 'skip' => 1]);
chk(($next($admin, 'feasibility')['to'] ?? '') === $L['feas_pay'], 'no loan: after the feasibility check the offer skips "Loan registration"');

/* --- remark history: the leads list carries the number of entries (shown on the history button) --- */
$rl = (int)(call($s1, 'leads', 'save', ['name' => 'Wf Remark ' . $tag, 'phone' => '9000000' . random_int(100, 999), 'lead_type' => 'own'])['id'] ?? 0);
$rmN = fn() => (int)(array_values(array_filter(call($s1, 'leads', 'list'), fn($l) => is_array($l) && (int)($l['id'] ?? 0) === $rl))[0]['rm_n'] ?? -1);
chk($rl && $rmN() === 0, 'a lead without a remark: no history entries');
$lead = call($s1, 'leads', 'get', null, '&id=' . $rl);
call($s1, 'leads', 'save', ['remark' => 'Called, asked to ring back'] + $lead); call($s1, 'leads', 'save', ['remark' => 'Called, asked to ring back'] + $lead);
chk($rmN() === 1, 'the first remark is one entry; saving it again unchanged adds none');
call($s1, 'leads', 'save', ['remark' => 'Site visit on Friday'] + $lead); call($s1, 'leads', 'save', ['remark' => ''] + $lead);
chk($rmN() === 3 && count(call($s1, 'leads', 'remarks', null, '&id=' . $rl)['rows'] ?? []) === 3, 'changed and then removed: three entries, the same number the history shows');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
