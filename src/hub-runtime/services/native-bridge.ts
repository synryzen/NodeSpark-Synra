import type { AssistantCommandPayload, AssistantCommandResponse } from "../types/state";
import type { SynraToolExecutionResult, SynraPendingConfirmation } from "./synra-tool-registry";

interface NativeBridge {
  command?: (payload: AssistantCommandPayload) => Promise<AssistantCommandResponse>;
  runWorkflow?: (payload: AssistantCommandPayload) => Promise<AssistantCommandResponse>;
  speak?: (payload: { text: string }) => Promise<{ ok?: boolean; error?: string; provider?: string; durationMs?: number; estimatedDurationMs?: number; duplicateSuppressed?: boolean }>;
  microphone?: (payload: { enabled: boolean }) => Promise<{ ok?: boolean; status?: string; error?: string }>;
  camera?: (payload: { enabled: boolean }) => Promise<{ ok?: boolean; status?: string; error?: string }>;
  setState?: (payload: unknown) => Promise<{ ok?: boolean; error?: string }>;
  snapshot?: () => Promise<{ state?: AssistantCommandResponse["state"] }>;
  tool?: (payload: { toolId: string; arguments?: Record<string, unknown>; reason?: string; dryRun?: boolean; actor?: string; forceConfirmation?: boolean }) => Promise<{
    ok?: boolean;
    result?: SynraToolExecutionResult;
    confirmation?: SynraPendingConfirmation;
    error?: string;
  }>;
  confirmTool?: (payload: { toolCallId: string; confirmationId?: string; confirmed: boolean; confirmedBy?: string }) => Promise<{
    ok?: boolean;
    result?: SynraToolExecutionResult;
    error?: string;
  }>;
  assistantDebug?: () => Promise<{ ok?: boolean; debug?: Record<string, unknown>; error?: string }>;
  modelStatus?: () => Promise<{ ok?: boolean; modelStatus?: Record<string, unknown>; error?: string }>;
  clearMemory?: () => Promise<{ ok?: boolean; status?: string; error?: string }>;
  referenceMotion?: {
    pickFile?: () => Promise<{
      ok?: boolean;
      canceled?: boolean;
      error?: string;
      referenceMotion?: {
        source?: string;
        fileName?: string;
        fileSize?: number;
        selectedAt?: string;
        dataUrl?: string;
      };
    }>;
    pickFolder?: () => Promise<{
      ok?: boolean;
      canceled?: boolean;
      error?: string;
      folder?: {
        source?: string;
        folderName?: string;
        selectedAt?: string;
        files?: Array<{
          fileName?: string;
          relativePath?: string;
          fileSize?: number;
          dataUrl?: string;
        }>;
      };
    }>;
  };
}

export interface SynraNativeSpeechResult {
  handled: boolean;
  provider: string | null;
  bridgeElapsedMs: number;
  durationMs: number | null;
  duplicateSuppressed: boolean;
}

declare global {
  interface Window {
    NodeSparkHubNative?: NativeBridge;
  }
}

async function postJson(path: string, payload: unknown): Promise<AssistantCommandResponse> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? (await response.json()) as AssistantCommandResponse
    : {};
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `${path} failed`);
  }
  return data;
}

function canUseHttpFallback(): boolean {
  const protocol = window.location.protocol.toLowerCase();
  return protocol === "http:" || protocol === "https:";
}

export class SynraBridgeClient {
  hasNativeBridge(): boolean {
    return Boolean(window.NodeSparkHubNative?.command);
  }

  hasNativeMicrophone(): boolean {
    return Boolean(window.NodeSparkHubNative?.microphone);
  }

  hasNativeCamera(): boolean {
    return Boolean(window.NodeSparkHubNative?.camera);
  }

  async snapshot(): Promise<AssistantCommandResponse["state"] | null> {
    if (!window.NodeSparkHubNative?.snapshot) return null;
    const data = await window.NodeSparkHubNative.snapshot();
    return data?.state ?? null;
  }

