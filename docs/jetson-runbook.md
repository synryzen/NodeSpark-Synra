# Synra Standalone Jetson Runbook

## Current Install

The first standalone build is installed on the Jetson at:

```text
/home/matthew/synra-standalone
```

It is served by the user service:

```text
synra-standalone.service
```

Network URL:

```text
http://192.168.1.165:5191/
```

## Quick Install

Fresh Jetson install or update:

```bash
curl -fsSL https://raw.githubusercontent.com/synryzen/NodeSpark-Synra/main/scripts/install-jetson.sh | bash
```

The installer keeps an existing:

```text
~/.config/synra-standalone.env
```

It installs:

```text
~/synra-standalone
~/synra-jetson-station
```

## Service Commands

```bash
systemctl --user status synra-standalone.service
systemctl --user restart synra-standalone.service
systemctl --user stop synra-standalone.service
systemctl --user disable synra-standalone.service
```

## Model Configuration

Synra Standalone now uses a tiny same-origin API server. The browser calls `/api/chat`, and the Jetson server forwards to an OpenAI-compatible endpoint.

Create or edit:

```text
~/.config/synra-standalone.env
```

Example local Ollama/OpenAI-compatible setup:

```bash
SYNRA_MODEL_ENDPOINT=http://127.0.0.1:11434/v1/chat/completions
SYNRA_MODEL_NAME=qwen2.5:1.5b
SYNRA_MODEL_LABEL=qwen2.5:1.5b
SYNRA_MODEL_API_KEY=
SYNRA_MODEL_TIMEOUT_SECONDS=45
```

Optional route-specific models:

```bash
SYNRA_FAST_MODEL_NAME=qwen2.5:1.5b
SYNRA_FAST_MODEL_LABEL=qwen2.5:1.5b
SYNRA_VISION_MODEL_NAME=qwen2.5vl:3b
SYNRA_VISION_MODEL_LABEL=qwen2.5vl:3b
SYNRA_TOOL_MODEL_NAME=qwen2.5:1.5b
SYNRA_NODESPARK_MODEL_NAME=qwen2.5:1.5b
```

Synra's direct commands bypass the model for speed. General conversation, future vision requests, smart-home/tool explanations, and future NodeSpark skill requests now have distinct routing labels so per-route models can be swapped without changing the app.

## Smart Home Configuration

Synra has a safe smart-home bridge for Home Assistant lights. It can be configured in the app under Settings > Home Assistant, or configured on the Jetson with environment variables:

```text
~/.config/synra-standalone.env
```

Example:

```bash
SYNRA_SMART_HOME_ENABLED=true
SYNRA_HOME_ASSISTANT_URL=http://homeassistant.local:8123
SYNRA_HOME_ASSISTANT_TOKEN=your_home_assistant_long_lived_access_token
SYNRA_HOME_ASSISTANT_DEFAULT_LIGHT=light.living_room
SYNRA_TOOL_TIMEOUT_SECONDS=12
```

Then restart:

```bash
systemctl --user restart synra-standalone.service
```

Voice or text commands now supported:

```text
turn the lights on
confirm
turn the lights off
toggle the lights
status
help
camera status
enable camera
voice status
microphone status
remember that I prefer concise answers
clear memories
switch to quantum workshop background
switch to Synra Battle
low performance mode
normal performance mode
show controls
hide controls
list smart home devices
set office light as default target
```

If smart home is configured, light commands ask for confirmation before sending the Home Assistant request. Say `confirm` to proceed or `cancel` to stop. If smart home is not configured, Synra will say that clearly instead of pretending the action succeeded. The in-app Test Home button checks Home Assistant `/api/config`, and Discover Home reads `/api/states` for lights, switches, scenes, scripts, and input booleans. After discovery, Synra shows the target count and default target in the right rail, can list targets, set a default target, and match friendly names in commands such as `turn on office light`. Neither route returns the token in status output.

Camera commands are permission/status only in this build. Synra can check whether camera access is available and request permission, but she does not store frames or claim vision analysis until a configured vision skill is added.

For Jetson camera diagnostics, optionally set the preferred local camera device:

```bash
SYNRA_CAMERA_DEVICE=/dev/video0
```

Then restart:

```bash
systemctl --user restart synra-standalone.service
```

Check the Jetson-side camera report:

```bash
curl http://127.0.0.1:5191/api/vision/public
```

This endpoint reports device paths only. It does not open the camera, capture frames, or store images.

The current Jetson has these Ollama models available:

- `qwen2.5:1.5b` for lightweight local text chat.
- `qwen2.5vl:3b` for future local vision experiments.
- `moondream:latest` for future lightweight vision experiments.

Then restart:

```bash
systemctl --user restart synra-standalone.service
```

Health check:

```bash
curl http://127.0.0.1:5191/api/health
```

Full Jetson diagnostic report:

```bash
~/synra-standalone/scripts/jetson-diagnostics.sh
```

Kiosk performance report:

```bash
~/synra-standalone/scripts/kiosk-performance-check.sh
~/synra-jetson-station/scripts/electron-gpu-check.sh
```

## Deploy From Mac

From the collection root:

```bash
cd "Synra Standalone"
npm run build
COPYFILE_DISABLE=1 tar --no-xattrs -czf /tmp/synra-standalone-dist.tgz dist docs package.json
scp /tmp/synra-standalone-dist.tgz matthew@192.168.1.165:/home/matthew/synra-standalone-dist.tgz
ssh matthew@192.168.1.165
```

On the Jetson:

```bash
APP_DIR="$HOME/synra-standalone"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
tar -xzf "$HOME/synra-standalone-dist.tgz" -C "$APP_DIR"
find "$APP_DIR" -name '._*' -delete
find "$APP_DIR" -name '.DS_Store' -delete
systemctl --user restart synra-standalone.service
rm -f "$HOME/synra-standalone-dist.tgz"
```

## Kiosk Command

The recommended production kiosk is the dedicated Electron shell:

```bash
~/synra-jetson-station/scripts/start-electron-kiosk.sh
```

For setup, copy/paste, and ElevenLabs key entry, start the Electron shell in a normal window:

```bash
SYNRA_KIOSK_WINDOW_MODE=windowed ~/synra-jetson-station/scripts/start-electron-kiosk.sh
```

Synra also has a `Settings` > `Display` button that switches between `Windowed setup` and `Fullscreen kiosk`. The selected mode is remembered for the next Electron launch.

Synra companion presence is configured in `Settings` > `Companion`:

- Wake word: off by default, or local `Hey Synra` listening.
- Screen timeout: `15 minutes`, `30 minutes`, `1 hour`, or `Never`.
- Memory suggestions: Synra can ask before saving useful preferences.

The Electron shell receives the saved screen timeout and can turn the display off with `xset dpms force off` when available. Wake word activation calls the Electron wake hook and restores/focuses the Synra window.

Known users are configured in `Settings` > `Users`. Face samples are explicit local captures, not automatic background storage. Delete users from the same panel if a profile should be removed.

It launches the Synra runtime outside snap Chromium confinement:

```text
http://127.0.0.1:5191/?profile=jetson&mode=kiosk&fps=30&live=1&quality=sharp&scale=1&maxw=2560&maxh=1600&avatar=code1&telemetry=1
```

The Electron autostart file is:

```text
~/.config/autostart/synra-electron-kiosk.desktop
```

The older snap Chromium launcher is still available as a fallback:

```bash
~/synra-standalone/scripts/start-jetson-kiosk.sh
```

If the Jetson uses a different Chromium binary, try:

```bash
command -v chromium chromium-browser google-chrome
```

Electron kiosk mode now uses sharp, native-pixel rendering with a 30 FPS target by default on the tested `2560x1600` Jetson display. The frame scheduler was fixed so 30 FPS does not accidentally collapse into uneven 20-ish FPS pacing. These knobs remain available for other displays and thermal testing:

```bash
SYNRA_KIOSK_FPS=30 SYNRA_KIOSK_QUALITY=sharp SYNRA_KIOSK_RENDER_SCALE=1 ~/synra-jetson-station/scripts/start-electron-kiosk.sh
SYNRA_KIOSK_FPS=24 SYNRA_KIOSK_QUALITY=sharp SYNRA_KIOSK_RENDER_SCALE=1 ~/synra-jetson-station/scripts/start-electron-kiosk.sh
SYNRA_KIOSK_FPS=15 SYNRA_KIOSK_QUALITY=performance SYNRA_KIOSK_RENDER_SCALE=0.75 ~/synra-jetson-station/scripts/start-electron-kiosk.sh
```

The kiosk render scale defaults to `1` with a `2560x1600` buffer cap so the WebGL canvas matches the visible kiosk pixels on the current display. Use these knobs when tuning a specific Jetson monitor:

