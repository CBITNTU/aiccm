import { NextRequest } from "next/server";
import { createAdminClient, apiResponse } from "@/lib/api";
import { aiGenerateObject } from "@/lib/ai";
import { logApiEvent } from "@/lib/services/eventLogger";
import {
  gapAnalysisRequestSchema,
  gapAnalysisResponseSchema,
} from "@/lib/schemas/gapAnalysis";
import {
  requireAuth,
  validateBody,
  handleApiError,
} from "@/lib/api/validation";

function buildGapAnalysisPrompt(
  company: { company_name: string; key_capabilities?: string | null; certifications?: string | null; past_projects?: string | null; description?: string | null },
  tender: { title: string; description?: string | null; buyer?: string | null; budget_min?: number | null; budget_max?: number | null; location?: string | null },
): string {
  const budgetStr = tender.budget_min || tender.budget_max
    ? `£${tender.budget_min?.toLocaleString() ?? "?"} - £${tender.budget_max?.toLocaleString() ?? "?"}`
    : "Not specified";

  return `You are a tender analysis expert. Analyze this tender requirement against a single company's capabilities to identify gaps.

Tender: ${tender.title}
Description: ${tender.description || "Not provided"}
Buyer: ${tender.buyer || "Not specified"}
Value: ${budgetStr}
Location: ${tender.location || "UK"}

Company: ${company.company_name}
- Capabilities: ${company.key_capabilities || "Not specified"}
- Certifications: ${company.certifications || "None"}
- Past Projects: ${company.past_projects || "None"}
- Description: ${company.description || "None"}

Provide a detailed analysis with:
1. requiredCompetencies: Key competencies needed for this tender (be specific)
2. companyCompetencies: What this company currently has
3. missingCompetencies: Gaps that need to be filled
4. coveragePercentage: Number (0-100) of requirement coverage by this company alone
5. readinessScore: Number (0-100) company readiness score
6. risks: Potential risks for bidding alone
7. recommendations: Strategic recommendations to fill gaps

Be thorough but concise. Focus on actionable insights.`;
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const { projectId, companyId, tenderId } = await validateBody(
      request,
      gapAnalysisRequestSchema,
    );

    const supabase = createAdminClient();

    // Fetch company data
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("company_name, key_capabilities, certifications, past_projects, description")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    // Fetch tender data
    const { data: tender, error: tenderError } = await supabase
      .from("tenders")
      .select("title, description, buyer, budget_min, budget_max, location")
      .eq("id", tenderId)
      .single();

    if (tenderError || !tender) {
      return apiResponse({ error: "Tender not found" }, 404);
    }

    const prompt = buildGapAnalysisPrompt(company, tender);

    const analysis = await aiGenerateObject({
      schema: gapAnalysisResponseSchema,
      prompt,
      temperature: 0.2,
      maxTokens: 10000,
    });

    await logApiEvent(request, {
      actionType: "project_analyzed",
      userId: user.id,
      entityType: "vo_project",
      entityId: projectId,
    }).catch(() => {});

    return apiResponse({ analysis, projectId });
  } catch (error) {
    return handleApiError(error);
  }
}
