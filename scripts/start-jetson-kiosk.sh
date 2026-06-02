#!/usr/bin/env bash
set -euo pipefail

KIOSK_FPS="${SYNRA_KIOSK_FPS:-15}"
KIOSK_QUALITY="${SYNRA_KIOSK_QUALITY:-low}"
KIOSK_RENDER_SCALE="${SYNRA_KIOSK_RENDER_SCALE:-0.62}"
URL="${SYNRA_STANDALONE_URL:-http://127.0.0.1:5191/?profile=jetson&mode=kiosk&fps=${KIOSK_FPS}&live=1&quality=${KIOSK_QUALITY}&scale=${KIOSK_RENDER_SCALE}}"
CHROMIUM_BIN="${CHROMIUM_BIN:-}"
ANGLE_BACKEND="${SYNRA_KIOSK_ANGLE_BACKEND:-vulkan}"
EXTRA_CHROMIUM_FLAGS=()

if [ "${SYNRA_KIOSK_AUTO_GRANT_MEDIA:-false}" = "true" ]; then
  EXTRA_CHROMIUM_FLAGS+=(--use-fake-ui-for-media-stream)
fi

if [ "${SYNRA_KIOSK_REMOTE_DEBUG:-false}" = "true" ]; then
  EXTRA_CHROMIUM_FLAGS+=(--remote-debugging-address=127.0.0.1 --remote-debugging-port="${SYNRA_KIOSK_DEBUG_PORT:-9222}")
fi

if [ -n "${SYNRA_KIOSK_GL_MODE:-}" ]; then
  EXTRA_CHROMIUM_FLAGS+=(--use-gl="${SYNRA_KIOSK_GL_MODE}")
fi

if [ -n "${ANGLE_BACKEND}" ] && [ "${ANGLE_BACKEND}" != "none" ]; then
  EXTRA_CHROMIUM_FLAGS+=(--use-angle="${ANGLE_BACKEND}")
  if [ "${ANGLE_BACKEND}" = "vulkan" ]; then
    EXTRA_CHROMIUM_FLAGS+=(
      --enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE
      --disable-gpu-driver-bug-workarounds
      --enable-webgl
      --enable-webgl2
    )
  fi
fi

if [ -n "${SYNRA_KIOSK_OZONE_PLATFORM:-}" ]; then
  EXTRA_CHROMIUM_FLAGS+=(--ozone-platform="${SYNRA_KIOSK_OZONE_PLATFORM}")
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
