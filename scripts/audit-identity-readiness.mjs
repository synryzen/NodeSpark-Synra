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
  definesFacePoses: identity.includes("FACE_ENROLLMENT_POSES"),
  definesFaceRequirement: identity.includes("REQUIRED_FACE_POSE_COUNT"),
  definesVoiceRequirement: identity.includes("REQUIRED_VOICE_SAMPLE_COUNT"),
  scoresKnownUser: identity.includes("identityReadinessForUser"),
  importsReadiness: main.includes("identityReadinessForUser"),
  showsReadinessInUi: main.includes("identity-readiness"),
  exportsSafeReadiness: main.includes("identityReadiness"),
  packageScriptExists: packageJson.includes("\"audit:identity-readiness\"")
};

const failed = Object.entries(checks)
  .filter(([, pass]) => !pass)
  .map(([name]) => name);

console.log(JSON.stringify({ ok: failed.length === 0, checks, failed }, null, 2));

if (failed.length) process.exit(1);
