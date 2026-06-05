import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { VRM } from "@pixiv/three-vrm";
import { createVRMAnimationClip, VRMAnimationLoaderPlugin, type VRMAnimation } from "@pixiv/three-vrm-animation";

export type SynraMotionChannel = "base" | "gesture" | "gaze" | "face" | "lipsync" | "procedural_life";
export type SynraMotionMask = "fullBody" | "upperBody" | "headOnly" | "faceOnly" | "gazeOnly";

export interface SynraMotionClipSpec {
  id: string;
  label: string;
  url?: string;
  actionIds?: string[];
  channel?: SynraMotionChannel;
  mask?: SynraMotionMask;
  loop?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  priority?: number;
  status?: string;
  quality?: string;
  localInstalled?: boolean;
}

export interface SynraMotionManifest {
  version: number;
  description?: string;
  routes: Record<string, string>;
  clips: SynraMotionClipSpec[];
}

type RuntimeClip = {
  spec: SynraMotionClipSpec;
  clip?: THREE.AnimationClip;
  loading?: Promise<THREE.AnimationClip | null>;
  action?: THREE.AnimationAction;
  failed?: boolean;
  lastError?: string;
};

type PlayOptions = {
  loop?: boolean;
  restart?: boolean;
  returnToIdle?: boolean;
};

export interface SynraMotionSnapshot {
  ready: boolean;
  manifestVersion: number | null;
  clipCount: number;
  routeCount: number;
  activeClipId: string | null;
  lastPlayedClipId: string | null;
  loadedClipCount: number;
  failedClipCount: number;
  lastError: string | null;
}

const ESSENTIAL_ACTIONS = [
  "mode:idle",
  "mode:listening",
  "mode:thinking",
  "mode:speaking",
  "wave",
  "hello_present",
  "confirm",
  "deny",
  "look_camera",
  "look_screen",
  "explain",
  "present",
  "success"
];

export class SynraMotionPlayer {
  private readonly loader = new GLTFLoader();
  private readonly clips = new Map<string, RuntimeClip>();
  private manifest: SynraMotionManifest | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private vrm: VRM | null = null;
  private active: RuntimeClip | null = null;
  private activeReturnToIdle = false;
  private returnToIdleRoute = "mode:idle";
  private lastPlayedClipId: string | null = null;
  private lastError: string | null = null;
  private generation = 0;

  constructor() {
    this.loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  }

  get activeClipId(): string | null {
    return this.active?.spec.id ?? null;
  }

  get snapshot(): SynraMotionSnapshot {
    return {
      ready: Boolean(this.manifest && this.vrm && this.mixer),
      manifestVersion: this.manifest?.version ?? null,
      clipCount: this.manifest?.clips.length ?? 0,
      routeCount: this.manifest ? Object.keys(this.manifest.routes).length : 0,
      activeClipId: this.activeClipId,
      lastPlayedClipId: this.lastPlayedClipId,
      loadedClipCount: [...this.clips.values()].filter((runtime) => Boolean(runtime.clip)).length,
      failedClipCount: [...this.clips.values()].filter((runtime) => runtime.failed === true).length,
      lastError: this.lastError
    };
  }

  async boot(vrm: VRM, manifestUrl = "/motions/synra-motion-manifest.json"): Promise<void> {
    this.dispose();
    this.generation += 1;
    this.vrm = vrm;
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    await this.loadManifest(manifestUrl);
    void this.preloadEssentials();
  }

  dispose(): void {
    this.generation += 1;
    this.mixer?.stopAllAction();
    if (this.vrm) this.mixer?.uncacheRoot(this.vrm.scene);
    this.mixer = null;
    this.vrm = null;
    this.active = null;
    this.activeReturnToIdle = false;
    for (const runtime of this.clips.values()) runtime.action = undefined;
  }

  update(delta: number): void {
    if (!this.mixer) return;
    this.mixer.update(delta);
    if (!this.active?.action || this.active.spec.loop) return;
    const runtime = this.active;
    const action = runtime.action;
    if (!action) return;
    const duration = action.getClip().duration;
    if (action.time >= duration - 0.01 || !action.isRunning()) {
      action.stop();
      action.enabled = false;
      this.active = null;
      const shouldReturnToIdle = this.activeReturnToIdle;
      this.activeReturnToIdle = false;
      const idleClipId = this.resolveClipId(this.returnToIdleRoute);
      if (shouldReturnToIdle && runtime.spec.id !== idleClipId) {
        void this.playAction(this.returnToIdleRoute, { loop: true, restart: true });
      }
    }
  }

