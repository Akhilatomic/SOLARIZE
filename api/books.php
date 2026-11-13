<?php
// Accounts › Cash & bank: the company's cash and bank accounts and the book of every rupee in and out (stage 1 of the company books).
// Nothing is typed twice: the book is worked out from payments received, office expenses, commission / incentive paid, purchases and
// services marked Purchased / Paid on Project cost sheets (acc_costs.pay_book), plus the manual entries and transfers kept here (acc_txn).
// Which account: mode Cash -> the cash account, anything else -> the default bank account; an entry can be moved (acc_book_map).
const BOOK_KINDS = ['cash', 'bank'];
/* manual entries: key => [label, direction] */
const BOOK_CATS = ['owner_in' => ['Owner put money in', 'in'], 'loan_in' => ['Loan received', 'in'], 'interest' => ['Interest received', 'in'], 'other_in' => ['Other income', 'in'],
  'owner_out' => ['Owner took money out', 'out'], 'loan_out' => ['Loan repaid', 'out'], 'charges' => ['Bank charges', 'out'], 'loan_int' => ['Loan / cash credit interest', 'out'], 'other_out' => ['Other payment', 'out'], 'transfer' => ['Transfer', 'out']];
const BOOK_MOVE_KINDS = ['pay', 'exp', 'comm1', 'comm2'];

function book_date($v, $label) {
  $d = trim((string)$v);
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) || date('Y-m-d', strtotime($d)) !== $d) fail("$label: enter a date");
  return $d;
}
function books_all() {
  $rs = rows('SELECT * FROM acc_books ORDER BY hidden, sort, id');
  foreach ($rs as &$r) { foreach (['id', 'is_default', 'hidden', 'sort'] as $k) $r[$k] = (int)$r[$k]; $r['opening'] = (float)$r['opening']; $r['credit_limit'] = (float)($r['credit_limit'] ?? 0); unset($r['created'], $r['updated']); } unset($r);
  return $rs;
}
/* the account an entry lands in when nothing says otherwise: [cash account id, default bank account id] */
function books_defaults($books) {
  $cash = 0; $bank = 0; $first = 0;
  foreach ($books as $b) {
    if (!$first) $first = $b['id'];
    if ($b['kind'] === 'cash' && !$cash) $cash = $b['id'];
    if ($b['kind'] === 'bank' && (!$bank || $b['is_default'])) { if (!$bank || $b['is_default']) $bank = $b['id']; }
  }
  return [$cash ?: ($bank ?: $first), $bank ?: ($cash ?: $first)];
}
/* the default bank account (the owner's default way of paying); 0 when there is no bank account */
function books_default_bank() { return (int)(row("SELECT id FROM acc_books WHERE kind='bank' AND hidden=0 ORDER BY is_default DESC, id LIMIT 1")['id'] ?? 0); }
function book_by_mode($mode, $def) { return strtolower(trim((string)$mode)) === 'cash' ? $def[0] : $def[1]; }

