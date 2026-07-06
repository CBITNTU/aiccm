import type { TaxonomyProvider } from "../types";

/**
 * Neutral taxonomy for regions without a procurement classification scheme yet
 * (China, Thailand). No text inference; overlap is neutral so matching leans on
 * embedding similarity and other signals instead.
 */
export const stubTaxonomyProvider: TaxonomyProvider = {
  id: "stub",
  inferDivisionsFromText: () => [],
  getName: (code) => code,
  formatCode: (code) => ({ code, name: code }),
  division: (code) => code.replace(/\D/g, "").slice(0, 2),
  overlapScore: () => 0.5,
};
