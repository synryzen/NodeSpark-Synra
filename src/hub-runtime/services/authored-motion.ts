import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { type VRM } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip, type VRMAnimation } from "@pixiv/three-vrm-animation";
import type { SynraActionName } from "../types/avatar";

export type SynraMotionChannel = "base" | "gesture" | "gaze" | "face" | "lipsync" | "procedural_life";
export type SynraMotionMask = "fullBody" | "upperBody" | "headOnly" | "faceOnly" | "gazeOnly";
export type SynraMotionQuality = "draft" | "ready" | "approved";

export interface SynraMotionClipSpec {
  id: string;
  label: string;
  url?: string;
  actionIds?: string[];
  aliases?: string[];
  channel?: SynraMotionChannel;
  mask?: SynraMotionMask;
  loop?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  priority?: number;
  status?: "needed" | "draft" | "ready";
  quality?: SynraMotionQuality;
  visualQaApprovedAt?: string | null;
  fallback?: string | null;
  notes?: string;
  localInstalled?: boolean;
}

export interface SynraMotionManifest {
  version: number;
  description?: string;
  clips: SynraMotionClipSpec[];
  routes: Partial<Record<SynraActionName | string, string>>;
}

export interface SynraResolvedMotionRoute {
  action: string;
  clipId: string | null;
  channel: SynraMotionChannel | null;
  mask: SynraMotionMask | null;
  quality: SynraMotionQuality | string | null;
  visualQaApprovedAt: string | null;
  fallback: string | null;
  notes: string | null;
  failed: boolean;
  playable: boolean;
}

export type SynraMotionTrackPresence = {
  torso: boolean;
  hips: boolean;
  legs: boolean;
  arms: boolean;
  head: boolean;
  expression: boolean;
  gaze: boolean;
};

type ClipRuntime = {
  spec: SynraMotionClipSpec;
  clip?: THREE.AnimationClip;
  unmaskedClip?: THREE.AnimationClip;
  action?: THREE.AnimationAction;
  loading?: Promise<THREE.AnimationClip | null>;
  unmaskedLoading?: Promise<THREE.AnimationClip | null>;
  failed?: boolean;
  fadingOut?: boolean;
  reference?: boolean;
  localInstalledFullBody?: boolean;
  loadedUrl?: string;
  durationSeconds?: number | null;
  originalTrackCount?: number | null;
  trackCount?: number | null;
  trackNames?: string[];
  maskApplied?: boolean;
  rootHipsLegsAllowed?: boolean;
  lastError?: string | null;
  playbackSpeed?: number;
  expectedEndAtMs?: number | null;
};

type PlayOptions = {
  priority?: number;
  holdMs?: number;
  fadeIn?: number;
  channel?: SynraMotionChannel;
  unmasked?: boolean;
  reference?: boolean;
  localInstalledFullBody?: boolean;
  resetAllChannels?: boolean;
};

type ManifestLoadAttempt = {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
};

const AUTHORED_ACTION_SPEED = 1;
const AUTHORED_LOOP_SPEED = 1;

export class SynraAuthoredMotionPlayer {
  private readonly loader = new GLTFLoader();
  private vrm: VRM | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private manifest: SynraMotionManifest | null = null;
  private readonly clips = new Map<string, ClipRuntime>();
  private readonly activeByChannel = new Map<SynraMotionChannel, ClipRuntime>();
  private readonly activeStartedAtByChannel = new Map<SynraMotionChannel, number>();
  private readonly protectedByChannel = new Map<SynraMotionChannel, { priority: number; until: number }>();
  private readonly playSerialByChannel = new Map<SynraMotionChannel, number>();
  private lastAttemptedRuntime: ClipRuntime | null = null;
  private lastTransition: Record<string, unknown> | null = null;
  private manifestUrl: string | null = null;
  private manifestClipCount = 0;
  private manifestRouteCount = 0;
  private manifestLoadError: string | null = null;
  private manifestLoadAttempts: ManifestLoadAttempt[] = [];
  private enabled = true;

  constructor() {
    this.loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  }

  get isReady(): boolean {
    return Boolean(this.manifest);
  }

