# Synra 4.5 Identity And Wake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Synra voice, wake, face enrollment, and identity readiness reliable across NodeSpark, NodeSparkHub, Synra Standalone, and the Jetson runtime.

**Architecture:** Implement fast reliability fixes first, then add a shared identity contract that each platform adapter reports into. Swift apps keep native AVFoundation/Vision capture, Standalone keeps browser MediaDevices capture, and audits prevent contract drift.

**Tech Stack:** Swift, AVFoundation, Speech, Vision, TypeScript, Vite, Node audit scripts, Jetson systemd user services.

---

## File Structure

- Modify `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/NodeSpark Version 4.3/NodeSpark/Synra/NodeSparkSpeechTranscriber.swift` for the iOS final-candidate handoff.
- Modify `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone/src/main.ts` for STT routing, circuit breaker, health reporting, and guided identity status.
- Modify `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone/src/types.ts` for shared identity readiness fields.
- Create `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone/src/identity.ts` for reusable Standalone identity scoring.
- Create `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone/scripts/audit-identity-readiness.mjs` for identity contract checks.
- Create `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone/scripts/audit-stt-fallback.mjs` for STT fallback checks.
- Modify `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone/package.json` to expose new audits.
- Modify `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone/docs/jetson-findings.md` with current camera and version findings.
- Modify `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/NodeSparkHub Version 4.3/Tools/SynraWebModern/scripts/audit-synra-voice-session.mjs` only if the audit needs a behavior marker clearer than raw `onFinish(text)`.

## Task 1: Fix iOS Final Candidate Contract

**Files:**
- Modify: `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/NodeSpark Version 4.3/NodeSpark/Synra/NodeSparkSpeechTranscriber.swift`

- [ ] **Step 1: Verify the existing failing audit**

Run:

```bash
cd "/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/NodeSparkHub Version 4.3/Tools/SynraWebModern"
npm run audit:media
```

Expected: FAIL with `ios-transcriber-final-is-candidate`.

- [ ] **Step 2: Make the transcriber expose an explicit final-candidate handoff**

Add a focused helper in `NodeSparkSpeechTranscriber.swift`:

```swift
private func deliverFinalCandidate(_ text: String, onFinish: @escaping (String) -> Void) {
    onFinish(text)
}
```

Then replace the final line in `finish(with:onFinish:)` with:

```swift
deliverFinalCandidate(cleaned, onFinish: onFinish)
```

This preserves the current runtime behavior while giving the audit and future maintainers a named final-candidate boundary.

- [ ] **Step 3: Verify the audit passes**

Run:

```bash
cd "/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/NodeSparkHub Version 4.3/Tools/SynraWebModern"
npm run audit:media
npm run audit:voice-session
npm run eval:voice-long-utterance
```

Expected: all PASS.

## Task 2: Add Standalone STT Fallback Audit

**Files:**
- Create: `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone/scripts/audit-stt-fallback.mjs`
- Modify: `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone/package.json`

- [ ] **Step 1: Write the failing audit**

Create `scripts/audit-stt-fallback.mjs`:

```js
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const main = readFileSync(join(root, "src/main.ts"), "utf8");

const checks = {
  declaresSttCircuitBreaker: main.includes("serverTranscriptionFailureCount"),
  separatesOutputFromStt: main.includes("shouldUseServerTranscriptionForCommand"),
  hasServerFailureRecorder: main.includes("recordServerTranscriptionFailure"),
  hasServerSuccessReset: main.includes("recordServerTranscriptionSuccess"),
  fallsBackToBrowserListening: main.includes("startBrowserCommandListeningAfterServerFailure"),
  reportsServerSttState: main.includes("serverTranscriptionStatus")
};

const failed = Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name);
console.log(JSON.stringify({ ok: failed.length === 0, checks, failed }, null, 2));
if (failed.length) process.exit(1);
```

Add this package script:

```json
"audit:stt-fallback": "node scripts/audit-stt-fallback.mjs"
```

- [ ] **Step 2: Verify it fails**

Run:

