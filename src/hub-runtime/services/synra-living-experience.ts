import { synraAssistantMotionPresetMap } from "./synra-action-catalog";
import { SYNRA_LIVING_PERFORMANCE_ENGINE_VERSION } from "../core/synra-living-performance-engine";

export const crossDeviceContractVersion = "1.0";
export const SYNRA_ALIVE_ACCEPTANCE_MARKER = "Synra Alive Acceptance Test";

export type SynraEnergyLevel = "calm" | "balanced" | "expressive";
export type SynraProactiveHelpMode = "off" | "subtle" | "active";
export type SynraIntensityLevel = "low" | "normal" | "high";
export type SynraIdleMovementMode = "subtle" | "normal" | "expressive";
export type SynraMicMode = "off" | "tap-to-talk" | "hold-to-talk";
export type SynraCameraMode = "off" | "ask_each_time" | "enabled_while_open";
export type SynraVisionMemoryMode = "off" | "summary_only";
export type SynraWebAccessMode = "off" | "ask_each_time" | "read_only";

export interface SynraExperienceSettings {
  energy: SynraEnergyLevel;
  proactiveHelp: SynraProactiveHelpMode;
  motionIntensity: SynraIntensityLevel;
  emotionIntensity: SynraIntensityLevel;
  idleMovement: SynraIdleMovementMode;
  gestureWhileSpeaking: boolean;
  idleAwareness: boolean;
  reduceMotion: boolean;
  debugMode: boolean;
  micMode: SynraMicMode;
  cameraMode: SynraCameraMode;
  webAccessMode: SynraWebAccessMode;
  captions: boolean;
  voiceResponse: boolean;
  visionMemory: SynraVisionMemoryMode;
}

export type SynraCrossDeviceEventType =
  | "synra.state"
  | "synra.say"
  | "synra.motion"
  | "synra.expression"
  | "synra.gaze"
  | "synra.toolPlan"
  | "synra.toolResult"
  | "synra.confirmationRequest"
  | "synra.confirmationResult"
  | "synra.multimodalContext"
  | "synra.voiceStatus"
  | "synra.voiceTranscript"
  | "synra.cameraStatus"
  | "synra.workflowPlan"
  | "synra.workflowDraft"
  | "synra.workflowValidation"
  | "synra.workflowRunSummary"
  | "synra.toolProgress"
  | "synra.copilotState"
  | "synra.activeTask"
  | "synra.debug"
  | "synra.deviceStatus"
  | "synra.visionRequest"
  | "synra.visionSummary"
  | "synra.micStatus"
  | "synra.screenContext"
  | "synra.appContext"
  | "synra.livingState"
  | "synra.experienceSettings"
  | "synra.proactiveHint"
  | "synra.memoryUpdated"
  | "synra.memoryDeleted"
  | "synra.memorySnapshot"
  | "synra.memoryRetrieval";

export interface SynraCrossDeviceEventContract {
  crossDeviceContractVersion: string;
  livingPerformanceEngineVersion: string;
  referenceImplementation: "macOS NodeSparkHub WKWebView";
  futureClients: Array<"NodeSpark iOS WKWebView" | "Jetson Synra kiosk/station" | "Browser/PWA">;
  events: Array<{
    type: SynraCrossDeviceEventType;
    direction: "hub_to_client" | "client_to_hub" | "bidirectional";
    payload: string[];
    safety: string;
  }>;
}

export interface SynraProactiveHint {
  id: string;
  message: string;
  severity: "info" | "warning" | "action_needed";
  source: "workflow" | "credential" | "draft" | "confirmation" | "hub" | "schedule" | "device" | "run" | "memory" | "avatar";
  createdAt: string;
  rateLimited: boolean;
}

export interface SynraAmbientMotionEvent {
  timestamp: string;
  actionId: string | null;
  assistantState: string;
  selectedClipId: string | null;
  reason: string;
  skipped: boolean;
  route?: Record<string, unknown>;
}

export interface SynraAmbientMotionSchedulerOptions {
  debugState: () => Record<string, unknown>;
  playAction: (actionId: string, originalActionId: string) => Promise<Record<string, unknown>>;
  refresh?: () => void;
  minDelayMs?: number;
  maxDelayMs?: number;
}

export type SynraAdaptiveLifePhase =
  | "user_input"
  | "hearing_user"
  | "thinking"
  | "vision_capture"
  | "model_request"
  | "tool_work"
  | "waiting_for_confirmation"
  | "speaking"
  | "completed"
  | "idle";

