<?php
// Accounts: the material list, taken from the annexure of the owner's quotation (49 lines, rates left at 0 for the owner to fill in).
// Groups are in the same order as ACC.GROUPS (assets/app32.js). Each line: [name, unit, gst].
function acc_seed_list() {
  return [
    'Inverter & optimizers' => [
      ['SolarEdge SE10K three-phase inverter, 10 kW', 'Nos', 5],
      ['SolarEdge power optimizer', 'Nos', 5],
    ],
    'Solar panels' => [
      ['Premier Energies NeoBlack DCR all-black bifacial TOPCon panel, 600 Wp (PE-132-600 THGB-G12R)', 'Nos', 5],
    ],
    'Structure & supports' => [
      ['GI mounting structure, sheet roof', 'kW', 18],
      ['45*45 channel slotted grey', 'Nos', 18],
    ],
    'Distribution boards' => [
      ['ACDB 8 kW for SolarEdge: Citel 3-phase AC SPD (DS 44-280/G), ABB 32 A 4-pole MCB, GIC indicator MCB, Tribox 12-way DB, Polycab 6 sq mm cable', 'Nos', 18],
      ['DCDB 10 kW 1-in-1-out for SolarEdge, double fuse: Citel DS50 PV 1000 V DC SPD, Mersen 30 A fuse holders, 32 A 1000 V DC isolator, Premium 12-way DB, Polycab 6 sq mm cable', 'Nos', 18],
    ],
    'Metering & isolation' => [
      ['L&T – 3 phase energy meter', 'Nos', 18],
      ['Havells – 40/4P isolator (40 A, 4 pole)', 'Nos', 18],
      ['Excel Earthings – 3 phase powder coated meter box with isolator provision (344x340x135x0.8 mm)', 'Nos', 18],
    ],
    'DC cables & connectors' => [
      ['KEI / Polycab / V-Guard / Microtek – DC 6 sq mm cable, red', 'm', 18],
      ['KEI / Polycab / V-Guard / Microtek – DC 6 sq mm cable, black', 'm', 18],
      ['Microtek – MC4 PV connector pair', 'Nos', 18],
    ],
    'AC cables & lugs' => [
      ['V-Guard / Polycab / Havells / equivalent – AC cable 6 sq mm, red (phase R)', 'm', 18],
      ['V-Guard / Polycab / Havells / equivalent – AC cable 6 sq mm, yellow (phase Y)', 'm', 18],
      ['V-Guard / Polycab / Havells / equivalent – AC cable 6 sq mm, blue (phase B)', 'm', 18],
      ['V-Guard / Polycab / Havells / equivalent – AC cable 6 sq mm, black (neutral)', 'm', 18],
      ['4-6 sq mm CU palm lug', 'Nos', 18],
    ],
    'Earthing & lightning protection' => [
      ['Excel Earthings – SS lightning arrester 14 mm x 1 m, single spike, insulated base', 'Nos', 18],
      ['Excel Earthings – Aluminium down conductor 8 mm, PVC insulated', 'm', 18],
      ['Excel Earthings – ISI nickel sealed copper bonded earth rod 14 mm x 1.2 m', 'Nos', 18],
      ['Excel Earthings – Earth pit chamber 18 x 18 cm PVC', 'Nos', 18],
      ['Excel Earthings – Earthing compound 10 kg bag', 'Nos', 18],
      ['Copper conductor earthing, 10 SWG', 'kg', 18],
      ['Excel Earthings – SS terminal strip, 4 pole', 'Nos', 18],
      ['50 sq mm AL cable MC, yellow with green', 'm', 18],
      ['Earthing 16 sq mm aluminium multi iconic', 'm', 18],
      ['AL 50 sq mm lug', 'Nos', 18],
      ['Ring lug AL 16 sq mm', 'Nos', 18],
    ],
    'Pipes & conduit fittings' => [
      ['PVC conduit pipe 20 mm, 3 m length', 'Nos', 18],
      ['Aizer – 20 mm PVC conduit elbow', 'Nos', 18],
      ['Aizer – 20 mm PVC conduit slip bend', 'Nos', 18],
      ['Aizer – 20 mm PVC conduit tee', 'Nos', 18],
      ['Aizer – 20 mm PVC conduit coupler', 'Nos', 18],
      ['20 mm SS saddle', 'Nos', 18],
      ['Fisher PVC 6 mm', 'Nos', 18],
      ['Screw SS star 6*32', 'Nos', 18],
    ],
    'Cable accessories & consumables' => [
      ['Estera – Nylon cable tie (300*4.8) black', 'Nos', 18],
      ['Insulation tape black', 'Nos', 18],
      ['Insulation tape red', 'Nos', 18],
      ['Insulation tape green', 'Nos', 18],
      ['Insulation tape yellow', 'Nos', 18],
      ['8 mm plastic sleeve', 'Nos', 18],
    ],
    'Services and charges' => [
      ['Structure welding', 'Job', 18],
      ['Installation', 'Job', 18],
      ['KSEB feasibility', 'Job', 18],
      ['KSEB registration', 'Job', 18],
      ['KSEB liaisoning, documentation and subsidy process', 'Job', 18],
      ['Transportation and handling', 'Job', 18],
    ],
  ];
}
/* Dealer prices (before GST) from NetZero ITA: quotation SAL-QTN-2026-00049 (30-10-2026) and tax invoice NZ/26-27/376 (11-11-2026).
   Only items on the price list that are the same product. Where the two papers differ, the invoice (newer, what was bought) wins. */
