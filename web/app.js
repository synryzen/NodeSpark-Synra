const stage = document.querySelector(".synra-stage");
const stateLabel = document.getElementById("stateLabel");
const messageText = document.getElementById("messageText");
const subtitleText = document.getElementById("subtitleText");
const cardStyle = document.getElementById("cardStyle");
const cardTitle = document.getElementById("cardTitle");
const cardBody = document.getElementById("cardBody");
const cardDetail = document.getElementById("cardDetail");
const progressBar = document.getElementById("progressBar");
const modeStrip = document.getElementById("modeStrip");
const listenButton = document.getElementById("listenButton");
const cameraButton = document.getElementById("cameraButton");
const visionButton = document.getElementById("visionButton");
const voiceNote = document.getElementById("voiceNote");
const micStatus = document.getElementById("micStatus");
const cameraStatus = document.getElementById("cameraStatus");
const presenceVideo = document.getElementById("presenceVideo");
const commandForm = document.getElementById("commandForm");
const commandInput = document.getElementById("commandInput");
const commandSubmit = document.getElementById("commandSubmit");
const hubStatus = document.getElementById("hubStatus");
const backgroundSelect = document.getElementById("backgroundSelect");
const voiceSelect = document.getElementById("voiceSelect");
const voiceTestButton = document.getElementById("voiceTestButton");
const personalitySelect = document.getElementById("personalitySelect");
const motionSelect = document.getElementById("motionSelect");
const hubSetup = document.getElementById("hubSetup");
const hubSetupStatus = document.getElementById("hubSetupStatus");
const hubConnectForm = document.getElementById("hubConnectForm");
const hubUrlInput = document.getElementById("hubUrlInput");
const hubConnectButton = document.getElementById("hubConnectButton");
const hubPairForm = document.getElementById("hubPairForm");
const pairCodeInput = document.getElementById("pairCodeInput");
const hubPairButton = document.getElementById("hubPairButton");
const pairingAction = document.getElementById("pairingAction");
const pairingDeviceName = document.getElementById("pairingDeviceName");
const pairingDeviceId = document.getElementById("pairingDeviceId");
const hubOpenButton = document.getElementById("hubOpenButton");
const hubCheckButton = document.getElementById("hubCheckButton");
const pairingCopyButton = document.getElementById("pairingCopyButton");
const pairingUriText = document.getElementById("pairingUriText");
const workflowSelect = document.getElementById("workflowSelect");
const runWorkflowButton = document.getElementById("runWorkflowButton");
const hubDetail = document.getElementById("hubDetail");
const localBrainBadge = document.getElementById("localBrainBadge");
const hubBrainBadge = document.getElementById("hubBrainBadge");
const voiceBrainBadge = document.getElementById("voiceBrainBadge");
const live2dBadge = document.getElementById("live2dBadge");
const live2dStatusPill = document.getElementById("live2dStatusPill");
const setupMeterLabel = document.getElementById("setupMeterLabel");
const setupMeterValue = document.getElementById("setupMeterValue");
const setupSteps = document.getElementById("setupSteps");
const setupDiagnostics = document.getElementById("setupDiagnostics");
const emotionBadge = document.getElementById("emotionBadge");
const coreGrid = document.getElementById("coreGrid");
const setupGuide = document.getElementById("setupGuide");
const opsBoard = document.getElementById("opsBoard");
const stagedQueue = document.getElementById("stagedQueue");
const runStagedButton = document.getElementById("runStagedButton");
const clearStagedButton = document.getElementById("clearStagedButton");
const memoryForm = document.getElementById("memoryForm");
const memoryNameInput = document.getElementById("memoryNameInput");
const memoryNoteInput = document.getElementById("memoryNoteInput");
const memorySaveButton = document.getElementById("memorySaveButton");
const memoryClearButton = document.getElementById("memoryClearButton");
const activityFeed = document.getElementById("activityFeed");

let lastSpeechId = "";
let recognition = null;
let isListening = false;
let cameraStream = null;
let faceDetector = null;
let audioLevel = 0;
let targetMotion = { x: 0, y: 0, rotate: 0, scale: 1, mouth: 0 };
let currentMotion = { x: 0, y: 0, rotate: 0, scale: 1, mouth: 0 };
let blinkUntil = 0;
let nextBlink = performance.now() + 1600;
let lastStateMode = "idle";
let lastServerState = null;
let lastRenderedStateSignature = "";
let mediaActivationStarted = false;
let speechVisualLock = false;
let speechReleaseTimer = null;
let commandSubmitting = false;
let speechOutputEnabled = false;
let activeSpeechAudio = null;
let speechMouthTimer = null;
let speechAudioContext = null;
let speechMeterSource = null;
let speechAnalyser = null;
let speechAnalyserData = null;
let lastHealth = null;
let ttsStatus = { available: false, provider: "browser" };
let live2dStatus = { modelReady: false, runtimeReady: false };
let activityItems = [];
let activeAssistantTurn = 0;
const cssNumberCache = new Map();
const pageParams = new URLSearchParams(window.location.search);
const serverTtsStartTimeoutMs = 12000;
const quickAckTtsTimeoutMs = 1100;
const quickAckTexts = ["On it.", "I’m listening.", "Okay."];

const storageKeys = {
  background: "nodespark.synra.background",
  voice: "nodespark.synra.voice",
  personality: "nodespark.synra.personality",
  motion: "nodespark.synra.motion"
};

const voicePresets = {
  cute: {
    rate: 1.02,
    pitch: 1.26,
    volume: 1,
    match: /samantha|victoria|ava|jenny|aria|zira|female|natural/i
  },
  soft: {
    rate: 0.94,
    pitch: 1.12,
    volume: 0.94,
    match: /samantha|victoria|ava|allison|susan|karen|zira|female|natural/i
  },
  calm: {
    rate: 0.9,
    pitch: 1.08,
    volume: 0.96,
    match: /victoria|samantha|ava|jenny|aria|female|natural/i
  }
};

const naturalFemaleVoiceNames = /allison|aria|ava|catherine|fiona|joana|joanna|jenny|karen|kathy|kendra|kimberly|lisa|moira|nicky|samantha|sara|serena|susan|tessa|veena|victoria|zira|zoe|female/i;
const unnaturalVoiceNames = /albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|eddy|fred|good news|hysterical|junior|organ|pipe organ|princess|ralph|rocko|shelley|superstar|trinoids|whisper|wobble|zarvox|robot|novelty|compact/i;
const maleVoiceNames = /aaron|alex|arthur|bruce|daniel|david|diego|eddy|fred|george|grandpa|jacques|jorge|juan|lee|liam|lucas|mark|martin|nathan|oliver|paul|reed|rishi|rocko|sandy|thomas|tom|xander|yuri|male/i;

const demoText = {
  listening: "I’m listening. Tell me what you want NodeSparkHub to do.",
  thinking: "Give me a second. I’m tracing the best workflow path.",
  speaking: "NodeSparkHub is online. I’m ready to help.",
  workflow_running: "I’m running the workflow now.",
  success: "Done. That workflow landed cleanly.",
  confused: "I’m not fully sure what you mean yet.",
  sad: "Something did not land the way we wanted.",
  look_left: "Checking the left side.",
  look_right: "Checking the right side.",
  look_up: "Looking up at the next signal.",
  look_down: "Looking down at the task details.",
  wave: "Hi. I’m here and ready.",
  stretch: "One second. Re-centering.",
  explain: "I’ll walk through it clearly.",
  delighted: "That landed beautifully.",
  playful: "I like where this is going.",
  curious: "Let me look at that from another angle.",
  determined: "I’m on it. Let’s make this work.",
  soft_nod: "Yes. I’m with you.",
  hair_tuck: "Just a tiny reset.",
  idle_shift: "I’m still here."
};

const demoStates = {
  listening: { mode: "listening", expression: "attentive", title: "Voice Input", style: "listening" },
  thinking: { mode: "thinking", expression: "focused", title: "Reasoning", style: "thinking" },
  workflow_running: { mode: "workflow_running", expression: "focused", title: "Workflow Running", style: "workflow", progress: 0.54 },
  speaking: { mode: "speaking", expression: "bright", title: "Synra Voice", style: "voice" },
  success: { mode: "success", expression: "wink", title: "Workflow Complete", style: "success", progress: 1 },
  confused: { mode: "warning", expression: "confused", title: "Clarify Request", style: "warning" },
  sad: { mode: "error", expression: "sad", title: "Needs Attention", style: "error" },
  look_left: { mode: "idle", expression: "look_left", title: "Focus Left", style: "info" },
  look_right: { mode: "idle", expression: "look_right", title: "Focus Right", style: "info" },
  look_up: { mode: "idle", expression: "look_up", title: "Focus Up", style: "info" },
  look_down: { mode: "idle", expression: "look_down", title: "Focus Down", style: "info" },
  wave: { mode: "success", expression: "wave", title: "Greeting", style: "success" },
  stretch: { mode: "idle", expression: "stretch", title: "Idle Motion", style: "info" },
  explain: { mode: "speaking", expression: "explain", title: "Explanation", style: "voice" },
  delighted: { mode: "success", expression: "delighted", title: "Delighted", style: "success", progress: 1 },
  playful: { mode: "speaking", expression: "playful", title: "Playful", style: "voice" },
  curious: { mode: "warning", expression: "curious", title: "Curious", style: "info" },
  determined: { mode: "workflow_running", expression: "determined", title: "Determined", style: "workflow", progress: 0.64 },
  soft_nod: { mode: "idle", expression: "soft_nod", title: "Soft Nod", style: "info" },
  hair_tuck: { mode: "idle", expression: "hair_tuck", title: "Hair Tuck", style: "info" },
  idle_shift: { mode: "idle", expression: "idle_shift", title: "Idle Shift", style: "info" }
};

