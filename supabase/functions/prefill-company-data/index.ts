import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companyName, companyNumber, websiteUrl } = await req.json();
    const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAIApiKey) throw new Error("OpenAI API key not configured");

    console.log("Starting data prefill for:", { companyName, companyNumber, websiteUrl });

    const result: any = {
      companiesHouse: null,
      endole: null,
      website: null,
      normalized: null,
      errors: [] as string[],
    };

    // ---- helpers ----
    const safeFetch = async (url: string, opts: RequestInit = {}) => {
      const r = await fetch(url, {
        ...opts,
        headers: {
          "User-Agent": UA,
          "Accept-Language": "en-GB,en;q=0.9",
          ...opts.headers,
        },
      });
      return r;
    };

    const tidyHtml = (html: string, max = 15000) =>
      html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<svg[\s\S]*?<\/svg>/gi, "")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/\s{2,}/g, " ")
        .slice(0, max);

    // 1) Companies House page (unchanged, optional)
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
      } catch (e: any) {
        result.errors.push(`Companies House fetch error: ${e.message}`);
      }
    }

    // 2) Endole (PRIMARY for finance)
    //    Try open.endole (public insights) then www.endole public profile as fallback.
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
        } catch (_) {
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
            // Give the LLM as much *clean* Endole as possible (finance tables often below the fold)
            html: tidyHtml(endoleHtml, 14000),
          };
          console.log("Endole data fetched");
        } else {
          result.errors.push("Endole data not found or blocked");
        }
      }
    } catch (e: any) {
      result.errors.push(`Endole fetch error: ${e.message}`);
    }

    // 3) Website (unchanged, optional)
    if (websiteUrl) {
      try {
        const websiteResponse = await safeFetch(websiteUrl);
        if (websiteResponse.ok) {
          const websiteHtml = await websiteResponse.text();
          result.website = {
            url: websiteUrl,
            found: true,
            html: tidyHtml(websiteHtml, 8000),
          };
          console.log("Website data fetched");
        } else {
          result.errors.push(`Website HTTP ${websiteResponse.status}`);
        }
      } catch (e: any) {
        result.errors.push(`Website fetch error: ${e.message}`);
      }
    }

    // 4) OpenAI normalization — bias to Endole for finance
    console.log("Starting OpenAI analysis...");

    const systemPrompt = `You are a company data extraction assistant.
You will receive (possibly partial) HTML from Companies House, Endole, and the company's website.
Your task is to extract and normalize the requested fields.

STRICT RULES (NO HALLUCINATIONS):
- Base ALL content ONLY on Endole/website/Companies House text provided. If a detail is not present, do NOT infer it.
- Financials: use Endole as the primary evidence. If Endole does not clearly show a number, leave it as 0 with low confidence.
- Endole often abbreviates figures (K, M, B). Convert to absolute numbers where obvious; otherwise keep the shown number and note low confidence.
- Typical Endole finance labels include: "Net Assets", "Total Assets", "Current Assets", "Total Liabilities",
  "Cash", "Cash at Bank", "Cash & Cash Equivalents", "Creditors", "Average Employees", "Employees", "Debt Ratio (%)".
- Compute debtRatio = totalLiabilities / totalAssets (round to 3 decimals) when both > 0.

DESCRIPTION REQUIREMENTS (180–250 words):
Write a single cohesive paragraph (~180–250 words) that covers, in order, using only evidence found:
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
- For compliance fields, if dates are visible in Companies House HTML, use them; otherwise leave blank with low confidence.

Return ONLY the JSON object in the specified schema.`;

    const userPrompt = `Company Name: ${companyName}
Company Number: ${companyNumber || "N/A"}

--- Companies House (truncated HTML) ---
${result.companiesHouse ? result.companiesHouse.html : "Not available"}

--- Endole (CLEANED HTML - PRIMARY FOR FINANCE) ---
${result.endole ? result.endole.html : "Not available"}

--- Website (truncated HTML) ---
${result.website ? result.website.html : "Not available"}

Extract and structure the company information with confidence scores.

Schema to return:
{
  "description": {"value": "", "confidence": 0, "evidence": ""},
  "capabilities": [{"value": "", "confidence": 0, "evidence": ""}],
  "certifications": [{"name": "", "issuer": "", "certId": "", "validUntil": "", "confidence": 0, "evidence": ""}],
  "equipment": [{"name": "", "model": "", "capacity": "", "notes": "", "confidence": 0, "evidence": ""}],
  "sectors": [{"value": "", "confidence": 0, "evidence": ""}],
  "locations": [{"value": "", "confidence": 0, "evidence": ""}],
  "financial": {
    "employees": {"value": 0, "confidence": 0, "evidence": ""},
    "netAssets": {"value": 0, "confidence": 0, "evidence": ""},
    "totalAssets": {"value": 0, "confidence": 0, "evidence": ""},
    "totalLiabilities": {"value": 0, "confidence": 0, "evidence": ""},
    "cash": {"value": 0, "confidence": 0, "evidence": ""},
    "debtRatio": {"value": 0, "confidence": 0, "evidence": ""}
  },
  "compliance": {
    "accountsFiled": {"value": "", "confidence": 0, "evidence": ""},
    "accountsDue": {"value": "", "confidence": 0, "evidence": ""},
    "confirmationStatement": {"value": "", "confidence": 0, "evidence": ""},
    "activeCharges": {"value": 0, "confidence": 0, "evidence": ""}
  }
}

Rules:
- Finance must be from "endole" when present. If not found, leave zeros with low confidence instead of guessing.
- Include "evidence" as exactly "endole", "companies_house", or "website".
- debtRatio must be computed when possible.`;

    const openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // If you must keep your original model string, swap it here.
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.0,
        max_completion_tokens: 4000,
      }),
    });

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${openAIResponse.status}`);
    }

    const openAIData = await openAIResponse.json();
    result.normalized = JSON.parse(openAIData.choices[0].message.content);

    console.log("OpenAI analysis completed successfully");
    console.log("Financial data extracted:", JSON.stringify(result.normalized.financial, null, 2));
    console.log("Compliance data extracted:", JSON.stringify(result.normalized.compliance, null, 2));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in prefill-company-data:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        companiesHouse: null,
        endole: null,
        website: null,
        normalized: null,
        errors: [error.message],
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
