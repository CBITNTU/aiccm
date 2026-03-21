import type { LanguageModel } from "ai";
import { getPlatformAISettings } from "@/lib/platformSettings";
import { resolveModel } from "./models";

/**
 * Get the platform-configured default model and reasoning effort.
 */
export async function getPlatformModel(): Promise<{
  model: LanguageModel;
  modelId: string;
  reasoningEffort: string | undefined;
}> {
  const settings = await getPlatformAISettings();
  const modelId = settings.defaultAiModel;
  const reasoningEffort =
    settings.defaultReasoningEffort === "default"
      ? undefined
      : settings.defaultReasoningEffort;

  return {
    model: resolveModel(modelId),
    modelId,
    reasoningEffort,
  };
}
