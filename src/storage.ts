import type { HomeAssistantSettings, ModelSettings, ProductSettings, SynraMemory, VisualSettings, VoiceSettings } from "./types";
import { DEFAULT_SYNRA_AVATAR_ID } from "./avatar-catalog";

const modelKey = "synraStandalone.modelSettings.v1";
const memoryKey = "synraStandalone.memory.v1";
const visualKey = "synraStandalone.visualSettings.v2";
const voiceKey = "synraStandalone.voiceSettings.v1";
const productKey = "synraStandalone.productSettings.v1";
const homeAssistantKey = "synraStandalone.homeAssistantSettings.v1";

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
  localStorage.setItem(modelKey, JSON.stringify(settings));
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
    elevenLabsSimilarityBoost: 0.78
  });
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  localStorage.setItem(voiceKey, JSON.stringify(settings));
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
  localStorage.setItem(productKey, JSON.stringify(settings));
}

export function loadHomeAssistantSettings(): HomeAssistantSettings {
  return readJson<HomeAssistantSettings>(homeAssistantKey, {
    enabled: false,
    url: "",
    token: "",
    defaultLightEntity: "",
    knownEntities: []
  });
}

export function saveHomeAssistantSettings(settings: HomeAssistantSettings): void {
  localStorage.setItem(homeAssistantKey, JSON.stringify(settings));
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
