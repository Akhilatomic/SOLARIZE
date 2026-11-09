<?php
// Plant details per customer (panels, inverters with serial numbers, structure, rooftop, application) + documents ZIP.

const PLANT_KEYS = [
  'capacity', 'panel_make', 'panel_type', 'panel_wattage', 'panel_count',
  'inverter_make', 'inverter_count', 'inverter_type', 'inverter_capacity',
  'structure_type', 'structure_material', 'panel_arrangement',
  'system_type', 'rooftop_type', 'rooftop_age', 'building_height', 'floors', 'rooftop_penetration', 'slab_thickness', 'slab_slope',
  'gst_invoice_no', 'application_no', 'application_date', 'commissioned_on', 'warranty_till',
];

function plant_get($cid) { $r = row('SELECT data, updated, updated_by FROM plant WHERE customer_id=?', [$cid]); $d = $r ? (json_decode($r['data'], true) ?: []) : []; return [$d, $r]; }

function handle_plant($a) {
  $in = body();
  switch ($a) {
    case 'get':
      need('customers');
      $cid = (int)($_GET['customer_id'] ?? 0); if (!row('SELECT 1 FROM customers WHERE id=?', [$cid])) fail('Customer not found', 404);
      [$d, $r] = plant_get($cid);
      $p = row('SELECT * FROM projects WHERE customer_id=? ORDER BY id DESC LIMIT 1', [$cid]);
      if (!$d && $p) $d = ['capacity' => $p['kw'] ?? '', 'panel_make' => $p['panel'] ?? '', 'inverter_make' => $p['inverter'] ?? '']; // first time: start from the project
      $pay = null;
      if ($p && can('finance')) { $paid = (float)row('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE project_id=?', [$p['id']])['s']; $n = (int)row('SELECT COUNT(*) c FROM payments WHERE project_id=?', [$p['id']])['c'];
        $cost = (float)($p['cost'] ?? 0); $pay = ['cost' => $cost, 'paid' => $paid, 'count' => $n, 'pending' => max(0, $cost - $paid), 'status' => $cost <= 0 ? 'Not set' : ($paid >= $cost ? 'Fully paid' : ($paid > 0 ? 'Partly paid' : 'Unpaid'))]; }
      out(['data' => $d, 'updated' => $r['updated'] ?? null, 'updated_by' => $r['updated_by'] ?? '', 'project' => $p ? ['id' => (int)$p['id'], 'title' => $p['title'], 'stage' => $p['stage'], 'kw' => $p['kw']] : null, 'payment' => $pay]);

    case 'save':
      need('customers', true);
      $cid = (int)($in['customer_id'] ?? 0); if (!row('SELECT 1 FROM customers WHERE id=?', [$cid])) fail('Customer not found', 404);
      $v = (array)($in['data'] ?? []); $d = [];
      foreach (PLANT_KEYS as $k) $d[$k] = mb_substr(trim((string)($v[$k] ?? '')), 0, 120);
      $clean = fn($list, $keys) => array_values(array_map(fn($x) => array_combine($keys, array_map(fn($k) => mb_substr(trim((string)($x[$k] ?? '')), 0, 80), $keys)), array_slice((array)$list, 0, 400)));
      $d['panels'] = $clean($v['panels'] ?? [], ['make', 'wattage', 'serial']);
      $d['inverters'] = $clean($v['inverters'] ?? [], ['make', 'type', 'capacity', 'serial']);
      $serials = array_filter(array_merge(array_column($d['panels'], 'serial'), array_column($d['inverters'], 'serial')));
      $dup = array_keys(array_filter(array_count_values($serials), fn($c) => $c > 1));
      if ($dup) fail('Duplicate serial number: ' . implode(', ', array_slice($dup, 0, 3)));
      q('INSERT INTO plant(customer_id,data,updated,updated_by) VALUES(?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(customer_id) DO UPDATE SET data=excluded.data, updated=excluded.updated, updated_by=excluded.updated_by', [$cid, json_encode($d, JSON_UNESCAPED_UNICODE), $_SESSION['name'] ?? '']);
      audit('plant', 'customers', $cid, count($d['panels']) . ' panels, ' . count($d['inverters']) . ' inverters');
      out(['ok' => true]);

    case 'serial': // find which customer has a panel / inverter serial number
      need('customers');
      $s = trim((string)($_GET['q'] ?? '')); if (mb_strlen($s) < 3) out([]);
      $hits = [];
      foreach (rows("SELECT p.customer_id, p.data, c.name FROM plant p JOIN customers c ON c.id=p.customer_id WHERE p.data LIKE ?", ['%' . $s . '%']) as $r) {
        $d = json_decode($r['data'], true) ?: [];
        foreach (['panels' => 'Panel', 'inverters' => 'Inverter'] as $k => $lbl) foreach ($d[$k] ?? [] as $i => $x) if (stripos($x['serial'] ?? '', $s) !== false) $hits[] = ['customer_id' => (int)$r['customer_id'], 'name' => $r['name'], 'what' => "$lbl " . ($i + 1), 'serial' => $x['serial']];
      }
      out(array_slice($hits, 0, 20));
  }
  fail('Unknown action', 404);
}

