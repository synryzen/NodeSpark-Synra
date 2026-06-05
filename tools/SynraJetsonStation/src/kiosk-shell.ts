import { app, BrowserWindow, Menu, powerSaveBlocker, session } from "electron";
import { createLogger } from "./logger.js";
import {
  buildElectronCommandLineSwitches,
  buildKioskLaunchConfig
} from "./kiosk-config.js";

const logger = createLogger("kiosk-shell");
const launchConfig = buildKioskLaunchConfig();
const switches = buildElectronCommandLineSwitches(launchConfig);

for (const [name, value] of switches) {
  app.commandLine.appendSwitch(name, value);
}

if (process.env.SYNRA_KIOSK_ENABLE_LOGGING === "true") {
  app.commandLine.appendSwitch("enable-logging", "stderr");
  app.commandLine.appendSwitch("v", "1");
}

let blockerId: number | null = null;

function installPermissionPolicy(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(Boolean(launchConfig.autoGrantMedia && permission === "media"));
  });
}

async function waitForSynraServer(): Promise<void> {
  const healthUrl = process.env.SYNRA_KIOSK_HEALTH_URL?.trim() || `${launchConfig.url.origin}/api/health`;
  const timeoutMs = Number(process.env.SYNRA_KIOSK_HEALTH_TIMEOUT_MS || "45000");
  const deadline = Date.now() + Math.max(1000, timeoutMs);
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl, { cache: "no-store" });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  logger.warn("Synra health endpoint was not ready before kiosk launch", { healthUrl, lastError });
}

function createWindow(): BrowserWindow {
  Menu.setApplicationMenu(null);

  const window = new BrowserWindow({
    width: launchConfig.window.width,
    height: launchConfig.window.height,
    fullscreen: launchConfig.window.fullscreen,
    kiosk: launchConfig.window.kiosk,
    alwaysOnTop: launchConfig.window.alwaysOnTop,
    backgroundColor: "#03060a",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webgl: true,
      spellcheck: false
    }
  });

  window.once("ready-to-show", () => {
    window.show();
    window.focus();
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    logger.error("Synra renderer process ended", details);
    if (!window.isDestroyed()) window.reload();
  });

  window.webContents.on("unresponsive", () => {
    logger.warn("Synra renderer became unresponsive");
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    logger.error("Synra failed to load", { errorCode, errorDescription, validatedURL });
  });

  void window.loadURL(launchConfig.url.toString());
  return window;
}

app.on("window-all-closed", () => {
  if (blockerId !== null) {
    powerSaveBlocker.stop(blockerId);
    blockerId = null;
  }
  app.quit();
});

app.whenReady()
  .then(async () => {
    blockerId = powerSaveBlocker.start("prevent-display-sleep");
    installPermissionPolicy();
    await waitForSynraServer();

    logger.info("Launching Synra Electron kiosk", {
      url: launchConfig.url.toString(),
      switches: Object.fromEntries(switches),
      gpuFeatureStatus: app.getGPUFeatureStatus()
    });

    createWindow();
  })
  .catch((error) => {
    logger.error("Failed to start Synra Electron kiosk", error);
    app.exit(1);
  });
