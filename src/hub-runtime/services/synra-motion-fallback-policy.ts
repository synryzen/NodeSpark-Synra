import type { SynraActionIntent } from "./synra-action-catalog";
import type { SynraResolvedMotionRoute } from "./authored-motion";

export type SynraMotionFallbackDecision = {
  useProcedural: boolean;
  reason: string | null;
  fallbackAction: string | null;
  policyId: string;
};

const TEMPORARY_PROCEDURAL_FALLBACK_ACTIONS = new Set([
  "wave",
  "wave_big",
  "wave_shy",
  "point",
  "point_left",
  "point_right",
  "show_panel",
  "settings_open",
  "show_screen",
  "explain",
  "explain_step",
  "teach",
  "present",
  "attentive_present",
  "confirm",
  "nod_confirm",
  "deny",
  "shake_no",
  "confused",
  "confused_tilt",
  "reassure",
  "comfort",
  "concerned",
  "error",
  "error_calm",
  "thinking",
  "focused_ready",
  "wait_hold",
  "success",
  "success_ping",
  "workflow_done",
  "proud",
  "celebrate",
  "happy_bounce",
  "victory_small",
  "victory_big",
  "ta_da"
]);

const TEMPORARY_PROCEDURAL_FALLBACK_FAMILIES = new Set([
  "wave",
  "point",
  "explain",
  "nod",
  "shake",
  "reassure",
  "curious",
  "think",
  "celebrate"
]);

function isReferenceOrLocalInstalledDraft(route: SynraResolvedMotionRoute): boolean {
  const notes = String(route.notes || "").toLowerCase();
  return Boolean(
    route.playable &&
    route.quality === "draft" &&
    !route.fallback &&
    (notes.includes("vroid parity reference-guided") || notes.includes("matthew-supplied local vrma"))
  );
}

export function resolveSynraMotionFallbackDecision(
  action: string,
  intent: SynraActionIntent | null,
  route: SynraResolvedMotionRoute,
  options: {
    bodyPlaybackMode: string;
    proceduralQualityGestures: boolean;
    forceAuthoredDrafts: boolean;
    forceProceduralPerformance?: boolean;
  }
): SynraMotionFallbackDecision {
  if (action === "none") return { useProcedural: false, reason: null, fallbackAction: null, policyId: "none" };
  if (options.bodyPlaybackMode !== "hybrid") return { useProcedural: false, reason: null, fallbackAction: null, policyId: "playground-authored" };
  if (options.forceProceduralPerformance) {
    return {
      useProcedural: true,
      reason: `forced procedural performance for action "${action}" through developer control`,
      fallbackAction: route.fallback,
      policyId: "forced-procedural-performance"
    };
  }
  if (options.forceAuthoredDrafts) return { useProcedural: false, reason: null, fallbackAction: null, policyId: "authored-draft-override" };
  if (!intent) return { useProcedural: false, reason: null, fallbackAction: null, policyId: "no-intent" };

  if (isReferenceOrLocalInstalledDraft(route)) {
    return {
      useProcedural: false,
      reason: null,
      fallbackAction: null,
      policyId: "reference-or-local-installed-draft-authored-candidate"
    };
  }

  const isTemporaryFallback =
    TEMPORARY_PROCEDURAL_FALLBACK_ACTIONS.has(action) ||
    TEMPORARY_PROCEDURAL_FALLBACK_FAMILIES.has(intent.family);
  if (!isTemporaryFallback) return { useProcedural: false, reason: null, fallbackAction: null, policyId: "authored-allowed" };

  if ((route.quality === "approved" || route.quality === "ready") && Boolean(route.visualQaApprovedAt)) {
    return { useProcedural: false, reason: null, fallbackAction: null, policyId: `${route.quality}-authored` };
  }

  if (!route.playable && route.fallback) {
    return {
      useProcedural: true,
      policyId: "missing-authored-clip-procedural-fallback",
      fallbackAction: route.fallback,
      reason: `authored route for action "${action}" is unavailable; using manifest fallback "${route.fallback}"`
    };
  }

  if (options.proceduralQualityGestures || route.fallback) {
    const clipLabel = route.clipId ? ` clip "${route.clipId}"` : "";
    const quality = route.quality ? ` quality "${route.quality}"` : " unqualified";
    const fallback = route.fallback ? `; manifest fallback "${route.fallback}"` : "";
    return {
      useProcedural: true,
      policyId: "draft-motion-procedural-fallback",
      fallbackAction: route.fallback,
      reason: `temporary procedural fallback for ${intent.family} action "${action}"${clipLabel}${quality}; visual QA approval missing${fallback}`
    };
  }

  return { useProcedural: false, reason: null, fallbackAction: null, policyId: "authored-draft-no-fallback" };
}