  get isPlaying(): boolean {
    for (const runtime of this.activeByChannel.values()) {
      if (runtime.action && (runtime.spec.loop === true || runtime.action.isRunning())) return true;
    }
    return false;
  }

  get activeClipId(): string | null {
    return this.activeByChannel.get("gesture")?.spec.id
      ?? this.activeByChannel.get("gaze")?.spec.id
      ?? this.activeByChannel.get("base")?.spec.id
      ?? null;
  }

  get isReferencePlaying(): boolean {
    for (const runtime of this.activeByChannel.values()) {
      if (runtime.reference && runtime.action?.isRunning()) return true;
    }
    return false;
  }

  get referenceClipId(): string | null {
    for (const runtime of this.activeByChannel.values()) {
      if (runtime.reference && runtime.action?.isRunning()) return runtime.spec.id;
    }
    return null;
  }

  get isLocalInstalledFullBodyPlaying(): boolean {
    for (const runtime of this.activeByChannel.values()) {
      if (runtime.localInstalledFullBody && runtime.action && (runtime.action.isRunning() || runtime.action.enabled)) return true;
    }
    return false;
  }

  get activeProgress(): number {
    const runtime = this.activeByChannel.get("gesture")
      ?? this.activeByChannel.get("gaze")
      ?? this.activeByChannel.get("base");
    return this.progressFor(runtime);
  }

  activeClipIdForChannel(channel: SynraMotionChannel): string | null {
    return this.activeByChannel.get(channel)?.spec.id ?? null;
  }

  activeProgressForChannel(channel: SynraMotionChannel): number {
    return this.progressFor(this.activeByChannel.get(channel));
  }

  get hasManifest(): boolean {
    return Boolean(this.manifest);
  }

  async boot(vrm: VRM, manifestUrl = "./motions/synra-motion-manifest.json"): Promise<void> {
    this.vrm = vrm;
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    await this.loadManifest(manifestUrl);
  }

  update(delta: number): void {
    if (!this.enabled || !this.mixer) return;
    this.mixer.update(delta);

    for (const [channel, runtime] of [...this.activeByChannel]) {
      const fullBodySinglePlay = runtime.localInstalledFullBody === true || runtime.reference === true;
      const effectiveLoop = runtime.spec.loop === true && !fullBodySinglePlay;
      if (!runtime.action || effectiveLoop) continue;

      const action = runtime.action;
      const duration = Math.max(0.0001, action.getClip().duration);
      const fadeOut = fullBodySinglePlay ? 0 : Math.max(0.02, runtime.spec.fadeOut ?? 0.18);
      const now = performance.now();
      const startedAt = this.activeStartedAtByChannel.get(channel) ?? now;
      const playbackSpeed = Math.max(0.0001, runtime.playbackSpeed ?? AUTHORED_ACTION_SPEED);
      const expectedEndAt = runtime.expectedEndAtMs ?? (startedAt + (duration * 1000) / playbackSpeed);
      const reachedClipEnd = action.time >= duration - 0.005;
      const reachedExpectedEnd = now >= expectedEndAt + 80;

      if (!fullBodySinglePlay && !runtime.fadingOut && action.time >= Math.max(0, duration - fadeOut)) {
        runtime.fadingOut = true;
        action.fadeOut(fadeOut);
      }

      const stoppedAfterExpectedEnd = !action.isRunning() && now >= expectedEndAt - 10;
      if (reachedClipEnd || reachedExpectedEnd || stoppedAfterExpectedEnd) {
        action.stop();
        action.enabled = false;
        runtime.fadingOut = false;
        runtime.expectedEndAtMs = null;
        this.activeByChannel.delete(channel);
        this.activeStartedAtByChannel.delete(channel);
        const protectedState = this.protectedByChannel.get(channel);
        if (protectedState && performance.now() >= protectedState.until) this.protectedByChannel.delete(channel);
      }
    }
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    if (this.vrm) this.mixer?.uncacheRoot(this.vrm.scene);
    this.mixer = null;
    this.activeByChannel.clear();
    this.activeStartedAtByChannel.clear();
    this.protectedByChannel.clear();
    this.playSerialByChannel.clear();
  }

