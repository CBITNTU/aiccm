import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companies, companyTaxonomies, taxonomies, companyCapabilities, companyCapabilitiesRef, companyMarkets, markets, companyStandards, standardsRef } from "@/lib/db/schema/app";
import { companyColumnsNoEmbedding } from "@/lib/db/columns";
import { eq, and, or } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    // Fetch company - visible if active or owned by user
    const companyRows = await db
      .select(companyColumnsNoEmbedding)
      .from(companies)
      .where(
        and(
          eq(companies.id, companyId),
          or(
            eq(companies.status, "active"),
            eq(companies.userId, user.id),
          ),
        ),
      )
      .limit(1);

    const companyData = companyRows[0];
    if (!companyData) {
      throw new Error("Company not found");
    }

    const isOwner = companyData.userId === user.id;

    // Build public response (exclude sensitive fields)
    const {
      userId: _uid,
      contactEmail,
      contactPhone,
      companiesHouseNumber,
      ...publicData
    } = companyData;

    let responseData: Record<string, unknown> = { ...publicData };

    // Include contact fields only for the owner
    if (isOwner) {
      responseData = {
        ...responseData,
        contactEmail,
        contactPhone,
        companiesHouseNumber,
      };
    }

    // Fetch taxonomies for the company
    const taxData = await db
      .select({
        taxonomyId: companyTaxonomies.taxonomyId,
        id: taxonomies.id,
        name: taxonomies.name,
      })
      .from(companyTaxonomies)
      .innerJoin(taxonomies, eq(companyTaxonomies.taxonomyId, taxonomies.id))
      .where(eq(companyTaxonomies.companyId, companyId));

    const companyTaxonomyList = taxData
      .filter((t) => t.name)
      .map((t) => ({ id: t.id, name: t.name }));

    // Fetch capabilities
    const capData = await db
      .select({
        id: companyCapabilitiesRef.id,
        name: companyCapabilitiesRef.name,
        category: companyCapabilitiesRef.category,
      })
      .from(companyCapabilities)
      .innerJoin(companyCapabilitiesRef, eq(companyCapabilities.capabilityId, companyCapabilitiesRef.id))
      .where(eq(companyCapabilities.companyId, companyId));

    // Fetch markets
    const marketsData = await db
      .select({
        id: markets.id,
        name: markets.name,
        parentId: markets.parentId,
      })
      .from(companyMarkets)
      .innerJoin(markets, eq(companyMarkets.marketId, markets.id))
      .where(eq(companyMarkets.companyId, companyId));

    // Fetch standards
    const standardsData = await db
      .select({
        id: standardsRef.id,
        name: standardsRef.name,
        parentId: standardsRef.parentId,
      })
      .from(companyStandards)
      .innerJoin(standardsRef, eq(companyStandards.standardId, standardsRef.id))
      .where(eq(companyStandards.companyId, companyId));

    return apiResponse({ company: responseData, isOwner, taxonomies: companyTaxonomyList, capabilities: capData, markets: marketsData, standards: standardsData });
  } catch (error) {
    return handleApiError(error);
  }
}
