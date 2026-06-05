import { SynraBridgeClient } from "./native-bridge";
import { getSynraExperienceSettings } from "./synra-living-experience";

export type SynraToolPermission = "read" | "draft" | "execute" | "destructive" | "secrets";
export type SynraToolCategory = "workspace" | "workflow" | "run" | "schedule" | "worker" | "device" | "integration" | "credential" | "app" | "assistant" | "diagnostic" | "analytics" | "report" | "web";
export type SynraToolRedactionPolicy = "none" | "secrets" | "payloads" | "full";
export type SynraToolStatus = "success" | "error" | "denied" | "pending_confirmation" | "dry_run";

export interface SynraToolDefinition {
  id: string;
  name: string;
  description: string;
  category: SynraToolCategory;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  permission: SynraToolPermission;
  requiresConfirmation: boolean;
  supportsDryRun: boolean;
  supportsUndo: boolean;
  auditEventType: string;
  redactionPolicy: SynraToolRedactionPolicy;
  examples: Array<Record<string, unknown>>;
  disabledReason?: string;
}

export interface SynraToolIntent {
  toolId: string;
  arguments: Record<string, unknown>;
  reason: string;
  riskLevel: SynraToolPermission;
  requiresConfirmation: boolean;
}

export interface SynraToolExecutionResult {
  toolCallId: string;
  toolId: string;
  status: SynraToolStatus;
  startedAt: string;
  finishedAt: string | null;
  summary: string;
  data: Record<string, unknown>;
  safeDisplayData: Record<string, unknown>;
  error: string | null;
  auditEventId: string | null;
  requiresConfirmation: boolean;
  confirmationRequest: SynraConfirmationRequest | null;
  undoToken: SynraUndoToken | null;
}

export interface SynraConfirmationRequest {
  confirmationId: string;
  toolCallId: string;
  toolId: string;
  title: string;
  description: string;
  riskLevel: SynraToolPermission;
  argumentsSummary: Record<string, unknown>;
  expectedEffect: string;
  dryRunSummary: string | null;
  confirmLabel: string;
  cancelLabel: string;
  expiresAt: string;
  toolName?: string;
  reason?: string;
  arguments?: Record<string, unknown>;
}

export type SynraPendingConfirmation = SynraConfirmationRequest;

export interface SynraUndoToken {
  undoToken: string;
  toolCallId: string;
  description: string;
  expiresAt: string;
  riskLevel: SynraToolPermission;
}

const READ_SCHEMA = { type: "object", additionalProperties: false };
const stringSchema = (field: string) => ({ type: "object", properties: { [field]: { type: "string" } }, required: [field], additionalProperties: true });

