<?php
// Project steps are a guide, not a lock: a step can be left for later and done afterwards.
// Usage: php tests/pipe_flex_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/pfjar_' . $name . '_' . getmypid() . '.txt']; }
function call($who, $m, $a, $body = null, $qs = '', $multi = false) {
  global $base;
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs");
  $h = ['X-Solarize: 1'];
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar']]);
  if ($body !== null) { curl_setopt($ch, CURLOPT_POST, true);
    if ($multi) curl_setopt($ch, CURLOPT_POSTFIELDS, $body); else { $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); } }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $txt = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $j = json_decode((string)$txt, true); if (!is_array($j)) $j = ['_text' => $txt];
  $j['_code'] = $code; return $j;
}

echo "Pipeline: steps can be left for later\n";
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$db->exec('PRAGMA busy_timeout=5000');

$B = call($admin, 'pipeline', 'board'); $keys = array_column($B['stages'] ?? [], 0);
chk(array_search('reg_pay', $keys, true) === array_search('feas_pay', $keys, true) + 1 && array_search('pmsg', $keys, true) === array_search('reg_pay', $keys, true) + 1, 'the registration fee payment comes right after the feasibility payment');

$mk = function ($name, $loan = '') use ($admin) {
  $cid = (int)(call($admin, 'customers', 'save', ['name' => $name, 'phone' => '9' . random_int(100000000, 999999999)])['id'] ?? 0);
  return (int)(call($admin, 'pipeline', 'start', ['customer_id' => $cid, 'kw' => 3, 'loan' => $loan])['id'] ?? 0);
};
$proj = fn($pid) => $db->query('SELECT stage, pending FROM projects WHERE id=' . (int)$pid)->fetch();
$pend = fn($pid) => json_decode($proj($pid)['pending'] ?: '[]', true);
$move = fn($pid, $to, $x = []) => call($admin, 'pipeline', 'move', ['id' => $pid, 'stage' => $to] + $x);
$pdf = sys_get_temp_dir() . '/pf_receipt_' . getmypid() . '.pdf';
file_put_contents($pdf, "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
$receipt = fn($pid, $key) => call($admin, 'pipeline', 'receipt', ['project_id' => $pid, 'stage' => $key, 'amount' => '1000', 'date' => date('Y-m-d'), 'ref' => 'T1', 'file' => new CURLFile($pdf, 'application/pdf', 'receipt.pdf')], '', true);

/* one step at a time: nothing is left behind */
$p = $mk('Flex One Test');
$m = $move($p, 'KSEB feasibility check');
chk($m['_code'] === 200 && $m['left'] === [] && $pend($p) === [], 'moving to the next step leaves nothing behind');
$move($p, 'Loan registration'); $move($p, 'KSEB feasibility payment');

/* a payment step without its receipt no longer blocks: it is left for later */
$m = $move($p, 'KSEB registration fee payment');
chk($m['_code'] === 200 && $m['left'] === ['KSEB feasibility payment'] && $pend($p) === ['feas_pay'], 'moving past a payment step without a receipt is allowed and keeps it as still to do');
$m = $move($p, 'Material delivery');
chk($m['_code'] === 200 && $pend($p) === ['feas_pay', 'reg_pay', 'pmsg'] && $proj($p)['stage'] === 'Material delivery', 'jumping ahead keeps every step jumped over as still to do');
chk(call($admin, 'pipeline', 'step_done', ['id' => $p, 'key' => 'reg_pay'])['_code'] === 409, 'a payment step is not marked done without its receipt');
$d = call($admin, 'pipeline', 'step_done', ['id' => $p, 'key' => 'pmsg']);
chk($d['_code'] === 200 && $pend($p) === ['feas_pay', 'reg_pay'], 'a step left for later can be marked done');
chk((int)$db->query("SELECT COUNT(*) FROM project_steps WHERE project_id=$p AND stage='PMSG portal registration'")->fetchColumn() === 1, 'and the history records when');
$u = $receipt($p, 'reg_pay');
chk($u['_code'] === 200 && $pend($p) === ['feas_pay'], 'uploading the receipt marks a payment step done');
$bp = array_values(array_filter($B = call($admin, 'pipeline', 'board')['projects'] ?? [], fn($x) => (int)$x['id'] === $p))[0] ?? null;
chk($bp && $bp['pending'] === ['feas_pay'] && $bp['receipts']['reg_pay'] === true, 'the pipeline list carries what is still to do');

/* skip the step being worked on */
$m = $move($p, 'Structure installation', ['skip' => 1]);
chk($m['left'] === ['Material delivery'] && $pend($p) === ['feas_pay', 'delivery'], '"Skip for now" keeps the current step as still to do');
/* moving back: steps from there on are simply not reached yet */
$move($p, 'KSEB registration fee payment');
chk($pend($p) === ['feas_pay'] && $proj($p)['stage'] === 'KSEB registration fee payment', 'moving back forgets the later steps that were left');
/* a receipt uploaded early: the step is not left for later when passed */
$p2 = $mk('Flex Two Test', 'No');
$receipt($p2, 'feas_pay'); $receipt($p2, 'reg_pay');
$m = $move($p2, 'Material delivery');
chk($pend($p2) === ['feasibility', 'pmsg'], 'a paid step and Loan registration (no loan) are not left for later');
/* completing with steps open is allowed; they stay listed */
$m = $move($p2, 'Project completed');
chk($m['_code'] === 200 && $proj($p2)['stage'] === 'Project completed' && in_array('pmsg', $pend($p2), true), 'a project can be completed with steps still to do');
chk($move($p2, 'No such stage')['_code'] === 400, 'an unknown stage is refused');
chk(call($admin, 'pipeline', 'step_done', ['id' => $p2, 'key' => 'nope'])['_code'] === 400, 'an unknown step is refused');

/* feasibility days left: shown while the feasibility is paid and the registration fee is not */
$p3 = $mk('Flex Three Test'); $c3 = (int)$db->query("SELECT customer_id FROM projects WHERE id=$p3")->fetchColumn();
chk(!isset(call($admin, 'fees', 'feas_left')[$c3]), 'no feasibility clock before the feasibility is paid');
$receipt($p3, 'feas_pay');
$fl = call($admin, 'fees', 'feas_left')[$c3] ?? null;
chk($fl && (int)$fl['days_left'] === 30 && $fl['expires'] === date('Y-m-d', strtotime('+30 days')) && !isset($fl['amount']), 'feasibility paid today → 30 days left, dates only');
$db->exec("UPDATE fees SET paid_on='" . date('Y-m-d', strtotime('-33 days')) . "' WHERE customer_id=$c3 AND kind='feasibility'");
chk((int)(call($admin, 'fees', 'feas_left')[$c3]['days_left'] ?? 0) === -3, 'past the 30 days it counts the days since it expired');
$receipt($p3, 'reg_pay');
$fl = call($admin, 'fees', 'feas_left')[$c3] ?? null;
chk($fl && (int)($fl['rf'] ?? 0) === 1 && $fl['rf_on'] === date('Y-m-d') && !isset($fl['days_left']), 'once the registration fee is paid it says RF paid instead of the days left');
chk(call(actor('nobody'), 'fees', 'feas_left')['_code'] === 401, 'feasibility days left needs sign-in');
@unlink($pdf);

echo "  $pass ok, $fail FAIL\n";
exit($fail ? 1 : 0);
