export type SynraMode = "idle" | "listening" | "thinking" | "speaking" | "walking";

export type SynraActionName = string;

export type SynraExpression =
  | "soft_smile"
  | "focused"
  | "happy"
  | "curious"
  | "thinking"
  | "attentive"
  | "bright"
  | "confused"
  | "blush"
  | "reassure"
  | "delighted"
  | "relaxed"
  | "surprised";

export type BoneName =
  | "head"
  | "neck"
  | "chest"
  | "upperChest"
  | "spine"
  | "hips"
  | "leftEye"
  | "rightEye"
  | "leftShoulder"
  | "leftUpperArm"
  | "leftLowerArm"
  | "leftHand"
  | "rightShoulder"
  | "rightUpperArm"
  | "rightLowerArm"
  | "rightHand"
  | "leftUpperLeg"
  | "leftLowerLeg"
  | "leftFoot"
  | "leftToes"
  | "rightUpperLeg"
  | "rightLowerLeg"
  | "rightFoot"
  | "rightToes"
  | "leftThumbMetacarpal"
  | "leftThumbProximal"
  | "leftThumbDistal"
  | "leftIndexProximal"
  | "leftIndexIntermediate"
  | "leftIndexDistal"
  | "leftMiddleProximal"
  | "leftMiddleIntermediate"
  | "leftMiddleDistal"
  | "leftRingProximal"
  | "leftRingIntermediate"
  | "leftRingDistal"
  | "leftLittleProximal"
  | "leftLittleIntermediate"
  | "leftLittleDistal"
  | "rightThumbMetacarpal"
  | "rightThumbProximal"
  | "rightThumbDistal"
  | "rightIndexProximal"
  | "rightIndexIntermediate"
  | "rightIndexDistal"
  | "rightMiddleProximal"
  | "rightMiddleIntermediate"
  | "rightMiddleDistal"
  | "rightRingProximal"
  | "rightRingIntermediate"
  | "rightRingDistal"
  | "rightLittleProximal"
  | "rightLittleIntermediate"
  | "rightLittleDistal";

export interface EulerPose {
  x?: number;
  y?: number;
  z?: number;
}

export interface PoseFrame {
  rootOffset: { x: number; y: number; z: number };
  rotations: Partial<Record<BoneName, EulerPose>>;
  expressions: Record<string, number>;
  blend: number;
  hardBones: BoneName[];
  activeAction?: {
    name: SynraActionName;
    progress: number;
    weight: number;
  };
  rightArmIk?: {
    wrist: { x: number; y: number; z: number };
    weight: number;
  };
}

export interface MotionInput {
  now: number;
  delta: number;
}
