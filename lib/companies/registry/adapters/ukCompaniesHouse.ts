import type { CompanyLookupResult, CompanyRegistryAdapter } from "../types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36";

function normalizeCompanyNumber(companyNumber: string): string | null {
  const clean = companyNumber.replace(/\s/g, "").toUpperCase();
  if (/^\d{1,8}$/.test(clean)) {
    return clean.padStart(8, "0");
  }
  if (/^(SC|NI|OC|SO|NC|NL|R0|IP|SP|IC|SI|NP)\d{6}$/.test(clean)) {
    return clean;
  }
  return null;
}

async function lookup(companyNumber: string): Promise<CompanyLookupResult> {
  const url = `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-GB,en;q=0.9",
      },
      // Bound the lookup so a hanging upstream can't stall the request.
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 404) {
      return { found: false, error: "Company not found on Companies House" };
    }
    if (!response.ok) {
      return { found: false, error: `Companies House returned ${response.status}` };
    }

    const html = await response.text();

    const nameMatch =
      html.match(/<h1[^>]*class="[^"]*heading-xlarge[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
      html.match(/<title>([^-<]+)/i);
    const companyName = nameMatch
      ? nameMatch[1].trim().replace(/\s+/g, " ")
      : undefined;

    const statusMatch =
      html.match(/<dd[^>]*id="company-status"[^>]*>([^<]+)<\/dd>/i) ||
      html.match(/Company status[^<]*<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/i);
    const companyStatus = statusMatch ? statusMatch[1].trim() : undefined;

    const addressMatch = html.match(
      /Registered office address[\s\S]*?<dd[^>]*class="[^"]*text[^"]*"[^>]*>([\s\S]*?)<\/dd>/i,
    );
    let registeredAddress: string | undefined;
    if (addressMatch) {
      registeredAddress = addressMatch[1]
        .replace(/<br\s*\/?>/gi, ", ")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    const typeMatch = html.match(/Company type[^<]*<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/i);
    const companyType = typeMatch ? typeMatch[1].trim() : undefined;

    if (!companyName) {
      return {
        found: false,
        error: "Could not parse company data from Companies House",
      };
    }

    return {
      found: true,
      data: {
        companyName,
        registeredAddress: registeredAddress || "",
        companyStatus: companyStatus || "Unknown",
        companyType,
      },
    };
  } catch (error) {
    console.error("Companies House fetch error:", error);
    return { found: false, error: "Failed to connect to Companies House" };
  }
}

export const ukCompaniesHouseAdapter: CompanyRegistryAdapter = {
  id: "uk_companies_house",
  supportsLookup: true,
  supportsEnrichment: true,
  normalizeNumber: normalizeCompanyNumber,
  validate: (input) => normalizeCompanyNumber(input) !== null,
  lookup,
};
