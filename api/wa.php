<?php
// WhatsApp Business Cloud API inbox: webhook (receive + delivery status), send text / template / media / datasheets,
// chats linked to leads & customers, assignment, 24-hour service window. Secrets live in settings 'wa_cfg' (never sent to browsers).

function wa_cfg() { return kv_get('wa_cfg', ['phone_id' => '', 'waba_id' => '', 'token' => '', 'app_secret' => '', 'verify_token' => '', 'api_base' => 'https://graph.facebook.com/v21.0', 'display' => '']); }
function wa_on() { $c = wa_cfg(); return $c['phone_id'] !== '' && $c['token'] !== ''; }
function wa_digits($p) {
  $raw = trim((string)$p); $d = preg_replace('/\D/', '', $raw);
  if ($raw !== '' && $raw[0] === '+') return strlen($d) >= 8 ? $d : '';         // full international number
  if (strlen($d) === 10 && strpos('6789', $d[0]) !== false) return '91' . $d;   // Indian mobile
  if (strlen($d) === 11 && $d[0] === '0') return '91' . substr($d, 1);
  if (strlen($d) === 12 && strpos($d, '91') === 0) return $d;
  return '';
}

// HTTP to Graph (JSON or multipart); token only ever sent to the configured API host
function wa_http($method, $url, $json = null, $multipart = null, $raw = false) {
  $c = wa_cfg(); if (!preg_match('#^https?://#', $url)) $url = rtrim($c['api_base'], '/') . '/' . ltrim($url, '/');
  $host = parse_url($url, PHP_URL_HOST); $base = parse_url($c['api_base'], PHP_URL_HOST);
  $hdr = ['Authorization: Bearer ' . $c['token']];
  // media download URLs live on Meta's CDN (lookaside.fbsbx.com) and need the token too; allow only Meta hosts besides the API host
  if ($host !== $base && !preg_match('/(^|\.)(fbsbx\.com|facebook\.com|fbcdn\.net|whatsapp\.net)$/', (string)$host) && $host !== 'localhost') return [0, ['error' => ['message' => 'Unexpected host']]];
  $ch = curl_init($url);
  $o = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 40, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_FOLLOWLOCATION => false];
  if ($json !== null) { $o[CURLOPT_POSTFIELDS] = json_encode($json, JSON_UNESCAPED_UNICODE); $hdr[] = 'Content-Type: application/json'; }
  if ($multipart !== null) $o[CURLOPT_POSTFIELDS] = $multipart;
  $o[CURLOPT_HTTPHEADER] = $hdr; curl_setopt_array($ch, $o);
  $body = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $ctype = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE); $err = curl_error($ch); curl_close($ch);
  if ($body === false) return [0, ['error' => ['message' => 'Network error: ' . $err]]];
  if ($raw) return [$code, $body, $ctype];
  return [$code, json_decode($body, true) ?: ['error' => ['message' => 'Bad response from WhatsApp (' . $code . ')']]];
}
function wa_err($j) { $e = $j['error'] ?? null; if (!$e) return ''; $m = $e['error_user_msg'] ?? ($e['error_data']['details'] ?? ($e['message'] ?? 'WhatsApp error')); return $m . (isset($e['code']) ? ' (#' . $e['code'] . ')' : ''); }

