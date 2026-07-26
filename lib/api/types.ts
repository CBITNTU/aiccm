// Shared API request/response types

// Re-export Zod-inferred CompanyAnalysis type
export type { CompanyAnalysis } from "@/lib/schemas/companyAnalysis";
import type { companies, tenders } from "@/lib/db/schema/app";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export type CompanyDbRow = typeof companies.$inferSelect;
export type TenderDbRow = typeof tenders.$inferSelect;

// Canonical authenticated user shape returned by API auth helpers.
export interface AuthenticatedApiUser {
  id: string;
  email?: string | null;
  emailVerified?: boolean | null;
}

// Canonical company DTO — camelCase only.
export interface CompanyRecord {
  id: string;
  userId: string | null;
  companyName: string;
  companiesHouseNumber: string | null;
  websiteUrl: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  description?: string | null;
  keyCapabilities: string | null;
  certifications?: string | null;
  equipment?: string | null;
  pastProjects: string | null;
  operationLocations?: JsonValue;
  address?: string | null;
  postcode?: string | null;
  status?: string | null;
  createdAt: string;
  updatedAt: string;
  aiAnalysis?: JsonValue;
  aiCapabilities?: JsonValue;
  aiCompetencies?: JsonValue;
  aiStrengths?: JsonValue;
  aiRecommendations?: JsonValue;
  systemExtracted?: JsonValue;
  humanVerified?: JsonValue;
  financialData?: JsonValue;
  complianceData?: JsonValue;
  consentDataFetch?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
  digitalMaturity?: string | null;
  safetyRating?: string | null;
  marketPosition?: string | null;
  isSystemCompany?: boolean | null;
  verificationStatus?: string | null;
  verifiedAt?: string | null;
  aiCertifications?: JsonValue;
  aiSummary?: string | null;
  aiCapabilityTaxonomy?: JsonValue;
  taxonomyGeneratedAt?: string | null;
  summaryGeneratedAt?: string | null;
  contentHash?: string | null;
  pendingChanges?: JsonValue;
  matchingRunsLimit?: number | null;
  analysisRunsLimit?: number | null;
}

export type AdminCompanyListType = "user" | "system";
export type AdminCompanyVerificationStatus =
  | "all"
  | "unverified"
  | "pending_verification"
  | "verified";

export interface AdminCompanyStats {
  total: number;
  user: number;
  system: number;
  verified: number;
  pending: number;
  unverified: number;
}

export interface AdminCompanyListParams {
  type?: AdminCompanyListType;
  page?: number;
  pageSize?: number;
  search?: string;
  verificationStatus?: AdminCompanyVerificationStatus;
}

