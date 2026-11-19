<?php
// Lead claiming: only users the admin enables can see & claim unclaimed leads.
// A claimed lead is locked to its owner (others can't see, edit or contact it). The owner or the admin can unclaim it;
// the owner, the admin or the assistant manager can reassign it (customers too — see cust_guard).

function is_admin() { return ($_SESSION['role'] ?? '') === 'admin'; }
function uid() { return (int)($_SESSION['uid'] ?? 0); }
function can_claim() {
  static $c = null;
  if ($c === null) $c = is_admin() || (int)(row('SELECT can_claim FROM users WHERE id=?', [uid()])['can_claim'] ?? 0) === 1;
  return $c;
}
function lead_can_read($l) { return is_admin() || (int)$l['assigned_to'] === uid() || (empty($l['assigned_to']) && can_claim()); }
function lead_can_write($l) { return is_admin() || (int)$l['assigned_to'] === uid(); }
function lead_scope($alias = 'l') {
  if (is_admin()) return '1=1';
  return "($alias.assigned_to=" . uid() . (can_claim() ? " OR $alias.assigned_to IS NULL" : '') . ')';
}
// Unclaimed leads show a masked phone/email to non-admins until claimed, so contacts can't be copied without claiming.
function lead_mask($l) {
  $l['can_edit'] = lead_can_write($l) ? 1 : 0;
  if ($l['can_edit']) return $l;
  $d = preg_replace('/\D/', '', (string)($l['phone'] ?? ''));
  if ($d !== '') $l['phone'] = substr($d, 0, 3) . str_repeat('•', max(0, strlen($d) - 5)) . substr($d, -2);
  if (!empty($l['email'])) $l['email'] = substr($l['email'], 0, 1) . '•••@' . (explode('@', $l['email'])[1] ?? '');
  $l['masked'] = 1;
  return $l;
}
function owner_name($id) { return $id ? (row('SELECT name FROM users WHERE id=?', [(int)$id])['name'] ?? 'another user') : ''; }
function lead_need_write($l) {
  if (lead_can_write($l)) return;
  if (empty($l['assigned_to'])) fail('Claim this lead first', 403);
  fail('This lead is locked to ' . owner_name($l['assigned_to']) . '. Only the admin can unlock it.', 403);
}
function lead_or_404($id) {
  $l = row('SELECT * FROM leads WHERE id=?', [(int)$id]);
  if (!$l || !lead_can_read($l)) fail('Not found', 404);
  return $l;
}

// ---- Business Associate (BA): sees only the customers they own and those customers' projects; never money ----
function is_ba() { return ($_SESSION['role'] ?? '') === 'ba'; }
function cust_scope($alias = 'c') { return is_ba() ? "$alias.owner_id=" . uid() : '1=1'; }
function ba_owns_customer($cid) { return (int)(row('SELECT owner_id FROM customers WHERE id=?', [(int)$cid])['owner_id'] ?? 0) === uid(); }
function ba_owns_project($pid) { $p = row('SELECT c.owner_id FROM projects p JOIN customers c ON c.id=p.customer_id WHERE p.id=?', [(int)$pid]); return $p && (int)$p['owner_id'] === uid(); }
/* Runs before every request a BA makes: whatever customer, project, lead, file or discussion it names must be theirs.
   Lists are narrowed where they are built (cust_scope). Someone else's record answers "Not found", as if it did not exist. */
