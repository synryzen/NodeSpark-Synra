#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$ROOT/web/assets/vendor/live2d"

mkdir -p "$VENDOR_DIR"

download() {
  local url="$1"
  local output="$2"
  local tmp="$output.tmp"

  printf 'downloading %s\n' "$(basename "$output")"
  curl -fL --retry 3 --connect-timeout 20 "$url" -o "$tmp"
  mv "$tmp" "$output"
}

download \
  "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js" \
  "$VENDOR_DIR/live2dcubismcore.min.js"

download \
  "https://cdn.jsdelivr.net/npm/pixi.js@6.5.2/dist/browser/pixi.min.js" \
  "$VENDOR_DIR/pixi.min.js"

download \
  "https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/cubism4.min.js" \
  "$VENDOR_DIR/pixi-live2d-display.min.js"

printf '\nInstalled Live2D browser runtime files in:\n%s\n' "$VENDOR_DIR"
printf '\nRun this next:\ncd %q && bash scripts/check_live2d_assets.sh\n' "$ROOT"
