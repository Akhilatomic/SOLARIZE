<?php
// Accounts › Salaries and Accounts › Profit & loss (stage 4 of the company books).
// acc_salary = payments to people (salary, advance, bonus); they go out of the cash and bank book and into the profit and loss.
// Setting acc_ads {book, gst}: the account Meta's ad spend is paid from (0 = not in the book) and whether 18 % GST is added to it.
// The profit and loss is computed each time: project profit of the billed projects (acc_profit_get), other income, overheads.
const SAL_KINDS = ['Salary', 'Advance', 'Bonus', 'Other'];

function ads_cfg() {
  $c = json_decode((string)(row("SELECT v FROM settings WHERE k='acc_ads'")['v'] ?? ''), true);
  $b = is_array($c) ? (int)($c['book'] ?? 0) : 0;
  if ($b && !row('SELECT 1 FROM acc_books WHERE id=?', [$b])) $b = 0;
  return ['book' => $b, 'gst' => is_array($c) && array_key_exists('gst', $c) ? (int)!empty($c['gst']) : 1];
}
function sal_row($r) { foreach (['id', 'user_id', 'book_id'] as $k) $r[$k] = (int)$r[$k]; $r['amount'] = (float)$r['amount']; unset($r['created'], $r['updated'], $r['created_by']); return $r; }