function ba_gate($m, $a) {
  if (!is_ba()) return;
  $in = body(); $nf = fn() => fail('Not found', 404);
  if ($m === 'customers' && in_array($a, ['delete', 'revert'], true)) fail('Not allowed for your role', 403); // would remove projects and payments
  $cid = []; $pid = []; $lid = [];
  foreach ([$_GET, $in] as $src) {
    if ($m !== 'leads' && (int)($src['customer_id'] ?? 0)) $cid[] = (int)$src['customer_id'];
    if ((int)($src['project_id'] ?? 0)) $pid[] = (int)$src['project_id'];
    if ($m !== 'leads' && (int)($src['lead_id'] ?? 0)) $lid[] = (int)$src['lead_id'];
    $id = (int)($src['id'] ?? 0); if (!$id) continue;
    if ($m === 'customers') $cid[] = $id;
    elseif ($m === 'projects' || ($m === 'pipeline' && $a === 'services')) $pid[] = $id;
    elseif ($m === 'files') { $f = row('SELECT customer_id, project_id FROM files WHERE id=?', [$id]); if (!$f) $nf(); if ($f['customer_id']) $cid[] = (int)$f['customer_id']; elseif ($f['project_id']) $pid[] = (int)$f['project_id']; else $nf(); }
    elseif ($m === 'disc' && $a === 'end') { $d = row('SELECT customer_id, lead_id FROM discussions WHERE id=?', [$id]); if (!$d) $nf(); if ($d['customer_id']) $cid[] = (int)$d['customer_id']; if ($d['lead_id']) $lid[] = (int)$d['lead_id']; }
  }
  if ($m === 'notes' && (int)($in['entity_id'] ?? 0)) { if (($in['entity'] ?? '') === 'customers') $cid[] = (int)$in['entity_id']; if (($in['entity'] ?? '') === 'projects') $pid[] = (int)$in['entity_id']; }
  foreach (array_unique($cid) as $x) if (!ba_owns_customer($x)) $nf();
  foreach (array_unique($pid) as $x) if (!ba_owns_project($x)) $nf();
  foreach (array_unique($lid) as $x) lead_or_404($x);
}

// ---- owners: reassigning a lead or a customer ----
// Who may hand a record to someone else: its current owner, the admin and the assistant manager.
function can_reassign($owner_id) { return is_admin() || ($_SESSION['role'] ?? '') === 'assistant_manager' || ((int)$owner_id > 0 && (int)$owner_id === uid()); }
// Who can receive it: an active user whose access lets them work that list (for leads also anyone with "Can see & claim leads").
function user_can_work($u, $mod) {
  if (($u['role'] ?? '') === 'admin') return true;
  $r = roles()[$u['role'] ?? ''] ?? null; if (!$r) return false;
  return $r[1] === '*' || in_array($mod, (array)$r[1]) || (in_array($mod, claim_grants($u['role'] ?? '')) && (int)($u['can_claim'] ?? 0) === 1);
}
function owner_candidates($mod) {
  $ok = array_filter(rows('SELECT id,name,role,can_claim,avatar FROM users WHERE active=1 ORDER BY name'), fn($u) => user_can_work($u, $mod));
  return array_values(array_map(fn($u) => ['id' => (int)$u['id'], 'name' => $u['name'], 'role' => $u['role'], 'role_name' => ROLE_NAMES[$u['role']] ?? $u['role'], 'avatar' => (string)$u['avatar']], $ok));
}
function owner_target($in, $mod) {
  $u = row('SELECT id,name,role,can_claim FROM users WHERE id=? AND active=1', [(int)($in['user_id'] ?? 0)]);
  if (!$u) fail('Choose an active user');
  if (!user_can_work($u, $mod)) fail($u['name'] . ' has no access to work on ' . $mod . '. Change their access in Settings first.');
  return $u;
}
// bell + desktop notification for the new owner (not when you hand it to yourself)
function owner_notify($to, $col, $id, $text) {
  if ((int)$to && (int)$to !== uid()) q("INSERT INTO notifs(user_id,kind,$col,from_id,text) VALUES(?,'assign',?,?,?)", [(int)$to, (int)$id, uid(), mb_substr($text, 0, 200)]);
}
// Runs before the generic CRUD for customers: owner list and reassign. Owning a customer does not hide it from anyone.
/* The same phone number already in the CRM (asked by the lead and customer forms while a number is typed in by hand, so the
   same contact is not entered twice or worked by two people). POST leads/same or customers/same {phone, skip_lead, skip_customer}.
   Numbers are compared by their last 10 digits, whatever spaces, dashes or +91 they were typed with. The answer names the record
   and who has it - nothing more; a Business Associate (an outside partner) is only told that the number is already with the
   company. `open` = this person may open that record. A warning only: saving is never refused. */