  stop(channel?: SynraMotionChannel): void {
    if (!channel) {
      this.mixer?.stopAllAction();
      this.activeByChannel.clear();
      this.activeStartedAtByChannel.clear();
      this.protectedByChannel.clear();
      this.playSerialByChannel.clear();
      return;
    }

    const runtime = this.activeByChannel.get(channel);
    if (runtime?.action) {
      runtime.action.stop();
      runtime.action.enabled = false;
      runtime.expectedEndAtMs = null;
    }
    this.activeByChannel.delete(channel);
    this.activeStartedAtByChannel.delete(channel);
    this.protectedByChannel.delete(channel);
    this.playSerialByChannel.set(channel, (this.playSerialByChannel.get(channel) ?? 0) + 1);
  }

  stopChannel(channel: SynraMotionChannel): void {
    this.stop(channel);
  }

  stopAllExcept(channelToKeep: SynraMotionChannel): void {
    for (const channel of [...this.activeByChannel.keys()]) {
      if (channel !== channelToKeep) this.stop(channel);
    }
  }

  hasRoute(action: SynraActionName | string): boolean {
    return Boolean(this.resolveClip(action));
  }

  hasPlayableRoute(action: SynraActionName | string): boolean {
    const runtime = this.resolveClip(action);
    return Boolean(runtime?.spec.url && !runtime.failed);
  }

  resolveClipId(action: SynraActionName | string): string | null {
    return this.resolveClip(action)?.spec.id ?? null;
  }

  resolveRouteInfo(action: SynraActionName | string): SynraResolvedMotionRoute {
    const runtime = this.resolveClip(action);
    if (!runtime) {
      return {
        action: String(action),
        clipId: null,
        channel: null,
        mask: null,
        quality: null,
        visualQaApprovedAt: null,
        fallback: null,
        notes: null,
        failed: false,
        playable: false
      };
    }
    return {
      action: String(action),
      clipId: runtime.spec.id,
      channel: this.channelForSpec(runtime.spec),
      mask: runtime.spec.mask ?? null,
      quality: runtime.spec.quality ?? runtime.spec.status ?? null,
      visualQaApprovedAt: runtime.spec.visualQaApprovedAt ?? null,
      fallback: runtime.spec.fallback ?? null,
      notes: runtime.spec.notes ?? null,
      failed: runtime.failed === true,
      playable: Boolean(runtime.spec.url && !runtime.failed)
    };
  }

  resolveLocalInstalledRouteInfo(action: SynraActionName | string): (SynraResolvedMotionRoute & { url: string | null; localInstalled: boolean }) | null {
    const runtime = this.resolveClip(action);
    if (!runtime || !this.isLocalInstalledRuntime(runtime)) return null;
    const route = this.resolveRouteInfo(action);
    return {
      ...route,
      url: runtime.spec.url ?? null,
      localInstalled: true
    };
  }

  isActiveRoute(action: SynraActionName | string): boolean {
    const runtime = this.resolveClip(action);
    if (!runtime) return false;
    const channel = this.channelForSpec(runtime.spec);
    return Boolean(this.activeByChannel.get(channel)?.spec.id === runtime.spec.id && this.isChannelPlaying(channel));
  }

  async play(action: SynraActionName | string, options: PlayOptions = {}): Promise<boolean> {
    const runtime = this.resolveClip(action);
    return this.playRuntime(runtime, options);
  }

  async playClipId(clipId: string, options: PlayOptions = {}): Promise<boolean> {
    const runtime = this.clips.get(clipId) || null;
    return this.playRuntime(runtime, options);
  }

  async playLocalInstalledActionFullBody(action: SynraActionName | string, options: PlayOptions = {}): Promise<boolean> {
    const runtime = this.resolveClip(action);
    if (!runtime || !this.isLocalInstalledRuntime(runtime)) return false;
    return this.playRuntime(runtime, {
      ...options,
      channel: "base",
      unmasked: true,
      resetAllChannels: true,
      localInstalledFullBody: true,
      priority: options.priority ?? 998,
      holdMs: options.holdMs ?? 0,
      fadeIn: options.fadeIn ?? 0.14
    });
  }

