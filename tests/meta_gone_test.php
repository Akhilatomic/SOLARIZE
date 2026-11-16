<?php
// The Meta sync skips a lead somebody deleted (api/meta.php meta_ingest + meta_gone). Run inside a copy of the CRM that has a database:
// php tests/meta_gone_test.php   (tests/run_api.sh runs it in its throw-away copy)
$_SESSION = ['uid' => 1, 'role' => 'admin', 'name' => 'Test', 'username' => 'test'];
foreach (['security', 'lib', 'core', 'ops', 'meta', 'claims', 'trash'] as $f) require_once __DIR__ . "/../api/$f.php";
date_default_timezone_set('Asia/Kolkata');
$pass = 0; $fail = 0;
function chk($ok, $label) { global $pass, $fail; if ($ok) { $pass++; echo "  ok   $label\n"; } else { $fail++; echo "  FAIL $label\n"; } }
echo "Meta sync: a deleted lead does not come back\n";
$L = fn($id, $ph) => ['id' => $id, 'created_time' => gmdate('c'), 'field_data' => [['name' => 'full_name', 'values' => ['Gone Test ' . $id]], ['name' => 'phone_number', 'values' => [$ph]]]];
$n = fn($id) => (int)row('SELECT COUNT(*) c FROM leads WHERE meta_id=?', [$id])['c'];
chk(meta_ingest($L('MGT-1', '9000000441'), ['name' => 'Form']) === 1 && $n('MGT-1') === 1, 'a new Meta lead comes in');
chk(meta_ingest($L('MGT-1', '9000000441'), ['name' => 'Form']) === 0 && $n('MGT-1') === 1, 'the same lead is not added twice');
$id = (int)row('SELECT id FROM leads WHERE meta_id=?', ['MGT-1'])['id'];
trash_put('Lead', 'Gone Test', [['leads', 'id=?', [$id]]]); q('DELETE FROM leads WHERE id=?', [$id]);
chk($n('MGT-1') === 0 && (bool)row("SELECT 1 FROM meta_gone WHERE meta_id='MGT-1'"), 'deleted: its Meta id is remembered');
chk(meta_ingest($L('MGT-1', '9000000441'), ['name' => 'Form']) === 0 && $n('MGT-1') === 0, 'the next sync does not bring the deleted lead back');
q('DELETE FROM trash'); /* the Recycle bin has emptied */
chk(meta_ingest($L('MGT-1', '9000000441'), ['name' => 'Form']) === 0 && $n('MGT-1') === 0, 'nor after the Recycle bin has emptied');
chk(meta_ingest($L('MGT-2', '9000000442'), ['name' => 'Form']) === 1, 'other new leads still come in');
echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
