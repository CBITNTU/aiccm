"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

interface TenderMatchesParams {
  companyId?: string;
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
}

export function useTenderMatches(params: TenderMatchesParams) {
  const filterKey = { ...params };

  return useQuery({
    queryKey: queryKeys.tenderMatches(params.companyId ?? "", filterKey),
    queryFn: () => api.getTenderMatches({ ...params, companyId: params.companyId! }),
    enabled: !!params.companyId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
