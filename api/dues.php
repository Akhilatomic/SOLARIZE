<?php
// Accounts › Supplier dues (stage 2 of the company books): what is owed to each supplier.
// A supplier's balance = bills bought on credit − payments. Bills on credit are (1) purchased lines of Project cost sheets marked
// "Not paid yet" (acc_costs.pay_book = 0) and (2) bills added directly (acc_bills, pay_book = 0). A direct bill wins over sheet lines of
// the same supplier + bill no.: those lines only split it across projects. Payments (acc_sup_pay) also go out of the cash and bank book.
const DUES_NONAME = 'Supplier not named';

function sup_key($s) { return mb_strtolower(trim((string)preg_replace('/\s+/u', ' ', (string)$s))); }
function line_total($r) { return round((float)$r['qty'] * (float)$r['rate'] * (1 + (float)$r['gst'] / 100), 2); }
/* supplier key | bill no. of every direct bill that has a bill no.: sheet lines with one of these are not counted again */
function dues_direct_keys() {
  static $k = null;
  if ($k === null) { $k = []; foreach (rows("SELECT supplier, bill_no FROM acc_bills WHERE TRIM(COALESCE(bill_no,''))<>''") as $b) $k[sup_key($b['supplier']) . '|' . sup_key($b['bill_no'])] = 1; }
  return $k;
}
function dues_is_direct($supplier, $bill_no) { return trim((string)$bill_no) !== '' && isset(dues_direct_keys()[sup_key($supplier) . '|' . sup_key($bill_no)]); }

/* every supplier with something on credit or a payment: key => {name, bills: [...], pays: [...]} */
function dues_data() {
  $S = [];
  $names = []; foreach (rows('SELECT name FROM acc_suppliers') as $s) $names[sup_key($s['name'])] = $s['name'];
  $at = function ($name) use (&$S, $names) {
    $k = sup_key($name);
    if (!isset($S[$k])) $S[$k] = ['key' => $k, 'name' => $k === '' ? DUES_NONAME : ($names[$k] ?? trim((string)$name)), 'bills' => [], 'pays' => []];
    return $k;
  };
  /* bills on credit from the Project cost sheets */
  $g = [];
  foreach (rows("SELECT k.project_id, k.name, k.qty, k.rate, k.gst, k.supplier, k.bill_no, k.bill_date, k.bought_on, c.name c_name FROM acc_costs k JOIN projects p ON p.id=k.project_id JOIN customers c ON c.id=p.customer_id WHERE k.bought=1 AND k.pay_book=0 AND k.rate>0") as $r) {
    if (dues_is_direct($r['supplier'], $r['bill_no'])) continue;
    $k = $at($r['supplier']); $bn = trim((string)$r['bill_no']);
    $gk = $k . '|' . ($bn !== '' ? 'b:' . sup_key($bn) : 'p:' . (int)$r['project_id'] . ':' . $r['bought_on']);
    $d = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$r['bill_date']) ? $r['bill_date'] : $r['bought_on'];
    if (!isset($g[$gk])) $g[$gk] = ['sup' => $k, 'src' => 'sheet', 'id' => 0, 'bill_no' => $bn, 'date' => $d, 'amount' => 0.0, 'n' => 0, 'one' => $r['name'], 'project_id' => (int)$r['project_id'], 'who' => []];
    $g[$gk]['amount'] = round($g[$gk]['amount'] + line_total($r), 2); $g[$gk]['n']++; $g[$gk]['who'][$r['c_name']] = 1;
    if ($d < $g[$gk]['date']) $g[$gk]['date'] = $d;
  }
  foreach ($g as $b) { $b['note'] = implode(', ', array_keys($b['who'])) . ' · ' . ($b['n'] === 1 ? $b['one'] : $b['n'] . ' items'); unset($b['who'], $b['one']); $S[$b['sup']]['bills'][] = $b; }
  /* bills added directly, on credit */
  foreach (rows('SELECT * FROM acc_bills WHERE pay_book=0') as $r) {
    $k = $at($r['supplier']);
    $S[$k]['bills'][] = ['sup' => $k, 'src' => 'bill', 'id' => (int)$r['id'], 'bill_no' => (string)$r['bill_no'], 'date' => (string)$r['date'], 'amount' => round((float)$r['amount'], 2), 'n' => 0, 'project_id' => 0, 'note' => (string)$r['note']];
  }
  foreach (rows('SELECT * FROM acc_sup_pay') as $r) {
    $k = $at($r['supplier']);
    $S[$k]['pays'][] = ['id' => (int)$r['id'], 'date' => (string)$r['date'], 'amount' => round((float)$r['amount'], 2), 'book_id' => (int)$r['book_id'], 'ref' => (string)$r['ref'], 'bill_no' => (string)$r['bill_no'], 'note' => (string)$r['note']];
  }
  return $S;
}
/* one row per supplier: bills on credit, paid, balance (owed when above 0, an advance when below), last payment */
function dues_rows() {
  $out = [];
  foreach (dues_data() as $s) {
    $b = round(array_sum(array_column($s['bills'], 'amount')), 2); $p = round(array_sum(array_column($s['pays'], 'amount')), 2);
    $last = $s['pays'] ? max(array_column($s['pays'], 'date')) : '';
    $out[] = ['key' => $s['key'], 'name' => $s['name'], 'bills' => $b, 'bills_n' => count($s['bills']), 'paid' => $p, 'balance' => round($b - $p, 2), 'last_paid' => $last];
  }
  usort($out, fn($a, $b) => [$b['balance'], $a['name']] <=> [$a['balance'], $b['name']]);
  return $out;
}
/* what is owed in all (suppliers with a balance above zero) */
function dues_total() {
  $t = 0.0; $n = 0;
  foreach (dues_rows() as $r) if ($r['balance'] > 0.004) { $t += $r['balance']; $n++; }
  return ['n' => $n, 'total' => round($t, 2)];
}
function dues_supplier_in($v) { $s = acc_txt($v, 200); if ($s === '') fail('Type the supplier name'); if (mb_strlen($s) > 120) fail('The supplier name is too long'); return $s; }

