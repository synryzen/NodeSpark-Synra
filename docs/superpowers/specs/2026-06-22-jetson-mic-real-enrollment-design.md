# Jetson Mic And Real Enrollment Design

Date: 2026-06-22

## Goal

Make Synra Standalone and the Jetson Station move from truthful identity readiness reporting to real local enrollment readiness: microphone source configured, camera route verified, voice samples captured from an actual input path, face poses captured from an actual camera path, and Smart Recognition showing only evidence-backed progress.

## Current Evidence

- Synra Standalone is deployed on the Jetson at `192.168.1.165`.
- `synra-standalone.service`, `synra-jetson-station.service`, and `synra-electron-kiosk.service` are active.
- `/api/health` now includes `identitySmoke` from the Station API.
- Station camera route reports `ready` with configured device `/dev/video0`.
- Station STT route reports `ready` with provider `browser-fallback`.
- Station microphone route reports `not-configured` because `SYNRA_MICROPHONE_SOURCE` is unset.
- Identity sample counts are still face `0` and voice `0`.
- Existing Standalone browser enrollment can capture camera/mic through browser APIs, but Station health does not yet prove a usable Jetson microphone source or persist accepted sample counts into Station identity smoke.

## Scope

This chunk covers:

- Jetson microphone source discovery and configuration.
- Station microphone readiness that can distinguish usable source, missing source, unavailable audio stack, and capture failure.
- Standalone device diagnostics that show camera, mic, STT, speaker, and enrollment counts together.
- Real face and voice enrollment count updates only after quality checks pass.
- Deploying and verifying the updated Station and Standalone services on `192.168.1.165`.

This chunk does not cover:

- Marketplace, paid packs, marketing screenshots, or onboarding redesign.
- Apple Face ID secure biometric claims.
- Cloud sync or export of raw face/audio samples.
- Full local STT engine installation. Browser fallback remains acceptable if it is clearly reported.

## Architecture

Use the existing Station identity smoke contract as the truth boundary.

The Station owns device-route truth:

- Camera route: configured `/dev/video*`, detected devices, route status.
- Microphone route: configured source, detected sources, route status.
- STT route: provider, degraded error, route status.
- Identity counts: face sample count, voice sample count, no raw samples, no secrets.

Standalone owns guided enrollment UX:

- Smart Recognition reads `identitySmoke` from `/api/health`.
- Browser/Electron capture remains visible and permissioned.
- Accepted face and voice samples update local enrollment state.
- If running on the Jetson, accepted sample counts are mirrored into the Station identity smoke source through safe count-only persistence.

## Microphone Source Discovery

The Station should discover microphone sources in this order:

1. `SYNRA_MICROPHONE_SOURCE` from `~/.config/synra-jetson-station.env`.
2. PulseAudio or PipeWire source list from `pactl list short sources`.
3. ALSA capture devices from `arecord -l`.
4. No source found.

The Station should prefer non-monitor input sources. Monitor sources should be listed as detected but not selected automatically.

When a source is selected, `/station/identity-smoke` should return:

- `microphone.status: "ready"`
- `microphone.configuredSource: "<source id>"`
- `microphone.sources`: detected sources with `present` and `configured` flags.

When no usable source is selected, it should return:

- `microphone.status: "not-configured"` when sources exist but none are configured.
- `microphone.status: "unavailable"` when no input sources are visible.
- `microphone.status: "degraded"` when a configured source cannot be found or cannot be probed.

## Enrollment Count Persistence

The Station should persist safe identity count metadata only:

- `faceSampleCount`
- `voiceSampleCount`
- `updatedAt`

The persistence location should be `~/.config/synra-jetson-station-identity.json` by default, with an environment override for tests.

The Station must not persist:

- Raw camera frames.
- Raw microphone audio.
- Voice feature vectors.
- Face embeddings.
- API keys, tokens, or prompts.

Standalone should update Station identity counts only after its existing quality gates accept a sample:

