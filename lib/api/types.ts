// Shared API request/response types

// Re-export Zod-inferred CompanyAnalysis type
export type { CompanyAnalysis } from "@/lib/schemas/companyAnalysis";

// Canonical authenticated user shape returned by API auth helpers.
export interface AuthenticatedApiUser {
  id: string;
  email?: string | null;
}

// Canonical company DTO. Keep legacy snake_case aliases optional during migration.
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
  operationLocations?: unknown;
  address?: string | null;
  postcode?: string | null;
  status?: string | null;
  createdAt: string;
  updatedAt: string;
  aiAnalysis?: unknown;
  aiCapabilities?: unknown;
  aiCompetencies?: unknown;
  aiStrengths?: unknown;
  aiRecommendations?: unknown;
  systemExtracted?: unknown;
  humanVerified?: unknown;
  financialData?: unknown;
  complianceData?: unknown;
  consentDataFetch?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;

  // Legacy aliases kept for migration safety.
  user_id: string | null;
  company_name: string;
  companies_house_number: string | null;
  website_url: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  key_capabilities: string | null;
  past_projects: string | null;
  operation_locations?: unknown;
  created_at: string;
  updated_at: string;
  ai_analysis?: unknown;
  ai_capabilities?: unknown;
  ai_competencies?: unknown;
  ai_strengths?: unknown;
  ai_recommendations?: unknown;
  system_extracted?: unknown;
  human_verified?: unknown;
  financial_data?: unknown;
  compliance_data?: unknown;
  consent_data_fetch?: boolean | null;
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

function firstDefined<T>(...values: (T | undefined | null)[]): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

