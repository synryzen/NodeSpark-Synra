import type { SynraActionName, SynraExpression, SynraMode } from "./avatar";

export interface SynraCard {
  title: string;
  body: string;
  detail: string;
  style: "info" | "listening" | "thinking" | "voice" | "success" | "warning" | "error" | "workflow";
  progress?: number;
}

export interface SynraVisualState {
  mode: SynraMode | "success" | "warning" | "error" | "workflow_running";
  expression: SynraExpression | "attentive" | "bright" | "confused" | "blush" | "reassure" | "delighted";
  gesture: string;
  message: string;
  subtitle: string;
  card: SynraCard;
  speech_text?: string;
  assistant_state?: unknown;
  directive?: unknown;
  confirmation?: unknown;
  tool_result?: unknown;
  debug?: unknown;
}

export interface AssistantCommandPayload {
  id: string;
  type: "assistant" | "runWorkflow";
  text?: string;
  image?: string;
  workflowName?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  rollingSummary?: string;
  workingMemory?: unknown;
  longTermMemory?: unknown;
  memoryPolicy?: unknown;
  retrievedMemories?: unknown;
  assistantState?: unknown;
  transcriptContext?: unknown;
  visionContext?: unknown;
  multimodalContext?: unknown;
}

export interface AssistantCommandResponse {
  ok?: boolean;
  state?: Partial<SynraVisualState>;
  speech?: string;
  error?: string;
  debug?: unknown;
  confirmation?: unknown;
  toolResults?: unknown;
}

export interface SynraToolPlanItem {
  toolId: string;
  arguments?: Record<string, unknown>;
  reason: string;
  riskLevel?: "read" | "draft" | "execute" | "destructive" | "secrets";
}

export interface MotionDirective {
  mode?: SynraMode | "success" | "warning" | "error" | "workflow_running";
  gesture?: string;
  expression?: SynraVisualState["expression"];
}

export interface PlannedBehavior {
  expression: SynraVisualState["expression"];
  gesture: string;
  speakingStyle: "ready" | "soft" | "playful" | "responsive";
}

export interface RuntimeActionMapResult {
  action: SynraActionName;
  mode?: SynraMode;
}
