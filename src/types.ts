export type SynraState = "idle" | "listening" | "thinking" | "speaking" | "offline";

export interface SynraMessage {
  id: string;
  role: "user" | "synra" | "system";
  text: string;
  createdAt: string;
}

export type ModelProvider = "server" | "openAICompatible" | "localHTTP";

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
}

export interface VisualSettings {
  avatarId: string;
  motionId: string;
  motionCategoryId: string;
  backgroundId: string;
  controlMode: "live" | "manual";
}
