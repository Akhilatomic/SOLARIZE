#!/bin/bash
# Runs the API tests against a throw-away copy of the working tree with an empty data folder.
# Usage: bash tests/run_api.sh   (set PHP=/path/to/php if php is not on PATH)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHP="${PHP:-php}"
if ! command -v "$PHP" >/dev/null 2>&1; then
  PHP="/c/Users/gotjo/AppData/Local/Microsoft/WinGet/Packages/PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe/php.exe"
fi
PORT="${PORT:-8094}"
TMP="$(mktemp -d)"
PID=""
trap '[ -n "$PID" ] && kill $PID 2>/dev/null; rm -rf "$TMP"' EXIT
tar -C "$ROOT" --exclude=.git --exclude=data --exclude='*.zip' --exclude=.superpowers --exclude=.claude --exclude=tools/out -cf - . | tar -C "$TMP" -xf -
"$PHP" -d upload_max_filesize=64M -d post_max_size=80M -S "localhost:$PORT" -t "$TMP" >/dev/null 2>&1 & # room to upload a backup of the test database
PID=$!
for i in $(seq 1 50); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 0.2; done
RC=0
"$PHP" "$TMP/tests/qm_api_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
"$PHP" "$TMP/tests/kseb_api_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
"$PHP" "$TMP/tests/meta_err_test.php" || RC=1
"$PHP" "$TMP/tests/comm_api_test.php" "http://localhost:$PORT" || RC=1
"$PHP" "$TMP/tests/ba_whatsapp_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
"$PHP" "$TMP/tests/milestone_api_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
"$PHP" "$TMP/tests/profile_pages_api_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
"$PHP" "$TMP/tests/folder_api_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
"$PHP" "$TMP/tests/import_api_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
"$PHP" "$TMP/tests/acc_api_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
"$PHP" "$TMP/tests/lead_autolost_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
"$PHP" "$TMP/tests/fee_sync_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
"$PHP" "$TMP/tests/dash_fees_test.php" "http://localhost:$PORT" || RC=1
"$PHP" "$TMP/tests/company_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
"$PHP" "$TMP/tests/doc_keep_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
"$PHP" "$TMP/tests/upload_scan_test.php" "http://localhost:$PORT" || RC=1
"$PHP" "$TMP/tests/onboard_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
"$PHP" "$TMP/tests/control_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
"$PHP" "$TMP/tests/backup_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
"$PHP" "$TMP/tests/track_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
exit $RC
