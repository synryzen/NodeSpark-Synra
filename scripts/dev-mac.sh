#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export SYNRA_HOST="${SYNRA_HOST:-0.0.0.0}"
export SYNRA_PORT="${SYNRA_PORT:-5191}"
export SYNRA_MODEL_ENDPOINT="${SYNRA_MODEL_ENDPOINT:-http://127.0.0.1:11434/v1/chat/completions}"
export SYNRA_MODEL_NAME="${SYNRA_MODEL_NAME:-llama3.2}"

npm run build
python3 scripts/synra_server.py
