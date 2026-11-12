<?php
// Recycle bin: every delete first snapshots the item (and everything deleted with it) here and moves its files to data/trash.
// Restore re-inserts the rows with their original ids and moves files back. Items are purged for good after 72 hours.
// Uploaded documents (files table) live 365 days, then go to the bin (and are purged 72 h later).
// Exception: warranty cards (files.kind = 'warranty') are kept forever.

const TRASH_HOURS = 72;
const DOC_LIFE_DAYS = 365;
const GEN_LIFE_DAYS = 120; /* papers the CRM makes for a customer (they can be made again any time) */
/* paper => [area its maker must be able to open, days the copy is kept (0 = until someone deletes it)] — used by files/keep */
const GEN_KEEP = ['kseb' => ['checklist', GEN_LIFE_DAYS], 'bank' => ['loans', GEN_LIFE_DAYS], 'quote' => ['quotes', GEN_LIFE_DAYS], 'receipt' => ['payments', GEN_LIFE_DAYS],
  'tax' => ['finance', 0], 'warranty' => ['customers', 0]];
const TRASH_FILE_COLS = ['files' => 'path', 'datasheets' => 'path', 'wa_msgs' => 'file_path'];

function trash_dir() { $d = dirname(__DIR__) . '/data/trash'; if (!is_dir($d)) mkdir($d, 0750, true); return $d; }
function up_dir() { $d = dirname(__DIR__) . '/data/uploads'; if (!is_dir($d)) mkdir($d, 0750, true); return $d; }

// $spec: list of [table, where, params] in parent-first order. $needs: [[table, id, label]] that must exist to restore.
// $relink: [[table, column, value, ids]] re-applied on restore (links the delete had cleared).
function trash_put($kind, $label, array $spec, array $needs = [], array $relink = []) {
  $data = ['rows' => [], 'files' => [], 'needs' => $needs, 'relink' => $relink];
  foreach ($spec as [$t, $w, $p]) {
    $rs = rows("SELECT * FROM $t WHERE $w", $p); if (!$rs) continue;
    $data['rows'][] = [$t, $rs];
    if (isset(TRASH_FILE_COLS[$t])) foreach ($rs as $r) { $f = basename((string)($r[TRASH_FILE_COLS[$t]] ?? '')); if ($f === '') continue;
      if (is_file(up_dir() . "/$f") && @rename(up_dir() . "/$f", trash_dir() . "/$f")) $data['files'][] = $f; }
  }
  if (!$data['rows']) return 0;
  q('INSERT INTO trash(kind,label,data,deleted_by,deleted_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)', [$kind, mb_substr($label, 0, 200), json_encode($data, JSON_UNESCAPED_UNICODE), $_SESSION['name'] ?? 'System']);
  return (int)db()->lastInsertId();
}
// building blocks
function trash_spec_project($pid) {
  return [['projects', 'id=?', [$pid]], ['project_steps', 'project_id=?', [$pid]], ['stage_data', 'project_id=?', [$pid]], ['services', 'project_id=?', [$pid]],
    ['checklist', 'project_id=?', [$pid]], ['payments', 'project_id=?', [$pid]], ['acc_costs', 'project_id=?', [$pid]], ['files', 'project_id=?', [$pid]], ['notes', "entity='projects' AND entity_id=?", [$pid]]];
}
function trash_spec_customer($cid, $withLinked = true) {
  $s = [['customers', 'id=?', [$cid]], ['plant', 'customer_id=?', [$cid]], ['fees', 'customer_id=?', [$cid]], ['gen_docs', 'customer_id=?', [$cid]], ['commissions', 'customer_id=?', [$cid]], ['cust_cost', 'customer_id=?', [$cid]]];
  foreach (rows('SELECT id FROM projects WHERE customer_id=?', [$cid]) as $p) $s = array_merge($s, trash_spec_project($p['id']));
  $s[] = ['files', 'customer_id=? AND (project_id IS NULL OR project_id=0)', [$cid]];
  if ($withLinked) { $s[] = ['quotes', 'customer_id=?', [$cid]]; $s[] = ['messages', 'customer_id=?', [$cid]]; $s[] = ['notes', "entity='customers' AND entity_id=?", [$cid]];
    $s[] = ['discussions', 'customer_id=?', [$cid]]; $s[] = ['disc_msgs', 'discussion_id IN (SELECT id FROM discussions WHERE customer_id=?)', [$cid]]; }
  return $s;
}
function trash_spec_lead($lid) {
  return [['leads', 'id=?', [$lid]], ['notes', "entity='leads' AND entity_id=?", [$lid]], ['discussions', 'lead_id=?', [$lid]], ['disc_msgs', 'discussion_id IN (SELECT id FROM discussions WHERE lead_id=?)', [$lid]]];
}

