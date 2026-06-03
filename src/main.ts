import "./styles.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { DEFAULT_SYNRA_AVATAR_ID, SYNRA_AVATARS, getSynraAvatar, isSynraAvatarId, type SynraAvatarId } from "./avatar-catalog";
import { askModel, classifySynraRequest, localSynraReply } from "./model-client";
import { SynraMotionPlayer, type SynraMotionClipSpec } from "./motion-player";
import { loadMemory, loadModelSettings, loadVisualSettings, saveMemory, saveModelSettings, saveVisualSettings } from "./storage";
import type { ModelSettings, SynraMessage, SynraState } from "./types";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing app root.");

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
};

type PendingAction = {
  type: "smart_home";
  action: "turn_on" | "turn_off" | "toggle";
  label: string;
  createdAt: number;
};

type CameraDeviceStatus = {
  path: string;
  exists?: boolean;
  configured?: boolean;
  kind?: "video" | "media";
};

type VisionPublicStatus = {
  ok?: boolean;
  configuredDevice?: string;
  cameraDevices?: CameraDeviceStatus[];
  cameraDeviceCount?: number;
  videoDeviceCount?: number;
  mediaDeviceCount?: number;
};

const SYNRA_BACKGROUNDS: SynraBackground[] = [
  { id: "command-room", label: "Command Room", url: "/backgrounds/synra-command-room.png" },
  { id: "observatory", label: "Observatory", url: "/backgrounds/synra-observatory.png" },
  { id: "neural-library", label: "Neural Library", url: "/backgrounds/synra-neural-library.png" },
  { id: "orbit-lounge", label: "Orbit Lounge", url: "/backgrounds/synra-orbit-lounge.png" },
  { id: "cyber-garden", label: "Cyber Garden", url: "/backgrounds/synra-cyber-garden.png" },
  { id: "quantum-workshop", label: "Quantum Workshop", url: "/backgrounds/synra-quantum-workshop.png" }
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
  idle: ["mode:idle", "local_stand_1", "local_stand_4", "local_stand_5", "local_stand_6"],
  listening: ["mode:listening", "attentive", "lean_in", "look_camera"],
  thinking: ["mode:thinking", "ask_question", "compare", "look_screen"],
  speaking: ["mode:speaking", "explain", "present", "answer", "teach"],
  offline: ["error_calm", "concerned"]
};

const IDLE_LIFE_GESTURES = ["look_camera", "look_screen", "confirm", "confused_tilt", "wave", "attentive", "present"];
const PRESENCE_NUDGES = [
  "I am here.",
  "Ready when you are.",
  "Listening for the next move.",
  "Systems are calm.",
  "I am standing by."
];

const runtimeMode = resolveRuntimeMode();
const initialPerformanceTier = resolveInitialPerformanceTier();
const initialVisualSettings = resolveInitialVisualSettings();
const telemetryEnabled = runtimeMode === "kiosk" || new URLSearchParams(window.location.search).get("telemetry") === "1";

