<?php
// Email: the company mailbox (Hostinger) inside the CRM.
// Reads over IMAP (imap.hostinger.com:993, SSL) and sends over SMTP (smtp.hostinger.com:465, SSL).
// Plain sockets, no PHP imap extension needed. The mailbox password is stored encrypted (AES-256-GCM,
// key in data/mail.key) and never sent back to the browser. Only an admin can change the mailbox settings.

const MAIL_DEF = ['email' => '', 'name' => '', 'imap_host' => 'imap.hostinger.com', 'imap_port' => 993, 'smtp_host' => 'smtp.hostinger.com', 'smtp_port' => 465, 'signature' => ''];
const MAIL_PAGE = 40;

// ---------- settings & secret ----------
function mail_key() {
  $f = dirname(__DIR__) . '/data/mail.key';
  if (!is_file($f)) { file_put_contents($f, random_bytes(32), LOCK_EX); @chmod($f, 0600); }
  return file_get_contents($f);
}
function mail_enc($p) { $iv = random_bytes(12); $c = openssl_encrypt($p, 'aes-256-gcm', mail_key(), OPENSSL_RAW_DATA, $iv, $tag); return base64_encode($iv . $tag . $c); }
function mail_dec($s) { $b = base64_decode((string)$s, true); if ($b === false || strlen($b) < 29) return ''; $p = openssl_decrypt(substr($b, 28), 'aes-256-gcm', mail_key(), OPENSSL_RAW_DATA, substr($b, 0, 12), substr($b, 12, 16)); return $p === false ? '' : $p; }
function mail_cfg() { $v = json_decode((string)(row("SELECT v FROM settings WHERE k='mail_cfg'")['v'] ?? ''), true); return is_array($v) ? array_merge(MAIL_DEF, $v) : MAIL_DEF; }
function mail_ready($c) { return $c['email'] !== '' && !empty($c['pass']); }
// plain (no TLS) only for a mail server on this machine (local testing); everything else is TLS
function mail_plain($host, $port) { return in_array($host, ['127.0.0.1', 'localhost'], true) && !in_array((int)$port, [993, 465], true); }

