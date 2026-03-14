import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";
import { eq, and, asc } from "drizzle-orm";

const ADMIN_COMPANY_FIELD_MAP: Record<string, keyof typeof companies.$inferInsert> =
  {
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

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const data = await db
      .select()
      .from(companies)
      .orderBy(asc(companies.companyName));

    return apiResponse({ companies: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const body = (await request.json()) as Record<string, unknown>;

    // Check for existing company with same name
    if (body.company_name || body.companyName) {
      const name = body.company_name || body.companyName;
      const existingRows = await db
        .select({ id: companies.id })
        .from(companies)
        .where(
          and(
            eq(companies.companyName, name),
            eq(companies.isSystemCompany, true),
          ),
        )
        .limit(1);

      if (existingRows[0]) {
        return apiResponse({ company: existingRows[0], alreadyExists: true });
      }
    }

    const insertData = mapAdminCompanyPayload(body);

    const result = await db
      .insert(companies)
      .values(insertData)
      .returning();

    return apiResponse({ company: result[0] });
  } catch (error) {
    return handleApiError(error);
  }
}
