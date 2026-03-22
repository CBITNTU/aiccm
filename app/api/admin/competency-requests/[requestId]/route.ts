import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import {
  competencyChangeRequests,
  companyCapabilities,
} from "@/lib/db/schema/app";
import { eq, and, inArray } from "drizzle-orm";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const { requestId } = await params;
    const body = await request.json();
    const { action, reviewNotes } = body as {
      action: "approve" | "reject";
      reviewNotes?: string;
    };

    if (!action || !["approve", "reject"].includes(action)) {
      return apiResponse({ error: "action must be 'approve' or 'reject'" }, 400);
    }

    const changeRequest = await db
      .select()
      .from(competencyChangeRequests)
      .where(eq(competencyChangeRequests.id, requestId))
      .then((rows) => rows[0]);

    if (!changeRequest) {
      return apiResponse({ error: "Competency change request not found" }, 404);
    }

    if (changeRequest.status !== "pending") {
      return apiResponse({ error: "This request has already been reviewed" }, 400);
    }

    const now = new Date();

    // Update the request status
    await db
      .update(competencyChangeRequests)
      .set({
        status: action === "approve" ? "approved" : "rejected",
        reviewNotes: typeof reviewNotes === "string" ? reviewNotes.trim().slice(0, 2000) : null,
        reviewedBy: user.id,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(competencyChangeRequests.id, requestId));

    // If approved, apply the diff
    if (action === "approve") {
      const additions = (changeRequest.proposedAdditions as string[]) ?? [];
      const removals = (changeRequest.proposedRemovals as string[]) ?? [];

      if (removals.length > 0) {
        await db
          .delete(companyCapabilities)
          .where(
            and(
              eq(companyCapabilities.companyId, changeRequest.companyId),
              inArray(companyCapabilities.capabilityId, removals),
            ),
          );
      }

      if (additions.length > 0) {
        await db
          .insert(companyCapabilities)
          .values(
            additions.map((capabilityId) => ({
              companyId: changeRequest.companyId,
              capabilityId,
            })),
          )
          .onConflictDoNothing();
      }
    }

    return apiResponse({ success: true, action });
  } catch (error) {
    return handleApiError(error);
  }
}
