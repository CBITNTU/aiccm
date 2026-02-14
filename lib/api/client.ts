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
    params?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> {
  const { method = "POST", body, params } = options;

  let url = `/api/${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const response = await fetch(url, {
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

  // Analyze project simple (gap analysis)
  analyzeProjectSimple: (data: {
    projectId: string;
    companyId: string;
    tenderId: string;
  }) =>
    apiCall<{
      analysis: {
        requiredCompetencies: string[];
        companyCompetencies: string[];
        missingCompetencies: string[];
        coveragePercentage: number;
        readinessScore: number;
        risks: string[];
        recommendations: string[];
      };
      projectId: string;
    }>("analyze-project-simple", {
      body: data,
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

  // User role
  getUserRole: () =>
    apiCall<{ role: string | null; isAdmin: boolean }>("user-role", {
      method: "GET",
    }),

  // Taxonomies
  getTaxonomies: () =>
    apiCall<{
      taxonomies: {
        id: string;
        name: string;
        parent_id: string | null;
        level: number;
        description: string | null;
      }[];
    }>("taxonomies", { method: "GET" }),

  // Companies
  getMyCompanies: () =>
    apiCall<{ companies: Record<string, unknown>[] }>("companies/mine", {
      method: "GET",
    }),

  getCompany: (companyId: string) =>
    apiCall<{
      company: Record<string, unknown>;
      isOwner: boolean;
      capabilities: { id: string; name: string; category: string }[];
    }>(`companies/${companyId}`, { method: "GET" }),

  updateCompany: (companyId: string, updates: Record<string, unknown>) =>
    apiCall<{ company: Record<string, unknown> }>(`companies/${companyId}`, {
      method: "PUT",
      body: updates,
    }),

  getCompanyCapabilities: (companyId: string) =>
    apiCall<{
      capabilities: { id: string; name: string; category: string }[];
      allCapabilities: { id: string; name: string; category: string }[];
    }>(`companies/${companyId}/capabilities`, { method: "GET" }),

  syncCapabilities: (companyId: string, capabilityIds: string[]) =>
    apiCall<{
      capabilities: { id: string; name: string; category: string }[];
    }>(`companies/${companyId}/capabilities`, {
      method: "PUT",
      body: { capabilityIds },
    }),

  // Directory
  getDirectory: (params: {
    search?: string;
    location?: string;
    capability?: string;
    taxonomyIds?: string[];
    page?: number;
    limit?: number;
  }) =>
    apiCall<{
      companies: Record<string, unknown>[];
      taxonomiesByCompany: Record<string, { id: string; name: string }[]>;
      totalCount: number;
      page: number;
      totalPages: number;
      uniqueLocations: string[];
      uniqueCapabilities: string[];
    }>("directory", {
      method: "GET",
      params: {
        ...(params.search && { search: params.search }),
        ...(params.location && { location: params.location }),
        ...(params.capability && { capability: params.capability }),
        ...(params.taxonomyIds?.length && {
          taxonomyIds: params.taxonomyIds.join(","),
        }),
        ...(params.page && { page: params.page }),
        ...(params.limit && { limit: params.limit }),
      },
    }),

  // Tenders
  getTender: (tenderId: string) =>
    apiCall<{
      tender: Record<string, unknown>;
      taxonomies: { id: string; name: string }[];
    }>(`tenders/${tenderId}`, { method: "GET" }),

  getTenderMatch: (tenderId: string, companyId: string) =>
    apiCall<{ match: Record<string, unknown> | null }>(
      `tenders/${tenderId}/match`,
      { method: "GET", params: { companyId } },
    ),

  // Matching results
  getMatchingResults: (params?: {
    companyId?: string;
    bookmarked?: boolean;
  }) =>
    apiCall<{ results: Record<string, unknown>[] }>("matching-results", {
      method: "GET",
      params: {
        ...(params?.companyId && { companyId: params.companyId }),
        ...(params?.bookmarked && { bookmarked: true }),
      },
    }),

  deleteMatchingResult: (resultId: string) =>
    apiCall<{ success: boolean }>(`matching-results/${resultId}`, {
      method: "DELETE",
    }),

  toggleBookmark: (resultId: string, isBookmarked: boolean) =>
    apiCall<{ result: Record<string, unknown> }>(
      `matching-results/${resultId}/bookmark`,
      { method: "PUT", body: { is_bookmarked: isBookmarked } },
    ),

  // Projects
  getProjects: (params: { companyId: string; status?: string }) =>
    apiCall<{ projects: Record<string, unknown>[] }>("projects", {
      method: "GET",
      params: {
        companyId: params.companyId,
        ...(params.status && { status: params.status }),
      },
    }),

  getProjectDetails: (projectId: string) =>
    apiCall<{
      project: Record<string, unknown>;
      teamMembers: Record<string, unknown>[];
      tenderMatchResult: Record<string, unknown> | null;
    }>(`projects/${projectId}`, { method: "GET" }),

  updateProject: (projectId: string, updates: Record<string, unknown>) =>
    apiCall<{ project: Record<string, unknown> }>(`projects/${projectId}`, {
      method: "PUT",
      body: updates,
    }),

  deleteProject: (projectId: string) =>
    apiCall<{ success: boolean }>(`projects/${projectId}`, {
      method: "DELETE",
    }),

  addProjectMember: (projectId: string, companyId: string) =>
    apiCall<{ member: Record<string, unknown> }>(
      `projects/${projectId}/members`,
      { body: { companyId } },
    ),

  removeProjectMember: (projectId: string, memberId: string) =>
    apiCall<{ success: boolean }>(
      `projects/${projectId}/members/${memberId}`,
      { method: "DELETE" },
    ),

  getAvailableTenders: () =>
    apiCall<{
      tenders: {
        id: string;
        title: string;
        buyer: string;
        deadline: string | null;
      }[];
    }>("projects/available-tenders", { method: "GET" }),

  // Dashboard
  getDashboard: () =>
    apiCall<{
      companies: Record<string, unknown>[];
      stats: {
        totalTenders: number;
        matchingResults: number;
        companies: number;
        projects: number;
      };
      recentMatches: Record<string, unknown>[];
    }>("dashboard", { method: "GET" }),

  // Admin - Companies
  adminListCompanies: () =>
    apiCall<{ companies: Record<string, unknown>[] }>("admin/companies", {
      method: "GET",
    }),

  adminDeleteCompany: (companyId: string) =>
    apiCall<{ success: boolean }>(`admin/companies/${companyId}`, {
      method: "DELETE",
    }),

  adminUpdateCompany: (
    companyId: string,
    updates: Record<string, unknown>,
  ) =>
    apiCall<{ company: Record<string, unknown> }>(
      `admin/companies/${companyId}`,
      { method: "PUT", body: updates },
    ),

  adminImportCompany: (companyData: Record<string, unknown>) =>
    apiCall<{
      company: Record<string, unknown>;
      alreadyExists?: boolean;
    }>("admin/companies", { body: companyData }),

  // Admin - Users
  adminListUsers: () =>
    apiCall<{
      profiles: Record<string, unknown>[];
      roles: Record<string, unknown>[];
    }>("admin/users", { method: "GET" }),

  adminDeleteUser: (userId: string) =>
    apiCall<{ success: boolean }>(`admin/users/${userId}`, {
      method: "DELETE",
    }),

  adminAddUserRole: (userId: string, role: string) =>
    apiCall<{ role: Record<string, unknown> }>(`admin/users/${userId}/role`, {
      body: { role },
    }),

  adminRemoveUserRole: (userId: string, role: string) =>
    apiCall<{ success: boolean }>(`admin/users/${userId}/role`, {
      method: "DELETE",
      params: { role },
    }),

  adminGetUserEvents: (userId: string) =>
    apiCall<{ events: Record<string, unknown>[] }>(
      `admin/users/${userId}/events`,
      { method: "GET" },
    ),

  // Admin - Capabilities
  adminListCapabilities: () =>
    apiCall<{ capabilities: Record<string, unknown>[] }>(
      "admin/capabilities",
      { method: "GET" },
    ),

  adminCreateCapability: (data: Record<string, unknown>) =>
    apiCall<{ capability: Record<string, unknown> }>("admin/capabilities", {
      body: data,
    }),

  adminUpdateCapability: (
    capabilityId: string,
    updates: Record<string, unknown>,
  ) =>
    apiCall<{ capability: Record<string, unknown> }>(
      `admin/capabilities/${capabilityId}`,
      { method: "PUT", body: updates },
    ),

  adminDeleteCapability: (capabilityId: string) =>
    apiCall<{ success: boolean }>(`admin/capabilities/${capabilityId}`, {
      method: "DELETE",
    }),

  // Capabilities (public, active only)
  getCapabilities: () =>
    apiCall<{
      capabilities: { id: string; name: string; category: string | null }[];
    }>("capabilities", { method: "GET" }),

  // Available tenders (open/closing_soon)
  getAvailableTendersSearch: (params?: { search?: string }) =>
    apiCall<{
      tenders: Record<string, unknown>[];
    }>("tenders/available", {
      method: "GET",
      params: {
        ...(params?.search && { search: params.search }),
      },
    }),

  // Companies by capabilities
  getCompaniesByCapabilities: (data: {
    capabilityIds: string[];
    excludeCompanyIds?: string[];
  }) =>
    apiCall<{ companies: Record<string, unknown>[] }>(
      "companies/by-capabilities",
      { body: data },
    ),

  // Company taxonomies
  getCompanyTaxonomies: (companyId: string) =>
    apiCall<{ taxonomies: { id: string; name: string }[] }>(
      `companies/${companyId}/taxonomies`,
      { method: "GET" },
    ),

  syncCompanyTaxonomies: (companyId: string, taxonomyIds: string[]) =>
    apiCall<{ success: boolean; taxonomyIds: string[] }>(
      `companies/${companyId}/taxonomies`,
      { method: "PUT", body: { taxonomyIds } },
    ),

  // User approval status
  getApprovalStatus: () =>
    apiCall<{
      approvalStatus: string;
      signupType: string | null;
      companyName: string | null;
      joinRequestStatus: string | null;
    }>("user/approval-status", { method: "GET" }),
};
