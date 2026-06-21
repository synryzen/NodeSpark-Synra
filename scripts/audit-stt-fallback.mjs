import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const main = readFileSync(join(root, "src/main.ts"), "utf8");
const wakeRoutingBody = /function shouldUseServerTranscriptionForWake\(\): boolean \{([\s\S]*?)\n\}/.exec(main)?.[1] ?? "";

const checks = {
  declaresSttCircuitBreaker: main.includes("serverTranscriptionFailureCount"),
  separatesOutputFromStt: main.includes("shouldUseServerTranscriptionForCommand"),
  hasServerFailureRecorder: main.includes("recordServerTranscriptionFailure"),
  hasServerSuccessReset: main.includes("recordServerTranscriptionSuccess"),
  fallsBackToBrowserListening: main.includes("startBrowserCommandListeningAfterServerFailure"),
  reportsServerSttState: main.includes("serverTranscriptionStatus"),
  wakeRoutingAvoidsKioskBlanket: !wakeRoutingBody.includes('runtimeMode === "kiosk"'),
  wakeRoutingRequiresServerNeed: wakeRoutingBody.includes("voiceMatchMode") && wakeRoutingBody.includes('state.voiceSettings.provider === "elevenLabs"')
};

const failed = Object.entries(checks)
  .filter(([, pass]) => !pass)
  .map(([name]) => name);

console.log(JSON.stringify({ ok: failed.length === 0, checks, failed }, null, 2));

if (failed.length) process.exit(1);
