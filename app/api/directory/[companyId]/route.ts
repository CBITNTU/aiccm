import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companies, companyTaxonomies, taxonomies } from "@/lib/db/schema/app";
import { eq, and, or } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    // TODO [MERGE]: migrate to Drizzle — HEAD used Supabase query with specific field selection:
    // const { data, error } = await supabase.from("companies").select(`id, company_name, ...`).eq("id", companyId)...

    // Fetch company - visible if active or owned by user
    const companyRows = await db
      .select()
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

    // TODO [MERGE]: migrate capabilities, markets, standards to Drizzle
    // const { data: capData } = await supabase
    //   .from("company_capabilities")
    //   .select("company_capabilities_ref(id, name, category)")
    //   .eq("company_id", companyId);
    // const capabilities = (capData || []).map((cc: any) => cc.company_capabilities_ref).filter(Boolean);
    //
    // const { data: marketsData } = await supabase
    //   .from("company_markets")
    //   .select("markets(id, name, parent_id)")
    //   .eq("company_id", companyId);
    // ... (market parent resolution + standards fetching)

    return apiResponse({ company: responseData, isOwner, taxonomies: companyTaxonomyList });
  } catch (error) {
    return handleApiError(error);
  }
}
