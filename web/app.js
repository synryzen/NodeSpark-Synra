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
const voiceNote = document.getElementById("voiceNote");
const micStatus = document.getElementById("micStatus");
const cameraStatus = document.getElementById("cameraStatus");
const presenceVideo = document.getElementById("presenceVideo");
const commandForm = document.getElementById("commandForm");
const commandInput = document.getElementById("commandInput");
const commandSubmit = document.getElementById("commandSubmit");
const hubStatus = document.getElementById("hubStatus");

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
  look_down: "Looking down at the task details."
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
  look_down: { mode: "idle", expression: "look_down", title: "Focus Down", style: "info" }
};

function hasLocalMediaOrigin() {
  return window.isSecureContext || ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
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

function renderHealth(health) {
  if (!hubStatus) return;
  if (!health.hubConfigured) {
    hubStatus.textContent = "Local mode";
    hubStatus.dataset.status = "local";
    return;
  }
  if (health.hubCanTry === false) {
    hubStatus.textContent = "Hub offline";
    hubStatus.dataset.status = "offline";
    return;
  }
  hubStatus.textContent = "Hub linked";
  hubStatus.dataset.status = "online";
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
  }

  [...modeStrip.children].forEach((item) => {
    const active = item.textContent === visualState.mode;
    item.style.borderColor = active ? "rgba(76, 201, 255, 0.9)" : "";
    item.style.background = active ? "rgba(76, 201, 255, 0.16)" : "";
  });

  maybeSpeak(state);
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
}

function syncStageVisualDataset() {
  if (speechVisualLock || !lastServerState) return;
  const visualState = visualStateFor(lastServerState);
  stage.dataset.mode = visualState.mode || "idle";
  stage.dataset.expression = visualState.expression || "soft_smile";
}

function maybeSpeak(state) {
  const speechText = (state.speech_text || "").trim();
  const speechId = state.speech_id || "";
  if (!speechText || !speechId || speechId === lastSpeechId) return;
  lastSpeechId = speechId;
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(speechText);
  utterance.rate = 0.96;
  utterance.pitch = 1.08;
  utterance.volume = 1.0;
  utterance.onstart = () => {
    speechVisualLock = true;
    if (speechReleaseTimer) window.clearTimeout(speechReleaseTimer);
    targetMotion.mouth = 1;
    applyVisualState({ ...(lastServerState || state), mode: "speaking", expression: state.expression || "bright" });
    window.synraAvatar3D?.setSpeaking(true);
  };
  utterance.onboundary = () => {
    targetMotion.mouth = 0.64 + Math.random() * 0.36;
    window.synraAvatar3D?.setSpeaking(true);
  };
  utterance.onend = () => {
    speechVisualLock = false;
    targetMotion.mouth = 0;
    window.synraAvatar3D?.setSpeaking(false);
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
  };
  utterance.onerror = utterance.onend;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find((voice) => /female|samantha|zira|google us english/i.test(voice.name));
  if (preferred) utterance.voice = preferred;
  window.speechSynthesis.speak(utterance);
}

async function sendDemo(mode) {
  const demo = demoStates[mode] || { mode, expression: "bright", title: "Synra Demo", style: mode };
  const payload = {
    mode: demo.mode,
    expression: demo.expression,
    message: demoText[mode] || "Synra is ready.",
    subtitle: "Local demo",
    card: {
      title: demo.title,
      body: demoText[mode] || "State changed.",
      detail: "Local monitor command",
      style: demo.style,
      progress: demo.progress ?? null
    }
  };
  await setRemoteState(payload);
}

async function setRemoteState(payload) {
  await fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  fetchState();
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

  await fetch("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: `voice-${Date.now()}`,
      type: "assistant",
      text: trimmed
    })
  });
  fetchState();
  fetchHealth();
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

function speechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setCssNumber(name, value, unit = "") {
  stage.style.setProperty(name, `${value.toFixed(3)}${unit}`);
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

function startVoiceLoop() {
  if (isListening) return;
  if (!hasLocalMediaOrigin()) {
    voiceNote.textContent = "Voice input requires kiosk or HTTPS";
    setRemoteState({
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
    const fallback = window.prompt("Ask Synra");
    if (fallback) askAssistant(fallback);
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

  setRemoteState({
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

  recognition.start();
}

document.querySelectorAll("[data-demo]").forEach((button) => {
  button.addEventListener("click", () => sendDemo(button.dataset.demo));
});

listenButton.addEventListener("click", startVoiceLoop);
cameraButton.addEventListener("click", activateCameraAndMic);
commandForm?.addEventListener("submit", submitTypedCommand);
window.addEventListener("pointermove", handlePointerMove, { passive: true });
navigator.mediaDevices?.addEventListener?.("devicechange", enumerateDevices);

enumerateDevices();
updateMotion();
fetchState();
fetchHealth();
setInterval(fetchState, 650);
setInterval(fetchHealth, 4000);

const params = new URLSearchParams(window.location.search);
const shouldAutoWake =
  params.get("autoMedia") === "1" ||
  (window.location.hostname === "127.0.0.1" && /Linux/i.test(navigator.userAgent));

if (shouldAutoWake) {
  window.setTimeout(() => activateCameraAndMic(), 1200);
}
