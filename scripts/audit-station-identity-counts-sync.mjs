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
