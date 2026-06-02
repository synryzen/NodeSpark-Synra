# NodeSpark Synra Roadmap

## Current Focus

- Keep the Jetson runtime fast enough for kiosk use.
- Make Synra feel alive while keeping every state understandable.
- Route model, tool, memory, vision, and NodeSpark requests through clear lanes.
- Keep privacy boundaries obvious: no raw camera frames, raw audio, tokens, or secrets in memory.

## Next Milestones

1. Camera driver/device fix on Jetson so `/dev/video*` is available.
2. Physical kiosk display test with thermal, WebGL, GPU, and FPS notes.
3. Microphone and speaker smoke test in Chromium kiosk mode.
4. Vision model route using `SYNRA_VISION_MODEL_NAME`.
5. Optional NodeSpark skill route using `SYNRA_NODESPARK_MODEL_NAME`.
6. Installer/update flow for Jetson appliance deployments.

## Safety Rules

- Direct commands stay instant and do not require a model.
- Tool execution requires configuration and confirmation when it changes the outside world.
- Vision remains diagnostics-only until a camera stream and vision model are explicitly configured.
- Synra Standalone must continue working when NodeSpark is not installed or paired.
