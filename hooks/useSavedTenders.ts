"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

export function useSavedTenders(companyId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.savedTenders(companyId!),
    // Non-null assertion is safe: `enabled` keeps the query off until it's set.
    queryFn: () =>
      api.getMatchingResults({ companyId: companyId!, bookmarked: true, tenderStatus: "all" }),
    enabled: !!companyId,
    staleTime: 30 * 1000, // 30s
    gcTime: 5 * 60 * 1000, // 5 min
  });
}