export interface SynraAdaptiveLifeEvent {
  timestamp: string;
  phase: SynraAdaptiveLifePhase;
  skipped: boolean;
  reason: string;
  settingsPatch: Partial<SynraExperienceSettings>;
  runtimePatch: Record<string, boolean>;
  lipSyncPeak: number | null;
  source: string | null;
  requestId: string | null;
}

export interface SynraAdaptiveLifeControllerOptions {
  snapshot: () => Record<string, unknown>;
  applySettings: (patch: Partial<SynraExperienceSettings>) => SynraExperienceSettings;
  applyRuntimeLife?: (patch: Record<string, boolean>) => void;
  playInteraction?: (interaction: "assistant_speaking" | "idle", detail: Record<string, unknown>) => Promise<unknown>;
  refresh?: () => void;
}

const AMBIENT_IDLE_ACTIONS = [
  "idle",
  "idle_breathe",
  "shoulder_shift",
  "hand_fidget",
  "lean_in",
  "lean_back",
  "nod_soft",
  "look_left",
  "look_right",
  "look_up",
  "look_down",
  "look_screen",
  "look_camera",
  "curious_peek",
  "balance_shift"
] as const;

const AMBIENT_LISTENING_ACTIONS = [
  "listening",
  "lean_in",
  "nod_soft",
  "shoulder_shift",
  "look_camera",
  "look_left",
  "look_right",
  "look_screen"
] as const;

export class SynraAmbientMotionScheduler {
  private timer: number | null = null;
  private nextAt = 0;
  private lastEvent: SynraAmbientMotionEvent | null = null;
  private recentlyUsed: string[] = [];
  private readonly routeTrace: SynraAmbientMotionEvent[] = [];