/* one period's profit and loss figures */
function pl_calc($from, $to) {
  $r2 = fn($x) => round($x, 2);
  $pf = acc_profit_get($from, $to); $c = $pf['counted'];
  $exp = []; $ads = 0.0;
  foreach (rows('SELECT cat, amount, gst FROM acc_expenses WHERE date >= ? AND date <= ?', [$from, $to]) as $e) {
    $b = round((float)$e['amount'] / (1 + (float)$e['gst'] / 100), 2);
    if ($e['cat'] === 'Ads') $ads += $b; else $exp[(string)$e['cat']] = ($exp[(string)$e['cat']] ?? 0) + $b;
  }
  foreach (acc_ads_by_month($from, $to) as $m) $ads += $m['spend'];
  $sal = (float)(row('SELECT COALESCE(SUM(amount),0) s FROM acc_salary WHERE date >= ? AND date <= ?', [$from, $to])['s'] ?? 0);
  $tx = []; foreach (rows('SELECT cat, SUM(amount) s FROM acc_txn WHERE date >= ? AND date <= ? GROUP BY cat', [$from, $to]) as $t) $tx[$t['cat']] = (float)$t['s'];
  $oi = ($tx['interest'] ?? 0) + ($tx['other_in'] ?? 0);
  $over = $sal + $ads + array_sum($exp) + ($tx['charges'] ?? 0) + ($tx['loan_int'] ?? 0) + ($tx['other_out'] ?? 0);
  return ['sales' => $r2($c['before']), 'cost' => $r2($c['cost']), 'comm' => $r2($c['comm']), 'gross' => $r2($c['profit']), 'other_in' => $r2($oi),
    'salary' => $r2($sal), 'ads' => $r2($ads), 'exp' => array_map($r2, $exp), 'charges' => $r2($tx['charges'] ?? 0), 'loan_int' => $r2($tx['loan_int'] ?? 0), 'other_out' => $r2($tx['other_out'] ?? 0),
    'over' => $r2($over), 'net' => $r2($c['profit'] + $oi - $over), 'bills' => count($pf['rows']), 'no_cost' => $pf['no_cost']];
}
/* the statement: columns (one month, or the twelve months of a financial year and their total) and lines */
function pl_get($from, $to) {
  $cols = []; $d = $from;
  $months = (int)round((strtotime($to) - strtotime($from)) / 86400) > 35;
  if ($months) { while ($d <= $to) { $cols[] = ['key' => substr($d, 0, 7), 'label' => date('M y', strtotime($d)), 'from' => $d, 'to' => date('Y-m-t', strtotime($d))]; $d = date('Y-m-01', strtotime($d . ' +1 month')); } }
  else $cols[] = ['key' => substr($from, 0, 7), 'label' => date('M Y', strtotime($from)), 'from' => $from, 'to' => $to];
  $C = array_map(fn($c) => pl_calc($c['from'], $c['to']), $cols);
  $cats = []; foreach ($C as $x) foreach ($x['exp'] as $k => $v) $cats[$k] = 1; ksort($cats, SORT_NATURAL | SORT_FLAG_CASE);
  $line = function ($key, $label, $kind, $f) use ($C) { $v = array_map(fn($x) => round($f($x), 2), $C); return ['key' => $key, 'label' => $label, 'kind' => $kind, 'vals' => $v, 'total' => round(array_sum($v), 2)]; };
  $L = [
    ['key' => 'h_inc', 'label' => 'Income', 'kind' => 'head', 'vals' => [], 'total' => 0],
    $line('sales', 'Sales: tax bills issued, before GST', 'row', fn($x) => $x['sales']),
    $line('cost', 'Less: project cost (materials and services)', 'less', fn($x) => $x['cost']),
    $line('comm', 'Less: commission / incentive', 'less', fn($x) => $x['comm']),
    $line('gross', 'Gross profit', 'total', fn($x) => $x['gross']),
    $line('other_in', 'Other income (interest, other)', 'row', fn($x) => $x['other_in']),
    ['key' => 'h_over', 'label' => 'Overheads', 'kind' => 'head', 'vals' => [], 'total' => 0],
    $line('salary', 'Salaries', 'less', fn($x) => $x['salary']),
    $line('ads', 'Ads (Meta spend and the Ads category)', 'less', fn($x) => $x['ads']),
  ];
  foreach (array_keys($cats) as $k) $L[] = $line('exp:' . $k, $k, 'less', fn($x) => $x['exp'][$k] ?? 0);
  $L[] = $line('charges', 'Bank charges', 'less', fn($x) => $x['charges']);
  $L[] = $line('loan_int', 'Loan and cash credit interest', 'less', fn($x) => $x['loan_int']);
  $L[] = $line('other_out', 'Other payments', 'less', fn($x) => $x['other_out']);
  $L[] = $line('over', 'Total overheads', 'total', fn($x) => $x['over']);
  $L[] = $line('net', 'Net profit, before income tax', 'net', fn($x) => $x['net']);
  $L = array_values(array_filter($L, fn($l) => !in_array($l['key'], ['other_in', 'charges', 'loan_int', 'other_out'], true) || abs($l['total']) > 0.004 || array_filter($l['vals'])));
  $no = []; foreach ($C as $x) foreach ($x['no_cost'] as $n) $no[] = $n;
  return ['from' => $from, 'to' => $to, 'cols' => array_map(fn($c) => ['key' => $c['key'], 'label' => $c['label']], $cols), 'lines' => $L, 'bills' => array_sum(array_column($C, 'bills')), 'no_cost' => $no,
    'net' => round(array_sum(array_column($C, 'net')), 2), 'ads' => ads_cfg(), 'books' => books_all()];
}

