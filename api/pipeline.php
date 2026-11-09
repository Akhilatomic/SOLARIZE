<?php
// Project pipeline: 4 steps, gated stages (KSEB payments need an uploaded receipt), stage history, AMC & service.

// [key, label, step, gate]  — projects.stage stores the label
const PIPE = [
  ['customer', 'Customer', 1, ''], ['feasibility', 'KSEB feasibility check', 1, ''], ['loan', 'Loan registration', 1, 'optional'],
  ['feas_pay', 'KSEB feasibility payment', 1, 'receipt'], ['pmsg', 'PMSG portal registration', 1, ''],
  ['reg_pay', 'KSEB registration fee payment', 2, 'receipt'], ['delivery', 'Material delivery', 2, ''], ['structure', 'Structure installation', 2, ''],
  ['electrical', 'Electrical installation', 2, ''], ['kseb_docs', 'KSEB documents submission', 2, ''], ['inspection', 'DISCOM inspection', 2, ''],
  ['netmeter', 'DISCOM net-meter commissioning', 2, ''], ['subsidy', 'Subsidy process', 2, ''],
  ['tax_bill', 'Tax bill generation', 3, ''], ['warranty', 'Warranty card delivery', 3, ''], ['completed', 'Project completed', 3, ''],
];
const SERVICE_TYPES = ['AMC visit', 'Panel cleaning', 'Periodic maintenance', 'Inverter service', 'Repair / complaint', 'Inspection'];

function pipe_labels() { return array_column(PIPE, 1); }
function pipe_idx($label) { $i = array_search($label, pipe_labels(), true); return $i === false ? -1 : $i; }
function pipe_key($label) { $i = pipe_idx($label); return $i < 0 ? '' : PIPE[$i][0]; }
function has_receipt($pid, $key) { return (bool)row('SELECT 1 FROM stage_data WHERE project_id=? AND stage=? AND file_id IS NOT NULL', [$pid, $key]); }
function receipts($pid) { $r = []; foreach (PIPE as $s) if ($s[3] === 'receipt') $r[$s[0]] = has_receipt($pid, $s[0]); return $r; }
// first unmet gate between the current stage and the target (moving forward past a payment stage needs its receipt)
function pipe_block($p, $to) {
  $ti = pipe_idx($to);
  foreach (PIPE as $i => $s) if ($s[3] === 'receipt' && $i < $ti && !has_receipt($p['id'], $s[0])) return $s[1];
  return null;
}
function step_log($pid, $stage, $note = '') { q('INSERT INTO project_steps(project_id,stage,note,user) VALUES(?,?,?,?)', [$pid, $stage, $note, $_SESSION['name'] ?? '']); }