const state = {
  synra: "idle" as SynraState,
  messages: [] as SynraMessage[],
  settings: loadModelSettings(),
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
  voiceStatus: "Voice checking",
  visionStatus: "Camera not checked",
  serverVisionStatus: "Jetson camera not checked",
  serverCameraDeviceCount: null as number | null,
  serverCameraConfiguredDevice: "",
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
  lastAutoMotionByState: {} as Partial<Record<SynraState, string>>
};
const performanceProfile = resolvePerformanceProfile();
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
    visionStatus: state.visionStatus,
    serverVisionStatus: state.serverVisionStatus,
    serverCameraDeviceCount: state.serverCameraDeviceCount,
    lastRouteLabel: state.lastRouteLabel,
    performanceTier: state.performanceTier,
    webgl: renderer ? "available" : "unavailable",
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
        <img class="brand-logo" src="/icons/synra-logo.png" alt="" />
        <div>
          <strong>Synra</strong>
          <span id="status">Starting</span>
        </div>
      </div>
      <div class="metrics">
        <span class="signal-dot"></span>
        <span id="fps">-- FPS</span>
        <span id="modelName">Local path</span>
      </div>
    </div>
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
          <span>Motion Type</span>
          <select id="motionCategorySelect"></select>
        </label>
        <label class="manual-control">
          <span>VRMA</span>
          <select id="motionSelect"></select>
        </label>
        <button type="button" id="playMotionButton" class="manual-control">Play Motion</button>
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
      </div>
    </aside>
    <form class="composer" id="composer">
      <button type="button" id="listenButton" class="icon-button listen" title="Listen" aria-label="Listen"><span></span></button>
      <input id="prompt" autocomplete="off" placeholder="Talk to Synra" />
      <button type="submit" class="icon-button send" title="Send" aria-label="Send">↑</button>
      <button type="button" id="settingsButton" class="icon-button" title="Model settings" aria-label="Model settings">⚙</button>
    </form>
  </section>
  <dialog id="settingsDialog">
    <form method="dialog" class="settings">
      <h2>AI Connection</h2>
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
      <menu>
        <button value="cancel">Cancel</button>
        <button id="saveSettingsButton" value="default">Save</button>
      </menu>
    </form>
  </dialog>
