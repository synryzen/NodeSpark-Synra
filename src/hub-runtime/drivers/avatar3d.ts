import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import { lerp } from "../core/math";
import { SynraMotionEngine } from "../core/motion-engine";
import {
  SYNRA_PERFORMANCE_RUNTIME_MARKER,
  SynraPerformanceController,
  type SynraPerformanceOption
} from "../core/synra-performance-controller";
import { getSynraExperienceSettings } from "../services/synra-living-experience";
import { resolveSynraActionIntent, type SynraActionIntent } from "../services/synra-action-catalog";
import { SynraAuthoredMotionPlayer, type SynraMotionChannel, type SynraResolvedMotionRoute } from "../services/authored-motion";
import { resolveSynraMotionFallbackDecision, type SynraMotionFallbackDecision } from "../services/synra-motion-fallback-policy";
import type { BoneName, PoseFrame, SynraActionName, SynraExpression, SynraMode } from "../types/avatar";
import type { SpeechGestureIntent, SpeechSentenceTone, SpeechUnit, SpeechVisemeMetadata, SpeechVisemes } from "../services/speech-output";

type BoneMap = Partial<Record<BoneName, THREE.Object3D>>;
type MorphMesh = THREE.Mesh & {
  morphTargetDictionary: Record<string, number>;
  morphTargetInfluences: number[];
};
type AvatarExpressionProfile = {
  id: "classic" | "code1";
  blinkMax: number;
  blinkCurve: number;
  expressionScale: Partial<Record<string, number>>;
  expressionMax: Partial<Record<string, number>>;
  restMouthClose: number;
  minimumMouthClose: number;
  expressiveMouthRelease: number;
  visemeScale: number;
  expressionLerp: number;
};
type SynraBodyPlaybackMode = "playground" | "hybrid";
type SynraRuntimeMotionMode = "hybrid" | "procedural" | "vroidParity";
type GazeDirection = "left" | "right" | "up" | "down" | "center";
type GazeOverride = {
  direction: GazeDirection;
  startedAt: number;
  until: number;
  strength: number;
};
type PointerFocus = {
  x: number;
  y: number;
  lastSeenAt: number;
  lastMovedAt: number;
};
type SpeechPerformanceFrame = {
  peak: number;
  onset: number;
  phrase: number;
  gazeBias: number;
  lastVisemeAt: number;
  phonemeUnit: SpeechUnit | "unknown";
  phraseProgress: number;
  mouthShapeVariety: number;
  consonantBias: number;
  vowelBias: number;
  sentenceTone: SpeechSentenceTone | "unknown";
  gestureIntent: SpeechGestureIntent | "unknown";
  sentenceProgress: number;
  emphasisBeat: number;
  pauseStrength: number;
};
type SynraSpeakingLifeCalibrationMode = "auto" | "expressive" | "balanced" | "reduced";
type SynraSpeakingLifeCalibrationId = "expressive_desktop" | "balanced_ios" | "reduced_motion";
type SynraSpeakingLifeProfile = {
  marker: "synra-speaking-life-profile-v2";
  id: "alive_speech_v2";
  calibrationId: SynraSpeakingLifeCalibrationId;
  calibrationMode: SynraSpeakingLifeCalibrationMode;
  deviceProfile: "desktop" | "ios";
  reduceMotion: boolean;
  localInstalledOverlayStrength: number;
  proceduralOverlayStrength: number;
  mouthOpenScale: number;
  fallbackOpenScale: number;
  consonantPulseScale: number;
  vowelHoldScale: number;
  visemeAttack: number;
  visemeRelease: number;
  headMotionScale: number;
  handBeatScale: number;
  microGestureScale: number;
  jawMotionScale: number;
  phraseGestureScale: number;
  speechGazeScale: number;
};
type SynraRuntimeHealthSnapshot = {
  webglReady: boolean;
  webglContextLost: boolean;
  canvasVisible: boolean;
  canvasWidth: number;
  canvasHeight: number;
  rendererReady: boolean;
  renderHeartbeat: boolean;
  lastRenderAt: string | null;
  lastRenderAgeMs: number | null;
  frameCount: number;
  targetFps: number;
  mobilePerformanceMode: boolean;
  adaptivePixelRatio: number;
};

const INVERTED_ARM_BONES = new Set<BoneName>([
  "leftUpperArm",
  "rightUpperArm",
  "leftLowerArm",
  "rightLowerArm"
]);

const PROCEDURAL_QUALITY_FAMILIES = new Set(["wave", "point", "explain"]);
const VRM_PRESET_EXPRESSION_KEYS = new Set([
  "neutral",
  "happy",
  "relaxed",
  "sad",
  "angry",
  "surprised",
  "blink",
  "blinkLeft",
  "blinkRight"
]);
const CLASSIC_EXPRESSION_PROFILE: AvatarExpressionProfile = {
  id: "classic",
  blinkMax: 0.88,
  blinkCurve: 1,
  expressionScale: {
    happy: 1,
    relaxed: 0.96,
    surprised: 0.9,
    sad: 0.78,
    angry: 0.75
  },
  expressionMax: {
    happy: 0.65,
    relaxed: 0.55,
    surprised: 0.65,
    sad: 0.45,
    angry: 0.45
  },
  restMouthClose: 0.86,
  minimumMouthClose: 0.48,
  expressiveMouthRelease: 0.42,
  visemeScale: 1,
  expressionLerp: 0.22
};
const CODE1_EXPRESSION_PROFILE: AvatarExpressionProfile = {
  id: "code1",
  blinkMax: 0.52,
  blinkCurve: 0.74,
  expressionScale: {
    happy: 0.78,
    relaxed: 0.72,
    surprised: 0.62,
    sad: 0.58,
    angry: 0.55
  },
  expressionMax: {
    happy: 0.55,
    relaxed: 0.48,
    surprised: 0.55,
    sad: 0.38,
    angry: 0.38
  },
  restMouthClose: 0.84,
  minimumMouthClose: 0.5,
  expressiveMouthRelease: 0.38,
  visemeScale: 0.88,
  expressionLerp: 0.18
};
const SYNRA_SPEAKING_LIFE_PROFILE: SynraSpeakingLifeProfile = {
  marker: "synra-speaking-life-profile-v2",
  id: "alive_speech_v2",
  calibrationId: "expressive_desktop",
  calibrationMode: "auto",
  deviceProfile: "desktop",
  reduceMotion: false,
  localInstalledOverlayStrength: 0.5,
  proceduralOverlayStrength: 0.88,
  mouthOpenScale: 0.56,
  fallbackOpenScale: 0.8,
  consonantPulseScale: 0.15,
  vowelHoldScale: 0.11,
  visemeAttack: 0.7,
  visemeRelease: 0.34,
  headMotionScale: 1.22,
  handBeatScale: 1.34,
  microGestureScale: 1.18,
  jawMotionScale: 1.14,
  phraseGestureScale: 1.2,
  speechGazeScale: 1.12
};
const SYNRA_SPEAKING_LIFE_CALIBRATIONS: Record<SynraSpeakingLifeCalibrationId, Partial<SynraSpeakingLifeProfile>> = {
  expressive_desktop: {
    localInstalledOverlayStrength: 0.64,
    proceduralOverlayStrength: 1.06,
    mouthOpenScale: 0.68,
    fallbackOpenScale: 0.91,
    consonantPulseScale: 0.21,
    vowelHoldScale: 0.16,
    visemeAttack: 0.82,
    visemeRelease: 0.42,
    headMotionScale: 1.44,
    handBeatScale: 1.58,
    microGestureScale: 1.34,
    jawMotionScale: 1.3,
    phraseGestureScale: 1.38,
    speechGazeScale: 1.26
  },
  balanced_ios: {
    localInstalledOverlayStrength: 0.54,
    proceduralOverlayStrength: 0.86,
    mouthOpenScale: 0.59,
    fallbackOpenScale: 0.8,
    consonantPulseScale: 0.16,
    vowelHoldScale: 0.12,
    visemeAttack: 0.72,
    visemeRelease: 0.36,
    headMotionScale: 1.08,
    handBeatScale: 1.08,
    microGestureScale: 1,
    jawMotionScale: 1.12,
    phraseGestureScale: 1.06,
    speechGazeScale: 1.06
  },
  reduced_motion: {
    localInstalledOverlayStrength: 0.28,
    proceduralOverlayStrength: 0.42,
    mouthOpenScale: 0.38,
    fallbackOpenScale: 0.54,
    consonantPulseScale: 0.07,
    vowelHoldScale: 0.05,
    visemeAttack: 0.5,
    visemeRelease: 0.22,
    headMotionScale: 0.48,
    handBeatScale: 0.36,
    microGestureScale: 0.32,
    jawMotionScale: 0.74,
    phraseGestureScale: 0.42,
    speechGazeScale: 0.58
  }
};
const SYNRA_SPEAKING_LIFE_CALIBRATION_STORAGE_KEY = "synraSpeakingLifeCalibration";

const AUTHORED_LOOP_ROUTES: Record<SynraMode, string> = {
  idle: "mode:idle",
  listening: "mode:listening",
  thinking: "mode:thinking",
  speaking: "mode:speaking",
  walking: "mode:walking"
};

function isIOSMobileHost(): boolean {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("synra-ios-host")) return true;
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || ((navigator as Navigator & { platform?: string }).platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isPerformanceLimitedHost(): boolean {
  if (isIOSMobileHost()) return true;
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("profile") === "jetson" || params.get("mode") === "kiosk" || isPrivateNetworkHost(window.location.hostname);
}

function readRuntimeTargetFps(performanceLimited: boolean): number {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const requested = Number(params.get("fps") || "");
    if (Number.isFinite(requested) && requested > 0) return THREE.MathUtils.clamp(requested, 12, 60);
    if (params.get("live") === "1" && !performanceLimited) return 60;
  }
  return performanceLimited ? 24 : 60;
}

function readRuntimePixelRatio(performanceLimited: boolean): number {
  const deviceRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const requestedScale = Number(params.get("scale") || "");
    if (Number.isFinite(requestedScale) && requestedScale > 0) {
      return resolveRuntimeRenderSizeCap(requestedScale, performanceLimited);
    }
  }
  const pixelRatio = performanceLimited
    ? Math.min(Math.max(deviceRatio, 1), 1.35)
    : Math.min(deviceRatio, 1.75);
  return typeof window !== "undefined" ? resolveRuntimeRenderSizeCap(pixelRatio, performanceLimited) : pixelRatio;
}

function resolveRuntimeRenderSizeCap(pixelRatio: number, performanceLimited: boolean): number {
  if (typeof window === "undefined") return pixelRatio;
  const params = new URLSearchParams(window.location.search);
  const requestedMaxWidth = Number(params.get("maxw") || params.get("maxRenderWidth") || "");
  const requestedMaxHeight = Number(params.get("maxh") || params.get("maxRenderHeight") || "");
  const widthCap = Number.isFinite(requestedMaxWidth) && requestedMaxWidth > 0 ? requestedMaxWidth / Math.max(1, window.innerWidth) : Infinity;
  const heightCap = Number.isFinite(requestedMaxHeight) && requestedMaxHeight > 0 ? requestedMaxHeight / Math.max(1, window.innerHeight) : Infinity;
  const capped = Math.min(pixelRatio, widthCap, heightCap);
  return THREE.MathUtils.clamp(capped, performanceLimited ? 0.42 : 0.5, performanceLimited ? 1.35 : 2);
}

function isPrivateNetworkHost(host: string): boolean {
  return /^192\.168\./.test(host) || /^10\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

function readPointerAwarenessEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("pointer") === "1" || params.get("pointerAwareness") === "1") return true;
  try {
    return window.localStorage?.getItem("synraPointerAwareness") === "true";
  } catch {
    return false;
  }
}

const BONE_ALIAS: Record<BoneName, string | null> = {
  head: "head",
  neck: "neck",
  chest: "chest",
  upperChest: "upperChest",
  spine: "spine",
  hips: "hips",
  leftEye: "leftEye",
  rightEye: "rightEye",
  leftShoulder: "leftShoulder",
  leftUpperArm: "leftUpperArm",
  leftLowerArm: "leftLowerArm",
  leftHand: "leftHand",
  rightShoulder: "rightShoulder",
  rightUpperArm: "rightUpperArm",
  rightLowerArm: "rightLowerArm",
  rightHand: "rightHand",
  leftUpperLeg: "leftUpperLeg",
  leftLowerLeg: "leftLowerLeg",
  leftFoot: "leftFoot",
  leftToes: "leftToes",
  rightUpperLeg: "rightUpperLeg",
  rightLowerLeg: "rightLowerLeg",
  rightFoot: "rightFoot",
  rightToes: "rightToes",
  leftThumbMetacarpal: "leftThumbMetacarpal",
  leftThumbProximal: "leftThumbProximal",
  leftThumbDistal: "leftThumbDistal",
  leftIndexProximal: "leftIndexProximal",
  leftIndexIntermediate: "leftIndexIntermediate",
  leftIndexDistal: "leftIndexDistal",
  leftMiddleProximal: "leftMiddleProximal",
  leftMiddleIntermediate: "leftMiddleIntermediate",
  leftMiddleDistal: "leftMiddleDistal",
  leftRingProximal: "leftRingProximal",
  leftRingIntermediate: "leftRingIntermediate",
  leftRingDistal: "leftRingDistal",
  leftLittleProximal: "leftLittleProximal",
  leftLittleIntermediate: "leftLittleIntermediate",
  leftLittleDistal: "leftLittleDistal",
  rightThumbMetacarpal: "rightThumbMetacarpal",
  rightThumbProximal: "rightThumbProximal",
  rightThumbDistal: "rightThumbDistal",
  rightIndexProximal: "rightIndexProximal",
  rightIndexIntermediate: "rightIndexIntermediate",
  rightIndexDistal: "rightIndexDistal",
  rightMiddleProximal: "rightMiddleProximal",
  rightMiddleIntermediate: "rightMiddleIntermediate",
  rightMiddleDistal: "rightMiddleDistal",
  rightRingProximal: "rightRingProximal",
  rightRingIntermediate: "rightRingIntermediate",
  rightRingDistal: "rightRingDistal",
  rightLittleProximal: "rightLittleProximal",
  rightLittleIntermediate: "rightLittleIntermediate",
  rightLittleDistal: "rightLittleDistal"
};

export interface SynraAvatarRuntimeOptions {
  canvas: HTMLCanvasElement;
  stage: HTMLElement;
  status?: HTMLElement | null;
  vrmUrl?: string;
}

