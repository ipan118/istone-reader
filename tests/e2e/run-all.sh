#!/usr/bin/env bash
# Runs the full end-to-end regression battery against a local static server.
#
# Prerequisites:
#   npm install playwright && npx playwright install chromium
#   (or set CHROMIUM_PATH to an existing Chromium binary)
#   Optional: npm install pdf-lib   # only to regenerate fixtures via gen-pdfs.cjs
#
# Usage: bash tests/e2e/run-all.sh
set -u
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
E2E="$ROOT/tests/e2e"
PORT_MAIN=4173
PORT_SUB=4180

cleanup() {
  [ -n "${PID_MAIN:-}" ] && kill "$PID_MAIN" 2>/dev/null
  [ -n "${PID_SUB:-}" ] && kill "$PID_SUB" 2>/dev/null
  [ -n "${SUB_DIR:-}" ] && rm -rf "$SUB_DIR"
}
trap cleanup EXIT

python3 -m http.server "$PORT_MAIN" --bind 127.0.0.1 -d "$ROOT" >/dev/null 2>&1 &
PID_MAIN=$!

# sw-verify exercises sub-path hosting (e.g. GitHub Pages project sites).
SUB_DIR="$(mktemp -d)"
mkdir -p "$SUB_DIR/sub"
ln -s "$ROOT" "$SUB_DIR/sub/reader"
python3 -m http.server "$PORT_SUB" --bind 127.0.0.1 -d "$SUB_DIR" >/dev/null 2>&1 &
PID_SUB=$!
sleep 1

FAILED=0
run() {
  echo "=== $* ==="
  if ! "$@"; then
    echo "!!! FAILED: $*"
    FAILED=1
  fi
}

run node "$ROOT/smoke-test.cjs"
run node "$E2E/mini-player-verify.cjs"
run node "$E2E/neural-voice-verify.cjs"
run node "$E2E/anchor-verify.cjs"
run node "$E2E/desktop-mode-verify.cjs"
run node "$E2E/storage-verify.cjs"
run node "$E2E/fix-verify.cjs"
BOUNDARY=off run node "$E2E/fix-verify.cjs"
run node "$E2E/import-progress-verify.cjs"
run node "$E2E/ux-verify.cjs"
run node "$E2E/progressive-verify.cjs"
TARGET_URL="http://127.0.0.1:$PORT_SUB/sub/reader/" run node "$E2E/sw-verify.cjs"

if [ "$FAILED" -ne 0 ]; then
  echo "E2E: FAILURES DETECTED"
  exit 1
fi
echo "E2E: ALL PASSED"