  constructor(private readonly options: SynraAmbientMotionSchedulerOptions) {
    this.scheduleNext("initial");
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => void this.tick(), 1200);
  }

  stop(): void {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  async triggerNow(reason = "manual"): Promise<SynraAmbientMotionEvent> {
    const event = await this.tryPlay(reason, true);
    this.scheduleNext("manual");
    return event;
  }

  debugState(): Record<string, unknown> {
    return {
      enabled: this.timer !== null,
      nextAt: new Date(this.nextAt).toISOString(),
      nextInMs: Math.max(0, this.nextAt - Date.now()),
      safeIdleActions: [...AMBIENT_IDLE_ACTIONS],
      safeListeningActions: [...AMBIENT_LISTENING_ACTIONS],
      lastEvent: this.lastEvent,
      recentEvents: this.routeTrace.slice(-10),
      recentlyUsed: [...this.recentlyUsed],
      demoOnlyBlockedForAmbientLife: true,
      dispatcherRequired: true
    };
  }

  private async tick(): Promise<void> {
    if (Date.now() < this.nextAt) return;
    const event = await this.tryPlay("idle_alive_scheduler", false);
    this.scheduleNext(event.skipped ? "skipped" : "played");
  }

  private async tryPlay(reason: string, force: boolean): Promise<SynraAmbientMotionEvent> {
    const now = new Date().toISOString();
    const settings = getSynraExperienceSettings();
    const debug = this.options.debugState();
    const state = this.assistantState(debug);
    const runtime = debug.runtime as Record<string, unknown> | undefined;
    const authoredMotion = runtime?.authoredMotion as Record<string, unknown> | undefined;
    const channels = authoredMotion?.channels as Record<string, Record<string, unknown> | undefined> | undefined;
    const base = channels?.base;
    const gesture = channels?.gesture;
    const fullBodyRunning = Boolean((base?.localInstalledFullBody || base?.reference) && base?.isRunning);
    const gestureRunning = Boolean(gesture?.isRunning);
    const allowedState = state === "idle" || state === "listening";

    if (!settings.idleAwareness && !force) return this.record({ timestamp: now, actionId: null, assistantState: state, selectedClipId: null, reason: "idle awareness disabled", skipped: true });
    if (!allowedState && !force) return this.record({ timestamp: now, actionId: null, assistantState: state, selectedClipId: null, reason: `assistant state ${state} is not ambient-safe`, skipped: true });
    if ((fullBodyRunning || gestureRunning) && !force) return this.record({ timestamp: now, actionId: null, assistantState: state, selectedClipId: null, reason: "authored motion is already running", skipped: true });

    const actionId = this.pickAction(state, settings);
    const preset = synraAssistantMotionPresetMap().find((item) => item.actionId === actionId);
    const proceduralGaze = actionId.startsWith("look_");
    if ((!preset || preset.usage !== "assistant" || preset.quality === "bad_semantic_fit") && !proceduralGaze) {
      return this.record({ timestamp: now, actionId, assistantState: state, selectedClipId: preset?.clipId ?? null, reason: "no assistant-safe preset available", skipped: true });
    }

    const route = await this.options.playAction(actionId, `ambient_alive:${actionId}`);
    this.recentlyUsed.push(actionId);
    this.recentlyUsed = this.recentlyUsed.slice(-4);
    const event = this.record({
      timestamp: now,
      actionId,
      assistantState: state,
      selectedClipId: preset?.clipId ?? null,
      reason,
      skipped: false,
      route
    });
    this.options.refresh?.();
    return event;
  }

  private pickAction(state: string, settings: SynraExperienceSettings): string {
    const pool = state === "listening" ? AMBIENT_LISTENING_ACTIONS : AMBIENT_IDLE_ACTIONS;
    const weighted: string[] = [];
    for (const action of pool) {
      const recentPenalty = this.recentlyUsed.includes(action) ? 1 : 3;
      const baseWeight =
        action === "idle" || action === "idle_breathe" || action === "listening" ? 4 :
        action === "lean_in" || action === "shoulder_shift" || action === "hand_fidget" ? 5 :
        action.startsWith("look_") ? 3 :
        action === "nod_soft" ? 4 :
        2;
      const energyBoost = settings.energy === "expressive" ? 3 : settings.energy === "calm" ? -1 : 1;
      const count = Math.max(1, baseWeight + energyBoost) * recentPenalty;
      for (let i = 0; i < count; i += 1) weighted.push(action);
    }
    return weighted[Math.floor(Math.random() * weighted.length)] ?? "idle";
  }

  private assistantState(debug: Record<string, unknown>): string {
    const assistant = debug.assistant as Record<string, unknown> | undefined;
    const assistantState = assistant?.assistantState as Record<string, unknown> | undefined;
    return String(assistantState?.state || assistantState || "idle");
  }

  private scheduleNext(reason: string): void {
    const settings = getSynraExperienceSettings();
    const scale =
      settings.idleMovement === "expressive" ? 0.62 :
      settings.idleMovement === "subtle" ? 1.2 :
      1;
    const min = this.options.minDelayMs ?? 3600;
    const max = this.options.maxDelayMs ?? 8800;
    this.nextAt = Date.now() + Math.round((min + Math.random() * (max - min)) * scale);
    if (this.lastEvent && !this.lastEvent.skipped) this.lastEvent.reason = `${this.lastEvent.reason}; next scheduled after ${reason}`;
  }

  private record(event: SynraAmbientMotionEvent): SynraAmbientMotionEvent {
    this.lastEvent = event;
    this.routeTrace.push(event);
    while (this.routeTrace.length > 50) this.routeTrace.shift();
    return event;
  }
}

export class SynraAdaptiveLifeController {
  private readonly trace: SynraAdaptiveLifeEvent[] = [];
  private lastEvent: SynraAdaptiveLifeEvent | null = null;
  private speechWatchTimer: number | null = null;
  private speechMotionTimer: number | null = null;
  private speechWatchCount = 0;
  private speechMotionPulseCount = 0;
  private weakLipSyncRecoveries = 0;

  constructor(private readonly options: SynraAdaptiveLifeControllerOptions) {}

