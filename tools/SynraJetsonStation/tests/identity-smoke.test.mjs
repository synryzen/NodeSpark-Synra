import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

test("station identity smoke response is redaction safe", async () => {
  const port = String(52991 + Math.floor(Math.random() * 1000));
  const dir = await mkdtemp(path.join(os.tmpdir(), "synra-identity-smoke-"));
  const child = spawn(process.execPath, ["dist/station-server.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      STATION_HOST: "127.0.0.1",
      STATION_PORT: port,
      STATION_SIMULATE: "1",
      STATION_CAMERA_ENABLED: "1",
      STATION_MICROPHONE_ENABLED: "1",
      SYNRA_IDENTITY_COUNTS_PATH: path.join(dir, "identity.json"),
      HUB_DEVICE_TOKEN: "secret-token-that-must-not-leak",
      SYNRA_STT_LAST_ERROR: "HTTP 401",
      SYNRA_STT_PROVIDER: "elevenlabs"
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
  } finally {
    child.kill("SIGTERM");
    await rm(dir, { recursive: true, force: true });
  }
});

async function waitForServer(port) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/station/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("station server did not start");
}