function hasLocalMediaOrigin() {
  return window.isSecureContext || ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function shouldEnableSpeechOutput() {
  const override = pageParams.get("voiceOutput");
  if (override === "1" || override === "true") return true;
  if (override === "0" || override === "false") return false;
  return true;
}

function storageGet(key, fallback) {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Kiosk/private contexts can block localStorage; controls still work for the session.
  }
}

function applyBackground(value, options = {}) {
  const persist = options.persist !== false;
  const background = value || "grid";
  document.documentElement.dataset.background = background;
  if (backgroundSelect) backgroundSelect.value = background;
  storageSet(storageKeys.background, background);
  if (persist) postSettings({ background });
}

function applyVoice(value) {
  const voice = value || "cute";
  if (voiceSelect) voiceSelect.value = voice;
  storageSet(storageKeys.voice, voice);
  postSettings({ voice });
}

function applyPersonality(value, options = {}) {
  const personality = value || "balanced";
  const persist = options.persist !== false;
  document.documentElement.dataset.personality = personality;
  if (personalitySelect) personalitySelect.value = personality;
  storageSet(storageKeys.personality, personality);
  window.synraAvatar3D?.setPersonality?.(personality);
  window.synraLive2D?.setPersonality?.(personality);
  window.synraConcept2D?.setPersonality?.(personality);
  if (persist) postSettings({ personality });
}

function applyMotion(value, options = {}) {
  const motion = value || "normal";
  const persist = options.persist !== false;
  document.documentElement.dataset.motion = motion;
  if (motionSelect) motionSelect.value = motion;
  storageSet(storageKeys.motion, motion);
  window.synraAvatar3D?.setMotionLevel?.(motion);
  window.synraLive2D?.setMotionLevel?.(motion);
  window.synraConcept2D?.setMotionLevel?.(motion);
  if (persist) postSettings({ motion });
}

async function postSettings(settings) {
  try {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
  } catch {
    // Settings still persist locally when the API is unavailable.
  }
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : {};
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `${path} failed`);
  }
  return data;
}

async function showPanelError(title, body, detail = "Synra kept the session alive.") {
  await setRemoteState({
    mode: "error",
    expression: "concerned",
    message: body,
    subtitle: title,
    card: {
      title,
      body,
      detail,
      style: "error"
    }
  });
}

async function fetchSettings() {
  try {
    const response = await fetch("/api/settings", { cache: "no-store" });
    const data = await response.json();
    if (!data.ok) return;
    const settings = data.settings || {};
    if (settings.background) {
      applyBackground(settings.background, { persist: false });
    }
    if (settings.voice) {
      storageSet(storageKeys.voice, settings.voice);
      if (voiceSelect) voiceSelect.value = settings.voice;
    }
    applyPersonality(settings.personality || storageGet(storageKeys.personality, "balanced"), { persist: false });
    applyMotion(settings.motion || storageGet(storageKeys.motion, "normal"), { persist: false });
  } catch {
    // Local storage covers offline sessions.
  }
}

function availableVoices() {
  return "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
}

function voiceLabel(voice) {
  return `${voice.name || ""} ${voice.voiceURI || ""} ${voice.lang || ""}`.trim();
}

function isNaturalFemaleVoice(voice) {
  const label = voiceLabel(voice);
  return (
    voice.lang?.toLowerCase().startsWith("en") &&
    naturalFemaleVoiceNames.test(label) &&
    !maleVoiceNames.test(label) &&
    !unnaturalVoiceNames.test(label)
  );
}

function populateVoiceSelect() {
  if (!voiceSelect) return;
  if (ttsStatus.available) {
    syncVoiceOptions();
    return;
  }
  const selected = storageGet(storageKeys.voice, "cute");
  [...voiceSelect.options].forEach((option) => {
    if (option.value.startsWith("voice:")) option.remove();
  });
  const existingVoiceValues = new Set([...voiceSelect.options].map((option) => option.value));
  availableVoices()
    .filter(isNaturalFemaleVoice)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((voice) => {
      const value = `voice:${voice.voiceURI || voice.name}`;
      if (existingVoiceValues.has(value)) return;
      const option = document.createElement("option");
      option.value = value;
      option.textContent = voice.name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
      voiceSelect.append(option);
      existingVoiceValues.add(value);
    });
  voiceSelect.value = [...voiceSelect.options].some((option) => option.value === selected) ? selected : "cute";
  if (voiceSelect.value !== selected) storageSet(storageKeys.voice, voiceSelect.value);
}

function syncVoiceOptions() {
  if (!voiceSelect) return;
  const selected = storageGet(storageKeys.voice, voiceSelect.value || "qwen:anime");
  const serverVoices = Array.isArray(ttsStatus.voices) ? ttsStatus.voices : [];
  if (ttsStatus.available && serverVoices.length) {
    voiceSelect.innerHTML = "";
    serverVoices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.id;
      option.textContent = `${voice.name}${voice.style ? ` - ${voice.style}` : ""}`;
      voiceSelect.append(option);
    });
    const hasSelected = [...voiceSelect.options].some((option) => option.value === selected);
    voiceSelect.value = hasSelected && !selected.startsWith("voice:") ? selected : serverVoices[0].id;
    storageSet(storageKeys.voice, voiceSelect.value);
    return;
  }
  voiceSelect.innerHTML = "";
  ["cute", "soft", "calm"].forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value === "cute" ? "Browser natural" : value === "soft" ? "Browser soft" : "Browser calm";
    voiceSelect.append(option);
  });
  populateVoiceSelect();
}

function currentVoicePreference() {
  return storageGet(storageKeys.voice, voiceSelect?.value || "cute");
}

function applyVoicePreference(utterance) {
  const preference = currentVoicePreference();
  const voices = availableVoices();
  const preset = voicePresets[preference] || voicePresets.cute;
  utterance.rate = preset.rate;
  utterance.pitch = preset.pitch;
  utterance.volume = preset.volume;
  let preferred = null;
  if (preference.startsWith("voice:")) {
    const voiceId = preference.slice("voice:".length);
    preferred = voices.find((voice) => (voice.voiceURI === voiceId || voice.name === voiceId) && isNaturalFemaleVoice(voice));
  }
  preferred ||= voices.find((voice) => isNaturalFemaleVoice(voice) && preset.match.test(voiceLabel(voice)));
  preferred ||= voices.find(isNaturalFemaleVoice);
  if (preferred) utterance.voice = preferred;
}

async function fetchState() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("application/json")) return;
    const data = await response.json();
    if (data.ok) renderState(data.state);
  } catch (error) {
    renderState({
      mode: "error",
      expression: "concerned",
      message: "Synra lost contact with her local daemon.",
      subtitle: String(error),
      card: {
        title: "Local API Offline",
        body: "Check the nodespark-synra service.",
        detail: "The monitor UI is still running.",
        style: "error"
      }
    });
  }
}

async function fetchHealth() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("application/json")) return;
    const health = await response.json();
    if (health.ok) renderHealth(health);
  } catch {
    if (hubStatus) hubStatus.textContent = "Hub unknown";
  }
}

async function fetchTtsStatus() {
  try {
    const response = await fetch("/api/tts/status", { cache: "no-store" });
    const data = await response.json();
    if (data.ok) {
      ttsStatus = data;
      syncVoiceOptions();
      renderTtsStatus();
      primeSelectedVoice();
    }
  } catch {
    ttsStatus = { available: false, provider: "browser" };
    syncVoiceOptions();
    renderTtsStatus();
  }
}

function primeSelectedVoice() {
  if (!speechOutputEnabled || !ttsStatus.available) return;
  fetch("/api/tts/prime", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voices: [currentVoicePreference()],
      texts: quickAckTexts
    })
  }).catch(() => {});
}

async function updateMemory(payload) {
  const data = await postJson("/api/memory", payload);
  renderMemory(data.memory || {});
  await fetchHealth();
  return data.memory || {};
}

function renderTtsStatus() {
  if (!voiceNote) return;
  const provider = ttsStatus.available ? ttsStatus.provider : "browser";
  const selected = selectedVoiceName();
  const label = provider === "elevenlabs"
    ? `Natural voice ready: ${selected}`
    : provider === "qwen"
      ? `Expressive anime voice: ${selected}`
    : provider === "voicebox"
      ? `Expressive anime voice: ${selected}`
    : provider === "kokoro"
      ? `Local neural voice: ${selected}`
      : `Browser voice fallback: ${selected}`;
  voiceNote.textContent = label;
  updateBrainBadges(lastHealth);
  renderCoreStatus(lastHealth);
}

