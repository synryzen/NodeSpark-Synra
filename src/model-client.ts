import type { ModelSettings, SynraMessage, SynraMemory } from "./types";

export type SynraRequestIntent = "conversation" | "vision" | "tool" | "memory" | "nodespark";

export type SynraRequestRoute = {
  intent: SynraRequestIntent;
  path: "direct" | "model";
  label: string;
};

export function classifySynraRequest(text: string): SynraRequestRoute {
  const normalized = text.trim().toLowerCase();
  if (/\b(camera|vision|see|look|image|picture|photo|eyes)\b/.test(normalized)) {
    return { intent: "vision", path: "direct", label: "vision" };
  }
  if (/\b(light|lights|lamp|lamps|smart home|home assistant|hue|matter|mqtt)\b/.test(normalized)) {
    return { intent: "tool", path: "direct", label: "tool" };
  }
  if (/\b(remember|memory|forget|preference|prefer)\b/.test(normalized)) {
    return { intent: "memory", path: "direct", label: "memory" };
  }
  if (/\b(nodespark|hub|workflow|automation)\b/.test(normalized)) {
    return { intent: "nodespark", path: "model", label: "NodeSpark skill" };
  }
  return { intent: "conversation", path: "model", label: "conversation" };
}

export async function askModel(settings: ModelSettings, memory: SynraMemory, messages: SynraMessage[], intent: SynraRequestIntent = "conversation"): Promise<string> {
  const endpoint = settings.endpoint.trim();
  const model = settings.model.trim();
  const provider = resolveProvider(settings);
  if (!endpoint) {
    throw new Error("No model endpoint is configured.");
  }

  const isServerChat = provider === "server" || endpoint === "/api/chat" || endpoint.endsWith("/api/chat");
  const response = await fetch(isServerChat ? endpoint : "/api/external-chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(
      isServerChat
        ? {
            messages,
            memory,
            intent
          }
        : {
            provider,
            endpoint,
            model,
            apiKey: settings.apiKey,
            intent,
            temperature: settings.temperature ?? 0.2,
            systemPrompt: settings.systemPrompt,
            messages,
            memory
          }
    )
  });

  if (!response.ok) {
    throw new Error(`Model request failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as { ok?: boolean; error?: string; text?: string; choices?: Array<{ message?: { content?: string } }> };
  if (data.ok === false) {
    throw new Error(data.error || "Server-side Synra model is unavailable.");
  }
  const text = (data.text || data.choices?.[0]?.message?.content)?.trim();
  if (!text) throw new Error("Model returned no text.");
  return text;
}

function resolveProvider(settings: ModelSettings): ModelSettings["provider"] {
  return settings.provider === "openAICompatible" || settings.provider === "localHTTP" || settings.provider === "server" ? settings.provider : "server";
}

export function localSynraReply(text: string): string {
  const normalized = text.toLowerCase();
  if (normalized.includes("hello") || normalized.includes("hi ")) return "I am here. Tell me what you want to build, check, or control.";
  if (normalized.includes("light")) return "I can become your smart-home companion. First we need to connect a Home Assistant, Hue, Matter, MQTT, or webhook tool.";
  if (normalized.includes("camera") || normalized.includes("vision") || normalized.includes("see")) return "I can report camera permission and Jetson device status now. Real visual understanding will turn on only after a vision model and camera stream are configured.";
  if (normalized.includes("nodespark")) return "NodeSpark will be an optional skill. I can stay useful by myself, then connect to NodeSpark when you want workflow awareness.";
  if (normalized.includes("remember")) return "I can remember preferences once you approve them. I will keep secrets, tokens, raw audio, and camera frames out of memory.";
  return "I can help with that. My direct controls stay instant, and deeper reasoning goes through the configured local or cloud model.";
}
