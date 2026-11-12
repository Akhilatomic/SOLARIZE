<?php
// Accounts: material list and the per-project cost sheet (what the plant cost us). Needs the "accounts" permission.
// Same order as ACC.GROUPS in assets/app32.js.
const ACC_GROUPS = ['Inverter & optimizers', 'Solar panels', 'Structure & supports', 'Distribution boards', 'Metering & isolation', 'DC cables & connectors',
  'AC cables & lugs', 'Earthing & lightning protection', 'Pipes & conduit fittings', 'Cable accessories & consumables', 'Services and charges'];
const ACC_GST = [0, 5, 12, 18, 28];
const ACC_MAX_LINES = 400;

/* rupee amount: blank = 0, negative or not a number is refused (same rules as comm_money) */
function acc_money($v, $label) {
  if (is_int($v) || is_float($v)) $s = (string)$v; else $s = str_replace([',', '₹', ' '], '', trim((string)$v));
  if ($s === '') return 0.0;
  if (!is_numeric($s) || (float)$s < 0 || (float)$s > 1e9) fail("$label: enter an amount in rupees");
  return round((float)$s, 2);
}

/* project with its customer; a Business Associate only reaches their own (cust_scope) */
function acc_project($pid) {
  $r = row('SELECT p.*, c.name c_name, c.phone c_phone, c.address c_address, c.district c_district, c.pincode c_pincode, c.consumer_no c_consumer_no, c.kseb_section c_kseb_section, c.landmark c_landmark, c.lat c_lat, c.lng c_lng FROM projects p JOIN customers c ON c.id=p.customer_id WHERE p.id=? AND ' . cust_scope('c'), [(int)$pid]);
  if (!$r) fail('Project not found', 404);
  return $r;
}

function acc_cost_get($pid) {
  $p = acc_project($pid); $cid = (int)$p['customer_id'];
  [$plant] = plant_get($cid);
  $lines = rows('SELECT * FROM acc_costs WHERE project_id=? ORDER BY sort, id', [(int)$pid]);
  foreach ($lines as &$l) { foreach (['id', 'project_id', 'material_id', 'sort'] as $k) $l[$k] = (int)$l[$k]; foreach (['qty', 'rate', 'gst'] as $k) $l[$k] = (float)$l[$k]; } unset($l);
  $comm = (float)(row('SELECT amount FROM commissions WHERE customer_id=?', [$cid])['amount'] ?? 0);
  $fees = [];
  $fk = ['feasibility' => ['KSEB feasibility', 18], 'registration' => ['KSEB registration', 18], 'stamp' => ['Stamp paper', 0]];
  foreach (rows("SELECT kind, amount FROM fees WHERE customer_id=? AND amount>0 AND kind IN ('feasibility','registration','stamp') ORDER BY id", [$cid]) as $f)
    $fees[] = ['kind' => $f['kind'], 'name' => $fk[$f['kind']][0], 'amount' => (float)$f['amount'], 'gst' => $fk[$f['kind']][1]];
  $latest = (int)(row('SELECT id FROM projects WHERE customer_id=? ORDER BY id DESC LIMIT 1', [$cid])['id'] ?? 0) === (int)$pid;
  $taxable = 0.0;
  if ($latest && ($t = row("SELECT data FROM gen_docs WHERE customer_id=? AND kind='tax'", [$cid]))) $taxable = (float)((json_decode((string)$t['data'], true) ?: [])['taxable'] ?? 0);
  $q = row("SELECT number FROM quotes WHERE customer_id=? ORDER BY CASE status WHEN 'Accepted' THEN 0 WHEN 'Sent' THEN 1 ELSE 2 END, id DESC LIMIT 1", [$cid]);
  return [
    'project' => ['id' => (int)$p['id'], 'title' => $p['title'], 'kw' => $p['kw'], 'stage' => $p['stage'], 'loan' => $p['loan'], 'cost' => (float)$p['cost']],
    'customer' => ['id' => $cid, 'name' => $p['c_name'], 'phone' => $p['c_phone'], 'address' => $p['c_address'], 'district' => $p['c_district'], 'pincode' => $p['c_pincode'],
      'consumer_no' => $p['c_consumer_no'], 'kseb_section' => $p['c_kseb_section'], 'landmark' => $p['c_landmark'], 'lat' => $p['c_lat'], 'lng' => $p['c_lng']],
    'plant' => $plant,
    'lines' => $lines,
    'auto' => ['comm' => $comm, 'fees' => $fees],
    'taxable' => $taxable,
    'quote_no' => (string)($q['number'] ?? ''),
  ];
}

function acc_line($l, $i) {
  if (!is_array($l)) fail('Line ' . ($i + 1) . ': not valid');
  $name = trim((string)($l['name'] ?? ''));
  if ($name === '') fail('Line ' . ($i + 1) . ': material name is required');
  if (mb_strlen($name) > 200) fail('Line ' . ($i + 1) . ': name is too long (200 characters at most)');
  $gst = (float)($l['gst'] ?? 18);
  if (!in_array($gst, array_map('floatval', ACC_GST), true)) fail('Line ' . ($i + 1) . ': GST must be 0, 5, 12, 18 or 28');
  $t = fn($k, $n) => mb_substr(trim((string)($l[$k] ?? '')), 0, $n);
  return ['material_id' => (int)($l['material_id'] ?? 0), 'grp' => $t('grp', 100), 'name' => $name, 'qty' => acc_money($l['qty'] ?? 0, "Line " . ($i + 1) . " quantity"),
    'unit' => $t('unit', 20), 'rate' => acc_money($l['rate'] ?? 0, "Line " . ($i + 1) . " rate"), 'gst' => $gst,
    'supplier' => $t('supplier', 120), 'bill_no' => $t('bill_no', 60), 'bill_date' => $t('bill_date', 10), 'note' => $t('note', 300)];
}

