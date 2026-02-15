export const queryKeys = {
  myCompanies: (userId: string) => ["myCompanies", userId] as const,
  company: (id: string) => ["company", id] as const,
  dashboard: (userId: string) => ["dashboard", userId] as const,
  directory: (filters: Record<string, unknown>) =>
    ["directory", filters] as const,
  tenders: (filters: Record<string, unknown>) =>
    ["tenders", filters] as const,
  matchingResults: (companyId: string) =>
    ["matchingResults", companyId] as const,
  savedTenders: (companyId: string) => ["savedTenders", companyId] as const,
  matchingProgress: (companyId: string) =>
    ["matchingProgress", companyId] as const,
  batchProgress: (batchId: string) => ["batchProgress", batchId] as const,
  taxonomies: () => ["taxonomies"] as const,
  projects: (companyId: string, filter: string) =>
    ["projects", companyId, filter] as const,
  projectDetails: (id: string) => ["projectDetails", id] as const,
  userCompanies: (userId: string) => ["userCompanies", userId] as const,
  profile: (userId: string) => ["profile", userId] as const,
};
