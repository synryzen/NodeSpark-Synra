#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/nodespark-synra}"
VENV_DIR="${VENV_DIR:-$APP_DIR/.venv}"

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  echo "Synra virtualenv not found at $VENV_DIR" >&2
  exit 1
fi

"$VENV_DIR/bin/python" -m pip install --upgrade pip
"$VENV_DIR/bin/python" -m pip install --no-deps "qwen-tts==0.1.1"
"$VENV_DIR/bin/python" -m pip install --no-deps "torchaudio"
"$VENV_DIR/bin/python" -m pip install \
  "transformers==4.57.3" \
  "accelerate==1.12.0" \
  "librosa>=0.10.0" \
  "soundfile>=0.12.0" \
  "sox" \
  "onnxruntime" \
  "einops"

echo "Qwen CustomVoice dependencies installed."
echo "Set NODESPARK_SYNRA_TTS_PROVIDER=qwen and restart nodespark-synra."