export class SynraAvatarRuntime {
  private readonly canvas: HTMLCanvasElement;
  private readonly stage: HTMLElement;
  private readonly status?: HTMLElement | null;
  private currentVrmUrl: string;
  private readonly motionEngine = new SynraMotionEngine();
  private readonly performanceController = new SynraPerformanceController();
  private readonly authoredMotion = new SynraAuthoredMotionPlayer();
  private readonly clock = new THREE.Clock();
  private readonly preferAuthoredMotion: boolean;
  private readonly bodyPlaybackMode: SynraBodyPlaybackMode;
  private readonly useProceduralQualityGestures: boolean;
  private runtimeMotionMode: SynraRuntimeMotionMode;
  private speakingLifeCalibrationMode: SynraSpeakingLifeCalibrationMode;

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private contactShadow: THREE.Mesh | null = null;
  private vrm: VRM | null = null;
  private bones: BoneMap = {};
  private mouthMorphMeshes: MorphMesh[] = [];
  private rafId = 0;
  private animationPaused = false;
  private hiddenFrameSkips = 0;
  private speaking = false;
  private visemeTarget: SpeechVisemes = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, open: 0 };
  private visemeCurrent: SpeechVisemes = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, open: 0 };
  private previousSpeechPeak = 0;
  private speechPerformance: SpeechPerformanceFrame = {
    peak: 0,
    onset: 0,
    phrase: 0,
    gazeBias: 0,
    lastVisemeAt: 0,
    phonemeUnit: "unknown",
    phraseProgress: 0,
    mouthShapeVariety: 0,
    consonantBias: 0,
    vowelBias: 0,
    sentenceTone: "unknown",
    gestureIntent: "unknown",
    sentenceProgress: 0,
    emphasisBeat: 0,
    pauseStrength: 0
  };
  private speechMetadata: SpeechVisemeMetadata | null = null;
  private expressionCurrent: Record<string, number> = {};
  private floorAnchorY = 0;
  private screenOffsetTarget = { x: 0, y: 0 };
  private screenOffsetCurrent = { x: 0, y: 0 };
  private readonly tempJointPosition = new THREE.Vector3();
  private readonly tempEndPosition = new THREE.Vector3();
  private readonly tempTargetPosition = new THREE.Vector3();
  private readonly tempEndDirection = new THREE.Vector3();
  private readonly tempTargetDirection = new THREE.Vector3();
  private readonly tempWorldRotation = new THREE.Quaternion();
  private readonly tempParentRotation = new THREE.Quaternion();
  private readonly tempLocalRotation = new THREE.Quaternion();
  private readonly tempBounds = new THREE.Box3();
  private lastFrame: PoseFrame | null = null;
  private desiredLoopRoute: string | null = AUTHORED_LOOP_ROUTES.idle;
  private lastLoopKickAt = -999;
  private triggerSerial = 0;
  private avatarLoadSerial = 0;
  private gazeOverride: GazeOverride | null = null;
  private pointerFocus: PointerFocus = { x: 0, y: 0, lastSeenAt: 0, lastMovedAt: 0 };
  private pointerFocusTarget = { x: 0, y: 0 };
  private readonly pointerAwarenessEnabled = readPointerAwarenessEnabled();
  private lastFallbackReason: string | null = null;
  private lastFallbackDecision: SynraMotionFallbackDecision | null = null;
  private lastResolvedMotionRoute: SynraResolvedMotionRoute | null = null;
  private lastReferenceMotionStatus: Record<string, unknown> | null = null;
  private lastReferenceObjectUrl: string | null = null;
  private readonly mobilePerformanceMode = isPerformanceLimitedHost();
  private targetFps = 60;
  private adaptivePixelRatio = 1;
  private targetFrameIntervalMs = 0;
  private lastAnimationTickMs = 0;
  private lastRenderedAtMs = 0;
  private frameCount = 0;
  private webglContextLost = false;
  private webglLossCount = 0;
  private webglRestoreCount = 0;

  constructor(options: SynraAvatarRuntimeOptions) {
    this.canvas = options.canvas;
    this.stage = options.stage;
    this.status = options.status;
    this.currentVrmUrl = options.vrmUrl ?? "./synra.vrm";
    this.preferAuthoredMotion = readMotionPreference() !== "procedural";
    this.bodyPlaybackMode = readBodyPlaybackMode();
    this.runtimeMotionMode = readRuntimeMotionMode();
    this.speakingLifeCalibrationMode = readSpeakingLifeCalibrationPreference();
    this.targetFps = readRuntimeTargetFps(this.mobilePerformanceMode);
    this.targetFrameIntervalMs = this.targetFps >= 60 ? 0 : 1000 / this.targetFps;
    this.adaptivePixelRatio = readRuntimePixelRatio(this.mobilePerformanceMode);
    this.useProceduralQualityGestures =
      this.bodyPlaybackMode === "hybrid" &&
      readBooleanPreference("synraUseVrmaWaves") !== true &&
      readBooleanPreference("synraUseVrmaGestures") !== true;
  }

  async boot(): Promise<void> {
    this.setStatus("Loading Synra VRM");
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.mobilePerformanceMode ? 30 : 26, 1, 0.1, 100);
    this.applyCameraFraming(1);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(this.adaptivePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = !this.mobilePerformanceMode;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas.addEventListener("webglcontextlost", this.onWebGLContextLost, false);
    this.canvas.addEventListener("webglcontextrestored", this.onWebGLContextRestored, false);

    const ambient = new THREE.AmbientLight(0xffffff, 1.85);
    const hemi = new THREE.HemisphereLight(0xffffff, 0xd9e0ee, 1.15);
    const key = new THREE.DirectionalLight(0xffffff, 2.05);
    const face = new THREE.DirectionalLight(0xfff7ef, 0.82);
    const rim = new THREE.DirectionalLight(0xe8f4ff, 0.32);
    key.position.set(-1.45, 2.75, 3.35);
    key.castShadow = !this.mobilePerformanceMode;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 8;
    key.shadow.camera.left = -1.4;
    key.shadow.camera.right = 1.4;
    key.shadow.camera.top = 2.2;
    key.shadow.camera.bottom = -0.4;
    face.position.set(0.15, 1.72, 3.3);
    rim.position.set(2.2, 1.8, -2.8);
    this.scene.add(ambient, hemi, key, face, rim);
    this.installContactShadow();

    await this.loadVrm(this.currentVrmUrl);
    this.resize();
    window.addEventListener("resize", this.onResize, { passive: true });
    if (this.pointerAwarenessEnabled) {
      this.stage.addEventListener("pointermove", this.onPointerMove, { passive: true });
      this.stage.addEventListener("pointerleave", this.onPointerLeave, { passive: true });
    }
    this.clock.start();
    this.animate();
    this.setStatus("Synra ready");
  }

  dispose(): void {
    window.cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    window.removeEventListener("resize", this.onResize);
    this.stage.removeEventListener("pointermove", this.onPointerMove);
    this.stage.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("webglcontextlost", this.onWebGLContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onWebGLContextRestored);
    this.authoredMotion.dispose();
    this.releaseCurrentVrm();
    this.renderer?.dispose();
  }

  async setAvatar(url: string, label = "Synra"): Promise<void> {
    if (!url || url === this.currentVrmUrl) return;
    if (!this.scene) {
      this.currentVrmUrl = url;
      return;
    }

    const previousUrl = this.currentVrmUrl;
    const serial = ++this.avatarLoadSerial;
    this.setStatus(`Loading ${label}`);

    try {
      await this.loadVrm(url, serial);
      if (serial !== this.avatarLoadSerial) return;
      this.currentVrmUrl = url;
      this.motionEngine.setMode("idle");
      this.performanceController.setMode("idle");
      this.motionEngine.setExpression("soft_smile");
      this.performanceController.setExpression("soft_smile");
      this.desiredLoopRoute = this.preferAuthoredMotion ? AUTHORED_LOOP_ROUTES.idle : null;
      this.lastLoopKickAt = -999;
      this.resumeAuthoredLoopIfNeeded(this.clock.getElapsedTime(), true);
      this.setStatus(`${label} ready`);
    } catch (error) {
      if (serial !== this.avatarLoadSerial) return;
      this.currentVrmUrl = previousUrl;
      this.setStatus(`Model failed: ${(error as Error).message}`);
      throw error;
    }
  }

  setMode(mode: SynraMode, options: { playAuthoredLoop?: boolean } = {}): void {
    this.motionEngine.setMode(mode);
    this.performanceController.setMode(mode);
    if (options.playAuthoredLoop === false) {
      this.desiredLoopRoute = null;
      this.authoredMotion.stopChannel("base");
      return;
    }
    const routeKey = AUTHORED_LOOP_ROUTES[mode];
    const routeInfo = this.authoredMotion.resolveRouteInfo(routeKey);
    const baseDecision = this.performanceController.baseLoopDecision(mode, routeInfo);
    this.desiredLoopRoute = this.preferAuthoredMotion && baseDecision.useAuthored ? routeKey : null;
    if (baseDecision.reason) {
      this.lastFallbackReason = baseDecision.reason;
      if (routeInfo) {
        this.lastResolvedMotionRoute = routeInfo;
        this.authoredMotion.stopChannel("base");
      }
    }
    this.resumeAuthoredLoopIfNeeded(this.clock.getElapsedTime(), true);
  }

  setExpression(expression: SynraExpression): void {
    this.motionEngine.setExpression(expression);
    this.performanceController.setExpression(expression);
  }

  trigger(action: SynraActionName): void {
    const startedAt = this.clock.getElapsedTime();
    const serial = ++this.triggerSerial;
    const intent = action !== "none" ? resolveSynraActionIntent(action) : null;
    this.updateGazeOverride(intent, startedAt);
    const routeInfo = action !== "none" ? this.authoredMotion.resolveRouteInfo(action) : null;
    this.lastResolvedMotionRoute = routeInfo;
    if (this.runtimeMotionMode === "procedural") {
      this.lastFallbackReason = "runtimeMotionMode=procedural; authored VRMA bypassed for procedural comparison";
      this.lastFallbackDecision = {
        useProcedural: true,
        reason: this.lastFallbackReason,
        fallbackAction: action,
        policyId: "runtime-procedural-mode"
      };
      if (action !== "none") {
        this.authoredMotion.stopChannel(this.channelForActionIntent(intent));
        this.motionEngine.triggerAction(action, startedAt);
      }
      return;
    }
    const fallbackDecision = routeInfo
      ? (this.performanceController.proceduralOverrideForAction(action, routeInfo) ?? resolveSynraMotionFallbackDecision(action, intent, routeInfo, {
          bodyPlaybackMode: this.bodyPlaybackMode,
          proceduralQualityGestures: this.useProceduralQualityGestures || Boolean(intent && PROCEDURAL_QUALITY_FAMILIES.has(intent.family)),
          forceAuthoredDrafts: readBooleanPreference("synraUseDraftAuthoredMotions") === true,
          forceProceduralPerformance: readBooleanPreference("synraForceProceduralPerformance") === true
        }))
      : null;
    this.lastFallbackDecision = fallbackDecision;
    this.performanceController.noteAction(action, routeInfo, fallbackDecision?.useProcedural ? fallbackDecision.reason : null);

    if (fallbackDecision?.useProcedural) {
      this.lastFallbackReason = fallbackDecision.reason;
      this.authoredMotion.stopChannel(this.channelForActionIntent(intent));
      this.motionEngine.triggerAction(action, startedAt);
      return;
    }

    if (action !== "none" && this.preferAuthoredMotion && this.authoredMotion.hasPlayableRoute(action)) {
      this.lastFallbackReason = null;
      this.motionEngine.clearAction();
      void this.authoredMotion.play(action, { holdMs: 2400 }).then((played) => {
        if (serial !== this.triggerSerial) return;
        if (!played) {
          this.lastFallbackReason = `authored route "${action}" could not start; using procedural ${this.channelForActionIntent(intent)} fallback`;
          this.authoredMotion.stopChannel(this.channelForActionIntent(intent));
          this.motionEngine.triggerAction(action, this.clock.getElapsedTime());
        }
      });
      return;
    }

    this.lastFallbackReason = action === "none"
      ? null
      : this.preferAuthoredMotion
        ? `no playable authored route for "${action}"; using procedural ${this.channelForActionIntent(intent)} fallback`
        : "authored motion disabled; using procedural runtime";
    if (action !== "none") this.authoredMotion.stopChannel(this.channelForActionIntent(intent));
    this.motionEngine.triggerAction(action, startedAt);
  }

  setSpeaking(speaking: boolean): void {
    this.speaking = speaking;
    this.performanceController.setSpeaking(speaking);
    if (!speaking) {
      this.visemeTarget = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, open: 0 };
      this.speechMetadata = null;
    }
  }

  setPerformanceOption(option: SynraPerformanceOption, value: boolean): void {
    this.performanceController.setOption(option, value);
  }

  setRuntimeMotionMode(mode: SynraRuntimeMotionMode): Record<string, unknown> {
    this.runtimeMotionMode = mode;
    try {
      window.localStorage?.setItem("synraMotionRuntimeMode", mode);
    } catch {
      // Ignore storage errors in private/locked-down WebViews.
    }
    this.writeDebugAttributes();
    return this.debugState();
  }

  setSpeakingLifeCalibration(mode: SynraSpeakingLifeCalibrationMode): Record<string, unknown> {
    this.speakingLifeCalibrationMode = normalizeSpeakingLifeCalibrationMode(mode);
    writeSpeakingLifeCalibrationPreference(this.speakingLifeCalibrationMode);
    this.writeDebugAttributes();
    return this.speakingLifeProfileDebug();
  }

  speakingLifeCalibration(): Record<string, unknown> {
    return this.speakingLifeProfileDebug();
  }

  async playReferenceMotion(id = "reference_full_body_test"): Promise<Record<string, unknown>> {
    const url = `./motions/reference/${id}.vrma`;
    return this.playReferenceMotionUrl(id, url, {
      source: "bundled-placeholder-slot",
      missingMessage: "Reference VRMA missing. Download a known-good .vrma, such as the official VRoid Project free motion pack from BOOTH, then load it with 'Load Reference VRMA File...'. Do not redistribute the raw motion file."
    });
  }

  async playLocalDevReferenceMotion(): Promise<Record<string, unknown>> {
    return this.playReferenceMotionUrl("local_reference_full_body_test", "./local-reference/reference_full_body_test.vrma", {
      source: "local-dev-path",
      missingMessage: "Local dev reference VRMA missing. Optional dev-only path: Tools/SynraWebModern/local-reference/reference_full_body_test.vrma. This folder is gitignored and excluded from release packaging."
    });
  }

  async playReferenceMotionFile(file: File): Promise<Record<string, unknown>> {
    if (!file.name.toLowerCase().endsWith(".vrma")) {
      const status = {
        ok: false,
        referenceMotionAvailable: false,
        message: "Choose a .vrma file for the reference motion parity test.",
        fileName: file.name,
        debug: this.debugState()
      };
      this.lastReferenceMotionStatus = status;
      return status;
    }
    if (this.lastReferenceObjectUrl) URL.revokeObjectURL(this.lastReferenceObjectUrl);
    const objectUrl = URL.createObjectURL(file);
    this.lastReferenceObjectUrl = objectUrl;
    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]+/g, "_");
    return this.playReferenceMotionUrl(`user_file_${safeName}`, objectUrl, {
      source: "user-selected-file",
      fileName: file.name,
      fileSize: file.size,
      missingMessage: "The selected VRMA file could not be played. Check that it opens correctly in VRoid Hub / VRoid Playground."
    });
  }

  async playReferenceMotionDataUrl(dataUrl: string, metadata: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const fileName = String(metadata.fileName || "user-selected-reference.vrma");
    if (!fileName.toLowerCase().endsWith(".vrma")) {
      const status = {
        ok: false,
        referenceMotionAvailable: false,
        failingStage: "file_picker",
        message: "Choose a .vrma file for the reference motion parity test.",
        fileName,
        debug: this.debugState()
      };
      this.lastReferenceMotionStatus = status;
      return status;
    }

    try {
      const response = await fetch(dataUrl);
      if (!response.ok) throw new Error(`Data URL decode failed with status ${response.status}.`);
      const blob = await response.blob();
      if (this.lastReferenceObjectUrl) URL.revokeObjectURL(this.lastReferenceObjectUrl);
      const objectUrl = URL.createObjectURL(blob);
      this.lastReferenceObjectUrl = objectUrl;
      const safeName = fileName.replace(/[^a-zA-Z0-9_.-]+/g, "_");
      return this.playReferenceMotionUrl(`native_file_${safeName}`, objectUrl, {
        source: metadata.source ?? "native-open-panel",
        fileName,
        fileSize: typeof metadata.fileSize === "number" ? metadata.fileSize : blob.size,
        selectedAt: metadata.selectedAt ?? null,
        missingMessage: "The selected VRMA file could not be played. Check whether file read, VRMA parsing, clip creation, mixer binding, or rendering failed in debug output."
      });
    } catch (error) {
      const status = {
        ok: false,
        referenceMotionAvailable: false,
        failingStage: "file_read_or_data_url_decode",
        message: `Reference VRMA cannot load: ${(error as Error).message}`,
        fileName,
        source: metadata.source ?? "native-open-panel",
        debug: this.debugState()
      };
      this.lastReferenceMotionStatus = status;
      return status;
    }
  }

  async playImportedMotionUrl(id: string, url: string, metadata: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return this.playReferenceMotionUrl(`imported_${id}`, url, {
      ...metadata,
      source: metadata.source ?? "local-imported-action-override",
      importedActionOverride: true,
      missingMessage: "The mapped imported VRMA could not be played. Re-import the local .vrma file and map it to the action again."
    });
  }

  resolveLocalInstalledActionRoute(actionId: string): Record<string, unknown> | null {
    return this.authoredMotion.resolveLocalInstalledRouteInfo(actionId) as Record<string, unknown> | null;
  }

  async playLocalInstalledActionFullBody(actionId: string): Promise<Record<string, unknown>> {
    const routeInfo = this.authoredMotion.resolveLocalInstalledRouteInfo(actionId);
    if (!routeInfo?.clipId) {
      const status = {
        ok: false,
        actionId,
        localInstalledRouteFound: false,
        localInstalledRouteUsed: false,
        selectedPlaybackPath: "unavailable",
        message: `No local-installed Synra motion route found for "${actionId}".`,
        debug: this.debugState()
      };
      this.lastReferenceMotionStatus = status;
      return status;
    }

    return this.playLocalInstalledRouteThroughReferenceBlob(actionId, routeInfo);
  }

  async playLocalInstalledClipFullBody(clipId: string): Promise<Record<string, unknown>> {
    const routeInfo = this.authoredMotion.resolveLocalInstalledRouteInfo(clipId)
      ?? this.synthesizeLocalInstalledClipRoute(clipId);
    if (!routeInfo?.clipId) {
      const status = {
        ok: false,
        clipId,
        localInstalledRouteFound: false,
        localInstalledRouteUsed: false,
        selectedPlaybackPath: "unavailable",
        message: `No local-installed Synra motion clip found for "${clipId}".`,
        debug: this.debugState()
      };
      this.lastReferenceMotionStatus = status;
      return status;
    }

    return this.playLocalInstalledRouteThroughReferenceBlob(String(routeInfo.action || clipId), routeInfo);
  }

  private synthesizeLocalInstalledClipRoute(clipId: string): (SynraResolvedMotionRoute & { url: string | null; localInstalled: boolean }) | null {
    if (!clipId.startsWith("Local_")) return null;
    return {
      action: clipId,
      clipId,
      channel: "base",
      mask: "fullBody",
      quality: "draft",
      visualQaApprovedAt: null,
      fallback: null,
      notes: "Synthesized local-installed route for explicit installed VRMA button playback.",
      failed: false,
      playable: true,
      url: `./motions/local-vendor/${clipId}.vrma`,
      localInstalled: true
    };
  }

  private async playLocalInstalledRouteThroughReferenceBlob(
    actionId: string,
    routeInfo: SynraResolvedMotionRoute & { url?: string | null; localInstalled?: boolean }
  ): Promise<Record<string, unknown>> {
    const clipId = String(routeInfo.clipId || actionId);
    const sourceUrl = String(routeInfo.url || "");
    if (!sourceUrl) {
      const status = {
        ok: false,
        actionId,
        clipId,
        localInstalledRouteFound: true,
        localInstalledRouteUsed: false,
        selectedPlaybackPath: "localInstalledFullBody",
        failingStage: "local_installed_url_missing",
        message: `Local-installed VRMA "${clipId}" has no URL in the motion manifest.`,
        debug: this.debugState()
      };
      this.lastReferenceMotionStatus = status;
      return status;
    }

    try {
      const response = await fetch(sourceUrl, { cache: "no-store" });
      const blob = await response.blob();
      if (!response.ok && response.status !== 0) throw new Error(`HTTP ${response.status} while reading ${sourceUrl}`);
      if (blob.size <= 0) throw new Error(`Empty VRMA response while reading ${sourceUrl}`);
      if (this.lastReferenceObjectUrl) URL.revokeObjectURL(this.lastReferenceObjectUrl);
      const objectUrl = URL.createObjectURL(blob);
      this.lastReferenceObjectUrl = objectUrl;

      const referenceStatus = await this.playReferenceMotionUrl(`local_installed_${clipId}`, objectUrl, {
        source: "bundled-local-installed-vrma",
        actionId,
        fileName: `${clipId}.vrma`,
        fileSize: blob.size,
        sourceUrl,
        missingMessage: `Local-installed VRMA "${clipId}" could not be played from the bundled app resources.`
      });

      this.lastResolvedMotionRoute = routeInfo;
      const status = this.localInstalledPlaybackStatusFromReference(actionId, routeInfo, referenceStatus);
      this.lastReferenceMotionStatus = status;
      return status;
    } catch (error) {
      const status = {
        ok: false,
        actionId,
        clipId,
        clipUrl: sourceUrl,
        localInstalledRouteFound: true,
        localInstalledRouteUsed: false,
        selectedPlaybackPath: "localInstalledFullBody",
        failingStage: "local_installed_fetch_or_blob",
        message: `Local-installed VRMA "${clipId}" could not be read from bundled resources: ${(error as Error).message}`,
        proceduralOverrideActive: false,
        trackMaskApplied: false,
        fallbackUsed: false,
        fallbackReason: null,
        generatedClipBypassed: true,
        debug: this.debugState()
      };
      this.lastReferenceMotionStatus = status;
      return status;
    }
  }

  private localInstalledPlaybackStatus(actionId: string, routeInfo: SynraResolvedMotionRoute & { url?: string | null; localInstalled?: boolean }, played: boolean): Record<string, unknown> {
    const authored = this.authoredMotion.debugState();
    const channel = (authored.channels as Record<string, Record<string, unknown> | undefined>).base;
    const lastAttempted = authored.lastAttempted as Record<string, unknown> | null;
    const status = {
      ok: played,
      actionId,
      clipId: routeInfo.clipId ?? null,
      clipUrl: routeInfo.url ?? channel?.clipUrl ?? lastAttempted?.clipUrl ?? null,
      localInstalledRouteFound: true,
      localInstalledRouteUsed: played,
      localInstalledClipId: routeInfo.clipId ?? null,
      selectedPlaybackPath: "localInstalledFullBody",
      message: played
        ? `Local-installed full-body VRMA "${String(routeInfo.clipId)}" is playing with procedural overrides and track masks bypassed.`
        : `Local-installed VRMA "${String(routeInfo.clipId)}" could not start.`,
      durationSeconds: channel?.durationSeconds ?? lastAttempted?.durationSeconds ?? null,
      trackCount: channel?.trackCount ?? lastAttempted?.trackCount ?? null,
      first30TrackNames: channel?.first30TrackNames ?? lastAttempted?.first30TrackNames ?? [],
      trackPresence: channel?.trackPresence ?? lastAttempted?.trackPresence ?? null,
      proceduralOverrideActive: false,
      trackMaskApplied: false,
      fallbackUsed: false,
      fallbackReason: null,
      mixerActive: channel?.mixerActive ?? lastAttempted?.mixerActive ?? false,
      actionRunning: channel?.isRunning ?? lastAttempted?.actionRunning ?? false,
      actionTime: channel?.actionTime ?? lastAttempted?.actionTime ?? null,
      actionWeight: channel?.actionWeight ?? lastAttempted?.actionWeight ?? null,
      actionLoopMode: channel?.actionLoopMode ?? lastAttempted?.actionLoopMode ?? null,
      generatedClipBypassed: true,
      bypassReason: "local-installed manifest route owns full body before generated draft/procedural policy",
      debug: this.debugState()
    };
    this.lastReferenceMotionStatus = status;
    return status;
  }

  private localInstalledPlaybackStatusFromReference(
    actionId: string,
    routeInfo: SynraResolvedMotionRoute & { url?: string | null; localInstalled?: boolean },
    referenceStatus: Record<string, unknown>
  ): Record<string, unknown> {
    const authored = this.authoredMotion.debugState();
    const channel = (authored.channels as Record<string, Record<string, unknown> | undefined>).base;
    const lastAttempted = authored.lastAttempted as Record<string, unknown> | null;
    const played = referenceStatus.ok === true;
    return {
      ...referenceStatus,
      ok: played,
      actionId,
      clipId: routeInfo.clipId ?? null,
      clipUrl: routeInfo.url ?? null,
      localInstalledRouteFound: true,
      localInstalledRouteUsed: played,
      localInstalledClipId: routeInfo.clipId ?? null,
      selectedPlaybackPath: "localInstalledFullBody",
      message: played
        ? `Local-installed full-body VRMA "${String(routeInfo.clipId)}" is playing through the same Blob/ObjectURL path as the reference picker.`
        : `Local-installed VRMA "${String(routeInfo.clipId)}" could not start through the reference-style playback path.`,
      durationSeconds: referenceStatus.durationSeconds ?? channel?.durationSeconds ?? lastAttempted?.durationSeconds ?? null,
      trackCount: referenceStatus.trackCount ?? channel?.trackCount ?? lastAttempted?.trackCount ?? null,
      first30TrackNames: referenceStatus.first30TrackNames ?? channel?.first30TrackNames ?? lastAttempted?.first30TrackNames ?? [],
      trackPresence: referenceStatus.trackPresence ?? channel?.trackPresence ?? lastAttempted?.trackPresence ?? null,
      proceduralOverrideActive: false,
      trackMaskApplied: false,
      fallbackUsed: false,
      fallbackReason: null,
      mixerActive: referenceStatus.mixerActive ?? channel?.mixerActive ?? lastAttempted?.mixerActive ?? false,
      actionRunning: referenceStatus.actionRunning ?? channel?.isRunning ?? lastAttempted?.actionRunning ?? false,
      actionTime: referenceStatus.actionTime ?? channel?.actionTime ?? lastAttempted?.actionTime ?? null,
      actionWeight: referenceStatus.actionWeight ?? channel?.actionWeight ?? lastAttempted?.actionWeight ?? null,
      actionLoopMode: referenceStatus.actionLoopMode ?? channel?.actionLoopMode ?? lastAttempted?.actionLoopMode ?? null,
      generatedClipBypassed: true,
      bypassReason: "local-installed route is loaded as a Blob/ObjectURL and played through the reference full-body path",
      debug: this.debugState()
    };
  }

  private async playReferenceMotionUrl(id: string, url: string, metadata: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    this.setRuntimeMotionMode("vroidParity");
    this.lastFallbackDecision = null;
    this.lastFallbackReason = null;
    this.lastResolvedMotionRoute = {
      action: id,
      clipId: id,
      channel: "base",
      mask: "fullBody",
      quality: "draft",
      visualQaApprovedAt: null,
      fallback: null,
      notes: "Known-good external VRMA reference slot.",
      failed: false,
      playable: true
    };
    this.motionEngine.clearAction();
    const played = await this.authoredMotion.playReferenceByUrl(id, url);
    const authored = this.authoredMotion.debugState();
    const channel = (authored.channels as Record<string, Record<string, unknown> | undefined>).base;
    const lastAttempted = authored.lastAttempted as Record<string, unknown> | null;
    const lastError = String(channel?.lastError || lastAttempted?.lastError || "");
    const missing = !played && /404|not found|failed to fetch/i.test(lastError);
    const failingStage = played
      ? null
      : missing
        ? "file_picker_or_file_url"
        : /no vrm animation payload/i.test(lastError)
          ? "vrma_parse"
          : /createvrmanimationclip|binding|track/i.test(lastError)
            ? "createVRMAnimationClip_or_binding"
            : lastError
              ? "vrma_parse_or_mixer"
              : "mixer_or_rendering";
    const status = {
      ok: played,
      referenceMotionAvailable: played,
      clipId: id,
      clipUrl: url,
      message: played
        ? "Reference full-body VRMA is playing with procedural overrides and track masks bypassed."
        : metadata.missingMessage || "Reference VRMA missing. Download a known-good .vrma, such as the official VRoid Project free motion pack from BOOTH, then load it with 'Load Reference VRMA File...'. Do not redistribute the raw motion file.",
      missing,
      trackPresence: channel?.trackPresence ?? lastAttempted?.trackPresence ?? null,
      durationSeconds: channel?.durationSeconds ?? lastAttempted?.durationSeconds ?? null,
      trackCount: channel?.trackCount ?? lastAttempted?.trackCount ?? null,
      first30TrackNames: channel?.first30TrackNames ?? lastAttempted?.first30TrackNames ?? [],
      proceduralOverrideActive: false,
      trackMaskApplied: false,
      fallbackUsed: false,
      fallbackReason: null,
      mixerActive: channel?.mixerActive ?? lastAttempted?.mixerActive ?? false,
      actionRunning: channel?.isRunning ?? lastAttempted?.actionRunning ?? false,
      actionTime: channel?.actionTime ?? lastAttempted?.actionTime ?? null,
      actionWeight: channel?.actionWeight ?? lastAttempted?.actionWeight ?? null,
      source: metadata.source ?? "unknown",
      importedActionOverride: metadata.importedActionOverride === true,
      actionId: metadata.actionId ?? null,
      fileName: metadata.fileName ?? null,
      fileSize: metadata.fileSize ?? null,
      selectedAt: metadata.selectedAt ?? null,
      failingStage,
      lastError: lastError || null,
      debug: this.debugState()
    };
    this.lastReferenceMotionStatus = status;
    return status;
  }

  async playGeneratedClip(clipId: string): Promise<Record<string, unknown>> {
    if (this.authoredMotion.resolveLocalInstalledRouteInfo(clipId)) {
      return this.playLocalInstalledClipFullBody(clipId);
    }
    this.setRuntimeMotionMode("hybrid");
    this.motionEngine.clearAction();
    const played = await this.authoredMotion.playClipId(clipId, { priority: 100, holdMs: 4500 });
    this.lastReferenceMotionStatus = {
      ok: played,
      generatedDraftClip: !clipId.startsWith("Local_"),
      localInstalledClip: clipId.startsWith("Local_"),
      clipId,
      message: played
        ? `Motion clip "${clipId}" is playing for comparison. Local installed clips are still draft until Matthew visually approves them in NodeSparkHub.`
        : `Motion clip "${clipId}" could not start.`
    };
    return { ...this.lastReferenceMotionStatus, debug: this.debugState() };
  }

  playProceduralPerformance(action: SynraActionName): Record<string, unknown> {
    this.setRuntimeMotionMode("procedural");
    this.authoredMotion.stop("gesture");
    this.authoredMotion.stop("base");
    this.trigger(action);
    return this.debugState();
  }

  playProceduralManualControl(action: SynraActionName, reason = "manual-control"): Record<string, unknown> {
    const startedAt = this.clock.getElapsedTime();
    const intent = resolveSynraActionIntent(action);
    this.updateGazeOverride(intent, startedAt);
    const routeInfo = this.authoredMotion.resolveRouteInfo(action);
    this.lastResolvedMotionRoute = routeInfo;
    this.lastFallbackReason = reason;
    this.lastFallbackDecision = {
      useProcedural: true,
      reason,
      fallbackAction: action,
      policyId: "manual-control-contract"
    };
    this.performanceController.noteAction(action, routeInfo, reason);
    this.authoredMotion.stopChannel(this.channelForActionIntent(intent));
    this.motionEngine.triggerAction(action, startedAt);
    return this.debugState();
  }

  stopMotionTest(): Record<string, unknown> {
    this.authoredMotion.stop();
    this.motionEngine.clearAction();
    this.desiredLoopRoute = this.preferAuthoredMotion ? AUTHORED_LOOP_ROUTES.idle : null;
    this.setRuntimeMotionMode("hybrid");
    this.resumeAuthoredLoopIfNeeded(this.clock.getElapsedTime(), true);
    return this.debugState();
  }

  motionVerdict(): Record<string, unknown> {
    const authored = this.authoredMotion.debugState();
    const referenceChannel = (authored.channels as Record<string, Record<string, unknown> | undefined>).base;
    const referenceAvailable = this.authoredMotion.isReferencePlaying || Boolean(referenceChannel?.reference);
    const referenceError = String(referenceChannel?.lastError || "");
    const referenceMissing = !referenceAvailable && /404|not found|failed/i.test(referenceError || String(this.lastReferenceMotionStatus?.message || ""));
    const proceduralOverrideProblem = this.runtimeMotionMode !== "vroidParity" && this.authoredMotion.isPlaying;
    const maskingProblem = Boolean(referenceChannel?.maskApplied);
    const lastStatus = this.lastReferenceMotionStatus as Record<string, unknown> | null;
    const failingStage = String(lastStatus?.failingStage || referenceChannel?.lastError || "");
    const technicalPlaybackPass = referenceAvailable
      && this.runtimeMotionMode === "vroidParity"
      && !maskingProblem
      && (referenceChannel?.isRunning !== false);
    return {
      modelHealthy: true,
      referenceMotionAvailable: referenceAvailable,
      referenceMotionPlayback: technicalPlaybackPass ? "pass_unverified_visual" : referenceMissing ? "missing" : "fail",
      verdict: technicalPlaybackPass
        ? "A. Reference VRMA is loaded and playing through the full-body vroidParity path. Matthew still needs to visually confirm it moves correctly; if it does, generated draft clips are the main problem."
        : referenceMissing
          ? "C. Reference VRMA cannot load: no user-supplied reference file is active. Use Load Reference VRMA File... and choose a local .vrma."
          : `B/C. Reference VRMA did not reach clean playback. Failing stage: ${failingStage || "unknown"}.`,
      generatedMotionQuality: "draft",
      runtimeCanPlayFullBodyVRMA: technicalPlaybackPass,
      proceduralOverrideProblem,
      maskingProblem,
      expressionTooMuted: false,
      recommendedFix: referenceAvailable
        ? "If the reference VRMA moves correctly, replace generated draft clips with known-good authored VRMA and keep procedural performance as overlay/fallback only."
        : "Download a known-good .vrma, such as the official VRoid Project free motion pack from BOOTH, then load it with 'Load Reference VRMA File...'. Do not redistribute the raw motion file.",
      lastReferenceMotionStatus: this.lastReferenceMotionStatus,
      authoredMotion: authored
    };
  }

  private motionVerdictSummary(): Record<string, unknown> {
    const authored = this.authoredMotion.debugState();
    const referenceChannel = (authored.channels as Record<string, Record<string, unknown> | undefined>).base;
    const referenceAvailable = this.authoredMotion.isReferencePlaying || Boolean(referenceChannel?.reference);
    const technicalPlaybackPass = referenceAvailable && this.runtimeMotionMode === "vroidParity" && !referenceChannel?.maskApplied && referenceChannel?.isRunning !== false;
    return {
      referenceMotionAvailable: referenceAvailable,
      referenceMotionPlayback: technicalPlaybackPass ? "pass_unverified_visual" : "missing",
      runtimeCanPlayFullBodyVRMA: technicalPlaybackPass,
      generatedMotionQuality: "draft"
    };
  }

  performanceOptions(): Record<string, boolean> {
    return this.performanceController.getOptions();
  }

  setVisemes(visemes: Partial<SpeechVisemes>): void {
    this.visemeTarget = {
      aa: visemes.aa ?? this.visemeTarget.aa,
      ih: visemes.ih ?? this.visemeTarget.ih,
      ou: visemes.ou ?? this.visemeTarget.ou,
      ee: visemes.ee ?? this.visemeTarget.ee,
      oh: visemes.oh ?? this.visemeTarget.oh,
      open: visemes.open ?? this.visemeTarget.open
    };
    this.speechMetadata = visemes.meta?.marker === "synra-phoneme-aware-speech-v1"
      ? this.sanitizedSpeechMetadata(visemes.meta)
      : this.inferredSpeechMetadata(this.visemeTarget);
    this.speechPerformance.lastVisemeAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  nudgeScreen(dx: number, dy: number): void {
    this.screenOffsetTarget.x = THREE.MathUtils.clamp(this.screenOffsetTarget.x + dx, -0.82, 0.82);
    this.screenOffsetTarget.y = THREE.MathUtils.clamp(this.screenOffsetTarget.y + dy, -0.2, 0.34);
  }

  resetScreenPosition(): void {
    this.screenOffsetTarget = { x: 0, y: 0 };
  }

  setAnimationPaused(paused: boolean): Record<string, unknown> {
    this.animationPaused = paused;
    this.clock.getDelta();
    return this.debugState();
  }

  runtimeHealth(): SynraRuntimeHealthSnapshot {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const bounds = this.canvas.getBoundingClientRect();
    const buffer = this.renderer?.getDrawingBufferSize(new THREE.Vector2()) ?? null;
    const canvasVisible = bounds.width > 2 && bounds.height > 2 && this.canvas.offsetParent !== null;
    const lastRenderAgeMs = this.lastRenderedAtMs > 0 ? Math.round(now - this.lastRenderedAtMs) : null;
    return {
      webglReady: Boolean(this.renderer && !this.webglContextLost),
      webglContextLost: this.webglContextLost,
      canvasVisible,
      canvasWidth: Math.round(buffer?.x || bounds.width || this.canvas.clientWidth || 0),
      canvasHeight: Math.round(buffer?.y || bounds.height || this.canvas.clientHeight || 0),
      rendererReady: Boolean(this.renderer),
      renderHeartbeat: lastRenderAgeMs !== null && lastRenderAgeMs < 2500,
      lastRenderAt: this.lastRenderedAtMs > 0 ? new Date(Date.now() - (now - this.lastRenderedAtMs)).toISOString() : null,
      lastRenderAgeMs,
      frameCount: this.frameCount,
      targetFps: this.targetFps,
      mobilePerformanceMode: this.mobilePerformanceMode,
      adaptivePixelRatio: this.adaptivePixelRatio
    };
  }

  webGLState(): Record<string, unknown> {
    return {
      contextLost: this.webglContextLost,
      lossCount: this.webglLossCount,
      restoreCount: this.webglRestoreCount,
      rendererReady: Boolean(this.renderer),
      health: this.runtimeHealth()
    };
  }

  debugState(): Record<string, unknown> {
    const hand = this.bones.rightHand?.rotation;
    const upper = this.bones.rightUpperArm?.rotation;
    const lower = this.bones.rightLowerArm?.rotation;
    const authored = this.authoredMotion.debugState();
    const referenceChannel = (authored.channels as Record<string, Record<string, unknown> | undefined>).base;
    const fullBodyAuthoredActive = this.authoredMotion.isReferencePlaying || this.authoredMotion.isLocalInstalledFullBodyPlaying;
    const authoredChannels = authored.channels as Partial<Record<SynraMotionChannel, { clipId?: string; actionIds?: string[] }>>;
    const proceduralAction = this.lastFrame?.activeAction ?? null;
    const activeGesture = authoredChannels.gesture;
    const activeGaze = authoredChannels.gaze;
    const expressions = this.lastFrame?.expressions ?? {};
    const forceAuthoredDrafts = readBooleanPreference("synraUseDraftAuthoredMotions") === true;
    const forceProceduralPerformance = readBooleanPreference("synraForceProceduralPerformance") === true;
    const performance = this.performanceController.debugState();
    return {
      runtimeBuildId: SYNRA_PERFORMANCE_RUNTIME_MARKER,
      performanceStatus: {
        animationPaused: this.animationPaused,
        documentHidden: typeof document !== "undefined" ? document.hidden : false,
        rafActive: this.rafId !== 0,
        hiddenFrameSkips: this.hiddenFrameSkips,
        activeFullBodyAuthored: fullBodyAuthoredActive,
        mobilePerformanceMode: this.mobilePerformanceMode,
        targetFps: this.targetFps,
        adaptivePixelRatio: this.adaptivePixelRatio,
        frameCount: this.frameCount,
        webglContextLost: this.webglContextLost
      },
      webglReady: !this.webglContextLost && Boolean(this.renderer),
      runtimeHealth: this.runtimeHealth(),
      runtimeMotionMode: this.runtimeMotionMode,
      motionPolicy: this.preferAuthoredMotion
        ? this.runtimeMotionMode === "vroidParity"
          ? "vroidParity: unmasked authored reference owns full body"
          : this.runtimeMotionMode === "procedural"
            ? "procedural-only test mode"
            : this.bodyPlaybackMode === "playground"
          ? "vroid-playground-authored-body"
          : this.useProceduralQualityGestures
            ? "hybrid: authored-vrma-loops + procedural-quality-gestures"
            : "hybrid: authored-vrma-first"
        : "procedural-only",
      bodyPlaybackMode: this.bodyPlaybackMode,
      referenceParity: {
        status: this.lastReferenceMotionStatus,
        verdict: this.motionVerdictSummary(),
        missingMessage: "Reference VRMA missing. Download a known-good .vrma, such as the official VRoid Project free motion pack from BOOTH, then load it with 'Load Reference VRMA File...'. Do not redistribute the raw motion file.",
        preferredTests: {
          first: "VRMA_01 Show full body",
          secondary: ["VRMA_02 Greeting", "VRMA_03 Peace sign"],
          lowerBodyStress: ["VRMA_05 Spin", "VRMA_07 Squat"]
        }
      },
      bodyDriver: this.lastFrame?.activeAction
        ? "procedural-action"
        : this.authoredMotion.isPlaying
          ? "authored-vrma"
          : "procedural-runtime",
      authoredReady: this.authoredMotion.isReady,
      vrmLoaded: Boolean(this.vrm),
      vrmaManifestLoaded: this.authoredMotion.hasManifest,
      proceduralQualityGestures: this.useProceduralQualityGestures,
      motionFallbackPolicy: {
        id: this.lastFallbackDecision?.policyId ?? null,
        useProcedural: this.lastFallbackDecision?.useProcedural ?? false,
        fallbackAction: this.lastFallbackDecision?.fallbackAction ?? this.lastResolvedMotionRoute?.fallback ?? null,
        fallbackReason: this.lastFallbackDecision?.reason ?? this.lastFallbackReason,
        draftAuthoredMotionAllowed: forceAuthoredDrafts,
        forceAuthoredDrafts,
        forceProceduralPerformance,
        localStorageSynraUseDraftAuthoredMotions: forceAuthoredDrafts,
        protectedDraftFamilies: ["wave", "point", "explain", "nod", "shake", "reassure", "curious", "think", "celebrate"]
      },
      performance,
      motion: {
        activeAuthoredClip: this.authoredMotion.activeClipId,
        activeProceduralAction: proceduralAction?.name ?? null,
        activeBase: this.authoredMotion.activeClipIdForChannel("base") || this.desiredLoopRoute || this.motionEngine.debugState().mode
      },
      lastMotionRoute: this.lastResolvedMotionRoute
        ? {
            actionRequested: this.lastResolvedMotionRoute.action,
            clipSelected: this.lastResolvedMotionRoute.clipId,
            clipQuality: this.lastResolvedMotionRoute.quality,
            visualQaApprovedAt: this.lastResolvedMotionRoute.visualQaApprovedAt,
            channel: this.lastResolvedMotionRoute.channel,
            mask: this.lastResolvedMotionRoute.mask,
            fallback: this.lastResolvedMotionRoute.fallback,
            fallbackUsed: this.lastFallbackDecision?.useProcedural ?? false,
            fallbackReason: this.lastFallbackDecision?.reason ?? this.lastFallbackReason,
            playable: this.lastResolvedMotionRoute.playable,
            failed: this.lastResolvedMotionRoute.failed,
            notes: this.lastResolvedMotionRoute.notes
          }
        : null,
      authoredMotion: authored,
      referenceMotionDebug: {
        active: fullBodyAuthoredActive,
        clipId: this.authoredMotion.referenceClipId ?? this.authoredMotion.activeClipIdForChannel("base"),
        proceduralOverrideActive: this.runtimeMotionMode !== "vroidParity" || !fullBodyAuthoredActive,
        trackMaskApplied: Boolean(referenceChannel?.maskApplied),
        fallbackUsed: false,
        fallbackReason: null,
        rootHipsLegsAllowed: Boolean(referenceChannel?.rootHipsLegsAllowed),
        fileName: (this.lastReferenceMotionStatus as Record<string, unknown> | null)?.fileName ?? null,
        fileSize: (this.lastReferenceMotionStatus as Record<string, unknown> | null)?.fileSize ?? null,
        selectedAt: (this.lastReferenceMotionStatus as Record<string, unknown> | null)?.selectedAt ?? null,
        durationSeconds: referenceChannel?.durationSeconds ?? null,
        trackCount: referenceChannel?.trackCount ?? null,
        first30TrackNames: referenceChannel?.first30TrackNames ?? [],
        trackPresence: referenceChannel?.trackPresence ?? null,
        mixerActive: referenceChannel?.mixerActive ?? false,
        actionRunning: referenceChannel?.isRunning ?? false,
        actionTime: referenceChannel?.actionTime ?? null,
        actionWeight: referenceChannel?.actionWeight ?? null,
        actionLoopMode: referenceChannel?.actionLoopMode ?? null
      },
      activeClipId: this.authoredMotion.activeClipId,
      activeProgress: this.authoredMotion.activeProgress,
      activeBaseClip: this.authoredMotion.activeClipIdForChannel("base"),
      activeGestureClip: activeGesture?.clipId ?? null,
      activeGestureAction: activeGesture?.actionIds?.[0] ?? proceduralAction?.name ?? null,
      activeGazeClip: activeGaze?.clipId ?? null,
      activeGazeAction: activeGaze?.actionIds?.[0] ?? (this.gazeOverride ? `look_${this.gazeOverride.direction}` : null),
      activeGazeTarget: this.gazeOverride
        ? { direction: this.gazeOverride.direction, strength: this.gazeOverride.strength, until: this.gazeOverride.until }
        : null,
      activeExpression: this.motionEngine.debugState().expression,
      lipsyncState: {
        speaking: this.speaking,
        target: this.visemeTarget,
        current: this.visemeCurrent,
        performance: this.speechPerformanceDebug(),
        phonemeAwareSpeech: this.speechMetadata
      },
      speakingLifeProfile: this.speakingLifeProfileDebug(),
      proceduralOverlays: {
        breathing: true,
        blinks: true,
        performanceLayerActive: Boolean(performance.performanceLayerActive),
        lifeLayerActive: Boolean(performance.lifeLayerActive),
        performanceGaze: Boolean(performance.gazeEnabled),
        poseGuardrails: Boolean((performance.options as Record<string, unknown> | undefined)?.guardrails),
        gazeOverride: Boolean(this.gazeOverride),
        pointerAwarenessEnabled: this.pointerAwarenessEnabled,
        pointerFocus: this.pointerFocus.lastSeenAt > 0,
        mouthClose: !this.speaking,
        qualityGestureFallback: Boolean(proceduralAction)
      },
      fallbackReason: this.lastFallbackReason,
      bundledAssetVersion: this.bundledAssetVersion(),
      avatarUrl: this.currentVrmUrl,
      expressionProfile: this.expressionProfile().id,
      expressions,
      desiredLoopRoute: this.desiredLoopRoute,
      desiredLoopClipId: this.desiredLoopRoute ? this.authoredMotion.resolveClipId(this.desiredLoopRoute) : null,
      proceduralAction,
      rightUpperArm: upper ? { x: upper.x, y: upper.y, z: upper.z } : null,
      rightLowerArm: lower ? { x: lower.x, y: lower.y, z: lower.z } : null,
      rightHand: hand ? { x: hand.x, y: hand.y, z: hand.z } : null
    };
  }

  private onResize = (): void => this.resize();

  private onWebGLContextLost = (event: Event): void => {
    event.preventDefault();
    this.webglContextLost = true;
    this.webglLossCount += 1;
    this.setStatus("Synra renderer paused");
    this.postMobileRuntimeEvent("synra.webgl.contextlost", this.runtimeHealth());
  };

  private onWebGLContextRestored = (): void => {
    this.webglContextLost = false;
    this.webglRestoreCount += 1;
    this.resize();
    this.clock.getDelta();
    this.setStatus("Synra renderer restored");
    this.postMobileRuntimeEvent("synra.webgl.contextrestored", this.runtimeHealth());
  };

  private postMobileRuntimeEvent(command: string, payload: Record<string, unknown>): void {
    const bridge = (globalThis as unknown as {
      NodeSparkSynraMobile?: { post?: (command: string, payload?: Record<string, unknown>) => Promise<unknown> };
    }).NodeSparkSynraMobile;
    void bridge?.post?.(command, payload).catch(() => {});
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.pointerAwarenessEnabled) return;
    const bounds = this.stage.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const now = this.clock.getElapsedTime();
    this.pointerFocusTarget = {
      x: THREE.MathUtils.clamp(((event.clientX - bounds.left) / bounds.width - 0.5) * 2, -1, 1),
      y: THREE.MathUtils.clamp(((event.clientY - bounds.top) / bounds.height - 0.5) * 2, -1, 1)
    };
    this.pointerFocus.lastSeenAt = now;
    this.pointerFocus.lastMovedAt = now;
  };

  private onPointerLeave = (): void => {
    if (!this.pointerAwarenessEnabled) return;
    this.pointerFocus.lastSeenAt = 0;
    this.pointerFocus.lastMovedAt = 0;
    this.pointerFocusTarget = { x: 0, y: 0 };
  };

  private resize(): void {
    if (!this.renderer || !this.camera) return;
    const width = Math.max(1, this.stage.clientWidth);
    const height = Math.max(1, this.stage.clientHeight);
    if (width <= 1 || height <= 1) {
      this.setStatus("Synra layout waiting");
    }
    const aspect = width / height;
    this.applyCameraFraming(aspect, width, height);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.adaptivePixelRatio);
    this.renderer.setSize(width, height, false);
  }

  private applyCameraFraming(aspect: number, width = this.stage.clientWidth, height = this.stage.clientHeight): void {
    if (!this.camera) return;
    if (!this.mobilePerformanceMode) {
      this.camera.fov = 26;
      this.camera.position.set(0, 0.86, 4.15);
      this.camera.lookAt(0, 0.86, 0);
      return;
    }

    const wideStage = aspect > 1.35;
    const tabletStage = Math.max(width, height) >= 760 || Math.min(width, height) >= 520;
    if (tabletStage) {
      this.camera.fov = wideStage ? 24.5 : 25.5;
      this.camera.position.set(0, wideStage ? 0.9 : 0.92, wideStage ? 4.35 : 4.55);
      this.camera.lookAt(0, wideStage ? 0.88 : 0.9, 0);
      return;
    }

    this.camera.fov = wideStage ? 26 : 27;
    this.camera.position.set(0, wideStage ? 0.9 : 0.92, wideStage ? 4.75 : 4.95);
    this.camera.lookAt(0, wideStage ? 0.86 : 0.88, 0);
  }

  private async loadVrm(url: string, serial = this.avatarLoadSerial): Promise<void> {
    if (!this.scene) return;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const gltf = await loader.loadAsync(url);
    if (serial !== this.avatarLoadSerial) {
      VRMUtils.deepDispose(gltf.scene);
      return;
    }
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) throw new Error("VRM payload missing");
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    vrm.humanoid.resetNormalizedPose();
    vrm.scene.rotation.y = 0;
    this.releaseCurrentVrm();
    this.prepareVrmForPreview(vrm);
    this.scene.add(vrm.scene);
    this.vrm = vrm;
    this.captureBones(vrm);
    this.captureMouthMorphMeshes(vrm);
    this.calibrateFloorAnchor(vrm);
    await this.authoredMotion.boot(vrm);
  }

  private releaseCurrentVrm(): void {
    if (!this.vrm) {
      this.bones = {};
      this.mouthMorphMeshes = [];
      this.expressionCurrent = {};
      return;
    }

    this.authoredMotion.dispose();
    this.scene?.remove(this.vrm.scene);
    VRMUtils.deepDispose(this.vrm.scene);
    this.vrm = null;
    this.bones = {};
    this.mouthMorphMeshes = [];
    this.expressionCurrent = {};
    this.lastFrame = null;
  }

  private captureBones(vrm: VRM): void {
    const map: BoneMap = {};
    for (const [name, humanName] of Object.entries(BONE_ALIAS) as Array<[BoneName, string | null]>) {
      if (!humanName) continue;
      const normalized = vrm.humanoid.getNormalizedBoneNode?.(humanName as VRMHumanBoneName);
      const raw = vrm.humanoid.getRawBoneNode(humanName as VRMHumanBoneName);
      const bone = normalized || raw;
      if (!bone) continue;
      if (INVERTED_ARM_BONES.has(name)) {
        bone.userData.synraInvertArmZ = true;
      }
      map[name] = bone;
    }
    this.bones = map;
  }

  private captureMouthMorphMeshes(vrm: VRM): void {
    const meshes: MorphMesh[] = [];
    vrm.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const dictionary = mesh.morphTargetDictionary;
      const influences = mesh.morphTargetInfluences;
      if (!dictionary || !influences || dictionary.Fcl_MTH_Close === undefined) return;
      meshes.push(mesh as MorphMesh);
    });
    this.mouthMorphMeshes = meshes;
  }

  private calibrateFloorAnchor(vrm: VRM): void {
    vrm.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(vrm.scene);
    this.floorAnchorY = Number.isFinite(box.min.y) ? Math.max(0, -box.min.y) : 0;
  }

  private animate = (timestamp = 0): void => {
    this.rafId = window.requestAnimationFrame(this.animate);
    if (!this.renderer || !this.scene || !this.camera || !this.vrm) return;
    if (this.webglContextLost) return;
    if (this.shouldSkipFrameForTargetFps(timestamp)) {
      return;
    }
    const delta = Math.min(this.clock.getDelta(), 1 / 30);
    if (this.animationPaused || (typeof document !== "undefined" && document.hidden)) {
      this.hiddenFrameSkips += 1;
      return;
    }
    const now = this.clock.getElapsedTime();
    const frame = this.motionEngine.update({ now, delta });
    this.lastFrame = frame;
    const referenceAuthoredBodyActive = this.isReferenceAuthoredBodyActive(frame);
    const localInstalledBodyActive = this.authoredMotion.isLocalInstalledFullBodyPlaying;
    const authoredBodyActive = referenceAuthoredBodyActive || localInstalledBodyActive || this.isAuthoredBodyActive(frame);

    this.screenOffsetCurrent.x = lerp(this.screenOffsetCurrent.x, this.screenOffsetTarget.x, 0.12);
    this.screenOffsetCurrent.y = lerp(this.screenOffsetCurrent.y, this.screenOffsetTarget.y, 0.12);
    const rootOffset = authoredBodyActive ? { x: 0, y: 0, z: 0 } : frame.rootOffset;
    this.vrm.scene.position.set(
      rootOffset.x + this.screenOffsetCurrent.x,
      this.floorAnchorY + rootOffset.y + this.screenOffsetCurrent.y,
      rootOffset.z
    );
    this.updateContactShadow();

    if (!authoredBodyActive) {
      for (const [boneName, euler] of Object.entries(frame.rotations) as Array<[BoneName, { x?: number; y?: number; z?: number }]>) {
        const bone = this.bones[boneName];
        if (!bone) continue;
        const rotateZ = bone?.userData?.synraInvertArmZ && euler.z !== undefined ? -euler.z : euler.z;
        const hard = frame.hardBones.includes(boneName);
        const blend = hard ? Math.max(0.82, frame.blend) : frame.blend;
        if (euler.x !== undefined) bone.rotation.x = lerp(bone.rotation.x, euler.x, blend);
        if (euler.y !== undefined) bone.rotation.y = lerp(bone.rotation.y, euler.y, blend);
        if (rotateZ !== undefined) bone.rotation.z = lerp(bone.rotation.z, rotateZ, blend);
      }

      if (frame.rightArmIk) this.applyRightArmIk(frame.rightArmIk.wrist, frame.rightArmIk.weight);
    }
    this.authoredMotion.update(delta);
    if (!frame.activeAction && !referenceAuthoredBodyActive && !localInstalledBodyActive) this.resumeAuthoredLoopIfNeeded(now);
    if (!authoredBodyActive) this.applyProceduralCorrections(frame, now);
    if (this.bodyPlaybackMode !== "playground" && !referenceAuthoredBodyActive && !localInstalledBodyActive) this.applyAuthoredMotionCorrections(now);
    if (!referenceAuthoredBodyActive && !localInstalledBodyActive) this.performanceController.apply({
      now,
      delta,
      mode: this.motionEngine.debugState().mode as SynraMode,
      expression: this.motionEngine.debugState().expression as SynraExpression,
      speaking: this.speaking,
      activeProceduralAction: frame.activeAction?.name ?? null,
      activeAuthoredClip: this.authoredMotion.activeClipId,
      activeBaseClip: this.authoredMotion.activeClipIdForChannel("base"),
      activeGestureClip: this.authoredMotion.activeClipIdForChannel("gesture"),
      lastRoute: this.lastResolvedMotionRoute,
      fallbackReason: this.lastFallbackDecision?.reason ?? this.lastFallbackReason
    }, {
      poseBone: (boneName, target, weight) => this.poseBone(boneName, target, weight),
      readBone: (boneName) => {
        const bone = this.bones[boneName];
        return bone ? { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z } : null;
      },
      applyRightArmIk: (target, weight) => this.applyRightArmIk(target, weight)
    });
    if (!referenceAuthoredBodyActive) {
      this.applyPointerAwareness(now);
      this.applyGazePose(now);
    }
    if (this.speaking && !referenceAuthoredBodyActive) {
      this.applySpeakingLifeOverlay(now, this.speakingLifeOverlayStrength(localInstalledBodyActive));
    }
    this.writeDebugAttributes();

    const manager = this.vrm.expressionManager;
    if (manager) {
      for (const [key, value] of Object.entries(frame.expressions)) {
        if (!VRM_PRESET_EXPRESSION_KEYS.has(key)) continue;
        manager.setValue(key, this.smoothedAvatarExpressionValue(key, value));
      }
      if (!referenceAuthoredBodyActive) this.applyLookExpressions(frame, now);
      this.visemeCurrent.aa = lerp(this.visemeCurrent.aa, this.visemeTarget.aa, this.visemeBlend("aa"));
      this.visemeCurrent.ih = lerp(this.visemeCurrent.ih, this.visemeTarget.ih, this.visemeBlend("ih"));
      this.visemeCurrent.ou = lerp(this.visemeCurrent.ou, this.visemeTarget.ou, this.visemeBlend("ou"));
      this.visemeCurrent.ee = lerp(this.visemeCurrent.ee, this.visemeTarget.ee, this.visemeBlend("ee"));
      this.visemeCurrent.oh = lerp(this.visemeCurrent.oh, this.visemeTarget.oh, this.visemeBlend("oh"));
      this.visemeCurrent.open = lerp(this.visemeCurrent.open, this.visemeTarget.open, this.visemeBlend("open"));
      const profile = this.expressionProfile();
      const speechFrame = this.trackSpeechPerformance(now);
      const speakingLife = this.effectiveSpeakingLifeProfile();
      const openMouth = this.shapedSpeechOpen() * speakingLife.mouthOpenScale * profile.visemeScale;
      if (this.speaking) {
        const mouthTargets = this.phonemeAwareMouthTargets(openMouth, speechFrame, profile.visemeScale, speakingLife);
        manager.setValue("aa", mouthTargets.aa);
        manager.setValue("ih", mouthTargets.ih);
        manager.setValue("ou", mouthTargets.ou);
        manager.setValue("ee", mouthTargets.ee);
        manager.setValue("oh", mouthTargets.oh);
      } else {
        manager.setValue("aa", 0);
        manager.setValue("ih", 0);
        manager.setValue("ou", 0);
        manager.setValue("ee", 0);
        manager.setValue("oh", 0);
        this.visemeCurrent = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, open: 0 };
        this.previousSpeechPeak = 0;
      }
      manager.update();
    }

    this.vrm.update(delta);
    if (!referenceAuthoredBodyActive) this.applyFloorContact(frame);
    this.updateContactShadow();
    this.applyMouthCloseOverride();
    this.renderer.render(this.scene, this.camera);
    this.frameCount += 1;
    this.lastRenderedAtMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (this.frameCount % (this.mobilePerformanceMode ? 90 : 180) === 0) {
      this.postMobileRuntimeEvent("synra.runtime.health", this.runtimeHealth());
    }
  };

  private shouldSkipFrameForTargetFps(timestamp = 0): boolean {
    if (!this.mobilePerformanceMode || this.targetFrameIntervalMs <= 0) return false;
    const now = timestamp || (typeof performance !== "undefined" ? performance.now() : Date.now());
    if (this.lastAnimationTickMs <= 0) {
      this.lastAnimationTickMs = now;
      return false;
    }
    const elapsedMs = now - this.lastAnimationTickMs;
    const toleranceMs = 1.25;
    if (elapsedMs + toleranceMs < this.targetFrameIntervalMs) return true;

    // Keep pacing tied to the scheduled frame cadence. Reset after a long pause so
    // hidden tabs or renderer stalls do not create a burst of catch-up frames.
    if (elapsedMs > 250) {
      this.lastAnimationTickMs = now;
      return false;
    }
    const intervals = Math.max(1, Math.floor((elapsedMs + toleranceMs) / this.targetFrameIntervalMs));
    this.lastAnimationTickMs += intervals * this.targetFrameIntervalMs;
    return false;
  }

  private installContactShadow(): void {
    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = 128;
    textureCanvas.height = 128;
    const context = textureCanvas.getContext("2d");
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 6, 64, 64, 58);
      gradient.addColorStop(0, "rgba(0, 0, 0, 0.42)");
      gradient.addColorStop(0.56, "rgba(0, 0, 0, 0.18)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const geometry = new THREE.PlaneGeometry(0.92, 0.34);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.82,
      depthWrite: false
    });
    const shadow = new THREE.Mesh(geometry, material);
    shadow.name = "SynraContactShadow";
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.006, 0.03);
    shadow.renderOrder = -1;
    this.contactShadow = shadow;
    this.scene?.add(shadow);
  }

  private updateContactShadow(): void {
    if (!this.contactShadow || !this.vrm) return;
    this.contactShadow.position.x = this.vrm.scene.position.x;
    this.contactShadow.position.z = this.vrm.scene.position.z + 0.025;
  }

  private prepareVrmForPreview(vrm: VRM): void {
    vrm.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!material) continue;
        material.needsUpdate = true;
      }
    });
  }

  private updateGazeOverride(intent: ReturnType<typeof resolveSynraActionIntent> | null, now: number): void {
    if (!intent || intent.family !== "look") return;
    const direction = intent.direction;
    if (direction !== "left" && direction !== "right" && direction !== "up" && direction !== "down" && direction !== "center") return;
    if (direction === "center") {
      this.gazeOverride = { direction, startedAt: now, until: now + 0.72, strength: 1 };
      return;
    }
    this.gazeOverride = {
      direction,
      startedAt: now,
      until: now + 2.2,
      strength: THREE.MathUtils.clamp(intent.intensity ?? 0.84, 0.45, 1)
    };
  }

  private applyGazePose(now: number): void {
    if (!this.gazeOverride) return;
    const target = this.gazePoseTarget(this.gazeOverride.direction);
    const setup = smoothstep(this.gazeOverride.startedAt, this.gazeOverride.startedAt + 0.22, now);
    const release = 1 - smoothstep(this.gazeOverride.until - 0.28, this.gazeOverride.until, now);
    const weight = setup * release * this.gazeOverride.strength;
    if (weight <= 0.001) {
      if (now >= this.gazeOverride.until) this.gazeOverride = null;
      return;
    }
    this.poseBone("neck", { x: target.headX * 0.28, y: target.headY * 0.24, z: -target.headY * 0.025 }, weight * 0.42);
    this.poseBone("head", { x: target.headX, y: target.headY, z: -target.headY * 0.035 }, weight * 0.72);
  }

  private applyPointerAwareness(now: number): void {
    if (!this.pointerAwarenessEnabled || !this.vrm || this.gazeOverride) return;
    const age = now - this.pointerFocus.lastSeenAt;
    const movementAge = now - this.pointerFocus.lastMovedAt;
    if (!this.pointerFocus.lastSeenAt || age > 2.4 || movementAge < 0.18) return;
    const settle = smoothstep(0.18, 0.72, movementAge);
    const release = 1 - smoothstep(1.7, 2.4, age);
    this.pointerFocus.x = lerp(this.pointerFocus.x, this.pointerFocusTarget.x, 0.035);
    this.pointerFocus.y = lerp(this.pointerFocus.y, this.pointerFocusTarget.y, 0.035);
    const x = this.pointerFocus.x * release;
    const y = this.pointerFocus.y * release;
    const weight = 0.035 * settle;
    this.poseBone("neck", { x: y * 0.014, y: -x * 0.02 }, weight);
    this.poseBone("head", { x: y * 0.04, y: -x * 0.065, z: x * 0.006 }, weight);
  }

  private applySpeakingLifeOverlay(now: number, strength: number): void {
    const profile = this.effectiveSpeakingLifeProfile();
    const performanceFrame = this.trackSpeechPerformance(now);
    const energy = performanceFrame.peak;
    const onset = performanceFrame.onset;
    const phraseProgress = performanceFrame.phraseProgress;
    const phrase = Math.sin(phraseProgress * Math.PI * 2 + now * 0.18);
    const syllable = Math.sin(now * (5.6 + energy * 2.2 + performanceFrame.mouthShapeVariety * 1.2) + phraseProgress * Math.PI * 6);
    const micro = Math.sin(now * 9.4 + energy * 1.7 + performanceFrame.consonantBias * 0.9);
    const conversationalTurn = Math.sin(now * 0.48 + performanceFrame.gazeBias);
    const emphasisNod = Math.max(0, syllable) * (0.28 + onset * 0.72 + performanceFrame.vowelBias * 0.16);
    const emphasisBeat = Math.max(performanceFrame.emphasisBeat, performanceFrame.gestureIntent === "emphasis_beat" ? 0.42 : 0);
    const gestureLift = this.speechGestureLift(performanceFrame);
    const toneMotionScale = this.speechToneMotionScale(performanceFrame);
    const activeSpeechLift = 0.82 + energy * 0.28 + performanceFrame.mouthShapeVariety * 0.1;
    const phraseGesture = (0.58 + emphasisBeat * 0.34 + gestureLift * 0.22) * profile.phraseGestureScale * toneMotionScale * activeSpeechLift;
    const weight = THREE.MathUtils.clamp(strength * (0.38 + energy * 0.76 + performanceFrame.mouthShapeVariety * 0.1 + emphasisBeat * 0.12), 0.08, 0.96);
    const headScale = profile.headMotionScale;
    const handScale = profile.handBeatScale;
    const microScale = profile.microGestureScale;
    const closureBeat = performanceFrame.consonantBias * (0.08 + onset * 0.12);
    const vowelLift = performanceFrame.vowelBias * energy * 0.1;
    const pauseEase = 1 - performanceFrame.pauseStrength * 0.42;
    const questionLift = performanceFrame.gestureIntent === "question_lift" ? 0.032 : 0;
    const explainBeat = performanceFrame.gestureIntent === "explain_beat" ? 0.04 : 0;
    const reassureSoft = performanceFrame.gestureIntent === "reassure_soft" ? 0.74 : 1;

    this.poseBone("upperChest", {
      x: (-0.018 - energy * 0.016 - gestureLift * 0.012) * headScale * pauseEase,
      y: (phrase * 0.032 + conversationalTurn * 0.018 + questionLift) * headScale,
      z: (phrase * 0.014 + onset * 0.01 + emphasisBeat * 0.01) * microScale
    }, weight * 0.24 * phraseGesture * reassureSoft);
    this.poseBone("neck", {
      x: (-0.018 - energy * 0.018 + syllable * 0.015 - emphasisNod * 0.024 - closureBeat * 0.02 - explainBeat * 0.3) * headScale * pauseEase,
      y: (phrase * 0.046 + conversationalTurn * 0.03 + questionLift * 0.42) * headScale,
      z: (micro * 0.01 + onset * 0.014 + emphasisBeat * 0.012) * microScale
    }, weight * 0.31 * phraseGesture * reassureSoft);
    this.poseBone("head", {
      x: (-0.028 - energy * 0.036 + syllable * 0.026 - emphasisNod * 0.04 - closureBeat * 0.028 + vowelLift - explainBeat) * headScale * pauseEase,
      y: (phrase * 0.06 + conversationalTurn * 0.038 + questionLift * 0.58) * headScale,
      z: (micro * 0.014 + onset * 0.019 + emphasisBeat * 0.015) * microScale
    }, weight * 0.42 * phraseGesture * reassureSoft);

    const handBeat = Math.max(0, syllable) * energy + onset * 0.22 + performanceFrame.mouthShapeVariety * 0.09 + emphasisBeat * 0.18;
    const leftHandBeat = Math.max(0, -syllable) * energy * 0.58 + gestureLift * 0.16 + emphasisBeat * 0.11;
    this.poseBone("rightShoulder", { z: (-0.018 + phrase * 0.014 - gestureLift * 0.014) * handScale }, weight * 0.16 * phraseGesture * reassureSoft);
    this.poseBone("rightLowerArm", { z: -0.18 - handBeat * 0.1 * handScale, x: -0.02 - energy * 0.032 * handScale - explainBeat * 0.28 }, weight * 0.22 * phraseGesture * reassureSoft);
    this.poseBone("rightHand", { y: 0.12 + handBeat * 0.13 * handScale + gestureLift * 0.035, z: micro * 0.042 * microScale, x: -0.035 - emphasisBeat * 0.022 }, weight * 0.24 * phraseGesture * reassureSoft);
    this.poseBone("leftShoulder", { z: (0.012 - phrase * 0.01 + gestureLift * 0.01) * handScale }, weight * 0.1 * phraseGesture * reassureSoft);
    this.poseBone("leftLowerArm", { z: 0.08 + leftHandBeat * 0.052 * handScale, x: -0.012 - gestureLift * 0.018 }, weight * 0.11 * phraseGesture * reassureSoft);
    this.poseBone("leftHand", { y: -0.08 + phrase * 0.04 * handScale + onset * 0.034 * handScale + vowelLift * handScale + leftHandBeat * 0.04, z: -micro * 0.024 * microScale, x: 0.018 + gestureLift * 0.018 }, weight * 0.15 * phraseGesture * reassureSoft);
  }

  private speechToneMotionScale(frame: SpeechPerformanceFrame): number {
    if (frame.sentenceTone === "celebrate") return 1.16;
    if (frame.sentenceTone === "question") return 1.1;
    if (frame.sentenceTone === "explain") return 1.08;
    if (frame.sentenceTone === "confirm") return 1.04;
    if (frame.sentenceTone === "reassure") return 0.84;
    return 1;
  }

  private speechGestureLift(frame: SpeechPerformanceFrame): number {
    if (frame.gestureIntent === "celebrate_lift") return 0.72 + frame.emphasisBeat * 0.28;
    if (frame.gestureIntent === "question_lift") return 0.5 + frame.phrase * 0.2;
    if (frame.gestureIntent === "explain_beat") return 0.34 + frame.emphasisBeat * 0.22;
    if (frame.gestureIntent === "confirm_nod") return 0.24 + frame.onset * 0.18;
    if (frame.gestureIntent === "emphasis_beat") return 0.38 + frame.emphasisBeat * 0.32;
    return 0;
  }

  private speakingLifeOverlayStrength(localInstalledBodyActive: boolean): number {
    const profile = this.effectiveSpeakingLifeProfile();
    return localInstalledBodyActive
      ? profile.localInstalledOverlayStrength
      : profile.proceduralOverlayStrength;
  }

  private speechEnergy(): number {
    const targetPeak = Math.max(this.visemeTarget.aa, this.visemeTarget.ih, this.visemeTarget.ou, this.visemeTarget.ee, this.visemeTarget.oh, this.visemeTarget.open * 0.8);
    const currentPeak = Math.max(this.visemeCurrent.aa, this.visemeCurrent.ih, this.visemeCurrent.ou, this.visemeCurrent.ee, this.visemeCurrent.oh, this.visemeCurrent.open * 0.8);
    return THREE.MathUtils.clamp(Math.max(targetPeak, currentPeak), 0, 1);
  }

  private trackSpeechPerformance(now: number): SpeechPerformanceFrame {
    const peak = this.speechEnergy();
    const onset = THREE.MathUtils.clamp((peak - this.previousSpeechPeak) * 4.2, 0, 1);
    const metadata = this.speechMetadata;
    const phraseProgress = metadata
      ? THREE.MathUtils.clamp(metadata.ratio, 0, 1)
      : THREE.MathUtils.clamp(Math.sin(now * 0.34) * 0.5 + 0.5, 0, 1);
    const phrase = THREE.MathUtils.clamp(Math.sin(phraseProgress * Math.PI) * 0.72 + Math.sin(now * 0.72) * 0.14 + 0.18, 0, 1);
    const phonemeUnit = metadata?.unit ?? this.inferredSpeechMetadata(this.visemeTarget).unit;
    const consonantBias = this.consonantBiasForUnit(phonemeUnit);
    const vowelBias = this.vowelBiasForUnit(phonemeUnit);
    const mouthShapeVariety = THREE.MathUtils.clamp(
      Math.abs(this.visemeCurrent.aa - this.visemeCurrent.ou)
      + Math.abs(this.visemeCurrent.ee - this.visemeCurrent.oh)
      + consonantBias * 0.24
      + vowelBias * 0.18,
      0,
      1
    );
    const gazeBias = lerp(this.speechPerformance.gazeBias, Math.sin(now * 0.58 + peak * 1.7), 0.035);
    this.previousSpeechPeak = lerp(this.previousSpeechPeak, peak, peak > this.previousSpeechPeak ? 0.62 : 0.18);
    this.speechPerformance = {
      peak,
      onset,
      phrase,
      gazeBias,
      lastVisemeAt: this.speechPerformance.lastVisemeAt,
      phonemeUnit,
      phraseProgress,
      mouthShapeVariety,
      consonantBias,
      vowelBias,
      sentenceTone: metadata?.sentenceTone ?? "unknown",
      gestureIntent: metadata?.gestureIntent ?? "unknown",
      sentenceProgress: metadata?.sentenceProgress ?? phraseProgress,
      emphasisBeat: metadata?.emphasisBeat ?? 0,
      pauseStrength: metadata?.pauseStrength ?? 0
    };
    return this.speechPerformance;
  }

  private shapedSpeechOpen(): number {
    const open = this.visemeCurrent.open;
    const peak = this.speechEnergy();
    const frame = this.speechPerformance;
    const profile = this.effectiveSpeakingLifeProfile();
    const vowelLift = frame.vowelBias * (0.08 + frame.phrase * 0.04);
    const consonantRelease = frame.onset * (0.05 + frame.consonantBias * 0.04);
    const pauseDampen = 1 - frame.pauseStrength * 0.72;
    const floor = this.speaking ? 0.055 * pauseDampen : 0;
    const jawMultiplier = 0.9 + profile.jawMotionScale * 0.1;
    return THREE.MathUtils.clamp(
      Math.max(floor, open * 0.74 + Math.sqrt(Math.max(0, peak)) * 0.22 + vowelLift + consonantRelease) * pauseDampen * jawMultiplier,
      0,
      1
    );
  }

  private phonemeAwareMouthTargets(
    openMouth: number,
    speechFrame: SpeechPerformanceFrame,
    visemeScale: number,
    speakingLife: SynraSpeakingLifeProfile
  ): SpeechVisemes {
    const peak = Math.max(this.visemeCurrent.aa, this.visemeCurrent.ih, this.visemeCurrent.ou, this.visemeCurrent.ee, this.visemeCurrent.oh);
    const fallbackOpen = peak < 0.08 ? openMouth * speakingLife.fallbackOpenScale : openMouth * 0.18;
    const expressiveFallbackOpen = peak < 0.08 ? fallbackOpen : Math.max(fallbackOpen, openMouth * 0.24);
    const consonantPulse = speechFrame.onset * speakingLife.consonantPulseScale;
    const expressiveConsonantPulse = consonantPulse + speechFrame.emphasisBeat * 0.026;
    const toneShapeLift = speechFrame.sentenceTone === "celebrate"
      ? 0.036
      : speechFrame.sentenceTone === "question"
        ? 0.024
        : speechFrame.sentenceTone === "explain"
          ? 0.018
          : 0;
    const mouthFloor = speechFrame.pauseStrength > 0.6 ? 0.01 : THREE.MathUtils.clamp(openMouth * 0.14 + speechFrame.peak * 0.022 + toneShapeLift * 0.36, 0.016, 0.1);
    const base: SpeechVisemes = {
      aa: Math.min(0.94, Math.max(this.visemeCurrent.aa * visemeScale, expressiveFallbackOpen + expressiveConsonantPulse, mouthFloor)),
      ih: Math.min(0.88, Math.max(this.visemeCurrent.ih * visemeScale + speechFrame.onset * 0.032, mouthFloor * 0.72)),
      ou: this.visemeCurrent.ou * visemeScale,
      ee: Math.min(0.84, Math.max(this.visemeCurrent.ee * visemeScale + speechFrame.gazeBias * 0.014, mouthFloor * 0.64)),
      oh: Math.min(0.92, Math.max(this.visemeCurrent.oh * visemeScale + openMouth * speakingLife.vowelHoldScale, mouthFloor * 0.86)),
      open: openMouth
    };
    const unit = speechFrame.phonemeUnit;
    const closure = speechFrame.consonantBias * Math.max(0.18, 0.56 - speechFrame.onset * 0.24);
    const vowelHold = speechFrame.vowelBias * (0.12 + speechFrame.phrase * 0.1 + toneShapeLift);
    const shapeWeight = THREE.MathUtils.clamp(0.2 + speechFrame.mouthShapeVariety * 0.32 + speechFrame.onset * 0.14 + speechFrame.emphasisBeat * 0.04, 0.14, 0.58);
    let shaped: SpeechVisemes = { ...base };

    if (unit === "mbp") {
      shaped = { aa: 0.018, ih: 0.006, ou: 0.006, ee: 0.006, oh: 0.006, open: 0.018 + speechFrame.onset * 0.04 };
    } else if (unit === "fv" || unit === "th") {
      shaped.ee = Math.max(shaped.ee, 0.22 + speechFrame.peak * 0.28);
      shaped.ih = Math.max(shaped.ih, 0.12 + speechFrame.peak * 0.18);
      shaped.aa *= 0.62;
      shaped.oh *= 0.64;
    } else if (unit === "sh" || unit === "ch_j") {
      shaped.ih = Math.max(shaped.ih, 0.18 + speechFrame.peak * 0.28);
      shaped.ou = Math.max(shaped.ou, 0.12 + speechFrame.peak * 0.24);
      shaped.aa *= 0.68;
    } else if (unit === "oo") {
      shaped.ou = Math.max(shaped.ou, 0.3 + speechFrame.peak * 0.5 + vowelHold + speechFrame.emphasisBeat * 0.025);
      shaped.aa *= 0.58;
      shaped.ee *= 0.62;
    } else if (unit === "oh") {
      shaped.oh = Math.max(shaped.oh, 0.28 + speechFrame.peak * 0.52 + vowelHold + speechFrame.emphasisBeat * 0.025);
      shaped.aa = Math.max(shaped.aa * 0.72, openMouth * 0.2);
    } else if (unit === "ee") {
      shaped.ee = Math.max(shaped.ee, 0.28 + speechFrame.peak * 0.46 + vowelHold + speechFrame.emphasisBeat * 0.02);
      shaped.ih = Math.max(shaped.ih, 0.14 + speechFrame.peak * 0.16);
      shaped.ou *= 0.56;
      shaped.oh *= 0.62;
    } else if (unit === "vowel") {
      shaped.aa = Math.max(shaped.aa, 0.26 + speechFrame.peak * 0.54 + vowelHold + toneShapeLift);
      shaped.oh = Math.max(shaped.oh, openMouth * 0.2 + toneShapeLift * 0.42);
      shaped.open = Math.max(shaped.open, openMouth * 0.96);
    } else if (unit === "pause") {
      shaped.aa *= 0.42;
      shaped.ih *= 0.38;
      shaped.ou *= 0.34;
      shaped.ee *= 0.34;
      shaped.oh *= 0.36;
    }

    if (closure > 0.01 && unit !== "mbp") {
      shaped.aa *= 1 - closure * 0.24;
      shaped.oh *= 1 - closure * 0.2;
      shaped.ou *= 1 - closure * 0.14;
    }

    return {
      aa: THREE.MathUtils.clamp(lerp(base.aa, shaped.aa, shapeWeight), 0, 0.94),
      ih: THREE.MathUtils.clamp(lerp(base.ih, shaped.ih, shapeWeight), 0, 0.88),
      ou: THREE.MathUtils.clamp(lerp(base.ou, shaped.ou, shapeWeight), 0, 0.9),
      ee: THREE.MathUtils.clamp(lerp(base.ee, shaped.ee, shapeWeight), 0, 0.88),
      oh: THREE.MathUtils.clamp(lerp(base.oh, shaped.oh, shapeWeight), 0, 0.92),
      open: THREE.MathUtils.clamp(lerp(base.open, shaped.open ?? base.open, shapeWeight), 0, 1)
    };
  }

  private sanitizedSpeechMetadata(meta: SpeechVisemeMetadata): SpeechVisemeMetadata {
    return {
      marker: "synra-phoneme-aware-speech-v1",
      charIndex: Math.max(0, Math.round(Number(meta.charIndex) || 0)),
      ratio: THREE.MathUtils.clamp(Number(meta.ratio) || 0, 0, 1),
      durationMs: Math.max(0, Math.round(Number(meta.durationMs) || 0)),
      unit: this.normalizeSpeechUnit(meta.unit),
      energy: THREE.MathUtils.clamp(Number(meta.energy) || 0, 0, 1),
      phraseEmphasis: THREE.MathUtils.clamp(Number(meta.phraseEmphasis) || 1, 0.7, 1.25),
      sentenceIndex: Math.max(0, Math.round(Number(meta.sentenceIndex) || 0)),
      sentenceProgress: THREE.MathUtils.clamp(Number(meta.sentenceProgress) || 0, 0, 1),
      sentenceTone: this.normalizeSentenceTone(meta.sentenceTone),
      gestureIntent: this.normalizeGestureIntent(meta.gestureIntent),
      emphasisBeat: THREE.MathUtils.clamp(Number(meta.emphasisBeat) || 0, 0, 1),
      pauseStrength: THREE.MathUtils.clamp(Number(meta.pauseStrength) || 0, 0, 1),
      source: meta.source === "boundary" || meta.source === "timer" ? meta.source : "manual"
    };
  }

  private inferredSpeechMetadata(visemes: Partial<SpeechVisemes>): SpeechVisemeMetadata {
    const unit = this.inferSpeechUnit(visemes);
    const peak = Math.max(Number(visemes.aa ?? 0), Number(visemes.ih ?? 0), Number(visemes.ou ?? 0), Number(visemes.ee ?? 0), Number(visemes.oh ?? 0), Number(visemes.open ?? 0));
    return {
      marker: "synra-phoneme-aware-speech-v1",
      charIndex: 0,
      ratio: THREE.MathUtils.clamp(this.speechPerformance.phraseProgress + 0.035, 0, 1),
      durationMs: 0,
      unit,
      energy: THREE.MathUtils.clamp(peak, 0, 1),
      phraseEmphasis: 1,
      sentenceIndex: 0,
      sentenceProgress: THREE.MathUtils.clamp(this.speechPerformance.sentenceProgress + 0.035, 0, 1),
      sentenceTone: "neutral",
      gestureIntent: peak > 0.3 ? "emphasis_beat" : "steady",
      emphasisBeat: THREE.MathUtils.clamp(peak * 0.42, 0, 1),
      pauseStrength: unit === "pause" ? 0.6 : 0,
      source: "manual"
    };
  }

  private inferSpeechUnit(visemes: Partial<SpeechVisemes>): SpeechUnit {
    const entries: Array<[SpeechUnit, number]> = [
      ["oo", Number(visemes.ou ?? 0)],
      ["oh", Number(visemes.oh ?? 0)],
      ["ee", Number(visemes.ee ?? 0)],
      ["vowel", Number(visemes.aa ?? 0)],
      ["other", Number(visemes.ih ?? 0)]
    ];
    const [unit, value] = entries.sort((a, b) => b[1] - a[1])[0] ?? ["pause", 0];
    return value <= 0.025 && Number(visemes.open ?? 0) <= 0.025 ? "pause" : unit;
  }

  private normalizeSpeechUnit(unit: SpeechUnit | string): SpeechUnit {
    if (unit === "mbp" || unit === "fv" || unit === "th" || unit === "sh" || unit === "ch_j" || unit === "oo" || unit === "oh" || unit === "ee" || unit === "vowel" || unit === "other" || unit === "pause") return unit;
    return "other";
  }

  private consonantBiasForUnit(unit: SpeechUnit | "unknown"): number {
    if (unit === "mbp") return 1;
    if (unit === "fv" || unit === "th" || unit === "sh" || unit === "ch_j") return 0.74;
    if (unit === "other") return 0.42;
    return 0;
  }

  private vowelBiasForUnit(unit: SpeechUnit | "unknown"): number {
    if (unit === "vowel") return 0.86;
    if (unit === "oo" || unit === "oh" || unit === "ee") return 1;
    return 0;
  }

  private normalizeSentenceTone(tone: SpeechSentenceTone | string | undefined): SpeechSentenceTone {
    if (tone === "question" || tone === "explain" || tone === "reassure" || tone === "celebrate" || tone === "confirm" || tone === "neutral") return tone;
    return "neutral";
  }

  private normalizeGestureIntent(intent: SpeechGestureIntent | string | undefined): SpeechGestureIntent {
    if (intent === "question_lift" || intent === "explain_beat" || intent === "reassure_soft" || intent === "celebrate_lift" || intent === "confirm_nod" || intent === "emphasis_beat" || intent === "steady") return intent;
    return "steady";
  }

  private speechPerformanceDebug(): Record<string, number | string | null> {
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    return {
      marker: "synra-phoneme-aware-performance-v1",
      peak: Number(this.speechPerformance.peak.toFixed(3)),
      onset: Number(this.speechPerformance.onset.toFixed(3)),
      phrase: Number(this.speechPerformance.phrase.toFixed(3)),
      gazeBias: Number(this.speechPerformance.gazeBias.toFixed(3)),
      phonemeUnit: this.speechPerformance.phonemeUnit,
      phraseProgress: Number(this.speechPerformance.phraseProgress.toFixed(3)),
      mouthShapeVariety: Number(this.speechPerformance.mouthShapeVariety.toFixed(3)),
      consonantBias: Number(this.speechPerformance.consonantBias.toFixed(3)),
      vowelBias: Number(this.speechPerformance.vowelBias.toFixed(3)),
      visemeAgeMs: this.speechPerformance.lastVisemeAt ? Math.round(nowMs - this.speechPerformance.lastVisemeAt) : null
    };
  }

  private effectiveSpeakingLifeProfile(): SynraSpeakingLifeProfile {
    const selected = normalizeSpeakingLifeCalibrationMode(this.speakingLifeCalibrationMode);
    const settings = getSynraExperienceSettings();
    const deviceProfile = this.mobilePerformanceMode ? "ios" : "desktop";
    const calibrationId: SynraSpeakingLifeCalibrationId = settings.reduceMotion || selected === "reduced"
      ? "reduced_motion"
      : selected === "expressive"
        ? "expressive_desktop"
        : selected === "balanced"
          ? "balanced_ios"
          : this.mobilePerformanceMode
            ? "balanced_ios"
            : "expressive_desktop";

    return {
      ...SYNRA_SPEAKING_LIFE_PROFILE,
      ...SYNRA_SPEAKING_LIFE_CALIBRATIONS[calibrationId],
      calibrationId,
      calibrationMode: selected,
      deviceProfile,
      reduceMotion: settings.reduceMotion
    };
  }

  private speakingLifeProfileDebug(): Record<string, unknown> {
    const profile = this.effectiveSpeakingLifeProfile();
    const userFacingCalibration = profile.calibrationId === "reduced_motion"
      ? "reduced"
      : profile.calibrationId === "balanced_ios"
        ? "balanced"
        : "expressive";
    return {
      ...profile,
      selectedCalibration: this.speakingLifeCalibrationMode,
      resolvedCalibration: profile.calibrationId,
      userFacingCalibration,
      activeOverlayStrength: this.speakingLifeOverlayStrength(this.authoredMotion.isLocalInstalledFullBodyPlaying)
    };
  }

  private visemeBlend(key: keyof SpeechVisemes): number {
    const target = this.visemeTarget[key] ?? 0;
    const current = this.visemeCurrent[key] ?? 0;
    const profile = this.effectiveSpeakingLifeProfile();
    return target > current ? profile.visemeAttack : profile.visemeRelease;
  }

  private applyLookExpressions(frame: PoseFrame, now: number): void {
    const manager = this.vrm?.expressionManager;
    const head = frame.rotations.head || {};
    if (!manager) return;
    const gaze = this.activeGazeExpression(now);
    const speechGaze = this.speaking ? this.speechAwareGazeExpression(now) : { left: 0, right: 0, up: 0, down: 0 };
    const lookRight = Math.max(gaze.right, speechGaze.right, THREE.MathUtils.clamp((head.y ?? 0) / 0.42, 0, 1) * 0.72);
    const lookLeft = Math.max(gaze.left, speechGaze.left, THREE.MathUtils.clamp(-(head.y ?? 0) / 0.42, 0, 1) * 0.72);
    const lookUp = Math.max(gaze.up, speechGaze.up, THREE.MathUtils.clamp(-(head.x ?? 0) / 0.24, 0, 1) * 0.58);
    const lookDown = Math.max(gaze.down, speechGaze.down, THREE.MathUtils.clamp((head.x ?? 0) / 0.24, 0, 1) * 0.58);
    manager.setValue("lookRight", lookRight);
    manager.setValue("lookLeft", lookLeft);
    manager.setValue("lookUp", lookUp);
    manager.setValue("lookDown", lookDown);
  }

  private speechAwareGazeExpression(now: number): { left: number; right: number; up: number; down: number } {
    const frame = this.trackSpeechPerformance(now);
    const side = frame.gazeBias;
    const profile = this.effectiveSpeakingLifeProfile();
    const strength = THREE.MathUtils.clamp((0.06 + frame.peak * 0.13 + frame.onset * 0.08 + frame.emphasisBeat * 0.03) * profile.speechGazeScale, 0, 0.28);
    return {
      left: side > 0 ? side * strength : 0,
      right: side < 0 ? -side * strength : 0,
      up: frame.gestureIntent === "question_lift" ? THREE.MathUtils.clamp(frame.phrase * 0.09 * profile.speechGazeScale, 0, 0.1) : 0,
      down: THREE.MathUtils.clamp(frame.phrase * frame.peak * 0.07 * profile.speechGazeScale, 0, 0.1)
    };
  }

  private activeGazeExpression(now: number): { left: number; right: number; up: number; down: number } {
    const empty = { left: 0, right: 0, up: 0, down: 0 };
    if (!this.gazeOverride) return empty;
    const setup = smoothstep(this.gazeOverride.startedAt, this.gazeOverride.startedAt + 0.16, now);
    const release = 1 - smoothstep(this.gazeOverride.until - 0.28, this.gazeOverride.until, now);
    const weight = setup * release * this.gazeOverride.strength;
    if (weight <= 0.001) return empty;
    if (this.gazeOverride.direction === "left") return { ...empty, left: 0.76 * weight };
    if (this.gazeOverride.direction === "right") return { ...empty, right: 0.76 * weight };
    if (this.gazeOverride.direction === "up") return { ...empty, up: 0.62 * weight };
    if (this.gazeOverride.direction === "down") return { ...empty, down: 0.62 * weight };
    return empty;
  }

  private gazePoseTarget(direction: GazeDirection): { headX: number; headY: number } {
    switch (direction) {
      case "left":
        return { headX: -0.012, headY: 0.34 };
      case "right":
        return { headX: -0.012, headY: -0.34 };
      case "up":
        return { headX: -0.2, headY: 0 };
      case "down":
        return { headX: 0.22, headY: 0 };
      case "center":
      default:
        return { headX: 0, headY: 0 };
    }
  }

  private channelForActionIntent(intent: SynraActionIntent | null): SynraMotionChannel {
    if (!intent) return "gesture";
    if (intent.family === "look") return "gaze";
    if (intent.family === "idle" || intent.family === "listen" || intent.family === "think" || intent.family === "walk") return "base";
    return "gesture";
  }

  private bundledAssetVersion(): Record<string, string[]> {
    const scripts = [...document.querySelectorAll<HTMLScriptElement>("script[src]")]
      .map((script) => script.getAttribute("src") || "")
      .filter((src) => src.includes("/assets/") || src.includes("assets/"))
      .map((src) => src.split("/").pop() || src);
    const styles = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')]
      .map((link) => link.getAttribute("href") || "")
      .filter((href) => href.includes("/assets/") || href.includes("assets/"))
      .map((href) => href.split("/").pop() || href);
    return { scripts, styles };
  }

  private resumeAuthoredLoopIfNeeded(now: number, force = false): void {
    if (!this.preferAuthoredMotion || !this.desiredLoopRoute || !this.authoredMotion.isReady) return;
    if (!this.authoredMotion.hasPlayableRoute(this.desiredLoopRoute)) return;
    if (this.authoredMotion.isActiveRoute(this.desiredLoopRoute)) return;
    if (!force && this.authoredMotion.activeClipIdForChannel("base") && this.authoredMotion.isPlaying) return;
    if (!force && now - this.lastLoopKickAt < 0.35) return;

    this.lastLoopKickAt = now;
    void this.authoredMotion.play(this.desiredLoopRoute, { priority: -10, fadeIn: force ? 0.16 : 0.28 });
  }

  private applyFloorContact(frame: PoseFrame): void {
    if (!this.vrm) return;
    const activeFamily = frame.activeAction ? resolveSynraActionIntent(frame.activeAction.name).family : "";
    if (activeFamily === "jump") return;

    this.vrm.scene.updateMatrixWorld(true);
    this.tempBounds.setFromObject(this.vrm.scene);
    const minY = this.tempBounds.min.y;
    if (!Number.isFinite(minY)) return;

    const correction = -minY;
    if (Math.abs(correction) > 0.0005) {
      this.vrm.scene.position.y += correction;
      this.vrm.scene.updateMatrixWorld(true);
    }
  }

  private applyMouthCloseOverride(): void {
    if (!this.mouthMorphMeshes.length) return;
    const closeWeight = this.closedMouthWeight();
    const mouthKeys = ["Fcl_MTH_A", "Fcl_MTH_I", "Fcl_MTH_U", "Fcl_MTH_E", "Fcl_MTH_O"];

    for (const mesh of this.mouthMorphMeshes) {
      const closeIndex = mesh.morphTargetDictionary.Fcl_MTH_Close;
      if (closeIndex !== undefined) {
        mesh.morphTargetInfluences[closeIndex] = Math.max(mesh.morphTargetInfluences[closeIndex] || 0, closeWeight);
      }
      if (this.speaking) continue;
      for (const key of mouthKeys) {
        const index = mesh.morphTargetDictionary[key];
        if (index !== undefined) mesh.morphTargetInfluences[index] = 0;
      }
    }
  }

  private closedMouthWeight(): number {
    if (this.speaking) return 0;
    const profile = this.expressionProfile();
    const expression = this.lastFrame?.expressions || {};
    const expressiveOpen =
      Math.max(
        expression.surprised || 0,
        (expression.happy || 0) * 0.72,
        (expression.relaxed || 0) * 0.32
      ) * profile.expressiveMouthRelease;
    return THREE.MathUtils.clamp(profile.restMouthClose - expressiveOpen, profile.minimumMouthClose, profile.restMouthClose);
  }

  private smoothedAvatarExpressionValue(key: string, value: number): number {
    const target = this.avatarExpressionValue(key, value);
    const profile = this.expressionProfile();
    if (key === "blink" || key === "blinkLeft" || key === "blinkRight") {
      this.expressionCurrent[key] = target;
      return target;
    }

    const previous = this.expressionCurrent[key] ?? target;
    const next = lerp(previous, target, profile.expressionLerp);
    this.expressionCurrent[key] = next;
    return next;
  }

  private avatarExpressionValue(key: string, value: number): number {
    const profile = this.expressionProfile();
    if (key === "blink") {
      const shaped = Math.pow(THREE.MathUtils.clamp(value, 0, 1), profile.blinkCurve);
      return Math.min(shaped, profile.blinkMax);
    }
    if (key === "blinkLeft" || key === "blinkRight") return 0;

    const scaled = value * (profile.expressionScale[key] ?? 1);
    const capped = profile.expressionMax[key] === undefined ? scaled : Math.min(scaled, profile.expressionMax[key]);
    return THREE.MathUtils.clamp(capped, 0, 1);
  }

  private expressionProfile(): AvatarExpressionProfile {
    return this.currentVrmUrl.includes("synra-code1") ? CODE1_EXPRESSION_PROFILE : CLASSIC_EXPRESSION_PROFILE;
  }

  private setStatus(label: string): void {
    if (this.status) this.status.textContent = label;
  }

  private writeDebugAttributes(): void {
    if (!this.status) return;
    this.status.dataset.clip = this.authoredMotion.activeClipId || "";
    this.status.dataset.progress = this.authoredMotion.activeProgress.toFixed(3);
    this.status.dataset.bodyPlaybackMode = this.bodyPlaybackMode;
    this.status.dataset.runtimeMotionMode = this.runtimeMotionMode;
    this.status.dataset.bodyDriver = this.lastFrame?.activeAction
      ? "procedural-action"
      : this.authoredMotion.isPlaying
        ? "authored-vrma"
        : "procedural-runtime";
  }

  private isAuthoredBodyActive(frame: PoseFrame): boolean {
    if (!this.preferAuthoredMotion || this.bodyPlaybackMode !== "playground") return false;
    if (!this.authoredMotion.isPlaying) return false;
    return !frame.activeAction;
  }

  private isReferenceAuthoredBodyActive(frame: PoseFrame): boolean {
    void frame;
    if (this.runtimeMotionMode !== "vroidParity") return false;
    if (!this.authoredMotion.isReferencePlaying && !this.authoredMotion.isLocalInstalledFullBodyPlaying) return false;
    return true;
  }

  private applyAuthoredMotionCorrections(now: number): void {
    const clipId = this.authoredMotion.activeClipId;
    if (clipId?.startsWith("Greet_Wave") || clipId === "Greet_QuickHi" || clipId === "Greet_PoliteWave") {
      this.applyWaveHandCorrection(this.authoredMotion.activeProgress, now, 1, clipId === "Greet_WaveShy");
    }
  }

  private applyProceduralCorrections(frame: PoseFrame, now: number): void {
    if (!frame.activeAction) return;
    const intent = resolveSynraActionIntent(frame.activeAction.name);
    if (intent.family === "wave") {
      this.applyWaveHandCorrection(
        frame.activeAction.progress,
        now,
        frame.activeAction.weight,
        intent.direction === "small" || intent.id.includes("shy")
      );
    }
  }

  private applyWaveHandCorrection(progress: number, now: number, extraWeight = 1, shy = false): void {
    const setup = smoothstep(0.04, 0.22, progress);
    const release = 1 - smoothstep(0.78, 0.98, progress);
    const weight = clamp01(setup * release * extraWeight);
    if (weight <= 0.001) return;

    const sweep = Math.sin(progress * Math.PI * (shy ? 4.8 : 6.2)) * (shy ? 0.045 : 0.082);
    const wristFlutter = Math.sin(now * 8.4) * 0.052 + Math.sin(now * 12.2) * 0.018;
    const lift = Math.abs(sweep) * (shy ? 0.025 : 0.045);

    this.poseBone("rightShoulder", { x: 0.025, y: -0.025, z: -0.052 }, weight * 0.48);
    this.poseBone("rightUpperArm", { x: -0.2, y: -0.09, z: 0.64 }, weight * 0.62);
    this.poseBone("rightLowerArm", { x: -0.42, y: 0.52, z: -1.08 }, weight * 0.72);
    this.poseBone("upperChest", { x: -0.025, y: -0.035, z: -0.01 }, weight * 0.28);
    this.poseBone("head", { x: -0.02, y: -0.035, z: 0.01 }, weight * 0.22);

    // Use IK only as a light wrist placement guide. A stronger solve straightens the arm
    // and makes the hand look dragged instead of naturally waving from a bent elbow.
    this.applyRightArmIk(
      {
        x: shy ? -0.22 + sweep : -0.31 + sweep,
        y: shy ? 1.31 + lift : 1.43 + lift,
        z: 0.16
      },
      weight * 0.38
    );

    this.poseBone("rightHand", { x: -0.04, y: 0.72 - sweep * 1.55 + wristFlutter, z: 0.36 + wristFlutter * 0.58 }, weight);
    this.poseBone("rightThumbMetacarpal", { x: 0.06, y: -0.12, z: -0.1 }, weight);
    this.poseBone("rightThumbProximal", { x: 0.032, y: -0.046, z: -0.052 }, weight);
    this.poseBone("rightThumbDistal", { x: 0.02, y: -0.02, z: -0.02 }, weight);

    const fingerBones: Array<[BoneName, { x: number; y?: number; z: number }]> = [
      ["rightIndexProximal", { x: -0.02, y: 0.016, z: 0.014 }],
      ["rightIndexIntermediate", { x: -0.008, z: 0.006 }],
      ["rightIndexDistal", { x: -0.004, z: 0.003 }],
      ["rightMiddleProximal", { x: -0.018, y: 0.006, z: 0.014 }],
      ["rightMiddleIntermediate", { x: -0.008, z: 0.006 }],
      ["rightMiddleDistal", { x: -0.004, z: 0.003 }],
      ["rightRingProximal", { x: -0.018, y: -0.008, z: 0.014 }],
      ["rightRingIntermediate", { x: -0.008, z: 0.007 }],
      ["rightRingDistal", { x: -0.004, z: 0.003 }],
      ["rightLittleProximal", { x: -0.016, y: -0.018, z: 0.016 }],
      ["rightLittleIntermediate", { x: -0.007, z: 0.008 }],
      ["rightLittleDistal", { x: -0.003, z: 0.003 }]
    ];
    for (const [bone, rotation] of fingerBones) {
      this.poseBone(bone, rotation, weight);
    }
  }

  private poseBone(boneName: BoneName, target: { x?: number; y?: number; z?: number }, weight: number): void {
    const bone = this.bones[boneName];
    if (!bone) return;
    const blend = clamp01(weight);
    if (target.x !== undefined) bone.rotation.x = lerp(bone.rotation.x, target.x, blend);
    if (target.y !== undefined) bone.rotation.y = lerp(bone.rotation.y, target.y, blend);
    if (target.z !== undefined) bone.rotation.z = lerp(bone.rotation.z, target.z, blend);
  }

  private applyRightArmIk(target: { x: number; y: number; z: number }, weight: number): void {
    if (!this.vrm) return;
    const wrist = this.bones.rightHand;
    const lower = this.bones.rightLowerArm;
    const upper = this.bones.rightUpperArm;
    if (!wrist || !lower || !upper) return;

    this.tempTargetPosition.set(target.x, target.y, target.z);
    this.vrm.scene.localToWorld(this.tempTargetPosition);

    const joints = [lower, upper];
    const solveWeight = clamp01(weight) * 0.92;
    for (let iteration = 0; iteration < 6; iteration += 1) {
      for (const joint of joints) {
        this.vrm.scene.updateMatrixWorld(true);
        joint.getWorldPosition(this.tempJointPosition);
        wrist.getWorldPosition(this.tempEndPosition);

        this.tempEndDirection.subVectors(this.tempEndPosition, this.tempJointPosition);
        this.tempTargetDirection.subVectors(this.tempTargetPosition, this.tempJointPosition);
        if (this.tempEndDirection.lengthSq() < 0.00001 || this.tempTargetDirection.lengthSq() < 0.00001) continue;

        this.tempEndDirection.normalize();
        this.tempTargetDirection.normalize();
        this.tempWorldRotation.setFromUnitVectors(this.tempEndDirection, this.tempTargetDirection);
        this.tempWorldRotation.slerp(new THREE.Quaternion(), 1 - solveWeight);

        joint.parent?.getWorldQuaternion(this.tempParentRotation);
        this.tempLocalRotation
          .copy(this.tempParentRotation)
          .invert()
          .multiply(this.tempWorldRotation)
          .multiply(this.tempParentRotation);
        joint.quaternion.premultiply(this.tempLocalRotation);
      }
    }
  }
}

