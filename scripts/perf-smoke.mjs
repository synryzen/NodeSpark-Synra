import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const required = [
  "public/avatars/synra.vrm",
  "public/avatars/synra-code1.vrm",
  "public/avatars/synra-battle.vrm",
  "public/backgrounds/synra-command-room.png",
  "public/backgrounds/synra-cyber-garden.png",
  "public/backgrounds/synra-neural-library.png",
  "public/backgrounds/synra-observatory.png",
  "public/backgrounds/synra-orbit-lounge.png",
  "public/backgrounds/synra-quantum-workshop.png",
  "public/icons/nodesparkhub-icon.png",
  "scripts/jetson-diagnostics.sh",
  "scripts/install-jetson.sh",
  "scripts/avatar-motion-smoke.mjs",
  "scripts/kiosk-performance-check.sh",
  "tools/SynraJetsonStation/package.json",
  "tools/SynraJetsonStation/scripts/start-electron-kiosk.sh",
  "tools/SynraJetsonStation/scripts/electron-gpu-check.sh",
  "tools/SynraJetsonStation/scripts/repair-electron-install.sh",
  "tools/SynraJetsonStation/src/kiosk-config.ts",
  "tools/SynraJetsonStation/tests/kiosk-config.test.mjs",
  "src/main.ts",
  "src/model-client.ts"
];