// ---------- IMAP ----------
class MailImap {
  private $s; private $n = 0; public $caps = '';
  function __construct($host, $port, $user, $pass) {
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true, 'peer_name' => $host]]);
    $this->s = @stream_socket_client((mail_plain($host, $port) ? 'tcp://' : 'ssl://') . "$host:$port", $en, $es, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$this->s) throw new RuntimeException("Could not connect to the mail server $host:$port" . ($es ? " ($es)" : ''));
    stream_set_timeout($this->s, 40);
    $g = $this->raw();
    if (stripos($g, '* OK') !== 0 && stripos($g, '* PREAUTH') !== 0) throw new RuntimeException('Unexpected mail server greeting');
    [, $st] = $this->cmd(['LOGIN ', self::astr($user), ' ', self::astr($pass)], false);
    if (!preg_match('/^\S+ OK/i', $st)) throw new RuntimeException('Mailbox sign-in failed — check the email address and password');
    [$u] = $this->cmd('CAPABILITY'); foreach ($u as $r) if (stripos($r['t'], '* CAPABILITY') === 0) $this->caps = strtoupper($r['t']);
  }
  function __destruct() { if ($this->s) { @fwrite($this->s, 'Z LOGOUT' . "\r\n"); @fclose($this->s); } }
  // ASCII-safe → quoted string, anything else → literal
  static function astr($s) { $s = (string)$s; return preg_match('/^[\x20-\x7e]*$/', $s) ? '"' . addcslashes($s, '"\\') . '"' : ['lit' => $s]; }
  private function raw() { $l = fgets($this->s); if ($l === false) { $m = stream_get_meta_data($this->s); throw new RuntimeException($m['timed_out'] ? 'The mail server took too long to answer' : 'Lost connection to the mail server'); } return $l; }
  private function bytes($n) { $o = ''; while (strlen($o) < $n) { $c = fread($this->s, min(65536, $n - strlen($o))); if ($c === false || $c === '') throw new RuntimeException('Lost connection to the mail server'); $o .= $c; } return $o; }
  // one response: text with literals pulled out as \0N\0 markers
  private function resp() { $t = ''; $lits = [];
    while (true) { $l = $this->raw();
      if (preg_match('/\{(\d+)\+?\}\r\n$/', $l, $m)) { $t .= substr($l, 0, -strlen($m[0])) . "\0" . count($lits) . "\0"; $lits[] = $this->bytes((int)$m[1]); continue; }
      return ['t' => $t . rtrim($l, "\r\n"), 'l' => $lits]; } }
  // send a command (parts may hold literals); returns [untagged responses, tagged status line]
  function cmd($parts, $strict = true) {
    $tag = 'A' . (++$this->n); $parts = is_array($parts) ? $parts : [$parts];
    $buf = "$tag ";
    foreach ($parts as $p) {
      if (is_array($p)) { fwrite($this->s, $buf . '{' . strlen($p['lit']) . "}\r\n"); $buf = '';
        $c = $this->raw(); if ($c[0] !== '+') throw new RuntimeException('The mail server refused the request');
        $buf = $p['lit']; }
      else $buf .= $p;
    }
    fwrite($this->s, $buf . "\r\n");
    $out = [];
    while (true) { $r = $this->resp(); if (strncmp($r['t'], "$tag ", strlen($tag) + 1) === 0) { $st = $r['t']; break; } $out[] = $r; }
    if ($strict && !preg_match('/^\S+ OK/i', $st)) throw new RuntimeException('Mail server: ' . mb_substr(preg_replace('/^\S+ (NO|BAD) (\[[^\]]*\] )?/i', '', $st), 0, 160));
    return [$out, $st];
  }
  function folders() {
    [$u] = $this->cmd('LIST "" "*"'); $f = [];
    foreach ($u as $r) {
      if (!preg_match('/^\* LIST \(([^)]*)\) (?:NIL|"(?:[^"\\\\]|\\\\.)*") (.+)$/i', $r['t'], $m)) continue;
      $n = trim($m[2]);
      if (preg_match('/^\x00(\d+)\x00$/', $n, $x)) $n = $r['l'][(int)$x[1]];
      elseif ($n[0] === '"') $n = stripcslashes(substr($n, 1, -1));
      if (stripos($m[1], '\\Noselect') !== false || stripos($m[1], '\\NonExistent') !== false) continue;
      $f[] = ['id' => $n, 'flags' => $m[1]];
    }
    return $f;
  }
  function select($box, $ro = true) { [$u] = $this->cmd([$ro ? 'EXAMINE ' : 'SELECT ', self::astr($box)]); $n = 0; foreach ($u as $r) if (preg_match('/^\* (\d+) EXISTS/i', $r['t'], $m)) $n = (int)$m[1]; return $n; }
  function search($crit) { [$u] = $this->cmd(array_merge(['UID SEARCH '], $crit)); $ids = [];
    foreach ($u as $r) if (stripos($r['t'], '* SEARCH') === 0) foreach (preg_split('/\s+/', trim(substr($r['t'], 8))) as $x) if (ctype_digit($x)) $ids[] = (int)$x;
    return $ids; }
  function fetch($set, $items) { [$u] = $this->cmd("UID FETCH $set ($items)"); $o = [];
    foreach ($u as $r) { if (!preg_match('/^\* \d+ FETCH /i', $r['t'])) continue; if (!preg_match('/\bUID (\d+)/i', $r['t'], $m)) continue;
      preg_match('/\bFLAGS \(([^)]*)\)/i', $r['t'], $fl); preg_match('/\bRFC822\.SIZE (\d+)/i', $r['t'], $sz); preg_match('/\bINTERNALDATE "([^"]+)"/i', $r['t'], $dt);
      $o[(int)$m[1]] = ['uid' => (int)$m[1], 'flags' => $fl[1] ?? '', 'size' => (int)($sz[1] ?? 0), 'idate' => $dt[1] ?? '', 'lit' => $r['l'][0] ?? '', 'meta' => $r['t']]; }
    return $o; }
  function status($box) { [$u] = $this->cmd(['STATUS ', self::astr($box), ' (UNSEEN MESSAGES)']); $o = ['unseen' => 0, 'messages' => 0];
    foreach ($u as $r) { if (preg_match('/UNSEEN (\d+)/i', $r['t'], $m)) $o['unseen'] = (int)$m[1]; if (preg_match('/MESSAGES (\d+)/i', $r['t'], $m)) $o['messages'] = (int)$m[1]; } return $o; }
  function move($uids, $to) {
    if (strpos($this->caps, 'MOVE') !== false) { $this->cmd(['UID MOVE ' . implode(',', $uids) . ' ', self::astr($to)]); return; }
    $this->cmd(['UID COPY ' . implode(',', $uids) . ' ', self::astr($to)]); $this->expunge($uids);
  }
  function expunge($uids) { $this->cmd('UID STORE ' . implode(',', $uids) . ' +FLAGS.SILENT (\\Deleted)');
    if (strpos($this->caps, 'UIDPLUS') !== false) $this->cmd('UID EXPUNGE ' . implode(',', $uids)); else $this->cmd('EXPUNGE'); }
  function append($box, $msg, $flags = '(\\Seen)') { $this->cmd(['APPEND ', self::astr($box), " $flags ", ['lit' => $msg]]); }
}
function mail_imap() {
  $c = mail_cfg(); if (!mail_ready($c)) fail('The mailbox is not set up yet', 409);
  @set_time_limit(90);
  try { return new MailImap($c['imap_host'], (int)$c['imap_port'], $c['email'], mail_dec($c['pass'])); }
  catch (RuntimeException $e) { fail($e->getMessage(), 502); }
}
// folder names are modified UTF-7 on the wire
function mail_fname($n) { try { $d = @mb_convert_encoding($n, 'UTF-8', 'UTF7-IMAP'); } catch (Throwable $e) { $d = $n; } $d = $d ?: $n; return preg_replace('/^INBOX[.\/]/i', '', $d) ?: $d; }
function mail_role($f) {
  $fl = strtolower($f['flags']); $n = strtolower(mail_fname($f['id']));
  if (strtoupper($f['id']) === 'INBOX') return 'inbox';
  foreach (['sent' => ['\\sent', ['sent']], 'drafts' => ['\\drafts', ['draft']], 'junk' => ['\\junk', ['spam', 'junk']], 'trash' => ['\\trash', ['trash', 'deleted']], 'archive' => ['\\archive', ['archive']]] as $k => [$flag, $words]) {
    if (strpos($fl, $flag) !== false) return $k;
    foreach ($words as $w) if (strpos($n, $w) === 0) return $k; }
  return '';
}
function mail_special($im, $role) { foreach ($im->folders() as $f) if (mail_role($f) === $role) return $f['id']; return null; }

