<?php
// Quotation maker API tests. Usage: php tests/qm_api_test.php http://localhost:8094  (fresh data folder)
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }

function actor($name) { return ['jar' => sys_get_temp_dir() . '/qmjar_' . $name . '_' . getmypid() . '.txt']; }
function call($who, $m, $a, $body = null, $qs = '', $raw = false) {
  global $base;
  $ch = curl_init("$base/api.php?m=$m&a=$a$qs");
  $h = ['X-Solarize: 1'];
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEJAR => $who['jar'], CURLOPT_COOKIEFILE => $who['jar'], CURLOPT_HEADER => true]);
  if ($body !== null) {
    curl_setopt($ch, CURLOPT_POST, true);
    if (isset($body['__multipart'])) curl_setopt($ch, CURLOPT_POSTFIELDS, $body['__multipart']);
    else { $h[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body)); }
  }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $res = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); $hs = curl_getinfo($ch, CURLINFO_HEADER_SIZE); curl_close($ch);
  $head = substr($res, 0, $hs); $txt = substr($res, $hs);
  if ($raw) return ['_code' => $code, '_head' => $head, '_body' => $txt];
  $j = json_decode($txt, true); if (!is_array($j)) $j = ['_text' => $txt];
  $j['_code'] = $code; return $j;
}

$anon = actor('anon'); $admin = actor('admin'); $sales = actor('sales');
$pw = 'Sunny2026pass';
chk(call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw])['_code'] === 200, 'first admin set up');
$u = call($admin, 'admin', 'user_save', ['name' => 'Seller', 'username' => 'seller', 'role' => 'sales', 'active' => 1, 'can_claim' => 0, 'password' => $pw]);
chk(!empty($u['id']), 'sales user created');
chk(call($sales, 'auth', 'login', ['username' => 'seller', 'password' => $pw])['_code'] === 200, 'sales signed in');

$boot = call($admin, 'qm', 'boot');
chk(($boot['_code'] ?? 0) === 200 && isset($boot['products']), 'admin boot works');
chk(count($boot['templates'] ?? []) === 14, 'seed: 14 templates');
chk(count(array_filter($boot['products'] ?? [], fn($p) => $p['cat'] === 'panels')) >= 4, 'seed: panels');
chk(count($boot['cats'] ?? []) === 14 && ($boot['cats'][0][0] ?? '') === 'panels', 'categories');
chk(($boot['settings']['kseb']['reg_per_kw'] ?? 0) === 1000 && ($boot['settings']['loan']['rate'] ?? 0) == 6.0, 'defaults');
chk(($boot['settings']['kseb']['reg_gst'] ?? null) === 18 && ($boot['settings']['kseb']['reg_label'] ?? '') === 'Registration fee (₹1,000 per kW + 18% GST, 80% refundable)', 'registration fee carries 18% GST by default');
chk(($boot['settings']['valid_days'] ?? 0) === 5 && count($boot['settings']['terms'] ?? []) === 6 && count($boot['settings']['pay'] ?? []) === 3 && count($boot['settings']['delivery'] ?? []) === 3, 'default lists');
chk(($boot['next_number'] ?? '') === 'JSS/PMSGY/' . date('Y') . '/0144', 'next number');
chk(($boot['admin'] ?? null) === 1 && ($boot['finance'] ?? null) === 1, 'admin flags');
chk(array_key_exists('rate', $boot['products'][0] ?? []), 'admin sees rates');
$codes = array_column($boot['products'] ?? [], 'code');
$kl = []; foreach ($boot['products'] ?? [] as $p) $kl[$p['code']] = $p['kw_line'] ?? null;
chk(($kl['inv-deye-1'] ?? null) === 1 && ($kl['inv-tsun-2'] ?? null) === 0, 'seed: kw_line on the Deye set only');
chk(count(array_diff(['pan-premier-600', 'inv-tsun-2', 'inv-se-5-3ph', 'str-hdg', 'str-apollo', 'install', 'earthing'], $codes)) === 0, 'seed: product codes');
$p0 = null; foreach ($boot['products'] ?? [] as $p) if ($p['code'] === 'pan-premier-600') $p0 = $p;
chk($p0 && $p0['is_default'] == 1 && $p0['wp'] == 600 && is_array($p0['warranty']) && is_array($p0['brands']), 'default panel decoded');
$ids = array_column($boot['products'] ?? [], 'id');
$bad = 0; foreach ($boot['templates'] ?? [] as $t) { $d = is_array($t['data']) ? $t['data'] : json_decode($t['data'], true); foreach ($d['items'] as $cat => $list) foreach ($list as $it) if (!in_array($it['pid'], $ids)) $bad++; }
chk($bad === 0, 'every template item points at a seeded product');

$salesBoot = call($sales, 'qm', 'boot');
chk(($salesBoot['_code'] ?? 0) === 200 && ($salesBoot['admin'] ?? null) === 0 && ($salesBoot['finance'] ?? null) === 0, 'sales boot, no admin/finance');
chk(!array_key_exists('rate', $salesBoot['products'][0] ?? ['rate' => 1]), 'no rates without finance');
chk(call($anon, 'qm', 'boot')['_code'] === 401, 'boot needs sign-in');

chk(call($sales, 'qm', 'product_save', ['cat' => 'panels', 'name' => 'X'])['_code'] === 403, 'sales cannot edit products');
$new = call($admin, 'qm', 'product_save', ['cat' => 'panels', 'name' => 'Waaree 580 Wp', 'wp' => 580, 'rate' => 20000, 'is_default' => 1]);
chk(!empty($new['id']), 'admin adds product');
$b2 = call($admin, 'qm', 'boot');
$defs = array_values(array_filter($b2['products'] ?? [], fn($p) => $p['cat'] === 'panels' && $p['is_default'] == 1));
chk(count($defs) === 1 && $defs[0]['id'] == ($new['id'] ?? -1), 'exactly one default panel');
chk(call($admin, 'qm', 'product_save', ['cat' => 'nonsense', 'name' => 'X'])['_code'] === 400, 'bad category rejected');
call($admin, 'qm', 'product_save', ['id' => $new['id'] ?? 0, 'name' => 'Waaree 585 Wp', 'brands' => [['label' => '', 'logos' => ['assets/quote/logo-renew.png', 'text:Waaree', '../../etc/passwd']]], 'warranty' => [['years' => '25', 'label' => 'Panels']]]);
$b3 = call($admin, 'qm', 'boot'); $np = null; foreach ($b3['products'] ?? [] as $p) if ($p['id'] == ($new['id'] ?? -1)) $np = $p;
chk($np && $np['name'] === 'Waaree 585 Wp' && $np['wp'] == 580 && $np['brands'][0]['logos'] === ['assets/quote/logo-renew.png', 'text:Waaree'], 'update keeps other fields, drops unsafe logo paths');

