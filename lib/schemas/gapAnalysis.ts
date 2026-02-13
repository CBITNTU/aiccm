import { z } from "zod";

export const gapAnalysisResponseSchema = z.object({
  requiredCompetencies: z
    .array(z.string())
    .describe("Key competencies needed for this tender"),
  companyCompetencies: z
    .array(z.string())
    .describe("Capabilities the company currently has"),
  missingCompetencies: z
    .array(z.string())
    .describe("Gaps that need to be filled"),
  coveragePercentage: z
    .number()
    .min(0)
    .max(100)
    .describe("Percentage of requirement coverage by this company alone (0-100)"),
  readinessScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Company readiness score (0-100)"),
  risks: z
    .array(z.string())
    .describe("Potential risks for bidding alone"),
  recommendations: z
    .array(z.string())
    .describe("Strategic recommendations to fill gaps"),
});

export type GapAnalysisResponse = z.infer<typeof gapAnalysisResponseSchema>;

// Input schema for the API endpoint
export const gapAnalysisRequestSchema = z.object({
  projectId: z.string().uuid(),
  companyId: z.string().uuid(),
  tenderId: z.string().uuid(),
});

export type GapAnalysisRequest = z.infer<typeof gapAnalysisRequestSchema>;