export const SYNRA_TOOL_DEFINITIONS: SynraToolDefinition[] = [
  tool("app.snapshot", "App snapshot", "Return the current safe NodeSparkHub app snapshot summary.", "app", "read", false),
  tool("app.openPanel", "Open app panel", "Open a safe app panel.", "app", "read", false, stringSchema("panel")),
  tool("app.showWorkflow", "Show workflow", "Navigate to a workflow.", "app", "read", false, stringSchema("workflow")),
  tool("app.showRun", "Show run", "Navigate to a run/log view.", "app", "read", false, stringSchema("runId")),
  tool("app.showAssistantDebug", "Show assistant debug", "Open Synra debug.", "assistant", "read", false),
  tool("hub.status", "Hub status", "Return safe Hub status.", "app", "read", false),
  tool("hub.healthCheck", "Hub health check", "Return safe Hub diagnostics.", "diagnostic", "read", false),
  tool("hub.summarize", "Summarize Hub", "Summarize current Hub health and activity.", "diagnostic", "read", false),
  tool("analytics.summary", "Executive analytics summary", "Return redacted executive operations dashboard metrics for the current workspace.", "analytics", "read", false, READ_SCHEMA, "payloads"),
  tool("analytics.workflow", "Workflow analytics", "Return workflow run trends, failure counts, top workflows, and estimated time saved.", "analytics", "read", false, stringSchema("workflow"), "payloads"),
  tool("analytics.runtimeHealth", "Runtime health analytics", "Return runtime, scheduler, queue, and worker health analytics.", "analytics", "read", false, READ_SCHEMA, "payloads"),
  tool("analytics.workspace", "Workspace analytics", "Return workspace/team activity and permission health without restricted resources.", "analytics", "read", false, READ_SCHEMA, "payloads"),
  tool("analytics.integrations", "Integration analytics", "Return integration and credential health using metadata only.", "analytics", "read", false, READ_SCHEMA, "secrets"),
  tool("analytics.recommendations", "Operations recommendations", "Return rate-limited, read-only proactive operations insights.", "analytics", "read", false, READ_SCHEMA, "payloads"),
  tool("report.generateExecutiveSummary", "Generate executive report", "Generate a redacted executive operations report for the current workspace.", "report", "read", false, READ_SCHEMA, "payloads"),
  tool("report.exportRedacted", "Export redacted analytics report", "Return a redacted report payload with no raw secrets or raw payloads.", "report", "read", false, READ_SCHEMA, "payloads"),
  tool("report.comparePeriods", "Compare analytics periods", "Compare analytics windows where persisted history is available.", "report", "read", false, { type: "object", properties: { windowA: { type: "string" }, windowB: { type: "string" } }, additionalProperties: true }, "payloads"),
  tool("web.search", "Search public web", "Search read-only public web results with source URLs and timestamps.", "web", "read", false, stringSchema("query"), "payloads"),
  tool("web.fetchPage", "Fetch public page", "Fetch a public HTTP(S) page without forms, login browsing, or hidden credentials.", "web", "read", false, stringSchema("url"), "payloads"),
  tool("web.summarizePage", "Summarize public page", "Summarize a public page with citations and access timestamp.", "web", "read", false, stringSchema("url"), "payloads"),
  tool("web.researchQuestion", "Research question", "Research a question from public sources and return cited source summaries.", "web", "read", false, stringSchema("question"), "payloads"),
  tool("web.checkStatusPage", "Check status page", "Read a public status page and summarize current public health signals.", "web", "read", false, stringSchema("url"), "payloads"),
  tool("web.monitorPublicPage", "Monitor public page", "Create a confirmation-gated public page monitoring proposal; no login or silent browsing.", "web", "execute", true, stringSchema("url"), "payloads"),
  tool("web.downloadFile", "Download file", "Downloads are disabled by default and never executed by Synra.", "web", "execute", true, stringSchema("url"), "full", "Web downloads are disabled unless a future release adds a reviewed, confirmation-gated download vault."),
  tool("web.extractDocumentation", "Extract documentation", "Extract headings, snippets, and cited documentation structure from a public page.", "web", "read", false, stringSchema("url"), "payloads"),
  tool("web.createWorkflowFromWebPage", "Draft workflow from web page", "Create a draft-only workflow plan from a public web page. It never runs or activates.", "web", "draft", false, stringSchema("url"), "payloads"),

  tool("workspace.list", "List workspaces", "List safe workspace/company metadata.", "workspace", "read", false),
  tool("workspace.get", "Get workspace", "Get safe workspace details and member summary.", "workspace", "read", false, stringSchema("workspace")),
  tool("workspace.switch", "Switch workspace", "Switch the active workspace after permission is checked.", "workspace", "execute", true, stringSchema("workspace")),
  tool("workspace.create", "Create workspace", "Create a local team-ready workspace.", "workspace", "execute", true, stringSchema("name")),
  tool("workspace.archive", "Archive workspace", "Archive a workspace after strong confirmation.", "workspace", "destructive", true, stringSchema("workspace")),
  tool("workspace.updateSettings", "Update workspace settings", "Update workspace collaboration settings after confirmation.", "workspace", "execute", true),
  tool("member.list", "List workspace members", "List members in the current workspace safely.", "workspace", "read", false),
  tool("member.invite", "Invite member", "Invite a workspace member without exposing private data.", "workspace", "execute", true, stringSchema("email")),
  tool("member.updateRole", "Update member role", "Change a member role after confirmation.", "workspace", "execute", true, stringSchema("member")),
  tool("member.disable", "Disable member", "Disable a workspace member after confirmation.", "workspace", "execute", true, stringSchema("member")),
  tool("member.remove", "Remove member", "Remove a workspace member after strong confirmation.", "workspace", "destructive", true, stringSchema("member")),
  tool("permission.check", "Check permission", "Check whether the current actor can perform an action.", "workspace", "read", false, stringSchema("toolId")),
  tool("permission.explain", "Explain permission", "Explain required permissions for an action.", "workspace", "read", false, stringSchema("toolId")),
  tool("permission.listForActor", "List actor permissions", "List permissions for the current actor or a role.", "workspace", "read", false),

  tool("workflow.list", "List workflows", "List available workflows with safe metadata.", "workflow", "read", false),
  tool("workflow.get", "Get workflow", "Get safe details for one workflow, excluding secrets.", "workflow", "read", false, stringSchema("workflow")),
  tool("workflow.search", "Search workflows", "Search workflows by safe metadata and text.", "workflow", "read", false, stringSchema("query")),
  tool("workflow.explain", "Explain workflow", "Explain trigger, steps, side effects, and likely failure points.", "workflow", "read", false, stringSchema("workflow")),
  tool("workflow.validate", "Validate workflow", "Validate structure and missing configuration.", "workflow", "read", false, stringSchema("workflow")),
  tool("workflow.draftFromPrompt", "Draft workflow plan", "Create a draft workflow plan without activating or running it.", "workflow", "draft", false, stringSchema("userGoal")),
  tool("workflow.createDraft", "Create draft workflow", "Create a local draft workflow without running or scheduling it.", "workflow", "draft", false, stringSchema("userGoal")),
  tool("workflow.updateDraft", "Update draft workflow", "Modify a draft workflow only.", "workflow", "draft", false, stringSchema("workflow")),
  tool("workflow.cloneAsDraft", "Clone as draft", "Clone an existing workflow into a draft.", "workflow", "draft", false, stringSchema("workflow")),
  tool("workflow.suggestImprovements", "Suggest workflow improvements", "Suggest reliability and safety improvements.", "workflow", "read", false, stringSchema("workflow")),
  tool("workflow.generateTemplate", "Generate workflow template", "Generate a reusable workflow template.", "workflow", "draft", false, stringSchema("userGoal")),
  tool("workflow.getBuilderState", "Get workflow builder state", "Return validation, data-flow preview, and version metadata for a workflow.", "workflow", "read", false, stringSchema("workflow"), "payloads"),
  tool("workflow.testStepDryRun", "Dry-run workflow step", "Preview one workflow step safely without executing external side effects.", "workflow", "read", false, { type: "object", properties: { workflow: { type: "string" }, step: { type: "string" } }, required: ["workflow", "step"], additionalProperties: true }, "payloads"),
  tool("workflow.createVersionSnapshot", "Create workflow snapshot", "Create a local workflow version snapshot without running or activating it.", "workflow", "draft", false, stringSchema("workflow"), "payloads"),
  tool("workflow.listVersions", "List workflow versions", "List workflow version snapshots.", "workflow", "read", false, stringSchema("workflow"), "payloads"),
  tool("workflow.compareVersions", "Compare workflow versions", "Compare two workflow snapshots without changing the workflow.", "workflow", "read", false, { type: "object", properties: { workflow: { type: "string" }, versionA: { type: "string" }, versionB: { type: "string" } }, required: ["workflow"], additionalProperties: true }, "payloads"),
  tool("workflow.restoreVersion", "Restore workflow version", "Restore a workflow snapshot after explicit confirmation.", "workflow", "execute", true, { type: "object", properties: { workflow: { type: "string" }, version: { type: "string" } }, required: ["workflow", "version"], additionalProperties: true }, "payloads"),
  tool("workflow.mapField", "Map workflow field", "Draft a safe field-mapping suggestion without editing live workflow state.", "workflow", "draft", false, { type: "object", properties: { workflow: { type: "string" }, sourceField: { type: "string" }, targetField: { type: "string" } }, required: ["workflow"], additionalProperties: true }, "payloads"),
  tool("workflow.shareAsTemplate", "Share workflow as template", "Create a redacted shareable template from a workflow.", "workflow", "draft", false, stringSchema("workflow"), "payloads"),
  tool("workflow.duplicateToWorkspace", "Duplicate to workspace", "Duplicate a workflow into another workspace as a draft after cross-workspace permission checks.", "workflow", "execute", true, stringSchema("workflow"), "payloads"),
  tool("workflow.exportRedacted", "Export redacted workflow", "Export a redacted workflow package without credentials or secrets.", "workflow", "read", false, stringSchema("workflow"), "payloads"),
  tool("workflow.importRedacted", "Import redacted workflow", "Import a redacted workflow package as a draft only.", "workflow", "draft", false, READ_SCHEMA, "payloads"),
  tool("workflow.run", "Run workflow", "Run an existing workflow after explicit user confirmation.", "workflow", "execute", true, stringSchema("workflow")),
  tool("workflow.activate", "Activate workflow", "Enable a workflow schedule/trigger when supported.", "workflow", "execute", true, stringSchema("workflow")),
  tool("workflow.deactivate", "Deactivate workflow", "Pause future automated runs when supported.", "workflow", "execute", true, stringSchema("workflow")),
  tool("workflow.delete", "Delete workflow", "Delete a workflow after strong confirmation.", "workflow", "destructive", true, stringSchema("workflow")),
  tool("workflow.stopRun", "Stop workflow run", "Request cancellation of a queued or live workflow run after confirmation.", "run", "execute", true, stringSchema("runId")),
  tool("workflow.retryRun", "Retry workflow run", "Retry a previous workflow run after confirmation.", "run", "execute", true, stringSchema("runId")),

  tool("run.listRecent", "List recent runs", "List recent workflow runs.", "run", "read", false),
  tool("run.getSummary", "Get run summary", "Summarize one workflow run.", "run", "read", false, stringSchema("runId")),
  tool("run.getLogs", "Get run logs", "Return redacted logs.", "run", "read", false, stringSchema("runId"), "payloads"),
  tool("run.explainFailure", "Explain run failure", "Explain likely root cause for a failed run.", "run", "read", false, stringSchema("runId")),
  tool("run.suggestFix", "Suggest run fix", "Draft a safe workflow fix proposal.", "run", "draft", false, stringSchema("runId")),
  tool("run.compare", "Compare runs", "Compare two runs safely.", "run", "read", false, { type: "object", properties: { runIdA: { type: "string" }, runIdB: { type: "string" } }, required: ["runIdA", "runIdB"] }),
  tool("diagnostic.summarizeOvernight", "Summarize overnight activity", "Summarize recent workflow activity.", "diagnostic", "read", false),
  tool("runtime.status", "Runtime status", "Return queue, run lifecycle, scheduler, and worker runtime status.", "diagnostic", "read", false),
  tool("runtime.queue", "Runtime queue", "List queued, running, cancel-requested, and recent runtime lifecycle entries.", "run", "read", false),
  tool("runtime.health", "Runtime health", "Summarize automation runtime, schedule, worker, and recent failure health.", "diagnostic", "read", false),
  tool("runtime.exportRedacted", "Export redacted runtime report", "Return a redacted runtime operations export for troubleshooting.", "diagnostic", "read", false, READ_SCHEMA, "payloads"),

  tool("schedule.list", "List schedules", "List workflow schedules safely.", "schedule", "read", false),
  tool("schedule.get", "Get schedule", "Get schedule details.", "schedule", "read", false, stringSchema("workflow")),
  tool("schedule.createDraft", "Create draft schedule", "Create a schedule proposal without activating it.", "schedule", "draft", false, stringSchema("workflow")),
  tool("schedule.activate", "Activate schedule", "Activate a schedule after confirmation.", "schedule", "execute", true, stringSchema("workflow")),
  tool("schedule.pause", "Pause schedule", "Pause a schedule after confirmation.", "schedule", "execute", true, stringSchema("workflow")),
  tool("schedule.resume", "Resume schedule", "Resume a schedule after confirmation.", "schedule", "execute", true, stringSchema("workflow")),
  tool("schedule.delete", "Delete schedule", "Delete a schedule after strong confirmation.", "schedule", "destructive", true, stringSchema("workflow")),
  tool("schedule.explain", "Explain schedule", "Explain when and why a workflow runs.", "schedule", "read", false, stringSchema("workflow")),
  tool("scheduler.nextRuns", "Next scheduled runs", "Return safe scheduler status and upcoming schedule metadata.", "schedule", "read", false),

  tool("worker.list", "List workers", "List workers safely.", "worker", "read", false),
  tool("worker.getStatus", "Get worker status", "Show safe worker state.", "worker", "read", false, stringSchema("worker")),
  tool("worker.health", "Worker health", "Return safe worker health and configuration warnings.", "worker", "read", false),
  tool("worker.restart", "Restart worker", "Restart a worker if supported.", "worker", "execute", true, stringSchema("worker"), "secrets", "Worker restart is not exposed yet."),
  tool("worker.stop", "Stop worker", "Stop a worker if supported.", "worker", "execute", true, stringSchema("worker"), "secrets", "Worker stop is not exposed yet."),
  tool("worker.explainIssue", "Explain worker issue", "Summarize worker problems.", "worker", "read", false, stringSchema("worker")),

  tool("device.list", "List devices", "List devices safely.", "device", "read", false),
  tool("device.get", "Get device", "Get safe device metadata.", "device", "read", false, stringSchema("device")),
  tool("device.getHealth", "Get device health", "Return safe Synra device health and heartbeat metadata.", "device", "read", false, stringSchema("device")),
  tool("device.enrollTestDevice", "Enroll simulated device", "Register a local simulated Synra client for validation only.", "device", "draft", false, stringSchema("deviceType")),
  tool("device.sendMessage", "Send device message", "Send a Synra text event to a registered device after confirmation.", "device", "execute", true, stringSchema("device")),
  tool("device.showSynra", "Show Synra on device", "Route Synra display/avatar output to a device after confirmation.", "device", "execute", true, stringSchema("device")),
  tool("device.requestVision", "Request device vision", "Request a visible camera/vision event from a device after confirmation. This does not silently capture frames.", "device", "execute", true, stringSchema("device")),
  tool("device.setOutputRoute", "Set output route", "Route Synra text, avatar, or speech output to a device after confirmation.", "device", "execute", true, stringSchema("device")),
  tool("device.updatePermissions", "Update device permissions", "Change Synra device permissions after strong confirmation.", "device", "destructive", true, stringSchema("device")),
  tool("device.rename", "Rename device", "Rename a device when supported.", "device", "execute", true, stringSchema("device"), "secrets", "Device rename is not exposed yet."),
  tool("device.disable", "Disable device", "Disable a Synra mesh device after strong confirmation.", "device", "destructive", true, stringSchema("device")),
  tool("device.remove", "Remove device", "Remove a Synra mesh device after strong confirmation.", "device", "destructive", true, stringSchema("device")),

  tool("integration.list", "List integrations", "List integration names and status without raw secrets.", "integration", "read", false),
  tool("integration.get", "Get integration", "Return one integration definition with safe metadata and setup guidance.", "integration", "read", false, stringSchema("integration")),
  tool("integration.getStatus", "Get integration status", "Return safe integration status.", "integration", "read", false, stringSchema("integration")),
  tool("integration.getHealth", "Get integration health", "Return credential health and connection-test policy for one integration.", "integration", "read", false, stringSchema("integration")),
  tool("integration.findMissing", "Find missing integrations", "Find workflows with missing/unhealthy integrations.", "integration", "read", false),
  tool("integration.findBrokenWorkflows", "Find broken integration workflows", "Find workflows/templates affected by missing, unhealthy, partial, or stubbed integrations.", "integration", "read", false),
  tool("integration.testConnection", "Test integration connection", "Test connection only after confirmation if it sends a request.", "integration", "execute", true, stringSchema("integration"), "secrets", "Provider-specific tests are not safely exposed yet."),
  tool("integration.showSetupGuide", "Show integration setup guide", "Return safe credential setup guidance without raw secrets.", "integration", "read", false, stringSchema("integration")),
  tool("integration.openSetup", "Open integration setup", "Open the setup surface for an integration. Raw secrets are entered only in the secure credential UI.", "integration", "read", false, stringSchema("integration")),
  tool("integration.listWorkflowsUsing", "List workflows using integration", "List workflows/templates that require a given integration.", "integration", "read", false, stringSchema("integration")),
  tool("credential.listMetadata", "List credential metadata", "Return credential metadata only; never raw values.", "credential", "secrets", true, READ_SCHEMA, "full"),
  tool("credential.getMetadata", "Get credential metadata", "Return one credential metadata record only; never raw values.", "credential", "secrets", true, stringSchema("credential"), "full"),
  tool("credential.createPrompt", "Open credential create prompt", "Open a credential setup prompt; the model never receives raw secret values.", "credential", "draft", false, stringSchema("provider"), "full"),
  tool("credential.updatePrompt", "Open credential update prompt", "Open a credential update prompt; the model never receives raw secret values.", "credential", "draft", false, stringSchema("credential"), "full"),
  tool("credential.delete", "Delete credential metadata", "Delete or remove a credential profile after explicit confirmation. Raw secrets are not exposed.", "credential", "destructive", true, stringSchema("credential"), "full"),
  tool("credential.disable", "Disable credential", "Disable a credential profile after explicit confirmation. Raw secrets are not exposed.", "credential", "destructive", true, stringSchema("credential"), "full"),
  tool("credential.checkMissing", "Check missing credentials", "Return workflows that need unconfigured credentials.", "credential", "read", false),

  tool("audit.listWorkspaceEvents", "List workspace audit events", "List redacted workspace audit events.", "diagnostic", "read", false),
  tool("audit.summarizeWorkspaceActivity", "Summarize workspace activity", "Summarize safe workspace activity and denied actions.", "diagnostic", "read", false),
  tool("audit.findDeniedActions", "Find denied actions", "Find recent permission denied attempts.", "diagnostic", "read", false),

  tool("assistant.debugState", "Assistant debug state", "Return Synra assistant state, memory, tool, camera, and mic debug summary.", "assistant", "read", false, READ_SCHEMA, "full"),
  tool("assistant.routeToDevice", "Route assistant to device", "Route Synra output to a registered device after confirmation.", "assistant", "execute", true, stringSchema("device"))
];

