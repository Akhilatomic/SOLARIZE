<?php
// KSEB section offices: section code, section, sub division, division, circle (kseb_offices.json, from kseb.in's office
// search, see tools/kseb_offices.py). Used to fill a customer's electrical sub division / division / circle (and the
// section itself) from the KSEB consumer number or the section name.
// A 13-digit KSEB consumer number is 11 + the 4-digit section code + the rest (1146533011286 → section 4653, Chullimanoor).

function kseb_offices() {
  static $o = null;
  if ($o !== null) return $o;
  $list = json_decode((string)@file_get_contents(__DIR__ . '/kseb_offices.json'), true) ?: [];
  $o = ['code' => [], 'name' => [], 'list' => $list];
  foreach ($list as $r) {
    $o['code'][$r['code']] = $r;
    $n = kseb_sec_key($r['section']);
    if ($n !== '' && !isset($o['name'][$n])) $o['name'][$n] = $r; // a name used by two offices keeps the first; the consumer number tells them apart
  }
  return $o;
}
// "Section Ernakulam", "Aluva Town", "AluvaTown", "Electrical Section, Vattiyoorkavu" → the same key
function kseb_sec_key($s) {
  $s = strtolower(trim((string)$s));
  $s = preg_replace('/\b(electrical|section|office|kseb|ksebl|es)\b/', ' ', $s);
  return preg_replace('/[^a-z]/', '', $s);
}
// the section code inside a 13-digit consumer number, or ''
function kseb_code_of($consumer_no) {
  $d = preg_replace('/\D/', '', (string)$consumer_no);
  return strlen($d) === 13 && substr($d, 0, 2) === '11' ? substr($d, 2, 4) : '';
}
// the office for a consumer number (first) or a section name; null when neither is known
function kseb_office($consumer_no, $section) {
  $O = kseb_offices();
  $c = kseb_code_of($consumer_no);
  if ($c !== '' && isset($O['code'][$c])) return $O['code'][$c];
  $k = kseb_sec_key($section);
  return $k !== '' ? ($O['name'][$k] ?? null) : null;
}

const KSEB_OFFICE_FIELDS = ['kseb_section' => 'section', 'kseb_subdivision' => 'subdivision', 'kseb_division' => 'division', 'kseb_circle' => 'circle'];
/* customer save: fill the section, sub division, division and circle from the office.
   An empty field is always filled. When the consumer number or section changed in this save, a field the user did
   not touch (still its old value) follows the new office; a value typed in this same save is kept. */
function kseb_autofill(array $v, $old = null) {
  $o = kseb_office($v['consumer_no'] ?? '', $v['kseb_section'] ?? '');
  if (!$o) return $v;
  $moved = $old && (preg_replace('/\D/', '', (string)$old['consumer_no']) !== preg_replace('/\D/', '', (string)($v['consumer_no'] ?? ''))
    || kseb_sec_key($old['kseb_section']) !== kseb_sec_key($v['kseb_section'] ?? ''));
  foreach (KSEB_OFFICE_FIELDS as $k => $f) {
    if (!array_key_exists($k, $v) || $o[$f] === '') continue;
    $cur = trim((string)$v[$k]);
    if ($cur === '' || ($moved && $cur === trim((string)($old[$k] ?? '')))) $v[$k] = $o[$f];
  }
  return $v;
}
/* once, when the database is upgraded: every customer gets the empty office fields filled. Returns how many changed. */
function kseb_backfill($db) {
  if (!kseb_offices()['list']) return 0;
  $have = array_column($db->query('PRAGMA table_info(customers)')->fetchAll(PDO::FETCH_ASSOC), 'name');
  foreach (array_merge(['consumer_no'], array_keys(KSEB_OFFICE_FIELDS)) as $c) if (!in_array($c, $have)) return 0;
  $n = 0;
  $up = $db->prepare('UPDATE customers SET kseb_section=?, kseb_subdivision=?, kseb_division=?, kseb_circle=? WHERE id=?');
  foreach ($db->query('SELECT id, consumer_no, kseb_section, kseb_subdivision, kseb_division, kseb_circle FROM customers')->fetchAll(PDO::FETCH_ASSOC) as $c) {
    $v = kseb_autofill($c);
    if ($v === $c) continue;
    $up->execute([$v['kseb_section'], $v['kseb_subdivision'], $v['kseb_division'], $v['kseb_circle'], $c['id']]);
    $n++;
  }
  return $n;
}
