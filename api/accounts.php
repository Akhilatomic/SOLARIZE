<?php
// Accounts: the price list (materials and services: dealer price + profit %) and the per-project Expense sheet (what the plant cost us,
// acc_costs; the browser still routes it as #/accounts/cost/<project>). Needs the "accounts" permission.
// Same order as ACC.GROUPS in assets/app32.js.
const ACC_GROUPS = ['Inverter & optimizers', 'Solar panels', 'Structure & supports', 'Distribution boards', 'Metering & isolation', 'DC cables & connectors',
  'AC cables & lugs', 'Earthing & lightning protection', 'Pipes & conduit fittings', 'Cable accessories & consumables', 'Services and charges'];
const ACC_GST = [0, 5, 12, 18, 28];
const ACC_MAX_LINES = 400;
const ACC_PROFIT_DEF = 15; /* the price list's default profit % until Settings › Price list changes it (ACC.PROFIT_DEF in app32.js) */
const ACC_PROFIT_MAX = 500;

/* rupee amount: blank = 0, negative or not a number is refused (same rules as comm_money) */
function acc_money($v, $label) {
  if (is_int($v) || is_float($v)) $s = (string)$v; else $s = str_replace([',', '₹', ' '], '', trim((string)$v));
  if ($s === '') return 0.0;
  if (!is_numeric($s) || (float)$s < 0 || (float)$s > 1e9) fail("$label: enter an amount in rupees");
  return round((float)$s, 2);
}

/* a profit %: blank = null (the item / line uses the default), else 0-500 */
function acc_pct($v, $label) {
  if ($v === null || is_array($v) || is_bool($v)) return null;
  $s = trim(str_replace('%', '', (string)$v));
  if ($s === '') return null;
  if (!is_numeric($s) || (float)$s < 0 || (float)$s > ACC_PROFIT_MAX) fail("$label: enter a profit % from 0 to " . ACC_PROFIT_MAX);
  return round((float)$s, 2);
}
/* the default profit % (Settings › Price list): a plain JSON number in settings, read directly (kv_get only merges arrays) */
function acc_profit_default() {
  $v = json_decode((string)(row("SELECT v FROM settings WHERE k='acc_profit_default'")['v'] ?? ''), true);
  return is_int($v) || is_float($v) ? (float)$v : (float)ACC_PROFIT_DEF;
}
/* a stored profit % for the browser: null stays null (= the default) */
function acc_pct_out($v) { return $v === null || $v === '' ? null : (float)$v; }

/* project with its customer; a Business Associate only reaches their own (cust_scope) */
function acc_project($pid) {
  $r = row('SELECT p.*, c.name c_name, c.phone c_phone, c.address c_address, c.district c_district, c.pincode c_pincode, c.consumer_no c_consumer_no, c.kseb_section c_kseb_section, c.landmark c_landmark, c.lat c_lat, c.lng c_lng, c.phase c_phase, c.owner_id c_owner_id FROM projects p JOIN customers c ON c.id=p.customer_id WHERE p.id=? AND ' . cust_scope('c'), [(int)$pid]);
  if (!$r) fail('Project not found', 404);
  return $r;
}

/* the customer's commission (a Business Associate) or incentive (staff), as Finance › Commission / Incentive has it: the person is the
   one saved on the commissions row, else the customer's owner (comm_rows); an admin (or no one) earns nothing, so kind and person are ''.
   {amount, kind: commission | incentive | '', person, p1, p2} */
function acc_comm($cid, $ownerId) {
  $cm = row('SELECT user_id, amount, p1_amount, p2_amount FROM commissions WHERE customer_id=?', [(int)$cid]);
  $uid = (int)($cm['user_id'] ?? 0) ?: (int)$ownerId;
  $u = $uid ? row("SELECT name, role FROM users WHERE id=? AND role<>'admin'", [$uid]) : null;
  return ['amount' => round((float)($cm['amount'] ?? 0), 2), 'kind' => $u ? comm_kind_of($u['role']) : '', 'person' => $u ? (string)$u['name'] : '',
    'p1' => round((float)($cm['p1_amount'] ?? 0), 2), 'p2' => round((float)($cm['p2_amount'] ?? 0), 2)];
}

/* Finance › Fees kinds as Expense sheet lines (group "Services and charges"): line name, GST % (the fee amount includes it), who is paid */
const ACC_FEE_LINES = ['feasibility' => ['KSEB feasibility', 18, 'KSEB'], 'registration' => ['KSEB registration', 18, 'KSEB'], 'stamp' => ['Stamp paper', 0, '']];
function acc_ver_bump($pid) { q('UPDATE projects SET cost_ver=COALESCE(cost_ver,0)+1 WHERE id=?', [(int)$pid]); }
/* Owner's rule (2026-11-12): a fee marked paid / purchased in Finance (feasibility, registration, stamp paper) is added to — or updated on — the
   Expense sheet of the customer's latest project as a Paid line (amount before GST, paid on, reference as the bill no.); marked unpaid → the line
   goes back to To pay. Nothing without a project or a positive amount. The sheet version moves on, so a copy of the sheet open elsewhere is refused
   (409) instead of overwriting it. Called from fees/set, fee_from_receipt (pipeline receipts) and once for fees paid before this rule. */