function selectedVoiceName() {
  if (!voiceSelect) return "Synra";
  return voiceSelect.selectedOptions?.[0]?.textContent || voiceSelect.value || "Synra";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function renderHealth(health) {
  lastHealth = health;
  updateBrainBadges(health);
  renderSetup(health.setup, health);
  renderCoreStatus(health);
  renderSetupGuide(health.setup, health);
  renderPairingStation(health);
  renderOperations(health);
  renderStagedQueue(health);
  renderActivityFeed(health.activity || []);
  renderMemory(health.memory || {});
  if (!hubStatus) return;
  if (!health.hubConfigured) {
    hubStatus.textContent = "Local mode";
    hubStatus.dataset.status = "local";
    if (hubSetup) hubSetup.open = true;
    if (hubSetupStatus) hubSetupStatus.textContent = "Local";
    if (hubDetail) hubDetail.textContent = "NodeSparkHub URL needed";
    if (hubUrlInput && health.hubUrl) hubUrlInput.value = health.hubUrl;
    refreshWorkflowOptions(health.favoriteWorkflows || []);
    return;
  }
  if (!health.hubPaired) {
    hubStatus.textContent = "Pair Hub";
    hubStatus.dataset.status = "local";
    if (hubSetupStatus) hubSetupStatus.textContent = "Unpaired";
    if (hubDetail) hubDetail.textContent = health.hubLastError || "Pair Synra with NodeSparkHub to unlock Hub AI and workflows";
    if (hubUrlInput) hubUrlInput.value = health.hubUrl || "";
    if (hubSetup) hubSetup.open = true;
    refreshWorkflowOptions(health.favoriteWorkflows || []);
    return;
  }
  if (health.hubCanTry === false) {
    hubStatus.textContent = "Hub offline";
    hubStatus.dataset.status = "offline";
    if (hubSetupStatus) hubSetupStatus.textContent = "Offline";
    if (hubDetail) hubDetail.textContent = health.hubLastError || "NodeSparkHub unavailable";
    if (hubUrlInput) hubUrlInput.value = health.hubUrl || "";
    refreshWorkflowOptions(health.favoriteWorkflows || []);
    return;
  }
  hubStatus.textContent = health.hubPaired ? "Hub linked" : "Hub ready";
  hubStatus.dataset.status = "online";
  if (hubSetupStatus) hubSetupStatus.textContent = health.hubPaired ? "Linked" : "Ready";
  if (hubDetail) {
    const local = health.localAI?.available ? `Local: ${health.localAI.model}` : "Local: standby";
    hubDetail.textContent = `${local} / Hub: ${health.assistantModel || "default"} / ${health.defaultWorkflow || "Workflow"}`;
  }
  if (hubUrlInput) hubUrlInput.value = health.hubUrl || "";
  if (hubSetup) hubSetup.open = !health.hubPaired;
  refreshWorkflowOptions(health.favoriteWorkflows || []);
}

function renderPairingStation(health = lastHealth) {
  const pairing = health?.pairing || {};
  const paired = Boolean(health?.hubPaired);
  const configured = Boolean(health?.hubConfigured);
  if (pairingAction) {
    pairingAction.textContent = paired
      ? "Linked"
      : configured
        ? "Pair code needed"
        : "Hub URL needed";
    pairingAction.dataset.status = paired ? "online" : configured ? "todo" : "local";
  }
  if (pairingDeviceName) pairingDeviceName.textContent = pairing.deviceName || health?.deviceName || "NodeSpark Synra";
  if (pairingDeviceId) pairingDeviceId.textContent = pairing.deviceId || health?.deviceId || "device pending";
  if (pairingUriText) {
    pairingUriText.textContent = pairing.nextAction || "Save the Hub URL, then enter a pair code from NodeSparkHub.";
    pairingUriText.title = pairing.pairingUri || "";
  }
  if (hubOpenButton) {
    hubOpenButton.disabled = !configured;
    hubOpenButton.title = configured ? (health.hubUrl || "") : "Save the Hub URL first.";
  }
  if (hubCheckButton) hubCheckButton.disabled = !configured;
  if (pairingCopyButton) pairingCopyButton.disabled = !(pairing.deviceId || health?.deviceId);
}

function renderOperations(health = lastHealth) {
  if (!opsBoard) return;
  const ops = health?.operations || {};
  const active = ops.currentMode === "workflow_running" || ops.currentMode === "thinking" || ops.currentMode === "listening";
  const route = ops.lastRoute || (health?.hubPaired ? "hub:ready" : "local:first");
  const source = ops.lastReplySource || "standby";
  const cards = [
    {
      label: "Current",
      detail: ops.currentMessage || "Synra is standing by.",
      status: active ? "workflow" : "online"
    },
    {
      label: "Hub",
      detail: ops.hubState || "checking",
      status: health?.hubPaired ? "online" : "todo"
    },
    {
      label: "Route",
      detail: `${route}${source !== "standby" ? ` / ${source}` : ""}`,
      status: source === "fallback" ? "warning" : "online"
    },
    {
      label: ops.activeWorkflow ? "Workflow" : "Queue",
      detail: ops.activeWorkflow || `${ops.stagedWorkflowCount || 0} staged / ${ops.assistantTurns || 0} turns`,
      status: ops.activeWorkflow || ops.stagedWorkflowCount ? "workflow" : "online"
    }
  ];
  opsBoard.innerHTML = "";
  cards.forEach((card) => {
    const item = document.createElement("span");
    item.dataset.status = card.status;
    item.innerHTML = `<strong>${escapeHtml(card.label)}</strong><small>${escapeHtml(card.detail)}</small>`;
    opsBoard.append(item);
  });
}

function renderStagedQueue(health = lastHealth) {
  if (!stagedQueue) return;
  const staged = health?.stagedWorkflows || [];
  const next = staged[0] || {};
  const count = staged.length;
  const canRun = count > 0 && Boolean(health?.hubPaired && health?.hubCanTry !== false);
  stagedQueue.dataset.status = count ? (canRun ? "ready" : "waiting") : "empty";
  const label = count ? `${count} staged workflow${count === 1 ? "" : "s"}` : "No staged workflows";
  const detail = count
    ? `${next.workflowName || "Workflow"} waits for ${canRun ? "launch" : "Hub pairing"}`
    : "Synra will hold workflow requests here while the Hub is unavailable.";
  const body = stagedQueue.querySelector("div");
  if (body) {
    body.innerHTML = `<strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small>`;
  }
  if (runStagedButton) {
    runStagedButton.disabled = !canRun;
    runStagedButton.dataset.workflowId = next.id || "";
    runStagedButton.textContent = count ? "Run next" : "Run";
    runStagedButton.title = canRun ? `Run ${next.workflowName || "staged workflow"}` : "Pair NodeSparkHub before running staged workflows.";
  }
  if (clearStagedButton) {
    clearStagedButton.disabled = count === 0;
    clearStagedButton.textContent = count ? "Clear" : "Clear";
    clearStagedButton.title = count ? "Clear staged workflow requests." : "No staged workflows to clear.";
  }
}

function renderCoreStatus(health = lastHealth) {
  if (!coreGrid) return;
  const privacy = health?.privacy || {};
  const localReady = Boolean(health?.localAI?.available);
  const visionReady = Boolean(health?.localAI?.visionAvailable);
  const hubReady = Boolean(health?.hubPaired && health?.hubCanTry !== false);
  const voiceProvider = ttsStatus.available ? ttsStatus.provider : "browser";
  const cards = [
    {
      label: localReady ? `Local AI ${health.localAI.model}` : "Local AI standby",
      detail: localReady ? "Private general answers" : "Install/pull local model",
      status: localReady ? "online" : "local"
    },
    {
      label: visionReady ? `Vision ${health.localAI.visionModel}` : "Vision standby",
      detail: privacy.visionLocal ? "Camera stays local" : "Pull vision model",
      status: visionReady ? "online" : "local"
    },
    {
      label: voiceProvider === "qwen" || voiceProvider === "voicebox" ? "Expressive anime voice" : voiceProvider === "kokoro" ? "Local natural voice" : voiceProvider === "elevenlabs" ? "ElevenLabs voice" : "Browser voice",
      detail: voiceProvider === "browser" ? "Fallback active" : "Natural speech ready",
      status: ttsStatus.available ? "online" : "local"
    },
    {
      label: hubReady ? "Hub linked" : health?.hubConfigured ? "Pair Hub" : "Hub URL needed",
      detail: hubReady ? (health.assistantModel || "Hub default model") : (health?.hubLastError || "Workflows wait here"),
      status: hubReady ? "online" : "warning"
    },
    {
      label: "Memory local",
      detail: `${health?.memory?.assistantTurns || 0} turns remembered`,
      status: "online"
    },
    {
      label: "NodeSpark only",
      detail: "Synra routes actions through NodeSparkHub",
      status: "online"
    }
  ];
  coreGrid.innerHTML = "";
  cards.forEach((card) => {
    const item = document.createElement("span");
    item.dataset.status = card.status;
    item.innerHTML = `<strong>${escapeHtml(card.label)}</strong><small>${escapeHtml(card.detail)}</small>`;
    coreGrid.append(item);
  });
}

function renderMemory(memory = {}) {
  if (memoryNameInput && document.activeElement !== memoryNameInput) {
    memoryNameInput.value = memory.preferredName || "";
  }
  if (memoryNoteInput && document.activeElement !== memoryNoteInput) {
    memoryNoteInput.value = memory.profileNote || "";
  }
}

function renderSetupGuide(setup, health = lastHealth) {
  if (!setupGuide || !setup) return;
  const steps = setup.steps || [];
  const next = steps.find((step) => !step.done);
  const complete = Boolean(setup.ready);
  const title = complete ? "Launch ready" : next?.label || "Setup";
  const detail = complete
    ? "Synra is ready for local AI, voice, vision, Hub AI, and workflows."
    : setupActionFor(next, health);
  setupGuide.innerHTML = "";
  const lines = [
    { label: complete ? title : `Next: ${title}`, detail, status: complete ? "online" : "todo" },
    {
      label: health?.hubPaired ? "Pairing linked" : "Pairing",
      detail: health?.hubPaired ? "Workflow commands are unlocked." : "Enter a pair code from NodeSparkHub.",
      status: health?.hubPaired ? "online" : "todo"
    },
    {
      label: health?.privacy?.localFirst ? "Private by default" : "Privacy",
      detail: health?.privacy?.localFirst ? "Memory and local AI stay on this device." : "Enable local AI for private answers.",
      status: health?.privacy?.localFirst ? "online" : "todo"
    }
  ];
  if (next?.id !== "hub_url") {
    lines.splice(1, 0, {
      label: health?.hubUrl ? "Hub URL saved" : "Hub URL",
      detail: health?.hubUrl || "Use your NodeSparkHub address.",
      status: health?.hubUrl ? "online" : "todo"
    });
  }
  lines.forEach((line) => {
    const item = document.createElement("span");
    item.dataset.status = line.status;
    item.innerHTML = `<strong>${escapeHtml(line.label)}</strong><small>${escapeHtml(line.detail)}</small>`;
    setupGuide.append(item);
  });
}

function setupActionFor(step, health = lastHealth) {
  if (!step) return "Everything is ready.";
  if (step.id === "hub_url") return "Save the NodeSparkHub URL for this monitor.";
  if (step.id === "pairing") return "Generate a pair code in NodeSparkHub, then enter it here.";
  if (step.id === "local_ai") return `Start Ollama and pull ${health?.localAI?.model || "the text model"}.`;
  if (step.id === "vision") return `Pull ${health?.localAI?.visionModel || "the vision model"} for camera awareness.`;
  if (step.id === "voice") return "Enable Qwen, Voicebox, Kokoro, or ElevenLabs for natural speech.";
  return "Refresh workflows from NodeSparkHub.";
}

function updateBrainBadges(health) {
  if (localBrainBadge) {
    const ready = Boolean(health?.localAI?.available);
    localBrainBadge.textContent = ready ? `Local ${health.localAI.model}` : "Local standby";
    localBrainBadge.dataset.status = ready ? "online" : "local";
  }
  if (hubBrainBadge) {
    const ready = Boolean(health?.hubPaired && health?.hubCanTry !== false);
    hubBrainBadge.textContent = ready ? `Hub ${health.assistantModel || "default"}` : "Hub standby";
    hubBrainBadge.dataset.status = ready ? "online" : "local";
  }
  if (voiceBrainBadge) {
    const ready = Boolean(ttsStatus.available);
    voiceBrainBadge.textContent = ready ? `${ttsStatus.provider} voice` : "Browser voice";
    voiceBrainBadge.dataset.status = ready ? "online" : "local";
  }
  renderLive2DStatus(live2dStatus);
}

function renderLive2DStatus(status = live2dStatus) {
  live2dStatus = status || {};
  if (!live2dBadge) return;
  const runtimeReady = Boolean(live2dStatus.runtimeReady);
  const modelReady = Boolean(live2dStatus.modelReady);
  const missingModel = runtimeReady && !modelReady;
  live2dBadge.textContent = modelReady
    ? "Live2D model"
    : runtimeReady
      ? "Live2D runtime"
      : "Live2D missing";
  live2dBadge.title = modelReady
    ? "Synra is using the Live2D Cubism model."
    : runtimeReady
      ? "Live2D runtime is installed; waiting for web/assets/live2d/synra/synra.model3.json."
      : "Live2D runtime files are not available.";
  live2dBadge.dataset.status = modelReady ? "online" : runtimeReady ? "warning" : "offline";
  if (live2dStatusPill) {
    live2dStatusPill.dataset.status = modelReady ? "online" : missingModel ? "warning" : "offline";
    live2dStatusPill.textContent = modelReady
      ? "Live2D Synra model active"
      : missingModel
        ? "Live2D runtime ready - export Synra Cubism model"
        : "Live2D runtime missing";
  }
}

async function fetchLive2DStatus() {
  try {
    const response = await fetch("/api/live2d", { cache: "no-store" });
    const data = await response.json();
    renderLive2DStatus(data.live2d || {});
  } catch {
    renderLive2DStatus({ modelReady: false, runtimeReady: false });
  }
  if (lastHealth?.setup) renderSetup(lastHealth.setup, lastHealth);
}

function live2dSetupStep() {
  const runtimeReady = Boolean(live2dStatus.runtimeReady);
  const modelReady = Boolean(live2dStatus.modelReady);
  return {
    id: "live2d_model",
    label: "Live2D",
    done: modelReady,
    detail: modelReady
      ? "Synra Cubism model installed"
      : runtimeReady
        ? "Export synra.model3.json from Live2D Cubism"
        : "Install Live2D browser runtime"
  };
}

function setupWithVisualRig(setup) {
  const steps = [...(setup?.steps || [])];
  const hasLive2DStep = steps.some((step) => step.id === "live2d_model");
  if (!hasLive2DStep) steps.push(live2dSetupStep());
  const complete = steps.filter((step) => step.done).length;
  return {
    ...setup,
    complete,
    total: steps.length,
    ready: complete === steps.length,
    steps
  };
}

function renderSetup(setup, health = lastHealth) {
  if (!setup || !setupSteps) return;
  const visualSetup = setupWithVisualRig(setup);
  if (setupMeterValue) setupMeterValue.textContent = `${visualSetup.complete || 0}/${visualSetup.total || 0}`;
  if (setupMeterLabel) setupMeterLabel.textContent = visualSetup.ready ? "Ready" : "Setup";
  setupSteps.innerHTML = "";
  (visualSetup.steps || []).forEach((step) => {
    const item = document.createElement("span");
    item.dataset.done = step.done ? "true" : "false";
    item.textContent = step.label || step.id || "Step";
    item.title = step.detail || "";
    setupSteps.append(item);
  });
  renderSetupDiagnostics(visualSetup, health);
}

function renderSetupDiagnostics(setup, health = lastHealth) {
  if (!setupDiagnostics) return;
  setupDiagnostics.innerHTML = "";
  const missing = (setup.steps || []).filter((step) => !step.done);
  const lines = [];
  if (!missing.length) {
    lines.push({ label: "Ready", detail: "Synra is fully connected and ready for Hub AI, voice, vision, and workflows.", status: "online" });
  } else {
    missing.slice(0, 3).forEach((step) => {
      const action =
        step.id === "hub_url"
          ? "Save your NodeSparkHub URL."
          : step.id === "pairing"
            ? "Generate a pair code in NodeSparkHub and enter it here."
            : step.id === "local_ai"
              ? "Start Ollama or pull the configured text model."
            : step.id === "vision"
              ? "Pull the configured vision model and enable the kiosk camera."
              : step.id === "voice"
                ? "Install Kokoro or configure ElevenLabs for natural speech."
                : step.id === "live2d_model"
                  ? "Export Synra from Cubism to web/assets/live2d/synra/synra.model3.json."
                  : "Refresh workflows from NodeSparkHub.";
      lines.push({ label: step.label || step.id, detail: action, status: "todo" });
    });
  }
  if (health?.hubLastError) {
    lines.push({ label: "Hub detail", detail: health.hubLastError, status: "warning" });
  }
  if (health?.memory?.assistantTurns) {
    lines.push({ label: "Memory", detail: `${health.memory.assistantTurns} assistant turns remembered locally.`, status: "online" });
  }
  lines.slice(0, 4).forEach((line) => {
    const item = document.createElement("span");
    item.dataset.status = line.status;
    item.textContent = `${line.label}: ${line.detail}`;
    setupDiagnostics.append(item);
  });
}

function refreshWorkflowOptions(workflows = []) {
  if (!workflowSelect) return;
  const current = workflowSelect.value;
  const names = [...new Set((workflows.length ? workflows : [lastHealth?.defaultWorkflow || "Synra Assistant"]).filter(Boolean))];
  workflowSelect.innerHTML = "";
  names.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    workflowSelect.append(option);
  });
  if (names.includes(current)) workflowSelect.value = current;
}

