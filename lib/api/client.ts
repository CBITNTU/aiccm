// Frontend API client for calling Next.js API routes
// This will be used in Phase 2 (frontend migration) to replace supabase.functions.invoke()

export class ApiError extends Error {
  status: number;
  details?: string;

  constructor(message: string, status: number, details?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export async function apiCall<T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const { method = "POST", body } = options;

  const response = await fetch(`/api/${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include", // Include cookies for authentication
    ...(body && { body: JSON.stringify(body) }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.error || "Request failed",
      response.status,
      data.details,
    );
  }

  return data;
}

// Typed API client methods for each endpoint
// These provide type safety when calling API routes

export const api = {
  // Chat advisor
  chatAdvisor: (prompt: string) =>
    apiCall<{ response: string }>("chat-advisor", {
      body: { prompt },
    }),

  // Platform stats
  getPlatformStats: () =>
    apiCall<{
      companies: number;
      tenders: number;
      matches: number;
      projects: number;
    }>("get-platform-stats", { method: "GET" }),

  // Company analysis
  analyzeCompany: (companyId: string) =>
    apiCall<{ success: boolean; analysis: unknown }>("analyze-company", {
      body: { companyId },
    }),

  // Company AI analysis
  analyzeCompanyAI: (
    companyData: {
      companyName: string;
      websiteUrl?: string;
      description?: string;
      keyCapabilities?: string;
      certifications?: string;
      equipment?: string;
      pastProjects?: string;
    },
    companyId?: string,
  ) =>
    apiCall<{ analysis: unknown }>("analyze-company-ai", {
      body: { companyData, companyId },
    }),

  // Tender analysis
  analyzeTender: (
    tenderData: {
      title: string;
      description?: string;
      buyer: string;
      cpv_codes?: string[];
      location?: string;
    },
    tenderId?: string,
  ) =>
    apiCall<{ suggestedTaxonomies: string[]; taxonomyCount: number }>(
      "analyze-tender",
      { body: { tenderData, tenderId } },
    ),

  // Match tenders
  matchTenders: (companyId?: string) =>
    apiCall<{
      message: string;
      analyzed_count: number;
      results: {
        tender_id: string;
        tender_title: string;
        overall_score: number;
      }[];
      up_to_date?: boolean;
    }>("match-tenders", {
      body: companyId ? { companyId } : {},
    }),

  // Create project
  createProject: (data: {
    name: string;
    description?: string;
    target_tender_id?: string | null;
    company_id: string;
  }) =>
    apiCall<{ project: unknown }>("create-project", {
      body: data,
    }),

  // Send project invitations
  sendProjectInvitations: (
    projectId: string,
    tenderTitle: string,
    partnerIds: string[],
  ) =>
    apiCall<{ success: boolean; invitationsSent: number }>(
      "send-project-invitations",
      { body: { projectId, tenderTitle, partnerIds } },
    ),

  // Analyze project
  analyzeProject: (projectId: string) =>
    apiCall<{ analysis: unknown; recommendedPartners: unknown[] }>(
      "analyze-project",
      { body: { projectId } },
    ),

  // Analyze project simple
  analyzeProjectSimple: (prompt: string) =>
    apiCall<{ content: string }>("analyze-project-simple", {
      body: { prompt },
    }),

  // Fetch UK tenders
  fetchUKTenders: (options?: {
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
  }) =>
    apiCall<{
      tenders: unknown[];
      total: number;
      totalFetched: number;
      actuallyImported?: number;
      hasMore: boolean;
      nextCursor?: string;
      isAdmin?: boolean;
      source: string;
      duplicatesSkipped?: number;
    }>("fetch-uk-tenders", {
      body: options || {},
    }),

  // Fetch TED tenders
  fetchTEDTenders: (options?: {
    page?: number;
    limit?: number;
    iterationNextToken?: string;
    adminImport?: boolean;
    dateFrom?: string;
    dateTo?: string;
  }) =>
    apiCall<{
      tenders: unknown[];
      total: number;
      totalFetched: number;
      actuallyImported?: number;
      hasMore: boolean;
      nextPage?: number | null;
      nextToken?: string | null;
      isAdmin?: boolean;
      source: string;
      duplicatesSkipped?: number;
    }>("fetch-ted-tenders", {
      body: options || {},
    }),

  // Prefill company data
  prefillCompanyData: (data: {
    companyName: string;
    companyNumber?: string;
    websiteUrl?: string;
  }) =>
    apiCall<{
      companiesHouse?: unknown;
      endole?: unknown;
      website?: unknown;
      normalized?: unknown;
      errors?: string[];
    }>("prefill-company-data", {
      body: data,
    }),

  // Suggest capabilities for a tender
  suggestCapabilities: (tenderId: string) =>
    apiCall<{
      suggestedCapabilityIds: string[];
      suggestedCapabilityNames: string[];
      totalCapabilities: number;
    }>("suggest-capabilities", {
      body: { tenderId },
    }),

  // Analyze team for a project (consortium analysis)
  analyzeTeam: (data: {
    projectId: string;
    company: {
      id: string;
      company_name: string;
      key_capabilities?: string | null;
      certifications?: string | null;
      past_projects?: string | null;
      description?: string | null;
    };
    tender: {
      title: string;
      description?: string;
      buyer_name?: string;
      value?: number;
      region?: string;
    };
    teamMembers: {
      companies?: {
        company_name: string;
        key_capabilities?: string | null;
        certifications?: string | null;
        past_projects?: string | null;
        description?: string | null;
      } | null;
    }[];
  }) =>
    apiCall<{
      teamAnalysis: {
        type: "team";
        requiredCompetencies: string[];
        companyCompetencies: string[];
        missingCompetencies: string[];
        coveragePercentage: number;
        readinessScore: number;
        risks: string[];
        recommendations: string[];
        teamMembers: { companyName: string; contribution: string[] }[];
        analyzedAt: string;
      };
    }>("analyze-team", {
      body: data,
    }),
};
