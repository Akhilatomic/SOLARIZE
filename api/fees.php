<?php
// Finance: KSEB feasibility fee (valid 30 days from payment, alert 3 days before expiry), registration fee, stamp paper.
// One row per customer per kind. Pipeline receipts for feasibility / registration mark the fee paid automatically.

const FEE_KINDS = ['feasibility' => 'Feasibility fee', 'registration' => 'Registration fee', 'stamp' => 'Stamp paper'];
const FEE_DEFAULT = ['feasibility' => 1000, 'registration' => 3108, 'stamp' => 200];
const FEAS_VALID_DAYS = 30;
const FEAS_ALERT_DAYS = 3;

function fee_kind($k) { if (!isset(FEE_KINDS[$k])) fail('Unknown list'); return $k; }
function fee_date($d) { return preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$d) && strtotime($d) ? $d : date('Y-m-d'); }
function fee_default_amount($kind) { $r = row('SELECT amount FROM fees WHERE kind=? AND amount>0 ORDER BY id DESC LIMIT 1', [$kind]); return $r ? (float)$r['amount'] : FEE_DEFAULT[$kind]; }

// called from the pipeline when a KSEB receipt is uploaded
function fee_from_receipt($customer_id, $stageKey, $amount, $date, $ref) {
  $kind = ['feas_pay' => 'feasibility', 'reg_pay' => 'registration'][$stageKey] ?? null; if (!$kind || !$customer_id) return;
  $r = row('SELECT id FROM fees WHERE customer_id=? AND kind=?', [$customer_id, $kind]);
  if ($r) q('UPDATE fees SET paid=1, paid_on=?, amount=CASE WHEN ?>0 THEN ? ELSE amount END, ref=CASE WHEN ?<>\'\' THEN ? ELSE ref END, alert=0, updated=CURRENT_TIMESTAMP WHERE id=?', [fee_date($date), $amount, $amount, $ref, $ref, $r['id']]);
  else q('INSERT INTO fees(customer_id,kind,amount,paid,paid_on,ref,demanded,demanded_on) VALUES(?,?,?,1,?,?,1,?)', [$customer_id, $kind, $amount > 0 ? $amount : fee_default_amount($kind), fee_date($date), (string)$ref, fee_date($date)]);
  fee_sync_expense($customer_id, $kind);
}
// a paid / unpaid fee goes onto the customer's Project cost sheet (api/accounts.php acc_fee_sync); the fee itself is saved either way
function fee_sync_expense($customer_id, $kind) {
  try { if (function_exists('acc_fee_sync')) acc_fee_sync((int)$customer_id, $kind); } catch (Throwable $e) { error_log('fee → expense sync: ' . $e->getMessage()); }
}

// hourly: feasibility about to expire (≤ 3 days) or expired → bell + desktop notification to everyone who works on Finance
function fee_alerts() {
  $today = new DateTime(date('Y-m-d'));
  $to = array_values(array_filter(rows('SELECT id, role FROM users WHERE active=1'), fn($u) => $u['role'] === 'admin' || disc_role_can($u['role'], 'fees')));
  foreach (rows("SELECT f.*, c.name FROM fees f JOIN customers c ON c.id=f.customer_id WHERE f.kind='feasibility' AND f.paid=1 AND f.paid_on<>'' AND f.alert<2") as $f) {
    $exp = (new DateTime($f['paid_on']))->modify('+' . rule('feas_valid_days') . ' days'); $left = (int)$today->diff($exp)->format('%r%a');
    $lvl = $left < 0 ? 2 : ($left <= rule('feas_alert_days') ? 1 : 0);
    if ($lvl <= (int)$f['alert']) continue;
    $text = $lvl === 2 ? "Feasibility EXPIRED for {$f['name']} on " . $exp->format('d M Y') . ' — renew the feasibility payment'
      : "Feasibility for {$f['name']} expires " . ($left === 0 ? 'today' : "in $left day" . ($left === 1 ? '' : 's')) . ' (' . $exp->format('d M Y') . ')';
    foreach ($to as $u) q("INSERT INTO notifs(user_id,kind,customer_id,from_id,text) VALUES(?,'feas',?,NULL,?)", [$u['id'], $f['customer_id'], $text]);
    q('UPDATE fees SET alert=? WHERE id=?', [$lvl, $f['id']]);
  }
}

