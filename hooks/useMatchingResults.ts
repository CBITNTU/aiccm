"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

export function useMatchingResults(companyId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.matchingResults(companyId!),
    queryFn: () => api.getMatchingResults({ companyId }),
    enabled: !!companyId,
    staleTime: 30 * 1000, // 30s
    gcTime: 5 * 60 * 1000, // 5 min
  });
}
