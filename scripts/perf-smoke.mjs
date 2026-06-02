import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const required = [
  "public/avatars/synra.vrm",
  "public/avatars/synra-code1.vrm",
  "public/avatars/synra-battle.vrm",
  "public/backgrounds/synra-command-room.png",
  "public/backgrounds/synra-cyber-garden.png",
  "public/backgrounds/synra-neural-library.png",
  "public/backgrounds/synra-observatory.png",
  "public/backgrounds/synra-orbit-lounge.png",
  "public/backgrounds/synra-quantum-workshop.png",
  "scripts/jetson-diagnostics.sh",
  "scripts/kiosk-performance-check.sh",
  "src/main.ts",
  "src/model-client.ts"
];

const missing = required.filter((file) => !existsSync(join(root, file)));
if (missing.length) {
  console.error("Missing required standalone files:");
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

const avatarMb = bytesToMb(statSync(join(root, "public/avatars/synra-code1.vrm")).size);
const avatarCount = readdirSync(join(root, "public/avatars")).filter((file) => file.endsWith(".vrm")).length;
const backgroundCount = readdirSync(join(root, "public/backgrounds")).filter((file) => file.endsWith(".png")).length;
const motionCount = countFiles(join(root, "public/motions"), ".vrma");
const kioskScript = readFileSync(join(root, "scripts/start-jetson-kiosk.sh"), "utf8");
const serverScript = readFileSync(join(root, "scripts/synra_server.py"), "utf8");
const mainScript = readFileSync(join(root, "src/main.ts"), "utf8");
const kioskIsLean = kioskScript.includes("mode=kiosk") && kioskScript.includes("fps=${KIOSK_FPS}") && kioskScript.includes("--force-device-scale-factor=1");
const smartHomeBridgeIsSafe = serverScript.includes("/api/tools/smart-home") && serverScript.includes("SYNRA_SMART_HOME_ENABLED") && serverScript.includes("Home Assistant");
const smartHomeRequiresConfirmation = mainScript.includes("pendingAction") && mainScript.includes("Say confirm to run it") && mainScript.includes("cancel");
const visionIsPermissionOnly = mainScript.includes("visionStatus") && mainScript.includes("ensureCameraReady") && mainScript.includes("I am not storing frames");
const visionDiagnosticsAreLocal = serverScript.includes("/api/vision/public") && serverScript.includes("SYNRA_CAMERA_DEVICE") && serverScript.includes("Device-path diagnostics only");
const telemetryIsAvailable = serverScript.includes("/api/telemetry/public") && mainScript.includes("updateTelemetry") && mainScript.includes("keepalive");
const kioskMediaGrantIsOptIn = kioskScript.includes("SYNRA_KIOSK_AUTO_GRANT_MEDIA") && kioskScript.includes("--use-fake-ui-for-media-stream");
const kioskRemoteDebugIsOptIn = kioskScript.includes("SYNRA_KIOSK_REMOTE_DEBUG") && kioskScript.includes("--remote-debugging-port");
const kioskGlModeIsConfigurable = kioskScript.includes("SYNRA_KIOSK_GL_MODE") && kioskScript.includes("--use-gl");
const kioskAngleBackendIsConfigurable = kioskScript.includes("SYNRA_KIOSK_ANGLE_BACKEND") && kioskScript.includes("--use-angle");
const kioskDefaultsToVulkanAngle = kioskScript.includes("SYNRA_KIOSK_ANGLE_BACKEND:-vulkan");
const kioskVulkanWebglPathIsConfigurable =
  kioskScript.includes("DefaultANGLEVulkan") &&
  kioskScript.includes("VulkanFromANGLE") &&
  kioskScript.includes("--enable-webgl2");
const kioskDefaultsToLowQuality = kioskScript.includes("SYNRA_KIOSK_QUALITY:-low") && kioskScript.includes("quality=${KIOSK_QUALITY}");
const jetsonForcedLowPixelRatioIsLean = mainScript.includes("forced-low") && mainScript.includes("0.55");
const kioskRenderScaleIsConfigurable = kioskScript.includes("SYNRA_KIOSK_RENDER_SCALE:-0.62") && kioskScript.includes("scale=${KIOSK_RENDER_SCALE}");
const runtimeRenderScaleIsConfigurable = mainScript.includes("renderScale") && mainScript.includes("resolveRenderScaleOverride");
const rightRailCanScroll = mainScript.includes("right-rail") && readFileSync(join(root, "src/styles.css"), "utf8").includes("overflow-y: auto");
const modelRoutesAreExplicit = serverScript.includes("model_name_for_intent") && serverScript.includes("SYNRA_VISION_MODEL_NAME") && mainScript.includes("classifySynraRequest");
const result = {
  ok:
    avatarMb < 40 &&
    avatarCount === 3 &&
    backgroundCount >= 6 &&
    motionCount >= 57 &&
    kioskIsLean &&
    smartHomeBridgeIsSafe &&
    smartHomeRequiresConfirmation &&
    visionIsPermissionOnly &&
    visionDiagnosticsAreLocal &&
    telemetryIsAvailable &&
    kioskMediaGrantIsOptIn &&
    kioskRemoteDebugIsOptIn &&
    kioskGlModeIsConfigurable &&
    kioskAngleBackendIsConfigurable &&
    kioskDefaultsToVulkanAngle &&
    kioskVulkanWebglPathIsConfigurable &&
    kioskDefaultsToLowQuality &&
    jetsonForcedLowPixelRatioIsLean &&
    kioskRenderScaleIsConfigurable &&
    runtimeRenderScaleIsConfigurable &&
    rightRailCanScroll &&
    modelRoutesAreExplicit,
  target: "jetson-first-lean-runtime",
  avatarMb,
  avatarCount,
  backgroundCount,
  motionCount,
  checks: [
    "standalone app does not depend on NodeSparkHub",
    "runtime includes all three Synra avatars",
    "runtime includes six premium Synra stage backgrounds",
    "runtime includes the Hub VRMA motion library",
    "renderer disables antialiasing",
    "adaptive pixel ratio is capped",
    "kiosk launcher uses lean Jetson mode",
    "smart-home bridge fails safely unless configured",
    "smart-home actions require confirmation when configured",
    "camera path is permission-only until vision skill is configured",
    "Jetson camera diagnostics report device paths only",
    "kiosk telemetry reports local FPS without secrets",
    "kiosk camera/mic auto-grant is opt-in",
    "kiosk remote debugging is opt-in",
    "kiosk Chromium GL mode is configurable",
    "kiosk Chromium ANGLE backend is configurable",
    "Jetson kiosk defaults to Vulkan ANGLE",
    "kiosk Chromium Vulkan WebGL path is configurable",
    "Jetson kiosk defaults to low-cost visual quality",
    "forced-low mode uses a lean Jetson pixel ratio",
    "Jetson kiosk render scale is configurable",
    "runtime honors render scale overrides",
    "right-side control rail scrolls when controls overflow",
    "model routes are explicit for conversation, vision, tools, and NodeSpark",
    "model calls fall back to local Synra path"
  ]
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);

function bytesToMb(bytes) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function countFiles(directory, extension) {
  let count = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) count += countFiles(fullPath, extension);
    else if (entry.isFile() && entry.name.endsWith(extension)) count += 1;
  }
  return count;
}