function phone_same($in) {
  $d = preg_replace('/\D/', '', (string)($in['phone'] ?? '')); if (strlen($d) < 10) out(['rows' => []]);
  $d = substr($d, -10); $like = '%' . $d;
  $clean = fn($col) => "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE($col,''),' ',''),'-',''),'+',''),'(',''),')','')";
  $out = [];
  foreach (rows('SELECT c.id, c.name, c.owner_id, u.name owner FROM customers c LEFT JOIN users u ON u.id=c.owner_id WHERE c.id<>? AND (' . $clean('c.phone') . ' LIKE ? OR ' . $clean('c.alt_phone') . ' LIKE ?) ORDER BY c.id DESC LIMIT 5', [(int)($in['skip_customer'] ?? 0), $like, $like]) as $c)
    $out[] = ['type' => 'customer', 'id' => (int)$c['id'], 'name' => $c['name'], 'owner' => (string)($c['owner'] ?? ''), 'open' => can('customers') && (!is_ba() || (int)$c['owner_id'] === uid()) ? 1 : 0];
  foreach (rows('SELECT l.id, l.name, l.status, l.assigned_to, u.name owner FROM leads l LEFT JOIN users u ON u.id=l.assigned_to WHERE l.id<>? AND COALESCE(l.customer_id,0)=0 AND ' . $clean('l.phone') . ' LIKE ? ORDER BY l.id DESC LIMIT 5', [(int)($in['skip_lead'] ?? 0), $like]) as $l)
    $out[] = ['type' => 'lead', 'id' => (int)$l['id'], 'name' => $l['name'], 'status' => (string)$l['status'], 'owner' => (string)($l['owner'] ?? ''), 'open' => can('leads') && lead_can_read($l) ? 1 : 0];
  if (is_ba()) $out = array_map(fn($r) => $r['open'] ? $r : ['type' => $r['type'], 'id' => 0, 'name' => '', 'owner' => '', 'open' => 0], $out);
  out(['rows' => $out]);
}
function cust_guard($a, $in) {
  switch ($a) {
    case 'same': phone_same($in);
    case 'owners':
      out(owner_candidates('customers'));
    case 'reassign':
      need('customers', true);
      $c = row('SELECT id,name,owner_id FROM customers WHERE id=?', [(int)($in['id'] ?? 0)]); if (!$c) fail('Customer not found', 404);
      if (!can_reassign($c['owner_id'])) fail('Only the customer owner, an admin or the assistant manager can reassign this customer', 403);
      $u = owner_target($in, 'customers');
      if ((int)$c['owner_id'] === (int)$u['id']) out(['ok' => true, 'unchanged' => 1, 'owner_id' => (int)$u['id'], 'owner_name' => $u['name']]);
      q('UPDATE customers SET owner_id=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$u['id'], $c['id']]);
      audit('reassign', 'customers', $c['id'], (owner_name($c['owner_id']) ?: 'No owner') . ' → ' . $u['name']);
      owner_notify($u['id'], 'customer_id', $c['id'], ($_SESSION['name'] ?? 'Someone') . ' made you the owner of customer ' . $c['name']);
      out(['ok' => true, 'owner_id' => (int)$u['id'], 'owner_name' => $u['name']]);
  }
}

// Call-back reminders that came due → bell + desktop notification for whoever set it and the lead's owner.
// Runs on every bell poll: one indexed lookup, and it only writes when something is due.
function callback_alerts() {
  foreach (rows("SELECT id,name,phone,callback_note,callback_by,assigned_to FROM leads WHERE callback_sent=0 AND callback_at<>'' AND callback_at<=?", [date('Y-m-d H:i')]) as $l) {
    if (!q('UPDATE leads SET callback_sent=1 WHERE id=? AND callback_sent=0', [$l['id']])->rowCount()) continue; // another poll sent it already
    $text = 'Call back ' . $l['name'] . ($l['phone'] !== '' ? ' · ' . $l['phone'] : '') . ($l['callback_note'] !== '' ? ' — ' . $l['callback_note'] : '');
    foreach (array_unique(array_filter([(int)$l['callback_by'], (int)$l['assigned_to']])) as $u)
      q("INSERT INTO notifs(user_id,kind,lead_id,from_id,text) VALUES(?,'callback',?,NULL,?)", [$u, $l['id'], $text]);
  }
}

// Owner's rule (2026-11-12): a lead that arrived as new (Meta, notify=1) and that nobody attended — opened, called,
// marked contacted or edited, all of which clear notify — within LEAD_STALE_HOURS of arriving is marked Lost. It leaves
// the bell and the default (Active) Leads list but stays under the Lost filter and can be reopened by changing its status.
// Runs from the hourly housekeeping and the Meta cron; one indexed lookup (leads_notify) and it writes only when something is due.
const LEAD_STALE_HOURS = 24;
function lead_autolost() {
  $rs = rows("SELECT id FROM leads WHERE notify=1 AND status NOT IN ('Won','Lost') AND (customer_id IS NULL OR customer_id=0)
    AND created <= datetime('now', ?)", ['-' . rule('lead_lost_hours') . ' hours']);
  $n = 0;
  foreach ($rs as $l) {
    if (!q("UPDATE leads SET status='Lost', notify=0, updated=CURRENT_TIMESTAMP WHERE id=? AND notify=1", [$l['id']])->rowCount()) continue; // another run got it
    q("INSERT INTO notes(entity,entity_id,text,user) VALUES('leads',?,?,'System')", [$l['id'], 'Not attended within ' . rule('lead_lost_hours') . ' hours (automatic) — marked Lost']);
    $n++;
  }
  if ($n) audit('leads_autolost', 'leads', null, "$n new lead(s) not attended within " . rule('lead_lost_hours') . ' hours marked Lost');
  return $n;
}

// Owner's rule (2026-11-14): a claim lasts rule('claim_hours') hours (36). A lead that is still not a customer by then
// is unlocked, so anyone who can claim may take it. The clock starts when the lead is claimed or handed to someone
// (claimed_at); claims made before this rule went live count from the moment it went live, so nothing unlocks at once.
// A lead typed in by hand is not on the clock (lead_by_hand below): only Meta and WhatsApp leads are.
// Grace period (owner's rule, 2026-11-14): whoever holds the lead can add CLAIM_GRACE_HOURS to a running claim, up to
// CLAIM_GRACE_MAX times per claim. leads.claim_ext counts them for the claim that began at leads.claim_ext_for (that claim's
// claimed_at) — a new claim, a reassignment or an unlock changes claimed_at, so the count starts again without touching it.
const CLAIM_GRACE_HOURS = 12;
const CLAIM_GRACE_MAX = 3;
function claim_ext_used($l) { return (string)($l['claim_ext_for'] ?? '') === (string)($l['claimed_at'] ?? '') ? max(0, min(CLAIM_GRACE_MAX, (int)($l['claim_ext'] ?? 0))) : 0; }
function claim_from() {
  static $f = null;
  if ($f === null) { $r = row("SELECT v FROM settings WHERE k='claim_unlock_from'"); $f = $r ? (int)json_decode((string)$r['v'], true) : 0; if ($f < 1) { $f = time(); kv_set('claim_unlock_from', $f); } }
  return $f;
}
/* Owner's rule (2026-11-16): a lead with an appointment or a call back set stays locked to its holder until that date
   + CLAIM_HOLD_HOURS, however old the claim is. The appointment has no time of day, so it counts to the end of that day;
   the call back counts from its date and time. Whichever is later wins, and the claim clock still applies when it ends later.
   A call back marked done keeps its 24 hours (leads.claim_hold, for the claim that began at claim_hold_for), so finishing
   the call does not unlock the lead at once. Returns [unix seconds or 0, 'appt' | 'cb' | '']. */
const CLAIM_HOLD_HOURS = 24;
function claim_hold($l) {
  $tz = new DateTimeZone('Asia/Kolkata'); $at = 0; $why = '';
  $a = DateTime::createFromFormat('!Y-m-d', (string)($l['appt'] ?? ''), $tz);
  if ($a) { $at = $a->getTimestamp() + 86400 + CLAIM_HOLD_HOURS * 3600; $why = 'appt'; }
  $c = DateTime::createFromFormat('!Y-m-d H:i', (string)($l['callback_at'] ?? ''), $tz);
  if ($c && $c->getTimestamp() + CLAIM_HOLD_HOURS * 3600 > $at) { $at = $c->getTimestamp() + CLAIM_HOLD_HOURS * 3600; $why = 'cb'; }
  $k = (string)($l['claimed_at'] ?? '') !== '' && (string)($l['claim_hold_for'] ?? '') === (string)$l['claimed_at'] ? (int)($l['claim_hold'] ?? 0) : 0;
  if ($k > $at) { $at = $k; $why = 'cb'; }
  return [$at, $why];
}
/* when this lead's claim ends (unix seconds); 0 = no clock. Needs assigned_to, customer_id, claimed_at, added_by, owner_name,
   and appt, callback_at, claim_hold, claim_hold_for for the appointment / call-back hold. */
function claim_unlock_at($l) { $b = claim_base_at($l); return $b ? max($b, claim_hold($l)[0]) : 0; }
/* 'appt' or 'cb' when the appointment / call back is what keeps the lead locked now, else '' */
function claim_held_by($l) { $b = claim_base_at($l); [$h, $why] = claim_hold($l); return $b && $h > $b ? $why : ''; }
/* what the lead save and the call-back save hand back, so the time chip is right without reading the list again */
function claim_state($id) {
  $l = row('SELECT l.*, u.name owner_name FROM leads l LEFT JOIN users u ON u.id=l.assigned_to WHERE l.id=?', [(int)$id]);
  return $l ? ['unlock_at' => claim_unlock_at($l), 'hold' => claim_held_by($l)] : [];
}
/* Owner's rule (2026-11-16): a lead somebody typed in by hand never unlocks - it stays with its holder until it becomes a customer,
   is unclaimed or is reassigned, whoever typed it (the admin for a salesperson, or the holder). Only leads that came into the shared
   pool by themselves run the claim clock: Meta lead forms (meta_id) and WhatsApp chats. leads.added_by is not editable. */
const LEAD_POOL_BY = ['', 'meta', 'meta ads', 'whatsapp'];
function lead_by_hand($l) { return (string)($l['meta_id'] ?? '') === '' && !in_array(mb_strtolower(trim((string)($l['added_by'] ?? ''))), LEAD_POOL_BY, true); }
/* Once, when that rule came in (migrate, flag claim_hand_restored): typed-in leads the clock had already unlocked go back to whoever
   held them (the user the unlock notice went to), unless someone has claimed them since or that user is no longer active. */
function claim_hand_restore($db) {
  $n = 0;
  foreach ($db->query("SELECT id,name,added_by,meta_id FROM leads WHERE (assigned_to IS NULL OR assigned_to=0) AND (customer_id IS NULL OR customer_id=0)")->fetchAll() as $l) {
    if (!lead_by_hand($l)) continue;
    $s = $db->prepare("SELECT n.user_id, u.name FROM notifs n JOIN users u ON u.id=n.user_id AND u.active=1 AND COALESCE(u.deleted,0)=0
      WHERE n.lead_id=? AND n.kind='assign' AND n.from_id IS NULL AND n.text LIKE 'Your claim on %' ORDER BY n.id DESC LIMIT 1"); $s->execute([$l['id']]); $u = $s->fetch();
    if (!$u) continue;
    $s = $db->prepare("UPDATE leads SET assigned_to=?, claimed_at=? WHERE id=? AND (assigned_to IS NULL OR assigned_to=0)"); $s->execute([(int)$u['user_id'], gmdate('Y-m-d H:i:s'), $l['id']]);
    if (!$s->rowCount()) continue;
    $db->prepare("INSERT INTO notes(entity,entity_id,text,user) VALUES('leads',?,?,'System')")->execute([$l['id'], 'Given back to ' . $u['name'] . ': a lead added by hand no longer unlocks (automatic)']);
    $db->prepare("INSERT INTO notifs(user_id,kind,lead_id,from_id,text) VALUES(?,'assign',?,NULL,?)")->execute([(int)$u['user_id'], $l['id'], mb_substr($l['name'] . ' is back with you — leads added by hand no longer unlock', 0, 200)]);
    $n++;
  }
  if ($n) $db->prepare("INSERT INTO audit_log(user,action,entity,entity_id,detail) VALUES('System','leads_given_back','leads',NULL,?)")->execute(["$n typed-in lead(s) the claim clock had unlocked given back to their holders"]);
  return $n;
}
function claim_base_at($l) {
  if (empty($l['assigned_to']) || !empty($l['customer_id'])) return 0;
  if (lead_by_hand($l)) return 0;
  $t = ($l['claimed_at'] ?? '') !== '' ? (int)strtotime($l['claimed_at'] . ' UTC') : 0;
  return max($t, claim_from()) + rule('claim_hours') * 3600 + claim_ext_used($l) * CLAIM_GRACE_HOURS * 3600;
}
/* Runs when the Leads list is read and from the hourly housekeeping: one indexed lookup, writes only when a claim has run out. */
function claim_release() {
  $now = time(); $h = rule('claim_hours'); $n = 0;
  $rs = rows("SELECT l.id,l.name,l.assigned_to,l.customer_id,l.claimed_at,l.added_by,l.meta_id,l.claim_ext,l.claim_ext_for,l.appt,l.callback_at,l.claim_hold,l.claim_hold_for,u.name owner_name FROM leads l LEFT JOIN users u ON u.id=l.assigned_to
    WHERE l.assigned_to>0 AND (l.customer_id IS NULL OR l.customer_id=0) AND COALESCE(l.claimed_at,'')<=?", [gmdate('Y-m-d H:i:s', $now - $h * 3600)]);
  foreach ($rs as $l) {
    $at = claim_unlock_at($l); if (!$at || $at > $now) continue;
    if (!q("UPDATE leads SET assigned_to=NULL, claimed_at='', updated=CURRENT_TIMESTAMP WHERE id=? AND assigned_to=?", [$l['id'], $l['assigned_to']])->rowCount()) continue; /* another request got it */
    $who = (string)($l['owner_name'] ?? '') !== '' ? $l['owner_name'] : 'its holder';
    $held = claim_held_by($l); $what = $held === 'appt' ? 'the appointment' : 'the call back'; $hh = CLAIM_HOLD_HOURS;
    q("INSERT INTO notes(entity,entity_id,text,user) VALUES('leads',?,?,'System')", [$l['id'], $held ? "Not converted to a customer within $hh hours after $what (claimed by $who) (automatic) — unlocked for everyone" : "Not converted to a customer within $h hours of being claimed by $who (automatic) — unlocked for everyone"]);
    q("INSERT INTO notifs(user_id,kind,lead_id,from_id,text) VALUES(?,'assign',?,NULL,?)", [(int)$l['assigned_to'], $l['id'], mb_substr($held ? "Your claim on {$l['name']} ended $hh hours after $what — the lead is open to everyone again" : "Your claim on {$l['name']} ended after $h hours — the lead is open to everyone again", 0, 200)]);
    $n++;
  }
  if ($n) audit('leads_unlocked', 'leads', null, "$n claimed lead(s) not converted within $h hours unlocked");
  return $n;
}

// Runs before the generic CRUD for leads. Handles list/get/claim/unlock/assign; checks ownership for writes.
/* Remark history: one row each time a lead's remark really changes (an emptied remark is kept as an empty entry). */
function lead_remark_log($lid, $old, $new) {
  if (trim((string)$old) === trim((string)$new)) return;
  q('INSERT INTO lead_remarks(lead_id,text,user_id,user) VALUES(?,?,?,?)', [(int)$lid, trim((string)$new), uid(), $_SESSION['name'] ?? '']);
}
function lead_guard($a, $in) {
  switch ($a) {
    case 'same': phone_same($in);
    case 'remarks': /* GET leads/remarks&id= : newest first; only for a lead this person may see */
      need('leads'); $lid = (int)($_GET['id'] ?? 0);
      if (!row('SELECT l.id FROM leads l WHERE l.id=? AND ' . lead_scope(), [$lid])) fail('Not found', 404);
      out(['rows' => rows('SELECT r.id, r.text, r.old, r.created, COALESCE(u.name, r.user) user FROM lead_remarks r LEFT JOIN users u ON u.id=r.user_id WHERE r.lead_id=? ORDER BY r.id DESC', [$lid])]);
    case 'list':
      need('leads');
      try { claim_release(); } catch (Throwable $e) { } /* claims that ran out are open again before the list is read */
      out(array_map(fn($x) => strip_fin(lead_mask($x + ['unlock_at' => claim_unlock_at($x), 'hold' => claim_held_by($x), 'grace_used' => claim_ext_used($x), 'grace_max' => CLAIM_GRACE_MAX])), rows('SELECT l.*, u.name owner_name, u.avatar owner_av FROM leads l LEFT JOIN users u ON u.id=l.assigned_to WHERE ' . lead_scope() . ' ORDER BY l.updated DESC, l.id DESC')));
    case 'get':
      need('leads');
      $l = lead_or_404($_GET['id'] ?? 0);
      if ((int)$l['notify'] && lead_can_write($l)) { q('UPDATE leads SET notify=0 WHERE id=?', [$l['id']]); $l['notify'] = 0; audit('ack', 'leads', $l['id'], 'viewed'); } // opened by its owner / admin → off the dashboard's "new leads"
      $r = strip_fin(lead_mask(detail('leads', $l))); $r['owner_name'] = owner_name($l['assigned_to']);
      $r['unlock_at'] = claim_unlock_at(['owner_name' => $r['owner_name']] + $l); $r['hold'] = claim_held_by(['owner_name' => $r['owner_name']] + $l); $r['grace_used'] = claim_ext_used($l); $r['grace_max'] = CLAIM_GRACE_MAX;
      if (!empty($r['masked'])) $r['messages'] = [];
      out($r);
    case 'claim':
      need('leads');
      if (!can_claim()) fail('Lead claiming is not enabled for your account. Ask the admin.', 403);
      $id = (int)($in['id'] ?? 0);
      $n = q("UPDATE leads SET assigned_to=?, claimed_at=?, updated=CURRENT_TIMESTAMP WHERE id=? AND (assigned_to IS NULL OR assigned_to=0)", [uid(), gmdate('Y-m-d H:i:s'), $id])->rowCount();
      if (!$n) { $l = row('SELECT assigned_to FROM leads WHERE id=?', [$id]); if (!$l) fail('Not found', 404); fail('Already claimed by ' . owner_name($l['assigned_to']), 409); }
      audit('claim', 'leads', $id, $_SESSION['name'] ?? '');
      $l = row('SELECT assigned_to,customer_id,claimed_at,added_by,meta_id,appt,callback_at,claim_hold,claim_hold_for FROM leads WHERE id=?', [$id]) + ['owner_name' => $_SESSION['name'] ?? ''];
      out(['ok' => true, 'unlock_at' => claim_unlock_at($l), 'hold' => claim_held_by($l), 'hours' => rule('claim_hours')]);
    case 'extend': // grace period: whoever holds the lead adds CLAIM_GRACE_HOURS to its running claim (CLAIM_GRACE_MAX times per claim)
      need('leads');
      $l = lead_or_404($in['id'] ?? 0);
      if (!is_admin() && (int)$l['assigned_to'] !== uid()) fail('Only the person holding this lead can add time', 403);
      $l['owner_name'] = owner_name($l['assigned_to']);
      if (!claim_unlock_at($l)) fail('This lead has no claim clock running');
      $used = claim_ext_used($l);
      if ($used >= CLAIM_GRACE_MAX) fail('All ' . CLAIM_GRACE_MAX . ' grace periods are used for this claim', 409);
      q('UPDATE leads SET claim_ext=?, claim_ext_for=? WHERE id=?', [$used + 1, (string)$l['claimed_at'], $l['id']]); /* not "updated": the lead keeps its place in the list */
      $l['claim_ext'] = $used + 1; $l['claim_ext_for'] = (string)$l['claimed_at'];
      q("INSERT INTO notes(entity,entity_id,text,user) VALUES('leads',?,?,?)", [$l['id'], 'Grace period ' . ($used + 1) . ' of ' . CLAIM_GRACE_MAX . ' activated: ' . CLAIM_GRACE_HOURS . ' more hours on the claim', $_SESSION['name'] ?? '']);
      audit('claim_grace', 'leads', $l['id'], ($used + 1) . ' of ' . CLAIM_GRACE_MAX . ' · +' . CLAIM_GRACE_HOURS . ' h');
      out(['ok' => true, 'unlock_at' => claim_unlock_at($l), 'hold' => claim_held_by($l), 'used' => $used + 1, 'left' => CLAIM_GRACE_MAX - $used - 1, 'max' => CLAIM_GRACE_MAX, 'hours' => CLAIM_GRACE_HOURS]);
    case 'unlock': case 'unclaim':
      // the owner can release their own lead; the admin can release any lead
      $l = lead_or_404($in['id'] ?? 0); $id = (int)$l['id'];
      if (empty($l['assigned_to'])) out(['ok' => true]);
      if (!is_admin() && (int)$l['assigned_to'] !== uid()) fail('Only the owner or the admin can unclaim this lead', 403);
      $prev = owner_name($l['assigned_to']);
      q("UPDATE leads SET assigned_to=NULL, claimed_at='', updated=CURRENT_TIMESTAMP WHERE id=?", [$id]);
      audit('unclaim', 'leads', $id, 'released by ' . ($_SESSION['name'] ?? '') . ' (was ' . $prev . ')'); out(['ok' => true]);
    case 'owners': // who this user may hand a lead to
      need('leads'); out(owner_candidates('leads'));
    case 'assign': // reassign: the lead's owner, the admin or the assistant manager hands it to another user (it stays locked, now to them)
      need('leads', true);
      $l = lead_or_404($in['id'] ?? 0);
      if (!can_reassign($l['assigned_to'])) fail('Only the lead owner, an admin or the assistant manager can reassign this lead', 403);
      $u = owner_target($in, 'leads');
      if ((int)$l['assigned_to'] === (int)$u['id']) out(['ok' => true, 'unchanged' => 1, 'owner_id' => (int)$u['id'], 'owner_name' => $u['name']]);
      q('UPDATE leads SET assigned_to=?, claimed_at=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$u['id'], gmdate('Y-m-d H:i:s'), $l['id']]);
      audit('assign', 'leads', $l['id'], ($l['assigned_to'] ? owner_name($l['assigned_to']) . ' ' : '') . '→ ' . $u['name']);
      owner_notify($u['id'], 'lead_id', $l['id'], ($_SESSION['name'] ?? 'Someone') . ' assigned you the lead ' . $l['name']);
      out(['ok' => true, 'owner_id' => (int)$u['id'], 'owner_name' => $u['name']]);
    case 'callback': // set, move or clear the call-back reminder: {id, at:'Y-m-d H:i' or '', note, done}
      need('leads', true);
      $l = lead_or_404($in['id'] ?? 0); lead_need_write($l);
      $at = trim((string)($in['at'] ?? ''));
      if ($at !== '') { $d = DateTime::createFromFormat('!Y-m-d H:i', $at); if (!$d || $d->format('Y-m-d H:i') !== $at) fail('Pick a valid date and time'); }
      $note = $at === '' ? '' : mb_substr(trim((string)($in['note'] ?? '')), 0, 300);
      q('UPDATE leads SET callback_at=?, callback_note=?, callback_by=?, callback_sent=0, updated=CURRENT_TIMESTAMP WHERE id=?', [$at, $note, $at === '' ? null : uid(), $l['id']]);
      /* call back done: its 24 hours of lock stay (from the call-back time, or from now when it was done early) */
      $was = DateTime::createFromFormat('!Y-m-d H:i', (string)$l['callback_at'], new DateTimeZone('Asia/Kolkata'));
      if ($at === '' && !empty($in['done']) && $was && !empty($l['assigned_to']) && (string)$l['claimed_at'] !== '')
        q('UPDATE leads SET claim_hold=?, claim_hold_for=? WHERE id=?', [min($was->getTimestamp(), time()) + CLAIM_HOLD_HOURS * 3600, (string)$l['claimed_at'], $l['id']]);
      audit('callback', 'leads', $l['id'], $at === '' ? (!empty($in['done']) ? 'call back done' : 'call back removed') : 'call back ' . $at . ($note !== '' ? ' — ' . $note : ''));
      out(['ok' => true, 'callback_at' => $at, 'callback_note' => $note] + claim_state($l['id']));
    case 'save':
      if (!empty($in['id'])) lead_need_write(lead_or_404($in['id']));
      return; // generic save continues (assigned_to / claimed_at are protected there)
    case 'delete': case 'convert':
      lead_need_write(lead_or_404($in['id'] ?? 0));
      return;
  }
}
