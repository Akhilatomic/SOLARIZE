<?php
// Price list: suppliers and supplier prices (acc/supplier_save, supplier_delete, offer_save, offer_delete, offer_pick, material_save).
// Usage: php tests/acc_sup_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/spjar_' . $name . '_' . getmypid() . '.txt']; }
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

echo "Accounts: suppliers and supplier prices\n";
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->exec('PRAGMA busy_timeout=5000');
$one = fn($sql, $a = []) => (function () use ($db, $sql, $a) { $s = $db->prepare($sql); $s->execute($a); return $s->fetchColumn(); })();
$user = function ($name, $un, $role) use ($admin, $pw) { call($admin, 'admin', 'user_save', ['name' => $name, 'username' => $un, 'role' => $role, 'active' => 1, 'can_claim' => 0, 'password' => $pw]); $a = actor($un); call($a, 'auth', 'login', ['username' => $un, 'password' => $pw]); return $a; };
$acct = $user('Sp Accounts', 'spacct', 'accounts'); $sales = $user('Sp Seller', 'spsales', 'sales');
$list = function () use ($acct) { return call($acct, 'acc', 'ac_materials'); };
$item = function ($id) use ($list) { foreach ($list()['rows'] as $x) if ($x['id'] === $id) return $x; return null; };

/* suppliers */
$a = call($acct, 'acc', 'supplier_save', ['name' => '  Sp Alpha   Traders ', 'tag' => 'Alpha', 'phone' => '9000000001', 'gstin' => '32abcde1234f1z5', 'address' => 'Test Road']);
chk($a['_code'] === 200 && $a['id'] > 0, 'a supplier is added');
$sa = $a['id'];
$row = array_values(array_filter($a['suppliers'], fn($s) => $s['id'] === $sa))[0] ?? [];
chk(($row['name'] ?? '') === 'Sp Alpha Traders' && ($row['gstin'] ?? '') === '32ABCDE1234F1Z5' && ($row['n'] ?? -1) === 0, 'name tidied, GSTIN in capitals, no prices yet');
$d = call($acct, 'acc', 'supplier_save', ['name' => 'sp alpha traders']);
chk($d['_code'] === 409 && ($d['dup_id'] ?? 0) === $sa, 'the same name in another case is refused');
chk(call($acct, 'acc', 'supplier_save', ['name' => 'Sp Bad', 'gstin' => '123'])['_code'] === 400 && call($acct, 'acc', 'supplier_save', ['name' => ''])['_code'] === 400 && call($acct, 'acc', 'supplier_save', ['name' => 'Sp Bad', 'email' => 'nope'])['_code'] === 400, 'a wrong GSTIN, email or an empty name is refused');
$sb = call($acct, 'acc', 'supplier_save', ['name' => 'Sp Beta Electricals'])['id'];
$e = call($acct, 'acc', 'supplier_save', ['id' => $sb, 'name' => 'Sp Beta Electricals', 'contact' => 'Test Person', 'tag' => 'Beta']);
chk($e['_code'] === 200 && (int)$one('SELECT COUNT(*) FROM acc_suppliers WHERE id=?', [$sb]) === 1 && $one('SELECT contact FROM acc_suppliers WHERE id=?', [$sb]) === 'Test Person', 'a supplier is edited in place');
chk(call($sales, 'acc', 'supplier_save', ['name' => 'Sp Nope'])['_code'] === 403, 'no accounts access: refused');

/* an item and two supplier prices */
$m = call($acct, 'acc', 'material_save', ['grp' => 'Earthing & lightning protection', 'name' => 'Sp Test Copper Strip', 'unit' => 'kg', 'gst' => 18, 'rate' => 0, 'hidden' => 0]);
$mid = $m['id'];
chk($m['_code'] === 200 && $m['item']['offers'] === [] && $m['item']['offer_id'] === null, 'a new item has no supplier price');
$o1 = call($acct, 'acc', 'offer_save', ['material_id' => $mid, 'supplier_id' => $sa, 'brand' => 'Brand One', 'rate' => 1593, 'ref' => 'T-1', 'on_date' => '2026-11-01', 'note' => 'as printed']);
$o2 = call($acct, 'acc', 'offer_save', ['material_id' => $mid, 'supplier_id' => $sb, 'brand' => '', 'rate' => '1,530']);
chk($o1['_code'] === 200 && $o2['_code'] === 200 && count($o2['item']['offers']) === 2 && $o2['item']['offers'][0]['rate'] == 1530, 'two supplier prices, cheapest first');
chk($o2['item']['rate'] == 0 && $o2['item']['offer_id'] === null, 'a supplier price alone never changes the dealer price');
$dupe = call($acct, 'acc', 'offer_save', ['material_id' => $mid, 'supplier_id' => $sa, 'brand' => 'BRAND ONE', 'rate' => 1600]);
chk($dupe['_code'] === 200 && $dupe['id'] === $o1['id'] && count($dupe['item']['offers']) === 2, 'the same supplier + brand (any case) replaces its price');
chk(call($acct, 'acc', 'offer_save', ['material_id' => $mid, 'supplier_id' => $sa, 'brand' => 'X', 'rate' => 0])['_code'] === 400 && call($acct, 'acc', 'offer_save', ['material_id' => $mid, 'supplier_id' => 999999, 'rate' => 5])['_code'] === 400
  && call($acct, 'acc', 'offer_save', ['material_id' => 999999, 'supplier_id' => $sa, 'rate' => 5])['_code'] === 404 && call($acct, 'acc', 'offer_save', ['material_id' => $mid, 'supplier_id' => $sa, 'rate' => 5, 'on_date' => '11/01/2026'])['_code'] === 400, 'no price, unknown supplier, unknown item or a wrong date is refused');
