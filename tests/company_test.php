<?php
// Settings › Company: empty fields show the current details (Quotation maker company block, then the built-in ones); Save keeps only the real fields.
// Usage: php tests/company_test.php http://localhost:8094 <path to crm.sqlite>
$base = rtrim($argv[1] ?? 'http://localhost:8094', '/');
$dbPath = $argv[2] ?? '';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
function actor($name) { return ['jar' => sys_get_temp_dir() . '/cojar_' . $name . '_' . getmypid() . '.txt']; }
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

echo "Settings: company details\n";
if ($dbPath === '' || !is_file($dbPath)) { echo "  FAIL needs the sqlite path\n"; exit(1); }
$admin = actor('admin'); $pw = 'Sunny2026pass';
$r = call($admin, 'auth', 'setup', ['name' => 'Boss', 'username' => 'boss', 'password' => $pw]);
if ($r['_code'] !== 200) $r = call($admin, 'auth', 'login', ['username' => 'boss', 'password' => $pw]);
chk($r['_code'] === 200, 'admin signed in');
$db = new PDO('sqlite:' . $dbPath); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->exec('PRAGMA busy_timeout=5000');
$store = function ($k, $json) use ($db) { $db->prepare('INSERT OR REPLACE INTO settings(k,v) VALUES(?,?)')->execute([$k, $json]); };
$drop = function ($k) use ($db) { $db->prepare('DELETE FROM settings WHERE k=?')->execute([$k]); };
$co = fn() => call($admin, 'settings', 'get')['company'] ?? [];
$qmWas = $db->query("SELECT v FROM settings WHERE k='qm_settings'")->fetchColumn();
$coWas = $db->query("SELECT v FROM settings WHERE k='company'")->fetchColumn();
$qm = call($admin, 'qm', 'boot')['settings']['company'] ?? [];
$qmAddr = ''; foreach ($qm['lines'] ?? [] as $l) if (preg_match('/office|address/i', $l['label'] ?? '')) { $qmAddr = $l['text']; break; }
chk(($qm['phone'] ?? '') !== '' && ($qm['email'] ?? '') !== '' && $qmAddr !== '', 'the Quotation maker has a phone, email and office address');

/* 1. the wiped record ("Save company" once stored an empty object) */
$store('company', '[]'); $c = $co();
chk(($c['name'] ?? '') !== '' && preg_match('/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/', $c['gstin'] ?? ''), 'wiped record: name and a clean GSTIN are shown');
chk(($c['phone'] ?? '') === $qm['phone'] && ($c['email'] ?? '') === $qm['email'] && ($c['address'] ?? '') === $qmAddr, 'wiped record: phone, email and address come from the Quotation maker');
chk(($c['quote_prefix'] ?? '') === 'JS' && strpos($c['terms'] ?? '', 'Prices valid') !== false, 'wiped record: quote prefix and default terms are back');
chk(strcasecmp($c['name'], $qm['name']) !== 0 || $c['name'] !== strtoupper($c['name']), 'same company name keeps the ordinary spelling, not capitals');
$store('company', json_encode(['name' => '', 'gstin' => '', 'phone' => '', 'email' => '', 'address' => '', 'quote_prefix' => '', 'terms' => '']));
$c2 = $co(); chk($c2 == $c, 'a record of empty fields shows the same current details');
$store('company', 'null'); chk($co() == $c, 'a null record is handled');

/* 2. typed values win; only empty fields are filled */
$store('company', json_encode(['name' => 'Sunrise Test Co', 'gstin' => '32ABCDE1234F1Z5', 'phone' => '', 'email' => 'a@example.test', 'address' => '', 'quote_prefix' => 'ST', 'terms' => '']));
$c = $co();
chk($c['name'] === 'Sunrise Test Co' && $c['gstin'] === '32ABCDE1234F1Z5' && $c['email'] === 'a@example.test' && $c['quote_prefix'] === 'ST', 'typed fields are kept');
chk($c['phone'] === $qm['phone'] && $c['address'] === $qmAddr, 'empty phone and address are filled');
chk($c['terms'] === '', 'terms cleared on purpose stay empty');

/* 3. the Quotation maker is the source: a changed phone there shows here */
$qs = json_decode($qmWas ?: '[]', true) ?: []; $qs['company'] = ['phone' => '90000 00077', 'gstin' => 'GSTIN/UIN: 32ZZZZZ9999Z1Z9'] + ($qs['company'] ?? []);
$store('qm_settings', json_encode($qs)); $store('company', '[]'); $c = $co();
chk($c['phone'] === '90000 00077' && $c['gstin'] === '32ZZZZZ9999Z1Z9', 'a phone / GSTIN changed in the Quotation maker shows in the empty fields');
if ($qmWas === false) $drop('qm_settings'); else $store('qm_settings', $qmWas);

/* 4. saving */
$store('company', '[]');
$r = call($admin, 'settings', 'save', ['key' => 'company', 'value' => new stdClass]);
chk($r['_code'] === 400, 'an empty save is refused');
$r = call($admin, 'settings', 'save', ['key' => 'company', 'value' => ['junk' => 'x']]);
chk($r['_code'] === 400 && $db->query("SELECT v FROM settings WHERE k='company'")->fetchColumn() === '[]', 'a save without any company field is refused and changes nothing');
$r = call($admin, 'settings', 'save', ['key' => 'company', 'value' => ['name' => '  ', 'phone' => '1']]);
chk($r['_code'] === 400, 'the company name cannot be saved empty');
$r = call($admin, 'settings', 'save', ['key' => 'company', 'value' => ['name' => ' Sunrise Test Co ', 'gstin' => '32ABCDE1234F1Z5', 'quote_prefix' => 'ST', 'phone' => '90000 00011', 'email' => 'b@example.test', 'address' => '12 Test Road', 'terms' => "One\nTwo", 'junk' => 'x', 'bank' => ['a' => 1]]]);
$raw = json_decode($db->query("SELECT v FROM settings WHERE k='company'")->fetchColumn(), true);
chk($r['_code'] === 200 && $raw === ['name' => 'Sunrise Test Co', 'gstin' => '32ABCDE1234F1Z5', 'address' => '12 Test Road', 'phone' => '90000 00011', 'email' => 'b@example.test', 'quote_prefix' => 'ST', 'terms' => "One\nTwo"], 'a full save stores exactly the seven fields, trimmed');
$r = call($admin, 'settings', 'save', ['key' => 'company', 'value' => ['phone' => '90000 00022']]);
$c = $co();
chk($r['_code'] === 200 && $c['phone'] === '90000 00022' && $c['name'] === 'Sunrise Test Co' && $c['terms'] === "One\nTwo", 'a save with one field keeps the others');
$r = call($admin, 'settings', 'save', ['key' => 'company', 'value' => ['name' => 'Sunrise Test Co', 'terms' => ['x']]]);
chk($r['_code'] === 200 && $co()['terms'] === '', 'a non-text value is stored as empty text');

/* 5. other places that read the company */
$store('company', '[]');
$t = call($admin, 'acc', 'ac_tpl');
chk(preg_match('/^\d{2}[A-Z]{5}/', $t['company']['gstin'] ?? ''), 'Accounts papers get the GSTIN again after a wiped record');

if ($coWas === false) $drop('company'); else $store('company', $coWas);
echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
