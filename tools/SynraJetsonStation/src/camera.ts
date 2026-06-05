import type { SynraSensorStatus } from "./types.js";

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

  debug() {
    return { enabled: this.enabled, status: this.statusValue, lastError: this.lastErrorValue };
  }
}
