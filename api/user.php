<?php
// User display pictures (DP): square JPEG/PNG/WebP, stored privately in data/uploads, served only to signed-in staff.

function avatar_path($f) { return dirname(__DIR__) . '/data/uploads/' . basename((string)$f); }

function handle_user($a) {
  switch ($a) {
    case 'avatar': // GET id → image (URL carries a version, so it can be cached)
      $u = row('SELECT avatar FROM users WHERE id=?', [(int)($_GET['id'] ?? 0)]);
      $p = $u && $u['avatar'] ? avatar_path($u['avatar']) : ''; if (!$p || !is_file($p)) { http_response_code(404); exit; }
      $ext = strtolower(pathinfo($p, PATHINFO_EXTENSION)); $mime = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'][$ext] ?? 'image/jpeg';
      header_remove('Content-Type'); header('Content-Type: ' . $mime); header('Cache-Control: private, max-age=604800');
      header("Content-Security-Policy: sandbox; default-src 'none'; img-src 'self'"); header('Content-Length: ' . filesize($p));
      readfile($p); exit;

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

    case 'presence': // GET heartbeat from an open CRM tab (act=1: used in the last 5 minutes) → everyone's status
      /* on: using the CRM now · away: CRM open but idle, or checked in for attendance today (not out) · off: neither */
      $now = time(); $act = !empty($_GET['act']); $me = uid();
      $u0 = row('SELECT seen_at, active_at FROM users WHERE id=?', [$me]);
      if ($u0 && ($now - (int)$u0['seen_at'] >= 40 || ($act && $now - (int)$u0['active_at'] >= 40))) /* at most one write a minute per tab */
        q('UPDATE users SET seen_at=?' . ($act ? ', active_at=?' : '') . ' WHERE id=?', $act ? [$now, $now, $me] : [$now, $me]);
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
