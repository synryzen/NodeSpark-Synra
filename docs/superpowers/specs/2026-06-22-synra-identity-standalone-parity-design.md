# Synra Identity Reliability And Standalone Parity Design

Date: 2026-06-22

## Goal

Make Synra identity, voice, face, camera, wake, and Apple/system voice behavior reliable and consistent across NodeSpark iOS, NodeSparkHub, Synra Standalone, and the Jetson station. This is the foundation work before adding more growth features, marketplace features, or new skills.

The priority is not a prettier enrollment screen by itself. The priority is that every visible button maps to a real device action, every action reports a trustworthy state, and each app can prove whether voice/face enrollment is genuinely usable on that device.

## Current Evidence

- NodeSpark iOS now has audits for identity enrollment, Apple voice parity, native media ownership, runtime sync, and iOS 27-safe Xcode launch schemes.
- NodeSpark iOS blocks WebContent camera/mic ownership and routes enrollment through native iOS capture.
- Synra Standalone docs report Jetson station drift: deployed station shell has reported `4.3.0` while local station package is `4.4.0`.
- Jetson exposes `/dev/video0` and `/dev/video1`, but Standalone vision remains diagnostic-only with no configured active camera device.
- Jetson wake/listen has reported ElevenLabs STT HTTP failures, including 500 and 401, so server transcription cannot be treated as healthy until telemetry proves it.
- Standalone identity readiness metadata exists, but the saved known user has recognition enabled with zero face samples and zero voiceprints.
- Synra AI on macOS is the quality reference: native-owned permissions, visible runtime recognition, live camera/mic readiness, local sample privacy, and clear enrollment coaching.

## Recommended Approach

Use a shared identity contract with platform-specific capture adapters.

Each surface should expose the same conceptual state:

- Permission state: camera, microphone, speech output.
- Device state: active device, unavailable device, degraded route, or blocked permission.
- Enrollment state: idle, requesting permission, previewing, recording, analyzing, accepted, retry needed, failed.
- Readiness state: owner exists, face ready, voice ready, trusted actions ready, overall score.
- Privacy state: local storage, no raw frame/audio telemetry, no secret leakage.

The apps can implement capture differently:

- NodeSpark iOS uses native AVFoundation/Vision/Speech-style capture and sends summarized state to the bundled Synra web runtime.
- NodeSparkHub uses macOS native capture and keeps Hub as the audit authority.
- Synra Standalone/Jetson uses browser/Electron/local station adapters for device selection, permission telemetry, camera frames, and STT fallback.

## Scope

### NodeSpark iOS

- Keep enrollment inside Synra settings, not covering the primary avatar stage.
- Keep WebContent media capture denied.
- Preserve native iOS enrollment actions for face and voice.
- Add or keep audits that fail if enrollment buttons become fake, if runtime bundles drift, or if Synra auto-opens on dashboard launch.
- Keep Apple voice selection parity with Hub settings.

### NodeSparkHub

- Treat Hub as the canonical identity/audit authority when paired devices report state.
- Add a narrow identity status endpoint or extend an existing Synra status response so Standalone and iOS can compare readiness using the same fields.
- Keep Slack/Telegram/workflow command execution out of this chunk except where identity confirmation status must be exposed.

### Synra Standalone

- Implement the Synra AI-style Smart Recognition panel as the canonical Standalone identity surface:
  - Runtime recognition status.
  - Camera ready/mic ready chips.
  - Face setup and voice setup cards.
  - Live enrollment coach.
  - Session progress and local storage/privacy chips.
- Add a real device diagnostics panel for microphone and camera.
- Add voice output selection for installed system voices when running on a platform that exposes speech synthesis voices.
- Keep Home Assistant and NodeSpark Command Center settings separate from identity setup.

### Jetson Station

- Redeploy station shell/assets so local and deployed versions match.
- Add configured camera device selection for `/dev/video0` or `/dev/video1`.
- Expose camera readiness through station health and Standalone UI.
- Treat server STT as degraded when credential failures occur, then fall back visibly to browser/local transcription if available.
- Add a station identity smoke check that reports camera device, microphone source, STT route, speaker route, and identity sample counts without exposing raw samples or secrets.

## User Experience

Enrollment should feel guided and honest:

- The user opens Synra settings, then Smart Recognition.
- Face enrollment first shows permission and camera readiness.
- The live coach says what is wrong: no face, more light, one face, centered, hold still, accepted.
- Voice enrollment first shows microphone permission and input level.
- The voice coach asks for three short phrases and scores level, background, and isolation.
- Accepted samples update readiness immediately.
- Failed samples explain what to fix.
- The final state shows local storage and trusted control readiness.

The main Synra stage remains clean. Enrollment should never obscure the primary avatar unless the user intentionally opens settings.

## Data And Privacy Rules

- Raw face frames and raw voice samples stay on the local device. This chunk does not add export, sync, or cloud upload for raw identity samples.
- Telemetry may include counts, readiness booleans, route names, device labels, and quality scores.
- Telemetry must not include camera frames, audio, API keys, access tokens, passwords, or private prompts.
- Risky actions remain gated by explicit confirmation, and identity readiness must not silently approve actions.

## Implementation Units

1. Shared identity contract audit
   - Define the required readiness/status keys.
   - Add audits for NodeSpark iOS, Hub, and Standalone responses.

2. Standalone Smart Recognition parity
   - Build or repair the UI panel to match the Synra AI flow.
   - Wire all buttons to real station/runtime actions.

3. Jetson camera/STT readiness
   - Add device selection and health reporting.
   - Add STT degraded/fallback telemetry.
   - Add station smoke checks.

4. Runtime sync and deployment
   - Build Standalone.
   - Deploy to Jetson.
   - Verify health endpoints, version parity, camera readiness, mic readiness, and UI status.

5. Cross-app verification
   - Run NodeSpark iOS audits.
   - Run Hub build/audits that are relevant to identity and Synra status.
   - Run Standalone typecheck/build/station tests.

## Testing

Required local checks:

- NodeSpark iOS Xcode 27 simulator and generic device builds.
- Existing NodeSpark Synra identity, Apple voice, runtime sync, media guard, and Xcode scheme audits.
- NodeSparkHub build or targeted compile for identity/status changes.
- Synra Standalone `npm run typecheck`, `npm run build`, and station tests.

Required Jetson checks:

- `/api/health` returns `ok: true`.
- Station version matches local package version.
- Camera health reports the selected device.
- Microphone health reports a usable source or explicit degraded state.
- STT health reports server, browser, local, or degraded fallback honestly.
- UI Smart Recognition shows camera/mic state and sample counts.

## Out Of Scope For This Chunk

- Marketplace.
- New paid vertical packs.
- New Slack/Telegram setup UI.
- Full predictive automation/process mining.
- Broad NodeSpark onboarding redesign.
- Real biometric authentication claims. The feature is owner-recognition style guidance, not Apple Face ID security.

## Success Criteria

- No enrollment button is decorative.
- NodeSpark iOS, Hub, and Standalone use the same readiness vocabulary.
- Standalone can report why voice/face enrollment is unavailable instead of pretending it is ready.
- Jetson deployment reports matching versions and real device readiness.
- Synra’s main visual stage remains clean, with enrollment in settings or a dedicated recognition panel.
- Builds and audits pass before calling the chunk complete.
