<?php
// Accounts › GST (stage 3 of the company books): the GST working for a month or a financial year. Nothing is stored: it is computed from
// the tax bills issued (GST collected) and from purchases, supplier bills and office expenses (input credit) every time.
const GST_FEE_NOTE = 'From Finance › Fees';

/* a tax bill's taxable value and tax by rate: [[rate, hsn, taxable, tax], …]. Part A / Part B bills use their own split (as the bill prints
   it); item bills use their lines; a bill with neither falls back to its saved totals. */
function gst_bill_rates($d, $inter) {
  $r2 = fn($x) => round($x, 2); $out = [];
  $pt = $d['parts'] ?? null;
  if (is_array($pt) && isset($pt['a'], $pt['b'])) {
    $sh = min(100, max(0, (float)($pt['share'] ?? 0))); $ga = (float)($pt['a']['gst'] ?? 0); $gb = (float)($pt['b']['gst'] ?? 0);
    $T = $r2((float)($pt['total'] ?? 0) / (1 + ($sh * $ga + (100 - $sh) * $gb) / 10000)); $atv = $r2($T * $sh / 100);
    foreach ([[$atv, $ga, 'a'], [$r2($T - $atv), $gb, 'b']] as [$tv, $g, $k]) if ($tv > 0) $out[] = [$g, (string)($pt[$k]['hsn'] ?? ''), $tv, $inter ? $r2($tv * $g / 100) : 2 * $r2($tv * $g / 200)];
    return $out;
  }
  $by = [];
  foreach ((array)($d['items'] ?? []) as $it) {
    if (!is_array($it) || trim((string)($it['desc'] ?? '')) === '') continue;
    $tv = (float)($it['qty'] ?? 0) * (float)($it['rate'] ?? 0); $g = (float)($it['gst'] ?? 0); $k = $g . '|' . ($it['hsn'] ?? '');
    $by[$k] = [$g, (string)($it['hsn'] ?? ''), ($by[$k][2] ?? 0) + $tv, ($by[$k][3] ?? 0) + $tv * $g / 100];
  }
  foreach ($by as $x) if ($x[2] > 0) $out[] = [$x[0], $x[1], $r2($x[2]), $r2($x[3])];
  if (!$out && (float)($d['taxable'] ?? 0) > 0) $out[] = [-1, '', $r2((float)$d['taxable']), $r2((float)($d['tax'] ?? 0))]; /* rate not known */
  return $out;
}