export interface AdminCompanyListResponse {
  companies: CompanyRecord[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  stats: AdminCompanyStats;
}

export interface AdminPendingCompanyDetails {
  id: string;
  companyName: string;
  companiesHouseNumber: string | null;
  websiteUrl: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface AdminPendingUser {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  approvalStatus: string;
  createdAt: string;
  role: string;
  companyName: string | null;
  signupType: string;
  company: AdminPendingCompanyDetails | null;
}

export interface AdminJoinRequest {
  id: string;
  userId: string;
  companyId: string;
  companyNameRequested: string;
  message: string | null;
  status: string;
  adminApprovedAt: string | null;
  createdAt: string;
  user: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    jobTitle: string | null;
  } | null;
}

function asStringOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function asNumberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asStringArrayOrNull(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string");
}

export function normalizeCompanyRecord(company: Record<string, unknown>): CompanyRecord {
  return {
    ...(company as unknown as CompanyRecord),
    id: String(company.id ?? ""),
    userId: asStringOrNull(company.userId) ?? null,
    companyName: String(company.companyName ?? ""),
    companiesHouseNumber: asStringOrNull(company.companiesHouseNumber),
    websiteUrl: asStringOrNull(company.websiteUrl),
    contactPerson: asStringOrNull(company.contactPerson),
    contactEmail: asStringOrNull(company.contactEmail),
    contactPhone: asStringOrNull(company.contactPhone),
    keyCapabilities: asStringOrNull(company.keyCapabilities),
    pastProjects: asStringOrNull(company.pastProjects),
    createdAt: String(company.createdAt instanceof Date ? (company.createdAt as Date).toISOString() : company.createdAt ?? ""),
    updatedAt: String(company.updatedAt instanceof Date ? (company.updatedAt as Date).toISOString() : company.updatedAt ?? ""),
    operationLocations: (company.operationLocations as JsonValue | undefined),
    aiAnalysis: (company.aiAnalysis as JsonValue | undefined),
    systemExtracted: (company.systemExtracted as JsonValue | undefined),
    humanVerified: (company.humanVerified as JsonValue | undefined),
    financialData: (company.financialData as JsonValue | undefined),
    complianceData: (company.complianceData as JsonValue | undefined),
    consentDataFetch: (company.consentDataFetch as boolean | null | undefined) ?? null,
  };
}

export interface TenderRecord {
  id: string;
  title: string;
  description: string | null;
  buyer: string;
  location: string | null;
  status: string | null;
  publicationDate: string | null;
  deadline: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string | null;
  referenceNumber: string | null;
  cpvCodes: string[] | null;
  aiSummary: string | null;
  aiCapabilityTaxonomy: JsonValue;
  documents: JsonValue;
  requirements: JsonValue;
  contactInfo: JsonValue;
}

export interface TenderMatchRecord {
  id: string;
  overallScore: number | null;
  capabilityScore: number | null;
  experienceScore: number | null;
  locationScore: number | null;
  certificationScore: number | null;
  matchReasons: string[];
  improvementSuggestions: string[];
  aiAnalysis: JsonValue;
}

export interface MatchingResultRecord {
  id: string;
  tenderId: string;
  companyId: string;
  overallScore: number | null;
  capabilityScore: number | null;
  experienceScore: number | null;
  locationScore: number | null;
  certificationScore: number | null;
  matchReasons: string[];
  improvementSuggestions: string[];
  aiAnalysis: JsonValue;
  isBookmarked: boolean;
  isApplied: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  tenders: {
    title: string;
    buyer: string;
    description: string | null;
    location: string | null;
    deadline: string | null;
    budgetMin: number | null;
    budgetMax: number | null;
    currency: string | null;
    status: string | null;
  } | null;
}

export function normalizeTenderRecord(tender: Record<string, unknown>): TenderRecord {
  return {
    id: String(tender.id ?? ""),
    title: String(tender.title ?? ""),
    description: asStringOrNull(tender.description),
    buyer: String(tender.buyer ?? ""),
    location: asStringOrNull(tender.location),
    status: asStringOrNull(tender.status),
    publicationDate: asStringOrNull(tender.publicationDate),
    deadline: asStringOrNull(tender.deadline),
    budgetMin: asNumberOrNull(tender.budgetMin),
    budgetMax: asNumberOrNull(tender.budgetMax),
    currency: asStringOrNull(tender.currency),
    referenceNumber: asStringOrNull(tender.referenceNumber),
    cpvCodes: asStringArrayOrNull(tender.cpvCodes),
    aiSummary: asStringOrNull(tender.aiSummary),
    aiCapabilityTaxonomy: (tender.aiCapabilityTaxonomy as JsonValue | undefined) ?? null,
    documents: (tender.documents as JsonValue | undefined) ?? null,
    requirements: (tender.requirements as JsonValue | undefined) ?? null,
    contactInfo: (tender.contactInfo as JsonValue | undefined) ?? null,
  };
}

export function normalizeTenderMatchRecord(match: Record<string, unknown>): TenderMatchRecord {
  return {
    id: String(match.id ?? ""),
    overallScore: asNumberOrNull(match.overallScore),
    capabilityScore: asNumberOrNull(match.capabilityScore),
    experienceScore: asNumberOrNull(match.experienceScore),
    locationScore: asNumberOrNull(match.locationScore),
    certificationScore: asNumberOrNull(match.certificationScore),
    matchReasons: asStringArrayOrNull(match.matchReasons) ?? [],
    improvementSuggestions: asStringArrayOrNull(match.improvementSuggestions) ?? [],
    aiAnalysis: (match.aiAnalysis as JsonValue | undefined) ?? null,
  };
}

export function normalizeMatchingResultRecord(
  result: Record<string, unknown>,
): MatchingResultRecord {
  const nestedTenders = result.tenders as Record<string, unknown> | null | undefined;
  return {
    id: String(result.id ?? ""),
    tenderId: String(result.tenderId ?? ""),
    companyId: String(result.companyId ?? ""),
    overallScore: asNumberOrNull(result.overallScore),
    capabilityScore: asNumberOrNull(result.capabilityScore),
    experienceScore: asNumberOrNull(result.experienceScore),
    locationScore: asNumberOrNull(result.locationScore),
    certificationScore: asNumberOrNull(result.certificationScore),
    matchReasons: asStringArrayOrNull(result.matchReasons) ?? [],
    improvementSuggestions: asStringArrayOrNull(result.improvementSuggestions) ?? [],
    aiAnalysis: (result.aiAnalysis as JsonValue | undefined) ?? null,
    isBookmarked: (result.isBookmarked as boolean | undefined) ?? false,
    isApplied: (result.isApplied as boolean | undefined) ?? false,
    createdAt: asStringOrNull(result.createdAt),
    updatedAt: asStringOrNull(result.updatedAt),
    tenders: nestedTenders
      ? {
          title: String(nestedTenders.title ?? ""),
          buyer: String(nestedTenders.buyer ?? ""),
          description: asStringOrNull(nestedTenders.description),
          location: asStringOrNull(nestedTenders.location),
          deadline: asStringOrNull(nestedTenders.deadline),
          budgetMin: asNumberOrNull(nestedTenders.budgetMin),
          budgetMax: asNumberOrNull(nestedTenders.budgetMax),
          currency: asStringOrNull(nestedTenders.currency),
          status: asStringOrNull(nestedTenders.status),
        }
      : null,
  };
}

// Unified tender-match types — server merges deep (matching_results) and basic
// (semantic) matches into one interleaved, paginated, 0%-filtered list.
interface UnifiedMatchCommon {
  tenderId: string;
  title: string;
  buyer: string;
  description: string | null;
  location: string | null;
  deadline: string | null;
  status: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string | null;
  /** Effective match score, 0-100. Deep: overallScore. Basic: round(similarity*100). */
  score: number;
}

export interface UnifiedMatchDeep extends UnifiedMatchCommon {
  variant: "deep";
  /** matching_results.id — React key + bookmark/delete target. */
  resultId: string;
  capabilityScore: number;
  experienceScore: number;
  locationScore: number;
  certificationScore: number;
  matchReasons: string[];
  isBookmarked: boolean;
  isApplied: boolean;
}

export interface UnifiedMatchBasic extends UnifiedMatchCommon {
  variant: "basic";
}

export type UnifiedMatch = UnifiedMatchDeep | UnifiedMatchBasic;

export interface TenderMatchesResponse {
  results: UnifiedMatch[];
  /** Total matched tenders (deep filtered + basic overlay) for the current filters. */
  matchedCount: number;
  /** Total deep-researched tenders for this company+status, regardless of score/filters. */
  deepResearchedCount: number;
  /**
   * Deep-researched tenders that scored 0% (or NULL) for this company+status —
   * the set the default view hides. Unfiltered, so it stays stable as the user
   * narrows the matched list. Returned in both views.
   */
  ruledOutCount: number;
  page: number;
  pageSize: number;
}

// Verification review types
export interface ReviewFeedbackItem {
  section: string;
  label: string;
  status: "ok" | "needs_changes";
  notes: string;
}

export interface ReviewFeedback {
  items: ReviewFeedbackItem[];
  overallNotes: string;
}

export interface VerificationReviewData {
  request: {
    id: string;
    companyId: string;
    submittedBy: string;
    status: string;
    requestType: string;
    submissionNotes: string | null;
    reviewNotes: string | null;
    reviewFeedback: ReviewFeedback | null;
    companySnapshot: Record<string, unknown>;
    pendingChangesSnapshot: Record<string, unknown> | null;
    createdAt: string;
    reviewedAt: string | null;
  };
  company: CompanyRecord;
  capabilities: { id: string; name: string; category: string }[];
  markets: { id: string; name: string; parentId: string | null; sortOrder: number | null }[];
  standards: { id: string; name: string; parentId: string | null; sortOrder: number | null }[];
  previousRequests: {
    id: string;
    status: string;
    submissionNotes: string | null;
    reviewNotes: string | null;
    reviewFeedback: ReviewFeedback | null;
    companySnapshot: Record<string, unknown>;
    createdAt: string;
    reviewedAt: string | null;
  }[];
  submitter: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    jobTitle: string | null;
  } | null;
  resolvedPendingChanges: Record<string, unknown> | null;
}

