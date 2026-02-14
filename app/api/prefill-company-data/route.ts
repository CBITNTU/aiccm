import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { aiGenerateObject } from "@/lib/ai";
import { companyPrefillSchema } from "@/lib/schemas/companyPrefill";
import { logApiEvent } from "@/lib/services/eventLogger";
import { z } from "zod";
import {
  requireAuth,
  validateBody,
  validateUrl,
  handleApiError,
} from "@/lib/api/validation";

const prefillInputSchema = z.object({
  companyName: z.string().min(1).max(200),
  companyNumber: z.string().length(8).optional(),
  websiteUrl: z.string().url().optional(),
});

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36";

interface PrefillResult {
  companiesHouse: {
    url: string;
    found: boolean;
  } | null;
  endole: {
    url: string;
    found: boolean;
  } | null;
  website: {
    url: string;
    found: boolean;
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

  cleaned = cleaned.replace(/(<\/tr>|<\/td>|<\/th>)/gi, "$1\n");
  cleaned = cleaned.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");

  return cleaned.slice(0, max);
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const { companyName, companyNumber, websiteUrl } = await validateBody(
      request,
      prefillInputSchema,
    );

    // Validate websiteUrl if provided (SSRF protection)
    if (websiteUrl) {
      validateUrl(websiteUrl);
    }

    const result: PrefillResult = {
      companiesHouse: null,
      endole: null,
      website: null,
      normalized: null,
      errors: [],
    };

    // Internal HTML storage for AI prompt (not returned to client)
    let companiesHouseHtml = "";
    let endoleHtml = "";
    let websiteHtml = "";

    // 1) Companies House page
    if (companyNumber && companyNumber.length === 8) {
      try {
        const chUrl = `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}`;
        const chResponse = await safeFetch(chUrl);
        if (chResponse.ok) {
          const chHtmlRaw = await chResponse.text();
          companiesHouseHtml = tidyHtml(chHtmlRaw, 8000);
          result.companiesHouse = {
            url: chUrl,
            found: true,
          };
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
          endoleHtml = tidyHtml(endoleHtml, 25000);
          result.endole = {
            url: endoleUrl,
            found: true,
          };
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
          websiteHtml = tidyHtml(websiteHtmlContent, 8000);
          result.website = {
            url: websiteUrl,
            found: true,
          };
        } else {
          result.errors.push(`Website HTTP ${websiteResponse.status}`);
        }
      } catch (e) {
        result.errors.push(
          `Website fetch error: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // 4) AI normalization using Vercel AI SDK (uses platform default model)
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
${companiesHouseHtml || "Not available"}

--- Endole (CLEANED HTML - PRIMARY FOR FINANCE) ---
${endoleHtml || "Not available"}

--- Website (truncated HTML) ---
${websiteHtml || "Not available"}

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
      temperature: 0.1,
      maxTokens: 8000,
    });

    result.normalized = normalized;

    await logApiEvent(request, {
      actionType: "company_prefill_requested",
      userId: user.id,
      details: {
        companyName,
        companyNumber: !!companyNumber,
        websiteUrl: !!websiteUrl,
      },
    }).catch(() => {});

    return apiResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
