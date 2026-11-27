<?php
/* Signed quotations: an admin adds the seal and signature to a quotation, and the signed PDF is kept with it (quote_sign.file in data/uploads).
   This file holds the shared helpers; the actions (ask to sign, upload the signed copy, share) are added here by the later steps. */

function qs_canon($v) {
  if (!is_array($v)) return $v;
  if (array_is_list($v)) return array_map('qs_canon', $v);
  ksort($v, SORT_STRING);
  return array_map('qs_canon', $v);
}
/* the version of a quotation's content: seal and number do not count, so putting the seal on (or the number) does not change it */
function qs_ver(array $doc): string {
  unset($doc['seal'], $doc['number']);
  return sha1((string)json_encode(qs_canon($doc), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION));
}
function qs_row(int $qid): ?array { return row('SELECT * FROM quote_sign WHERE quote_id=?', [$qid]) ?: null; }
function qs_state(?array $row): string {
  if (!$row) return '';
  if ((string)($row['file'] ?? '') !== '') return 'signed';
  return (int)($row['req_by'] ?? 0) > 0 ? 'waiting' : '';
}
function qs_doc($q): array { $d = json_decode((string)($q['doc'] ?? ''), true); return is_array($d) ? $d : []; }
/* a signing row as it counts: a signed file made from other content than the stored doc (the content changed and the file was not taken off
   with it) counts as no row at all — never shown as signed, handed out, shared or copied into Documents */
function qs_cur(?array $s, array $doc): ?array {
  return $s && (string)($s['file'] ?? '') !== '' && !hash_equals(qs_ver($doc), (string)($s['ver'] ?? '')) ? null : $s;
}
/* the quotation's signed copy while it still matches the quotation (else null). $quote: the quotes row with its doc, when already loaded */
function qs_live(int $qid, ?array $quote = null): ?array {
  $quote = $quote ?? row('SELECT doc FROM quotes WHERE id=?', [$qid]) ?: [];
  $s = qs_cur(qs_row($qid), qs_doc($quote));
  return qs_state($s) === 'signed' ? $s : null;
}
/* the seal goes into the stored doc only (updated / edit_by stay as they were); $raw is the doc decoded as objects, so an empty {} stays {} */
function qs_seal_put(int $qid, stdClass $raw): void {
  $raw->seal = true; q('UPDATE quotes SET doc=? WHERE id=?', [json_encode($raw, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION), $qid]);
}
function qs_out(int $qid, ?array $quote = null): array {
  $quote = $quote ?? row('SELECT doc FROM quotes WHERE id=?', [$qid]) ?: [];
  $doc = qs_doc($quote); $s = qs_cur(qs_row($qid), $doc);
  $nm = fn($id) => (int)$id ? (string)(row('SELECT name FROM users WHERE id=?', [(int)$id])['name'] ?? '') : '';
  return ['state' => qs_state($s), 'ver' => qs_ver($doc), 'signed_at' => (string)($s['signed_at'] ?? ''), 'signed_by' => (int)($s['signed_by'] ?? 0), 'signed_name' => $nm($s['signed_by'] ?? 0),
    'req_by' => (int)($s['req_by'] ?? 0), 'req_name' => $nm($s['req_by'] ?? 0), 'req_at' => (string)($s['req_at'] ?? ''), 'file_name' => (string)($s['name'] ?? ''), 'sealed' => ($doc['seal'] ?? false) === true];
}
function qs_admins(): array {
  return array_map('intval', array_column(rows("SELECT id FROM users WHERE role='admin' AND active=1 AND COALESCE(deleted,0)=0 ORDER BY id"), 'id'));
}
/* removes the signing and share records of the quotations matching $w (a WHERE on quotes); call it before the quotes rows go, after trash_put kept them */
function qs_purge_where(string $w, array $p): void {
  q("DELETE FROM quote_sign WHERE quote_id IN (SELECT id FROM quotes WHERE $w)", $p);
  q("DELETE FROM quote_log WHERE quote_id IN (SELECT id FROM quotes WHERE $w)", $p);
}

/* the customer's Documents copy of a signed quotation (files.gen 'quote:<id>', kept until deleted): a separate file, so the Documents page and the quotation
   can each be deleted without touching the other. qs_doc_make copies the stored signed file and returns the new file name ('' when the copy failed);
   qs_doc_put swaps the row in, replacing the older copy of the same quotation like `files keep` does. Used by sign, by `files keep` and by a Recycle bin restore. */
