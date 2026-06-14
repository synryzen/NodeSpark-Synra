export type SynraAgentCategory =
  | "workflow"
  | "research"
  | "home"
  | "monitoring"
  | "support"
  | "briefing"
  | "companion"
  | "custom"
  | string;

export type SynraAgentStatus = "draft" | "active" | "paused" | "archived" | string;

export type SynraAgentRunStatus =
  | "queued"
  | "running"
  | "waitingForConfirmation"
  | "completed"
  | "failed"
  | "cancellationRequested"
  | "cancelled"
  | string;

export type SynraAgentScheduleMode = "manual" | "scheduled" | "eventDriven" | "alwaysOn" | string;
export type SynraAgentWebAccessPolicy = "off" | "askEachTime" | "readOnlyPublic" | string;
export type SynraAgentConfirmationPolicy =
  | "alwaysAsk"
  | "confirmStateChangingActions"
  | "confirmDestructiveActions"
  | "neverForReadOnly"
  | string;

export interface SynraAgentScheduleHint {
  mode: SynraAgentScheduleMode;
  label?: string | null;
  cronExpression?: string | null;
  timeZoneID?: string | null;
  runInput?: string | null;
  skipIfRunning?: boolean | null;
}

export interface SynraAgentScheduleStatus {
  agentID: string;
  enabled: boolean;
  mode: SynraAgentScheduleMode;
  label?: string | null;
  cronExpression?: string | null;
  timeZoneID?: string | null;
  runInput?: string | null;
  skipIfRunning: boolean;
  nextRunAt?: string | null;
  lastScheduledRunAt?: string | null;
  lastScheduledRunID?: string | null;
  lastScheduledRunStatus?: string | null;
  lastError?: string | null;
  loopActive: boolean;
}

export interface SynraAgentCredentialRequirement {
  id: string;
  serviceKey: string;
  displayName: string;
  required: boolean;
  configured: boolean;
  setupHint?: string | null;
}

export interface SynraAgentToolPolicy {
  allowedToolIDs: string[];
  deniedToolIDs: string[];
  webAccess: SynraAgentWebAccessPolicy;
  confirmationPolicy: SynraAgentConfirmationPolicy;
  canRunWorkflows: boolean;
  canEditWorkflows: boolean;
  canUseDeviceActions: boolean;
  canAccessPrivatePayloads: boolean;
  maxToolCallsPerRun: number;
}

export interface SynraAgentTemplate {
  id: string;
  name: string;
  summary: string;
  instructions: string;
  iconName: string;
  category: SynraAgentCategory;
  toolPolicy: SynraAgentToolPolicy;
  credentialRequirements: SynraAgentCredentialRequirement[];
  scheduleHint?: SynraAgentScheduleHint | null;
  recommendedModelRouteID?: string | null;
}

export interface SynraAgent {
  id: string;
  templateID?: string | null;
  name: string;
  summary: string;
  instructions: string;
  iconName: string;
  category: SynraAgentCategory;
  status: SynraAgentStatus;
  modelRouteID?: string | null;
  toolPolicy: SynraAgentToolPolicy;
  credentialRequirements: SynraAgentCredentialRequirement[];
  scheduleHint?: SynraAgentScheduleHint | null;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface SynraAgentRunRequest {
  agentID: string;
  input: string;
  context: Record<string, string>;
  requestedByDeviceID?: string | null;
  dryRun: boolean;
}

export type SynraAgentEventKind =
  | "queued"
  | "started"
  | "message"
  | "toolPlanned"
  | "toolStarted"
  | "toolCompleted"
  | "confirmationRequested"
  | "confirmationResolved"
  | "completed"
  | "failed"
  | "cancellationRequested"
  | "cancelled"
  | string;

export interface SynraAgentEventPayload {
  summary?: string | null;
  safeData: Record<string, string>;
}

export interface SynraAgentRunEvent {
  id: string;
  runID: string;
  kind: SynraAgentEventKind;
  message: string;
  payload?: SynraAgentEventPayload | null;
  createdAt: string;
}

export interface SynraAgentRunOutput {
  summary: string;
  safeData: Record<string, string>;
}

export interface SynraAgentRunError {
  code: string;
  message: string;
  recoverySuggestion?: string | null;
}

export interface SynraAgentRun {
  id: string;
  agentID: string;
  status: SynraAgentRunStatus;
  request: SynraAgentRunRequest;
  events: SynraAgentRunEvent[];
  output?: SynraAgentRunOutput | null;
  error?: SynraAgentRunError | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt: string;
}

export interface SynraAgentCreateFromTemplateRequest {
  templateID: string;
  name?: string | null;
  modelRouteID?: string | null;
  metadata?: Record<string, string> | null;
}

export type SynraAgentBridgeOperation =
  | "agent.listTemplates"
  | "agent.list"
  | "agent.scheduleStatus"
  | "agent.run"
  | "agent.getRun"
  | "agent.cancelRun";

export interface SynraAgentBridgeRequest {
  operation: SynraAgentBridgeOperation;
  agentID?: string;
  runID?: string;
  request?: SynraAgentRunRequest;
}

export interface SynraAgentBridgeResponse {
  ok?: boolean;
  templates?: SynraAgentTemplate[];
  agents?: SynraAgent[];
  scheduleStatus?: SynraAgentScheduleStatus;
  run?: SynraAgentRun;
  error?: string;
}
