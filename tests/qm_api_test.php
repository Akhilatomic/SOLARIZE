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

echo "\n$pass passed, $fail failed\n";
foreach ([$anon, $admin, $sales, $sales2] as $a) @unlink($a['jar']);
exit($fail ? 1 : 0);
