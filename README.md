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
- 57 VRMA motion clips.
- Six Synra stage backgrounds.
- Python same-origin API server for Jetson deployment.
- Local model bridge, smart-home bridge, and privacy-safe camera diagnostics.

## Jetson

The Jetson deployment is documented in [docs/jetson-runbook.md](docs/jetson-runbook.md).

Default runtime:

```text
http://127.0.0.1:5191/?profile=jetson&mode=kiosk&fps=24&live=1
```

Diagnostics:

```bash
~/synra-standalone/scripts/jetson-diagnostics.sh
~/synra-standalone/scripts/kiosk-performance-check.sh
```

Kiosk troubleshooting supports opt-in media, remote debug, and Chromium GL mode overrides through `SYNRA_KIOSK_AUTO_GRANT_MEDIA`, `SYNRA_KIOSK_REMOTE_DEBUG`, and `SYNRA_KIOSK_GL_MODE`.

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
