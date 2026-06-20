# Synra 4.5 Identity And Wake Design

## Purpose

Synra 4.5 makes NodeSpark, NodeSparkHub, and Synra Standalone behave like one product instead of three loosely similar Synra surfaces. The priority is identity and voice reliability: guided face enrollment, guided voice enrollment, wake/listen fallback, Jetson camera readiness, and removal of duplicate recognition logic where practical.

## Current Failures

- NodeSpark iOS fails the voice-session audit because the transcriber final-candidate contract no longer exposes the expected `onFinish(text)` behavior.
- Synra Standalone on Jetson is healthy at the service level but degraded at the wake/listen level because ElevenLabs speech-to-text returned HTTP 500 and kiosk mode still prefers server transcription when an ElevenLabs key is configured.
- Jetson sees `/dev/video0` and `/dev/video1`, but no camera is configured for real capture through the public vision endpoint.
- The saved Jetson known user has recognition enabled but no face samples and no voiceprints, so identity readiness is not real.
- Hub, NodeSpark iOS, Synra Standalone, and the working Synra AI reference each contain separate face and voice enrollment logic.
- Standalone and iOS have large files that mix UI, transport, wake, settings, and recognition behavior, making regressions more likely.

## Apple Platform Constraint

Apple does not expose Face ID enrollment templates, Secure Enclave biometric matching, or the iPhone Face ID enrollment pipeline to third-party apps. Synra 4.5 will build a Face ID-quality guided enrollment experience using public frameworks only: AVFoundation, Vision, LocalAuthentication for device authentication gates, TrueDepth where available, clear permission surfaces, liveness-style quality checks, pose coverage, lighting guidance, and explicit storage controls.

## Recommended Architecture

Synra 4.5 uses a shared identity contract and platform-specific capture adapters.

- Shared contract: enrollment session state, face signal, voice signal, pose coverage, phrase coverage, readiness scoring, privacy/storage settings, and error categories.
- macOS Hub adapter: AVFoundation and Vision capture, upgraded from single-sample metadata capture into live guided enrollment.
- iOS adapter: extracted from `SynraMobileBridge.swift` into focused identity files, using the same shared state names and readiness semantics.
- Standalone browser adapter: MediaDevices-based capture with the same state contract; no raw face or voice data is sent to the model context.
- Jetson adapter: explicit camera device selection, server transcription fallback policy, and station version parity checks.

## Identity Enrollment Behavior

Face enrollment must be a visible, permissioned flow with live feedback:

- Require camera permission before capture starts.
- Show one face only, centered, well lit, unobstructed, and stable.
- Walk through seven poses: center, turn left, turn right, look up, look down, roll left, and roll right.
- Score each pose for capture quality, face size, center offset, stability, and landmarks.
- Allow retake/cancel and never silently capture frames in the background.
- Store only explicit enrollment data and safe metadata; raw sample storage must remain user-visible and controlled.

Voice enrollment must be a visible, permissioned flow with live feedback:

- Require microphone permission before recording starts.
- Use phrase prompts and progress timing instead of one opaque recording button.
- Track peak level, speech coverage, background noise, clipping, and sample count.
- Allow cancel/retake.
- Keep voice matching off until enough enrolled samples exist.

## Wake And Transcription Behavior

Synra must not let a single remote speech-to-text failure make kiosk voice feel broken.

- Separate output voice provider from speech-to-text provider.
- Add a server STT circuit breaker for repeated HTTP 5xx, empty transcript, timeout, or malformed response failures.
- Fall back to browser/local transcription when available.
- Surface degraded voice state in the UI and health payload.
- Keep wake microphone state visible and user-controlled.

## Cross-App UI Direction

All apps should expose a Synra Identity surface that feels consistent:

- Readiness summary for face, voice, and wake/listen.
- Guided enrollment wizard for face and voice.
- Device selector/status for microphone and camera.
- Privacy/storage controls near enrollment actions.
- Clear degraded state when Jetson STT or camera configuration is broken.

The UI should remain app-native where appropriate. Hub and NodeSpark can use native Swift surfaces for OS permissions and capture. Standalone can use browser UI for kiosk and desktop use, but the state model and copy should match.

## Deduplication Boundaries

The first deduplication target is behavior and state, not a forced single binary library across Swift and TypeScript.

- Share names, JSON contracts, readiness rules, audit expectations, and test fixtures across apps.
- Extract large mixed files into focused modules when modifying them.
- Keep platform capture code native to each platform.
- Prevent drift with audits that compare contract keys, readiness thresholds, version numbers, and fallback policies.

## Implementation Phases

### Phase 1: Reliability Fixes

- Fix the NodeSpark iOS transcriber final-candidate contract.
- Add Standalone STT provider routing, server failure circuit breaker, and fallback behavior.
- Add tests/audits for wake fallback.
- Align Jetson station version with local Standalone station code.

### Phase 2: Identity Core Contract

- Add shared identity contract docs and test fixtures.
- Add readiness scoring helpers for face and voice.
- Make Hub, NodeSpark iOS, and Standalone report identity readiness through the same fields.

### Phase 3: Guided Enrollment

- Upgrade Hub native enrollment to live guided face and voice sessions.
- Extract NodeSpark iOS recognition from the mobile bridge into focused files.
- Upgrade Standalone Users panel into a guided identity flow.

### Phase 4: Jetson Camera And Deployment

- Update Jetson camera docs with current device reality.
- Add configured camera detection and visible enrollment readiness.
- Deploy and verify the remote Jetson services without exposing secrets.

### Phase 5: Final Verification

- Run web typecheck/build/audits.
- Run Standalone typecheck/build/runtime/station tests.
- Run Hub macOS build.
- Run NodeSpark iOS simulator build.
- Verify Jetson health, kiosk health, camera status, wake fallback state, and identity readiness.

## Testing Strategy

- TDD for every behavior change.
- Unit tests for STT fallback routing and circuit breaker behavior.
- Audits for iOS transcriber final-candidate contract, identity readiness schema, no stale Jetson station version, and no duplicate scoring constants.
- Fixture tests for face and voice readiness scoring.
- Build verification for all affected apps.
- Remote smoke checks on Jetson after deployment.

## Out Of Scope For This Pass

- Accessing Apple private Face ID templates or replacing Secure Enclave biometric matching.
- Silent background face or voice capture.
- Sending raw credentials, tokens, face samples, or voice samples to model context.
- Rewriting all app UI unrelated to Synra identity, wake/listen, and device readiness.

## Approval

The user approved the broad direction with: "Do it all!!" This document converts the approved direction into the implementation scope for Synra 4.5.