  async playLocalInstalledClipFullBody(clipId: string, options: PlayOptions = {}): Promise<boolean> {
    const runtime = this.clips.get(clipId) || null;
    if (!runtime || !this.isLocalInstalledRuntime(runtime)) return false;
    return this.playRuntime(runtime, {
      ...options,
      channel: "base",
      unmasked: true,
      resetAllChannels: true,
      localInstalledFullBody: true,
      priority: options.priority ?? 998,
      holdMs: options.holdMs ?? 0,
      fadeIn: options.fadeIn ?? 0.14
    });
  }

  async playReferenceByUrl(id: string, url: string, options: PlayOptions = {}): Promise<boolean> {
    const runtime: ClipRuntime = {
      reference: true,
      spec: {
        id,
        label: "Reference full-body VRMA",
        url,
        actionIds: [id],
        channel: "base",
        mask: "fullBody",
        loop: false,
        fadeIn: 0.08,
        fadeOut: 0.12,
        priority: 999,
        quality: "draft",
        visualQaApprovedAt: null,
        fallback: null,
        notes: "External known-good VRMA reference slot. This must not use generated Synra draft clips."
      }
    };
    this.clips.set(id, runtime);
    return this.playRuntime(runtime, {
      ...options,
      channel: "base",
      unmasked: true,
      reference: true,
      resetAllChannels: true,
      priority: options.priority ?? 999,
      holdMs: options.holdMs ?? 0,
      fadeIn: options.fadeIn ?? 0.14
    });
  }

  async playRuntime(runtime: ClipRuntime | null, options: PlayOptions = {}): Promise<boolean> {
    if (!this.enabled || !this.mixer || !this.vrm) return false;

    if (!runtime?.spec.url || runtime.failed) return false;
    this.lastAttemptedRuntime = runtime;
    const channel = options.channel ?? this.channelForSpec(runtime.spec);
    runtime.reference = options.reference === true || runtime.reference === true;
    runtime.localInstalledFullBody = options.localInstalledFullBody === true || runtime.localInstalledFullBody === true;

    if (options.resetAllChannels) this.stopAllExcept(channel);
    const now = performance.now();
    const protectedState = this.protectedByChannel.get(channel) ?? { priority: 0, until: 0 };
    if (protectedState.until > 0 && now >= protectedState.until) {
      protectedState.priority = 0;
      protectedState.until = 0;
    }

    const priority = options.priority ?? runtime.spec.priority ?? 0;
    if (priority < protectedState.priority && now < protectedState.until) return false;
    if (priority >= protectedState.priority) {
      protectedState.priority = priority;
      protectedState.until = now + (options.holdMs ?? 0);
      this.protectedByChannel.set(channel, protectedState);
    }

    const serial = (this.playSerialByChannel.get(channel) ?? 0) + 1;
    this.playSerialByChannel.set(channel, serial);
    const clip = options.unmasked ? runtime.unmaskedClip ?? await this.loadClip(runtime, true) : runtime.clip ?? await this.loadClip(runtime, false);
    if (!clip) return false;
    if (serial !== this.playSerialByChannel.get(channel)) return false;

    const next = runtime.action ?? this.mixer.clipAction(clip);
    runtime.action = next;
    runtime.fadingOut = false;

    const previousRuntime = this.activeByChannel.get(channel);
    const previous = previousRuntime?.action && previousRuntime.action !== next ? previousRuntime.action : null;
    if (channel === "base") this.vrm.humanoid.resetNormalizedPose();
    next.enabled = true;
    next.paused = false;
    const fullBodySinglePlay = runtime.localInstalledFullBody === true || runtime.reference === true;
    const shouldLoop = runtime.spec.loop === true && !fullBodySinglePlay;
    next.clampWhenFinished = fullBodySinglePlay;
    next.loop = shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce;
    next.repetitions = shouldLoop ? Infinity : 1;
    next.zeroSlopeAtStart = true;
    next.zeroSlopeAtEnd = true;
    next.setEffectiveWeight(1);
    const playbackSpeed = shouldLoop ? AUTHORED_LOOP_SPEED : AUTHORED_ACTION_SPEED;
    runtime.playbackSpeed = playbackSpeed;
    next.setEffectiveTimeScale(playbackSpeed);
    next.reset();

    const fadeIn = Math.min(options.fadeIn ?? runtime.spec.fadeIn ?? 0.18, shouldLoop ? 0.2 : 0.14);
    if (previous) {
      if (previousRuntime) previousRuntime.fadingOut = true;
      next.play();
      previous.crossFadeTo(next, Math.max(0.08, fadeIn), true);
      this.lastTransition = {
        at: new Date().toISOString(),
        channel,
        fromClipId: previousRuntime?.spec.id ?? null,
        toClipId: runtime.spec.id,
        fadeInSeconds: Math.max(0.08, fadeIn),
        resetAuxiliaryChannels: options.resetAllChannels === true,
        crossfade: true
      };
    } else {
      next.fadeIn(fadeIn).play();
      this.lastTransition = {
        at: new Date().toISOString(),
        channel,
        fromClipId: null,
        toClipId: runtime.spec.id,
        fadeInSeconds: fadeIn,
        resetAuxiliaryChannels: options.resetAllChannels === true,
        crossfade: false
      };
    }
    this.activeByChannel.set(channel, runtime);
    const activeStartedAt = performance.now();
    this.activeStartedAtByChannel.set(channel, activeStartedAt);

    const durationMs = shouldLoop ? 0 : Math.max(0, (next.getClip().duration * 1000) / playbackSpeed);
    runtime.expectedEndAtMs = shouldLoop ? null : activeStartedAt + durationMs;
    if (priority > 0) {
      protectedState.priority = priority;
      protectedState.until = Math.max(
        protectedState.until,
        activeStartedAt + durationMs + (runtime.spec.fadeOut ?? 0.18) * 1000
      );
      this.protectedByChannel.set(channel, protectedState);
    } else if (performance.now() >= protectedState.until) {
      this.protectedByChannel.delete(channel);
    }
    return true;
  }

