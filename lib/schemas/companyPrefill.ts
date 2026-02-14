import { z } from "zod";

const evidenceSource = z
  .enum(["endole", "companies_house", "website"])
  .describe("The data source this field was extracted from");

const confidenceField = (valueSchema: z.ZodType) =>
  z.object({
    value: valueSchema,
    confidence: z.number().min(0).max(1).describe("Confidence score 0-1"),
    evidence: evidenceSource,
  });

export const companyPrefillSchema = z.object({
  description: confidenceField(z.string()).describe("Company description (180-250 words)"),
  capabilities: z
    .array(confidenceField(z.string()))
    .describe("List of company capabilities"),
  certifications: z
    .array(
      z.object({
        name: z.string(),
        issuer: z.string().optional(),
        certId: z.string().optional(),
        validUntil: z.string().optional(),
        confidence: z.number().min(0).max(1),
        evidence: evidenceSource,
      }),
    )
    .describe("Certifications and accreditations"),
  equipment: z
    .array(
      z.object({
        name: z.string(),
        model: z.string().optional(),
        capacity: z.string().optional(),
        notes: z.string().optional(),
        confidence: z.number().min(0).max(1),
        evidence: evidenceSource,
      }),
    )
    .describe("Equipment and assets"),
  sectors: z
    .array(confidenceField(z.string()))
    .describe("Industry sectors served"),
  locations: z
    .array(confidenceField(z.string()))
    .describe("Geographic locations served"),
  address: confidenceField(z.string()).describe("Registered address"),
  financial: z
    .object({
      employees: confidenceField(z.number()).optional(),
      netAssets: confidenceField(z.number()).optional(),
      totalAssets: confidenceField(z.number()).optional(),
      totalLiabilities: confidenceField(z.number()).optional(),
      cash: confidenceField(z.number()).optional(),
      debtRatio: confidenceField(z.number()).optional(),
    })
    .describe("Financial data"),
  compliance: z
    .object({
      accountsFiled: confidenceField(z.string()).optional(),
      accountsDue: confidenceField(z.string()).optional(),
      confirmationStatement: confidenceField(z.string()).optional(),
      activeCharges: confidenceField(z.number()).optional(),
    })
    .describe("Compliance information"),
});

export type CompanyPrefillData = z.infer<typeof companyPrefillSchema>;