function handle_fees($a) {
  $in = body();
  switch ($a) {
    case 'list':
      need('fees'); $kind = fee_kind($_GET['kind'] ?? '');
      $rs = rows('SELECT f.*, c.name, c.phone, c.consumer_no, c.address, c.district, c.pincode, c.kseb_section, c.landmark FROM fees f JOIN customers c ON c.id=f.customer_id WHERE f.kind=? ORDER BY f.paid ASC, CASE WHEN f.paid_on<>\'\' THEN f.paid_on ELSE f.created END DESC, f.id DESC', [$kind]);
      if ($kind === 'feasibility') { $today = new DateTime(date('Y-m-d'));
        foreach ($rs as &$r) if ((int)$r['paid'] && $r['paid_on']) { $e = (new DateTime($r['paid_on']))->modify('+' . rule('feas_valid_days') . ' days'); $r['expires'] = $e->format('Y-m-d'); $r['days_left'] = (int)$today->diff($e)->format('%r%a'); }
        unset($r); }
      out(['kind' => $kind, 'title' => FEE_KINDS[$kind], 'valid_days' => rule('feas_valid_days'), 'alert_days' => rule('feas_alert_days'), 'rows' => $rs, 'default_amount' => fee_default_amount($kind)]);

    case 'member': // which Finance lists each customer is on (for the customer menus)
      need('fees'); $cid = (int)($_GET['customer_id'] ?? 0);
      $m = []; $today = new DateTime(date('Y-m-d'));
      foreach (rows('SELECT customer_id, kind, paid, paid_on, demanded, demanded_on, amount FROM fees' . ($cid ? ' WHERE customer_id=' . $cid : '')) as $r) {
        $m[$r['customer_id']][$r['kind']] = (int)$r['paid'];
        if ($r['kind'] === 'feasibility') { $x = ['paid' => (int)$r['paid'], 'paid_on' => $r['paid_on'], 'demanded' => (int)$r['demanded'], 'demanded_on' => $r['demanded_on'], 'amount' => (float)$r['amount']];
          if ($x['paid'] && $r['paid_on']) { $e = (new DateTime($r['paid_on']))->modify('+' . rule('feas_valid_days') . ' days'); $x['expires'] = $e->format('Y-m-d'); $x['days_left'] = (int)$today->diff($e)->format('%r%a'); }
          $m[$r['customer_id']]['_feas'] = $x; }
      }
      out($m ?: new stdClass);
    case 'candidates': // customers not yet on this list
      need('fees'); $kind = fee_kind($_GET['kind'] ?? '');
      out(rows('SELECT c.id, c.name, c.phone, c.consumer_no, c.district, c.kseb_section FROM customers c WHERE c.id NOT IN (SELECT customer_id FROM fees WHERE kind=?) ORDER BY c.created DESC LIMIT 1000', [$kind]));

    case 'add':
      need('fees', true); $kind = fee_kind($in['kind'] ?? ''); $amt = fee_default_amount($kind); $n = 0;
      foreach (array_slice(array_map('intval', (array)($in['customer_ids'] ?? [])), 0, 500) as $cid)
        if (row('SELECT 1 FROM customers WHERE id=?', [$cid]) && !row('SELECT 1 FROM fees WHERE customer_id=? AND kind=?', [$cid, $kind])) { q('INSERT INTO fees(customer_id,kind,amount) VALUES(?,?,?)', [$cid, $kind, $amt]); $n++; }
      audit('fees_add', 'fees', null, FEE_KINDS[$kind] . ": $n customer(s)"); out(['ok' => true, 'added' => $n]);

    case 'set':
      need('fees', true);
      $f = row('SELECT f.*, c.name FROM fees f JOIN customers c ON c.id=f.customer_id WHERE f.id=?', [(int)($in['id'] ?? 0)]); if (!$f) fail('Not found', 404);
      $u = [];
      if (array_key_exists('demanded', $in)) { $u['demanded'] = empty($in['demanded']) ? 0 : 1; $u['demanded_on'] = $u['demanded'] ? fee_date($in['demanded_on'] ?? '') : ''; }
      if (array_key_exists('paid', $in)) { $u['paid'] = empty($in['paid']) ? 0 : 1; $u['paid_on'] = $u['paid'] ? fee_date($in['paid_on'] ?? '') : ''; $u['alert'] = 0; if ($u['paid'] && !(int)$f['demanded']) { $u['demanded'] = 1; $u['demanded_on'] = $u['paid_on']; } }
      if (array_key_exists('amount', $in)) $u['amount'] = max(0, min(10000000, (float)$in['amount']));
      if (array_key_exists('ref', $in)) $u['ref'] = mb_substr(trim((string)$in['ref']), 0, 80);
      if (array_key_exists('note', $in)) $u['note'] = mb_substr(trim((string)$in['note']), 0, 300);
      if (!$u) fail('Nothing to change');
      $set = implode(',', array_map(fn($k) => "$k=?", array_keys($u)));
      q("UPDATE fees SET $set, updated=CURRENT_TIMESTAMP WHERE id=?", [...array_values($u), $f['id']]);
      if (isset($u['paid']) || ((int)$f['paid'] && (isset($u['amount']) || isset($u['ref'])))) fee_sync_expense($f['customer_id'], $f['kind']); /* paid / purchased → Project cost sheet */
      audit('fees_' . (isset($u['paid']) ? ($u['paid'] ? 'paid' : 'unpaid') : (isset($u['demanded']) ? 'demanded' : 'edit')), 'customers', $f['customer_id'], FEE_KINDS[$f['kind']] . (isset($u['paid_on']) && $u['paid_on'] ? ' · ' . $u['paid_on'] : '') . (isset($u['amount']) ? ' · ₹' . $u['amount'] : ''));
      out(['ok' => true]);

    case 'remove':
      need('fees', true);
      $f = row('SELECT f.*, c.name FROM fees f JOIN customers c ON c.id=f.customer_id WHERE f.id=?', [(int)($in['id'] ?? 0)]); if (!$f) fail('Not found', 404);
      trash_put('Finance entry', FEE_KINDS[$f['kind']] . ' · ' . $f['name'], [['fees', 'id=?', [$f['id']]]], [['customers', $f['customer_id'], 'the customer']]);
      q('DELETE FROM fees WHERE id=?', [$f['id']]); audit('fees_remove', 'customers', $f['customer_id'], FEE_KINDS[$f['kind']]); out(['ok' => true]);
  }
  fail('Unknown action', 404);
}
