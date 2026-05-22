# Synra AI Assistant Pipeline

Synra should not be a stack of generated pictures. The durable architecture is:

```text
User voice or text
  -> Synra daemon / NodeSparkHub assistant
  -> LLM reply
  -> TTS audio
  -> lip-sync values
  -> real-time avatar renderer
```

## Current Implementation

- Brain: Synra forwards assistant requests to NodeSparkHub through
  `/wisp/assistant`.
- Voice input: browser speech recognition from the monitor UI.
- Voice output: browser `speechSynthesis` for the current prototype.
- Renderer: Three.js VRM avatar layer in `web/avatar3d-driver.js`.
- Avatar asset slot: `web/assets/avatars/synra.vrm`.
- Fallback: reactive PNG poses while no VRM file is installed.

## Target Visual Pipeline

1. Create Synra in VRoid Studio.
2. Export `synra.vrm`.
3. Copy it to:

   ```text
   web/assets/avatars/synra.vrm
   ```

4. Restart `nodespark-synra`.
5. Open `http://127.0.0.1:8788`.

The browser will automatically prefer the VRM model over the PNG fallback.

## VRM Behavior Contract

`web/avatar3d-driver.js` maps Synra state into real-time avatar behavior:

- `idle`: relaxed face, blinking, breathing, small autonomous gaze changes.
- `listening`: attentive lean and gaze while the microphone is active.
- `thinking` / `workflow_running`: focused/downward look and restrained motion.
- `speaking`: mouth expression driven by speech/audio activity with small nods.
- `success` / `bright` / `wink`: happy expression and lifted posture.
- `approval_needed` / `curious`: raised/curious posture and surprised expression.
- `warning` / `error` / `concerned`: sad expression and lowered posture.

The VRM should expose these standard presets where possible: `happy`, `sad`,
`relaxed`, `surprised`, `blink`, and `aa`. Missing optional presets will not
crash the app, but the model will be less expressive.

## Target Voice Pipeline

The next upgrade is replacing browser speech with generated audio plus visemes:

```text
LLM text
  -> ElevenLabs / local TTS
  -> audio file or stream
  -> Rhubarb / OVR-style visemes
  -> ParamMouthOpenY or VRM expression "aa"
```

For the current prototype, mouth motion is driven from speech state and audio
activity. This is smooth enough for interaction, but it is not phoneme-accurate
yet.

## Jetson Notes

The Orin Nano can run this, but keep the avatar light:

- Prefer a single VRM character under roughly 50-80 MB.
- Compress textures before final deployment.
- Avoid many physics/spring-bone chains in the first model.
- Use the kiosk script in `scripts/launch_kiosk.sh`; set
  `SYNRA_CHROME_GPU_MODE=software` only if Chromium fails to display.
