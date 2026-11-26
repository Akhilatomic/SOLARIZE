<?php
// Price list: the one-time load of the Usha Electricals bill (acc_sup_v2 in api/acc_seed.php).
// Usage: php tests/acc_sup_v2_test.php   (no server needed)
require __DIR__ . '/../api/acc_seed.php';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
echo "Accounts: Usha Electricals bill loads into the price list\n";
function fresh() {
  $db = new PDO('sqlite::memory:'); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $db->exec('CREATE TABLE settings(k TEXT PRIMARY KEY, v TEXT)');
  $db->exec("CREATE TABLE acc_materials(id INTEGER PRIMARY KEY AUTOINCREMENT, grp TEXT, name TEXT, unit TEXT DEFAULT 'Nos', gst REAL DEFAULT 18, rate REAL DEFAULT 0, profit REAL, hidden INTEGER DEFAULT 0, sort INTEGER DEFAULT 0, offer_id INTEGER, created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec('CREATE UNIQUE INDEX accm_name ON acc_materials(grp, lower(name))');
  $db->exec("CREATE TABLE acc_suppliers(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, tag TEXT DEFAULT '', contact TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '', gstin TEXT DEFAULT '', address TEXT DEFAULT '', note TEXT DEFAULT '', created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec('CREATE UNIQUE INDEX accs_name ON acc_suppliers(lower(name))');
  $db->exec("CREATE TABLE acc_offers(id INTEGER PRIMARY KEY AUTOINCREMENT, material_id INTEGER, supplier_id INTEGER, brand TEXT DEFAULT '', rate REAL DEFAULT 0, ref TEXT DEFAULT '', on_date TEXT DEFAULT '', note TEXT DEFAULT '', created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec('CREATE UNIQUE INDEX acco_one ON acc_offers(material_id, supplier_id, lower(brand))');
  acc_seed($db); acc_prices_v1($db); acc_sup_v1($db);
  return $db;
}
$d = acc_sup_v2_data();
$known = []; foreach (acc_seed_list() as $items) foreach ($items as $i) $known[] = strtolower($i[0]);
foreach (acc_sup_v1_data()['items'] as $i) $known[] = strtolower($i[1]);
$old = array_filter($d['items'], fn($i) => !$i[4]); $new = array_filter($d['items'], fn($i) => $i[4]);
chk(!array_diff(array_map('strtolower', array_column($old, 1)), $known), 'every item marked as already listed is on the list before this bill');
chk(!array_intersect(array_map('strtolower', array_column($new, 1)), $known) && count(array_unique(array_map('strtolower', array_column($d['items'], 1)))) === count($d['items']), 'new items are new, and no item is listed twice');
chk(!array_filter($d['items'], fn($i) => $i[6] <= 0 || $i[3] != 18), 'every price is above 0 and every line is 18 % GST, as on the bill');
/* the bill's lines (quantity x price) add up to its taxable value 21,670.22; the 6 sq mm lines are each on several colours, so count one */
$q = ['FINOLEX SOLAR CABLE 6SQ.MM' => 200, 'H.S.TUBE 5 MM' => 10, 'H.S.TUBE 7 MM' => 10, 'PRECISION PVC ADAPTOR 20 M' => 100, '6SQ.MM CU WIRE' => 32, 'STEEL REINFORCED FLE PIPE 20MM' => 2, 'FLEXIBLE COUPLING PVC 20' => 7, 'GAS PORTABLE' => 1];
$byLine = []; foreach ($d['items'] as $i) $byLine[$i[7]] = $i[6];
$sum = 0; foreach ($q as $l => $n) $sum += $n * ($byLine[$l] ?? 0);
chk(count($byLine) === 8 && abs($sum - 21670.22) < 1, 'all 8 bill lines are there and add up to the bill (' . number_format($sum, 2) . ')');

$db = fresh();
$v = function ($sql, $a = []) use (&$db) { $s = $db->prepare($sql); $s->execute($a); return $s->fetchColumn(); }; /* by reference: the last check uses a second database */
$it = function ($name) use (&$db) { $s = $db->prepare('SELECT m.*, (SELECT COUNT(*) FROM acc_offers o WHERE o.material_id=m.id) n, (SELECT s.name FROM acc_offers o JOIN acc_suppliers s ON s.id=o.supplier_id WHERE o.id=m.offer_id) used_by, (SELECT o.rate FROM acc_offers o WHERE o.id=m.offer_id) used_rate, (SELECT o.brand FROM acc_offers o WHERE o.id=m.offer_id) used_brand FROM acc_materials m WHERE m.name=?'); $s->execute([$name]); return $s->fetch(PDO::FETCH_ASSOC); };
$db->exec("UPDATE acc_materials SET rate=90, offer_id=NULL WHERE name='V-Guard / Polycab / Havells / equivalent – AC cable 6 sq mm, yellow (phase Y)'"); /* a price the owner typed */
$db->exec("UPDATE acc_materials SET name='AC 6 sq mm blue (renamed)' WHERE name='V-Guard / Polycab / Havells / equivalent – AC cable 6 sq mm, blue (phase B)'");
$n0 = (int)$v('SELECT COUNT(*) FROM acc_materials');
acc_sup_v2($db);
chk($v("SELECT gstin FROM acc_suppliers WHERE name='Usha Electricals'") === '32AAGFU0623D1ZS' && (int)$v('SELECT COUNT(*) FROM acc_suppliers') === 3, 'Usha Electricals is added as a third supplier');
$red = $it('KEI / Polycab / V-Guard / Microtek – DC 6 sq mm cable, red'); $blk = $it('KEI / Polycab / V-Guard / Microtek – DC 6 sq mm cable, black');
chk((float)$red['rate'] == 80.51 && $red['used_by'] === 'Usha Electricals' && $red['used_brand'] === 'Finolex' && (int)$red['n'] === 2, 'DC 6 sq mm red now uses the Finolex price from Usha; the GIG Polycab price stays to compare');
chk((float)$blk['rate'] == 80.51 && $blk['used_by'] === 'Usha Electricals' && (int)$blk['n'] === 2, 'DC 6 sq mm black too');
$y = $it('V-Guard / Polycab / Havells / equivalent – AC cable 6 sq mm, yellow (phase Y)'); $r = $it('V-Guard / Polycab / Havells / equivalent – AC cable 6 sq mm, red (phase R)');
chk((float)$y['rate'] == 132 && $y['used_by'] === 'Usha Electricals' && (float)$r['rate'] == 132 && $r['offer_id'] !== null, 'the 6 sq mm copper wire price goes on the AC 6 sq mm colours, over a typed price too');
chk((int)$v("SELECT COUNT(*) FROM acc_offers o JOIN acc_materials m ON m.id=o.material_id WHERE m.name LIKE '%renamed%'") === 0, 'a renamed item is skipped');
$ht = $it('Heat shrink tube 5 mm'); $ad = $it('Precision – 20 mm PVC conduit adaptor'); $gt = $it('Portable gas torch');
chk($ht && $ht['grp'] === 'Cable accessories & consumables' && $ht['unit'] === 'm' && (float)$ht['rate'] == 12 && $ht['used_by'] === 'Usha Electricals', 'a new item is added in its category with the bill price in use');
chk($ad && $ad['grp'] === 'Pipes & conduit fittings' && (float)$ad['rate'] == 7.88 && $ad['used_brand'] === 'Precision' && $gt && (float)$gt['rate'] == 161.02, 'brand and price as printed');
chk((int)$v('SELECT COUNT(*) FROM acc_materials') === $n0 + count($new), count($new) . ' new items added');
chk($v("SELECT ref FROM acc_offers WHERE rate=48") === '23405/26-27' && $v("SELECT on_date FROM acc_offers WHERE rate=48") === '2026-11-26' && strpos((string)$v("SELECT note FROM acc_offers WHERE rate=48"), 'STEEL REINFORCED FLE PIPE 20MM') !== false, 'each price keeps the bill number, date and the line as printed');
$n1 = [(int)$v('SELECT COUNT(*) FROM acc_offers'), (int)$v('SELECT COUNT(*) FROM acc_materials')];
$db->exec("UPDATE acc_materials SET rate=1, offer_id=NULL WHERE name='Heat shrink tube 5 mm'");
acc_sup_v2($db);
chk($n1 === [(int)$v('SELECT COUNT(*) FROM acc_offers'), (int)$v('SELECT COUNT(*) FROM acc_materials')] && (float)$it('Heat shrink tube 5 mm')['rate'] == 1, 'runs once');

/* the owner already typed the supplier (other case) and one of its prices by hand: both are reused, not doubled */
$db = fresh();
$db->exec("INSERT INTO acc_suppliers(name,phone) VALUES('USHA ELECTRICALS','111')");
$sid = (int)$db->lastInsertId();
$mid = (int)$v("SELECT id FROM acc_materials WHERE name='KEI / Polycab / V-Guard / Microtek – DC 6 sq mm cable, red'");
$db->exec("INSERT INTO acc_offers(material_id,supplier_id,brand,rate) VALUES($mid,$sid,'finolex',95)");
$db->exec("INSERT INTO acc_materials(grp,name,unit,rate) VALUES('Cable accessories & consumables','heat shrink tube 7 mm','m',20)");
acc_sup_v2($db);
chk((int)$v('SELECT COUNT(*) FROM acc_suppliers') === 3 && $v('SELECT phone FROM acc_suppliers WHERE id=?', [$sid]) === '111', 'a supplier already there (any case) is reused and its details kept');
chk((int)$v('SELECT COUNT(*) FROM acc_offers WHERE material_id=? AND supplier_id=?', [$mid, $sid]) === 1 && (float)$v('SELECT rate FROM acc_offers WHERE material_id=? AND supplier_id=?', [$mid, $sid]) == 80.51, 'a price already there for the same supplier + brand is replaced, not doubled');
chk((int)$v("SELECT COUNT(*) FROM acc_materials WHERE lower(name)='heat shrink tube 7 mm'") === 1 && (float)$v("SELECT rate FROM acc_materials WHERE lower(name)='heat shrink tube 7 mm'") == 13, 'a new item already on the list by that name is not added again; it gets the bill price');
echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
