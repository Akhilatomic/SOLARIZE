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
function qs_out(int $qid, ?array $quote = null): array {
  $quote = $quote ?? row('SELECT doc FROM quotes WHERE id=?', [$qid]) ?: [];
  $doc = qs_doc($quote); $s = qs_row($qid);
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
        $copy = bin2hex(random_bytes(12)) . '.pdf';
        if (!@copy("$dir/$file", "$dir/$copy")) { @unlink("$dir/$file"); error_log("quote_sign: could not copy the signed PDF of quotation $id into Documents"); fail('Could not save the signed copy to the customer Documents. Nothing was changed - please try again', 500); }
      }
      $old = qs_row($id); $had = qs_state($old) === 'signed'; $reqBy = (int)($old['req_by'] ?? 0);
      if ($old) { if ($had) trash_put('Signed quotation', "$no · $nm", [['quote_sign', 'quote_id=?', [$id]]]); q('DELETE FROM quote_sign WHERE quote_id=?', [$id]); }
      q('INSERT INTO quote_sign(quote_id,req_by,req_at,signed_by,signed_at,file,name,size,ver) VALUES(?,NULL,NULL,?,CURRENT_TIMESTAMP,?,?,?,?)', [$id, uid(), $file, $fname, (int)$fl['size'], $ver]);
      /* the seal goes into the stored doc only: updated / edit_by stay as they were. Decoded as objects so an empty {} stays {} */
      $rawDoc->seal = true; q('UPDATE quotes SET doc=? WHERE id=?', [json_encode($rawDoc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION), $id]);
      if ($copy !== '') {
        $key = "quote:$id";
        foreach (rows('SELECT id, path FROM files WHERE customer_id=? AND gen=?', [$cid, $key]) as $o) { @unlink("$dir/" . basename($o['path'])); q('DELETE FROM files WHERE id=?', [$o['id']]); }
        q('INSERT INTO files(customer_id,kind,item,name,path,size,user,life,gen) VALUES(?,?,?,?,?,?,?,?,?)', [$cid, 'gen', "Quotation $no · signed", $fname, $copy, (int)$fl['size'], $_SESSION['username'], 0, $key]);
      }
      $who = (string)(row('SELECT name FROM users WHERE id=?', [uid()])['name'] ?? '');
      $txt = $had ? "$who updated the signed quotation $no · $nm" : "$who added the seal & signature to quotation $no · $nm";
      foreach (array_unique([(int)$qt['made_by'], $reqBy]) as $to) notif_from_me($to, 'signed', $txt, ['quote_id' => $id, 'lead_id' => (int)$qt['lead_id'], 'customer_id' => $cid]);
      audit('quote_sign', 'quotes', $id, $no);
      out(['ok' => true, 'sign' => qs_out($id)]);
    }
    case 'signed': {
      need('quotes');
      $id = (int)($_GET['id'] ?? $in['id'] ?? 0);
      if (!row('SELECT id FROM quotes WHERE id=?', [$id])) fail('Quotation not found', 404);
      $s = qs_row($id);
      if (qs_state($s) !== 'signed') fail('This quotation is not signed', 404);
      serve_file(up_dir() . '/' . basename((string)$s['file']), (string)$s['name'], ['download' => !empty($_GET['dl']), 'cache' => 'private, no-store', 'mime' => 'application/pdf',
        'csp' => "default-src 'none'; object-src 'self'; frame-ancestors 'self'"]);
    }
    case 'sign_info': {
      need('quotes');
      $id = (int)($_GET['id'] ?? $in['id'] ?? 0);
      $qt = row('SELECT id,doc FROM quotes WHERE id=?', [$id]);
      if (!$qt) fail('Quotation not found', 404);
      $shares = rows('SELECT l.via, l.to_whom, l.to_addr, COALESCE(u.name,\'\') AS who, l.created FROM quote_log l LEFT JOIN users u ON u.id=l.user_id WHERE l.quote_id=? ORDER BY l.id DESC LIMIT 5', [$id]);
      out(['sign' => qs_out($id, $qt), 'shares' => $shares]);
    }
  }
  fail('Unknown action', 404);
}
