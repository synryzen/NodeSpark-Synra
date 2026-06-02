export type SynraState = "idle" | "listening" | "thinking" | "speaking" | "offline";

export interface SynraMessage {
  id: string;
  role: "user" | "synra" | "system";
  text: string;
  createdAt: string;
}

export interface ModelSettings {
  endpoint: string;
  model: string;
  apiKey: string;
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
