<?php
// Dashboard, ads, whatsapp, settings, admin

function handle_dashboard() {
  need('dashboard');
  $today = date('Y-m-d'); $month = date('Y-m');
  $one = fn($sql, $a = []) => (float)(row($sql, $a)['v'] ?? 0);
  // Business Associate: every count covers only their own leads, customers and their customers' projects ('' = everyone's)
  $ba = is_ba(); $u = uid();
  $L = $ba ? " AND assigned_to=$u" : ''; $C = $ba ? " AND owner_id=$u" : ''; $P = $ba ? " AND customer_id IN (SELECT id FROM customers WHERE owner_id=$u)" : '';
  $SC = ['leads' => $L, 'customers' => $C, 'projects' => $P];
  $leadsM = $one("SELECT COUNT(*) v FROM leads WHERE created LIKE ?$L", ["$month%"]);
  $wonM = $one("SELECT COUNT(*) v FROM leads WHERE status='Won' AND updated LIKE ?$L", ["$month%"]);
  $spendM = $one("SELECT COALESCE(SUM(spend),0) v FROM ad_spend WHERE date LIKE ?", ["$month%"]);
  $adLeadsM = $one("SELECT COUNT(*) v FROM leads WHERE campaign_id IS NOT NULL AND created LIKE ?$L", ["$month%"]);
  $pipeline = $one("SELECT COALESCE(SUM(cost),0) v FROM projects WHERE stage<>'Project completed'");
  $billed = $one("SELECT COALESCE(SUM(cost),0) v FROM projects");
  $paid = $one("SELECT COALESCE(SUM(amount),0) v FROM payments");
  $stages = rows("SELECT stage, COUNT(*) n FROM projects WHERE 1=1$P GROUP BY stage");
  $lstat = rows("SELECT status, COUNT(*) n FROM leads WHERE 1=1$L GROUP BY status");
  $follow = rows("SELECT id,name,phone,status,appt followup,'lead' type FROM leads WHERE appt<>'' AND appt<=? AND status NOT IN ('Won','Lost')$L ORDER BY appt LIMIT 15", [$today]);
  $sub = rows("SELECT id,title,subsidy_status,subsidy_amount FROM projects WHERE stage<>'Project completed' AND (subsidy_status IS NULL OR subsidy_status NOT IN ('Released')) AND application_no<>''$P LIMIT 10");
  if (!can('finance')) foreach ($sub as &$x) unset($x['subsidy_amount']); unset($x);
  $S = settings();
  $ks = rows("SELECT p.id,p.title,cu.name customer, (SELECT COUNT(*) FROM checklist c WHERE c.project_id=p.id AND c.kind='kseb' AND c.status IN ('Approved','NA')) done FROM projects p LEFT JOIN customers cu ON cu.id=p.customer_id WHERE p.stage<>'Project completed'$P");
  $ktotal = count($S['kseb_items']);
  $kpending = array_values(array_filter(array_map(fn($p) => $p + ['total' => $ktotal], $ks), fn($p) => $p['done'] < $ktotal));
  $overdue = can('finance') ? array_map(fn($r) => ['id' => $r['id'], 'title' => $r['title'], 'customer' => $r['customer'], 'due' => $r['due']], acc_pending_rows(false, 500, false)) : []; /* the same list as Accounts > Pending, up to 500 (the dashboard tile counts them and opens the list); no last-reminder lookup */
  $td = date('Y-m-d'); $loc = "date(created,'+330 minutes')";
  $cnt = fn($sql, $a = []) => (int)(row($sql, $a)['v'] ?? 0);
  $pct = fn($n, $p) => $p ? (int)round(($n - $p) / $p * 100) : ($n ? 100 : 0);
  $m0 = date('Y-m'); $m1 = date('Y-m', strtotime('first day of last month'));
  $mc = fn($t, $m) => $cnt("SELECT COUNT(*) v FROM $t WHERE substr($loc,1,7)=?" . $SC[$t], [$m]);
  $tc = fn($t) => $cnt("SELECT COUNT(*) v FROM $t WHERE $loc=?" . $SC[$t], [$td]);
  $extra = [
    'leads_total' => $cnt("SELECT COUNT(*) v FROM leads WHERE status NOT IN ('Won','Lost')$L"), 'leads_today' => $tc('leads'), 'leads_vs' => $pct($mc('leads', $m0), $mc('leads', $m1)),
    'cust_total' => $cnt("SELECT COUNT(*) v FROM customers WHERE 1=1$C"), 'cust_today' => $tc('customers'), 'cust_vs' => $pct($mc('customers', $m0), $mc('customers', $m1)),
    'proj_active' => $cnt("SELECT COUNT(*) v FROM projects WHERE stage<>'Project completed'$P"), 'proj_today' => $tc('projects'), 'proj_vs' => $pct($mc('projects', $m0), $mc('projects', $m1)),
    'overdue' => $cnt("SELECT COUNT(*) v FROM leads WHERE appt<>'' AND appt<? AND status NOT IN ('Won','Lost')$L", [$td]),
    'due_today' => $cnt("SELECT COUNT(*) v FROM leads WHERE appt=? AND status NOT IN ('Won','Lost')$L", [$td]),
    'trend' => rows("SELECT $loc d, COUNT(*) n, SUM(status='Won') won FROM leads WHERE $loc>=date('now','+330 minutes','-29 day')$L GROUP BY d"),
    'sources' => rows("SELECT COALESCE(NULLIF(source,''),'Unknown') s, COUNT(*) n FROM leads WHERE 1=1$L GROUP BY s ORDER BY n DESC"),
    'appts' => rows("SELECT id,name,appt d,status FROM leads WHERE appt<>'' AND appt BETWEEN date('now','-62 day') AND date('now','+180 day')$L"),
    'recent' => $ba ? rows('SELECT user,action,entity,detail,created FROM audit_log WHERE user=? ORDER BY id DESC LIMIT 8', [$_SESSION['username'] ?? '']) // a BA sees only what they did
      : rows('SELECT user,action,entity,detail,created FROM audit_log ORDER BY id DESC LIMIT 8'),
    'lead_year' => $cnt("SELECT COUNT(*) v FROM leads WHERE substr($loc,1,4)=?$L", [date('Y')]),
    'lead_target' => (int)settings()['lead_target'], 'customer_target' => (int)settings()['customer_target'],
    'cust_year' => $cnt("SELECT COUNT(*) v FROM customers WHERE substr($loc,1,4)=?" . $SC['customers'], [date('Y')]),
    'converted' => $cnt("SELECT COUNT(*) v FROM leads WHERE customer_id IS NOT NULL$L"), 'leads_all' => $cnt("SELECT COUNT(*) v FROM leads WHERE 1=1$L"),
    /* daily summary: KSEB feasibility / registration fees not paid yet (Finance › Fees "Pending" + "Demanded"), only for Finance › Fees readers */
    'fees_due' => can('fees') ? rows("SELECT f.id, f.customer_id, f.kind, f.amount, f.demanded, f.demanded_on, c.name customer, c.phone FROM fees f JOIN customers c ON c.id=f.customer_id WHERE f.kind IN ('feasibility','registration') AND f.paid=0$C ORDER BY f.demanded DESC, f.id DESC LIMIT 1000") : [],
  ];
  if (!can('finance')) { $pipeline = $billed = $paid = $spendM = 0; $overdue = []; }
  out($extra + ['finance' => can('finance') ? 1 : 0, 'leads_month' => $leadsM, 'won_month' => $wonM, 'conversion' => $leadsM ? round($wonM / $leadsM * 100) : 0, 'spend_month' => $spendM,
    'cpl' => $adLeadsM ? round($spendM / $adLeadsM) : 0, 'pipeline' => $pipeline, 'billed' => $billed, 'paid' => $paid, 'outstanding' => max(0, $billed - $paid),
    'stages' => $stages, 'lead_status' => $lstat, 'followups' => $follow, 'subsidy_open' => $sub, 'kseb_pending' => array_slice($kpending, 0, 500), 'dues' => $overdue,
    'customers' => (int)row("SELECT COUNT(*) c FROM customers WHERE 1=1$C")['c'], 'projects' => (int)row("SELECT COUNT(*) c FROM projects WHERE 1=1$P")['c']]);
}

