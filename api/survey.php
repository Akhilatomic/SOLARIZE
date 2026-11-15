<?php
/* Site survey — the first stage of a project. A lead or a customer is added to the survey list with a designated surveyor
   (default: the admin). The survey collects site photos (roof top, inverter position, earth position), the site details,
   the confirmed products and structure type, and the site plan for the panel arrangement (an uploaded sketch / drawing).
   For a lead the site details and the proposed system are the lead's own Site condition / Plant details (leads.site, leads.plant),
   so nothing is typed twice and conversion to a customer carries them on. */
const SV_STATUS = ['To visit', 'In progress', 'Done'];
const SV_SLOTS = ['roof' => 'Roof top', 'inverter' => 'Inverter position', 'earth' => 'Earth position', 'plan' => 'Site plan', 'other' => 'Other photos'];
const SV_PLANT_KEYS = ['system_type', 'capacity', 'panel_make', 'panel_type', 'panel_wattage', 'panel_count', 'inverter_make', 'inverter_type', 'inverter_capacity', 'inverter_count', 'structure_type', 'structure_material', 'plant_remarks'];
const SV_PLAN_KEYS = ['plan_panels', 'plan_rows', 'plan_orient', 'plan_size', 'plan_gap', 'plan_facing', 'plan_note'];

/* admin and assistant managers see every survey; everyone else the ones given to them or added by them */
function sv_all() { return is_admin() || ($_SESSION['role'] ?? '') === 'assistant_manager'; }
function sv_row($id) {
  $s = row('SELECT * FROM surveys WHERE id=?', [(int)$id]); if (!$s) fail('Site survey not found', 404);
  if (!sv_all() && (int)$s['assigned_to'] !== uid() && (int)$s['created_by'] !== uid()) fail('This site survey is with someone else', 403);
  return $s;
}
function sv_clean($raw, array $keys) { $v = is_array($raw) ? $raw : []; $o = [];
  foreach ($keys as $k) { $x = trim((string)($v[$k] ?? '')); if ($x !== '') $o[$k] = mb_substr($x, 0, in_array($k, ['site_remarks', 'plant_remarks', 'plan_note']) ? 1000 : 120); } return $o; }
function sv_default_user() { return (int)(row("SELECT id FROM users WHERE role='admin' AND active=1 AND COALESCE(deleted,0)=0 ORDER BY id LIMIT 1")['id'] ?? uid()); }
function sv_users() { return rows("SELECT id, name, role FROM users WHERE active=1 AND COALESCE(deleted,0)=0 AND role<>'ba' ORDER BY name"); }
function sv_notify($to, $s, $text) { $to = (int)$to; if ($to && $to !== uid()) q("INSERT INTO notifs(user_id,kind,customer_id,lead_id,from_id,text) VALUES(?,'survey',?,?,?,?)", [$to, $s['customer_id'] ?: null, $s['lead_id'] ?: null, uid(), mb_substr($text, 0, 200)]); }
/* the survey of a customer: its own, or the one started while the customer was still a lead */
function sv_of_customer($cid) {
  return row('SELECT * FROM surveys WHERE customer_id=? ORDER BY id DESC LIMIT 1', [(int)$cid])
      ?: row('SELECT s.* FROM surveys s JOIN leads l ON l.id=s.lead_id WHERE l.customer_id=? ORDER BY s.id DESC LIMIT 1', [(int)$cid]);
}
/* Pipeline → site survey: a customer put on the pipeline (a project is started) goes on the survey list by itself, given to the
   admin, unless the survey already exists. Never stops the project from being created. */
