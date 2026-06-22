# Enrollment Proof Mode Design

Date: 2026-06-22

## Goal

Make Synra Standalone prove that face and voice enrollment work end-to-end: quality-accepted sample, local enrollment state update, count-only Station sync, refreshed `/api/health.identitySmoke`, and a clear Smart Recognition proof state in settings.

## Current Evidence

- Synra Standalone and Synra Jetson Station are deployed and running on `192.168.1.165`.
- `/api/health.identitySmoke` is available from Standalone and reports camera, microphone, STT, speaker, and identity counts.
- The Jetson reports:
  - Camera: `ready`, configured `/dev/video0`.
  - Microphone: `ready`, configured `alsa_input.usb-EMEET_EMEET_SmartCam_S600_A260414000306221-02.analog-stereo`.
  - STT: `ready`, provider `browser-fallback`.
  - Speaker: `ready`.
  - Face count: `0`.
  - Voice count: `0`.
  - `rawSamplesIncluded: false`.
  - `secretsIncluded: false`.
- Standalone now calls `/api/station/identity-counts` after accepted face or voice samples.
- The count sync path has tests/audits proving it sends count metadata only, not raw face samples, audio blobs, voice prints, or tokens.

## Scope

This chunk covers:

- A Smart Recognition Proof panel in Synra Standalone settings.
- Live proof rows for device routes, last accepted sample, count sync, and Station health refresh.
- A safe "Verify Sync" action that posts the currently reported counts back through the existing count-only proxy and confirms Station health refresh without creating fake enrollment.
- Stronger audits so "Enroll Face" and "Enroll Voice" cannot silently regress back to buttons that appear to work but do not update proof state.
- Jetson deployment and live verification.

This chunk does not cover:

- Changing NodeSpark iOS or NodeSparkHub UI yet.
- Claiming Apple Face ID or biometric secure enclave equivalence.
- Adding raw camera/audio storage to Station.
- Installing a new local STT backend.
- Redesigning the main Synra stage. Enrollment proof stays in settings.

## Design Choice

Use the existing Smart Recognition settings area as the proof surface.

I considered three approaches:

1. Add a separate diagnostics page.
   - Pro: lots of room.
   - Con: the user has to leave enrollment to understand whether enrollment worked.

2. Add proof chips directly to the main Synra stage.
   - Pro: highly visible.
   - Con: risks covering or cluttering Synra, which the user specifically does not want.

3. Add a compact Proof panel inside Smart Recognition settings.
   - Pro: close to enrollment, does not cover Synra, uses the current Synra AI-style identity area.
   - Con: less room than a full diagnostics page.

Chosen approach: option 3. It gives immediate evidence where the enrollment controls live while keeping the primary Synra stage clean.

## User Experience

The Known Users settings panel keeps its current layout:

- Guided identity setup launcher.
- Runtime Recognition panel.
- Device chips.
- Smart Recognition setup cards.
- Live Enrollment Coach.
- Enrollment form and buttons.

Add a new `Enrollment Proof` section inside the Smart Recognition shell, after the Live Enrollment Coach and before the session checks.

The proof section shows concise state, not explanatory marketing copy:

- `Station`: Connected, Unavailable, or Degraded.
- `Camera`: Ready, Setup, Degraded, or Unavailable.
- `Mic`: Ready, Setup, Degraded, or Unavailable.
- `Face`: `0/7` through `7/7`, with last accepted time when present.
- `Voice`: `0/3` through `3/3`, with last accepted time when present.
- `Sync`: Confirmed, Pending, Failed, or Not Tested.

The panel includes one button:

- `Verify Sync`

`Verify Sync` posts the current `state.identityStatus.faceSampleCount` and `state.identityStatus.voiceSampleCount` through `/api/station/identity-counts`, then refreshes `/api/health`. Because it posts the same counts already reported by Station, it proves the proxy and Station write path without inventing fake face or voice enrollment.

## Data Model

Add a browser-only proof state near the existing identity state in `src/main.ts`.

Fields:

- `lastHealthAt: string | null`
- `lastFaceAcceptedAt: string | null`
- `lastVoiceAcceptedAt: string | null`
- `lastSyncAttemptAt: string | null`
- `lastSyncConfirmedAt: string | null`
- `lastSyncError: string | null`
- `lastSyncedFaceSampleCount: number`
- `lastSyncedVoiceSampleCount: number`
- `stationAvailable: boolean`

This state is UI evidence only. It must not contain raw image data, audio blobs, voice prints, face pose maps, API keys, prompts, or tokens.

No new persistence is required for proof state in this chunk. On restart, proof state is rebuilt from `/api/health.identitySmoke` and future accepted samples.

## Data Flow

### Health Refresh