```bash
SYNRA_KIOSK_RENDER_SCALE=1.0 ~/synra-jetson-station/scripts/start-electron-kiosk.sh
SYNRA_KIOSK_RENDER_SCALE=0.85 SYNRA_KIOSK_QUALITY=balanced ~/synra-jetson-station/scripts/start-electron-kiosk.sh
SYNRA_KIOSK_RENDER_SCALE=0.75 SYNRA_KIOSK_QUALITY=performance ~/synra-jetson-station/scripts/start-electron-kiosk.sh
```

The kiosk caps the internal WebGL render buffer to `2560x1600` by default. Lower these only when trading sharpness for a specific display or browser backend:

```bash
SYNRA_KIOSK_MAX_RENDER_WIDTH=1600 SYNRA_KIOSK_MAX_RENDER_HEIGHT=1000 ~/synra-jetson-station/scripts/start-electron-kiosk.sh
SYNRA_KIOSK_MAX_RENDER_WIDTH=1920 SYNRA_KIOSK_MAX_RENDER_HEIGHT=1200 ~/synra-jetson-station/scripts/start-electron-kiosk.sh
```

The dedicated Electron kiosk shell defaults to local camera/mic permission auto-grant for the Jetson station. This keeps the unattended kiosk from getting stuck behind hidden media prompts.

To disable media auto-grant for a manual permission test:

```bash
SYNRA_KIOSK_AUTO_GRANT_MEDIA=false ~/synra-jetson-station/scripts/start-electron-kiosk.sh
```

Browser/mobile clients still use normal browser permission prompts.

For local Chrome inspection and performance probes:

```bash
SYNRA_KIOSK_REMOTE_DEBUG=true ~/synra-jetson-station/scripts/start-electron-kiosk.sh
```

If Electron logs GPU initialization failures, test explicit ANGLE modes:

```bash
SYNRA_KIOSK_ANGLE_BACKEND=vulkan ~/synra-jetson-station/scripts/start-electron-kiosk.sh
SYNRA_KIOSK_ANGLE_BACKEND=gl ~/synra-jetson-station/scripts/start-electron-kiosk.sh
SYNRA_KIOSK_ANGLE_BACKEND=egl ~/synra-jetson-station/scripts/start-electron-kiosk.sh
SYNRA_KIOSK_ANGLE_BACKEND=none ~/synra-jetson-station/scripts/start-electron-kiosk.sh
```

`SYNRA_KIOSK_ANGLE_BACKEND` defaults to `vulkan`. On the current Jetson, the `gl` backend advertised WebGL/WebGL2 but dropped the GPU command buffer during full Synra startup, causing Synra telemetry to report WebGL unavailable. Use `gl` only as a diagnostic comparison. A good Jetson kiosk path should show Synra telemetry with WebGL available, FPS near target, and `GR3D_FREQ` activity while Synra is visible.

The app still supports manual testing at:

```text
http://192.168.1.165:5191/?profile=jetson
```

If the Jetson display still feels slow, force the lowest-cost visual tier:

```text
http://192.168.1.165:5191/?profile=jetson&mode=kiosk&fps=15&live=1&quality=performance&scale=0.75
```

## Kiosk Performance Notes

- `mode=kiosk` forces Live Mode controls on startup.
- `fps=30` is the verified Electron target on the current Jetson.
- `fps=15` lowers render pressure for thermal or remote-display testing.
- `live=1` keeps the tuning controls collapsed unless the user opens them.
- `quality=low` forces simpler effects and a lower render pixel ratio for weaker displays or thermal-heavy sessions.
- `scale=1.0` preserves Synra avatar clarity; lower values are diagnostic only because they make her look blurry.
- Electron is launched with WebGL/WebGL2 flags, no snap confinement, no renderer background throttling, and a fixed kiosk URL.
- The page reports voice capability in the right panel: `Speak + listen`, `Speak ready`, `Listen ready`, or `Text ready`.
- Without `quality=performance`, kiosk mode can automatically drop into the lower-cost tier if frame pacing remains below target for several seconds.

## Performance Targets

- Static server memory should stay tiny; the first install reports about 8.5 MB for the Python server process.
- Runtime bundle is split into a small app chunk and a cached 3D vendor chunk.
- Starter install is about 33 MB.
- Avatar startup loads one 15.4 MB VRM.
- Renderer uses no shadows, no antialiasing, capped pixel ratio, and no post-processing.
- Jetson kiosk mode uses `?profile=jetson`, which targets 30 FPS and caps pixel ratio at 1.