function sv_on_pipeline($cid, $pid = 0) {
  try {
    $cid = (int)$cid; if (!$cid || sv_of_customer($cid)) return 0;
    $to = sv_default_user();
    q('INSERT INTO surveys(customer_id,assigned_to,note,created_by) VALUES(?,?,?,?)', [$cid, $to, 'Added with the project on the pipeline', uid()]);
    $id = (int)db()->lastInsertId(); $s = row('SELECT * FROM surveys WHERE id=?', [$id]); $t = sv_target($s);
    audit('survey_add', 'surveys', $id, ($t['name'] ?? '') . ' · from the pipeline');
    sv_notify($to, $s, 'Site survey for you: ' . ($t['name'] ?? '') . (($t['place'] ?? '') !== '' ? ' · ' . $t['place'] : '') . ' — new on the pipeline');
    return $id;
  } catch (Throwable $e) { return 0; }
}
/* what a project page and the survey list show about the other side */
function sv_brief($cid) { $s = sv_of_customer($cid); return $s ? ['id' => (int)$s['id'], 'status' => $s['status'], 'visit_date' => $s['visit_date'], 'assigned_name' => row('SELECT name FROM users WHERE id=?', [$s['assigned_to']])['name'] ?? ''] : null; }
function sv_project($s) { $cid = (int)($s['customer_id'] ?: (row('SELECT customer_id FROM leads WHERE id=?', [(int)$s['lead_id']])['customer_id'] ?? 0));
  return $cid ? (row('SELECT id, stage, title FROM projects WHERE customer_id=? ORDER BY id DESC LIMIT 1', [$cid]) ?: null) : null; }
/* the lead or customer a survey is for */
function sv_target($s) {
  if ($s['lead_id']) { $l = row('SELECT id, name, phone, address, city, site, plant, customer_id FROM leads WHERE id=?', [$s['lead_id']]);
    return $l ? ['kind' => 'lead', 'id' => (int)$l['id'], 'name' => $l['name'], 'phone' => $l['phone'], 'place' => trim(($l['address'] ?? '') . ' ' . ($l['city'] ?? '')), 'row' => $l] : null; }
  $c = row('SELECT id, name, phone, address, district FROM customers WHERE id=?', [$s['customer_id']]);
  return $c ? ['kind' => 'customer', 'id' => (int)$c['id'], 'name' => $c['name'], 'phone' => $c['phone'], 'place' => trim(($c['address'] ?? '') . ' ' . ($c['district'] ?? '')), 'row' => $c] : null;
}

