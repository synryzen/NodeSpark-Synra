# Jetson Mic Real Enrollment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Synra Standalone and Synra Jetson Station prove real microphone readiness and sync accepted face/voice enrollment counts into Station identity smoke.

**Architecture:** Station remains the device-truth boundary for camera, microphone, STT, speaker, and count-only identity smoke. Standalone keeps the Synra AI-style guided enrollment UX, captures samples with visible browser permissions, and posts safe count metadata only after local quality gates accept a sample.

**Tech Stack:** TypeScript, Node.js built-in test runner, Electron/browser media APIs, Python `ThreadingHTTPServer`, systemd, Jetson Linux audio tools `pactl` and `arecord`.

---

## File Map

- Modify: `tools/SynraJetsonStation/src/types.ts`
  Adds count metadata type and allows microphone route diagnostics to include a non-secret `lastError`.
- Modify: `tools/SynraJetsonStation/src/microphone.ts`
  Discovers PulseAudio/PipeWire and ALSA capture sources, prefers non-monitor sources, and reports ready/not-configured/unavailable/degraded.
- Create: `tools/SynraJetsonStation/src/identity-counts.ts`
  Owns count-only persistence at `~/.config/synra-jetson-station-identity.json`, with `SYNRA_IDENTITY_COUNTS_PATH` test override.
- Modify: `tools/SynraJetsonStation/src/health.ts`
  Reads persisted counts and includes safe count metadata in `identitySmoke`.
- Modify: `tools/SynraJetsonStation/src/station-server.ts`
  Adds `POST /station/identity-counts` and returns refreshed identity smoke.
- Modify: `tools/SynraJetsonStation/package.json`
  Adds the new Station tests to `test:kiosk`.
- Create: `tools/SynraJetsonStation/tests/microphone-sources.test.mjs`
  Verifies parsing, source preference, and route statuses.
- Create: `tools/SynraJetsonStation/tests/identity-counts.test.mjs`
  Verifies persistence, clamping, merge semantics, and redaction.
- Modify: `tools/SynraJetsonStation/tests/device-health.test.mjs`
  Verifies health reads persisted counts.
- Modify: `tools/SynraJetsonStation/tests/identity-smoke.test.mjs`
  Verifies the HTTP endpoint updates counts without leaking samples or secrets.
- Modify: `scripts/synra_server.py`
  Adds `/api/station/identity-counts` proxy to the local Station service.
- Modify: `src/main.ts`
  Syncs count-only Station identity metadata after accepted face and voice samples, then refreshes Smart Recognition from `/api/health`.
- Create: `scripts/audit-station-identity-counts-sync.mjs`
  Verifies Standalone only sends count metadata, never raw samples, audio blobs, face images, or voice prints.
- Modify: `package.json`
  Adds the new audit to the root verification surface.
- Modify: `docs/jetson-findings.md`
  Records the new live verification commands and expected identity smoke state.

## Task 1: Station Microphone Source Discovery

**Files:**
- Modify: `tools/SynraJetsonStation/src/types.ts`
- Modify: `tools/SynraJetsonStation/src/microphone.ts`
- Create: `tools/SynraJetsonStation/tests/microphone-sources.test.mjs`
- Modify: `tools/SynraJetsonStation/package.json`

- [ ] **Step 1: Add the failing microphone source tests**

Create `tools/SynraJetsonStation/tests/microphone-sources.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  StationMicrophone,
  parseAlsaCaptureDevices,
  parsePulseAudioSources,
  preferredMicrophoneSource
} from "../dist/microphone.js";

test("parses pactl sources and prefers non-monitor input", () => {
  const sources = parsePulseAudioSources([
    "0\talsa_output.pci-0000_00_1f.3.analog-stereo.monitor\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED",
    "1\talsa_input.usb-046d_HD_Pro_Webcam_C920.analog-stereo\tPipeWire\ts16le 2ch 48000Hz\tRUNNING"
  ].join("\n"));

  assert.deepEqual(sources, [
    {
      id: "alsa_output.pci-0000_00_1f.3.analog-stereo.monitor",
      label: "alsa_output.pci-0000_00_1f.3.analog-stereo.monitor",
      present: true,
      configured: false,
      monitor: true
    },
    {
      id: "alsa_input.usb-046d_HD_Pro_Webcam_C920.analog-stereo",
      label: "alsa_input.usb-046d_HD_Pro_Webcam_C920.analog-stereo",
      present: true,
      configured: false,
      monitor: false
    }
  ]);
  assert.equal(preferredMicrophoneSource(sources)?.id, "alsa_input.usb-046d_HD_Pro_Webcam_C920.analog-stereo");
});

test("parses arecord capture cards when pactl is unavailable", () => {
  const devices = parseAlsaCaptureDevices([
    "card 2: Nano [NVIDIA Jetson], device 0: tegra-hda HDMI 0 [tegra-hda HDMI 0]",
    "  Subdevices: 1/1",
    "card 3: Webcam [USB Webcam], device 0: USB Audio [USB Audio]",
    "  Subdevices: 1/1"
  ].join("\n"));

  assert.deepEqual(devices, [
    {
      id: "hw:2,0",
      label: "NVIDIA Jetson tegra-hda HDMI 0",
      present: true,
      configured: false,
      monitor: false
    },
    {
      id: "hw:3,0",
      label: "USB Webcam USB Audio",
      present: true,
      configured: false,
      monitor: false
    }
  ]);
});

test("reports ready when explicit configured source is detected", () => {
  const mic = new StationMicrophone(true, {
    configuredSource: "alsa_input.usb-test.analog-stereo",
    discoverSources: () => [
      {
        id: "alsa_input.usb-test.analog-stereo",
        label: "USB Test Mic",
        present: true,
        configured: false,
        monitor: false
      }
    ]
  });

  const status = mic.debug();
  assert.equal(status.routeStatus, "ready");
  assert.equal(status.configuredSource, "alsa_input.usb-test.analog-stereo");
  assert.equal(status.sources[0].configured, true);
});

test("reports not-configured when inputs exist but no source is configured", () => {
  const mic = new StationMicrophone(true, {
    discoverSources: () => [
      {
        id: "alsa_input.usb-test.analog-stereo",
        label: "USB Test Mic",
        present: true,
        configured: false,
        monitor: false
      }
    ]
  });

  const status = mic.debug();
  assert.equal(status.routeStatus, "not-configured");
  assert.equal(status.configuredSource, null);
});

test("reports unavailable when no input sources are visible", () => {
  const mic = new StationMicrophone(true, { discoverSources: () => [] });
  const status = mic.debug();
  assert.equal(status.routeStatus, "unavailable");
});

test("reports degraded when configured source is missing", () => {
  const mic = new StationMicrophone(true, {
    configuredSource: "missing-source",
    discoverSources: () => [
      {
        id: "alsa_input.present.analog-stereo",
        label: "Present Mic",
        present: true,
        configured: false,
        monitor: false
      }
    ]
  });

  const status = mic.debug();
  assert.equal(status.routeStatus, "degraded");
  assert.equal(status.configuredSource, "missing-source");
  assert.match(status.lastError || "", /missing-source/);
});
```

