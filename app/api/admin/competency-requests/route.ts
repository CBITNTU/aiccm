import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import {
  competencyChangeRequests,
  companies,
  companyCapabilitiesRef,
} from "@/lib/db/schema/app";
import { localizedName } from "@/lib/taxonomy/localizedName";
import { eq, desc, inArray } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const requests = await db
      .select({
        id: competencyChangeRequests.id,
        companyId: competencyChangeRequests.companyId,
        requestedBy: competencyChangeRequests.requestedBy,
        status: competencyChangeRequests.status,
        proposedAdditions: competencyChangeRequests.proposedAdditions,
        proposedRemovals: competencyChangeRequests.proposedRemovals,
        reviewNotes: competencyChangeRequests.reviewNotes,
        reviewedBy: competencyChangeRequests.reviewedBy,
        reviewedAt: competencyChangeRequests.reviewedAt,
        createdAt: competencyChangeRequests.createdAt,
        companyName: companies.companyName,
      })
      .from(competencyChangeRequests)
      .innerJoin(companies, eq(competencyChangeRequests.companyId, companies.id))
      .orderBy(desc(competencyChangeRequests.createdAt));

    // Resolve capability names for additions and removals
    const allCapIds = new Set<string>();
    for (const req of requests) {
      for (const id of (req.proposedAdditions as string[]) ?? []) allCapIds.add(id);
      for (const id of (req.proposedRemovals as string[]) ?? []) allCapIds.add(id);
    }

    let capabilityMap: Record<string, string> = {};
    if (allCapIds.size > 0) {
      const caps = await db
        .select({ id: companyCapabilitiesRef.id, name: localizedName(companyCapabilitiesRef.name, companyCapabilitiesRef.nameZh) })
        .from(companyCapabilitiesRef)
        .where(inArray(companyCapabilitiesRef.id, Array.from(allCapIds)));
      capabilityMap = Object.fromEntries(caps.map((c) => [c.id, c.name]));
    }

    return apiResponse({ requests, capabilityMap });
  } catch (error) {
    return handleApiError(error);
  }
}
