import test from "node:test";
import assert from "node:assert/strict";
import { collectHealth } from "../dist/health.js";
import { StationCamera } from "../dist/camera.js";
import { StationMicrophone } from "../dist/microphone.js";

test("station health reports explicit identity device routes without raw samples or secrets", async () => {
  const previousSttError = process.env.SYNRA_STT_LAST_ERROR;
  const previousSttProvider = process.env.SYNRA_STT_PROVIDER;
  process.env.SYNRA_STT_LAST_ERROR = "HTTP 401";
  process.env.SYNRA_STT_PROVIDER = "elevenlabs";

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
    assert.equal(health.identitySmoke.stt.status, "degraded");
    assert.equal(JSON.stringify(health.identitySmoke).includes("secret-token"), false);
  } finally {
    if (previousSttError === undefined) delete process.env.SYNRA_STT_LAST_ERROR;
    else process.env.SYNRA_STT_LAST_ERROR = previousSttError;
    if (previousSttProvider === undefined) delete process.env.SYNRA_STT_PROVIDER;
    else process.env.SYNRA_STT_PROVIDER = previousSttProvider;
  }
});