- [ ] **Step 2: Run the microphone source tests and verify they fail**

Run:

```bash
npm --prefix tools/SynraJetsonStation run build
node --test tools/SynraJetsonStation/tests/microphone-sources.test.mjs
```

Expected: the build or tests fail because `parsePulseAudioSources`, `parseAlsaCaptureDevices`, `preferredMicrophoneSource`, and the injectable `StationMicrophone` constructor do not exist.

- [ ] **Step 3: Add the microphone source types**

Modify `tools/SynraJetsonStation/src/types.ts` so `StationAudioDevice` and `StationIdentitySmoke.microphone` carry the non-secret diagnostics used by the tests:

```ts
export interface StationAudioDevice {
  id: string;
  label: string;
  present: boolean;
  configured: boolean;
  monitor?: boolean;
}
```

Replace the `StationIdentitySmoke` microphone property with:

```ts
  microphone: {
    status: StationRouteStatus;
    configuredSource: string | null;
    sources: StationAudioDevice[];
    lastError: string | null;
  };
```

- [ ] **Step 4: Implement discovery and route status**

Replace `tools/SynraJetsonStation/src/microphone.ts` with:

```ts
import { execFileSync } from "node:child_process";
import type { StationAudioDevice, StationMicrophoneHealth, SynraSensorStatus } from "./types.js";

export interface StationMicrophoneOptions {
  configuredSource?: string | null;
  discoverSources?: () => StationAudioDevice[];
}

export function parsePulseAudioSources(output: string): StationAudioDevice[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const id = parts[1] || parts[0] || "";
      return {
        id,
        label: id,
        present: Boolean(id),
        configured: false,
        monitor: id.toLowerCase().includes("monitor")
      };
    })
    .filter((device) => device.present);
}

export function parseAlsaCaptureDevices(output: string): StationAudioDevice[] {
  const devices: StationAudioDevice[] = [];
  const pattern = /^card\s+(\d+):\s+([^\[]+)\[[^\]]+\],\s+device\s+(\d+):\s+([^\[]+)\[[^\]]+\]/i;
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = pattern.exec(line);
    if (!match) continue;
    const card = match[1];
    const cardLabel = match[2].trim();
    const device = match[3];
    const deviceLabel = match[4].trim();
    devices.push({
      id: `hw:${card},${device}`,
      label: `${cardLabel} ${deviceLabel}`.trim(),
      present: true,
      configured: false,
      monitor: false
    });
  }
  return devices;
}

export function preferredMicrophoneSource(sources: StationAudioDevice[]): StationAudioDevice | null {
  return sources.find((source) => source.present && !source.monitor) || sources.find((source) => source.present) || null;
}

function uniqueSources(sources: StationAudioDevice[]): StationAudioDevice[] {
  const seen = new Set<string>();
  const unique: StationAudioDevice[] = [];
  for (const source of sources) {
    if (!source.id || seen.has(source.id)) continue;
    seen.add(source.id);
    unique.push(source);
  }
  return unique;
}

export function discoverMicrophoneSources(): StationAudioDevice[] {
  const sources: StationAudioDevice[] = [];
  try {
    sources.push(...parsePulseAudioSources(execFileSync("pactl", ["list", "short", "sources"], { encoding: "utf8", timeout: 1500 })));
  } catch {
    // PulseAudio/PipeWire is optional on Jetson; ALSA probing below is the fallback.
  }
  try {
    sources.push(...parseAlsaCaptureDevices(execFileSync("arecord", ["-l"], { encoding: "utf8", timeout: 1500 })));
  } catch {
    // No ALSA capture list available.
  }
  return uniqueSources(sources);
}

export class StationMicrophone {
  private statusValue: SynraSensorStatus;
  private lastErrorValue: string | null = null;

  constructor(
    private readonly enabled: boolean,
    private readonly options: StationMicrophoneOptions = {}
  ) {
    this.statusValue = enabled ? "available" : "unavailable";
  }

  get status(): SynraSensorStatus {
    return this.statusValue;
  }

  get lastError(): string | null {
    return this.lastErrorValue;
  }

  setStatus(status: SynraSensorStatus): void {
    if (!this.enabled && status !== "unavailable") {
      this.lastErrorValue = "Microphone status update ignored because local speech capture is not wired.";
      this.statusValue = "unavailable";
      return;
    }
    this.statusValue = status;
    if (status !== "permissionDenied") this.lastErrorValue = null;
  }

  async startListening(): Promise<never> {
    this.lastErrorValue = "Microphone listening is intentionally disabled until visible Jetson capture control is wired.";
    this.statusValue = this.enabled ? "available" : "unavailable";
    throw new Error(this.lastErrorValue);
  }

  debug(): StationMicrophoneHealth {
    const envSource = process.env.SYNRA_MICROPHONE_SOURCE?.trim() || null;
    const configuredSource = this.options.configuredSource ?? envSource;
    const discovered = this.options.discoverSources ? this.options.discoverSources() : discoverMicrophoneSources();
    const preferred = configuredSource ? null : preferredMicrophoneSource(discovered);
    const selectedSource = configuredSource || preferred?.id || null;
    const sources = discovered.map((source) => ({ ...source, configured: Boolean(selectedSource && source.id === selectedSource) }));
    const routeStatus = this.microphoneRouteStatus(selectedSource, sources);
    return {
      enabled: this.enabled,
      status: this.statusValue,
      lastError: this.lastErrorValue,
      configuredSource: selectedSource,
      sources,
      routeStatus
    };
  }

  private microphoneRouteStatus(configuredSource: string | null, sources: StationAudioDevice[]): StationMicrophoneHealth["routeStatus"] {
    if (!this.enabled) return "unavailable";
    if (!sources.length) {
      this.lastErrorValue = "No Jetson microphone input sources were detected.";
      return "unavailable";
    }
    if (!configuredSource) {
      this.lastErrorValue = null;
      return "not-configured";
    }
    if (!sources.some((source) => source.id === configuredSource && source.present)) {
      this.lastErrorValue = `Configured microphone source was not detected: ${configuredSource}`;
      return "degraded";
    }
    this.lastErrorValue = null;
    return "ready";
  }
}
```

