#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSETS="$ROOT/web/assets/synra"
OUT="$ASSETS/frame-animations"
SIPS="${SIPS:-/usr/bin/sips}"
CANVAS="${SYNRA_FRAME_CANVAS:-768}"
MAX_IMAGE="${SYNRA_FRAME_MAX_IMAGE:-720}"

if [[ ! -x "$SIPS" ]]; then
  printf 'sips is required to normalize Synra frame sequences.\n' >&2
  exit 1
fi

mkdir -p "$OUT"

normalize_sequence() {
  local name="$1"
  local source_dir="$2"
  local fps="${3:-18}"
  local loop="${4:-true}"
  local target="$OUT/$name"
  local work
  work="$(mktemp -d)"
  rm -rf "$target"
  mkdir -p "$target"

  local index=0
  local source
  while IFS= read -r source; do
    local resized="$work/resized-$(printf '%03d' "$index").png"
    local padded="$work/padded-$(printf '%03d' "$index").png"
    local output="$target/frame-$(printf '%03d' "$index").png"
    "$SIPS" --resampleHeightWidthMax "$MAX_IMAGE" "$source" --out "$resized" >/dev/null
    "$SIPS" --padToHeightWidth "$CANVAS" "$CANVAS" "$resized" --out "$padded" >/dev/null
    mv -f "$padded" "$output"
    index=$((index + 1))
  done < <(find "$source_dir" -maxdepth 1 -type f -name 'cel-*.png' | sort)

  rm -rf "$work"
  printf '%s %s %s %s\n' "$name" "$index" "$fps" "$loop" >> "$OUT/.manifest-rows"
}

rm -f "$OUT/.manifest-rows"

normalize_sequence idle "$ASSETS/cels/transitions" 16 true
normalize_sequence listening "$ASSETS/cels/reactions" 18 true
normalize_sequence thinking "$ASSETS/cels/transitions" 16 true
normalize_sequence speaking "$ASSETS/cels/facial" 20 true
normalize_sequence success "$ASSETS/cels/reactions" 18 false
normalize_sequence concerned "$ASSETS/cels/reactions" 16 true
normalize_sequence approval "$ASSETS/cels/reactions" 16 true
normalize_sequence okay "$ASSETS/cels/reactions" 18 false
normalize_sequence on-it "$ASSETS/cels/transitions" 18 false
normalize_sequence confused "$ASSETS/cels/reactions" 16 true
normalize_sequence misunderstood "$ASSETS/cels/reactions" 16 true
normalize_sequence workflow-running "$ASSETS/cels/transitions" 18 true
normalize_sequence waiting "$ASSETS/cels/transitions" 14 true
normalize_sequence greeting "$ASSETS/cels/reactions" 18 false
normalize_sequence reading "$ASSETS/cels/transitions" 16 true
normalize_sequence alert "$ASSETS/cels/reactions" 18 false

{
  printf '{\n'
  printf '  "frameSize": [%s, %s],\n' "$CANVAS" "$CANVAS"
  printf '  "defaultFps": 18,\n'
  printf '  "animations": {\n'
  first=true
  while read -r name count fps loop; do
    if [[ "$first" == true ]]; then
      first=false
    else
      printf ',\n'
    fi
    printf '    "%s": {"path": "/assets/synra/frame-animations/%s/frame-", "extension": ".png", "count": %s, "fps": %s, "loop": %s}' \
      "$name" "$name" "$count" "$fps" "$loop"
  done < "$OUT/.manifest-rows"
  printf '\n'
  printf '  }\n'
  printf '}\n'
} > "$OUT/manifest.json"

rm -f "$OUT/.manifest-rows"
printf 'Built Synra frame sequences in %s\n' "$OUT"
