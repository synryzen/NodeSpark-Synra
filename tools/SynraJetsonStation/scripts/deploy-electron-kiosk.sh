#!/usr/bin/env bash
set -euo pipefail

JETSON_HOST="${JETSON_HOST:-192.168.1.165}"
JETSON_USER="${JETSON_USER:-matthew}"
REMOTE_DIR="${REMOTE_DIR:-/home/${JETSON_USER}/synra-jetson-station}"
STATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE="/tmp/synra-jetson-station-electron.tgz"

cd "$STATION_DIR"
npm run build

COPYFILE_DISABLE=1 tar --no-xattrs \
  --exclude node_modules \
  --exclude '.env' \
  --exclude '._*' \
  --exclude '.DS_Store' \
  -czf "$ARCHIVE" \
  package.json package-lock.json tsconfig.json README.md .env.example src dist scripts systemd docs tests

scp "$ARCHIVE" "${JETSON_USER}@${JETSON_HOST}:/tmp/synra-jetson-station-electron.tgz"

ssh -tt "${JETSON_USER}@${JETSON_HOST}" "set -euo pipefail
rm -rf '$REMOTE_DIR'
mkdir -p '$REMOTE_DIR'
tar -xzf /tmp/synra-jetson-station-electron.tgz -C '$REMOTE_DIR'
find '$REMOTE_DIR' -name '._*' -delete
find '$REMOTE_DIR' -name '.DS_Store' -delete
chmod +x '$REMOTE_DIR/scripts/'*.sh
cd '$REMOTE_DIR'
. '$REMOTE_DIR/scripts/node-tools.sh'
load_node_tools
\"\$NPM_BIN\" install
'$REMOTE_DIR/scripts/repair-electron-install.sh'
\"\$NPM_BIN\" run build
\"\$NPM_BIN\" run test:kiosk
rm -f /tmp/synra-jetson-station-electron.tgz
echo 'Synra Electron kiosk installed at $REMOTE_DIR'
echo 'Launch with: $REMOTE_DIR/scripts/start-electron-kiosk.sh'
echo 'GPU check:   $REMOTE_DIR/scripts/electron-gpu-check.sh'
"

rm -f "$ARCHIVE"