/* the acc module's Supplier dues actions; returns only when $a is not one of them */
function dues_handle($a, $in) {
  switch ($a) {
    case 'ac_dues': {
      $rows = dues_rows(); $adv = 0.0;
      foreach ($rows as $r) if ($r['balance'] < -0.004) $adv -= $r['balance'];
      out(['rows' => $rows, 'due' => dues_total(), 'advance' => round($adv, 2), 'books' => books_all(), 'suppliers' => array_column(rows('SELECT name FROM acc_suppliers ORDER BY lower(name)'), 'name')]);
    }

    case 'ac_sup': { /* GET &name=: one supplier's bills on credit and payments, oldest first, with the running balance */
      $k = sup_key($_GET['name'] ?? ''); $s = dues_data()[$k] ?? null;
      if (!$s) out(['key' => $k, 'name' => $k === '' ? DUES_NONAME : trim((string)($_GET['name'] ?? '')), 'rows' => [], 'balance' => 0]);
      $rows = [];
      foreach ($s['bills'] as $b) $rows[] = ['kind' => $b['src'], 'id' => $b['id'], 'date' => $b['date'], 'title' => 'Bill' . ($b['bill_no'] !== '' ? ' ' . $b['bill_no'] : ' (no bill no.)'), 'sub' => $b['note'], 'bill' => $b['amount'], 'paid' => 0, 'project_id' => $b['project_id']];
      $bn = array_column(books_all(), 'name', 'id');
      foreach ($s['pays'] as $p) $rows[] = ['kind' => 'pay', 'id' => $p['id'], 'date' => $p['date'], 'title' => 'Payment', 'sub' => trim(($bn[$p['book_id']] ?? '') . ($p['ref'] !== '' ? ' · ' . $p['ref'] : '') . ($p['bill_no'] !== '' ? ' · against bill ' . $p['bill_no'] : '') . ($p['note'] !== '' ? ' · ' . $p['note'] : ''), ' ·'), 'bill' => 0, 'paid' => $p['amount'], 'project_id' => 0];
      usort($rows, fn($x, $y) => [$x['date'], $x['kind'] === 'pay' ? 1 : 0, $x['id']] <=> [$y['date'], $y['kind'] === 'pay' ? 1 : 0, $y['id']]);
      $bal = 0.0; foreach ($rows as &$r) { $bal = round($bal + $r['bill'] - $r['paid'], 2); $r['balance'] = $bal; } unset($r);
      out(['key' => $k, 'name' => $s['name'], 'rows' => $rows, 'balance' => $bal]);
    }

    case 'ac_bill': { $r = row('SELECT * FROM acc_bills WHERE id=?', [(int)($_GET['id'] ?? 0)]); if (!$r) fail('Bill not found', 404); foreach (['id', 'pay_book'] as $k) $r[$k] = (int)$r[$k]; foreach (['amount', 'gst_amt'] as $k) $r[$k] = (float)$r[$k]; out(['bill' => $r]); }
    case 'ac_spay': { $r = row('SELECT * FROM acc_sup_pay WHERE id=?', [(int)($_GET['id'] ?? 0)]); if (!$r) fail('Payment not found', 404); foreach (['id', 'book_id'] as $k) $r[$k] = (int)$r[$k]; $r['amount'] = (float)$r['amount']; out(['pay' => $r]); }

    case 'bill_save': { /* POST {id?, supplier, bill_no, date, amount (with GST), gst_amt, pay_book (0 = on credit), note} */
      need('accounts', true);
      $id = (int)($in['id'] ?? 0);
      $sup = dues_supplier_in($in['supplier'] ?? '');
      $date = book_date($in['date'] ?? '', 'Bill date');
      $amount = acc_money($in['amount'] ?? 0, 'Bill amount'); if ($amount <= 0) fail('Bill amount: enter an amount in rupees');
      $gst = acc_money($in['gst_amt'] ?? 0, 'GST in the bill'); if ($gst > $amount) fail('The GST cannot be more than the bill amount');
      $pb = (int)($in['pay_book'] ?? 0); if ($pb < 0 || ($pb > 0 && !row('SELECT 1 FROM acc_books WHERE id=?', [$pb]))) fail('Choose how it was paid');
      $bn = acc_txt($in['bill_no'] ?? '', 60);
      if ($bn !== '') foreach (rows('SELECT id, supplier, bill_no FROM acc_bills WHERE id<>?', [$id]) as $o) if (sup_key($o['supplier']) === sup_key($sup) && sup_key($o['bill_no']) === sup_key($bn)) out(['error' => "Bill $bn of $sup is already entered", 'quiet' => 1], 409);
      $v = [$sup, $bn, $date, $amount, $gst, acc_txt($in['note'] ?? '', 300), $pb];
      if ($id) { if (!row('SELECT 1 FROM acc_bills WHERE id=?', [$id])) fail('Bill not found', 404); q('UPDATE acc_bills SET supplier=?, bill_no=?, date=?, amount=?, gst_amt=?, note=?, pay_book=?, updated=CURRENT_TIMESTAMP WHERE id=?', array_merge($v, [$id])); }
      else { q('INSERT INTO acc_bills(supplier,bill_no,date,amount,gst_amt,note,pay_book,created_by) VALUES(?,?,?,?,?,?,?,?)', array_merge($v, [uid()])); $id = (int)db()->lastInsertId(); }
      audit('acc_bill_save', 'acc_bills', $id, "$sup · $bn · $amount");
      out(['ok' => true, 'id' => $id]);
    }
    case 'bill_delete': {
      need('accounts', true);
      $id = (int)($in['id'] ?? 0); $r = row('SELECT * FROM acc_bills WHERE id=?', [$id]); if (!$r) fail('Bill not found', 404);
      trash_put('Supplier bill', $r['supplier'] . ' · ' . $r['bill_no'] . ' · ₹' . $r['amount'], [['acc_bills', 'id=?', [$id]]]);
      q('DELETE FROM acc_bills WHERE id=?', [$id]);
      audit('acc_bill_delete', 'acc_bills', $id, $r['supplier']);
      out(['ok' => true]);
    }
    case 'spay_save': { /* POST {id?, supplier, date, amount, book_id, ref, bill_no, note}: a payment to a supplier, on account */
      need('accounts', true);
      $id = (int)($in['id'] ?? 0);
      $sup = dues_supplier_in($in['supplier'] ?? '');
      $date = book_date($in['date'] ?? '', 'Payment date');
      $amount = acc_money($in['amount'] ?? 0, 'Amount'); if ($amount <= 0) fail('Amount: enter an amount in rupees');
      $bid = (int)($in['book_id'] ?? 0); if (!row('SELECT 1 FROM acc_books WHERE id=?', [$bid])) fail('Choose the account it was paid from');
      $v = [$sup, $date, $amount, $bid, acc_txt($in['ref'] ?? '', 60), acc_txt($in['bill_no'] ?? '', 60), acc_txt($in['note'] ?? '', 300)];
      if ($id) { if (!row('SELECT 1 FROM acc_sup_pay WHERE id=?', [$id])) fail('Payment not found', 404); q('UPDATE acc_sup_pay SET supplier=?, date=?, amount=?, book_id=?, ref=?, bill_no=?, note=?, updated=CURRENT_TIMESTAMP WHERE id=?', array_merge($v, [$id])); }
      else { q('INSERT INTO acc_sup_pay(supplier,date,amount,book_id,ref,bill_no,note,created_by) VALUES(?,?,?,?,?,?,?,?)', array_merge($v, [uid()])); $id = (int)db()->lastInsertId(); }
      audit('acc_spay_save', 'acc_sup_pay', $id, "$sup · $amount");
      out(['ok' => true, 'id' => $id]);
    }
    case 'spay_delete': {
      need('accounts', true);
      $id = (int)($in['id'] ?? 0); $r = row('SELECT * FROM acc_sup_pay WHERE id=?', [$id]); if (!$r) fail('Payment not found', 404);
      trash_put('Supplier payment', $r['supplier'] . ' · ' . $r['date'] . ' · ₹' . $r['amount'], [['acc_sup_pay', 'id=?', [$id]]]);
      q('DELETE FROM acc_sup_pay WHERE id=?', [$id]);
      audit('acc_spay_delete', 'acc_sup_pay', $id, $r['supplier']);
      out(['ok' => true]);
    }
  }
}