function qs_doc_make(string $file, string $from = ''): string { /* $from: the folder the signed file is in now (the Recycle bin's, on a restore) */
  $dir = up_dir(); $copy = bin2hex(random_bytes(12)) . '.pdf';
  return @copy(($from ?: $dir) . '/' . basename($file), "$dir/$copy") ? $copy : '';
}
function qs_doc_put(int $qid, int $cid, string $no, string $copy, string $fname, int $size): int {
  $dir = up_dir(); $key = "quote:$qid";
  foreach (rows('SELECT id, path FROM files WHERE customer_id=? AND gen=?', [$cid, $key]) as $o) { @unlink("$dir/" . basename($o['path'])); q('DELETE FROM files WHERE id=?', [$o['id']]); }
  q('INSERT INTO files(customer_id,kind,item,name,path,size,user,life,gen) VALUES(?,?,?,?,?,?,?,?,?)', [$cid, 'gen', "Quotation $no · signed", $fname, $copy, $size, $_SESSION['username'] ?? '', 0, $key]);
  return (int)db()->lastInsertId();
}
/* the quotation's signed file leaves it: to the Recycle bin, the quote_sign row goes (no row = nothing signed or asked), and the customer's Documents copy
   goes back to the normal keeping time, counted from today (files.life is measured from files.created, so that is restarted too), no longer named signed */
const QS_BIN = 'Signed quotation'; /* the Recycle bin kind of a signed copy taken off its quotation (restored only through qs_restore_check) */
function qs_unsign(int $id, string $no, string $nm, int $fromLead): void {
  trash_put(QS_BIN, "$no · $nm", [['quote_sign', 'quote_id=?', [$id]]]);
  q('DELETE FROM quote_sign WHERE quote_id=?', [$id]);
  q("UPDATE files SET life=?, created=CURRENT_TIMESTAMP, item=? WHERE gen=?", [$fromLead ? LEAD_QUOTE_DOC_DAYS : rule('gen_days'), "Quotation $no", "quote:$id"]);
}
/* Recycle bin › Restore of a signed copy (api/trash.php trash_restore), before anything is written: it goes back only onto the quotation it was made
   from, unchanged since — the quotation is there, has no signed copy now, and its content has the version the file was made from (else 409, nothing
   restored). The customer's Documents copy is made here from the file in the bin, so a failure leaves nothing half done. Gives qs_restore_done's list. */
function qs_restore_check(array $d): array {
  $o = [];
  foreach ($d['rows'] ?? [] as [$tb, $rs]) { if ($tb !== 'quote_sign') continue;
    foreach ($rs as $r) {
      $qid = (int)($r['quote_id'] ?? 0); $f = basename((string)($r['file'] ?? ''));
      $qt = row('SELECT id,number,doc,customer_id FROM quotes WHERE id=?', [$qid]); $raw = $qt ? json_decode((string)$qt['doc']) : null;
      if (!$qt || !($raw instanceof stdClass) || qs_state(qs_row($qid)) === 'signed' || !hash_equals(qs_ver(qs_doc($qt)), (string)($r['ver'] ?? ''))) fail('This signed copy no longer matches the quotation — sign it again', 409);
      if ($f === '' || !is_file(trash_dir() . "/$f")) fail('The signed file is not in the Recycle bin any more — sign the quotation again', 409);
      $o[] = ['id' => $qid, 'raw' => $raw, 'no' => (string)$qt['number'], 'cid' => (int)$qt['customer_id'], 'file' => $f, 'name' => (string)($r['name'] ?? ''), 'size' => (int)($r['size'] ?? 0), 'copy' => ''];
    }
  }
  foreach ($o as $i => $x) if ($x['cid'] > 0) {
    $o[$i]['copy'] = qs_doc_make($x['file'], trash_dir());
    if ($o[$i]['copy'] === '') { qs_restore_done($o, false); error_log("quote_sign: could not copy the restored signed PDF of quotation {$x['id']} into Documents"); fail('Could not put the signed copy back in the customer Documents. Nothing was restored - please try again', 500); }
  }
  return $o;
}
/* after the restore ($ok, rows and file back): the stored doc gets the seal, as `sign` does, and the customer's Documents copy is the signed file again
   (life 0, "Quotation <no> · signed"). !$ok: the restore failed, the copies made for it go. */