async function fetchWorkflows() {
  try {
    const response = await fetch("/api/workflows", { cache: "no-store" });
    const data = await response.json();
    if (data.ok) refreshWorkflowOptions(data.workflows || []);
  } catch {
    refreshWorkflowOptions(lastHealth?.favoriteWorkflows || []);
  }
}

function renderState(state) {
  lastServerState = state;
  lastStateMode = state.mode || "idle";
  const visualState = visualStateFor(state);
  applyVisualState(visualState);

  const card = state.card || {};
  const signature = JSON.stringify({
    mode: state.mode || "idle",
    expression: state.expression || "soft_smile",
    message: state.message || "",
    subtitle: state.subtitle || "",
    card
  });
  if (signature !== lastRenderedStateSignature) {
    lastRenderedStateSignature = signature;
    stateLabel.textContent = state.mode || "idle";
    messageText.textContent = state.message || "NodeSparkHub is waiting for a workflow.";
    subtitleText.textContent = state.subtitle || "Ready";
    cardStyle.textContent = card.style || "info";
    cardTitle.textContent = card.title || "NodeSparkHub";
    cardBody.textContent = card.body || "Synra is ready.";
    cardDetail.textContent = card.detail || "Waiting for your next command.";
    const progress = typeof card.progress === "number" ? Math.max(0, Math.min(1, card.progress)) : null;
    progressBar.style.width = progress === null ? "36%" : `${Math.round(progress * 100)}%`;
    renderEmotionBadge(state, card);
    pushActivity(state, card);
  }

  [...modeStrip.children].forEach((item) => {
    const active = item.textContent === visualState.mode;
    item.style.borderColor = active ? "rgba(76, 201, 255, 0.9)" : "";
    item.style.background = active ? "rgba(76, 201, 255, 0.16)" : "";
  });

  maybeSpeak(state);
}

