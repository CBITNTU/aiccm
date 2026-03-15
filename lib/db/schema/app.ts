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
} from "drizzle-orm/pg-core";
import { user } from "./auth";

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
  (table) => [unique().on(table.companyId, table.tenderId)],
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
  name: text("name").notNull().unique(),
  category: text("category"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
