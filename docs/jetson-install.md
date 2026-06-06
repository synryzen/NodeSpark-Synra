# Synra Jetson Install Guide

This guide installs Synra Standalone and the dedicated Electron kiosk shell on a Jetson. It is written for a fresh build where Synra connects to a local or remote OpenAI-compatible AI endpoint.

## What Gets Installed

- Synra Standalone web app at `~/synra-standalone`.
- A local Python API server on port `5191`.
- A user-level systemd service named `synra-standalone.service`.
- The production Electron kiosk shell at `~/synra-jetson-station`.
- A GNOME autostart entry for the Electron kiosk.
- A private starter config at `~/.config/synra-standalone.env`.

## Requirements

- Jetson running Ubuntu with a desktop session.
- Internet access.
- `git`, `curl`, `python3`, and a normal user account.
- Node.js 20 or newer. The installer uses `nvm` to install Node.js 20 if needed.
- A model endpoint if you want AI replies, such as LM Studio, Ollama, OpenAI-compatible local HTTP, or a remote `/v1/chat/completions` service.

## One-Command Install

Run this on the Jetson:

```bash
curl -fsSL https://raw.githubusercontent.com/synryzen/NodeSpark-Synra/main/scripts/install-jetson.sh | bash
```

The installer clones or updates:

```text
~/NodeSpark-Synra
```

Then it builds and installs the runtime to:

```text
~/synra-standalone
~/synra-jetson-station
```

## Start or Restart

```bash
systemctl --user status synra-standalone.service
systemctl --user restart synra-standalone.service
systemctl --user restart synra-electron-kiosk.service
```

Open the app:

```text
http://127.0.0.1:5191/
```

On another device on the same network, use the Jetson IP:

```text
http://JETSON_IP:5191/
```

## Launch Kiosk

The recommended production kiosk is Electron:

```bash
~/synra-jetson-station/scripts/start-electron-kiosk.sh
```

It launches:

```text
http://127.0.0.1:5191/?profile=jetson&mode=kiosk&fps=30&live=1&quality=sharp&scale=1&maxw=2560&maxh=1600&avatar=code1&telemetry=1
```

Snap Chromium is kept only as a fallback:

```bash
~/synra-standalone/scripts/start-jetson-kiosk.sh
```

## Configure AI

Edit:

```bash
nano ~/.config/synra-standalone.env
```

Example remote OpenAI-compatible endpoint:

```bash
SYNRA_MODEL_ENDPOINT=https://lm.example.com/v1/chat/completions
SYNRA_MODEL_NAME=zai-org/glm-4.6v-flash
SYNRA_MODEL_LABEL=GLM 4.6V Flash
SYNRA_MODEL_API_KEY=
SYNRA_MODEL_TIMEOUT_SECONDS=45
```

Example local Ollama-compatible endpoint:

```bash
SYNRA_MODEL_ENDPOINT=http://127.0.0.1:11434/v1/chat/completions
SYNRA_MODEL_NAME=qwen2.5:1.5b
SYNRA_MODEL_LABEL=qwen2.5:1.5b
SYNRA_MODEL_API_KEY=
```

Restart after changes:

```bash
systemctl --user restart synra-standalone.service
```

Check model status:

```bash
curl http://127.0.0.1:5191/api/health
```

## Configure Voice and ElevenLabs

Open Synra from the Jetson or another device on the same network:

```text
http://JETSON_IP:5191/
```

Then use the app UI:

1. Open Settings.
2. Select `Voice`.
3. Choose `ElevenLabs`.
4. Paste your ElevenLabs API key.
5. Click `Load ElevenLabs Voices`.
6. Choose a voice by name.
7. Click `Test Voice`.
8. Click `Voice Diagnostics` if sound does not play.

If the Jetson is running fullscreen kiosk mode and you need normal copy/paste, switch to `Settings` > `Display` and click `Switch to Windowed Setup`. You can also launch directly into a setup window:

```bash
SYNRA_KIOSK_WINDOW_MODE=windowed ~/synra-jetson-station/scripts/start-electron-kiosk.sh
```

After the API key and voice are saved, click `Return to Full Screen` in `Settings` > `Display`.

Synra stores voice settings in the browser's local storage. The local Python server only receives the ElevenLabs API key when listing voices or generating speech.

Optional server-side voice defaults can also be placed in `~/.config/synra-standalone.env`:

```bash
SYNRA_ELEVENLABS_API_KEY=
SYNRA_ELEVENLABS_VOICE_ID=
SYNRA_ELEVENLABS_MODEL_ID=eleven_multilingual_v2
SYNRA_ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128
```

## Mic and Camera

The dedicated Electron kiosk shell defaults to local mic/camera permission auto-grant so Synra can listen and request camera frames on the Jetson display without hidden browser prompts.

To disable that for a manual permission test:

```bash
SYNRA_KIOSK_AUTO_GRANT_MEDIA=false ~/synra-jetson-station/scripts/start-electron-kiosk.sh
```

Useful camera check:

```bash
curl http://127.0.0.1:5191/api/vision/public
```

Inside Synra, use `Voice Diagnostics`, `Vision On`, and `Analyze View` to test the live browser path.

## Configure Home Assistant

Edit:

```bash
nano ~/.config/synra-standalone.env
```

Add:

```bash
SYNRA_SMART_HOME_ENABLED=true
SYNRA_HOME_ASSISTANT_URL=http://homeassistant.local:8123
SYNRA_HOME_ASSISTANT_TOKEN=your_home_assistant_long_lived_access_token
SYNRA_HOME_ASSISTANT_DEFAULT_LIGHT=light.living_room
```

Restart:

```bash
systemctl --user restart synra-standalone.service
```

Synra will require confirmation before changing smart-home state.

## Update

Run the installer again:

```bash
curl -fsSL https://raw.githubusercontent.com/synryzen/NodeSpark-Synra/main/scripts/install-jetson.sh | bash
```

The installer keeps an existing `~/.config/synra-standalone.env`.

## Verify Performance

Run:

```bash
~/synra-jetson-station/scripts/electron-gpu-check.sh
```

A healthy production result should show:

- Synra telemetry reachable.
- Runtime mode `kiosk`.
- WebGL available in Synra telemetry.
- FPS near the configured target.
- `GR3D_FREQ` activity while Synra is visible and moving.

The verified production path on the current Jetson is:

- Electron kiosk outside snap Chromium confinement.
- `fps=30`.
- `quality=sharp`.
- `scale=1`.
- `maxw=2560`.
- `maxh=1600`.
- ANGLE backend `vulkan`.
- Remote debugging off by default.

The `gl` backend can advertise WebGL/WebGL2 on some Jetson builds but may drop the command buffer during full Synra startup. Use it only for experiments.

## Troubleshooting

Check the app service:

```bash
journalctl --user -u synra-standalone.service -n 120 --no-pager
```

Check kiosk logs:

```bash
tail -120 ~/synra-electron-kiosk.log
```

Restart everything:

```bash
systemctl --user restart synra-standalone.service
pkill -x electron 2>/dev/null || true
pkill -x Electron 2>/dev/null || true
~/synra-jetson-station/scripts/start-electron-kiosk.sh
```

Enable local Electron remote debugging only for diagnostics:

```bash
SYNRA_KIOSK_REMOTE_DEBUG=true ~/synra-jetson-station/scripts/start-electron-kiosk.sh
```

Open:

```text
http://127.0.0.1:9222/json/version
```