// called by the generic CRUD delete before it removes anything
function trash_crud($t, $id) {
  $r = row("SELECT * FROM $t WHERE id=?", [$id]); if (!$r) return;
  switch ($t) {
    case 'leads': trash_put('Lead', $r['name'] . ($r['phone'] ? ' · ' . $r['phone'] : ''), trash_spec_lead($id)); break;
    case 'customers': trash_put('Customer', $r['name'] . ' (with projects, documents, quotes)', trash_spec_customer($id), [], [['leads', 'customer_id', $id, array_column(rows('SELECT id FROM leads WHERE customer_id=?', [$id]), 'id')]]); break;
    case 'projects': trash_put('Project', ($r['title'] ?: 'Project') . ' · ' . (row('SELECT name FROM customers WHERE id=?', [$r['customer_id']])['name'] ?? ''), trash_spec_project($id), [['customers', $r['customer_id'], 'the customer']]); break;
    case 'quotes': trash_put('Quotation', ($r['number'] ?: 'Quote') . ' · ₹' . number_format((float)$r['total']), [['quotes', 'id=?', [$id]], ['notes', "entity='quotes' AND entity_id=?", [$id]]]); break;
    case 'payments': trash_put('Payment', '₹' . number_format((float)$r['amount']) . ' · ' . $r['date'] . ' · ' . (row('SELECT title FROM projects WHERE id=?', [$r['project_id']])['title'] ?? ''), [['payments', 'id=?', [$id]]], [['projects', $r['project_id'], 'the project']]); break;
    case 'campaigns': trash_put('Ad campaign', $r['name'], [['campaigns', 'id=?', [$id]], ['ad_spend', 'campaign_id=?', [$id]]], [], [['leads', 'campaign_id', $id, array_column(rows('SELECT id FROM leads WHERE campaign_id=?', [$id]), 'id')]]); break;
    case 'ad_spend': trash_put('Ad spend', $r['date'] . ' · ₹' . number_format((float)$r['spend']), [['ad_spend', 'id=?', [$id]]], [['campaigns', $r['campaign_id'], 'the campaign']]); break;
    default: trash_put(ucfirst($t), "#$id", [[$t, 'id=?', [$id]]]);
  }
}
function trash_file_row($f, $why = '') { // one uploaded document
  $owner = $f['project_id'] ? (row('SELECT title FROM projects WHERE id=?', [$f['project_id']])['title'] ?? '') : (row('SELECT name FROM customers WHERE id=?', [$f['customer_id']])['name'] ?? '');
  $needs = $f['project_id'] ? [['projects', $f['project_id'], 'the project']] : ($f['customer_id'] ? [['customers', $f['customer_id'], 'the customer']] : []);
  $relink = [];
  foreach (rows('SELECT project_id, stage FROM stage_data WHERE file_id=?', [$f['id']]) as $sd) $relink[] = ['stage_data', 'file_id', $f['id'], [], $sd['project_id'], $sd['stage']];
  return trash_put($why ? 'Document (expired)' : 'Document', $f['name'] . ($owner ? ' · ' . $owner : '') . ($why ? " · $why" : ''), [['files', 'id=?', [$f['id']]]], $needs, $relink);
}

function trash_restore($id) {
  $t = row('SELECT * FROM trash WHERE id=?', [$id]); if (!$t) fail('Not found — it may have been removed for good', 404);
  $d = json_decode($t['data'], true) ?: [];
  foreach ($d['needs'] ?? [] as [$tb, $nid, $lbl]) if ($nid && !row("SELECT 1 FROM $tb WHERE id=?", [$nid])) fail("Restore $lbl first — it is deleted too (look for it in the Recycle bin).");
  $db = db(); $db->beginTransaction();
  try {
    foreach ($d['rows'] ?? [] as [$tb, $rs]) {
      $cols = array_column($db->query("PRAGMA table_info($tb)")->fetchAll(), 'name');
      foreach ($rs as $r) { $r = array_intersect_key($r, array_flip($cols)); if (!$r) continue;
        $k = array_keys($r); q("INSERT OR REPLACE INTO $tb(" . implode(',', $k) . ') VALUES(' . implode(',', array_fill(0, count($k), '?')) . ')', array_values($r)); }
    }
    foreach ($d['relink'] ?? [] as $rl) {
      if ($rl[0] === 'stage_data') { q('UPDATE stage_data SET file_id=? WHERE project_id=? AND stage=?', [$rl[2], $rl[4], $rl[5]]); continue; }
      [$tb, $col, $val, $ids] = $rl; $ids = array_map('intval', (array)$ids);
      if ($ids) q("UPDATE $tb SET $col=? WHERE id IN (" . implode(',', $ids) . ") AND ($col IS NULL OR $col='' OR $col=0)", [$val]);
      if ($tb === 'leads' && $col === 'customer_id' && $ids) q("UPDATE leads SET status='Won' WHERE id IN (" . implode(',', $ids) . ')');
    }
    $db->commit();
  } catch (Throwable $e) { $db->rollBack(); fail('Could not restore: ' . $e->getMessage()); }
  foreach ($d['files'] ?? [] as $f) if (is_file(trash_dir() . "/$f")) @rename(trash_dir() . "/$f", up_dir() . "/$f");
  if ($t['kind'] === 'Document (expired)') foreach ($d['rows'] ?? [] as [$tb, $rs]) if ($tb === 'files') foreach ($rs as $r) q('UPDATE files SET created=CURRENT_TIMESTAMP WHERE id=?', [$r['id']]); /* a fresh keeping time */
  q('DELETE FROM trash WHERE id=?', [$id]);
  return $t;
}
function trash_purge_row($t) {
  $d = json_decode($t['data'], true) ?: [];
  foreach ($d['files'] ?? [] as $f) @unlink(trash_dir() . '/' . basename($f));
  q('DELETE FROM trash WHERE id=?', [$t['id']]);
}

