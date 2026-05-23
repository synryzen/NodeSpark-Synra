import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

const DEFAULT_SYNRA_VRM_URL = "/assets/avatars/synra.vrm";
const EXPRESSION_NAMES = [
  "neutral",
  "happy",
  "joy",
  "fun",
  "sad",
  "sorrow",
  "angry",
  "relaxed",
  "surprised",
  "blink",
  "blinkLeft",
  "blinkRight",
  "blink_l",
  "blink_r",
  "aa",
  "ih",
  "ou",
  "ee",
  "oh",
  "a",
  "i",
  "u",
  "e",
  "o"
];

function setAvatar3DStatus(status, label) {
  document.documentElement.dataset.avatar3d = status;
  const statusElement = document.getElementById("avatar3dStatus");
  if (statusElement) statusElement.textContent = label;
  window.dispatchEvent(new CustomEvent("synra:avatar3d-status", { detail: { status, label } }));
}

async function urlExists(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

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

function actionEnvelope(progress, fadeIn = 0.16, fadeOut = 0.18) {
  return smoothstep(0, fadeIn, progress) * (1 - smoothstep(1 - fadeOut, 1, progress));
}

function synraVrmUrl() {
  const candidate = new URLSearchParams(window.location.search).get("vrm");
  if (!candidate) return DEFAULT_SYNRA_VRM_URL;
  try {
    const url = new URL(candidate, window.location.origin);
    if (
      url.origin === window.location.origin &&
      url.pathname.startsWith("/assets/avatars/") &&
      url.pathname.endsWith(".vrm")
    ) {
      return `${url.pathname}${url.search}`;
    }
  } catch {
    // Invalid preview URLs fall back to the installed Synra model.
  }
  return DEFAULT_SYNRA_VRM_URL;
}

function assetBaseFor(url) {
  const pathname = new URL(url, window.location.origin).pathname;
  return pathname.slice(0, pathname.lastIndexOf("/") + 1) || "/assets/avatars/";
}

class SynraAvatar3DController {
  constructor() {
    this.canvas = document.getElementById("synraAvatar3DCanvas");
    this.container = document.getElementById("avatar3dLayer");
    this.modelUrl = synraVrmUrl();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.clock = new THREE.Clock();
    this.vrm = null;
    this.mode = "idle";
    this.expression = "soft_smile";
    this.speaking = false;
    this.motion = { x: 0, y: 0, rotate: 0, scale: 1, mouth: 0 };
    this.targetMouth = 0;
    this.expressionTargets = {};
    this.expressionValues = {};
    this.pose = {
      headX: 0,
      headY: 0,
      headZ: 0,
      chestX: 0,
      chestY: 0,
      spineX: 0,
      spineY: 0,
      upperChestX: 0,
      upperChestY: 0,
      shoulderLift: 0,
      armOpen: 0,
      elbowBend: 0,
      wristTwist: 0,
      hipsX: 0,
      hipsY: 0,
      hipsZ: 0,
      rightArmRaise: 0,
      leftArmRaise: 0,
      rightArmFold: 0,
      leftArmFold: 0,
      rightArmForward: 0,
      leftArmForward: 0,
      handToMouth: 0,
      wave: 0,
      explainHands: 0,
      rightPalmOut: 0,
      leftPalmOut: 0,
      coverMouth: 0,
      fingerCurl: 0.4,
      thumbRelax: 0.24,
      fingerSpread: 0.025
    };
    this.poseTarget = { ...this.pose };
    this.gaze = { x: 0, y: 0 };
    this.gazeTarget = { x: 0, y: 0 };
    this.nextGazeAt = 1.4;
    this.nextGestureAt = 2.8;
    this.gesture = { x: 0, y: 0 };
    this.gestureTarget = { x: 0, y: 0 };
    this.microMotionSeed = Math.random() * 100;
    this.nextBlink = 1.8;
    this.blinkUntil = 0;
    this.winkSide = "";
    this.stateChangedAt = 0;
    this.lastInteractionAt = 0;
    this.lastStateKey = "idle:soft_smile";
    this.idleAction = { name: "none", startedAt: 0, duration: 0 };
    this.nextIdleActionAt = 10 + Math.random() * 7;
  }

  async boot() {
    if (!this.canvas || !this.container) return;
    setAvatar3DStatus("checking", "Checking for Synra VRM");

    const hasVrm = await urlExists(this.modelUrl);
    if (!hasVrm) {
      setAvatar3DStatus("missing-vrm", "Add web/assets/avatars/synra.vrm to enable 3D");
      return;
    }

    setAvatar3DStatus("loading", "Loading Synra VRM");

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    this.camera.position.set(0, 0.92, 3.45);

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
      });
    } catch (error) {
      console.error(error);
      setAvatar3DStatus("missing-vrm", "WebGL unavailable for Synra VRM");
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.add(new THREE.HemisphereLight(0xc9f7ff, 0x101018, 1.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-2.3, 2.8, 3.2);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9b5cff, 2.5);
    rim.position.set(2.8, 1.5, -2.2);
    this.scene.add(rim);

    this.resize();
    window.addEventListener("resize", () => this.resize(), { passive: true });

    await this.loadVrm(this.modelUrl);
    if (!this.vrm) {
      setAvatar3DStatus("missing-vrm", "Synra VRM could not be loaded");
      return;
    }

    setAvatar3DStatus("ready", "Synra VRM online");
    this.animate();
  }

  async loadVrm(url) {
    try {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      setAvatar3DStatus("loading", "Fetching Synra VRM");
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`VRM fetch failed: ${response.status}`);
      const buffer = await response.arrayBuffer();
      setAvatar3DStatus("loading", `Parsing Synra VRM (${Math.round(buffer.byteLength / 1024 / 1024)} MB)`);
      const gltf = await this.withTimeout(loader.parseAsync(buffer, assetBaseFor(url)), 25000, "VRM parse timed out");
      const vrm = gltf.userData.vrm;
      if (!vrm) throw new Error("VRM extension not found in model");
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.removeUnnecessaryJoints(gltf.scene);
      this.vrm = vrm;
      this.vrm.scene.rotation.y = Math.PI;
      this.applySynraPlaceholderStyle();
      this.applySynraBodyShape();
      this.sculptSynraSilhouette();
      this.addSynraShirtDetail();
      this.frameModel();
      this.scene.add(this.vrm.scene);
    } catch (error) {
      console.error(error);
      setAvatar3DStatus("missing-vrm", "Synra VRM failed to load");
    }
  }

  withTimeout(promise, timeoutMs, label) {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(label)), timeoutMs);
      promise.then(
        (value) => {
          window.clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          window.clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  applySynraPlaceholderStyle() {
    if (!this.vrm?.scene) return;
    const styleByName = [
      { match: /hair/i, color: 0x05050b, emissive: 0x1d1235, emissiveIntensity: 0.28 },
      { match: /eyeiris/i, color: 0x8e55ff, emissive: 0x5b2dff, emissiveIntensity: 0.2 },
      { match: /eyehighlight/i, color: 0xf8f3ff, emissive: 0xd5c2ff, emissiveIntensity: 0.24 },
      { match: /tops/i, color: 0x030308, emissive: 0x1d0c30, emissiveIntensity: 0.12 },
      { match: /bottoms|shoes/i, color: 0x05060b, emissive: 0x11091d, emissiveIntensity: 0.08 },
      { match: /accessoryneck/i, color: 0x090912, opacity: 0, emissive: 0x000000, emissiveIntensity: 0 },
      { match: /brow|eyeline/i, color: 0x070710, emissive: 0x11091d, emissiveIntensity: 0.12 },
      { match: /mouth/i, color: 0xff7aa8, emissive: 0x3d0922, emissiveIntensity: 0.1 }
    ];
    this.vrm.scene.traverse((object) => {
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      materials.forEach((material) => {
        const style = styleByName.find((item) => item.match.test(material.name || ""));
        if (!style) return;
        material.color?.setHex(style.color);
        material.emissive?.setHex(style.emissive);
        if ("emissiveIntensity" in material) material.emissiveIntensity = style.emissiveIntensity;
        if ("opacity" in style) {
          material.transparent = true;
          material.opacity = style.opacity;
          material.depthWrite = false;
        }
        material.needsUpdate = true;
      });
    });
  }

  applySynraBodyShape() {
    if (!this.vrm?.scene) return;
    const shapedBones = [];
    this.vrm.scene.traverse((object) => {
      const name = object.name || "";
      if (/Bust/i.test(name)) {
        object.scale.x *= 1.12;
        object.scale.y *= 1.06;
        object.scale.z *= 1.14;
        shapedBones.push(name);
      }
      if (/J_Bip_C_UpperChest/i.test(name)) {
        object.scale.x *= 1.01;
        object.scale.z *= 1.01;
      }
      if (/J_Bip_C_Chest/i.test(name)) {
        object.scale.x *= 1.01;
      }
      if (/J_Bip_C_Hips/i.test(name)) {
        object.scale.x *= 1.02;
        object.scale.z *= 1.01;
      }
    });
    if (shapedBones.length) {
      console.info("Synra body shaping applied", shapedBones);
    }
  }

  sculptSynraSilhouette() {
    if (!this.vrm?.scene) return;
    this.vrm.scene.traverse((object) => {
      if (!object.isSkinnedMesh || !/Body/i.test(object.name || "")) return;
      const position = object.geometry?.attributes?.position;
      if (!position) return;
      for (let index = 0; index < position.count; index += 1) {
        const x = position.getX(index);
        const y = position.getY(index);
        const z = position.getZ(index);
        const absX = Math.abs(x);
        const chest = this.gaussian(y, 1.18, 0.115) * this.gaussian(absX, 0.075, 0.07);
        const waist = this.gaussian(y, 1.02, 0.08) * this.gaussian(absX, 0.085, 0.085);
        const hips = this.gaussian(y, 0.91, 0.105) * this.gaussian(absX, 0.105, 0.09);

        let nextX = x;
        let nextY = y;
        let nextZ = z;
        nextX += Math.sign(x || 1) * (chest * 0.006 - waist * 0.01 + hips * 0.004);
        nextY += chest * 0.002;
        nextZ -= chest * 0.018;
        nextZ += waist * 0.006;
        position.setXYZ(index, nextX, nextY, nextZ);
      }
      position.needsUpdate = true;
      object.geometry.computeBoundingBox?.();
      object.geometry.computeBoundingSphere?.();
    });
  }

  addSynraShirtDetail() {
    if (!this.vrm?.scene) return;
    const upperChest = this.vrm.humanoid?.getNormalizedBoneNode?.("upperChest") || this.vrm.scene;

    const bodiceShape = new THREE.Shape();
    bodiceShape.moveTo(-0.118, 0.052);
    bodiceShape.bezierCurveTo(-0.088, 0.006, -0.052, -0.036, -0.016, -0.052);
    bodiceShape.bezierCurveTo(-0.006, -0.057, 0.006, -0.057, 0.016, -0.052);
    bodiceShape.bezierCurveTo(0.052, -0.036, 0.088, 0.006, 0.118, 0.052);
    bodiceShape.lineTo(0.098, -0.17);
    bodiceShape.bezierCurveTo(0.052, -0.19, -0.052, -0.19, -0.098, -0.17);
    bodiceShape.closePath();

    const bodice = new THREE.Mesh(
      new THREE.ShapeGeometry(bodiceShape),
      new THREE.MeshBasicMaterial({
        color: 0x07050e,
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false
      })
    );
    bodice.name = "SynraSoftBlousePanel";
    bodice.position.set(0, -0.032, -0.112);
    bodice.rotation.x = -0.09;
    bodice.renderOrder = 40;
    upperChest.add(bodice);

    const neckline = [
      new THREE.Vector3(-0.11, 0.02, -0.096),
      new THREE.Vector3(-0.078, -0.018, -0.097),
      new THREE.Vector3(-0.034, -0.05, -0.098),
      new THREE.Vector3(0, -0.058, -0.098),
      new THREE.Vector3(0.034, -0.05, -0.098),
      new THREE.Vector3(0.078, -0.018, -0.097),
      new THREE.Vector3(0.11, 0.02, -0.096)
    ];
    const necklineTrim = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(neckline).getPoints(30)),
      new THREE.LineBasicMaterial({
        color: 0x9b5cff,
        transparent: true,
        opacity: 0.78,
        depthTest: false,
        depthWrite: false
      })
    );
    necklineTrim.name = "SynraSoftBlouseNeckline";
    necklineTrim.position.set(0, -0.032, -0.006);
    necklineTrim.renderOrder = 41;
    upperChest.add(necklineTrim);

    const sideSeamMaterial = new THREE.LineBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.36,
      depthTest: false,
      depthWrite: false
    });
    [
      [
        new THREE.Vector3(-0.098, 0.012, -0.097),
        new THREE.Vector3(-0.09, -0.056, -0.099),
        new THREE.Vector3(-0.064, -0.158, -0.1)
      ],
      [
        new THREE.Vector3(0.098, 0.012, -0.097),
        new THREE.Vector3(0.09, -0.056, -0.099),
        new THREE.Vector3(0.064, -0.158, -0.1)
      ]
    ].forEach((points, index) => {
      const seam = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(points).getPoints(18)),
        sideSeamMaterial.clone()
      );
      seam.name = `SynraSoftBlouseSideSeam${index + 1}`;
      seam.position.set(0, -0.032, -0.006);
      seam.renderOrder = 42;
      upperChest.add(seam);
    });
  }

  gaussian(value, center, width) {
    const distance = (value - center) / width;
    return Math.exp(-distance * distance * 0.5);
  }

  frameModel() {
    if (!this.vrm) return;
    const box = new THREE.Box3().setFromObject(this.vrm.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const height = Math.max(size.y, 1);
    const scale = clamp(1.75 / height, 0.55, 1.55);
    this.vrm.scene.scale.setScalar(scale);
    this.vrm.scene.position.x = -center.x * scale;
    this.vrm.scene.position.y = -center.y * scale + 0.72;
    this.vrm.scene.position.z = -center.z * scale;
  }

  resize() {
    if (!this.renderer || !this.camera || !this.container) return;
    const bounds = this.container.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

	  setState(state = {}) {
	    this.mode = state.mode || "idle";
	    this.expression = state.expression || "soft_smile";
	    const stateToken = state.updated_at || state.speech_id || state.message || "";
	    const nextKey = `${this.mode}:${this.expression}:${stateToken}`;
	    if (nextKey !== this.lastStateKey) {
      this.lastStateKey = nextKey;
      this.stateChangedAt = this.clock.elapsedTime;
      this.lastInteractionAt = this.stateChangedAt;
      this.idleAction = { name: "none", startedAt: 0, duration: 0 };
      this.nextIdleActionAt = this.stateChangedAt + 8 + Math.random() * 8;
      this.blinkUntil = this.stateChangedAt + 0.11;
      if (this.expression === "stretch") this.idleAction = { name: "stretch", startedAt: this.stateChangedAt, duration: 4.4 };
    }
    this.updateBehaviorTargets(this.clock.elapsedTime);
  }

  setSpeaking(active) {
    this.speaking = active;
    this.targetMouth = active ? 1 : 0;
    if (active) {
      this.lastInteractionAt = this.clock.elapsedTime;
      this.idleAction = { name: "none", startedAt: 0, duration: 0 };
    }
  }

  update(motion = {}) {
    this.motion = { ...this.motion, ...motion };
    if (this.speaking) {
      this.targetMouth = Math.max(this.targetMouth * 0.86, motion.mouth || 0.2);
    } else {
      this.targetMouth *= 0.86;
    }
  }

  resetTargets() {
    EXPRESSION_NAMES.forEach((name) => {
      this.expressionTargets[name] = 0;
    });
    this.poseTarget = {
      headX: 0,
      headY: 0,
      headZ: 0,
      chestX: -0.018,
      chestY: 0,
      spineX: 0.006,
      spineY: 0,
      upperChestX: -0.02,
      upperChestY: 0,
      shoulderLift: -0.02,
      armOpen: 0.018,
      elbowBend: 0,
      wristTwist: 0,
      hipsX: 0,
      hipsY: 0,
      hipsZ: 0,
      rightArmRaise: 0,
      leftArmRaise: 0,
      rightArmFold: 0,
      leftArmFold: 0,
      rightArmForward: 0,
      leftArmForward: 0,
      handToMouth: 0,
      wave: 0,
      explainHands: 0,
      rightPalmOut: 0,
      leftPalmOut: 0,
      coverMouth: 0,
      fingerCurl: 0.4,
      thumbRelax: 0.24,
      fingerSpread: 0.025
    };
  }

  updateBehaviorTargets(elapsed = this.clock.elapsedTime) {
    this.resetTargets();
    const cue = `${this.mode} ${this.expression}`.toLowerCase();
    const stateAge = Math.max(0, elapsed - this.stateChangedAt);
    const arrival = clamp(1 - stateAge / 0.85, 0, 1);
    const talkBeat = this.speaking ? Math.sin(elapsed * 8.5) * 0.012 : 0;
    const idleAge = this.mode === "idle" ? Math.max(0, elapsed - this.lastInteractionAt) : 0;
    const idleEase = this.mode === "idle" ? clamp(idleAge / 10, 0, 1) : 0;
    this.expressionTargets.relaxed = this.mode === "idle" ? 0.38 + idleEase * 0.16 : 0.12;
    this.expressionTargets.fun = 0.06;
    this.poseTarget.headZ += arrival * 0.018;

    if (this.mode === "idle") {
      const slowSway = Math.sin((elapsed + this.microMotionSeed) * 0.42);
      const softRock = Math.sin((elapsed + this.microMotionSeed) * 0.27);
      this.poseTarget.headX = -0.018 + softRock * 0.014;
      this.poseTarget.headY = slowSway * 0.035;
      this.poseTarget.headZ = slowSway * 0.018;
      this.poseTarget.chestX = -0.03 + softRock * 0.018;
      this.poseTarget.chestY = slowSway * 0.018;
      this.poseTarget.spineX = 0.012 + softRock * 0.008;
      this.poseTarget.spineY = slowSway * -0.012;
      this.poseTarget.upperChestX = -0.032 + softRock * 0.01;
      this.poseTarget.upperChestY = slowSway * 0.014;
      this.poseTarget.shoulderLift = -0.055;
      this.poseTarget.armOpen = 0.045 + idleEase * 0.02;
      this.poseTarget.elbowBend = 0.018;
      this.poseTarget.wristTwist = slowSway * 0.02;
      this.poseTarget.fingerCurl = 0.4 + Math.sin((elapsed + this.microMotionSeed) * 0.92) * 0.028;
      this.poseTarget.thumbRelax = 0.26;
      this.poseTarget.fingerSpread = 0.026 + idleEase * 0.01;
      this.poseTarget.hipsX = softRock * -0.012;
      this.poseTarget.hipsY = slowSway * 0.018;
      this.poseTarget.hipsZ = slowSway * -0.012;
      this.applyIdleActionTargets(elapsed, idleAge);
    }

    if (this.mode === "listening" || cue.includes("attentive")) {
      this.expressionTargets.relaxed = 0.22;
      this.poseTarget.headX = -0.03;
      this.poseTarget.chestX = 0.002;
      this.poseTarget.upperChestX = 0.004;
      this.poseTarget.armOpen = 0.035;
      this.poseTarget.elbowBend = 0.018;
      this.poseTarget.fingerCurl = 0.28;
      this.poseTarget.fingerSpread = 0.052;
    }
    if (this.mode === "thinking" || this.mode === "workflow_running" || cue.includes("focused")) {
      this.expressionTargets.relaxed = 0.08;
      this.expressionTargets.angry = 0.12;
      this.poseTarget.headX = 0.13;
      this.poseTarget.headY = 0.12;
      this.poseTarget.headZ = -0.045;
      this.poseTarget.chestX = 0.04;
      this.poseTarget.upperChestY = 0.025;
      this.poseTarget.shoulderLift = 0.06;
      this.poseTarget.armOpen = 0.025;
      this.poseTarget.elbowBend = -0.012;
      this.poseTarget.wristTwist = 0.035;
      this.poseTarget.fingerCurl = 0.42;
    }
    if (cue.includes("determined")) {
      const pulse = Math.sin(elapsed * 3.8) * 0.012;
      this.expressionTargets.angry = 0.2;
      this.expressionTargets.happy = 0.16;
      this.expressionTargets.fun = 0.08;
      this.poseTarget.headX = 0.06 + pulse;
      this.poseTarget.headY = 0.02;
      this.poseTarget.chestX = -0.012;
      this.poseTarget.upperChestX = -0.008;
      this.poseTarget.shoulderLift = 0.045;
      this.poseTarget.armOpen = 0.04;
      this.poseTarget.elbowBend = 0.018;
      this.poseTarget.fingerCurl = 0.34;
      this.poseTarget.fingerSpread = 0.045;
    }
    if (this.mode === "speaking") {
      this.expressionTargets.happy = this.expression === "bright" ? 0.38 : 0.18;
      this.expressionTargets.joy = this.expression === "bright" ? 0.36 : 0.16;
      this.expressionTargets.fun = 0.16;
      this.poseTarget.headX = -0.015 + talkBeat;
      this.poseTarget.chestX = -0.004;
      this.poseTarget.upperChestX = -0.006;
      this.poseTarget.armOpen = 0.045;
      this.poseTarget.elbowBend = 0.026;
      this.poseTarget.wristTwist = Math.sin(elapsed * 4.2) * 0.018;
      this.poseTarget.fingerCurl = 0.26 + Math.sin(elapsed * 3.4) * 0.035;
      this.poseTarget.fingerSpread = 0.06;
    }
    if (cue.includes("playful")) {
      const sway = Math.sin(elapsed * 2.4);
      this.expressionTargets.happy = Math.max(this.expressionTargets.happy || 0, 0.58);
      this.expressionTargets.joy = Math.max(this.expressionTargets.joy || 0, 0.44);
      this.expressionTargets.fun = Math.max(this.expressionTargets.fun || 0, 0.72);
      this.expressionTargets.blinkLeft = stateAge < 0.75 ? 0.72 : 0;
      this.expressionTargets.blink_l = stateAge < 0.75 ? 0.72 : 0;
      this.poseTarget.headX = -0.035;
      this.poseTarget.headY = 0.08 + sway * 0.018;
      this.poseTarget.headZ = -0.075 + sway * 0.018;
      this.poseTarget.chestY = -0.035;
      this.poseTarget.upperChestY = -0.025;
      this.poseTarget.armOpen = 0.08;
      this.poseTarget.leftArmFold = Math.max(this.poseTarget.leftArmFold, 0.24);
      this.poseTarget.rightArmFold = Math.max(this.poseTarget.rightArmFold, 0.16);
      this.poseTarget.fingerCurl = 0.22;
      this.poseTarget.fingerSpread = 0.085;
    }
    if (this.mode === "success" || this.expression === "bright" || this.expression === "wink") {
      this.expressionTargets.happy = this.expression === "wink" ? 0.78 : 0.58;
      this.expressionTargets.joy = this.expression === "wink" ? 0.7 : 0.54;
      this.expressionTargets.fun = 0.38;
      this.expressionTargets.blinkRight = this.expression === "wink" && stateAge < 0.9 ? 0.86 : 0;
      this.expressionTargets.blink_r = this.expression === "wink" && stateAge < 0.9 ? 0.86 : 0;
      this.poseTarget.headX = -0.04;
      this.poseTarget.headZ = 0.035;
      this.poseTarget.chestX = -0.036;
      this.poseTarget.upperChestX = -0.034;
      this.poseTarget.armOpen = 0.055;
      this.poseTarget.elbowBend = 0.03;
      this.poseTarget.fingerCurl = 0.25;
      this.poseTarget.fingerSpread = 0.07;
    }
    if (cue.includes("delighted") || cue.includes("proud")) {
      const bounce = Math.sin(stateAge * Math.PI * 2.4) * Math.max(0, 1 - stateAge / 2.4);
      this.expressionTargets.happy = Math.max(this.expressionTargets.happy || 0, 0.84);
      this.expressionTargets.joy = Math.max(this.expressionTargets.joy || 0, 0.82);
      this.expressionTargets.fun = Math.max(this.expressionTargets.fun || 0, 0.5);
      this.poseTarget.headX = -0.05 + bounce * 0.012;
      this.poseTarget.headZ = 0.055;
      this.poseTarget.chestX = -0.052;
      this.poseTarget.upperChestX = -0.048;
      this.poseTarget.shoulderLift = 0.02;
      this.poseTarget.armOpen = 0.14;
      this.poseTarget.leftArmRaise = Math.max(this.poseTarget.leftArmRaise, 0.18);
      this.poseTarget.rightArmRaise = Math.max(this.poseTarget.rightArmRaise, 0.18);
      this.poseTarget.leftArmFold = Math.max(this.poseTarget.leftArmFold, 0.12);
      this.poseTarget.rightArmFold = Math.max(this.poseTarget.rightArmFold, 0.12);
      this.poseTarget.fingerCurl = 0.18;
      this.poseTarget.fingerSpread = 0.11;
    }
    if (this.mode === "approval_needed" || cue.includes("raised_brow") || cue.includes("curious")) {
      this.expressionTargets.surprised = 0.28;
      this.poseTarget.headY = -0.12;
      this.poseTarget.headZ = 0.055;
      this.poseTarget.chestY = -0.035;
      this.poseTarget.armOpen = 0.045;
      this.poseTarget.elbowBend = 0.02;
      this.poseTarget.fingerCurl = 0.38;
    }
    if (cue.includes("curious")) {
      this.expressionTargets.relaxed = 0.1;
      this.expressionTargets.surprised = Math.max(this.expressionTargets.surprised || 0, 0.38);
      this.poseTarget.headX = -0.015;
      this.poseTarget.headY = -0.16;
      this.poseTarget.headZ = 0.09;
      this.poseTarget.chestY = -0.04;
      this.poseTarget.leftArmFold = Math.max(this.poseTarget.leftArmFold, 0.18);
      this.poseTarget.rightArmFold = Math.max(this.poseTarget.rightArmFold, 0.22);
      this.poseTarget.handToMouth = Math.max(this.poseTarget.handToMouth, 0.12);
      this.poseTarget.fingerCurl = 0.32;
    }
    if (cue.includes("confused") || cue.includes("unclear") || cue.includes("unknown")) {
      this.expressionTargets.surprised = 0.2;
      this.expressionTargets.sad = 0.16;
      this.expressionTargets.sorrow = 0.16;
      this.poseTarget.headY = -0.15;
      this.poseTarget.headZ = -0.09;
      this.poseTarget.chestY = 0.04;
      this.poseTarget.upperChestY = -0.025;
      this.poseTarget.armOpen = 0.04;
      this.poseTarget.elbowBend = -0.02;
      this.poseTarget.fingerCurl = 0.4;
    }
    if (this.mode === "warning" || this.mode === "error" || this.expression === "concerned" || cue.includes("sad")) {
      this.expressionTargets.sad = 0.56;
      this.expressionTargets.sorrow = 0.56;
      this.expressionTargets.relaxed = 0;
      this.poseTarget.headX = 0.09;
      this.poseTarget.headY = 0.05;
      this.poseTarget.headZ = -0.035;
      this.poseTarget.chestX = 0.035;
      this.poseTarget.upperChestX = 0.035;
      this.poseTarget.shoulderLift = -0.05;
      this.poseTarget.armOpen = 0.012;
      this.poseTarget.fingerCurl = 0.44;
    }
    if (cue.includes("look_left")) {
      this.poseTarget.headY = 0.22;
      this.gazeTarget.x = 0.14;
      this.poseTarget.chestY = 0.04;
    }
    if (cue.includes("look_right")) {
      this.poseTarget.headY = -0.22;
      this.gazeTarget.x = -0.14;
      this.poseTarget.chestY = -0.04;
    }
    if (cue.includes("look_up")) {
      this.poseTarget.headX = -0.18;
      this.gazeTarget.y = -0.12;
    }
    if (cue.includes("look_down")) {
      this.poseTarget.headX = 0.18;
      this.gazeTarget.y = 0.12;
    }
    if (cue.includes("wave")) this.applyExpressiveActionTargets("wave", stateAge, elapsed);
    if (cue.includes("explain")) {
      this.expressionTargets.happy = Math.max(this.expressionTargets.happy || 0, 0.32);
      this.expressionTargets.fun = Math.max(this.expressionTargets.fun || 0, 0.22);
      this.applyExpressiveActionTargets("explain", stateAge, elapsed);
    }
    if (arrival > 0) {
      this.expressionTargets.surprised = Math.max(this.expressionTargets.surprised || 0, arrival * 0.06);
      this.poseTarget.chestX += arrival * -0.012;
    }
  }

  applyExpressiveActionTargets(name, stateAge, elapsed) {
    if (name === "wave") {
      const progress = clamp(stateAge / 4.2, 0, 1);
      const envelope = Math.max(0.82, actionEnvelope(progress, 0.18, 0.22));
      const wristWave = Math.sin(progress * Math.PI * 8.5) * envelope;
      const friendlyBounce = Math.sin(progress * Math.PI * 2.2) * envelope;
      this.expressionTargets.happy = Math.max(this.expressionTargets.happy || 0, 0.72 * envelope);
      this.expressionTargets.joy = Math.max(this.expressionTargets.joy || 0, 0.52 * envelope);
      this.expressionTargets.fun = Math.max(this.expressionTargets.fun || 0, 0.56 * envelope);
      this.poseTarget.headX += -0.018 * envelope;
      this.poseTarget.headY += -0.045 * envelope;
      this.poseTarget.headZ += (0.045 + friendlyBounce * 0.018) * envelope;
      this.poseTarget.chestY += 0.045 * envelope;
      this.poseTarget.upperChestY += 0.035 * envelope;
      this.poseTarget.shoulderLift += 0.02 * envelope;
      this.poseTarget.armOpen += 0.05 * envelope;
      this.poseTarget.rightArmRaise = Math.max(this.poseTarget.rightArmRaise, 1.18 * envelope);
      this.poseTarget.rightArmFold = Math.max(this.poseTarget.rightArmFold, 0.72 * envelope);
      this.poseTarget.rightArmForward = Math.max(this.poseTarget.rightArmForward, 0.58 * envelope);
      this.poseTarget.leftArmFold += 0.04 * envelope;
      this.poseTarget.wave = envelope;
      this.poseTarget.rightPalmOut = envelope;
      this.poseTarget.wristTwist += wristWave * 0.28;
      this.poseTarget.fingerCurl = 0.13 + 0.04 * (1 - envelope);
      this.poseTarget.thumbRelax = 0.12;
      this.poseTarget.fingerSpread = 0.11 * envelope;
      return;
    }

    if (name === "explain") {
      const envelope = clamp(stateAge / 0.75, 0, 1);
      const leftBeat = Math.max(0, Math.sin(elapsed * 3.2));
      const rightBeat = Math.max(0, Math.sin(elapsed * 3.2 + Math.PI * 0.82));
      const breathBeat = Math.sin(elapsed * 2.1);
      this.poseTarget.headX += (-0.02 + Math.sin(elapsed * 2.8) * 0.012) * envelope;
      this.poseTarget.headY += Math.sin(elapsed * 1.7) * 0.035 * envelope;
      this.poseTarget.chestY += breathBeat * 0.028 * envelope;
      this.poseTarget.upperChestY += breathBeat * 0.024 * envelope;
      this.poseTarget.armOpen += 0.18 * envelope;
      this.poseTarget.leftArmRaise = Math.max(this.poseTarget.leftArmRaise, (0.58 + leftBeat * 0.12) * envelope);
      this.poseTarget.rightArmRaise = Math.max(this.poseTarget.rightArmRaise, (0.52 + rightBeat * 0.12) * envelope);
      this.poseTarget.leftArmFold = Math.max(this.poseTarget.leftArmFold, (0.48 + leftBeat * 0.16) * envelope);
      this.poseTarget.rightArmFold = Math.max(this.poseTarget.rightArmFold, (0.46 + rightBeat * 0.16) * envelope);
      this.poseTarget.leftArmForward = Math.max(this.poseTarget.leftArmForward, (1.0 + leftBeat * 0.18) * envelope);
      this.poseTarget.rightArmForward = Math.max(this.poseTarget.rightArmForward, (1.0 + rightBeat * 0.18) * envelope);
      this.poseTarget.explainHands = envelope;
      this.poseTarget.leftPalmOut = 0.58 * envelope;
      this.poseTarget.rightPalmOut = 0.58 * envelope;
      this.poseTarget.wristTwist += Math.sin(elapsed * 4.8) * 0.08 * envelope;
      this.poseTarget.fingerCurl = 0.18;
      this.poseTarget.thumbRelax = 0.18;
      this.poseTarget.fingerSpread = 0.095;
    }
  }

  applyIdleActionTargets(elapsed, idleAge) {
    const action = this.idleAction;
    if (action.name === "none") return;
    const progress = clamp((elapsed - action.startedAt) / action.duration, 0, 1);
    const ease = Math.sin(progress * Math.PI);
    if (progress >= 1) return;

    if (action.name === "stretch") {
      const reach = smoothstep(0.06, 0.42, progress) * (1 - smoothstep(0.78, 1, progress));
      const sideLean = Math.sin(progress * Math.PI) * reach;
      this.expressionTargets.relaxed = Math.max(this.expressionTargets.relaxed || 0, 0.58 * reach);
      this.poseTarget.headX -= 0.07 * sideLean;
      this.poseTarget.headY += 0.035 * sideLean;
      this.poseTarget.chestX -= 0.055 * sideLean;
      this.poseTarget.chestY += 0.035 * sideLean;
      this.poseTarget.upperChestX -= 0.04 * sideLean;
      this.poseTarget.shoulderLift += 0.06 * reach;
      this.poseTarget.armOpen += 0.2 * reach;
      this.poseTarget.leftArmRaise = Math.max(this.poseTarget.leftArmRaise, 1.24 * reach);
      this.poseTarget.rightArmRaise = Math.max(this.poseTarget.rightArmRaise, 1.02 * reach);
      this.poseTarget.leftArmFold = Math.max(this.poseTarget.leftArmFold, 0.04 * reach);
      this.poseTarget.rightArmFold = Math.max(this.poseTarget.rightArmFold, 0.04 * reach);
      this.poseTarget.wristTwist += 0.08 * reach;
      this.poseTarget.fingerCurl = 0.18;
      this.poseTarget.fingerSpread = 0.085;
      return;
    }

    if (action.name === "weight_shift") {
      this.poseTarget.hipsY += 0.055 * ease;
      this.poseTarget.hipsZ += 0.035 * ease;
      this.poseTarget.chestY -= 0.035 * ease;
      this.poseTarget.headY -= 0.045 * ease;
      this.poseTarget.armOpen += 0.025 * ease;
      this.poseTarget.leftArmFold = 0.08 * ease;
      this.poseTarget.rightArmFold = -0.04 * ease;
      this.poseTarget.wristTwist += 0.035 * ease;
      return;
    }

    if (action.name === "shy_smile") {
      this.expressionTargets.happy = Math.max(this.expressionTargets.happy || 0, 0.36 * ease);
      this.expressionTargets.fun = Math.max(this.expressionTargets.fun || 0, 0.24 * ease);
      this.poseTarget.headZ -= 0.05 * ease;
      this.poseTarget.headY += 0.06 * ease;
      this.poseTarget.chestY -= 0.025 * ease;
      this.poseTarget.leftArmFold = 0.2 * ease;
      this.poseTarget.fingerCurl = 0.34 + 0.08 * ease;
      return;
    }

    if (action.name === "hand_fidget") {
      this.poseTarget.wristTwist += 0.08 * ease;
      this.poseTarget.fingerCurl = 0.34 + 0.12 * ease;
      this.poseTarget.fingerSpread = 0.06 + 0.025 * ease;
      this.poseTarget.leftArmFold = 0.08 * ease;
      return;
    }

    if (action.name === "thoughtful_glance") {
      const glance = smoothstep(0.08, 0.32, progress) * (1 - smoothstep(0.74, 1, progress));
      this.expressionTargets.relaxed = Math.max(this.expressionTargets.relaxed || 0, 0.42 * glance);
      this.expressionTargets.surprised = Math.max(this.expressionTargets.surprised || 0, 0.12 * glance);
      this.poseTarget.headX += 0.045 * glance;
      this.poseTarget.headY -= 0.12 * glance;
      this.poseTarget.headZ -= 0.045 * glance;
      this.poseTarget.chestY += 0.035 * glance;
      this.gazeTarget.x = -0.08 * glance;
      this.gazeTarget.y = 0.04 * glance;
      this.poseTarget.rightArmRaise = Math.max(this.poseTarget.rightArmRaise, 0.28 * glance);
      this.poseTarget.rightArmFold = Math.max(this.poseTarget.rightArmFold, 0.62 * glance);
      this.poseTarget.handToMouth = Math.max(this.poseTarget.handToMouth, 0.42 * glance);
      this.poseTarget.fingerCurl = 0.36;
      return;
    }

    if (action.name === "hair_tuck") {
      const tuck = smoothstep(0.05, 0.34, progress) * (1 - smoothstep(0.72, 1, progress));
      const tinySmile = Math.sin(progress * Math.PI) * tuck;
      this.expressionTargets.happy = Math.max(this.expressionTargets.happy || 0, 0.22 * tinySmile);
      this.expressionTargets.fun = Math.max(this.expressionTargets.fun || 0, 0.16 * tinySmile);
      this.poseTarget.headZ -= 0.055 * tuck;
      this.poseTarget.headY += 0.045 * tuck;
      this.poseTarget.chestY -= 0.025 * tuck;
      this.poseTarget.leftArmRaise = Math.max(this.poseTarget.leftArmRaise, 0.5 * tuck);
      this.poseTarget.leftArmFold = Math.max(this.poseTarget.leftArmFold, 0.72 * tuck);
      this.poseTarget.armOpen += 0.04 * tuck;
      this.poseTarget.wristTwist -= 0.08 * tuck;
      this.poseTarget.fingerCurl = 0.26;
      this.poseTarget.fingerSpread = 0.055;
      return;
    }

    if (action.name === "happy_bounce") {
      const bounce = Math.sin(progress * Math.PI * 2.5) * Math.sin(progress * Math.PI);
      this.expressionTargets.happy = Math.max(this.expressionTargets.happy || 0, 0.34 * ease);
      this.expressionTargets.fun = Math.max(this.expressionTargets.fun || 0, 0.24 * ease);
      this.poseTarget.headZ += 0.025 * bounce;
      this.poseTarget.chestX -= 0.018 * Math.abs(bounce);
      this.poseTarget.hipsX += 0.012 * bounce;
      this.poseTarget.armOpen += 0.025 * ease;
      this.poseTarget.fingerCurl = 0.3;
    }
  }

  animate() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;
    if (elapsed > this.nextBlink) {
      this.blinkUntil = elapsed + 0.12;
      this.nextBlink = elapsed + 2.4 + Math.random() * 3.2;
    }
    const blink = elapsed < this.blinkUntil;
    this.motion.mouth = lerp(this.motion.mouth || 0, this.targetMouth, 0.2);
    this.updateIdleAction(elapsed);
    this.updateAutonomousGaze(elapsed);
    this.updateAutonomousGesture(elapsed);

    this.updateVrm(delta, elapsed, blink);

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.animate());
  }

  updateVrm(delta, elapsed, blink) {
    const x = clamp(this.motion.x || 0, -18, 18);
    const y = clamp(this.motion.y || 0, -14, 14);
    const mouth = clamp(this.motion.mouth || 0, 0, 1);
    this.updateBehaviorTargets();
    this.pose = this.lerpObject(this.pose, this.poseTarget, 0.08);
    this.gaze.x = lerp(this.gaze.x, this.gazeTarget.x + x * 0.008, 0.08);
    this.gaze.y = lerp(this.gaze.y, this.gazeTarget.y + y * -0.007, 0.08);

    const head = this.vrm.humanoid?.getNormalizedBoneNode?.("head");
    const neck = this.vrm.humanoid?.getNormalizedBoneNode?.("neck");
    const hips = this.vrm.humanoid?.getNormalizedBoneNode?.("hips");
    const chest = this.vrm.humanoid?.getNormalizedBoneNode?.("chest");
    const upperChest = this.vrm.humanoid?.getNormalizedBoneNode?.("upperChest");
    const spine = this.vrm.humanoid?.getNormalizedBoneNode?.("spine");
    const leftEye = this.vrm.humanoid?.getNormalizedBoneNode?.("leftEye");
    const rightEye = this.vrm.humanoid?.getNormalizedBoneNode?.("rightEye");
    const leftUpperArm = this.vrm.humanoid?.getNormalizedBoneNode?.("leftUpperArm");
    const rightUpperArm = this.vrm.humanoid?.getNormalizedBoneNode?.("rightUpperArm");
    const leftLowerArm = this.vrm.humanoid?.getNormalizedBoneNode?.("leftLowerArm");
    const rightLowerArm = this.vrm.humanoid?.getNormalizedBoneNode?.("rightLowerArm");
    const leftHand = this.vrm.humanoid?.getNormalizedBoneNode?.("leftHand");
    const rightHand = this.vrm.humanoid?.getNormalizedBoneNode?.("rightHand");
    const breathe = Math.sin((elapsed + this.microMotionSeed) * 1.45) * 0.014;
    const speakingNod = this.speaking ? Math.sin(elapsed * 7.2) * 0.018 * Math.max(mouth, 0.15) : 0;

    if (head) {
      head.rotation.y = lerp(head.rotation.y, this.pose.headY + this.gaze.x, 0.16);
      head.rotation.x = lerp(head.rotation.x, this.pose.headX + this.gaze.y + speakingNod, 0.16);
      head.rotation.z = lerp(head.rotation.z, this.pose.headZ + (this.motion.rotate || 0) * 0.01, 0.12);
    }
    if (neck) {
      neck.rotation.y = lerp(neck.rotation.y, (this.pose.headY + this.gaze.x) * 0.38, 0.12);
      neck.rotation.x = lerp(neck.rotation.x, (this.pose.headX + this.gaze.y) * 0.32, 0.12);
    }
    if (leftEye) {
      leftEye.rotation.y = lerp(leftEye.rotation.y, this.gaze.x * 0.7, 0.2);
      leftEye.rotation.x = lerp(leftEye.rotation.x, this.gaze.y * 0.55, 0.2);
    }
    if (rightEye) {
      rightEye.rotation.y = lerp(rightEye.rotation.y, this.gaze.x * 0.7, 0.2);
      rightEye.rotation.x = lerp(rightEye.rotation.x, this.gaze.y * 0.55, 0.2);
    }
    if (hips) {
      hips.rotation.y = lerp(hips.rotation.y, this.pose.hipsY, 0.06);
      hips.rotation.x = lerp(hips.rotation.x, this.pose.hipsX, 0.06);
      hips.rotation.z = lerp(hips.rotation.z, this.pose.hipsZ, 0.06);
    }
    if (chest) {
      chest.rotation.y = lerp(chest.rotation.y, this.pose.chestY + x * 0.0025, 0.08);
      chest.rotation.x = lerp(chest.rotation.x, this.pose.chestX + breathe, 0.08);
    }
    if (upperChest) {
      upperChest.rotation.y = lerp(upperChest.rotation.y, this.pose.upperChestY + this.gesture.x * 0.025, 0.08);
      upperChest.rotation.x = lerp(upperChest.rotation.x, this.pose.upperChestX + breathe * 0.7, 0.08);
    }
    if (spine) {
      spine.rotation.y = lerp(spine.rotation.y, this.pose.spineY + x * 0.0015, 0.07);
      spine.rotation.x = lerp(spine.rotation.x, this.pose.spineX + breathe * 0.45, 0.07);
    }
	    if (leftUpperArm) {
	      const explain = this.pose.explainHands || 0;
	      const armForward = this.pose.leftArmForward || 0;
	      leftUpperArm.rotation.z = lerp(
	        leftUpperArm.rotation.z,
	        1.36 + this.pose.shoulderLift - this.pose.armOpen * 0.35 - this.pose.leftArmRaise * 0.55 - explain * 0.18 + armForward * 0.08,
	        0.08
	      );
	      leftUpperArm.rotation.x = lerp(leftUpperArm.rotation.x, -0.045 + this.gesture.y * 0.02 - this.pose.leftArmRaise * 0.1 + armForward * 1.02 - explain * 0.05, 0.06);
	      leftUpperArm.rotation.y = lerp(leftUpperArm.rotation.y, 0.13 + this.pose.armOpen * 0.06 + this.pose.leftArmFold * 0.18 + explain * 0.1 - armForward * 0.24, 0.06);
	    }
	    if (rightUpperArm) {
	      const wave = this.pose.wave || 0;
	      const explain = this.pose.explainHands || 0;
	      const handToMouth = this.pose.handToMouth || 0;
	      const armForward = this.pose.rightArmForward || 0;
	      rightUpperArm.rotation.z = lerp(
	        rightUpperArm.rotation.z,
	        -1.36 - this.pose.shoulderLift + this.pose.armOpen * 0.35 + this.pose.rightArmRaise * 0.55 + wave * 0.46 + explain * 0.18 + handToMouth * 0.34 - armForward * 0.08,
	        0.08
	      );
	      rightUpperArm.rotation.x = lerp(rightUpperArm.rotation.x, -0.045 - this.gesture.y * 0.02 - this.pose.rightArmRaise * 0.1 + armForward * 1.02 - wave * 0.06 - explain * 0.05 - handToMouth * 0.06, 0.06);
	      rightUpperArm.rotation.y = lerp(rightUpperArm.rotation.y, -0.13 - this.pose.armOpen * 0.06 - this.pose.rightArmFold * 0.18 + wave * 0.08 - explain * 0.1 - handToMouth * 0.12 + armForward * 0.24, 0.06);
	    }
	    if (leftLowerArm) {
	      const explain = this.pose.explainHands || 0;
	      const armForward = this.pose.leftArmForward || 0;
	      leftLowerArm.rotation.z = lerp(leftLowerArm.rotation.z, 0.16 - this.pose.armOpen * 0.08 + this.pose.elbowBend + this.pose.leftArmFold * 0.42 + explain * 0.12, 0.06);
	      leftLowerArm.rotation.x = lerp(leftLowerArm.rotation.x, 0.035 - this.pose.leftArmRaise * 0.08 + armForward * 0.34, 0.06);
	      leftLowerArm.rotation.y = lerp(leftLowerArm.rotation.y, 0.04 + this.pose.leftArmFold * 0.12 + explain * 0.08 - armForward * 0.28, 0.06);
	    }
	    if (rightLowerArm) {
	      const wave = this.pose.wave || 0;
	      const explain = this.pose.explainHands || 0;
	      const handToMouth = this.pose.handToMouth || 0;
	      const armForward = this.pose.rightArmForward || 0;
	      const waveBeat = Math.sin(elapsed * 9.5) * wave;
	      rightLowerArm.rotation.z = lerp(
	        rightLowerArm.rotation.z,
        -0.16 + this.pose.armOpen * 0.08 - this.pose.elbowBend - this.pose.rightArmFold * 0.34 + wave * 1.42 - explain * 0.2 + handToMouth * 1.72,
	        0.06
	      );
	      rightLowerArm.rotation.x = lerp(rightLowerArm.rotation.x, 0.035 - this.pose.rightArmRaise * 0.08 - handToMouth * 0.18 + wave * 0.18 + armForward * 0.24, 0.06);
	      rightLowerArm.rotation.y = lerp(rightLowerArm.rotation.y, -0.04 - this.pose.rightArmFold * 0.12 + waveBeat * 0.1 + wave * 0.86 - explain * 0.08 + handToMouth * 0.82 + armForward * 0.16, 0.06);
	    }
	    if (leftHand) {
	      const palmOut = this.pose.leftPalmOut || 0;
	      leftHand.rotation.z = lerp(leftHand.rotation.z, -0.13 - palmOut * 0.08, 0.08);
	      leftHand.rotation.x = lerp(leftHand.rotation.x, -0.055 + palmOut * 0.22, 0.08);
	      leftHand.rotation.y = lerp(leftHand.rotation.y, this.pose.wristTwist - 0.045 + palmOut * 0.36, 0.08);
	    }
	    if (rightHand) {
	      const wave = this.pose.wave || 0;
	      const handToMouth = this.pose.handToMouth || 0;
	      const palmOut = this.pose.rightPalmOut || 0;
	      const coverMouth = this.pose.coverMouth || 0;
	      const waveBeat = Math.sin(elapsed * 11.5) * wave;
	      rightHand.rotation.z = lerp(rightHand.rotation.z, 0.09 - handToMouth * 0.22 - coverMouth * 0.08 + waveBeat * 0.1 - palmOut * 0.12, 0.08);
	      rightHand.rotation.x = lerp(rightHand.rotation.x, -0.035 - handToMouth * 0.36 - coverMouth * 0.18 + palmOut * 0.24, 0.08);
	      rightHand.rotation.y = lerp(rightHand.rotation.y, -this.pose.wristTwist + 0.035 + handToMouth * 0.28 + coverMouth * 0.16 - palmOut * 0.82 + waveBeat * 0.06, 0.08);
	    }
    this.applyRelaxedFingerPose(elapsed);
    if (this.vrm.expressionManager) {
      this.applyMouthTargets(mouth, elapsed);
      if (blink) this.expressionTargets.blink = 1;
      this.applyExpressions();
    }
    this.vrm.update(delta);
  }

  updateAutonomousGaze(elapsed) {
    if (elapsed < this.nextGazeAt) return;
    const mode = this.mode;
    const options =
      mode === "thinking" || mode === "workflow_running"
        ? [
            { x: 0.1, y: 0.04 },
            { x: -0.08, y: 0.035 },
            { x: 0, y: 0.08 }
          ]
        : mode === "listening"
          ? [
              { x: -0.08, y: -0.02 },
              { x: 0.08, y: -0.02 },
              { x: 0, y: -0.04 }
            ]
          : [
              { x: 0, y: 0 },
              { x: -0.07, y: -0.015 },
              { x: 0.07, y: -0.015 },
              { x: 0, y: 0.035 }
            ];
    this.gazeTarget = options[Math.floor(Math.random() * options.length)];
    this.nextGazeAt = elapsed + 1.4 + Math.random() * 2.7;
  }

  updateAutonomousGesture(elapsed) {
    if (elapsed >= this.nextGestureAt) {
      const intensity =
        this.mode === "speaking" ? 1 :
          this.mode === "thinking" || this.mode === "workflow_running" ? 0.65 :
            this.mode === "listening" ? 0.45 : 0.25;
      this.gestureTarget = {
        x: (Math.random() - 0.5) * intensity,
        y: (Math.random() - 0.5) * intensity
      };
      this.nextGestureAt = elapsed + 2.8 + Math.random() * 3.8;
    }
    this.gesture.x = lerp(this.gesture.x, this.gestureTarget.x, 0.035);
    this.gesture.y = lerp(this.gesture.y, this.gestureTarget.y, 0.035);
  }

  updateIdleAction(elapsed) {
    if (this.mode !== "idle" || this.speaking) {
      this.idleAction = { name: "none", startedAt: 0, duration: 0 };
      this.nextIdleActionAt = elapsed + 8 + Math.random() * 8;
      return;
    }
    const active = this.idleAction.name !== "none";
    if (active && elapsed < this.idleAction.startedAt + this.idleAction.duration) return;
    if (active) {
      this.idleAction = { name: "none", startedAt: 0, duration: 0 };
      this.nextIdleActionAt = elapsed + 5 + Math.random() * 8;
      return;
    }
    if (elapsed < this.nextIdleActionAt) return;

    const idleAge = Math.max(0, elapsed - this.lastInteractionAt);
    const options =
      idleAge > 24
        ? [
            { name: "stretch", duration: 4.8 },
            { name: "weight_shift", duration: 4.2 },
            { name: "shy_smile", duration: 3.6 },
            { name: "hand_fidget", duration: 3.2 },
            { name: "thoughtful_glance", duration: 4.2 },
            { name: "hair_tuck", duration: 3.8 },
            { name: "happy_bounce", duration: 2.8 }
          ]
        : [
            { name: "weight_shift", duration: 3.8 },
            { name: "shy_smile", duration: 3.2 },
            { name: "stretch", duration: 4.4 },
            { name: "hand_fidget", duration: 2.8 },
            { name: "thoughtful_glance", duration: 3.8 },
            { name: "hair_tuck", duration: 3.6 },
            { name: "happy_bounce", duration: 2.6 }
          ];
    const choice = options[Math.floor(Math.random() * options.length)];
    this.idleAction = { ...choice, startedAt: elapsed };
  }

  applyRelaxedFingerPose(elapsed) {
    const curl = clamp(this.pose.fingerCurl + Math.sin((elapsed + this.microMotionSeed) * 1.7) * 0.018, 0.08, 0.62);
    const thumbRelax = clamp(this.pose.thumbRelax, 0, 0.5);
    const spread = clamp(this.pose.fingerSpread, 0, 0.12);
    ["left", "right"].forEach((side) => {
      const handedness = side === "left" ? 1 : -1;
      const thumbMeta = this.vrm.humanoid?.getNormalizedBoneNode?.(`${side}ThumbMetacarpal`);
      const thumbProximal = this.vrm.humanoid?.getNormalizedBoneNode?.(`${side}ThumbProximal`);
      const thumbIntermediate = this.vrm.humanoid?.getNormalizedBoneNode?.(`${side}ThumbIntermediate`);
      const thumbDistal = this.vrm.humanoid?.getNormalizedBoneNode?.(`${side}ThumbDistal`);
      if (thumbMeta) {
        thumbMeta.rotation.z = lerp(thumbMeta.rotation.z, handedness * (0.1 + thumbRelax * 0.16), 0.1);
        thumbMeta.rotation.y = lerp(thumbMeta.rotation.y, handedness * -0.08, 0.1);
      }
      if (thumbProximal) thumbProximal.rotation.z = lerp(thumbProximal.rotation.z, handedness * (0.16 + thumbRelax * 0.16), 0.1);
      if (thumbIntermediate) thumbIntermediate.rotation.z = lerp(thumbIntermediate.rotation.z, handedness * (0.12 + thumbRelax * 0.12), 0.1);
      if (thumbDistal) thumbDistal.rotation.z = lerp(thumbDistal.rotation.z, handedness * (0.08 + thumbRelax * 0.08), 0.1);

      ["Index", "Middle", "Ring", "Little"].forEach((finger, fingerIndex) => {
        const proximal = this.vrm.humanoid?.getNormalizedBoneNode?.(`${side}${finger}Proximal`);
        const intermediate = this.vrm.humanoid?.getNormalizedBoneNode?.(`${side}${finger}Intermediate`);
        const distal = this.vrm.humanoid?.getNormalizedBoneNode?.(`${side}${finger}Distal`);
        const fingerWeight = finger === "Index" ? 0.82 : finger === "Middle" ? 0.94 : finger === "Ring" ? 1.02 : 1.08;
        const spreadOffset = (fingerIndex - 1.5) * spread * handedness;
        if (proximal) {
          proximal.rotation.z = lerp(proximal.rotation.z, handedness * 0.52 * curl * fingerWeight, 0.1);
          proximal.rotation.y = lerp(proximal.rotation.y, spreadOffset, 0.1);
        }
        if (intermediate) intermediate.rotation.z = lerp(intermediate.rotation.z, handedness * 0.64 * curl * fingerWeight, 0.1);
        if (distal) distal.rotation.z = lerp(distal.rotation.z, handedness * 0.38 * curl * fingerWeight, 0.1);
      });
    });
  }

  applyMouthTargets(mouth, elapsed) {
    const open = clamp(mouth, 0, 1);
    const vowels = ["aa", "ih", "ou", "ee", "oh"];
    const vrm0Vowels = ["a", "i", "u", "e", "o"];
    const index = Math.floor(elapsed * 10) % vowels.length;
    vowels.forEach((name, vowelIndex) => {
      this.expressionTargets[name] = vowelIndex === index ? open : open * 0.22;
    });
    vrm0Vowels.forEach((name, vowelIndex) => {
      this.expressionTargets[name] = vowelIndex === index ? open : open * 0.22;
    });
  }

  lerpObject(current, target, amount) {
    const next = { ...current };
    Object.keys(target).forEach((key) => {
      next[key] = lerp(current[key] || 0, target[key] || 0, amount);
    });
    return next;
  }

  applyExpressions() {
    if (!this.vrm?.expressionManager) return;
    EXPRESSION_NAMES.forEach((name) => {
      const target = clamp(this.expressionTargets[name] || 0, 0, 1);
      const current = this.expressionValues[name] || 0;
      const next = lerp(current, target, name === "blink" ? 0.75 : 0.16);
      this.expressionValues[name] = next;
      try {
        this.vrm.expressionManager.setValue(name, next);
      } catch {
        // VRM models may omit optional expressions; missing presets are safe.
      }
    });
  }
}

window.synraAvatar3D = new SynraAvatar3DController();
window.addEventListener("DOMContentLoaded", () => window.synraAvatar3D.boot());