/* every entry of the book, oldest first: {key, kind, ref_id, date, book_id, dir, amount, title, sub, ref, link, movable} */
function book_entries() {
  $books = books_all(); $def = books_defaults($books); $ok = array_column($books, 'id', 'id');
  $map = [];
  foreach (rows('SELECT kind, ref_id, book_id FROM acc_book_map') as $m) if (isset($ok[(int)$m['book_id']])) $map[$m['kind']][(int)$m['ref_id']] = (int)$m['book_id'];
  $E = [];
  $add = function ($kind, $id, $date, $book, $dir, $amount, $title, $sub, $ref, $link, $movable) use (&$E, $map) {
    $amount = round((float)$amount, 2); $date = substr((string)$date, 0, 10);
    if ($amount <= 0 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !$book) return;
    $E[] = ['key' => "$kind:$id", 'kind' => $kind, 'ref_id' => (int)$id, 'date' => $date, 'book_id' => (int)($map[$kind][(int)$id] ?? $book), 'dir' => $dir, 'amount' => $amount,
      'title' => (string)$title, 'sub' => (string)$sub, 'ref' => (string)$ref, 'link' => (string)$link, 'movable' => $movable ? 1 : 0];
  };
  foreach ($books as $b) if (abs($b['opening']) > 0.004) $add('open', $b['id'], $b['opening_on'] ?: '2000-01-01', $b['id'], $b['opening'] >= 0 ? 'in' : 'out', abs($b['opening']), 'Opening balance', '', '', '', false);
  foreach (rows('SELECT pa.id, pa.date, pa.amount, pa.mode, pa.ref_no, pa.note, p.customer_id, c.name FROM payments pa JOIN projects p ON p.id=pa.project_id JOIN customers c ON c.id=p.customer_id') as $r)
    $add('pay', $r['id'], $r['date'], book_by_mode($r['mode'], $def), 'in', $r['amount'], 'Received from ' . $r['name'], trim($r['mode'] . ($r['note'] ? ' · ' . $r['note'] : '')), $r['ref_no'], '#/customers/' . (int)$r['customer_id'], true);
  foreach (rows('SELECT * FROM acc_expenses') as $r)
    $add('exp', $r['id'], $r['date'], book_by_mode($r['mode'], $def), 'out', $r['amount'], 'Expense · ' . $r['cat'], trim($r['paid_to'] . ($r['note'] ? ' · ' . $r['note'] : ''), ' ·'), '', '#/accounts/expenses', true);
  foreach (rows('SELECT m.*, c.name c_name, u.name u_name FROM commissions m LEFT JOIN customers c ON c.id=m.customer_id LEFT JOIN users u ON u.id=m.user_id') as $r) foreach ([1, 2] as $n)
    $add("comm$n", $r['id'], $r["p{$n}_date"], $def[1], 'out', $r["p{$n}_amount"], 'Commission / incentive · ' . ($r['u_name'] ?: 'staff'), ($r['c_name'] ?: '') . " · part $n", $r["p{$n}_ref"], '#/customers/' . (int)$r['customer_id'], true);
  /* purchases and services paid from an account: one entry per project + supplier + bill + day + account */
  $g = [];
  foreach (rows("SELECT k.project_id, k.name, k.qty, k.rate, k.gst, k.supplier, k.bill_no, k.bought_on, k.pay_book, k.pay_on, c.name c_name FROM acc_costs k JOIN projects p ON p.id=k.project_id JOIN customers c ON c.id=p.customer_id WHERE k.bought=1 AND k.pay_book>0") as $r) {
    if (!isset($ok[(int)$r['pay_book']]) || dues_is_direct($r['supplier'], $r['bill_no'])) continue; /* a bill entered directly is counted once, as that bill */
    $d = $r['pay_on'] ?: $r['bought_on']; $k = implode('|', [(int)$r['project_id'], mb_strtolower(trim((string)$r['supplier'])), mb_strtolower(trim((string)$r['bill_no'])), $d, (int)$r['pay_book']]);
    if (!isset($g[$k])) $g[$k] = ['pid' => (int)$r['project_id'], 'date' => $d, 'book' => (int)$r['pay_book'], 'sup' => trim((string)$r['supplier']), 'bill' => trim((string)$r['bill_no']), 'cust' => $r['c_name'], 'amt' => 0.0, 'n' => 0, 'one' => $r['name']];
    $g[$k]['amt'] += round((float)$r['qty'] * (float)$r['rate'] * (1 + (float)$r['gst'] / 100), 2); $g[$k]['n']++;
  }
  $i = 0;
  foreach ($g as $x) $add('cost', $x['pid'] * 1000 + (++$i % 1000), $x['date'], $x['book'], 'out', $x['amt'], 'Purchase' . ($x['sup'] !== '' ? ' · ' . $x['sup'] : ''),
    $x['cust'] . ' · ' . ($x['n'] === 1 ? $x['one'] : $x['n'] . ' items'), $x['bill'], '#/accounts/cost/' . $x['pid'], false);
  /* supplier bills added directly and paid at once, and payments to suppliers (api/dues.php) */
  foreach (rows('SELECT * FROM acc_bills WHERE pay_book>0') as $r)
    $add('bill', $r['id'], $r['date'], (int)$r['pay_book'], 'out', $r['amount'], 'Purchase · ' . $r['supplier'], (string)$r['note'], $r['bill_no'], '#/accounts/dues', false);
  foreach (rows('SELECT * FROM acc_sup_pay') as $r)
    $add('spay', $r['id'], $r['date'], (int)$r['book_id'], 'out', $r['amount'], 'Paid to ' . $r['supplier'], trim(($r['bill_no'] !== '' ? 'against bill ' . $r['bill_no'] : '') . ($r['note'] !== '' ? ' · ' . $r['note'] : ''), ' ·'), $r['ref'], '#/accounts/dues', false);
  /* salaries and other payments to people (api/pl.php) */
  foreach (rows('SELECT * FROM acc_salary') as $r)
    $add('sal', $r['id'], $r['date'], (int)$r['book_id'], 'out', $r['amount'], $r['kind'] . ' · ' . $r['name'], trim($r['for_what'] . ($r['note'] !== '' ? ' · ' . $r['note'] : ''), ' ·'), $r['ref'], '#/accounts/salary', false);
  /* Meta ad spend, when the owner chose the account it is paid from: one entry per month, dated its last day with spend */
  $ac = ads_cfg();
  if ($ac['book']) foreach (rows('SELECT substr(date,1,7) m, MAX(date) d, SUM(spend) s FROM ad_spend GROUP BY m') as $r)
    $add('ads', (int)str_replace('-', '', $r['m']), $r['d'], $ac['book'], 'out', (float)$r['s'] * ($ac['gst'] ? 1.18 : 1), 'Meta ads · ' . date('M Y', strtotime($r['m'] . '-01')), $ac['gst'] ? 'ad spend + 18% GST' : 'ad spend', '', '#/accounts/pl', false);
  foreach (rows('SELECT * FROM acc_txn') as $r) {
    $lab = BOOK_CATS[$r['cat']][0] ?? 'Entry'; $sub = trim($r['party'] . ($r['note'] ? ' · ' . $r['note'] : ''), ' ·');
    if ($r['cat'] === 'transfer') {
      $to = (int)$r['to_book_id']; $names = array_column($books, 'name', 'id');
      $add('txn', $r['id'], $r['date'], (int)$r['book_id'], 'out', $r['amount'], 'Transfer to ' . ($names[$to] ?? 'another account'), $sub, $r['ref'], '', false);
      $add('txn', $r['id'], $r['date'], $to, 'in', $r['amount'], 'Transfer from ' . ($names[(int)$r['book_id']] ?? 'another account'), $sub, $r['ref'], '', false);
    } else $add('txn', $r['id'], $r['date'], (int)$r['book_id'], $r['dir'] === 'in' ? 'in' : 'out', $r['amount'], $lab, $sub, $r['ref'], '', false);
  }
  /* oldest first; on one day: opening, money in, then money out */
  $rank = fn($e) => $e['kind'] === 'open' ? 0 : ($e['dir'] === 'in' ? 1 : 2);
  usort($E, fn($a, $b) => [$a['date'], $rank($a), $a['key']] <=> [$b['date'], $rank($b), $b['key']]);
  return $E;
}
/* accounts with today's balance, what is owed to suppliers (purchased, "Not paid yet") and purchases with no payment recorded */
function books_summary() {
  $books = books_all(); $bal = [];
  foreach (book_entries() as $e) $bal[$e['book_id']] = ($bal[$e['book_id']] ?? 0) + ($e['dir'] === 'in' ? $e['amount'] : -$e['amount']);
  foreach ($books as &$b) $b['balance'] = round($bal[$b['id']] ?? 0, 2); unset($b);
  $sum = fn($w) => row("SELECT COUNT(*) n, COALESCE(SUM(ROUND(qty*rate*(1+gst/100.0),2)),0) t FROM acc_costs WHERE bought=1 AND rate>0 AND $w");
  $un = $sum('pay_book IS NULL'); $dt = dues_total();
  return ['books' => $books, 'total' => round(array_sum(array_column(array_filter($books, fn($b) => !$b['hidden']), 'balance')), 2),
    'due' => $dt, 'unrec' => ['n' => (int)$un['n'], 'total' => round((float)$un['t'], 2)],
    'cats' => array_map(fn($k, $v) => ['key' => $k, 'label' => $v[0], 'dir' => $v[1]], array_keys(BOOK_CATS), BOOK_CATS)];
}

