import { actionEnvelope, clamp, smoothstep } from "./math";
import { resolveSynraActionIntent, synraActionDuration, type SynraActionIntent } from "../services/synra-action-catalog";
import type { BoneName, MotionInput, PoseFrame, SynraActionName, SynraExpression, SynraMode } from "../types/avatar";

type ActiveAction = {
  name: SynraActionName;
  startedAt: number;
  duration: number;
};

type IdleGesture = {
  kind: "glance_left" | "glance_right" | "soft_nod" | "shoulder_shift" | "hand_fidget";
  startedAt: number;
  duration: number;
};

const POSE_BONES: BoneName[] = [
  "head",
  "neck",
  "chest",
  "upperChest",
  "spine",
  "hips",
  "leftEye",
  "rightEye",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "leftToes",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "rightToes",
  "leftThumbMetacarpal",
  "leftThumbProximal",
  "leftThumbDistal",
  "leftIndexProximal",
  "leftIndexIntermediate",
  "leftIndexDistal",
  "leftMiddleProximal",
  "leftMiddleIntermediate",
  "leftMiddleDistal",
  "leftRingProximal",
  "leftRingIntermediate",
  "leftRingDistal",
  "leftLittleProximal",
  "leftLittleIntermediate",
  "leftLittleDistal",
  "rightThumbMetacarpal",
  "rightThumbProximal",
  "rightThumbDistal",
  "rightIndexProximal",
  "rightIndexIntermediate",
  "rightIndexDistal",
  "rightMiddleProximal",
  "rightMiddleIntermediate",
  "rightMiddleDistal",
  "rightRingProximal",
  "rightRingIntermediate",
  "rightRingDistal",
  "rightLittleProximal",
  "rightLittleIntermediate",
  "rightLittleDistal"
];

export class SynraMotionEngine {
  private mode: SynraMode = "idle";
  private expression: SynraExpression = "soft_smile";
  private activeAction: ActiveAction | null = null;
  private walkPhase = 0;
  private walkTravel = 0;
  private nextBlinkAt = 1.7;
  private blinkStartedAt = -1;
  private blinkDuration = 0.16;
  private queuedBlinkCount = 0;
  private lastBlinkAt = 0;
  private nextIdleGestureAt = 2.4;
  private idleGesture: IdleGesture | null = null;

  private isActionActive(...names: SynraActionName[]): boolean {
    return Boolean(this.activeAction && names.includes(this.activeAction.name));
  }

  setMode(mode: SynraMode): void {
    this.mode = mode;
    if (mode !== "walking" && this.activeAction?.name === "walk") {
      this.activeAction = null;
    }
  }

  setExpression(expression: SynraExpression): void {
    this.expression = expression;
  }

  clearAction(name?: SynraActionName): void {
    if (!name || this.activeAction?.name === name) {
      this.activeAction = null;
    }
  }

  triggerAction(name: SynraActionName, now: number): void {
    const duration = synraActionDuration(name);

    this.activeAction = { name, startedAt: now, duration };
    if (resolveSynraActionIntent(name).family === "walk") {
      this.mode = "walking";
      this.walkTravel = 0;
    }
  }

  debugState(): Record<string, unknown> {
    return {
      mode: this.mode,
      expression: this.expression,
      activeAction: this.activeAction,
      idleGesture: this.idleGesture
    };
  }

  update(input: MotionInput): PoseFrame {
    const base = this.createNeutralPose();
    const breath = Math.sin(input.now * 1.08);
    const breathUp = Math.max(0, breath);
    const activeIntent = this.activeAction ? resolveSynraActionIntent(this.activeAction.name) : null;
    const waveActive = activeIntent?.family === "wave";
    const jumpActive = activeIntent?.family === "jump";
    const fullBodyActive = Boolean(activeIntent && !["look", "nod", "shake", "listen", "think"].includes(activeIntent.family));
    const blink = this.updateBlink(input.now);
    const expressions = this.createExpressionFrame(blink, breathUp);

    if (!jumpActive) {
      this.addRot(base, "head", { x: -0.03 - breathUp * 0.01 });
      this.addRot(base, "chest", { x: -0.03 - breathUp * 0.016 });
      this.addRot(base, "upperChest", { x: -0.022 - breathUp * 0.012 });
    }

    this.applyNaturalRest(base);

    if (!fullBodyActive && (this.mode === "idle" || this.mode === "listening")) {
      this.applyIdleLife(base, input);
    }

    const action = this.activeAction;
    if (action) {
      const age = Math.max(0, input.now - action.startedAt);
      const progress = clamp(age / action.duration, 0, 1);
      const weight = actionEnvelope(progress, 0.14, 0.2);
      base.activeAction = { name: action.name, progress, weight };
      this.applyActionPose(base, action.name, { progress, weight, now: input.now });
      if (progress >= 1) {
        if (resolveSynraActionIntent(action.name).family === "walk") this.mode = "idle";
        this.activeAction = null;
      }
    }

    if (this.mode === "walking" && !action) {
      this.walkPhase += input.delta * 1.65;
      this.applyWalking(base, this.walkPhase, 0.82, false);
    }

    if (this.mode === "thinking") {
      this.addRot(base, "head", { y: Math.sin(input.now * 0.5) * 0.08, x: -0.08 });
      this.addRot(base, "leftEye", { y: Math.sin(input.now * 0.5) * 0.025, x: -0.015 });
      this.addRot(base, "rightEye", { y: Math.sin(input.now * 0.5) * 0.025, x: -0.015 });
      this.addRot(base, "rightHand", { x: -0.08, y: 0.12, z: 0.08 });
      this.addRot(base, "rightLowerArm", { z: -0.48, y: 0.12, x: -0.06 });
      this.addRot(base, "rightUpperArm", { z: 0.12, y: 0.02, x: -0.08 });
      expressions.relaxed = Math.max(expressions.relaxed, 0.26);
    }

    if (this.mode === "speaking") {
      this.addRot(base, "head", { y: Math.sin(input.now * 2.8) * 0.03 });
      this.addRot(base, "neck", { y: Math.sin(input.now * 2.8 + 0.4) * 0.018 });
      this.addRot(base, "rightShoulder", { z: Math.sin(input.now * 3.2) * 0.012 });
      this.addRot(base, "rightLowerArm", { z: -0.1 + Math.sin(input.now * 3.6) * 0.045 });
      this.addRot(base, "rightHand", { y: 0.14 + Math.sin(input.now * 6.6) * 0.08, x: -0.04, z: Math.sin(input.now * 4.8) * 0.035 });
    }

    base.expressions = expressions;
    // Keep Synra physically planted: idle/gaze/talk gestures must never drift the scene root.
    if (!jumpActive && activeIntent?.family !== "walk" && this.mode !== "walking") {
      base.rootOffset.x = 0;
      base.rootOffset.y = 0;
      base.rootOffset.z = 0;
    } else {
      base.rootOffset.x = 0;
      base.rootOffset.y = Math.max(base.rootOffset.y, 0);
    }
    return base;
  }

  private createNeutralPose(): PoseFrame {
    const rotations: PoseFrame["rotations"] = {};
    for (const bone of POSE_BONES) rotations[bone] = { x: 0, y: 0, z: 0 };
    return {
      rootOffset: { x: 0, y: 0, z: 0 },
      rotations,
      expressions: {},
      blend: 0.22,
      hardBones: []
    };
  }

  private markHard(frame: PoseFrame, bones: BoneName[]): void {
    for (const bone of bones) {
      if (!frame.hardBones.includes(bone)) frame.hardBones.push(bone);
    }
  }

  private addRot(frame: PoseFrame, bone: BoneName, delta: { x?: number; y?: number; z?: number }): void {
    const current = frame.rotations[bone] ?? { x: 0, y: 0, z: 0 };
    frame.rotations[bone] = {
      x: (current.x ?? 0) + (delta.x ?? 0),
      y: (current.y ?? 0) + (delta.y ?? 0),
      z: (current.z ?? 0) + (delta.z ?? 0)
    };
  }

  private setRot(frame: PoseFrame, bone: BoneName, target: { x?: number; y?: number; z?: number }): void {
    const current = frame.rotations[bone] ?? { x: 0, y: 0, z: 0 };
    frame.rotations[bone] = {
      x: target.x ?? current.x ?? 0,
      y: target.y ?? current.y ?? 0,
      z: target.z ?? current.z ?? 0
    };
  }

