import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import { z } from "zod";
import {
  requireAuth,
  validateBody,
  validateUrl,
  handleApiError,
} from "@/lib/api/validation";
import {
  fetchCompanySources,
  runPrefillAI,
} from "@/lib/services/companyEnrichmentService";
import { getRegistryAdapter } from "@/lib/companies/registry";

const prefillInputSchema = z.object({
  companyName: z.string().min(1).max(200),
  companyNumber: z.string().min(1).max(64).optional(),
  websiteUrl: z.string().url().optional(),
});

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

    // Regions without an automated registry don't support public-source enrichment.
    if (!getRegistryAdapter().supportsEnrichment) {
      return apiResponse<PrefillResult>({
        companiesHouse: null,
        endole: null,
        website: null,
        normalized: null,
        errors: ["Automated data prefill is not available for this region."],
      });
    }

    const sources = await fetchCompanySources(companyName, companyNumber, websiteUrl);

    const result: PrefillResult = {
      companiesHouse: sources.companiesHouseHtml
        ? {
            url: `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}`,
            found: true,
          }
        : null,
      endole: sources.endoleHtml
        ? {
            url: companyNumber
              ? `https://open.endole.co.uk/insight/company/${companyNumber}-${companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
              : "",
            found: true,
          }
        : null,
      website: sources.websiteHtml
        ? {
            url: websiteUrl || "",
            found: true,
          }
        : null,
      normalized: null,
      errors: sources.errors,
    };

    // AI normalization
    const normalized = await runPrefillAI(companyName, companyNumber, sources);
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
