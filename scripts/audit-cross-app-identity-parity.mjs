#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const standaloneRoot = process.cwd();
const collectionRoot = path.dirname(standaloneRoot);
const nodeSparkRoot = path.join(collectionRoot, "NodeSpark Version 4.3");
const hubRoot = path.join(collectionRoot, "NodeSparkHub Version 4.3");

function readRequired(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing required parity file: ${file}`);
  return fs.readFileSync(file, "utf8");
}

const standaloneContract = readRequired(path.join(standaloneRoot, "src/identity-contract.ts"));
const stationTypes = readRequired(path.join(standaloneRoot, "tools/SynraJetsonStation/src/types.ts"));
const iosState = readRequired(path.join(nodeSparkRoot, "NodeSpark/Synra/SynraMobileState.swift"));
const iosBridge = readRequired(path.join(nodeSparkRoot, "NodeSpark/Synra/SynraMobileBridge.swift"));
const hubRecognition = readRequired(path.join(hubRoot, "NodeSparkHub/SynraRecognitionService.swift"));
const hubSettingsSupport = readRequired(path.join(hubRoot, "NodeSparkHub/SynraSettingsSupport.swift"));
const pkg = JSON.parse(readRequired(path.join(standaloneRoot, "package.json")));

const checks = {
  packageScript: pkg.scripts?.["audit:cross-app-identity"] === "node scripts/audit-cross-app-identity-parity.mjs",
  standaloneDefinesReadiness: standaloneContract.includes("faceReady") && standaloneContract.includes("voiceReady") && standaloneContract.includes("trustedActionsReady"),
  standaloneDefinesPrivacyFlags: standaloneContract.includes("rawSamplesStored: false") && standaloneContract.includes("rawSamplesLeaveDevice: false"),
  stationExposesIdentitySmoke: stationTypes.includes("StationIdentitySmoke") && stationTypes.includes("rawSamplesIncluded: false") && stationTypes.includes("secretsIncluded: false"),
  iosTracksFaceVoiceCounts: iosState.includes("identityFaceSampleCount") && iosState.includes("identityVoiceSampleCount"),
  iosNativeEnrollment: iosBridge.includes('recognitionService.perform(kind: "face", action: action, state: state)') && iosBridge.includes('recognitionService.perform(kind: "voice", action: action, state: state)'),
  hubRecognitionCounts: hubRecognition.includes("faceSampleCount") && hubRecognition.includes("voiceSampleCount"),
  hubSettingsCounts: hubSettingsSupport.includes("requiredVoiceSampleCount") && hubSettingsSupport.includes("isVoiceTrainingComplete")
};

console.log(JSON.stringify({ ok: Object.values(checks).every(Boolean), checks }, null, 2));
if (!Object.values(checks).every(Boolean)) process.exit(1);
