#!/usr/bin/env bash
set -euo pipefail

VENV="${1:-/opt/nodespark-synra/.venv}"

if [[ ! -x "$VENV/bin/python" ]]; then
  echo "Synra virtualenv not found at $VENV" >&2
  exit 1
fi

"$VENV/bin/python" -m pip install --upgrade pip
"$VENV/bin/python" -m pip install kokoro soundfile numpy torch
"$VENV/bin/python" - <<'PY'
from kokoro import KPipeline

pipeline = KPipeline(lang_code="a")
for _gs, _ps, _audio in pipeline("Synra natural voice is ready.", voice="af_heart"):
    break
print("Kokoro TTS is installed and warmed.")
PY