  debugState(): Record<string, unknown> {
    const channels: Partial<Record<SynraMotionChannel, Record<string, unknown>>> = {};
    for (const channel of ["base", "gesture", "gaze", "face", "lipsync", "procedural_life"] as SynraMotionChannel[]) {
      const runtime = this.activeByChannel.get(channel);
      if (!runtime) continue;
      channels[channel] = {
        clipId: runtime.spec.id,
        clipUrl: runtime.loadedUrl ?? runtime.spec.url ?? null,
        actionIds: runtime.spec.actionIds ?? [],
        loop: runtime.spec.loop === true,
        effectiveLoop: runtime.spec.loop === true && runtime.localInstalledFullBody !== true && runtime.reference !== true,
        channel: runtime.spec.channel ?? channel,
        mask: runtime.spec.mask ?? null,
        quality: runtime.spec.quality ?? runtime.spec.status ?? null,
        progress: this.progressFor(runtime),
        isRunning: runtime.action?.isRunning() ?? false,
        durationSeconds: runtime.durationSeconds ?? runtime.action?.getClip().duration ?? null,
        trackCount: runtime.trackCount ?? runtime.action?.getClip().tracks.length ?? null,
        originalTrackCount: runtime.originalTrackCount ?? null,
        first30TrackNames: (runtime.trackNames ?? runtime.action?.getClip().tracks.map((track) => track.name) ?? []).slice(0, 30),
        trackPresence: this.trackPresenceFor(runtime.trackNames ?? runtime.action?.getClip().tracks.map((track) => track.name) ?? []),
        actionTime: runtime.action?.time ?? null,
        actionWeight: runtime.action?.getEffectiveWeight() ?? null,
        actionLoopMode: runtime.action?.loop ?? null,
        clampWhenFinished: runtime.action?.clampWhenFinished ?? null,
        playbackSpeed: runtime.playbackSpeed ?? null,
        expectedEndAtMs: runtime.expectedEndAtMs ?? null,
        mixerActive: Boolean(this.mixer),
        maskApplied: runtime.maskApplied === true,
        rootHipsLegsAllowed: runtime.rootHipsLegsAllowed === true,
        reference: runtime.reference === true,
        localInstalledFullBody: runtime.localInstalledFullBody === true,
        lastError: runtime.lastError ?? null
      };
    }

    return {
      manifestLoaded: this.hasManifest,
      manifestUrl: this.manifestUrl,
      manifestClipCount: this.manifestClipCount,
      manifestRouteCount: this.manifestRouteCount,
      manifestLoadError: this.manifestLoadError,
      manifestLoadAttempts: this.manifestLoadAttempts.slice(-6),
      activeClipId: this.activeClipId,
      activeProgress: this.activeProgress,
      lastTransition: this.lastTransition,
      referencePlaying: this.isReferencePlaying,
      referenceClipId: this.referenceClipId,
      lastAttempted: this.debugForRuntime(this.lastAttemptedRuntime),
      channels
    };
  }

