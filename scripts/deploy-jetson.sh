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
mkdir -p "$APP_DIR" "$HOME/.config/systemd/user" "$HOME/.config/autostart"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
tar -xzf "$HOME/synra-standalone-dist.tgz" -C "$APP_DIR"
find "$APP_DIR" -name "._*" -delete
find "$APP_DIR" -name ".DS_Store" -delete
chmod +x "$APP_DIR/scripts/start-jetson-kiosk.sh"
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

[Install]
WantedBy=default.target
SERVICE
cat > "$HOME/.config/autostart/synra-standalone-kiosk.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Synra Standalone Kiosk
Exec=$APP_DIR/scripts/start-jetson-kiosk.sh
X-GNOME-Autostart-enabled=true
DESKTOP
systemctl --user daemon-reload
systemctl --user enable synra-standalone.service
systemctl --user restart synra-standalone.service
rm -f "$HOME/synra-standalone-dist.tgz"
systemctl --user is-active synra-standalone.service
du -sh "$APP_DIR"
'