function handle_pipeline($a) {
  $in = body();
  switch ($a) {
    case 'board':
      need('projects');
      $ps = rows("SELECT p.id,p.title,p.kw,p.stage,p.cost,p.loan,p.engineer,p.customer_id,p.amc_start,p.amc_end,p.amc_interval,p.updated,c.name customer,c.phone,c.district,
        (SELECT MAX(created) FROM project_steps s WHERE s.project_id=p.id) since FROM projects p LEFT JOIN customers c ON c.id=p.customer_id ORDER BY p.updated DESC");
      $rec = []; foreach (rows("SELECT project_id,stage FROM stage_data WHERE file_id IS NOT NULL") as $r) $rec[$r['project_id']][$r['stage']] = true;
      $svc = []; foreach (rows("SELECT project_id, MAX(CASE WHEN status='Done' THEN date END) last_done, MIN(CASE WHEN status='Scheduled' THEN date END) next_sched, COUNT(*) n FROM services GROUP BY project_id") as $r) $svc[$r['project_id']] = $r;
      foreach ($ps as &$p) { $p = strip_fin($p); $p['receipts'] = ['feas_pay' => !empty($rec[$p['id']]['feas_pay']), 'reg_pay' => !empty($rec[$p['id']]['reg_pay'])]; $p['svc'] = $svc[$p['id']] ?? null; } unset($p);
      out(['stages' => PIPE, 'projects' => $ps, 'service_types' => SERVICE_TYPES]);
    case 'move':
      need('projects', true);
      $p = row('SELECT * FROM projects WHERE id=?', [(int)($in['id'] ?? 0)]); if (!$p) fail('Project not found', 404);
      $to = (string)($in['stage'] ?? ''); if (pipe_idx($to) < 0) fail('Unknown stage');
      if ($to === $p['stage']) out(['ok' => true]);
      if (pipe_idx($to) > pipe_idx($p['stage']) && ($b = pipe_block($p, $to))) fail("Upload the receipt for “{$b}” before moving on (JPG or PDF, max 2 MB).", 409);
      q('UPDATE projects SET stage=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$to, $p['id']]);
      step_log($p['id'], $to, mb_substr(trim((string)($in['note'] ?? '')), 0, 300));
      audit('stage', 'projects', $p['id'], $p['stage'] . ' → ' . $to); out(['ok' => true]);
    case 'start': // lead or customer → new project at "Customer"
      need('projects', true);
      $cid = (int)($in['customer_id'] ?? 0);
      if (!empty($in['lead_id'])) {
        $l = lead_or_404($in['lead_id']); lead_need_write($l);
        if ($l['customer_id']) $cid = (int)$l['customer_id'];
        else {
          q('INSERT INTO customers(name,phone,email,address,district,notes,added_by) VALUES(?,?,?,?,?,?,?)', [$l['name'], $l['phone'], $l['email'], trim(($l['city'] ? $l['city'] . ', ' : '') . ($l['location'] ?: $l['address'])), $l['city'] ?? '', $l['notes'], $_SESSION['name'] ?? '']);
          $cid = (int)db()->lastInsertId();
          q("UPDATE leads SET customer_id=?, status='Won', notify=0, updated=CURRENT_TIMESTAMP WHERE id=?", [$cid, $l['id']]);
          audit('convert', 'leads', $l['id'], "→ customer $cid");
        }
      }
      if (!$cid || !row('SELECT 1 FROM customers WHERE id=?', [$cid])) fail('Choose a lead or customer');
      $kw = (float)($in['kw'] ?? 0); $title = trim((string)($in['title'] ?? '')) ?: (($kw ? $kw . ' kW ' : '') . 'rooftop solar');
      $loan = in_array($in['loan'] ?? '', ['Yes', 'No']) ? $in['loan'] : '';
      q("INSERT INTO projects(customer_id,title,kw,stage,cost,loan,engineer) VALUES(?,?,?,?,?,?,?)", [$cid, $title, $kw, 'Customer', can('finance') ? (float)($in['cost'] ?? 0) : 0, $loan, trim((string)($in['engineer'] ?? ''))]);
      $pid = (int)db()->lastInsertId(); step_log($pid, 'Customer', 'Project started'); audit('create', 'projects', $pid, $title);
      out(['id' => $pid, 'customer_id' => $cid]);
    case 'receipt': // KSEB payment receipt: JPG/PDF only, max 2 MB
      need('projects', true);
      $pid = (int)($_POST['project_id'] ?? 0); $key = (string)($_POST['stage'] ?? '');
      $p = row('SELECT * FROM projects WHERE id=?', [$pid]); if (!$p) fail('Project not found', 404);
      $st = array_values(array_filter(PIPE, fn($s) => $s[0] === $key && $s[3] === 'receipt'))[0] ?? null; if (!$st) fail('This stage does not take a receipt');
      $fl = $_FILES['file'] ?? null; if (!$fl || $fl['error'] !== UPLOAD_ERR_OK) fail($fl && $fl['error'] === UPLOAD_ERR_INI_SIZE ? 'File too large (max 2 MB)' : 'Choose the receipt file');
      if ($fl['size'] > 2 * 1024 * 1024) fail('Receipt must be 2 MB or smaller');
      $ext = strtolower(pathinfo($fl['name'], PATHINFO_EXTENSION)); if (!in_array($ext, ['jpg', 'jpeg', 'pdf'])) fail('Receipt must be a JPG or PDF file');
      $head = file_get_contents($fl['tmp_name'], false, null, 0, 5);
      $ok = $ext === 'pdf' ? $head === '%PDF-' : (($i = @getimagesize($fl['tmp_name'])) && $i[2] === IMAGETYPE_JPEG);
      if (!$ok) fail('That file is not a valid ' . strtoupper($ext === 'pdf' ? 'PDF' : 'JPG'));
      $amt = (float)($_POST['amount'] ?? 0); $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', $_POST['date'] ?? '') ? $_POST['date'] : date('Y-m-d');
      $dir = dirname(__DIR__) . '/data/uploads'; if (!is_dir($dir)) mkdir($dir, 0750, true);
      $name = 'rc-' . bin2hex(random_bytes(10)) . '.' . ($ext === 'jpeg' ? 'jpg' : $ext);
      if (!move_uploaded_file($fl['tmp_name'], "$dir/$name")) fail('Could not save file', 500);
      $old = row('SELECT file_id FROM stage_data WHERE project_id=? AND stage=?', [$pid, $key]);
      if ($old && $old['file_id']) { $of = row('SELECT path FROM files WHERE id=?', [$old['file_id']]); if ($of) { trash_put('Receipt (replaced)', $st[1] . ' · ' . ($p['title'] ?? 'project'), [['files', 'id=?', [$old['file_id']]]], [['projects', $pid, 'the project']]); @unlink("$dir/" . basename($of['path'])); } q('DELETE FROM files WHERE id=?', [$old['file_id']]); }
      q('INSERT INTO files(customer_id,project_id,kind,item,name,path,size,user) VALUES(?,?,?,?,?,?,?,?)', [$p['customer_id'], $pid, 'receipt', $st[1], basename($fl['name']), $name, $fl['size'], $_SESSION['username'] ?? '']);
      $fid = (int)db()->lastInsertId();
      q('INSERT INTO stage_data(project_id,stage,amount,ref,date,file_id,note,user) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(project_id,stage) DO UPDATE SET amount=excluded.amount,ref=excluded.ref,date=excluded.date,file_id=excluded.file_id,note=excluded.note,user=excluded.user,updated=CURRENT_TIMESTAMP',
        [$pid, $key, $amt, mb_substr(trim((string)($_POST['ref'] ?? '')), 0, 80), $date, $fid, mb_substr(trim((string)($_POST['note'] ?? '')), 0, 300), $_SESSION['name'] ?? '']);
      audit('receipt', 'projects', $pid, $st[1] . ($amt ? ' ₹' . $amt : '')); out(['ok' => true, 'file_id' => $fid]);
    case 'amc':
      need('projects', true);
      $pid = (int)($in['id'] ?? 0); if (!row('SELECT 1 FROM projects WHERE id=?', [$pid])) fail('Project not found', 404);
      $d = fn($k) => preg_match('/^\d{4}-\d{2}-\d{2}$/', $in[$k] ?? '') ? $in[$k] : '';
      q('UPDATE projects SET amc_start=?, amc_end=?, amc_interval=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$d('amc_start'), $d('amc_end'), max(1, min(24, (int)($in['amc_interval'] ?? 6))), $pid]);
      audit('amc', 'projects', $pid, 'AMC updated'); out(['ok' => true]);
    case 'services':
      need('projects');
      out(rows('SELECT * FROM services WHERE project_id=? ORDER BY date DESC, id DESC', [(int)($_GET['id'] ?? 0)]));
    case 'service_save':
      need('projects', true);
      $pid = (int)($in['project_id'] ?? 0); if (!row('SELECT 1 FROM projects WHERE id=?', [$pid])) fail('Project not found', 404);
      $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', $in['date'] ?? '') ? $in['date'] : fail('Choose a date');
      $v = [$date, in_array($in['type'] ?? '', SERVICE_TYPES) ? $in['type'] : SERVICE_TYPES[0], ($in['status'] ?? '') === 'Done' ? 'Done' : 'Scheduled', mb_substr(trim((string)($in['technician'] ?? '')), 0, 80), (float)($in['cost'] ?? 0), trim((string)($in['notes'] ?? ''))];
      if (!empty($in['id'])) { q('UPDATE services SET date=?,type=?,status=?,technician=?,cost=?,notes=? WHERE id=? AND project_id=?', array_merge($v, [(int)$in['id'], $pid])); $sid = (int)$in['id']; }
      else { q('INSERT INTO services(date,type,status,technician,cost,notes,project_id,user) VALUES(?,?,?,?,?,?,?,?)', array_merge($v, [$pid, $_SESSION['name'] ?? ''])); $sid = (int)db()->lastInsertId(); }
      audit('service', 'projects', $pid, $v[1] . ' ' . $v[2] . ' ' . $date); out(['id' => $sid]);
    case 'service_delete':
      need('projects', true);
      $sv = row('SELECT * FROM services WHERE id=?', [(int)($in['id'] ?? 0)]);
      if ($sv) trash_put('Service visit', $sv['type'] . ' · ' . $sv['date'] . ' · ' . (row('SELECT title FROM projects WHERE id=?', [$sv['project_id']])['title'] ?? ''), [['services', 'id=?', [$sv['id']]]], [['projects', $sv['project_id'], 'the project']]);
      q('DELETE FROM services WHERE id=?', [(int)($in['id'] ?? 0)]); out(['ok' => true]);
  }
  fail('Unknown action', 404);
}
