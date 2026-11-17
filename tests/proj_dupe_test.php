<?php
// One project per customer until work really starts on a second one; duplicates already made are merged;
// a fee marked paid in Finance shows as done on the pipeline.
// Usage: php tests/proj_dupe_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/pdjar_' . $name . '_' . getmypid() . '.txt']; }
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

echo "Projects: no duplicates, fees and pipeline agree\n";
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$db->exec('PRAGMA busy_timeout=5000');
$cust = fn($name) => (int)(call($admin, 'customers', 'save', ['name' => $name, 'phone' => '9' . random_int(100000000, 999999999)])['id'] ?? 0);
$n = fn($cid) => (int)$db->query("SELECT COUNT(*) FROM projects WHERE customer_id=$cid")->fetchColumn();
$proj = fn($pid) => $db->query('SELECT * FROM projects WHERE id=' . (int)$pid)->fetch();
$pend = fn($pid) => json_decode($proj($pid)['pending'] ?: '[]', true);
$move = fn($pid, $to) => call($admin, 'pipeline', 'move', ['id' => $pid, 'stage' => $to]);

/* 1. the automatic project (first payment) + "Start a project" = one project */
$c1 = $cust('Dupe One Test');
$a = call($admin, 'pipeline', 'ensure', ['customer_id' => $c1]);
chk((int)($a['created'] ?? 0) === 1 && $n($c1) === 1, 'the first payment puts the customer on the pipeline');
$s = call($admin, 'pipeline', 'start', ['customer_id' => $c1, 'kw' => 3, 'title' => '3KW TEST PLANT', 'loan' => 'Yes', 'engineer' => 'Anu']);
chk($s['_code'] === 200 && (int)$s['id'] === (int)$a['id'] && $n($c1) === 1, 'Start a project fills in the project already there instead of adding a second one');
$p = $proj($a['id']);
chk($p['title'] === '3KW TEST PLANT' && (float)$p['kw'] === 3.0 && $p['loan'] === 'Yes' && $p['engineer'] === 'Anu' && $p['stage'] === 'Customer', 'with the title, size, loan and engineer typed');
$g = call($admin, 'projects', 'save', ['customer_id' => $c1, 'title' => 'Typed again', 'kw' => 3]);
chk($g['_code'] === 200 && (int)$g['id'] === (int)$a['id'] && $n($c1) === 1 && $proj($a['id'])['title'] === 'Typed again', 'New project (Projects page) does the same');
/* work has started on it: a second project is a real second project */
$move($a['id'], 'KSEB feasibility check');
$s2 = call($admin, 'pipeline', 'start', ['customer_id' => $c1, 'kw' => 5, 'title' => 'Second plant']);
chk($s2['_code'] === 200 && (int)$s2['id'] !== (int)$a['id'] && $n($c1) === 2, 'once work has started, a second project can still be added');
/* two projects started by hand, one after the other (house and shop): both stay */
$c6 = $cust('Dupe Six Test');
$h1 = (int)call($admin, 'pipeline', 'start', ['customer_id' => $c6, 'kw' => 3, 'title' => 'House'])['id'];
$h2 = (int)call($admin, 'pipeline', 'start', ['customer_id' => $c6, 'kw' => 5, 'title' => 'Shop'])['id'];
chk($h1 && $h2 && $h1 !== $h2 && $n($c6) === 2, 'two projects started by hand stay two projects');

/* 2. duplicates made before this rule are merged */
$c2 = $cust('Dupe Two Test');
$db->exec("INSERT INTO projects(customer_id,title,kw,stage,cost) VALUES($c2,'3 kWp solar plant',3,'Customer',225000)"); $blank = (int)$db->lastInsertId();
$db->exec("INSERT INTO project_steps(project_id,stage,note,user) VALUES($blank,'Customer','Added to the pipeline with the first payment','Boss')");
$db->exec("INSERT INTO payments(project_id,date,amount,mode,note) VALUES($blank,'2026-11-01',50000,'UPI','advance')");
$db->exec("INSERT INTO notes(entity,entity_id,text,user) VALUES('projects',$blank,'call before visit','Boss')");
$db->exec("INSERT INTO projects(customer_id,title,kw,stage,cost,pending) VALUES($c2,'3KW REAL PLANT',3,'Material delivery',0,'[\"feas_pay\"]')"); $real = (int)$db->lastInsertId();
$db->exec("INSERT INTO project_steps(project_id,stage,note,user) VALUES($real,'Customer','Project started','Boss'),($real,'Material delivery','','Boss')");
/* two real projects of another customer are left alone */
$c3 = $cust('Dupe Three Test');
$db->exec("INSERT INTO projects(customer_id,title,kw,stage) VALUES($c3,'House',3,'Structure installation'),($c3,'Shop',5,'KSEB feasibility check')");
$scan = call($admin, 'pipeline', 'dupes', ['dry' => 1]);
$hit = array_values(array_filter($scan['merged'] ?? [], fn($x) => (int)$x['customer_id'] === $c2));
chk($scan['_code'] === 200 && count($hit) === 1 && (int)$hit[0]['from'] === $blank && (int)$hit[0]['into'] === $real && $n($c2) === 2, 'the scan lists the duplicate without changing anything');
chk(!array_filter($scan['merged'] ?? [], fn($x) => in_array((int)$x['customer_id'], [$c1, $c3, $c6], true)), 'customers with two real projects are not listed');
$mg = call($admin, 'pipeline', 'dupes', []);
chk($mg['_code'] === 200 && $n($c2) === 1 && $proj($real) && !$proj($blank), 'the merge keeps the project that is being worked on');
chk((int)$db->query("SELECT COUNT(*) FROM payments WHERE project_id=$real AND amount=50000")->fetchColumn() === 1, 'its payment moves to the kept project');
chk((int)$db->query("SELECT COUNT(*) FROM notes WHERE entity='projects' AND entity_id=$real")->fetchColumn() === 1, 'and its note');
chk((float)$proj($real)['cost'] === 225000.0, 'the project value is kept when the kept project had none');
chk($proj($real)['stage'] === 'Material delivery' && $n($c3) === 2 && $n($c1) === 2 && $n($c6) === 2, 'nothing else changes');
chk((int)$db->query("SELECT COUNT(*) FROM trash WHERE label LIKE '%3 kWp solar plant%'")->fetchColumn() === 1, 'the removed duplicate is in the Recycle bin');
chk(($x = call($admin, 'pipeline', 'dupes', ['dry' => 1])) && ($x['merged'] ?? null) === [], 'a second scan finds nothing');

