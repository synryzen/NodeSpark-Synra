# NodeSpark Synra

Synra Standalone is a companion AI assistant built from the Synra experience in NodeSpark and NodeSparkHub, but packaged as its own product path.

Synra is designed to:

- Talk, listen, and speak.
- Use local or cloud AI models through an OpenAI-compatible server path.
- Remember user-approved preferences locally.
- Run on Jetson as a lean kiosk companion.
- Control smart-home tools only when configured and confirmed.
- Connect to NodeSpark later as an optional skill, not a dependency.

## Current Runtime

- Vite + TypeScript frontend.
- Three.js / VRM avatar renderer.
- Three Synra avatars.
- 97 VRMA motion clips.
- Six Synra stage backgrounds.
- Python same-origin API server for Jetson deployment.
- Local model bridge, smart-home bridge, and privacy-safe camera diagnostics.

## Jetson

The Jetson deployment is documented in [docs/jetson-runbook.md](docs/jetson-runbook.md), with a quick installer in [docs/jetson-install.md](docs/jetson-install.md).

Fresh Jetson install:

```bash
curl -fsSL https://raw.githubusercontent.com/synryzen/NodeSpark-Synra/main/scripts/install-jetson.sh | bash
```

Guided install page:

```text
https://synryzen.github.io/NodeSpark-Synra/jetson-install.html
```

Default runtime:

```text
http://127.0.0.1:5191/?profile=jetson&mode=kiosk&fps=30&live=1&quality=sharp&scale=1&maxw=2560&maxh=1600&avatar=code1&telemetry=1
```

Diagnostics:

```bash
~/synra-standalone/scripts/jetson-diagnostics.sh
~/synra-standalone/scripts/kiosk-performance-check.sh
~/synra-jetson-station/scripts/electron-gpu-check.sh
```

The recommended production kiosk is the Electron shell at `~/synra-jetson-station/scripts/start-electron-kiosk.sh`. Snap Chromium remains a fallback through `~/synra-standalone/scripts/start-jetson-kiosk.sh`.

After install, open `http://JETSON_IP:5191/`, go to Settings, and configure:

- `AI`: local or remote OpenAI-compatible model endpoint.
- `Voice`: paste ElevenLabs API key, load voices, choose a voice, then test voice.
- `Home`: optional Home Assistant URL/token and default target.
- `NodeSparkHub`: optional subscriber pairing.

The Electron kiosk defaults to local mic/camera permission auto-grant for the dedicated Jetson station shell. Browser and mobile users still control permissions through their browser.

## GitHub Page

Project page:

```text
https://synryzen.github.io/NodeSpark-Synra/
```

Roadmap:

```text
docs/roadmap.md
```

## Development

```bash
npm install
npm run typecheck
npm run build
npm run perf:smoke
```

## Product Boundary

Synra Standalone does not replace Synra inside NodeSpark. NodeSpark and NodeSparkHub remain the workflow automation products. Synra Standalone is the companion product that can later connect to NodeSpark as one optional skill.
