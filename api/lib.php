<?php
// Shared bootstrap: DB, schema, settings, permissions, helpers.
const SCHEMA_VERSION = 41; // bump when tables/columns change
const IDS = ['customer_id','lead_id','project_id','campaign_id','assigned_to','user_id','file_id'];
const NUMS = ['notify','amc_interval','kw','budget','cost','subsidy_amount','gst_rate','subsidy','total','spend','impressions','clicks','leads','amount','sanctioned_load'];

// entity => [module, columns]
$E = [
  'leads' => ['leads', ['name','phone','email','address','city','location','remark','appt','added_by','source','campaign_id','status','assigned_to','followup','kw','budget','customer_id','notes','meta_id','meta_form','meta_ad','meta_campaign','notify','claimed_at','site','plant','lead_type']],
  'customers' => ['customers', ['name','phone','email','address','district','consumer_no','kseb_section','sanctioned_load','roof_type','gst_no','notes','added_by','alt_phone','pincode','phase','tariff','meter_no','bank_holder','bank_name','bank_branch','bank_account','bank_ifsc','lat','lng','landmark','kseb_circle','kseb_division','kseb_subdivision','local_body','village_survey','jansamarth_id','lead_type','premises','transformer','pole_no','aadhaar_no','pan_no','loan_bank','loan_branch','loan_amount','loan_sanctioned_on']],
  'projects' => ['projects', ['customer_id','title','kw','panel','inverter','stage','engineer','start','end','cost','application_no','subsidy_status','subsidy_amount','notes','loan','amc_start','amc_end','amc_interval']],
  'quotes' => ['quotes', ['customer_id','lead_id','number','date','items','gst_rate','subsidy','terms','status','total']],
  'campaigns' => ['ads', ['name','platform','objective','start','end','budget','status']],
  'ad_spend' => ['ads', ['campaign_id','date','spend','impressions','clicks','leads']],
  'payments' => ['payments', ['project_id','date','amount','mode','note','ref_no']],
];

// role => [read modules, write modules]; '*' = everything
// Permission modules. 'finance' = every money figure (project values, payments, balances, ad spend, dashboard money cards).
const MODULES = ['dashboard','calendar','attendance','leaves','leads','customers','projects','checklist','loans','files','folder','whatsapp','quotes','payments','ads','finance','settings','recycle','fees','email','incentive'];
// 'incentive': View = Finance › Incentive received (my customers the admin shared); Edit = manage every staff member's incentive (api/comm.php)
const ROLE_NAMES = ['admin' => 'Admin', 'assistant_manager' => 'Assistant manager', 'sales' => 'Sales', 'engineer' => 'Engineer', 'accounts' => 'Accounts', 'ba' => 'Business Associate (BA)'];
// role => [read modules, write modules]; '*' = everything. Admin can change these in Settings → User access.
const ROLE_DEFAULTS = [
  'admin' => ['*', '*'],
  'assistant_manager' => [['attendance','leaves','dashboard','calendar','leads','customers','projects','checklist','loans','files','folder','whatsapp','settings','recycle','fees','email','incentive'], ['attendance','leaves','calendar','leads','customers','projects','checklist','loans','files','folder','whatsapp','recycle','fees','email']],
  'sales' => [['attendance','leaves','calendar','folder','dashboard','leads','customers','projects','quotes','checklist','loans','files','payments','whatsapp','ads','settings','email','incentive'], ['leads','customers','quotes','loans','whatsapp','files','folder','calendar','projects','email']],
  'engineer' => [['attendance','leaves','calendar','folder','dashboard','leads','customers','projects','quotes','checklist','loans','files','payments','settings','fees','email','incentive'], ['projects','checklist','files','customers','folder','calendar','email']],
  'accounts' => [['attendance','leaves','calendar','folder','dashboard','leads','customers','projects','quotes','checklist','loans','files','payments','ads','whatsapp','settings','finance','fees','email','incentive'], ['quotes','payments','loans','ads','calendar','fees','email']],
  // Business Associate: their own leads and customers, their customers' projects (view only), no money. Rows are limited in claims.php (ba_gate, cust_scope).
  'ba' => [['dashboard','leads','customers','projects'], ['leads','customers']],
];
// Lead type: who brought the lead. Meta form leads are always Meta; Own = the staff member's own contact (₹3,000/kW incentive);
// Meta and Office are company leads (milestone incentive, api/comm.php). The admin confirms it when approving the incentive.
const LEAD_TYPES = ['own' => 'Own lead', 'office' => 'Office', 'meta' => 'Meta'];
function lead_type_of($r, $t = 'leads') {
  $v = (string)($r['lead_type'] ?? ''); if (isset(LEAD_TYPES[$v])) return $v;
  return $t === 'leads' && (trim((string)($r['meta_id'] ?? '')) !== '' || ($r['source'] ?? '') === 'Meta Ads') ? 'meta' : 'office';
}
// the lead type a save may set: Meta form leads stay Meta; only the admin re-types an existing customer (it decides the incentive)
function lead_type_save($t, $in, $id) {
  $old = $id ? row("SELECT * FROM $t WHERE id=?", [$id]) : null;
  if ($t === 'leads' && $old && trim((string)($old['meta_id'] ?? '')) !== '') return 'meta';
  if ($t === 'customers' && $old && !is_admin()) return lead_type_of($old, $t);
  $v = (string)($in['lead_type'] ?? '');
  $v = isset(LEAD_TYPES[$v]) ? $v : ($old ? lead_type_of($old, $t) : 'office');
  if ($t === 'customers' && $v === 'meta' && !cust_from_lead($id)) $v = 'office'; // added directly (no lead behind it): never Meta
  return $v;
}
// Meta comes only from a lead: a customer is Meta only when it was won from one; one added directly is Own lead or Office
function cust_from_lead($cid) { return (int)$cid > 0 && (bool)row('SELECT 1 FROM leads WHERE customer_id=? LIMIT 1', [(int)$cid]); }
// Areas a role never gets, whatever is ticked in Settings → User access or granted by "Can see & claim leads".
// Business Associates are outside partners: no WhatsApp (inbox, business number, message history), and commission instead of incentive.
const ROLE_NEVER = ['ba' => ['whatsapp', 'incentive']];
function claim_grants($role) { return array_values(array_diff(CLAIM_GRANTS, ROLE_NEVER[$role] ?? [])); }
function roles() {
  static $r = null; if ($r !== null) return $r;
  $r = ROLE_DEFAULTS;
  try { $o = row("SELECT v FROM settings WHERE k='role_perms'"); } catch (Throwable $e) { $o = null; }
  $saved = $o ? (json_decode($o['v'], true) ?: []) : [];
  // areas added after the admin saved custom access start from their defaults
  $seen = $saved['_modules'] ?? array_values(array_diff(MODULES, ['attendance', 'leaves', 'incentive']));
  $fresh = array_values(array_diff(MODULES, $seen));
  foreach ($saved as $role => $p) {
    if ($role === '_modules' || $role === 'admin' || !isset(ROLE_DEFAULTS[$role]) || !is_array($p)) continue;
    $def = ROLE_DEFAULTS[$role];
    $rd = array_values(array_unique(array_merge(array_intersect($p['read'] ?? [], MODULES), array_intersect($def[0], $fresh))));
    $wt = array_values(array_unique(array_merge(array_intersect($p['write'] ?? [], MODULES), array_intersect($def[1], $fresh))));
    $r[$role] = [array_values(array_unique(array_merge($rd, $wt))), $wt]; // edit implies view
  }
  foreach (ROLE_NEVER as $role => $mods) if (isset($r[$role]) && is_array($r[$role][0])) $r[$role] = [array_values(array_diff($r[$role][0], $mods)), array_values(array_diff($r[$role][1], $mods))];
  return $r;
}

