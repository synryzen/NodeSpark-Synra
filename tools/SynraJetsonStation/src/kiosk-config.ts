export type KioskEnv = Record<string, string | undefined>;

export interface KioskWindowConfig {
  width: number;
  height: number;
  fullscreen: boolean;
  kiosk: boolean;
  alwaysOnTop: boolean;
}

export interface KioskLaunchConfig {
  url: URL;
  remoteDebug: boolean;
  remoteDebugPort: number;
  autoGrantMedia: boolean;
  angleBackend: string;
  glMode: string;
  ozonePlatform: string | null;
  disableGpuRasterization: boolean;
  window: KioskWindowConfig;
}

export function normalizeKioskEnv(env: KioskEnv): KioskEnv {
  return { ...env };
}

function stringEnv(env: KioskEnv, name: string, fallback: string): string {
  const raw = env[name]?.trim();
  return raw && raw.length > 0 ? raw : fallback;
}

function nullableStringEnv(env: KioskEnv, name: string): string | null {
  const raw = env[name]?.trim();
  return raw && raw.length > 0 ? raw : null;
}

function boolEnv(env: KioskEnv, name: string, fallback = false): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function numberEnv(env: KioskEnv, name: string, fallback: number, min = 1): number {
  const raw = Number(env[name]);
  return Number.isFinite(raw) && raw >= min ? raw : fallback;
}

export function buildKioskLaunchConfig(env: KioskEnv = process.env): KioskLaunchConfig {
  const base = stringEnv(env, "SYNRA_STANDALONE_URL", "http://127.0.0.1:5191/");
  const url = new URL(base);
  const params = url.searchParams;

  params.set("profile", stringEnv(env, "SYNRA_KIOSK_PROFILE", "jetson"));
  params.set("mode", stringEnv(env, "SYNRA_KIOSK_MODE", "kiosk"));
  params.set("fps", stringEnv(env, "SYNRA_KIOSK_FPS", "30"));
  params.set("live", stringEnv(env, "SYNRA_KIOSK_LIVE", "1"));
  params.set("quality", stringEnv(env, "SYNRA_KIOSK_QUALITY", "sharp"));
  params.set("scale", stringEnv(env, "SYNRA_KIOSK_RENDER_SCALE", "1"));
  params.set("maxw", stringEnv(env, "SYNRA_KIOSK_MAX_RENDER_WIDTH", "2560"));
  params.set("maxh", stringEnv(env, "SYNRA_KIOSK_MAX_RENDER_HEIGHT", "1600"));
  params.set("avatar", stringEnv(env, "SYNRA_KIOSK_AVATAR", "code1"));
  params.set("telemetry", "1");

  return {
    url,
    remoteDebug: boolEnv(env, "SYNRA_KIOSK_REMOTE_DEBUG", false),
    remoteDebugPort: numberEnv(env, "SYNRA_KIOSK_DEBUG_PORT", 9222, 1),
    autoGrantMedia: boolEnv(env, "SYNRA_KIOSK_AUTO_GRANT_MEDIA", false),
    angleBackend: stringEnv(env, "SYNRA_KIOSK_ANGLE_BACKEND", "vulkan"),
    glMode: stringEnv(env, "SYNRA_KIOSK_GL_MODE", "none"),
    ozonePlatform: nullableStringEnv(env, "SYNRA_KIOSK_OZONE_PLATFORM"),
    disableGpuRasterization: boolEnv(env, "SYNRA_KIOSK_DISABLE_GPU_RASTERIZATION", false),
    window: {
      width: numberEnv(env, "SYNRA_KIOSK_WIDTH", 1920, 320),
      height: numberEnv(env, "SYNRA_KIOSK_HEIGHT", 1080, 240),
      fullscreen: boolEnv(env, "SYNRA_KIOSK_FULLSCREEN", true),
      kiosk: boolEnv(env, "SYNRA_KIOSK_NATIVE_KIOSK", true),
      alwaysOnTop: boolEnv(env, "SYNRA_KIOSK_ALWAYS_ON_TOP", false)
    }
  };
}

export function buildElectronCommandLineSwitches(config: KioskLaunchConfig): Map<string, string> {
  const switches = new Map<string, string>();

  switches.set("ignore-gpu-blocklist", "");
  switches.set("no-sandbox", "");
  switches.set("no-zygote", "");
  switches.set("disable-setuid-sandbox", "");
  switches.set("disable-gpu-sandbox", "");
  switches.set("disable-dev-shm-usage", "");
  switches.set("enable-gpu", "");
  switches.set("enable-webgl", "");
  switches.set("enable-webgl2", "");
  switches.set("enable-accelerated-video-decode", "");
  switches.set("autoplay-policy", "no-user-gesture-required");
  switches.set("disable-background-timer-throttling", "");
  switches.set("disable-renderer-backgrounding", "");
  switches.set("disable-features", "TranslateUI,MediaRouter");

  if (config.disableGpuRasterization) {
    switches.set("disable-gpu-rasterization", "");
  } else {
    switches.set("enable-gpu-rasterization", "");
  }

  if (config.angleBackend !== "none") {
    switches.set("use-angle", config.angleBackend);
    if (config.angleBackend === "vulkan") {
      switches.set("enable-features", "Vulkan,DefaultANGLEVulkan,VulkanFromANGLE");
      switches.set("disable-gpu-driver-bug-workarounds", "");
    }
  }

  if (config.glMode !== "none") {
    switches.set("use-gl", config.glMode);
  }

  if (config.ozonePlatform) {
    switches.set("ozone-platform", config.ozonePlatform);
  }

  if (config.remoteDebug) {
    switches.set("remote-debugging-address", "127.0.0.1");
    switches.set("remote-debugging-port", String(config.remoteDebugPort));
  }

  if (config.autoGrantMedia) {
    switches.set("use-fake-ui-for-media-stream", "");
  }

  return switches;
}
