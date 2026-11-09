<?php
// Dashboard, ads, whatsapp, settings, admin

function handle_dashboard() {
  need('dashboard');
  $today = date('Y-m-d'); $month = date('Y-m');
  $one = fn($sql, $a = []) => (float)(row($sql, $a)['v'] ?? 0);
  $leadsM = $one("SELECT COUNT(*) v FROM leads WHERE created LIKE ?", ["$month%"]);
  $wonM = $one("SELECT COUNT(*) v FROM leads WHERE status='Won' AND updated LIKE ?", ["$month%"]);
  $spendM = $one("SELECT COALESCE(SUM(spend),0) v FROM ad_spend WHERE date LIKE ?", ["$month%"]);
  $adLeadsM = $one("SELECT COUNT(*) v FROM leads WHERE campaign_id IS NOT NULL AND created LIKE ?", ["$month%"]);
  $pipeline = $one("SELECT COALESCE(SUM(cost),0) v FROM projects WHERE stage NOT IN ('Closed','Commissioned','Subsidy')");
  $billed = $one("SELECT COALESCE(SUM(cost),0) v FROM projects");
  $paid = $one("SELECT COALESCE(SUM(amount),0) v FROM payments");
  $stages = rows('SELECT stage, COUNT(*) n FROM projects GROUP BY stage');
  $lstat = rows('SELECT status, COUNT(*) n FROM leads GROUP BY status');
  $follow = rows("SELECT id,name,phone,status,followup,'lead' type FROM leads WHERE followup<>'' AND followup<=? AND status NOT IN ('Won','Lost') ORDER BY followup LIMIT 15", [$today]);
  $sub = rows("SELECT id,title,subsidy_status,subsidy_amount FROM projects WHERE stage NOT IN ('Closed') AND (subsidy_status IS NULL OR subsidy_status NOT IN ('Released')) AND application_no<>'' LIMIT 10");
  $S = settings();
  $ks = rows("SELECT p.id,p.title, (SELECT COUNT(*) FROM checklist c WHERE c.project_id=p.id AND c.kind='kseb' AND c.status IN ('Approved','NA')) done FROM projects p WHERE p.stage NOT IN ('Closed','Commissioned','Subsidy')");
  $ktotal = count($S['kseb_items']);
  $kpending = array_values(array_filter(array_map(fn($p) => $p + ['total' => $ktotal], $ks), fn($p) => $p['done'] < $ktotal));
  $overdue = rows('SELECT p.id,p.title,c.name customer, p.cost - COALESCE((SELECT SUM(amount) FROM payments WHERE project_id=p.id),0) due FROM projects p LEFT JOIN customers c ON c.id=p.customer_id WHERE p.stage NOT IN (\'Survey\',\'Design\',\'Quotation\') AND due > 1 ORDER BY due DESC LIMIT 10');
  out(['leads_month' => $leadsM, 'won_month' => $wonM, 'conversion' => $leadsM ? round($wonM / $leadsM * 100) : 0, 'spend_month' => $spendM,
    'cpl' => $adLeadsM ? round($spendM / $adLeadsM) : 0, 'pipeline' => $pipeline, 'billed' => $billed, 'paid' => $paid, 'outstanding' => max(0, $billed - $paid),
    'stages' => $stages, 'lead_status' => $lstat, 'followups' => $follow, 'subsidy_open' => $sub, 'kseb_pending' => array_slice($kpending, 0, 10), 'dues' => $overdue,
    'customers' => (int)row('SELECT COUNT(*) c FROM customers')['c'], 'projects' => (int)row('SELECT COUNT(*) c FROM projects')['c']]);
}

