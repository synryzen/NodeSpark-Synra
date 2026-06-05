#!/usr/bin/env bash
set -euo pipefail

STATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${STATION_HOST:-127.0.0.1}"
PORT="${STATION_PORT:-4788}"
URL="http://${HOST}:${PORT}/"

fail() {
  echo "start-kiosk: error: $*" >&2
  exit 1
}

command -v npm >/dev/null 2>&1 || fail "npm is required"
command -v curl >/dev/null 2>&1 || fail "curl is required"

if [ ! -f "$STATION_DIR/dist/station-server.js" ]; then
  echo "Building Synra Jetson Station..."
  (cd "$STATION_DIR" && npm run build)
fi

echo "Starting Synra Jetson Station server at $URL"
(cd "$STATION_DIR" && npm start) &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -fsS "${URL}station/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

curl -fsS "${URL}station/health" >/dev/null 2>&1 || fail "station health endpoint did not become ready"

BROWSER="${CHROMIUM_BIN:-}"
if [ -z "$BROWSER" ]; then
  for candidate in chromium-browser chromium google-chrome google-chrome-stable; do
    if command -v "$candidate" >/dev/null 2>&1; then
      BROWSER="$(command -v "$candidate")"
      break
    fi
  done
fi

[ -n "$BROWSER" ] || fail "Chromium/Chrome not found. Set CHROMIUM_BIN=/path/to/chromium."

echo "Launching kiosk browser: $BROWSER"
"$BROWSER" \
  --kiosk "$URL" \
  --no-first-run \
  --disable-infobars \
  --autoplay-policy=no-user-gesture-required

wait "$SERVER_PID"
