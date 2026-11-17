<?php
// Android app "Solarize Leads" (android/): a device token keeps the app signed in, and the app's background check
// (every 15 minutes, also while the app is closed) asks here for new leads and lead alerts.
// The token is a 256-bit random value; only its SHA-256 is stored. It dies when the user signs out in the app, changes
// the password (users.sess_ver), is disabled or deleted, or after APP_TOKEN_DAYS without use.
const APP_TOKEN_DAYS = 30;
/* The newest app version and where its APK is (app/Jasper.apk in the site root). After building a new APK with android/build.sh:
   copy it to app/Jasper.apk and raise this number - every older app then shows "New version available" in its side menu. */
const APP_LATEST = '1.4';
const APP_URL = 'app/Jasper.apk';
const APP_ALERT_TITLES = ['callback' => 'Call back reminder', 'assign' => 'Lead for you', 'mention' => 'You were tagged in a team discussion', 'reply' => 'Team discussion', 'end' => 'Team discussion ended', 'remind' => 'Unattended team discussion'];

function app_token_issue($uid, $device = '') {
  $u = row('SELECT sess_ver FROM users WHERE id=?', [(int)$uid]);
  $tok = bin2hex(random_bytes(32));
  q('DELETE FROM app_tokens WHERE used < ?', [time() - APP_TOKEN_DAYS * 86400]);
  q('INSERT INTO app_tokens(user_id,hash,sv,device,created,used) VALUES(?,?,?,?,?,?)', [(int)$uid, hash('sha256', $tok), (int)($u['sess_ver'] ?? 0), mb_substr((string)$device, 0, 80), time(), time()]);
  return $tok;
}
/* the user a token belongs to, or null (unknown, too old, password changed since, user disabled) */
function app_token_user($tok) {
  $tok = (string)$tok; if (!preg_match('/^[0-9a-f]{64}$/', $tok)) return null;
  $t = row('SELECT * FROM app_tokens WHERE hash=?', [hash('sha256', $tok)]); if (!$t) return null;
  $u = row('SELECT * FROM users WHERE id=? AND active=1', [(int)$t['user_id']]);
  if (!$u || (int)$u['sess_ver'] !== (int)$t['sv'] || (int)$t['used'] < time() - APP_TOKEN_DAYS * 86400) { q('DELETE FROM app_tokens WHERE id=?', [$t['id']]); return null; }
  if (time() - (int)$t['used'] > 3600) q('UPDATE app_tokens SET used=? WHERE id=?', [time(), $t['id']]);
  return $u;
}
function app_token_drop($tok) { $tok = (string)$tok; if (preg_match('/^[0-9a-f]{64}$/', $tok)) q('DELETE FROM app_tokens WHERE hash=?', [hash('sha256', $tok)]); }

/* api.php, before the sign-in check: the app's background check carries the token in a header instead of a session cookie.
   The request is answered as that user and nothing is kept in a session afterwards. Only for the `app` module. */
function app_header_auth($m) {
  if ($m !== 'app' || !empty($_SESSION['uid'])) return;
  $u = app_token_user($_SERVER['HTTP_X_APP_TOKEN'] ?? '');
  if (!$u) fail('Unauthorized', 401);
  $_SESSION['uid'] = (int)$u['id']; $_SESSION['role'] = $u['role']; $_SESSION['username'] = $u['username']; $_SESSION['name'] = $u['name']; $_SESSION['sv'] = (int)$u['sess_ver']; $_SESSION['seen'] = time();
  $keep = $_SESSION; session_abort(); $_SESSION = $keep; /* this request only: no session is stored for it */
}

function handle_app($a) {
  if ($a === 'poll') {
    /* GET app/poll&lead=<last lead id seen>&notif=<last alert id seen>: what arrived since. The first call (no ids yet) sends -1
       and only gets the newest ids back, so a fresh install does not ring for old leads. */
    need('leads');
    $ld = (int)($_GET['lead'] ?? -1); $nf = (int)($_GET['notif'] ?? -1); $sc = lead_scope('l');
    $maxL = (int)(row("SELECT COALESCE(MAX(l.id),0) m FROM leads l WHERE $sc")['m'] ?? 0);
    $maxN = (int)(row('SELECT COALESCE(MAX(id),0) m FROM notifs WHERE user_id=?', [uid()])['m'] ?? 0);
    $leads = []; $alerts = [];
    if ($ld >= 0) $leads = array_map(fn($x) => ['id' => (int)$x['id'], 'name' => (string)$x['name'], 'phone' => (string)($x['phone'] ?? ''), 'city' => (string)($x['city'] ?? ''), 'source' => (string)($x['source'] ?? '')],
      array_map('lead_mask', rows("SELECT l.* FROM leads l WHERE l.notify=1 AND l.id>? AND $sc ORDER BY l.id DESC LIMIT 20", [$ld])));
    /* lead alerts (call back, assigned) and every team-discussion alert (tagged, reply, ended) - on a lead or a customer */
    if ($nf >= 0) $alerts = array_map(fn($x) => ['id' => (int)$x['id'], 'kind' => (string)$x['kind'], 'title' => APP_ALERT_TITLES[$x['kind']] ?? 'Jasper', 'text' => (string)$x['text'], 'lead_id' => (int)$x['lead_id'], 'customer_id' => (int)$x['customer_id']],
      rows("SELECT id,kind,text,lead_id,customer_id FROM notifs WHERE user_id=? AND id>? AND ((lead_id IS NOT NULL AND kind IN ('callback','assign')) OR kind IN ('mention','reply','end','remind')) ORDER BY id DESC LIMIT 20", [uid(), $nf]));
    out(['lead' => $maxL, 'notif' => $maxN, 'leads' => $leads, 'alerts' => $alerts,
      'waiting' => (int)row("SELECT COUNT(*) c FROM leads l WHERE l.notify=1 AND $sc")['c'], 'name' => (string)($_SESSION['name'] ?? '')]);
  }
  fail('Unknown action', 404);
}
