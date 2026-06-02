import type { ModelSettings, SynraMessage, SynraMemory } from "./types";

export async function askModel(settings: ModelSettings, memory: SynraMemory, messages: SynraMessage[]): Promise<string> {
  const endpoint = settings.endpoint.trim();
  const model = settings.model.trim();
  if (!endpoint) {
    throw new Error("No model endpoint is configured.");
  }

  const recent = messages.slice(-10).map((message) => ({
    role: message.role === "synra" ? "assistant" : message.role,
    content: message.text
  }));

  const isServerChat = endpoint === "/api/chat" || endpoint.endsWith("/api/chat");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(!isServerChat && settings.apiKey.trim() ? { Authorization: `Bearer ${settings.apiKey.trim()}` } : {})
    },
    body: JSON.stringify(
      isServerChat
        ? {
            messages,
            memory
          }
        : {
            model,
            temperature: 0.7,
            messages: [
        {
          role: "system",
          content: [
            "You are Synra, a warm, vivid, practical companion AI assistant.",
            "Be concise, emotionally present, and useful.",
            "Never claim to control devices unless a configured tool confirms it.",
            `User style preference: ${memory.style || "warm, direct, and useful"}.`,
            memory.preferredName ? `Preferred user name: ${memory.preferredName}.` : "",
            memory.savedFacts.length ? `Remembered facts: ${memory.savedFacts.slice(-8).join("; ")}` : ""
          ]
            .filter(Boolean)
            .join("\n")
        },
        ...recent
            ]
          }
    )
  });

  if (!response.ok) {
    throw new Error(`Model request failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as { ok?: boolean; error?: string; text?: string; choices?: Array<{ message?: { content?: string } }> };
  if (isServerChat && data.ok === false) {
    throw new Error(data.error || "Server-side Synra model is unavailable.");
  }
  const text = (isServerChat ? data.text : data.choices?.[0]?.message?.content)?.trim();
  if (!text) throw new Error("Model returned no text.");
  return text;
}

export function localSynraReply(text: string): string {
  const normalized = text.toLowerCase();
  if (normalized.includes("hello") || normalized.includes("hi ")) return "I am here. Tell me what you want to build, check, or control.";
  if (normalized.includes("light")) return "I can become your smart-home companion. First we need to connect a Home Assistant, Hue, Matter, MQTT, or webhook tool.";
  if (normalized.includes("nodespark")) return "NodeSpark can be one optional skill for me later. I do not need it to be present to help you.";
  if (normalized.includes("remember")) return "I can remember preferences once you approve them. I will keep secrets, tokens, raw audio, and camera frames out of memory.";
  return "I can help with that. Connect a model endpoint for deeper reasoning, or keep using my local companion path for direct guidance.";
}
