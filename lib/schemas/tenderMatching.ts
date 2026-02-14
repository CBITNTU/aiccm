import { z } from "zod";

/**
 * Schema for the AI-generated portion of a tender matching score.
 * Note: overallScore is NOT included — it is calculated server-side from sub-scores.
 */
export const matchingScoreSchema = z.object({
  capabilityScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Capability match score 0-100. Set to 0 if industries don't match."),
  experienceScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Experience/past projects match score 0-100"),
  locationScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Location proximity score 0-100"),
  certificationScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Certification match score 0-100"),
  matchReasons: z
    .array(z.string())
    .describe("2-4 short bullet points explaining why this is a good match (10-15 words each)"),
  improvementSuggestions: z
    .array(z.string())
    .describe("2-3 short actionable suggestions for improvement (10-15 words each)"),
  aiAnalysis: z.string().describe("Brief summary of the match analysis"),
  scoreExplanations: z
    .object({
      capability: z.string().describe("Short explanation for capability score"),
      experience: z.string().describe("Short explanation for experience score"),
      location: z.string().describe("Short explanation for location score"),
      certification: z
        .string()
        .describe("Short explanation for certification score"),
    })
    .describe("Short explanations for each score dimension"),
});

export type AIMatchingScore = z.infer<typeof matchingScoreSchema>;
