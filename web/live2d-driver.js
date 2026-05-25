(() => {
  const LIVE2D_STATUS_URL = "/api/live2d";
  const DEFAULT_MODEL_PATH = "/assets/live2d/synra/synra.model3.json";
  const ASSET_VERSION = "20260525-synra-cubism-smooth-2";

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

  const IDLE_MOTIONS = ["idle_shift", "soft_nod", "hair_tuck", "stretch"];
  const CLIP_GESTURES = new Set(["wave", "success", "delighted"]);

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

  function withAssetVersion(path) {
    if (!path || path.includes("v=")) return path;
    return `${path}${path.includes("?") ? "&" : "?"}v=${ASSET_VERSION}-${Date.now().toString(36)}`;
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
    if (cue.includes("concerned") || cue.includes("warning") || cue.includes("error")) return "concerned";
    if (cue.includes("determined") || cue.includes("workflow")) return "determined";
    if (cue.includes("thinking") || cue.includes("focused")) return "focused";
    if (cue.includes("curious") || cue.includes("approval")) return "curious";
    if (cue.includes("playful")) return "playful";
    if (cue.includes("delighted") || cue.includes("joy")) return "delighted";
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
    if (cue.includes("success") || cue.includes("bright")) return "success";
    if (cue.includes("warning") || cue.includes("error") || cue.includes("concerned")) return "concerned";
    if (cue.includes("approval") || cue.includes("curious")) return "curious";
    if (cue.includes("thinking") || cue.includes("workflow") || cue.includes("focused")) return "think";
    if (cue.includes("listening") || cue.includes("attentive")) return "listen";
    if (cue.includes("speaking") || cue.includes("talk")) return "talk";
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
        this.app.ticker.add(() => this.tick());
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
      this.targetMouth = this.speaking ? 1 : 0;
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
        this.targetMouth = Math.max(this.targetMouth * 0.86, motion.mouth || 0.22);
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
      if (name === "wave") return 3400;
      if (name === "explain") return 2800;
      if (name === "stretch") return 3000;
      if (name === "hair_tuck") return 2200;
      if (name === "soft_nod") return 1400;
      if (name === "idle_shift") return 2400;
      if (name === "talk") return 1600;
      return 1800;
    }

    startGesture(name) {
      if (!name) return;
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
      const pose = {
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
        bustY: 0,
        dressSway: 0,
        clip: false
      };

      if (gesture.name.endsWith("_clip")) {
        pose.clip = true;
        pose.bodyZ = -0.7 * hold;
        pose.angleZ = 1.1 * hold;
        pose.bustY = 0.06 * hold;
        pose.dressSway = slowPulse * 0.14 * hold;
        return pose;
      }

      if (["explain", "stretch", "hair_tuck", "playful", "talk"].includes(gesture.name)) {
        pose.partArmA = 1 - hold;
        pose.partArmB = hold;
      }

      if (gesture.name === "wave" || gesture.name === "success" || gesture.name === "delighted") {
        pose.shoulder = 0.35 * hold;
        pose.armRB = (-5.8 + pulse * 0.7) * hold;
        pose.handRB = (-8.2 + pulse * 0.8) * hold;
        pose.handR = (0.35 + Math.abs(pulse) * 0.35) * hold;
        pose.armLB = -0.8 * hold;
        pose.handLB = -2.4 * hold;
        pose.handL = 0.1 * hold;
        pose.bodyZ = -1.1 * hold;
        pose.angleZ = 1.8 * hold;
        pose.bustY = 0.08 * hold;
        pose.dressSway = slowPulse * 0.18 * hold;
      } else if (gesture.name === "explain" || gesture.name === "approval") {
        pose.shoulder = 0.18 * hold;
        pose.armLB = 3.2 * hold;
        pose.armRB = 2.8 * hold;
        pose.handLB = -2.6 * hold;
        pose.handRB = 2.4 * hold;
        pose.handL = 0.7 * hold;
        pose.handR = 0.7 * hold;
        pose.bodyZ = slowPulse * 1.1 * hold;
        pose.angleZ = slowPulse * 1.5 * hold;
        pose.dressSway = slowPulse * 0.22 * hold;
      } else if (gesture.name === "stretch") {
        pose.shoulder = 0.9 * hold;
        pose.armLB = (7.6 + slowPulse * 1.1) * hold;
        pose.armRB = (7.2 - slowPulse * 1.1) * hold;
        pose.handLB = 8.2 * hold;
        pose.handRB = 8.2 * hold;
        pose.leg = 1 - 0.18 * hold;
        pose.bodyZ = slowPulse * 1.6 * hold;
        pose.angleZ = slowPulse * 2.2 * hold;
        pose.bustY = 0.18 * hold;
      } else if (gesture.name === "hair_tuck") {
        pose.shoulder = 0.25 * hold;
        pose.armRB = 5.1 * hold;
        pose.handRB = -4.5 * hold;
        pose.handR = 0.45 * hold;
        pose.bodyZ = -1.4 * hold;
      } else if (gesture.name === "talk") {
        pose.shoulder = 0.08 * hold;
        pose.armLB = 1.6 * hold;
        pose.armRB = 1.4 * hold;
        pose.handLB = -0.8 * hold;
        pose.handRB = 0.9 * hold;
        pose.bodyZ = slowPulse * 0.55 * hold;
      } else if (gesture.name === "soft_nod") {
        pose.shoulder = 0.12 * hold;
        pose.angleZ = slowPulse * 0.7 * hold;
        pose.bustY = 0.06 * hold;
      } else if (gesture.name === "idle_shift" || gesture.name === "curious") {
        pose.leg = 1 - 0.08 * hold;
        pose.bodyZ = slowPulse * 1.2 * hold;
        pose.angleZ = slowPulse * 1.6 * hold;
        pose.dressSway = slowPulse * 0.16 * hold;
      }

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
      this.setAnyParameter("angleX", pointerX * 18 + idleSway * 2.2 * personalityLift);
      this.setAnyParameter("angleY", pointerY * -10 + breath * 1.6 - emotion.sad * 2 + emotion.surprise * 1.5);
      this.setAnyParameter("angleZ", idleSway * 4.5 * personalityLift + gesture.angleZ + emotion.curious * 2.2 - emotion.sad * 1.5);
      this.setAnyParameter("bodyX", pointerX * 5 + idleSway * 2.5);
      this.setAnyParameter("bodyY", pointerY * -4 + breath * 1.2);
      this.setAnyParameter("bodyZ", idleSway * 2.5 * personalityLift + gesture.bodyZ);
      this.setAnyParameter("eyeX", pointerX * 0.5);
      this.setAnyParameter("eyeY", pointerY * -0.4 + emotion.curious * 0.08 - emotion.focus * 0.06);
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
    }
  }

  window.synraLive2D = new SynraLive2DController();
  window.addEventListener("DOMContentLoaded", () => window.synraLive2D.boot());
})();
