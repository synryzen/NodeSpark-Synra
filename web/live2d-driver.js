(() => {
  const LIVE2D_STATUS_URL = "/api/live2d";
  const DEFAULT_MODEL_PATH = "/assets/live2d/synra/synra.model3.json";
  const ASSET_VERSION = "20260525-synra-cubism-emotion-1";

  const MOTION_PRIORITY = {
    idle: 1,
    idle_shift: 1,
    listen: 2,
    think: 2,
    talk: 2,
    success: 3,
    concerned: 3,
    approval: 3,
    wave: 3,
    explain: 3,
    stretch: 3,
    delighted: 3,
    playful: 3,
    curious: 3,
    confused: 3,
    sad: 3,
    determined: 3,
    look_left: 2,
    look_right: 2,
    look_up: 2,
    look_down: 2,
    soft_nod: 2,
    hair_tuck: 2
  };

  const MOTION_FALLBACKS = {
    idle: ["idle", "idle_shift"],
    idle_shift: ["idle_shift", "idle"],
    listen: ["listen", "idle"],
    think: ["think", "idle"],
    talk: ["talk", "explain", "idle"],
    success: ["success", "delighted", "wave", "idle"],
    concerned: ["concerned", "sad", "confused", "idle"],
    approval: ["approval", "curious", "explain", "idle"],
    wave: ["wave", "success", "idle"],
    explain: ["explain", "talk", "approval", "idle"],
    stretch: ["stretch", "idle_shift", "idle"],
    delighted: ["delighted", "success", "wave", "idle"],
    playful: ["playful", "delighted", "success", "idle"],
    curious: ["curious", "approval", "think", "idle"],
    confused: ["confused", "concerned", "approval", "idle"],
    sad: ["sad", "concerned", "idle"],
    determined: ["determined", "think", "success", "idle"],
    look_left: ["look_left", "listen", "idle"],
    look_right: ["look_right", "listen", "idle"],
    look_up: ["look_up", "think", "idle"],
    look_down: ["look_down", "think", "idle"],
    soft_nod: ["soft_nod", "idle"],
    hair_tuck: ["hair_tuck", "idle_shift", "idle"]
  };

  const EXPRESSION_FALLBACKS = {
    neutral: ["neutral", "soft_smile", "happy"],
    soft_smile: ["soft_smile", "neutral", "happy"],
    happy: ["happy", "soft_smile", "neutral"],
    attentive: ["attentive", "curious", "neutral"],
    focused: ["focused", "determined", "neutral"],
    curious: ["curious", "attentive", "neutral"],
    concerned: ["concerned", "sad", "confused", "neutral"],
    wink: ["wink", "happy", "soft_smile", "neutral"],
    confused: ["confused", "curious", "concerned", "neutral"],
    sad: ["sad", "concerned", "neutral"],
    delighted: ["delighted", "happy", "wink", "soft_smile"],
    playful: ["playful", "wink", "happy", "soft_smile"],
    determined: ["determined", "focused", "happy", "neutral"],
    look_left: ["look_left", "attentive", "neutral"],
    look_right: ["look_right", "attentive", "neutral"],
    look_up: ["look_up", "curious", "neutral"],
    look_down: ["look_down", "focused", "neutral"]
  };

  const PARAMETER_ALIASES = {
    mouthOpen: ["ParamMouthOpenY", "ParamMouthOpen"],
    mouthForm: ["ParamMouthForm", "ParamMouthSmile"],
    breath: ["ParamBreath"],
    angleX: ["ParamAngleX"],
    angleY: ["ParamAngleY"],
    angleZ: ["ParamAngleZ"],
    bodyX: ["ParamBodyAngleX"],
    bodyY: ["ParamBodyAngleY"],
    bodyZ: ["ParamBodyAngleZ"],
    eyeX: ["ParamEyeBallX"],
    eyeY: ["ParamEyeBallY"],
    eyeLOpen: ["ParamEyeLOpen", "ParamEyeOpenL"],
    eyeROpen: ["ParamEyeROpen", "ParamEyeOpenR"],
    browLY: ["ParamBrowLY", "ParamBrowLForm"],
    browRY: ["ParamBrowRY", "ParamBrowRForm"],
    browLAngle: ["ParamBrowLAngle"],
    browRAngle: ["ParamBrowRAngle"],
    cheek: ["ParamCheek", "ParamBlush"],
    shoulder: ["ParamShoulder"],
    leg: ["ParamLeg"],
    bustY: ["ParamBustY"],
    hairSway: ["ParamHairSway", "ParamHairFront", "ParamHairSide", "ParamHairAhoge", "ParamHairBack"],
    dressSway: ["ParamDressSway", "ParamSkirtSway", "ParamClothSway", "ParamSkirt", "ParamSkirt2", "ParamRibbon"],
    armL: ["ParamArmL", "ParamArmLeft", "ParamArmLA"],
    armR: ["ParamArmR", "ParamArmRight", "ParamArmRA"],
    armLA: ["ParamArmLA"],
    armRA: ["ParamArmRA"],
    armLB: ["ParamArmLB"],
    armRB: ["ParamArmRB"],
    handL: ["ParamHandL", "ParamHandLeft"],
    handR: ["ParamHandR", "ParamHandRight"],
    handLB: ["ParamHandLB"],
    handRB: ["ParamHandRB"]
  };

  const IDLE_MOTIONS = ["idle_shift", "soft_nod", "hair_tuck", "curious"];
  const CLIP_GESTURES = new Set([
    "wave",
    "explain",
    "stretch",
    "delighted",
    "playful",
    "curious",
    "determined",
    "soft_nod",
    "hair_tuck",
    "idle_shift",
    "talk",
    "listen",
    "think",
    "concerned",
    "look_left",
    "look_right",
    "look_up",
    "look_down"
  ]);

  let resolveReadyCheck;
  window.synraLive2DReadyCheck = new Promise((resolve) => {
    resolveReadyCheck = resolve;
  });

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(current, target, amount) {
    return current + (target - current) * amount;
  }

  function smoothstep(edge0, edge1, value) {
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function actionEnvelope(progress, fadeIn = 0.18, fadeOut = 0.22) {
    return smoothstep(0, fadeIn, progress) * (1 - smoothstep(1 - fadeOut, 1, progress));
  }

  function easeInOut(value) {
    const t = clamp(value, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function mixPose(base, target, amount) {
    const output = { ...base };
    Object.keys(target).forEach((key) => {
      if (typeof target[key] === "number") output[key] = lerp(output[key] ?? 0, target[key], amount);
      else output[key] = target[key];
    });
    return output;
  }

  const BASE_POSE = {
    partArmA: 1,
    partArmB: 0,
    shoulder: 0,
    leg: 1,
    armLA: -10,
    armRA: -10,
    armLB: 0,
    armRB: 0,
    handL: 0,
    handR: 0,
    handLB: 0,
    handRB: 0,
    bodyZ: 0,
    angleZ: 0,
    angleX: 0,
    angleY: 0,
    eyeX: 0,
    eyeY: 0,
    bustY: 0,
    dressSway: 0,
    mouthBoost: 0,
    clip: false
  };

  const GESTURE_LIBRARY = {
    wave: {
      duration: 3600,
      armSet: "B",
      keyframes: [
        [0, {}],
        [0.18, { shoulder: 0.18, armLB: 2.4, armRB: -10, handLB: -1.2, handRB: 0, handL: -1, bodyZ: -0.6, angleZ: 0.7 }],
        [0.34, { shoulder: 0.28, armLB: 8.7, armRB: -10, handLB: -7.2, handRB: 0, handL: -1, bodyZ: -1.3, angleZ: 1.5, bustY: 0.08 }],
        [0.48, { shoulder: 0.26, armLB: 8.9, armRB: -10, handLB: -9.2, handRB: 0, handL: -1, bodyZ: -1.1, angleZ: 1.2 }],
        [0.62, { shoulder: 0.26, armLB: 8.8, armRB: -10, handLB: -5.8, handRB: 0, handL: -1, bodyZ: -1.4, angleZ: 1.8 }],
        [0.76, { shoulder: 0.25, armLB: 8.9, armRB: -10, handLB: -8.7, handRB: 0, handL: -1, bodyZ: -1.2, angleZ: 1.4 }],
        [1, {}]
      ]
    },
    explain: {
      duration: 3200,
      armSet: "B",
      keyframes: [
        [0, {}],
        [0.22, { shoulder: 0.12, armLB: 2.2, armRB: 1.1, handLB: -1.4, handRB: 1.6, handL: 0.45, handR: 0.35, bodyZ: -0.7, angleZ: 0.8 }],
        [0.48, { shoulder: 0.18, armLB: 3.8, armRB: 2.7, handLB: -2.9, handRB: 2.1, handL: 0.8, handR: 0.55, bodyZ: 0.8, angleZ: -0.8 }],
        [0.72, { shoulder: 0.16, armLB: 2.4, armRB: 3.5, handLB: -1.3, handRB: 2.8, handL: 0.55, handR: 0.75, bodyZ: -0.4, angleZ: 0.4 }],
        [1, {}]
      ]
    },
    stretch: {
      duration: 3600,
      armSet: "B",
      keyframes: [
        [0, {}],
        [0.18, { shoulder: 0.35, armLB: 3.3, armRB: 3.3, handLB: 3.4, handRB: 3.4, bodyZ: 0.6, angleY: -1.5 }],
        [0.45, { shoulder: 0.95, armLB: 9.3, armRB: 9.0, handLB: 8.8, handRB: 8.8, leg: 0.86, bodyZ: 1.7, angleZ: -1.8, angleY: -3.8, bustY: 0.18 }],
        [0.68, { shoulder: 0.8, armLB: 8.2, armRB: 8.6, handLB: 9.4, handRB: 8.9, leg: 0.88, bodyZ: 1.1, angleZ: 1.2, angleY: -2.4 }],
        [1, {}]
      ]
    },
    delighted: {
      duration: 2400,
      armSet: "B",
      keyframes: [
        [0, {}],
        [0.24, { shoulder: 0.48, armLB: 5.2, armRB: 5.0, handLB: 5.5, handRB: 5.8, handL: 0.9, handR: 0.9, bodyZ: -1.5, angleZ: 2.2, bustY: 0.16, mouthBoost: 0.22 }],
        [0.54, { shoulder: 0.34, armLB: 4.1, armRB: 4.4, handLB: 4.8, handRB: 4.5, handL: 0.86, handR: 0.86, bodyZ: 1.1, angleZ: -1.5, bustY: 0.12, mouthBoost: 0.16 }],
        [1, {}]
      ]
    },
    playful: {
      duration: 2600,
      armSet: "B",
      keyframes: [
        [0, {}],
        [0.28, { shoulder: 0.24, armLB: 3.8, armRB: 0.8, handLB: -4.5, handRB: 1.6, handL: 0.72, bodyZ: -1.9, angleZ: 2.6, eyeX: -0.14, mouthBoost: 0.12 }],
        [0.62, { shoulder: 0.16, armLB: 2.1, armRB: 2.3, handLB: -2.0, handRB: 2.4, handL: 0.6, handR: 0.4, bodyZ: 1.1, angleZ: -1.4, eyeX: 0.12 }],
        [1, {}]
      ]
    },
    curious: {
      duration: 2400,
      armSet: "A",
      keyframes: [
        [0, {}],
        [0.34, { shoulder: 0.08, leg: 0.92, bodyZ: -1.4, angleZ: 2.2, angleX: -3, eyeX: -0.18, eyeY: 0.08, dressSway: 0.16 }],
        [0.68, { shoulder: 0.06, leg: 0.94, bodyZ: 1.1, angleZ: -1.6, angleX: 2.6, eyeX: 0.16, eyeY: 0.05, dressSway: -0.12 }],
        [1, {}]
      ]
    },
    determined: {
      duration: 2600,
      armSet: "A",
      keyframes: [
        [0, {}],
        [0.28, { shoulder: -0.08, leg: 0.94, bodyZ: 0.9, angleY: -1.8, angleZ: -0.8, angleX: 1.2 }],
        [0.7, { shoulder: 0.02, leg: 0.9, bodyZ: 1.3, angleY: -2.2, angleZ: 0.8, angleX: -1.4 }],
        [1, {}]
      ]
    },
    soft_nod: {
      duration: 1500,
      armSet: "A",
      keyframes: [
        [0, {}],
        [0.32, { angleY: -4.2, bodyZ: 0.4, shoulder: 0.08 }],
        [0.58, { angleY: 2.2, bodyZ: -0.25, shoulder: 0.04 }],
        [0.78, { angleY: -2.1, bodyZ: 0.2 }],
        [1, {}]
      ]
    },
    hair_tuck: {
      duration: 2500,
      armSet: "B",
      keyframes: [
        [0, {}],
        [0.24, { shoulder: 0.2, armLB: -1.6, handLB: 1.2, bodyZ: -1.1, angleZ: 1.3 }],
        [0.48, { shoulder: 0.28, armLB: -4.8, handLB: 3.6, handL: 0.42, bodyZ: -1.6, angleZ: 2.2, eyeX: -0.12 }],
        [0.72, { shoulder: 0.18, armLB: -3.1, handLB: 1.8, handL: 0.3, bodyZ: -0.8, angleZ: 1.0 }],
        [1, {}]
      ]
    },
    idle_shift: {
      duration: 2800,
      armSet: "A",
      keyframes: [
        [0, {}],
        [0.28, { leg: 0.9, shoulder: 0.06, bodyZ: -1.2, angleZ: 1.4, dressSway: 0.18 }],
        [0.62, { leg: 0.96, shoulder: -0.04, bodyZ: 1.0, angleZ: -1.3, dressSway: -0.14 }],
        [1, {}]
      ]
    },
    talk: {
      duration: 1700,
      armSet: "B",
      keyframes: [
        [0, {}],
        [0.36, { shoulder: 0.08, armLB: 1.2, armRB: 1.0, handLB: -0.8, handRB: 0.8, handL: 0.25, handR: 0.25, bodyZ: -0.4 }],
        [0.72, { shoulder: 0.1, armLB: 1.9, armRB: 1.5, handLB: -1.1, handRB: 1.1, handL: 0.35, handR: 0.35, bodyZ: 0.4 }],
        [1, {}]
      ]
    },
    listen: {
      duration: 1900,
      armSet: "A",
      keyframes: [
        [0, {}],
        [0.4, { shoulder: 0.1, angleY: -1.8, bodyZ: -0.7, eyeY: 0.08 }],
        [0.76, { shoulder: 0.08, angleY: 0.8, bodyZ: 0.5, eyeY: 0.04 }],
        [1, {}]
      ]
    },
    think: {
      duration: 2400,
      armSet: "B",
      keyframes: [
        [0, {}],
        [0.34, { shoulder: 0.18, armLB: -2.8, handLB: -2.2, handL: 0.32, bodyZ: -1.1, angleZ: 1.4, eyeX: -0.08 }],
        [0.7, { shoulder: 0.16, armLB: -2.1, handLB: -1.6, handL: 0.26, bodyZ: 0.8, angleZ: -0.8, eyeX: 0.08 }],
        [1, {}]
      ]
    },
    concerned: {
      duration: 2300,
      armSet: "A",
      keyframes: [
        [0, {}],
        [0.42, { shoulder: -0.18, angleY: -3.4, bodyZ: -1.0, angleZ: -1.0, eyeY: -0.08 }],
        [0.72, { shoulder: -0.1, angleY: -1.4, bodyZ: 0.3, angleZ: 0.6 }],
        [1, {}]
      ]
    },
    look_left: { duration: 1500, armSet: "A", keyframes: [[0, {}], [0.5, { angleX: -7.5, eyeX: -0.45, bodyZ: -0.4 }], [1, {}]] },
    look_right: { duration: 1500, armSet: "A", keyframes: [[0, {}], [0.5, { angleX: 7.5, eyeX: 0.45, bodyZ: 0.4 }], [1, {}]] },
    look_up: { duration: 1500, armSet: "A", keyframes: [[0, {}], [0.5, { angleY: 7.0, eyeY: 0.42, bodyZ: -0.2 }], [1, {}]] },
    look_down: { duration: 1500, armSet: "A", keyframes: [[0, {}], [0.5, { angleY: -8.0, eyeY: -0.42, bodyZ: 0.2 }], [1, {}]] }
  };

  function withAssetVersion(path) {
    if (!path || path.includes("v=")) return path;
    return `${path}${path.includes("?") ? "&" : "?"}v=${ASSET_VERSION}-${Date.now().toString(36)}`;
  }

  function normalizeGestureName(name = "idle") {
    if (name === "success") return "delighted";
    if (name === "approval") return "explain";
    if (name === "confused" || name === "sad") return "concerned";
    if (name === "idle") return "idle_shift";
    return name;
  }

  function setLive2DStatus(status, label) {
    document.documentElement.dataset.live2d = status;
    window.dispatchEvent(new CustomEvent("synra:live2d-status", { detail: { status, label } }));
  }

  async function fetchLive2DStatus() {
    try {
      const response = await fetch(LIVE2D_STATUS_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`Live2D status failed: ${response.status}`);
      const data = await response.json();
      return data.live2d || {};
    } catch (error) {
      console.warn(error);
      return { modelReady: false, runtimeReady: false, modelPath: DEFAULT_MODEL_PATH, missing: ["api/live2d"] };
    }
  }

  function expressionFor(state = {}) {
    const cue = `${state.mode || ""} ${state.expression || ""}`.toLowerCase();
    if (cue.includes("look_left")) return "look_left";
    if (cue.includes("look_right")) return "look_right";
    if (cue.includes("look_up")) return "look_up";
    if (cue.includes("look_down")) return "look_down";
    if (cue.includes("soft_nod") || cue.includes("hair_tuck") || cue.includes("idle_shift")) return "soft_smile";
    if (cue.includes("sad")) return "sad";
    if (cue.includes("confused") || cue.includes("unclear")) return "confused";
    if (cue.includes("curious") || cue.includes("approval")) return "curious";
    if (cue.includes("playful")) return "playful";
    if (cue.includes("delighted") || cue.includes("joy")) return "delighted";
    if (cue.includes("concerned") || cue.includes("warning") || cue.includes("error")) return "concerned";
    if (cue.includes("determined") || cue.includes("workflow")) return "determined";
    if (cue.includes("thinking") || cue.includes("focused")) return "focused";
    if (cue.includes("wink")) return "wink";
    if (cue.includes("happy") || cue.includes("bright") || cue.includes("success") || cue.includes("wave")) return "happy";
    if (cue.includes("listening") || cue.includes("attentive") || cue.includes("explain")) return "attentive";
    return "soft_smile";
  }

  function motionFor(state = {}) {
    const cue = `${state.mode || ""} ${state.expression || ""}`.toLowerCase();
    if (cue.includes("look_left")) return "look_left";
    if (cue.includes("look_right")) return "look_right";
    if (cue.includes("look_up")) return "look_up";
    if (cue.includes("look_down")) return "look_down";
    if (cue.includes("soft_nod")) return "soft_nod";
    if (cue.includes("hair_tuck")) return "hair_tuck";
    if (cue.includes("idle_shift")) return "idle_shift";
    if (cue.includes("wave")) return "wave";
    if (cue.includes("explain")) return "explain";
    if (cue.includes("stretch")) return "stretch";
    if (cue.includes("playful")) return "playful";
    if (cue.includes("delighted") || cue.includes("joy")) return "delighted";
    if (cue.includes("confused") || cue.includes("unclear")) return "confused";
    if (cue.includes("sad")) return "sad";
    if (cue.includes("determined")) return "determined";
    if (cue.includes("speaking") || cue.includes("talk")) return "talk";
    if (cue.includes("success") || cue.includes("bright")) return "success";
    if (cue.includes("approval") || cue.includes("curious")) return "curious";
    if (cue.includes("warning") || cue.includes("error") || cue.includes("concerned")) return "concerned";
    if (cue.includes("thinking") || cue.includes("workflow") || cue.includes("focused")) return "think";
    if (cue.includes("listening") || cue.includes("attentive")) return "listen";
    return "idle";
  }

  function emotionProfileFor(state = {}) {
    const expression = expressionFor(state);
    const motion = motionFor(state);
    const profile = {
      happy: 0.18,
      sad: 0,
      focus: 0,
      curious: 0,
      surprise: 0,
      blush: 0.06,
      energy: 0.42,
      mouthForm: 0.24,
      eyeOpen: 1,
      brow: 0
    };

    if (["happy", "wink", "delighted", "playful", "success", "wave"].includes(expression) || ["success", "wave", "delighted", "playful"].includes(motion)) {
      profile.happy = expression === "delighted" || expression === "playful" ? 0.88 : 0.62;
      profile.blush = expression === "playful" ? 0.36 : 0.18;
      profile.energy = expression === "playful" ? 0.9 : 0.72;
      profile.mouthForm = 0.72;
    }
    if (["focused", "determined"].includes(expression) || ["think", "determined"].includes(motion)) {
      profile.focus = expression === "determined" ? 0.78 : 0.58;
      profile.energy = expression === "determined" ? 0.74 : 0.48;
      profile.mouthForm = 0.18;
      profile.brow = -0.18;
    }
    if (["curious", "attentive", "look_left", "look_right", "look_up"].includes(expression)) {
      profile.curious = 0.58;
      profile.surprise = 0.16;
      profile.energy = 0.56;
      profile.mouthForm = 0.32;
      profile.brow = 0.12;
    }
    if (["concerned", "sad", "confused"].includes(expression)) {
      profile.happy = 0.02;
      profile.sad = expression === "sad" ? 0.72 : 0.44;
      profile.surprise = expression === "confused" ? 0.3 : 0.08;
      profile.energy = 0.28;
      profile.mouthForm = -0.38;
      profile.brow = -0.32;
    }
    return profile;
  }

  class SynraLive2DController {
    constructor() {
      this.layer = document.getElementById("live2dLayer");
      this.canvas = document.getElementById("synraLive2DCanvas");
      this.app = null;
      this.model = null;
      this.modelJson = null;
      this.status = null;
      this.modelPath = DEFAULT_MODEL_PATH;
      this.mode = "idle";
      this.expression = "soft_smile";
      this.motionGroup = "idle";
      this.speaking = false;
      this.mouth = 0;
      this.targetMouth = 0;
      this.motion = { x: 0, y: 0, rotate: 0, scale: 1, mouth: 0 };
      this.motionLevel = 1;
      this.personality = "balanced";
      this.lastStateKey = "";
      this.startedAt = performance.now();
      this.lastMotionAt = 0;
      this.nextIdleMotionAt = performance.now() + 9000;
      this.nextBlinkAt = performance.now() + 1800;
      this.blinkUntil = 0;
      this.gesture = { name: "idle", startedAt: performance.now(), duration: 1200 };
      this.availableMotions = new Set();
      this.motionNameMap = new Map();
      this.availableExpressions = new Set();
      this.expressionNameMap = new Map();
      this.emotion = emotionProfileFor();
      this.emotionTarget = { ...this.emotion };
    }

    async boot() {
      if (!this.layer || !this.canvas) {
        resolveReadyCheck(false);
        return;
      }

      setLive2DStatus("checking", "Checking Synra Live2D");
      this.status = await fetchLive2DStatus();
      this.modelPath = withAssetVersion(this.status.modelPath || DEFAULT_MODEL_PATH);
      const hasRuntime = Boolean(this.status.runtimeReady);
      const hasModel = Boolean(this.status.modelReady);
      const hasLoader = Boolean(window.PIXI?.live2d?.Live2DModel);

      if (!hasRuntime) {
        setLive2DStatus("missing-runtime", "Live2D runtime not installed");
        resolveReadyCheck(false);
        return;
      }
      if (!hasModel) {
        setLive2DStatus("missing-model", "Live2D model not installed");
        resolveReadyCheck(false);
        return;
      }
      if (!hasLoader) {
        setLive2DStatus("missing-loader", "Live2D browser loader unavailable");
        resolveReadyCheck(false);
        return;
      }

      try {
        await this.createPixiApp();
        await this.loadModel(this.modelPath);
        this.resize();
        window.addEventListener("resize", () => this.resize(), { passive: true });
        this.app.ticker.add(() => this.tick(), undefined, PIXI.UPDATE_PRIORITY.LOW);
        resolveReadyCheck(true);
        setLive2DStatus("ready", "Synra Live2D online");
      } catch (error) {
        console.error(error);
        setLive2DStatus("error", "Live2D failed to load");
        resolveReadyCheck(false);
      }
    }

    async createPixiApp() {
      const resolution = Math.min(window.devicePixelRatio || 1, 1.75);
      this.app = new PIXI.Application({
        view: this.canvas,
        autoStart: true,
        transparent: true,
        backgroundAlpha: 0,
        antialias: true,
        resolution,
        resizeTo: this.layer
      });
    }

    async loadModel(path) {
      this.modelJson = await fetch(path, { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null);
      const model = await window.PIXI.live2d.Live2DModel.from(path, { autoInteract: false });
      model.interactive = false;
      if (model.anchor?.set) model.anchor.set(0.5, 0.5);
      this.model = model;
      this.readModelCapabilities();
      this.app.stage.addChild(model);
      this.playExpression("soft_smile");
      this.playMotion("idle");
    }

    readModelCapabilities() {
      const refs = this.modelReferences();
      const motionGroups = Object.keys(refs.Motions || refs.motions || {});
      this.availableMotions = new Set(motionGroups);
      this.motionNameMap = new Map(motionGroups.map((name) => [name.toLowerCase(), name]));
      const expressions = refs.Expressions || refs.expressions || [];
      const expressionNames = expressions.map((item) => item?.Name || item?.name).filter(Boolean);
      this.availableExpressions = new Set(expressionNames);
      this.expressionNameMap = new Map(expressionNames.map((name) => [name.toLowerCase(), name]));
    }

    modelReferences() {
      if (this.modelJson?.FileReferences || this.modelJson?.fileReferences) {
        return this.modelJson.FileReferences || this.modelJson.fileReferences;
      }
      const settings = this.model?.internalModel?.settings || {};
      const raw = settings.json || settings._json || settings._object || settings;
      return raw.FileReferences || raw.fileReferences || {
        Motions: settings.motions || {},
        Expressions: settings.expressions || []
      };
    }

    resize() {
      if (!this.layer || !this.model) return;
      const bounds = this.layer.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      const modelWidth = Math.max(1, this.model.width || width);
      const modelHeight = Math.max(1, this.model.height || height);
      const baseScale = Math.min(width / modelWidth * 0.66, height / modelHeight * 0.9);
      this.model.scale.set(baseScale);
      this.model.x = width * 0.5;
      this.model.y = height * 0.57;
    }

    setState(state = {}) {
      this.mode = state.mode || "idle";
      this.expression = state.expression || "soft_smile";
      this.emotionTarget = emotionProfileFor(state);
      const nextKey = `${this.mode}:${this.expression}:${state.updated_at || state.speech_id || state.message || ""}`;
      if (nextKey === this.lastStateKey) return;
      this.lastStateKey = nextKey;
      this.playExpression(expressionFor(state));
      this.startGesture(motionFor(state));
      this.nextIdleMotionAt = performance.now() + 9000 + Math.random() * 7000;
    }

    setSpeaking(active) {
      this.speaking = Boolean(active);
      this.targetMouth = this.speaking ? Math.max(this.targetMouth, 0.25) : 0;
      if (this.speaking) {
        this.startGesture(this.expression === "explain" ? "explain" : "talk");
      }
    }

    setPersonality(value = "balanced") {
      const allowed = new Set(["balanced", "warm", "playful", "focused"]);
      this.personality = allowed.has(value) ? value : "balanced";
    }

    setMotionLevel(value = "normal") {
      this.motionLevel = value === "calm" ? 0.64 : value === "expressive" ? 1.26 : 1;
    }

    update(motion = {}) {
      this.motion = { ...this.motion, ...motion };
      if (this.speaking) {
        this.targetMouth = Math.max(this.targetMouth * 0.82, motion.mouth || 0.22);
      } else {
        this.targetMouth *= 0.86;
      }
    }

    pickExpression(name) {
      const choices = EXPRESSION_FALLBACKS[name] || [name, "soft_smile", "neutral"];
      if (!this.availableExpressions.size) return choices[0];
      return choices
        .map((choice) => this.availableExpressions.has(choice) ? choice : this.expressionNameMap.get(choice.toLowerCase()))
        .find(Boolean) || "";
    }

    pickMotion(group) {
      const actionFallback = group === "idle" || group === "idle_shift" || group === "soft_nod" ? "Idle" : "TapBody";
      const choices = [...(MOTION_FALLBACKS[group] || [group, "idle"]), actionFallback, "Idle"];
      if (!this.availableMotions.size) return choices[0];
      return choices
        .map((choice) => this.availableMotions.has(choice) ? choice : this.motionNameMap.get(choice.toLowerCase()))
        .find(Boolean) || "";
    }

    playExpression(name) {
      if (!this.model || !name) return;
      const selected = this.pickExpression(name);
      if (!selected) return;
      try {
        this.model.expression(selected);
      } catch {
        // Expression names are validated at install time; missing optional names should not break the monitor.
      }
    }

    playMotion(group) {
      if (!this.model || !group) return false;
      const selected = this.pickMotion(group);
      if (!selected) return false;
      const now = performance.now();
      if (selected === this.motionGroup && now - this.lastMotionAt < 1200) return true;
      this.motionGroup = selected;
      this.lastMotionAt = now;
      try {
        this.model.motion(selected, undefined, MOTION_PRIORITY[selected] || MOTION_PRIORITY[group] || 2);
        return true;
      } catch {
        // The validator catches missing required motions; keep the UI alive if a draft rig is incomplete.
        return false;
      }
    }

    maybePlayIdleMotion(now) {
      if (this.mode !== "idle" || this.speaking || now < this.nextIdleMotionAt) return;
      const choices = IDLE_MOTIONS;
      if (!choices.length) return;
      const selected = choices[Math.floor(Math.random() * choices.length)];
      this.startGesture(selected);
      const personalitySpeed = this.personality === "playful" ? 0.72 : this.personality === "focused" ? 1.35 : 1;
      this.nextIdleMotionAt = now + (9000 + Math.random() * 11000) * personalitySpeed / Math.max(this.motionLevel, 0.4);
    }

    gestureDuration(name) {
      if (GESTURE_LIBRARY[name]?.duration) return GESTURE_LIBRARY[name].duration;
      return 1800;
    }

    startGesture(name) {
      if (!name) return;
      name = normalizeGestureName(name);
      const now = performance.now();
      if (this.gesture.name === name && now - this.gesture.startedAt < 600) return;
      const useClip = CLIP_GESTURES.has(name) && this.playMotion(name);
      this.gesture = { name: useClip ? `${name}_clip` : name, startedAt: now, duration: this.gestureDuration(name) };
      if (!useClip) this.motionGroup = name;
      if (this.layer) {
        this.layer.dataset.gesture = this.gesture.name;
        this.layer.dataset.motionClip = useClip ? "native" : "parameter";
      }
      this.lastMotionAt = now;
    }

    setParameter(id, value) {
      const core = this.model?.internalModel?.coreModel;
      if (!core?.setParameterValueById) return;
      try {
        core.setParameterValueById(id, value);
      } catch {
        // Parameter availability depends on the delivered Cubism rig.
      }
    }

    setAnyParameter(alias, value) {
      (PARAMETER_ALIASES[alias] || [alias]).forEach((id) => this.setParameter(id, value));
    }

    setPartOpacity(id, value) {
      const core = this.model?.internalModel?.coreModel;
      if (!core?.setPartOpacityById) return;
      try {
        core.setPartOpacityById(id, clamp(value, 0, 1));
      } catch {
        // Draft and sample rigs do not always expose all part ids.
      }
    }

    gesturePose(now) {
      const gesture = this.gesture || { name: "idle", startedAt: now, duration: 1200 };
      const progress = clamp((now - gesture.startedAt) / Math.max(1, gesture.duration), 0, 1);
      const hold = gesture.name === "talk" && this.speaking ? 1 : actionEnvelope(progress);
      const pulse = Math.sin(progress * Math.PI * 6);
      const slowPulse = Math.sin(progress * Math.PI * 2);
      const pose = { ...BASE_POSE };

      if (gesture.name.endsWith("_clip")) {
        pose.clip = true;
        pose.bodyZ = -0.7 * hold;
        pose.angleZ = 1.1 * hold;
        pose.bustY = 0.06 * hold;
        pose.dressSway = slowPulse * 0.14 * hold;
        return pose;
      }

      const library = GESTURE_LIBRARY[gesture.name];
      if (library?.keyframes?.length) {
        const frames = library.keyframes;
        let left = frames[0];
        let right = frames[frames.length - 1];
        for (let index = 0; index < frames.length - 1; index += 1) {
          if (progress >= frames[index][0] && progress <= frames[index + 1][0]) {
            left = frames[index];
            right = frames[index + 1];
            break;
          }
        }
        const span = Math.max(0.001, right[0] - left[0]);
        const local = easeInOut((progress - left[0]) / span);
        const keyedPose = mixPose({ ...BASE_POSE, ...(left[1] || {}) }, right[1] || {}, local);
        Object.assign(pose, mixPose(BASE_POSE, keyedPose, gesture.name === "talk" && this.speaking ? 1 : hold));
        if (library.armSet === "B") {
          pose.partArmA = 1 - hold;
          pose.partArmB = hold;
        } else {
          pose.partArmA = 1;
          pose.partArmB = 0;
        }
      }

      pose.handLB += pulse * 0.24 * hold;
      pose.handRB -= pulse * 0.18 * hold;
      pose.bodyZ += slowPulse * 0.35 * hold;
      pose.angleZ += slowPulse * 0.35 * hold;
      pose.dressSway += slowPulse * 0.16 * hold;
      return pose;
    }

    updateEmotion() {
      Object.keys(this.emotionTarget).forEach((key) => {
        this.emotion[key] = lerp(this.emotion[key] || 0, this.emotionTarget[key] || 0, 0.1);
      });
    }

    updateBlink(now) {
      if (now > this.nextBlinkAt) {
        this.blinkUntil = now + 115;
        this.nextBlinkAt = now + 2200 + Math.random() * 3600;
      }
      if (now >= this.blinkUntil) return 0;
      const progress = clamp(1 - (this.blinkUntil - now) / 115, 0, 1);
      return Math.sin(progress * Math.PI);
    }

    tick() {
      if (!this.model) return;
      const now = performance.now();
      const seconds = (now - this.startedAt) / 1000;
      const motionLevel = this.motionLevel || 1;
      this.maybePlayIdleMotion(now);
      this.updateEmotion();

      const emotion = this.emotion;
      const breath = Math.sin(seconds * 1.45) * motionLevel;
      const idleSway = Math.sin(seconds * 0.55) * motionLevel;
      const hairSway = Math.sin(seconds * 0.82 + 0.7) * motionLevel;
      const pointerX = clamp((this.motion.x || 0) / 18, -1, 1);
      const pointerY = clamp((this.motion.y || 0) / 14, -1, 1);
      const speakBeat = this.speaking ? Math.abs(Math.sin(seconds * 8.5)) : 0;
      const blink = this.updateBlink(now);
      this.mouth = lerp(this.mouth, clamp(Math.max(this.targetMouth, this.motion.mouth || 0) * (0.42 + speakBeat * 0.58), 0, 1), 0.26);

      const personalityLift = this.personality === "playful" ? 1.25 : this.personality === "focused" ? 0.72 : 1;
      const smile = clamp(emotion.mouthForm + emotion.happy * 0.42 - emotion.sad * 0.5, -1, 1);
      const eyeOpen = clamp((emotion.eyeOpen || 1) - blink * 0.94 + emotion.surprise * 0.12 - emotion.sad * 0.1, 0, 1.2);
      const cheek = clamp(emotion.blush + emotion.happy * 0.14, 0, 1);
      const brow = clamp(emotion.brow + emotion.surprise * 0.22 - emotion.sad * 0.18, -1, 1);
      const energy = clamp(emotion.energy, 0.2, 1);
      const gesture = this.gesturePose(now);

      this.setAnyParameter("mouthOpen", this.mouth);
      this.setAnyParameter("mouthForm", smile);
      this.setAnyParameter("breath", 0.5 + breath * 0.18 * energy);
      this.setAnyParameter("angleX", pointerX * 18 + idleSway * 2.2 * personalityLift + gesture.angleX);
      this.setAnyParameter("angleY", pointerY * -10 + breath * 1.6 - emotion.sad * 2 + emotion.surprise * 1.5 + gesture.angleY);
      this.setAnyParameter("angleZ", idleSway * 4.5 * personalityLift + gesture.angleZ + emotion.curious * 2.2 - emotion.sad * 1.5);
      this.setAnyParameter("bodyX", pointerX * 5 + idleSway * 2.5);
      this.setAnyParameter("bodyY", pointerY * -4 + breath * 1.2);
      this.setAnyParameter("bodyZ", idleSway * 2.5 * personalityLift + gesture.bodyZ);
      this.setAnyParameter("eyeX", pointerX * 0.5 + gesture.eyeX);
      this.setAnyParameter("eyeY", pointerY * -0.4 + emotion.curious * 0.08 - emotion.focus * 0.06 + gesture.eyeY);
      this.setAnyParameter("eyeLOpen", eyeOpen);
      this.setAnyParameter("eyeROpen", eyeOpen);
      this.setAnyParameter("browLY", brow);
      this.setAnyParameter("browRY", brow);
      this.setAnyParameter("browLAngle", emotion.curious * 0.34 - emotion.focus * 0.18);
      this.setAnyParameter("browRAngle", -emotion.curious * 0.34 + emotion.focus * 0.18);
      this.setAnyParameter("cheek", cheek);
      this.setAnyParameter("hairSway", hairSway * 0.26 + pointerX * 0.18);
      this.setAnyParameter("dressSway", idleSway * 0.18 + breath * 0.12 + gesture.dressSway);
      this.setAnyParameter("shoulder", gesture.shoulder + emotion.happy * 0.08 - emotion.sad * 0.05);
      this.setAnyParameter("leg", gesture.leg);
      this.setAnyParameter("bustY", gesture.bustY + breath * 0.04);
      if (gesture.mouthBoost) this.setAnyParameter("mouthOpen", clamp(this.mouth + gesture.mouthBoost, 0, 1));
      if (!gesture.clip) {
        this.setAnyParameter("armLA", gesture.armLA + idleSway * 0.1 + emotion.happy * 0.08 - emotion.sad * 0.06);
        this.setAnyParameter("armRA", gesture.armRA - idleSway * 0.1 + emotion.happy * 0.08 - emotion.focus * 0.05);
        this.setAnyParameter("armLB", gesture.armLB);
        this.setAnyParameter("armRB", gesture.armRB);
        this.setAnyParameter("handL", gesture.handL + hairSway * 0.08 + emotion.happy * 0.06);
        this.setAnyParameter("handR", gesture.handR - hairSway * 0.08 + emotion.curious * 0.1);
        this.setAnyParameter("handLB", gesture.handLB);
        this.setAnyParameter("handRB", gesture.handRB);
        this.setPartOpacity("PartArmA", gesture.partArmA);
        this.setPartOpacity("PartArmB", gesture.partArmB);
      }
      this.model?.internalModel?.coreModel?.update?.();
    }
  }

  window.synraLive2D = new SynraLive2DController();
  window.addEventListener("DOMContentLoaded", () => window.synraLive2D.boot());
})();
