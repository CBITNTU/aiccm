/* eslint-disable @typescript-eslint/no-explicit-any -- provider options typing */
import { generateObject, generateText, zodSchema } from "ai";
import type { LanguageModel } from "ai";
import type { ZodType } from "zod";
import { resolveModel, getProviderName } from "./models";
import { isOllamaModelId } from "./ollama";
import { getPlatformModel } from "./provider";
import { getResponseLanguageInstruction } from "./responseLanguage";
import { runLLM } from "@/lib/services/llmLimiter";

interface BaseOptions {
  /** Override model ID (otherwise uses platform default). */
  modelId?: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  /** Estimated total tokens for rate-limiter accounting. */
  estTokens?: number;
  /** Override reasoning effort (otherwise uses the platform default). */
  reasoningEffort?: string;
}

interface GenerateObjectOptions<T> extends BaseOptions {
  /** Zod schema (will be wrapped with zodSchema() for AI SDK compatibility). */
  schema: ZodType<T>;
}

/**
 * Normalise reasoning effort.
 * - For DeepSeek models: pass through (handled by buildProviderOptions).
 * - For GPT-5 nano: clamp unsupported values (only supports minimal/low/medium/high).
 * - For other OpenAI models: only GPT-5 supports reasoning effort.
 */
function normaliseReasoningEffort(
  effort: string | undefined,
  modelId: string,
): string | undefined {
  // GPT-5 models require an explicit reasoning effort — default to "low"
  if (!effort && modelId.startsWith("gpt-5")) return "low";
  if (!effort) return undefined;

  // DeepSeek: pass through; buildProviderOptions maps to thinking mode
  if (modelId.startsWith("deepseek-")) return effort;

  // Gemini: pass through; buildProviderOptions maps to thinkingBudget
  if (modelId.startsWith("gemini-")) return effort;

  // Ollama: no reasoning-effort API
  if (isOllamaModelId(modelId)) return undefined;

  // OpenAI: only GPT-5 models support reasoning effort
  const isGPT5 = modelId.startsWith("gpt-5");
  if (!isGPT5) return undefined;

  if (modelId === "gpt-5-nano") {
    if (effort === "none") return "minimal";
    if (effort === "xhigh") return "high";
  }
  return effort;
}

/** Map reasoning effort levels to Gemini thinkingBudget token counts. */
const GEMINI_THINKING_BUDGET: Record<string, number> = {
  none: 0,
  minimal: 1024,
  low: 2048,
  medium: 4096,
  high: 8192,
  xhigh: 16384,
};

/**
 * Build provider-specific options for the AI SDK call.
 * - OpenAI: passes reasoningEffort.
 * - DeepSeek: the V4 models are hybrid thinkers — enable thinking mode via
 *   provider options when a non-trivial reasoning effort is set.
 * - Google: maps reasoning effort to a thinkingBudget token count.
 */
function buildProviderOptions(
  reasoningEffort: string | undefined,
  provider: string,
): Record<string, any> | undefined {
  if (provider === "deepseek") {
    // Enable thinking mode when reasoning effort is non-trivial
    if (reasoningEffort && reasoningEffort !== "none") {
      return { deepseek: { thinking: { type: "enabled" } } };
    }
    return undefined;
  }

  if (provider === "google") {
    if (!reasoningEffort || reasoningEffort === "none") return undefined;
    const budget = GEMINI_THINKING_BUDGET[reasoningEffort];
    if (budget != null) {
      return { google: { thinkingConfig: { thinkingBudget: budget } } };
    }
    return undefined;
  }

  if (provider === "ollama") {
    return undefined;
  }

  // OpenAI
  if (!reasoningEffort) return undefined;
  return { openai: { reasoningEffort } };
}

/**
 * Rate-limited wrapper around Vercel AI SDK `generateObject()`.
 * Uses the platform default model unless `modelId` is provided.
 */
export async function aiGenerateObject<T>(
  options: GenerateObjectOptions<T>,
): Promise<T> {
  const { schema, prompt, maxTokens, temperature, modelId, estTokens } =
    options;
  const system = [options.system, getResponseLanguageInstruction()]
    .filter(Boolean)
    .join("\n\n");

  return runLLM(async () => {
    let model: LanguageModel;
    let resolvedModelId: string;
    let reasoningEffort: string | undefined;

    if (modelId) {
      model = resolveModel(modelId);
      resolvedModelId = modelId;
      const platform = await getPlatformModel();
      reasoningEffort = options.reasoningEffort ?? platform.reasoningEffort;
    } else {
      const platform = await getPlatformModel();
      model = platform.model;
      resolvedModelId = platform.modelId;
      reasoningEffort = options.reasoningEffort ?? platform.reasoningEffort;
    }

    const normalisedEffort = normaliseReasoningEffort(
      reasoningEffort,
      resolvedModelId,
    );
    const provider = getProviderName(resolvedModelId);

    // DEBUG: AI call details
    console.log("[DEBUG] aiGenerateObject:", { resolvedModelId, provider, reasoningEffort: normalisedEffort, maxTokens });
    console.log("[DEBUG] aiGenerateObject system prompt:", system?.substring(0, 200));
    console.log("[DEBUG] aiGenerateObject user prompt (first 200 chars):", prompt.substring(0, 200));

    let result;
    try {
      result = await generateObject({
        model,
        schema: zodSchema(schema),
        system,
        prompt,
        maxOutputTokens: maxTokens,
        temperature,
        providerOptions: buildProviderOptions(normalisedEffort, provider),
      });
    } catch (err) {
      console.error("[DEBUG] aiGenerateObject FAILED:", err);
      throw err;
    }

    if (result.object == null) {
      throw new Error(
        "No object generated: the model did not return a response.",
      );
    }

    const resultJson = JSON.stringify(result.object);
    console.log("[DEBUG] aiGenerateObject SUCCESS — result (first 500 chars):", resultJson.substring(0, 500));
    return result.object;
  }, estTokens ?? 1500);
}

/**
 * Rate-limited wrapper around Vercel AI SDK `generateText()`.
 * Uses the platform default model unless `modelId` is provided.
 */
export async function aiGenerateText(options: BaseOptions): Promise<string> {
  const { prompt, maxTokens, temperature, modelId, estTokens } = options;
  const system = [options.system, getResponseLanguageInstruction()]
    .filter(Boolean)
    .join("\n\n");

  return runLLM(async () => {
    let model: LanguageModel;
    let resolvedModelId: string;
    let reasoningEffort: string | undefined;

    if (modelId) {
      model = resolveModel(modelId);
      resolvedModelId = modelId;
      const platform = await getPlatformModel();
      reasoningEffort = options.reasoningEffort ?? platform.reasoningEffort;
    } else {
      const platform = await getPlatformModel();
      model = platform.model;
      resolvedModelId = platform.modelId;
      reasoningEffort = options.reasoningEffort ?? platform.reasoningEffort;
    }

    const normalisedEffort = normaliseReasoningEffort(
      reasoningEffort,
      resolvedModelId,
    );
    const provider = getProviderName(resolvedModelId);

    const result = await generateText({
      model,
      system,
      prompt,
      maxOutputTokens: maxTokens,
      temperature,
      providerOptions: buildProviderOptions(normalisedEffort, provider),
    });

    return result.text;
  }, estTokens ?? 1500);
}