  private applyNaturalRest(frame: PoseFrame): void {
    this.setRot(frame, "leftShoulder", { x: 0.02, y: 0.02, z: 0.015 });
    this.setRot(frame, "rightShoulder", { x: 0.02, y: -0.02, z: -0.015 });
    this.setRot(frame, "leftUpperArm", { x: 0.04, y: -0.02, z: 1.28 });
    this.setRot(frame, "rightUpperArm", { x: 0.04, y: 0.02, z: -1.28 });
    this.setRot(frame, "leftLowerArm", { x: 0.03, y: 0.02, z: 0.24 });
    this.setRot(frame, "rightLowerArm", { x: 0.03, y: -0.02, z: -0.24 });
    this.setRot(frame, "leftHand", { x: 0.02, y: -0.02, z: -0.04 });
    this.setRot(frame, "rightHand", { x: 0.02, y: 0.02, z: 0.04 });

    this.setRot(frame, "leftThumbMetacarpal", { x: 0.08, y: 0.02, z: 0.08 });
    this.setRot(frame, "leftThumbProximal", { x: 0.08, z: 0.04 });
    this.setRot(frame, "leftIndexProximal", { x: 0.07, z: 0.02 });
    this.setRot(frame, "leftIndexIntermediate", { x: 0.08 });
    this.setRot(frame, "leftMiddleProximal", { x: 0.08 });
    this.setRot(frame, "leftMiddleIntermediate", { x: 0.09 });
    this.setRot(frame, "leftRingProximal", { x: 0.09, z: -0.02 });
    this.setRot(frame, "leftRingIntermediate", { x: 0.1 });
    this.setRot(frame, "leftLittleProximal", { x: 0.1, z: -0.035 });
    this.setRot(frame, "leftLittleIntermediate", { x: 0.11 });

    this.setRot(frame, "rightThumbMetacarpal", { x: 0.08, y: -0.02, z: -0.08 });
    this.setRot(frame, "rightThumbProximal", { x: 0.08, z: -0.04 });
    this.setRot(frame, "rightIndexProximal", { x: 0.07, z: -0.02 });
    this.setRot(frame, "rightIndexIntermediate", { x: 0.08 });
    this.setRot(frame, "rightMiddleProximal", { x: 0.08 });
    this.setRot(frame, "rightMiddleIntermediate", { x: 0.09 });
    this.setRot(frame, "rightRingProximal", { x: 0.09, z: 0.02 });
    this.setRot(frame, "rightRingIntermediate", { x: 0.1 });
    this.setRot(frame, "rightLittleProximal", { x: 0.1, z: 0.035 });
    this.setRot(frame, "rightLittleIntermediate", { x: 0.11 });
  }

  private createExpressionFrame(blink: number, breathUp: number): Record<string, number> {
    const expressions: Record<string, number> = {
      neutral: 0.04,
      happy: 0,
      relaxed: this.mode === "idle" ? 0.08 + breathUp * 0.02 : 0.04,
      sad: 0,
      angry: 0,
      surprised: 0,
      blink,
      blinkLeft: 0,
      blinkRight: 0
    };

    if (this.mode === "listening") {
      expressions.relaxed = 0.04;
      expressions.surprised = 0.02;
    }

    switch (this.expression) {
      case "happy":
        expressions.happy = 0.46;
        expressions.playful = 0.34;
        expressions.relaxed = Math.max(expressions.relaxed, 0.08);
        break;
      case "bright":
      case "delighted":
        expressions.happy = this.expression === "delighted" ? 0.62 : 0.42;
        expressions.delighted = this.expression === "delighted" ? 0.7 : 0.42;
        expressions.surprised = this.expression === "delighted" ? 0.08 : 0.03;
        expressions.relaxed = Math.max(expressions.relaxed, 0.06);
        break;
      case "curious":
        expressions.happy = 0.06;
        expressions.surprised = 0.18;
        expressions.curious = 0.56;
        expressions.relaxed = Math.max(expressions.relaxed, 0.04);
        break;
      case "focused":
      case "thinking":
      case "attentive":
        expressions.happy = 0;
        expressions.relaxed = 0.03;
        expressions.neutral = 0.1;
        expressions.attentive = this.expression === "attentive" ? 0.46 : 0.12;
        expressions.focused = this.expression === "focused" || this.expression === "thinking" ? 0.52 : 0.18;
        break;
      case "confused":
        expressions.surprised = 0.24;
        expressions.sad = 0.12;
        expressions.happy = 0;
        expressions.confused = 0.62;
        expressions.skeptical = 0.22;
        break;
      case "surprised":
        expressions.surprised = 0.48;
        expressions.happy = 0;
        expressions.relaxed = 0.02;
        break;
      case "relaxed":
        expressions.relaxed = 0.18;
        expressions.happy = 0.04;
        break;
      case "blush":
        expressions.happy = 0.32;
        expressions.relaxed = 0.12;
        expressions.blush = 0.72;
        break;
      case "reassure":
        expressions.happy = 0.08;
        expressions.relaxed = 0.14;
        expressions.sad = 0.05;
        expressions.reassure = 0.52;
        break;
      case "soft_smile":
      default:
        expressions.happy = 0.08;
        expressions.relaxed = Math.max(expressions.relaxed, 0.08);
        break;
    }

    return expressions;
  }

  private updateBlink(now: number): number {
    if (this.blinkStartedAt < 0 && now >= this.nextBlinkAt) {
      this.blinkStartedAt = now;
      this.lastBlinkAt = now;
      this.blinkDuration = this.blinkDurationForMode();
      this.queuedBlinkCount = Math.random() < this.doubleBlinkChance() ? 1 : 0;
      this.nextBlinkAt = now + this.nextBlinkDelayForMode(now);
    }

    if (this.blinkStartedAt < 0) return 0;
    const progress = clamp((now - this.blinkStartedAt) / this.blinkDuration, 0, 1);
    const value = Math.sin(progress * Math.PI) ** 0.72;
    if (progress >= 1) {
      this.blinkStartedAt = -1;
      if (this.queuedBlinkCount > 0) {
        this.queuedBlinkCount -= 1;
        this.nextBlinkAt = now + 0.12 + Math.random() * 0.08;
      }
    }
    return value;
  }

  private blinkDurationForMode(): number {
    if (this.mode === "speaking") return 0.105 + Math.random() * 0.05;
    if (this.mode === "thinking") return 0.18 + Math.random() * 0.08;
    if (this.mode === "listening") return 0.13 + Math.random() * 0.06;
    return 0.14 + Math.random() * 0.075;
  }

  private doubleBlinkChance(): number {
    if (this.expression === "confused" || this.mode === "thinking") return 0.24;
    if (this.mode === "listening") return 0.16;
    if (this.mode === "speaking") return 0.08;
    return 0.11;
  }

  private nextBlinkDelayForMode(now: number): number {
    const sinceLast = Math.max(0, this.lastBlinkAt ? now - this.lastBlinkAt : 0);
    const fatigue = sinceLast > 5.8 ? -0.8 : 0;
    if (this.mode === "speaking") return Math.max(1.4, 2.1 + Math.random() * 3.2 + fatigue);
    if (this.mode === "thinking") return Math.max(1.2, 1.7 + Math.random() * 2.8 + fatigue);
    if (this.mode === "listening") return Math.max(1.5, 2.0 + Math.random() * 3.6 + fatigue);
    return Math.max(1.8, 2.4 + Math.random() * 4.2 + fatigue);
  }

