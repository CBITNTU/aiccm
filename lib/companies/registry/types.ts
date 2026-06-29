export interface CompanyLookupData {
  companyName: string;
  registeredAddress: string;
  companyStatus: string;
  companyType?: string;
}

export interface CompanyLookupResult {
  found: boolean;
  data?: CompanyLookupData;
  error?: string;
}

/**
 * Pluggable company registry / verification provider. UK Companies House is the
 * reference implementation; CN/TH use a manual stub (no automated lookup or
 * enrichment) that routes companies into the existing manual review workflow.
 */
export interface CompanyRegistryAdapter {
  /** Stable id, referenced from deployment profiles (`verificationProvider`). */
  id: string;
  /** Whether the registry supports an automated company-number lookup. */
  supportsLookup: boolean;
  /** Whether the registry supports automated AI data enrichment from public sources. */
  supportsEnrichment: boolean;
  /** Normalize a raw registration number to canonical form, or null if invalid. */
  normalizeNumber(input: string): string | null;
  /** Validate a raw registration number. */
  validate(input: string): boolean;
  /** Look up company details by (normalized) number. Present only when supportsLookup. */
  lookup?(normalizedNumber: string): Promise<CompanyLookupResult>;
}
