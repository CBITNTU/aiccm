import { z } from "zod";

/** For suggest-capabilities and company taxonomy (existing only). */
export const existingCapabilitiesSchema = z.object({
  existing: z.array(z.string()).describe("Array of capability IDs or names from the provided list"),
});

/** For tender taxonomy (existing + new). */
export const tenderCapabilitiesSchema = z.object({
  existing: z.array(z.string()).describe("Array of capability IDs from the provided list"),
  new: z
    .array(
      z.object({
        name: z.string().describe("Name of the new capability"),
        category: z.string().describe("Category for the new capability"),
      }),
    )
    .describe("New capabilities not in the existing list"),
});

/** Combined summary + taxonomy for companies. */
export const companySummaryAndTaxonomySchema = z.object({
  summary: z.string().describe("Concise 200-word professional company summary"),
  existing: z.array(z.string()).describe("Array of capability IDs from the provided static list"),
});

/** Combined summary + taxonomy for tenders. */
export const tenderSummaryAndTaxonomySchema = z.object({
  summary: z.string().describe("Concise 200-word professional tender summary"),
  existing: z.array(z.string()).describe("Array of capability IDs from the provided list"),
  new: z
    .array(
      z.object({
        name: z.string().describe("Name of the new capability"),
        category: z.string().describe("Category for the new capability"),
      }),
    )
    .describe("New capabilities not in the existing list"),
});

export type ExistingCapabilities = z.infer<typeof existingCapabilitiesSchema>;
export type TenderCapabilities = z.infer<typeof tenderCapabilitiesSchema>;
export type CompanySummaryAndTaxonomy = z.infer<typeof companySummaryAndTaxonomySchema>;
export type TenderSummaryAndTaxonomy = z.infer<typeof tenderSummaryAndTaxonomySchema>;