function readMotionPreference(): "authored" | "procedural" {
  try {
    const queryValue = new URLSearchParams(window.location.search).get("motion");
    const storedValue = window.localStorage?.getItem("synraMotionMode");
    const value = (queryValue || storedValue || "authored").toLowerCase();
    return value === "procedural" ? "procedural" : "authored";
  } catch {
    return "authored";
  }
}

function readBodyPlaybackMode(): SynraBodyPlaybackMode {
  try {
    const queryValue = new URLSearchParams(window.location.search).get("bodyPlayback");
    const storedValue = window.localStorage?.getItem("synraBodyPlaybackMode");
    const value = (queryValue || storedValue || "hybrid").toLowerCase();
    return value === "playground" ? "playground" : "hybrid";
  } catch {
    return "hybrid";
  }
}

function readRuntimeMotionMode(): SynraRuntimeMotionMode {
  try {
    const queryValue = new URLSearchParams(window.location.search).get("runtimeMotion");
    const storedValue = window.localStorage?.getItem("synraMotionRuntimeMode");
    const value = (queryValue || storedValue || "hybrid").toLowerCase();
    if (value === "vroidparity" || value === "authoredreference" || value === "reference") return "vroidParity";
    if (value === "procedural") return "procedural";
    return "hybrid";
  } catch {
    return "hybrid";
  }
}

