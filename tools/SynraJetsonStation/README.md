# Synra Jetson Station

Synra Jetson Station is the Hub-side foundation for a future full-screen Jetson Orin Nano Synra display. NodeSparkHub remains the brain, memory store, tool registry, confirmation gate, audit authority, and workflow runtime. The station is a local client surface: it displays Synra, reports health, sends user-visible events, and never bypasses Hub safety.

## What This Includes

- A small Node/TypeScript station server.
- Optional static hosting for a synced Synra runtime at `/synra/`.
- Local station endpoints for config, status, health, user messages, mic/camera status, vision summaries, and explicit confirmations.
- A Device Mesh client that uses the existing Hub `/devices/checkin` and `/devices/<id>/commands/poll` contracts.
- Redacted logging and server-side-only Hub token handling.
- Simulation mode for development without a real Jetson or reachable Hub.
- Kiosk and systemd helper scripts.

## Setup

From the project root:

```bash
bash scripts/sync-synra-to-jetson-station.sh
cd Tools/SynraJetsonStation
npm install
npm run build
npm start
```

Open:

```text
http://127.0.0.1:4788/
```

The station page can embed a synced Synra runtime at:

```text
http://127.0.0.1:4788/synra/
```

The recommended production kiosk path does not depend on this static bundle. It launches the installed Synra Standalone service at `http://127.0.0.1:5191/`.

## Configuration

Copy `.env.example` to `.env` for local development. Do not commit `.env`.

Important variables:

- `HUB_BASE_URL`: NodeSparkHub server URL, default `http://127.0.0.1:8787`.
- `HUB_DEVICE_TOKEN`: optional paired Hub token. This stays server-side and is never returned from `/station/config`.
- `STATION_CAMERA_ENABLED`: defaults to `false`.
- `STATION_MICROPHONE_ENABLED`: defaults to `false`.
- `STATION_LOCAL_VISION`: defaults to `false`.
- `STATION_LOCAL_SPEECH`: defaults to `false`.

Camera and microphone are unavailable until a real, visible, permissioned Jetson path is wired. The station must never silently capture frames or listen.

## Station Endpoints

- `GET /station/config`
- `GET /station/status`
- `GET /station/health`
- `GET /station/events`
- `GET /station/events/stream`
- `POST /station/user-message`
- `POST /station/mic-status`
- `POST /station/camera-status`
- `POST /station/vision-summary`
- `POST /station/confirmation`
- `POST /station/bridge`

Supported bridge message types:

- `assistant.ask`
- `assistant.cancel`
- `device.status`
- `device.heartbeat`
- `voice.status`
- `voice.start`
- `voice.stop`
- `camera.status`
- `camera.captureForVision`
- `confirmation.accept`
- `confirmation.cancel`
- `debug.state`
- `settings.get`
- `settings.update`

`settings.update` is blocked until Hub-side permission UI exists.

## Cross-Device Contract

The station advertises `crossDeviceContractVersion: 1.0`.

Supported event types:

- `device.register`
- `device.heartbeat`
- `device.statusChanged`
- `device.offline`
- `synra.state`
- `synra.say`
- `synra.motion`
- `synra.expression`
- `synra.gaze`
- `synra.debug`
- `synra.userMessage`
- `synra.visionRequest`
- `synra.visionSummary`
- `synra.micStatus`
- `synra.toolIntent`
- `synra.toolPlan`
- `synra.toolResult`
- `confirmation.request`
- `confirmation.accepted`
- `confirmation.denied`

Remote workflow execution, destructive actions, camera capture, and microphone listening remain Hub-confirmed and user-visible. The Jetson station cannot self-confirm risky actions.

## Simulation

```bash
cd Tools/SynraJetsonStation
npm run simulate
```

Simulation starts the server, registers a mock Jetson device when the Hub is unavailable, sends one heartbeat, checks `/station/health`, and exits.

## Kiosk

```bash
cd Tools/SynraJetsonStation
bash scripts/start-kiosk.sh
```