// ---- documents: download all as one ZIP (stored, no compression needed for PDF/JPG; works without the zip extension) ----
function docs_zip($cid) {
  need('files');
  $c = row('SELECT name FROM customers WHERE id=?', [$cid]); if (!$c) fail('Customer not found', 404);
  $fs = rows('SELECT * FROM files WHERE customer_id=? ORDER BY id', [$cid]); if (!$fs) fail('No documents', 404);
  $dir = dirname(__DIR__) . '/data/uploads'; $used = []; $entries = []; $out = ''; $off = 0;
  foreach ($fs as $f) {
    $p = "$dir/" . basename($f['path']); if (!is_file($p)) continue;
    $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
    $base = preg_replace('/[^\w\- .()]+/u', '_', trim(($f['item'] ?: pathinfo($f['name'], PATHINFO_FILENAME)))) ?: 'document';
    $n = "$base.$ext"; $k = 2; while (isset($used[strtolower($n)])) $n = "$base ($k++).$ext"; $used[strtolower($n)] = 1;
    $data = file_get_contents($p); $crc = crc32($data); $len = strlen($data);
    $t = strtotime($f['created'] ?: 'now'); $dt = ((date('Y', $t) - 1980) << 25) | (date('n', $t) << 21) | (date('j', $t) << 16) | (date('G', $t) << 11) | ((int)date('i', $t) << 5) | ((int)date('s', $t) >> 1);
    $hdr = pack('VvvvVVVVvv', 0x04034b50, 20, 0x0800, 0, $dt, $crc, $len, $len, strlen($n), 0) . $n;
    $entries[] = [$n, $crc, $len, $dt, $off];
    $out .= $hdr . $data; $off += strlen($hdr) + $len;
  }
  $cd = '';
  foreach ($entries as [$n, $crc, $len, $dt, $o]) $cd .= pack('VvvvvVVVVvvvvvVV', 0x02014b50, 20, 20, 0x0800, 0, $dt, $crc, $len, $len, strlen($n), 0, 0, 0, 0, 0, $o) . $n;
  $out .= $cd . pack('VvvvvVVv', 0x06054b50, 0, 0, count($entries), count($entries), strlen($cd), $off, 0);
  audit('download_all', 'customers', $cid, count($entries) . ' document(s)');
  $fn = preg_replace('/[^\w\- ]+/', '', $c['name']) . ' - documents.zip';
  header_remove('Content-Type'); header('Content-Type: application/zip'); header('Content-Length: ' . strlen($out));
  header('Content-Disposition: attachment; filename="' . $fn . '"'); echo $out; exit;
}
