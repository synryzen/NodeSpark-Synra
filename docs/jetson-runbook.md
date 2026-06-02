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

## Smart Home Configuration

Synra has a safe smart-home bridge for Home Assistant lights. It only runs when explicitly configured in:

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
remember that I prefer concise answers
clear memories
switch to quantum workshop background
switch to Synra Battle
low performance mode
normal performance mode
show controls
hide controls
```

If smart home is configured, light commands ask for confirmation before sending the Home Assistant request. Say `confirm` to proceed or `cancel` to stop. If smart home is not configured, Synra will say that clearly instead of pretending the action succeeded.

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

If Chromium is installed:

```bash
~/synra-standalone/scripts/start-jetson-kiosk.sh
```

If the Jetson uses a different Chromium binary, try:

```bash
command -v chromium chromium-browser google-chrome
```

The deployed autostart file is:

```text
~/.config/autostart/synra-standalone-kiosk.desktop
```

It launches:

```text
http://127.0.0.1:5191/?profile=jetson&mode=kiosk&fps=24&live=1
```

Kiosk mode intentionally targets 24 FPS by default. The previous 30 FPS target was usable but could sit below target on the Jetson, which makes motion feel uneven and wastes render budget. Override it only when the device is clearly stable:

```bash
SYNRA_KIOSK_FPS=30 ~/synra-standalone/scripts/start-jetson-kiosk.sh
```

If Synra is running as an unattended kiosk and you want Chromium to automatically accept camera/mic prompts, opt in explicitly:

```bash
SYNRA_KIOSK_AUTO_GRANT_MEDIA=true ~/synra-standalone/scripts/start-jetson-kiosk.sh
```

Leave this off for normal use so browser media permissions remain visible to the user.

The app still supports manual testing at:

```text
http://192.168.1.165:5191/?profile=jetson
```

If the Jetson display still feels slow, force the lowest-cost visual tier:

```text
http://192.168.1.165:5191/?profile=jetson&mode=kiosk&fps=24&live=1&quality=low
```

## Kiosk Performance Notes

- `mode=kiosk` forces Live Mode controls on startup.
- `fps=24` lowers render pressure and improves frame pacing on Jetson.
- `live=1` keeps the tuning controls collapsed unless the user opens them.
- `quality=low` forces simpler effects and a lower render pixel ratio for weaker displays or thermal-heavy sessions.
- Chromium is launched with GPU rasterization, scale factor 1, no extensions, no first-run UI, no scrollbars, and background throttling disabled.
- The page reports voice capability in the right panel: `Speak + listen`, `Speak ready`, `Listen ready`, or `Text ready`.
- Without `quality=low`, kiosk mode can automatically drop into the lower-cost tier if frame pacing remains below target for several seconds.

## Performance Targets

- Static server memory should stay tiny; the first install reports about 8.5 MB for the Python server process.
- Runtime bundle is split into a small app chunk and a cached 3D vendor chunk.
- Starter install is about 33 MB.
- Avatar startup loads one 15.4 MB VRM.
- Renderer uses no shadows, no antialiasing, capped pixel ratio, and no post-processing.
- Jetson kiosk mode uses `?profile=jetson`, which targets 30 FPS and caps pixel ratio at 1.
