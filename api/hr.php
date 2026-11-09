<?php
// Attendance (check-in/out with optional location) and Leaves (apply / approve / balances).
// Permissions: 'attendance' / 'leaves' read = use your own; write = manage the team (approve, correct, view everyone).

const HR_HOLIDAYS_2026 = [['date' => '2026-01-02', 'name' => 'Mannam Jayanthi'], ['date' => '2026-01-26', 'name' => 'Republic Day'], ['date' => '2026-02-15', 'name' => 'Maha Sivaratri'], ['date' => '2026-04-01', 'name' => 'Annual Closing of Bank Accounts'], ['date' => '2026-04-02', 'name' => 'Maundy Thursday'], ['date' => '2026-04-03', 'name' => 'Good Friday'], ['date' => '2026-04-05', 'name' => 'Easter Sunday'], ['date' => '2026-04-14', 'name' => 'Dr. B.R. Ambedkar Jayanthi'], ['date' => '2026-04-15', 'name' => 'Vishu'], ['date' => '2026-05-01', 'name' => 'May Day (Labour Day)'], ['date' => '2026-08-12', 'name' => 'Karkadaka Vavu'], ['date' => '2026-08-15', 'name' => 'Independence Day'], ['date' => '2026-08-25', 'name' => 'First Onam'], ['date' => '2026-08-26', 'name' => 'Thiruvonam'], ['date' => '2026-08-27', 'name' => 'Third Onam'], ['date' => '2026-08-28', 'name' => 'Fourth Onam / Sree Narayana Guru Jayanthi'], ['date' => '2026-09-04', 'name' => 'Sreekrishna Jayanthi'], ['date' => '2026-09-21', 'name' => 'Sree Narayana Guru Samadhi Day'], ['date' => '2026-10-02', 'name' => 'Gandhi Jayanthi'], ['date' => '2026-10-20', 'name' => 'Mahanavami'], ['date' => '2026-10-21', 'name' => 'Vijayadasami'], ['date' => '2026-11-08', 'name' => 'Deepavali'], ['date' => '2026-12-25', 'name' => 'Christmas Day']];

function hr_cfg() {
  $d = ['start' => '09:00', 'end' => '18:00', 'half_after' => '14:00', 'pay_day' => 6, 'grace' => 15, 'half_hours' => 0, 'full_hours' => 9, 'week_off' => [0], 'holidays' => HR_HOLIDAYS_2026,
    'leave_types' => [['code' => 'CL', 'name' => 'Casual leave', 'quota' => 12], ['code' => 'SL', 'name' => 'Sick leave', 'quota' => 12], ['code' => 'EL', 'name' => 'Earned leave', 'quota' => 15], ['code' => 'LOP', 'name' => 'Unpaid leave (LOP)', 'quota' => 0]]];
  $r = row("SELECT v FROM settings WHERE k='hr'"); $s = $r ? (json_decode($r['v'], true) ?: []) : [];
  if ($s && !isset($s['half_after'])) unset($s['start'], $s['half_hours'], $s['full_hours']); // settings saved before 9–6 office hours: take the new defaults
  if (empty($s['holidays']) && empty($s['holidays_set'])) unset($s['holidays']); // no list saved yet: use the 2026 office holiday list
  return $s + $d;
}
function hr_mgr($m) { return can($m, true); }
function hr_now() { return [date('Y-m-d'), date('H:i')]; }
function hr_hol($cfg) { $h = []; foreach ($cfg['holidays'] as $x) if (!empty($x['date'])) $h[$x['date']] = $x['name'] ?? 'Holiday'; return $h; }
// working days between two dates (skips weekly offs and holidays)
function hr_days($from, $to, $half, $cfg) {
  $hol = hr_hol($cfg); $n = 0;
  for ($t = strtotime($from); $t <= strtotime($to); $t += 86400) { $d = date('Y-m-d', $t); if (in_array((int)date('w', $t), $cfg['week_off'])) continue; if (isset($hol[$d])) continue; $n++; }
  return ($half && $from === $to && $n) ? 0.5 : $n;
}
function hr_balance($uid, $year, $cfg) {
  $out = [];
  foreach ($cfg['leave_types'] as $t) {
    $used = (float)(row("SELECT COALESCE(SUM(days),0) v FROM leaves WHERE user_id=? AND type=? AND status='Approved' AND substr(from_date,1,4)=?", [$uid, $t['code'], (string)$year])['v'] ?? 0);
    $pend = (float)(row("SELECT COALESCE(SUM(days),0) v FROM leaves WHERE user_id=? AND type=? AND status='Pending' AND substr(from_date,1,4)=?", [$uid, $t['code'], (string)$year])['v'] ?? 0);
    $out[] = ['code' => $t['code'], 'name' => $t['name'], 'quota' => (float)$t['quota'], 'used' => $used, 'pending' => $pend, 'left' => (float)$t['quota'] > 0 ? (float)$t['quota'] - $used : null];
  }
  return $out;
}
function hr_dt($v, $label) { $v = trim((string)$v); if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) fail("$label: choose a date"); return $v; }
function hr_tm($v) { $v = trim((string)$v); return preg_match('/^\d{2}:\d{2}$/', $v) ? $v : ''; }
function hr_mins($t) { return $t ? ((int)substr($t, 0, 2)) * 60 + (int)substr($t, 3, 2) : 0; }

