import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface StationIdentityCounts {
  faceSampleCount: number;
  voiceSampleCount: number;
  updatedAt: string | null;
}

export interface StationIdentityCountsUpdate {
  faceSampleCount?: unknown;
  voiceSampleCount?: unknown;
}

const DEFAULT_COUNTS: StationIdentityCounts = {
  faceSampleCount: 0,
  voiceSampleCount: 0,
  updatedAt: null
};

function clampNumber(value: unknown, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(max, Math.max(0, Math.floor(parsed)));
}

export function clampIdentityCounts(update: StationIdentityCountsUpdate): Omit<StationIdentityCounts, "updatedAt"> {
  return {
    faceSampleCount: clampNumber(update.faceSampleCount, 7),
    voiceSampleCount: clampNumber(update.voiceSampleCount, 3)
  };
}

export function identityCountsPath(): string {
  return process.env.SYNRA_IDENTITY_COUNTS_PATH?.trim()
    || path.join(os.homedir(), ".config", "synra-jetson-station-identity.json");
}

export async function readIdentityCounts(): Promise<StationIdentityCounts> {
  try {
    const raw = JSON.parse(await fs.readFile(identityCountsPath(), "utf8")) as Partial<StationIdentityCounts>;
    const counts = clampIdentityCounts(raw);
    return {
      ...counts,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null
    };
  } catch {
    return DEFAULT_COUNTS;
  }
}

export async function writeIdentityCounts(update: StationIdentityCountsUpdate): Promise<StationIdentityCounts> {
  const previous = await readIdentityCounts();
  const merged = {
    faceSampleCount: update.faceSampleCount === undefined ? previous.faceSampleCount : update.faceSampleCount,
    voiceSampleCount: update.voiceSampleCount === undefined ? previous.voiceSampleCount : update.voiceSampleCount
  };
  const counts = clampIdentityCounts(merged);
  const next: StationIdentityCounts = {
    ...counts,
    updatedAt: new Date().toISOString()
  };
  const file = identityCountsPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}
