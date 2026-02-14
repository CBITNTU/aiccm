import { z } from "zod";

export const tenderTaxonomySuggestionSchema = z.object({
  taxonomies: z
    .array(z.string())
    .describe("Array of taxonomy category names that best match this tender"),
});

export type TenderTaxonomySuggestion = z.infer<
  typeof tenderTaxonomySuggestionSchema
>;
