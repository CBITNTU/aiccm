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
  // The logo is a brand claim on a verified profile, so a member's change is
  // staged rather than applied. The value is the URL of an already-uploaded
  // `pending/` blob; approving promotes it, rejecting deletes it.
  "logoUrl",
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
  logoUrl: "Company Logo",
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

/** Localized label via next-intl `CompanyPage.fieldLabels.*` (falls back to raw field id). */
export function getLocalizedCompanyFieldLabel(
  field: string,
  t: (key: string) => string,
): string {
  if (!(field in FIELD_LABELS)) return field;
  return t(`fieldLabels.${field}`);
}

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

/**
 * Recompute the `current` side of scalar drafts from an authoritative source
 * (the live company row, or a companySnapshot on a verification request).
 *
 * Reviewable columns on a verified company always hold the last *approved*
 * value — proposed values only land on approval — so the source is the source
 * of truth for "current". Used on read paths so drafts persisted with a stale
 * or null `current` still render correctly. Relation drafts are untouched.
 */
export function withResolvedScalarCurrents(
  pendingChanges: PendingChanges,
  source: Partial<Record<ReviewableScalarField, string | null>>,
): PendingChanges {
  if (!pendingChanges.scalarFields) return pendingChanges;

  const scalarFields: Record<string, PendingChangesScalarField> = {};
  for (const [field, change] of Object.entries(pendingChanges.scalarFields)) {
    scalarFields[field] = {
      ...change,
      current: source[field as ReviewableScalarField] ?? null,
    };
  }

  return { ...pendingChanges, scalarFields };
}