  private async loadManifest(url: string): Promise<void> {
    this.manifest = null;
    this.manifestUrl = null;
    this.manifestClipCount = 0;
    this.manifestRouteCount = 0;
    this.manifestLoadError = null;
    this.manifestLoadAttempts = [];

    for (const candidateUrl of this.manifestUrlCandidates(url)) {
      try {
        const response = await fetch(candidateUrl, { cache: "no-store" });
        if (!response.ok) {
          this.manifestLoadAttempts.push({ url: candidateUrl, ok: false, status: response.status });
          continue;
        }

        const manifest = await response.json() as SynraMotionManifest;
        if (!Array.isArray(manifest.clips) || !manifest.routes || typeof manifest.routes !== "object") {
          throw new Error("Motion manifest is missing clips or routes.");
        }

        this.manifest = manifest;
        this.manifestUrl = response.url || candidateUrl;
        this.manifestClipCount = manifest.clips.length;
        this.manifestRouteCount = Object.keys(manifest.routes).length;
        this.manifestLoadError = null;
        this.manifestLoadAttempts.push({ url: candidateUrl, ok: true, status: response.status });
        this.clips.clear();
        for (const spec of manifest.clips || []) {
          const runtime = { spec };
          this.clips.set(spec.id, runtime);
          for (const alias of spec.aliases || []) {
            this.clips.set(alias, runtime);
          }
          for (const actionId of spec.actionIds || []) {
            this.clips.set(actionId, runtime);
          }
        }
        void this.preloadEssentialClips();
        return;
      } catch (error) {
        const message = String((error as Error).message || error);
        this.manifestLoadAttempts.push({ url: candidateUrl, ok: false, error: message });
        this.manifestLoadError = message;
      }
    }

    this.manifestLoadError = this.manifestLoadError ?? "Motion manifest could not be loaded from any runtime URL.";
    console.warn("Synra authored motion manifest unavailable", {
      requestedUrl: url,
      attempts: this.manifestLoadAttempts
    });
  }

  private manifestUrlCandidates(url: string): string[] {
    const candidates = [url, "motions/synra-motion-manifest.json", "./motions/synra-motion-manifest.json"];
    const assetRelativeManifestPath = "../motions/synra-motion-manifest.json";
    const assetRelativeManifestUrl = new URL(assetRelativeManifestPath, import.meta.url).toString();
    candidates.push(assetRelativeManifestUrl);
    if (typeof document !== "undefined") {
      const base = document.baseURI || (typeof window !== "undefined" ? window.location.href : "");
      if (base) {
        try {
          candidates.push(new URL(url, base).toString());
          candidates.push(new URL("motions/synra-motion-manifest.json", base).toString());
          candidates.push(new URL("./motions/synra-motion-manifest.json", base).toString());
        } catch {
          // Keep relative fallbacks above when the current document URL cannot construct absolute URLs.
        }
      }
    }
    if (typeof window !== "undefined" && window.location.origin && window.location.origin !== "null") {
      candidates.push(`${window.location.origin}/motions/synra-motion-manifest.json`);
    }
    return [...new Set(candidates)];
  }

