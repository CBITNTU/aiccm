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
import { companies, companyCapabilities, companyCapabilitiesRef, companyMarkets, markets, companyStandards, standardsRef } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

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

    return apiResponse({ company, isOwner, capabilities: capData, markets: marketsData, standards: standardsData });
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

    // Whitelist allowed fields (use camelCase for Drizzle)
    const fieldMap: Record<string, keyof typeof companies.$inferInsert> = {
      companyName: "companyName",
      description: "description",
      keyCapabilities: "keyCapabilities",
      postcode: "postcode",
      contactEmail: "contactEmail",
      websiteUrl: "websiteUrl",
      contactPhone: "contactPhone",
      operationLocations: "operationLocations",
      certifications: "certifications",
      pastProjects: "pastProjects",
    };

    const updates: Partial<typeof companies.$inferInsert> = {};
    for (const [field, camelField] of Object.entries(fieldMap)) {
      if (field in body) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (updates as any)[camelField] = body[field];
      }
    }

    // Auto-geocode when postcode or address changes
    if (isGeocodingEnabled() && ("postcode" in body || "address" in body)) {
      const geoQuery = buildCompanyGeoQuery(
        (body.address as string) ?? null,
        (body.postcode as string) ?? null,
      );
      if (geoQuery) {
        const coords = await geocodeLocation(geoQuery);
        if (coords) {
          updates.latitude = coords.lat;
          updates.longitude = coords.lng;
        }
      }
    }

    const data = await db
      .update(companies)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(companies.id, companyId))
      .returning();

    if (!data[0]) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    return apiResponse({ company: data[0] });
  } catch (error) {
    return handleApiError(error);
  }
}
