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
  if ($r) q('UPDATE fees SET alert=CASE WHEN paid=1 AND paid_on=? THEN alert ELSE 0 END, paid=1, paid_on=?, amount=CASE WHEN ?>0 THEN ? ELSE amount END, ref=CASE WHEN ?<>\'\' THEN ? ELSE ref END, updated=CURRENT_TIMESTAMP WHERE id=?', [fee_date($date), fee_date($date), $amount, $amount, $ref, $ref, $r['id']]);
  else q('INSERT INTO fees(customer_id,kind,amount,paid,paid_on,ref,demanded,demanded_on) VALUES(?,?,?,1,?,?,1,?)', [$customer_id, $kind, $amount > 0 ? $amount : fee_default_amount($kind), fee_date($date), (string)$ref, fee_date($date)]);
  fee_sync_expense($customer_id, $kind);
  fee_feas_clean($customer_id); /* feasibility paid again or registration fee paid: that customer's old expiry notifications go */
}
// a paid / unpaid fee goes onto the customer's Project cost sheet (api/accounts.php acc_fee_sync); the fee itself is saved either way
function fee_sync_expense($customer_id, $kind) {
  try { if (function_exists('acc_fee_sync')) acc_fee_sync((int)$customer_id, $kind); } catch (Throwable $e) { error_log('fee → expense sync: ' . $e->getMessage()); }
}

/* Feasibility bell notifications that no longer apply are removed (owner, 2026-11-25: an expired feasibility ends in only two ways, the
   feasibility is paid again or the registration fee is paid; "after that reset the notification, also remove the previous notification").
   A customer keeps 'feas' notifications only while the feasibility is paid, an alert of THIS payment was sent (alert > 0; a new payment
   date sets it back to 0, so the warnings start again for the new date), the registration fee is not paid and the project is not
   completed. $cid = one customer (right after a payment change), null = everyone (hourly, which also clears old leftovers). */
function fee_feas_clean($cid = null) {
  $one = $cid ? ' AND n.customer_id=' . (int)$cid : ''; /* inlined int: bound values compare as text in SQLite expressions */
  q("DELETE FROM notifs WHERE id IN (SELECT n.id FROM notifs n WHERE n.kind='feas' AND n.customer_id IS NOT NULL$one AND (
      EXISTS(SELECT 1 FROM fees r WHERE r.customer_id=n.customer_id AND r.kind='registration' AND r.paid=1)
      OR EXISTS(SELECT 1 FROM projects p WHERE p.customer_id=n.customer_id AND p.stage='Project completed')
      OR NOT EXISTS(SELECT 1 FROM fees f WHERE f.customer_id=n.customer_id AND f.kind='feasibility' AND f.paid=1 AND f.alert>0)))");
}