const missing = required.filter((file) => !existsSync(join(root, file)));
if (missing.length) {
  console.error("Missing required standalone files:");
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

const avatarMb = bytesToMb(statSync(join(root, "public/avatars/synra.vrm")).size);
const avatarCount = readdirSync(join(root, "public/avatars")).filter((file) => file.endsWith(".vrm")).length;
const backgroundCount = readdirSync(join(root, "public/backgrounds")).filter((file) => file.endsWith(".png")).length;
const avatarFiles = readdirSync(join(root, "public/avatars")).filter((file) => file.endsWith(".vrm"));
const motionCount = countFiles(join(root, "public/motions"), ".vrma");
const kioskScript = readFileSync(join(root, "scripts/start-jetson-kiosk.sh"), "utf8");
const installerScript = readFileSync(join(root, "scripts/install-jetson.sh"), "utf8");
const electronKioskScript = readFileSync(join(root, "tools/SynraJetsonStation/scripts/start-electron-kiosk.sh"), "utf8");
const electronKioskConfig = readFileSync(join(root, "tools/SynraJetsonStation/src/kiosk-config.ts"), "utf8");
const electronKioskTests = readFileSync(join(root, "tools/SynraJetsonStation/tests/kiosk-config.test.mjs"), "utf8");
const serverScript = readFileSync(join(root, "scripts/synra_server.py"), "utf8");
const mainScript = readFileSync(join(root, "src/main.ts"), "utf8");
const modelClientScript = readFileSync(join(root, "src/model-client.ts"), "utf8");
const hubRuntimeScript = readFileSync(join(root, "src/hub-runtime/drivers/avatar3d.ts"), "utf8");
const styles = readFileSync(join(root, "src/styles.css"), "utf8");
const kioskIsLean = kioskScript.includes("mode=kiosk") && kioskScript.includes("fps=${KIOSK_FPS}") && kioskScript.includes("--force-device-scale-factor=1");
const classicIsFirstAndDefaultAvatar =
  readFileSync(join(root, "src/avatar-catalog.ts"), "utf8").includes('id: "classic"') &&
  readFileSync(join(root, "src/avatar-catalog.ts"), "utf8").indexOf('id: "classic"') < readFileSync(join(root, "src/avatar-catalog.ts"), "utf8").indexOf('id: "code1"') &&
  readFileSync(join(root, "src/avatar-catalog.ts"), "utf8").includes('DEFAULT_SYNRA_AVATAR_ID: SynraAvatarId = "classic"');
const kioskRequestsClassicAvatar = kioskScript.includes("SYNRA_KIOSK_AVATAR:-classic") && kioskScript.includes("avatar=${KIOSK_AVATAR}");
const jetsonInstallerCanBootstrap =
  installerScript.includes("https://github.com/synryzen/NodeSpark-Synra.git") &&
  installerScript.includes("synra-standalone.service") &&
  installerScript.includes("synra-electron-kiosk.service") &&
  installerScript.includes("disable_legacy_kiosk_autostarts") &&
  installerScript.includes("tools/SynraJetsonStation");
const electronKioskIsPackaged =
  electronKioskScript.includes("start-electron-kiosk") &&
  electronKioskScript.includes("repair-electron-install.sh") &&
  electronKioskConfig.includes('params.set("fps", stringEnv(env, "SYNRA_KIOSK_FPS", "30"))') &&
  electronKioskConfig.includes('params.set("quality", stringEnv(env, "SYNRA_KIOSK_QUALITY", "sharp"))') &&
  electronKioskConfig.includes('params.set("maxw", stringEnv(env, "SYNRA_KIOSK_MAX_RENDER_WIDTH", "2560"))') &&
  electronKioskConfig.includes('params.set("maxh", stringEnv(env, "SYNRA_KIOSK_MAX_RENDER_HEIGHT", "1600"))');
const electronKioskWindowModeIsAvailable =
  electronKioskScript.includes("SYNRA_KIOSK_WINDOW_MODE") &&
  electronKioskConfig.includes("SYNRA_KIOSK_WINDOW_MODE") &&
  electronKioskConfig.includes('params.set("shell", "electron")') &&
  electronKioskTests.includes("supports setup-friendly windowed kiosk mode") &&
  electronKioskTests.includes("supports production fullscreen kiosk mode") &&
  existsSync(join(root, "tools/SynraJetsonStation/src/kiosk-preload.ts")) &&
  readFileSync(join(root, "tools/SynraJetsonStation/src/kiosk-preload.ts"), "utf8").includes("synraKiosk") &&
  readFileSync(join(root, "tools/SynraJetsonStation/src/kiosk-shell.ts"), "utf8").includes("synra-kiosk:toggle-window-mode") &&
  mainScript.includes("kioskWindowToggleButton") &&
  mainScript.includes("Switch to Windowed Setup") &&
  mainScript.includes("Return to Full Screen");
const companionPresenceSetupIsAvailable =
  mainScript.includes("firstRunWizard") &&
  mainScript.includes("wakeWordModeInput") &&
  mainScript.includes("screenTimeoutInput") &&
  mainScript.includes("knownUserNameInput") &&
  mainScript.includes("captureUserFaceButton") &&
  mainScript.includes("startWakeWordListening") &&
  mainScript.includes("Listening for Hello Synra") &&
  mainScript.includes("No raw audio or camera frames are saved to memory") &&
  mainScript.includes("companionSettings") &&
  mainScript.includes("loadCompanionSettings") &&
  mainScript.includes("saveCompanionSettings") &&
  styles.includes(".wizard-panel") &&
  styles.includes(".known-user-card") &&
  readFileSync(join(root, "tools/SynraJetsonStation/src/kiosk-preload.ts"), "utf8").includes("setScreenTimeout") &&
  readFileSync(join(root, "tools/SynraJetsonStation/src/kiosk-shell.ts"), "utf8").includes("synra-kiosk:set-screen-timeout");
const electronKioskRemoteDebugIsOptIn =
  electronKioskScript.includes('SYNRA_KIOSK_REMOTE_DEBUG="${SYNRA_KIOSK_REMOTE_DEBUG:-false}"') &&
  electronKioskConfig.includes("remote-debugging-port");
const electronKioskUsesStableJetsonBackend =
  electronKioskScript.includes('SYNRA_KIOSK_ANGLE_BACKEND="${SYNRA_KIOSK_ANGLE_BACKEND:-vulkan}"') &&
  electronKioskConfig.includes('angleBackend: stringEnv(env, "SYNRA_KIOSK_ANGLE_BACKEND", "vulkan")') &&
  electronKioskConfig.includes("VulkanFromANGLE");
const electronKioskTestsArePackaged =
  electronKioskTests.includes("builds the default Jetson kiosk URL") &&
  electronKioskTests.includes('assert.equal(config.angleBackend, "vulkan")');
const rendererUsesQualityPresentation =
  mainScript.includes("antialias: true") &&
  mainScript.includes("THREE.NeutralToneMapping") &&
  mainScript.includes("HemisphereLight") &&
  mainScript.includes("faceLight") &&
  mainScript.includes("STAGE_AVATAR_HEIGHT") &&
  mainScript.includes("0.015 - scaledBox.min.y") &&
  mainScript.includes("SynraContactShadow") &&
  mainScript.includes("kiosk ? 4.85 : 4.55");
const vrmRuntimeUsesModernOptimization = mainScript.includes("VRMUtils.combineSkeletons") && mainScript.includes("VRMUtils.combineMorphs");
const smartHomeBridgeIsSafe = serverScript.includes("/api/tools/smart-home") && serverScript.includes("SYNRA_SMART_HOME_ENABLED") && serverScript.includes("Home Assistant");
const smartHomeRequiresConfirmation = mainScript.includes("pendingAction") && mainScript.includes("Say confirm to run it") && mainScript.includes("cancel");
const homeAssistantSettingsAreConfigurable =
  mainScript.includes('id="homeAssistantEnabledInput"') &&
  mainScript.includes('id="testHomeAssistantButton"') &&
  mainScript.includes('id="discoverHomeAssistantButton"') &&
  mainScript.includes('id="homeAssistantEntitySelect"') &&
  mainScript.includes('id="homeAssistantTargetCount"') &&
  mainScript.includes('id="homeAssistantDefaultTarget"') &&
  mainScript.includes("loadHomeAssistantSettings") &&
  mainScript.includes("saveHomeAssistantSettings") &&
  mainScript.includes("homeAssistantToolPayload") &&
  mainScript.includes("/api/tools/smart-home/status") &&
  mainScript.includes("/api/tools/smart-home/discover") &&
  mainScript.includes("knownEntities") &&
  mainScript.includes("matchHomeAssistantEntity") &&
  mainScript.includes("listHomeAssistantTargetsCommand") &&
  mainScript.includes("setHomeAssistantDefaultCommand") &&
  mainScript.includes("matchSmartHomeActionForKnownEntity") &&
  mainScript.includes("friendlyHomeAssistantTargetName") &&
  styles.includes(".skill-detail-grid") &&
  serverScript.includes("handle_smart_home_status") &&
  serverScript.includes("handle_smart_home_discover") &&
  serverScript.includes("home_assistant_config_from_body") &&
  serverScript.includes("call_home_assistant_status") &&
  serverScript.includes("call_home_assistant_entities") &&
  serverScript.includes("/api/states") &&
  serverScript.includes("/api/config");
const visionIsPermissionOnly = mainScript.includes("visionStatus") && mainScript.includes("ensureCameraReady") && mainScript.includes("I am not storing frames");
const visionDiagnosticsAreLocal = serverScript.includes("/api/vision/public") && serverScript.includes("SYNRA_CAMERA_DEVICE") && serverScript.includes("Device-path diagnostics only");
const explicitVisionControlIsAvailable =
  mainScript.includes('id="visionToggleButton"') &&
  mainScript.includes("activeVisionStream") &&
  mainScript.includes("setVisionEnabled") &&
  mainScript.includes("stopVisionStream") &&
  mainScript.includes("Vision On") &&
  mainScript.includes("Vision Off") &&
  mainScript.includes("Vision is on. I am not storing frames.");
const telemetryIsAvailable = serverScript.includes("/api/telemetry/public") && mainScript.includes("updateTelemetry") && mainScript.includes("keepalive");
const kioskMediaGrantIsOptIn = kioskScript.includes("SYNRA_KIOSK_AUTO_GRANT_MEDIA") && kioskScript.includes("--use-fake-ui-for-media-stream");
const kioskRemoteDebugIsOptIn = kioskScript.includes("SYNRA_KIOSK_REMOTE_DEBUG") && kioskScript.includes("--remote-debugging-port");
const kioskGlModeIsConfigurable = kioskScript.includes("SYNRA_KIOSK_GL_MODE") && kioskScript.includes("--use-gl");
const kioskAngleBackendIsConfigurable = kioskScript.includes("SYNRA_KIOSK_ANGLE_BACKEND") && kioskScript.includes("--use-angle");
const kioskUsesSnapVulkanFallback =
  kioskScript.includes("SYNRA_KIOSK_ANGLE_BACKEND:-vulkan") &&
  kioskScript.includes("SYNRA_KIOSK_GL_MODE:-none") &&
  kioskScript.includes("SYNRA_KIOSK_FPS:-24") &&
  kioskScript.includes("--disable-gpu-rasterization") &&
  kioskScript.includes("--disable-gpu-driver-bug-workarounds");
const kioskVulkanWebglPathIsConfigurable =
  kioskScript.includes("DefaultANGLEVulkan") &&
  kioskScript.includes("VulkanFromANGLE") &&
  kioskScript.includes("--enable-webgl2");
const kioskDefaultsToPerformanceQuality = kioskScript.includes("SYNRA_KIOSK_QUALITY:-performance") && kioskScript.includes("quality=${KIOSK_QUALITY}");
const jetsonSharpPixelRatioIsAvailable = mainScript.includes('quality === "sharp"') && mainScript.includes("return 1.65");
const sharpQualityActuallySupersamples = mainScript.includes('if (quality === "sharp") return cap') && mainScript.includes("shouldPreferSharpHostedDefault");
const avatarTextureFilteringIsExplicit =
  mainScript.includes("sharpenAvatarMaterialTextures") &&
  mainScript.includes("THREE.LinearMipmapLinearFilter") &&
  mainScript.includes("getMaxAnisotropy");
const kioskRenderScaleIsConfigurable = kioskScript.includes("SYNRA_KIOSK_RENDER_SCALE:-0.5") && kioskScript.includes("scale=${KIOSK_RENDER_SCALE}");
const kioskRenderBufferCapIsConfigurable =
  kioskScript.includes("SYNRA_KIOSK_MAX_RENDER_WIDTH:-1280") &&
  kioskScript.includes("SYNRA_KIOSK_MAX_RENDER_HEIGHT:-800") &&
  kioskScript.includes("maxw=${KIOSK_MAX_RENDER_WIDTH}") &&
  mainScript.includes("resolveRenderSizeCappedPixelRatio") &&
  hubRuntimeScript.includes("resolveRuntimeRenderSizeCap");
const runtimeRenderScaleIsConfigurable = mainScript.includes("renderScale") && mainScript.includes("resolveRenderScaleOverride") && mainScript.includes("const uncapped = renderScale ??");
const jetsonKioskFpsKeepsAvatarSmooth =
  mainScript.includes('const liveAvatar = params.get("live") === "1"') &&
  mainScript.includes("const defaultFps = performanceLimited ? 24 : 60") &&
  mainScript.includes("liveAvatar && !performanceLimited ? 60 : defaultFps") &&
  hubRuntimeScript.includes('params.get("live") === "1" && !performanceLimited') &&
  hubRuntimeScript.includes("THREE.MathUtils.clamp(requested, 12, 60)");
const rightRailCanScroll = mainScript.includes("right-rail") && styles.includes("overflow-y: auto");
const aiConnectionPanelIsVisible = mainScript.includes("connection-panel") && mainScript.includes("testAiConnection") && mainScript.includes("qualitySelect");
const systemHealthTruthPanelIsAvailable =
  mainScript.includes("health-panel") &&
  mainScript.includes("checkAllConnections") &&
  mainScript.includes("ConnectionTruthStatus") &&
  mainScript.includes("Not configured") &&
  mainScript.includes("Permission needed") &&
  mainScript.includes("healthNodeSparkStatus") &&
  styles.includes(".health-panel") &&
  styles.includes(".health-row strong[data-state=");
const settingsTabsAreAvailable =
  mainScript.includes("settings-tabs") &&
  mainScript.includes("data-settings-tab=\"ai\"") &&
  mainScript.includes("data-settings-tab=\"nodespark\"") &&
  mainScript.includes("data-settings-tab=\"display\"") &&
  mainScript.includes("setSettingsTab") &&
  styles.includes(".settings-tab.active") &&
  styles.includes(".settings-panel[hidden]");
const ownershipAboutSurfaceIsAvailable =
  mainScript.includes("Matthew C Elliott") &&
  mainScript.includes("https://synryzen.com") &&
  mainScript.includes("nodesparkhub-icon.png") &&
  mainScript.includes("aboutDialog") &&
  mainScript.includes("openAboutButton") &&
  mainScript.includes("who made you") &&
  styles.includes(".about-panel") &&
  styles.includes(".about-dialog");
const nodeSparkHubSpotlightIncludesStoreLink =
  mainScript.includes("NodeSparkHub is the command-center side of the NodeSpark ecosystem") &&
  mainScript.includes("https://apps.apple.com/us/app/nodespark/id6756223114") &&
  mainScript.includes("Open NodeSpark on the App Store");
const canvasFilterDoesNotSoftenWebgl = styles.includes("#scene") && styles.includes("image-rendering: auto") && !styles.includes("filter: drop-shadow(0 28px 34px");
const kioskComposerIsRightDocked =
  mainScript.includes("left-chat-panel") &&
  mainScript.includes("chatLog") &&
  mainScript.includes("renderChatMessages") &&
  styles.includes(".left-chat-panel") &&
  styles.includes(".chat-bubble") &&
  styles.includes(".brand-logo-only") &&
  styles.includes("--left-panel-width") &&
  styles.includes("grid-template-areas") &&
  styles.includes('"prompt prompt prompt prompt prompt"') &&
  styles.includes(".composer .icon-button.send");
const externalModelRepliesStayEnglish =
  serverScript.includes("Always reply in English unless the user explicitly asks for another language.") &&
  serverScript.includes("Final language rule: answer in English unless the user explicitly asks for another language.");
const modelRoutesAreExplicit = serverScript.includes("model_name_for_intent") && serverScript.includes("SYNRA_VISION_MODEL_NAME") && mainScript.includes("classifySynraRequest");
const aiConnectionsAreConfigurable =
  mainScript.includes("providerInput") &&
  mainScript.includes("openAICompatible") &&
  mainScript.includes("localHTTP") &&
  mainScript.includes("temperatureInput") &&
  mainScript.includes("systemPromptInput") &&
  modelClientScript.includes("/api/external-chat") &&
  serverScript.includes("/api/external-chat") &&
  serverScript.includes("handle_external_chat") &&
  serverScript.includes("normalize_chat_endpoint");
const externalModelProxyMatchesHubConnectionStyle =
  serverScript.includes("NodeSparkHub/4.4 SynraStandalone") &&
  serverScript.includes('request.add_header("Accept", "application/json")') &&
  serverScript.includes('request.add_header("HTTP-Referer"') &&
  serverScript.includes("describe_http_error");
const externalModelTextCleanupIsAvailable =
  serverScript.includes("clean_model_text") &&
  serverScript.includes("<|begin_of_box|>") &&
  serverScript.includes("message_content_to_text");
const hubGradeAvatarRuntimeIsWired =
  mainScript.includes("./hub-runtime/drivers/avatar3d") &&
  mainScript.includes("USE_HUB_AVATAR_RUNTIME") &&
  mainScript.includes("hubAvatarRuntime.boot") &&
  mainScript.includes("hubAvatarRuntime.setAvatar") &&
  (mainScript.includes("hubAvatarRuntime.trigger") || mainScript.includes("hubAvatarRuntime.playGeneratedClip")) &&
  /hubAvatarRuntime\??\.runtimeHealth/.test(mainScript) &&
  hubRuntimeScript.includes("calibrateFloorAnchor") &&
  hubRuntimeScript.includes("applyCameraFraming") &&
  hubRuntimeScript.includes("SynraAuthoredMotionPlayer");
const hubRuntimeHonorsJetsonKioskPerformance =
  hubRuntimeScript.includes("isPerformanceLimitedHost") &&
  hubRuntimeScript.includes('params.get("profile") === "jetson"') &&
  hubRuntimeScript.includes('params.get("mode") === "kiosk"') &&
  hubRuntimeScript.includes("isPrivateNetworkHost(window.location.hostname)") &&
  mainScript.includes("isPrivateNetworkHost(window.location.hostname)") &&
  hubRuntimeScript.includes("readRuntimeTargetFps") &&
  hubRuntimeScript.includes("readRuntimePixelRatio");
const pointerAwarenessIsOptIn =
  hubRuntimeScript.includes("readPointerAwarenessEnabled") &&
  hubRuntimeScript.includes('params.get("pointer") === "1"') &&
  hubRuntimeScript.includes('synraPointerAwareness") === "true"') &&
  hubRuntimeScript.includes("if (this.pointerAwarenessEnabled)") &&
  hubRuntimeScript.includes("pointerAwarenessEnabled: this.pointerAwarenessEnabled") &&
  hubRuntimeScript.includes("if (!this.pointerAwarenessEnabled || !this.vrm || this.gazeOverride) return");
const companionMemoryPreferencesAreLocal =
  mainScript.includes("preferredName") &&
  mainScript.includes("Got it. I will call you") &&
  mainScript.includes("I will use a") &&
  mainScript.includes("saveMemory(state.memory)");
const editableMemoryPanelIsAvailable =
  mainScript.includes('id="memoryPreferredNameInput"') &&
  mainScript.includes('id="forgetMemoriesButton"') &&
  mainScript.includes('id="exportMemoryButton"') &&
  mainScript.includes('id="importMemoryButton"') &&
  mainScript.includes("readMemorySettingsFromInputs") &&
  mainScript.includes("redactMemoryFact");
const localToolsAreAvailable =
  mainScript.includes("/api/tools/local") &&
  mainScript.includes("localToolCommand") &&
  serverScript.includes("handle_local_tool") &&
  serverScript.includes("system_status") &&
  serverScript.includes("network_status") &&
  serverScript.includes("date_time");
const nodeSparkStatusSkillIsAvailable =
  mainScript.includes("/api/nodespark/status") &&
  mainScript.includes("/api/nodespark/pair") &&
  mainScript.includes("/api/nodespark/action") &&
  mainScript.includes('id="nodeSparkWorkflowsButton"') &&
  mainScript.includes('id="nodeSparkRunsButton"') &&
  mainScript.includes('id="nodeSparkLatestRunButton"') &&
  mainScript.includes("runNodeSparkPanelCommand") &&
  mainScript.includes("pairNodeSparkHub") &&
  mainScript.includes("listNodeSparkWorkflowsCommand") &&
  mainScript.includes("listNodeSparkRunsCommand") &&
  mainScript.includes("prepareNodeSparkWorkflowRunCommand") &&
  mainScript.includes("runNodeSparkWorkflowCommand") &&
  mainScript.includes("renderNodeSparkWorkflowCard") &&
  mainScript.includes("renderNodeSparkConfirmationCard") &&
  mainScript.includes("renderNodeSparkRunResultCard") &&
  mainScript.includes("data-nodespark-workflow") &&
  mainScript.includes("data-nodespark-refresh") &&
  mainScript.includes("data-nodespark-runs") &&
  mainScript.includes("Nothing has started yet") &&
  mainScript.includes("Run Workflow") &&
  mainScript.includes("NodeSparkWorkflowSummary") &&
  serverScript.includes("summarize_nodespark_workflow") &&
  mainScript.includes("chatCardRegistry") &&
  mainScript.includes("nodeSparkDeviceToken") &&
  mainScript.includes("checkNodeSparkStatus") &&
  mainScript.includes("NodeSpark Command Center is paired with") &&
  mainScript.includes('routeLabel: "NodeSpark Command Center"') &&
  modelClientScript.includes('path: "direct", label: "NodeSpark Command Center"') &&
  serverScript.includes("handle_nodespark_status") &&
  serverScript.includes("handle_nodespark_pair") &&
  serverScript.includes("handle_nodespark_action") &&
  serverScript.includes("call_nodespark_action") &&
  serverScript.includes("add_nodespark_auth_headers") &&
  serverScript.includes("add_nodespark_client_headers") &&
  serverScript.includes("SynraStandalone/{app_version()} Chrome-Compatible") &&
  serverScript.includes('if path != "/health"') &&
  serverScript.includes('for path in ("/health", "/api/health", "/api/status")') &&
  serverScript.includes("if error.code in {401, 403}") &&
  serverScript.includes("protected probe") &&
  serverScript.includes("normalize_nodespark_hub_url");
const visionAnalysisRouteIsAvailable =
  mainScript.includes("/api/vision/analyze") &&
  mainScript.includes("captureVisionFrame") &&
  serverScript.includes("handle_vision_analyze") &&
  serverScript.includes("SYNRA_VISION_MODEL_NAME");
const smartHomeRiskLevelsAreVisible =
  mainScript.includes("smartHomeRiskLevel") &&
  mainScript.includes("Risk:") &&
  serverScript.includes("smart_home_risk_level");
const jetsonOpsHelpersAreAvailable =
  existsSync(join(root, "scripts/synra-health.sh")) &&
  existsSync(join(root, "scripts/synra-log-export.sh")) &&
  existsSync(join(root, "scripts/dev-mac.sh"));
const voiceReliabilityControlsAreAvailable =
  mainScript.includes('id="stopVoiceButton"') &&
  mainScript.includes("stopVoiceActivity") &&
  mainScript.includes("speechSynthesis.cancel") &&
  mainScript.includes("activeRecognition") &&
  mainScript.includes("audioDeviceDiagnostics") &&
  mainScript.includes("enumerateDevices") &&
  mainScript.includes("Audio devices:");
const elevenLabsVoiceSettingsAreAvailable =
  mainScript.includes('id="voiceProviderInput"') &&
  mainScript.includes('value="elevenLabs"') &&
  mainScript.includes("loadVoiceSettings") &&
  mainScript.includes("saveVoiceSettings") &&
  mainScript.includes("playElevenLabsSpeech") &&
  mainScript.includes("/api/tts/elevenlabs") &&
  mainScript.includes("fallbackToBrowserSpeech") &&
  mainScript.includes("activeSpeechAudio") &&
  serverScript.includes("/api/tts/elevenlabs") &&
  serverScript.includes("handle_elevenlabs_tts") &&
  serverScript.includes("xi-api-key") &&
  serverScript.includes("audioBase64");
const standaloneSpeechLipSyncIsDriven =
  mainScript.includes("visemesForSpeechPosition") &&
  mainScript.includes("startSpeechLipSync") &&
  mainScript.includes("stopSpeechLipSync") &&
  mainScript.includes("speechCharacterIndexAtAlignment") &&
  mainScript.includes("hubAvatarRuntime?.setVisemes") &&
  mainScript.includes("audio.duration") &&
  mainScript.includes("audio.currentTime") &&
  mainScript.includes("clearSpeechFallback();") &&
  mainScript.includes("startSpeechLipSync(text, serial") &&
  mainScript.includes("stopSpeechLipSync();") &&
  serverScript.includes("with-timestamps") &&
  serverScript.includes("normalizedAlignment");
const browserFallbackVoiceIsDeliberate =
  mainScript.includes('id="browserVoiceSelect"') &&
  mainScript.includes("PREFERRED_BROWSER_VOICE_HINTS") &&
  mainScript.includes("preferredBrowserVoice") &&
  mainScript.includes("selectedBrowserVoice") &&
  mainScript.includes("utterance.voice = browserVoice") &&
  mainScript.includes("Browser fallback voice:");
const productAccessSplitIsExplicit =
  mainScript.includes('id="nodeSparkAccessInput"') &&
  mainScript.includes('id="openSkillSettingsButton"') &&
  mainScript.includes('hasHubToken ? "Paired"') &&
  mainScript.includes('id="synraSkillModeInput"') &&
  mainScript.includes('id="nodeSparkPairingPinInput"') &&
  mainScript.includes('id="checkNodeSparkPairingButton"') &&
  mainScript.includes('id="forgetNodeSparkPairingButton"') &&
  mainScript.includes("NodeSpark Command Center is a premium Synra skill") &&
  mainScript.includes("refreshSkillPanel") &&
  mainScript.includes("skillAccessSnapshot") &&
  mainScript.includes("loadProductSettings") &&
  mainScript.includes("saveProductSettings") &&
  modelClientScript.includes("Home Assistant control is included in free Synra") &&
  modelClientScript.includes("optional subscriber skill");
const voicePolishIsAvailable =
  mainScript.includes("voiceProviderLabel") &&
  mainScript.includes("testVoiceConnection") &&
  mainScript.includes("Voice test started") &&
  mainScript.includes("ElevenLabs fallback") &&
  mainScript.includes("stopVoiceActivity");
const elevenLabsVoicePickerIsAvailable =
  mainScript.includes('id="loadElevenLabsVoicesButton"') &&
  mainScript.includes('id="elevenLabsVoiceSelect"') &&
  mainScript.includes("loadElevenLabsVoices") &&
  mainScript.includes("/api/tts/elevenlabs/voices") &&
  serverScript.includes("/api/tts/elevenlabs/voices") &&
  serverScript.includes("handle_elevenlabs_voices") &&
  serverScript.includes("elevenlabs_list_voices");
const voiceDiagnosticsAreAvailable =
  mainScript.includes("runVoiceDiagnostics") &&
  mainScript.includes("unlockAudioPlayback") &&
  mainScript.includes("Playback blocked") &&
  mainScript.includes("Voice diagnostics");
const serverAssistedSpeechToTextIsAvailable =
  mainScript.includes("recordAndTranscribeMicrophone") &&
  mainScript.includes("startServerTranscriptionListening") &&
  mainScript.includes("startServerWakeWordListening") &&
  mainScript.includes("/api/stt/elevenlabs") &&
  serverScript.includes("/api/stt/elevenlabs") &&
  serverScript.includes("handle_elevenlabs_stt") &&
  serverScript.includes("elevenlabs_speech_to_text");
const wakeWordCommandFlowIsAvailable =
  mainScript.includes("handleWakeWordTranscript") &&
  mainScript.includes("extractWakeWordCommand") &&
  mainScript.includes("greetAfterWakeWord") &&
  mainScript.includes("startCommandListeningAfterWakeWord");
const holdToTalkMicFlowIsAvailable =
  mainScript.includes('listenButton.addEventListener("pointerdown"') &&
  mainScript.includes('listenButton.addEventListener("pointerup"') &&
  mainScript.includes("beginHoldToTalk") &&
  mainScript.includes("finishHoldToTalk") &&
  mainScript.includes("recordAndTranscribeUntilStopped");
const electronKioskMediaCanBeEnabled =
  electronKioskScript.includes('SYNRA_KIOSK_AUTO_GRANT_MEDIA="${SYNRA_KIOSK_AUTO_GRANT_MEDIA:-true}"') &&
  electronKioskConfig.includes('autoGrantMedia: boolEnv(env, "SYNRA_KIOSK_AUTO_GRANT_MEDIA", true)') &&
  electronKioskConfig.includes("use-fake-ui-for-media-stream");
const synraPersonalityIsUpgraded =
  serverScript.includes("calm, cinematic, emotionally intelligent companion") &&
  serverScript.includes("speak with grounded confidence") &&
  serverScript.includes("Before claiming a device, camera, microphone, NodeSparkHub, or Home Assistant connection works");
const repeatedStateChangesDoNotRestartAvatar =
  mainScript.includes("lastRenderedSynraState") &&
  mainScript.includes("shouldRestartStateMotion") &&
  mainScript.includes("if (!shouldRestartStateMotion) return");
const startupIdleMotionIsArmed =
  mainScript.includes("lastRenderedSynraState: null as SynraState | null") &&
  mainScript.includes("previousState !== next || state.lastRenderedSynraState !== next");
const kioskHealthRouteIsAvailable =
  serverScript.includes("/api/kiosk/health") &&
  serverScript.includes("kiosk_health_status") &&
  serverScript.includes("synra-standalone.service");
const browserAvatarMotionHarnessIsAvailable =
  mainScript.includes("__synraStandaloneTest") &&
  mainScript.includes("switchAvatar") &&
  mainScript.includes("playMotion") &&
  mainScript.includes("sendText") &&
  mainScript.includes("motionIds");
const avatarMotionSmokeScriptCanExerciseLiveJetson =
  existsSync(join(root, "scripts/avatar-motion-smoke.mjs")) &&
  readFileSync(join(root, "scripts/avatar-motion-smoke.mjs"), "utf8").includes("SYNRA_SMOKE_URL") &&
  readFileSync(join(root, "scripts/avatar-motion-smoke.mjs"), "utf8").includes("avatarResults") &&
  readFileSync(join(root, "scripts/avatar-motion-smoke.mjs"), "utf8").includes("motionResults");
const result = {
  ok:
    avatarMb < 40 &&
    avatarCount >= 4 &&
    avatarFiles.includes("princess-synra.vrm") &&
    backgroundCount >= 6 &&
    motionCount >= 97 &&
    kioskIsLean &&
    classicIsFirstAndDefaultAvatar &&
    kioskRequestsClassicAvatar &&
    jetsonInstallerCanBootstrap &&
    electronKioskIsPackaged &&
    electronKioskWindowModeIsAvailable &&
    companionPresenceSetupIsAvailable &&
    electronKioskRemoteDebugIsOptIn &&
    electronKioskUsesStableJetsonBackend &&
    electronKioskTestsArePackaged &&
    rendererUsesQualityPresentation &&
    vrmRuntimeUsesModernOptimization &&
    smartHomeBridgeIsSafe &&
    smartHomeRequiresConfirmation &&
    homeAssistantSettingsAreConfigurable &&
    visionIsPermissionOnly &&
    visionDiagnosticsAreLocal &&
    explicitVisionControlIsAvailable &&
    telemetryIsAvailable &&
    kioskMediaGrantIsOptIn &&
    kioskRemoteDebugIsOptIn &&
    kioskGlModeIsConfigurable &&
    kioskAngleBackendIsConfigurable &&
    kioskUsesSnapVulkanFallback &&
    kioskVulkanWebglPathIsConfigurable &&
    kioskDefaultsToPerformanceQuality &&
    jetsonSharpPixelRatioIsAvailable &&
    sharpQualityActuallySupersamples &&
    avatarTextureFilteringIsExplicit &&
    kioskRenderScaleIsConfigurable &&
    kioskRenderBufferCapIsConfigurable &&
    runtimeRenderScaleIsConfigurable &&
    jetsonKioskFpsKeepsAvatarSmooth &&
    rightRailCanScroll &&
    aiConnectionPanelIsVisible &&
    systemHealthTruthPanelIsAvailable &&
    settingsTabsAreAvailable &&
    ownershipAboutSurfaceIsAvailable &&
    nodeSparkHubSpotlightIncludesStoreLink &&
    canvasFilterDoesNotSoftenWebgl &&
    kioskComposerIsRightDocked &&
    modelRoutesAreExplicit &&
    aiConnectionsAreConfigurable &&
    externalModelProxyMatchesHubConnectionStyle &&
    externalModelTextCleanupIsAvailable &&
    externalModelRepliesStayEnglish &&
    hubGradeAvatarRuntimeIsWired &&
    hubRuntimeHonorsJetsonKioskPerformance &&
    pointerAwarenessIsOptIn &&
    companionMemoryPreferencesAreLocal &&
    editableMemoryPanelIsAvailable &&
    localToolsAreAvailable &&
    nodeSparkStatusSkillIsAvailable &&
    visionAnalysisRouteIsAvailable &&
    smartHomeRiskLevelsAreVisible &&
    jetsonOpsHelpersAreAvailable &&
    voiceReliabilityControlsAreAvailable &&
    elevenLabsVoiceSettingsAreAvailable &&
    standaloneSpeechLipSyncIsDriven &&
    browserFallbackVoiceIsDeliberate &&
    productAccessSplitIsExplicit &&
    voicePolishIsAvailable &&
    elevenLabsVoicePickerIsAvailable &&
    voiceDiagnosticsAreAvailable &&
    serverAssistedSpeechToTextIsAvailable &&
    wakeWordCommandFlowIsAvailable &&
    holdToTalkMicFlowIsAvailable &&
    electronKioskMediaCanBeEnabled &&
    synraPersonalityIsUpgraded &&
    repeatedStateChangesDoNotRestartAvatar &&
    startupIdleMotionIsArmed &&
    kioskHealthRouteIsAvailable &&
    browserAvatarMotionHarnessIsAvailable &&
    avatarMotionSmokeScriptCanExerciseLiveJetson,
  target: "jetson-first-lean-runtime",
  avatarMb,
  avatarCount,
  backgroundCount,
  motionCount,
  checks: [
    "standalone app does not depend on NodeSparkHub",
    "runtime includes Synra Classic, Code, Battle, and Princess avatars",
    "Synra Classic is first and default",
    "Jetson kiosk requests Synra Classic by default",
    "Jetson installer can bootstrap app service and Electron kiosk",
    "Electron kiosk package is included in the Synra repo",
    "Electron kiosk can switch between windowed setup and fullscreen kiosk modes",
    "Synra companion setup includes wake word, screen timeout, known users, and privacy controls",
    "Electron kiosk remote debugging is opt-in",
    "Electron kiosk defaults to the stable Jetson Vulkan backend",
    "Electron kiosk tests are packaged with the repo",
    "runtime includes six premium Synra stage backgrounds",
    "runtime includes the Hub VRMA motion library",
    "renderer uses Hub-style quality presentation",
    "VRM runtime combines skeletons and morphs for Jetson performance",
    "adaptive pixel ratio is capped",
    "kiosk launcher uses lean Jetson mode",
    "smart-home bridge fails safely unless configured",
    "smart-home actions honor the configured confirmation policy",
    "Home Assistant free skill can be configured, tested, discovered, summarized, and targeted by name",
    "camera path is permission-only until vision skill is configured",
    "Jetson camera diagnostics report device paths only",
    "explicit Vision On/Off control owns the transient camera stream",
    "kiosk telemetry reports local FPS without secrets",
    "kiosk camera/mic auto-grant is opt-in",
    "kiosk remote debugging is opt-in",
    "kiosk Chromium GL mode is configurable",
    "kiosk Chromium ANGLE backend is configurable",
    "snap Chromium fallback remains configurable",
    "Chromium fallback GL and ANGLE paths remain configurable",
    "Chromium fallback defaults to performance visual quality",
    "sharp render quality can raise Jetson avatar clarity",
    "sharp render quality supersamples even on 1x displays",
    "avatar textures use explicit mipmap and anisotropic filtering",
    "Jetson kiosk render scale is configurable",
    "Jetson kiosk render buffer cap is configurable",
    "runtime honors render scale overrides above device pixel ratio",
    "Jetson kiosk honors low-FPS URLs instead of forcing live mode to 60 FPS",
    "right-side control rail scrolls when controls overflow",
    "AI connection panel is visible in the right-side rail",
    "System Health panel uses exact connection truth states",
    "settings dialog is organized into AI, Voice, Memory, Home, NodeSparkHub, Display, and About tabs",
    "ownership About surface identifies Matthew C Elliott and Synryzen",
    "NodeSparkHub spotlight includes the Hub icon and App Store link",
    "canvas rendering avoids CSS filters that soften WebGL",
    "kiosk composer is docked right instead of blocking Synra",
    "model routes are explicit for conversation, vision, tools, and NodeSpark",
    "AI connection settings support server, cloud, and local HTTP models",
    "external AI proxy sends Hub-style OpenAI-compatible headers",
    "external AI proxy cleans provider wrapper tokens",
    "external AI proxy pins Synra replies to English unless asked otherwise",
    "Standalone avatar canvas uses the Hub-grade SynraAvatarRuntime",
    "Hub runtime honors Jetson kiosk FPS and render-scale settings",
    "remote mouse pointer awareness is opt-in only",
    "Synra can remember local name and response-style preferences",
    "Synra includes an editable memory panel with forget/export/import",
    "local tool registry supports system, network, and date/time status",
    "optional NodeSpark Command Center can check Hub status without running workflows",
    "NodeSpark connection questions use the direct status path instead of model guessing",
    "vision analysis route is wired for transient frame-to-model prompts",
    "smart-home actions expose risk levels before confirmation",
    "Jetson operations include health, log export, and Mac dev launch helpers",
    "voice controls include immediate stop and audio diagnostics",
    "ElevenLabs voice settings and server-side TTS proxy are wired with browser fallback",
    "Standalone drives Hub-style phoneme lip sync while ElevenLabs or browser voice is talking",
    "browser speech fallback deliberately chooses and exposes a system voice",
    "ElevenLabs voices can be loaded and selected by name",
    "voice diagnostics include audio unlock and playback-blocked feedback",
    "server-assisted ElevenLabs speech-to-text backs up Jetson mic input",
    "wake word opens a command flow and can run commands after Hello Synra",
    "mic button uses hold-to-talk and sends after release",
    "Electron kiosk can auto-grant local mic/camera permissions for the dedicated station",
    "Synra personality prompt is upgraded for reliable companion behavior",
    "Synra free companion and premium NodeSpark Command Center access are explicit",
    "voice testing has clear provider feedback and stop reliability",
    "avatar state changes avoid restarting the same motion every frame",
    "startup idle state is unrendered until the avatar runtime can enter its idle loop",
    "Jetson kiosk health route can verify service/runtime readiness",
    "browser QA harness can switch avatars and play motions",
    "avatar-motion smoke script can exercise the live Jetson app",
    "model calls fall back to local Synra path"
  ]
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);

function bytesToMb(bytes) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function countFiles(directory, extension) {
  let count = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) count += countFiles(fullPath, extension);
    else if (entry.isFile() && entry.name.endsWith(extension)) count += 1;
  }
  return count;
}
