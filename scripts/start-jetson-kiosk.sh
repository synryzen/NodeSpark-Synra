#!/usr/bin/env bash
set -euo pipefail

KIOSK_FPS="${SYNRA_KIOSK_FPS:-24}"
URL="${SYNRA_STANDALONE_URL:-http://127.0.0.1:5191/?profile=jetson&mode=kiosk&fps=${KIOSK_FPS}&live=1}"
CHROMIUM_BIN="${CHROMIUM_BIN:-}"
EXTRA_CHROMIUM_FLAGS=()

if [ "${SYNRA_KIOSK_AUTO_GRANT_MEDIA:-false}" = "true" ]; then
  EXTRA_CHROMIUM_FLAGS+=(--use-fake-ui-for-media-stream)
fi

if [ -z "$CHROMIUM_BIN" ]; then
  for candidate in chromium-browser chromium google-chrome /snap/bin/chromium; do
    if command -v "$candidate" >/dev/null 2>&1; then
      CHROMIUM_BIN="$(command -v "$candidate")"
      break
    fi
  done
fi

if [ -z "$CHROMIUM_BIN" ]; then
  echo "start-jetson-kiosk: Chromium/Chrome was not found." >&2
  exit 1
fi

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:5191/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

curl -fsS "http://127.0.0.1:5191/api/health" >/dev/null 2>&1 || {
  echo "start-jetson-kiosk: Synra Standalone server is not reachable." >&2
  exit 1
}

exec "$CHROMIUM_BIN" \
  --kiosk "$URL" \
  --app="$URL" \
  --no-first-run \
  --noerrdialogs \
  --hide-scrollbars \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-extensions \
  --disable-translate \
  --disable-features=TranslateUI,MediaRouter \
  --disable-background-networking \
  --disable-renderer-backgrounding \
  --disable-background-timer-throttling \
  --enable-gpu-rasterization \
  --ignore-gpu-blocklist \
  --force-device-scale-factor=1 \
  --autoplay-policy=no-user-gesture-required \
  "${EXTRA_CHROMIUM_FLAGS[@]}"
