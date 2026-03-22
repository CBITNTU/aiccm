import { getPlatformSettingsByKeys, upsertPlatformSetting } from "@/lib/db/queries";

export interface PlatformVerificationSettings {
  verifiedProjectLimit: number;
  unverifiedProjectLimit: number;
  unverifiedCompetencyLimit: number;
}

const KEYS = {
  verified_project_limit: "verified_project_limit",
  unverified_project_limit: "unverified_project_limit",
  unverified_competency_limit: "unverified_competency_limit",
} as const;

const DEFAULTS: PlatformVerificationSettings = {
  verifiedProjectLimit: 5,
  unverifiedProjectLimit: 1,
  unverifiedCompetencyLimit: 5,
};

let cached: PlatformVerificationSettings | null = null;
let cacheTime = 0;
const CACHE_MS = 60_000; // 1 minute

/**
 * Get platform verification settings. Cached for 1 minute to avoid DB hit on every request.
 */
export async function getPlatformVerificationSettings(): Promise<PlatformVerificationSettings> {
  const now = Date.now();
  if (cached && now - cacheTime < CACHE_MS) {
    return cached;
  }

  const rows = await getPlatformSettingsByKeys([
    KEYS.verified_project_limit,
    KEYS.unverified_project_limit,
    KEYS.unverified_competency_limit,
  ]);

  const map = new Map(rows.map((r) => [r.key, r.value]));
  cached = {
    verifiedProjectLimit:
      parseInt(map.get(KEYS.verified_project_limit) ?? "", 10) || DEFAULTS.verifiedProjectLimit,
    unverifiedProjectLimit:
      parseInt(map.get(KEYS.unverified_project_limit) ?? "", 10) || DEFAULTS.unverifiedProjectLimit,
    unverifiedCompetencyLimit:
      parseInt(map.get(KEYS.unverified_competency_limit) ?? "", 10) || DEFAULTS.unverifiedCompetencyLimit,
  };
  cacheTime = now;
  return cached;
}

/**
 * Update platform verification settings. Admin only. Clears cache.
 */
export async function setPlatformVerificationSettings(
  updates: Partial<PlatformVerificationSettings>,
): Promise<void> {
  const keyMap: Record<string, string> = {
    verifiedProjectLimit: KEYS.verified_project_limit,
    unverifiedProjectLimit: KEYS.unverified_project_limit,
    unverifiedCompetencyLimit: KEYS.unverified_competency_limit,
  };
  const entries = Object.entries(updates).filter(
    (e): e is [keyof PlatformVerificationSettings, number] =>
      e[0] in keyMap && typeof e[1] === "number",
  );
  for (const [key, value] of entries) {
    await upsertPlatformSetting(keyMap[key], String(value));
  }
  cached = null;
}
