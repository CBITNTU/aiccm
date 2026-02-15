"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

export function useDashboard(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.dashboard(userId!),
    queryFn: () => api.getDashboard(),
    enabled: !!userId,
    staleTime: 60 * 1000, // 60s
    gcTime: 5 * 60 * 1000, // 5 min
  });
}
