<?php
// Bank documentation page (#/bank, #/bank/<customerId>): the papers for a customer's solar loan (Jan Samarth / PM Surya Ghar):
// the vendor feasibility report and the vendor–customer agreement. The PDFs are drawn in the browser (KD in assets/app24.js);
// like the KSEB documentation page, this keeps only what was changed per customer (gen_docs kind 'bank_<doc>').
// Permission area 'loans' (Settings → User access): the papers carry the plant cost and the company's bank account.

const BANK_DOCS = ['bfr', 'bag', 'mag', 'mas']; /* mas / mag = MNRE Agreement on stamp paper / plain paper (Compliance menu); same permission and 'bank:' copies */

function bank_saved($cid, $doc) {
  $r = row('SELECT data, issued_on, updated, updated_by FROM gen_docs WHERE customer_id=? AND kind=?', [$cid, 'bank_' . $doc]);
  return $r ? ['data' => json_decode($r['data'], true) ?: [], 'issued_on' => $r['issued_on'], 'updated' => $r['updated'], 'updated_by' => $r['updated_by']] : null;
}

/* the customer's quotation-maker quotations (newest first, at most 10) for the agreements made before installation (KD.pickQuote /
   KD.quoteFacts fill what the profile leaves empty). Only what the agreement uses is sent: the price and the panel / inverter lines.
   Owner's rule (2026-11-27): everyone who opens the bank papers prints the same agreement, so someone without Quotations access gets
   those values too, but not the quotation's number or date (no picker for them). */
function bank_quote_doc(array $d) {
  $snap = is_array($d['snap'] ?? null) ? $d['snap'] : [];
  $keep = fn($l, $keys) => array_intersect_key(is_array($l) ? $l : [], array_flip($keys));
  $pan = is_array($snap['panels'] ?? null) ? array_slice(array_values($snap['panels']), 0, 1) : [];
  $inv = is_array($snap['inverter'] ?? null) ? array_slice(array_values($snap['inverter']), 0, 20) : [];
  return ['price' => is_numeric($d['price'] ?? null) ? +$d['price'] : 0, 'snap' => [
    'panels' => array_map(fn($l) => $keep($l, ['label', 'details', 'name', 'wp', 'qty']), $pan),
    'inverter' => array_map(fn($l) => $keep($l, ['title', 'name', 'details', 'kw', 'qty', 'kw_line']), $inv)]];
}
function bank_quotes($cid) {
  $full = can('quotes'); $out = [];
  /* newest made first (by id: a status change or a re-save must not make an older quotation the "newest") */
  foreach (rows("SELECT id, number, date, status, doc FROM quotes WHERE customer_id=? AND doc IS NOT NULL AND doc<>'' ORDER BY id DESC LIMIT 10", [(int)$cid]) as $q) {
    $d = json_decode((string)$q['doc'], true);
    if (is_array($d) && $d && array_keys($d) !== range(0, count($d) - 1))
      $out[] = ['id' => (int)$q['id'], 'number' => $full ? (string)$q['number'] : '', 'date' => $full ? (string)$q['date'] : '', 'status' => (string)$q['status'], 'doc' => bank_quote_doc($d)];
  }
  return $out;
}

function handle_bank($a) {
  $in = body();
  need('loans'); need('customers');
  switch ($a) {
    case 'get':
      $cid = (int)($_GET['customer_id'] ?? 0);
      $c = row('SELECT * FROM customers WHERE id=?', [$cid]); if (!$c) fail('Customer not found', 404);
      [$plant] = plant_get($cid);
      $p = row('SELECT id, title, kw, cost, loan FROM projects WHERE customer_id=? ORDER BY id DESC LIMIT 1', [$cid]);
      $tax = row("SELECT number, issued_on, data FROM gen_docs WHERE customer_id=? AND kind='tax'", [$cid]);
      $grand = $tax ? (float)((json_decode((string)$tax['data'], true) ?: [])['grand'] ?? 0) : 0;
      out(['customer' => mask_customer($c), 'plant' => $plant,
        'project' => $p ? ['id' => (int)$p['id'], 'kw' => $p['kw'], 'cost' => (float)$p['cost'], 'loan' => (string)($p['loan'] ?? '')] : null,
        'bill' => $tax ? ['number' => $tax['number'], 'issued_on' => $tax['issued_on'], 'grand' => $grand] : null,
        'company' => gen_qm_info(), 'defaults' => kseb_defaults(), 'quotes' => bank_quotes($cid),
        'saved' => array_combine(BANK_DOCS, array_map(fn($d) => bank_saved($cid, $d), BANK_DOCS))]);

    case 'save':
      need('loans', true);
      $doc = (string)($in['doc'] ?? ''); if (!in_array($doc, BANK_DOCS, true)) fail('Unknown document');
      $cid = (int)($in['customer_id'] ?? 0); if (!row('SELECT 1 FROM customers WHERE id=?', [$cid])) fail('Customer not found', 404);
      $data = gen_clean((array)($in['data'] ?? []));
      /* seal & signature on the feasibility report: an admin's choice only; anyone else's save keeps what the saved copy had */
      if (!is_admin()) { $was = (string)((bank_saved($cid, $doc)['data'] ?? [])['seal'] ?? ''); if ($was !== '') $data['seal'] = $was; else unset($data['seal']); }
      /* typed for a profile field that is still empty: it goes into the profile instead (as on the KSEB documentation page) */
      $filled = !empty($in['fill']) && is_array($in['fill']) && can('customers', true) ? kseb_fill($cid, $in['fill']) : [];
      foreach ($filled as $k) unset($data[$k]);
      $dt = (string)($data['date'] ?? '');
      $issued = preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $dt, $dm) && checkdate((int)$dm[2], (int)$dm[3], (int)$dm[1]) ? $dt : date('Y-m-d');
      q('INSERT INTO gen_docs(customer_id,kind,number,issued_on,data,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(customer_id,kind) DO UPDATE SET issued_on=excluded.issued_on, data=excluded.data, updated=CURRENT_TIMESTAMP, updated_by=excluded.updated_by',
        [$cid, 'bank_' . $doc, '', $issued, json_encode($data, JSON_UNESCAPED_UNICODE), $_SESSION['name'] ?? '']);
      audit('bank_doc', 'customers', $cid, $doc);
      $res = ['ok' => true, 'saved' => bank_saved($cid, $doc)];
      if ($filled) { [$plant] = plant_get($cid); $res += ['filled' => $filled, 'customer' => mask_customer(row('SELECT * FROM customers WHERE id=?', [$cid])), 'plant' => $plant]; }
      out($res);
  }
  fail('Unknown action', 404);
}
