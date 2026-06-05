#!/usr/bin/env bash
set -euo pipefail

STATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck disable=SC1091
. "$STATION_DIR/scripts/node-tools.sh"
load_node_tools

cd "$STATION_DIR"

if [ -f node_modules/electron/path.txt ] && [ -x node_modules/electron/dist/electron ]; then
  exit 0
fi

echo "Repairing Electron binary extraction..."

ELECTRON_VERSION="$("$NODE_BIN" -e 'console.log(require("./node_modules/electron/package.json").version)')"
ZIP="$("$NODE_BIN" --input-type=module - <<NODE
import { downloadArtifact } from "@electron/get";
const p = await downloadArtifact({
  version: "$ELECTRON_VERSION",
  artifactName: "electron",
  platform: "linux",
  arch: "arm64",
  force: false
});
console.log(p);
NODE
)"

if ! command -v unzip >/dev/null 2>&1; then
  echo "unzip is required to repair Electron extraction on this Jetson." >&2
  exit 1
fi

rm -rf node_modules/electron/dist node_modules/electron/path.txt
mkdir -p node_modules/electron/dist
unzip -oq "$ZIP" -d node_modules/electron/dist
printf "electron" > node_modules/electron/path.txt
chmod +x node_modules/electron/dist/electron node_modules/electron/dist/chrome_crashpad_handler node_modules/electron/dist/chrome-sandbox 2>/dev/null || true

test -x node_modules/electron/dist/electron
