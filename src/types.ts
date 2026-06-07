export type SynraState = "idle" | "listening" | "thinking" | "speaking" | "offline";

export interface SynraMessage {
  id: string;
  role: "user" | "synra" | "system";
  text: string;
  createdAt: string;
}

export type ModelProvider = "server" | "openAICompatible" | "localHTTP";
export type RenderQuality = "performance" | "balanced" | "sharp";
export type VoiceProvider = "browser" | "elevenLabs";
export type NodeSparkAccess = "locked" | "subscriber";
export type SynraSkillMode = "hybrid" | "homeAssistant" | "nodeSparkHub";
export type WakeWordMode = "off" | "local";
export type ScreenTimeoutMinutes = 10 | 15 | 30 | 60 | 0;

export interface ModelSettings {
  provider: ModelProvider;
  endpoint: string;
  model: string;
  apiKey: string;
  temperature: number;
  systemPrompt: string;
}

export interface SynraMemory {
  preferredName: string;
  style: string;
  savedFacts: string[];
  routines: string[];
  devices: string[];
  rooms: string[];
  preferences: string[];
}

export interface KnownUserProfile {
  id: string;
  name: string;
  relationship: string;
  faceSamples: string[];
  recognitionEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanionSettings {
  setupComplete: boolean;
  ownerName: string;
  wakeWordMode: WakeWordMode;
  wakePhrase: string;
  screenTimeoutMinutes: ScreenTimeoutMinutes;
  allowAlwaysListening: boolean;
  allowCameraRecognition: boolean;
  allowFaceSampleStorage: boolean;
  allowMemorySuggestions: boolean;
  knownUsers: KnownUserProfile[];
}

export interface VoiceSettings {
  provider: VoiceProvider;
  browserVoiceURI: string;
  browserVoiceName: string;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  elevenLabsVoiceName: string;
  elevenLabsModelId: string;
  elevenLabsOutputFormat: string;
  elevenLabsStability: number;
  elevenLabsSimilarityBoost: number;
}

export interface ProductSettings {
  synraSkillMode: SynraSkillMode;
  nodeSparkAccess: NodeSparkAccess;
  nodeSparkHubUrl: string;
  nodeSparkDeviceId: string;
  nodeSparkDeviceName: string;
  nodeSparkHubId: string;
  nodeSparkDeviceToken: string;
  nodeSparkTokenExpiresAt: string;
}

export interface HomeAssistantSettings {
  enabled: boolean;
  url: string;
  token: string;
  defaultLightEntity: string;
  knownEntities: HomeAssistantEntity[];
}

export interface HomeAssistantEntity {
  entityId: string;
  name: string;
  domain: string;
}

export interface VisualSettings {
  avatarId: string;
  motionId: string;
  motionCategoryId: string;
  backgroundId: string;
  controlMode: "live" | "manual";
  renderQuality: RenderQuality;
}
