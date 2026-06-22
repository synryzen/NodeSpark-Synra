import { execFileSync } from "node:child_process";
import type { StationAudioDevice, StationMicrophoneHealth, SynraSensorStatus } from "./types.js";

export interface StationMicrophoneOptions {
  configuredSource?: string | null;
  discoverSources?: () => StationAudioDevice[];
}

function normalizeConfiguredSource(source: string | null | undefined): string | null {
  const trimmed = source?.trim();
  return trimmed ? trimmed : null;
}

export function parsePulseAudioSources(output: string): StationAudioDevice[] {
  const sources: StationAudioDevice[] = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    const [, name = ""] = trimmedLine.split(/\t/);
    const id = name.trim();
    if (!id) continue;
    sources.push({
      id,
      label: id,
      present: true,
      configured: false,
      monitor: id.endsWith(".monitor") || id.includes(".monitor.")
    });
  }

  return sources;
}

export function parseAlsaCaptureDevices(output: string): StationAudioDevice[] {
  const devices: StationAudioDevice[] = [];
  const devicePattern = /^card\s+(\d+):\s+\S+\s+\[([^\]]+)\],\s+device\s+(\d+):\s+.+?\s+\[([^\]]+)\]/;

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(devicePattern);
    if (!match) continue;
    const [, card, cardLabel, device, deviceLabel] = match;
    devices.push({
      id: `hw:${card},${device}`,
      label: `${cardLabel.trim()} ${deviceLabel.trim()}`,
      present: true,
      configured: false,
      monitor: false
    });
  }

  return devices;
}

export function preferredMicrophoneSource(sources: StationAudioDevice[]): StationAudioDevice | null {
  return sources.find((source) => !source.monitor) || sources[0] || null;
}

export function discoverMicrophoneSources(): StationAudioDevice[] {
  try {
    const pulseOutput = execFileSync("pactl", ["list", "short", "sources"], {
      encoding: "utf8",
      timeout: 1000,
      stdio: ["ignore", "pipe", "ignore"]
    });
    const pulseSources = parsePulseAudioSources(pulseOutput);
    if (pulseSources.length > 0) return pulseSources;
  } catch {
    // Fall back to ALSA capture device discovery below.
  }

  try {
    const alsaOutput = execFileSync("arecord", ["-l"], {
      encoding: "utf8",
      timeout: 1000,
      stdio: ["ignore", "pipe", "ignore"]
    });
    return parseAlsaCaptureDevices(alsaOutput);
  } catch {
    return [];
  }
}

interface MicrophoneSourceDiscovery {
  sources: StationAudioDevice[];
  error: string | null;
}

interface MicrophoneRouteDiagnostics {
  routeStatus: StationMicrophoneHealth["routeStatus"];
  routeError: string | null;
}

export class StationMicrophone {
  private statusValue: SynraSensorStatus;
  private lastErrorValue: string | null = null;

  constructor(private readonly enabled: boolean, private readonly options: StationMicrophoneOptions = {}) {
    this.statusValue = enabled ? "available" : "unavailable";
  }

  get status(): SynraSensorStatus {
    return this.statusValue;
  }

  get lastError(): string | null {
    return this.lastErrorValue;
  }

  setStatus(status: SynraSensorStatus): void {
    if (!this.enabled && status !== "unavailable") {
      this.lastErrorValue = "Microphone status update ignored because local speech capture is not wired.";
      this.statusValue = "unavailable";
      return;
    }
    this.statusValue = status;
    if (status !== "permissionDenied") this.lastErrorValue = null;
  }

  async startListening(): Promise<never> {
    this.lastErrorValue = "Microphone listening is intentionally disabled until a visible Jetson mic path is wired.";
    this.statusValue = this.enabled ? "available" : "unavailable";
    throw new Error(this.lastErrorValue);
  }

  debug(): StationMicrophoneHealth {
    const configuredSource = normalizeConfiguredSource(this.options.configuredSource ?? process.env.SYNRA_MICROPHONE_SOURCE);
    const { sources, error: discoveryError } = this.detectSources(configuredSource);
    const { routeStatus, routeError } = this.microphoneRouteStatus(sources, configuredSource);

    return {
      enabled: this.enabled,
      status: this.statusValue,
      lastError: this.lastErrorValue || discoveryError || routeError,
      configuredSource,
      sources,
      routeStatus
    };
  }

  private detectSources(configuredSource: string | null): MicrophoneSourceDiscovery {
    const discoverSources = this.options.discoverSources || discoverMicrophoneSources;
    try {
      return {
        sources: discoverSources().map((source) => ({
          ...source,
          configured: configuredSource !== null && source.id === configuredSource
        })),
        error: null
      };
    } catch (error) {
      return {
        sources: [],
        error: `Microphone source discovery failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private microphoneRouteStatus(sources: StationAudioDevice[], configuredSource: string | null): MicrophoneRouteDiagnostics {
    if (!this.enabled) return { routeStatus: "unavailable", routeError: null };

    if (configuredSource) {
      const configured = sources.find((source) => source.id === configuredSource);
      if (configured && configured.monitor) {
        return {
          routeStatus: "degraded",
          routeError: `Configured microphone source '${configuredSource}' is a monitor source, not a capture input.`
        };
      }
      if (configured) return { routeStatus: "ready", routeError: null };
      return {
        routeStatus: "degraded",
        routeError: `Configured microphone source '${configuredSource}' was not detected.`
      };
    }

    const inputSources = sources.filter((source) => !source.monitor);
    if (inputSources.length > 0) return { routeStatus: "not-configured", routeError: null };

    if (sources.length > 0) {
      return {
        routeStatus: "unavailable",
        routeError: "Only monitor sources are visible; no microphone capture input sources were detected."
      };
    }

    return {
      routeStatus: "unavailable",
      routeError: "No microphone input sources detected via pactl or arecord."
    };
  }
}
