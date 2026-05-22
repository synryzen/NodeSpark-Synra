#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$ROOT/web/assets/live2d/smoke-test"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

if ! command -v git >/dev/null 2>&1; then
  printf 'git is required to download the Live2D smoke-test model.\n' >&2
  exit 1
fi

mkdir -p "$TARGET"

git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/Live2D/CubismWebSamples.git \
  "$WORK_DIR/CubismWebSamples" >/dev/null

(
  cd "$WORK_DIR/CubismWebSamples"
  git sparse-checkout set Samples/Resources/Mao >/dev/null
)

rm -rf "$TARGET/Mao"
cp -R "$WORK_DIR/CubismWebSamples/Samples/Resources/Mao" "$TARGET/Mao"

printf 'Installed smoke-test model:\n%s\n' "$TARGET/Mao/Mao.model3.json"
printf '\nOpen this page and click "Sample":\n/live2d-test.html\n'
