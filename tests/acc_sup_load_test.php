<?php
// Price list: the one-time load of suppliers, supplier prices and new items (acc_sup_v1 in api/acc_seed.php).
// Usage: php tests/acc_sup_load_test.php   (no server needed)
require __DIR__ . '/../api/acc_seed.php';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
echo "Accounts: suppliers and supplier prices load\n";
$db = new PDO('sqlite::memory:'); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('CREATE TABLE settings(k TEXT PRIMARY KEY, v TEXT)');
$db->exec("CREATE TABLE acc_materials(id INTEGER PRIMARY KEY AUTOINCREMENT, grp TEXT, name TEXT, unit TEXT DEFAULT 'Nos', gst REAL DEFAULT 18, rate REAL DEFAULT 0, profit REAL, hidden INTEGER DEFAULT 0, sort INTEGER DEFAULT 0, offer_id INTEGER, created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
$db->exec('CREATE UNIQUE INDEX accm_name ON acc_materials(grp, lower(name))');
$db->exec("CREATE TABLE acc_suppliers(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, tag TEXT DEFAULT '', contact TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '', gstin TEXT DEFAULT '', address TEXT DEFAULT '', note TEXT DEFAULT '', created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
$db->exec('CREATE UNIQUE INDEX accs_name ON acc_suppliers(lower(name))');
$db->exec("CREATE TABLE acc_offers(id INTEGER PRIMARY KEY AUTOINCREMENT, material_id INTEGER, supplier_id INTEGER, brand TEXT DEFAULT '', rate REAL DEFAULT 0, ref TEXT DEFAULT '', on_date TEXT DEFAULT '', note TEXT DEFAULT '', created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
$db->exec('CREATE UNIQUE INDEX acco_one ON acc_offers(material_id, supplier_id, lower(brand))');
acc_seed($db); acc_prices_v1($db);
$d = acc_sup_v1_data();
$seed = []; foreach (acc_seed_list() as $items) foreach ($items as $i) $seed[] = $i[0];
$old = array_filter($d['items'], fn($i) => !$i[4]); $new = array_filter($d['items'], fn($i) => $i[4]);
chk(!array_diff(array_column($old, 1), $seed), 'every item marked as already listed is a seeded item');
chk(!array_intersect(array_map('strtolower', array_column($new, 1)), array_map('strtolower', $seed)) && count(array_unique(array_column($d['items'], 1))) === count($d['items']), 'new items are new, and no item is listed twice');
$bad = 0; foreach ($d['items'] as $i) { $seen = []; foreach ($i[5] as $o) { $k = $o[0] . '|' . strtolower($o[1]); if (isset($seen[$k]) || !isset($d['suppliers'][$o[0]]) || !isset($d['papers'][$o[3]]) || $o[2] <= 0) $bad++; $seen[$k] = 1; } }
chk($bad === 0, 'every price has a known supplier and paper, and one price per supplier + brand');
$db->exec("UPDATE acc_materials SET name='Saddle SS 20 mm (renamed)' WHERE name='20 mm SS saddle'");
$db->exec("UPDATE acc_materials SET rate=1700 WHERE name='Ring lug AL 16 sq mm'"); /* a price the owner typed: not one of the papers */
acc_sup_v1($db);
$v = fn($sql, $a = []) => (function () use ($db, $sql, $a) { $s = $db->prepare($sql); $s->execute($a); return $s->fetchColumn(); })();
$it = function ($name) use ($db) { $s = $db->prepare('SELECT m.*, (SELECT COUNT(*) FROM acc_offers o WHERE o.material_id=m.id) n, (SELECT s.name FROM acc_offers o JOIN acc_suppliers s ON s.id=o.supplier_id WHERE o.id=m.offer_id) used_by, (SELECT o.rate FROM acc_offers o WHERE o.id=m.offer_id) used_rate FROM acc_materials m WHERE m.name=?'); $s->execute([$name]); return $s->fetch(PDO::FETCH_ASSOC); };
chk((int)$v('SELECT COUNT(*) FROM acc_suppliers') === 2 && $v("SELECT gstin FROM acc_suppliers WHERE name='GIG Automation'") === '32AEVPJ2210A1Z6', 'the two suppliers are added');
$cu = $it('Copper conductor earthing, 10 SWG');
chk((float)$cu['rate'] == 1593 && (int)$cu['n'] === 2 && $cu['used_by'] === 'NetZero ITA' && (float)$cu['used_rate'] == 1593, 'a priced item keeps its dealer price, linked to the NetZero price of that amount; GIG is there to compare');
$em = $it('Single phase energy meter');
chk($em && (float)$em['rate'] == 0 && (int)$em['n'] === 2 && $em['offer_id'] === null, 'a new item with two suppliers is left for the owner to pick');
$inv = $it('INVT XG 3KTL-S grid-tie inverter, 3 kW (with Wi-Fi stick)');
chk($inv && (float)$inv['rate'] == 16200 && $inv['used_by'] === 'NetZero ITA' && (int)$inv['gst'] === 5 && $inv['grp'] === 'Inverter & optimizers', 'a new item with one supplier uses that price');
$hv = $it('Havells – 40/4P isolator (40 A, 4 pole)'); $az = $it('Aizer – 20 mm PVC conduit elbow'); $mb = $it('Excel Earthings – 3 phase powder coated meter box with isolator provision (344x340x135x0.8 mm)');
chk((float)$hv['rate'] == 530 && $hv['used_by'] === 'GIG Automation', 'an unpriced listed item takes the one price that is for its own brand');
chk((float)$az['rate'] == 0 && (int)$az['n'] === 1 && $az['offer_id'] === null && (float)$mb['rate'] == 0 && $mb['offer_id'] === null, 'another brand, or no brand on the bill: shown to compare, not used');
$tr = $it('Excel Earthings – SS terminal strip, 4 pole');
chk((float)$tr['rate'] == 0 && (int)$tr['n'] === 2 && $tr['offer_id'] === null, 'two prices on an unpriced item: none used');
chk((int)$v("SELECT COUNT(*) FROM acc_offers o JOIN acc_materials m ON m.id=o.material_id WHERE m.name LIKE '%renamed%'") === 0, 'a renamed item is skipped');
$rl = $it('Ring lug AL 16 sq mm');
chk((float)$rl['rate'] == 1700 && $rl['offer_id'] === null && (int)$rl['n'] === 1, 'a dealer price that is not a supplier price stays, unlinked');
chk((int)$v('SELECT COUNT(*) FROM acc_materials') === 49 + count($new), count($new) . ' new items added');
chk(strpos((string)$v("SELECT note FROM acc_offers WHERE rate=203"), '4 FT EARTH ROD') !== false && $v("SELECT on_date FROM acc_offers WHERE rate=203") === '2026-10-17' && $v("SELECT ref FROM acc_offers WHERE rate=203") === 'GIGPI-2086', 'each price keeps the line as printed, its paper and date');
$n1 = [(int)$v('SELECT COUNT(*) FROM acc_offers'), (int)$v('SELECT COUNT(*) FROM acc_materials')];
$db->exec("UPDATE acc_materials SET rate=1, offer_id=NULL WHERE name='Copper conductor earthing, 10 SWG'");
acc_sup_v1($db);
chk($n1 === [(int)$v('SELECT COUNT(*) FROM acc_offers'), (int)$v('SELECT COUNT(*) FROM acc_materials')] && (float)$it('Copper conductor earthing, 10 SWG')['rate'] == 1, 'runs once');
echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
