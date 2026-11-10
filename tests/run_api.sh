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
"$PHP" -S "localhost:$PORT" -t "$TMP" >/dev/null 2>&1 &
PID=$!
for i in $(seq 1 50); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 0.2; done
RC=0
"$PHP" "$TMP/tests/qm_api_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
"$PHP" "$TMP/tests/kseb_api_test.php" "http://localhost:$PORT" "$(cygpath -m "$TMP" 2>/dev/null || echo "$TMP")/data/crm.sqlite" || RC=1
exit $RC
