<?php
// Meta (Facebook / Instagram) Lead Ads sync via the Graph API.
// Config + secrets live in settings key 'meta_cfg' (never exposed by settings()); state in 'meta_state'.

function kv_get($k, $def) { $r = row('SELECT v FROM settings WHERE k=?', [$k]); return $r ? (json_decode($r['v'], true) ?: []) + $def : $def; }
function kv_set($k, $v) { q('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', [$k, json_encode($v, JSON_UNESCAPED_UNICODE)]); }
function meta_cfg() { return kv_get('meta_cfg', ['page_id' => '', 'token' => '', 'form_ids' => '', 'cron_key' => '', 'api_base' => 'https://graph.facebook.com/v21.0']); }
function meta_state() { return kv_get('meta_state', ['last_try' => 0, 'last_ok' => 0, 'last_error' => '', 'last_new' => 0, 'total_new' => 0, 'running' => 0]); }

function graph($cfg, $url, $params = []) {
  if (!preg_match('#^https?://#', $url)) $url = rtrim($cfg['api_base'], '/') . '/' . ltrim($url, '/');
  // never send the token to a host other than the configured API host
  if (parse_url($url, PHP_URL_HOST) !== parse_url($cfg['api_base'], PHP_URL_HOST)) return [0, ['error' => ['message' => 'Unexpected paging host']]];
  if ($params) $url .= (strpos($url, '?') === false ? '?' : '&') . http_build_query($params);
  $hdr = ['Authorization: Bearer ' . $cfg['token'], 'Accept: application/json'];
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $hdr, CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_FOLLOWLOCATION => false]);
    $body = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($body === false) return [0, ['error' => ['message' => 'Network error: ' . $err]]];
  } else {
    $ctx = stream_context_create(['http' => ['method' => 'GET', 'header' => implode("\r\n", $hdr), 'timeout' => 25, 'ignore_errors' => true]]);
    $body = @file_get_contents($url, false, $ctx); $code = 0;
    if ($body === false) return [0, ['error' => ['message' => 'Network error (enable curl or allow_url_fopen)']]];
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) $code = (int)$m[1];
  }
  return [$code, json_decode($body, true) ?: ['error' => ['message' => 'Bad response from Meta']]];
}
function graph_all($cfg, $path, $params, $maxPages = 10) {
  $out = []; $url = $path; $p = $params;
  for ($i = 0; $i < $maxPages; $i++) {
    [$code, $j] = graph($cfg, $url, $p);
    if (isset($j['error'])) throw new Exception($j['error']['message'] ?? 'Meta API error');
    foreach ($j['data'] ?? [] as $d) $out[] = $d;
    $next = $j['paging']['next'] ?? null; if (!$next) break;
    $url = $next; $p = [];
  }
  return $out;
}

// Lead forms and leads must be read with a Page access token. If the saved token is a user or
// system-user token, ask Meta for the page's own token (works when the page is assigned to that user).
function meta_page_cfg($cfg) {
  [$code, $j] = graph($cfg, $cfg['page_id'], ['fields' => 'access_token,name']);
  if (!empty($j['access_token'])) $cfg['token'] = $j['access_token'];
  $cfg['page_name'] = $j['name'] ?? '';
  return $cfg;
}

function norm_phone($p) {
  $d = preg_replace('/\D/', '', (string)$p);
  if (strlen($d) === 12 && strpos($d, '91') === 0) $d = substr($d, 2);
  if (strlen($d) === 11 && $d[0] === '0') $d = substr($d, 1);
  return $d;
}

