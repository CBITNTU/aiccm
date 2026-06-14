import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";
import { companyColumnsNoEmbedding } from "@/lib/db/columns";
import { eq } from "drizzle-orm";
import { aiGenerateObject } from "@/lib/ai";
import { companyPrefillSchema, type CompanyPrefillData } from "@/lib/schemas/companyPrefill";
import { validateUrl } from "@/lib/api/validation";

const LOG = "[CompanyAI:enrich]";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Shared fetch / HTML utilities (also used by prefill-company-data route)
// ---------------------------------------------------------------------------

export async function safeFetch(
  url: string,
  opts: RequestInit = {},
): Promise<Response> {
  return fetch(url, {
    ...opts,
    headers: {
      "User-Agent": UA,
      "Accept-Language": "en-GB,en;q=0.9",
      ...opts.headers,
    },
  });
}

export function tidyHtml(html: string, max = 15000): string {
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  cleaned = cleaned.replace(/(<\/tr>|<\/td>|<\/th>)/gi, "$1\n");
  cleaned = cleaned.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");

  return cleaned.slice(0, max);
}

// ---------------------------------------------------------------------------
// Fetch raw HTML from external sources
// ---------------------------------------------------------------------------

interface FetchedSources {
  companiesHouseHtml: string;
  endoleHtml: string;
  websiteHtml: string;
  errors: string[];
}

export async function fetchCompanySources(
  companyName: string,
  companyNumber: string | null | undefined,
  websiteUrl: string | null | undefined,
): Promise<FetchedSources> {
  const result: FetchedSources = {
    companiesHouseHtml: "",
    endoleHtml: "",
    websiteHtml: "",
    errors: [],
  };

  // 1) Companies House
  if (companyNumber && companyNumber.length === 8) {
    try {
      const chUrl = `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}`;
      const chResponse = await safeFetch(chUrl);
      if (chResponse.ok) {
        result.companiesHouseHtml = tidyHtml(await chResponse.text(), 8000);
      } else {
        result.errors.push(`Companies House page HTTP ${chResponse.status}`);
      }
    } catch (e) {
      result.errors.push(
        `Companies House fetch error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // 2) Endole
  if (companyNumber && companyName) {
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const candidates = [
      `https://open.endole.co.uk/insight/company/${companyNumber}-${slug}`,
      `https://www.endole.co.uk/company/${companyNumber}/${slug}/`,
    ];
    for (const url of candidates) {
      try {
        const r = await safeFetch(url);
        if (r.ok) {
          const html = await r.text();
          if (html && html.length > 500) {
            result.endoleHtml = tidyHtml(html, 25000);
            break;
          }
        }
      } catch {
        // try next candidate
      }
    }
    if (!result.endoleHtml) {
      result.errors.push("Endole data not found or blocked");
    }
  }

  // 3) Website
  if (websiteUrl) {
    try {
      validateUrl(websiteUrl);
      const websiteResponse = await safeFetch(websiteUrl);
      if (websiteResponse.ok) {
        result.websiteHtml = tidyHtml(await websiteResponse.text(), 8000);
      } else {
        result.errors.push(`Website HTTP ${websiteResponse.status}`);
      }
    } catch (e) {
      result.errors.push(
        `Website fetch error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// AI normalization prompt (shared between prefill route & enrichment)
// ---------------------------------------------------------------------------

export const PREFILL_SYSTEM_PROMPT = `You are a company data extraction assistant specializing in UK company financial data.
You will receive (possibly partial) HTML from Companies House, Endole, and the company's website.
Your task is to extract and normalize the requested fields with high accuracy.

STRICT RULES (NO HALLUCINATIONS):
- Base ALL content ONLY on text provided. If a detail is not present, do NOT infer it.
- Financial data is CRITICAL: Look carefully in tables, rows, and labeled data sections.
- Endole HTML contains financial data in table format. Look for:
  * Table rows with labels like "Net Assets", "Total Assets", "Current Assets", "Total Liabilities"
  * "Cash", "Cash at Bank", "Cash & Cash Equivalents", "Creditors"
  * "Average Employees", "Employees", "Number of Employees"
  * Values are often formatted with commas (e.g., "1,234,567") or abbreviations (K, M, B)
- Convert abbreviated figures: K=1000, M=1000000, B=1000000000
- Remove commas and convert to integers (e.g., "1,234,567" → 1234567)
- Compute debtRatio = totalLiabilities / totalAssets (round to 3 decimals) when both > 0.
- Set confidence to 0.9 if data is clearly present, 0.5 if partially present, 0 if missing.

DESCRIPTION REQUIREMENTS (180-250 words):
Write a single cohesive paragraph (~180-250 words) that covers, in order, using only evidence found:
1) Who they are: legal name, trading name (if shown), incorporation year or age (only if explicitly stated).
2) What they do: core products/services and key capabilities/processes.
3) Sectors/markets: industries served and typical customer profiles.
4) Geography: headquarters and regions served (if stated).
5) Scale signals: employees (and revenue if present), facilities/equipment highlights (if stated).
6) Quality/compliance: certifications, accreditations, or regulatory notes (if stated).
7) Distinctives: specialisms, IP, or differentiators that are explicitly mentioned.
If any item is not present in the sources, omit it silently (do NOT invent or guess).