// --- chats ---
function wa_chat_for($wa, $name = '') {
  $wa = wa_digits($wa); if ($wa === '') fail('Enter a 10-digit Indian mobile number, or the full number starting with + and the country code');
  $c = row('SELECT * FROM wa_chats WHERE wa_id=?', [$wa]); if ($c) { if ($name && !$c['name']) q('UPDATE wa_chats SET name=? WHERE id=?', [$name, $c['id']]); return row('SELECT * FROM wa_chats WHERE id=?', [$c['id']]); }
  $ten = substr($wa, -10);
  $lead = row("SELECT id,name FROM leads WHERE phone<>'' AND substr(replace(replace(replace(phone,' ',''),'+',''),'-',''),-10)=? ORDER BY id DESC LIMIT 1", [$ten]);
  $cust = row("SELECT id,name FROM customers WHERE phone<>'' AND substr(replace(replace(replace(phone,' ',''),'+',''),'-',''),-10)=? ORDER BY id DESC LIMIT 1", [$ten]);
  q('INSERT INTO wa_chats(wa_id,name,lead_id,customer_id) VALUES(?,?,?,?)', [$wa, $name ?: ($cust['name'] ?? ($lead['name'] ?? '')), $lead['id'] ?? null, $cust['id'] ?? null]);
  return row('SELECT * FROM wa_chats WHERE id=?', [(int)db()->lastInsertId()]);
}
function wa_scope($a = 'c') {
  if (is_admin()) return '1=1';
  $u = uid(); $leadOk = "($a.lead_id IS NULL OR $a.lead_id IN (SELECT l.id FROM leads l WHERE " . lead_scope('l') . '))';
  return "(($a.assigned_to=$u) OR ($a.assigned_to IS NULL AND $leadOk))";
}
function wa_chat_get($id) { $c = row('SELECT c.* FROM wa_chats c WHERE c.id=? AND ' . wa_scope('c'), [(int)$id]); if (!$c) fail('Chat not found', 404); return $c; }
function wa_window_open($c) { return $c['last_in_at'] && (time() - strtotime($c['last_in_at'] . ' UTC')) < 24 * 3600; }
function wa_take($c) { // replying takes an unassigned chat; claims its unclaimed lead if allowed
  if (!$c['assigned_to'] && !is_admin()) q('UPDATE wa_chats SET assigned_to=? WHERE id=? AND assigned_to IS NULL', [uid(), $c['id']]);
  if ($c['lead_id'] && can_claim()) q("UPDATE leads SET assigned_to=?, claimed_at=? WHERE id=? AND (assigned_to IS NULL OR assigned_to=0)", [uid(), gmdate('Y-m-d H:i:s'), $c['lead_id']]);
  if ($c['lead_id']) q("UPDATE leads SET notify=0, status=CASE WHEN status='New' THEN 'Contacted' ELSE status END WHERE id=?", [$c['lead_id']]);
}
function wa_store_out($c, $type, $body, $res, $extra = []) {
  $err = wa_err($res); $wamid = $res['messages'][0]['id'] ?? '';
  q('INSERT INTO wa_msgs(chat_id,dir,type,body,wamid,status,error,user,file_path,filename,mime) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    [$c['id'], 'out', $type, $body, $wamid, $err ? 'failed' : 'sent', $err, $_SESSION['name'] ?? '', $extra['path'] ?? '', $extra['filename'] ?? '', $extra['mime'] ?? '']);
  q("UPDATE wa_chats SET last_msg=?, last_at=CURRENT_TIMESTAMP WHERE id=?", [mb_substr(($type === 'text' ? '' : '[' . $type . '] ') . $body, 0, 120), $c['id']]);
  if ($err) fail($err, 502);
  wa_take($c); return (int)db()->lastInsertId();
}
function wa_upload_media($path, $mime, $name) {
  $c = wa_cfg();
  [$code, $j] = wa_http('POST', $c['phone_id'] . '/media', null, ['messaging_product' => 'whatsapp', 'type' => $mime, 'file' => new CURLFile($path, $mime, $name)]);
  if (empty($j['id'])) fail('Upload to WhatsApp failed: ' . (wa_err($j) ?: 'unknown error'), 502);
  return $j['id'];
}
function wa_send_file($c, $path, $mime, $name, $caption) {
  $kind = (strpos($mime, 'image/') === 0) ? 'image' : ((strpos($mime, 'video/') === 0) ? 'video' : ((strpos($mime, 'audio/') === 0) ? 'audio' : 'document'));
  if (!wa_window_open($c)) fail('The 24-hour reply window is closed. Send an approved template first; files can be sent once the customer replies.', 409);
  $mid = wa_upload_media($path, $mime, $name);
  $obj = ['id' => $mid]; if ($kind !== 'audio' && $caption !== '') $obj['caption'] = $caption; if ($kind === 'document') $obj['filename'] = $name;
  [$code, $j] = wa_http('POST', wa_cfg()['phone_id'] . '/messages', ['messaging_product' => 'whatsapp', 'to' => $c['wa_id'], 'type' => $kind, $kind => $obj]);
  $dir = dirname(__DIR__) . '/data/uploads'; $keep = 'wa-' . bin2hex(random_bytes(8)) . '-' . preg_replace('/[^\w.-]/', '_', $name); @copy($path, "$dir/$keep");
  return wa_store_out($c, $kind, $caption !== '' ? $caption : $name, $j, ['path' => $keep, 'filename' => $name, 'mime' => $mime]);
}

// --- webhook (public) ---
function handle_wa_hook() {
  $c = wa_cfg();
  if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    header('Content-Type: text/plain');
    if (($_GET['hub_mode'] ?? '') === 'subscribe' && $c['verify_token'] !== '' && hash_equals($c['verify_token'], (string)($_GET['hub_verify_token'] ?? ''))) { $h = kv_get('wa_hook', ['count' => 0]); $h['verified_at'] = gmdate('Y-m-d H:i:s'); kv_set('wa_hook', $h); echo $_GET['hub_challenge'] ?? ''; exit; }
    http_response_code(403); echo 'forbidden'; exit;
  }
  $raw = file_get_contents('php://input');
  $sigOk = $c['app_secret'] === '' || hash_equals('sha256=' . hash_hmac('sha256', $raw, $c['app_secret']), $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '');
  $pk = json_decode($raw, true) ?: []; $kind = isset($pk['entry'][0]['changes'][0]['value']['messages']) ? 'message' : (isset($pk['entry'][0]['changes'][0]['value']['statuses']) ? 'status' : 'other');
  $h = kv_get('wa_hook', ['count' => 0]); $h['count']++; $h['last_at'] = gmdate('Y-m-d H:i:s'); $h['last_ok'] = $sigOk ? 1 : 0; $h['last_kind'] = $kind; if ($sigOk && $kind === 'message') $h['last_msg_at'] = $h['last_at']; kv_set('wa_hook', $h);
  if ($c['app_secret'] !== '') { $sig = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? ''; if (!hash_equals('sha256=' . hash_hmac('sha256', $raw, $c['app_secret']), $sig)) { http_response_code(401); echo 'bad signature'; exit; } }
  $p = json_decode($raw, true) ?: [];
  foreach ($p['entry'] ?? [] as $e) foreach ($e['changes'] ?? [] as $ch) {
    $v = $ch['value'] ?? []; if (($v['metadata']['phone_number_id'] ?? $c['phone_id']) !== $c['phone_id']) continue;
    $names = []; foreach ($v['contacts'] ?? [] as $ct) $names[$ct['wa_id'] ?? ''] = $ct['profile']['name'] ?? '';
    foreach ($v['messages'] ?? [] as $m) {
      $from = (string)($m['from'] ?? ''); if ($from === '' || row('SELECT 1 FROM wa_msgs WHERE wamid=?', [$m['id'] ?? ''])) continue;
      $chat = wa_chat_for('+' . $from, $names[$from] ?? '');
      $t = $m['type'] ?? 'text'; $body = ''; $media = ''; $mime = ''; $fn = '';
      if ($t === 'text') $body = $m['text']['body'] ?? '';
      elseif (in_array($t, ['image', 'document', 'audio', 'video', 'sticker'])) { $media = $m[$t]['id'] ?? ''; $mime = $m[$t]['mime_type'] ?? ''; $body = $m[$t]['caption'] ?? ''; $fn = $m[$t]['filename'] ?? ''; }
      elseif ($t === 'button') $body = $m['button']['text'] ?? '';
      elseif ($t === 'interactive') $body = $m['interactive']['button_reply']['title'] ?? ($m['interactive']['list_reply']['title'] ?? '');
      elseif ($t === 'location') $body = 'Location: ' . ($m['location']['name'] ?? '') . ' https://maps.google.com/?q=' . ($m['location']['latitude'] ?? '') . ',' . ($m['location']['longitude'] ?? '');
      elseif ($t === 'reaction') $body = 'Reacted ' . ($m['reaction']['emoji'] ?? '');
      else $body = '[' . $t . ']';
      $at = gmdate('Y-m-d H:i:s', (int)($m['timestamp'] ?? time()));
      q('INSERT INTO wa_msgs(chat_id,dir,type,body,wamid,status,media_id,mime,filename,created) VALUES(?,?,?,?,?,?,?,?,?,?)', [$chat['id'], 'in', $t, $body, $m['id'] ?? '', 'received', $media, $mime, $fn, $at]);
      q('UPDATE wa_chats SET last_msg=?, last_at=?, last_in_at=?, unread=unread+1, last_in_wamid=? WHERE id=?', [mb_substr(($t === 'text' ? '' : '[' . $t . '] ') . $body, 0, 120), $at, $at, $m['id'] ?? '', $chat['id']]);
      // unknown number → new WhatsApp lead (shows in "New leads to contact")
      $chat = row('SELECT * FROM wa_chats WHERE id=?', [$chat['id']]);
      if (!$chat['lead_id'] && !$chat['customer_id']) {
        q("INSERT INTO leads(name,phone,source,status,added_by,notify,notes) VALUES(?,?,?,?,?,1,?)", [$chat['name'] ?: ('WhatsApp ' . substr($from, -10)), substr($from, -10), 'WhatsApp', 'New', 'WhatsApp', 'First message: ' . mb_substr($body, 0, 200)]);
        q('UPDATE wa_chats SET lead_id=? WHERE id=?', [(int)db()->lastInsertId(), $chat['id']]);
      }
    }
    foreach ($v['statuses'] ?? [] as $s) {
      $rank = ['sent' => 1, 'delivered' => 2, 'read' => 3, 'failed' => 9];
      $msg = row('SELECT id,status FROM wa_msgs WHERE wamid=?', [$s['id'] ?? '']); if (!$msg) continue;
      $new = $s['status'] ?? ''; if (($rank[$new] ?? 0) <= ($rank[$msg['status']] ?? 0) && $new !== 'failed') continue;
      q('UPDATE wa_msgs SET status=?, error=? WHERE id=?', [$new, $new === 'failed' ? ($s['errors'][0]['title'] ?? 'Failed') : '', $msg['id']]);
    }
  }
  header('Content-Type: application/json'); echo '{"ok":true}'; exit;
}

