<?php
// Price list: the one-time load of the Deye hybrid inverter + battery prices (acc_sup_v4 in api/acc_seed.php).
// Usage: php tests/acc_sup_v4_test.php   (no server needed)
require __DIR__ . '/../api/acc_seed.php';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
echo "Accounts: Deye hybrid inverters and batteries load into the price list\n";
function fresh() {
  $db = new PDO('sqlite::memory:'); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $db->exec('CREATE TABLE settings(k TEXT PRIMARY KEY, v TEXT)');
  $db->exec("CREATE TABLE acc_materials(id INTEGER PRIMARY KEY AUTOINCREMENT, grp TEXT, name TEXT, unit TEXT DEFAULT 'Nos', gst REAL DEFAULT 18, rate REAL DEFAULT 0, profit REAL, hidden INTEGER DEFAULT 0, sort INTEGER DEFAULT 0, offer_id INTEGER, created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec('CREATE UNIQUE INDEX accm_name ON acc_materials(grp, lower(name))');
  $db->exec("CREATE TABLE acc_suppliers(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, tag TEXT DEFAULT '', contact TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '', gstin TEXT DEFAULT '', address TEXT DEFAULT '', note TEXT DEFAULT '', created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec('CREATE UNIQUE INDEX accs_name ON acc_suppliers(lower(name))');
  $db->exec("CREATE TABLE acc_offers(id INTEGER PRIMARY KEY AUTOINCREMENT, material_id INTEGER, supplier_id INTEGER, brand TEXT DEFAULT '', rate REAL DEFAULT 0, ref TEXT DEFAULT '', on_date TEXT DEFAULT '', note TEXT DEFAULT '', created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec('CREATE UNIQUE INDEX acco_one ON acc_offers(material_id, supplier_id, lower(brand))');
  acc_seed($db); acc_prices_v1($db); acc_sup_v1($db); acc_sup_v2($db); acc_sup_v3($db);
  return $db;
}
$items = acc_sup_v4_data()[0]['items'];
$sent = [69204, 69505, 76841, 81975, 84910, 119387, 123055, 156065, 161933, 167069, 212550, 87245, 170017, 201336];
chk(array_column($items, 6) === $sent, 'all 14 prices as sent (11 inverters, 3 batteries)');
chk(!array_filter($items, fn($i) => $i[3] != (strpos($i[1], 'inverter') !== false ? 5 : 18)), 'inverters 5 % GST, batteries 18 %');

$db = fresh();
$v = function ($sql, $a = []) use (&$db) { $s = $db->prepare($sql); $s->execute($a); return $s->fetchColumn(); };
$n0 = [(int)$v('SELECT COUNT(*) FROM acc_materials'), (int)$v('SELECT COUNT(*) FROM acc_offers'), (int)$v('SELECT COUNT(*) FROM acc_suppliers')];
acc_sup_v4($db);
chk((int)$v('SELECT COUNT(*) FROM acc_materials') === $n0[0] + 14 && (int)$v('SELECT COUNT(*) FROM acc_offers') === $n0[1] && (int)$v('SELECT COUNT(*) FROM acc_suppliers') === $n0[2], '14 items added; no supplier or supplier price made');
chk((float)$v("SELECT rate FROM acc_materials WHERE name='Deye hybrid inverter 5 kW, three phase, 48 V'") == 123055 && $v("SELECT grp FROM acc_materials WHERE name='Deye hybrid inverter 5 kW, three phase, 48 V'") === 'Inverter & optimizers' && $v("SELECT offer_id FROM acc_materials WHERE name='Deye hybrid inverter 5 kW, three phase, 48 V'") === null, 'an inverter: dealer price, inverter category, not linked');
chk((float)$v("SELECT rate FROM acc_materials WHERE name='Deye SE-F16 LV lithium battery, 314 Ah'") == 201336 && (int)$v("SELECT COUNT(*) FROM acc_materials WHERE grp='Batteries'") === 3, 'batteries in a new Batteries category');
chk(json_decode($v("SELECT v FROM settings WHERE k='acc_groups'"), true) === ['Batteries'], 'Batteries is registered as an added category');
$db->exec("UPDATE acc_materials SET rate=1 WHERE name='Deye SE-F12 LV lithium battery, 230 Ah'");
acc_sup_v4($db);
chk((float)$v("SELECT rate FROM acc_materials WHERE name='Deye SE-F12 LV lithium battery, 230 Ah'") == 1 && (int)$v('SELECT COUNT(*) FROM acc_materials') === $n0[0] + 14, 'runs once');

/* the owner already made a "Battery" category and typed one of these items by hand */
$db = fresh();
$db->exec("INSERT INTO settings(k,v) VALUES('acc_groups','[\"Battery\",\"Tools\"]')");
$db->exec("INSERT INTO acc_materials(grp,name,rate) VALUES('Inverter & optimizers','deye hybrid inverter 3 kW, single phase, 24 V',50000)");
$n0 = (int)$v('SELECT COUNT(*) FROM acc_materials');
acc_sup_v4($db);
chk((int)$v("SELECT COUNT(*) FROM acc_materials WHERE grp='Battery'") === 3 && (int)$v("SELECT COUNT(*) FROM acc_materials WHERE grp='Batteries'") === 0 && json_decode($v("SELECT v FROM settings WHERE k='acc_groups'"), true) === ['Battery', 'Tools'], 'an existing Battery category is reused, none added');
chk((int)$v('SELECT COUNT(*) FROM acc_materials') === $n0 + 13 && (float)$v("SELECT rate FROM acc_materials WHERE lower(name)='deye hybrid inverter 3 kw, single phase, 24 v'") == 69204, 'an item already there by name gets the new price, not added twice');
echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
