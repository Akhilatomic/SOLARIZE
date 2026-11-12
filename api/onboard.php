<?php
// A new customer starts with the approved quotation and the total plant cost (owner's rule, Nov 2026):
// - adding a customer or converting a lead needs the approved quotation (kept on the Documents page until someone deletes it — only an
//   admin can) and the total plant cost, with a note when the KSEB charges are paid on top of it;
// - the plant cost with the payments received shows on the profile Overview for the admin only (profile/cost_get), who can also correct it.
// The cost sits in its own table (cust_cost), so it never travels with the customer record to other screens or roles.

const ONB_RELOAD = 'Adding a customer now needs the approved quotation and the total plant cost. Reload the page (Ctrl+F5) and add the customer again.';
const ONB_NUM = '/[,\s₹]/u';

/* Checks what came with a new customer and puts the quotation file in place. Returns what onboard_store() keeps, or null when an admin's
   bulk tool (file import, CSV, the API) adds the customer without the papers. Everyone else must send both. */
function onboard_check($in) {
  $fl = $_FILES['quote'] ?? null; $has = $fl && (int)($fl['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
  if (!$has && !array_key_exists('plant_cost', $in)) { if (is_admin()) return null; fail(ONB_RELOAD); }
  $cost = (float)preg_replace(ONB_NUM, '', (string)($in['plant_cost'] ?? ''));
  if (!($cost > 0)) fail('Enter the total plant cost');
  if ($cost > 1e9) fail('The total plant cost is too large');
  if (!$has) fail('Upload the approved quotation');
  $ext = sec_upload($fl, ['image', 'pdf'], 10);
  $extra = in_array(strtolower((string)($in['kseb_extra'] ?? '')), ['1', 'true', 'on', 'yes'], true) ? 1 : 0;
  $amt = $extra ? max(0, min(1e7, (float)preg_replace(ONB_NUM, '', (string)($in['kseb_extra_amt'] ?? '')))) : 0;
  /* the file is put in place before the customer is made: if it cannot be saved, nothing is created */
  $name = bin2hex(random_bytes(12)) . '.' . $ext;
  if (!move_uploaded_file($fl['tmp_name'], up_dir() . "/$name")) fail('Could not save the quotation', 500);
  return ['cost' => round($cost, 2), 'extra' => $extra, 'amt' => round($amt, 2), 'path' => $name, 'name' => mb_substr(basename((string)$fl['name']), -190), 'size' => (int)$fl['size']];
}
function onboard_store($cid, $o) {
  if (!$o) return;
  cust_cost_set($cid, $o['cost'], $o['extra'], $o['amt']);
  approved_quote_add($cid, $o['path'], $o['name'], $o['size']);
  audit('approved_quote', 'customers', $cid, 'Approved quotation · plant cost ₹' . number_format($o['cost']) . ($o['extra'] ? ' · KSEB charges additional' . ($o['amt'] > 0 ? ' ₹' . number_format($o['amt']) : '') : ''));
}
/* the approved quotation is a document that stays until someone deletes it (files.life 0); only an admin can delete it (files/delete) */
function approved_quote_add($cid, $path, $name, $size) {
  q('INSERT INTO files(customer_id,kind,item,name,path,size,user,life) VALUES(?,?,?,?,?,?,?,0)', [$cid, 'approved', 'Approved quotation', $name, $path, $size, $_SESSION['username'] ?? '']);
  return (int)db()->lastInsertId();
}
function cust_cost_set($cid, $cost, $extra, $amt) {
  q('INSERT INTO cust_cost(customer_id,plant_cost,kseb_extra,kseb_extra_amt,updated_by) VALUES(?,?,?,?,?) ON CONFLICT(customer_id) DO UPDATE SET plant_cost=excluded.plant_cost, kseb_extra=excluded.kseb_extra, kseb_extra_amt=excluded.kseb_extra_amt, updated_by=excluded.updated_by, updated=CURRENT_TIMESTAMP',
    [$cid, $cost, $extra ? 1 : 0, $extra ? $amt : 0, $_SESSION['name'] ?? '']);
}
/* a new project takes the agreed plant cost when no value was typed for it */
function cust_cost_to_project($cid, $pid) {
  $c = row('SELECT plant_cost FROM cust_cost WHERE customer_id=?', [(int)$cid]);
  if ($c && (float)$c['plant_cost'] > 0) q('UPDATE projects SET cost=? WHERE id=? AND COALESCE(cost,0)=0', [(float)$c['plant_cost'], (int)$pid]);
}

/* Overview › Plant cost and payments. The plant cost the accounts go by is the project's value; until a project has one it is the cost
   agreed when the customer was added. Payments are listed per project. */
function cust_cost_summary($cid) {
  $c = row('SELECT * FROM cust_cost WHERE customer_id=?', [$cid]) ?: ['plant_cost' => 0, 'kseb_extra' => 0, 'kseb_extra_amt' => 0, 'updated_by' => '', 'updated' => ''];
  $projs = rows('SELECT id, title, kw, cost, loan, stage FROM projects WHERE customer_id=? ORDER BY id', [$cid]);
  $pcost = 0; $paid = 0;
  foreach ($projs as &$p) {
    $p['cost'] = (float)$p['cost'];
    $p['payments'] = rows('SELECT id, date, amount, mode, ref_no, receipt_no, src, note FROM payments WHERE project_id=? ORDER BY date, id', [$p['id']]);
    foreach ($p['payments'] as &$x) { $x['amount'] = (float)$x['amount']; $x['src'] = $x['src'] === 'bank' ? 'bank' : 'customer'; } unset($x);
    $p['paid'] = array_sum(array_column($p['payments'], 'amount')); $pcost += $p['cost']; $paid += $p['paid'];
  }
  unset($p);
  $cost = $pcost > 0 ? $pcost : (float)$c['plant_cost'];
  $q = row("SELECT id, name, size, created, user FROM files WHERE customer_id=? AND kind='approved' ORDER BY id DESC LIMIT 1", [$cid]);
  return ['cost' => $cost, 'agreed' => (float)$c['plant_cost'], 'from_project' => $pcost > 0 ? 1 : 0, 'kseb_extra' => (int)$c['kseb_extra'], 'kseb_extra_amt' => (float)$c['kseb_extra_amt'],
    'updated_by' => (string)$c['updated_by'], 'updated' => (string)$c['updated'], 'projects' => $projs, 'paid' => $paid, 'balance' => max(0, round($cost - $paid, 2)), 'quote' => $q ?: null, 'track' => acc_track_state($cid)];
}
/* profile/cost_get (GET) and profile/cost_save (POST): admin only */
function handle_cust_cost($a) {
  if (!is_admin()) fail('Only an admin can see the plant cost here', 403);
  if ($a === 'cost_get') {
    $cid = (int)($_GET['customer_id'] ?? 0); if (!row('SELECT id FROM customers WHERE id=?', [$cid])) fail('Customer not found', 404);
    out(cust_cost_summary($cid));
  }
  $in = body(); $cid = (int)($in['customer_id'] ?? 0); if (!row('SELECT id FROM customers WHERE id=?', [$cid])) fail('Customer not found', 404);
  $cost = (float)preg_replace(ONB_NUM, '', (string)($in['plant_cost'] ?? ''));
  if (!($cost > 0)) fail('Enter the total plant cost'); if ($cost > 1e9) fail('The total plant cost is too large');
  $extra = !empty($in['kseb_extra']) && !in_array(strtolower((string)$in['kseb_extra']), ['0', 'false', 'no', 'off'], true) ? 1 : 0;
  $amt = $extra ? max(0, min(1e7, (float)preg_replace(ONB_NUM, '', (string)($in['kseb_extra_amt'] ?? '')))) : 0;
  cust_cost_set($cid, round($cost, 2), $extra, round($amt, 2));
  /* one project: its value follows, so Accounts and the tax bill agree. Several projects: each keeps its own value (edited on the project). */
  $ps = rows('SELECT id FROM projects WHERE customer_id=?', [$cid]);
  if (count($ps) === 1) q('UPDATE projects SET cost=?, updated=CURRENT_TIMESTAMP WHERE id=?', [round($cost, 2), $ps[0]['id']]);
  audit('plant_cost', 'customers', $cid, '₹' . number_format($cost) . ($extra ? ' · KSEB charges additional' . ($amt > 0 ? ' ₹' . number_format($amt) : '') : ' · KSEB charges included'));
  out(cust_cost_summary($cid));
}
