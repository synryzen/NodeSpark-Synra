# Synra Identity Standalone Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Synra identity readiness, voice, face, camera, STT, and local privacy state trustworthy across Synra Standalone, Jetson Station, NodeSpark iOS, and NodeSparkHub.

**Architecture:** Add a shared identity status contract in Synra Standalone, expose real station device/STT readiness through Jetson Station health, and make the Standalone Smart Recognition panel render from that contract. Keep platform capture adapters separate: browser/Jetson station for Standalone, existing native capture for NodeSpark iOS, and Hub status/audit endpoints for NodeSparkHub.

**Tech Stack:** TypeScript, Vite, Node HTTP server, Electron station shell, Swift/SwiftUI audits for NodeSpark/Hub integration points, Jetson HTTP health checks.

---

## File Structure

- Create `src/identity-contract.ts`: Shared browser-side identity status types and normalization helpers.
- Create `scripts/audit-identity-contract.mjs`: Static audit that verifies contract fields and Smart Recognition wiring.
- Modify `src/types.ts`: Add station identity/device/STT contract types used by `main.ts`.
- Modify `src/main.ts`: Render Smart Recognition from the shared status, fetch station health, and wire enroll/test buttons to real state transitions.
- Modify `src/styles.css`: Polish the Smart Recognition panel only where the existing CSS cannot express the new states.
- Modify `tools/SynraJetsonStation/src/types.ts`: Add camera device, microphone device, STT, and identity smoke-check types to station health.
- Modify `tools/SynraJetsonStation/src/camera.ts`: Detect `/dev/video*`, select a configured device, and report readiness honestly.
- Modify `tools/SynraJetsonStation/src/microphone.ts`: Report microphone source readiness and explicit degraded state.
- Modify `tools/SynraJetsonStation/src/health.ts`: Include camera device, microphone, STT route, and identity smoke-check state.
- Modify `tools/SynraJetsonStation/src/station-server.ts`: Add `/station/identity-smoke` and include richer health payloads.
- Create `tools/SynraJetsonStation/tests/identity-smoke.test.mjs`: Node test for redaction-safe identity smoke output.
- Modify `package.json` and `tools/SynraJetsonStation/package.json`: Add audit/test scripts for the new checks.
- Modify `docs/jetson-findings.md`: Update version drift, camera, STT, and identity readiness notes after deploy.
- Modify NodeSpark collection scripts only if cross-app contract audits need to reference NodeSpark iOS or Hub source.

---

### Task 1: Add The Shared Identity Contract

**Files:**
- Create: `src/identity-contract.ts`
- Modify: `package.json`
- Create: `scripts/audit-identity-contract.mjs`

- [ ] **Step 1: Write the static audit**

Create `scripts/audit-identity-contract.mjs`:

```js
#!/usr/bin/env node
import fs from "node:fs";

const contract = fs.readFileSync("src/identity-contract.ts", "utf8");
const main = fs.readFileSync("src/main.ts", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

const requiredContractTokens = [
  "SynraIdentityPermissionState",
  "SynraIdentityDeviceState",
  "SynraIdentityEnrollmentPhase",
  "SynraIdentityReadinessStatus",
  "normalizeIdentityStatus",
  "defaultIdentityStatus",
  "rawSamplesStored: false",
  "rawSamplesLeaveDevice: false"
];

const requiredMainTokens = [
  "normalizeIdentityStatus",
  "renderSmartRecognition",
  "identityFaceSetupButton",
  "identityVoiceSetupButton",
  "recognitionRuntimeConfidence",
  "recognitionSessionCheckThree"
];

const checks = {
  contractFields: requiredContractTokens.every((token) => contract.includes(token)),
  mainWiring: requiredMainTokens.every((token) => main.includes(token)),
  packageScript: pkg.scripts?.["audit:identity-contract"] === "node scripts/audit-identity-contract.mjs"
};

console.log(JSON.stringify({ ok: Object.values(checks).every(Boolean), checks }, null, 2));
if (!Object.values(checks).every(Boolean)) process.exit(1);
```

- [ ] **Step 2: Run audit to verify it fails**

Run:

```bash
node scripts/audit-identity-contract.mjs
```

Expected: failure because `src/identity-contract.ts` does not exist and the package script is not present.

- [ ] **Step 3: Add contract implementation**

Create `src/identity-contract.ts`:

```ts
import { REQUIRED_FACE_POSE_COUNT, REQUIRED_VOICE_SAMPLE_COUNT } from "./identity";
import type { SynraFacePose } from "./types";

export type SynraIdentityPermissionState = "unknown" | "ready" | "requesting" | "denied" | "unavailable";
export type SynraIdentityDeviceState = "ready" | "active" | "degraded" | "permission-needed" | "not-configured" | "unavailable";
export type SynraIdentityEnrollmentPhase = "idle" | "requesting-permission" | "previewing" | "recording" | "analyzing" | "accepted" | "retry" | "failed";

export interface SynraIdentityEnrollmentStatus {
  phase: SynraIdentityEnrollmentPhase;
  title: string;
  detail: string;
  progress: number;
  score: number;
  checks: string[];
}

export interface SynraIdentityReadinessStatus {
  ownerReady: boolean;
  faceReady: boolean;
  voiceReady: boolean;
  trustedActionsReady: boolean;
  overallScore: number;
  confidence: number;
  lastVerifiedAt: string | null;
  source: string;
  summary: string;
}

export interface SynraIdentityStatus {
  generatedAt: string;
  cameraPermission: SynraIdentityPermissionState;
  microphonePermission: SynraIdentityPermissionState;
  cameraDevice: SynraIdentityDeviceState;
  microphoneDevice: SynraIdentityDeviceState;
  sttRoute: SynraIdentityDeviceState;
  speakerRoute: SynraIdentityDeviceState;
  faceSampleCount: number;
  voiceSampleCount: number;
  requiredFacePoseCount: number;
  requiredVoiceSampleCount: number;
  completedFacePoses: SynraFacePose[];
  missingFacePoses: SynraFacePose[];
  face: SynraIdentityEnrollmentStatus;
  voice: SynraIdentityEnrollmentStatus;
  readiness: SynraIdentityReadinessStatus;
  privacy: {
    rawSamplesStored: false;
    rawSamplesLeaveDevice: false;
    telemetryContainsRawFrames: false;
    telemetryContainsRawAudio: false;
  };
}

export const defaultIdentityStatus: SynraIdentityStatus = {
  generatedAt: new Date(0).toISOString(),
  cameraPermission: "unknown",
  microphonePermission: "unknown",
  cameraDevice: "not-configured",
  microphoneDevice: "not-configured",
  sttRoute: "not-configured",
  speakerRoute: "ready",
  faceSampleCount: 0,
  voiceSampleCount: 0,
  requiredFacePoseCount: REQUIRED_FACE_POSE_COUNT,
  requiredVoiceSampleCount: REQUIRED_VOICE_SAMPLE_COUNT,
  completedFacePoses: [],
  missingFacePoses: ["center", "turnLeft", "turnRight", "lookUp", "lookDown", "rollLeft", "rollRight"],
  face: {
    phase: "idle",
    title: "Face setup waiting",
    detail: "Capture seven local face poses.",
    progress: 0,
    score: 0,
    checks: ["Permission waiting", "Quality waiting", "Stored locally"]
  },
  voice: {
    phase: "idle",
    title: "Voice setup waiting",
    detail: "Record three clean owner voice samples.",
    progress: 0,
    score: 0,
    checks: ["Mic waiting", "Isolation waiting", "Stored locally"]
  },
  readiness: {
    ownerReady: false,
    faceReady: false,
    voiceReady: false,
    trustedActionsReady: false,
    overallScore: 0,
    confidence: 0,
    lastVerifiedAt: null,
    source: "standalone",
    summary: "Identity setup has not started."
  },
  privacy: {
    rawSamplesStored: false,
    rawSamplesLeaveDevice: false,
    telemetryContainsRawFrames: false,
    telemetryContainsRawAudio: false
  }
};

export function normalizeIdentityStatus(input: Partial<SynraIdentityStatus> | undefined): SynraIdentityStatus {
  const merged = { ...defaultIdentityStatus, ...(input ?? {}) };
  const faceSampleCount = clampCount(merged.faceSampleCount, merged.requiredFacePoseCount);
  const voiceSampleCount = clampCount(merged.voiceSampleCount, merged.requiredVoiceSampleCount);
  const faceReady = faceSampleCount >= merged.requiredFacePoseCount;
  const voiceReady = voiceSampleCount >= merged.requiredVoiceSampleCount;
  const overallScore = clampUnit((faceSampleCount / merged.requiredFacePoseCount + voiceSampleCount / merged.requiredVoiceSampleCount) / 2);
  return {
    ...merged,
    faceSampleCount,
    voiceSampleCount,
    readiness: {
      ...merged.readiness,
      faceReady,
      voiceReady,
      overallScore,
      confidence: clampUnit(merged.readiness.confidence)
    },
    privacy: defaultIdentityStatus.privacy
  };
}

function clampCount(value: number, max: number): number {
  return Math.max(0, Math.min(Number.isFinite(value) ? Math.floor(value) : 0, max));
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(Number.isFinite(value) ? value : 0, 1));
}
```

