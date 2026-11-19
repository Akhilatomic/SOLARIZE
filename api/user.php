<?php
// User display pictures (DP): square JPEG/PNG/WebP, stored privately in data/uploads, served only to signed-in staff.

function avatar_path($f) { return dirname(__DIR__) . '/data/uploads/' . basename((string)$f); }

/* Active / idle time (2026-11-17): every accepted heartbeat adds the time since the person's previous heartbeat to their day:
   Active when the mouse or keyboard was used in the last PRES_ACT_IA seconds on that tab - or on another tab a moment ago (act_at) -
   else Idle (the CRM was open but untouched). A gap longer than PRES_GAP (CRM closed, computer asleep) counts nothing. */
const PRES_GAP = 150, PRES_ACT_IA = 120;
function presence_time_add($uid, $now, $prev, $isAct) {
  $day = date('Y-m-d', $now); $d = $prev > 0 && $now - $prev > 0 && $now - $prev <= PRES_GAP ? $now - $prev : 0;
  $r = row('SELECT act_at FROM presence_day WHERE user_id=? AND day=?', [$uid, $day]);
  $act = $isAct || ($r && $now - (int)$r['act_at'] <= PRES_ACT_IA); $a = $act ? $d : 0; $i = $act ? 0 : $d;
  q('INSERT INTO presence_day(user_id,day,active_s,idle_s,first_at,last_at,act_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET active_s=active_s+?, idle_s=idle_s+?, last_at=?' . ($isAct ? ', act_at=' . (int)$now : ''),
    [$uid, $day, $a, $i, $now, $now, $isAct ? $now : 0, $a, $i, $now]);
}
function presence_time_all() { return is_admin() || ($_SESSION['role'] ?? '') === 'assistant_manager'; }

