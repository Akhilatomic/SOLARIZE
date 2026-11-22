<?php
// Subsidy (PM Surya Ghar) tracker: staff add a customer to the list, then move them through the statuses until the
// subsidy reaches the customer's bank. One row per customer (subsidy_track); every status change is kept (subsidy_log).
// The first seven statuses are the usual path in order; "Subsidy rejected" and "Reverify" are side statuses.
// Access: Subsidy "View" reads the list, "Edit" adds / changes / removes. The amount shows only with Finance access.

const SUBSIDY_FLOW = ['Netmeter installed', 'KSEB doc uploaded', 'DISCOM inspection', 'Inspection completed', 'Subsidy redeem stage', 'Subsidy redeemed', 'Subsidy disbursed'];
const SUBSIDY_SIDE = ['Subsidy rejected', 'Reverify'];
const SUBSIDY_STATUSES = [...SUBSIDY_FLOW, ...SUBSIDY_SIDE];
const SUBSIDY_CLOSED = ['Subsidy disbursed', 'Subsidy rejected']; /* nothing more to follow up */
const SUBSIDY_OLD_MAP = ['Under review' => 'Subsidy redeem stage', 'Approved' => 'Subsidy redeemed', 'Released' => 'Subsidy disbursed']; /* the old project status */
const SUBSIDY_NOTE_MAX = 300;
/* Owner (2026-11-22): at "Subsidy redeemed" staff may upload a screenshot of the portal's redeemed page (optional). It is saved as a
   customer document (files.kind 'subsidy', this item name), kept until someone deletes it, and shown in the customer's subsidy window. */
const SUBSIDY_SHOT_ITEM = 'Subsidy redeemed screenshot';
function subsidy_shots($cid) {
  return array_map(fn($f) => ['id' => (int)$f['id'], 'name' => $f['name'], 'size' => (int)$f['size'], 'created' => $f['created'], 'user' => $f['user']],
    rows("SELECT id, name, size, created, user FROM files WHERE customer_id=? AND kind='subsidy' ORDER BY id DESC", [(int)$cid]));
}

