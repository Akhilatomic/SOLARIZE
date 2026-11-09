<?php
// Calendar: team events + lead appointments + project start/finish dates in one place.

const EV_TYPES = ['Site visit', 'Installation', 'Follow-up', 'Meeting', 'KSEB inspection', 'Payment', 'Other'];
const EV_STATUS = ['Scheduled', 'Done', 'Cancelled'];

// Staff see their own events, events assigned to them and team-wide (unassigned) events; admin sees everything.
function ev_scope() { if (is_admin()) return '1=1'; $u = uid(); return "(e.user_id=$u OR e.user_id IS NULL OR e.created_by=$u)"; }
function ev_can_edit($e) { return is_admin() || (int)$e['created_by'] === uid() || (int)$e['user_id'] === uid() || empty($e['user_id']); }
function ev_get($id) { $e = row('SELECT e.* FROM events e WHERE e.id=? AND ' . ev_scope(), [(int)$id]); if (!$e) fail('Event not found', 404); return $e; }
function ev_dt($v, $label) {
  $v = trim((string)$v);
  if (!preg_match('/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/', $v)) fail("$label: use a valid date/time");
  return $v;
}

function handle_calendar($a) {
  $in = body();
  need('calendar', in_array($a, ['save', 'delete', 'move', 'status']));
  switch ($a) {
    case 'list':
      $from = preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['from'] ?? '') ? $_GET['from'] : date('Y-m-01');
      $to = preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['to'] ?? '') ? $_GET['to'] : date('Y-m-t');
      $uf = (int)($_GET['user'] ?? 0); $extra = $uf ? ' AND e.user_id=' . $uf : '';
      $events = rows("SELECT e.*, u.name user_name, cb.name created_by_name, l.name lead_name, c.name customer_name, p.title project_title
        FROM events e LEFT JOIN users u ON u.id=e.user_id LEFT JOIN users cb ON cb.id=e.created_by LEFT JOIN leads l ON l.id=e.lead_id
        LEFT JOIN customers c ON c.id=e.customer_id LEFT JOIN projects p ON p.id=e.project_id
        WHERE substr(e.start,1,10)<=? AND substr(COALESCE(NULLIF(e.end,''),e.start),1,10)>=? AND " . ev_scope() . "$extra ORDER BY e.start", [$to, $from]);
      foreach ($events as &$e) $e['can_edit'] = ev_can_edit($e) ? 1 : 0; unset($e);
      $appts = canR_leads() ? array_map('lead_mask', rows("SELECT l.id,l.name,l.phone,l.email,l.city,l.status,l.appt,l.remark,l.assigned_to,u.name owner_name FROM leads l LEFT JOIN users u ON u.id=l.assigned_to
        WHERE l.appt BETWEEN ? AND ? AND " . lead_scope('l') . ($uf ? ' AND l.assigned_to=' . $uf : ''), [$from, $to])) : [];
      $projects = can('projects') ? rows("SELECT p.id,p.title,p.start,p.end,p.stage,p.engineer,c.name customer FROM projects p LEFT JOIN customers c ON c.id=p.customer_id
        WHERE (p.start BETWEEN ? AND ?) OR (p.end BETWEEN ? AND ?)", [$from, $to, $from, $to]) : [];
      out(['events' => $events, 'appts' => $appts, 'projects' => $projects, 'users' => rows('SELECT id,name FROM users WHERE active=1 ORDER BY name'), 'types' => EV_TYPES]);
    case 'save':
      $title = trim((string)($in['title'] ?? '')); if ($title === '') fail('Title required');
      $type = in_array($in['type'] ?? '', EV_TYPES) ? $in['type'] : 'Other';
      $all = !empty($in['all_day']) ? 1 : 0;
      $start = ev_dt($in['start'] ?? '', 'Start'); $end = trim((string)($in['end'] ?? '')) !== '' ? ev_dt($in['end'], 'End') : '';
      if ($all) { $start = substr($start, 0, 10); $end = $end ? substr($end, 0, 10) : ''; }
      if ($end && $end < $start) fail('End must be after start');
      $lead = (int)($in['lead_id'] ?? 0) ?: null; if ($lead) lead_or_404($lead);
      $cust = (int)($in['customer_id'] ?? 0) ?: null; $proj = (int)($in['project_id'] ?? 0) ?: null;
      $user = (int)($in['user_id'] ?? 0) ?: null; if ($user && !row('SELECT 1 FROM users WHERE id=? AND active=1', [$user])) fail('Choose an active user');
      $status = in_array($in['status'] ?? '', EV_STATUS) ? $in['status'] : 'Scheduled';
      $v = [$title, $type, $start, $end, $all, $lead, $cust, $proj, $user, mb_substr(trim((string)($in['location'] ?? '')), 0, 200), trim((string)($in['notes'] ?? '')), $status, (int)($in['remind'] ?? 10)];
      if (!empty($in['id'])) {
        $e = ev_get($in['id']); if (!ev_can_edit($e)) fail('You can only edit your own or your team’s events', 403);
        q('UPDATE events SET title=?,type=?,start=?,end=?,all_day=?,lead_id=?,customer_id=?,project_id=?,user_id=?,location=?,notes=?,status=?,remind=?,updated=CURRENT_TIMESTAMP WHERE id=?', array_merge($v, [$e['id']]));
        audit('update', 'events', $e['id'], $title); out(['id' => (int)$e['id']]);
      }
      q('INSERT INTO events(title,type,start,end,all_day,lead_id,customer_id,project_id,user_id,location,notes,status,remind,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', array_merge($v, [uid()]));
      $id = (int)db()->lastInsertId(); audit('create', 'events', $id, $title); out(['id' => $id]);
    case 'status':
      $e = ev_get($in['id'] ?? 0); if (!ev_can_edit($e)) fail('Not allowed', 403);
      $s = in_array($in['status'] ?? '', EV_STATUS) ? $in['status'] : 'Scheduled';
      q('UPDATE events SET status=?,updated=CURRENT_TIMESTAMP WHERE id=?', [$s, $e['id']]); audit('status', 'events', $e['id'], $s); out(['ok' => true]);
    case 'move': // drag & drop reschedule
      if (($in['kind'] ?? '') === 'appt') {
        $l = lead_or_404($in['id'] ?? 0); lead_need_write($l);
        $d = ev_dt($in['start'] ?? '', 'Date'); q('UPDATE leads SET appt=?,updated=CURRENT_TIMESTAMP WHERE id=?', [substr($d, 0, 10), $l['id']]);
        audit('reschedule', 'leads', $l['id'], substr($d, 0, 10)); out(['ok' => true]);
      }
      $e = ev_get($in['id'] ?? 0); if (!ev_can_edit($e)) fail('Not allowed', 403);
      $start = ev_dt($in['start'] ?? '', 'Start'); $end = trim((string)($in['end'] ?? '')) !== '' ? ev_dt($in['end'], 'End') : '';
      q('UPDATE events SET start=?,end=?,updated=CURRENT_TIMESTAMP WHERE id=?', [$start, $end, $e['id']]); audit('reschedule', 'events', $e['id'], $start); out(['ok' => true]);
    case 'delete':
      $e = ev_get($in['id'] ?? 0); if (!ev_can_edit($e)) fail('Not allowed', 403);
      q('DELETE FROM events WHERE id=?', [$e['id']]); audit('delete', 'events', $e['id'], $e['title']); out(['ok' => true]);
    case 'upcoming': // for reminders: my events in the next 24h
      $now = date('Y-m-d\TH:i'); $till = date('Y-m-d\TH:i', time() + 86400);
      out(rows("SELECT e.id,e.title,e.type,e.start,e.location,e.remind,e.all_day FROM events e WHERE e.status='Scheduled' AND e.all_day=0 AND e.start>=? AND e.start<=? AND " . (is_admin() ? '(e.user_id=' . uid() . ' OR e.created_by=' . uid() . ' OR e.user_id IS NULL)' : ev_scope()) . ' ORDER BY e.start', [$now, $till]));
  }
  fail('Unknown action', 404);
}
function canR_leads() { return can('leads'); }
