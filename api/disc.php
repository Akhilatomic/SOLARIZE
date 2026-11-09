<?php
// Customer discussions: team chat per customer with @mentions, notifications and "end discussion".
// One open discussion per customer at a time; ended discussions stay as history. Needs 'customers' read access.

function disc_role_can($role, $module) {
  $r = roles()[$role] ?? null; if (!$r) return false;
  return $r[0] === '*' || in_array($module, $r[0]);
}
function disc_users() { // people who can take part (active users with customer access)
  return array_values(array_filter(rows('SELECT id,name,role FROM users WHERE active=1 ORDER BY name'), fn($u) => disc_role_can($u['role'], 'customers')));
}
function disc_notify($users, $kind, $disc, $cust, $text) {
  $me = uid();
  foreach (array_unique(array_map('intval', $users)) as $u) if ($u && $u !== $me)
    q('INSERT INTO notifs(user_id,kind,discussion_id,customer_id,from_id,text) VALUES(?,?,?,?,?,?)', [$u, $kind, $disc, $cust, $me, mb_substr($text, 0, 200)]);
}
function disc_participants($disc) { // who posted, who started it, and everyone tagged in it
  $ids = array_map('intval', array_column(rows('SELECT DISTINCT user_id FROM disc_msgs WHERE discussion_id=? AND user_id>0 UNION SELECT created_by FROM discussions WHERE id=?', [$disc, $disc]), 'user_id'));
  foreach (rows("SELECT mentions FROM disc_msgs WHERE discussion_id=? AND mentions<>'[]'", [$disc]) as $m) $ids = array_merge($ids, array_map('intval', json_decode($m['mentions'], true) ?: []));
  return array_values(array_unique($ids));
}