function meta_sync($minGap) {
  $cfg = meta_cfg(); $st = meta_state(); $now = time();
  if ($cfg['token'] === '' || $cfg['page_id'] === '') return ['error' => 'Meta is not connected yet (admin: add Page ID and access token on the Meta Ads page).'];
  if ($st['running'] && $now - $st['running'] < 120) return ['skipped' => 'A sync is already running'];
  if ($now - $st['last_try'] < $minGap) return ['skipped' => 'Synced recently', 'new' => 0];
  $st['running'] = $now; $st['last_try'] = $now; kv_set('meta_state', $st);
  $new = 0; $err = '';
  try {
    $cfg = meta_page_cfg($cfg);
    $forms = [];
    foreach (preg_split('/[\s,]+/', trim($cfg['form_ids']), -1, PREG_SPLIT_NO_EMPTY) as $f) $forms[] = ['id' => $f, 'name' => ''];
    if (!$forms) $forms = graph_all($cfg, $cfg['page_id'] . '/leadgen_forms', ['fields' => 'id,name,status', 'limit' => 100], 3);
    $since = $st['last_ok'] ? $st['last_ok'] - 86400 : 0; // overlap by a day; dedupe by meta_id
    foreach ($forms as $f) {
      $params = ['fields' => 'id,created_time,field_data,campaign_name,adset_name,ad_name,form_id', 'limit' => 100];
      if ($since) $params['filtering'] = json_encode([['field' => 'time_created', 'operator' => 'GREATER_THAN', 'value' => $since]]);
      foreach (graph_all($cfg, $f['id'] . '/leads', $params, $since ? 5 : 20) as $L) $new += meta_ingest($L, $f);
    }
    $st['last_ok'] = $now; $st['last_error'] = '';
  } catch (Throwable $e) { $err = $e->getMessage(); $st['last_error'] = $err; }
  $st = meta_state() + $st; $st['running'] = 0; $st['last_try'] = $now; $st['last_error'] = $err; if (!$err) $st['last_ok'] = $now;
  $st['last_new'] = $new; $st['total_new'] = ($st['total_new'] ?? 0) + $new; kv_set('meta_state', $st);
  if ($new) q('INSERT INTO audit_log(user,action,entity,entity_id,detail) VALUES(?,?,?,?,?)', ['Meta Ads', 'sync', 'leads', null, "$new new lead(s)"]);
  return $err ? ['error' => $err, 'new' => $new] : ['ok' => true, 'new' => $new];
}

function meta_ingest($L, $form) {
  $mid = (string)($L['id'] ?? ''); if ($mid === '' || row('SELECT 1 FROM leads WHERE meta_id=?', [$mid])) return 0;
  $f = []; $extra = [];
  foreach ($L['field_data'] ?? [] as $fd) {
    $k = strtolower($fd['name'] ?? ''); $v = trim(implode(', ', $fd['values'] ?? []));
    if ($v === '') continue;
    if (in_array($k, ['full_name', 'name'])) $f['name'] = $v;
    elseif ($k === 'first_name') $f['first'] = $v; elseif ($k === 'last_name') $f['last'] = $v;
    elseif (in_array($k, ['phone_number', 'phone', 'mobile', 'mobile_number'])) $f['phone'] = $v;
    elseif ($k === 'email') $f['email'] = $v;
    elseif ($k === 'city') $f['city'] = $v;
    elseif (in_array($k, ['street_address', 'address'])) $f['addr'] = $v;
    else $extra[] = ucfirst(str_replace('_', ' ', $fd['name'])) . ': ' . $v;
  }
  $name = $f['name'] ?? trim(($f['first'] ?? '') . ' ' . ($f['last'] ?? '')); if ($name === '') $name = 'Meta lead ' . substr($mid, -5);
  $phone = norm_phone($f['phone'] ?? '');
  $notes = $extra;
  if ($phone !== '') { $dup = row("SELECT id,name FROM leads WHERE phone<>'' AND substr(replace(replace(phone,' ',''),'+',''),-10)=? LIMIT 1", [substr($phone, -10)]); if ($dup) array_unshift($notes, "Possible duplicate of lead #{$dup['id']} ({$dup['name']})"); }
  $camp = trim((string)($L['campaign_name'] ?? '')); $cid = null;
  if ($camp !== '') { $c = row('SELECT id FROM campaigns WHERE name=?', [$camp]); if (!$c) { q('INSERT INTO campaigns(name,platform,status,objective) VALUES(?,?,?,?)', [$camp, 'Meta', 'Active', 'Leads']); $cid = (int)db()->lastInsertId(); } else $cid = (int)$c['id']; }
  $ts = strtotime($L['created_time'] ?? '') ?: time();
  q("INSERT INTO leads(name,phone,email,city,location,address,source,campaign_id,status,added_by,notes,meta_id,meta_form,meta_ad,meta_campaign,notify,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)",
    [$name, $phone, $f['email'] ?? '', $f['city'] ?? '', $f['city'] ?? '', $f['addr'] ?? '', 'Meta Ads', $cid, 'New', 'Meta Ads', implode("\n", $notes), $mid, $form['name'] ?? '', (string)($L['ad_name'] ?? ''), $camp, gmdate('Y-m-d H:i:s', $ts), gmdate('Y-m-d H:i:s')]);
  return 1;
}

function meta_public_state() {
  $st = meta_state(); $cfg = meta_cfg();
  return ['connected' => $cfg['token'] !== '' && $cfg['page_id'] !== '', 'last_try' => $st['last_try'], 'last_ok' => $st['last_ok'], 'last_error' => $st['last_error'], 'last_new' => $st['last_new'], 'total_new' => $st['total_new'], 'running' => ($st['running'] && time() - $st['running'] < 120), 'next_due' => $st['last_try'] ? $st['last_try'] + 1800 : 0, 'now' => time()];
}

