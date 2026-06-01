// Frontend API client for calling Next.js API routes
// This will be used in Phase 2 (frontend migration) to replace supabase.functions.invoke()
import type {
  AdminCompanyListParams,
  AdminCompanyListResponse,
  CompanyRecord,
  MatchingResultRecord,
} from "@/lib/api/types";
import type { FetchUKTendersResponse, TenderFeedRecord } from "@/lib/api/types";
import {
  normalizeCompanyRecord,
  normalizeMatchingResultRecord,
  normalizeTenderMatchRecord,
  normalizeTenderRecord,
} from "@/lib/api/types";

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
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
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
      cpvCodes?: string[];
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
      analyzedCount: number;
      results: {
        tenderId: string;
        tenderTitle: string;
        overallScore: number;
      }[];
      upToDate?: boolean;
      batchId?: string;
      totalTenders?: number;
    }>("match-tenders", {
      body: companyId ? { companyId } : {},
    }),

  // Create project
  createProject: (data: {
    name: string;
    description?: string;
    targetTenderId?: string | null;
    companyId: string;
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
      companyName: string;
      keyCapabilities?: string | null;
      certifications?: string | null;
      pastProjects?: string | null;
      description?: string | null;
    };
    tender: {
      title: string;
      description?: string;
      buyerName?: string;
      value?: number;
      region?: string;
    };
    teamMembers: {
      companies?: {
        companyName: string;
        keyCapabilities?: string | null;
        certifications?: string | null;
        pastProjects?: string | null;
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
        parentId: string | null;
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
      markets: { id: string; name: string; parentId: string | null; sortOrder: number | null }[];
      standards: { id: string; name: string; parentId: string | null; sortOrder: number | null }[];
      hasPendingChanges?: boolean;
      pendingChanges?: Record<string, unknown> | null;
      pendingReviewRequest?: {
        id: string;
        status: string;
        requestType: string;
        reviewFeedback: Record<string, unknown> | null;
        reviewNotes: string | null;
        createdAt: string;
      } | null;
      latestResolvedRequest?: {
        id: string;
        status: string;
        requestType: string;
        reviewFeedback: Record<string, unknown> | null;
        reviewNotes: string | null;
        reviewedAt: string | null;
        createdAt: string;
      } | null;
    }>(`companies/${companyId}`, { method: "GET" }).then((data) => ({
      ...data,
      company: normalizeCompanyRecord(data.company),
    })),

  updateCompany: (companyId: string, updates: Record<string, unknown>) =>
    apiCall<{
      company: Record<string, unknown>;
      hasPendingChanges?: boolean;
      pendingChanges?: Record<string, unknown> | null;
    }>(`companies/${companyId}`, {
      method: "PUT",
      body: updates,
    }).then((data) => ({
      ...data,
      company: normalizeCompanyRecord(data.company),
    })),

  getCompanyProjects: (companyId: string) =>
    apiCall<{
      voProjects: {
        id: string;
        name: string;
        description: string | null;
        status: string;
        tenderTitle: string | null;
        tenderBuyer: string | null;
        tenderLocation: string | null;
        createdAt: string;
      }[];
      pastProjects: {
        name: string;
        description?: string;
        client?: string;
        value?: string;
        year?: string;
        sector?: string;
        isLegacy?: boolean;
      }[];
    }>(`companies/${companyId}/projects`, { method: "GET" }),

  getCompanyCapabilities: (companyId: string) =>
    apiCall<{
      capabilities: { id: string; name: string; category: string }[];
      allCapabilities: { id: string; name: string; category: string }[];
      verificationStatus: string;
      competencyLimit: number | null;
      pendingCompetencyRequest: {
        id: string;
        proposedAdditions: string[];
        proposedRemovals: string[];
        createdAt: string;
      } | null;
    }>(`companies/${companyId}/capabilities`, { method: "GET" }),

  syncCapabilities: (companyId: string, capabilityIds: string[]) =>
    apiCall<{
      capabilities?: { id: string; name: string; category: string }[];
      pendingReview?: boolean;
      changeRequestId?: string;
      message?: string;
      error?: string;
    }>(`companies/${companyId}/capabilities`, {
      method: "PUT",
      body: { capabilityIds },
    }),

  getMarkets: () =>
    apiCall<{
      markets: { id: string; name: string; parentId: string | null; sortOrder: number }[];
    }>("markets", { method: "GET" }),

  getStandards: (companyId?: string) =>
    apiCall<{
      standards: { id: string; name: string; parentId: string | null; sortOrder: number; relevant?: boolean }[];
    }>(
      companyId ? `standards?companyId=${encodeURIComponent(companyId)}` : "standards",
      { method: "GET" },
    ),

  getCompanyMarkets: (companyId: string) =>
    apiCall<{
      markets: { id: string; name: string; parentId: string | null; sortOrder: number }[];
    }>(`companies/${companyId}/markets`, { method: "GET" }),

  syncMarkets: (companyId: string, marketIds: string[]) =>
    apiCall<{
      markets?: { id: string; name: string; parentId: string | null; sortOrder: number }[];
      pendingReview?: boolean;
      draftSaved?: boolean;
      message?: string;
    }>(`companies/${companyId}/markets`, {
      method: "PUT",
      body: { marketIds },
    }),

  getCompanyStandards: (companyId: string) =>
    apiCall<{
      standards: { id: string; name: string; parentId: string | null; sortOrder: number }[];
    }>(`companies/${companyId}/standards`, { method: "GET" }),

  syncStandards: (companyId: string, standardIds: string[]) =>
    apiCall<{
      standards?: { id: string; name: string; parentId: string | null; sortOrder: number }[];
      pendingReview?: boolean;
      draftSaved?: boolean;
      message?: string;
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
      capabilities: { id: string; name: string; category: string | null }[];
      markets: { id: string; name: string; parentId: string | null }[];
      standards: { id: string; name: string; parentId: string | null }[];
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
    }).then((data) => ({
      ...data,
      tenders: data.tenders.map((tender) => normalizeTenderRecord(tender)),
    })),

  getTender: (tenderId: string) =>
    apiCall<{
      tender: Record<string, unknown>;
      taxonomies: { id: string; name: string }[];
    }>(`tenders/${tenderId}`, { method: "GET" }).then((data) => ({
      ...data,
      tender: normalizeTenderRecord(data.tender),
    })),

  getTenderMatch: (tenderId: string, companyId: string) =>
    apiCall<{ match: Record<string, unknown> | null }>(
      `tenders/${tenderId}/match`,
      { method: "GET", params: { companyId } },
    ).then((data) => ({
      ...data,
      match: data.match ? normalizeTenderMatchRecord(data.match) : null,
    })),

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
    ).then((data) => ({
      ...data,
      results: data.results.map((result) => normalizeMatchingResultRecord(result)),
    })),

  deleteMatchingResult: (resultId: string) =>
    apiCall<{ success: boolean }>(`matching-results/${resultId}`, {
      method: "DELETE",
    }),

  toggleBookmark: (resultId: string, isBookmarked: boolean) =>
    apiCall<{ result: Record<string, unknown> }>(
      `matching-results/${resultId}/bookmark`,
      { method: "PUT", body: { isBookmarked } },
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
        voId: string;
        companyId: string;
        invitationStatus: string;
        invitationSentAt: string | null;
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
          budgetMax: number | null;
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
        voId: string;
        companyId: string;
        invitationStatus: string;
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
    }>("dashboard", { method: "GET" }).then((data) => ({
      ...data,
      recentMatches: data.recentMatches.map((result) => {
        const normalizedResult = normalizeMatchingResultRecord(result);
        const companies = result.companies as Record<string, unknown> | null | undefined;
        const companyName =
          typeof companies?.companyName === "string"
            ? companies.companyName
            : undefined;

        return {
          ...normalizedResult,
          companies: companyName ? { companyName } : undefined,
        } satisfies MatchingResultRecord & {
          companies?: { companyName?: string };
        };
      }),
    })),

  // Admin - Stats
  adminGetStats: () =>
    apiCall<{
      totalCompanies: number;
      totalUsers: number;
      activeTenders: number;
      pendingUserApprovals: number;
      pendingJoinRequests: number;
      pendingVerifications: number;
      pendingCompetencyRequests: number;
      pendingApprovalsTotal: number;
      pendingVerificationTotal: number;
    }>("admin/stats", { method: "GET" }),

  // Admin - Companies
  adminListCompanies: (params?: AdminCompanyListParams) =>
    apiCall<
      Omit<AdminCompanyListResponse, "companies"> & {
        companies: Record<string, unknown>[];
      }
    >("admin/companies", {
      method: "GET",
      params: params
        ? {
            type: params.type,
            page: params.page,
            pageSize: params.pageSize,
            search: params.search,
            verificationStatus: params.verificationStatus,
          }
        : undefined,
    }).then((data) => ({
      ...data,
      companies: data.companies.map((company) => normalizeCompanyRecord(company)),
    })),

  adminDeleteCompany: (companyId: string) =>
    apiCall<{ success: boolean }>(`admin/companies/${companyId}`, {
      method: "DELETE",
    }),

  adminGetCompany: (companyId: string) =>
    apiCall<{ company: Record<string, unknown> }>(
      `admin/companies/${companyId}`,
      { method: "GET" },
    ).then((data) => ({
      ...data,
      company: normalizeCompanyRecord(data.company),
    })),

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

  adminBulkImportCompanies: (payload: {
    rows: Array<{
      companyName: string;
      companiesHouseNumber?: string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
      postcode?: string | null;
      fullAddress?: string | null;
      description?: string | null;
      websiteUrl?: string | null;
      keyCapabilities?: string | null;
      certifications?: string | null;
      sicCodes?: string | null;
    }>;
    options?: {
      duplicateMode?: "skip" | "update";
      enqueueJobs?: boolean;
      fullRegeneration?: boolean;
      chunkSize?: number;
    };
  }) =>
    apiCall<{
      totalRows: number;
      imported: number;
      updated: number;
      skipped: number;
      failed: number;
      queuedJobs: number;
      batchId: string | null;
      results: Array<{
        rowIndex: number;
        companyName: string;
        companyId?: string;
        status: "imported" | "updated" | "skipped" | "error";
        message?: string;
      }>;
    }>("admin/companies/import", {
      method: "POST",
      body: payload as unknown as Record<string, unknown>,
    }),

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
    }).then((data) => ({
      ...data,
      tenders: data.tenders.map((tender) => normalizeTenderRecord(tender)),
    })),

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

  // Company Verification
  getVerificationStatus: (companyId: string) =>
    apiCall<{
      verificationStatus: string;
      verifiedAt: string | null;
      hasPendingChanges: boolean;
      latestRequest: {
        id: string;
        status: string;
        submissionNotes: string | null;
        reviewNotes: string | null;
        reviewFeedback: import("@/lib/api/types").ReviewFeedback | null;
        createdAt: string;
        reviewedAt: string | null;
      } | null;
    }>(`companies/${companyId}/verification`, { method: "GET" }),

  submitVerification: (companyId: string, notes?: string) =>
    apiCall<{ verificationRequest: Record<string, unknown> }>(
      `companies/${companyId}/verification`,
      { body: { notes } },
    ),

  submitChangesForReview: (companyId: string, notes?: string) =>
    apiCall<{ verificationRequest: Record<string, unknown> }>(
      `companies/${companyId}/submit-changes`,
      { body: { notes } },
    ),

  discardPendingChanges: (companyId: string) =>
    apiCall<{ success: boolean }>(
      `companies/${companyId}/pending-changes`,
      { method: "DELETE" },
    ),

  // Admin - Verification Requests
  adminGetVerificationRequests: () =>
    apiCall<{
      requests: {
        id: string;
        companyId: string;
        companyName: string;
        status: string;
        submissionNotes: string | null;
        reviewNotes: string | null;
        companySnapshot: Record<string, unknown>;
        requestType: string;
        pendingChangesSnapshot: Record<string, unknown> | null;
        createdAt: string;
        reviewedAt: string | null;
        verificationStatus: string;
      }[];
    }>("admin/verification-requests", { method: "GET" }),

  adminGetVerificationReviewData: (requestId: string) =>
    apiCall<import("@/lib/api/types").VerificationReviewData>(
      `admin/verification-requests/${requestId}/review`,
      { method: "GET" },
    ),

  adminReviewVerification: (
    requestId: string,
    action: "approve" | "reject" | "request_changes",
    reviewNotes?: string,
    reviewFeedback?: import("@/lib/api/types").ReviewFeedback,
  ) =>
    apiCall<{ success: boolean; action: string }>(
      `admin/verification-requests/${requestId}`,
      { method: "PUT", body: { action, reviewNotes, reviewFeedback } },
    ),

  // Admin - Competency Change Requests
  adminGetCompetencyRequests: () =>
    apiCall<{
      requests: {
        id: string;
        companyId: string;
        companyName: string;
        status: string;
        proposedAdditions: string[];
        proposedRemovals: string[];
        reviewNotes: string | null;
        createdAt: string;
        reviewedAt: string | null;
      }[];
      capabilityMap: Record<string, string>;
    }>("admin/competency-requests", { method: "GET" }),

  adminReviewCompetencyRequest: (
    requestId: string,
    action: "approve" | "reject",
    reviewNotes?: string,
  ) =>
    apiCall<{ success: boolean; action: string }>(
      `admin/competency-requests/${requestId}`,
      { method: "PUT", body: { action, reviewNotes } },
    ),

  // Admin - Verification Settings (includes matching and analysis run limits)
  adminGetVerificationSettings: () =>
    apiCall<{
      verifiedProjectLimit: number;
      unverifiedProjectLimit: number;
      unverifiedCompetencyLimit: number;
      verifiedMatchingRunsPerMonth: number;
      unverifiedMatchingRunsPerMonth: number;
      verifiedAnalysisRunsPerMonth: number;
      unverifiedAnalysisRunsPerMonth: number;
    }>("admin/settings/verification", { method: "GET" }),

  adminUpdateVerificationSettings: (updates: {
    verifiedProjectLimit?: number;
    unverifiedProjectLimit?: number;
    unverifiedCompetencyLimit?: number;
    verifiedMatchingRunsPerMonth?: number;
    unverifiedMatchingRunsPerMonth?: number;
    verifiedAnalysisRunsPerMonth?: number;
    unverifiedAnalysisRunsPerMonth?: number;
  }) =>
    apiCall<{
      verifiedProjectLimit: number;
      unverifiedProjectLimit: number;
      unverifiedCompetencyLimit: number;
      verifiedMatchingRunsPerMonth: number;
      unverifiedMatchingRunsPerMonth: number;
      verifiedAnalysisRunsPerMonth: number;
      unverifiedAnalysisRunsPerMonth: number;
    }>("admin/settings/verification", { method: "PATCH", body: updates }),

  // Company usage stats
  getCompanyMatchingUsage: (companyId: string) =>
    apiCall<{
      used: number;
      limit: number;
      remaining: number;
      resetsAt: string;
    }>(`companies/${companyId}/matching-usage`, { method: "GET" }),

  getCompanyAnalysisUsage: (companyId: string) =>
    apiCall<{
      used: number;
      limit: number;
      remaining: number;
      resetsAt: string;
    }>(`companies/${companyId}/analysis-usage`, { method: "GET" }),
};
