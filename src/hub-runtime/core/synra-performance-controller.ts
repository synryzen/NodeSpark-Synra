import type { SynraResolvedMotionRoute } from "../services/authored-motion";
import { getSynraExperienceSettings, intensityMultiplier } from "../services/synra-living-experience";
import type { BoneName, SynraActionName, SynraExpression, SynraMode } from "../types/avatar";
import { createLivingLayerState, isExtremeDemoMotionId, SYNRA_LIVING_PERFORMANCE_ENGINE_MARKER } from "./synra-living-performance-engine";

export const SYNRA_PERFORMANCE_RUNTIME_MARKER = "Synra Character Performance";

export type SynraPerformanceState =
  | "idle"
  | "listening"
  | "hearing_user"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "seeing"
  | "executing_tool"
  | "waiting_for_confirmation"
  | "success"
  | "confused"
  | "error"
  | "offline";

export type SynraPerformanceOption =
  | "enabled"
  | "life"
  | "gaze"
  | "guardrails"
  | "forceProceduralPerformance"
  | "allowDraftAuthoredMotions";

export type SynraPerformanceOptions = Record<SynraPerformanceOption, boolean>;

type PoseBone = (boneName: BoneName, target: { x?: number; y?: number; z?: number }, weight: number) => void;
type ReadBone = (boneName: BoneName) => { x: number; y: number; z: number } | null;

type PerformanceRig = {
  poseBone: PoseBone;
  readBone: ReadBone;
  applyRightArmIk?: (target: { x: number; y: number; z: number }, weight: number) => void;
};

type PerformanceContext = {
  now: number;
  delta: number;
  mode: SynraMode;
  expression: SynraExpression;
  speaking: boolean;
  activeProceduralAction: SynraActionName | null;
  activeAuthoredClip: string | null;
  activeBaseClip: string | null;
  activeGestureClip: string | null;
  lastRoute: SynraResolvedMotionRoute | null;
  fallbackReason: string | null;
};

type GuardrailDecision = {
  applied: boolean;
  reason: string | null;
  action: string | null;
  at: string | null;
};

const OPTION_STORAGE_KEYS: Record<SynraPerformanceOption, string> = {
  enabled: "synraPerformanceLayer",
  life: "synraLifeMotion",
  gaze: "synraPerformanceGaze",
  guardrails: "synraPoseGuardrails",
  forceProceduralPerformance: "synraForceProceduralPerformance",
  allowDraftAuthoredMotions: "synraUseDraftAuthoredMotions"
};

const DEFAULT_OPTIONS: SynraPerformanceOptions = {
  enabled: true,
  life: true,
  gaze: true,
  guardrails: true,
  forceProceduralPerformance: false,
  allowDraftAuthoredMotions: false
};