function acc_prices_v1_list() {
  return [
    '45*45 channel slotted grey' => 115,
    'Microtek – MC4 PV connector pair' => 31,
    '4-6 sq mm CU palm lug' => 15,
    'Excel Earthings – SS lightning arrester 14 mm x 1 m, single spike, insulated base' => 1180,
    'Excel Earthings – ISI nickel sealed copper bonded earth rod 14 mm x 1.2 m' => 307,
    'Excel Earthings – Earth pit chamber 18 x 18 cm PVC' => 278,
    'Copper conductor earthing, 10 SWG' => 1593,
    '50 sq mm AL cable MC, yellow with green' => 75,
    'Earthing 16 sq mm aluminium multi iconic' => 30,
    'AL 50 sq mm lug' => 16,
    'Ring lug AL 16 sq mm' => 8,
    '20 mm SS saddle' => 3,
    'Fisher PVC 6 mm' => 0.59,
    'Screw SS star 6*32' => 1.59,
    'Estera – Nylon cable tie (300*4.8) black' => 237,
    'Insulation tape black' => 9,
    'Insulation tape red' => 9,
    '8 mm plastic sleeve' => 10,
  ];
}
/* Sets those dealer prices once (flag acc_prices_v1), matched by name in any category; an item renamed or deleted is left alone. */
function acc_prices_v1($db) {
  if ($db->query("SELECT 1 FROM settings WHERE k='acc_prices_v1'")->fetch()) return;
  $up = $db->prepare('UPDATE acc_materials SET rate=?, updated=CURRENT_TIMESTAMP WHERE lower(trim(name))=lower(?)');
  foreach (acc_prices_v1_list() as $name => $rate) $up->execute([$rate, $name]);
  $db->exec("INSERT OR REPLACE INTO settings(k,v) VALUES('acc_prices_v1','1')");
}
/* The two suppliers and what their papers of Oct-Nov 2026 say (prices before GST):
   NQ = NetZero ITA quotation SAL-QTN-2026-00049, N375 / N376 = its invoices NZ/26-27/375 and 376;
   G1768 / G2262 = GIG Automation invoices GIGBBTV/26-1768 and 26-2262, G2086 / G2422 = its proformas GIGPI-2086 and GIGPI-2422.
   items: [category, name, unit, GST %, new item?, [[supplier, brand, price, paper, the line as printed on the paper], …]].
   An item that is not new is one of acc_seed_list() and is matched by name. */
