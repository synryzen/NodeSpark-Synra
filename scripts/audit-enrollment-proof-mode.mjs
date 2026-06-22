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

function rejectText(label, haystack, needle) {
  if (haystack.includes(needle)) throw new Error(`${label} forbidden: ${needle}`);
}

function extractFunctionBody(source, signature) {
  const signatureIndex = source.indexOf(signature);
  if (signatureIndex === -1) throw new Error(`function missing: ${signature}`);
  const parameterStart = source.indexOf("(", signatureIndex);
  if (parameterStart === -1) throw new Error(`function parameters missing: ${signature}`);
  let parameterDepth = 0;
  let signatureEnd = -1;
  for (let index = parameterStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parameterDepth += 1;
    if (char === ")") {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        signatureEnd = index;
        break;
      }
    }
  }
  if (signatureEnd === -1) throw new Error(`function parameters unterminated: ${signature}`);
  const bodyStart = source.indexOf("{", signatureEnd);
  if (bodyStart === -1) throw new Error(`function body missing: ${signature}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart + 1, index);
    }
  }
  throw new Error(`function body unterminated: ${signature}`);
}

function extractAsyncFunctionBody(source, name) {
  return extractFunctionBody(source, `async function ${name}`);
}

function findBlockEnd(source, blockStart) {
  let depth = 0;
  for (let index = blockStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function assertAcceptedMarkerOrder({ functionName, qualityGate, pendingStore, marker }) {
  const body = extractAsyncFunctionBody(main, functionName);
  const qualityGateIndex = body.indexOf(qualityGate);
  if (qualityGateIndex === -1) throw new Error(`${functionName} missing rejected-quality gate: ${qualityGate}`);
  const qualityGateBlockStart = body.indexOf("{", qualityGateIndex);
  if (qualityGateBlockStart === -1) throw new Error(`${functionName} rejected-quality gate has no block`);
  const rejectedQualityReturnIndex = body.indexOf("return;", qualityGateBlockStart);
  if (rejectedQualityReturnIndex === -1) throw new Error(`${functionName} rejected-quality gate has no return`);
  const qualityGateBlockEnd = findBlockEnd(body, qualityGateBlockStart);
  if (qualityGateBlockEnd === -1) throw new Error(`${functionName} rejected-quality gate is unterminated`);

  const pendingStoreIndex = body.indexOf(pendingStore);
  if (pendingStoreIndex === -1) throw new Error(`${functionName} missing accepted local sample store: ${pendingStore}`);
  const markerIndex = body.indexOf(marker);
  if (markerIndex === -1) throw new Error(`${functionName} missing accepted marker: ${marker}`);
  const syncIndex = body.indexOf("syncStationIdentityCounts");
  if (syncIndex === -1) throw new Error(`${functionName} missing Station identity count sync`);

  if (markerIndex < qualityGateBlockEnd) {
    throw new Error(`${functionName} marks accepted before the rejected-quality return gate finishes`);
  }
  if (markerIndex < pendingStoreIndex) {
    throw new Error(`${functionName} marks accepted before storing the local sample`);
  }
  if (markerIndex > syncIndex) {
    throw new Error(`${functionName} marks accepted after Station identity count sync`);
  }
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
requireText("proof sync state type", main, "type EnrollmentProofSyncState");
requireText("proof state type", main, "type EnrollmentProofState");
requireText("proof state", main, "const enrollmentProofState");
requireText("proof renderer", main, "function renderEnrollmentProof");
requireText("proof status updater", main, "function updateEnrollmentProofFromStatus");
requireText("proof station render", main, "recognitionProofStationStatus.textContent");
requireText("proof sync render", main, "recognitionProofSyncStatus.textContent");
requireText("proof sync request guard", main, "enrollmentProofSyncRequestId");
requireText("proof sync response success gate", main, "body.ok");
requireText("proof sync confirmed face count", main, "confirmedFaceSampleCount");
requireText("proof sync confirmed voice count", main, "confirmedVoiceSampleCount");
requireText("proof health identity smoke gate", main, "if (!health.identitySmoke)");
requireText("proof health missing smoke offline", main, "if (!health.identitySmoke) {\n      enrollmentProofState.stationAvailable = false;");
requireText("proof accepted marker", main, "function markEnrollmentProofAccepted");
requireText("proof verify function", main, "async function verifyEnrollmentProofSync");
requireText("proof verify button handler", main, "recognitionProofVerifyButton.addEventListener");
requireText("proof sync attempt timestamp", main, "enrollmentProofState.lastSyncAttemptAt");
requireText("proof sync confirmed timestamp", main, "enrollmentProofState.lastSyncConfirmedAt");
requireText("proof sync error", main, "enrollmentProofState.lastSyncError");
requireText("proof health count-preserving helper", main, "function preserveLocalEnrollmentCountsForStationHealth");
requireText("proof health updater marker", main, "updateEnrollmentProofFromStatus(preserveLocalEnrollmentCountsForStationHealth(identityStatusFromStationHealth(health)))");
requireText("proof no-lower-local render marker", main, "function renderEnrollmentProofWithoutLoweringLocalCounts");
requireText("proof styles", styles, ".recognition-proof-panel");
requireText("package script", packageJson, "\"audit:enrollment-proof\"");

for (const markerCheck of [
  {
    functionName: "captureIdentityWizardFacePose",
    qualityGate: "if (!faceQuality.accepted)",
    pendingStore: "pendingFacePoseSamples = { ...pendingFacePoseSamples, [pose]: capture.dataUrl };",
    marker: "markEnrollmentProofAccepted(\"face\")"
  },
  {
    functionName: "captureIdentityWizardVoiceSample",
    qualityGate: "if (!voiceQuality.accepted)",
    pendingStore: "pendingVoicePrints = [...pendingVoicePrints, voicePrint].slice(-REQUIRED_VOICE_SAMPLE_COUNT);",
    marker: "markEnrollmentProofAccepted(\"voice\")"
  },
  {
    functionName: "captureKnownUserFaceSample",
    qualityGate: "if (!faceQuality.accepted)",
    pendingStore: "pendingFacePoseSamples = { ...pendingFacePoseSamples, [pose]: capture.dataUrl };",
    marker: "markEnrollmentProofAccepted(\"face\")"
  },
  {
    functionName: "captureKnownUserVoiceSample",
    qualityGate: "if (!voiceQuality.accepted)",
    pendingStore: "pendingVoicePrints = [...pendingVoicePrints, voicePrint].slice(-REQUIRED_VOICE_SAMPLE_COUNT);",
    marker: "markEnrollmentProofAccepted(\"voice\")"
  }
]) {
  assertAcceptedMarkerOrder(markerCheck);
}

const verifyEnrollmentProofSyncBody = extractFunctionBody(main, "async function verifyEnrollmentProofSync");
for (const forbidden of ["dataUrl", "blob", "voicePrint", "facePoseSamples", "pendingVoicePrints", "pendingFacePoseSamples"]) {
  if (verifyEnrollmentProofSyncBody.includes(forbidden)) {
    throw new Error(`verifyEnrollmentProofSync includes forbidden raw biometric term: ${forbidden}`);
  }
}
requireText("verify health fetch", verifyEnrollmentProofSyncBody, "fetch(\"/api/health\", { cache: \"no-store\" })");
rejectText("verify identity count post route", verifyEnrollmentProofSyncBody, "/api/station/identity-counts");
rejectText("verify post method", verifyEnrollmentProofSyncBody, "method: \"POST\"");
requireText("verify preserves face baseline", verifyEnrollmentProofSyncBody, "const requestedFaceSampleCount");
requireText("verify preserves voice baseline", verifyEnrollmentProofSyncBody, "const requestedVoiceSampleCount");
requireText("verify confirms against health", verifyEnrollmentProofSyncBody, "confirmEnrollmentProofSync(health, {");
requireText("verify compares face baseline", verifyEnrollmentProofSyncBody, "faceSampleCount: requestedFaceSampleCount");
requireText("verify compares voice baseline", verifyEnrollmentProofSyncBody, "voiceSampleCount: requestedVoiceSampleCount");
requireText("verify HTTP offline", verifyEnrollmentProofSyncBody, "failEnrollmentProofSync(`HTTP ${response.status}`, false)");
requireText("verify always re-enables button", verifyEnrollmentProofSyncBody, "recognitionProofVerifyButton.disabled = false;");

const confirmEnrollmentProofSyncBody = extractFunctionBody(main, "function confirmEnrollmentProofSync");
const countLagIndex = confirmEnrollmentProofSyncBody.indexOf("Count lag");
const renderSmartRecognitionIndex = confirmEnrollmentProofSyncBody.indexOf("renderSmartRecognition");
if (countLagIndex === -1) throw new Error("confirmEnrollmentProofSync missing count lag handling");
if (renderSmartRecognitionIndex === -1) throw new Error("confirmEnrollmentProofSync missing confirmed Smart Recognition render");
if (renderSmartRecognitionIndex < countLagIndex) {
  throw new Error("confirmEnrollmentProofSync renders Smart Recognition before validating station counts");
}
requireText("confirm count-lag local render", confirmEnrollmentProofSyncBody, "renderEnrollmentProofWithoutLoweringLocalCounts()");
requireText("confirm bad proof offline", confirmEnrollmentProofSyncBody, "failEnrollmentProofSync(\"Bad proof\", false)");

const preserveLocalEnrollmentCountsBody = extractFunctionBody(main, "function preserveLocalEnrollmentCountsForStationHealth");
requireText("preserve helper keeps face count", preserveLocalEnrollmentCountsBody, "Math.max(localStatus.faceSampleCount, stationStatus.faceSampleCount)");
requireText("preserve helper keeps voice count", preserveLocalEnrollmentCountsBody, "Math.max(localStatus.voiceSampleCount, stationStatus.voiceSampleCount)");
requireText("preserve helper keeps completed poses", preserveLocalEnrollmentCountsBody, "completedFacePoses");

const refreshSmartRecognitionHealthBody = extractFunctionBody(main, "async function refreshSmartRecognitionHealth");
requireText("health refresh preserves station counts", refreshSmartRecognitionHealthBody, "preserveLocalEnrollmentCountsForStationHealth(identityStatusFromStationHealth(health))");
rejectText("health refresh raw proof update", refreshSmartRecognitionHealthBody, "updateEnrollmentProofFromStatus(identityStatusFromStationHealth(health))");

const refreshSmartRecognitionFromHealthBody = extractFunctionBody(main, "function refreshSmartRecognitionFromHealth");
requireText("health render preserves station counts", refreshSmartRecognitionFromHealthBody, "preserveLocalEnrollmentCountsForStationHealth(identityStatusFromStationHealth(health))");
rejectText("health render raw station status", refreshSmartRecognitionFromHealthBody, "renderSmartRecognition(identityStatusFromStationHealth(health))");

console.log("Enrollment proof mode audit passed.");