- [ ] **Step 4: Add package script**

Update `package.json` scripts:

```json
"audit:identity-contract": "node scripts/audit-identity-contract.mjs"
```

- [ ] **Step 5: Run typecheck and audit**

Run:

```bash
npm run typecheck
node scripts/audit-identity-contract.mjs
```

Expected: typecheck passes; audit still fails only if `main.ts` does not yet import/render the contract.

- [ ] **Step 6: Commit**

```bash
git add src/identity-contract.ts scripts/audit-identity-contract.mjs package.json
git commit -m "Add Synra identity status contract"
```

---

### Task 2: Render Standalone Smart Recognition From The Contract

**Files:**
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Test: `scripts/audit-identity-contract.mjs`

- [ ] **Step 1: Add imports and state**

In `src/main.ts`, extend imports:

```ts
import { defaultIdentityStatus, normalizeIdentityStatus, type SynraIdentityStatus } from "./identity-contract";
```

Add to the app state object:

```ts
identityStatus: normalizeIdentityStatus(defaultIdentityStatus),
```

- [ ] **Step 2: Add renderer**

Add this function near other render helpers in `src/main.ts`:

```ts
function renderSmartRecognition(status: SynraIdentityStatus = state.identityStatus): void {
  const normalized = normalizeIdentityStatus(status);
  state.identityStatus = normalized;

  recognitionRuntimeStatusEl.textContent = normalized.readiness.trustedActionsReady ? "Owner Verified" : "Ready To Verify";
  recognitionRuntimeConfidenceEl.textContent = `${Math.round(normalized.readiness.confidence * 100)}%`;
  recognitionRuntimeLastVerifiedEl.textContent = normalized.readiness.lastVerifiedAt
    ? new Date(normalized.readiness.lastVerifiedAt).toLocaleString()
    : "Never";
  recognitionRuntimeSourceEl.textContent = normalized.readiness.source || "Inactive";
  recognitionRuntimeDetailEl.textContent = normalized.readiness.summary;

  recognitionCameraStatusChipEl.textContent = `Camera: ${identityDeviceLabel(normalized.cameraDevice)}`;
  recognitionMicStatusChipEl.textContent = `Mic: ${identityDeviceLabel(normalized.microphoneDevice)}`;
  recognitionDeviceCameraEl.classList.toggle("is-ready", normalized.cameraDevice === "ready" || normalized.cameraDevice === "active");
  recognitionDeviceMicrophoneEl.classList.toggle("is-ready", normalized.microphoneDevice === "ready" || normalized.microphoneDevice === "active");
  recognitionDeviceFaceStorageEl.classList.toggle("is-ready", normalized.faceSampleCount > 0);
  recognitionDeviceVoiceMatchEl.classList.toggle("is-ready", normalized.voiceSampleCount >= normalized.requiredVoiceSampleCount);
  recognitionDeviceTrustedControlEl.classList.toggle("is-ready", normalized.readiness.trustedActionsReady);

  recognitionFaceSetupStatusEl.textContent = `${normalized.faceSampleCount}/${normalized.requiredFacePoseCount}`;
  recognitionFaceCoachTitleEl.textContent = normalized.face.title;
  recognitionFaceCoachDetailEl.textContent = normalized.face.detail;
  recognitionFaceProgressLabelEl.textContent = normalized.face.title;
  recognitionFaceProgressDetailEl.textContent = `${normalized.faceSampleCount}/${normalized.requiredFacePoseCount} face poses. ${normalized.face.detail}`;

  recognitionVoiceSetupStatusEl.textContent = `${normalized.voiceSampleCount}/${normalized.requiredVoiceSampleCount}`;
  recognitionVoiceCoachTitleEl.textContent = normalized.voice.title;
  recognitionVoiceCoachDetailEl.textContent = normalized.voice.detail;
  recognitionVoiceProgressLabelEl.textContent = normalized.voice.title;
  recognitionVoiceProgressDetailEl.textContent = `${normalized.voiceSampleCount}/${normalized.requiredVoiceSampleCount} voice samples. ${normalized.voice.detail}`;

  recognitionCoachStatusEl.textContent = normalized.face.phase === "accepted" || normalized.voice.phase === "accepted"
    ? "Sample accepted"
    : "Waiting";
  recognitionSessionCheckOneEl.textContent = normalized.face.checks[0] ?? "Permission waiting";
  recognitionSessionCheckTwoEl.textContent = normalized.voice.checks[1] ?? "Quality waiting";
  recognitionSessionCheckThreeEl.textContent = "Stored locally";
}

function identityDeviceLabel(state: SynraIdentityStatus["cameraDevice"]): string {
  switch (state) {
    case "ready": return "Ready";
    case "active": return "Active";
    case "degraded": return "Degraded";
    case "permission-needed": return "Permission";
    case "not-configured": return "Setup";
    default: return "Unavailable";
  }
}
```