function gst_working($from, $to) {
  $r2 = fn($x) => round($x, 2);
  /* ---- GST collected: tax bills issued in the period ---- */
  $sales = []; $obr = []; $out = ['taxable' => 0.0, 'cgst' => 0.0, 'sgst' => 0.0, 'igst' => 0.0, 'tax' => 0.0];
  foreach (rows("SELECT g.customer_id, g.number, g.issued_on, g.data, c.name FROM gen_docs g JOIN customers c ON c.id=g.customer_id WHERE g.kind='tax' AND g.issued_on >= ? AND g.issued_on <= ? ORDER BY g.issued_on, g.id", [$from, $to]) as $b) {
    $d = json_decode((string)$b['data'], true) ?: []; $inter = !empty($d['interstate']);
    $tv = 0.0; $tx = 0.0;
    foreach (gst_bill_rates($d, $inter) as [$g, $hsn, $t1, $t2]) {
      $tv += $t1; $tx += $t2; $k = (string)$g;
      $obr[$k] = ['rate' => $g, 'taxable' => ($obr[$k]['taxable'] ?? 0) + $t1, 'cgst' => ($obr[$k]['cgst'] ?? 0) + ($inter ? 0 : $t2 / 2), 'sgst' => ($obr[$k]['sgst'] ?? 0) + ($inter ? 0 : $t2 / 2), 'igst' => ($obr[$k]['igst'] ?? 0) + ($inter ? $t2 : 0), 'tax' => ($obr[$k]['tax'] ?? 0) + $t2];
    }
    $sales[] = ['customer_id' => (int)$b['customer_id'], 'no' => (string)$b['number'], 'date' => (string)$b['issued_on'], 'customer' => (string)($d['bill_name'] ?? '') ?: $b['name'], 'address' => trim((string)preg_replace('/\s+/', ' ', (string)($d['bill_address'] ?? ''))), 'gstin' => (string)($d['cust_gstin'] ?? ''),
      'inter' => $inter ? 1 : 0, 'taxable' => $r2($tv), 'tax' => $r2($tx), 'total' => $r2((float)($d['grand'] ?? ($tv + $tx)))];
    $out['taxable'] += $tv; $out['tax'] += $tx; if ($inter) $out['igst'] += $tx; else { $out['cgst'] += $tx / 2; $out['sgst'] += $tx / 2; }
  }
  /* ---- input credit ---- */
  $gstin = []; foreach (rows('SELECT name, gstin FROM acc_suppliers') as $s) $gstin[sup_key($s['name'])] = (string)$s['gstin'];
  $mark = function ($supplier) use ($gstin) {
    $k = sup_key($supplier);
    if ($k === '') return ['check', 'No supplier named on the purchase', ''];
    if (!isset($gstin[$k])) return ['check', 'Supplier is not in the supplier list', ''];
    if ($gstin[$k] === '') return ['check', 'No GSTIN for this supplier in the supplier list', ''];
    return ['yes', '', $gstin[$k]];
  };
  $P = []; $ibr = [];
  $rate = function ($g, $tv, $tx) use (&$ibr) { $k = (string)$g; $ibr[$k] = ['rate' => $g, 'taxable' => ($ibr[$k]['taxable'] ?? 0) + $tv, 'tax' => ($ibr[$k]['tax'] ?? 0) + $tx]; };
  /* purchased lines of the Project cost sheets, one row per supplier + bill (no bill no.: per project + day) */
  $g = [];
  foreach (rows("SELECT k.project_id, k.name, k.qty, k.rate, k.gst, k.supplier, k.bill_no, k.bill_date, k.bought_on, k.note, c.name c_name FROM acc_costs k JOIN projects p ON p.id=k.project_id JOIN customers c ON c.id=p.customer_id WHERE k.bought=1 AND k.rate>0 AND k.gst>0") as $r) {
    $d = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$r['bill_date']) ? $r['bill_date'] : (string)$r['bought_on'];
    if ($d < $from || $d > $to || dues_is_direct($r['supplier'], $r['bill_no'])) continue;
    $fee = $r['note'] === GST_FEE_NOTE; $bn = trim((string)$r['bill_no']);
    $k = ($fee ? 'fee|' : '') . sup_key($r['supplier']) . '|' . ($bn !== '' ? 'b:' . sup_key($bn) : 'p:' . (int)$r['project_id'] . ':' . $d);
    $tv = $r2((float)$r['qty'] * (float)$r['rate']); $tx = $r2($tv * (float)$r['gst'] / 100);
    if (!isset($g[$k])) $g[$k] = ['src' => 'sheet', 'date' => $d, 'supplier' => trim((string)$r['supplier']), 'bill_no' => $bn, 'taxable' => 0.0, 'tax' => 0.0, 'n' => 0, 'one' => $r['name'], 'who' => [], 'fee' => $fee, 'project_id' => (int)$r['project_id'], 'rates' => []];
    $g[$k]['taxable'] += $tv; $g[$k]['tax'] += $tx; $g[$k]['n']++; $g[$k]['who'][$r['c_name']] = 1; $g[$k]['rates'][] = [(float)$r['gst'], $tv, $tx];
    if ($d < $g[$k]['date']) $g[$k]['date'] = $d;
  }
  foreach ($g as $x) {
    [$m, $why, $gn] = $x['fee'] ? ['no', 'KSEB fee: the bill is in the customer’s name', ''] : $mark($x['supplier']);
    $P[] = ['src' => 'sheet', 'date' => $x['date'], 'supplier' => $x['supplier'] !== '' ? $x['supplier'] : 'Supplier not named', 'gstin' => $gn, 'bill_no' => $x['bill_no'], 'what' => implode(', ', array_keys($x['who'])) . ' · ' . ($x['n'] === 1 ? $x['one'] : $x['n'] . ' items'),
      'taxable' => $r2($x['taxable']), 'tax' => $r2($x['tax']), 'total' => $r2($x['taxable'] + $x['tax']), 'mark' => $m, 'why' => $why, 'link' => '#/accounts/cost/' . $x['project_id']];
    if ($m !== 'no') foreach ($x['rates'] as [$gr, $tv, $tx]) $rate($gr, $tv, $tx);
  }
  /* supplier bills added directly */
  foreach (rows('SELECT * FROM acc_bills WHERE date >= ? AND date <= ? AND gst_amt > 0', [$from, $to]) as $b) {
    [$m, $why, $gn] = $mark($b['supplier']); $tx = $r2((float)$b['gst_amt']); $tv = $r2((float)$b['amount'] - $tx);
    $P[] = ['src' => 'bill', 'date' => (string)$b['date'], 'supplier' => (string)$b['supplier'], 'gstin' => $gn, 'bill_no' => (string)$b['bill_no'], 'what' => (string)$b['note'], 'taxable' => $tv, 'tax' => $tx, 'total' => $r2((float)$b['amount']), 'mark' => $m, 'why' => $why, 'link' => '#/accounts/dues'];
    $rate(-1, $tv, $tx);
  }
  /* office expenses with GST: the supplier's GSTIN is not on record, so they are always to check */
  foreach (rows('SELECT * FROM acc_expenses WHERE date >= ? AND date <= ? AND gst > 0', [$from, $to]) as $e) {
    $tv = $r2((float)$e['amount'] / (1 + (float)$e['gst'] / 100)); $tx = $r2((float)$e['amount'] - $tv);
    $P[] = ['src' => 'expense', 'date' => (string)$e['date'], 'supplier' => trim((string)$e['paid_to']) !== '' ? (string)$e['paid_to'] : 'Not named', 'gstin' => '', 'bill_no' => '', 'what' => 'Expense · ' . $e['cat'] . ($e['note'] ? ' · ' . $e['note'] : ''),
      'taxable' => $tv, 'tax' => $tx, 'total' => $r2((float)$e['amount']), 'mark' => 'check', 'why' => 'Office expense: needs a GST bill in the company’s GSTIN', 'link' => '#/accounts/expenses'];
    $rate((float)$e['gst'], $tv, $tx);
  }
  usort($P, fn($a, $b) => [$a['date'], $a['supplier'], $a['bill_no']] <=> [$b['date'], $b['supplier'], $b['bill_no']]);
  $itc = ['yes' => 0.0, 'check' => 0.0, 'no' => 0.0];
  foreach ($P as $p) $itc[$p['mark']] += $p['tax'];
  $itc = array_map($r2, $itc); $out = array_map($r2, $out);
  $round = function ($by) use ($r2) { $by = array_values($by); usort($by, fn($a, $b) => $a['rate'] <=> $b['rate']); foreach ($by as &$x) foreach ($x as $k => $v) if ($k !== 'rate') $x[$k] = $r2($v); unset($x); return $by; };
  return ['from' => $from, 'to' => $to, 'out' => $out + ['by' => $round($obr), 'n' => count($sales)], 'itc' => $itc + ['by' => $round($ibr), 'n' => count($P)],
    'net' => $r2($out['tax'] - $itc['yes']), 'net_if_all' => $r2($out['tax'] - $itc['yes'] - $itc['check']), 'sales' => $sales, 'purchases' => $P];
}

/* the acc module's GST action; returns only when $a is not it */
function gst_handle($a) {
  if ($a !== 'ac_gst') return;
  [$f, $t] = acc_range();
  out(gst_working($f, $t));
}