function acc_fee_sync($cid, $kind) {
  if (!isset(ACC_FEE_LINES[$kind])) return;
  [$name, $gst, $who] = ACC_FEE_LINES[$kind];
  $pid = (int)(row('SELECT id FROM projects WHERE customer_id=? ORDER BY id DESC LIMIT 1', [(int)$cid])['id'] ?? 0); if (!$pid) return;
  $f = row('SELECT * FROM fees WHERE customer_id=? AND kind=?', [(int)$cid, $kind]); if (!$f) return;
  $l = row('SELECT id, bought FROM acc_costs WHERE project_id=? AND lower(name)=lower(?) ORDER BY id LIMIT 1', [$pid, $name]);
  if (!((int)$f['paid'] === 1 && (float)$f['amount'] > 0)) {
    if ($l && (int)$l['bought']) { q("UPDATE acc_costs SET bought=0, bought_on='', updated=CURRENT_TIMESTAMP WHERE id=?", [$l['id']]); acc_ver_bump($pid); }
    return;
  }
  $rate = round((float)$f['amount'] / (1 + $gst / 100), 2); $on = (string)$f['paid_on']; $ref = trim((string)$f['ref']);
  if ($l) q("UPDATE acc_costs SET rate=?, gst=?, qty=CASE WHEN qty>0 THEN qty ELSE 1 END, bought=1, bought_on=?, bill_date=?,
      bill_no=CASE WHEN ?<>'' THEN ? ELSE bill_no END, supplier=CASE WHEN COALESCE(supplier,'')='' THEN ? ELSE supplier END, updated=CURRENT_TIMESTAMP WHERE id=?",
    [$rate, $gst, $on, $on, $ref, $ref, $who, $l['id']]);
  else {
    $mid = (int)(row("SELECT id FROM acc_materials WHERE grp='Services and charges' AND lower(name)=lower(?)", [$name])['id'] ?? 0);
    $sort = (int)(row('SELECT COALESCE(MAX(sort),0)+1 s FROM acc_costs WHERE project_id=?', [$pid])['s'] ?? 1);
    q("INSERT INTO acc_costs(project_id, material_id, grp, name, qty, unit, rate, gst, supplier, bill_no, bill_date, note, profit, bought, bought_on, sort)
      VALUES(?,?,'Services and charges',?,1,'Job',?,?,?,?,?,'From Finance › Fees',0,1,?,?)", [$pid, $mid, $name, $rate, $gst, $who, $ref, $on, $on, $sort]);
  }
  acc_ver_bump($pid);
}

function acc_cost_get($pid) {
  $p = acc_project($pid); $cid = (int)$p['customer_id'];
  [$plant] = plant_get($cid);
  $lines = rows('SELECT * FROM acc_costs WHERE project_id=? ORDER BY sort, id', [(int)$pid]);
  foreach ($lines as &$l) { foreach (['id', 'project_id', 'material_id', 'sort', 'bought'] as $k) $l[$k] = (int)($l[$k] ?? 0); $l['bought_on'] = (string)($l['bought_on'] ?? ''); foreach (['qty', 'rate', 'gst'] as $k) $l[$k] = (float)$l[$k]; $l['profit'] = acc_pct_out($l['profit'] ?? null); } unset($l);
  $cmx = acc_comm($cid, $p['c_owner_id'] ?? 0); $comm = $cmx['amount'];
  $fees = [];
  foreach (rows("SELECT kind, amount FROM fees WHERE customer_id=? AND amount>0 AND kind IN ('feasibility','registration','stamp') ORDER BY id", [$cid]) as $f)
    $fees[] = ['kind' => $f['kind'], 'name' => ACC_FEE_LINES[$f['kind']][0], 'amount' => (float)$f['amount'], 'gst' => ACC_FEE_LINES[$f['kind']][1]];
  $latest = (int)(row('SELECT id FROM projects WHERE customer_id=? ORDER BY id DESC LIMIT 1', [$cid])['id'] ?? 0) === (int)$pid;
  $taxable = 0.0;
  if ($latest && ($t = row("SELECT data FROM gen_docs WHERE customer_id=? AND kind='tax'", [$cid]))) $taxable = (float)((json_decode((string)$t['data'], true) ?: [])['taxable'] ?? 0);
  $q = row("SELECT number FROM quotes WHERE customer_id=? ORDER BY CASE status WHEN 'Accepted' THEN 0 WHEN 'Sent' THEN 1 ELSE 2 END, id DESC LIMIT 1", [$cid]);
  return [
    'project' => ['id' => (int)$p['id'], 'title' => $p['title'], 'kw' => $p['kw'], 'stage' => $p['stage'], 'loan' => $p['loan'], 'cost' => (float)$p['cost'],
      'panel' => (string)($p['panel'] ?? ''), 'inverter' => (string)($p['inverter'] ?? ''), 'engineer' => (string)($p['engineer'] ?? ''), 'start' => (string)($p['start'] ?? '')],
    'customer' => ['id' => $cid, 'name' => $p['c_name'], 'phone' => $p['c_phone'], 'address' => $p['c_address'], 'district' => $p['c_district'], 'pincode' => $p['c_pincode'],
      'consumer_no' => $p['c_consumer_no'], 'kseb_section' => $p['c_kseb_section'], 'landmark' => $p['c_landmark'], 'lat' => $p['c_lat'], 'lng' => $p['c_lng'], 'phase' => (string)($p['c_phase'] ?? '')],
    'company' => array_intersect_key(acc_company(), array_flip(['name', 'address', 'phone', 'gstin'])), /* the material list PDF's header */
    'plant' => $plant,
    'lines' => $lines,
    'version' => (string)(int)($p['cost_ver'] ?? 0), /* send it back with cost_save: a save from an older copy of the sheet is refused (409) */
    'auto' => ['comm' => $comm, 'fees' => $fees],
    'comm' => $cmx, /* the automatic commission / incentive line of the Expense sheet */
    'paid' => round((float)row('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE project_id=?', [(int)$pid])['s'], 2), /* income: payments received for this project */
    'profit_default' => acc_profit_default(),
    'taxable' => $taxable,
    'quote_no' => (string)($q['number'] ?? ''),
  ];
}

function acc_line($l, $i) {
  if (!is_array($l)) fail('Line ' . ($i + 1) . ': not valid');
  $name = trim((string)($l['name'] ?? ''));
  if ($name === '') fail('Line ' . ($i + 1) . ': material name is required');
  if (mb_strlen($name) > 200) fail('Line ' . ($i + 1) . ': name is too long (200 characters at most)');
  $gst = (float)($l['gst'] ?? 18);
  if (!in_array($gst, array_map('floatval', ACC_GST), true)) fail('Line ' . ($i + 1) . ': GST must be 0, 5, 12, 18 or 28');
  $t = fn($k, $n) => mb_substr(trim((string)($l[$k] ?? '')), 0, $n);
  $qty = acc_money($l['qty'] ?? 0, "Line " . ($i + 1) . " quantity");
  if ($qty <= 0) fail("Enter the quantity for $name"); /* every project is different: no line without its quantity */
  /* Purchased / Paid: bought_on is the purchase day (Y-m-d), required when bought; a To buy line keeps none (Undo clears it) */
  $bought = !empty($l['bought']) ? 1 : 0; $on = trim((string)($l['bought_on'] ?? ''));
  if ($on !== '' && (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $on) || date('Y-m-d', strtotime($on)) !== $on)) fail("The purchase date for $name is not a valid date");
  if ($bought && $on === '') fail("Enter the purchase date for $name");
  return ['bought' => $bought, 'bought_on' => $bought ? $on : '', 'material_id' => (int)($l['material_id'] ?? 0), 'grp' => $t('grp', 100), 'name' => $name, 'qty' => $qty,
    'unit' => $t('unit', 20), 'rate' => acc_money($l['rate'] ?? 0, "Line " . ($i + 1) . " rate"), 'gst' => $gst,
    'profit' => acc_pct($l['profit'] ?? null, 'Line ' . ($i + 1) . " ($name)"),
    'supplier' => $t('supplier', 120), 'bill_no' => $t('bill_no', 60), 'bill_date' => $t('bill_date', 10), 'note' => $t('note', 300),
    'price_typed' => !empty($l['price_typed'])]; /* the dealer price was typed on this sheet (the browser sets it on a Dealer price edit only) */
}

