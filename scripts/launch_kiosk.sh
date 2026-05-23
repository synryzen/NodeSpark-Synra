#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://127.0.0.1:8788/?autoMedia=1}"
PROFILE_DIR="${SYNRA_CHROME_PROFILE:-$HOME/.cache/nodespark-synra/chromium-profile}"
mkdir -p "$PROFILE_DIR"

CHROME_FLAGS=(
  --kiosk
  --new-window
  --user-data-dir="$PROFILE_DIR"
  --no-first-run
  --no-default-browser-check
  --noerrdialogs
  --disable-infobars
  --ozone-platform=x11
  --enable-webgl
  --enable-unsafe-swiftshader
  --ignore-gpu-blocklist
  --autoplay-policy=no-user-gesture-required
  --use-fake-ui-for-media-stream
)

case "${SYNRA_CHROME_GPU_MODE:-auto}" in
hardware|auto)
  CHROME_FLAGS+=(
    --use-gl=egl
    --enable-gpu-rasterization
    --enable-zero-copy
  )
  ;;
software)
  CHROME_FLAGS+=(
    --use-angle=swiftshader
    --use-gl=angle
    --disable-gpu-compositing
  )
  ;;
esac

if command -v chromium-browser >/dev/null 2>&1; then
  exec chromium-browser "${CHROME_FLAGS[@]}" "$URL"
fi

if command -v chromium >/dev/null 2>&1; then
  exec chromium "${CHROME_FLAGS[@]}" "$URL"
fi

if command -v google-chrome >/dev/null 2>&1; then
  exec google-chrome "${CHROME_FLAGS[@]}" "$URL"
fi

echo "No Chromium/Chrome browser found. Open $URL manually."
