<?php
// Solarize CRM API - PHP + SQLite
session_set_cookie_params(['httponly'=>true,'samesite'=>'Lax','secure'=>!empty($_SERVER['HTTPS'])]);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) { mkdir($dataDir, 0750, true); }
if (!file_exists("$dataDir/.htaccess")) { file_put_contents("$dataDir/.htaccess", "Require all denied\nDeny from all\n"); }
$cfgFile = "$dataDir/config.php";

$db = new PDO('sqlite:' . $dataDir . '/crm.sqlite');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec("CREATE TABLE IF NOT EXISTS customers(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT,
  stage TEXT DEFAULT 'Lead', kw REAL DEFAULT 0, panel TEXT, inverter TEXT, source TEXT,
  quote REAL DEFAULT 0, paid REAL DEFAULT 0, followup TEXT, kseb_ref TEXT, notes TEXT,
  created TEXT DEFAULT CURRENT_TIMESTAMP, updated TEXT DEFAULT CURRENT_TIMESTAMP)");
$db->exec("CREATE TABLE IF NOT EXISTS activities(
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL, text TEXT NOT NULL,
  created TEXT DEFAULT CURRENT_TIMESTAMP)");

function out($d, $code=200){ http_response_code($code); echo json_encode($d); exit; }

// First-run: password setup
$hasPw = file_exists($cfgFile);
$action = $_GET['a'] ?? '';
$in = json_decode(file_get_contents('php://input'), true) ?: [];

if ($action === 'status') out(['setup'=>!$hasPw, 'auth'=>!empty($_SESSION['ok'])]);
if ($action === 'setup') {
  if ($hasPw) out(['error'=>'Already set up'], 403);
  $pw = $in['password'] ?? '';
  if (strlen($pw) < 8) out(['error'=>'Password must be at least 8 characters'], 400);
  file_put_contents($cfgFile, "<?php return " . var_export(['hash'=>password_hash($pw, PASSWORD_DEFAULT)], true) . ";");
  $_SESSION['ok'] = true; out(['ok'=>true]);
}
if ($action === 'login') {
  if (!$hasPw) out(['error'=>'Not set up'], 400);
  usleep(400000);
  $cfg = include $cfgFile;
  if (password_verify($in['password'] ?? '', $cfg['hash'])) { session_regenerate_id(true); $_SESSION['ok'] = true; out(['ok'=>true]); }
  out(['error'=>'Wrong password'], 401);
}
if ($action === 'logout') { session_destroy(); out(['ok'=>true]); }
if (empty($_SESSION['ok'])) out(['error'=>'Unauthorized'], 401);

$stages = ['Lead','Site Survey','Quotation','Negotiation','Approved','Installation','Commissioned','Lost'];
$fields = ['name','phone','email','address','stage','kw','panel','inverter','source','quote','paid','followup','kseb_ref','notes'];

function vals($in, $fields){
  $r = [];
  foreach ($fields as $f) { $v = $in[$f] ?? ''; if (in_array($f,['kw','quote','paid'])) $v = (float)$v; else $v = trim((string)$v); $r[$f] = $v; }
  return $r;
}

switch ($action) {
  case 'list':
    out($db->query("SELECT * FROM customers ORDER BY updated DESC")->fetchAll(PDO::FETCH_ASSOC));
  case 'get':
    $s = $db->prepare("SELECT * FROM customers WHERE id=?"); $s->execute([(int)$_GET['id']]);
    $c = $s->fetch(PDO::FETCH_ASSOC); if (!$c) out(['error'=>'Not found'],404);
    $s = $db->prepare("SELECT * FROM activities WHERE customer_id=? ORDER BY id DESC"); $s->execute([$c['id']]);
    $c['activities'] = $s->fetchAll(PDO::FETCH_ASSOC); out($c);
  case 'save':
    $v = vals($in, $fields);
    if ($v['name']==='') out(['error'=>'Name required'],400);
    if (!in_array($v['stage'],$stages)) $v['stage']='Lead';
    if (!empty($in['id'])) {
      $old = $db->prepare("SELECT stage FROM customers WHERE id=?"); $old->execute([(int)$in['id']]); $o = $old->fetchColumn();
      $set = implode(',', array_map(fn($f)=>"$f=:$f", $fields));
      $v['id'] = (int)$in['id'];
      $db->prepare("UPDATE customers SET $set, updated=CURRENT_TIMESTAMP WHERE id=:id")->execute($v);
      if ($o && $o !== $v['stage']) $db->prepare("INSERT INTO activities(customer_id,text) VALUES(?,?)")->execute([$v['id'],"Stage: $o → {$v['stage']}"]);
      out(['id'=>$v['id']]);
    }
    $cols = implode(',', $fields); $ph = implode(',', array_map(fn($f)=>":$f", $fields));
    $db->prepare("INSERT INTO customers($cols) VALUES($ph)")->execute($v);
    $id = (int)$db->lastInsertId();
    $db->prepare("INSERT INTO activities(customer_id,text) VALUES(?,?)")->execute([$id,"Customer created ({$v['stage']})"]);
    out(['id'=>$id]);
  case 'stage':
    $st = $in['stage'] ?? ''; if (!in_array($st,$stages)) out(['error'=>'Bad stage'],400);
    $id = (int)$in['id'];
    $old = $db->prepare("SELECT stage FROM customers WHERE id=?"); $old->execute([$id]); $o = $old->fetchColumn();
    $db->prepare("UPDATE customers SET stage=?, updated=CURRENT_TIMESTAMP WHERE id=?")->execute([$st,$id]);
    if ($o !== $st) $db->prepare("INSERT INTO activities(customer_id,text) VALUES(?,?)")->execute([$id,"Stage: $o → $st"]);
    out(['ok'=>true]);
  case 'delete':
    $id = (int)$in['id'];
    $db->prepare("DELETE FROM activities WHERE customer_id=?")->execute([$id]);
    $db->prepare("DELETE FROM customers WHERE id=?")->execute([$id]); out(['ok'=>true]);
  case 'note':
    $t = trim($in['text'] ?? ''); if ($t==='') out(['error'=>'Empty'],400);
    $db->prepare("INSERT INTO activities(customer_id,text) VALUES(?,?)")->execute([(int)$in['id'],$t]);
    $db->prepare("UPDATE customers SET updated=CURRENT_TIMESTAMP WHERE id=?")->execute([(int)$in['id']]);
    out(['ok'=>true]);
  case 'import':
    $n=0; $db->beginTransaction();
    foreach (($in['rows'] ?? []) as $r) {
      $v = vals($r,$fields); if ($v['name']==='') continue;
      if (!in_array($v['stage'],$stages)) $v['stage']='Lead';
      $cols = implode(',', $fields); $ph = implode(',', array_map(fn($f)=>":$f", $fields));
      $db->prepare("INSERT INTO customers($cols) VALUES($ph)")->execute($v); $n++;
    }
    $db->commit(); out(['imported'=>$n]);
  case 'password':
    $cfg = include $cfgFile;
    if (!password_verify($in['old'] ?? '', $cfg['hash'])) out(['error'=>'Wrong current password'],401);
    if (strlen($in['new'] ?? '') < 8) out(['error'=>'Min 8 characters'],400);
    file_put_contents($cfgFile, "<?php return " . var_export(['hash'=>password_hash($in['new'], PASSWORD_DEFAULT)], true) . ";");
    out(['ok'=>true]);
}
out(['error'=>'Unknown action'],404);