function acc_materials_list() {
  $rs = rows('SELECT * FROM acc_materials ORDER BY sort, name COLLATE NOCASE');
  $ord = array_flip(ACC_GROUPS);
  usort($rs, fn($a, $b) => [$ord[$a['grp']] ?? 99, (int)$a['sort'], strtolower($a['name'])] <=> [$ord[$b['grp']] ?? 99, (int)$b['sort'], strtolower($b['name'])]);
  foreach ($rs as &$r) { foreach (['id', 'hidden', 'sort'] as $k) $r[$k] = (int)$r[$k]; foreach (['gst', 'rate'] as $k) $r[$k] = (float)$r[$k]; $r['profit'] = acc_pct_out($r['profit'] ?? null); } unset($r);
  return $rs;
}

/* ---- money lists (pending, received, profit, expenses, overview) ---- */
/* stages where the customer has not started paying yet; the pending list hides them unless asked */
const ACC_EARLY = ['Customer', 'KSEB feasibility check', 'Loan registration', 'KSEB feasibility payment', 'PMSG portal registration'];
const ACC_DEF_CATS = ['Ads', 'AI tools', 'Other'];

/* [from, to] (Y-m-d, inclusive) from ?period=: 'YYYY-MM' = that month, 'fy-26-27' = 2026-04-01..2027-03-31, empty or invalid = this month (same rule as ACC.period) */
function acc_range() {
  $s = (string)($_GET['period'] ?? '');
  if (preg_match('/^fy-(\d\d)-(\d\d)$/', $s, $m)) return ["20$m[1]-04-01", "20$m[2]-03-31"];
  if (!preg_match('/^(\d{4})-(0[1-9]|1[0-2])$/', $s)) $s = date('Y-m');
  return ["$s-01", date('Y-m-t', strtotime("$s-01"))];
}

/* customers.loan_amount is free text (Bank & loan page): '2,70,000' or '₹270000' -> 270000; blank -> 0 */
function acc_loan_amt($v) { return (float)str_replace([',', '₹', ' '], '', (string)$v); }

/* projects still owing money: {id,title,customer_id,customer,phone,kw,loan,stage,cost,paid,due,cust_due,bank_only,last_pay,last_remind,early}.
   cust_due = what the customer still owes: on a loan project their own share (price - loan amount) less the payments marked Customer, the
   rule of acc_bill_lock (a blank loan amount = not known, so the whole due); bank_only = a loan project where only the bank's part is left.
   $limit 0 = no cap (the overview totals every owing project, the Pending tab draws lazily); the Dashboard "dues" list keeps 500 and
   needs no last reminder ($withRemind false). */
function acc_pending_rows($withEarly = false, $limit = 500, $withRemind = true) {
  $early = "'" . implode("','", ACC_EARLY) . "'";
  $rs = rows("SELECT * FROM (SELECT p.id, p.title, p.customer_id, c.name customer, c.phone, p.kw, p.loan, p.stage, p.cost,
      COALESCE((SELECT SUM(amount) FROM payments WHERE project_id=p.id),0) paid,
      p.cost - COALESCE((SELECT SUM(amount) FROM payments WHERE project_id=p.id),0) due,
      CASE WHEN p.loan='Yes' THEN COALESCE((SELECT SUM(amount) FROM payments WHERE project_id=p.id AND COALESCE(src,'')<>'bank'),0) ELSE 0 END cust_paid,
      CASE WHEN p.loan='Yes' THEN c.loan_amount ELSE '' END loan_amt,
      (SELECT MAX(date) FROM payments WHERE project_id=p.id) last_pay,
      p.stage IN ($early) early
    FROM projects p JOIN customers c ON c.id=p.customer_id WHERE " . cust_scope('c') . ")
    WHERE due > 1" . ($withEarly ? '' : ' AND early=0') . ' ORDER BY due DESC' . ($limit > 0 ? ' LIMIT ' . (int)$limit : ''));
  $rem = [];
  if ($withRemind) foreach (rows("SELECT l.project_id, l.created, u.name FROM acc_log l LEFT JOIN users u ON u.id=l.user_id WHERE l.id IN (SELECT MAX(id) FROM acc_log WHERE kind='remind' GROUP BY project_id)") as $l)
    $rem[(int)$l['project_id']] = ['at' => $l['created'], 'by' => (string)$l['name']];
  foreach ($rs as &$r) {
    foreach (['id', 'customer_id', 'early'] as $k) $r[$k] = (int)$r[$k];
    foreach (['cost', 'paid', 'due'] as $k) $r[$k] = round((float)$r[$k], 2);
    $r['cust_due'] = $r['due']; $r['bank_only'] = false;
    $loan = $r['loan'] === 'Yes' ? acc_loan_amt($r['loan_amt']) : 0;
    if ($loan > 0) { $left = max(0, max(0, $r['cost'] - $loan) - (float)$r['cust_paid']); $r['cust_due'] = round(min($left, $r['due']), 2); $r['bank_only'] = $left <= 1; }
    unset($r['cust_paid'], $r['loan_amt']);
    if ($withRemind) $r['last_remind'] = $rem[$r['id']] ?? null; /* {at: when, by: user name}, null if never reminded */
  } unset($r);
  return $rs;
}

function acc_cats() {
  $c = json_decode((string)(row("SELECT v FROM settings WHERE k='acc_cats'")['v'] ?? ''), true); /* stored as a plain JSON list (kv_get would merge list indexes with the defaults) */
  return is_array($c) && $c ? array_values(array_map('strval', $c)) : ACC_DEF_CATS;
}

