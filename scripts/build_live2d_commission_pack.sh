#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR_INPUT="${1:-$ROOT/dist}"
mkdir -p "$OUT_DIR_INPUT"
OUT_DIR="$(cd "$OUT_DIR_INPUT" && pwd)"
PACKAGE_NAME="nodespark-synra-live2d-production-kit"
BUILD_DIR="$(mktemp -d)"
PACKAGE_DIR="$BUILD_DIR/$PACKAGE_NAME"

cleanup() {
  rm -rf "$BUILD_DIR"
}
trap cleanup EXIT

mkdir -p "$PACKAGE_DIR/reference"

copy_optional_reference() {
  local source="$1"
  local target="$2"
  if [[ -f "$source" ]]; then
    cp "$source" "$target"
    printf 'ok   reference/%s\n' "$(basename "$target")"
  else
    printf 'miss %s\n' "${source#$ROOT/}"
    missing_references+=("${source#$ROOT/}")
  fi
}

missing_references=()
copy_optional_reference "$ROOT/web/assets/synra-character.png" "$PACKAGE_DIR/reference/synra-character.png"
copy_optional_reference "$ROOT/web/assets/synra-dress-reference.png" "$PACKAGE_DIR/reference/synra-dress-reference.png"
copy_optional_reference "$ROOT/web/assets/synra-two-palms-wave-reference.png" "$PACKAGE_DIR/reference/synra-two-palms-wave-reference.png"
copy_optional_reference "$ROOT/web/assets/synra/sheets/expression-sheet.png" "$PACKAGE_DIR/reference/expression-sheet.png"
copy_optional_reference "$ROOT/web/assets/synra/sheets/rigging-poses-sheet.png" "$PACKAGE_DIR/reference/rigging-poses-sheet.png"
copy_optional_reference "$ROOT/live2d-production/references/current-vrm-fallback.jpg" "$PACKAGE_DIR/reference/current-vrm-fallback.jpg"

if [[ "${#missing_references[@]}" -gt 0 ]]; then
  {
    printf '# Reference Files Needed\n\n'
    printf 'The written production contract is complete, but these optional visual references were not present when the kit was built:\n\n'
    for reference in "${missing_references[@]}"; do
      printf -- '- `%s`\n' "$reference"
    done
    printf '\nAdd those files before sending the kit to an artist/rigger if you want the package to include the exact screenshots locally.\n'
  } > "$PACKAGE_DIR/reference/REFERENCE_FILES_NEEDED.md"
fi
cp "$ROOT/live2d-production/README.md" "$PACKAGE_DIR/README.md"
cp "$ROOT/live2d-production/BUILD_NOW.md" "$PACKAGE_DIR/BUILD_NOW.md"
cp "$ROOT/live2d-production/ART_BRIEF.md" "$PACKAGE_DIR/ART_BRIEF.md"
cp "$ROOT/live2d-production/REFERENCE_CARD.md" "$PACKAGE_DIR/REFERENCE_CARD.md"
cp "$ROOT/live2d-production/COMMISSION_HANDOFF.md" "$PACKAGE_DIR/COMMISSION_HANDOFF.md"
cp "$ROOT/live2d-production/HIRE_POST.md" "$PACKAGE_DIR/HIRE_POST.md"
cp "$ROOT/live2d-production/DELIVERY_STRUCTURE.md" "$PACKAGE_DIR/DELIVERY_STRUCTURE.md"
cp "$ROOT/live2d-production/ACCEPTANCE_CHECKLIST.md" "$PACKAGE_DIR/ACCEPTANCE_CHECKLIST.md"
cp "$ROOT/live2d-production/layer_manifest.json" "$PACKAGE_DIR/layer_manifest.json"
cp "$ROOT/live2d-production/rig_contract.json" "$PACKAGE_DIR/rig_contract.json"
cp "$ROOT/docs/LIVE2D_PIPELINE.md" "$PACKAGE_DIR/LIVE2D_PIPELINE.md"

cat > "$PACKAGE_DIR/VALIDATION_COMMANDS.md" <<'DOC'
# Validation Commands

After receiving the finished runtime export, install it into the app:

```bash
cp -R nodespark-synra-live2d-delivery/runtime/* synra/web/assets/live2d/synra/
cd synra
bash scripts/check_live2d_assets.sh
```

The model is accepted only when the validator passes and the browser monitor
loads the Live2D character instead of the fallback image.
DOC

(
  cd "$BUILD_DIR"
  rm -f "$OUT_DIR/$PACKAGE_NAME.zip"
  zip -qr "$OUT_DIR/$PACKAGE_NAME.zip" "$PACKAGE_NAME"
)

printf '%s\n' "$OUT_DIR/$PACKAGE_NAME.zip"
