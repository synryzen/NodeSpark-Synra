# Enrollment Proof Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Smart Recognition proof panel that shows evidence for enrollment health, accepted samples, Station sync, and `/api/health.identitySmoke` refreshes.

**Architecture:** Synra Standalone keeps the proof UI inside the existing Known Users settings Smart Recognition shell so it does not cover the main Synra stage. Browser-only proof state is updated from existing health refresh and count-sync flows, while the existing Station count-only endpoint remains the only writer for proof sync.

**Tech Stack:** TypeScript, DOM-driven browser UI in `src/main.ts`, CSS in `src/styles.css`, Node.js audit scripts, existing Python/Station APIs, Vite build.

---

## File Map

- Modify: `src/main.ts`
  Adds the proof panel markup, DOM bindings, browser-only proof state, proof rendering, health/sync proof updates, Verify Sync action, and accepted-sample timestamps.
- Modify: `src/styles.css`
  Adds compact Smart Recognition proof panel styles that match the existing Synra AI-style settings surface.
- Create: `scripts/audit-enrollment-proof-mode.mjs`
  Adds source-level regression checks for proof UI ids, proof state wiring, accepted-sample timestamp order, and count-only Verify Sync payloads.
- Modify: `package.json`
  Adds `audit:enrollment-proof`.
- Modify: `docs/jetson-findings.md`
  Records deployment and live Proof Mode verification.

## Task 1: Proof Panel UI Shell

