import { getPlatformSettingsByKeys, upsertPlatformSetting } from "@/lib/db/queries";
import { getActiveProfile } from "@/lib/deployment";

export type DefaultReasoningEffort =
  | "default"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export interface PlatformAISettings {
  defaultAiModel: string;
  defaultReasoningEffort: DefaultReasoningEffort;
}

const KEYS = {
  default_ai_model: "default_ai_model",
  default_reasoning_effort: "default_reasoning_effort",
} as const;

let cached: PlatformAISettings | null = null;
let cacheTime = 0;
const CACHE_MS = 60_000; // 1 minute

/**
 * Get platform default AI settings. Used by aiGenerateObject/aiGenerateText when no override is provided.
 * Cached for 1 minute to avoid DB hit on every request.
 */
export async function getPlatformAISettings(): Promise<PlatformAISettings> {
  const now = Date.now();
  if (cached && now - cacheTime < CACHE_MS) {
    return cached;
  }

  const rows = await getPlatformSettingsByKeys([
    KEYS.default_ai_model,
    KEYS.default_reasoning_effort,
  ]);

  const map = new Map(rows.map((r) => [r.key, r.value]));
  cached = {
    defaultAiModel:
      map.get(KEYS.default_ai_model) ?? getActiveProfile().ai.defaultModel,
    defaultReasoningEffort:
      (map.get(KEYS.default_reasoning_effort) as DefaultReasoningEffort) ??
      "default",
  };
  cacheTime = now;
  return cached;
}

/**
 * Update platform AI settings. Admin only. Clears cache so next getPlatformAISettings() sees new values.
 */
export async function setPlatformAISettings(
  updates: Partial<PlatformAISettings>,
): Promise<void> {
  const keyMap: Record<string, string> = {
    defaultAiModel: KEYS.default_ai_model,
    defaultReasoningEffort: KEYS.default_reasoning_effort,
  };
  const entries = Object.entries(updates).filter(
    (e): e is [keyof PlatformAISettings, string] =>
      e[0] in keyMap && typeof e[1] === "string",
  );
  for (const [key, value] of entries) {
    await upsertPlatformSetting(keyMap[key], value);
  }
  cached = null;
}
