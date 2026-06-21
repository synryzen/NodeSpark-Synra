import type { AgentSettings, CompanionSettings, HomeAssistantSettings, ModelSettings, ProductSettings, SynraMemory, VisualSettings, VoiceSettings } from "./types";
import { DEFAULT_SYNRA_AVATAR_ID } from "./avatar-catalog";
import { faceSamplesFromPoseMap, normalizeFacePoseSamples } from "./identity";

const modelKey = "synraStandalone.modelSettings.v1";
const memoryKey = "synraStandalone.memory.v1";
const visualKey = "synraStandalone.visualSettings.v2";
const voiceKey = "synraStandalone.voiceSettings.v1";
const productKey = "synraStandalone.productSettings.v1";
const homeAssistantKey = "synraStandalone.homeAssistantSettings.v1";
const companionKey = "synraStandalone.companionSettings.v1";
const agentKey = "synraStandalone.agentSettings.v1";
export const SERVER_SECRET_SENTINEL = "__server_secret__";
const DEFAULT_WAKE_PHRASE = "Hello Synra";

export function loadModelSettings(): ModelSettings {
  return readJson<ModelSettings>(modelKey, {
    provider: "server",
    endpoint: "/api/chat",
    model: "server",
    apiKey: "",
    temperature: 0.2,
    systemPrompt: ""
  });
}

export function saveModelSettings(settings: ModelSettings): void {
  localStorage.setItem(modelKey, JSON.stringify({
    ...settings,
    apiKey: secretSentinelOrBlank(settings.apiKey)
  }));
}

export function loadVoiceSettings(): VoiceSettings {
  return readJson<VoiceSettings>(voiceKey, {
    provider: "browser",
    browserVoiceURI: "",
    browserVoiceName: "",
    elevenLabsApiKey: "",
    elevenLabsVoiceId: "",
    elevenLabsVoiceName: "",
    elevenLabsModelId: "eleven_multilingual_v2",
    elevenLabsOutputFormat: "mp3_44100_128",
    elevenLabsStability: 0.48,
    elevenLabsSimilarityBoost: 0.78,
    chatterboxModel: "turbo",
    chatterboxDevice: "auto",
    chatterboxVoicePromptPath: "",
    chatterboxLanguageId: "en"
  });
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  localStorage.setItem(voiceKey, JSON.stringify({
    ...settings,
    elevenLabsApiKey: secretSentinelOrBlank(settings.elevenLabsApiKey)
  }));
}

export function loadProductSettings(): ProductSettings {
  return readJson<ProductSettings>(productKey, {
    synraSkillMode: "hybrid",
    nodeSparkAccess: "locked",
    nodeSparkHubUrl: "",
    nodeSparkDeviceId: "",
    nodeSparkDeviceName: "Synra Standalone Jetson",
    nodeSparkHubId: "",
    nodeSparkDeviceToken: "",
    nodeSparkTokenExpiresAt: ""
  });
}

export function saveProductSettings(settings: ProductSettings): void {
  localStorage.setItem(productKey, JSON.stringify({
    ...settings,
    nodeSparkDeviceToken: secretSentinelOrBlank(settings.nodeSparkDeviceToken)
  }));
}

export function loadHomeAssistantSettings(): HomeAssistantSettings {
  return readJson<HomeAssistantSettings>(homeAssistantKey, {
    enabled: false,
    url: "",
    token: "",
    defaultLightEntity: "",
    confirmationPolicy: "trustedLights",
    knownEntities: []
  });
}

export function saveHomeAssistantSettings(settings: HomeAssistantSettings): void {
  localStorage.setItem(homeAssistantKey, JSON.stringify({
    ...settings,
    token: secretSentinelOrBlank(settings.token)
  }));
}

