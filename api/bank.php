<?php
// Bank documentation page (#/bank, #/bank/<customerId>): the papers for a customer's solar loan (Jan Samarth / PM Surya Ghar):
// the vendor feasibility report and the vendor–customer agreement. The PDFs are drawn in the browser (KD in assets/app24.js);
// like the KSEB documentation page, this keeps only what was changed per customer (gen_docs kind 'bank_<doc>').
// Permission area 'loans' (Settings → User access): the papers carry the plant cost and the company's bank account.

const BANK_DOCS = ['bfr', 'bag'];

function bank_saved($cid, $doc) {
  $r = row('SELECT data, issued_on, updated, updated_by FROM gen_docs WHERE customer_id=? AND kind=?', [$cid, 'bank_' . $doc]);
  return $r ? ['data' => json_decode($r['data'], true) ?: [], 'issued_on' => $r['issued_on'], 'updated' => $r['updated'], 'updated_by' => $r['updated_by']] : null;
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
        'company' => gen_qm_info(), 'defaults' => kseb_defaults(),
        'saved' => array_combine(BANK_DOCS, array_map(fn($d) => bank_saved($cid, $d), BANK_DOCS))]);

    case 'save':
      need('loans', true);
      $doc = (string)($in['doc'] ?? ''); if (!in_array($doc, BANK_DOCS, true)) fail('Unknown document');
      $cid = (int)($in['customer_id'] ?? 0); if (!row('SELECT 1 FROM customers WHERE id=?', [$cid])) fail('Customer not found', 404);
      $data = gen_clean((array)($in['data'] ?? []));
      $dt = (string)($data['date'] ?? '');
      $issued = preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $dt, $dm) && checkdate((int)$dm[2], (int)$dm[3], (int)$dm[1]) ? $dt : date('Y-m-d');
      q('INSERT INTO gen_docs(customer_id,kind,number,issued_on,data,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(customer_id,kind) DO UPDATE SET issued_on=excluded.issued_on, data=excluded.data, updated=CURRENT_TIMESTAMP, updated_by=excluded.updated_by',
        [$cid, 'bank_' . $doc, '', $issued, json_encode($data, JSON_UNESCAPED_UNICODE), $_SESSION['name'] ?? '']);
      audit('bank_doc', 'customers', $cid, $doc);
      out(['ok' => true, 'saved' => bank_saved($cid, $doc)]);
  }
  fail('Unknown action', 404);
}
