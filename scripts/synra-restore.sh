#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Usage: $0 /path/to/synra-jetson-state-YYYYMMDDHHMMSS.tgz" >&2
  exit 2
fi

tar -xzf "$ARCHIVE" -C "$HOME"

if [ -f "$HOME/.config/synra-standalone/secrets.json" ]; then
  chmod 600 "$HOME/.config/synra-standalone/secrets.json"
fi
if [ -f "$HOME/.config/synra-standalone.env" ]; then
  chmod 600 "$HOME/.config/synra-standalone.env"
fi

systemctl --user daemon-reload || true
if systemctl --user list-unit-files synra-standalone.service >/dev/null 2>&1; then
  systemctl --user restart synra-standalone.service || true
fi
if systemctl --user list-unit-files synra-electron-kiosk.service >/dev/null 2>&1; then
  systemctl --user restart synra-electron-kiosk.service || true
fi

echo "Restored Synra state from $ARCHIVE"
