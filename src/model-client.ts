import type { ModelSettings, SynraMessage, SynraMemory } from "./types";

export type SynraRequestIntent = "conversation" | "vision" | "tool" | "memory" | "nodespark";

export type SynraRequestRoute = {
  intent: SynraRequestIntent;
  path: "direct" | "model";
  label: string;
};

export function classifySynraRequest(text: string): SynraRequestRoute {
  const normalized = text.trim().toLowerCase();
  if (
    /\b(camera|vision|see|look|image|picture|photo|eyes)\b/.test(normalized) ||
    /\b(what can you see|what do you see|what are you seeing|can you see|what am i holding|what am i wearing|what is in my hand|what's in my hand|describe what you see|describe the scene|look through the camera)\b/.test(normalized)
  ) {
    return { intent: "vision", path: "direct", label: "vision" };
  }
  if (/\b(light|lights|lamp|lamps|smart home|home assistant|hue|matter|mqtt)\b/.test(normalized)) {
    return { intent: "tool", path: "direct", label: "tool" };
  }
  if (/\b(remember|memory|forget|preference|prefer)\b/.test(normalized)) {
    return { intent: "memory", path: "direct", label: "memory" };
  }
  if (/\b(nodespark|node spark|nodesparkhub|node spark hub|workflow|automation)\b/.test(normalized)) {
    return { intent: "nodespark", path: "direct", label: "NodeSpark Command Center" };
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
  if (normalized.includes("hello") || normalized.includes("hi ")) return "I am here. Tell me what you want to build, check, or control, and I will stay with the task.";
  if (normalized.includes("light")) return "Home Assistant control is included in free Synra. Connect the URL, token, default targets, and aliases, then I will stage light or device actions with confirmation.";
  if (normalized.includes("camera") || normalized.includes("vision") || normalized.includes("see")) return "I can keep working with camera status now, and I will attach the current frame to a vision-capable route when one is configured.";
  if (normalized.includes("nodespark") || normalized.includes("node spark")) return "NodeSpark Command Center is an optional subscriber skill. After this device is paired with NodeSparkHub, I can work with workflows, agents, Hub status, runs, and safe confirmations.";
  if (normalized.includes("workflow") || normalized.includes("agent")) return "I can keep working with workflows, agents, Home Assistant, run history, schedules, and confirmations through NodeSparkHub when the Command Center skill is paired.";
  if (normalized.includes("remember")) return "I can remember approved preferences and keep secrets, tokens, raw audio, and camera frames out of memory.";
  if (normalized.includes("status") || normalized.includes("network") || normalized.includes("time")) return "I can check local system, network, and time status directly without waiting on a model.";
  return "I can keep working with direct controls instantly, and deeper reasoning goes through the configured local, Hub, or cloud model route.";
}
