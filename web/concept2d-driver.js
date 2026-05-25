(() => {
  const IDLE_ACTIONS = ["soft_nod", "idle_shift", "hair_tuck", "curious"];

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

  function envelope(progress, fadeIn = 0.16, fadeOut = 0.18) {
    return smoothstep(0, fadeIn, progress) * (1 - smoothstep(1 - fadeOut, 1, progress));
  }

  function cueFrom(state = {}) {
    return `${state.mode || ""} ${state.expression || ""}`.toLowerCase();
  }

  function motionFor(state = {}) {
    const cue = cueFrom(state);
    if (cue.includes("wave") || cue.includes("success")) return "wave";
    if (cue.includes("explain") || cue.includes("approval")) return "explain";
    if (cue.includes("stretch")) return "stretch";
    if (cue.includes("playful") || cue.includes("delighted") || cue.includes("joy")) return "play";
    if (cue.includes("curious") || cue.includes("confused")) return "curious";
    if (cue.includes("thinking") || cue.includes("workflow") || cue.includes("determined")) return "focus";
    if (cue.includes("listening") || cue.includes("attentive")) return "listen";
    if (cue.includes("speaking") || cue.includes("talk")) return "talk";
    if (cue.includes("sad") || cue.includes("concerned") || cue.includes("error")) return "concerned";
    if (cue.includes("look_left")) return "look_left";
    if (cue.includes("look_right")) return "look_right";
    if (cue.includes("look_up")) return "look_up";
    if (cue.includes("look_down")) return "look_down";
    if (cue.includes("soft_nod")) return "soft_nod";
    if (cue.includes("hair_tuck")) return "hair_tuck";
    if (cue.includes("idle_shift")) return "idle_shift";
    return "idle";
  }

  class SynraConcept2DController {
    constructor() {
      this.layer = document.getElementById("concept2dLayer");
      this.rig = document.getElementById("concept2dRig");
      this.stage = document.querySelector(".synra-stage");
      this.mode = "idle";
      this.expression = "soft_smile";
      this.motionName = "idle";
      this.personality = "balanced";
      this.motionLevel = 1;
      this.speaking = false;
      this.startedAt = performance.now();
      this.lastStateAt = performance.now();
      this.motionStartedAt = performance.now();
      this.motionDuration = 2600;
      this.nextIdleAt = performance.now() + 6500;
      this.nextBlinkAt = performance.now() + 900;
      this.blinkUntil = 0;
      this.pose = {
        x: 0,
        y: 0,
        rotate: 0,
        scale: 1,
        wave: 0,
        mouth: 0,
        blink: 0,
        heart: 0,
        shadow: 0.62
      };
      this.target = { ...this.pose };
      this.audioMotion = { x: 0, y: 0, rotate: 0, scale: 1, mouth: 0 };
      this.lastExternalStateKey = "";
    }

    boot() {
      if (!this.layer || !this.rig) return;
      this.layer.dataset.rig = "ready";
      this.readStageState();
      this.tick();
      window.dispatchEvent(new CustomEvent("synra:concept2d-status", { detail: { status: "ready" } }));
    }

    setPersonality(personality = "balanced") {
      this.personality = personality;
    }

    setMotionLevel(level = "normal") {
      this.motionLevel = level === "expressive" ? 1.35 : level === "calm" ? 0.7 : 1;
    }

    setState(state = {}) {
      const nextMode = state.mode || this.mode || "idle";
      const nextExpression = state.expression || this.expression || "soft_smile";
      const nextMotion = motionFor({ mode: nextMode, expression: nextExpression });
      const key = `${nextMode}:${nextExpression}:${nextMotion}`;
      this.mode = nextMode;
      this.expression = nextExpression;
      if (key !== this.lastExternalStateKey) {
        this.lastExternalStateKey = key;
        this.startMotion(nextMotion);
      }
    }

    setSpeaking(active) {
      this.speaking = Boolean(active);
      if (this.speaking) this.startMotion("talk", 1200);
    }

    update(motion = {}) {
      this.audioMotion = {
        x: Number(motion.x || 0),
        y: Number(motion.y || 0),
        rotate: Number(motion.rotate || 0),
        scale: Number(motion.scale || 1),
        mouth: Number(motion.mouth || 0)
      };
    }

    startMotion(name, duration) {
      this.motionName = name || "idle";
      this.motionStartedAt = performance.now();
      this.lastStateAt = this.motionStartedAt;
      this.motionDuration = duration || this.durationFor(this.motionName);
      this.layer.dataset.motion = this.motionName;
    }

    durationFor(name) {
      if (name === "wave") return 3600;
      if (name === "explain") return 3200;
      if (name === "stretch") return 3000;
      if (name === "play") return 2800;
      if (name === "curious") return 2400;
      if (name === "hair_tuck") return 2400;
      if (name === "soft_nod") return 1600;
      return 1800;
    }

    readStageState() {
      if (!this.stage) return;
      const state = {
        mode: this.stage.dataset.mode || "idle",
        expression: this.stage.dataset.expression || "soft_smile"
      };
      const key = `${state.mode}:${state.expression}`;
      if (key !== `${this.mode}:${this.expression}`) this.setState(state);
    }

    maybeIdleAction(now) {
      if (this.speaking || this.motionName !== "idle" || now < this.nextIdleAt) return;
      const action = IDLE_ACTIONS[Math.floor(Math.random() * IDLE_ACTIONS.length)];
      this.startMotion(action);
      this.nextIdleAt = now + 8500 + Math.random() * 8500;
    }

    maybeBlink(now) {
      if (now < this.nextBlinkAt) return;
      this.blinkUntil = now + 95 + Math.random() * 45;
      this.nextBlinkAt = now + 2100 + Math.random() * 2600;
    }

    motionPose(name, progress, now) {
      const e = envelope(progress);
      const wavePulse = Math.sin(progress * Math.PI * 8);
      const breath = Math.sin(now / 880) * 0.5 + Math.sin(now / 1730) * 0.5;
      const base = {
        x: this.audioMotion.x * 0.08,
        y: -2 + breath * 2.3,
        rotate: breath * 0.28,
        scale: this.audioMotion.scale || 1,
        wave: 0,
        heart: 0,
        shadow: 0.58 + Math.abs(breath) * 0.08
      };

      if (name === "wave") {
        base.x += e * (-4 + wavePulse * 1.8);
        base.y += e * (-8 + Math.sin(progress * Math.PI * 2) * 2);
        base.rotate += e * (-1.2 + wavePulse * 0.6);
        base.scale += e * 0.018;
        base.wave = e;
        base.heart = e * 0.88;
      } else if (name === "explain") {
        base.x += e * 8;
        base.y += e * -5;
        base.rotate += e * 1.6;
        base.scale += e * 0.012;
      } else if (name === "stretch") {
        base.y += e * -18;
        base.rotate += Math.sin(progress * Math.PI * 2) * e * 1.4;
        base.scale += e * 0.025;
      } else if (name === "play") {
        base.x += Math.sin(progress * Math.PI * 2.4) * e * 9;
        base.y += e * (-7 + Math.sin(progress * Math.PI * 5) * 3);
        base.rotate += Math.sin(progress * Math.PI * 2.2) * e * 2.2;
        base.heart = e;
      } else if (name === "curious") {
        base.x += e * 6;
        base.y += e * -4;
        base.rotate += e * 2.8;
        base.scale += e * 0.01;
      } else if (name === "focus") {
        base.y += e * -3;
        base.rotate += e * -1.1;
        base.scale += e * 0.008;
      } else if (name === "listen") {
        base.x += e * -4;
        base.y += e * -3;
        base.rotate += e * -1.8;
      } else if (name === "concerned") {
        base.y += e * 3;
        base.rotate += e * -1.3;
        base.scale -= e * 0.01;
      } else if (name === "look_left") {
        base.x += e * -10;
        base.rotate += e * -2;
      } else if (name === "look_right") {
        base.x += e * 10;
        base.rotate += e * 2;
      } else if (name === "look_up") {
        base.y += e * -11;
        base.scale += e * 0.01;
      } else if (name === "look_down") {
        base.y += e * 8;
        base.scale -= e * 0.008;
      } else if (name === "soft_nod") {
        base.y += Math.sin(progress * Math.PI * 2) * e * 7;
        base.rotate += Math.sin(progress * Math.PI * 2) * e * 0.8;
      } else if (name === "hair_tuck") {
        base.x += Math.sin(progress * Math.PI) * e * 5;
        base.rotate += Math.sin(progress * Math.PI) * e * -1.8;
        base.heart = e * 0.35;
      } else if (name === "idle_shift") {
        base.x += Math.sin(progress * Math.PI * 2) * e * 5;
        base.rotate += Math.sin(progress * Math.PI * 2) * e * 1.2;
      } else if (name === "talk") {
        base.y += Math.sin(now / 190) * 2.4;
        base.rotate += Math.sin(now / 420) * 0.75;
        base.scale += 0.012;
      }

      return base;
    }

    tick() {
      const now = performance.now();
      this.readStageState();
      this.maybeBlink(now);
      this.maybeIdleAction(now);

      const progress = clamp((now - this.motionStartedAt) / this.motionDuration, 0, 1);
      if (progress >= 1 && !this.speaking && !["idle", "talk"].includes(this.motionName)) {
        this.startMotion("idle");
      }

      const pose = this.motionPose(this.motionName, progress, now);
      const mouthBase = this.speaking || this.mode === "speaking" ? 0.24 + Math.abs(Math.sin(now / 78)) * 0.76 : 0;
      const mouth = clamp(Math.max(mouthBase, this.audioMotion.mouth), 0, 1);
      const blink = now < this.blinkUntil ? 1 : 0;
      const energy = this.personality === "playful" ? 1.14 : this.personality === "focused" ? 0.88 : 1;

      this.target = {
        ...pose,
        x: pose.x * this.motionLevel * energy,
        y: pose.y * this.motionLevel,
        rotate: pose.rotate * this.motionLevel,
        scale: clamp(pose.scale, 0.95, 1.08),
        mouth,
        blink,
        heart: pose.heart
      };

      const amount = 0.13;
      Object.keys(this.pose).forEach((key) => {
        this.pose[key] = lerp(this.pose[key], this.target[key], amount);
      });

      this.layer.style.setProperty("--concept-x", `${this.pose.x.toFixed(2)}px`);
      this.layer.style.setProperty("--concept-y", `${this.pose.y.toFixed(2)}px`);
      this.layer.style.setProperty("--concept-rotate", `${this.pose.rotate.toFixed(3)}deg`);
      this.layer.style.setProperty("--concept-scale", this.pose.scale.toFixed(4));
      this.layer.style.setProperty("--concept-wave", this.pose.wave.toFixed(3));
      this.layer.style.setProperty("--concept-mouth", this.pose.mouth.toFixed(3));
      this.layer.style.setProperty("--concept-blink", this.pose.blink.toFixed(3));
      this.layer.style.setProperty("--concept-heart", this.pose.heart.toFixed(3));
      this.layer.style.setProperty("--concept-shadow", this.pose.shadow.toFixed(3));

      requestAnimationFrame(() => this.tick());
    }
  }

  window.synraConcept2D = new SynraConcept2DController();
  window.addEventListener("DOMContentLoaded", () => window.synraConcept2D.boot());
})();