- Face sample accepted by the guided face capture quality checks.
- Voice sample accepted by the guided voice quality checks.

## Station API Additions

Add a narrow count-only endpoint:

- `POST /station/identity-counts`

Request body:

```json
{
  "faceSampleCount": 1,
  "voiceSampleCount": 1
}
```

Rules:

- Counts are clamped to face `0...7` and voice `0...3`.
- Missing fields preserve the previous count.
- Response returns the updated `identitySmoke`.
- Request and response never contain raw samples or secrets.

## Standalone UI And Data Flow

The Smart Recognition panel should keep its current Synra AI-style layout and stay inside settings.

Data flow:

1. Standalone fetches `/api/health`.
2. `/api/health` includes Station `identitySmoke` when reachable.
3. `identityStatusFromStationHealth` updates Smart Recognition device routes and counts.
4. Guided enrollment captures a face or voice sample.
5. Existing quality checks accept or reject the sample.
6. Accepted samples update local Standalone state.
7. Standalone posts safe counts to `/station/identity-counts` through the local server.
8. `/api/health.identitySmoke` refresh confirms the persisted counts.

The user-visible rule is simple: the UI should not show enrolled or ready unless the count was accepted and refreshed from state.

## Diagnostics

Add or extend diagnostics so the user can see:

- Camera route status and configured device.
- Microphone route status and configured source.
- STT route status and provider.
- Speaker route status and provider.
- Face sample count.
- Voice sample count.
- Whether Station identity smoke is available.

For the current Jetson, the expected next-state target is:

- Camera: `ready`, `/dev/video0`.
- Microphone: `ready`, with the selected PulseAudio/PipeWire or ALSA source.
- STT: `ready`, `browser-fallback`.
- Face count: increases only after accepted face poses.
- Voice count: increases only after accepted voice samples.

## Error Handling

- If microphone discovery fails, Station reports `unavailable` with a non-secret error.
- If a configured microphone source is missing, Station reports `degraded`.
- If count persistence fails, Station returns an error and does not pretend counts were updated.
- If Standalone cannot reach the Station API, Smart Recognition keeps local state and marks Station identity smoke unavailable.
- If browser media permission is denied, enrollment explains the permission state and does not increment counts.
- If quality gates reject a sample, enrollment explains the retry reason and does not increment counts.

## Privacy Rules

- Identity smoke may include counts, route labels, device names, and quality summaries.
- Identity smoke must not include camera frames, audio, embeddings, voice feature vectors, tokens, credentials, or private prompts.
- Risky actions remain gated by explicit confirmation; identity readiness is not treated as a biometric authentication substitute.

## Testing

Local checks:

- Station unit tests for microphone source parsing.
- Station unit tests for identity count persistence and clamping.
- Station HTTP test for `/station/identity-counts`.
- Standalone audit that verifies Smart Recognition posts count-only updates after accepted enrollment.
- `npm run typecheck`
- `npm run audit:identity-contract`
- `npm run audit:cross-app-identity`
- `npm run station:test`
- `npm run build`

Jetson checks:

- Deploy Station and Standalone.
- Verify `synra-standalone.service`, `synra-jetson-station.service`, and `synra-electron-kiosk.service` are active.
- Verify `/api/health.identitySmoke.microphone.status` becomes `ready` after source selection.
- Verify `/station/identity-smoke` keeps `rawSamplesIncluded: false` and `secretsIncluded: false`.
- Perform one accepted face sample and confirm count increases without raw sample exposure.
- Perform one accepted voice sample and confirm count increases without raw sample exposure.

## Success Criteria

- Jetson microphone route no longer reports `not-configured` when a real source is available.
- Station identity smoke reports the selected microphone source without leaking secrets.
- Standalone enrollment increments counts only after accepted quality checks.
- Smart Recognition reflects refreshed Station identity counts.
- The main Synra stage remains clean; enrollment stays in settings.
- Local checks pass.
- Jetson deployment verifies active services and live identity smoke.