/* payments dated in the period, newest first; $withShares false = no share ticks (the overview only adds them up) */
function acc_received_rows($from, $to, $withShares = true) {
  $rs = rows("SELECT pa.id, pa.project_id, p.customer_id, c.name customer, pa.date, pa.amount, pa.mode, pa.ref_no, pa.receipt_no, pa.src, p.loan
    FROM payments pa JOIN projects p ON p.id=pa.project_id JOIN customers c ON c.id=p.customer_id
    WHERE pa.date >= ? AND pa.date <= ? AND " . cust_scope('c') . ' ORDER BY pa.date DESC, pa.id DESC', [$from, $to]);
  $sh = [];
  if ($withShares) foreach (rows("SELECT payment_id, via, to_whom, created FROM acc_log WHERE kind<>'remind' AND payment_id IS NOT NULL AND payment_id IN (SELECT id FROM payments WHERE date >= ? AND date <= ?) ORDER BY id", [$from, $to]) as $l)
    $sh[(int)$l['payment_id']][] = ['via' => $l['via'], 'to_whom' => $l['to_whom'], 'created' => $l['created']];
  foreach ($rs as &$r) {
    foreach (['id', 'project_id', 'customer_id'] as $k) $r[$k] = (int)$r[$k];
    $r['amount'] = round((float)$r['amount'], 2); $r['src'] = $r['src'] === 'bank' ? 'bank' : 'customer'; $r['shared'] = $sh[$r['id']] ?? [];
  } unset($r);
  return $rs;
}

/* projects whose customer's tax bill was issued in the period (the bill counts for the customer's latest project).
   One row per bill and one bill per customer (gen_docs UNIQUE(customer_id, kind)); the project join is a scalar subquery (latest project only), so nothing fans out and nothing needs de-duplicating. */
function acc_profit_get($from, $to) {
  $bills = rows("SELECT g.customer_id, g.number, g.issued_on, g.data, c.name customer, p.id project_id, p.kw, p.cost price,
      COALESCE((SELECT amount FROM commissions WHERE customer_id=c.id),0) comm
    FROM gen_docs g JOIN customers c ON c.id=g.customer_id
    JOIN projects p ON p.id=(SELECT id FROM projects WHERE customer_id=c.id ORDER BY id DESC LIMIT 1)
    WHERE g.kind='tax' AND g.issued_on >= ? AND g.issued_on <= ? AND " . cust_scope('c') . ' ORDER BY g.issued_on DESC, g.id DESC', [$from, $to]);
  $rows = []; $noCost = []; $cnt = ['before' => 0.0, 'cost' => 0.0, 'comm' => 0.0, 'profit' => 0.0];
  foreach ($bills as $b) {
    $pid = (int)$b['project_id'];
    /* each line rounded to paise first, as the cost sheet shows it (ACC.lineAmount) */
    $ln = row('SELECT COUNT(*) n, COALESCE(SUM(ROUND(qty*rate,2)),0) cost, COALESCE(SUM(qty > 0 AND rate <= 0),0) missing FROM acc_costs WHERE project_id=' . $pid);
    if ((int)$ln['n'] === 0) { $noCost[] = ['project_id' => $pid, 'customer' => $b['customer'], 'bill_no' => $b['number']]; continue; }
    $taxable = (float)((json_decode((string)$b['data'], true) ?: [])['taxable'] ?? 0);
    $before = $taxable > 0 ? round($taxable, 2) : round((float)$b['price'] / 1.089, 2);
    $cost = round((float)$ln['cost'], 2); $comm = round((float)$b['comm'], 2); $profit = round($before - $cost - $comm, 2);
    $rows[] = ['project_id' => $pid, 'customer_id' => (int)$b['customer_id'], 'customer' => $b['customer'], 'kw' => $b['kw'], 'bill_no' => $b['number'], 'bill_on' => $b['issued_on'],
      'before' => $before, 'cost' => $cost, 'comm' => $comm, 'profit' => $profit, 'margin' => $before ? round($profit / $before * 100, 2) : 0, 'lines' => (int)$ln['n'], 'missing' => (int)$ln['missing']];
    $cnt['before'] += $before; $cnt['cost'] += $cost; $cnt['comm'] += $comm; $cnt['profit'] += $profit;
  }
  return ['rows' => $rows, 'counted' => array_map(fn($v) => round($v, 2), $cnt), 'no_cost' => $noCost];
}

/* campaign spend by month inside the period */
function acc_ads_by_month($from, $to) {
  return array_map(fn($r) => ['month' => $r['month'], 'spend' => round((float)$r['spend'], 2)],
    rows('SELECT substr(date,1,7) month, SUM(spend) spend FROM ad_spend WHERE date >= ? AND date <= ? GROUP BY month ORDER BY month', [$from, $to]));
}

/* company details for the receipt / email: name, contacts, bank (Quotation maker) and the GSTIN */
function acc_company() {
  return (gen_qm_info() ?: []) + ['gstin' => (string)(settings()['company']['gstin'] ?? '')] + ['name' => '', 'phone' => '', 'bank' => null];
}

/* rupees with Indian grouping (12,34,567); paise only when there are some */
function acc_inr($n) {
  $n = round((float)$n, 2); $s = number_format(abs($n), floor($n) == $n ? 0 : 2, '.', ''); [$i, $d] = array_pad(explode('.', $s), 2, '');
  if (strlen($i) > 3) $i = preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', substr($i, 0, -3)) . ',' . substr($i, -3);
  return '₹' . ($n < 0 ? '-' : '') . $i . ($d !== '' ? '.' . $d : '');
}

/* Can the customer's tax bill be issued yet? For their latest project (same as the Tax bill tab).
   {locked, due, msg, why: paid | bank_left | due | loan_amount}. Loan projects unlock when the payments marked Customer cover the customer's share (price - loan),
   because the bank releases its last part only after it gets the final tax bill. */
function acc_bill_lock($cid) {
  $g = gen_acct((int)$cid); $cost = (float)$g['cost']; $due = max(0, $cost - (float)$g['paid']);
  if ($due <= 1) return ['locked' => false, 'due' => $due, 'msg' => '', 'why' => 'paid'];
  $isLoan = $g['project_id'] && row('SELECT loan FROM projects WHERE id=?', [$g['project_id']])['loan'] === 'Yes';
  if (!$isLoan) return ['locked' => true, 'due' => $due, 'msg' => acc_inr($due) . ' still due', 'why' => 'due'];
  $loan = acc_loan_amt(row('SELECT loan_amount FROM customers WHERE id=?', [(int)$cid])['loan_amount'] ?? '');
  if ($loan <= 0) return ['locked' => true, 'due' => $due, 'msg' => 'Enter the loan amount on the Bank & loan page', 'why' => 'loan_amount'];
  $share = max(0, $cost - $loan);
  $custPaid = (float)row("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE project_id=? AND COALESCE(src,'') <> 'bank'", [$g['project_id']])['s'];
  if ($custPaid >= $share - 1) return ['locked' => false, 'due' => $due, 'msg' => "Only the bank's part is left (" . acc_inr($due) . ')', 'why' => 'bank_left'];
  return ['locked' => true, 'due' => $due, 'msg' => acc_inr($share - $custPaid) . ' still due from the customer', 'why' => 'due'];
}

const ACC_TPL_DEFAULT = [
  'rc_subject' => 'Payment receipt {receipt_no} – {customer} – solar plant {kw} kW',
  'rc_body' => "Dear {manager},\n\nPlease find attached the payment receipt {receipt_no} for ₹{amount} received on {date} ({mode_ref}) towards the {kw} kW rooftop solar plant of {customer} (consumer no. {consumer_no}, loan ref {loan_ref}). Kindly process the next disbursement.\n\nRegards,\n{sender}\n{company}\n{sender_phone}",
  'tb_subject' => 'Final tax invoice {bill_no} – {customer} – solar plant {kw} kW',
  'tb_body' => "Dear {manager},\n\nThe {kw} kW rooftop solar plant of {customer} (consumer no. {consumer_no}, loan ref {loan_ref}) is complete. Please find attached the final tax invoice {bill_no} for ₹{bill_total}. Kindly release the final disbursement.\n\nRegards,\n{sender}\n{company}\n{sender_phone}",
  'remind' => 'Dear {customer}, a balance of ₹{pending} is pending for your {kw} kW solar plant. Kindly pay at the earliest. Account: {bank_details}. Thank you, {company}.',
];

/* share log rows, newest first, for the receipt window and the Tax bill tab: [{via, to_whom, to_addr, created, who}] */
function acc_shares($where, $args) {
  return rows("SELECT l.via, l.to_whom, l.to_addr, l.created, COALESCE(u.name,'') who FROM acc_log l LEFT JOIN users u ON u.id=l.user_id WHERE $where ORDER BY l.id DESC LIMIT 30", $args);
}

function acc_expense_row($r) { foreach (['id', 'created_by'] as $k) $r[$k] = (int)$r[$k]; foreach (['amount', 'gst'] as $k) $r[$k] = (float)$r[$k]; return $r; }

const ACC_TPL_MAX_ITEMS = 400;

/* a material template's items, validated and cleaned: [{material_id, grp, name, unit, qty}] (product + quantity only) */
function acc_tpl_items($raw) {
  if (!is_array($raw) || !$raw) fail('Add at least one item to the template');
  if (count($raw) > ACC_TPL_MAX_ITEMS) fail('At most ' . ACC_TPL_MAX_ITEMS . ' items in a template');
  $out = [];
  foreach (array_values($raw) as $i => $it) {
    $n = $i + 1; if (!is_array($it)) fail("Item $n is not valid");
    $name = trim((string)($it['name'] ?? ''));
    if ($name === '') fail("Item $n: the product is required");
    if (mb_strlen($name) > 200) fail("Item $n: the name is too long (200 characters at most)");
    $qty = $it['qty'] ?? null;
    if (!is_numeric($qty) || (float)$qty <= 0 || (float)$qty > 1e9) fail("Item $n ($name): enter a quantity above 0");
    $out[] = ['material_id' => max(0, (int)($it['material_id'] ?? 0)), 'grp' => mb_substr(trim((string)($it['grp'] ?? '')), 0, 200), 'name' => $name,
      'unit' => mb_substr(trim((string)($it['unit'] ?? '')), 0, 20), 'qty' => round((float)$qty, 3)];
  }
  return $out;
}
/* a template as the pages get it (items decoded) */
function acc_tpl_out($r) {
  $it = json_decode((string)$r['items'], true);
  return ['id' => (int)$r['id'], 'name' => $r['name'], 'items' => is_array($it) ? $it : [], 'updated' => $r['updated'], 'updated_by' => (string)$r['updated_by']];
}

function handle_acc($a) {
  /* receipts, templates and the share log are also open to the Payments roles; everything else needs Accounts.
     ac_receipt returns the price and amounts, so it also needs Finance; the writes (receipt_no, log) need write access. */
  if ($a === 'ac_tpl') { if (!can('payments') && !can('accounts')) fail('Not allowed for your role', 403); }
  elseif ($a === 'ac_receipt') { if (!can('accounts') && !(can('payments') && can('finance'))) fail('Not allowed for your role', 403); }
  elseif ($a === 'receipt_no' || $a === 'log') { if (!can('accounts', true) && !can('payments', true)) fail('Not allowed for your role', 403); }
  else need('accounts');
  $in = body();
  switch ($a) {
    case 'ac_tpl':
      out(kv_get('acc_tpl', ACC_TPL_DEFAULT) + ['company' => acc_company(), 'defaults' => ACC_TPL_DEFAULT]);

    case 'tpl_save': {
      if (!is_admin()) fail('Only the admin can change the templates', 403);
      $cur = kv_get('acc_tpl', ACC_TPL_DEFAULT);
      foreach (array_keys(ACC_TPL_DEFAULT) as $k) if (isset($in[$k])) { $v = str_replace("\r\n", "\n", (string)$in[$k]); if (mb_strlen($v) > 4000) fail('A template is too long (4000 characters at most)'); $cur[$k] = $v; }
      kv_set('acc_tpl', $cur);
      audit('acc_tpl_save', 'settings', null, 'email / WhatsApp templates');
      out(['ok' => true] + $cur);
    }

    case 'receipt_no': { /* POST: gives the payment its receipt number the first time (422 without a reference unless Cash) */
      $pay = row('SELECT pa.* FROM payments pa JOIN projects p ON p.id=pa.project_id JOIN customers c ON c.id=p.customer_id WHERE pa.id=? AND ' . cust_scope('c'), [(int)($in['payment_id'] ?? 0)]);
      if (!$pay) fail('Payment not found', 404);
      out(['receipt_no' => rcpt_issue($pay)]);
    }

    case 'ac_receipt': { /* read only: receipt_no is as stored (may be empty until receipt_no is called) */
      $pay = row('SELECT pa.* FROM payments pa JOIN projects p ON p.id=pa.project_id JOIN customers c ON c.id=p.customer_id WHERE pa.id=? AND ' . cust_scope('c'), [(int)($_GET['payment_id'] ?? 0)]);
      if (!$pay) fail('Payment not found', 404);
      $pay['receipt_no'] = (string)($pay['receipt_no'] ?? '');
      $p = acc_project((int)$pay['project_id']); $cid = (int)$p['customer_id'];
      $cols = 'id, name, phone, email, address, district, pincode, consumer_no' . (can('loans') ? ', jansamarth_id, loan_bank, loan_bank_email, loan_mgr_name, loan_mgr_phone' : '');
      $cu = row("SELECT $cols FROM customers WHERE id=?", [$cid]); $cu['id'] = (int)$cu['id'];
      $pays = rows('SELECT id, date, amount, mode, ref_no, receipt_no, src, note FROM payments WHERE project_id=? ORDER BY date, id', [(int)$p['id']]);
      foreach ($pays as &$x) { $x['id'] = (int)$x['id']; $x['amount'] = (float)$x['amount']; $x['src'] = $x['src'] === 'bank' ? 'bank' : 'customer'; } unset($x);
      $latest = (int)(row('SELECT id FROM projects WHERE customer_id=? ORDER BY id DESC LIMIT 1', [$cid])['id'] ?? 0) === (int)$p['id'];
      $bill = null;
      if ($latest && ($b = row("SELECT number, issued_on, data FROM gen_docs WHERE customer_id=? AND kind='tax'", [$cid]))) $bill = ['no' => $b['number'], 'date' => $b['issued_on'], 'total' => (float)((json_decode((string)$b['data'], true) ?: [])['grand'] ?? 0)];
      $one = ['id' => (int)$pay['id'], 'project_id' => (int)$p['id'], 'date' => $pay['date'], 'amount' => (float)$pay['amount'], 'mode' => $pay['mode'], 'ref_no' => $pay['ref_no'], 'receipt_no' => $pay['receipt_no'], 'src' => $pay['src'] === 'bank' ? 'bank' : 'customer', 'note' => $pay['note']];
      out(['payment' => $one, 'project' => ['id' => (int)$p['id'], 'kw' => $p['kw'], 'loan' => $p['loan'], 'cost' => (float)$p['cost']], 'customer' => $cu, 'payments' => $pays, 'bill' => $bill, 'company' => acc_company(),
        'shared' => acc_shares("l.payment_id=? AND l.kind='receipt'", [(int)$pay['id']])]);
    }

    case 'log': {
      $kind = (string)($in['kind'] ?? ''); $via = (string)($in['via'] ?? ''); $to = (string)($in['to_whom'] ?? '');
      if (!in_array($kind, ['receipt', 'tax', 'remind'], true)) fail('Unknown kind');
      if (!in_array($via, ['email', 'whatsapp', 'pdf'], true)) fail('Unknown way of sharing');
      if (!in_array($to, ['customer', 'bank'], true)) fail('Unknown recipient');
      $cid = (int)($in['customer_id'] ?? 0);
      if (!row('SELECT 1 FROM customers c WHERE c.id=? AND ' . cust_scope('c'), [$cid])) fail('Customer not found', 404);
      $pid = (int)($in['project_id'] ?? 0); $payId = (int)($in['payment_id'] ?? 0);
      if ($pid && !row('SELECT 1 FROM projects WHERE id=? AND customer_id=?', [$pid, $cid])) fail('Project not found', 404);
      if ($payId && !row('SELECT 1 FROM payments pa JOIN projects p ON p.id=pa.project_id WHERE pa.id=? AND p.customer_id=?', [$payId, $cid])) fail('Payment not found', 404);
      q('INSERT INTO acc_log(kind,payment_id,customer_id,project_id,via,to_whom,to_addr,user_id) VALUES(?,?,?,?,?,?,?,?)',
        [$kind, $payId ?: null, $cid, $pid ?: null, $via, $to, mb_substr(trim((string)($in['to_addr'] ?? '')), 0, 200), uid()]);
      out(['ok' => true, 'id' => (int)db()->lastInsertId()]);
    }

    case 'ac_cost':
      out(acc_cost_get((int)($_GET['project_id'] ?? 0)));

    case 'ac_materials': /* the price list: items (dealer price = rate, profit % or null = the default) and the default profit % */
      out(['rows' => acc_materials_list(), 'profit_default' => acc_profit_default()]);

    case 'profit_default_save': { /* POST {pct}: the price list's default profit % (0-500) */
      need('accounts', true);
      $pct = acc_pct($in['pct'] ?? null, 'Default profit %');
      if ($pct === null) fail('Enter the default profit % (0 to ' . ACC_PROFIT_MAX . ')');
      kv_set('acc_profit_default', $pct); /* a plain number, read by acc_profit_default() */
      audit('acc_profit_default', 'settings', null, "default profit $pct%");
      out(['ok' => true, 'profit_default' => acc_profit_default()]);
    }

    case 'cost_save': {
      need('accounts', true);
      $pid = (int)($in['project_id'] ?? 0); acc_project($pid);
      $lines = $in['lines'] ?? null; if (!is_array($lines)) fail('Nothing to save');
      if (count($lines) > ACC_MAX_LINES) fail('At most ' . ACC_MAX_LINES . ' lines');
      $clean = []; foreach (array_values($lines) as $i => $l) $clean[] = acc_line($l, $i); /* validate everything before touching the database */
      /* version = the sheet's cost_ver when the page loaded it (ac_cost). Someone else saved since: 409, nothing written (their lines stay).
         No version at all (a page loaded before this check) is still accepted. */
      $ver = $in['version'] ?? null; $stale = false;
      db()->exec('BEGIN IMMEDIATE');
      try {
        $stale = $ver !== null && (string)$ver !== (string)(int)(row('SELECT cost_ver FROM projects WHERE id=?', [$pid])['cost_ver'] ?? 0);
        if (!$stale) {
          /* the dealer prices this sheet had per item, before it is replaced: a price only goes back on the price list when it was
             typed on the sheet AND is not one the sheet already had (re-saving an old sheet never undoes the owner's price list) */
          $had = [];
          foreach (rows('SELECT material_id, rate FROM acc_costs WHERE project_id=?', [$pid]) as $h) $had[(int)$h['material_id']][] = round((float)$h['rate'], 2);
          $isNew = fn($mid, $rate) => !array_filter($had[$mid] ?? [], fn($r) => abs($r - $rate) < 0.005);
          q('DELETE FROM acc_costs WHERE project_id=?', [$pid]);
          $nextSort = (int)q('SELECT COALESCE(MAX(sort),0) FROM acc_materials')->fetchColumn();
          foreach ($clean as $i => $l) {
            $mid = $l['material_id'];
            if (!$mid) { /* typed on the sheet: the material with that group + name, else it goes on the Materials list */
              $m = row('SELECT id FROM acc_materials WHERE grp=? AND lower(name)=lower(?)', [$l['grp'], $l['name']]);
              if ($m) $mid = (int)$m['id'];
              else { q('INSERT INTO acc_materials(grp,name,unit,gst,rate,profit,sort) VALUES(?,?,?,?,?,?,?)', [$l['grp'], $l['name'], $l['unit'] !== '' ? $l['unit'] : 'Nos', $l['gst'], $l['rate'], $l['profit'], ++$nextSort]); $mid = (int)db()->lastInsertId(); }
              $onList = true;
            } else $onList = (bool)row('SELECT 1 FROM acc_materials WHERE id=?', [$mid]); /* a deleted material: the line keeps its name and id, the material is not made again */
            /* a dealer price typed on this sheet (and new to it) becomes the item's dealer price; picked, copied, fee and unchanged lines
               leave it alone. A line's profit % is this project's own and never changes the price list. */
            if ($l['price_typed'] && $l['rate'] > 0 && $onList && $isNew($mid, round($l['rate'], 2))) q('UPDATE acc_materials SET rate=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$l['rate'], $mid]);
            q('INSERT INTO acc_costs(project_id,material_id,grp,name,qty,unit,rate,gst,profit,supplier,bill_no,bill_date,note,sort,bought,bought_on) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
              [$pid, $mid, $l['grp'], $l['name'], $l['qty'], $l['unit'], $l['rate'], $l['gst'], $l['profit'], $l['supplier'], $l['bill_no'], $l['bill_date'], $l['note'], $i + 1, $l['bought'], $l['bought_on']]);
          }
          q('UPDATE projects SET cost_ver=COALESCE(cost_ver,0)+1 WHERE id=?', [$pid]);
        }
        db()->exec($stale ? 'ROLLBACK' : 'COMMIT');
      } catch (Throwable $e) { try { db()->exec('ROLLBACK'); } catch (Throwable $e2) { } throw $e; }
      if ($stale) out(['error' => 'This Expense sheet was changed since you opened it — reload to see the latest', 'stale' => 1, 'quiet' => 1], 409);
      audit('acc_cost_save', 'projects', $pid, count($clean) . ' line(s)');
      out(acc_cost_get($pid));
    }

    case 'material_save': {
      need('accounts', true);
      $id = (int)($in['id'] ?? 0);
      $grp = trim((string)($in['grp'] ?? '')); $name = trim((string)($in['name'] ?? ''));
      if ($grp === '') fail('Choose a group');
      if ($name === '') fail('Material name is required');
      if (mb_strlen($name) > 200) fail('Name is too long (200 characters at most)');
      $gst = (float)($in['gst'] ?? 18); if (!in_array($gst, array_map('floatval', ACC_GST), true)) fail('GST must be 0, 5, 12, 18 or 28');
      $unit = mb_substr(trim((string)($in['unit'] ?? '')), 0, 20); if ($unit === '') $unit = 'Nos';
      $rate = acc_money($in['rate'] ?? 0, 'Dealer price'); $hidden = !empty($in['hidden']) ? 1 : 0;
      /* profit %: blank = the default; not sent at all (an older page) = an existing item keeps its own */
      $hasPct = array_key_exists('profit', $in); $pct = $hasPct ? acc_pct($in['profit'], 'Profit %') : null;
      $dup = row('SELECT id FROM acc_materials WHERE grp=? AND lower(name)=lower(?) AND id<>?', [$grp, $name, $id]);
      /* dup_id: the item already there (the Add item window uses it); quiet: the page says so itself (no browser pop-up) */
      if ($dup) out(['error' => "$name is already in $grp", 'dup_id' => (int)$dup['id'], 'quiet' => 1], 409);
      if ($id) {
        $old = row('SELECT profit FROM acc_materials WHERE id=?', [$id]);
        if (!$old) fail('Material not found', 404);
        if (!$hasPct) $pct = $old['profit'] === null ? null : (float)$old['profit'];
        q('UPDATE acc_materials SET grp=?, name=?, unit=?, gst=?, rate=?, profit=?, hidden=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$grp, $name, $unit, $gst, $rate, $pct, $hidden, $id]);
      } else {
        q('INSERT INTO acc_materials(grp,name,unit,gst,rate,profit,hidden,sort) VALUES(?,?,?,?,?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM acc_materials))', [$grp, $name, $unit, $gst, $rate, $pct, $hidden]);
        $id = (int)db()->lastInsertId();
      }
      audit('acc_material_save', 'acc_materials', $id, "$grp · $name");
      $item = row('SELECT * FROM acc_materials WHERE id=?', [$id]);
      foreach (['id', 'hidden', 'sort'] as $k) $item[$k] = (int)$item[$k]; foreach (['gst', 'rate'] as $k) $item[$k] = (float)$item[$k]; $item['profit'] = acc_pct_out($item['profit']);
      out(['ok' => true, 'id' => $id, 'item' => $item]); /* item: as on the price list, so a new product goes straight onto an Expense sheet */
    }

    case 'material_delete': {
      need('accounts', true);
      $id = (int)($in['id'] ?? 0); $m = row('SELECT * FROM acc_materials WHERE id=?', [$id]); if (!$m) fail('Material not found', 404);
      trash_put('Material', $m['grp'] . ' · ' . $m['name'], [['acc_materials', 'id=?', [$id]]]);
      q('DELETE FROM acc_materials WHERE id=?', [$id]);
      audit('acc_material_delete', 'acc_materials', $id, $m['name']);
      out(['ok' => true]);
    }

    case 'ac_tpls': { /* material templates: id, name, number of items, last change (no items; ac_tpl_get has them) */
      $rs = rows('SELECT id, name, items, updated, updated_by FROM acc_tpls ORDER BY lower(name), id');
      out(['rows' => array_map(function ($r) { $it = json_decode((string)$r['items'], true); return ['id' => (int)$r['id'], 'name' => $r['name'], 'n' => is_array($it) ? count($it) : 0, 'updated' => $r['updated'], 'updated_by' => (string)$r['updated_by']]; }, $rs)]);
    }

    case 'ac_tpl_get': {
      $r = row('SELECT * FROM acc_tpls WHERE id=?', [(int)($_GET['id'] ?? 0)]); if (!$r) fail('Template not found', 404);
      out(acc_tpl_out($r));
    }

    case 'tpl_put': { /* POST {id?, name, items, replace?}: new template, or edit by id. A name already used (any case): 409 {dup_id, quiet}; replace:1 overwrites that template */
      need('accounts', true);
      $id = (int)($in['id'] ?? 0);
      $name = trim(preg_replace('/\s+/u', ' ', (string)($in['name'] ?? '')));
      if ($name === '') fail('Give the template a name');
      if (mb_strlen($name) > 80) fail('The name is too long (80 characters at most)');
      $items = acc_tpl_items($in['items'] ?? null);
      if ($id && !row('SELECT 1 FROM acc_tpls WHERE id=?', [$id])) fail('Template not found', 404);
      $rep = (int)($in['replace'] ?? 0);
      $dup = row('SELECT id FROM acc_tpls WHERE lower(name)=lower(?) AND id<>?', [$name, $id]);
      if ($dup) {
        if ($rep < 1 || ($rep > 1 && $rep !== (int)$dup['id'])) out(['error' => "A template named $name already exists", 'dup_id' => (int)$dup['id'], 'quiet' => 1], 409);
        $id = (int)$dup['id']; /* replace: the clashing template takes the new name spelling and items */
      }
      $json = json_encode($items, JSON_UNESCAPED_UNICODE);
      if ($id) q('UPDATE acc_tpls SET name=?, items=?, updated_by=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$name, $json, $_SESSION['name'] ?? '', $id]);
      else { q('INSERT INTO acc_tpls(name, items, updated_by) VALUES(?,?,?)', [$name, $json, $_SESSION['name'] ?? '']); $id = (int)db()->lastInsertId(); }
      audit('acc_tpl_put', 'acc_tpls', $id, $name . ' · ' . count($items) . ' item(s)');
      out(['ok' => true, 'id' => $id]);
    }

    case 'tpl_copy': { /* POST {id}: "<name> (copy)", else "(copy 2)", … */
      need('accounts', true);
      $r = row('SELECT * FROM acc_tpls WHERE id=?', [(int)($in['id'] ?? 0)]); if (!$r) fail('Template not found', 404);
      $base = mb_substr($r['name'], 0, 70); $k = 1;
      do { $nm = $base . ($k === 1 ? ' (copy)' : " (copy $k)"); $k++; } while (row('SELECT 1 FROM acc_tpls WHERE lower(name)=lower(?)', [$nm]));
      q('INSERT INTO acc_tpls(name, items, updated_by) VALUES(?,?,?)', [$nm, $r['items'], $_SESSION['name'] ?? '']);
      $nid = (int)db()->lastInsertId();
      audit('acc_tpl_copy', 'acc_tpls', $nid, "$nm (from {$r['name']})");
      out(['ok' => true, 'id' => $nid, 'name' => $nm]);
    }

    case 'tpl_del': {
      need('accounts', true);
      $id = (int)($in['id'] ?? 0); $r = row('SELECT * FROM acc_tpls WHERE id=?', [$id]); if (!$r) fail('Template not found', 404);
      trash_put('Material template', $r['name'], [['acc_tpls', 'id=?', [$id]]]);
      q('DELETE FROM acc_tpls WHERE id=?', [$id]);
      audit('acc_tpl_del', 'acc_tpls', $id, $r['name']);
      out(['ok' => true]);
    }

    case 'ac_pending':
      out(['rows' => acc_pending_rows(!empty($_GET['early']), 0)]); /* every owing project: the tab draws its rows lazily */

    case 'ac_received': {
      [$f, $t] = acc_range(); $rs = acc_received_rows($f, $t);
      out(['rows' => $rs, 'total' => round(array_sum(array_column($rs, 'amount')), 2)]);
    }

    case 'ac_profit': {
      [$f, $t] = acc_range();
      out(acc_profit_get($f, $t));
    }

    case 'ac_expenses': {
      [$f, $t] = acc_range();
      out(['rows' => array_map('acc_expense_row', rows('SELECT * FROM acc_expenses WHERE date >= ? AND date <= ? ORDER BY date DESC, id DESC', [$f, $t])), 'ads' => acc_ads_by_month($f, $t), 'cats' => acc_cats()]);
    }

    case 'expense_save': {
      need('accounts', true);
      $id = (int)($in['id'] ?? 0);
      $date = (string)($in['date'] ?? '');
      if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || date('Y-m-d', strtotime($date)) !== $date) fail('Enter the date of the expense');
      $cat = trim((string)($in['cat'] ?? '')); if (!in_array($cat, acc_cats(), true)) fail('Choose a category');
      $gst = (float)($in['gst'] ?? 0); if (!in_array($gst, array_map('floatval', ACC_GST), true)) fail('GST must be 0, 5, 12, 18 or 28');
      $amount = acc_money($in['amount'] ?? 0, 'Amount'); if ($amount <= 0) fail('Amount: enter an amount in rupees');
      $t = fn($k, $n) => mb_substr(trim((string)($in[$k] ?? '')), 0, $n);
      if ($id) {
        if (!row('SELECT 1 FROM acc_expenses WHERE id=?', [$id])) fail('Expense not found', 404);
        q('UPDATE acc_expenses SET date=?, cat=?, amount=?, gst=?, paid_to=?, mode=?, note=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$date, $cat, $amount, $gst, $t('paid_to', 120), $t('mode', 30), $t('note', 300), $id]);
      } else {
        q('INSERT INTO acc_expenses(date,cat,amount,gst,paid_to,mode,note,created_by) VALUES(?,?,?,?,?,?,?,?)', [$date, $cat, $amount, $gst, $t('paid_to', 120), $t('mode', 30), $t('note', 300), uid()]);
        $id = (int)db()->lastInsertId();
      }
      audit('acc_expense_save', 'acc_expenses', $id, "$cat · ₹$amount");
      out(['ok' => true, 'id' => $id]);
    }

    case 'expense_delete': {
      need('accounts', true);
      $id = (int)($in['id'] ?? 0); $e = row('SELECT * FROM acc_expenses WHERE id=?', [$id]); if (!$e) fail('Expense not found', 404);
      trash_put('Expense', $e['date'] . ' · ' . $e['cat'] . ' · ₹' . $e['amount'], [['acc_expenses', 'id=?', [$id]]]);
      q('DELETE FROM acc_expenses WHERE id=?', [$id]);
      audit('acc_expense_delete', 'acc_expenses', $id, $e['cat']);
      out(['ok' => true]);
    }

    case 'cats_save': {
      if (!is_admin()) fail('Only the admin can change the categories', 403);
      $list = []; foreach ((array)($in['cats'] ?? []) as $c) { $c = mb_substr(trim((string)$c), 0, 40); if ($c !== '' && !in_array($c, $list, true)) $list[] = $c; }
      if (!$list) fail('Keep at least one category');
      if (count($list) > 30) fail('At most 30 categories');
      kv_set('acc_cats', $list);
      audit('acc_cats_save', 'settings', null, implode(', ', $list));
      out(['ok' => true, 'cats' => $list]);
    }

    case 'ac_overview': {
      [$f, $t] = acc_range();
      $rec = acc_received_rows($f, $t, false); $pend = acc_pending_rows(false, 0);
      $x = ['ads' => 0.0, 'ai' => 0.0, 'other' => 0.0];
      foreach (rows('SELECT cat, amount, gst FROM acc_expenses WHERE date >= ? AND date <= ?', [$f, $t]) as $e) {
        $b = round((float)$e['amount'] / (1 + (float)$e['gst'] / 100), 2); /* each entry rounded, as the Expenses tab shows it (ACC.exBefore) */
        $x[$e['cat'] === 'Ads' ? 'ads' : ($e['cat'] === 'AI tools' ? 'ai' : 'other')] += $b;
      }
      foreach (acc_ads_by_month($f, $t) as $m) $x['ads'] += $m['spend'];
      $x = array_map(fn($v) => round($v, 2), $x); $x['total'] = round($x['ads'] + $x['ai'] + $x['other'], 2);
      $pf = acc_profit_get($f, $t);
      /* profit_n = billed projects counted in the profit; no_cost_n = billed projects with no cost lines, left out (the Profit tab lists them) */
      out(['received' => round(array_sum(array_column($rec, 'amount')), 2), 'received_n' => count($rec),
        'pending' => round(array_sum(array_column($pend, 'due')), 2), 'pending_n' => count($pend), 'pending_loan_n' => count(array_filter($pend, fn($r) => $r['loan'] === 'Yes')),
        'expenses' => $x, 'profit' => round($pf['counted']['profit'] - $x['total'], 2), 'profit_n' => count($pf['rows']), 'no_cost_n' => count($pf['no_cost']), 'top' => array_slice($pend, 0, 10)]);
    }
  }
  fail('Unknown action', 404);
}
