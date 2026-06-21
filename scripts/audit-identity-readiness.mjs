import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const types = readFileSync(join(root, "src/types.ts"), "utf8");
const main = readFileSync(join(root, "src/main.ts"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");
let identity = "";
try {
  identity = readFileSync(join(root, "src/identity.ts"), "utf8");
} catch {
  identity = "";
}

const checks = {
  exportsReadinessType: types.includes("SynraIdentityReadiness"),
  exportsPoseType: types.includes("SynraFacePose"),
  storesFacePoseSamples: types.includes("facePoseSamples"),
  definesFacePoses: identity.includes("FACE_ENROLLMENT_POSES"),
  definesFacePoseLabels: identity.includes("FACE_ENROLLMENT_POSE_LABELS"),
  definesFaceRequirement: identity.includes("REQUIRED_FACE_POSE_COUNT"),
  definesVoiceRequirement: identity.includes("REQUIRED_VOICE_SAMPLE_COUNT"),
  normalizesFacePoseSamples: identity.includes("normalizeFacePoseSamples"),
  scoresKnownUser: identity.includes("identityReadinessForUser"),
  importsReadiness: main.includes("identityReadinessForUser"),
  guidesFacePoseCapture: main.includes("facePoseInput") && main.includes("pendingFacePoseSamples"),
  guidesVoiceSampleCapture: main.includes("voiceEnrollmentPhrases") && main.includes("pendingVoicePrints"),
  showsEnrollmentProgress: main.includes("identityEnrollmentStatus") && main.includes("faceEnrollmentProgress"),
  hasDedicatedIdentityWizard: main.includes('id="identityEnrollmentWizard"') && main.includes("openIdentityWizardButton"),
  hasAppleGradeFaceStage: main.includes("identity-face-frame") && main.includes("identityFaceRing") && main.includes("identityWizardCaptureFaceButton"),
  hasAppleGradeVoiceStage: main.includes("identity-voice-meter") && main.includes("identityVoiceLevelMeter") && main.includes("identityVoiceIsolationMeter") && main.includes("identityVoiceNoiseMeter"),
  hasWizardStageController: main.includes("identityWizardStage") && main.includes("renderIdentityWizard") && main.includes("advanceIdentityWizard"),
  showsReadinessInUi: main.includes("identity-readiness"),
  exportsSafeReadiness: main.includes("identityReadiness"),
  packageScriptExists: packageJson.includes("\"audit:identity-readiness\"")
};

const failed = Object.entries(checks)
  .filter(([, pass]) => !pass)
  .map(([name]) => name);

console.log(JSON.stringify({ ok: failed.length === 0, checks, failed }, null, 2));

if (failed.length) process.exit(1);
