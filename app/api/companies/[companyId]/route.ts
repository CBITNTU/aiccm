import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import {
  requireCompanyAccess,
  requireCompanyAdmin,
  markCompanyAdminPrepared,
  suppressEmailForAdminOverride,
} from "@/lib/api/companyAccess";
import { refreshCompanyEmbedding } from "@/lib/services/embeddingService";
import {
  geocodeLocation,
  buildCompanyGeoQuery,
  isGeocodingEnabled,
} from "@/lib/geocode";
import { db } from "@/lib/db";
import { companies, companyCapabilities, companyCapabilitiesRef, companyMarkets, markets, companyStandards, standardsRef, companyVerificationRequests } from "@/lib/db/schema/app";
import { localizedName, localizedCategory } from "@/lib/taxonomy/localizedName";
import { companyColumnsNoEmbedding } from "@/lib/db/columns";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  isReviewableField,
  withResolvedScalarCurrents,
  type PendingChanges,
  type ReviewableScalarField,
} from "@/lib/companyFieldCategories";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    // Company member/owner, or a superadmin acting on their behalf.
    const access = await requireCompanyAccess(user.id, companyId);

    // Fetch company
    const companyResult = await db
      .select(companyColumnsNoEmbedding)
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    const company = companyResult[0] ?? null;
    if (!company) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    const isOwner = company.userId === user.id;
    // A superadmin who is not a member is "acting on behalf": the company page
    // must render its edit affordances, but the caller is not the owner.
    const isAdminOverride = access.adminOverride;
    const canEdit = isOwner || isAdminOverride;

    // Fetch capabilities via join
    const capData = await db
      .select({
        id: companyCapabilitiesRef.id,
        name: localizedName(companyCapabilitiesRef.name, companyCapabilitiesRef.nameZh),
        category: localizedCategory(companyCapabilitiesRef.category, companyCapabilitiesRef.categoryZh),
      })
      .from(companyCapabilities)
      .innerJoin(
        companyCapabilitiesRef,
        eq(companyCapabilities.capabilityId, companyCapabilitiesRef.id),
      )
      .where(eq(companyCapabilities.companyId, companyId));

    // Fetch markets via join
    const marketsData = await db
      .select({
        id: markets.id,
        name: localizedName(markets.name, markets.nameZh),
        parentId: markets.parentId,
        sortOrder: markets.sortOrder,
      })
      .from(companyMarkets)
      .innerJoin(markets, eq(companyMarkets.marketId, markets.id))
      .where(eq(companyMarkets.companyId, companyId));

    // Fetch standards via join
    const standardsData = await db
      .select({
        id: standardsRef.id,
        name: localizedName(standardsRef.name, standardsRef.nameZh),
        parentId: standardsRef.parentId,
        sortOrder: standardsRef.sortOrder,
      })
      .from(companyStandards)
      .innerJoin(standardsRef, eq(companyStandards.standardId, standardsRef.id))
      .where(eq(companyStandards.companyId, companyId));

    // Include pending changes info for company members — and for a superadmin
    // acting on their behalf, who needs to see (and clear) any draft state.
    const isMember = access.hasAccess;
    let pendingReviewRequest = null;
    if (isMember && company.verificationStatus === "verified") {
      pendingReviewRequest = await db
        .select({
          id: companyVerificationRequests.id,
          status: companyVerificationRequests.status,
          requestType: companyVerificationRequests.requestType,
          reviewFeedback: companyVerificationRequests.reviewFeedback,
          reviewNotes: companyVerificationRequests.reviewNotes,
          createdAt: companyVerificationRequests.createdAt,
        })
        .from(companyVerificationRequests)
        .where(
          and(
            eq(companyVerificationRequests.companyId, companyId),
            eq(companyVerificationRequests.requestType, "change_review"),
            eq(companyVerificationRequests.status, "pending"),
          ),
        )
        .orderBy(desc(companyVerificationRequests.createdAt))
        .limit(1)
        .then((rows) => rows[0] ?? null);
    }

    // Fetch latest resolved (changes_requested/rejected) review request when no pending one exists
    // We fetch any terminal status (including approved) so that a newer approved request supersedes old rejections
    let latestResolvedRequest = null;
    if (isMember && company.verificationStatus === "verified" && !pendingReviewRequest && company.pendingChanges) {
      const latestRequest = await db
        .select({
          id: companyVerificationRequests.id,
          status: companyVerificationRequests.status,
          requestType: companyVerificationRequests.requestType,
          reviewFeedback: companyVerificationRequests.reviewFeedback,
          reviewNotes: companyVerificationRequests.reviewNotes,
          reviewedAt: companyVerificationRequests.reviewedAt,
          createdAt: companyVerificationRequests.createdAt,
        })
        .from(companyVerificationRequests)
        .where(
          and(
            eq(companyVerificationRequests.companyId, companyId),
            eq(companyVerificationRequests.requestType, "change_review"),
            inArray(companyVerificationRequests.status, ["changes_requested", "rejected", "approved"]),
          ),
        )
        .orderBy(desc(companyVerificationRequests.createdAt))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      // Only surface if the latest resolved request needs user action
      if (latestRequest && (latestRequest.status === "changes_requested" || latestRequest.status === "rejected")) {
        latestResolvedRequest = latestRequest;
      }
    }

    // Re-derive the `current` side of scalar drafts from the live row so drafts
    // persisted with a stale/null `current` still render the approved value
    let memberPendingChanges = isMember ? company.pendingChanges : undefined;
    if (memberPendingChanges) {
      memberPendingChanges = withResolvedScalarCurrents(
        memberPendingChanges as PendingChanges,
        company,
      );
    }

    return apiResponse({
      company,
      isOwner,
      canEdit,
      isAdminOverride,
      capabilities: capData,
      markets: marketsData,
      standards: standardsData,
      hasPendingChanges: isMember ? company.pendingChanges != null : undefined,
      pendingChanges: memberPendingChanges,
      pendingReviewRequest: isMember ? pendingReviewRequest : undefined,
      latestResolvedRequest: isMember ? latestResolvedRequest : undefined,
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

    // Not `requireCompanyAccess`: this guard needs role granularity that
    // `CompanyAccess` cannot express — a plain `member` may not update, only a
    // company `admin` (or the owner, whom getCompanyMemberRole reports as admin).
    const access = await requireCompanyAdmin(user.id, companyId);
    const { adminOverride } = access;
    // Must be in this frame — see enableEmailSuppression's contract.
    suppressEmailForAdminOverride(access, user.id);

    const body = await request.json();

    // Whitelist allowed fields
    const allowedFields = [
      "companyName", "description", "keyCapabilities", "postcode",
      "contactEmail", "websiteUrl", "contactPhone", "operationLocations",
      "certifications", "pastProjects", "address", "companiesHouseNumber",
      "contactPerson", "equipment",
    ];

    // Fetch current company data (only the fields this handler reads).
    // The reviewable scalar columns are required to build the `current` side of
    // pending change drafts below — do not narrow this projection.
    const company = await db
      .select({
        verificationStatus: companies.verificationStatus,
        pendingChanges: companies.pendingChanges,
        companyName: companies.companyName,
        description: companies.description,
        keyCapabilities: companies.keyCapabilities,
        certifications: companies.certifications,
        equipment: companies.equipment,
        pastProjects: companies.pastProjects,
        companiesHouseNumber: companies.companiesHouseNumber,
        // Reviewable, but written only by the dedicated logo route — a PUT must
        // not be able to point the logo at an arbitrary URL. Projected here so
        // the shared ReviewableScalarField indexing below stays total.
        logoUrl: companies.logoUrl,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0]);

    if (!company) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    // `useReviewQueue` — not `isVerified` — decides whether reviewable edits are
    // diverted into a draft. An admin override skips the queue entirely.
    const isVerified = company.verificationStatus === "verified";
    const useReviewQueue = isVerified && !adminOverride;

    // Split fields into reviewable and non-reviewable
    const directUpdates: Partial<typeof companies.$inferInsert> = {};
    const reviewableUpdates: Record<string, string | null> = {};

    for (const field of allowedFields) {
      if (!(field in body)) continue;
      if (useReviewQueue && isReviewableField(field)) {
        reviewableUpdates[field] = body[field] ?? null;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (directUpdates as any)[field] = body[field];
      }
    }

    // For verified companies, check edit lock before accepting reviewable changes
    if (useReviewQueue && Object.keys(reviewableUpdates).length > 0) {
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
          { error: "Cannot edit reviewable fields while a change review is pending. Please wait for admin review." },
          400,
        );
      }
    }

    // Build pending changes for reviewable fields (verified companies only)
    let pendingChanges: PendingChanges | null = (company.pendingChanges as PendingChanges | null) ?? null;
    if (useReviewQueue && Object.keys(reviewableUpdates).length > 0) {
      if (!pendingChanges) {
        pendingChanges = { lastSavedAt: new Date().toISOString() };
      }
      if (!pendingChanges.scalarFields) {
        pendingChanges.scalarFields = {};
      }
      for (const [field, proposedValue] of Object.entries(reviewableUpdates)) {
        const currentValue = company[field as ReviewableScalarField] ?? null;
        if (proposedValue === currentValue) {
          // User reverted to current value — remove from pending
          delete pendingChanges.scalarFields[field];
        } else {
          pendingChanges.scalarFields[field] = {
            current: currentValue ?? null,
            proposed: proposedValue,
          };
        }
      }
      // If no scalar fields and no relation changes remain, clear pendingChanges
      const hasScalar = pendingChanges.scalarFields && Object.keys(pendingChanges.scalarFields).length > 0;
      const hasRelations = pendingChanges.capabilities || pendingChanges.markets || pendingChanges.standards;
      if (!hasScalar && !hasRelations) {
        pendingChanges = null;
      } else {
        pendingChanges.lastSavedAt = new Date().toISOString();
      }
    }

    // Auto-geocode when postcode or address changes (only for direct updates)
    if (isGeocodingEnabled() && ("postcode" in directUpdates || "address" in directUpdates)) {
      const geoQuery = buildCompanyGeoQuery(
        (directUpdates.address as string) ?? null,
        (directUpdates.postcode as string) ?? null,
      );
      if (geoQuery) {
        const coords = await geocodeLocation(geoQuery);
        if (coords) {
          directUpdates.latitude = coords.lat;
          directUpdates.longitude = coords.lng;
        }
      }
    }

    // Build the final DB update
    const dbUpdate: Partial<typeof companies.$inferInsert> = {
      ...directUpdates,
      updatedAt: new Date(),
    };
    if (useReviewQueue && Object.keys(reviewableUpdates).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (dbUpdate as any).pendingChanges = pendingChanges;
    }

    const data = await db
      .update(companies)
      .set(dbUpdate)
      .where(eq(companies.id, companyId))
      .returning(companyColumnsNoEmbedding);

    if (!data[0]) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    // Refresh the basic-match embedding. Unconditional: refreshCompanyEmbedding
    // hashes the rebuilt source and no-ops when nothing that feeds the vector
    // changed, which covers the review-queue case where the edit only landed in
    // pendingChanges. A field whitelist here would just drift out of sync with
    // buildCompanySource.
    await refreshCompanyEmbedding(companyId);

    if (adminOverride) {
      await markCompanyAdminPrepared(companyId, user.id);
    }

    return apiResponse({
      company: data[0],
      hasPendingChanges: data[0].pendingChanges != null,
      pendingChanges: data[0].pendingChanges,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
