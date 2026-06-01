import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  AuthError,
  sanitizeLikeParam,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";
import { eq, and, asc, count, ilike, isNull, or, type SQL } from "drizzle-orm";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

type CompanyListType = "user" | "system";
type VerificationStatusFilter = "all" | "unverified" | "pending_verification" | "verified";
const VERIFICATION_STATUS_FILTERS = new Set<string>([
  "all",
  "unverified",
  "pending_verification",
  "verified",
]);

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

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toCount(value: number | string | bigint | undefined): number {
  return Number(value ?? 0);
}

function parseVerificationStatus(value: string | null): VerificationStatusFilter {
  if (value && VERIFICATION_STATUS_FILTERS.has(value)) {
    return value as VerificationStatusFilter;
  }

  return "all";
}

function userCompanyCondition(): SQL {
  return or(
    eq(companies.isSystemCompany, false),
    isNull(companies.isSystemCompany),
  )!;
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const url = new URL(request.url);
    const typeParam = url.searchParams.get("type");
    const listType: CompanyListType = typeParam === "system" ? "system" : "user";
    const page = parsePositiveInt(url.searchParams.get("page"), 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      parsePositiveInt(url.searchParams.get("pageSize"), DEFAULT_PAGE_SIZE),
    );
    const verificationStatus = parseVerificationStatus(
      url.searchParams.get("verificationStatus"),
    );
    const search = sanitizeLikeParam(url.searchParams.get("search") || "");
    const offset = (page - 1) * pageSize;

    const filters: SQL[] = [
      listType === "system"
        ? eq(companies.isSystemCompany, true)
        : userCompanyCondition(),
    ];

    if (listType === "user" && verificationStatus !== "all") {
      filters.push(eq(companies.verificationStatus, verificationStatus));
    }

    if (search) {
      filters.push(
        or(
          ilike(companies.companyName, `%${search}%`),
          ilike(companies.description, `%${search}%`),
        )!,
      );
    }

    const whereClause = and(...filters);

    const [
      totalCompaniesResult,
      userCompaniesResult,
      systemCompaniesResult,
      verifiedCompaniesResult,
      pendingCompaniesResult,
      unverifiedCompaniesResult,
      filteredCountResult,
      data,
    ] = await Promise.all([
      db.select({ count: count() }).from(companies),
      db
        .select({ count: count() })
        .from(companies)
        .where(userCompanyCondition()),
      db
        .select({ count: count() })
        .from(companies)
        .where(eq(companies.isSystemCompany, true)),
      db
        .select({ count: count() })
        .from(companies)
        .where(
          and(
            userCompanyCondition(),
            eq(companies.verificationStatus, "verified"),
          ),
        ),
      db
        .select({ count: count() })
        .from(companies)
        .where(
          and(
            userCompanyCondition(),
            eq(companies.verificationStatus, "pending_verification"),
          ),
        ),
      db
        .select({ count: count() })
        .from(companies)
        .where(
          and(
            userCompanyCondition(),
            eq(companies.verificationStatus, "unverified"),
          ),
        ),
      db.select({ count: count() }).from(companies).where(whereClause),
      db
        .select({
          id: companies.id,
          userId: companies.userId,
          companyName: companies.companyName,
          companiesHouseNumber: companies.companiesHouseNumber,
          websiteUrl: companies.websiteUrl,
          contactEmail: companies.contactEmail,
          contactPhone: companies.contactPhone,
          contactPerson: companies.contactPerson,
          description: companies.description,
          keyCapabilities: companies.keyCapabilities,
          certifications: companies.certifications,
          equipment: companies.equipment,
          pastProjects: companies.pastProjects,
          address: companies.address,
          postcode: companies.postcode,
          status: companies.status,
          createdAt: companies.createdAt,
          updatedAt: companies.updatedAt,
          isSystemCompany: companies.isSystemCompany,
          verificationStatus: companies.verificationStatus,
          verifiedAt: companies.verifiedAt,
          matchingRunsLimit: companies.matchingRunsLimit,
          analysisRunsLimit: companies.analysisRunsLimit,
        })
        .from(companies)
        .where(whereClause)
        .orderBy(asc(companies.companyName))
        .limit(pageSize)
        .offset(offset),
    ]);

    const totalCount = toCount(filteredCountResult[0]?.count);
    const totalPages = Math.ceil(totalCount / pageSize);

    return apiResponse({
      companies: data,
      page,
      pageSize,
      totalCount,
      totalPages,
      stats: {
        total: toCount(totalCompaniesResult[0]?.count),
        user: toCount(userCompaniesResult[0]?.count),
        system: toCount(systemCompaniesResult[0]?.count),
        verified: toCount(verifiedCompaniesResult[0]?.count),
        pending: toCount(pendingCompaniesResult[0]?.count),
        unverified: toCount(unverifiedCompaniesResult[0]?.count),
      },
    });
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
      const name = (body.company_name || body.companyName) as string;
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
      .values(insertData as typeof companies.$inferInsert)
      .returning();

    return apiResponse({ company: result[0] });
  } catch (error) {
    return handleApiError(error);
  }
}