function handle_disc($a) {
  $in = body(); $uid = uid();
  switch ($a) {
    case 'summary': // per-customer state for the customers list
      need('customers');
      out(rows("SELECT d.customer_id, d.id, d.topic, d.created_by, d.created, (SELECT name FROM customers WHERE id=d.customer_id) customer_name, (SELECT name FROM users WHERE id=d.created_by) created_name, COUNT(m.id) msgs, MAX(m.created) last_at,
          SUM(CASE WHEN m.id > COALESCE((SELECT last_id FROM disc_reads r WHERE r.user_id=? AND r.discussion_id=d.id), 0) AND m.user_id<>? THEN 1 ELSE 0 END) unread
        FROM discussions d LEFT JOIN disc_msgs m ON m.discussion_id=d.id WHERE d.status='Open' GROUP BY d.id", [$uid, $uid]));

    case 'thread':
      need('customers');
      $cid = (int)($_GET['customer_id'] ?? 0); $c = row('SELECT id,name,phone FROM customers WHERE id=?', [$cid]); if (!$c) fail('Customer not found', 404);
      $ds = rows("SELECT d.*, a.name created_name, b.name closed_name FROM discussions d LEFT JOIN users a ON a.id=d.created_by LEFT JOIN users b ON b.id=d.closed_by WHERE d.customer_id=? ORDER BY d.status='Open' DESC, d.id DESC LIMIT 20", [$cid]);
      foreach ($ds as &$d) {
        $d['msgs'] = rows('SELECT m.id,m.user_id,m.body,m.mentions,m.kind,m.created,u.name user_name FROM disc_msgs m LEFT JOIN users u ON u.id=m.user_id WHERE m.discussion_id=? ORDER BY m.id', [$d['id']]);
        foreach ($d['msgs'] as &$m) $m['mentions'] = json_decode($m['mentions'] ?: '[]', true) ?: [];
        unset($m);
        $last = $d['msgs'] ? end($d['msgs'])['id'] : 0;
        if ($last) q('INSERT INTO disc_reads(user_id,discussion_id,last_id) VALUES(?,?,?) ON CONFLICT(user_id,discussion_id) DO UPDATE SET last_id=excluded.last_id', [$uid, $d['id'], $last]);
      }
      unset($d);
      q('UPDATE notifs SET seen=1 WHERE user_id=? AND customer_id=? AND seen=0', [$uid, $cid]);
      $canEnd = fn($d) => $d['status'] === 'Open' && ((int)$d['created_by'] === $uid || is_admin() || can('customers', true));
      foreach ($ds as &$d) $d['can_end'] = $canEnd($d) ? 1 : 0; unset($d);
      out(['customer' => $c, 'discussions' => $ds, 'users' => disc_users(), 'me' => $uid]);

    case 'post':
      need('customers');
      $cid = (int)($in['customer_id'] ?? 0); $c = row('SELECT id,name FROM customers WHERE id=?', [$cid]); if (!$c) fail('Customer not found', 404);
      $text = trim((string)($in['body'] ?? '')); if ($text === '') fail('Write a message'); $text = mb_substr($text, 0, 2000);
      $ok = array_column(disc_users(), 'name', 'id');
      $mentions = array_values(array_unique(array_filter(array_map('intval', (array)($in['mentions'] ?? [])), fn($x) => isset($ok[$x]))));
      $d = row("SELECT * FROM discussions WHERE customer_id=? AND status='Open' ORDER BY id DESC LIMIT 1", [$cid]);
      if (!$d) { $topic = mb_substr(trim((string)($in['topic'] ?? '')), 0, 120);
        q('INSERT INTO discussions(customer_id,topic,created_by) VALUES(?,?,?)', [$cid, $topic, $uid]); $d = row('SELECT * FROM discussions WHERE id=?', [(int)db()->lastInsertId()]);
        audit('disc_start', 'customers', $cid, $topic); }
      q('INSERT INTO disc_msgs(discussion_id,user_id,body,mentions) VALUES(?,?,?,?)', [$d['id'], $uid, $text, json_encode($mentions)]);
      $mid = (int)db()->lastInsertId(); q('UPDATE discussions SET updated=CURRENT_TIMESTAMP WHERE id=?', [$d['id']]);
      q('INSERT INTO disc_reads(user_id,discussion_id,last_id) VALUES(?,?,?) ON CONFLICT(user_id,discussion_id) DO UPDATE SET last_id=excluded.last_id', [$uid, $d['id'], $mid]);
      $who = $_SESSION['name'] ?? 'Someone';
      disc_notify($mentions, 'mention', $d['id'], $cid, "$who tagged you on {$c['name']}: $text");
      disc_notify(array_diff(disc_participants($d['id']), $mentions), 'reply', $d['id'], $cid, "$who on {$c['name']}: $text");
      out(['ok' => true, 'id' => $mid, 'discussion_id' => (int)$d['id']]);

    case 'end':
      need('customers');
      $d = row('SELECT d.*, c.name cname FROM discussions d LEFT JOIN customers c ON c.id=d.customer_id WHERE d.id=?', [(int)($in['id'] ?? 0)]); if (!$d) fail('Not found', 404);
      if ($d['status'] !== 'Open') fail('This discussion has already ended');
      if (!((int)$d['created_by'] === $uid || is_admin() || can('customers', true))) fail('Only the person who started it or an admin can end this discussion', 403);
      $note = mb_substr(trim((string)($in['note'] ?? '')), 0, 500);
      q("UPDATE discussions SET status='Closed', closed_by=?, closed_at=CURRENT_TIMESTAMP, outcome=?, updated=CURRENT_TIMESTAMP WHERE id=?", [$uid, $note, $d['id']]);
      q("INSERT INTO disc_msgs(discussion_id,user_id,body,kind) VALUES(?,?,?, 'end')", [$d['id'], $uid, $note]);
      $who = $_SESSION['name'] ?? 'Someone';
      disc_notify(disc_participants($d['id']), 'end', $d['id'], $d['customer_id'], "$who ended the discussion on {$d['cname']}" . ($note ? ": $note" : ''));
      audit('disc_end', 'customers', $d['customer_id'], $note); out(['ok' => true]);

    case 'notifs': // my unseen notifications (bell)
      $r = rows('SELECT n.*, c.name customer_name, u.name from_name FROM notifs n LEFT JOIN customers c ON c.id=n.customer_id LEFT JOIN users u ON u.id=n.from_id WHERE n.user_id=? AND n.seen=0 ORDER BY n.id DESC LIMIT 30', [$uid]);
      out(['rows' => $r, 'count' => (int)row('SELECT COUNT(*) c FROM notifs WHERE user_id=? AND seen=0', [$uid])['c']]);

    case 'seen':
      if (!empty($in['all'])) q('UPDATE notifs SET seen=1 WHERE user_id=? AND seen=0', [$uid]);
      else q('UPDATE notifs SET seen=1 WHERE user_id=? AND id=?', [$uid, (int)($in['id'] ?? 0)]);
      out(['ok' => true]);
  }
  fail('Unknown action', 404);
}