function handle_ads($a) {
  need('ads', in_array($a, ['import']));
  if ($a === 'report') {
    out(rows("SELECT c.*, COALESCE(s.spend,0) spent, COALESCE(s.impr,0) impressions, COALESCE(s.clk,0) clicks,
      (SELECT COUNT(*) FROM leads l WHERE l.campaign_id=c.id) crm_leads,
      (SELECT COUNT(*) FROM leads l WHERE l.campaign_id=c.id AND l.status='Won') won,
      (SELECT COALESCE(SUM(p.cost),0) FROM projects p WHERE p.customer_id IN (SELECT customer_id FROM leads l WHERE l.campaign_id=c.id AND l.customer_id IS NOT NULL)) revenue
      FROM campaigns c LEFT JOIN (SELECT campaign_id, SUM(spend) spend, SUM(impressions) impr, SUM(clicks) clk FROM ad_spend GROUP BY campaign_id) s ON s.campaign_id=c.id ORDER BY c.updated DESC"));
  }
  if ($a === 'import') {
    $n = 0; $made = 0;
    foreach ((body()['rows'] ?? []) as $r) {
      $name = trim($r['campaign'] ?? $r['name'] ?? ''); if ($name === '') continue;
      $c = row('SELECT id FROM campaigns WHERE name=?', [$name]);
      if (!$c) { q('INSERT INTO campaigns(name,platform,status) VALUES(?,?,?)', [$name, 'Meta', 'Active']); $c = ['id' => db()->lastInsertId()]; $made++; }
      $d = trim($r['date'] ?? ''); if ($d !== '' && ($t = strtotime($d))) $d = date('Y-m-d', $t);
      q('INSERT INTO ad_spend(campaign_id,date,spend,impressions,clicks,leads) VALUES(?,?,?,?,?,?)', [$c['id'], $d, (float)($r['spend'] ?? 0), (float)($r['impressions'] ?? 0), (float)($r['clicks'] ?? 0), (float)($r['leads'] ?? 0)]);
      $n++;
    }
    audit('import', 'ad_spend', null, "$n rows"); out(['imported' => $n, 'campaigns_created' => $made]);
  }
  fail('Unknown action', 404);
}

function handle_whatsapp($a) {
  need('whatsapp', $a === 'log');
  $in = body();
  if ($a === 'log') {
    q('INSERT INTO messages(customer_id,lead_id,phone,text,user) VALUES(?,?,?,?,?)', [(int)($in['customer_id'] ?? 0) ?: null, (int)($in['lead_id'] ?? 0) ?: null, (string)($in['phone'] ?? ''), (string)($in['text'] ?? ''), $_SESSION['name']]);
    out(['ok' => true]);
  }
  if ($a === 'recent') out(rows('SELECT m.*, c.name cname, l.name lname FROM messages m LEFT JOIN customers c ON c.id=m.customer_id LEFT JOIN leads l ON l.id=m.lead_id ORDER BY m.id DESC LIMIT 100'));
  fail('Unknown action', 404);
}

function handle_settings($a) {
  need('settings', $a === 'save');
  if ($a === 'get') out(settings());
  if ($a === 'save') {
    if (($_SESSION['role'] ?? '') !== 'admin') fail('Admin only', 403);
    $in = body(); $k = $in['key'] ?? ''; if (!array_key_exists($k, defaults())) fail('Unknown setting');
    q('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', [$k, json_encode($in['value'], JSON_UNESCAPED_UNICODE)]);
    audit('settings', 'settings', null, $k); out(['ok' => true]);
  }
  fail('Unknown action', 404);
}

function handle_admin($a) {
  if (($_SESSION['role'] ?? '') !== 'admin') fail('Admin only', 403);
  $in = body();
  switch ($a) {
    case 'users': out(rows('SELECT id,name,username,role,active,created FROM users ORDER BY id'));
    case 'user_save':
      $role = $in['role'] ?? 'sales'; if (!isset(ROLES[$role])) fail('Bad role');
      $name = trim($in['name'] ?? ''); $u = trim($in['username'] ?? ''); if ($u === '' || $name === '') fail('Name and username required');
      if (!empty($in['id'])) {
        $id = (int)$in['id'];
        if ($id === (int)$_SESSION['uid'] && ($role !== 'admin' || empty($in['active']))) fail('You cannot demote or disable yourself');
        q('UPDATE users SET name=?,username=?,role=?,active=? WHERE id=?', [$name, $u, $role, empty($in['active']) ? 0 : 1, $id]);
        if (!empty($in['password'])) { if (strlen($in['password']) < 8) fail('Password min 8 characters'); q('UPDATE users SET hash=? WHERE id=?', [password_hash($in['password'], PASSWORD_DEFAULT), $id]); }
      } else {
        if (strlen($in['password'] ?? '') < 8) fail('Password min 8 characters');
        if (row('SELECT 1 FROM users WHERE username=?', [$u])) fail('Username already exists');
        q('INSERT INTO users(name,username,hash,role) VALUES(?,?,?,?)', [$name, $u, password_hash($in['password'], PASSWORD_DEFAULT), $role]); $id = db()->lastInsertId();
      }
      audit('user_save', 'users', (int)$id, "$u ($role)"); out(['id' => $id]);
    case 'audit': out(rows('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300'));
    case 'stats':
      $s = []; foreach (['users', 'leads', 'customers', 'projects', 'quotes', 'files', 'campaigns', 'messages', 'audit_log'] as $t) $s[$t] = (int)row("SELECT COUNT(*) c FROM $t")['c'];
      $s['db_kb'] = round(filesize(dirname(__DIR__) . '/data/crm.sqlite') / 1024); out($s);
    case 'backup':
      db()->exec('PRAGMA wal_checkpoint(TRUNCATE)');
      header_remove('Content-Type'); header('Content-Type: application/octet-stream');
      header('Content-Disposition: attachment; filename="solarize-backup-' . date('Y-m-d') . '.sqlite"');
      readfile(dirname(__DIR__) . '/data/crm.sqlite'); audit('backup', 'db'); exit;
  }
  fail('Unknown action', 404);
}