$l = $list();
$sup = array_column($l['suppliers'], 'n', 'id');
chk(($sup[$sa] ?? 0) === 1 && ($sup[$sb] ?? 0) === 1 && count($item($mid)['offers']) === 2, 'the price list returns suppliers with their number of prices, and each item with its prices');

/* picking */
$p = call($acct, 'acc', 'offer_pick', ['material_id' => $mid, 'offer_id' => $o1['id']]);
chk($p['_code'] === 200 && $p['item']['rate'] == 1600 && $p['item']['offer_id'] === $o1['id'], 'Use this price: the dealer price is that supplier price');
$u = call($acct, 'acc', 'offer_save', ['id' => $o2['id'], 'material_id' => $mid, 'supplier_id' => $sb, 'brand' => '', 'rate' => 1500]);
chk($u['item']['rate'] == 1600 && $u['item']['offer_id'] === $o1['id'], 'a cheaper price from the other supplier does not change the dealer price');
$u = call($acct, 'acc', 'offer_save', ['id' => $o1['id'], 'material_id' => $mid, 'supplier_id' => $sa, 'brand' => 'Brand One', 'rate' => 1610]);
chk($u['item']['rate'] == 1610, 'the price in use is updated: the dealer price follows');
$u = call($acct, 'acc', 'offer_save', ['material_id' => $mid, 'supplier_id' => $sb, 'brand' => 'Brand Two', 'rate' => 1450, 'pick' => 1]);
$o3 = $u['id'];
chk($u['item']['rate'] == 1450 && $u['item']['offer_id'] === $o3 && count($u['item']['offers']) === 3, 'a price saved with "use it" becomes the dealer price');
$clash = call($acct, 'acc', 'offer_save', ['id' => $o3, 'material_id' => $mid, 'supplier_id' => $sb, 'brand' => '', 'rate' => 1450]);
chk($clash['_code'] === 400, 'an edit that would make two prices for one supplier + brand is refused');
$ms = call($acct, 'acc', 'material_save', ['id' => $mid, 'grp' => 'Earthing & lightning protection', 'name' => 'Sp Test Copper Strip', 'unit' => 'kg', 'gst' => 18, 'rate' => 1450, 'hidden' => 0]);
chk($ms['item']['offer_id'] === $o3, 'saving the item with the same dealer price keeps the supplier');
$ms = call($acct, 'acc', 'material_save', ['id' => $mid, 'grp' => 'Earthing & lightning protection', 'name' => 'Sp Test Copper Strip', 'unit' => 'kg', 'gst' => 18, 'rate' => 1400, 'hidden' => 0]);
chk($ms['item']['rate'] == 1400 && $ms['item']['offer_id'] === null && count($ms['item']['offers']) === 3, 'a dealer price typed by hand: no supplier in use, the prices stay');
call($acct, 'acc', 'offer_pick', ['material_id' => $mid, 'offer_id' => $o3]);
$p = call($acct, 'acc', 'offer_pick', ['material_id' => $mid, 'offer_id' => 0]);
chk($p['item']['rate'] == 1450 && $p['item']['offer_id'] === null, 'stop following: the price is kept');
chk(call($acct, 'acc', 'offer_pick', ['material_id' => $mid, 'offer_id' => 999999])['_code'] === 404, 'an unknown supplier price cannot be used');

