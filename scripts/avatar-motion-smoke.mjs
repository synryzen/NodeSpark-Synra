import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const defaultUrl = "http://192.168.1.165:5191/?profile=jetson&mode=kiosk&fps=30&live=1&quality=sharp&scale=1&avatar=classic&test=1";
const smokeUrl = process.env.SYNRA_SMOKE_URL || defaultUrl;
const motionLimit = Number(process.env.SYNRA_SMOKE_MOTION_LIMIT || "0");
const motionPauseMs = Number(process.env.SYNRA_SMOKE_MOTION_PAUSE_MS || "650");
const playwright = loadPlaywright();

const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1432, height: 768 }, deviceScaleFactor: 1 });
const consoleMessages = [];
page.on("pageerror", (error) => consoleMessages.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) consoleMessages.push(`${message.type()}: ${message.text()}`);
});

await page.goto(withTestParam(smokeUrl), { waitUntil: "networkidle", timeout: 45000 });
await page.waitForFunction(() => Boolean(globalThis.__synraStandaloneTest), null, { timeout: 20000 });
await page.waitForFunction(() => globalThis.__synraStandaloneTest?.state?.().hubRuntimeReady === true, null, { timeout: 30000 });
const visionOffState = await page.evaluate(() => globalThis.__synraStandaloneTest.setVision(false));
if (visionOffState.visionEnabled !== false) {
  throw new Error("Vision Off smoke check failed: active stream remained enabled.");
}

const avatarIds = await page.evaluate(() => globalThis.__synraStandaloneTest.avatarIds);
const avatarResults = [];
for (const avatarId of avatarIds) {
  const before = await page.evaluate(() => globalThis.__synraStandaloneTest.state());
  const result = await page.evaluate((id) => globalThis.__synraStandaloneTest.switchAvatar(id), avatarId);
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => globalThis.__synraStandaloneTest.state());
  avatarResults.push({
    avatarId,
    ok: after.avatarId === avatarId && after.hubRuntimeReady === true,
    beforeFrameCount: before.hubHealth?.frameCount ?? null,
    afterFrameCount: after.hubHealth?.frameCount ?? null,
    activeMotion: result.activeMotion ?? after.activeMotion ?? null
  });
}

const motionIds = await page.evaluate(() => globalThis.__synraStandaloneTest.motionIds());
const selectedMotionIds = Number.isFinite(motionLimit) && motionLimit > 0 ? motionIds.slice(0, motionLimit) : motionIds;
const motionResults = [];
for (const motionId of selectedMotionIds) {
  const before = await page.evaluate(() => globalThis.__synraStandaloneTest.state());
  let result;
  let error = null;
  try {
    result = await page.evaluate((id) => globalThis.__synraStandaloneTest.playMotion(id), motionId);
    await page.waitForTimeout(motionPauseMs);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  const after = await page.evaluate(() => globalThis.__synraStandaloneTest.state());
  const frameAdvanced = typeof before.hubHealth?.frameCount === "number" && typeof after.hubHealth?.frameCount === "number"
    ? after.hubHealth.frameCount > before.hubHealth.frameCount
    : after.hubRuntimeReady === true;
  motionResults.push({
    motionId,
    ok: !error && after.hubRuntimeReady === true && frameAdvanced,
    error,
    activeMotion: result?.activeMotion ?? after.activeMotion ?? null,
    beforeFrameCount: before.hubHealth?.frameCount ?? null,
    afterFrameCount: after.hubHealth?.frameCount ?? null
  });
}

await page.evaluate(() => globalThis.__synraStandaloneTest.stopMotion());
await page.screenshot({ path: "dist/avatar-motion-smoke.png", fullPage: false });
await browser.close();

const failedAvatars = avatarResults.filter((result) => !result.ok);
const failedMotions = motionResults.filter((result) => !result.ok);
const report = {
  ok: failedAvatars.length === 0 && failedMotions.length === 0,
  url: withTestParam(smokeUrl),
  avatarCount: avatarResults.length,
  motionCount: motionResults.length,
  avatarResults,
  failedAvatars,
  failedMotions,
  warningCount: consoleMessages.length,
  warnings: consoleMessages.slice(0, 12),
  screenshot: "dist/avatar-motion-smoke.png"
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);

function withTestParam(url) {
  const parsed = new URL(url);
  parsed.searchParams.set("test", "1");
  return parsed.toString();
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    const fallback = "/Users/matthew/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
    if (existsSync(fallback)) return require(fallback);
    throw new Error("Playwright is required. Run through Codex bundled Node or install playwright in this project.");
  }
}
