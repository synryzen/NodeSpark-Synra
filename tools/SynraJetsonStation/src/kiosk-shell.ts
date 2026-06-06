import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, Menu, powerSaveBlocker, session } from "electron";
import { createLogger } from "./logger.js";
import {
  buildElectronCommandLineSwitches,
  buildKioskLaunchConfig,
  type KioskWindowMode
} from "./kiosk-config.js";

const logger = createLogger("kiosk-shell");
const moduleDir = dirname(fileURLToPath(import.meta.url));
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
let mainWindow: BrowserWindow | null = null;
let currentWindowMode: KioskWindowMode = launchConfig.window.windowMode;

function installPermissionPolicy(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(Boolean(launchConfig.autoGrantMedia && permission === "media"));
  });
}

function windowModeStatePath(): string {
  return join(app.getPath("userData"), "synra-kiosk-window.json");
}

function normalizeWindowMode(value: unknown): KioskWindowMode {
  return value === "windowed" ? "windowed" : "fullscreen";
}

function readPersistedWindowMode(): KioskWindowMode | null {
  const path = windowModeStatePath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { windowMode?: unknown };
    return normalizeWindowMode(parsed.windowMode);
  } catch (error) {
    logger.warn("Unable to read persisted kiosk window mode", error);
    return null;
  }
}

function writePersistedWindowMode(windowMode: KioskWindowMode): void {
  try {
    writeFileSync(windowModeStatePath(), JSON.stringify({ windowMode }, null, 2));
  } catch (error) {
    logger.warn("Unable to persist kiosk window mode", error);
  }
}

function applyWindowMode(window: BrowserWindow, windowMode: KioskWindowMode, persist = true): KioskWindowMode {
  currentWindowMode = windowMode;
  if (persist) writePersistedWindowMode(windowMode);

  if (windowMode === "windowed") {
    window.setKiosk(false);
    window.setFullScreen(false);
    window.setAlwaysOnTop(false);
    window.setResizable(true);
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return currentWindowMode;
  }

  window.setResizable(false);
  window.setAlwaysOnTop(launchConfig.window.alwaysOnTop);
  window.setFullScreen(true);
  window.setKiosk(launchConfig.window.kiosk);
  window.focus();
  return currentWindowMode;
}

function installKioskWindowIpc(): void {
  ipcMain.handle("synra-kiosk:get-window-mode", () => currentWindowMode);
  ipcMain.handle("synra-kiosk:set-window-mode", (_event, requestedMode: unknown) => {
    if (!mainWindow || mainWindow.isDestroyed()) return currentWindowMode;
    return applyWindowMode(mainWindow, normalizeWindowMode(requestedMode));
  });
  ipcMain.handle("synra-kiosk:toggle-window-mode", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return currentWindowMode;
    return applyWindowMode(mainWindow, currentWindowMode === "fullscreen" ? "windowed" : "fullscreen");
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
  const explicitWindowMode = process.env.SYNRA_KIOSK_WINDOW_MODE?.trim();
  currentWindowMode = explicitWindowMode ? launchConfig.window.windowMode : readPersistedWindowMode() ?? launchConfig.window.windowMode;
  const startsFullscreen = currentWindowMode === "fullscreen";

  const window = new BrowserWindow({
    width: launchConfig.window.width,
    height: launchConfig.window.height,
    fullscreen: startsFullscreen && launchConfig.window.fullscreen,
    kiosk: startsFullscreen && launchConfig.window.kiosk,
    alwaysOnTop: startsFullscreen && launchConfig.window.alwaysOnTop,
    backgroundColor: "#03060a",
    show: false,
    autoHideMenuBar: startsFullscreen,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: join(moduleDir, "kiosk-preload.js"),
      webgl: true,
      spellcheck: false
    }
  });
  mainWindow = window;

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
      windowMode: currentWindowMode,
      switches: Object.fromEntries(switches),
      gpuFeatureStatus: app.getGPUFeatureStatus()
    });

    installKioskWindowIpc();
    createWindow();
  })
  .catch((error) => {
    logger.error("Failed to start Synra Electron kiosk", error);
    app.exit(1);
  });