// ---------- MIME ----------
function mime_utf8($s, $cs) {
  $cs = strtolower(trim((string)$cs, " \"'")); if ($cs === '' || $cs === 'utf-8' || $cs === 'utf8' || $cs === 'us-ascii') return mb_check_encoding($s, 'UTF-8') ? $s : mb_convert_encoding($s, 'UTF-8', 'Windows-1252'); // raw 8-bit headers are usually Latin
  if ($cs === 'iso-8859-1' || $cs === 'latin1') $cs = 'windows-1252';
  try { $o = @mb_convert_encoding($s, 'UTF-8', $cs); if ($o !== false) return $o; } catch (Throwable $e) { }
  $o = @iconv($cs, 'UTF-8//IGNORE', $s); return $o !== false ? $o : mb_scrub($s, 'UTF-8');
}
function mime_hdec($v) { $v = trim((string)$v); if ($v === '' || strpos($v, '=?') === false) return mime_utf8($v, 'utf-8');
  $v = preg_replace('/\?=\s+=\?/', '?==?', $v); // adjacent encoded words join without the space
  return preg_replace_callback('/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/', function ($m) { $d = strtoupper($m[2]) === 'B' ? base64_decode($m[3]) : quoted_printable_decode(str_replace('_', ' ', $m[3])); return mime_utf8($d, preg_replace('/\*.*$/', '', $m[1])); }, $v); }
function mime_split($raw) { $p = strpos($raw, "\r\n\r\n"); $q = strpos($raw, "\n\n");
  if ($p === false && $q === false) return [$raw, '']; if ($p === false || ($q !== false && $q < $p)) return [substr($raw, 0, $q), substr($raw, $q + 2)]; return [substr($raw, 0, $p), substr($raw, $p + 4)]; }
function mime_heads($h) { $h = preg_replace('/\r?\n[ \t]+/', ' ', $h); $o = [];
  foreach (preg_split('/\r?\n/', $h) as $l) { $i = strpos($l, ':'); if ($i === false) continue; $k = strtolower(trim(substr($l, 0, $i))); if (!isset($o[$k])) $o[$k] = trim(substr($l, $i + 1)); } return $o; }
function mime_param($v, $name) {
  if (preg_match('/(?:^|;)\s*' . $name . '\*=([^;]*)/i', $v, $m)) { $x = trim($m[1], " \"'"); $p = explode("'", $x, 3); return count($p) === 3 ? mime_utf8(rawurldecode($p[2]), $p[0]) : rawurldecode($x); }
  if (preg_match_all('/(?:^|;)\s*' . $name . '\*(\d+)(\*?)=("[^"]*"|[^;]*)/i', $v, $mm, PREG_SET_ORDER)) { usort($mm, fn($a, $b) => (int)$a[1] - (int)$b[1]); $s = ''; $cs = '';
    foreach ($mm as $x) { $val = trim($x[3], '"'); if ($x[2] === '*') { if ((int)$x[1] === 0 && substr_count($val, "'") >= 2) { [$cs, , $val] = explode("'", $val, 3); } $val = rawurldecode($val); } $s .= $val; }
    return $cs ? mime_utf8($s, $cs) : mime_hdec($s); }
  if (preg_match('/(?:^|;)\s*' . $name . '\s*=\s*("((?:[^"\\\\]|\\\\.)*)"|[^;\s]+)/i', $v, $m)) return mime_hdec(isset($m[2]) && $m[2] !== '' ? stripcslashes($m[2]) : trim($m[1], '"'));
  return '';
}
function mime_body($b, $cte) { $cte = strtolower(trim((string)$cte)); if ($cte === 'base64') return base64_decode(preg_replace('/[^A-Za-z0-9+\/=]/', '', $b)); if ($cte === 'quoted-printable') return quoted_printable_decode($b); return $b; }
function mime_walk($raw, &$o, $depth = 0) {
  if ($depth > 12) return;
  [$hs, $b] = mime_split($raw); $h = mime_heads($hs);
  $ctv = $h['content-type'] ?? 'text/plain'; $ct = strtolower(trim(explode(';', $ctv)[0]));
  $disp = $h['content-disposition'] ?? ''; $dkind = strtolower(trim(explode(';', $disp)[0]));
  if (strpos($ct, 'multipart/') === 0) { $bd = mime_param($ctv, 'boundary'); if ($bd === '') { $o['text'] .= $b; return; }
    $parts = preg_split('/\r?\n--' . preg_quote($bd, '/') . '(?:--)?[ \t]*(?=\r?\n|$)/', "\n" . $b);
    array_shift($parts); // preamble
    foreach ($parts as $p) { $p = preg_replace('/^\r?\n/', '', $p); if (trim($p) === '' ) continue; mime_walk($p, $o, $depth + 1); }
    return; }
  $data = mime_body($b, $h['content-transfer-encoding'] ?? '');
  $fn = mime_param($disp, 'filename') ?: mime_param($ctv, 'name');
  if (($ct === 'text/plain' || $ct === 'text/html') && $dkind !== 'attachment' && $fn === '') {
    $t = mime_utf8($data, mime_param($ctv, 'charset')); if ($ct === 'text/html') $o['html'] .= $t; else $o['text'] .= ($o['text'] !== '' ? "\n\n" : '') . $t; return; }
  if ($ct === 'message/rfc822' && $fn === '') { $sub = mime_heads(mime_split($data)[0]); $fn = (mime_hdec($sub['subject'] ?? '') ?: 'message') . '.eml'; }
  $o['att'][] = ['name' => $fn !== '' ? $fn : 'attachment-' . (count($o['att']) + 1) . (($e = ['image/png' => '.png', 'image/jpeg' => '.jpg', 'image/gif' => '.gif', 'application/pdf' => '.pdf', 'text/calendar' => '.ics'][$ct] ?? '')),
    'type' => $ct, 'size' => strlen($data), 'cid' => trim($h['content-id'] ?? '', '<> '), 'inline' => $dkind === 'inline' || ($dkind === '' && !empty($h['content-id'])), 'data' => $data];
}
function mime_parse($raw) { $o = ['text' => '', 'html' => '', 'att' => []]; mime_walk($raw, $o); return $o; }
function mail_addrs($v) { $o = [];
  foreach (preg_split('/,(?=(?:[^"]*"[^"]*")*[^"]*$)/', mime_hdec($v)) as $p) { $p = trim($p); if ($p === '') continue;
    if (preg_match('/^(.*)<([^>]+)>$/', $p, $m)) $o[] = ['name' => trim($m[1], " \"'"), 'email' => strtolower(trim($m[2]))];
    elseif (preg_match('/[^\s<>"]+@[^\s<>"]+/', $p, $m)) $o[] = ['name' => '', 'email' => strtolower($m[0])]; }
  return $o; }
