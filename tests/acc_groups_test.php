<?php
// Price list categories: the built-in groups plus the ones added in the app (acc/group_add, group_rename, group_delete).
// Usage: php tests/acc_groups_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/cgjar_' . $name . '_' . getmypid() . '.txt']; }
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

echo "Accounts: price list categories\n";
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->exec('PRAGMA busy_timeout=5000');
$one = fn($sql, $a = []) => (function () use ($db, $sql, $a) { $s = $db->prepare($sql); $s->execute($a); return $s->fetchColumn(); })();
$user = function ($name, $un, $role) use ($admin, $pw) { call($admin, 'admin', 'user_save', ['name' => $name, 'username' => $un, 'role' => $role, 'active' => 1, 'can_claim' => 0, 'password' => $pw]); $a = actor($un); call($a, 'auth', 'login', ['username' => $un, 'password' => $pw]); return $a; };
$acct = $user('Cg Accounts', 'cgacct', 'accounts'); $sales = $user('Cg Seller', 'cgsales', 'sales');
$BUILT = ['Inverter & optimizers', 'Solar panels', 'Structure & supports', 'Distribution boards', 'Metering & isolation', 'DC cables & connectors',
  'AC cables & lugs', 'Earthing & lightning protection', 'Pipes & conduit fittings', 'Cable accessories & consumables', 'Services and charges'];
$SVC = 'Services and charges';
$groups = fn() => call($acct, 'acc', 'ac_materials')['groups'] ?? [];
$rowsNow = fn() => call($acct, 'acc', 'ac_materials')['rows'] ?? [];
$saved = fn() => json_decode((string)$one("SELECT v FROM settings WHERE k='acc_groups'"), true) ?: [];
$at = fn($list, $g) => array_search($g, $list, true);
$add = fn($who, $name) => call($who, 'acc', 'group_add', ['name' => $name]);
$mat = fn($grp, $name, $rate = 1000) => call($acct, 'acc', 'material_save', ['grp' => $grp, 'name' => $name, 'unit' => 'Nos', 'gst' => 18, 'rate' => $rate, 'hidden' => 0]);

/* 1. the list: the built-in purchase groups first, Services last */
$g0 = $groups();
chk(!array_diff($BUILT, $g0) && $g0[0] === $BUILT[0] && end($g0) === $SVC, 'ac_materials sends every category: built-in purchases first, Services last');

/* 2. adding */
chk($add($sales, 'Cg Nope')['_code'] === 403, 'group_add: sales gets 403');
chk(call($acct, 'acc', 'group_add')['_code'] === 405, 'group_add over GET is refused');
$r = $add($acct, "  Battery \t  storage ");
chk($r['_code'] === 200 && ($r['name'] ?? '') === 'Battery storage' && (int)($r['existed'] ?? 1) === 0, 'group_add: trimmed, single spaces, existed 0');
$g = $r['groups'] ?? [];
chk($at($g, 'Battery storage') !== false && $at($g, 'Battery storage') > $at($g, 'Cable accessories & consumables') && $at($g, 'Battery storage') < $at($g, $SVC), 'the new category sits after the built-in purchases and before Services');
chk(in_array('Battery storage', $saved(), true) && in_array('Battery storage', $groups(), true), 'it is saved and comes back with the price list');
$r = $add($acct, 'battery STORAGE');
chk($r['_code'] === 200 && ($r['name'] ?? '') === 'Battery storage' && (int)($r['existed'] ?? 0) === 1 && count(array_keys(array_map('mb_strtolower', $saved()), 'battery storage')) === 1, 'the same name in another case: that category comes back, nothing added twice');
$r = $add($acct, 'inverter');
chk($r['_code'] === 200 && ($r['name'] ?? '') === 'Inverter & optimizers' && (int)($r['existed'] ?? 0) === 1, "a built-in group's short tab name gives that group");
$r = $add($acct, 'SOLAR panels');
chk($r['_code'] === 200 && ($r['name'] ?? '') === 'Solar panels' && (int)($r['existed'] ?? 0) === 1 && !in_array('SOLAR panels', $saved(), true), 'a built-in name in another case gives the built-in group');
chk($add($acct, '   ')['_code'] === 400 && $add($acct, '')['_code'] === 400, 'a blank name is refused');
chk($add($acct, str_repeat('x', 41))['_code'] === 400, 'a name over 40 characters is refused');
chk($add($acct, 'All')['_code'] === 400 && $add($acct, 'other')['_code'] === 400, '"All" and "Other" are refused (the screens use them)');
$long = 'Cg ' . str_repeat('y', 37);
chk($add($acct, $long)['_code'] === 200 && call($acct, 'acc', 'group_delete', ['name' => $long])['_code'] === 200, 'a 40 character name is fine');