$kn = call($admin, 'qm', 'product_save', ['cat' => 'inverter', 'name' => 'Set inverter', 'kw' => 4, 'kw_line' => 1]);
$bk = call($admin, 'qm', 'boot'); $kp = null; foreach ($bk['products'] ?? [] as $p) if ($p['id'] == ($kn['id'] ?? -1)) $kp = $p;
chk($kp && $kp['kw_line'] === 1, 'product_save stores kw_line');
call($admin, 'qm', 'product_save', ['id' => $kn['id'] ?? 0, 'name' => 'Set inverter', 'kw_line' => 0]);
$bk = call($admin, 'qm', 'boot'); $kp = null; foreach ($bk['products'] ?? [] as $p) if ($p['id'] == ($kn['id'] ?? -1)) $kp = $p;
chk($kp && $kp['kw_line'] === 0, 'kw_line round-trips back to 0');

/* settings */
chk(call($sales, 'qm', 'settings_save', ['settings' => ['valid_days' => 7]])['_code'] === 403, 'sales cannot save settings');
chk(!empty(call($admin, 'qm', 'settings_save', ['settings' => ['valid_days' => 7, 'kseb' => ['stamp' => 350], 'terms' => ['One', 'Two']]])['ok']), 'admin saves settings');
$b4 = call($admin, 'qm', 'boot');
chk(($b4['settings']['valid_days'] ?? 0) === 7 && ($b4['settings']['kseb']['stamp'] ?? 0) === 350 && ($b4['settings']['kseb']['reg_per_kw'] ?? 0) === 1000 && ($b4['settings']['terms'] ?? []) === ['One', 'Two'], 'saved settings merge over defaults');

chk(!empty(call($admin, 'qm', 'settings_save', ['settings' => ['loan' => ['tariff' => 7.5, 'margin_pct' => 12.5, 'units_per_kwp' => 1300]]])['ok']), 'save decimal loan numbers');
$b5 = call($admin, 'qm', 'boot');
chk(($b5['settings']['loan']['tariff'] ?? 0) === 7.5 && ($b5['settings']['loan']['margin_pct'] ?? 0) === 12.5 && ($b5['settings']['loan']['units_per_kwp'] ?? 0) === 1300, 'decimals survive in int-typed settings');
/* settings an admin saved before the GST change still carry the old label: boot shows the new one */
call($admin, 'qm', 'settings_save', ['settings' => ['kseb' => ['reg_label' => 'Registration fee (₹1,000 per kW, 80% refundable)']]]);
$b6 = call($admin, 'qm', 'boot');
chk(($b6['settings']['kseb']['reg_label'] ?? '') === 'Registration fee (₹1,000 per kW + 18% GST, 80% refundable)' && ($b6['settings']['kseb']['reg_gst'] ?? null) === 18, 'old registration label upgraded to the GST one');
$next0 = call($admin, 'qm', 'boot')['next_n'] ?? 144;
chk(call($sales, 'qm', 'settings_save', ['settings' => ['valid_days' => 7], 'next_number' => 500])['_code'] === 403, 'sales cannot set the next number');
chk(call($admin, 'qm', 'settings_save', ['settings' => ['valid_days' => 7], 'next_number' => 'abc'])['_code'] === 400, 'bad next number refused');
chk(!empty(call($admin, 'qm', 'settings_save', ['settings' => ['valid_days' => 7], 'next_number' => 500])['ok']), 'admin sets the next number');
$b6 = call($admin, 'qm', 'boot');
chk(($b6['next_n'] ?? 0) === 500 && $b6['next_number'] === 'JSS/PMSGY/' . date('Y') . '/0500', 'next number changed');
call($admin, 'qm', 'settings_save', ['settings' => ['valid_days' => 7], 'next_number' => $next0]);
$seen = []; $nolabel = 0; $dup = 0;
foreach ($boot['products'] ?? [] as $p) { if (trim($p['label'] ?? '') === '') $nolabel++; $k = $p['cat'] . '|' . ($p['label'] ?? ''); if (isset($seen[$k])) $dup++; $seen[$k] = 1; }
chk($nolabel === 0 && $dup === 0, 'every seeded product has a label, unique within its category');
call($admin, 'qm', 'product_save', ['id' => $new['id'] ?? 0, 'label' => '  Waaree 585 Wp mono  ']);
$b6 = call($admin, 'qm', 'boot'); $lp = null; foreach ($b6['products'] ?? [] as $p) if ($p['id'] == ($new['id'] ?? -1)) $lp = $p;
chk($lp && $lp['label'] === 'Waaree 585 Wp mono' && $lp['name'] === 'Waaree 585 Wp', 'product_save round-trips label');

/* uploads and images */
$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
$tmpf = sys_get_temp_dir() . '/qm_test_' . getmypid() . '.png'; file_put_contents($tmpf, $png);
$mp = ['__multipart' => ['file' => new CURLFile($tmpf, 'image/png', 'logo.png')]];
chk(call($sales, 'qm', 'upload', $mp)['_code'] === 403, 'sales cannot upload');
$up = call($admin, 'qm', 'upload', $mp);
chk(isset($up['ref']) && preg_match('/^qm-[0-9a-f]{24}\.png$/', $up['ref']), 'admin uploads an image');
$im = call($sales, 'qm', 'img', null, '&f=' . ($up['ref'] ?? 'x'), true);
chk($im['_code'] === 200 && $im['_body'] === $png && stripos($im['_head'], 'image/png') !== false && stripos($im['_head'], 'max-age=604800') !== false, 'signed-in user gets the image with cache header');
chk(call($sales, 'qm', 'img', null, '&f=' . rawurlencode('../crm.sqlite'), true)['_code'] === 404, 'only qm- names are served');
chk(call($sales, 'qm', 'img', null, '&f=qm-' . str_repeat('0', 24) . '.png', true)['_code'] === 404, 'missing image is 404');
chk(call($anon, 'qm', 'img', null, '&f=qm-x.png')['_code'] === 401, 'images need sign-in');
@unlink($tmpf);