function handle_wa($a) {
  $in = body();
  $adminOnly = ['config', 'save', 'test', 'register', 'delete_chat'];
  if (in_array($a, $adminOnly) && !is_admin()) fail('Admin only', 403);
  if (!in_array($a, $adminOnly) && $a !== 'status') { need('whatsapp', !in_array($a, ['chats', 'thread', 'templates', 'media', 'unread'])); if (!wa_on()) fail('WhatsApp inbox is not connected yet', 409); }
  switch ($a) {
    case 'status': need('whatsapp'); $c = wa_cfg(); out(['connected' => wa_on(), 'display' => $c['display']]);
    case 'config':
      $c = wa_cfg(); if ($c['verify_token'] === '') { $c['verify_token'] = bin2hex(random_bytes(12)); kv_set('wa_cfg', $c); }
      out(['phone_id' => $c['phone_id'], 'waba_id' => $c['waba_id'], 'token_set' => $c['token'] !== '', 'token_hint' => $c['token'] ? '••••' . substr($c['token'], -4) : '', 'secret_set' => $c['app_secret'] !== '', 'verify_token' => $c['verify_token'], 'display' => $c['display'], 'hook' => kv_get('wa_hook', ['count' => 0])]);
    case 'save':
      $c = wa_cfg(); $c['phone_id'] = preg_replace('/\D/', '', (string)($in['phone_id'] ?? '')); $c['waba_id'] = preg_replace('/\D/', '', (string)($in['waba_id'] ?? ''));
      if (!empty($in['token'])) $c['token'] = trim((string)$in['token']); if (!empty($in['app_secret'])) $c['app_secret'] = trim((string)$in['app_secret']);
      if (!empty($in['disconnect'])) { $c['token'] = ''; $c['display'] = ''; }
      if ($c['verify_token'] === '') $c['verify_token'] = bin2hex(random_bytes(12));
      kv_set('wa_cfg', $c); audit('wa_config', 'settings', null, 'updated'); out(['ok' => true]);
    case 'register': // activates the business number for the Cloud API (fixes error #133010)
      $c = wa_cfg(); $pin = preg_replace('/\D/', '', (string)($in['pin'] ?? '')); if (strlen($pin) !== 6) fail('Enter a 6-digit PIN');
      [$code, $j] = wa_http('POST', $c['phone_id'] . '/register', ['messaging_product' => 'whatsapp', 'pin' => $pin]);
      if ($e = wa_err($j)) out(['ok' => false, 'error' => $e]);
      audit('wa_register', 'settings', null, 'phone registered'); out(['ok' => true]);
    case 'test':
      $c = wa_cfg(); if (!wa_on()) fail('Save the Phone number ID and access token first');
      [$code, $j] = wa_http('GET', $c['phone_id'] . '?fields=display_phone_number,verified_name,quality_rating');
      if ($e = wa_err($j)) out(['ok' => false, 'error' => $e]);
      $c['display'] = trim(($j['verified_name'] ?? '') . ' · ' . ($j['display_phone_number'] ?? ''), ' ·'); kv_set('wa_cfg', $c);
      $sub = 'WhatsApp Business Account ID missing';
      if ($c['waba_id'] !== '') { [$sc, $sj] = wa_http('POST', $c['waba_id'] . '/subscribed_apps', []); $sub = ($e2 = wa_err($sj)) ? $e2 : 'ok'; }
      out(['ok' => true, 'subscribed' => $sub, 'name' => $j['verified_name'] ?? '', 'number' => $j['display_phone_number'] ?? '', 'quality' => $j['quality_rating'] ?? '']);
    case 'unread':
      out(['unread' => (int)(row('SELECT COALESCE(SUM(unread),0) n FROM wa_chats c WHERE ' . wa_scope('c'))['n'] ?? 0)]);
    case 'chats':
      $f = $_GET['f'] ?? ''; $w = wa_scope('c'); $args = [];
      if ($f === 'unread') $w .= ' AND c.unread>0'; if ($f === 'mine') $w .= ' AND c.assigned_to=' . uid(); if ($f === 'unassigned') $w .= ' AND c.assigned_to IS NULL';
      if (($t = trim((string)($_GET['q'] ?? ''))) !== '') { $w .= ' AND (c.name LIKE ? OR c.wa_id LIKE ? OR c.last_msg LIKE ?)'; $args = ["%$t%", "%$t%", "%$t%"]; }
      out(rows("SELECT c.*, u.name assigned_name, l.name lead_name, l.status lead_status, cu.name customer_name FROM wa_chats c LEFT JOIN users u ON u.id=c.assigned_to LEFT JOIN leads l ON l.id=c.lead_id LEFT JOIN customers cu ON cu.id=c.customer_id WHERE $w ORDER BY c.last_at DESC LIMIT 300", $args));
    case 'thread':
      $c = wa_chat_get($_GET['id'] ?? 0);
      if ($c['unread'] > 0) { q('UPDATE wa_chats SET unread=0 WHERE id=?', [$c['id']]); if ($c['last_in_wamid']) wa_http('POST', wa_cfg()['phone_id'] . '/messages', ['messaging_product' => 'whatsapp', 'status' => 'read', 'message_id' => $c['last_in_wamid']]); }
      $c = row('SELECT c.*, u.name assigned_name FROM wa_chats c LEFT JOIN users u ON u.id=c.assigned_to WHERE c.id=?', [$c['id']]);
      $c['lead'] = $c['lead_id'] ? row('SELECT id,name,status,city,assigned_to,source FROM leads WHERE id=?', [$c['lead_id']]) : null;
      $c['customer'] = $c['customer_id'] ? row('SELECT id,name,district FROM customers WHERE id=?', [$c['customer_id']]) : null;
      $c['window_open'] = wa_window_open($c); $c['window_ends'] = $c['last_in_at'] ? gmdate('c', strtotime($c['last_in_at'] . ' UTC') + 86400) : null;
      $msgs = array_reverse(rows('SELECT id,dir,type,body,status,error,user,filename,mime,media_id,file_path,created FROM wa_msgs WHERE chat_id=? ORDER BY id DESC LIMIT ' . max(20, min(500, (int)($_GET['limit'] ?? 200))), [$c['id']]));
      foreach ($msgs as &$m) { $m['has_media'] = ($m['media_id'] || $m['file_path']) ? 1 : 0; unset($m['media_id'], $m['file_path']); } unset($m);
      out(['chat' => $c, 'messages' => $msgs]);
    case 'start':
      $c = wa_chat_for($in['phone'] ?? '', trim((string)($in['name'] ?? '')));
      if (!empty($in['lead_id']) && !$c['lead_id']) q('UPDATE wa_chats SET lead_id=? WHERE id=?', [(int)$in['lead_id'], $c['id']]);
      if (!empty($in['customer_id']) && !$c['customer_id']) q('UPDATE wa_chats SET customer_id=? WHERE id=?', [(int)$in['customer_id'], $c['id']]);
      out(['id' => (int)$c['id']]);
    case 'send':
      $c = wa_chat_get($in['chat_id'] ?? 0); $text = trim((string)($in['text'] ?? '')); if ($text === '') fail('Type a message');
      if (!wa_window_open($c)) fail('The 24-hour reply window is closed. Send an approved template to restart the conversation.', 409);
      [$code, $j] = wa_http('POST', wa_cfg()['phone_id'] . '/messages', ['messaging_product' => 'whatsapp', 'to' => $c['wa_id'], 'type' => 'text', 'text' => ['body' => $text, 'preview_url' => true]]);
      out(['id' => wa_store_out($c, 'text', $text, $j)]);
    case 'send_template':
      $c = wa_chat_get($in['chat_id'] ?? 0); $name = preg_replace('/[^\w]/', '', (string)($in['name'] ?? '')); if ($name === '') fail('Choose a template');
      $tpl = ['name' => $name, 'language' => ['code' => preg_replace('/[^\w-]/', '', (string)($in['lang'] ?? 'en'))]];
      $params = array_values(array_filter((array)($in['params'] ?? []), fn($x) => $x !== null));
      if ($params) $tpl['components'] = [['type' => 'body', 'parameters' => array_map(fn($p) => ['type' => 'text', 'text' => (string)$p], $params)]];
      [$code, $j] = wa_http('POST', wa_cfg()['phone_id'] . '/messages', ['messaging_product' => 'whatsapp', 'to' => $c['wa_id'], 'type' => 'template', 'template' => $tpl]);
      out(['id' => wa_store_out($c, 'template', (string)($in['preview'] ?? $name), $j)]);
    case 'send_media':
      $c = wa_chat_get($_POST['chat_id'] ?? 0); $fl = $_FILES['file'] ?? null;
      if (!$fl || $fl['error'] !== UPLOAD_ERR_OK) fail('Choose a file (the server upload limit may be too small)');
      $mime = mime_content_type($fl['tmp_name']) ?: 'application/octet-stream';
      $okm = ['image/jpeg', 'image/png', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'video/mp4', 'audio/mpeg', 'audio/ogg', 'text/plain'];
      if (!in_array($mime, $okm)) fail('This file type cannot be sent on WhatsApp');
      if ($fl['size'] > ((strpos($mime, 'image/') === 0) ? 5 : 16) * 1024 * 1024) fail('File too large for WhatsApp (images 5 MB, others 16 MB)');
      out(['id' => wa_send_file($c, $fl['tmp_name'], $mime, basename($fl['name']), trim((string)($_POST['caption'] ?? '')))]);
    case 'send_datasheet':
      $c = wa_chat_get($in['chat_id'] ?? 0); $d = row('SELECT * FROM datasheets WHERE id=?', [(int)($in['datasheet_id'] ?? 0)]); if (!$d) fail('Datasheet not found', 404);
      $path = dirname(__DIR__) . '/data/uploads/' . basename($d['path']); if (!is_file($path)) fail('File missing', 404);
      $mime = mime_content_type($path) ?: 'application/pdf';
      out(['id' => wa_send_file($c, $path, $mime, $d['file_name'], $d['title'] . ($d['available'] ? '' : ' (currently unavailable)'))]);
    case 'templates':
      $c = wa_cfg(); if ($c['waba_id'] === '') out([]);
      [$code, $j] = wa_http('GET', $c['waba_id'] . '/message_templates?fields=name,language,status,category,components&limit=100');
      if ($e = wa_err($j)) fail($e, 502);
      out(array_values(array_map(function ($t) { $body = ''; foreach ($t['components'] ?? [] as $cp) if (($cp['type'] ?? '') === 'BODY') $body = $cp['text'] ?? '';
        preg_match_all('/\{\{(\d+)\}\}/', $body, $mm); return ['name' => $t['name'], 'lang' => $t['language'], 'category' => $t['category'] ?? '', 'body' => $body, 'params' => count(array_unique($mm[1]))]; },
        array_filter($j['data'] ?? [], fn($t) => ($t['status'] ?? '') === 'APPROVED'))));
    case 'media':
      $m = row('SELECT m.* FROM wa_msgs m JOIN wa_chats c ON c.id=m.chat_id WHERE m.id=? AND ' . wa_scope('c'), [(int)($_GET['id'] ?? 0)]); if (!$m) fail('Not found', 404);
      $dir = dirname(__DIR__) . '/data/uploads';
      if (!$m['file_path'] && $m['media_id']) { // download inbound media from WhatsApp once, then serve from disk
        [$code, $j] = wa_http('GET', $m['media_id']); if (empty($j['url'])) fail('Media expired or unavailable', 404);
        [$c2, $bytes, $ct] = wa_http('GET', $j['url'], null, null, true); if ($c2 !== 200) fail('Could not download media', 502);
        $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'application/pdf' => 'pdf', 'audio/ogg' => 'ogg', 'audio/mpeg' => 'mp3', 'video/mp4' => 'mp4'][$j['mime_type'] ?? $m['mime']] ?? 'bin';
        $name = 'wa-' . bin2hex(random_bytes(8)) . '.' . $ext; file_put_contents("$dir/$name", $bytes);
        q('UPDATE wa_msgs SET file_path=?, mime=? WHERE id=?', [$name, $j['mime_type'] ?? $m['mime'], $m['id']]); $m['file_path'] = $name; $m['mime'] = $j['mime_type'] ?? $m['mime'];
      }
      $p = "$dir/" . basename($m['file_path']); if (!$m['file_path'] || !is_file($p)) fail('Not found', 404);
      header_remove('Content-Type'); header('Content-Type: ' . ($m['mime'] ?: 'application/octet-stream')); header('X-Content-Type-Options: nosniff');
      header('Content-Disposition: ' . (preg_match('#^(image|audio|video)/|pdf#', (string)$m['mime']) ? 'inline' : 'attachment') . '; filename="' . str_replace('"', '', $m['filename'] ?: basename($p)) . '"');
      readfile($p); exit;
    case 'delete_chat':
      $c = wa_chat_get($in['chat_id'] ?? 0); trash_put('WhatsApp chat', ($c['name'] ?: '') . ' +' . $c['wa_id'], [['wa_chats', 'id=?', [$c['id']]], ['wa_msgs', 'chat_id=?', [$c['id']]]]); q('DELETE FROM wa_msgs WHERE chat_id=?', [$c['id']]); q('DELETE FROM wa_chats WHERE id=?', [$c['id']]); audit('wa_delete', 'wa_chats', $c['id'], $c['wa_id']); out(['ok' => true]);
    case 'assign':
      $c = wa_chat_get($in['chat_id'] ?? 0); $to = (int)($in['user_id'] ?? 0);
      if (!is_admin() && $to !== uid() && $to !== 0) fail('Only the admin can assign chats to others', 403);
      if ($to && !row('SELECT 1 FROM users WHERE id=? AND active=1', [$to])) fail('Choose an active user');
      q('UPDATE wa_chats SET assigned_to=? WHERE id=?', [$to ?: null, $c['id']]); audit('wa_assign', 'wa_chats', $c['id'], (string)$to); out(['ok' => true]);
    case 'link':
      $c = wa_chat_get($in['chat_id'] ?? 0);
      if (array_key_exists('lead_id', $in)) { $lid = (int)$in['lead_id'] ?: null; if ($lid) lead_or_404($lid); q('UPDATE wa_chats SET lead_id=? WHERE id=?', [$lid, $c['id']]); }
      if (array_key_exists('customer_id', $in)) { $cid = (int)$in['customer_id'] ?: null; if ($cid && !row('SELECT 1 FROM customers WHERE id=?', [$cid])) fail('Customer not found', 404); q('UPDATE wa_chats SET customer_id=? WHERE id=?', [$cid, $c['id']]); }
      if (isset($in['name'])) q('UPDATE wa_chats SET name=? WHERE id=?', [mb_substr(trim((string)$in['name']), 0, 80), $c['id']]);
      out(['ok' => true]);
  }
  fail('Unknown action', 404);
}
