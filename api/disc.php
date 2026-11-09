<?php
// Team discussions on a customer or a lead: chat with @mentions, notifications and "end discussion".
// One open discussion per customer/lead at a time; ended discussions stay as history.
// Customers: anyone with 'customers' read. Leads: whoever can work the lead (owner / admin), plus anyone tagged in its discussions.
// A lead's discussions follow it when it is converted to a customer (and back when reverted).

function disc_role_can($role, $module) {
  $r = roles()[$role] ?? null; if (!$r) return false;
  return $r[0] === '*' || in_array($module, $r[0]);
}
function disc_users($kind) { // who can be tagged
  $mod = $kind === 'lead' ? 'leads' : 'customers';
  return array_values(array_map(fn($u) => ['id' => $u['id'], 'name' => $u['name'], 'role' => $u['role']], array_filter(rows('SELECT id,name,role,can_claim FROM users WHERE active=1 ORDER BY name'),
    fn($u) => disc_role_can($u['role'], $mod) || ($kind === 'lead' && (int)$u['can_claim'] === 1))));
}
function disc_notify($users, $kind, $disc, $t, $text) {
  $me = uid();
  foreach (array_unique(array_map('intval', $users)) as $u) if ($u && $u !== $me)
    q('INSERT INTO notifs(user_id,kind,discussion_id,customer_id,lead_id,from_id,text) VALUES(?,?,?,?,?,?,?)', [$u, $kind, $disc, $t['kind'] === 'customer' ? $t['id'] : null, $t['kind'] === 'lead' ? $t['id'] : null, $me, mb_substr($text, 0, 200)]);
}
function disc_participants($disc) { // who posted, who started it, and everyone tagged in it
  $ids = array_map('intval', array_column(rows('SELECT DISTINCT user_id FROM disc_msgs WHERE discussion_id=? AND user_id>0 UNION SELECT created_by FROM discussions WHERE id=?', [$disc, $disc]), 'user_id'));
  foreach (rows("SELECT mentions FROM disc_msgs WHERE discussion_id=? AND mentions<>'[]'", [$disc]) as $m) $ids = array_merge($ids, array_map('intval', json_decode($m['mentions'], true) ?: []));
  return array_values(array_unique($ids));
}
function disc_in_lead($lid) { // tagged or taking part in a discussion on this lead
  foreach (rows('SELECT id FROM discussions WHERE lead_id=?', [$lid]) as $d) if (in_array(uid(), disc_participants($d['id']))) return true;
  return false;
}
// resolve + authorise the subject of a request: ['kind','id','name','col']
function disc_target($src) {
  if (!empty($src['lead_id'])) {
    need('leads');
    $l = row('SELECT id,name,phone,assigned_to FROM leads WHERE id=?', [(int)$src['lead_id']]); if (!$l) fail('Lead not found', 404);
    if (!lead_can_write($l) && !disc_in_lead($l['id'])) fail('Claim this lead to discuss it', 403);
    return ['kind' => 'lead', 'id' => (int)$l['id'], 'name' => $l['name'], 'col' => 'lead_id'];
  }
  need('customers');
  $c = row('SELECT id,name FROM customers WHERE id=?', [(int)($src['customer_id'] ?? 0)]); if (!$c) fail('Customer not found', 404);
  return ['kind' => 'customer', 'id' => (int)$c['id'], 'name' => $c['name'], 'col' => 'customer_id'];
}