/* templates and saving quotations */
$sales2 = actor('sales2');
call($admin, 'admin', 'user_save', ['name' => 'Seller Two', 'username' => 'seller2', 'role' => 'sales', 'active' => 1, 'can_claim' => 0, 'password' => $pw]);
chk(call($sales2, 'auth', 'login', ['username' => 'seller2', 'password' => $pw])['_code'] === 200, 'second sales user signed in');
function trashHas($kind) { global $admin; foreach (call($admin, 'trash', 'list')['rows'] ?? [] as $r) if (($r['kind'] ?? '') === $kind) return true; return false; }
$cid = call($sales, 'customers', 'save', ['name' => 'Quote Customer', 'phone' => '9876543210'])['id'] ?? 0;
chk($cid > 0, 'customer created');
$panel = ['cat' => 'panels', 'name' => 'Snap panel 600 Wp', 'wp' => 600, 'qty' => 4];
$panelId = call($admin, 'qm', 'product_save', $panel)['id'] ?? 0;
$tplData = ['items' => ['panels' => [['pid' => $panelId, 'qty' => 4, 'qty_note' => '', 'over' => new stdClass()]]], 'price' => 170000, 'subsidy' => null, 'loan' => false, 'title' => '', 'project' => '', 'kseb' => null, 'pay' => null, 'terms' => null, 'delivery' => null];
$doc = $tplData + ['template_id' => 1, 'customer' => ['name' => 'Quote Customer', 'address' => '', 'consumer_no' => '', 'email' => '', 'mobile' => '9876543210'], 'number' => '', 'date' => date('Y-m-d'), 'valid_days' => 5, 'sales' => ['name' => 'Seller', 'phone' => '', 'email' => ''],
  'snap' => ['panels' => [['name' => $panel['name'], 'line' => '', 'details' => '', 'qty' => 4, 'wp' => 600]]]];