function out($d, $code = 200) { http_response_code($code); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function fail($msg, $code = 400) { out(['error' => $msg], $code); }
function body() { static $b; if ($b === null) $b = json_decode(file_get_contents('php://input'), true) ?: []; return $b; }

function can($module, $write = false) {
  $r = roles()[$_SESSION['role'] ?? ''] ?? null; if (!$r) return false;
  $list = $r[$write ? 1 : 0];
  if ($list === '*' || in_array($module, $list)) return true;
  // 'Can see & claim leads' (Admin → Users) lets any role work the leads they claim; ownership is enforced in claims.php
  return in_array($module, claim_grants($_SESSION['role'] ?? '')) && function_exists('can_claim') && can_claim();
}
const CLAIM_GRANTS = ['leads', 'whatsapp'];
function need($module, $write = false) { if (!can($module, $write)) fail('Not allowed for your role', 403); }

function db() {
  static $db;
  if ($db) return $db;
  $dir = dirname(__DIR__) . '/data';
  if (!is_dir($dir)) mkdir($dir, 0750, true);
  if (!file_exists("$dir/.htaccess")) file_put_contents("$dir/.htaccess", "Require all denied\nDeny from all\n");
  if (!is_dir("$dir/uploads")) mkdir("$dir/uploads", 0750, true);
  $db = new PDO('sqlite:' . $dir . '/crm.sqlite');
  $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
  // WAL + synchronous=NORMAL: fast commits, never corrupts (a power cut can only lose the last instant's write); temp sorts in RAM; 8 MB page cache
  $db->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-8000');
  // schema changes run once per SCHEMA_VERSION (not on every request)
  if ((int)$db->query('PRAGMA user_version')->fetchColumn() < SCHEMA_VERSION) { migrate($db); $db->exec('PRAGMA user_version=' . SCHEMA_VERSION); }
  return $db;
}
function q($sql, $args = []) { $s = db()->prepare($sql); $s->execute($args); return $s; }
function rows($sql, $args = []) { return q($sql, $args)->fetchAll(); }
function row($sql, $args = []) { return q($sql, $args)->fetch() ?: null; }
function colType($c) { return in_array($c, IDS) ? 'INTEGER' : (in_array($c, NUMS) ? 'REAL' : 'TEXT'); }

function migrate($db) {
  global $E;
  foreach ($E as $t => [$m, $cols]) {
    $defs = ['id INTEGER PRIMARY KEY AUTOINCREMENT'];
    foreach ($cols as $c) $defs[] = "$c " . colType($c);
    $defs[] = 'created TEXT DEFAULT CURRENT_TIMESTAMP'; $defs[] = 'updated TEXT DEFAULT CURRENT_TIMESTAMP';
    $db->exec("CREATE TABLE IF NOT EXISTS $t(" . implode(',', $defs) . ')');
    $have = array_column($db->query("PRAGMA table_info($t)")->fetchAll(), 'name');
    foreach ($cols as $c) if (!in_array($c, $have)) { try { $db->exec("ALTER TABLE $t ADD COLUMN $c " . colType($c)); } catch (PDOException $e) { if (stripos($e->getMessage(), 'duplicate column') === false) throw $e; } }
  }
  $db->exec("CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, username TEXT UNIQUE, hash TEXT, role TEXT DEFAULT 'sales', active INTEGER DEFAULT 1, created TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec("CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, action TEXT, entity TEXT, entity_id INTEGER, detail TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec("CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT)");
  $db->exec("CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT, entity_id INTEGER, text TEXT, user TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec("CREATE TABLE IF NOT EXISTS checklist(id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, kind TEXT, item TEXT, status TEXT DEFAULT 'Pending', date TEXT, notes TEXT, UNIQUE(project_id,kind,item))");
  $db->exec("CREATE TABLE IF NOT EXISTS files(id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, project_id INTEGER, kind TEXT, item TEXT, name TEXT, path TEXT, size INTEGER, user TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec("CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, lead_id INTEGER, phone TEXT, text TEXT, user TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec("CREATE TABLE IF NOT EXISTS datasheets(id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT, title TEXT, brand TEXT, model TEXT, notes TEXT, file_name TEXT, path TEXT, size INTEGER, available INTEGER DEFAULT 1, avail_note TEXT DEFAULT '', token TEXT UNIQUE, user TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec("CREATE TABLE IF NOT EXISTS discussions(id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, lead_id INTEGER, topic TEXT DEFAULT '', status TEXT DEFAULT 'Open', created_by INTEGER, closed_by INTEGER, closed_at TEXT, outcome TEXT DEFAULT '', created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
  foreach (['discussions', 'notifs'] as $tb) { $have = array_column($db->query("PRAGMA table_info($tb)")->fetchAll(), 'name');
    if ($have && !in_array('lead_id', $have)) { try { $db->exec("ALTER TABLE $tb ADD COLUMN lead_id INTEGER"); } catch (PDOException $e) { if (stripos($e->getMessage(), 'duplicate column') === false) throw $e; } } }
  $db->exec("CREATE INDEX IF NOT EXISTS disc_cust ON discussions(customer_id, status)");
  $db->exec("CREATE INDEX IF NOT EXISTS disc_lead ON discussions(lead_id, status)");
  $db->exec("CREATE TABLE IF NOT EXISTS disc_msgs(id INTEGER PRIMARY KEY AUTOINCREMENT, discussion_id INTEGER, user_id INTEGER, body TEXT, mentions TEXT DEFAULT '[]', kind TEXT DEFAULT 'msg', created TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec("CREATE INDEX IF NOT EXISTS dmsg_disc ON disc_msgs(discussion_id)");
  $db->exec("CREATE TABLE IF NOT EXISTS disc_reads(user_id INTEGER, discussion_id INTEGER, last_id INTEGER, PRIMARY KEY(user_id, discussion_id))");
  $db->exec("CREATE TABLE IF NOT EXISTS notifs(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, kind TEXT, discussion_id INTEGER, customer_id INTEGER, lead_id INTEGER, from_id INTEGER, text TEXT, seen INTEGER DEFAULT 0, created TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec("CREATE INDEX IF NOT EXISTS notif_user ON notifs(user_id, seen)");
  // Nov 2026: money & bank details (Finance) only for admin, accounts and roles the admin grants — remove it from Sales and Engineer once
  if (!(int)($db->query("SELECT COUNT(*) FROM settings WHERE k='fin_v19'")->fetchColumn())) {
    $rp = $db->query("SELECT v FROM settings WHERE k='role_perms'")->fetchColumn();
    if ($rp) { $p = json_decode($rp, true) ?: [];
      foreach (['sales', 'engineer'] as $role) if (isset($p[$role]) && is_array($p[$role])) foreach (['read', 'write'] as $k) $p[$role][$k] = array_values(array_diff((array)($p[$role][$k] ?? []), ['finance']));
      $st = $db->prepare("UPDATE settings SET v=? WHERE k='role_perms'"); $st->execute([json_encode($p)]); }
    $db->exec("INSERT OR REPLACE INTO settings(k,v) VALUES('fin_v19','1')");
  }
  $db->exec("CREATE TABLE IF NOT EXISTS gen_docs(id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, kind TEXT, number TEXT, issued_on TEXT, data TEXT, updated TEXT DEFAULT CURRENT_TIMESTAMP, updated_by TEXT DEFAULT '', UNIQUE(customer_id, kind))");
  $db->exec("CREATE TABLE IF NOT EXISTS fees(id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, kind TEXT, amount REAL DEFAULT 0, demanded INTEGER DEFAULT 0, demanded_on TEXT DEFAULT '', paid INTEGER DEFAULT 0, paid_on TEXT DEFAULT '', ref TEXT DEFAULT '', note TEXT DEFAULT '', alert INTEGER DEFAULT 0, created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(customer_id, kind))");
  $db->exec("CREATE TABLE IF NOT EXISTS login_guard(k TEXT PRIMARY KEY, fails INTEGER DEFAULT 0, first INTEGER DEFAULT 0, until INTEGER DEFAULT 0)");
  $ucols = array_column($db->query('PRAGMA table_info(users)')->fetchAll(), 'name');
  if (!in_array('avatar', $ucols)) { try { $db->exec("ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''"); } catch (PDOException $e) { if (stripos($e->getMessage(), 'duplicate column') === false) throw $e; } }
  if (!in_array('sess_ver', $ucols)) { try { $db->exec('ALTER TABLE users ADD COLUMN sess_ver INTEGER DEFAULT 0'); } catch (PDOException $e) { if (stripos($e->getMessage(), 'duplicate column') === false) throw $e; } }
  $db->exec("CREATE TABLE IF NOT EXISTS plant(customer_id INTEGER PRIMARY KEY, data TEXT, updated TEXT DEFAULT CURRENT_TIMESTAMP, updated_by TEXT DEFAULT '')");
  $db->exec("CREATE TABLE IF NOT EXISTS trash(id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, label TEXT, data TEXT, deleted_by TEXT, deleted_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec("CREATE TABLE IF NOT EXISTS geo_cache(k TEXT PRIMARY KEY, name TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP)");
  $ac = array_column($db->query('PRAGMA table_info(attendance)')->fetchAll(), 'name');
  foreach (['in_place', 'out_place'] as $c) if ($ac && !in_array($c, $ac)) { try { $db->exec("ALTER TABLE attendance ADD COLUMN $c TEXT DEFAULT ''"); } catch (PDOException $e) { if (stripos($e->getMessage(), 'duplicate column') === false) throw $e; } }
  $uc = array_column($db->query('PRAGMA table_info(users)')->fetchAll(), 'name');
  if (!in_array('can_claim', $uc)) {
    try { $db->exec('ALTER TABLE users ADD COLUMN can_claim INTEGER DEFAULT 0'); } catch (PDOException $e) { if (stripos($e->getMessage(), 'duplicate column') === false) throw $e; }
    $db->exec("UPDATE users SET can_claim=1 WHERE role IN ('sales','admin')"); // keep existing sales staff working
  }
  $db->exec("CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, type TEXT, start TEXT, end TEXT DEFAULT '', all_day INTEGER DEFAULT 0, lead_id INTEGER, customer_id INTEGER, project_id INTEGER, user_id INTEGER, location TEXT DEFAULT '', notes TEXT DEFAULT '', status TEXT DEFAULT 'Scheduled', remind INTEGER DEFAULT 10, created_by INTEGER, created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec('CREATE INDEX IF NOT EXISTS ev_start ON events(start)');
  $db->exec("CREATE TABLE IF NOT EXISTS project_steps(id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, stage TEXT, note TEXT DEFAULT '', user TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec("CREATE TABLE IF NOT EXISTS stage_data(project_id INTEGER, stage TEXT, amount REAL DEFAULT 0, ref TEXT DEFAULT '', date TEXT DEFAULT '', file_id INTEGER, note TEXT DEFAULT '', user TEXT, updated TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(project_id, stage))");
  $db->exec("CREATE TABLE IF NOT EXISTS services(id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, date TEXT, type TEXT, status TEXT DEFAULT 'Scheduled', technician TEXT DEFAULT '', cost REAL DEFAULT 0, notes TEXT DEFAULT '', user TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP)");
  // old 10-stage pipeline → new stages (one-time)
  if (!$db->query("SELECT 1 FROM settings WHERE k='pipe_v2'")->fetch()) {
    $map = ['Survey' => 'KSEB feasibility check', 'Design' => 'KSEB feasibility check', 'Quotation' => 'Customer', 'Approval' => 'PMSG portal registration', 'Material' => 'Material delivery', 'Installation' => 'Structure installation',
      'Net-meter' => 'DISCOM net-meter commissioning', 'Commissioned' => 'Subsidy process', 'Subsidy' => 'Subsidy process', 'Closed' => 'Project completed'];
    foreach ($map as $o => $n) $db->prepare('UPDATE projects SET stage=? WHERE stage=?')->execute([$n, $o]);
    $db->exec("UPDATE projects SET stage='Customer' WHERE stage IS NULL OR stage=''");
    $db->exec("INSERT INTO project_steps(project_id,stage,note,user,created) SELECT id,stage,'Moved to the new pipeline','System',updated FROM projects");
    $db->exec("DELETE FROM settings WHERE k='project_stages'");
    $db->exec("INSERT OR REPLACE INTO settings(k,v) VALUES('pipe_v2','1')");
  }
  $db->exec("CREATE TABLE IF NOT EXISTS wa_chats(id INTEGER PRIMARY KEY AUTOINCREMENT, wa_id TEXT UNIQUE, name TEXT DEFAULT '', lead_id INTEGER, customer_id INTEGER, assigned_to INTEGER, last_msg TEXT DEFAULT '', last_at TEXT, last_in_at TEXT, last_in_wamid TEXT DEFAULT '', unread INTEGER DEFAULT 0, created TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec("CREATE TABLE IF NOT EXISTS wa_msgs(id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER, dir TEXT, type TEXT, body TEXT DEFAULT '', wamid TEXT DEFAULT '', status TEXT DEFAULT '', error TEXT DEFAULT '', user TEXT DEFAULT '', media_id TEXT DEFAULT '', file_path TEXT DEFAULT '', filename TEXT DEFAULT '', mime TEXT DEFAULT '', created TEXT DEFAULT CURRENT_TIMESTAMP)");
  $db->exec('CREATE INDEX IF NOT EXISTS wam_chat ON wa_msgs(chat_id, id)'); $db->exec('CREATE INDEX IF NOT EXISTS wam_wamid ON wa_msgs(wamid)');
  $db->exec("CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, date TEXT, check_in TEXT, check_out TEXT, in_lat REAL, in_lng REAL, in_acc INTEGER, out_lat REAL, out_lng REAL, out_acc INTEGER, in_place TEXT DEFAULT '', out_place TEXT DEFAULT '', status TEXT DEFAULT 'Present', notes TEXT DEFAULT '', edited_by TEXT DEFAULT '', created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, date))");
  $db->exec("CREATE TABLE IF NOT EXISTS leaves(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, type TEXT, from_date TEXT, to_date TEXT, half TEXT DEFAULT '', days REAL, reason TEXT DEFAULT '', status TEXT DEFAULT 'Pending', approver_id INTEGER, approver_note TEXT DEFAULT '', decided_at TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP)");
  migrateV1($db);
  // Speed: indexes on every column used to look up child rows / filter lists (lists, dashboard, pipeline and ads report were scanning whole tables per row)
  foreach ([
    'leads_owner ON leads(assigned_to)', 'leads_cust ON leads(customer_id)', 'leads_camp ON leads(campaign_id, status)', 'leads_notify ON leads(notify, created)',
    'leads_appt ON leads(appt)', 'cust_created ON customers(created)', 'proj_cust ON projects(customer_id)',
    'pay_proj ON payments(project_id, amount)', 'files_cust ON files(customer_id)', 'files_proj ON files(project_id)', 'notes_ent ON notes(entity, entity_id)',
    'msg_cust ON messages(customer_id)', 'msg_lead ON messages(lead_id)', 'quotes_cust ON quotes(customer_id)', 'quotes_lead ON quotes(lead_id)',
    'steps_proj ON project_steps(project_id, created)', 'svc_proj ON services(project_id)', 'spend_camp ON ad_spend(campaign_id)', 'leaves_user ON leaves(user_id, status)',
    'checklist_kind ON checklist(kind, project_id)',
  ] as $ix) $db->exec("CREATE INDEX IF NOT EXISTS $ix");
  // Email: every user connects their own mailboxes (up to 10), each private to them
  $db->exec("CREATE TABLE IF NOT EXISTS mail_accounts(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, provider TEXT DEFAULT 'hostinger', email TEXT, name TEXT DEFAULT '', imap_host TEXT, imap_port INTEGER DEFAULT 993, smtp_host TEXT, smtp_port INTEGER DEFAULT 465, pass TEXT DEFAULT '', signature TEXT DEFAULT '', unread INTEGER DEFAULT 0, unread_at INTEGER DEFAULT 0, problem TEXT DEFAULT '', last_used INTEGER DEFAULT 0, created TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, email))");
  if (!$db->query("SELECT 1 FROM settings WHERE k='mail_v25'")->fetch()) { // once: the old company mailbox becomes the admin's own first address; Email on for every role
    $old = json_decode((string)$db->query("SELECT v FROM settings WHERE k='mail_cfg'")->fetchColumn(), true);
    if (is_array($old) && !empty($old['email']) && !empty($old['pass'])) {
      $who = $db->query("SELECT u.id FROM audit_log a JOIN users u ON u.username=a.user WHERE a.action='mail_setup' AND u.role='admin' ORDER BY a.id DESC LIMIT 1")->fetchColumn()
        ?: $db->query("SELECT id FROM users WHERE role='admin' AND active=1 ORDER BY id LIMIT 1")->fetchColumn();
      if ($who) $db->prepare('INSERT OR IGNORE INTO mail_accounts(user_id,provider,email,name,imap_host,imap_port,smtp_host,smtp_port,pass,signature,last_used) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([(int)$who, ($old['imap_host'] ?? '') === 'imap.hostinger.com' ? 'hostinger' : 'other', strtolower($old['email']), $old['name'] ?? '', $old['imap_host'] ?? 'imap.hostinger.com', (int)($old['imap_port'] ?? 993), $old['smtp_host'] ?? 'smtp.hostinger.com', (int)($old['smtp_port'] ?? 465), $old['pass'], $old['signature'] ?? '', time()]);
    }
    $rp = $db->query("SELECT v FROM settings WHERE k='role_perms'")->fetchColumn();
    if ($rp) { $p = json_decode($rp, true) ?: [];
      foreach ($p as $role => &$perm) if ($role !== '_modules' && is_array($perm)) foreach (['read', 'write'] as $k) $perm[$k] = array_values(array_unique(array_merge((array)($perm[$k] ?? []), ['email'])));
      unset($perm); $db->prepare("UPDATE settings SET v=? WHERE k='role_perms'")->execute([json_encode($p)]); }
    $db->exec("DELETE FROM settings WHERE k='mail_unread'");
    $db->exec("INSERT OR REPLACE INTO settings(k,v) VALUES('mail_v25','1')");
  }
  // Quotation maker (v26): product catalogue, saved templates, and the maker's document on each quotation
  $db->exec("CREATE TABLE IF NOT EXISTS qm_products(id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, label TEXT DEFAULT '', cat TEXT, name TEXT DEFAULT '', line TEXT DEFAULT '', details TEXT DEFAULT '', title TEXT DEFAULT '', unit TEXT DEFAULT 'no', qty REAL DEFAULT 1, qty_note TEXT DEFAULT '', wp REAL DEFAULT 0, kw REAL DEFAULT 0, kw_line INTEGER DEFAULT 0, needs_opt INTEGER DEFAULT 0, warranty TEXT DEFAULT '[]', brands TEXT DEFAULT '[]', picture TEXT DEFAULT '', page TEXT DEFAULT '', rate REAL DEFAULT 0, is_default INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0, sort INTEGER DEFAULT 0, created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
  $qpc = array_column($db->query('PRAGMA table_info(qm_products)')->fetchAll(), 'name');
  if (!in_array('label', $qpc)) { try { $db->exec("ALTER TABLE qm_products ADD COLUMN label TEXT DEFAULT ''"); } catch (PDOException $e) { if (stripos($e->getMessage(), 'duplicate column') === false) throw $e; } }
  if (!in_array('kw_line', $qpc)) { try { $db->exec("ALTER TABLE qm_products ADD COLUMN kw_line INTEGER DEFAULT 0"); } catch (PDOException $e) { if (stripos($e->getMessage(), 'duplicate column') === false) throw $e; } }
  $db->exec('CREATE INDEX IF NOT EXISTS qmp_cat ON qm_products(cat, sort)');
  $db->exec("CREATE TABLE IF NOT EXISTS qm_templates(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, data TEXT, created_by INTEGER, created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
  $qc = array_column($db->query('PRAGMA table_info(quotes)')->fetchAll(), 'name');
  if (!in_array('doc', $qc)) { try { $db->exec("ALTER TABLE quotes ADD COLUMN doc TEXT DEFAULT ''"); } catch (PDOException $e) { if (stripos($e->getMessage(), 'duplicate column') === false) throw $e; } }
  $db->exec("INSERT OR IGNORE INTO settings(k,v) VALUES('qm_next','144')");
  /* v27: call-back reminders on leads. Changed only through leads/callback (not the lead save), so saving a lead
     from an older copy can't wipe one. callback_at is local time 'Y-m-d H:i'; callback_sent = bell notification sent. */
  $lc = array_column($db->query('PRAGMA table_info(leads)')->fetchAll(), 'name');
  foreach (['callback_at' => "TEXT DEFAULT ''", 'callback_note' => "TEXT DEFAULT ''", 'callback_by' => 'INTEGER', 'callback_sent' => 'INTEGER DEFAULT 0'] as $c => $ty)
    if (!in_array($c, $lc)) { try { $db->exec("ALTER TABLE leads ADD COLUMN $c $ty"); } catch (PDOException $e) { if (stripos($e->getMessage(), 'duplicate column') === false) throw $e; } }
  $db->exec('CREATE INDEX IF NOT EXISTS lead_callback ON leads(callback_sent, callback_at)');
  /* v30: payment receipts — a payment gets its receipt number (PREFIX/RCPT/FY/NNN) the first time its receipt is made, and keeps it.
     Not in the payments column list, so editing a payment can't clear it. */
  /* v32: presence — seen_at = last heartbeat from an open CRM tab, active_at = last time the person used it (unix seconds) */
  $uc = array_column($db->query('PRAGMA table_info(users)')->fetchAll(), 'name');
  foreach (['seen_at', 'active_at'] as $c) if (!in_array($c, $uc)) { try { $db->exec("ALTER TABLE users ADD COLUMN $c INTEGER DEFAULT 0"); } catch (PDOException $e) { if (stripos($e->getMessage(), 'duplicate column') === false) throw $e; } }
  $pc = array_column($db->query('PRAGMA table_info(payments)')->fetchAll(), 'name');
  if ($pc && !in_array('receipt_no', $pc)) { try { $db->exec("ALTER TABLE payments ADD COLUMN receipt_no TEXT DEFAULT ''"); } catch (PDOException $e) { if (stripos($e->getMessage(), 'duplicate column') === false) throw $e; } }
  /* v28: every customer has an owner (the Me / All filter, reassign). Changed only through customers/reassign, never by a save.
     Customers without an owner (all of them the first time): whoever claimed the lead it came from, else the user whose name is in added_by. */
  $cc = array_column($db->query('PRAGMA table_info(customers)')->fetchAll(), 'name');
  if (!in_array('owner_id', $cc)) { try { $db->exec('ALTER TABLE customers ADD COLUMN owner_id INTEGER'); } catch (PDOException $e) { if (stripos($e->getMessage(), 'duplicate column') === false) throw $e; } }
  $db->exec('CREATE INDEX IF NOT EXISTS cust_owner ON customers(owner_id)');
  $db->exec('UPDATE customers SET owner_id=(SELECT l.assigned_to FROM leads l WHERE l.customer_id=customers.id AND l.assigned_to>0 ORDER BY l.id DESC LIMIT 1) WHERE owner_id IS NULL');
  $db->exec("UPDATE customers SET owner_id=(SELECT u.id FROM users u WHERE lower(trim(u.name))=lower(trim(customers.added_by)) ORDER BY u.active DESC, u.id LIMIT 1) WHERE owner_id IS NULL AND trim(COALESCE(added_by,''))<>''");
  /* v37: lead type on every lead and customer (Meta form leads → Meta, the rest → Office until someone says Own); incentive approval
     and auto amounts on commissions. Amounts already typed count as approved, so nothing changes for them. */
  $db->exec("UPDATE leads SET lead_type=CASE WHEN COALESCE(meta_id,'')<>'' OR source='Meta Ads' THEN 'meta' ELSE 'office' END WHERE COALESCE(lead_type,'') NOT IN ('own','office','meta')");
  $db->exec("UPDATE customers SET lead_type=COALESCE((SELECT l.lead_type FROM leads l WHERE l.customer_id=customers.id ORDER BY l.id DESC LIMIT 1),'office') WHERE COALESCE(lead_type,'') NOT IN ('own','office','meta')");
  /* v38: a customer added directly (no lead behind it) is never Meta */
  $db->exec("UPDATE customers SET lead_type='office' WHERE lead_type='meta' AND id NOT IN (SELECT customer_id FROM leads WHERE customer_id IS NOT NULL)");
  /* v36: Business Associates never have WhatsApp: chats assigned to one go back to unassigned so staff see them again */
  $db->exec("UPDATE wa_chats SET assigned_to=NULL WHERE assigned_to IN (SELECT id FROM users WHERE role='ba')");
  /* v35: Finance › Commission (BA customers) / Incentive (staff customers). One row per customer: the amount the admin agreed,
     paid in two parts (amount, date, transaction ID); visible = the person may see it. user_id is fixed on the first save. */
  $db->exec("CREATE TABLE IF NOT EXISTS commissions(id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER UNIQUE, user_id INTEGER, amount REAL DEFAULT 0, p1_amount REAL DEFAULT 0, p1_date TEXT DEFAULT '', p1_ref TEXT DEFAULT '', p2_amount REAL DEFAULT 0, p2_date TEXT DEFAULT '', p2_ref TEXT DEFAULT '', visible INTEGER DEFAULT 0, note TEXT DEFAULT '', created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP, updated_by TEXT DEFAULT '')");
  $db->exec('CREATE INDEX IF NOT EXISTS comm_user ON commissions(user_id, visible)');
  /* v37 (continued): incentive approval and auto amounts on commissions, after the table exists */
  $cmc = array_column($db->query('PRAGMA table_info(commissions)')->fetchAll(), 'name');
  foreach (["appr TEXT DEFAULT ''", "appr_by TEXT DEFAULT ''", "appr_at TEXT DEFAULT ''", 'auto INTEGER DEFAULT 0', "calc TEXT DEFAULT ''"] as $col) { $cn = strtok($col, ' ');
    if ($cmc && !in_array($cn, $cmc)) { try { $db->exec("ALTER TABLE commissions ADD COLUMN $col"); } catch (PDOException $e) { if (stripos($e->getMessage(), 'duplicate column') === false) throw $e; } } }
  $db->exec("UPDATE commissions SET appr='ok' WHERE COALESCE(appr,'')='' AND (amount>0 OR p1_amount>0)");
  /* v41: the Folder page is a file manager - ds_folders (nested) and datasheets.folder_id; old category files go to "Old uploads" / <category> */
  $db->exec("CREATE TABLE IF NOT EXISTS ds_folders(id INTEGER PRIMARY KEY AUTOINCREMENT, parent_id INTEGER, name TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP, user TEXT)");
  $db->exec("CREATE INDEX IF NOT EXISTS ds_folders_parent ON ds_folders(parent_id)");
  if (!in_array('folder_id', array_column($db->query('PRAGMA table_info(datasheets)')->fetchAll(), 'name'))) { try { $db->exec('ALTER TABLE datasheets ADD COLUMN folder_id INTEGER'); } catch (PDOException $e) { if (stripos($e->getMessage(), 'duplicate column') === false) throw $e; } }
  $db->exec("CREATE INDEX IF NOT EXISTS datasheets_folder ON datasheets(folder_id)");
  /* the sweep below runs exactly once (flag ds_fm_migrated); later schema bumps must not touch top-level files */
  if (!$db->query("SELECT 1 FROM settings WHERE k='ds_fm_migrated'")->fetch()) {
    $db->exec('BEGIN IMMEDIATE');
    try {
      if (!$db->query("SELECT 1 FROM settings WHERE k='ds_fm_migrated'")->fetch()) {
        $legacy = array_column($db->query('SELECT id FROM datasheets WHERE folder_id IS NULL')->fetchAll(), 'id');
        if ($legacy) {
          $old = $db->query("SELECT id FROM ds_folders WHERE parent_id IS NULL AND name='Old uploads' COLLATE NOCASE")->fetchColumn();
          if (!$old) { $db->exec("INSERT INTO ds_folders(parent_id,name,user) VALUES(NULL,'Old uploads','System')"); $old = (int)$db->lastInsertId(); }
          $cats = $db->query("SELECT DISTINCT TRIM(category) FROM datasheets WHERE folder_id IS NULL AND TRIM(COALESCE(category,''))<>''")->fetchAll(PDO::FETCH_COLUMN);
          foreach ($cats as $cat) {
            $nm = trim(preg_replace('/[\x00-\x1f\x7f]/', '', str_replace(['/', '\\'], '-', mb_substr($cat, 0, 80))));
            if ($nm === '' || $nm === '.' || $nm === '..') $nm = 'Other';
            $sub = $db->prepare('SELECT id FROM ds_folders WHERE parent_id=? AND name=? COLLATE NOCASE'); $sub->execute([$old, $nm]); $sid = $sub->fetchColumn();
            if (!$sid) { $db->prepare("INSERT INTO ds_folders(parent_id,name,user) VALUES(?,?,'System')")->execute([$old, $nm]); $sid = (int)$db->lastInsertId(); }
            $db->prepare('UPDATE datasheets SET folder_id=? WHERE folder_id IS NULL AND TRIM(category)=?')->execute([$sid, $cat]);
          }
          $db->prepare('UPDATE datasheets SET folder_id=? WHERE folder_id IS NULL')->execute([$old]);
          /* keep the names staff gave: file_name becomes the title (when it differs from the file-name stem) plus the original extension */
          $rs = $db->query('SELECT id,folder_id,title,file_name FROM datasheets WHERE id IN (' . implode(',', array_map('intval', $legacy)) . ') ORDER BY id')->fetchAll();
          $want = []; $used = [];
          foreach ($rs as $r) {
            $ext = pathinfo($r['file_name'], PATHINFO_EXTENSION); $stem = pathinfo($r['file_name'], PATHINFO_FILENAME);
            $t = trim(mb_substr(trim(preg_replace('/[\x00-\x1f\x7f]/', '', str_replace(['/', '\\'], '', (string)$r['title']))), 0, 80));
            if ($t === '' || $t === '.' || $t === '..' || $t === $stem) { $used[(int)$r['folder_id']][mb_strtolower($r['file_name'])] = 1; continue; }
            $want[] = [$r['id'], (int)$r['folder_id'], $t, $ext];
          }
          foreach ($want as [$id, $fo, $t, $ext]) {
            $sfx = $ext === '' ? '' : ".$ext"; $n = $t . $sfx; $k = 2;
            while (isset($used[$fo][mb_strtolower($n)])) $n = $t . ' (' . $k++ . ')' . $sfx;
            $used[$fo][mb_strtolower($n)] = 1;
            $db->prepare('UPDATE datasheets SET file_name=? WHERE id=?')->execute([$n, $id]);
          }
        }
        $db->exec("INSERT OR REPLACE INTO settings(k,v) VALUES('ds_fm_migrated','1')");
      }
      $db->exec('COMMIT');
    } catch (Throwable $e) { try { $db->exec('ROLLBACK'); } catch (Throwable $e2) { } throw $e; }
  }
  /* v40: customers.pole_no, aadhaar_no, pan_no and the loan_* columns (TEXT, loan_amount kept out of NUMS so blank stays blank) come from the column list above */
  /* v39: customers.premises (Owned / Leased) and customers.transformer (distribution transformer & HT feeder), asked for by the
     KSEB net metering agreement, come from the column list above; plant.meter_by (Consumer / KSEB) lives in the plant JSON */
  /* v34: customers.jansamarth_id (the Jan Samarth solar loan application ID, ANS-SOLAR-…) comes from the column list above */
  /* v33: every customer's empty KSEB sub division / division / circle (and section) filled from the consumer number or section */
  require_once __DIR__ . '/kseb_offices.php';
  kseb_backfill($db);
  require_once __DIR__ . '/qm_seed.php';
  qm_seed($db); // only fills an empty catalogue
  $db->exec('ANALYZE'); // give the query planner row counts for the new indexes
}

// v1 (single-table) customers -> projects, once.
function migrateV1($db) {
  if ($db->query("SELECT 1 FROM settings WHERE k='v1_migrated'")->fetch()) return;
  $have = array_column($db->query('PRAGMA table_info(customers)')->fetchAll(), 'name');
  if (in_array('stage', $have)) {
    $map = ['Lead'=>'Survey','Site Survey'=>'Survey','Quotation'=>'Quotation','Negotiation'=>'Quotation','Approved'=>'Approval','Installation'=>'Installation','Commissioned'=>'Commissioned','Lost'=>'Closed'];
    foreach ($db->query('SELECT * FROM customers')->fetchAll() as $c) {
      if (!empty($c['quote']) || !empty($c['kw']) || ($c['stage'] ?? 'Lead') !== 'Lead') {
        $db->prepare('INSERT INTO projects(customer_id,title,kw,panel,inverter,stage,cost,application_no,notes) VALUES(?,?,?,?,?,?,?,?,?)')
           ->execute([$c['id'], ($c['kw'] ? $c['kw'] . ' kW ' : '') . 'Solar', $c['kw'], $c['panel'], $c['inverter'], $map[$c['stage']] ?? 'Survey', $c['quote'] ?? 0, $c['kseb_ref'] ?? '', '']);
        $pid = $db->lastInsertId();
        if (!empty($c['paid'])) $db->prepare('INSERT INTO payments(project_id,date,amount,mode,note) VALUES(?,?,?,?,?)')->execute([$pid, substr($c['updated'] ?? '', 0, 10), $c['paid'], '', 'Migrated from v1']);
      }
    }
  }
  $db->exec("INSERT OR REPLACE INTO settings(k,v) VALUES('v1_migrated','1')");
}

function defaults() {
  return [
    'company' => ['name'=>'Jasper Solar Solutions','gstin'=>'32CZHPA7698N1ZR','address'=>'Nedumangad, Thiruvananthapuram, Kerala','phone'=>'','email'=>'','quote_prefix'=>'JS','terms'=>"1. Prices valid for 15 days.\n2. 50% advance with order, balance on commissioning.\n3. 25 years panel performance warranty, 5 years inverter warranty (as per manufacturer).\n4. Net-metering and KSEB formalities handled by Jasper Solar.\n5. Central subsidy (PM Surya Ghar) credited by the government directly to the customer's bank account."],
    'gst_rate' => 8.9,
    'lead_target' => 1000, // leads per month (dashboard: Lead target)
    'customer_target' => 2000, // customers per year (dashboard: Customer target)
    'role_perms' => [],
    'ds_categories' => ['Solar Panel', 'On-Grid String Inverter', 'Micro Inverter', 'SolarEdge'],
    'login' => ['bg' => '', 'tagline' => 'Max speed CRM', 'dim' => 35],
    'lead_sources' => ['Meta Ads','Referral','Walk-in','Website','Google','Existing customer','Other'],
    'lead_statuses' => ['New','Contacted','Site Visit','Quoted','Won','Lost'],
    'project_stages' => ['Customer','KSEB feasibility check','Loan registration','KSEB feasibility payment','PMSG portal registration','KSEB registration fee payment','Material delivery','Structure installation','Electrical installation','KSEB documents submission','DISCOM inspection','DISCOM net-meter commissioning','Subsidy process','Tax bill generation','Warranty card delivery','Project completed'],
    'subsidy_steps' => ['Registered on PM Surya Ghar portal','Application submitted (consumer no. + bank)','KSEB feasibility approval','Vendor selected on portal','Installation completed','Net-meter installed','Commissioning report submitted','Bank account details verified','Portal inspection done','Subsidy released to customer'],
    'kseb_items' => KSEB_ITEMS,
    'kseb_items_rev' => 0, // 2 once kseb_items_upgrade() has run on this database
    'subsidy_rates' => ['per_kw_first2' => 30000, 'third_kw' => 18000, 'cap' => 78000],
    'catalog' => [
      ['desc'=>'Solar PV module 550 Wp (DCR) ','rate'=>0],['desc'=>'Grid-tie inverter','rate'=>0],['desc'=>'Mounting structure (GI)','rate'=>0],
      ['desc'=>'DC/AC cables, MC4, earthing, LA','rate'=>0],['desc'=>'Net-meter & KSEB formalities','rate'=>0],['desc'=>'Installation & commissioning','rate'=>0]],
    'wa_templates' => [
      ['name'=>'Greeting','text'=>"Hello {name}, this is {company}. Thank you for your interest in rooftop solar. When can we schedule a free site visit?"],
      ['name'=>'Quotation sent','text'=>"Hello {name}, we have shared your solar quotation ({quote_no}) for ₹{amount}. Please let us know if you have any questions."],
      ['name'=>'Follow-up','text'=>"Hello {name}, following up on your rooftop solar enquiry with {company}. Shall we proceed with the next step?"],
      ['name'=>'Document request','text'=>"Hello {name}, for your KSEB / PM Surya Ghar application please send: latest electricity bill, Aadhaar, bank passbook copy and a roof photo."],
      ['name'=>'Installation date','text'=>"Hello {name}, your solar installation is scheduled on {date}. Our team will contact you before arriving."],
      ['name'=>'Payment due','text'=>"Hello {name}, a balance of ₹{amount} is pending for your solar installation. Kindly arrange the payment. Thank you."],
    ],
  ];
}
// KSEB documentation checklist: the list KSEB asks for with every solar application (Nov 2026).
const KSEB_ITEMS = ['Annexure II', 'Details of installation and checklist', 'Test cum completion certificate', 'Single line drawing',
  'Panel datasheet', 'Inverter datasheet', 'BIS certificate of panel', 'BIS certificate of inverter', 'Work completion report',
  'Panel serial number certificate', 'DCR certificate', 'Energy meter calibration report', 'Annexure III', 'Warranty certificate',
  'Vendor declaration associated with the implementation of ALMM order', 'Inspection report', 'Solar agreement'];
// old checklist items whose ticks and uploaded files carry over to the new list
const KSEB_ITEMS_MAP = ['Single line diagram' => 'Single line drawing', 'Inverter datasheet & warranty' => 'Inverter datasheet',
  'Panel DCR certificate & warranty card' => 'DCR certificate', 'Agreement with KSEB' => 'Solar agreement'];
// once per database (no schema bump): switch to KSEB_ITEMS, carry matching ticks and files over, remember it in kseb_items_rev
function kseb_items_upgrade(&$s) {
  foreach (KSEB_ITEMS_MAP as $old => $new) {
    q("UPDATE OR IGNORE checklist SET item=? WHERE kind='kseb' AND item=?", [$new, $old]);
    q("UPDATE files SET item=? WHERE kind='kseb' AND item=?", [$new, $old]);
  }
  foreach (['kseb_items' => KSEB_ITEMS, 'kseb_items_rev' => 2] as $k => $v)
    q('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', [$k, json_encode($v, JSON_UNESCAPED_UNICODE)]);
  $s['kseb_items'] = KSEB_ITEMS; $s['kseb_items_rev'] = 2;
}

function settings($fresh = false) { // read once per request; only the keys we use (skips big blobs such as mail / Meta state)
  static $s = null;
  if ($s !== null && !$fresh) return $s;
  $s = defaults(); $keys = array_keys($s);
  foreach (rows('SELECT k,v FROM settings WHERE k IN (' . implode(',', array_fill(0, count($keys), '?')) . ')', $keys) as $r) $s[$r['k']] = json_decode($r['v'], true);
  if ((int)($s['kseb_items_rev'] ?? 0) < 2) kseb_items_upgrade($s);
  return $s;
}

function audit($action, $entity, $id = null, $detail = '') {
  q('INSERT INTO audit_log(user,action,entity,entity_id,detail) VALUES(?,?,?,?,?)', [$_SESSION['username'] ?? '-', $action, $entity, $id, $detail]);
}
function pick($in, $cols) {
  $r = [];
  foreach ($cols as $c) {
    $v = $in[$c] ?? null;
    if (in_array($c, IDS)) $r[$c] = ($v === null || $v === '' || (int)$v === 0) ? null : (int)$v;
    elseif (in_array($c, NUMS)) $r[$c] = (float)$v;
    else $r[$c] = is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : trim((string)$v);
  }
  return $r;
}

function branding() {
  $v = defaults()['login'];
  $r = row("SELECT v FROM settings WHERE k='login'");
  if ($r) $v = array_merge($v, json_decode($r['v'], true) ?: []);
  $bg = basename((string)$v['bg']);
  $ok = $bg !== '' && is_file(dirname(__DIR__) . '/uploads/' . $bg);
  return ['bg' => $ok ? 'uploads/' . $bg . '?v=' . filemtime(dirname(__DIR__) . '/uploads/' . $bg) : '', 'tagline' => (string)$v['tagline'], 'dim' => max(0, min(80, (int)$v['dim']))];
}

function strip_fin($r) {
  if (can('finance')) return $r;
  foreach (['cost', 'paid', 'budget', 'subsidy_amount', 'due', 'total', 'spend', 'amount', 'quote'] as $k) unset($r[$k]);
  if (isset($r['payments'])) $r['payments'] = [];
  if (isset($r['stage_data'])) foreach ($r['stage_data'] as &$d) unset($d['amount']);
  if (isset($r['services'])) foreach ($r['services'] as &$s) unset($s['cost']);
  if (isset($r['projects']) && is_array($r['projects'])) foreach ($r['projects'] as &$p) unset($p['cost'], $p['paid'], $p['subsidy_amount']); // customer detail
  if (isset($r['quotes']) && is_array($r['quotes'])) foreach ($r['quotes'] as &$x) unset($x['total']);
  return $r;
}