  private resolveClip(action: SynraActionName | string): ClipRuntime | null {
    if (!this.manifest) return null;
    const route = this.manifest.routes[action] || action;
    return this.clips.get(route) || null;
  }

  private isLocalInstalledRuntime(runtime: ClipRuntime): boolean {
    const url = runtime.spec.url ?? "";
    return runtime.spec.localInstalled === true
      || runtime.spec.id.startsWith("Local_")
      || url.includes("/motions/local-vendor/")
      || url.includes("motions/local-vendor/");
  }

  private async loadClip(runtime: ClipRuntime, unmasked: boolean): Promise<THREE.AnimationClip | null> {
    if (!this.vrm || !runtime.spec.url) return null;
    if (unmasked && runtime.unmaskedLoading) return runtime.unmaskedLoading;
    if (!unmasked && runtime.loading) return runtime.loading;

    const loading = this.loader.loadAsync(runtime.spec.url)
      .then((gltf) => {
        const animations = gltf.userData.vrmAnimations as VRMAnimation[] | undefined;
        const animation = animations?.[0];
        if (!animation) throw new Error(`No VRM Animation payload found in ${runtime.spec.url}`);
        const clip = createVRMAnimationClip(animation, this.vrm!);
        clip.name = runtime.spec.id;
        runtime.loadedUrl = runtime.spec.url;
        runtime.originalTrackCount = clip.tracks.length;
        runtime.trackNames = clip.tracks.map((track) => track.name);
        runtime.rootHipsLegsAllowed = unmasked || runtime.spec.mask === "fullBody" || !runtime.spec.mask;
        runtime.maskApplied = unmasked ? false : this.applyTrackMask(clip, runtime.spec);
        runtime.trackCount = clip.tracks.length;
        runtime.durationSeconds = clip.duration;
        runtime.lastError = null;
        if (unmasked) runtime.unmaskedClip = clip;
        else runtime.clip = clip;
        return clip;
      })
      .catch((error) => {
        runtime.failed = true;
        runtime.lastError = String((error as Error).message || error);
        console.warn(`Failed to load Synra motion clip "${runtime.spec.id}"`, error);
        return null;
      });

    if (unmasked) runtime.unmaskedLoading = loading;
    else runtime.loading = loading;
    return loading;
  }

  private async preloadEssentialClips(): Promise<void> {
    if (!this.manifest) return;
    const routeKeys = [
      "mode:idle",
      "mode:listening",
      "mode:thinking",
      "mode:speaking",
      "wave",
      "wave_big",
      "wave_shy",
      "nod_yes",
      "shake_no",
      "look_left",
      "look_right",
      "look_up",
      "look_down",
      "point",
      "point_left",
      "point_right",
      "explain",
      "present",
      "look_camera",
      "look_screen",
      "confused",
      "confirm",
      "compare"
    ];
    const runtimes = new Set<ClipRuntime>();
    for (const route of routeKeys) {
      const runtime = this.resolveClip(route);
      if (runtime?.spec.url && !runtime.failed) runtimes.add(runtime);
    }
    await Promise.allSettled([...runtimes].map((runtime) => this.loadClip(runtime, false)));
  }

  private channelForSpec(spec: SynraMotionClipSpec): SynraMotionChannel {
    if (spec.channel) return spec.channel;
    if (spec.loop) return "base";
    if (spec.id.startsWith("Look_")) return "gaze";
    return "gesture";
  }

  private applyTrackMask(clip: THREE.AnimationClip, spec: SynraMotionClipSpec): boolean {
    if (!spec.mask || spec.mask === "fullBody") return false;
    const originalTracks = clip.tracks;
    const filteredTracks = originalTracks.filter((track) => this.trackAllowedForMask(track.name, spec.mask!));
    if (filteredTracks.length === 0) {
      console.warn(`Synra motion clip "${spec.id}" mask "${spec.mask}" matched no tracks; using unfiltered clip.`);
      return false;
    }
    clip.tracks = filteredTracks;
    clip.resetDuration();
    return filteredTracks.length !== originalTracks.length;
  }