  private applyIdleLife(frame: PoseFrame, input: MotionInput): void {
    const slow = Math.sin(input.now * 0.42);
    const slowAlt = Math.sin(input.now * 0.31 + 1.4);
    const tiny = Math.sin(input.now * 1.7);

    // Upper-body presence only. Feet and root stay locked so she feels like she has weight.
    this.addRot(frame, "hips", { z: slow * 0.004, y: slowAlt * 0.004 });
    this.addRot(frame, "spine", { z: -slow * 0.006, y: slowAlt * 0.014 });
    this.addRot(frame, "chest", { y: slowAlt * 0.018, z: -slow * 0.008 });
    this.addRot(frame, "upperChest", { y: slowAlt * 0.016, z: -slow * 0.007 });
    this.addRot(frame, "neck", { y: slowAlt * 0.025, z: slow * 0.012 });
    this.addRot(frame, "head", { y: slowAlt * 0.04, z: slow * 0.014, x: -0.02 + tiny * 0.006 });
    this.addRot(frame, "leftEye", { y: slowAlt * 0.018, x: tiny * 0.006 });
    this.addRot(frame, "rightEye", { y: slowAlt * 0.018, x: tiny * 0.006 });

    this.addRot(frame, "leftShoulder", { z: slow * 0.01, x: breathShoulder(input.now) });
    this.addRot(frame, "rightShoulder", { z: slow * 0.01, x: breathShoulder(input.now + 0.42) });
    this.addRot(frame, "leftUpperArm", { x: slow * 0.018, y: -0.012 });
    this.addRot(frame, "rightUpperArm", { x: -slow * 0.014, y: 0.012 });
    this.addRot(frame, "leftHand", { x: tiny * 0.01, z: slowAlt * 0.012 });
    this.addRot(frame, "rightHand", { x: -tiny * 0.01, z: -slowAlt * 0.012 });
    this.setRot(frame, "leftUpperLeg", { x: 0, y: 0, z: 0 });
    this.setRot(frame, "rightUpperLeg", { x: 0, y: 0, z: 0 });
    this.setRot(frame, "leftLowerLeg", { x: 0, y: 0, z: 0 });
    this.setRot(frame, "rightLowerLeg", { x: 0, y: 0, z: 0 });
    this.setRot(frame, "leftFoot", { x: 0, y: 0, z: 0 });
    this.setRot(frame, "rightFoot", { x: 0, y: 0, z: 0 });
    this.setRot(frame, "leftToes", { x: 0, y: 0, z: 0 });
    this.setRot(frame, "rightToes", { x: 0, y: 0, z: 0 });

    if (!this.idleGesture && input.now >= this.nextIdleGestureAt) {
      const gestures: IdleGesture["kind"][] = ["glance_left", "glance_right", "soft_nod", "shoulder_shift", "hand_fidget"];
      this.idleGesture = {
        kind: gestures[Math.floor(Math.random() * gestures.length)],
        startedAt: input.now,
        duration: 1.1 + Math.random() * 1.25
      };
      this.nextIdleGestureAt = input.now + 3.5 + Math.random() * 5.5;
    }

    if (!this.idleGesture) return;
    const progress = clamp((input.now - this.idleGesture.startedAt) / this.idleGesture.duration, 0, 1);
    const hold = smoothstep(0, 0.24, progress) * (1 - smoothstep(0.76, 1, progress));
    const pulse = Math.sin(progress * Math.PI);

    if (this.idleGesture.kind === "glance_left") {
      this.addRot(frame, "head", { y: 0.16 * hold, z: 0.018 * hold });
      this.addRot(frame, "neck", { y: 0.06 * hold });
      this.addRot(frame, "chest", { y: 0.025 * hold });
      this.addRot(frame, "leftEye", { y: 0.055 * hold });
      this.addRot(frame, "rightEye", { y: 0.055 * hold });
    } else if (this.idleGesture.kind === "glance_right") {
      this.addRot(frame, "head", { y: -0.16 * hold, z: -0.018 * hold });
      this.addRot(frame, "neck", { y: -0.06 * hold });
      this.addRot(frame, "chest", { y: -0.025 * hold });
      this.addRot(frame, "leftEye", { y: -0.055 * hold });
      this.addRot(frame, "rightEye", { y: -0.055 * hold });
    } else if (this.idleGesture.kind === "soft_nod") {
      this.addRot(frame, "head", { x: -0.08 * pulse });
      this.addRot(frame, "neck", { x: -0.028 * pulse });
    } else if (this.idleGesture.kind === "shoulder_shift") {
      this.addRot(frame, "upperChest", { z: 0.026 * pulse, y: -0.035 * hold });
      this.addRot(frame, "leftShoulder", { z: 0.04 * pulse });
      this.addRot(frame, "rightShoulder", { z: -0.032 * pulse });
      this.addRot(frame, "leftUpperArm", { x: -0.035 * pulse });
      this.addRot(frame, "rightUpperArm", { x: 0.025 * pulse });
    } else if (this.idleGesture.kind === "hand_fidget") {
      this.addRot(frame, "rightLowerArm", { z: -0.08 * pulse, x: -0.025 * hold });
      this.addRot(frame, "rightHand", { y: 0.08 * pulse, z: 0.05 * pulse });
      this.addRot(frame, "rightIndexProximal", { z: 0.04 * pulse });
      this.addRot(frame, "rightMiddleProximal", { z: 0.035 * pulse });
      this.addRot(frame, "leftIndexProximal", { z: 0.018 * pulse });
      this.addRot(frame, "leftMiddleProximal", { z: 0.014 * pulse });
    }

    if (progress >= 1) this.idleGesture = null;
  }

  private applyActionPose(
    frame: PoseFrame,
    name: SynraActionName,
    input: { progress: number; weight: number; now: number }
  ): void {
    const intent = resolveSynraActionIntent(name);
    if (intent.family === "wave") {
      frame.blend = 0.34;
      this.applyWave(frame, input, intent);
      return;
    }
    if (intent.family === "jump") {
      frame.blend = 0.36;
      this.applyJump(frame, input, intent);
      return;
    }
    if (intent.family === "walk") {
      frame.blend = 0.3;
      const walkWeight = smoothstep(0, 0.12, input.progress) * (1 - smoothstep(0.82, 1, input.progress));
      this.walkPhase += 0.055;
      this.applyWalking(frame, this.walkPhase, walkWeight * intent.intensity, true);
      return;
    }
    if (intent.family === "turn") {
      frame.blend = 0.31;
      this.applyTurn(frame, input, intent.direction === "left" ? 1 : -1);
      return;
    }
    if (intent.family === "look") {
      frame.blend = 0.3;
      this.applyLook(frame, input, intent);
      return;
    }
    if (intent.family === "point") {
      frame.blend = 0.32;
      this.applyPoint(frame, input, intent);
      return;
    }
    if (intent.family === "bow") {
      frame.blend = 0.3;
      this.applyBow(frame, input, intent);
      return;
    }
    if (intent.family === "stretch") {
      frame.blend = 0.3;
      this.applyStretch(frame, input, intent);
      return;
    }
    if (intent.family === "nod") {
      this.applyNod(frame, input, intent);
      return;
    }
    if (intent.family === "shake") {
      this.applyShake(frame, input, intent);
      return;
    }
    if (intent.family === "celebrate") {
      frame.blend = 0.33;
      this.applyCelebrate(frame, input, intent);
      return;
    }
    if (intent.family === "explain") {
      frame.blend = 0.31;
      this.applyExplain(frame, input, intent);
      return;
    }
    if (intent.family === "reassure") {
      frame.blend = 0.29;
      this.applyReassure(frame, input, intent);
      return;
    }
    if (intent.family === "curious") {
      frame.blend = 0.29;
      this.applyCurious(frame, input, intent);
      return;
    }
    if (intent.family === "focus" || intent.family === "listen" || intent.family === "think" || intent.family === "shy") {
      frame.blend = 0.28;
      this.applyPresenceGesture(frame, input, intent);
      return;
    }
    if (intent.family === "idle") {
      frame.blend = 0.24;
      this.applyIdleAction(frame, input, intent);
      return;
    }
    this.applyEmote(frame, input, intent);
  }

