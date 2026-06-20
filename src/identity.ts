import type { KnownUserProfile, SynraFacePose, SynraIdentityReadiness } from "./types";

export const FACE_ENROLLMENT_POSES = ["center", "turnLeft", "turnRight", "lookUp", "lookDown", "rollLeft", "rollRight"] as const satisfies readonly SynraFacePose[];
export const REQUIRED_FACE_POSE_COUNT = FACE_ENROLLMENT_POSES.length;
export const REQUIRED_VOICE_SAMPLE_COUNT = 3;

export function identityReadinessForUser(user: KnownUserProfile | undefined): SynraIdentityReadiness {
  const faceSampleCount = user?.faceSamples?.length ?? 0;
  const voiceSampleCount = user?.voicePrints?.length ?? 0;
  const faceReady = faceSampleCount >= REQUIRED_FACE_POSE_COUNT;
  const voiceReady = voiceSampleCount >= REQUIRED_VOICE_SAMPLE_COUNT;
  return {
    faceSampleCount,
    voiceSampleCount,
    requiredFacePoseCount: REQUIRED_FACE_POSE_COUNT,
    requiredVoiceSampleCount: REQUIRED_VOICE_SAMPLE_COUNT,
    faceReady,
    voiceReady,
    overallReady: faceReady && voiceReady
  };
}