  private trackAllowedForMask(trackName: string, mask: SynraMotionMask): boolean {
    const name = trackName.toLowerCase();
    const isFaceTrack =
      name.includes("expression") ||
      name.includes("blendshape") ||
      name.includes("morph") ||
      name.includes("fcl_") ||
      name.includes("mouth") ||
      name.includes("blink");
    const isHeadTrack =
      name.includes("head") ||
      name.includes("neck") ||
      name.includes("eye") ||
      name.includes("lookat") ||
      name.includes("look_at");
    const isUpperBodyTrack =
      isHeadTrack ||
      isFaceTrack ||
      name.includes("spine") ||
      name.includes("chest") ||
      name.includes("shoulder") ||
      name.includes("upperarm") ||
      name.includes("lowerarm") ||
      name.includes("hand") ||
      name.includes("thumb") ||
      name.includes("index") ||
      name.includes("middle") ||
      name.includes("ring") ||
      name.includes("little");

    if (mask === "upperBody") return isUpperBodyTrack;
    if (mask === "headOnly" || mask === "gazeOnly") return isHeadTrack;
    if (mask === "faceOnly") return isFaceTrack;
    return true;
  }

  private isChannelPlaying(channel: SynraMotionChannel): boolean {
    const runtime = this.activeByChannel.get(channel);
    if (!runtime?.action) return false;
    return runtime.spec.loop === true || runtime.action.isRunning();
  }

  private progressFor(runtime?: ClipRuntime | null): number {
    if (!runtime?.action) return 0;
    const duration = Math.max(0.0001, runtime.action.getClip().duration);
    return THREE.MathUtils.clamp(runtime.action.time / duration, 0, 1);
  }

  private debugForRuntime(runtime: ClipRuntime | null): Record<string, unknown> | null {
    if (!runtime) return null;
    return {
      clipId: runtime.spec.id,
      clipUrl: runtime.loadedUrl ?? runtime.spec.url ?? null,
      durationSeconds: runtime.durationSeconds ?? runtime.action?.getClip().duration ?? null,
      trackCount: runtime.trackCount ?? runtime.action?.getClip().tracks.length ?? null,
      originalTrackCount: runtime.originalTrackCount ?? null,
      first30TrackNames: (runtime.trackNames ?? runtime.action?.getClip().tracks.map((track) => track.name) ?? []).slice(0, 30),
      trackPresence: this.trackPresenceFor(runtime.trackNames ?? runtime.action?.getClip().tracks.map((track) => track.name) ?? []),
      actionRunning: runtime.action?.isRunning() ?? false,
      actionTime: runtime.action?.time ?? null,
      actionWeight: runtime.action?.getEffectiveWeight() ?? null,
      actionLoopMode: runtime.action?.loop ?? null,
      clampWhenFinished: runtime.action?.clampWhenFinished ?? null,
      playbackSpeed: runtime.playbackSpeed ?? null,
      expectedEndAtMs: runtime.expectedEndAtMs ?? null,
      maskApplied: runtime.maskApplied === true,
      rootHipsLegsAllowed: runtime.rootHipsLegsAllowed === true,
      reference: runtime.reference === true,
      localInstalledFullBody: runtime.localInstalledFullBody === true,
      failed: runtime.failed === true,
      lastError: runtime.lastError ?? null
    };
  }

  private trackPresenceFor(trackNames: string[]): SynraMotionTrackPresence {
    const names = trackNames.map((track) => track.toLowerCase());
    const has = (patterns: RegExp[]) => names.some((name) => patterns.some((pattern) => pattern.test(name)));
    return {
      torso: has([/spine/, /chest/, /upperchest/]),
      hips: has([/hips/, /root/]),
      legs: has([/upperleg/, /lowerleg/, /foot/, /toe/]),
      arms: has([/shoulder/, /upperarm/, /lowerarm/, /hand/, /thumb/, /index/, /middle/, /ring/, /little/]),
      head: has([/head/, /neck/]),
      expression: has([/expression/, /blendshape/, /morph/, /fcl_/, /mouth/, /blink/, /\.weight$/]),
      gaze: has([/lookat/, /look_at/, /lookleft/, /lookright/, /lookup/, /lookdown/, /eye/])
    };
  }
}