function handle_disc($a) {
  $in = body(); $uid = uid();
  switch ($a) {
    case 'summary': // open discussions for the customers and leads lists
      $sel = "SELECT d.customer_id, d.lead_id, d.id, d.topic, d.created_by, d.created, (SELECT name FROM users WHERE id=d.created_by) created_name, COUNT(m.id) msgs, MAX(m.created) last_at,
          SUM(CASE WHEN m.id > COALESCE((SELECT last_id FROM disc_reads r WHERE r.user_id=? AND r.discussion_id=d.id), 0) AND m.user_id<>? THEN 1 ELSE 0 END) unread";
      $cust = can('customers') ? rows("$sel, (SELECT name FROM customers WHERE id=d.customer_id) subject FROM discussions d LEFT JOIN disc_msgs m ON m.discussion_id=d.id WHERE d.status='Open' AND d.customer_id IS NOT NULL GROUP BY d.id", [$uid, $uid]) : [];
      $leads = [];
      if (can('leads')) foreach (rows("$sel, l.name subject, l.assigned_to FROM discussions d JOIN leads l ON l.id=d.lead_id LEFT JOIN disc_msgs m ON m.discussion_id=d.id WHERE d.status='Open' GROUP BY d.id", [$uid, $uid]) as $r)
        if (lead_can_write($r) || in_array($uid, disc_participants($r['id']))) { unset($r['assigned_to']); $leads[] = $r; }
      out(['customers' => $cust, 'leads' => $leads]);

    case 'thread':
      $t = disc_target($_GET);
      $ds = rows("SELECT d.*, a.name created_name, b.name closed_name FROM discussions d LEFT JOIN users a ON a.id=d.created_by LEFT JOIN users b ON b.id=d.closed_by WHERE d.{$t['col']}=? ORDER BY d.status='Open' DESC, d.id DESC LIMIT 20", [$t['id']]);
      foreach ($ds as &$d) {
        $d['msgs'] = rows('SELECT m.id,m.user_id,m.body,m.mentions,m.kind,m.created,u.name user_name FROM disc_msgs m LEFT JOIN users u ON u.id=m.user_id WHERE m.discussion_id=? ORDER BY m.id', [$d['id']]);
        foreach ($d['msgs'] as &$m) $m['mentions'] = json_decode($m['mentions'] ?: '[]', true) ?: [];
        unset($m);
        $last = $d['msgs'] ? end($d['msgs'])['id'] : 0;
        if ($last) q('INSERT INTO disc_reads(user_id,discussion_id,last_id) VALUES(?,?,?) ON CONFLICT(user_id,discussion_id) DO UPDATE SET last_id=excluded.last_id', [$uid, $d['id'], $last]);
        $d['can_end'] = $d['status'] === 'Open' && ((int)$d['created_by'] === $uid || is_admin() || can($t['kind'] === 'lead' ? 'leads' : 'customers', true)) ? 1 : 0;
      }
      unset($d);
      q("UPDATE notifs SET seen=1 WHERE user_id=? AND {$t['col']}=? AND seen=0", [$uid, $t['id']]);
      out(['subject' => ['kind' => $t['kind'], 'id' => $t['id'], 'name' => $t['name']], 'customer' => ['id' => $t['id'], 'name' => $t['name']], 'discussions' => $ds, 'users' => disc_users($t['kind']), 'me' => $uid]);

    case 'post':
      $t = disc_target($in);
      $text = trim((string)($in['body'] ?? '')); if ($text === '') fail('Write a message'); $text = mb_substr($text, 0, 2000);
      $ok = array_column(disc_users($t['kind']), 'name', 'id');
      $mentions = array_values(array_unique(array_filter(array_map('intval', (array)($in['mentions'] ?? [])), fn($x) => isset($ok[$x]))));
      $d = row("SELECT * FROM discussions WHERE {$t['col']}=? AND status='Open' ORDER BY id DESC LIMIT 1", [$t['id']]);
      if (!$d) { $topic = mb_substr(trim((string)($in['topic'] ?? '')), 0, 120);
        q("INSERT INTO discussions({$t['col']},topic,created_by) VALUES(?,?,?)", [$t['id'], $topic, $uid]); $d = row('SELECT * FROM discussions WHERE id=?', [(int)db()->lastInsertId()]);
        audit('disc_start', $t['kind'] === 'lead' ? 'leads' : 'customers', $t['id'], $topic); }
      q('INSERT INTO disc_msgs(discussion_id,user_id,body,mentions) VALUES(?,?,?,?)', [$d['id'], $uid, $text, json_encode($mentions)]);
      $mid = (int)db()->lastInsertId(); q('UPDATE discussions SET updated=CURRENT_TIMESTAMP WHERE id=?', [$d['id']]);
      q('INSERT INTO disc_reads(user_id,discussion_id,last_id) VALUES(?,?,?) ON CONFLICT(user_id,discussion_id) DO UPDATE SET last_id=excluded.last_id', [$uid, $d['id'], $mid]);
      $who = $_SESSION['name'] ?? 'Someone'; $what = ($t['kind'] === 'lead' ? 'lead ' : '') . $t['name'];
      disc_notify($mentions, 'mention', $d['id'], $t, "$who tagged you on $what: $text");
      disc_notify(array_diff(disc_participants($d['id']), $mentions), 'reply', $d['id'], $t, "$who on $what: $text");
      out(['ok' => true, 'id' => $mid, 'discussion_id' => (int)$d['id']]);

    case 'end':
      $d = row('SELECT * FROM discussions WHERE id=?', [(int)($in['id'] ?? 0)]); if (!$d) fail('Not found', 404);
      $t = disc_target(['customer_id' => $d['customer_id'], 'lead_id' => $d['lead_id']]);
      if ($d['status'] !== 'Open') fail('This discussion has already ended');
      if (!((int)$d['created_by'] === $uid || is_admin() || can($t['kind'] === 'lead' ? 'leads' : 'customers', true))) fail('Only the person who started it or an admin can end this discussion', 403);
      $note = mb_substr(trim((string)($in['note'] ?? '')), 0, 500);
      q("UPDATE discussions SET status='Closed', closed_by=?, closed_at=CURRENT_TIMESTAMP, outcome=?, updated=CURRENT_TIMESTAMP WHERE id=?", [$uid, $note, $d['id']]);
      q("INSERT INTO disc_msgs(discussion_id,user_id,body,kind) VALUES(?,?,?, 'end')", [$d['id'], $uid, $note]);
      $who = $_SESSION['name'] ?? 'Someone';
      disc_notify(disc_participants($d['id']), 'end', $d['id'], $t, "$who ended the discussion on " . ($t['kind'] === 'lead' ? 'lead ' : '') . $t['name'] . ($note ? ": $note" : ''));
      audit('disc_end', $t['kind'] === 'lead' ? 'leads' : 'customers', $t['id'], $note); out(['ok' => true]);

    case 'notifs': // my unseen notifications (bell)
      $r = rows('SELECT n.*, COALESCE(c.name, l.name) customer_name, u.name from_name FROM notifs n LEFT JOIN customers c ON c.id=n.customer_id LEFT JOIN leads l ON l.id=n.lead_id LEFT JOIN users u ON u.id=n.from_id WHERE n.user_id=? AND n.seen=0 ORDER BY n.id DESC LIMIT 30', [$uid]);
      out(['rows' => $r, 'count' => (int)row('SELECT COUNT(*) c FROM notifs WHERE user_id=? AND seen=0', [$uid])['c']]);

    case 'seen':
      if (!empty($in['all'])) q('UPDATE notifs SET seen=1 WHERE user_id=? AND seen=0', [$uid]);
      else q('UPDATE notifs SET seen=1 WHERE user_id=? AND id=?', [$uid, (int)($in['id'] ?? 0)]);
      out(['ok' => true]);
  }
  fail('Unknown action', 404);
}
