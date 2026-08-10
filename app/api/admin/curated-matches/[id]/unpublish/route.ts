import { NextRequest } from "next/server";
import { apiResponse, apiError, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, isUuid } from "@/lib/api/validation";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { curatedMatches } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

/**
 * POST /api/admin/curated-matches/[id]/unpublish
 *
 * Returns a live curation to draft. The tender drops straight back to whatever
 * the matcher scored it — nothing was ever written to `matching_results`, so
 * there is nothing to undo there.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    if (!(await checkSuperadminRole(user.id))) {
      return apiError("Forbidden: Superadmin access required", 403);
    }

    const { id } = await params;
    if (!isUuid(id)) return apiError("Curation not found", 404);

    const [updated] = await db
      .update(curatedMatches)
      .set({
        status: "draft",
        publishedAt: null,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(curatedMatches.id, id))
      .returning();

    if (!updated) return apiError("Curation not found", 404);

    // Already unpublished; a failed audit write must not report otherwise.
    try {
      await logApiEvent(request, {
        actionType: "match_curation_unpublished",
        userId: user.id,
        entityType: "curated_match",
        entityId: id,
        details: { companyId: updated.companyId, tenderId: updated.tenderId },
      });
    } catch (error) {
      console.error("Failed to log match_curation_unpublished event:", error);
    }

    return apiResponse({ result: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