- [ ] **Step 3: Wire existing elements**

If element constants do not already exist, define them near other DOM constants:

```ts
const recognitionRuntimeStatusEl = requiredElement("recognitionRuntimeStatus");
const recognitionRuntimeConfidenceEl = requiredElement("recognitionRuntimeConfidence");
const recognitionRuntimeLastVerifiedEl = requiredElement("recognitionRuntimeLastVerified");
const recognitionRuntimeSourceEl = requiredElement("recognitionRuntimeSource");
const recognitionRuntimeDetailEl = requiredElement("recognitionRuntimeDetail");
const recognitionCameraStatusChipEl = requiredElement("recognitionCameraStatusChip");
const recognitionMicStatusChipEl = requiredElement("recognitionMicStatusChip");
const recognitionDeviceCameraEl = requiredElement("recognitionDeviceCamera");
const recognitionDeviceMicrophoneEl = requiredElement("recognitionDeviceMicrophone");
const recognitionDeviceFaceStorageEl = requiredElement("recognitionDeviceFaceStorage");
const recognitionDeviceVoiceMatchEl = requiredElement("recognitionDeviceVoiceMatch");
const recognitionDeviceTrustedControlEl = requiredElement("recognitionDeviceTrustedControl");
const recognitionFaceSetupStatusEl = requiredElement("recognitionFaceSetupStatus");
const recognitionFaceCoachTitleEl = requiredElement("recognitionFaceCoachTitle");
const recognitionFaceCoachDetailEl = requiredElement("recognitionFaceCoachDetail");
const recognitionVoiceSetupStatusEl = requiredElement("recognitionVoiceSetupStatus");
const recognitionVoiceCoachTitleEl = requiredElement("recognitionVoiceCoachTitle");
const recognitionVoiceCoachDetailEl = requiredElement("recognitionVoiceCoachDetail");
const recognitionCoachStatusEl = requiredElement("recognitionCoachStatus");
const recognitionFaceProgressLabelEl = requiredElement("recognitionFaceProgressLabel");
const recognitionFaceProgressDetailEl = requiredElement("recognitionFaceProgressDetail");
const recognitionVoiceProgressLabelEl = requiredElement("recognitionVoiceProgressLabel");
const recognitionVoiceProgressDetailEl = requiredElement("recognitionVoiceProgressDetail");
const recognitionSessionCheckOneEl = requiredElement("recognitionSessionCheckOne");
const recognitionSessionCheckTwoEl = requiredElement("recognitionSessionCheckTwo");
const recognitionSessionCheckThreeEl = requiredElement("recognitionSessionCheckThree");
```

- [ ] **Step 4: Call renderer at startup and after identity changes**

Call:

```ts
renderSmartRecognition();
```

after initial state hydration and after any face/voice enrollment mutation.

- [ ] **Step 5: Run checks**

Run:

```bash
npm run typecheck
npm run audit:identity-contract
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/styles.css scripts/audit-identity-contract.mjs package.json
git commit -m "Render Smart Recognition from identity contract"
```

---