- [ ] **Step 5: Add the new tests to the Station test script**

Modify `tools/SynraJetsonStation/package.json`:

```json
"test:kiosk": "npm run build && node --test tests/kiosk-config.test.mjs tests/device-health.test.mjs tests/microphone-sources.test.mjs tests/identity-smoke.test.mjs"
```

- [ ] **Step 6: Run the microphone source tests and commit**

Run:

```bash
npm --prefix tools/SynraJetsonStation run test:kiosk
```

Expected: PASS for kiosk config, device health, microphone sources, and identity smoke tests.

Commit:

```bash
git add tools/SynraJetsonStation/src/types.ts tools/SynraJetsonStation/src/microphone.ts tools/SynraJetsonStation/tests/microphone-sources.test.mjs tools/SynraJetsonStation/package.json
git commit -m "Add Jetson microphone source discovery"
```

## Task 2: Station Identity Count Persistence

**Files:**
- Create: `tools/SynraJetsonStation/src/identity-counts.ts`
- Modify: `tools/SynraJetsonStation/src/health.ts`
- Modify: `tools/SynraJetsonStation/tests/device-health.test.mjs`
- Create: `tools/SynraJetsonStation/tests/identity-counts.test.mjs`
- Modify: `tools/SynraJetsonStation/package.json`

- [ ] **Step 1: Add the failing identity count persistence tests**

