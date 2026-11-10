<?php
// Quotation maker: catalogue, settings and boot data. api.php?m=qm&a=<action>
require_once __DIR__ . '/qm_seed.php';

// Merge saved settings over the defaults: objects merge key by key, lists are replaced as a whole.
function qm_merge($def, $saved) {
  if (!is_array($def) || !is_array($saved)) return $saved === null ? $def : $saved;
  if (array_is_list($def)) return array_is_list($saved) ? $saved : $def;
  $o = $def;
  foreach ($saved as $k => $v) $o[$k] = array_key_exists($k, $def) ? qm_merge($def[$k], $v) : $v;
  return $o;
}
function qm_settings(): array {
  $r = row("SELECT v FROM settings WHERE k='qm_settings'");
  $saved = $r ? json_decode($r['v'], true) : null;
  return qm_merge(QM_DEFAULTS, is_array($saved) ? $saved : []);
}
// Force a posted value into the shape of its default (unknown keys dropped, numbers stay numbers, lists keep their item shape).
function qm_coerce($v, $def, $depth = 0) {
  if ($depth > 6) return $def;
  if (is_array($def)) {
    if (!is_array($v)) return $def;
    if (array_is_list($def)) {
      if (!array_is_list($v)) return $def;
      $tpl = $def[0] ?? '';
      return array_values(array_map(fn($x) => qm_coerce($x, $tpl, $depth + 1), array_slice($v, 0, 40)));
    }
    $o = [];
    foreach ($def as $k => $d) $o[$k] = qm_coerce($v[$k] ?? $d, $d, $depth + 1);
    return $o;
  }
  if (is_int($def)) return is_numeric($v) ? (int)round((float)$v) : $def;
  if (is_float($def)) return is_numeric($v) ? (float)$v : $def;
  return is_scalar($v) ? mb_substr(trim((string)$v), 0, 2000) : $def;
}
function qm_number($n = null): string {
  if ($n === null) { $r = row("SELECT v FROM settings WHERE k='qm_next'"); $n = $r ? (int)json_decode($r['v'], true) : 144; if ($n < 1) $n = 144; }
  return str_replace(['{YYYY}', '{NNNN}'], [date('Y'), str_pad((string)$n, 4, '0', STR_PAD_LEFT)], qm_settings()['number_format']);
}
function qm_cat_keys(): array { return array_column(QM_CATS, 0); }
// An image reference: built-in picture, an uploaded name, or (logos only) plain text written as "text:Name".
function qm_img_ok($s, $allowText = false): bool {
  if (!is_string($s) || $s === '') return false;
  if ($allowText && preg_match('/^text:.{1,60}$/us', $s)) return true;
  return (bool)preg_match('#^(assets/quote/[A-Za-z0-9._-]{1,80}\.(png|jpe?g|webp)|qm-[0-9a-f]{24}\.(png|jpe?g|webp))$#', $s);
}
function qm_product_out(array $p, bool $finance): array {
  $p['id'] = (int)$p['id'];
  foreach (['qty', 'wp', 'kw', 'rate'] as $c) $p[$c] = (float)$p[$c];
  foreach (['needs_opt', 'is_default', 'hidden', 'sort'] as $c) $p[$c] = (int)$p[$c];
  $p['warranty'] = json_decode((string)$p['warranty'], true) ?: [];
  $p['brands'] = json_decode((string)$p['brands'], true) ?: [];
  unset($p['created'], $p['updated']);
  if (!$finance) unset($p['rate']);
  return $p;
}
function qm_clean_warranty($v): array {
  $o = [];
  foreach (is_array($v) ? array_slice($v, 0, 8) : [] as $w) {
    if (!is_array($w)) continue;
    $y = mb_substr(trim((string)($w['years'] ?? '')), 0, 12); $l = mb_substr(trim((string)($w['label'] ?? '')), 0, 80);
    if ($y !== '' || $l !== '') $o[] = ['years' => $y, 'label' => $l];
  }
  return $o;
}
function qm_clean_brands($v): array {
  $o = [];
  foreach (is_array($v) ? array_slice($v, 0, 8) : [] as $b) {
    if (!is_array($b)) continue;
    $logos = [];
    foreach (is_array($b['logos'] ?? null) ? array_slice($b['logos'], 0, 10) : [] as $l) if (qm_img_ok($l, true)) $logos[] = $l;
    $label = mb_substr(trim((string)($b['label'] ?? '')), 0, 30);
    if ($logos) $o[] = ['label' => $label, 'logos' => $logos];
  }
  return $o;
}