function acc_sup_v1_data() {
  $E = 'Earthing & lightning protection'; $M = 'Metering & isolation'; $D = 'Distribution boards'; $P = 'Pipes & conduit fittings'; $C = 'Cable accessories & consumables';
  return [
    'papers' => ['NQ' => ['SAL-QTN-2026-00049', '2026-10-30'], 'N375' => ['NZ/26-27/375', '2026-11-11'], 'N376' => ['NZ/26-27/376', '2026-11-11'],
      'G1768' => ['GIGBBTV/26-1768', '2026-10-14'], 'G2086' => ['GIGPI-2086', '2026-10-17'], 'G2422' => ['GIGPI-2422', '2026-11-02'], 'G2262' => ['GIGBBTV/26-2262', '2026-11-07']],
    'suppliers' => [
      'nz' => ['NetZero ITA', 'NetZero', '8590412347', 'mail@netzeroita.com', '32AYBPK5504G2ZW', 'Mudippura Road, near Mudippura Temple, Jagathy, Thiruvananthapuram 695014'],
      'gig' => ['GIG Automation', 'GIG', '', '', '32AEVPJ2210A1Z6', 'Chittazha, near Vattappara, Trivandrum'],
    ],
    'items' => [
      ['Structure & supports', '45*45 channel slotted grey', 'Nos', 18, 0, [['nz', '', 115, 'NQ', '45*45 CHANNEL SLOTTED GREY']]],
      ['DC cables & connectors', 'Microtek – MC4 PV connector pair', 'Nos', 18, 0, [['nz', 'Microtek', 31, 'N376', 'MC4 PV CONNECTOR PAIR MICROTEK']]],
      ['DC cables & connectors', 'KEI / Polycab / V-Guard / Microtek – DC 6 sq mm cable, red', 'm', 18, 0, [['gig', 'Polycab', 87.80, 'G2422', 'DC 6 SQMM POLYCAB RED']]],
      ['DC cables & connectors', 'KEI / Polycab / V-Guard / Microtek – DC 6 sq mm cable, black', 'm', 18, 0, [['gig', 'V-Guard', 85.06, 'G2422', 'DC 6 SQMM V GUARD BLACK 100 MTR (1 coil)']]],
      ['AC cables & lugs', '4-6 sq mm CU palm lug', 'Nos', 18, 0, [['nz', '', 15, 'NQ', '4-6 SQMM CU PALM LUG']]],
      [$M, 'Havells – 40/4P isolator (40 A, 4 pole)', 'Nos', 18, 0, [['gig', 'Havells', 530, 'G2422', '40/4P ISOLATOR HAVELLS']]],
      [$M, 'Excel Earthings – 3 phase powder coated meter box with isolator provision (344x340x135x0.8 mm)', 'Nos', 18, 0, [['gig', '', 1065, 'G2422', '3 PHASE METER BOX']]],
      [$E, 'Excel Earthings – SS lightning arrester 14 mm x 1 m, single spike, insulated base', 'Nos', 18, 0, [['nz', '', 1180, 'N376', 'LIGHTNING ARRESTOR SS SINGLESPIKE']]],
      [$E, 'Excel Earthings – ISI nickel sealed copper bonded earth rod 14 mm x 1.2 m', 'Nos', 18, 0, [['nz', 'Excel', 307, 'N376', 'CB ROD 4 FEET EXCEL 250 MICRON'], ['gig', '', 203, 'G2086', '4 FT EARTH ROD']]],
      [$E, 'Excel Earthings – Earth pit chamber 18 x 18 cm PVC', 'Nos', 18, 0, [['nz', 'Estera', 278, 'N376', 'EARTH PIT CHAMBER-PVC 18*18 ESTERA'], ['nz', '', 170, 'NQ', '18*18 EARTH PIT CHAMBER N'], ['gig', '', 175, 'G1768', 'EARTH PIT CHAMBER']]],
      [$E, 'Excel Earthings – Earthing compound 10 kg bag', 'Nos', 18, 0, [['gig', 'Excel', 220, 'G1768', 'COMPOUND 10 KG EXCEL']]],
      [$E, 'Copper conductor earthing, 10 SWG', 'kg', 18, 0, [['nz', '', 1593, 'N376', 'COPPER CONDUCTOR EARTHING-10SWG'], ['gig', '', 1530, 'G2086', '10 SWG BARE COPPER']]],
      [$E, 'Excel Earthings – SS terminal strip, 4 pole', 'Nos', 18, 0, [['gig', 'Excel', 170, 'G2086', 'EARTH BENCH 4 HOLES SS EXCEL'], ['nz', '', 106, 'N376', 'EARTH BENCH 4 HOLE']]],
      [$E, '50 sq mm AL cable MC, yellow with green', 'm', 18, 0, [['nz', '', 75, 'NQ', '50 SQMM AL CABLE MC YELLOW WITH GREEN'], ['gig', 'Giga', 61.50, 'G1768', 'EARTHING -50 SQMM ALUMINIUM SINGLE GIGA']]],
      [$E, 'Earthing 16 sq mm aluminium multi iconic', 'm', 18, 0, [['gig', 'Iconic', 22, 'G2422', 'EARTHING-16SQMM ALUMINIUM MULTI ICONIC'], ['nz', '', 30, 'NQ', '16 SQMM AL CABLE MC YELLOW WITH GREEN']]],
      [$E, 'AL 50 sq mm lug', 'Nos', 18, 0, [['gig', '', 13, 'G2422', 'AL 50 SQ MM LUG'], ['nz', '', 16, 'NQ', 'RINGLUG AL50SQMM']]],
      [$E, 'Ring lug AL 16 sq mm', 'Nos', 18, 0, [['nz', '', 8, 'NQ', 'RINGLUG AL 16SQMM']]],
      [$P, 'Aizer – 20 mm PVC conduit elbow', 'Nos', 18, 0, [['nz', 'Anchor', 6.60, 'NQ', '20mm Elbow – ANCHOR CA20EBWIV']]],
      [$P, 'Aizer – 20 mm PVC conduit slip bend', 'Nos', 18, 0, [['nz', 'Anchor', 7.70, 'NQ', '20mm PVC SLIP BEND - ANCHOR CA20SLBIV']]],
      [$P, 'Aizer – 20 mm PVC conduit tee', 'Nos', 18, 0, [['nz', 'Anchor', 9.90, 'NQ', '20mm PVC CONDUIT TEE - ANCHOR CA20TEEIV']]],
      [$P, 'Aizer – 20 mm PVC conduit coupler', 'Nos', 18, 0, [['nz', 'Anchor', 5.44, 'NQ', '20 mm COUPLER - ANCHOR CA20CPLIV']]],
      [$P, '20 mm SS saddle', 'Nos', 18, 0, [['nz', '', 3, 'NQ', '20MM SS SADDLE']]],
      [$P, 'Fisher PVC 6 mm', 'Nos', 18, 0, [['nz', '', 0.59, 'NQ', 'FISHER PVC 6MM']]],
      [$P, 'Screw SS star 6*32', 'Nos', 18, 0, [['nz', '', 1.59, 'NQ', 'SCREW SS STAR 6*32']]],
      [$C, 'Estera – Nylon cable tie (300*4.8) black', 'Nos', 18, 0, [['nz', 'Estera', 237, 'NQ', 'NYLONE CABLE TIE (300*4.8) BLACK ESTERA']]],
      [$C, 'Insulation tape black', 'Nos', 18, 0, [['nz', '', 9, 'N376', 'INSULATION TAPE BLACK']]],
      [$C, 'Insulation tape red', 'Nos', 18, 0, [['nz', '', 9, 'NQ', 'INSULATION TAPE RED']]],
      [$C, '8 mm plastic sleeve', 'Nos', 18, 0, [['nz', '', 10, 'NQ', '8MM PLASTIC SLEEVE']]],
      /* new items */
      ['Inverter & optimizers', 'INVT XG 3KTL-S grid-tie inverter, 3 kW (with Wi-Fi stick)', 'Nos', 5, 1, [['nz', 'INVT', 16200, 'NQ', 'INVT-XG 3KTL-S GRID-TIE INVERTER (WITH WI-FI STICK)']]],
      ['Solar panels', 'ReNew DCR bifacial PV module, 550 Wp (RPS2MH72BD550)', 'Nos', 5, 1, [['nz', 'ReNew', 12100, 'N375', 'RENEW DCR550 BIFACIAL PV MODULE RPS2MH72BD550']]],
      [$D, 'ACDB 1-5 kW, single phase', 'Nos', 18, 1, [['nz', 'L&T / Schutz', 1499, 'N376', '1-5KW SINGLE PHASE ACDB L&T/SCHUTZ'], ['gig', 'Havells Premium CH', 1500, 'G2086', 'ACDB 1-5 KW 1 PH HAVELLS PREMIUM CH']]],
      [$D, 'DCDB 1-5 kW, 1 in 1 out', 'Nos', 18, 1, [['nz', 'L&T / Schutz', 1749, 'N376', 'DCDB 1-5KW 1IN1 OUT L&T/SCHUTZ'], ['gig', 'Havells Premium CH', 1650, 'G2086', 'DCDB 1 IN 1 OUT 1 - 5 KW HAVELLS PREMIUM CH']]],
      [$D, 'ACDB 5-12 kW, three phase', 'Nos', 18, 1, [['gig', 'Havells Premium', 3500, 'G2422', 'ACDB 5-12 KW 3 PH HAVELLS PREMIUM']]],
      [$D, 'DCDB 4-8 kW, 2 in 2 out', 'Nos', 18, 1, [['gig', 'Havells / V-Guard Premium', 3400, 'G2422', 'DCDB 2 IN 2 OUT 4-8 KW HAVELLS VGUARD PREMIUM']]],
      [$M, 'Single phase energy meter', 'Nos', 18, 1, [['nz', 'L&T', 1689, 'N376', 'SINGLE PHASE ENERGY METER L&T'], ['gig', 'Visiontek', 1202.54, 'G2086', '1 PHASE ENERGY VISIONTEK']]],
      [$M, 'Single phase net meter', 'Nos', 18, 1, [['gig', 'Visiontek', 2734.74, 'G2262', '1 PHASE NET METER - VISIONTEK']]],
      [$M, '40 A DP isolator (2 pole)', 'Nos', 18, 1, [['nz', 'V-Guard', 224, 'N376', 'DP 40A ISOLATOR VGUARD(40ADPSWV-G)'], ['nz', 'Luker', 301.86, 'NQ', '40A DP ISOLATOR LUKER'], ['gig', 'V-Guard', 208.83, 'G1768', '40 /2P ISOLATOR V GUARD']]],
      [$M, 'Single phase meter box', 'Nos', 18, 1, [['nz', 'Estera', 679, 'N376', 'METER BOX 1-PHASE ESTERA'], ['gig', '', 510, 'G2086', '1 PHASE METER BOX']]],
      ['DC cables & connectors', 'DC 4 sq mm cable, black', 'm', 18, 1, [['nz', 'KEI', 57, 'NQ', 'DC BLACK 4 sq mm CABLE-KEI']]],
      ['AC cables & lugs', 'AC cable 4 sq mm copper, black', 'm', 18, 1, [['nz', 'Anchor', 61, 'NQ', 'AC ANCHOR 4 SQMM BLACK CU CABLE']]],
      ['AC cables & lugs', 'AC cable 4 sq mm copper, red', 'm', 18, 1, [['nz', 'Anchor', 61, 'NQ', 'AC ANCHOR 4 SQMM RED CU CABLE']]],
      [$E, 'SS lightning arrester, multi spike', 'Nos', 18, 1, [['gig', 'Excel', 1100, 'G1768', 'LA MULTI - EXCEL']]],
      [$E, 'Copper bonded earth rod 13.5 mm x 3 ft', 'Nos', 18, 1, [['nz', '', 251.80, 'NQ', 'CB EARTH ROD 3FEET 13.5MM']]],
      [$E, 'Earth pit chamber, square', 'Nos', 18, 1, [['gig', '', 200, 'G2086', 'EARTH PIT CHAMBER SQUARE']]],
      [$E, 'Earthing compound 8 kg', 'Nos', 18, 1, [['nz', 'Estera', 205.85, 'N376', 'EARTHING COMPOUND 8KG ESTERA'], ['gig', '', 109, 'G2086', 'COMPOUND 8KG']]],
      [$E, '50 sq mm T holder', 'Nos', 18, 1, [['gig', '', 6.35, 'G2422', '50 SQMM T HOLDER']]],
      [$C, 'Nylon cable tie (400*4.8) white', 'Nos', 18, 1, [['nz', 'Estera', 260, 'N376', 'NYLONE CABLE TIE (400*4.8) WHITE ESTERA']]],
      [$C, 'Cable tie 4.8*350 mm white', 'Nos', 18, 1, [['gig', '', 181, 'G2422', 'CABLE TIE 4.8*350MM WHITE']]],
    ],
  ];
}
/* Loads that once (flag acc_sup_v1). A listed item is found by name in any category, and skipped when it was renamed or deleted; a new
   item is added unless one of that name is there. The dealer price is never changed for an item that has one: it is only linked to the
   supplier price of the same amount (NetZero's first: v51 took them from its papers). An item with no dealer price and one supplier
   price uses it when it is a new item or the price is for the brand in the item's name; otherwise the owner picks. */
