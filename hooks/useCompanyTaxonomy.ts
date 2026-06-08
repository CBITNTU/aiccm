"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

// Company-specific taxonomy selections (small payloads). Backed by React Query
// so they dedupe across components and refresh via cache invalidation after edits
// instead of imperative refetches.
const COMPANY_QUERY_OPTIONS = {
  staleTime: 5 * 60 * 1000, // 5 minutes
} as const;

export function useCompanyCapabilities(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.companyCapabilities(companyId!),
    queryFn: () => api.getCompanyCapabilities(companyId!),
    enabled: !!companyId,
    ...COMPANY_QUERY_OPTIONS,
  });
}

export function useCompanyMarkets(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.companyMarkets(companyId!),
    queryFn: () => api.getCompanyMarkets(companyId!),
    enabled: !!companyId,
    ...COMPANY_QUERY_OPTIONS,
  });
}

export function useCompanyStandards(companyId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.companyStandards(companyId!),
    queryFn: () => api.getCompanyStandards(companyId!),
    enabled: !!companyId,
    ...COMPANY_QUERY_OPTIONS,
  });
}