function renderEmotionBadge(state, card = {}) {
  if (!emotionBadge) return;
  const expression = state.expression || "soft_smile";
  const mode = state.mode || "idle";
  const source = card.detail || state.subtitle || "local monitor";
  emotionBadge.textContent = `${mode} / ${expression}`;
  emotionBadge.title = source;
  emotionBadge.dataset.mode = mode;
}

function pushActivity(state, card = {}) {
  if (!activityFeed) return;
  const label = state.subtitle || card.title || state.mode || "Synra";
  const body = state.message || card.body || "";
  const style = card.style || state.mode || "info";
  const item = {
    at: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    label,
    body,
    style
  };
  const currentKey = `${label}:${body}:${style}`;
  const lastKey = activityItems[0] ? `${activityItems[0].label}:${activityItems[0].body}:${activityItems[0].style}` : "";
  if (currentKey !== lastKey) activityItems.unshift(item);
  activityItems = activityItems.slice(0, 5);
  activityFeed.innerHTML = "";
  activityItems.forEach((entry) => {
    const row = document.createElement("span");
    row.dataset.status = entry.style;
    row.innerHTML = `<strong>${escapeHtml(entry.at)} ${escapeHtml(entry.label)}</strong><small>${escapeHtml(entry.body)}</small>`;
    activityFeed.append(row);
  });
}

function renderActivityFeed(items = []) {
  if (!activityFeed || !items.length) return;
  activityItems = items.slice(0, 5).map((item) => ({
    at: formatActivityTime(item.at),
    label: item.label || item.kind || "Synra",
    body: item.body || item.detail || "",
    style: item.style || "info"
  }));
  activityFeed.innerHTML = "";
  activityItems.forEach((entry) => {
    const row = document.createElement("span");
    row.dataset.status = entry.style;
    row.innerHTML = `<strong>${escapeHtml(entry.at)} ${escapeHtml(entry.label)}</strong><small>${escapeHtml(entry.body)}</small>`;
    activityFeed.append(row);
  });
}

function formatActivityTime(value) {
  const seconds = Number(value || 0);
  if (!seconds) return "now";
  return new Date(seconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function visualStateFor(state) {
  if (!speechVisualLock) return state;
  return {
    ...state,
    mode: "speaking",
    expression: state.expression || "bright"
  };
}

function applyVisualState(state) {
  stage.dataset.mode = state.mode || "idle";
  stage.dataset.expression = state.expression || "soft_smile";
  window.synraAvatar3D?.setState(state);
  window.synraLive2D?.setState(state);
  window.synraConcept2D?.setState(state);
}

function syncStageVisualDataset() {
  if (speechVisualLock || !lastServerState) return;
  const visualState = visualStateFor(lastServerState);
  stage.dataset.mode = visualState.mode || "idle";
  stage.dataset.expression = visualState.expression || "soft_smile";
}

async function maybeSpeak(state) {
  const speechText = (state.speech_text || "").trim();
  const speechId = state.speech_id || "";
  if (!speechText || !speechId || speechId === lastSpeechId) return;
  lastSpeechId = speechId;
  if (!speechOutputEnabled) return;
  window.speechSynthesis?.cancel?.();
  stopActiveSpeechAudio();
  if (await playServerTts(speechText, speechId, state)) return;
  if (!("speechSynthesis" in window)) return;
  speakWithBrowserVoice(speechText, speechId, state);
}

function beginSpeechVisuals(state) {
  speechVisualLock = true;
  if (speechReleaseTimer) window.clearTimeout(speechReleaseTimer);
  targetMotion.mouth = 1;
  applyVisualState({ ...(lastServerState || state), mode: "speaking", expression: state.expression || "bright" });
  window.synraAvatar3D?.setSpeaking(true);
  window.synraLive2D?.setSpeaking(true);
  window.synraConcept2D?.setSpeaking(true);
}

function endSpeechVisuals(speechId) {
  speechVisualLock = false;
  targetMotion.mouth = 0;
  window.synraAvatar3D?.setSpeaking(false);
  window.synraLive2D?.setSpeaking(false);
  window.synraConcept2D?.setSpeaking(false);
  if (speechMouthTimer) {
    window.clearInterval(speechMouthTimer);
    speechMouthTimer = null;
  }
  stopSpeechMouthMeter();
  const nextVisualState =
    lastServerState?.mode === "speaking"
      ? { ...lastServerState, mode: "idle", expression: "soft_smile" }
      : lastServerState || { mode: lastStateMode || "idle", expression: "soft_smile" };
  applyVisualState(nextVisualState);
  speechReleaseTimer = window.setTimeout(() => {
    if (lastServerState?.speech_id === speechId && lastServerState?.mode === "speaking") {
      setRemoteState({
        mode: "idle",
        expression: "soft_smile",
        subtitle: "Ready"
      });
    }
  }, 300);
}

async function playServerTts(text, speechId, state, options = {}) {
  if (currentVoicePreference().startsWith("voice:")) return false;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || serverTtsStartTimeoutMs;
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: currentVoicePreference(), cacheOnly: Boolean(options.cacheOnly) })
    });
    window.clearTimeout(timeout);
    if (!response.ok) return false;
    const blob = await response.blob();
    if (!blob.size) return false;
    if (options.canPlay && !options.canPlay()) return false;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    activeSpeechAudio = audio;
    audio.onplay = () => {
      beginSpeechVisuals(state);
      startSpeechMouthMeter(audio);
    };
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (activeSpeechAudio === audio) activeSpeechAudio = null;
      endSpeechVisuals(speechId);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      if (activeSpeechAudio === audio) activeSpeechAudio = null;
      endSpeechVisuals(speechId);
    };
    await audio.play();
    return true;
  } catch {
    window.clearTimeout(timeout);
    return false;
  }
}

function startQuickAcknowledgement(turnId, text) {
  if (!speechOutputEnabled) return;
  const phrase = quickAckTexts[Math.abs(hashText(text)) % quickAckTexts.length];
  const speechId = `ack-${turnId}-${Date.now()}`;
  const state = {
    mode: "speaking",
    expression: "attentive",
    speech_id: speechId
  };
  playServerTts(phrase, speechId, state, {
    cacheOnly: true,
    timeoutMs: quickAckTtsTimeoutMs,
    canPlay: () => turnId === activeAssistantTurn && !activeSpeechAudio && !window.speechSynthesis?.speaking
  }).then((played) => {
    if (played || ttsStatus.available || turnId !== activeAssistantTurn || activeSpeechAudio || window.speechSynthesis?.speaking) return;
    speakWithBrowserVoice(phrase, speechId, state);
  });
}

function hashText(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return hash;
}

async function testSelectedVoice() {
  if (voiceTestButton) voiceTestButton.disabled = true;
  const text = "Hi, I'm Synra. This is how this voice sounds.";
  const state = {
    mode: "speaking",
    expression: "bright",
    speech_id: `voice-test-${Date.now()}`
  };
  try {
    stopActiveSpeechAudio();
    window.speechSynthesis?.cancel?.();
    primeSelectedVoice();
    const usedServer = await playServerTts(text, state.speech_id, state);
    if (!usedServer) speakWithBrowserVoice(text, state.speech_id, state);
  } finally {
    window.setTimeout(() => {
      if (voiceTestButton) voiceTestButton.disabled = false;
    }, 600);
  }
}

function stopActiveSpeechAudio() {
  if (activeSpeechAudio) {
    activeSpeechAudio.pause();
    activeSpeechAudio.currentTime = 0;
    activeSpeechAudio = null;
  }
  if (speechMouthTimer) {
    window.clearInterval(speechMouthTimer);
    speechMouthTimer = null;
  }
  stopSpeechMouthMeter();
  window.synraConcept2D?.setSpeaking(false);
}

function stopSpeechMouthMeter() {
  if (speechMouthTimer) {
    window.clearInterval(speechMouthTimer);
    speechMouthTimer = null;
  }
  try {
    speechMeterSource?.disconnect?.();
  } catch {
    // Already disconnected.
  }
  speechMeterSource = null;
  speechAnalyser = null;
  speechAnalyserData = null;
}