/* 3. products in it, and the order of the price list */
$b = $mat('Battery storage', 'Cg Test Battery 5 kWh', 100000); $bid = (int)($b['id'] ?? 0);
chk($b['_code'] === 200 && $bid > 0 && ($b['item']['grp'] ?? '') === 'Battery storage', 'a product is saved in the new category');
chk($add($acct, 'Zeta spares')['_code'] === 200 && $mat('Zeta spares', 'Cg Zeta Bolt')['_code'] === 200, 'a second category with a product');
chk($mat('Cg loose group', 'Cg Loose Item')['_code'] === 200 && in_array('Cg loose group', $groups(), true) && !in_array('Cg loose group', $saved(), true), 'a group only a product has is listed too (not saved as a category)');
chk($mat('', 'Cg No Category')['_code'] === 400, 'a product needs a category');
$rs = $rowsNow(); $pos = [];
foreach ($rs as $i => $x) { $pos[$x['grp']][] = $i; }
$lastBuilt = -1; foreach ($BUILT as $bg) if ($bg !== $SVC && isset($pos[$bg])) $lastBuilt = max($lastBuilt, max($pos[$bg]));
$firstSvc = isset($pos[$SVC]) ? min($pos[$SVC]) : count($rs);
chk(min($pos['Battery storage']) > $lastBuilt && max($pos['Zeta spares']) < $firstSvc, 'price list order: built-in purchases, the added categories, then Services');
chk(max($pos['Battery storage']) < min($pos['Cg loose group']) && max($pos['Cg loose group']) < min($pos['Zeta spares']), 'the added categories are in name order');
$g = $groups();
chk($at($g, 'Battery storage') < $at($g, 'Cg loose group') && $at($g, 'Cg loose group') < $at($g, 'Zeta spares') && $at($g, 'Zeta spares') < $at($g, $SVC), 'the category list has the same order');

/* 4. renaming: products, Expense sheet lines and template items move with it */
$cid = (int)(call($admin, 'customers', 'save', ['name' => 'Category Test Customer', 'phone' => '9000000931'])['id'] ?? 0);
$pid = (int)(call($admin, 'projects', 'save', ['customer_id' => $cid, 'title' => '5 kW rooftop solar', 'kw' => 5, 'cost' => 250000])['id'] ?? 0);
$cs = call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'lines' => [
  ['material_id' => $bid, 'grp' => 'Battery storage', 'name' => 'Cg Test Battery 5 kWh', 'qty' => 1, 'unit' => 'Nos', 'rate' => 100000, 'gst' => 18],
  ['grp' => 'Solar panels', 'name' => 'Cg Test Panel', 'qty' => 2, 'unit' => 'Nos', 'rate' => 9000, 'gst' => 5]]]);
$v1 = (string)($cs['version'] ?? '');
$tp = call($acct, 'acc', 'tpl_put', ['name' => 'Cg battery kit', 'items' => [['material_id' => $bid, 'grp' => 'Battery storage', 'name' => 'Cg Test Battery 5 kWh', 'unit' => 'Nos', 'qty' => 2], ['grp' => 'Zeta spares', 'name' => 'Cg Zeta Bolt', 'unit' => 'Nos', 'qty' => 8]]]);
$tid = (int)($tp['id'] ?? 0);
chk($cid > 0 && $pid > 0 && $cs['_code'] === 200 && $v1 !== '' && $tid > 0, 'a sheet and a template use the category');
$ren = fn($who, $from, $to) => call($who, 'acc', 'group_rename', ['from' => $from, 'to' => $to]);
chk($ren($sales, 'Battery storage', 'Batteries')['_code'] === 403, 'group_rename: sales gets 403');
chk($ren($acct, 'Solar panels', 'Modules')['_code'] === 400, 'a built-in category keeps its name');
chk($ren($acct, 'Cg never there', 'Anything')['_code'] === 404, 'renaming an unknown category is 404');
chk($ren($acct, 'Battery storage', 'zeta SPARES')['_code'] === 400 && $ren($acct, 'Battery storage', 'solar panels')['_code'] === 400 && $ren($acct, 'Battery storage', 'Panels')['_code'] === 400, 'a name another category has is refused (added, built-in or short tab name)');
chk($ren($acct, 'Battery storage', ' ')['_code'] === 400, 'a blank new name is refused');
chk((int)$one("SELECT COUNT(*) FROM acc_materials WHERE grp='Battery storage'") === 1, 'the refusals changed nothing');
$r = $ren($acct, 'Battery storage', ' Batteries ');
chk($r['_code'] === 200 && ($r['name'] ?? '') === 'Batteries' && in_array('Batteries', $r['groups'] ?? [], true) && !in_array('Battery storage', $r['groups'] ?? [], true), 'group_rename: the list has the new name only');
chk((int)$one("SELECT COUNT(*) FROM acc_materials WHERE grp='Batteries'") === 1 && (int)$one("SELECT COUNT(*) FROM acc_materials WHERE grp='Battery storage'") === 0, 'its product moved');
$sheet = call($acct, 'acc', 'ac_cost', null, "&project_id=$pid");
$grps = array_column($sheet['lines'] ?? [], 'grp');
chk(in_array('Batteries', $grps, true) && !in_array('Battery storage', $grps, true) && in_array('Solar panels', $grps, true), 'the Expense sheet line moved, the other line did not');
chk((string)($sheet['version'] ?? '') !== $v1, 'the sheet counts as changed');
$st = call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'version' => $v1, 'lines' => [['material_id' => $bid, 'grp' => 'Battery storage', 'name' => 'Cg Test Battery 5 kWh', 'qty' => 3, 'unit' => 'Nos', 'rate' => 100000, 'gst' => 18]]]);
chk($st['_code'] === 409 && (int)$one("SELECT COUNT(*) FROM acc_costs WHERE project_id=? AND grp='Battery storage'", [$pid]) === 0, 'a copy of the sheet opened before the rename cannot save the old name back');
$ti = call($acct, 'acc', 'ac_tpl_get', null, "&id=$tid")['items'] ?? [];
chk(count($ti) === 2 && in_array('Batteries', array_column($ti, 'grp'), true) && in_array('Zeta spares', array_column($ti, 'grp'), true) && !in_array('Battery storage', array_column($ti, 'grp'), true), 'the template item moved, the other item did not');
chk(in_array('Batteries', $saved(), true) && !in_array('Battery storage', $saved(), true), 'the saved list has the new name');
$r = $ren($acct, 'Batteries', 'batteries');
chk($r['_code'] === 200 && (int)$one("SELECT COUNT(*) FROM acc_materials WHERE grp='batteries'") === 1 && in_array('batteries', $groups(), true) && !in_array('Batteries', $groups(), true), 'changing only the case of the name works');
chk($ren($acct, 'batteries', 'batteries')['_code'] === 200, 'the same name again is fine (nothing to do)');
$r = $ren($acct, 'Cg loose group', 'Cg loose renamed');
chk($r['_code'] === 200 && (int)$one("SELECT COUNT(*) FROM acc_materials WHERE grp='Cg loose renamed'") === 1 && in_array('Cg loose renamed', $saved(), true), "a group only products had can be renamed; it is a saved category from then on");
chk((int)$one("SELECT COUNT(*) FROM audit_log WHERE action IN ('acc_group_add','acc_group_rename')") >= 4, 'adding and renaming are in the activity log');