function handle_meta($a) {
  $in = body();
  if (in_array($a, ['feed', 'sync', 'ack'])) need('leads', $a !== 'feed');
  if ($a === 'feed') {
    out(['leads' => rows("SELECT id,name,phone,city,created,meta_campaign,meta_form,meta_ad,notes,source,status FROM leads WHERE notify=1 ORDER BY created DESC LIMIT 50"),
      'count' => (int)row('SELECT COUNT(*) c FROM leads WHERE notify=1')['c'], 'state' => meta_public_state()]);
  }
  if ($a === 'sync') { $r = meta_sync(!empty($in['manual']) ? 20 : 1500); out($r + ['state' => meta_public_state()]); }
  if ($a === 'ack') {
    $id = (int)($in['id'] ?? 0);
    if (!empty($in['contacted'])) q("UPDATE leads SET notify=0, status=CASE WHEN status='New' THEN 'Contacted' ELSE status END, updated=CURRENT_TIMESTAMP WHERE id=?", [$id]);
    else q('UPDATE leads SET notify=0, updated=CURRENT_TIMESTAMP WHERE id=?', [$id]);
    if (!empty($in['all'])) q('UPDATE leads SET notify=0 WHERE notify=1');
    audit('ack', 'leads', $id, !empty($in['contacted']) ? 'contacted' : 'seen'); out(['ok' => true]);
  }
  if (($_SESSION['role'] ?? '') !== 'admin') fail('Admin only', 403);
  if ($a === 'config') {
    $c = meta_cfg();
    if ($c['cron_key'] === '') { $c['cron_key'] = bin2hex(random_bytes(16)); kv_set('meta_cfg', $c); }
    out(['page_id' => $c['page_id'], 'form_ids' => $c['form_ids'], 'token_set' => $c['token'] !== '', 'token_hint' => $c['token'] !== '' ? '••••' . substr($c['token'], -4) : '', 'cron_key' => $c['cron_key'], 'state' => meta_public_state()]);
  }
  if ($a === 'save') {
    $c = meta_cfg();
    $c['page_id'] = preg_replace('/\D/', '', (string)($in['page_id'] ?? ''));
    $c['form_ids'] = preg_replace('/[^\d,\s]/', '', (string)($in['form_ids'] ?? ''));
    if (!empty($in['token'])) $c['token'] = trim((string)$in['token']);
    if (!empty($in['clear_token'])) $c['token'] = '';
    if ($c['cron_key'] === '') $c['cron_key'] = bin2hex(random_bytes(16));
    if (!empty($in['regen_key'])) $c['cron_key'] = bin2hex(random_bytes(16));
    kv_set('meta_cfg', $c); audit('meta_config', 'settings', null, 'updated'); out(['ok' => true]);
  }
  if ($a === 'test') {
    $c = meta_cfg(); if ($c['token'] === '' || $c['page_id'] === '') fail('Save the Page ID and access token first');
    [$code, $j] = graph($c, $c['page_id'], ['fields' => 'name']);
    if (isset($j['error'])) out(['ok' => false, 'error' => $j['error']['message'] ?? 'Meta API error']);
    $c = meta_page_cfg($c);
    try { $forms = graph_all($c, $c['page_id'] . '/leadgen_forms', ['fields' => 'id,name,status', 'limit' => 50], 2); }
    catch (Throwable $e) { out(['ok' => false, 'error' => 'Connected to the page, but could not read lead forms: ' . $e->getMessage() . ' (the token needs leads_retrieval and pages_manage_ads permissions)']); }
    out(['ok' => true, 'page' => $j['name'] ?? $c['page_id'], 'forms' => array_map(fn($f) => ['id' => $f['id'], 'name' => $f['name'] ?? ''], $forms)]);
  }
  fail('Unknown action', 404);
}

// Cron entry point (no session): api.php?m=meta&a=cron&key=...
function handle_meta_cron() {
  header('Content-Type: text/plain');
  $c = meta_cfg();
  if ($c['cron_key'] === '' || !hash_equals($c['cron_key'], (string)($_GET['key'] ?? ''))) { http_response_code(403); echo 'forbidden'; exit; }
  $r = meta_sync(600);
  echo isset($r['error']) ? 'ERROR ' . $r['error'] : (isset($r['skipped']) ? 'SKIPPED ' . $r['skipped'] : 'OK ' . $r['new'] . ' new');
  exit;
}
