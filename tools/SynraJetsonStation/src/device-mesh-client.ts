import crypto from "node:crypto";
import type { Logger } from "./logger.js";
import { redactSecrets } from "./redaction.js";
import type {
  StationConfig,
  SynraDeviceRecord,
  SynraDeviceStatus,
  SynraHealthReport,
  SynraMeshEvent,
  SynraStationCapabilities,
  SynraStationPermissions
} from "./types.js";

export interface DeviceMeshClientState {
  registered: boolean;
  hubConnected: boolean;
  mockMode: boolean;
  lastHeartbeatAt: string | null;
  lastError: string | null;
  pendingConfirmation: Record<string, unknown> | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class DeviceMeshClient {
  readonly state: DeviceMeshClientState = {
    registered: false,
    hubConnected: false,
    mockMode: false,
    lastHeartbeatAt: null,
    lastError: null,
    pendingConfirmation: null
  };

  constructor(
    private readonly config: StationConfig,
    private readonly capabilities: SynraStationCapabilities,
    private readonly permissions: SynraStationPermissions,
    private readonly logger: Logger
  ) {}

  deviceStatus(cameraStatus: SynraDeviceStatus["cameraStatus"], microphoneStatus: SynraDeviceStatus["microphoneStatus"], state: SynraDeviceStatus["synraState"] = "idle"): SynraDeviceStatus {
    const now = nowIso();
    return {
      online: true,
      lastSeenAt: now,
      lastHeartbeatAt: this.state.lastHeartbeatAt || now,
      battery: null,
      power: "pluggedIn",
      network: "local",
      cameraStatus,
      microphoneStatus,
      displayStatus: "available",
      synraState: state
    };
  }

  deviceRecord(status: SynraDeviceStatus): SynraDeviceRecord {
    const now = nowIso();
    return {
      deviceId: this.config.deviceId,
      displayName: this.config.displayName,
      deviceType: "jetson",
      platform: "Linux",
      appVersion: this.config.appVersion,
      osVersion: this.config.osVersion,
      capabilities: this.capabilities,
      permissions: this.permissions,
      status,
      activeSessionId: null,
      createdAt: now,
      updatedAt: now
    };
  }

  async register(status: SynraDeviceStatus): Promise<Record<string, unknown>> {
    const payload = {
      deviceId: this.config.deviceId,
      name: this.config.displayName,
      displayName: this.config.displayName,
      platform: "Linux",
      deviceType: "jetson",
      osVersion: this.config.osVersion,
      appVersion: this.config.appVersion,
      capabilities: this.capabilityList(),
      synraCapabilities: this.capabilities,
      permissions: this.permissions,
      status
    };
    const result = await this.post("/devices/checkin", payload, { allowMock: true });
    this.state.registered = result.ok;
    return result.body;
  }

  async heartbeat(health: SynraHealthReport, status: SynraDeviceStatus): Promise<Record<string, unknown>> {
    const payload = {
      deviceId: this.config.deviceId,
      name: this.config.displayName,
      platform: "Linux",
      osVersion: this.config.osVersion,
      appVersion: this.config.appVersion,
      capabilities: this.capabilityList(),
      uptimeSeconds: health.uptimeSeconds,
      audioReady: this.capabilities.speaker,
      micReady: this.capabilities.microphone,
      speakerReady: this.capabilities.speaker,
      lastStatus: status.synraState,
      synraDeviceMesh: {
        timestamp: nowIso(),
        status,
        capabilities: this.capabilities,
        health: {
          cpu: health.system.loadAverage[0] ?? null,
          memory: health.system.memory,
          temperature: health.system.temperatureC,
          gpu: health.system.gpu
        }
      }
    };
    const result = await this.post("/devices/checkin", payload, { allowMock: true });
    if (result.ok) this.state.lastHeartbeatAt = nowIso();
    return result.body;
  }

  async pollEvents(): Promise<SynraMeshEvent[]> {
    const path = `/devices/${encodeURIComponent(this.config.deviceId)}/commands/poll?limit=25`;
    const result = await this.get(path, { allowMock: true });
    const commands = Array.isArray((result.body as { commands?: unknown[] }).commands)
      ? ((result.body as { commands: unknown[] }).commands)
      : [];
    return commands.map((command) => this.commandToEvent(command as Record<string, unknown>));
  }

  async ackCommand(commandId: string, status = "completed", result = "Handled by Synra Jetson Station."): Promise<void> {
    await this.post(`/devices/${encodeURIComponent(this.config.deviceId)}/commands/${encodeURIComponent(commandId)}/ack`, {
      status,
      result
    }, { allowMock: true });
  }

  async sendEvent(event: SynraMeshEvent): Promise<Record<string, unknown>> {
    if (event.type === "synra.userMessage") {
      return this.sendUserMessage(String(event.payload.text || ""), event.payload);
    }
    return this.post("/clients/ping", {
      deviceId: this.config.deviceId,
      name: this.config.displayName,
      platform: "Linux",
      capabilities: this.capabilityList(),
      lastStatus: event.type,
      synraEvent: event
    }, { allowMock: true }).then((result) => result.body);
  }

  async sendUserMessage(text: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return this.post("/clients/ping", {
      deviceId: this.config.deviceId,
      name: this.config.displayName,
      platform: "Linux",
      capabilities: this.capabilityList(),
      lastStatus: "synra.userMessage",
      userMessage: redactSecrets({ text, ...extra })
    }, { allowMock: true }).then((result) => result.body);
  }

  private capabilityList(): string[] {
    const caps = ["display", "speaker", "assistant", "synra", "health", "deviceCommands", "approval"];
    if (this.capabilities.edgeAgent) caps.push("edgeAgent");
    if (this.capabilities.notifications) caps.push("notifications");
    if (this.capabilities.camera) caps.push("camera");
    if (this.capabilities.microphone) caps.push("microphone");
    if (this.capabilities.localVision) caps.push("localVision");
    if (this.capabilities.localSpeech) caps.push("localSpeech");
    return caps;
  }

  private commandToEvent(command: Record<string, unknown>): SynraMeshEvent {
    const type = String(command.type || "display");
    const eventType = type === "speak" ? "synra.say" : type === "confirmation" ? "confirmation.request" : "synra.debug";
    const event: SynraMeshEvent = {
      eventId: String(command.id || crypto.randomUUID()),
      type: eventType as SynraMeshEvent["type"],
      source: { kind: "hub", id: "nodesparkhub" },
      target: { kind: "device", id: this.config.deviceId },
      timestamp: String(command.createdAt || nowIso()),
      payload: redactSecrets(command),
      requiresAck: true,
      permission: eventType === "confirmation.request" ? "execute" : "read",
      redactionApplied: true
    };
    if (eventType === "confirmation.request") this.state.pendingConfirmation = event.payload;
    return event;
  }

  private async post(path: string, body: unknown, options: { allowMock?: boolean } = {}): Promise<{ ok: boolean; body: Record<string, unknown> }> {
    return this.request("POST", path, body, options);
  }

  private async get(path: string, options: { allowMock?: boolean } = {}): Promise<{ ok: boolean; body: Record<string, unknown> }> {
    return this.request("GET", path, null, options);
  }

  private async request(method: "GET" | "POST", path: string, body: unknown, options: { allowMock?: boolean }): Promise<{ ok: boolean; body: Record<string, unknown> }> {
    const url = `${this.config.hubBaseUrl}${path}`;
    try {
      const headers: Record<string, string> = {
        "User-Agent": `SynraJetsonStation/${this.config.appVersion}`,
        "Accept": "application/json"
      };
      if (body !== null) headers["Content-Type"] = "application/json; charset=utf-8";
      if (this.config.hubToken) headers.Authorization = `Bearer ${this.config.hubToken}`;
      const response = await fetch(url, {
        method,
        headers,
        body: body === null ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(4000)
      });
      const text = await response.text();
      const parsed = text ? safeJson(text) : {};
      this.state.hubConnected = response.ok;
      this.state.mockMode = false;
      this.state.lastError = response.ok ? null : `Hub ${method} ${path} returned ${response.status}`;
      if (!response.ok) this.logger.warn(this.state.lastError || `Hub ${method} ${path} failed`, parsed);
      return { ok: response.ok, body: parsed };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.state.hubConnected = false;
      this.state.lastError = message;
      if (options.allowMock && this.config.simulate) {
        this.state.mockMode = true;
        this.logger.warn(`Hub unavailable; simulation mock accepted ${method} ${path}`, { error: message });
        return { ok: true, body: { ok: true, mock: true, path, method, deviceId: this.config.deviceId } };
      }
      this.logger.warn(`Hub request failed: ${method} ${path}`, { error: message });
      return { ok: false, body: { ok: false, error: message, path, method } };
    }
  }
}

function safeJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" ? redactSecrets(parsed as Record<string, unknown>) : { value: String(parsed) };
  } catch {
    return { text };
  }
}