function tool(
  id: string,
  name: string,
  description: string,
  category: SynraToolCategory,
  permission: SynraToolPermission,
  requiresConfirmation: boolean,
  inputSchema: Record<string, unknown> = READ_SCHEMA,
  redactionPolicy: SynraToolRedactionPolicy = "secrets",
  disabledReason?: string
): SynraToolDefinition {
  return {
    id,
    name,
    description,
    category,
    inputSchema,
    outputSchema: { type: "object" },
    permission,
    requiresConfirmation,
    supportsDryRun: permission === "draft" || requiresConfirmation,
    supportsUndo: false,
    auditEventType: `synra.tool.${id}`,
    redactionPolicy,
    examples: [],
    disabledReason
  };
}

export class SynraToolRegistryClient {
  private readonly bridge = new SynraBridgeClient();

  definitions(): SynraToolDefinition[] {
    return SYNRA_TOOL_DEFINITIONS.map((definition) => ({ ...definition }));
  }

  async execute(intent: SynraToolIntent, options: { dryRun?: boolean; actor?: "model" | "user" | "system" } = {}): Promise<{ result: SynraToolExecutionResult; confirmation?: SynraPendingConfirmation }> {
    const isWebTool = intent.toolId.startsWith("web.");
    const settings = getSynraExperienceSettings();
    if (isWebTool && settings.webAccessMode === "off") {
      const now = new Date().toISOString();
      return {
        result: {
          toolCallId: makeToolCallId(),
          toolId: intent.toolId,
          status: "denied",
          startedAt: now,
          finishedAt: now,
          summary: "Synra web access is turned off in Settings.",
          data: { webAccessMode: "off", policy: "disabled_by_user" },
          safeDisplayData: { webAccessMode: "off" },
          error: "Web access disabled.",
          auditEventId: null,
          requiresConfirmation: false,
          confirmationRequest: null,
          undoToken: null
        }
      };
    }
    return await this.bridge.executeTool({
      toolId: intent.toolId,
      arguments: intent.arguments || {},
      reason: intent.reason,
      dryRun: options.dryRun || false,
      actor: options.actor || "model",
      forceConfirmation: isWebTool && settings.webAccessMode === "ask_each_time"
    });
  }

  async confirm(toolCallId: string, confirmed: boolean, confirmationId?: string): Promise<SynraToolExecutionResult> {
    return await this.bridge.confirmTool({ toolCallId, confirmationId, confirmed, confirmedBy: "user_ui" });
  }
}

function makeToolCallId(): string {
  return globalThis.crypto?.randomUUID?.() || `tool_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function isRiskyPermission(permission: SynraToolPermission): boolean {
  return permission === "execute" || permission === "destructive" || permission === "secrets";
}
