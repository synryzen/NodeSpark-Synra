#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${SYNRA_BASE_URL:-http://127.0.0.1:5191}"

section() {
  printf '\n== %s ==\n' "$1"
}

run_or_note() {
  local label="$1"
  shift
  if command -v "$1" >/dev/null 2>&1; then
    "$@" || true
  else
    echo "$label unavailable"
  fi
}

section "Synra service"
systemctl --user is-active synra-standalone.service || true
systemctl --user --no-pager --lines=8 status synra-standalone.service || true

section "Synra health"
curl -fsS "$BASE_URL/api/health" || true
echo
curl -fsS "$BASE_URL/api/vision/public" || true
echo

section "Camera devices"
shopt -s nullglob
camera_nodes=(/dev/video* /dev/media*)
if [ "${#camera_nodes[@]}" -gt 0 ]; then
  ls -l "${camera_nodes[@]}"
else
  echo "No /dev/video* or /dev/media* devices found."
fi
shopt -u nullglob
find /sys/class/video4linux -maxdepth 2 -type f -name name -print -exec cat {} \; 2>/dev/null || true
run_or_note "v4l2-ctl" v4l2-ctl --list-devices

section "Audio devices"
run_or_note "pactl" pactl list short sources
run_or_note "arecord" arecord -l
run_or_note "aplay" aplay -l

section "Display session"
printf 'DISPLAY=%s\n' "${DISPLAY-}"
printf 'WAYLAND_DISPLAY=%s\n' "${WAYLAND_DISPLAY-}"
printf 'XDG_SESSION_TYPE=%s\n' "${XDG_SESSION_TYPE-}"
pgrep -af 'gnome-shell|Xorg|Xwayland|weston|wayfire|openbox|chromium|chrome' || true

section "GPU and thermals"
run_or_note "tegrastats" timeout 5 tegrastats

section "Memory"
free -h || true

section "Kiosk hints"
echo "For live kiosk camera/mic permission prompts:"
echo "  SYNRA_KIOSK_AUTO_GRANT_MEDIA=true ~/synra-standalone/scripts/start-jetson-kiosk.sh"
echo "For local Chrome inspection:"
echo "  SYNRA_KIOSK_REMOTE_DEBUG=true ~/synra-standalone/scripts/start-jetson-kiosk.sh"