Create `tools/SynraJetsonStation/tests/identity-counts.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import {
  clampIdentityCounts,
  identityCountsPath,
  readIdentityCounts,
  writeIdentityCounts
} from "../dist/identity-counts.js";

test("clamps identity counts to the local enrollment limits", () => {
  assert.deepEqual(clampIdentityCounts({ faceSampleCount: 99, voiceSampleCount: 99 }), {
    faceSampleCount: 7,
    voiceSampleCount: 3
  });
  assert.deepEqual(clampIdentityCounts({ faceSampleCount: -5, voiceSampleCount: -1 }), {
    faceSampleCount: 0,
    voiceSampleCount: 0
  });
});

test("persists count-only identity metadata", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "synra-identity-counts-"));
  const previousPath = process.env.SYNRA_IDENTITY_COUNTS_PATH;
  process.env.SYNRA_IDENTITY_COUNTS_PATH = path.join(dir, "identity.json");

  try {
    await writeIdentityCounts({ faceSampleCount: 8, voiceSampleCount: 2 });
    const counts = await readIdentityCounts();
    assert.equal(counts.faceSampleCount, 7);
    assert.equal(counts.voiceSampleCount, 2);
    assert.match(counts.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

    const raw = await readFile(identityCountsPath(), "utf8");
    assert.equal(raw.includes("faceSamples"), false);
    assert.equal(raw.includes("voicePrints"), false);
    assert.equal(raw.includes("token"), false);
  } finally {
    if (previousPath === undefined) delete process.env.SYNRA_IDENTITY_COUNTS_PATH;
    else process.env.SYNRA_IDENTITY_COUNTS_PATH = previousPath;
    await rm(dir, { recursive: true, force: true });
  }
});

test("missing update fields preserve existing persisted values", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "synra-identity-counts-"));
  const previousPath = process.env.SYNRA_IDENTITY_COUNTS_PATH;
  process.env.SYNRA_IDENTITY_COUNTS_PATH = path.join(dir, "identity.json");

  try {
    await writeIdentityCounts({ faceSampleCount: 4, voiceSampleCount: 1 });
    await writeIdentityCounts({ voiceSampleCount: 3 });
    const counts = await readIdentityCounts();
    assert.equal(counts.faceSampleCount, 4);
    assert.equal(counts.voiceSampleCount, 3);
  } finally {
    if (previousPath === undefined) delete process.env.SYNRA_IDENTITY_COUNTS_PATH;
    else process.env.SYNRA_IDENTITY_COUNTS_PATH = previousPath;
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the identity count tests and verify they fail**

Run:

```bash
npm --prefix tools/SynraJetsonStation run build
node --test tools/SynraJetsonStation/tests/identity-counts.test.mjs
```

Expected: FAIL because `dist/identity-counts.js` does not exist.

- [ ] **Step 3: Implement count-only persistence**

Create `tools/SynraJetsonStation/src/identity-counts.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface StationIdentityCounts {
  faceSampleCount: number;
  voiceSampleCount: number;
  updatedAt: string | null;
}

export interface StationIdentityCountsUpdate {
  faceSampleCount?: unknown;
  voiceSampleCount?: unknown;
}

const DEFAULT_COUNTS: StationIdentityCounts = {
  faceSampleCount: 0,
  voiceSampleCount: 0,
  updatedAt: null
};

function clampNumber(value: unknown, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(max, Math.max(0, Math.floor(parsed)));
}

export function clampIdentityCounts(update: StationIdentityCountsUpdate): Omit<StationIdentityCounts, "updatedAt"> {
  return {
    faceSampleCount: clampNumber(update.faceSampleCount, 7),
    voiceSampleCount: clampNumber(update.voiceSampleCount, 3)
  };
}

export function identityCountsPath(): string {
  return process.env.SYNRA_IDENTITY_COUNTS_PATH?.trim()
    || path.join(os.homedir(), ".config", "synra-jetson-station-identity.json");
}

export async function readIdentityCounts(): Promise<StationIdentityCounts> {
  try {
    const raw = JSON.parse(await fs.readFile(identityCountsPath(), "utf8")) as Partial<StationIdentityCounts>;
    const counts = clampIdentityCounts(raw);
    return {
      ...counts,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null
    };
  } catch {
    return DEFAULT_COUNTS;
  }
}

export async function writeIdentityCounts(update: StationIdentityCountsUpdate): Promise<StationIdentityCounts> {
  const previous = await readIdentityCounts();
  const merged = {
    faceSampleCount: update.faceSampleCount === undefined ? previous.faceSampleCount : update.faceSampleCount,
    voiceSampleCount: update.voiceSampleCount === undefined ? previous.voiceSampleCount : update.voiceSampleCount
  };
  const counts = clampIdentityCounts(merged);
  const next: StationIdentityCounts = {
    ...counts,
    updatedAt: new Date().toISOString()
  };
  const file = identityCountsPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}
```

- [ ] **Step 4: Wire health to read persisted counts**

Modify `tools/SynraJetsonStation/src/health.ts`:

```ts
import { readIdentityCounts, type StationIdentityCounts } from "./identity-counts.js";
```

Replace `numberFromEnv` with:

```ts
function countsFromEnvFallback(): StationIdentityCounts {
  const faceSampleCount = Number(process.env.SYNRA_FACE_SAMPLE_COUNT || 0);
  const voiceSampleCount = Number(process.env.SYNRA_VOICE_SAMPLE_COUNT || 0);
  return {
    faceSampleCount: Number.isFinite(faceSampleCount) ? Math.max(0, Math.floor(faceSampleCount)) : 0,
    voiceSampleCount: Number.isFinite(voiceSampleCount) ? Math.max(0, Math.floor(voiceSampleCount)) : 0,
    updatedAt: null
  };
}
```

Change `identitySmoke` into an async function:

```ts
async function identitySmoke(camera: StationCamera, microphone: StationMicrophone): Promise<StationIdentitySmoke> {
  const cameraDebug = camera.debug();
  const microphoneDebug = microphone.debug();
  const sttError = process.env.SYNRA_STT_LAST_ERROR || null;
  const sttProvider = process.env.SYNRA_STT_PROVIDER || "browser-fallback";
  const persistedCounts = await readIdentityCounts();
  const fallbackCounts = countsFromEnvFallback();
  const faceSampleCount = persistedCounts.updatedAt ? persistedCounts.faceSampleCount : fallbackCounts.faceSampleCount;
  const voiceSampleCount = persistedCounts.updatedAt ? persistedCounts.voiceSampleCount : fallbackCounts.voiceSampleCount;
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
      sources: microphoneDebug.sources,
      lastError: microphoneDebug.lastError
    },
    stt: {
      status: routeStatusFromStt(sttProvider, sttError),
      provider: sttProvider,
      lastError: sttError
    },
    speaker: {
      status: "ready",
      provider: process.env.SYNRA_SPEAKER_PROVIDER || "system",
      lastError: null
    },
    identity: {
      faceSampleCount,
      voiceSampleCount,
      updatedAt: persistedCounts.updatedAt,
      rawSamplesIncluded: false,
      secretsIncluded: false
    }
  };
}
```

In `collectHealth`, change:

```ts
  const identitySmokeReport = identitySmoke(camera, microphone);