  observePhase(phase: SynraAdaptiveLifePhase, detail: Record<string, unknown> = {}): SynraAdaptiveLifeEvent {
    const settings = getSynraExperienceSettings();
    const snapshot = this.options.snapshot();
    const settingsPatch: Partial<SynraExperienceSettings> = {};
    const runtimePatch: Record<string, boolean> = {};
    const source = typeof detail.source === "string" ? detail.source : null;
    const requestId = typeof detail.requestId === "string" ? detail.requestId : null;
    let skipped = false;
    let reason = "adaptive life floor applied";

    if (settings.reduceMotion) {
      skipped = true;
      reason = "reduce motion enabled";
    } else {
      if (!settings.idleAwareness) settingsPatch.idleAwareness = true;
      if (!settings.gestureWhileSpeaking && phase === "speaking") settingsPatch.gestureWhileSpeaking = true;
      if (settings.energy === "calm" && (phase === "speaking" || phase === "hearing_user")) settingsPatch.energy = "balanced";
      if (settings.idleMovement === "subtle" && (phase === "hearing_user" || phase === "user_input")) settingsPatch.idleMovement = "normal";
      if (settings.motionIntensity === "low" && (phase === "speaking" || phase === "tool_work")) settingsPatch.motionIntensity = "normal";

      runtimePatch.enabled = true;
      runtimePatch.life = true;
      runtimePatch.gaze = true;
      runtimePatch.guardrails = true;
      runtimePatch.forceProceduralPerformance = false;
      this.options.applyRuntimeLife?.(runtimePatch);

      if (Object.keys(settingsPatch).length) {
        this.options.applySettings(settingsPatch);
      }
    }

    const event = this.record({
      timestamp: nowIso(),
      phase,
      skipped,
      reason,
      settingsPatch,
      runtimePatch,
      lipSyncPeak: this.lipSyncPeak(snapshot),
      source,
      requestId
    });

    if (phase === "speaking" && !skipped) {
      this.scheduleSpeechWatch(requestId);
      this.scheduleSpeechMotionPulses(requestId);
    }
    if (phase === "completed" || phase === "idle") this.clearSpeechWatch();
    this.options.refresh?.();
    return event;
  }

  debugState(): Record<string, unknown> {
    return {
      marker: "synra-adaptive-life-controller-v1",
      enabled: true,
      lastEvent: this.lastEvent,
      recentEvents: this.trace.slice(-16),
      speechWatchCount: this.speechWatchCount,
      speechMotionPulseCount: this.speechMotionPulseCount,
      weakLipSyncRecoveries: this.weakLipSyncRecoveries,
      respectsReduceMotion: true,
      automaticRuntimeLifeFloor: ["enabled", "life", "gaze", "guardrails"],
      phaseDrivenSettings: ["idleAwareness", "gestureWhileSpeaking", "energy", "idleMovement", "motionIntensity"]
    };
  }

  private scheduleSpeechWatch(requestId: string | null): void {
    this.clearSpeechWatch();
    this.speechWatchTimer = window.setTimeout(() => {
      this.speechWatchTimer = null;
      this.speechWatchCount += 1;
      const snapshot = this.options.snapshot();
      const lipSync = snapshot.lipSync as Record<string, unknown> | undefined;
      const speaking = lipSync?.speaking === true;
      const peak = this.lipSyncPeak(snapshot) ?? 0;
      if (!speaking || peak >= 0.035) return;
      this.weakLipSyncRecoveries += 1;
      void this.options.playInteraction?.("assistant_speaking", {
        source: "system",
        requestId: requestId || undefined,
        reason: "adaptive_life_weak_lipsync_recovery",
        force: true
      });
      this.record({
        timestamp: nowIso(),
        phase: "speaking",
        skipped: false,
        reason: "weak lip sync detected; refreshed speaking motion layer",
        settingsPatch: {},
        runtimePatch: { life: true, gaze: true },
        lipSyncPeak: peak,
        source: "adaptive_life",
        requestId
      });
      this.options.refresh?.();
    }, 900);
  }

  private clearSpeechWatch(): void {
    if (this.speechWatchTimer === null) return;
    window.clearTimeout(this.speechWatchTimer);
    this.speechWatchTimer = null;
    this.clearSpeechMotionPulses();
  }

  private scheduleSpeechMotionPulses(requestId: string | null): void {
    this.clearSpeechMotionPulses();
    let pulse = 0;
    const runPulse = () => {
      const snapshot = this.options.snapshot();
      const lipSync = snapshot.lipSync as Record<string, unknown> | undefined;
      const assistant = snapshot.assistant as Record<string, unknown> | undefined;
      const assistantState = String((assistant?.assistantState as Record<string, unknown> | undefined)?.state || assistant?.assistantState || "");
      const speaking = lipSync?.speaking === true || assistantState === "speaking";
      if (!speaking || pulse >= 5) {
        this.clearSpeechMotionPulses();
        return;
      }
      pulse += 1;
      this.speechMotionPulseCount += 1;
      void this.options.playInteraction?.("assistant_speaking", {
        source: "adaptive_life",
        requestId: requestId || undefined,
        pulse,
        reason: "speaking_motion_pulse",
        force: true
      });
      this.speechMotionTimer = window.setTimeout(runPulse, pulse === 1 ? 1450 : 2350);
    };
    this.speechMotionTimer = window.setTimeout(runPulse, 650);
  }

