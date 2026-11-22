<?php
// Tax bill drafts and final bills (owner, 2026-11-22): "Save as draft" keeps a bill without using an invoice number;
// finalising gives the number and removes the draft; once final only an admin may change the bill.
// Usage: php tests/tax_draft_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/'); $dbf = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/txdjar_' . $name . '_' . getmypid() . '.txt']; }
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
$db = fn($sql, $args = []) => (function () use ($dbf, $sql, $args) { $p = new PDO('sqlite:' . $dbf); $p->exec('PRAGMA busy_timeout=5000'); $s = $p->prepare($sql); $s->execute($args); return $s; })();

echo "Tax bill drafts\n";
$admin = actor('admin'); $staff = actor('staff');
$pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
/* staff = the accounts role, also allowed to edit customers, so it passes gen/save's own gates */
call($admin, 'admin', 'user_save', ['name' => 'Bill Staff', 'username' => 'txdstaff', 'role' => 'accounts', 'active' => 1, 'can_claim' => 0, 'password' => $pw]);
$rp = call($admin, 'settings', 'get')['roles_now'] ?? []; $rp['accounts']['write'][] = 'customers'; call($admin, 'settings', 'save', ['key' => 'role_perms', 'value' => $rp]);
chk(call($staff, 'auth', 'login', ['username' => 'txdstaff', 'password' => $pw])['_code'] === 200, 'staff signed in');

/* two customers with a 100000 plant: one with 40000 still due (bill locked), one to hold a clashing number */
$mk = function ($name, $phone) use ($admin) {
  $cid = (int)(call($admin, 'customers', 'save', ['name' => $name, 'phone' => $phone])['id'] ?? 0);
  $pid = (int)(call($admin, 'projects', 'save', ['customer_id' => $cid, 'title' => "$name plant", 'kw' => 3, 'cost' => 100000])['id'] ?? 0);
  return [$cid, $pid];
};
[$c1, $p1] = $mk('Draft Test One', '9000000701'); [$c2] = $mk('Draft Test Two', '9000000702');
call($admin, 'payments', 'save', ['project_id' => $p1, 'date' => '2026-11-05', 'amount' => 60000, 'mode' => 'UPI', 'ref_no' => 'TXD60000']);
$get = fn($cid, $who = null) => call($who ?: $admin, 'gen', 'get', null, "&kind=tax&customer_id=$cid");
$draft = fn($cid, $extra = [], $who = null) => call($who ?: $admin, 'gen', 'draft', array_merge(['kind' => 'tax', 'customer_id' => $cid, 'issued_on' => '2026-11-20', 'number' => '', 'data' => ['bill_name' => 'Draft Test One', 'grand' => 100000]], $extra));
$taxdRows = fn($cid) => (int)$db("SELECT COUNT(*) FROM gen_docs WHERE customer_id=? AND kind='taxd'", [$cid])->fetchColumn();

$g0 = $get($c1);
chk(array_key_exists('draft', $g0) && $g0['draft'] === null && $g0['doc'] === null && ($g0['lock']['locked'] ?? false) === true, 'a new bill: no draft, no bill, locked while 40000 is due');
$next0 = call($admin, 'gen', 'next', null, "&kind=tax&customer_id=$c1&date=2026-11-20")['number'] ?? '';

$d = $draft($c1);
chk($d['_code'] === 200 && ($d['draft']['number'] ?? 'x') === '' && ($d['draft']['data']['bill_name'] ?? '') === 'Draft Test One', 'a draft is saved while the payment is still due');
$g1 = $get($c1);
chk(($g1['draft']['issued_on'] ?? '') === '2026-11-20' && ($g1['draft']['data']['grand'] ?? 0) == 100000 && $g1['doc'] === null && ($g1['draft']['updated_by'] ?? '') === 'Boss', 'the bill opens from the draft');
chk((call($admin, 'gen', 'next', null, "&kind=tax&customer_id=$c1&date=2026-11-20")['number'] ?? '') === $next0, 'a draft uses no invoice number');
$d2 = $draft($c1, ['number' => 'TXD/TYPED/1', 'data' => ['bill_name' => 'Changed name', 'grand' => 99000]]);
$g2 = $get($c1);
chk($d2['_code'] === 200 && ($g2['draft']['number'] ?? '') === 'TXD/TYPED/1' && ($g2['draft']['data']['bill_name'] ?? '') === 'Changed name' && $taxdRows($c1) === 1, 'saving the draft again replaces it (one draft per customer, typed number kept)');
chk((int)$db("SELECT COUNT(*) FROM audit_log WHERE action='tax_bill_draft' AND entity_id=?", [$c1])->fetchColumn() >= 2, 'draft saves are audited');

