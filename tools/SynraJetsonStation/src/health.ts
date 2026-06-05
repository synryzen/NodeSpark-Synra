import fs from "node:fs/promises";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { StationConfig, SynraHealthReport, SynraNetworkState } from "./types.js";
import type { StationCamera } from "./camera.js";
import type { StationMicrophone } from "./microphone.js";

const execFileAsync = promisify(execFile);

async function diskStats(): Promise<{ totalBytes: number | null; freeBytes: number | null }> {
  try {
    const { stdout } = await execFileAsync("df", ["-k", "/"]);
    const lines = stdout.trim().split(/\r?\n/);
    const parts = lines[1]?.trim().split(/\s+/) || [];
    const totalKb = Number(parts[1]);
    const freeKb = Number(parts[3]);
    return {
      totalBytes: Number.isFinite(totalKb) ? totalKb * 1024 : null,
      freeBytes: Number.isFinite(freeKb) ? freeKb * 1024 : null
    };
  } catch {
    return { totalBytes: null, freeBytes: null };
  }
}

async function temperatureC(): Promise<number | null> {
  const paths = [
    "/sys/class/thermal/thermal_zone0/temp",
    "/sys/devices/virtual/thermal/thermal_zone0/temp"
  ];
  for (const file of paths) {
    try {
      const raw = (await fs.readFile(file, "utf8")).trim();
      const value = Number(raw);
      if (Number.isFinite(value)) return value > 1000 ? value / 1000 : value;
    } catch {
      // keep probing
    }
  }
  return null;
}

function networkState(): SynraNetworkState {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (!entry.internal && entry.family === "IPv4") return "local";
    }
  }
  return "unknown";
}

export interface HealthState {
  startedAtMs: number;
  synraRuntimePresent: boolean;
  hubConnected: boolean;
  hubBaseUrl: string;
  lastHeartbeatAt: string | null;
  lastHubError: string | null;
  mockMode: boolean;
  lastError: string | null;
}

export async function collectHealth(
  config: StationConfig,
  state: HealthState,
  camera: StationCamera,
  microphone: StationMicrophone
): Promise<SynraHealthReport> {
  const [disk, temp] = await Promise.all([diskStats(), temperatureC()]);
  return {
    generatedAt: new Date().toISOString(),
    uptimeSeconds: Math.max(0, Math.round((Date.now() - state.startedAtMs) / 1000)),
    server: {
      running: true,
      host: config.host,
      port: config.port,
      synraRuntimePresent: state.synraRuntimePresent
    },
    hub: {
      baseUrl: state.hubBaseUrl,
      connected: state.hubConnected,
      lastHeartbeatAt: state.lastHeartbeatAt,
      lastError: state.lastHubError,
      mockMode: state.mockMode
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      loadAverage: os.loadavg(),
      memory: { totalBytes: os.totalmem(), freeBytes: os.freemem() },
      disk,
      temperatureC: temp,
      gpu: null,
      network: networkState()
    },
    camera: camera.debug(),
    microphone: microphone.debug(),
    lastError: state.lastError
  };
}