function handle_survey($a) {
  $in = body(); $uid = uid(); $dir = dirname(__DIR__) . '/data/uploads';
  switch ($a) {
    case 'boot': /* for the "Add to site survey" window */
      need('survey'); out(['users' => sv_users(), 'default_user' => sv_default_user()]);
    case 'list':
      need('survey');
      $w = sv_all() ? '1=1' : '(s.assigned_to=' . $uid . ' OR s.created_by=' . $uid . ')';
      out(['all' => sv_all() ? 1 : 0, 'rows' => rows("SELECT s.id, s.lead_id, s.customer_id, s.assigned_to, s.status, s.visit_date, s.note, s.created, s.done_at, u.name assigned_name,
        COALESCE(c.name, l.name) name, COALESCE(c.phone, l.phone) phone, TRIM(COALESCE(c.address, l.address, '') || ' ' || COALESCE(c.district, l.city, '')) place,
        (SELECT COUNT(*) FROM survey_files f WHERE f.survey_id=s.id) files,
        (SELECT p.stage FROM projects p WHERE p.customer_id=COALESCE(s.customer_id, l.customer_id) ORDER BY p.id DESC LIMIT 1) stage
        FROM surveys s LEFT JOIN users u ON u.id=s.assigned_to LEFT JOIN leads l ON l.id=s.lead_id LEFT JOIN customers c ON c.id=s.customer_id
        WHERE $w ORDER BY CASE s.status WHEN 'Done' THEN 1 ELSE 0 END, CASE WHEN s.visit_date='' THEN 1 ELSE 0 END, s.visit_date, s.id DESC LIMIT 500")]);
    case 'get':
      need('survey'); $s = sv_row($_GET['id'] ?? 0); $t = sv_target($s); if (!$t) fail('The lead or customer of this survey was deleted', 404);
      $d = json_decode((string)$s['data'], true) ?: [];
      $site = (array)($d['site'] ?? []); $plant = (array)($d['plant'] ?? []);
      if ($t['kind'] === 'lead') { /* the lead's own tabs are the truth */
        $site = (json_decode((string)($t['row']['site'] ?? ''), true) ?: []) + $site; $plant = (json_decode((string)($t['row']['plant'] ?? ''), true) ?: []) + $plant; }
      unset($t['row']);
      $prod = []; try { foreach (rows("SELECT grp, name FROM acc_materials WHERE COALESCE(hidden,0)=0 AND grp IN ('Panels','Inverter','Structure') ORDER BY sort, name") as $r) $prod[$r['grp']][] = $r['name']; } catch (Throwable $e) { }
      out(['survey' => ['id' => (int)$s['id'], 'status' => $s['status'], 'visit_date' => $s['visit_date'], 'note' => $s['note'], 'assigned_to' => (int)$s['assigned_to'], 'created' => $s['created'], 'done_at' => $s['done_at'],
          'assigned_name' => row('SELECT name FROM users WHERE id=?', [$s['assigned_to']])['name'] ?? '', 'confirmed' => !empty($d['confirmed']) ? 1 : 0, 'confirmed_by' => $d['confirmed_by'] ?? '', 'confirmed_at' => $d['confirmed_at'] ?? ''],
        'project' => can('projects') ? sv_project($s) : null, 'target' => $t, 'site' => (object)$site, 'plant' => (object)$plant, 'plan' => (object)($d['plan'] ?? []),
        'files' => rows('SELECT id, slot, name, size, user, created FROM survey_files WHERE survey_id=? ORDER BY id', [$s['id']]),
        'slots' => SV_SLOTS, 'products' => (object)$prod, 'users' => sv_users(), 'can_edit' => can('survey', true) ? 1 : 0, 'can_assign' => sv_all() || (int)$s['created_by'] === $uid ? 1 : 0]);
    case 'add': /* from a lead's or a customer's action menu */
      need('survey', true);
      $lid = (int)($in['lead_id'] ?? 0); $cid = (int)($in['customer_id'] ?? 0);
      if ($lid) { need('leads'); $l = row('SELECT id, name, customer_id FROM leads WHERE id=?', [$lid]); if (!$l) fail('Lead not found', 404); if ($l['customer_id']) { $cid = (int)$l['customer_id']; $lid = 0; } }
      if (!$lid) { need('customers'); if (!$cid || !row('SELECT 1 FROM customers WHERE id=?', [$cid])) fail('Choose a lead or a customer', 404); }
      $to = (int)($in['assigned_to'] ?? 0) ?: sv_default_user(); if (!row("SELECT 1 FROM users WHERE id=? AND active=1 AND role<>'ba'", [$to])) fail('Choose who does the survey');
      $vd = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($in['visit_date'] ?? '')) ? $in['visit_date'] : ''; $note = mb_substr(trim((string)($in['note'] ?? '')), 0, 500);
      $old = $lid ? row('SELECT * FROM surveys WHERE lead_id=?', [$lid]) : sv_of_customer($cid);
      if ($old) { /* one survey per lead / customer: adding again hands it to the chosen person */
        q("UPDATE surveys SET assigned_to=?, visit_date=CASE WHEN ?<>'' THEN ? ELSE visit_date END, note=CASE WHEN ?<>'' THEN ? ELSE note END, updated=CURRENT_TIMESTAMP WHERE id=?", [$to, $vd, $vd, $note, $note, $old['id']]);
        $id = (int)$old['id']; $new = 0;
      } else { q('INSERT INTO surveys(lead_id,customer_id,assigned_to,visit_date,note,created_by) VALUES(?,?,?,?,?,?)', [$lid ?: null, $lid ? null : $cid, $to, $vd, $note, $uid]); $id = (int)db()->lastInsertId(); $new = 1; }
      $s = row('SELECT * FROM surveys WHERE id=?', [$id]); $t = sv_target($s);
      audit($new ? 'survey_add' : 'survey_assign', 'surveys', $id, ($t['name'] ?? '') . ' → ' . (row('SELECT name FROM users WHERE id=?', [$to])['name'] ?? ''));
      if ($new || (int)$old['assigned_to'] !== $to) sv_notify($to, $s, 'Site survey for you: ' . ($t['name'] ?? '') . ($t['place'] ?? '' ? ' · ' . $t['place'] : '') . ($s['visit_date'] ? ' · visit ' . date('j M', strtotime($s['visit_date'])) : ''));
      out(['id' => $id, 'new' => $new]);
    case 'save': /* any part of the survey page; only the parts sent are changed */
      need('survey', true); $s = sv_row($in['id'] ?? 0); if ($s['status'] === 'Done' && empty($in['reopen']) && !isset($in['status'])) fail('This survey is marked done — reopen it to change it');
      $d = json_decode((string)$s['data'], true) ?: []; $t = sv_target($s);
      if (isset($in['site']) && is_array($in['site'])) { $d['site'] = sv_clean($in['site'], LEAD_SITE_KEYS);
        if ($t && $t['kind'] === 'lead') q('UPDATE leads SET site=?, updated=CURRENT_TIMESTAMP WHERE id=?', [lead_json_clean($in['site'], LEAD_SITE_KEYS), $t['id']]); }
      if (isset($in['plant']) && is_array($in['plant'])) { $d['plant'] = sv_clean($in['plant'], SV_PLANT_KEYS);
        if ($t && $t['kind'] === 'lead') q('UPDATE leads SET plant=?, updated=CURRENT_TIMESTAMP WHERE id=?', [lead_json_clean($in['plant'], LEAD_PLANT_KEYS), $t['id']]);
        $c = !empty($in['confirmed']); if ($c && empty($d['confirmed'])) { $d['confirmed_by'] = $_SESSION['name'] ?? ''; $d['confirmed_at'] = date('Y-m-d H:i'); } if (!$c) unset($d['confirmed_by'], $d['confirmed_at']); $d['confirmed'] = $c ? 1 : 0; }
      if (isset($in['plan']) && is_array($in['plan'])) $d['plan'] = sv_clean($in['plan'], SV_PLAN_KEYS);
      $set = ['data=?', 'updated=CURRENT_TIMESTAMP']; $arg = [json_encode($d, JSON_UNESCAPED_UNICODE)];
      if (isset($in['visit_date'])) { $set[] = 'visit_date=?'; $arg[] = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$in['visit_date']) ? $in['visit_date'] : ''; }
      if (isset($in['note'])) { $set[] = 'note=?'; $arg[] = mb_substr(trim((string)$in['note']), 0, 500); }
      $st = $s['status'];
      if (isset($in['status']) && in_array($in['status'], SV_STATUS, true)) { $st = $in['status']; }
      elseif ($s['status'] === 'To visit' && (isset($in['site']) || isset($in['plant']) || isset($in['plan']))) $st = 'In progress'; /* work has started */
      if ($st !== $s['status']) { $set[] = 'status=?'; $arg[] = $st; $set[] = 'done_at=' . ($st === 'Done' ? 'CURRENT_TIMESTAMP' : 'NULL'); audit('survey_status', 'surveys', $s['id'], $st);
        if ($st === 'Done') sv_notify($s['created_by'], $s, 'Site survey done: ' . ($t['name'] ?? '') . ' — by ' . ($_SESSION['name'] ?? '')); }
      if (isset($in['assigned_to']) && (int)$in['assigned_to'] !== (int)$s['assigned_to']) {
        if (!sv_all() && (int)$s['created_by'] !== $uid) fail('Only a manager or the person who added it can hand a survey to someone else', 403);
        $to = (int)$in['assigned_to']; if (!row("SELECT 1 FROM users WHERE id=? AND active=1 AND role<>'ba'", [$to])) fail('Choose who does the survey');
        $set[] = 'assigned_to=?'; $arg[] = $to; sv_notify($to, $s, 'Site survey for you: ' . ($t['name'] ?? '') . ($t['place'] ?? '' ? ' · ' . $t['place'] : '')); audit('survey_assign', 'surveys', $s['id'], (string)$to); }
      $arg[] = $s['id']; q('UPDATE surveys SET ' . implode(', ', $set) . ' WHERE id=?', $arg);
      out(['ok' => true, 'status' => $st]);
    case 'upload': /* a site photo or the site plan */
      need('survey', true); $s = sv_row($_POST['id'] ?? 0);
      $slot = (string)($_POST['slot'] ?? ''); if (!isset(SV_SLOTS[$slot])) fail('Choose where this photo belongs');
      $fl = $_FILES['file'] ?? null; $ext = sec_upload($fl, $slot === 'plan' ? ['image', 'pdf'] : ['image'], 12);
      if ((int)row('SELECT COUNT(*) c FROM survey_files WHERE survey_id=?', [$s['id']])['c'] >= 60) fail('This survey already has 60 files — delete some first');
      $name = bin2hex(random_bytes(12)) . '.' . $ext; if (!is_dir($dir)) @mkdir($dir, 0775, true);
      if (!move_uploaded_file($fl['tmp_name'], "$dir/$name")) fail('Could not save the file', 500);
      q('INSERT INTO survey_files(survey_id,slot,name,path,size,user) VALUES(?,?,?,?,?,?)', [$s['id'], $slot, mb_substr(basename((string)$fl['name']), 0, 120), $name, (int)$fl['size'], $_SESSION['name'] ?? '']);
      $fid = (int)db()->lastInsertId();
      if ($s['status'] === 'To visit') q("UPDATE surveys SET status='In progress', updated=CURRENT_TIMESTAMP WHERE id=?", [$s['id']]);
      audit('survey_upload', 'surveys', $s['id'], SV_SLOTS[$slot] . ' · ' . $fl['name']); out(['id' => $fid]);
    case 'img': /* GET: show a photo / plan */
      need('survey'); $f = row('SELECT * FROM survey_files WHERE id=?', [(int)($_GET['id'] ?? 0)]); if (!$f) fail('Not found', 404); sv_row($f['survey_id']);
      $p = "$dir/" . basename($f['path']); if (!is_file($p)) fail('File missing', 404);
      $ext = strtolower(pathinfo($f['path'], PATHINFO_EXTENSION));
      $mime = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'][$ext] ?? 'application/octet-stream';
      header_remove('Content-Type'); header('Content-Type: ' . $mime); header('X-Content-Type-Options: nosniff'); header('Cache-Control: private, max-age=86400');
      header('Content-Disposition: ' . ($mime === 'application/octet-stream' || !empty($_GET['dl']) ? 'attachment' : 'inline') . '; filename="' . str_replace('"', '', $f['name']) . '"');
      readfile($p); exit;
    case 'file_del':
      need('survey', true); $f = row('SELECT * FROM survey_files WHERE id=?', [(int)($in['id'] ?? 0)]); if (!$f) fail('Not found', 404); $s = sv_row($f['survey_id']);
      trash_put('Site survey file', (SV_SLOTS[$f['slot']] ?? 'Photo') . ' · ' . $f['name'] . ' · ' . (sv_target($s)['name'] ?? ''), [['survey_files', 'id=?', [$f['id']]]], [['surveys', $s['id'], 'the site survey']]);
      q('DELETE FROM survey_files WHERE id=?', [$f['id']]); audit('survey_file_del', 'surveys', $s['id'], $f['name']); out(['ok' => true]);
    case 'delete': /* take a lead / customer off the survey list (to the Recycle bin, with its photos) */
      need('survey', true); $s = sv_row($in['id'] ?? 0); if (!sv_all() && (int)$s['created_by'] !== $uid) fail('Only a manager or the person who added it can remove a survey', 403);
      trash_put('Site survey', (sv_target($s)['name'] ?? 'Survey') . ' (with its photos)', [['surveys', 'id=?', [$s['id']]], ['survey_files', 'survey_id=?', [$s['id']]]]);
      q('DELETE FROM survey_files WHERE survey_id=?', [$s['id']]); q('DELETE FROM surveys WHERE id=?', [$s['id']]); audit('survey_delete', 'surveys', $s['id'], ''); out(['ok' => true]);
  }
  fail('Unknown action', 404);
}
