import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import {
  companyVerificationRequests,
  companies,
  companyCapabilities,
  companyCapabilitiesRef,
  companyMarkets,
  markets,
  companyStandards,
  standardsRef,
  profiles,
} from "@/lib/db/schema/app";
import { eq, desc, and, ne } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const { requestId } = await params;

    // Get the verification request
    const verificationRequest = await db
      .select()
      .from(companyVerificationRequests)
      .where(eq(companyVerificationRequests.id, requestId))
      .then((rows) => rows[0]);

    if (!verificationRequest) {
      return apiResponse({ error: "Verification request not found" }, 404);
    }

    const companyId = verificationRequest.companyId;

    // Fetch all data in parallel
    const [
      companyResult,
      capData,
      marketsData,
      standardsData,
      previousRequests,
      submitterProfile,
    ] = await Promise.all([
      // Full company data
      db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null),

      // Company capabilities
      db
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
        .where(eq(companyCapabilities.companyId, companyId)),

      // Company markets
      db
        .select({
          id: markets.id,
          name: markets.name,
          parentId: markets.parentId,
          sortOrder: markets.sortOrder,
        })
        .from(companyMarkets)
        .innerJoin(markets, eq(companyMarkets.marketId, markets.id))
        .where(eq(companyMarkets.companyId, companyId)),

      // Company standards
      db
        .select({
          id: standardsRef.id,
          name: standardsRef.name,
          parentId: standardsRef.parentId,
          sortOrder: standardsRef.sortOrder,
        })
        .from(companyStandards)
        .innerJoin(standardsRef, eq(companyStandards.standardId, standardsRef.id))
        .where(eq(companyStandards.companyId, companyId)),

      // Previous verification requests (excluding current)
      db
        .select()
        .from(companyVerificationRequests)
        .where(
          and(
            eq(companyVerificationRequests.companyId, companyId),
            ne(companyVerificationRequests.id, requestId),
          ),
        )
        .orderBy(desc(companyVerificationRequests.createdAt)),

      // Submitter profile
      db
        .select({
          firstName: profiles.firstName,
          lastName: profiles.lastName,
          email: profiles.email,
          jobTitle: profiles.jobTitle,
        })
        .from(profiles)
        .where(eq(profiles.userId, verificationRequest.submittedBy))
        .then((rows) => rows[0] ?? null),
    ]);

    if (!companyResult) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    return apiResponse({
      request: verificationRequest,
      company: companyResult,
      capabilities: capData,
      markets: marketsData,
      standards: standardsData,
      previousRequests,
      submitter: submitterProfile,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
