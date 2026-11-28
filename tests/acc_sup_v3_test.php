<?php
// Price list: the one-time load of the GIG Automation and Transformers and Electrical Industries bills (acc_sup_v3 in api/acc_seed.php).
// Usage: php tests/acc_sup_v3_test.php   (no server needed)
require __DIR__ . '/../api/acc_seed.php';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
echo "Accounts: GIG 2711 + TEI A 18176 bills load into the price list\n";
function fresh() {
  $db = new PDO('sqlite::memory:'); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $db->exec('CREATE TABLE settings(k TEXT PRIMARY KEY, v TEXT)');
  $db->exec("CREATE TABLE acc_materials(id INTEGER PRIMARY KEY AUTOINCREMENT, grp TEXT, name TEXT, unit TEXT DEFAULT 'Nos', gst REAL DEFAULT 18, rate REAL DEFAULT 0, profit REAL, hidden INTEGER DEFAULT 0, sort INTEGER DEFAULT 0, offer_id INTEGER, created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec('CREATE UNIQUE INDEX accm_name ON acc_materials(grp, lower(name))');
  $db->exec("CREATE TABLE acc_suppliers(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, tag TEXT DEFAULT '', contact TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '', gstin TEXT DEFAULT '', address TEXT DEFAULT '', note TEXT DEFAULT '', created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec('CREATE UNIQUE INDEX accs_name ON acc_suppliers(lower(name))');
  $db->exec("CREATE TABLE acc_offers(id INTEGER PRIMARY KEY AUTOINCREMENT, material_id INTEGER, supplier_id INTEGER, brand TEXT DEFAULT '', rate REAL DEFAULT 0, ref TEXT DEFAULT '', on_date TEXT DEFAULT '', note TEXT DEFAULT '', created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec('CREATE UNIQUE INDEX acco_one ON acc_offers(material_id, supplier_id, lower(brand))');
  acc_seed($db); acc_prices_v1($db); acc_sup_v1($db); acc_sup_v2($db);
  return $db;
}
$bills = acc_sup_v3_data();
$known = []; foreach (acc_seed_list() as $items) foreach ($items as $i) $known[] = strtolower($i[0]);
foreach (acc_sup_v1_data()['items'] as $i) $known[] = strtolower($i[1]);
foreach (acc_sup_v2_data()['items'] as $i) $known[] = strtolower($i[1]);
$all = array_merge(...array_column($bills, 'items'));
$old = array_filter($all, fn($i) => !$i[4]); $new = array_filter($all, fn($i) => $i[4]);
chk(!array_diff(array_map('strtolower', array_column($old, 1)), $known), 'every item marked as already listed is on the list before these bills');
chk(!array_intersect(array_map('strtolower', array_column($new, 1)), $known), 'new items are new');
chk(!array_filter($all, fn($i) => $i[6] <= 0 || $i[3] != 18), 'every price is above 0 and 18 % GST, as on the bills');
/* quantity x price adds up to each bill's taxable value */
$q = [['3 PHASE ENERGY METER - VISIONTEK' => 3, 'COMPOUND 10 KG EXCEL' => 3, '10 SWG BARE COPPER' => 3.75, 'LA SINGLE - EXCEL' => 3, 'CABLE TIE- 4.6*450MM SS' => 1, 'SS304 J HOOK ( 60 x 40 ) M8' => 100, '4 FT EARTH ROD' => 1, '3 PHASE METER BOX EXCEL' => 3, 'EARTH PIT CHAMBER EXCEL' => 12, '50 SQMM T HOLDER' => 100], ['ACDB 10KW 3PHASE CITEL ABB PREMIUM DB' => 2, 'DCDB 1 IN 1 OUT 10KW , PREMIUM DB' => 2]];
foreach ([[0, 29138.63], [1, 25400]] as [$b, $tot]) {
  $byLine = array_column($bills[$b]['items'], 6, 7); $sum = 0; foreach ($q[$b] as $l => $n) $sum += $n * ($byLine[$l] ?? 0);
  chk(count($byLine) === count($q[$b]) && abs($sum - $tot) < 0.05, $bills[$b]['paper'][0] . ': all lines there and they add up to the bill (' . number_format($sum, 2) . ')');
}
$db = fresh();
$v = function ($sql, $a = []) use (&$db) { $s = $db->prepare($sql); $s->execute($a); return $s->fetchColumn(); };
$it = function ($name) use (&$db) { $s = $db->prepare('SELECT m.*, (SELECT COUNT(*) FROM acc_offers o WHERE o.material_id=m.id) n, (SELECT s.name FROM acc_offers o JOIN acc_suppliers s ON s.id=o.supplier_id WHERE o.id=m.offer_id) used_by, (SELECT o.brand FROM acc_offers o WHERE o.id=m.offer_id) used_brand, (SELECT o.ref FROM acc_offers o WHERE o.id=m.offer_id) used_ref FROM acc_materials m WHERE m.name=?'); $s->execute([$name]); return $s->fetch(PDO::FETCH_ASSOC); };
$n0 = [(int)$v('SELECT COUNT(*) FROM acc_materials'), (int)$v('SELECT COUNT(*) FROM acc_suppliers')];
$gig0 = (int)$v("SELECT id FROM acc_suppliers WHERE name='GIG Automation'");
acc_sup_v3($db);
chk((int)$v('SELECT COUNT(*) FROM acc_suppliers') === $n0[1] + 1 && (int)$v("SELECT id FROM acc_suppliers WHERE name='GIG Automation'") === $gig0 && $v("SELECT gstin FROM acc_suppliers WHERE tag='TEI'") === '32BWAPM8507K1ZH', 'GIG is reused; Transformers and Electrical Industries is added');
$cu = $it('Copper conductor earthing, 10 SWG');
chk((float)$cu['rate'] == 1490 && $cu['used_by'] === 'GIG Automation' && $cu['used_ref'] === 'GIGBBTV/26-2711' && (int)$cu['n'] === 2, '10 SWG copper: GIG price updated in place to 1490 and in use; NetZero row kept');
$rod = $it('Excel Earthings – ISI nickel sealed copper bonded earth rod 14 mm x 1.2 m');
chk((float)$rod['rate'] == 203 && $rod['used_by'] === 'GIG Automation', 'earth rod now uses GIG 203');
$box = $it('Excel Earthings – 3 phase powder coated meter box with isolator provision (344x340x135x0.8 mm)');
chk((float)$box['rate'] == 1200 && $box['used_brand'] === 'Excel' && (int)$box['n'] === 2, 'meter box: new Excel row 1200 in use, older GIG row kept');
$pit = $it('Excel Earthings – Earth pit chamber 18 x 18 cm PVC');
chk((float)$pit['rate'] == 300 && (int)$pit['n'] === 4, 'earth pit chamber: Excel 300 in use, 3 older prices kept');
chk((float)$it('50 sq mm T holder')['rate'] == 6 && (float)$it('Excel Earthings – SS lightning arrester 14 mm x 1 m, single spike, insulated base')['rate'] == 620, 'T holder 6, single LA 620');
$m3 = $it('Three phase energy meter'); $jh = $it('SS304 J hook 60 x 40, M8');
chk($m3 && $m3['grp'] === 'Metering & isolation' && (float)$m3['rate'] == 3562.71 && $m3['used_brand'] === 'Visiontek' && $jh && $jh['grp'] === 'Structure & supports' && (float)$jh['rate'] == 18.70, 'new items in their categories with the bill price');
$dc = $it('DCDB 10 kW 1-in-1-out for SolarEdge, double fuse: Citel DS50 PV 1000 V DC SPD, Mersen 30 A fuse holders, 32 A 1000 V DC isolator, Premium 12-way DB, Polycab 6 sq mm cable');
$ac = $it('ACDB 10 kW, three phase: Citel SPD, ABB, premium DB');
chk((float)$dc['rate'] == 5800 && $dc['used_by'] === 'Transformers and Electrical Industries' && $ac && (float)$ac['rate'] == 6900 && $ac['grp'] === 'Distribution boards', 'TEI: DCDB 10 kW 5800, new ACDB 10 kW 6900');
chk((int)$v('SELECT COUNT(*) FROM acc_materials') === $n0[0] + count($new), count($new) . ' new items added');
$n1 = [(int)$v('SELECT COUNT(*) FROM acc_offers'), (int)$v('SELECT COUNT(*) FROM acc_materials')];
$db->exec("UPDATE acc_materials SET rate=1, offer_id=NULL WHERE name='50 sq mm T holder'");
acc_sup_v3($db);
chk($n1 === [(int)$v('SELECT COUNT(*) FROM acc_offers'), (int)$v('SELECT COUNT(*) FROM acc_materials')] && (float)$it('50 sq mm T holder')['rate'] == 1, 'runs once');
echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
