#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_DIR="$ROOT/web/assets/live2d/synra"
VENDOR_DIR="$ROOT/web/assets/vendor/live2d"

missing=0

check_file() {
  local path="$1"
  if [[ -f "$path" ]]; then
    printf 'ok   %s\n' "${path#$ROOT/}"
  else
    printf 'miss %s\n' "${path#$ROOT/}"
    missing=1
  fi
}

check_file "$MODEL_DIR/synra.model3.json"
check_file "$VENDOR_DIR/live2dcubismcore.min.js"
check_file "$VENDOR_DIR/pixi.min.js"
check_file "$VENDOR_DIR/pixi-live2d-display.min.js"

if [[ -f "$MODEL_DIR/synra.model3.json" ]]; then
  printf '\nValidating Synra model contract...\n'
  if ! python3 "$ROOT/scripts/validate_live2d_pack.py" "$MODEL_DIR/synra.model3.json"; then
    missing=1
  fi
fi

if [[ "$missing" -eq 0 ]]; then
  printf '\nSynra Live2D assets are ready.\n'
else
  printf '\nSynra is still using the PNG fallback until these files exist.\n'
fi

exit "$missing"