export function normalizeCompanyRecord(company: Record<string, unknown>): CompanyRecord {
  const companyName = firstDefined<string>(
    company.companyName as string | undefined,
    company.company_name as string | undefined,
  );

  return {
    ...(company as CompanyRecord),
    id: String(company.id ?? ""),
    userId: firstDefined<string | null>(
      company.userId as string | null | undefined,
      company.user_id as string | null | undefined,
    ) ?? null,
    companyName: companyName ?? "",
    companiesHouseNumber: firstDefined<string | null>(
      company.companiesHouseNumber as string | null | undefined,
      company.companies_house_number as string | null | undefined,
    ) ?? null,
    websiteUrl: firstDefined<string | null>(
      company.websiteUrl as string | null | undefined,
      company.website_url as string | null | undefined,
    ) ?? null,
    contactPerson: firstDefined<string | null>(
      company.contactPerson as string | null | undefined,
      company.contact_person as string | null | undefined,
    ) ?? null,
    contactEmail: firstDefined<string | null>(
      company.contactEmail as string | null | undefined,
      company.contact_email as string | null | undefined,
    ) ?? null,
    contactPhone: firstDefined<string | null>(
      company.contactPhone as string | null | undefined,
      company.contact_phone as string | null | undefined,
    ) ?? null,
    keyCapabilities: firstDefined<string | null>(
      company.keyCapabilities as string | null | undefined,
      company.key_capabilities as string | null | undefined,
    ) ?? null,
    pastProjects: firstDefined<string | null>(
      company.pastProjects as string | null | undefined,
      company.past_projects as string | null | undefined,
    ) ?? null,
    createdAt: String(
      firstDefined(
        company.createdAt as string | Date | undefined,
        company.created_at as string | undefined,
      ) ?? "",
    ),
    updatedAt: String(
      firstDefined(
        company.updatedAt as string | Date | undefined,
        company.updated_at as string | undefined,
      ) ?? "",
    ),
    operationLocations: firstDefined(
      company.operationLocations as unknown,
      company.operation_locations as unknown,
    ),
    aiAnalysis: firstDefined(company.aiAnalysis as unknown, company.ai_analysis as unknown),
    systemExtracted: firstDefined(
      company.systemExtracted as unknown,
      company.system_extracted as unknown,
    ),
    humanVerified: firstDefined(
      company.humanVerified as unknown,
      company.human_verified as unknown,
    ),
    financialData: firstDefined(
      company.financialData as unknown,
      company.financial_data as unknown,
    ),
    complianceData: firstDefined(
      company.complianceData as unknown,
      company.compliance_data as unknown,
    ),
    consentDataFetch: firstDefined<boolean | null>(
      company.consentDataFetch as boolean | null | undefined,
      company.consent_data_fetch as boolean | null | undefined,
    ) ?? null,

    // Backfill legacy aliases for old consumers.
    user_id: firstDefined<string | null>(
      company.user_id as string | null | undefined,
      company.userId as string | null | undefined,
    ) ?? null,
    company_name: companyName ?? "",
    companies_house_number: firstDefined<string | null>(
      company.companies_house_number as string | null | undefined,
      company.companiesHouseNumber as string | null | undefined,
    ) ?? null,
    website_url: firstDefined<string | null>(
      company.website_url as string | null | undefined,
      company.websiteUrl as string | null | undefined,
    ) ?? null,
    contact_person: firstDefined<string | null>(
      company.contact_person as string | null | undefined,
      company.contactPerson as string | null | undefined,
    ) ?? null,
    contact_email: firstDefined<string | null>(
      company.contact_email as string | null | undefined,
      company.contactEmail as string | null | undefined,
    ) ?? null,
    contact_phone: firstDefined<string | null>(
      company.contact_phone as string | null | undefined,
      company.contactPhone as string | null | undefined,
    ) ?? null,
    key_capabilities: firstDefined<string | null>(
      company.key_capabilities as string | null | undefined,
      company.keyCapabilities as string | null | undefined,
    ) ?? null,
    past_projects: firstDefined<string | null>(
      company.past_projects as string | null | undefined,
      company.pastProjects as string | null | undefined,
    ) ?? null,
    created_at: String(
      firstDefined(
        company.created_at as string | undefined,
        company.createdAt as string | Date | undefined,
      ) ?? "",
    ),
    updated_at: String(
      firstDefined(
        company.updated_at as string | undefined,
        company.updatedAt as string | Date | undefined,
      ) ?? "",
    ),
    operation_locations: firstDefined(
      company.operation_locations as unknown,
      company.operationLocations as unknown,
    ),
    ai_analysis: firstDefined(company.ai_analysis as unknown, company.aiAnalysis as unknown),
    system_extracted: firstDefined(
      company.system_extracted as unknown,
      company.systemExtracted as unknown,
    ),
    human_verified: firstDefined(
      company.human_verified as unknown,
      company.humanVerified as unknown,
    ),
    financial_data: firstDefined(
      company.financial_data as unknown,
      company.financialData as unknown,
    ),
    compliance_data: firstDefined(
      company.compliance_data as unknown,
      company.complianceData as unknown,
    ),
    consent_data_fetch: firstDefined<boolean | null>(
      company.consent_data_fetch as boolean | null | undefined,
      company.consentDataFetch as boolean | null | undefined,
    ) ?? null,
  };
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
    cpv_codes?: string[];
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

export interface MatchTendersResponse {
  message: string;
  analyzed_count: number;
  results: {
    tender_id: string;
    tender_title: string;
    overall_score: number;
  }[];
  up_to_date?: boolean;
}

export interface TenderMatchResult {
  overall_score: number;
  capability_score: number;
  experience_score: number;
  location_score: number;
  certification_score: number;
  match_reasons: string[];
  improvement_suggestions: string[];
  ai_analysis: {
    summary: string;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
    score_explanations?: {
      capability: string;
      experience: string;
      location: string;
      certification: string;
    };
  };
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  target_tender_id?: string | null;
  company_id: string;
}

export interface CreateProjectResponse {
  project: {
    id: string;
    name: string;
    description: string | null;
    lead_company_id: string;
    target_tender_id: string | null;
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

export interface FetchUKTendersResponse {
  tenders: unknown[];
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
