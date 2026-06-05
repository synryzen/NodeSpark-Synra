#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${SYNRA_LOG_EXPORT_DIR:-$HOME/synra-logs}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$OUT_DIR/synra-standalone-$STAMP.log"

mkdir -p "$OUT_DIR"

{
  echo "Synra Standalone log export"
  echo "Created: $(date)"
  echo
  echo "== service status =="
  systemctl --user --no-pager status synra-standalone.service || true
  echo
  echo "== recent service logs =="
  journalctl --user -u synra-standalone.service --since "2 hours ago" --no-pager || true
  echo
  echo "== health =="
  curl -fsS "${SYNRA_URL:-http://127.0.0.1:5191}/api/health" || true
  echo
} > "$OUT_FILE"

echo "$OUT_FILE"