function handle_hr($a) {
  $in = body(); $cfg = hr_cfg(); $uid = uid();
  switch ($a) {
    case 'me':
      need('attendance');
      [$d] = hr_now();
      out(['today' => row('SELECT * FROM attendance WHERE user_id=? AND date=?', [$uid, $d]), 'date' => $d, 'cfg' => $cfg, 'manage_att' => hr_mgr('attendance') ? 1 : 0, 'manage_lv' => hr_mgr('leaves') ? 1 : 0,
        'on_leave' => row("SELECT type,half FROM leaves WHERE user_id=? AND status='Approved' AND ? BETWEEN from_date AND to_date", [$uid, $d]),
        'pending_requests' => hr_mgr('leaves') ? (int)row("SELECT COUNT(*) c FROM leaves WHERE status='Pending' AND user_id<>?", [is_admin() ? 0 : $uid])['c'] : 0]);
    case 'punch':
      need('attendance');
      [$d, $t] = hr_now(); $kind = ($in['kind'] ?? '') === 'out' ? 'out' : 'in';
      $lat = is_numeric($in['lat'] ?? null) ? (float)$in['lat'] : null; $lng = is_numeric($in['lng'] ?? null) ? (float)$in['lng'] : null; $acc = is_numeric($in['acc'] ?? null) ? (int)$in['acc'] : null;
      $r = row('SELECT * FROM attendance WHERE user_id=? AND date=?', [$uid, $d]);
      if ($kind === 'in') {
        if ($r && $r['check_in']) fail('You already checked in at ' . $r['check_in']);
        $late = hr_mins($t) > hr_mins($cfg['start']) + (int)$cfg['grace'];
        $st = hr_mins($t) >= hr_mins($cfg['half_after']) ? 'Half day' : ($late ? 'Late' : 'Present');
        if ($r) q('UPDATE attendance SET check_in=?, in_lat=?, in_lng=?, in_acc=?, status=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$t, $lat, $lng, $acc, $st, $r['id']]);
        else q('INSERT INTO attendance(user_id,date,check_in,in_lat,in_lng,in_acc,status) VALUES(?,?,?,?,?,?,?)', [$uid, $d, $t, $lat, $lng, $acc, $st]);
        audit('check_in', 'attendance', $uid, $t . ($late ? ' (late)' : '')); out(['ok' => true, 'time' => $t, 'late' => $late, 'status' => $st]);
      }
      if (!$r || !$r['check_in']) fail('Check in first');
      if ($r['check_out']) fail('You already checked out at ' . $r['check_out']);
      $hrs = max(0, hr_mins($t) - hr_mins($r['check_in'])) / 60;
      $status = (hr_mins($t) < hr_mins($cfg['half_after']) || ((float)$cfg['half_hours'] > 0 && $hrs < (float)$cfg['half_hours'])) ? 'Half day' : $r['status'];
      q('UPDATE attendance SET check_out=?, out_lat=?, out_lng=?, out_acc=?, status=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$t, $lat, $lng, $acc, $status, $r['id']]);
      audit('check_out', 'attendance', $uid, $t); out(['ok' => true, 'time' => $t, 'hours' => round($hrs, 2), 'status' => $status, 'early' => hr_mins($t) < hr_mins($cfg['end'])]);
    case 'today':
      need('attendance', true); [$d] = hr_now();
      out(['date' => $d, 'rows' => rows("SELECT u.id user_id, u.name, u.role, a.check_in, a.check_out, a.status, a.in_lat, a.in_lng, a.out_lat, a.out_lng, a.notes,
        (SELECT type || CASE WHEN half<>'' THEN ' (half)' ELSE '' END FROM leaves l WHERE l.user_id=u.id AND l.status='Approved' AND ? BETWEEN l.from_date AND l.to_date LIMIT 1) leave
        FROM users u LEFT JOIN attendance a ON a.user_id=u.id AND a.date=? WHERE u.active=1 ORDER BY u.name", [$d, $d])]);
    case 'month':
      need('attendance');
      $m = preg_match('/^\d{4}-\d{2}$/', $_GET['month'] ?? '') ? $_GET['month'] : date('Y-m');
      $all = hr_mgr('attendance') && empty($_GET['mine']);
      $users = $all ? rows('SELECT id,name,role FROM users WHERE active=1 ORDER BY name') : [row('SELECT id,name,role FROM users WHERE id=?', [$uid])];
      $ids = implode(',', array_map(fn($u) => (int)$u['id'], $users)) ?: '0';
      out(['month' => $m, 'users' => $users, 'cfg' => $cfg, 'today' => date('Y-m-d'),
        'records' => rows("SELECT * FROM attendance WHERE user_id IN ($ids) AND substr(date,1,7)=?", [$m]),
        'leaves' => rows("SELECT user_id,type,from_date,to_date,half FROM leaves WHERE status='Approved' AND user_id IN ($ids) AND from_date<=? AND to_date>=?", [$m . '-31', $m . '-01'])]);
    case 'range': // weekly salary view: any span up to 31 days
      need('attendance');
      $from = hr_dt($_GET['from'] ?? '', 'From'); $to = hr_dt($_GET['to'] ?? '', 'To'); if ($to < $from || (strtotime($to) - strtotime($from)) > 31 * 86400) fail('Choose up to 31 days');
      $all = hr_mgr('attendance') && empty($_GET['mine']);
      $users = $all ? rows('SELECT id,name,role FROM users WHERE active=1 ORDER BY name') : [row('SELECT id,name,role FROM users WHERE id=?', [$uid])];
      $ids = implode(',', array_map(fn($u) => (int)$u['id'], $users)) ?: '0';
      out(['from' => $from, 'to' => $to, 'users' => $users, 'cfg' => $cfg, 'today' => date('Y-m-d'),
        'records' => rows("SELECT * FROM attendance WHERE user_id IN ($ids) AND date BETWEEN ? AND ?", [$from, $to]),
        'leaves' => rows("SELECT user_id,type,from_date,to_date,half FROM leaves WHERE status='Approved' AND user_id IN ($ids) AND from_date<=? AND to_date>=?", [$to, $from])]);
    case 'mark': // manager correction
      need('attendance', true);
      $u = (int)($in['user_id'] ?? 0); if (!row('SELECT 1 FROM users WHERE id=?', [$u])) fail('Choose a user');
      $d = hr_dt($in['date'] ?? '', 'Date'); $st = in_array($in['status'] ?? '', ['Present', 'Late', 'Half day', 'Absent', 'On duty']) ? $in['status'] : 'Present';
      $ci = hr_tm($in['check_in'] ?? ''); $co = hr_tm($in['check_out'] ?? ''); $note = mb_substr(trim((string)($in['notes'] ?? '')), 0, 200);
      if ($ci && $co && hr_mins($co) < hr_mins($ci)) fail('Check-out must be after check-in');
      if (($in['clear'] ?? 0)) { q('DELETE FROM attendance WHERE user_id=? AND date=?', [$u, $d]); audit('att_clear', 'attendance', $u, $d); out(['ok' => true]); }
      q('INSERT INTO attendance(user_id,date,check_in,check_out,status,notes,edited_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET check_in=excluded.check_in, check_out=excluded.check_out, status=excluded.status, notes=excluded.notes, edited_by=excluded.edited_by, updated=CURRENT_TIMESTAMP',
        [$u, $d, $ci ?: null, $co ?: null, $st, $note, $_SESSION['name'] ?? '']);
      audit('att_edit', 'attendance', $u, "$d $st $ci-$co" . ($note ? " · $note" : '')); out(['ok' => true]);

    // ---------- leaves ----------
    case 'leaves':
      need('leaves'); $all = hr_mgr('leaves') && empty($_GET['mine']);
      $w = $all ? '1=1' : 'l.user_id=' . $uid; $args = [];
      if (!empty($_GET['status'])) { $w .= ' AND l.status=?'; $args[] = $_GET['status']; }
      out(['rows' => rows("SELECT l.*, u.name user_name, a.name approver_name FROM leaves l LEFT JOIN users u ON u.id=l.user_id LEFT JOIN users a ON a.id=l.approver_id WHERE $w ORDER BY CASE l.status WHEN 'Pending' THEN 0 ELSE 1 END, l.from_date DESC LIMIT 500", $args),
        'balance' => hr_balance($uid, date('Y'), $cfg), 'cfg' => $cfg, 'manage' => hr_mgr('leaves') ? 1 : 0]);
    case 'balances':
      need('leaves', true); $y = (int)($_GET['year'] ?? date('Y'));
      out(array_map(fn($u) => ['user' => $u, 'balance' => hr_balance($u['id'], $y, $cfg)], rows('SELECT id,name,role FROM users WHERE active=1 ORDER BY name')));
    case 'apply':
      need('leaves');
      $type = (string)($in['type'] ?? ''); $t = array_values(array_filter($cfg['leave_types'], fn($x) => $x['code'] === $type))[0] ?? null; if (!$t) fail('Choose a leave type');
      $from = hr_dt($in['from'] ?? '', 'From'); $to = hr_dt($in['to'] ?? $from, 'To'); if ($to < $from) fail('“To” must be on or after “From”');
      $half = in_array($in['half'] ?? '', ['first', 'second']) && $from === $to ? $in['half'] : '';
      $who = $uid; if (!empty($in['user_id']) && (int)$in['user_id'] !== $uid) { if (!hr_mgr('leaves')) fail('You can only apply for yourself', 403); $who = (int)$in['user_id']; }
      $days = hr_days($from, $to, $half, $cfg); if ($days <= 0) fail('Those dates are all holidays or weekly offs');
      if (row("SELECT 1 FROM leaves WHERE user_id=? AND status IN ('Pending','Approved') AND from_date<=? AND to_date>=?", [$who, $to, $from])) fail('You already have leave on some of these dates');
      if ((float)$t['quota'] > 0) { $b = array_values(array_filter(hr_balance($who, substr($from, 0, 4), $cfg), fn($x) => $x['code'] === $type))[0];
        if ($days > $b['left'] - $b['pending']) fail("Not enough {$t['name']} left: " . max(0, $b['left'] - $b['pending']) . " day(s) available. Choose Unpaid leave or fewer days."); }
      $reason = trim((string)($in['reason'] ?? '')); if ($reason === '') fail('Add a reason');
      q('INSERT INTO leaves(user_id,type,from_date,to_date,half,days,reason,status) VALUES(?,?,?,?,?,?,?,?)', [$who, $type, $from, $to, $half, $days, mb_substr($reason, 0, 500), 'Pending']);
      $id = (int)db()->lastInsertId(); audit('leave_apply', 'leaves', $id, "{$type} {$from}→{$to} ({$days} d)"); out(['id' => $id, 'days' => $days]);
    case 'decide':
      need('leaves', true);
      $l = row('SELECT * FROM leaves WHERE id=?', [(int)($in['id'] ?? 0)]); if (!$l) fail('Not found', 404);
      if ($l['status'] !== 'Pending') fail('This request was already ' . strtolower($l['status']));
      if ((int)$l['user_id'] === $uid && !is_admin()) fail('Someone else has to approve your own leave', 403);
      $dec = ($in['decision'] ?? '') === 'Approved' ? 'Approved' : 'Rejected';
      q('UPDATE leaves SET status=?, approver_id=?, approver_note=?, decided_at=CURRENT_TIMESTAMP WHERE id=?', [$dec, $uid, mb_substr(trim((string)($in['note'] ?? '')), 0, 300), $l['id']]);
      audit('leave_' . strtolower($dec), 'leaves', $l['id'], "{$l['type']} {$l['from_date']}→{$l['to_date']}"); out(['ok' => true]);
    case 'cancel':
      need('leaves');
      $l = row('SELECT * FROM leaves WHERE id=?', [(int)($in['id'] ?? 0)]); if (!$l) fail('Not found', 404);
      $own = (int)$l['user_id'] === $uid;
      if (!($own && $l['status'] === 'Pending') && !hr_mgr('leaves')) fail($own ? 'Ask a manager to cancel an approved leave' : 'Not allowed', 403);
      if (in_array($l['status'], ['Rejected', 'Cancelled'])) fail('Already ' . strtolower($l['status']));
      q("UPDATE leaves SET status='Cancelled', decided_at=CURRENT_TIMESTAMP, approver_id=? WHERE id=?", [$uid, $l['id']]);
      audit('leave_cancel', 'leaves', $l['id'], ''); out(['ok' => true]);
    case 'days': // preview count for the apply form
      need('leaves'); $from = hr_dt($_GET['from'] ?? '', 'From'); $to = hr_dt($_GET['to'] ?? $from, 'To');
      out(['days' => $to < $from ? 0 : hr_days($from, $to, !empty($_GET['half']), $cfg)]);
    case 'holidays_save': // add / edit / remove holidays (admin)
      if (!is_admin()) fail('Admin only', 403);
      $c = hr_cfg(); $seen = []; $list = [];
      foreach ((array)($in['holidays'] ?? []) as $x) {
        $dt = (string)($x['date'] ?? ''); $nm = mb_substr(trim((string)($x['name'] ?? '')), 0, 60);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dt) || !strtotime($dt)) continue;
        if (isset($seen[$dt])) fail("Two holidays on $dt"); $seen[$dt] = 1; $list[] = ['date' => $dt, 'name' => $nm ?: 'Holiday'];
      }
      usort($list, fn($a, $b) => strcmp($a['date'], $b['date']));
      $c['holidays'] = $list; $c['holidays_set'] = 1; kv_set('hr', $c); audit('hr_holidays', 'settings', null, count($list) . ' holidays'); out(['ok' => true, 'holidays' => $list]);
    case 'cfg_save':
      if (!is_admin()) fail('Admin only', 403);
      $c = hr_cfg(); $v = $in['value'] ?? [];
      $c['start'] = hr_tm($v['start'] ?? '') ?: '09:00'; $c['end'] = hr_tm($v['end'] ?? '') ?: '18:00'; $c['half_after'] = hr_tm($v['half_after'] ?? '') ?: '14:00'; $c['grace'] = max(0, min(180, (int)($v['grace'] ?? 15)));
      $c['half_hours'] = max(0, min(12, (float)($v['half_hours'] ?? 0))); $c['full_hours'] = max(1, min(16, (float)($v['full_hours'] ?? 8)));
      $c['week_off'] = array_values(array_unique(array_filter(array_map('intval', (array)($v['week_off'] ?? [])), fn($x) => $x >= 0 && $x <= 6)));
      $c['holidays'] = array_values(array_filter(array_map(fn($h) => ['date' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $h['date'] ?? '') ? $h['date'] : '', 'name' => mb_substr(trim((string)($h['name'] ?? '')), 0, 60)], (array)($v['holidays'] ?? [])), fn($h) => $h['date']));
      $lt = array_values(array_filter(array_map(fn($t) => ['code' => strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($t['code'] ?? ''))), 'name' => mb_substr(trim((string)($t['name'] ?? '')), 0, 40), 'quota' => max(0, (float)($t['quota'] ?? 0))], (array)($v['leave_types'] ?? [])), fn($t) => $t['code'] && $t['name']));
      if ($lt) $c['leave_types'] = $lt;
      $c['pay_day'] = max(0, min(6, (int)($v['pay_day'] ?? 6))); if (isset($v['holidays'])) $c['holidays_set'] = 1; kv_set('hr', $c); audit('hr_settings', 'settings', null, 'updated'); out(['ok' => true]);
  }
  fail('Unknown action', 404);
}
