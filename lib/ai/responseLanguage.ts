import { getActiveProfile } from "@/lib/deployment";

/**
 * Response-language directive appended to every LLM system prompt. Keyed off the
 * active deployment profile's `taxonomyLanguage` (region-static — see
 * `lib/deployment/types.ts`). The Chinese deployment (`cn`) answers in Simplified
 * Chinese; every other deployment answers in English.
 */
const INSTRUCTIONS: Record<"en" | "zh-CN", string> = {
  "zh-CN":
    "IMPORTANT: Write all natural-language output in Simplified Chinese (简体中文). " +
    "Every human-readable value you produce — summaries, reasoning, descriptions, " +
    "recommendations, and free-text field values — must be in Simplified Chinese. " +
    "Do NOT translate or alter: JSON keys/field names, enum values defined in the " +
    "schema, URLs, codes/identifiers (e.g. CPV codes), or proper nouns that have no " +
    "established Chinese form.",
  en: "Write all natural-language output in English.",
};

/** Language directive for the active deployment, to append to every LLM system prompt. */
export function getResponseLanguageInstruction(): string {
  return INSTRUCTIONS[getActiveProfile().taxonomyLanguage];
}
