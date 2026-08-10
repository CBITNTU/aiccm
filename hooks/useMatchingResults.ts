"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

interface MatchingResultsParams {
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
}

export function useMatchingResults(params: MatchingResultsParams) {
  const filterKey = { ...params };

  return useQuery({
    queryKey: queryKeys.matchingResults(params.companyId!, filterKey),
    // Non-null assertion is safe: `enabled` keeps the query off until it's set.
    queryFn: () => api.getMatchingResults({ ...params, companyId: params.companyId! }),
    enabled: !!params.companyId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
