import { NextRequest } from "next/server";
import { createApiClient, apiResponse } from "@/lib/api";
import { aiGenerateObject } from "@/lib/ai";
import { companyPrefillSchema } from "@/lib/schemas/companyPrefill";
import { logApiEvent } from "@/lib/services/eventLogger";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36";

interface PrefillResult {
  companiesHouse: {
    url: string;
    found: boolean;
    html?: string;
  } | null;
  endole: {
    url: string;
    found: boolean;
    html?: string;
  } | null;
  website: {
    url: string;
    found: boolean;
    html?: string;
  } | null;
  normalized: unknown;
  errors: string[];
}

// Safe fetch with user agent
async function safeFetch(
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

// Tidy HTML by removing scripts, styles, and excessive whitespace
function tidyHtml(html: string, max = 15000): string {
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Preserve table structure by keeping newlines in tables
  cleaned = cleaned.replace(/(<\/tr>|<\/td>|<\/th>)/gi, "$1\n");

  // Clean up excessive whitespace but preserve single newlines
  cleaned = cleaned.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");

  return cleaned.slice(0, max);
}

export async function POST(request: NextRequest) {
  try {
    let userId: string | undefined;
    try {
      const supabaseAuth = await createApiClient();
      const {
        data: { user },
      } = await supabaseAuth.auth.getUser();
      userId = user?.id;
    } catch {
      // Optional auth
    }

    const { companyName, companyNumber, websiteUrl } = await request.json();

    console.log("Starting data prefill for:", {
      companyName,
      companyNumber,
      websiteUrl,
    });

    const result: PrefillResult = {
      companiesHouse: null,
      endole: null,
      website: null,
      normalized: null,
      errors: [],
    };

    // 1) Companies House page
    if (companyNumber && companyNumber.length === 8) {
      try {
        const chUrl = `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}`;
        const chResponse = await safeFetch(chUrl);
        if (chResponse.ok) {
          const chHtml = await chResponse.text();
          result.companiesHouse = {
            url: chUrl,
            found: true,
            html: tidyHtml(chHtml, 8000),
          };
          console.log("Companies House data fetched");
        } else {
          result.errors.push(`Companies House page HTTP ${chResponse.status}`);
        }
      } catch (e) {
        result.errors.push(
          `Companies House fetch error: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // 2) Endole (PRIMARY for finance)
    let endoleHtml = "";
    let endoleUrl = "";

    const tryEndole = async () => {
      if (!(companyNumber && companyName)) return;
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
              endoleUrl = url;
              endoleHtml = html;
              return;
            }
          }
        } catch {
          // keep trying next candidate
        }
      }
    };

    try {
      if (companyNumber && companyName) {
        await tryEndole();
        if (endoleHtml) {
          result.endole = {
            url: endoleUrl,
            found: true,
            html: tidyHtml(endoleHtml, 25000),
          };
          console.log("Endole data fetched");
        } else {
          result.errors.push("Endole data not found or blocked");
        }
      }
    } catch (e) {
      result.errors.push(
        `Endole fetch error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // 3) Website
    if (websiteUrl) {
      try {
        const websiteResponse = await safeFetch(websiteUrl);
        if (websiteResponse.ok) {
          const websiteHtmlContent = await websiteResponse.text();
          result.website = {
            url: websiteUrl,
            found: true,
            html: tidyHtml(websiteHtmlContent, 8000),
          };
          console.log("Website data fetched");
        } else {
          result.errors.push(`Website HTTP ${websiteResponse.status}`);
        }
      } catch (e) {
        result.errors.push(
          `Website fetch error: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // 4) AI normalization using Vercel AI SDK
    console.log("Starting AI analysis...");

    const systemPrompt = `You are a company data extraction assistant specializing in UK company financial data.
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

    const userPrompt = `Company Name: ${companyName}
Company Number: ${companyNumber || "N/A"}

--- Companies House (truncated HTML) ---
${result.companiesHouse ? result.companiesHouse.html : "Not available"}

--- Endole (CLEANED HTML - PRIMARY FOR FINANCE) ---
${result.endole ? result.endole.html : "Not available"}

--- Website (truncated HTML) ---
${result.website ? result.website.html : "Not available"}

Extract and structure the company information with confidence scores.

EXTRACTION RULES:
- CAREFULLY scan the entire Endole HTML for financial tables and rows
- Look for patterns like: <td>Net Assets</td><td>£1,234,567</td> or similar
- Financial data MUST be from "endole" when present - search thoroughly before marking as 0
- Strip currency symbols (£, $), commas, and whitespace from numbers
- Include "evidence" as exactly "endole", "companies_house", or "website"
- Set confidence=0.9 when data is clearly found, 0 when truly not present
- debtRatio must be computed when totalAssets and totalLiabilities are both > 0`;

    const normalized = await aiGenerateObject({
      schema: companyPrefillSchema,
      system: systemPrompt,
      prompt: userPrompt,
      modelId: "gpt-4o",
      temperature: 0.1,
      maxTokens: 8000,
    });

    result.normalized = normalized;

    console.log("AI analysis completed successfully");

    await logApiEvent(request, {
      actionType: "company_prefill_requested",
      userId: userId || undefined,
      details: {
        companyName,
        companyNumber: !!companyNumber,
        websiteUrl: !!websiteUrl,
      },
    }).catch(() => {});

    return apiResponse(result);
  } catch (error) {
    console.error("Error in prefill-company-data:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiResponse(
      {
        error: message,
        companiesHouse: null,
        endole: null,
        website: null,
        normalized: null,
        errors: [message],
      },
      500,
    );
  }
}
