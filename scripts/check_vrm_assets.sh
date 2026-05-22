#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VRM="$ROOT/web/assets/avatars/synra.vrm"

if [[ ! -f "$VRM" ]]; then
  printf 'missing: %s\n' "$VRM" >&2
  printf 'Export Synra as a VRM and copy it to web/assets/avatars/synra.vrm.\n' >&2
  exit 1
fi

size_bytes="$(wc -c < "$VRM" | tr -d ' ')"
printf 'found: %s\n' "$VRM"
printf 'size: %s bytes\n' "$size_bytes"

if [[ "$size_bytes" -gt 100000000 ]]; then
  printf 'warning: VRM is over 100 MB; compress textures for smoother Jetson playback.\n' >&2
fi

printf 'VRM asset slot is ready.\n'
