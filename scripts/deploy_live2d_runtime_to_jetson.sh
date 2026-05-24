#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JETSON_HOST="${JETSON_HOST:-192.168.1.165}"
JETSON_USER="${JETSON_USER:-matthew}"
JETSON_DIR="${JETSON_DIR:-/opt/nodespark-synra}"
MODEL_DIR="$ROOT/web/assets/live2d/synra"

if [[ ! -f "$MODEL_DIR/synra.model3.json" ]]; then
  printf 'Missing %s\n' "$MODEL_DIR/synra.model3.json" >&2
  printf 'Export from Cubism first, then run scripts/install_live2d_model_pack.sh.\n' >&2
  exit 1
fi

bash "$ROOT/scripts/check_live2d_assets.sh"

printf 'Copying Live2D runtime to %s@%s:%s/web/assets/live2d/synra/\n' "$JETSON_USER" "$JETSON_HOST" "$JETSON_DIR"
rsync -az --delete "$MODEL_DIR/" "$JETSON_USER@$JETSON_HOST:$JETSON_DIR/web/assets/live2d/synra/"
ssh "$JETSON_USER@$JETSON_HOST" "systemctl --user restart nodespark-synra.service && sleep 2 && systemctl --user is-active nodespark-synra.service && curl -fsS http://127.0.0.1:8788/api/live2d"
