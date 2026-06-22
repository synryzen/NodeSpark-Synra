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
requireText("proof sync state type", main, "type EnrollmentProofSyncState");
requireText("proof state type", main, "type EnrollmentProofState");
requireText("proof state", main, "const enrollmentProofState");
requireText("proof renderer", main, "function renderEnrollmentProof");
requireText("proof status updater", main, "function updateEnrollmentProofFromStatus");
requireText("proof station render", main, "recognitionProofStationStatus.textContent");
requireText("proof sync render", main, "recognitionProofSyncStatus.textContent");
requireText("proof styles", styles, ".recognition-proof-panel");
requireText("package script", packageJson, "\"audit:enrollment-proof\"");

console.log("Enrollment proof mode audit passed.");
