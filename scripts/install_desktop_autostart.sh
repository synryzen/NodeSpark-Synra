#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/nodespark-synra"
AUTOSTART_DIR="${HOME}/.config/autostart"

mkdir -p "${AUTOSTART_DIR}"
cp "${APP_DIR}/desktop/nodespark-synra-kiosk.desktop" "${AUTOSTART_DIR}/nodespark-synra-kiosk.desktop"
chmod 644 "${AUTOSTART_DIR}/nodespark-synra-kiosk.desktop"

echo "Synra kiosk autostart installed for this desktop user."
echo "Log out and back in, or run: ${APP_DIR}/scripts/launch_kiosk.sh"