  async fetchState(): Promise<AssistantCommandResponse["state"] | null> {
    if (window.NodeSparkHubNative?.snapshot) {
      const native = await this.snapshot();
      if (native) return native;
    }
    if (!canUseHttpFallback()) return null;
    const response = await fetch("/api/state", { cache: "no-store" });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("application/json")) return null;
    const data = (await response.json()) as { ok?: boolean; state?: AssistantCommandResponse["state"] };
    return data.ok === false ? null : data.state ?? null;
  }

  async sendAssistant(payload: AssistantCommandPayload): Promise<AssistantCommandResponse> {
    if (window.NodeSparkHubNative?.command) {
      return await window.NodeSparkHubNative.command(payload);
    }
    if (!canUseHttpFallback()) {
      throw new Error("Native bridge unavailable in bundled runtime.");
    }
    if (payload.image) {
      return await postJson("/api/vision", payload);
    }
    return await postJson("/api/command", payload);
  }

  async runWorkflow(payload: AssistantCommandPayload): Promise<AssistantCommandResponse> {
    if (window.NodeSparkHubNative?.runWorkflow) {
      return await window.NodeSparkHubNative.runWorkflow(payload);
    }
    if (!canUseHttpFallback()) {
      throw new Error("Native bridge unavailable in bundled runtime.");
    }
    return await postJson("/api/command", payload);
  }

  async setRemoteState(payload: unknown): Promise<void> {
    if (window.NodeSparkHubNative?.setState) {
      const response = await window.NodeSparkHubNative.setState(payload);
      if (response?.ok === false) throw new Error(response.error || "Native state sync failed.");
      return;
    }
    if (!canUseHttpFallback()) return;
    await postJson("/api/state", payload);
  }

  async speak(text: string): Promise<SynraNativeSpeechResult> {
    if (!window.NodeSparkHubNative?.speak) {
      return {
        handled: false,
        provider: null,
        bridgeElapsedMs: 0,
        durationMs: null,
        duplicateSuppressed: false
      };
    }
    const startedAt = performance.now();
    const response = await window.NodeSparkHubNative.speak({ text });
    if (response?.ok === false) throw new Error(response.error || "Native speech failed.");
    return {
      handled: true,
      provider: typeof response?.provider === "string" ? response.provider : null,
      bridgeElapsedMs: Math.round(performance.now() - startedAt),
      durationMs: typeof response?.durationMs === "number"
        ? response.durationMs
        : typeof response?.estimatedDurationMs === "number"
          ? response.estimatedDurationMs
          : null,
      duplicateSuppressed: response?.duplicateSuppressed === true
    };
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<string> {
    if (!window.NodeSparkHubNative?.microphone) {
      throw new Error("Native microphone bridge unavailable.");
    }
    const response = await window.NodeSparkHubNative.microphone({ enabled });
    if (response?.ok === false) throw new Error(response.error || "Native microphone failed.");
    return response?.status || (enabled ? "Mic on" : "Mic off");
  }

  async setCameraEnabled(enabled: boolean): Promise<string> {
    if (!window.NodeSparkHubNative?.camera) {
      throw new Error("Native camera bridge unavailable.");
    }
    const response = await window.NodeSparkHubNative.camera({ enabled });
    if (response?.ok === false) throw new Error(response.error || "Native camera failed.");
    return response?.status || (enabled ? "Camera on" : "Camera off");
  }

  async executeTool(payload: { toolId: string; arguments?: Record<string, unknown>; reason?: string; dryRun?: boolean; actor?: string; forceConfirmation?: boolean }): Promise<{
    result: SynraToolExecutionResult;
    confirmation?: SynraPendingConfirmation;
  }> {
    if (!window.NodeSparkHubNative?.tool) throw new Error("Native Synra tool bridge unavailable.");
    const response = await window.NodeSparkHubNative.tool(payload);
    if (response?.ok === false || !response?.result) throw new Error(response?.error || "Synra tool call failed.");
    return { result: response.result, confirmation: response.confirmation };
  }

  async confirmTool(payload: { toolCallId: string; confirmationId?: string; confirmed: boolean; confirmedBy?: string }): Promise<SynraToolExecutionResult> {
    if (!window.NodeSparkHubNative?.confirmTool) throw new Error("Native Synra confirmation bridge unavailable.");
    const response = await window.NodeSparkHubNative.confirmTool(payload);
    if (response?.ok === false || !response?.result) throw new Error(response?.error || "Synra confirmation failed.");
    return response.result;
  }

  async assistantDebug(): Promise<Record<string, unknown> | null> {
    if (!window.NodeSparkHubNative?.assistantDebug) return null;
    const response = await window.NodeSparkHubNative.assistantDebug();
    if (response?.ok === false) throw new Error(response.error || "Synra debug bridge failed.");
    return response?.debug || null;
  }

  async modelStatus(): Promise<Record<string, unknown> | null> {
    if (!window.NodeSparkHubNative?.modelStatus) return null;
    const response = await window.NodeSparkHubNative.modelStatus();
    if (response?.ok === false) throw new Error(response.error || "Synra model status bridge failed.");
    return response?.modelStatus || null;
  }

  async clearMemory(): Promise<string> {
    if (!window.NodeSparkHubNative?.clearMemory) return "Local Synra memory cleared.";
    const response = await window.NodeSparkHubNative.clearMemory();
    if (response?.ok === false) throw new Error(response.error || "Synra memory clear failed.");
    return response?.status || "Synra memory cleared.";
  }
}