The script starts the station, waits for `/station/health`, and launches Chromium/Chrome in kiosk mode. Set `CHROMIUM_BIN` if Chromium is not in `PATH`.

## Electron Kiosk Shell

The recommended Jetson production path is the dedicated Electron shell:

```bash
cd Tools/SynraJetsonStation
npm install
npm run build
bash scripts/start-electron-kiosk.sh
```

This launches the existing Synra app URL outside snap Chromium confinement:

```text
http://127.0.0.1:5191/?profile=jetson&mode=kiosk&fps=30&live=1&quality=sharp&scale=1&maxw=2560&maxh=1600&avatar=code1&telemetry=1
```

The shell applies GPU-focused Chromium switches before Electron starts, including WebGL/WebGL2, `ignore-gpu-blocklist`, optional ANGLE backend selection, and opt-in local remote debugging. When `SYNRA_KIOSK_REMOTE_DEBUG=true`, the debug endpoint is:

```text
http://127.0.0.1:9222/json/version
```

Important tuning variables:

- `SYNRA_STANDALONE_URL`: base Synra app URL, default `http://127.0.0.1:5191/`.
- `SYNRA_KIOSK_ANGLE_BACKEND`: default `vulkan`; `gl` may advertise WebGL/WebGL2 on some Jetson builds but can drop the command buffer during full Synra startup.
- `SYNRA_KIOSK_GL_MODE`: default `none`; try `egl` only if Electron logs suggest it.
- `SYNRA_KIOSK_REMOTE_DEBUG`: default `false`; set `true` only for diagnostics.
- `SYNRA_KIOSK_AUTO_GRANT_MEDIA`: default `false`; only set `true` for unattended kiosks where camera/mic prompts are intentionally auto-accepted.

Run the GPU diagnostic after launching the Electron kiosk:

```bash
bash scripts/electron-gpu-check.sh
```

The diagnostic prints the launch config, Synra health/telemetry, Electron remote-debug status, Electron/browser processes, EGL/Vulkan/NVIDIA library visibility, memory, and a `tegrastats` sample. A successful production path should show Synra rendering smoothly and `GR3D_FREQ` activity during avatar motion.

Keep `scripts/start-kiosk.sh` as a fallback Chromium launcher until the Electron path proves stable on the Jetson display.

Deploy the Electron kiosk shell from the Mac to the Jetson:

```bash
cd Tools/SynraJetsonStation
JETSON_HOST=192.168.1.165 JETSON_USER=matthew bash scripts/deploy-electron-kiosk.sh
```

The deploy script intentionally installs `node_modules` on the Jetson instead of copying Mac modules, so Electron downloads the correct Linux ARM64 runtime.

## Systemd

The example service lives at:

```text
Tools/SynraJetsonStation/systemd/nodespark-synra-station.service.example
```

An Electron kiosk user-session example is also included:

```text
Tools/SynraJetsonStation/systemd/nodespark-synra-electron-kiosk.service.example
```

Install on the Jetson with:

```bash
sudo Tools/SynraJetsonStation/scripts/install-systemd-service.sh
```

The service example does not contain secrets. Store local values in `/etc/nodespark-synra-station.env`.

## Validation

From the project root:

```bash
bash scripts/sync-synra-to-jetson-station.sh
cd Tools/SynraJetsonStation
npm install
npm run typecheck
npm run build
npm run simulate
```

Then run the existing Synra checks:

```bash
cd Tools/SynraWebModern
npm run typecheck
npm run build
npm run audit:vrm
npm run audit:motion
npm run audit:assistant
npm run audit:tools
npm run audit:devices
```

Finally sync and build the macOS app if bundled runtime behavior changed:

```bash
bash scripts/sync-synra-web-runtime.sh
xcodebuild -project NodeSparkHub.xcodeproj -scheme NodeSparkHub -configuration Debug -destination 'platform=macOS,arch=arm64' -derivedDataPath "${TMPDIR:-/tmp}/nodesparkhub-codex-deriveddata" build
```
