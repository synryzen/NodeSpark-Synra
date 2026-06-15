#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];

function read(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) {
    checks.push({ id: `exists:${relativePath}`, pass: false, detail: file });
    return "";
  }
  checks.push({ id: `exists:${relativePath}`, pass: true, detail: file });
  return fs.readFileSync(file, "utf8");
}

function check(id, pass, detail) {
  checks.push({ id, pass: Boolean(pass), detail });
}

function requireText(id, text, needle) {
  check(id, text.includes(needle), text.includes(needle) ? needle : `Missing: ${needle}`);
}

const main = read("src/main.ts");
const modelClient = read("src/model-client.ts");
const server = read("scripts/synra_server.py");
const storage = read("src/storage.ts");

requireText("mic-session-owns-wake-restart", main, "micInteractionActive");
requireText("hold-to-talk-finalizes-state", main, "finalizeMicInteraction");
requireText("hold-to-talk-tracks-pressed-state", main, "holdToTalkPressed");
requireText("hold-to-talk-finishes-after-early-release", main, "if (!holdToTalkPressed)");
requireText("hold-to-talk-early-return-cleans-mic", main, "finalizeMicInteraction(true);");
requireText("hold-to-talk-calm-avatar-reset", main, "prepareAvatarForCalmListening");
requireText("state-loop-policy-disables-listening-vrma", main, "shouldUseAuthoredStateLoop");
requireText("wake-start-defers-during-mic", main, "if (micInteractionActive)");
requireText("server-wake-defers-during-mic", main, "micInteractionActive || activeRecognition");
requireText("jetson-prefers-server-transcription", main, "shouldPreferServerTranscription");
requireText("wake-loop-prefers-server-stt", main, "if (shouldPreferServerTranscription())");
requireText("wake-command-uses-server-capture", main, "Listening for your command.");
requireText("wake-command-allows-longer-phrase", main, "durationMs: 12000");
requireText("wake-browser-listen-accumulates-phrase", main, "wakeCommandTranscript");
requireText("wake-browser-listen-waits-for-pause", main, "window.setTimeout(commitWakeCommand, 1800)");
requireText("wake-word-fuzzy-aliases", main, "wakePhraseAliases");
requireText("wake-word-accepts-syna", main, "hello syna");
requireText("wake-word-accepts-sarah", main, "hello sarah");
requireText("wake-word-accepts-sandra", main, "hello sandra");
requireText("wake-word-accepts-center", main, "hello center");
requireText("wake-word-near-token-match", main, "isLikelyWakeToken");
requireText("tap-listen-prefers-server-stt", main, "await startServerTranscriptionListening();");
requireText("standalone-vision-route-captures-frame", main, "if (requestRoute.intent === \"vision\")");
requireText("standalone-vision-uses-user-question", main, "buildVisionPrompt(userQuestion)");
requireText("standalone-vision-intent-natural-phrases", modelClient, "what can you see");
requireText("standalone-vision-server-answers-exact-question", server, "Use the image to answer the user's exact question.");
requireText("kiosk-wake-defaults-local", main, "ensureKioskWakeWordDefault");
requireText("fresh-settings-wake-local", storage, 'wakeWordMode: "local"');
requireText("fresh-settings-always-listening", storage, "allowAlwaysListening: true");
requireText("mic-always-listening-visible-toggle", main, 'id="micAlwaysListeningInput"');
requireText("mic-always-listening-status", main, "Mic always listening");
requireText("preferred-microphone-saved", storage, "preferredMicrophoneId");
requireText("preferred-camera-saved", storage, "preferredCameraId");
requireText("settings-microphone-selector", main, 'id="microphoneDeviceInput"');
requireText("settings-camera-selector", main, 'id="cameraDeviceInput"');
requireText("settings-device-refresh-button", main, 'id="refreshMediaDevicesButton"');
requireText("voice-match-mode-type", main, "VoiceMatchMode");
requireText("voice-match-settings-control", main, 'id="voiceMatchModeInput"');
requireText("voice-match-sensitivity-control", main, 'id="voiceMatchSensitivityInput"');
requireText("voice-match-capture-button", main, 'id="captureUserVoiceButton"');
requireText("voice-match-samples-saved", main, "voicePrints");
requireText("voice-match-local-fingerprint", main, "createVoicePrintFromBlob");
requireText("voice-match-wake-verification", main, "verifyWakeSpeaker");
requireText("voice-match-unknown-voice-block", main, "Ignored unknown voice");
requireText("voice-match-needs-enrollment-status", main, "Voice Match needs enrollment");
requireText("voice-match-personal-greeting", main, "wakeGreetingText(matchedUser?.name");
requireText("selected-audio-constraints", main, "selectedAudioConstraints");
requireText("selected-video-constraints", main, "selectedVideoConstraints");
requireText("wake-recording-uses-selected-mic", main, "getUserMedia({ audio: selectedAudioConstraints()");
requireText("vision-uses-selected-camera", main, "getUserMedia({ audio: false, video: selectedVideoConstraints()");
requireText("wake-loop-reports-mic-errors", main, "Wake word mic error");
requireText("wake-loop-has-command-friendly-window", main, "durationMs: 5200");
requireText("wake-loop-lower-rms-for-room-phrase", main, "minRms: 0.002");
requireText("wake-loop-visible-mic-active-state", main, "Wake mic active");
requireText("wake-loop-visible-mic-armed-state", main, "Wake mic armed");
requireText("wake-loop-telemetry-mic-active", main, "wakeWordMicActive");
requireText("wake-loop-telemetry-last-heard", main, "wakeWordLastHeard");
requireText("wake-loop-spoken-listening-confirmation", main, "I am listening.");
requireText("home-assistant-policy-type", storage, "confirmationPolicy");
requireText("home-assistant-policy-visible-control", main, 'id="homeAssistantConfirmationPolicyInput"');
requireText("trusted-light-policy-helper", main, "shouldRunSmartHomeActionImmediately");
requireText("trusted-light-policy-bypasses-preconfirmation", main, "smartHomeLightCommand(action, entityId)");
requireText("trusted-light-policy-server-allow", server, "allowImmediate");
requireText("server-durable-settings-path", server, "SETTINGS_PATH");
requireText("server-durable-settings-save-route", server, "/api/settings/save");
requireText("server-durable-settings-public-payload", server, "\"savedSettings\"");
requireText("client-durable-settings-save", main, "saveDurableServerSettings");
requireText("client-durable-settings-hydrate", main, "applyDurableServerSettings");
requireText("client-awaits-durable-settings-before-boot", main, "await hydrateServerManagedSettings();");
requireText("client-starts-through-initializer", main, "void initializeSynraApp();");
requireText("client-reapplies-visual-after-hydrate", main, "applyHydratedVisualState");
requireText("client-loads-hydrated-avatar", main, "await loadAvatarById(resolveInitialAvatarId(), { persist: false })");
requireText("client-blank-elevenlabs-keeps-server-secret", main, "keepServerManagedSecret(elevenLabsApiKeyInput.value");
requireText("client-blank-homeassistant-keeps-server-secret", main, "keepServerManagedSecret(homeAssistantTokenInput.value");
requireText("client-visual-change-hard-saves", main, "saveVisualSettingsEverywhere");

const failures = checks.filter((check) => !check.pass);
console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  checks
}, null, 2));

if (failures.length > 0) process.exit(1);
