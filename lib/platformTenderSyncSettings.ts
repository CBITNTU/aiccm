import { getPlatformSettingsByKeys, upsertPlatformSetting } from "@/lib/db/queries";

/**
 * Max number of tenders (records) to fetch per source during a sync/import run.
 * Keyed by tender adapter id (see lib/tenders/registry.ts).
 */
export interface PlatformTenderLimits {
  shanghai_zbycg: number;
  find_tender: number;
  ted: number;
}

const KEYS = {
  shanghai_zbycg: "tender_limit_shanghai_zbycg",
  find_tender: "tender_limit_find_tender",
  ted: "tender_limit_ted",
} as const;

const DEFAULTS: PlatformTenderLimits = {
  shanghai_zbycg: 300,
  find_tender: 1000,
  ted: 1000,
};

let cached: PlatformTenderLimits | null = null;
let cacheTime = 0;
const CACHE_MS = 60_000; // 1 minute

/**
 * Get per-source tender fetch limits. Cached for 1 minute to avoid DB hit on every request.
 */
export async function getPlatformTenderLimits(): Promise<PlatformTenderLimits> {
  const now = Date.now();
  if (cached && now - cacheTime < CACHE_MS) {
    return cached;
  }

  const rows = await getPlatformSettingsByKeys([
    KEYS.shanghai_zbycg,
    KEYS.find_tender,
    KEYS.ted,
  ]);

  const map = new Map(rows.map((r) => [r.key, r.value]));
  const parseOrDefault = (val: string | undefined, fallback: number): number => {
    const parsed = parseInt(val ?? "", 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  };
  cached = {
    shanghai_zbycg: parseOrDefault(map.get(KEYS.shanghai_zbycg), DEFAULTS.shanghai_zbycg),
    find_tender: parseOrDefault(map.get(KEYS.find_tender), DEFAULTS.find_tender),
    ted: parseOrDefault(map.get(KEYS.ted), DEFAULTS.ted),
  };
  cacheTime = now;
  return cached;
}

/**
 * Update per-source tender fetch limits. Admin only. Clears cache.
 */
export async function setPlatformTenderLimits(
  updates: Partial<PlatformTenderLimits>,
): Promise<void> {
  const keyMap: Record<string, string> = {
    shanghai_zbycg: KEYS.shanghai_zbycg,
    find_tender: KEYS.find_tender,
    ted: KEYS.ted,
  };
  const entries = Object.entries(updates).filter(
    (e): e is [keyof PlatformTenderLimits, number] =>
      e[0] in keyMap && typeof e[1] === "number",
  );
  for (const [key, value] of entries) {
    await upsertPlatformSetting(keyMap[key], String(value));
  }
  cached = null;
}

/**
 * Resolve the fetch limit for a given adapter id. Sources without a configured
 * limit fall back to a large value so an unknown adapter is never throttled to 0.
 */
export async function getTenderLimitForSource(sourceId: string): Promise<number> {
  const limits = await getPlatformTenderLimits();
  if (sourceId in limits) {
    return limits[sourceId as keyof PlatformTenderLimits];
  }
  return Number.MAX_SAFE_INTEGER;
}
