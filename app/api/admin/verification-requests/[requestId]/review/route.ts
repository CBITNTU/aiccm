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
import { eq, desc, and, ne, inArray } from "drizzle-orm";
import type { PendingChanges } from "@/lib/companyFieldCategories";

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

    // For change_review requests, resolve capability/market/standard names in the snapshot
    let resolvedPendingChanges = null;
    if (verificationRequest.requestType === "change_review" && verificationRequest.pendingChangesSnapshot) {
      const snapshot = verificationRequest.pendingChangesSnapshot as PendingChanges;
      const resolved: Record<string, unknown> = { ...snapshot };

      // Resolve capability names
      if (snapshot.capabilities) {
        const allCapIds = [...new Set([...snapshot.capabilities.current, ...snapshot.capabilities.proposed])];
        if (allCapIds.length > 0) {
          const capNames = await db
            .select({ id: companyCapabilitiesRef.id, name: companyCapabilitiesRef.name, category: companyCapabilitiesRef.category })
            .from(companyCapabilitiesRef)
            .where(inArray(companyCapabilitiesRef.id, allCapIds));
          const capMap = Object.fromEntries(capNames.map((c) => [c.id, { name: c.name, category: c.category }]));
          resolved.capabilities = {
            ...snapshot.capabilities,
            currentNames: snapshot.capabilities.current.map((id) => capMap[id] ?? { name: id, category: "" }),
            proposedNames: snapshot.capabilities.proposed.map((id) => capMap[id] ?? { name: id, category: "" }),
            addedNames: snapshot.capabilities.added.map((id) => capMap[id] ?? { name: id, category: "" }),
            removedNames: snapshot.capabilities.removed.map((id) => capMap[id] ?? { name: id, category: "" }),
          };
        }
      }

      // Resolve market names
      if (snapshot.markets) {
        const allMarketIds = [...new Set([...snapshot.markets.current, ...snapshot.markets.proposed])];
        if (allMarketIds.length > 0) {
          const marketNames = await db
            .select({ id: markets.id, name: markets.name })
            .from(markets)
            .where(inArray(markets.id, allMarketIds));
          const marketMap = Object.fromEntries(marketNames.map((m) => [m.id, m.name]));
          resolved.markets = {
            ...snapshot.markets,
            currentNames: snapshot.markets.current.map((id) => marketMap[id] ?? id),
            proposedNames: snapshot.markets.proposed.map((id) => marketMap[id] ?? id),
            addedNames: snapshot.markets.added.map((id) => marketMap[id] ?? id),
            removedNames: snapshot.markets.removed.map((id) => marketMap[id] ?? id),
          };
        }
      }

      // Resolve standard names
      if (snapshot.standards) {
        const allStdIds = [...new Set([...snapshot.standards.current, ...snapshot.standards.proposed])];
        if (allStdIds.length > 0) {
          const stdNames = await db
            .select({ id: standardsRef.id, name: standardsRef.name })
            .from(standardsRef)
            .where(inArray(standardsRef.id, allStdIds));
          const stdMap = Object.fromEntries(stdNames.map((s) => [s.id, s.name]));
          resolved.standards = {
            ...snapshot.standards,
            currentNames: snapshot.standards.current.map((id) => stdMap[id] ?? id),
            proposedNames: snapshot.standards.proposed.map((id) => stdMap[id] ?? id),
            addedNames: snapshot.standards.added.map((id) => stdMap[id] ?? id),
            removedNames: snapshot.standards.removed.map((id) => stdMap[id] ?? id),
          };
        }
      }

      resolvedPendingChanges = resolved;
    }

    return apiResponse({
      request: verificationRequest,
      company: companyResult,
      capabilities: capData,
      markets: marketsData,
      standards: standardsData,
      previousRequests,
      submitter: submitterProfile,
      resolvedPendingChanges,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