function startSpeechMouthMeter(audio) {
  stopSpeechMouthMeter();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    speechMouthTimer = window.setInterval(() => {
      targetMotion.mouth = 0.42 + Math.random() * 0.48;
    }, 64);
    return;
  }
  try {
    speechAudioContext ||= new AudioCtx();
    speechAudioContext.resume?.();
    speechAnalyser = speechAudioContext.createAnalyser();
    speechAnalyser.fftSize = 512;
    speechAnalyser.smoothingTimeConstant = 0.42;
    speechAnalyserData = new Uint8Array(speechAnalyser.fftSize);
    speechMeterSource = speechAudioContext.createMediaElementSource(audio);
    speechMeterSource.connect(speechAnalyser);
    speechAnalyser.connect(speechAudioContext.destination);
    speechMouthTimer = window.setInterval(() => {
      speechAnalyser.getByteTimeDomainData(speechAnalyserData);
      let sum = 0;
      for (let index = 0; index < speechAnalyserData.length; index += 1) {
        const normalized = (speechAnalyserData[index] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / speechAnalyserData.length);
      const shaped = clamp((rms - 0.018) * 8.5, 0.08, 1);
      targetMotion.mouth = targetMotion.mouth * 0.28 + shaped * 0.72;
      window.synraAvatar3D?.setSpeaking(true);
      window.synraLive2D?.setSpeaking(true);
      window.synraConcept2D?.setSpeaking(true);
    }, 32);
  } catch {
    speechMouthTimer = window.setInterval(() => {
      targetMotion.mouth = 0.42 + Math.random() * 0.48;
    }, 64);
  }
}

function speakWithBrowserVoice(speechText, speechId, state) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(speechText);
  applyVoicePreference(utterance);
  utterance.onstart = () => beginSpeechVisuals(state);
  utterance.onboundary = () => {
    targetMotion.mouth = 0.64 + Math.random() * 0.36;
    window.synraAvatar3D?.setSpeaking(true);
    window.synraLive2D?.setSpeaking(true);
    window.synraConcept2D?.setSpeaking(true);
  };
  utterance.onend = () => endSpeechVisuals(speechId);
  utterance.onerror = utterance.onend;
  window.speechSynthesis.speak(utterance);
}

async function sendDemo(mode) {
  const demo = demoStates[mode] || { mode, expression: "bright", title: "Synra Control", style: mode };
  const payload = {
    mode: demo.mode,
    expression: demo.expression,
    message: demoText[mode] || "Synra is ready.",
    subtitle: "Manual control",
    card: {
      title: demo.title,
      body: demoText[mode] || "State changed.",
      detail: "Synra monitor control",
      style: demo.style,
      progress: demo.progress ?? null
    }
  };
  await setRemoteState(payload);
}

async function setRemoteState(payload) {
  try {
    const response = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`State update failed: ${response.status}`);
    await fetchState();
    return true;
  } catch (error) {
    console.warn(error);
    renderState({
      mode: "error",
      expression: "concerned",
      message: "Synra cannot reach her local service.",
      subtitle: "Local API offline",
      card: {
        title: "Local API Offline",
        body: "Check the nodespark-synra service.",
        detail: "The monitor UI is still running.",
        style: "error"
      }
    });
    return false;
  }
}

async function askAssistant(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    await setRemoteState({
      mode: "warning",
      expression: "concerned",
      message: "I did not catch that.",
      subtitle: "Try again",
      card: {
        title: "No Voice Input",
        body: "Synra did not receive a transcript.",
        detail: "Microphone input ended without speech.",
        style: "warning"
      }
    });
    return;
  }

  const turnId = activeAssistantTurn + 1;
  activeAssistantTurn = turnId;
  await setRemoteState({
    mode: "thinking",
    expression: "focused",
    message: `Thinking about: ${trimmed}`,
    subtitle: "NodeSparkHub Assistant",
    card: {
      title: "Voice Request",
      body: trimmed,
      detail: "Sending to NodeSparkHub",
      style: "thinking"
    }
  });
  startQuickAcknowledgement(turnId, trimmed);

  try {
    const image = shouldAttachVision(trimmed) ? captureCameraFrame() : "";
    const data = await postJson("/api/command", {
      id: `voice-${Date.now()}`,
      type: "assistant",
      text: trimmed,
      ...(image ? { image } : {})
    });
    if (data.state) renderState(data.state);
    else await fetchState();
    await fetchHealth();
  } catch (error) {
    await showPanelError(
      "Assistant Error",
      "I could not complete that request.",
      String(error.message || error)
    );
    await fetchHealth();
  }
}

function shouldAttachVision(text) {
  return Boolean(
    cameraStream &&
      presenceVideo?.videoWidth &&
      /what do you see|can you see|look at|look around|use the camera|describe the room|see me|see anything/i.test(text)
  );
}