// hourly upkeep (runs on any request): expire old documents, purge the bin
function housekeeping($force = false) {
  $last = (int)(row("SELECT v FROM settings WHERE k='hk_last'")['v'] ?? 0);
  if (!$force && time() - $last < 3600) return;
  kv_set('hk_last', time()); /* a number, so the (int) read above works — a string was stored JSON-quoted, read back as 0, and this "hourly" job ran on every request */
  $n = 0;
  /* each document has its own keeping time: files.life days (NULL = DOC_LIFE_DAYS, 0 = kept until deleted) */
  foreach (rows("SELECT * FROM files WHERE COALESCE(kind,'') <> 'warranty' AND COALESCE(life, " . DOC_LIFE_DAYS . ") > 0 AND created < datetime('now', '-' || COALESCE(life, " . DOC_LIFE_DAYS . ") || ' days') LIMIT 200") as $f) {
    trash_file_row($f, 'older than ' . ($f['life'] === null ? DOC_LIFE_DAYS : (int)$f['life']) . ' days');
    q('UPDATE stage_data SET file_id=NULL WHERE file_id=?', [$f['id']]); q('DELETE FROM files WHERE id=?', [$f['id']]); $n++;
  }
  if ($n) { audit('docs_expired', 'files', null, "$n document(s) past their keeping time moved to the Recycle bin"); }
  try { fee_alerts(); } catch (Throwable $e) { }
  try { callback_alerts(); } catch (Throwable $e) { } /* also when nobody has the CRM open */
  try { lead_autolost(); } catch (Throwable $e) { } /* new leads nobody attended within 24 hours → Lost */
  foreach (rows("SELECT id,data FROM trash WHERE deleted_at < datetime('now', ?)", ['-' . TRASH_HOURS . ' hours']) as $t) trash_purge_row($t);
  try { db()->exec('PRAGMA optimize'); } catch (Throwable $e) { } // keeps the query planner's statistics current (cheap, usually a no-op)
}

function handle_trash($a) {
  $in = body();
  switch ($a) {
    case 'list':
      need('recycle'); housekeeping();
      out(['hours' => TRASH_HOURS, 'doc_days' => DOC_LIFE_DAYS, 'now' => gmdate('Y-m-d H:i:s'),
        'rows' => array_map(function ($t) { $d = json_decode($t['data'], true) ?: []; unset($t['data']);
          $t['count'] = array_sum(array_map(fn($x) => count($x[1]), $d['rows'] ?? [])); $t['files'] = count($d['files'] ?? []); return $t; },
          rows('SELECT * FROM trash ORDER BY id DESC LIMIT 500'))]);
    case 'restore':
      need('recycle', true);
      $t = trash_restore((int)($in['id'] ?? 0)); audit('restore', 'trash', $t['id'], $t['kind'] . ': ' . $t['label']); out(['ok' => true, 'kind' => $t['kind']]);
    case 'purge': // delete forever (admin)
      if (!is_admin()) fail('Only an admin can delete items for good', 403);
      if (!empty($in['all'])) { foreach (rows('SELECT id,data FROM trash') as $t) trash_purge_row($t); audit('trash_empty', 'trash'); out(['ok' => true]); }
      $t = row('SELECT * FROM trash WHERE id=?', [(int)($in['id'] ?? 0)]); if (!$t) fail('Not found', 404);
      trash_purge_row($t); audit('trash_purge', 'trash', $t['id'], $t['kind'] . ': ' . $t['label']); out(['ok' => true]);
  }
  fail('Unknown action', 404);
}
