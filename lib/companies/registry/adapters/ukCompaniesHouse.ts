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

/** Strip tags from a fragment of Companies House markup and collapse whitespace. */
function toText(fragment: string): string {
  return fragment
    .replace(/<br\s*\/?>/gi, ", ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Read the inner text of the element carrying `id`. Anchoring on the id rather
 * than on a label + sibling `<dd>` matters: the registered-office `<dd>` carries
 * no class of its own (the classes sit on an inner `<span id="roa-address">`), so
 * a label-anchored search skips it and lands on the next `<dd>` — the company
 * status — silently turning the address into "Active"/"Dissolved".
 */
function textById(html: string, id: string): string | undefined {
  const match = html.match(
    new RegExp(`<(\\w+)[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</\\1>`, "i"),
  );
  if (!match) return undefined;
  const text = toText(match[2]);
  return text || undefined;
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

    // No `<title>` fallback: the page title is the literal string "GOV.UK", so
    // falling back to it would name every company "GOV.UK" instead of failing.
    const nameMatch = html.match(
      /<h1[^>]*class="[^"]*heading-xlarge[^"]*"[^>]*>([^<]+)<\/h1>/i,
    );
    const companyName = nameMatch ? toText(nameMatch[1]) : undefined;

    const registeredAddress =
      textById(html, "roa-address") ??
      // Secondary: the whole registered-office `<dd>`, nested markup included.
      (() => {
        const m = html.match(
          /Registered office address\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i,
        );
        return m ? toText(m[1]) || undefined : undefined;
      })();

    const companyStatus = textById(html, "company-status");
    const companyType = textById(html, "company-type-value");

    // Fail loudly: an empty address is indistinguishable from "company has no
    // registered address", and callers write this straight into companies.address.
    if (!companyName || !registeredAddress) {
      return {
        found: false,
        error: "Could not parse company data from Companies House",
      };
    }

    return {
      found: true,
      data: {
        companyName,
        registeredAddress,
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