function subsidy_rows($where = '1=1', $args = []) {
  $rs = rows("SELECT st.id, st.customer_id, st.status, st.status_date, st.note, st.created, st.added_by, st.updated, st.updated_by,
      c.name, c.phone, c.district, c.consumer_no, COALESCE(NULLIF(pj.kw,0), NULLIF(c.plant_kw,0), 0) kw,
      COALESCE(pj.application_no,'') application_no, COALESCE(pj.subsidy_amount,0) subsidy_amount, COALESCE(pj.pid,0) project_id
    FROM subsidy_track st JOIN customers c ON c.id=st.customer_id
    LEFT JOIN (SELECT customer_id, SUM(kw) kw, MAX(application_no) application_no, MAX(subsidy_amount) subsidy_amount, MAX(id) pid FROM projects GROUP BY customer_id) pj ON pj.customer_id=c.id
    WHERE $where AND " . cust_scope('c') . " ORDER BY st.status_date DESC, st.id DESC", $args);
  $fin = can('finance');
  foreach ($rs as &$r) {
    foreach (['id', 'customer_id', 'project_id'] as $k) $r[$k] = (int)$r[$k];
    $r['kw'] = (float)$r['kw'];
    if ($fin) $r['subsidy_amount'] = (float)$r['subsidy_amount']; else unset($r['subsidy_amount']);
  }
  unset($r);
  return $rs;
}
function subsidy_date($v) {
  $v = trim((string)$v); if ($v === '') return date('Y-m-d');
  $d = DateTime::createFromFormat('!Y-m-d', $v);
  if (!$d || $d->format('Y-m-d') !== $v) fail('Choose a valid date');
  if ($v > date('Y-m-d', strtotime('+1 day'))) fail('The date cannot be in the future');
  return $v;
}
function subsidy_status($v) { $v = (string)$v; if (!in_array($v, SUBSIDY_STATUSES, true)) fail('Choose a subsidy status'); return $v; }
// one status change: the row, its history line, and the customer's projects follow
function subsidy_put($cid, $status, $date, $note, $isNew) {
  $by = $_SESSION['name'] ?? '';
  if ($isNew) q('INSERT INTO subsidy_track(customer_id, status, status_date, note, added_by, updated_by) VALUES(?,?,?,?,?,?)', [$cid, $status, $date, $note, $by, $by]);
  else q('UPDATE subsidy_track SET status=?, status_date=?, note=?, updated=CURRENT_TIMESTAMP, updated_by=? WHERE customer_id=?', [$status, $date, $note, $by, $cid]);
  q('INSERT INTO subsidy_log(customer_id, status, date, note, by) VALUES(?,?,?,?,?)', [$cid, $status, $date, $note, $by]);
  q('UPDATE projects SET subsidy_status=? WHERE customer_id=?', [$status, $cid]);
}

function handle_subsidy($a) {
  $in = body();
  switch ($a) {
    case 'list': // GET: everyone on the list, and the statuses in order
      need('checklist');
      out(['rows' => subsidy_rows(), 'flow' => SUBSIDY_FLOW, 'side' => SUBSIDY_SIDE, 'closed' => SUBSIDY_CLOSED, 'write' => can('checklist', true), 'fin' => can('finance')]);

    case 'get': // GET: one customer's row with its history (row null = not on the list)
      need('checklist');
      $cid = (int)($_GET['customer_id'] ?? 0);
      $r = subsidy_rows('st.customer_id=?', [$cid])[0] ?? null;
      $log = $r ? rows('SELECT status, date, note, by, at FROM subsidy_log WHERE customer_id=? ORDER BY id DESC', [$cid]) : [];
      out(['row' => $r, 'log' => $log, 'flow' => SUBSIDY_FLOW, 'side' => SUBSIDY_SIDE, 'write' => can('checklist', true), 'shots' => $r ? subsidy_shots($cid) : []]);

    case 'shot': // POST (multipart: customer_id, file): the redeemed-subsidy screenshot → the customer's Documents, kept until deleted
      need('checklist', true);
      $cid = (int)($_POST['customer_id'] ?? 0);
      $st = row('SELECT st.status, c.name FROM subsidy_track st JOIN customers c ON c.id=st.customer_id WHERE st.customer_id=? AND ' . cust_scope('c'), [$cid]);
      if (!$st) fail('This customer is not on the subsidy list', 404);
      $fl = $_FILES['file'] ?? null; $ext = sec_upload($fl, ['image', 'pdf'], 10); /* checked by content (api/security.php) */
      $dir = dirname(__DIR__) . '/data/uploads'; if (!is_dir($dir)) mkdir($dir, 0750, true);
      $name = bin2hex(random_bytes(12)) . '.' . $ext;
      if (!move_uploaded_file($fl['tmp_name'], "$dir/$name")) fail('Could not save file', 500);
      $orig = mb_substr(trim(preg_replace('~[\\\\/:*?"<>|\x00-\x1f]+~', '-', basename((string)$fl['name']))), 0, 150);
      if (strtolower(pathinfo($orig, PATHINFO_EXTENSION)) !== $ext) $orig = 'subsidy-redeemed.' . $ext; /* a pasted picture, or a photo saved under the wrong type */
      q('INSERT INTO files(customer_id,kind,item,name,path,size,user,life) VALUES(?,?,?,?,?,?,?,0)', [$cid, 'subsidy', SUBSIDY_SHOT_ITEM, $orig, $name, (int)$fl['size'], $_SESSION['username'] ?? '']);
      $id = (int)db()->lastInsertId();
      audit('upload', 'files', $id, SUBSIDY_SHOT_ITEM . " · {$st['name']}");
      out(['id' => $id, 'shots' => subsidy_shots($cid)]);

    case 'img': // GET (id, optional dl=1): one redeemed-subsidy screenshot, for whoever may see the subsidy list (no Documents access needed)
      need('checklist');
      $f = row("SELECT f.* FROM files f JOIN customers c ON c.id=f.customer_id WHERE f.id=? AND f.kind='subsidy' AND " . cust_scope('c'), [(int)($_GET['id'] ?? 0)]);
      if (!$f) fail('Not found', 404);
      if (!empty($_GET['dl']) || !empty($_GET['v'])) audit(!empty($_GET['dl']) ? 'doc_download' : 'doc_view', 'files', $f['id'], $f['name'] . ' · ' . SUBSIDY_SHOT_ITEM . ' · customer ' . (int)$f['customer_id']);
      serve_file(dirname(__DIR__) . '/data/uploads/' . basename($f['path']), $f['name'], ['download' => !empty($_GET['dl']), 'cache' => 'private, no-store',
        'csp' => file_mime($f['name']) === 'application/pdf' ? "default-src 'none'; object-src 'self'; frame-ancestors 'self'" : "sandbox; default-src 'none'; img-src 'self'; frame-ancestors 'self'"]);

    case 'candidates': // GET: customers not on the list yet
      need('checklist', true);
      out(rows("SELECT c.id, c.name, c.phone, c.district, c.consumer_no FROM customers c LEFT JOIN subsidy_track st ON st.customer_id=c.id
        WHERE st.id IS NULL AND " . cust_scope('c') . " ORDER BY c.id DESC LIMIT 3000"));

    case 'add': // put a customer on the list (starts at "Netmeter installed" unless another status is sent)
      need('checklist', true);
      $cid = (int)($in['customer_id'] ?? 0);
      $c = row('SELECT id, name FROM customers WHERE id=?', [$cid]); if (!$c) fail('Customer not found', 404);
      if (row('SELECT 1 FROM subsidy_track WHERE customer_id=?', [$cid])) fail('This customer is already on the subsidy list', 409);
      $status = trim((string)($in['status'] ?? '')) === '' ? SUBSIDY_FLOW[0] : subsidy_status($in['status']);
      $date = subsidy_date($in['date'] ?? ''); $note = mb_substr(trim((string)($in['note'] ?? '')), 0, SUBSIDY_NOTE_MAX);
      $db = db(); $db->beginTransaction(); subsidy_put($cid, $status, $date, $note, true); $db->commit();
      audit('add', 'subsidy', $cid, "{$c['name']} · added to the subsidy list · $status");
      out(['ok' => true, 'row' => subsidy_rows('st.customer_id=?', [$cid])[0] ?? null]);

    case 'set': // change the status (with its date and a note)
      need('checklist', true);
      $cid = (int)($in['customer_id'] ?? 0);
      $old = row('SELECT st.*, c.name FROM subsidy_track st JOIN customers c ON c.id=st.customer_id WHERE st.customer_id=?', [$cid]);
      if (!$old) fail('This customer is not on the subsidy list', 404);
      $status = subsidy_status($in['status'] ?? ''); $date = subsidy_date($in['date'] ?? '');
      $note = mb_substr(trim((string)($in['note'] ?? '')), 0, SUBSIDY_NOTE_MAX);
      if ($status === $old['status'] && $date === $old['status_date'] && $note === (string)$old['note']) out(['ok' => true, 'same' => true, 'row' => subsidy_rows('st.customer_id=?', [$cid])[0] ?? null]);
      $db = db(); $db->beginTransaction(); subsidy_put($cid, $status, $date, $note, false); $db->commit();
      audit('status', 'subsidy', $cid, "{$old['name']} · subsidy: {$old['status']} → $status");
      out(['ok' => true, 'row' => subsidy_rows('st.customer_id=?', [$cid])[0] ?? null]);

    case 'remove': // take a customer off the list (to the Recycle bin, with the history)
      need('checklist', true);
      $cid = (int)($in['customer_id'] ?? 0);
      $old = row('SELECT st.*, c.name FROM subsidy_track st JOIN customers c ON c.id=st.customer_id WHERE st.customer_id=?', [$cid]);
      if (!$old) fail('This customer is not on the subsidy list', 404);
      trash_put('Subsidy tracking', $old['name'] . ' · ' . $old['status'], [['subsidy_track', 'customer_id=?', [$cid]], ['subsidy_log', 'customer_id=?', [$cid]]], [['customers', $cid, 'the customer']]);
      q('DELETE FROM subsidy_log WHERE customer_id=?', [$cid]); q('DELETE FROM subsidy_track WHERE customer_id=?', [$cid]);
      audit('remove', 'subsidy', $cid, "{$old['name']} · removed from the subsidy list");
      out(['ok' => true]);
  }
  fail('Unknown action', 404);
}
