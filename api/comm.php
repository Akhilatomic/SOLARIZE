<?php
// Finance › Commission (customers owned by a Business Associate) and Incentive (customers owned by other staff).
// Commission: the admin types the amount. Incentive (milestone scheme, customers won from INC_START on): the admin approves each
// staff customer with its lead type, then the amount is calculated; customers won before INC_START keep amounts typed by hand.
// Both are paid in two parts (amount, date, transaction ID). The admin manages both lists; a role with Incentive "Edit"
// (Settings → User access) manages the staff incentives too, except their own rows, any commission and approving.
// A BA / staff member (Incentive "View") sees their own customers switched visible, as "Commission received" / "Incentive received".
// One row per customer. Until the first save the person is the customer's owner; the save fixes it on the row.

const COMM_KINDS = ['commission' => 'Commission', 'incentive' => 'Incentive'];
const COMM_REF_MAX = 80;
// Milestone incentive. Meta / Office (company) leads: the n-th approved project in the person's calendar month earns the rate of
// the step it lands on, per kW: 1st–2nd ₹1,000, 3rd–5th ₹2,000, 6th onward ₹3,000. Own leads: ₹3,000 per kW, not counted in the steps.
const INC_TIERS = [[2, 1000], [5, 2000], [PHP_INT_MAX, 3000]];
const INC_OWN_RATE = 3000;
const INC_START = '2026-11'; // first month of the scheme
const INC_MONTH = "strftime('%Y-%m', c.created, '+330 minutes')"; // the month the customer was won (India time)
const INC_KW = 'COALESCE(NULLIF(pj.kw,0), lk.kw, 0)';          // the customer's projects, else the kW on the lead
const INC_JOINS = " LEFT JOIN (SELECT customer_id, SUM(cost) cost, SUM(kw) kw FROM projects GROUP BY customer_id) pj ON pj.customer_id=c.id
    LEFT JOIN (SELECT customer_id, MAX(kw) kw FROM leads WHERE customer_id>0 GROUP BY customer_id) lk ON lk.customer_id=c.id";

function comm_kind_of($role) { return $role === 'ba' ? 'commission' : 'incentive'; }
function comm_money($v, $label) {
  if (is_int($v) || is_float($v)) $s = (string)$v; else $s = str_replace([',', '₹', ' '], '', trim((string)$v));
  if ($s === '') return 0.0;
  if (!is_numeric($s) || (float)$s < 0 || (float)$s > 1e9) fail("$label: enter an amount in rupees");
  return round((float)$s, 2);
}
function comm_date($v, $label) {
  $v = trim((string)$v); if ($v === '') return '';
  $d = DateTime::createFromFormat('!Y-m-d', $v);
  if (!$d || $d->format('Y-m-d') !== $v) fail("$label: choose a valid date");
  return $v;
}
function inc_rate($n) { foreach (INC_TIERS as [$upto, $rate]) if ($n <= $upto) return $rate; return INC_TIERS[count(INC_TIERS) - 1][1]; }
function inc_ord($n) { return $n . (($n % 100 >= 11 && $n % 100 <= 13) ? 'th' : (['th', 'st', 'nd', 'rd'][$n % 10] ?? 'th')); }
function inc_month_label($ym) { $d = DateTime::createFromFormat('!Y-m', (string)$ym); return $d ? $d->format('M Y') : (string)$ym; }
function inc_kw_txt($kw) { return rtrim(rtrim(number_format((float)$kw, 2, '.', ''), '0'), '.'); }
function inc_calc_txt($kw, $rate, $why) { return ((float)$kw > 0 ? inc_kw_txt($kw) . ' kW × ₹' . number_format($rate) : 'kW not set yet') . ' · ' . $why; }

