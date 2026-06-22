import "./styles.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { DEFAULT_SYNRA_AVATAR_ID, SYNRA_AVATARS, getSynraAvatar, isSynraAvatarId, type SynraAvatarId } from "./avatar-catalog";
import { SynraAvatarRuntime } from "./hub-runtime/drivers/avatar3d";
import type { SynraActionName, SynraMode } from "./hub-runtime/types/avatar";
import { askModel, classifySynraRequest, localSynraReply } from "./model-client";
import { SynraMotionPlayer, type SynraMotionClipSpec } from "./motion-player";
import { SERVER_SECRET_SENTINEL, loadCompanionSettings, loadHomeAssistantSettings, loadMemory, loadModelSettings, loadProductSettings, loadVisualSettings, loadVoiceSettings, saveCompanionSettings, saveHomeAssistantSettings, saveMemory, saveModelSettings, saveProductSettings, saveVisualSettings, saveVoiceSettings } from "./storage";
import type { CompanionSettings, HomeAssistantConfirmationPolicy, HomeAssistantEntity, HomeAssistantSettings, KnownUserProfile, ModelSettings, NodeSparkAccess, ProductSettings, RenderQuality, ScreenTimeoutMinutes, SynraFacePose, SynraFacePoseSamples, SynraIdentityReadiness, SynraMemory, SynraMessage, SynraSkillMode, SynraState, VisualSettings, VoiceMatchMode, VoiceMatchSensitivity, VoicePrintSample, VoiceProvider, VoiceSettings, WakeWordMode } from "./types";
import { FACE_ENROLLMENT_POSE_INSTRUCTIONS, FACE_ENROLLMENT_POSE_LABELS, FACE_ENROLLMENT_POSES, REQUIRED_FACE_POSE_COUNT, REQUIRED_VOICE_SAMPLE_COUNT, faceSamplesFromPoseMap, identityReadinessForUser, normalizeFacePoseSamples } from "./identity";
import { defaultIdentityStatus, normalizeIdentityStatus, type SynraIdentityDeviceState, type SynraIdentityStatus } from "./identity-contract";
import { evaluateFaceFrameQuality, evaluateVoiceEnrollmentQuality, type EnrollmentMicrophoneSignal } from "./enrollmentQuality";
import { estimateSpeechDurationMs, visemesForSpeechPosition } from "./hub-runtime/services/speech-output";
import packageInfo from "../package.json";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing app root.");
const SYNRA_STANDALONE_VERSION = String((packageInfo as { version?: string }).version ?? "0.1.0");

type SynraBackground = {
  id: string;
  label: string;
  url: string;
};

type MotionCategory = {
  id: string;
  label: string;
  routeIds?: string[];
  match?: string[];
};

type LocalCommandResult = {
  text: string;
  motion?: string;
  routeLabel?: string;
  card?: ChatCard;
};

type ConnectionTruthStatus = "not-configured" | "configured" | "checking" | "reachable" | "unreachable" | "off" | "permission-needed" | "ready";
type ConnectionTruthKey = "ai" | "nodeSpark" | "homeAssistant" | "voice" | "vision";

type ConnectionTruth = {
  status: ConnectionTruthStatus;
  detail: string;
};

type PendingAction = {
  type: "smart_home";
  action: "turn_on" | "turn_off" | "toggle";
  label: string;
  entityId?: string;
  confirmationToken?: string;
  createdAt: number;
} | {
  type: "nodespark_workflow";
  workflowName: string;
  label: string;
  confirmationToken?: string;
  createdAt: number;
};

type CameraDeviceStatus = {
  path: string;
  exists?: boolean;
  configured?: boolean;
  kind?: "video" | "media";
};

type ElevenLabsVoice = {
  voiceId: string;
  name: string;
  category?: string;
  previewUrl?: string;
};
type ElevenLabsSpeechAlignment = {
  characters?: string[];
  characterStartTimesSeconds?: number[];
  characterEndTimesSeconds?: number[];
};
type SynraKioskWindowMode = "fullscreen" | "windowed";
type SynraKioskBridge = {
  getWindowMode: () => Promise<SynraKioskWindowMode>;
  setWindowMode: (mode: SynraKioskWindowMode) => Promise<SynraKioskWindowMode>;
  toggleWindowMode: () => Promise<SynraKioskWindowMode>;
  setScreenTimeout?: (minutes: ScreenTimeoutMinutes) => Promise<ScreenTimeoutMinutes>;
  wakeDisplay?: () => Promise<boolean>;
};

declare global {
  interface Window {
    synraKiosk?: SynraKioskBridge;
  }
}

type VisionPublicStatus = {
  ok?: boolean;
  configuredDevice?: string;
  cameraDevices?: CameraDeviceStatus[];
  cameraDeviceCount?: number;
  videoDeviceCount?: number;
  mediaDeviceCount?: number;
};

type NodeSparkActionResponse = {
  ok?: boolean;
  error?: string;
  service?: string;
  version?: string;
  status?: string;
  path?: string;
  workflows?: Array<string | NodeSparkWorkflowSummary>;
  runs?: Array<{ id?: string; workflow?: string; status?: string; startedAt?: string; endedAt?: string }>;
  run?: { id?: string; workflow?: string; status?: string; startedAt?: string; endedAt?: string };
  count?: number;
  workflowName?: string;
};

type NodeSparkWorkflowSummary = {
  id?: string;
  name: string;
  status?: string;
  detail?: string;
  lastRun?: string;
};

type ChatCard =
  | { kind: "nodespark_workflows"; workflows: NodeSparkWorkflowSummary[]; total: number; hubLabel: string; generatedAt: string }
  | { kind: "nodespark_confirmation"; workflowName: string; risk: string; effect: string; hubLabel: string }
  | { kind: "nodespark_run_result"; workflowName: string; run?: NodeSparkActionResponse["run"]; status: "started" | "failed"; error?: string; hubLabel: string };

const SYNRA_BACKGROUNDS: SynraBackground[] = [
  { id: "command-room", label: "Command Room", url: "/backgrounds/synra-command-room.png" },
  { id: "observatory", label: "Observatory", url: "/backgrounds/synra-observatory.png" },
  { id: "neural-library", label: "Neural Library", url: "/backgrounds/synra-neural-library.png" },
  { id: "orbit-lounge", label: "Orbit Lounge", url: "/backgrounds/synra-orbit-lounge.png" },
  { id: "cyber-garden", label: "Cyber Garden", url: "/backgrounds/synra-cyber-garden.png" },
  { id: "quantum-workshop", label: "Quantum Workshop", url: "/backgrounds/synra-quantum-workshop.png" },
  { id: "castle-ballroom", label: "Castle Ballroom", url: "/backgrounds/synra-castle-ballroom.jpg" },
  { id: "castle-library", label: "Castle Library", url: "/backgrounds/synra-castle-library.jpg" },
  { id: "royal-courtyard", label: "Royal Courtyard", url: "/backgrounds/synra-royal-courtyard.jpg" },
  { id: "starlight-throne-hall", label: "Starlight Throne Hall", url: "/backgrounds/synra-starlight-throne-hall.jpg" }
];

const MOTION_CATEGORIES: MotionCategory[] = [
  { id: "all", label: "All Motions" },
  { id: "idle", label: "Idle", routeIds: ["mode:idle", "local_stand_1", "local_stand_2", "local_stand_3", "local_stand_4", "local_stand_5", "local_stand_6"], match: ["stand", "float", "sit"] },
  { id: "greeting", label: "Greeting", routeIds: ["wave", "hello_present", "wave_big", "wave_camera", "notify_user"], match: ["greeting", "hello", "arm_swing"] },
  { id: "talking", label: "Talking", routeIds: ["mode:speaking", "explain", "present", "answer", "teach", "point_left", "point_right"], match: ["talk_", "modelpose", "motionpose", "encourage"] },
  { id: "thinking", label: "Thinking", routeIds: ["mode:thinking", "ask_question", "compare", "hand_fidget", "look_screen"], match: ["headinhands", "headtilt", "smartphone", "look_"] },
  { id: "reactions", label: "Reactions", routeIds: ["confirm", "deny", "confused", "concerned", "alert", "success"], match: ["confirm", "confused", "concerned", "headshake", "startle", "numberone"] },
  { id: "movement", label: "Movement", routeIds: ["jump", "walk", "turn_left", "turn_right", "stretch", "local_dash_run"], match: ["jump", "turn", "run", "dash", "spin", "showfullbody"] },
  { id: "fun", label: "Fun", routeIds: ["playful", "cute_pose", "victory_small", "bow", "ta_da"], match: ["peace", "shoot", "squat", "dogeza", "drinkwater", "coolsit"] }
];

const STATE_MOTION_VARIETY: Record<SynraState, string[]> = {
  idle: ["mode:idle", "local_stand_1", "local_stand_4", "local_stand_5"],
  listening: ["mode:listening"],
  thinking: ["mode:thinking", "ask_question", "compare", "look_screen"],
  speaking: ["mode:speaking"],
  offline: ["error_calm", "concerned"]
};

const IDLE_LIFE_GESTURES = ["look_camera", "look_screen", "attentive", "present"];
const KIOSK_IDLE_ROUTE = "mode:idle";
const USE_HUB_AVATAR_RUNTIME = true;
const SYNRYZEN_WEBSITE_URL = "https://synryzen.com";
const NODESPARK_APP_STORE_URL = "https://apps.apple.com/us/app/nodespark/id6756223114";
const NODESPARKHUB_ICON_URL = "/icons/nodesparkhub-icon.png";
const STAGE_AVATAR_HEIGHT = {
  kiosk: 1.78,
  interactive: 1.86
} as const;
const PRESENCE_NUDGES = [
  "I am here.",
  "Ready when you are.",
  "Listening for the next move.",
  "Systems are calm.",
  "I am standing by."
];
const DEFAULT_WAKE_PHRASE = "Hello Synra";
const DEFAULT_WAKE_LISTENING_LABEL = "Listening for Hello Synra";
const VOICE_MATCH_THRESHOLDS: Record<VoiceMatchSensitivity, number> = {
  relaxed: 0.72,
  balanced: 0.8,
  strict: 0.88
};
const VOICE_PRINT_FRAME_COUNT = 18;
const PREFERRED_BROWSER_VOICE_HINTS = [
  "samantha",
  "victoria",
  "zira",
  "aria",
  "jenny",
  "susan",
  "karen",
  "moira",
  "tessa",
  "serena",
  "ava",
  "emma",
  "amy",
  "joanna",
  "salli",
  "kendra",
  "female"
];

const runtimeMode = resolveRuntimeMode();
const initialPerformanceTier = resolveInitialPerformanceTier();
const initialVisualSettings = resolveInitialVisualSettings();
const telemetryEnabled = runtimeMode === "kiosk" || new URLSearchParams(window.location.search).get("telemetry") === "1";

const state = {
  synra: "idle" as SynraState,
  messages: [] as SynraMessage[],
  settings: loadModelSettings(),
  voiceSettings: loadVoiceSettings(),
  productSettings: loadProductSettings(),
  homeAssistantSettings: loadHomeAssistantSettings(),
  companionSettings: loadCompanionSettings(),
  visual: initialVisualSettings,
  memory: loadMemory(),
  vrm: null as VRM | null,
  motionPlayer: new SynraMotionPlayer(),
  clock: new THREE.Clock(),
  mouth: 0,
  blink: 0,
  lastBlinkAt: performance.now(),
  frameSamples: [] as number[],
  lastFrameAt: performance.now(),
  lastRenderAt: 0,
  fps: 0,
  lastDisplayedMotionId: "",
  wakeWordStatus: "Wake word off",
  voiceStatus: "Voice checking",
  visionStatus: "Camera not checked",
  serverVisionStatus: "Jetson camera not checked",
  serverCameraDeviceCount: null as number | null,
  serverCameraConfiguredDevice: "",
  identityStatus: normalizeIdentityStatus(defaultIdentityStatus),
  performanceTier: initialPerformanceTier,
  lowFpsStartedAt: 0,
  stableFpsStartedAt: 0,
  lastLifeMotionAt: performance.now(),
  nextLifeMotionAt: performance.now() + randomBetween(18000, 32000),
  lastPresenceNudgeAt: performance.now(),
  lastTelemetryAt: 0,
  speechFallbackTimer: 0,
  pendingAction: null as PendingAction | null,
  lastRouteLabel: "startup",
  lastRenderedSynraState: null as SynraState | null,
  lastAutoMotionByState: {} as Partial<Record<SynraState, string>>,
  elevenLabsVoices: [] as ElevenLabsVoice[],
  audioUnlocked: false,
  connections: {
    ai: { status: "configured", detail: "Server route" },
    nodeSpark: { status: "not-configured", detail: "Premium skill" },
    homeAssistant: { status: "not-configured", detail: "Free skill" },
    voice: { status: "checking", detail: "Checking" },
    vision: { status: "off", detail: "Camera off" }
  } as Record<ConnectionTruthKey, ConnectionTruth>
};

type PublicServerSettings = {
  ok?: boolean;
  voice?: {
    provider?: string;
    elevenLabsApiKeyConfigured?: boolean;
    elevenLabsVoiceId?: string;
    elevenLabsVoiceName?: string;
    elevenLabsModelId?: string;
    elevenLabsOutputFormat?: string;
    elevenLabsStability?: string;
    elevenLabsSimilarityBoost?: string;
    chatterboxModel?: string;
    chatterboxDevice?: string;
    chatterboxVoicePromptPath?: string;
    chatterboxLanguageId?: string;
  };
  homeAssistant?: {
    enabled?: boolean;
    url?: string;
    tokenConfigured?: boolean;
    defaultLightEntity?: string;
  };
  product?: {
    nodeSparkAccess?: string;
    nodeSparkHubUrl?: string;
    nodeSparkDeviceName?: string;
    nodeSparkHubId?: string;
    nodeSparkDeviceTokenConfigured?: boolean;
    nodeSparkTokenExpiresAt?: string;
  };
  savedSettings?: DurableServerSettings;
};

type DurableServerSettings = {
  model?: Partial<ModelSettings>;
  voice?: Partial<VoiceSettings>;
  homeAssistant?: Partial<Omit<HomeAssistantSettings, "token">>;
  product?: Partial<Omit<ProductSettings, "nodeSparkDeviceToken">>;
  visual?: Partial<VisualSettings>;
  companion?: Partial<CompanionSettings> & { identityReadiness?: SynraIdentitySummary };
  memory?: Partial<SynraMemory>;
};
type SynraIdentitySummary = {
  readyUserCount: number;
  enrolledUserCount: number;
  users: Array<{
    id: string;
    name: string;
    relationship: string;
    recognitionEnabled: boolean;
    readiness: SynraIdentityReadiness;
  }>;
};
let hubAvatarRuntime: SynraAvatarRuntime | null = null;
let hubMotionClips: SynraMotionClipSpec[] = [];
let hubMotionRoutes = new Map<string, string>();
let hubMotionManifestReady = false;
let hubMotionReturnTimer = 0;
let hubMotionReturnSerial = 0;
let activeVisionStream: MediaStream | null = null;
let activeSpeechAudio: HTMLAudioElement | null = null;
let activeSpeechAbort: AbortController | null = null;
let activeLipSyncTimer = 0;
let speechSerial = 0;
let performanceProfile = resolvePerformanceProfile();
const chatCardRegistry = new Map<string, ChatCard>();
Object.assign(window, {
	  __synraStandaloneDebug: () => ({
	    synraState: state.synra,
	    endpoint: state.settings.endpoint,
	    model: state.settings.model,
    avatarId: state.visual.avatarId,
    visualSettings: state.visual,
    backgroundCount: SYNRA_BACKGROUNDS.length,
    motion: state.motionPlayer.snapshot,
    voiceStatus: state.voiceStatus,
    productSettings: publicProductSettings(),
    homeAssistantSettings: publicHomeAssistantSettings(),
    skillAccess: skillAccessSnapshot(),
    visionStatus: state.visionStatus,
    visionEnabled: Boolean(activeVisionStream),
    serverVisionStatus: state.serverVisionStatus,
    serverCameraDeviceCount: state.serverCameraDeviceCount,
    lastRouteLabel: state.lastRouteLabel,
    performanceTier: state.performanceTier,
    renderQuality: state.visual.renderQuality,
    renderScale: resolveEffectivePixelRatio(),
    renderBuffer: renderer ? renderer.getDrawingBufferSize(new THREE.Vector2()) : hubAvatarRuntime?.runtimeHealth() ?? null,
    webgl: renderer || hubAvatarRuntime?.runtimeHealth().webglReady ? "available" : "unavailable",
    hubRuntime: hubAvatarRuntime?.debugState() ?? null,
    pendingAction: state.pendingAction,
	    messageCount: state.messages.length,
	    lastMessage: state.messages.at(-1) ?? null,
	    runtimeMode,
	    performanceProfile
	  })
});

app.innerHTML = `
  <section class="stage">
    <div class="stage-backdrop"></div>
    <canvas id="scene"></canvas>
    <div class="hud">
      <div class="brand">
        <img class="brand-logo brand-logo-only" src="/icons/synra-logo.png" alt="Synra" />
        <span id="status" class="visually-hidden">Starting</span>
      </div>
      <div class="metrics">
        <span class="signal-dot"></span>
        <span id="fps">-- FPS</span>
        <span id="modelName">Local path</span>
      </div>
    </div>
    <aside class="left-chat-panel">
      <div class="chat-panel">
        <header class="chat-panel-header">
          <span>Conversation</span>
          <strong id="chatStatus">Ready</strong>
        </header>
        <div class="chat-log" id="chatLog" aria-live="polite">
          <div class="chat-empty">Ask Synra anything.</div>
        </div>
        <form class="composer" id="composer">
          <button type="button" id="listenButton" class="icon-button listen" title="Listen" aria-label="Listen"><span></span></button>
          <button type="button" id="stopVoiceButton" class="icon-button stop" title="Stop voice" aria-label="Stop voice">■</button>
          <input id="prompt" autocomplete="off" placeholder="Talk to Synra" />
          <button type="submit" class="icon-button send" title="Send" aria-label="Send">↑</button>
          <button type="button" id="settingsButton" class="icon-button settings-toggle" title="Model settings" aria-label="Model settings">⚙</button>
        </form>
      </div>
    </aside>
    <aside class="right-rail">
      <div class="performance-panel">
        <header>
          <span>Controls</span>
          <strong id="activeMotion">Motion loading</strong>
        </header>
        <button type="button" id="controlModeButton" class="mode-toggle">Live Mode</button>
        <label class="manual-control">
          <span>Background</span>
          <select id="backgroundSelect"></select>
        </label>
        <label class="manual-control">
          <span>Avatar</span>
          <select id="avatarSelect"></select>
        </label>
        <label class="manual-control">
          <span>Render Quality</span>
          <select id="qualitySelect">
            <option value="performance">Performance</option>
            <option value="balanced">Balanced</option>
            <option value="sharp">Sharp</option>
          </select>
        </label>
        <label class="manual-control">
          <span>Motion Type</span>
          <select id="motionCategorySelect"></select>
        </label>
        <label class="manual-control">
          <span>VRMA</span>
          <select id="motionSelect"></select>
        </label>
        <button type="button" id="playMotionButton" class="manual-control">Play Motion</button>
      </div>
      <div class="connection-panel">
        <header>
          <span>AI Connection</span>
          <strong id="aiConnectionStatus">Server route</strong>
        </header>
        <div class="connection-grid">
          <span>Provider</span>
          <strong id="aiProviderStatus">Server</strong>
          <span>Endpoint</span>
          <strong id="aiEndpointStatus">/api/chat</strong>
          <span>Quality</span>
          <strong id="renderQualityStatus">Balanced</strong>
        </div>
        <div class="connection-actions">
          <button type="button" id="openAiSettingsButton">Settings</button>
          <button type="button" id="testAiButton">Test AI</button>
        </div>
      </div>
      <div class="health-panel">
        <header>
          <span>System Health</span>
          <strong id="healthSummaryStatus">Configured</strong>
        </header>
        <div class="health-list">
          <div class="health-row">
            <span>AI Model</span>
            <strong id="healthAiStatus" data-state="configured">Configured</strong>
          </div>
          <div class="health-row">
            <span>NodeSparkHub</span>
            <strong id="healthNodeSparkStatus" data-state="not-configured">Not configured</strong>
          </div>
          <div class="health-row">
            <span>Home Assistant</span>
            <strong id="healthHomeAssistantStatus" data-state="not-configured">Not configured</strong>
          </div>
          <div class="health-row">
            <span>Voice</span>
            <strong id="healthVoiceStatus" data-state="checking">Checking</strong>
          </div>
          <div class="health-row">
            <span>Vision</span>
            <strong id="healthVisionStatus" data-state="off">Off</strong>
          </div>
        </div>
        <button type="button" id="checkAllConnectionsButton">Check All</button>
      </div>
      <div class="skill-panel">
        <header>
          <span>Synra Access</span>
          <strong id="synraAccessStatus">Free Companion</strong>
        </header>
        <div class="skill-list">
          <div class="skill-row">
            <span>Home Assistant</span>
            <strong id="homeAssistantSkillStatus">Free</strong>
          </div>
          <div class="skill-row premium">
            <span>NodeSpark Command Center</span>
            <strong id="nodeSparkSkillStatus">Subscriber</strong>
          </div>
        </div>
      <div class="skill-detail-grid">
        <span>Targets</span>
        <strong id="homeAssistantTargetCount">0 discovered</strong>
        <span>Default</span>
        <strong id="homeAssistantDefaultTarget">Not set</strong>
      </div>
      <div class="quick-tool-grid">
        <button type="button" id="systemStatusButton">System</button>
        <button type="button" id="networkStatusButton">Network</button>
        <button type="button" id="dateTimeButton">Time</button>
        <button type="button" id="nodeSparkStatusButton">NodeSpark</button>
      </div>
      <div class="hub-action-grid">
        <button type="button" id="nodeSparkWorkflowsButton">Workflows</button>
        <button type="button" id="nodeSparkRunsButton">Runs</button>
        <button type="button" id="nodeSparkLatestRunButton">Latest</button>
      </div>
      <p class="skill-hint" id="nodeSparkActionHint">Pair Hub to enable workflow insight.</p>
      <button type="button" id="openSkillSettingsButton">Skills</button>
      </div>
      <div class="about-panel">
        <header>
          <span>About</span>
          <strong>Synryzen</strong>
        </header>
        <div class="about-product-mini">
          <img src="${NODESPARKHUB_ICON_URL}" alt="NodeSparkHub icon" />
          <div>
            <span>Developer</span>
            <strong>Matthew C Elliott</strong>
          </div>
        </div>
        <p>Synra Standalone is a companion AI by Synryzen that can run on Jetson, desktop, mobile, and the browser with optional NodeSparkHub skills.</p>
        <button type="button" id="openAboutButton">About Synra</button>
      </div>
      <div class="caption-shell">
        <div class="caption" id="caption">I am getting ready.</div>
      </div>
      <div class="presence">
        <span>Companion Core</span>
        <strong id="presenceState">Initializing</strong>
      </div>
      <div class="presence system-health">
        <span>Voice</span>
        <strong id="voiceState">Checking</strong>
      </div>
      <div class="presence system-health">
        <span>Vision</span>
        <strong id="visionState">Not checked</strong>
        <button type="button" id="visionToggleButton" class="inline-action">Vision Off</button>
        <button type="button" id="visionAnalyzeButton" class="inline-action">Analyze View</button>
      </div>
    </aside>
  </section>
  <dialog id="settingsDialog">
    <form method="dialog" class="settings">
      <h2>Synra Settings</h2>
      <div class="settings-tabs" role="tablist" aria-label="Synra settings sections">
        <button type="button" class="settings-tab active" data-settings-tab="ai" role="tab" aria-selected="true">AI</button>
        <button type="button" class="settings-tab" data-settings-tab="companion" role="tab" aria-selected="false">Companion</button>
        <button type="button" class="settings-tab" data-settings-tab="voice" role="tab" aria-selected="false">Voice</button>
        <button type="button" class="settings-tab" data-settings-tab="memory" role="tab" aria-selected="false">Memory</button>
        <button type="button" class="settings-tab" data-settings-tab="users" role="tab" aria-selected="false">Users</button>
        <button type="button" class="settings-tab" data-settings-tab="home" role="tab" aria-selected="false">Home</button>
        <button type="button" class="settings-tab" data-settings-tab="nodespark" role="tab" aria-selected="false">NodeSparkHub</button>
        <button type="button" class="settings-tab" data-settings-tab="display" role="tab" aria-selected="false">Display</button>
        <button type="button" class="settings-tab" data-settings-tab="about" role="tab" aria-selected="false">About</button>
      </div>
      <section class="settings-panel active" data-settings-panel="ai" role="tabpanel">
        <h3>AI Connection</h3>
        <label>
          Provider
          <select id="providerInput">
            <option value="server">Synra server route</option>
            <option value="openAICompatible">OpenAI-compatible cloud</option>
            <option value="localHTTP">Local HTTP compatible</option>
          </select>
        </label>
        <label>
          Endpoint or base URL
          <input id="endpointInput" />
        </label>
        <label>
          Model
          <input id="modelInput" />
        </label>
        <label>
          API key
          <input id="apiKeyInput" type="password" />
        </label>
        <label>
          Temperature
          <input id="temperatureInput" type="number" min="0" max="2" step="0.1" />
        </label>
        <label>
          System prompt
          <textarea id="systemPromptInput" rows="4" placeholder="Optional Synra personality or routing instructions"></textarea>
        </label>
      </section>
      <section class="settings-panel" data-settings-panel="companion" role="tabpanel" hidden>
        <h3>Companion Presence</h3>
        <label>
          Owner name
          <input id="companionOwnerNameInput" placeholder="Matthew" />
        </label>
        <label>
          Wake word
          <select id="wakeWordModeInput">
            <option value="off">Off</option>
            <option value="local">Local "Hello Synra"</option>
          </select>
        </label>
        <label>
          Mic always listening
          <select id="micAlwaysListeningInput">
            <option value="on">On - listen for Hello Synra</option>
            <option value="off">Off - manual wake only</option>
          </select>
        </label>
        <label>
          Microphone
          <select id="microphoneDeviceInput">
            <option value="">System default microphone</option>
          </select>
        </label>
        <label>
          Camera
          <select id="cameraDeviceInput">
            <option value="">System default camera</option>
          </select>
        </label>
        <label>
          Wake phrase
          <input id="wakePhraseInput" placeholder="Hello Synra" />
        </label>
        <label>
          Screen timeout
          <select id="screenTimeoutInput">
            <option value="10">10 minutes</option>
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="0">Never</option>
          </select>
        </label>
        <label>
          Memory suggestions
          <select id="memorySuggestionsInput">
            <option value="on">Ask before saving helpful memories</option>
            <option value="off">Never suggest memories</option>
          </select>
        </label>
        <div class="settings-status-grid compact">
          <span>Wake</span>
          <strong id="wakeWordStatus">Wake word off</strong>
          <span>Mic</span>
          <strong id="micAlwaysListeningStatus">Mic always listening off</strong>
          <span>Privacy</span>
          <strong>No raw audio or camera frames are saved to memory</strong>
        </div>
        <button type="button" id="startWakeWordButton">Start Wake Word</button>
        <button type="button" id="refreshMediaDevicesButton">Refresh Mic / Camera</button>
        <p id="mediaDeviceStatus" class="settings-note">Choose the mic and camera Synra should use for wake word, hold-to-talk, face setup, and vision.</p>
        <p class="settings-note">Wake word listening is local-first and only listens for the configured phrase before sending a real request to Synra.</p>
      </section>
      <section class="settings-panel" data-settings-panel="voice" role="tabpanel" hidden>
        <h3>Voice Output</h3>
        <label>
          Voice provider
          <select id="voiceProviderInput">
            <option value="browser">Apple Voice</option>
            <option value="elevenLabs">ElevenLabs</option>
            <option value="chatterbox">Chatterbox local</option>
          </select>
        </label>
        <label>
          Apple system voice
          <select id="browserVoiceSelect">
            <option value="">Best available English female voice</option>
          </select>
        </label>
        <p id="browserVoiceStatus" class="settings-note">Apple Voice uses the installed macOS/iOS system voices exposed by the browser engine. Downloaded Apple voices appear here after the OS finishes installing them.</p>
        <label>
          ElevenLabs API key
          <input id="elevenLabsApiKeyInput" type="password" autocomplete="off" placeholder="Paste ElevenLabs API key" />
        </label>
        <div class="voice-actions">
          <button type="button" id="loadElevenLabsVoicesButton">Load ElevenLabs Voices</button>
          <button type="button" id="voiceDiagnosticsButton">Voice Diagnostics</button>
        </div>
        <label>
          ElevenLabs voice
          <select id="elevenLabsVoiceSelect">
            <option value="">Load voices or paste a voice ID below</option>
          </select>
        </label>
        <label>
          ElevenLabs voice ID
          <input id="elevenLabsVoiceIdInput" placeholder="Voice ID from ElevenLabs" />
        </label>
        <p id="elevenLabsVoiceStatus" class="settings-note">Paste an API key, load voices, choose one, then test voice.</p>
        <label>
          ElevenLabs model
          <input id="elevenLabsModelIdInput" placeholder="eleven_multilingual_v2" />
        </label>
        <label>
          Output format
          <input id="elevenLabsOutputFormatInput" placeholder="mp3_44100_128" />
        </label>
        <label>
          Stability
          <input id="elevenLabsStabilityInput" type="number" min="0" max="1" step="0.01" />
        </label>
        <label>
          Similarity boost
          <input id="elevenLabsSimilarityInput" type="number" min="0" max="1" step="0.01" />
        </label>
        <label>
          Chatterbox model
          <select id="chatterboxModelInput">
            <option value="turbo">Turbo - fastest local voice</option>
            <option value="english">English - expressive local voice</option>
            <option value="multilingual">Multilingual</option>
          </select>
        </label>
        <label>
          Chatterbox device
          <select id="chatterboxDeviceInput">
            <option value="auto">Auto</option>
            <option value="cuda">CUDA / Jetson GPU</option>
            <option value="cpu">CPU</option>
          </select>
        </label>
        <label>
          Chatterbox voice prompt path
          <input id="chatterboxVoicePromptPathInput" placeholder="/home/matthew/synra-voice.wav" />
        </label>
        <label>
          Chatterbox language
          <input id="chatterboxLanguageIdInput" placeholder="en" />
        </label>
        <p id="chatterboxVoiceStatus" class="settings-note">Chatterbox runs locally on the Jetson. Install the local model once, then select Chatterbox as Synra's voice.</p>
      </section>
      <section class="settings-panel" data-settings-panel="memory" role="tabpanel" hidden>
        <h3>Memory</h3>
        <label>
          Preferred name
          <input id="memoryPreferredNameInput" placeholder="What Synra should call you" />
        </label>
        <label>
          Response style
          <input id="memoryStyleInput" placeholder="warm, direct, and useful" />
        </label>
        <label>
          Remembered facts
          <textarea id="memoryFactsInput" rows="4" placeholder="One approved memory per line"></textarea>
        </label>
        <label>
          Routines
          <textarea id="memoryRoutinesInput" rows="3" placeholder="Morning routine, work hours, preferred check-ins"></textarea>
        </label>
        <label>
          Rooms and devices
          <textarea id="memoryDevicesInput" rows="3" placeholder="Office lamp, studio lights, living room"></textarea>
        </label>
        <p class="settings-note">Synra memory is for approved preferences, routines, rooms, and devices. API keys, tokens, raw audio, and camera frames are never saved to memory.</p>
      </section>
      <section class="settings-panel" data-settings-panel="users" role="tabpanel" hidden>
        <h3>Known Users</h3>
        <div class="identity-wizard-launch-panel">
          <div>
            <strong>Guided identity setup</strong>
            <span>Enroll face and voice with a focused Synra setup flow.</span>
          </div>
          <button type="button" id="openIdentityWizardButton">Open Identity Wizard</button>
        </div>
        <section class="recognition-runtime-panel" aria-label="Runtime Recognition">
          <div class="recognition-runtime-heading">
            <div>
              <h4>Runtime Recognition</h4>
              <p id="recognitionRuntimeStatus">Ready To Verify</p>
            </div>
            <button type="button" id="identityRecognitionVerifyButton">Verify Owner</button>
          </div>
          <div class="recognition-runtime-metric-grid">
            <div>
              <span>Confidence</span>
              <strong id="recognitionRuntimeConfidence">0%</strong>
            </div>
            <div>
              <span>Last verified</span>
              <strong id="recognitionRuntimeLastVerified">Never</strong>
            </div>
            <div>
              <span>Source</span>
              <strong id="recognitionRuntimeSource">Inactive</strong>
            </div>
          </div>
          <p id="recognitionRuntimeDetail">Owner is not currently verified.</p>
        </section>
        <section class="recognition-device-grid" aria-label="Local recognition devices">
          <div class="recognition-device-chip" id="recognitionDeviceCamera">
            <span>Camera</span>
            <strong>Ask</strong>
          </div>
          <div class="recognition-device-chip" id="recognitionDeviceMicrophone">
            <span>Microphone</span>
            <strong>Ready</strong>
          </div>
          <div class="recognition-device-chip" id="recognitionDeviceFaceStorage">
            <span>Face Storage</span>
            <strong>Local</strong>
          </div>
          <div class="recognition-device-chip" id="recognitionDeviceVoiceMatch">
            <span>Voice Match</span>
            <strong>Owner Only</strong>
          </div>
          <div class="recognition-device-chip" id="recognitionDeviceTrustedControl">
            <span>Trusted Control</span>
            <strong>Setup</strong>
          </div>
        </section>
        <section class="smart-recognition-shell" aria-label="Smart Recognition">
          <div class="smart-recognition-heading">
            <div>
              <h4>Smart Recognition</h4>
              <p>Local owner identity</p>
            </div>
            <div class="recognition-status-chips">
              <span id="recognitionCameraStatusChip">Camera: Ready</span>
              <span id="recognitionMicStatusChip">Mic: Ready</span>
            </div>
          </div>
          <div class="recognition-setup-grid">
            <div class="recognition-setup-tile">
              <div class="recognition-card-heading">
                <span>Face Setup</span>
                <small id="recognitionFaceSetupStatus">Adaptive light</small>
              </div>
              <strong id="recognitionFaceCoachTitle">Ready</strong>
              <p id="recognitionFaceCoachDetail">One face, centered, eyes and mouth visible.</p>
              <div class="recognition-action-row">
                <button type="button" id="identityFaceSetupButton">Enroll Face</button>
                <button type="button" id="identityFaceTestButton">Test Face</button>
              </div>
            </div>
            <div class="recognition-setup-tile">
              <div class="recognition-card-heading">
                <span>Voice Setup</span>
                <small id="recognitionVoiceSetupStatus">Close mic</small>
              </div>
              <strong id="recognitionVoiceCoachTitle">Voice ready</strong>
              <p id="recognitionVoiceCoachDetail">Speak near the Jetson or Mac and avoid TV/background voices.</p>
              <div class="recognition-action-row">
                <button type="button" id="identityVoiceSetupButton">Enroll Voice</button>
                <button type="button" id="identityVoiceTestButton">Test Voice</button>
              </div>
            </div>
          </div>
          <section class="recognition-live-coach" aria-label="Live Enrollment Coach">
            <div class="recognition-coach-heading">
              <span>Live Enrollment Coach</span>
              <small id="recognitionCoachStatus">Sample accepted / Move closer</small>
            </div>
            <div class="recognition-coach-grid">
              <div class="recognition-coach-card">
                <span>Face</span>
                <strong id="recognitionFaceProgressLabel">Face setup waiting</strong>
                <p id="recognitionFaceProgressDetail">Start guided identity setup to capture seven local face poses.</p>
              </div>
              <div class="recognition-coach-card">
                <span>Voice</span>
                <strong id="recognitionVoiceProgressLabel">Voice setup waiting</strong>
                <p id="recognitionVoiceProgressDetail">Record three clean owner voice samples for Voice Match.</p>
              </div>
            </div>
          </section>
          <section class="recognition-proof-panel" aria-label="Enrollment Proof">
            <div class="recognition-proof-heading">
              <div>
                <span>Enrollment Proof</span>
                <strong id="recognitionProofSyncStatus">Not Tested</strong>
              </div>
              <button type="button" id="recognitionProofVerifyButton">Verify Sync</button>
            </div>
            <div class="recognition-proof-grid">
              <div>
                <span>Station</span>
                <strong id="recognitionProofStationStatus">Unknown</strong>
              </div>
              <div>
                <span>Camera</span>
                <strong id="recognitionProofCameraStatus">Unknown</strong>
              </div>
              <div>
                <span>Mic</span>
                <strong id="recognitionProofMicStatus">Unknown</strong>
              </div>
              <div>
                <span>Face</span>
                <strong id="recognitionProofFaceStatus">0/7</strong>
              </div>
              <div>
                <span>Voice</span>
                <strong id="recognitionProofVoiceStatus">0/3</strong>
              </div>
            </div>
          </section>
          <div class="recognition-session-checks" aria-label="Enrollment storage and quality">
            <span id="recognitionSessionCheckOne">Permission ready</span>
            <span id="recognitionSessionCheckTwo">Quality waiting</span>
            <span id="recognitionSessionCheckThree">Stored locally</span>
          </div>
        </section>
        <label>
          User name
          <input id="knownUserNameInput" placeholder="Person name" />
        </label>
        <label>
          Relationship
          <input id="knownUserRelationshipInput" placeholder="Owner, family, teammate" />
        </label>
        <label>
          Face recognition
          <select id="faceRecognitionInput">
            <option value="off">Off</option>
            <option value="on">On for enrolled users</option>
          </select>
        </label>
        <label>
          Face sample storage
          <select id="faceSampleStorageInput">
            <option value="off">Do not store samples</option>
            <option value="on">Store approved local samples</option>
          </select>
        </label>
        <label>
          Voice Match
          <select id="voiceMatchModeInput">
            <option value="off">Off - anyone can wake Synra</option>
            <option value="knownUsers">Known users only</option>
            <option value="ownerOnly">Owner only</option>
          </select>
        </label>
        <label>
          Voice Match sensitivity
          <select id="voiceMatchSensitivityInput">
            <option value="relaxed">Relaxed</option>
            <option value="balanced">Balanced</option>
            <option value="strict">Strict</option>
          </select>
        </label>
        <div class="identity-enrollment-panel">
          <div>
            <strong>Identity enrollment</strong>
            <span id="identityEnrollmentStatus">Face 0/7 · Voice 0/3</span>
          </div>
          <label>
            Face pose
            <select id="facePoseInput">
              <option value="center">Center</option>
              <option value="turnLeft">Turn left</option>
              <option value="turnRight">Turn right</option>
              <option value="lookUp">Look up</option>
              <option value="lookDown">Look down</option>
              <option value="rollLeft">Tilt left</option>
              <option value="rollRight">Tilt right</option>
            </select>
          </label>
          <div class="identity-progress-grid">
            <span id="faceEnrollmentProgress">Next face pose: center</span>
            <span id="voiceEnrollmentProgress">Next voice sample: 1 of 3</span>
          </div>
          <p id="voicePhrasePrompt" class="settings-note">Say: Hello Synra, this is my voice.</p>
        </div>
        <div class="settings-button-row">
          <button type="button" id="captureUserFaceButton">Capture Face Sample</button>
          <button type="button" id="captureUserVoiceButton">Capture Voice Sample</button>
          <button type="button" id="saveKnownUserButton">Save User</button>
        </div>
        <div id="knownUsersList" class="known-users-list"></div>
        <p class="settings-note">Face and Voice Match are opt-in and local to this device. Voice Match saves compact voiceprints, not raw audio. Sanitized backups exclude face images and voiceprints, and you can delete known users anytime.</p>
      </section>
      <section class="settings-panel" data-settings-panel="home" role="tabpanel" hidden>
        <h3>Home Assistant</h3>
        <label>
          Home Assistant skill
          <select id="homeAssistantEnabledInput">
            <option value="off">Off</option>
            <option value="on">On</option>
          </select>
        </label>
        <label>
          Home Assistant URL
          <input id="homeAssistantUrlInput" placeholder="http://homeassistant.local:8123" />
        </label>
        <label>
          Long-lived access token
          <input id="homeAssistantTokenInput" type="password" autocomplete="off" />
        </label>
        <label>
          Default light entity
          <input id="homeAssistantLightEntityInput" placeholder="light.office" />
        </label>
        <label>
          Confirmation policy
          <select id="homeAssistantConfirmationPolicyInput">
            <option value="trustedLights">Run trusted light actions immediately</option>
            <option value="alwaysConfirm">Ask before every action</option>
            <option value="highRiskOnly">Ask only for high-risk actions</option>
          </select>
        </label>
        <label>
          Discovered target
          <select id="homeAssistantEntitySelect">
            <option value="">No discovered entities yet</option>
          </select>
        </label>
      </section>
      <section class="settings-panel" data-settings-panel="nodespark" role="tabpanel" hidden>
        <h3>NodeSparkHub</h3>
        <label>
          Synra focus
          <select id="synraSkillModeInput">
            <option value="hybrid">Hybrid companion</option>
            <option value="homeAssistant">Home Assistant companion</option>
            <option value="nodeSparkHub">NodeSparkHub controller</option>
          </select>
        </label>
        <label>
          NodeSpark Command Center
          <select id="nodeSparkAccessInput">
            <option value="locked">Requires NodeSpark subscription</option>
            <option value="subscriber">Subscriber mode</option>
          </select>
        </label>
        <label>
          NodeSparkHub URL
          <input id="nodeSparkHubUrlInput" placeholder="http://nodesparkhub.local:8787" />
        </label>
        <label>
          Synra device name
          <input id="nodeSparkDeviceNameInput" placeholder="Synra Standalone Jetson" />
        </label>
        <label>
          Hub pairing PIN
          <input id="nodeSparkPairingPinInput" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" maxlength="12" />
        </label>
        <div class="connection-actions settings-button-row three">
          <button type="button" id="pairNodeSparkButton">Pair with PIN</button>
          <button type="button" id="checkNodeSparkPairingButton">Check Hub</button>
          <button type="button" id="forgetNodeSparkPairingButton">Forget Pairing</button>
        </div>
        <div class="settings-status-grid compact">
          <span>Pairing</span>
          <strong id="nodeSparkPairingStatus">Not paired</strong>
          <span>Hub</span>
          <strong id="nodeSparkPairedHubStatus">No Hub token</strong>
        </div>
        <p class="settings-note">Generate the PIN in NodeSparkHub and enter it once here. Synra keeps the paired-device token server-side, stores only a configured marker in the browser, and requires confirmation before any workflow runs.</p>
      </section>
      <section class="settings-panel" data-settings-panel="display" role="tabpanel" hidden>
        <h3>Display</h3>
        <div class="settings-status-grid">
          <span>Avatar</span>
          <strong id="settingsAvatarStatus">Synra</strong>
          <span>Background</span>
          <strong id="settingsBackgroundStatus">Command Room</strong>
          <span>Render quality</span>
          <strong id="settingsQualityStatus">Balanced</strong>
          <span>Mode</span>
          <strong id="settingsModeStatus">Manual</strong>
          <span>Window</span>
          <strong id="settingsKioskWindowStatus">Browser</strong>
          <span>Screen</span>
          <strong id="settingsScreenTimeoutStatus">30 minutes</strong>
        </div>
        <button type="button" id="kioskWindowToggleButton">Open Windowed Setup</button>
        <p class="settings-note">Display controls stay in the right rail for fast kiosk adjustments without reopening settings.</p>
      </section>
      <section class="settings-panel" data-settings-panel="about" role="tabpanel" hidden>
        <h3>About</h3>
        <div class="settings-status-grid">
          <span>Developer</span>
          <strong>Matthew C Elliott</strong>
          <span>Website</span>
          <strong>synryzen.com</strong>
          <span>Product</span>
          <strong>Synra Standalone</strong>
          <span>Version</span>
          <strong id="settingsVersionStatus">4.4</strong>
          <span>Secrets</span>
          <strong>Server-managed markers</strong>
        </div>
        <p class="settings-note">Synra is a standalone companion assistant with optional Home Assistant and NodeSparkHub skills. Backups are intentionally secret-free.</p>
      </section>
      <menu>
        <button value="cancel">Cancel</button>
        <button type="button" id="discoverHomeAssistantButton">Discover Home</button>
        <button type="button" id="testHomeAssistantButton">Test Home</button>
        <button type="button" id="testVoiceButton">Test Voice</button>
        <button type="button" id="forgetMemoriesButton">Forget Memory</button>
        <button type="button" id="exportMemoryButton">Export Memory</button>
        <button type="button" id="importMemoryButton">Import Memory</button>
        <button type="button" id="exportBackupButton">Export Backup</button>
        <button type="button" id="importBackupButton">Restore Backup</button>
        <button id="saveSettingsButton" value="default">Save</button>
      </menu>
    </form>
  </dialog>
  <dialog id="identityEnrollmentWizard">
    <form method="dialog" class="identity-wizard">
      <header class="identity-wizard-header">
        <div>
          <span>Synra Identity</span>
          <h2 id="identityWizardTitle">Set up recognition</h2>
          <p id="identityWizardStatus">Create a local profile that Synra can recognize by face and voice.</p>
        </div>
        <button type="button" id="identityWizardCloseButton" aria-label="Close identity wizard">Close</button>
      </header>
      <div class="identity-wizard-progress" aria-label="Identity enrollment progress">
        <span id="identityWizardOverviewStep" class="active">Profile</span>
        <span id="identityWizardFaceStep">Face</span>
        <span id="identityWizardVoiceStep">Voice</span>
        <span id="identityWizardSummaryStep">Ready</span>
      </div>
      <section class="identity-wizard-stage" data-stage="overview">
        <div class="identity-profile-grid">
          <label>
            Person name
            <input id="identityWizardOwnerNameInput" placeholder="Matthew" />
          </label>
          <label>
            Relationship
            <input id="identityWizardRelationshipInput" placeholder="Owner" />
          </label>
        </div>
        <div class="identity-wizard-readiness" id="identityWizardReadiness">Face 0/7 · Voice 0/3</div>
      </section>
      <section class="identity-wizard-stage" data-stage="face" hidden>
        <div class="identity-face-frame">
          <video id="identityFacePreview" autoplay muted playsinline></video>
          <div id="identityFaceRing" class="identity-face-ring" aria-hidden="true"></div>
          <div class="identity-face-prompt">
            <strong id="identityFacePoseTitle">Center</strong>
            <span id="identityFacePoseInstruction">Face the camera straight on.</span>
          </div>
        </div>
        <div id="identityFacePoseDots" class="identity-pose-dots" aria-label="Face pose progress"></div>
        <p id="identityFaceQualityStatus" class="identity-quality-status">Center your face in the ring before capture.</p>
        <button type="button" id="identityWizardCaptureFaceButton">Capture Face Pose</button>
      </section>
      <section class="identity-wizard-stage" data-stage="voice" hidden>
        <div class="identity-voice-card">
          <span id="identityVoiceSampleLabel">Voice sample 1 of 3</span>
          <strong id="identityVoicePhrase">Hello Synra, this is my voice.</strong>
        </div>
        <div class="identity-voice-meter-grid">
          <div>
            <span>Level</span>
            <div class="identity-voice-meter"><i id="identityVoiceLevelMeter"></i></div>
          </div>
          <div>
            <span>Isolation</span>
            <div class="identity-voice-meter"><i id="identityVoiceIsolationMeter"></i></div>
          </div>
          <div>
            <span>Noise</span>
            <div class="identity-voice-meter"><i id="identityVoiceNoiseMeter"></i></div>
          </div>
        </div>
        <p id="identityVoiceQualityStatus" class="identity-quality-status">Speak clearly in a quiet room.</p>
        <button type="button" id="identityWizardCaptureVoiceButton">Record Voice Sample</button>
      </section>
      <section class="identity-wizard-stage" data-stage="summary" hidden>
        <div class="identity-summary-grid">
          <div>
            <span>Face</span>
            <strong id="identityWizardFaceSummary">0/7 poses</strong>
          </div>
          <div>
            <span>Voice</span>
            <strong id="identityWizardVoiceSummary">0/3 samples</strong>
          </div>
          <div>
            <span>Status</span>
            <strong id="identityWizardFinalSummary">Continue enrollment</strong>
          </div>
        </div>
      </section>
      <menu class="identity-wizard-actions">
        <button type="button" id="identityWizardBackButton">Back</button>
        <button type="button" id="identityWizardNextButton">Continue</button>
        <button type="button" id="identityWizardDoneButton">Save Identity</button>
      </menu>
    </form>
  </dialog>
  <dialog id="firstRunWizard">
    <form method="dialog" class="wizard-panel">
      <div class="wizard-hero">
        <img class="brand-logo-only" src="/synra-logo.png" alt="Synra" />
        <div>
          <span>First-run setup</span>
          <h2>Make Synra yours</h2>
          <p>Choose how Synra listens, remembers, sleeps, and recognizes approved users.</p>
        </div>
      </div>
      <section class="wizard-grid">
        <label>
          Your name
          <input id="wizardOwnerNameInput" placeholder="Matthew" />
        </label>
        <label>
          Wake word
          <select id="wizardWakeWordModeInput">
            <option value="off">Off for now</option>
            <option value="local">Listen locally for Hello Synra</option>
          </select>
        </label>
        <label>
          Screen stays on
          <select id="wizardScreenTimeoutInput">
            <option value="10">10 minutes</option>
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="0">Never</option>
          </select>
        </label>
        <label>
          Face recognition
          <select id="wizardFaceRecognitionInput">
            <option value="off">Off until I enroll users</option>
            <option value="on">Allow local enrolled-user recognition</option>
          </select>
        </label>
      </section>
      <div class="wizard-trust">
        <strong>Privacy defaults</strong>
        <p>No raw audio or camera frames are saved to memory. Wake word processing starts local-first, face setup is opt-in, backups exclude face images and credentials, and Home Assistant actions follow your confirmation policy.</p>
      </div>
      <menu>
        <button type="button" id="wizardSkipButton">Later</button>
        <button type="button" id="wizardSaveButton">Finish Setup</button>
      </menu>
    </form>
  </dialog>
  <dialog id="aboutDialog">
    <form method="dialog" class="about-dialog">
      <div class="about-hero">
        <img class="about-hero-icon" src="${NODESPARKHUB_ICON_URL}" alt="NodeSparkHub icon" />
        <div>
          <span>Synryzen Companion Platform</span>
          <h2>Synra Standalone</h2>
          <p>Synra is a companion AI assistant created by Matthew C Elliott to feel alive, reliable, and useful across Jetson, Mac, iPhone, and browser experiences.</p>
        </div>
      </div>
      <div class="about-fact-grid">
        <span>Developer</span>
        <strong>Matthew C Elliott</strong>
        <span>Website</span>
        <a href="${SYNRYZEN_WEBSITE_URL}" target="_blank" rel="noreferrer">${SYNRYZEN_WEBSITE_URL}</a>
        <span>Core modes</span>
        <strong>Companion, Home Assistant, NodeSparkHub skill</strong>
        <span>Version</span>
        <strong>${SYNRA_STANDALONE_VERSION}</strong>
      </div>
      <section class="about-section">
        <h3>NodeSparkHub</h3>
        <p>NodeSparkHub is the command-center side of the NodeSpark ecosystem. It brings workflows, devices, AI routing, and Synra control together so builders can automate, observe, and act from one place.</p>
        <a class="about-store-link" href="${NODESPARK_APP_STORE_URL}" target="_blank" rel="noreferrer">Open NodeSpark on the App Store</a>
      </section>
      <section class="about-section trust">
        <h3>Trust and Control</h3>
        <p>Synra keeps local preferences on this device, asks before running smart-home actions, treats camera access as permission-only, and keeps NodeSparkHub as an optional subscriber skill.</p>
      </section>
      <menu class="about-actions">
        <a href="${SYNRYZEN_WEBSITE_URL}" target="_blank" rel="noreferrer">Synryzen</a>
        <a href="${NODESPARK_APP_STORE_URL}" target="_blank" rel="noreferrer">NodeSpark</a>
        <button value="cancel">Close</button>
      </menu>
    </form>
  </dialog>
`;

const canvas = must<HTMLElement, HTMLCanvasElement>("scene");
const statusEl = must<HTMLElement, HTMLElement>("status");
const captionEl = must<HTMLElement, HTMLElement>("caption");
const chatLogEl = must<HTMLElement, HTMLElement>("chatLog");
const chatStatusEl = must<HTMLElement, HTMLElement>("chatStatus");
const presenceStateEl = must<HTMLElement, HTMLElement>("presenceState");
const voiceStateEl = must<HTMLElement, HTMLElement>("voiceState");
const visionStateEl = must<HTMLElement, HTMLElement>("visionState");
const visionToggleButton = must<HTMLElement, HTMLButtonElement>("visionToggleButton");
const visionAnalyzeButton = must<HTMLElement, HTMLButtonElement>("visionAnalyzeButton");
const backgroundSelect = must<HTMLElement, HTMLSelectElement>("backgroundSelect");
const avatarSelect = must<HTMLElement, HTMLSelectElement>("avatarSelect");
const qualitySelect = must<HTMLElement, HTMLSelectElement>("qualitySelect");
const motionCategorySelect = must<HTMLElement, HTMLSelectElement>("motionCategorySelect");
const motionSelect = must<HTMLElement, HTMLSelectElement>("motionSelect");
const playMotionButton = must<HTMLElement, HTMLButtonElement>("playMotionButton");
const controlModeButton = must<HTMLElement, HTMLButtonElement>("controlModeButton");
const activeMotionEl = must<HTMLElement, HTMLElement>("activeMotion");
const aiConnectionStatusEl = must<HTMLElement, HTMLElement>("aiConnectionStatus");
const aiProviderStatusEl = must<HTMLElement, HTMLElement>("aiProviderStatus");
const aiEndpointStatusEl = must<HTMLElement, HTMLElement>("aiEndpointStatus");
const renderQualityStatusEl = must<HTMLElement, HTMLElement>("renderQualityStatus");
const openAiSettingsButton = must<HTMLElement, HTMLButtonElement>("openAiSettingsButton");
const testAiButton = must<HTMLElement, HTMLButtonElement>("testAiButton");
const healthSummaryStatusEl = must<HTMLElement, HTMLElement>("healthSummaryStatus");
const healthAiStatusEl = must<HTMLElement, HTMLElement>("healthAiStatus");
const healthNodeSparkStatusEl = must<HTMLElement, HTMLElement>("healthNodeSparkStatus");
const healthHomeAssistantStatusEl = must<HTMLElement, HTMLElement>("healthHomeAssistantStatus");
const healthVoiceStatusEl = must<HTMLElement, HTMLElement>("healthVoiceStatus");
const healthVisionStatusEl = must<HTMLElement, HTMLElement>("healthVisionStatus");
const checkAllConnectionsButton = must<HTMLElement, HTMLButtonElement>("checkAllConnectionsButton");
const synraAccessStatusEl = must<HTMLElement, HTMLElement>("synraAccessStatus");
const homeAssistantSkillStatusEl = must<HTMLElement, HTMLElement>("homeAssistantSkillStatus");
const homeAssistantTargetCountEl = must<HTMLElement, HTMLElement>("homeAssistantTargetCount");
const homeAssistantDefaultTargetEl = must<HTMLElement, HTMLElement>("homeAssistantDefaultTarget");
const nodeSparkSkillStatusEl = must<HTMLElement, HTMLElement>("nodeSparkSkillStatus");
const openSkillSettingsButton = must<HTMLElement, HTMLButtonElement>("openSkillSettingsButton");
const openAboutButton = must<HTMLElement, HTMLButtonElement>("openAboutButton");
const systemStatusButton = must<HTMLElement, HTMLButtonElement>("systemStatusButton");
const networkStatusButton = must<HTMLElement, HTMLButtonElement>("networkStatusButton");
const dateTimeButton = must<HTMLElement, HTMLButtonElement>("dateTimeButton");
const nodeSparkStatusButton = must<HTMLElement, HTMLButtonElement>("nodeSparkStatusButton");
const nodeSparkWorkflowsButton = must<HTMLElement, HTMLButtonElement>("nodeSparkWorkflowsButton");
const nodeSparkRunsButton = must<HTMLElement, HTMLButtonElement>("nodeSparkRunsButton");
const nodeSparkLatestRunButton = must<HTMLElement, HTMLButtonElement>("nodeSparkLatestRunButton");
const nodeSparkActionHintEl = must<HTMLElement, HTMLElement>("nodeSparkActionHint");
const fpsEl = must<HTMLElement, HTMLElement>("fps");
const modelNameEl = must<HTMLElement, HTMLElement>("modelName");
const composer = must<HTMLElement, HTMLFormElement>("composer");
const promptInput = must<HTMLElement, HTMLInputElement>("prompt");
const listenButton = must<HTMLElement, HTMLButtonElement>("listenButton");
const stopVoiceButton = must<HTMLElement, HTMLButtonElement>("stopVoiceButton");
const sendButton = document.querySelector<HTMLButtonElement>('button[title="Send"]');
const settingsButton = must<HTMLElement, HTMLButtonElement>("settingsButton");
const settingsDialog = must<HTMLElement, HTMLDialogElement>("settingsDialog");
const firstRunWizard = must<HTMLElement, HTMLDialogElement>("firstRunWizard");
const aboutDialog = must<HTMLElement, HTMLDialogElement>("aboutDialog");
const settingsTabButtons = [...document.querySelectorAll<HTMLButtonElement>(".settings-tab")];
const settingsPanels = [...document.querySelectorAll<HTMLElement>(".settings-panel")];
const providerInput = must<HTMLElement, HTMLSelectElement>("providerInput");
const endpointInput = must<HTMLElement, HTMLInputElement>("endpointInput");
const modelInput = must<HTMLElement, HTMLInputElement>("modelInput");
const apiKeyInput = must<HTMLElement, HTMLInputElement>("apiKeyInput");
const temperatureInput = must<HTMLElement, HTMLInputElement>("temperatureInput");
const systemPromptInput = must<HTMLElement, HTMLTextAreaElement>("systemPromptInput");
const companionOwnerNameInput = must<HTMLElement, HTMLInputElement>("companionOwnerNameInput");
const wakeWordModeInput = must<HTMLElement, HTMLSelectElement>("wakeWordModeInput");
const micAlwaysListeningInput = must<HTMLElement, HTMLSelectElement>("micAlwaysListeningInput");
const microphoneDeviceInput = must<HTMLElement, HTMLSelectElement>("microphoneDeviceInput");
const cameraDeviceInput = must<HTMLElement, HTMLSelectElement>("cameraDeviceInput");
const wakePhraseInput = must<HTMLElement, HTMLInputElement>("wakePhraseInput");
const screenTimeoutInput = must<HTMLElement, HTMLSelectElement>("screenTimeoutInput");
const memorySuggestionsInput = must<HTMLElement, HTMLSelectElement>("memorySuggestionsInput");
const wakeWordStatusEl = must<HTMLElement, HTMLElement>("wakeWordStatus");
const micAlwaysListeningStatusEl = must<HTMLElement, HTMLElement>("micAlwaysListeningStatus");
const startWakeWordButton = must<HTMLElement, HTMLButtonElement>("startWakeWordButton");
const refreshMediaDevicesButton = must<HTMLElement, HTMLButtonElement>("refreshMediaDevicesButton");
const mediaDeviceStatusEl = must<HTMLElement, HTMLElement>("mediaDeviceStatus");
const knownUserNameInput = must<HTMLElement, HTMLInputElement>("knownUserNameInput");
const knownUserRelationshipInput = must<HTMLElement, HTMLInputElement>("knownUserRelationshipInput");
const faceRecognitionInput = must<HTMLElement, HTMLSelectElement>("faceRecognitionInput");
const faceSampleStorageInput = must<HTMLElement, HTMLSelectElement>("faceSampleStorageInput");
const voiceMatchModeInput = must<HTMLElement, HTMLSelectElement>("voiceMatchModeInput");
const voiceMatchSensitivityInput = must<HTMLElement, HTMLSelectElement>("voiceMatchSensitivityInput");
const openIdentityWizardButton = must<HTMLElement, HTMLButtonElement>("openIdentityWizardButton");
const identityRecognitionVerifyButton = must<HTMLElement, HTMLButtonElement>("identityRecognitionVerifyButton");
const recognitionRuntimeStatus = must<HTMLElement, HTMLElement>("recognitionRuntimeStatus");
const recognitionRuntimeConfidence = must<HTMLElement, HTMLElement>("recognitionRuntimeConfidence");
const recognitionRuntimeLastVerified = must<HTMLElement, HTMLElement>("recognitionRuntimeLastVerified");
const recognitionRuntimeSource = must<HTMLElement, HTMLElement>("recognitionRuntimeSource");
const recognitionRuntimeDetail = must<HTMLElement, HTMLElement>("recognitionRuntimeDetail");
const recognitionDeviceCamera = must<HTMLElement, HTMLElement>("recognitionDeviceCamera");
const recognitionDeviceMicrophone = must<HTMLElement, HTMLElement>("recognitionDeviceMicrophone");
const recognitionDeviceFaceStorage = must<HTMLElement, HTMLElement>("recognitionDeviceFaceStorage");
const recognitionDeviceVoiceMatch = must<HTMLElement, HTMLElement>("recognitionDeviceVoiceMatch");
const recognitionDeviceTrustedControl = must<HTMLElement, HTMLElement>("recognitionDeviceTrustedControl");
const recognitionCameraStatusChip = must<HTMLElement, HTMLElement>("recognitionCameraStatusChip");
const recognitionMicStatusChip = must<HTMLElement, HTMLElement>("recognitionMicStatusChip");
const recognitionFaceSetupStatus = must<HTMLElement, HTMLElement>("recognitionFaceSetupStatus");
const recognitionVoiceSetupStatus = must<HTMLElement, HTMLElement>("recognitionVoiceSetupStatus");
const recognitionFaceCoachTitle = must<HTMLElement, HTMLElement>("recognitionFaceCoachTitle");
const recognitionFaceCoachDetail = must<HTMLElement, HTMLElement>("recognitionFaceCoachDetail");
const recognitionVoiceCoachTitle = must<HTMLElement, HTMLElement>("recognitionVoiceCoachTitle");
const recognitionVoiceCoachDetail = must<HTMLElement, HTMLElement>("recognitionVoiceCoachDetail");
const identityFaceSetupButton = must<HTMLElement, HTMLButtonElement>("identityFaceSetupButton");
const identityFaceTestButton = must<HTMLElement, HTMLButtonElement>("identityFaceTestButton");
const identityVoiceSetupButton = must<HTMLElement, HTMLButtonElement>("identityVoiceSetupButton");
const identityVoiceTestButton = must<HTMLElement, HTMLButtonElement>("identityVoiceTestButton");
const recognitionCoachStatus = must<HTMLElement, HTMLElement>("recognitionCoachStatus");
const recognitionFaceProgressLabel = must<HTMLElement, HTMLElement>("recognitionFaceProgressLabel");
const recognitionFaceProgressDetail = must<HTMLElement, HTMLElement>("recognitionFaceProgressDetail");
const recognitionVoiceProgressLabel = must<HTMLElement, HTMLElement>("recognitionVoiceProgressLabel");
const recognitionVoiceProgressDetail = must<HTMLElement, HTMLElement>("recognitionVoiceProgressDetail");
const recognitionSessionCheckOne = must<HTMLElement, HTMLElement>("recognitionSessionCheckOne");
const recognitionSessionCheckTwo = must<HTMLElement, HTMLElement>("recognitionSessionCheckTwo");
const recognitionSessionCheckThree = must<HTMLElement, HTMLElement>("recognitionSessionCheckThree");
const recognitionProofStationStatus = must<HTMLElement, HTMLElement>("recognitionProofStationStatus");
const recognitionProofCameraStatus = must<HTMLElement, HTMLElement>("recognitionProofCameraStatus");
const recognitionProofMicStatus = must<HTMLElement, HTMLElement>("recognitionProofMicStatus");
const recognitionProofFaceStatus = must<HTMLElement, HTMLElement>("recognitionProofFaceStatus");
const recognitionProofVoiceStatus = must<HTMLElement, HTMLElement>("recognitionProofVoiceStatus");
const recognitionProofSyncStatus = must<HTMLElement, HTMLElement>("recognitionProofSyncStatus");
const recognitionProofVerifyButton = must<HTMLElement, HTMLButtonElement>("recognitionProofVerifyButton");
const facePoseInput = must<HTMLElement, HTMLSelectElement>("facePoseInput");
const identityEnrollmentStatus = must<HTMLElement, HTMLElement>("identityEnrollmentStatus");
const faceEnrollmentProgress = must<HTMLElement, HTMLElement>("faceEnrollmentProgress");
const voiceEnrollmentProgress = must<HTMLElement, HTMLElement>("voiceEnrollmentProgress");
const voicePhrasePrompt = must<HTMLElement, HTMLElement>("voicePhrasePrompt");
const captureUserFaceButton = must<HTMLElement, HTMLButtonElement>("captureUserFaceButton");
const captureUserVoiceButton = must<HTMLElement, HTMLButtonElement>("captureUserVoiceButton");
const saveKnownUserButton = must<HTMLElement, HTMLButtonElement>("saveKnownUserButton");
const knownUsersList = must<HTMLElement, HTMLElement>("knownUsersList");
const identityEnrollmentWizard = must<HTMLElement, HTMLDialogElement>("identityEnrollmentWizard");
const identityWizardTitle = must<HTMLElement, HTMLElement>("identityWizardTitle");
const identityWizardStatus = must<HTMLElement, HTMLElement>("identityWizardStatus");
const identityWizardOverviewStep = must<HTMLElement, HTMLElement>("identityWizardOverviewStep");
const identityWizardFaceStep = must<HTMLElement, HTMLElement>("identityWizardFaceStep");
const identityWizardVoiceStep = must<HTMLElement, HTMLElement>("identityWizardVoiceStep");
const identityWizardSummaryStep = must<HTMLElement, HTMLElement>("identityWizardSummaryStep");
const identityWizardOwnerNameInput = must<HTMLElement, HTMLInputElement>("identityWizardOwnerNameInput");
const identityWizardRelationshipInput = must<HTMLElement, HTMLInputElement>("identityWizardRelationshipInput");
const identityWizardReadiness = must<HTMLElement, HTMLElement>("identityWizardReadiness");
const identityFacePreview = must<HTMLElement, HTMLVideoElement>("identityFacePreview");
const identityFaceRing = must<HTMLElement, HTMLElement>("identityFaceRing");
const identityFacePoseTitle = must<HTMLElement, HTMLElement>("identityFacePoseTitle");
const identityFacePoseInstruction = must<HTMLElement, HTMLElement>("identityFacePoseInstruction");
const identityFacePoseDots = must<HTMLElement, HTMLElement>("identityFacePoseDots");
const identityFaceQualityStatus = must<HTMLElement, HTMLElement>("identityFaceQualityStatus");
const identityWizardCaptureFaceButton = must<HTMLElement, HTMLButtonElement>("identityWizardCaptureFaceButton");
const identityVoiceSampleLabel = must<HTMLElement, HTMLElement>("identityVoiceSampleLabel");
const identityVoicePhrase = must<HTMLElement, HTMLElement>("identityVoicePhrase");
const identityVoiceLevelMeter = must<HTMLElement, HTMLElement>("identityVoiceLevelMeter");
const identityVoiceIsolationMeter = must<HTMLElement, HTMLElement>("identityVoiceIsolationMeter");
const identityVoiceNoiseMeter = must<HTMLElement, HTMLElement>("identityVoiceNoiseMeter");
const identityVoiceQualityStatus = must<HTMLElement, HTMLElement>("identityVoiceQualityStatus");
const identityWizardCaptureVoiceButton = must<HTMLElement, HTMLButtonElement>("identityWizardCaptureVoiceButton");
const identityWizardFaceSummary = must<HTMLElement, HTMLElement>("identityWizardFaceSummary");
const identityWizardVoiceSummary = must<HTMLElement, HTMLElement>("identityWizardVoiceSummary");
const identityWizardFinalSummary = must<HTMLElement, HTMLElement>("identityWizardFinalSummary");
const identityWizardCloseButton = must<HTMLElement, HTMLButtonElement>("identityWizardCloseButton");
const identityWizardBackButton = must<HTMLElement, HTMLButtonElement>("identityWizardBackButton");
const identityWizardNextButton = must<HTMLElement, HTMLButtonElement>("identityWizardNextButton");
const identityWizardDoneButton = must<HTMLElement, HTMLButtonElement>("identityWizardDoneButton");
const wizardOwnerNameInput = must<HTMLElement, HTMLInputElement>("wizardOwnerNameInput");
const wizardWakeWordModeInput = must<HTMLElement, HTMLSelectElement>("wizardWakeWordModeInput");
const wizardScreenTimeoutInput = must<HTMLElement, HTMLSelectElement>("wizardScreenTimeoutInput");
const wizardFaceRecognitionInput = must<HTMLElement, HTMLSelectElement>("wizardFaceRecognitionInput");
const wizardSkipButton = must<HTMLElement, HTMLButtonElement>("wizardSkipButton");
const wizardSaveButton = must<HTMLElement, HTMLButtonElement>("wizardSaveButton");
const synraSkillModeInput = must<HTMLElement, HTMLSelectElement>("synraSkillModeInput");
const nodeSparkAccessInput = must<HTMLElement, HTMLSelectElement>("nodeSparkAccessInput");
const nodeSparkHubUrlInput = must<HTMLElement, HTMLInputElement>("nodeSparkHubUrlInput");
const nodeSparkDeviceNameInput = must<HTMLElement, HTMLInputElement>("nodeSparkDeviceNameInput");
const nodeSparkPairingPinInput = must<HTMLElement, HTMLInputElement>("nodeSparkPairingPinInput");
const pairNodeSparkButton = must<HTMLElement, HTMLButtonElement>("pairNodeSparkButton");
const checkNodeSparkPairingButton = must<HTMLElement, HTMLButtonElement>("checkNodeSparkPairingButton");
const forgetNodeSparkPairingButton = must<HTMLElement, HTMLButtonElement>("forgetNodeSparkPairingButton");
const nodeSparkPairingStatusEl = must<HTMLElement, HTMLElement>("nodeSparkPairingStatus");
const nodeSparkPairedHubStatusEl = must<HTMLElement, HTMLElement>("nodeSparkPairedHubStatus");
const homeAssistantEnabledInput = must<HTMLElement, HTMLSelectElement>("homeAssistantEnabledInput");
const homeAssistantUrlInput = must<HTMLElement, HTMLInputElement>("homeAssistantUrlInput");
const homeAssistantTokenInput = must<HTMLElement, HTMLInputElement>("homeAssistantTokenInput");
const homeAssistantLightEntityInput = must<HTMLElement, HTMLInputElement>("homeAssistantLightEntityInput");
const homeAssistantConfirmationPolicyInput = must<HTMLElement, HTMLSelectElement>("homeAssistantConfirmationPolicyInput");
const homeAssistantEntitySelect = must<HTMLElement, HTMLSelectElement>("homeAssistantEntitySelect");
const memoryPreferredNameInput = must<HTMLElement, HTMLInputElement>("memoryPreferredNameInput");
const memoryStyleInput = must<HTMLElement, HTMLInputElement>("memoryStyleInput");
const memoryFactsInput = must<HTMLElement, HTMLTextAreaElement>("memoryFactsInput");
const memoryRoutinesInput = must<HTMLElement, HTMLTextAreaElement>("memoryRoutinesInput");
const memoryDevicesInput = must<HTMLElement, HTMLTextAreaElement>("memoryDevicesInput");
const voiceProviderInput = must<HTMLElement, HTMLSelectElement>("voiceProviderInput");
const browserVoiceSelect = must<HTMLElement, HTMLSelectElement>("browserVoiceSelect");
const browserVoiceStatusEl = must<HTMLElement, HTMLElement>("browserVoiceStatus");
const elevenLabsApiKeyInput = must<HTMLElement, HTMLInputElement>("elevenLabsApiKeyInput");
const loadElevenLabsVoicesButton = must<HTMLElement, HTMLButtonElement>("loadElevenLabsVoicesButton");
const voiceDiagnosticsButton = must<HTMLElement, HTMLButtonElement>("voiceDiagnosticsButton");
const elevenLabsVoiceSelect = must<HTMLElement, HTMLSelectElement>("elevenLabsVoiceSelect");
const elevenLabsVoiceIdInput = must<HTMLElement, HTMLInputElement>("elevenLabsVoiceIdInput");
const elevenLabsVoiceStatusEl = must<HTMLElement, HTMLElement>("elevenLabsVoiceStatus");
const elevenLabsModelIdInput = must<HTMLElement, HTMLInputElement>("elevenLabsModelIdInput");
const elevenLabsOutputFormatInput = must<HTMLElement, HTMLInputElement>("elevenLabsOutputFormatInput");
const elevenLabsStabilityInput = must<HTMLElement, HTMLInputElement>("elevenLabsStabilityInput");
const elevenLabsSimilarityInput = must<HTMLElement, HTMLInputElement>("elevenLabsSimilarityInput");
const chatterboxModelInput = must<HTMLElement, HTMLSelectElement>("chatterboxModelInput");
const chatterboxDeviceInput = must<HTMLElement, HTMLSelectElement>("chatterboxDeviceInput");
const chatterboxVoicePromptPathInput = must<HTMLElement, HTMLInputElement>("chatterboxVoicePromptPathInput");
const chatterboxLanguageIdInput = must<HTMLElement, HTMLInputElement>("chatterboxLanguageIdInput");
const chatterboxVoiceStatusEl = must<HTMLElement, HTMLElement>("chatterboxVoiceStatus");
const discoverHomeAssistantButton = must<HTMLElement, HTMLButtonElement>("discoverHomeAssistantButton");
const testHomeAssistantButton = must<HTMLElement, HTMLButtonElement>("testHomeAssistantButton");
const testVoiceButton = must<HTMLElement, HTMLButtonElement>("testVoiceButton");
const forgetMemoriesButton = must<HTMLElement, HTMLButtonElement>("forgetMemoriesButton");
const exportMemoryButton = must<HTMLElement, HTMLButtonElement>("exportMemoryButton");
const importMemoryButton = must<HTMLElement, HTMLButtonElement>("importMemoryButton");
const exportBackupButton = must<HTMLElement, HTMLButtonElement>("exportBackupButton");
const importBackupButton = must<HTMLElement, HTMLButtonElement>("importBackupButton");
const saveSettingsButton = must<HTMLElement, HTMLButtonElement>("saveSettingsButton");
const settingsAvatarStatusEl = must<HTMLElement, HTMLElement>("settingsAvatarStatus");
const settingsBackgroundStatusEl = must<HTMLElement, HTMLElement>("settingsBackgroundStatus");
const settingsQualityStatusEl = must<HTMLElement, HTMLElement>("settingsQualityStatus");
const settingsModeStatusEl = must<HTMLElement, HTMLElement>("settingsModeStatus");
const settingsKioskWindowStatusEl = must<HTMLElement, HTMLElement>("settingsKioskWindowStatus");
const settingsScreenTimeoutStatusEl = must<HTMLElement, HTMLElement>("settingsScreenTimeoutStatus");
const settingsVersionStatusEl = must<HTMLElement, HTMLElement>("settingsVersionStatus");
const kioskWindowToggleButton = must<HTMLElement, HTMLButtonElement>("kioskWindowToggleButton");

const renderer = USE_HUB_AVATAR_RUNTIME ? null : createRenderer();
if (!renderer && !USE_HUB_AVATAR_RUNTIME) {
  canvas.hidden = true;
  document.body.dataset.webgl = "unavailable";
  fpsEl.textContent = "3D unavailable";
}

window.addEventListener("pointerdown", () => {
  void unlockAudioPlayback();
}, { once: true });

window.addEventListener("keydown", () => {
  void unlockAudioPlayback();
}, { once: true });

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
camera.position.set(0, 0.9, 4.45);
camera.lookAt(0, 0.86, 0);
let contactShadow: THREE.Mesh | null = null;

const ambientLight = new THREE.AmbientLight(0xffffff, 1.85);
const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0xd9e0ee, 1.15);
const keyLight = new THREE.DirectionalLight(0xffffff, 2.05);
const faceLight = new THREE.DirectionalLight(0xfff7ef, 0.82);
const rimLight = new THREE.DirectionalLight(0xe8f4ff, 0.32);
keyLight.position.set(-1.45, 2.75, 3.35);
faceLight.position.set(0.15, 1.72, 3.3);
rimLight.position.set(2.2, 1.8, -2.8);
scene.add(ambientLight, hemisphereLight, keyLight, faceLight, rimLight);
installContactShadow();

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));
let activeRecognition: SpeechRecognition | null = null;
let wakeWordRecognition: SpeechRecognition | null = null;
let holdToTalkSession: HoldToTalkSession | null = null;
let micInteractionActive = false;
let holdToTalkPressed = false;
let serverWakeWordActive = false;
let serverWakeWordTimer = 0;
let pendingFacePoseSamples: SynraFacePoseSamples = {};
let pendingVoicePrints: VoicePrintSample[] = [];
type IdentityWizardStage = "overview" | "face" | "voice" | "summary";
type EnrollmentProofSyncState = "not-tested" | "pending" | "confirmed" | "failed" | "degraded";
type EnrollmentProofState = {
  lastHealthAt: string | null;
  lastFaceAcceptedAt: string | null;
  lastVoiceAcceptedAt: string | null;
  lastSyncAttemptAt: string | null;
  lastSyncConfirmedAt: string | null;
  lastSyncError: string | null;
  lastSyncedFaceSampleCount: number;
  lastSyncedVoiceSampleCount: number;
  stationAvailable: boolean;
  syncState: EnrollmentProofSyncState;
};
const enrollmentProofState: EnrollmentProofState = {
  lastHealthAt: null,
  lastFaceAcceptedAt: null,
  lastVoiceAcceptedAt: null,
  lastSyncAttemptAt: null,
  lastSyncConfirmedAt: null,
  lastSyncError: null,
  lastSyncedFaceSampleCount: 0,
  lastSyncedVoiceSampleCount: 0,
  stationAvailable: false,
  syncState: "not-tested"
};
let enrollmentProofSyncRequestId = 0;
let identityWizardStage: IdentityWizardStage = "overview";
let identityWizardPreviewStream: MediaStream | null = null;
let identityWizardVoiceSignal = { level: 0, isolation: 0, noise: 0 };
let wakeWordMicActive = false;
let wakeWordLastHeard = "";
let wakeWordLastError = "";
let serverTranscriptionFailureCount = 0;
let serverTranscriptionDisabledUntil = 0;
let serverTranscriptionStatus: "ready" | "degraded" | "unavailable" = "ready";

if (USE_HUB_AVATAR_RUNTIME) {
  hubAvatarRuntime = new SynraAvatarRuntime({
    canvas,
    stage: canvas.closest<HTMLElement>(".stage") ?? app,
    status: activeMotionEl,
    vrmUrl: getSynraAvatar(resolveInitialAvatarId()).url
  });
}

resize();
window.addEventListener("resize", resize);

void initializeSynraApp();

async function initializeSynraApp(): Promise<void> {
  setSynraState("idle", "Starting Synra.");
  await hydrateServerManagedSettings();
  document.body.dataset.runtimeMode = runtimeMode;
  populateQualitySelect();
  applyRenderQuality(resolveRenderQuality(state.visual.renderQuality));
  applyPerformanceTier(state.performanceTier);
  populateBackgroundSelect();
  populateAvatarSelect();
  populateMotionCategorySelect();
  applyHydratedVisualState();
  await bootAvatarRuntime();
  refreshServerModelStatus().catch(() => {});
  populateBrowserVoiceSelect();
  refreshVoiceStatus();
  refreshVisionStatus().catch(() => {});
  if ("speechSynthesis" in window) {
    speechSynthesis.addEventListener("voiceschanged", () => {
      populateBrowserVoiceSelect();
      refreshVoiceStatus();
    });
  }
  requestAnimationFrame(render);
  refreshModelLabel();
  refreshAiConnectionPanel();
  refreshSkillPanel();
  refreshSystemHealthPanel();
  installQaHarness();
  initializeCompanionPresence();
}

async function bootAvatarRuntime(): Promise<void> {
  try {
    if (hubAvatarRuntime) {
      activeMotionEl.textContent = "Loading Hub runtime";
      await loadHubMotionManifest();
      populateMotionSelect();
      await hubAvatarRuntime.boot();
      await loadAvatarById(resolveInitialAvatarId(), { persist: false });
      document.body.dataset.webgl = "available";
      setSynraState("idle", `${getSynraAvatar(resolveInitialAvatarId()).label} is ready.`);
      if (runtimeMode === "kiosk") {
        hubAvatarRuntime.setMode("idle", { playAuthoredLoop: false });
        hubAvatarRuntime.setSpeaking(false);
        activeMotionEl.textContent = "procedural idle";
      } else {
        void playMotionRoute("wave", { restart: true, returnToIdle: true });
      }
      return;
    }
    await loadAvatarById(resolveInitialAvatarId(), { persist: false });
  } catch {
    try {
      await loadAvatarById(DEFAULT_SYNRA_AVATAR_ID, { persist: false });
    } catch (error) {
      setSynraState("offline", `Avatar failed to load: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function installQaHarness(): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa") !== "1" && params.get("test") !== "1") return;
  const testWindow = window as Window & {
    __synraStandaloneTest?: Record<string, unknown>;
  };
  testWindow.__synraStandaloneTest = {
    avatarIds: SYNRA_AVATARS.map((avatar) => avatar.id),
    motionIds: () => hubMotionClips.map((clip) => clip.id),
    state: () => ({
      synraState: state.synra,
      avatarId: state.visual.avatarId,
      activeMotion: currentHubMotionId() ?? state.motionPlayer.snapshot.activeClipId,
      hubRuntimeReady: Boolean(hubAvatarRuntime?.runtimeHealth().renderHeartbeat),
      hubHealth: hubAvatarRuntime?.runtimeHealth() ?? null,
      motionCount: hubMotionClips.length,
      visionEnabled: Boolean(activeVisionStream),
      aboutReady: Boolean(document.getElementById("aboutDialog")) && Boolean(document.getElementById("openAboutButton")),
      caption: captionEl.textContent,
      status: statusEl.textContent,
      lastRouteLabel: state.lastRouteLabel,
      messages: state.messages.slice(-6)
    }),
    switchAvatar: async (avatarId: string) => {
      if (!isSynraAvatarId(avatarId)) throw new Error(`Unknown avatar: ${avatarId}`);
      await loadAvatarById(avatarId);
      return (testWindow.__synraStandaloneTest?.state as () => Record<string, unknown>)();
    },
    playMotion: async (motionId: string) => {
      if (!hubMotionClips.some((clip) => clip.id === motionId)) throw new Error(`Unknown motion: ${motionId}`);
      await playMotionRoute(motionId, { restart: true, returnToIdle: true });
      return (testWindow.__synraStandaloneTest?.state as () => Record<string, unknown>)();
    },
    stopMotion: () => {
      hubAvatarRuntime?.stopMotionTest();
      return (testWindow.__synraStandaloneTest?.state as () => Record<string, unknown>)();
    },
    setVision: async (enabled: boolean) => {
      await setVisionEnabled(enabled);
      return (testWindow.__synraStandaloneTest?.state as () => Record<string, unknown>)();
    },
    setQuality: (quality: RenderQuality) => {
      applyRenderQuality(resolveRenderQuality(quality));
      return (testWindow.__synraStandaloneTest?.state as () => Record<string, unknown>)();
    },
    sendText: async (text: string) => {
      await handleUserText(text);
      return (testWindow.__synraStandaloneTest?.state as () => Record<string, unknown>)();
    }
  };
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendPrompt();
});

sendButton?.addEventListener("click", (event) => {
  event.preventDefault();
  sendPrompt();
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  sendPrompt();
});

function sendPrompt(): void {
  const text = promptInput.value.trim();
  if (!text) return;
  promptInput.value = "";
  void handleUserText(text);
}

listenButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  holdToTalkPressed = true;
  listenButton.setPointerCapture?.(event.pointerId);
  void beginHoldToTalk();
});

listenButton.addEventListener("pointerup", (event) => {
  event.preventDefault();
  holdToTalkPressed = false;
  listenButton.releasePointerCapture?.(event.pointerId);
  void finishHoldToTalk();
});

listenButton.addEventListener("pointercancel", () => {
  holdToTalkPressed = false;
  void cancelHoldToTalk("Listening cancelled.");
});

listenButton.addEventListener("keydown", (event) => {
  if (event.key !== " " && event.key !== "Enter") return;
  event.preventDefault();
  holdToTalkPressed = true;
  void beginHoldToTalk();
});

listenButton.addEventListener("keyup", (event) => {
  if (event.key !== " " && event.key !== "Enter") return;
  event.preventDefault();
  holdToTalkPressed = false;
  void finishHoldToTalk();
});

stopVoiceButton.addEventListener("click", () => {
  stopVoiceActivity("Voice stopped.");
});

visionToggleButton.addEventListener("click", () => {
  void setVisionEnabled(!activeVisionStream);
});

visionAnalyzeButton.addEventListener("click", () => {
  void runVisionAnalyzeButton();
});

backgroundSelect.addEventListener("change", () => {
  const background = resolveBackground(backgroundSelect.value);
  state.visual = { ...state.visual, backgroundId: background.id };
  saveVisualSettingsEverywhere();
  applyBackground(background);
});

avatarSelect.addEventListener("change", () => {
  const avatarId = isSynraAvatarId(avatarSelect.value) ? avatarSelect.value : DEFAULT_SYNRA_AVATAR_ID;
  state.visual = { ...state.visual, avatarId };
  saveVisualSettingsEverywhere();
  void loadAvatarById(avatarId);
});

qualitySelect.addEventListener("change", () => {
  const quality = resolveRenderQuality(qualitySelect.value);
  applyRenderQuality(quality);
  saveVisualSettingsEverywhere();
  setSynraState("idle", `${renderQualityLabel(quality)} render quality is active.`);
});

motionCategorySelect.addEventListener("change", () => {
  state.visual = { ...state.visual, motionCategoryId: resolveMotionCategory(motionCategorySelect.value).id };
  populateMotionSelect();
  if (motionSelect.value) {
    state.visual = { ...state.visual, motionId: motionSelect.value };
  }
  saveVisualSettingsEverywhere();
  setSynraState("idle", `${resolveMotionCategory(state.visual.motionCategoryId).label} motions are selected.`);
});

motionSelect.addEventListener("change", () => {
  if (!motionSelect.value) return;
  state.visual = { ...state.visual, motionId: motionSelect.value };
  saveVisualSettingsEverywhere();
  const label = motionSelect.selectedOptions[0]?.textContent?.trim() || motionSelect.value;
  activeMotionEl.textContent = `Selected ${label}`;
});

playMotionButton.addEventListener("click", () => {
  const motionId = motionSelect.value;
  if (!motionId) return;
  state.visual = { ...state.visual, motionId };
  saveVisualSettingsEverywhere();
  void playManualMotion(motionId);
});

controlModeButton.addEventListener("click", () => {
  const next = resolveControlMode(state.visual.controlMode) === "manual" ? "live" : "manual";
  state.visual = { ...state.visual, controlMode: next };
  saveVisualSettingsEverywhere();
  applyControlMode(next);
});

settingsButton.addEventListener("click", () => {
  openSettingsDialog("ai");
});

openAiSettingsButton.addEventListener("click", () => {
  openSettingsDialog("ai");
});

openSkillSettingsButton.addEventListener("click", () => {
  openSettingsDialog("nodespark");
});

openAboutButton.addEventListener("click", () => {
  aboutDialog.showModal();
});

systemStatusButton.addEventListener("click", () => {
  void runQuickLocalTool("system_status");
});

networkStatusButton.addEventListener("click", () => {
  void runQuickLocalTool("network_status");
});

dateTimeButton.addEventListener("click", () => {
  void runQuickLocalTool("date_time");
});

chatLogEl.addEventListener("click", (event) => {
  const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-nodespark-workflow], [data-nodespark-confirm], [data-nodespark-cancel], [data-nodespark-refresh], [data-nodespark-runs]") : null;
  if (!target) return;
  const workflow = target.dataset.nodesparkWorkflow || target.dataset.nodesparkConfirm || "";
  if (target.dataset.nodesparkCancel) {
    void handleUserText("cancel");
    return;
  }
  if (target.dataset.nodesparkRefresh) {
    void runNodeSparkChatCardCommand(listNodeSparkWorkflowsCommand);
    return;
  }
  if (target.dataset.nodesparkRuns) {
    void runNodeSparkChatCardCommand(listNodeSparkRunsCommand);
    return;
  }
  if (target.dataset.nodesparkConfirm) {
    void handleUserText("confirm");
    return;
  }
  if (workflow) {
    void prepareNodeSparkWorkflowFromTap(workflow);
  }
});

nodeSparkStatusButton.addEventListener("click", () => {
  void checkNodeSparkStatus();
});

nodeSparkWorkflowsButton.addEventListener("click", () => {
  void runNodeSparkPanelCommand(nodeSparkWorkflowsButton, "Listing workflows", listNodeSparkWorkflowsCommand);
});

nodeSparkRunsButton.addEventListener("click", () => {
  void runNodeSparkPanelCommand(nodeSparkRunsButton, "Listing runs", listNodeSparkRunsCommand);
});

nodeSparkLatestRunButton.addEventListener("click", () => {
  void runNodeSparkPanelCommand(nodeSparkLatestRunButton, "Checking latest run", latestNodeSparkRunCommand);
});

pairNodeSparkButton.addEventListener("click", () => {
  void pairNodeSparkHub();
});

checkNodeSparkPairingButton.addEventListener("click", () => {
  void checkNodeSparkStatus();
});

forgetNodeSparkPairingButton.addEventListener("click", () => {
  forgetNodeSparkPairing();
});

testAiButton.addEventListener("click", () => {
  void testAiConnection();
});

checkAllConnectionsButton.addEventListener("click", () => {
  void checkAllConnections();
});

settingsTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setSettingsTab(button.dataset.settingsTab || "ai");
  });
});

discoverHomeAssistantButton.addEventListener("click", () => {
  void discoverHomeAssistantEntities();
});

testHomeAssistantButton.addEventListener("click", () => {
  void testHomeAssistantConnection();
});

testVoiceButton.addEventListener("click", () => {
  void testVoiceConnection();
});

loadElevenLabsVoicesButton.addEventListener("click", () => {
  void loadElevenLabsVoices();
});

voiceDiagnosticsButton.addEventListener("click", () => {
  void runVoiceDiagnostics();
});

elevenLabsVoiceSelect.addEventListener("change", () => {
  const selected = state.elevenLabsVoices.find((voice) => voice.voiceId === elevenLabsVoiceSelect.value);
  if (!selected) return;
  elevenLabsVoiceIdInput.value = selected.voiceId;
  state.voiceSettings = { ...readVoiceSettingsFromInputs(), elevenLabsVoiceName: selected.name };
  saveVoiceSettings(state.voiceSettings);
  updateElevenLabsVoiceStatus(`Selected ${selected.name}.`);
  refreshVoiceStatus();
});

forgetMemoriesButton.addEventListener("click", () => {
  forgetAllMemoryFromSettings();
});

exportMemoryButton.addEventListener("click", () => {
  exportMemoryFromSettings();
});

importMemoryButton.addEventListener("click", () => {
  importMemoryFromSettings();
});

exportBackupButton.addEventListener("click", () => {
  exportSanitizedBackupFromSettings();
});

importBackupButton.addEventListener("click", () => {
  importSanitizedBackupFromSettings();
});

homeAssistantEntitySelect.addEventListener("change", () => {
  if (!homeAssistantEntitySelect.value) return;
  homeAssistantLightEntityInput.value = homeAssistantEntitySelect.value;
});

providerInput.addEventListener("change", () => {
  applyProviderPreset(providerInput.value);
});

voiceProviderInput.addEventListener("change", () => {
  state.voiceSettings = readVoiceSettingsFromInputs();
  saveVoiceSettings(state.voiceSettings);
  refreshVoiceStatus();
});

browserVoiceSelect.addEventListener("change", () => {
  const selected = selectedBrowserVoice();
  state.voiceSettings = { ...readVoiceSettingsFromInputs(), browserVoiceName: selected?.name ?? "" };
  saveVoiceSettings(state.voiceSettings);
  updateBrowserVoiceStatus(browserVoiceStatusText());
  refreshVoiceStatus();
});

elevenLabsApiKeyInput.addEventListener("input", () => {
  updateElevenLabsVoiceStatus(elevenLabsVoiceStatusText());
});

elevenLabsVoiceIdInput.addEventListener("change", () => {
  const selected = state.elevenLabsVoices.find((voice) => voice.voiceId === elevenLabsVoiceIdInput.value.trim());
  state.voiceSettings = { ...readVoiceSettingsFromInputs(), elevenLabsVoiceName: selected?.name ?? "" };
  saveVoiceSettings(state.voiceSettings);
  populateElevenLabsVoiceSelect();
  refreshVoiceStatus();
});

saveSettingsButton.addEventListener("click", () => {
  void saveSettingsFromDialog();
});

async function saveSettingsFromDialog(): Promise<void> {
  try {
    const temperature = Number(temperatureInput.value);
    const next: ModelSettings = {
      provider: resolveModelProvider(providerInput.value),
      endpoint: endpointInput.value.trim(),
      model: modelInput.value.trim(),
      apiKey: keepServerManagedSecret(apiKeyInput.value, state.settings.apiKey),
      temperature: Number.isFinite(temperature) ? Math.min(Math.max(temperature, 0), 2) : 0.2,
      systemPrompt: systemPromptInput.value.trim()
    };
    const nextVoice = readVoiceSettingsFromInputs();
    const nextProduct = readProductSettingsFromInputs();
    const nextHomeAssistant = readHomeAssistantSettingsFromInputs();
    await saveServerManagedSecrets(next, nextVoice, nextProduct, nextHomeAssistant);
    state.settings = next;
    state.voiceSettings = nextVoice;
    state.productSettings = nextProduct;
    state.homeAssistantSettings = nextHomeAssistant;
    state.memory = readMemorySettingsFromInputs();
    state.companionSettings = readCompanionSettingsFromInputs();
    saveModelSettings(next);
    saveVoiceSettings(state.voiceSettings);
    saveProductSettings(state.productSettings);
    saveHomeAssistantSettings(state.homeAssistantSettings);
    saveMemory(state.memory);
    saveCompanionSettings(state.companionSettings);
    await saveDurableServerSettings();
    refreshModelLabel();
    refreshAiConnectionPanel();
    refreshSkillPanel();
    refreshNodeSparkPairingStatus();
    refreshVoiceStatus();
    refreshSystemHealthPanel();
    refreshCompanionPresence();
    setSynraState("idle", "Settings saved. Secrets are stored server-side.");
  } catch (error) {
    setSynraState("offline", error instanceof Error ? error.message : "Settings could not be saved.");
    void playMotionRoute("concerned", { restart: true, returnToIdle: true });
  }
}

kioskWindowToggleButton.addEventListener("click", () => {
  void toggleKioskWindowMode();
});

startWakeWordButton.addEventListener("click", () => {
  state.companionSettings = readCompanionSettingsFromInputs();
  saveCompanionSettingsEverywhere();
  refreshCompanionPresence();
});

refreshMediaDevicesButton.addEventListener("click", () => {
  state.companionSettings = readCompanionSettingsFromInputs();
  void refreshMediaDeviceInputs({ requestPermission: true });
});

openIdentityWizardButton.addEventListener("click", () => {
  void openIdentityWizard();
});

identityRecognitionVerifyButton.addEventListener("click", () => {
  const { faceCount, voiceCount } = wizardEnrollmentCounts();
  const ready = faceCount >= REQUIRED_FACE_POSE_COUNT && voiceCount >= REQUIRED_VOICE_SAMPLE_COUNT && faceRecognitionInput.value === "on" && voiceMatchModeInput.value !== "off";
  setSynraState("idle", ready ? "Owner verified locally with face and voice enrollment." : "Finish face and voice enrollment before owner verification.");
  refreshIdentityEnrollmentPanel();
});

recognitionProofVerifyButton.addEventListener("click", () => {
  void verifyEnrollmentProofSync();
});

identityFaceSetupButton.addEventListener("click", async () => {
  await openIdentityWizard();
  setIdentityWizardStage("face");
});

identityFaceTestButton.addEventListener("click", async () => {
  await openIdentityWizard();
  setIdentityWizardStage("face");
});

identityVoiceSetupButton.addEventListener("click", async () => {
  await openIdentityWizard();
  setIdentityWizardStage("voice");
});

identityVoiceTestButton.addEventListener("click", async () => {
  await openIdentityWizard();
  setIdentityWizardStage("voice");
});

identityWizardCloseButton.addEventListener("click", () => {
  identityEnrollmentWizard.close();
});

identityEnrollmentWizard.addEventListener("close", () => {
  stopIdentityWizardCameraPreview();
});

identityWizardOwnerNameInput.addEventListener("input", () => {
  knownUserNameInput.value = identityWizardOwnerNameInput.value;
  renderIdentityWizard();
});

identityWizardRelationshipInput.addEventListener("input", () => {
  knownUserRelationshipInput.value = identityWizardRelationshipInput.value;
});

identityWizardBackButton.addEventListener("click", () => {
  retreatIdentityWizard();
});

identityWizardNextButton.addEventListener("click", () => {
  void advanceIdentityWizard();
});

identityWizardDoneButton.addEventListener("click", () => {
  saveKnownUserFromInputs();
  identityEnrollmentWizard.close();
});

identityWizardCaptureFaceButton.addEventListener("click", () => {
  void captureIdentityWizardFacePose();
});

identityWizardCaptureVoiceButton.addEventListener("click", () => {
  void captureIdentityWizardVoiceSample();
});

captureUserFaceButton.addEventListener("click", () => {
  void captureKnownUserFaceSample();
});

captureUserVoiceButton.addEventListener("click", () => {
  void captureKnownUserVoiceSample();
});

saveKnownUserButton.addEventListener("click", () => {
  saveKnownUserFromInputs();
});

knownUserNameInput.addEventListener("input", () => {
  refreshIdentityEnrollmentPanel();
});

knownUserRelationshipInput.addEventListener("input", () => {
  refreshIdentityEnrollmentPanel();
});

faceRecognitionInput.addEventListener("change", () => {
  refreshIdentityEnrollmentPanel();
});

faceSampleStorageInput.addEventListener("change", () => {
  refreshIdentityEnrollmentPanel();
});

voiceMatchModeInput.addEventListener("change", () => {
  refreshIdentityEnrollmentPanel();
});

voiceMatchSensitivityInput.addEventListener("change", () => {
  refreshIdentityEnrollmentPanel();
});

facePoseInput.addEventListener("change", () => {
  refreshIdentityEnrollmentPanel();
});

wizardSkipButton.addEventListener("click", () => {
  state.companionSettings = { ...state.companionSettings, setupComplete: true };
  saveCompanionSettingsEverywhere();
  firstRunWizard.close();
});

wizardSaveButton.addEventListener("click", () => {
  state.companionSettings = {
    ...state.companionSettings,
    setupComplete: true,
    ownerName: wizardOwnerNameInput.value.trim(),
    wakeWordMode: normalizeWakeWordMode(wizardWakeWordModeInput.value),
    wakePhrase: DEFAULT_WAKE_PHRASE,
    screenTimeoutMinutes: normalizeScreenTimeout(wizardScreenTimeoutInput.value),
    allowAlwaysListening: wizardWakeWordModeInput.value === "local",
    allowCameraRecognition: wizardFaceRecognitionInput.value === "on",
    allowFaceSampleStorage: wizardFaceRecognitionInput.value === "on"
  };
  if (state.companionSettings.ownerName) {
    state.memory = { ...state.memory, preferredName: state.companionSettings.ownerName };
    saveMemoryEverywhere();
  }
  saveCompanionSettingsEverywhere();
  firstRunWizard.close();
  populateCompanionSettingsInputs();
  refreshCompanionPresence();
});

function openSettingsDialog(initialTab = "ai"): void {
  providerInput.value = resolveModelProvider(state.settings.provider);
  endpointInput.value = state.settings.endpoint;
  modelInput.value = state.settings.model;
  apiKeyInput.value = displaySecretValue(state.settings.apiKey);
  apiKeyInput.placeholder = isServerManagedSecret(state.settings.apiKey) ? "Server-managed API key saved" : "";
  temperatureInput.value = String(state.settings.temperature ?? 0.2);
  systemPromptInput.value = state.settings.systemPrompt ?? "";
  populateProductSettingsInputs();
  populateHomeAssistantSettingsInputs();
  populateMemorySettingsInputs();
  populateVoiceSettingsInputs();
  populateCompanionSettingsInputs();
  void refreshMediaDeviceInputs();
  refreshSettingsDisplayStatus();
  refreshKioskWindowControls().catch(() => {});
  setSettingsTab(initialTab);
  settingsDialog.showModal();
}

function setSettingsTab(tabId: string): void {
  const selectedTab = settingsPanels.some((panel) => panel.dataset.settingsPanel === tabId) ? tabId : "ai";
  settingsTabButtons.forEach((button) => {
    const active = button.dataset.settingsTab === selectedTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  settingsPanels.forEach((panel) => {
    const active = panel.dataset.settingsPanel === selectedTab;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function initializeCompanionPresence(): void {
  ensureKioskWakeWordDefault();
  populateCompanionSettingsInputs();
  refreshCompanionPresence();
  if (!state.companionSettings.setupComplete) {
    wizardOwnerNameInput.value = state.companionSettings.ownerName || state.memory.preferredName || "";
    wizardWakeWordModeInput.value = state.companionSettings.wakeWordMode;
    wizardScreenTimeoutInput.value = String(state.companionSettings.screenTimeoutMinutes);
    wizardFaceRecognitionInput.value = state.companionSettings.allowCameraRecognition ? "on" : "off";
    window.setTimeout(() => {
      if (!firstRunWizard.open) firstRunWizard.showModal();
    }, 700);
  }
}

function ensureKioskWakeWordDefault(): void {
  if (runtimeMode !== "kiosk") return;
  const wakePhrase = state.companionSettings.wakePhrase?.trim() || DEFAULT_WAKE_PHRASE;
  if (state.companionSettings.wakeWordMode === "local" && state.companionSettings.allowAlwaysListening && wakePhrase === state.companionSettings.wakePhrase) return;
  state.companionSettings = {
    ...state.companionSettings,
    wakeWordMode: "local",
    wakePhrase,
    allowAlwaysListening: true
  };
  saveCompanionSettingsEverywhere();
}

function populateCompanionSettingsInputs(): void {
  companionOwnerNameInput.value = state.companionSettings.ownerName || state.memory.preferredName || "";
  wakeWordModeInput.value = state.companionSettings.wakeWordMode;
  micAlwaysListeningInput.value = state.companionSettings.allowAlwaysListening ? "on" : "off";
  microphoneDeviceInput.value = state.companionSettings.preferredMicrophoneId || "";
  cameraDeviceInput.value = state.companionSettings.preferredCameraId || "";
  wakePhraseInput.value = state.companionSettings.wakePhrase || DEFAULT_WAKE_PHRASE;
  screenTimeoutInput.value = String(state.companionSettings.screenTimeoutMinutes);
  memorySuggestionsInput.value = state.companionSettings.allowMemorySuggestions ? "on" : "off";
  faceRecognitionInput.value = state.companionSettings.allowCameraRecognition ? "on" : "off";
  faceSampleStorageInput.value = state.companionSettings.allowFaceSampleStorage ? "on" : "off";
  voiceMatchModeInput.value = normalizeVoiceMatchMode(state.companionSettings.voiceMatchMode);
  voiceMatchSensitivityInput.value = normalizeVoiceMatchSensitivity(state.companionSettings.voiceMatchSensitivity);
  refreshIdentityEnrollmentPanel();
  renderKnownUsers();
}

function readCompanionSettingsFromInputs(): CompanionSettings {
  const wakeWordMode = normalizeWakeWordMode(wakeWordModeInput.value);
  return {
    ...state.companionSettings,
    ownerName: companionOwnerNameInput.value.trim(),
    wakeWordMode,
    wakePhrase: wakePhraseInput.value.trim() || DEFAULT_WAKE_PHRASE,
    preferredMicrophoneId: microphoneDeviceInput.value.trim(),
    preferredCameraId: cameraDeviceInput.value.trim(),
    screenTimeoutMinutes: normalizeScreenTimeout(screenTimeoutInput.value),
    allowAlwaysListening: wakeWordMode === "local" && micAlwaysListeningInput.value === "on",
    allowCameraRecognition: faceRecognitionInput.value === "on",
    allowFaceSampleStorage: faceSampleStorageInput.value === "on",
    voiceMatchMode: normalizeVoiceMatchMode(voiceMatchModeInput.value),
    voiceMatchSensitivity: normalizeVoiceMatchSensitivity(voiceMatchSensitivityInput.value),
    allowMemorySuggestions: memorySuggestionsInput.value === "on"
  };
}

function normalizeHomeAssistantConfirmationPolicy(value: string | undefined): HomeAssistantConfirmationPolicy {
  if (value === "alwaysConfirm" || value === "highRiskOnly") return value;
  return "trustedLights";
}

function normalizeWakeWordMode(value: string): WakeWordMode {
  return value === "local" ? "local" : "off";
}

function normalizeVoiceMatchMode(value: string | undefined): VoiceMatchMode {
  if (value === "knownUsers" || value === "ownerOnly") return value;
  return "off";
}

function normalizeVoiceMatchSensitivity(value: string | undefined): VoiceMatchSensitivity {
  if (value === "relaxed" || value === "strict") return value;
  return "balanced";
}

function normalizeKnownUserProfiles(users: KnownUserProfile[]): KnownUserProfile[] {
  return users.map((user) => {
    const facePoseSamples = normalizeFacePoseSamples(user.facePoseSamples);
    const poseImages = faceSamplesFromPoseMap(facePoseSamples);
    return {
      id: String(user.id || `user-${Date.now().toString(36)}`),
      name: String(user.name || "").slice(0, 80),
      relationship: String(user.relationship || "").slice(0, 80),
      faceSamples: (Array.isArray(user.faceSamples) ? user.faceSamples.map(String) : poseImages).slice(-REQUIRED_FACE_POSE_COUNT),
      facePoseSamples,
      voicePrints: Array.isArray(user.voicePrints)
        ? user.voicePrints.map((sample) => ({
          id: String(sample.id || `voice-${Date.now().toString(36)}`),
          features: Array.isArray(sample.features) ? sample.features.map(Number).filter(Number.isFinite).slice(0, 96) : [],
          quality: clampUnit(Number(sample.quality), 0),
          createdAt: String(sample.createdAt || new Date().toISOString())
        })).filter((sample) => sample.features.length > 0).slice(-8)
        : [],
      recognitionEnabled: user.recognitionEnabled === true,
      createdAt: String(user.createdAt || new Date().toISOString()),
      updatedAt: String(user.updatedAt || new Date().toISOString())
    };
  }).filter((user) => user.name).slice(0, 12);
}

function identityReadinessSummary(): SynraIdentitySummary {
  const users = state.companionSettings.knownUsers.map((user) => ({
    id: user.id,
    name: user.name,
    relationship: user.relationship,
    recognitionEnabled: user.recognitionEnabled,
    readiness: identityReadinessForUser(user)
  }));
  return {
    readyUserCount: users.filter((user) => user.recognitionEnabled && user.readiness.overallReady).length,
    enrolledUserCount: users.filter((user) => user.recognitionEnabled && (user.readiness.faceSampleCount > 0 || user.readiness.voiceSampleCount > 0)).length,
    users
  };
}

function identityReadinessLabel(readiness: SynraIdentityReadiness): string {
  if (readiness.overallReady) return "Face and voice ready";
  const face = readiness.faceReady
    ? "face ready"
    : `face ${readiness.faceSampleCount}/${readiness.requiredFacePoseCount}`;
  const voice = readiness.voiceReady
    ? "voice ready"
    : `voice ${readiness.voiceSampleCount}/${readiness.requiredVoiceSampleCount}`;
  return `${face} · ${voice}`;
}

function normalizeScreenTimeout(value: string | number): ScreenTimeoutMinutes {
  const numeric = Number(value);
  return numeric === 10 || numeric === 15 || numeric === 30 || numeric === 60 ? numeric : 0;
}

function screenTimeoutLabel(minutes: ScreenTimeoutMinutes): string {
  if (minutes === 0) return "Never";
  if (minutes === 60) return "1 hour";
  return `${minutes} minutes`;
}

function speechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  return (
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition
  );
}

function canUseServerTranscription(): boolean {
  return Boolean(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof window.MediaRecorder === "function" &&
    state.voiceSettings.elevenLabsApiKey
  );
}

function serverTranscriptionBackoffActive(now = Date.now()): boolean {
  return serverTranscriptionDisabledUntil > now;
}

function recordServerTranscriptionSuccess(): void {
  serverTranscriptionFailureCount = 0;
  serverTranscriptionDisabledUntil = 0;
  serverTranscriptionStatus = "ready";
}

function recordServerTranscriptionFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error || "Server transcription failed.");
  serverTranscriptionFailureCount += 1;
  wakeWordLastError = message.slice(0, 120);
  if (serverTranscriptionFailureCount >= 2) {
    serverTranscriptionDisabledUntil = Date.now() + 120_000;
    serverTranscriptionStatus = "degraded";
  } else {
    serverTranscriptionStatus = "unavailable";
  }
}

function canUseHealthyServerTranscription(): boolean {
  return canUseServerTranscription() && !serverTranscriptionBackoffActive();
}

function shouldUseServerTranscriptionForCommand(): boolean {
  return canUseHealthyServerTranscription() && state.voiceSettings.provider === "elevenLabs";
}

function shouldUseServerTranscriptionForWake(): boolean {
  const voiceMatchNeedsServerStt = state.companionSettings.voiceMatchMode !== "off";
  const speechOutputNeedsServerStt = state.voiceSettings.provider === "elevenLabs";
  return canUseHealthyServerTranscription() && (voiceMatchNeedsServerStt || speechOutputNeedsServerStt);
}

function refreshCompanionPresence(): void {
  settingsScreenTimeoutStatusEl.textContent = screenTimeoutLabel(state.companionSettings.screenTimeoutMinutes);
  micAlwaysListeningStatusEl.textContent = state.companionSettings.wakeWordMode === "local" && state.companionSettings.allowAlwaysListening
    ? "Mic always listening"
    : "Mic always listening off";
  if (state.companionSettings.wakeWordMode === "local" && state.companionSettings.allowAlwaysListening) {
    if (micInteractionActive) updateWakeWordStatus("Wake word paused");
    else void startWakeWordListening();
  } else {
    stopWakeWordListening("Wake word off");
  }
  void syncKioskScreenTimeout();
  renderKnownUsers();
}

async function syncKioskScreenTimeout(): Promise<void> {
  try {
    await window.synraKiosk?.setScreenTimeout?.(state.companionSettings.screenTimeoutMinutes);
  } catch {
    // Browser mode cannot manage the display; the setting is still saved for Electron.
  }
}

async function startWakeWordListening(): Promise<void> {
  const phrase = (state.companionSettings.wakePhrase || DEFAULT_WAKE_PHRASE).toLowerCase();
  if (micInteractionActive) {
    updateWakeWordStatus("Wake word paused");
    return;
  }
  if (activeRecognition) {
    updateWakeWordStatus("Wake word paused");
    return;
  }
  if (wakeWordRecognition) {
    updateWakeWordStatus(`Listening for ${state.companionSettings.wakePhrase || DEFAULT_WAKE_PHRASE}`);
    return;
  }
  if (state.companionSettings.voiceMatchMode !== "off") {
    if (canUseHealthyServerTranscription()) {
      startServerWakeWordListening(phrase);
      return;
    }
    updateWakeWordStatus("Voice Match needs healthy speech-to-text");
    return;
  }
  if (shouldUseServerTranscriptionForWake()) {
    startServerWakeWordListening(phrase);
    return;
  }
  const SpeechRecognitionCtor = speechRecognitionConstructor();
  if (!SpeechRecognitionCtor) {
    if (canUseHealthyServerTranscription()) {
      startServerWakeWordListening(phrase);
      return;
    }
    updateWakeWordStatus("Wake word unavailable");
    return;
  }
  const micReady = await ensureMicrophoneReady();
  if (!micReady) {
    updateWakeWordStatus("Wake word needs mic permission");
    return;
  }
  const recognition = new SpeechRecognitionCtor();
  wakeWordRecognition = recognition;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.onstart = () => updateWakeWordStatus(`Listening for ${state.companionSettings.wakePhrase || DEFAULT_WAKE_PHRASE}`);
  recognition.onerror = () => {
    wakeWordRecognition = null;
    updateWakeWordStatus("Wake word paused");
  };
  recognition.onend = () => {
    if (wakeWordRecognition === recognition) {
      wakeWordRecognition = null;
      if (state.companionSettings.wakeWordMode === "local" && state.companionSettings.allowAlwaysListening) {
        window.setTimeout(() => void startWakeWordListening(), 650);
      }
    }
  };
  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const latest = event.results[event.results.length - 1]?.[0]?.transcript?.trim() ?? "";
    void handleWakeWordTranscript(latest, phrase);
  };
  recognition.start();
}

function handleWakeWordTranscript(transcript: string, phrase: string, matchedUser?: KnownUserProfile): boolean {
  const command = extractWakeWordCommand(transcript, phrase);
  if (command === null) return false;
  void window.synraKiosk?.wakeDisplay?.();
  updateWakeWordStatus("Awake");
  stopWakeWordListening("Awake");
  if (command) {
    setSynraState("thinking", "Heard wake command.");
    void handleUserText(command);
    return true;
  }
  greetAfterWakeWord(matchedUser?.name);
  window.setTimeout(() => void startCommandListeningAfterWakeWord(), Math.max(900, estimateSpeechDurationMs(wakeGreetingText(matchedUser?.name)) + 220));
  return true;
}

function extractWakeWordCommand(transcript: string, phrase: string): string | null {
  for (const alias of wakePhraseAliases(phrase)) {
    const cleanedAlias = alias.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\W+");
    if (!cleanedAlias) continue;
    const match = transcript.match(new RegExp(`\\b${cleanedAlias}\\b`, "i"));
    if (!match || match.index === undefined) continue;
    return transcript
      .slice(match.index + match[0].length)
      .replace(/^[\s,.:;!?-]+/, "")
      .trim();
  }

  const tokens = normalizedWakeTokens(transcript);
  for (let index = 0; index < tokens.length; index += 1) {
    if (!["hello", "hey", "hi"].includes(tokens[index] ?? "")) continue;
    const nextToken = tokens[index + 1] ?? "";
    const followingToken = tokens[index + 2] ?? "";
    if (isLikelyWakeToken(nextToken) || (nextToken.length <= 2 && isLikelyWakeToken(followingToken))) {
      return tokens.slice(isLikelyWakeToken(nextToken) ? index + 2 : index + 3).join(" ").trim();
    }
  }
  return null;
}

function verifyWakeSpeaker(voicePrint: VoicePrintSample | undefined): VoiceMatchResult {
  const mode = normalizeVoiceMatchMode(state.companionSettings.voiceMatchMode);
  if (mode === "off") return { allowed: true, reason: "Voice Match off" };
  const enrolledUsers = voiceMatchEligibleUsers(mode);
  const enrolledPrintCount = enrolledUsers.reduce((count, user) => count + (user.voicePrints?.length ?? 0), 0);
  if (enrolledPrintCount === 0) {
    wakeWordLastError = "Voice Match needs enrollment";
    return { allowed: true, reason: "Voice Match needs enrollment" };
  }
  if (!voicePrint) {
    return { allowed: false, reason: "Voice Match could not read the speaker" };
  }
  const threshold = VOICE_MATCH_THRESHOLDS[normalizeVoiceMatchSensitivity(state.companionSettings.voiceMatchSensitivity)];
  let bestUser: KnownUserProfile | undefined;
  let bestScore = -1;
  for (const user of enrolledUsers) {
    for (const savedPrint of user.voicePrints ?? []) {
      const score = cosineSimilarity(voicePrint.features, savedPrint.features);
      if (score > bestScore) {
        bestScore = score;
        bestUser = user;
      }
    }
  }
  if (bestUser && bestScore >= threshold) {
    return { allowed: true, user: bestUser, score: bestScore, reason: `Voice matched ${bestUser.name}` };
  }
  return { allowed: false, score: bestScore, reason: "Ignored unknown voice" };
}

function voiceMatchEligibleUsers(mode: VoiceMatchMode): KnownUserProfile[] {
  const users = state.companionSettings.knownUsers.filter((user) => user.recognitionEnabled && (user.voicePrints?.length ?? 0) > 0);
  if (mode !== "ownerOnly") return users;
  const ownerName = (state.companionSettings.ownerName || state.memory.preferredName || "").trim().toLowerCase();
  return users.filter((user, index) => {
    const name = user.name.trim().toLowerCase();
    const relationship = user.relationship.trim().toLowerCase();
    return relationship.includes("owner") || (ownerName ? name === ownerName : index === 0);
  });
}

function wakePhraseAliases(phrase: string): string[] {
  const base = phrase.trim() || DEFAULT_WAKE_PHRASE;
  const aliases = [
    base,
    "hello synra",
    "hello syna",
    "hello sinra",
    "hello syra",
    "hello cynra",
    "hello cindra",
    "hello senra",
    "hello sierra",
    "hello sarah",
    "hello sandra",
    "hello synara",
    "hello senora",
    "hello sinner",
    "hello zena",
    "hello zina",
    "hello center",
    "hey synra",
    "hi synra"
  ];
  return [...new Set(aliases.map((alias) => alias.toLowerCase().replace(/\s+/g, " ").trim()).filter(Boolean))];
}

function normalizedWakeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function isLikelyWakeToken(token: string): boolean {
  if (!token) return false;
  const normalized = token.toLowerCase();
  const known = new Set(["synra", "syna", "sinra", "syra", "cynra", "cindra", "senra", "sierra", "sarah", "synrah", "synara", "sandra", "senora", "sinner", "zena", "zina", "center"]);
  if (known.has(normalized)) return true;
  return levenshteinDistance(normalized, "synra") <= 1;
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex] ?? 0;
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      previous[rightIndex] = Math.min(
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + 1,
        diagonal + cost
      );
      diagonal = above;
    }
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function wakeGreetingText(preferredUserName = ""): string {
  const preferred = preferredUserName || state.companionSettings.ownerName || state.memory.preferredName || state.companionSettings.knownUsers[0]?.name || "";
  return preferred ? `Hello ${preferred}. I am listening.` : "Hello. I am listening.";
}

function greetAfterWakeWord(preferredUserName = ""): void {
  const greeting = wakeGreetingText(preferredUserName);
  pushMessage("synra", greeting);
  setSynraState("speaking", greeting);
  speak(greeting);
}

async function startCommandListeningAfterWakeWord(): Promise<void> {
  if (state.synra === "thinking") return;
  if (state.synra === "speaking") {
    window.setTimeout(() => void startCommandListeningAfterWakeWord(), 350);
    return;
  }
  if (shouldUseServerTranscriptionForCommand()) {
    await startServerTranscriptionListening({
      durationMs: 12000,
      minRms: 0.008,
      prompt: "Listening for your command.",
      emptyCaption: "I did not catch a command after the wake word."
    });
    return;
  }
  await startListening();
}

function stopWakeWordListening(status = "Wake word off"): void {
  serverWakeWordActive = false;
  wakeWordMicActive = false;
  if (serverWakeWordTimer) {
    window.clearTimeout(serverWakeWordTimer);
    serverWakeWordTimer = 0;
  }
  if (wakeWordRecognition) {
    try {
      wakeWordRecognition.abort?.();
      wakeWordRecognition.stop?.();
    } catch {
      // Chromium can throw if recognition is already stopped.
    }
    wakeWordRecognition = null;
  }
  updateWakeWordStatus(status);
}

function updateWakeWordStatus(status: string): void {
  state.wakeWordStatus = status;
  wakeWordStatusEl.textContent = status;
  micAlwaysListeningStatusEl.textContent = state.companionSettings.wakeWordMode === "local" && state.companionSettings.allowAlwaysListening
    ? wakeWordMicActive ? "Wake mic active" : "Wake mic armed"
    : "Mic always listening off";
  startWakeWordButton.textContent = state.companionSettings.wakeWordMode === "local" && state.companionSettings.allowAlwaysListening ? "Restart Wake Word" : "Start Wake Word";
}

function selectedAudioConstraints(): boolean | MediaTrackConstraints {
  const deviceId = state.companionSettings.preferredMicrophoneId?.trim();
  const base: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  };
  return deviceId ? { ...base, deviceId: { exact: deviceId } } : base;
}

function selectedVideoConstraints(): boolean | MediaTrackConstraints {
  const deviceId = state.companionSettings.preferredCameraId?.trim();
  return deviceId ? { deviceId: { exact: deviceId } } : true;
}

async function openSelectedMicrophoneStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: selectedAudioConstraints(), video: false });
  } catch (error) {
    if (!state.companionSettings.preferredMicrophoneId) throw error;
    mediaDeviceStatusEl.textContent = "Selected microphone was unavailable. Falling back to system default.";
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }
}

async function openSelectedCameraStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: false, video: selectedVideoConstraints() });
  } catch (error) {
    if (!state.companionSettings.preferredCameraId) throw error;
    mediaDeviceStatusEl.textContent = "Selected camera was unavailable. Falling back to system default.";
    return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
  }
}

async function refreshMediaDeviceInputs(options: { requestPermission?: boolean } = {}): Promise<void> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    mediaDeviceStatusEl.textContent = "This browser cannot list microphones or cameras.";
    return;
  }

  const temporaryStreams: MediaStream[] = [];
  refreshMediaDevicesButton.disabled = true;
  try {
    if (options.requestPermission && navigator.mediaDevices.getUserMedia) {
      for (const constraints of [{ audio: true, video: false }, { audio: false, video: true }] as MediaStreamConstraints[]) {
        try {
          temporaryStreams.push(await navigator.mediaDevices.getUserMedia(constraints));
        } catch {
          // One missing device should not prevent the other device list from loading.
        }
      }
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((device) => device.kind === "audioinput");
    const videoInputs = devices.filter((device) => device.kind === "videoinput");
    populateMediaDeviceSelect(microphoneDeviceInput, audioInputs, "System default microphone", state.companionSettings.preferredMicrophoneId);
    populateMediaDeviceSelect(cameraDeviceInput, videoInputs, "System default camera", state.companionSettings.preferredCameraId);
    const micLabel = selectedDeviceLabel(microphoneDeviceInput, "system default mic");
    const cameraLabel = selectedDeviceLabel(cameraDeviceInput, "system default camera");
    mediaDeviceStatusEl.textContent = `Using ${micLabel} and ${cameraLabel}.`;
  } catch {
    mediaDeviceStatusEl.textContent = "Microphone and camera list is blocked. Click Refresh Mic / Camera to grant access.";
  } finally {
    for (const stream of temporaryStreams) {
      for (const track of stream.getTracks()) track.stop();
    }
    refreshMediaDevicesButton.disabled = false;
  }
}

function populateMediaDeviceSelect(select: HTMLSelectElement, devices: MediaDeviceInfo[], defaultLabel: string, selectedId: string): void {
  const saved = selectedId.trim();
  select.innerHTML = "";
  select.append(new Option(defaultLabel, ""));
  devices.forEach((device, index) => {
    const fallbackLabel = device.kind === "audioinput" ? `Microphone ${index + 1}` : `Camera ${index + 1}`;
    select.append(new Option(device.label || fallbackLabel, device.deviceId));
  });
  if (saved && !devices.some((device) => device.deviceId === saved)) {
    select.append(new Option("Saved device unavailable", saved));
  }
  select.value = saved;
}

function selectedDeviceLabel(select: HTMLSelectElement, fallback: string): string {
  return select.selectedOptions[0]?.textContent?.trim() || fallback;
}

function startServerWakeWordListening(phrase: string): void {
  if (serverWakeWordActive) {
    updateWakeWordStatus("Wake mic armed");
    return;
  }
  serverWakeWordActive = true;
  wakeWordLastError = "";
  updateWakeWordStatus("Wake mic armed");

  const listenOnce = async (): Promise<void> => {
    if (!serverWakeWordActive || state.companionSettings.wakeWordMode !== "local" || !state.companionSettings.allowAlwaysListening) return;
    if (micInteractionActive || activeRecognition || state.synra === "speaking" || state.synra === "thinking") {
      wakeWordMicActive = false;
      updateWakeWordStatus("Wake word paused");
      scheduleServerWakeWordTick(900, listenOnce);
      return;
    }
    try {
      wakeWordMicActive = true;
      updateWakeWordStatus(`Listening for ${state.companionSettings.wakePhrase || DEFAULT_WAKE_PHRASE}`);
      const result = await recordAndTranscribeMicrophone({ durationMs: 5200, minRms: 0.002 });
      wakeWordMicActive = false;
      recordServerTranscriptionSuccess();
      const heard = result.text.trim();
      if (heard) {
        wakeWordLastHeard = heard.slice(0, 80);
        wakeWordLastError = "";
      }
      const wakeCommand = heard ? extractWakeWordCommand(heard, phrase) : null;
      if (wakeCommand !== null) {
        const matchedSpeaker = verifyWakeSpeaker(result.voicePrint);
        if (!matchedSpeaker.allowed) {
          wakeWordLastError = matchedSpeaker.reason;
          updateWakeWordStatus(matchedSpeaker.reason);
          scheduleServerWakeWordTick(1100, listenOnce);
          return;
        }
        if (handleWakeWordTranscript(heard, phrase, matchedSpeaker.user)) {
          return;
        }
      }
      if (heard && handleWakeWordTranscript(heard, phrase)) {
        return;
      }
      updateWakeWordStatus("Wake mic armed");
    } catch (error) {
      wakeWordMicActive = false;
      recordServerTranscriptionFailure(error);
      const message = error instanceof Error ? error.message : "microphone capture failed";
      updateWakeWordStatus(`Wake word mic error: ${message}`);
      if (serverTranscriptionBackoffActive() && speechRecognitionConstructor()) {
        serverWakeWordActive = false;
        updateWakeWordStatus("Wake word using browser speech");
        window.setTimeout(() => void startWakeWordListening(), 350);
        return;
      }
    }
    if (serverWakeWordActive) scheduleServerWakeWordTick(850, listenOnce);
  };

  scheduleServerWakeWordTick(150, listenOnce);
}

function scheduleServerWakeWordTick(delayMs: number, callback: () => void): void {
  if (serverWakeWordTimer) window.clearTimeout(serverWakeWordTimer);
  serverWakeWordTimer = window.setTimeout(callback, delayMs);
}

const voiceEnrollmentPhrases = [
  "Hello Synra, this is my voice.",
  "Synra, verify my voice for this device.",
  "Hello Synra, I am ready to begin."
];
const identityWizardStages: IdentityWizardStage[] = ["overview", "face", "voice", "summary"];

function wizardEnrollmentCounts(existing = currentEnrollmentUser()): { faceCount: number; voiceCount: number } {
  const savedFaceSamples = normalizeFacePoseSamples(existing?.facePoseSamples);
  return {
    faceCount: FACE_ENROLLMENT_POSES.filter((pose) => savedFaceSamples[pose] || pendingFacePoseSamples[pose]).length,
    voiceCount: Math.min((existing?.voicePrints?.length ?? 0) + pendingVoicePrints.length, REQUIRED_VOICE_SAMPLE_COUNT)
  };
}

function wizardReadinessText(): string {
  const { faceCount, voiceCount } = wizardEnrollmentCounts();
  return `Face ${Math.min(faceCount, REQUIRED_FACE_POSE_COUNT)}/${REQUIRED_FACE_POSE_COUNT} · Voice ${voiceCount}/${REQUIRED_VOICE_SAMPLE_COUNT}`;
}

async function openIdentityWizard(): Promise<void> {
  const existingName = knownUserNameInput.value.trim() || state.companionSettings.ownerName || state.memory.preferredName || "";
  const existingUser = state.companionSettings.knownUsers.find((user) => user.name.toLowerCase() === existingName.toLowerCase());
  identityWizardOwnerNameInput.value = existingName;
  identityWizardRelationshipInput.value = knownUserRelationshipInput.value.trim() || existingUser?.relationship || (existingName ? "Owner" : "");
  knownUserNameInput.value = identityWizardOwnerNameInput.value;
  knownUserRelationshipInput.value = identityWizardRelationshipInput.value;
  faceRecognitionInput.value = "on";
  faceSampleStorageInput.value = "on";
  if (voiceMatchModeInput.value === "off") voiceMatchModeInput.value = "knownUsers";
  identityWizardVoiceSignal = { level: 0, isolation: 0, noise: 0 };
  setIdentityWizardStage("overview");
  if (!identityEnrollmentWizard.open) identityEnrollmentWizard.showModal();
  refreshIdentityEnrollmentPanel();
  renderIdentityWizard();
}

function setIdentityWizardStage(stage: IdentityWizardStage): void {
  identityWizardStage = stage;
  if (stage === "face") {
    void startIdentityWizardCameraPreview();
  } else {
    stopIdentityWizardCameraPreview();
  }
  renderIdentityWizard();
}

function renderIdentityWizard(): void {
  const existing = currentEnrollmentUser();
  const selectedPose = nextMissingFacePose(existing);
  const { faceCount, voiceCount } = wizardEnrollmentCounts(existing);
  const stages = [...identityEnrollmentWizard.querySelectorAll<HTMLElement>(".identity-wizard-stage")];
  for (const stage of stages) stage.hidden = stage.dataset.stage !== identityWizardStage;
  const stepMap: Record<IdentityWizardStage, HTMLElement> = {
    overview: identityWizardOverviewStep,
    face: identityWizardFaceStep,
    voice: identityWizardVoiceStep,
    summary: identityWizardSummaryStep
  };
  for (const [stage, element] of Object.entries(stepMap) as Array<[IdentityWizardStage, HTMLElement]>) {
    const index = identityWizardStages.indexOf(stage);
    element.classList.toggle("active", stage === identityWizardStage);
    element.classList.toggle("complete", index < identityWizardStages.indexOf(identityWizardStage));
  }

  identityWizardReadiness.textContent = wizardReadinessText();
  identityFacePoseTitle.textContent = FACE_ENROLLMENT_POSE_LABELS[selectedPose];
  identityFacePoseInstruction.textContent = FACE_ENROLLMENT_POSE_INSTRUCTIONS[selectedPose];
  facePoseInput.value = selectedPose;
  identityFacePoseDots.innerHTML = FACE_ENROLLMENT_POSES.map((pose) => {
    const saved = normalizeFacePoseSamples(existing?.facePoseSamples)[pose];
    const complete = Boolean(saved || pendingFacePoseSamples[pose]);
    const active = pose === selectedPose && !complete;
    return `<span class="${complete ? "complete" : ""} ${active ? "active" : ""}" title="${escapeHtml(FACE_ENROLLMENT_POSE_LABELS[pose])}"></span>`;
  }).join("");

  const phraseIndex = Math.min(voiceCount, voiceEnrollmentPhrases.length - 1);
  identityVoiceSampleLabel.textContent = `Voice sample ${Math.min(voiceCount + 1, REQUIRED_VOICE_SAMPLE_COUNT)} of ${REQUIRED_VOICE_SAMPLE_COUNT}`;
  identityVoicePhrase.textContent = voiceEnrollmentPhrases[phraseIndex];
  updateIdentityWizardVoiceMeters(identityWizardVoiceSignal);
  identityWizardFaceSummary.textContent = `${Math.min(faceCount, REQUIRED_FACE_POSE_COUNT)}/${REQUIRED_FACE_POSE_COUNT} poses`;
  identityWizardVoiceSummary.textContent = `${voiceCount}/${REQUIRED_VOICE_SAMPLE_COUNT} samples`;
  identityWizardFinalSummary.textContent = faceCount >= REQUIRED_FACE_POSE_COUNT && voiceCount >= REQUIRED_VOICE_SAMPLE_COUNT
    ? "Recognition ready"
    : "Enrollment needs more samples";
  identityWizardTitle.textContent = {
    overview: "Set up recognition",
    face: "Enroll your face",
    voice: "Enroll your voice",
    summary: "Review identity"
  }[identityWizardStage];
  identityWizardStatus.textContent = {
    overview: "Create a local known-user profile for Synra.",
    face: `${FACE_ENROLLMENT_POSE_LABELS[selectedPose]}: ${FACE_ENROLLMENT_POSE_INSTRUCTIONS[selectedPose]}`,
    voice: `Say: ${voiceEnrollmentPhrases[phraseIndex]}`,
    summary: wizardReadinessText()
  }[identityWizardStage];
  identityFaceRing.classList.toggle("ready", faceCount >= REQUIRED_FACE_POSE_COUNT);
  identityFaceRing.classList.toggle("needs-work", faceCount < REQUIRED_FACE_POSE_COUNT);
  identityWizardBackButton.disabled = identityWizardStage === "overview";
  identityWizardNextButton.hidden = identityWizardStage === "summary";
  identityWizardDoneButton.hidden = identityWizardStage !== "summary";
  identityWizardCaptureFaceButton.textContent = faceCount >= REQUIRED_FACE_POSE_COUNT ? "Recapture Face Pose" : "Capture Face Pose";
  identityWizardCaptureVoiceButton.textContent = voiceCount >= REQUIRED_VOICE_SAMPLE_COUNT ? "Recapture Voice Sample" : "Record Voice Sample";
  refreshIdentityEnrollmentPanel();
}

function retreatIdentityWizard(): void {
  const index = Math.max(0, identityWizardStages.indexOf(identityWizardStage) - 1);
  setIdentityWizardStage(identityWizardStages[index]);
}

async function advanceIdentityWizard(): Promise<void> {
  if (identityWizardStage === "overview") {
    const name = identityWizardOwnerNameInput.value.trim();
    if (!name) {
      identityWizardStatus.textContent = "Enter the person's name before enrollment.";
      identityWizardOwnerNameInput.focus();
      return;
    }
    knownUserNameInput.value = name;
    knownUserRelationshipInput.value = identityWizardRelationshipInput.value.trim();
    setIdentityWizardStage("face");
    return;
  }
  const { faceCount, voiceCount } = wizardEnrollmentCounts();
  if (identityWizardStage === "face" && faceCount < REQUIRED_FACE_POSE_COUNT) {
    identityWizardStatus.textContent = "Capture each guided face pose before voice enrollment.";
    return;
  }
  if (identityWizardStage === "voice" && voiceCount < REQUIRED_VOICE_SAMPLE_COUNT) {
    identityWizardStatus.textContent = "Record all three voice samples before review.";
    return;
  }
  const index = Math.min(identityWizardStages.length - 1, identityWizardStages.indexOf(identityWizardStage) + 1);
  setIdentityWizardStage(identityWizardStages[index]);
}

async function startIdentityWizardCameraPreview(): Promise<void> {
  if (identityWizardPreviewStream || !identityEnrollmentWizard.open) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    identityWizardStatus.textContent = "Camera capture is not available in this browser.";
    return;
  }
  try {
    identityWizardPreviewStream = await openSelectedCameraStream();
    identityFacePreview.srcObject = identityWizardPreviewStream;
    await identityFacePreview.play();
  } catch {
    identityWizardStatus.textContent = "Face setup needs camera permission.";
  }
}

function stopIdentityWizardCameraPreview(): void {
  if (!identityWizardPreviewStream) return;
  for (const track of identityWizardPreviewStream.getTracks()) track.stop();
  identityWizardPreviewStream = null;
  identityFacePreview.srcObject = null;
}

function captureFacePoseFrame(video: HTMLVideoElement, width = 480, height = 360): { dataUrl: string; faceQuality: ReturnType<typeof evaluateFaceFrameQuality> } {
  const canvasElement = document.createElement("canvas");
  canvasElement.width = width;
  canvasElement.height = height;
  const context = canvasElement.getContext("2d");
  if (!context) throw new Error("Face sample capture is not available.");
  context.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
  const faceQuality = evaluateFaceFrameQuality(context.getImageData(0, 0, canvasElement.width, canvasElement.height));
  return { dataUrl: canvasElement.toDataURL("image/jpeg", 0.82), faceQuality };
}

async function captureIdentityWizardFacePose(): Promise<void> {
  if (!state.companionSettings.allowFaceSampleStorage && faceSampleStorageInput.value !== "on") {
    faceSampleStorageInput.value = "on";
  }
  identityWizardCaptureFaceButton.disabled = true;
  identityFaceRing.classList.add("capturing");
  try {
    if (!identityWizardPreviewStream) await startIdentityWizardCameraPreview();
    await new Promise((resolve) => window.setTimeout(resolve, 260));
    if (!identityFacePreview.videoWidth) throw new Error("Camera preview is not ready.");
    const pose = selectedFacePose();
    const capture = captureFacePoseFrame(identityFacePreview);
    const faceQuality = capture.faceQuality;
    identityFaceQualityStatus.textContent = `${faceQuality.message} Quality ${Math.round(faceQuality.score * 100)}%.`;
    if (!faceQuality.accepted) {
      setSynraState("idle", faceQuality.message);
      return;
    }
    pendingFacePoseSamples = { ...pendingFacePoseSamples, [pose]: capture.dataUrl };
    const { faceCount, voiceCount } = wizardEnrollmentCounts();
    await syncStationIdentityCounts({ faceSampleCount: faceCount, voiceSampleCount: voiceCount });
    facePoseInput.value = nextMissingFacePose(currentEnrollmentUser());
    setSynraState("idle", `${FACE_ENROLLMENT_POSE_LABELS[pose]} face pose captured locally.`);
  } catch (error) {
    identityWizardStatus.textContent = error instanceof Error ? error.message : "Face sample capture needs camera permission.";
    setSynraState("idle", "Face sample capture needs camera permission.");
  } finally {
    identityFaceRing.classList.remove("capturing");
    identityWizardCaptureFaceButton.disabled = false;
    renderIdentityWizard();
  }
}

async function captureIdentityWizardVoiceSample(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
    identityWizardStatus.textContent = "Voice Match capture is not available in this browser.";
    return;
  }
  identityWizardCaptureVoiceButton.disabled = true;
  const phrase = voiceEnrollmentPhrases[Math.min(wizardEnrollmentCounts().voiceCount, voiceEnrollmentPhrases.length - 1)];
  setSynraState("listening", `Say: ${phrase}`);
  try {
    identityWizardVoiceSignal = { level: 0, isolation: 0, noise: 0 };
    updateIdentityWizardVoiceMeters(identityWizardVoiceSignal);
    const capture = await recordMicrophoneBlob({
      durationMs: 4200,
      minRms: 0.003,
      onSignal: updateIdentityWizardVoiceMeters
    });
    const voicePrint = await createVoicePrintFromBlob(capture.blob);
    const voiceQuality = evaluateVoiceEnrollmentQuality({
      peakRms: capture.peakRms,
      signal: capture.signal,
      voicePrintQuality: voicePrint.quality
    });
    identityWizardVoiceSignal = {
      level: Math.max(identityWizardVoiceSignal.level, Math.min(1, capture.peakRms * 30)),
      isolation: voicePrint.quality,
      noise: voiceQuality.noise
    };
    updateIdentityWizardVoiceMeters(identityWizardVoiceSignal);
    identityVoiceQualityStatus.textContent = `${voiceQuality.message} Quality ${Math.round(voiceQuality.score * 100)}%.`;
    if (!voiceQuality.accepted) {
      setSynraState("idle", voiceQuality.message);
      return;
    }
    pendingVoicePrints = [...pendingVoicePrints, voicePrint].slice(-REQUIRED_VOICE_SAMPLE_COUNT);
    const { faceCount, voiceCount } = wizardEnrollmentCounts();
    await syncStationIdentityCounts({ faceSampleCount: faceCount, voiceSampleCount: voiceCount });
    setSynraState("idle", `Voice sample ${wizardEnrollmentCounts().voiceCount}/${REQUIRED_VOICE_SAMPLE_COUNT} captured locally.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice Match capture needs microphone permission.";
    identityWizardStatus.textContent = message;
    setSynraState("idle", message);
  } finally {
    identityWizardCaptureVoiceButton.disabled = false;
    renderIdentityWizard();
  }
}

function updateIdentityWizardVoiceMeters(signal: { level: number; isolation: number; noise: number } | MicrophoneSignal): void {
  const level = "levelScore" in signal ? signal.levelScore : signal.level;
  const isolation = "voiceIsolationScore" in signal ? signal.voiceIsolationScore : signal.isolation;
  const noise = "backgroundNoiseScore" in signal ? signal.backgroundNoiseScore : signal.noise;
  identityWizardVoiceSignal = { level, isolation, noise };
  identityVoiceLevelMeter.style.width = `${Math.round(clampUnit(level, 0) * 100)}%`;
  identityVoiceIsolationMeter.style.width = `${Math.round(clampUnit(isolation, 0) * 100)}%`;
  identityVoiceNoiseMeter.style.width = `${Math.round(clampUnit(noise, 0) * 100)}%`;
}

function selectedFacePose(): SynraFacePose {
  return FACE_ENROLLMENT_POSES.includes(facePoseInput.value as SynraFacePose) ? facePoseInput.value as SynraFacePose : "center";
}

function pendingFacePoseCount(): number {
  return faceSamplesFromPoseMap(pendingFacePoseSamples).length;
}

function nextMissingFacePose(existing?: KnownUserProfile): SynraFacePose {
  const savedSamples = normalizeFacePoseSamples(existing?.facePoseSamples);
  return FACE_ENROLLMENT_POSES.find((pose) => !pendingFacePoseSamples[pose] && !savedSamples[pose]) ?? "center";
}

function currentEnrollmentUser(): KnownUserProfile | undefined {
  const name = knownUserNameInput.value.trim().toLowerCase();
  if (!name) return undefined;
  return state.companionSettings.knownUsers.find((user) => user.name.toLowerCase() === name);
}

function setRecognitionDeviceChip(chip: HTMLElement, status: string, active: boolean): void {
  const statusNode = chip.querySelector("strong");
  if (statusNode) statusNode.textContent = status;
  chip.classList.toggle("is-ready", active);
  chip.classList.toggle("is-waiting", !active);
}

function proofRouteLabel(value: boolean): string {
  return value ? "Ready" : "Offline";
}

function proofSyncLabel(state: EnrollmentProofSyncState): string {
  if (state === "pending") return "Checking";
  if (state === "confirmed") return "Synced";
  if (state === "failed") return "Failed";
  if (state === "degraded") return "Degraded";
  return "Not Tested";
}

function proofCountLabel(count: number, target: number, acceptedAt: string | null): string {
  const safeTarget = Math.max(1, Math.floor(target));
  const safeCount = Math.max(0, Math.min(Math.floor(count), safeTarget));
  if (acceptedAt && safeCount >= safeTarget) return `${safeCount}/${safeTarget} ready`;
  if (acceptedAt) return `${safeCount}/${safeTarget} saved`;
  return `${safeCount}/${safeTarget}`;
}

function enrollmentProofConfirmedCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function enrollmentProofCountsFromHealth(health: { identitySmoke?: unknown }): { faceSampleCount: number; voiceSampleCount: number } | null {
  const smoke = health.identitySmoke as {
    identity?: {
      faceSampleCount?: unknown;
      voiceSampleCount?: unknown;
    };
  } | undefined;
  const confirmedFaceSampleCount = enrollmentProofConfirmedCount(smoke?.identity?.faceSampleCount);
  const confirmedVoiceSampleCount = enrollmentProofConfirmedCount(smoke?.identity?.voiceSampleCount);
  if (confirmedFaceSampleCount === null || confirmedVoiceSampleCount === null) return null;
  return {
    faceSampleCount: confirmedFaceSampleCount,
    voiceSampleCount: confirmedVoiceSampleCount
  };
}

function markEnrollmentProofAccepted(kind: "face" | "voice", acceptedAt = new Date().toISOString()): void {
  if (kind === "face") {
    enrollmentProofState.lastFaceAcceptedAt = acceptedAt;
  } else {
    enrollmentProofState.lastVoiceAcceptedAt = acceptedAt;
  }
  renderEnrollmentProof(state.identityStatus);
}

function failEnrollmentProofSync(message: string, stationAvailable = enrollmentProofState.stationAvailable, syncState: Extract<EnrollmentProofSyncState, "failed" | "degraded"> = "failed"): void {
  enrollmentProofState.stationAvailable = stationAvailable;
  enrollmentProofState.syncState = syncState;
  enrollmentProofState.lastSyncError = message.slice(0, 18);
}

function renderEnrollmentProofWithoutLoweringLocalCounts(): void {
  renderEnrollmentProof(state.identityStatus);
}

function confirmEnrollmentProofSync(health: { identitySmoke?: unknown }, requestedCounts: { faceSampleCount: number; voiceSampleCount: number }): boolean {
  const confirmedCounts = enrollmentProofCountsFromHealth(health);
  if (!confirmedCounts) {
    failEnrollmentProofSync("Bad proof", false);
    return false;
  }
  enrollmentProofState.lastSyncedFaceSampleCount = confirmedCounts.faceSampleCount;
  enrollmentProofState.lastSyncedVoiceSampleCount = confirmedCounts.voiceSampleCount;
  if (confirmedCounts.faceSampleCount < requestedCounts.faceSampleCount || confirmedCounts.voiceSampleCount < requestedCounts.voiceSampleCount) {
    failEnrollmentProofSync("Count lag", true, "degraded");
    renderEnrollmentProofWithoutLoweringLocalCounts();
    return false;
  }
  const stationStatus = identityStatusFromStationHealth(health);
  enrollmentProofState.stationAvailable = true;
  enrollmentProofState.lastHealthAt = stationStatus.generatedAt;
  enrollmentProofState.lastSyncConfirmedAt = new Date().toISOString();
  enrollmentProofState.lastSyncError = null;
  enrollmentProofState.syncState = "confirmed";
  renderSmartRecognition(stationStatus);
  return true;
}

function renderEnrollmentProof(status: SynraIdentityStatus): void {
  const cameraReady = isIdentityDeviceReady(status.cameraDevice) || status.cameraPermission === "ready";
  const micReady = isIdentityDeviceReady(status.microphoneDevice) || status.microphonePermission === "ready";
  const faceCount = Math.min(status.faceSampleCount, status.requiredFacePoseCount);
  const voiceCount = Math.min(status.voiceSampleCount, status.requiredVoiceSampleCount);
  const faceSynced = enrollmentProofState.syncState === "confirmed" && enrollmentProofState.lastSyncedFaceSampleCount >= faceCount;
  const voiceSynced = enrollmentProofState.syncState === "confirmed" && enrollmentProofState.lastSyncedVoiceSampleCount >= voiceCount;
  const syncError = (enrollmentProofState.syncState === "failed" || enrollmentProofState.syncState === "degraded") && enrollmentProofState.lastSyncError
    ? `: ${enrollmentProofState.lastSyncError.slice(0, 18)}`
    : "";

  recognitionProofStationStatus.textContent = proofRouteLabel(enrollmentProofState.stationAvailable);
  recognitionProofCameraStatus.textContent = proofRouteLabel(cameraReady);
  recognitionProofMicStatus.textContent = proofRouteLabel(micReady);
  recognitionProofFaceStatus.textContent = faceSynced
    ? `${faceCount}/${status.requiredFacePoseCount} synced`
    : proofCountLabel(status.faceSampleCount, status.requiredFacePoseCount, enrollmentProofState.lastFaceAcceptedAt);
  recognitionProofVoiceStatus.textContent = voiceSynced
    ? `${voiceCount}/${status.requiredVoiceSampleCount} synced`
    : proofCountLabel(status.voiceSampleCount, status.requiredVoiceSampleCount, enrollmentProofState.lastVoiceAcceptedAt);
  recognitionProofSyncStatus.textContent = `${proofSyncLabel(enrollmentProofState.syncState)}${syncError}`;
}

function updateEnrollmentProofFromStatus(status: SynraIdentityStatus): void {
  const updatedAt = status.generatedAt === defaultIdentityStatus.generatedAt ? new Date().toISOString() : status.generatedAt;
  if (status.readiness.source.startsWith("station:")) {
    enrollmentProofState.stationAvailable = true;
    enrollmentProofState.lastHealthAt = updatedAt;
  }
  if (status.readiness.faceReady) markEnrollmentProofAccepted("face", updatedAt);
  if (status.readiness.voiceReady) markEnrollmentProofAccepted("voice", updatedAt);
  if (enrollmentProofState.syncState === "confirmed") {
    if (status.faceSampleCount > enrollmentProofState.lastSyncedFaceSampleCount || status.voiceSampleCount > enrollmentProofState.lastSyncedVoiceSampleCount) {
      enrollmentProofState.syncState = "degraded";
      enrollmentProofState.lastSyncError = "Count lag";
    }
  }
}

function renderSmartRecognition(status: SynraIdentityStatus = state.identityStatus): void {
  const normalized = normalizeIdentityStatus(status);
  state.identityStatus = normalized;
  const faceReady = normalized.readiness.faceReady;
  const voiceReady = normalized.readiness.voiceReady;
  const trustedReady = normalized.readiness.trustedActionsReady;
  const cameraReady = isIdentityDeviceReady(normalized.cameraDevice);
  const micReady = isIdentityDeviceReady(normalized.microphoneDevice);

  recognitionRuntimeStatus.textContent = trustedReady ? "Owner Verified" : faceReady || voiceReady ? "Ready To Verify" : "Setup Needed";
  recognitionRuntimeConfidence.textContent = `${Math.round(normalized.readiness.confidence * 100)}%`;
  recognitionRuntimeLastVerified.textContent = normalized.readiness.lastVerifiedAt ? new Date(normalized.readiness.lastVerifiedAt).toLocaleString() : "Never";
  recognitionRuntimeSource.textContent = normalized.readiness.source;
  recognitionRuntimeDetail.textContent = normalized.readiness.summary;

  setRecognitionDeviceChip(recognitionDeviceCamera, identityDeviceLabel(normalized.cameraDevice), cameraReady);
  setRecognitionDeviceChip(recognitionDeviceMicrophone, identityDeviceLabel(normalized.microphoneDevice), micReady);
  setRecognitionDeviceChip(recognitionDeviceFaceStorage, normalized.faceSampleCount > 0 ? "Local" : "Empty", normalized.faceSampleCount > 0);
  setRecognitionDeviceChip(recognitionDeviceVoiceMatch, normalized.voiceSampleCount > 0 ? "Owner Only" : "Setup", normalized.voiceSampleCount > 0);
  setRecognitionDeviceChip(recognitionDeviceTrustedControl, trustedReady ? "Trusted" : "Setup", trustedReady);

  recognitionCameraStatusChip.textContent = `Camera: ${identityDeviceLabel(normalized.cameraDevice)}`;
  recognitionMicStatusChip.textContent = `Mic: ${identityDeviceLabel(normalized.microphoneDevice)}`;
  recognitionFaceSetupStatus.textContent = faceReady
    ? `Ready (${normalized.faceSampleCount})`
    : normalized.faceSampleCount > 0
      ? `Training ${Math.round(normalized.face.progress * 100)}%`
      : "Adaptive light";
  recognitionVoiceSetupStatus.textContent = voiceReady
    ? `Ready (${normalized.voiceSampleCount})`
    : normalized.voiceSampleCount > 0
      ? `Training ${Math.round(normalized.voice.progress * 100)}%`
      : "Close mic";
  recognitionFaceCoachTitle.textContent = normalized.face.title;
  recognitionFaceCoachDetail.textContent = normalized.face.detail;
  recognitionVoiceCoachTitle.textContent = normalized.voice.title;
  recognitionVoiceCoachDetail.textContent = normalized.voice.detail;
  recognitionCoachStatus.textContent = trustedReady || normalized.face.phase === "accepted" || normalized.voice.phase === "accepted"
    ? "Sample accepted / Stored locally"
    : "Waiting for sample";
  recognitionFaceProgressLabel.textContent = faceReady ? "Face ready" : `Face ${Math.min(normalized.faceSampleCount, normalized.requiredFacePoseCount)}/${normalized.requiredFacePoseCount}`;
  recognitionFaceProgressDetail.textContent = faceReady ? "Ready for local identity checks." : normalized.face.detail;
  recognitionVoiceProgressLabel.textContent = voiceReady ? "Voice ready" : `Voice ${normalized.voiceSampleCount}/${normalized.requiredVoiceSampleCount}`;
  recognitionVoiceProgressDetail.textContent = voiceReady ? "Ready for owner-only voice match." : normalized.voice.detail;
  recognitionSessionCheckOne.textContent = normalized.face.checks[0] ?? normalized.voice.checks[0] ?? "Permission waiting";
  recognitionSessionCheckTwo.textContent = normalized.face.checks[1] ?? normalized.voice.checks[1] ?? "Quality waiting";
  recognitionSessionCheckThree.textContent = "Stored locally";
  updateEnrollmentProofFromStatus(normalized);
  renderEnrollmentProof(normalized);
}

function updateStandaloneRecognitionDashboard(existing: KnownUserProfile | undefined, faceCount: number, voiceCount: number): void {
  const faceReady = faceCount >= REQUIRED_FACE_POSE_COUNT;
  const voiceReady = voiceCount >= REQUIRED_VOICE_SAMPLE_COUNT;
  const trustedReady = faceReady && voiceReady && faceRecognitionInput.value === "on" && voiceMatchModeInput.value !== "off";
  const cameraReady = faceSampleStorageInput.value === "on" || state.companionSettings.allowFaceSampleStorage || faceCount > 0;
  const micReady = state.companionSettings.allowAlwaysListening || voiceMatchModeInput.value !== "off" || voiceCount > 0 || Boolean(speechRecognitionConstructor() || canUseServerTranscription());
  const savedSamples = normalizeFacePoseSamples(existing?.facePoseSamples);
  const completedFacePoses = FACE_ENROLLMENT_POSES.filter((pose) => savedSamples[pose] || pendingFacePoseSamples[pose]);

  renderSmartRecognition(normalizeIdentityStatus({
    ...state.identityStatus,
    generatedAt: new Date().toISOString(),
    cameraPermission: cameraReady ? "ready" : "unknown",
    microphonePermission: micReady ? "ready" : "unknown",
    cameraDevice: cameraReady ? "ready" : "permission-needed",
    microphoneDevice: micReady ? "ready" : "permission-needed",
    sttRoute: canUseServerTranscription() || speechRecognitionConstructor() ? "ready" : "not-configured",
    faceSampleCount: faceCount,
    voiceSampleCount: voiceCount,
    completedFacePoses,
    face: {
      phase: faceReady ? "accepted" : faceCount > 0 ? "previewing" : "idle",
      title: faceReady ? "Face enrolled" : faceCount > 0 ? "Keep going" : "Adaptive light",
      detail: faceReady
        ? "Seven local face poses are stored for owner recognition."
        : `${Math.min(faceCount, REQUIRED_FACE_POSE_COUNT)}/${REQUIRED_FACE_POSE_COUNT} face poses captured. Center your face and follow the next pose.`,
      progress: faceCount / REQUIRED_FACE_POSE_COUNT,
      score: faceCount / REQUIRED_FACE_POSE_COUNT,
      checks: [cameraReady ? "Permission ready" : "Permission needed", faceReady ? "Quality accepted" : "Quality waiting", "Stored locally"]
    },
    voice: {
      phase: voiceReady ? "accepted" : voiceCount > 0 ? "recording" : "idle",
      title: voiceReady ? "Voice enrolled" : voiceCount > 0 ? "Keep reading" : "Voice ready",
      detail: voiceReady
        ? "Three local voice samples are stored for Voice Match."
        : `${voiceCount}/${REQUIRED_VOICE_SAMPLE_COUNT} voice samples captured. Read the next phrase in a quiet room.`,
      progress: voiceCount / REQUIRED_VOICE_SAMPLE_COUNT,
      score: voiceCount / REQUIRED_VOICE_SAMPLE_COUNT,
      checks: [micReady ? "Mic ready" : "Mic needed", voiceReady ? "Quality accepted" : "Isolation waiting", "Stored locally"]
    },
    readiness: {
      ownerReady: Boolean(existing) || faceCount > 0 || voiceCount > 0,
      faceReady,
      voiceReady,
      trustedActionsReady: trustedReady,
      overallScore: Math.min(1, ((faceCount / REQUIRED_FACE_POSE_COUNT) + (voiceCount / REQUIRED_VOICE_SAMPLE_COUNT)) / 2),
      confidence: Math.min(1, ((faceCount / REQUIRED_FACE_POSE_COUNT) + (voiceCount / REQUIRED_VOICE_SAMPLE_COUNT)) / 2),
      lastVerifiedAt: trustedReady ? new Date().toISOString() : null,
      source: faceReady && voiceReady ? "Face + Voice" : faceReady ? "Face" : voiceReady ? "Voice" : "Inactive",
      summary: trustedReady
        ? "Owner profile is ready for local trusted control."
        : faceCount > 0 || voiceCount > 0
          ? "Continue guided enrollment before trusted local control."
          : "Owner is not currently verified."
    }
  }));
}

async function refreshSmartRecognitionHealth(): Promise<void> {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) {
      enrollmentProofState.stationAvailable = false;
      enrollmentProofState.syncState = enrollmentProofState.syncState === "confirmed" ? "degraded" : enrollmentProofState.syncState;
      renderEnrollmentProof(state.identityStatus);
      return;
    }
    const health = (await response.json()) as { identitySmoke?: unknown };
    if (!health.identitySmoke) {
      enrollmentProofState.stationAvailable = false;
      enrollmentProofState.syncState = enrollmentProofState.syncState === "confirmed" ? "degraded" : enrollmentProofState.syncState;
      renderEnrollmentProof(state.identityStatus);
      return;
    }
    enrollmentProofState.stationAvailable = true;
    enrollmentProofState.lastHealthAt = new Date().toISOString();
    updateEnrollmentProofFromStatus(preserveLocalEnrollmentCountsForStationHealth(identityStatusFromStationHealth(health)));
    refreshSmartRecognitionFromHealth(health);
  } catch {
    enrollmentProofState.stationAvailable = false;
    enrollmentProofState.syncState = enrollmentProofState.syncState === "confirmed" ? "degraded" : enrollmentProofState.syncState;
    renderSmartRecognition(normalizeIdentityStatus({
      ...state.identityStatus,
      readiness: {
        ...state.identityStatus.readiness,
        summary: "Station identity smoke is unavailable; local enrollment state is still saved."
      }
    }));
  }
}

async function syncStationIdentityCounts(counts: { faceSampleCount: number; voiceSampleCount: number }): Promise<void> {
  const requestId = ++enrollmentProofSyncRequestId;
  const requestedFaceSampleCount = Math.max(0, Math.floor(counts.faceSampleCount));
  const requestedVoiceSampleCount = Math.max(0, Math.floor(counts.voiceSampleCount));
  enrollmentProofState.lastSyncAttemptAt = new Date().toISOString();
  enrollmentProofState.lastSyncError = null;
  enrollmentProofState.syncState = "pending";
  renderEnrollmentProof(state.identityStatus);
  try {
    const response = await fetch("/api/station/identity-counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        faceSampleCount: requestedFaceSampleCount,
        voiceSampleCount: requestedVoiceSampleCount
      })
    });
    if (requestId !== enrollmentProofSyncRequestId) return;
    if (response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        identitySmoke?: {
          identity?: {
            faceSampleCount?: unknown;
            voiceSampleCount?: unknown;
          };
        };
      };
      if (requestId !== enrollmentProofSyncRequestId) return;
      if (!body.ok) {
        failEnrollmentProofSync(body.error ? body.error.slice(0, 18) : "Rejected", false);
      } else if (!body.identitySmoke) {
        failEnrollmentProofSync("No proof", false);
      } else {
        confirmEnrollmentProofSync({ identitySmoke: body.identitySmoke }, {
          faceSampleCount: requestedFaceSampleCount,
          voiceSampleCount: requestedVoiceSampleCount
        });
      }
    } else {
      failEnrollmentProofSync(`HTTP ${response.status}`, false);
    }
  } catch {
    if (requestId !== enrollmentProofSyncRequestId) return;
    failEnrollmentProofSync("Offline", false);
    setSynraState("idle", "Enrollment saved locally. Station identity count sync is unavailable.");
  } finally {
    if (requestId !== enrollmentProofSyncRequestId) return;
    renderEnrollmentProof(state.identityStatus);
    await refreshSmartRecognitionHealth();
  }
}

async function verifyEnrollmentProofSync(): Promise<void> {
  const requestId = ++enrollmentProofSyncRequestId;
  const requestedFaceSampleCount = Math.max(0, Math.floor(state.identityStatus.faceSampleCount));
  const requestedVoiceSampleCount = Math.max(0, Math.floor(state.identityStatus.voiceSampleCount));
  recognitionProofVerifyButton.disabled = true;
  enrollmentProofState.lastSyncAttemptAt = new Date().toISOString();
  enrollmentProofState.lastSyncError = null;
  enrollmentProofState.syncState = "pending";
  renderEnrollmentProof(state.identityStatus);
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (requestId !== enrollmentProofSyncRequestId) return;
    if (!response.ok) {
      failEnrollmentProofSync(`HTTP ${response.status}`, false);
      return;
    }
    const health = (await response.json().catch(() => ({}))) as { identitySmoke?: unknown };
    if (requestId !== enrollmentProofSyncRequestId) return;
    if (!health.identitySmoke) {
      failEnrollmentProofSync("No proof", false);
      return;
    }
    confirmEnrollmentProofSync(health, {
      faceSampleCount: requestedFaceSampleCount,
      voiceSampleCount: requestedVoiceSampleCount
    });
  } catch {
    if (requestId !== enrollmentProofSyncRequestId) return;
    failEnrollmentProofSync("Offline", false);
  } finally {
    recognitionProofVerifyButton.disabled = false;
    if (requestId !== enrollmentProofSyncRequestId) return;
    renderEnrollmentProof(state.identityStatus);
  }
}

function identityStatusFromStationHealth(health: { identitySmoke?: unknown }): SynraIdentityStatus {
  const smoke = health.identitySmoke as {
    camera?: { status?: string };
    microphone?: { status?: string };
    stt?: { status?: string; provider?: string; lastError?: string | null };
    speaker?: { status?: string; provider?: string; lastError?: string | null };
    identity?: { faceSampleCount?: number; voiceSampleCount?: number };
  } | undefined;
  const faceSampleCount = Number(smoke?.identity?.faceSampleCount ?? state.identityStatus.faceSampleCount);
  const voiceSampleCount = Number(smoke?.identity?.voiceSampleCount ?? state.identityStatus.voiceSampleCount);
  const cameraDevice = stationRouteToIdentityDevice(smoke?.camera?.status);
  const microphoneDevice = stationRouteToIdentityDevice(smoke?.microphone?.status);
  const sttRoute = stationRouteToIdentityDevice(smoke?.stt?.status);
  const speakerRoute = stationRouteToIdentityDevice(smoke?.speaker?.status);
  const faceReady = faceSampleCount >= state.identityStatus.requiredFacePoseCount;
  const voiceReady = voiceSampleCount >= state.identityStatus.requiredVoiceSampleCount;
  const trustedActionsReady = faceReady && voiceReady && cameraDevice !== "degraded" && microphoneDevice !== "degraded" && sttRoute !== "degraded";
  const sttProvider = smoke?.stt?.provider || "station";
  const sttError = smoke?.stt?.lastError;

  return normalizeIdentityStatus({
    ...state.identityStatus,
    generatedAt: new Date().toISOString(),
    cameraDevice,
    microphoneDevice,
    sttRoute,
    speakerRoute,
    faceSampleCount,
    voiceSampleCount,
    readiness: {
      ...state.identityStatus.readiness,
      faceReady,
      voiceReady,
      trustedActionsReady,
      source: `station:${sttProvider}`,
      summary: sttError
        ? `Speech recognition degraded: ${sttError}`
        : "Local identity status refreshed from station health."
    }
  });
}

function preserveLocalEnrollmentCountsForStationHealth(stationStatus: SynraIdentityStatus, localStatus: SynraIdentityStatus = state.identityStatus): SynraIdentityStatus {
  const faceSampleCount = Math.max(localStatus.faceSampleCount, stationStatus.faceSampleCount);
  const voiceSampleCount = Math.max(localStatus.voiceSampleCount, stationStatus.voiceSampleCount);
  const completedFacePoses = Array.from(new Set([...localStatus.completedFacePoses, ...stationStatus.completedFacePoses]));
  const faceReady = faceSampleCount >= stationStatus.requiredFacePoseCount;
  const voiceReady = voiceSampleCount >= stationStatus.requiredVoiceSampleCount;
  const trustedActionsReady = faceReady
    && voiceReady
    && stationStatus.cameraDevice !== "degraded"
    && stationStatus.microphoneDevice !== "degraded"
    && stationStatus.sttRoute !== "degraded";

  return normalizeIdentityStatus({
    ...stationStatus,
    faceSampleCount,
    voiceSampleCount,
    completedFacePoses,
    readiness: {
      ...stationStatus.readiness,
      faceReady,
      voiceReady,
      trustedActionsReady,
      overallScore: Math.min(1, ((faceSampleCount / stationStatus.requiredFacePoseCount) + (voiceSampleCount / stationStatus.requiredVoiceSampleCount)) / 2),
      confidence: Math.min(1, ((faceSampleCount / stationStatus.requiredFacePoseCount) + (voiceSampleCount / stationStatus.requiredVoiceSampleCount)) / 2)
    }
  });
}

function refreshSmartRecognitionFromHealth(health: { identitySmoke?: unknown }): void {
  if (health.identitySmoke) renderSmartRecognition(preserveLocalEnrollmentCountsForStationHealth(identityStatusFromStationHealth(health)));
}

function stationRouteToIdentityDevice(value: string | undefined): SynraIdentityDeviceState {
  if (value === "ready") return "ready";
  if (value === "degraded") return "degraded";
  if (value === "not-configured") return "not-configured";
  return "unavailable";
}

function isIdentityDeviceReady(value: SynraIdentityDeviceState): boolean {
  return value === "ready" || value === "active";
}

function identityDeviceLabel(value: SynraIdentityDeviceState): string {
  if (value === "ready") return "Ready";
  if (value === "active") return "Active";
  if (value === "degraded") return "Degraded";
  if (value === "permission-needed") return "Ask";
  if (value === "not-configured") return "Setup";
  return "Unavailable";
}

function refreshIdentityEnrollmentPanel(): void {
  const existing = currentEnrollmentUser();
  const savedFaceSamples = normalizeFacePoseSamples(existing?.facePoseSamples);
  const faceCount = FACE_ENROLLMENT_POSES.filter((pose) => savedFaceSamples[pose] || pendingFacePoseSamples[pose]).length;
  const voiceCount = Math.min((existing?.voicePrints?.length ?? 0) + pendingVoicePrints.length, REQUIRED_VOICE_SAMPLE_COUNT);
  const nextPose = nextMissingFacePose(existing);
  if (!pendingFacePoseSamples[selectedFacePose()] && nextPose !== selectedFacePose()) facePoseInput.value = nextPose;
  const selectedPose = selectedFacePose();
  const phraseIndex = Math.min(pendingVoicePrints.length, voiceEnrollmentPhrases.length - 1);

  identityEnrollmentStatus.textContent = `Face ${Math.min(faceCount, REQUIRED_FACE_POSE_COUNT)}/${REQUIRED_FACE_POSE_COUNT} · Voice ${voiceCount}/${REQUIRED_VOICE_SAMPLE_COUNT}`;
  faceEnrollmentProgress.textContent = `${FACE_ENROLLMENT_POSE_LABELS[selectedPose]}: ${FACE_ENROLLMENT_POSE_INSTRUCTIONS[selectedPose]}`;
  voiceEnrollmentProgress.textContent = `Next voice sample: ${Math.min(phraseIndex + 1, REQUIRED_VOICE_SAMPLE_COUNT)} of ${REQUIRED_VOICE_SAMPLE_COUNT}`;
  voicePhrasePrompt.textContent = `Say: ${voiceEnrollmentPhrases[phraseIndex]}`;
  captureUserFaceButton.textContent = pendingFacePoseCount() ? "Capture Next Face Pose" : "Capture Face Pose";
  captureUserVoiceButton.textContent = pendingVoicePrints.length ? "Capture Next Voice Sample" : "Capture Voice Sample";
  updateStandaloneRecognitionDashboard(existing, faceCount, voiceCount);
}

async function captureKnownUserFaceSample(): Promise<void> {
  if (!state.companionSettings.allowFaceSampleStorage && faceSampleStorageInput.value !== "on") {
    setSynraState("idle", "Turn on local face sample storage before capturing a user profile.");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setSynraState("idle", "Camera capture is not available in this browser.");
    return;
  }
  captureUserFaceButton.disabled = true;
  captureUserFaceButton.textContent = "Capturing";
  let stream: MediaStream | null = null;
  try {
    stream = await openSelectedCameraStream();
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    const pose = selectedFacePose();
    const capture = captureFacePoseFrame(video, 320, 240);
    const faceQuality = capture.faceQuality;
    if (!faceQuality.accepted) {
      setSynraState("idle", faceQuality.message);
      return;
    }
    pendingFacePoseSamples = { ...pendingFacePoseSamples, [pose]: capture.dataUrl };
    const existing = currentEnrollmentUser();
    const savedFaceSamples = normalizeFacePoseSamples(existing?.facePoseSamples);
    const faceCount = FACE_ENROLLMENT_POSES.filter((facePose) => savedFaceSamples[facePose] || pendingFacePoseSamples[facePose]).length;
    const voiceCount = Math.min((existing?.voicePrints?.length ?? 0) + pendingVoicePrints.length, REQUIRED_VOICE_SAMPLE_COUNT);
    await syncStationIdentityCounts({ faceSampleCount: faceCount, voiceSampleCount: voiceCount });
    facePoseInput.value = nextMissingFacePose(currentEnrollmentUser());
    setSynraState("idle", `${FACE_ENROLLMENT_POSE_LABELS[pose]} face pose captured locally.`);
  } catch {
    setSynraState("idle", "Face sample capture needs camera permission.");
  } finally {
    if (stream) for (const track of stream.getTracks()) track.stop();
    captureUserFaceButton.disabled = false;
    refreshIdentityEnrollmentPanel();
  }
}

async function captureKnownUserVoiceSample(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
    setSynraState("idle", "Voice Match capture is not available in this browser.");
    return;
  }
  captureUserVoiceButton.disabled = true;
  captureUserVoiceButton.textContent = "Listening";
  const phrase = voiceEnrollmentPhrases[Math.min(pendingVoicePrints.length, voiceEnrollmentPhrases.length - 1)];
  setSynraState("listening", `Say: ${phrase}`);
  try {
    const capture = await recordMicrophoneBlob({ durationMs: 4200, minRms: 0.003 });
    const voicePrint = await createVoicePrintFromBlob(capture.blob);
    const voiceQuality = evaluateVoiceEnrollmentQuality({
      peakRms: capture.peakRms,
      signal: capture.signal,
      voicePrintQuality: voicePrint.quality
    });
    if (!voiceQuality.accepted) {
      setSynraState("idle", voiceQuality.message);
      return;
    }
    pendingVoicePrints = [...pendingVoicePrints, voicePrint].slice(-REQUIRED_VOICE_SAMPLE_COUNT);
    const existing = currentEnrollmentUser();
    const savedFaceSamples = normalizeFacePoseSamples(existing?.facePoseSamples);
    const faceCount = FACE_ENROLLMENT_POSES.filter((facePose) => savedFaceSamples[facePose] || pendingFacePoseSamples[facePose]).length;
    const voiceCount = Math.min((existing?.voicePrints?.length ?? 0) + pendingVoicePrints.length, REQUIRED_VOICE_SAMPLE_COUNT);
    await syncStationIdentityCounts({ faceSampleCount: faceCount, voiceSampleCount: voiceCount });
    setSynraState("idle", `Voice sample ${pendingVoicePrints.length}/${REQUIRED_VOICE_SAMPLE_COUNT} captured locally.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice Match capture needs microphone permission.";
    setSynraState("idle", message);
  } finally {
    captureUserVoiceButton.disabled = false;
    refreshIdentityEnrollmentPanel();
  }
}

function saveKnownUserFromInputs(): void {
  const name = knownUserNameInput.value.trim();
  if (!name) {
    setSynraState("idle", "Enter a user name before saving.");
    return;
  }
  const now = new Date().toISOString();
  const existing = state.companionSettings.knownUsers.find((user) => user.name.toLowerCase() === name.toLowerCase());
  const facePoseSamples = {
    ...normalizeFacePoseSamples(existing?.facePoseSamples),
    ...pendingFacePoseSamples
  };
  const capturedFaceSamples = faceSamplesFromPoseMap(pendingFacePoseSamples);
  const nextUser: KnownUserProfile = {
    id: existing?.id ?? `user-${Date.now().toString(36)}`,
    name,
    relationship: knownUserRelationshipInput.value.trim(),
    faceSamples: [...(existing?.faceSamples ?? []), ...capturedFaceSamples].slice(-REQUIRED_FACE_POSE_COUNT),
    facePoseSamples,
    voicePrints: [...(existing?.voicePrints ?? []), ...pendingVoicePrints].slice(-8),
    recognitionEnabled: faceRecognitionInput.value === "on",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  state.companionSettings = {
    ...readCompanionSettingsFromInputs(),
    knownUsers: [nextUser, ...state.companionSettings.knownUsers.filter((user) => user.id !== nextUser.id)].slice(0, 12)
  };
  saveCompanionSettingsEverywhere();
  pendingFacePoseSamples = {};
  pendingVoicePrints = [];
  knownUserNameInput.value = "";
  knownUserRelationshipInput.value = "";
  refreshIdentityEnrollmentPanel();
  renderKnownUsers();
  setSynraState("idle", `${name} is saved as a known user.`);
}

function renderKnownUsers(): void {
  if (state.companionSettings.knownUsers.length === 0) {
    knownUsersList.innerHTML = `<div class="known-user-empty">No known users saved yet.</div>`;
    return;
  }
  knownUsersList.innerHTML = state.companionSettings.knownUsers.map((user) => {
    const readiness = identityReadinessForUser(user);
    const facePoseSamples = normalizeFacePoseSamples(user.facePoseSamples);
    const thumbnail = facePoseSamples.center || faceSamplesFromPoseMap(facePoseSamples)[0] || user.faceSamples[0] || "";
    return `
      <article class="known-user-card">
        ${thumbnail ? `<img src="${thumbnail}" alt="${escapeHtml(user.name)} face sample" />` : `<div class="known-user-avatar">${escapeHtml(user.name.slice(0, 1).toUpperCase())}</div>`}
        <div>
          <strong>${escapeHtml(user.name)}</strong>
          <span>${escapeHtml(user.relationship || "Known user")} · ${user.recognitionEnabled ? "Recognition on" : "Recognition off"} · ${readiness.faceSampleCount}/${readiness.requiredFacePoseCount} face poses · ${readiness.voiceSampleCount}/${readiness.requiredVoiceSampleCount} voice samples</span>
          <span class="identity-readiness">${escapeHtml(identityReadinessLabel(readiness))}</span>
        </div>
        <button type="button" data-delete-user="${escapeHtml(user.id)}">Delete</button>
      </article>
    `;
  }).join("");
  knownUsersList.querySelectorAll<HTMLButtonElement>("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.deleteUser;
      state.companionSettings = { ...state.companionSettings, knownUsers: state.companionSettings.knownUsers.filter((user) => user.id !== id) };
      saveCompanionSettingsEverywhere();
      renderKnownUsers();
    });
  });
}

function applyProviderPreset(provider: string): void {
  if (provider === "server") {
    endpointInput.value = "/api/chat";
    modelInput.value = modelInput.value.trim() || "server";
    apiKeyInput.value = "";
    return;
  }
  if (provider === "openAICompatible") {
    endpointInput.value = endpointInput.value.trim() && endpointInput.value.trim() !== "/api/chat" ? endpointInput.value.trim() : "https://api.openai.com/v1";
    modelInput.value = modelInput.value.trim() && modelInput.value.trim() !== "server" ? modelInput.value.trim() : "gpt-4.1-mini";
    return;
  }
  if (provider === "localHTTP") {
    endpointInput.value = endpointInput.value.trim() && endpointInput.value.trim() !== "/api/chat" ? endpointInput.value.trim() : "http://127.0.0.1:11434/v1";
    modelInput.value = modelInput.value.trim() && modelInput.value.trim() !== "server" ? modelInput.value.trim() : "llama3.2";
  }
}

function populateVoiceSettingsInputs(): void {
  voiceProviderInput.value = resolveVoiceProvider(state.voiceSettings.provider);
  populateBrowserVoiceSelect();
  elevenLabsApiKeyInput.value = displaySecretValue(state.voiceSettings.elevenLabsApiKey);
  elevenLabsApiKeyInput.placeholder = isServerManagedSecret(state.voiceSettings.elevenLabsApiKey) ? "Server-managed API key saved" : "";
  elevenLabsVoiceIdInput.value = state.voiceSettings.elevenLabsVoiceId;
  populateElevenLabsVoiceSelect();
  elevenLabsModelIdInput.value = state.voiceSettings.elevenLabsModelId || "eleven_multilingual_v2";
  elevenLabsOutputFormatInput.value = state.voiceSettings.elevenLabsOutputFormat || "mp3_44100_128";
  elevenLabsStabilityInput.value = String(state.voiceSettings.elevenLabsStability ?? 0.48);
  elevenLabsSimilarityInput.value = String(state.voiceSettings.elevenLabsSimilarityBoost ?? 0.78);
  chatterboxModelInput.value = resolveChatterboxModel(state.voiceSettings.chatterboxModel);
  chatterboxDeviceInput.value = resolveChatterboxDevice(state.voiceSettings.chatterboxDevice);
  chatterboxVoicePromptPathInput.value = state.voiceSettings.chatterboxVoicePromptPath || "";
  chatterboxLanguageIdInput.value = state.voiceSettings.chatterboxLanguageId || "en";
  updateElevenLabsVoiceStatus(elevenLabsVoiceStatusText());
  updateChatterboxVoiceStatus(chatterboxVoiceStatusText());
}

function readVoiceSettingsFromInputs(): VoiceSettings {
  const selected = state.elevenLabsVoices.find((voice) => voice.voiceId === elevenLabsVoiceIdInput.value.trim());
  const browserVoice = selectedBrowserVoice();
  return {
    provider: resolveVoiceProvider(voiceProviderInput.value),
    browserVoiceURI: browserVoice?.voiceURI ?? state.voiceSettings.browserVoiceURI ?? "",
    browserVoiceName: browserVoice?.name ?? state.voiceSettings.browserVoiceName ?? "",
    elevenLabsApiKey: keepServerManagedSecret(elevenLabsApiKeyInput.value, state.voiceSettings.elevenLabsApiKey),
    elevenLabsVoiceId: elevenLabsVoiceIdInput.value.trim(),
    elevenLabsVoiceName: selected?.name ?? state.voiceSettings.elevenLabsVoiceName ?? "",
    elevenLabsModelId: elevenLabsModelIdInput.value.trim() || "eleven_multilingual_v2",
    elevenLabsOutputFormat: elevenLabsOutputFormatInput.value.trim() || "mp3_44100_128",
    elevenLabsStability: clampUnit(Number(elevenLabsStabilityInput.value), 0.48),
    elevenLabsSimilarityBoost: clampUnit(Number(elevenLabsSimilarityInput.value), 0.78),
    chatterboxModel: resolveChatterboxModel(chatterboxModelInput.value),
    chatterboxDevice: resolveChatterboxDevice(chatterboxDeviceInput.value),
    chatterboxVoicePromptPath: chatterboxVoicePromptPathInput.value.trim(),
    chatterboxLanguageId: chatterboxLanguageIdInput.value.trim() || "en"
  };
}

function populateBrowserVoiceSelect(): void {
  const voices = browserSpeechVoices();
  if (!("speechSynthesis" in window)) {
    browserVoiceSelect.innerHTML = `<option value="">Apple Voice unavailable</option>`;
    updateBrowserVoiceStatus("Apple Voice is not available in this kiosk/browser.");
    return;
  }
  if (voices.length === 0) {
    browserVoiceSelect.innerHTML = `<option value="">No Apple voices loaded yet</option>`;
    updateBrowserVoiceStatus("No Apple system voices are loaded yet. Use ElevenLabs or install/download voices in System Settings.");
    return;
  }
  const preferred = resolveBrowserVoice(state.voiceSettings.browserVoiceURI, voices);
  const sorted = [...voices].sort((a, b) => voiceSortKey(a).localeCompare(voiceSortKey(b)));
  browserVoiceSelect.innerHTML = sorted
    .map((voice) => `<option value="${escapeHtml(voice.voiceURI)}">${escapeHtml(`${voice.name} (${voice.lang})`)}</option>`)
    .join("");
  browserVoiceSelect.value = preferred?.voiceURI ?? "";
  if (!state.voiceSettings.browserVoiceURI && preferred) {
    state.voiceSettings = { ...state.voiceSettings, browserVoiceURI: preferred.voiceURI, browserVoiceName: preferred.name };
    saveVoiceSettings(state.voiceSettings);
  }
  updateBrowserVoiceStatus(browserVoiceStatusText());
}

function browserSpeechVoices(): SpeechSynthesisVoice[] {
  if (!("speechSynthesis" in window)) return [];
  return speechSynthesis.getVoices();
}

function selectedBrowserVoice(): SpeechSynthesisVoice | null {
  return resolveBrowserVoice(browserVoiceSelect.value || state.voiceSettings.browserVoiceURI, browserSpeechVoices());
}

function resolveBrowserVoice(voiceURI: string | undefined, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voiceURI) {
    const exact = voices.find((voice) => voice.voiceURI === voiceURI);
    if (exact) return exact;
  }
  return preferredBrowserVoice(voices);
}

function preferredBrowserVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const scored = voices
    .map((voice) => ({ voice, score: browserVoiceScore(voice) }))
    .sort((a, b) => b.score - a.score || a.voice.name.localeCompare(b.voice.name));
  return scored[0]?.voice ?? voices[0] ?? null;
}

function browserVoiceScore(voice: SpeechSynthesisVoice): number {
  const name = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  const languageScore = voice.lang.toLowerCase().startsWith("en-us") ? 20 : voice.lang.toLowerCase().startsWith("en") ? 12 : 0;
  const hintScore = PREFERRED_BROWSER_VOICE_HINTS.reduce((score, hint, index) => name.includes(hint) ? Math.max(score, 40 - index) : score, 0);
  return languageScore + hintScore + (voice.default ? 2 : 0);
}

function voiceSortKey(voice: SpeechSynthesisVoice): string {
  const preferred = browserVoiceScore(voice) > 20 ? "0" : "1";
  return `${preferred}-${voice.lang}-${voice.name}`;
}

function browserVoiceStatusText(): string {
  if (!("speechSynthesis" in window)) return "Apple Voice is unavailable here. Configure ElevenLabs for voice.";
  const voices = browserSpeechVoices();
  if (voices.length === 0) return "No Apple system voices are loaded. Configure ElevenLabs or install/download voices in System Settings.";
  const selected = selectedBrowserVoice();
  if (!selected) return "Apple Voice will use the system default voice.";
  const languageNote = selected.lang.toLowerCase().startsWith("en") ? "" : " Install an English system voice or use ElevenLabs for a better Synra voice.";
  return `Browser / Apple Voice: ${selected.name} (${selected.lang}).${languageNote}`;
}

function updateBrowserVoiceStatus(message: string): void {
  browserVoiceStatusEl.textContent = message;
}

function populateElevenLabsVoiceSelect(): void {
  const currentVoiceId = state.voiceSettings.elevenLabsVoiceId || elevenLabsVoiceIdInput.value.trim();
  const options = state.elevenLabsVoices.length > 0
    ? state.elevenLabsVoices.map((voice) => {
      const label = voice.category ? `${voice.name} (${voice.category})` : voice.name;
      return `<option value="${escapeHtml(voice.voiceId)}">${escapeHtml(label)}</option>`;
    })
    : [`<option value="">Load voices or paste a voice ID below</option>`];
  elevenLabsVoiceSelect.innerHTML = options.join("");
  elevenLabsVoiceSelect.value = state.elevenLabsVoices.some((voice) => voice.voiceId === currentVoiceId) ? currentVoiceId : "";
}

function elevenLabsVoiceStatusText(): string {
  const provider = resolveVoiceProvider(voiceProviderInput.value);
  if (provider === "chatterbox") return "Chatterbox local voice is selected.";
  if (provider !== "elevenLabs") return "Browser speech is selected.";
  const keyReady = Boolean(elevenLabsApiKeyInput.value.trim() || state.voiceSettings.elevenLabsApiKey.trim());
  if (!keyReady) return "Paste an ElevenLabs API key, then load voices.";
  if (!elevenLabsVoiceIdInput.value.trim()) return "Load voices and choose one, or paste a voice ID.";
  const voice = state.elevenLabsVoices.find((item) => item.voiceId === elevenLabsVoiceIdInput.value.trim());
  return voice ? `Selected ${voice.name}.` : "Voice ID saved. Server-managed keys are supported.";
}

function updateElevenLabsVoiceStatus(message: string): void {
  elevenLabsVoiceStatusEl.textContent = message;
}

function chatterboxVoiceStatusText(): string {
  if (resolveVoiceProvider(voiceProviderInput.value) !== "chatterbox") return "Chatterbox is installed only when selected as the local voice provider.";
  const model = resolveChatterboxModel(chatterboxModelInput.value);
  const device = resolveChatterboxDevice(chatterboxDeviceInput.value);
  return `Chatterbox ${model} will synthesize locally on ${device === "auto" ? "the best available device" : device.toUpperCase()}.`;
}

function updateChatterboxVoiceStatus(message: string): void {
  chatterboxVoiceStatusEl.textContent = message;
}

function populateProductSettingsInputs(): void {
  state.productSettings = ensureNodeSparkDeviceId(state.productSettings);
  synraSkillModeInput.value = resolveSynraSkillMode(state.productSettings.synraSkillMode);
  nodeSparkAccessInput.value = resolveNodeSparkAccess(state.productSettings.nodeSparkAccess);
  nodeSparkHubUrlInput.value = state.productSettings.nodeSparkHubUrl;
  nodeSparkDeviceNameInput.value = state.productSettings.nodeSparkDeviceName || "Synra Standalone Jetson";
  nodeSparkPairingPinInput.value = "";
  refreshNodeSparkPairingStatus();
}

function readProductSettingsFromInputs(): ProductSettings {
  const previous = ensureNodeSparkDeviceId(state.productSettings);
  const hubUrl = nodeSparkHubUrlInput.value.trim();
  const sameHub = hubUrl === previous.nodeSparkHubUrl.trim();
  return {
    synraSkillMode: resolveSynraSkillMode(synraSkillModeInput.value),
    nodeSparkAccess: resolveNodeSparkAccess(nodeSparkAccessInput.value),
    nodeSparkHubUrl: hubUrl,
    nodeSparkDeviceId: previous.nodeSparkDeviceId,
    nodeSparkDeviceName: nodeSparkDeviceNameInput.value.trim() || "Synra Standalone Jetson",
    nodeSparkHubId: sameHub ? previous.nodeSparkHubId : "",
    nodeSparkDeviceToken: sameHub ? keepServerManagedSecret("", previous.nodeSparkDeviceToken) : "",
    nodeSparkTokenExpiresAt: sameHub ? previous.nodeSparkTokenExpiresAt : ""
  };
}

function resolveNodeSparkAccess(access: string | undefined): NodeSparkAccess {
  return access === "subscriber" ? "subscriber" : "locked";
}

function resolveSynraSkillMode(mode: string | undefined): SynraSkillMode {
  if (mode === "homeAssistant" || mode === "nodeSparkHub") return mode;
  return "hybrid";
}

function ensureNodeSparkDeviceId(settings: ProductSettings): ProductSettings {
  if (settings.nodeSparkDeviceId) return settings;
  const fallback = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const resolved = char === "x" ? value : (value & 0x3) | 0x8;
    return resolved.toString(16);
  });
  return {
    ...settings,
    nodeSparkDeviceId: globalThis.crypto?.randomUUID?.() ?? fallback,
    nodeSparkDeviceName: settings.nodeSparkDeviceName || "Synra Standalone Jetson"
  };
}

function nodeSparkPairingLabel(settings = state.productSettings): string {
  if (!settings.nodeSparkDeviceToken) return "Not paired";
  if (!settings.nodeSparkTokenExpiresAt) return "Paired";
  const expiry = new Date(settings.nodeSparkTokenExpiresAt);
  if (Number.isNaN(expiry.getTime())) return "Paired";
  return `Paired until ${expiry.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
}

function refreshNodeSparkPairingStatus(): void {
  const paired = Boolean(state.productSettings.nodeSparkDeviceToken);
  nodeSparkPairingStatusEl.textContent = nodeSparkPairingLabel();
  nodeSparkPairedHubStatusEl.textContent = paired ? (state.productSettings.nodeSparkHubId || endpointDisplayLabel(state.productSettings.nodeSparkHubUrl)) : "No Hub token";
}

function populateHomeAssistantSettingsInputs(): void {
  homeAssistantEnabledInput.value = state.homeAssistantSettings.enabled ? "on" : "off";
  homeAssistantUrlInput.value = state.homeAssistantSettings.url;
  homeAssistantTokenInput.value = displaySecretValue(state.homeAssistantSettings.token);
  homeAssistantTokenInput.placeholder = isServerManagedSecret(state.homeAssistantSettings.token) ? "Server-managed token saved" : "";
  homeAssistantLightEntityInput.value = state.homeAssistantSettings.defaultLightEntity;
  homeAssistantConfirmationPolicyInput.value = normalizeHomeAssistantConfirmationPolicy(state.homeAssistantSettings.confirmationPolicy);
  populateHomeAssistantEntitySelect();
}

function readHomeAssistantSettingsFromInputs(): HomeAssistantSettings {
  return {
    enabled: homeAssistantEnabledInput.value === "on",
    url: homeAssistantUrlInput.value.trim(),
    token: keepServerManagedSecret(homeAssistantTokenInput.value, state.homeAssistantSettings.token),
    defaultLightEntity: homeAssistantLightEntityInput.value.trim(),
    confirmationPolicy: normalizeHomeAssistantConfirmationPolicy(homeAssistantConfirmationPolicyInput.value),
    knownEntities: state.homeAssistantSettings.knownEntities
  };
}

function populateMemorySettingsInputs(): void {
  memoryPreferredNameInput.value = state.memory.preferredName;
  memoryStyleInput.value = state.memory.style;
  memoryFactsInput.value = state.memory.savedFacts.join("\n");
  memoryRoutinesInput.value = state.memory.routines.join("\n");
  memoryDevicesInput.value = [...state.memory.rooms, ...state.memory.devices, ...state.memory.preferences].join("\n");
}

function readMemorySettingsFromInputs() {
  const deviceLines = readMemoryLines(memoryDevicesInput.value);
  return {
    preferredName: redactMemoryFact(memoryPreferredNameInput.value).slice(0, 60),
    style: redactMemoryFact(memoryStyleInput.value).slice(0, 140) || "warm, direct, and useful",
    savedFacts: readMemoryLines(memoryFactsInput.value).slice(-40),
    routines: readMemoryLines(memoryRoutinesInput.value).slice(-24),
    devices: deviceLines.filter((line) => /\b(device|light|lamp|switch|speaker|display|camera|thermostat|sensor)\b/i.test(line)).slice(-24),
    rooms: deviceLines.filter((line) => /\b(room|office|studio|kitchen|bedroom|living|garage|hall|bath)\b/i.test(line)).slice(-24),
    preferences: deviceLines.filter((line) => !/\b(device|light|lamp|switch|speaker|display|camera|thermostat|sensor|room|office|studio|kitchen|bedroom|living|garage|hall|bath)\b/i.test(line)).slice(-24)
  };
}

function readMemoryLines(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/\r?\n/)
    .map((line) => redactMemoryFact(line.trim()))
    .filter(Boolean)
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function redactMemoryFact(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  if (/\b(api[_ -]?key|token|password|secret|bearer|private key|ssh key|credit card|social security)\b/i.test(trimmed)) {
    return "";
  }
  return trimmed.slice(0, 240);
}

function forgetAllMemoryFromSettings(): void {
  state.memory = {
    preferredName: "",
    style: "warm, direct, and useful",
    savedFacts: [],
    routines: [],
    devices: [],
    rooms: [],
    preferences: []
  };
  saveMemoryEverywhere();
  populateMemorySettingsInputs();
  setSynraState("idle", "Local memory has been cleared.");
  void playMotionRoute("confirm", { restart: true, returnToIdle: true });
}

function exportMemoryFromSettings(): void {
  state.memory = readMemorySettingsFromInputs();
  saveMemoryEverywhere();
  const exported = JSON.stringify(state.memory, null, 2);
  navigator.clipboard?.writeText(exported).then(
    () => setSynraState("idle", "Memory export copied to clipboard."),
    () => setSynraState("idle", "Memory export is ready in the dialog.")
  );
  memoryFactsInput.value = `${memoryFactsInput.value.trim()}\n\n${exported}`.trim();
}

function importMemoryFromSettings(): void {
  const raw = window.prompt("Paste Synra memory JSON to import.");
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Partial<typeof state.memory>;
    state.memory = {
      preferredName: redactMemoryFact(String(parsed.preferredName ?? "")),
      style: redactMemoryFact(String(parsed.style ?? "")) || "warm, direct, and useful",
      savedFacts: Array.isArray(parsed.savedFacts) ? parsed.savedFacts.map((item) => redactMemoryFact(String(item))).filter(Boolean).slice(-40) : [],
      routines: Array.isArray(parsed.routines) ? parsed.routines.map((item) => redactMemoryFact(String(item))).filter(Boolean).slice(-24) : [],
      devices: Array.isArray(parsed.devices) ? parsed.devices.map((item) => redactMemoryFact(String(item))).filter(Boolean).slice(-24) : [],
      rooms: Array.isArray(parsed.rooms) ? parsed.rooms.map((item) => redactMemoryFact(String(item))).filter(Boolean).slice(-24) : [],
      preferences: Array.isArray(parsed.preferences) ? parsed.preferences.map((item) => redactMemoryFact(String(item))).filter(Boolean).slice(-24) : []
    };
    saveMemoryEverywhere();
    populateMemorySettingsInputs();
    setSynraState("idle", "Memory import completed.");
  } catch {
    setSynraState("offline", "That memory import was not valid JSON.");
  }
}

function exportSanitizedBackupFromSettings(): void {
  state.memory = readMemorySettingsFromInputs();
  state.companionSettings = readCompanionSettingsFromInputs();
  state.visual = {
    ...state.visual,
    avatarId: resolveInitialAvatarId(),
    backgroundId: resolveBackground(state.visual.backgroundId).id,
    renderQuality: resolveRenderQuality(state.visual.renderQuality),
    controlMode: resolveInitialControlMode()
  };
  saveMemoryEverywhere();
  saveCompanionSettingsEverywhere();
  const backup = {
    kind: "synra-standalone-sanitized-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    appVersion: SYNRA_STANDALONE_VERSION,
    settings: {
      model: {
        provider: resolveModelProvider(providerInput.value),
        endpoint: endpointDisplayLabel(endpointInput.value.trim()),
        model: modelInput.value.trim(),
        apiKeyConfigured: secretConfigured(apiKeyInput.value.trim() || state.settings.apiKey)
      },
      voice: {
        provider: resolveVoiceProvider(voiceProviderInput.value),
        browserVoiceName: state.voiceSettings.browserVoiceName,
        elevenLabsVoiceIdConfigured: secretConfigured(elevenLabsVoiceIdInput.value.trim()),
        elevenLabsApiKeyConfigured: secretConfigured(elevenLabsApiKeyInput.value.trim() || state.voiceSettings.elevenLabsApiKey),
        chatterboxModel: resolveChatterboxModel(chatterboxModelInput.value),
        chatterboxDevice: resolveChatterboxDevice(chatterboxDeviceInput.value),
        chatterboxVoicePromptPathConfigured: Boolean(chatterboxVoicePromptPathInput.value.trim()),
        chatterboxLanguageId: chatterboxLanguageIdInput.value.trim() || "en"
      },
      homeAssistant: publicHomeAssistantSettings(),
      product: publicProductSettings(),
      visual: state.visual,
      companion: {
        ...state.companionSettings,
        knownUsers: state.companionSettings.knownUsers.map((user) => ({
          ...user,
          faceSamples: [],
          facePoseSamples: {},
          voicePrints: [],
          faceSampleCount: identityReadinessForUser(user).faceSampleCount,
          voicePrintCount: user.voicePrints?.length ?? 0
        }))
      },
      memory: state.memory
    }
  };
  const exported = JSON.stringify(backup, null, 2);
  navigator.clipboard?.writeText(exported).then(
    () => setSynraState("idle", "Secret-free Synra backup copied to clipboard."),
    () => setSynraState("idle", "Secret-free Synra backup is ready in the memory field.")
  );
  memoryFactsInput.value = `${memoryFactsInput.value.trim()}\n\n${exported}`.trim();
}

function importSanitizedBackupFromSettings(): void {
  const raw = window.prompt("Paste a Synra sanitized backup JSON. Secrets and face samples are never restored from backups.");
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as { kind?: string; settings?: { memory?: Partial<typeof state.memory>; companion?: Partial<CompanionSettings>; visual?: Partial<typeof state.visual> } };
    if (parsed.kind !== "synra-standalone-sanitized-backup" || !parsed.settings) {
      setSynraState("offline", "That backup is not a Synra sanitized backup.");
      return;
    }
    if (parsed.settings.memory) {
      const memory = parsed.settings.memory;
      state.memory = {
        preferredName: redactMemoryFact(String(memory.preferredName ?? "")),
        style: redactMemoryFact(String(memory.style ?? "")) || "warm, direct, and useful",
        savedFacts: Array.isArray(memory.savedFacts) ? memory.savedFacts.map((item) => redactMemoryFact(String(item))).filter(Boolean).slice(-40) : [],
        routines: Array.isArray(memory.routines) ? memory.routines.map((item) => redactMemoryFact(String(item))).filter(Boolean).slice(-24) : [],
        devices: Array.isArray(memory.devices) ? memory.devices.map((item) => redactMemoryFact(String(item))).filter(Boolean).slice(-24) : [],
        rooms: Array.isArray(memory.rooms) ? memory.rooms.map((item) => redactMemoryFact(String(item))).filter(Boolean).slice(-24) : [],
        preferences: Array.isArray(memory.preferences) ? memory.preferences.map((item) => redactMemoryFact(String(item))).filter(Boolean).slice(-24) : []
      };
      saveMemoryEverywhere();
      populateMemorySettingsInputs();
    }
    if (parsed.settings.companion) {
      const companion = parsed.settings.companion;
      const knownUsers = Array.isArray(companion.knownUsers)
        ? companion.knownUsers.map((user) => ({
          id: String(user.id || `user-${Date.now().toString(36)}`),
          name: String(user.name || "").slice(0, 80),
          relationship: String(user.relationship || "").slice(0, 80),
          faceSamples: [],
          facePoseSamples: {},
          voicePrints: [],
          recognitionEnabled: user.recognitionEnabled === true,
          createdAt: String(user.createdAt || new Date().toISOString()),
          updatedAt: new Date().toISOString()
        })).filter((user) => user.name).slice(0, 12)
        : state.companionSettings.knownUsers;
      state.companionSettings = {
        ...state.companionSettings,
        setupComplete: companion.setupComplete !== false,
        ownerName: String(companion.ownerName || state.companionSettings.ownerName).slice(0, 80),
        wakeWordMode: normalizeWakeWordMode(String(companion.wakeWordMode || state.companionSettings.wakeWordMode)),
        wakePhrase: String(companion.wakePhrase || DEFAULT_WAKE_PHRASE).slice(0, 40),
        preferredMicrophoneId: String(companion.preferredMicrophoneId ?? state.companionSettings.preferredMicrophoneId).slice(0, 160),
        preferredCameraId: String(companion.preferredCameraId ?? state.companionSettings.preferredCameraId).slice(0, 160),
        screenTimeoutMinutes: normalizeScreenTimeout(Number(companion.screenTimeoutMinutes ?? state.companionSettings.screenTimeoutMinutes)),
        allowAlwaysListening: companion.allowAlwaysListening === true,
        allowCameraRecognition: companion.allowCameraRecognition === true,
        allowFaceSampleStorage: companion.allowFaceSampleStorage === true,
        voiceMatchMode: normalizeVoiceMatchMode(String(companion.voiceMatchMode ?? state.companionSettings.voiceMatchMode)),
        voiceMatchSensitivity: normalizeVoiceMatchSensitivity(String(companion.voiceMatchSensitivity ?? state.companionSettings.voiceMatchSensitivity)),
        allowMemorySuggestions: companion.allowMemorySuggestions !== false,
        knownUsers
      };
      saveCompanionSettingsEverywhere();
      populateCompanionSettingsInputs();
      renderKnownUsers();
    }
    if (parsed.settings.visual) {
      state.visual = {
        ...state.visual,
        avatarId: isSynraAvatarId(String(parsed.settings.visual.avatarId ?? "")) ? parsed.settings.visual.avatarId as SynraAvatarId : state.visual.avatarId,
        backgroundId: resolveBackground(String(parsed.settings.visual.backgroundId ?? "")).id,
        renderQuality: resolveRenderQuality(parsed.settings.visual.renderQuality),
        controlMode: parsed.settings.visual.controlMode === "live" ? "live" : "manual"
      };
      saveVisualSettingsEverywhere();
      applyRenderQuality(state.visual.renderQuality);
      applyBackground(resolveBackground(state.visual.backgroundId));
      applyControlMode(state.visual.controlMode);
    }
    setSynraState("idle", "Sanitized backup restored. Re-enter any credentials that are not already server-managed.");
  } catch {
    setSynraState("offline", "That backup import was not valid JSON.");
  }
}

async function saveServerManagedSecrets(settings: ModelSettings, voice: VoiceSettings, product: ProductSettings, homeAssistant: HomeAssistantSettings): Promise<void> {
  const response = await fetch("/api/secrets/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: { apiKey: settings.apiKey },
      voice: {
        provider: voice.provider,
        elevenLabsApiKey: voice.elevenLabsApiKey,
        elevenLabsVoiceId: voice.elevenLabsVoiceId,
        elevenLabsVoiceName: voice.elevenLabsVoiceName,
        elevenLabsModelId: voice.elevenLabsModelId,
        elevenLabsOutputFormat: voice.elevenLabsOutputFormat,
        elevenLabsStability: String(voice.elevenLabsStability),
        elevenLabsSimilarityBoost: String(voice.elevenLabsSimilarityBoost),
        chatterboxModel: voice.chatterboxModel,
        chatterboxDevice: voice.chatterboxDevice,
        chatterboxVoicePromptPath: voice.chatterboxVoicePromptPath,
        chatterboxLanguageId: voice.chatterboxLanguageId
      },
      product: {
        nodeSparkHubUrl: product.nodeSparkHubUrl,
        nodeSparkDeviceName: product.nodeSparkDeviceName,
        nodeSparkHubId: product.nodeSparkHubId,
        nodeSparkDeviceToken: product.nodeSparkDeviceToken,
        nodeSparkTokenExpiresAt: product.nodeSparkTokenExpiresAt
      },
      homeAssistant: {
        url: homeAssistant.url,
        token: homeAssistant.token,
        defaultLightEntity: homeAssistant.defaultLightEntity
      }
    })
  });
  const result = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok || !result.ok) {
    throw new Error(result.error ?? "Synra could not save server-managed secrets.");
  }
}

async function saveDurableServerSettings(): Promise<void> {
  const response = await fetch("/api/settings/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: durableServerSettingsPayload() })
  });
  const result = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok || !result.ok) {
    throw new Error(result.error ?? "Synra could not hard-save settings on the Jetson.");
  }
}

function saveVisualSettingsEverywhere(): void {
  saveVisualSettings(state.visual);
  void saveDurableServerSettings().catch(() => {
    setConnectionTruth("ai", "configured", "Server route; durable visual save pending");
  });
}

function saveCompanionSettingsEverywhere(): void {
  saveCompanionSettings(state.companionSettings);
  void saveDurableServerSettings().catch(() => {
    setConnectionTruth("ai", "configured", "Server route; durable companion save pending");
  });
}

function saveMemoryEverywhere(): void {
  saveMemory(state.memory);
  void saveDurableServerSettings().catch(() => {
    setConnectionTruth("ai", "configured", "Server route; durable memory save pending");
  });
}

function durableServerSettingsPayload(): DurableServerSettings {
  const { apiKey: _modelApiKey, ...model } = state.settings;
  const { elevenLabsApiKey: _elevenLabsApiKey, ...voice } = state.voiceSettings;
  const { token: _homeAssistantToken, ...homeAssistant } = state.homeAssistantSettings;
  const { nodeSparkDeviceToken: _nodeSparkDeviceToken, ...product } = ensureNodeSparkDeviceId(state.productSettings);
  return {
    model,
    voice,
    homeAssistant,
    product,
    visual: state.visual,
    companion: {
      ...state.companionSettings,
      identityReadiness: identityReadinessSummary(),
      knownUsers: state.companionSettings.knownUsers.map((user) => ({ ...user, faceSamples: [], facePoseSamples: {} }))
    },
    memory: state.memory
  };
}

function applyDurableServerSettings(savedSettings: DurableServerSettings | undefined): void {
  if (!savedSettings) return;
  if (savedSettings.model) {
    state.settings = {
      ...state.settings,
      provider: resolveModelProvider(String(savedSettings.model.provider ?? state.settings.provider)),
      endpoint: String(savedSettings.model.endpoint ?? state.settings.endpoint),
      model: String(savedSettings.model.model ?? state.settings.model),
      temperature: Number.isFinite(Number(savedSettings.model.temperature)) ? Math.min(Math.max(Number(savedSettings.model.temperature), 0), 2) : state.settings.temperature,
      systemPrompt: String(savedSettings.model.systemPrompt ?? state.settings.systemPrompt)
    };
    saveModelSettings(state.settings);
  }
  if (savedSettings.voice) {
    state.voiceSettings = {
      ...state.voiceSettings,
      provider: resolveVoiceProvider(String(savedSettings.voice.provider ?? state.voiceSettings.provider)),
      browserVoiceURI: String(savedSettings.voice.browserVoiceURI ?? state.voiceSettings.browserVoiceURI),
      browserVoiceName: String(savedSettings.voice.browserVoiceName ?? state.voiceSettings.browserVoiceName),
      elevenLabsVoiceId: String(savedSettings.voice.elevenLabsVoiceId ?? state.voiceSettings.elevenLabsVoiceId),
      elevenLabsVoiceName: String(savedSettings.voice.elevenLabsVoiceName ?? state.voiceSettings.elevenLabsVoiceName),
      elevenLabsModelId: String(savedSettings.voice.elevenLabsModelId ?? state.voiceSettings.elevenLabsModelId),
      elevenLabsOutputFormat: String(savedSettings.voice.elevenLabsOutputFormat ?? state.voiceSettings.elevenLabsOutputFormat),
      elevenLabsStability: clampUnit(Number(savedSettings.voice.elevenLabsStability), state.voiceSettings.elevenLabsStability),
      elevenLabsSimilarityBoost: clampUnit(Number(savedSettings.voice.elevenLabsSimilarityBoost), state.voiceSettings.elevenLabsSimilarityBoost),
      chatterboxModel: resolveChatterboxModel(String(savedSettings.voice.chatterboxModel ?? state.voiceSettings.chatterboxModel)),
      chatterboxDevice: resolveChatterboxDevice(String(savedSettings.voice.chatterboxDevice ?? state.voiceSettings.chatterboxDevice)),
      chatterboxVoicePromptPath: String(savedSettings.voice.chatterboxVoicePromptPath ?? state.voiceSettings.chatterboxVoicePromptPath),
      chatterboxLanguageId: String(savedSettings.voice.chatterboxLanguageId ?? state.voiceSettings.chatterboxLanguageId) || "en"
    };
    saveVoiceSettings(state.voiceSettings);
  }
  if (savedSettings.product) {
    state.productSettings = ensureNodeSparkDeviceId({
      ...state.productSettings,
      synraSkillMode: resolveSynraSkillMode(String(savedSettings.product.synraSkillMode ?? state.productSettings.synraSkillMode)),
      nodeSparkAccess: resolveNodeSparkAccess(String(savedSettings.product.nodeSparkAccess ?? state.productSettings.nodeSparkAccess)),
      nodeSparkHubUrl: String(savedSettings.product.nodeSparkHubUrl ?? state.productSettings.nodeSparkHubUrl),
      nodeSparkDeviceId: String(savedSettings.product.nodeSparkDeviceId ?? state.productSettings.nodeSparkDeviceId),
      nodeSparkDeviceName: String(savedSettings.product.nodeSparkDeviceName ?? state.productSettings.nodeSparkDeviceName),
      nodeSparkHubId: String(savedSettings.product.nodeSparkHubId ?? state.productSettings.nodeSparkHubId),
      nodeSparkTokenExpiresAt: String(savedSettings.product.nodeSparkTokenExpiresAt ?? state.productSettings.nodeSparkTokenExpiresAt)
    });
    saveProductSettings(state.productSettings);
  }
  if (savedSettings.homeAssistant) {
    state.homeAssistantSettings = {
      ...state.homeAssistantSettings,
      enabled: savedSettings.homeAssistant.enabled === true || state.homeAssistantSettings.enabled,
      url: String(savedSettings.homeAssistant.url ?? state.homeAssistantSettings.url),
      defaultLightEntity: String(savedSettings.homeAssistant.defaultLightEntity ?? state.homeAssistantSettings.defaultLightEntity),
      confirmationPolicy: normalizeHomeAssistantConfirmationPolicy(String(savedSettings.homeAssistant.confirmationPolicy ?? state.homeAssistantSettings.confirmationPolicy)),
      knownEntities: normalizeHomeAssistantEntities(Array.isArray(savedSettings.homeAssistant.knownEntities) ? savedSettings.homeAssistant.knownEntities as HomeAssistantEntity[] : state.homeAssistantSettings.knownEntities)
    };
    saveHomeAssistantSettings(state.homeAssistantSettings);
  }
  if (savedSettings.visual) {
    state.visual = {
      ...state.visual,
      avatarId: isSynraAvatarId(String(savedSettings.visual.avatarId ?? "")) ? String(savedSettings.visual.avatarId) : state.visual.avatarId,
      motionId: String(savedSettings.visual.motionId ?? state.visual.motionId),
      motionCategoryId: resolveMotionCategory(String(savedSettings.visual.motionCategoryId ?? state.visual.motionCategoryId)).id,
      backgroundId: resolveBackground(String(savedSettings.visual.backgroundId ?? state.visual.backgroundId)).id,
      controlMode: savedSettings.visual.controlMode === "live" ? "live" : savedSettings.visual.controlMode === "manual" ? "manual" : state.visual.controlMode,
      renderQuality: resolveRenderQuality(savedSettings.visual.renderQuality)
    };
    saveVisualSettings(state.visual);
  }
  if (savedSettings.companion) {
    const companion = savedSettings.companion;
    state.companionSettings = {
      ...state.companionSettings,
      setupComplete: companion.setupComplete === true || state.companionSettings.setupComplete,
      ownerName: String(companion.ownerName ?? state.companionSettings.ownerName).slice(0, 80),
      wakeWordMode: normalizeWakeWordMode(String(companion.wakeWordMode ?? state.companionSettings.wakeWordMode)),
      wakePhrase: String(companion.wakePhrase ?? state.companionSettings.wakePhrase).slice(0, 40) || DEFAULT_WAKE_PHRASE,
      preferredMicrophoneId: String(companion.preferredMicrophoneId ?? state.companionSettings.preferredMicrophoneId).slice(0, 160),
      preferredCameraId: String(companion.preferredCameraId ?? state.companionSettings.preferredCameraId).slice(0, 160),
      screenTimeoutMinutes: normalizeScreenTimeout(Number(companion.screenTimeoutMinutes ?? state.companionSettings.screenTimeoutMinutes)),
      allowAlwaysListening: companion.allowAlwaysListening !== false,
      allowCameraRecognition: companion.allowCameraRecognition === true,
      allowFaceSampleStorage: companion.allowFaceSampleStorage === true,
      voiceMatchMode: normalizeVoiceMatchMode(String(companion.voiceMatchMode ?? state.companionSettings.voiceMatchMode)),
      voiceMatchSensitivity: normalizeVoiceMatchSensitivity(String(companion.voiceMatchSensitivity ?? state.companionSettings.voiceMatchSensitivity)),
      allowMemorySuggestions: companion.allowMemorySuggestions !== false,
      knownUsers: normalizeKnownUserProfiles(Array.isArray(companion.knownUsers) ? companion.knownUsers as KnownUserProfile[] : state.companionSettings.knownUsers)
    };
    saveCompanionSettings(state.companionSettings);
  }
  if (savedSettings.memory) {
    state.memory = {
      ...state.memory,
      preferredName: redactMemoryFact(String(savedSettings.memory.preferredName ?? state.memory.preferredName)).slice(0, 60),
      style: redactMemoryFact(String(savedSettings.memory.style ?? state.memory.style)).slice(0, 140) || "warm, direct, and useful",
      savedFacts: Array.isArray(savedSettings.memory.savedFacts) ? savedSettings.memory.savedFacts.map((item: unknown) => redactMemoryFact(String(item))).filter(Boolean).slice(-40) : state.memory.savedFacts,
      routines: Array.isArray(savedSettings.memory.routines) ? savedSettings.memory.routines.map((item: unknown) => redactMemoryFact(String(item))).filter(Boolean).slice(-24) : state.memory.routines,
      devices: Array.isArray(savedSettings.memory.devices) ? savedSettings.memory.devices.map((item: unknown) => redactMemoryFact(String(item))).filter(Boolean).slice(-24) : state.memory.devices,
      rooms: Array.isArray(savedSettings.memory.rooms) ? savedSettings.memory.rooms.map((item: unknown) => redactMemoryFact(String(item))).filter(Boolean).slice(-24) : state.memory.rooms,
      preferences: Array.isArray(savedSettings.memory.preferences) ? savedSettings.memory.preferences.map((item: unknown) => redactMemoryFact(String(item))).filter(Boolean).slice(-24) : state.memory.preferences
    };
    saveMemory(state.memory);
  }
}

async function hydrateServerManagedSettings(): Promise<void> {
  await migrateBrowserSecretsToServer();
  try {
    const response = await fetch("/api/settings/public", { cache: "no-store" });
    if (!response.ok) return;
    const result = (await response.json()) as PublicServerSettings;
    if (!result.ok) return;
    applyDurableServerSettings(result.savedSettings);

    const voice = result.voice;
    if (voice) {
      const stability = Number(voice.elevenLabsStability);
      const similarity = Number(voice.elevenLabsSimilarityBoost);
      const hasServerElevenLabs = voice.elevenLabsApiKeyConfigured === true || Boolean(voice.elevenLabsVoiceId?.trim());
      const serverProvider = resolveVoiceProvider(voice.provider || (hasServerElevenLabs ? "elevenLabs" : state.voiceSettings.provider));
      state.voiceSettings = {
        ...state.voiceSettings,
        provider: serverProvider,
        elevenLabsApiKey: voice.elevenLabsApiKeyConfigured ? SERVER_SECRET_SENTINEL : state.voiceSettings.elevenLabsApiKey,
        elevenLabsVoiceId: voice.elevenLabsVoiceId?.trim() || state.voiceSettings.elevenLabsVoiceId,
        elevenLabsVoiceName: voice.elevenLabsVoiceName?.trim() || state.voiceSettings.elevenLabsVoiceName,
        elevenLabsModelId: voice.elevenLabsModelId?.trim() || state.voiceSettings.elevenLabsModelId,
        elevenLabsOutputFormat: voice.elevenLabsOutputFormat?.trim() || state.voiceSettings.elevenLabsOutputFormat,
        elevenLabsStability: Number.isFinite(stability) ? stability : state.voiceSettings.elevenLabsStability,
        elevenLabsSimilarityBoost: Number.isFinite(similarity) ? similarity : state.voiceSettings.elevenLabsSimilarityBoost,
        chatterboxModel: resolveChatterboxModel(voice.chatterboxModel?.trim() || state.voiceSettings.chatterboxModel),
        chatterboxDevice: resolveChatterboxDevice(voice.chatterboxDevice?.trim() || state.voiceSettings.chatterboxDevice),
        chatterboxVoicePromptPath: voice.chatterboxVoicePromptPath?.trim() || state.voiceSettings.chatterboxVoicePromptPath,
        chatterboxLanguageId: voice.chatterboxLanguageId?.trim() || state.voiceSettings.chatterboxLanguageId || "en"
      };
      saveVoiceSettings(state.voiceSettings);
    }

    const product = result.product;
    if (product?.nodeSparkHubUrl?.trim() || product?.nodeSparkDeviceTokenConfigured) {
      state.productSettings = ensureNodeSparkDeviceId({
        ...state.productSettings,
        nodeSparkAccess: product.nodeSparkAccess === "subscriber" || product.nodeSparkDeviceTokenConfigured ? "subscriber" : state.productSettings.nodeSparkAccess,
        nodeSparkHubUrl: product.nodeSparkHubUrl?.trim() || state.productSettings.nodeSparkHubUrl,
        nodeSparkDeviceName: product.nodeSparkDeviceName?.trim() || state.productSettings.nodeSparkDeviceName || "Synra Standalone Jetson",
        nodeSparkHubId: product.nodeSparkHubId?.trim() || state.productSettings.nodeSparkHubId,
        nodeSparkDeviceToken: product.nodeSparkDeviceTokenConfigured ? SERVER_SECRET_SENTINEL : state.productSettings.nodeSparkDeviceToken,
        nodeSparkTokenExpiresAt: product.nodeSparkTokenExpiresAt?.trim() || state.productSettings.nodeSparkTokenExpiresAt
      });
      saveProductSettings(state.productSettings);
    }

    const home = result.homeAssistant;
    if (home?.url?.trim() || home?.tokenConfigured) {
      state.homeAssistantSettings = {
        ...state.homeAssistantSettings,
        enabled: home.enabled === true || state.homeAssistantSettings.enabled,
        url: home.url?.trim() || state.homeAssistantSettings.url,
        token: home.tokenConfigured ? SERVER_SECRET_SENTINEL : state.homeAssistantSettings.token,
        defaultLightEntity: home.defaultLightEntity?.trim() || state.homeAssistantSettings.defaultLightEntity,
        confirmationPolicy: normalizeHomeAssistantConfirmationPolicy(state.homeAssistantSettings.confirmationPolicy)
      };
      saveHomeAssistantSettings(state.homeAssistantSettings);
    }

    refreshSkillPanel();
    refreshNodeSparkPairingStatus();
    refreshVoiceStatus();
    refreshSystemHealthPanel();
    refreshAiConnectionPanel();
    void saveDurableServerSettings();
  } catch {
    setConnectionTruth("ai", "configured", "Server route; settings hydration unavailable");
  }
}

async function migrateBrowserSecretsToServer(): Promise<void> {
  const hasBrowserSecret =
    [state.settings.apiKey, state.voiceSettings.elevenLabsApiKey, state.productSettings.nodeSparkDeviceToken, state.homeAssistantSettings.token]
      .some((value) => value.trim() && !isServerManagedSecret(value));
  if (!hasBrowserSecret) return;
  try {
    await saveServerManagedSecrets(state.settings, state.voiceSettings, state.productSettings, state.homeAssistantSettings);
    saveModelSettings(state.settings);
    saveVoiceSettings(state.voiceSettings);
    saveProductSettings(state.productSettings);
    saveHomeAssistantSettings(state.homeAssistantSettings);
    setSynraState("idle", "Existing secrets were moved to server-managed storage.");
  } catch {
    setConnectionTruth("ai", "configured", "Server route; browser secret migration pending");
  }
}

function isServerManagedSecret(value: string | undefined): boolean {
  return value === SERVER_SECRET_SENTINEL;
}

function keepServerManagedSecret(inputValue: string | undefined, previousValue: string | undefined): string {
  const next = inputValue?.trim() ?? "";
  if (next) return next;
  return isServerManagedSecret(previousValue) ? SERVER_SECRET_SENTINEL : "";
}

function displaySecretValue(value: string | undefined): string {
  return isServerManagedSecret(value) ? "" : value ?? "";
}

function secretConfigured(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function publicHomeAssistantSettings(): Omit<HomeAssistantSettings, "token"> & { tokenConfigured: boolean } {
  return {
    enabled: state.homeAssistantSettings.enabled,
    url: endpointDisplayLabel(state.homeAssistantSettings.url),
    tokenConfigured: secretConfigured(state.homeAssistantSettings.token),
    defaultLightEntity: state.homeAssistantSettings.defaultLightEntity,
    confirmationPolicy: normalizeHomeAssistantConfirmationPolicy(state.homeAssistantSettings.confirmationPolicy),
    knownEntities: state.homeAssistantSettings.knownEntities
  };
}

function publicProductSettings(): Omit<ProductSettings, "nodeSparkDeviceToken"> & { nodeSparkDeviceTokenConfigured: boolean } {
  return {
    synraSkillMode: state.productSettings.synraSkillMode,
    nodeSparkAccess: state.productSettings.nodeSparkAccess,
    nodeSparkHubUrl: endpointDisplayLabel(state.productSettings.nodeSparkHubUrl),
    nodeSparkDeviceId: state.productSettings.nodeSparkDeviceId,
    nodeSparkDeviceName: state.productSettings.nodeSparkDeviceName,
    nodeSparkHubId: state.productSettings.nodeSparkHubId,
    nodeSparkTokenExpiresAt: state.productSettings.nodeSparkTokenExpiresAt,
    nodeSparkDeviceTokenConfigured: secretConfigured(state.productSettings.nodeSparkDeviceToken)
  };
}

function populateHomeAssistantEntitySelect(): void {
  const entities = normalizeHomeAssistantEntities(state.homeAssistantSettings.knownEntities);
  if (entities.length === 0) {
    homeAssistantEntitySelect.innerHTML = `<option value="">No discovered entities yet</option>`;
    homeAssistantEntitySelect.value = "";
    return;
  }
  homeAssistantEntitySelect.innerHTML = [
    `<option value="">Choose a discovered target</option>`,
    ...entities.map((entity) => `<option value="${escapeHtml(entity.entityId)}">${escapeHtml(entity.name)} (${escapeHtml(entity.entityId)})</option>`)
  ].join("");
  homeAssistantEntitySelect.value = entities.some((entity) => entity.entityId === homeAssistantLightEntityInput.value) ? homeAssistantLightEntityInput.value : "";
}

function normalizeHomeAssistantEntities(entities: HomeAssistantEntity[]): HomeAssistantEntity[] {
  const seen = new Set<string>();
  return entities
    .filter((entity) => entity.entityId && entity.name && entity.domain)
    .filter((entity) => {
      if (seen.has(entity.entityId)) return false;
      seen.add(entity.entityId);
      return true;
    })
    .slice(0, 200);
}

function resolveVoiceProvider(provider: string | undefined): VoiceProvider {
  if (provider === "elevenLabs" || provider === "chatterbox") return provider;
  return "browser";
}

function resolveChatterboxModel(value: string | undefined): VoiceSettings["chatterboxModel"] {
  if (value === "english" || value === "multilingual") return value;
  return "turbo";
}

function resolveChatterboxDevice(value: string | undefined): VoiceSettings["chatterboxDevice"] {
  if (value === "cuda" || value === "cpu") return value;
  return "auto";
}

function clampUnit(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : fallback;
}

function populateAvatarSelect(): void {
  avatarSelect.innerHTML = SYNRA_AVATARS
    .map((avatar) => `<option value="${avatar.id}">${avatar.label}</option>`)
    .join("");
  avatarSelect.value = resolveInitialAvatarId();
}

function populateBackgroundSelect(): void {
  backgroundSelect.innerHTML = SYNRA_BACKGROUNDS
    .map((background) => `<option value="${background.id}">${background.label}</option>`)
    .join("");
  backgroundSelect.value = resolveBackground(state.visual.backgroundId).id;
}

function populateQualitySelect(): void {
  qualitySelect.value = resolveRenderQuality(state.visual.renderQuality);
}

function applyRenderQuality(quality: RenderQuality): void {
  state.visual = { ...state.visual, renderQuality: quality };
  performanceProfile = resolvePerformanceProfile();
  document.body.dataset.renderQuality = quality;
  qualitySelect.value = quality;
  renderQualityStatusEl.textContent = renderQualityLabel(quality);
  if (quality === "performance") {
    state.performanceTier = "forced-low";
  } else {
    state.performanceTier = "normal";
  }
  applyPerformanceTier(state.performanceTier);
  refreshModelLabel();
  refreshAiConnectionPanel();
  refreshSettingsDisplayStatus();
}

function populateMotionCategorySelect(): void {
  motionCategorySelect.innerHTML = MOTION_CATEGORIES
    .map((category) => `<option value="${category.id}">${category.label}</option>`)
    .join("");
  motionCategorySelect.value = resolveMotionCategory(state.visual.motionCategoryId).id;
}

function populateMotionSelect(): void {
  const allClips = hubAvatarRuntime ? hubMotionClips : state.motionPlayer.listClips();
  const category = resolveMotionCategory(state.visual.motionCategoryId);
  const clips = filterClipsByCategory(allClips, category);
  if (hubAvatarRuntime && !hubMotionManifestReady) {
    motionSelect.innerHTML = `<option value="">Loading motions</option>`;
    activeMotionEl.textContent = "Motion manifest loading";
    return;
  }
  motionSelect.innerHTML = clips
    .map((clip) => `<option value="${clip.id}" title="${escapeHtml(clip.id)}">${escapeHtml(clip.label || clip.id)}</option>`)
    .join("");
  const fallback = category.id === "all" ? resolveMotionClipId("wave") : clips[0]?.id;
  const preferred = clips.some((clip) => clip.id === state.visual.motionId) ? state.visual.motionId : fallback ?? "";
  motionSelect.value = preferred;
  activeMotionEl.textContent = `${clips.length} ${category.label.toLowerCase()} ready`;
}

function applyHydratedVisualState(): void {
  const quality = resolveRenderQuality(state.visual.renderQuality);
  const background = resolveBackground(state.visual.backgroundId);
  const avatarId = resolveInitialAvatarId();
  const category = resolveMotionCategory(state.visual.motionCategoryId);

  applyRenderQuality(quality);
  backgroundSelect.value = background.id;
  avatarSelect.value = avatarId;
  motionCategorySelect.value = category.id;
  applyBackground(background);
  applyControlMode(resolveInitialControlMode());
}

async function playMotionRoute(actionOrClipId: string, options: { restart?: boolean; loop?: boolean; returnToIdle?: boolean } = {}): Promise<void> {
  if (hubAvatarRuntime) {
    try {
      if (!options.returnToIdle) window.clearTimeout(hubMotionReturnTimer);
      const mode = modeFromRoute(actionOrClipId);
      if (mode) {
        hubAvatarRuntime.setMode(mode, { playAuthoredLoop: mode !== "idle" && mode !== "speaking" });
        hubAvatarRuntime.setSpeaking(mode === "speaking");
      } else if (hubMotionClips.some((clip) => clip.id === actionOrClipId)) {
        await hubAvatarRuntime.playGeneratedClip(actionOrClipId);
      } else {
        hubAvatarRuntime.trigger(actionOrClipId as SynraActionName);
      }
      const played = resolveMotionClipId(actionOrClipId) ?? actionOrClipId;
      activeMotionEl.textContent = played;
      state.lastDisplayedMotionId = played;
      const hasMotionOption = [...motionSelect.options].some((option) => option.value === played);
      if (hasMotionOption && motionSelect.value !== played && resolveMotionClipId(motionSelect.value) !== played) {
        motionSelect.value = played;
      }
      if (options.returnToIdle && !options.loop) scheduleHubLivingIdleReturn(actionOrClipId);
    } catch (error) {
      activeMotionEl.textContent = error instanceof Error ? error.message : "Motion unavailable";
    }
    return;
  }
  const played = await state.motionPlayer.playAction(actionOrClipId, options);
  if (played) {
    activeMotionEl.textContent = played;
    state.lastDisplayedMotionId = played;
    const hasMotionOption = [...motionSelect.options].some((option) => option.value === played);
    if (hasMotionOption && motionSelect.value !== played && state.motionPlayer.resolveClipId(motionSelect.value) !== played) {
      motionSelect.value = played;
    }
  } else {
    activeMotionEl.textContent = state.motionPlayer.snapshot.lastError ?? "Motion unavailable";
  }
}

function scheduleHubLivingIdleReturn(actionOrClipId: string): void {
  if (!hubAvatarRuntime) return;
  const serial = ++hubMotionReturnSerial;
  const clipId = resolveMotionClipId(actionOrClipId) ?? actionOrClipId;
  const clip = hubMotionClips.find((item) => item.id === clipId);
  const baseDelay = clip?.loop ? 2600 : 5200;
  window.clearTimeout(hubMotionReturnTimer);
  hubMotionReturnTimer = window.setTimeout(() => {
    if (serial !== hubMotionReturnSerial || !hubAvatarRuntime) return;
    resetHubAvatarToStableIdle();
  }, baseDelay);
}

function resetHubAvatarToStableIdle(force = false): void {
  if (!hubAvatarRuntime) return;
  if (!force && (state.synra === "speaking" || state.synra === "listening" || state.synra === "thinking")) return;
  hubAvatarRuntime.stopMotionTest();
  hubAvatarRuntime.setMode("idle", { playAuthoredLoop: false });
  hubAvatarRuntime.setSpeaking(false);
  hubAvatarRuntime.setVisemes({ aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, open: 0 });
  activeMotionEl.textContent = "procedural idle";
}

function filterClipsByCategory(clips: SynraMotionClipSpec[], category: MotionCategory): SynraMotionClipSpec[] {
  if (category.id === "all") return clips;
  const routeClipIds = new Set((category.routeIds ?? []).map((routeId) => resolveMotionClipId(routeId)).filter(Boolean));
  const matches = clips.filter((clip) => {
    if (routeClipIds.has(clip.id)) return true;
    const haystack = `${clip.id} ${clip.label} ${(clip.actionIds ?? []).join(" ")}`.replaceAll("_", "").toLowerCase();
    return (category.match ?? []).some((needle) => haystack.includes(needle.replaceAll("_", "").toLowerCase()));
  });
  return matches.length > 0 ? matches : clips;
}

async function loadHubMotionManifest(): Promise<void> {
  if (!hubAvatarRuntime || hubMotionManifestReady) return;
  const response = await fetch("/motions/synra-motion-manifest.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Motion manifest failed: ${response.status}`);
  const manifest = (await response.json()) as { clips?: SynraMotionClipSpec[]; routes?: Record<string, string> };
  hubMotionClips = Array.isArray(manifest.clips) ? manifest.clips : [];
  hubMotionRoutes = new Map(Object.entries(manifest.routes ?? {}));
  hubMotionManifestReady = true;
}

function resolveMotionClipId(actionOrClipId: string): string | null {
  if (hubAvatarRuntime) {
    if (hubMotionClips.some((clip) => clip.id === actionOrClipId)) return actionOrClipId;
    return hubMotionRoutes.get(actionOrClipId) ?? null;
  }
  return state.motionPlayer.resolveClipId(actionOrClipId);
}

function modeFromRoute(route: string): SynraMode | null {
  if (route === "mode:idle" || route === "idle") return "idle";
  if (route === "mode:listening" || route === "listening") return "listening";
  if (route === "mode:thinking" || route === "thinking") return "thinking";
  if (route === "mode:speaking" || route === "speaking") return "speaking";
  return null;
}

function resolveInitialAvatarId(): SynraAvatarId {
  return isSynraAvatarId(state.visual.avatarId) ? state.visual.avatarId : DEFAULT_SYNRA_AVATAR_ID;
}

function resolveBackground(backgroundId: string): SynraBackground {
  return SYNRA_BACKGROUNDS.find((background) => background.id === backgroundId) ?? SYNRA_BACKGROUNDS[0];
}

function applyBackground(background: SynraBackground): void {
  document.documentElement.style.setProperty("--stage-image", `url("${background.url}")`);
  backgroundSelect.value = background.id;
  refreshSettingsDisplayStatus();
}

function resolveMotionCategory(categoryId: string): MotionCategory {
  return MOTION_CATEGORIES.find((category) => category.id === categoryId) ?? MOTION_CATEGORIES[1];
}

function resolveControlMode(mode: string): "live" | "manual" {
  return mode === "live" ? "live" : "manual";
}

function resolveInitialControlMode(): "live" | "manual" {
  const params = new URLSearchParams(window.location.search);
  if (runtimeMode === "kiosk" || params.get("live") === "1") return "live";
  return resolveControlMode(state.visual.controlMode);
}

function applyControlMode(mode: "live" | "manual"): void {
  state.visual = { ...state.visual, controlMode: mode };
  document.body.dataset.controlMode = mode;
  controlModeButton.textContent = mode === "manual" ? "Live Mode" : "Show Controls";
  controlModeButton.title = mode === "manual" ? "Hide tuning controls" : "Show tuning controls";
  refreshSettingsDisplayStatus();
}

async function playManualMotion(motionId: string): Promise<void> {
  playMotionButton.disabled = true;
  playMotionButton.textContent = "Playing";
  try {
    await playMotionRoute(motionId, { restart: true, returnToIdle: true });
  } finally {
    window.setTimeout(() => resetHubAvatarToStableIdle(), 5800);
    window.setTimeout(() => {
      playMotionButton.disabled = false;
      playMotionButton.textContent = "Play Motion";
    }, 450);
  }
}

async function loadAvatarById(avatarId: SynraAvatarId, options: { persist?: boolean } = {}): Promise<void> {
  const avatar = getSynraAvatar(avatarId);
  const shouldPersist = options.persist !== false;
  avatarSelect.value = avatar.id;
  setSynraState("idle", `Loading ${avatar.label}.`);
  if (hubAvatarRuntime) {
    await hubAvatarRuntime.setAvatar(avatar.url, avatar.label);
    state.visual = { ...state.visual, avatarId: avatar.id };
    if (shouldPersist) saveVisualSettingsEverywhere();
    setSynraState("idle", `${avatar.label} is ready.`);
    if (runtimeMode === "kiosk") {
      void playMotionRoute(KIOSK_IDLE_ROUTE, { loop: true, restart: true });
    } else {
      void playMotionRoute("wave", { restart: true, returnToIdle: true });
    }
    return;
  }
  await loadAvatar(avatar.url);
  state.visual = { ...state.visual, avatarId: avatar.id };
  if (shouldPersist) saveVisualSettingsEverywhere();
  setSynraState("idle", `${avatar.label} is ready.`);
  if (runtimeMode === "kiosk") {
    void playMotionRoute(KIOSK_IDLE_ROUTE, { loop: true, restart: true });
  } else {
    void playMotionRoute("wave", { restart: true, returnToIdle: true });
  }
}

async function loadAvatar(url: string): Promise<void> {
  if (state.vrm) {
    scene.remove(state.vrm.scene);
    VRMUtils.deepDispose(state.vrm.scene);
    state.motionPlayer.dispose();
    state.vrm = null;
  }
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm as VRM;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.combineMorphs(vrm);
  vrm.humanoid.resetNormalizedPose();
  vrm.scene.rotation.y = 0;
  prepareVrmForPreview(vrm);
  normalizeAvatarStagePlacement(vrm.scene);
  scene.add(vrm.scene);
  state.vrm = vrm;
  updateContactShadow();
  await state.motionPlayer.boot(vrm);
  state.motionPlayer.setReturnToIdleRoute(runtimeMode === "kiosk" ? KIOSK_IDLE_ROUTE : "mode:idle");
  populateMotionSelect();
}

function prepareVrmForPreview(vrm: VRM): void {
  vrm.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      sharpenAvatarMaterialTextures(material);
      material.needsUpdate = true;
    }
  });
}

function sharpenAvatarMaterialTextures(material: THREE.Material): void {
  const maxAnisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1;
  const materialRecord = material as unknown as Record<string, unknown>;
  for (const value of Object.values(materialRecord)) {
    if (!(value instanceof THREE.Texture)) continue;
    value.generateMipmaps = true;
    value.minFilter = THREE.LinearMipmapLinearFilter;
    value.magFilter = THREE.LinearFilter;
    value.anisotropy = Math.max(value.anisotropy || 1, Math.min(maxAnisotropy, 8));
    value.needsUpdate = true;
  }
}

function normalizeAvatarStagePlacement(root: THREE.Object3D): void {
  root.position.set(0, 0, 0);
  root.scale.setScalar(1);
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  if (size.y > 0.001) {
    const targetHeight = runtimeMode === "kiosk" ? STAGE_AVATAR_HEIGHT.kiosk : STAGE_AVATAR_HEIGHT.interactive;
    const scale = THREE.MathUtils.clamp(targetHeight / size.y, 0.74, 1.56);
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);
  }

  const scaledBox = new THREE.Box3().setFromObject(root);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);
  root.position.set(-scaledCenter.x, 0.015 - scaledBox.min.y, -scaledCenter.z);
}

async function handleUserText(text: string): Promise<void> {
  pushMessage("user", text);
  const localResult = await tryHandleLocalCommand(text);
  if (localResult) {
    state.lastRouteLabel = localResult.routeLabel ?? "direct";
    pushMessageWithCard("synra", localResult.text, localResult.card);
    if (localResult.motion) void playMotionRoute(localResult.motion, { restart: true, returnToIdle: true });
    speak(localResult.text);
    return;
  }
  const requestRoute = classifySynraRequest(text);
  state.lastRouteLabel = requestRoute.label;
  if (requestRoute.intent === "vision") {
    const visionResult = await analyzeVisionView(text);
    pushMessage("synra", visionResult.text);
    setSynraState(visionResult.motion === "concerned" ? "offline" : "idle", visionResult.text);
    if (visionResult.motion) void playMotionRoute(visionResult.motion, { restart: true, returnToIdle: true });
    speak(visionResult.text);
    return;
  }
  setSynraState("thinking", "Thinking.");
  let reply = "";
  try {
    reply = await askModel(state.settings, state.memory, state.messages, requestRoute.intent);
  } catch (error) {
    console.info("Synra local fallback", error);
    reply = localSynraReply(text);
  }
  pushMessage("synra", reply);
  speak(reply);
}

async function tryHandleLocalCommand(text: string): Promise<LocalCommandResult | null> {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;

  if (/^(stop|stop talking|stop speaking|quiet|be quiet|pause voice|cancel voice|stop listening)$/.test(normalized)) {
    stopVoiceActivity("Voice stopped.");
    return { text: "Voice stopped.", motion: "confirm" };
  }

  const pendingResult = await tryHandlePendingAction(normalized);
  if (pendingResult) return pendingResult;

  if (/^(cancel|stop|no|never mind|nevermind)$/.test(normalized)) {
    return { text: "There is no pending action to cancel.", motion: "deny" };
  }

  if (/^(confirm|yes|do it|go|proceed|okay|ok)$/.test(normalized)) {
    return { text: "There is no pending action to confirm.", motion: "ask_question" };
  }

  if (/^(synra[, ]+)?(help|commands|what can you do|what can i say)\??$/.test(normalized)) {
    return {
      text: "Free Synra can talk, remember approved preferences, report voice and camera status, switch avatars and backgrounds, tune render quality, and control configured Home Assistant lights using your confirmation policy. NodeSpark Command Center is available as a subscriber skill.",
      motion: "present"
    };
  }

  if (/\b(about synra|who made you|who built you|who created you|who is your developer|who owns you|ownership|developer|synryzen)\b/.test(normalized)) {
    return {
      text: "Synra Standalone is developed by Matthew C Elliott at Synryzen. I can run as a companion assistant, connect to Home Assistant when configured, and optionally connect to NodeSparkHub as a subscriber skill.",
      motion: "present",
      routeLabel: "About Synra"
    };
  }

  if (isNodeSparkCommandCenterRequest(normalized)) {
    return nodeSparkCommandCenterCommand(normalized);
  }

  if (/^(synra[, ]+)?(status|health|system status|jetson status)\??$/.test(normalized)) {
    return systemStatusCommand();
  }

  if (/\b(date|time|clock|today)\b/.test(normalized) && /\b(what|tell|show|status|check|is)\b/.test(normalized)) {
    return localToolCommand("date_time");
  }

  if (/\b(network|wifi|ip address|connection)\b/.test(normalized) && /\b(status|check|show|what|tell)\b/.test(normalized)) {
    return localToolCommand("network_status");
  }

  if (/\b(camera|vision|see|eyes)\b/.test(normalized) && /\b(status|check|available|permission|can you|enable|turn on)\b/.test(normalized)) {
    if (/\b(enable|turn on|open|allow|vision on|camera on)\b/.test(normalized)) {
      return setVisionEnabled(true);
    }
    return cameraStatusCommand(/\b(enable|turn on|open|allow)\b/.test(normalized));
  }

  if (/\b(what can you see|what do you see|what are you seeing|can you see|look at this|analyze view|analyze camera|describe the view|describe what you see|describe the scene|what am i holding|what is in my hand|what's in my hand|what am i wearing|use vision)\b/.test(normalized)) {
    return analyzeVisionView(text);
  }

  if (/\b(camera|vision|eyes)\b/.test(normalized) && /\b(off|disable|close|stop)\b/.test(normalized)) {
    return setVisionEnabled(false);
  }

  if (/\b(voice|audio|microphone|mic|speaker|speakers|sound|speak|listen)\b/.test(normalized) && /\b(status|check|available|permission|diagnostics|devices|can you|enable|turn on)\b/.test(normalized)) {
    return voiceStatusCommand(/\b(microphone|mic|listen|enable|turn on|open|allow)\b/.test(normalized));
  }

  if (/\b(clear|forget|delete)\b.*\b(memories|memory|remembered facts)\b/.test(normalized)) {
    state.memory = { ...state.memory, savedFacts: [], routines: [], devices: [], rooms: [], preferences: [] };
    saveMemoryEverywhere();
    return { text: "I cleared the remembered facts I was storing locally.", motion: "confirm" };
  }

  const nameMatch = text.match(/\b(?:call me|my name is)\s+([a-zA-Z][a-zA-Z0-9 .'-]{1,40})[.?!]?$/i);
  if (nameMatch?.[1]) {
    const preferredName = nameMatch[1].trim().replace(/[.?!]+$/, "");
    state.memory = { ...state.memory, preferredName };
    saveMemoryEverywhere();
    return { text: `Got it. I will call you ${preferredName}.`, motion: "confirm" };
  }

  const styleMatch = text.match(/\b(?:talk to me|respond|answer|be)\s+(?:in a\s+)?(.+?)(?:\s+style)?[.?!]?$/i);
  if (styleMatch?.[1] && /\b(style|tone|direct|short|detailed|casual|professional|friendly|technical|simple)\b/i.test(text)) {
    const style = styleMatch[1].trim().replace(/[.?!]+$/, "").slice(0, 120);
    state.memory = { ...state.memory, style };
    saveMemoryEverywhere();
    return { text: `I will use a ${style} style.`, motion: "confirm" };
  }

  const rememberMatch = text.match(/\bremember(?: that)?\s+(.+)/i);
  if (rememberMatch?.[1]) {
    const fact = redactMemoryFact(rememberMatch[1].trim().replace(/[.?!]+$/, ""));
    if (fact.length < 3) return { text: "Tell me the full thing you want me to remember.", motion: "ask_question" };
    const savedFacts = [...state.memory.savedFacts.filter((saved) => saved.toLowerCase() !== fact.toLowerCase()), fact].slice(-24);
    state.memory = { ...state.memory, savedFacts };
    saveMemoryEverywhere();
    return { text: `I will remember: ${fact}.`, motion: "confirm" };
  }

  const background = matchBackground(normalized);
  if (background) {
    state.visual = { ...state.visual, backgroundId: background.id };
    saveVisualSettingsEverywhere();
    applyBackground(background);
    return { text: `Switched the stage to ${background.label}.`, motion: "present" };
  }

  const avatarId = matchAvatar(normalized);
  if (avatarId) {
    const avatar = getSynraAvatar(avatarId);
    await loadAvatarById(avatarId);
    return { text: `I switched to ${avatar.label}.`, motion: "wave" };
  }

  if (/\b(show|open)\b.*\b(controls|panel)\b/.test(normalized)) {
    applyControlMode("manual");
    saveVisualSettingsEverywhere();
    return { text: "Controls are open.", motion: "present" };
  }

  if (/\b(hide|close)\b.*\b(controls|panel)\b/.test(normalized) || /\b(live mode|clean mode)\b/.test(normalized)) {
    applyControlMode("live");
    saveVisualSettingsEverywhere();
    return { text: "Live mode is on.", motion: "confirm" };
  }

  if (/\b(make her sharper|make synra sharper|sharper|less blurry|fix blur|high quality|quality sharp|sharp quality|render sharp)\b/.test(normalized)) {
    applyRenderQuality("sharp");
    saveVisualSettingsEverywhere();
    return { text: "Sharp render quality is on.", motion: "confirm" };
  }

  if (/\b(balanced quality|quality balanced|normal quality|render balanced)\b/.test(normalized)) {
    applyRenderQuality("balanced");
    saveVisualSettingsEverywhere();
    return { text: "Balanced render quality is on.", motion: "confirm" };
  }

  if (/\b(low power|low performance|quality low|performance low|performance quality|render performance)\b/.test(normalized)) {
    applyRenderQuality("performance");
    applyPerformanceTier("forced-low");
    saveVisualSettingsEverywhere();
    return { text: "Performance render quality is on.", motion: "confirm" };
  }

  if (/\b(normal performance|quality normal|restore performance|performance normal)\b/.test(normalized)) {
    applyRenderQuality("balanced");
    applyPerformanceTier("normal");
    saveVisualSettingsEverywhere();
    return { text: "Balanced visual mode is back on.", motion: "confirm" };
  }

  if (isListHomeAssistantTargetsRequest(normalized)) {
    return listHomeAssistantTargetsCommand();
  }

  const defaultTarget = matchHomeAssistantDefaultRequest(normalized);
  if (defaultTarget) return setHomeAssistantDefaultCommand(defaultTarget);

  const smartHomeAction = matchLightAction(normalized) ?? matchSmartHomeActionForKnownEntity(normalized);
  if (smartHomeAction) return prepareSmartHomeLightCommand(smartHomeAction, normalized);

  return null;
}

async function tryHandlePendingAction(normalized: string): Promise<LocalCommandResult | null> {
  if (!state.pendingAction) return null;
  const expired = performance.now() - state.pendingAction.createdAt > 20000;
  if (expired) {
    const label = state.pendingAction.label;
    state.pendingAction = null;
    if (/^(confirm|yes|do it|go|proceed|okay|ok)$/.test(normalized)) {
      return { text: `That ${label} request expired. Ask me again and I will prepare it.`, motion: "concerned" };
    }
    return null;
  }
  if (/^(cancel|stop|no|never mind|nevermind)$/.test(normalized)) {
    const label = state.pendingAction.label;
    state.pendingAction = null;
    return { text: `Canceled ${label}.`, motion: "deny" };
  }
  if (/^(confirm|yes|do it|go|proceed|okay|ok)$/.test(normalized)) {
    const action = state.pendingAction;
    state.pendingAction = null;
    if (action.type === "smart_home") return smartHomeLightCommand(action.action, action.entityId, action.confirmationToken);
    if (action.type === "nodespark_workflow") return runNodeSparkWorkflowCommand(action.workflowName, action.confirmationToken);
  }
  return null;
}

async function systemStatusCommand(): Promise<LocalCommandResult> {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const health = (await response.json()) as {
      ok?: boolean;
      uptimeSeconds?: number;
      model?: string;
      smartHomeConfigured?: boolean;
      cameraDevices?: CameraDeviceStatus[];
      cameraDeviceCount?: number;
      videoDeviceCount?: number;
      mediaDeviceCount?: number;
      identitySmoke?: unknown;
    };
    refreshSmartRecognitionFromHealth(health);
    const uptime = typeof health.uptimeSeconds === "number" ? `${Math.round(health.uptimeSeconds)} seconds` : "unknown";
    const smartHome = health.smartHomeConfigured ? "smart home configured" : "smart home not configured";
    updateServerVisionStatus(summarizeVisionDiagnostics(health));
    return {
      text: `System is online. Model: ${health.model ?? state.settings.model}. Uptime: ${uptime}. Render quality: ${renderQualityLabel(state.visual.renderQuality)}. Performance: ${state.performanceTier}. Voice: ${state.voiceStatus}. Vision: ${combinedVisionStatus()}. ${smartHome}.`,
      motion: "present"
    };
  } catch {
    return { text: `I am running locally. Render quality: ${renderQualityLabel(state.visual.renderQuality)}. Performance: ${state.performanceTier}. Voice: ${state.voiceStatus}. Vision: ${combinedVisionStatus()}.`, motion: "present" };
  }
}

async function localToolCommand(tool: "system_status" | "network_status" | "date_time"): Promise<LocalCommandResult> {
  try {
    const response = await fetch("/api/tools/local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool })
    });
    const data = (await response.json()) as { ok?: boolean; error?: string; result?: Record<string, unknown> };
    if (!data.ok) return { text: `Local tool failed: ${data.error ?? "unknown error"}`, motion: "concerned" };
    const result = data.result ?? {};
    if (tool === "date_time") {
      return { text: `Local time is ${String(result.localTime ?? "unknown")}.`, motion: "present" };
    }
    if (tool === "network_status") {
      const addresses = Array.isArray(result.addresses) ? result.addresses.join(", ") : "no IP address reported";
      return { text: `Network status: hostname ${String(result.hostname ?? "unknown")}; addresses ${addresses}.`, motion: "present" };
    }
    const memory = result.memory as { usedPercent?: number; availableMb?: number } | undefined;
    const load = Array.isArray(result.loadAverage) ? result.loadAverage.join(", ") : "unavailable";
    return { text: `System status: ${String(result.hostname ?? "Jetson")} on ${String(result.machine ?? "unknown hardware")}. Load average ${load}. Memory ${memory?.usedPercent ?? "unknown"} percent used.`, motion: "present" };
  } catch {
    return { text: "The local tool bridge is not reachable right now.", motion: "concerned" };
  }
}

async function runQuickLocalTool(tool: "system_status" | "network_status" | "date_time"): Promise<void> {
  const button = tool === "system_status" ? systemStatusButton : tool === "network_status" ? networkStatusButton : dateTimeButton;
  const previousText = button.textContent || "Run";
  button.disabled = true;
  button.textContent = "Checking";
  setSynraState("thinking", "Checking local status.");
  try {
    const result = await localToolCommand(tool);
    pushMessage("synra", result.text);
    setSynraState("idle", result.text);
    if (result.motion) void playMotionRoute(result.motion, { restart: true, returnToIdle: true });
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

async function cameraStatusCommand(requestAccess: boolean): Promise<LocalCommandResult> {
  if (requestAccess) {
    const allowed = await ensureCameraReady();
    await refreshServerVisionStatus();
    return allowed
      ? { text: `Camera access is available. ${state.serverVisionStatus}. I am not storing frames; vision processing still needs a configured vision skill.`, motion: "confirm" }
      : { text: `Camera access is not available right now. ${state.serverVisionStatus}. Check browser permission and the Jetson camera connection.`, motion: "concerned" };
  }
  await refreshVisionStatus();
  return { text: `Vision status: ${combinedVisionStatus()}. Say enable camera if you want me to request browser access.`, motion: "look_camera" };
}

async function setVisionEnabled(enabled: boolean): Promise<LocalCommandResult> {
  if (!enabled) {
    stopVisionStream();
    updateVisionStatus("Camera off");
    visionToggleButton.textContent = "Vision Off";
    visionToggleButton.dataset.active = "false";
    return { text: "Vision is off. Camera tracks are stopped.", motion: "confirm" };
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    updateVisionStatus("Camera API unavailable");
    visionToggleButton.textContent = "Vision Off";
    visionToggleButton.dataset.active = "false";
    return { text: "Vision cannot turn on because this browser does not expose camera access.", motion: "concerned" };
  }

  try {
    stopVisionStream();
    activeVisionStream = await openSelectedCameraStream();
    updateVisionStatus("Camera on");
    visionToggleButton.textContent = "Vision On";
    visionToggleButton.dataset.active = "true";
    await refreshServerVisionStatus();
    return { text: "Vision is on. I am not storing frames.", motion: "look_camera" };
  } catch {
    stopVisionStream();
    updateVisionStatus("Camera blocked");
    visionToggleButton.textContent = "Vision Off";
    visionToggleButton.dataset.active = "false";
    await refreshServerVisionStatus();
    return { text: "Vision could not turn on. Check browser permission and the Jetson camera connection.", motion: "concerned" };
  }
}

async function analyzeVisionView(userQuestion = "Describe what Synra can see. Keep it concise and helpful."): Promise<LocalCommandResult> {
  visionAnalyzeButton.disabled = true;
  const previousText = visionAnalyzeButton.textContent || "Analyze View";
  visionAnalyzeButton.textContent = "Analyzing";
  setSynraState("thinking", "Analyzing the camera view.");
  try {
    if (!activeVisionStream) {
      const enabled = await setVisionEnabled(true);
      if (!activeVisionStream) return enabled;
    }
    const imageBase64 = await captureVisionFrame();
    const response = await fetch("/api/vision/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64,
        prompt: buildVisionPrompt(userQuestion),
        endpoint: resolveModelProvider(state.settings.provider) === "server" ? "" : state.settings.endpoint,
        model: resolveModelProvider(state.settings.provider) === "server" ? "" : state.settings.model,
        apiKey: resolveModelProvider(state.settings.provider) === "server" ? "" : state.settings.apiKey
      })
    });
    const result = (await response.json()) as { ok?: boolean; text?: string; error?: string };
    if (!result.ok || !result.text) {
      return { text: `Vision analysis is not ready: ${result.error ?? "the vision model did not respond."}`, motion: "concerned" };
    }
    return { text: result.text, motion: "look_camera" };
  } catch {
    return { text: "Vision analysis could not capture a transient frame in this browser.", motion: "concerned" };
  } finally {
    visionAnalyzeButton.disabled = false;
    visionAnalyzeButton.textContent = previousText;
  }
}

async function runVisionAnalyzeButton(): Promise<void> {
  const result = await analyzeVisionView();
  pushMessage("synra", result.text);
  setSynraState(result.motion === "concerned" ? "offline" : "idle", result.text);
  if (result.motion) void playMotionRoute(result.motion, { restart: true, returnToIdle: true });
  speak(result.text);
}

function buildVisionPrompt(userQuestion: string): string {
  const cleaned = userQuestion.trim() || "Describe what Synra can see.";
  return [
    "Use the transient camera frame to answer the user's exact question.",
    "Be direct, specific, and honest. If an object is unclear, say what it looks like instead of pretending.",
    `User question: ${cleaned}`
  ].join("\n");
}

async function captureVisionFrame(): Promise<string> {
  if (!activeVisionStream) throw new Error("Vision is off.");
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = activeVisionStream;
  await video.play();
  await new Promise((resolve) => window.setTimeout(resolve, 160));
  const width = Math.min(960, video.videoWidth || 640);
  const height = Math.max(1, Math.round(width * ((video.videoHeight || 480) / (video.videoWidth || 640))));
  const frameCanvas = document.createElement("canvas");
  frameCanvas.width = width;
  frameCanvas.height = height;
  const context = frameCanvas.getContext("2d");
  if (!context) throw new Error("Canvas capture is unavailable.");
  context.drawImage(video, 0, 0, width, height);
  video.pause();
  video.srcObject = null;
  return frameCanvas.toDataURL("image/jpeg", 0.72);
}

function stopVisionStream(): void {
  if (!activeVisionStream) return;
  for (const track of activeVisionStream.getTracks()) track.stop();
  activeVisionStream = null;
}

async function voiceStatusCommand(requestAccess: boolean): Promise<LocalCommandResult> {
  refreshVoiceStatus();
  const diagnostics = await audioDeviceDiagnostics();
  if (!requestAccess) {
    return { text: `Voice status: ${state.voiceStatus}. ${diagnostics}. Say listen or press the microphone button when you want me to request microphone access.`, motion: "present" };
  }
  const micReady = await ensureMicrophoneReady();
  refreshVoiceStatus();
  const refreshedDiagnostics = await audioDeviceDiagnostics();
  return micReady
    ? { text: `Microphone access is available. Voice status: ${state.voiceStatus}. ${refreshedDiagnostics}.`, motion: "confirm" }
    : { text: `Microphone access is not available right now. ${refreshedDiagnostics}. Check Chromium media permissions and the Jetson audio input.`, motion: "concerned" };
}

async function ensureCameraReady(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) {
    updateVisionStatus("Camera API unavailable");
    return false;
  }
  try {
    const stream = await openSelectedCameraStream();
    for (const track of stream.getTracks()) track.stop();
    updateVisionStatus("Camera allowed");
    return true;
  } catch {
    updateVisionStatus("Camera blocked");
    return false;
  }
}

async function prepareServerConfirmation(kind: "smart_home" | "nodespark_workflow", label: string, details: Record<string, string>): Promise<string> {
  const response = await fetch("/api/confirmations/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, label, details })
  });
  const result = (await response.json()) as { ok?: boolean; confirmationToken?: string; error?: string };
  if (!response.ok || !result.ok || !result.confirmationToken) {
    throw new Error(result.error ?? `Could not prepare ${label}.`);
  }
  return result.confirmationToken;
}

async function prepareSmartHomeLightCommand(action: "turn_on" | "turn_off" | "toggle", normalized = ""): Promise<LocalCommandResult> {
  if (!nodeSparkModeAllowsHomeAssistant()) {
    return { text: "Synra is currently in NodeSparkHub Controller focus. Switch to Hybrid or Home Assistant companion to control smart-home devices.", motion: "ask_question" };
  }
  const configured = await smartHomeIsConfigured();
  const target = matchHomeAssistantEntity(normalized);
  if (!configured) return smartHomeLightCommand(action, target?.entityId);
  const targetLabel = target?.name ?? homeAssistantDefaultEntityLabel();
  const entityId = target?.entityId ?? state.homeAssistantSettings.defaultLightEntity;
  const label = action === "toggle" ? `toggle ${targetLabel}` : `turn ${targetLabel} ${action === "turn_on" ? "on" : "off"}`;
  const risk = smartHomeRiskLevel(action, entityId);
  if (shouldRunSmartHomeActionImmediately(action, entityId, risk)) {
    return smartHomeLightCommand(action, entityId);
  }
  let confirmationToken = "";
  try {
    confirmationToken = await prepareServerConfirmation("smart_home", label, { action, entityId });
  } catch (error) {
    return {
      text: `I could not prepare the smart-home confirmation: ${error instanceof Error ? error.message : "the local bridge did not respond."}`,
      motion: "concerned"
    };
  }
  state.pendingAction = {
    type: "smart_home",
    action,
    label,
    entityId: target?.entityId,
    confirmationToken,
    createdAt: performance.now()
  };
  return {
    text: `Ready to ${label}. Risk: ${risk}. Say confirm to run it, or cancel to stop.`,
    motion: "ask_question"
  };
}

function shouldRunSmartHomeActionImmediately(action: "turn_on" | "turn_off" | "toggle", entityId: string, risk = smartHomeRiskLevel(action, entityId)): boolean {
  const policy = normalizeHomeAssistantConfirmationPolicy(state.homeAssistantSettings.confirmationPolicy);
  if (policy === "alwaysConfirm") return false;
  const domain = entityId.split(".", 1)[0]?.toLowerCase() ?? "";
  if (policy === "trustedLights") return risk === "low" && ["light", "switch", "input_boolean"].includes(domain);
  return risk !== "high";
}

function isNodeSparkCommandCenterRequest(normalized: string): boolean {
  return /\b(nodespark|node spark|nodesparkhub|node spark hub|command center|workflow|workflows|automation|automations)\b/.test(normalized);
}

async function nodeSparkCommandCenterCommand(normalized: string): Promise<LocalCommandResult> {
  const access = resolveNodeSparkAccess(state.productSettings.nodeSparkAccess);
  const hubUrl = state.productSettings.nodeSparkHubUrl.trim();
  const isPaired = Boolean(state.productSettings.nodeSparkDeviceToken);
  if (access !== "subscriber") {
    return {
      text: "NodeSpark Command Center is a premium Synra skill for NodeSpark subscribers. Free Synra still works for conversation, memory, voice, camera status, and Home Assistant control. Open Skills when you are ready to connect NodeSpark.",
      motion: "present",
      routeLabel: "NodeSpark Command Center"
    };
  }
  if (!hubUrl) {
    return {
      text: "NodeSpark Command Center is enabled, but no NodeSparkHub URL is configured yet. Add the Hub URL in Skills before I check workflows or Hub status.",
      motion: "ask_question",
      routeLabel: "NodeSpark Command Center"
    };
  }
  if (!isPaired) {
    return {
      text: `NodeSparkHub is configured at ${endpointDisplayLabel(hubUrl)}, but this Synra device is not paired yet. Generate a pairing PIN in NodeSparkHub and enter it in Synra's NodeSparkHub settings.`,
      motion: "ask_question",
      routeLabel: "NodeSpark Command Center"
    };
  }
  if (/\b(workflows?|automations?)\b/.test(normalized) && /\b(list|show|what|available|which)\b/.test(normalized)) {
    return listNodeSparkWorkflowsCommand();
  }
  if (/\b(runs?|history|recent)\b/.test(normalized) && /\b(list|show|latest|recent|last|history)\b/.test(normalized)) {
    return /\b(latest|last)\b/.test(normalized) ? latestNodeSparkRunCommand() : listNodeSparkRunsCommand();
  }
  if (/\b(run|start|execute|launch|trigger)\b/.test(normalized)) {
    return prepareNodeSparkWorkflowRunCommand(normalized);
  }
  if (/\b(status|health|online|connected|connect|connection|linked|available|check)\b/.test(normalized)) {
    return checkNodeSparkStatusCommand();
  }
  return {
    text: `NodeSpark Command Center is paired with ${endpointDisplayLabel(hubUrl)}. Ask me to check NodeSpark status and I will verify the Hub endpoint directly.`,
    motion: "confirm",
    routeLabel: "NodeSpark Command Center"
  };
}

function nodeSparkModeAllowsHub(): boolean {
  return resolveSynraSkillMode(state.productSettings.synraSkillMode) !== "homeAssistant";
}

function nodeSparkModeAllowsHomeAssistant(): boolean {
  return resolveSynraSkillMode(state.productSettings.synraSkillMode) !== "nodeSparkHub";
}

function nodeSparkWorkflowNameFromText(normalized: string): string {
  const match = normalized.match(/\b(?:run|start|execute|launch|trigger)\s+(?:the\s+)?(?:workflow|automation)?\s*["']?([^"']{3,80})["']?$/);
  return (match?.[1] ?? "").replace(/\b(workflow|automation)$/i, "").trim();
}

function normalizeNodeSparkWorkflow(value: string | NodeSparkWorkflowSummary): NodeSparkWorkflowSummary {
  if (typeof value === "string") {
    const name = value.trim();
    return { name, status: name ? "available" : "", detail: "NodeSparkHub workflow" };
  }
  return {
    id: value.id?.trim(),
    name: value.name?.trim() || value.id?.trim() || "Unnamed workflow",
    status: value.status?.trim() || "available",
    detail: value.detail?.trim() || "NodeSparkHub workflow",
    lastRun: value.lastRun?.trim()
  };
}

function nodeSparkWorkflowStatusLabel(workflow: NodeSparkWorkflowSummary): string {
  const status = (workflow.status || "available").toLowerCase();
  if (status.includes("disable") || status.includes("off")) return "Disabled";
  if (status.includes("run") || status.includes("active")) return "Active";
  if (status.includes("ready")) return "Ready";
  return workflow.status || "Available";
}

function nodeSparkWorkflowStatusClass(workflow: NodeSparkWorkflowSummary): string {
  const status = (workflow.status || "").toLowerCase();
  if (status.includes("disable") || status.includes("off") || status.includes("error")) return "muted";
  if (status.includes("run") || status.includes("active") || status.includes("ready")) return "ready";
  return "available";
}

function nodeSparkWorkflowSubtext(workflow: NodeSparkWorkflowSummary): string {
  const detail = workflow.detail && workflow.detail !== "NodeSparkHub workflow" ? workflow.detail : "";
  const lastRun = workflow.lastRun ? `Last activity ${workflow.lastRun}` : "";
  return detail || lastRun || "Tap to prepare. Synra will ask before anything starts.";
}

async function callNodeSparkAction(action: string, workflowName = "", confirmationToken = ""): Promise<NodeSparkActionResponse> {
  const settings = state.productSettings;
  const response = await fetch("/api/nodespark/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      workflowName,
      confirmationToken,
      hubUrl: settings.nodeSparkHubUrl.trim(),
      deviceToken: settings.nodeSparkDeviceToken.trim(),
      deviceId: settings.nodeSparkDeviceId,
      deviceName: settings.nodeSparkDeviceName
    })
  });
  return (await response.json()) as NodeSparkActionResponse;
}

async function listNodeSparkWorkflowsCommand(): Promise<LocalCommandResult> {
  if (!nodeSparkModeAllowsHub()) return { text: "Synra is currently in Home Assistant companion focus. Switch to Hybrid or NodeSparkHub Controller to use Hub workflows.", motion: "ask_question", routeLabel: "NodeSpark Command Center" };
  setConnectionTruth("nodeSpark", "checking", "Listing workflows");
  try {
    const result = await callNodeSparkAction("workflows");
    if (!result.ok) {
      setConnectionTruth("nodeSpark", "unreachable", result.error ?? "Workflow list failed");
      return { text: `I could not list NodeSparkHub workflows: ${result.error ?? "unknown error"}`, motion: "concerned", routeLabel: "NodeSpark Command Center" };
    }
    setConnectionTruth("nodeSpark", "reachable", `${result.count ?? result.workflows?.length ?? 0} workflows`);
    const workflows = (result.workflows ?? [])
      .map(normalizeNodeSparkWorkflow)
      .filter((workflow) => workflow.name)
      .slice(0, 10);
    const hubLabel = endpointDisplayLabel(state.productSettings.nodeSparkHubUrl);
    return {
      text: workflows.length ? `I found ${result.count ?? workflows.length} NodeSparkHub workflows from ${hubLabel}. Tap one and I will prepare it without starting anything yet.` : "NodeSparkHub is connected, but I did not find saved workflows yet.",
      motion: "present",
      routeLabel: "NodeSpark Command Center",
      card: { kind: "nodespark_workflows", workflows, total: result.count ?? workflows.length, hubLabel, generatedAt: new Date().toISOString() }
    };
  } catch {
    setConnectionTruth("nodeSpark", "unreachable", "Local bridge could not list workflows");
    return { text: "I could not reach the local bridge to list NodeSparkHub workflows.", motion: "concerned", routeLabel: "NodeSpark Command Center" };
  }
}

async function prepareNodeSparkWorkflowFromTap(workflowName: string): Promise<void> {
  const result = await prepareNodeSparkWorkflowRunCommand(`run workflow ${workflowName}`);
  pushMessageWithCard("synra", result.text, result.card);
  setSynraState("idle", result.text);
  if (result.motion) void playMotionRoute(result.motion, { restart: true, returnToIdle: true });
}

async function listNodeSparkRunsCommand(): Promise<LocalCommandResult> {
  setConnectionTruth("nodeSpark", "checking", "Listing recent runs");
  try {
    const result = await callNodeSparkAction("runs");
    if (!result.ok) {
      setConnectionTruth("nodeSpark", "unreachable", result.error ?? "Run list failed");
      return { text: `I could not list NodeSparkHub runs: ${result.error ?? "unknown error"}`, motion: "concerned", routeLabel: "NodeSpark Command Center" };
    }
    const runs = (result.runs ?? []).slice(0, 5);
    setConnectionTruth("nodeSpark", "reachable", `${result.count ?? runs.length} runs`);
    return {
      text: runs.length ? `Recent NodeSparkHub runs: ${runs.map(formatNodeSparkRun).join("; ")}.` : "NodeSparkHub is connected, but there are no recent runs yet.",
      motion: "present",
      routeLabel: "NodeSpark Command Center"
    };
  } catch {
    setConnectionTruth("nodeSpark", "unreachable", "Local bridge could not list runs");
    return { text: "I could not reach the local bridge to list NodeSparkHub runs.", motion: "concerned", routeLabel: "NodeSpark Command Center" };
  }
}

async function latestNodeSparkRunCommand(): Promise<LocalCommandResult> {
  setConnectionTruth("nodeSpark", "checking", "Checking latest run");
  try {
    const result = await callNodeSparkAction("latestRun");
    if (!result.ok) {
      setConnectionTruth("nodeSpark", "unreachable", result.error ?? "Latest run failed");
      return { text: `I could not read the latest NodeSparkHub run: ${result.error ?? "unknown error"}`, motion: "concerned", routeLabel: "NodeSpark Command Center" };
    }
    setConnectionTruth("nodeSpark", "reachable", "Latest run reachable");
    return { text: `Latest NodeSparkHub run: ${formatNodeSparkRun(result.run)}.`, motion: "present", routeLabel: "NodeSpark Command Center" };
  } catch {
    setConnectionTruth("nodeSpark", "unreachable", "Local bridge could not check latest run");
    return { text: "I could not reach the local bridge to check the latest NodeSparkHub run.", motion: "concerned", routeLabel: "NodeSpark Command Center" };
  }
}

async function prepareNodeSparkWorkflowRunCommand(normalized: string): Promise<LocalCommandResult> {
  if (!nodeSparkModeAllowsHub()) return { text: "Synra is currently in Home Assistant companion focus. Switch to Hybrid or NodeSparkHub Controller before running Hub workflows.", motion: "ask_question", routeLabel: "NodeSpark Command Center" };
  const workflowName = nodeSparkWorkflowNameFromText(normalized);
  if (!workflowName) {
    return { text: "Tell me the exact NodeSparkHub workflow name to run. I will ask for confirmation before it starts.", motion: "ask_question", routeLabel: "NodeSpark Command Center" };
  }
  const hubUrl = state.productSettings.nodeSparkHubUrl.trim();
  let confirmationToken = "";
  try {
    confirmationToken = await prepareServerConfirmation("nodespark_workflow", `run NodeSparkHub workflow ${workflowName}`, { hubUrl, workflowName });
  } catch (error) {
    return {
      text: `I could not prepare the NodeSparkHub confirmation: ${error instanceof Error ? error.message : "the local bridge did not respond."}`,
      motion: "concerned",
      routeLabel: "NodeSpark Command Center"
    };
  }
  state.pendingAction = {
    type: "nodespark_workflow",
    workflowName,
    label: `run NodeSparkHub workflow ${workflowName}`,
    confirmationToken,
    createdAt: performance.now()
  };
  const hubLabel = endpointDisplayLabel(hubUrl);
  return {
    text: `I prepared ${workflowName}. Nothing has started yet. Review the card, then choose Run Workflow or Cancel.`,
    motion: "ask_question",
    routeLabel: "NodeSpark Command Center",
    card: {
      kind: "nodespark_confirmation",
      workflowName,
      risk: "medium",
      effect: "Starts this workflow on NodeSparkHub using this paired Synra device token.",
      hubLabel
    }
  };
}

async function runNodeSparkWorkflowCommand(workflowName: string, confirmationToken = ""): Promise<LocalCommandResult> {
  setConnectionTruth("nodeSpark", "checking", `Running ${workflowName}`);
  try {
    const result = await callNodeSparkAction("runWorkflow", workflowName, confirmationToken);
    if (!result.ok) {
      setConnectionTruth("nodeSpark", "unreachable", result.error ?? "Workflow run failed");
      return {
        text: `NodeSparkHub did not start ${workflowName}: ${result.error ?? "unknown error"}`,
        motion: "concerned",
        routeLabel: "NodeSpark Command Center",
        card: { kind: "nodespark_run_result", workflowName, status: "failed", error: result.error ?? "unknown error", hubLabel: endpointDisplayLabel(state.productSettings.nodeSparkHubUrl) }
      };
    }
    setConnectionTruth("nodeSpark", "reachable", `Started ${workflowName}`);
    return {
      text: `NodeSparkHub accepted the run for ${workflowName}. ${formatNodeSparkRun(result.run)}`,
      motion: "confirm",
      routeLabel: "NodeSpark Command Center",
      card: { kind: "nodespark_run_result", workflowName, status: "started", run: result.run, hubLabel: endpointDisplayLabel(state.productSettings.nodeSparkHubUrl) }
    };
  } catch {
    setConnectionTruth("nodeSpark", "unreachable", "Local bridge could not run workflow");
    return {
      text: `I could not reach the local bridge to run ${workflowName}.`,
      motion: "concerned",
      routeLabel: "NodeSpark Command Center",
      card: { kind: "nodespark_run_result", workflowName, status: "failed", error: "Local bridge could not run workflow", hubLabel: endpointDisplayLabel(state.productSettings.nodeSparkHubUrl) }
    };
  }
}

function formatNodeSparkRun(run: NodeSparkActionResponse["run"]): string {
  if (!run) return "no run details";
  const workflow = run.workflow || "workflow";
  const status = run.status || "status unknown";
  const id = run.id ? ` (${run.id.slice(0, 8)})` : "";
  return `${workflow} is ${status}${id}`;
}

async function pairNodeSparkHub(): Promise<void> {
  const next = readProductSettingsFromInputs();
  const hubUrl = next.nodeSparkHubUrl.trim();
  const code = nodeSparkPairingPinInput.value.trim();
  if (!hubUrl) {
    setConnectionTruth("nodeSpark", "not-configured", "Add NodeSparkHub URL");
    nodeSparkPairingStatusEl.textContent = "Add Hub URL first";
    return;
  }
  if (!code) {
    setConnectionTruth("nodeSpark", "not-configured", "Enter Hub PIN");
    nodeSparkPairingStatusEl.textContent = "Enter Hub PIN";
    return;
  }
  const previousText = pairNodeSparkButton.textContent || "Pair with PIN";
  pairNodeSparkButton.disabled = true;
  pairNodeSparkButton.textContent = "Pairing";
  setConnectionTruth("nodeSpark", "checking", "Pairing with Hub");
  try {
    const response = await fetch("/api/nodespark/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hubUrl,
        code,
        deviceId: next.nodeSparkDeviceId,
        deviceName: next.nodeSparkDeviceName
      })
    });
    const result = (await response.json()) as { ok?: boolean; error?: string; hubId?: string; deviceToken?: string; expiresAt?: string };
    if (!result.ok || !result.deviceToken) {
      setConnectionTruth("nodeSpark", "unreachable", result.error ?? "Pairing failed");
      nodeSparkPairingStatusEl.textContent = result.error ?? "Pairing failed";
      return;
    }
    state.productSettings = {
      ...next,
      nodeSparkAccess: "subscriber",
      nodeSparkHubId: result.hubId ?? "",
      nodeSparkDeviceToken: result.deviceToken,
      nodeSparkTokenExpiresAt: result.expiresAt ?? ""
    };
    nodeSparkAccessInput.value = "subscriber";
    nodeSparkPairingPinInput.value = "";
    saveProductSettings(state.productSettings);
    void saveDurableServerSettings();
    refreshNodeSparkPairingStatus();
    refreshSkillPanel();
    setConnectionTruth("nodeSpark", "reachable", nodeSparkPairingLabel());
    pushMessage("synra", "NodeSparkHub pairing is complete. I can now verify Hub status with this device token.");
  } catch {
    setConnectionTruth("nodeSpark", "unreachable", "Pairing bridge failed");
    nodeSparkPairingStatusEl.textContent = "Pairing bridge failed";
  } finally {
    pairNodeSparkButton.disabled = false;
    pairNodeSparkButton.textContent = previousText;
    refreshSystemHealthPanel();
  }
}

function forgetNodeSparkPairing(): void {
  state.productSettings = {
    ...readProductSettingsFromInputs(),
    nodeSparkHubId: "",
    nodeSparkDeviceToken: "",
    nodeSparkTokenExpiresAt: ""
  };
  nodeSparkPairingPinInput.value = "";
  saveProductSettings(state.productSettings);
  void saveDurableServerSettings();
  refreshNodeSparkPairingStatus();
  refreshSkillPanel();
  setConnectionTruth("nodeSpark", state.productSettings.nodeSparkHubUrl ? "configured" : "not-configured", state.productSettings.nodeSparkHubUrl ? "Hub URL saved; pairing cleared" : "Optional subscriber skill");
  refreshSystemHealthPanel();
  pushMessage("synra", "NodeSparkHub pairing was forgotten on this Synra device. The Hub URL is still saved, but I will need a new PIN before I can connect as a paired device.");
}

async function checkNodeSparkStatusCommand(): Promise<LocalCommandResult> {
  const access = resolveNodeSparkAccess(state.productSettings.nodeSparkAccess);
  const hubUrl = state.productSettings.nodeSparkHubUrl.trim();
  const deviceToken = state.productSettings.nodeSparkDeviceToken.trim();
  if (access !== "subscriber") {
    setConnectionTruth("nodeSpark", "not-configured", "Subscriber access is off");
    return {
      text: "NodeSpark status checks are part of the subscriber Command Center skill. Free Synra remains separate for companion and Home Assistant use.",
      motion: "present",
      routeLabel: "NodeSpark Command Center"
    };
  }
  if (!hubUrl) {
    setConnectionTruth("nodeSpark", "not-configured", "Add NodeSparkHub URL");
    return { text: "Add a NodeSparkHub URL in Skills before I check Hub status.", motion: "ask_question", routeLabel: "NodeSpark Command Center" };
  }
  if (!deviceToken) {
    setConnectionTruth("nodeSpark", "configured", "Pair with Hub PIN");
    return { text: "NodeSparkHub URL is saved, but this Synra device is not paired yet. Generate a PIN in NodeSparkHub, enter it in Synra settings, then I can connect with a device token.", motion: "ask_question", routeLabel: "NodeSpark Command Center" };
  }
  setConnectionTruth("nodeSpark", "checking", endpointDisplayLabel(hubUrl));
  try {
    const response = await fetch("/api/nodespark/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hubUrl, deviceToken })
    });
    const result = (await response.json()) as { ok?: boolean; error?: string; service?: string; version?: string; status?: string; path?: string };
    if (!result.ok) {
      setConnectionTruth("nodeSpark", "unreachable", result.error ?? "NodeSparkHub did not respond");
      return { text: `NodeSparkHub status check failed: ${result.error ?? "unknown error"}`, motion: "concerned", routeLabel: "NodeSpark Command Center" };
    }
    setConnectionTruth("nodeSpark", "reachable", result.service ? `${result.service}${result.version ? ` ${result.version}` : ""}` : "NodeSparkHub status reachable");
    return {
      text: `NodeSparkHub is ${result.status ?? "online"}${result.service ? ` as ${result.service}` : ""}${result.version ? ` version ${result.version}` : ""}. Status endpoint: ${result.path ?? "detected"}.`,
      motion: "confirm",
      routeLabel: "NodeSpark Command Center"
    };
  } catch {
    setConnectionTruth("nodeSpark", "unreachable", "Local bridge could not reach NodeSparkHub");
    return { text: "NodeSparkHub status check could not reach the local bridge.", motion: "concerned", routeLabel: "NodeSpark Command Center" };
  }
}

async function checkNodeSparkStatus(): Promise<void> {
  const previousText = nodeSparkStatusButton.textContent || "NodeSpark";
  nodeSparkStatusButton.disabled = true;
  nodeSparkStatusButton.textContent = "Checking";
  setSynraState("thinking", "Checking NodeSparkHub.");
  try {
    const result = await checkNodeSparkStatusCommand();
    pushMessageWithCard("synra", result.text, result.card);
    setSynraState("idle", result.text);
    if (result.motion) void playMotionRoute(result.motion, { restart: true, returnToIdle: true });
  } finally {
    nodeSparkStatusButton.disabled = false;
    nodeSparkStatusButton.textContent = previousText;
  }
}

async function runNodeSparkPanelCommand(button: HTMLButtonElement, progress: string, command: () => Promise<LocalCommandResult>): Promise<void> {
  const previousText = button.textContent || "Hub";
  button.disabled = true;
  button.textContent = "Wait";
  nodeSparkActionHintEl.textContent = progress;
  setSynraState("thinking", progress);
  try {
    const result = await command();
    pushMessageWithCard("synra", result.text, result.card);
    nodeSparkActionHintEl.textContent = result.routeLabel ? "Hub action complete." : "Action complete.";
    setSynraState(result.motion === "concerned" ? "offline" : "idle", result.text);
    if (result.motion) void playMotionRoute(result.motion, { restart: true, returnToIdle: true });
  } finally {
    button.disabled = false;
    button.textContent = previousText;
    refreshSkillPanel();
  }
}

async function runNodeSparkChatCardCommand(command: () => Promise<LocalCommandResult>): Promise<void> {
  setSynraState("thinking", "Checking NodeSparkHub.");
  try {
    const result = await command();
    pushMessageWithCard("synra", result.text, result.card);
    setSynraState(result.motion === "concerned" ? "offline" : "idle", result.text);
    if (result.motion) void playMotionRoute(result.motion, { restart: true, returnToIdle: true });
  } finally {
    refreshSkillPanel();
  }
}

async function smartHomeIsConfigured(): Promise<boolean> {
  if (homeAssistantSettingsReady(state.homeAssistantSettings)) return true;
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const health = (await response.json()) as { smartHomeConfigured?: boolean; identitySmoke?: unknown };
    refreshSmartRecognitionFromHealth(health);
    return health.smartHomeConfigured === true;
  } catch {
    return false;
  }
}

async function smartHomeLightCommand(action: "turn_on" | "turn_off" | "toggle", entityId?: string, confirmationToken = ""): Promise<LocalCommandResult> {
  setSynraState("thinking", "Checking smart home.");
  try {
    const response = await fetch("/api/tools/smart-home", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, entityId, confirmationToken, allowImmediate: shouldRunSmartHomeActionImmediately(action, entityId ?? state.homeAssistantSettings.defaultLightEntity), homeAssistant: homeAssistantToolPayload() })
    });
    const result = (await response.json()) as { ok?: boolean; configured?: boolean; entityId?: string; error?: string; risk?: string; confirmationRequired?: boolean };
    if (result.ok) {
      const target = friendlyHomeAssistantTargetName(result.entityId);
      const risk = result.risk ? ` Risk was ${result.risk}.` : "";
      const text = action === "toggle" ? `Done. I toggled ${target}.${risk}` : `Done. I turned ${target} ${action === "turn_on" ? "on" : "off"}.${risk}`;
      return { text, motion: "confirm" };
    }
    if (result.confirmationRequired) {
      return {
        text: "That smart-home confirmation expired or was not accepted. Ask me again and I will prepare a fresh confirmation.",
        motion: "ask_question"
      };
    }
    return {
      text: result.configured === false
        ? "Smart home control is not configured yet. Open Skills and add your Home Assistant URL, token, and default light entity."
        : `I could not control the light: ${result.error ?? "the smart-home tool did not complete."}`,
      motion: "concerned"
    };
  } catch {
    return { text: "I could not reach the smart-home tool right now.", motion: "concerned" };
  }
}

function smartHomeRiskLevel(action: "turn_on" | "turn_off" | "toggle", entityId: string): "low" | "medium" | "high" {
  const domain = entityId.split(".", 1)[0]?.toLowerCase() ?? "";
  if (["lock", "cover", "alarm_control_panel"].includes(domain)) return "high";
  if (["scene", "script", "climate"].includes(domain)) return "medium";
  if (["light", "switch", "input_boolean"].includes(domain) && ["turn_on", "turn_off", "toggle"].includes(action)) return "low";
  return "medium";
}

function homeAssistantSettingsReady(settings: HomeAssistantSettings): boolean {
  return settings.enabled && Boolean(settings.url.trim()) && Boolean(settings.token.trim());
}

function homeAssistantToolPayload(): Partial<HomeAssistantSettings> | null {
  if (!homeAssistantSettingsReady(state.homeAssistantSettings)) return null;
  return {
    enabled: true,
    url: state.homeAssistantSettings.url.trim(),
    token: state.homeAssistantSettings.token.trim(),
    defaultLightEntity: state.homeAssistantSettings.defaultLightEntity.trim(),
    confirmationPolicy: normalizeHomeAssistantConfirmationPolicy(state.homeAssistantSettings.confirmationPolicy),
    knownEntities: state.homeAssistantSettings.knownEntities
  };
}

function homeAssistantDefaultEntityLabel(): string {
  const entityId = state.homeAssistantSettings.defaultLightEntity.trim();
  const entity = state.homeAssistantSettings.knownEntities.find((known) => known.entityId === entityId);
  if (entity) return entity.name;
  return entityId ? entityId : "the default smart-home target";
}

function friendlyHomeAssistantTargetName(entityId: string | undefined): string {
  const id = (entityId ?? state.homeAssistantSettings.defaultLightEntity).trim();
  if (!id) return "the smart-home target";
  const entity = state.homeAssistantSettings.knownEntities.find((known) => known.entityId === id);
  return entity?.name ?? id;
}

function matchHomeAssistantEntity(normalized: string): HomeAssistantEntity | null {
  if (!normalized) return null;
  const candidates = normalizeHomeAssistantEntities(state.homeAssistantSettings.knownEntities);
  return candidates.find((entity) => {
    const entityWords = entity.entityId.replace(/^[^.]+\./, "").replaceAll("_", " ").toLowerCase();
    const name = entity.name.toLowerCase();
    return normalized.includes(entity.entityId.toLowerCase()) || normalized.includes(entityWords) || normalized.includes(name);
  }) ?? null;
}

function isListHomeAssistantTargetsRequest(normalized: string): boolean {
  return /\b(list|show|what|which)\b/.test(normalized)
    && /\b(home assistant|smart home|devices|targets|entities|lights|switches|scenes|scripts)\b/.test(normalized);
}

function listHomeAssistantTargetsCommand(): LocalCommandResult {
  const entities = normalizeHomeAssistantEntities(state.homeAssistantSettings.knownEntities);
  if (entities.length === 0) {
    return {
      text: "I do not have discovered Home Assistant targets yet. Open Skills, connect Home Assistant, then press Discover Home.",
      motion: "ask_question"
    };
  }
  const shown = entities.slice(0, 12).map((entity) => `${entity.name} (${entity.entityId})`);
  const suffix = entities.length > shown.length ? `, and ${entities.length - shown.length} more.` : ".";
  return {
    text: `I can target ${shown.join(", ")}${suffix}`,
    motion: "present"
  };
}

function matchHomeAssistantDefaultRequest(normalized: string): HomeAssistantEntity | null {
  if (!/\b(default|main|primary)\b/.test(normalized)) return null;
  if (!/\b(set|use|make|choose|select)\b/.test(normalized)) return null;
  if (!/\b(home assistant|smart home|target|device|light|switch|scene|script)\b/.test(normalized)) return null;
  return matchHomeAssistantEntity(normalized);
}

function setHomeAssistantDefaultCommand(entity: HomeAssistantEntity): LocalCommandResult {
  state.homeAssistantSettings = {
    ...state.homeAssistantSettings,
    defaultLightEntity: entity.entityId
  };
  homeAssistantLightEntityInput.value = entity.entityId;
  saveHomeAssistantSettings(state.homeAssistantSettings);
  void saveDurableServerSettings();
  populateHomeAssistantEntitySelect();
  refreshSkillPanel();
  return {
    text: `${entity.name} is now the default Home Assistant target.`,
    motion: "confirm"
  };
}

function matchBackground(normalized: string): SynraBackground | null {
  if (!/\b(background|stage|scene|room)\b/.test(normalized)) return null;
  return SYNRA_BACKGROUNDS.find((background) => {
    const label = background.label.toLowerCase();
    return normalized.includes(background.id.replaceAll("-", " ")) || normalized.includes(label);
  }) ?? null;
}

function matchAvatar(normalized: string): SynraAvatarId | null {
  if (!/\b(avatar|character|switch to|change to)\b/.test(normalized)) return null;
  const found = SYNRA_AVATARS.find((avatar) => normalized.includes(avatar.id) || normalized.includes(avatar.label.toLowerCase()));
  return found?.id ?? null;
}

function matchLightAction(normalized: string): "turn_on" | "turn_off" | "toggle" | null {
  if (!/\b(light|lights|lamp|lamps|switch|switches|scene|scenes|script|scripts)\b/.test(normalized)) return null;
  return parseSmartHomeAction(normalized, true);
}

function matchSmartHomeActionForKnownEntity(normalized: string): "turn_on" | "turn_off" | "toggle" | null {
  if (!matchHomeAssistantEntity(normalized)) return null;
  return parseSmartHomeAction(normalized, false);
}

function parseSmartHomeAction(normalized: string, allowSwitchAsToggle: boolean): "turn_on" | "turn_off" | "toggle" | null {
  if (/\b(on|enable|activate|open)\b/.test(normalized)) return "turn_on";
  if (/\b(off|disable|deactivate|close)\b/.test(normalized)) return "turn_off";
  if (/\b(toggle)\b/.test(normalized)) return "toggle";
  if (allowSwitchAsToggle && /\bswitch\b/.test(normalized)) return "toggle";
  return null;
}

function speak(text: string): void {
  const serial = ++speechSerial;
  stopElevenLabsAudio();
  clearSpeechFallback();
  void unlockAudioPlayback();
  if (canUseElevenLabsSpeech()) {
    void playElevenLabsSpeech(text, serial);
    return;
  }
  if (canUseChatterboxSpeech()) {
    void playChatterboxSpeech(text, serial);
    return;
  }
  fallbackToBrowserSpeech(text, serial);
}

function canUseElevenLabsSpeech(settings = state.voiceSettings): boolean {
  return settings.provider === "elevenLabs" && Boolean(settings.elevenLabsVoiceId.trim());
}

function canUseChatterboxSpeech(settings = state.voiceSettings): boolean {
  return settings.provider === "chatterbox";
}

async function unlockAudioPlayback(): Promise<boolean> {
  if (state.audioUnlocked) return true;
  try {
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      state.audioUnlocked = true;
      return true;
    }
    const context = new AudioContextCtor();
    if (context.state === "suspended") await context.resume();
    await context.close();
    state.audioUnlocked = true;
    if (state.voiceStatus === "Playback blocked") refreshVoiceStatus();
    return true;
  } catch {
    updateVoiceStatus("Playback blocked");
    setConnectionTruth("voice", "permission-needed", "Playback blocked until the kiosk, browser, or output device allows audio");
    return false;
  }
}

async function playElevenLabsSpeech(text: string, serial: number): Promise<void> {
  clearSpeechFallback();
  const abort = new AbortController();
  activeSpeechAbort = abort;
  updateVoiceStatus("Preparing voice");
  setSynraState("speaking", text);
  armSpeechFallback(text, serial, "fallback");
  try {
    const response = await fetch("/api/tts/elevenlabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abort.signal,
      body: JSON.stringify({
        text,
        apiKey: state.voiceSettings.elevenLabsApiKey,
        voiceId: state.voiceSettings.elevenLabsVoiceId,
        modelId: state.voiceSettings.elevenLabsModelId,
        outputFormat: state.voiceSettings.elevenLabsOutputFormat,
        stability: state.voiceSettings.elevenLabsStability,
        similarityBoost: state.voiceSettings.elevenLabsSimilarityBoost
      })
    });
    const data = await response.json() as {
      ok?: boolean;
      error?: string;
      audioBase64?: string;
      mimeType?: string;
      alignment?: ElevenLabsSpeechAlignment | null;
      normalizedAlignment?: ElevenLabsSpeechAlignment | null;
    };
    if (serial !== speechSerial) return;
    if (!data.ok || !data.audioBase64) throw new Error(data.error || "ElevenLabs returned no audio.");
    const audioUrl = URL.createObjectURL(base64ToBlob(data.audioBase64, data.mimeType || "audio/mpeg"));
    const audio = new Audio(audioUrl);
    activeSpeechAudio = audio;
    audio.onplay = () => {
      if (serial !== speechSerial) return;
      clearSpeechFallback();
      updateVoiceStatus("ElevenLabs speaking");
      startSpeechLipSync(text, serial, audio, data.normalizedAlignment ?? data.alignment ?? null);
    };
    audio.onended = () => {
      if (activeSpeechAudio === audio) activeSpeechAudio = null;
      URL.revokeObjectURL(audioUrl);
      if (serial === speechSerial) finishSpeech(text);
    };
    audio.onerror = () => {
      if (activeSpeechAudio === audio) activeSpeechAudio = null;
      URL.revokeObjectURL(audioUrl);
      if (serial === speechSerial) fallbackToBrowserSpeech(text, serial);
    };
    await audio.play().catch((error) => {
      updateVoiceStatus("Playback blocked");
      setConnectionTruth("voice", "permission-needed", "Playback blocked by the browser or output device");
      throw error;
    });
  } catch (error) {
    if (abort.signal.aborted || serial !== speechSerial) return;
    updateVoiceStatus(state.voiceStatus === "Playback blocked" ? "Playback blocked" : "ElevenLabs fallback");
    fallbackToBrowserSpeech(text, serial);
  } finally {
    if (activeSpeechAbort === abort) activeSpeechAbort = null;
  }
}

async function playChatterboxSpeech(text: string, serial: number): Promise<void> {
  clearSpeechFallback();
  const abort = new AbortController();
  let didTimeout = false;
  activeSpeechAbort = abort;
  updateVoiceStatus("Preparing Chatterbox");
  setSynraState("speaking", text);
  armSpeechFallback(text, serial, "fallback");
  const timeoutId = window.setTimeout(() => {
    didTimeout = true;
    abort.abort();
  }, 25000);
  try {
    const response = await fetch("/api/tts/chatterbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abort.signal,
      body: JSON.stringify({
        text,
        model: state.voiceSettings.chatterboxModel,
        device: state.voiceSettings.chatterboxDevice,
        voicePromptPath: state.voiceSettings.chatterboxVoicePromptPath,
        languageId: state.voiceSettings.chatterboxLanguageId
      })
    });
    const data = await response.json() as {
      ok?: boolean;
      error?: string;
      audioBase64?: string;
      mimeType?: string;
      model?: string;
      device?: string;
    };
    if (serial !== speechSerial) return;
    if (!data.ok || !data.audioBase64) throw new Error(data.error || "Chatterbox returned no audio.");
    const audioUrl = URL.createObjectURL(base64ToBlob(data.audioBase64, data.mimeType || "audio/wav"));
    const audio = new Audio(audioUrl);
    activeSpeechAudio = audio;
    audio.onplay = () => {
      if (serial !== speechSerial) return;
      clearSpeechFallback();
      updateVoiceStatus("Chatterbox speaking");
      startSpeechLipSync(text, serial, audio, null);
    };
    audio.onended = () => {
      if (activeSpeechAudio === audio) activeSpeechAudio = null;
      URL.revokeObjectURL(audioUrl);
      if (serial === speechSerial) finishSpeech(text);
    };
    audio.onerror = () => {
      if (activeSpeechAudio === audio) activeSpeechAudio = null;
      URL.revokeObjectURL(audioUrl);
      if (serial === speechSerial) fallbackToBrowserSpeech(text, serial);
    };
    await audio.play().catch((error) => {
      updateVoiceStatus("Playback blocked");
      setConnectionTruth("voice", "permission-needed", "Playback blocked by the browser or output device");
      throw error;
    });
    setConnectionTruth("voice", "ready", `Chatterbox ${data.model || state.voiceSettings.chatterboxModel} voice playing locally`);
  } catch (error) {
    if (abort.signal.aborted && !didTimeout) return;
    if (serial !== speechSerial) return;
    const message = error instanceof Error ? error.message : "Chatterbox speech failed.";
    if (didTimeout) {
      updateVoiceStatus("Chatterbox timeout");
      setConnectionTruth("voice", "configured", "Chatterbox local voice took too long; using browser fallback for this reply");
      fallbackToBrowserSpeech(text, serial);
      return;
    }
    updateVoiceStatus(state.voiceStatus === "Playback blocked" ? "Playback blocked" : "Chatterbox fallback");
    setConnectionTruth("voice", "unreachable", message.slice(0, 140));
    fallbackToBrowserSpeech(text, serial);
  } finally {
    window.clearTimeout(timeoutId);
    if (activeSpeechAbort === abort) activeSpeechAbort = null;
  }
}

function fallbackToBrowserSpeech(text: string, serial = speechSerial): void {
  clearSpeechFallback();
  if (!("speechSynthesis" in window)) {
    updateVoiceStatus("Text only");
    setSynraState("speaking", text);
    startSpeechLipSync(text, serial);
    armSpeechFallback(text, serial);
    return;
  }
  updateVoiceStatus("Speaking");
  speechSynthesis.cancel();
  setSynraState("speaking", text);
  const utterance = new SpeechSynthesisUtterance(text);
  const browserVoice = selectedBrowserVoice();
  if (browserVoice) utterance.voice = browserVoice;
  utterance.rate = 0.96;
  utterance.pitch = 1.04;
  utterance.onstart = () => {
    if (serial !== speechSerial) return;
    setSynraState("speaking", text);
    startSpeechLipSync(text, serial);
  };
  utterance.onend = () => {
    if (serial === speechSerial) finishSpeech(text);
  };
  utterance.onerror = () => {
    if (serial !== speechSerial) return;
    updateVoiceStatus("Speech blocked");
    setConnectionTruth("voice", "permission-needed", "Browser speech was blocked or no output device is available");
    finishSpeech(text);
  };
  armSpeechFallback(text, serial);
  speechSynthesis.speak(utterance);
}

function stopVoiceActivity(caption = "Voice stopped."): void {
  speechSerial += 1;
  clearSpeechFallback();
  stopSpeechLipSync();
  stopElevenLabsAudio();
  activeSpeechAbort?.abort();
  activeSpeechAbort = null;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (activeRecognition) {
    try {
      activeRecognition.abort?.();
      activeRecognition.stop?.();
    } catch {
      // Some Chromium speech backends throw when stopped outside an active session.
    }
    activeRecognition = null;
  }
  listenButton.disabled = false;
  updateVoiceStatus("Stopped");
  setSynraState("idle", caption);
  if (!micInteractionActive && state.companionSettings.wakeWordMode === "local" && state.companionSettings.allowAlwaysListening) {
    window.setTimeout(() => void startWakeWordListening(), 700);
  }
}

function stopElevenLabsAudio(): void {
  stopSpeechLipSync();
  if (!activeSpeechAudio) return;
  activeSpeechAudio.pause();
  URL.revokeObjectURL(activeSpeechAudio.src);
  activeSpeechAudio = null;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function armSpeechFallback(text: string, serial = speechSerial, mode: "finish" | "fallback" = "finish"): void {
  const duration = mode === "fallback" ? 9500 : Math.min(7200, Math.max(1200, text.length * 42));
  clearSpeechFallback();
  state.speechFallbackTimer = window.setTimeout(() => {
    if (serial !== speechSerial) return;
    if (mode === "fallback") {
      activeSpeechAbort?.abort();
      activeSpeechAbort = null;
      updateVoiceStatus("ElevenLabs fallback");
      fallbackToBrowserSpeech(text, serial);
      return;
    }
    finishSpeech(text);
  }, duration);
}

function finishSpeech(text: string): void {
  clearSpeechFallback();
  stopSpeechLipSync();
  refreshVoiceStatus();
  if (state.synra === "speaking") setSynraState("idle", text);
  resetHubAvatarToStableIdle();
  if (state.companionSettings.wakeWordMode === "local" && state.companionSettings.allowAlwaysListening) {
    window.setTimeout(() => void startWakeWordListening(), 700);
  }
}

function clearSpeechFallback(): void {
  if (!state.speechFallbackTimer) return;
  window.clearTimeout(state.speechFallbackTimer);
  state.speechFallbackTimer = 0;
}

function startSpeechLipSync(text: string, serial: number, audio?: HTMLAudioElement, alignment?: ElevenLabsSpeechAlignment | null): void {
  stopSpeechLipSync();
  hubAvatarRuntime?.setMode("speaking", { playAuthoredLoop: false });
  hubAvatarRuntime?.setSpeaking(true);
  const durationMs = estimateSpeechDurationMs(text);
  const startedAt = performance.now();
  const tick = () => {
    if (serial !== speechSerial || state.synra !== "speaking") {
      stopSpeechLipSync();
      return;
    }
    const audioDurationMs = audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 : durationMs;
    const elapsedMs = audio ? audio.currentTime * 1000 : performance.now() - startedAt;
    const ratio = Math.max(0, Math.min(1, elapsedMs / Math.max(700, audioDurationMs)));
    const charIndex = speechCharacterIndexAtAlignment(text, elapsedMs / 1000, alignment) ?? ratio * Math.max(0, text.length - 1);
    hubAvatarRuntime?.setVisemes(visemesForSpeechPosition(text, charIndex, 0.18, {
      ratio,
      durationMs: audioDurationMs,
      source: "timer"
    }));
  };
  tick();
  activeLipSyncTimer = window.setInterval(tick, 32);
}

function speechCharacterIndexAtAlignment(text: string, seconds: number, alignment?: ElevenLabsSpeechAlignment | null): number | null {
  const starts = alignment?.characterStartTimesSeconds;
  const ends = alignment?.characterEndTimesSeconds;
  if (!starts?.length || !ends?.length) return null;
  const count = Math.min(starts.length, ends.length, text.length);
  if (count <= 0) return null;
  const clampedSeconds = Math.max(0, seconds);
  for (let index = 0; index < count; index += 1) {
    const start = Number(starts[index]);
    const end = Number(ends[index]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (clampedSeconds >= start && clampedSeconds <= Math.max(start, end)) return index;
  }
  if (clampedSeconds < Number(starts[0] ?? 0)) return 0;
  return count - 1;
}

function stopSpeechLipSync(): void {
  if (activeLipSyncTimer) {
    window.clearInterval(activeLipSyncTimer);
    activeLipSyncTimer = 0;
  }
  hubAvatarRuntime?.setVisemes({ aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, open: 0 });
  hubAvatarRuntime?.setSpeaking(false);
}

async function beginHoldToTalk(): Promise<void> {
  if (holdToTalkSession || activeRecognition) return;
  micInteractionActive = true;
  stopWakeWordListening("Awake");
  stopVoiceActivity("Listening.");
  prepareAvatarForCalmListening();
  updateVoiceStatus("Mic check");
  let sessionStarted = false;
  try {
    const micReady = await ensureMicrophoneReady();
    if (!micReady) {
      setSynraState("idle", "Microphone permission is not available yet.");
      updateVoiceStatus("Mic unavailable");
      finalizeMicInteraction(true);
      return;
    }
    if (shouldUseServerTranscriptionForCommand()) {
      holdToTalkSession = await recordAndTranscribeUntilStopped({ minRms: 0.008 });
    } else {
      const SpeechRecognitionCtor = speechRecognitionConstructor();
      if (!SpeechRecognitionCtor) {
        updateVoiceStatus("Listen unavailable");
        setSynraState("idle", "Speech recognition is not available in this browser yet. ElevenLabs speech-to-text is not configured.");
        finalizeMicInteraction(true);
        return;
      }
      holdToTalkSession = beginBrowserHoldToTalk(SpeechRecognitionCtor);
    }
    sessionStarted = true;
    listenButton.classList.add("holding");
    updateVoiceStatus("Hold to talk");
    setSynraState("listening", "Listening while you hold.");
    if (!holdToTalkPressed) {
      await finishHoldToTalk();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Microphone recording could not start.";
    updateVoiceStatus("Mic unavailable");
    setSynraState("idle", message);
    finalizeMicInteraction(false);
  } finally {
    if (!sessionStarted && micInteractionActive) {
      finalizeMicInteraction(true);
    }
  }
}

async function finishHoldToTalk(): Promise<void> {
  const session = holdToTalkSession;
  if (!session) return;
  holdToTalkSession = null;
  listenButton.classList.remove("holding");
  listenButton.disabled = true;
  updateVoiceStatus("Transcribing");
  setSynraState("thinking", "Heard you.");
  try {
    session.stop();
    const result = await withMicTranscriptionTimeout(session.finish(), 16000);
    const text = result.text.trim();
    if (!text) {
      updateVoiceStatus("No speech heard");
      setSynraState("idle", "I did not catch words that time.");
      return;
    }
    updateVoiceStatus("Heard you");
    await handleUserText(text);
  } catch (error) {
    session.cancel();
    const message = error instanceof Error ? error.message : "Microphone transcription failed.";
    updateVoiceStatus("Listen stopped");
    setSynraState("idle", message);
  } finally {
    finalizeMicInteraction(true);
  }
}

async function cancelHoldToTalk(message: string): Promise<void> {
  const session = holdToTalkSession;
  holdToTalkSession = null;
  listenButton.classList.remove("holding");
  session?.cancel();
  updateVoiceStatus("Listen stopped");
  setSynraState("idle", message);
  finalizeMicInteraction(true);
}

function finalizeMicInteraction(restartWakeWord: boolean): void {
  micInteractionActive = false;
  holdToTalkPressed = false;
  listenButton.classList.remove("holding");
  listenButton.disabled = false;
  if (!restartWakeWord) return;
  if (state.companionSettings.wakeWordMode === "local" && state.companionSettings.allowAlwaysListening) {
    window.setTimeout(() => void startWakeWordListening(), 700);
  }
}

function prepareAvatarForCalmListening(): void {
  window.clearTimeout(hubMotionReturnTimer);
  hubAvatarRuntime?.stopMotionTest();
  hubAvatarRuntime?.setMode("listening", { playAuthoredLoop: false });
  hubAvatarRuntime?.setSpeaking(false);
  hubAvatarRuntime?.setVisemes({ aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, open: 0 });
  activeMotionEl.textContent = "calm listening";
}

function withMicTranscriptionTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout = 0;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = window.setTimeout(() => reject(new Error("Microphone transcription timed out. Please try again.")), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) window.clearTimeout(timeout);
  });
}

function beginBrowserHoldToTalk(SpeechRecognitionCtor: SpeechRecognitionConstructor): HoldToTalkSession {
  let transcript = "";
  let finished = false;
  let resolveFinished: (result: { text: string }) => void = () => {};
  const finishPromise = new Promise<{ text: string }>((resolve) => {
    resolveFinished = resolve;
  });
  const recognition = new SpeechRecognitionCtor();
  activeRecognition = recognition;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.onstart = () => {
    updateVoiceStatus("Listening");
    setSynraState("listening", "Listening while you hold.");
  };
  recognition.onerror = () => {
    activeRecognition = null;
    if (!finished) {
      finished = true;
      resolveFinished({ text: transcript });
    }
  };
  recognition.onend = () => {
    if (activeRecognition === recognition) activeRecognition = null;
    if (!finished) {
      finished = true;
      resolveFinished({ text: transcript });
    }
  };
  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const heard: string[] = [];
    for (let index = 0; index < event.results.length; index += 1) {
      const text = event.results[index]?.[0]?.transcript?.trim();
      if (text) heard.push(text);
    }
    transcript = heard.join(" ").replace(/\s+/g, " ").trim();
    if (transcript) updateVoiceStatus("Listening");
  };
  recognition.start();
  return {
    source: "browser",
    startedAt: performance.now(),
    stop: () => {
      try {
        recognition.stop?.();
      } catch {
        if (!finished) {
          finished = true;
          resolveFinished({ text: transcript });
        }
      }
    },
    cancel: () => {
      try {
        recognition.abort?.();
      } catch {
        // Chromium can throw if recognition already ended.
      }
      if (!finished) {
        finished = true;
        resolveFinished({ text: "" });
      }
    },
    finish: () => finishPromise
  };
}

async function startListening(options: { forceBrowser?: boolean } = {}): Promise<void> {
  stopWakeWordListening("Awake");
  listenButton.disabled = true;
  updateVoiceStatus("Mic check");
  try {
    const micReady = await ensureMicrophoneReady();
    if (!micReady) {
      setSynraState("idle", "Microphone permission is not available yet.");
      updateVoiceStatus("Mic unavailable");
      return;
    }
  } finally {
    listenButton.disabled = false;
  }
  if (!options.forceBrowser && shouldUseServerTranscriptionForCommand()) {
    await startServerTranscriptionListening();
    return;
  }
  const SpeechRecognitionCtor = speechRecognitionConstructor();
  if (!SpeechRecognitionCtor) {
    if (!options.forceBrowser && canUseHealthyServerTranscription()) {
      await startServerTranscriptionListening();
      return;
    }
    updateVoiceStatus("Listen unavailable");
    setSynraState("idle", "Speech recognition is not available in this browser yet. ElevenLabs speech-to-text is not configured.");
    return;
  }
  const recognition = new SpeechRecognitionCtor();
  activeRecognition = recognition;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  let wakeCommandTranscript = "";
  let wakeCommandCommitTimer = 0;
  const commitWakeCommand = () => {
    if (!wakeCommandTranscript) return;
    const command = wakeCommandTranscript;
    wakeCommandTranscript = "";
    if (wakeCommandCommitTimer) {
      window.clearTimeout(wakeCommandCommitTimer);
      wakeCommandCommitTimer = 0;
    }
    try {
      recognition.stop?.();
    } catch {
      // Browser speech recognition may already be stopped.
    }
    if (activeRecognition === recognition) activeRecognition = null;
    setSynraState("thinking", "Heard you.");
    void handleUserText(command);
  };
  recognition.onstart = () => {
    updateVoiceStatus("Listening");
    setSynraState("listening", "Listening.");
  };
  recognition.onerror = () => {
    if (wakeCommandCommitTimer) window.clearTimeout(wakeCommandCommitTimer);
    activeRecognition = null;
    updateVoiceStatus("Listen stopped");
    setSynraState("idle", "Listening stopped.");
  };
  recognition.onend = () => {
    if (wakeCommandCommitTimer) window.clearTimeout(wakeCommandCommitTimer);
    if (wakeCommandTranscript) {
      commitWakeCommand();
      return;
    }
    if (activeRecognition === recognition) activeRecognition = null;
    refreshVoiceStatus();
    if (state.synra === "listening") setSynraState("idle", "Ready.");
    if (state.companionSettings.wakeWordMode === "local" && state.companionSettings.allowAlwaysListening) {
      window.setTimeout(() => void startWakeWordListening(), 700);
    }
  };
  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const heard: string[] = [];
    for (let index = 0; index < event.results.length; index += 1) {
      const heardText = event.results[index]?.[0]?.transcript?.trim();
      if (heardText) heard.push(heardText);
    }
    wakeCommandTranscript = heard.join(" ").replace(/\s+/g, " ").trim();
    if (!wakeCommandTranscript) return;
    updateVoiceStatus("Listening");
    if (wakeCommandCommitTimer) window.clearTimeout(wakeCommandCommitTimer);
    wakeCommandCommitTimer = window.setTimeout(commitWakeCommand, 1800);
  };
  setSynraState("listening", "Listening.");
  recognition.start();
}

async function startBrowserCommandListeningAfterServerFailure(message: string): Promise<void> {
  const SpeechRecognitionCtor = speechRecognitionConstructor();
  if (!SpeechRecognitionCtor) {
    updateVoiceStatus("Listen degraded");
    setSynraState("idle", message);
    return;
  }
  updateVoiceStatus("Using browser speech");
  await startListening({ forceBrowser: true });
}

async function startServerTranscriptionListening(options: { durationMs?: number; minRms?: number; prompt?: string; emptyCaption?: string } = {}): Promise<void> {
  listenButton.disabled = true;
  updateVoiceStatus("Listening");
  prepareAvatarForCalmListening();
  setSynraState("listening", options.prompt ?? "Listening.");
  try {
    const result = await recordAndTranscribeMicrophone({ durationMs: options.durationMs ?? 5200, minRms: options.minRms ?? 0.01 });
    const text = result.text.trim();
    if (!text) {
      updateVoiceStatus("No speech heard");
      setSynraState("idle", options.emptyCaption ?? "I did not catch words that time.");
      return;
    }
    recordServerTranscriptionSuccess();
    updateVoiceStatus("Heard you");
    setSynraState("thinking", "Heard you.");
    await handleUserText(text);
  } catch (error) {
    recordServerTranscriptionFailure(error);
    const message = error instanceof Error ? error.message : "Microphone transcription failed.";
    updateVoiceStatus("Listen stopped");
    await startBrowserCommandListeningAfterServerFailure(message);
  } finally {
    listenButton.disabled = false;
    if (state.companionSettings.wakeWordMode === "local" && state.companionSettings.allowAlwaysListening) {
      window.setTimeout(() => void startWakeWordListening(), 700);
    }
  }
}

async function recordAndTranscribeMicrophone(options: { durationMs: number; minRms: number }): Promise<TranscriptionResult> {
  const capture = await recordMicrophoneBlob(options);
  if (capture.peakRms < options.minRms) return { text: "" };
  const voicePrint = await createVoicePrintFromBlob(capture.blob).catch(() => undefined);
  const audioBase64 = await blobToBase64(capture.blob);
  const response = await fetch("/api/stt/elevenlabs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64,
      mimeType: capture.blob.type || "audio/webm",
      apiKey: state.voiceSettings.elevenLabsApiKey,
      languageCode: "en"
    })
  });
  const data = await response.json().catch(() => ({})) as { ok?: boolean; text?: string; error?: string };
  if (!response.ok) throw new Error(data.error || `ElevenLabs speech-to-text returned HTTP ${response.status}`);
  if (!data.ok && data.error) throw new Error(data.error);
  return { text: String(data.text || "").trim(), voicePrint };
}

async function recordMicrophoneBlob(options: { durationMs: number; minRms: number; onSignal?: (signal: MicrophoneSignal) => void }): Promise<MicrophoneCapture> {
  if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
    throw new Error("Microphone recording is not available in this kiosk/browser.");
  }
  const stream = await openSelectedMicrophoneStream();
  let audioContext: AudioContext | null = null;
  let sampleTimer = 0;
  let peakRms = 0;
  let lastSignal: MicrophoneSignal = { levelScore: 0, voiceIsolationScore: 0, backgroundNoiseScore: 0 };
  try {
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor) {
      audioContext = new AudioContextCtor();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      sampleTimer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        const rms = Math.sqrt(sum / samples.length);
        peakRms = Math.max(peakRms, rms);
        const levelScore = clampUnit(rms * 32, 0);
        const backgroundNoiseScore = clampUnit(1 - Math.max(0, rms - 0.01) * 8, 0.2);
        const voiceIsolationScore = clampUnit((levelScore * 0.72) + (backgroundNoiseScore * 0.28), 0);
        lastSignal = { levelScore, voiceIsolationScore, backgroundNoiseScore };
        options.onSignal?.(lastSignal);
      }, 120);
    }

    const mimeType = preferredAudioMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    await new Promise<void>((resolve, reject) => {
      recorder.onerror = () => reject(new Error("Microphone recorder failed."));
      recorder.onstop = () => resolve();
      recorder.start(250);
      window.setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, options.durationMs);
    });
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
    return { blob, peakRms, signal: lastSignal };
  } finally {
    if (sampleTimer) window.clearInterval(sampleTimer);
    for (const track of stream.getTracks()) track.stop();
    if (audioContext) void audioContext.close();
  }
}

async function createVoicePrintFromBlob(blob: Blob): Promise<VoicePrintSample> {
  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error("Voice Match needs Web Audio support.");
  const audioContext = new AudioContextCtor();
  try {
    const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
    const channel = audioBuffer.getChannelData(0);
    if (channel.length < 1600) throw new Error("Voice sample was too short.");
    const features: number[] = [];
    const frameLength = Math.max(512, Math.floor(channel.length / VOICE_PRINT_FRAME_COUNT));
    let voicedFrames = 0;
    let totalRms = 0;
    for (let frame = 0; frame < VOICE_PRINT_FRAME_COUNT; frame += 1) {
      const start = Math.min(channel.length - 1, frame * frameLength);
      const end = Math.min(channel.length, start + frameLength);
      let sumSquares = 0;
      let sumAbs = 0;
      let zeroCrossings = 0;
      let peak = 0;
      let previous = channel[start] ?? 0;
      for (let index = start; index < end; index += 1) {
        const sample = channel[index] ?? 0;
        sumSquares += sample * sample;
        sumAbs += Math.abs(sample);
        peak = Math.max(peak, Math.abs(sample));
        if ((previous < 0 && sample >= 0) || (previous >= 0 && sample < 0)) zeroCrossings += 1;
        previous = sample;
      }
      const count = Math.max(1, end - start);
      const rms = Math.sqrt(sumSquares / count);
      const meanAbs = sumAbs / count;
      const zcr = zeroCrossings / count;
      totalRms += rms;
      if (rms > 0.004) voicedFrames += 1;
      features.push(Math.log1p(rms * 80), Math.log1p(meanAbs * 90), Math.log1p(peak * 16), zcr * 24);
    }
    const duration = audioBuffer.duration || blob.size / 16000;
    features.push(Math.log1p(duration), voicedFrames / VOICE_PRINT_FRAME_COUNT, Math.log1p((totalRms / VOICE_PRINT_FRAME_COUNT) * 80));
    const normalized = normalizeVoiceFeatures(features);
    const quality = Math.min(1, Math.max(0, (voicedFrames / VOICE_PRINT_FRAME_COUNT) * 0.7 + Math.min(0.3, totalRms * 8)));
    if (quality < 0.12) throw new Error("Voice sample was too quiet.");
    return {
      id: `voice-${Date.now().toString(36)}`,
      features: normalized,
      quality,
      createdAt: new Date().toISOString()
    };
  } finally {
    void audioContext.close();
  }
}

function normalizeVoiceFeatures(features: number[]): number[] {
  const mean = features.reduce((sum, value) => sum + value, 0) / Math.max(1, features.length);
  const centered = features.map((value) => value - mean);
  const magnitude = Math.sqrt(centered.reduce((sum, value) => sum + value * value, 0)) || 1;
  return centered.map((value) => Number((value / magnitude).toFixed(6)));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    magA += left * left;
    magB += right * right;
  }
  return dot / ((Math.sqrt(magA) * Math.sqrt(magB)) || 1);
}

async function recordAndTranscribeUntilStopped(options: { minRms: number }): Promise<HoldToTalkSession> {
  if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
    throw new Error("Microphone recording is not available in this kiosk/browser.");
  }
  const stream = await openSelectedMicrophoneStream();
  let audioContext: AudioContext | null = null;
  let sampleTimer = 0;
  let peakRms = 0;
  let cancelled = false;
  const cleanup = (): void => {
    if (sampleTimer) window.clearInterval(sampleTimer);
    for (const track of stream.getTracks()) track.stop();
    if (audioContext) void audioContext.close();
  };

  try {
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor) {
      audioContext = new AudioContextCtor();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      sampleTimer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        peakRms = Math.max(peakRms, Math.sqrt(sum / samples.length));
      }, 90);
    }

    const mimeType = preferredAudioMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: BlobPart[] = [];
    const finishPromise = new Promise<{ text: string }>((resolve, reject) => {
      recorder.onerror = () => reject(new Error("Microphone recorder failed."));
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        try {
          if (cancelled || peakRms < options.minRms) {
            resolve({ text: "" });
            return;
          }
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
          const audioBase64 = await blobToBase64(blob);
          const response = await fetch("/api/stt/elevenlabs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audioBase64,
              mimeType: blob.type || "audio/webm",
              apiKey: state.voiceSettings.elevenLabsApiKey,
              languageCode: "en"
            })
          });
          const data = await response.json() as { ok?: boolean; text?: string; error?: string };
          if (!data.ok && data.error) throw new Error(data.error);
          resolve({ text: String(data.text || "").trim() });
        } catch (error) {
          reject(error);
        } finally {
          cleanup();
        }
      };
      recorder.start(250);
    });

    return {
      source: "server",
      startedAt: performance.now(),
      stop: () => {
        if (recorder.state !== "inactive") recorder.stop();
      },
      cancel: () => {
        cancelled = true;
        if (recorder.state !== "inactive") recorder.stop();
        else cleanup();
      },
      finish: () => finishPromise
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}

function preferredAudioMimeType(): string {
  const Recorder = window.MediaRecorder;
  if (!Recorder?.isTypeSupported) return "";
  for (const mimeType of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (Recorder.isTypeSupported(mimeType)) return mimeType;
  }
  return "";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Microphone audio could not be encoded."));
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",", 2)[1] || "" : result);
    };
    reader.readAsDataURL(blob);
  });
}

async function ensureMicrophoneReady(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return true;
  try {
    const stream = await openSelectedMicrophoneStream();
    for (const track of stream.getTracks()) track.stop();
    return true;
  } catch {
    return false;
  }
}

function refreshVoiceStatus(): void {
  updateBrowserVoiceStatus(browserVoiceStatusText());
  if (state.voiceSettings.provider === "elevenLabs") {
    const configured = Boolean(state.voiceSettings.elevenLabsApiKey && state.voiceSettings.elevenLabsVoiceId);
    const voiceName = state.voiceSettings.elevenLabsVoiceName || state.elevenLabsVoices.find((voice) => voice.voiceId === state.voiceSettings.elevenLabsVoiceId)?.name || "";
    updateVoiceStatus(configured ? "ElevenLabs ready" : "ElevenLabs needs setup");
    updateElevenLabsVoiceStatus(elevenLabsVoiceStatusText());
    setConnectionTruth("voice", configured ? "ready" : "not-configured", configured ? `ElevenLabs configured${voiceName ? `: ${voiceName}` : ""}` : "Add ElevenLabs API key and choose a voice");
    return;
  }
  if (state.voiceSettings.provider === "chatterbox") {
    updateVoiceStatus("Chatterbox selected");
    updateElevenLabsVoiceStatus(elevenLabsVoiceStatusText());
    updateChatterboxVoiceStatus(chatterboxVoiceStatusText());
    setConnectionTruth("voice", "configured", `Chatterbox ${state.voiceSettings.chatterboxModel} selected for local Jetson speech`);
    return;
  }
  const canSpeak = "speechSynthesis" in window;
  const canListen = Boolean(speechRecognitionConstructor() || canUseServerTranscription());
  if (canSpeak && canListen) updateVoiceStatus("Speak + listen");
  else if (canSpeak) updateVoiceStatus("Speak ready");
  else if (canListen) updateVoiceStatus("Listen ready");
  else updateVoiceStatus("Text ready");
  updateElevenLabsVoiceStatus(elevenLabsVoiceStatusText());
  updateChatterboxVoiceStatus(chatterboxVoiceStatusText());
  const selected = selectedBrowserVoice();
  const browserDetail = selected ? `Apple voice path available: ${selected.name}` : "Apple voice path available";
  setConnectionTruth("voice", canSpeak || canListen ? "ready" : "configured", canSpeak || canListen ? browserDetail : "Text input is available");
}

function updateVoiceStatus(label: string): void {
  state.voiceStatus = label;
  voiceStateEl.textContent = label;
}

async function audioDeviceDiagnostics(): Promise<string> {
  if (!navigator.mediaDevices?.enumerateDevices) return "Audio devices: browser device list unavailable.";
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((device) => device.kind === "audioinput");
    const outputs = devices.filter((device) => device.kind === "audiooutput");
    const inputLabel = inputs.length === 1 ? "1 input" : `${inputs.length} inputs`;
    const outputLabel = outputs.length === 1 ? "1 output" : `${outputs.length} outputs`;
    const selectedInput = state.companionSettings.preferredMicrophoneId
      ? inputs.find((device) => device.deviceId === state.companionSettings.preferredMicrophoneId)?.label || "saved mic unavailable"
      : "system default mic";
    return `Audio devices: ${inputLabel}, ${outputLabel}. Selected: ${selectedInput}.`;
  } catch {
    return "Audio devices: permission or browser policy blocked device diagnostics.";
  }
}

async function refreshVisionStatus(): Promise<void> {
  const serverStatus = refreshServerVisionStatus();
  if (!navigator.mediaDevices?.getUserMedia) {
    updateVisionStatus("Camera API unavailable");
    await serverStatus;
    return;
  }
  const permissionsApi = navigator.permissions as Permissions | undefined;
  if (!permissionsApi?.query) {
    updateVisionStatus("Camera available");
    await serverStatus;
    return;
  }
  try {
    const status = await permissionsApi.query({ name: "camera" as PermissionName });
    if (status.state === "granted") updateVisionStatus("Camera allowed");
    else if (status.state === "denied") updateVisionStatus("Camera blocked");
    else updateVisionStatus("Camera ready");
    status.onchange = () => {
      if (status.state === "granted") updateVisionStatus("Camera allowed");
      else if (status.state === "denied") updateVisionStatus("Camera blocked");
      else updateVisionStatus("Camera ready");
    };
  } catch {
    updateVisionStatus("Camera available");
  }
  await serverStatus;
}

function updateVisionStatus(label: string): void {
  state.visionStatus = label;
  visionStateEl.textContent = compactVisionStatus();
  visionToggleButton.textContent = activeVisionStream ? "Vision On" : "Vision Off";
  visionToggleButton.dataset.active = activeVisionStream ? "true" : "false";
  const normalized = label.toLowerCase();
  const status: ConnectionTruthStatus = activeVisionStream ? "reachable" : normalized.includes("blocked") ? "permission-needed" : normalized.includes("unavailable") ? "unreachable" : "off";
  setConnectionTruth("vision", status, activeVisionStream ? "Camera stream active" : label);
}

async function refreshServerVisionStatus(): Promise<void> {
  try {
    const response = await fetch("/api/vision/public", { cache: "no-store" });
    const status = (await response.json()) as VisionPublicStatus;
    updateServerVisionStatus(summarizeVisionDiagnostics(status));
  } catch {
    updateServerVisionStatus("Jetson camera diagnostics unavailable");
  }
}

function updateServerVisionStatus(label: string): void {
  state.serverVisionStatus = label;
  visionStateEl.textContent = compactVisionStatus();
}

function summarizeVisionDiagnostics(status: VisionPublicStatus): string {
  const devices = status.cameraDevices ?? [];
  const videoDevices = devices.filter((device) => device.kind === "video" && device.exists !== false);
  const mediaDevices = devices.filter((device) => device.kind === "media" && device.exists !== false);
  const count = typeof status.videoDeviceCount === "number" ? status.videoDeviceCount : typeof status.cameraDeviceCount === "number" ? status.cameraDeviceCount : videoDevices.length;
  const mediaCount = typeof status.mediaDeviceCount === "number" ? status.mediaDeviceCount : mediaDevices.length;
  const configured = devices.find((device) => device.configured);
  state.serverCameraDeviceCount = count;
  state.serverCameraConfiguredDevice = status.configuredDevice ?? configured?.path ?? "";

  if (configured) {
    return configured.exists === false
      ? `configured Jetson camera ${configured.path} is missing`
      : configured.kind === "video"
        ? `configured Jetson video camera ${configured.path} detected`
        : `configured Jetson media device ${configured.path} detected, but no video stream device is configured`;
  }
  if (count === 1) return "1 Jetson camera device detected";
  if (count > 1) return `${count} Jetson camera devices detected`;
  if (mediaCount > 0) return "Jetson media controller detected, but no video stream device found";
  return "no Jetson camera devices detected";
}

function compactVisionStatus(): string {
  const browser = state.visionStatus.replace("Camera ", "");
  const jetson = state.serverCameraDeviceCount === null ? "Jetson --" : `Jetson ${state.serverCameraDeviceCount}`;
  return `${browser} · ${jetson}`;
}

function combinedVisionStatus(): string {
  return `${state.visionStatus}; ${state.serverVisionStatus}`;
}

function render(now: number): void {
  requestAnimationFrame(render);
  if (shouldSkipStandaloneFrame(now)) return;
  const delta = state.clock.getDelta();
  updatePerformance(now);
  updateTelemetry(now);
  if (!renderer) return;
  updateAvatar(delta, now);
  updateIdleLife(now);
  renderer.render(scene, camera);
}

function shouldSkipStandaloneFrame(now: number): boolean {
  if (performanceProfile.frameIntervalMs <= 0) return false;
  if (state.lastRenderAt <= 0) {
    state.lastRenderAt = now;
    return false;
  }
  const elapsedMs = now - state.lastRenderAt;
  const toleranceMs = 1.25;
  if (elapsedMs + toleranceMs < performanceProfile.frameIntervalMs) return true;

  if (elapsedMs > 250) {
    state.lastRenderAt = now;
    return false;
  }
  const intervals = Math.max(1, Math.floor((elapsedMs + toleranceMs) / performanceProfile.frameIntervalMs));
  state.lastRenderAt += intervals * performanceProfile.frameIntervalMs;
  return false;
}

function createRenderer(): THREE.WebGLRenderer | null {
  try {
    const webglRenderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance"
    });
    webglRenderer.outputColorSpace = THREE.SRGBColorSpace;
    webglRenderer.toneMapping = THREE.NeutralToneMapping;
    webglRenderer.toneMappingExposure = 1;
    webglRenderer.setPixelRatio(resolveEffectivePixelRatio());
    return webglRenderer;
  } catch (error) {
    console.warn("Synra WebGL renderer unavailable", error);
    return null;
  }
}

function updateAvatar(delta: number, now: number): void {
  const vrm = state.vrm;
  if (!vrm) return;
  state.motionPlayer.update(delta);
  const talking = state.synra === "speaking";
  const thinking = state.synra === "thinking";
  const listening = state.synra === "listening";
  const t = now / 1000;
  const targetMouth = talking ? 0.18 + Math.abs(Math.sin(t * 9.5)) * 0.42 : 0;
  state.mouth += (targetMouth - state.mouth) * 0.32;
  if (now - state.lastBlinkAt > 2800 + Math.random() * 2000) {
    state.blink = 1;
    state.lastBlinkAt = now;
  }
  state.blink = Math.max(0, state.blink - delta * 7.5);

  vrm.expressionManager?.setValue("aa", state.mouth);
  vrm.expressionManager?.setValue("blink", state.blink);
  vrm.expressionManager?.setValue("happy", state.synra === "idle" ? 0.18 : 0.08);
  vrm.expressionManager?.setValue("surprised", listening ? 0.14 : 0);
  vrm.expressionManager?.setValue("relaxed", thinking ? 0.22 : 0.08);

  if (!state.motionPlayer.activeClipId) {
    const head = vrm.humanoid?.getNormalizedBoneNode("head");
    if (head) {
      head.rotation.y = Math.sin(t * 0.65) * (listening ? 0.1 : 0.055);
      head.rotation.x = Math.sin(t * 0.9) * (thinking ? 0.08 : 0.035);
      head.rotation.z = Math.sin(t * 0.48) * 0.025;
    }

    const chest = vrm.humanoid?.getNormalizedBoneNode("chest");
    if (chest) chest.rotation.y = Math.sin(t * 0.45) * 0.035;
    applyCompanionIdlePose(vrm, t, talking);
  }
  syncMotionStatus();
  vrm.update(delta);
  updateContactShadow();
}

function installContactShadow(): void {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 128;
  textureCanvas.height = 128;
  const context = textureCanvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 6, 64, 64, 58);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0.34)");
    gradient.addColorStop(0.58, "rgba(0, 0, 0, 0.14)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.PlaneGeometry(0.92, 0.34);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false
  });
  contactShadow = new THREE.Mesh(geometry, material);
  contactShadow.name = "SynraContactShadow";
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.set(0, 0.006, 0.03);
  contactShadow.renderOrder = -1;
  scene.add(contactShadow);
}

function updateContactShadow(): void {
  if (!contactShadow || !state.vrm) return;
  contactShadow.position.x = state.vrm.scene.position.x;
  contactShadow.position.z = state.vrm.scene.position.z + 0.025;
}

function syncMotionStatus(): void {
  const snapshot = state.motionPlayer.snapshot;
  const motionId = snapshot.activeClipId ?? snapshot.lastPlayedClipId ?? "";
  if (!motionId || motionId === state.lastDisplayedMotionId) return;
  activeMotionEl.textContent = motionId;
  state.lastDisplayedMotionId = motionId;
}

function applyCompanionIdlePose(vrm: VRM, t: number, talking: boolean): void {
  const leftUpperArm = vrm.humanoid?.getNormalizedBoneNode("leftUpperArm");
  const rightUpperArm = vrm.humanoid?.getNormalizedBoneNode("rightUpperArm");
  const leftLowerArm = vrm.humanoid?.getNormalizedBoneNode("leftLowerArm");
  const rightLowerArm = vrm.humanoid?.getNormalizedBoneNode("rightLowerArm");
  const leftHand = vrm.humanoid?.getNormalizedBoneNode("leftHand");
  const rightHand = vrm.humanoid?.getNormalizedBoneNode("rightHand");
  const beat = talking ? Math.sin(t * 7.2) * 0.08 : Math.sin(t * 0.8) * 0.025;
  if (leftUpperArm) {
    leftUpperArm.rotation.z = -1.18 - beat;
    leftUpperArm.rotation.x = 0.08;
  }
  if (rightUpperArm) {
    rightUpperArm.rotation.z = 1.18 + beat;
    rightUpperArm.rotation.x = 0.08;
  }
  if (leftLowerArm) leftLowerArm.rotation.z = -0.18 - beat * 0.4;
  if (rightLowerArm) rightLowerArm.rotation.z = 0.18 + beat * 0.4;
  if (leftHand) leftHand.rotation.z = 0.08;
  if (rightHand) rightHand.rotation.z = -0.08;
}

function updatePerformance(now: number): void {
  const frameMs = now - state.lastFrameAt;
  state.lastFrameAt = now;
  if (frameMs > 0) {
    state.frameSamples.push(1000 / frameMs);
    if (state.frameSamples.length > 30) state.frameSamples.shift();
    const avg = state.frameSamples.reduce((sum, sample) => sum + sample, 0) / state.frameSamples.length;
    state.fps = Math.round(avg);
    updatePerformanceTier(avg, now);
  }
  if (Math.round(now / 500) % 2 === 0) fpsEl.textContent = `${state.fps || "--"} FPS`;
}

function updatePerformanceTier(avgFps: number, now: number): void {
  if (state.performanceTier === "forced-low") return;
  const shouldAdapt = runtimeMode === "kiosk" || performanceProfile.name === "jetson";
  if (!shouldAdapt) return;
  const lowThreshold = Math.max(15, performanceProfile.targetFps - 4);
  const restoreThreshold = Math.max(17, performanceProfile.targetFps - 1);

  if (avgFps < lowThreshold) {
    state.lowFpsStartedAt ||= now;
    state.stableFpsStartedAt = 0;
    if (state.performanceTier !== "low" && now - state.lowFpsStartedAt > 3600) applyPerformanceTier("low");
    return;
  }

  state.lowFpsStartedAt = 0;
  if (avgFps >= restoreThreshold) {
    state.stableFpsStartedAt ||= now;
    if (state.performanceTier === "low" && now - state.stableFpsStartedAt > 9000) applyPerformanceTier("normal");
  } else {
    state.stableFpsStartedAt = 0;
  }
}

function updateTelemetry(now: number): void {
  if (!telemetryEnabled || now - state.lastTelemetryAt < 5000) return;
  state.lastTelemetryAt = now;
  const renderBuffer = renderer ? renderer.getDrawingBufferSize(new THREE.Vector2()) : null;
  const hubHealth = hubAvatarRuntime?.runtimeHealth() ?? null;
  const payload = {
    fps: state.fps,
    targetFps: hubHealth?.targetFps ?? performanceProfile.targetFps,
    renderScale: hubHealth?.adaptivePixelRatio ?? resolveEffectivePixelRatio(),
    renderWidth: renderBuffer?.x ?? hubHealth?.canvasWidth,
    renderHeight: renderBuffer?.y ?? hubHealth?.canvasHeight,
    performanceTier: state.performanceTier,
    renderQuality: state.visual.renderQuality,
    synraState: state.synra,
    avatarId: state.visual.avatarId,
    activeMotion: currentHubMotionId() ?? state.motionPlayer.snapshot.activeClipId,
    wakeWordStatus: state.wakeWordStatus,
    wakeWordLastHeard,
    wakeWordLastError,
    webgl: renderer || hubHealth?.webglReady ? "available" : "unavailable",
    runtimeMode,
    route: state.lastRouteLabel,
    wakeWordMicActive,
    serverWakeWordActive,
    serverTranscriptionStatus,
    serverTranscriptionFailureCount,
    serverTranscriptionBackoffActive: serverTranscriptionBackoffActive(),
    identityReadiness: identityReadinessSummary(),
    messageCount: state.messages.length
  };
  fetch("/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {});
}

function updateIdleLife(now: number): void {
  if (state.synra !== "idle") return;
  if (!hubAvatarRuntime && !state.motionPlayer.snapshot.ready) return;
  if (now < state.nextLifeMotionAt) return;
  state.lastLifeMotionAt = now;
  state.nextLifeMotionAt = now + randomBetween(runtimeMode === "kiosk" ? 22000 : 16000, runtimeMode === "kiosk" ? 42000 : 30000);
  if (now - state.lastPresenceNudgeAt > 90000) {
    state.lastPresenceNudgeAt = now;
    captionEl.textContent = PRESENCE_NUDGES[Math.floor(Math.random() * PRESENCE_NUDGES.length)];
  }
  if (runtimeMode === "kiosk") return;
  const route = IDLE_LIFE_GESTURES[Math.floor(Math.random() * IDLE_LIFE_GESTURES.length)];
  void playMotionRoute(route, { restart: true, returnToIdle: true });
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function setSynraState(next: SynraState, caption: string): void {
  const previousState = state.synra;
  state.synra = next;
  document.body.dataset.synraState = next;
  statusEl.textContent = next.charAt(0).toUpperCase() + next.slice(1);
  chatStatusEl.textContent = next === "idle" ? "Ready" : next.charAt(0).toUpperCase() + next.slice(1);
  presenceStateEl.textContent = next === "idle" ? "Ready" : next.charAt(0).toUpperCase() + next.slice(1);
  captionEl.textContent = caption;
  const shouldRestartStateMotion = previousState !== next || state.lastRenderedSynraState !== next;
  state.lastRenderedSynraState = next;
  if (!shouldRestartStateMotion) return;
  const route = routeForSynraState(next);
  if (hubAvatarRuntime) {
    const mode = modeFromState(next);
    const useAuthoredLoop = shouldUseAuthoredStateLoop(next);
    hubAvatarRuntime.setMode(mode, { playAuthoredLoop: useAuthoredLoop });
    hubAvatarRuntime.setSpeaking(next === "speaking");
    if (route && !route.startsWith("mode:") && next !== "speaking" && useAuthoredLoop) {
      void playMotionRoute(route, { loop: true, restart: next !== "idle" });
    }
    return;
  }
  if (route && state.motionPlayer.snapshot.ready) void playMotionRoute(route, { loop: true, restart: next !== "idle" });
}

function shouldUseAuthoredStateLoop(next: SynraState): boolean {
  return next !== "idle" && next !== "listening" && next !== "speaking";
}

function routeForSynraState(next: SynraState): string | null {
  const available = STATE_MOTION_VARIETY[next].filter((route) => Boolean(resolveMotionClipId(route)));
  if (available.length === 0) return null;
  if (runtimeMode === "kiosk" && next === "idle") {
    return available.includes(KIOSK_IDLE_ROUTE) ? KIOSK_IDLE_ROUTE : available[0];
  }
  const previous = state.lastAutoMotionByState[next];
  let nextRoute = available[Math.floor(Math.random() * available.length)];
  if (available.length > 1 && nextRoute === previous) {
    nextRoute = available[(available.indexOf(nextRoute) + 1) % available.length];
  }
  state.lastAutoMotionByState[next] = nextRoute;
  return nextRoute;
}

function modeFromState(next: SynraState): SynraMode {
  if (next === "listening") return "listening";
  if (next === "thinking") return "thinking";
  if (next === "speaking") return "speaking";
  return "idle";
}

function currentHubMotionId(): string | null {
  const debug = hubAvatarRuntime?.debugState() as { authoredMotion?: { channels?: Record<string, { clipId?: string }> } } | undefined;
  const channels = debug?.authoredMotion?.channels;
  return channels?.gesture?.clipId ?? channels?.gaze?.clipId ?? channels?.base?.clipId ?? null;
}

function pushMessage(role: SynraMessage["role"], text: string): void {
  pushMessageWithCard(role, text);
}

function pushMessageWithCard(role: SynraMessage["role"], text: string, card?: ChatCard): string {
  const id = createId();
  state.messages.push({
    id,
    role,
    text,
    createdAt: new Date().toISOString()
  });
  state.messages = state.messages.slice(-24);
  if (card) chatCardRegistry.set(id, card);
  pruneChatCardRegistry();
  renderChatMessages();
  return id;
}

function pruneChatCardRegistry(): void {
  const activeIds = new Set(state.messages.map((message) => message.id));
  for (const id of chatCardRegistry.keys()) {
    if (!activeIds.has(id)) chatCardRegistry.delete(id);
  }
}

function renderChatMessages(): void {
  if (state.messages.length === 0) {
    chatLogEl.innerHTML = `<div class="chat-empty">Ask Synra anything.</div>`;
    return;
  }
  chatLogEl.innerHTML = state.messages
    .map((message) => {
      const role = message.role === "user" ? "You" : message.role === "synra" ? "Synra" : "System";
      const time = shortTime(message.createdAt);
      return `
        <article class="chat-bubble ${message.role}">
          <div class="chat-meta">
            <span>${role}</span>
            <time>${time}</time>
          </div>
          <p>${escapeHtml(message.text)}</p>
          ${renderChatCard(message.id)}
        </article>
      `;
    })
    .join("");
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

function renderChatCard(messageId: string): string {
  const card = chatCardRegistry.get(messageId);
  if (!card) return "";
  if (card.kind === "nodespark_workflows") return renderNodeSparkWorkflowCard(card);
  if (card.kind === "nodespark_confirmation") return renderNodeSparkConfirmationCard(card);
  return renderNodeSparkRunResultCard(card);
}

function renderNodeSparkWorkflowCard(card: Extract<ChatCard, { kind: "nodespark_workflows" }>): string {
  if (card.workflows.length === 0) {
    return `
      <div class="hub-card empty guided">
        <div class="hub-card-header">
          <strong>No workflows yet</strong>
          <span>${escapeHtml(card.hubLabel)}</span>
        </div>
        <p>Create workflows in NodeSparkHub, then refresh this list.</p>
        <div class="hub-card-actions">
          <button type="button" data-nodespark-refresh="1">Refresh</button>
          <button type="button" data-nodespark-runs="1">Recent Runs</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="hub-card guided workflow-guide">
      <div class="hub-card-header">
        <strong>${card.total} workflows</strong>
        <span>${escapeHtml(card.hubLabel)} · ${escapeHtml(shortTime(card.generatedAt))}</span>
      </div>
      <p class="hub-card-note">Tap a workflow to prepare it. Synra will show a confirmation card before NodeSparkHub starts anything.</p>
      <div class="workflow-card-list">
        ${card.workflows
          .map((workflow) => `
            <button type="button" class="workflow-card-button" data-nodespark-workflow="${escapeAttribute(workflow.name)}">
              <span class="workflow-card-title">
                <strong>${escapeHtml(workflow.name)}</strong>
                <em class="${nodeSparkWorkflowStatusClass(workflow)}">${escapeHtml(nodeSparkWorkflowStatusLabel(workflow))}</em>
              </span>
              <span class="workflow-card-subtitle">${escapeHtml(nodeSparkWorkflowSubtext(workflow))}</span>
              <span class="workflow-card-action">Prepare</span>
            </button>
          `)
          .join("")}
      </div>
      <div class="hub-card-actions">
        <button type="button" data-nodespark-refresh="1">Refresh</button>
        <button type="button" data-nodespark-runs="1">Recent Runs</button>
      </div>
    </div>
  `;
}

function renderNodeSparkConfirmationCard(card: Extract<ChatCard, { kind: "nodespark_confirmation" }>): string {
  return `
    <div class="hub-card confirmation guided">
      <div class="hub-card-header">
        <strong>Confirm workflow run</strong>
        <span>${escapeHtml(card.hubLabel)}</span>
      </div>
      <div class="confirmation-workflow">
        <span>Prepared workflow</span>
        <strong>${escapeHtml(card.workflowName)}</strong>
      </div>
      <p class="hub-card-note">${escapeHtml(card.effect)}</p>
      <div class="confirmation-safety">
        <span>Nothing has started yet</span>
        <em>Risk: ${escapeHtml(card.risk)}</em>
      </div>
      <div class="hub-card-actions">
        <button type="button" data-nodespark-confirm="${escapeAttribute(card.workflowName)}">Run Workflow</button>
        <button type="button" data-nodespark-cancel="1">Cancel</button>
      </div>
    </div>
  `;
}

function renderNodeSparkRunResultCard(card: Extract<ChatCard, { kind: "nodespark_run_result" }>): string {
  const run = card.run;
  const status = card.status === "started" ? (run?.status || "started") : "failed";
  const detail = card.error || formatNodeSparkRun(run);
  return `
    <div class="hub-card run-result guided ${card.status}">
      <div class="hub-card-header">
        <strong>${card.status === "started" ? "Hub accepted run" : "Run did not start"}</strong>
        <span>${escapeHtml(card.hubLabel)}</span>
      </div>
      <div class="run-result-grid">
        <span>Workflow</span>
        <strong>${escapeHtml(card.workflowName)}</strong>
        <span>Status</span>
        <strong>${escapeHtml(status)}</strong>
        ${run?.id ? `<span>Run ID</span><strong>${escapeHtml(run.id)}</strong>` : ""}
      </div>
      <p class="hub-card-note">${escapeHtml(detail)}</p>
      <div class="hub-card-actions">
        <button type="button" data-nodespark-runs="1">Recent Runs</button>
        <button type="button" data-nodespark-refresh="1">Workflows</button>
      </div>
    </div>
  `;
}

function shortTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function createId(): string {
  const randomUUID = globalThis.crypto && "randomUUID" in globalThis.crypto ? globalThis.crypto.randomUUID.bind(globalThis.crypto) : null;
  if (randomUUID) return randomUUID();
  return `synra_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function refreshModelLabel(): void {
  const provider = resolveModelProvider(state.settings.provider);
  const model = state.settings.model ? state.settings.model : provider === "server" ? "server fallback" : "not configured";
  const providerLabel = provider === "openAICompatible" ? "Cloud" : provider === "localHTTP" ? "Local HTTP" : "Server";
  modelNameEl.textContent = performanceProfile.name === "jetson" ? `${model} · ${providerLabel} · Jetson` : `${model} · ${providerLabel}`;
}

function refreshAiConnectionPanel(): void {
  const provider = resolveModelProvider(state.settings.provider);
  const model = state.settings.model.trim() || (provider === "server" ? "server fallback" : "not configured");
  const providerLabel = provider === "openAICompatible" ? "Cloud" : provider === "localHTTP" ? "Local HTTP" : "Server";
  aiConnectionStatusEl.textContent = model;
  aiProviderStatusEl.textContent = providerLabel;
  aiEndpointStatusEl.textContent = endpointDisplayLabel(state.settings.endpoint);
  renderQualityStatusEl.textContent = renderQualityLabel(resolveRenderQuality(state.visual.renderQuality));
  const configured = Boolean(model.trim()) && (provider === "server" || Boolean(state.settings.endpoint.trim()));
  setConnectionTruth("ai", configured ? "configured" : "not-configured", configured ? `${model} via ${providerLabel}` : "Add model settings");
}

function refreshSkillPanel(): void {
  const access = resolveNodeSparkAccess(state.productSettings.nodeSparkAccess);
  const mode = resolveSynraSkillMode(state.productSettings.synraSkillMode);
  const hasHubUrl = Boolean(state.productSettings.nodeSparkHubUrl.trim());
  const hasHubToken = Boolean(state.productSettings.nodeSparkDeviceToken.trim());
  const homeAssistantReady = homeAssistantSettingsReady(state.homeAssistantSettings);
  const knownTargets = normalizeHomeAssistantEntities(state.homeAssistantSettings.knownEntities);
  synraAccessStatusEl.textContent = mode === "nodeSparkHub" ? "Hub Controller" : mode === "homeAssistant" ? "Home Companion" : access === "subscriber" ? "Hybrid Subscriber" : "Free Companion";
  homeAssistantSkillStatusEl.textContent = homeAssistantReady ? "Connected" : "Free";
  homeAssistantTargetCountEl.textContent = knownTargets.length === 1 ? "1 discovered" : `${knownTargets.length} discovered`;
  homeAssistantDefaultTargetEl.textContent = state.homeAssistantSettings.defaultLightEntity.trim() ? homeAssistantDefaultEntityLabel() : "Not set";
  nodeSparkSkillStatusEl.textContent = access === "subscriber" ? (hasHubToken ? "Paired" : hasHubUrl ? "Needs PIN" : "Needs URL") : "Premium";
  nodeSparkActionHintEl.textContent = hasHubToken ? "Hub paired. Check workflows or runs." : hasHubUrl ? "Enter Hub PIN to unlock actions." : "Pair Hub to enable workflow insight.";
  nodeSparkWorkflowsButton.disabled = !hasHubToken || !nodeSparkModeAllowsHub();
  nodeSparkRunsButton.disabled = !hasHubToken || !nodeSparkModeAllowsHub();
  nodeSparkLatestRunButton.disabled = !hasHubToken || !nodeSparkModeAllowsHub();
  setConnectionTruth("homeAssistant", homeAssistantReady ? "configured" : "not-configured", homeAssistantReady ? "Ready to test" : "Add Home Assistant URL and token");
  setConnectionTruth(
    "nodeSpark",
    access === "subscriber" && hasHubToken ? "configured" : access === "subscriber" && hasHubUrl ? "configured" : "not-configured",
    access === "subscriber" && hasHubToken ? nodeSparkPairingLabel() : access === "subscriber" && hasHubUrl ? "Pair with Hub PIN" : "Optional subscriber skill"
  );
  refreshNodeSparkPairingStatus();
}

function refreshSystemHealthPanel(): void {
  renderConnectionTruth("ai", healthAiStatusEl);
  renderConnectionTruth("nodeSpark", healthNodeSparkStatusEl);
  renderConnectionTruth("homeAssistant", healthHomeAssistantStatusEl);
  renderConnectionTruth("voice", healthVoiceStatusEl);
  renderConnectionTruth("vision", healthVisionStatusEl);
  const statuses = Object.values(state.connections).map((connection) => connection.status);
  const reachableCount = statuses.filter((status) => status === "reachable" || status === "ready").length;
  const blockingCount = statuses.filter((status) => status === "unreachable" || status === "permission-needed").length;
  if (blockingCount > 0) healthSummaryStatusEl.textContent = `${blockingCount} needs attention`;
  else if (reachableCount > 0) healthSummaryStatusEl.textContent = `${reachableCount} ready`;
  else healthSummaryStatusEl.textContent = "Configured";
}

function setConnectionTruth(key: ConnectionTruthKey, status: ConnectionTruthStatus, detail: string): void {
  state.connections[key] = { status, detail };
  refreshSystemHealthPanel();
}

function renderConnectionTruth(key: ConnectionTruthKey, element: HTMLElement): void {
  const connection = state.connections[key];
  element.textContent = connectionTruthLabel(connection.status);
  element.title = connection.detail;
  element.dataset.state = connection.status;
}

function connectionTruthLabel(status: ConnectionTruthStatus): string {
  if (status === "not-configured") return "Not configured";
  if (status === "permission-needed") return "Permission needed";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function refreshSettingsDisplayStatus(): void {
  settingsAvatarStatusEl.textContent = getSynraAvatar(resolveInitialAvatarId()).label;
  settingsBackgroundStatusEl.textContent = resolveBackground(state.visual.backgroundId).label;
  settingsQualityStatusEl.textContent = renderQualityLabel(resolveRenderQuality(state.visual.renderQuality));
  settingsModeStatusEl.textContent = resolveControlMode(state.visual.controlMode) === "live" ? "Live" : "Manual";
  settingsScreenTimeoutStatusEl.textContent = screenTimeoutLabel(state.companionSettings.screenTimeoutMinutes);
  settingsVersionStatusEl.textContent = SYNRA_STANDALONE_VERSION;
}

async function refreshKioskWindowControls(): Promise<void> {
  const bridge = window.synraKiosk;
  if (!bridge) {
    settingsKioskWindowStatusEl.textContent = "Browser";
    kioskWindowToggleButton.disabled = true;
    kioskWindowToggleButton.textContent = "Electron Only";
    kioskWindowToggleButton.title = "Windowed/fullscreen controls are available in the Synra Electron kiosk shell.";
    return;
  }

  try {
    const mode = await bridge.getWindowMode();
    applyKioskWindowControlState(mode);
  } catch {
    settingsKioskWindowStatusEl.textContent = "Unavailable";
    kioskWindowToggleButton.disabled = true;
    kioskWindowToggleButton.textContent = "Window Control Unavailable";
  }
}

async function toggleKioskWindowMode(): Promise<void> {
  const bridge = window.synraKiosk;
  if (!bridge) return;
  kioskWindowToggleButton.disabled = true;
  kioskWindowToggleButton.textContent = "Switching...";
  try {
    const mode = await bridge.toggleWindowMode();
    applyKioskWindowControlState(mode);
  } catch {
    settingsKioskWindowStatusEl.textContent = "Switch failed";
    kioskWindowToggleButton.textContent = "Try Again";
    kioskWindowToggleButton.disabled = false;
  }
}

function applyKioskWindowControlState(mode: SynraKioskWindowMode): void {
  settingsKioskWindowStatusEl.textContent = mode === "fullscreen" ? "Fullscreen kiosk" : "Windowed setup";
  kioskWindowToggleButton.disabled = false;
  kioskWindowToggleButton.textContent = mode === "fullscreen" ? "Switch to Windowed Setup" : "Return to Full Screen";
  kioskWindowToggleButton.title = mode === "fullscreen"
    ? "Exit fullscreen kiosk mode so you can paste API keys and use normal window controls."
    : "Return Synra to fullscreen kiosk mode.";
}

function skillAccessSnapshot(): Record<string, string> {
  const access = resolveNodeSparkAccess(state.productSettings.nodeSparkAccess);
  return {
    mode: resolveSynraSkillMode(state.productSettings.synraSkillMode),
    companion: "free",
    homeAssistant: homeAssistantSettingsReady(state.homeAssistantSettings) ? "configured-free" : "free",
    nodeSparkCommandCenter: access === "subscriber" ? (state.productSettings.nodeSparkDeviceToken ? "paired-subscriber" : "subscriber-needs-pairing") : "locked"
  };
}

async function discoverHomeAssistantEntities(): Promise<void> {
  const previousText = discoverHomeAssistantButton.textContent || "Discover Home";
  discoverHomeAssistantButton.disabled = true;
  discoverHomeAssistantButton.textContent = "Discovering";
  state.homeAssistantSettings = readHomeAssistantSettingsFromInputs();
  saveHomeAssistantSettings(state.homeAssistantSettings);
  void saveDurableServerSettings();
  refreshSkillPanel();
  setSynraState("thinking", "Discovering Home Assistant targets.");
  try {
    const response = await fetch("/api/tools/smart-home/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeAssistant: homeAssistantToolPayload() })
    });
    const result = (await response.json()) as { ok?: boolean; configured?: boolean; error?: string; entities?: HomeAssistantEntity[] };
    if (!result.ok) {
      setSynraState("offline", result.configured === false ? "Home Assistant is not configured yet." : `Discovery failed: ${result.error ?? "unknown error"}`);
      void playMotionRoute("concerned", { restart: true, returnToIdle: true });
      return;
    }
    const entities = normalizeHomeAssistantEntities(result.entities ?? []);
    const defaultEntity = state.homeAssistantSettings.defaultLightEntity.trim() || entities[0]?.entityId || "";
    state.homeAssistantSettings = {
      ...state.homeAssistantSettings,
      knownEntities: entities,
      defaultLightEntity: defaultEntity
    };
    homeAssistantLightEntityInput.value = defaultEntity;
    saveHomeAssistantSettings(state.homeAssistantSettings);
    void saveDurableServerSettings();
    populateHomeAssistantEntitySelect();
    refreshSkillPanel();
    setSynraState("idle", entities.length === 1 ? "Found 1 Home Assistant target." : `Found ${entities.length} Home Assistant targets.`);
    void playMotionRoute("confirm", { restart: true, returnToIdle: true });
  } catch {
    setSynraState("offline", "Home Assistant discovery could not reach the local bridge.");
    void playMotionRoute("concerned", { restart: true, returnToIdle: true });
  } finally {
    discoverHomeAssistantButton.disabled = false;
    discoverHomeAssistantButton.textContent = previousText;
  }
}

async function testHomeAssistantConnection(): Promise<void> {
  const previousText = testHomeAssistantButton.textContent || "Test Home";
  testHomeAssistantButton.disabled = true;
  testHomeAssistantButton.textContent = "Testing";
  const previousSettings = state.homeAssistantSettings;
  state.homeAssistantSettings = readHomeAssistantSettingsFromInputs();
  saveHomeAssistantSettings(state.homeAssistantSettings);
  void saveDurableServerSettings();
  refreshSkillPanel();
  setConnectionTruth("homeAssistant", homeAssistantSettingsReady(state.homeAssistantSettings) ? "checking" : "not-configured", homeAssistantSettingsReady(state.homeAssistantSettings) ? endpointDisplayLabel(state.homeAssistantSettings.url) : "Add Home Assistant URL and token");
  setSynraState("thinking", "Testing Home Assistant.");
  try {
    const response = await fetch("/api/tools/smart-home/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeAssistant: homeAssistantToolPayload() })
    });
    const result = (await response.json()) as { ok?: boolean; configured?: boolean; error?: string; version?: string };
    if (result.ok) {
      setConnectionTruth("homeAssistant", "reachable", result.version ? `Home Assistant ${result.version}` : "Home Assistant status reachable");
      setSynraState("idle", `Home Assistant is connected${result.version ? ` (${result.version})` : ""}.`);
      void playMotionRoute("confirm", { restart: true, returnToIdle: true });
      return;
    }
    setConnectionTruth("homeAssistant", result.configured === false ? "not-configured" : "unreachable", result.error ?? "Home Assistant did not respond");
    setSynraState("offline", result.configured === false ? "Home Assistant is not configured yet." : `Home Assistant test failed: ${result.error ?? "unknown error"}`);
    void playMotionRoute("concerned", { restart: true, returnToIdle: true });
  } catch {
    setConnectionTruth("homeAssistant", "unreachable", "Local bridge could not reach Home Assistant");
    setSynraState("offline", "Home Assistant test could not reach the local bridge.");
    void playMotionRoute("concerned", { restart: true, returnToIdle: true });
  } finally {
    testHomeAssistantButton.disabled = false;
    testHomeAssistantButton.textContent = previousText;
    if (previousSettings.enabled !== state.homeAssistantSettings.enabled) refreshSkillPanel();
  }
}

async function checkAllConnections(): Promise<void> {
  const previousText = checkAllConnectionsButton.textContent || "Check All";
  checkAllConnectionsButton.disabled = true;
  checkAllConnectionsButton.textContent = "Checking";
  setSynraState("thinking", "Checking Synra connections.");
  try {
    await checkAiHealthOnly();
    await checkNodeSparkStatusCommand();
    await checkHomeAssistantHealthOnly();
    refreshVoiceStatus();
    await refreshVisionStatus();
    setSynraState("idle", "Connection check complete.");
  } finally {
    checkAllConnectionsButton.disabled = false;
    checkAllConnectionsButton.textContent = previousText;
  }
}

async function checkAiHealthOnly(): Promise<void> {
  setConnectionTruth("ai", "checking", `${state.settings.model || "server"} via ${endpointDisplayLabel(state.settings.endpoint)}`);
  try {
    const reply = await askModel(
      state.settings,
      state.memory,
      [{ id: createId(), role: "user", text: "Reply with exactly: Synra AI reachable.", createdAt: new Date().toISOString() }],
      "conversation"
    );
    setConnectionTruth("ai", "reachable", reply.trim().replace(/\s+/g, " ").slice(0, 120) || "AI route responded");
  } catch (error) {
    setConnectionTruth("ai", "unreachable", error instanceof Error ? error.message.slice(0, 140) : "AI route failed");
  }
}

async function checkHomeAssistantHealthOnly(): Promise<void> {
  if (!homeAssistantSettingsReady(state.homeAssistantSettings)) {
    setConnectionTruth("homeAssistant", "not-configured", "Add Home Assistant URL and token");
    return;
  }
  setConnectionTruth("homeAssistant", "checking", endpointDisplayLabel(state.homeAssistantSettings.url));
  try {
    const response = await fetch("/api/tools/smart-home/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeAssistant: homeAssistantToolPayload() })
    });
    const result = (await response.json()) as { ok?: boolean; configured?: boolean; error?: string; version?: string };
    if (result.ok) {
      setConnectionTruth("homeAssistant", "reachable", result.version ? `Home Assistant ${result.version}` : "Home Assistant status reachable");
      return;
    }
    setConnectionTruth("homeAssistant", result.configured === false ? "not-configured" : "unreachable", result.error ?? "Home Assistant did not respond");
  } catch {
    setConnectionTruth("homeAssistant", "unreachable", "Local bridge could not reach Home Assistant");
  }
}

async function testAiConnection(): Promise<void> {
  testAiButton.disabled = true;
  const previousText = testAiButton.textContent ?? "Test AI";
  testAiButton.textContent = "Testing";
  setConnectionTruth("ai", "checking", `${state.settings.model || "server"} via ${endpointDisplayLabel(state.settings.endpoint)}`);
  setSynraState("thinking", "Testing AI connection.");
  try {
    const reply = await askModel(
      state.settings,
      state.memory,
      [{ id: createId(), role: "user", text: "Reply with a short Synra connection check.", createdAt: new Date().toISOString() }],
      "conversation"
    );
    const summary = reply.trim().replace(/\s+/g, " ").slice(0, 120) || "Connection responded.";
    setConnectionTruth("ai", "reachable", summary);
    setSynraState("idle", `AI connection responded: ${summary}`);
    void playMotionRoute("confirm", { restart: true, returnToIdle: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "connection failed";
    setConnectionTruth("ai", "unreachable", message.slice(0, 140));
    setSynraState("offline", `AI connection failed: ${message.slice(0, 110)}`);
    void playMotionRoute("concerned", { restart: true, returnToIdle: true });
  } finally {
    testAiButton.disabled = false;
    testAiButton.textContent = previousText;
  }
}

async function loadElevenLabsVoices(): Promise<void> {
  const apiKey = elevenLabsApiKeyInput.value.trim();
  if (!apiKey) {
    updateElevenLabsVoiceStatus("Paste an ElevenLabs API key first.");
    setConnectionTruth("voice", "not-configured", "ElevenLabs API key missing");
    return;
  }
  const previousText = loadElevenLabsVoicesButton.textContent || "Load ElevenLabs Voices";
  loadElevenLabsVoicesButton.disabled = true;
  loadElevenLabsVoicesButton.textContent = "Loading...";
  updateElevenLabsVoiceStatus("Loading ElevenLabs voices...");
  try {
    const response = await fetch("/api/tts/elevenlabs/voices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey })
    });
    const result = (await response.json()) as { ok?: boolean; voices?: ElevenLabsVoice[]; error?: string };
    if (!result.ok || !Array.isArray(result.voices)) throw new Error(result.error || "ElevenLabs voices could not be loaded.");
    state.elevenLabsVoices = result.voices;
    const currentVoice = elevenLabsVoiceIdInput.value.trim();
    const selected = state.elevenLabsVoices.find((voice) => voice.voiceId === currentVoice) ?? state.elevenLabsVoices[0];
    if (selected) {
      elevenLabsVoiceIdInput.value = selected.voiceId;
      state.voiceSettings = { ...readVoiceSettingsFromInputs(), provider: "elevenLabs", elevenLabsVoiceName: selected.name };
      saveVoiceSettings(state.voiceSettings);
    }
    populateElevenLabsVoiceSelect();
    refreshVoiceStatus();
    updateElevenLabsVoiceStatus(selected ? `Loaded ${result.voices.length} voices. Selected ${selected.name}.` : "No ElevenLabs voices were returned for this key.");
    setConnectionTruth("voice", selected ? "ready" : "not-configured", selected ? `ElevenLabs voice selected: ${selected.name}` : "No ElevenLabs voices found");
  } catch (error) {
    const message = error instanceof Error ? error.message : "ElevenLabs voices could not be loaded.";
    updateElevenLabsVoiceStatus(message);
    setConnectionTruth("voice", "unreachable", message.slice(0, 140));
  } finally {
    loadElevenLabsVoicesButton.disabled = false;
    loadElevenLabsVoicesButton.textContent = previousText;
  }
}

async function runVoiceDiagnostics(): Promise<void> {
  state.voiceSettings = readVoiceSettingsFromInputs();
  saveVoiceSettings(state.voiceSettings);
  const audioReady = await unlockAudioPlayback();
  const devices = await audioDeviceDiagnostics();
  const provider = voiceProviderLabel(state.voiceSettings.provider);
  const browserVoices = browserSpeechVoices();
  const browserVoice = selectedBrowserVoice();
  const browserState = "speechSynthesis" in window
    ? browserVoice
      ? `Browser / Apple Voice: ${browserVoice.name} (${browserVoice.lang}); ${browserVoices.length} system voices visible.`
      : `Apple Voice is available but no system voices are visible.`
    : "Apple Voice is unavailable in this runtime.";
  const elevenLabsState = state.voiceSettings.provider === "elevenLabs"
    ? canUseElevenLabsSpeech()
      ? `ElevenLabs configured${state.voiceSettings.elevenLabsVoiceName ? ` with ${state.voiceSettings.elevenLabsVoiceName}` : ""}. Server-managed API keys are supported.`
      : "ElevenLabs needs a selected voice."
    : state.voiceSettings.provider === "chatterbox"
    ? `Chatterbox local voice selected: ${state.voiceSettings.chatterboxModel} on ${state.voiceSettings.chatterboxDevice}.`
    : "Apple Voice is selected.";
  const message = `Voice diagnostics: ${provider}. Audio unlock ${audioReady ? "ready" : "blocked"}. ${devices} ${browserState} ${elevenLabsState}`;
  updateVoiceStatus(audioReady ? "Voice diagnostics" : "Playback blocked");
  setConnectionTruth("voice", audioReady ? "ready" : "permission-needed", message);
  pushMessage("synra", message);
}

async function testVoiceConnection(): Promise<void> {
  const previousText = testVoiceButton.textContent || "Test Voice";
  testVoiceButton.disabled = true;
  testVoiceButton.textContent = "Testing...";
  const previousSettings = state.voiceSettings;
  state.voiceSettings = readVoiceSettingsFromInputs();
  saveVoiceSettings(state.voiceSettings);
  const providerLabel = voiceProviderLabel(state.voiceSettings.provider);
  setConnectionTruth("voice", "checking", `Testing ${providerLabel}`);
  setSynraState("speaking", `Voice test started with ${providerLabel}.`);
  try {
    await unlockAudioPlayback();
    const elevenReady = canUseElevenLabsSpeech();
    const chatterboxReady = canUseChatterboxSpeech();
    const testText = elevenReady
      ? "Synra voice test. ElevenLabs voice is connected."
      : chatterboxReady
      ? "Synra voice test. Chatterbox local voice is connected."
      : "Synra voice test. Browser speech is ready.";
    speak(testText);
    setConnectionTruth(
      "voice",
      state.voiceSettings.provider === "elevenLabs" && !elevenReady ? "not-configured" : "ready",
      elevenReady ? "ElevenLabs test started" : chatterboxReady ? "Chatterbox test started" : state.voiceSettings.provider === "elevenLabs" ? "ElevenLabs fallback needs a selected voice" : "Browser speech test started"
    );
    pushMessage("synra", elevenReady ? "Voice test started with ElevenLabs." : chatterboxReady ? "Voice test started with Chatterbox." : state.voiceSettings.provider === "elevenLabs" ? "ElevenLabs needs a selected voice. I started browser speech fallback instead." : "Voice test started with browser speech.");
  } finally {
    window.setTimeout(() => {
      testVoiceButton.disabled = false;
      testVoiceButton.textContent = previousText;
    }, state.voiceSettings.provider === "browser" ? 600 : 1800);
    if (previousSettings.provider !== state.voiceSettings.provider) refreshVoiceStatus();
  }
}

function voiceProviderLabel(provider: VoiceProvider): string {
  if (provider === "elevenLabs") return "ElevenLabs";
  if (provider === "chatterbox") return "Chatterbox";
  return "Apple Voice";
}

async function refreshServerModelStatus(): Promise<void> {
  if (resolveModelProvider(state.settings.provider) !== "server" && state.settings.endpoint !== "/api/chat") return;
  const response = await fetch("/api/model/public", { cache: "no-store" });
  if (!response.ok) return;
  const data = (await response.json()) as { configured?: boolean; model?: string };
  state.settings = {
    ...state.settings,
    model: data.configured && data.model ? data.model : "server fallback"
  };
  refreshModelLabel();
  refreshAiConnectionPanel();
}

function resolveModelProvider(provider: string | undefined): ModelSettings["provider"] {
  return provider === "openAICompatible" || provider === "localHTTP" || provider === "server" ? provider : "server";
}

function resolveRenderQuality(value: unknown): RenderQuality {
  const quality = String(value ?? "").trim().toLowerCase();
  if (quality === "sharp" || quality === "high") return "sharp";
  if (quality === "performance" || quality === "low") return "performance";
  return "balanced";
}

function renderQualityLabel(quality: RenderQuality): string {
  if (quality === "sharp") return "Sharp";
  if (quality === "performance") return "Performance";
  return "Balanced";
}

function endpointDisplayLabel(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) return "Not configured";
  if (trimmed === "/api/chat") return "Synra server";
  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.origin === window.location.origin && trimmed.startsWith("/")) return trimmed;
    return url.host || trimmed;
  } catch {
    return trimmed.length > 32 ? `${trimmed.slice(0, 29)}...` : trimmed;
  }
}

function resize(): void {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const portrait = width / height < 0.72;
  const wideStage = width / height > 1.35;
  const kiosk = runtimeMode === "kiosk";
  camera.fov = portrait ? 27.5 : wideStage ? kiosk ? 24.8 : 25.5 : kiosk ? 25.2 : 25.8;
  camera.position.set(
    0,
    portrait ? 0.96 : wideStage ? kiosk ? 0.88 : 0.9 : kiosk ? 0.9 : 0.92,
    portrait ? 4.95 : wideStage ? kiosk ? 4.85 : 4.55 : kiosk ? 4.95 : 4.75
  );
  camera.lookAt(0, portrait ? 0.88 : wideStage ? kiosk ? 0.82 : 0.86 : kiosk ? 0.84 : 0.88, 0);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (!renderer) return;
  renderer.setPixelRatio(resolveEffectivePixelRatio());
  renderer.setSize(width, height, false);
}

function resolvePixelRatio(): number {
  const deviceRatio = window.devicePixelRatio || 1;
  const cap = resolvePixelRatioCap();
  const quality = resolveRenderQuality(state.visual.renderQuality);
  if (quality === "sharp") return cap;
  if (quality === "balanced") return Math.min(Math.max(deviceRatio, performanceProfile.name === "jetson" ? 1.2 : 1.35), cap);
  return Math.min(deviceRatio, cap);
}

function resolveEffectivePixelRatio(): number {
  const base = resolvePixelRatio();
  const renderScale = resolveRenderScaleOverride();
  const uncapped = renderScale ?? (
    state.performanceTier === "forced-low"
      ? Math.min(base, performanceProfile.name === "jetson" ? 1.0 : 0.72)
      : state.performanceTier === "low"
        ? Math.min(base, performanceProfile.name === "jetson" ? 1.08 : 0.9)
        : base
  );
  return resolveRenderSizeCappedPixelRatio(uncapped);
}

function resolvePixelRatioCap(): number {
  const quality = resolveRenderQuality(state.visual.renderQuality);
  if (performanceProfile.name === "jetson") {
    if (quality === "sharp") return 1.65;
    if (quality === "balanced") return 1.35;
    return 1.0;
  }
  if (quality === "sharp") return 2.0;
  if (quality === "balanced") return 1.5;
  return 1.0;
}

function resolveRenderScaleOverride(): number | null {
  const requestedScale = Number(new URLSearchParams(window.location.search).get("scale") || "");
  if (!Number.isFinite(requestedScale)) return null;
  return Math.min(Math.max(requestedScale, 0.5), 2);
}

function resolveRenderSizeCappedPixelRatio(pixelRatio: number): number {
  const params = new URLSearchParams(window.location.search);
  const requestedMaxWidth = Number(params.get("maxw") || params.get("maxRenderWidth") || "");
  const requestedMaxHeight = Number(params.get("maxh") || params.get("maxRenderHeight") || "");
  const widthCap = Number.isFinite(requestedMaxWidth) && requestedMaxWidth > 0 ? requestedMaxWidth / Math.max(1, window.innerWidth) : Infinity;
  const heightCap = Number.isFinite(requestedMaxHeight) && requestedMaxHeight > 0 ? requestedMaxHeight / Math.max(1, window.innerHeight) : Infinity;
  const capped = Math.min(pixelRatio, widthCap, heightCap);
  return Math.min(Math.max(capped, 0.42), 2);
}

function resolveInitialPerformanceTier(): "normal" | "low" | "forced-low" {
  const quality = resolveRenderQuality(new URLSearchParams(window.location.search).get("quality"));
  return quality === "performance" ? "forced-low" : "normal";
}

function resolveInitialVisualSettings() {
  const visual = loadVisualSettings();
  const params = new URLSearchParams(window.location.search);
  const requestedAvatar = params.get("avatar");
  const requestedQuality = params.get("quality");
  const hostedJetsonDefault = shouldPreferSharpHostedDefault() && resolveRenderQuality(visual.renderQuality) !== "performance" ? "sharp" : visual.renderQuality;
  const next = {
    ...visual,
    renderQuality: requestedQuality ? resolveRenderQuality(requestedQuality) : resolveRenderQuality(hostedJetsonDefault)
  };
  return isSynraAvatarId(requestedAvatar) ? { ...next, avatarId: requestedAvatar } : next;
}

function shouldPreferSharpHostedDefault(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.has("quality")) return false;
  return params.get("profile") === "jetson" || isPrivateNetworkHost(window.location.hostname);
}

function applyPerformanceTier(tier: "normal" | "low" | "forced-low"): void {
  state.performanceTier = tier;
  document.body.dataset.performanceTier = tier === "normal" ? "normal" : "low";
  if (renderer) {
    renderer.setPixelRatio(resolveEffectivePixelRatio());
    renderer.setSize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight), false);
  }
}

function resolveRuntimeMode(): "kiosk" | "interactive" {
  const params = new URLSearchParams(window.location.search);
  return params.get("mode") === "kiosk" || params.get("kiosk") === "1" ? "kiosk" : "interactive";
}

function resolvePerformanceProfile(): { name: "desktop" | "jetson"; targetFps: number; frameIntervalMs: number; maxPixelRatio: number } {
  const params = new URLSearchParams(window.location.search);
  const requestedProfile = params.get("profile");
  const looksLikeJetson = requestedProfile === "jetson" || isPrivateNetworkHost(window.location.hostname) || /aarch64|jetson|linux arm/i.test(navigator.userAgent);
  const requestedFps = Number(params.get("fps") || "");
  const liveAvatar = params.get("live") === "1";
  const performanceLimited = runtimeMode === "kiosk" || looksLikeJetson;
  const minimumFps = performanceLimited ? 12 : 15;
  const quality = resolveRenderQuality(state.visual.renderQuality);
  const defaultFps = performanceLimited ? 24 : 60;
  const requestedTargetFps = Number.isFinite(requestedFps) && requestedFps >= minimumFps && requestedFps <= 60 ? requestedFps : null;
  const targetFps = requestedTargetFps ?? (liveAvatar && !performanceLimited ? 60 : defaultFps);
  return {
    name: looksLikeJetson ? "jetson" : "desktop",
    targetFps,
    frameIntervalMs: 1000 / targetFps,
    maxPixelRatio: looksLikeJetson
      ? quality === "sharp" ? 1.65 : quality === "balanced" ? 1.35 : 1.0
      : quality === "sharp" ? 2.0 : quality === "balanced" ? 1.5 : 1.0
  };
}

function isPrivateNetworkHost(host: string): boolean {
  return /^192\.168\./.test(host) || /^10\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

function must<Root extends HTMLElement, T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

type SpeechRecognitionConstructor = new () => SpeechRecognition;

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start(): void;
  stop?(): void;
  abort?(): void;
}

interface SpeechRecognitionEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface HoldToTalkSession {
  source: "browser" | "server";
  startedAt: number;
  stop(): void;
  cancel(): void;
  finish(): Promise<{ text: string }>;
}

interface MicrophoneCapture {
  blob: Blob;
  peakRms: number;
  signal?: MicrophoneSignal;
}

interface MicrophoneSignal extends EnrollmentMicrophoneSignal {}

interface TranscriptionResult {
  text: string;
  voicePrint?: VoicePrintSample;
}

interface VoiceMatchResult {
  allowed: boolean;
  user?: KnownUserProfile;
  score?: number;
  reason: string;
}