function qs_restore_done(array $o, bool $ok): void {
  foreach ($o as $x) {
    if (!$ok) { if ($x['copy'] !== '') @unlink(up_dir() . '/' . $x['copy']); continue; }
    qs_seal_put($x['id'], $x['raw']);
    if ($x['copy'] !== '') qs_doc_put($x['id'], $x['cid'], $x['no'], $x['copy'], $x['name'], $x['size']);
  }
}
/* after a save (api/quotemaker.php): what a change does to a signed quotation. $old / $new are the stored docs before and after (seal already decided).
   A non-admin change of the content takes the signature off and tells the admins; an admin who unticks the seal, or changes the content, takes the
   old signed file off with no message (the browser uploads a fresh signed PDF right after a ticked save). Same content and seal kept: nothing happens. */
function qs_after_save(int $id, array $old, array $new, bool $admin): void {
  if (qs_state(qs_row($id)) !== 'signed') return;
  $same = qs_ver($old) === qs_ver($new); $sealed = ($new['seal'] ?? false) === true;
  if ($admin ? ($sealed && $same) : $same) return;
  $qt = row('SELECT q.number,q.lead_id,q.customer_id,c.name AS cname,l.name AS lname FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id LEFT JOIN leads l ON l.id=q.lead_id WHERE q.id=?', [$id]);
  if (!$qt) return;
  $no = (string)$qt['number']; $nm = (string)($qt['cname'] ?: $qt['lname'] ?: '');
  qs_unsign($id, $no, $nm, (int)$qt['lead_id'] > 0 ? 1 : 0);
  if ($admin) return;
  $who = (string)(row('SELECT name FROM users WHERE id=?', [uid()])['name'] ?? '');
  foreach (qs_admins() as $ad) notif_from_me($ad, 'sign_lost', "Quotation $no · $nm was changed after signing by $who — sign it again", ['quote_id' => $id, 'lead_id' => (int)$qt['lead_id'], 'customer_id' => (int)$qt['customer_id']]);
  audit('quote_sign_lost', 'quotes', $id, $no);
}

/* the wording of the mails / WhatsApp texts that go with a signed quotation: stored once for the whole team (settings key qm_share_tpl), these are the defaults.
   Placeholders: {name} {quote_no} {amount} {date} {company} {sender} {sender_phone} */
const QS_TPL_DEFAULT = [
  'cust_subject' => 'Signed quotation {quote_no} – rooftop solar plant – {company}',
  'cust_body' => "Dear {name},\n\nPlease find attached our signed quotation {quote_no} dated {date} for ₹{amount}.\n\nRegards,\n{sender}\n{company}\n{sender_phone}",
  'bank_subject' => 'Signed quotation {quote_no} – rooftop solar plant of {name} – {company}',
  'bank_body' => "Dear Sir/Madam,\n\nPlease find attached the signed quotation {quote_no} dated {date} for ₹{amount} for the rooftop solar plant of our customer {name}, for the loan application.\n\nRegards,\n{sender}\n{company}\n{sender_phone}",
];
/* the stored wording over the defaults; keys that are not templates are dropped */
function qs_tpl(): array {
  $st = kv_get('qm_share_tpl', []); $o = [];
  foreach (QS_TPL_DEFAULT as $k => $def) $o[$k] = isset($st[$k]) && is_string($st[$k]) && trim($st[$k]) !== '' ? $st[$k] : $def;
  return $o;
}

