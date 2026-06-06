#!/usr/bin/env bash
set -euo pipefail

STATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYNRA_URL="${SYNRA_STANDALONE_URL:-http://127.0.0.1:5191/}"
SYNRA_HEALTH_URL="${SYNRA_KIOSK_HEALTH_URL:-${SYNRA_URL%/}/api/health}"

fail() {
  echo "start-electron-kiosk: error: $*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl is required"

export TMPDIR="${SYNRA_KIOSK_TMPDIR:-/tmp/synra-jetson-kiosk-${USER:-user}}"
mkdir -p "$TMPDIR"
chmod 1777 "$TMPDIR"

# shellcheck disable=SC1091
. "$STATION_DIR/scripts/node-tools.sh"
load_node_tools || fail "Node.js/npm could not be found"

if [ ! -d "$STATION_DIR/node_modules/electron" ]; then
  echo "Installing Electron kiosk dependencies..."
  (cd "$STATION_DIR" && "$NPM_BIN" install)
fi

"$STATION_DIR/scripts/repair-electron-install.sh"

if [ ! -f "$STATION_DIR/dist/kiosk-shell.js" ]; then
  echo "Building Synra Jetson Station kiosk shell..."
  (cd "$STATION_DIR" && "$NPM_BIN" run build)
fi

echo "Waiting for Synra app at $SYNRA_HEALTH_URL"
for _ in $(seq 1 60); do
  if curl -fsS "$SYNRA_HEALTH_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

curl -fsS "$SYNRA_HEALTH_URL" >/dev/null 2>&1 || fail "Synra Standalone health endpoint is not reachable"

export SYNRA_STANDALONE_URL="$SYNRA_URL"
export SYNRA_KIOSK_REMOTE_DEBUG="${SYNRA_KIOSK_REMOTE_DEBUG:-false}"
export SYNRA_KIOSK_AUTO_GRANT_MEDIA="${SYNRA_KIOSK_AUTO_GRANT_MEDIA:-true}"
if [ -n "${SYNRA_KIOSK_WINDOW_MODE:-}" ]; then
  export SYNRA_KIOSK_WINDOW_MODE
fi
export SYNRA_KIOSK_ANGLE_BACKEND="${SYNRA_KIOSK_ANGLE_BACKEND:-vulkan}"
export SYNRA_KIOSK_GL_MODE="${SYNRA_KIOSK_GL_MODE:-none}"

echo "Launching Synra Electron kiosk outside snap confinement..."
exec "$NPM_BIN" --prefix "$STATION_DIR" run kiosk:electron
