"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

export function useAdminStats(enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.adminStats(),
    queryFn: () => api.adminGetStats(),
    enabled,
    staleTime: 30_000,
  });
}