  // Palm-out hello pose with fingertips vertical.
  private applyWave(
    frame: PoseFrame,
    input: { progress: number; weight: number; now: number },
    intent: SynraActionIntent
  ): void {
    const isBig = intent.direction === "big" || intent.intensity > 1;
    const isShy = intent.direction === "small" || intent.family === "shy" || intent.id.includes("shy");
    const setup = smoothstep(0.02, 0.2, input.progress);
    const sustain = 1 - smoothstep(0.84, 1, input.progress);
    const phaseWeight = setup * sustain;
    const tempo = Math.min(0.72, intent.tempo || 1);
    const sweep = Math.sin(input.progress * Math.PI * (isBig ? 4.8 : isShy ? 2.8 : 3.8) * tempo) * input.weight * phaseWeight;
    const flick = Math.sin(input.progress * Math.PI * (isBig ? 7.2 : isShy ? 4.4 : 6.1) * tempo) * input.weight * phaseWeight;
    const wristPulse = Math.sin(input.progress * Math.PI * (isBig ? 8.6 : 6.4) * tempo) * input.weight * phaseWeight;
    const amplitude = intent.intensity * (isBig ? 1.05 : isShy ? 0.72 : 0.92);

    this.addRot(frame, "head", { x: isShy ? -0.05 : -0.03, y: isShy ? 0.03 : -0.06 * amplitude });
    this.addRot(frame, "chest", { x: -0.03, y: 0.03 * amplitude });
    this.addRot(frame, "upperChest", { x: -0.025, y: 0.026 * amplitude });

    // Anatomical hello: elbow lifted beside the shoulder, forearm bent up, palm readable.
    this.setRot(frame, "rightUpperArm", {
      x: -0.2 * amplitude,
      y: isShy ? -0.035 : -0.09 + sweep * 0.008,
      z: -0.62 * amplitude + sweep * 0.01
    });
    this.setRot(frame, "rightLowerArm", {
      x: -0.38,
      y: isShy ? 0.42 : 0.58,
      z: -1.16 + sweep * 0.018
    });
    frame.rightArmIk = {
      wrist: {
        x: isShy ? -0.24 : -0.32 + sweep * 0.05,
        y: isShy ? 1.28 : 1.42 + Math.abs(sweep) * 0.025,
        z: 0.18 + (isBig ? 0.04 : 0)
      },
      weight: 0.52 * phaseWeight
    };

    // Fingertips up, palm toward the user; the wrist waves instead of the arm flopping.
    this.setRot(frame, "rightHand", {
      x: -0.06 + Math.abs(sweep) * 0.012,
      y: 0.72 - sweep * 0.46,
      z: 0.42 + flick * 0.045 + wristPulse * 0.018
    });

    // Keep fingers together and extended while waving.
    const fingerSpread = isShy ? 0.01 : 0.016;
    const curlProx = 0.024;
    const curlMid = 0.01;
    const curlDistal = 0.006;
    this.setRot(frame, "rightThumbMetacarpal", { x: 0.035, y: -0.018, z: -0.018 });
    this.setRot(frame, "rightThumbProximal", { x: 0.018, y: -0.01, z: -0.008 });
    this.setRot(frame, "rightThumbDistal", { x: 0.008, y: -0.004, z: -0.003 });
    this.setRot(frame, "rightIndexProximal", { x: -0.006, y: fingerSpread * 0.2, z: curlProx });
    this.setRot(frame, "rightIndexIntermediate", { x: -0.003, z: curlMid });
    this.setRot(frame, "rightIndexDistal", { x: -0.0015, z: curlDistal });
    this.setRot(frame, "rightMiddleProximal", { x: -0.006, y: fingerSpread * 0.1, z: curlProx });
    this.setRot(frame, "rightMiddleIntermediate", { x: -0.003, z: curlMid });
    this.setRot(frame, "rightMiddleDistal", { x: -0.0015, z: curlDistal });
    this.setRot(frame, "rightRingProximal", { x: -0.007, y: -fingerSpread * 0.06, z: curlProx });
    this.setRot(frame, "rightRingIntermediate", { x: -0.003, z: curlMid });
    this.setRot(frame, "rightRingDistal", { x: -0.0015, z: curlDistal });
    this.setRot(frame, "rightLittleProximal", { x: -0.0075, y: -fingerSpread * 0.16, z: curlProx * 0.95 });
    this.setRot(frame, "rightLittleIntermediate", { x: -0.003, z: curlMid });
    this.setRot(frame, "rightLittleDistal", { x: -0.0015, z: curlDistal });

    this.addRot(frame, "hips", { z: 0.01 * amplitude });
    this.addRot(frame, "leftUpperLeg", { x: 0.03 });
    this.addRot(frame, "rightUpperLeg", { x: 0.04 });

    this.markHard(frame, [
      "rightUpperArm",
      "rightLowerArm",
      "rightHand",
      "leftUpperArm",
      "leftLowerArm",
      "leftHand",
      "rightThumbMetacarpal",
      "rightThumbProximal",
      "rightThumbDistal",
      "rightIndexProximal",
      "rightIndexIntermediate",
      "rightIndexDistal",
      "rightMiddleProximal",
      "rightMiddleIntermediate",
      "rightMiddleDistal",
      "rightRingProximal",
      "rightRingIntermediate",
      "rightRingDistal",
      "rightLittleProximal",
      "rightLittleIntermediate",
      "rightLittleDistal"
    ]);
  }

  private applyJump(frame: PoseFrame, input: { progress: number; weight: number; now: number }, intent: SynraActionIntent): void {
    const crouch = smoothstep(0.0, 0.2, input.progress) * (1 - smoothstep(0.2, 0.34, input.progress));
    const launch = smoothstep(0.22, 0.42, input.progress) * (1 - smoothstep(0.42, 0.58, input.progress));
    const air = smoothstep(0.4, 0.6, input.progress) * (1 - smoothstep(0.6, 0.8, input.progress));
    const land = smoothstep(0.72, 0.93, input.progress) * (1 - smoothstep(0.93, 1, input.progress));
    const recover = smoothstep(0.92, 1, input.progress);
    const contact = smoothstep(0.84, 0.96, input.progress) * (1 - smoothstep(0.98, 1, input.progress));
    const arcT = clamp((input.progress - 0.32) / 0.5, 0, 1);
    const ballistic = Math.max(0, 1 - Math.pow((arcT - 0.5) / 0.5, 2));
    const spring = Math.sin(input.progress * Math.PI * 2.2) * input.weight;

    const power = intent.intensity;
    frame.rootOffset.y += (-0.34 * crouch + 0.58 * launch + ballistic * 0.42 + 0.14 * air - 0.3 * land - 0.16 * contact + 0.08 * recover) * power;

    this.addRot(frame, "hips", { x: -0.1 - crouch * 0.5 + air * 0.16 - land * 0.12, z: spring * 0.022 });
    this.addRot(frame, "spine", { x: crouch * 0.12 - air * 0.07 + land * 0.05 });
    this.addRot(frame, "chest", { x: crouch * 0.18 - air * 0.1 + land * 0.07 });
    this.addRot(frame, "head", { x: crouch * 0.12 - air * 0.08 + land * 0.05 });

    this.addRot(frame, "leftUpperLeg", { x: -0.32 - crouch * 1.52 + air * 0.34 - land * 0.28 + contact * 0.12, z: -0.034 });
    this.addRot(frame, "rightUpperLeg", { x: -0.32 - crouch * 1.52 + air * 0.34 - land * 0.28 + contact * 0.12, z: 0.034 });
    this.addRot(frame, "leftLowerLeg", { x: 0.5 + crouch * 2.12 + land * 0.72 + contact * 0.22 - recover * 0.34 });
    this.addRot(frame, "rightLowerLeg", { x: 0.5 + crouch * 2.12 + land * 0.72 + contact * 0.22 - recover * 0.34 });
    this.addRot(frame, "leftFoot", { x: -0.3 - launch * 0.56 + land * 0.44 + contact * 0.12, z: -0.012 });
    this.addRot(frame, "rightFoot", { x: -0.3 - launch * 0.56 + land * 0.44 + contact * 0.12, z: 0.012 });
    this.addRot(frame, "leftToes", { x: 0.14 + launch * 0.46 + land * 0.28 });
    this.addRot(frame, "rightToes", { x: 0.14 + launch * 0.46 + land * 0.28 });

    // Counter-swing arms so jump has body weight and momentum.
    this.setRot(frame, "leftUpperArm", { z: 0.96 - launch * 0.58 + crouch * 0.36, x: -0.2 - crouch * 0.1 + air * 0.06 });
    this.setRot(frame, "rightUpperArm", { z: -0.96 + launch * 0.58 - crouch * 0.36, x: -0.2 - crouch * 0.1 + air * 0.06 });
    this.setRot(frame, "leftLowerArm", { z: 0.42 + launch * 0.36 - land * 0.2, x: 0.12 });
    this.setRot(frame, "rightLowerArm", { z: -0.42 - launch * 0.36 + land * 0.2, x: 0.12 });

    this.markHard(frame, [
      "hips",
      "spine",
      "chest",
      "leftUpperLeg",
      "rightUpperLeg",
      "leftLowerLeg",
      "rightLowerLeg",
      "leftFoot",
      "rightFoot",
      "leftToes",
      "rightToes"
    ]);
  }

  private applyWalking(frame: PoseFrame, phase: number, weight: number, forward: boolean): void {
    const leftStep = Math.sin(phase);
    const rightStep = Math.sin(phase + Math.PI);
    const stride = 0.46 * weight;
    const kneeBendL = Math.max(0, Math.sin(phase + Math.PI * 0.24)) * 0.44 * weight;
    const kneeBendR = Math.max(0, Math.sin(phase + Math.PI + Math.PI * 0.24)) * 0.44 * weight;
    const hipRoll = Math.sin(phase) * 0.05 * weight;
    const shoulderCounter = -hipRoll * 1.15;
    const verticalBob = Math.abs(Math.sin(phase * 2)) * 0.008 * weight;

    if (forward) {
      this.walkTravel += 0.004 * Math.max(weight, 0.3);
    } else {
      this.walkTravel = 0;
    }
    frame.rootOffset.z += forward ? this.walkTravel : 0;
    frame.rootOffset.x = 0;
    frame.rootOffset.y += verticalBob;

    this.addRot(frame, "hips", { y: hipRoll * 0.8, z: hipRoll, x: -0.03 });
    this.addRot(frame, "spine", { y: shoulderCounter * 0.55, z: -hipRoll * 0.35 });
    this.addRot(frame, "chest", { y: shoulderCounter * 0.75, z: -hipRoll * 0.3 });
    this.addRot(frame, "head", { y: shoulderCounter * 0.36, z: -hipRoll * 0.12, x: -0.02 });

    this.addRot(frame, "leftUpperLeg", { x: leftStep * stride, y: 0.02, z: -0.028 });
    this.addRot(frame, "rightUpperLeg", { x: rightStep * stride, y: -0.02, z: 0.028 });
    this.addRot(frame, "leftLowerLeg", { x: kneeBendL });
    this.addRot(frame, "rightLowerLeg", { x: kneeBendR });
    this.addRot(frame, "leftFoot", { x: -leftStep * 0.18 + kneeBendL * 0.16, z: -0.012 });
    this.addRot(frame, "rightFoot", { x: -rightStep * 0.18 + kneeBendR * 0.16, z: 0.012 });
    this.addRot(frame, "leftToes", { x: Math.max(0, leftStep) * 0.12 });
    this.addRot(frame, "rightToes", { x: Math.max(0, rightStep) * 0.12 });

    this.setRot(frame, "leftUpperArm", { x: -rightStep * 0.2, y: 0.04, z: 1.2 });
    this.setRot(frame, "rightUpperArm", { x: -leftStep * 0.2, y: -0.04, z: -1.2 });
    this.setRot(frame, "leftLowerArm", { x: rightStep * 0.1, z: 0.17 });
    this.setRot(frame, "rightLowerArm", { x: leftStep * 0.1, z: -0.17 });
  }

