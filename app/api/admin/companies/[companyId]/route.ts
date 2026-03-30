import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

const ADMIN_COMPANY_FIELD_MAP: Record<string, keyof typeof companies.$inferInsert> =
  {
    matching_runs_limit: "matchingRunsLimit",
    analysis_runs_limit: "analysisRunsLimit",
    company_name: "companyName",
    companies_house_number: "companiesHouseNumber",
    website_url: "websiteUrl",
    contact_email: "contactEmail",
    contact_phone: "contactPhone",
    contact_person: "contactPerson",
    key_capabilities: "keyCapabilities",
    past_projects: "pastProjects",
    is_system_company: "isSystemCompany",
    user_id: "userId",
    ai_summary: "aiSummary",
    ai_capability_taxonomy: "aiCapabilityTaxonomy",
    ai_capabilities: "aiCapabilities",
    ai_competencies: "aiCompetencies",
    ai_strengths: "aiStrengths",
    ai_certifications: "aiCertifications",
    ai_recommendations: "aiRecommendations",
    ai_analysis: "aiAnalysis",
    safety_rating: "safetyRating",
    digital_maturity: "digitalMaturity",
    market_position: "marketPosition",
    system_extracted: "systemExtracted",
    human_verified: "humanVerified",
    financial_data: "financialData",
    compliance_data: "complianceData",
    consent_data_fetch: "consentDataFetch",
    operation_locations: "operationLocations",
    taxonomy_generated_at: "taxonomyGeneratedAt",
    summary_generated_at: "summaryGeneratedAt",
    content_hash: "contentHash",
  };

function mapAdminCompanyPayload(
  payload: Record<string, unknown>,
): Partial<typeof companies.$inferInsert> {
  const mapped: Partial<typeof companies.$inferInsert> = {};
  for (const [key, value] of Object.entries(payload)) {
    const targetKey = (ADMIN_COMPANY_FIELD_MAP[key] ??
      (key as keyof typeof companies.$inferInsert)) as keyof typeof companies.$inferInsert;
    mapped[targetKey] = value as never;
  }
  return mapped;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const { companyId } = await params;

    await db.delete(companies).where(eq(companies.id, companyId));

    return apiResponse({ success: true });
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
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const { companyId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const updateData = mapAdminCompanyPayload(body);

    const result = await db
      .update(companies)
      .set(updateData)
      .where(eq(companies.id, companyId))
      .returning();

    if (result.length === 0) {
      throw new Error("Company not found");
    }

    return apiResponse({ company: result[0] });
  } catch (error) {
    return handleApiError(error);
  }
}
