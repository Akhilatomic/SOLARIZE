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

    case 'avatar_remove':
      $in = body(); $uid = (int)($in['user_id'] ?? 0) ?: uid();
      if ($uid !== uid() && !is_admin()) fail('Only an admin can change another user’s photo', 403);
      $u = row('SELECT avatar FROM users WHERE id=?', [$uid]); if (!$u) fail('User not found', 404);
      if ($u['avatar']) @unlink(avatar_path($u['avatar']));
      q("UPDATE users SET avatar='' WHERE id=?", [$uid]); audit('avatar_remove', 'users', $uid); out(['ok' => true]);
  }
  fail('Unknown action', 404);
}