function readBooleanPreference(key: string): boolean | null {
  try {
    const queryValue = new URLSearchParams(window.location.search).get(key);
    const storedValue = window.localStorage?.getItem(key);
    const value = (queryValue || storedValue || "").toLowerCase();
    if (["1", "true", "yes", "on"].includes(value)) return true;
    if (["0", "false", "no", "off"].includes(value)) return false;
    return null;
  } catch {
    return null;
  }
}

function normalizeSpeakingLifeCalibrationMode(value: unknown): SynraSpeakingLifeCalibrationMode {
  const normalized = String(value || "auto").trim().toLowerCase();
  if (normalized === "expressive" || normalized === "balanced" || normalized === "reduced") return normalized;
  return "auto";
}

function readSpeakingLifeCalibrationPreference(): SynraSpeakingLifeCalibrationMode {
  try {
    const queryValue = new URLSearchParams(window.location.search).get("speakingCalibration");
    const storedValue = window.localStorage?.getItem(SYNRA_SPEAKING_LIFE_CALIBRATION_STORAGE_KEY);
    return normalizeSpeakingLifeCalibrationMode(queryValue || storedValue || "auto");
  } catch {
    return "auto";
  }
}

function writeSpeakingLifeCalibrationPreference(mode: SynraSpeakingLifeCalibrationMode): void {
  try {
    window.localStorage?.setItem(SYNRA_SPEAKING_LIFE_CALIBRATION_STORAGE_KEY, normalizeSpeakingLifeCalibrationMode(mode));
  } catch {
    // Ignore storage errors in private/locked-down WebViews.
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}
