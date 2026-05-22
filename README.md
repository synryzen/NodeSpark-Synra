# NodeSpark Synra

NodeSpark Synra is the Jetson-powered monitor companion for NodeSparkHub. It
turns workflows, assistant replies, approvals, and local status into a living
on-screen anime AI assistant.

Synra is currently built around a browser-based VRM avatar renderer, a Python
daemon, and a full-screen kiosk UI for the Jetson Orin Nano developer kit.

## Current Prototype

- Full-screen monitor UI for NodeSpark Synra.
- VRM avatar loading with Three.js and `@pixiv/three-vrm`.
- State-driven expressions: idle, listening, thinking, speaking,
  workflow_running, success, warning, error, approval_needed, and sleep.
- Human-like idle motion: relaxed stance, small gaze shifts, weight shifts,
  subtle stretches, and delayed yawn behavior.
- Natural TTS bridge with ElevenLabs and local Kokoro support, plus browser
  speech as the final fallback.
- Synra natural, soft anime, and calm assistant voice presets with mouth motion
  and speaking nods.
- Browser microphone flow where permissions allow it.
- Typed command bar for environments where the microphone is blocked.
- Selectable monitor backgrounds: none, node grid, studio, night city, aurora,
  and command deck.
- Local fallback assistant mode when NodeSparkHub is offline.
- Hub client for pairing, check-in, command polling, workflow runs, assistant
  calls, and acknowledgements.
- Monitor-side Hub onboarding: set the Hub URL, pair Synra, and launch favorite
  workflows from the kiosk UI.
- Assistant requests are routed to NodeSparkHub's default AI model for general
  questions, workflow setup help, and workflow run requests when paired.
- Hybrid local brain: short greetings, personality chat, and lightweight
  general prompts can run locally through Ollama while Hub/workflow actions stay
  routed to NodeSparkHub.

## Project Layout

```text
src/nodespark_synra/       Python daemon and Hub integration
web/                       Monitor UI, VRM renderer, and browser assets
web/assets/avatars/        Active Synra VRM plus temporary candidate models
scripts/                   Jetson install, kiosk launch, and asset helpers
systemd/                   User service unit
desktop/                   Kiosk autostart entry
docs/                      Build notes and avatar pipeline docs
live2d-production/         Archived/optional Live2D production handoff notes
```

## Run Locally

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -e .
cp config.example.toml config.toml
nodespark-synra --config config.toml
```

Open:

```text
http://localhost:8788
```

## Install On Jetson

On the Jetson:

```bash
cd nodespark-wisp/synra
bash scripts/install_jetson_app.sh
```

Then edit:

```text
/etc/nodespark-synra/config.toml
```

Set `hub.base_url` to the Mac or server running NodeSparkHub. The daemon runs
as a user systemd service:

```bash
systemctl --user status nodespark-synra
systemctl --user restart nodespark-synra
```

Open the monitor UI:

```text
http://127.0.0.1:8788
```

Each Synra install can also set or change its Hub URL from the monitor UI. Use
the NodeSparkHub panel, enter the user's Hub address, then pair that monitor.
Changing the Hub URL clears the local pairing token because pairings belong to a
specific Hub.

For example, a public Hub URL can be:

```text
https://nodespark.msidragon.com
```

To launch Synra full-screen whenever the Jetson desktop user logs in:

```bash
bash /opt/nodespark-synra/scripts/install_desktop_autostart.sh
```

## Kiosk Mode

The kiosk launcher is tuned for the Jetson WebGL path:

```bash
bash scripts/launch_kiosk.sh
```

By default it uses Chromium with software WebGL fallback flags so the VRM
renderer stays available on systems where GPU acceleration is inconsistent.

## Natural Voice

Synra asks the local daemon for generated speech first. The daemon uses:

- ElevenLabs when `ELEVENLABS_API_KEY` is set.
- Kokoro when the optional local Kokoro stack is installed.
- Browser speech only as a fallback.

For the quickest natural voice, create an ElevenLabs API key and set it for the
user service:

```bash
systemctl --user edit nodespark-synra
```

Add:

```ini
[Service]
Environment=ELEVENLABS_API_KEY=your_key_here
Environment=ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL
Environment=NODESPARK_SYNRA_TTS_PROVIDER=elevenlabs
```

Then restart:

```bash
systemctl --user daemon-reload
systemctl --user restart nodespark-synra
```

For a no-account local neural voice, install Kokoro in Synra's virtualenv:

```bash
bash /opt/nodespark-synra/scripts/install_kokoro_tts.sh
systemctl --user edit nodespark-synra
```

Add:

```ini
[Service]
Environment=NODESPARK_SYNRA_TTS_PROVIDER=kokoro
```

Then restart the service.

## Local Brain

Synra can use a small local model for fast personality replies and simple
general chat. Hub/device/workflow actions still route to NodeSparkHub.

On Jetson, install Ollama and pull the default model:

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:1.5b
```

Synra uses this config by default:

```toml
[local_ai]
enabled = true
provider = "ollama"
base_url = "http://127.0.0.1:11434"
model = "qwen2.5:1.5b"
```

## Local API

Set the avatar state:

```bash
curl -X POST http://localhost:8788/api/state \
  -H "Content-Type: application/json" \
  -d '{"mode":"thinking","expression":"focused","message":"Building your workflow map..."}'
```

Ask Synra:

```bash
curl -X POST http://localhost:8788/api/command \
  -H "Content-Type: application/json" \
  -d '{"type":"assistant","text":"Who are you?"}'
```

Make Synra speak:

```bash
curl -X POST http://localhost:8788/api/command \
  -H "Content-Type: application/json" \
  -d '{"type":"speak","text":"NodeSparkHub is online. I am ready."}'
```

Run or stage a workflow:

```bash
curl -X POST http://localhost:8788/api/command \
  -H "Content-Type: application/json" \
  -d '{"type":"runWorkflow","workflowName":"Synra Assistant"}'
```

Check health:

```bash
curl http://localhost:8788/api/health
```

Connect to NodeSparkHub from the local API:

```bash
curl -X POST http://localhost:8788/api/connect \
  -H "Content-Type: application/json" \
  -d '{"baseUrl":"http://192.168.1.100:8787"}'
```

Pair with a Hub pairing code:

```bash
curl -X POST http://localhost:8788/api/pair \
  -H "Content-Type: application/json" \
  -d '{"code":"123456"}'
```

List workflows Synra can launch:

```bash
curl http://localhost:8788/api/workflows
```

Check natural TTS status:

```bash
curl http://localhost:8788/api/tts/status
```

Check local AI status:

```bash
curl http://localhost:8788/api/local-ai/status
```

Generate speech audio:

```bash
curl -X POST http://localhost:8788/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Synra natural voice is ready.","voice":"cute"}' \
  --output synra.mp3
```

## Avatar Assets

The active VRM is:

```text
web/assets/avatars/synra.vrm
```

Temporary candidate VRMs are stored in:

```text
web/assets/avatars/candidates/
```

See `docs/SYNRA_TEMP_VRM_SOURCE.md` for temporary model source notes. These are
prototype assets and should be replaced with a final custom Synra VRM before a
public production release.

## Design North Star

Synra should feel like the face and soul of NodeSparkHub, not a generic
chatbot. She is smart first, visually memorable second, and useful always.

The experience target is a monitor assistant who feels present even while idle:
relaxed, attentive, expressive, and ready to help.
