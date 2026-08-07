import { NextRequest } from "next/server";
import { apiResponse, getAuthenticatedUser } from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { companies, companyMembers } from "@/lib/db/schema/app";
import { eq, and } from "drizzle-orm";
import { getRegistryAdapter } from "@/lib/companies/registry";

interface LookupCompanyRequest {
  companyNumber: string;
}

interface LookupCompanyResponse {
  success: boolean;
  error?: string;
  errorCode?: "INVALID_FORMAT" | "DUPLICATE" | "NOT_FOUND" | "FETCH_ERROR";
  /** True when this region has no automated registry — caller proceeds to manual entry. */
  manualEntry?: boolean;
  data?: {
    companyName: string;
    registeredAddress: string;
    companyStatus: string;
    companyType?: string;
    /** Canonical form of the submitted number — clients should display this. */
    companyNumber: string;
  };
  existingCompany?: {
    id: string;
    companyName: string;
    hasAdmin: boolean;
  };
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser(request);
    // Require authentication: this endpoint discloses whether a company is already
    // registered (name + whether it has an admin) and proxies an external registry
    // lookup, so it must not be callable anonymously.
    if (!user) {
      return apiResponse<LookupCompanyResponse>(
        {
          success: false,
          error: "Authentication required",
          errorCode: "FETCH_ERROR",
        },
        401,
      );
    }
    const userId = user.id;

    const body: LookupCompanyRequest = await request.json();
    const { companyNumber } = body;

    if (!companyNumber) {
      return apiResponse<LookupCompanyResponse>({
        success: false,
        error: "Company number is required",
        errorCode: "INVALID_FORMAT",
      });
    }

    const registry = getRegistryAdapter();
    const normalizedNumber = registry.normalizeNumber(companyNumber);
    if (!normalizedNumber) {
      return apiResponse<LookupCompanyResponse>({
        success: false,
        error:
          "Invalid company number format. Must be 8 digits or 2 letters followed by 6 digits (e.g., SC123456).",
        errorCode: "INVALID_FORMAT",
      });
    }

    // Check for duplicate company in database
    const existingResult = await db
      .select({ id: companies.id, companyName: companies.companyName })
      .from(companies)
      .where(eq(companies.companiesHouseNumber, normalizedNumber))
      .limit(1);

    const existingCompany = existingResult[0];
    if (existingCompany) {
      // Check if company has any approved admins
      const adminCheck = await db
        .select({ id: companyMembers.id })
        .from(companyMembers)
        .where(
          and(
            eq(companyMembers.companyId, existingCompany.id),
            eq(companyMembers.role, "admin"),
            eq(companyMembers.status, "approved"),
          ),
        )
        .limit(1);

      return apiResponse<LookupCompanyResponse>({
        success: false,
        error: "This company is already registered on our platform.",
        errorCode: "DUPLICATE",
        existingCompany: {
          id: existingCompany.id,
          companyName: existingCompany.companyName,
          hasAdmin: adminCheck.length > 0,
        },
      });
    }

    // Regions without an automated registry (e.g. CN/TH): accept the number and
    // let onboarding proceed to manual entry / manual verification.
    if (!registry.supportsLookup || !registry.lookup) {
      return apiResponse<LookupCompanyResponse>({
        success: true,
        manualEntry: true,
      });
    }

    // Automated registry lookup (UK Companies House).
    const lookupResult = await registry.lookup(normalizedNumber);

    if (!lookupResult.found || !lookupResult.data) {
      return apiResponse<LookupCompanyResponse>({
        success: false,
        error: lookupResult.error || "Company not found",
        errorCode: "NOT_FOUND",
      });
    }

    await logApiEvent(request, {
      actionType: "company_searched",
      userId: userId || undefined,
      details: { companyNumber: normalizedNumber, found: true },
    }).catch(() => {});

    return apiResponse<LookupCompanyResponse>({
      success: true,
      data: { ...lookupResult.data, companyNumber: normalizedNumber },
    });
  } catch (error) {
    console.error("Lookup company error:", error);
    return apiResponse<LookupCompanyResponse>({
      success: false,
      error: "An unexpected error occurred",
      errorCode: "FETCH_ERROR",
    });
  }
}
