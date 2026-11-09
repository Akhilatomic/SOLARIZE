<?php
// Lead claiming: only users the admin enables can see & claim unclaimed leads.
// A claimed lead is locked to its owner (others can't see, edit or contact it); only the admin can unlock or reassign.

function is_admin() { return ($_SESSION['role'] ?? '') === 'admin'; }
function uid() { return (int)($_SESSION['uid'] ?? 0); }
function can_claim() {
  static $c = null;
  if ($c === null) $c = is_admin() || (int)(row('SELECT can_claim FROM users WHERE id=?', [uid()])['can_claim'] ?? 0) === 1;
  return $c;
}
function lead_can_read($l) { return is_admin() || (int)$l['assigned_to'] === uid() || (empty($l['assigned_to']) && can_claim()); }
function lead_can_write($l) { return is_admin() || (int)$l['assigned_to'] === uid(); }
function lead_scope($alias = 'l') {
  if (is_admin()) return '1=1';
  return "($alias.assigned_to=" . uid() . (can_claim() ? " OR $alias.assigned_to IS NULL" : '') . ')';
}
// Unclaimed leads show a masked phone/email to non-admins until claimed, so contacts can't be copied without claiming.
function lead_mask($l) {
  $l['can_edit'] = lead_can_write($l) ? 1 : 0;
  if ($l['can_edit']) return $l;
  $d = preg_replace('/\D/', '', (string)($l['phone'] ?? ''));
  if ($d !== '') $l['phone'] = substr($d, 0, 3) . str_repeat('•', max(0, strlen($d) - 5)) . substr($d, -2);
  if (!empty($l['email'])) $l['email'] = substr($l['email'], 0, 1) . '•••@' . (explode('@', $l['email'])[1] ?? '');
  $l['masked'] = 1;
  return $l;
}
function owner_name($id) { return $id ? (row('SELECT name FROM users WHERE id=?', [(int)$id])['name'] ?? 'another user') : ''; }
function lead_need_write($l) {
  if (lead_can_write($l)) return;
  if (empty($l['assigned_to'])) fail('Claim this lead first', 403);
  fail('This lead is locked to ' . owner_name($l['assigned_to']) . '. Only the admin can unlock it.', 403);
}
function lead_or_404($id) {
  $l = row('SELECT * FROM leads WHERE id=?', [(int)$id]);
  if (!$l || !lead_can_read($l)) fail('Not found', 404);
  return $l;
}

// Runs before the generic CRUD for leads. Handles list/get/claim/unlock/assign; checks ownership for writes.
function lead_guard($a, $in) {
  switch ($a) {
    case 'list':
      need('leads');
      out(array_map('lead_mask', rows('SELECT l.*, u.name owner_name FROM leads l LEFT JOIN users u ON u.id=l.assigned_to WHERE ' . lead_scope() . ' ORDER BY l.updated DESC, l.id DESC')));
    case 'get':
      need('leads');
      $l = lead_or_404($_GET['id'] ?? 0);
      $r = lead_mask(detail('leads', $l)); $r['owner_name'] = owner_name($l['assigned_to']);
      if (!empty($r['masked'])) $r['messages'] = [];
      out($r);
    case 'claim':
      need('leads');
      if (!can_claim()) fail('Lead claiming is not enabled for your account. Ask the admin.', 403);
      $id = (int)($in['id'] ?? 0);
      $n = q("UPDATE leads SET assigned_to=?, claimed_at=?, updated=CURRENT_TIMESTAMP WHERE id=? AND (assigned_to IS NULL OR assigned_to=0)", [uid(), gmdate('Y-m-d H:i:s'), $id])->rowCount();
      if (!$n) { $l = row('SELECT assigned_to FROM leads WHERE id=?', [$id]); if (!$l) fail('Not found', 404); fail('Already claimed by ' . owner_name($l['assigned_to']), 409); }
      audit('claim', 'leads', $id, $_SESSION['name'] ?? ''); out(['ok' => true]);
    case 'unlock': case 'unclaim':
      // the owner can release their own lead; the admin can release any lead
      $l = lead_or_404($in['id'] ?? 0); $id = (int)$l['id'];
      if (empty($l['assigned_to'])) out(['ok' => true]);
      if (!is_admin() && (int)$l['assigned_to'] !== uid()) fail('Only the owner or the admin can unclaim this lead', 403);
      $prev = owner_name($l['assigned_to']);
      q("UPDATE leads SET assigned_to=NULL, claimed_at='', updated=CURRENT_TIMESTAMP WHERE id=?", [$id]);
      audit('unclaim', 'leads', $id, 'released by ' . ($_SESSION['name'] ?? '') . ' (was ' . $prev . ')'); out(['ok' => true]);
    case 'assign':
      if (!is_admin()) fail('Only the admin can assign a lead', 403);
      $id = (int)($in['id'] ?? 0); $u = row('SELECT id,name FROM users WHERE id=? AND active=1', [(int)($in['user_id'] ?? 0)]);
      if (!$u) fail('Choose an active user');
      q('UPDATE leads SET assigned_to=?, claimed_at=?, updated=CURRENT_TIMESTAMP WHERE id=?', [$u['id'], gmdate('Y-m-d H:i:s'), $id]);
      audit('assign', 'leads', $id, '→ ' . $u['name']); out(['ok' => true]);
    case 'save':
      if (!empty($in['id'])) lead_need_write(lead_or_404($in['id']));
      return; // generic save continues (assigned_to / claimed_at are protected there)
    case 'delete': case 'convert':
      lead_need_write(lead_or_404($in['id'] ?? 0));
      return;
  }
}
