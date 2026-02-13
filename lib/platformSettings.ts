/* eslint-disable @typescript-eslint/no-explicit-any -- platform_settings not in generated types */
import { createAdminClient } from "@/lib/api";

export type DefaultReasoningEffort =
  | "default"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export interface PlatformAISettings {
  default_ai_model: string;
  default_reasoning_effort: DefaultReasoningEffort;
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
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("platform_settings" as any)
    .select("key, value")
    .in("key", [KEYS.default_ai_model, KEYS.default_reasoning_effort]);

  if (error) {
    throw new Error(`Failed to load platform settings: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  cached = {
    default_ai_model: map.get(KEYS.default_ai_model) ?? "gpt-5-nano",
    default_reasoning_effort:
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
  const supabase = createAdminClient();
  const entries = Object.entries(updates).filter(
    (e): e is [keyof PlatformAISettings, string] =>
      e[0] in KEYS && typeof e[1] === "string",
  );
  for (const [key, value] of entries) {
    const { error } = await supabase
      .from("platform_settings" as any)
      .update({ value, updated_at: new Date().toISOString() })
      .eq("key", key);
    if (error) {
      throw new Error(`Failed to update platform settings: ${error.message}`);
    }
  }
  cached = null;
}
