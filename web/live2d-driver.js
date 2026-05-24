(() => {
  const LIVE2D_STATUS_URL = "/api/live2d";
  const DEFAULT_MODEL_PATH = "/assets/live2d/synra/synra.model3.json";
  const MOTION_PRIORITY = {
    idle: 1,
    listen: 2,
    think: 2,
    talk: 2,
    success: 3,
    concerned: 3,
    approval: 3,
    wave: 3,
    explain: 3,
    stretch: 3
  };

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
    if (cue.includes("sad") || cue.includes("concerned") || cue.includes("warning") || cue.includes("error")) return "concerned";
    if (cue.includes("thinking") || cue.includes("focused") || cue.includes("workflow")) return "focused";
    if (cue.includes("curious") || cue.includes("approval")) return "curious";
    if (cue.includes("wink")) return "wink";
    if (cue.includes("happy") || cue.includes("bright") || cue.includes("joy") || cue.includes("success") || cue.includes("wave")) return "happy";
    if (cue.includes("listening") || cue.includes("attentive") || cue.includes("explain")) return "attentive";
    return "neutral";
  }

  function motionFor(state = {}) {
    const cue = `${state.mode || ""} ${state.expression || ""}`.toLowerCase();
    if (cue.includes("wave")) return "wave";
    if (cue.includes("explain")) return "explain";
    if (cue.includes("stretch")) return "stretch";
    if (cue.includes("success") || cue.includes("bright") || cue.includes("joy") || cue.includes("delighted")) return "success";
    if (cue.includes("warning") || cue.includes("error") || cue.includes("sad") || cue.includes("concerned")) return "concerned";
    if (cue.includes("approval") || cue.includes("curious")) return "approval";
    if (cue.includes("thinking") || cue.includes("workflow") || cue.includes("focused")) return "think";
    if (cue.includes("listening") || cue.includes("attentive")) return "listen";
    if (cue.includes("speaking") || cue.includes("talk")) return "talk";
    return "idle";
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
        resolveReadyCheck(false);
        setLive2DStatus("missing-runtime", "Live2D runtime not installed");
        return;
      }
      if (!hasModel) {
        resolveReadyCheck(false);
        setLive2DStatus("missing-model", "Live2D model not installed");
        return;
      }
      if (!hasLoader) {
        resolveReadyCheck(false);
        setLive2DStatus("missing-loader", "Live2D browser loader unavailable");
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
      this.app.stage.addChild(model);
      this.playExpression("neutral");
      this.playMotion("idle");
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
      const nextKey = `${this.mode}:${this.expression}:${state.updated_at || state.speech_id || state.message || ""}`;
      if (nextKey === this.lastStateKey) return;
      this.lastStateKey = nextKey;
      this.playExpression(expressionFor(state));
      this.playMotion(motionFor(state));
    }

    setSpeaking(active) {
      this.speaking = Boolean(active);
      this.targetMouth = this.speaking ? 1 : 0;
      if (this.speaking) this.playMotion("talk");
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

    playExpression(name) {
      if (!this.model || !name) return;
      try {
        this.model.expression(name);
      } catch {
        // Expression names are validated at install time; missing optional names should not break the monitor.
      }
    }

    playMotion(group) {
      if (!this.model || !group) return;
      const now = performance.now();
      if (group === this.motionGroup && now - this.lastMotionAt < 1200) return;
      this.motionGroup = group;
      this.lastMotionAt = now;
      try {
        this.model.motion(group, undefined, MOTION_PRIORITY[group] || 2);
      } catch {
        // The validator catches missing required motions; keep the UI alive if a draft rig is incomplete.
      }
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

    tick() {
      if (!this.model) return;
      const now = performance.now();
      const seconds = (now - this.startedAt) / 1000;
      const motionLevel = this.motionLevel || 1;
      const breath = Math.sin(seconds * 1.45) * motionLevel;
      const idleSway = Math.sin(seconds * 0.55) * motionLevel;
      const pointerX = clamp((this.motion.x || 0) / 18, -1, 1);
      const pointerY = clamp((this.motion.y || 0) / 14, -1, 1);
      const speakBeat = this.speaking ? Math.abs(Math.sin(seconds * 8.5)) : 0;
      this.mouth = lerp(this.mouth, clamp(Math.max(this.targetMouth, this.motion.mouth || 0) * (0.42 + speakBeat * 0.58), 0, 1), 0.26);

      const personalityLift = this.personality === "playful" ? 1.25 : this.personality === "focused" ? 0.72 : 1;
      this.setParameter("ParamMouthOpenY", this.mouth);
      this.setParameter("ParamBreath", 0.5 + breath * 0.18);
      this.setParameter("ParamAngleX", pointerX * 18 + idleSway * 2.2 * personalityLift);
      this.setParameter("ParamAngleY", pointerY * -10 + breath * 1.6);
      this.setParameter("ParamAngleZ", idleSway * 4.5 * personalityLift);
      this.setParameter("ParamBodyAngleX", pointerX * 5 + idleSway * 2.5);
      this.setParameter("ParamBodyAngleY", pointerY * -4 + breath * 1.2);
      this.setParameter("ParamBodyAngleZ", idleSway * 2.5);
      this.setParameter("ParamEyeBallX", pointerX * 0.5);
      this.setParameter("ParamEyeBallY", pointerY * -0.4);
    }
  }

  window.synraLive2D = new SynraLive2DController();
  window.addEventListener("DOMContentLoaded", () => window.synraLive2D.boot());
})();
