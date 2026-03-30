import { getPlatformSettingsByKeys, upsertPlatformSetting } from "@/lib/db/queries";

export interface PlatformMatchingSettings {
  verifiedMatchingRunsPerMonth: number;
  unverifiedMatchingRunsPerMonth: number;
}

const KEYS = {
  verified_matching_runs_per_month: "verified_matching_runs_per_month",
  unverified_matching_runs_per_month: "unverified_matching_runs_per_month",
} as const;

const DEFAULTS: PlatformMatchingSettings = {
  verifiedMatchingRunsPerMonth: 10,
  unverifiedMatchingRunsPerMonth: 2,
};

let cached: PlatformMatchingSettings | null = null;
let cacheTime = 0;
const CACHE_MS = 60_000;

/**
 * Get platform matching run limit settings. Cached for 1 minute.
 */
export async function getPlatformMatchingSettings(): Promise<PlatformMatchingSettings> {
  const now = Date.now();
  if (cached && now - cacheTime < CACHE_MS) {
    return cached;
  }

  const rows = await getPlatformSettingsByKeys([
    KEYS.verified_matching_runs_per_month,
    KEYS.unverified_matching_runs_per_month,
  ]);

  const map = new Map(rows.map((r) => [r.key, r.value]));
  const parseOrDefault = (val: string | undefined, fallback: number): number => {
    const parsed = parseInt(val ?? "", 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  };

  cached = {
    verifiedMatchingRunsPerMonth: parseOrDefault(
      map.get(KEYS.verified_matching_runs_per_month),
      DEFAULTS.verifiedMatchingRunsPerMonth,
    ),
    unverifiedMatchingRunsPerMonth: parseOrDefault(
      map.get(KEYS.unverified_matching_runs_per_month),
      DEFAULTS.unverifiedMatchingRunsPerMonth,
    ),
  };
  cacheTime = now;
  return cached;
}

/**
 * Update platform matching settings. Admin only. Clears cache.
 */
export async function setPlatformMatchingSettings(
  updates: Partial<PlatformMatchingSettings>,
): Promise<void> {
  const keyMap: Record<string, string> = {
    verifiedMatchingRunsPerMonth: KEYS.verified_matching_runs_per_month,
    unverifiedMatchingRunsPerMonth: KEYS.unverified_matching_runs_per_month,
  };
  const entries = Object.entries(updates).filter(
    (e): e is [keyof PlatformMatchingSettings, number] =>
      e[0] in keyMap && typeof e[1] === "number",
  );
  for (const [key, value] of entries) {
    await upsertPlatformSetting(keyMap[key], String(value));
  }
  cached = null;
}
