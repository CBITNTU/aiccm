import { z } from "zod";

const benchmarkDimension = z.object({
  score: z.number().min(0).max(100).describe("Score from 0 to 100"),
  explanation: z.string().describe("Short explanation for the score"),
});

export const performanceBenchmarkSchema = z.object({
  performanceBenchmark: z.object({
    technicalExpertise: benchmarkDimension,
    safetyStandards: benchmarkDimension,
    innovation: benchmarkDimension,
    projectExperience: benchmarkDimension,
    certifications: benchmarkDimension,
    marketReputation: benchmarkDimension,
    financialHealth: benchmarkDimension,
    operationalCapacity: benchmarkDimension,
    overallScore: benchmarkDimension,
  }),
  companyInfo: z.object({
    description: z.string().describe("Detailed, informative company overview (~120-200 words) covering core activities, key capabilities, products and services, areas of expertise, target sectors/markets, and key strengths/differentiators — based only on available data, in the same language as the source information. Empty string only if genuinely no information exists."),
    key_capabilities: z.string().describe("Key capabilities and services offered, or empty string if unknown"),
    certifications: z.string().describe("Known certifications and accreditations, or empty string if unknown"),
    past_projects: z.string().describe("Notable past projects, or empty string if unknown"),
    equipment: z.string().describe("Key equipment and resources, or empty string if unknown"),
    postcode: z.string().describe("Company postcode if identifiable, or empty string if unknown"),
    contact_person: z.string().describe("Primary contact person if known, or empty string if unknown"),
    contact_email: z.string().describe("Contact email if known, or empty string if unknown"),
    contact_phone: z.string().describe("Contact phone if known, or empty string if unknown"),
  }).describe("Company information extracted or inferred from available data"),
});

export type PerformanceBenchmarkResult = z.infer<
  typeof performanceBenchmarkSchema
>;