1. Standalone fetches `/api/health`.
2. If `identitySmoke` exists, `refreshSmartRecognitionFromHealth` updates the existing Smart Recognition state.
3. Proof state records `lastHealthAt`, `stationAvailable: true`, device routes, and current face/voice counts.
4. If health is unavailable, proof state records `stationAvailable: false` and preserves the last local accepted sample times.

### Accepted Face Sample

1. User captures a face pose.
2. Existing face quality checks run.
3. If rejected, proof state does not increment and the reason remains in the existing coach/status text.
4. If accepted, Standalone updates `pendingFacePoseSamples`.
5. Proof state records `lastFaceAcceptedAt`.
6. Standalone calls `syncStationIdentityCounts`.
7. A successful response or follow-up health refresh confirms counts and records `lastSyncConfirmedAt`.
8. The Proof panel shows `Sync: Confirmed` only when refreshed Station counts are at least the expected accepted counts.

### Accepted Voice Sample

1. User records a voice sample.
2. Existing voice quality checks run.
3. If rejected, proof state does not increment.
4. If accepted, Standalone updates `pendingVoicePrints`.
5. Proof state records `lastVoiceAcceptedAt`.
6. Standalone calls `syncStationIdentityCounts`.
7. Refreshed Station health confirms counts.

### Verify Sync

1. User presses `Verify Sync`.
2. Standalone posts the current Station-reported face and voice counts through `/api/station/identity-counts`.
3. Standalone refreshes `/api/health`.
4. If Station returns the same counts and redaction flags remain false, proof state records `lastSyncConfirmedAt`.
5. If unavailable or mismatched, proof state records `lastSyncError`.

## Error Handling

- If `/api/health` is unavailable, the Proof panel shows Station unavailable and does not claim enrollment is confirmed.
- If `/api/station/identity-counts` fails, local enrollment remains saved, but Proof shows Sync failed.
- If Station returns lower counts than expected after an accepted sample, Proof shows Pending or Failed instead of Confirmed.
- If Station identity smoke contains `rawSamplesIncluded: true` or `secretsIncluded: true`, Proof shows Degraded and the audit should fail during development.
- If a media permission or quality gate rejects a sample, Proof does not update accepted sample timestamps.

## Privacy Rules

- Proof state may show counts, route statuses, provider labels, timestamps, and safe error summaries.
- Proof state must not include raw camera frames, data URLs, audio blobs, voice prints, face pose maps, embeddings, tokens, credentials, prompts, or raw request bodies.
- The Verify Sync action posts only numeric counts.
- The UI must not describe this as biometric authentication. It is local enrollment readiness evidence.

## Testing And Audits

Add `scripts/audit-enrollment-proof-mode.mjs`.

The audit should verify:

- The UI contains an `Enrollment Proof` section inside Smart Recognition settings.
- Required element ids exist:
  - `recognitionProofStationStatus`
  - `recognitionProofCameraStatus`
  - `recognitionProofMicStatus`
  - `recognitionProofFaceStatus`
  - `recognitionProofVoiceStatus`
  - `recognitionProofSyncStatus`
  - `recognitionProofVerifyButton`
- `refreshSmartRecognitionHealth` updates proof state from `/api/health`.
- `syncStationIdentityCounts` updates proof state on attempt, success, and failure.
- Accepted face and voice sample paths record proof timestamps only after quality acceptance.
- `verifyEnrollmentProofSync` posts only count fields.
- The proof sync code does not reference forbidden raw enrollment terms in its payload-building section:
  - `faceSamples`
  - `facePoseSamples`
  - `pendingFacePoseSamples`
  - `voicePrints`
  - `pendingVoicePrints`
  - `dataUrl`
  - `blob`
  - `token`

Run local gates:

- `npm run typecheck`
- `npm run audit:identity-contract`
- `npm run audit:cross-app-identity`
- `npm run audit:station-identity-counts`
- `npm run audit:enrollment-proof`
- `npm run station:test`
- `npm run build`

## Deployment Verification

After deployment to the Jetson:

1. Restart `synra-standalone.service`, `synra-jetson-station.service`, and `synra-electron-kiosk.service` with `systemctl --user`.
2. Verify all three services are active.
3. Verify `/api/health.identitySmoke` reports Station available, camera ready, mic ready, STT ready, and redaction flags false.
4. Press `Verify Sync` in settings and confirm the Proof panel shows Sync confirmed without changing counts.
5. Capture one real accepted face or voice sample from the UI and confirm the count increases only after acceptance.

## Success Criteria

- The user can look at Smart Recognition settings and immediately see whether face/voice enrollment has real evidence behind it.
- `Enroll Face` and `Enroll Voice` no longer feel like silent buttons because every accepted sample produces proof state or a visible sync failure.
- Verify Sync proves the Station count path without fake enrollment.
- The main Synra stage remains clean.
- Local audits, typecheck, Station tests, and build pass.
- Jetson health confirms camera, mic, STT, speaker, counts, and redaction flags.