```

to:

```ts
  const identitySmokeReport = await identitySmoke(camera, microphone);
```

- [ ] **Step 5: Add `updatedAt` to the identity smoke type**

Modify `tools/SynraJetsonStation/src/types.ts`:

```ts
  identity: {
    faceSampleCount: number;
    voiceSampleCount: number;
    updatedAt: string | null;
    rawSamplesIncluded: false;
    secretsIncluded: false;
  };
```

- [ ] **Step 6: Extend device health test for persisted counts**

In `tools/SynraJetsonStation/tests/device-health.test.mjs`, add imports:

```js
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { writeIdentityCounts } from "../dist/identity-counts.js";
```

Inside the test before `collectHealth`, add:

```js
  const dir = await mkdtemp(path.join(os.tmpdir(), "synra-device-health-"));
  const previousCountsPath = process.env.SYNRA_IDENTITY_COUNTS_PATH;
  process.env.SYNRA_IDENTITY_COUNTS_PATH = path.join(dir, "identity.json");
  await writeIdentityCounts({ faceSampleCount: 7, voiceSampleCount: 3 });
```

After the existing identity smoke assertions, add:

```js
    assert.equal(health.identitySmoke.identity.faceSampleCount, 7);
    assert.equal(health.identitySmoke.identity.voiceSampleCount, 3);
```

In the `finally` block, restore the env var and delete the temp directory:

```js
    if (previousCountsPath === undefined) delete process.env.SYNRA_IDENTITY_COUNTS_PATH;
    else process.env.SYNRA_IDENTITY_COUNTS_PATH = previousCountsPath;
    await rm(dir, { recursive: true, force: true });
```

- [ ] **Step 7: Add the persistence test to the Station test script**

Modify `tools/SynraJetsonStation/package.json`:

```json
"test:kiosk": "npm run build && node --test tests/kiosk-config.test.mjs tests/device-health.test.mjs tests/microphone-sources.test.mjs tests/identity-counts.test.mjs tests/identity-smoke.test.mjs"
```

- [ ] **Step 8: Run persistence tests and commit**

Run:

```bash
npm --prefix tools/SynraJetsonStation run test:kiosk
```

Expected: PASS.

Commit:

```bash
git add tools/SynraJetsonStation/src/types.ts tools/SynraJetsonStation/src/identity-counts.ts tools/SynraJetsonStation/src/health.ts tools/SynraJetsonStation/tests/device-health.test.mjs tools/SynraJetsonStation/tests/identity-counts.test.mjs tools/SynraJetsonStation/package.json
git commit -m "Persist safe Station identity counts"
```

## Task 3: Station Identity Counts HTTP Endpoint

**Files:**
- Modify: `tools/SynraJetsonStation/src/station-server.ts`
- Modify: `tools/SynraJetsonStation/tests/identity-smoke.test.mjs`

- [ ] **Step 1: Add the failing HTTP endpoint test**

In `tools/SynraJetsonStation/tests/identity-smoke.test.mjs`, update the child env in the existing test:

```js
      SYNRA_IDENTITY_COUNTS_PATH: path.join(dir, "identity.json"),
```

Add imports:

```js
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
```

Wrap the test body in a temp directory:

```js
  const dir = await mkdtemp(path.join(os.tmpdir(), "synra-identity-smoke-"));
