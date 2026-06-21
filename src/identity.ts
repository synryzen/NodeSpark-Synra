import type { KnownUserProfile, SynraFacePose, SynraFacePoseSamples, SynraIdentityReadiness } from "./types";

export const FACE_ENROLLMENT_POSES = ["center", "turnLeft", "turnRight", "lookUp", "lookDown", "rollLeft", "rollRight"] as const satisfies readonly SynraFacePose[];
export const FACE_ENROLLMENT_POSE_LABELS: Record<SynraFacePose, string> = {
  center: "Center",
  turnLeft: "Turn left",
  turnRight: "Turn right",
  lookUp: "Look up",
  lookDown: "Look down",
  rollLeft: "Tilt left",
  rollRight: "Tilt right"
};
export const FACE_ENROLLMENT_POSE_INSTRUCTIONS: Record<SynraFacePose, string> = {
  center: "Face the camera straight on.",
  turnLeft: "Turn your face slightly left.",
  turnRight: "Turn your face slightly right.",
  lookUp: "Lift your chin slightly.",
  lookDown: "Lower your chin slightly.",
  rollLeft: "Tilt your head left.",
  rollRight: "Tilt your head right."
};
export const REQUIRED_FACE_POSE_COUNT = FACE_ENROLLMENT_POSES.length;
export const REQUIRED_VOICE_SAMPLE_COUNT = 3;

export function normalizeFacePoseSamples(value: unknown): SynraFacePoseSamples {
  const samples: SynraFacePoseSamples = {};
  if (!value || typeof value !== "object") return samples;
  const record = value as Partial<Record<SynraFacePose, unknown>>;
  for (const pose of FACE_ENROLLMENT_POSES) {
    const sample = record[pose];
    if (typeof sample === "string" && sample.trim()) samples[pose] = sample;
  }
  return samples;
}

export function faceSamplesFromPoseMap(samples: SynraFacePoseSamples): string[] {
  return FACE_ENROLLMENT_POSES
    .map((pose) => samples[pose])
    .filter((sample): sample is string => Boolean(sample));
}

export function identityReadinessForUser(user: KnownUserProfile | undefined): SynraIdentityReadiness {
  const poseSamples = normalizeFacePoseSamples(user?.facePoseSamples);
  const completedFacePoses = FACE_ENROLLMENT_POSES.filter((pose) => Boolean(poseSamples[pose]));
  const missingFacePoses = FACE_ENROLLMENT_POSES.filter((pose) => !poseSamples[pose]);
  const legacyFaceSampleCount = user?.faceSamples?.length ?? 0;
  const faceSampleCount = Math.max(completedFacePoses.length, Math.min(legacyFaceSampleCount, REQUIRED_FACE_POSE_COUNT));
  const voiceSampleCount = user?.voicePrints?.length ?? 0;
  const faceReady = faceSampleCount >= REQUIRED_FACE_POSE_COUNT;
  const voiceReady = voiceSampleCount >= REQUIRED_VOICE_SAMPLE_COUNT;
  return {
    faceSampleCount,
    voiceSampleCount,
    requiredFacePoseCount: REQUIRED_FACE_POSE_COUNT,
    requiredVoiceSampleCount: REQUIRED_VOICE_SAMPLE_COUNT,
    completedFacePoses,
    missingFacePoses,
    faceReady,
    voiceReady,
    overallReady: faceReady && voiceReady
  };
}
