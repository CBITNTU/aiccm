import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import {
  companyCapabilities,
  companyCapabilitiesRef,
  companies,
  competencyChangeRequests,
  companyVerificationRequests,
} from "@/lib/db/schema/app";
import { eq, and, inArray, asc, desc } from "drizzle-orm";
import { getPlatformVerificationSettings } from "@/lib/platformVerificationSettings";
import type { PendingChanges } from "@/lib/companyFieldCategories";

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

    // Fetch company's current capabilities via join
    const capData = await db
      .select({
        id: companyCapabilitiesRef.id,
        name: companyCapabilitiesRef.name,
        category: companyCapabilitiesRef.category,
      })
      .from(companyCapabilities)
      .innerJoin(
        companyCapabilitiesRef,
        eq(companyCapabilities.capabilityId, companyCapabilitiesRef.id),
      )
      .where(eq(companyCapabilities.companyId, companyId));

    // Fetch all available capabilities
    const allCapabilities = await db
      .select({
        id: companyCapabilitiesRef.id,
        name: companyCapabilitiesRef.name,
        category: companyCapabilitiesRef.category,
      })
      .from(companyCapabilitiesRef)
      .where(eq(companyCapabilitiesRef.isActive, true))
      .orderBy(asc(companyCapabilitiesRef.category), asc(companyCapabilitiesRef.name));

    // Get company verification status and settings for limits
    const company = await db
      .select({ verificationStatus: companies.verificationStatus })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0]);

    const settings = await getPlatformVerificationSettings();

    // Check for pending competency request
    const pendingRequest = await db
      .select({
        id: competencyChangeRequests.id,
        proposedAdditions: competencyChangeRequests.proposedAdditions,
        proposedRemovals: competencyChangeRequests.proposedRemovals,
        createdAt: competencyChangeRequests.createdAt,
      })
      .from(competencyChangeRequests)
      .where(
        and(
          eq(competencyChangeRequests.companyId, companyId),
          eq(competencyChangeRequests.status, "pending"),
        ),
      )
      .orderBy(desc(competencyChangeRequests.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    return apiResponse({
      capabilities: capData,
      allCapabilities,
      verificationStatus: company?.verificationStatus ?? "unverified",
      competencyLimit: company?.verificationStatus === "unverified" || company?.verificationStatus === "pending_verification"
        ? settings.unverifiedCompetencyLimit
        : null,
      pendingCompetencyRequest: pendingRequest,
    });
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
    const { capabilityIds } = body as { capabilityIds: string[] };

    if (
      !Array.isArray(capabilityIds) ||
      capabilityIds.length > 500 ||
      !capabilityIds.every((id) => typeof id === "string")
    ) {
      return apiResponse({ error: "capabilityIds must be an array of strings with at most 500 items" }, 400);
    }

    // Get company verification status
    const company = await db
      .select({ verificationStatus: companies.verificationStatus })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0]);

    if (!company) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    const isVerified = company.verificationStatus === "verified";

    // Get current capability IDs
    const current = await db
      .select({ capabilityId: companyCapabilities.capabilityId })
      .from(companyCapabilities)
      .where(eq(companyCapabilities.companyId, companyId));

    const currentIds = new Set(current.map((c) => c.capabilityId));
    const newIds = new Set(capabilityIds);

    // Determine diff
    const toRemove = [...currentIds].filter((id) => !newIds.has(id));
    const toAdd = [...newIds].filter((id) => !currentIds.has(id));

    // No changes
    if (toRemove.length === 0 && toAdd.length === 0) {
      return apiResponse({ capabilities: current, pendingReview: false });
    }

    if (isVerified) {
      // Check edit lock: reject if a change review is already submitted
      const pendingReview = await db
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

      if (pendingReview) {
        return apiResponse(
          { error: "Cannot edit competencies while a change review is pending. Please wait for admin review." },
          400,
        );
      }

      // Store diff in pendingChanges instead of competencyChangeRequests
      const companyData = await db
        .select({ pendingChanges: companies.pendingChanges })
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0]);

      const pending: PendingChanges = (companyData?.pendingChanges as PendingChanges | null) ?? {
        lastSavedAt: new Date().toISOString(),
      };

      pending.capabilities = {
        current: [...currentIds],
        proposed: capabilityIds,
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
        message: "Competency changes saved as draft. Submit for review when ready.",
      });
    } else {
      // Unverified companies: direct sync up to limit
      const settings = await getPlatformVerificationSettings();
      if (capabilityIds.length > settings.unverifiedCompetencyLimit) {
        return apiResponse(
          { error: `Unverified companies can have at most ${settings.unverifiedCompetencyLimit} competencies. Get verified to unlock unlimited competencies.` },
          403,
        );
      }

      await db.transaction(async (tx) => {
        // Apply removals
        if (toRemove.length > 0) {
          await tx
            .delete(companyCapabilities)
            .where(
              and(
                eq(companyCapabilities.companyId, companyId),
                inArray(companyCapabilities.capabilityId, toRemove),
              ),
            );
        }

        // Apply additions
        if (toAdd.length > 0) {
          await tx.insert(companyCapabilities).values(
            toAdd.map((capabilityId) => ({
              companyId,
              capabilityId,
            })),
          );
        }
      });

      // Fetch updated capabilities via join
      const updatedCaps = await db
        .select({
          id: companyCapabilitiesRef.id,
          name: companyCapabilitiesRef.name,
          category: companyCapabilitiesRef.category,
        })
        .from(companyCapabilities)
        .innerJoin(
          companyCapabilitiesRef,
          eq(companyCapabilities.capabilityId, companyCapabilitiesRef.id),
        )
        .where(eq(companyCapabilities.companyId, companyId));

      return apiResponse({ capabilities: updatedCaps, pendingReview: false });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