export interface PlatformStats {
  companies: number;
  tenders: number;
  matches: number;
  projects: number;
}

export interface ChatAdvisorRequest {
  prompt: string;
}

export interface ChatAdvisorResponse {
  response: string;
  error?: string;
}

export interface CompanyAnalysisRequest {
  companyId: string;
}

export interface CompanyAIAnalysisRequest {
  companyData: {
    companyName: string;
    websiteUrl?: string;
    description?: string;
    keyCapabilities?: string;
    certifications?: string;
    equipment?: string;
    pastProjects?: string;
  };
  companyId?: string;
}

/**
 * AI-suggested additions to a reviewable relation (competencies / markets),
 * returned by /api/analyze-company for the review modal. Only additions are
 * ever proposed — analysis must not suggest removing a human selection.
 */
export interface RelationSuggestion {
  currentIds: string[];
  additions: { id: string; name: string }[];
}

export interface DeepCompanyAnalysis {
  companyInfo: {
    description?: string;
    key_capabilities?: string;
    equipment?: string;
    certifications?: string;
    past_projects?: string;
    contact_person?: string;
    contact_email?: string;
    contact_phone?: string;
    postcode?: string;
  };
  performanceBenchmark: {
    technicalExpertise: number;
    safetyStandards: number;
    innovation: number;
    projectExperience: number;
    certifications: number;
    marketReputation: number;
    financialHealth: number;
    operationalCapacity: number;
    overallScore: number;
  };
  coreCompetencies: string[];
  digitalMaturity: string;
  safetyRating: string;
  marketPosition: string;
  businessInsights: string[];
  competitivePositioning: string;
  swotSummary: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  executiveSummary: string;
}

