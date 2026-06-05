#!/usr/bin/env bash
set -euo pipefail

STATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_SRC="$STATION_DIR/systemd/nodespark-synra-station.service.example"
SERVICE_DEST="/etc/systemd/system/nodespark-synra-station.service"

fail() {
  echo "install-systemd-service: error: $*" >&2
  exit 1
}

[ -f "$SERVICE_SRC" ] || fail "missing service example: $SERVICE_SRC"
command -v systemctl >/dev/null 2>&1 || fail "systemctl is required on the target Jetson"

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "This installer needs sudo/root to write $SERVICE_DEST."
  echo "Run:"
  echo "  sudo $0"
  exit 1
fi

install -m 0644 "$SERVICE_SRC" "$SERVICE_DEST"
systemctl daemon-reload
echo "Installed $SERVICE_DEST"
echo "No secrets were written. Put local environment values in /etc/nodespark-synra-station.env if needed."
echo "Enable with:"
echo "  sudo systemctl enable --now nodespark-synra-station.service"
