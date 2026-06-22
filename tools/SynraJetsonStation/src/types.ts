export const crossDeviceContractVersion = "1.0";

export type SynraDeviceType = "macos" | "ios" | "ipad" | "jetson" | "browser" | "pwa" | "unknown";
export type SynraPlatform = "macOS" | "iOS" | "iPadOS" | "Linux" | "browser" | "unknown";
export type SynraPowerState = "unknown" | "battery" | "pluggedIn";
export type SynraNetworkState = "unknown" | "local" | "remote";
export type SynraSensorStatus = "unavailable" | "available" | "active" | "permissionDenied";
export type SynraDisplayStatus = "available" | "unavailable";
export type SynraStationState = "idle" | "listening" | "thinking" | "speaking" | "executing_tool" | "waiting_for_confirmation" | "error" | "offline";
export type SynraPermission = "read" | "draft" | "execute" | "destructive" | "secrets";

export interface SynraStationCapabilities {
  displayAvatar: boolean;
  camera: boolean;
  microphone: boolean;
  speaker: boolean;
  tts: boolean;
  localSpeech: boolean;
  localVision: boolean;
  remoteVision: boolean;
  workflowControl: boolean;
  edgeAgent: boolean;
  notifications: boolean;
  fileAccess: boolean;
  screenShare: boolean;
}

export interface SynraStationPermissions {
  canReceiveSynraOutput: boolean;
  canSendUserInput: boolean;
  canRequestVision: boolean;
  canUseMicrophone: boolean;
  canShowWorkflowStatus: boolean;
  canRequestWorkflowRun: boolean;
  canExecuteLocalTools: boolean;
}

export interface SynraDeviceStatus {
  online: boolean;
  lastSeenAt: string;
  lastHeartbeatAt: string;
  battery: number | null;
  power: SynraPowerState;
  network: SynraNetworkState;
  cameraStatus: SynraSensorStatus;
  microphoneStatus: SynraSensorStatus;
  displayStatus: SynraDisplayStatus;
  synraState: SynraStationState;
}

export interface SynraDeviceRecord {
  deviceId: string;
  displayName: string;
  deviceType: SynraDeviceType;
  platform: SynraPlatform;
  appVersion?: string;
  osVersion?: string;
  capabilities: SynraStationCapabilities;
  permissions: SynraStationPermissions;
  status: SynraDeviceStatus;
  activeSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StationCameraDevice {
  path: string;
  present: boolean;
  configured: boolean;
}

export interface StationAudioDevice {
  id: string;
  label: string;
  present: boolean;
  configured: boolean;
}

export type StationRouteStatus = "ready" | "degraded" | "not-configured" | "unavailable";

export interface StationCameraHealth {
  enabled: boolean;
  status: SynraSensorStatus;
  lastError: string | null;
  configuredDevice: string | null;
  devices: StationCameraDevice[];
  routeStatus: StationRouteStatus;
}

export interface StationMicrophoneHealth {
  enabled: boolean;
  status: SynraSensorStatus;
  lastError: string | null;
  configuredSource: string | null;
  sources: StationAudioDevice[];
  routeStatus: StationRouteStatus;
}

export interface StationIdentitySmoke {
  ok: boolean;
  camera: { status: StationRouteStatus; configuredDevice: string | null; devices: StationCameraDevice[] };
  microphone: { status: StationRouteStatus; configuredSource: string | null; sources: StationAudioDevice[] };
  stt: { status: StationRouteStatus; provider: string; lastError: string | null };
  speaker: { status: StationRouteStatus; provider: string; lastError: string | null };
  identity: { faceSampleCount: number; voiceSampleCount: number; rawSamplesIncluded: false; secretsIncluded: false };
}

export interface SynraHealthReport {
  generatedAt: string;
  uptimeSeconds: number;
  server: {
    running: boolean;
    host: string;
    port: number;
    synraRuntimePresent: boolean;
  };
  hub: {
    baseUrl: string;
    connected: boolean;
    lastHeartbeatAt: string | null;
    lastError: string | null;
    mockMode: boolean;
  };
  system: {
    platform: NodeJS.Platform;
    arch: string;
    loadAverage: number[];
    memory: { totalBytes: number; freeBytes: number };
    disk: { totalBytes: number | null; freeBytes: number | null };
    temperatureC: number | null;
    gpu: string | null;
    network: SynraNetworkState;
  };
  camera: StationCameraHealth;
  microphone: StationMicrophoneHealth;
  identitySmoke: StationIdentitySmoke;
  lastError: string | null;
}

export interface SynraMeshEvent {
  eventId: string;
  type: SynraMeshEventType;
  source: { kind: "hub" | "device" | "assistant" | "user"; id: string };
  target: { kind: "hub" | "device" | "session" | "broadcast"; id: string };
  timestamp: string;
  payload: Record<string, unknown>;
  requiresAck: boolean;
  permission: SynraPermission;
  redactionApplied: boolean;
}

export type SynraMeshEventType =
  | "device.register"
  | "device.heartbeat"
  | "device.statusChanged"
  | "device.offline"
  | "synra.state"
  | "synra.say"
  | "synra.motion"
  | "synra.expression"
  | "synra.gaze"
  | "synra.debug"
  | "synra.userMessage"
  | "synra.visionRequest"
  | "synra.visionSummary"
  | "synra.micStatus"
  | "synra.toolIntent"
  | "synra.toolPlan"
  | "synra.toolResult"
  | "confirmation.request"
  | "confirmation.accepted"
  | "confirmation.denied";

export type StationBridgeMessageType =
  | "assistant.ask"
  | "assistant.cancel"
  | "device.status"
  | "device.heartbeat"
  | "voice.status"
  | "voice.start"
  | "voice.stop"
  | "camera.status"
  | "camera.captureForVision"
  | "confirmation.accept"
  | "confirmation.cancel"
  | "debug.state"
  | "settings.get"
  | "settings.update";

export interface StationConfig {
  rootDir: string;
  host: string;
  port: number;
  hubBaseUrl: string;
  hubToken: string | null;
  deviceId: string;
  displayName: string;
  appVersion: string;
  osVersion: string;
  simulate: boolean;
  once: boolean;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  localVision: boolean;
  localSpeech: boolean;
  chromiumBin: string | null;
  heartbeatIntervalMs: number;
}

export interface PublicStationConfig {
  crossDeviceContractVersion: string;
  deviceId: string;
  displayName: string;
  deviceType: SynraDeviceType;
  platform: SynraPlatform;
  appVersion: string;
  hubBaseUrl: string;
  capabilities: SynraStationCapabilities;
  permissions: SynraStationPermissions;
  cameraStatus: SynraSensorStatus;
  microphoneStatus: SynraSensorStatus;
  simulationMode: boolean;
}

export interface StationStatus {
  device: SynraDeviceRecord;
  hubConnected: boolean;
  mockMode: boolean;
  lastHubError: string | null;
  eventQueueSize: number;
  lastEvent: SynraMeshEvent | null;
  pendingConfirmation: Record<string, unknown> | null;
}
