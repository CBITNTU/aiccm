import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";
import {
  geocodeLocation,
  buildCompanyGeoQuery,
  isGeocodingEnabled,
} from "@/lib/geocode";
import { db } from "@/lib/db";
import { companies, companyCapabilities, companyCapabilitiesRef } from "@/lib/db/schema/app";
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

    // TODO [MERGE]: migrate markets/standards to Drizzle
    // const { data: marketsData } = await supabase
    //   .from("company_markets")
    //   .select("markets(id, name, parent_id, sort_order)")
    //   .eq("company_id", companyId);
    // const markets = (marketsData || []).map((cm: any) => cm.markets).filter(Boolean);
    //
    // const { data: standardsData } = await supabase
    //   .from("company_standards")
    //   .select("standards_ref(id, name, parent_id, sort_order)")
    //   .eq("company_id", companyId);
    // const standards = (standardsData || []).map((cs: any) => cs.standards_ref).filter(Boolean);

    return apiResponse({ company, isOwner, capabilities: capData });
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

    // Only owner or member can update
    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

    const body = await request.json();

    // Whitelist allowed fields (use camelCase for Drizzle)
    const fieldMap: Record<string, keyof typeof companies.$inferInsert> = {
      company_name: "companyName",
      description: "description",
      key_capabilities: "keyCapabilities",
      postcode: "postcode",
      contact_email: "contactEmail",
      website_url: "websiteUrl",
      contact_phone: "contactPhone",
      operation_locations: "operationLocations",
      certifications: "certifications",
      past_projects: "pastProjects",
    };

    const updates: Partial<typeof companies.$inferInsert> = {};
    for (const [snakeField, camelField] of Object.entries(fieldMap)) {
      if (snakeField in body) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (updates as any)[camelField] = body[snakeField];
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
