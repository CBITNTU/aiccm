import { NextRequest } from "next/server";
import {
  apiResponse,
  apiError,
  getAuthenticatedUser,
} from "@/lib/api";
import { aiGenerateObject } from "@/lib/ai";
import {
  analyzeTeamRequestSchema,
  teamAnalysisResponseSchema,
  type CompanyInput,
  type TenderInput,
  type TeamMemberInput,
} from "@/lib/schemas/teamAnalysis";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { virtualOrganizations } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

// Build the prompt for team analysis
function buildTeamAnalysisPrompt(
  company: CompanyInput,
  tender: TenderInput,
  teamMembers: TeamMemberInput[],
): string {
  const allCompanies = [
    company,
    ...teamMembers.map((m) => m.companies).filter(Boolean),
  ];

  const teamMembersText = allCompanies
    .map(
      (c, idx) => `
${idx + 1}. ${c?.company_name} ${idx === 0 ? "(Lead)" : "(Partner)"}
   - Capabilities: ${c?.key_capabilities || "Not specified"}
   - Certifications: ${c?.certifications || "None"}
   - Past Projects: ${c?.past_projects || "None"}
   - Description: ${c?.description || "None"}`,
    )
    .join("\n");

  return `You are a tender analysis expert. Analyze this tender against a full consortium team.

Tender: ${tender.title}
Description: ${tender.description || "Not provided"}
Buyer: ${tender.buyer_name || "Not specified"}
Value: \u00A3${tender.value?.toLocaleString() || "Not specified"}
Location: ${tender.region || "UK"}

Team Members:
${teamMembersText}

Analyze the team's combined capabilities against the tender requirements and provide:
1. requiredCompetencies: Key competencies needed for this tender (be specific)
2. companyCompetencies: Combined capabilities the team currently has
3. missingCompetencies: Any remaining gaps that need to be filled
4. coveragePercentage: Percentage (0-100) of requirement coverage by the full team
5. readinessScore: Team readiness score (0-100)
6. risks: Potential risks for this consortium bid
7. recommendations: Strategic recommendations for the team
8. teamMembers: For each company, list their key contributions to the bid (companyName and contribution array)

Be thorough but concise. Focus on actionable insights.`;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate the user
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (authError || !user) {
      return apiError("Unauthorized", 401);
    }

    // Parse and validate request body
    const body = await request.json();
    const parseResult = analyzeTeamRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return apiError("Invalid request body", 400, parseResult.error.message);
    }

    const { projectId, company, tender, teamMembers } = parseResult.data;

    // Build the prompt
    const prompt = buildTeamAnalysisPrompt(company, tender, teamMembers);

    // Use shared AI wrapper (provider-agnostic, rate-limited)
    const result = await aiGenerateObject({
      schema: teamAnalysisResponseSchema,
      prompt,
    });

    // Build the team analysis data with metadata
    const teamAnalysisData = {
      type: "team" as const,
      ...result,
      analyzedAt: new Date().toISOString(),
    };

    // Save to database
    try {
      await db
        .update(virtualOrganizations)
        .set({
          teamAnalysis: teamAnalysisData,
          updatedAt: new Date(),
        })
        .where(eq(virtualOrganizations.id, projectId));
    } catch (dbError) {
      console.error("Database error saving team analysis:", dbError);
      return apiError("Failed to save team analysis", 500);
    }

    await logApiEvent(request, {
      actionType: "team_analyzed",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "vo_project",
      entityId: projectId,
    }).catch(() => {});

    return apiResponse({ teamAnalysis: teamAnalysisData });
  } catch (error) {
    console.error("Team analysis error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