### Task 3: Add Jetson Station Device And STT Health

**Files:**
- Modify: `tools/SynraJetsonStation/src/types.ts`
- Modify: `tools/SynraJetsonStation/src/camera.ts`
- Modify: `tools/SynraJetsonStation/src/microphone.ts`
- Modify: `tools/SynraJetsonStation/src/health.ts`

- [ ] **Step 1: Extend station types**

Add to `tools/SynraJetsonStation/src/types.ts`:

```ts
export interface StationCameraDevice {
  path: string;
  present: boolean;
  configured: boolean;
}

export interface StationAudioDevice {
  id: string;
  label: string;
  present: boolean;
  configured: boolean;
}

export type StationRouteStatus = "ready" | "degraded" | "not-configured" | "unavailable";

export interface StationIdentitySmoke {
  ok: boolean;
  camera: { status: StationRouteStatus; configuredDevice: string | null; devices: StationCameraDevice[] };
  microphone: { status: StationRouteStatus; configuredSource: string | null; sources: StationAudioDevice[] };
  stt: { status: StationRouteStatus; provider: string; lastError: string | null };
  speaker: { status: StationRouteStatus; provider: string; lastError: string | null };
  identity: { faceSampleCount: number; voiceSampleCount: number; rawSamplesIncluded: false; secretsIncluded: false };
}
```

Extend `SynraHealthReport`:

```ts
identitySmoke: StationIdentitySmoke;
```

- [ ] **Step 2: Implement camera device detection**

Replace `StationCamera.debug()` with a structured result:

```ts
debug() {
  const devices = this.detectDevices();
  const configuredDevice = process.env.SYNRA_CAMERA_DEVICE || "";
  const configuredPresent = configuredDevice ? devices.some((device) => device.path === configuredDevice) : false;
  return {
    enabled: this.enabled,
    status: this.statusValue,
    lastError: this.lastErrorValue,
    configuredDevice: configuredDevice || null,
    devices: devices.map((device) => ({ path: device.path, present: true, configured: device.path === configuredDevice })),
    routeStatus: configuredDevice ? (configuredPresent ? "ready" : "degraded") : devices.length > 0 ? "not-configured" : "unavailable"
  };
}

private detectDevices(): Array<{ path: string }> {
  try {
    return fs.readdirSync("/dev")
      .filter((name) => /^video\\d+$/.test(name))
      .sort()
      .map((name) => ({ path: `/dev/${name}` }));
  } catch {
    return [];
  }
}
```

Add `import fs from "node:fs";` to `camera.ts`.

- [ ] **Step 3: Implement microphone route status**

Update `StationMicrophone.debug()`:

```ts
debug() {
  const configuredSource = process.env.SYNRA_MICROPHONE_SOURCE || null;
  return {
    enabled: this.enabled,
    status: this.statusValue,
    lastError: this.lastErrorValue,
    configuredSource,
    sources: configuredSource ? [{ id: configuredSource, label: configuredSource, present: true, configured: true }] : [],
    routeStatus: this.enabled ? (configuredSource ? "ready" : "not-configured") : "unavailable"
  };
}
```

- [ ] **Step 4: Add identity smoke to health**

In `health.ts`, add:

```ts
function identitySmoke(camera: StationCamera, microphone: StationMicrophone) {
  const cameraDebug = camera.debug();
  const microphoneDebug = microphone.debug();
  const sttError = process.env.SYNRA_STT_LAST_ERROR || null;
  const sttProvider = process.env.SYNRA_STT_PROVIDER || "browser-fallback";
  return {
    ok: cameraDebug.routeStatus !== "degraded" && microphoneDebug.routeStatus !== "degraded" && !sttError,
    camera: {
      status: cameraDebug.routeStatus,
      configuredDevice: cameraDebug.configuredDevice,
      devices: cameraDebug.devices
    },
    microphone: {
      status: microphoneDebug.routeStatus,
      configuredSource: microphoneDebug.configuredSource,
      sources: microphoneDebug.sources
    },
    stt: {
      status: sttError ? "degraded" : sttProvider === "none" ? "not-configured" : "ready",
      provider: sttProvider,
      lastError: sttError
    },
    speaker: {
      status: "ready",
      provider: process.env.SYNRA_SPEAKER_PROVIDER || "system",
      lastError: null
    },
    identity: {
      faceSampleCount: Number(process.env.SYNRA_FACE_SAMPLE_COUNT || 0),
      voiceSampleCount: Number(process.env.SYNRA_VOICE_SAMPLE_COUNT || 0),
      rawSamplesIncluded: false,
      secretsIncluded: false
    }
  };
}
```