  private applyTurn(frame: PoseFrame, input: { progress: number; weight: number }, side: 1 | -1): void {
    const yaw = smoothstep(0, 0.62, input.progress) * (1 - smoothstep(0.82, 1, input.progress));
    const hipShift = Math.sin(input.progress * Math.PI) * input.weight;
    this.addRot(frame, "hips", { y: side * 0.3 * yaw, z: -side * 0.03 * hipShift });
    this.addRot(frame, "spine", { y: side * 0.22 * yaw });
    this.addRot(frame, "chest", { y: side * 0.26 * yaw });
    this.addRot(frame, "head", { y: side * 0.3 * yaw, z: -side * 0.04 * hipShift });
    this.addRot(frame, "leftUpperLeg", { y: side * 0.08 * yaw, x: 0.12 * Math.max(0, hipShift) });
    this.addRot(frame, "rightUpperLeg", { y: side * 0.08 * yaw, x: 0.12 * Math.max(0, -hipShift) });
  }

  private applyLook(
    frame: PoseFrame,
    input: { progress: number; weight: number },
    intent: SynraActionIntent
  ): void {
    const hold = smoothstep(0, 0.22, input.progress) * (1 - smoothstep(0.72, 1, input.progress));
    const side = intent.direction === "left" ? 1 : intent.direction === "right" ? -1 : 0;
    const vertical = intent.direction === "up" ? -1 : intent.direction === "down" ? 1 : 0;
    const amount = intent.intensity;
    this.addRot(frame, "head", { y: side * 0.42 * hold * amount, x: vertical * 0.3 * hold * amount, z: side * 0.035 * hold * amount });
    this.addRot(frame, "neck", { y: side * 0.19 * hold * amount, x: vertical * 0.13 * hold * amount });
    this.addRot(frame, "chest", { y: side * 0.1 * hold * amount, x: vertical * 0.08 * hold * amount });
    this.addRot(frame, "upperChest", { y: side * 0.08 * hold * amount, x: vertical * 0.07 * hold * amount });
    this.addRot(frame, "leftEye", { y: side * 0.16 * hold * amount, x: vertical * 0.1 * hold * amount });
    this.addRot(frame, "rightEye", { y: side * 0.16 * hold * amount, x: vertical * 0.1 * hold * amount });
  }

  private applyPoint(frame: PoseFrame, input: { progress: number; weight: number }, intent: SynraActionIntent): void {
    const reach = smoothstep(0.08, 0.45, input.progress) * (1 - smoothstep(0.78, 1, input.progress));
    const pulse = Math.sin(input.progress * Math.PI * 2.2) * input.weight;
    const pointsToScreenLeft = intent.direction === "left";
    const pointsToScreenRight = intent.direction === "right";
    const pointsDown = intent.direction === "down" || intent.id === "show_screen";
    const gazeSide = pointsToScreenLeft ? -1 : pointsToScreenRight ? 1 : 0;
    const gazeDown = pointsDown ? 1 : 0;

    this.addRot(frame, "head", { y: gazeSide * 0.2 * reach, x: (-0.035 + gazeDown * 0.18) * reach });
    this.addRot(frame, "neck", { y: gazeSide * 0.08 * reach, x: gazeDown * 0.06 * reach });
    this.addRot(frame, "chest", { y: gazeSide * 0.08 * reach, x: -0.02 * reach });
    this.addRot(frame, "upperChest", { y: gazeSide * 0.06 * reach, x: -0.014 * reach });

    if (pointsToScreenRight) {
      this.setLeftPointArm(frame, reach, pulse, pointsDown ? "down" : "side");
      this.setRightSoftCounterArm(frame, reach, "waist");
      this.markHard(frame, this.leftArmAndPointBones());
      return;
    }

    this.setRightPointArm(frame, reach, pulse, pointsDown ? "down" : pointsToScreenLeft ? "side" : "forward");
    this.setLeftSoftCounterArm(frame, reach, pointsDown ? "open" : "waist");
    if (!pointsDown) {
      frame.rightArmIk = {
        wrist: {
          x: pointsToScreenLeft ? -0.56 : -0.34,
          y: pointsToScreenLeft ? 1.18 : 1.1,
          z: pointsToScreenLeft ? 0.18 : 0.28
        },
        weight: 0.48 * reach
      };
    }
    this.markHard(frame, this.rightArmAndPointBones());
  }

  private setRightPointArm(frame: PoseFrame, reach: number, pulse: number, variant: "side" | "forward" | "down"): void {
    const side = variant === "side" ? 1 : 0;
    const down = variant === "down" ? 1 : 0;
    this.setRot(frame, "rightShoulder", { x: 0.02, y: -0.03, z: -0.035 * reach });
    this.setRot(frame, "rightUpperArm", {
      x: (-0.12 + down * 0.22) * reach,
      y: (-0.08 - side * 0.1) * reach,
      z: -0.72 + side * 0.2 + down * 0.12
    });
    this.setRot(frame, "rightLowerArm", {
      x: (0.04 + down * 0.08) * reach,
      y: (0.16 + side * 0.24 - down * 0.08) * reach,
      z: -1.26 + side * 0.34 + down * 0.44 + pulse * 0.035
    });
    this.setRot(frame, "rightHand", {
      x: (-0.26 + down * 0.46) * reach,
      y: (0.42 + side * 0.22 - down * 0.1) * reach,
      z: (0.38 - down * 0.22) * reach + pulse * 0.03
    });
    this.setRightPointingFingers(frame);
  }

  private setLeftPointArm(frame: PoseFrame, reach: number, pulse: number, variant: "side" | "down"): void {
    const side = variant === "side" ? 1 : 0;
    const down = variant === "down" ? 1 : 0;
    this.setRot(frame, "leftShoulder", { x: 0.02, y: 0.03, z: 0.035 * reach });
    this.setRot(frame, "leftUpperArm", {
      x: (-0.12 + down * 0.22) * reach,
      y: (0.08 + side * 0.1) * reach,
      z: 0.72 - side * 0.2 - down * 0.12
    });
    this.setRot(frame, "leftLowerArm", {
      x: (0.04 + down * 0.08) * reach,
      y: (-0.16 - side * 0.24 + down * 0.08) * reach,
      z: 1.26 - side * 0.34 - down * 0.44 + pulse * 0.035
    });
    this.setRot(frame, "leftHand", {
      x: (-0.26 + down * 0.46) * reach,
      y: (-0.42 - side * 0.22 + down * 0.1) * reach,
      z: (-0.38 + down * 0.22) * reach - pulse * 0.03
    });
    this.setLeftPointingFingers(frame);
  }

  private setRightOpenPalmArm(
    frame: PoseFrame,
    show: number,
    beat: number,
    variant: "center" | "wide" | "rightOption" | "gather" | "answer"
  ): void {
    const wide = variant === "wide" || variant === "rightOption" ? 1 : 0;
    const gather = variant === "gather" ? 1 : 0;
    const answer = variant === "answer" ? 1 : 0;
    this.setRot(frame, "rightUpperArm", {
      x: (-0.09 - answer * 0.04) * show,
      y: (-0.05 - wide * 0.09 + gather * 0.04) * show,
      z: -0.94 + wide * 0.18 + gather * 0.22 + answer * 0.08
    });
    this.setRot(frame, "rightLowerArm", {
      x: 0.05 * show,
      y: (0.2 + wide * 0.08 + answer * 0.06) * show,
      z: -0.72 - wide * 0.18 - answer * 0.22 + gather * 0.12 + beat
    });
    this.setRot(frame, "rightHand", {
      x: -0.18 * show,
      y: (0.42 + wide * 0.15 + answer * 0.08 - gather * 0.16) * show + beat,
      z: (0.3 + wide * 0.06 - gather * 0.14) * show
    });
    this.setRightOpenFingers(frame, 0.06);
  }

