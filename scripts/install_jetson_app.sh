#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/nodespark-synra"
CONFIG_DIR="/etc/nodespark-synra"
SERVICE_DIR="${HOME}/.config/systemd/user"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Installing NodeSpark Synra as an app on the existing Jetson OS..."

sudo mkdir -p "${APP_DIR}" "${CONFIG_DIR}"
sudo rsync -a --delete \
  --exclude ".venv" \
  --exclude "__pycache__" \
  --exclude "*.pyc" \
  "${REPO_DIR}/" "${APP_DIR}/"
sudo chown -R "${USER}:${USER}" "${APP_DIR}"

if [ ! -f "${CONFIG_DIR}/config.toml" ]; then
  sudo cp "${APP_DIR}/config.example.toml" "${CONFIG_DIR}/config.toml"
  sudo chown "${USER}:${USER}" "${CONFIG_DIR}/config.toml"
  echo "Created ${CONFIG_DIR}/config.toml. Edit hub.base_url before pairing."
fi

python3 -m venv "${APP_DIR}/.venv"
"${APP_DIR}/.venv/bin/pip" install --upgrade pip
"${APP_DIR}/.venv/bin/pip" install -e "${APP_DIR}"

mkdir -p "${SERVICE_DIR}"
cp "${APP_DIR}/systemd/nodespark-synra.service" "${SERVICE_DIR}/nodespark-synra.service"
systemctl --user daemon-reload
systemctl --user enable --now nodespark-synra.service

echo "Synra daemon installed."
echo "Open http://127.0.0.1:8788 or run scripts/install_desktop_autostart.sh for kiosk launch on login."