  private clearSpeechMotionPulses(): void {
    if (this.speechMotionTimer === null) return;
    window.clearTimeout(this.speechMotionTimer);
    this.speechMotionTimer = null;
  }

  private lipSyncPeak(snapshot: Record<string, unknown>): number | null {
    const lipSync = snapshot.lipSync as Record<string, unknown> | undefined;
    const current = lipSync?.current as Record<string, number> | undefined;
    const target = lipSync?.target as Record<string, number> | undefined;
    if (!current && !target) return null;
    return Math.max(
      Number(current?.aa ?? 0),
      Number(current?.ih ?? 0),
      Number(current?.ou ?? 0),
      Number(current?.ee ?? 0),
      Number(current?.oh ?? 0),
      Number(target?.aa ?? 0),
      Number(target?.ih ?? 0),
      Number(target?.ou ?? 0),
      Number(target?.ee ?? 0),
      Number(target?.oh ?? 0)
    );
  }

  private record(event: SynraAdaptiveLifeEvent): SynraAdaptiveLifeEvent {
    this.lastEvent = event;
    this.trace.push(event);
    while (this.trace.length > 80) this.trace.shift();
    return event;
  }
}

const SETTINGS_KEY = "synra.experienceSettings.v1";
const HINT_RATE_LIMIT_MS = 90_000;
const nowIso = () => new Date().toISOString();

export const DEFAULT_SYNRA_EXPERIENCE_SETTINGS: SynraExperienceSettings = {
  energy: "balanced",
  proactiveHelp: "subtle",
  motionIntensity: "normal",
  emotionIntensity: "normal",
  idleMovement: "normal",
  gestureWhileSpeaking: true,
  idleAwareness: true,
  reduceMotion: false,
  debugMode: false,
  micMode: "tap-to-talk",
  cameraMode: "ask_each_time",
  webAccessMode: "read_only",
  captions: true,
  voiceResponse: true,
  visionMemory: "summary_only"
};