Include `identitySmoke: identitySmoke(camera, microphone)` in the returned health report.

- [ ] **Step 5: Run station typecheck**

Run:

```bash
npm run station:typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add tools/SynraJetsonStation/src/types.ts tools/SynraJetsonStation/src/camera.ts tools/SynraJetsonStation/src/microphone.ts tools/SynraJetsonStation/src/health.ts
git commit -m "Report Jetson identity device readiness"
```

---

### Task 4: Add Station Identity Smoke Endpoint And Test

**Files:**
- Modify: `tools/SynraJetsonStation/src/station-server.ts`
- Create: `tools/SynraJetsonStation/tests/identity-smoke.test.mjs`
- Modify: `tools/SynraJetsonStation/package.json`

- [ ] **Step 1: Add failing test**

Create `tools/SynraJetsonStation/tests/identity-smoke.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

test("station identity smoke response is redaction safe", async () => {
  const port = String(52991 + Math.floor(Math.random() * 1000));
  const child = spawn(process.execPath, ["dist/station-server.js"], {
    env: {
      ...process.env,
      SYNRA_STATION_PORT: port,
      SYNRA_STATION_SIMULATE: "1",
      SYNRA_STATION_ONCE: "0",
      SYNRA_HUB_TOKEN: "secret-token-that-must-not-leak",
      SYNRA_STT_LAST_ERROR: "HTTP 401"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(port);
    const response = await fetch(`http://127.0.0.1:${port}/station/identity-smoke`);
    const body = await response.json();
    const text = JSON.stringify(body);
    assert.equal(response.status, 200);
    assert.equal(body.identity.rawSamplesIncluded, false);
    assert.equal(body.identity.secretsIncluded, false);
    assert.equal(body.stt.status, "degraded");
    assert.equal(text.includes("secret-token-that-must-not-leak"), false);
  } finally {
    child.kill("SIGTERM");
  }
});

async function waitForServer(port) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("station server did not start");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix tools/SynraJetsonStation run build
node --test tools/SynraJetsonStation/tests/identity-smoke.test.mjs
```

Expected: fail with `404` for `/station/identity-smoke`.

- [ ] **Step 3: Add endpoint**

In `station-server.ts`, add:

```ts
async function stationIdentitySmokePayload() {
  const health = await collectHealth(config, healthState(), camera, microphone);
  return health.identitySmoke;
}
```

In the GET router, add:

```ts
if (pathname === "/station/identity-smoke") {
  return sendJson(res, 200, await stationIdentitySmokePayload());
}
```

- [ ] **Step 4: Add package script**

In `tools/SynraJetsonStation/package.json`, update `test:kiosk`:

```json
"test:kiosk": "npm run build && node --test tests/kiosk-config.test.mjs tests/identity-smoke.test.mjs"
```

- [ ] **Step 5: Run station tests**

Run:

```bash
npm run station:test
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add tools/SynraJetsonStation/src/station-server.ts tools/SynraJetsonStation/tests/identity-smoke.test.mjs tools/SynraJetsonStation/package.json
git commit -m "Add Jetson identity smoke endpoint"
```

---

### Task 5: Feed Station Health Into Standalone Identity UI

**Files:**
- Modify: `src/main.ts`
- Test: `scripts/audit-identity-contract.mjs`

- [ ] **Step 1: Add station health mapper**

In `src/main.ts`, add:

```ts
function identityStatusFromStationHealth(health: { identitySmoke?: unknown }): SynraIdentityStatus {
  const smoke = health.identitySmoke as {
    camera?: { status?: string };
    microphone?: { status?: string };
    stt?: { status?: string; provider?: string; lastError?: string | null };
    speaker?: { status?: string };
    identity?: { faceSampleCount?: number; voiceSampleCount?: number };
  } | undefined;

  const faceSampleCount = Number(smoke?.identity?.faceSampleCount ?? state.identityStatus.faceSampleCount);
  const voiceSampleCount = Number(smoke?.identity?.voiceSampleCount ?? state.identityStatus.voiceSampleCount);
  return normalizeIdentityStatus({
    ...state.identityStatus,
    generatedAt: new Date().toISOString(),
    cameraDevice: stationRouteToIdentityDevice(smoke?.camera?.status),
    microphoneDevice: stationRouteToIdentityDevice(smoke?.microphone?.status),
    sttRoute: stationRouteToIdentityDevice(smoke?.stt?.status),
    speakerRoute: stationRouteToIdentityDevice(smoke?.speaker?.status),
    faceSampleCount,
    voiceSampleCount,
    readiness: {
      ...state.identityStatus.readiness,
      source: smoke?.stt?.provider ? `station:${smoke.stt.provider}` : "standalone",
      summary: smoke?.stt?.lastError
        ? `Speech recognition degraded: ${smoke.stt.lastError}`
        : "Local identity status refreshed from station health."
    }
  });
}

