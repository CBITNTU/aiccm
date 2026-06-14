import { NextRequest } from "next/server";

import {
  getAuthenticatedUser,
  checkSuperadminRole,
  apiResponse,
  apiError,
} from "@/lib/api";
import {
  getEmbeddingConfigSummary,
  probeEmbeddingProvider,
} from "@/lib/ai/embeddings";
import {
  getMatchingModelFromEnv,
  probeInferenceHost,
} from "@/lib/ai/ollama";
import { getPlatformAISettings } from "@/lib/platformSettings";

/**
 * GET /api/admin/inference/health
 * Superadmin diagnostic: embedding provider + LLM inference reachability.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser(request);
    if (!user) return apiError("Unauthorized", 401);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) return apiError("Forbidden: Superadmin access required", 403);

    const [embedProbe, llmProbe, platformSettings] = await Promise.all([
      probeEmbeddingProvider(),
      probeInferenceHost(),
      getPlatformAISettings().catch(() => null),
    ]);

    const matchingModel =
      getMatchingModelFromEnv() ?? platformSettings?.defaultAiModel ?? null;

    return apiResponse({
      embedding: embedProbe,
      inference: llmProbe,
      matchingModel,
      embeddingConfig: getEmbeddingConfigSummary(),
      schemaEmbeddingDim: Number(
        process.env.EMBED_DIM?.trim() ||
          process.env.OLLAMA_EMBED_DIM?.trim() ||
          "1536",
      ),
    });
  } catch (e) {
    console.error("GET admin/inference/health error:", e);
    return apiError(
      e instanceof Error ? e.message : "Failed to probe inference",
      500,
    );
  }
}
