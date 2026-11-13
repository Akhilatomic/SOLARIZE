<?php
// Price list: the one-time dealer price update (acc_prices_v1 in api/acc_seed.php).
// Usage: php tests/acc_prices_test.php   (no server needed)
require __DIR__ . '/../api/acc_seed.php';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
echo "Accounts: dealer price update\n";
$db = new PDO('sqlite::memory:'); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('CREATE TABLE settings(k TEXT PRIMARY KEY, v TEXT)');
$db->exec("CREATE TABLE acc_materials(id INTEGER PRIMARY KEY AUTOINCREMENT, grp TEXT, name TEXT, unit TEXT DEFAULT 'Nos', gst REAL DEFAULT 18, rate REAL DEFAULT 0, profit REAL, hidden INTEGER DEFAULT 0, sort INTEGER DEFAULT 0, created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
$db->exec('CREATE UNIQUE INDEX accm_name ON acc_materials(grp, lower(name))');
acc_seed($db);
$rate = fn($n) => (float)$db->query('SELECT rate FROM acc_materials WHERE name=' . $db->quote($n))->fetchColumn();
$seed = []; foreach (acc_seed_list() as $items) foreach ($items as $i) $seed[] = $i[0];
$list = acc_prices_v1_list();
chk(count($list) === 18 && !array_diff(array_keys($list), $seed), 'every priced name is an item of the seeded list');
$db->exec("UPDATE acc_materials SET name='FISHER pvc 6 MM', grp='Cable accessories & consumables' WHERE name='Fisher PVC 6 mm'"); /* other case, moved category */
$db->exec("UPDATE acc_materials SET name='SS saddle 20 mm (renamed)' WHERE name='20 mm SS saddle'");
$db->exec("UPDATE acc_materials SET rate=120, profit=20 WHERE name='Insulation tape black'");
$db->exec("UPDATE acc_materials SET rate=55000 WHERE name LIKE 'SolarEdge SE10K%'");
acc_prices_v1($db);
chk($rate('Copper conductor earthing, 10 SWG') == 1593 && $rate('Microtek – MC4 PV connector pair') == 31 && $rate('Screw SS star 6*32') == 1.59, 'matching items get the dealer price');
chk($rate('FISHER pvc 6 MM') == 0.59, 'matched whatever the case or category');
chk($rate('Insulation tape black') == 9 && (float)$db->query("SELECT profit FROM acc_materials WHERE name='Insulation tape black'")->fetchColumn() == 20, 'an older price is replaced, the profit % kept');
chk($rate('SS saddle 20 mm (renamed)') == 0, 'a renamed item is left alone');
chk($rate('SolarEdge SE10K three-phase inverter, 10 kW') == 55000 && $rate('Insulation tape green') == 0 && $rate('Aizer – 20 mm PVC conduit elbow') == 0, 'items not in the papers are not touched');
chk((int)$db->query('SELECT COUNT(*) FROM acc_materials WHERE rate>0')->fetchColumn() === 18, '17 updated + the one priced before');
$db->exec("UPDATE acc_materials SET rate=1700 WHERE name='Copper conductor earthing, 10 SWG'");
acc_prices_v1($db);
chk($rate('Copper conductor earthing, 10 SWG') == 1700, 'runs once: a price changed later stays');
echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