// what every approved staff incentive of the scheme should be: customer_id => [amount, explanation]
function inc_compute() {
  $rs = rows("SELECT c.id cid, cm.user_id, COALESCE(NULLIF(c.lead_type,''),'office') lt, " . INC_MONTH . " ym, " . INC_KW . " kw
    FROM commissions cm JOIN customers c ON c.id=cm.customer_id JOIN users u ON u.id=cm.user_id AND u.role NOT IN ('admin','ba')" . INC_JOINS . "
    WHERE cm.appr='ok' AND " . INC_MONTH . ">=? ORDER BY cm.user_id, ym, c.created, c.id", [INC_START]);
  $out = []; $n = [];
  foreach ($rs as $r) {
    $g = $r['user_id'] . '|' . $r['ym'];
    if ($r['lt'] === 'own') { $rate = INC_OWN_RATE; $why = 'own lead'; }
    else { $n[$g] = ($n[$g] ?? 0) + 1; $rate = inc_rate($n[$g]); $why = inc_ord($n[$g]) . ' Meta / Office project in ' . inc_month_label($r['ym']); }
    $out[(int)$r['cid']] = [round($rate * (float)$r['kw']), inc_calc_txt($r['kw'], $rate, $why)];
  }
  return $out;
}
// auto amounts follow the rules (kW, lead type, order in the month) until part 1 is paid on them; typed amounts stay as typed
function inc_recalc() {
  $calc = inc_compute(); if (!$calc) return;
  foreach (rows("SELECT id, customer_id, amount, calc, p1_amount FROM commissions WHERE appr='ok' AND auto=1") as $r) {
    $x = $calc[(int)$r['customer_id']] ?? null; if (!$x) continue;
    if ((float)$r['p1_amount'] > 0 && (float)$r['amount'] > 0) continue; // paid on: fixed
    if (abs((float)$r['amount'] - $x[0]) > 0.004 || (string)$r['calc'] !== $x[1]) q('UPDATE commissions SET amount=?, calc=? WHERE id=?', [$x[0], $x[1], $r['id']]);
  }
}
// customers with their person (saved on the row, else the owner), project cost, payments received, kW and lead type
function comm_rows($where, $args = []) {
  $rs = rows("SELECT c.id customer_id, c.name, c.phone, c.district, c.created c_created, cm.id,
      COALESCE(cm.amount,0) amount, COALESCE(cm.p1_amount,0) p1_amount, COALESCE(cm.p1_date,'') p1_date, COALESCE(cm.p1_ref,'') p1_ref,
      COALESCE(cm.p2_amount,0) p2_amount, COALESCE(cm.p2_date,'') p2_date, COALESCE(cm.p2_ref,'') p2_ref,
      COALESCE(cm.visible,0) visible, COALESCE(cm.note,'') note, COALESCE(cm.updated,'') updated, COALESCE(cm.updated_by,'') updated_by,
      COALESCE(cm.appr,'') appr, COALESCE(cm.appr_by,'') appr_by, COALESCE(cm.auto,0) auto, COALESCE(cm.calc,'') calc,
      COALESCE(NULLIF(c.lead_type,''),'office') lead_type, " . INC_MONTH . " ym, " . INC_KW . " kw, CASE WHEN lk.customer_id IS NULL THEN 0 ELSE 1 END from_lead,
      u.id user_id, u.name user_name, u.role user_role, u.active user_active, COALESCE(pj.cost,0) cost, COALESCE(py.amt,0) received
    FROM customers c
    LEFT JOIN commissions cm ON cm.customer_id=c.id
    JOIN users u ON u.id=COALESCE(NULLIF(cm.user_id,0), c.owner_id)" . INC_JOINS . "
    LEFT JOIN (SELECT pr.customer_id, SUM(p.amount) amt FROM payments p JOIN projects pr ON pr.id=p.project_id GROUP BY pr.customer_id) py ON py.customer_id=c.id
    WHERE $where ORDER BY c.id DESC", $args);
  foreach ($rs as &$r) {
    foreach (['amount', 'p1_amount', 'p2_amount', 'cost', 'received', 'kw'] as $k) $r[$k] = (float)$r[$k];
    foreach (['customer_id', 'user_id', 'user_active', 'visible', 'auto', 'from_lead'] as $k) $r[$k] = (int)$r[$k];
    $r['id'] = $r['id'] === null ? 0 : (int)$r['id'];
    $r['kind'] = comm_kind_of($r['user_role']);
    $r['scheme'] = $r['kind'] === 'incentive' && $r['ym'] >= INC_START ? 1 : 0;   // milestone scheme: needs the admin's approval
    $r['pending'] = $r['scheme'] && $r['appr'] === '' ? 1 : 0;
  }
  unset($r);
  return $rs;
}
// for the admin's approval box: what a waiting customer would earn as a company lead (its place in the month) or as an own lead
function inc_previews(&$rs) {
  $done = [];
  foreach ($rs as $r) if ($r['scheme'] && $r['appr'] === 'ok' && $r['lead_type'] !== 'own') $done[$r['user_id'] . '|' . $r['ym']][] = [$r['c_created'], $r['customer_id']];
  foreach ($rs as &$r) {
    if (!$r['pending']) continue;
    $pos = 1; foreach ($done[$r['user_id'] . '|' . $r['ym']] ?? [] as [$at, $id]) if ([$at, $id] < [$r['c_created'], $r['customer_id']]) $pos++;
    $rate = inc_rate($pos);
    $r['preview'] = ['pos' => $pos, 'company' => round($rate * $r['kw']), 'company_txt' => inc_calc_txt($r['kw'], $rate, inc_ord($pos) . ' Meta / Office project in ' . inc_month_label($r['ym'])),
      'own' => round(INC_OWN_RATE * $r['kw']), 'own_txt' => inc_calc_txt($r['kw'], INC_OWN_RATE, 'own lead')];
  }
  unset($r);
}
function comm_people() {
  return array_map(fn($u) => ['id' => (int)$u['id'], 'name' => $u['name'], 'role' => $u['role'], 'role_name' => ROLE_NAMES[$u['role']] ?? $u['role'], 'active' => (int)$u['active'], 'kind' => comm_kind_of($u['role'])],
    rows("SELECT id, name, role, active FROM users WHERE role<>'admin' ORDER BY active DESC, name COLLATE NOCASE"));
}
// who manages a list: the admin both; a user with Incentive "Edit" the staff incentives
function comm_can_manage($kind) { return is_admin() || ($kind === 'incentive' && can('incentive', true)); }

function handle_comm($a) {
  $in = body();
  switch ($a) {
    case 'list': // the whole list for whoever manages it (&mine=1: just my own, as the person paid)
      inc_recalc();
      $kind = isset(COMM_KINDS[$_GET['kind'] ?? '']) ? $_GET['kind'] : (is_ba() ? 'commission' : 'incentive');
      if (comm_can_manage($kind) && (is_admin() || empty($_GET['mine']))) {
        $rs = comm_rows("u.role<>'admin' AND " . ($kind === 'commission' ? "u.role='ba'" : "u.role<>'ba'"));
        foreach ($rs as &$r) $r['own'] = !is_admin() && $r['user_id'] === uid() ? 1 : 0; unset($r); // my own row: read-only for me
        if ($kind === 'incentive') inc_previews($rs);
        $people = comm_people(); if (!is_admin()) $people = array_values(array_filter($people, fn($p) => $p['kind'] === 'incentive'));
        out(['kind' => $kind, 'manage' => true, 'admin' => is_admin(), 'rows' => $rs, 'people' => $people, 'start' => INC_START, 'lead_types' => LEAD_TYPES]);
      }
      // a BA or staff member: only their own rows the admin made visible, without the admin's note
      $kind = comm_kind_of($_SESSION['role'] ?? '');
      if ($kind === 'incentive' && !can('incentive')) fail('Not allowed for your role', 403);
      $keep = ['customer_id', 'name', 'district', 'amount', 'p1_amount', 'p1_date', 'p1_ref', 'p2_amount', 'p2_date', 'p2_ref', 'cost', 'received', 'kind', 'lead_type', 'ym', 'kw', 'calc', 'auto', 'scheme'];
      $rs = array_map(fn($r) => array_intersect_key($r, array_flip($keep)), comm_rows("cm.user_id=? AND cm.visible=1 AND COALESCE(cm.appr,'')<>'no'", [uid()]));
      out(['kind' => $kind, 'manage' => false, 'admin' => false, 'rows' => $rs, 'start' => INC_START, 'lead_types' => LEAD_TYPES]);

    case 'milestone': // one person's month: approved Meta / Office projects against the steps, own leads, and what waits for approval
      $who = (int)($_GET['user_id'] ?? 0) ?: uid();
      if ($who !== uid() && !comm_can_manage('incentive')) fail('Not allowed for your role', 403);
      if ($who === uid() && !is_admin() && (is_ba() || !can('incentive'))) fail('Not allowed for your role', 403);
      $u = row('SELECT id, name, role FROM users WHERE id=?', [$who]);
      if (!$u || in_array($u['role'], ['admin', 'ba'], true)) fail('Milestones are for staff incentives', 404);
      $ym = preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', (string)($_GET['month'] ?? '')) ? $_GET['month'] : date('Y-m');
      inc_recalc();
      $m = ['company' => 0, 'own' => 0, 'pending' => 0, 'company_amt' => 0.0, 'own_amt' => 0.0];
      if ($ym >= INC_START) foreach (rows("SELECT COALESCE(cm.appr,'') appr, COALESCE(NULLIF(c.lead_type,''),'office') lt, COALESCE(cm.amount,0) amount
          FROM customers c LEFT JOIN commissions cm ON cm.customer_id=c.id WHERE COALESCE(NULLIF(cm.user_id,0), c.owner_id)=" . (int)$who . " AND " . INC_MONTH . "=?", [$ym]) as $r) { /* the id inline: a bound value is text, and COALESCE() has no column type to convert it */
        if ($r['appr'] === '') { $m['pending']++; continue; }
        if ($r['appr'] !== 'ok') continue;
        $k = $r['lt'] === 'own' ? 'own' : 'company'; $m[$k]++; $m[$k . '_amt'] += (float)$r['amount'];
      }
      out($m + ['user_id' => (int)$u['id'], 'name' => $u['name'], 'month' => $ym, 'label' => date('F Y', strtotime($ym . '-01')), 'start' => INC_START, 'start_label' => date('F Y', strtotime(INC_START . '-01')),
        'scheme' => $ym >= INC_START, 'earned' => $m['company_amt'] + $m['own_amt'], 'own_rate' => INC_OWN_RATE,
        'tiers' => array_map(fn($t) => [$t[0] === PHP_INT_MAX ? null : $t[0], $t[1]], INC_TIERS)]);

    case 'for_customer': // GET, admin: one customer's commission / incentive for the customer profile tab (row null = no BA or staff member assigned yet)
      if (!is_admin()) fail('Not allowed for your role', 403);
      inc_recalc();
      $cid = (int)($_GET['customer_id'] ?? 0);
      $c = row('SELECT id, name FROM customers WHERE id=?', [$cid]); if (!$c) fail('Customer not found', 404);
      $r = comm_rows('c.id=' . $cid)[0] ?? null;
      if ($r && $r['user_role'] === 'admin') $r = null; /* owned by an admin: on neither list until someone is assigned */
      if ($r && $r['pending']) { /* the approval preview needs the person's month, so work it out over the whole incentive list */
        $all = comm_rows("u.role NOT IN ('admin','ba')"); inc_previews($all);
        foreach ($all as $x) if ($x['customer_id'] === $cid) { $r = $x; break; }
      }
      out(['customer' => ['id' => (int)$c['id'], 'name' => $c['name']], 'row' => $r, 'people' => comm_people(), 'start' => INC_START, 'lead_types' => LEAD_TYPES]);

    case 'candidates': // customers on neither list (no owner, or owned by an admin), to add one by hand
      if (!comm_can_manage('incentive')) fail('Not allowed for your role', 403);
      out(rows("SELECT c.id, c.name, c.phone, c.district, " . INC_MONTH . " ym, EXISTS(SELECT 1 FROM leads l WHERE l.customer_id=c.id) from_lead FROM customers c LEFT JOIN commissions cm ON cm.customer_id=c.id
        LEFT JOIN users u ON u.id=COALESCE(NULLIF(cm.user_id,0), c.owner_id) WHERE u.id IS NULL OR u.role='admin' ORDER BY c.id DESC LIMIT 2000"));

    case 'approve': // admin: a staff customer of the scheme is eligible (ok=1, with its lead type) or not (ok=0)
      if (!is_admin()) fail('Only the admin approves incentives', 403);
      $cid = (int)($in['customer_id'] ?? 0);
      $c = row('SELECT c.id, c.name, c.owner_id, ' . INC_MONTH . ' ym FROM customers c WHERE c.id=?', [$cid]); if (!$c) fail('Customer not found', 404);
      $lt = (string)($in['lead_type'] ?? ''); if (!isset(LEAD_TYPES[$lt])) fail('Choose the lead type: Own lead, Office or Meta');
      if ($lt === 'meta' && !cust_from_lead($cid)) fail('This customer was added directly, not from a lead, so it cannot be Meta. Choose Own lead or Office.');
      $old = row('SELECT * FROM commissions WHERE customer_id=?', [$cid]);
      $u = row('SELECT id, name, role FROM users WHERE id=?', [(int)($in['user_id'] ?? 0) ?: ((int)($old['user_id'] ?? 0) ?: (int)$c['owner_id'])]);
      if (!$u || in_array($u['role'], ['admin', 'ba'], true)) fail('Choose the staff member this incentive is for');
      $ok = !empty($in['ok']);
      if (!$ok && $old && (float)$old['p1_amount'] > 0) fail('Part payments are recorded on this incentive. Clear them before marking it not eligible.');
      $vis = array_key_exists('visible', $in) ? (empty($in['visible']) ? 0 : 1) : ($ok ? 1 : 0);
      $by = $_SESSION['name'] ?? '';
      $auto = $ok ? ($old && !(int)$old['auto'] && (float)$old['amount'] > 0 ? 0 : 1) : 0; // a typed amount stays typed
      q('UPDATE customers SET lead_type=? WHERE id=?', [$lt, $cid]);
      if ($old) q("UPDATE commissions SET user_id=?, appr=?, appr_by=?, appr_at=CURRENT_TIMESTAMP, auto=?, amount=?, calc=?, visible=?, updated_by=?, updated=CURRENT_TIMESTAMP WHERE id=?",
        [(int)$u['id'], $ok ? 'ok' : 'no', $by, $auto, $ok ? (float)$old['amount'] : 0, $ok ? (string)$old['calc'] : '', $vis, $by, $old['id']]); // not eligible: no amount
      else q("INSERT INTO commissions(customer_id, user_id, appr, appr_by, appr_at, auto, visible, updated_by) VALUES(?,?,?,?,CURRENT_TIMESTAMP,?,?,?)", [$cid, (int)$u['id'], $ok ? 'ok' : 'no', $by, $auto, $vis, $by]);
      inc_recalc();
      $id = (int)row('SELECT id FROM commissions WHERE customer_id=?', [$cid])['id'];
      audit('approve', 'commissions', $id, "{$c['name']} · incentive " . ($ok ? 'approved' : 'not eligible') . ' · ' . LEAD_TYPES[$lt] . " · {$u['name']}");
      $rs = comm_rows('c.id=?', [$cid]);
      out(['ok' => true, 'row' => $rs[0] ?? null]);

    case 'save': // any of user_id, amount, auto, p1_*, p2_*, visible, note; fields not sent keep their value
      if (!comm_can_manage('incentive')) fail('Not allowed for your role', 403);
      $cid = (int)($in['customer_id'] ?? 0);
      $c = row('SELECT c.id, c.name, c.owner_id, ' . INC_MONTH . ' ym FROM customers c WHERE c.id=?', [$cid]); if (!$c) fail('Customer not found', 404);
      $old = row('SELECT * FROM commissions WHERE customer_id=?', [$cid]);
      if ($old && !is_admin()) { // an incentive manager: never someone's commission, never their own incentive
        $was = row('SELECT id, role FROM users WHERE id=?', [(int)$old['user_id']]);
        if ($was && $was['role'] === 'ba') fail('Only the admin can change commission', 403);
        if ((int)$old['user_id'] === uid()) fail('You cannot change your own incentive', 403);
      }
      $f = $old ?: ['user_id' => (int)$c['owner_id'], 'amount' => 0, 'p1_amount' => 0, 'p1_date' => '', 'p1_ref' => '', 'p2_amount' => 0, 'p2_date' => '', 'p2_ref' => '', 'visible' => 0, 'note' => '', 'appr' => '', 'appr_by' => '', 'appr_at' => '', 'auto' => 0];
      if (array_key_exists('user_id', $in)) $f['user_id'] = (int)$in['user_id'];
      $u = row('SELECT id, name, role FROM users WHERE id=?', [(int)$f['user_id']]);
      if (!$u || $u['role'] === 'admin') fail('Choose the Business Associate or staff member this is for');
      if (!is_admin() && $u['role'] === 'ba') fail('Only the admin can record commission for a Business Associate', 403);
      if (!is_admin() && (int)$u['id'] === uid()) fail('You cannot change your own incentive', 403);
      $label = COMM_KINDS[comm_kind_of($u['role'])];
      $scheme = comm_kind_of($u['role']) === 'incentive' && $c['ym'] >= INC_START;
      if ($scheme && ($f['appr'] ?? '') === 'no') fail('This customer was marked not eligible. Approve it first.', 409);
      if ($scheme && ($f['appr'] ?? '') !== 'ok') { // the admin's save (with an amount) approves it; anyone else waits for the admin
        if (!is_admin()) fail('Waiting for the admin to approve this customer', 409);
        if (!array_diff(array_keys($in), ['customer_id', 'visible', 'note'])) fail('Approve this customer first', 409); // a Visible click alone does not approve
        $f['appr'] = 'ok'; $f['appr_by'] = $_SESSION['name'] ?? ''; $f['appr_at'] = gmdate('Y-m-d H:i:s');
        $f['auto'] = (float)$f['amount'] > 0 ? 0 : 1; // an amount typed before stays typed
        if (!array_key_exists('visible', $in)) $f['visible'] = 1;
      }
      if (array_key_exists('auto', $in)) $f['auto'] = empty($in['auto']) ? 0 : 1;
      elseif ($scheme && array_key_exists('amount', $in) && trim((string)$in['amount']) !== '' && abs(comm_money($in['amount'], $label . ' amount') - (float)$f['amount']) > 0.004) $f['auto'] = 0; // typed a different amount
      if (!$scheme) $f['auto'] = 0;
      if (!$f['auto'] && array_key_exists('amount', $in)) $f['amount'] = comm_money($in['amount'], $label . ' amount');
      foreach ([1, 2] as $n) {
        if (array_key_exists("p{$n}_amount", $in)) $f["p{$n}_amount"] = comm_money($in["p{$n}_amount"], "Part $n amount");
        if (array_key_exists("p{$n}_date", $in)) $f["p{$n}_date"] = comm_date($in["p{$n}_date"], "Part $n date");
        if (array_key_exists("p{$n}_ref", $in)) $f["p{$n}_ref"] = mb_substr(trim((string)$in["p{$n}_ref"]), 0, COMM_REF_MAX);
        $amt = (float)$f["p{$n}_amount"];
        if ($amt > 0 && $f["p{$n}_date"] === '') fail("Part $n: enter the date it was paid");
        if ($amt <= 0 && ($f["p{$n}_date"] !== '' || $f["p{$n}_ref"] !== '')) fail("Part $n: enter the amount paid, or clear its date and transaction ID");
      }
      if ((float)$f['p2_amount'] > 0 && (float)$f['p1_amount'] <= 0) fail('Record part 1 before part 2');
      $paid = (float)$f['p1_amount'] + (float)$f['p2_amount'];
      if (array_key_exists('visible', $in)) $f['visible'] = empty($in['visible']) || $in['visible'] === '0' ? 0 : 1;
      if (array_key_exists('note', $in)) $f['note'] = mb_substr(trim((string)$in['note']), 0, 500);
      if (!$f['auto']) $f['calc'] = '';
      $v = [(int)$u['id'], (float)$f['amount'], (float)$f['p1_amount'], $f['p1_date'], $f['p1_ref'], (float)$f['p2_amount'], $f['p2_date'], $f['p2_ref'], (int)$f['visible'], $f['note'], $_SESSION['name'] ?? '',
        (string)($f['appr'] ?? ''), (string)($f['appr_by'] ?? ''), (string)($f['appr_at'] ?? ''), (int)$f['auto'], (string)($f['calc'] ?? '')];
      $db = db(); $db->beginTransaction();
      if ($old) { q('UPDATE commissions SET user_id=?, amount=?, p1_amount=?, p1_date=?, p1_ref=?, p2_amount=?, p2_date=?, p2_ref=?, visible=?, note=?, updated_by=?, appr=?, appr_by=?, appr_at=?, auto=?, calc=?, updated=CURRENT_TIMESTAMP WHERE id=?', array_merge($v, [$old['id']])); $id = (int)$old['id']; }
      else { q('INSERT INTO commissions(user_id, amount, p1_amount, p1_date, p1_ref, p2_amount, p2_date, p2_ref, visible, note, updated_by, appr, appr_by, appr_at, auto, calc, customer_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', array_merge($v, [$cid])); $id = (int)db()->lastInsertId(); }
      if ($scheme) inc_recalc(); // an auto amount is worked out now (and the person's month follows a changed order)
      $amount = (float)row('SELECT amount FROM commissions WHERE id=?', [$id])['amount'];
      if ($paid > $amount + 0.005) { $db->rollBack(); fail("Paid so far (₹" . number_format($paid) . ") is more than the $label amount (₹" . number_format($amount) . ')'); }
      $db->commit();
      // admin-only audit entry (entity 'commissions' never reaches the customer timeline)
      audit('save', 'commissions', $id, "{$c['name']} · $label for {$u['name']} · ₹" . number_format($amount) . ($f['auto'] ? ' (calculated)' : '') . ' · paid ₹' . number_format($paid) . ($f['visible'] ? ' · visible' : ' · hidden'));
      out(['ok' => true, 'row' => comm_rows('c.id=?', [$cid])[0] ?? null]);
  }
  fail('Unknown action', 404);
}
