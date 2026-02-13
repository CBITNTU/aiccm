import { z } from "zod";

export const companyAnalysisSchema = z.object({
  competencies: z
    .array(z.string())
    .describe("List of extracted competencies"),
  capabilities: z
    .array(z.string())
    .describe("Specific technical capabilities"),
  strengths: z.array(z.string()).describe("Key competitive strengths"),
  certifications: z
    .array(z.string())
    .describe("Standardized certification list"),
  recommendations: z
    .array(z.string())
    .describe("Improvement recommendations"),
  digitalMaturity: z.string().describe("Assessment of digital capabilities"),
  safetyRating: z.string().describe("Safety and compliance assessment"),
  marketPosition: z.string().describe("Market positioning analysis"),
  suggestedTaxonomies: z
    .array(z.string())
    .optional()
    .describe(
      "Array of taxonomy names from the available list that best match this company",
    ),
});

export type CompanyAnalysis = z.infer<typeof companyAnalysisSchema>;