/* the typed number is not reserved: another bill takes it, finalising this one is refused and the draft stays */
$o = call($admin, 'gen', 'save', ['kind' => 'tax', 'customer_id' => $c2, 'early' => 1, 'issued_on' => '2026-11-20', 'number' => 'TXD/TYPED/1', 'data' => ['grand' => 100000]]);
chk($o['_code'] === 200 && ($o['number'] ?? '') === 'TXD/TYPED/1', "another customer's bill can take the draft's typed number");
$f = call($admin, 'gen', 'save', ['kind' => 'tax', 'customer_id' => $c1, 'early' => 1, 'issued_on' => '2026-11-20', 'number' => 'TXD/TYPED/1', 'data' => ['grand' => 99000]]);
chk($f['_code'] === 409 && $taxdRows($c1) === 1 && $get($c1)['doc'] === null, 'finalising with a number already on another bill: 409, the draft stays');

/* finalise: the number is given, the draft is gone */
$f2 = call($admin, 'gen', 'save', ['kind' => 'tax', 'customer_id' => $c1, 'early' => 1, 'issued_on' => '2026-11-20', 'number' => '', 'data' => ['bill_name' => 'Changed name', 'grand' => 99000]]);
$g3 = $get($c1);
chk($f2['_code'] === 200 && ($f2['number'] ?? '') !== '' && ($g3['doc']['number'] ?? '') === $f2['number'] && array_key_exists('draft', $g3) && $g3['draft'] === null && $taxdRows($c1) === 0, 'finalising gives the number and removes the draft');
chk($draft($c1)['_code'] === 409 && $taxdRows($c1) === 0, 'no draft once the bill is final');

/* once final, only an admin changes it */
$s = call($staff, 'gen', 'save', ['kind' => 'tax', 'customer_id' => $c1, 'issued_on' => '2026-11-20', 'data' => ['bill_name' => 'Staff edit', 'grand' => 1]]);
chk($s['_code'] === 403 && ($get($c1)['doc']['data']['bill_name'] ?? '') === 'Changed name', 'staff cannot change a final bill (403, unchanged)');
chk(($get($c1, $staff)['_code'] ?? 0) === 200, 'staff still open the final bill');
$a = call($admin, 'gen', 'save', ['kind' => 'tax', 'customer_id' => $c1, 'issued_on' => '2026-11-20', 'data' => ['bill_name' => 'Admin fix', 'grand' => 99000]]);
chk($a['_code'] === 200 && ($a['number'] ?? '') === $f2['number'] && ($get($c1)['doc']['data']['bill_name'] ?? '') === 'Admin fix', 'an admin can change a final bill (same number)');
chk((int)$db("SELECT COUNT(*) FROM audit_log WHERE action='tax_bill_edit' AND entity_id=?", [$c1])->fetchColumn() === 1, 'the admin change is audited as tax_bill_edit');

/* a staff member may still draft a bill that is not final yet */
[$c3] = $mk('Draft Test Three', '9000000703');
chk($draft($c3, ['data' => ['bill_name' => 'Staff draft', 'show_seal' => 1]], $staff)['_code'] === 200 && empty($get($c3)['draft']['data']['show_seal']), "staff can save a draft (the seal tick is admin's only)");

call($admin, 'settings', 'save', ['key' => 'role_perms', 'value' => []]);
foreach ([$c1, $c2, $c3] as $cid) call($admin, 'customers', 'delete', ['id' => $cid, 'confirm' => 1]);
echo "  $pass passed, $fail failed\n";
exit($fail ? 1 : 0);