```bash
cd "/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone"
npm run audit:stt-fallback
```

Expected: FAIL because the fallback functions are not implemented yet.

## Task 3: Implement Standalone STT Circuit Breaker

**Files:**
- Modify: `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone/src/main.ts`

- [ ] **Step 1: Add state and routing helpers**

Add near the wake-word state variables:

```ts
let serverTranscriptionFailureCount = 0;
let serverTranscriptionDisabledUntil = 0;
let serverTranscriptionStatus: "ready" | "degraded" | "unavailable" = "ready";

function serverTranscriptionBackoffActive(now = Date.now()): boolean {
  return serverTranscriptionDisabledUntil > now;
}

function recordServerTranscriptionSuccess(): void {
  serverTranscriptionFailureCount = 0;
  serverTranscriptionDisabledUntil = 0;
  serverTranscriptionStatus = "ready";
}

function recordServerTranscriptionFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error || "Server transcription failed.");
  serverTranscriptionFailureCount += 1;
  wakeWordLastError = message.slice(0, 120);
  if (serverTranscriptionFailureCount >= 2) {
    serverTranscriptionDisabledUntil = Date.now() + 120_000;
    serverTranscriptionStatus = "degraded";
  }
}

function canUseHealthyServerTranscription(): boolean {
  return canUseServerTranscription() && !serverTranscriptionBackoffActive();
}

function shouldUseServerTranscriptionForCommand(): boolean {
  return canUseHealthyServerTranscription() && state.voiceSettings.provider === "elevenLabs";
}

function shouldUseServerTranscriptionForWake(): boolean {
  return canUseHealthyServerTranscription() && (runtimeMode === "kiosk" || state.voiceSettings.provider === "elevenLabs");
}
```

- [ ] **Step 2: Route wake and command listening through healthy STT helpers**

Replace `shouldPreferServerTranscription()` command checks with `shouldUseServerTranscriptionForCommand()`. Replace wake checks with `shouldUseServerTranscriptionForWake()`. Keep `canUseServerTranscription()` as raw capability only.

- [ ] **Step 3: Add browser fallback after server command failure**

Add:

```ts
async function startBrowserCommandListeningAfterServerFailure(message: string): Promise<void> {
  const SpeechRecognitionCtor = speechRecognitionConstructor();
  if (!SpeechRecognitionCtor) {
    updateVoiceStatus("Listen degraded");
    setSynraState("idle", message);
    return;
  }
  updateVoiceStatus("Using browser speech");
  await startListening();
}
```

In `startServerTranscriptionListening`, call `recordServerTranscriptionSuccess()` after a valid server response and call `recordServerTranscriptionFailure(error)` in the catch block before falling back to browser listening.

- [ ] **Step 4: Add wake-loop degradation behavior**

In `startServerWakeWordListening`, call `recordServerTranscriptionSuccess()` after a successful server transcription. In the catch block, call `recordServerTranscriptionFailure(error)`. If backoff is active and browser speech recognition exists, stop server wake listening and restart the browser wake path.

- [ ] **Step 5: Report STT state in telemetry**

Add `serverTranscriptionStatus`, `serverTranscriptionFailureCount`, and `serverTranscriptionBackoffActive()` to the telemetry payload.

- [ ] **Step 6: Verify the audit passes**

Run:

```bash
cd "/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone"
npm run audit:stt-fallback
npm run typecheck
npm run build
```

Expected: all PASS.

## Task 4: Add Identity Readiness Contract

**Files:**
- Modify: `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone/src/types.ts`
- Create: `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone/src/identity.ts`
- Modify: `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone/src/main.ts`
- Create: `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone/scripts/audit-identity-readiness.mjs`
- Modify: `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone/package.json`

- [ ] **Step 1: Write the failing identity audit**

Create an audit that requires `SynraIdentityReadiness`, `FACE_ENROLLMENT_POSES`, `requiredFacePoseCount`, `requiredVoiceSampleCount`, and `identityReadiness` in settings/telemetry output.

- [ ] **Step 2: Add shared TypeScript contract**

Add to `src/types.ts`:

```ts
export type SynraFacePose = "center" | "turnLeft" | "turnRight" | "lookUp" | "lookDown" | "rollLeft" | "rollRight";

export interface SynraIdentityReadiness {
  faceSampleCount: number;
  voiceSampleCount: number;
  requiredFacePoseCount: number;
  requiredVoiceSampleCount: number;
  faceReady: boolean;
  voiceReady: boolean;
  overallReady: boolean;
}
```

- [ ] **Step 3: Add readiness scoring helper**

Create `src/identity.ts`:

```ts
import type { KnownUserProfile, SynraIdentityReadiness } from "./types";

export const FACE_ENROLLMENT_POSES = ["center", "turnLeft", "turnRight", "lookUp", "lookDown", "rollLeft", "rollRight"] as const;
export const REQUIRED_FACE_POSE_COUNT = FACE_ENROLLMENT_POSES.length;
export const REQUIRED_VOICE_SAMPLE_COUNT = 3;

export function identityReadinessForUser(user: KnownUserProfile | undefined): SynraIdentityReadiness {
  const faceSampleCount = user?.faceSamples?.length ?? 0;
  const voiceSampleCount = user?.voicePrints?.length ?? 0;
  const faceReady = faceSampleCount >= REQUIRED_FACE_POSE_COUNT;
  const voiceReady = voiceSampleCount >= REQUIRED_VOICE_SAMPLE_COUNT;
  return {
    faceSampleCount,
    voiceSampleCount,
    requiredFacePoseCount: REQUIRED_FACE_POSE_COUNT,
    requiredVoiceSampleCount: REQUIRED_VOICE_SAMPLE_COUNT,
    faceReady,
    voiceReady,
    overallReady: faceReady && voiceReady
  };
}
```

- [ ] **Step 4: Surface readiness in UI/health-safe payloads**

Import `identityReadinessForUser` in `src/main.ts`, calculate readiness for each known user, show readiness text in the known-user card, and include an aggregate `identityReadiness` object in public-safe settings/telemetry payloads without raw samples.

- [ ] **Step 5: Verify**

Run:

```bash
cd "/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone"
npm run audit:identity-readiness
npm run typecheck
npm run build
```

Expected: all PASS.

## Task 5: Jetson Docs And Version Parity

**Files:**
- Modify: `/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone/docs/jetson-findings.md`

- [ ] **Step 1: Update findings**

Document that the Jetson currently exposes `/dev/video0` and `/dev/video1`, that Standalone is `4.4.0`, and that the station shell reported `4.3.0`.

- [ ] **Step 2: Build station locally**

Run:

```bash
cd "/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone"
npm run station:typecheck
npm run station:test
npm run station:build
```

Expected: all PASS.

- [ ] **Step 3: Deploy only after local verification**

Use SSH key auth only. Do not print or store passwords. Restart the user services and verify `/api/health`, `/api/kiosk/health`, `/api/vision/public`, and package versions.

## Task 6: Cross-App Verification

**Files:**
- No new files.

- [ ] **Step 1: Verify Standalone**

Run:

```bash
cd "/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone"
npm run typecheck
npm run audit:hub-runtime
npm run audit:stt-fallback
npm run audit:identity-readiness
npm run build
```

- [ ] **Step 2: Verify Hub web runtime**

Run:

```bash
cd "/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/NodeSparkHub Version 4.3/Tools/SynraWebModern"
npm run typecheck
npm run audit:shared-runtime
npm run audit:devices
npm run audit:media
npm run audit:voice-session
npm run eval:voice-long-utterance
npm run build
```

- [ ] **Step 3: Verify native builds**

Run the Hub macOS and NodeSpark iOS simulator `xcodebuild` commands from the design report.

- [ ] **Step 4: Verify Jetson**

Run redacted SSH health checks for service status, app versions, camera device count, kiosk health, wake error, and STT state.

Expected: services active, camera devices visible, no fresh ElevenLabs 500 wake error after fallback, station version aligned, and identity readiness accurately reports missing enrollment until samples are captured.
