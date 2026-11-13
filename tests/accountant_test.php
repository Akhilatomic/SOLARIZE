<?php
// The Accountant role: the company's outside accountant sees the Accounts page only, to read and export; nothing else, and no changes.
// Usage: php tests/accountant_test.php http://localhost:8094
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/cajar_' . $name . '_' . getmypid() . '.txt']; }
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

echo "Accountant role\n";
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$s = call($admin, 'settings', 'get');
chk(($s['role_names']['accountant'] ?? '') !== '', 'Accountant is a role the admin can give a user');
$u = call($admin, 'admin', 'user_save', ['name' => 'Ca Person', 'username' => 'caperson', 'role' => 'accountant', 'active' => 1, 'can_claim' => 1, 'password' => $pw]);
$ca = actor('ca'); $li = call($ca, 'auth', 'login', ['username' => 'caperson', 'password' => $pw]);
chk($u['_code'] === 200 && $li['_code'] === 200, 'an accountant is created and signs in');
$me = call($ca, 'auth', 'status');
$perm = $me['user']['perms'] ?? $me['perms'] ?? $me['me']['perms'] ?? null;
$P = '&period=2026-11';
$ok = 0; foreach ([['ac_overview', $P], ['ac_books', ''], ['ac_book', $P . '&book=0'], ['ac_dues', ''], ['ac_gst', $P], ['ac_salary', $P], ['ac_received', $P], ['ac_expenses', $P], ['ac_pending', '']] as [$a, $q]) if (call($ca, 'acc', $a, null, $q)['_code'] === 200) $ok++;
chk($ok === 9, 'the bookkeeping pages can be read (and so exported)');
$hid = 0; foreach ([['ac_profit', $P], ['ac_pl', $P], ['ac_materials', ''], ['ac_track', ''], ['ac_cost', '&project_id=1'], ['ac_tpls', '']] as [$a, $q]) if (call($ca, 'acc', $a, null, $q)['_code'] === 403) $hid++;
$ovw = call($ca, 'acc', 'ac_overview', null, $P);
chk($hid === 6 && array_key_exists('profit', $ovw) && $ovw['profit'] === null && call($admin, 'acc', 'ac_overview', null, $P)['profit'] !== null && call($admin, 'acc', 'ac_pl', null, $P)['_code'] === 200, 'project profit, profit and loss, cost sheets, price list and tracking are not shown to the accountant; the admin still sees them');
$no = 0; foreach ([['customers', 'list'], ['leads', 'list'], ['projects', 'list'], ['dashboard', 'get'], ['quotes', 'list'], ['fees', 'list'], ['hr', 'today'], ['calendar', 'upcoming'], ['folder', 'list']] as [$m, $a]) if (call($ca, $m, $a)['_code'] === 403) $no++;
chk($no === 9, 'nothing outside Accounts can be opened, even with “can see and claim leads” ticked');
$w = 0; foreach ([['txn_save', ['date' => '2026-11-13', 'cat' => 'other_in', 'amount' => 5, 'book_id' => 1]], ['salary_save', ['name' => 'x', 'kind' => 'Salary', 'date' => '2026-11-13', 'amount' => 5, 'book_id' => 1]], ['spay_save', ['supplier' => 'x', 'date' => '2026-11-13', 'amount' => 5, 'book_id' => 1]],
  ['bill_save', ['supplier' => 'x', 'date' => '2026-11-13', 'amount' => 5]], ['book_save', ['name' => 'Ca Bank', 'kind' => 'bank']], ['expense_save', ['date' => '2026-11-13', 'cat' => 'Other', 'amount' => 5]], ['material_save', ['grp' => 'Solar panels', 'name' => 'Ca Item']],
  ['supplier_save', ['name' => 'Ca Supplier']], ['ads_book_save', ['book' => 0]]] as [$a, $b]) if (call($ca, 'acc', $a, $b)['_code'] === 403) $w++;
chk($w === 9, 'the accountant cannot change anything in Accounts');
/* the admin cannot widen the role beyond Accounts; Edit on Accounts is the admin's to give */
$keep = array_diff_key((array)($s['role_perms'] ?? []), ['_modules' => 1, 'accountant' => 1]); /* the other roles' saved access is sent back unchanged */
$sv = call($admin, 'settings', 'save', ['key' => 'role_perms', 'value' => $keep + ['accountant' => ['read' => ['accounts', 'customers', 'leads', 'finance'], 'write' => ['accounts', 'customers']]]]);
if ($sv['_code'] === 200) {
  chk(call($ca, 'customers', 'list')['_code'] === 403 && call($ca, 'leads', 'list')['_code'] === 403, 'ticking other areas for the Accountant has no effect');
  $bk = call($ca, 'acc', 'book_save', ['name' => 'Ca Test Account', 'kind' => 'bank']);
  chk($bk['_code'] === 200, 'Edit on Accounts can be given by the admin');
  if ($bk['_code'] === 200) call($admin, 'acc', 'book_delete', ['id' => $bk['id']]);
  call($admin, 'settings', 'save', ['key' => 'role_perms', 'value' => $keep + ['accountant' => ['read' => ['accounts'], 'write' => []]]]);
  chk(call($ca, 'acc', 'book_save', ['name' => 'Ca Test Account 2', 'kind' => 'bank'])['_code'] === 403, 'and taken back');
} else echo "  (role_perms save shape differs: " . json_encode(array_slice($sv, 0, 2)) . ")\n";

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