export const SYNRA_CROSS_DEVICE_CONTRACT: SynraCrossDeviceEventContract = {
  crossDeviceContractVersion,
  referenceImplementation: "macOS NodeSparkHub WKWebView",
  futureClients: ["NodeSpark iOS WKWebView", "Jetson Synra kiosk/station", "Browser/PWA"],
  events: [
    { type: "synra.state", direction: "bidirectional", payload: ["state", "reason", "startedAt", "message"], safety: "No secrets; state only." },
    { type: "synra.say", direction: "hub_to_client", payload: ["text", "voice", "sessionId"], safety: "Redact tool payloads before display." },
    { type: "synra.motion", direction: "hub_to_client", payload: ["actionId", "channel", "routeTrace"], safety: "Must use dispatcher-selected routes." },
    { type: "synra.expression", direction: "hub_to_client", payload: ["expression", "intensity"], safety: "Expression-only; no app data." },
    { type: "synra.gaze", direction: "hub_to_client", payload: ["target", "strength"], safety: "No camera activation implied." },
    { type: "synra.toolPlan", direction: "hub_to_client", payload: ["toolIds", "riskLevels", "confirmationRequired"], safety: "Risky tools remain confirmation-gated." },
    { type: "synra.toolProgress", direction: "hub_to_client", payload: ["toolId", "status", "riskLevel"], safety: "Status only; raw arguments are redacted." },
    { type: "synra.toolResult", direction: "hub_to_client", payload: ["status", "summary", "safeDisplayData"], safety: "Safe display data only." },
    { type: "synra.confirmationRequest", direction: "hub_to_client", payload: ["confirmationId", "title", "riskLevel"], safety: "Only user UI can confirm." },
    { type: "synra.confirmationResult", direction: "hub_to_client", payload: ["status", "summary", "toolId"], safety: "No model or remote device can self-confirm." },
    { type: "synra.multimodalContext", direction: "bidirectional", payload: ["inputMode", "intent", "assistantState", "safeContext"], safety: "Redacted summaries only; no raw frames, audio, or secrets." },
    { type: "synra.voiceStatus", direction: "bidirectional", payload: ["status", "source", "visibleIndicator"], safety: "Voice requires explicit visible mic state." },
    { type: "synra.voiceTranscript", direction: "client_to_hub", payload: ["partialTranscript", "finalTranscript", "source"], safety: "Transcript text only; no raw audio." },
    { type: "synra.cameraStatus", direction: "bidirectional", payload: ["active", "permission", "visibleIndicator"], safety: "Camera capture requires explicit user action and visible status." },
    { type: "synra.workflowPlan", direction: "hub_to_client", payload: ["intent", "userGoal", "proposedSteps", "riskLevel"], safety: "Draft planning only; no execution." },
    { type: "synra.workflowDraft", direction: "hub_to_client", payload: ["draftId", "summary", "assumptions", "questions"], safety: "Drafts do not run or activate workflows." },
    { type: "synra.workflowValidation", direction: "hub_to_client", payload: ["warnings", "errors", "missingCredentials"], safety: "Credential names/status only; no raw secrets." },
    { type: "synra.workflowRunSummary", direction: "hub_to_client", payload: ["runId", "status", "duration", "safeSummary"], safety: "Run logs are redacted." },
    { type: "synra.copilotState", direction: "hub_to_client", payload: ["activeTask", "toolPlan", "lastWorkflowPlan"], safety: "Redacted workflow copilot state only." },
    { type: "synra.activeTask", direction: "bidirectional", payload: ["taskId", "intent", "status", "source"], safety: "No private payloads or secrets." },
    { type: "synra.debug", direction: "hub_to_client", payload: ["redactedState", "routeTrace", "timing"], safety: "Debug output is redacted." },
    { type: "synra.deviceStatus", direction: "client_to_hub", payload: ["deviceId", "status", "capabilities"], safety: "No auth tokens in payload." },
    { type: "synra.visionRequest", direction: "bidirectional", payload: ["requestId", "visibleUserIntent", "targetDevice"], safety: "Never silently capture frames." },
    { type: "synra.visionSummary", direction: "hub_to_client", payload: ["requestId", "summary", "confidence"], safety: "Store/send summary only by default; no raw frame persistence." },
    { type: "synra.micStatus", direction: "bidirectional", payload: ["status", "source", "partialTranscript"], safety: "No raw audio storage." },
    { type: "synra.screenContext", direction: "client_to_hub", payload: ["currentPanel", "selectedWorkflow", "selectedRun"], safety: "Safe UI context only; no private file contents." },
    { type: "synra.appContext", direction: "hub_to_client", payload: ["hubStatus", "workflowSummaries", "integrationHealth", "pendingConfirmation"], safety: "Safe summaries only; secrets are redacted." },
    { type: "synra.livingState", direction: "hub_to_client", payload: ["lifeLayerActive", "gazeTarget", "postureState", "currentExpression"], safety: "No camera or mic activation implied." },
    { type: "synra.experienceSettings", direction: "hub_to_client", payload: ["energy", "motionIntensity", "idleMovement", "reduceMotion", "webAccessMode"], safety: "User-visible settings only; web access can be off or confirmation-gated." },
    { type: "synra.proactiveHint", direction: "hub_to_client", payload: ["id", "message", "severity", "source"], safety: "Rate-limited and never executes actions." },
    { type: "synra.memoryUpdated", direction: "bidirectional", payload: ["memoryId", "type", "summary", "source"], safety: "Summary-only memory event; redacted before transport." },
    { type: "synra.memoryDeleted", direction: "bidirectional", payload: ["memoryId", "type", "reason"], safety: "Deletion event only; no raw private payloads." },
    { type: "synra.memorySnapshot", direction: "hub_to_client", payload: ["countsByType", "workingMemory", "policy"], safety: "Inspectable redacted memory summary only." },
    { type: "synra.memoryRetrieval", direction: "hub_to_client", payload: ["querySummary", "memoryIds", "types"], safety: "Redacted retrieval metadata only; no secrets." }
  ],
  livingPerformanceEngineVersion: SYNRA_LIVING_PERFORMANCE_ENGINE_VERSION
};

export function getSynraExperienceSettings(): SynraExperienceSettings {
  try {
    const raw = window.localStorage?.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SYNRA_EXPERIENCE_SETTINGS };
    return normalizeSettings(JSON.parse(raw) as Partial<SynraExperienceSettings>);
  } catch {
    return { ...DEFAULT_SYNRA_EXPERIENCE_SETTINGS };
  }
}

export function setSynraExperienceSettings(patch: Partial<SynraExperienceSettings>): SynraExperienceSettings {
  const next = normalizeSettings({ ...getSynraExperienceSettings(), ...patch });
  try {
    window.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Experience controls are best-effort when storage is locked down.
  }
  return next;
}