function acc_sup_v1($db) {
  if ($db->query("SELECT 1 FROM settings WHERE k='acc_sup_v1'")->fetch()) return;
  $d = acc_sup_v1_data();
  $one = function ($sql, $a) use ($db) { $s = $db->prepare($sql); $s->execute($a); return $s->fetch(PDO::FETCH_ASSOC); };
  $db->exec('BEGIN');
  try {
    $sid = [];
    foreach ($d['suppliers'] as $k => [$name, $tag, $phone, $email, $gstin, $addr]) {
      $r = $one('SELECT id FROM acc_suppliers WHERE lower(name)=lower(?)', [$name]);
      if (!$r) { $db->prepare('INSERT INTO acc_suppliers(name,tag,phone,email,gstin,address) VALUES(?,?,?,?,?,?)')->execute([$name, $tag, $phone, $email, $gstin, $addr]); $sid[$k] = (int)$db->lastInsertId(); }
      else $sid[$k] = (int)$r['id'];
    }
    $sort = (int)$db->query('SELECT COALESCE(MAX(sort),0) FROM acc_materials')->fetchColumn();
    foreach ($d['items'] as [$grp, $name, $unit, $gst, $new, $offers]) {
      $m = $one('SELECT id, rate, offer_id FROM acc_materials WHERE lower(trim(name))=lower(?)', [$name]);
      if (!$m) {
        if (!$new) continue;
        $db->prepare('INSERT INTO acc_materials(grp,name,unit,gst,rate,sort) VALUES(?,?,?,?,0,?)')->execute([$grp, $name, $unit, $gst, ++$sort]);
        $m = ['id' => (int)$db->lastInsertId(), 'rate' => 0, 'offer_id' => null];
      }
      $mid = (int)$m['id']; $ids = [];
      foreach ($offers as [$sk, $brand, $rate, $paper, $line]) {
        [$ref, $date] = $d['papers'][$paper];
        if ($one('SELECT id FROM acc_offers WHERE material_id=? AND supplier_id=? AND lower(brand)=lower(?)', [$mid, $sid[$sk], $brand])) continue;
        $db->prepare('INSERT INTO acc_offers(material_id,supplier_id,brand,rate,ref,on_date,note) VALUES(?,?,?,?,?,?,?)')->execute([$mid, $sid[$sk], $brand, $rate, $ref, $date, 'On the bill: ' . $line]);
        $ids[] = [(int)$db->lastInsertId(), (float)$rate, $sk];
      }
      if ($m['offer_id'] || !$ids) continue;
      $use = 0;
      if ((float)$m['rate'] > 0) {
        foreach (['nz', ''] as $pref) foreach ($ids as [$oid, $r, $sk]) if (!$use && abs($r - (float)$m['rate']) < 0.005 && ($pref === '' || $sk === $pref)) $use = $oid;
        if ($use) $db->prepare('UPDATE acc_materials SET offer_id=? WHERE id=?')->execute([$use, $mid]);
      } elseif (count($ids) === 1 && count($offers) === 1 && ($new || ($offers[0][1] !== '' && stripos($name, $offers[0][1]) !== false))) $db->prepare('UPDATE acc_materials SET rate=?, offer_id=?, updated=CURRENT_TIMESTAMP WHERE id=?')->execute([$ids[0][1], $ids[0][0], $mid]);
    }
    $db->exec("INSERT OR REPLACE INTO settings(k,v) VALUES('acc_sup_v1','1')");
    $db->exec('COMMIT');
  } catch (Throwable $e) { try { $db->exec('ROLLBACK'); } catch (Throwable $e2) { } throw $e; }
}
function acc_seed($db) {
  if ((int)$db->query('SELECT COUNT(*) FROM acc_materials')->fetchColumn() > 0) return; // only fills an empty list
  $ins = $db->prepare('INSERT OR IGNORE INTO acc_materials(grp,name,unit,gst,rate,sort) VALUES(?,?,?,?,0,?)');
  $n = 0;
  $db->exec('BEGIN');
  try {
    foreach (acc_seed_list() as $grp => $items) foreach ($items as [$name, $unit, $gst]) $ins->execute([$grp, $name, $unit, $gst, ++$n]);
    $db->exec('COMMIT');
  } catch (Throwable $e) { try { $db->exec('ROLLBACK'); } catch (Throwable $e2) { } throw $e; }
}