// hourly: feasibility about to expire (≤ 3 days) or expired → bell + desktop notification to everyone who works on Finance,
// only while the registration fee is not paid and the project is not completed (as the pop-up and the AF/RF column)
function fee_alerts() {
  fee_feas_clean();
  $today = new DateTime(date('Y-m-d'));
  $to = array_values(array_filter(rows('SELECT id, role FROM users WHERE active=1'), fn($u) => $u['role'] === 'admin' || disc_role_can($u['role'], 'fees')));
  foreach (rows("SELECT f.*, c.name FROM fees f JOIN customers c ON c.id=f.customer_id WHERE f.kind='feasibility' AND f.paid=1 AND f.paid_on<>'' AND f.alert<2
      AND NOT EXISTS(SELECT 1 FROM fees r WHERE r.customer_id=f.customer_id AND r.kind='registration' AND r.paid=1)
      AND NOT EXISTS(SELECT 1 FROM projects p WHERE p.customer_id=f.customer_id AND p.stage='Project completed')") as $f) {
    $exp = (new DateTime($f['paid_on']))->modify('+' . rule('feas_valid_days') . ' days'); $left = (int)$today->diff($exp)->format('%r%a');
    $lvl = $left < 0 ? 2 : ($left <= rule('feas_alert_days') ? 1 : 0);
    if ($lvl <= (int)$f['alert']) continue;
    $text = $lvl === 2 ? "Feasibility EXPIRED for {$f['name']} on " . $exp->format('d M Y') . ' — renew the feasibility payment'
      : "Feasibility for {$f['name']} expires " . ($left === 0 ? 'today' : "in $left day" . ($left === 1 ? '' : 's')) . ' (' . $exp->format('d M Y') . ')';
    foreach ($to as $u) notif_add($u['id'], 'feas', $text, ['customer_id' => $f['customer_id']]);
    q('UPDATE fees SET alert=? WHERE id=?', [$lvl, $f['id']]);
  }
}

const FEAS_POP_HOURS = 3; /* the feasibility-expiry pop-up comes back every 3 hours until dismissed (owner's rule 2026-11-20) */
function handle_fees($a) {
  $in = body();
  switch ($a) {
    case 'list':
      need('fees'); $kind = fee_kind($_GET['kind'] ?? '');
      /* a lead on the list (not a customer until its feasibility is paid) shows with the lead's name, phone and place */
      $rs = rows('SELECT f.*, COALESCE(c.name, ld.name) name, COALESCE(c.phone, ld.phone) phone, c.consumer_no, COALESCE(c.address, NULLIF(ld.location,\'\'), ld.address) address, COALESCE(c.district, ld.city) district, c.pincode, c.kseb_section, c.landmark, CASE WHEN c.id IS NULL THEN 1 ELSE 0 END is_lead
        FROM fees f LEFT JOIN customers c ON c.id=f.customer_id LEFT JOIN leads ld ON f.customer_id IS NULL AND ld.id=f.lead_id WHERE f.kind=? AND (c.id IS NOT NULL OR ld.id IS NOT NULL) ORDER BY f.paid ASC, CASE WHEN f.paid_on<>\'\' THEN f.paid_on ELSE f.created END DESC, f.id DESC', [$kind]);
      if ($kind === 'feasibility') { $today = new DateTime(date('Y-m-d'));
        foreach ($rs as &$r) if ((int)$r['paid'] && $r['paid_on']) { $e = (new DateTime($r['paid_on']))->modify('+' . rule('feas_valid_days') . ' days'); $r['expires'] = $e->format('Y-m-d'); $r['days_left'] = (int)$today->diff($e)->format('%r%a'); }
        unset($r); }
      out(['kind' => $kind, 'title' => FEE_KINDS[$kind], 'valid_days' => rule('feas_valid_days'), 'alert_days' => rule('feas_alert_days'), 'rows' => $rs, 'default_amount' => fee_default_amount($kind)]);

    case 'feas_left': // the AF/RF column: customers whose feasibility (AF) clock is running — paid, registration fee (RF) not paid yet,
      // project not completed — and customers whose registration fee is paid ({rf: 1, rf_on}).
      // Dates only, no amounts — shown on every page to everyone who can see customers or projects (a BA: their own customers).
      if (!can('customers') && !can('projects')) fail('Not allowed for your role', 403);
      $m = []; $today = new DateTime(date('Y-m-d')); $days = rule('feas_valid_days');
      foreach (rows("SELECT f.customer_id, f.paid_on FROM fees f JOIN customers c ON c.id=f.customer_id WHERE f.kind='feasibility' AND f.paid=1 AND f.paid_on<>'' AND " . cust_scope('c') . "
        AND NOT EXISTS(SELECT 1 FROM fees r WHERE r.customer_id=f.customer_id AND r.kind='registration' AND r.paid=1)
        AND NOT EXISTS(SELECT 1 FROM projects p WHERE p.customer_id=f.customer_id AND p.stage='Project completed')") as $r) {
        try { $e = (new DateTime($r['paid_on']))->modify("+$days days"); } catch (Throwable $x) { continue; }
        $m[(int)$r['customer_id']] = ['paid_on' => $r['paid_on'], 'expires' => $e->format('Y-m-d'), 'days_left' => (int)$today->diff($e)->format('%r%a')];
      }
      foreach (rows("SELECT f.customer_id, f.paid_on FROM fees f JOIN customers c ON c.id=f.customer_id WHERE f.kind='registration' AND f.paid=1 AND " . cust_scope('c')) as $r) $m[(int)$r['customer_id']] = ['rf' => 1, 'rf_on' => (string)$r['paid_on']];
      out($m ?: new stdClass);
    /* Feasibility about to expire — the CRM's own pop-up with a warning sound (owner's rule 2026-11-20): every paid feasibility with
       0..feas_alert_days days left (registration fee not paid, project not completed). It comes back every FEAS_POP_HOURS until this
       person dismisses that customer's one; a new payment date brings it back. Kept per person in settings feaspop_<user id>. */
    case 'feas_alerts': // GET
      need('fees');
      $st = kv_get('feaspop_' . uid(), ['seen' => 0, 'dis' => []]); $days = rule('feas_valid_days'); $warn = rule('feas_alert_days');
      $today = new DateTime(date('Y-m-d')); $list = [];
      foreach (rows("SELECT f.id, f.customer_id, f.paid_on, c.name, c.phone, c.consumer_no FROM fees f JOIN customers c ON c.id=f.customer_id WHERE f.kind='feasibility' AND f.paid=1 AND f.paid_on<>'' AND " . cust_scope('c') . "
          AND NOT EXISTS(SELECT 1 FROM fees r WHERE r.customer_id=f.customer_id AND r.kind='registration' AND r.paid=1)
          AND NOT EXISTS(SELECT 1 FROM projects p WHERE p.customer_id=f.customer_id AND p.stage='Project completed')") as $r) {
        try { $e = (new DateTime($r['paid_on']))->modify("+$days days"); } catch (Throwable $x) { continue; }
        $left = (int)$today->diff($e)->format('%r%a');
        if ($left < 0 || $left > $warn) continue;
        if (($st['dis'][(string)$r['id']] ?? null) === $r['paid_on']) continue; /* dismissed for this payment */
        $list[] = ['id' => (int)$r['id'], 'customer_id' => (int)$r['customer_id'], 'name' => $r['name'], 'phone' => $r['phone'], 'consumer_no' => $r['consumer_no'], 'expires' => $e->format('Y-m-d'), 'days_left' => $left];
      }
      usort($list, fn($a, $b) => $a['days_left'] <=> $b['days_left']);
      out(['rows' => $list, 'seen' => (int)$st['seen'], 'every' => FEAS_POP_HOURS * 3600, 'now' => time(), 'warn_days' => $warn]);
    case 'feas_seen': // the pop-up was shown (or closed with "Remind me later"): the next one comes FEAS_POP_HOURS from now, on every device
      need('fees');
      $st = kv_get('feaspop_' . uid(), ['seen' => 0, 'dis' => []]); $st['seen'] = time(); kv_set('feaspop_' . uid(), $st); out(['ok' => true]);
    case 'feas_dismiss': // {ids: [fee id, …]} — no more pop-ups for these customers until their feasibility is paid again
      need('fees');
      $st = kv_get('feaspop_' . uid(), ['seen' => 0, 'dis' => []]); $dis = (array)$st['dis'];
      foreach (array_slice(array_map('intval', (array)($in['ids'] ?? [])), 0, 500) as $fid) { $f = row("SELECT paid_on FROM fees WHERE id=? AND kind='feasibility'", [$fid]); if ($f) $dis[(string)$fid] = $f['paid_on']; }
      foreach ($dis as $k => $v) if (!row('SELECT 1 FROM fees WHERE id=? AND paid_on=?', [(int)$k, $v])) unset($dis[$k]); /* forget ones that no longer apply */
      $st['dis'] = $dis; $st['seen'] = time(); kv_set('feaspop_' . uid(), $st); out(['ok' => true]);
    case 'member': // which Finance lists each customer is on (for the customer menus)
      need('fees'); $cid = (int)($_GET['customer_id'] ?? 0);
      $m = []; $today = new DateTime(date('Y-m-d'));
      foreach (rows('SELECT customer_id, kind, paid, paid_on, demanded, demanded_on, amount FROM fees WHERE customer_id IS NOT NULL' . ($cid ? ' AND customer_id=' . $cid : '')) as $r) {
        $m[$r['customer_id']][$r['kind']] = (int)$r['paid'];
        if ($r['kind'] === 'feasibility') { $x = ['paid' => (int)$r['paid'], 'paid_on' => $r['paid_on'], 'demanded' => (int)$r['demanded'], 'demanded_on' => $r['demanded_on'], 'amount' => (float)$r['amount']];
          if ($x['paid'] && $r['paid_on']) { $e = (new DateTime($r['paid_on']))->modify('+' . rule('feas_valid_days') . ' days'); $x['expires'] = $e->format('Y-m-d'); $x['days_left'] = (int)$today->diff($e)->format('%r%a'); }
          $m[$r['customer_id']]['_feas'] = $x; }
      }
      out($m ?: new stdClass);
    case 'candidates': // customers not yet on this list
      need('fees'); $kind = fee_kind($_GET['kind'] ?? '');
      out(rows('SELECT c.id, c.name, c.phone, c.consumer_no, c.district, c.kseb_section FROM customers c WHERE c.id NOT IN (SELECT customer_id FROM fees WHERE kind=? AND customer_id IS NOT NULL) ORDER BY c.created DESC LIMIT 1000', [$kind]));

    case 'add':
      need('fees', true); $kind = fee_kind($in['kind'] ?? ''); $amt = fee_default_amount($kind); $n = 0;
      foreach (array_slice(array_map('intval', (array)($in['customer_ids'] ?? [])), 0, 500) as $cid)
        if (row('SELECT 1 FROM customers WHERE id=?', [$cid]) && !row('SELECT 1 FROM fees WHERE customer_id=? AND kind=?', [$cid, $kind])) { q('INSERT INTO fees(customer_id,kind,amount) VALUES(?,?,?)', [$cid, $kind, $amt]); $n++; }
      audit('fees_add', 'fees', null, FEE_KINDS[$kind] . ": $n customer(s)"); out(['ok' => true, 'added' => $n]);

    case 'lead_add': // Leads ⋯ › Add to feasibility — anyone who can see the lead. It stays a lead; marking the feasibility paid makes it a customer.
      need('leads'); $kind = 'feasibility';
      $l = row('SELECT l.* FROM leads l WHERE l.id=? AND ' . lead_scope(), [(int)($in['lead_id'] ?? 0)]); if (!$l) fail('Not found', 404);
      if ($l['customer_id']) { $cid = (int)$l['customer_id']; /* converted already: the customer goes on the list */
        if (row('SELECT 1 FROM fees WHERE customer_id=? AND kind=?', [$cid, $kind])) out(['ok' => true, 'added' => 0]);
        q('INSERT INTO fees(customer_id,lead_id,kind,amount,by_uid) VALUES(?,?,?,?,?)', [$cid, $l['id'], $kind, fee_default_amount($kind), uid()]);
        audit('fees_add', 'customers', $cid, FEE_KINDS[$kind] . ' · from Leads'); out(['ok' => true, 'added' => 1]); }
      if (row('SELECT 1 FROM fees WHERE lead_id=? AND kind=?', [$l['id'], $kind])) out(['ok' => true, 'added' => 0]);
      q('INSERT INTO fees(lead_id,kind,amount,by_uid) VALUES(?,?,?,?)', [$l['id'], $kind, fee_default_amount($kind), uid()]);
      audit('fees_add', 'leads', $l['id'], FEE_KINDS[$kind]); out(['ok' => true, 'added' => 1]);

    case 'set':
      need('fees', true);
      $f = row('SELECT f.*, COALESCE(c.name, ld.name) name FROM fees f LEFT JOIN customers c ON c.id=f.customer_id LEFT JOIN leads ld ON f.customer_id IS NULL AND ld.id=f.lead_id WHERE f.id=? AND (c.id IS NOT NULL OR ld.id IS NOT NULL)', [(int)($in['id'] ?? 0)]); if (!$f) fail('Not found', 404);
      $conv = 0;
      if (!$f['customer_id'] && !empty($in['paid'])) { /* a lead whose feasibility is paid becomes a customer now (no quotation / plant cost asked) */
        $l = row('SELECT * FROM leads WHERE id=?', [(int)$f['lead_id']]); if (!$l) fail('Not found', 404);
        if ($l['customer_id']) { q('UPDATE fees SET customer_id=? WHERE id=?', [(int)$l['customer_id'], $f['id']]); $f['customer_id'] = (int)$l['customer_id']; }
        else { $f['customer_id'] = lead_convert($l, null, (int)$f['by_uid'], 'feasibility paid'); $conv = $f['customer_id']; }
      }
      $u = [];
      if (array_key_exists('demanded', $in)) { $u['demanded'] = empty($in['demanded']) ? 0 : 1; $u['demanded_on'] = $u['demanded'] ? fee_date($in['demanded_on'] ?? '') : ''; }
      if (array_key_exists('paid', $in)) { $u['paid'] = empty($in['paid']) ? 0 : 1; $u['paid_on'] = $u['paid'] ? fee_date($in['paid_on'] ?? '') : ''; if ($u['paid'] !== (int)$f['paid'] || $u['paid_on'] !== (string)$f['paid_on']) $u['alert'] = 0; /* a new payment (date) restarts the expiry warnings */ if ($u['paid'] && !(int)$f['demanded']) { $u['demanded'] = 1; $u['demanded_on'] = $u['paid_on']; } }
      if (array_key_exists('amount', $in)) $u['amount'] = max(0, min(10000000, (float)$in['amount']));
      if (array_key_exists('ref', $in)) $u['ref'] = mb_substr(trim((string)$in['ref']), 0, 80);
      if (array_key_exists('note', $in)) $u['note'] = mb_substr(trim((string)$in['note']), 0, 300);
      if (!$u) fail('Nothing to change');
      $set = implode(',', array_map(fn($k) => "$k=?", array_keys($u)));
      q("UPDATE fees SET $set, updated=CURRENT_TIMESTAMP WHERE id=?", [...array_values($u), $f['id']]);
      if (isset($u['paid']) || ((int)$f['paid'] && (isset($u['amount']) || isset($u['ref'])))) fee_sync_expense($f['customer_id'], $f['kind']); /* paid / purchased → Project cost sheet */
      if (isset($u['paid'])) { try { pipe_fee_sync((int)$f['customer_id'], $f['kind']); } catch (Throwable $e) { error_log('fee → pipeline sync: ' . $e->getMessage()); } } /* paid / not paid → the pipeline step */
      if (isset($u['paid']) && $f['customer_id']) fee_feas_clean($f['customer_id']); /* feasibility paid again / registration fee paid: the old expiry notifications go */
      if (!$f['customer_id']) { audit('fees_edit', 'leads', $f['lead_id'], FEE_KINDS[$f['kind']]); out(['ok' => true]); } /* a lead: nothing synced until it is paid */
      audit('fees_' . (isset($u['paid']) ? ($u['paid'] ? 'paid' : 'unpaid') : (isset($u['demanded']) ? 'demanded' : 'edit')), 'customers', $f['customer_id'], FEE_KINDS[$f['kind']] . (isset($u['paid_on']) && $u['paid_on'] ? ' · ' . $u['paid_on'] : '') . (isset($u['amount']) ? ' · ₹' . $u['amount'] : ''));
      out(['ok' => true] + ($conv ? ['converted' => $conv] : []));

    case 'remove':
      need('fees', true);
      $f = row('SELECT f.*, COALESCE(c.name, ld.name) name FROM fees f LEFT JOIN customers c ON c.id=f.customer_id LEFT JOIN leads ld ON f.customer_id IS NULL AND ld.id=f.lead_id WHERE f.id=? AND (c.id IS NOT NULL OR ld.id IS NOT NULL)', [(int)($in['id'] ?? 0)]); if (!$f) fail('Not found', 404);
      if (!$f['customer_id']) { trash_put('Finance entry', FEE_KINDS[$f['kind']] . ' · ' . $f['name'] . ' (lead)', [['fees', 'id=?', [$f['id']]]], [['leads', $f['lead_id'], 'the lead']]);
        q('DELETE FROM fees WHERE id=?', [$f['id']]); audit('fees_remove', 'leads', $f['lead_id'], FEE_KINDS[$f['kind']]); out(['ok' => true]); }
      trash_put('Finance entry', FEE_KINDS[$f['kind']] . ' · ' . $f['name'], [['fees', 'id=?', [$f['id']]]], [['customers', $f['customer_id'], 'the customer']]);
      q('DELETE FROM fees WHERE id=?', [$f['id']]); try { pipe_fee_sync((int)$f['customer_id'], $f['kind']); } catch (Throwable $e) { } fee_feas_clean($f['customer_id']); audit('fees_remove', 'customers', $f['customer_id'], FEE_KINDS[$f['kind']]); out(['ok' => true]);
  }
  fail('Unknown action', 404);
}