/* the actions: POST qm sign_req / sign_cancel, GET qm sign_info (routed here from handle_qm) */
function qs_handle(string $a, array $in): void {
  switch ($a) {
    case 'sign_req': {
      need('quotes', true);
      $id = (int)($in['id'] ?? 0);
      $qt = row('SELECT q.id,q.number,q.doc,q.lead_id,q.customer_id,c.name AS cname,l.name AS lname FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id LEFT JOIN leads l ON l.id=q.lead_id WHERE q.id=?', [$id]);
      if (!$qt) fail('Quotation not found', 404);
      if (!qs_doc($qt)) fail('Open this quotation in the Quotation maker and save it first');
      $cur = qs_row($id);
      if (qs_state($cur) === 'signed') fail('already signed', 409);
      if (is_admin()) out(['ok' => true, 'sign' => qs_out($id, $qt)]); /* an admin signs directly: nothing to ask */
      if (qs_state($cur) === 'waiting') out(['ok' => true, 'sign' => qs_out($id, $qt)]);
      q("INSERT INTO quote_sign(quote_id,req_by,req_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(quote_id) DO UPDATE SET req_by=excluded.req_by, req_at=excluded.req_at", [$id, uid()]);
      $who = (string)(row('SELECT name FROM users WHERE id=?', [uid()])['name'] ?? '');
      $nm = (string)($qt['cname'] ?: $qt['lname'] ?: '');
      foreach (qs_admins() as $ad) notif_from_me($ad, 'sign_req', "$who asks you to sign quotation {$qt['number']} · $nm", ['quote_id' => $id, 'lead_id' => (int)$qt['lead_id'], 'customer_id' => (int)$qt['customer_id']]);
      audit('quote_sign_req', 'quotes', $id, (string)$qt['number']);
      out(['ok' => true, 'sign' => qs_out($id, $qt)]);
    }
    case 'sign_cancel': {
      need('quotes', true);
      $id = (int)($in['id'] ?? 0);
      $qt = row('SELECT id,number,doc FROM quotes WHERE id=?', [$id]);
      if (!$qt) fail('Quotation not found', 404);
      $cur = qs_row($id); $st = qs_state($cur);
      if ($st === 'signed') fail('already signed', 409);
      if ($st === 'waiting') {
        if (!is_admin() && (int)$cur['req_by'] !== uid()) fail('Only the person who asked, or an admin, can cancel this request', 403);
        q('DELETE FROM quote_sign WHERE quote_id=? AND COALESCE(file,\'\')=\'\'', [$id]);
        audit('quote_sign_cancel', 'quotes', $id, (string)$qt['number']);
      }
      out(['ok' => true, 'sign' => qs_out($id, $qt)]);
    }
    case 'sign': {
      if (!is_admin()) fail('Only an admin can sign a quotation', 403);
      $id = (int)($in['id'] ?? 0);
      $qt = row('SELECT q.id,q.number,q.doc,q.lead_id,q.customer_id,q.made_by,c.name AS cname,l.name AS lname FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id LEFT JOIN leads l ON l.id=q.lead_id WHERE q.id=?', [$id]);
      if (!$qt) fail('Quotation not found', 404);
      $doc = qs_doc($qt);
      if (!$doc) fail('Open this quotation in the Quotation maker and save it first');
      $rawDoc = json_decode((string)$qt['doc']);
      if (!($rawDoc instanceof stdClass)) fail('This quotation cannot be signed'); /* the seal is written into the stored doc, so it has to be a JSON object */
      $ver = qs_ver($doc);
      if (!hash_equals($ver, (string)($in['ver'] ?? ''))) out(['error' => 'This quotation was changed — open it again', 'quiet' => 0], 409);
      $fl = $_FILES['file'] ?? null; sec_upload($fl, ['pdf'], 25);
      $no = (string)$qt['number']; $nm = (string)($qt['cname'] ?: $qt['lname'] ?: '');
      $fname = mb_substr(trim(preg_replace('~[\\\\/:*?"<>|\x00-\x1f]+~', '-', basename((string)$fl['name']))), 0, 190); if (!preg_match('/\.pdf$/i', $fname)) $fname = ($fname === '' ? "Quotation $no" : $fname) . '.pdf';
      $dir = up_dir(); $file = bin2hex(random_bytes(12)) . '.pdf';
      if (!move_uploaded_file($fl['tmp_name'], "$dir/$file")) fail('Could not save file', 500);
      $cid = (int)$qt['customer_id']; $copy = '';
      if ($cid > 0) { /* the customer's Documents keep their own copy: made first, so a failure leaves nothing half done */
        $copy = qs_doc_make($file);
        if ($copy === '') { @unlink("$dir/$file"); error_log("quote_sign: could not copy the signed PDF of quotation $id into Documents"); fail('Could not save the signed copy to the customer Documents. Nothing was changed - please try again', 500); }
      }
      $old = qs_row($id); $had = qs_state($old) === 'signed'; $reqBy = (int)($old['req_by'] ?? 0);
      if ($old) { if ($had) trash_put(QS_BIN, "$no · $nm", [['quote_sign', 'quote_id=?', [$id]]]); q('DELETE FROM quote_sign WHERE quote_id=?', [$id]); }
      q('INSERT INTO quote_sign(quote_id,req_by,req_at,signed_by,signed_at,file,name,size,ver) VALUES(?,NULL,NULL,?,CURRENT_TIMESTAMP,?,?,?,?)', [$id, uid(), $file, $fname, (int)$fl['size'], $ver]);
      qs_seal_put($id, $rawDoc);
      if ($copy !== '') qs_doc_put($id, $cid, $no, $copy, $fname, (int)$fl['size']);
      $who = (string)(row('SELECT name FROM users WHERE id=?', [uid()])['name'] ?? '');
      /* resign: the admin's browser signs again right after its own save changed a signed quotation (that save already took the old signed copy off,
         so no signed row is left); it only changes the wording of the notification */
      $existed = $had || !empty($in['resign']);
      $txt = $existed ? "$who updated the signed quotation $no · $nm" : "$who added the seal & signature to quotation $no · $nm";
      foreach (array_unique([(int)$qt['made_by'], $reqBy]) as $to) notif_from_me($to, 'signed', $txt, ['quote_id' => $id, 'lead_id' => (int)$qt['lead_id'], 'customer_id' => $cid]);
      audit('quote_sign', 'quotes', $id, $no);
      out(['ok' => true, 'sign' => qs_out($id)]);
    }
    case 'signed': {
      need('quotes');
      $id = (int)($_GET['id'] ?? $in['id'] ?? 0);
      $qt = row('SELECT id,doc FROM quotes WHERE id=?', [$id]);
      if (!$qt) fail('Quotation not found', 404);
      $s = qs_live($id, $qt);
      if (!$s) fail('This quotation is not signed', 404);
      serve_file(up_dir() . '/' . basename((string)$s['file']), (string)$s['name'], ['download' => !empty($_GET['dl']), 'cache' => 'private, no-store', 'mime' => 'application/pdf',
        'csp' => "default-src 'none'; object-src 'self'; frame-ancestors 'self'"]);
    }
    case 'share_log': {
      need('quotes');
      $id = (int)($in['id'] ?? 0);
      $via = (string)($in['via'] ?? ''); $to = (string)($in['to_whom'] ?? '');
      if (!in_array($via, ['whatsapp', 'email', 'pdf'], true)) fail('Unknown way of sharing');
      if (!in_array($to, ['customer', 'bank'], true)) fail('Unknown receiver');
      $qt = row('SELECT id,number,doc FROM quotes WHERE id=?', [$id]);
      if (!$qt) fail('Quotation not found', 404);
      if (!qs_live($id, $qt)) out(['error' => 'This quotation is not signed'], 409);
      q('INSERT INTO quote_log(quote_id,via,to_whom,to_addr,user_id) VALUES(?,?,?,?,?)', [$id, $via, $to, mb_substr(trim((string)($in['to_addr'] ?? '')), 0, 120), uid()]);
      audit('quote_share', 'quotes', $id, "{$qt['number']} · $via · $to");
      out(['ok' => true]);
    }
    case 'share_tpl_save': {
      if (!is_admin()) fail('Only an admin can change the share wording', 403);
      $st = kv_get('qm_share_tpl', []); $o = [];
      foreach (QS_TPL_DEFAULT as $k => $def) {
        if (array_key_exists($k, $in)) $st[$k] = mb_substr((string)$in[$k], 0, 4000);
        if (isset($st[$k]) && is_string($st[$k])) $o[$k] = $st[$k];
      }
      kv_set('qm_share_tpl', $o);
      audit('quote_share_tpl', 'settings', 0, '');
      out(['ok' => true, 'share_tpl' => qs_tpl()]);
    }
    case 'sign_info': {
      need('quotes');
      $id = (int)($_GET['id'] ?? $in['id'] ?? 0);
      $qt = row('SELECT id,doc FROM quotes WHERE id=?', [$id]);
      if (!$qt) fail('Quotation not found', 404);
      $shares = rows('SELECT l.via, l.to_whom, l.to_addr, COALESCE(u.name,\'\') AS who, l.created FROM quote_log l LEFT JOIN users u ON u.id=l.user_id WHERE l.quote_id=? ORDER BY l.id DESC LIMIT 5', [$id]);
      if (!can('loans')) $shares = array_map(fn($x) => $x['to_whom'] === 'bank' ? array_replace($x, ['to_addr' => '']) : $x, $shares); /* the bank's phone / email are loan details (mask_customer hides them too) */
      out(['sign' => qs_out($id, $qt), 'shares' => $shares]);
    }
  }
  fail('Unknown action', 404);
}