function handle_user($a) {
  switch ($a) {
    case 'avatar': // GET id → image (URL carries a version, so it can be cached)
      $u = row('SELECT avatar FROM users WHERE id=?', [(int)($_GET['id'] ?? 0)]);
      $p = $u && $u['avatar'] ? avatar_path($u['avatar']) : ''; if (!$p || !is_file($p)) { http_response_code(404); exit; }
      serve_file($p, basename($p), ['mime' => FILE_MIME[strtolower(pathinfo($p, PATHINFO_EXTENSION))] ?? 'image/jpeg', 'inline' => true, 'cache' => 'private, max-age=604800', 'csp' => "sandbox; default-src 'none'; img-src 'self'"]);

    case 'avatar_set': // POST file [+ user_id for admins]
      $uid = (int)($_POST['user_id'] ?? 0) ?: uid();
      if ($uid !== uid() && !is_admin()) fail('Only an admin can change another user’s photo', 403);
      $u = row('SELECT id, avatar, name FROM users WHERE id=?', [$uid]); if (!$u) fail('User not found', 404);
      $ext = sec_upload($_FILES['file'] ?? null, ['image'], 5);
      $info = @getimagesize($_FILES['file']['tmp_name']); if (!$info || $info[0] < 32 || $info[1] < 32) fail('Choose a larger photo');
      $name = 'av-' . bin2hex(random_bytes(10)) . '.' . $ext;
      if (!move_uploaded_file($_FILES['file']['tmp_name'], avatar_path($name))) fail('Could not save the photo', 500);
      if ($u['avatar']) @unlink(avatar_path($u['avatar']));
      q('UPDATE users SET avatar=? WHERE id=?', [$name, $uid]);
      audit('avatar', 'users', $uid, $uid === uid() ? 'own photo' : 'photo for ' . $u['name']); out(['ok' => true, 'avatar' => $name]);

    case 'presence_time': // GET: active / idle seconds per person for today / yesterday / week / month (everyone for an admin or assistant manager, else only your own)
      $rg = (string)($_GET['range'] ?? 'today'); $t0 = time(); $td = date('Y-m-d', $t0);
      [$from, $to] = ['yesterday' => [date('Y-m-d', $t0 - 86400), date('Y-m-d', $t0 - 86400)], 'week' => [date('Y-m-d', $t0 - 6 * 86400), $td], 'month' => [date('Y-m-d', $t0 - 29 * 86400), $td]][$rg] ?? [$td, $td];
      $all = presence_time_all(); $res = [];
      foreach (rows('SELECT user_id, SUM(active_s) a, SUM(idle_s) i, MIN(CASE WHEN first_at>0 THEN first_at END) f, MAX(last_at) l, COUNT(*) d FROM presence_day WHERE day BETWEEN ? AND ?' . ($all ? '' : ' AND user_id=' . (int)uid()) . ' GROUP BY user_id', [$from, $to]) as $r)
        $res[(int)$r['user_id']] = ['a' => (int)$r['a'], 'i' => (int)$r['i'], 'f' => $r['f'] ? (int)$r['f'] : null, 'l' => (int)$r['l'], 'd' => (int)$r['d']];
      out(['range' => in_array($rg, ['yesterday', 'week', 'month'], true) ? $rg : 'today', 'from' => $from, 'to' => $to, 'all' => $all ? 1 : 0, 'users' => (object)$res]);
    case 'presence': // GET heartbeat from an open CRM tab (act=1: used in the last 5 minutes) → everyone's status
      /* on: using the CRM now · away: CRM open but idle, or checked in for attendance today (not out) · off: neither */
      $now = time(); $act = !empty($_GET['act']); $me = uid();
      $u0 = row('SELECT seen_at, active_at FROM users WHERE id=?', [$me]);
      $ia = isset($_GET['ia']) ? max(0, (int)$_GET['ia']) : ($act ? 0 : 99999); /* seconds since the person last touched the mouse / keyboard (this tab) */
      if ($u0 && ($now - (int)$u0['seen_at'] >= 40 || ($act && $now - (int)$u0['active_at'] >= 40))) /* at most one write a minute per tab */
      {
        try { presence_time_add($me, $now, (int)$u0['seen_at'], $ia <= PRES_ACT_IA); } catch (Throwable $e) { error_log('presence time: ' . $e->getMessage()); }
        q('UPDATE users SET seen_at=?' . ($act ? ', active_at=?' : '') . ' WHERE id=?', $act ? [$now, $now, $me] : [$now, $me]);
        /* working past office end time ("Continue working"): remember when the CRM was last used, for the check-out time if they forget */
        if ($act) q("UPDATE attendance SET last_act=? WHERE user_id=? AND date=? AND cont=1 AND COALESCE(check_out,'')=''", [date('H:i'), $me, date('Y-m-d')]);
      }
      $in = []; foreach (rows("SELECT user_id, check_in FROM attendance WHERE date=? AND COALESCE(check_in,'')<>'' AND COALESCE(check_out,'')=''", [date('Y-m-d')]) as $r) $in[(int)$r['user_id']] = $r['check_in'];
      $list = []; $team = !empty($_GET['team']); /* team=1 (the dashboard's Who's online): names, roles and pictures too */
      foreach (rows('SELECT id, name, role, avatar, seen_at, active_at FROM users WHERE active=1') as $u) {
        $id = (int)$u['id']; $seen = $id === $me ? $now : (int)$u['seen_at']; $used = $id === $me && $act ? $now : (int)$u['active_at'];
        $open = $seen && $now - $seen <= 150; $busy = $open && $used && $now - $used <= 300;
        $list[] = ['id' => $id, 'st' => $busy ? 'on' : ($open || isset($in[$id]) ? 'away' : 'off'), 'open' => $open ? 1 : 0,
          'seen' => $seen ? $now - $seen : null, 'idle' => $used ? $now - $used : null, 'in' => $in[$id] ?? null]
          + ($team ? ['name' => $u['name'], 'role_name' => ROLE_NAMES[$u['role']] ?? $u['role'], 'avatar' => (string)$u['avatar']] : []);
      }
      out(['users' => $list]);
    case 'avatar_remove':
      $in = body(); $uid = (int)($in['user_id'] ?? 0) ?: uid();
      if ($uid !== uid() && !is_admin()) fail('Only an admin can change another user’s photo', 403);
      $u = row('SELECT avatar FROM users WHERE id=?', [$uid]); if (!$u) fail('User not found', 404);
      if ($u['avatar']) @unlink(avatar_path($u['avatar']));
      q("UPDATE users SET avatar='' WHERE id=?", [$uid]); audit('avatar_remove', 'users', $uid); out(['ok' => true]);
  }
  fail('Unknown action', 404);
}