const BAD_DRAFT_STATE_ACTIONS = new Set([
  "thinking",
  "think",
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

const BAD_DRAFT_STATE_CLIPS = new Set(["Think_Loop", "Emotion_Celebrate", "Emotion_Delighted"]);

function isReferenceOrLocalInstalledDraft(route: SynraResolvedMotionRoute | null): boolean {
  const notes = String(route?.notes || "").toLowerCase();
  return Boolean(
    route?.playable &&
    route.quality === "draft" &&
    !route.fallback &&
    (notes.includes("vroid parity reference-guided") || notes.includes("matthew-supplied local vrma"))
  );
}

export class SynraPerformanceController {
  private options: SynraPerformanceOptions = readPerformanceOptions();
  private state: SynraPerformanceState = "idle";
  private expression: SynraExpression = "soft_smile";
  private requestedAction: string | null = null;
  private currentGesture: string | null = null;
  private currentGazeTarget = "user/camera";
  private authoredClipUsed = false;
  private fallbackUsed = false;
  private fallbackReason: string | null = null;
  private activeProceduralAction: string | null = null;
  private activeAuthoredClip: string | null = null;
  private activeBase = "idle_alive";
  private lastTransitionAt = new Date().toISOString();
  private stateStartedAtMs = performance.now();
  private temporaryStateUntilMs = 0;
  private lastMotionEventAt: string | null = null;
  private lastGuardrail: GuardrailDecision = { applied: false, reason: null, action: null, at: null };
  private blinkState = "natural";
  private nextBlinkAt = performance.now() + 2400;
  private blinkUntil = 0;
  private queuedBlinkCount = 0;
  private lastBlinkStartedAt = 0;
  private nextMicroGazeAt = performance.now() + 4800;
  private microGazeUntil = 0;
  private microGaze = { x: 0, y: 0, z: 0 };
  private nextPostureDriftAt = performance.now() + 7000;
  private postureDriftUntil = 0;
  private postureDrift = { chest: 0, shoulder: 0, weight: 0 };

  setMode(mode: SynraMode): void {
    const next = stateFromMode(mode, this.state);
    if (next !== this.state) this.transition(next);
  }

  setExpression(expression: SynraExpression): void {
    this.expression = expression;
    if (expression === "confused") this.transition("confused");
    if (expression === "reassure") this.transition("error");
    if (expression === "delighted" || expression === "happy") this.transition("success");
  }

  setSpeaking(speaking: boolean): void {
    if (speaking) this.transition("speaking");
    else if (this.state === "speaking") this.transition("idle");
  }

  noteAction(action: string, route: SynraResolvedMotionRoute | null, fallbackReason: string | null): void {
    this.requestedAction = action;
    this.currentGesture = action === "none" ? null : action;
    this.lastMotionEventAt = new Date().toISOString();
    this.activeAuthoredClip = route?.clipId ?? null;
    this.authoredClipUsed = Boolean(route && !fallbackReason);
    this.fallbackUsed = Boolean(fallbackReason);
    this.fallbackReason = fallbackReason;
    const next = isExtremeDemoMotionId(route?.clipId) ? this.state : stateFromAction(action, this.state);
    if (next !== this.state) this.transition(next);
  }

  setOption(option: SynraPerformanceOption, value: boolean): void {
    this.options[option] = value;
    writeBooleanPreference(OPTION_STORAGE_KEYS[option], value);
  }

  getOptions(): SynraPerformanceOptions {
    this.options = readPerformanceOptions();
    return { ...this.options };
  }

  baseLoopDecision(mode: SynraMode, route: SynraResolvedMotionRoute | null): { useAuthored: boolean; reason: string | null } {
    this.options = readPerformanceOptions();
    if (!this.options.enabled) return { useAuthored: true, reason: null };
    if (this.options.allowDraftAuthoredMotions) return { useAuthored: true, reason: null };
    if (isReferenceOrLocalInstalledDraft(route)) return { useAuthored: true, reason: null };
    if (mode === "thinking") {
      return {
        useAuthored: false,
        reason: `using procedural thinking because ${route?.clipId || "mode:thinking"} is draft and the current preview reads as a raised-palm pose`
      };
    }
    return { useAuthored: true, reason: null };
  }

  proceduralOverrideForAction(action: string, route: SynraResolvedMotionRoute | null): { useProcedural: boolean; reason: string; fallbackAction: string | null; policyId: string } | null {
    this.options = readPerformanceOptions();
    if (!this.options.enabled) return null;
    if (this.options.allowDraftAuthoredMotions) return null;
    const routeApproved = Boolean(route && (route.quality === "approved" || route.quality === "ready") && route.visualQaApprovedAt);
    if (isReferenceOrLocalInstalledDraft(route) && !this.options.forceProceduralPerformance) return null;
    const badDraftAction = BAD_DRAFT_STATE_ACTIONS.has(action);
    const badDraftClip = Boolean(route?.clipId && BAD_DRAFT_STATE_CLIPS.has(route.clipId));
    if (!this.options.forceProceduralPerformance && !badDraftAction && !badDraftClip) return null;
    if (routeApproved && !this.options.forceProceduralPerformance) return null;
    const clip = route?.clipId ? ` clip "${route.clipId}"` : "";
    const reason = action === "thinking" || route?.clipId === "Think_Loop"
      ? `using procedural thinking because${clip || " the authored thinking clip"} is not visually approved and reads as a raised-palm/presentation pose`
      : `using procedural ${action} because${clip || " the authored route"} is not visually approved and is guarded from T-pose/airplane-arm state motion`;
    return {
      useProcedural: true,
      fallbackAction: route?.fallback ?? `procedural_${action}`,
      policyId: this.options.forceProceduralPerformance ? "forced-procedural-performance" : "state-performance-guarded-procedural",
      reason
    };
  }

  apply(context: PerformanceContext, rig: PerformanceRig): void {
    this.options = readPerformanceOptions();
    this.activeProceduralAction = context.activeProceduralAction;
    this.activeAuthoredClip = context.activeAuthoredClip;
    this.activeBase = context.activeBaseClip || (context.mode === "idle" ? "idle_alive" : context.mode);
    this.authoredClipUsed = Boolean(context.activeAuthoredClip);
    this.fallbackUsed = Boolean(context.fallbackReason);
    this.fallbackReason = context.fallbackReason;

    if (!this.options.enabled) {
      this.lastGuardrail = { applied: false, reason: null, action: this.requestedAction, at: null };
      return;
    }

    this.returnTemporaryStateToBase(context);
    if (this.options.life) this.applyLife(context, rig.poseBone);
    if (this.options.gaze) this.applyAttention(context, rig.poseBone);
    this.applyStatePosture(context, rig);
    if (this.options.guardrails) this.applyGuardrails(context, rig);
  }

  debugState(): Record<string, unknown> {
    const living = createLivingLayerState({
      lifeLayerActive: this.options.enabled && this.options.life,
      breathing: this.options.enabled && this.options.life,
      blinkState: this.blinkState,
      postureState: this.state,
      gazeTarget: this.currentGazeTarget,
      microGazeActive: performance.now() < this.microGazeUntil,
      postureDriftActive: performance.now() < this.postureDriftUntil,
      oneShotReturnToIdle: this.temporaryStateUntilMs > 0,
      localFullBodyProtected: this.activeAuthoredClip?.startsWith("Local_") ?? false,
      reduceMotion: getSynraExperienceSettings().reduceMotion
    });
    return {
      marker: SYNRA_PERFORMANCE_RUNTIME_MARKER,
      livingPerformanceMarker: SYNRA_LIVING_PERFORMANCE_ENGINE_MARKER,
      living,
      performanceLayerActive: this.options.enabled,
      enabled: this.options.enabled,
      state: this.state,
      currentAssistantState: this.state,
      currentPerformanceState: this.state,
      lifeLayerActive: this.options.enabled && this.options.life,
      breathing: this.options.enabled && this.options.life,
      blinkState: this.blinkState,
      blinkCadence: {
        queued: this.queuedBlinkCount,
        nextBlinkInMs: Math.max(0, Math.round(this.nextBlinkAt - performance.now())),
        lastBlinkAgeMs: this.lastBlinkStartedAt ? Math.max(0, Math.round(performance.now() - this.lastBlinkStartedAt)) : null
      },
      gazeEnabled: this.options.gaze,
      gazeTarget: this.currentGazeTarget,
      currentGazeTarget: this.currentGazeTarget,
      expression: expressionForState(this.state, this.expression),
      currentExpression: expressionForState(this.state, this.expression),
      gesture: this.currentGesture,
      currentGesture: this.currentGesture,
      postureState: this.state,
      posture: this.state,
      requestedAction: this.requestedAction,
      currentAuthoredClip: this.activeAuthoredClip,
      experienceSettings: getSynraExperienceSettings(),
      authoredClipUsed: this.authoredClipUsed,
      activeProceduralAction: this.activeProceduralAction,
      activeBase: this.activeBase,
      fallbackUsed: this.fallbackUsed,
      fallbackReason: this.fallbackReason,
      guardrailApplied: this.lastGuardrail.applied,
      guardrailReason: this.lastGuardrail.reason,
      lastGuardrailDecision: this.lastGuardrail,
      activeBones: poseNotesForState(this.state),
      lastStateTransition: this.lastTransitionAt,
      lastMotionEventTimestamp: this.lastMotionEventAt,
      localStorageSynraUseDraftAuthoredMotions: this.options.allowDraftAuthoredMotions,
      allowDraftAuthoredMotions: this.options.allowDraftAuthoredMotions,
      forceProceduralPerformance: this.options.forceProceduralPerformance,
      options: { ...this.options }
    };
  }

  private transition(state: SynraPerformanceState): void {
    this.state = state;
    this.stateStartedAtMs = performance.now();
    this.temporaryStateUntilMs = temporaryDurationMs(state) > 0 ? this.stateStartedAtMs + temporaryDurationMs(state) : 0;
    this.lastTransitionAt = new Date().toISOString();
    this.currentGazeTarget = gazeTargetForState(state);
  }

  private applyLife(context: PerformanceContext, poseBone: PoseBone): void {
    const settings = getSynraExperienceSettings();
    if (settings.reduceMotion) {
      this.blinkState = "natural";
      return;
    }
    if (!settings.idleAwareness && this.state === "idle") return;
    this.updateLivingTimers(context);
    const motionScale = intensityMultiplier(settings.motionIntensity) * intensityMultiplier(settings.idleMovement) * intensityMultiplier(settings.energy);
    const breath = Math.sin(context.now * 1.06);
    const breathUp = Math.max(0, breath);
    const drift = Math.sin(context.now * 0.34);
    const weightShift = Math.sin(context.now * 0.27 + 1.3);
    const postureWeight = this.postureDriftWeight();
    const chestDrift = this.postureDrift.chest * postureWeight;
    const shoulderDrift = this.postureDrift.shoulder * postureWeight;
    const livingWeight = this.activeAuthoredClip?.startsWith("Local_") ? 0.35 : 1;
    poseBone("spine", { x: (-0.012 - breathUp * 0.012) * motionScale, z: (weightShift * 0.008 + this.postureDrift.weight * postureWeight) * motionScale }, 0.08 * livingWeight);
    poseBone("chest", { x: (-0.018 - breathUp * 0.018 + chestDrift) * motionScale, y: drift * 0.008 * motionScale, z: weightShift * 0.01 * motionScale }, 0.11 * livingWeight);
    poseBone("upperChest", { x: (-0.014 - breathUp * 0.014 + chestDrift * 0.6) * motionScale, y: drift * 0.012 * motionScale, z: weightShift * 0.012 * motionScale }, 0.12 * livingWeight);
    poseBone("leftShoulder", { x: (0.018 + breathUp * 0.008) * motionScale, z: (0.018 + shoulderDrift + weightShift * 0.01) * motionScale }, 0.08 * livingWeight);
    poseBone("rightShoulder", { x: (0.018 + breathUp * 0.008) * motionScale, z: (-0.018 - shoulderDrift + weightShift * 0.01) * motionScale }, 0.08 * livingWeight);
    if (this.state === "idle" || this.state === "listening") {
      poseBone("head", { x: (-0.02 + Math.sin(context.now * 0.42) * 0.018 + this.microGaze.x) * motionScale, y: (Math.sin(context.now * 0.3) * 0.025 + this.microGaze.y) * motionScale, z: this.microGaze.z * motionScale }, 0.08);
    }
  }

  private applyAttention(context: PerformanceContext, poseBone: PoseBone): void {
    const gaze = gazeForState(this.state, context.now);
    this.currentGazeTarget = gaze.label;
    const microWeight = this.microGazeWeight();
    const microLabel = microWeight > 0.01 ? "idle-glance" : gaze.label;
    this.currentGazeTarget = microLabel;
    const mx = this.microGaze.x * microWeight;
    const my = this.microGaze.y * microWeight;
    const mz = this.microGaze.z * microWeight;
    poseBone("neck", { x: gaze.headX * 0.35 + mx * 0.4, y: gaze.headY * 0.32 + my * 0.45, z: gaze.headZ * 0.28 + mz * 0.3 }, gaze.weight * 0.42);
    poseBone("head", { x: gaze.headX + mx, y: gaze.headY + my, z: gaze.headZ + mz }, gaze.weight * 0.58);
    poseBone("leftEye", { x: gaze.eyeX + mx * 0.6, y: gaze.eyeY + my * 0.8 }, gaze.weight * 0.5);
    poseBone("rightEye", { x: gaze.eyeX + mx * 0.6, y: gaze.eyeY + my * 0.8 }, gaze.weight * 0.5);
  }

  private applyStatePosture(context: PerformanceContext, rig: PerformanceRig): void {
    const poseBone = rig.poseBone;
    switch (this.state) {
      case "thinking":
        this.applyThinkingPosture(context, rig);
        break;
      case "speaking":
        this.applySpeakingPosture(context, rig);
        break;
      case "listening":
        this.applyListeningPosture(context, poseBone);
        break;
      case "success":
        this.applySuccessPosture(context, rig);
        break;
      case "confused":
        this.applyConfusedPosture(context, poseBone);
        break;
      case "error":
        this.applyErrorPosture(context, poseBone);
        break;
      case "waiting_for_confirmation":
      case "executing_tool":
      case "seeing":
        this.applyFocusedPosture(context, poseBone);
        break;
      default:
        this.applyIdleRelaxedArms(poseBone, 0.07);
        break;
    }
  }

  private applyThinkingPosture(context: PerformanceContext, rig: PerformanceRig): void {
    const poseBone = rig.poseBone;
    const think = 0.68 + Math.sin(context.now * 1.1) * 0.04;
    poseBone("upperChest", { x: -0.025, y: 0.018, z: 0.014 }, 0.16);
    poseBone("neck", { x: 0.025, y: -0.055, z: 0.025 }, 0.22);
    poseBone("head", { x: 0.055, y: -0.14, z: 0.055 }, 0.3);
    poseBone("rightUpperArm", { x: -0.12, y: 0.04, z: 0.86 }, think);
    poseBone("rightLowerArm", { x: -0.2, y: 0.2, z: -0.58 }, think);
    poseBone("rightHand", { x: -0.1, y: 0.14, z: 0.1 }, think);
    rig.applyRightArmIk?.({ x: -0.12, y: 1.3, z: 0.18 }, 0.48);
    poseBone("leftUpperArm", { x: 0.04, y: -0.02, z: -1.3 }, 0.3);
    poseBone("leftLowerArm", { x: 0.03, y: 0.01, z: -0.22 }, 0.28);
  }

  private applySuccessPosture(context: PerformanceContext, rig: PerformanceRig): void {
    const poseBone = rig.poseBone;
    const pulse = 0.5 + Math.sin(context.now * 2.5) * 0.05;
    poseBone("upperChest", { x: -0.048, y: 0, z: 0 }, 0.28);
    poseBone("head", { x: -0.025, y: 0.02, z: 0 }, 0.26);
    poseBone("rightUpperArm", { x: -0.1, y: -0.04, z: 0.78 }, Math.max(0.82, pulse));
    poseBone("rightLowerArm", { x: -0.22, y: 0.24, z: -0.72 }, Math.max(0.82, pulse));
    poseBone("rightHand", { x: -0.08, y: 0.16, z: 0.08 }, Math.max(0.82, pulse));
    rig.applyRightArmIk?.({ x: -0.14, y: 1.2, z: 0.16 }, 0.52);
    poseBone("leftShoulder", { x: 0.02, y: 0.02, z: 0.02 }, 0.72);
    poseBone("leftUpperArm", { x: 0.04, y: -0.02, z: -1.32 }, 0.86);
    poseBone("leftLowerArm", { x: 0.03, y: 0.02, z: -0.26 }, 0.86);
    poseBone("leftHand", { x: 0.02, y: -0.02, z: -0.04 }, 0.82);
  }

  private applyListeningPosture(context: PerformanceContext, poseBone: PoseBone): void {
    const nod = Math.max(0, Math.sin(context.now * 0.9 - 0.6)) ** 4;
    poseBone("upperChest", { x: -0.035, y: 0, z: 0 }, 0.12);
    poseBone("head", { x: -0.025 + nod * 0.025, y: Math.sin(context.now * 0.38) * 0.025 }, 0.14);
    this.applyIdleRelaxedArms(poseBone, 0.12);
  }

  private applySpeakingPosture(context: PerformanceContext, rig: PerformanceRig): void {
    const poseBone = rig.poseBone;
    const beat = Math.sin(context.now * 2.2);
    poseBone("upperChest", { x: -0.034, y: beat * 0.018, z: -beat * 0.01 }, 0.12);
    poseBone("neck", { x: Math.max(0, beat) * 0.01, y: beat * 0.018, z: -beat * 0.006 }, 0.08);
    poseBone("head", { x: Math.max(0, beat) * 0.012, y: beat * 0.024, z: -beat * 0.008 }, 0.1);
    this.applyIdleRelaxedArms(poseBone, 0.18);
  }

  private applyConfusedPosture(context: PerformanceContext, poseBone: PoseBone): void {
    poseBone("head", { x: 0.02, y: 0.11, z: 0.11 }, 0.28);
    poseBone("neck", { x: 0.01, y: 0.04, z: 0.05 }, 0.2);
    poseBone("rightUpperArm", { x: -0.05, y: 0.02, z: 1.12 }, 0.18);
    poseBone("rightLowerArm", { x: -0.02, y: 0.08, z: 0.34 }, 0.18);
  }

  private applyErrorPosture(context: PerformanceContext, poseBone: PoseBone): void {
    poseBone("upperChest", { x: 0.018, y: 0, z: 0 }, 0.18);
    poseBone("head", { x: 0.06, y: -0.035, z: 0.03 }, 0.24);
    poseBone("rightUpperArm", { x: 0.02, y: 0.02, z: 1.24 }, 0.22);
    poseBone("rightLowerArm", { x: 0.02, y: -0.02, z: 0.24 }, 0.22);
  }

  private applyFocusedPosture(context: PerformanceContext, poseBone: PoseBone): void {
    poseBone("upperChest", { x: -0.03, y: -0.02, z: -0.006 }, 0.16);
    poseBone("head", { x: -0.02, y: -0.08, z: 0.01 }, 0.16);
    this.applyIdleRelaxedArms(poseBone, 0.12);
  }

  private applyIdleRelaxedArms(poseBone: PoseBone, weight: number): void {
    poseBone("leftUpperArm", { x: 0.04, y: -0.02, z: -1.28 }, weight);
    poseBone("rightUpperArm", { x: 0.04, y: 0.02, z: 1.28 }, weight);
    poseBone("leftLowerArm", { x: 0.03, y: 0.02, z: -0.24 }, weight);
    poseBone("rightLowerArm", { x: 0.03, y: -0.02, z: 0.24 }, weight);
    poseBone("leftHand", { x: 0.02, y: -0.02, z: -0.04 }, weight);
    poseBone("rightHand", { x: 0.02, y: 0.02, z: 0.04 }, weight);
  }

  private applyGuardrails(context: PerformanceContext, rig: PerformanceRig): void {
    const badStateClip =
      context.activeAuthoredClip === "Think_Loop" ||
      context.activeAuthoredClip === "Emotion_Celebrate" ||
      context.activeAuthoredClip === "Emotion_Delighted";
    const stateNeedsClamp = this.state === "thinking" || this.state === "success" || this.state === "speaking";
    const tPose = hasAirplaneArms(rig.readBone);
    if (!badStateClip && !stateNeedsClamp && !tPose) {
      this.lastGuardrail = { applied: false, reason: null, action: this.requestedAction, at: null };
      return;
    }

    if (this.state === "thinking" || context.activeAuthoredClip === "Think_Loop") {
      this.applyThinkingPosture(context, rig);
      this.lastGuardrail = {
        applied: true,
        reason: "blocked raised-palm/presentation thinking pose",
        action: this.requestedAction || "thinking",
        at: new Date().toISOString()
      };
      return;
    }

    if (this.state === "success" || context.activeAuthoredClip === "Emotion_Celebrate" || context.activeAuthoredClip === "Emotion_Delighted") {
      this.applySuccessPosture(context, rig);
      this.lastGuardrail = {
        applied: true,
        reason: tPose ? "blocked T-pose / excessive arm spread" : "guarded success/proud from airplane-arm authored draft",
        action: this.requestedAction || "success",
        at: new Date().toISOString()
      };
      return;
    }

    if (tPose) {
      this.applyIdleRelaxedArms(rig.poseBone, 0.42);
      this.lastGuardrail = {
        applied: true,
        reason: "blocked T-pose / excessive arm spread",
        action: this.requestedAction,
        at: new Date().toISOString()
      };
    }
  }

  private updateLivingTimers(context: PerformanceContext): void {
    const nowMs = performance.now();
    if (nowMs >= this.nextBlinkAt) {
      this.lastBlinkStartedAt = nowMs;
      this.blinkUntil = nowMs + blinkDurationMsForState(this.state);
      this.queuedBlinkCount = Math.random() < doubleBlinkChanceForState(this.state) ? 1 : 0;
      this.nextBlinkAt = nowMs + blinkDelayMsForState(this.state);
    }
    this.blinkState = nowMs < this.blinkUntil ? "blink" : "natural";
    if (this.blinkState === "natural" && this.queuedBlinkCount > 0 && nowMs - this.blinkUntil > 95) {
      this.queuedBlinkCount -= 1;
      this.blinkUntil = nowMs + blinkDurationMsForState(this.state) * 0.86;
      this.nextBlinkAt = nowMs + blinkDelayMsForState(this.state);
      this.blinkState = "double-blink";
    }

    if ((this.state === "idle" || this.state === "listening" || this.state === "speaking") && nowMs >= this.nextMicroGazeAt) {
      const side = Math.random() > 0.5 ? 1 : -1;
      this.microGaze = {
        x: (Math.random() * 0.018 - 0.006) + (this.state === "speaking" ? -0.008 : 0),
        y: side * (0.035 + Math.random() * 0.045) * (this.state === "speaking" ? 0.74 : 1),
        z: side * (0.006 + Math.random() * 0.012)
      };
      this.microGazeUntil = nowMs + (this.state === "speaking" ? 520 : 700) + Math.random() * 850;
      this.nextMicroGazeAt = nowMs + microGazeDelayMsForState(this.state);
    }
    if (nowMs >= this.microGazeUntil) this.microGaze = { x: 0, y: 0, z: 0 };

    if ((this.state === "idle" || this.state === "listening") && nowMs >= this.nextPostureDriftAt) {
      const side = Math.random() > 0.5 ? 1 : -1;
      this.postureDrift = {
        chest: (Math.random() * 0.014 - 0.005),
        shoulder: side * (0.006 + Math.random() * 0.01),
        weight: side * (0.004 + Math.random() * 0.006)
      };
      this.postureDriftUntil = nowMs + 1900 + Math.random() * 2200;
      this.nextPostureDriftAt = nowMs + 9500 + Math.random() * 18500;
    }
    if (nowMs >= this.postureDriftUntil) this.postureDrift = { chest: 0, shoulder: 0, weight: 0 };
  }

  private microGazeWeight(): number {
    const nowMs = performance.now();
    if (nowMs >= this.microGazeUntil) return 0;
    return 1 - smoothstep(this.microGazeUntil - 240, this.microGazeUntil, nowMs);
  }

  private postureDriftWeight(): number {
    const nowMs = performance.now();
    if (nowMs >= this.postureDriftUntil) return 0;
    return 1 - smoothstep(this.postureDriftUntil - 500, this.postureDriftUntil, nowMs);
  }

  private returnTemporaryStateToBase(context: PerformanceContext): void {
    if (this.temporaryStateUntilMs <= 0) return;
    if (performance.now() < this.temporaryStateUntilMs) return;
    if (context.mode === "speaking" || context.mode === "thinking") return;
    this.temporaryStateUntilMs = 0;
    this.currentGesture = null;
    this.transition(context.mode === "listening" ? "listening" : "idle");
  }
}

function stateFromMode(mode: SynraMode, current: SynraPerformanceState): SynraPerformanceState {
  if (mode === "listening") return "listening";
  if (mode === "thinking") return "thinking";
  if (mode === "speaking") return "speaking";
  if (mode === "idle" && current !== "success" && current !== "error" && current !== "confused") return "idle";
  return current;
}

function stateFromAction(action: string, current: SynraPerformanceState): SynraPerformanceState {
  if (action === "soft_nod" && current === "listening") return "hearing_user";
  if (action === "thinking" || action === "focused_ready" || action === "wait_hold") return "thinking";
  if (["success", "success_ping", "workflow_done", "proud", "celebrate", "happy_bounce", "victory_small"].includes(action)) return "success";
  if (["confused", "confused_tilt"].includes(action)) return "confused";
  if (["error", "error_calm", "concerned", "reassure"].includes(action)) return "error";
  if (["look_camera", "look_screen", "look_left", "look_right", "look_up", "look_down"].includes(action)) return "seeing";
  if (["attentive_present", "present"].includes(action) && current === "idle") return "waiting_for_confirmation";
  return current;
}

function temporaryDurationMs(state: SynraPerformanceState): number {
  if (state === "success") return 3300;
  if (state === "confused" || state === "error") return 4200;
  if (state === "seeing") return 2500;
  if (state === "waiting_for_confirmation") return 5200;
  if (state === "thinking") return 5200;
  return 0;
}

function gazeTargetForState(state: SynraPerformanceState): string {
  if (state === "thinking") return "thinking-away";
  if (state === "hearing_user" || state === "transcribing") return "user/camera";
  if (state === "speaking") return "user/screen";
  if (state === "seeing" || state === "executing_tool") return "screen/app panel";
  if (state === "confused") return "questioning-user";
  if (state === "error") return "concerned-user";
  return "user/camera";
}

function gazeForState(state: SynraPerformanceState, now: number): { label: string; headX: number; headY: number; headZ: number; eyeX: number; eyeY: number; weight: number } {
  if (state === "thinking") {
    const side = 0.12 + Math.sin(now * 0.45) * 0.035;
    return { label: "thinking-away", headX: 0.075, headY: -side, headZ: 0.045, eyeX: 0.055, eyeY: -0.08, weight: 0.86 };
  }
  if (state === "hearing_user" || state === "transcribing") {
    return { label: "user/camera", headX: -0.01, headY: Math.sin(now * 0.5) * 0.018, headZ: 0, eyeX: 0, eyeY: 0, weight: 0.62 };
  }
  if (state === "speaking") {
    const screen = Math.sin(now * 0.72) > 0.35;
    return {
      label: screen ? "screen/app panel" : "user/camera",
      headX: screen ? -0.015 : -0.025,
      headY: screen ? -0.16 : 0.018,
      headZ: screen ? 0.01 : 0,
      eyeX: screen ? 0.015 : 0,
      eyeY: screen ? -0.06 : 0,
      weight: 0.58
    };
  }
  if (state === "listening" || state === "waiting_for_confirmation") {
    return { label: "user/camera", headX: -0.018, headY: Math.sin(now * 0.32) * 0.025, headZ: 0, eyeX: 0, eyeY: 0, weight: 0.56 };
  }
  if (state === "seeing" || state === "executing_tool") {
    return { label: "screen/app panel", headX: -0.02, headY: -0.18, headZ: 0.012, eyeX: 0.012, eyeY: -0.08, weight: 0.68 };
  }
  if (state === "confused") {
    return { label: "questioning-user", headX: 0.02, headY: 0.08, headZ: 0.08, eyeX: 0.02, eyeY: 0.02, weight: 0.62 };
  }
  if (state === "error") {
    return { label: "concerned-user", headX: 0.055, headY: -0.04, headZ: 0.025, eyeX: -0.015, eyeY: -0.02, weight: 0.62 };
  }
  return { label: "user/camera", headX: -0.018 + Math.sin(now * 0.28) * 0.012, headY: Math.sin(now * 0.22) * 0.035, headZ: 0, eyeX: 0, eyeY: 0, weight: 0.42 };
}

function expressionForState(state: SynraPerformanceState, expression: SynraExpression): string {
  if (state === "thinking") return "focused/curious";
  if (state === "hearing_user" || state === "transcribing") return "attentive/focused";
  if (state === "success") return "proud/happy";
  if (state === "listening") return "attentive";
  if (state === "speaking") return expression || "focused";
  if (state === "error") return "concern";
  return expression;
}

function poseNotesForState(state: SynraPerformanceState): string[] {
  if (state === "thinking") return ["head tilt", "thinking-away gaze", "right hand near chest/chin", "left arm relaxed"];
  if (state === "hearing_user" || state === "transcribing") return ["steady eye contact", "small acknowledgement nods", "quiet listening posture"];
  if (state === "success") return ["chest lift", "small one-hand confident gesture", "arms clamped below airplane spread"];
  if (state === "listening") return ["soft eye contact", "small nods", "relaxed arms"];
  if (state === "speaking") return ["upper torso gesture band", "user/screen gaze alternation", "lipsync compatible"];
  return ["breathing", "micro head drift", "relaxed arms"];
}

function hasAirplaneArms(readBone: ReadBone): boolean {
  const left = readBone("leftUpperArm");
  const right = readBone("rightUpperArm");
  if (!left || !right) return false;
  return Math.abs(left.z) < 0.42 && Math.abs(right.z) < 0.42 && Math.abs(left.y - right.y) < 0.9;
}

function blinkDurationMsForState(state: SynraPerformanceState): number {
  if (state === "speaking") return 86 + Math.random() * 42;
  if (state === "thinking" || state === "confused") return 132 + Math.random() * 64;
  if (state === "hearing_user" || state === "listening") return 102 + Math.random() * 48;
  return 96 + Math.random() * 56;
}

function blinkDelayMsForState(state: SynraPerformanceState): number {
  if (state === "speaking") return 1900 + Math.random() * 3600;
  if (state === "thinking" || state === "confused") return 1400 + Math.random() * 3100;
  if (state === "hearing_user" || state === "listening") return 1700 + Math.random() * 3600;
  return 2400 + Math.random() * 4600;
}

function doubleBlinkChanceForState(state: SynraPerformanceState): number {
  if (state === "thinking" || state === "confused") return 0.25;
  if (state === "hearing_user" || state === "listening") return 0.16;
  if (state === "speaking") return 0.08;
  return 0.11;
}

function microGazeDelayMsForState(state: SynraPerformanceState): number {
  if (state === "speaking") return 3200 + Math.random() * 7200;
  if (state === "hearing_user" || state === "listening") return 3400 + Math.random() * 8600;
  return 5200 + Math.random() * 11800;
}

function readPerformanceOptions(): SynraPerformanceOptions {
  return {
    enabled: readBooleanPreference(OPTION_STORAGE_KEYS.enabled, DEFAULT_OPTIONS.enabled),
    life: readBooleanPreference(OPTION_STORAGE_KEYS.life, DEFAULT_OPTIONS.life),
    gaze: readBooleanPreference(OPTION_STORAGE_KEYS.gaze, DEFAULT_OPTIONS.gaze),
    guardrails: readBooleanPreference(OPTION_STORAGE_KEYS.guardrails, DEFAULT_OPTIONS.guardrails),
    forceProceduralPerformance: readBooleanPreference(OPTION_STORAGE_KEYS.forceProceduralPerformance, DEFAULT_OPTIONS.forceProceduralPerformance),
    allowDraftAuthoredMotions: readBooleanPreference(OPTION_STORAGE_KEYS.allowDraftAuthoredMotions, DEFAULT_OPTIONS.allowDraftAuthoredMotions)
  };
}

function readBooleanPreference(key: string, fallback: boolean): boolean {
  try {
    const queryValue = new URLSearchParams(window.location.search).get(key);
    const storedValue = window.localStorage?.getItem(key);
    const value = (queryValue || storedValue || "").toLowerCase();
    if (["1", "true", "yes", "on"].includes(value)) return true;
    if (["0", "false", "no", "off"].includes(value)) return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function writeBooleanPreference(key: string, value: boolean): void {
  try {
    window.localStorage?.setItem(key, value ? "true" : "false");
  } catch {
    // Runtime controls are best-effort when storage is unavailable.
  }
}