```

Add this request after the first `/station/identity-smoke` assertion:

```js
    const updateResponse = await fetch(`http://127.0.0.1:${port}/station/identity-counts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        faceSampleCount: 8,
        voiceSampleCount: 2,
        faceSamples: ["data:image/jpeg;base64,should-not-be-stored"],
        voicePrints: [{ bins: [1, 2, 3] }],
        token: "secret-token-that-must-not-leak"
      })
    });
    const updateBody = await updateResponse.json();
    assert.equal(updateResponse.status, 200);
    assert.equal(updateBody.identity.faceSampleCount, 7);
    assert.equal(updateBody.identity.voiceSampleCount, 2);
    assert.equal(JSON.stringify(updateBody).includes("should-not-be-stored"), false);
    assert.equal(JSON.stringify(updateBody).includes("secret-token-that-must-not-leak"), false);
```

In `finally`, add:

```js
    await rm(dir, { recursive: true, force: true });
```

- [ ] **Step 2: Run the HTTP test and verify it fails**

Run:

```bash
npm --prefix tools/SynraJetsonStation run build
node --test tools/SynraJetsonStation/tests/identity-smoke.test.mjs
```

Expected: FAIL with a 404 for `/station/identity-counts`.

- [ ] **Step 3: Add endpoint implementation**

In `tools/SynraJetsonStation/src/station-server.ts`, add import:

```ts
import { writeIdentityCounts } from "./identity-counts.js";
```

In `handlePost`, add this case before `/station/bridge`:

```ts
    case "/station/identity-counts": {
      await writeIdentityCounts({
        faceSampleCount: body.faceSampleCount,
        voiceSampleCount: body.voiceSampleCount
      });
      return sendJson(res, 200, await stationIdentitySmokePayload());
    }
```

- [ ] **Step 4: Run Station tests and commit**

Run:

```bash
npm --prefix tools/SynraJetsonStation run test:kiosk
```

Expected: PASS.

Commit:

```bash
git add tools/SynraJetsonStation/src/station-server.ts tools/SynraJetsonStation/tests/identity-smoke.test.mjs
git commit -m "Add Station identity counts endpoint"
```

## Task 4: Standalone Server Proxy

**Files:**
- Modify: `scripts/synra_server.py`

- [ ] **Step 1: Add the Station count proxy helper**

In `scripts/synra_server.py`, below `station_identity_smoke_status`, add:

```py
def post_station_identity_counts(face_sample_count: Any, voice_sample_count: Any) -> dict[str, Any]:
    url = os.environ.get("SYNRA_STATION_IDENTITY_COUNTS_URL", "http://127.0.0.1:4788/station/identity-counts").strip()
    if not url:
        return {"ok": False, "error": "Station identity counts URL is not configured."}
    payload = {
        "faceSampleCount": face_sample_count,
        "voiceSampleCount": voice_sample_count,
    }
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        method="POST",
    )
    timeout = float(os.environ.get("SYNRA_STATION_HEALTH_TIMEOUT", "0.8"))
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = json.loads(response.read().decode("utf-8"))
        return body if isinstance(body, dict) else {"ok": False, "error": "Station returned a non-object response."}
```

- [ ] **Step 2: Add the POST route**

In `SynraHandler.do_POST`, before `/api/settings/save`, add:

```py
        if self.path.startswith("/api/station/identity-counts"):
            self.handle_station_identity_counts()
            return
```

- [ ] **Step 3: Add the route handler**

In `SynraHandler`, place this method near the other API handlers:

```py
    def handle_station_identity_counts(self) -> None:
        try:
            body = self.read_json_body()
            response = post_station_identity_counts(
                body.get("faceSampleCount"),
                body.get("voiceSampleCount"),
            )
            self.send_json(200, {"ok": True, "identitySmoke": response})
        except urllib.error.HTTPError as error:
            self.send_json(200, {"ok": False, "error": describe_http_error("Station identity counts", error)})
        except urllib.error.URLError as error:
            self.send_json(200, {"ok": False, "error": f"Station identity counts is unreachable: {error.reason}."})
        except Exception as error:
            self.send_json(200, {"ok": False, "error": str(error)})
```

- [ ] **Step 4: Syntax-check and commit**

Run:

```bash
python3 -m py_compile scripts/synra_server.py
```

Expected: no output and exit code 0.

Commit:

```bash
git add scripts/synra_server.py
git commit -m "Proxy Standalone identity counts to Station"
```

## Task 5: Standalone Enrollment Count Sync

**Files:**
- Modify: `src/main.ts`
- Create: `scripts/audit-station-identity-counts-sync.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add the failing count-only sync audit**

Create `scripts/audit-station-identity-counts-sync.mjs`:

```js
#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const main = readFileSync(join(root, "src/main.ts"), "utf8");

function requireText(label, haystack, needle) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label} missing: ${needle}`);
  }
}

requireText("sync function", main, "async function syncStationIdentityCounts");
requireText("count endpoint", main, 'fetch("/api/station/identity-counts"');
requireText("health refresh", main, "await refreshSmartRecognitionHealth");
requireText("face sync", main, "await syncStationIdentityCounts({ faceSampleCount: faceCount, voiceSampleCount: voiceCount });");
requireText("voice sync", main, "await syncStationIdentityCounts({ faceSampleCount: faceCount, voiceSampleCount: voiceCount });");

const syncFunction = main.slice(main.indexOf("async function syncStationIdentityCounts"), main.indexOf("function stationRouteToIdentityDevice"));
for (const forbidden of ["faceSamples", "facePoseSamples", "pendingFacePoseSamples", "voicePrints", "pendingVoicePrints", "dataUrl", "blob"]) {
  if (syncFunction.includes(forbidden)) {
    throw new Error(`syncStationIdentityCounts must not send raw enrollment material: ${forbidden}`);
  }
}

console.log("Station identity count sync audit passed.");
```

- [ ] **Step 2: Run the audit and verify it fails**

Run:

```bash
node scripts/audit-station-identity-counts-sync.mjs
```

Expected: FAIL because `syncStationIdentityCounts` is not implemented.

- [ ] **Step 3: Add Smart Recognition health refresh helpers**

In `src/main.ts`, above `identityStatusFromStationHealth`, add:

```ts
async function refreshSmartRecognitionHealth(): Promise<void> {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) return;
    const health = (await response.json()) as { identitySmoke?: unknown };
    refreshSmartRecognitionFromHealth(health);
  } catch {
    renderSmartRecognition(normalizeIdentityStatus({
      ...state.identityStatus,
      readiness: {
        ...state.identityStatus.readiness,
        summary: "Station identity smoke is unavailable; local enrollment state is still saved."
      }
    }));
  }
}

async function syncStationIdentityCounts(counts: { faceSampleCount: number; voiceSampleCount: number }): Promise<void> {
  try {
    const response = await fetch("/api/station/identity-counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        faceSampleCount: Math.max(0, Math.floor(counts.faceSampleCount)),
        voiceSampleCount: Math.max(0, Math.floor(counts.voiceSampleCount))
      })
    });
    if (response.ok) {
      const body = (await response.json()) as { ok?: boolean; identitySmoke?: unknown };
      if (body.identitySmoke) refreshSmartRecognitionFromHealth({ identitySmoke: body.identitySmoke });
    }
  } catch {
    setSynraState("idle", "Enrollment saved locally. Station identity count sync is unavailable.");
  } finally {
    await refreshSmartRecognitionHealth();
  }
}
```

