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
