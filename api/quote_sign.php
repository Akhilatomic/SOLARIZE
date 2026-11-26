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
  $quote = $quote ?? row('SELECT doc FROM quotes WHERE id=?', [$qid]) ?? [];
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
