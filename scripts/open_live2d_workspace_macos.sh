#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash "$ROOT/scripts/prepare_live2d_workspace.sh"

open "$ROOT/live2d-production/workspace"
open "$ROOT/live2d-production/BUILD_NOW.md"
open "/Applications/Live2D Cubism 5.3/Live2D Cubism Editor 5.3.app"
open "/Applications/Live2D Cubism 5.3/Live2D Cubism Viewer 5.3.app"