function captureCameraFrame() {
  if (!presenceVideo || !presenceVideo.videoWidth || !presenceVideo.videoHeight) return "";
  const canvas = document.createElement("canvas");
  const width = 512;
  const height = Math.max(1, Math.round((presenceVideo.videoHeight / presenceVideo.videoWidth) * width));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(presenceVideo, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

async function askWithVision() {
  if (!cameraStream) {
    await activateCameraAndMic();
  }
  const image = captureCameraFrame();
  if (!image) {
    await setRemoteState({
      mode: "warning",
      expression: "raised_brow",
      message: "I need the camera active before I can look.",
      subtitle: "Camera vision",
      card: {
        title: "Camera Vision",
        body: "Tap Cam from the kiosk, then ask me to look again.",
        detail: "Browser camera permission controls this.",
        style: "warning"
      }
    });
    return;
  }
  const prompt = (commandInput?.value || "").trim() || "What do you see?";
  await setRemoteState({
    mode: "thinking",
    expression: "look_left",
    message: "Looking through the camera.",
    subtitle: "Camera vision",
    card: {
      title: "Camera Vision",
      body: prompt,
      detail: "Sending a frame to Synra's vision model",
      style: "thinking"
    }
  });
  try {
    const data = await postJson("/api/vision", {
      id: `vision-${Date.now()}`,
      text: prompt,
      image
    });
    if (data.state) renderState(data.state);
    else await fetchState();
    await fetchHealth();
  } catch (error) {
    await showPanelError(
      "Vision Error",
      "I could not read the camera frame.",
      String(error.message || error)
    );
    await fetchHealth();
  }
}

async function submitTypedCommand(event) {
  event.preventDefault();
  if (commandSubmitting) return;
  const text = (commandInput?.value || "").trim();
  if (!text) {
    commandInput?.focus();
    return;
  }
  commandSubmitting = true;
  if (commandInput) commandInput.disabled = true;
  if (commandSubmit) commandSubmit.disabled = true;
  try {
    await askAssistant(text);
    if (commandInput) commandInput.value = "";
  } finally {
    commandSubmitting = false;
    if (commandInput) commandInput.disabled = false;
    if (commandSubmit) commandSubmit.disabled = false;
    commandInput?.focus();
  }
}

async function connectHub(event) {
  event.preventDefault();
  const baseUrl = (hubUrlInput?.value || "").trim();
  if (!baseUrl) {
    hubUrlInput?.focus();
    return;
  }
  if (hubConnectButton) hubConnectButton.disabled = true;
  if (hubDetail) hubDetail.textContent = "Connecting...";
  try {
    const response = await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Connection failed");
    renderHealth(data.health);
    pushActivity(
      { mode: "success", expression: "attentive", subtitle: "Hub URL", message: "NodeSparkHub URL saved." },
      { title: "Hub URL", style: "success" }
    );
    await fetchWorkflows();
    await fetchState();
  } catch (error) {
    if (hubDetail) hubDetail.textContent = String(error.message || error);
  } finally {
    if (hubConnectButton) hubConnectButton.disabled = false;
  }
}

async function pairHub(event) {
  event.preventDefault();
  const code = (pairCodeInput?.value || "").trim();
  if (!code) {
    pairCodeInput?.focus();
    return;
  }
  if (hubPairButton) hubPairButton.disabled = true;
  if (hubDetail) hubDetail.textContent = "Pairing...";
  try {
    const response = await fetch("/api/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Pairing failed");
    if (pairCodeInput) pairCodeInput.value = "";
    pushActivity(
      { mode: "success", expression: "bright", subtitle: "Pairing", message: "Synra linked to NodeSparkHub." },
      { title: "Pairing", style: "success" }
    );
    await fetchHealth();
    await fetchWorkflows();
    await fetchState();
  } catch (error) {
    if (hubDetail) hubDetail.textContent = String(error.message || error);
  } finally {
    if (hubPairButton) hubPairButton.disabled = false;
  }
}

async function checkHubConnection() {
  if (hubCheckButton) hubCheckButton.disabled = true;
  if (hubDetail) hubDetail.textContent = "Checking NodeSparkHub...";
  try {
    const data = await postJson("/api/hub/check", {});
    const diagnostics = data.diagnostics || {};
    if (diagnostics.snapshot) renderHealth(diagnostics.snapshot);
    await setRemoteState({
      mode: diagnostics.reachable ? "success" : "warning",
      expression: diagnostics.reachable ? "bright" : "concerned",
      message: diagnostics.reachable ? "NodeSparkHub answered the check." : "I saved the Hub URL, but the health check did not answer.",
      subtitle: "Hub check",
      card: {
        title: diagnostics.reachable ? "Hub Reachable" : "Hub Check",
        body: diagnostics.url || "NodeSparkHub",
        detail: diagnostics.detail || "Check complete",
        style: diagnostics.reachable ? "success" : "warning"
      }
    });
  } catch (error) {
    await showPanelError("Hub Check Error", "I could not complete the Hub check.", String(error.message || error));
  } finally {
    if (hubCheckButton) hubCheckButton.disabled = false;
  }
}

function openHub() {
  const url = (lastHealth?.hubUrl || hubUrlInput?.value || "").trim();
  if (!url) {
    hubUrlInput?.focus();
    return;
  }
  window.open(url, "_blank", "noopener");
}

async function copyPairingId() {
  const pairing = lastHealth?.pairing || {};
  const text = pairing.pairingUri || pairing.deviceId || lastHealth?.deviceId || "";
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    if (pairingUriText) pairingUriText.textContent = "Pairing identity copied.";
  } catch {
    if (pairingUriText) pairingUriText.textContent = text;
  }
}

async function saveMemory(event) {
  event.preventDefault();
  if (memorySaveButton) memorySaveButton.disabled = true;
  try {
    const preferredName = (memoryNameInput?.value || "").trim();
    const profileNote = (memoryNoteInput?.value || "").trim();
    await updateMemory({ preferredName, profileNote });
    pushActivity(
      { mode: "success", expression: "bright", subtitle: "Memory", message: "Synra saved that locally." },
      { title: "Memory", style: "success" }
    );
    await setRemoteState({
      mode: "success",
      expression: "bright",
      message: preferredName ? `I’ll remember you as ${preferredName}.` : "I updated my local memory.",
      subtitle: "Memory saved",
      card: {
        title: "Synra Memory",
        body: profileNote || "Local memory updated.",
        detail: "Stored on this Synra device",
        style: "success"
      }
    });
  } catch (error) {
    await showPanelError("Memory Error", "I could not save that memory.", String(error.message || error));
  } finally {
    if (memorySaveButton) memorySaveButton.disabled = false;
  }
}

async function clearMemory() {
  if (memoryClearButton) memoryClearButton.disabled = true;
  try {
    await updateMemory({ clear: true });
    renderMemory({});
    await setRemoteState({
      mode: "success",
      expression: "soft_smile",
      message: "I cleared my local memory for this monitor.",
      subtitle: "Memory cleared",
      card: {
        title: "Synra Memory",
        body: "Local memory cleared.",
        detail: "Future conversations start fresh.",
        style: "success"
      }
    });
  } catch (error) {
    await showPanelError("Memory Error", "I could not clear local memory.", String(error.message || error));
  } finally {
    if (memoryClearButton) memoryClearButton.disabled = false;
  }
}

async function runSelectedWorkflow() {
  const workflowName = workflowSelect?.value || lastHealth?.defaultWorkflow || "Synra Assistant";
  if (!workflowName) return;
  if (runWorkflowButton) runWorkflowButton.disabled = true;
  try {
    const data = await postJson("/api/command", {
      id: `workflow-${Date.now()}`,
      type: "runWorkflow",
      workflowName,
      text: `Running ${workflowName}.`
    });
    if (data.state) renderState(data.state);
    else await fetchState();
    await fetchHealth();
  } catch (error) {
    await showPanelError(
      "Workflow Error",
      `I could not run ${workflowName}.`,
      String(error.message || error)
    );
    await fetchHealth();
  } finally {
    if (runWorkflowButton) runWorkflowButton.disabled = false;
  }
}

async function runNextStagedWorkflow() {
  const id = runStagedButton?.dataset.workflowId || "";
  if (!id) return;
  if (runStagedButton) runStagedButton.disabled = true;
  try {
    const data = await postJson("/api/staged-workflows/run", { id });
    if (data.result?.state) renderState(data.result.state);
    if (data.health) renderHealth(data.health);
    else await fetchHealth();
    await fetchWorkflows();
  } catch (error) {
    await showPanelError(
      "Staged Workflow",
      "I could not run the staged workflow yet.",
      String(error.message || error)
    );
    await fetchHealth();
  } finally {
    renderStagedQueue(lastHealth);
  }
}

async function clearStagedWorkflows() {
  if (clearStagedButton) clearStagedButton.disabled = true;
  try {
    const data = await postJson("/api/staged-workflows/clear", {});
    if (data.state) renderState(data.state);
    if (data.health) renderHealth(data.health);
    else await fetchHealth();
  } catch (error) {
    await showPanelError(
      "Workflow Queue",
      "I could not clear the staged workflow queue.",
      String(error.message || error)
    );
    await fetchHealth();
  } finally {
    renderStagedQueue(lastHealth);
  }
}

function speechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setCssNumber(name, value, unit = "") {
  const next = `${value.toFixed(3)}${unit}`;
  if (cssNumberCache.get(name) === next) return;
  cssNumberCache.set(name, next);
  stage.style.setProperty(name, next);
}

function scheduleBlink(now) {
  if (now < nextBlink) return;
  blinkUntil = now + 130;
  nextBlink = now + 2200 + Math.random() * 3600;
}

function updateMotion() {
  const now = performance.now();
  scheduleBlink(now);

  const listeningBoost = isListening ? 1 : 0;
  const speakingBoost = stage.dataset.mode === "speaking" ? 1 : 0;
  const thinkingBoost = stage.dataset.mode === "thinking" || stage.dataset.mode === "workflow_running" ? 1 : 0;

  targetMotion.x *= 0.9;
  targetMotion.y *= 0.9;
  targetMotion.rotate *= 0.9;
  targetMotion.scale = 1 + listeningBoost * 0.006 + thinkingBoost * 0.004 + audioLevel * 0.012;
  if (!speakingBoost && !isListening) targetMotion.mouth *= 0.9;

  currentMotion.x += (targetMotion.x - currentMotion.x) * 0.08;
  currentMotion.y += (targetMotion.y - currentMotion.y) * 0.08;
  currentMotion.rotate += (targetMotion.rotate - currentMotion.rotate) * 0.08;
  currentMotion.scale += (targetMotion.scale - currentMotion.scale) * 0.08;
  currentMotion.mouth += (targetMotion.mouth - currentMotion.mouth) * 0.16;

  const talking = Math.max(currentMotion.mouth, audioLevel);
  const mouthWave = talking ? (0.35 + Math.abs(Math.sin(now / 92)) * 0.65) * talking : 0;
  const blink = now < blinkUntil ? 1 : 0;

  setCssNumber("--rig-x", 0, "px");
  setCssNumber("--rig-y", 0, "px");
  setCssNumber("--rig-rotate", 0, "deg");
  setCssNumber("--rig-scale", currentMotion.scale);
  setCssNumber("--depth-x", 0, "px");
  setCssNumber("--depth-y", 0, "px");
  setCssNumber("--light-sweep", 42, "%");
  setCssNumber("--mouth-open", clamp(mouthWave, 0, 1));
  setCssNumber("--blink", blink);
  window.synraAvatar3D?.update({
    x: currentMotion.x,
    y: currentMotion.y,
    rotate: currentMotion.rotate,
    scale: currentMotion.scale,
    mouth: clamp(mouthWave, 0, 1)
  });
  window.synraLive2D?.update?.({
    x: currentMotion.x,
    y: currentMotion.y,
    rotate: currentMotion.rotate,
    scale: currentMotion.scale,
    mouth: clamp(mouthWave, 0, 1)
  });
  window.synraConcept2D?.update?.({
    x: currentMotion.x,
    y: currentMotion.y,
    rotate: currentMotion.rotate,
    scale: currentMotion.scale,
    mouth: clamp(mouthWave, 0, 1)
  });
  syncStageVisualDataset();

  requestAnimationFrame(updateMotion);
}

function handlePointerMove(event) {
  const rect = stage.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
  const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  targetMotion.x = clamp(x * 12, -18, 18);
  targetMotion.y = clamp(y * 9, -14, 14);
  targetMotion.rotate = clamp(x * 1.1, -1.6, 1.6);
}

async function enumerateDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    micStatus.textContent = "Mic unavailable";
    cameraStatus.textContent = "Cam unavailable";
    return;
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const mics = devices.filter((device) => device.kind === "audioinput");
  const cameras = devices.filter((device) => device.kind === "videoinput");
  const mic = mics[0];
  const camera = cameras[0];
  micStatus.textContent = mic ? `Mic ${mic.label || "detected"}` : "Mic not found";
  cameraStatus.textContent = camera ? `Cam ${camera.label || "detected"}` : "Cam not found";
  return { mics, cameras };
}

function preferredDevice(devices, patterns) {
  return devices.find((device) => patterns.some((pattern) => pattern.test(device.label || ""))) || devices[0] || null;
}

function watchAudioLevel(stream) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const samples = new Uint8Array(analyser.frequencyBinCount);

  function sampleAudio() {
    analyser.getByteFrequencyData(samples);
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    audioLevel = clamp((average - 8) / 72, 0, 1);
    if (cameraStream) requestAnimationFrame(sampleAudio);
  }
  sampleAudio();
}