OTHER FIELDS:
- Capabilities/sectors/equipment/certifications: prefer website and Endole narrative/feature lists.
- Evidence must be one of: "endole", "companies_house", "website". Use the source you relied on most for each field.
- For compliance fields, if dates are visible in Companies House HTML, use them; otherwise leave blank with low confidence.`;

export function buildPrefillUserPrompt(
  companyName: string,
  companyNumber: string | null | undefined,
  sources: FetchedSources,
): string {
  return `Company Name: ${companyName}
Company Number: ${companyNumber || "N/A"}

--- Companies House (truncated HTML) ---
${sources.companiesHouseHtml || "Not available"}

--- Endole (CLEANED HTML - PRIMARY FOR FINANCE) ---
${sources.endoleHtml || "Not available"}

--- Website (truncated HTML) ---
${sources.websiteHtml || "Not available"}

Extract and structure the company information with confidence scores.

EXTRACTION RULES:
- CAREFULLY scan the entire Endole HTML for financial tables and rows
- Look for patterns like: <td>Net Assets</td><td>£1,234,567</td> or similar
- Financial data MUST be from "endole" when present - search thoroughly before marking as 0
- Strip currency symbols (£, $), commas, and whitespace from numbers
- Include "evidence" as exactly "endole", "companies_house", or "website"
- Set confidence=0.9 when data is clearly found, 0 when truly not present
- debtRatio must be computed when totalAssets and totalLiabilities are both > 0`;
}

export async function runPrefillAI(
  companyName: string,
  companyNumber: string | null | undefined,
  sources: FetchedSources,
): Promise<CompanyPrefillData> {
  return aiGenerateObject({
    schema: companyPrefillSchema,
    system: PREFILL_SYSTEM_PROMPT,
    prompt: buildPrefillUserPrompt(companyName, companyNumber, sources),
    temperature: 0.1,
    maxTokens: 8000,
  });
}

// ---------------------------------------------------------------------------
// Check if company needs enrichment
// ---------------------------------------------------------------------------

function isEmptyField(val: unknown): boolean {
  if (val === null || val === undefined || val === "") return true;
  if (typeof val === "string" && val.trim().length < 10) return true;
  if (typeof val === "object" && val !== null && Object.keys(val).length === 0) return true;
  return false;
}

/** Check if company data fields are sparse — ignores enrichment history */
export function companyHasSparseData(company: {
  description: string | null;
  keyCapabilities: string | null;
  certifications: string | null;
  equipment: string | null;
  pastProjects: string | null;
  financialData: unknown;
}): boolean {
  const fields = [
    company.description,
    company.keyCapabilities,
    company.certifications,
    company.equipment,
    company.pastProjects,
    company.financialData,
  ];
  const emptyCount = fields.filter(isEmptyField).length;
  return emptyCount >= 3;
}

export function companyNeedsEnrichment(company: {
  description: string | null;
  keyCapabilities: string | null;
  certifications: string | null;
  equipment: string | null;
  pastProjects: string | null;
  financialData: unknown;
  systemExtracted: unknown;
}): boolean {
  // If already enriched (systemExtracted has an enrichedAt timestamp), skip
  const sysExtracted = company.systemExtracted as Record<string, unknown> | null;
  if (sysExtracted?.enrichedAt) return false;

  return companyHasSparseData(company);
}

// ---------------------------------------------------------------------------
// Main enrichment function
// ---------------------------------------------------------------------------

export async function enrichCompanyData(companyId: string): Promise<boolean> {
  // 1. Read company from DB
  const rows = await db
    .select(companyColumnsNoEmbedding)
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  const company = rows[0];
  if (!company) {
    console.log(`${LOG} Company ${companyId} not found, skipping enrichment`);
    return false;
  }

  // 2. Check if enrichment is needed
  if (!companyNeedsEnrichment(company)) {
    console.log(`${LOG} Company "${company.companyName}" already has data or was enriched, skipping`);
    return false;
  }

  // 3. Need at least one external identifier
  if (!company.companiesHouseNumber && !company.websiteUrl) {
    console.log(`${LOG} Company "${company.companyName}" has no CH number or website, skipping`);
    return false;
  }

  console.log(`${LOG} Starting enrichment for "${company.companyName}" (${companyId})`);

  // 4. Fetch external sources
  const sources = await fetchCompanySources(
    company.companyName,
    company.companiesHouseNumber,
    company.websiteUrl,
  );

  console.log(`${LOG} Fetch results — CH: ${sources.companiesHouseHtml.length > 0}, Endole: ${sources.endoleHtml.length > 0}, Website: ${sources.websiteHtml.length > 0}`);

  if (!sources.companiesHouseHtml && !sources.endoleHtml && !sources.websiteHtml) {
    console.log(`${LOG} No external data fetched, skipping enrichment. Errors: ${sources.errors.join("; ")}`);
    // Mark as attempted so we don't retry every time
    await db
      .update(companies)
      .set({
        systemExtracted: {
          ...(company.systemExtracted as Record<string, unknown> || {}),
          enrichedAt: new Date().toISOString(),
          enrichmentResult: "no_data",
        },
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));
    return false;
  }

  // 5. Run AI extraction
  let normalized: CompanyPrefillData;
  try {
    normalized = await runPrefillAI(
      company.companyName,
      company.companiesHouseNumber,
      sources,
    );
    console.log(`${LOG} AI extraction completed`);
  } catch (aiError) {
    console.error(`${LOG} AI extraction failed:`, aiError);
    // Mark as attempted
    await db
      .update(companies)
      .set({
        systemExtracted: {
          ...(company.systemExtracted as Record<string, unknown> || {}),
          enrichedAt: new Date().toISOString(),
          enrichmentResult: "ai_error",
        },
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));
    return false;
  }

  // 6. Update company — only fill empty fields, never overwrite user data
  const updateData: Partial<typeof companies.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (isEmptyField(company.description) && normalized.description?.value) {
    updateData.description = normalized.description.value as string;
  }

  if (isEmptyField(company.keyCapabilities) && normalized.capabilities?.length > 0) {
    updateData.keyCapabilities = normalized.capabilities
      .filter((c) => c.confidence > 0.3)
      .map((c) => c.value)
      .join(", ");
  }

  if (isEmptyField(company.certifications) && normalized.certifications?.length > 0) {
    updateData.certifications = normalized.certifications
      .filter((c) => c.confidence > 0.3)
      .map((c) => c.name)
      .join(", ");
  }

  if (isEmptyField(company.equipment) && normalized.equipment?.length > 0) {
    updateData.equipment = normalized.equipment
      .filter((e) => e.confidence > 0.3)
      .map((e) => [e.name, e.model, e.capacity].filter(Boolean).join(" – "))
      .join(", ");
  }

  // Financial data — merge, don't overwrite existing values
  const existingFinancial = (company.financialData as Record<string, unknown>) || {};
  const hasExistingFinancial = Object.keys(existingFinancial).some(
    (k) => !isEmptyField(existingFinancial[k]),
  );

  if (!hasExistingFinancial && normalized.financial) {
    const fin: Record<string, { value: unknown; confidence: number }> = {};
    for (const [key, data] of Object.entries(normalized.financial)) {
      if (data && typeof data === "object" && "value" in data && data.confidence > 0.3) {
        fin[key] = { value: data.value, confidence: data.confidence };
      }
    }
    if (Object.keys(fin).length > 0) {
      updateData.financialData = fin;
    }
  }

  // Compliance data
  const existingCompliance = (company.complianceData as Record<string, unknown>) || {};
  const hasExistingCompliance = Object.keys(existingCompliance).some(
    (k) => !isEmptyField(existingCompliance[k]),
  );

  if (!hasExistingCompliance && normalized.compliance) {
    const comp: Record<string, { value: unknown; confidence: number }> = {};
    for (const [key, data] of Object.entries(normalized.compliance)) {
      if (data && typeof data === "object" && "value" in data && data.confidence > 0.3) {
        comp[key] = { value: data.value, confidence: data.confidence };
      }
    }
    if (Object.keys(comp).length > 0) {
      updateData.complianceData = comp;
    }
  }

  // Address
  if (isEmptyField(company.address) && normalized.address?.value) {
    updateData.address = normalized.address.value as string;
  }

  // Mark as enriched
  updateData.systemExtracted = {
    ...(company.systemExtracted as Record<string, unknown> || {}),
    enrichedAt: new Date().toISOString(),
    enrichmentResult: "success",
    sourcesUsed: {
      companiesHouse: sources.companiesHouseHtml.length > 0,
      endole: sources.endoleHtml.length > 0,
      website: sources.websiteHtml.length > 0,
    },
  };

  const fieldsUpdated = Object.keys(updateData).filter((k) => k !== "updatedAt" && k !== "systemExtracted");
  console.log(`${LOG} Updating fields: ${fieldsUpdated.join(", ") || "(none)"}`);

  await db
    .update(companies)
    .set(updateData)
    .where(eq(companies.id, companyId));

  console.log(`${LOG} Enrichment complete for "${company.companyName}"`);
  return fieldsUpdated.length > 0;
}