  private setLeftOpenPalmArm(
    frame: PoseFrame,
    show: number,
    beat: number,
    variant: "center" | "wide" | "leftOption" | "gather"
  ): void {
    const wide = variant === "wide" || variant === "leftOption" ? 1 : 0;
    const gather = variant === "gather" ? 1 : 0;
    this.setRot(frame, "leftUpperArm", {
      x: -0.08 * show,
      y: (0.05 + wide * 0.09 - gather * 0.04) * show,
      z: 0.94 - wide * 0.18 - gather * 0.22
    });
    this.setRot(frame, "leftLowerArm", {
      x: 0.05 * show,
      y: (-0.2 - wide * 0.08) * show,
      z: 0.72 + wide * 0.18 - gather * 0.12 + beat
    });
    this.setRot(frame, "leftHand", {
      x: -0.18 * show,
      y: (-0.42 - wide * 0.15 + gather * 0.16) * show - beat,
      z: (-0.3 - wide * 0.06 + gather * 0.14) * show
    });
    this.setLeftOpenFingers(frame, 0.06);
  }

  private setRightSoftCounterArm(frame: PoseFrame, amount: number, variant: "waist" | "relaxed"): void {
    const waist = variant === "waist" ? 1 : 0;
    this.setRot(frame, "rightUpperArm", { x: 0.02 * amount, y: -0.04 * amount, z: -1.12 + 0.1 * waist * amount });
    this.setRot(frame, "rightLowerArm", { x: 0.04 * amount, y: 0.08 * waist * amount, z: -0.34 - 0.42 * waist * amount });
    this.setRot(frame, "rightHand", { x: -0.08 * waist * amount, y: 0.14 * waist * amount, z: 0.08 * amount });
  }

  private setLeftSoftCounterArm(frame: PoseFrame, amount: number, variant: "waist" | "open" | "relaxed"): void {
    const waist = variant === "waist" ? 1 : 0;
    const open = variant === "open" ? 1 : 0;
    this.setRot(frame, "leftUpperArm", { x: -0.02 * open * amount, y: 0.04 * amount, z: 1.12 - 0.1 * waist * amount - 0.12 * open * amount });
    this.setRot(frame, "leftLowerArm", { x: 0.04 * amount, y: -0.08 * waist * amount, z: 0.34 + 0.42 * waist * amount + 0.12 * open * amount });
    this.setRot(frame, "leftHand", { x: -0.08 * waist * amount, y: -0.14 * waist * amount - 0.1 * open * amount, z: -0.08 * amount });
  }

  private setRightPointingFingers(frame: PoseFrame): void {
    this.setRot(frame, "rightThumbMetacarpal", { x: 0.05, y: -0.02, z: -0.1 });
    this.setRot(frame, "rightIndexProximal", { x: -0.03, y: -0.015, z: -0.06 });
    this.setRot(frame, "rightIndexIntermediate", { x: -0.02, z: -0.025 });
    this.setRot(frame, "rightIndexDistal", { x: -0.01, z: -0.012 });
    this.setRot(frame, "rightMiddleProximal", { x: 0.18, z: 0.28 });
    this.setRot(frame, "rightMiddleIntermediate", { x: 0.2, z: 0.18 });
    this.setRot(frame, "rightMiddleDistal", { x: 0.12, z: 0.12 });
    this.setRot(frame, "rightRingProximal", { x: 0.2, z: 0.3 });
    this.setRot(frame, "rightRingIntermediate", { x: 0.22, z: 0.2 });
    this.setRot(frame, "rightRingDistal", { x: 0.14, z: 0.13 });
    this.setRot(frame, "rightLittleProximal", { x: 0.22, z: 0.32 });
    this.setRot(frame, "rightLittleIntermediate", { x: 0.24, z: 0.22 });
    this.setRot(frame, "rightLittleDistal", { x: 0.16, z: 0.14 });
  }

  private setLeftPointingFingers(frame: PoseFrame): void {
    this.setRot(frame, "leftThumbMetacarpal", { x: 0.05, y: 0.02, z: 0.1 });
    this.setRot(frame, "leftIndexProximal", { x: -0.03, y: 0.015, z: 0.06 });
    this.setRot(frame, "leftIndexIntermediate", { x: -0.02, z: 0.025 });
    this.setRot(frame, "leftIndexDistal", { x: -0.01, z: 0.012 });
    this.setRot(frame, "leftMiddleProximal", { x: 0.18, z: -0.28 });
    this.setRot(frame, "leftMiddleIntermediate", { x: 0.2, z: -0.18 });
    this.setRot(frame, "leftMiddleDistal", { x: 0.12, z: -0.12 });
    this.setRot(frame, "leftRingProximal", { x: 0.2, z: -0.3 });
    this.setRot(frame, "leftRingIntermediate", { x: 0.22, z: -0.2 });
    this.setRot(frame, "leftRingDistal", { x: 0.14, z: -0.13 });
    this.setRot(frame, "leftLittleProximal", { x: 0.22, z: -0.32 });
    this.setRot(frame, "leftLittleIntermediate", { x: 0.24, z: -0.22 });
    this.setRot(frame, "leftLittleDistal", { x: 0.16, z: -0.14 });
  }

  private setRightOpenFingers(frame: PoseFrame, curl: number): void {
    this.setRot(frame, "rightThumbMetacarpal", { x: 0.04, y: -0.02, z: -0.08 });
    this.setRot(frame, "rightIndexProximal", { x: curl, z: 0.015 });
    this.setRot(frame, "rightIndexIntermediate", { x: curl * 0.7, z: 0.005 });
    this.setRot(frame, "rightMiddleProximal", { x: curl, z: 0 });
    this.setRot(frame, "rightMiddleIntermediate", { x: curl * 0.7 });
    this.setRot(frame, "rightRingProximal", { x: curl, z: -0.012 });
    this.setRot(frame, "rightRingIntermediate", { x: curl * 0.7 });
    this.setRot(frame, "rightLittleProximal", { x: curl, z: -0.026 });
    this.setRot(frame, "rightLittleIntermediate", { x: curl * 0.7 });
  }

  private setLeftOpenFingers(frame: PoseFrame, curl: number): void {
    this.setRot(frame, "leftThumbMetacarpal", { x: 0.04, y: 0.02, z: 0.08 });
    this.setRot(frame, "leftIndexProximal", { x: curl, z: -0.015 });
    this.setRot(frame, "leftIndexIntermediate", { x: curl * 0.7, z: -0.005 });
    this.setRot(frame, "leftMiddleProximal", { x: curl, z: 0 });
    this.setRot(frame, "leftMiddleIntermediate", { x: curl * 0.7 });
    this.setRot(frame, "leftRingProximal", { x: curl, z: 0.012 });
    this.setRot(frame, "leftRingIntermediate", { x: curl * 0.7 });
    this.setRot(frame, "leftLittleProximal", { x: curl, z: 0.026 });
    this.setRot(frame, "leftLittleIntermediate", { x: curl * 0.7 });
  }

  private rightArmAndPointBones(): BoneName[] {
    return [
      "rightShoulder",
      "rightUpperArm",
      "rightLowerArm",
      "rightHand",
      "rightThumbMetacarpal",
      "rightIndexProximal",
      "rightIndexIntermediate",
      "rightIndexDistal",
      "rightMiddleProximal",
      "rightMiddleIntermediate",
      "rightMiddleDistal",
      "rightRingProximal",
      "rightRingIntermediate",
      "rightRingDistal",
      "rightLittleProximal",
      "rightLittleIntermediate",
      "rightLittleDistal"
    ];
  }

  private leftArmAndPointBones(): BoneName[] {
    return [
      "leftShoulder",
      "leftUpperArm",
      "leftLowerArm",
      "leftHand",
      "leftThumbMetacarpal",
      "leftIndexProximal",
      "leftIndexIntermediate",
      "leftIndexDistal",
      "leftMiddleProximal",
      "leftMiddleIntermediate",
      "leftMiddleDistal",
      "leftRingProximal",
      "leftRingIntermediate",
      "leftRingDistal",
      "leftLittleProximal",
      "leftLittleIntermediate",
      "leftLittleDistal"
    ];
  }

  private bothArmBones(): BoneName[] {
    return [
      "leftShoulder",
      "leftUpperArm",
      "leftLowerArm",
      "leftHand",
      "rightShoulder",
      "rightUpperArm",
      "rightLowerArm",
      "rightHand"
    ];
  }

