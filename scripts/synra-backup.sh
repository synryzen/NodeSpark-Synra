#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${SYNRA_BACKUP_DIR:-$HOME/synra-backups}"
STAMP="$(date +%Y%m%d%H%M%S)"
OUT="$BACKUP_DIR/synra-jetson-state-$STAMP.tgz"

mkdir -p "$BACKUP_DIR"
cd "$HOME"

paths=()
for path in \
  ".config/synra-standalone" \
  ".config/synra-standalone.env" \
  ".config/Electron" \
  ".config/systemd/user/synra-standalone.service" \
  ".config/systemd/user/synra-standalone-watchdog.service" \
  ".config/systemd/user/synra-standalone-watchdog.timer" \
  ".config/systemd/user/synra-electron-kiosk.service" \
  ".config/autostart.disabled"; do
  if [ -e "$path" ]; then
    paths+=("$path")
  fi
done

if [ "${#paths[@]}" -eq 0 ]; then
  echo "No Synra state paths found to back up."
  exit 0
fi

tar --ignore-failed-read -czf "$OUT" "${paths[@]}"
chmod 600 "$OUT"
echo "$OUT"
