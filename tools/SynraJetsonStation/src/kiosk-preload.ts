import { contextBridge, ipcRenderer } from "electron";

type SynraKioskWindowMode = "fullscreen" | "windowed";
type SynraScreenTimeoutMinutes = 10 | 15 | 30 | 60 | 0;

function normalizeWindowMode(value: unknown): SynraKioskWindowMode {
  return value === "windowed" ? "windowed" : "fullscreen";
}

contextBridge.exposeInMainWorld("synraKiosk", {
  getWindowMode: async (): Promise<SynraKioskWindowMode> => normalizeWindowMode(await ipcRenderer.invoke("synra-kiosk:get-window-mode")),
  setWindowMode: async (mode: SynraKioskWindowMode): Promise<SynraKioskWindowMode> =>
    normalizeWindowMode(await ipcRenderer.invoke("synra-kiosk:set-window-mode", normalizeWindowMode(mode))),
  toggleWindowMode: async (): Promise<SynraKioskWindowMode> => normalizeWindowMode(await ipcRenderer.invoke("synra-kiosk:toggle-window-mode")),
  setScreenTimeout: async (minutes: SynraScreenTimeoutMinutes): Promise<SynraScreenTimeoutMinutes> =>
    await ipcRenderer.invoke("synra-kiosk:set-screen-timeout", minutes) as SynraScreenTimeoutMinutes,
  wakeDisplay: async (): Promise<boolean> => Boolean(await ipcRenderer.invoke("synra-kiosk:wake-display"))
});
