#!/usr/bin/env node
import fs from "node:fs";

const contract = fs.existsSync("src/identity-contract.ts")
  ? fs.readFileSync("src/identity-contract.ts", "utf8")
  : "";
const main = fs.readFileSync("src/main.ts", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

const requiredContractTokens = [
  "SynraIdentityPermissionState",
  "SynraIdentityDeviceState",
  "SynraIdentityEnrollmentPhase",
  "SynraIdentityReadinessStatus",
  "normalizeIdentityStatus",
  "defaultIdentityStatus",
  "rawSamplesStored: false",
  "rawSamplesLeaveDevice: false"
];

const requiredMainTokens = [
  "normalizeIdentityStatus",
  "identityStatusFromStationHealth",
  "renderSmartRecognition",
  "identityFaceSetupButton",
  "identityVoiceSetupButton",
  "recognitionRuntimeConfidence",
  "recognitionSessionCheckThree"
];

const checks = {
  contractFields: requiredContractTokens.every((token) => contract.includes(token)),
  mainWiring: requiredMainTokens.every((token) => main.includes(token)),
  packageScript: pkg.scripts?.["audit:identity-contract"] === "node scripts/audit-identity-contract.mjs"
};

console.log(JSON.stringify({ ok: Object.values(checks).every(Boolean), checks }, null, 2));
if (!Object.values(checks).every(Boolean)) process.exit(1);