/* 3. a fee marked paid in Finance is done on the pipeline */
chk($pend($real) === ['feas_pay'], 'the feasibility payment was left for later');
call($admin, 'fees', 'add', ['kind' => 'feasibility', 'customer_ids' => [$c2]]);
$fid = (int)$db->query("SELECT id FROM fees WHERE customer_id=$c2 AND kind='feasibility'")->fetchColumn();
$board = function ($pid) use ($admin) { return array_values(array_filter(call($admin, 'pipeline', 'board')['projects'] ?? [], fn($x) => (int)$x['id'] === $pid))[0] ?? null; };
chk($board($real)['receipts']['feas_pay'] === false, 'not paid yet on the pipeline');
$f = call($admin, 'fees', 'set', ['id' => $fid, 'paid' => 1, 'paid_on' => '2026-11-10', 'amount' => 1180]);
chk($f['_code'] === 200 && $pend($real) === [], 'marked paid in Finance → no longer "still to do" on the pipeline');
chk($board($real)['receipts']['feas_pay'] === true, 'and shown as paid on the pipeline list');
chk((int)$db->query("SELECT COUNT(*) FROM project_steps WHERE project_id=$real AND stage='KSEB feasibility payment'")->fetchColumn() === 1, 'the project history records it');
$tl = call($admin, 'profile', 'timeline', null, "&customer_id=$c2");
$st = array_values(array_filter($tl['progress'][0]['stages'] ?? [], fn($s) => $s['label'] === 'KSEB feasibility payment'))[0] ?? [];
chk(count($tl['progress'] ?? []) === 1 && ($st['paid'] ?? '') === '2026-11-10', 'the customer profile shows one project with the payment date');
call($admin, 'fees', 'set', ['id' => $fid, 'paid' => 0]);
chk($pend($real) === ['feas_pay'] && $board($real)['receipts']['feas_pay'] === false, 'marked not paid → still to do again');
/* a project standing on the payment step: paid in Finance, moving on leaves nothing behind */
$c4 = $cust('Dupe Four Test'); $p4 = (int)call($admin, 'pipeline', 'start', ['customer_id' => $c4, 'kw' => 3, 'loan' => 'No'])['id'];
$move($p4, 'KSEB feasibility check'); $move($p4, 'KSEB feasibility payment');
call($admin, 'fees', 'add', ['kind' => 'feasibility', 'customer_ids' => [$c4]]);
call($admin, 'fees', 'set', ['id' => (int)$db->query("SELECT id FROM fees WHERE customer_id=$c4 AND kind='feasibility'")->fetchColumn(), 'paid' => 1, 'paid_on' => date('Y-m-d')]);
$m = $move($p4, 'KSEB registration fee payment');
chk($m['_code'] === 200 && $m['left'] === [] && $pend($p4) === [], 'a fee paid in Finance is not left for later when the project moves on');
/* paid before the project reaches the step: shown on the profile, the stage stays where it is */
$c5 = $cust('Dupe Five Test'); $p5 = (int)call($admin, 'pipeline', 'start', ['customer_id' => $c5, 'kw' => 3])['id'];
call($admin, 'fees', 'add', ['kind' => 'registration', 'customer_ids' => [$c5]]);
call($admin, 'fees', 'set', ['id' => (int)$db->query("SELECT id FROM fees WHERE customer_id=$c5 AND kind='registration'")->fetchColumn(), 'paid' => 1, 'paid_on' => '2026-11-12']);
$tl = call($admin, 'profile', 'timeline', null, "&customer_id=$c5");
$st = array_values(array_filter($tl['progress'][0]['stages'] ?? [], fn($s) => $s['label'] === 'KSEB registration fee payment'))[0] ?? [];
chk(($st['paid'] ?? '') === '2026-11-12' && $proj($p5)['stage'] === 'Customer', 'a fee paid ahead of the pipeline shows as paid without moving the project');

/* only the admin merges */
chk(call(actor('nobody'), 'pipeline', 'dupes', ['dry' => 1])['_code'] === 401, 'the scan needs sign-in');

echo "  $pass ok, $fail FAIL\n";
exit($fail ? 1 : 0);
