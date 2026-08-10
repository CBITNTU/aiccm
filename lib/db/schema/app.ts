import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  uuid,
  integer,
  bigint,
  jsonb,
  inet,
  doublePrecision,
  unique,
  primaryKey,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { STORAGE_EMBEDDING_DIM } from "@/lib/ai/embeddingDim";

// pgvector column. Stored as `vector(N)`. Default embedder: OpenAI text-embedding-3-small @ 1536.
const vector = (dim: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dim})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(",")}]`;
    },
    fromDriver(value: string): number[] {
      // pgvector returns "[1,2,3]" — strip brackets and split
      return value
        .slice(1, -1)
        .split(",")
        .map((n) => Number(n));
    },
  });

const EMBEDDING_DIM = STORAGE_EMBEDDING_DIM;

// Enums
export const appRoleEnum = pgEnum("app_role", [
  "superadmin",
  "sme-owner",
  "sme-member",
  "individual",
  "admin",
  "user",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "unverified",
  "pending_verification",
  "verified",
]);

// ============================================================================
// Profiles
// ============================================================================
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  jobTitle: text("job_title"),
  approvalStatus: approvalStatusEnum("approval_status").notNull().default("pending"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: uuid("approved_by").references(() => user.id, { onDelete: "set null" }),
  rejectionReason: text("rejection_reason"),
  onboardingStep: integer("onboarding_step").default(1),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  accountType: text("account_type"),
  signupType: text("signup_type"),
  invitedToCompanyId: uuid("invited_to_company_id"),
});

// ============================================================================
// Companies
// ============================================================================
export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  companyName: text("company_name").notNull(),
  // Generic per-region company registry identifier — NOT UK-only despite the column name.
  // The label and expected format come from the active deployment profile's `verification`
  // config (e.g. Companies House Number for UK, Unified Social Credit Code for CN, Tax ID for TH).
  companiesHouseNumber: text("companies_house_number"),
  websiteUrl: text("website_url"),
  postcode: text("postcode"),
  address: text("address"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  contactPerson: text("contact_person"),
  description: text("description"),
  keyCapabilities: text("key_capabilities"),
  certifications: text("certifications"),
  equipment: text("equipment"),
  pastProjects: text("past_projects"),
  aiCompetencies: jsonb("ai_competencies"),
  aiCapabilities: jsonb("ai_capabilities"),
  aiStrengths: jsonb("ai_strengths"),
  aiCertifications: jsonb("ai_certifications"),
  aiRecommendations: jsonb("ai_recommendations"),
  aiAnalysis: jsonb("ai_analysis"),
  aiSummary: text("ai_summary"),
  aiCapabilityTaxonomy: jsonb("ai_capability_taxonomy"),
  taxonomyGeneratedAt: timestamp("taxonomy_generated_at", { withTimezone: true }),
  summaryGeneratedAt: timestamp("summary_generated_at", { withTimezone: true }),
  contentHash: text("content_hash"),
  // Basic matching: vector embedding of the company's textual summary + capabilities.
  embedding: vector(EMBEDDING_DIM)("embedding"),
  embeddingGeneratedAt: timestamp("embedding_generated_at", { withTimezone: true }),
  embeddingSourceHash: text("embedding_source_hash"),
  digitalMaturity: text("digital_maturity"),
  safetyRating: text("safety_rating"),
  marketPosition: text("market_position"),
  status: text("status").default("draft"),
  isSystemCompany: boolean("is_system_company").default(false),
  systemExtracted: jsonb("system_extracted").default({}),
  humanVerified: jsonb("human_verified").default({}),
  financialData: jsonb("financial_data").default({}),
  complianceData: jsonb("compliance_data").default({}),
  consentDataFetch: boolean("consent_data_fetch").default(false),
  operationLocations: jsonb("operation_locations").default([]),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  // Set when a superadmin curated this company on the owner's behalf (typically
  // from /admin/approvals before approving them). Approval then skips the
  // automatic AI prefill so the curated values are not overwritten.
  adminPreparedAt: timestamp("admin_prepared_at", { withTimezone: true }),
  adminPreparedBy: uuid("admin_prepared_by").references(() => user.id, { onDelete: "set null" }),
  verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverified"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: uuid("verified_by").references(() => user.id, { onDelete: "set null" }),
  pendingChanges: jsonb("pending_changes"),
  matchingRunsLimit: integer("matching_runs_limit"),
  analysisRunsLimit: integer("analysis_runs_limit"),
  // When set, monthly matching/analysis usage is counted only from this instant
  // (or the calendar month start, whichever is later). Lets a superadmin reset
  // an account's usage without deleting audit rows.
  usageResetAt: timestamp("usage_reset_at", { withTimezone: true }),
});

// ============================================================================
// User Roles
// ============================================================================
export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: appRoleEnum("role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.role)],
);

// ============================================================================
// Tenders
// ============================================================================
export const tenders = pgTable("tenders", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  referenceNumber: text("reference_number").unique(),
  title: text("title").notNull(),
  buyer: text("buyer").notNull(),
  cpvCodes: text("cpv_codes").array(),
  description: text("description"),
  budgetMin: bigint("budget_min", { mode: "number" }),
  budgetMax: bigint("budget_max", { mode: "number" }),
  // ISO 4217 currency captured at ingest (e.g. GBP, EUR, CNY). NULL for legacy rows —
  // consumers fall back to the active deployment profile's currency.
  currency: text("currency"),
  // Deployment region that ingested this tender ("uk" | "cn" | "th").
  region: text("region"),
  // Tender source adapter id that produced this row ("find_tender" | "ted" | ...).
  source: text("source"),
  location: text("location"),
  deadline: timestamp("deadline", { withTimezone: true }),
  publicationDate: timestamp("publication_date", { withTimezone: true }).defaultNow(),
  status: text("status").default("open"),
  contactInfo: jsonb("contact_info"),
  documents: jsonb("documents"),
  requirements: jsonb("requirements"),
  aiSummary: text("ai_summary"),
  aiCapabilityTaxonomy: jsonb("ai_capability_taxonomy"),
  taxonomyGeneratedAt: timestamp("taxonomy_generated_at", { withTimezone: true }),
  summaryGeneratedAt: timestamp("summary_generated_at", { withTimezone: true }),
  // Basic matching: vector embedding of the tender's textual summary + requirements.
  embedding: vector(EMBEDDING_DIM)("embedding"),
  embeddingGeneratedAt: timestamp("embedding_generated_at", { withTimezone: true }),
  embeddingSourceHash: text("embedding_source_hash"),
});

// ============================================================================
// Matching Results
// ============================================================================
export const matchingResults = pgTable(
  "matching_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    overallScore: integer("overall_score"),
    capabilityScore: integer("capability_score"),
    experienceScore: integer("experience_score"),
    locationScore: integer("location_score"),
    certificationScore: integer("certification_score"),
    aiAnalysis: jsonb("ai_analysis"),
    matchReasons: text("match_reasons").array(),
    improvementSuggestions: text("improvement_suggestions").array(),
    isBookmarked: boolean("is_bookmarked").default(false),
    isApplied: boolean("is_applied").default(false),
    applicationDate: timestamp("application_date", { withTimezone: true }),
  },
  (table) => [
    unique().on(table.companyId, table.tenderId),
    // The unified feed sorts a company's deep matches by score. Without this the
    // `ORDER BY ... LIMIT offset+pageSize` window is a full scan of the company's
    // matches; the curated overlay's LEFT JOIN makes that cost more visible.
    index("matching_results_company_score_idx").on(
      table.companyId,
      table.overallScore,
    ),
  ],
);

// ============================================================================
// Curated Matches
// ============================================================================
/**
 * Superadmin-curated overrides layered on top of the computed match feed.
 *
 * Deliberately a separate table rather than columns on `matching_results`:
 * `scoreTenderMatch` treats any existing row as an AI cache hit and a forced
 * re-run upserts over it, so admin-authored values stored there would both
 * poison the model cache and be silently destroyed. Keeping curation in its own
 * table also lets it target a tender that has no match row at all, and keeps the
 * AI pipeline's own data honest for quality metrics and evals.
 *
 * Applied at read time — see lib/services/curatedMatches.ts, which is the single
 * source of truth every read surface must go through.
 */
export const curatedMatches = pgTable(
  "curated_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    /** draft | published | archived. Only `published` affects any user-facing read. */
    status: text("status").notNull().default("draft"),
    /** Display floor, 1-100. NULL means "pin only, don't touch the score". */
    curatedScore: integer("curated_score"),
    pinned: boolean("pinned").notNull().default(false),
    /** Ascending order among a company's pinned curations. */
    pinRank: integer("pin_rank"),
    // Back-solved breakdown, frozen at publish so the list card and the detail
    // page can never disagree. NULL when evidence mode produced real numbers.
    curatedCapabilityScore: integer("curated_capability_score"),
    curatedExperienceScore: integer("curated_experience_score"),
    curatedLocationScore: integer("curated_location_score"),
    curatedCertificationScore: integer("curated_certification_score"),
    curatedMatchReasons: text("curated_match_reasons").array(),
    curatedSummary: text("curated_summary"),
    /** Private context fed into the deep-research prompt on an evidence re-run. */
    evidenceNote: text("evidence_note"),
    /**
     * Which score dimensions the evidence note actually vouches for —
     * `capability` | `experience` | `certification`.
     *
     * The note is always shown to the model, but it only counts as *direct*
     * company data (lifting the missing-data zero and the 30% indirect penalty
     * in `scoreTenderMatch`) for the dimensions listed here. Without this, one
     * note about a framework agreement silently vouched for certifications and
     * capabilities too — and certification alone is 50% of the overall score.
     */
    evidenceDimensions: text("evidence_dimensions").array(),
    /** Admin-only justification. Never leaves /api/admin/**. */
    internalNote: text("internal_note"),
    /** Defaults to the tender's deadline; a lapsed curation stops applying. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => user.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    unique().on(table.companyId, table.tenderId),
    index("curated_matches_company_status_idx").on(table.companyId, table.status),
    // The tender FK cascades on delete and Postgres does not index FK children
    // automatically, so without this a tender delete seq-scans this table.
    index("curated_matches_tender_idx").on(table.tenderId),
  ],
);

// ============================================================================
// Company Members
// ============================================================================
export const companyMembers = pgTable(
  "company_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("pending"),
    invitedBy: uuid("invited_by").references(() => user.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.companyId, table.userId)],
);

// ============================================================================
// Company Join Requests
// ============================================================================
export const companyJoinRequests = pgTable(
  "company_join_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    companyNameRequested: text("company_name_requested").notNull(),
    message: text("message"),
    status: text("status").notNull().default("pending"),
    adminApprovedAt: timestamp("admin_approved_at", { withTimezone: true }),
    adminApprovedBy: uuid("admin_approved_by").references(() => user.id, {
      onDelete: "set null",
    }),
    superadminApprovedAt: timestamp("superadmin_approved_at", { withTimezone: true }),
    superadminApprovedBy: uuid("superadmin_approved_by").references(() => user.id, {
      onDelete: "set null",
    }),
    rejectionReason: text("rejection_reason"),
    rejectedBy: uuid("rejected_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.companyId)],
);

// ============================================================================
// Team Invitations
// ============================================================================
export const teamInvitations = pgTable("team_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: uuid("invited_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedBy: uuid("accepted_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// Taxonomies
// ============================================================================
export const taxonomies = pgTable("taxonomies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  level: integer("level").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyTaxonomies = pgTable(
  "company_taxonomies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    taxonomyId: uuid("taxonomy_id")
      .notNull()
      .references(() => taxonomies.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.companyId, table.taxonomyId)],
);

export const tenderTaxonomies = pgTable(
  "tender_taxonomies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    taxonomyId: uuid("taxonomy_id")
      .notNull()
      .references(() => taxonomies.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.tenderId, table.taxonomyId)],
);

// ============================================================================
// Company Capabilities
// ============================================================================
export const companyCapabilitiesRef = pgTable("company_capabilities_ref", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nameZh: text("name_zh"),
  category: text("category"),
  categoryZh: text("category_zh"),
  parentId: uuid("parent_id"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Canonical competency taxonomy from CSV. Populated by seed script.
// Admin reset-capabilities copies this into company_capabilities_ref.
export const competencyTaxonomySeed = pgTable("competency_taxonomy_seed", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  nameZh: text("name_zh"),
  category: text("category"),
  categoryZh: text("category_zh"),
  parentId: uuid("parent_id"),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => [index("idx_competency_taxonomy_seed_parent_id").on(table.parentId)]);

export const companyCapabilities = pgTable(
  "company_capabilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    capabilityId: uuid("capability_id")
      .notNull()
      .references(() => companyCapabilitiesRef.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.companyId, table.capabilityId)],
);

// ============================================================================
// Markets
// ============================================================================
export const markets = pgTable("markets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nameZh: text("name_zh"),
  parentId: uuid("parent_id"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyMarkets = pgTable(
  "company_markets",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.companyId, table.marketId] })],
);

// ============================================================================
// Standards
// ============================================================================
export const standardsRef = pgTable("standards_ref", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nameZh: text("name_zh"),
  parentId: uuid("parent_id"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyStandards = pgTable(
  "company_standards",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    standardId: uuid("standard_id")
      .notNull()
      .references(() => standardsRef.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.companyId, table.standardId] })],
);

// ============================================================================
// Virtual Organizations (Projects)
// ============================================================================
export const virtualOrganizations = pgTable("virtual_organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  leadCompanyId: uuid("lead_company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  projectOwnerId: uuid("project_owner_id").references(() => user.id, {
    onDelete: "cascade",
  }),
  status: text("status").notNull().default("draft"),
  targetTenderId: uuid("target_tender_id").references(() => tenders.id, {
    onDelete: "set null",
  }),
  gapAnalysis: jsonb("gap_analysis"),
  teamAnalysis: jsonb("team_analysis"),
  recommendedPartners: jsonb("recommended_partners"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const voMembers = pgTable(
  "vo_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    voId: uuid("vo_id")
      .notNull()
      .references(() => virtualOrganizations.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    invitationStatus: text("invitation_status"),
    invitationToken: uuid("invitation_token").defaultRandom(),
    invitationSentAt: timestamp("invitation_sent_at", { withTimezone: true }),
    invitationRespondedAt: timestamp("invitation_responded_at", { withTimezone: true }),
    invitationMessage: text("invitation_message"),
  },
  (table) => [unique().on(table.voId, table.companyId)],
);

// ============================================================================
// Partnership
// ============================================================================
export const partnershipRecommendations = pgTable(
  "partnership_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    recommendedCompanyId: uuid("recommended_company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    compatibilityScore: integer("compatibility_score").notNull().default(0),
    complementaryCapabilities: text("complementary_capabilities").array(),
    sharedLocations: text("shared_locations").array(),
    recommendedForTenderId: uuid("recommended_for_tender_id").references(() => tenders.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.companyId, table.recommendedCompanyId)],
);

export const partnershipMessages = pgTable("partnership_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromCompanyId: uuid("from_company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  toCompanyId: uuid("to_company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  tenderId: uuid("tender_id").references(() => tenders.id, { onDelete: "set null" }),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// Events / Audit Log
// ============================================================================
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
  userEmail: text("user_email"),
  actionType: text("action_type").notNull(),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  details: jsonb("details").default({}),
  ipAddress: inet("ip_address"),
  userAgent: text("user_agent"),
  requestPath: text("request_path"),
  requestMethod: text("request_method"),
  status: text("status").default("success"),
  errorMessage: text("error_message"),
});

// ============================================================================
// AI Processing Queue
// ============================================================================
export const processingQueue = pgTable("processing_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobType: text("job_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  tenderId: uuid("tender_id").references(() => tenders.id, { onDelete: "cascade" }),
  batchId: uuid("batch_id"),
  status: text("status").notNull().default("pending"),
  priority: integer("priority").default(0),
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  errorMessage: text("error_message"),
  resultData: jsonb("result_data"),
  metadata: jsonb("metadata"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const batchJobs = pgTable("batch_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchType: text("batch_type").notNull(),
  userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  totalJobs: integer("total_jobs").notNull(),
  completedJobs: integer("completed_jobs").default(0),
  failedJobs: integer("failed_jobs").default(0),
  status: text("status").notNull().default("processing"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  metadata: jsonb("metadata"),
});

// ============================================================================
// Platform Settings
// ============================================================================
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// Company Verification Requests
// ============================================================================
export const companyVerificationRequests = pgTable("company_verification_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  submittedBy: uuid("submitted_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  submissionNotes: text("submission_notes"),
  reviewNotes: text("review_notes"),
  reviewedBy: uuid("reviewed_by").references(() => user.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  companySnapshot: jsonb("company_snapshot").default({}),
  reviewFeedback: jsonb("review_feedback"),
  requestType: text("request_type").notNull().default("initial_verification"),
  pendingChangesSnapshot: jsonb("pending_changes_snapshot"),
  // Future-proofing fields
  paymentReference: text("payment_reference"),
  scheduledVisitAt: timestamp("scheduled_visit_at", { withTimezone: true }),
  questionnaireResponses: jsonb("questionnaire_responses"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// Competency Change Requests
// ============================================================================
export const competencyChangeRequests = pgTable("competency_change_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  requestedBy: uuid("requested_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  proposedAdditions: jsonb("proposed_additions").default([]),
  proposedRemovals: jsonb("proposed_removals").default([]),
  reviewNotes: text("review_notes"),
  reviewedBy: uuid("reviewed_by").references(() => user.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// Demo Matching Results
// ============================================================================
export const demoMatchingResults = pgTable("demo_matching_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  batchLabel: text("batch_label").notNull(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  tenderId: uuid("tender_id")
    .notNull()
    .references(() => tenders.id, { onDelete: "cascade" }),
  modelUsed: text("model_used").notNull(),
  overallScore: integer("overall_score"),
  capabilityScore: integer("capability_score"),
  experienceScore: integer("experience_score"),
  locationScore: integer("location_score"),
  certificationScore: integer("certification_score"),
  matchReasons: text("match_reasons").array(),
  improvementSuggestions: text("improvement_suggestions").array(),
  aiAnalysis: jsonb("ai_analysis"),
});
