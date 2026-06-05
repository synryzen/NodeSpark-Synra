import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { buildElectronCommandLineSwitches, buildKioskLaunchConfig } from "./kiosk-config.js";

const execFileAsync = promisify(execFile);

async function commandOutput(command: string, args: string[] = []): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 8_000 });
    return `${stdout}${stderr}`.trim();
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return `${err.stdout || ""}${err.stderr || err.message || ""}`.trim();
  }
}

async function fetchText(url: string): Promise<string> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const text = await response.text();
    return `HTTP ${response.status}\n${text}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function sampleTegrastats(seconds: number): Promise<string> {
  const available = await commandOutput("sh", ["-lc", "command -v tegrastats || true"]);
  if (!available) return "tegrastats unavailable";

  return new Promise((resolve) => {
    const child = spawn("timeout", [String(seconds), "tegrastats"], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    child.on("close", () => resolve(output.trim() || "no tegrastats output"));
    child.on("error", (error) => resolve(error.message));
  });
}

function section(title: string): void {
  console.log(`\n== ${title} ==`);
}

async function main(): Promise<void> {
  const config = buildKioskLaunchConfig();
  const switches = buildElectronCommandLineSwitches(config);
  const debugUrl = `http://127.0.0.1:${config.remoteDebugPort}/json/version`;

  section("Launch config");
  console.log(JSON.stringify({
    url: config.url.toString(),
    remoteDebug: config.remoteDebug,
    remoteDebugPort: config.remoteDebugPort,
    window: config.window,
    switches: Object.fromEntries(switches)
  }, null, 2));

  section("Synra health");
  console.log(await fetchText(process.env.SYNRA_KIOSK_HEALTH_URL?.trim() || `${config.url.origin}/api/health`));

  section("Synra telemetry");
  console.log(await fetchText(`${config.url.origin}/api/telemetry/public`));

  section("Electron and browser processes");
  console.log(await commandOutput("pgrep", ["-af", "electron|Electron|chromium|chrome"]));

  section("Electron remote debug");
  console.log(await fetchText(debugUrl));

  section("GPU libraries");
  console.log(await commandOutput("sh", ["-lc", "ldconfig -p 2>/dev/null | grep -Ei 'nvidia|egl|vulkan|gbm' || true"]));

  section("Jetson tegrastats");
  console.log(await sampleTegrastats(Number(process.env.SYNRA_KIOSK_TEGRASTATS_SECONDS || "8")));

  section("Memory");
  console.log(await commandOutput("free", ["-h"]));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
