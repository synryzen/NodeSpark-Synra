import { FACE_ENROLLMENT_POSES, REQUIRED_FACE_POSE_COUNT, REQUIRED_VOICE_SAMPLE_COUNT } from "./identity";
import type { SynraFacePose } from "./types";

export type SynraIdentityPermissionState = "unknown" | "ready" | "requesting" | "denied" | "unavailable";
export type SynraIdentityDeviceState = "ready" | "active" | "degraded" | "permission-needed" | "not-configured" | "unavailable";
export type SynraIdentityEnrollmentPhase = "idle" | "requesting-permission" | "previewing" | "recording" | "analyzing" | "accepted" | "retry" | "failed";

export interface SynraIdentityEnrollmentStatus {
  phase: SynraIdentityEnrollmentPhase;
  title: string;
  detail: string;
  progress: number;
  score: number;
  checks: string[];
}

export interface SynraIdentityReadinessStatus {
  ownerReady: boolean;
  faceReady: boolean;
  voiceReady: boolean;
  trustedActionsReady: boolean;
  overallScore: number;
  confidence: number;
  lastVerifiedAt: string | null;
  source: string;
  summary: string;
}

export interface SynraIdentityStatus {
  generatedAt: string;
  cameraPermission: SynraIdentityPermissionState;
  microphonePermission: SynraIdentityPermissionState;
  cameraDevice: SynraIdentityDeviceState;
  microphoneDevice: SynraIdentityDeviceState;
  sttRoute: SynraIdentityDeviceState;
  speakerRoute: SynraIdentityDeviceState;
  faceSampleCount: number;
  voiceSampleCount: number;
  requiredFacePoseCount: number;
  requiredVoiceSampleCount: number;
  completedFacePoses: SynraFacePose[];
  missingFacePoses: SynraFacePose[];
  face: SynraIdentityEnrollmentStatus;
  voice: SynraIdentityEnrollmentStatus;
  readiness: SynraIdentityReadinessStatus;
  privacy: {
    rawSamplesStored: false;
    rawSamplesLeaveDevice: false;
    telemetryContainsRawFrames: false;
    telemetryContainsRawAudio: false;
  };
}

export const defaultIdentityStatus: SynraIdentityStatus = {
  generatedAt: new Date(0).toISOString(),
  cameraPermission: "unknown",
  microphonePermission: "unknown",
  cameraDevice: "not-configured",
  microphoneDevice: "not-configured",
  sttRoute: "not-configured",
  speakerRoute: "ready",
  faceSampleCount: 0,
  voiceSampleCount: 0,
  requiredFacePoseCount: REQUIRED_FACE_POSE_COUNT,
  requiredVoiceSampleCount: REQUIRED_VOICE_SAMPLE_COUNT,
  completedFacePoses: [],
  missingFacePoses: [...FACE_ENROLLMENT_POSES],
  face: {
    phase: "idle",
    title: "Face setup waiting",
    detail: "Capture seven local face poses.",
    progress: 0,
    score: 0,
    checks: ["Permission waiting", "Quality waiting", "Stored locally"]
  },
  voice: {
    phase: "idle",
    title: "Voice setup waiting",
    detail: "Record three clean owner voice samples.",
    progress: 0,
    score: 0,
    checks: ["Mic waiting", "Isolation waiting", "Stored locally"]
  },
  readiness: {
    ownerReady: false,
    faceReady: false,
    voiceReady: false,
    trustedActionsReady: false,
    overallScore: 0,
    confidence: 0,
    lastVerifiedAt: null,
    source: "standalone",
    summary: "Identity setup has not started."
  },
  privacy: {
    rawSamplesStored: false,
    rawSamplesLeaveDevice: false,
    telemetryContainsRawFrames: false,
    telemetryContainsRawAudio: false
  }
};

export function normalizeIdentityStatus(input: Partial<SynraIdentityStatus> | undefined): SynraIdentityStatus {
  const faceSampleCount = clampCount(input?.faceSampleCount ?? defaultIdentityStatus.faceSampleCount, input?.requiredFacePoseCount ?? defaultIdentityStatus.requiredFacePoseCount);
  const voiceSampleCount = clampCount(input?.voiceSampleCount ?? defaultIdentityStatus.voiceSampleCount, input?.requiredVoiceSampleCount ?? defaultIdentityStatus.requiredVoiceSampleCount);
  const requiredFacePoseCount = Math.max(1, Math.floor(input?.requiredFacePoseCount ?? defaultIdentityStatus.requiredFacePoseCount));
  const requiredVoiceSampleCount = Math.max(1, Math.floor(input?.requiredVoiceSampleCount ?? defaultIdentityStatus.requiredVoiceSampleCount));
  const completedFacePoses = normalizeFacePoseList(input?.completedFacePoses ?? defaultIdentityStatus.completedFacePoses);
  const missingFacePoses = FACE_ENROLLMENT_POSES.filter((pose) => !completedFacePoses.includes(pose));
  const faceReady = faceSampleCount >= requiredFacePoseCount;
  const voiceReady = voiceSampleCount >= requiredVoiceSampleCount;
  const overallScore = clampUnit((faceSampleCount / requiredFacePoseCount + voiceSampleCount / requiredVoiceSampleCount) / 2);
  const confidence = clampUnit(input?.readiness?.confidence ?? overallScore);
  const ownerReady = input?.readiness?.ownerReady ?? (faceReady || voiceReady);
  const trustedActionsReady = input?.readiness?.trustedActionsReady ?? (ownerReady && faceReady && voiceReady);

  return {
    ...defaultIdentityStatus,
    ...input,
    faceSampleCount,
    voiceSampleCount,
    requiredFacePoseCount,
    requiredVoiceSampleCount,
    completedFacePoses,
    missingFacePoses,
    face: {
      ...defaultIdentityStatus.face,
      ...(input?.face ?? {}),
      progress: clampUnit(input?.face?.progress ?? faceSampleCount / requiredFacePoseCount),
      score: clampUnit(input?.face?.score ?? faceSampleCount / requiredFacePoseCount),
      checks: input?.face?.checks?.length ? input.face.checks : defaultIdentityStatus.face.checks
    },
    voice: {
      ...defaultIdentityStatus.voice,
      ...(input?.voice ?? {}),
      progress: clampUnit(input?.voice?.progress ?? voiceSampleCount / requiredVoiceSampleCount),
      score: clampUnit(input?.voice?.score ?? voiceSampleCount / requiredVoiceSampleCount),
      checks: input?.voice?.checks?.length ? input.voice.checks : defaultIdentityStatus.voice.checks
    },
    readiness: {
      ...defaultIdentityStatus.readiness,
      ...(input?.readiness ?? {}),
      ownerReady,
      faceReady,
      voiceReady,
      trustedActionsReady,
      overallScore,
      confidence
    },
    privacy: defaultIdentityStatus.privacy
  };
}

function normalizeFacePoseList(value: SynraFacePose[]): SynraFacePose[] {
  return FACE_ENROLLMENT_POSES.filter((pose) => value.includes(pose));
}

function clampCount(value: number, max: number): number {
  return Math.max(0, Math.min(Number.isFinite(value) ? Math.floor(value) : 0, max));
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(Number.isFinite(value) ? value : 0, 1));
}
