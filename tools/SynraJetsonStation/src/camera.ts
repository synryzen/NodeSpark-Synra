import fs from "node:fs";
import type { StationCameraHealth, SynraSensorStatus } from "./types.js";

export class StationCamera {
  private statusValue: SynraSensorStatus;
  private lastErrorValue: string | null = null;

  constructor(private readonly enabled: boolean) {
    this.statusValue = enabled ? "available" : "unavailable";
  }

  get status(): SynraSensorStatus {
    return this.statusValue;
  }

  get lastError(): string | null {
    return this.lastErrorValue;
  }

  setStatus(status: SynraSensorStatus): void {
    if (!this.enabled && status !== "unavailable") {
      this.lastErrorValue = "Camera status update ignored because camera capture is not wired.";
      this.statusValue = "unavailable";
      return;
    }
    this.statusValue = status;
    if (status !== "permissionDenied") this.lastErrorValue = null;
  }

  async captureForVision(): Promise<never> {
    this.lastErrorValue = "Camera capture is intentionally disabled until a visible Jetson camera path is wired.";
    this.statusValue = this.enabled ? "available" : "unavailable";
    throw new Error(this.lastErrorValue);
  }

  debug(): StationCameraHealth {
    const devices = this.detectDevices();
    const configuredDevice = process.env.SYNRA_CAMERA_DEVICE || "";
    const configuredPresent = configuredDevice ? devices.some((device) => device.path === configuredDevice) : false;
    return {
      enabled: this.enabled,
      status: this.statusValue,
      lastError: this.lastErrorValue,
      configuredDevice: configuredDevice || null,
      devices: devices.map((device) => ({
        path: device.path,
        present: true,
        configured: device.path === configuredDevice
      })),
      routeStatus: this.cameraRouteStatus(devices.length, configuredDevice, configuredPresent)
    };
  }

  private detectDevices(): Array<{ path: string }> {
    try {
      return fs.readdirSync("/dev")
        .filter((name) => /^video\d+$/.test(name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((name) => ({ path: `/dev/${name}` }));
    } catch {
      return [];
    }
  }

  private cameraRouteStatus(deviceCount: number, configuredDevice: string, configuredPresent: boolean): StationCameraHealth["routeStatus"] {
    if (!this.enabled) return "unavailable";
    if (configuredDevice) return configuredPresent ? "ready" : "degraded";
    return deviceCount > 0 ? "not-configured" : "unavailable";
  }
}