export interface TenderAnalysisRequest {
  tenderData: {
    title: string;
    description?: string;
    buyer: string;
    cpvCodes?: string[];
    location?: string;
  };
  tenderId?: string;
}

export interface TenderAnalysisResponse {
  suggestedTaxonomies: string[];
  taxonomyCount: number;
}

export interface MatchTendersRequest {
  companyId?: string;
}

export type MatchTendersResponse = {
  message: string;
  analyzedCount: number;
  results: {
    tenderId: string;
    tenderTitle: string;
    overallScore: number;
  }[];
  upToDate?: boolean;
  batchId?: string;
  totalTenders?: number;
};

export type TenderMatchResult = {
  overallScore: number;
  capabilityScore: number;
  experienceScore: number;
  locationScore: number;
  certificationScore: number;
  matchReasons: string[];
  improvementSuggestions: string[];
  aiAnalysis: {
    summary: string;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
    scoreExplanations?: {
      capability: string;
      experience: string;
      location: string;
      certification: string;
    };
  };
};

export interface CreateProjectRequest {
  name: string;
  description?: string;
  targetTenderId?: string | null;
  companyId: string;
}

export interface CreateProjectResponse {
  project: {
    id: string;
    name: string;
    description: string | null;
    leadCompanyId: string;
    targetTenderId: string | null;
    status: string;
  };
}

