import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
} from "@/lib/api/validation";
import {
  requireCompanyAccess,
  markCompanyAdminPrepared,
  suppressEmailForAdminOverride,
} from "@/lib/api/companyAccess";
import { db } from "@/lib/db";
import { companyStandards, standardsRef, companies, companyVerificationRequests } from "@/lib/db/schema/app";
import { localizedName } from "@/lib/taxonomy/localizedName";
import { refreshCompanyEmbedding } from "@/lib/services/embeddingService";
import { eq, and, inArray } from "drizzle-orm";
import type { PendingChanges } from "@/lib/companyFieldCategories";

async function getCompanyStandardsData(companyId: string) {
  return db
    .select({
      id: standardsRef.id,
      name: localizedName(standardsRef.name, standardsRef.nameZh),
      parent_id: standardsRef.parentId,
      sort_order: standardsRef.sortOrder,
    })
    .from(companyStandards)
    .innerJoin(standardsRef, eq(companyStandards.standardId, standardsRef.id))
    .where(eq(companyStandards.companyId, companyId));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    await requireCompanyAccess(user.id, companyId);

    const data = await getCompanyStandardsData(companyId);
    return apiResponse({ standards: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    const access = await requireCompanyAccess(user.id, companyId);
    // Must be in this frame — see enableEmailSuppression's contract.
    suppressEmailForAdminOverride(access, user.id);
    const { adminOverride } = access;

    const body = await request.json();
    const { standardIds } = body as { standardIds: string[] };

    // Get current standards
    const current = await db
      .select({ standardId: companyStandards.standardId })
      .from(companyStandards)
      .where(eq(companyStandards.companyId, companyId));

    const currentIds = new Set(current.map((c) => c.standardId));
    const newIds = new Set(standardIds);

    const toRemove = [...currentIds].filter((id) => !newIds.has(id));
    const toAdd = [...newIds].filter((id) => !currentIds.has(id));

    // No changes
    if (toRemove.length === 0 && toAdd.length === 0) {
      const data = await getCompanyStandardsData(companyId);
      return apiResponse({ standards: data, pendingReview: false });
    }

    // Check if company is verified
    const company = await db
      .select({ verificationStatus: companies.verificationStatus, pendingChanges: companies.pendingChanges })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0]);

    // An admin acting on the user's behalf bypasses the change-review queue.
    if (company?.verificationStatus === "verified" && !adminOverride) {
      // Check edit lock
      const pendingRequest = await db
        .select({ id: companyVerificationRequests.id })
        .from(companyVerificationRequests)
        .where(
          and(
            eq(companyVerificationRequests.companyId, companyId),
            eq(companyVerificationRequests.requestType, "change_review"),
            eq(companyVerificationRequests.status, "pending"),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (pendingRequest) {
        return apiResponse(
          { error: "Cannot edit standards while a change review is pending. Please wait for admin review." },
          400,
        );
      }

      // Store in pendingChanges
      const pending: PendingChanges = (company.pendingChanges as PendingChanges | null) ?? {
        lastSavedAt: new Date().toISOString(),
      };
      pending.standards = {
        current: [...currentIds],
        proposed: standardIds,
        added: toAdd,
        removed: toRemove,
      };
      pending.lastSavedAt = new Date().toISOString();

      await db
        .update(companies)
        .set({ pendingChanges: pending, updatedAt: new Date() })
        .where(eq(companies.id, companyId));

      return apiResponse({
        pendingReview: true,
        draftSaved: true,
        message: "Standards changes saved as draft. Submit for review when ready.",
      });
    }

    // Unverified: apply directly
    if (toRemove.length > 0) {
      await db
        .delete(companyStandards)
        .where(
          and(
            eq(companyStandards.companyId, companyId),
            inArray(companyStandards.standardId, toRemove),
          ),
        );
    }

    if (toAdd.length > 0) {
      await db.insert(companyStandards).values(
        toAdd.map((standardId) => ({
          companyId,
          standardId,
        })),
      );
    }

    if (adminOverride) {
      await markCompanyAdminPrepared(companyId, user.id);
    }

    // Standards feed the embedding source — see refreshCompanyEmbedding.
    await refreshCompanyEmbedding(companyId);

    const data = await getCompanyStandardsData(companyId);
    return apiResponse({ standards: data, pendingReview: false });
  } catch (error) {
    return handleApiError(error);
  }
}
