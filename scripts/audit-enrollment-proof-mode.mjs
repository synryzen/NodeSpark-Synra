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

function extractFunctionBody(source, signature) {
  const signatureIndex = source.indexOf(signature);
  if (signatureIndex === -1) throw new Error(`function missing: ${signature}`);
  const bodyStart = source.indexOf("{", signatureIndex);
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
requireText("proof health updater marker", main, "updateEnrollmentProofFromStatus(identityStatusFromStationHealth(health))");
requireText("proof styles", styles, ".recognition-proof-panel");
requireText("package script", packageJson, "\"audit:enrollment-proof\"");

const verifyEnrollmentProofSyncBody = extractFunctionBody(main, "async function verifyEnrollmentProofSync");
for (const forbidden of ["dataUrl", "blob", "voicePrint", "facePoseSamples", "pendingVoicePrints", "pendingFacePoseSamples"]) {
  if (verifyEnrollmentProofSyncBody.includes(forbidden)) {
    throw new Error(`verifyEnrollmentProofSync includes forbidden raw biometric term: ${forbidden}`);
  }
}

console.log("Enrollment proof mode audit passed.");