- [ ] **Step 4: Sync after accepted wizard face samples**

In `captureIdentityWizardFacePose`, immediately after:

```ts
    pendingFacePoseSamples = { ...pendingFacePoseSamples, [pose]: capture.dataUrl };
```

add:

```ts
    const { faceCount, voiceCount } = wizardEnrollmentCounts();
    await syncStationIdentityCounts({ faceSampleCount: faceCount, voiceSampleCount: voiceCount });
```

- [ ] **Step 5: Sync after accepted wizard voice samples**

In `captureIdentityWizardVoiceSample`, immediately after:

```ts
    pendingVoicePrints = [...pendingVoicePrints, voicePrint].slice(-REQUIRED_VOICE_SAMPLE_COUNT);
```

add:

```ts
    const { faceCount, voiceCount } = wizardEnrollmentCounts();
    await syncStationIdentityCounts({ faceSampleCount: faceCount, voiceSampleCount: voiceCount });
```

- [ ] **Step 6: Sync after accepted compact settings face samples**

In `captureKnownUserFaceSample`, immediately after:

```ts
    pendingFacePoseSamples = { ...pendingFacePoseSamples, [pose]: capture.dataUrl };
```

add:

```ts
    const existing = currentEnrollmentUser();
    const savedFaceSamples = normalizeFacePoseSamples(existing?.facePoseSamples);
    const faceCount = FACE_ENROLLMENT_POSES.filter((facePose) => savedFaceSamples[facePose] || pendingFacePoseSamples[facePose]).length;
    const voiceCount = Math.min((existing?.voicePrints?.length ?? 0) + pendingVoicePrints.length, REQUIRED_VOICE_SAMPLE_COUNT);
    await syncStationIdentityCounts({ faceSampleCount: faceCount, voiceSampleCount: voiceCount });
```

- [ ] **Step 7: Sync after accepted compact settings voice samples**

In `captureKnownUserVoiceSample`, immediately after:

```ts
    pendingVoicePrints = [...pendingVoicePrints, voicePrint].slice(-REQUIRED_VOICE_SAMPLE_COUNT);
```

add:

```ts
    const existing = currentEnrollmentUser();
    const savedFaceSamples = normalizeFacePoseSamples(existing?.facePoseSamples);
    const faceCount = FACE_ENROLLMENT_POSES.filter((facePose) => savedFaceSamples[facePose] || pendingFacePoseSamples[facePose]).length;
    const voiceCount = Math.min((existing?.voicePrints?.length ?? 0) + pendingVoicePrints.length, REQUIRED_VOICE_SAMPLE_COUNT);
    await syncStationIdentityCounts({ faceSampleCount: faceCount, voiceSampleCount: voiceCount });
```

- [ ] **Step 8: Add audit script to root package**

Modify `package.json` by adding this entry immediately after `audit:identity-readiness`:

```json
"audit:station-identity-counts": "node scripts/audit-station-identity-counts-sync.mjs",
```

- [ ] **Step 9: Run Standalone audits and commit**

Run:

```bash
node scripts/audit-station-identity-counts-sync.mjs
npm run typecheck
npm run audit:identity-contract
npm run audit:cross-app-identity
```

Expected: PASS.

Commit:

```bash
git add src/main.ts scripts/audit-station-identity-counts-sync.mjs package.json
git commit -m "Sync accepted enrollment counts to Station"
```

## Task 6: Full Local Verification

**Files:**
- No source edits unless a verification command exposes a defect.

- [ ] **Step 1: Run the complete Standalone and Station gates**

Run:

```bash
npm run typecheck
npm run audit:identity-contract
npm run audit:cross-app-identity
npm run audit:station-identity-counts
npm run station:test
npm run build
```

Expected: all commands pass.

- [ ] **Step 2: Inspect git status before deployment**

Run:

```bash
git status --short
```

Expected: either clean or only intentional documentation changes for Task 7.

## Task 7: Jetson Deploy And Live Verification

**Files:**
- Modify: `docs/jetson-findings.md`

- [ ] **Step 1: Discover and persist the Jetson microphone source**

Run:

```bash
ssh matthew@192.168.1.165 'set -e
mkdir -p "$HOME/.config"
SOURCE="$(pactl list short sources 2>/dev/null | awk '"'"'$2 !~ /monitor/ && $2 != "" {print $2; exit}'"'"')"
if [ -z "$SOURCE" ]; then
  SOURCE="$(arecord -l 2>/dev/null | awk '"'"'/^card / {gsub(":", "", $2); gsub(":", "", $6); print "hw:"$2","$6; exit}'"'"')"
fi
if [ -z "$SOURCE" ]; then
  echo "No Jetson capture source found" >&2
  exit 2
fi
ENV_FILE="$HOME/.config/synra-jetson-station.env"
grep -v "^SYNRA_MICROPHONE_SOURCE=" "$ENV_FILE" 2>/dev/null > "$ENV_FILE.tmp" || true
printf "SYNRA_MICROPHONE_SOURCE=%s\n" "$SOURCE" >> "$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"
echo "$SOURCE"'
```

