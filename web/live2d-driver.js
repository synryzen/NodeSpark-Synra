(() => {
  const LIVE2D_STATUS_URL = "/api/live2d";
  const DEFAULT_MODEL_PATH = "/assets/live2d/synra/synra.model3.json";

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
    hairSway: ["ParamHairSway", "ParamHairFront", "ParamHairSide"],
    dressSway: ["ParamDressSway", "ParamSkirtSway", "ParamClothSway"],
    armL: ["ParamArmL", "ParamArmLeft"],
    armR: ["ParamArmR", "ParamArmRight"],
    handL: ["ParamHandL", "ParamHandLeft"],
    handR: ["ParamHandR", "ParamHandRight"]
  };

  const IDLE_MOTIONS = ["idle_shift", "soft_nod", "hair_tuck", "stretch"];

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
      this.availableMotions = new Set();
      this.availableExpressions = new Set();
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
      this.modelPath = this.status.modelPath || DEFAULT_MODEL_PATH;
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
      this.availableMotions = new Set(Object.keys(refs.Motions || refs.motions || {}));
      const expressions = refs.Expressions || refs.expressions || [];
      this.availableExpressions = new Set(
        expressions
          .map((item) => item?.Name || item?.name)
          .filter(Boolean)
      );
    }

    modelReferences() {
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
      this.playMotion(motionFor(state));
      this.nextIdleMotionAt = performance.now() + 9000 + Math.random() * 7000;
    }

    setSpeaking(active) {
      this.speaking = Boolean(active);
      this.targetMouth = this.speaking ? 1 : 0;
      if (this.speaking) {
        this.playMotion(this.expression === "explain" ? "explain" : "talk");
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
      return choices.find((choice) => this.availableExpressions.has(choice)) || "";
    }

    pickMotion(group) {
      const choices = MOTION_FALLBACKS[group] || [group, "idle"];
      if (!this.availableMotions.size) return choices[0];
      return choices.find((choice) => this.availableMotions.has(choice)) || "";
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
      if (!this.model || !group) return;
      const selected = this.pickMotion(group);
      if (!selected) return;
      const now = performance.now();
      if (selected === this.motionGroup && now - this.lastMotionAt < 1200) return;
      this.motionGroup = selected;
      this.lastMotionAt = now;
      try {
        this.model.motion(selected, undefined, MOTION_PRIORITY[selected] || MOTION_PRIORITY[group] || 2);
      } catch {
        // The validator catches missing required motions; keep the UI alive if a draft rig is incomplete.
      }
    }

    maybePlayIdleMotion(now) {
      if (this.mode !== "idle" || this.speaking || now < this.nextIdleMotionAt) return;
      const choices = IDLE_MOTIONS.filter((motion) => this.pickMotion(motion));
      if (!choices.length) return;
      const selected = choices[Math.floor(Math.random() * choices.length)];
      this.playMotion(selected);
      const personalitySpeed = this.personality === "playful" ? 0.72 : this.personality === "focused" ? 1.35 : 1;
      this.nextIdleMotionAt = now + (9000 + Math.random() * 11000) * personalitySpeed / Math.max(this.motionLevel, 0.4);
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

      this.setAnyParameter("mouthOpen", this.mouth);
      this.setAnyParameter("mouthForm", smile);
      this.setAnyParameter("breath", 0.5 + breath * 0.18 * energy);
      this.setAnyParameter("angleX", pointerX * 18 + idleSway * 2.2 * personalityLift);
      this.setAnyParameter("angleY", pointerY * -10 + breath * 1.6 - emotion.sad * 2 + emotion.surprise * 1.5);
      this.setAnyParameter("angleZ", idleSway * 4.5 * personalityLift + emotion.curious * 2.2 - emotion.sad * 1.5);
      this.setAnyParameter("bodyX", pointerX * 5 + idleSway * 2.5);
      this.setAnyParameter("bodyY", pointerY * -4 + breath * 1.2);
      this.setAnyParameter("bodyZ", idleSway * 2.5 * personalityLift);
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
      this.setAnyParameter("dressSway", idleSway * 0.18 + breath * 0.12);
      this.setAnyParameter("armL", idleSway * 0.12 + emotion.happy * 0.08 - emotion.sad * 0.06);
      this.setAnyParameter("armR", -idleSway * 0.12 + emotion.happy * 0.08 - emotion.focus * 0.05);
      this.setAnyParameter("handL", hairSway * 0.08 + emotion.happy * 0.06);
      this.setAnyParameter("handR", -hairSway * 0.08 + emotion.curious * 0.1);
    }
  }

  window.synraLive2D = new SynraLive2DController();
  window.addEventListener("DOMContentLoaded", () => window.synraLive2D.boot());
})();
