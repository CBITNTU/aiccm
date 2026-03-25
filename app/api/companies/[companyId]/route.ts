import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";
import { getCompanyMemberRole } from "@/lib/db/queries";
import {
  geocodeLocation,
  buildCompanyGeoQuery,
  isGeocodingEnabled,
} from "@/lib/geocode";
import { db } from "@/lib/db";
import { companies, companyCapabilities, companyCapabilitiesRef, companyMarkets, markets, companyStandards, standardsRef, companyVerificationRequests } from "@/lib/db/schema/app";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  isReviewableField,
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

    // Check access (company member/owner or superadmin)
    const [hasAccess, isSuperadmin] = await Promise.all([
      isCompanyMember(user.id, companyId),
      checkSuperadminRole(user.id),
    ]);
    if (!hasAccess) {
      if (!isSuperadmin) {
        throw new AuthError("No access to this company");
      }
    }

    // Fetch company
    const companyResult = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    const company = companyResult[0] ?? null;
    if (!company) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    const isOwner = company.userId === user.id;

    // Fetch capabilities via join
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

    // Fetch markets via join
    const marketsData = await db
      .select({
        id: markets.id,
        name: markets.name,
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
        name: standardsRef.name,
        parentId: standardsRef.parentId,
        sortOrder: standardsRef.sortOrder,
      })
      .from(companyStandards)
      .innerJoin(standardsRef, eq(companyStandards.standardId, standardsRef.id))
      .where(eq(companyStandards.companyId, companyId));

    // Include pending changes info for company members
    const isMember = hasAccess;
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

    return apiResponse({
      company,
      isOwner,
      capabilities: capData,
      markets: marketsData,
      standards: standardsData,
      hasPendingChanges: isMember ? company.pendingChanges != null : undefined,
      pendingChanges: isMember ? company.pendingChanges : undefined,
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

    // Only owner, admin member, or superadmin can update
    const [memberRole, isSuperadmin] = await Promise.all([
      getCompanyMemberRole(user.id, companyId),
      checkSuperadminRole(user.id),
    ]);
    if (!memberRole && !isSuperadmin) {
      throw new AuthError("No access to this company");
    }
    if (memberRole && memberRole !== "admin" && !isSuperadmin) {
      throw new AuthError("Only company admins can update company details");
    }

    const body = await request.json();

    // Whitelist allowed fields
    const allowedFields = [
      "companyName", "description", "keyCapabilities", "postcode",
      "contactEmail", "websiteUrl", "contactPhone", "operationLocations",
      "certifications", "pastProjects", "address", "companiesHouseNumber",
      "contactPerson", "equipment",
    ];

    // Fetch current company data
    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0]);

    if (!company) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    const isVerified = company.verificationStatus === "verified";

    // Split fields into reviewable and non-reviewable
    const directUpdates: Partial<typeof companies.$inferInsert> = {};
    const reviewableUpdates: Record<string, string | null> = {};

    for (const field of allowedFields) {
      if (!(field in body)) continue;
      if (isVerified && isReviewableField(field)) {
        reviewableUpdates[field] = body[field] ?? null;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (directUpdates as any)[field] = body[field];
      }
    }

    // For verified companies, check edit lock before accepting reviewable changes
    if (isVerified && Object.keys(reviewableUpdates).length > 0) {
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
    if (isVerified && Object.keys(reviewableUpdates).length > 0) {
      if (!pendingChanges) {
        pendingChanges = { lastSavedAt: new Date().toISOString() };
      }
      if (!pendingChanges.scalarFields) {
        pendingChanges.scalarFields = {};
      }
      for (const [field, proposedValue] of Object.entries(reviewableUpdates)) {
        const currentValue = (company as Record<string, unknown>)[field as ReviewableScalarField] as string | null;
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
    if (isVerified && Object.keys(reviewableUpdates).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (dbUpdate as any).pendingChanges = pendingChanges;
    }

    const data = await db
      .update(companies)
      .set(dbUpdate)
      .where(eq(companies.id, companyId))
      .returning();

    if (!data[0]) {
      return apiResponse({ error: "Company not found" }, 404);
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
