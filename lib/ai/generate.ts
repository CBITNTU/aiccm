/* eslint-disable @typescript-eslint/no-explicit-any -- provider options typing */
import { generateObject, generateText, zodSchema } from "ai";
import type { LanguageModel } from "ai";
import type { ZodType } from "zod";
import { resolveModel, getPlatformModel } from "./provider";
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
}

interface GenerateObjectOptions<T> extends BaseOptions {
  /** Zod schema (will be wrapped with zodSchema() for AI SDK compatibility). */
  schema: ZodType<T>;
}

/**
 * Normalise reasoning effort for gpt-5-nano which only supports minimal/low/medium/high.
 */
function normaliseReasoningEffort(
  effort: string | undefined,
  modelId: string,
): string | undefined {
  if (!effort) return undefined;
  const isGPT5 = modelId.startsWith("gpt-5");
  if (!isGPT5) return undefined;

  if (modelId === "gpt-5-nano") {
    if (effort === "none") return "minimal";
    if (effort === "xhigh") return "high";
  }
  return effort;
}

function buildProviderOptions(
  reasoningEffort: string | undefined,
): Record<string, any> | undefined {
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
  const { schema, system, prompt, maxTokens, temperature, modelId, estTokens } =
    options;

  return runLLM(async () => {
    let model: LanguageModel;
    let resolvedModelId: string;
    let reasoningEffort: string | undefined;

    if (modelId) {
      model = resolveModel(modelId);
      resolvedModelId = modelId;
      const platform = await getPlatformModel();
      reasoningEffort = platform.reasoningEffort;
    } else {
      const platform = await getPlatformModel();
      model = platform.model;
      resolvedModelId = platform.modelId;
      reasoningEffort = platform.reasoningEffort;
    }

    const normalisedEffort = normaliseReasoningEffort(
      reasoningEffort,
      resolvedModelId,
    );

    const result = await generateObject({
      model,
      schema: zodSchema(schema),
      system,
      prompt,
      maxOutputTokens: maxTokens,
      temperature,
      providerOptions: buildProviderOptions(normalisedEffort),
    });

    return result.object;
  }, estTokens ?? 1500);
}

/**
 * Rate-limited wrapper around Vercel AI SDK `generateText()`.
 * Uses the platform default model unless `modelId` is provided.
 */
export async function aiGenerateText(
  options: BaseOptions,
): Promise<string> {
  const { system, prompt, maxTokens, temperature, modelId, estTokens } =
    options;

  return runLLM(async () => {
    let model: LanguageModel;
    let resolvedModelId: string;
    let reasoningEffort: string | undefined;

    if (modelId) {
      model = resolveModel(modelId);
      resolvedModelId = modelId;
      const platform = await getPlatformModel();
      reasoningEffort = platform.reasoningEffort;
    } else {
      const platform = await getPlatformModel();
      model = platform.model;
      resolvedModelId = platform.modelId;
      reasoningEffort = platform.reasoningEffort;
    }

    const normalisedEffort = normaliseReasoningEffort(
      reasoningEffort,
      resolvedModelId,
    );

    const result = await generateText({
      model,
      system,
      prompt,
      maxOutputTokens: maxTokens,
      temperature,
      providerOptions: buildProviderOptions(normalisedEffort),
    });

    return result.text;
  }, estTokens ?? 1500);
}