Expected: prints a real source id such as `alsa_input...` or `hw:3,0`.

- [ ] **Step 2: Deploy Standalone and Station to Jetson**

Run:

```bash
git push origin HEAD
rsync -az --delete --exclude node_modules --exclude .git ./ matthew@192.168.1.165:~/SynraStandalone/
ssh matthew@192.168.1.165 'set -e
cd ~/SynraStandalone
npm install
npm run build
npm --prefix tools/SynraJetsonStation install
npm --prefix tools/SynraJetsonStation run build
sudo systemctl restart synra-jetson-station.service synra-standalone.service synra-electron-kiosk.service
systemctl --no-pager --full status synra-jetson-station.service synra-standalone.service synra-electron-kiosk.service | sed -n "1,90p"'
```

Expected: all three services show `Active: active (running)`.

- [ ] **Step 3: Verify live identity smoke**

Run:

```bash
curl -s http://192.168.1.165:5191/api/health | python3 -m json.tool
curl -s http://192.168.1.165:4788/station/identity-smoke | python3 -m json.tool
```

Expected:

```json
{
  "microphone": {
    "status": "ready"
  },
  "stt": {
    "status": "ready",
    "provider": "browser-fallback"
  },
  "identity": {
    "rawSamplesIncluded": false,
    "secretsIncluded": false
  }
}
```

- [ ] **Step 4: Verify count endpoint on Jetson without raw data**

Run:

```bash
curl -s -X POST http://192.168.1.165:4788/station/identity-counts \
  -H 'Content-Type: application/json' \
  -d '{"faceSampleCount":1,"voiceSampleCount":1,"faceSamples":["data:image/jpeg;base64,blocked"],"voicePrints":[{"bins":[1,2]}],"token":"blocked-secret"}' \
  | python3 -m json.tool
```

Expected: response includes `identity.faceSampleCount: 1`, `identity.voiceSampleCount: 1`, `rawSamplesIncluded: false`, `secretsIncluded: false`, and does not include `blocked` or `blocked-secret`.

- [ ] **Step 5: Verify real enrollment from the UI**

Open `http://192.168.1.165:5191` or the Jetson kiosk, go to Settings, and capture one accepted face pose and one accepted voice sample. Then run:

```bash
curl -s http://192.168.1.165:5191/api/health | python3 -m json.tool
```

Expected: `identitySmoke.identity.faceSampleCount` and `identitySmoke.identity.voiceSampleCount` match the accepted samples shown in Smart Recognition; rejected samples do not increase counts.

- [ ] **Step 6: Document Jetson findings and commit**

Add this entry to `docs/jetson-findings.md`:

```md
## 2026-06-22 Jetson Microphone And Real Enrollment Verification

- `synra-jetson-station.service`, `synra-standalone.service`, and `synra-electron-kiosk.service` were restarted after deploying the count-only identity smoke update.
- `SYNRA_MICROPHONE_SOURCE` is stored in `~/.config/synra-jetson-station.env`.
- `/station/identity-smoke` reports camera, microphone, STT, speaker, and count-only identity state.
- `/station/identity-counts` accepts only `faceSampleCount` and `voiceSampleCount`; raw frames, audio, voice prints, tokens, and prompts are ignored.
- Standalone Smart Recognition refreshes from `/api/health.identitySmoke` after accepted enrollment samples.
```

Run:

```bash
git add docs/jetson-findings.md
git commit -m "Document Jetson real enrollment verification"
git push origin HEAD
```

Expected: push succeeds.

## Task 8: Final Verification Report

**Files:**
- No source edits.

- [ ] **Step 1: Capture final local status**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: working tree is clean after the pushed documentation commit.

- [ ] **Step 2: Capture final Jetson status**

Run:

```bash
ssh matthew@192.168.1.165 'systemctl is-active synra-jetson-station.service synra-standalone.service synra-electron-kiosk.service'
curl -s http://192.168.1.165:5191/api/health | python3 -c 'import json,sys; h=json.load(sys.stdin); s=h.get("identitySmoke") or {}; print(json.dumps({"stationIdentitySmokeAvailable": h.get("stationIdentitySmokeAvailable"), "camera": s.get("camera", {}).get("status"), "microphone": s.get("microphone", {}).get("status"), "stt": s.get("stt", {}).get("status"), "faceSampleCount": s.get("identity", {}).get("faceSampleCount"), "voiceSampleCount": s.get("identity", {}).get("voiceSampleCount"), "rawSamplesIncluded": s.get("identity", {}).get("rawSamplesIncluded"), "secretsIncluded": s.get("identity", {}).get("secretsIncluded")}, indent=2))'
```

Expected: services are `active`, Station smoke is available, microphone is `ready` when the Jetson has a detected input, and raw/secrets flags are false.

## Self-Review

- Spec coverage: microphone discovery is covered in Task 1; persisted counts are covered in Task 2; count-only Station endpoint is covered in Task 3; Standalone proxy and UX sync are covered in Tasks 4 and 5; local and Jetson verification are covered in Tasks 6 and 7; privacy redaction is covered by tests and audits.
- Placeholder scan: this plan uses concrete files, code snippets, commands, and expected outputs. It does not contain delayed-work markers.
- Type consistency: `StationAudioDevice.monitor`, `StationIdentityCounts`, `identitySmoke.identity.updatedAt`, `syncStationIdentityCounts`, and `/api/station/identity-counts` are named consistently across tasks.