// remove anything active from an HTML mail (it is also shown in a sandboxed frame with scripts disabled)
function mail_clean_html($h) {
  $h = preg_replace('#<(script|iframe|object|embed|applet|frameset|frame|form|meta|link|base)\b[^>]*>(.*?</\1\s*>)?#is', '', $h);
  $h = preg_replace('#</?(script|iframe|object|embed|applet|form|meta|link|base)\b[^>]*>#i', '', $h);
  $h = preg_replace('/\son[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $h);
  $h = preg_replace('/(href|src|action|background)\s*=\s*(["\']?)\s*(javascript|vbscript|data:text\/html)[^"\'\s>]*/i', '$1=$2#', $h);
  return $h;
}
// customers / leads behind these addresses
function mail_people(array $emails) {
  $emails = array_values(array_unique(array_filter($emails))); if (!$emails) return [];
  $in = implode(',', array_fill(0, count($emails), '?')); $o = [];
  if (can('leads')) foreach (rows("SELECT id, name, LOWER(TRIM(email)) e FROM leads WHERE LOWER(TRIM(email)) IN ($in) AND COALESCE(customer_id,0)=0", $emails) as $r) $o[$r['e']] = ['kind' => 'lead', 'id' => (int)$r['id'], 'name' => $r['name']];
  if (can('customers')) foreach (rows("SELECT id, name, LOWER(TRIM(email)) e FROM customers WHERE LOWER(TRIM(email)) IN ($in)", $emails) as $r) $o[$r['e']] = ['kind' => 'customer', 'id' => (int)$r['id'], 'name' => $r['name']];
  return $o;
}

// ---------- SMTP ----------
function smtp_send($c, $from, array $rcpts, $msg) {
  $host = $c['smtp_host']; $port = (int)$c['smtp_port']; $plain = mail_plain($host, $port);
  $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true, 'peer_name' => $host]]);
  $s = @stream_socket_client(($plain || $port === 587 ? 'tcp://' : 'ssl://') . "$host:$port", $en, $es, 15, STREAM_CLIENT_CONNECT, $ctx);
  if (!$s) throw new RuntimeException("Could not connect to the outgoing mail server $host:$port");
  stream_set_timeout($s, 40);
  $rd = function ($want) use ($s) { $all = ''; do { $l = fgets($s); if ($l === false) throw new RuntimeException('Lost connection to the outgoing mail server'); $all .= $l; } while (isset($l[3]) && $l[3] === '-');
    if (!in_array((int)substr($l, 0, 3), (array)$want, true)) throw new RuntimeException('Outgoing mail server: ' . trim(mb_substr(substr($l, 4), 0, 160))); return $all; };
  $w = function ($line, $want) use ($s, $rd) { fwrite($s, $line . "\r\n"); return $rd($want); };
  $rd(220); $me = preg_replace('/[^a-z0-9.-]/i', '', $_SERVER['SERVER_NAME'] ?? 'localhost') ?: 'localhost';
  $w("EHLO $me", 250);
  if ($port === 587) { $w('STARTTLS', 220); if (!stream_socket_enable_crypto($s, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new RuntimeException('Could not start a secure connection'); $w("EHLO $me", 250); }
  $w('AUTH LOGIN', 334); $w(base64_encode($c['email']), 334);
  try { $w(base64_encode(mail_dec($c['pass'])), 235); } catch (RuntimeException $e) { throw new RuntimeException('Outgoing mail sign-in failed — check the mailbox password'); }
  $w("MAIL FROM:<$from>", 250);
  foreach ($rcpts as $r) $w("RCPT TO:<$r>", [250, 251]);
  $w('DATA', 354);
  fwrite($s, preg_replace('/^\./m', '..', $msg) . "\r\n.\r\n"); $rd(250);
  @fwrite($s, "QUIT\r\n"); @fclose($s);
}
function mail_hword($s) { return preg_match('/^[\x20-\x7e]*$/', $s) ? $s : '=?UTF-8?B?' . base64_encode($s) . '?='; }
function mail_addr_h($name, $email) { if ($name === '') return $email; $n = preg_match('/^[\x20-\x7e]*$/', $name) ? '"' . addcslashes($name, '"\\') . '"' : mail_hword($name); return "$n <$email>"; }
function mail_build($c, $to, $cc, $subject, $text, $atts, $reply) {
  $dom = substr(strrchr($c['email'], '@'), 1) ?: 'localhost'; $id = '<' . bin2hex(random_bytes(12)) . '@' . $dom . '>';
  $h = ['From: ' . mail_addr_h($c['name'], $c['email']), 'To: ' . implode(', ', $to)];
  if ($cc) $h[] = 'Cc: ' . implode(', ', $cc);
  $h[] = 'Subject: ' . mail_hword($subject); $h[] = 'Date: ' . date('r'); $h[] = "Message-ID: $id"; $h[] = 'MIME-Version: 1.0';
  if (!empty($reply['msgid'])) { $h[] = 'In-Reply-To: ' . $reply['msgid']; $h[] = 'References: ' . trim(($reply['refs'] ?? '') . ' ' . $reply['msgid']); }
  $html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1d1d1f">' . nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8')) . '</div>';
  $alt = 'B' . bin2hex(random_bytes(8));
  $body = "Content-Type: multipart/alternative; boundary=\"$alt\"\r\n\r\n--$alt\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text))
    . "--$alt\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html)) . "--$alt--\r\n";
  if ($atts) { $mix = 'M' . bin2hex(random_bytes(8)); $b = "Content-Type: multipart/mixed; boundary=\"$mix\"\r\n\r\n--$mix\r\n$body";
    foreach ($atts as $a) { $fn = str_replace(['"', "\r", "\n"], '', $a['name']); $enc = preg_match('/^[\x20-\x7e]*$/', $fn) ? "filename=\"$fn\"" : "filename*=UTF-8''" . rawurlencode($fn);
      $b .= "--$mix\r\nContent-Type: {$a['type']}; name=\"" . mail_hword($fn) . "\"\r\nContent-Disposition: attachment; $enc\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($a['data'])); }
    $body = $b . "--$mix--\r\n"; }
  [$bh, $bb] = explode("\r\n\r\n", $body, 2);
  return implode("\r\n", $h) . "\r\n" . $bh . "\r\n\r\n" . $bb;
}
function mail_list_addrs($s) { $o = []; foreach (preg_split('/[,;\s]+/', (string)$s) as $x) { $x = trim($x, " <>\"'"); if ($x === '') continue;
  if (!filter_var($x, FILTER_VALIDATE_EMAIL)) fail("Not a valid email address: $x"); $o[] = strtolower($x); } return array_values(array_unique($o)); }

// ---------- API ----------
function handle_mail($a) {
  $in = body();
  switch ($a) {
    case 'config': // GET — settings (admin sees everything except the password)
      need('email'); $c = mail_cfg();
      out(['ready' => mail_ready($c), 'email' => $c['email'], 'name' => $c['name'], 'signature' => $c['signature'],
        'admin' => is_admin() ? ['imap_host' => $c['imap_host'], 'imap_port' => (int)$c['imap_port'], 'smtp_host' => $c['smtp_host'], 'smtp_port' => (int)$c['smtp_port'], 'has_pass' => !empty($c['pass'])] : null]);

    case 'setup': // admin: save + test the mailbox
      if (!is_admin()) fail('Only an admin can change the mailbox settings', 403);
      $c = mail_cfg(); $old = $c;
      $email = strtolower(trim((string)($in['email'] ?? ''))); if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Enter the mailbox email address');
      foreach (['imap_host', 'smtp_host'] as $k) { $v = strtolower(trim((string)($in[$k] ?? $c[$k]))); if (!preg_match('/^[a-z0-9.-]{3,100}$/', $v)) fail('Server name is not valid'); $c[$k] = $v; }
      foreach (['imap_port', 'smtp_port'] as $k) { $v = (int)($in[$k] ?? $c[$k]); if ($v < 1 || $v > 65535) fail('Port is not valid'); $c[$k] = $v; }
      $c['email'] = $email; $c['name'] = mb_substr(trim((string)($in['name'] ?? '')), 0, 80); $c['signature'] = mb_substr(trim((string)($in['signature'] ?? '')), 0, 2000);
      $pw = (string)($in['password'] ?? '');
      if ($pw !== '') $c['pass'] = mail_enc($pw);
      elseif ($email !== $old['email'] || $c['imap_host'] !== $old['imap_host']) { if (empty($c['pass'])) fail('Enter the mailbox password'); }
      if (empty($c['pass'])) fail('Enter the mailbox password');
      @set_time_limit(90);
      try { $im = new MailImap($c['imap_host'], $c['imap_port'], $c['email'], mail_dec($c['pass'])); $im->status('INBOX'); unset($im); }
      catch (RuntimeException $e) { fail('Not saved — ' . $e->getMessage(), 400); }
      kv_set('mail_cfg', $c); q("DELETE FROM settings WHERE k='mail_unread'");
      audit('mail_setup', 'settings', null, $email);
      out(['ok' => true]);

    case 'remove': // admin: disconnect the mailbox (forgets the password)
      if (!is_admin()) fail('Only an admin can change the mailbox settings', 403);
      $c = mail_cfg(); unset($c['pass']); kv_set('mail_cfg', $c); audit('mail_remove', 'settings', null, $c['email']); out(['ok' => true]);

    case 'folders':
      need('email'); $im = mail_imap(); $o = [];
      foreach ($im->folders() as $f) { $r = mail_role($f); $st = ($r === 'inbox' || $r === 'junk' || $r === '') ? $im->status($f['id']) : ['unseen' => 0];
        $o[] = ['id' => $f['id'], 'name' => $r === 'inbox' ? 'Inbox' : mail_fname($f['id']), 'role' => $r, 'unseen' => $st['unseen']]; }
      $ord = ['inbox' => 0, 'drafts' => 1, 'sent' => 2, 'archive' => 3, 'junk' => 4, 'trash' => 5, '' => 6];
      usort($o, fn($x, $y) => [$ord[$x['role']], $x['name']] <=> [$ord[$y['role']], $y['name']]);
      foreach ($o as $f) if ($f['role'] === 'inbox') kv_set('mail_unread', ['n' => $f['unseen'], 't' => time()]);
      out($o);

    case 'list':
      need('email'); $box = (string)($_GET['folder'] ?? 'INBOX'); $page = max(1, (int)($_GET['page'] ?? 1)); $qq = trim((string)($_GET['q'] ?? '')); $only = $_GET['only'] ?? '';
      $im = mail_imap(); $total = $im->select($box);
      if (!$total) out(['total' => 0, 'page' => 1, 'pages' => 1, 'items' => []]);
      $crit = $only === 'unread' ? ['UNSEEN'] : ['ALL'];
      if ($qq !== '') { $s = MailImap::astr(mb_substr($qq, 0, 100)); $crit = is_array($s) ? ['CHARSET UTF-8 OR OR FROM ', $s, ' SUBJECT ', $s, ' TO ', $s] : ["OR OR FROM $s SUBJECT $s TO $s"]; if ($only === 'unread') $crit[] = ' UNSEEN'; }
      $ids = $im->search($crit); rsort($ids); $n = count($ids); $pages = max(1, (int)ceil($n / MAIL_PAGE)); $page = min($page, $pages);
      $slice = array_slice($ids, ($page - 1) * MAIL_PAGE, MAIL_PAGE);
      $items = []; $emails = [];
      if ($slice) foreach ($im->fetch(implode(',', $slice), 'UID FLAGS RFC822.SIZE INTERNALDATE BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE CONTENT-TYPE)]') as $u => $m) {
        $h = mime_heads($m['lit']); $fr = mail_addrs($h['from'] ?? ''); $to = mail_addrs($h['to'] ?? '');
        $ts = strtotime($h['date'] ?? '') ?: strtotime($m['idate']) ?: 0;
        $items[] = ['uid' => $u, 'from' => $fr[0] ?? ['name' => '', 'email' => ''], 'to' => $to, 'subject' => mb_substr(mime_hdec($h['subject'] ?? ''), 0, 300), 'date' => $ts ? gmdate('c', $ts) : '',
          'seen' => stripos($m['flags'], '\\Seen') !== false, 'flagged' => stripos($m['flags'], '\\Flagged') !== false, 'answered' => stripos($m['flags'], '\\Answered') !== false,
          'att' => (bool)preg_match('/"(attachment|filename)"/i', $m['meta']), 'size' => $m['size']]; // att: a real file part (from BODYSTRUCTURE)
        foreach (array_merge($fr, $to) as $x) $emails[] = $x['email'];
      }
      usort($items, fn($x, $y) => $y['uid'] <=> $x['uid']);
      out(['total' => $n, 'page' => $page, 'pages' => $pages, 'items' => $items, 'people' => mail_people($emails)]);

    case 'get':
      need('email'); $box = (string)($_GET['folder'] ?? 'INBOX'); $uid = (int)($_GET['uid'] ?? 0);
      $im = mail_imap(); $im->select($box, false); $f = $im->fetch($uid, 'UID FLAGS RFC822.SIZE BODY.PEEK[]'); if (!isset($f[$uid])) fail('Message not found', 404);
      $raw = $f[$uid]['lit']; if (stripos($f[$uid]['flags'], '\\Seen') === false) $im->cmd("UID STORE $uid +FLAGS.SILENT (\\Seen)");
      [$hs] = mime_split($raw); $h = mime_heads($hs); $p = mime_parse($raw);
      $html = $p['html'];
      $remote = 0; if ($html !== '') { $html = mail_clean_html($html); $html = preg_replace('~<img\b[^>]*\ssrc\s*=\s*["\']?\s*(https?:)?//[^>]*>~i', '', $html, -1, $remote); $budget = 4 * 1024 * 1024; // internet pictures (tracking) are not shown
        foreach ($p['att'] as $at) if ($at['cid'] !== '' && $at['size'] < $budget && strpos($at['type'], 'image/') === 0) { // inline images become data: URIs
          $u = 'data:' . $at['type'] . ';base64,' . base64_encode($at['data']); $budget -= $at['size'];
          $html = str_ireplace(['cid:' . $at['cid'] . '"', "cid:" . $at['cid'] . "'"], [$u . '"', $u . "'"], $html); } }
      $fr = mail_addrs($h['from'] ?? ''); $to = mail_addrs($h['to'] ?? ''); $cc = mail_addrs($h['cc'] ?? ''); $rt = mail_addrs($h['reply-to'] ?? '');
      $att = []; foreach ($p['att'] as $i => $at) if (!($at['inline'] && $at['cid'] !== '' && $html !== '' && stripos($p['html'], 'cid:' . $at['cid']) !== false)) $att[] = ['i' => $i, 'name' => $at['name'], 'type' => $at['type'], 'size' => $at['size']];
      out(['uid' => $uid, 'subject' => mime_hdec($h['subject'] ?? ''), 'from' => $fr[0] ?? ['name' => '', 'email' => ''], 'to' => $to, 'cc' => $cc, 'reply_to' => $rt[0] ?? null,
        'date' => ($t = strtotime($h['date'] ?? '')) ? gmdate('c', $t) : '', 'msgid' => trim($h['message-id'] ?? ''), 'refs' => mb_substr(trim($h['references'] ?? ''), 0, 2000),
        'text' => mb_substr($p['text'], 0, 400000), 'html' => mb_substr($html, 0, 3000000), 'att' => $att, 'remote' => $remote > 0, 'flagged' => stripos($f[$uid]['flags'], '\\Flagged') !== false,
        'people' => mail_people(array_column(array_merge($fr, $to, $cc), 'email'))]);

    case 'att': // GET — download one attachment
      need('email'); $box = (string)($_GET['folder'] ?? 'INBOX'); $uid = (int)($_GET['uid'] ?? 0); $i = (int)($_GET['i'] ?? -1);
      $im = mail_imap(); $im->select($box); $f = $im->fetch($uid, 'UID BODY.PEEK[]'); if (!isset($f[$uid])) fail('Message not found', 404);
      $p = mime_parse($f[$uid]['lit']); $at = $p['att'][$i] ?? null; if (!$at) fail('Attachment not found', 404);
      audit('mail_att', 'mail', $uid, $at['name']);
      header_remove('Content-Type'); header('Content-Type: application/octet-stream'); header('X-Content-Type-Options: nosniff'); header('Cache-Control: private, no-store');
      header("Content-Disposition: attachment; filename=\"" . str_replace(['"', "\r", "\n"], '', preg_replace('/[^\x20-\x7e]/', '_', $at['name'])) . "\"; filename*=UTF-8''" . rawurlencode($at['name']));
      header('Content-Length: ' . strlen($at['data'])); echo $at['data']; exit;

    case 'flag':
      need('email', true); $box = (string)($in['folder'] ?? 'INBOX'); $uids = array_values(array_filter(array_map('intval', (array)($in['uids'] ?? [])))); if (!$uids) fail('Nothing selected');
      $fl = ['seen' => '\\Seen', 'flagged' => '\\Flagged'][$in['flag'] ?? ''] ?? null; if (!$fl) fail('Unknown flag');
      $im = mail_imap(); $im->select($box, false); $im->cmd('UID STORE ' . implode(',', $uids) . ' ' . (!empty($in['on']) ? '+' : '-') . "FLAGS.SILENT ($fl)");
      q("DELETE FROM settings WHERE k='mail_unread'"); out(['ok' => true]);

    case 'move': // to another folder; 'trash' = delete (from Trash itself = delete forever)
      need('email', true); $box = (string)($in['folder'] ?? 'INBOX'); $uids = array_values(array_filter(array_map('intval', (array)($in['uids'] ?? [])))); if (!$uids) fail('Nothing selected');
      $im = mail_imap(); $to = (string)($in['to'] ?? '');
      if ($to === 'trash') { $t = mail_special($im, 'trash'); $im->select($box, false);
        if (!$t || $t === $box) { $im->expunge($uids); audit('mail_delete', 'mail', null, count($uids) . ' message(s) deleted forever from ' . mail_fname($box)); out(['ok' => true, 'forever' => true]); }
        $im->move($uids, $t); audit('mail_delete', 'mail', null, count($uids) . ' message(s) moved to Trash'); out(['ok' => true]); }
      $ok = false; foreach ($im->folders() as $f) if ($f['id'] === $to) $ok = true; if (!$ok) fail('Folder not found');
      $im->select($box, false); $im->move($uids, $to); q("DELETE FROM settings WHERE k='mail_unread'"); out(['ok' => true]);

    case 'unread': // GET — sidebar badge (cached a minute)
      need('email'); $c = mail_cfg(); if (!mail_ready($c)) out(['unread' => 0, 'ready' => false]);
      $u = json_decode((string)(row("SELECT v FROM settings WHERE k='mail_unread'")['v'] ?? ''), true);
      if (is_array($u) && time() - (int)$u['t'] < 60) out(['unread' => (int)$u['n'], 'ready' => true]);
      try { $im = new MailImap($c['imap_host'], (int)$c['imap_port'], $c['email'], mail_dec($c['pass'])); $n = $im->status('INBOX')['unseen']; } catch (RuntimeException $e) { out(['unread' => 0, 'ready' => true, 'problem' => $e->getMessage()]); }
      kv_set('mail_unread', ['n' => $n, 't' => time()]); out(['unread' => $n, 'ready' => true]);

    case 'send':
      need('email', true); $c = mail_cfg(); if (!mail_ready($c)) fail('The mailbox is not set up yet', 409);
      $j = json_decode((string)($_POST['data'] ?? ''), true); if (!is_array($j)) fail('Bad request');
      $to = mail_list_addrs($j['to'] ?? ''); $cc = mail_list_addrs($j['cc'] ?? ''); $bcc = mail_list_addrs($j['bcc'] ?? '');
      if (!$to) fail('Add at least one recipient'); if (count($to) + count($cc) + count($bcc) > 50) fail('Too many recipients (max 50)');
      $subject = mb_substr(trim(str_replace(["\r", "\n"], ' ', (string)($j['subject'] ?? ''))), 0, 250);
      $text = str_replace("\r\n", "\n", mb_substr((string)($j['body'] ?? ''), 0, 200000)); $text = str_replace("\n", "\r\n", $text);
      $atts = []; $total = 0;
      // files picked on this computer
      $up = $_FILES['att'] ?? null;
      if ($up && is_array($up['name'])) for ($i = 0; $i < count($up['name']); $i++) { if ($up['error'][$i] === UPLOAD_ERR_NO_FILE) continue;
        $fl = ['name' => $up['name'][$i], 'type' => $up['type'][$i], 'tmp_name' => $up['tmp_name'][$i], 'error' => $up['error'][$i], 'size' => $up['size'][$i]];
        $ext = sec_upload($fl, ['image', 'pdf', 'office'], 20); $d = file_get_contents($fl['tmp_name']); $total += strlen($d);
        $atts[] = ['name' => basename((string)$fl['name']), 'type' => (function_exists('mime_content_type') ? @mime_content_type($fl['tmp_name']) : '') ?: 'application/octet-stream', 'data' => $d]; }
      // documents already in the CRM (e.g. the warranty card)
      foreach (array_slice(array_map('intval', (array)($j['file_ids'] ?? [])), 0, 20) as $fid) {
        need('files'); $f = row('SELECT * FROM files WHERE id=?', [$fid]); if (!$f) continue; $p = dirname(__DIR__) . '/data/uploads/' . basename($f['path']); if (!is_file($p)) continue;
        $d = file_get_contents($p); $total += strlen($d); $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
        $atts[] = ['name' => $f['name'], 'type' => ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'][$ext] ?? 'application/octet-stream', 'data' => $d]; }
      // forwarding: the original message's attachments go along
      if (is_array($j['fwd'] ?? null) && !empty($j['fwd']['uid'])) {
        try { $im0 = new MailImap($c['imap_host'], (int)$c['imap_port'], $c['email'], mail_dec($c['pass'])); $im0->select((string)($j['fwd']['folder'] ?? 'INBOX')); $f0 = $im0->fetch((int)$j['fwd']['uid'], 'UID BODY.PEEK[]'); unset($im0);
          $p0 = mime_parse($f0 ? reset($f0)['lit'] : ''); foreach ($p0['att'] as $at) if (!($at['inline'] && $at['cid'] !== '')) { $total += $at['size']; $atts[] = ['name' => $at['name'], 'type' => $at['type'], 'data' => $at['data']]; } }
        catch (RuntimeException $e) { fail('Could not attach the original files — ' . $e->getMessage(), 502); } }
      foreach ($atts as &$x) if (!preg_match('~^[a-z0-9.+-]+/[a-z0-9.+-]+$~i', (string)$x['type'])) $x['type'] = 'application/octet-stream'; unset($x);
      if ($total > 24 * 1024 * 1024) fail('Attachments are too large (max 24 MB in total)');
      $reply = is_array($j['reply'] ?? null) ? ['msgid' => preg_match('/^<[^<>\s]{3,250}>$/', (string)($j['reply']['msgid'] ?? '')) ? $j['reply']['msgid'] : '', 'refs' => preg_replace('/[^\x21-\x7e ]/', '', mb_substr((string)($j['reply']['refs'] ?? ''), 0, 2000))] : null;
      $msg = mail_build($c, $to, $cc, $subject, $text, $atts, $reply);
      @set_time_limit(120);
      try { smtp_send($c, $c['email'], array_merge($to, $cc, $bcc), $msg); } catch (RuntimeException $e) { fail($e->getMessage(), 502); }
      $saved = true; // keep a copy in Sent, and mark the original answered
      try { $im = new MailImap($c['imap_host'], (int)$c['imap_port'], $c['email'], mail_dec($c['pass'])); $sent = mail_special($im, 'sent'); if ($sent) $im->append($sent, $msg); else $saved = false;
        if ($reply && !empty($j['reply']['uid']) && !empty($j['reply']['folder'])) { $im->select((string)$j['reply']['folder'], false); $im->cmd('UID STORE ' . (int)$j['reply']['uid'] . ' +FLAGS.SILENT (\\Answered)'); } }
      catch (Throwable $e) { $saved = false; }
      $ppl = mail_people($to); $who = array_values($ppl)[0] ?? null;
      audit('mail_send', $who ? ($who['kind'] === 'customer' ? 'customers' : 'leads') : 'mail', $who['id'] ?? null, mb_substr($subject, 0, 120) . ' → ' . implode(', ', $to) . ($atts ? ' · ' . count($atts) . ' attachment(s)' : ''));
      out(['ok' => true, 'saved' => $saved]);
  }
  fail('Unknown action', 404);
}
