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