chk(call($anon, 'qm', 'tpl_save', ['name' => 'X', 'data' => $tplData])['_code'] === 401, 'template save needs sign-in');
$t = call($sales, 'qm', 'tpl_save', ['name' => 'My 2 kW', 'data' => $tplData]); chk(($t['id'] ?? 0) > 0, 'sales saves a template');
chk(call($sales, 'qm', 'tpl_save', ['name' => '', 'data' => $tplData])['_code'] === 400, 'template needs a name');
chk(call($sales2, 'qm', 'tpl_save', ['id' => $t['id'], 'name' => 'X', 'data' => $tplData])['_code'] === 403, 'other user cannot update it');
chk(!empty(call($admin, 'qm', 'tpl_save', ['id' => $t['id'], 'name' => 'My 2 kW v2', 'data' => $tplData])['id']), 'admin can');
$bt = call($sales, 'qm', 'boot'); $mine = null; foreach ($bt['templates'] as $x) if ($x['id'] == $t['id']) $mine = $x;
chk($mine && $mine['name'] === 'My 2 kW v2' && $mine['data']['price'] == 170000, 'saved template shows in boot');
chk(call($sales2, 'qm', 'tpl_delete', ['id' => $t['id']])['_code'] === 403, 'other user cannot delete it');
chk(!empty(call($sales, 'qm', 'tpl_delete', ['id' => $t['id']])['ok']) && trashHas('Quotation template'), 'delete goes to Recycle bin');
$q1 = call($sales, 'qm', 'save', ['customer_id' => $cid, 'status' => 'Draft', 'subsidy' => 67200, 'doc' => $doc]);
$q2 = call($sales, 'qm', 'save', ['customer_id' => $cid, 'status' => 'Draft', 'subsidy' => 67200, 'doc' => $doc]);
chk(($q1['number'] ?? '') === 'JSS/PMSGY/' . date('Y') . '/0144' && ($q2['number'] ?? '') === 'JSS/PMSGY/' . date('Y') . '/0145', 'numbers run on');
chk(call($sales, 'qm', 'save', ['customer_id' => $cid, 'doc' => ['price' => 0] + $doc])['_code'] === 400, 'price required');
chk(call($sales, 'qm', 'save', ['doc' => $doc])['_code'] === 400, 'customer or lead required');
chk(call($anon, 'qm', 'save', ['customer_id' => $cid, 'doc' => $doc])['_code'] === 401, 'save needs sign-in');
$q1b = call($sales, 'qm', 'save', ['id' => $q1['id'], 'customer_id' => $cid, 'status' => 'Sent', 'subsidy' => 60000, 'doc' => $doc]);
$g1 = call($sales, 'quotes', 'get', null, '&id=' . $q1['id']);
chk(($q1b['id'] ?? 0) == $q1['id'] && $q1b['number'] === $q1['number'] && $g1['status'] === 'Sent' && $g1['subsidy'] == 60000, 'update keeps the number');
chk(call($sales, 'qm', 'boot')['next_number'] === 'JSS/PMSGY/' . date('Y') . '/0146', 'update does not use a number');
chk(call($sales, 'qm', 'save', ['customer_id' => $cid, 'status' => 'Bogus', 'doc' => $doc])['_code'] === 400, 'bad status rejected');
/* snapshot: edit the product after saving; the saved quote still has the old wording */
call($admin, 'qm', 'product_save', ['id' => $panelId, 'name' => 'Changed name'] + $panel);
chk(json_decode(call($sales, 'quotes', 'get', null, '&id=' . $q1['id'])['doc'], true)['snap']['panels'][0]['name'] === $panel['name'], 'saved quote keeps its snapshot');
chk(call($sales, 'quotes', 'list')[0]['total'] == $doc['price'], 'list shows the package price');
/* the list leaves out the doc (and old-style items/terms); get still has it */
$ql = array_values(array_filter(call($sales, 'quotes', 'list'), 'is_array'));
$qr = null; foreach ($ql as $r) if ($r['id'] == $q1['id']) $qr = $r;
chk(count($ql) >= 2 && $qr && count(array_filter($ql, fn($r) => array_key_exists('doc', $r) || array_key_exists('items', $r) || array_key_exists('terms', $r))) === 0, 'list rows carry no doc, items or terms');
chk($qr && $qr['number'] === $q1['number'] && $qr['status'] === 'Sent' && $qr['total'] == $doc['price'] && $qr['customer_id'] == $cid && array_key_exists('lead_id', $qr) && !empty($qr['date']), 'list rows keep what the Quotations list shows');
$gd = call($sales, 'quotes', 'get', null, '&id=' . $q1['id']);
chk(is_string($gd['doc'] ?? null) && ($gd['doc'] ?? '') !== '' && is_array(json_decode($gd['doc'], true)['snap'] ?? null), 'get still returns the doc');
chk(count(array_filter(call($sales, 'quotes', 'list', null, '&customer_id=' . $cid), fn($r) => is_array($r) && array_key_exists('doc', $r))) === 0, 'filtered list has no doc either');
/* the settings frozen with the snapshot are stored as sent */
$ss = ['kseb' => $b6['settings']['kseb'], 'loan' => $b6['settings']['loan'], 'terms' => $b6['settings']['terms'], 'subsidy_rates' => ['per_kw_first2' => 30000, 'third_kw' => 18000, 'cap' => 78000]];
$qs = call($sales, 'qm', 'save', ['customer_id' => $cid, 'status' => 'Draft', 'doc' => $doc + ['snap_settings' => $ss]]);
$gs = json_decode(call($sales, 'quotes', 'get', null, '&id=' . ($qs['id'] ?? 0))['doc'] ?? '{}', true);
chk(($gs['snap_settings'] ?? null) == $ss && ($gs['snap_settings']['kseb']['reg_per_kw'] ?? 0) === 1000 && ($gs['snap_settings']['loan']['rate'] ?? 0) == 6, 'snap_settings round-trips through save');
/* consecutive saves; the built-in server handles one request at a time, so the lock test below is the real race check */
$mh = curl_multi_init(); $chs = [];
for ($i = 0; $i < 2; $i++) {
  $ch = curl_init("$base/api.php?m=qm&a=save");
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEFILE => $sales['jar'], CURLOPT_POST => true, CURLOPT_HTTPHEADER => ['X-Solarize: 1', 'Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode(['customer_id' => $cid, 'status' => 'Draft', 'doc' => $doc])]);
  curl_multi_add_handle($mh, $ch); $chs[] = $ch;
}
do { curl_multi_exec($mh, $run); if ($run) curl_multi_select($mh, 1); } while ($run);
$nums = []; foreach ($chs as $ch) { $j = json_decode(curl_multi_getcontent($ch), true); $nums[] = $j['number'] ?? null; curl_multi_remove_handle($mh, $ch); curl_close($ch); }
chk($nums[0] && $nums[1] && $nums[0] !== $nums[1], 'consecutive saves get different numbers');
/* deterministic lock check: while another connection holds the SQLite write lock, save must wait (it takes BEGIN IMMEDIATE before reading qm_next) */
if ($dbPath !== '' && is_file($dbPath)) {
  $before = call($sales, 'qm', 'boot')['next_number'];
  $lock = new PDO('sqlite:' . $dbPath); $lock->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $lock->exec('PRAGMA busy_timeout=5000');
  $lock->exec('BEGIN IMMEDIATE');
  $ch = curl_init("$base/api.php?m=qm&a=save");
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIEFILE => $sales['jar'], CURLOPT_POST => true, CURLOPT_HTTPHEADER => ['X-Solarize: 1', 'Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode(['customer_id' => $cid, 'status' => 'Draft', 'doc' => $doc])]);
  $mh = curl_multi_init(); curl_multi_add_handle($mh, $ch);
  $t0 = microtime(true); $run = 1;
  while ($run && microtime(true) - $t0 < 1.0) { curl_multi_exec($mh, $run); if ($run) curl_multi_select($mh, 0.05); }
  chk($run > 0, 'save waits while the write lock is held');
  $lock->exec('COMMIT');
  while ($run) { curl_multi_exec($mh, $run); if ($run) curl_multi_select($mh, 0.1); }
  $j = json_decode(curl_multi_getcontent($ch), true); curl_multi_remove_handle($mh, $ch); curl_close($ch);
  chk(($j['number'] ?? null) === $before, 'save finishes after the lock is released, with the next number');
} else echo "  skip lock test (no database path given)\n";

/* ---- lead call-back reminders ---- */
$lead = call($admin, 'leads', 'save', ['name' => 'Callback Test', 'phone' => '9847000111', 'status' => 'New']);
$lid = $lead['id'] ?? 0; chk($lid > 0, 'callback: lead created');
$future = date('Y-m-d', strtotime('+2 days')) . ' 10:00';
$r = call($admin, 'leads', 'callback', ['id' => $lid, 'at' => $future, 'note' => 'Ask about subsidy']);
chk(($r['_code'] ?? 0) === 200 && ($r['callback_at'] ?? '') === $future, 'callback: set for later');
$g = call($admin, 'leads', 'get', null, "&id=$lid");
chk(($g['callback_at'] ?? '') === $future && ($g['callback_note'] ?? '') === 'Ask about subsidy' && (int)($g['callback_sent'] ?? 1) === 0, 'callback: stored on the lead');
chk(call($admin, 'leads', 'callback', ['id' => $lid, 'at' => 'tomorrow'])['_code'] === 400, 'callback: rejects text that is not a date');
chk(call($admin, 'leads', 'callback', ['id' => $lid, 'at' => '2026-02-30 10:00'])['_code'] === 400, 'callback: rejects an impossible date');
chk(call($sales, 'leads', 'callback', ['id' => $lid, 'at' => $future])['_code'] >= 403, 'callback: someone without the lead cannot set one');
call($admin, 'leads', 'save', array_merge($g, ['remark' => 'saved from an old copy', 'callback_at' => '', 'callback_note' => '']));
chk((call($admin, 'leads', 'get', null, "&id=$lid")['callback_at'] ?? '') === $future, 'callback: saving the lead does not wipe the reminder');
$n0 = count(array_filter(call($admin, 'disc', 'notifs')['rows'] ?? [], fn($n) => $n['kind'] === 'callback'));
chk($n0 === 0, 'callback: no notification before it is due');
$sid = $u['id'];
call($admin, 'leads', 'assign', ['id' => $lid, 'user_id' => $sid]); // owner = the sales user
$past = date('Y-m-d H:i', time() - 60);
chk(call($admin, 'leads', 'callback', ['id' => $lid, 'at' => $past, 'note' => 'Due now'])['_code'] === 200, 'callback: moved to a time that has come');
$an = array_values(array_filter(call($admin, 'disc', 'notifs')['rows'] ?? [], fn($n) => $n['kind'] === 'callback'));
chk(count($an) === 1 && (int)$an[0]['lead_id'] === $lid && strpos($an[0]['text'], 'Callback Test') !== false && strpos($an[0]['text'], 'Due now') !== false, 'callback: due → bell notification for the person who set it');
$sn = array_values(array_filter(call($sales, 'disc', 'notifs')['rows'] ?? [], fn($n) => $n['kind'] === 'callback'));
chk(count($sn) === 1 && (int)$sn[0]['lead_id'] === $lid, 'callback: and for the lead owner');
call($admin, 'disc', 'notifs');
chk(count(array_filter(call($admin, 'disc', 'notifs')['rows'] ?? [], fn($n) => $n['kind'] === 'callback')) === 1, 'callback: sent only once');
chk(call($sales, 'leads', 'callback', ['id' => $lid, 'at' => '', 'done' => 1])['_code'] === 200, 'callback: owner marks it done');
$g2 = call($admin, 'leads', 'get', null, "&id=$lid");
chk(($g2['callback_at'] ?? 'x') === '' && ($g2['callback_note'] ?? 'x') === '', 'callback: cleared');

/* ---- sign-in lockout: the admin can unlock someone by saving their user ---- */
$lk = actor('lockme');
$lu = call($admin, 'admin', 'user_save', ['name' => 'Lock Me', 'username' => 'Lockme', 'role' => 'sales', 'active' => 1, 'can_claim' => 0, 'password' => $pw]);
chk(!empty($lu['id']), 'lockout: user created');
for ($i = 0; $i < 5; $i++) $w = call($lk, 'auth', 'login', ['username' => 'Lockme', 'password' => 'wrong-' . $i]);
chk(($w['_code'] ?? 0) === 401 && ($w['error'] ?? '') === 'Wrong username or password', 'lockout: wrong password says so');
$l6 = call($lk, 'auth', 'login', ['username' => 'Lockme', 'password' => $pw]);
chk(($l6['_code'] ?? 0) === 429 && strpos($l6['error'] ?? '', 'Too many wrong attempts') === 0, 'lockout: locked after 5 wrong passwords, even with the right one');
call($admin, 'admin', 'user_save', ['id' => $lu['id'], 'name' => 'Lock Me', 'username' => 'Lockme', 'role' => 'sales', 'active' => 1, 'can_claim' => 0]);
chk((call($lk, 'auth', 'login', ['username' => 'Lockme', 'password' => $pw])['_code'] ?? 0) === 200, 'lockout: admin saving the user unlocks them');
@unlink($lk['jar']);

/* ---- dashboard "New leads to contact": only leads from the last 24 hours ---- */
if ($dbPath !== '' && is_file($dbPath)) {
  $fa = call($admin, 'leads', 'save', ['name' => 'Fresh Lead', 'phone' => '9847000222', 'status' => 'New'])['id'] ?? 0;
  $fb = call($admin, 'leads', 'save', ['name' => 'Old Lead', 'phone' => '9847000333', 'status' => 'New'])['id'] ?? 0;
  $pdo = new PDO('sqlite:' . $dbPath); $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $pdo->exec('PRAGMA busy_timeout=5000');
  $pdo->exec('UPDATE leads SET notify=0');
  $pdo->prepare('UPDATE leads SET notify=1 WHERE id IN (?,?)')->execute([$fa, $fb]);
  $pdo->prepare("UPDATE leads SET created=datetime('now','-3 days') WHERE id=?")->execute([$fb]);
  $pdo = null;
  $feed = call($admin, 'meta', 'feed');
  chk(($feed['count'] ?? 0) === 2 && ($feed['day'] ?? -1) === 1, 'dashboard feed: 2 waiting, 1 from the last 24 hours');
} else echo "  skip dashboard feed test (no database path given)\n";

/* ---- owners: Me / All data and reassigning customers and leads ---- */
$mk = function ($name, $user, $role, $claim) use ($admin, $pw) {
  $r = call($admin, 'admin', 'user_save', ['name' => $name, 'username' => $user, 'role' => $role, 'active' => 1, 'can_claim' => $claim, 'password' => $pw]);
  $a = actor($user); call($a, 'auth', 'login', ['username' => $user, 'password' => $pw]); $a['id'] = (int)($r['id'] ?? 0); return $a;
};
$asha = $mk('Asha', 'asha', 'sales', 1); $ravi = $mk('Ravi', 'ravi', 'sales', 1); $mira = $mk('Mira', 'mira', 'assistant_manager', 0);
$eli = $mk('Eli', 'eli', 'engineer', 0); $acc = $mk('Acco', 'acco', 'accounts', 0);
chk($asha['id'] && $ravi['id'] && $mira['id'] && $eli['id'] && $acc['id'], 'owners: users created');
$ownerOf = fn($cid) => (int)(call($admin, 'customers', 'get', null, "&id=$cid")['owner_id'] ?? 0);

$c1 = (int)(call($asha, 'customers', 'save', ['name' => 'Owner Test One', 'phone' => '9847100001'])['id'] ?? 0);
chk($c1 > 0 && $ownerOf($c1) === $asha['id'], 'owners: whoever adds a customer owns it');
$row = array_values(array_filter(call($ravi, 'customers', 'list'), fn($c) => is_array($c) && (int)($c['id'] ?? 0) === $c1))[0] ?? [];
chk((int)($row['owner_id'] ?? 0) === $asha['id'] && ($row['owner_name'] ?? '') === 'Asha', 'owners: the list carries owner_id and owner_name, and others still see the customer');
$cand = array_column(call($asha, 'customers', 'owners'), 'name');
chk(in_array('Ravi', $cand) && in_array('Mira', $cand) && in_array('Eli', $cand) && in_array('Boss', $cand) && !in_array('Acco', $cand), 'owners: customer candidates = users who can edit customers (not Accounts)');
chk(call($asha, 'customers', 'owners', null, '', true)['_code'] === 200, 'owners: candidate list is a GET');

chk(call($ravi, 'customers', 'reassign', ['id' => $c1, 'user_id' => $ravi['id']])['_code'] === 403, 'reassign customer: another sales user cannot');
chk(call($eli, 'customers', 'reassign', ['id' => $c1, 'user_id' => $eli['id']])['_code'] === 403, 'reassign customer: an engineer who is not the owner cannot');
chk(call($acc, 'customers', 'reassign', ['id' => $c1, 'user_id' => $acc['id']])['_code'] === 403, 'reassign customer: a role without customer edit cannot');
$r = call($asha, 'customers', 'reassign', ['id' => $c1, 'user_id' => $ravi['id']]);
chk(($r['_code'] ?? 0) === 200 && ($r['owner_name'] ?? '') === 'Ravi' && $ownerOf($c1) === $ravi['id'], 'reassign customer: the owner hands it to Ravi');
chk(call($asha, 'customers', 'reassign', ['id' => $c1, 'user_id' => $asha['id']])['_code'] === 403, 'reassign customer: the old owner cannot take it back');
$rn = array_values(array_filter(call($ravi, 'disc', 'notifs')['rows'] ?? [], fn($n) => $n['kind'] === 'assign' && (int)$n['customer_id'] === $c1));
chk(count($rn) === 1 && (int)$rn[0]['from_id'] === $asha['id'] && strpos($rn[0]['text'], 'Owner Test One') !== false, 'reassign customer: the new owner gets a notification');
chk(!array_filter(call($asha, 'disc', 'notifs')['rows'] ?? [], fn($n) => $n['kind'] === 'assign'), 'reassign customer: no notification for the person who did it');
chk(call($mira, 'customers', 'reassign', ['id' => $c1, 'user_id' => $asha['id']])['_code'] === 200 && $ownerOf($c1) === $asha['id'], 'reassign customer: the assistant manager can reassign anyone\'s');
chk(call($admin, 'customers', 'reassign', ['id' => $c1, 'user_id' => $eli['id']])['_code'] === 200 && $ownerOf($c1) === $eli['id'], 'reassign customer: the admin can reassign anyone\'s');
chk(call($admin, 'customers', 'reassign', ['id' => $c1, 'user_id' => $acc['id']])['_code'] === 400 && $ownerOf($c1) === $eli['id'], 'reassign customer: not to a user who cannot work on customers');
chk(call($admin, 'customers', 'reassign', ['id' => $c1, 'user_id' => 99999])['_code'] === 400, 'reassign customer: not to an unknown user');
chk(call($admin, 'customers', 'reassign', ['id' => 99999, 'user_id' => $asha['id']])['_code'] === 404, 'reassign customer: unknown customer');
$aud = array_values(array_filter(call($admin, 'admin', 'audit'), fn($a) => is_array($a) && ($a['action'] ?? '') === 'reassign' && (int)$a['entity_id'] === $c1));
chk(count($aud) === 3 && ($aud[2]['detail'] ?? '') === 'Asha → Ravi' && ($aud[2]['user'] ?? '') === 'asha', 'reassign customer: every change is in the audit log');
$tl = call($admin, 'profile', 'timeline', null, "&customer_id=$c1");
chk(count(array_filter($tl['events'] ?? [], fn($e) => $e['title'] === 'Owner changed')) === 3, 'reassign customer: shows on the customer timeline');
$full = call($admin, 'customers', 'get', null, "&id=$c1");
call($eli, 'customers', 'save', array_merge($full, ['notes' => 'edited', 'owner_id' => $asha['id']]));
chk($ownerOf($c1) === $eli['id'], 'owners: saving a customer cannot change its owner');
chk(($full['owner_name'] ?? '') === 'Eli', 'owners: customers/get carries owner_name');

// leads: the claimer, the admin or the assistant manager reassigns; the lead stays locked, now to the new owner
$l1 = (int)(call($admin, 'leads', 'save', ['name' => 'Owner Lead', 'phone' => '9847100002', 'status' => 'New'])['id'] ?? 0);
chk(call($asha, 'leads', 'claim', ['id' => $l1])['_code'] === 200, 'reassign lead: Asha claims it');
$lc = array_column(call($asha, 'leads', 'owners'), 'name');
chk(in_array('Ravi', $lc) && in_array('Mira', $lc) && in_array('Seller', $lc) && !in_array('Eli', $lc) && !in_array('Acco', $lc), 'reassign lead: candidates = users who can work leads or claim them');
chk(call($ravi, 'leads', 'assign', ['id' => $l1, 'user_id' => $ravi['id']])['_code'] >= 403, 'reassign lead: someone else cannot take it');
chk(call($asha, 'leads', 'assign', ['id' => $l1, 'user_id' => $acc['id']])['_code'] === 400, 'reassign lead: not to a user who cannot work leads');
$r = call($asha, 'leads', 'assign', ['id' => $l1, 'user_id' => $ravi['id']]);
chk(($r['_code'] ?? 0) === 200 && ($r['owner_name'] ?? '') === 'Ravi', 'reassign lead: the claimer hands it to Ravi');
$seen = fn($who, $id) => (bool)array_filter(call($who, 'leads', 'list'), fn($l) => is_array($l) && (int)($l['id'] ?? 0) === $id);
chk($seen($ravi, $l1) && !$seen($asha, $l1), 'reassign lead: now locked to Ravi, gone from Asha\'s list');
chk(count(array_filter(call($ravi, 'disc', 'notifs')['rows'] ?? [], fn($n) => $n['kind'] === 'assign' && (int)$n['lead_id'] === $l1)) === 1, 'reassign lead: Ravi gets a notification');
chk(call($asha, 'leads', 'assign', ['id' => $l1, 'user_id' => $asha['id']])['_code'] >= 403, 'reassign lead: the old owner cannot take it back');
$l2 = (int)(call($admin, 'leads', 'save', ['name' => 'Pool Lead', 'phone' => '9847100003', 'status' => 'New'])['id'] ?? 0);
chk(call($asha, 'leads', 'assign', ['id' => $l2, 'user_id' => $asha['id']])['_code'] === 403, 'reassign lead: a sales user cannot hand out an unclaimed lead (claim it instead)');
$miraC = $mk('Mira Claims', 'mira2', 'assistant_manager', 1);
chk(call($miraC, 'leads', 'assign', ['id' => $l2, 'user_id' => $asha['id']])['_code'] === 200 && $seen($asha, $l2), 'reassign lead: the assistant manager assigns an unclaimed lead');
chk(call($admin, 'leads', 'assign', ['id' => $l2, 'user_id' => $ravi['id']])['_code'] === 200 && $seen($ravi, $l2) && !$seen($asha, $l2), 'reassign lead: the admin reassigns anyone\'s lead');
$la = array_values(array_filter(call($admin, 'admin', 'audit'), fn($a) => is_array($a) && ($a['action'] ?? '') === 'assign' && (int)$a['entity_id'] === $l1));
chk(count($la) === 1 && ($la[0]['detail'] ?? '') === 'Asha → Ravi', 'reassign lead: audit says from whom to whom');

// converting a claimed lead: the customer belongs to the lead's owner, not whoever clicked Convert
$cv = call($admin, 'leads', 'convert', ['id' => $l1]);
chk(($cv['customer_id'] ?? 0) > 0 && $ownerOf($cv['customer_id']) === $ravi['id'], 'owners: a converted lead\'s customer belongs to the lead owner');
$l3 = (int)(call($asha, 'leads', 'save', ['name' => 'Start Lead', 'phone' => '9847100004', 'status' => 'New'])['id'] ?? 0);
$st = call($asha, 'pipeline', 'start', ['lead_id' => $l3, 'kw' => 3]);
chk(($st['customer_id'] ?? 0) > 0 && $ownerOf($st['customer_id']) === $asha['id'], 'owners: starting a project from a lead keeps the lead owner');
$bp = array_values(array_filter(call($eli, 'pipeline', 'board')['projects'] ?? [], fn($p) => (int)$p['id'] === (int)($st['id'] ?? -1)))[0] ?? [];
chk((int)($bp['owner_id'] ?? 0) === $asha['id'], 'owners: the pipeline board carries the customer owner for Me');

// one-time fill of customers without an owner: the lead's claimer, else the user named in added_by
if ($dbPath !== '' && is_file($dbPath)) {
  $pdo = new PDO('sqlite:' . $dbPath); $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $pdo->exec('PRAGMA busy_timeout=5000');
  $ins = $pdo->prepare('INSERT INTO customers(name,added_by) VALUES(?,?)');
  $ins->execute(['Old From Lead', 'Boss']); $o1 = (int)$pdo->lastInsertId();
  $ins->execute(['Old By Name', ' asha ']); $o2 = (int)$pdo->lastInsertId();
  $ins->execute(['Old Nobody', 'Someone Gone']); $o3 = (int)$pdo->lastInsertId();
  $pdo->prepare('INSERT INTO leads(name,status,assigned_to,customer_id) VALUES(?,?,?,?)')->execute(['Old Lead', 'Won', $ravi['id'], $o1]);
  $pdo->exec('PRAGMA user_version=27'); $pdo = null;
  call($admin, 'auth', 'status'); // first request after the "upgrade" runs the migration
  chk($ownerOf($o1) === $ravi['id'] && $ownerOf($o2) === $asha['id'] && $ownerOf($o3) === 0, 'owners: upgrade fills owners from the lead, then from added_by');
  chk($ownerOf($c1) === $eli['id'], 'owners: upgrade leaves owners that are already set');
} else echo "  skip owner backfill test (no database path given)\n";
foreach ([$asha, $ravi, $mira, $eli, $acc, $miraC] as $a) @unlink($a['jar']);

/* ---- tax bill: Part A / Part B data round-trips, and every bill gets its own invoice number ---- */
$tb = []; foreach (['Bill One', 'Bill Two', 'Bill Three'] as $nm) $tb[] = call($admin, 'customers', 'save', ['name' => $nm, 'phone' => '9847' . rand(100000, 999999)])['id'] ?? 0;
$parts = ['total' => 320000, 'share' => 70, 'a' => ['title' => 'Supply of 5 kW on-grid solar power plant', 'lines' => "Solar panel: 8 x 600 Wp\nMake: Waaree", 'hsn' => '85414300', 'gst' => 5], 'b' => ['title' => 'Installation of 5 kW on-grid solar power plant', 'lines' => 'ACDB, DCDB, cables', 'hsn' => '995461', 'gst' => 18]];
$n1 = call($admin, 'gen', 'save', ['kind' => 'tax', 'customer_id' => $tb[0], 'issued_on' => '2026-11-10', 'data' => ['bill_name' => 'Bill One', 'items' => [], 'parts' => $parts, 'grand' => 320000]])['number'] ?? '';
$n2 = call($admin, 'gen', 'save', ['kind' => 'tax', 'customer_id' => $tb[1], 'issued_on' => '2026-11-10', 'data' => ['bill_name' => 'Bill Two', 'items' => [], 'parts' => $parts]])['number'] ?? '';
chk($n1 !== '' && $n2 !== '' && $n1 !== $n2, "tax bill: two bills get different numbers ($n1, $n2)");
$gb = call($admin, 'gen', 'get', null, "&kind=tax&customer_id={$tb[0]}");
chk(($gb['doc']['data']['parts']['a']['gst'] ?? 0) === 5 && ($gb['doc']['data']['parts']['b']['hsn'] ?? '') === '995461' && ($gb['doc']['data']['parts']['total'] ?? 0) === 320000, 'tax bill: Part A / Part B saved as entered');
chk(($gb['qm']['bank']['ifsc'] ?? '') === 'SBIN0064970' && ($gb['qm']['kseb']['reg_per_kw'] ?? 0) == 1000 && strpos($gb['qm']['address'] ?? '', 'Nedumangad') !== false && ($gb['qm']['site'] ?? '') === 'www.jasper.solar', 'tax bill: gets the company address, website, bank and KSEB fees from the quotation settings');
$re = call($admin, 'gen', 'save', ['kind' => 'tax', 'customer_id' => $tb[0], 'issued_on' => '2026-11-10', 'data' => ['bill_name' => 'Bill One', 'items' => [], 'parts' => $parts]])['number'] ?? '';
chk($re === $n1, 'tax bill: saving changes keeps the bill\'s number');
if ($dbPath !== '' && is_file($dbPath)) { // a counter left stuck by the old bug ("1" stored as JSON text) must not hand out a used number again
  $pdo = new PDO('sqlite:' . $dbPath); $pdo->exec('PRAGMA busy_timeout=5000'); $pdo->exec("UPDATE settings SET v='\"1\"' WHERE k='seq_tax_26-27'"); $pdo = null;
  $n3 = call($admin, 'gen', 'save', ['kind' => 'tax', 'customer_id' => $tb[2], 'issued_on' => '2026-11-10', 'data' => ['bill_name' => 'Bill Three', 'items' => [], 'parts' => $parts]])['number'] ?? '';
  chk($n3 !== '' && !in_array($n3, [$n1, $n2], true), "tax bill: a stuck counter does not reuse an issued number ($n3)");
}

/* ---- tax bill invoice number: shown before issuing, can be typed, carries on from the last one, never repeats ---- */
$nc = []; foreach (['No One', 'No Two', 'No Three', 'No Four'] as $nm) $nc[] = call($admin, 'customers', 'save', ['name' => $nm, 'phone' => '9847' . rand(100000, 999999)])['id'] ?? 0;
$save = fn($cid, $no = '') => call($admin, 'gen', 'save', ['kind' => 'tax', 'customer_id' => $cid, 'issued_on' => '2026-11-12', 'number' => $no, 'data' => ['bill_name' => 'X', 'items' => [], 'parts' => $parts]]);
$peek = call($admin, 'gen', 'get', null, "&kind=tax&customer_id={$nc[0]}")['next_no'] ?? '';
$a1 = $save($nc[0])['number'] ?? '';
chk($peek !== '' && $a1 === $peek, "invoice no.: a new bill shows the number it will get ($peek)");
$m1 = $save($nc[1], '59');
chk(($m1['number'] ?? '') === '59', 'invoice no.: a typed number is used');
chk((call($admin, 'gen', 'next', null, "&kind=tax&customer_id={$nc[2]}&date=2026-11-12")['number'] ?? '') === '60', 'invoice no.: the next one carries on from the typed number (60)');
chk(($save($nc[2])['number'] ?? '') === '60', 'invoice no.: issuing without typing gives 60');
chk(($save($nc[3], '60')['_code'] ?? 0) === 409, 'invoice no.: a number already used is refused');
chk(($save($nc[0], '61')['number'] ?? '') === '61' && ($save($nc[0], '59')['_code'] ?? 0) === 409, 'invoice no.: an issued bill can be renumbered, but not to a used number');
chk((call($admin, 'gen', 'next', null, "&kind=tax&customer_id={$nc[3]}&date=2027-04-05")['number'] ?? '') === 'JS/INV/27-28/001', 'invoice no.: a new financial year starts its own series');

/* ---- MNRE warranty certificate: its own Ref No. series, typed numbers, signatory remembered ---- */
$wg = call($admin, 'gen', 'get', null, "&kind=warranty&customer_id={$nc[0]}");
chk(preg_match('#^JS/WC/\d\d-\d\d/\d{3}$#', $wg['next_no'] ?? '') === 1 && ($wg['mnre']['sign_desig'] ?? '') === 'Proprietor', 'warranty card: shows its Ref No. ' . ($wg['next_no'] ?? '') . ' and a default designation');
$wd = ['name' => 'No One', 'eff' => '2026-11-01', 'years' => 5, 'sign_name' => 'Akhil', 'sign_desig' => 'Managing Partner', 'sign_phone' => '96055 25552'];
$w1 = call($admin, 'gen', 'save', ['kind' => 'warranty', 'customer_id' => $nc[0], 'issued_on' => '2026-11-12', 'number' => '', 'data' => $wd]);
chk(($w1['number'] ?? '') === ($wg['next_no'] ?? 'x'), 'warranty card: issued with the shown number');
chk((call($admin, 'gen', 'save', ['kind' => 'warranty', 'customer_id' => $nc[1], 'issued_on' => '2026-11-12', 'number' => $w1['number'] ?? '', 'data' => $wd])['_code'] ?? 0) === 409, 'warranty card: a Ref No. already used is refused');
chk((call($admin, 'gen', 'save', ['kind' => 'warranty', 'customer_id' => $nc[1], 'issued_on' => '2026-11-12', 'number' => 'JSS/WC/0045', 'data' => $wd])['number'] ?? '') === 'JSS/WC/0045', 'warranty card: a typed Ref No. is used');
$wg2 = call($admin, 'gen', 'get', null, "&kind=warranty&customer_id={$nc[2]}");
chk(($wg2['mnre']['sign_name'] ?? '') === 'Akhil' && ($wg2['mnre']['sign_desig'] ?? '') === 'Managing Partner' && ($wg2['next_no'] ?? '') === 'JSS/WC/0046', 'warranty card: the signatory is remembered and the series carries on (JSS/WC/0046)');

/* ---- payment receipts: a number the first time, kept after that, one series per financial year ---- */
$rc = call($admin, 'customers', 'save', ['name' => 'Receipt Test', 'phone' => '9847' . rand(100000, 999999)])['id'] ?? 0;
$acct = call($admin, 'gen', 'cost', ['kind' => 'tax', 'customer_id' => $rc, 'cost' => 225000])['acct'] ?? [];
$p1 = call($admin, 'payments', 'save', ['project_id' => $acct['project_id'] ?? 0, 'date' => '2026-11-09', 'amount' => 200000, 'mode' => 'Bank transfer', 'note' => 'UTR 4411'])['id'] ?? 0;
$p2 = call($admin, 'payments', 'save', ['project_id' => $acct['project_id'] ?? 0, 'date' => '2026-11-12', 'amount' => 25000, 'mode' => 'Cheque', 'note' => ''])['id'] ?? 0;
$r1 = call($admin, 'gen', 'receipt', ['kind' => 'tax', 'customer_id' => $rc, 'payment_id' => $p1]);
chk(preg_match('#^JS/RCPT/26-27/\d{3}$#', $r1['receipt_no'] ?? '') === 1, 'receipt: a payment gets a receipt number (' . ($r1['receipt_no'] ?? '') . ')');
chk((call($admin, 'gen', 'receipt', ['kind' => 'tax', 'customer_id' => $rc, 'payment_id' => $p1])['receipt_no'] ?? '') === ($r1['receipt_no'] ?? 'x'), 'receipt: making it again keeps the same number');
$r2 = call($admin, 'gen', 'receipt', ['kind' => 'tax', 'customer_id' => $rc, 'payment_id' => $p2])['receipt_no'] ?? '';
chk($r2 !== '' && (int)substr(strrchr($r2, '/'), 1) === (int)substr(strrchr($r1['receipt_no'] ?? '/0', '/'), 1) + 1, "receipt: the next payment gets the next number ($r2)");
chk((call($admin, 'gen', 'receipt', ['kind' => 'tax', 'customer_id' => $nc[0], 'payment_id' => $p1])['_code'] ?? 0) === 404, "receipt: another customer's payment is refused");
$pays = call($admin, 'gen', 'get', null, "&kind=tax&customer_id=$rc")['acct']['payments'] ?? [];
chk(count($pays) === 2 && ($pays[0]['receipt_no'] ?? '') === ($r1['receipt_no'] ?? 'x') && ($pays[1]['receipt_no'] ?? '') === $r2, 'receipt: the payment list shows the receipt numbers');
call($admin, 'payments', 'save', ['id' => $p1, 'project_id' => $acct['project_id'] ?? 0, 'date' => '2026-11-09', 'amount' => 200000, 'mode' => 'UPI', 'note' => 'UTR 4411']);
chk((call($admin, 'gen', 'get', null, "&kind=tax&customer_id=$rc")['acct']['payments'][0]['receipt_no'] ?? '') === ($r1['receipt_no'] ?? 'x'), 'receipt: editing the payment keeps its receipt number');

echo "\n$pass passed, $fail failed\n";
foreach ([$anon, $admin, $sales, $sales2] as $a) @unlink($a['jar']);
exit($fail ? 1 : 0);
