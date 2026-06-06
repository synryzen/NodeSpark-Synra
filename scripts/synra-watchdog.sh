#!/usr/bin/env bash
set -euo pipefail

PORT="${SYNRA_PORT:-5191}"
HEALTH_URL="${SYNRA_WATCHDOG_URL:-http://127.0.0.1:${PORT}/api/kiosk/health}"

if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null; then
  exit 0
fi

systemctl --user restart synra-standalone.service