/* the acc module's Cash & bank actions; returns only when $a is not one of them */
function books_handle($a, $in) {
  switch ($a) {
    case 'ac_books': out(books_summary());

    case 'ac_book': { /* GET &book=<id, 0 = all>&period=: opening balance, the period's rows with running balance, closing balance */
      [$f, $t] = acc_range(); $bid = (int)($_GET['book'] ?? 0);
      $open = 0.0; $rows = []; $in2 = 0.0; $out2 = 0.0;
      foreach (book_entries() as $e) {
        if ($bid && $e['book_id'] !== $bid) continue;
        if (!$bid && $e['kind'] === 'txn' && strpos($e['title'], 'Transfer') === 0) continue; /* all accounts together: a transfer changes nothing */
        $v = $e['dir'] === 'in' ? $e['amount'] : -$e['amount'];
        if ($e['date'] < $f) { $open += $v; continue; }
        if ($e['date'] > $t) continue;
        if ($e['dir'] === 'in') $in2 += $e['amount']; else $out2 += $e['amount'];
        $rows[] = $e;
      }
      $open = round($open, 2);
      out(['from' => $f, 'to' => $t, 'book' => $bid, 'open' => $open, 'in' => round($in2, 2), 'out' => round($out2, 2), 'close' => round($open + $in2 - $out2, 2), 'rows' => $rows] + books_summary());
    }

    case 'book_save': { /* POST {id?, name, kind, opening, opening_on, note, is_default, hidden} */
      need('accounts', true);
      $id = (int)($in['id'] ?? 0);
      $name = acc_txt($in['name'] ?? '', 200);
      if ($name === '') fail('Type the account name');
      if (mb_strlen($name) > 60) fail('The account name is too long (60 characters at most)');
      $kind = (string)($in['kind'] ?? 'bank'); if (!in_array($kind, BOOK_KINDS, true)) fail('Choose Cash or Bank');
      $s = str_replace([',', '₹', ' '], '', trim((string)($in['opening'] ?? '0'))); if ($s === '') $s = '0';
      if (!is_numeric($s) || abs((float)$s) > 1e10) fail('Opening balance: enter an amount in rupees');
      $open = round((float)$s, 2);
      $on = trim((string)($in['opening_on'] ?? '')); if ($on !== '' || abs($open) > 0.004) $on = book_date($on, 'Opening balance as on');
      if (row('SELECT 1 FROM acc_books WHERE lower(name)=lower(?) AND id<>?', [$name, $id])) out(['error' => "$name is already an account", 'quiet' => 1], 409);
      $defl = !empty($in['is_default']) && $kind === 'bank' ? 1 : 0; $hid = !empty($in['hidden']) ? 1 : 0;
      $lim = $kind === 'bank' ? acc_money($in['credit_limit'] ?? 0, 'Credit limit') : 0.0; /* cash credit / overdraft: how far below zero the bank lets it go */
      if ($id) {
        if (!row('SELECT 1 FROM acc_books WHERE id=?', [$id])) fail('Account not found', 404);
        if ($hid && (int)row('SELECT COUNT(*) c FROM acc_books WHERE hidden=0 AND id<>?', [$id])['c'] === 0) fail('Keep at least one account in use');
        q('UPDATE acc_books SET name=?, kind=?, note=?, opening=?, opening_on=?, is_default=?, hidden=?, credit_limit=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$name, $kind, acc_txt($in['note'] ?? '', 200), $open, $on, $defl, $hid, $lim, $id]);
      } else {
        q('INSERT INTO acc_books(name,kind,note,opening,opening_on,is_default,hidden,credit_limit,sort) VALUES(?,?,?,?,?,?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM acc_books))', [$name, $kind, acc_txt($in['note'] ?? '', 200), $open, $on, $defl, $hid, $lim]);
        $id = (int)db()->lastInsertId();
      }
      if ($defl) q('UPDATE acc_books SET is_default=0 WHERE id<>?', [$id]);
      audit('acc_book_save', 'acc_books', $id, $name);
      out(['ok' => true, 'id' => $id] + books_summary());
    }

    case 'book_delete': { /* POST {id}: only an account nothing uses; otherwise hide it */
      need('accounts', true);
      $id = (int)($in['id'] ?? 0); $b = row('SELECT * FROM acc_books WHERE id=?', [$id]); if (!$b) fail('Account not found', 404);
      foreach (book_entries() as $e) if ($e['book_id'] === $id && $e['kind'] !== 'open') fail('This account has entries, so it cannot be deleted. Hide it instead.');
      if (row('SELECT 1 FROM acc_txn WHERE book_id=? OR to_book_id=?', [$id, $id]) || row('SELECT 1 FROM acc_costs WHERE pay_book=?', [$id]) || row('SELECT 1 FROM acc_bills WHERE pay_book=?', [$id]) || row('SELECT 1 FROM acc_sup_pay WHERE book_id=?', [$id]) || row('SELECT 1 FROM acc_salary WHERE book_id=?', [$id]) || ads_cfg()['book'] === $id) fail('This account has entries, so it cannot be deleted. Hide it instead.');
      if ((int)row('SELECT COUNT(*) c FROM acc_books WHERE id<>? AND hidden=0', [$id])['c'] === 0) fail('Keep at least one account');
      trash_put('Account', $b['name'], [['acc_books', 'id=?', [$id]]]);
      q('DELETE FROM acc_book_map WHERE book_id=?', [$id]);
      q('DELETE FROM acc_books WHERE id=?', [$id]);
      audit('acc_book_delete', 'acc_books', $id, $b['name']);
      out(['ok' => true] + books_summary());
    }

    case 'txn_save': { /* POST {id?, date, cat, amount, book_id, to_book_id (transfer), party, ref, note} */
      need('accounts', true);
      $id = (int)($in['id'] ?? 0);
      $cat = (string)($in['cat'] ?? ''); if (!isset(BOOK_CATS[$cat])) fail('Choose what the entry is');
      $date = book_date($in['date'] ?? '', 'Date');
      $amount = acc_money($in['amount'] ?? 0, 'Amount'); if ($amount <= 0) fail('Amount: enter an amount in rupees');
      $bid = (int)($in['book_id'] ?? 0); if (!row('SELECT 1 FROM acc_books WHERE id=?', [$bid])) fail('Choose the account');
      $to = 0;
      if ($cat === 'transfer') { $to = (int)($in['to_book_id'] ?? 0); if (!row('SELECT 1 FROM acc_books WHERE id=?', [$to])) fail('Choose the account the money goes to'); if ($to === $bid) fail('Choose two different accounts'); }
      $v = [$date, $bid, BOOK_CATS[$cat][1], $amount, $cat, $to, acc_txt($in['party'] ?? '', 120), acc_txt($in['ref'] ?? '', 60), acc_txt($in['note'] ?? '', 300)];
      if ($id) {
        if (!row('SELECT 1 FROM acc_txn WHERE id=?', [$id])) fail('Entry not found', 404);
        q('UPDATE acc_txn SET date=?, book_id=?, dir=?, amount=?, cat=?, to_book_id=?, party=?, ref=?, note=?, updated=CURRENT_TIMESTAMP WHERE id=?', array_merge($v, [$id]));
      } else { q('INSERT INTO acc_txn(date,book_id,dir,amount,cat,to_book_id,party,ref,note,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)', array_merge($v, [uid()])); $id = (int)db()->lastInsertId(); }
      audit('acc_txn_save', 'acc_txn', $id, BOOK_CATS[$cat][0] . " · $amount");
      out(['ok' => true, 'id' => $id]);
    }

    case 'ac_txn': { $r = row('SELECT * FROM acc_txn WHERE id=?', [(int)($_GET['id'] ?? 0)]); if (!$r) fail('Entry not found', 404); foreach (['id', 'book_id', 'to_book_id'] as $k) $r[$k] = (int)$r[$k]; $r['amount'] = (float)$r['amount']; out(['txn' => $r]); }

    case 'txn_delete': {
      need('accounts', true);
      $id = (int)($in['id'] ?? 0); $r = row('SELECT * FROM acc_txn WHERE id=?', [$id]); if (!$r) fail('Entry not found', 404);
      trash_put('Account entry', (BOOK_CATS[$r['cat']][0] ?? 'Entry') . ' · ' . $r['date'] . ' · ₹' . $r['amount'], [['acc_txn', 'id=?', [$id]]]);
      q('DELETE FROM acc_txn WHERE id=?', [$id]);
      audit('acc_txn_delete', 'acc_txn', $id, $r['cat']);
      out(['ok' => true]);
    }

    case 'book_move': { /* POST {kind, ref_id, book_id}: a payment, expense or commission entry sits in another account */
      need('accounts', true);
      $kind = (string)($in['kind'] ?? ''); $ref = (int)($in['ref_id'] ?? 0); $bid = (int)($in['book_id'] ?? 0);
      if (!in_array($kind, BOOK_MOVE_KINDS, true) || $ref <= 0) fail('This entry cannot be moved');
      if (!row('SELECT 1 FROM acc_books WHERE id=?', [$bid])) fail('Choose the account');
      q('INSERT INTO acc_book_map(kind,ref_id,book_id) VALUES(?,?,?) ON CONFLICT(kind,ref_id) DO UPDATE SET book_id=excluded.book_id', [$kind, $ref, $bid]);
      audit('acc_book_move', 'acc_books', $bid, "$kind $ref");
      out(['ok' => true]);
    }
  }
}
