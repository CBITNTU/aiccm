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
        issuer: z.string().nullable(),
        certId: z.string().nullable(),
        validUntil: z.string().nullable(),
        confidence: z.number().min(0).max(1),
        evidence: evidenceSource,
      }),
    )
    .describe("Certifications and accreditations"),
  equipment: z
    .array(
      z.object({
        name: z.string(),
        model: z.string().nullable(),
        capacity: z.string().nullable(),
        notes: z.string().nullable(),
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
      employees: confidenceField(z.number()).nullable(),
      netAssets: confidenceField(z.number()).nullable(),
      totalAssets: confidenceField(z.number()).nullable(),
      totalLiabilities: confidenceField(z.number()).nullable(),
      cash: confidenceField(z.number()).nullable(),
      debtRatio: confidenceField(z.number()).nullable(),
    })
    .describe("Financial data"),
  compliance: z
    .object({
      accountsFiled: confidenceField(z.string()).nullable(),
      accountsDue: confidenceField(z.string()).nullable(),
      confirmationStatement: confidenceField(z.string()).nullable(),
      activeCharges: confidenceField(z.number()).nullable(),
    })
    .describe("Compliance information"),
});

export type CompanyPrefillData = z.infer<typeof companyPrefillSchema>;
