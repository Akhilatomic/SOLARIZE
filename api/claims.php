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

// ---- owners: reassigning a lead or a customer ----
// Who may hand a record to someone else: its current owner, the admin and the assistant manager.
function can_reassign($owner_id) { return is_admin() || ($_SESSION['role'] ?? '') === 'assistant_manager' || ((int)$owner_id > 0 && (int)$owner_id === uid()); }
// Who can receive it: an active user whose access lets them work that list (for leads also anyone with "Can see & claim leads").
function user_can_work($u, $mod) {
  if (($u['role'] ?? '') === 'admin') return true;
  $r = roles()[$u['role'] ?? ''] ?? null; if (!$r) return false;
  return $r[1] === '*' || in_array($mod, (array)$r[1]) || (in_array($mod, CLAIM_GRANTS) && (int)($u['can_claim'] ?? 0) === 1);
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
function cust_guard($a, $in) {
  switch ($a) {
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

// Runs before the generic CRUD for leads. Handles list/get/claim/unlock/assign; checks ownership for writes.
function lead_guard($a, $in) {
  switch ($a) {
    case 'list':
      need('leads');
      out(array_map(fn($x) => strip_fin(lead_mask($x)), rows('SELECT l.*, u.name owner_name, u.avatar owner_av FROM leads l LEFT JOIN users u ON u.id=l.assigned_to WHERE ' . lead_scope() . ' ORDER BY l.updated DESC, l.id DESC')));
    case 'get':
      need('leads');
      $l = lead_or_404($_GET['id'] ?? 0);
      if ((int)$l['notify'] && lead_can_write($l)) { q('UPDATE leads SET notify=0 WHERE id=?', [$l['id']]); $l['notify'] = 0; audit('ack', 'leads', $l['id'], 'viewed'); } // opened by its owner / admin → off the dashboard's "new leads"
      $r = strip_fin(lead_mask(detail('leads', $l))); $r['owner_name'] = owner_name($l['assigned_to']);
      if (!empty($r['masked'])) $r['messages'] = [];
      out($r);
    case 'claim':
      need('leads');
      if (!can_claim()) fail('Lead claiming is not enabled for your account. Ask the admin.', 403);
      $id = (int)($in['id'] ?? 0);
      $n = q("UPDATE leads SET assigned_to=?, claimed_at=?, updated=CURRENT_TIMESTAMP WHERE id=? AND (assigned_to IS NULL OR assigned_to=0)", [uid(), gmdate('Y-m-d H:i:s'), $id])->rowCount();
      if (!$n) { $l = row('SELECT assigned_to FROM leads WHERE id=?', [$id]); if (!$l) fail('Not found', 404); fail('Already claimed by ' . owner_name($l['assigned_to']), 409); }
      audit('claim', 'leads', $id, $_SESSION['name'] ?? ''); out(['ok' => true]);
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
      audit('callback', 'leads', $l['id'], $at === '' ? (!empty($in['done']) ? 'call back done' : 'call back removed') : 'call back ' . $at . ($note !== '' ? ' — ' . $note : ''));
      out(['ok' => true, 'callback_at' => $at, 'callback_note' => $note]);
    case 'save':
      if (!empty($in['id'])) lead_need_write(lead_or_404($in['id']));
      return; // generic save continues (assigned_to / claimed_at are protected there)
    case 'delete': case 'convert':
      lead_need_write(lead_or_404($in['id'] ?? 0));
      return;
  }
}