function handle_qm($a) {
  $in = body();
  switch ($a) {
    case 'boot': {
      need('quotes');
      $fin = can('finance');
      $products = array_map(fn($p) => qm_product_out($p, $fin), rows('SELECT * FROM qm_products ORDER BY sort, id'));
      $templates = array_map(function ($t) { $t['id'] = (int)$t['id']; $t['data'] = json_decode((string)$t['data'], true) ?: new stdClass(); $t['created_by'] = $t['created_by'] === null ? null : (int)$t['created_by']; $t['created_name'] = (string)($t['created_name'] ?? ''); return $t; },
        rows('SELECT t.id,t.name,t.data,t.created_by,u.name AS created_name,t.updated FROM qm_templates t LEFT JOIN users u ON u.id=t.created_by ORDER BY t.id'));
      out(['cats' => QM_CATS, 'products' => $products, 'templates' => $templates, 'settings' => qm_settings(), 'admin' => is_admin() ? 1 : 0, 'finance' => $fin ? 1 : 0, 'next_number' => qm_number()]);
    }
    case 'product_save': {
      if (!is_admin()) fail('Only an admin can change the product list', 403);
      $id = (int)($in['id'] ?? 0);
      $cur = $id ? row('SELECT * FROM qm_products WHERE id=?', [$id]) : null;
      if ($id && !$cur) fail('Product not found', 404);
      $get = fn($k, $def) => array_key_exists($k, $in) ? $in[$k] : ($cur[$k] ?? $def);
      $cat = (string)$get('cat', '');
      if (!in_array($cat, qm_cat_keys(), true)) fail('Choose a category');
      $name = mb_substr(trim((string)$get('name', '')), 0, 120);
      if ($name === '') fail('Enter a name');
      $txt = fn($k, $max) => mb_substr(trim((string)$get($k, '')), 0, $max);
      $num = fn($k, $def) => max(0, (float)$get($k, $def));
      $warranty = array_key_exists('warranty', $in) ? qm_clean_warranty($in['warranty']) : (json_decode((string)($cur['warranty'] ?? '[]'), true) ?: []);
      $brands = array_key_exists('brands', $in) ? qm_clean_brands($in['brands']) : (json_decode((string)($cur['brands'] ?? '[]'), true) ?: []);
      $pic = (string)$get('picture', ''); $page = (string)$get('page', '');
      if ($pic !== '' && !qm_img_ok($pic)) fail('That picture is not valid');
      if ($page !== '' && !qm_img_ok($page)) fail('That page image is not valid');
      $vals = [$cat, $name, $txt('line', 300), $txt('details', 2000), $txt('title', 80), $txt('unit', 30) ?: 'no', $num('qty', 1), $txt('qty_note', 80), $num('wp', 0), $num('kw', 0), (int)(!empty($get('needs_opt', 0))),
        json_encode($warranty, JSON_UNESCAPED_UNICODE), json_encode($brands, JSON_UNESCAPED_UNICODE), $pic, $page, $num('rate', 0), (int)(!empty($get('is_default', 0))), (int)(!empty($get('hidden', 0)))];
      $db = db(); $db->beginTransaction();
      try {
        if ($cur) {
          q("UPDATE qm_products SET cat=?,name=?,line=?,details=?,title=?,unit=?,qty=?,qty_note=?,wp=?,kw=?,needs_opt=?,warranty=?,brands=?,picture=?,page=?,rate=?,is_default=?,hidden=?,updated=CURRENT_TIMESTAMP WHERE id=?", array_merge($vals, [$id]));
        } else {
          $sort = (int)row('SELECT COALESCE(MAX(sort),0)+10 s FROM qm_products')['s'];
          q('INSERT INTO qm_products(cat,name,line,details,title,unit,qty,qty_note,wp,kw,needs_opt,warranty,brands,picture,page,rate,is_default,hidden,sort) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', array_merge($vals, [$sort]));
          $id = (int)$db->lastInsertId();
        }
        if ($vals[16]) q('UPDATE qm_products SET is_default=0 WHERE cat=? AND id<>?', [$cat, $id]);
        $db->commit();
      } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
      audit('qm_product_save', 'qm_products', $id, $name);
      out(['id' => $id]);
    }
    case 'upload': {
      if (!is_admin()) fail('Only an admin can upload pictures', 403);
      $ext = sec_upload($_FILES['file'] ?? null, ['image'], 5);
      $ref = 'qm-' . bin2hex(random_bytes(12)) . '.' . $ext;
      if (!move_uploaded_file($_FILES['file']['tmp_name'], up_dir() . '/' . $ref)) fail('Could not save the picture', 500);
      audit('qm_upload', 'qm_products', null, $ref);
      out(['ref' => $ref]);
    }
    case 'img': {
      $f = basename((string)($_GET['f'] ?? ''));
      if (!preg_match('/^qm-[0-9a-f]{24}\.(png|jpg|webp)$/', $f) || !is_file(up_dir() . '/' . $f)) fail('Not found', 404);
      $types = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'webp' => 'image/webp'];
      header('Content-Type: ' . $types[pathinfo($f, PATHINFO_EXTENSION)]);
      header('Cache-Control: private, max-age=604800');
      header('Content-Length: ' . filesize(up_dir() . '/' . $f));
      readfile(up_dir() . '/' . $f);
      exit;
    }
    case 'settings_save': {
      if (!is_admin()) fail('Only an admin can change the quotation settings', 403);
      if (!is_array($in['settings'] ?? null)) fail('Nothing to save');
      $clean = qm_coerce(qm_merge(QM_DEFAULTS, $in['settings']), QM_DEFAULTS);
      if ($clean['valid_days'] < 1) $clean['valid_days'] = QM_DEFAULTS['valid_days'];
      if (strpos($clean['number_format'], '{NNNN}') === false) $clean['number_format'] = QM_DEFAULTS['number_format'];
      kv_set('qm_settings', $clean);
      audit('qm_settings', 'settings');
      out(['ok' => true]);
    }
  }
  fail('Unknown action', 404);
}
