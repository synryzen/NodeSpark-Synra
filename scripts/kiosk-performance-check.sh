#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${SYNRA_BASE_URL:-http://127.0.0.1:5191}"
REMOTE_DEBUG_URL="${SYNRA_CHROME_DEBUG_URL:-http://127.0.0.1:9222/json/version}"
SAMPLES="${SYNRA_PERF_SAMPLES:-8}"

echo "== Synra endpoint =="
curl -fsS "$BASE_URL/api/health"
echo
curl -fsS "$BASE_URL/api/telemetry/public" || true
echo

echo "== Chromium process =="
pgrep -af 'chromium|chrome' || echo "Chromium is not currently running."

echo
echo "== Remote debug =="
if curl -fsS "$REMOTE_DEBUG_URL" >/tmp/synra-chrome-version.json 2>/dev/null; then
  cat /tmp/synra-chrome-version.json
  echo
else
  echo "Chrome remote debugging is not reachable. Start kiosk with SYNRA_KIOSK_REMOTE_DEBUG=true to expose local diagnostics."
fi

echo
echo "== Jetson load sample =="
if command -v tegrastats >/dev/null 2>&1; then
  timeout "$SAMPLES" tegrastats || true
else
  echo "tegrastats unavailable"
fi

echo
echo "== Memory =="
free -h || true