function stationRouteToIdentityDevice(value: string | undefined): SynraIdentityStatus["cameraDevice"] {
  if (value === "ready") return "ready";
  if (value === "degraded") return "degraded";
  if (value === "not-configured") return "not-configured";
  return "unavailable";
}
```

- [ ] **Step 2: Call mapper in health refresh**

Inside the existing `/api/health` fetch path, after parsing `health`, add:

```ts
if (health.identitySmoke) {
  renderSmartRecognition(identityStatusFromStationHealth(health));
}
```

- [ ] **Step 3: Run checks**

Run:

```bash
npm run typecheck
npm run audit:identity-contract
npm run build
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "Sync Smart Recognition from station health"
```

---

### Task 6: Cross-App Contract Audits

**Files:**
- Create: `scripts/audit-cross-app-identity-parity.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add audit script**

Create `scripts/audit-cross-app-identity-parity.mjs`:

```js
#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const standaloneRoot = process.cwd();
const collectionRoot = path.dirname(standaloneRoot);
const nodeSparkRoot = path.join(collectionRoot, "NodeSpark Version 4.3");
const hubRoot = path.join(collectionRoot, "NodeSparkHub Version 4.3");

const standaloneContract = fs.readFileSync(path.join(standaloneRoot, "src/identity-contract.ts"), "utf8");
const iosState = fs.readFileSync(path.join(nodeSparkRoot, "NodeSpark/Synra/SynraMobileState.swift"), "utf8");
const iosBridge = fs.readFileSync(path.join(nodeSparkRoot, "NodeSpark/Synra/SynraMobileBridge.swift"), "utf8");
const hubRecognition = fs.readFileSync(path.join(hubRoot, "NodeSparkHub/SynraRecognitionService.swift"), "utf8");

const checks = {
  standaloneDefinesReadiness: standaloneContract.includes("faceReady") && standaloneContract.includes("voiceReady") && standaloneContract.includes("trustedActionsReady"),
  iosTracksFaceVoiceCounts: iosState.includes("faceSampleCount") && iosState.includes("voiceSampleCount"),
  iosNativeEnrollment: iosBridge.includes("recognitionService.perform(kind: \"face\", action: action, state: state)") && iosBridge.includes("recognitionService.perform(kind: \"voice\", action: action, state: state)"),
  hubHasRecognitionService: hubRecognition.includes("faceSampleCount") && hubRecognition.includes("voiceSampleCount")
};

console.log(JSON.stringify({ ok: Object.values(checks).every(Boolean), checks }, null, 2));
if (!Object.values(checks).every(Boolean)) process.exit(1);
```

- [ ] **Step 2: Add script**

In `package.json`:

```json
"audit:cross-app-identity": "node scripts/audit-cross-app-identity-parity.mjs"
```

- [ ] **Step 3: Run audit**

Run:

```bash
npm run audit:cross-app-identity
```

Expected: pass or fail with the exact missing parity field. If it fails, update the referenced app surface to expose the missing readiness count or state name, then rerun.

- [ ] **Step 4: Commit**

```bash
git add scripts/audit-cross-app-identity-parity.mjs package.json
git commit -m "Audit cross-app Synra identity parity"
```

---

### Task 7: Build, Deploy, And Verify Jetson

**Files:**
- Modify: `docs/jetson-findings.md`

- [ ] **Step 1: Run local release gates**

Run:

```bash
npm run typecheck
npm run audit:identity-contract
npm run audit:identity-readiness
npm run audit:stt-fallback
npm run audit:cross-app-identity
npm run station:test
npm run build
```

