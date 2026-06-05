import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { StationConfig, SynraPlatform, SynraStationCapabilities, SynraStationPermissions } from "./types.js";

function loadEnvFile(rootDir: string): void {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim();
    const raw = trimmed.slice(idx + 1).trim();
    const value = raw.replace(/^['"]|['"]$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function boolEnv(name: string, fallback = false): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function numberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stableDeviceId(): string {
  const source = `${os.hostname()}|${os.platform()}|synra-jetson-station`;
  const hex = crypto.createHash("sha256").update(source).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function detectPlatform(): SynraPlatform {
  if (process.platform === "darwin") return "macOS";
  if (process.platform === "linux") return "Linux";
  return "unknown";
}

export function loadConfig(argv = process.argv): StationConfig {
  const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  loadEnvFile(rootDir);
  const args = new Set(argv.slice(2));
  const simulate = args.has("--simulate") || boolEnv("STATION_SIMULATE", false);
  return {
    rootDir,
    host: process.env.STATION_HOST || "127.0.0.1",
    port: numberEnv("STATION_PORT", 4788),
    hubBaseUrl: (process.env.HUB_BASE_URL || "http://127.0.0.1:8787").replace(/\/+$/, ""),
    hubToken: process.env.HUB_DEVICE_TOKEN?.trim() || null,
    deviceId: process.env.STATION_DEVICE_ID?.trim() || stableDeviceId(),
    displayName: process.env.STATION_DISPLAY_NAME?.trim() || "Workshop Jetson",
    appVersion: process.env.STATION_APP_VERSION?.trim() || "0.1.0",
    osVersion: `${os.type()} ${os.release()}`,
    simulate,
    once: args.has("--once"),
    cameraEnabled: boolEnv("STATION_CAMERA_ENABLED", false),
    microphoneEnabled: boolEnv("STATION_MICROPHONE_ENABLED", false),
    localVision: boolEnv("STATION_LOCAL_VISION", false),
    localSpeech: boolEnv("STATION_LOCAL_SPEECH", false),
    chromiumBin: process.env.CHROMIUM_BIN?.trim() || null,
    heartbeatIntervalMs: numberEnv("STATION_HEARTBEAT_INTERVAL_MS", 30_000)
  };
}

export function stationCapabilities(config: StationConfig): SynraStationCapabilities {
  return {
    displayAvatar: true,
    camera: config.cameraEnabled,
    microphone: config.microphoneEnabled,
    speaker: true,
    tts: true,
    localSpeech: config.localSpeech,
    localVision: config.localVision,
    remoteVision: config.cameraEnabled || config.localVision,
    workflowControl: true,
    edgeAgent: true,
    notifications: true,
    fileAccess: false,
    screenShare: false
  };
}

export function leastPrivilegePermissions(config: StationConfig): SynraStationPermissions {
  return {
    canReceiveSynraOutput: true,
    canSendUserInput: true,
    canRequestVision: false,
    canUseMicrophone: config.microphoneEnabled,
    canShowWorkflowStatus: true,
    canRequestWorkflowRun: false,
    canExecuteLocalTools: false
  };
}
