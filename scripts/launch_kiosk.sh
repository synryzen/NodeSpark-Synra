#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://127.0.0.1:8788/?autoMedia=1}"
CHROME_FLAGS=(
  --kiosk
  --noerrdialogs
  --disable-infobars
  --ozone-platform=x11
  --autoplay-policy=no-user-gesture-required
  --use-fake-ui-for-media-stream
)

case "${SYNRA_CHROME_GPU_MODE:-software}" in
hardware|auto)
  CHROME_FLAGS+=(
    --ignore-gpu-blocklist
    --enable-gpu-rasterization
    --enable-zero-copy
  )
  ;;
software)
  CHROME_FLAGS+=(
    --disable-software-rasterizer=false
    --enable-unsafe-swiftshader
    --ignore-gpu-blocklist
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
