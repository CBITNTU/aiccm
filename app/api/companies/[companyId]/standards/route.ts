import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companyStandards, standardsRef, companies, companyVerificationRequests } from "@/lib/db/schema/app";
import { localizedName } from "@/lib/taxonomy/localizedName";
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

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

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

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

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

    if (company?.verificationStatus === "verified") {
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

    const data = await getCompanyStandardsData(companyId);
    return apiResponse({ standards: data, pendingReview: false });
  } catch (error) {
    return handleApiError(error);
  }
}
