#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${SYNRA_REPO_URL:-https://github.com/synryzen/NodeSpark-Synra.git}"
BRANCH="${SYNRA_BRANCH:-main}"
SOURCE_DIR="${SYNRA_SOURCE_DIR:-$HOME/NodeSpark-Synra}"
APP_DIR="${SYNRA_APP_DIR:-$HOME/synra-standalone}"
STATION_DIR="${SYNRA_STATION_DIR:-$HOME/synra-jetson-station}"
INSTALL_ELECTRON="${SYNRA_INSTALL_ELECTRON:-true}"
ENV_FILE="${SYNRA_ENV_FILE:-$HOME/.config/synra-standalone.env}"

log() {
  printf '\n== %s ==\n' "$*"
}

fail() {
  echo "install-jetson: error: $*" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

ensure_node() {
  if command_exists node && command_exists npm; then
    local major
    major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
    if [ "$major" -ge 20 ]; then
      return 0
    fi
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    command_exists curl || fail "curl is required to install Node.js with nvm"
    log "Installing nvm for Node.js 20+"
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  fi

  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm use 20
}

ensure_source() {
  command_exists git || fail "git is required"
  if [ -d "$SOURCE_DIR/.git" ]; then
    log "Updating source at $SOURCE_DIR"
    git -C "$SOURCE_DIR" fetch origin "$BRANCH"
    git -C "$SOURCE_DIR" checkout "$BRANCH"
    git -C "$SOURCE_DIR" pull --ff-only origin "$BRANCH"
  else
    log "Cloning Synra"
    git clone --branch "$BRANCH" "$REPO_URL" "$SOURCE_DIR"
  fi
}

write_default_env() {
  mkdir -p "$(dirname "$ENV_FILE")"
  if [ -f "$ENV_FILE" ]; then
    log "Keeping existing config at $ENV_FILE"
    return 0
  fi

  log "Creating starter config at $ENV_FILE"
  cat > "$ENV_FILE" <<'ENV'
# Synra Standalone model bridge.
# Use any OpenAI-compatible /v1/chat/completions endpoint.
SYNRA_MODEL_ENDPOINT=
SYNRA_MODEL_NAME=
SYNRA_MODEL_LABEL=
SYNRA_MODEL_API_KEY=
SYNRA_MODEL_TIMEOUT_SECONDS=45

# Optional route-specific model names.
SYNRA_FAST_MODEL_NAME=
SYNRA_FAST_MODEL_LABEL=
SYNRA_VISION_MODEL_NAME=
SYNRA_VISION_MODEL_LABEL=
SYNRA_TOOL_MODEL_NAME=
SYNRA_NODESPARK_MODEL_NAME=

# Optional Home Assistant skill.
SYNRA_SMART_HOME_ENABLED=false
SYNRA_HOME_ASSISTANT_URL=
SYNRA_HOME_ASSISTANT_TOKEN=
SYNRA_HOME_ASSISTANT_DEFAULT_LIGHT=
SYNRA_TOOL_TIMEOUT_SECONDS=12

# Optional local camera diagnostics.
SYNRA_CAMERA_DEVICE=
ENV
  chmod 600 "$ENV_FILE"
}

install_standalone() {
  log "Building Synra Standalone"
  cd "$SOURCE_DIR"
  npm install
  npm run typecheck
  npm run build

  log "Installing app to $APP_DIR"
  rm -rf "$APP_DIR"
  mkdir -p "$APP_DIR"
  cp -R dist docs scripts package.json "$APP_DIR/"
  find "$APP_DIR" -name "._*" -delete
  find "$APP_DIR" -name ".DS_Store" -delete
  chmod +x "$APP_DIR/scripts/"*.sh
}

install_standalone_service() {
  log "Installing user service"
  mkdir -p "$HOME/.config/systemd/user" "$HOME/.config/autostart" "$HOME/.config/autostart.disabled"
  disable_legacy_kiosk_autostarts
  cat > "$HOME/.config/systemd/user/synra-standalone.service" <<SERVICE
[Unit]
Description=Synra Standalone Jetson Companion
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=-$ENV_FILE
ExecStart=/usr/bin/python3 $APP_DIR/scripts/synra_server.py
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
SERVICE

  systemctl --user daemon-reload
  systemctl --user enable synra-standalone.service
  systemctl --user restart synra-standalone.service
}

disable_legacy_kiosk_autostarts() {
  local desktop_file
  for desktop_file in "$HOME/.config/autostart/synra-standalone-kiosk.desktop" "$HOME/.config/autostart/synra-kiosk.desktop"; do
    if [ -f "$desktop_file" ]; then
      mv "$desktop_file" "$HOME/.config/autostart.disabled/$(basename "$desktop_file").disabled.$(date +%Y%m%d%H%M%S)"
    fi
  done
}

detect_display() {
  if [ -n "${DISPLAY:-}" ]; then
    printf '%s\n' "$DISPLAY"
  elif [ -S /tmp/.X11-unix/X0 ]; then
    printf ':0\n'
  elif [ -S /tmp/.X11-unix/X1 ]; then
    printf ':1\n'
  else
    printf ':0\n'
  fi
}

detect_xauthority() {
  if [ -n "${XAUTHORITY:-}" ] && [ -f "$XAUTHORITY" ]; then
    printf '%s\n' "$XAUTHORITY"
  elif [ -f "$XDG_RUNTIME_DIR/gdm/Xauthority" ]; then
    printf '%s\n' "$XDG_RUNTIME_DIR/gdm/Xauthority"
  elif [ -f "$HOME/.Xauthority" ]; then
    printf '%s\n' "$HOME/.Xauthority"
  else
    printf '%s\n' "$HOME/.Xauthority"
  fi
}

install_electron_station() {
  [ "$INSTALL_ELECTRON" = "true" ] || return 0
  [ -d "$SOURCE_DIR/tools/SynraJetsonStation" ] || fail "tools/SynraJetsonStation is missing from the source checkout"

  log "Installing Electron kiosk station"
  rm -rf "$STATION_DIR"
  mkdir -p "$STATION_DIR"
  cp -R "$SOURCE_DIR/tools/SynraJetsonStation/." "$STATION_DIR/"
  find "$STATION_DIR" -name "._*" -delete
  find "$STATION_DIR" -name ".DS_Store" -delete
  chmod +x "$STATION_DIR/scripts/"*.sh

  cd "$STATION_DIR"
  npm install
  "$STATION_DIR/scripts/repair-electron-install.sh"
  npm run typecheck
  npm run test:kiosk

  install_electron_service
}

install_electron_service() {
  local display_value xauthority_value runtime_dir
  display_value="$(detect_display)"
  runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  xauthority_value="$(XDG_RUNTIME_DIR="$runtime_dir" detect_xauthority)"

  cat > "$HOME/.config/systemd/user/synra-electron-kiosk.service" <<SERVICE
[Unit]
Description=Synra Electron Kiosk
After=synra-standalone.service graphical-session.target
Wants=synra-standalone.service

[Service]
Type=simple
WorkingDirectory=$STATION_DIR
Environment=DISPLAY=$display_value
Environment=XDG_RUNTIME_DIR=$runtime_dir
Environment=XAUTHORITY=$xauthority_value
Environment=SYNRA_STANDALONE_URL=http://127.0.0.1:${SYNRA_PORT:-5191}/
Environment=SYNRA_KIOSK_REMOTE_DEBUG=false
ExecStartPre=-/usr/bin/xset s off -dpms
ExecStart=$STATION_DIR/scripts/start-electron-kiosk.sh
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
SERVICE

  rm -f "$HOME/.config/autostart/synra-electron-kiosk.desktop"
  systemctl --user daemon-reload
  systemctl --user enable synra-electron-kiosk.service
  systemctl --user restart synra-electron-kiosk.service
}

print_summary() {
  log "Install complete"
  echo "App service:     systemctl --user status synra-standalone.service"
  echo "Local URL:        http://127.0.0.1:5191/"
  echo "LAN URL:          http://$(hostname -I 2>/dev/null | awk '{print $1}'):${SYNRA_PORT:-5191}/"
  echo "Config file:      $ENV_FILE"
  echo "App folder:       $APP_DIR"
  echo "Kiosk folder:     $STATION_DIR"
  echo "Electron launch:  $STATION_DIR/scripts/start-electron-kiosk.sh"
  echo "Diagnostics:      $STATION_DIR/scripts/electron-gpu-check.sh"
}

main() {
  ensure_node
  ensure_source
  write_default_env
  install_standalone
  install_standalone_service
  install_electron_station
  print_summary
}

main "$@"