  private applyBow(frame: PoseFrame, input: { progress: number; weight: number }, intent: SynraActionIntent): void {
    const dip = Math.sin(input.progress * Math.PI) * input.weight * intent.intensity;
    this.addRot(frame, "head", { x: 0.22 * dip });
    this.addRot(frame, "neck", { x: 0.13 * dip });
    this.addRot(frame, "chest", { x: 0.31 * dip });
    this.addRot(frame, "upperChest", { x: 0.24 * dip });
    this.addRot(frame, "spine", { x: 0.16 * dip });
    this.addRot(frame, "hips", { x: 0.08 * dip });
    this.addRot(frame, "leftUpperLeg", { x: -0.12 * dip });
    this.addRot(frame, "rightUpperLeg", { x: -0.12 * dip });
    this.addRot(frame, "leftLowerLeg", { x: 0.18 * dip });
    this.addRot(frame, "rightLowerLeg", { x: 0.18 * dip });
  }

  private applyStretch(frame: PoseFrame, input: { progress: number; weight: number }, intent: SynraActionIntent): void {
    const stretch = Math.sin(input.progress * Math.PI) * input.weight * intent.intensity;
    this.addRot(frame, "head", { x: -0.04 * stretch });
    this.addRot(frame, "chest", { x: -0.12 * stretch });
    this.addRot(frame, "upperChest", { x: -0.1 * stretch });
    this.addRot(frame, "spine", { x: -0.06 * stretch });
    this.setRot(frame, "leftUpperArm", { z: 0.76 - stretch * 0.52, x: -0.14 * stretch });
    this.setRot(frame, "rightUpperArm", { z: -0.76 + stretch * 0.52, x: -0.14 * stretch });
    this.setRot(frame, "leftLowerArm", { z: 0.14 + stretch * 0.22 });
    this.setRot(frame, "rightLowerArm", { z: -0.14 - stretch * 0.22 });
  }

  private applyNod(frame: PoseFrame, input: { progress: number; weight: number }, intent: SynraActionIntent): void {
    const nod = Math.sin(input.progress * Math.PI * 1.65 * Math.min(0.9, intent.tempo)) * input.weight * intent.intensity;
    this.addRot(frame, "head", { x: nod * 0.22 });
    this.addRot(frame, "neck", { x: nod * 0.09 });
    this.addRot(frame, "chest", { x: nod * 0.04 });
  }

  private applyShake(frame: PoseFrame, input: { progress: number; weight: number }, intent: SynraActionIntent): void {
    const shake = Math.sin(input.progress * Math.PI * 2.4 * Math.min(0.9, intent.tempo)) * input.weight * intent.intensity;
    this.addRot(frame, "head", { y: shake * 0.25, z: -shake * 0.04 });
    this.addRot(frame, "neck", { y: shake * 0.11, z: -shake * 0.015 });
    this.addRot(frame, "chest", { y: shake * 0.035 });
  }

  private applyCelebrate(frame: PoseFrame, input: { progress: number; weight: number; now: number }, intent: SynraActionIntent): void {
    const lift = Math.sin(input.progress * Math.PI) * input.weight * intent.intensity;
    const bounce = Math.abs(Math.sin(input.progress * Math.PI * 2.2 * Math.min(0.9, intent.tempo))) * input.weight * 0.025 * intent.intensity;
    frame.rootOffset.y += bounce;
    this.addRot(frame, "head", { x: -0.06 * lift, y: Math.sin(input.progress * Math.PI * 1.2) * 0.045 * lift });
    this.addRot(frame, "chest", { x: -0.08 * lift, z: Math.sin(input.progress * Math.PI * 1.2) * 0.022 * lift });
    this.setRot(frame, "leftUpperArm", { z: 1.0 - 2.05 * lift, x: -0.12 * lift, y: 0.08 * lift });
    this.setRot(frame, "rightUpperArm", { z: -1.0 + 2.05 * lift, x: -0.12 * lift, y: -0.08 * lift });
    this.setRot(frame, "leftLowerArm", { z: 0.18 + 0.18 * lift, x: -0.06 * lift });
    this.setRot(frame, "rightLowerArm", { z: -0.18 - 0.18 * lift, x: -0.06 * lift });
    this.setRot(frame, "leftHand", { z: -0.08 * lift, y: 0.1 * lift, x: -0.08 * lift });
    this.setRot(frame, "rightHand", { z: 0.08 * lift, y: -0.1 * lift, x: -0.08 * lift });
    this.markHard(frame, ["leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm", "leftHand", "rightHand"]);
  }

  private applyExplain(frame: PoseFrame, input: { progress: number; weight: number; now: number }, intent: SynraActionIntent): void {
    const show = smoothstep(0.05, 0.28, input.progress) * (1 - smoothstep(0.78, 1, input.progress)) * intent.intensity;
    const beat = Math.sin(input.progress * Math.PI * 1.9 * Math.min(0.9, intent.tempo)) * input.weight * 0.09;
    const twoHanded = intent.id === "compare" || intent.id === "explain_big" || intent.id === "spark_pose";
    const centerPresent = intent.id === "present" || intent.id === "attentive_present" || intent.id === "hello_present" || intent.id === "agree_present";
    const gather = intent.id === "summarize";
    const step = intent.id === "explain_step" || intent.id === "teach";
    const answer = intent.id === "answer";
    const compareSide = Math.sin(input.progress * Math.PI * 1.45) * show;

    if (intent.id === "compare") {
      this.addRot(frame, "head", { x: -0.035 * show, y: compareSide * 0.1 });
      this.addRot(frame, "chest", { x: -0.025 * show, y: -compareSide * 0.04 });
      this.setLeftOpenPalmArm(frame, show, beat, "leftOption");
      this.setRightOpenPalmArm(frame, show, -beat, "rightOption");
      this.markHard(frame, this.bothArmBones());
      return;
    }

    if (gather) {
      this.addRot(frame, "head", { x: -0.04 * show });
      this.addRot(frame, "chest", { x: -0.035 * show });
      this.setLeftOpenPalmArm(frame, show, beat, "gather");
      this.setRightOpenPalmArm(frame, show, -beat, "gather");
      this.markHard(frame, this.bothArmBones());
      return;
    }

    if (centerPresent || twoHanded) {
      this.addRot(frame, "head", { x: -0.03 * show, y: twoHanded ? 0 : -0.045 * show });
      this.addRot(frame, "chest", { x: -0.026 * show, y: twoHanded ? 0 : -0.035 * show });
      this.setLeftOpenPalmArm(frame, show, beat, twoHanded ? "wide" : "center");
      this.setRightOpenPalmArm(frame, show, -beat, twoHanded ? "wide" : "center");
      this.markHard(frame, this.bothArmBones());
      return;
    }

    if (step) {
      this.addRot(frame, "head", { x: -0.04 * show, y: -0.04 * show });
      this.addRot(frame, "chest", { x: -0.03 * show, y: -0.03 * show });
      this.setRightPointArm(frame, show, beat, "forward");
      this.setLeftOpenPalmArm(frame, show, -beat, "center");
      this.markHard(frame, [...this.rightArmAndPointBones(), "leftUpperArm", "leftLowerArm", "leftHand"]);
      return;
    }

    this.addRot(frame, "head", { x: -0.035 * show, y: answer ? -0.02 * show : -0.05 * show });
    this.addRot(frame, "chest", { x: -0.03 * show, y: answer ? -0.015 * show : -0.04 * show });
    this.setRightOpenPalmArm(frame, show, beat, answer ? "answer" : "center");
    this.setLeftSoftCounterArm(frame, show, "relaxed");
    this.markHard(frame, ["rightUpperArm", "rightLowerArm", "rightHand"]);
  }

  private applyReassure(frame: PoseFrame, input: { progress: number; weight: number; now: number }, intent: SynraActionIntent): void {
    const soften = Math.sin(input.progress * Math.PI) * input.weight * intent.intensity;
    const concerned = intent.id === "concerned" || intent.id === "error_calm";
    const comfort = intent.id === "comfort" || intent.id === "gentle";
    this.addRot(frame, "head", { x: (concerned ? 0.025 : -0.02) * soften, y: 0.04 * soften, z: 0.03 * soften });
    this.addRot(frame, "chest", { x: (concerned ? 0.01 : -0.035) * soften, y: 0.035 * soften });
    this.setRot(frame, "rightUpperArm", { z: -1.0 + 0.12 * soften, y: -0.06 * soften });
    this.setRot(frame, "rightLowerArm", { z: -0.55 - 0.32 * soften, y: (comfort ? 0.36 : 0.22) * soften });
    this.setRot(frame, "rightHand", { x: -0.18 * soften, y: (comfort ? 0.42 : 0.32) * soften, z: 0.18 * soften });
    if (concerned || comfort) {
      this.setRot(frame, "leftUpperArm", { z: 1.04 - 0.08 * soften, y: 0.04 * soften });
      this.setRot(frame, "leftLowerArm", { z: 0.48 + 0.16 * soften, y: -0.12 * soften });
      this.setRot(frame, "leftHand", { x: -0.12 * soften, y: -0.18 * soften, z: -0.1 * soften });
      this.markHard(frame, ["leftUpperArm", "leftLowerArm", "leftHand"]);
    }
    this.applyNod(frame, { progress: input.progress, weight: input.weight * 0.38 }, intent);
    this.markHard(frame, ["rightUpperArm", "rightLowerArm", "rightHand"]);
  }

