<?php
// Shared bootstrap: DB, schema, settings, permissions, helpers.
const SCHEMA_VERSION = 6; // bump when tables/columns change
const IDS = ['customer_id','lead_id','project_id','campaign_id','assigned_to','user_id','file_id'];
const NUMS = ['notify','kw','budget','cost','subsidy_amount','gst_rate','subsidy','total','spend','impressions','clicks','leads','amount','sanctioned_load'];

// entity => [module, columns]
$E = [
  'leads' => ['leads', ['name','phone','email','address','city','location','remark','appt','added_by','source','campaign_id','status','assigned_to','followup','kw','budget','customer_id','notes','meta_id','meta_form','meta_ad','meta_campaign','notify','claimed_at']],
  'customers' => ['customers', ['name','phone','email','address','consumer_no','kseb_section','sanctioned_load','roof_type','gst_no','notes']],
  'projects' => ['projects', ['customer_id','title','kw','panel','inverter','stage','engineer','start','end','cost','application_no','subsidy_status','subsidy_amount','notes']],
  'quotes' => ['quotes', ['customer_id','lead_id','number','date','items','gst_rate','subsidy','terms','status','total']],
  'campaigns' => ['ads', ['name','platform','objective','start','end','budget','status']],
  'ad_spend' => ['ads', ['campaign_id','date','spend','impressions','clicks','leads']],
  'payments' => ['payments', ['project_id','date','amount','mode','note']],
];

// role => [read modules, write modules]; '*' = everything
const ROLES = [
  'admin' => ['*', '*'],
  'sales' => [['folder','dashboard','leads','customers','projects','quotes','checklist','files','payments','whatsapp','ads','settings'], ['leads','customers','quotes','whatsapp','files','folder']],
  'engineer' => [['folder','dashboard','leads','customers','projects','quotes','checklist','files','payments','settings'], ['projects','checklist','files','customers','folder']],
  'accounts' => [['folder','dashboard','leads','customers','projects','quotes','checklist','files','payments','ads','whatsapp','settings'], ['quotes','payments','ads']],
];

function out($d, $code = 200) { http_response_code($code); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function fail($msg, $code = 400) { out(['error' => $msg], $code); }
function body() { static $b; if ($b === null) $b = json_decode(file_get_contents('php://input'), true) ?: []; return $b; }

function can($module, $write = false) {
  $r = ROLES[$_SESSION['role'] ?? ''] ?? null; if (!$r) return false;
  $list = $r[$write ? 1 : 0];
  if ($list === '*' || in_array($module, $list)) return true;
  // 'Can see & claim leads' (Admin → Users) lets any role work the leads they claim; ownership is enforced in claims.php
  return in_array($module, CLAIM_GRANTS) && function_exists('can_claim') && can_claim();
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
  $db->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000');
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
  $uc = array_column($db->query('PRAGMA table_info(users)')->fetchAll(), 'name');
  if (!in_array('can_claim', $uc)) {
    try { $db->exec('ALTER TABLE users ADD COLUMN can_claim INTEGER DEFAULT 0'); } catch (PDOException $e) { if (stripos($e->getMessage(), 'duplicate column') === false) throw $e; }
    $db->exec("UPDATE users SET can_claim=1 WHERE role IN ('sales','admin')"); // keep existing sales staff working
  }
  migrateV1($db);
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
    'lead_target' => 1000,
    'ds_categories' => ['Solar Panel', 'On-Grid String Inverter', 'Micro Inverter', 'SolarEdge'],
    'login' => ['bg' => '', 'tagline' => 'Max speed CRM', 'dim' => 35],
    'lead_sources' => ['Meta Ads','Referral','Walk-in','Website','Google','Existing customer','Other'],
    'lead_statuses' => ['New','Contacted','Site Visit','Quoted','Won','Lost'],
    'project_stages' => ['Survey','Design','Quotation','Approval','Material','Installation','Net-meter','Commissioned','Subsidy','Closed'],
    'subsidy_steps' => ['Registered on PM Surya Ghar portal','Application submitted (consumer no. + bank)','KSEB feasibility approval','Vendor selected on portal','Installation completed','Net-meter installed','Commissioning report submitted','Bank account details verified','Portal inspection done','Subsidy released to customer'],
    'kseb_items' => ['Urjamithra / Ente Urja application','Feasibility approval letter','Agreement with KSEB','Electrical wiring & test report','Single line diagram','Inverter datasheet & warranty','Panel DCR certificate & warranty card','Net-meter application','Electrical inspectorate (CEI) approval','Meter installation / synchronisation','Customer ID proof & latest electricity bill','Roof ownership / NOC'],
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
function settings() {
  $s = defaults();
  foreach (rows('SELECT k,v FROM settings') as $r) if (array_key_exists($r['k'], $s)) $s[$r['k']] = json_decode($r['v'], true);
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