/* supplier + brand on the item form */
$n = call($acct, 'acc', 'material_save', ['grp' => 'Solar panels', 'name' => 'Sp Test Panel 550', 'unit' => 'Nos', 'gst' => 5, 'rate' => 12100, 'hidden' => 0, 'supplier_id' => $sa, 'brand' => 'Sp Brand']);
$nid = $n['id'];
chk($n['_code'] === 200 && count($n['item']['offers']) === 1 && $n['item']['offers'][0]['brand'] === 'Sp Brand' && $n['item']['offers'][0]['supplier_id'] === $sa && $n['item']['offer_id'] === $n['item']['offers'][0]['id'] && $n['item']['offers'][0]['on_date'] === date('Y-m-d'), 'Add item with supplier and brand: saved as that supplier price, in use, dated today');
$n2 = call($acct, 'acc', 'material_save', ['id' => $nid, 'grp' => 'Solar panels', 'name' => 'Sp Test Panel 550', 'unit' => 'Nos', 'gst' => 5, 'rate' => 12000, 'hidden' => 0, 'supplier_id' => $sa, 'brand' => 'Sp Brand New']);
chk(count($n2['item']['offers']) === 1 && $n2['item']['offers'][0]['brand'] === 'Sp Brand New' && $n2['item']['rate'] == 12000 && $n2['item']['offer_id'] === $n['item']['offer_id'], 'Edit item: same supplier, the price and brand in use are corrected');
$n3 = call($acct, 'acc', 'material_save', ['id' => $nid, 'grp' => 'Solar panels', 'name' => 'Sp Test Panel 550', 'unit' => 'Nos', 'gst' => 5, 'rate' => 11900, 'hidden' => 0, 'supplier_id' => $sb, 'brand' => 'Sp Brand New']);
chk(count($n3['item']['offers']) === 2 && $n3['item']['rate'] == 11900 && $n3['item']['offer_id'] !== $n['item']['offer_id'], 'Edit item: another supplier adds its price and uses it');
chk(call($acct, 'acc', 'material_save', ['grp' => 'Solar panels', 'name' => 'Sp Test Panel 600', 'unit' => 'Nos', 'gst' => 5, 'rate' => 0, 'hidden' => 0, 'supplier_id' => $sa])['_code'] === 400 && (int)$one("SELECT COUNT(*) FROM acc_materials WHERE name='Sp Test Panel 600'") === 0, 'a supplier without a price is refused and nothing is added');

/* a price typed on an Expense sheet */
$cust = call($admin, 'customers', 'save', ['name' => 'Sp Test Customer', 'phone' => '9000000009']);
$cid = $cust['id'] ?? 0;
$pr = call($admin, 'projects', 'save', ['customer_id' => $cid, 'title' => '3 kW rooftop solar', 'kw' => 3, 'cost' => 100000]);
$pid = $pr['id'] ?? 0;
call($acct, 'acc', 'offer_pick', ['material_id' => $mid, 'offer_id' => $o3]);
$cs = call($acct, 'acc', 'cost_save', ['project_id' => $pid, 'lines' => [['material_id' => $mid, 'grp' => 'Earthing & lightning protection', 'name' => 'Sp Test Copper Strip', 'qty' => 2, 'unit' => 'kg', 'rate' => 1475, 'gst' => 18, 'price_typed' => 1]]]);
chk($pid > 0 && $cs['_code'] === 200 && $item($mid)['rate'] == 1475 && $item($mid)['offer_id'] === null, 'a dealer price typed on an Expense sheet: the item stops following the supplier');

/* access */
$deny = 0;
foreach ([['supplier_delete', ['id' => $sa]], ['offer_save', ['material_id' => $mid, 'supplier_id' => $sa, 'rate' => 1]], ['offer_delete', ['id' => $o1['id']]], ['offer_pick', ['material_id' => $mid, 'offer_id' => $o1['id']]]] as [$act, $b]) if (call($sales, 'acc', $act, $b)['_code'] === 403) $deny++;
chk($deny === 4 && (int)$one('SELECT COUNT(*) FROM acc_offers WHERE material_id=?', [$mid]) === 3, 'no accounts access: every change is refused');

/* deleting */
call($acct, 'acc', 'offer_pick', ['material_id' => $mid, 'offer_id' => $o3]);
$del = call($acct, 'acc', 'offer_delete', ['id' => $o3]);
chk($del['_code'] === 200 && $del['item']['rate'] == 1450 && $del['item']['offer_id'] === null && count($del['item']['offers']) === 2 && (int)$one("SELECT COUNT(*) FROM trash WHERE kind='Supplier price'") >= 1, 'the price in use is deleted: the dealer price stays, the price is in the Recycle bin');
call($acct, 'acc', 'offer_pick', ['material_id' => $mid, 'offer_id' => $o1['id']]);
$sd = call($acct, 'acc', 'supplier_delete', ['id' => $sa]);
$after = $item($mid);
chk($sd['_code'] === 200 && !in_array($sa, array_column($sd['suppliers'], 'id'), true) && $after['rate'] == 1610 && $after['offer_id'] === null && count($after['offers']) === 1, 'a supplier is deleted: its prices go, an item that used one keeps its dealer price');
chk((int)$one("SELECT COUNT(*) FROM trash WHERE kind='Supplier' AND label='Sp Alpha Traders'") === 1 && (int)$one('SELECT COUNT(*) FROM acc_offers WHERE supplier_id=?', [$sa]) === 0, 'the supplier and its prices are in the Recycle bin');
$md = call($acct, 'acc', 'material_delete', ['id' => $mid]);
chk($md['_code'] === 200 && (int)$one('SELECT COUNT(*) FROM acc_offers WHERE material_id=?', [$mid]) === 0, 'an item is deleted: its supplier prices go with it');
$tid = (int)$one("SELECT id FROM trash WHERE kind='Material' AND label LIKE '%Sp Test Copper Strip' ORDER BY id DESC LIMIT 1");
$rs = call($admin, 'trash', 'restore', ['id' => $tid]);
chk($rs['_code'] === 200 && (int)$one('SELECT COUNT(*) FROM acc_offers WHERE material_id=?', [$mid]) === 1 && $item($mid) !== null, 'restored from the Recycle bin with its supplier prices');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
