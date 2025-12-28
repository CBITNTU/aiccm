import { NextRequest } from "next/server";
import { createAdminClient, apiResponse, apiError } from "@/lib/api";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36";

interface LookupCompanyRequest {
  companyNumber: string;
}

interface LookupCompanyResponse {
  success: boolean;
  error?: string;
  errorCode?: "INVALID_FORMAT" | "DUPLICATE" | "NOT_FOUND" | "FETCH_ERROR";
  data?: {
    companyName: string;
    registeredAddress: string;
    companyStatus: string;
    companyType?: string;
  };
  existingCompany?: {
    id: string;
    company_name: string;
  };
}

/**
 * Validates and normalizes a UK company number.
 * Formats: 12345678, SC123456, NI123456, with optional leading zeros
 */
function normalizeCompanyNumber(companyNumber: string): string | null {
  const clean = companyNumber.replace(/\s/g, "").toUpperCase();

  // Standard 8-digit format
  if (/^\d{1,8}$/.test(clean)) {
    return clean.padStart(8, "0");
  }

  // Scottish (SC) or Northern Ireland (NI) format: 2 letters + 6 digits
  if (/^(SC|NI|OC|SO|NC|NL|R0|IP|SP|IC|SI|NP)\d{6}$/.test(clean)) {
    return clean;
  }

  return null;
}

/**
 * Fetches the Companies House page and extracts basic company information.
 * No AI involved - uses simple HTML parsing.
 */
async function fetchCompaniesHouseData(companyNumber: string): Promise<{
  found: boolean;
  companyName?: string;
  registeredAddress?: string;
  companyStatus?: string;
  companyType?: string;
  error?: string;
}> {
  const url = `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-GB,en;q=0.9",
      },
    });

    if (response.status === 404) {
      return { found: false, error: "Company not found on Companies House" };
    }

    if (!response.ok) {
      return { found: false, error: `Companies House returned ${response.status}` };
    }

    const html = await response.text();

    // Extract company name from <h1> or title
    const nameMatch = html.match(/<h1[^>]*class="[^"]*heading-xlarge[^"]*"[^>]*>([^<]+)<\/h1>/i)
      || html.match(/<title>([^-<]+)/i);
    const companyName = nameMatch
      ? nameMatch[1].trim().replace(/\s+/g, " ")
      : undefined;

    // Extract company status
    const statusMatch = html.match(/<dd[^>]*id="company-status"[^>]*>([^<]+)<\/dd>/i)
      || html.match(/Company status[^<]*<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/i);
    const companyStatus = statusMatch
      ? statusMatch[1].trim()
      : undefined;

    // Extract registered address
    const addressMatch = html.match(
      /Registered office address[\s\S]*?<dd[^>]*class="[^"]*text[^"]*"[^>]*>([\s\S]*?)<\/dd>/i
    );
    let registeredAddress: string | undefined;
    if (addressMatch) {
      registeredAddress = addressMatch[1]
        .replace(/<br\s*\/?>/gi, ", ")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Extract company type
    const typeMatch = html.match(/Company type[^<]*<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/i);
    const companyType = typeMatch ? typeMatch[1].trim() : undefined;

    if (!companyName) {
      return { found: false, error: "Could not parse company data from Companies House" };
    }

    return {
      found: true,
      companyName,
      registeredAddress,
      companyStatus,
      companyType,
    };
  } catch (error) {
    console.error("Companies House fetch error:", error);
    return {
      found: false,
      error: "Failed to connect to Companies House",
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: LookupCompanyRequest = await request.json();
    const { companyNumber } = body;

    if (!companyNumber) {
      return apiResponse<LookupCompanyResponse>({
        success: false,
        error: "Company number is required",
        errorCode: "INVALID_FORMAT",
      });
    }

    // Normalize and validate company number
    const normalizedNumber = normalizeCompanyNumber(companyNumber);
    if (!normalizedNumber) {
      return apiResponse<LookupCompanyResponse>({
        success: false,
        error: "Invalid company number format. Must be 8 digits or 2 letters followed by 6 digits (e.g., SC123456).",
        errorCode: "INVALID_FORMAT",
      });
    }

    const supabase = createAdminClient();

    // Check for duplicate company in database
    const { data: existingCompany } = await supabase
      .from("companies")
      .select("id, company_name")
      .eq("companies_house_number", normalizedNumber)
      .single();

    if (existingCompany) {
      return apiResponse<LookupCompanyResponse>({
        success: false,
        error: "This company is already registered on our platform.",
        errorCode: "DUPLICATE",
        existingCompany: {
          id: existingCompany.id,
          company_name: existingCompany.company_name,
        },
      });
    }

    // Fetch data from Companies House
    const chData = await fetchCompaniesHouseData(normalizedNumber);

    if (!chData.found) {
      return apiResponse<LookupCompanyResponse>({
        success: false,
        error: chData.error || "Company not found on Companies House",
        errorCode: "NOT_FOUND",
      });
    }

    // Return success with company data
    return apiResponse<LookupCompanyResponse>({
      success: true,
      data: {
        companyName: chData.companyName!,
        registeredAddress: chData.registeredAddress || "",
        companyStatus: chData.companyStatus || "Unknown",
        companyType: chData.companyType,
      },
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
