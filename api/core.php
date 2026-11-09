<?php
// Auth + generic CRUD + domain modules (leads, customers, projects, quotes, checklist, files)

function handle_auth($a) {
  $in = body();
  $count = (int)row('SELECT COUNT(*) c FROM users')['c'];
  $old = dirname(__DIR__) . '/data/config.php'; // v1 single-password install -> first admin
  if ($count === 0 && is_file($old)) { $cfg = include $old; q('INSERT INTO users(name,username,hash,role) VALUES(?,?,?,?)', ['Admin', 'admin', $cfg['hash'], 'admin']); $count = 1; }
  if ($a === 'status') out(['setup' => $count === 0, 'auth' => !empty($_SESSION['uid']), 'user' => me(), 'brand' => branding()]);
  if ($a === 'setup') {
    if ($count) fail('Already set up', 403);
    $u = trim($in['username'] ?? ''); $pw = $in['password'] ?? ''; $n = trim($in['name'] ?? '') ?: $u;
    if ($u === '') fail('Username is required'); sec_password_ok($pw, $u);
    q('INSERT INTO users(name,username,hash,role) VALUES(?,?,?,?)', [$n, $u, password_hash($pw, PASSWORD_DEFAULT), 'admin']);
    login_as(row('SELECT * FROM users WHERE username=?', [$u])); audit('setup', 'users'); out(['ok' => true]);
  }
  if ($a === 'login') {
    $un = mb_substr(trim((string)($in['username'] ?? '')), 0, 60);
    login_guard_check($un);
    usleep(400000);
    $u = row('SELECT * FROM users WHERE username=? AND active=1', [$un]);
    if ($u && password_verify((string)($in['password'] ?? ''), $u['hash'])) {
      if (password_needs_rehash($u['hash'], PASSWORD_DEFAULT)) q('UPDATE users SET hash=? WHERE id=?', [password_hash($in['password'], PASSWORD_DEFAULT), $u['id']]);
      login_guard_ok($un); login_as($u); audit('login', 'users', $u['id'], 'from ' . client_ip()); out(['ok' => true]); }
    login_guard_fail($un);
    fail('Wrong username or password', 401);
  }
  if ($a === 'logout') { session_unset(); session_destroy(); setcookie(session_name(), '', ['expires' => 1, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict', 'secure' => !empty($_SERVER['HTTPS'])]); out(['ok' => true]); }
  if (empty($_SESSION['uid'])) fail('Unauthorized', 401);
  if ($a === 'password') {
    $u = row('SELECT * FROM users WHERE id=?', [$_SESSION['uid']]);
    if (!password_verify($in['old'] ?? '', $u['hash'])) fail('Wrong current password', 401);
    sec_password_ok((string)($in['new'] ?? ''), $u['username']);
    q('UPDATE users SET hash=?, sess_ver=sess_ver+1 WHERE id=?', [password_hash($in['new'], PASSWORD_DEFAULT), $u['id']]); // signs out every other device
    $_SESSION['sv'] = (int)row('SELECT sess_ver FROM users WHERE id=?', [$u['id']])['sess_ver']; audit('password', 'users', $u['id']); out(['ok' => true]);
  }
  fail('Unknown action', 404);
}
function login_as($u) { session_regenerate_id(true); $_SESSION['sv'] = (int)($u['sess_ver'] ?? 0); $_SESSION['seen'] = time(); $_SESSION['uid'] = (int)$u['id']; $_SESSION['role'] = $u['role']; $_SESSION['username'] = $u['username']; $_SESSION['name'] = $u['name']; }
function me() {
  if (empty($_SESSION['uid'])) return null;
  $r = roles()[$_SESSION['role']] ?? [[], []]; $cc = can_claim();
  return ['id' => $_SESSION['uid'], 'name' => $_SESSION['name'], 'username' => $_SESSION['username'], 'role' => $_SESSION['role'], 'role_name' => ROLE_NAMES[$_SESSION['role']] ?? $_SESSION['role'], 'read' => $cc && $r[0] !== '*' ? array_values(array_unique(array_merge($r[0], CLAIM_GRANTS))) : $r[0], 'write' => $cc && $r[1] !== '*' ? array_values(array_unique(array_merge($r[1], CLAIM_GRANTS))) : $r[1], 'can_claim' => $cc ? 1 : 0];
}

function handle_crud($t, $a) {
  global $E;
  [$mod, $cols] = $E[$t];
  $in = body();
  need($mod, in_array($a, ['save', 'delete', 'convert', 'revert']));
  if ($t === 'leads') lead_guard($a, $in);
  switch ($a) {
    case 'list':
      if ($t === 'customers') out(array_map(fn($r) => mask_customer(strip_fin($r)), rows("SELECT c.*, lp.id project_id, lp.stage, lp.kw, (SELECT COUNT(*) FROM projects WHERE customer_id=c.id) projects
        FROM customers c LEFT JOIN projects lp ON lp.id=(SELECT id FROM projects WHERE customer_id=c.id ORDER BY id DESC LIMIT 1) ORDER BY c.created DESC, c.id DESC")));
      if ($t === 'projects') out(array_map('strip_fin', rows('SELECT p.*, c.name customer, c.phone, COALESCE((SELECT SUM(amount) FROM payments WHERE project_id=p.id),0) paid FROM projects p LEFT JOIN customers c ON c.id=p.customer_id ORDER BY p.updated DESC')));
      $w = []; $args = [];
      foreach (['customer_id','project_id','campaign_id','lead_id','status','stage','source','assigned_to'] as $f)
        if (in_array($f, $cols) && isset($_GET[$f]) && $_GET[$f] !== '') { $w[] = "$f=?"; $args[] = $_GET[$f]; }
      out(rows("SELECT * FROM $t" . ($w ? ' WHERE ' . implode(' AND ', $w) : '') . ' ORDER BY updated DESC, id DESC', $args));
    case 'get':
      $r = row("SELECT * FROM $t WHERE id=?", [(int)($_GET['id'] ?? 0)]); if (!$r) fail('Not found', 404);
      $r = in_array($t, ['projects', 'customers', 'leads']) ? strip_fin(detail($t, $r)) : detail($t, $r);
      out($t === 'customers' ? mask_customer($r) : $r);
    case 'save':
      $v = pick($in, $cols);
      if (isset($v['name']) && $v['name'] === '') fail('Name required');
      if ($t === 'projects' && !$v['customer_id']) fail('Select a customer');
      if ($t === 'quotes') { $v = prep_quote($v, $in); }
      if ($t === 'projects') $v['stage'] = 'Customer';
      if ($t === 'leads' && $v['status'] === '') $v['status'] = 'New';
      if ($t === 'leads') { $v['site'] = lead_json_clean($in['site'] ?? '', LEAD_SITE_KEYS); $v['plant'] = lead_json_clean($in['plant'] ?? '', LEAD_PLANT_KEYS); }
      if (!empty($in['id'])) {
        $id = (int)$in['id'];
        if ($t === 'projects') { $prot = ['stage', 'amc_start', 'amc_end', 'amc_interval']; if (!can('finance')) array_push($prot, 'cost', 'subsidy_amount'); foreach ($prot as $k) unset($v[$k]); $cols = array_values(array_diff($cols, $prot)); }
        if ($t === 'leads' && !can('finance')) { unset($v['budget']); $cols = array_values(array_diff($cols, ['budget'])); }
        if ($t === 'customers') { unset($v['added_by']); $cols = array_values(array_diff($cols, ['added_by'])); if (strpos((string)($v['bank_account'] ?? ''), '•') !== false) { unset($v['bank_account']); $cols = array_values(array_diff($cols, ['bank_account'])); } }
        if ($t === 'leads') { $keep = ['added_by','meta_id','meta_form','meta_ad','meta_campaign','notify','assigned_to','claimed_at']; foreach ($keep as $k) unset($v[$k]); $cols = array_values(array_diff($cols, $keep)); }
        $set = implode(',', array_map(fn($c) => "$c=:$c", $cols));
        $v['id'] = $id;
        q("UPDATE $t SET $set, updated=CURRENT_TIMESTAMP WHERE id=:id", $v);
        audit('update', $t, $id, $v['name'] ?? ($v['title'] ?? ''));
      } else {
        if ($t === 'customers') $v['added_by'] = $_SESSION['name'] ?? '';
        if ($t === 'leads') { $v['added_by'] = $_SESSION['name'] ?? ''; $v['notify'] = 0;
          // a lead added by a staff member is automatically claimed by them; admin-added leads start unclaimed
          if (!is_admin()) { $v['assigned_to'] = uid(); $v['claimed_at'] = gmdate('Y-m-d H:i:s'); } else { $v['assigned_to'] = (int)($in['assigned_to'] ?? 0) ?: null; $v['claimed_at'] = $v['assigned_to'] ? gmdate('Y-m-d H:i:s') : ''; } }
        q("INSERT INTO $t(" . implode(',', $cols) . ') VALUES(' . implode(',', array_map(fn($c) => ":$c", $cols)) . ')', $v);
        $id = (int)db()->lastInsertId(); audit('create', $t, $id, $v['name'] ?? ($v['title'] ?? ''));
        if ($t === 'projects') step_log($id, 'Customer', 'Project created');
        if ($t === 'quotes' && $v['number'] === '') {
          $c = settings()['company'];
          q('UPDATE quotes SET number=? WHERE id=?', [($c['quote_prefix'] ?: 'Q') . '-' . date('y') . '-' . str_pad($id, 4, '0', STR_PAD_LEFT), $id]);
        }
      }
      out(['id' => $id]);
    case 'delete':
      $id = (int)($in['id'] ?? 0);
      trash_crud($t, $id); // snapshot into the Recycle bin first (restorable for 72 hours)
      if ($t === 'customers') {
        q('DELETE FROM plant WHERE customer_id=?', [$id]);
        foreach (rows('SELECT id FROM projects WHERE customer_id=?', [$id]) as $p) purge_project($p['id']);
        q('DELETE FROM quotes WHERE customer_id=?', [$id]); q('DELETE FROM messages WHERE customer_id=?', [$id]); q('UPDATE leads SET customer_id=NULL WHERE customer_id=?', [$id]);
      }
      if ($t === 'projects') { purge_project($id); q('DELETE FROM project_steps WHERE project_id=?', [$id]); q('DELETE FROM stage_data WHERE project_id=?', [$id]); q('DELETE FROM services WHERE project_id=?', [$id]); }
      if ($t === 'leads' || $t === 'customers') { $col = $t === 'leads' ? 'lead_id' : 'customer_id';
        foreach (rows("SELECT id FROM discussions WHERE $col=?", [$id]) as $d) { q('DELETE FROM disc_msgs WHERE discussion_id=?', [$d['id']]); q('DELETE FROM disc_reads WHERE discussion_id=?', [$d['id']]); }
        q("DELETE FROM discussions WHERE $col=?", [$id]); q("DELETE FROM notifs WHERE $col=?", [$id]); }
      if ($t === 'campaigns') { q('DELETE FROM ad_spend WHERE campaign_id=?', [$id]); q('UPDATE leads SET campaign_id=NULL WHERE campaign_id=?', [$id]); }
      q("DELETE FROM $t WHERE id=?", [$id]); q('DELETE FROM notes WHERE entity=? AND entity_id=?', [$t, $id]);
      audit('delete', $t, $id); out(['ok' => true]);
    case 'revert': // customer → back to leads (undo a conversion)
      if ($t !== 'customers') fail('Unknown action', 404);
      need('leads', true);
      $cu = row('SELECT * FROM customers WHERE id=?', [(int)($in['id'] ?? 0)]); if (!$cu) fail('Customer not found', 404);
      // what a revert would delete: projects (status, steps, checklist, payments) and every uploaded document
      $projs = rows('SELECT id, title, stage, kw FROM projects WHERE customer_id=?', [$cu['id']]);
      $pids = array_map(fn($p) => (int)$p['id'], $projs); $pin = $pids ? implode(',', $pids) : '0';
      $nf = (int)row("SELECT COUNT(*) c FROM files WHERE customer_id=? OR project_id IN ($pin)", [$cu['id']])['c'];
      $pay = row("SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM payments WHERE project_id IN ($pin)");
      if (($projs || $nf) && empty($in['confirm'])) {
        $o = ['confirm' => 1, 'name' => $cu['name'], 'projects' => array_map(fn($p) => ['title' => $p['title'], 'stage' => $p['stage'], 'kw' => $p['kw']], $projs), 'docs' => $nf, 'payments' => (int)$pay['n']];
        if (can('finance')) $o['paid'] = (float)$pay['s'];
        out($o);
      }
      if ((int)$pay['n'] && !is_admin()) fail('This customer has recorded payments. Only an admin can revert it to a lead.', 403);
      $linked = array_column(rows('SELECT id FROM leads WHERE customer_id=?', [$cu['id']]), 'id');
      trash_put('Customer (reverted to lead)', $cu['name'] . ($projs ? ' · ' . count($projs) . ' project(s)' : '') . ($nf ? " · $nf document(s)" : ''), trash_spec_customer($cu['id'], false), [], [['leads', 'customer_id', $cu['id'], $linked]]);
      foreach ($pids as $pid) { purge_project($pid); q('DELETE FROM project_steps WHERE project_id=?', [$pid]); q('DELETE FROM stage_data WHERE project_id=?', [$pid]); q('DELETE FROM services WHERE project_id=?', [$pid]); q('DELETE FROM projects WHERE id=?', [$pid]); }
      foreach (rows('SELECT path FROM files WHERE customer_id=?', [$cu['id']]) as $f) @unlink(dirname(__DIR__) . '/data/uploads/' . basename($f['path']));
      q('DELETE FROM files WHERE customer_id=?', [$cu['id']]);
      $gone = ($projs ? count($projs) . ' project(s) incl. status & ' . (int)$pay['n'] . ' payment(s), ' : '') . ($nf ? "$nf document(s)" : '');
      $why = mb_substr(trim((string)($in['reason'] ?? '')), 0, 300);
      $stamp = date('d M Y') . ' · reverted from customer by ' . ($_SESSION['name'] ?? '') . ($why ? ": $why" : '');
      $hasQuote = (int)row('SELECT COUNT(*) c FROM quotes WHERE customer_id=?', [$cu['id']])['c'] > 0;
      $l = row('SELECT * FROM leads WHERE customer_id=? ORDER BY id DESC LIMIT 1', [$cu['id']]);
      if ($l) { // the lead it came from: reopen it
        $old = trim((string)($l['notes'] ?? ''));
        q('UPDATE leads SET customer_id=NULL, status=?, notes=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$hasQuote ? 'Quoted' : 'Contacted', $old === '' ? $stamp : $old . "\n" . $stamp, $l['id']]);
        $lid = (int)$l['id'];
      } else { // customer was added directly: create a lead from it
        q('INSERT INTO leads(name,phone,email,address,city,location,source,status,added_by,assigned_to,claimed_at,kw,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [$cu['name'], $cu['phone'], $cu['email'], $cu['address'], $cu['district'], $cu['address'], 'Customer (reverted)', $hasQuote ? 'Quoted' : 'Contacted', $_SESSION['name'] ?? '', uid(), date('Y-m-d H:i:s'), $cu['kw'] ?? null, trim(($cu['notes'] ?? '') . "\n" . $stamp)]);
        $lid = (int)db()->lastInsertId();
      }
      q('UPDATE leads SET customer_id=NULL WHERE customer_id=?', [$cu['id']]);
      q('UPDATE quotes SET lead_id=COALESCE(lead_id, ?), customer_id=NULL WHERE customer_id=?', [$lid, $cu['id']]); // quotes stay with the lead
      q("UPDATE notes SET entity='leads', entity_id=? WHERE entity='customers' AND entity_id=?", [$lid, $cu['id']]);
      q('UPDATE discussions SET lead_id=?, customer_id=NULL WHERE customer_id=?', [$lid, $cu['id']]); q('UPDATE notifs SET lead_id=?, customer_id=NULL WHERE customer_id=?', [$lid, $cu['id']]); // discussions follow it back
      q('UPDATE messages SET lead_id=COALESCE(lead_id, ?), customer_id=NULL WHERE customer_id=?', [$lid, $cu['id']]); // WhatsApp log stays with the lead
      q('DELETE FROM plant WHERE customer_id=?', [$cu['id']]); q('DELETE FROM customers WHERE id=?', [$cu['id']]);
      audit('revert', 'customers', $cu['id'], "{$cu['name']} → lead $lid" . ($why ? " · $why" : '') . ($gone ? " · deleted $gone" : ''));
      out(['lead_id' => $lid, 'reopened' => $l ? 1 : 0]);
    case 'convert':
      if ($t !== 'leads') fail('Unknown action', 404);
      $l = row('SELECT * FROM leads WHERE id=?', [(int)($in['id'] ?? 0)]); if (!$l) fail('Not found', 404);
      if ($l['customer_id']) out(['customer_id' => $l['customer_id']]);
      q('INSERT INTO customers(name,phone,email,address,district,notes,added_by) VALUES(?,?,?,?,?,?,?)', [$l['name'], $l['phone'], $l['email'], trim(($l['city'] ? $l['city'] . ', ' : '') . ($l['location'] ?: $l['address'])), $l['city'] ?? '', $l['notes'], $_SESSION['name'] ?? '']);
      $cid = (int)db()->lastInsertId();
      q("UPDATE leads SET customer_id=?, status='Won', updated=CURRENT_TIMESTAMP WHERE id=?", [$cid, $l['id']]);
      lead_to_customer_plant($l, $cid); // site condition + proposed plant → customer's Plant details
      q('UPDATE quotes SET customer_id=? WHERE lead_id=? AND customer_id IS NULL', [$cid, $l['id']]);
      q('UPDATE discussions SET customer_id=?, lead_id=NULL WHERE lead_id=?', [$cid, $l['id']]); q('UPDATE notifs SET customer_id=?, lead_id=NULL WHERE lead_id=?', [$cid, $l['id']]);
      audit('convert', 'leads', $l['id'], "→ customer $cid"); out(['customer_id' => $cid]);
  }
  fail('Unknown action', 404);
}

function purge_project($id) { // files were already moved to the Recycle bin by trash_put
  foreach (rows('SELECT path FROM files WHERE project_id=?', [$id]) as $f) @unlink(dirname(__DIR__) . '/data/uploads/' . basename($f['path']));
  q('DELETE FROM files WHERE project_id=?', [$id]); q('DELETE FROM checklist WHERE project_id=?', [$id]);
  q('DELETE FROM payments WHERE project_id=?', [$id]); q('DELETE FROM notes WHERE entity=? AND entity_id=?', ['projects', $id]);
}

function prep_quote($v, $in) {
  $items = $in['items'] ?? []; if (is_string($items)) $items = json_decode($items, true) ?: [];
  $clean = []; $sub = 0;
  foreach ($items as $i) { $d = trim($i['desc'] ?? ''); if ($d === '') continue; $qty = (float)($i['qty'] ?? 1); $rate = (float)($i['rate'] ?? 0); $clean[] = ['desc' => $d, 'qty' => $qty, 'rate' => $rate]; $sub += $qty * $rate; }
  $v['items'] = json_encode($clean, JSON_UNESCAPED_UNICODE);
  $v['total'] = round($sub + $sub * $v['gst_rate'] / 100, 2);
  if ($v['status'] === '') $v['status'] = 'Draft';
  if ($v['date'] === '') $v['date'] = date('Y-m-d');
  return $v;
}

function detail($t, $r) {
  $id = (int)$r['id'];
  $notes = fn() => rows('SELECT * FROM notes WHERE entity=? AND entity_id=? ORDER BY id DESC', [$t, $id]);
  if ($t === 'leads') { $r['notes_log'] = $notes(); $r['messages'] = rows('SELECT * FROM messages WHERE lead_id=? ORDER BY id DESC', [$id]); }
  if ($t === 'customers') {
    $r['notes_log'] = $notes();
    $r['projects'] = rows('SELECT p.*, COALESCE((SELECT SUM(amount) FROM payments WHERE project_id=p.id),0) paid FROM projects p WHERE customer_id=? ORDER BY id DESC', [$id]);
    $r['quotes'] = rows('SELECT id,number,date,total,status FROM quotes WHERE customer_id=? ORDER BY id DESC', [$id]);
    $r['files'] = rows('SELECT id,name,kind,item,size,created FROM files WHERE customer_id=? ORDER BY id DESC', [$id]);
    $r['messages'] = rows('SELECT * FROM messages WHERE customer_id=? ORDER BY id DESC', [$id]);
  }
  if ($t === 'projects') {
    $S = settings();
    $r['notes_log'] = $notes();
    $r['customer'] = row('SELECT id,name,phone,address,consumer_no FROM customers WHERE id=?', [$r['customer_id']]);
    $r['payments'] = rows('SELECT * FROM payments WHERE project_id=? ORDER BY date DESC, id DESC', [$id]);
    $r['steps'] = rows('SELECT * FROM project_steps WHERE project_id=? ORDER BY id', [$id]);
    $r['stage_data'] = rows('SELECT d.*, f.name file_name FROM stage_data d LEFT JOIN files f ON f.id=d.file_id WHERE d.project_id=?', [$id]);
    $r['services'] = rows('SELECT * FROM services WHERE project_id=? ORDER BY date DESC, id DESC', [$id]);
    $r['files'] = rows('SELECT id,name,kind,item,size,created FROM files WHERE project_id=? ORDER BY id DESC', [$id]);
    $saved = [];
    foreach (rows('SELECT * FROM checklist WHERE project_id=?', [$id]) as $c) $saved[$c['kind'] . '|' . $c['item']] = $c;
    foreach (['subsidy' => $S['subsidy_steps'], 'kseb' => $S['kseb_items']] as $kind => $items) {
      $r['checklist_' . $kind] = array_map(fn($it) => $saved["$kind|$it"] ?? ['kind' => $kind, 'item' => $it, 'status' => 'Pending', 'date' => '', 'notes' => ''], $items);
    }
  }
  if ($t === 'quotes') $r['items'] = json_decode($r['items'] ?: '[]', true);
  return $r;
}

function handle_checklist($a) {
  $in = body();
  if ($a === 'list') { // overview for subsidy / kseb pages
    need('checklist'); $kind = $_GET['kind'] === 'kseb' ? 'kseb' : 'subsidy'; $S = settings();
    $total = count($kind === 'kseb' ? $S['kseb_items'] : $S['subsidy_steps']); $items = $kind === 'kseb' ? $S['kseb_items'] : $S['subsidy_steps'];
    $res = [];
    foreach (rows('SELECT p.id,p.title,p.kw,p.stage,p.application_no,p.subsidy_status,p.subsidy_amount,c.name customer FROM projects p LEFT JOIN customers c ON c.id=p.customer_id ORDER BY p.updated DESC') as $p) {
      $st = [];
      foreach (rows('SELECT item,status FROM checklist WHERE project_id=? AND kind=?', [$p['id'], $kind]) as $c) if (in_array($c['item'], $items)) $st[] = $c['status'];
      $p['total'] = $total; $p['approved'] = count(array_filter($st, fn($s) => $s === 'Approved' || $s === 'NA'));
      $p['submitted'] = count(array_filter($st, fn($s) => $s === 'Submitted')); $res[] = $p;
    }
    out($res);
  }
  need('checklist', true);
  if ($a === 'save') {
    $kind = $in['kind'] === 'kseb' ? 'kseb' : 'subsidy';
    $status = in_array($in['status'] ?? '', ['Pending', 'Submitted', 'Approved', 'NA']) ? $in['status'] : 'Pending';
    q('INSERT INTO checklist(project_id,kind,item,status,date,notes) VALUES(?,?,?,?,?,?) ON CONFLICT(project_id,kind,item) DO UPDATE SET status=excluded.status,date=excluded.date,notes=excluded.notes',
      [(int)$in['project_id'], $kind, (string)$in['item'], $status, (string)($in['date'] ?? ''), (string)($in['notes'] ?? '')]);
    q('UPDATE projects SET updated=CURRENT_TIMESTAMP WHERE id=?', [(int)$in['project_id']]);
    audit('checklist', 'projects', (int)$in['project_id'], "$kind: {$in['item']} → $status"); out(['ok' => true]);
  }
  fail('Unknown action', 404);
}

function handle_files($a) {
  $dir = dirname(__DIR__) . '/data/uploads';
  if ($a === 'get') {
    need('files'); need('customers'); $f = row('SELECT * FROM files WHERE id=?', [(int)($_GET['id'] ?? 0)]); if (!$f) fail('Not found', 404);
    if (!empty($_GET['dl']) || !empty($_GET['v'])) audit(!empty($_GET['dl']) ? 'doc_download' : 'doc_view', 'files', $f['id'], $f['name'] . ($f['item'] ? ' · ' . $f['item'] : '') . ' · customer ' . (int)$f['customer_id']);
    $p = "$dir/" . basename($f['path']); if (!is_file($p)) fail('File missing', 404);
    header_remove('Content-Type');
    $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
    $mime = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'][$ext] ?? 'application/octet-stream'; header('Cache-Control: private, no-store'); header($mime === 'application/pdf' ? "Content-Security-Policy: default-src 'none'; object-src 'self'; frame-ancestors 'self'" : "Content-Security-Policy: sandbox; default-src 'none'; img-src 'self'; frame-ancestors 'self'");
    header('Content-Type: ' . $mime); header('X-Content-Type-Options: nosniff');
    header('Content-Disposition: ' . ($mime === 'application/octet-stream' || !empty($_GET['dl']) ? 'attachment' : 'inline') . '; filename="' . str_replace('"', '', $f['name']) . '"');
    readfile($p); exit;
  }
  if ($a === 'zip') docs_zip((int)($_GET['customer_id'] ?? 0));
  need('files', true);
  if ($a === 'upload') {
    $fl = $_FILES['file'] ?? null;
    $ext = sec_upload($fl, ['image', 'pdf', 'office'], 10); // documents & images only, checked by content
    $name = bin2hex(random_bytes(12)) . '.' . $ext;
    if (!move_uploaded_file($fl['tmp_name'], "$dir/$name")) fail('Could not save file', 500);
    $pid = (int)($_POST['project_id'] ?? 0) ?: null; $cid = (int)($_POST['customer_id'] ?? 0) ?: null;
    if ($pid && !$cid) $cid = (row('SELECT customer_id FROM projects WHERE id=?', [$pid])['customer_id'] ?? null);
    q('INSERT INTO files(customer_id,project_id,kind,item,name,path,size,user) VALUES(?,?,?,?,?,?,?,?)', [$cid, $pid, $_POST['kind'] ?? '', $_POST['item'] ?? '', basename($fl['name']), $name, $fl['size'], $_SESSION['username']]);
    $id = (int)db()->lastInsertId(); audit('upload', 'files', $id, $fl['name']); out(['id' => $id]);
  }
  if ($a === 'delete') {
    $f = row('SELECT * FROM files WHERE id=?', [(int)(body()['id'] ?? 0)]); if (!$f) fail('Not found', 404);
    trash_file_row($f); @unlink("$dir/" . basename($f['path'])); q('UPDATE stage_data SET file_id=NULL WHERE file_id=?', [$f['id']]); q('DELETE FROM files WHERE id=?', [$f['id']]); audit('delete', 'files', $f['id'], $f['name']); out(['ok' => true]);
  }
  fail('Unknown action', 404);
}

function handle_notes($a) {
  $in = body();
  if ($a !== 'add') fail('Unknown action', 404);
  $ent = $in['entity'] ?? ''; if (!in_array($ent, ['leads', 'customers', 'projects'])) fail('Bad entity');
  need($ent, true); if ($ent === 'leads') lead_need_write(lead_or_404($in['entity_id'] ?? 0));
  $t = trim($in['text'] ?? ''); if ($t === '') fail('Empty note');
  q('INSERT INTO notes(entity,entity_id,text,user) VALUES(?,?,?,?)', [$ent, (int)$in['entity_id'], $t, $_SESSION['name']]);
  q("UPDATE $ent SET updated=CURRENT_TIMESTAMP WHERE id=?", [(int)$in['entity_id']]); out(['ok' => true]);
}