function acc_materials_list() {
  $rs = rows('SELECT * FROM acc_materials ORDER BY sort, name COLLATE NOCASE');
  $ord = array_flip(ACC_GROUPS);
  usort($rs, fn($a, $b) => [$ord[$a['grp']] ?? 99, (int)$a['sort'], strtolower($a['name'])] <=> [$ord[$b['grp']] ?? 99, (int)$b['sort'], strtolower($b['name'])]);
  foreach ($rs as &$r) { foreach (['id', 'hidden', 'sort'] as $k) $r[$k] = (int)$r[$k]; foreach (['gst', 'rate'] as $k) $r[$k] = (float)$r[$k]; } unset($r);
  return $rs;
}

function handle_acc($a) {
  need('accounts');
  $in = body();
  switch ($a) {
    case 'ac_cost':
      out(acc_cost_get((int)($_GET['project_id'] ?? 0)));

    case 'ac_materials':
      out(acc_materials_list());

    case 'cost_save': {
      need('accounts', true);
      $pid = (int)($in['project_id'] ?? 0); acc_project($pid);
      $lines = $in['lines'] ?? null; if (!is_array($lines)) fail('Nothing to save');
      if (count($lines) > ACC_MAX_LINES) fail('At most ' . ACC_MAX_LINES . ' lines');
      $clean = []; foreach (array_values($lines) as $i => $l) $clean[] = acc_line($l, $i); // validate everything before touching the database
      db()->exec('BEGIN IMMEDIATE');
      try {
        q('DELETE FROM acc_costs WHERE project_id=?', [$pid]);
        $nextSort = (int)q('SELECT COALESCE(MAX(sort),0) FROM acc_materials')->fetchColumn();
        foreach ($clean as $i => $l) {
          $mid = $l['material_id'];
          if ($mid && !row('SELECT 1 FROM acc_materials WHERE id=?', [$mid])) $mid = 0;
          if (!$mid) {
            $m = row('SELECT id FROM acc_materials WHERE grp=? AND lower(name)=lower(?)', [$l['grp'], $l['name']]);
            if ($m) $mid = (int)$m['id'];
            else { q('INSERT INTO acc_materials(grp,name,unit,gst,rate,sort) VALUES(?,?,?,?,?,?)', [$l['grp'], $l['name'], $l['unit'] !== '' ? $l['unit'] : 'Nos', $l['gst'], $l['rate'], ++$nextSort]); $mid = (int)db()->lastInsertId(); }
          }
          if ($l['rate'] > 0) q('UPDATE acc_materials SET rate=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$l['rate'], $mid]);
          q('INSERT INTO acc_costs(project_id,material_id,grp,name,qty,unit,rate,gst,supplier,bill_no,bill_date,note,sort) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [$pid, $mid, $l['grp'], $l['name'], $l['qty'], $l['unit'], $l['rate'], $l['gst'], $l['supplier'], $l['bill_no'], $l['bill_date'], $l['note'], $i + 1]);
        }
        db()->exec('COMMIT');
      } catch (Throwable $e) { try { db()->exec('ROLLBACK'); } catch (Throwable $e2) { } throw $e; }
      audit('acc_cost_save', 'projects', $pid, count($clean) . ' line(s)');
      out(acc_cost_get($pid));
    }

    case 'material_save': {
      need('accounts', true);
      $id = (int)($in['id'] ?? 0);
      $grp = trim((string)($in['grp'] ?? '')); $name = trim((string)($in['name'] ?? ''));
      if ($grp === '') fail('Choose a group');
      if ($name === '') fail('Material name is required');
      if (mb_strlen($name) > 200) fail('Name is too long (200 characters at most)');
      $gst = (float)($in['gst'] ?? 18); if (!in_array($gst, array_map('floatval', ACC_GST), true)) fail('GST must be 0, 5, 12, 18 or 28');
      $unit = mb_substr(trim((string)($in['unit'] ?? '')), 0, 20); if ($unit === '') $unit = 'Nos';
      $rate = acc_money($in['rate'] ?? 0, 'Rate'); $hidden = !empty($in['hidden']) ? 1 : 0;
      $dup = row('SELECT id FROM acc_materials WHERE grp=? AND lower(name)=lower(?) AND id<>?', [$grp, $name, $id]);
      if ($dup) fail("$name is already in $grp", 409);
      if ($id) {
        if (!row('SELECT 1 FROM acc_materials WHERE id=?', [$id])) fail('Material not found', 404);
        q('UPDATE acc_materials SET grp=?, name=?, unit=?, gst=?, rate=?, hidden=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$grp, $name, $unit, $gst, $rate, $hidden, $id]);
      } else {
        q('INSERT INTO acc_materials(grp,name,unit,gst,rate,hidden,sort) VALUES(?,?,?,?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM acc_materials))', [$grp, $name, $unit, $gst, $rate, $hidden]);
        $id = (int)db()->lastInsertId();
      }
      audit('acc_material_save', 'acc_materials', $id, "$grp · $name");
      out(['ok' => true, 'id' => $id]);
    }

    case 'material_delete': {
      need('accounts', true);
      $id = (int)($in['id'] ?? 0); $m = row('SELECT * FROM acc_materials WHERE id=?', [$id]); if (!$m) fail('Material not found', 404);
      trash_put('Material', $m['grp'] . ' · ' . $m['name'], [['acc_materials', 'id=?', [$id]]]);
      q('DELETE FROM acc_materials WHERE id=?', [$id]);
      audit('acc_material_delete', 'acc_materials', $id, $m['name']);
      out(['ok' => true]);
    }
  }
  fail('Unknown action', 404);
}
