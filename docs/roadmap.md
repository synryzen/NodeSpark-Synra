# NodeSpark Synra Roadmap

## Current Status

Synra Standalone is now a separate Jetson-first companion app. It does not require NodeSparkHub to run, but it reuses the Hub-grade avatar runtime so Synra looks and moves like the app-store Synra experience.

Product direction is now split clearly:

- Free Synra is the companion and smart-home assistant.
- Home Assistant control is a free first-party skill when the user configures their own Home Assistant URL, token, and entity.
- NodeSpark Command Center is a premium subscriber skill for NodeSpark users, with pairing and workflow execution kept explicit.

Implemented foundations:

- Hub-grade `SynraAvatarRuntime` is wired into Standalone for avatar loading, camera framing, floor calibration, expressions, authored VRMA playback, and runtime health.
- All three Synra VRM characters are available locally.
- The local VRMA motion manifest is available and manual playback routes through the Hub runtime.
- `npm run qa:avatars` can run a live browser smoke test against the Jetson, switch all three avatars, and play every bundled VRMA motion.
- Jetson kiosk mode honors `profile=jetson`, `mode=kiosk`, `fps`, `quality`, and `scale` query settings, with a smoother 30 FPS default.
- Six Synra stage backgrounds are bundled locally.
- The right-side control panel scrolls and keeps controls off the main avatar view.
- AI connection settings support server, OpenAI-compatible cloud, and local HTTP endpoints.
- A dedicated Electron Jetson kiosk shell is now included under `tools/SynraJetsonStation`.
- Jetson install/update can run from `scripts/install-jetson.sh`.
- The verified Jetson production path reaches the 30 FPS target with Synra telemetry reporting WebGL available.
- The external model proxy sends Hub-style OpenAI-compatible headers and cleans provider wrapper tokens.
- Local memory can store approved facts, preferred name, and response style.
- Voice and microphone paths fail gracefully when browser support or permission is unavailable.
- Voice controls include an immediate stop button, speech/listening cancellation, and browser audio-device diagnostics.
- Camera status is diagnostics-only and does not capture or store frames.
- Vision has an explicit On/Off control that owns the transient browser camera stream and stops all tracks when turned off.
- Smart-home commands fail safely when unconfigured and require confirmation when configured.
- Home Assistant can be configured, tested, discovered, summarized, listed, and targeted by friendly name as the free smart-home skill.
- Telemetry reports local kiosk health without API keys, prompts, camera frames, audio, or secrets.

## Highest Priority Build Items

1. Avatar QA on the physical Jetson display
   - Run `npm run qa:avatars` before physical review.
   - Confirm each VRM looks sharp in Chromium kiosk mode on the actual display.
   - Confirm full-body framing, feet visibility, and no oversized close-up framing.
   - Confirm all local VRMA motions look correct and return to idle without hanging.
   - Capture FPS, thermal, and memory notes for the default `fps=30`, plus comparison passes at `fps=24` and `fps=12`.

2. Voice reliability
   - Add a visible microphone permission state for kiosk mode.
   - Add a fuller audio input/output device diagnostics panel.
   - Add a push-to-talk fallback when browser speech recognition is unavailable.
   - Run physical microphone and speaker testing in Chromium kiosk mode.

3. Vision skill
   - Configure a real `/dev/video*` camera stream on the Jetson.
   - Route vision prompts to `SYNRA_VISION_MODEL_NAME`.
   - Keep frames transient unless the user explicitly saves an image.
   - Add actual frame-to-vision-model analysis after camera hardware is configured.

4. Smart-home connectors
   - Expand Home Assistant aliases into room/device groups after discovery.
   - Add Hue bridge support or document Home Assistant as the first supported bridge.
   - Add action risk levels for lights, locks, garage doors, thermostat, and security scenes.
   - Keep confirmation mandatory for risky or state-changing actions.

5. Local tools
   - Add a tool registry for safe local actions such as system status, date/time, network status, display brightness, and audio volume.
   - Add confirmation and logging for actions that change the machine.
   - Add clear user feedback for every tool start, success, failure, and cancellation.

6. NodeSpark optional skill
   - Add a disabled-by-default NodeSpark connection profile.
   - Check NodeSparkHub status when configured.
   - Allow Synra to explain workflows, summarize recent runs, and draft workflow ideas.
   - Require explicit confirmation before asking NodeSpark to run anything.

7. Companion memory
   - Add an editable memory panel.
   - Add forget-by-item and export/import memory actions.
   - Add memory categories: identity, style, routines, devices, rooms, and preferences.
   - Add redaction rules for tokens, passwords, raw audio, camera frames, and private secrets.

8. Packaging and operations
   - Add a signed release artifact or versioned tarball for Jetson installs.
   - Add a systemd health command and log export.
   - Add kiosk restart/recover behavior after Electron or WebGL failure.
   - Add Mac/browser development launch scripts.

## Verification Gates

Run these before calling a Jetson build ready:

```bash
npm run typecheck
npm run audit:hub-runtime
npm run perf:smoke
npm run build
npm run station:test
./scripts/deploy-jetson.sh
NODE_PATH="/Users/matthew/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules" npm run qa:avatars
```

After deploy, verify:

- `http://192.168.1.165:5191/api/health` returns `ok: true`.
- The served HTML references the latest `assets/index-*.js` bundle and `synra-3d-*.js`.
- `__synraStandaloneDebug()` reports `hubRuntimeReady`, WebGL available, render heartbeat active, and the expected Jetson target FPS.
- The visual page shows Synra sharp, full-body, and centered.

## Product Rules

- Synra Standalone must remain useful without NodeSpark installed or paired.
- Free Synra must not imply NodeSpark workflow or Hub control access.
- Home Assistant can remain free because it makes Synra useful as a general companion.
- NodeSpark Command Center features require subscriber access and a configured Hub URL.
- Direct UI commands should be instant and not require a model.
- Any action that changes the outside world must be permissioned and visible.
- No raw camera frames, raw audio, API keys, tokens, passwords, or private secrets should enter local memory or telemetry.
- Every important button must give immediate visible feedback.