`;

const canvas = must<HTMLElement, HTMLCanvasElement>("scene");
const statusEl = must<HTMLElement, HTMLElement>("status");
const captionEl = must<HTMLElement, HTMLElement>("caption");
const presenceStateEl = must<HTMLElement, HTMLElement>("presenceState");
const voiceStateEl = must<HTMLElement, HTMLElement>("voiceState");
const visionStateEl = must<HTMLElement, HTMLElement>("visionState");
const backgroundSelect = must<HTMLElement, HTMLSelectElement>("backgroundSelect");
const avatarSelect = must<HTMLElement, HTMLSelectElement>("avatarSelect");
const motionCategorySelect = must<HTMLElement, HTMLSelectElement>("motionCategorySelect");
const motionSelect = must<HTMLElement, HTMLSelectElement>("motionSelect");
const playMotionButton = must<HTMLElement, HTMLButtonElement>("playMotionButton");
const controlModeButton = must<HTMLElement, HTMLButtonElement>("controlModeButton");
const activeMotionEl = must<HTMLElement, HTMLElement>("activeMotion");
const fpsEl = must<HTMLElement, HTMLElement>("fps");
const modelNameEl = must<HTMLElement, HTMLElement>("modelName");
const composer = must<HTMLElement, HTMLFormElement>("composer");
const promptInput = must<HTMLElement, HTMLInputElement>("prompt");
const listenButton = must<HTMLElement, HTMLButtonElement>("listenButton");
const sendButton = document.querySelector<HTMLButtonElement>('button[title="Send"]');
const settingsButton = must<HTMLElement, HTMLButtonElement>("settingsButton");
const settingsDialog = must<HTMLElement, HTMLDialogElement>("settingsDialog");
const providerInput = must<HTMLElement, HTMLSelectElement>("providerInput");
const endpointInput = must<HTMLElement, HTMLInputElement>("endpointInput");
const modelInput = must<HTMLElement, HTMLInputElement>("modelInput");
const apiKeyInput = must<HTMLElement, HTMLInputElement>("apiKeyInput");
const temperatureInput = must<HTMLElement, HTMLInputElement>("temperatureInput");
const systemPromptInput = must<HTMLElement, HTMLTextAreaElement>("systemPromptInput");
const saveSettingsButton = must<HTMLElement, HTMLButtonElement>("saveSettingsButton");

const renderer = createRenderer();
if (!renderer) {
  canvas.hidden = true;
  document.body.dataset.webgl = "unavailable";
  fpsEl.textContent = "3D unavailable";
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
camera.position.set(0, 0.9, 4.35);
camera.lookAt(0, 0.88, 0);

const ambientLight = new THREE.AmbientLight(0xffffff, 1.85);
const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0xd9e0ee, 1.15);
const keyLight = new THREE.DirectionalLight(0xffffff, 2.05);
const faceLight = new THREE.DirectionalLight(0xfff7ef, 0.82);
const rimLight = new THREE.DirectionalLight(0xe8f4ff, 0.32);
keyLight.position.set(-1.45, 2.75, 3.35);
faceLight.position.set(0.15, 1.72, 3.3);
rimLight.position.set(2.2, 1.8, -2.8);
scene.add(ambientLight, hemisphereLight, keyLight, faceLight, rimLight);

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

resize();
window.addEventListener("resize", resize);

setSynraState("idle", "Starting Synra.");
document.body.dataset.runtimeMode = runtimeMode;
applyPerformanceTier(state.performanceTier);
populateBackgroundSelect();
populateAvatarSelect();
populateMotionCategorySelect();
applyBackground(resolveBackground(state.visual.backgroundId));
applyControlMode(resolveInitialControlMode());
loadAvatarById(resolveInitialAvatarId()).catch(() => loadAvatarById(DEFAULT_SYNRA_AVATAR_ID)).catch((error) => {
  setSynraState("offline", `Avatar failed to load: ${error instanceof Error ? error.message : String(error)}`);
});
refreshServerModelStatus().catch(() => {});
refreshVoiceStatus();
refreshVisionStatus().catch(() => {});
if ("speechSynthesis" in window) speechSynthesis.addEventListener("voiceschanged", refreshVoiceStatus);
requestAnimationFrame(render);
refreshModelLabel();

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

listenButton.addEventListener("click", () => {
  void startListening();
});

backgroundSelect.addEventListener("change", () => {
  const background = resolveBackground(backgroundSelect.value);
  state.visual = { ...state.visual, backgroundId: background.id };
  saveVisualSettings(state.visual);
  applyBackground(background);
});

avatarSelect.addEventListener("change", () => {
  const avatarId = isSynraAvatarId(avatarSelect.value) ? avatarSelect.value : DEFAULT_SYNRA_AVATAR_ID;
  state.visual = { ...state.visual, avatarId };
  saveVisualSettings(state.visual);
  void loadAvatarById(avatarId);
});

motionCategorySelect.addEventListener("change", () => {
  state.visual = { ...state.visual, motionCategoryId: resolveMotionCategory(motionCategorySelect.value).id };
  saveVisualSettings(state.visual);
  populateMotionSelect();
});

playMotionButton.addEventListener("click", () => {
  const motionId = motionSelect.value;
  if (!motionId) return;
  state.visual = { ...state.visual, motionId };
  saveVisualSettings(state.visual);
  void playManualMotion(motionId);
});

controlModeButton.addEventListener("click", () => {
  const next = resolveControlMode(state.visual.controlMode) === "manual" ? "live" : "manual";
  state.visual = { ...state.visual, controlMode: next };
  saveVisualSettings(state.visual);
  applyControlMode(next);
});

settingsButton.addEventListener("click", () => {
  providerInput.value = resolveModelProvider(state.settings.provider);
  endpointInput.value = state.settings.endpoint;
  modelInput.value = state.settings.model;
  apiKeyInput.value = state.settings.apiKey;
  temperatureInput.value = String(state.settings.temperature ?? 0.2);
  systemPromptInput.value = state.settings.systemPrompt ?? "";
  settingsDialog.showModal();
});

providerInput.addEventListener("change", () => {
  applyProviderPreset(providerInput.value);
});

saveSettingsButton.addEventListener("click", () => {
  const temperature = Number(temperatureInput.value);
  const next: ModelSettings = {
    provider: resolveModelProvider(providerInput.value),
    endpoint: endpointInput.value.trim(),
    model: modelInput.value.trim(),
    apiKey: apiKeyInput.value,
    temperature: Number.isFinite(temperature) ? Math.min(Math.max(temperature, 0), 2) : 0.2,
    systemPrompt: systemPromptInput.value.trim()
  };
  state.settings = next;
  saveModelSettings(next);
  refreshModelLabel();
});

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

function populateMotionCategorySelect(): void {
  motionCategorySelect.innerHTML = MOTION_CATEGORIES
    .map((category) => `<option value="${category.id}">${category.label}</option>`)
    .join("");
  motionCategorySelect.value = resolveMotionCategory(state.visual.motionCategoryId).id;
}

function populateMotionSelect(): void {
  const allClips = state.motionPlayer.listClips();
  const category = resolveMotionCategory(state.visual.motionCategoryId);
  const clips = filterClipsByCategory(allClips, category);
  motionSelect.innerHTML = clips
    .map((clip) => `<option value="${clip.id}">${clip.id}</option>`)
    .join("");
  const fallback = category.id === "all" ? state.motionPlayer.resolveClipId("wave") : clips[0]?.id;
  const preferred = clips.some((clip) => clip.id === state.visual.motionId) ? state.visual.motionId : fallback ?? "";
  motionSelect.value = preferred;
  activeMotionEl.textContent = `${clips.length} ${category.label.toLowerCase()} ready`;
}

async function playMotionRoute(actionOrClipId: string, options: { restart?: boolean; loop?: boolean; returnToIdle?: boolean } = {}): Promise<void> {
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

function filterClipsByCategory(clips: SynraMotionClipSpec[], category: MotionCategory): SynraMotionClipSpec[] {
  if (category.id === "all") return clips;
  const routeClipIds = new Set((category.routeIds ?? []).map((routeId) => state.motionPlayer.resolveClipId(routeId)).filter(Boolean));
  const matches = clips.filter((clip) => {
    if (routeClipIds.has(clip.id)) return true;
    const haystack = `${clip.id} ${clip.label} ${(clip.actionIds ?? []).join(" ")}`.replaceAll("_", "").toLowerCase();
    return (category.match ?? []).some((needle) => haystack.includes(needle.replaceAll("_", "").toLowerCase()));
  });
  return matches.length > 0 ? matches : clips;
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
}

async function playManualMotion(motionId: string): Promise<void> {
  playMotionButton.disabled = true;
  playMotionButton.textContent = "Playing";
  try {
    await playMotionRoute(motionId, { restart: true, returnToIdle: true });
  } finally {
    window.setTimeout(() => {
      playMotionButton.disabled = false;
      playMotionButton.textContent = "Play Motion";
    }, 450);
  }
}

async function loadAvatarById(avatarId: SynraAvatarId): Promise<void> {
  const avatar = getSynraAvatar(avatarId);
  avatarSelect.value = avatar.id;
  setSynraState("idle", `Loading ${avatar.label}.`);
  await loadAvatar(avatar.url);
  state.visual = { ...state.visual, avatarId: avatar.id };
  saveVisualSettings(state.visual);
  setSynraState("idle", `${avatar.label} is ready.`);
  void playMotionRoute("wave", { restart: true, returnToIdle: true });
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
  VRMUtils.removeUnnecessaryJoints(gltf.scene);
  vrm.scene.rotation.y = 0;
  normalizeAvatarStagePlacement(vrm.scene);
  scene.add(vrm.scene);
  state.vrm = vrm;
  await state.motionPlayer.boot(vrm);
  populateMotionSelect();
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
    const targetHeight = 2.05;
    const scale = THREE.MathUtils.clamp(targetHeight / size.y, 0.78, 1.62);
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);
  }

  const scaledBox = new THREE.Box3().setFromObject(root);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);
  root.position.set(-scaledCenter.x, 0.96 - scaledCenter.y, -scaledCenter.z);
}

async function handleUserText(text: string): Promise<void> {
  pushMessage("user", text);
  const requestRoute = classifySynraRequest(text);
  state.lastRouteLabel = requestRoute.label;
  const localResult = await tryHandleLocalCommand(text);
  if (localResult) {
    pushMessage("synra", localResult.text);
    if (localResult.motion) void playMotionRoute(localResult.motion, { restart: true, returnToIdle: true });
    speak(localResult.text);
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
      text: "You can ask for status, voice status, camera status, switch backgrounds, switch avatars, show or hide controls, set low or normal performance mode, remember a fact, clear memories, or control configured lights with confirmation.",
      motion: "present"
    };
  }

  if (/^(synra[, ]+)?(status|health|system status|jetson status)\??$/.test(normalized)) {
    return systemStatusCommand();
  }

  if (/\b(camera|vision|see|eyes)\b/.test(normalized) && /\b(status|check|available|permission|can you|enable|turn on)\b/.test(normalized)) {
    return cameraStatusCommand(/\b(enable|turn on|open|allow)\b/.test(normalized));
  }

  if (/\b(voice|audio|microphone|mic|speak|listen)\b/.test(normalized) && /\b(status|check|available|permission|can you|enable|turn on)\b/.test(normalized)) {
    return voiceStatusCommand(/\b(microphone|mic|listen|enable|turn on|open|allow)\b/.test(normalized));
  }

  if (/\b(clear|forget|delete)\b.*\b(memories|memory|remembered facts)\b/.test(normalized)) {
    state.memory = { ...state.memory, savedFacts: [] };
    saveMemory(state.memory);
    return { text: "I cleared the remembered facts I was storing locally.", motion: "confirm" };
  }

  const rememberMatch = text.match(/\bremember(?: that)?\s+(.+)/i);
  if (rememberMatch?.[1]) {
    const fact = rememberMatch[1].trim().replace(/[.?!]+$/, "");
    if (fact.length < 3) return { text: "Tell me the full thing you want me to remember.", motion: "ask_question" };
    const savedFacts = [...state.memory.savedFacts.filter((saved) => saved.toLowerCase() !== fact.toLowerCase()), fact].slice(-24);
    state.memory = { ...state.memory, savedFacts };
    saveMemory(state.memory);
    return { text: `I will remember: ${fact}.`, motion: "confirm" };
  }

  const background = matchBackground(normalized);
  if (background) {
    state.visual = { ...state.visual, backgroundId: background.id };
    saveVisualSettings(state.visual);
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
    saveVisualSettings(state.visual);
    return { text: "Controls are open.", motion: "present" };
  }

  if (/\b(hide|close)\b.*\b(controls|panel)\b/.test(normalized) || /\b(live mode|clean mode)\b/.test(normalized)) {
    applyControlMode("live");
    saveVisualSettings(state.visual);
    return { text: "Live mode is on.", motion: "confirm" };
  }

  if (/\b(low power|low performance|quality low|performance low)\b/.test(normalized)) {
    applyPerformanceTier("forced-low");
    return { text: "Low-cost performance mode is on.", motion: "confirm" };
  }

  if (/\b(normal performance|quality normal|restore performance|performance normal)\b/.test(normalized)) {
    applyPerformanceTier("normal");
    return { text: "Normal visual mode is back on.", motion: "confirm" };
  }

  const lightAction = matchLightAction(normalized);
  if (lightAction) return prepareSmartHomeLightCommand(lightAction);

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
    if (action.type === "smart_home") return smartHomeLightCommand(action.action);
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
    };
    const uptime = typeof health.uptimeSeconds === "number" ? `${Math.round(health.uptimeSeconds)} seconds` : "unknown";
    const smartHome = health.smartHomeConfigured ? "smart home configured" : "smart home not configured";
    updateServerVisionStatus(summarizeVisionDiagnostics(health));
    return {
      text: `System is online. Model: ${health.model ?? state.settings.model}. Uptime: ${uptime}. Performance: ${state.performanceTier}. Voice: ${state.voiceStatus}. Vision: ${combinedVisionStatus()}. ${smartHome}.`,
      motion: "present"
    };
  } catch {
    return { text: `I am running locally. Performance: ${state.performanceTier}. Voice: ${state.voiceStatus}. Vision: ${combinedVisionStatus()}.`, motion: "present" };
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

async function voiceStatusCommand(requestAccess: boolean): Promise<LocalCommandResult> {
  refreshVoiceStatus();
  if (!requestAccess) {
    return { text: `Voice status: ${state.voiceStatus}. Say listen or press the microphone button when you want me to request microphone access.`, motion: "present" };
  }
  const micReady = await ensureMicrophoneReady();
  refreshVoiceStatus();
  return micReady
    ? { text: `Microphone access is available. Voice status: ${state.voiceStatus}.`, motion: "confirm" }
    : { text: "Microphone access is not available right now. Check Chromium media permissions and the Jetson audio input.", motion: "concerned" };
}

async function ensureCameraReady(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) {
    updateVisionStatus("Camera API unavailable");
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    for (const track of stream.getTracks()) track.stop();
    updateVisionStatus("Camera allowed");
    return true;
  } catch {
    updateVisionStatus("Camera blocked");
    return false;
  }
}

async function prepareSmartHomeLightCommand(action: "turn_on" | "turn_off" | "toggle"): Promise<LocalCommandResult> {
  const configured = await smartHomeIsConfigured();
  if (!configured) return smartHomeLightCommand(action);
  const label = action === "toggle" ? "toggle lights" : `turn lights ${action === "turn_on" ? "on" : "off"}`;
  state.pendingAction = {
    type: "smart_home",
    action,
    label,
    createdAt: performance.now()
  };
  return {
    text: `Ready to ${label}. Say confirm to run it, or cancel to stop.`,
    motion: "ask_question"
  };
}

async function smartHomeIsConfigured(): Promise<boolean> {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const health = (await response.json()) as { smartHomeConfigured?: boolean };
    return health.smartHomeConfigured === true;
  } catch {
    return false;
  }
}

async function smartHomeLightCommand(action: "turn_on" | "turn_off" | "toggle"): Promise<LocalCommandResult> {
  setSynraState("thinking", "Checking smart home.");
  try {
    const response = await fetch("/api/tools/smart-home", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    const result = (await response.json()) as { ok?: boolean; configured?: boolean; entityId?: string; error?: string };
    if (result.ok) {
      const target = result.entityId ?? "the light";
      const text = action === "toggle" ? `Done. I toggled ${target}.` : `Done. I turned ${target} ${action === "turn_on" ? "on" : "off"}.`;
      return { text, motion: "confirm" };
    }
    return {
      text: result.configured === false
        ? "Smart home control is not configured yet. Add Home Assistant URL, token, and a default light entity to Synra's Jetson environment."
        : `I could not control the light: ${result.error ?? "the smart-home tool did not complete."}`,
      motion: "concerned"
    };
  } catch {
    return { text: "I could not reach the smart-home tool right now.", motion: "concerned" };
  }
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
  if (!/\b(light|lights|lamp|lamps)\b/.test(normalized)) return null;
  if (/\b(toggle|switch)\b/.test(normalized)) return "toggle";
  if (/\b(on|enable)\b/.test(normalized)) return "turn_on";
  if (/\b(off|disable)\b/.test(normalized)) return "turn_off";
  return null;
}

function speak(text: string): void {
  clearSpeechFallback();
  if (!("speechSynthesis" in window)) {
    updateVoiceStatus("Text only");
    setSynraState("speaking", text);
    armSpeechFallback(text);
    return;
  }
  updateVoiceStatus("Speaking");
  speechSynthesis.cancel();
  setSynraState("speaking", text);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.96;
  utterance.pitch = 1.04;
  utterance.onstart = () => setSynraState("speaking", text);
  utterance.onend = () => finishSpeech(text);
  utterance.onerror = () => {
    updateVoiceStatus("Speech blocked");
    finishSpeech(text);
  };
  armSpeechFallback(text);
  speechSynthesis.speak(utterance);
}

function armSpeechFallback(text: string): void {
  const duration = Math.min(7200, Math.max(1200, text.length * 42));
  state.speechFallbackTimer = window.setTimeout(() => finishSpeech(text), duration);
}

function finishSpeech(text: string): void {
  clearSpeechFallback();
  refreshVoiceStatus();
  if (state.synra === "speaking") setSynraState("idle", text);
}

function clearSpeechFallback(): void {
  if (!state.speechFallbackTimer) return;
  window.clearTimeout(state.speechFallbackTimer);
  state.speechFallbackTimer = 0;
}

async function startListening(): Promise<void> {
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
  const SpeechRecognitionCtor =
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    updateVoiceStatus("Listen unavailable");
    setSynraState("idle", "Speech recognition is not available in this browser yet. Text input is ready.");
    return;
  }
  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";
  recognition.onstart = () => {
    updateVoiceStatus("Listening");
    setSynraState("listening", "Listening.");
  };
  recognition.onerror = () => {
    updateVoiceStatus("Listen stopped");
    setSynraState("idle", "Listening stopped.");
  };
  recognition.onend = () => {
    refreshVoiceStatus();
    if (state.synra === "listening") setSynraState("idle", "Ready.");
  };
  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const text = event.results[0]?.[0]?.transcript?.trim();
    if (text) {
      setSynraState("thinking", "Heard you.");
      void handleUserText(text);
    }
  };
  setSynraState("listening", "Listening.");
  recognition.start();
}

async function ensureMicrophoneReady(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    for (const track of stream.getTracks()) track.stop();
    return true;
  } catch {
    return false;
  }
}

function refreshVoiceStatus(): void {
  const canSpeak = "speechSynthesis" in window;
  const canListen = Boolean(
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition
  );
  if (canSpeak && canListen) updateVoiceStatus("Speak + listen");
  else if (canSpeak) updateVoiceStatus("Speak ready");
  else if (canListen) updateVoiceStatus("Listen ready");
  else updateVoiceStatus("Text ready");
}

function updateVoiceStatus(label: string): void {
  state.voiceStatus = label;
  voiceStateEl.textContent = label;
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
  if (now - state.lastRenderAt < performanceProfile.frameIntervalMs) return;
  state.lastRenderAt = now;
  const delta = state.clock.getDelta();
  updatePerformance(now);
  updateTelemetry(now);
  if (!renderer) return;
  updateAvatar(delta, now);
  updateIdleLife(now);
  renderer.render(scene, camera);
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
  const payload = {
    fps: state.fps,
    targetFps: performanceProfile.targetFps,
    renderScale: resolveEffectivePixelRatio(),
    performanceTier: state.performanceTier,
    synraState: state.synra,
    avatarId: state.visual.avatarId,
    activeMotion: state.motionPlayer.snapshot.activeClipId,
    webgl: renderer ? "available" : "unavailable",
    runtimeMode,
    route: state.lastRouteLabel,
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
  if (state.synra !== "idle" || !state.motionPlayer.snapshot.ready) return;
  if (now < state.nextLifeMotionAt) return;
  state.lastLifeMotionAt = now;
  state.nextLifeMotionAt = now + randomBetween(runtimeMode === "kiosk" ? 22000 : 16000, runtimeMode === "kiosk" ? 42000 : 30000);
  if (now - state.lastPresenceNudgeAt > 90000) {
    state.lastPresenceNudgeAt = now;
    captionEl.textContent = PRESENCE_NUDGES[Math.floor(Math.random() * PRESENCE_NUDGES.length)];
  }
  const route = IDLE_LIFE_GESTURES[Math.floor(Math.random() * IDLE_LIFE_GESTURES.length)];
  void playMotionRoute(route, { restart: true, returnToIdle: true });
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function setSynraState(next: SynraState, caption: string): void {
  state.synra = next;
  document.body.dataset.synraState = next;
  statusEl.textContent = next.charAt(0).toUpperCase() + next.slice(1);
  presenceStateEl.textContent = next === "idle" ? "Ready" : next.charAt(0).toUpperCase() + next.slice(1);
  captionEl.textContent = caption;
  const route = routeForSynraState(next);
  if (route && state.motionPlayer.snapshot.ready) void playMotionRoute(route, { loop: true, restart: next !== "idle" });
}

function routeForSynraState(next: SynraState): string | null {
  const available = STATE_MOTION_VARIETY[next].filter((route) => Boolean(state.motionPlayer.resolveClipId(route)));
  if (available.length === 0) return null;
  const previous = state.lastAutoMotionByState[next];
  let nextRoute = available[Math.floor(Math.random() * available.length)];
  if (available.length > 1 && nextRoute === previous) {
    nextRoute = available[(available.indexOf(nextRoute) + 1) % available.length];
  }
  state.lastAutoMotionByState[next] = nextRoute;
  return nextRoute;
}

function pushMessage(role: SynraMessage["role"], text: string): void {
  state.messages.push({
    id: createId(),
    role,
    text,
    createdAt: new Date().toISOString()
  });
  state.messages = state.messages.slice(-24);
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
}

function resolveModelProvider(provider: string | undefined): ModelSettings["provider"] {
  return provider === "openAICompatible" || provider === "localHTTP" || provider === "server" ? provider : "server";
}

function resize(): void {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const portrait = width / height < 0.72;
  const wideStage = width / height > 1.35;
  camera.fov = portrait ? 29 : wideStage ? 26.5 : 26;
  camera.position.set(0, portrait ? 1.0 : wideStage ? 0.98 : 0.96, portrait ? 5.05 : wideStage ? 4.72 : 4.62);
  camera.lookAt(0, portrait ? 0.92 : wideStage ? 0.9 : 0.92, 0);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (!renderer) return;
  renderer.setPixelRatio(resolveEffectivePixelRatio());
  renderer.setSize(width, height, false);
}

function resolvePixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, performanceProfile.maxPixelRatio);
}

function resolveEffectivePixelRatio(): number {
  const base = resolvePixelRatio();
  const renderScale = resolveRenderScaleOverride();
  if (renderScale !== null) return renderScale;
  if (state.performanceTier === "forced-low") return Math.min(base, performanceProfile.name === "jetson" ? 1.0 : 0.72);
  if (state.performanceTier === "low") return Math.min(base, performanceProfile.name === "jetson" ? 1.0 : 0.82);
  return base;
}

function resolveRenderScaleOverride(): number | null {
  const requestedScale = Number(new URLSearchParams(window.location.search).get("scale") || "");
  if (!Number.isFinite(requestedScale)) return null;
  return Math.min(Math.max(requestedScale, 0.5), 2);
}

function resolveInitialPerformanceTier(): "normal" | "low" | "forced-low" {
  const quality = new URLSearchParams(window.location.search).get("quality");
  return quality === "low" ? "forced-low" : "normal";
}

function resolveInitialVisualSettings() {
  const visual = loadVisualSettings();
  const requestedAvatar = new URLSearchParams(window.location.search).get("avatar");
  return isSynraAvatarId(requestedAvatar) ? { ...visual, avatarId: requestedAvatar } : visual;
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
  const looksLikeJetson = requestedProfile === "jetson" || /aarch64|jetson|linux arm/i.test(navigator.userAgent);
  const requestedFps = Number(params.get("fps") || "");
  const minimumFps = runtimeMode === "kiosk" || looksLikeJetson ? 5 : 15;
  const targetFps = Number.isFinite(requestedFps) && requestedFps >= minimumFps && requestedFps <= 60 ? requestedFps : runtimeMode === "kiosk" ? 15 : looksLikeJetson ? 24 : 60;
  return {
    name: looksLikeJetson ? "jetson" : "desktop",
    targetFps,
    frameIntervalMs: 1000 / targetFps,
    maxPixelRatio: looksLikeJetson ? 1.0 : 1.25
  };
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
}

interface SpeechRecognitionEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
