#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="$ROOT/live2d-production/workspace"
RUNTIME_SLOT="$ROOT/web/assets/live2d/synra"

mkdir -p \
  "$WORKSPACE/source" \
  "$WORKSPACE/project" \
  "$WORKSPACE/runtime" \
  "$WORKSPACE/preview" \
  "$ROOT/live2d-production/references" \
  "$RUNTIME_SLOT"

printf 'Synra Live2D workspace is ready:\n%s\n\n' "$WORKSPACE"
printf 'Build notes:\n%s\n\n' "$ROOT/live2d-production/BUILD_NOW.md"
printf 'Runtime slot:\n%s\n' "$RUNTIME_SLOT"
