import type { CompanyRegistryAdapter } from "../types";

/**
 * Manual registry stub for regions without an automated company registry yet
 * (China, Thailand). No lookup or enrichment — the registration number is stored
 * as-is and the company goes through the existing manual admin verification flow.
 */
function makeManualRegistry(id: string): CompanyRegistryAdapter {
  return {
    id,
    supportsLookup: false,
    supportsEnrichment: false,
    normalizeNumber: (input) => {
      const clean = input.trim();
      return clean.length > 0 ? clean : null;
    },
    validate: (input) => input.trim().length > 0,
  };
}

export const cnManualRegistry = makeManualRegistry("cn_manual");
export const thManualRegistry = makeManualRegistry("th_manual");
