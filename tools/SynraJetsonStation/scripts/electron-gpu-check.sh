#!/usr/bin/env bash
set -euo pipefail

STATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck disable=SC1091
. "$STATION_DIR/scripts/node-tools.sh"
load_node_tools

if [ ! -f "$STATION_DIR/dist/kiosk-diagnostics.js" ]; then
  (cd "$STATION_DIR" && "$NPM_BIN" run build)
fi

export SYNRA_KIOSK_REMOTE_DEBUG="${SYNRA_KIOSK_REMOTE_DEBUG:-true}"
"$NODE_BIN" "$STATION_DIR/dist/kiosk-diagnostics.js"
