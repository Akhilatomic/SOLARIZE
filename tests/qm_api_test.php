<?php
// Quotation maker API tests. Usage: php tests/qm_api_test.php http://localhost:8094  (fresh data folder)
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
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
chk(($boot['settings']['valid_days'] ?? 0) === 5 && count($boot['settings']['terms'] ?? []) === 6 && count($boot['settings']['pay'] ?? []) === 3 && count($boot['settings']['delivery'] ?? []) === 3, 'default lists');
chk(($boot['next_number'] ?? '') === 'JSS/PMSGY/' . date('Y') . '/0144', 'next number');
chk(($boot['admin'] ?? null) === 1 && ($boot['finance'] ?? null) === 1, 'admin flags');
chk(array_key_exists('rate', $boot['products'][0] ?? []), 'admin sees rates');
$codes = array_column($boot['products'] ?? [], 'code');
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

/* settings */
chk(call($sales, 'qm', 'settings_save', ['settings' => ['valid_days' => 7]])['_code'] === 403, 'sales cannot save settings');
chk(!empty(call($admin, 'qm', 'settings_save', ['settings' => ['valid_days' => 7, 'kseb' => ['stamp' => 350], 'terms' => ['One', 'Two']]])['ok']), 'admin saves settings');
$b4 = call($admin, 'qm', 'boot');
chk(($b4['settings']['valid_days'] ?? 0) === 7 && ($b4['settings']['kseb']['stamp'] ?? 0) === 350 && ($b4['settings']['kseb']['reg_per_kw'] ?? 0) === 1000 && ($b4['settings']['terms'] ?? []) === ['One', 'Two'], 'saved settings merge over defaults');

chk(!empty(call($admin, 'qm', 'settings_save', ['settings' => ['loan' => ['tariff' => 7.5, 'margin_pct' => 12.5, 'units_per_kwp' => 1300]]])['ok']), 'save decimal loan numbers');
$b5 = call($admin, 'qm', 'boot');
chk(($b5['settings']['loan']['tariff'] ?? 0) === 7.5 && ($b5['settings']['loan']['margin_pct'] ?? 0) === 12.5 && ($b5['settings']['loan']['units_per_kwp'] ?? 0) === 1300, 'decimals survive in int-typed settings');
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

echo "\n$pass passed, $fail failed\n";
foreach ([$anon, $admin, $sales] as $a) @unlink($a['jar']);
exit($fail ? 1 : 0);
