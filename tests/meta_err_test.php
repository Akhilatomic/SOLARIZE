<?php
// Meta lead sync errors (api/meta.php): Meta's code, subcode, trace id and the failing step are kept, with a plain hint
// for the usual causes. Usage: php tests/meta_err_test.php  (no server or network needed)
require __DIR__ . '/../api/meta.php';
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }

$b = meta_error_detail(['error' => ['message' => 'API access blocked.', 'type' => 'OAuthException', 'code' => 200, 'fbtrace_id' => 'AbC123']], 'Reading the Page');
chk($b['code'] === 200 && $b['trace'] === 'AbC123' && $b['step'] === 'Reading the Page' && $b['type'] === 'OAuthException', 'API access blocked: code, type, trace id and step kept');
chk(strpos($b['hint'], 'developers.facebook.com') !== false && strpos($b['hint'], 'Leads Access') !== false && strpos($b['hint'], 'not in the CRM') !== false, 'API access blocked: says it is fixed in Meta, and where');
$x = meta_error_detail(['error' => ['message' => 'Error validating access token: Session has expired', 'code' => 190, 'error_subcode' => 463]], 'Reading the lead forms of the Page');
chk($x['subcode'] === 463 && strpos($x['hint'], 'expired') !== false, 'expired token: make a new one');
$p = meta_error_detail(['error' => ['message' => '(#200) Requires leads_retrieval permission to manage the object', 'code' => 200]], 'Reading the leads of form 123');
chk(strpos($p['hint'], 'missing a permission') !== false, 'missing permission: which ones to give');
$r = meta_error_detail(['error' => ['message' => 'User request limit reached', 'code' => 17]], 'Reading the leads of form 123');
chk(strpos($r['hint'], 'limit') !== false, 'rate limit: tries again later');
chk(meta_error_detail(['error' => ['message' => 'Unsupported get request', 'code' => 100]], 'x')['hint'] !== '', 'unknown object: check the IDs');
chk(meta_error_detail([], 'x')['message'] === 'Meta API error', 'no error body: a generic message');
$e = new MetaError($b);
chk($e->getMessage() === 'API access blocked.' && $e->d['code'] === 200, 'MetaError carries the detail');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
