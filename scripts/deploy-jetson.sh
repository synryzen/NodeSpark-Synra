#!/usr/bin/env bash
set -euo pipefail

JETSON_HOST="${JETSON_HOST:-192.168.1.165}"
JETSON_USER="${JETSON_USER:-matthew}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE="/tmp/synra-standalone-dist.tgz"

cd "$ROOT_DIR"
npm run build
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$ARCHIVE" dist docs scripts package.json
scp "$ARCHIVE" "${JETSON_USER}@${JETSON_HOST}:/home/${JETSON_USER}/synra-standalone-dist.tgz"
ssh -tt "${JETSON_USER}@${JETSON_HOST}" 'set -euo pipefail
APP_DIR="$HOME/synra-standalone"
mkdir -p "$APP_DIR" "$HOME/.config/systemd/user" "$HOME/.config/autostart" "$HOME/.config/autostart.disabled"
BACKUP_DIR="$HOME/synra-backups"
mkdir -p "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/synra-jetson-state-$(date +%Y%m%d%H%M%S).tgz"
cd "$HOME"
backup_paths=()
for path in ".config/synra-standalone" ".config/synra-standalone.env" ".config/Electron" ".config/systemd/user/synra-standalone.service" ".config/systemd/user/synra-standalone-watchdog.service" ".config/systemd/user/synra-standalone-watchdog.timer" ".config/systemd/user/synra-electron-kiosk.service" ".config/autostart.disabled"; do
  if [ -e "$path" ]; then
    backup_paths+=("$path")
  fi
done
if [ "${#backup_paths[@]}" -gt 0 ]; then
  tar --ignore-failed-read -czf "$BACKUP" "${backup_paths[@]}"
  chmod 600 "$BACKUP"
  echo "Synra state backup: $BACKUP"
fi
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
tar -xzf "$HOME/synra-standalone-dist.tgz" -C "$APP_DIR"
find "$APP_DIR" -name "._*" -delete
find "$APP_DIR" -name ".DS_Store" -delete
chmod +x "$APP_DIR/scripts/"*.sh
for desktop_file in "$HOME/.config/autostart/synra-standalone-kiosk.desktop" "$HOME/.config/autostart/synra-kiosk.desktop"; do
  if [ -f "$desktop_file" ]; then
    mv "$desktop_file" "$HOME/.config/autostart.disabled/$(basename "$desktop_file").disabled.$(date +%Y%m%d%H%M%S)"
  fi
done
cat > "$HOME/.config/systemd/user/synra-standalone.service" <<SERVICE
[Unit]
Description=Synra Standalone Jetson Companion
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=-$HOME/.config/synra-standalone.env
ExecStart=/usr/bin/python3 $APP_DIR/scripts/synra_server.py
Restart=always
RestartSec=3
StartLimitIntervalSec=60
StartLimitBurst=10

[Install]
WantedBy=default.target
SERVICE
cat > "$HOME/.config/systemd/user/synra-standalone-watchdog.service" <<SERVICE
[Unit]
Description=Synra Standalone health watchdog

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
EnvironmentFile=-$HOME/.config/synra-standalone.env
ExecStart=$APP_DIR/scripts/synra-watchdog.sh
SERVICE
cat > "$HOME/.config/systemd/user/synra-standalone-watchdog.timer" <<SERVICE
[Unit]
Description=Run Synra Standalone health watchdog

[Timer]
OnBootSec=45
OnUnitActiveSec=60
AccuracySec=10
Unit=synra-standalone-watchdog.service

[Install]
WantedBy=timers.target
SERVICE
systemctl --user daemon-reload
systemctl --user enable synra-standalone.service
systemctl --user enable --now synra-standalone-watchdog.timer
systemctl --user restart synra-standalone.service
if systemctl --user --quiet is-enabled synra-electron-kiosk.service >/dev/null 2>&1; then
  systemctl --user restart synra-electron-kiosk.service
fi
rm -f "$HOME/synra-standalone-dist.tgz"
systemctl --user is-active synra-standalone.service
du -sh "$APP_DIR"
'