  setReturnToIdleRoute(route: string): void {
    this.returnToIdleRoute = route.trim() || "mode:idle";
  }

  listClips(): SynraMotionClipSpec[] {
    return [...this.clips.values()]
      .map((runtime) => runtime.spec)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  resolveClipId(actionOrClipId: string): string | null {
    if (this.clips.has(actionOrClipId)) return actionOrClipId;
    return this.manifest?.routes[actionOrClipId] ?? null;
  }

  async playAction(actionId: string, options: PlayOptions = {}): Promise<string | null> {
    const clipId = this.resolveClipId(actionId);
    if (!clipId) {
      this.lastError = `No Synra motion route for ${actionId}`;
      return null;
    }
    return this.playClip(clipId, options);
  }

  async playClip(clipId: string, options: PlayOptions = {}): Promise<string | null> {
    const runtime = this.clips.get(clipId);
    if (!runtime) {
      this.lastError = `Unknown Synra motion clip ${clipId}`;
      return null;
    }
    const clip = await this.loadClip(runtime);
    if (!clip || !this.mixer) return null;

    if (this.active?.action && (options.restart || this.active !== runtime)) {
      const fadeOut = Math.max(0.02, this.active.spec.fadeOut ?? 0.16);
      this.active.action.fadeOut(fadeOut);
    }

    const action = this.mixer.clipAction(clip);
    const shouldLoop = options.loop ?? runtime.spec.loop === true;
    action.reset();
    action.enabled = true;
    action.clampWhenFinished = false;
    action.setLoop(shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce, shouldLoop ? Infinity : 1);
    action.fadeIn(Math.max(0.02, runtime.spec.fadeIn ?? 0.12));
    action.play();
    runtime.action = action;
    this.active = runtime;
    this.activeReturnToIdle = options.returnToIdle === true && !shouldLoop;
    this.lastPlayedClipId = runtime.spec.id;
    this.lastError = null;
    return runtime.spec.id;
  }

  stop(): void {
    this.mixer?.stopAllAction();
    this.active = null;
  }

  private async loadManifest(url: string): Promise<void> {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Synra motion manifest failed to load: ${response.status}`);
    const manifest = (await response.json()) as SynraMotionManifest;
    this.manifest = manifest;
    this.clips.clear();
    for (const spec of manifest.clips) {
      this.clips.set(spec.id, { spec });
    }
  }

  private async preloadEssentials(): Promise<void> {
    await Promise.allSettled(
      ESSENTIAL_ACTIONS.map((action) => {
        const clipId = this.resolveClipId(action);
        const runtime = clipId ? this.clips.get(clipId) : null;
        return runtime ? this.loadClip(runtime) : Promise.resolve(null);
      })
    );
  }

  private async loadClip(runtime: RuntimeClip): Promise<THREE.AnimationClip | null> {
    if (runtime.clip) return runtime.clip;
    if (runtime.loading) return runtime.loading;
    const vrm = this.vrm;
    const generation = this.generation;
    if (!runtime.spec.url || !vrm) return null;

    runtime.loading = this.loader.loadAsync(runtime.spec.url)
      .then((gltf) => {
        if (generation !== this.generation || this.vrm !== vrm) return null;
        const animations = gltf.userData.vrmAnimations as VRMAnimation[] | undefined;
        const animation = animations?.[0];
        if (!animation) throw new Error(`No VRMA payload found in ${runtime.spec.url}`);
        const clip = createVRMAnimationClip(animation, vrm);
        clip.name = runtime.spec.id;
        runtime.clip = clip;
        runtime.failed = false;
        runtime.lastError = undefined;
        return clip;
      })
      .catch((error) => {
        runtime.failed = true;
        runtime.lastError = error instanceof Error ? error.message : String(error);
        this.lastError = `${runtime.spec.id}: ${runtime.lastError}`;
        console.warn(`Failed to load Synra motion clip "${runtime.spec.id}"`, error);
        return null;
      });

    return runtime.loading;
  }
}