function handle_ads($a) {
  need('ads', in_array($a, ['import']));
  if ($a === 'report') {
    // one grouped pass per table (the old per-campaign subqueries rescanned every lead and project for each campaign)
    out(rows("SELECT c.*, COALESCE(s.spend,0) spent, COALESCE(s.impr,0) impressions, COALESCE(s.clk,0) clicks,
      COALESCE(l.n,0) crm_leads, COALESCE(l.won,0) won, COALESCE(r.revenue,0) revenue
      FROM campaigns c
      LEFT JOIN (SELECT campaign_id, SUM(spend) spend, SUM(impressions) impr, SUM(clicks) clk FROM ad_spend GROUP BY campaign_id) s ON s.campaign_id=c.id
      LEFT JOIN (SELECT campaign_id, COUNT(*) n, SUM(status='Won') won FROM leads WHERE campaign_id IS NOT NULL GROUP BY campaign_id) l ON l.campaign_id=c.id
      LEFT JOIN (SELECT x.campaign_id, SUM(p.cost) revenue FROM (SELECT DISTINCT campaign_id, customer_id FROM leads WHERE campaign_id IS NOT NULL AND customer_id IS NOT NULL) x
        JOIN projects p ON p.customer_id=x.customer_id GROUP BY x.campaign_id) r ON r.campaign_id=c.id
      ORDER BY c.updated DESC"));
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
    if (!empty($in['lead_id'])) lead_need_write(lead_or_404($in['lead_id']));
    if (!empty($in['lead_id'])) q("UPDATE leads SET notify=0, status=CASE WHEN status='New' THEN 'Contacted' ELSE status END WHERE id=?", [(int)$in['lead_id']]);
    q('INSERT INTO messages(customer_id,lead_id,phone,text,user) VALUES(?,?,?,?,?)', [(int)($in['customer_id'] ?? 0) ?: null, (int)($in['lead_id'] ?? 0) ?: null, (string)($in['phone'] ?? ''), (string)($in['text'] ?? ''), $_SESSION['name']]);
    out(['ok' => true]);
  }
  if ($a === 'recent') out(rows('SELECT m.*, c.name cname, l.name lname FROM messages m LEFT JOIN customers c ON c.id=m.customer_id LEFT JOIN leads l ON l.id=m.lead_id'
    . (is_ba() ? ' WHERE (m.customer_id IS NOT NULL AND ' . cust_scope('c') . ') OR (m.lead_id IS NOT NULL AND ' . lead_scope('l') . ')' : '') . ' ORDER BY m.id DESC LIMIT 100'));
  fail('Unknown action', 404);
}

/* what settings/get answers (also sent with auth/status?boot=1) */
function settings_out() {
  if (!can('settings')) { $s = settings(); unset($s['catalog'], $s['role_perms']); return $s + ['modules' => MODULES, 'role_names' => ROLE_NAMES]; }
  return settings() + ['rule_limits' => RULE_LIMITS, 'rule_names' => RULE_NAMES, 'kseb_defaults' => kseb_defaults(), 'incentive' => ['own_rate' => INC_OWN_RATE, 'tiers' => array_map(fn($t) => [$t[0] === PHP_INT_MAX ? null : $t[0], $t[1]], INC_TIERS), 'start' => INC_START], 'modules' => MODULES, 'role_names' => ROLE_NAMES, 'role_defaults' => array_map(fn($r) => ['read' => $r[0], 'write' => $r[1]], ROLE_DEFAULTS), 'roles_now' => array_map(fn($r) => ['read' => $r[0], 'write' => $r[1]], roles()), 'role_never' => ROLE_NEVER];
}
function handle_settings($a) {
  if ($a === 'get') out(settings_out());
  need('settings', in_array($a, ['save', 'upload_bg', 'remove_bg']));
  if ($a === 'upload_bg' || $a === 'remove_bg') {
    if (($_SESSION['role'] ?? '') !== 'admin') fail('Admin only', 403);
    $dir = dirname(__DIR__) . '/uploads';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    file_put_contents("$dir/.htaccess", "Options -Indexes\n<FilesMatch \"\\.(?!(jpe?g|png|webp)$)[^.]+$\">\n  Require all denied\n</FilesMatch>\n");
    $cur = settings()['login'];
    $olds = glob("$dir/login-bg-*") ?: [];
    if ($a === 'remove_bg') { $cur['bg'] = ''; }
    else {
      $ext = sec_upload($_FILES['file'] ?? null, ['image'], 6);
      $name = 'login-bg-' . bin2hex(random_bytes(5)) . '.' . $ext;
      if (!move_uploaded_file($fl['tmp_name'], "$dir/$name")) fail('Could not save image', 500);
      $cur['bg'] = $name; $olds = array_diff($olds, ["$dir/$name"]);
    }
    foreach ($olds as $old) @unlink($old);
    q('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', ['login', json_encode($cur)]);
    audit($a, 'settings', null, 'login'); out(['ok' => true, 'brand' => branding()]);
  }
  if ($a === 'save') {
    if (($_SESSION['role'] ?? '') !== 'admin') fail('Admin only', 403);
    $in = body(); $k = $in['key'] ?? ''; if (!array_key_exists($k, defaults())) fail('Unknown setting');
    $val = $in['value'];
    if ($k === 'role_perms') { $clean = []; foreach ((array)$val as $role => $p) { if ($role === 'admin' || !isset(ROLE_DEFAULTS[$role])) continue; $no = ROLE_NEVER[$role] ?? []; $clean[$role] = ['read' => array_values(array_diff(array_intersect((array)($p['read'] ?? []), MODULES), $no)), 'write' => array_values(array_diff(array_intersect((array)($p['write'] ?? []), MODULES), $no))]; } $clean['_modules'] = MODULES; $val = $clean; }
    if ($k === 'company') { /* only the company fields, as text; a field not sent keeps its current value (an empty post once wiped the record) */
      $val = is_array($val) ? $val : []; $cur = settings()['company']; $def = defaults()['company'];
      if (!array_intersect_key($val, $def)) fail('Nothing to save');
      $clean = []; foreach ($def as $ck => $_) $clean[$ck] = array_key_exists($ck, $val) ? mb_substr(trim(is_scalar($val[$ck]) ? (string)$val[$ck] : ''), 0, $ck === 'terms' ? 4000 : 300) : $cur[$ck];
      if ($clean['name'] === '') fail('Type the company name');
      $val = $clean; }
    if ($k === 'rules') { /* whole numbers inside their limits; a rule not sent keeps its value */
      $cur = settings()['rules']; $clean = [];
      foreach (RULE_LIMITS as $rk => [$lo, $hi]) {
        $x = is_array($val) && array_key_exists($rk, $val) ? $val[$rk] : ($cur[$rk] ?? defaults()['rules'][$rk]);
        if (!is_numeric($x) || (int)$x != $x || $x < $lo || $x > $hi) fail(RULE_NAMES[$rk] . ": a whole number from $lo to $hi");
        $clean[$rk] = (int)$x; }
      if ($clean['feas_alert_days'] >= $clean['feas_valid_days']) fail('The feasibility warning must come before the feasibility runs out');
      $val = $clean; }
    if ($k === 'doc_types') { $clean = []; foreach ((array)$val as $x) { if (!is_scalar($x)) continue; $x = mb_substr(trim((string)$x), 0, 60); if ($x !== '' && !in_array($x, $clean, true)) $clean[] = $x; }
      if (!$clean) fail('Keep at least one document type'); $val = array_slice($clean, 0, 60); }
    if ($k === 'login') { $val =['bg' => settings()['login']['bg'], 'tagline' => mb_substr((string)($val['tagline'] ?? ''), 0, 80), 'dim' => max(0, min(80, (int)($val['dim'] ?? 35)))]; }
    q('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', [$k, json_encode($val, JSON_UNESCAPED_UNICODE)]);
    audit('settings', 'settings', null, $k); out(['ok' => true]);
  }
  fail('Unknown action', 404);
}

function handle_admin($a) {
  if (($_SESSION['role'] ?? '') !== 'admin') fail('Admin only', 403);
  $in = body();
  switch ($a) {
    case 'users': out(rows('SELECT u.id,u.name,u.username,u.role,u.active,u.can_claim,u.created,u.avatar,u.seen_at,u.active_at,(length(u.totp)>0) tfa,(SELECT COUNT(*) FROM customers WHERE owner_id=u.id) customers,(SELECT COUNT(*) FROM leads WHERE assigned_to=u.id) leads,(SELECT COUNT(*) FROM mail_accounts WHERE user_id=u.id) mails FROM users u ORDER BY u.id'));
    case 'user_save':
      $role = $in['role'] ?? 'sales'; if (!isset(ROLE_DEFAULTS[$role])) fail('Bad role');
      $name = trim($in['name'] ?? ''); $u = trim($in['username'] ?? ''); if ($u === '' || $name === '') fail('Name and username required');
      if (!empty($in['id'])) {
        $id = (int)$in['id'];
        if ($id === (int)$_SESSION['uid'] && ($role !== 'admin' || empty($in['active']))) fail('You cannot demote or disable yourself');
        if (!empty($in['password'])) sec_password_ok((string)$in['password'], $u);
        $was = row('SELECT role, active, username FROM users WHERE id=?', [$id]); $was_name = $was['username'] ?? '';
        q('UPDATE users SET name=?,username=?,role=?,active=?,can_claim=? WHERE id=?', [$name, $u, $role, empty($in['active']) ? 0 : 1, empty($in['can_claim']) ? 0 : 1, $id]);
        if (!empty($in['password'])) q('UPDATE users SET hash=?, sess_ver=sess_ver+1 WHERE id=?', [pw_hash($in['password']), $id]); // new password signs them out everywhere
        elseif ($was && ($was['role'] !== $role || ((int)$was['active'] && empty($in['active'])))) q('UPDATE users SET sess_ver=sess_ver+1 WHERE id=?', [$id]);
      } else {
        sec_password_ok((string)($in['password'] ?? ''), $u);
        if (row('SELECT 1 FROM users WHERE username=?', [$u])) fail('Username already exists');
        q('INSERT INTO users(name,username,hash,role,can_claim) VALUES(?,?,?,?,?)', [$name, $u, pw_hash($in['password']), $role, empty($in['can_claim']) ? 0 : 1]); $id = db()->lastInsertId();
      }
      /* "Too many wrong attempts … ask the admin": saving the user (e.g. with a new password) clears their sign-in lock */
      foreach (array_unique([strtolower($u), strtolower((string)($was_name ?? ''))]) as $k) if ($k !== '') q('DELETE FROM login_guard WHERE k=?', ['u:' . $k]);
      if ($role === 'ba') q('UPDATE wa_chats SET assigned_to=NULL WHERE assigned_to=?', [(int)$id]); // BAs never have WhatsApp
      audit('user_save', 'users', (int)$id, "$u ($role)"); out(['id' => $id]);
    case 'user_signout': /* signs the person out on every device; their password stays as it is */
      $id = (int)($in['id'] ?? 0); $u = row('SELECT id, username FROM users WHERE id=?', [$id]); if (!$u) fail('User not found', 404);
      if ($id === (int)$_SESSION['uid']) fail('To sign out your own other devices, change your password in My account');
      q('UPDATE users SET sess_ver=sess_ver+1 WHERE id=?', [$id]); audit('user_signout', 'users', $id, $u['username']); out(['ok' => true]);
    case 'user_tfa_off': /* the person lost their phone: two-step sign-in is switched off so they can sign in with the password and set it up again */
      $id = (int)($in['id'] ?? 0); $u = row('SELECT id, username FROM users WHERE id=?', [$id]); if (!$u) fail('User not found', 404);
      if ($id === (int)$_SESSION['uid']) fail('Turn your own two-step sign-in off in My account');
      tfa_clear($id); q('UPDATE users SET sess_ver=sess_ver+1 WHERE id=?', [$id]); audit('tfa_off_admin', 'users', $id, $u['username']); out(['ok' => true]);
    case 'user_active': /* switch a login on or off without opening the user form */
      $id = (int)($in['id'] ?? 0); $on = empty($in['active']) ? 0 : 1; $u = row('SELECT id, username FROM users WHERE id=?', [$id]); if (!$u) fail('User not found', 404);
      if ($id === (int)$_SESSION['uid'] && !$on) fail('You cannot demote or disable yourself');
      q('UPDATE users SET active=?' . ($on ? '' : ', sess_ver=sess_ver+1') . ' WHERE id=?', [$on, $id]); /* switched off: signed out everywhere at once */
      if ($on) q('DELETE FROM login_guard WHERE k=?', ['u:' . strtolower($u['username'])]);
      audit('user_save', 'users', $id, $u['username'] . ($on ? ' (enabled)' : ' (disabled)')); out(['ok' => true]);
    case 'audit': out(rows("SELECT * FROM audit_log WHERE created >= datetime('now', '-72 hours') ORDER BY id DESC LIMIT 3000"));
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
