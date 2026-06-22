import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { collectHealth } from "../dist/health.js";
import { StationCamera } from "../dist/camera.js";
import { StationMicrophone } from "../dist/microphone.js";
import { writeIdentityCounts } from "../dist/identity-counts.js";

test("station health reports explicit identity device routes without raw samples or secrets", async () => {
  const previousSttError = process.env.SYNRA_STT_LAST_ERROR;
  const previousSttProvider = process.env.SYNRA_STT_PROVIDER;
  const dir = await mkdtemp(path.join(os.tmpdir(), "synra-device-health-"));
  const previousCountsPath = process.env.SYNRA_IDENTITY_COUNTS_PATH;
  process.env.SYNRA_STT_LAST_ERROR = "HTTP 401";
  process.env.SYNRA_STT_PROVIDER = "elevenlabs";
  process.env.SYNRA_IDENTITY_COUNTS_PATH = path.join(dir, "identity.json");
  await writeIdentityCounts({ faceSampleCount: 7, voiceSampleCount: 3 });

  try {
    const health = await collectHealth(
      {
        rootDir: process.cwd(),
        host: "127.0.0.1",
        port: 5191,
        hubBaseUrl: "http://127.0.0.1:3000",
        hubToken: "secret-token",
        deviceId: "test-station",
        displayName: "Test Station",
        appVersion: "4.4.0",
        osVersion: "test",
        simulate: true,
        once: false,
        cameraEnabled: true,
        microphoneEnabled: true,
        localVision: true,
        localSpeech: true,
        chromiumBin: null,
        heartbeatIntervalMs: 30000
      },
      {
        startedAtMs: Date.now(),
        synraRuntimePresent: true,
        hubConnected: false,
        hubBaseUrl: "http://127.0.0.1:3000",
        lastHeartbeatAt: null,
        lastHubError: null,
        mockMode: true,
        lastError: null
      },
      new StationCamera(true),
      new StationMicrophone(true)
    );

    assert.match(health.camera.routeStatus, /^(ready|degraded|not-configured|unavailable)$/);
    assert.match(health.microphone.routeStatus, /^(ready|not-configured|unavailable)$/);
    assert.equal(health.identitySmoke.identity.rawSamplesIncluded, false);
    assert.equal(health.identitySmoke.identity.secretsIncluded, false);
    assert.equal(health.identitySmoke.identity.faceSampleCount, 7);
    assert.equal(health.identitySmoke.identity.voiceSampleCount, 3);
    assert.equal(health.identitySmoke.stt.status, "degraded");
    assert.equal(JSON.stringify(health.identitySmoke).includes("secret-token"), false);
  } finally {
    if (previousSttError === undefined) delete process.env.SYNRA_STT_LAST_ERROR;
    else process.env.SYNRA_STT_LAST_ERROR = previousSttError;
    if (previousSttProvider === undefined) delete process.env.SYNRA_STT_PROVIDER;
    else process.env.SYNRA_STT_PROVIDER = previousSttProvider;
    if (previousCountsPath === undefined) delete process.env.SYNRA_IDENTITY_COUNTS_PATH;
    else process.env.SYNRA_IDENTITY_COUNTS_PATH = previousCountsPath;
    await rm(dir, { recursive: true, force: true });
  }
});
