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
});

export type PerformanceBenchmarkResult = z.infer<
  typeof performanceBenchmarkSchema
>;
