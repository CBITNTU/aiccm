import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
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
import { db } from "@/lib/db";
import { companies, tenders } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

function buildGapAnalysisPrompt(
  company: { companyName: string; keyCapabilities?: string | null; certifications?: string | null; pastProjects?: string | null; description?: string | null },
  tender: { title: string; description?: string | null; buyer?: string | null; budgetMin?: number | null; budgetMax?: number | null; location?: string | null },
): string {
  const budgetStr = tender.budgetMin || tender.budgetMax
    ? `\u00A3${tender.budgetMin?.toLocaleString() ?? "?"} - \u00A3${tender.budgetMax?.toLocaleString() ?? "?"}`
    : "Not specified";

  return `You are a tender analysis expert. Analyze this tender requirement against a single company's capabilities to identify gaps.

Tender: ${tender.title}
Description: ${tender.description || "Not provided"}
Buyer: ${tender.buyer || "Not specified"}
Value: ${budgetStr}
Location: ${tender.location || "UK"}

Company: ${company.companyName}
- Capabilities: ${company.keyCapabilities || "Not specified"}
- Certifications: ${company.certifications || "None"}
- Past Projects: ${company.pastProjects || "None"}
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

    // Fetch company data
    const companyRows = await db
      .select({
        companyName: companies.companyName,
        keyCapabilities: companies.keyCapabilities,
        certifications: companies.certifications,
        pastProjects: companies.pastProjects,
        description: companies.description,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    const company = companyRows[0];
    if (!company) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    // Fetch tender data
    const tenderRows = await db
      .select({
        title: tenders.title,
        description: tenders.description,
        buyer: tenders.buyer,
        budgetMin: tenders.budgetMin,
        budgetMax: tenders.budgetMax,
        location: tenders.location,
      })
      .from(tenders)
      .where(eq(tenders.id, tenderId))
      .limit(1);

    const tender = tenderRows[0];
    if (!tender) {
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
