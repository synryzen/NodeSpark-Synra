import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const mainPath = join(root, "src/main.ts");
const runtimePath = join(root, "src/hub-runtime/drivers/avatar3d.ts");

const mainScript = readFileSync(mainPath, "utf8");
const runtimeScript = existsSync(runtimePath) ? readFileSync(runtimePath, "utf8") : "";

const checks = {
  runtimeFileExists: existsSync(runtimePath),
  importsHubRuntime: mainScript.includes("./hub-runtime/drivers/avatar3d"),
  usesRuntimeFlag: mainScript.includes("USE_HUB_AVATAR_RUNTIME"),
  bootsHubRuntime: mainScript.includes("hubAvatarRuntime.boot"),
  routesAvatarChangesToHub: mainScript.includes("hubAvatarRuntime.setAvatar"),
  routesMotionsToHub: mainScript.includes("hubAvatarRuntime.trigger") || mainScript.includes("hubAvatarRuntime.playGeneratedClip"),
  reportsHubRuntimeHealth: /hubAvatarRuntime\??\.runtimeHealth/.test(mainScript),
  runtimeHasFloorCalibration: runtimeScript.includes("calibrateFloorAnchor"),
  runtimeHasCameraFraming: runtimeScript.includes("applyCameraFraming"),
  runtimeHasAuthoredMotionPlayer: runtimeScript.includes("SynraAuthoredMotionPlayer")
};

const failed = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(
  JSON.stringify(
    {
      ok: failed.length === 0,
      target: "hub-grade-avatar-runtime-port",
      checks,
      failed
    },
    null,
    2
  )
);

if (failed.length) process.exit(1);
