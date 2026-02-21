"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

interface TenderSearchParams {
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
}

export function useTenders(params: TenderSearchParams) {
  const filterKey = { ...params };

  return useQuery({
    queryKey: queryKeys.tenders(filterKey),
    queryFn: () => api.searchTenders(params),
    staleTime: 2 * 60 * 1000, // 2 min
    gcTime: 5 * 60 * 1000, // 5 min
    placeholderData: keepPreviousData,
  });
}