  private applyCurious(frame: PoseFrame, input: { progress: number; weight: number; now: number }, intent: SynraActionIntent): void {
    const hold = smoothstep(0.08, 0.3, input.progress) * (1 - smoothstep(0.76, 1, input.progress)) * intent.intensity;
    const side = intent.direction === "right" ? -1 : 1;
    this.addRot(frame, "head", { y: side * 0.18 * hold, z: -side * 0.13 * hold, x: -0.04 * hold });
    this.addRot(frame, "neck", { y: side * 0.08 * hold, z: -side * 0.04 * hold });
    this.addRot(frame, "chest", { y: side * 0.05 * hold });
    this.addRot(frame, "leftEye", { y: side * 0.06 * hold, x: -0.018 * hold });
    this.addRot(frame, "rightEye", { y: side * 0.06 * hold, x: -0.018 * hold });
    if (intent.id === "ask_question") {
      this.setRightOpenPalmArm(frame, hold, Math.sin(input.progress * Math.PI * 2) * 0.04 * input.weight, "answer");
      this.setLeftSoftCounterArm(frame, hold, "relaxed");
      this.markHard(frame, ["rightUpperArm", "rightLowerArm", "rightHand"]);
    } else if (intent.id === "lookaround" || intent.id === "device_scan") {
      this.addRot(frame, "upperChest", { y: -side * 0.12 * hold });
      this.addRot(frame, "hips", { y: side * 0.035 * hold });
    } else if (intent.id === "confused_tilt") {
      this.setRot(frame, "rightUpperArm", { z: -1.06, y: -0.08 * hold });
      this.setRot(frame, "rightLowerArm", { z: -0.92, y: 0.32 * hold });
      this.setRot(frame, "rightHand", { x: -0.32 * hold, y: 0.18 * hold, z: 0.12 * hold });
      this.markHard(frame, ["rightUpperArm", "rightLowerArm", "rightHand"]);
    }
  }

  private applyPresenceGesture(frame: PoseFrame, input: { progress: number; weight: number; now: number }, intent: SynraActionIntent): void {
    const hold = Math.sin(input.progress * Math.PI) * input.weight * intent.intensity;
    const side = intent.family === "shy" ? 1 : -1;
    const forward = intent.family === "listen" ? -0.08 : intent.family === "think" || intent.family === "focus" ? -0.04 : -0.02;
    this.addRot(frame, "head", { x: forward * hold, y: side * 0.06 * hold, z: -side * 0.035 * hold });
    this.addRot(frame, "chest", { x: forward * 0.45 * hold, y: side * 0.035 * hold });
    if (intent.family === "think") {
      this.setRot(frame, "rightUpperArm", { z: -1.0, y: -0.08 * hold });
      this.setRot(frame, "rightLowerArm", { z: -1.02, y: 0.46 * hold });
      this.setRot(frame, "rightHand", { x: -0.42 * hold, y: 0.3 * hold, z: 0.16 * hold });
      this.markHard(frame, ["rightUpperArm", "rightLowerArm", "rightHand"]);
    } else if (intent.id === "decision") {
      this.setRot(frame, "rightUpperArm", { z: -0.96, y: -0.06 * hold });
      this.setRot(frame, "rightLowerArm", { z: -0.84, y: 0.36 * hold });
      this.setRot(frame, "rightHand", { x: -0.18 * hold, y: 0.3 * hold, z: 0.18 * hold });
      this.setRot(frame, "leftUpperArm", { z: 0.98, y: 0.05 * hold });
      this.setRot(frame, "leftLowerArm", { z: 0.62, y: -0.2 * hold });
      this.setRot(frame, "leftHand", { x: -0.14 * hold, y: -0.24 * hold, z: -0.1 * hold });
      this.markHard(frame, this.bothArmBones());
    } else if (intent.family === "listen") {
      this.setRot(frame, "leftUpperArm", { z: 1.08, x: -0.04 * hold });
      this.setRot(frame, "rightUpperArm", { z: -1.08, x: -0.04 * hold });
      this.addRot(frame, "upperChest", { x: -0.035 * hold });
    } else if (intent.family === "shy") {
      this.setRot(frame, "rightUpperArm", { z: -1.08 + 0.18 * hold, y: -0.08 * hold });
      this.setRot(frame, "rightLowerArm", { z: -0.58 - 0.28 * hold, y: 0.32 * hold });
      this.setRot(frame, "rightHand", { x: -0.16 * hold, y: 0.22 * hold, z: 0.16 * hold });
      this.markHard(frame, ["rightUpperArm", "rightLowerArm", "rightHand"]);
    }
  }

  private applyEmote(frame: PoseFrame, input: { progress: number; weight: number; now: number }, intent: SynraActionIntent): void {
    const pulse = Math.sin(input.progress * Math.PI) * input.weight * intent.intensity;
    const sway = Math.sin(input.progress * Math.PI * 1.35 * Math.min(0.9, intent.tempo)) * input.weight * 0.045 * intent.intensity;
    if (intent.id === "surprised_pop") {
      this.addRot(frame, "head", { x: -0.08 * pulse });
      this.addRot(frame, "chest", { x: -0.05 * pulse });
      this.setLeftOpenPalmArm(frame, pulse, 0, "wide");
      this.setRightOpenPalmArm(frame, pulse, 0, "wide");
      this.markHard(frame, this.bothArmBones());
      return;
    }
    if (intent.id === "shoulder_shift") {
      this.addRot(frame, "upperChest", { z: sway * 1.6, y: -sway * 0.8 });
      this.addRot(frame, "leftShoulder", { z: pulse * 0.12 });
      this.addRot(frame, "rightShoulder", { z: -pulse * 0.1 });
      return;
    }
    if (intent.id === "hand_fidget" || intent.id === "wink_energy") {
      this.setRot(frame, "rightUpperArm", { z: -1.02, y: -0.05 * pulse });
      this.setRot(frame, "rightLowerArm", { z: -0.66 - 0.18 * pulse, y: 0.18 * pulse });
      this.setRot(frame, "rightHand", { x: -0.08 * pulse, y: 0.18 * pulse, z: 0.12 * Math.sin(input.progress * Math.PI * 4) });
      this.setRightOpenFingers(frame, 0.1 + 0.08 * pulse);
      this.markHard(frame, ["rightUpperArm", "rightLowerArm", "rightHand"]);
      return;
    }
    if (intent.id === "lean_back") {
      this.addRot(frame, "head", { x: 0.04 * pulse });
      this.addRot(frame, "chest", { x: 0.08 * pulse });
      this.addRot(frame, "upperChest", { x: 0.06 * pulse });
      this.setLeftOpenPalmArm(frame, pulse * 0.7, 0, "center");
      this.setRightOpenPalmArm(frame, pulse * 0.7, 0, "center");
      return;
    }
    this.addRot(frame, "hips", { z: sway * 0.42, y: sway * 0.2 });
    this.addRot(frame, "chest", { y: -sway, z: -sway * 0.35 });
    this.addRot(frame, "head", { y: sway * 0.8, x: -0.02 * pulse });
    this.addRot(frame, "rightHand", { y: 0.08 * pulse, z: 0.05 * pulse });
    this.addRot(frame, "leftHand", { y: -0.06 * pulse, z: -0.04 * pulse });
  }

  private applyIdleAction(frame: PoseFrame, input: { progress: number; weight: number; now: number }, intent: SynraActionIntent): void {
    const settle = Math.sin(input.progress * Math.PI) * input.weight * intent.intensity;
    if (intent.id === "reset_pose") {
      this.addRot(frame, "head", { x: -0.01 * settle });
      this.addRot(frame, "chest", { x: -0.01 * settle });
      return;
    }
    this.addRot(frame, "hips", { z: 0.035 * settle, y: 0.018 * settle });
    this.addRot(frame, "spine", { z: -0.02 * settle, y: -0.012 * settle });
    this.addRot(frame, "chest", { z: -0.025 * settle, y: -0.018 * settle });
    this.addRot(frame, "head", { z: 0.025 * settle, y: 0.03 * settle, x: -0.018 * settle });
    this.addRot(frame, "leftUpperLeg", { z: -0.014 * settle });
    this.addRot(frame, "rightUpperLeg", { z: 0.014 * settle });
  }
}

function breathShoulder(now: number): number {
  return Math.max(0, Math.sin(now * 1.08)) * 0.006;
}
