#!/usr/bin/env bash
set -euo pipefail

SYNRA_URL="${SYNRA_URL:-http://127.0.0.1:5191}"

echo "Synra service:"
systemctl --user --no-pager status synra-standalone.service || true

echo
echo "Synra health:"
curl -fsS "$SYNRA_URL/api/health"
echo

echo
echo "Synra public telemetry:"
curl -fsS "$SYNRA_URL/api/telemetry/public" || true
echo