**Files:**
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Create: `scripts/audit-enrollment-proof-mode.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add a failing UI shell audit**

Create `scripts/audit-enrollment-proof-mode.mjs`:

```js
#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const main = readFileSync(join(root, "src/main.ts"), "utf8");
const styles = readFileSync(join(root, "src/styles.css"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

function requireText(label, haystack, needle) {
  if (!haystack.includes(needle)) throw new Error(`${label} missing: ${needle}`);
}

for (const id of [
  "recognitionProofStationStatus",
  "recognitionProofCameraStatus",
  "recognitionProofMicStatus",
  "recognitionProofFaceStatus",
  "recognitionProofVoiceStatus",
  "recognitionProofSyncStatus",
  "recognitionProofVerifyButton"
]) {
  requireText(`proof element ${id}`, main, `id="${id}"`);
}

requireText("proof heading", main, "Enrollment Proof");
requireText("proof section class", main, "recognition-proof-panel");
requireText("proof styles", styles, ".recognition-proof-panel");
requireText("package script", packageJson, "\"audit:enrollment-proof\"");

console.log("Enrollment proof mode audit passed.");
```

- [ ] **Step 2: Run the UI shell audit and verify it fails**

Run:

```bash
node scripts/audit-enrollment-proof-mode.mjs
```

Expected: FAIL with `proof element recognitionProofStationStatus missing`.

- [ ] **Step 3: Add the package script**

Modify `package.json` and add this entry immediately after `audit:station-identity-counts`:

```json
"audit:enrollment-proof": "node scripts/audit-enrollment-proof-mode.mjs",
```

- [ ] **Step 4: Add proof panel markup**

In `src/main.ts`, inside the Smart Recognition shell, insert this section immediately after the closing `</section>` for `recognition-live-coach` and before `<div class="recognition-session-checks"`:

```html
          <section class="recognition-proof-panel" aria-label="Enrollment Proof">
            <div class="recognition-proof-heading">
              <div>
                <span>Enrollment Proof</span>
                <strong id="recognitionProofSyncStatus">Not Tested</strong>
              </div>
              <button type="button" id="recognitionProofVerifyButton">Verify Sync</button>
            </div>
            <div class="recognition-proof-grid">
              <div>
                <span>Station</span>
                <strong id="recognitionProofStationStatus">Unknown</strong>
              </div>
              <div>
                <span>Camera</span>
                <strong id="recognitionProofCameraStatus">Unknown</strong>
              </div>
              <div>
                <span>Mic</span>
                <strong id="recognitionProofMicStatus">Unknown</strong>
              </div>
              <div>
                <span>Face</span>
                <strong id="recognitionProofFaceStatus">0/7</strong>
              </div>
              <div>
                <span>Voice</span>
                <strong id="recognitionProofVoiceStatus">0/3</strong>
              </div>
            </div>
          </section>
```

- [ ] **Step 5: Bind the proof DOM elements**

In `src/main.ts`, immediately after the existing `recognitionSessionCheckThree` binding, add:

```ts
const recognitionProofStationStatus = must<HTMLElement, HTMLElement>("recognitionProofStationStatus");
const recognitionProofCameraStatus = must<HTMLElement, HTMLElement>("recognitionProofCameraStatus");
const recognitionProofMicStatus = must<HTMLElement, HTMLElement>("recognitionProofMicStatus");
const recognitionProofFaceStatus = must<HTMLElement, HTMLElement>("recognitionProofFaceStatus");
const recognitionProofVoiceStatus = must<HTMLElement, HTMLElement>("recognitionProofVoiceStatus");
const recognitionProofSyncStatus = must<HTMLElement, HTMLElement>("recognitionProofSyncStatus");
const recognitionProofVerifyButton = must<HTMLElement, HTMLButtonElement>("recognitionProofVerifyButton");
```

- [ ] **Step 6: Add compact proof styles**

In `src/styles.css`, add these styles after the existing `.recognition-session-checks span` block:

```css
.recognition-proof-panel {
  display: grid;
  gap: 10px;
  border: 1px solid rgb(24 214 181 / 24%);
  border-radius: 8px;
  padding: 10px;
  background:
    linear-gradient(135deg, rgb(24 214 181 / 11%), rgb(37 221 255 / 8%) 52%, rgb(255 200 90 / 7%)),
    rgb(0 0 0 / 18%);
}

.recognition-proof-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.recognition-proof-heading div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.recognition-proof-heading span,
.recognition-proof-grid span {
  color: rgb(235 242 250 / 62%);
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
}

.recognition-proof-heading strong,
.recognition-proof-grid strong {
  min-width: 0;
  color: #fff;
  font-size: 12px;
  font-weight: 950;
  overflow-wrap: anywhere;
}

.recognition-proof-heading button {
  min-width: 88px;
  min-height: 31px;
  border: 1px solid rgb(24 214 181 / 34%);
  border-radius: 7px;
  background:
    linear-gradient(135deg, rgb(24 214 181 / 20%), rgb(37 221 255 / 12%)),
    rgb(255 255 255 / 8%);
  color: #f8fafc;
  font-size: 11px;
  font-weight: 950;
}

.recognition-proof-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 8px;
}

.recognition-proof-grid div {
  display: grid;
  gap: 4px;
  min-width: 0;
  min-height: 48px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 7px;
  padding: 8px;
  background: rgb(0 0 0 / 16%);
}
```

- [ ] **Step 7: Run the UI shell audit and commit**

Run:

```bash
node scripts/audit-enrollment-proof-mode.mjs
npm run typecheck
```

Expected: both commands PASS.

Commit:

```bash
git add src/main.ts src/styles.css scripts/audit-enrollment-proof-mode.mjs package.json
git commit -m "Add enrollment proof panel shell"
```

## Task 2: Proof State And Renderer

**Files:**
- Modify: `src/main.ts`
- Modify: `scripts/audit-enrollment-proof-mode.mjs`

- [ ] **Step 1: Extend the audit for proof state and rendering**

Append these checks to `scripts/audit-enrollment-proof-mode.mjs` before the final `console.log`:

```js
for (const needle of [
  "type EnrollmentProofSyncState",
  "type EnrollmentProofState",
  "const enrollmentProofState",
  "function renderEnrollmentProof",
  "function updateEnrollmentProofFromStatus",
  "recognitionProofStationStatus.textContent",
  "recognitionProofSyncStatus.textContent"
]) {
  requireText("proof state wiring", main, needle);
}
```

- [ ] **Step 2: Run the audit and verify it fails**

Run:

```bash
node scripts/audit-enrollment-proof-mode.mjs
```

Expected: FAIL with `proof state wiring missing: type EnrollmentProofSyncState`.

- [ ] **Step 3: Add proof state types and state**

In `src/main.ts`, near `type IdentityWizardStage`, add:

```ts
type EnrollmentProofSyncState = "not-tested" | "pending" | "confirmed" | "failed" | "degraded";

type EnrollmentProofState = {
  lastHealthAt: string | null;
  lastFaceAcceptedAt: string | null;
  lastVoiceAcceptedAt: string | null;
  lastSyncAttemptAt: string | null;
  lastSyncConfirmedAt: string | null;
  lastSyncError: string | null;
  lastSyncedFaceSampleCount: number;
  lastSyncedVoiceSampleCount: number;
  stationAvailable: boolean;
  syncState: EnrollmentProofSyncState;
};

const enrollmentProofState: EnrollmentProofState = {
  lastHealthAt: null,
  lastFaceAcceptedAt: null,
  lastVoiceAcceptedAt: null,
  lastSyncAttemptAt: null,
  lastSyncConfirmedAt: null,
  lastSyncError: null,
  lastSyncedFaceSampleCount: 0,
  lastSyncedVoiceSampleCount: 0,
  stationAvailable: false,
  syncState: "not-tested"
};
```

- [ ] **Step 4: Add proof rendering helpers**

In `src/main.ts`, above `renderSmartRecognition`, add:

```ts
function proofRouteLabel(value: SynraIdentityDeviceState): string {
  return identityDeviceLabel(value);
}

function proofSyncLabel(value: EnrollmentProofSyncState): string {
  if (value === "confirmed") return "Confirmed";
  if (value === "pending") return "Pending";
  if (value === "failed") return "Failed";
  if (value === "degraded") return "Degraded";
  return "Not Tested";
}

function proofCountLabel(count: number, required: number, acceptedAt: string | null): string {
  const base = `${Math.min(count, required)}/${required}`;
  return acceptedAt ? `${base} · ${new Date(acceptedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : base;
}

function renderEnrollmentProof(status: SynraIdentityStatus = state.identityStatus): void {
  const normalized = normalizeIdentityStatus(status);
  recognitionProofStationStatus.textContent = enrollmentProofState.stationAvailable ? "Connected" : "Unavailable";
  recognitionProofCameraStatus.textContent = proofRouteLabel(normalized.cameraDevice);
  recognitionProofMicStatus.textContent = proofRouteLabel(normalized.microphoneDevice);
  recognitionProofFaceStatus.textContent = proofCountLabel(normalized.faceSampleCount, normalized.requiredFacePoseCount, enrollmentProofState.lastFaceAcceptedAt);
  recognitionProofVoiceStatus.textContent = proofCountLabel(normalized.voiceSampleCount, normalized.requiredVoiceSampleCount, enrollmentProofState.lastVoiceAcceptedAt);
  recognitionProofSyncStatus.textContent = enrollmentProofState.lastSyncError || proofSyncLabel(enrollmentProofState.syncState);
}

function updateEnrollmentProofFromStatus(status: SynraIdentityStatus): void {
  enrollmentProofState.lastHealthAt = new Date().toISOString();
  enrollmentProofState.stationAvailable = true;
  enrollmentProofState.lastSyncedFaceSampleCount = status.faceSampleCount;
  enrollmentProofState.lastSyncedVoiceSampleCount = status.voiceSampleCount;
  if (enrollmentProofState.syncState === "pending") enrollmentProofState.syncState = "confirmed";
  if (!enrollmentProofState.lastSyncConfirmedAt && (status.faceSampleCount > 0 || status.voiceSampleCount > 0)) {
    enrollmentProofState.lastSyncConfirmedAt = enrollmentProofState.lastHealthAt;
  }
  renderEnrollmentProof(status);
}
```

- [ ] **Step 5: Render proof whenever Smart Recognition renders**

In `renderSmartRecognition`, after:

```ts
  recognitionSessionCheckThree.textContent = "Stored locally";
```

add:

```ts
  renderEnrollmentProof(normalized);
```

- [ ] **Step 6: Run audit/typecheck and commit**

Run:

```bash
node scripts/audit-enrollment-proof-mode.mjs
npm run typecheck
```

Expected: both commands PASS.

Commit:

```bash
git add src/main.ts scripts/audit-enrollment-proof-mode.mjs
git commit -m "Render enrollment proof state"
```

## Task 3: Health And Sync Proof Updates

**Files:**
- Modify: `src/main.ts`
- Modify: `scripts/audit-enrollment-proof-mode.mjs`

- [ ] **Step 1: Extend the audit for health, sync, and Verify Sync functions**

Append these checks to `scripts/audit-enrollment-proof-mode.mjs` before the final `console.log`:

```js
for (const needle of [
  "function markEnrollmentProofAccepted",
  "async function verifyEnrollmentProofSync",
  "recognitionProofVerifyButton.addEventListener",
  "enrollmentProofState.lastSyncAttemptAt",
  "enrollmentProofState.lastSyncConfirmedAt",
  "enrollmentProofState.lastSyncError",
  "updateEnrollmentProofFromStatus(identityStatusFromStationHealth(health))"
]) {
  requireText("proof health sync wiring", main, needle);
}

const verifyStart = main.indexOf("async function verifyEnrollmentProofSync");
if (verifyStart < 0) throw new Error("verifyEnrollmentProofSync missing");
const verifyEnd = main.indexOf("async function captureKnownUserFaceSample", verifyStart);
const verifyBody = main.slice(verifyStart, verifyEnd);
for (const forbidden of ["faceSamples", "facePoseSamples", "pendingFacePoseSamples", "voicePrints", "pendingVoicePrints", "dataUrl", "blob", "token"]) {
  if (verifyBody.includes(forbidden)) throw new Error(`verifyEnrollmentProofSync must not reference raw enrollment material: ${forbidden}`);
}
```

- [ ] **Step 2: Run the audit and verify it fails**

Run:

```bash
node scripts/audit-enrollment-proof-mode.mjs
```

Expected: FAIL with `proof health sync wiring missing: function markEnrollmentProofAccepted`.

- [ ] **Step 3: Add accepted marker and sync confirmation helper**

In `src/main.ts`, below `updateEnrollmentProofFromStatus`, add:

```ts
function markEnrollmentProofAccepted(kind: "face" | "voice"): void {
  const now = new Date().toISOString();
  if (kind === "face") enrollmentProofState.lastFaceAcceptedAt = now;
  else enrollmentProofState.lastVoiceAcceptedAt = now;
  enrollmentProofState.syncState = "pending";
  enrollmentProofState.lastSyncError = null;
  renderEnrollmentProof();
}

function confirmEnrollmentProofSync(expected: { faceSampleCount: number; voiceSampleCount: number }, health: { identitySmoke?: unknown }): void {
  const status = identityStatusFromStationHealth(health);
  const redaction = health.identitySmoke as { identity?: { rawSamplesIncluded?: boolean; secretsIncluded?: boolean } } | undefined;
  const redactionSafe = redaction?.identity?.rawSamplesIncluded === false && redaction?.identity?.secretsIncluded === false;
  const countsMatch = status.faceSampleCount >= expected.faceSampleCount && status.voiceSampleCount >= expected.voiceSampleCount;
  enrollmentProofState.stationAvailable = Boolean(health.identitySmoke);
  enrollmentProofState.lastSyncedFaceSampleCount = status.faceSampleCount;
  enrollmentProofState.lastSyncedVoiceSampleCount = status.voiceSampleCount;
  if (countsMatch && redactionSafe) {
    enrollmentProofState.syncState = "confirmed";
    enrollmentProofState.lastSyncConfirmedAt = new Date().toISOString();
    enrollmentProofState.lastSyncError = null;
  } else {
    enrollmentProofState.syncState = redactionSafe ? "pending" : "degraded";
    enrollmentProofState.lastSyncError = redactionSafe ? "Sync pending" : "Identity smoke degraded";
  }
  refreshSmartRecognitionFromHealth(health);
}
```

- [ ] **Step 4: Update health refresh to update proof state**

In `refreshSmartRecognitionHealth`, replace:

```ts
    const health = (await response.json()) as { identitySmoke?: unknown };
    refreshSmartRecognitionFromHealth(health);
```

with:

```ts
    const health = (await response.json()) as { identitySmoke?: unknown };
    if (health.identitySmoke) updateEnrollmentProofFromStatus(identityStatusFromStationHealth(health));
    refreshSmartRecognitionFromHealth(health);
```

In the `catch` block before `renderSmartRecognition`, add:

```ts
    enrollmentProofState.stationAvailable = false;
    enrollmentProofState.syncState = enrollmentProofState.syncState === "pending" ? "failed" : enrollmentProofState.syncState;
    enrollmentProofState.lastSyncError = "Station unavailable";
```

- [ ] **Step 5: Update count sync proof state**

In `syncStationIdentityCounts`, at the top of the function before `try`, add:

```ts
  enrollmentProofState.lastSyncAttemptAt = new Date().toISOString();
  enrollmentProofState.syncState = "pending";
  enrollmentProofState.lastSyncError = null;
  renderEnrollmentProof();
```

Inside the `if (body.identitySmoke)` block, replace:

```ts
      if (body.identitySmoke) refreshSmartRecognitionFromHealth({ identitySmoke: body.identitySmoke });
```

with:

```ts
      if (body.identitySmoke) confirmEnrollmentProofSync(counts, { identitySmoke: body.identitySmoke });
```

Inside the `catch` block before `setSynraState`, add:

```ts
    enrollmentProofState.syncState = "failed";
    enrollmentProofState.lastSyncError = "Sync failed";
    renderEnrollmentProof();
```

- [ ] **Step 6: Add Verify Sync action**

In `src/main.ts`, below `syncStationIdentityCounts`, add:

```ts
async function verifyEnrollmentProofSync(): Promise<void> {
  recognitionProofVerifyButton.disabled = true;
  const counts = {
    faceSampleCount: Math.max(0, Math.floor(state.identityStatus.faceSampleCount)),
    voiceSampleCount: Math.max(0, Math.floor(state.identityStatus.voiceSampleCount))
  };
  try {
    await syncStationIdentityCounts(counts);
  } finally {
    recognitionProofVerifyButton.disabled = false;
  }
}
```

Near the existing identity button listeners, add:

```ts
recognitionProofVerifyButton.addEventListener("click", () => {
  void verifyEnrollmentProofSync();
});
```

- [ ] **Step 7: Run audit/typecheck and commit**

Run:

```bash
node scripts/audit-enrollment-proof-mode.mjs
npm run typecheck
```

Expected: both commands PASS.

Commit:

```bash
git add src/main.ts scripts/audit-enrollment-proof-mode.mjs
git commit -m "Wire enrollment proof health and sync"
```

## Task 4: Accepted Sample Proof Timestamps

**Files:**
- Modify: `src/main.ts`
- Modify: `scripts/audit-enrollment-proof-mode.mjs`

- [ ] **Step 1: Extend the audit for accepted-sample timestamp order**

Append these helpers and checks to `scripts/audit-enrollment-proof-mode.mjs` before the final `console.log`:

```js
function asyncFunctionBody(name) {
  const start = main.indexOf(`async function ${name}`);
  if (start < 0) throw new Error(`${name} missing`);
  const brace = main.indexOf("{", start);
  let depth = 0;
  for (let index = brace; index < main.length; index += 1) {
    if (main[index] === "{") depth += 1;
    if (main[index] === "}") depth -= 1;
    if (depth === 0) return main.slice(brace, index + 1);
  }
  throw new Error(`${name} body did not close`);
}

function requireAcceptedOrder(functionName, marker, syncCall) {
  const body = asyncFunctionBody(functionName);
  const accepted = body.indexOf("if (!faceQuality.accepted)") >= 0 ? body.indexOf("if (!faceQuality.accepted)") : body.indexOf("if (!voiceQuality.accepted)");
  const markerIndex = body.indexOf(marker);
  const syncIndex = body.indexOf(syncCall);
  if (accepted < 0) throw new Error(`${functionName} quality gate missing`);
  if (markerIndex < 0) throw new Error(`${functionName} proof marker missing`);
  if (syncIndex < 0) throw new Error(`${functionName} sync call missing`);
  if (markerIndex < accepted) throw new Error(`${functionName} proof marker occurs before quality gate`);
  if (markerIndex > syncIndex) throw new Error(`${functionName} proof marker occurs after sync`);
}

const syncCall = "await syncStationIdentityCounts({ faceSampleCount: faceCount, voiceSampleCount: voiceCount });";
requireAcceptedOrder("captureIdentityWizardFacePose", 'markEnrollmentProofAccepted("face")', syncCall);
requireAcceptedOrder("captureIdentityWizardVoiceSample", 'markEnrollmentProofAccepted("voice")', syncCall);
requireAcceptedOrder("captureKnownUserFaceSample", 'markEnrollmentProofAccepted("face")', syncCall);
requireAcceptedOrder("captureKnownUserVoiceSample", 'markEnrollmentProofAccepted("voice")', syncCall);
```

- [ ] **Step 2: Run the audit and verify it fails**

Run:

```bash
node scripts/audit-enrollment-proof-mode.mjs
```

Expected: FAIL with `captureIdentityWizardFacePose proof marker missing`.

- [ ] **Step 3: Add accepted markers after quality acceptance and before sync**

In `captureIdentityWizardFacePose`, immediately after:

```ts
    pendingFacePoseSamples = { ...pendingFacePoseSamples, [pose]: capture.dataUrl };
```

add:

```ts
    markEnrollmentProofAccepted("face");
```

In `captureIdentityWizardVoiceSample`, immediately after:

```ts
    pendingVoicePrints = [...pendingVoicePrints, voicePrint].slice(-REQUIRED_VOICE_SAMPLE_COUNT);
```

add:

```ts
    markEnrollmentProofAccepted("voice");
```

In `captureKnownUserFaceSample`, immediately after:

```ts
    pendingFacePoseSamples = { ...pendingFacePoseSamples, [pose]: capture.dataUrl };
```

add:

```ts
    markEnrollmentProofAccepted("face");
```

In `captureKnownUserVoiceSample`, immediately after:

```ts
    pendingVoicePrints = [...pendingVoicePrints, voicePrint].slice(-REQUIRED_VOICE_SAMPLE_COUNT);
```

add:

```ts
    markEnrollmentProofAccepted("voice");
```

- [ ] **Step 4: Run audits/typecheck and commit**

Run:

```bash
node scripts/audit-enrollment-proof-mode.mjs
npm run audit:station-identity-counts
npm run typecheck
```

Expected: all commands PASS.

Commit:

```bash
git add src/main.ts scripts/audit-enrollment-proof-mode.mjs
git commit -m "Track accepted enrollment proof timestamps"
```

## Task 5: Full Local Verification

**Files:**
- No source edits unless a verification command exposes a defect.

- [ ] **Step 1: Run complete local gates**

Run:

```bash
npm run typecheck
npm run audit:identity-contract
npm run audit:cross-app-identity
npm run audit:station-identity-counts
npm run audit:enrollment-proof
npm run station:test
npm run build
```

Expected: all commands PASS.

- [ ] **Step 2: Inspect git state**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: working tree is clean, and the latest commits include the proof panel, proof wiring, proof timestamps, and this plan.

## Task 6: Deploy And Verify On Jetson

**Files:**
- Modify: `docs/jetson-findings.md`

- [ ] **Step 1: Push to GitHub**

Run:

```bash
git push origin HEAD
```

Expected: push succeeds.

- [ ] **Step 2: Sync active service directories and rebuild**

Run:

```bash
rsync -az --delete --exclude node_modules --exclude .git --exclude .env ./ matthew@192.168.1.165:/home/matthew/synra-standalone/
rsync -az --delete --exclude node_modules --exclude .git --exclude .env tools/SynraJetsonStation/ matthew@192.168.1.165:/home/matthew/synra-jetson-station/
ssh matthew@192.168.1.165 'set -e
cd /home/matthew/synra-standalone
. tools/SynraJetsonStation/scripts/node-tools.sh
load_node_tools
"$NPM_BIN" install
"$NPM_BIN" run build
cd /home/matthew/synra-jetson-station
. scripts/node-tools.sh
load_node_tools
"$NPM_BIN" install
"$NPM_BIN" run build
"$NPM_BIN" run test:kiosk
systemctl --user restart synra-jetson-station.service synra-standalone.service synra-electron-kiosk.service
sleep 2
systemctl --user is-active synra-jetson-station.service synra-standalone.service synra-electron-kiosk.service'
```

Expected: final three lines are `active`, `active`, `active`.

- [ ] **Step 3: Verify live identity smoke**

Run:

```bash
curl -s http://192.168.1.165:5191/api/health | python3 -c 'import json,sys; h=json.load(sys.stdin); s=h.get("identitySmoke") or {}; print(json.dumps({"stationIdentitySmokeAvailable": h.get("stationIdentitySmokeAvailable"), "camera": s.get("camera", {}).get("status"), "microphone": s.get("microphone", {}).get("status"), "configuredSource": s.get("microphone", {}).get("configuredSource"), "stt": s.get("stt", {}).get("status"), "speaker": s.get("speaker", {}).get("status"), "faceSampleCount": s.get("identity", {}).get("faceSampleCount"), "voiceSampleCount": s.get("identity", {}).get("voiceSampleCount"), "rawSamplesIncluded": s.get("identity", {}).get("rawSamplesIncluded"), "secretsIncluded": s.get("identity", {}).get("secretsIncluded")}, indent=2))'
```

Expected:

```json
{
  "stationIdentitySmokeAvailable": true,
  "camera": "ready",
  "microphone": "ready",
  "stt": "ready",
  "speaker": "ready",
  "rawSamplesIncluded": false,
  "secretsIncluded": false
}
```

- [ ] **Step 4: Verify proof UI assets are deployed**

Run:

```bash
ssh matthew@192.168.1.165 'grep -R "Enrollment Proof" -n /home/matthew/synra-standalone/dist/assets/*.js | head && grep -R "recognition-proof-panel" -n /home/matthew/synra-standalone/dist/assets/*.css | head'
```

Expected: both grep commands print at least one deployed asset line.

- [ ] **Step 5: Manually verify the UI**

Open the Jetson kiosk or `http://192.168.1.165:5191`, go to Settings, open Known Users, and verify:

- `Enrollment Proof` is visible inside Smart Recognition settings.
- `Station` shows Connected when `/api/health.identitySmoke` is available.
- `Camera`, `Mic`, Face, Voice, and Sync rows fit without text clipping.
- Pressing `Verify Sync` returns the Sync row to Confirmed without changing face/voice counts.
- Capturing a rejected sample does not update proof timestamps.
- Capturing an accepted face or voice sample updates the relevant proof timestamp and Station count.

- [ ] **Step 6: Document Jetson proof verification**

Append this entry to `docs/jetson-findings.md`:

```md
## 2026-06-22 Enrollment Proof Mode Verification

- Enrollment Proof Mode was deployed inside the Smart Recognition settings area.
- The main Synra stage remains clean; proof state is not rendered over Synra.
- `/api/health.identitySmoke` remains available with camera, microphone, STT, speaker, counts, and redaction flags.
- `Verify Sync` posts only current numeric face and voice counts through the Standalone proxy.
- The deployed assets include `Enrollment Proof` and `recognition-proof-panel`.
- Manual UI verification is required after a real accepted sample to confirm the count increase from the physical camera/microphone path.
```

Run:

```bash
git add docs/jetson-findings.md
git commit -m "Document enrollment proof mode verification"
git push origin HEAD
```

Expected: commit and push succeed.

## Task 7: Final Verification Report

**Files:**
- No source edits.

- [ ] **Step 1: Capture final repository and Jetson status**

Run:

```bash
git status --short
git log --oneline -8
ssh matthew@192.168.1.165 'systemctl --user is-active synra-jetson-station.service synra-standalone.service synra-electron-kiosk.service'
curl -s http://192.168.1.165:5191/api/health | python3 -c 'import json,sys; h=json.load(sys.stdin); s=h.get("identitySmoke") or {}; print(json.dumps({"stationIdentitySmokeAvailable": h.get("stationIdentitySmokeAvailable"), "camera": s.get("camera", {}).get("status"), "microphone": s.get("microphone", {}).get("status"), "stt": s.get("stt", {}).get("status"), "speaker": s.get("speaker", {}).get("status"), "faceSampleCount": s.get("identity", {}).get("faceSampleCount"), "voiceSampleCount": s.get("identity", {}).get("voiceSampleCount"), "rawSamplesIncluded": s.get("identity", {}).get("rawSamplesIncluded"), "secretsIncluded": s.get("identity", {}).get("secretsIncluded")}, indent=2))'
```

Expected: working tree is clean, three services are active, and identity smoke is available with redaction flags false.

## Self-Review

- Spec coverage: UI proof panel is covered in Task 1; proof state and rendering are covered in Task 2; health, sync, and Verify Sync are covered in Task 3; accepted-sample proof timestamps are covered in Task 4; local gates and Jetson verification are covered in Tasks 5 and 6.
- Completeness scan: this plan uses concrete files, code snippets, commands, and expected outputs. It does not contain delayed-work markers.
- Type consistency: `EnrollmentProofState`, `EnrollmentProofSyncState`, `renderEnrollmentProof`, `updateEnrollmentProofFromStatus`, `markEnrollmentProofAccepted`, and `verifyEnrollmentProofSync` are named consistently across all tasks.
