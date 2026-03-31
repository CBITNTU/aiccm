import { getPlatformSettingsByKeys, upsertPlatformSetting } from "@/lib/db/queries";

export interface PlatformAnalysisSettings {
  verifiedAnalysisRunsPerMonth: number;
  unverifiedAnalysisRunsPerMonth: number;
}

const KEYS = {
  verified_analysis_runs_per_month: "verified_analysis_runs_per_month",
  unverified_analysis_runs_per_month: "unverified_analysis_runs_per_month",
} as const;

const DEFAULTS: PlatformAnalysisSettings = {
  verifiedAnalysisRunsPerMonth: 5,
  unverifiedAnalysisRunsPerMonth: 1,
};

// NOTE: This is a module-level in-process cache. In Vercel's serverless model each Lambda
// instance has its own memory, so after an admin updates settings (cached = null) other warm
// instances may continue serving stale values for up to CACHE_MS. This is an acceptable
// trade-off for a low-write setting; replace with a distributed cache (e.g. Redis / KV) if
// stronger consistency is required.
let cached: PlatformAnalysisSettings | null = null;
let cacheTime = 0;
const CACHE_MS = 60_000;

/**
 * Get platform analysis run limit settings. Cached for 1 minute per process instance.
 */
export async function getPlatformAnalysisSettings(): Promise<PlatformAnalysisSettings> {
  const now = Date.now();
  if (cached && now - cacheTime < CACHE_MS) {
    return cached;
  }

  const rows = await getPlatformSettingsByKeys([
    KEYS.verified_analysis_runs_per_month,
    KEYS.unverified_analysis_runs_per_month,
  ]);

  const map = new Map(rows.map((r) => [r.key, r.value]));
  const parseOrDefault = (val: string | undefined, fallback: number): number => {
    const parsed = parseInt(val ?? "", 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  };

  cached = {
    verifiedAnalysisRunsPerMonth: parseOrDefault(
      map.get(KEYS.verified_analysis_runs_per_month),
      DEFAULTS.verifiedAnalysisRunsPerMonth,
    ),
    unverifiedAnalysisRunsPerMonth: parseOrDefault(
      map.get(KEYS.unverified_analysis_runs_per_month),
      DEFAULTS.unverifiedAnalysisRunsPerMonth,
    ),
  };
  cacheTime = now;
  return cached;
}

/**
 * Update platform analysis settings. Admin only. Clears cache.
 */
export async function setPlatformAnalysisSettings(
  updates: Partial<PlatformAnalysisSettings>,
): Promise<void> {
  const keyMap: Record<string, string> = {
    verifiedAnalysisRunsPerMonth: KEYS.verified_analysis_runs_per_month,
    unverifiedAnalysisRunsPerMonth: KEYS.unverified_analysis_runs_per_month,
  };
  const entries = Object.entries(updates).filter(
    (e): e is [keyof PlatformAnalysisSettings, number] =>
      e[0] in keyMap && typeof e[1] === "number",
  );
  for (const [key, value] of entries) {
    await upsertPlatformSetting(keyMap[key], String(value));
  }
  cached = null;
}
