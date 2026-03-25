/**
 * Field categorization for company verification draft system.
 *
 * Verified companies can freely update NON_REVIEWABLE_FIELDS.
 * Changes to REVIEWABLE_SCALAR_FIELDS and REVIEWABLE_RELATIONS
 * are saved as drafts and require admin approval.
 */

export const REVIEWABLE_SCALAR_FIELDS = [
  "companyName",
  "description",
  "keyCapabilities",
  "certifications",
  "equipment",
  "pastProjects",
  "companiesHouseNumber",
] as const;

export const NON_REVIEWABLE_FIELDS = [
  "contactEmail",
  "contactPhone",
  "contactPerson",
  "address",
  "postcode",
  "websiteUrl",
  "operationLocations",
] as const;

export const REVIEWABLE_RELATIONS = [
  "capabilities",
  "markets",
  "standards",
] as const;

export type ReviewableScalarField = (typeof REVIEWABLE_SCALAR_FIELDS)[number];
export type NonReviewableField = (typeof NON_REVIEWABLE_FIELDS)[number];
export type ReviewableRelation = (typeof REVIEWABLE_RELATIONS)[number];

const reviewableSet = new Set<string>(REVIEWABLE_SCALAR_FIELDS);

export function isReviewableField(field: string): boolean {
  return reviewableSet.has(field);
}

// Human-readable labels for admin diff display
export const FIELD_LABELS: Record<string, string> = {
  companyName: "Company Name",
  description: "Description",
  keyCapabilities: "Key Capabilities",
  certifications: "Certifications",
  equipment: "Equipment",
  pastProjects: "Past Projects",
  companiesHouseNumber: "Companies House Number",
  contactEmail: "Contact Email",
  contactPhone: "Contact Phone",
  contactPerson: "Contact Person",
  address: "Address",
  postcode: "Postcode",
  websiteUrl: "Website URL",
  operationLocations: "Operation Locations",
  capabilities: "Competencies",
  markets: "Markets",
  standards: "Standards",
};

/**
 * PendingChanges JSONB structure stored on companies.pendingChanges
 */
export interface PendingChangesScalarField {
  current: string | null;
  proposed: string | null;
}

export interface PendingChangesRelationField {
  current: string[];
  proposed: string[];
  added: string[];
  removed: string[];
}

export interface PendingChanges {
  scalarFields?: Record<string, PendingChangesScalarField>;
  capabilities?: PendingChangesRelationField;
  markets?: PendingChangesRelationField;
  standards?: PendingChangesRelationField;
  lastSavedAt: string;
}
