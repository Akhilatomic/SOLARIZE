<?php
// Project pipeline: 4 steps, stage history, AMC & service.
// Owner's rule (2026-11-14): the order is a guide, not a lock. A step can be left for later (the KSEB registration fee may be
// paid up to 29 days after the feasibility payment while the work goes on): projects.pending = JSON list of step keys that
// were passed without being done. A payment step counts as done once its receipt is uploaded; other steps by "Mark done".

// [key, label, step, gate]  — projects.stage stores the label
const PIPE = [
  ['customer', 'Customer', 1, ''], ['feasibility', 'KSEB feasibility check', 1, ''], ['loan', 'Loan registration', 1, 'optional'],
  ['feas_pay', 'KSEB feasibility payment', 1, 'receipt'], ['reg_pay', 'KSEB registration fee payment', 1, 'receipt'], ['pmsg', 'PMSG portal registration', 1, ''],
  ['delivery', 'Material delivery', 2, ''], ['structure', 'Structure installation', 2, ''],
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
/* A payment step and its fee in Finance are one thing (2026-11-17): the step is paid once its receipt is uploaded OR the fee is marked
   paid in Finance › Feasibility fee / Registration fee. */
const PIPE_FEE = ['feas_pay' => 'feasibility', 'reg_pay' => 'registration'];
function pipe_fee_on($cid, $key) { /* '' = not paid in Finance, else the payment date */
  if (!isset(PIPE_FEE[$key])) return '';
  $f = row('SELECT paid_on FROM fees WHERE customer_id=? AND kind=? AND paid=1', [(int)$cid, PIPE_FEE[$key]]);
  return $f ? (trim((string)$f['paid_on']) ?: date('Y-m-d')) : '';
}
function pipe_paid($p, $key) { return has_receipt($p['id'], $key) || pipe_fee_on($p['customer_id'] ?? 0, $key) !== ''; }
/* Finance marked a fee paid / not paid: the customer's projects follow. Paid → the step is no longer "still to do".
   Not paid (and no receipt) on a project already past the step → it is still to do again. The stage itself never moves. */
function pipe_fee_sync($cid, $kind) {
  $key = array_search($kind, PIPE_FEE, true); if ($key === false) return;
  $keys = array_column(PIPE, 0); $label = array_column(PIPE, 1, 0)[$key];
  foreach (rows("SELECT * FROM projects WHERE customer_id=? AND stage<>'Project completed'", [(int)$cid]) as $p) {
    $pend = pipe_pending($p); $in = in_array($key, $pend, true);
    if (pipe_paid($p, $key)) { if ($in) { pipe_pending_set($p['id'], array_diff($pend, [$key])); step_log($p['id'], $label, 'Paid - marked in Finance'); } }
    elseif (!$in && array_search($key, $keys, true) < pipe_idx($p['stage'])) { pipe_pending_set($p['id'], array_merge($pend, [$key])); step_log($p['id'], $label, 'Marked not paid in Finance'); }
  }
}

/* ---- no duplicate of the project the CRM made by itself ----
   The first payment (pipeline/ensure) and the tax bill (gen/cost) put a customer on the pipeline with a project of their own
   ("3 kWp solar plant"). "Start a project" / "New project" then added a second one - the duplicate on the customer profile.
   Such an automatic project nobody has worked on yet (still at "Customer", nothing left for later, no step after its creation,
   no receipt) is now filled in instead. A second project started by hand stays a second project. */
const PROJ_AUTO_NOTES = ['Added to the pipeline with the first payment', 'Project created from the tax bill'];
function proj_blanks($cid) {
  return rows("SELECT p.* FROM projects p WHERE p.customer_id=? AND p.stage='Customer' AND COALESCE(p.pending,'') IN ('','[]')
    AND (SELECT COUNT(*) FROM project_steps s WHERE s.project_id=p.id) = 1
    AND EXISTS(SELECT 1 FROM project_steps s WHERE s.project_id=p.id AND s.note IN ('" . implode("','", PROJ_AUTO_NOTES) . "'))
    AND NOT EXISTS(SELECT 1 FROM stage_data d WHERE d.project_id=p.id) ORDER BY p.id", [(int)$cid]);
}
function proj_blank($cid) { $b = proj_blanks($cid); return $b ? (int)end($b)['id'] : 0; }
/* Duplicates already made: an untouched automatic project with a project started after it is merged into that later project (the
   latest one that has been worked on, else the latest). Payments, documents, service visits, notes, calendar entries, cost lines
   and checklist ticks move over; values the kept project lacks are copied; the empty duplicate goes to the Recycle bin.
   $dry = only list. Projects started by hand are never merged. */
function proj_dupes($dry = false) {
  $out = [];
  foreach (rows('SELECT customer_id FROM projects WHERE customer_id>0 GROUP BY customer_id HAVING COUNT(*)>1') as $c) {
    $cid = (int)$c['customer_id']; $blank = array_map('intval', array_column(proj_blanks($cid), 'id')); if (!$blank) continue;
    $all = rows('SELECT * FROM projects WHERE customer_id=? ORDER BY id', [$cid]);
    $name = (string)(row('SELECT name FROM customers WHERE id=?', [$cid])['name'] ?? '');
    foreach ($all as $p) { if (!in_array((int)$p['id'], $blank, true)) continue;
      $later = array_values(array_filter($all, fn($x) => (int)$x['id'] > (int)$p['id'])); if (!$later) continue; /* nothing started after it: not a duplicate */
      $real = array_values(array_filter($later, fn($x) => !in_array((int)$x['id'], $blank, true)));
      $keep = row('SELECT * FROM projects WHERE id=?', [(int)($real ? end($real) : end($later))['id']]);
      $out[] = ['customer_id' => $cid, 'customer' => $name, 'from' => (int)$p['id'], 'from_title' => (string)$p['title'], 'into' => (int)$keep['id'], 'into_title' => (string)$keep['title']];
      if (!$dry) proj_merge($p, $keep, $name); }
  }
  return $out;
}
function proj_merge($from, $keep, $custName = '') {
  $f = (int)$from['id']; $k = (int)$keep['id']; if (!$f || !$k || $f === $k) return;
  $db = db(); $db->beginTransaction();
  try {
    trash_put('Project (duplicate merged)', ($from['title'] ?: 'Project') . ' · ' . $custName, [['projects', 'id=?', [$f]], ['project_steps', 'project_id=?', [$f]]], [['customers', $from['customer_id'], 'the customer']]);
    $set = [];
    foreach (['cost', 'kw', 'subsidy_amount'] as $col) if ((float)($keep[$col] ?? 0) <= 0 && (float)($from[$col] ?? 0) > 0) $set[$col] = $from[$col];
    foreach (['loan', 'engineer', 'panel', 'inverter', 'application_no', 'subsidy_status', 'start', 'end', 'notes'] as $col) if (trim((string)($keep[$col] ?? '')) === '' && trim((string)($from[$col] ?? '')) !== '') $set[$col] = $from[$col];
    if ($set) q('UPDATE projects SET ' . implode(',', array_map(fn($c) => "\"$c\"=?", array_keys($set))) . ', updated=CURRENT_TIMESTAMP WHERE id=?', [...array_values($set), $k]);
    foreach (['payments', 'files', 'services', 'acc_log', 'events'] as $t) q("UPDATE $t SET project_id=? WHERE project_id=?", [$k, $f]);
    q("UPDATE notes SET entity_id=? WHERE entity='projects' AND entity_id=?", [$k, $f]);
    q('UPDATE OR IGNORE checklist SET project_id=? WHERE project_id=?', [$k, $f]); q('DELETE FROM checklist WHERE project_id=?', [$f]);
    q('UPDATE OR IGNORE stage_data SET project_id=? WHERE project_id=?', [$k, $f]); q('DELETE FROM stage_data WHERE project_id=?', [$f]);
    q('UPDATE acc_costs SET project_id=? WHERE project_id=? AND lower(name) NOT IN (SELECT lower(name) FROM acc_costs WHERE project_id=?)', [$k, $f, $k]); q('DELETE FROM acc_costs WHERE project_id=?', [$f]);
    q('DELETE FROM project_steps WHERE project_id=?', [$f]); q('DELETE FROM projects WHERE id=?', [$f]);
    if (function_exists('acc_ver_bump')) acc_ver_bump($k);
    audit('merge', 'projects', $k, 'Duplicate project “' . ($from['title'] ?: 'Project') . "” (#$f) merged into this one");
    $db->commit();
  } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
}
function pipe_pending($p) { $keys = array_column(PIPE, 0); $v = json_decode((string)($p['pending'] ?? ''), true); return is_array($v) ? array_values(array_intersect($keys, $v)) : []; } /* in pipeline order */
function pipe_pending_set($pid, $keys) { q('UPDATE projects SET pending=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$keys ? json_encode(array_values($keys)) : '', $pid]); }
/* The steps still to do after moving from the current stage to $to. Forward: the stage being left is done unless $skip (or it
   is a payment step with no receipt yet); every step jumped over is left for later (not Loan registration when no loan is
   taken, not a payment step whose receipt is already in). Backward: steps from $to onwards are simply not reached yet. */
function pipe_pending_after($p, $to, $skip) {
  $ci = pipe_idx($p['stage']); $ti = pipe_idx($to); $keys = array_column(PIPE, 0);
  $pend = array_flip(pipe_pending($p));
  if ($ti > $ci) {
    for ($i = max(0, $ci); $i < $ti; $i++) { $s = PIPE[$i];
      if ($s[0] === 'loan' && ($p['loan'] ?? '') === 'No') continue;
      $rc = $s[3] === 'receipt';
      if ($rc && pipe_paid($p, $s[0])) continue;
      if ($i === $ci && !$skip && !$rc) continue; /* the stage being left: done */
      $pend[$s[0]] = 1;
    }
  }
  foreach (array_keys($pend) as $k) if (array_search($k, $keys, true) >= $ti) unset($pend[$k]);
  return array_values(array_intersect($keys, array_keys($pend)));
}
function step_log($pid, $stage, $note = '') { q('INSERT INTO project_steps(project_id,stage,note,user) VALUES(?,?,?,?)', [$pid, $stage, $note, $_SESSION['name'] ?? '']); }

function handle_pipeline($a) {
  $in = body();
  switch ($a) {
    case 'board':
      need('projects');
      $ps = rows("SELECT p.id,p.title,p.kw,p.stage,p.pending,p.cost,p.loan,p.engineer,p.customer_id,p.amc_start,p.amc_end,p.amc_interval,p.updated,c.name customer,c.phone,c.district,c.owner_id,
        (SELECT MAX(created) FROM project_steps s WHERE s.project_id=p.id) since FROM projects p LEFT JOIN customers c ON c.id=p.customer_id WHERE " . cust_scope('c') . " ORDER BY p.updated DESC");
      $rec = []; foreach (rows("SELECT project_id,stage FROM stage_data WHERE file_id IS NOT NULL") as $r) $rec[$r['project_id']][$r['stage']] = true;
      $fee = []; foreach (rows("SELECT customer_id, kind FROM fees WHERE paid=1 AND kind IN ('feasibility','registration')") as $r) $fee[$r['customer_id']][$r['kind']] = true; /* paid in Finance counts as paid here */
      $svc = []; foreach (rows("SELECT project_id, MAX(CASE WHEN status='Done' THEN date END) last_done, MIN(CASE WHEN status='Scheduled' THEN date END) next_sched, COUNT(*) n FROM services GROUP BY project_id") as $r) $svc[$r['project_id']] = $r;
      foreach ($ps as &$p) { $p = strip_fin($p); $p['pending'] = pipe_pending($p); $p['receipts'] = ['feas_pay' => !empty($rec[$p['id']]['feas_pay']) || !empty($fee[$p['customer_id']]['feasibility']), 'reg_pay' => !empty($rec[$p['id']]['reg_pay']) || !empty($fee[$p['customer_id']]['registration'])]; $p['svc'] = $svc[$p['id']] ?? null; } unset($p);
      out(['stages' => PIPE, 'projects' => $ps, 'service_types' => SERVICE_TYPES]);
    case 'move':
      need('projects', true);
      $p = row('SELECT * FROM projects WHERE id=?', [(int)($in['id'] ?? 0)]); if (!$p) fail('Project not found', 404);
      $to = (string)($in['stage'] ?? ''); if (pipe_idx($to) < 0) fail('Unknown stage');
      if ($to === $p['stage']) out(['ok' => true, 'pending' => pipe_pending($p), 'left' => []]);
      $was = pipe_pending($p); $pend = pipe_pending_after($p, $to, !empty($in['skip']));
      $left = array_values(array_diff($pend, $was)); $labels = array_column(PIPE, 1, 0);
      q('UPDATE projects SET stage=?, pending=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$to, $pend ? json_encode($pend) : '', $p['id']]);
      step_log($p['id'], $to, mb_substr(trim((string)($in['note'] ?? '')), 0, 300));
      audit('stage', 'projects', $p['id'], $p['stage'] . ' → ' . $to . ($left ? ' (left for later: ' . implode(', ', array_map(fn($k) => $labels[$k], $left)) . ')' : ''));
      out(['ok' => true, 'pending' => $pend, 'left' => array_map(fn($k) => $labels[$k], $left)]);
    case 'step_done': // a step that was left for later is done now (a payment step is done by uploading its receipt)
      need('projects', true);
      $p = row('SELECT * FROM projects WHERE id=?', [(int)($in['id'] ?? 0)]); if (!$p) fail('Project not found', 404);
      $key = (string)($in['key'] ?? ''); $st = array_values(array_filter(PIPE, fn($s) => $s[0] === $key))[0] ?? null; if (!$st) fail('Unknown stage');
      $pend = pipe_pending($p); if (!in_array($key, $pend, true)) out(['ok' => true, 'pending' => $pend]);
      if ($st[3] === 'receipt' && !pipe_paid($p, $key)) fail("Upload the receipt for “{$st[1]}” to mark it done (JPG or PDF, max 2 MB), or mark the fee paid in Finance.", 409);
      $pend = array_values(array_diff($pend, [$key])); pipe_pending_set($p['id'], $pend);
      step_log($p['id'], $st[1], mb_substr(trim((string)($in['note'] ?? '')), 0, 300) ?: 'Done later');
      audit('stage', 'projects', $p['id'], $st[1] . ' done (was left for later)'); out(['ok' => true, 'pending' => $pend]);
    case 'start': // lead or customer → new project at "Customer"
      need('projects', true);
      $cid = (int)($in['customer_id'] ?? 0);
      if (!empty($in['lead_id'])) {
        $l = lead_or_404($in['lead_id']); lead_need_write($l);
        if ($l['customer_id']) $cid = (int)$l['customer_id'];
        else {
          $onb = onboard_check($in); /* approved quotation + plant cost (api/onboard.php) */
          q('INSERT INTO customers(name,phone,email,address,district,notes,added_by,owner_id) VALUES(?,?,?,?,?,?,?,?)', [$l['name'], $l['phone'], $l['email'], trim(($l['city'] ? $l['city'] . ', ' : '') . ($l['location'] ?: $l['address'])), $l['city'] ?? '', $l['notes'], $_SESSION['name'] ?? '', (int)$l['assigned_to'] ?: uid()]);
          $cid = (int)db()->lastInsertId(); q('UPDATE customers SET lead_type=? WHERE id=?', [lead_type_of($l), $cid]);
          q("UPDATE leads SET customer_id=?, status='Won', notify=0, updated=CURRENT_TIMESTAMP WHERE id=?", [$cid, $l['id']]);
          onboard_store($cid, $onb);
          audit('convert', 'leads', $l['id'], "→ customer $cid");
        }
      }
      if (!$cid || !row('SELECT 1 FROM customers WHERE id=?', [$cid])) fail('Choose a lead or customer');
      $kw = (float)($in['kw'] ?? 0); $title = trim((string)($in['title'] ?? '')) ?: (($kw ? $kw . ' kW ' : '') . 'rooftop solar');
      $loan = in_array($in['loan'] ?? '', ['Yes', 'No']) ? $in['loan'] : '';
      if ($pid = proj_blank($cid)) { /* a project nobody has worked on yet is already there (made with the first payment / the tax bill): fill it in, no second project */
        $u = []; if (trim((string)($in['title'] ?? '')) !== '') $u['title'] = $title; if ($kw > 0) $u['kw'] = $kw; if ($loan !== '') $u['loan'] = $loan;
        if (trim((string)($in['engineer'] ?? '')) !== '') $u['engineer'] = trim((string)$in['engineer']); if (can('finance') && (float)($in['cost'] ?? 0) > 0) $u['cost'] = (float)$in['cost'];
        if ($u) q('UPDATE projects SET ' . implode(',', array_map(fn($c) => "$c=?", array_keys($u))) . ', updated=CURRENT_TIMESTAMP WHERE id=?', [...array_values($u), $pid]);
        audit('update', 'projects', $pid, ($u['title'] ?? 'Project') . ' · details filled in (already on the pipeline)'); sv_on_pipeline($cid, $pid);
        cust_cost_to_project($cid, $pid); cap_from_project($pid); cap_reconcile($cid);
        out(['id' => $pid, 'customer_id' => $cid, 'reused' => 1]);
      }
      q("INSERT INTO projects(customer_id,title,kw,stage,cost,loan,engineer) VALUES(?,?,?,?,?,?,?)", [$cid, $title, $kw, 'Customer', can('finance') ? (float)($in['cost'] ?? 0) : 0, $loan, trim((string)($in['engineer'] ?? ''))]);
      $pid = (int)db()->lastInsertId(); step_log($pid, 'Customer', 'Project started'); audit('create', 'projects', $pid, $title); sv_on_pipeline($cid, $pid); /* on the pipeline → on the site survey list */
      cust_cost_to_project($cid, $pid); /* no value typed: the plant cost agreed with the customer */
      cap_from_project($pid); cap_reconcile($cid); /* size typed: it is the customer's plant capacity; not typed: the capacity already known */
      out(['id' => $pid, 'customer_id' => $cid]);
    case 'ensure': // the customer's project, started now if there is none — recording the first payment puts the customer on the pipeline
      need('customers'); if (!can('payments', true) && !can('projects', true)) fail('Not allowed for your role', 403);
      $cid = (int)($in['customer_id'] ?? 0); if (!$cid || !row('SELECT 1 FROM customers WHERE id=?', [$cid])) fail('Customer not found', 404);
      $p = row('SELECT id FROM projects WHERE customer_id=? ORDER BY id DESC LIMIT 1', [$cid]);
      if ($p) out(['id' => (int)$p['id'], 'created' => 0]);
      [$pl] = plant_get($cid); $kw = (float)($pl['capacity'] ?? 0); $title = ($kw ? $kw . ' kWp ' : '') . 'solar plant';
      q("INSERT INTO projects(customer_id,title,kw,stage,cost) VALUES(?,?,?,'Customer',0)", [$cid, ucfirst($title), $kw]);
      $pid = (int)db()->lastInsertId(); step_log($pid, 'Customer', 'Added to the pipeline with the first payment'); audit('create', 'projects', $pid, ucfirst($title)); sv_on_pipeline($cid, $pid);
      cust_cost_to_project($cid, $pid); /* the plant cost agreed with the customer */
      $cost = round(max(0, (float)($in['cost'] ?? 0)), 2);
      if ($cost > 0 && can('finance')) q('UPDATE projects SET cost=? WHERE id=? AND (cost IS NULL OR cost=0)', [$cost, $pid]);
      cap_from_project($pid); cap_reconcile($cid);
      out(['id' => $pid, 'created' => 1]);
    case 'dupes': // admin: list ({dry:1}) or merge untouched duplicate projects (proj_dupes)
      if (!is_admin()) fail('Not allowed for your role', 403);
      out(['merged' => proj_dupes(!empty($in['dry']))]);
    case 'receipt': // KSEB payment receipt: JPG/PDF only, max 2 MB
      need('projects', true);
      $pid = (int)($_POST['project_id'] ?? 0); $key = (string)($_POST['stage'] ?? '');
      $p = row('SELECT * FROM projects WHERE id=?', [$pid]); if (!$p) fail('Project not found', 404);
      $st = array_values(array_filter(PIPE, fn($s) => $s[0] === $key && $s[3] === 'receipt'))[0] ?? null; if (!$st) fail('This stage does not take a receipt');
      $fl = $_FILES['file'] ?? null;
      $ext = sec_upload($fl, ['image', 'pdf'], 2); if (!in_array($ext, ['jpg', 'pdf'])) fail('Receipt must be a JPG or PDF file');
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
      try { fee_from_receipt((int)$p['customer_id'], $key, $amt, $date, (string)($_POST['ref'] ?? '')); } catch (Throwable $e) { } // Finance › fee marked paid
      $pend = pipe_pending($p); if (in_array($key, $pend, true)) { pipe_pending_set($pid, array_diff($pend, [$key])); step_log($pid, $st[1], 'Receipt uploaded'); } /* left for later → done */
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