async function activateCameraAndMic() {
  if (mediaActivationStarted) return;
  mediaActivationStarted = true;
  if (!hasLocalMediaOrigin()) {
    voiceNote.textContent = "Mic/cam require kiosk or HTTPS";
    micStatus.textContent = "Use kiosk mic";
    cameraStatus.textContent = "Use kiosk cam";
    mediaActivationStarted = false;
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    voiceNote.textContent = "Media devices unavailable";
    mediaActivationStarted = false;
    return;
  }
  try {
    let devices = await enumerateDevices();
    let preferredMic = preferredDevice(devices?.mics || [], [/emeet/i, /piko/i, /usb/i, /external/i]);
    let preferredCamera = preferredDevice(devices?.cameras || [], [/emeet/i, /piko/i, /usb/i, /external/i]);
    const firstStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(preferredMic?.deviceId ? { deviceId: { ideal: preferredMic.deviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: {
        ...(preferredCamera?.deviceId ? { deviceId: { ideal: preferredCamera.deviceId } } : {}),
        width: { ideal: 640 },
        height: { ideal: 360 },
        facingMode: "user"
      }
    });
    cameraStream = firstStream;
    devices = await enumerateDevices();
    preferredMic = preferredDevice(devices?.mics || [], [/emeet/i, /piko/i, /usb/i, /external/i]);
    preferredCamera = preferredDevice(devices?.cameras || [], [/emeet/i, /piko/i, /usb/i, /external/i]);
    const activeAudio = cameraStream.getAudioTracks()[0]?.label || "";
    const activeVideo = cameraStream.getVideoTracks()[0]?.label || "";
    const shouldRestartForPreferred =
      (preferredMic?.label && activeAudio && preferredMic.label !== activeAudio) ||
      (preferredCamera?.label && activeVideo && preferredCamera.label !== activeVideo);
    if (shouldRestartForPreferred) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(preferredMic?.deviceId ? { deviceId: { exact: preferredMic.deviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: {
          ...(preferredCamera?.deviceId ? { deviceId: { exact: preferredCamera.deviceId } } : {}),
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 30 }
        }
      });
    }
    watchAudioLevel(cameraStream);
    if (presenceVideo) {
      presenceVideo.srcObject = cameraStream;
      await presenceVideo.play().catch(() => {});
      watchPresence();
    }
    voiceNote.textContent = "Webcam mic active";
    stage.dataset.presence = "awake";
    if (preferredMic || preferredCamera) {
      micStatus.textContent = preferredMic ? `Mic ${preferredMic.label || "active"}` : micStatus.textContent;
      cameraStatus.textContent = preferredCamera ? `Cam ${preferredCamera.label || "active"}` : cameraStatus.textContent;
    }
    stage.dataset.expression = "bright";
  } catch (error) {
    voiceNote.textContent = `Cam/mic error: ${error.name || "blocked"}`;
    mediaActivationStarted = false;
  }
}

async function watchPresence() {
  if (!presenceVideo || !cameraStream) return;
  if (!faceDetector && "FaceDetector" in window) {
    try {
      faceDetector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    } catch {
      faceDetector = null;
    }
  }

  if (faceDetector && presenceVideo.readyState >= 2) {
    try {
      const faces = await faceDetector.detect(presenceVideo);
      const face = faces[0]?.boundingBox;
      if (face && presenceVideo.videoWidth && presenceVideo.videoHeight) {
        const centerX = (face.x + face.width / 2) / presenceVideo.videoWidth - 0.5;
        const centerY = (face.y + face.height / 2) / presenceVideo.videoHeight - 0.5;
        targetMotion.x = clamp(centerX * -18, -16, 16);
        targetMotion.y = clamp(centerY * -12, -12, 12);
        targetMotion.rotate = clamp(centerX * -1.4, -1.4, 1.4);
      }
    } catch {
      faceDetector = null;
    }
  }

  requestAnimationFrame(watchPresence);
}

async function startVoiceLoop() {
  if (isListening) return;
  if (!hasLocalMediaOrigin()) {
    voiceNote.textContent = "Voice input requires kiosk or HTTPS";
    await setRemoteState({
      mode: "idle",
      expression: "soft_smile",
      message: "Voice input is available on the Synra kiosk.",
      subtitle: "Remote browser view",
      card: {
        title: "Browser Permission",
        body: "Open Synra on the Jetson monitor or serve the page through HTTPS.",
        detail: "Chrome blocks microphone access from this remote HTTP page.",
        style: "info"
      }
    });
    return;
  }
  const Recognition = speechRecognitionConstructor();
  if (!Recognition) {
    voiceNote.textContent = "Type your request below";
    await setRemoteState({
      mode: "idle",
      expression: "attentive",
      message: "Speech recognition is not available in this browser.",
      subtitle: "Typed input ready",
      card: {
        title: "Typed Input",
        body: "Use the Ask Synra box for this session.",
        detail: "The kiosk voice loop is still available when Chromium exposes speech recognition.",
        style: "info"
      }
    });
    commandInput?.focus();
    return;
  }

  isListening = true;
  listenButton.classList.add("active");
  listenButton.textContent = "Listening";
  voiceNote.textContent = "Microphone active";
  targetMotion.mouth = 0.24;

  recognition = new Recognition();
  recognition.lang = navigator.language || "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finalTranscript = "";
  let latestTranscript = "";
  let hadError = false;

  await setRemoteState({
    mode: "listening",
    expression: "attentive",
    message: "I’m listening.",
    subtitle: "Microphone active",
    card: {
      title: "Voice Input",
      body: "Listening for your request...",
      detail: "Speak naturally to NodeSpark Synra",
      style: "listening"
    }
  });

  recognition.onresult = (event) => {
    latestTranscript = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript;
      latestTranscript += transcript;
      if (event.results[index].isFinal) finalTranscript += transcript;
    }
    const preview = (finalTranscript || latestTranscript).trim();
    if (preview) {
      setRemoteState({
        mode: "listening",
        expression: "attentive",
        message: preview,
        subtitle: "Listening...",
        card: {
          title: "Voice Input",
          body: preview,
          detail: "Capturing speech",
          style: "listening"
        }
      });
    }
  };

  recognition.onerror = (event) => {
    hadError = true;
    isListening = false;
    listenButton.classList.remove("active");
    listenButton.textContent = "Talk";
    voiceNote.textContent = `Mic error: ${event.error || "unknown"}`;
    targetMotion.mouth = 0;
    setRemoteState({
      mode: "error",
      expression: "concerned",
      message: `Microphone error: ${event.error || "unknown"}`,
      subtitle: "Voice input",
      card: {
        title: "Voice Input Error",
        body: event.error || "The browser could not capture speech.",
        detail: "Check Chromium microphone permission",
        style: "error"
      }
    });
  };

  recognition.onend = () => {
    if (hadError) return;
    const transcript = (finalTranscript || latestTranscript).trim();
    isListening = false;
    listenButton.classList.remove("active");
    listenButton.textContent = "Talk";
    voiceNote.textContent = "Voice loop ready";
    targetMotion.mouth = 0;
    askAssistant(transcript);
  };

  try {
    recognition.start();
  } catch (error) {
    isListening = false;
    listenButton.classList.remove("active");
    listenButton.textContent = "Talk";
    voiceNote.textContent = "Voice loop ready";
    targetMotion.mouth = 0;
    await showPanelError(
      "Voice Input Error",
      "I could not start the microphone listener.",
      String(error.message || error)
    );
  }
}

document.querySelectorAll("[data-demo]").forEach((button) => {
  button.addEventListener("click", () => sendDemo(button.dataset.demo));
});

listenButton.addEventListener("click", startVoiceLoop);
cameraButton.addEventListener("click", activateCameraAndMic);
visionButton?.addEventListener("click", askWithVision);
commandForm?.addEventListener("submit", submitTypedCommand);
hubConnectForm?.addEventListener("submit", connectHub);
hubPairForm?.addEventListener("submit", pairHub);
hubOpenButton?.addEventListener("click", openHub);
hubCheckButton?.addEventListener("click", checkHubConnection);
pairingCopyButton?.addEventListener("click", copyPairingId);
memoryForm?.addEventListener("submit", saveMemory);
memoryClearButton?.addEventListener("click", clearMemory);
runWorkflowButton?.addEventListener("click", runSelectedWorkflow);
runStagedButton?.addEventListener("click", runNextStagedWorkflow);
clearStagedButton?.addEventListener("click", clearStagedWorkflows);
backgroundSelect?.addEventListener("change", () => applyBackground(backgroundSelect.value));
voiceSelect?.addEventListener("change", () => {
  applyVoice(voiceSelect.value);
  renderTtsStatus();
  primeSelectedVoice();
});
voiceTestButton?.addEventListener("click", testSelectedVoice);
personalitySelect?.addEventListener("change", () => applyPersonality(personalitySelect.value));
motionSelect?.addEventListener("change", () => applyMotion(motionSelect.value));
window.speechSynthesis?.addEventListener?.("voiceschanged", populateVoiceSelect);
window.addEventListener("pointermove", handlePointerMove, { passive: true });
navigator.mediaDevices?.addEventListener?.("devicechange", enumerateDevices);

speechOutputEnabled = shouldEnableSpeechOutput();
if (!speechOutputEnabled && voiceNote) voiceNote.textContent = "Voice muted for this view";
applyBackground(storageGet(storageKeys.background, "grid"), { persist: false });
applyPersonality(storageGet(storageKeys.personality, "balanced"), { persist: false });
applyMotion(storageGet(storageKeys.motion, "normal"), { persist: false });
populateVoiceSelect();
fetchSettings();
enumerateDevices();
updateMotion();
fetchState();
fetchHealth();
fetchWorkflows();
fetchTtsStatus();
fetchLive2DStatus();
setInterval(fetchState, 450);
setInterval(fetchHealth, 4000);
setInterval(fetchTtsStatus, 15000);
setInterval(fetchLive2DStatus, 10000);

const params = new URLSearchParams(window.location.search);
const shouldAutoWake =
  params.get("autoMedia") === "1" ||
  (window.location.hostname === "127.0.0.1" && /Linux/i.test(navigator.userAgent));

if (shouldAutoWake) {
  window.setTimeout(() => activateCameraAndMic(), 1200);
}
