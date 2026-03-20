import { z } from "zod";

// Schema for individual team member contribution
export const teamMemberContributionSchema = z.object({
  companyName: z.string().describe("Name of the company"),
  contribution: z
    .array(z.string())
    .describe("List of key contributions this company brings to the team"),
});

// Schema for the full team analysis response from the AI
export const teamAnalysisResponseSchema = z.object({
  requiredCompetencies: z
    .array(z.string())
    .describe("Key competencies required for this tender"),
  companyCompetencies: z
    .array(z.string())
    .describe("Combined capabilities the team currently has"),
  missingCompetencies: z
    .array(z.string())
    .describe("Any remaining gaps that need to be filled"),
  coveragePercentage: z
    .number()
    .min(0)
    .max(100)
    .describe("Percentage of requirement coverage by the full team (0-100)"),
  readinessScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Team readiness score (0-100)"),
  risks: z
    .array(z.string())
    .describe("Potential risks for this consortium bid"),
  recommendations: z
    .array(z.string())
    .describe("Strategic recommendations for the team"),
  teamMembers: z
    .array(teamMemberContributionSchema)
    .describe("Each team member's key contributions to the bid"),
});

// Infer TypeScript types from the schemas
export type TeamMemberContribution = z.infer<
  typeof teamMemberContributionSchema
>;
export type TeamAnalysisResponse = z.infer<typeof teamAnalysisResponseSchema>;

// Input schemas for the API endpoint
export const tenderInputSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  buyerName: z.string().optional(),
  value: z.number().optional(),
  region: z.string().optional(),
});

export const companyInputSchema = z.object({
  id: z.string(),
  companyName: z.string().optional().default(""),
  keyCapabilities: z.string().nullable().optional(),
  certifications: z.string().nullable().optional(),
  pastProjects: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const teamMemberInputSchema = z.object({
  companies: z
    .object({
      companyName: z.string().optional().default(""),
      keyCapabilities: z.string().nullable().optional(),
      certifications: z.string().nullable().optional(),
      pastProjects: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const analyzeTeamRequestSchema = z.object({
  projectId: z.string(),
  company: companyInputSchema,
  tender: tenderInputSchema,
  teamMembers: z.array(teamMemberInputSchema),
});

export type TenderInput = z.infer<typeof tenderInputSchema>;
export type CompanyInput = z.infer<typeof companyInputSchema>;
export type TeamMemberInput = z.infer<typeof teamMemberInputSchema>;
export type AnalyzeTeamRequest = z.infer<typeof analyzeTeamRequestSchema>;