export function intensityMultiplier(value: SynraIntensityLevel | SynraIdleMovementMode | SynraEnergyLevel): number {
  if (value === "low" || value === "subtle" || value === "calm") return 0.72;
  if (value === "high" || value === "expressive") return 1.28;
  return 1;
}

export class SynraProactiveHintManager {
  private readonly lastShownAt = new Map<string, number>();
  private lastHint: SynraProactiveHint | null = null;

  maybeHint(snapshot: Record<string, unknown>, now = Date.now()): SynraProactiveHint | null {
    const settings = getSynraExperienceSettings();
    if (settings.proactiveHelp === "off") return null;
    const pending = snapshot.pendingConfirmation as Record<string, unknown> | null | undefined;
    const lastError = String(snapshot.lastError || "");
    const workingMemory = snapshot.workingMemory as Record<string, unknown> | undefined;
    const appStateSummary = String((workingMemory?.appStateSummary as string | undefined) || "");
    const longTerm = snapshot.longTermMemory as Record<string, unknown> | undefined;
    const memoryByType = longTerm?.byType as Record<string, number> | undefined;
    const avatar = snapshot.avatarLiveliness as Record<string, unknown> | undefined;
    const avatarStatus = String(avatar?.status || "");
    const avatarHealth = avatar?.health as Record<string, unknown> | undefined;
    const avatarHeadline = String(avatarHealth?.headline || "Synra avatar life needs attention.");
    const candidate =
      pending ? this.hint("confirmation", "action_needed", "I’m waiting for your confirmation before I do anything risky.") :
      settings.debugMode && avatarStatus === "blocked" ? this.hint("avatar", "info", this.avatarLoadingMessage(avatarHeadline)) :
      settings.debugMode && avatarStatus === "watch" ? this.hint("avatar", "info", this.avatarWatchMessage(avatarHeadline)) :
      /credential/i.test(appStateSummary) ? this.hint("credential", "warning", "A workflow may need missing credentials before it can run safely.") :
      /disabled schedule|schedule disabled/i.test(appStateSummary) ? this.hint("schedule", "warning", "A schedule looks disabled. I can help review it before anything runs.") :
      /stuck|hung|timeout/i.test(appStateSummary) ? this.hint("run", "warning", "A run may be stuck. I can inspect it without taking action.") :
      /offline device|device offline|worker offline/i.test(appStateSummary) ? this.hint("device", "warning", "A worker or device appears offline. I can show the safe status summary.") :
      /draft/i.test(appStateSummary) ? this.hint("draft", "info", "There’s a draft that should be validated before running.") :
      /offline|hub/i.test(lastError) ? this.hint("hub", "warning", "Hub status needs attention before I can rely on live app actions.") :
      /failed|failure|error/i.test(appStateSummary) ? this.hint("workflow", "warning", "I noticed a workflow problem. I can help inspect it when you’re ready.") :
      memoryByType?.workflowFailure ? this.hint("workflow", "info", "I remember a recent workflow failure context if you want to continue debugging it.") :
      null;

    if (!candidate) return null;
    const key = candidate.source;
    const last = this.lastShownAt.get(key) ?? 0;
    if (now - last < HINT_RATE_LIMIT_MS) return { ...candidate, rateLimited: true };
    this.lastShownAt.set(key, now);
    this.lastHint = candidate;
    return candidate;
  }

  debugState(): Record<string, unknown> {
    return {
      proactiveHintsEnabled: getSynraExperienceSettings().proactiveHelp,
      lastHint: this.lastHint,
      rateLimitMs: HINT_RATE_LIMIT_MS,
      trackedHints: [...this.lastShownAt.entries()].map(([source, lastShownAt]) => ({ source, lastShownAt }))
    };
  }

  private hint(source: SynraProactiveHint["source"], severity: SynraProactiveHint["severity"], message: string): SynraProactiveHint {
    return {
      id: `${source}-${Date.now()}`,
      source,
      severity,
      message,
      createdAt: new Date().toISOString(),
      rateLimited: false
    };
  }

  private avatarLoadingMessage(avatarHeadline: string): string {
    return `${avatarHeadline} Avatar recovery details are available in diagnostics.`;
  }

  private avatarWatchMessage(avatarHeadline: string): string {
    return `${avatarHeadline} Avatar motion details are available in diagnostics.`;
  }
}