/* the acc module's Salaries and Profit & loss actions; returns only when $a is not one of them */
function pl_handle($a, $in) {
  switch ($a) {
    case 'ac_pl': { [$f, $t] = acc_range(); out(pl_get($f, $t)); }

    case 'ac_salary': { /* GET &period=: the period's payments to people, a total per person, the staff to choose from */
      [$f, $t] = acc_range();
      $rows = array_map('sal_row', rows('SELECT * FROM acc_salary WHERE date >= ? AND date <= ? ORDER BY date DESC, id DESC', [$f, $t]));
      $by = [];
      foreach ($rows as $r) { $k = $r['user_id'] ? 'u' . $r['user_id'] : 'n' . mb_strtolower($r['name']); $by[$k] = ['name' => $r['name'], 'total' => ($by[$k]['total'] ?? 0) + $r['amount'], 'n' => ($by[$k]['n'] ?? 0) + 1, 'advance' => ($by[$k]['advance'] ?? 0) + ($r['kind'] === 'Advance' ? $r['amount'] : 0)]; }
      $by = array_values(array_map(fn($x) => ['name' => $x['name'], 'total' => round($x['total'], 2), 'n' => $x['n'], 'advance' => round($x['advance'], 2)], $by));
      usort($by, fn($x, $y) => $y['total'] <=> $x['total']);
      out(['from' => $f, 'to' => $t, 'rows' => $rows, 'by' => $by, 'total' => round(array_sum(array_column($rows, 'amount')), 2), 'kinds' => SAL_KINDS,
        'staff' => rows('SELECT id, name, role FROM users WHERE active=1 ORDER BY lower(name)'), 'books' => books_all()]);
    }
    case 'ac_sal': { $r = row('SELECT * FROM acc_salary WHERE id=?', [(int)($_GET['id'] ?? 0)]); if (!$r) fail('Payment not found', 404); out(['pay' => sal_row($r)]); }

    case 'salary_save': { /* POST {id?, user_id | name, kind, date, amount, for_what, book_id, ref, note} */
      need('accounts', true);
      $id = (int)($in['id'] ?? 0);
      $uid2 = (int)($in['user_id'] ?? 0); $name = acc_txt($in['name'] ?? '', 120);
      if ($uid2) { $u = row('SELECT name FROM users WHERE id=?', [$uid2]); if (!$u) fail('Staff member not found', 404); $name = (string)$u['name']; }
      if ($name === '') fail('Choose the staff member, or type the name');
      $kind = (string)($in['kind'] ?? 'Salary'); if (!in_array($kind, SAL_KINDS, true)) fail('Choose what the payment is');
      $date = book_date($in['date'] ?? '', 'Paid on');
      $amount = acc_money($in['amount'] ?? 0, 'Amount'); if ($amount <= 0) fail('Amount: enter an amount in rupees');
      $bid = (int)($in['book_id'] ?? 0); if (!row('SELECT 1 FROM acc_books WHERE id=?', [$bid])) fail('Choose the account it was paid from');
      $v = [$uid2, $name, $kind, $date, $amount, acc_txt($in['for_what'] ?? '', 80), $bid, acc_txt($in['ref'] ?? '', 60), acc_txt($in['note'] ?? '', 300)];
      if ($id) { if (!row('SELECT 1 FROM acc_salary WHERE id=?', [$id])) fail('Payment not found', 404); q('UPDATE acc_salary SET user_id=?, name=?, kind=?, date=?, amount=?, for_what=?, book_id=?, ref=?, note=?, updated=CURRENT_TIMESTAMP WHERE id=?', array_merge($v, [$id])); }
      else { q('INSERT INTO acc_salary(user_id,name,kind,date,amount,for_what,book_id,ref,note,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)', array_merge($v, [uid()])); $id = (int)db()->lastInsertId(); }
      audit('acc_salary_save', 'acc_salary', $id, "$name · $kind · $amount");
      out(['ok' => true, 'id' => $id]);
    }
    case 'salary_delete': {
      need('accounts', true);
      $id = (int)($in['id'] ?? 0); $r = row('SELECT * FROM acc_salary WHERE id=?', [$id]); if (!$r) fail('Payment not found', 404);
      trash_put('Salary payment', $r['name'] . ' · ' . $r['date'] . ' · ₹' . $r['amount'], [['acc_salary', 'id=?', [$id]]]);
      q('DELETE FROM acc_salary WHERE id=?', [$id]);
      audit('acc_salary_delete', 'acc_salary', $id, $r['name']);
      out(['ok' => true]);
    }
    case 'ads_book_save': { /* POST {book (0 = not in the book), gst}: where Meta's ad spend is paid from */
      need('accounts', true);
      $b = (int)($in['book'] ?? 0); if ($b && !row('SELECT 1 FROM acc_books WHERE id=?', [$b])) fail('Choose the account');
      kv_set('acc_ads', ['book' => $b, 'gst' => empty($in['gst']) ? 0 : 1]);
      audit('acc_ads_book', 'settings', null, $b ? "book $b" : 'off');
      out(['ok' => true, 'ads' => ads_cfg()]);
    }
  }
}