export function loadCompanionSettings(): CompanionSettings {
  const settings = readJson<CompanionSettings>(companionKey, {
    setupComplete: false,
    ownerName: "",
    wakeWordMode: "local",
    wakePhrase: DEFAULT_WAKE_PHRASE,
    preferredMicrophoneId: "",
    preferredCameraId: "",
    screenTimeoutMinutes: 10,
    allowAlwaysListening: true,
    allowCameraRecognition: false,
    allowFaceSampleStorage: false,
    voiceMatchMode: "off",
    voiceMatchSensitivity: "balanced",
    allowMemorySuggestions: true,
    knownUsers: []
  });
  const wasLegacyWakePhrase = !settings.wakePhrase?.trim() || settings.wakePhrase === "Hey Synra";
  const wakePhrase = !wasLegacyWakePhrase
    ? settings.wakePhrase.trim()
    : DEFAULT_WAKE_PHRASE;
  const wakeWordMode = wasLegacyWakePhrase && settings.wakeWordMode === "off" ? "local" : settings.wakeWordMode;
  const rawScreenTimeout = Number(settings.screenTimeoutMinutes);
  const screenTimeoutMinutes = rawScreenTimeout === 30
    ? 10
    : [10, 15, 60, 0].includes(rawScreenTimeout)
    ? settings.screenTimeoutMinutes
    : 10;
  return {
    ...settings,
    wakeWordMode,
    wakePhrase,
    preferredMicrophoneId: String(settings.preferredMicrophoneId ?? ""),
    preferredCameraId: String(settings.preferredCameraId ?? ""),
    screenTimeoutMinutes,
    allowAlwaysListening: wakeWordMode === "local" ? settings.allowAlwaysListening !== false : false,
    voiceMatchMode: settings.voiceMatchMode === "knownUsers" || settings.voiceMatchMode === "ownerOnly" ? settings.voiceMatchMode : "off",
    voiceMatchSensitivity: settings.voiceMatchSensitivity === "relaxed" || settings.voiceMatchSensitivity === "strict" ? settings.voiceMatchSensitivity : "balanced",
    knownUsers: Array.isArray(settings.knownUsers)
      ? settings.knownUsers.map((user) => {
        const facePoseSamples = normalizeFacePoseSamples(user.facePoseSamples);
        return {
          ...user,
          faceSamples: Array.isArray(user.faceSamples) ? user.faceSamples : faceSamplesFromPoseMap(facePoseSamples),
          facePoseSamples,
          voicePrints: Array.isArray(user.voicePrints) ? user.voicePrints : []
        };
      })
      : []
  };
}

export function saveCompanionSettings(settings: CompanionSettings): void {
  localStorage.setItem(companionKey, JSON.stringify(settings));
}

export function loadAgentSettings(): AgentSettings {
  return readJson<AgentSettings>(agentKey, {
    enabled: true,
    defaultAgentId: "synra-companion",
    showAgentStatus: true
  });
}

export function saveAgentSettings(settings: AgentSettings): void {
  localStorage.setItem(agentKey, JSON.stringify(settings));
}

export function loadMemory(): SynraMemory {
  return readJson<SynraMemory>(memoryKey, {
    preferredName: "",
    style: "warm, direct, and useful",
    savedFacts: [],
    routines: [],
    devices: [],
    rooms: [],
    preferences: []
  });
}

export function saveMemory(memory: SynraMemory): void {
  localStorage.setItem(memoryKey, JSON.stringify(memory));
}

export function loadVisualSettings(): VisualSettings {
  return readJson<VisualSettings>(visualKey, {
    avatarId: DEFAULT_SYNRA_AVATAR_ID,
    motionId: "wave",
    motionCategoryId: "greeting",
    backgroundId: "command-room",
    controlMode: "manual",
    renderQuality: "balanced"
  });
}

export function saveVisualSettings(settings: VisualSettings): void {
  localStorage.setItem(visualKey, JSON.stringify(settings));
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

function secretSentinelOrBlank(value: string): string {
  const trimmed = value.trim();
  return trimmed ? SERVER_SECRET_SENTINEL : "";
}