export function runSynraAliveAcceptanceSnapshot(debug: Record<string, unknown>): Record<string, unknown> {
  const runtime = debug.runtime as Record<string, unknown> | undefined;
  const performance = (runtime?.performance as Record<string, unknown> | undefined)
    ?? ((runtime?.proceduralOverlays as Record<string, unknown> | undefined)?.performance as Record<string, unknown> | undefined)
    ?? {};
  const route = debug.actionRouting as Record<string, unknown> | undefined;
  const lastRoute = route?.lastActionRoute as Record<string, unknown> | undefined;
  const checks = [
    { id: "life-layer", pass: Boolean(performance.lifeLayerActive ?? (runtime?.proceduralOverlays as Record<string, unknown> | undefined)?.lifeLayerActive), detail: "Life layer active." },
    { id: "breathing", pass: Boolean(performance.breathing ?? (runtime?.proceduralOverlays as Record<string, unknown> | undefined)?.breathing), detail: "Breathing active." },
    { id: "gaze", pass: Boolean(performance.currentGazeTarget || performance.gazeTarget), detail: "Gaze target exists." },
    { id: "local-routing", pass: lastRoute?.selectedPlaybackPath === "localInstalledFullBody" || lastRoute?.selectedPlaybackPath === "localImportedFullBody", detail: "Last routed action used a full-body local path." },
    { id: "no-procedural-over-reference", pass: lastRoute ? lastRoute.proceduralOverrideActive === false : true, detail: "Local full-body route is not procedurally overridden." },
    { id: "guardrails", pass: performance.guardrailApplied !== undefined || performance.lastGuardrailDecision !== undefined, detail: "Guardrail debug is exposed." }
  ];
  return {
    marker: SYNRA_ALIVE_ACCEPTANCE_MARKER,
    generatedAt: new Date().toISOString(),
    passed: checks.filter((check) => check.pass).length,
    total: checks.length,
    checks
  };
}

function normalizeSettings(input: Partial<SynraExperienceSettings>): SynraExperienceSettings {
  return {
    energy: enumValue(input.energy, ["calm", "balanced", "expressive"], DEFAULT_SYNRA_EXPERIENCE_SETTINGS.energy),
    proactiveHelp: enumValue(input.proactiveHelp, ["off", "subtle", "active"], DEFAULT_SYNRA_EXPERIENCE_SETTINGS.proactiveHelp),
    motionIntensity: enumValue(input.motionIntensity, ["low", "normal", "high"], DEFAULT_SYNRA_EXPERIENCE_SETTINGS.motionIntensity),
    emotionIntensity: enumValue(input.emotionIntensity, ["low", "normal", "high"], DEFAULT_SYNRA_EXPERIENCE_SETTINGS.emotionIntensity),
    idleMovement: enumValue(input.idleMovement, ["subtle", "normal", "expressive"], DEFAULT_SYNRA_EXPERIENCE_SETTINGS.idleMovement),
    gestureWhileSpeaking: input.gestureWhileSpeaking ?? DEFAULT_SYNRA_EXPERIENCE_SETTINGS.gestureWhileSpeaking,
    idleAwareness: input.idleAwareness ?? DEFAULT_SYNRA_EXPERIENCE_SETTINGS.idleAwareness,
    reduceMotion: input.reduceMotion ?? DEFAULT_SYNRA_EXPERIENCE_SETTINGS.reduceMotion,
    debugMode: input.debugMode ?? DEFAULT_SYNRA_EXPERIENCE_SETTINGS.debugMode,
    micMode: enumValue(input.micMode, ["off", "tap-to-talk", "hold-to-talk"], DEFAULT_SYNRA_EXPERIENCE_SETTINGS.micMode),
    cameraMode: enumValue(input.cameraMode, ["off", "ask_each_time", "enabled_while_open"], DEFAULT_SYNRA_EXPERIENCE_SETTINGS.cameraMode),
    webAccessMode: enumValue(input.webAccessMode, ["off", "ask_each_time", "read_only"], DEFAULT_SYNRA_EXPERIENCE_SETTINGS.webAccessMode),
    captions: input.captions ?? DEFAULT_SYNRA_EXPERIENCE_SETTINGS.captions,
    voiceResponse: input.voiceResponse ?? DEFAULT_SYNRA_EXPERIENCE_SETTINGS.voiceResponse,
    visionMemory: enumValue(input.visionMemory, ["off", "summary_only"], DEFAULT_SYNRA_EXPERIENCE_SETTINGS.visionMemory)
  };
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}
