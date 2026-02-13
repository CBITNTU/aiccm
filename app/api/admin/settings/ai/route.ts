import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  checkSuperadminRole,
  apiResponse,
  apiError,
} from "@/lib/api";
import {
  getPlatformAISettings,
  setPlatformAISettings,
  type DefaultReasoningEffort,
} from "@/lib/platformSettings";
import { SUPPORTED_MODELS } from "@/lib/ai";

const VALID_MODELS: readonly string[] = SUPPORTED_MODELS.map((m) => m.id);
const VALID_EFFORTS: DefaultReasoningEffort[] = [
  "default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

/**
 * GET /api/admin/settings/ai
 * Returns platform default AI model and reasoning effort (superadmin only).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser(request);
    if (!user) return apiError("Unauthorized", 401);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) return apiError("Forbidden: Superadmin access required", 403);

    const settings = await getPlatformAISettings();
    return apiResponse(settings);
  } catch (e) {
    console.error("GET admin/settings/ai error:", e);
    return apiError(
      e instanceof Error ? e.message : "Failed to load settings",
      500,
    );
  }
}

/**
 * PATCH /api/admin/settings/ai
 * Body: { default_ai_model?: string, default_reasoning_effort?: string }
 * Updates platform defaults (superadmin only). Applies to all AI requests when no override is provided.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser(request);
    if (!user) return apiError("Unauthorized", 401);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) return apiError("Forbidden: Superadmin access required", 403);

    const body = await request.json().catch(() => ({}));
    const updates: {
      default_ai_model?: string;
      default_reasoning_effort?: DefaultReasoningEffort;
    } = {};

    if (body.default_ai_model != null) {
      const v = String(body.default_ai_model).trim();
      if (!VALID_MODELS.includes(v)) {
        return apiError(
          `Invalid default_ai_model; supported: ${VALID_MODELS.join(", ")}`,
          400,
        );
      }
      updates.default_ai_model = v;
    }
    if (body.default_reasoning_effort != null) {
      const v = String(
        body.default_reasoning_effort,
      ).trim() as DefaultReasoningEffort;
      if (!VALID_EFFORTS.includes(v)) {
        return apiError(
          `Invalid default_reasoning_effort; supported: ${VALID_EFFORTS.join(", ")}`,
          400,
        );
      }
      updates.default_reasoning_effort = v;
    }

    if (Object.keys(updates).length === 0) {
      return apiResponse(await getPlatformAISettings());
    }

    await setPlatformAISettings(updates);
    const settings = await getPlatformAISettings();
    return apiResponse(settings);
  } catch (e) {
    console.error("PATCH admin/settings/ai error:", e);
    return apiError(
      e instanceof Error ? e.message : "Failed to update settings",
      500,
    );
  }
}
