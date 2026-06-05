export const SYNRA_LIVING_PERFORMANCE_ENGINE_MARKER = "Synra Living Performance Engine";
export const SYNRA_LIVING_PERFORMANCE_ENGINE_VERSION = "1.0";

export type SynraLivingGazeTarget =
  | "user/camera"
  | "screen/app panel"
  | "thinking-away"
  | "idle-glance"
  | "questioning-user"
  | "concerned-user";

export interface SynraLivingLayerState {
  marker: string;
  version: string;
  lifeLayerActive: boolean;
  breathing: boolean;
  blinkState: string;
  postureState: string;
  gazeTarget: SynraLivingGazeTarget | string;
  microGazeActive: boolean;
  postureDriftActive: boolean;
  oneShotReturnToIdle: boolean;
  localFullBodyProtected: boolean;
  reduceMotion: boolean;
}

export function createLivingLayerState(input: Omit<SynraLivingLayerState, "marker" | "version">): SynraLivingLayerState {
  return {
    marker: SYNRA_LIVING_PERFORMANCE_ENGINE_MARKER,
    version: SYNRA_LIVING_PERFORMANCE_ENGINE_VERSION,
    ...input
  };
}

export function isExtremeDemoMotionId(id: string | null | undefined): boolean {
  if (!id) return false;
  return /run|spin|squat|jump|dash|handstand|ground|one.?leg|float|sit|dogeza|humidai/i.test(id);
}