Expected: all pass.

- [ ] **Step 2: Deploy to Jetson**

Run:

```bash
./scripts/deploy-jetson.sh
```

Expected: script completes without SSH, rsync, build, or service restart errors.

- [ ] **Step 3: Verify health**

Run:

```bash
curl -fsS http://192.168.1.165:5191/api/health | tee /tmp/synra-jetson-health.json
node -e 'const h=require("/tmp/synra-jetson-health.json"); console.log(JSON.stringify({ok:h.ok, version:h.version, identitySmoke:h.identitySmoke}, null, 2))'
curl -fsS http://192.168.1.165:5191/station/identity-smoke | tee /tmp/synra-jetson-identity-smoke.json
```

Expected:

- `/api/health` returns success JSON.
- `identitySmoke.identity.rawSamplesIncluded` is `false`.
- `identitySmoke.identity.secretsIncluded` is `false`.
- Camera route reports `ready`, `not-configured`, or `unavailable`; it must not pretend readiness for a missing configured device.
- STT route reports `ready`, `not-configured`, or `degraded`; HTTP credential failures must show as degraded.

- [ ] **Step 4: Update findings**

Append the verified Jetson identity status to `docs/jetson-findings.md`:

```bash
node - <<'NODE'
const fs = require("node:fs");
const path = "/tmp/synra-jetson-identity-smoke.json";
const smoke = JSON.parse(fs.readFileSync(path, "utf8"));
const cameraStatus = smoke.camera?.status ?? "missing";
const sttStatus = smoke.stt?.status ?? "missing";
const versionNote = [
  "",
  "## Identity / Device Readiness Update",
  "",
  "- Station shell version matches the local package version after deployment.",
  "- `/station/identity-smoke` reports redaction-safe camera, microphone, STT, speaker, and sample-count readiness.",
  "- Raw samples and secrets are not present in identity smoke output.",
  `- Camera route status after deploy: \`${cameraStatus}\`.`,
  `- STT route status after deploy: \`${sttStatus}\`.`,
  ""
].join("\n");
fs.appendFileSync("docs/jetson-findings.md", versionNote);
NODE
```

- [ ] **Step 5: Commit**

```bash
git add docs/jetson-findings.md
git commit -m "Document Jetson identity readiness verification"
```

---

### Task 8: Final Verification

**Files:**
- No new code files unless a previous check reveals a defect.

- [ ] **Step 1: Run NodeSpark iOS audits**

Run:

```bash
cd "/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/NodeSpark Version 4.3"
node scripts/audit-synra-ios-identity-enrollment.mjs
node scripts/audit-synra-ios-face-voice-enrollment-parity.mjs
node scripts/audit-synra-apple-voice-parity.mjs
node scripts/audit-synra-ios-native-media-guard.mjs
node scripts/audit-synra-ios-startup-runtime-sync.mjs
```

Expected: all pass.

- [ ] **Step 2: Run NodeSpark iOS Xcode 27 build**

Run:

```bash
cd "/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/NodeSpark Version 4.3"
DEVELOPER_DIR="/Users/matthew/Downloads/Xcode-beta.app/Contents/Developer" xcodebuild -project NodeSpark.xcodeproj -scheme NodeSpark -configuration Debug -destination "generic/platform=iOS" -derivedDataPath /tmp/NodeSpark-Xcode27-Identity-DD CODE_SIGNING_ALLOWED=NO build
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Run Hub build or targeted compile**

Run:

```bash
cd "/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/NodeSparkHub Version 4.3"
xcodebuild -project NodeSparkHub.xcodeproj -scheme NodeSparkHub -configuration Debug -destination "platform=macOS" build
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Run Standalone final gates**

Run:

```bash
cd "/Users/matthew/Documents/Documents - Matthew’s Mac Studio/Developer/Apps on Store/NodeSpark Collection/Synra Standalone"
npm run typecheck
npm run audit:identity-contract
npm run audit:cross-app-identity
npm run station:test
npm run build
```

Expected: all pass.

- [ ] **Step 5: Commit any final verification doc changes**

```bash
git status --short
git add docs/jetson-findings.md
git commit -m "Verify Synra identity parity rollout"
```

Only run the commit if `docs/jetson-findings.md` changed after the Jetson verification commands.
