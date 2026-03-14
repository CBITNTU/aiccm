import { NextRequest, NextResponse } from "next/server";
import { apiResponse } from "@/lib/api";
import { handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companies, companyTaxonomies, taxonomies } from "@/lib/db/schema/app";
import { eq, and, isNotNull } from "drizzle-orm";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params;

    if (!UUID_REGEX.test(companyId)) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // TODO [MERGE]: migrate to Drizzle — HEAD used Supabase query with field selection:
    // const { data, error } = await supabase.from("companies").select(`id, company_name, ...`).eq("id", companyId)...

    const companyResult = await db
      .select({
        id: companies.id,
        companyName: companies.companyName,
        description: companies.description,
        keyCapabilities: companies.keyCapabilities,
        postcode: companies.postcode,
        certifications: companies.certifications,
        equipment: companies.equipment,
        pastProjects: companies.pastProjects,
        isSystemCompany: companies.isSystemCompany,
        status: companies.status,
        marketPosition: companies.marketPosition,
        safetyRating: companies.safetyRating,
        digitalMaturity: companies.digitalMaturity,
        aiCompetencies: companies.aiCompetencies,
        aiCapabilities: companies.aiCapabilities,
        aiAnalysis: companies.aiAnalysis,
        createdAt: companies.createdAt,
        updatedAt: companies.updatedAt,
        websiteUrl: companies.websiteUrl,
      })
      .from(companies)
      .where(
        and(
          eq(companies.id, companyId),
          eq(companies.status, "active"),
          isNotNull(companies.userId),
        ),
      )
      .limit(1);

    const company = companyResult[0] ?? null;
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Fetch taxonomies via join
    const taxData = await db
      .select({
        id: taxonomies.id,
        name: taxonomies.name,
      })
      .from(companyTaxonomies)
      .innerJoin(taxonomies, eq(companyTaxonomies.taxonomyId, taxonomies.id))
      .where(eq(companyTaxonomies.companyId, companyId));

    const filteredTaxonomies = taxData.filter((t) => !!t.name);

    return apiResponse({ company, taxonomies: filteredTaxonomies });
  } catch (error) {
    return handleApiError(error);
  }
}
