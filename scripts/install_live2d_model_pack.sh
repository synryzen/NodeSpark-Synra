#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  printf 'Usage: %s /path/to/live2d-delivery.zip-or-folder\n' "$0" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_DIR="$ROOT/web/assets/live2d/synra"
INPUT="$1"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

find_model_root() {
  local base="$1"
  if [[ -f "$base/synra.model3.json" ]]; then
    printf '%s\n' "$base"
    return 0
  fi
  if [[ -f "$base/runtime/synra.model3.json" ]]; then
    printf '%s\n' "$base/runtime"
    return 0
  fi
  local found
  found="$(find "$base" -maxdepth 5 -type f -name 'synra.model3.json' | head -n 1 || true)"
  if [[ -n "$found" ]]; then
    dirname "$found"
    return 0
  fi
  return 1
}

if [[ -d "$INPUT" ]]; then
  SOURCE_ROOT="$(find_model_root "$INPUT")" || {
    printf 'Could not find synra.model3.json in %s\n' "$INPUT" >&2
    exit 1
  }
elif [[ -f "$INPUT" ]]; then
  unzip -q "$INPUT" -d "$WORK_DIR"
  SOURCE_ROOT="$(find_model_root "$WORK_DIR")" || {
    printf 'Could not find synra.model3.json inside %s\n' "$INPUT" >&2
    exit 1
  }
else
  printf 'Input does not exist: %s\n' "$INPUT" >&2
  exit 1
fi

mkdir -p "$MODEL_DIR"
find "$MODEL_DIR" -mindepth 1 -maxdepth 1 ! -name 'README.md' -exec rm -rf {} +
cp -R "$SOURCE_ROOT"/. "$MODEL_DIR"/

printf 'Installed Synra Live2D model pack into:\n%s\n\n' "$MODEL_DIR"
bash "$ROOT/scripts/check_live2d_assets.sh"
