import fs from "node:fs/promises";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { StationConfig, StationIdentitySmoke, StationRouteStatus, SynraHealthReport, SynraNetworkState } from "./types.js";
import type { StationCamera } from "./camera.js";
import type { StationMicrophone } from "./microphone.js";
import { clampIdentityCounts, readIdentityCounts, type StationIdentityCounts } from "./identity-counts.js";

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

function routeStatusFromStt(provider: string, lastError: string | null): StationRouteStatus {
  if (lastError) return "degraded";
  if (provider === "none") return "not-configured";
  return "ready";
}

function countsFromEnvFallback(): StationIdentityCounts {
  const counts = clampIdentityCounts({
    faceSampleCount: process.env.SYNRA_FACE_SAMPLE_COUNT || 0,
    voiceSampleCount: process.env.SYNRA_VOICE_SAMPLE_COUNT || 0
  });
  return {
    ...counts,
    updatedAt: null
  };
}

async function identitySmoke(camera: StationCamera, microphone: StationMicrophone): Promise<StationIdentitySmoke> {
  const cameraDebug = camera.debug();
  const microphoneDebug = microphone.debug();
  const sttError = process.env.SYNRA_STT_LAST_ERROR || null;
  const sttProvider = process.env.SYNRA_STT_PROVIDER || "browser-fallback";
  const persistedCounts = await readIdentityCounts();
  const fallbackCounts = countsFromEnvFallback();
  const faceSampleCount = persistedCounts.updatedAt ? persistedCounts.faceSampleCount : fallbackCounts.faceSampleCount;
  const voiceSampleCount = persistedCounts.updatedAt ? persistedCounts.voiceSampleCount : fallbackCounts.voiceSampleCount;
  return {
    ok: cameraDebug.routeStatus !== "degraded" && microphoneDebug.routeStatus !== "degraded" && !sttError,
    camera: {
      status: cameraDebug.routeStatus,
      configuredDevice: cameraDebug.configuredDevice,
      devices: cameraDebug.devices
    },
    microphone: {
      status: microphoneDebug.routeStatus,
      configuredSource: microphoneDebug.configuredSource,
      sources: microphoneDebug.sources,
      lastError: microphoneDebug.lastError
    },
    stt: {
      status: routeStatusFromStt(sttProvider, sttError),
      provider: sttProvider,
      lastError: sttError
    },
    speaker: {
      status: "ready",
      provider: process.env.SYNRA_SPEAKER_PROVIDER || "system",
      lastError: null
    },
    identity: {
      faceSampleCount,
      voiceSampleCount,
      updatedAt: persistedCounts.updatedAt,
      rawSamplesIncluded: false,
      secretsIncluded: false
    }
  };
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
  const identitySmokeReport = await identitySmoke(camera, microphone);
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
    identitySmoke: identitySmokeReport,
    lastError: state.lastError
  };
}
