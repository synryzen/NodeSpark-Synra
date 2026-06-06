import { contextBridge, ipcRenderer } from "electron";

type SynraKioskWindowMode = "fullscreen" | "windowed";

function normalizeWindowMode(value: unknown): SynraKioskWindowMode {
  return value === "windowed" ? "windowed" : "fullscreen";
}

contextBridge.exposeInMainWorld("synraKiosk", {
  getWindowMode: async (): Promise<SynraKioskWindowMode> => normalizeWindowMode(await ipcRenderer.invoke("synra-kiosk:get-window-mode")),
  setWindowMode: async (mode: SynraKioskWindowMode): Promise<SynraKioskWindowMode> =>
    normalizeWindowMode(await ipcRenderer.invoke("synra-kiosk:set-window-mode", normalizeWindowMode(mode))),
  toggleWindowMode: async (): Promise<SynraKioskWindowMode> => normalizeWindowMode(await ipcRenderer.invoke("synra-kiosk:toggle-window-mode"))
});
