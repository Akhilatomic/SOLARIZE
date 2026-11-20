<?php
// Ctrl+K quick search (owner's choice 2026-11-20): one box that finds leads, customers, projects and quotations by name, phone,
// consumer no., application no. or quotation number. GET find/go?q=… → up to FIND_PER of each kind the person may open.
// Leads follow the Leads rules: only the person's own or the claimable pool (lead_scope), and a phone number only matches a lead
// the person may already see in full (their own; the admin all) - so the box cannot be used to test numbers in the unclaimed pool.
const FIND_PER = 6;

function handle_find($a) {
  if ($a !== 'go') fail('Unknown action', 404);
  $q = trim(mb_substr((string)($_GET['q'] ?? ''), 0, 60));
  if (mb_strlen($q) < 2) out(['q' => $q, 'leads' => [], 'customers' => [], 'projects' => [], 'quotes' => []]);
  $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
  $digits = preg_replace('/\D/', '', $q); $dl = strlen($digits) >= 4 ? '%' . $digits . '%' : null;
  $txt = fn($cols) => '(' . implode(' OR ', array_map(fn($c) => "$c LIKE :q ESCAPE '\\'", $cols)) . ')';
  $res = ['q' => $q, 'leads' => [], 'customers' => [], 'projects' => [], 'quotes' => []];
  if (can('leads')) {
    $own = is_admin() ? '1=1' : 'l.assigned_to=' . uid();
    $rs = rows("SELECT l.id, l.name, l.phone, l.email, l.city, l.status, l.assigned_to, l.customer_id FROM leads l WHERE " . lead_scope() . " AND (" . $txt(['l.name', 'l.city', 'l.location']) .
      ($dl ? " OR ($own AND REPLACE(REPLACE(l.phone,' ',''),'+','') LIKE :d)" : '') . ") ORDER BY l.updated DESC LIMIT " . FIND_PER, [':q' => $like] + ($dl ? [':d' => $dl] : []));
    $res['leads'] = array_map(fn($l) => array_intersect_key(lead_mask($l), array_flip(['id', 'name', 'phone', 'city', 'status', 'customer_id', 'masked'])), $rs);
  }
  if (can('customers')) {
    $res['customers'] = rows("SELECT c.id, c.name, c.phone, c.district, c.consumer_no FROM customers c WHERE " . cust_scope('c') . " AND (" . $txt(['c.name', 'c.consumer_no', 'c.district', 'c.address']) .
      ($dl ? " OR REPLACE(REPLACE(c.phone,' ',''),'+','') LIKE :d OR REPLACE(c.alt_phone,' ','') LIKE :d" : '') . ") ORDER BY c.updated DESC LIMIT " . FIND_PER, [':q' => $like] + ($dl ? [':d' => $dl] : []));
  }
  if (can('projects')) {
    $res['projects'] = rows("SELECT p.id, p.title, p.kw, p.stage, c.name customer FROM projects p LEFT JOIN customers c ON c.id=p.customer_id WHERE " . cust_scope('c') . " AND " . $txt(['p.title', 'c.name', 'p.application_no']) . " ORDER BY p.updated DESC LIMIT " . FIND_PER, [':q' => $like]);
  }
  if (can('quotes')) {
    $rs = rows("SELECT q.id, q.number, q.status, q.total, q.date, COALESCE(c.name, l.name) who FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id LEFT JOIN leads l ON l.id=q.lead_id
      WHERE (c.id IS NULL OR " . cust_scope('c') . ") AND (l.id IS NULL OR c.id IS NOT NULL OR " . lead_scope() . ") AND " . $txt(['q.number', 'c.name', 'l.name']) . " ORDER BY q.id DESC LIMIT " . FIND_PER, [':q' => $like]);
    if (!can('finance')) foreach ($rs as &$r) unset($r['total']); unset($r);
    $res['quotes'] = $rs;
  }
  out($res);
}
