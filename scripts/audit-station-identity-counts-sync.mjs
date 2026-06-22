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

function functionBody(name) {
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

function requireFunctionText(functionName, label, needle) {
  requireText(`${functionName} ${label}`, functionBody(functionName), needle);
}

requireText("sync function", main, "async function syncStationIdentityCounts");
requireText("count endpoint", main, 'fetch("/api/station/identity-counts"');
requireText("health refresh", main, "await refreshSmartRecognitionHealth");

const syncCall = "await syncStationIdentityCounts({ faceSampleCount: faceCount, voiceSampleCount: voiceCount });";
requireFunctionText("captureIdentityWizardFacePose", "sync", syncCall);
requireFunctionText("captureIdentityWizardVoiceSample", "sync", syncCall);
requireFunctionText("captureKnownUserFaceSample", "sync", syncCall);
requireFunctionText("captureKnownUserVoiceSample", "sync", syncCall);

const syncFunction = functionBody("syncStationIdentityCounts");
for (const forbidden of ["faceSamples", "facePoseSamples", "pendingFacePoseSamples", "voicePrints", "pendingVoicePrints", "dataUrl", "blob"]) {
  if (syncFunction.includes(forbidden)) {
    throw new Error(`syncStationIdentityCounts must not send raw enrollment material: ${forbidden}`);
  }
}

console.log("Station identity count sync audit passed.");