/* 5. deleting: only an added category with no products */
$del = fn($who, $name) => call($who, 'acc', 'group_delete', ['name' => $name]);
chk($del($sales, 'batteries')['_code'] === 403, 'group_delete: sales gets 403');
chk($del($acct, 'Solar panels')['_code'] === 400 && $del($acct, $SVC)['_code'] === 400, 'a built-in category cannot be deleted');
chk($del($acct, 'Cg never there')['_code'] === 404, 'deleting an unknown category is 404');
$r = $del($acct, 'batteries');
chk($r['_code'] === 400 && strpos((string)($r['error'] ?? ''), 'still has 1 product') !== false && in_array('batteries', $groups(), true), 'a category with a product is not deleted, and says why');
foreach ($rowsNow() as $x) if (in_array($x['grp'], ['batteries', 'Zeta spares', 'Cg loose renamed'], true)) call($acct, 'acc', 'material_delete', ['id' => $x['id']]);
chk(in_array('batteries', $groups(), true) && in_array('Zeta spares', $groups(), true), 'an added category stays on the list with no products in it');
$r = $del($acct, 'batteries');
chk($r['_code'] === 200 && !in_array('batteries', $r['groups'] ?? ['batteries'], true) && !in_array('batteries', $saved(), true) && !in_array('batteries', $groups(), true), 'empty: deleted, gone from the list');
chk((int)$one("SELECT COUNT(*) FROM acc_costs WHERE project_id=? AND grp='batteries'", [$pid]) === 1, 'an Expense sheet that used it keeps its line');
chk($del($acct, 'Zeta spares')['_code'] === 200 && $del($acct, 'Cg loose renamed')['_code'] === 200 && $del($acct, 'Zeta spares')['_code'] === 404, 'the other two are deleted; a second delete is 404');
chk(!array_diff($BUILT, $groups()), 'the built-in categories are all still there');

/* 6. at most 40 added categories */
$keep = (string)$one("SELECT v FROM settings WHERE k='acc_groups'");
$forty = []; for ($i = 1; $i <= 40; $i++) $forty[] = "Cg cap $i";
$db->prepare("INSERT INTO settings(k,v) VALUES('acc_groups',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v")->execute([json_encode($forty)]);
$r = $add($acct, 'Cg one too many');
chk($r['_code'] === 400 && strpos((string)($r['error'] ?? ''), 'At most 40') !== false, 'the 41st added category is refused');
chk(($add($acct, 'cg CAP 7')['existed'] ?? 0) == 1, 'at the limit, a name already there still gives that category');
$db->prepare("UPDATE settings SET v=? WHERE k='acc_groups'")->execute([$keep]);
chk(!in_array('Cg cap 1', $groups(), true), 'the list is back as it was');

echo "\n$pass ok, $fail FAIL\n";
exit($fail ? 1 : 0);