export interface SendInvitationsRequest {
  projectId: string;
  tenderTitle: string;
  partnerIds: string[];
}

export interface SendInvitationsResponse {
  success: boolean;
  invitationsSent: number;
}

export interface ProjectAnalysis {
  requiredCompetencies: string[];
  companyCompetencies: string[];
  missingCompetencies: string[];
  coveragePercentage: number;
  readinessScore: number;
  risks: string[];
  recommendations?: string[];
}

export interface RecommendedPartner {
  id: string;
  name: string;
  matchScore: number;
  missingCapabilities: string[];
}

export interface AnalyzeProjectResponse {
  analysis: ProjectAnalysis;
  recommendedPartners: RecommendedPartner[];
}

export interface FetchUKTendersRequest {
  searchTerm?: string;
  limit?: number;
  cursor?: string;
  adminImport?: boolean;
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    budgetMin?: number;
    budgetMax?: number;
  };
}

export interface TenderFeedRecord {
  id?: string;
  ocid?: string;
  referenceNumber: string;
  title: string;
  buyer: string;
  cpvCodes: string[];
  description: string;
  budgetMin: number | null;
  budgetMax: number | null;
  location: string;
  deadline: string | null;
  status: string;
  publicationDate: string;
  contactInfo: JsonValue;
  requirements?: JsonValue;
  documents?: JsonValue;
  externalId?: string;
  source?: string;
}

export interface FetchUKTendersResponse {
  tenders: TenderFeedRecord[];
  total: number;
  totalFetched: number;
  hasMore: boolean;
  nextCursor?: string;
  isAdmin?: boolean;
  source: string;
  duplicatesSkipped?: number;
}

export interface PrefillCompanyDataRequest {
  companyName: string;
  companyNumber?: string;
  websiteUrl?: string;
}

export interface PrefillCompanyDataResponse {
  companiesHouse?: {
    url: string;
    found: boolean;
    html?: string;
  };
  endole?: {
    url: string;
    found: boolean;
    html?: string;
  };
  website?: {
    url: string;
    found: boolean;
    html?: string;
  };
  normalized?: {
    description?: { value: string; confidence: number; evidence: string };
    capabilities?: { value: string; confidence: number; evidence: string }[];
    certifications?: {
      name: string;
      issuer?: string;
      certId?: string;
      validUntil?: string;
      confidence: number;
      evidence: string;
    }[];
    equipment?: {
      name: string;
      model?: string;
      capacity?: string;
      notes?: string;
      confidence: number;
      evidence: string;
    }[];
    sectors?: { value: string; confidence: number; evidence: string }[];
    locations?: { value: string; confidence: number; evidence: string }[];
    address?: { value: string; confidence: number; evidence: string };
    financial?: {
      employees?: { value: number; confidence: number; evidence: string };
      netAssets?: { value: number; confidence: number; evidence: string };
      totalAssets?: { value: number; confidence: number; evidence: string };
      totalLiabilities?: {
        value: number;
        confidence: number;
        evidence: string;
      };
      cash?: { value: number; confidence: number; evidence: string };
      debtRatio?: { value: number; confidence: number; evidence: string };
    };
    compliance?: {
      accountsFiled?: { value: string; confidence: number; evidence: string };
      accountsDue?: { value: string; confidence: number; evidence: string };
      confirmationStatement?: {
        value: string;
        confidence: number;
        evidence: string;
      };
      activeCharges?: { value: number; confidence: number; evidence: string };
    };
  };
  errors?: string[];
}
