// Shared API request/response types

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

export interface CompanyAnalysis {
  competencies: string[];
  capabilities: string[];
  strengths: string[];
  certifications: string[];
  recommendations: string[];
  digitalMaturity: string;
  safetyRating: string;
  marketPosition: string;
  suggestedTaxonomies?: string[];
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
