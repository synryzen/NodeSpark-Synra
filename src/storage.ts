import type { ModelSettings, SynraMemory, VisualSettings } from "./types";
import { DEFAULT_SYNRA_AVATAR_ID } from "./avatar-catalog";

const modelKey = "synraStandalone.modelSettings.v1";
const memoryKey = "synraStandalone.memory.v1";
const visualKey = "synraStandalone.visualSettings.v2";

export function loadModelSettings(): ModelSettings {
  return readJson<ModelSettings>(modelKey, {
    endpoint: "/api/chat",
    model: "server",
    apiKey: ""
  });
}

export function saveModelSettings(settings: ModelSettings): void {
  localStorage.setItem(modelKey, JSON.stringify(settings));
}

export function loadMemory(): SynraMemory {
  return readJson<SynraMemory>(memoryKey, {
    preferredName: "",
    style: "warm, direct, and useful",
    savedFacts: []
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
    controlMode: "manual"
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
