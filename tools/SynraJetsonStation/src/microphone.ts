import type { SynraSensorStatus } from "./types.js";

export class StationMicrophone {
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
      this.lastErrorValue = "Microphone status update ignored because local speech capture is not wired.";
      this.statusValue = "unavailable";
      return;
    }
    this.statusValue = status;
    if (status !== "permissionDenied") this.lastErrorValue = null;
  }

  async startListening(): Promise<never> {
    this.lastErrorValue = "Microphone listening is intentionally disabled until a visible Jetson mic path is wired.";
    this.statusValue = this.enabled ? "available" : "unavailable";
    throw new Error(this.lastErrorValue);
  }

  debug() {
    return { enabled: this.enabled, status: this.statusValue, lastError: this.lastErrorValue };
  }
}
