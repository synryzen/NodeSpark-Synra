import assert from "node:assert/strict";
import test from "node:test";

import {
  buildElectronCommandLineSwitches,
  buildKioskLaunchConfig,
  normalizeKioskEnv
} from "../dist/kiosk-config.js";

test("builds the default Jetson kiosk URL for the existing Synra app", () => {
  const config = buildKioskLaunchConfig(normalizeKioskEnv({}));
  assert.equal(config.url.origin, "http://127.0.0.1:5191");
  assert.equal(config.url.searchParams.get("profile"), "jetson");
  assert.equal(config.url.searchParams.get("mode"), "kiosk");
  assert.equal(config.url.searchParams.get("live"), "1");
  assert.equal(config.url.searchParams.get("telemetry"), "1");
  assert.equal(config.url.searchParams.get("quality"), "sharp");
  assert.equal(config.url.searchParams.get("fps"), "30");
  assert.equal(config.angleBackend, "vulkan");
  assert.equal(config.window.width, 1920);
  assert.equal(config.window.height, 1080);
});

test("honors performance and viewport overrides without dropping kiosk telemetry", () => {
  const config = buildKioskLaunchConfig(normalizeKioskEnv({
    SYNRA_KIOSK_FPS: "24",
    SYNRA_KIOSK_QUALITY: "performance",
    SYNRA_KIOSK_RENDER_SCALE: "0.75",
    SYNRA_KIOSK_MAX_RENDER_WIDTH: "1600",
    SYNRA_KIOSK_MAX_RENDER_HEIGHT: "900",
    SYNRA_KIOSK_AVATAR: "battle",
    SYNRA_KIOSK_WIDTH: "2560",
    SYNRA_KIOSK_HEIGHT: "1600"
  }));

  assert.equal(config.url.searchParams.get("fps"), "24");
  assert.equal(config.url.searchParams.get("quality"), "performance");
  assert.equal(config.url.searchParams.get("scale"), "0.75");
  assert.equal(config.url.searchParams.get("maxw"), "1600");
  assert.equal(config.url.searchParams.get("maxh"), "900");
  assert.equal(config.url.searchParams.get("avatar"), "battle");
  assert.equal(config.url.searchParams.get("telemetry"), "1");
  assert.equal(config.window.width, 2560);
  assert.equal(config.window.height, 1600);
});

test("builds GPU-focused Electron command line switches", () => {
  const switches = buildElectronCommandLineSwitches(buildKioskLaunchConfig(normalizeKioskEnv({
    SYNRA_KIOSK_ANGLE_BACKEND: "vulkan",
    SYNRA_KIOSK_GL_MODE: "egl",
    SYNRA_KIOSK_REMOTE_DEBUG: "true",
    SYNRA_KIOSK_DEBUG_PORT: "9333",
    SYNRA_KIOSK_OZONE_PLATFORM: "x11"
  })));

  assert.equal(switches.get("ignore-gpu-blocklist"), "");
  assert.equal(switches.get("no-sandbox"), "");
  assert.equal(switches.get("no-zygote"), "");
  assert.equal(switches.get("disable-setuid-sandbox"), "");
  assert.equal(switches.get("disable-gpu-sandbox"), "");
  assert.equal(switches.get("disable-dev-shm-usage"), "");
  assert.equal(switches.get("enable-webgl"), "");
  assert.equal(switches.get("enable-webgl2"), "");
  assert.equal(switches.get("use-angle"), "vulkan");
  assert.equal(switches.get("use-gl"), "egl");
  assert.equal(switches.get("remote-debugging-address"), "127.0.0.1");
  assert.equal(switches.get("remote-debugging-port"), "9333");
  assert.equal(switches.get("ozone-platform"), "x11");
  assert.match(switches.get("enable-features") || "", /VulkanFromANGLE/);
});
