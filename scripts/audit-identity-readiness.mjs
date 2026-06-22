import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const types = readFileSync(join(root, "src/types.ts"), "utf8");
const main = readFileSync(join(root, "src/main.ts"), "utf8");
const styles = readFileSync(join(root, "src/styles.css"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");
let enrollmentQuality = "";
let identity = "";
try {
  enrollmentQuality = readFileSync(join(root, "src/enrollmentQuality.ts"), "utf8");
} catch {
  enrollmentQuality = "";
}
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
  hasSynraAiRuntimeRecognitionPanel: main.includes("recognition-runtime-panel") && main.includes("Runtime Recognition") && main.includes("Verify Owner"),
  hasSynraAiDeviceStateGrid: main.includes("recognition-device-grid") && main.includes("Face Storage") && main.includes("Voice Match") && main.includes("Trusted Control"),
  hasSynraAiSmartRecognitionSurface: main.includes("smart-recognition-shell") && main.includes("Smart Recognition") && main.includes("Face Setup") && main.includes("Voice Setup") && main.includes("Live Enrollment Coach"),
  hasAppleGradeFaceStage: main.includes("identity-face-frame") && main.includes("identityFaceRing") && main.includes("identityWizardCaptureFaceButton"),
  hasAppleGradeVoiceStage: main.includes("identity-voice-meter") && main.includes("identityVoiceLevelMeter") && main.includes("identityVoiceIsolationMeter") && main.includes("identityVoiceNoiseMeter"),
  hasWizardStageController: main.includes("identityWizardStage") && main.includes("renderIdentityWizard") && main.includes("advanceIdentityWizard"),
  hasSharedEnrollmentQuality: enrollmentQuality.includes("evaluateFaceFrameQuality") && enrollmentQuality.includes("evaluateVoiceEnrollmentQuality"),
  gatesFaceCaptureQuality: main.includes("evaluateFaceFrameQuality") && main.includes("faceQuality.accepted"),
  gatesVoiceCaptureQuality: main.includes("evaluateVoiceEnrollmentQuality") && main.includes("voiceQuality.accepted"),
  explainsQualityRetry: main.includes("identityFaceQualityStatus") && main.includes("identityVoiceQualityStatus"),
  showsReadinessInUi: main.includes("identity-readiness"),
  hasOverflowSafeRecognitionChips: styles.includes("recognition-session-checks") && styles.includes("repeat(auto-fit, minmax(104px, 1fr))") && styles.includes("white-space: normal") && styles.includes("overflow-wrap: anywhere"),
  exportsSafeReadiness: main.includes("identityReadiness"),
  packageScriptExists: packageJson.includes("\"audit:identity-readiness\"")
};

const failed = Object.entries(checks)
  .filter(([, pass]) => !pass)
  .map(([name]) => name);

console.log(JSON.stringify({ ok: failed.length === 0, checks, failed }, null, 2));

if (failed.length) process.exit(1);
