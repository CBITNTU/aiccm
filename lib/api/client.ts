// Frontend API client for calling Next.js API routes
// This will be used in Phase 2 (frontend migration) to replace supabase.functions.invoke()
import type { CompanyRecord } from "@/lib/api/types";
import type { FetchUKTendersResponse, TenderFeedRecord } from "@/lib/api/types";
import { normalizeCompanyRecord } from "@/lib/api/types";

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
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const { method = "POST", body, params, signal } = options;

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

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      ...(body && { body: JSON.stringify(body) }),
      ...(signal && { signal }),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(
      err instanceof Error ? err.message : "Network error",
      0,
    );
  }

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
    apiCall<{
      success: boolean;
      invitationsSent: number;
      unregisteredCompanies: string[];
    }>("send-project-invitations", {
      body: { projectId, tenderTitle, partnerIds },
    }),

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
    apiCall<
      FetchUKTendersResponse & {
        actuallyImported?: number;
      }
    >("fetch-uk-tenders", {
      body: options || {},
    }),

  // Tender sync schedule (admin)
  getTenderSyncStatus: () =>
    apiCall<{
      lastSyncFinishedAt: string | null;
      nextSyncScheduledAt: string | null;
    }>("admin/tender-sync-status", { method: "GET" }),

  triggerTenderSync: (options?: { signal?: AbortSignal }) =>
    apiCall<{
      ran: boolean;
      syncSucceeded?: boolean;
      lastSyncFinishedAt?: string | null;
      nextSyncScheduledAt?: string | null;
      message?: string;
    }>("admin/tender-sync", {
      method: "POST",
      body: { triggerNow: true },
      ...(options?.signal && { signal: options.signal }),
    }),

  // Fetch TED tenders
  fetchTEDTenders: (options?: {
    page?: number;
    limit?: number;
    iterationNextToken?: string;
    adminImport?: boolean;
    dateFrom?: string;
    dateTo?: string;
    languages?: string[];
  }) =>
    apiCall<{
      tenders: TenderFeedRecord[];
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
    }).then((data) => ({
      ...data,
      companies: data.companies.map((company) => normalizeCompanyRecord(company)),
    })),

  getCompany: (companyId: string) =>
    apiCall<{
      company: Record<string, unknown>;
      isOwner: boolean;
      capabilities: { id: string; name: string; category: string }[];
    }>(`companies/${companyId}`, { method: "GET" }).then((data) => ({
      ...data,
      company: normalizeCompanyRecord(data.company),
    })),

  updateCompany: (companyId: string, updates: Record<string, unknown>) =>
    apiCall<{ company: Record<string, unknown> }>(`companies/${companyId}`, {
      method: "PUT",
      body: updates,
    }).then((data) => ({
      ...data,
      company: normalizeCompanyRecord(data.company),
    })),

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

  getMarkets: () =>
    apiCall<{
      markets: { id: string; name: string; parent_id: string | null; sort_order: number }[];
    }>("markets", { method: "GET" }),

  getStandards: (companyId?: string) =>
    apiCall<{
      standards: { id: string; name: string; parent_id: string | null; sort_order: number }[];
    }>(
      companyId ? `standards?companyId=${encodeURIComponent(companyId)}` : "standards",
      { method: "GET" },
    ),

  getCompanyMarkets: (companyId: string) =>
    apiCall<{
      markets: { id: string; name: string; parent_id: string | null; sort_order: number }[];
    }>(`companies/${companyId}/markets`, { method: "GET" }),

  syncMarkets: (companyId: string, marketIds: string[]) =>
    apiCall<{
      markets: { id: string; name: string; parent_id: string | null; sort_order: number }[];
    }>(`companies/${companyId}/markets`, {
      method: "PUT",
      body: { marketIds },
    }),

  getCompanyStandards: (companyId: string) =>
    apiCall<{
      standards: { id: string; name: string; parent_id: string | null; sort_order: number }[];
    }>(`companies/${companyId}/standards`, { method: "GET" }),

  syncStandards: (companyId: string, standardIds: string[]) =>
    apiCall<{
      standards: { id: string; name: string; parent_id: string | null; sort_order: number }[];
    }>(`companies/${companyId}/standards`, {
      method: "PUT",
      body: { standardIds },
    }),

  // Directory - single company
  getDirectoryCompany: (companyId: string) =>
    apiCall<{
      company: Record<string, unknown>;
      isOwner: boolean;
      taxonomies: { id: string; name: string }[];
    // TODO [MERGE]: migrate to Drizzle — HEAD also returned:
    // capabilities: { id: string; name: string; category: string | null }[];
    // markets: { id: string; name: string; parent_id: string | null; parent_name: string | null }[];
    // standards: { id: string; name: string; parent_id: string | null; parent_name: string | null }[];
    }>(`directory/${companyId}`, { method: "GET" }).then((data) => ({
      ...data,
      company: normalizeCompanyRecord(data.company),
    })),

  // Directory
  getDirectory: (params: {
    search?: string;
    taxonomyIds?: string[];
    page?: number;
    limit?: number;
    lat?: number;
    lng?: number;
    radiusMiles?: number;
  }) =>
    apiCall<{
      companies: Record<string, unknown>[];
      taxonomiesByCompany: Record<string, { id: string; name: string }[]>;
      marketsByCompany: Record<string, { id: string; name: string }[]>;
      standardsByCompany: Record<string, { id: string; name: string }[]>;
      distanceByCompany?: Record<string, number>;
      totalCount: number;
      page: number;
      totalPages: number;
    }>("directory", {
      method: "GET",
      params: {
        ...(params.search && { search: params.search }),
        ...(params.taxonomyIds?.length && {
          taxonomyIds: params.taxonomyIds.join(","),
        }),
        ...(params.page && { page: params.page }),
        ...(params.limit && { limit: params.limit }),
        ...(params.lat != null && { lat: params.lat }),
        ...(params.lng != null && { lng: params.lng }),
        ...(params.radiusMiles != null && { radiusMiles: params.radiusMiles }),
      },
    }).then((data) => ({
      ...data,
      companies: data.companies.map((company) => normalizeCompanyRecord(company)),
    })),

  // Onboarding
  checkCompanyDuplicate: (params: {
    companyName: string;
    companiesHouseNumber?: string;
  }) =>
    apiCall<{ exists: boolean; company?: Pick<CompanyRecord, "id" | "companyName"> }>(
      "companies/check-duplicate",
      { method: "GET", params },
    ),

  createOnboardingCompanyProfile: (data: Record<string, unknown>) =>
    apiCall<{ success: boolean; company: CompanyRecord }>("onboarding/company-profile", {
      method: "POST",
      body: data,
    }).then((response) => ({
      ...response,
      company: normalizeCompanyRecord(response.company as unknown as Record<string, unknown>),
    })),

  // Tenders
  searchTenders: (params: {
    keyword?: string;
    location?: string;
    status?: string;
    source?: string;
    budgetMin?: number;
    budgetMax?: number;
    dateFrom?: string;
    dateTo?: string;
    taxonomyIds?: string[];
    sortBy?: string;
    sortDirection?: string;
    page?: number;
    pageSize?: number;
  }) =>
    apiCall<{
      tenders: Record<string, unknown>[];
      totalCount: number;
      taxonomies: Record<string, { id: string; name: string }[]>;
    }>("tenders/search", {
      method: "GET",
      params: {
        ...(params.keyword && { keyword: params.keyword }),
        ...(params.location && { location: params.location }),
        ...(params.status && { status: params.status }),
        ...(params.source && { source: params.source }),
        ...(params.budgetMin && { budgetMin: params.budgetMin }),
        ...(params.budgetMax && { budgetMax: params.budgetMax }),
        ...(params.dateFrom && { dateFrom: params.dateFrom }),
        ...(params.dateTo && { dateTo: params.dateTo }),
        ...(params.taxonomyIds?.length && {
          taxonomyIds: params.taxonomyIds.join(","),
        }),
        ...(params.sortBy && { sortBy: params.sortBy }),
        ...(params.sortDirection && { sortDirection: params.sortDirection }),
        ...(params.page && { page: params.page }),
        ...(params.pageSize && { pageSize: params.pageSize }),
      },
    }),

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
    tenderStatus?: string;
    keyword?: string;
    minScore?: number;
    maxScore?: number;
    showApplied?: string;
    quickFilter?: string | null;
    sortBy?: string;
    sortDirection?: string;
    page?: number;
    pageSize?: number;
  }) =>
    apiCall<{ results: Record<string, unknown>[]; totalCount: number }>(
      "matching-results",
      {
        method: "GET",
        params: {
          ...(params?.companyId && { companyId: params.companyId }),
          ...(params?.bookmarked && { bookmarked: true }),
          ...(params?.tenderStatus && { tenderStatus: params.tenderStatus }),
          ...(params?.keyword && { keyword: params.keyword }),
          ...(params?.minScore && { minScore: params.minScore }),
          ...(params?.maxScore !== undefined &&
            params.maxScore < 100 && { maxScore: params.maxScore }),
          ...(params?.showApplied &&
            params.showApplied !== "all" && {
              showApplied: params.showApplied,
            }),
          ...(params?.quickFilter && { quickFilter: params.quickFilter }),
          ...(params?.sortBy && { sortBy: params.sortBy }),
          ...(params?.sortDirection && { sortDirection: params.sortDirection }),
          ...(params?.page && { page: params.page }),
          ...(params?.pageSize && { pageSize: params.pageSize }),
        },
      },
    ),

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
      isOwner: boolean;
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

  // Project invitations
  getProjectInvitations: () =>
    apiCall<{
      invitations: {
        id: string;
        vo_id: string;
        company_id: string;
        invitation_status: string;
        invitation_sent_at: string | null;
        project: {
          id: string;
          name: string;
          description: string | null;
          status: string;
        };
        leadCompany: {
          id: string;
          name: string;
          contactEmail: string | null;
          contactPhone: string | null;
        } | null;
        tender: {
          id: string;
          title: string;
          buyer: string;
          deadline: string | null;
          budget_max: number | null;
        } | null;
      }[];
    }>("projects/invitations", { method: "GET" }),

  respondToProjectInvitation: (
    invitationId: string,
    action: "accept" | "reject",
    message?: string,
  ) =>
    apiCall<{ success: boolean; action: string; projectId: string }>(
      `projects/invitations/${invitationId}/respond`,
      { body: { action, message } },
    ),

  getInvitationByToken: (token: string) =>
    apiCall<{
      invitation: {
        id: string;
        vo_id: string;
        company_id: string;
        invitation_status: string;
        projectName: string;
        projectDescription: string | null;
        leadCompanyName: string;
        leadCompanyContact: string | null;
        tenderTitle: string | null;
      };
    }>("projects/invitations/by-token", {
      method: "GET",
      params: { token },
    }),

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
    }).then((data) => ({
      ...data,
      companies: data.companies.map((company) => normalizeCompanyRecord(company)),
    })),

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
    lat?: number;
    lng?: number;
    radiusMiles?: number;
  }) =>
    apiCall<{
      companies: Record<string, unknown>[];
      distanceByCompany?: Record<string, number>;
    }>("companies/by-capabilities", { body: data }),

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

  // Profile
  getProfile: () =>
    apiCall<{
      profile: {
        firstName: string;
        lastName: string;
        jobTitle: string;
        phone: string;
        email: string;
      };
    }>("profile/update", { method: "GET" }),

  updateProfile: (data: {
    firstName: string;
    lastName: string;
    jobTitle: string;
    phone: string;
  }) =>
    apiCall<{ success: boolean }>("profile/update", {
      body: data,
    }),

  // User approval status
  getApprovalStatus: () =>
    apiCall<{
      approvalStatus: string;
      signupType: string | null;
      companyName: string | null;
      joinRequestStatus: string | null;
    }>("user/approval-status", { method: "GET" }),

  // Geocoding
  geocode: (query: string) =>
    apiCall<{
      enabled: boolean;
      result: { lat: number; lng: number; displayName: string } | null;
    }>("geocode", { method: "GET", params: { q: query } }),
};
