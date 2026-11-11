<?php
// Finance › Commission (customers owned by a Business Associate) and Incentive (customers owned by other staff).
// The admin types the amount and records it paid in two parts (amount, date, transaction ID). Only the admin sees the lists;
// a BA / staff member sees just their own customers the admin switched visible, as "Commission received" / "Incentive received".
// One row per customer. Until the first save the person is the customer's owner; the save fixes it on the row, so reassigning
// the customer later does not move commission already agreed.

const COMM_KINDS = ['commission' => 'Commission', 'incentive' => 'Incentive'];
const COMM_REF_MAX = 80;

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
// customers with their person (saved on the row, else the owner), project cost and payments received (all of the customer's projects)
function comm_rows($where, $args = []) {
  $rs = rows("SELECT c.id customer_id, c.name, c.phone, c.district, cm.id,
      COALESCE(cm.amount,0) amount, COALESCE(cm.p1_amount,0) p1_amount, COALESCE(cm.p1_date,'') p1_date, COALESCE(cm.p1_ref,'') p1_ref,
      COALESCE(cm.p2_amount,0) p2_amount, COALESCE(cm.p2_date,'') p2_date, COALESCE(cm.p2_ref,'') p2_ref,
      COALESCE(cm.visible,0) visible, COALESCE(cm.note,'') note, COALESCE(cm.updated,'') updated, COALESCE(cm.updated_by,'') updated_by,
      u.id user_id, u.name user_name, u.role user_role, u.active user_active, COALESCE(pj.cost,0) cost, COALESCE(py.amt,0) received
    FROM customers c
    LEFT JOIN commissions cm ON cm.customer_id=c.id
    JOIN users u ON u.id=COALESCE(NULLIF(cm.user_id,0), c.owner_id)
    LEFT JOIN (SELECT customer_id, SUM(cost) cost FROM projects GROUP BY customer_id) pj ON pj.customer_id=c.id
    LEFT JOIN (SELECT pr.customer_id, SUM(p.amount) amt FROM payments p JOIN projects pr ON pr.id=p.project_id GROUP BY pr.customer_id) py ON py.customer_id=c.id
    WHERE $where ORDER BY c.id DESC", $args);
  foreach ($rs as &$r) {
    foreach (['amount', 'p1_amount', 'p2_amount', 'cost', 'received'] as $k) $r[$k] = (float)$r[$k];
    foreach (['customer_id', 'user_id', 'user_active', 'visible'] as $k) $r[$k] = (int)$r[$k];
    $r['id'] = $r['id'] === null ? 0 : (int)$r['id'];
    $r['kind'] = comm_kind_of($r['user_role']);
  }
  unset($r);
  return $rs;
}
function comm_people() {
  return array_map(fn($u) => ['id' => (int)$u['id'], 'name' => $u['name'], 'role' => $u['role'], 'role_name' => ROLE_NAMES[$u['role']] ?? $u['role'], 'active' => (int)$u['active'], 'kind' => comm_kind_of($u['role'])],
    rows("SELECT id, name, role, active FROM users WHERE role<>'admin' ORDER BY active DESC, name COLLATE NOCASE"));
}
// non-admins: how many customers the admin has shared with me (decides whether the menu shows "Incentive received")
function comm_shared_count($uid) { try { return (int)(row('SELECT COUNT(*) n FROM commissions WHERE user_id=? AND visible=1', [(int)$uid])['n'] ?? 0); } catch (Throwable $e) { return 0; } }

function handle_comm($a) {
  $in = body();
  switch ($a) {
    case 'list':
      if (is_admin()) {
        $kind = isset(COMM_KINDS[$_GET['kind'] ?? '']) ? $_GET['kind'] : 'commission';
        $rs = comm_rows("u.role<>'admin' AND " . ($kind === 'commission' ? "u.role='ba'" : "u.role<>'ba'"));
        out(['kind' => $kind, 'admin' => true, 'rows' => $rs, 'people' => comm_people()]);
      }
      // a BA or staff member: only their own rows the admin made visible, without the admin's note
      $kind = comm_kind_of($_SESSION['role'] ?? '');
      $keep = ['customer_id', 'name', 'district', 'amount', 'p1_amount', 'p1_date', 'p1_ref', 'p2_amount', 'p2_date', 'p2_ref', 'cost', 'received', 'kind'];
      $rs = array_map(fn($r) => array_intersect_key($r, array_flip($keep)), comm_rows('cm.user_id=? AND cm.visible=1', [uid()]));
      out(['kind' => $kind, 'admin' => false, 'rows' => $rs]);

    case 'candidates': // admin: customers on neither list (no owner, or owned by an admin), to add one by hand
      if (!is_admin()) fail('Not allowed for your role', 403);
      out(rows("SELECT c.id, c.name, c.phone, c.district FROM customers c LEFT JOIN commissions cm ON cm.customer_id=c.id
        LEFT JOIN users u ON u.id=COALESCE(NULLIF(cm.user_id,0), c.owner_id) WHERE u.id IS NULL OR u.role='admin' ORDER BY c.id DESC LIMIT 2000"));

    case 'save': // admin: any of user_id, amount, p1_*, p2_*, visible, note; fields not sent keep their value
      if (!is_admin()) fail('Only the admin can record commission and incentive', 403);
      $cid = (int)($in['customer_id'] ?? 0);
      $c = row('SELECT id, name, owner_id FROM customers WHERE id=?', [$cid]); if (!$c) fail('Customer not found', 404);
      $old = row('SELECT * FROM commissions WHERE customer_id=?', [$cid]);
      $f = $old ?: ['user_id' => (int)$c['owner_id'], 'amount' => 0, 'p1_amount' => 0, 'p1_date' => '', 'p1_ref' => '', 'p2_amount' => 0, 'p2_date' => '', 'p2_ref' => '', 'visible' => 0, 'note' => ''];
      if (array_key_exists('user_id', $in)) $f['user_id'] = (int)$in['user_id'];
      $u = row('SELECT id, name, role FROM users WHERE id=?', [(int)$f['user_id']]);
      if (!$u || $u['role'] === 'admin') fail('Choose the Business Associate or staff member this is for');
      $label = COMM_KINDS[comm_kind_of($u['role'])];
      if (array_key_exists('amount', $in)) $f['amount'] = comm_money($in['amount'], $label . ' amount');
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
      if ($paid > (float)$f['amount'] + 0.005) fail("Paid so far (₹" . number_format($paid) . ") is more than the $label amount (₹" . number_format((float)$f['amount']) . ')');
      if (array_key_exists('visible', $in)) $f['visible'] = empty($in['visible']) || $in['visible'] === '0' ? 0 : 1;
      if (array_key_exists('note', $in)) $f['note'] = mb_substr(trim((string)$in['note']), 0, 500);
      $v = [(int)$u['id'], (float)$f['amount'], (float)$f['p1_amount'], $f['p1_date'], $f['p1_ref'], (float)$f['p2_amount'], $f['p2_date'], $f['p2_ref'], (int)$f['visible'], $f['note'], $_SESSION['name'] ?? ''];
      if ($old) { q('UPDATE commissions SET user_id=?, amount=?, p1_amount=?, p1_date=?, p1_ref=?, p2_amount=?, p2_date=?, p2_ref=?, visible=?, note=?, updated_by=?, updated=CURRENT_TIMESTAMP WHERE id=?', array_merge($v, [$old['id']])); $id = (int)$old['id']; }
      else { q('INSERT INTO commissions(user_id, amount, p1_amount, p1_date, p1_ref, p2_amount, p2_date, p2_ref, visible, note, updated_by, customer_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', array_merge($v, [$cid])); $id = (int)db()->lastInsertId(); }
      // admin-only audit entry (entity 'commissions' never reaches the customer timeline)
      audit('save', 'commissions', $id, "{$c['name']} · $label for {$u['name']} · ₹" . number_format((float)$f['amount']) . ' · paid ₹' . number_format($paid) . ($f['visible'] ? ' · visible' : ' · hidden'));
      out(['ok' => true, 'row' => comm_rows('c.id=?', [$cid])[0] ?? null]);
  }
  fail('Unknown action', 404);
}
