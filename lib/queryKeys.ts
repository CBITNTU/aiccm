export const queryKeys = {
  myCompanies: (userId: string) => ["myCompanies", userId] as const,
  company: (id: string) => ["company", id] as const,
  dashboard: (userId: string) => ["dashboard", userId] as const,
  directory: (filters: Record<string, unknown>) =>
    ["directory", filters] as const,
  tenders: (filters: Record<string, unknown>) =>
    ["tenders", filters] as const,
  matchingResults: (companyId: string, filters?: Record<string, unknown>) =>
    ["matchingResults", companyId, filters] as const,
  savedTenders: (companyId: string) => ["savedTenders", companyId] as const,
  matchingProgress: (companyId: string) =>
    ["matchingProgress", companyId] as const,
  batchProgress: (batchId: string) => ["batchProgress", batchId] as const,
  taxonomies: () => ["taxonomies"] as const,
  referenceCapabilities: () => ["referenceData", "capabilities"] as const,
  referenceMarkets: () => ["referenceData", "markets"] as const,
  referenceStandards: () => ["referenceData", "standards", "all"] as const,
  projects: (companyId: string, filter: string) =>
    ["projects", companyId, filter] as const,
  projectDetails: (id: string) => ["projectDetails", id] as const,
  userCompanies: (userId: string) => ["userCompanies", userId] as const,
  profile: (userId: string) => ["profile", userId] as const,
  tenderSyncStatus: () => ["tenderSyncStatus"] as const,
  projectInvitations: (userId: string) =>
    ["projectInvitations", userId] as const,
  directoryCompany: (id: string) => ["directoryCompany", id] as const,
  publicCompany: (id: string) => ["publicCompany", id] as const,
  verificationStatus: (companyId: string) => ["verificationStatus", companyId] as const,
  adminVerificationRequests: () => ["adminVerificationRequests"] as const,
  adminCompetencyRequests: () => ["adminCompetencyRequests"] as const,
  adminVerificationSettings: () => ["adminVerificationSettings"] as const,
  adminVerificationReview: (requestId: string) => ["adminVerificationReview", requestId] as const,
  adminStats: () => ["adminStats"] as const,
};
